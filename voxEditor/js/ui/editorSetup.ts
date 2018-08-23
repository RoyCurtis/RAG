/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";

/** Controller for the setup part of the editor */
export class EditorSetup
{
    private readonly domForm        : HTMLFormElement;

    private readonly selInputDevice : HTMLSelectElement;

    private readonly selVoice       : HTMLSelectElement;

    private readonly selPlayVoice   : HTMLSelectElement;

    private readonly selFormat      : HTMLSelectElement;

    private readonly inputScript    : HTMLInputElement;

    public constructor()
    {
        this.domForm        = DOM.require('#frmSetup');
        this.selInputDevice = DOM.require('#selInputDevice');
        this.selVoice       = DOM.require('#selVoice');
        this.selPlayVoice   = DOM.require('#selPlayVoice');
        this.selFormat      = DOM.require('#selFormat');
        this.inputScript    = DOM.require('#inputScript');

        this.domForm.onchange  = this.onFormChange.bind(this);
        this.domForm.onsubmit  = this.onFormChange.bind(this);
        this.selFormat.value   = VoxEditor.config.format;
        this.inputScript.value = VoxEditor.config.ppCommand;

        navigator.mediaDevices.ondevicechange = this.onDevicesChanged.bind(this);
        this.onDevicesChanged();

        if (VoxEditor.voices.voxList.length === 0)
        {
            DOM.addOption(this.selVoice,     'None available').disabled = true;
            DOM.addOption(this.selPlayVoice, 'None available').disabled = true;
        }
        else
            VoxEditor.voices.voxList.forEach(voice =>
            {
                // Note: Don't bother doing default selection here, as voice manager will
                // create a new voice and select it. Also handled by discoverVoices.
                let option = DOM.addOption(this.selVoice, voice, voice);

                if (voice === VoxEditor.config.voicePath)
                    option.selected = true;

                option = DOM.addOption(this.selPlayVoice, voice, voice);

                if (voice === VoxEditor.config.voicePlayPath)
                    option.selected = true;
            });
    }

    /** Handle form changes and input */
    private onFormChange(ev: Event) : void
    {
        let target = ev.target;

        if (!target)
            return;

        if (ev.type === 'submit')
            ev.preventDefault();

        VoxEditor.config.deviceId      = this.selInputDevice.value;
        VoxEditor.config.voicePath     = this.selVoice.value;
        VoxEditor.config.voicePlayPath = this.selPlayVoice.value;
        VoxEditor.config.format        = this.selFormat.value;
        VoxEditor.config.ppCommand     = this.inputScript.value;
        VoxEditor.config.save();

        // Animate green "confirm" indicator
        this.domForm.classList.add('saved');
        setTimeout(_ => this.domForm.classList.remove('saved'), 1000);

        if (target === this.selInputDevice)
            VoxEditor.mics.load();

        if (target === this.selVoice)
            VoxEditor.views.phrases.handleVoiceChange();

        if (target === this.selFormat)
            VoxEditor.voices.handleFormatChange();
    }

    /** Handles changes to input devices */
    private onDevicesChanged() : void
    {
        this.selInputDevice.innerHTML = '';

        navigator.mediaDevices.enumerateDevices()
            .then(devices =>
            {
                devices.forEach(device =>
                {
                    if (device.kind !== 'audioinput')
                        return;

                    let id     = device.deviceId;
                    let label  = device.label;
                    let option = DOM.addOption(this.selInputDevice, label, id);

                    if (id === VoxEditor.config.deviceId)
                        option.selected = true;
                });

                if (this.selInputDevice.children.length === 0)
                    DOM.addOption(this.selInputDevice, 'None available').disabled = true;

                VoxEditor.mics.load();
            });
    }
}