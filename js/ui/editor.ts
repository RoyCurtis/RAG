/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the phrase editor */
class Editor
{
    private readonly dom : HTMLElement;

    private currentPicker? : Picker;
    // TODO: should this just be in the picker class?
    private domEditing?    : HTMLElement;

    constructor()
    {
        this.dom = DOM.require('#editor');

        document.body.onclick = this.handleClick.bind(this);
        this.dom.textContent  = "Please wait...";
    }

    /** Replaces the editor with a root phraseset reference, and expands it into HTML */
    public generate() : void
    {
        this.dom.innerHTML = '<phraseset ref="root" />';

        RAG.phraser.process(this.dom);
    }

    /** Reprocesses all phraseset elements of the given ref, if their index has changed */
    public refreshPhraseset(ref: string) : void
    {
        // TODO: potential inline candidate
        // Note, this could potentially bug out if a phraseset's descendant references
        // the same phraseset (recursion). But this is okay because phrasesets should
        // never include themselves, even eventually.

        this.dom.querySelectorAll(`span[data-type=phraseset][data-ref=${ref}`)
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
     * Gets a static NodeList of all phrase elements of the given type.
     *
     * @param {string} type Original XML name of elements to get
     * @returns {NodeList}
     */
    public getElements(type: string) : NodeList
    {
        // TODO: inline candidate
        return this.dom.querySelectorAll(`span[data-type=${type}]`);
    }

    /** Gets the current phrase in the editor as text, excluding the hidden parts */
    public getText() : string
    {
        // TODO: inline this if the only caller is handlePlay()
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
        this.getElements(type).forEach(element => element.textContent = value);
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
    private handleClick(ev: MouseEvent) : void
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

        // Handle collapsible elements (and their wrapper children)
        if ( target.classList.contains('toggle') )
            this.toggleCollapsiable(target);

        // Find and open picker for the target element
        else if (type && picker)
            this.openPicker(target, picker);
    }

    private toggleCollapsiable(target: HTMLElement)
    {
        let parent = target.parentElement!;

        if (parent.hasAttribute('collapsed'))
        {
            parent.removeAttribute('collapsed');
            target.title     = "Click to close this optional part";
            target.innerText = '-';
        }
        else
        {
            parent.setAttribute('collapsed', '');
            target.title     = "Click to open this optional part";
            target.innerText = '+';
        }
    }

    private openPicker(target: HTMLElement, picker: Picker)
    {
        target.setAttribute('editing', 'true');

        this.currentPicker = picker;
        this.domEditing    = target;
        picker.open(target);
    }
}