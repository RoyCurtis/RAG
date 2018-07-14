/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the excuse picker dialog */
class ExcusePicker extends Picker
{
    private readonly domChoices:   HTMLOptionElement[];
    private readonly inputService: HTMLElement;

    private domSelected?: HTMLOptionElement;

    constructor()
    {
        super('excuse', ['click']);

        this.domChoices   = [];
        this.inputService = DOM.require('.picker', this.dom);

        RAG.database.excuses.forEach(value =>
        {
            let excuse = document.createElement('option');

            excuse.text  = value;
            excuse.value = value;
            excuse.title = value;

            this.domChoices.push(excuse);
            this.inputService.appendChild(excuse);
        });
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        let value = RAG.state.excuse;

        this.domChoices.some(excuse =>
        {
            if (value !== excuse.value)
                return false;

            this.select(excuse);
            return true;
        });
    }

    protected onChange(ev: Event)
    {
        let target = ev.target as HTMLOptionElement;

        // Ignore if option element wasn't clicked
        if (!target || !target.value)
            return;
        else
            this.select(target);

        RAG.state.excuse = target.value;
        RAG.views.editor.setElementsText('excuse', RAG.state.excuse);
    }

    protected onInput(_: KeyboardEvent) : void
    {
        // no-op
    }

    private select(option: HTMLOptionElement) : void
    {
        if (this.domSelected)
            this.domSelected.removeAttribute('selected');

        this.domSelected = option;
        option.setAttribute('selected', 'true');
    }
}