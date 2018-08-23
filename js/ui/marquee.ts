/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the scrolling marquee */
class Marquee
{
    /** Reference to the marquee's DOM element */
    private readonly dom     : HTMLElement;
    /** Reference to the span element in the marquee, where the text is set */
    private readonly domSpan : HTMLElement;

    /** Reference ID for the scrolling animation timer */
    private timer  : number = 0;
    /** Current offset (in pixels) of the scrolling marquee */
    private offset : number = 0;

    public constructor()
    {
        this.dom     = DOM.require('#marquee');
        this.domSpan = document.createElement('span');

        this.dom.innerHTML = '';
        this.dom.appendChild(this.domSpan);
    }

    /** Sets the message on the scrolling marquee, and starts animating it */
    public set(msg: string, animate: boolean = true) : void
    {
        window.cancelAnimationFrame(this.timer);

        this.domSpan.textContent     = msg;
        this.domSpan.style.transform = '';

        if (!animate) return;

        // I tried to use CSS animation for this, but couldn't figure out how for a
        // dynamically sized element like the span.
        this.offset = this.dom.clientWidth;
        let limit   = -this.domSpan.clientWidth - 100;
        let anim    = () =>
        {
            this.offset                  -= 6;
            this.domSpan.style.transform  = `translateX(${this.offset}px)`;

            if (this.offset < limit)
                this.domSpan.style.transform = '';
            else
                this.timer = window.requestAnimationFrame(anim);
        };

        window.requestAnimationFrame(anim);
    }

    /** Stops the current marquee animation */
    public stop() : void
    {
        window.cancelAnimationFrame(this.timer);
        this.domSpan.style.transform = '';
    }
}