/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** UI element for opening the picker for phraseset editor elements */
class PhrasesetButton
{
    /** Reference to the phraseset button DOM template to clone */
    private static TEMPLATE : HTMLElement;

    /** Creates and detaches the template on first create */
    private static init() : void
    {
        // TODO: This is being duplicated in various places; DRY with sugar method
        PhrasesetButton.TEMPLATE        = DOM.require('#phrasesetButtonTemplate');
        PhrasesetButton.TEMPLATE.id     = '';
        PhrasesetButton.TEMPLATE.hidden = false;
        PhrasesetButton.TEMPLATE.remove();
    }

    /** Creates and attaches a button for the given phraseset element */
    public static createAndAttach(phraseset: Element) : void
    {
        // Skip if a button is already attached
        if ( phraseset.querySelector('.choosePhrase') )
            return;

        if (!PhrasesetButton.TEMPLATE)
            PhrasesetButton.init();

        let ref      = DOM.requireData(phraseset as HTMLElement, 'ref');
        let button   = PhrasesetButton.TEMPLATE.cloneNode(true) as HTMLElement;
        button.title = L.TITLE_PHRASESET(ref);

        phraseset.insertAdjacentElement('afterbegin', button);
    }
}