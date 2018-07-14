/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the integer picker dialog */
class IntegerPicker extends Picker
{
    private readonly inputDigit : HTMLInputElement;
    private readonly domLabel   : HTMLLabelElement;

    private min?      : number;
    private max?      : number;
    private id?       : string;
    private singular? : string;
    private plural?   : string;
    private words?    : boolean;

    constructor()
    {
        // TODO: make it so all pickers auto-focus control on open
        super('integer', ['change']);

        this.inputDigit = DOM.require('input', this.dom) as HTMLInputElement;
        this.domLabel   = DOM.require('label', this.dom) as HTMLLabelElement;
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        let min = DOM.requireData(target, 'min');
        let max = DOM.requireData(target, 'max');

        this.min      = parseInt(min);
        this.max      = parseInt(max);
        this.id       = DOM.requireData(target, 'id');
        this.singular = target.dataset['singular'];
        this.plural   = target.dataset['plural'];
        this.words    = Parse.boolean(target.dataset['words'] || 'false');

        let value = RAG.state.getInteger(this.id, this.min, this.max);

        if      (this.singular && value === 1)
            this.domLabel.innerText = this.singular;
        else if (this.plural && value !== 1)
            this.domLabel.innerText = this.plural;
        else
            this.domLabel.innerText = '';

        this.inputDigit.min   = min;
        this.inputDigit.max   = max;
        this.inputDigit.value = value.toString();
        this.inputDigit.focus();
    }

    protected onChange(_: Event) : void
    {
        if (!this.id)
            throw new Error("onChange fired for integer picker without state");

        let int    = parseInt(this.inputDigit.value);
        let intStr = (this.words)
            ? Phraser.DIGITS[int]
            : int.toString();

        if (int === 1 && this.singular)
        {
            intStr += ` ${this.singular}`;
            this.domLabel.innerText = this.singular;
        }
        else if (int !== 1 && this.plural)
        {
            intStr += ` ${this.plural}`;
            this.domLabel.innerText = this.plural;
        }

        RAG.state.setInteger(this.id, int);
        RAG.views.editor
            .getElementsByQuery(`[data-type=integer][data-id=${this.id}]`)
            .forEach(element => element.textContent = intStr);
    }

    protected onInput(_: KeyboardEvent) : void
    {
        // no-op
    }
}