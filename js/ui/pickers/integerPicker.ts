/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the integer picker dialog */
class IntegerPicker extends Picker
{
    private readonly inputDigit : HTMLInputElement;
    private readonly domLabel   : HTMLLabelElement;

    private currentCtx? : string;
    private singular?   : string;
    private plural?     : string;
    private words?      : boolean;

    constructor()
    {
        super('integer', ['change']);

        this.inputDigit = DOM.require('input', this.dom);
        this.domLabel   = DOM.require('label', this.dom);
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        this.currentCtx = DOM.requireData(target, 'context');
        this.singular   = target.dataset['singular'];
        this.plural     = target.dataset['plural'];
        this.words      = Parse.boolean(target.dataset['words'] || 'false');

        let value = RAG.state.getInteger(this.currentCtx);

        if      (this.singular && value === 1)
            this.domLabel.innerText = this.singular;
        else if (this.plural && value !== 1)
            this.domLabel.innerText = this.plural;
        else
            this.domLabel.innerText = '';

        this.domHeader.innerText = `Pick a number for the '${this.currentCtx}' part`;
        this.inputDigit.value    = value.toString();
        this.inputDigit.focus();
    }

    protected onChange(_: Event) : void
    {
        if (!this.currentCtx)
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

        RAG.state.setInteger(this.currentCtx, int);
        RAG.views.editor
            .getElementsByQuery(`[data-type=integer][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = intStr);
    }

    protected onInput(_: KeyboardEvent) : void
    {
        // no-op
    }
}