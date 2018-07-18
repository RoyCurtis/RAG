/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Base class for picker views */
abstract class Picker
{
    /** Reference to this picker's DOM element */
    public readonly dom     : HTMLElement;

    /** Reference to this picker's form DOM element */
    public readonly domForm : HTMLFormElement;

    /** Gets the name of the XML tag this picker handles */
    public readonly xmlTag  : string;

    /** Reference to the phrase element being edited by this picker */
    protected domEditing? : HTMLElement;

    /** Reference to this picker's header element */
    protected domHeader   : HTMLElement;

    /**
     * Creates a picker to handle the given phrase element type.
     *
     * @param {string} xmlTag Name of the XML tag this picker will handle.
     * @param {string[]} events List of events to trigger onChange, when data is changed
     */
    protected constructor(xmlTag: string, events: string[])
    {
        this.dom       = DOM.require(`#${xmlTag}Picker`);
        this.domForm   = DOM.require('form', this.dom);
        this.domHeader = DOM.require('header', this.dom);
        this.xmlTag    = xmlTag;

        // Self needed here, as 'this' breaks inside event delegates
        let self = this;

        events.forEach(event =>
        {
            self.domForm.addEventListener(event, self.onChange.bind(self))
        });

        this.domForm.onsubmit = ev =>
        {
            // TODO: this should be changed to a submit-and-close handler
            ev.preventDefault();
            self.onChange(ev);
        };

        this.domForm.onkeydown = self.onInput.bind(self);
    }

    /**
     * Open this picker for a given phrase element. The implementing picker should fill
     * its form elements with data from the current state and targeted element here.
     *
     * @param {HTMLElement} target Phrase element that this picker is being opened for
     */
    public open(target: HTMLElement) : void
    {
        this.dom.classList.remove('hidden');
        this.domEditing = target;
        this.layout();
    }

    /** Positions this picker relative to the target phrase element */
    public layout() : void
    {
        if (!this.domEditing)
            return;

        let rect      = this.domEditing.getBoundingClientRect();
        let fullWidth = this.dom.classList.contains('fullWidth');
        let midHeight = this.dom.classList.contains('midHeight');
        let dialogX   = (rect.left | 0) - 8;
        let dialogY   = rect.bottom | 0;
        let width     = (rect.width | 0) + 16;

        // Reset any height overrides
        this.dom.style.height = null;

        // Adjust if horizontally off screen
        if (!fullWidth)
        {
            // Force full width on mobile
            if (RAG.views.isMobile)
            {
                this.dom.style.width = `100%`;

                dialogX = 0;
            }
            else
            {
                this.dom.style.width    = `initial`;
                this.dom.style.minWidth = `${width}px`;

                if (dialogX + this.dom.offsetWidth > document.body.clientWidth)
                    dialogX = (rect.right | 0) - this.dom.offsetWidth + 8;
            }
        }

        // Handle pickers that aren't relative to selected element
        if (midHeight)
            dialogY = (this.dom.offsetHeight / 4) | 0;

        // Adjust if vertically off screen
        else if (dialogY + this.dom.offsetHeight > document.body.clientHeight)
        {
            dialogY = (rect.top | 0) - this.dom.offsetHeight + 1;
            this.domEditing.classList.add('below');

            // Resize if dialog is still off-screen
            if (dialogY < 0)
            {
                this.dom.style.height = (this.dom.offsetHeight + dialogY) + 'px';

                dialogY = 0;
            }
        }
        else
            this.domEditing.classList.add('above');

        this.dom.style.transform = fullWidth
            ? `translateY(${dialogY}px)`
            : `translate(${dialogX}px, ${dialogY}px)`;
    }

    /** Closes this picker */
    public close() : void
    {
        // Fix keyboard staying open in iOS on close
        DOM.blurActive(this.dom);

        this.dom.classList.add('hidden');
    }

    /**
     * Called when data changes. The implementing picker should update all linked elements
     * (e.g. of same type) with the new data here.
     */
    protected abstract onChange(ev: Event) : void;

    /** Called when a key is pressed whilst the picker's form is focused. */
    protected abstract onInput(ev: KeyboardEvent) : void;
}