class ElementProcessors
{
    public static coach(ctx: PhraseContext)
    {
        ctx.element.textContent = Random.array("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }

    public static excuse(ctx: PhraseContext)
    {
        ctx.element.textContent = RAG.database.pickExcuse();
    }

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

    public static named(ctx: PhraseContext)
    {
        ctx.element.textContent = RAG.database.pickNamed();
    }

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

    public static phrase(ctx: PhraseContext)
    {
        let ref = ctx.element.getAttribute('ref') || '';

        if ( Strings.isNullOrEmpty(ref) )
            return ctx.element;

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

    public static phraseset(ctx: PhraseContext)
    {
        let ref = ctx.element.getAttribute('ref') || '';

        if ( Strings.isNullOrEmpty(ref) )
            return ctx.element;

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

    public static service(ctx: PhraseContext)
    {
        ctx.element.textContent = RAG.database.pickService();
    }

    public static station(ctx: PhraseContext)
    {
        ctx.element.textContent = RAG.database.pickStation();
    }

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

    public static time(ctx: PhraseContext)
    {
        let hour   = Random.int(0, 23).toString().padStart(2, '0');
        let minute = Random.int(0, 59).toString().padStart(2, '0');

        ctx.element.textContent = `${hour}:${minute}`;
    }
}