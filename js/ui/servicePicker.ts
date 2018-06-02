/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="Picker.ts"/>

/** Controller for the time picker dialog */
class ServicePicker extends Picker
{
    private domForm:      HTMLFormElement;
    private domChoices:   HTMLOptionElement[];
    private inputService: HTMLElement;

    constructor()
    {
        super('service');
        let self = this;

        this.domForm      = DOM.require('form', this.dom) as HTMLFormElement;
        this.domChoices   = [];
        this.inputService = DOM.require('.picker', this.dom);

        RAG.database.services.forEach(value =>
        {
            let service = document.createElement('option');

            service.text  = value;
            service.value = value;
            service.title = value;

            this.domChoices.push(service);
            this.inputService.appendChild(service);
        });

        // Self needed here, as 'this' breaks inside event delegates
        this.domForm.onclick  = ev => self.onChange(ev);
        this.domForm.onsubmit = ev => self.onSubmit(ev);
    }

    public open(target: HTMLElement)
    {
        super.open(target);

        let value = RAG.state.service;

        this.domChoices.some(service =>
        {
            if (value !== service.value)
                return false;

            service.setAttribute('selected', 'true');
            return true;
        });
    }

    private onChange(ev: Event)
    {
        let target   = ev.target as HTMLSelectElement;
        let elements = RAG.viewController.editor.getElements('service');

        if (!target || target !instanceof HTMLSelectElement)
            return;

        RAG.state.service = target.value;

        // TODO: cheaper way to do this?
        this.domChoices.forEach(service => {
            service.removeAttribute('selected');
        });

        elements.forEach(element =>
        {
            element.textContent = RAG.state.service;
        });

        ev;
    }

    private onSubmit(ev: Event)
    {
        ev.preventDefault();
        this.onChange(ev);
    }
}