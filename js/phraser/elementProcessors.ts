/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Holds methods for processing each type of phrase element into HTML, with data */
class ElementProcessors
{
    /** Picks a coach letter from A to Z, limited by amount of coaches */
    public static coach(ctx: PhraseContext)
    {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');

        ctx.newElement.title       = `Click to change this coach ('${context}')`;
        ctx.newElement.textContent = RAG.state.getCoach(context);

        ctx.newElement.dataset['context'] = context;
    }

    /** Picks an excuse for a delay or cancellation */
    public static excuse(ctx: PhraseContext)
    {
        ctx.newElement.title       = `Click to change this excuse`;
        ctx.newElement.textContent = RAG.state.excuse;
    }

    /** Picks a whole number, with optional limits, noun and in word form */
    public static integer(ctx: PhraseContext)
    {
        let context  = DOM.requireAttr(ctx.xmlElement, 'context');
        let singular = ctx.xmlElement.getAttribute('singular');
        let plural   = ctx.xmlElement.getAttribute('plural');
        let words    = ctx.xmlElement.getAttribute('words');

        let int    = RAG.state.getInteger(context);
        let intStr = (words && words.toLowerCase() === 'true')
            ? Phraser.DIGITS[int]
            : int.toString();

        if      (int === 1 && singular)
            intStr += ` ${singular}`;
        else if (int !== 1 && plural)
            intStr += ` ${plural}`;

        ctx.newElement.title       = `Click to change this number ('${context}')`;
        ctx.newElement.textContent = intStr;

        ctx.newElement.dataset['context'] = context;

        if (singular) ctx.newElement.dataset['singular'] = singular;
        if (plural)   ctx.newElement.dataset['plural']   = plural;
        if (words)    ctx.newElement.dataset['words']    = words;
    }

    /** Picks a named train */
    public static named(ctx: PhraseContext)
    {
        ctx.newElement.title       = "Click to change this train's name";
        ctx.newElement.textContent = RAG.state.named;
    }

    /** Includes a previously defined phrase, by its `id` */
    public static phrase(ctx: PhraseContext)
    {
        let ref    = DOM.requireAttr(ctx.xmlElement, 'ref');
        let phrase = RAG.database.getPhrase(ref);

        ctx.newElement.title          = '';
        ctx.newElement.dataset['ref'] = ref;

        if (!phrase)
        {
            ctx.newElement.textContent = `(UNKNOWN PHRASE: ${ref})`;
            return;
        }

        // Handle phrases with a chance value as collapsible
        if ( ctx.xmlElement.hasAttribute('chance') )
            this.makeCollapsible(ctx, phrase, ref);
        else
            DOM.cloneInto(phrase, ctx.newElement);
    }

    /** Picks a phrase from a previously defined phraseset, by its `id` */
    public static phraseset(ctx: PhraseContext)
    {
        let ref       = DOM.requireAttr(ctx.xmlElement, 'ref');
        let phraseset = RAG.database.getPhraseset(ref);

        ctx.newElement.dataset['ref'] = ref;

        if (!phraseset)
        {
            ctx.newElement.textContent = `(UNKNOWN PHRASESET: ${ref})`;
            return;
        }

        let idx    = RAG.state.getPhrasesetIdx(ref);
        let phrase = phraseset.children[idx] as HTMLElement;

        ctx.newElement.dataset['idx'] = idx.toString();

        ctx.newElement.title =
            `Click to change this phrase used in this section ('${ref}')`;

        // Handle phrasesets with a chance value as collapsible
        if ( ctx.xmlElement.hasAttribute('chance') )
            this.makeCollapsible(ctx, phrase, ref);
        else
            DOM.cloneInto(phrase, ctx.newElement);
    }

    /** Gets the current platform number */
    public static platform(ctx: PhraseContext)
    {
        ctx.newElement.title       = "Click to change the platform number";
        ctx.newElement.textContent = RAG.state.platform.join('');
    }

    /** Picks a rail network name */
    public static service(ctx: PhraseContext)
    {
        ctx.newElement.title       = "Click to change this train's network";
        ctx.newElement.textContent = RAG.state.service;
    }

    /** Picks a station name */
    public static station(ctx: PhraseContext)
    {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        let code    = RAG.state.getStation(context);

        ctx.newElement.title       = `Click to change this station ('${context}')`;
        ctx.newElement.textContent = RAG.database.getStation(code, true);

        ctx.newElement.dataset['context'] = context;
    }

    /** Picks a selection of stations */
    public static stationlist(ctx: PhraseContext)
    {
        let context     = DOM.requireAttr(ctx.xmlElement, 'context');
        let stations    = RAG.state.getStationList(context).slice(0);
        let stationList = Strings.fromStationList(stations, context);

        ctx.newElement.title       = `Click to change this station list ('${context}')`;
        ctx.newElement.textContent = stationList;

        ctx.newElement.dataset['context'] = context;
    }

    /** Picks a 24 hour time, with hours and minutes */
    public static time(ctx: PhraseContext)
    {
        ctx.newElement.title       = "Click to change the time";
        ctx.newElement.textContent = RAG.state.time;
    }

    /** Handles unknown elements in an inline error message */
    public static unknown(ctx: PhraseContext)
    {
        let name = ctx.xmlElement.nodeName;

        ctx.newElement.textContent = `(UNKNOWN XML ELEMENT: ${name})`;
    }

    /**
     * Clones the children of the given element into a new inner span tag, so that they
     * can be made collapsible. Appends it to the new element being processed.
     */
    private static makeCollapsible(ctx: PhraseContext, source: HTMLElement, ref: string)
        : void
    {
        let chance    = ctx.xmlElement.getAttribute('chance')!;
        let inner     = document.createElement('span');
        let toggle    = document.createElement('span');
        let collapsed = RAG.state.getCollapsed( ref, parseInt(chance) );

        inner.classList.add('inner');
        toggle.classList.add('toggle');

        DOM.cloneInto(source, inner);
        ctx.newElement.dataset['chance'] = chance;

        Collapsibles.set(ctx.newElement, toggle, collapsed);
        ctx.newElement.appendChild(toggle);
        ctx.newElement.appendChild(inner);
    }
}