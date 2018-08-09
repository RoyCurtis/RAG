/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";

/** Controller for the setup part of the editor */
export class EditorSetup
{
    private readonly domForm      : HTMLFormElement;

    private readonly inputDevices : HTMLSelectElement;

    private readonly inputVoices  : HTMLSelectElement;

    public constructor()
    {
        this.domForm      = DOM.require('#frmSetup');
        this.inputDevices = DOM.require('#selInputDevice');
        this.inputVoices  = DOM.require('#selVoice');

        this.domForm.onchange = this.onFormChange.bind(this);

        navigator.mediaDevices.ondevicechange = this.onDevicesChanged.bind(this);
        this.onDevicesChanged();

        if (VoxEditor.voices.list.length === 0)
            DOM.addOption(this.inputVoices, 'None available').disabled = true;
        else
            VoxEditor.voices.list.forEach(voice =>
            {
                let option = DOM.addOption(this.inputVoices, voice.name, voice.voiceURI);

                if (voice.voiceURI === VoxEditor.config.voicePath)
                    option.selected = true;
            });
    }

    /** Handle form changes and input */
    private onFormChange() : void
    {
        VoxEditor.config.deviceId  = this.inputDevices.value;
        VoxEditor.config.voicePath = this.inputVoices.value;
        VoxEditor.config.save();
        VoxEditor.mics.load();
    }

    /** Handles changes to input devices */
    private onDevicesChanged() : void
    {
        this.inputDevices.innerHTML = '';

        navigator.mediaDevices.enumerateDevices()
            .then(devices =>
            {
                devices.forEach(device =>
                {
                    if (device.kind !== 'audioinput')
                        return;

                    DOM.addOption(this.inputDevices, device.label, device.deviceId);
                });

                if (this.inputDevices.children.length === 0)
                    DOM.addOption(this.inputDevices, 'None available').disabled = true;

                VoxEditor.mics.load();
            });
    }
}