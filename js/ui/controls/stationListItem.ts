/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Station list item that can be dragged and dropped */
class StationListItem
{
    private static TEMPLATE : HTMLElement;

    private static init() : void
    {
        StationListItem.TEMPLATE    = DOM.require('#stationListItemTemplate');
        StationListItem.TEMPLATE.id = '';

        StationListItem.TEMPLATE.classList.remove('hidden');
        StationListItem.TEMPLATE.remove();
    }

    public readonly dom : HTMLElement;

    private readonly picker : StationListPicker;

    constructor(picker: StationListPicker, code: string)
    {
        if (!StationListItem.TEMPLATE)
            StationListItem.init();

        this.dom    = StationListItem.TEMPLATE.cloneNode(true) as HTMLElement;
        this.picker = picker;

        this.dom.innerText = RAG.database.getStation(code, false);
        this.dom.tabIndex  = -1;
        this.dom.title     =
            "Drag to reorder; double-click or drag into station selector to remove";

        this.dom.dataset['code'] = code;

        this.dom.ondblclick = _ => picker.remove(this.dom);

        this.dom.scrollIntoView();
    }
}