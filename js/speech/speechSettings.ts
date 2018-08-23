/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Type definition for speech config overrides passed to the speak method */
interface SpeechSettings
{
    /** Whether to force use of the VOX engine */
    useVox?    : boolean;
    /** Override absolute or relative URL of VOX voice to use */
    voxPath?   : string;
    /** Override choice of reverb to use */
    voxReverb? : string;
    /** Override choice of chime to use */
    voxChime?  : string;
    /** Override choice of voice */
    voiceIdx?  : number;
    /** Override volume of voice */
    volume?    : number;
    /** Override pitch of voice */
    pitch?     : number;
    /** Override rate of voice */
    rate?      : number;
}