/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

///<reference path="configBase.ts"/>

/** Holds runtime configuration for RAG */
class Config extends ConfigBase<Config>
{
    /** If user has clicked shuffle at least once */
    public  clickedGenerate : boolean = false;
    /** Volume for speech to be set at */
    public  speechVol       : number  = 1.0;
    /** Pitch for speech to be set at */
    public  speechPitch     : number  = 1.0;
    /** Rate for speech to be set at */
    public  speechRate      : number  = 1.0;
    /** Whether to use the VOX engine */
    public  voxEnabled      : boolean = true;
    /** Relative or absolute URL of the VOX voice to use */
    public  voxPath         : string  = 'https://roycurtis.github.io/RAG-VOX-Roy';
    /** Relative or absolute URL of the custom VOX voice to use */
    public  voxCustomPath   : string  = '';
    /** VOX key of the chime to use prior to speaking */
    public  voxChime        : string  = '';
    /** Choice of speech voice to use, as getVoices index or -1 if unset */
    private _speechVoice    : number  = -1;
    /** Impulse response to use for VOX's reverb */
    private _voxReverb      : string  = 'ir.stalbans.wav';

    /**
     * Choice of speech voice to use, as getVoices index. Because of the async nature of
     * getVoices, the default value will be fetched from it each time.
     */
    get speechVoice() : number
    {
        // TODO: this is probably better off using voice names
        // If there's a user-defined value, use that
        if  (this._speechVoice !== -1)
            return this._speechVoice;

        // Select English voices by default
        for (let i = 0, v = RAG.speech.browserVoices; i < v.length ; i++)
        {
            let lang = v[i].lang;

            if (lang === 'en-GB' || lang === 'en-US')
                return i;
        }

        // Else, first voice on the list
        return 0;
    }

    /** Sets the choice of speech to use, as getVoices index */
    set speechVoice(value: number)
    {
        this._speechVoice = value;
    }

    /** Gets the impulse response file to use for VOX engine's reverb */
    get voxReverb() : string
    {
        // Reset choice of reverb if it's invalid
        let choices = Object.keys(VoxEngine.REVERBS);

        if ( !choices.includes(this._voxReverb) )
            this._voxReverb = choices[0];

        return this._voxReverb;
    }

    /** Sets the impulse response file to use for VOX engine's reverb */
    set voxReverb(value: string)
    {
        this._voxReverb = value;
    }

    public constructor(autoLoad: boolean = false)
    {
        super(Config);

        if (autoLoad)
            this.load();
    }
}