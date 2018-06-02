/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="Picker.ts"/>

/** Controller for the platform picker dialog */
class PlatformPicker extends Picker
{
    private readonly domForm     : HTMLFormElement;
    private readonly inputDigit  : HTMLInputElement;
    private readonly inputLetter : HTMLSelectElement;

    constructor()
    {
        super('platform');
        let self = this;

        this.domForm     = DOM.require('form', this.dom)   as HTMLFormElement;
        this.inputDigit  = DOM.require('input', this.dom)  as HTMLInputElement;
        this.inputLetter = DOM.require('select', this.dom) as HTMLSelectElement;

        // Self needed here, as 'this' breaks inside event delegates
        this.domForm.onchange = ev => self.onChange(ev);
        this.domForm.onsubmit = ev => self.onSubmit(ev);
    }

    public open(target: HTMLElement)
    {
        super.open(target);

        let value = RAG.state.platform;

        this.inputDigit.value  = value[0];
        this.inputLetter.value = value[1];
    }

    private onChange(_: Event)
    {
        RAG.state.platform = [this.inputDigit.value, this.inputLetter.value];

        RAG.viewController.editor.setElementsText(
            'platform', RAG.state.platform.join('')
        );
    }

    private onSubmit(ev: Event)
    {
        ev.preventDefault();
        this.onChange(ev);
    }
}