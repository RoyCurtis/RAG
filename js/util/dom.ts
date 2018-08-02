/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Utility methods for dealing with the DOM */
class DOM
{
    /** Whether the window is thinner than a specific size (and, thus, is "mobile") */
    public static get isMobile() : boolean
    {
        return document.body.clientWidth <= 500;
    }

    /** Whether RAG appears to be running on an iOS device */
    public static get isiOS() : boolean
    {
        return navigator.platform.match(/iPhone|iPod|iPad/gi) !== null;
    }

    /**
     * Finds the value of the given attribute from the given element, or returns the given
     * default value if unset.
     *
     * @param element Element to get the attribute of
     * @param attr Name of the attribute to get the value of
     * @param def Default value if attribute isn't set
     * @returns The given attribute's value, or default value if unset
     */
    public static getAttr(element: HTMLElement, attr: string, def: string) : string
    {
        return element.hasAttribute(attr)
            ? element.getAttribute(attr)!
            : def;
    }

    /**
     * Finds an element from the given document, throwing an error if no match is found.
     *
     * @param query CSS selector query to use
     * @param parent Parent object to search; defaults to document
     * @returns The first element to match the given query
     */
    public static require<T extends HTMLElement>
        (query: string, parent: ParentNode = window.document)
        : T
    {
        let result = parent.querySelector(query) as T;

        if (!result)
            throw Error( L.DOM_MISSING(query) );

        return result;
    }

    /**
     * Finds the value of the given attribute from the given element, throwing an error
     * if the attribute is missing.
     *
     * @param element Element to get the attribute of
     * @param attr Name of the attribute to get the value of
     * @returns The given attribute's value
     */
    public static requireAttr(element: HTMLElement, attr: string) : string
    {
        if ( !element.hasAttribute(attr) )
            throw Error( L.ATTR_MISSING(attr) );

        return element.getAttribute(attr)!;
    }

    /**
     * Finds the value of the given key of the given element's dataset, throwing an error
     * if the value is missing or empty.
     *
     * @param element Element to get the data of
     * @param key Key to get the value of
     * @returns The given dataset's value
     */
    public static requireData(element: HTMLElement, key: string) : string
    {
        let value = element.dataset[key];

        if ( Strings.isNullOrEmpty(value) )
            throw Error( L.DATA_MISSING(key) );

        return value!;
    }

    /**
     * Blurs (unfocuses) the currently focused element.
     *
     * @param parent If given, only blurs if active is descendant
     */
    public static blurActive(parent: HTMLElement = document.body) : void
    {
        let active = document.activeElement as HTMLElement;

        if ( active && active.blur && parent.contains(active) )
            active.blur();
    }

    /**
     * Deep clones all the children of the given element, into the target element.
     * Using innerHTML would be easier, however it handles self-closing tags poorly.
     *
     * @param source Element whose children to clone
     * @param target Element to append the cloned children to
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
     * @param element Element to recursively get text content of
     * @returns Text content of given element, without text of hidden children
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
     * @param element Element to recursively get text content of
     * @returns Cleaned text of given element, without text of hidden children
     */
    public static getCleanedVisibleText(element: Element) : string
    {
        return DOM.getVisibleText(element)
            .trim()
            .replace(/[\n\r]/gi, '')
            .replace(/\s{2,}/gi, ' ')
            .replace(/\s([.,])/gi, '$1');
    }

    /**
     * Scans for the next focusable sibling from a given element, skipping hidden or
     * unfocusable elements. If the end of the container is hit, the scan wraps around.
     *
     * @param from Element to start scanning from
     * @param dir Direction; -1 for left (previous), 1 for right (next)
     * @returns The next available sibling, or null if none found
     */
    public static getNextFocusableSibling(from: HTMLElement, dir: number)
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
                throw Error( L.BAD_DIRECTION( dir.toString() ) );

            // If we've come back to the starting element, nothing was found
            if (current === from)
                return null;

            // If this element isn't hidden and is focusable, return it!
            if ( !current.classList.contains('hidden') )
            if ( current.hasAttribute('tabindex') )
                return current;
        }
    }
}