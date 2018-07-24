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

        this.inputDigit  = DOM.require('input', this.dom);
        this.inputLetter = DOM.require('select', this.dom);

        // iOS needs different type and pattern to show a numerical keyboard
        if (DOM.isiOS)
        {
            this.inputDigit.type    = 'tel';
            this.inputDigit.pattern = '[0-9]+';
        }
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        let value = RAG.state.platform;

        this.inputDigit.value  = value[0];
        this.inputLetter.value = value[1];
        this.inputDigit.focus();
    }

    protected onChange(_: Event) : void
    {
        RAG.state.platform = [this.inputDigit.value, this.inputLetter.value];

        RAG.views.editor.setElementsText( 'platform', RAG.state.platform.join('') );
    }

    protected onInput(_: KeyboardEvent) : void
    {
        // no-op
    }
}