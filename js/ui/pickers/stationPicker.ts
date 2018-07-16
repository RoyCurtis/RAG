/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the station picker dialog */
class StationPicker extends Picker
{
    protected static domList : StationList;

    protected currentCtx : string = '';

    protected onOpen : (target: HTMLElement) => void;

    constructor(tag: string = 'station')
    {
        super(tag, ['click']);

        if (!StationPicker.domList)
            StationPicker.domList = new StationList(this.domForm);

        this.onOpen = (target) =>
        {
            this.currentCtx = DOM.requireData(target, 'context');

            StationPicker.domList.attach(this, this.onSelectStation);
            StationPicker.domList.preselectCode( RAG.state.getStation(this.currentCtx) );
            StationPicker.domList.selectOnClick = true;

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
        StationPicker.domList.onChange(ev);
    }

    protected onInput(ev: KeyboardEvent) : void
    {
        StationPicker.domList.onInput(ev);
    }

    private onSelectStation(entry: HTMLElement) : void
    {
        let query = `[data-type=station][data-context=${this.currentCtx}]`;

        RAG.state.setStation(this.currentCtx, entry.dataset['code']!);
        RAG.views.editor
            .getElementsByQuery(query)
            .forEach(element => element.textContent = entry.innerText);
    }
}