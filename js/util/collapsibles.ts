/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

interface ToggleElement extends HTMLElement
{
    /** Reference to this element's plus icon */
    plusIcon  : HTMLElement;
    /** Reference to this element's minus icon */
    minusIcon : HTMLElement;
}

/** Utility methods for dealing with collapsible elements */
class Collapsibles
{
    /** Reference to the toggle DOM template to clone */
    private static TEMPLATE : HTMLElement;

    /** Creates and detaches the template on first create */
    private static init() : void
    {
        Collapsibles.TEMPLATE        = DOM.require('#toggleTemplate');
        Collapsibles.TEMPLATE.id     = '';
        Collapsibles.TEMPLATE.hidden = false;
        Collapsibles.TEMPLATE.remove();
    }

    /** Creates a toggle element for toggling collapsibles */
    public static createToggle() : ToggleElement
    {
        if (!Collapsibles.TEMPLATE)
            Collapsibles.init();

        let toggle       = Collapsibles.TEMPLATE.cloneNode(true) as ToggleElement;
        toggle.plusIcon  = DOM.require('.plus',  toggle);
        toggle.minusIcon = DOM.require('.minus', toggle);

        return toggle;
    }

    /**
     * Sets the collapse state of a collapsible element.
     *
     * @param span The encapsulating collapsible element
     * @param state True to collapse, false to open
     */
    public static set(span: HTMLElement, state: boolean) : void
    {
        let ref    = span.dataset['ref'] || '???';
        let type   = span.dataset['type']!;
        let toggle = DOM.require('.toggle', span);

        if (state) span.setAttribute('collapsed', '');
        else       span.removeAttribute('collapsed');

        toggle.title = state
            ? L.TITLE_OPT_OPEN(type, ref)
            : L.TITLE_OPT_CLOSE(type, ref);
    }
}