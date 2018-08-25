/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

// TODO: Make all views use this class
/** Base class for a view; anything with a base DOM element */
abstract class ViewBase
{
    /** Reference to this view's primary DOM element */
    protected readonly dom : HTMLElement;

    /** Creates this base view, attaching it to the element matching the given query */
    protected constructor(domQuery: string)
    {
        this.dom = DOM.require(domQuery);
    }

    /** Gets this view's child element matching the given query */
    protected attach<T extends HTMLElement>(query: string) : T
    {
        return DOM.require(query, this.dom);
    }
}