/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the time picker dialog */
class TimePicker extends Picker
{
    private readonly inputTime: HTMLInputElement;

    constructor()
    {
        super('time', ['change']);

        this.inputTime = DOM.require('input', this.dom) as HTMLInputElement;
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        this.inputTime.value = RAG.state.time;
        this.inputTime.focus();
    }

    protected onChange(_: Event) : void
    {
        RAG.state.time = this.inputTime.value;

        RAG.views.editor.setElementsText( 'time', RAG.state.time.toString() );
    }

    protected onInput(_: KeyboardEvent) : void
    {
        // no-op
    }
}