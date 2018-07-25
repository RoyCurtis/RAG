/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** This is the core draggable library that does the heavy lifting */
declare namespace Draggable
{
    /** Union type for containers that Draggable constructors accept */
    type ContainerList = HTMLElement[] | NodeList | HTMLElement;
    /** Draggable event callback */
    type EventCallback = (ev: DragEvent) => void;

    /** Base drag event */
    class DragEvent
    {
        data : DragData;
    }

    /** Data container for all events */
    class DragData
    {
        /** Draggable's mirror element */
        mirror?          : HTMLElement;
        /** Original event that triggered sensor event */
        originalEvent?   : HTMLElement;
        /** Draggable's original source element */
        originalSource?  : HTMLElement;
        /** Sensor event */
        sensorEvent?     : HTMLElement;
        /** Draggable's source element */
        source?          : HTMLElement;
        /** Draggable's source container element */
        sourceContainer? : HTMLElement;
    }

    export class Draggable
    {
        constructor(containers: ContainerList, options: Object);

        on(type: string, ...callbacks: EventCallback[]) : Draggable;
    }

    /**
     * Sortable is built on top of Draggable and allows sorting of draggable elements.
     * Sortable will keep track of the original index and emits the new index as you drag over
     * draggable elements.
     */
    export class Sortable extends Draggable
    {
    }
}
