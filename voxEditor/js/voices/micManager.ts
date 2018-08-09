/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";

/** Manages available microphones and input streams */
export class MicManager
{
    public micDevice? : MediaStream;

    public micTrack?  : MediaStreamTrack;

    public load() : void
    {
        if (this.micDevice)
        {
            this.micDevice.getTracks().forEach(track => track.stop() );
            this.micTrack  = undefined;
            this.micDevice = undefined;
        }

        navigator.mediaDevices.getUserMedia(
        {
            audio : {
                deviceId : VoxEditor.config.deviceId,
                // This changes mic volume on the OS level, so don't use it
                autoGainControl  : false,
                echoCancellation : true,
                noiseSuppression : true
            },

            video : false
        })
            .then ( this.onGetMicrophone.bind(this) )
            .catch( this.onNoMicrophone.bind(this)  );
    }

    private onGetMicrophone(stream: MediaStream) : void
    {
        this.micDevice        = stream;
        this.micTrack         = stream.getAudioTracks()[0];
        this.micTrack.enabled = false;

        VoxEditor.views.tapedeck.update();
    }

    private onNoMicrophone() : void
    {
        this.micDevice = undefined;
        VoxEditor.views.tapedeck.update();
    }
}