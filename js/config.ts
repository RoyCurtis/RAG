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
            alert(`Could not load settings: ${e.message}`);
            console.error(e);
        }
    }

    public save() : void
    {
        try
        {
            window.localStorage['settings'] = JSON.stringify(this);
        }
        catch (e)
        {
            alert(`Could not save settings: ${e.message}`);
            console.error(e);
        }
    }

    public reset() : void
    {
        window.localStorage.removeItem('settings');
        Object.assign( this, new Config() );
    }
}