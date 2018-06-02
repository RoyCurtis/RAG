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

    /** Picks a random root phrase, loads it into the editor and processes it into HTML */
    public generate() : void
    {
        this.dom.innerHTML = '<phraseset ref="root" />';

        RAG.phraser.process(this.dom);
    }

    /**
     * Gets a static NodeList of all phrase elements of the given type.
     *
     * @param {string} type Original XML name of elements to get
     * @returns {NodeList}
     */
    public getElements(type: string) : NodeList
    {
        return this.dom.querySelectorAll(`span[data-type=${type}]`);
    }

    /** Gets the current phrase in the editor as text, excluding the hidden parts */
    public getText() : string
    {
        return DOM.getVisibleText(this.dom);
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
        let type   = target ? target.dataset['type'] : undefined;
        let picker = type   ? RAG.viewController.getPicker(type) : undefined;

        // Ignore clicks to any element of already open pickers
        if (target && this.currentPicker)
        if ( this.currentPicker.dom.contains(target) )
            return;

        // If clicking the element already being edited, close and don't re-open
        if (target && target === this.domEditing)
            return this.closeDialog();

        // Cancel any open editors
        this.closeDialog();

        // Handle collapsible elements (and their wrapper children)
        if (target.dataset['chance'])
            this.toggleOptional(target);
        else if ( target.hasAttribute('inner') )
            this.toggleOptional(target.parentElement!);

        // Find and open picker for the target element
        else if (target && type && picker)
            this.openPicker(target, picker);
    }

    private toggleOptional(target: HTMLElement)
    {
        if (target.hasAttribute('collapsed'))
        {
            target.removeAttribute('collapsed');
            target.title = "Click to close this optional part";
        }
        else
        {
            target.setAttribute('collapsed', '');
            target.title = "Click to open this optional part";
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