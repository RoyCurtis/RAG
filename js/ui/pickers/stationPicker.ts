/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the station picker dialog */
class StationPicker extends Picker
{
    /** Reference to this picker's shared station chooser control */
    protected static chooser : StationChooser;

    /** Holds the context for the current station element being edited */
    protected currentCtx : string = '';
    /** Holds the onOpen delegate for StationPicker or for StationListPicker */
    protected onOpen     : (target: HTMLElement) => void;

    public constructor(tag: string = 'station')
    {
        super(tag);

        if (!StationPicker.chooser)
            StationPicker.chooser = new StationChooser(this.domForm);

        this.onOpen = this.onStationPickerOpen.bind(this);
    }

    /** Fires the onOpen delegate registered for this picker */
    public open(target: HTMLElement) : void
    {
        super.open(target);
        this.onOpen(target);
    }

    /** Attaches the station chooser and focuses it onto the current element's station */
    protected onStationPickerOpen(target: HTMLElement) : void
    {
        let chooser     = StationPicker.chooser;
        this.currentCtx = DOM.requireData(target, 'context');

        chooser.attach(this, this.onSelectStation);
        chooser.preselectCode( RAG.state.getStation(this.currentCtx) );
        chooser.selectOnClick = true;

        this.domHeader.innerText = L.HEADER_STATION(this.currentCtx);
    }

    // Forward these events to the station chooser
    protected onChange(_: Event)         : void { /** NO-OP */ }
    protected onClick(ev: MouseEvent)    : void { StationPicker.chooser.onClick(ev); }
    protected onInput(ev: KeyboardEvent) : void { StationPicker.chooser.onInput(ev); }
    protected onSubmit(ev: Event)        : void { StationPicker.chooser.onSubmit(ev); }

    /** Handles chooser selection by updating the station element and state */
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