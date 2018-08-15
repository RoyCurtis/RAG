/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Utility class for resolving a given phrase to vox keys */
class Resolver
{

    public static toVox(phrase: HTMLElement) : VoxKey[]
    {
        // First, walk through the phrase and "flatten" it into an array of parts. This is
        // so the resolver can look-ahead or look-behind.

        let flattened : Node[]   = [];
        let resolved  : VoxKey[] = [];
        let treeWalker = document.createTreeWalker(
            phrase,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
            { acceptNode: Resolver.nodeFilter },
            false
        );

        while ( treeWalker.nextNode() )
        if (treeWalker.currentNode.textContent!.trim() !== '')
            flattened.push(treeWalker.currentNode);

        // Then, resolve all the phrases' nodes into vox keys

        flattened.forEach( (v, i) =>
        {
            resolved.push( ...Resolver.resolve(v, flattened, i) );
        });

        console.log(flattened);
        return resolved;
    }

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

        // Accept text only from phrase and phrasesets
        if (node.nodeType === Node.TEXT_NODE)
        if (parentType !== 'phraseset' && parentType !== 'phrase')
            return NodeFilter.FILTER_SKIP;

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

    /**
     * Uses the type and value of the given node, to resolve it to vox file IDs.
     *
     * @param node Node to resolve to vox IDs
     * @param phrase Flattened array of nodes that make up the whole phrase
     * @param idx Index of the node being resolved relative to the phrase array
     * @returns Array of IDs that make up one or more file IDs. Can be empty.
     */
    public static resolve(node: Node, phrase: Node[], idx: number) : VoxKey[]
    {
        if (node.nodeType === Node.TEXT_NODE)
            return this.resolveText(node);

        let element = node as HTMLElement;
        let type    = element.dataset['type'];

        switch (type)
        {
            case 'coach':       return this.resolveCoach(element);
            case 'excuse':      return this.resolveExcuse();
            case 'integer':     return this.resolveInteger(element);
            case 'named':       return this.resolveNamed();
            case 'platform':    return this.resolvePlatform(element);
            case 'service':     return this.resolveService(element);
            case 'station':     return this.resolveStation(element, phrase, idx);
            case 'stationlist': return this.resolveStationList(element);
            case 'time':        return this.resolveTime(element);
        }

        return [];
    }

    private static resolveText(node: Node) : VoxKey[]
    {
        let parent = node.parentElement!;
        let type   = parent.dataset['type'];
        let text   = Strings.clean(node.textContent!);
        let set    = [];

        // If text is just a full stop, return silence
        if (text === '.')
            return [0.5];

        // If it begins with a full stop, add silence
        if ( text.startsWith('.') )
            set.push(0.5);

        // If the text doesn't contain any words, skip
        if ( !text.match(/[a-z0-9]/i) )
            return [];

        // If type is missing, parent is a wrapper
        if (!type)
        {
            parent = parent.parentElement!;
            type   = parent.dataset['type'];
        }

        let ref = parent.dataset['ref'];
        let idx = DOM.nodeIndexOf(node);
        let id  = `phrase.${ref}`;

        // Append index of phraseset's choice of phrase
        if (type === 'phraseset')
            id += `.${parent.dataset['idx']}`;

        id += `.${idx}`;
        set.push(id);

        // If text ends with a full stop, add silence
        if ( text.endsWith('.') )
            set.push(0.5);

        return set;
    }

    private static resolveCoach(element: HTMLElement) : VoxKey[]
    {
        let ctx   = element.dataset['context']!;
        let coach = RAG.state.getCoach(ctx);

        return [0.1, `letter.${coach}`, 0.1];
    }

    private static resolveExcuse() : VoxKey[]
    {
        let excuse = RAG.state.excuse;
        let index  = RAG.database.excuses.indexOf(excuse);

        // TODO: Error handling
        return [0.1, `excuse.${index}`, 0.1];
    }

    private static resolveInteger(element: HTMLElement) : VoxKey[]
    {
        let ctx      = element.dataset['context']!;
        let singular = element.dataset['singular'];
        let plural   = element.dataset['plural'];
        let integer  = RAG.state.getInteger(ctx);
        let parts    = [0.1, `number.mid.${integer}`];

        if      (singular && integer === 1)
            parts.push(0.1, `number.suffix.${singular}`);
        else if (plural   && integer !== 1)
            parts.push(0.1, `number.suffix.${plural}`);

        return parts;
    }

    private static resolveNamed() : VoxKey[]
    {
        let named = Strings.filename(RAG.state.named);

        return [0.1, `named.${named}`, 0.1];
    }

    private static resolvePlatform(element: HTMLElement) : VoxKey[]
    {
        let platform = RAG.state.platform;
        let vox      = element.dataset['vox'] || 'mid';
        let key      = `number.${vox}.${platform[0]}${platform[1]}`;

        return [0.1, key, 0.1];
    }

    private static resolveService(element: HTMLElement) : VoxKey[]
    {
        let ctx     = element.dataset['context']!;
        let service = Strings.filename( RAG.state.getService(ctx) );

        return [0.1, `service.${service}`, 0.1];
    }

    private static resolveStation(element: HTMLElement, phrase: Node[], idx: number)
        : VoxKey[]
    {
        let ctx     = element.dataset['context']!;
        let station = RAG.state.getStation(ctx);
        let next    = phrase[idx + 1];
        let type    = 'mid';

        if (!next || next.textContent!.trim() === '.')
            type = 'end';

        return [0.1, `station.${type}.${station}`, 0.1];
    }

    private static resolveStationList(element: HTMLElement) : VoxKey[]
    {
        let ctx  = element.dataset['context']!;
        let list = RAG.state.getStationList(ctx);

        let parts : VoxKey[] = [0.1];

        list.forEach( (v, k) =>
        {
            // Handle end of list inflection
            if (k === list.length - 1)
            {
                // Add "and" if list has more than 1 station and this is the end
                if (list.length > 1)
                    parts.push(0.15, 'station.parts.and', 0.15);

                parts.push(`station.end.${v}`);
            }
            else
                parts.push(`station.mid.${v}`, 0.25);
        });

        // Add "only" if only one station in the calling list
        if (list.length === 1 && ctx === 'calling')
            parts.push(0.1, 'station.parts.only');

        return [...parts, 0.2];
    }

    private static resolveTime(element: HTMLElement) : VoxKey[]
    {
        let ctx   = element.dataset['context']!;
        let time  = RAG.state.getTime(ctx).split(':');

        let parts : VoxKey[] = [0.1];

        if (time[0] === '00' && time[1] === '00')
            return [...parts, 'number.0000'];

        // Hours
        parts.push(`number.mid.${time[0]}`);

        if (time[1] === '00')
            parts.push('number.mid.hundred');
        else
            parts.push(0.1, `number.mid.${time[1]}`);

        return [...parts, 0.05];
    }
}