/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the excuse picker dialog */
class ExcusePicker extends Picker
{
    private readonly domList : FilterableList;

    constructor()
    {
        super('excuse', ['click']);

        this.domList          = new FilterableList(this.domForm);
        this.domList.onSelect = e => this.onSelect(e);

        RAG.database.excuses.forEach( v => this.domList.add(v) );
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        // Pre-select the currently used excuse
        this.domList.preselect(RAG.state.excuse);
    }

    public close() : void
    {
        super.close();
        this.domList.onClose();
    }

    protected onChange(ev: Event) : void
    {
        this.domList.onChange(ev);
    }

    protected onInput(ev: KeyboardEvent) : void
    {
        this.domList.onInput(ev);
    }

    private onSelect(entry: HTMLElement) : void
    {
        RAG.state.excuse = entry.innerText;
        RAG.views.editor.setElementsText('excuse', RAG.state.excuse);
    }
}