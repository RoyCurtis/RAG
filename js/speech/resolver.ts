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
     * @returns Array of IDs that make up one or more file IDs. Can be empty.
     */
    public resolve(node: Node) : VoxKey[]
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
            case 'platform':    return this.resolvePlatform();
            case 'service':     return this.resolveService(element);
            case 'station':     return this.resolveStation(element);
            case 'stationlist': return this.resolveStationList(element);
            case 'time':        return this.resolveTime(element);
        }

        return [];
    }

    /** Resolve text nodes from phrases and phrasesets to ID strings */
    private resolveText(node: Node) : VoxKey[]
    {
        let parent = node.parentElement!;
        let type   = parent.dataset['type'];
        let text   = Strings.clean(node.textContent!);

        // If text is just a full stop, return silence
        if (text === '.')
            return [250];

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
        let set = [];

        // Append index of phraseset's choice of phrase
        if (type === 'phraseset')
            id += `.${parent.dataset['idx']}`;

        id += `.${idx}`;
        set.push(id);

        // If text ends with a full stop, add silence
        if ( text.endsWith('.') )
            set.push(250);

        return set;
    }

    /** Resolve ID from a given coach element and current state */
    private resolveCoach(element: HTMLElement) : string[]
    {
        let ctx   = element.dataset['context']!;
        let coach = RAG.state.getCoach(ctx);

        return [`letter.${coach}`];
    }

    /** Resolve ID from a given excuse element and current state */
    private resolveExcuse() : string[]
    {
        let excuse = RAG.state.excuse;
        let index  = RAG.database.excuses.indexOf(excuse);

        // TODO: Error handling
        return [`excuse.${index}`];
    }

    /** Resolve IDs from a given integer element and current state */
    private resolveInteger(element: HTMLElement) : string[]
    {
        let ctx      = element.dataset['context']!;
        let singular = element.dataset['singular'];
        let plural   = element.dataset['plural'];
        let integer  = RAG.state.getInteger(ctx);
        let parts    = [`number.${integer}`];

        if      (singular && integer === 1)
            parts.push(`number.suffix.${singular}`);
        else if (plural   && integer !== 1)
            parts.push(`number.suffix.${plural}`);

        return parts;
    }

    /** Resolve ID from a given named element and current state */
    private resolveNamed() : string[]
    {
        let named = Strings.filename(RAG.state.named);

        return [`named.${named}`];
    }

    /** Resolve IDs from a given platform element and current state */
    private resolvePlatform() : string[]
    {
        let platform = RAG.state.platform;
        let parts    = [];

        parts.push(`number.${platform[0]}`);

        if (platform[1])
            parts.push(`letter.${platform[1]}`);

        return parts;
    }

    /** Resolve ID from a given service element and current state */
    private resolveService(element: HTMLElement) : string[]
    {
        let ctx     = element.dataset['context']!;
        let service = Strings.filename( RAG.state.getService(ctx) );

        return [`service.${service}`];
    }

    /** Resolve ID from a given station element and current state */
    private resolveStation(element: HTMLElement) : string[]
    {
        let ctx     = element.dataset['context']!;
        let station = RAG.state.getStation(ctx);
        // TODO: Context sensitive types
        let type    = 'end';

        return [`station.end.${station}`];
    }

    /** Resolve IDs from a given station list element and current state */
    private resolveStationList(element: HTMLElement) : string[]
    {
        let ctx  = element.dataset['context']!;
        let list = RAG.state.getStationList(ctx);

        let parts : string[] = [];

        list.forEach( (v, k) =>
        {
            // Handle end of list inflection
            if (k === list.length - 1)
            {
                // Add "and" if list has more than 1 station and this is the end
                if (list.length > 1)
                    parts.push('station.parts.and');

                parts.push(`station.end.${v}`);
            }
            else
                parts.push(`station.middle.${v}`);
        });

        // Add "only" if only one station in the calling list
        if (list.length === 1 && ctx === 'calling')
            parts.push('station.parts.only');

        return parts;
    }

    /** Resolve IDs from a given time element and current state */
    private resolveTime(element: HTMLElement) : string[]
    {
        let ctx   = element.dataset['context']!;
        let time  = RAG.state.getTime(ctx).split(':');
        let parts = [];

        if (time[0] === '00' && time[1] === '00')
            return ['number.0000'];

        // Hours
        parts.push(`number.${time[0]}`);

        if (time[1] === '00')
            parts.push('number.hundred');
        else
            parts.push(`number.${time[1]}`);

        return parts;
    }
}