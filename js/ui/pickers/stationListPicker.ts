/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>
/// <reference path="stationPicker.ts"/>

/** Controller for the station list picker dialog */
class StationListPicker extends StationPicker
{
    /** Reference to the close button for this picker */
    private readonly btnClose     : HTMLButtonElement;

    /** Reference to placeholder shown if the list is empty */
    private readonly domEmptyList : HTMLElement;

    /** Reference to this list's currently selected stations in the UI */
    private readonly inputList    : HTMLDListElement;

    private readonly listItemTemplate : HTMLElement;

    /** Reference to the list item currently being dragged */
    private domDragFrom? : HTMLElement;

    constructor()
    {
        super("stationlist");

        this.btnClose         = DOM.require('#btnCloseStationListPicker', this.dom);
        this.inputList        = DOM.require('.stations', this.dom);
        this.domEmptyList     = DOM.require('dt', this.inputList);
        this.listItemTemplate = DOM.require('#stationListItem');

        this.listItemTemplate.id = '';
        this.listItemTemplate.classList.remove('hidden');
        this.listItemTemplate.remove();

        // TODO: Should all modal pickers have a close button?
        this.btnClose.onclick = () => RAG.views.editor.closeDialog();

        this.onOpen = (target) =>
        {
            StationPicker.domList.attach(this, this.onAddStation);
            StationPicker.domList.registerDropHandler( this.onDrop.bind(this) );
            StationPicker.domList.selectOnClick = false;

            this.currentCtx = DOM.requireData(target, 'context');
            let entries     = RAG.state.getStationList(this.currentCtx).slice(0);

            this.btnClose.remove();
            this.domHeader.innerText =
                `Build a station list for the '${this.currentCtx}' context`;
            this.domHeader.appendChild(this.btnClose);

            // Remove all old elements except for the empty list text
            while (this.inputList.children[1])
                this.inputList.children[1].remove();

            entries.forEach( v => this.add(v) );
            this.inputList.focus();
        }
    }

    protected onInput(ev: KeyboardEvent) : void
    {
        super.onInput(ev);

        let key     = ev.key;
        let focused = document.activeElement as HTMLElement;

        // Only handle the station list builder control
        if ( !focused || !this.inputList.contains(focused) )
            return;

        // Handle keyboard navigation
        if (key === 'ArrowLeft' || key === 'ArrowRight')
        {
            let dir = (key === 'ArrowLeft') ? -1 : 1;
            let nav = null;

            // Navigate relative to focused element
            if (focused.parentElement === this.inputList)
                nav = DOM.getNextFocusableSibling(focused, dir);

            // Navigate relevant to beginning or end of container
            else if (dir === -1)
                nav = DOM.getNextFocusableSibling(
                    focused.firstElementChild! as HTMLElement, dir
                );
            else
                nav = DOM.getNextFocusableSibling(
                    focused.lastElementChild! as HTMLElement, dir
                );

            if (nav) nav.focus();
        }

        // Handle entry deletion
        if (key === 'Delete' || key === 'Backspace')
        if (focused.parentElement === this.inputList)
        {
            // Focus to next element or parent on delete
            let next = focused.previousElementSibling as HTMLElement;

            // Compensate for hidden "empty list" element
            if (next === this.domEmptyList)
                next = (focused.nextElementSibling || this.inputList) as HTMLElement;

            this.remove(focused);
            next.focus();
        }
    }

    private onAddStation(entry: HTMLElement) : void
    {
        this.add(entry.dataset['code']!);
        this.update();
    }

    private add(code: string) : void
    {
        let newEntry    = this.listItemTemplate.cloneNode(true) as HTMLElement;
        let span        = DOM.require('span',      newEntry);
        let btnMoveUp   = DOM.require('.moveUp',   newEntry);
        let btnMoveDown = DOM.require('.moveDown', newEntry);
        let btnDelete   = DOM.require('.delete',   newEntry);

        span.innerText           = RAG.database.getStation(code, false);
        newEntry.dataset['code'] = code;

        newEntry.ondblclick = _ => this.remove(newEntry);

        // TODO: Split these off into own functions?
        newEntry.ondragstart = ev =>
        {
            this.domDragFrom              = newEntry;
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.dropEffect    = "move";
            // Necessary for dragging to work on Firefox
            ev.dataTransfer.setData('text/plain', '');

            this.domDragFrom.classList.add('dragging');
        };

        newEntry.ondrop = ev =>
        {
            if (!ev.target || !this.domDragFrom)
                throw new Error("Drop event, but target and source are missing");

            // Ignore dragging into self
            if ( this.domDragFrom.contains(ev.target as Node) )
                return;

            let target = ev.target as HTMLElement;

            if (target.parentElement && target.parentElement.draggable)
                target = target.parentElement;

            DOM.swap(this.domDragFrom, target);
            target.classList.remove('dragover');
            this.update();
        };

        newEntry.ondragend = ev =>
        {
            if (!this.domDragFrom)
                throw new Error("Drag ended but there's no tracked drag element");

            if (this.domDragFrom !== ev.target)
                throw new Error("Drag ended, but tracked element doesn't match");

            this.domDragFrom.classList.remove('dragging');

            // As per the standard, dragend must fire after drop. So it is safe to do
            // dereference cleanup here.
            this.domDragFrom = undefined;
        };

        newEntry.ondragenter = _ =>
        {
            if (this.domDragFrom === newEntry)
                return;

            newEntry.classList.add('dragover');
        };

        newEntry.ondragover  = DOM.preventDefault;

        newEntry.ondragleave = _  =>
        {
            // If dragging over the span or button elements, dragover isn't over yet
            if ( newEntry.contains(_.relatedTarget as Node) )
                return;

            newEntry.classList.remove('dragover');
        };

        // These buttons are necessary, as dragging and dropping do not work on iOS

        btnMoveUp.onclick = _ =>
        {
            let swap = newEntry.previousElementSibling!;

            if (swap === this.domEmptyList)
                swap = this.inputList.lastElementChild!;

            DOM.swap(newEntry, swap);
            newEntry.focus();
        };

        btnMoveDown.onclick = _ =>
        {
            let swap = newEntry.nextElementSibling
                || this.inputList.children[1]!;

            DOM.swap(newEntry, swap);
            newEntry.focus();
        };

        btnDelete.onclick = _ => this.remove(newEntry);

        this.inputList.appendChild(newEntry);
        this.domEmptyList.classList.add('hidden');
        newEntry.scrollIntoView();
    }

    private remove(entry: HTMLElement) : void
    {
        if (entry.parentElement !== this.inputList)
            throw new Error('Attempted to remove entry not on station list builder');

        entry.remove();
        this.update();

        if (this.inputList.children.length === 1)
            this.domEmptyList.classList.remove('hidden');
    }

    private update() : void
    {
        let children = this.inputList.children;

        // Don't update if list is empty
        if (children.length === 1)
            return;

        let list = [];

        for (let i = 1; i < children.length; i++)
        {
            let entry = children[i] as HTMLElement;

            list.push(entry.dataset['code']!);
        }

        let textList = Strings.fromStationList(list.slice(0), this.currentCtx);
        let query    = `[data-type=stationlist][data-context=${this.currentCtx}]`;

        RAG.state.setStationList(this.currentCtx, list);
        RAG.views.editor
            .getElementsByQuery(query)
            .forEach(element => element.textContent = textList);
    }

    private onDrop(ev: DragEvent) : void
    {
        if (!ev.target || !this.domDragFrom)
            throw new Error("Drop event, but target and source are missing");

        this.remove(this.domDragFrom);
    }
}