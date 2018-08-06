/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Type definition for speech settings objects passed to the speak method */
interface SpeechSettings
{
    voiceIdx? : number;
    volume?   : number;
    pitch?    : number;
    rate?     : number;
}

/** Manages speech synthesis and wraps around HTML5 speech API */
class SpeechEngine
{
    /** Array of browser-provided voices available */
    private voices : SpeechSynthesisVoice[] = [];

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
    }

    /** Gets all the voices currently available */
    public getVoices() : SpeechSynthesisVoice[]
    {
        return this.voices;
    }

    /** Begins speaking the given string */
    public speak(text: string, settings: SpeechSettings = {}) : void
    {
        let parts    = text.trim().split(/\.\s/i);
        let voices   = RAG.speech.getVoices();
        let voiceIdx = either(settings.voiceIdx, RAG.config.voxChoice);

        // Reset to first voice, if configured choice is missing
        if (!voices[voiceIdx])
            voiceIdx = 0;

        RAG.speech.cancel();
        parts.forEach( segment =>
        {
            let utterance = new SpeechSynthesisUtterance(segment);

            utterance.voice  = voices[voiceIdx];
            utterance.volume = either(settings.volume, RAG.config.voxVolume);
            utterance.pitch  = either(settings.pitch,  RAG.config.voxPitch);
            utterance.rate   = either(settings.rate,   RAG.config.voxRate);

            window.speechSynthesis.speak(utterance);
        });
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
        this.voices = window.speechSynthesis.getVoices();
    }
}