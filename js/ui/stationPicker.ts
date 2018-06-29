/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="Picker.ts"/>

/** Controller for the station picker dialog */
class StationPicker extends Picker
{
    private readonly domChoices:   { [index: string]: HTMLDListElement };
    private readonly inputFilter:  HTMLInputElement;
    private readonly inputStation: HTMLElement;

    private domSelected?:  HTMLDataElement;
    private filterTimeout: number = 0;

    constructor()
    {
        super('station', ['click', 'input']);

        this.domChoices   = {};
        this.inputFilter  = DOM.require('input', this.dom) as HTMLInputElement;
        this.inputStation = DOM.require('.picker', this.dom);

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
    }

    public open(target: HTMLElement)
    {
        super.open(target);
        this.inputFilter.focus();

        let code  = RAG.state.stationCode;
        let entry = this.inputStation.querySelector(`dd[data-code=${code}]`);

        if (entry)
            this.select(entry as HTMLDataElement);
    }

    private select(option: HTMLDataElement)
    {
        if (this.domSelected)
            this.domSelected.removeAttribute('selected');

        this.domSelected = option;
        option.setAttribute('selected', 'true');
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
            this.select(target);

            RAG.state.stationCode = target.dataset['code']!;
            RAG.views.editor.setElementsText('station', target.innerText);
        }
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