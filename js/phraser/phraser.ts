/**
 * Handles the transformation of phrase XML data, into HTML elements with their data
 * filled in and their UI logic wired.
 */
class Phraser
{
    // TODO: Move to language file
    public static readonly DIGITS: string[] = ['zero', 'one', 'two', 'three', 'four',
        'five', 'six', 'seven', 'eight', 'nine', 'ten'];

    private readonly phraseSets: Document;

    constructor(config: RAGConfig)
    {
        let iframe = DOM.require(config.phraseSetEmbed) as HTMLIFrameElement;

        if (!iframe.contentDocument)
            throw new Error("Configured phraseset element is not an iframe embed");

        this.phraseSets = iframe.contentDocument;
    }

    public randomPhrase()
    {
        let domEditor = RAG.domEditor;
        let phraseSet = document.createElement('phraseset');

        phraseSet.setAttribute('ref', 'root');

        domEditor.appendChild(phraseSet);

        this.process(phraseSet as Element);
    }

    private process(element: Element)
    {
        if (!element.parentElement)
            throw new Error(`Phrase element has no parent: '${element}'`);

        let elementName = element.nodeName.toLowerCase();
        let context     = {
            element:   element,
            phraseSet: this.phraseSets
        };

        // I wanted to use an index on ElementProcessors for this, but it caused every
        // processor to have an "unused method" warning.
        switch (elementName)
        {
            case 'coach':       ElementProcessors.coach(context);       break;
            case 'excuse':      ElementProcessors.excuse(context);      break;
            case 'integer':     ElementProcessors.integer(context);     break;
            case 'named':       ElementProcessors.named(context);       break;
            case 'optional':    ElementProcessors.optional(context);    break;
            case 'phrase':      ElementProcessors.phrase(context);      break;
            case 'phraseset':   ElementProcessors.phraseset(context);   break;
            case 'platform':    ElementProcessors.platform(context);    break;
            case 'service':     ElementProcessors.service(context);     break;
            case 'station':     ElementProcessors.station(context);     break;
            case 'stationlist': ElementProcessors.stationlist(context); break;
            case 'time':        ElementProcessors.time(context);        break;
        }

        if (element.firstElementChild)
            this.process(element.firstElementChild);

        if (element.nextElementSibling)
            this.process(element.nextElementSibling);
    }
}