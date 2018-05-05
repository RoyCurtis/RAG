/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Manages UI elements and their logic */
class ViewController
{
    public isReady: boolean = false;

    private domEditor  : Element;
    private domSignage : Element;
    private domToolbar : Element;

    constructor()
    {
        this.domEditor  = DOM.require('#editor');
        this.domSignage = DOM.require('#signage');
        this.domToolbar = DOM.require('#toolbar');

        this.domEditor.textContent  = "Please wait...";
        this.domSignage.textContent = "Please wait...";
    }

    public setMarquee(msg: string)
    {
        this.domSignage.innerHTML = `<span>${msg}</span>`;
    }

    setEditor(element: Element)
    {
        this.domEditor.innerHTML = '';
        this.domEditor.appendChild(element);
    }
}