/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the top toolbar */
class Toolbar
{
    private dom         : HTMLElement;
    private btnPlay     : HTMLButtonElement;
    private btnStop     : HTMLButtonElement;
    private btnGenerate : HTMLButtonElement;
    private btnSave     : HTMLButtonElement;
    private btnRecall   : HTMLButtonElement;
    private btnOption   : HTMLButtonElement;

    constructor()
    {
        this.dom         = DOM.require('#toolbar');
        this.btnPlay     = DOM.require('#btnPlay');
        this.btnStop     = DOM.require('#btnStop');
        this.btnGenerate = DOM.require('#btnShuffle');
        this.btnSave     = DOM.require('#btnSave');
        this.btnRecall   = DOM.require('#btnLoad');
        this.btnOption   = DOM.require('#btnSettings');

        this.btnStop.onclick     = this.handleStop.bind(this);
        this.btnGenerate.onclick = RAG.generate;
        this.btnSave.onclick     = this.handleSave.bind(this);
        this.btnRecall.onclick   = this.handleLoad.bind(this);
        this.btnOption.onclick   = this.handleOption.bind(this);

        this.btnPlay.onclick = ev =>
        {
            // Has to execute on a delay, as speech cancel is unreliable without it
            ev.preventDefault();
            RAG.speechSynth.cancel();
            this.btnPlay.disabled = true;
            window.setTimeout(this.handlePlay.bind(this), 200);
        }
    }

    private handlePlay() : void
    {
        // Note: It would be nice to have the play button change to the stop button and
        // automatically change back. However, speech's 'onend' event was found to be
        // unreliable, so I decided to keep play and stop separate.

        let text   = RAG.views.editor.getText();
        let parts  = text.trim().split(/\.\s/i);
        let voices = RAG.speechSynth.getVoices();
        let voice  = RAG.config.voxChoice;

        // Reset to default voice, if it's missing
        if (!voices[voice])
            RAG.config.voxChoice = voice = 0;

        RAG.speechSynth.cancel();
        parts.forEach( segment =>
        {
            let utterance = new SpeechSynthesisUtterance(segment);

            utterance.voice  = voices[voice];
            utterance.volume = RAG.config.voxVolume;
            utterance.pitch  = RAG.config.voxPitch;
            utterance.rate   = RAG.config.voxRate;

            RAG.speechSynth.speak(utterance)
        });

        RAG.views.marquee.set(text);
        this.btnPlay.disabled = false;
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
        RAG.views.settings.open();
    }
}