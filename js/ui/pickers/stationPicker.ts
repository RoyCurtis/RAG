/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the station picker dialog */
class StationPicker extends Picker
{
    protected static chooser : StationChooser;

    protected currentCtx : string = '';

    protected onOpen : (target: HTMLElement) => void;

    constructor(tag: string = 'station')
    {
        super(tag, ['click']);

        if (!StationPicker.chooser)
            StationPicker.chooser = new StationChooser(this.domForm);

        this.onOpen = this.onStationPickerOpen.bind(this);
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);
        this.onOpen(target);
    }

    protected onStationPickerOpen(target: HTMLElement) : void
    {
        let chooser     = StationPicker.chooser;
        this.currentCtx = DOM.requireData(target, 'context');

        chooser.attach(this, this.onSelectStation);
        chooser.preselectCode( RAG.state.getStation(this.currentCtx) );
        chooser.selectOnClick = true;

        this.domHeader.innerText =
            `Pick a station for the '${this.currentCtx}' context`;
    }

    protected onChange(ev: Event) : void
    {
        StationPicker.chooser.onChange(ev);
    }

    protected onInput(ev: KeyboardEvent) : void
    {
        StationPicker.chooser.onInput(ev);
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