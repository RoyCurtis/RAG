/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the station list picker dialog */
class StationListPicker extends Picker
{
    /** Reference to placeholder shown if the list is empty */
    private readonly domEmptyList : HTMLElement;
    /** Reference to this list's currently selected stations in the UI */
    private readonly inputList    : HTMLDListElement;

    private currentId    : string = '';
    private domDragFrom? : HTMLElement;

    constructor()
    {
        super('stationlist', ['click', 'input']);

        this.inputList    = DOM.require('.stations', this.dom) as HTMLDListElement;
        this.domEmptyList = DOM.require('dt', this.inputList);
    }

    public open(target: HTMLElement)
    {
        super.open(target);

        RAG.views.stationList.attach(this);
        RAG.views.stationList.registerDropHandler( this.onDrop.bind(this) );

        this.currentId = DOM.requireData(target, 'id');
        let min        = parseInt( DOM.requireData(target, 'min') );
        let max        = parseInt( DOM.requireData(target, 'max') );
        let entries    = RAG.state.getStationList(this.currentId, min, max).slice(0);

        // Remove all old elements except for the empty list text
        while (this.inputList.children[1])
            this.inputList.children[1].remove();

        entries.forEach( this.addEntry.bind(this) );
    }

    protected onChange(ev: Event)
    {
        let self = this;

        RAG.views.stationList.onChange(ev, target =>
        {
            self.addEntry(target.innerText);
            self.update();
        });
    }

    private addEntry(value: string) : void
    {
        let entry = document.createElement('dd');

        entry.draggable = true;
        entry.innerText = value;
        entry.title     =
            "Drag to reorder; double-click or drag into station selector to remove";

        entry.ondblclick = _ =>
        {
            entry.remove();
            this.update();

            if (this.inputList.children.length === 1)
                this.domEmptyList.classList.remove('hidden');
        };

        entry.ondragstart = ev =>
        {
            this.domDragFrom              = entry;
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.dropEffect    = "move";

            this.domDragFrom.classList.add('dragging');
        };

        entry.ondrop = ev =>
        {
            if (!ev.target || !this.domDragFrom)
                throw new Error("Drop event, but target and source are missing");

            // Ignore dragging into self
            if (ev.target === this.domDragFrom)
                return;

            let target = ev.target as HTMLElement;

            DOM.swap(this.domDragFrom, target);
            target.classList.remove('dragover');
            this.update();
        };

        entry.ondragend = ev =>
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

        entry.ondragenter = _ =>
        {
            if (this.domDragFrom === entry)
                return;

            entry.classList.add('dragover');
        };

        entry.ondragover  = ev => ev.preventDefault();
        entry.ondragleave = _  => entry.classList.remove('dragover');

        this.inputList.appendChild(entry);
        this.domEmptyList.classList.add('hidden');
    }

    private update() : void
    {
        let children = this.inputList.children;

        // Don't update if list is empty
        if (children.length === 1)
            return;

        let list     = [];
        let textList = '';

        for (let i = 1; i < children.length; i++)
        {
            let entry = children[i] as HTMLElement;

            list.push(entry.innerText);
        }

        if (list.length === 1)
            textList = (this.currentId === 'calling')
                ? `${list[0]} only`
                : list[0];
        else
        {
            let tempList    = list.slice(0);
            let lastStation = tempList.pop();

            textList  = tempList.join(', ');
            textList += ` and ${lastStation}`;
        }

        RAG.state.setStationList(this.currentId, list);
        RAG.views.editor
            .getElementsByQuery(`[data-type=stationlist][data-id=${this.currentId}]`)
            .forEach(element => element.textContent = textList);
    }

    private onDrop(ev: DragEvent) : void
    {
        if (!ev.target || !this.domDragFrom)
            throw new Error("Drop event, but target and source are missing");

        this.domDragFrom.remove();
        this.update();

        if (this.inputList.children.length === 1)
            this.domEmptyList.classList.remove('hidden');
    }
}