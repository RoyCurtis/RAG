/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Represents context data for a phrase, to be passed to an element processor */
interface PhraseContext
{
    /** Gets the XML phrase element that is being replaced */
    xmlElement : HTMLElement;
    /** Gets the HTML span element that is replacing the XML element */
    newElement : HTMLSpanElement;
}