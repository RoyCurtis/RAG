/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="Picker.ts"/>

/** Controller for the time picker dialog */
class TimePicker extends Picker
{
    private domForm:   HTMLFormElement;
    private inputTime: HTMLInputElement;

    constructor()
    {
        super('time');
        let self = this;

        this.domForm   = DOM.require('form', this.dom)  as HTMLFormElement;
        this.inputTime = DOM.require('input', this.dom) as HTMLInputElement;

        // Self needed here, as 'this' breaks inside event delegates
        this.domForm.onchange = ev => self.onChange(ev);
        this.domForm.onsubmit = ev => self.onSubmit(ev);
    }

    public open(target: HTMLElement)
    {
        super.open(target);

        this.inputTime.value = RAG.state.time;
    }

    private onChange(ev: Event)
    {
        let elements = RAG.viewController.editor.getElements('time');

        RAG.state.time = this.inputTime.value;

        elements.forEach(element =>
        {
            element.textContent = RAG.state.time.toString();
        });

        ev;
    }

    private onSubmit(ev: Event)
    {
        ev.preventDefault();
        this.onChange(ev);
    }
}