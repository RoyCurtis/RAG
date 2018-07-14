/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the station list picker dialog */
class StationListPicker extends Picker
{
    private readonly domChoices:   Dictionary<HTMLDListElement>;
    private readonly domEmptyList: HTMLElement;
    private readonly inputList:    HTMLDListElement;
    private readonly inputFilter:  HTMLInputElement;
    private readonly inputStation: HTMLElement;

    private currentId     : string = '';
    private filterTimeout : number = 0;
    private domDragFrom?  : HTMLElement;

    constructor()
    {
        super('stationlist', ['click', 'input']);

        this.inputList    = DOM.require('.stations', this.dom) as HTMLDListElement;
        this.inputFilter  = DOM.require('input', this.dom)     as HTMLInputElement;
        this.inputStation = DOM.require('.picker', this.dom);
        this.domEmptyList = DOM.require('dt', this.inputList);
        this.domChoices   = {};

        // TODO: definitely needs to be DRYd with StationPicker
        Object.keys(RAG.database.stations).forEach(code =>
        {
            let station = RAG.database.stations[code];
            let letter  = station[0];
            let group   = this.domChoices[letter];

            if (!group)
            {
                let header       = document.createElement('dt');
                header.innerText = letter.toUpperCase();

                group = this.domChoices[letter] = document.createElement('dl');

                group.appendChild(header);
                this.inputStation.appendChild(group);
            }

            let entry             = document.createElement('dd');
            entry.innerText       = RAG.database.stations[code];
            entry.dataset['code'] = code;

            group.appendChild(entry);
        });

        this.inputFilter.ondrop = this.inputStation.ondrop = ev =>
        {
            if (!ev.target || !this.domDragFrom)
                throw new Error("Drop event, but target and source are missing");

            this.domDragFrom.remove();
            this.update();

            if (this.inputList.children.length === 1)
                this.domEmptyList.classList.remove('hidden');
        };

        this.inputFilter.ondragover = this.inputStation.ondragover =
            ev => ev.preventDefault();
    }


    public open(target: HTMLElement)
    {
        super.open(target);
        this.inputFilter.focus();

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
        let target = ev.target as HTMLDataElement;

        // Skip for target-less events
        if (!target)
            return;

        // Handle typing into filter box
        else if (target === this.inputFilter)
        {
            window.clearTimeout(this.filterTimeout);

            this.filterTimeout = window.setTimeout(this.filter.bind(this), 500);
        }

        // Handle pressing ENTER inside filter box
        else if (ev.type.toLowerCase() === 'submit')
            this.filter();

        // Handle station name being clicked
        else if (target.dataset['code'])
        {
            this.addEntry(target.innerText);
            this.update();
        }
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

    private filter() : void
    {
        // TODO: optimize this as much as possible

        window.clearTimeout(this.filterTimeout);
        let filter  = this.inputFilter.value.toLowerCase();
        let letters = this.inputStation.children;

        // Prevent browser redraw/reflow during filtering
        this.inputStation.classList.add('hidden');

        // Iterate through each letter section
        for (let i = 0; i < letters.length; i++)
        {
            let letter  = letters[i];
            let entries = letters[i].children;
            let count   = entries.length - 1; // -1 for header element
            let hidden  = 0;

            // Iterate through each station name in this letter section. Header skipped.
            for (let j = 1; j < entries.length; j++)
            {
                let entry = entries[j] as HTMLElement;

                // Show if contains search term
                if (entry.innerText.toLowerCase().indexOf(filter) >= 0)
                    entry.classList.remove('hidden');
                // Hide if not
                else
                {
                    entry.classList.add('hidden');
                    hidden++;
                }
            }

            // If all station names in this letter section were hidden, hide the section
            if (hidden >= count)
                letter.classList.add('hidden');
            else
                letter.classList.remove('hidden');
        }

        this.inputStation.classList.remove('hidden');
    }
}