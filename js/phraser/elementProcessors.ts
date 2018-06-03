/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Holds methods for processing each type of phrase element into HTML, with data */
class ElementProcessors
{
    /** Picks a coach letter from A to Z, limited by amount of coaches */
    public static coach(ctx: PhraseContext)
    {
        ctx.newElement.textContent = Random.array("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }

    /** Picks an excuse for a delay or cancellation */
    public static excuse(ctx: PhraseContext)
    {
        ctx.newElement.textContent = RAG.database.pickExcuse();
    }

    /** Picks a whole number, with optional limits, noun and in word form */
    public static integer(ctx: PhraseContext)
    {
        let attrMin      = ctx.xmlElement.getAttribute('min');
        let attrMax      = ctx.xmlElement.getAttribute('max');
        let attrSingular = ctx.xmlElement.getAttribute('singular');
        let attrPlural   = ctx.xmlElement.getAttribute('plural');
        let attrWords    = ctx.xmlElement.getAttribute('words');

        if (!attrMin || !attrMax)
            throw new Error("Integer tag is missing required attributes");

        let intMin = parseInt(attrMin);
        let intMax = parseInt(attrMax);

        let int    = Random.int(intMin, intMax);
        let intStr = attrWords && attrWords.toLowerCase() === 'true'
            ? Phraser.DIGITS[int]
            : int.toString();

        if      (int === 1 && attrSingular)
            intStr += ` ${attrSingular}`;
        else if (int !== 1 && attrPlural)
            intStr += ` ${attrPlural}`;

        ctx.newElement.textContent = intStr;
    }

    /** Picks a named train */
    public static named(ctx: PhraseContext)
    {
        ctx.newElement.title       = "Click to change this train's name";
        ctx.newElement.textContent = RAG.state.named;
    }

    /** Makes the content of this tag optionally hidden, by chance or user choice */
    public static optional(ctx: PhraseContext)
    {
        // Populate the default chance value for XML tags missing them
        if ( !ctx.xmlElement.hasAttribute('chance') )
            ctx.xmlElement.setAttribute('chance', '50');

        this.makeCollapsible(ctx, ctx.xmlElement);
    }

    /** Includes a previously defined phrase, by its `id` */
    public static phrase(ctx: PhraseContext)
    {
        let ref    = DOM.requireAttrValue(ctx.xmlElement, 'ref');
        let phrase = ctx.phraseSet.querySelector('phrase#' + ref) as HTMLElement;

        ctx.newElement.dataset['ref'] = ref;

        if (!phrase)
        {
            ctx.newElement.textContent = `(UNKNOWN PHRASE: ${ref})`;
            return;
        }

        // Handle phrases with a chance value as collapsible
        if ( ctx.xmlElement.hasAttribute('chance') )
            this.makeCollapsible(ctx, phrase);
        else
            DOM.cloneInto(phrase, ctx.newElement);
    }

    /** Picks a phrase from a previously defined phraseset, by its `id` */
    public static phraseset(ctx: PhraseContext)
    {
        let ref       = DOM.requireAttrValue(ctx.xmlElement, 'ref');
        let phraseset = ctx.phraseSet.querySelector('phraseset#' + ref);

        ctx.newElement.dataset['ref'] = ref;

        if (!phraseset)
        {
            ctx.newElement.textContent = `(UNKNOWN PHRASESET: ${ref})`;
            return;
        }

        let phrase = Random.array(phraseset.children) as HTMLElement;

        // Handle phrasesets with a chance value as collapsible
        // TODO: redry these
        if ( ctx.xmlElement.hasAttribute('chance') )
            this.makeCollapsible(ctx, phrase);
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
        ctx.newElement.textContent = RAG.database.pickStation();
    }

    /** Picks a selection of stations */
    public static stationlist(ctx: PhraseContext)
    {
        let stations    = RAG.database.pickStations();
        let stationList = '';

        if (stations.length === 1)
            stationList = (ctx.xmlElement.id === 'calling')
                ? `${stations[0]} only`
                : stations[0];
        else
        {
            let lastStation = stations.pop();

            stationList  = stations.join(', ');
            stationList += ` and ${lastStation}`;
        }

        ctx.newElement.textContent = stationList;
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
    private static makeCollapsible(ctx: PhraseContext, source: HTMLElement) : void
    {
        let chance = ctx.xmlElement.getAttribute('chance')!;
        let inner  = document.createElement('span');

        inner.setAttribute('inner', 'true');

        DOM.cloneInto(source, inner);
        ctx.newElement.dataset['chance'] = chance;

        // Set initial collapse state from set chance
        if ( !Random.bool( parseInt(chance) ) )
        {
            ctx.newElement.setAttribute('collapsed', '');
            ctx.newElement.title = "Click to open this optional part";
        }
        else
            ctx.newElement.title = "Click to close this optional part";

        ctx.newElement.appendChild(inner);
    }
}