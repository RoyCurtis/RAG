/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the excuse picker dialog */
class ExcusePicker extends Picker
{
    /** Reference to container element for all the pickable excuses */
    private readonly inputService : HTMLElement;

    /** Currently selected excuse, if any */
    private domSelected? : HTMLOptionElement;

    constructor()
    {
        super('excuse', ['click']);

        this.inputService = DOM.require('.picker', this.dom);

        RAG.database.excuses.forEach(value =>
        {
            // TODO: Change this to dl and dd; option elements don't work on iOS
            let excuse = document.createElement('option');

            excuse.text     = value;
            excuse.value    = value;
            excuse.title    = value;
            excuse.tabIndex = -1;

            this.inputService.appendChild(excuse);
        });
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        let value = RAG.state.excuse;

        // Pre-select the currently used excuse
        for (let key in this.inputService.children)
        {
            let excuse = this.inputService.children[key] as HTMLOptionElement;

            if (value !== excuse.value)
                continue;

            this.visualSelect(excuse);
            excuse.focus();
            break;
        }
    }

    protected onChange(ev: Event)
    {
        let target = ev.target as HTMLOptionElement;

        // Ignore if option element wasn't clicked
        if (target && target.value)
            this.select(target);
    }

    protected onInput(ev: KeyboardEvent) : void
    {
        let key     = ev.key;
        let focused = document.activeElement;
        let next : HTMLElement;

        if (!focused)
            return;

        // Handle navigation when container is focused
        if (focused === this.inputService)
        {
            if      (key === 'ArrowLeft')
                next = focused.lastElementChild! as HTMLElement;
            else if (key === 'ArrowRight')
                next = focused.firstElementChild! as HTMLElement;
            else return;
        }

        // Handle navigation when item is focused
        else if (focused.parentElement === this.inputService)
        {
            if (key === 'Enter')
                return this.select(focused as HTMLOptionElement);

            // Wrap around when navigating past beginning or end of list
            else if (key === 'ArrowLeft')
                next = focused.previousElementSibling           as HTMLElement
                    || focused.parentElement!.lastElementChild! as HTMLElement;

            else if (key === 'ArrowRight')
                next = focused.nextElementSibling                as HTMLElement
                    || focused.parentElement!.firstElementChild! as HTMLElement;

            else return;
        }
        
        else return;

        next.focus();
    }

    /** Visually changes the current selection, and updates the state and editor */
    private select(option: HTMLOptionElement) : void
    {
        this.visualSelect(option);

        RAG.state.excuse = option.value;
        RAG.views.editor.setElementsText('excuse', RAG.state.excuse);
    }

    /** Visually changes the currently selected element */
    private visualSelect(option: HTMLOptionElement) : void
    {
        if (this.domSelected)
            this.domSelected.removeAttribute('selected');

        this.domSelected = option;
        option.setAttribute('selected', 'true');
    }
}