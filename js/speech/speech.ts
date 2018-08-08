/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Union type for both kinds of voices available */
type Voice = SpeechSynthesisVoice | CustomVoice;

/** Manages speech synthesis using both native and custom engines */
class Speech
{
    /** Instance of the custom voice engine */
    private voxEngine     : VoxEngine;
    /** Array of browser-provided voices available */
    private browserVoices : SpeechSynthesisVoice[] = [];
    /** Array of custom pre-recorded voices available */
    private customVoices  : CustomVoice[]          = [];

    public constructor()
    {
        // Some browsers don't properly cancel speech on page close.
        // BUG: onpageshow and onpagehide not working on iOS 11
        window.onbeforeunload =
        window.onunload       =
        window.onpageshow     =
        window.onpagehide     = this.cancel.bind(this);

        document.onvisibilitychange            = this.onVisibilityChange.bind(this);
        window.speechSynthesis.onvoiceschanged = this.onVoicesChanged.bind(this);

        // Even though 'onvoiceschanged' is used later to populate the list, Chrome does
        // not actually fire the event until this call...
        this.onVoicesChanged();

        // TODO: Make this a dynamic registration and check for features
        this.voxEngine = new VoxEngine();

        this.customVoices.push( new CustomVoice('Test', 'en-GB') );
    }

    /** Gets all the voices currently available */
    public getVoices() : Voice[]
    {
        return this.customVoices.concat(this.browserVoices);
    }

    /** Begins speaking the given phrase components */
    public speak(phrase: HTMLElement, settings: SpeechSettings = {}) : void
    {
        // Reset to first voice, if configured choice is missing
        let voices   = this.getVoices();
        let voiceIdx = either(settings.voiceIdx, RAG.config.speechVoice);
        let voice    = voices[voiceIdx] || voices[0];
        let engine   = (voice instanceof CustomVoice)
            ? this.speakCustom.bind(this)
            : this.speakBrowser.bind(this);

        engine(phrase, voice, settings);
    }

    /** Stops and cancels all queued speech */
    public cancel() : void
    {
        window.speechSynthesis.cancel();
    }

    /** Pause and unpause speech if the page is hidden or unhidden */
    private onVisibilityChange() : void
    {
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
     * @param voice Browser voice to use
     * @param settings Settings to use for the voice
     */
    private speakBrowser(phrase: HTMLElement, voice: Voice, settings: SpeechSettings)
        : void
    {
        // The phrase text is split into sentences, as queueing large sentences that last
        // many seconds can break some TTS engines and browsers.
        let text  = DOM.getCleanedVisibleText(phrase);
        let parts = text.split(/\.\s/i);

        RAG.speech.cancel();
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
    }

    /**
     * Synthesizes voice by walking through the given phrase elements, resolving parts to
     * sound file IDs, and feeding the entire array to the vox engine.
     *
     * @param phrase Phrase elements to speak
     * @param voice Custom voice to use
     * @param settings Settings to use for the voice
     */
    private speakCustom(phrase: HTMLElement, voice: Voice, settings: SpeechSettings)
        : void
    {
        // TODO: use volume settings
        let ids        = [];
        let resolver   = new Resolver();
        let treeWalker = document.createTreeWalker(
            phrase,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
            { acceptNode: Resolver.nodeFilter },
            false
        );

        while ( treeWalker.nextNode() )
            ids.push( ...resolver.resolve(treeWalker.currentNode) );

        this.voxEngine.speak(ids, voice, settings);
    }
}