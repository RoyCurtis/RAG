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
        let chance    = ctx.xmlElement.getAttribute('chance') || '50';
        let chanceInt = parseInt(chance);

        if ( !Random.bool(chanceInt) )
            ctx.newElement.setAttribute('collapsed', '');

        ctx.newElement.dataset['chance'] = chance;

        // TODO: Eventually move this elsewhere
        ctx.newElement.addEventListener('click', ev =>
        {
            ev.stopPropagation();

            if (ctx.newElement.hasAttribute('collapsed'))
                ctx.newElement.removeAttribute('collapsed');
            else
                ctx.newElement.setAttribute('collapsed', '');
        });

        // Wrap the contents of this optional tag into a span, so that its contents can
        // be hidden when collapsed. Using innerHTML would be easier, however it handles
        // self-closing tags poorly.

        let inner = document.createElement('span');

        // Copy all the optional's inner elements to the inner span
        for (let i = 0; i < ctx.xmlElement.childNodes.length; i ++)
            inner.appendChild( ctx.xmlElement.childNodes[i].cloneNode(true) );

        ctx.newElement.appendChild(inner);
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

        // Copy the contents of the referenced phrase into an inner span, so that its
        // contents can be hidden when collapsed. Using innerHTML would be easier, however
        // it handles self-closing tags poorly.

        let inner  = document.createElement('span');
        let chance = ctx.xmlElement.getAttribute('chance') || '';

        // Copy all the phrases's inner elements to the inner span
        for (let i = 0; i < phrase.childNodes.length; i ++)
            inner.appendChild( phrase.childNodes[i].cloneNode(true) );

        ctx.newElement.dataset['ref'] = ref;

        ctx.newElement.appendChild(inner);

        // Handle collapsible (optional) phrases
        if ( !Strings.isNullOrEmpty(chance) )
        {
            ctx.newElement.dataset['chance'] = chance;

            // TODO: Eventually move this elsewhere
            ctx.newElement.addEventListener('click', ev =>
            {
                ev.stopPropagation();

                if (ctx.newElement.hasAttribute('collapsed'))
                    ctx.newElement.removeAttribute('collapsed');
                else
                    ctx.newElement.setAttribute('collapsed', '');
            });

            let chanceInt = parseInt(chance);

            if ( !Random.bool(chanceInt) )
                ctx.newElement.setAttribute('collapsed', '');
        }
    }

    /** Picks a phrase from a previously defined phraseset, by its `id` */
    public static phraseset(ctx: PhraseContext)
    {
        let ref = ctx.xmlElement.getAttribute('ref') || '';

        if ( Strings.isNullOrEmpty(ref) )
            throw new Error('phraseset element missing a ref attribute');

        let phraseset = ctx.phraseSet.querySelector('phraseset#' + ref);

        if (!phraseset)
        {
            ctx.newElement.textContent = `(UNKNOWN PHRASESET: ${ref})`;
            return;
        }

        let inner  = document.createElement('span');
        let phrase = Random.array(phraseset.children) as Element;
        let chance = ctx.xmlElement.getAttribute('chance') || '';

        // Copy the children of the randomly picked phrase into the new element
        for (let i = 0; i < phrase.childNodes.length; i ++)
            inner.appendChild( phrase.childNodes[i].cloneNode(true) );

        ctx.newElement.appendChild(inner);

        if ( !Strings.isNullOrEmpty(chance) )
        {
            ctx.newElement.dataset['chance'] = chance;

            // TODO: Eventually move this elsewhere
            ctx.newElement.addEventListener('click', ev =>
            {
                ev.stopPropagation();

                if (ctx.newElement.hasAttribute('collapsed'))
                    ctx.newElement.removeAttribute('collapsed');
                else
                    ctx.newElement.setAttribute('collapsed', '');
            });

            let chanceInt = parseInt(chance);

            if ( !Random.bool(chanceInt) )
                ctx.newElement.setAttribute('collapsed', '');
        }
    }

    /** Gets the current platform number */
    public static platform(ctx: PhraseContext)
    {
        ctx.newElement.addEventListener('click', ev =>
        {
            ev.stopPropagation();
            ctx.xmlElement.setAttribute('editing', 'true');

            let platEditor = document.getElementById('platformPicker');
            let dialogX    = ctx.xmlElement.clientLeft;
            let dialogY    = ctx.xmlElement.clientTop;

            if (!platEditor) return;

            platEditor.classList.remove('hidden');
            platEditor.style.transform = `translate(${dialogX}px, ${dialogY}px`;

        }, true);

        ctx.newElement.textContent = RAG.state.platform;
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
        let hour   = Random.int(0, 23).toString().padStart(2, '0');
        let minute = Random.int(0, 59).toString().padStart(2, '0');

        ctx.newElement.textContent = `${hour}:${minute}`;
    }

    public static unknown(ctx: PhraseContext)
    {
        let name = ctx.xmlElement.nodeName;

        ctx.newElement.textContent = `(UNKNOWN XML ELEMENT: ${name})`;
    }
}