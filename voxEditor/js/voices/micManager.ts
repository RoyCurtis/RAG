/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";
import {MicWorkletNode} from "./micWorkletNode";

/** Manages available microphones and input streams */
export class MicManager
{
    private readonly audioContext : AudioContext;

    public  micDevice?    : MediaStream;

    private workletNode?  : MicWorkletNode;

    private streamNode?   : MediaStreamAudioSourceNode;

    private idleBuffer    : Float32Array;

    private idleBufferIdx : number;

    private recBuffer     : Float32Array;

    private recBufferIdx  : number;

    private isRecording   : boolean;

    public get canRecord() : boolean
    {
        return this.micDevice   !== undefined
            && this.workletNode !== undefined;
    }

    public constructor()
    {
        this.audioContext  = new AudioContext();
        // 128 * 344 roughly around 44100 samples, or approx. 1 second of buffer
        this.idleBuffer    = new Float32Array(MicWorkletNode.QUANTUM_SIZE * 344);
        // 30 seconds of 44100 sample rate audio maximum for clips
        this.recBuffer     = new Float32Array(this.audioContext.sampleRate * 30);
        this.idleBufferIdx = 0;
        this.recBufferIdx  = 0;
        this.isRecording   = false;

        fetch('dist/voices/micWorklet.js')
            .then( req => req.text() )
            .then( src =>
            {
                // Workaround for Chromium bug with loading audio worklet scripts
                // https://bugs.chromium.org/p/chromium/issues/detail?id=807160
                let module = `data:text/javascript;utf8,\n${src}`;

                return this.audioContext.audioWorklet.addModule(module);
            })
            .then(_ =>
            {
                this.workletNode = new MicWorkletNode(this.audioContext);
                this.workletNode.connect(this.audioContext.destination);
                VoxEditor.views.tapedeck.handleMicChange();
            })
            .catch(console.error);
    }

    /** Attempts to load the currently configured microphone as a stream */
    public load() : void
    {
        this.stopRecording();

        if (this.workletNode)
            this.workletNode.port!.onmessage = null;

        if (this.streamNode)
        {
            this.streamNode.disconnect();
            this.streamNode = undefined;
        }

        if (this.micDevice)
        {
            this.micDevice.getTracks().forEach( track => track.stop() );
            this.micDevice = undefined;
        }

        navigator.mediaDevices.getUserMedia(
        {
            audio : {
                deviceId         : VoxEditor.config.deviceId,
                // These change mic volume on the OS level, so don't use them
                autoGainControl  : false,
                echoCancellation : false,
                noiseSuppression : true,
                sampleRate       : 44100,
                sampleSize       : 16,
                channelCount     : 1
            },

            video : false
        })
            .then ( this.onGetMicrophone.bind(this) )
            .catch( this.onNoMicrophone.bind(this)  );
    }

    private onGetMicrophone(stream: MediaStream) : void
    {
        this.micDevice  = stream;
        this.streamNode = this.audioContext.createMediaStreamSource(this.micDevice!);
        this.streamNode.connect(this.workletNode!);

        this.workletNode!.port!.onmessage = this.onMicData.bind(this);

        VoxEditor.views.tapedeck.handleMicChange();
    }

    private onNoMicrophone() : void
    {
        this.micDevice = undefined;
        VoxEditor.views.tapedeck.handleMicChange();
    }

    public startRecording()
    {
        this.stopRecording();

        if (!this.canRecord)
            return;

        // Force garbage collection to avoid any pauses during recording
        if ( global.gc() )
            global.gc();

        // Prepend idle recording data
        this.recBuffer.set( this.idleBuffer.slice(0, this.idleBufferIdx) );
        this.recBufferIdx = this.idleBufferIdx;
        this.isRecording  = true;
    }

    public stopRecording()
    {
        if (!this.canRecord || !this.isRecording)
            return;

        this.isRecording = false;
        this.processRecording();
        return;
    }

    private onMicData(msg: MessageEvent) : void
    {
        let data = msg.data as ArrayBuffer;
        let buf  = new Float32Array(data);

        // Recording: Copy the data into the recording buffer
        if (this.isRecording)
        {
            this.recBuffer.set(buf, this.recBufferIdx);
            this.recBufferIdx += buf.length;

            // End of buffer; stop recording
            if (this.recBufferIdx >= this.recBuffer.length)
                this.stopRecording();
        }
        // Idle: Keep a small buffer of last-recorded audio to prepend to recordings
        else
        {
            this.idleBuffer.set(buf, this.idleBufferIdx);

            this.idleBufferIdx += buf.length;

            // End of buffer; shift everything back by half and keep going
            if (this.idleBufferIdx >= this.idleBuffer.length)
            {
                // TODO: Check for off-by-one
                let half           = (this.idleBuffer.length / 2) | 0;
                this.idleBufferIdx = half;

                this.idleBuffer.copyWithin(0, half);
            }
        }

        VoxEditor.views.tapedeck.handleMicData(buf, this.isRecording);
    }

    private processRecording() : void
    {
        if (this.recBufferIdx === 0)
            return;

        let key    = VoxEditor.views.phrases.currentKey!;
        let length = this.recBufferIdx;
        let buffer = new AudioBuffer(
        {
            length:           length,
            numberOfChannels: 1,
            sampleRate:       this.audioContext.sampleRate
        });

        // Transfer data to audio buffer
        buffer.copyToChannel(this.recBuffer, 0);

        // Reset state
        this.recBuffer.fill(0);
        this.recBufferIdx = 0;

        VoxEditor.voices.loadFromBuffer(buffer);
        VoxEditor.views.tapedeck.handleRecDone(key);
    }
}