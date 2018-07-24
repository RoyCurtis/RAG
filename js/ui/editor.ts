/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the phrase editor */
class Editor
{
    /** Reference to the DOM container for the editor */
    private readonly dom : HTMLElement;

    /** Reference to the currently open picker dialog, if any */
    private currentPicker? : Picker;

    /** Reference to the phrase element currently being edited, if any */
    // Do not DRY; needs to be passed to the picker for cleaner code
    private domEditing?    : HTMLElement;

    constructor()
    {
        this.dom = DOM.require('#editor');

        document.body.onclick   = this.onClick.bind(this);
        document.body.onkeydown = this.onInput.bind(this);
        window.onresize         = this.onResize.bind(this);
        this.dom.onscroll       = this.onScroll.bind(this);
        this.dom.textContent    = "Please wait...";
    }

    /** Replaces the editor with a root phraseset reference, and expands it into HTML */
    public generate() : void
    {
        this.dom.innerHTML = '<phraseset ref="root" />';

        RAG.phraser.process(this.dom);

        // For scroll-past padding under the phrase
        let padding       = document.createElement('span');
        padding.className = 'bottomPadding';

        this.dom.appendChild(padding);
    }

    /** Reprocesses all phraseset elements of the given ref, if their index has changed */
    public refreshPhraseset(ref: string) : void
    {
        // Note, this could potentially bug out if a phraseset's descendant references
        // the same phraseset (recursion). But this is okay because phrasesets should
        // never include themselves, even eventually.

        this.dom.querySelectorAll(`span[data-type=phraseset][data-ref=${ref}]`)
            .forEach(_ =>
            {
                let element    = _ as HTMLElement;
                let newElement = document.createElement('phraseset');
                let chance     = element.dataset['chance'];

                newElement.setAttribute('ref', ref);

                if (chance)
                    newElement.setAttribute('chance', chance);

                element.parentElement!.replaceChild(newElement, element);
                RAG.phraser.process(newElement.parentElement!);
            });
    }

    /**
     * Gets a static NodeList of all phrase elements of the given query.
     *
     * @param {string} query Query string to add onto the `span` selector
     * @returns {NodeList} Node list of all elements matching the given span query
     */
    public getElementsByQuery(query: string) : NodeList
    {
        return this.dom.querySelectorAll(`span${query}`);
    }

    public getRect() : DOMRect
    {
        return this.dom.getBoundingClientRect() as DOMRect;
    }

    /** Gets the current phrase in the editor as text, excluding the hidden parts */
    public getText() : string
    {
        return DOM.getCleanedVisibleText(this.dom);
    }

    /**
     * Finds all phrase elements of the given type, and sets their text to given value.
     *
     * @param {string} type Original XML name of elements to replace contents of
     * @param {string} value New text for the found elements to set
     */
    public setElementsText(type: string, value: string) : void
    {
        this.getElementsByQuery(`[data-type=${type}]`)
            .forEach(element => element.textContent = value);
    }

    /** Closes any currently open editor dialogs */
    public closeDialog() : void
    {
        if (this.currentPicker)
            this.currentPicker.close();

        if (this.domEditing)
        {
            this.domEditing.removeAttribute('editing');
            this.domEditing.classList.remove('above', 'below');
        }

        this.currentPicker = undefined;
        this.domEditing    = undefined;
    }

    /** Handles a click anywhere in the window depending on the context */
    private onClick(ev: MouseEvent) : void
    {
        let target = ev.target as HTMLElement;
        let type   = target ? target.dataset['type']    : undefined;
        let picker = type   ? RAG.views.getPicker(type) : undefined;

        if (!target)
            return this.closeDialog();

        // Redirect clicks of inner elements
        if ( target.classList.contains('inner') && target.parentElement )
        {
            target = target.parentElement;
            type   = target.dataset['type'];
            picker = type ? RAG.views.getPicker(type) : undefined;
        }

        // Ignore clicks to any inner document or unowned element
        if ( !document.body.contains(target) )
            return;

        // Ignore clicks to any element of already open pickers
        if ( this.currentPicker )
        if ( this.currentPicker.dom.contains(target) )
            return;

        // Cancel any open editors
        let prevTarget = this.domEditing;
        this.closeDialog();

        // If clicking the element already being edited, don't reopen
        if (target === prevTarget)
            return;

        // Handle collapsible elements
        if ( target.classList.contains('toggle') )
            this.toggleCollapsiable(target);

        // Find and open picker for the target element
        else if (type && picker)
            this.openPicker(target, picker);
    }

    private onInput(ev: KeyboardEvent) : void
    {
        if (ev.key === 'Escape')
            return this.closeDialog();
    }

    private onResize(_: Event) : void
    {
        if (this.currentPicker)
            this.currentPicker.layout();
    }

    private onScroll(_: Event) : void
    {
        if (!this.currentPicker)
            return;

        // Workaround for layout behaving weird when iOS keyboard is open
        if (DOM.isMobile)
        if (this.currentPicker.hasFocus())
            DOM.blurActive();

        this.currentPicker.layout();
    }

    private toggleCollapsiable(target: HTMLElement) : void
    {
        let parent     = target.parentElement!;
        let ref        = DOM.requireData(parent, 'ref');
        let type       = DOM.requireData(parent, 'type');
        let collapased = parent.hasAttribute('collapsed');

        // Propogate new collapse state to all collapsibles of the same ref
        this.dom.querySelectorAll(`span[data-type=${type}][data-ref=${ref}]`)
            .forEach(_ =>
            {
                let phraseset = _ as HTMLElement;
                let toggle    = phraseset.children[0] as HTMLElement;

                // Skip same-ref elements that aren't collapsible
                if ( !toggle || !toggle.classList.contains('toggle') )
                    return;

                Collapsibles.set(phraseset, toggle, !collapased);
                // Don't move this to setCollapsible, as state save/load is handled
                // outside in both usages of setCollapsible.
                RAG.state.setCollapsed(ref, !collapased);
            });
    }

    private openPicker(target: HTMLElement, picker: Picker) : void
    {
        target.setAttribute('editing', 'true');

        this.currentPicker = picker;
        this.domEditing    = target;
        picker.open(target);
    }
}