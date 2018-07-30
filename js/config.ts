/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Holds runtime configuration */
class Config
{
    /** Volume for speech to be set at */
    public  voxVolume      : number = 1.0;
    /** Pitch for speech to be set at */
    public  voxPitch       : number = 1.0;
    /** Rate for speech to be set at */
    public  voxRate        : number = 1.0;
    /** Choice of speech voice to use, as getVoices index or -1 if unset */
    private _voxChoice     : number = -1;
    /** If user has clicked shuffle at least once */
    public clickedGenerate : boolean = false;

    /**
     * Choice of speech voice to use, as getVoices index. Because of the async nature of
     * getVoices, the default value will be fetched from it each time.
     */
    get voxChoice() : number
    {
        // If there's a user-defined value, use that
        if  (this._voxChoice !== -1)
            return this._voxChoice;

        // Select English voices by default
        for (let i = 0, v = RAG.speech.getVoices(); i < v.length ; i++)
        {
            let lang = v[i].lang;

            if (lang === 'en-GB' || lang === 'en-US')
                return i;
        }

        // Else, first voice on the list
        return 0;
    }

    set voxChoice(value: number)
    {
        this._voxChoice = value;
    }

    /** Safely loads runtime configuration from localStorage, if any */
    public constructor(load: boolean)
    {
        if (!load || !window.localStorage['settings'])
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
            Object.assign( this, new Config(false) );
            window.localStorage.removeItem('settings');
        }
        catch (e)
        {
            alert( L.CONFIG_RESET_FAIL(e.message) );
            console.error(e);
        }
    }
}