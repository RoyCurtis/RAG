/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the top toolbar */
class Toolbar
{
    /** Reference to the container for the toolbar */
    private readonly dom         : HTMLElement;
    /** Reference to the play button */
    private readonly btnPlay     : HTMLButtonElement;
    /** Reference to the stop button */
    private readonly btnStop     : HTMLButtonElement;
    /** Reference to the generate random phrase button */
    private readonly btnGenerate : HTMLButtonElement;
    /** Reference to the save state button */
    private readonly btnSave     : HTMLButtonElement;
    /** Reference to the recall state button */
    private readonly btnRecall   : HTMLButtonElement;
    /** Reference to the settings button */
    public  readonly btnOption   : HTMLButtonElement;

    public constructor()
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
        this.btnGenerate.onclick = this.handleGenerate.bind(this);
        this.btnSave.onclick     = this.handleSave.bind(this);
        this.btnRecall.onclick   = this.handleLoad.bind(this);
        this.btnOption.onclick   = this.handleOption.bind(this);

        // Add throb class if the generate button hasn't been clicked before
        if (!RAG.config.clickedGenerate)
        {
            this.btnGenerate.classList.add('throb');
            this.btnGenerate.focus();
        }
        else
            this.btnPlay.focus();
    }

    /** Handles the play button, playing the editor's current phrase with speech */
    private handlePlay() : void
    {
        RAG.speech.stop();
        this.btnPlay.disabled = true;

        // Has to execute on a delay, otherwise native speech cancel becomes unreliable
        window.setTimeout(this.handlePlay2.bind(this), 200);
    }

    /** Continuation of handlePlay, executed after a delay */
    private handlePlay2() : void
    {
        let hasSpoken         = false;
        let speechText        = RAG.views.editor.getText();
        this.btnPlay.hidden   = true;
        this.btnPlay.disabled = false;
        this.btnStop.hidden   = false;

        // TODO: Localize
        RAG.views.marquee.set('Loading VOX...', false);

        // If speech takes too long (10 seconds) to load, cancel it
        let timeout = window.setTimeout(() =>
        {
            clearTimeout(timeout);
            RAG.speech.stop();
        }, 10 * 1000);

        RAG.speech.onspeak = () =>
        {
            clearTimeout(timeout);
            RAG.views.marquee.set(speechText);

            hasSpoken          = true;
            RAG.speech.onspeak = undefined;
        };

        RAG.speech.onstop = () =>
        {
            clearTimeout(timeout);
            this.handleStop();

            // Check if anything was actually spoken. If not, something went wrong.
            if (!hasSpoken && RAG.config.voxEnabled)
            {
                RAG.config.voxEnabled = false;

                // TODO: Localize
                alert(
                    'It appears that the VOX engine was unable to say anything.'   +
                    ' Either the current voice path is unreachable, or the engine' +
                    ' crashed. Please check the console. The VOX engine has been'  +
                    ' disabled and native text-to-speech will be used on next play.'
                );
            }
            else if (!hasSpoken)
                alert(
                    'It appears that the browser was unable to say anything.'        +
                    ' Either the current voice failed to load, or this browser does' +
                    ' not support support text-to-speech. Please check the console.'
                );

            // Since the marquee would have been stuck on "Loading...", scroll it
            if (!hasSpoken)
                RAG.views.marquee.set(speechText);
        };

        RAG.speech.speak( RAG.views.editor.getPhrase() );
        this.btnStop.focus();
    }

    /** Handles the stop button, stopping the marquee and any speech */
    private handleStop(ev?: Event) : void
    {
        RAG.speech.onspeak  = undefined;
        RAG.speech.onstop   = undefined;
        this.btnPlay.hidden = false;

        // Only focus play button if user didn't move focus elsewhere. Prevents
        // annoying surprise of focus suddenly shifting away.
        if (document.activeElement === this.btnStop)
            this.btnPlay.focus();

        this.btnStop.hidden = true;

        RAG.speech.stop();

        // If event exists, this stop was called by the user
        if (ev)
            RAG.views.marquee.set(RAG.views.editor.getText(), false);
    }

    /** Handles the generate button, generating new random state and phrase */
    private handleGenerate() : void
    {
        // Remove the call-to-action throb from initial load
        this.btnGenerate.classList.remove('throb');
        RAG.generate();
        RAG.config.clickedGenerate = true;
    }

    /** Handles the save button, persisting the current train state to storage */
    private handleSave() : void
    {
        try
        {
            let css = 'font-size: large; font-weight: bold;';
            let raw = JSON.stringify(RAG.state);
            window.localStorage.setItem('state', raw);

            console.log(L.STATE_COPY_PASTE, css);
            console.log("RAG.load('", raw.replace("'", "\\'"), "')");
            console.log(L.STATE_RAW_JSON, css);
            console.log(raw);

            RAG.views.marquee.set(L.STATE_TO_STORAGE);
        }
        catch (e)
        {
            RAG.views.marquee.set( L.STATE_SAVE_FAIL(e.message) );
        }
    }

    /** Handles the load button, loading train state from storage, if it exists */
    private handleLoad() : void
    {
        let data = window.localStorage.getItem('state');

        return data
            ? RAG.load(data)
            : RAG.views.marquee.set(L.STATE_SAVE_MISSING);
    }

    /** Handles the settings button, opening the settings screen */
    private handleOption() : void
    {
        RAG.views.settings.open();
    }
}