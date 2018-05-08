/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Manages UI elements and their logic */
class ViewController
{
    public readonly platformPicker : PlatformPicker;
    public readonly timePicker     : TimePicker;
    public readonly toolbar        : Toolbar;

    private domEditor      : HTMLElement;
    private domSignage     : HTMLElement;
    private domSignageSpan : HTMLElement;

    private signageTimer  : number = 0;
    private signageOffset : number = 0;

    constructor()
    {
        this.platformPicker = new PlatformPicker();
        this.timePicker     = new TimePicker();
        this.toolbar        = new Toolbar();

        this.domEditor      = DOM.require('#editor');
        this.domSignage     = DOM.require('#signage');
        this.domSignageSpan = document.createElement('span');

        this.domSignage.innerHTML = '';
        this.domSignage.appendChild(this.domSignageSpan);

        this.domEditor.textContent      = "Please wait...";
        this.domSignageSpan.textContent = "Please wait...";
    }

    /** Sets the message on the scrolling marquee, and starts animating it */
    public setMarquee(msg: string) : void
    {
        window.cancelAnimationFrame(this.signageTimer);

        this.domSignageSpan.textContent = msg;
        this.signageOffset              = this.domSignage.clientWidth;

        // I tried to use CSS animation for this, but couldn't figure out how for a
        // dynamically sized element like the span.
        let limit = -this.domSignageSpan.clientWidth - 100;
        let anim  = () =>
        {
            this.signageOffset -= 6;
            this.domSignageSpan.style.transform = `translateX(${this.signageOffset}px)`;

            if (this.signageOffset < limit)
                this.domSignageSpan.style.transform = '';
            else
                this.signageTimer = window.requestAnimationFrame(anim);
        };

        anim();
    }

    /** Stops the current marquee animation */
    public stopMarquee() : void
    {
        window.cancelAnimationFrame(this.signageTimer);
        this.domSignageSpan.style.transform = '';
    }

    public getEditor() : HTMLElement
    {
        return this.domEditor;
    }
}