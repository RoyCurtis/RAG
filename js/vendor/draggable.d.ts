/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

type ContainerList = HTMLElement[] | NodeList | HTMLElement;

/** This is the core draggable library that does the heavy lifting */
declare namespace Draggable
{
    export class Draggable
    {
        constructor(containers: ContainerList, options: Object);

        on(type: string, ...callbacks: EventHandlerNonNull[]) : Draggable;
    }

    /**
     * Droppable is built on top of Draggable and allows dropping draggable elements into
     * dropzone element.
     */
    export class Droppable extends Draggable
    {
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
