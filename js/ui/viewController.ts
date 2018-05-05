/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Manages UI elements and their logic */
class ViewController
{
    private domEditor      : Element;
    private domSignage     : Element;
    private domSignageSpan : HTMLElement;
    private domToolbar     : Element;

    private btnPlay     : HTMLElement;
    private btnGenerate : HTMLElement;
    private btnSave     : HTMLElement;
    private btnRecall   : HTMLElement;
    private btnOption   : HTMLElement;

    private signageTimer  : number = 0;
    private signageOffset : number = 0;

    constructor()
    {
        this.domEditor      = DOM.require('#editor');
        this.domSignage     = DOM.require('#signage');
        this.domToolbar     = DOM.require('#toolbar');
        this.domSignageSpan = document.createElement('span');

        this.btnPlay     = DOM.require('#btn_play');
        this.btnGenerate = DOM.require('#btn_shuffle');
        this.btnSave     = DOM.require('#btn_save');
        this.btnRecall   = DOM.require('#btn_load');
        this.btnOption   = DOM.require('#btn_settings');

        this.btnPlay.onclick     = () => this.handlePlay();
        this.btnGenerate.onclick = () => this.handleGenerate();
        this.btnSave.onclick     = () => alert('Unimplemented');
        this.btnRecall.onclick   = () => alert('Unimplemented');
        this.btnOption.onclick   = () => alert('Unimplemented');

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

    /** Sets the phrase editor to the given phrase element */
    public setEditor(element: Element) : void
    {
        this.domEditor.innerHTML = '';
        this.domEditor.appendChild(element);
    }

    private handlePlay() : void
    {
        let text = DOM.getVisibleText(this.domEditor);

        RAG.speechSynth.cancel();
        text.split('. ').forEach(segment =>
            RAG.speechSynth.speak( new SpeechSynthesisUtterance(segment) )
        );

        this.setMarquee(text);
    }

    private handleGenerate() : void
    {
        RAG.phraser.generate();
    }
}