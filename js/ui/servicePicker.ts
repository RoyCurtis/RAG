/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="Picker.ts"/>

/** Controller for the service picker dialog */
class ServicePicker extends Picker
{
    private readonly domChoices:   HTMLOptionElement[];
    private readonly inputService: HTMLElement;

    private domSelected?: HTMLOptionElement;

    constructor()
    {
        super('service', ['click']);

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

    protected onChange(ev: Event)
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
}