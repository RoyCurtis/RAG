/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Attaches to global touch events, to add drag-drop support for an element */
class TouchDragDropController
{

    constructor()
    {
        document.body.addEventListener( 'touchstart',  this.onTouchStart.bind(this) );
        document.body.addEventListener( 'touchmove',   this.onTouchMove.bind(this) );
        document.body.addEventListener( 'touchend',    this.onTouchEnd.bind(this) );
        document.body.addEventListener( 'touchcancel', this.onTouchEnd.bind(this) );
    }

    private onTouchStart(_: TouchEvent) : void
    {
        console.log(_);
    }

    private onTouchMove(_: TouchEvent) : void
    {

    }

    private onTouchEnd(_: TouchEvent) : void
    {
        console.log(_);
    }
}