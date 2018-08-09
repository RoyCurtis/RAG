/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Custom voice that synthesizes speech by piecing pre-recorded files together */
class CustomVoice
{
    /** Changeable base path for all custom voices */
    public static basePath : string = 'data/vox';

    /** Only present for consistency with SpeechSynthesisVoice */
    public readonly default      : boolean;
    /** Gets the BCP 47 tag indicating the language of this voice */
    public readonly lang         : string;
    /** Only present for consistency with SpeechSynthesisVoice */
    public readonly localService : boolean;
    /** Gets the canonical name of this voice */
    public readonly name         : string;
    /** Gets the relative URI of this voice's files */
    public readonly voiceURI     : string;

    public constructor(name: string, lang: string)
    {
        this.default      = false;
        this.localService = false;
        this.name         = `RAG-VOX ${name}`;
        this.lang         = lang;
        this.voiceURI     = `${CustomVoice.basePath}/${name}_${lang}`;
    }
}