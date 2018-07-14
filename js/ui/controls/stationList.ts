/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Delegate type for station name click handlers */
type StationClickDelegate = (target: HTMLDataElement) => void;

/** Manages UI elements and their logic */
class StationList
{
    /** Reference to the UI template (or container) of this control */
    private readonly dom          : HTMLElement;
    /** Shortcut references to all the generated A-Z station list elements */
    private readonly domChoices   : Dictionary<HTMLDListElement>;
    /** Reference to the filter form field */
    private readonly inputFilter  : HTMLInputElement;
    /** Reference to the div where the A-Z station name lists are shown */
    private readonly inputStation : HTMLElement;

    private filterTimeout : number = 0;
    private domSelected?  : HTMLDataElement;

    constructor()
    {
        this.dom          = DOM.require('#stationList');
        this.inputFilter  = DOM.require('input', this.dom) as HTMLInputElement;
        this.inputStation = DOM.require('.picker', this.dom);
        this.domChoices   = {};

        // First, orphan the UI template for this control
        this.dom.remove();
        this.dom.classList.remove('hidden');

        // Next, populate the list of stations from the database. We do this by creating
        // a dl element for each letter of the alphabet, creating a dt element header, and
        // then populating the dl with station name dd children.
        Object.keys(RAG.database.stations).forEach(code =>
        {
            let station = RAG.database.stations[code];
            let letter  = station[0];
            let group   = this.domChoices[letter];

            if (!letter)
                throw new Error('Station database appears to contain an empty name');

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

    /** Attaches this control to the given parent and resets some state */
    public attach(picker: Picker) : void
    {
        let parent = picker.domForm;

        if (!this.dom.parentElement || this.dom.parentElement !== parent)
            parent.appendChild(this.dom);

        this.reset();
        this.inputFilter.focus();
    }

    /** Select a station entry by its code */
    public selectCode(code: string) : void
    {
        let entry = this.inputStation.querySelector(`dd[data-code=${code}]`);

        if (entry)
            this.selectEntry(entry as HTMLDataElement);
    }

    /** Selects the given station entry element */
    public selectEntry(entry: HTMLDataElement) : void
    {
        if (this.domSelected)
            this.domSelected.removeAttribute('selected');

        this.domSelected = entry;
        entry.setAttribute('selected', 'true');
    }

    /** Registers an event handler for when something (e.g. station name) is dropped */
    public registerDropHandler(handler: DragDelegate) : void
    {
        this.inputFilter.ondrop      = handler;
        this.inputStation.ondrop     = handler;
        this.inputFilter.ondragover  = StationList.preventDefault;
        this.inputStation.ondragover = StationList.preventDefault;
    }

    /** Handler for picker's onChange event, with custom action on station click */
    public onChange(ev: Event, onClick: StationClickDelegate) : void
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
            onClick(target);
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

    private reset() : void
    {
        this.inputFilter.ondrop      = null;
        this.inputStation.ondrop     = null;
        this.inputFilter.ondragover  = null;
        this.inputStation.ondragover = null;

        if (this.domSelected)
        {
            this.domSelected.removeAttribute('selected');
            this.domSelected = undefined;
        }
    }

    // TODO: maybe this could go in DOM?
    private static preventDefault(ev: Event) : void
    {
        ev.preventDefault();
    }
}