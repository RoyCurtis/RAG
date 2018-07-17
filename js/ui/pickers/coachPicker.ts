/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the coach picker dialog */
class CoachPicker extends Picker
{
    private readonly inputLetter : HTMLSelectElement;

    private currentCtx : string = '';

    constructor()
    {
        super('coach', ['change']);

        this.inputLetter = DOM.require('select', this.dom) as HTMLSelectElement;

        for (let i = 0; i < 26; i++)
        {
            let option = document.createElement('option');
            let letter = Phraser.LETTERS[i];

            option.text = option.value = letter;

            this.inputLetter.appendChild(option);
        }
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        this.currentCtx          = DOM.requireData(target, 'context');
        this.domHeader.innerText =
            `Pick a coach letter for the '${this.currentCtx}' context`;

        this.inputLetter.value = RAG.state.getCoach(this.currentCtx);
        this.inputLetter.focus();
    }

    protected onChange(_: Event) : void
    {
        RAG.state.setCoach(this.currentCtx, this.inputLetter.value);

        RAG.views.editor
            .getElementsByQuery(`[data-type=coach][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = this.inputLetter.value);
    }

    protected onInput(_: KeyboardEvent) : void
    {
        // no-op
    }
}