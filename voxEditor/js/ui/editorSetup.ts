/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";

/** Controller for the setup part of the editor */
export class EditorSetup
{
    private readonly domForm        : HTMLFormElement;

    private readonly selInputDevice : HTMLSelectElement;

    private readonly selVoice       : HTMLSelectElement;

    private readonly selPlayVoice   : HTMLSelectElement;

    private readonly inputScript    : HTMLInputElement;

    public constructor()
    {
        this.domForm        = DOM.require('#frmSetup');
        this.selInputDevice = DOM.require('#selInputDevice');
        this.selVoice       = DOM.require('#selVoice');
        this.selPlayVoice   = DOM.require('#selPlayVoice');
        this.inputScript    = DOM.require('#inputScript');

        this.domForm.onchange = this.onFormChange.bind(this);
        this.domForm.onsubmit = this.onFormChange.bind(this);

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
                let name   = `RAG-VOX ${voice.name}`;
                let option = DOM.addOption(this.selVoice, name, voice.name);

                if (voice.name === VoxEditor.config.voiceID)
                    option.selected = true;

                option = DOM.addOption(this.selPlayVoice, name, voice.name);

                if (voice.name === VoxEditor.config.voicePlayID)
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

        VoxEditor.config.deviceId    = this.selInputDevice.value;
        VoxEditor.config.voiceID     = this.selVoice.value;
        VoxEditor.config.voicePlayID = this.selPlayVoice.value;
        VoxEditor.config.ppCommand   = this.inputScript.value;
        VoxEditor.config.save();

        // Animate green "confirm" indicator
        this.domForm.classList.add('saved');
        setTimeout(_ => this.domForm.classList.remove('saved'), 1000);

        if (target === this.selInputDevice)
            VoxEditor.mics.load();

        if (target === this.selVoice)
            VoxEditor.views.phrases.handleVoiceChange();
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