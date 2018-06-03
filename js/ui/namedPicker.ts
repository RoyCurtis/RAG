/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="Picker.ts"/>

/** Controller for the named train picker dialog */
class NamedPicker extends Picker
{
    private readonly domChoices: HTMLOptionElement[];
    private readonly inputNamed: HTMLElement;

    private domSelected?: HTMLOptionElement;

    constructor()
    {
        super('named', ['click']);

        this.domChoices = [];
        this.inputNamed = DOM.require('.picker', this.dom);

        RAG.database.named.forEach(value =>
        {
            let named = document.createElement('option');

            named.text  = value;
            named.value = value;
            named.title = value;

            this.domChoices.push(named);
            this.inputNamed.appendChild(named);
        });
    }

    public open(target: HTMLElement)
    {
        super.open(target);

        let value = RAG.state.named;

        this.domChoices.some(named =>
        {
            if (value !== named.value)
                return false;

            this.select(named);
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

        RAG.state.named = target.value;
        RAG.views.editor.setElementsText('named', RAG.state.named);
    }
}