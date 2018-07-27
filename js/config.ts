/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Holds runtime configuration */
class Config
{
    /** Choice of speech engine to use, as getVoices index */
    voxChoice : number = 0;
    /** Volume for speech to be set at */
    voxVolume : number = 1.0;
    /** Pitch for speech to be set at */
    voxPitch  : number = 1.0;
    /** Rate for speech to be set at */
    voxRate   : number = 1.0;

    /** Safely loads runtime configuration from localStorage, if any */
    public load() : void
    {
        if (!window.localStorage['settings'])
            return;

        try
        {
            let config = JSON.parse(window.localStorage['settings']);
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
            window.localStorage['settings'] = JSON.stringify(this);
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
            Object.assign(this, new Config());
            window.localStorage.removeItem('settings');
        }
        catch (e)
        {
            alert( L.CONFIG_RESET_FAIL(e.message) );
            console.error(e);
        }
    }
}