/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Type definition for speech config overrides passed to the speak method */
interface SpeechSettings
{
    /** Override choice of voice */
    voiceIdx? : number;
    /** Override volume of voice */
    volume?   : number;
    /** Override pitch of voice */
    pitch?    : number;
    /** Override rate of voice */
    rate?     : number;
}

/** Union type for both kinds of voices available */
type Voice = SpeechSynthesisVoice | CustomVoice;

/** Manages speech synthesis and wraps around HTML5 speech API */
class SpeechEngine
{
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
        this.customVoices.push( new CustomVoice('Roy', 'en-GB') );
    }

    /** Gets all the voices currently available */
    public getVoices() : Voice[]
    {
        // TODO: Re-enable
        // return this.customVoices.concat(this.browserVoices);
        return this.browserVoices;
    }

    /** Begins speaking the given phrase components */
    public speak(phrase: HTMLElement, settings: SpeechSettings = {}) : void
    {
        // Reset to first voice, if configured choice is missing
        let voices   = this.getVoices();
        let voiceIdx = either(settings.voiceIdx, RAG.config.voxChoice);
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
            utterance.volume = either(settings.volume, RAG.config.voxVolume);
            utterance.pitch  = either(settings.pitch,  RAG.config.voxPitch);
            utterance.rate   = either(settings.rate,   RAG.config.voxRate);

            window.speechSynthesis.speak(utterance);
        });
    }

    /**
     * Synthesizes voice by walking through the given phrase elements, resolving parts to
     * sound files by ID, and piecing together the sound files.
     *
     * @param phrase Phrase elements to speak
     * @param voice Custom voice to use
     * @param settings Settings to use for the voice
     */
    private speakCustom(phrase: HTMLElement, _: Voice, __: SpeechSettings)
    {
        // TODO: use volume settings
        let clips      = [];
        let resolver   = new Resolver();
        let treeWalker = document.createTreeWalker(
            phrase,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
            { acceptNode: Resolver.nodeFilter },
            false
        );

        while ( treeWalker.nextNode() )
        {
            console.log(
                resolver.resolve(treeWalker.currentNode),
                Strings.clean( treeWalker.currentNode.textContent! )
            );
        }
    }
}