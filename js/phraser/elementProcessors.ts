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
        ctx.newElement.textContent = RAG.database.pickNamed();
    }

    /** Makes the content of this tag optionally hidden, by chance or user choice */
    public static optional(ctx: PhraseContext)
    {
        this.makeCollapsible(ctx, '50');
        ctx.newElement.appendChild( this.cloneIntoInner(ctx.xmlElement) );
    }

    /** Includes a previously defined phrase, by its `id` */
    public static phrase(ctx: PhraseContext)
    {
        let ref    = ctx.xmlElement.getAttribute('ref') || '';
        let phrase = ctx.phraseSet.querySelector('phrase#' + ref);

        if (!phrase)
        {
            ctx.newElement.textContent = `(UNKNOWN PHRASE: ${ref})`;
            return;
        }

        ctx.newElement.dataset['ref'] = ref;

        this.makeCollapsible(ctx);
        ctx.newElement.appendChild( this.cloneIntoInner(phrase) );
    }

    /** Picks a phrase from a previously defined phraseset, by its `id` */
    public static phraseset(ctx: PhraseContext)
    {
        let ref       = ctx.xmlElement.getAttribute('ref') || '';
        let phraseset = ctx.phraseSet.querySelector('phraseset#' + ref);

        if ( Strings.isNullOrEmpty(ref) )
            throw new Error('phraseset element missing a ref attribute');

        if (!phraseset)
        {
            ctx.newElement.textContent = `(UNKNOWN PHRASESET: ${ref})`;
            return;
        }

        let phrase = Random.array(phraseset.children) as Element;

        this.makeCollapsible(ctx);
        ctx.newElement.appendChild( this.cloneIntoInner(phrase) );
    }

    /** Gets the current platform number */
    public static platform(ctx: PhraseContext)
    {
        ctx.newElement.addEventListener(
            'click',
            ev => RAG.viewController.platformPicker.onClick(ev, ctx),
            true
        );

        ctx.newElement.textContent = RAG.state.platform.join('');
    }

    /** Picks a rail network name */
    public static service(ctx: PhraseContext)
    {
        ctx.newElement.textContent = RAG.database.pickService();
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
        ctx.newElement.addEventListener(
            'click',
            ev => RAG.viewController.timePicker.onClick(ev, ctx),
            true
        );

        ctx.newElement.textContent = RAG.state.time;
    }

    /** Handles unknown elements in an inline error message */
    public static unknown(ctx: PhraseContext)
    {
        let name = ctx.xmlElement.nodeName;

        ctx.newElement.textContent = `(UNKNOWN XML ELEMENT: ${name})`;
    }

    /**
     * Clones the children of the given element into a new inner span tag. This is needed
     * for collapsible elements, so that their contents can be hidden when collapsed.
     */
    private static cloneIntoInner(element: Element) : HTMLSpanElement
    {
        let inner = document.createElement('span');

        // Using innerHTML would be easier, however it handles self-closing tags poorly.
        for (let i = 0; i < element.childNodes.length; i ++)
            inner.appendChild( element.childNodes[i].cloneNode(true) );

        return inner;
    }

    /** If the processed element has a chance attribute, makes it collapsible */
    private static makeCollapsible(ctx: PhraseContext, defChance: string = '')
    {
        let chance = ctx.xmlElement.getAttribute('chance') || defChance;

        if ( Strings.isNullOrEmpty(chance) )
            return;

        ctx.newElement.dataset['chance'] = chance;

        // Set initial collapse state from set chance
        if ( !Random.bool( parseInt(chance) ) )
            ctx.newElement.setAttribute('collapsed', '');

        // TODO: Eventually move this elsewhere
        ctx.newElement.addEventListener('click', ev =>
        {
            ev.stopPropagation();

            if (ctx.newElement.hasAttribute('collapsed'))
                ctx.newElement.removeAttribute('collapsed');
            else
                ctx.newElement.setAttribute('collapsed', '');
        });
    }
}