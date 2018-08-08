/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";

/** Controller for the setup part of the editor */
export class EditorSetup
{
    private readonly domForm      : HTMLFormElement;

    private readonly inputDevices : HTMLSelectElement;

    public constructor()
    {
        this.domForm      = DOM.require('#frmSetup');
        this.inputDevices = DOM.require('#selInputDevice');

        this.domForm.onchange = this.onFormChange.bind(this);

        navigator.mediaDevices.ondevicechange = this.onDevicesChanged.bind(this);
        this.onDevicesChanged();
    }

    private onFormChange() : void
    {
        VoxEditor.config.deviceId = this.inputDevices.value;
        VoxEditor.config.save();
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

                    let option = document.createElement('option') as HTMLOptionElement;

                    option.text  = device.label;
                    option.value = device.deviceId;

                    this.inputDevices.add(option);
                })
            });
    }
}