/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Holds vox editor runtime configuration */
export class EditorConfig extends ConfigBase<EditorConfig>
{
    /** Recording device ID to use */
    public deviceId      : string = 'default';
    /** Export format for saved clips */
    public format        : string = 'mp3';
    /** Post-process command to use on saved clips */
    public ppCommand     : string = '';
    /** Key of the last voice clip selected */
    public lastKey       : string = '';
    /** Path of the voice that was last being edited */
    public voicePath     : string = '';
    /** Path of the playback voice that was last chosen */
    public voicePlayPath : string = '';
    /** Impulse response to use for VOX's reverb */
    public voiceReverb   : string  = 'ir.stalbans.wav';

    public constructor(autoLoad: boolean = false)
    {
        super(EditorConfig);

        if (autoLoad)
            this.load();
    }
}