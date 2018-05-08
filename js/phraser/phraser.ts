/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

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

    /** Picks a random root phrase, loads it into the editor and processes it into HTML */
    public generate()
    {
        let editor = RAG.viewController.getEditor();

        editor.innerHTML = '<phraseset ref="root" />';

        this.process(editor);
    }

    /** Recursively processes elements, filling in data and applying transforms */
    private process(container: HTMLElement, level: number = 0)
    {
        // Initially, this method was supposed to just add the XML elements directly into
        // the document. However, this caused a lot of problems (e.g. title not working).
        // HTML does not work really well with custom elements, especially if they are of
        // another XML namespace.

        let pending = container.querySelectorAll(':not(span)') as NodeListOf<HTMLElement>;

        // No more XML elements to expand
        if (pending.length === 0)
            return;

        // For each XML element currently in the container:
        // * Create a new span element for it
        // * Have the processors take data from the XML element, to populate the new one
        // * Replace the XML element with the new one
        pending.forEach(element =>
        {
            let elementName = element.nodeName.toLowerCase();
            let newElement  = document.createElement('span');
            let context     = {
                xmlElement: element,
                newElement: newElement,
                phraseSet:  this.phraseSets
            };

            newElement.dataset['type'] = elementName;

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
                default:            ElementProcessors.unknown(context);     break;
            }

            element.parentElement!.replaceChild(newElement, element);
        });

        // Recurse so that we can expand any new elements
        if (level < 20)
            this.process(container, level + 1);
        else
            throw new Error("Too many levels of recursion, when processing phrase.");
    }
}