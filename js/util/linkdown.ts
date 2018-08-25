/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** A very small subset of Markdown for hyperlinking a block of text */
class Linkdown
{
    /** Regex pattern for matching linked text */
    private static readonly REGEX_LINK = /\[(.+?)\]\[(\d+)\]/gi;
    /** Regex pattern for matching link references */
    private static readonly REGEX_REF  = /^\[(\d+)\]:\s+(\S+)$/gmi;

    /**
     * Attempts to load the given linkdown file, parse and set it as an element's text.
     *
     * @param path Relative or absolute URL to fetch the linkdown from
     * @param query DOM query for the object to put the text into
     */
    public static loadInto(path: string, query: string) : void
    {
        let dom = DOM.require(query);

        dom.innerText = `Loading text from '${path}'...`;

        fetch(path)
            .then( req => req.text() )
            .then( txt => dom.innerHTML = Linkdown.parse(txt) )
            .catch(err => dom.innerText = `Could not load '${path}': ${err}`);
    }

    /**
     * Parses the given text from Linkdown to HTML, converting tagged text into links
     * using a given list of references.
     *
     * @param text Linkdown text to transform to HTML
     */
    private static parse(text: string) : string
    {
        let links : Dictionary<string> = {};

        // First, sanitize any HTML
        text = text.replace('<', '&lt;').replace('>', '&gt;');

        // Then, get the list of references, removing them from the text
        text = text.replace(this.REGEX_REF, (_, k, v) =>
        {
            links[k] = v;
            return '';
        });

        // Finally, replace each tagged part of text with a link element
        return text.replace(this.REGEX_LINK, (_, t, k) =>
            `<a href='${links[k]}' target="_blank" rel="noopener">${t}</a>`
        );
    }
}