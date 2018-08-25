/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Manages speech synthesis using both native and custom engines */
class Speech
{
    /** Instance of the custom voice engine */
    private readonly voxEngine? : VoxEngine;

    /** Array of browser-provided voices available */
    public  browserVoices : SpeechSynthesisVoice[] = [];
    /** Event handler for when speech has ended */
    public  onstop?       : () => void;
    /** Reference to the native speech-stopped check timer */
    private stopTimer     : number = 0;

    /** Whether the VOX engine is currently available */
    public get voxAvailable() : boolean
    {
        return this.voxEngine !== undefined;
    }

    public constructor()
    {
        // Some browsers don't properly cancel speech on page close.
        // BUG: onpageshow and onpagehide not working on iOS 11
        window.onbeforeunload =
        window.onunload       =
        window.onpageshow     =
        window.onpagehide     = this.stop.bind(this);

        document.onvisibilitychange            = this.onVisibilityChange.bind(this);
        window.speechSynthesis.onvoiceschanged = this.onVoicesChanged.bind(this);

        // Even though 'onvoiceschanged' is used later to populate the list, Chrome does
        // not actually fire the event until this call...
        this.onVoicesChanged();

        try         { this.voxEngine = new VoxEngine(); }
        catch (err) { console.error('Could not create VOX engine:', err); }
    }

    /** Begins speaking the given phrase components */
    public speak(phrase: HTMLElement, settings: SpeechSettings = {}) : void
    {
        this.stop();

        if      ( this.voxEngine && either(settings.useVox, RAG.config.voxEnabled) )
            this.speakVox(phrase, settings);
        else if (window.speechSynthesis)
            this.speakBrowser(phrase, settings);
        else if (this.onstop)
            this.onstop();
    }

    /** Stops and cancels all queued speech */
    public stop() : void
    {
        // TODO: Check for speech synthesis

        if (window.speechSynthesis)
            window.speechSynthesis.cancel();

        if (this.voxEngine)
            this.voxEngine.stop();
    }

    /** Pause and unpause speech if the page is hidden or unhidden */
    private onVisibilityChange() : void
    {
        // TODO: This needs to pause VOX engine
        let hiding = (document.visibilityState === 'hidden');

        if (hiding) window.speechSynthesis.pause();
        else        window.speechSynthesis.resume();
    }

    /** Handles async voice list loading on some browsers, and sets default */
    private onVoicesChanged() : void
    {
        this.browserVoices = window.speechSynthesis.getVoices();
    }

    /**
     * Converts the given phrase to text and speaks it via native browser voices.
     *
     * @param phrase Phrase elements to speak
     * @param settings Settings to use for the voice
     */
    private speakBrowser(phrase: HTMLElement, settings: SpeechSettings) : void
    {
        // Reset to first voice, if configured choice is missing
        let voiceIdx = either(settings.voiceIdx, RAG.config.speechVoice);
        let voice    = this.browserVoices[voiceIdx] || this.browserVoices[0];

        // The phrase text is split into sentences, as queueing large sentences that last
        // many seconds can break some TTS engines and browsers.
        let text  = DOM.getCleanedVisibleText(phrase);
        let parts = text.split(/\.\s/i);

        parts.forEach( (segment, idx) =>
        {
            // Add missing full stop to each sentence except the last, which has it
            if (idx < parts.length - 1)
                segment += '.';

            let utterance = new SpeechSynthesisUtterance(segment);

            utterance.voice  = voice;
            utterance.volume = either(settings.volume, RAG.config.speechVol);
            utterance.pitch  = either(settings.pitch,  RAG.config.speechPitch);
            utterance.rate   = either(settings.rate,   RAG.config.speechRate);

            window.speechSynthesis.speak(utterance);
        });

        // This checks for when the native engine has stopped speaking, and calls the
        // onstop event handler. I could use SpeechSynthesis.onend instead, but it was
        // found to be unreliable, so I have to poll the speaking property this way.
        clearInterval(this.stopTimer);

        this.stopTimer = setInterval(() =>
        {
            if (window.speechSynthesis.speaking)
                return;

            clearInterval(this.stopTimer);

            if (this.onstop)
                this.onstop();
        }, 100);
    }

    /**
     * Synthesizes voice by walking through the given phrase elements, resolving parts to
     * sound file IDs, and feeding the entire array to the vox engine.
     *
     * @param phrase Phrase elements to speak
     * @param settings Settings to use for the voice
     */
    private speakVox(phrase: HTMLElement, settings: SpeechSettings) : void
    {
        let resolver = new Resolver(phrase);
        let voxPath  = RAG.config.voxPath || RAG.config.voxCustomPath;

        this.voxEngine!.onstop = () =>
        {
            this.voxEngine!.onstop = undefined;

            if (this.onstop)
                this.onstop();
        };

        // Apply settings from config here, to keep VOX engine decoupled from RAG
        settings.voxPath   = either(settings.voxPath,   voxPath);
        settings.voxReverb = either(settings.voxReverb, RAG.config.voxReverb);
        settings.voxChime  = either(settings.voxChime,  RAG.config.voxChime);
        settings.volume    = either(settings.volume,    RAG.config.speechVol);
        settings.rate      = either(settings.rate,      RAG.config.speechRate);

        this.voxEngine!.speak(resolver.toVox(), settings);
    }
}