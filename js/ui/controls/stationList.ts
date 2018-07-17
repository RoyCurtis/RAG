/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/**
 * Singleton instance of the station picker. Since there are expected to be 2500+
 * stations, this element would take up a lot of memory and generate a lot of DOM. So, it
 * has to be "swapped" between pickers and views that want to use it.
 */
class StationList extends FilterableList
{
    /** Shortcut references to all the generated A-Z station list elements */
    private readonly domStations : Dictionary<HTMLDListElement> = {};

    constructor(parent: HTMLElement)
    {
        super(parent);

        this.inputList.tabIndex = 0;

        // Next, populate the list of stations from the database. We do this by creating
        // a dl element for each letter of the alphabet, creating a dt element header, and
        // then populating the dl with station name dd children.
        Object.keys(RAG.database.stations).forEach(code =>
        {
            let station = RAG.database.stations[code];
            let letter  = station[0];
            let group   = this.domStations[letter];

            if (!letter)
                throw new Error('Station database appears to contain an empty name');

            if (!group)
            {
                let header       = document.createElement('dt');
                header.innerText = letter.toUpperCase();
                header.tabIndex  = -1;

                group = this.domStations[letter] = document.createElement('dl');
                group.tabIndex = 50;

                group.setAttribute('group', '');
                group.appendChild(header);
                this.inputList.appendChild(group);
            }

            let entry             = document.createElement('dd');
            entry.dataset['code'] = code;
            entry.innerText       = RAG.database.stations[code];
            entry.title           = this.itemTitle;
            entry.tabIndex        = -1;

            group.appendChild(entry);
        });
    }

    /** Attaches this control to the given parent and resets some state */
    public attach(picker: Picker, onSelect: SelectDelegate) : void
    {
        let parent  = picker.domForm;
        let current = this.inputList.parentElement;

        if (!current || current !== parent)
        {
            parent.appendChild(this.inputFilter);
            parent.appendChild(this.inputList);
        }

        this.reset();
        this.onSelect = onSelect.bind(picker);
        this.inputFilter.focus();
    }

    /** Pre-selects a station entry by its code */
    public preselectCode(code: string) : void
    {
        let entry = this.inputList.querySelector(`dd[data-code=${code}]`);

        if (entry)
            this.visualSelect(entry as HTMLElement);
    }

    /** Registers an event handler for when something (e.g. station name) is dropped */
    public registerDropHandler(handler: DragDelegate) : void
    {
        this.inputFilter.ondrop     = handler;
        this.inputList.ondrop       = handler;
        this.inputFilter.ondragover = DOM.preventDefault;
        this.inputList.ondragover   = DOM.preventDefault;
    }

    private reset() : void
    {
        this.inputFilter.ondrop     = null;
        this.inputList.ondrop       = null;
        this.inputFilter.ondragover = null;
        this.inputList.ondragover   = null;
        this.visualUnselect();
    }
}