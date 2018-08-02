/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>
/// <reference path="stationPicker.ts"/>
/// <reference path="../../vendor/draggable.d.ts"/>

/** Controller for the station list picker dialog */
class StationListPicker extends StationPicker
{
    /** Reference to this picker's container for the list control */
    private readonly domList      : HTMLElement;
    /** Reference to the mobile-only add station button */
    private readonly btnAdd       : HTMLButtonElement;
    /** Reference to the mobile-only close picker button */
    private readonly btnClose     : HTMLButtonElement;
    /** Reference to the drop zone for deleting station elements */
    private readonly domDel       : HTMLElement;
    /** Reference to the actual sortable list of stations */
    private readonly inputList    : HTMLDListElement;
    /** Reference to placeholder shown if the list is empty */
    private readonly domEmptyList : HTMLElement;

    public constructor()
    {
        super("stationlist");

        this.domList      = DOM.require('.stationList', this.dom);
        this.btnAdd       = DOM.require('.addStation',  this.domList);
        this.btnClose     = DOM.require('.closePicker', this.domList);
        this.domDel       = DOM.require('.delStation',  this.domList);
        this.inputList    = DOM.require('dl',           this.domList);
        this.domEmptyList = DOM.require('p',            this.domList);
        this.onOpen       = this.onStationListPickerOpen.bind(this);

        new Draggable.Sortable([this.inputList, this.domDel], { draggable: 'dd' })
            // Have to use timeout, to let Draggable finish sorting the list
            .on( 'drag:stop', ev => setTimeout(() => this.onDragStop(ev), 1) )
            .on( 'mirror:create', this.onDragMirrorCreate.bind(this) );
    }

    /**
     * Populates the station list builder, with the selected list. Because this picker
     * extends from StationList, this handler overrides the 'onOpen' delegate property
     * of StationList.
     *
     * @param target Station list editor element to open for
     */
    protected onStationListPickerOpen(target: HTMLElement) : void
    {
        // Since we share the station picker with StationList, grab it
        StationPicker.chooser.attach(this, this.onAddStation);
        StationPicker.chooser.selectOnClick = false;

        this.currentCtx = DOM.requireData(target, 'context');
        let entries     = RAG.state.getStationList(this.currentCtx).slice(0);

        this.domHeader.innerText = L.HEADER_STATIONLIST(this.currentCtx);

        // Remove all old list elements
        this.inputList.innerHTML = '';

        // Finally, populate list from the clicked station list element
        entries.forEach( v => this.add(v) );
        this.inputList.focus();
    }

    // Forward these events to the chooser
    protected onSubmit(ev: Event) : void { super.onSubmit(ev); }

    /** Handles pickers' click events, for choosing items */
    protected onClick(ev: MouseEvent) : void
    {
        super.onClick(ev);

        if (ev.target === this.btnClose)
            RAG.views.editor.closeDialog();
        // For mobile users, switch to station chooser screen if "Add..." was clicked
        if (ev.target === this.btnAdd)
            this.dom.classList.add('addingStation');
    }

    /** Handles keyboard navigation for the station list builder */
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
            // Focus on next element or parent on delete
            let next = focused.previousElementSibling as HTMLElement
                    || focused.nextElementSibling     as HTMLElement
                    || this.inputList;

            this.remove(focused);
            next.focus();
        }
    }

    /** Handler for when a station is chosen */
    private onAddStation(entry: HTMLElement) : void
    {
        let newEntry = this.add(entry.dataset['code']!);

        // Switch back to builder screen, if on mobile
        this.dom.classList.remove('addingStation');
        this.update();

        // Focus only if on mobile, since the station list is on a dedicated screen
        if (DOM.isMobile)
            newEntry.dom.focus();
        else
            newEntry.dom.scrollIntoView();
    }

    /** Fixes mirrors not having correct width of the source element, on create */
    private onDragMirrorCreate(ev: Draggable.DragEvent) : void
    {
        if (!ev.data.source || !ev.data.originalSource)
            throw Error( L.P_SL_DRAG_MISSING() );

        ev.data.source.style.width = ev.data.originalSource.clientWidth + 'px';
    }

    /** Handles draggable station name being dropped */
    private onDragStop(ev: Draggable.DragEvent) : void
    {
        if (!ev.data.originalSource)
            return;

        if (ev.data.originalSource.parentElement === this.domDel)
            this.remove(ev.data.originalSource);
        else
            this.update();
    }

    /**
     * Creates and adds a new entry for the builder list.
     *
     * @param code Three-letter station code to create an item for
     */
    private add(code: string) : StationListItem
    {
        let newEntry = new StationListItem(code);

        // Add the new entry to the sortable list
        this.inputList.appendChild(newEntry.dom);
        this.domEmptyList.classList.add('hidden');

        // Disable the added station in the chooser
        StationPicker.chooser.disable(code);

        // Delete item on double click
        newEntry.dom.ondblclick = _ => this.remove(newEntry.dom);

        return newEntry;
    }

    /**
     * Removes the given station entry element from the builder.
     *
     * @param entry Element of the station entry to remove
     */
    private remove(entry: HTMLElement) : void
    {
        if ( !this.domList.contains(entry) )
            throw Error('Attempted to remove entry not on station list builder');

        // Enabled the removed station in the chooser
        StationPicker.chooser.enable(entry.dataset['code']!);

        entry.remove();
        this.update();

        if (this.inputList.children.length === 0)
            this.domEmptyList.classList.remove('hidden');
    }

    /** Updates the station list element and state currently being edited */
    private update() : void
    {
        let children = this.inputList.children;

        // Don't update if list is empty
        if (children.length === 0)
            return;

        let list = [];

        for (let i = 0; i < children.length; i++)
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
}