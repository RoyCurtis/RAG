/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the platform picker dialog */
class PlatformPicker extends Picker
{
    private readonly inputDigit  : HTMLInputElement;
    private readonly inputLetter : HTMLSelectElement;

    constructor()
    {
        super('platform', ['change']);

        this.inputDigit  = DOM.require('input', this.dom)  as HTMLInputElement;
        this.inputLetter = DOM.require('select', this.dom) as HTMLSelectElement;
    }

    public open(target: HTMLElement)
    {
        super.open(target);

        let value = RAG.state.platform;

        this.inputDigit.value  = value[0];
        this.inputLetter.value = value[1];
        this.inputDigit.focus();
    }

    protected onChange(_: Event)
    {
        RAG.state.platform = [this.inputDigit.value, this.inputLetter.value];

        RAG.views.editor.setElementsText( 'platform', RAG.state.platform.join('') );
    }
}