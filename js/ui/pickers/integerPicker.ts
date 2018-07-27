/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the integer picker dialog */
class IntegerPicker extends Picker
{
    /** Reference to this picker's numerical input spinner */
    private readonly inputDigit : HTMLInputElement;
    /** Reference to this picker's optional suffix label */
    private readonly domLabel   : HTMLLabelElement;

    /** Holds the context for the current integer element being edited */
    private currentCtx? : string;
    /** Holds the optional singular suffix for the current integer being edited */
    private singular?   : string;
    /** Holds the optional plural suffix for the current integer being edited */
    private plural?     : string;
    /** Whether the current integer being edited wants word digits */
    private words?      : boolean;

    public constructor()
    {
        super('integer');

        this.inputDigit = DOM.require('input', this.dom);
        this.domLabel   = DOM.require('label', this.dom);

        // iOS needs different type and pattern to show a numerical keyboard
        if (DOM.isiOS)
        {
            this.inputDigit.type    = 'tel';
            this.inputDigit.pattern = '[0-9]+';
        }
    }

    /** Populates the form with the target context's integer data */
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

        this.domHeader.innerText = L.HEADER_INTEGER(this.currentCtx);
        this.inputDigit.value    = value.toString();
        this.inputDigit.focus();
    }

    /** Updates the integer element and state currently being edited */
    protected onChange(_: Event) : void
    {
        if (!this.currentCtx)
            throw Error( L.P_INT_MISSING_STATE() );

        // Can't use valueAsNumber due to iOS input type workarounds
        let int    = parseInt(this.inputDigit.value);
        let intStr = (this.words)
            ? L.DIGITS[int] || int.toString()
            : int.toString();

        // Ignore invalid values
        if ( isNaN(int) )
            return;

        this.domLabel.innerText = '';

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

    protected onClick(_: MouseEvent)    : void { /* no-op */ }
    protected onInput(_: KeyboardEvent) : void { /* no-op */ }
}