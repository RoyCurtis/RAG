/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/**
 * Handles the transformation of phrase XML data, into HTML elements with their data
 * filled in and their UI logic wired.
 */
class Phraser
{
    /**
     * Recursively processes XML elements, filling in data and applying transforms.
     *
     * @param container Parent to process the children of
     * @param level Current level of recursion, max. 20
     */
    public process(container: HTMLElement, level: number = 0)
    {
        // Initially, this method was supposed to just add the XML elements directly into
        // the document. However, this caused a lot of problems (e.g. title not working).
        // HTML does not work really well with custom elements, especially if they are of
        // another XML namespace.

        let query   = ':not(span):not(svg):not(use):not(button)';
        let pending = container.querySelectorAll(query) as NodeListOf<HTMLElement>;

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
                newElement: newElement
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
                case 'phrase':      ElementProcessors.phrase(context);      break;
                case 'phraseset':   ElementProcessors.phraseset(context);   break;
                case 'platform':    ElementProcessors.platform(context);    break;
                case 'service':     ElementProcessors.service(context);     break;
                case 'station':     ElementProcessors.station(context);     break;
                case 'stationlist': ElementProcessors.stationlist(context); break;
                case 'time':        ElementProcessors.time(context);        break;
                case 'vox':         ElementProcessors.vox(context);         break;
                default:            ElementProcessors.unknown(context);     break;
            }

            element.parentElement!.replaceChild(newElement, element);
        });

        // Recurse so that we can expand any new elements
        if (level < 20)
            this.process(container, level + 1);
        else
            throw Error(L.PHRASER_TOO_RECURSIVE);
    }
}