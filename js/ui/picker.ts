/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Base class for picker views */
abstract class Picker
{
    /** Reference to this picker's DOM element */
    public readonly dom : HTMLElement;

    /** Reference to this picker's form DOM element */
    public readonly domForm : HTMLElement;

    /** Gets the name of the XML tag this picker handles */
    public readonly xmlTag : string;

    /** Reference to the phrase element being edited by this picker */
    protected domEditing? : HTMLElement;

    /**
     * Creates a picker to handle the given phrase element type.
     *
     * @param {string} xmlTag Name of the XML tag this picker will handle.
     * @param {string[]} events List of events to react to, when data is changed
     */
    protected constructor(xmlTag: string, events: string[])
    {
        this.dom     = DOM.require(`#${xmlTag}Picker`);
        this.domForm = DOM.require('form', this.dom) as HTMLFormElement;
        this.xmlTag  = xmlTag;

        // Self needed here, as 'this' breaks inside event delegates
        let self = this;

        events.forEach(event =>
        {
            this.domForm.addEventListener(event, this.onChange.bind(self))
        });

        this.domForm.onsubmit = ev =>
        {
            ev.preventDefault();
            self.onChange(ev);
        };
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
        let dialogX   = (rect.left | 0) - 8;
        let dialogY   = rect.bottom | 0;
        let width     = (rect.width | 0) + 16;

        // Adjust if off screen
        if (!fullWidth)
        {
            this.dom.style.minWidth = `${width}px`;

            if (dialogX + this.dom.offsetWidth > document.body.clientWidth)
                dialogX = (rect.right | 0) - this.dom.offsetWidth + 8;
        }

        if (dialogY + this.dom.offsetHeight > document.body.clientHeight)
        {
            dialogY = (rect.top | 0) - this.dom.offsetHeight + 1;
            this.domEditing.classList.add('below');
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
        this.dom.classList.add('hidden');
    }

    /**
     * Called when data changes. The implementing picker should update all linked elements
     * (e.g. of same type) with the new data here.
     */
    protected abstract onChange(ev: Event) : void;
}