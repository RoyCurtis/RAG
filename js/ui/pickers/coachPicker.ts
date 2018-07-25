/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the coach picker dialog */
class CoachPicker extends Picker
{
    /** Reference to this picker's letter drop-down input control */
    private readonly inputLetter : HTMLSelectElement;

    /** Holds the context for the current coach element being edited */
    private currentCtx : string = '';

    public constructor()
    {
        super('coach');

        this.inputLetter = DOM.require('select', this.dom);

        for (let i = 0; i < 26; i++)
        {
            let option = document.createElement('option');
            let letter = Phraser.LETTERS[i];

            option.text = option.value = letter;

            this.inputLetter.appendChild(option);
        }
    }

    /** Populates the form with the target context's coach letter */
    public open(target: HTMLElement) : void
    {
        super.open(target);

        this.currentCtx          = DOM.requireData(target, 'context');
        this.domHeader.innerText =
            `Pick a coach letter for the '${this.currentCtx}' context`;

        this.inputLetter.value = RAG.state.getCoach(this.currentCtx);
        this.inputLetter.focus();
    }

    /** Updates the coach element and state currently being edited */
    protected onChange(_: Event) : void
    {
        RAG.state.setCoach(this.currentCtx, this.inputLetter.value);

        RAG.views.editor
            .getElementsByQuery(`[data-type=coach][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = this.inputLetter.value);
    }

    protected onClick(_: MouseEvent)    : void { /* no-op */ }
    protected onInput(_: KeyboardEvent) : void { /* no-op */ }
}