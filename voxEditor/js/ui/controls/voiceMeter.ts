/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** UI control for visualizing the live input stream */
export class VoiceMeter
{
    /** Reference to the container for this meter */
    private readonly dom       : HTMLElement;
    /** Reference to the canvas element for this meter */
    private readonly domCanvas : HTMLCanvasElement;
    /** Reference to the 2D drawing state for this meter */
    private readonly context   : CanvasRenderingContext2D;

    /** Currently queued animation frame reference number */
    private frame   : number = 0;
    /** How many frames remaining to draw a grid line */
    private grid    : number = 0;
    /** How many frames remaining to show "peaked" status in the given data */
    private peaked  : number = 0;
    /** How many seconds have passed since recording began; inaccurate */
    private seconds : number = 0;

    public constructor(query: string)
    {
        this.dom       = DOM.require(query);
        this.domCanvas = DOM.require('canvas', this.dom);
        this.context   = this.domCanvas.getContext('2d')!;

        this.redraw();
    }

    /** Resizes the canvas to the current container size and resets state */
    public redraw() : void
    {
        // Stop any queued draw
        cancelAnimationFrame(this.frame);
        this.frame   = 0;
        this.grid    = 0;
        this.peaked  = 0;
        this.seconds = 0;

        // Set the correct dimensions (and incidentally clears)
        let width  = this.domCanvas.width  = this.dom.clientWidth  * 2;
        let height = this.domCanvas.height = this.dom.clientHeight * 2;

        // Draw middle line
        this.context.fillStyle = '#AAAAAA';
        this.context.fillRect(0, (height / 2) - 1, width, 3);

        // Setup font
        this.context.font = '16px monospace';
    }

    /** Draws the given buffer onto the meter, limited to 60 FPS */
    public draw(buf: Float32Array) : void
    {
        if (this.frame)
            return;

        // Enforce 60 FPS limit for drawing the voice meter
        this.frame = requestAnimationFrame(_ =>
        {
            this.drawFrame(buf);
            this.frame = 0;
        });
    }

    /** Draws the given buffer for one frame */
    private drawFrame(buf: Float32Array) : void
    {
        let width     = this.domCanvas.width;
        let height    = this.domCanvas.height;
        let midHeight = height / 2;
        let ctx       = this.context;

        // Shift the existing image data to the right by 2 pixels
        ctx.putImageData(ctx.getImageData(0, 0, width, height), 2, 0);
        ctx.clearRect(0, 0, 2, height);

        // Summarize the given buffer
        let posSum = 0,
            negSum = 0;

        buf.forEach(v =>
        {
            if (v > 0) posSum += v;
            else       negSum += v;
        });

        posSum = (posSum / buf.length) * height;
        negSum = (negSum / buf.length) * height;

        if (posSum > height * 0.25 || negSum < -height * 0.25)
            this.peaked  = 30;
        else
            this.peaked -= (this.peaked) ? 1 : 0;

        // Draw grid lines
        this.grid--;

        if (this.grid <= 0)
        {
            this.context.fillStyle = '#444444';
            this.context.fillRect(0, 0, 2, height);

            this.context.fillStyle = '#AAAAAA';
            ctx.fillText(`${this.seconds}`, 4, height - 8);

            this.grid     = 30;
            this.seconds += 0.5;
        }

        // Draw middle line and peak
        this.context.fillStyle = this.peaked ? '#CC0B00' : '#CC7E00';
        this.context.fillRect(0, midHeight - 1, width, 3);
        this.context.fillRect(0, midHeight - 1, 2, negSum);
        this.context.fillRect(0, midHeight + 1, 2, posSum);
    }
}