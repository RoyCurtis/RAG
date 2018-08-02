/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the named train picker dialog */
class NamedPicker extends Picker
{
    /** Reference to this picker's chooser control */
    private readonly domChooser : Chooser;

    public constructor()
    {
        super('named');

        this.domChooser          = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
        this.domHeader.innerText = L.HEADER_NAMED();

        RAG.database.named.forEach( v => this.domChooser.add(v) );
    }

    /** Populates the chooser with the current state's named train */
    public open(target: HTMLElement) : void
    {
        super.open(target);

        // Pre-select the currently used name
        this.domChooser.preselect(RAG.state.named);
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

    /** Handles chooser selection by updating the named element and state */
    private onSelect(entry: HTMLElement) : void
    {
        RAG.state.named = entry.innerText;
        RAG.views.editor.setElementsText('named', RAG.state.named);
    }
}