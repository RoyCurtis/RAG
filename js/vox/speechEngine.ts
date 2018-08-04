/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Manages speech synthesis and wraps around HTML5 speech API  */
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

    /** Queues an utterance to speak, and immediately begins speaking */
    public speak(utterance: SpeechSynthesisUtterance) : void
    {
        window.speechSynthesis.speak(utterance);
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