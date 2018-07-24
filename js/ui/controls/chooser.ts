/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Delegate type for chooser select event handlers */
type SelectDelegate = (entry: HTMLElement) => void;

/** UI element with a filterable and keyboard navigable list of choices */
class Chooser
{
    private static SEARCHBOX : HTMLElement;
    private static PICKERBOX : HTMLElement;

    private static init() : void
    {
        let template = DOM.require('#chooserTemplate');

        Chooser.SEARCHBOX = DOM.require('.chSearchBox',  template);
        Chooser.PICKERBOX = DOM.require('.chChoicesBox', template);
        template.remove();
    }

    /** Optional event handler to fire when an item is selected by the user */
    public    onSelect?     : SelectDelegate;

    /** Whether to visually select the clicked element */
    public    selectOnClick : boolean = true;

    /** DOM reference to this chooser's filter input box */
    protected inputFilter   : HTMLInputElement;

    /** DOM reference to this chooser's container of item elements */
    protected inputChoices : HTMLElement;

    /** DOM reference to the currently selected item, if any */
    protected domSelected?  : HTMLElement;

    /** Reference to the auto-filter timeout, if any */
    protected filterTimeout : number = 0;

    /** Title attribute to apply to every item added */
    protected itemTitle     : string = 'Click to select this item';

    /** Whether to group added elements by alphabetical sections */
    protected groupByABC    : boolean = false;

    /** Creates a chooser, by replacing the placeholder in a given parent */
    constructor(parent: HTMLElement)
    {
        if (!Chooser.SEARCHBOX)
            Chooser.init();

        let target      = DOM.require('chooser', parent);
        let placeholder = DOM.getAttr(target, 'placeholder', 'Filter choices...');
        let title       = DOM.getAttr(target, 'title', 'List of choices');
        this.itemTitle  = DOM.getAttr(target, 'itemTitle', this.itemTitle);
        this.groupByABC = target.hasAttribute('groupByABC');

        this.inputFilter  = Chooser.SEARCHBOX.cloneNode(false) as HTMLInputElement;
        this.inputChoices = Chooser.PICKERBOX.cloneNode(false) as HTMLElement;

        this.inputChoices.title         = title;
        this.inputFilter.placeholder = placeholder;

        target.remove();
        parent.appendChild(this.inputFilter);
        parent.appendChild(this.inputChoices);
    }

    /**
     * Adds the given value to the chooser as a selectable item.
     *
     * @param {string} value Text of the selectable item
     * @param {boolean} select Whether to select this item once added
     */
    public add(value: string, select: boolean = false) : void
    {
        let item = document.createElement('dd');

        item.innerText = value;

        this.addRaw(item, select);
    }

    /**
     * Adds the given element to the chooser as a selectable item.
     *
     * @param {string} item Element to add to the chooser
     * @param {boolean} select Whether to select this item once added
     */
    public addRaw(item: HTMLElement, select: boolean = false) : void
    {
        item.title    = this.itemTitle;
        item.tabIndex = -1;

        this.inputChoices.appendChild(item);

        if (select)
        {
            this.visualSelect(item);
            item.focus();
        }
    }

    /** Clears all items from this chooser and the current filter */
    public clear() : void
    {
        this.inputChoices.innerHTML = '';
        this.inputFilter.value      = '';
    }

    /** Select and focus the entry that matches the given value */
    public preselect(value: string) : void
    {
        for (let key in this.inputChoices.children)
        {
            let item = this.inputChoices.children[key] as HTMLElement;

            if (value === item.innerText)
            {
                this.visualSelect(item);
                item.focus();
                break;
            }
        }
    }

    /** Handles pickers' change events, for filtering or choosing items */
    public onChange(ev: Event) : void
    {
        let target = ev.target as HTMLElement;

        // Skip for target-less events
        if (!target)
            return;

        // Handle pressing ENTER inside filter box
        else if (ev.type.toLowerCase() === 'submit')
            this.filter();

        // Make sure target is descendant of this control
        else if ( !this.owns(target) )
            return;

        // Handle item being clicked
        else if (target.tagName.toLowerCase() === 'dd')
            this.select(target);
    }

    /** Handles pickers' close methods, doing any timer cleanup */
    public onClose() : void
    {
        window.clearTimeout(this.filterTimeout);
    }

    /** Handles pickers' input events, for filtering and navigation */
    public onInput(ev: KeyboardEvent) : void
    {
        let key     = ev.key;
        let focused = document.activeElement as HTMLElement;
        let parent  = focused.parentElement!;

        if (!focused) return;

        // Only handle events on this chooser's controls
        if ( !this.owns(focused) )
            return;

        // Handle typing into filter box
        if (focused === this.inputFilter)
        {
            window.clearTimeout(this.filterTimeout);

            this.filterTimeout = window.setTimeout(_ => this.filter(), 500);
            return;
        }

        // Redirect typing to input filter box
        if (focused !== this.inputFilter)
        if (key.length === 1 || key === 'Backspace')
            return this.inputFilter.focus();

        // Handle pressing ENTER after keyboard navigating to an item
        if ( parent === this.inputChoices || parent.hasAttribute('group') )
        if (key === 'Enter')
            return this.select(focused as HTMLElement);

        // Handle navigation when container or item is focused
        if (key === 'ArrowLeft' || key === 'ArrowRight')
        {
            let dir = (key === 'ArrowLeft') ? -1 : 1;
            let nav = null;

            // Navigate relative to currently focused element, if using groups
            if      ( this.groupByABC && parent.hasAttribute('group') )
                nav = DOM.getNextFocusableSibling(focused, dir);

            // Navigate relative to currently focused element, if choices are flat
            else if (!this.groupByABC && focused.parentElement === this.inputChoices)
                nav = DOM.getNextFocusableSibling(focused, dir);

            // Navigate relative to currently selected element
            else if (focused === this.domSelected)
                nav = DOM.getNextFocusableSibling(this.domSelected, dir);

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
    }

    /** Hide or show choices if they partially match the user query */
    protected filter() : void
    {
        // TODO: Can this be any further optimized? Debug with profiler
        window.clearTimeout(this.filterTimeout);

        let filter = this.inputFilter.value.toLowerCase();
        let items  = this.inputChoices.children;
        let engine = this.groupByABC
            ? Chooser.filterGroup
            : Chooser.filterItem;

        // Prevent browser redraw/reflow during filtering
        this.inputChoices.classList.add('hidden');

        // Iterate through all the items
        for (let i = 0; i < items.length; i++)
            engine(items[i] as HTMLElement, filter);

        this.inputChoices.classList.remove('hidden');
    }

    /** Applies filter to an item, showing it if matched, hiding if not */
    protected static filterItem(item: HTMLElement, filter: string) : number
    {
        // Show if contains search term
        if (item.innerText.toLowerCase().indexOf(filter) >= 0)
        {
            item.classList.remove('hidden');
            return 0;
        }

        // Hide if not
        else
        {
            item.classList.add('hidden');
            return 1;
        }
    }

    /** Applies filter to children of a group, hiding the group if all children hide */
    protected static filterGroup(group: HTMLElement, filter: string) : void
    {
        let entries = group.children;
        let count   = entries.length - 1; // -1 for header element
        let hidden  = 0;

        // Iterate through each station name in this letter section. Header skipped.
        for (let i = 1; i < entries.length; i++)
            hidden += Chooser.filterItem(entries[i] as HTMLElement, filter);

        // If all station names in this letter section were hidden, hide the section
        if (hidden >= count)
            group.classList.add('hidden');
        else
            group.classList.remove('hidden');
    }

    /** Visually changes the current selection, and updates the state and editor */
    protected select(entry: HTMLElement) : void
    {
        let alreadySelected = (entry === this.domSelected);

        if (this.selectOnClick)
            this.visualSelect(entry);

        if (this.onSelect)
            this.onSelect(entry);

        if (alreadySelected)
            RAG.views.editor.closeDialog();
    }

    /** Visually changes the currently selected element */
    protected visualSelect(entry: HTMLElement) : void
    {
        this.visualUnselect();

        this.domSelected          = entry;
        this.domSelected.tabIndex = 50;
        entry.setAttribute('selected', 'true');
    }

    /** Visually unselects the currently selected element, if any */
    protected visualUnselect() : void
    {
        if (!this.domSelected)
            return;

        this.domSelected.removeAttribute('selected');
        this.domSelected.tabIndex = -1;
        this.domSelected          = undefined;
    }

    /**
     * Whether this chooser is an ancestor (owner) of the given element.
     *
     * @param target Element to check if this chooser is an ancestor of
     */
    protected owns(target: HTMLElement) : boolean
    {
        return this.inputFilter.contains(target) || this.inputChoices.contains(target);
    }
}