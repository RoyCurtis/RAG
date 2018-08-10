/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";

/** Manages available microphones and input streams */
export class MicManager
{
    public micDevice? : MediaStream;

    private audioContext : AudioContext;

    private sampleRate : number;

    private recorder? : MediaRecorder;

    public constructor()
    {
        this.sampleRate   = 0;
        this.audioContext = new AudioContext();
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

    public startRecording()
    {
        this.stopRecording();

        if (!this.micDevice)
            return;

        this.micDevice.getTracks().forEach(t => t.enabled = true);

        this.recorder = new MediaRecorder(this.micDevice,
        {
            mimeType      : 'audio/webm;codecs=opus',
            bitsPerSecond : 64 * 1000
        });

        this.recorder.start();
    }

    public stopRecording()
    {
        if (!this.recorder || !this.micDevice)
            return;

        this.recorder.ondataavailable = this.onGetMediaData.bind(this);

        this.recorder.onstop = _ =>
        {
            this.recorder!.ondataavailable = null;
            this.recorder                  = undefined;
        };

        this.recorder.stop();
        this.micDevice.getTracks().forEach(t => t.enabled = false);
        return;
    }

    private onGetMediaData(ev: BlobEvent) : void
    {
        let reader = new FileReader();

        reader.readAsArrayBuffer(ev.data);

        reader.onloadend = _ =>
        {
            let result       = reader.result as ArrayBuffer;
            reader.onloadend = null;

            this.audioContext.decodeAudioData( result.slice(0) )
                .then ( this.onDecodeMediaData.bind(this) )
                .catch( console.error );
        };
    }

    private onDecodeMediaData(buffer: AudioBuffer) : void
    {
        let key = VoxEditor.views.phrases.currentKey!;

        VoxEditor.voices.loadFromBuffer(key, buffer);
        VoxEditor.views.tapedeck.update();
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