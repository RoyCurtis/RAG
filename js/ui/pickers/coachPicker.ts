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
            DOM.addOption(this.inputLetter, L.LETTERS[i], L.LETTERS[i]);
    }

    /** Populates the form with the target context's coach letter */
    public open(target: HTMLElement) : void
    {
        super.open(target);

        this.currentCtx          = DOM.requireData(target, 'context');
        this.domHeader.innerText = L.HEADER_COACH(this.currentCtx);

        this.inputLetter.value = RAG.state.getCoach(this.currentCtx);
        this.inputLetter.focus();
    }

    /** Updates the coach element and state currently being edited */
    protected onChange(_: Event) : void
    {
        if (!this.currentCtx)
            throw Error( L.P_COACH_MISSING_STATE() );

        RAG.state.setCoach(this.currentCtx, this.inputLetter.value);
        RAG.views.editor
            .getElementsByQuery(`[data-type=coach][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = this.inputLetter.value);
    }

    protected onClick(_: MouseEvent)    : void { /* no-op */ }
    protected onInput(_: KeyboardEvent) : void { /* no-op */ }
}