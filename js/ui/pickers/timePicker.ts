/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the time picker dialog */
class TimePicker extends Picker
{
    /** Reference to this picker's time input control */
    private readonly inputTime: HTMLInputElement;

    /** Holds the context for the current time element being edited */
    private currentCtx : string = '';

    public constructor()
    {
        super('time');

        this.inputTime = DOM.require('input', this.dom);
    }

    /** Populates the form with the current state's time */
    public open(target: HTMLElement) : void
    {
        super.open(target);

        this.currentCtx          = DOM.requireData(target, 'context');
        this.domHeader.innerText = L.HEADER_TIME(this.currentCtx);

        this.inputTime.value = RAG.state.getTime(this.currentCtx);
        this.inputTime.focus();
    }

    /** Updates the time element and state currently being edited */
    protected onChange(_: Event) : void
    {
        if (!this.currentCtx)
            throw Error(L.P_TIME_MISSING_STATE);

        RAG.state.setTime(this.currentCtx, this.inputTime.value);
        RAG.views.editor
            .getElementsByQuery(`[data-type=time][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = this.inputTime.value);
    }

    protected onClick(_: MouseEvent)    : void { /* no-op */ }
    protected onInput(_: KeyboardEvent) : void { /* no-op */ }
}