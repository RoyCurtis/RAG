/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the named train picker dialog */
class NamedPicker extends Picker
{
    /** Reference to container element for all the pickable names */
    private readonly inputNamed : HTMLElement;

    /** Currently selected name, if any */
    private domSelected? : HTMLElement;

    constructor()
    {
        super('named', ['click']);

        this.inputNamed = DOM.require('.picker', this.dom);

        RAG.database.named.forEach(value =>
        {
            let named = document.createElement('dd');

            named.innerText = value;
            named.title     = 'Click to select this name';
            named.tabIndex  = -1;

            this.inputNamed.appendChild(named);
        });
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        let value = RAG.state.named;

        // Pre-select the currently used name
        for (let key in this.inputNamed.children)
        {
            let name = this.inputNamed.children[key] as HTMLElement;

            if (value !== name.innerText)
                continue;

            this.visualSelect(name);
            name.focus();
            break;
        }
    }

    protected onChange(ev: Event) : void
    {
        let target = ev.target as HTMLElement;

        // Handle name being clicked
        if (target && target.parentElement === this.inputNamed)
            this.select(target);
    }

    protected onInput(_: KeyboardEvent) : void
    {
        // no-op
    }

    /** Visually changes the current selection, and updates the state and editor */
    private select(entry: HTMLElement) : void
    {
        this.visualSelect(entry);

        RAG.state.named = entry.innerText;
        RAG.views.editor.setElementsText('named', RAG.state.named);
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