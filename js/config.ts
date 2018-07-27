/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Holds runtime configuration */
class Config
{
    /** Choice of speech engine to use, as getVoices index */
    public voxChoice : number = 0;
    /** Volume for speech to be set at */
    public voxVolume : number = 1.0;
    /** Pitch for speech to be set at */
    public voxPitch  : number = 1.0;
    /** Rate for speech to be set at */
    public voxRate   : number = 1.0;

    public constructor()
    {
        let voices = window.speechSynthesis.getVoices();

        // Select English voices by default
        for (let i = 0; i < voices.length ; i++)
        {
            let lang = voices[i].lang;

            if (lang === 'en-GB' || lang === 'en-US')
            {
                this.voxChoice = i;
                break;
            }
        }
    }

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