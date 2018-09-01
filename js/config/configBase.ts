/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Base class for configuration objects, that can save, load, and reset themselves */
abstract class ConfigBase<T extends ConfigBase<T>>
{
    /** localStorage key where config is expected to be stored */
    private static readonly SETTINGS_KEY : string = 'settings';

    /** Prototype object for creating new copies of self */
    private type : (new () => T);

    protected constructor( type: (new () => T) )
    {
        this.type = type;
    }

    /** Safely loads runtime configuration from localStorage, if any */
    public load() : void
    {
        let settings = window.localStorage.getItem(ConfigBase.SETTINGS_KEY);

        if (!settings)
            return;

        try
        {
            let config = JSON.parse(settings);
            Object.assign(this, config);
        }
        catch (err)
        {
            alert( L.CONFIG_LOAD_FAIL(err.message) );
            console.error(err);
        }
    }

    /** Safely saves this configuration to localStorage */
    public save() : void
    {
        try
        {
            window.localStorage.setItem( ConfigBase.SETTINGS_KEY, JSON.stringify(this) );
        }
        catch (err)
        {
            alert( L.CONFIG_SAVE_FAIL(err.message) );
            console.error(err);
        }
    }

    /** Safely deletes this configuration from localStorage and resets state */
    public reset() : void
    {
        try
        {
            Object.assign( this, new this.type() );
            window.localStorage.removeItem(ConfigBase.SETTINGS_KEY);
        }
        catch (err)
        {
            alert( L.CONFIG_RESET_FAIL(err.message) );
            console.error(err);
        }
    }
}