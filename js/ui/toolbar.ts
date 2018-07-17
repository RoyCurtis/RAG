/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the top toolbar */
class Toolbar
{
    private dom         : HTMLElement;
    private btnPlay     : HTMLElement;
    private btnStop     : HTMLElement;
    private btnGenerate : HTMLElement;
    private btnSave     : HTMLElement;
    private btnRecall   : HTMLElement;
    private btnOption   : HTMLElement;

    constructor()
    {
        this.dom         = DOM.require('#toolbar');
        this.btnPlay     = DOM.require('#btnPlay');
        this.btnStop     = DOM.require('#btnStop');
        this.btnGenerate = DOM.require('#btnShuffle');
        this.btnSave     = DOM.require('#btnSave');
        this.btnRecall   = DOM.require('#btnLoad');
        this.btnOption   = DOM.require('#btnSettings');

        this.btnPlay.onclick     = this.handlePlay.bind(this);
        this.btnStop.onclick     = this.handleStop.bind(this);
        this.btnGenerate.onclick = RAG.generate;
        this.btnSave.onclick     = this.handleSave.bind(this);
        this.btnRecall.onclick   = this.handleLoad.bind(this);
        this.btnOption.onclick   = this.handleOption.bind(this);
    }

    private handlePlay() : void
    {
        // Note: It would be nice to have the play button change to the stop button and
        // automatically change back. However, speech's 'onend' event was found to be
        // unreliable, so I decided to keep play and stop separate.

        let text  = RAG.views.editor.getText();
        let parts = text.trim().split(/\.\s/i);

        RAG.speechSynth.cancel();
        parts.forEach( segment =>
            RAG.speechSynth.speak( new SpeechSynthesisUtterance(segment) )
        );

        RAG.views.marquee.set(text);
    }

    private handleStop() : void
    {
        RAG.speechSynth.cancel();
        RAG.views.marquee.stop();
    }

    private handleSave() : void
    {
        try
        {
            let css = "font-size: large; font-weight: bold;";
            let raw = JSON.stringify(RAG.state);
            window.localStorage['state'] = raw;

            console.log("%cCopy and paste this in console to load later:", css);
            console.log("RAG.load('", raw.replace("'", "\\'"), "')");
            console.log("%cRaw JSON state:", css);
            console.log(raw);

            RAG.views.marquee.set(
                "State has been saved to storage, and dumped to console."
            );
        }
        catch (e)
        {
            RAG.views.marquee.set(
                `Sorry, state could not be saved to storage: ${e.message}.`
            );
        }
    }

    private handleLoad() : void
    {
        let data = window.localStorage['state'];

        return data
            ? RAG.load(data)
            : RAG.views.marquee.set("Sorry, no state was found in storage.");
    }

    private handleOption() : void
    {
        alert("Unimplemented function");
    }
}