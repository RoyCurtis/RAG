/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Type definition for speech config overrides passed to the speak method */
interface SpeechSettings
{
    /** Override choice of voice */
    voiceIdx?: number;
    /** Override volume of voice */
    volume?: number;
    /** Override pitch of voice */
    pitch?: number;
    /** Override rate of voice */
    rate?: number;
}