/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the excuse picker dialog */
class ExcusePicker extends Picker
{
    /** Reference to the filter form field */
    private readonly inputFilter : HTMLInputElement;
    /** Reference to container element for all the pickable excuses */
    private readonly inputExcuse : HTMLElement;

    /** Currently selected excuse, if any */
    private domSelected?  : HTMLElement;
    /** Current filter box timeout reference */
    private filterTimeout : number = 0;

    constructor()
    {
        super('excuse', ['click']);

        this.inputFilter = DOM.require('input', this.dom) as HTMLInputElement;
        this.inputExcuse = DOM.require('.picker', this.dom);

        RAG.database.excuses.forEach(value =>
        {
            let excuse = document.createElement('dd');

            excuse.innerText = value;
            excuse.title     = 'Click to select this excuse';
            excuse.tabIndex  = -1;

            this.inputExcuse.appendChild(excuse);
        });
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        let value = RAG.state.excuse;

        // Pre-select the currently used excuse
        for (let key in this.inputExcuse.children)
        {
            let excuse = this.inputExcuse.children[key] as HTMLElement;

            if (value !== excuse.innerText)
                continue;

            this.visualSelect(excuse);
            excuse.focus();
            break;
        }
    }

    protected onChange(ev: Event)
    {
        let target = ev.target as HTMLElement;

        // Skip for target-less events
        if (!target)
            return;

        // Handle pressing ENTER inside filter box
        else if (ev.type.toLowerCase() === 'submit')
            this.filter();

        // Handle excuse being clicked
        else if (target.parentElement === this.inputExcuse)
            this.select(target);
    }

    protected onInput(ev: KeyboardEvent) : void
    {
        let key     = ev.key;
        let focused = document.activeElement as HTMLElement;

        if (!focused) return;

        // Handle typing into filter box
        if (focused === this.inputFilter)
        {
            window.clearTimeout(this.filterTimeout);

            this.filterTimeout = window.setTimeout(this.filter.bind(this), 500);
        }

        // Redirect typing to input filter box
        if (focused !== this.inputFilter)
        if (key.length === 1 || key === 'Backspace')
            return this.inputFilter.focus();

        // Handle pressing ENTER after keyboard navigating to an excuse
        if (focused.parentElement === this.inputExcuse)
        if (key === 'Enter')
            return this.select(focused as HTMLElement);

        // Handle navigation when container or item is focused
        if (key === 'ArrowLeft' || key === 'ArrowRight')
        {
            let dir = (key === 'ArrowLeft') ? -1 : 1;
            let nav : HTMLElement | null = null;

            // Navigate relative to currently focused element
            if      (focused.parentElement === this.inputExcuse)
                nav = DOM.getNextVisibleSibling(focused, dir);

            // Navigate relative to currently selected element
            else if (focused === this.domSelected)
                nav = DOM.getNextVisibleSibling(this.domSelected, dir);

            // Navigate relevant to beginning or end of container
            else if (dir === -1)
                nav = DOM.getNextVisibleSibling(
                    this.inputExcuse.firstElementChild! as HTMLElement, dir
                );
            else
                nav = DOM.getNextVisibleSibling(
                    this.inputExcuse.lastElementChild! as HTMLElement, dir
                );

            if (nav) nav.focus();
        }
    }

    private filter() : void
    {
        // TODO: optimize and DRY this as much as possible

        window.clearTimeout(this.filterTimeout);
        let filter  = this.inputFilter.value.toLowerCase();
        let excuses = this.inputExcuse.children;

        // Prevent browser redraw/reflow during filtering
        this.inputExcuse.classList.add('hidden');

        // Iterate through all the excuses
        for (let i = 0; i < excuses.length; i++)
        {
            let excuse = excuses[i] as HTMLElement;

            // Show if contains search term
            if (excuse.innerText.toLowerCase().indexOf(filter) >= 0)
                excuse.classList.remove('hidden');
            // Hide if not
            else
                excuse.classList.add('hidden');
        }

        this.inputExcuse.classList.remove('hidden');
    }

    /** Visually changes the current selection, and updates the state and editor */
    private select(entry: HTMLElement) : void
    {
        this.visualSelect(entry);

        RAG.state.excuse = entry.innerText;
        RAG.views.editor.setElementsText('excuse', RAG.state.excuse);
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