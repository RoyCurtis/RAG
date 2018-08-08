/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Synthesizes speech by dynamically loading and piecing together voice files */
class VoxEngine
{
    /** Whether this engine is currently running and speaking */
    public  isSpeaking       : boolean      = false;
    /** Reference number for the current pump timer */
    private pumpTimer        : number       = 0;

    private pendingReqs      : VoxRequest[] = [];

    private finishedReqs     : VoxRequest[] = [];
    /** List of vox IDs currently being run through */
    private currentIds?      : string[];
    /** Voice currently being used */
    private currentVoice?    : CustomVoice;
    /** Speech settings currently being used */
    private currentSettings? : SpeechSettings;

    public speak(ids: string[], voice: Voice, settings: SpeechSettings) : void
    {
        if (this.isSpeaking)
            this.stop();

        this.isSpeaking      = true;
        this.currentIds      = ids;
        this.currentVoice    = voice;
        this.currentSettings = settings;

        // Begin the pump loop
        this.pumpTimer = setInterval(this.pump.bind(this), 1000);
    }

    public stop() : void
    {
        clearInterval(this.pumpTimer);
        this.isSpeaking      = false;
        this.currentIds      = undefined;
        this.currentVoice    = undefined;
        this.currentSettings = undefined;

        this.pendingReqs.forEach( r => r.cancel() );

        this.pendingReqs  = [];
        this.finishedReqs = [];
        // Take down pump and stop audio
    }

    private pump() : void
    {
        // Oops, running whilst not speaking. Die here.
        if (!this.isSpeaking || !this.currentIds || !this.currentVoice)
            return;

        // First, put any fulfilled requests into the ready queue, in FIFO order
        while (this.pendingReqs.length > 0 && this.pendingReqs[0].isDone)
            this.finishedReqs.push( this.pendingReqs.shift() as VoxRequest );

        // Then, fill any free pending slots with new requests
        while (this.currentIds.length > 0 && this.pendingReqs.length < 10)
        {
            let id   = this.currentIds.shift();
            let path = `${this.currentVoice.voiceURI}/${id}.mp3`;

            this.pendingReqs.push( new VoxRequest(path) );
        }

        // Finally, begin feeding finished requests into the audio buffer

        if (this.currentIds.length <= 0)
            this.stop();
    }
}