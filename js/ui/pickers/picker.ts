/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Base class for picker views */
abstract class Picker
{
    /** Reference to this picker's DOM element */
    public readonly dom       : HTMLElement;
    /** Reference to this picker's form DOM element */
    public readonly domForm   : HTMLFormElement;
    /** Reference to this picker's header element */
    public readonly domHeader : HTMLElement;
    /** Gets the name of the XML tag this picker handles */
    public readonly xmlTag    : string;

    /** Reference to the phrase element being edited by this picker */
    protected domEditing? : HTMLElement;

    /**
     * Creates a picker to handle the given phrase element type.
     *
     * @param {string} xmlTag Name of the XML tag this picker will handle.
     */
    protected constructor(xmlTag: string)
    {
        this.dom       = DOM.require(`#${xmlTag}Picker`);
        this.domForm   = DOM.require('form',   this.dom);
        this.domHeader = DOM.require('header', this.dom);
        this.xmlTag    = xmlTag;

        this.domForm.onchange  = this.onChange.bind(this);
        this.domForm.oninput   = this.onChange.bind(this);
        this.domForm.onclick   = this.onClick.bind(this);
        this.domForm.onkeydown = this.onInput.bind(this);
        this.domForm.onsubmit  = this.onSubmit.bind(this);
    }

    /**
     * Called when data changes. The implementing picker should update all linked elements
     * (e.g. of same type) with the new data here.
     */
    protected abstract onChange(ev: Event) : void;

    /** Called when a mouse click happens anywhere in or on the picker's form */
    protected abstract onClick(ev: MouseEvent) : void;

    /** Called when a key is pressed whilst the picker's form is focused */
    protected abstract onInput(ev: KeyboardEvent) : void;

    /**
     * Called when ENTER is pressed whilst a form control of the picker is focused.
     * By default, this will trigger the onChange handler and close the dialog.
     */
    protected onSubmit(ev: Event) : void
    {
        ev.preventDefault();
        this.onChange(ev);
        RAG.views.editor.closeDialog();
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

    /** Closes this picker */
    public close() : void
    {
        // Fix keyboard staying open in iOS on close
        DOM.blurActive(this.dom);

        this.dom.classList.add('hidden');
    }

    /** Positions this picker relative to the target phrase element */
    public layout() : void
    {
        if (!this.domEditing)
            return;

        let targetRect = this.domEditing.getBoundingClientRect();
        let fullWidth  = this.dom.classList.contains('fullWidth');
        let isModal    = this.dom.classList.contains('modal');
        let docW       = document.body.clientWidth;
        let docH       = document.body.clientHeight;
        let dialogX    = (targetRect.left   | 0) - 8;
        let dialogY    =  targetRect.bottom | 0;
        let dialogW    = (targetRect.width  | 0) + 16;

        // Adjust if horizontally off screen
        if (!fullWidth && !isModal)
        {
            // Force full width on mobile
            if (DOM.isMobile)
            {
                this.dom.style.width = `100%`;

                dialogX = 0;
            }
            else
            {
                this.dom.style.width    = `initial`;
                this.dom.style.minWidth = `${dialogW}px`;

                if (dialogX + this.dom.offsetWidth > docW)
                    dialogX = (targetRect.right | 0) - this.dom.offsetWidth + 8;
            }
        }

        // Handle pickers that instead take up the whole display. CSS isn't used here,
        // because percentage-based left/top causes subpixel issues on Chrome.
        if (isModal)
        {
            dialogX = DOM.isMobile ? 0 :
                ( (docW  * 0.1) / 2 ) | 0;

            dialogY = DOM.isMobile ? 0 :
                ( (docH * 0.1) / 2 ) | 0;
        }

        // Clamp to top edge of document
        else if (dialogY < 0)
            dialogY = 0;

        // Adjust if vertically off screen
        else if (dialogY + this.dom.offsetHeight > docH)
        {
            dialogY = (targetRect.top | 0) - this.dom.offsetHeight + 1;
            this.domEditing.classList.add('below');
            this.domEditing.classList.remove('above');

            // If still off-screen, clamp to bottom
            if (dialogY + this.dom.offsetHeight > docH)
                dialogY = docH - this.dom.offsetHeight;

            // Clamp to top edge of document. Likely happens if target element is large.
            if (dialogY < 0)
                dialogY = 0;
        }
        else
        {
            this.domEditing.classList.add('above');
            this.domEditing.classList.remove('below');
        }

        this.dom.style.left = (fullWidth ? 0 : dialogX) + 'px';
        this.dom.style.top  = dialogY + 'px';
    }

    /** Returns true if an element in this picker currently has focus */
    public hasFocus() : boolean
    {
        return this.dom.contains(document.activeElement);
    }
}