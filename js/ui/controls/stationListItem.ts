/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Station list item that can be dragged and dropped */
class StationListItem
{
    /** Reference to the DOM template to clone, for each item created */
    private static TEMPLATE : HTMLElement;

    /** Creates and detaches the template on first create */
    private static init() : void
    {
        StationListItem.TEMPLATE    = DOM.require('#stationListItemTemplate');
        StationListItem.TEMPLATE.id = '';

        StationListItem.TEMPLATE.classList.remove('hidden');
        StationListItem.TEMPLATE.remove();
    }

    /** Reference to this item's element */
    public readonly dom : HTMLElement;

    /**
     * Creates a station list item, meant for the station list builder.
     *
     * @param code Three-letter station code to create this item for
     */
    public constructor(code: string)
    {
        if (!StationListItem.TEMPLATE)
            StationListItem.init();

        this.dom           = StationListItem.TEMPLATE.cloneNode(true) as HTMLElement;
        this.dom.innerText = RAG.database.getStation(code, false);
        this.dom.tabIndex  = -1;
        this.dom.title     =
            "Drag to reorder; double-click or drag into station selector to remove";

        this.dom.dataset['code'] = code;
    }
}