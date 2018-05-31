/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="Picker.ts"/>

/** Controller for the platform picker dialog */
class PlatformPicker extends Picker
{
    private dom:         HTMLElement;
    private domForm:     HTMLFormElement;
    private inputDigit:  HTMLInputElement;
    private inputLetter: HTMLSelectElement;
    private editing?:    HTMLElement;

    constructor()
    {
        super();
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
        let value    = RAG.state.platform;

        this.inputDigit.value  = value[0];
        this.inputLetter.value = value[1];

        // Adjust if off screen
        if (dialogX + this.dom.offsetWidth > document.body.clientWidth)
            dialogX = (rect.right | 0) - this.dom.offsetWidth + 8;

        this.dom.style.transform = `translate(${dialogX}px, ${dialogY}px)`;
    }

    private onChange(ev: Event)
    {
        let elements = RAG.viewController.getEditor()
            .querySelectorAll('span[data-type=platform]');

        RAG.state.platform = [this.inputDigit.value, this.inputLetter.value];

        elements.forEach(element =>
        {
            element.textContent = RAG.state.platform.join('');
        });

        ev;
    }

    private onSubmit(ev: Event)
    {
        ev.preventDefault();
        this.onChange(ev);
    }
}