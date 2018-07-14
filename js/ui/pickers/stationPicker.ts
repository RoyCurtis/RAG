/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the station picker dialog */
class StationPicker extends Picker
{
    private currentContext : string = '';

    constructor()
    {
        super('station', ['click', 'input']);
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        this.currentContext = DOM.requireData(target, 'context');

        RAG.views.stationList.attach(this);
        RAG.views.stationList.selectCode( RAG.state.getStation(this.currentContext) );
    }

    protected onChange(ev: Event) : void
    {
        let self  = this;
        let query = `[data-type=station][data-context=${this.currentContext}]`;

        RAG.views.stationList.onChange(ev, target =>
        {
            RAG.views.stationList.selectEntry(target);

            RAG.state.setStation(self.currentContext, target.dataset['code']!);
            RAG.views.editor
                .getElementsByQuery(query)
                .forEach(element => element.textContent = target.innerText);
        });
    }

    protected onInput(_: KeyboardEvent) : void
    {
        // no-op
    }
}