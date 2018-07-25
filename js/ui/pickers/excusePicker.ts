/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the excuse picker dialog */
class ExcusePicker extends Picker
{
    /** Reference to this picker's chooser control */
    private readonly domChooser : Chooser;

    public constructor()
    {
        super('excuse');

        this.domChooser          = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);

        RAG.database.excuses.forEach( v => this.domChooser.add(v) );
    }

    /** Populates the chooser with the current state's excuse */
    public open(target: HTMLElement) : void
    {
        super.open(target);

        // Pre-select the currently used excuse
        this.domChooser.preselect(RAG.state.excuse);
    }

    /** Close this picker */
    public close() : void
    {
        super.close();
        this.domChooser.onClose();
    }

    // Forward these events to the chooser
    protected onChange(ev: Event)        : void { this.domChooser.onChange(ev); }
    protected onClick(ev: MouseEvent)    : void { this.domChooser.onClick(ev);  }
    protected onInput(ev: KeyboardEvent) : void { this.domChooser.onInput(ev);  }
    protected onSubmit(ev: Event)        : void { this.domChooser.onSubmit(ev); }

    /** Handles chooser selection by updating the excuse element and state */
    private onSelect(entry: HTMLElement) : void
    {
        RAG.state.excuse = entry.innerText;
        RAG.views.editor.setElementsText('excuse', RAG.state.excuse);
    }
}