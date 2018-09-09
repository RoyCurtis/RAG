/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the phraseset picker dialog */
class PhrasesetPicker extends Picker
{
    /** Reference to this picker's chooser control */
    private readonly domChooser : Chooser;

    /** Holds the reference tag for the current phraseset element being edited */
    private currentRef : string = '';

    public constructor()
    {
        super('phraseset');

        this.domChooser          = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
    }

    /** Populates the chooser with the current phraseset's list of phrases */
    public open(target: HTMLElement) : void
    {
        super.open(target);

        let ref       = DOM.requireData(target, 'ref');
        let idx       = parseInt( DOM.requireData(target, 'idx') );
        let phraseset = assert( RAG.database.getPhraseset(ref)! );

        this.currentRef          = ref;
        this.domHeader.innerText = L.HEADER_PHRASESET(ref);

        this.domChooser.clear();

        // For each phrase, we need to run it through the phraser using the current state
        // to generate "previews" of how the phrase will look.
        for (let i = 0; i < phraseset.children.length; i++)
        {
            let phrase = document.createElement('dd');

            DOM.cloneInto(phraseset.children[i] as HTMLElement, phrase);
            RAG.phraser.process(phrase);

            phrase.innerText   = DOM.getCleanedVisibleText(phrase);
            phrase.dataset.idx = i.toString();

            this.domChooser.addRaw(phrase, i === idx);
        }
    }

    /** Close this picker */
    public close() : void
    {
        super.close();
        this.domChooser.onClose();
    }

    // Forward these events to the chooser
    protected onChange(_: Event)         : void { /** NO-OP */ }
    protected onClick(ev: MouseEvent)    : void { this.domChooser.onClick(ev);  }
    protected onInput(ev: KeyboardEvent) : void { this.domChooser.onInput(ev);  }
    protected onSubmit(ev: Event)        : void { this.domChooser.onSubmit(ev); }

    /** Handles chooser selection by updating the phraseset element and state */
    private onSelect(entry: HTMLElement) : void
    {
        let idx = parseInt(entry.dataset['idx']!);

        RAG.state.setPhrasesetIdx(this.currentRef, idx);
        RAG.views.editor.closeDialog();
        RAG.views.editor.refreshPhraseset(this.currentRef);
    }
}