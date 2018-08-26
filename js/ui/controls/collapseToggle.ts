/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** UI element for toggling the state of collapsible editor elements */
class CollapseToggle
{
    /** Reference to the toggle button DOM template to clone */
    private static TEMPLATE : HTMLElement;

    /** Creates and detaches the template on first create */
    private static init() : void
    {
        CollapseToggle.TEMPLATE        = DOM.require('#collapsibleButtonTemplate');
        CollapseToggle.TEMPLATE.id     = '';
        CollapseToggle.TEMPLATE.hidden = false;
        CollapseToggle.TEMPLATE.remove();
    }

    /** Creates and attaches toggle element for toggling collapsibles */
    public static createAndAttach(parent: Element) : void
    {
        // Skip if a toggle is already attached
        if ( parent.querySelector('.toggle') )
            return;

        if (!CollapseToggle.TEMPLATE)
            CollapseToggle.init();

        parent.insertAdjacentElement('afterbegin',
            CollapseToggle.TEMPLATE.cloneNode(true) as Element
        );
    }

    /** Updates the given collapse toggle's title text, depending on state */
    public static update(span: HTMLElement) : void
    {
        let ref    = span.dataset['ref'] || '???';
        let type   = span.dataset['type']!;
        let state  = span.hasAttribute('collapsed');
        let toggle = DOM.require('.toggle', span);

        toggle.title = state
            ? L.TITLE_OPT_OPEN(type, ref)
            : L.TITLE_OPT_CLOSE(type, ref);
    }
}