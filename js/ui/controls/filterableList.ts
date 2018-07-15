/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Delegate type for list select event handlers */
type SelectDelegate = (entry: HTMLElement) => void;

/** UI element with a filterable and keyboard navigable list of choices */
class FilterableList
{
    private static SEARCHBOX : HTMLElement;
    private static PICKERBOX : HTMLElement;

    private static init() : void
    {
        let template = DOM.require('#filterableList');

        FilterableList.SEARCHBOX = DOM.require('.flSearchBox',  template);
        FilterableList.PICKERBOX = DOM.require('.flItemPicker', template);
        template.remove();
    }

    public onSelect? : SelectDelegate;

    private inputFilter   : HTMLInputElement;
    private inputList     : HTMLElement;
    private domSelected?  : HTMLElement;
    private filterTimeout : number = 0;
    private itemTitle     : string = 'Click to select this item';

    /** Creates a filterable list, by replacing the placeholder in a given parent */
    constructor(parent: HTMLElement)
    {
        if (!FilterableList.SEARCHBOX)
            FilterableList.init();

        let target      = DOM.require('filterableList', parent);
        let placeholder = DOM.getAttr(target, 'placeholder', 'Filter choices...');
        let title       = DOM.getAttr(target, 'title', 'List of choices');
        this.itemTitle  = DOM.getAttr(target, 'itemTitle', this.itemTitle);

        this.inputFilter = FilterableList.SEARCHBOX.cloneNode(false) as HTMLInputElement;
        this.inputList   = FilterableList.PICKERBOX.cloneNode(false) as HTMLElement;

        this.inputList.title         = title;
        this.inputFilter.placeholder = placeholder;

        target.remove();
        parent.appendChild(this.inputFilter);
        parent.appendChild(this.inputList);
    }

    /** Adds an item to this list */
    public add(value: string) : void
    {
        let item = document.createElement('dd');

        item.innerText = value;
        item.title     = this.itemTitle;
        item.tabIndex  = -1;

        this.inputList.appendChild(item);
    }

    /** Select and focus the entry that matches the given value */
    public preselect(value: string) : void
    {
        for (let key in this.inputList.children)
        {
            let item = this.inputList.children[key] as HTMLElement;

            if (value === item.innerText)
            {
                this.visualSelect(item);
                item.focus();
                break;
            }
        }
    }

    public onChange(ev: Event) : void
    {
        let target = ev.target as HTMLElement;

        // Skip for target-less events
        if (!target)
            return;

        // Handle pressing ENTER inside filter box
        else if (ev.type.toLowerCase() === 'submit')
            this.filter();

        // Handle item being clicked
        else if (target.parentElement === this.inputList)
            this.select(target);
    }

    /** Handles pickers' close methods, doing any timer cleanup */
    public onClose() : void
    {
        window.clearTimeout(this.filterTimeout);
    }

    public onInput(ev: KeyboardEvent) : void
    {
        let key     = ev.key;
        let focused = document.activeElement as HTMLElement;

        if (!focused) return;

        // Handle typing into filter box
        if (focused === this.inputFilter)
        {
            // TODO: Clear on close
            window.clearTimeout(this.filterTimeout);

            this.filterTimeout = window.setTimeout(_ => this.filter(), 500);
            return;
        }

        // Redirect typing to input filter box
        if (focused !== this.inputFilter)
        if (key.length === 1 || key === 'Backspace')
            return this.inputFilter.focus();

        // Handle pressing ENTER after keyboard navigating to an excuse
        if (focused.parentElement === this.inputList)
        if (key === 'Enter')
            return this.select(focused as HTMLElement);

        // Handle navigation when container or item is focused
        if (key === 'ArrowLeft' || key === 'ArrowRight')
        {
            let dir = (key === 'ArrowLeft') ? -1 : 1;
            let nav : HTMLElement | null = null;

            // Navigate relative to currently focused element
            if      (focused.parentElement === this.inputList)
                nav = DOM.getNextVisibleSibling(focused, dir);

            // Navigate relative to currently selected element
            else if (focused === this.domSelected)
                nav = DOM.getNextVisibleSibling(this.domSelected, dir);

            // Navigate relevant to beginning or end of container
            else if (dir === -1)
                nav = DOM.getNextVisibleSibling(
                    this.inputList.firstElementChild! as HTMLElement, dir
                );
            else
                nav = DOM.getNextVisibleSibling(
                    this.inputList.lastElementChild! as HTMLElement, dir
                );

            if (nav) nav.focus();
        }
    }

    /** Hide or show items of the list if they partially match the user query */
    private filter() : void
    {
        // TODO: optimize and DRY this as much as possible

        window.clearTimeout(this.filterTimeout);
        let filter = this.inputFilter.value.toLowerCase();
        let items  = this.inputList.children;

        // Prevent browser redraw/reflow during filtering
        this.inputList.classList.add('hidden');

        // Iterate through all the items
        for (let i = 0; i < items.length; i++)
        {
            let item = items[i] as HTMLElement;

            // Show if contains search term
            if (item.innerText.toLowerCase().indexOf(filter) >= 0)
                item.classList.remove('hidden');
            // Hide if not
            else
                item.classList.add('hidden');
        }

        this.inputList.classList.remove('hidden');
    }

    /** Visually changes the current selection, and updates the state and editor */
    private select(entry: HTMLElement) : void
    {
        this.visualSelect(entry);

        if (this.onSelect)
            this.onSelect(entry);
    }

    /** Visually changes the currently selected element */
    private visualSelect(entry: HTMLElement) : void
    {
        if (this.domSelected)
        {
            this.domSelected.tabIndex = -1;
            this.domSelected.removeAttribute('selected');
        }

        this.domSelected          = entry;
        this.domSelected.tabIndex = 50;
        entry.setAttribute('selected', 'true');
    }
}