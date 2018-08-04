/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Global reference to the language container, set at init */
let L : EnglishLanguage | BaseLanguage;

class I18n
{
    /** Constant regex to match for translation keys */
    private static readonly TAG_REGEX : RegExp = /%[A-Z_]+%/;

    /** Languages currently available */
    private static languages   : Dictionary<BaseLanguage>;
    /** Reference to language currently in use */
    private static currentLang : BaseLanguage;

    /** Picks a language, and transforms all translation keys in the document */
    public static init() : void
    {
        if (this.languages)
            throw new Error('I18n is already initialized');

        this.languages = {
            'en' : new EnglishLanguage()
        };

        // TODO: Language selection
        L = this.currentLang = this.languages['en'];

        I18n.applyToDom();
    }

    /**
     * Walks through all text nodes in the DOM, replacing any translation keys.
     *
     * @see https://stackoverflow.com/a/10730777/3354920
     */
    private static applyToDom() : void
    {
        let next : Node | null;
        let walk = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            { acceptNode: I18n.nodeFilter },
            false
        );

        while ( next = walk.nextNode() )
        {
            if (next.nodeType === Node.ELEMENT_NODE)
            {
                let element = next as Element;

                for (let i = 0; i < element.attributes.length; i++)
                    I18n.expandAttribute(element.attributes[i]);
            }
            else if (next.nodeType === Node.TEXT_NODE && next.textContent)
                I18n.expandTextNode(next);
        }
    }

    /** Filters the tree walker to exclude script and style tags */
    private static nodeFilter(node: Node) : number
    {
        let tag = (node.nodeType === Node.ELEMENT_NODE)
            ? (node as Element).tagName.toUpperCase()
            : node.parentElement!.tagName.toUpperCase();

        return ['SCRIPT', 'STYLE'].includes(tag)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
    }

    /** Expands any translation keys in the given attribute */
    private static expandAttribute(attr: Attr) : void
    {
        // Setting an attribute, even if nothing actually changes, will cause various
        // side-effects (e.g. reloading iframes). So, as wasteful as this looks, we have
        // to match first before actually replacing.

        if ( attr.value.match(this.TAG_REGEX) )
            attr.value = attr.value.replace(this.TAG_REGEX, I18n.replace);
    }

    /** Expands any translation keys in the given text node */
    private static expandTextNode(node: Node) : void
    {
        node.textContent = node.textContent!.replace(this.TAG_REGEX, I18n.replace);
    }

    /** Replaces key with value if it exists, else keeps the key */
    private static replace(match: string) : string
    {
        let key   = match.slice(1, -1);
        let value = L[key] as LanguageEntry;

        if (!value)
        {
            console.error('Missing translation key:', match);
            return match;
        }
        else
            return value();
    }
}