/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

type VoxKey = string | number;

/** Synthesizes speech by dynamically loading and piecing together voice files */
class VoxEngine
{
    /** The core audio context that handles audio effects and playback */
    private readonly audioContext : AudioContext;
    /** Audio node that amplifies or attenuates voice */
    private readonly gainNode     : GainNode;
    /** Audio node that applies the tannoy filter */
    private readonly filterNode   : BiquadFilterNode;
    /** Audio node that adds a reverb to the voice, if available */
    private readonly reverbNode   : ConvolverNode;
    /** Cache of impulse responses audio data, for reverb */
    private readonly impulses     : Dictionary<AudioBuffer> = {};
    /** Relative path to fetch impulse response and chime files from */
    private readonly dataPath     : string;

    /** Whether this engine is currently running and speaking */
    public  isSpeaking       : boolean      = false;
    /** Reference number for the current pump timer */
    private pumpTimer        : number       = 0;
    /** Tracks the audio context's wall-clock time to schedule next clip */
    private nextBegin        : number       = 0;
    /** References to currently pending requests, as a FIFO queue */
    private pendingReqs      : VoxRequest[] = [];
    /** References to currently scheduled audio buffers */
    private scheduledBuffers : AudioBufferSourceNode[] = [];
    /** List of vox IDs currently being run through */
    private currentIds?      : VoxKey[];
    /** Speech settings currently being used */
    private currentSettings? : SpeechSettings;

    public constructor(dataPath: string = 'data/vox')
    {
        // Setup the core audio context

        // @ts-ignore
        let AudioContext  = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
        this.dataPath  = dataPath;

        // Setup nodes

        this.gainNode   = this.audioContext.createGain();
        this.filterNode = this.audioContext.createBiquadFilter();
        this.reverbNode = this.audioContext.createConvolver();

        this.reverbNode.buffer    = this.impulses[''];
        this.reverbNode.normalize = true;
        this.filterNode.type      = 'highpass';
        this.filterNode.Q.value   = 0.4;

        this.gainNode.connect(this.filterNode);
        // Rest of nodes get connected when speak is called
    }

    /**
     * Begins loading and speaking a set of vox files. Stops any speech.
     *
     * @param ids List of vox ids to load as files, in speaking order
     * @param settings Voice settings to use
     */
    public speak(ids: VoxKey[], settings: SpeechSettings) : void
    {
        console.debug('VOX SPEAK:', ids, settings);

        // Set state

        if (this.isSpeaking)
            this.stop();

        this.isSpeaking      = true;
        this.currentIds      = ids;
        this.currentSettings = settings;

        // Set reverb

        if ( Strings.isNullOrEmpty(settings.voxReverb) )
            this.toggleReverb(false);
        else
        {
            let file    = settings.voxReverb!;
            let impulse = this.impulses[file];

            if (!impulse)
                fetch(`${this.dataPath}/${file}`)
                    .then( res => res.arrayBuffer() )
                    .then( buf => Sounds.decode(this.audioContext, buf) )
                    .then( imp =>
                    {
                        // Cache buffer for later
                        this.impulses[file]    = imp;
                        this.reverbNode.buffer = imp;
                        this.toggleReverb(true);
                        console.debug('VOX REVERB LOADED');
                    });
            else
            {
                this.reverbNode.buffer = impulse;
                this.toggleReverb(true);
            }
        }

        // Set volume

        let volume = either(settings.volume, 1);

        // Remaps the 1.1...1.9 range to 2...10
        if (volume > 1)
            volume = (volume * 10) - 9;

        this.gainNode.gain.value = volume;

        // Begin the pump loop. On iOS, the context may have to be resumed first

        if (this.audioContext.state === 'suspended')
            this.audioContext.resume().then( () => this.pump() );
        else
            this.pump();
    }

    /** Stops playing any currently spoken speech and resets state */
    public stop() : void
    {
        // Stop pumping
        clearTimeout(this.pumpTimer);

        this.isSpeaking = false;

        // Cancel all pending requests
        this.pendingReqs.forEach( r => r.cancel() );

        // Kill and dereference any currently playing file
        this.scheduledBuffers.forEach(node =>
        {
            node.stop();
            node.disconnect();
        });

        this.nextBegin        = 0;
        this.currentIds       = undefined;
        this.currentSettings  = undefined;
        this.pendingReqs      = [];
        this.scheduledBuffers = [];

        console.debug('VOX STOPPED');
    }

    /**
     * Pumps the speech queue, by keeping up to 10 fetch requests for voice files going,
     * and then feeding their data (in enforced order) to the audio chain, one at a time.
     */
    private pump() : void
    {
        // If the engine has stopped, do not proceed.
        if (!this.isSpeaking || !this.currentIds || !this.currentSettings)
            return;

        // First, schedule fulfilled requests into the audio buffer, in FIFO order
        this.schedule();

        // Then, fill any free pending slots with new requests
        let nextDelay = 0;

        while (this.currentIds[0] && this.pendingReqs.length < 10)
        {
            let key = this.currentIds.shift()!;

            // If this key is a number, it's an amount of silence, so add it as the
            // playback delay for the next playable request (if any).
            if (typeof key === 'number')
            {
                nextDelay += key;
                continue;
            }

            let path = `${this.currentSettings.voxPath}/${key}.mp3`;

            this.pendingReqs.push( new VoxRequest(path, nextDelay, this.audioContext) );
            nextDelay = 0;
        }

        // Stop pumping when we're out of IDs to queue and nothing is playing
        if (this.currentIds.length       <= 0)
        if (this.pendingReqs.length      <= 0)
        if (this.scheduledBuffers.length <= 0)
            return this.stop();

        this.pumpTimer = setTimeout(this.pump.bind(this), 100);
    }


    private schedule() : void
    {
        // Stop scheduling if there are no pending requests
        if (!this.pendingReqs[0] || !this.pendingReqs[0].isDone)
            return;

        // Don't schedule if more than 5 nodes are, as not to blow any buffers
        if (this.scheduledBuffers.length > 5)
            return;

        let req = this.pendingReqs.shift()!;

        // If the next request errored out (buffer missing), skip it
        // TODO: Replace with silence?
        if (!req.buffer)
        {
            console.log('VOX CLIP SKIPPED:', req.path);
            return this.schedule();
        }

        // If this is the first clip being played, start from current wall-clock
        if (this.nextBegin === 0)
            this.nextBegin = this.audioContext.currentTime;

        console.log('VOX CLIP PLAYING:', req.path, req.buffer.duration, this.nextBegin);

        let node     = this.audioContext.createBufferSource();
        let latency  = this.audioContext.baseLatency + 0.15;
        let rate     = this.currentSettings!.rate || 1;
        node.buffer  = req.buffer;

        // Remap rate from 0.1..1.9 to 0.8..1.5
        if      (rate < 1) rate = (rate * 0.2) + 0.8;
        else if (rate > 1) rate = (rate * 0.5) + 0.5;

        let delay    = req.delay * (1 / rate);
        let duration = node.buffer.duration * (1 / rate);

        console.log(rate, delay, duration);

        node.playbackRate.value = rate;
        node.connect(this.gainNode);
        node.start(this.nextBegin + delay);

        this.scheduledBuffers.push(node);
        this.nextBegin += (duration + delay - latency);

        // Have this buffer node remove itself from the schedule when done
        node.onended = _ =>
        {
            console.log('VOX CLIP ENDED:', req.path);
            let idx = this.scheduledBuffers.indexOf(node);

            if (idx !== -1)
                this.scheduledBuffers.splice(idx, 1);
        };
    }

    private toggleReverb(state: boolean) : void
    {
        this.reverbNode.disconnect();
        this.filterNode.disconnect();

        if (state)
        {
            this.filterNode.connect(this.reverbNode);
            this.reverbNode.connect(this.audioContext.destination);
        }
        else
            this.filterNode.connect(this.audioContext.destination);
    }
}