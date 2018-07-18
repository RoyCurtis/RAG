/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Station list item that can be dragged and dropped, with mobile support */
class StationListItem
{
    public readonly dom : HTMLElement;

    private readonly picker : StationListPicker;

    private phantom? : HTMLElement;
    private rect?    : ClientRect;

    constructor(picker: StationListPicker, code: string)
    {
        this.dom    = document.createElement('dd');
        this.picker = picker;

        this.dom.draggable = true;
        this.dom.className = 'unselectable';
        this.dom.innerText = RAG.database.getStation(code, false);
        this.dom.tabIndex  = -1;
        this.dom.title     =
            "Drag to reorder; double-click or drag into station selector to remove";

        this.dom.dataset['code'] = code;

        this.dom.ondblclick = _ => picker.remove(this.dom);

        this.dom.ontouchstart  = this.onTouchStart.bind(this);
        this.dom.ontouchmove   = this.onTouchMove.bind(this);
        this.dom.ontouchend    = this.onTouchEnd.bind(this);
        this.dom.ontouchcancel = this.onTouchEnd.bind(this);

        this.dom.ondragstart = this.onDragStart.bind(this);
        this.dom.ondragenter = this.onDragEnter.bind(this);
        this.dom.ondrop      = this.onDrop.bind(this);
        this.dom.ondragend   = this.onDragEnd.bind(this);
        this.dom.ondragover  = DOM.preventDefault;
        this.dom.ondragleave = _  => this.dom.classList.remove('dragover');
    }

    private touchLayout(touch: Touch) : void
    {
        if (!this.phantom || !this.rect) return;

        this.phantom.style.left =
            (touch.clientX - this.rect.left + 10) + 'px';
        this.phantom.style.top  =
            (touch.clientY - this.rect.top  + 40) + 'px';
    }

    private onStart() : void
    {
        this.picker.domDragFrom = this.dom;
        this.picker.domDragFrom.classList.add('dragging');
    }

    private onEnd() : void
    {

    }

    private onTouchStart(ev: TouchEvent) : void
    {
        // Skip multitouches
        if (ev.targetTouches.length > 1)
            return;

        ev.preventDefault();

        let touch  = ev.targetTouches[0];
        let parent = this.dom.parentElement!;

        this.rect          = parent.getBoundingClientRect();
        this.dom.draggable = false;

        this.phantom = this.dom.cloneNode(true) as HTMLElement;
        this.phantom.classList.add('dragPhantom');

        parent.appendChild(this.phantom);
        this.touchLayout(touch);
        this.onStart();
    }

    private onTouchMove(ev: TouchEvent) : void
    {
        // BUG: I couldn't figure out how to capture touchmove events, when the touch has
        // been

        this.touchLayout(ev.targetTouches[0]);
    }

    private onTouchEnd(ev: TouchEvent) : void
    {
        if (ev.targetTouches.length > 1)
            return;

        ev.preventDefault();
        this.dom.draggable = true;

        if (!this.phantom)
            return;

        this.phantom.remove();
        this.phantom = undefined;
    }

    private onDragStart(ev: DragEvent) : void
    {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.dropEffect    = "move";
        this.onStart();
    }

    private onDragEnter(_: DragEvent) : void
    {
        if (this.picker.domDragFrom === this.dom)
            return;

        this.dom.classList.add('dragover');
    }

    private onDrop(ev: DragEvent) : void
    {
        if (!ev.target || !this.picker.domDragFrom)
            throw new Error("Drop event, but target and source are missing");

        // Ignore dragging into self
        if (ev.target === this.picker.domDragFrom)
            return;

        let target = ev.target as HTMLElement;

        DOM.swap(this.picker.domDragFrom, target);
        target.classList.remove('dragover');
        this.picker.update();
    }

    private onDragEnd(ev: DragEvent) : void
    {
        if (!this.picker.domDragFrom)
            throw new Error("Drag ended but there's no tracked drag element");

        if (this.picker.domDragFrom !== ev.target)
            throw new Error("Drag ended, but tracked element doesn't match");

        this.picker.domDragFrom.classList.remove('dragging');

        // As per the standard, dragend must fire after drop. So it is safe to do
        // dereference cleanup here.
        this.picker.domDragFrom = undefined;
    }
}