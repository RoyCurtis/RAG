/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Holds methods for processing each type of phrase element into HTML, with data */
class ElementProcessors
{
    /** Picks a coach letter from A to Z, limited by amount of coaches */
    public static coach(ctx: PhraseContext)
    {
        ctx.element.textContent = Random.array("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }

    /** Picks an excuse for a delay or cancellation */
    public static excuse(ctx: PhraseContext)
    {
        ctx.element.textContent = RAG.database.pickExcuse();
    }

    /** Picks a whole number, with optional limits, noun and in word form */
    public static integer(ctx: PhraseContext)
    {
        let attrMin      = ctx.element.getAttribute('min');
        let attrMax      = ctx.element.getAttribute('max');
        let attrSingular = ctx.element.getAttribute('singular');
        let attrPlural   = ctx.element.getAttribute('plural');
        let attrWords    = ctx.element.getAttribute('words');

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

        ctx.element.textContent = intStr;
    }

    /** Picks a named train */
    public static named(ctx: PhraseContext)
    {
        ctx.element.textContent = RAG.database.pickNamed();
    }

    /** Makes the content of this tag optionally hidden, by chance or user choice */
    public static optional(ctx: PhraseContext)
    {
        let chance = ctx.element.getAttribute('chance') || '';

        if ( Strings.isNullOrEmpty(chance) )
            chance = '50';

        let chanceInt = parseInt(chance);

        if ( !Random.bool(chanceInt) )
            ctx.element.setAttribute('collapsed', '');

        // TODO: Eventually move this elsewhere
        ctx.element.addEventListener('click', ev =>
        {
            ev.stopPropagation();

            if (ctx.element.hasAttribute('collapsed'))
                ctx.element.removeAttribute('collapsed');
            else
                ctx.element.setAttribute('collapsed', '');
        });

        ctx.element.innerHTML = `<span>${ctx.element.innerHTML.trim()}</span>`;
    }

    /** Includes a previously defined phrase, by its `id` */
    public static phrase(ctx: PhraseContext)
    {
        let ref = ctx.element.getAttribute('ref') || '';

        if ( Strings.isNullOrEmpty(ref) )
            return;

        let phrase = ctx.phraseSet.querySelector('phrase#' + ref);

        ctx.element.innerHTML = phrase
            ? phrase.innerHTML
            : `(UNKNOWN PHRASE: ${ref})`;

        let chance = ctx.element.getAttribute('chance') || '';

        if ( !Strings.isNullOrEmpty(chance) )
        {
            // TODO: Eventually move this elsewhere
            ctx.element.addEventListener('click', ev =>
            {
                ev.stopPropagation();

                if (ctx.element.hasAttribute('collapsed'))
                    ctx.element.removeAttribute('collapsed');
                else
                    ctx.element.setAttribute('collapsed', '');
            });

            let chanceInt = parseInt(chance);

            if ( !Random.bool(chanceInt) )
                ctx.element.setAttribute('collapsed', '');
        }

        ctx.element.innerHTML = `<span>${ctx.element.innerHTML.trim()}</span>`;
    }

    /** Picks a phrase from a previously defined phraseset, by its `id` */
    public static phraseset(ctx: PhraseContext)
    {
        let ref = ctx.element.getAttribute('ref') || '';

        if ( Strings.isNullOrEmpty(ref) )
            return;

        let phraseset = ctx.phraseSet.querySelector('phraseset#' + ref);

        if (phraseset)
        {
            let phrase = Random.array(phraseset.children);
            ctx.element.appendChild( phrase.cloneNode(true) );
        }
        else
            ctx.element.textContent = `(UNKNOWN PHRASESET: ${ref})`;

        let chance = ctx.element.getAttribute('chance') || '';

        if ( !Strings.isNullOrEmpty(chance) )
        {
            ctx.element.addEventListener('click', ev =>
            {
                ev.stopPropagation();

                if (ctx.element.hasAttribute('collapsed'))
                    ctx.element.removeAttribute('collapsed');
                else
                    ctx.element.setAttribute('collapsed', '');
            });

            let chanceInt = parseInt(chance);

            if ( !Random.bool(chanceInt) )
                ctx.element.setAttribute('collapsed', '');
        }
    }

    /** Picks a platform number, sometimes with letter */
    public static platform(ctx: PhraseContext)
    {
        // Only 2% chance for platform 0, since it's rare
        ctx.element.textContent = Random.bool(98)
            ? Random.int(1, 16).toString()
            : '0';

        // Only 10% chance for platform letter, since it's uncommon
        if ( Random.bool(10) )
            ctx.element.textContent += Random.array('ABC');
    }

    /** Picks a rail network name */
    public static service(ctx: PhraseContext)
    {
        ctx.element.textContent = RAG.database.pickService();
    }

    /** Picks a station name */
    public static station(ctx: PhraseContext)
    {
        ctx.element.textContent = RAG.database.pickStation();
    }

    /** Picks a selection of stations */
    public static stationlist(ctx: PhraseContext)
    {
        let stations    = RAG.database.pickStations();
        let stationList = '';

        if (stations.length === 1)
            stationList = (ctx.element.id === 'calling')
                ? `${stations[0]} only`
                : stations[0];
        else
        {
            let lastStation = stations.pop();

            stationList  = stations.join(', ');
            stationList += ` and ${lastStation}`;
        }

        ctx.element.textContent = stationList;
    }

    /** Picks a 24 hour time, with hours and minutes */
    public static time(ctx: PhraseContext)
    {
        let hour   = Random.int(0, 23).toString().padStart(2, '0');
        let minute = Random.int(0, 59).toString().padStart(2, '0');

        ctx.element.textContent = `${hour}:${minute}`;
    }
}