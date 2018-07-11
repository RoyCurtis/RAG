/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the coach picker dialog */
class CoachPicker extends Picker
{
    private readonly inputLetter : HTMLSelectElement;

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

    public open(target: HTMLElement)
    {
        super.open(target);

        this.inputLetter.value = RAG.state.coach;
    }

    protected onChange(_: Event)
    {
        RAG.state.coach = this.inputLetter.value;

        RAG.views.editor.setElementsText('coach', RAG.state.coach);
    }
}