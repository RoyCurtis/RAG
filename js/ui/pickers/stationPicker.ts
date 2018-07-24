/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the station picker dialog */
class StationPicker extends Picker
{
    protected static domChooser : StationChooser;

    protected currentCtx : string = '';

    protected onOpen : (target: HTMLElement) => void;

    constructor(tag: string = 'station')
    {
        super(tag, ['click']);

        if (!StationPicker.domChooser)
            StationPicker.domChooser = new StationChooser(this.domForm);

        this.onOpen = (target) =>
        {
            let chooser     = StationPicker.domChooser;
            this.currentCtx = DOM.requireData(target, 'context');

            chooser.attach(this, this.onSelectStation);
            chooser.preselectCode( RAG.state.getStation(this.currentCtx) );
            chooser.selectOnClick = true;

            this.domHeader.innerText =
                `Pick a station for the '${this.currentCtx}' context`;
        };
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);
        this.onOpen(target);
    }

    protected onChange(ev: Event) : void
    {
        StationPicker.domChooser.onChange(ev);
    }

    protected onInput(ev: KeyboardEvent) : void
    {
        StationPicker.domChooser.onInput(ev);
    }

    private onSelectStation(entry: HTMLElement) : void
    {
        let query = `[data-type=station][data-context=${this.currentCtx}]`;
        let code  = entry.dataset['code']!;
        let name  = RAG.database.getStation(code, true);

        RAG.state.setStation(this.currentCtx, code);
        RAG.views.editor
            .getElementsByQuery(query)
            .forEach(element => element.textContent = name);
    }
}