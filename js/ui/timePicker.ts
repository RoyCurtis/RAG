/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the time picker dialog */
class TimePicker
{
    private dom:       HTMLElement;
    private domForm:   HTMLFormElement;
    private inputTime: HTMLInputElement;
    private editing?:  HTMLElement;

    constructor()
    {
        let self = this;

        this.dom       = DOM.require('#timePicker');
        this.domForm   = DOM.require('form', this.dom)   as HTMLFormElement;
        this.inputTime = DOM.require('input', this.dom)  as HTMLInputElement;

        // Self needed here, as 'this' breaks inside event delegates
        this.domForm.onchange = ev => self.onChange(ev);
        this.domForm.onsubmit = ev => self.onSubmit(ev);
    }

    public onClick(ev: Event, ctx: PhraseContext)
    {
        ev.stopPropagation();

        if (this.editing)
        {
            this.editing.removeAttribute('editing');

            if (ev.target === this.editing)
            {
                this.editing = undefined;
                this.dom.classList.add('hidden');
                return;
            }
        }

        this.dom.classList.remove('hidden');
        ctx.newElement.setAttribute('editing', 'true');

        this.editing = ev.target! as HTMLElement;
        let rect     = ctx.newElement.getBoundingClientRect();
        let dialogX  = (rect.left | 0) - 8;
        let dialogY  = rect.bottom | 0;
        let width    = (rect.width | 0) + 16;
        let value    = RAG.state.time;

        this.dom.style.minWidth = `${width}px`;
        this.inputTime.value    = value;

        // Adjust if off screen
        if (dialogX + this.dom.offsetWidth > document.body.clientWidth)
            dialogX = (rect.right | 0) - this.dom.offsetWidth + 8;

        this.dom.style.transform = `translate(${dialogX}px, ${dialogY}px)`;
    }

    private onChange(ev: Event)
    {
        let elements = RAG.viewController.getEditor()
            .querySelectorAll('span[data-type=time]');

        RAG.state.time = this.inputTime.value;

        elements.forEach(element =>
        {
            element.textContent = RAG.state.time.toString();
        });

        ev;
    }

    private onSubmit(ev: Event)
    {
        ev.preventDefault();
        this.onChange(ev);
    }
}