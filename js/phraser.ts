/// <reference path="util/dom.ts" />
/// <reference path="util/strings.ts" />

class Phraser
{
    private document: Document;

    constructor(config: RAGConfig)
    {
        let iframe = DOM.require(config.phraseSetEmbed) as HTMLIFrameElement;

        if (!iframe.contentDocument)
            throw new Error("Configured phraseset element is not an iframe embed");

        this.document = iframe.contentDocument;

        let setCount = this.document.querySelectorAll('messages > phraseset').length;

        console.log("[Phraser] Phrases loaded:");
        console.log("\tSets:", setCount);
    }

    private getPhraseSet(id: string) : Element | null
    {
        return this.document.querySelector('phraseset#' + id);
    }

    public process(node: Node)
    {
        let parent = node.parentNode;

        if (!parent)
            throw new Error('Element is missing parent');

        switch ( node.nodeName.toLowerCase() )
        {
            case "excuse":
                node.textContent = Random.array(["a fatality", "a signal failure"]);
                break;

            case "platform":
                node.textContent = Random.int(0, 16).toString();
                break;

            case "station":
                node.textContent = Random.array(["Crewe", "Tring"]);
                break;
        }

        console.log(node);

        if (node.firstChild)
            this.process(node.firstChild);

        if (node.nextSibling)
            this.process(node.nextSibling);
    }
}