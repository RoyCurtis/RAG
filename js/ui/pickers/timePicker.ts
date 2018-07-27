/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the time picker dialog */
class TimePicker extends Picker
{
    /** Reference to this picker's time input control */
    private readonly inputTime: HTMLInputElement;

    public constructor()
    {
        super('time');

        this.inputTime           = DOM.require('input', this.dom);
        this.domHeader.innerText = L.HEADER_TIME();
    }

    /** Populates the form with the current state's time */
    public open(target: HTMLElement) : void
    {
        super.open(target);

        this.inputTime.value = RAG.state.time;
        this.inputTime.focus();
    }

    /** Updates the time element and state currently being edited */
    protected onChange(_: Event) : void
    {
        RAG.state.time = this.inputTime.value;

        RAG.views.editor.setElementsText( 'time', RAG.state.time.toString() );
    }

    protected onClick(_: MouseEvent)    : void { /* no-op */ }
    protected onInput(_: KeyboardEvent) : void { /* no-op */ }
}