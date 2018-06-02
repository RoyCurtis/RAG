/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the phrase editor */
class Editor
{
    private currentPicker? : Picker;
    private dom            : HTMLElement;
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

        // If clicking the element already being edited, treat it as a close
        if (target && target === this.domEditing)
            return this.closeDialog();

        // Cancel any open editors
        this.closeDialog();

        if (type === 'optional')
            this.toggleOptional(target);
        else if (target && type && picker)
            this.openPicker(target, picker);
    }

    private toggleOptional(target: HTMLElement)
    {
        if (target.hasAttribute('collapsed'))
            target.removeAttribute('collapsed');
        else
            target.setAttribute('collapsed', '');
    }

    private openPicker(target: HTMLElement, picker: Picker)
    {
        target.setAttribute('editing', 'true');

        this.currentPicker = picker;
        this.domEditing    = target;
        picker.open(target);
    }
}