/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the service picker dialog */
class ServicePicker extends Picker
{
    /** Reference to container element for all the pickable services */
    private readonly inputService : HTMLElement;

    /** Currently selected service, if any */
    private domSelected? : HTMLElement;

    constructor()
    {
        super('service', ['click']);

        this.inputService = DOM.require('.picker', this.dom);

        RAG.database.services.forEach(value =>
        {
            let service = document.createElement('dd');

            service.innerText = value;
            service.title     = 'Click to select this service';
            service.tabIndex  = -1;

            this.inputService.appendChild(service);
        });
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        let value = RAG.state.service;

        // Pre-select the currently used service
        for (let key in this.inputService.children)
        {
            let service = this.inputService.children[key] as HTMLElement;

            if (value !== service.innerText)
                continue;

            this.visualSelect(service);
            service.focus();
            break;
        }
    }

    protected onChange(ev: Event) : void
    {
        let target = ev.target as HTMLElement;

        // Handle service being clicked
        if (target && target.parentElement === this.inputService)
            this.select(target);
    }

    protected onInput(_: KeyboardEvent) : void
    {
        // no-op
    }

    /** Visually changes the current selection, and updates the state and editor */
    private select(entry: HTMLElement) : void
    {
        this.visualSelect(entry);

        RAG.state.service = entry.innerText;
        RAG.views.editor.setElementsText('service', RAG.state.service);
    }

    /** Visually changes the currently selected element */
    private visualSelect(entry: HTMLElement) : void
    {
        if (this.domSelected)
        {
            this.domSelected.tabIndex = -1;
            this.domSelected.removeAttribute('selected');
        }

        this.domSelected          = entry;
        this.domSelected.tabIndex = 50;
        entry.setAttribute('selected', 'true');
    }
}