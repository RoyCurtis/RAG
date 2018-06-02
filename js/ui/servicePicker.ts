/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="Picker.ts"/>

/** Controller for the time picker dialog */
class ServicePicker extends Picker
{
    private readonly domForm:      HTMLFormElement;
    private readonly domChoices:   HTMLOptionElement[];
    private readonly inputService: HTMLElement;

    private domSelected?: HTMLOptionElement;

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

            this.select(service);
            return true;
        });
    }

    private select(option: HTMLOptionElement)
    {
        if (this.domSelected)
            this.domSelected.removeAttribute('selected');

        this.domSelected = option;
        option.setAttribute('selected', 'true');
    }

    private onChange(ev: Event)
    {
        let target = ev.target as HTMLOptionElement;

        // Ignore if option element wasn't clicked
        if (!target || !target.value)
            return;
        else
            this.select(target);

        RAG.state.service = target.value;
        RAG.viewController.editor.setElementsText('service', RAG.state.service);
    }

    private onSubmit(ev: Event)
    {
        ev.preventDefault();
        this.onChange(ev);
    }
}