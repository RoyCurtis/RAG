/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the service picker dialog */
class ServicePicker extends Picker
{
    private readonly domList : FilterableList;

    constructor()
    {
        super('service', ['click']);

        this.domList          = new FilterableList(this.domForm);
        this.domList.onSelect = e => this.onSelect(e);

        RAG.database.services.forEach( v => this.domList.add(v) );
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        // Pre-select the currently used service
        this.domList.preselect(RAG.state.service);
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
        RAG.state.service = entry.innerText;
        RAG.views.editor.setElementsText('service', RAG.state.service);
    }
}