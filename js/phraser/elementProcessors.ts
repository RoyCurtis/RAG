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
        let chance = ctx.element.getAttribute('chance') || '50';

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

        // Wrap the contents of this optional tag into a span, so that its contents can
        // be hidden when collapsed.
        // Using innerHTML would be easier, however it handles self-closing tags poorly.

        let innerSpan = document.createElement('span');

        // Transfer all the optional's inner elements to the inner span
        while (ctx.element.firstChild)
            innerSpan.appendChild(ctx.element.firstChild);

        ctx.element.appendChild(innerSpan);
    }

    /** Includes a previously defined phrase, by its `id` */
    public static phrase(ctx: PhraseContext)
    {
        let ref = ctx.element.getAttribute('ref') || '';

        // Skip ref-less picked phrase elements inside phrasesets
        if ( Strings.isNullOrEmpty(ref) )
            return;

        let phrase = ctx.phraseSet.querySelector('phrase#' + ref);

        if (!phrase)
        {
            ctx.element.textContent = `(UNKNOWN PHRASE: ${ref})`;
            return;
        }

        // Clone the referenced phrase element and transfer the necessary attributes.
        // Using innerHTML would be easier, however it handles self-closing tags poorly.

        let phraseClone = phrase.cloneNode(true) as Element;
        let innerSpan   = document.createElement('span');
        let attrChance  = ctx.element.getAttribute('chance');

        phraseClone.removeAttribute('id');
        phraseClone.setAttribute('ref', ref);

        if (attrChance)
            phraseClone.setAttribute('chance', attrChance);

        if (!ctx.element.parentElement)
            throw new Error('Expected parent of processed element is missing');

        // Transfer all the phrase's inner elements to the inner span
        while (phraseClone.firstChild)
            innerSpan.appendChild(phraseClone.firstChild);

        phraseClone.appendChild(innerSpan);

        // Swap out the currently processed element for the one cloned from phraseset.
        // Using innerHTML would be easier, however it handles self-closing tags poorly.

        ctx.element.parentElement.replaceChild(phraseClone, ctx.element);
        ctx.element = phraseClone as HTMLElement;

        // Handle collapsible (optional) phrases
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

    /** Gets the current platform number */
    public static platform(ctx: PhraseContext)
    {
        ctx.element.addEventListener('click', ev =>
        {
            ev.stopPropagation();
            ctx.element.setAttribute('editing', 'true');

            let platEditor = document.getElementById('platformPicker');
            let dialogX    = ctx.element.clientLeft;
            let dialogY    = ctx.element.clientTop;

            if (!platEditor) return;

            platEditor.classList.remove('hidden');
            platEditor.style.transform = `translate(${dialogX}px, ${dialogY}px`;

        }, true);

        ctx.element.textContent = RAG.state.platform;
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