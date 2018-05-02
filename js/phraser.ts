/// <reference path="util/dom.ts" />
/// <reference path="util/strings.ts" />

class Phraser
{
    readonly DIGITS: string[] = ['zero', 'one', 'two', 'three', 'four', 'five', 'six',
        'seven', 'eight', 'nine', 'ten'];

    private document:    Document;
    private rootPhrases: Element;

    constructor(config: RAGConfig)
    {
        let iframe = DOM.require(config.phraseSetEmbed) as HTMLIFrameElement;

        if (!iframe.contentDocument)
            throw new Error("Configured phraseset element is not an iframe embed");

        this.document    = iframe.contentDocument;
        this.rootPhrases = DOM.require('#root', this.document);

        let setCount  = this.document.querySelectorAll('messages > phraseset').length;
        let rootCount = this.rootPhrases.children.length;

        console.log("[Phraser] Phrases loaded:");
        console.log("\tSets:",         setCount);
        console.log("\tRoot phrases:", rootCount);
    }

    public randomPhrase()
    {
        let domEditor = RAG.domEditor;
        let phraseSet = document.createElement('phraseset');

        phraseSet.setAttribute('ref', 'root');

        domEditor.appendChild(phraseSet);

        this.process(phraseSet as Element);
    }

    private getPhraseSet(id: string) : Element | null
    {
        return this.document.querySelector('phraseset#' + id);
    }

    private process(element: Element)
    {
        if (!element.parentElement)
            throw new Error(`Phrase element has no parent: '${element}'`);

        let refId = element.getAttribute('ref') || '';

        switch ( element.nodeName.toLowerCase() )
        {
            case "excuse":
                element.textContent = RAG.database.pickExcuse();
                break;

            case "integer":
                if (!element.attributes)
                    throw new Error("Integer tag is missing required attributes");

                let attrMin      = element.attributes.getNamedItem('min');
                let attrMax      = element.attributes.getNamedItem('max');
                let attrSingular = element.attributes.getNamedItem('singular');
                let attrPlural   = element.attributes.getNamedItem('plural');
                let attrWords    = element.attributes.getNamedItem('words');

                if (!attrMin || !attrMax)
                    throw new Error("Integer tag is missing required attributes");

                let intMin = parseInt(attrMin.value);
                let intMax = parseInt(attrMax.value);

                let int    = Random.int(intMin, intMax);
                let intStr = attrWords && attrWords.value.toLowerCase() === 'true'
                    ? this.DIGITS[int]
                    : int.toString();

                if (int === 1 && attrSingular)
                    intStr += ` ${attrSingular.value}`;
                else if (int !== 1 && attrPlural)
                    intStr += ` ${attrPlural.value}`;

                element.textContent = intStr;
                break;

            case "letter":
                element.textContent = Random.array("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
                break;

            case "named":
                element.textContent = RAG.database.pickNamed();
                break;

            case "optional":
                let chance = element.getAttribute('chance') || '';

                if ( Strings.isNullOrEmpty(chance) )
                    chance = '50';

                let chanceValue = parseInt(chance);
                
                if ( !Random.bool(chanceValue) )
                    element.setAttribute('collapsed', '');

                element.addEventListener('click', ev =>
                {
                    ev.stopPropagation();

                    if (element.hasAttribute('collapsed'))
                        element.removeAttribute('collapsed');
                    else
                        element.setAttribute('collapsed', '');
                });

                element.innerHTML = `<span>${element.innerHTML.trim()}</span>`;
                break;

            case "phrase":
                if ( Strings.isNullOrEmpty(refId) )
                    break;

                let phrase = this.document.querySelector('phrase#' + refId);

                if (phrase)
                {
                    let newPhrase = phrase.cloneNode(true) as Element;

                    if ( element.hasAttribute('chance') )
                    {
                        let chance = element.getAttribute('chance') || '50';
                        newPhrase.setAttribute('chance', chance);
                    }

                    element.parentElement.replaceChild(newPhrase, element);
                    element = newPhrase;
                }
                else
                    element.textContent = `(UNKNOWN PHRASE: ${refId})`;

                let pChance = element.getAttribute('chance') || '';

                if ( !Strings.isNullOrEmpty(pChance) )
                {
                    element.addEventListener('click', ev =>
                    {
                        ev.stopPropagation();

                        if (element.hasAttribute('collapsed'))
                            element.removeAttribute('collapsed');
                        else
                            element.setAttribute('collapsed', '');
                    });

                    let pChanceValue = parseInt(pChance);

                    if ( !Random.bool(pChanceValue) )
                        element.setAttribute('collapsed', '');
                }

                element.innerHTML = `<span>${element.innerHTML.trim()}</span>`;
                break;

            case "phraseset":
                if ( Strings.isNullOrEmpty(refId) )
                    break;

                let phraseset = this.getPhraseSet(refId);

                if (phraseset)
                {
                    let phrase = Random.array(phraseset.children);
                    element.appendChild( phrase.cloneNode(true) );
                }
                else
                    element.textContent = `(UNKNOWN PHRASE: ${refId})`;

                let psChance = element.getAttribute('chance') || '';

                if ( !Strings.isNullOrEmpty(psChance) )
                {
                    element.addEventListener('click', ev =>
                    {
                        ev.stopPropagation();

                        if (element.hasAttribute('collapsed'))
                            element.removeAttribute('collapsed');
                        else
                            element.setAttribute('collapsed', '');
                    });

                    let psChanceValue = parseInt(psChance);

                    if ( !Random.bool(psChanceValue) )
                        element.setAttribute('collapsed', '');
                }

                break;

            case "platform":
                // Only 2% chance for platform 0, since it's rare
                element.textContent = Random.bool(98)
                    ? Random.int(1, 16).toString()
                    : '0';

                // Only 10% chance for platform letter, since it's uncommon
                if ( Random.bool(10) )
                    element.textContent += Random.array('ABC');

                break;

            case "service":
                element.textContent = RAG.database.pickService();
                break;

            case "station":
                element.textContent = RAG.database.pickStation();
                break;

            case "stationlist":
                let stations    = RAG.database.pickStations();
                let stationList = '';

                if (stations.length === 1)
                    stationList = element.id === 'calling'
                        ? `${stations[0]} only`
                        : stations[0];
                else
                {
                    let lastStation = stations.pop();
                    stationList = stations.join(', ');
                    stationList += ` and ${lastStation}`;
                }

                element.textContent = stationList;
                break;

            case "time":
                let hour   = Random.int(0, 23).toString().padStart(2, '0');
                let minute = Random.int(0, 59).toString().padStart(2, '0');
                element.textContent = `${hour}:${minute}`;
                break;
        }

        if (element.firstElementChild)
            this.process(element.firstElementChild);

        if (element.nextElementSibling)
            this.process(element.nextElementSibling);
    }
}