/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Utility methods for dealing with collapsible elements */
class Collapsibles
{
    /**
     * Sets the collapse state of a collapsible element.
     *
     * @param {HTMLElement} span The encapsulating collapsible element
     * @param {HTMLElement} toggle The toggle child of the collapsible element
     * @param {boolean} state True to collapse, false to open
     */
    public static set(span: HTMLElement, toggle: HTMLElement, state: boolean) : void
    {
        if (state) span.setAttribute('collapsed', '');
        else       span.removeAttribute('collapsed');

        toggle.title = state
            ? "Click to open this optional part"
            : "Click to close this optional part";
    }
}