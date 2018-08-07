/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Utility class for resolving a given phrase element to a vox key */
class Resolver
{
    /** TreeWalker filter to reduce a walk to just the elements the resolver needs */
    public static nodeFilter(node: Node): number
    {
        let parent     = node.parentElement!;
        let parentType = parent.dataset['type'];

        // If type is missing, parent is a wrapper
        if (!parentType)
        {
            parent     = parent.parentElement!;
            parentType = parent.dataset['type'];
        }

        if (node.nodeType === Node.TEXT_NODE)
        {
            // Only accept text nodes with words in them
            if ( !node.textContent!.match(/[a-z0-9]/i) )
                return NodeFilter.FILTER_REJECT;

            // Accept text only from phrase and phrasesets
            if (parentType !== 'phraseset' && parentType !== 'phrase')
                return NodeFilter.FILTER_SKIP;
        }

        if (node.nodeType === Node.ELEMENT_NODE)
        {
            let element = node as HTMLElement;
            let type    = element.dataset['type'];

            // Reject collapsed elements and their children
            if ( element.hasAttribute('collapsed') )
                return NodeFilter.FILTER_REJECT;

            // Skip typeless (wrapper) elements
            if (!type)
                return NodeFilter.FILTER_SKIP;

            // Skip over phrase and phrasesets (instead, only going for their children)
            if (type === 'phraseset' || type === 'phrase')
                return NodeFilter.FILTER_SKIP;
        }

        return NodeFilter.FILTER_ACCEPT;
    }

    /** Keeps track of phrases' text node relative indexes */
    private phraseIdxs : Dictionary<number> = {};

    /**
     * Uses the type and value of the given node, to resolve it to vox file IDs.
     *
     * @param node Node to resolve to vox IDs
     * @returns Array of IDs that make up one or more file IDs. Can be empty.
     */
    public resolve(node: Node) : string[]
    {
        if (node.nodeType === Node.TEXT_NODE)
            return this.resolveText(node);

        return [];
    }

    /** Resolve text nodes from phrases and phrasesets to ID strings */
    private resolveText(node: Node) : string[]
    {
        let parent = node.parentElement!;
        let type   = parent.dataset['type'];

        // If type is missing, parent is a wrapper
        if (!type)
        {
            parent = parent.parentElement!;
            type   = parent.dataset['type'];
        }

        let ref = parent.dataset['ref'];
        let id  = `phrase.${ref}`;

        // Append index of phraseset's choice of phrase
        if (type === 'phraseset')
            id += `.${parent.dataset['idx']}`;

        if (!this.phraseIdxs[id])
            this.phraseIdxs[id] = 0;

        id += `.${this.phraseIdxs[id]++}`;

        return [id];
    }
}