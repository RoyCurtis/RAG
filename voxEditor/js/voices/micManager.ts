/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";
import {MicWorkletNode} from "./micWorkletNode";

/** Manages available microphones and input streams */
export class MicManager
{
    private readonly audioContext : AudioContext;

    public  micDevice? : MediaStream;

    private workletNode? : MicWorkletNode;

    private streamNode?  : MediaStreamAudioSourceNode;

    private buffers? : Float32Array[];

    public get canRecord() : boolean
    {
        return this.micDevice   !== undefined
            && this.workletNode !== undefined;
    }

    public constructor()
    {
        this.audioContext = new AudioContext();

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
        this.micDevice = stream;
        this.micDevice.getTracks().forEach(t => t.enabled = false);

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

        this.micDevice!.getTracks().forEach(t => t.enabled = true);

        this.streamNode = this.audioContext.createMediaStreamSource(this.micDevice!);
        this.streamNode.connect(this.workletNode!);

        this.buffers  = [];

        this.workletNode!.port!.onmessage = msg =>
        {
            let data = msg.data as ArrayBuffer;
            let buf  = new Float32Array(data);

            this.buffers!.push(buf);
            VoxEditor.views.tapedeck.handleMicData(buf);
        };
    }

    public stopRecording()
    {
        if (!this.canRecord)
            return;

        if (this.streamNode)
        {
            this.streamNode.disconnect();
            this.streamNode = undefined;
        }

        this.workletNode!.port!.onmessage = null;
        this.micDevice!.getTracks().forEach(t => t.enabled = false);
        this.processRecording();
        return;
    }

    private processRecording() : void
    {
        if (!this.buffers)
            return;

        let key    = VoxEditor.views.phrases.currentKey!;
        let length = 128 * this.buffers.length;
        let buffer = new AudioBuffer(
        {
            length:           length,
            numberOfChannels: 1,
            sampleRate:       this.audioContext.sampleRate
        });

        let channel = buffer.getChannelData(0);

        // Write all the smaller buffers into the final buffer
        this.buffers.forEach( (buf, idx) => channel.set(buf, 128 * idx) );

        // Soften the beginning and end with fades
        if  (length > 1024)
        for (let i = 0; i < 1024; i++)
        {
            let factor = (1 / 1024) * i;

            channel[i]          *= factor;
            channel[length - i] *= factor;
        }

        this.buffers = undefined;
        VoxEditor.voices.loadFromBuffer(buffer);
        VoxEditor.views.tapedeck.handleRecDone(key);
    }
}