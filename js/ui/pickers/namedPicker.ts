/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the named train picker dialog */
class NamedPicker extends Picker
{
    private readonly domChooser : Chooser;

    constructor()
    {
        super('named', ['click']);

        this.domChooser          = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);

        RAG.database.named.forEach( v => this.domChooser.add(v) );
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        // Pre-select the currently used name
        this.domChooser.preselect(RAG.state.named);
    }

    public close() : void
    {
        super.close();
        this.domChooser.onClose();
    }

    protected onChange(ev: Event) : void
    {
        this.domChooser.onChange(ev);
    }

    protected onInput(ev: KeyboardEvent) : void
    {
        this.domChooser.onInput(ev);
    }

    private onSelect(entry: HTMLElement) : void
    {
        RAG.state.named = entry.innerText;
        RAG.views.editor.setElementsText('named', RAG.state.named);
    }
}