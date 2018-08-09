/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";

/** Manages available microphones and input streams */
export class MicManager
{
    public micDevice? : MediaStream;

    private audioContext : AudioContext;

    private sampleRate : number;

    private micNode? : MediaStreamAudioSourceNode;

    private bufNode? : ScriptProcessorNode;

    private buffers? : Float32Array[];

    public constructor()
    {
        this.sampleRate   = 0;
        this.audioContext = new AudioContext({
            sampleRate  : 44100,
            latencyHint : 'playback'
        });
    }

    public load() : void
    {
        this.stopRecording();

        if (this.micDevice)
        {
            this.micDevice.getTracks().forEach(track => track.stop() );
            this.micDevice = undefined;
        }

        navigator.mediaDevices.getUserMedia(
        {
            audio : {
                deviceId : VoxEditor.config.deviceId,
                // This changes mic volume on the OS level, so don't use it
                autoGainControl  : false,
                echoCancellation : true,
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

    public startRecording()
    {
        this.stopRecording();

        if (!this.micDevice)
            return;

        this.micDevice.getTracks().forEach(t => t.enabled = true);

        this.buffers = [];
        this.bufNode = this.audioContext.createScriptProcessor(0, 1, 1);
        this.micNode = this.audioContext.createMediaStreamSource(this.micDevice);

        this.bufNode.onaudioprocess = ev =>
        {
            if (!this.buffers)
                return;

            this.buffers.push( ev.inputBuffer.getChannelData(0).slice() );
            this.sampleRate = ev.inputBuffer.sampleRate;
        };

        this.micNode.connect(this.bufNode);
        this.bufNode.connect(this.audioContext.destination);
    }

    public stopRecording()
    {
        if (!this.micNode || !this.bufNode || !this.micDevice)
            return;

        this.bufNode.disconnect();
        this.micNode.disconnect();
        this.micDevice.getTracks().forEach(t => t.enabled = false);

        let amount  = this.buffers!.length;
        let size    = this.buffers![0].length;
        let samples = size * amount;
        let buffer  = this.audioContext.createBuffer(1, samples, this.sampleRate);
        let key     = VoxEditor.views.phrases.currentKey!;

        // Apply a fade-out to the final buffer
        let lastBuf = this.buffers![amount - 1];
        for (let i = 0; i < size; i++)
            lastBuf[i] *= 1 - ((1 / size) * i);

        // Copy all buffers to the final buffer
        this.buffers!.forEach( (buf, i) =>
            buffer.getChannelData(0).set(buf, i * size)
        );

        VoxEditor.voices.loadFromBuffer(key, buffer);

        this.bufNode.onaudioprocess = null;
        this.micNode                = undefined;
        this.bufNode                = undefined;
        this.buffers                = [];
        return;
    }

    private onGetMicrophone(stream: MediaStream) : void
    {
        this.micDevice = stream;
        this.micDevice.getTracks().forEach(t => t.enabled = false);

        VoxEditor.views.tapedeck.update();
    }

    private onNoMicrophone() : void
    {
        this.micDevice = undefined;
        VoxEditor.views.tapedeck.update();
    }
}