/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the phraseset picker dialog */
class PhrasesetPicker extends Picker
{
    private readonly domList : FilterableList;

    private currentRef? : string;

    constructor()
    {
        super('phraseset', ['click']);

        this.domList          = new FilterableList(this.domForm);
        this.domList.onSelect = e => this.onSelect(e);
    }

    public open(target: HTMLElement) : void
    {
        super.open(target);

        let ref = DOM.requireData(target, 'ref');
        let idx = parseInt( DOM.requireData(target, 'idx') );

        let phraseSet = RAG.database.getPhraseset(ref);

        if (!phraseSet)
            throw new Error(`Phraseset '${ref}' doesn't exist`);

        this.currentRef          = ref;
        this.domHeader.innerText = `Pick a phrase for the '${ref}' section`;

        this.domList.clear();

        // For each phrase, we need to run it through the phraser using the current state
        // to generate "previews" of how the phrase will look.
        for (let i = 0; i < phraseSet.children.length; i++)
        {
            let phrase = document.createElement('dd');

            DOM.cloneInto(phraseSet.children[i] as HTMLElement, phrase);
            RAG.phraser.process(phrase);

            phrase.innerText   = DOM.getCleanedVisibleText(phrase);
            phrase.dataset.idx = i.toString();

            this.domList.addRaw(phrase, i === idx);
        }
    }

    public close() : void
    {
        super.close();
        this.domList.onClose();
    }

    protected onChange(ev: Event) : void
    {
        this.domList.onChange(ev);
    }

    protected onInput(ev: KeyboardEvent) : void
    {
        this.domList.onInput(ev);
    }

    private onSelect(entry: HTMLElement) : void
    {
        if (!this.currentRef)
            throw new Error("Got select event when currentRef is unset");

        let idx = parseInt(entry.dataset['idx']!);

        RAG.state.setPhrasesetIdx(this.currentRef, idx);
        RAG.views.editor.closeDialog();
        RAG.views.editor.refreshPhraseset(this.currentRef);
    }
}