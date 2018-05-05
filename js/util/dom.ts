/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Utility methods for dealing with the DOM */
class DOM
{
    /**
     * Finds an element from the given document, throwing an error if no match is found.
     *
     * @param {string} query CSS selector query to use
     * @param {Document} parent Parent object to search; defaults to document
     * @returns {Element} The first element to match the given query
     */
    public static require(query: string, parent: ParentNode = window.document)
        : HTMLElement
    {
        let result = parent.querySelector(query) as HTMLElement;

        if (!result)
            throw new Error(`Required DOM element is missing: '${query}'`);

        return result;
    }

    /**
     * Gets the text content of the given element, excluding the text of hidden children.
     *
     * @see https://stackoverflow.com/a/19986328
     * @param {Element} element Element to recursively get text content of
     * @returns {string} Text content of given element, without text of hidden children
     */
    public static getVisibleText(element: Element) : string
    {
        if (element.nodeType === Node.TEXT_NODE)
            return element.textContent || '';

        let style = getComputedStyle(element);

        if (style && style.display === 'none')
            return '';

        let text = '';
        for (let i = 0; i < element.childNodes.length; i++)
            text += DOM.getVisibleText(element.childNodes[i] as Element);

        return text;
    }
}