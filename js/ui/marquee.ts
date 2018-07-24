/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the scrolling marquee */
class Marquee
{
    private readonly dom     : HTMLElement;
    private readonly domSpan : HTMLElement;

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
        let last  = 0;
        let limit = -this.domSpan.clientWidth - 100;
        let anim  = (time: number) =>
        {
            // At 60 FPS, the marquee must scroll 7px per frame. So to calculate how many
            // pixels per ms, we take 1000 ms / 60 fps, then divide 7px by that. On a
            // smaller display, this step amount becomes smaller.
            let stepPerMs = (DOM.isMobile ? 5 : 7) / (1000 / 60);

            this.offset -= (last == 0)
                ? (DOM.isMobile ? 5 : 7)
                : (time - last) * stepPerMs;

            this.domSpan.style.transform = `translateX(${this.offset}px)`;

            if (this.offset < limit)
                this.domSpan.style.transform = '';
            else
            {
                last       = time;
                this.timer = window.requestAnimationFrame(anim);
            }
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