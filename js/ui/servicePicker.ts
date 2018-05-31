/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="Picker.ts"/>

/** Controller for the time picker dialog */
class ServicePicker extends Picker
{
    private dom:          HTMLElement;
    private domForm:      HTMLFormElement;
    private domChoices:   HTMLOptionElement[];
    private inputService: HTMLElement;
    private editing?:     HTMLElement;

    constructor()
    {
        super();
        let self = this;

        this.dom          = DOM.require('#servicePicker');
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

    public onClick(ev: Event, ctx: PhraseContext)
    {
        ev.stopPropagation();

        if (this.editing)
        {
            this.editing.removeAttribute('editing');

            if (ev.target === this.editing)
            {
                this.editing = undefined;
                this.dom.classList.add('hidden');
                return;
            }
        }

        this.dom.classList.remove('hidden');
        ctx.newElement.setAttribute('editing', 'true');

        this.editing = ev.target! as HTMLElement;
        let rect     = ctx.newElement.getBoundingClientRect();
        let dialogY  = rect.bottom | 0;
        let value    = RAG.state.service;

        // Adjust if off screen
        if (dialogY + this.dom.offsetHeight > document.body.clientHeight)
        {
            dialogY = (rect.top | 0) - this.dom.offsetHeight;
            ctx.newElement.classList.add('below');
        }
        else
            ctx.newElement.classList.add('above');

        //todo: select current value
        this.dom.style.transform = `translateY(${dialogY}px)`;

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
        let elements = RAG.viewController.getEditor()
            .querySelectorAll('span[data-type=service]');

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