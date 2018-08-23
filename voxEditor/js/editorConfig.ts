/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Holds vox editor runtime configuration */
// TODO: try to generic this or make a config manager
export class EditorConfig
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

    /** Safely loads runtime configuration from localStorage, if any */
    public constructor(load: boolean)
    {
        let settings = window.localStorage.getItem('settings');

        if (!load || !settings)
            return;

        try
        {
            let config = JSON.parse(settings);
            Object.assign(this, config);
        }
        catch (e)
        {
            alert( L.CONFIG_LOAD_FAIL(e.message) );
            console.error(e);
        }
    }

    /** Safely saves runtime configuration to localStorage */
    public save() : void
    {
        try
        {
            window.localStorage.setItem( 'settings', JSON.stringify(this) );
        }
        catch (e)
        {
            alert( L.CONFIG_SAVE_FAIL(e.message) );
            console.error(e);
        }
    }

    /** Safely deletes runtime configuration from localStorage and resets state */
    public reset() : void
    {
        try
        {
            Object.assign( this, new EditorConfig(false) );
            window.localStorage.removeItem('settings');
        }
        catch (e)
        {
            alert( L.CONFIG_RESET_FAIL(e.message) );
            console.error(e);
        }
    }
}