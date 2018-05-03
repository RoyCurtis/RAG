/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Utility methods for dealing with the DOM */
class DOM
{
    /**
     * Finds an element from the given document, throwing an error if no match is found.
     *
     * @param {string} query CSS selector query to use
     * @param {Document} document Document object to search; defaults to window
     * @returns {Element} The first element to match the given query
     */
    public static require(query: string, document: Document = window.document) : Element
    {
        let result = document.querySelector(query);

        if (!result)
            throw new Error(`Required DOM element is missing: '${query}'`);

        return result;
    }
}