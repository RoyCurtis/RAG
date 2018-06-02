/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="Picker.ts"/>

/** Controller for the platform picker dialog */
class PlatformPicker extends Picker
{
    private domForm     : HTMLFormElement;
    private inputDigit  : HTMLInputElement;
    private inputLetter : HTMLSelectElement;

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

    private onChange(ev: Event)
    {
        let elements = RAG.viewController.editor.getElements('platform');

        RAG.state.platform = [this.inputDigit.value, this.inputLetter.value];

        elements.forEach(element =>
        {
            element.textContent = RAG.state.platform.join('');
        });

        ev;
    }

    private onSubmit(ev: Event)
    {
        ev.preventDefault();
        this.onChange(ev);
    }
}