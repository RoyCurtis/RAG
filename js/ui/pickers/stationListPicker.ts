/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>
/// <reference path="stationPicker.ts"/>
/// <reference path="../../vendor/draggable.d.ts"/>

/** Controller for the station list picker dialog */
class StationListPicker extends StationPicker
{
    /** Reference to the close button for this picker */
    private readonly btnClose     : HTMLButtonElement;

    /** Reference to placeholder shown if the list is empty */
    private readonly domEmptyList : HTMLElement;

    /** Reference to this list's currently selected stations in the UI */
    private readonly inputList    : HTMLDListElement;

    constructor()
    {
        super("stationlist");

        this.btnClose     = DOM.require('#btnCloseStationListPicker', this.dom);
        this.inputList    = DOM.require('.stationList', this.dom);
        this.domEmptyList = DOM.require('dt', this.inputList);

        // TODO: Should all modal pickers have a close button?
        this.btnClose.onclick = () => RAG.views.editor.closeDialog();

        // TODO: Clean this up
        // TODO: Attach event handlers and mutate station list
        // TODO: Make a delete drop zone
        let sortable = new Draggable.Sortable(this.inputList, {
            draggable: 'dd'
        });

        let droppable = new Draggable.Droppable(this.dom, {
            draggable: 'dd',
            dropzone: '.chooser'
        });

        sortable.on('mirror:create', ev =>
        {
            // @ts-ignore
            ev.data.source.style.width = ev.data.originalSource.clientWidth + 'px';
        });

        droppable.on('droppable:dropped', ev => {
            console.log(ev);
        });

        this.onOpen = (target) =>
        {
            StationPicker.chooser.attach(this, this.onAddStation);
            StationPicker.chooser.selectOnClick = false;

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
        let newEntry = new StationListItem(this, code);

        this.inputList.appendChild(newEntry.dom);
        this.domEmptyList.classList.add('hidden');
    }

    public remove(entry: HTMLElement) : void
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

    private onDrop(ev: any) : void
    {
        console.log(ev);

        // this.remove(this.domDragFrom);
    }
}