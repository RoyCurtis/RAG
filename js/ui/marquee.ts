/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the scrolling marquee */
class Marquee
{
    private dom     : HTMLElement;
    private domSpan : HTMLElement;

    private timer  : number = 0;
    private offset : number = 0;

    constructor()
    {
        this.dom     = DOM.require('#marquee');
        this.domSpan = document.createElement('span');

        this.dom.innerHTML = '';
        this.dom.appendChild(this.domSpan);
    }

    /** Sets the message on the scrolling marquee, and starts animating it */
    public set(msg: string) : void
    {
        window.cancelAnimationFrame(this.timer);

        this.domSpan.textContent = msg;
        this.offset              = this.dom.clientWidth;

        // I tried to use CSS animation for this, but couldn't figure out how for a
        // dynamically sized element like the span.
        let limit = -this.domSpan.clientWidth - 100;
        let anim  = () =>
        {
            this.offset -= 6;
            this.domSpan.style.transform = `translateX(${this.offset}px)`;

            if (this.offset < limit)
                this.domSpan.style.transform = '';
            else
                this.timer = window.requestAnimationFrame(anim);
        };

        anim();
    }

    /** Stops the current marquee animation */
    public stop() : void
    {
        window.cancelAnimationFrame(this.timer);
        this.domSpan.style.transform = '';
    }
}