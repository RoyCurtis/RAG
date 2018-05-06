/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Represents context data for a phrase, to be passed to an element processor */
interface PhraseContext
{
    /** Gets the current phrase element being processed */
    element:   HTMLElement;
    /** Gets the XML document representing all the loaded phrase sets */
    phraseSet: Document;
}