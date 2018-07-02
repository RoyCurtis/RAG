/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="Picker.ts"/>

/** Controller for the phraseset picker dialog */
class PhrasesetPicker extends Picker
{
    private readonly domHeader   : HTMLElement;
    private readonly inputPhrase : HTMLElement;

    private domSelected? : HTMLLIElement;
    private currentRef?  : string;

    constructor()
    {
        super('phraseset', ['click']);

        this.domHeader   = DOM.require('header', this.dom);
        this.inputPhrase = DOM.require('.picker', this.dom);
    }

    public open(target: HTMLElement)
    {
        super.open(target);

        let ref = DOM.requireData(target, 'ref');
        let idx = parseInt( DOM.requireData(target, 'idx') );

        let phraseSet = RAG.database.getPhraseset(ref!);

        if (!phraseSet)
            // TODO: handle missing phraseset
            return;

        this.currentRef            = ref;
        this.domHeader.innerText   = `Pick a phrase for the '${ref}' section`;
        this.inputPhrase.innerHTML = '';

        // For each phrase, we need to run it through the phraser using the current state
        // to generate "previews" of how the phrase will look.
        for (let i = 0; i < phraseSet.children.length; i++)
        {
            let phrase = document.createElement('li');

            DOM.cloneInto(phraseSet.children[i] as HTMLElement, phrase);
            RAG.phraser.process(phrase);

            phrase.innerText   = DOM.getCleanedVisibleText(phrase);
            phrase.dataset.idx = i.toString();

            this.inputPhrase.appendChild(phrase);

            if (i === idx)
                this.select(phrase);
        }
    }

    // TODO: this could be DRYed
    private select(option: HTMLLIElement)
    {
        if (this.domSelected)
            this.domSelected.removeAttribute('selected');

        this.domSelected = option;
        option.setAttribute('selected', 'true');
    }

    protected onChange(ev: Event)
    {
        let target = ev.target as HTMLLIElement;
        
        // Ignore if list element wasn't clicked
        if (!target || !target.dataset['idx'] || !this.currentRef)
            return;

        let idx = parseInt(target.dataset['idx']!);

        this.select(target);

        RAG.state.setPhrasesetIdx(this.currentRef, idx);
        RAG.views.editor.closeDialog();
        RAG.views.editor.refreshPhraseset(this.currentRef);
    }
}