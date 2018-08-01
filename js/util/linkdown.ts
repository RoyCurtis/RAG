/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** A very, very small subset of Markdown for hyperlinking a block of text */
class Linkdown
{
    /** Regex pattern for matching linked text */
    private static readonly REGEX_LINK = /\[(.+?)\]/gi;
    /** Regex pattern for matching link references */
    private static readonly REGEX_REF  = /\[(\d+)\]:\s+(\S+)/gi;

    /**
     * Parses the text of the given block as Linkdown, converting tagged text into links
     * using a given list of index-based references.
     *
     * @param block Element with text to replace; all children cleared
     */
    public static parse(block: HTMLElement) : void
    {
        let links : string[] = [];

        // First, get the list of references, removing them from the text
        let idx  = 0;
        let text = block.innerText.replace(this.REGEX_REF, (_, k, v) =>
        {
            links[ parseInt(k) ] = v;
            return '';
        });

        // Then, replace each tagged part of text with a link element
        block.innerHTML = text.replace(this.REGEX_LINK, (_, t) =>
            `<a href='${links[idx++]}' target="_blank" rel="noopener">${t}</a>`
        );
    }
}