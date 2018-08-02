/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the service picker dialog */
class ServicePicker extends Picker
{
    /** Reference to this picker's chooser control */
    private readonly domChooser : Chooser;

    public constructor()
    {
        super('service');

        this.domChooser          = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
        this.domHeader.innerText = L.HEADER_SERVICE();

        RAG.database.services.forEach( v => this.domChooser.add(v) );
    }

    /** Populates the chooser with the current state's service */
    public open(target: HTMLElement) : void
    {
        super.open(target);

        // Pre-select the currently used service
        this.domChooser.preselect(RAG.state.service);
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

    /** Handles chooser selection by updating the service element and state */
    private onSelect(entry: HTMLElement) : void
    {
        RAG.state.service = entry.innerText;
        RAG.views.editor.setElementsText('service', RAG.state.service);
    }
}