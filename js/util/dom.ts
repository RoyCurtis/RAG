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
     * Finds the value of the given attribute from the given element, throwing an error
     * if the attribute is missing.
     *
     * @param {HTMLElement} element Element to get the attribute of
     * @param {string} attr Name of the attribute to get the value of
     * @returns {string} The given attribute's value
     */
    public static requireAttr(element: HTMLElement, attr: string) : string
    {
        if ( !element.hasAttribute(attr) )
            throw new Error(`Required attribute is missing: '${attr}'`);

        return element.getAttribute(attr)!;
    }

    /**
     * Finds the value of the given key of the given element's dataset, throwing an error
     * if the value is missing or empty.
     *
     * @param {HTMLElement} element Element to get the data of
     * @param {string} key Key to get the value of
     * @returns {string} The given dataset's value
     */
    public static requireData(element: HTMLElement, key: string) : string
    {
        let value = element.dataset[key];

        if ( Strings.isNullOrEmpty(value) )
            throw new Error(`Required dataset key is missing or empty: '${key}'`);

        return value!;
    }

    /**
     * Deep clones all the children of the given element, into the target element.
     * Using innerHTML would be easier, however it handles self-closing tags poorly.
     *
     * @param {HTMLElement} source Element whose children to clone
     * @param {HTMLElement} target Element to append the cloned children to
     */
    public static cloneInto(source: HTMLElement, target: HTMLElement) : void
    {
        for (let i = 0; i < source.childNodes.length; i++)
            target.appendChild( source.childNodes[i].cloneNode(true) );
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
        // This next conditional is RAG-specific; be warned!
        else if ( element.classList.contains('toggle') )
            return '';

        let style = getComputedStyle(element);

        if (style && style.display === 'none')
            return '';

        let text = '';
        for (let i = 0; i < element.childNodes.length; i++)
            text += DOM.getVisibleText(element.childNodes[i] as Element);

        return text;
    }

    /**
     * Gets the text content of the given element, excluding the text of hidden children,
     * and excess whitespace as a result of converting from HTML/XML.
     *
     * @see https://stackoverflow.com/a/19986328
     * @param {Element} element Element to recursively get text content of
     * @returns {string} Cleaned text of given element, without text of hidden children
     */
    public static getCleanedVisibleText(element: Element) : string
    {
        return DOM.getVisibleText(element)
            .trim()
            .replace(/[\n\r]/gi, '')
            .replace(/\s{2,}/gi, ' ')
            .replace(/\s([.,])/gi, '$1');
    }

    public static getNextVisibleSibling(from: HTMLElement, dir: number)
        : HTMLElement | null
    {
        let current = from;
        let parent  = from.parentElement;

        if (!parent)
            return null;

        while (true)
        {
            // Proceed to next element, or wrap around if hit the end of parent
            if      (dir < 0)
                current = current.previousElementSibling as HTMLElement
                    || parent.lastElementChild as HTMLElement;
            else if (dir > 0)
                current = current.nextElementSibling as HTMLElement
                    || parent.firstElementChild as HTMLElement;
            else
                throw new Error("Direction needs to be -1 or 1");

            // If we've come back to the starting element, nothing was found
            if (current === from)
                return null;

            // If this element isn't hidden, return it!
            if ( !current.classList.contains('hidden') )
                return current;
        }
    }

    /**
     * Swaps one element with another.
     *
     * @see https://stackoverflow.com/a/10717422
     * @param {Element} obj1 Element to swap with second element
     * @param {Element} obj2 Element to swap with first element
     */
    public static swap(obj1: Element, obj2: Element) : void
    {
        if (!obj1.parentNode || !obj2.parentNode)
            throw new Error("Parent node required for swapping");

        // Create marker element and insert it where obj1 is
        let temp = document.createElement("div");
        obj1.parentNode.insertBefore(temp, obj1);

        // Move obj1 to right before obj2
        obj2.parentNode.insertBefore(obj1, obj2);

        // Move obj2 to right before where obj1 used to be
        temp.parentNode!.insertBefore(obj2, temp);

        // Remove temporary marker node
        temp.parentNode!.removeChild(temp);
    }
}