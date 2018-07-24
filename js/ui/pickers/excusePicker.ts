/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the excuse picker dialog */
class ExcusePicker extends Picker
{
    private readonly domChooser : Chooser;

    constructor()
    {
        super('excuse', ['click']);

        this.domChooser          = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);

        RAG.database.excuses.forEach( v => this.domChooser.add(v) );
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        // Pre-select the currently used excuse
        this.domChooser.preselect(RAG.state.excuse);
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
        RAG.state.excuse = entry.innerText;
        RAG.views.editor.setElementsText('excuse', RAG.state.excuse);
    }
}