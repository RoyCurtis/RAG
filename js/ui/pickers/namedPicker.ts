/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the named train picker dialog */
class NamedPicker extends Picker
{
    private readonly domList : FilterableList;

    constructor()
    {
        super('named', ['click']);

        this.domList          = new FilterableList(this.domForm);
        this.domList.onSelect = e => this.onSelect(e);

        RAG.database.named.forEach( v => this.domList.add(v) );
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        // Pre-select the currently used name
        this.domList.preselect(RAG.state.named);
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
        RAG.state.named = entry.innerText;
        RAG.views.editor.setElementsText('named', RAG.state.named);
    }
}