/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import * as fs from "fs";

/** Holds vox editor runtime configuration */
export class EditorConfig
{
    /** Recording device ID to use */
    public  deviceId   : string = 'default';
    /** Path of voice that was last being edited */
    private _voicePath : string = '';

    /**
     * Path of voice that was last being edited. If it no longer exists, it's reset to
     * the default blank string upon get.
     */
    get voicePath(): string
    {
        let path = this._voicePath;

        // Reset paths that no longer exist
        if ( !fs.existsSync(path) || !fs.lstatSync(path).isDirectory() )
            this._voicePath = '';

        return this._voicePath;
    }

    /** Sets the path of the voice that was last edited */
    set voicePath(value: string)
    {
        this._voicePath = value;
    }

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