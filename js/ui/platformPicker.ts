/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the platform picker dialog */
class PlatformPicker
{
    private dom:         HTMLElement;
    private domForm:     HTMLFormElement;
    private inputDigit:  HTMLInputElement;
    private inputLetter: HTMLSelectElement;
    private editing?:    HTMLElement;

    constructor()
    {
        let self = this;

        this.dom         = DOM.require('#platformPicker');
        this.domForm     = DOM.require('form', this.dom)   as HTMLFormElement;
        this.inputDigit  = DOM.require('input', this.dom)  as HTMLInputElement;
        this.inputLetter = DOM.require('select', this.dom) as HTMLSelectElement;

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
        let value    = RAG.state.getPlatform();

        this.inputDigit.value  = value.digit.toString();
        this.inputLetter.value = value.letter;

        // Adjust if off screen
        if (dialogX + this.dom.offsetWidth > document.body.clientWidth)
        {
            console.log("readjusting box", rect);
            dialogX = (rect.right | 0) - this.dom.offsetWidth + 8;
        }

        this.dom.style.transform = `translate(${dialogX}px, ${dialogY}px)`;
    }

    private onChange(ev: Event)
    {
        let elements = RAG.viewController.getEditor()
            .querySelectorAll('span[data-type=platform]');

        RAG.state.getPlatform().digit  = this.inputDigit.valueAsNumber;
        RAG.state.getPlatform().letter = this.inputLetter.value;

        elements.forEach(element =>
        {
            element.textContent = RAG.state.getPlatform().toString();
        });

        ev;
    }

    private onSubmit(ev: Event)
    {
        ev.preventDefault();
        this.onChange(ev);
    }
}