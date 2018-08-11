/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../../voxEditor";

/** UI control for visualizing and editing waveform data */
export class ClipEditor
{
    private readonly dom          : HTMLElement;

    private readonly domCanvas    : HTMLCanvasElement;

    private readonly domTitle     : HTMLSpanElement;

    private readonly domNeedle    : HTMLElement;

    private readonly clipperLeft  : HTMLElement;

    private readonly clipperRight : HTMLElement;

    private readonly context      : CanvasRenderingContext2D;

    private clipperDrag? : HTMLElement;

    private needleTimer : number = 0;

    public constructor(query: string)
    {
        this.dom          = DOM.require(query);
        this.domCanvas    = DOM.require('canvas',         this.dom);
        this.domTitle     = DOM.require('.title',         this.dom);
        this.domNeedle    = DOM.require('.needle',        this.dom);
        this.clipperLeft  = DOM.require('.clipper.left',  this.dom);
        this.clipperRight = DOM.require('.clipper.right', this.dom);
        this.context      = this.domCanvas.getContext('2d')!;

        this.dom.onmousedown =
        this.dom.onmousemove =
        this.dom.onmouseout  =
        this.dom.onmouseup   = this.onClipperInteract.bind(this);

        this.redraw();
    }

    /** Shows and begins animating the needle from left to right bound */
    public beginNeedle() : void
    {
        this.domNeedle.classList.remove('hidden');

        let clip = VoxEditor.voices.currentClip;

        if (!clip)
            return;

        // This is not 100% accurate as it has no way to sync with playing audio, but
        // it's better than the more complicated setup of using an analyser node.

        let step = (this.dom.clientWidth / clip.duration) / 1000;
        let last = performance.now();
        let left = this.clipperLeft.clientWidth;
        let loop = (time : number) =>
        {
            left += step * (time - last);
            last  = time;

            // Sanity check; if we go off canvas, stop animating
            if (left > this.dom.clientWidth)
                this.endNeedle();

            this.domNeedle.style.left = `${left}px`;
            this.needleTimer          = requestAnimationFrame(loop);
        };

        loop(last);
    }

    /** Stops animating the needle and hides it */
    public endNeedle() : void
    {
        cancelAnimationFrame(this.needleTimer);
        this.domNeedle.classList.add('hidden');
    }

    public getBounds() : [number, number]
    {
        let width = this.dom.clientWidth;
        let left  = this.clipperLeft.clientWidth;
        let right = width - this.clipperRight.clientWidth;

        return [left / width, right / width];
    }

    public shiftBounds(amount: number, right: boolean) : void
    {
        let target = right ? this.clipperRight : this.clipperLeft;
        let width  = right
            ? target.offsetWidth - amount
            : target.offsetWidth + amount;

        this.resizeClipper(target, width);
    }

    public glowLeftBound(state: boolean) : void
    {
        if (state) this.clipperLeft.classList.add('dragging');
        else       this.clipperLeft.classList.remove('dragging');
    }

    public glowRightBound(state: boolean) : void
    {
        if (state) this.clipperRight.classList.add('dragging');
        else       this.clipperRight.classList.remove('dragging');
    }

    public redraw() : void
    {
        let width     = this.domCanvas.width  = this.dom.clientWidth  * 2;
        let height    = this.domCanvas.height = this.dom.clientHeight * 2;
        let midHeight = height / 2;
        let buffer    = VoxEditor.voices.currentClip;

        // Reset clippers
        this.stopDragging();
        this.clipperLeft.style.width  =
        this.clipperRight.style.width = '1px';

        // Draw middle line
        this.context.fillStyle = buffer ? 'orange' : '#AAAAAA';
        this.context.fillRect(0, midHeight - 1, width, 3);

        // Don't proceed if there's no buffer to work with
        if (!buffer)
            return;

        let channel = buffer.getChannelData(0);
        let sums    = this.summarize(channel, width);

        // Draw the summarized data
        this.context.fillStyle = '#CC7E00';
        for (let x = 0; x < width; x++)
        {
            this.context.fillRect(x, midHeight - 1, 1, (sums[x][0] * height) * 0.75);
            this.context.fillRect(x, midHeight + 1, 1, (sums[x][1] * height) * 0.75);
        }
    }

    public setTitle(title: string) : void
    {
        this.domTitle.innerText = title;
    }

    /**
     *
     * @see http://joesul.li/van/2014/03/drawing-waveforms/
     * @param data
     * @param width
     */
    private summarize(data: Float32Array, width: number) : [number, number][]
    {
        let values : [number, number][] = [];

        // Define a minimum sample size per pixel
        let pixelLength = Math.round(data.length / width);
        let sampleSize  = Math.min(pixelLength, 512);

        // For each pixel we display
        for (let i = 0; i < width; i++)
        {
            let posSum = 0,
                negSum = 0;

            // Cycle through the data-points relevant to the pixel
            // Don't cycle through more than sampleSize frames per pixel.
            for (let j = 0; j < sampleSize; j++)
            {
                let val = data[i * pixelLength + j];

                // Keep track of positive and negative values separately
                if (val > 0) posSum += val;
                else         negSum += val;
            }

            values.push( [negSum / sampleSize, posSum / sampleSize] );
        }

        return values;
    }

    private onClipperInteract(ev: MouseEvent) : void
    {
        let target    = ev.target as HTMLElement;
        let isClipper = target.classList.contains('clipper');

        if (!target) return;

        // Begin drag operation
        if (ev.type === 'mousedown' && isClipper && !this.clipperDrag)
        {
            this.clipperDrag = target;
            this.clipperDrag.classList.add('dragging');

            // Clear any selections, as they will break dragging
            window.getSelection().empty();
        }

        // End drag operation on any mouse release
        if (ev.type === 'mouseup' || (ev.buttons & 1) === 0)
            this.stopDragging();

        // Discontinue if there's nothing to drag
        if (!this.clipperDrag)
            return;

        // Do move
        let rect  = this.clipperDrag.getBoundingClientRect();
        let width = (this.clipperDrag === this.clipperLeft)
            ? ev.clientX - rect.left
            : rect.right - ev.clientX;

        this.resizeClipper(this.clipperDrag, width);
    }

    private resizeClipper(which: HTMLElement, width: number) : void
    {
        let otherClipper = (which === this.clipperLeft)
            ? this.clipperRight
            : this.clipperLeft;

        let maxWidth = (this.dom.offsetWidth - otherClipper.offsetWidth) - 10;

        if (width < 1)        width = 1;
        if (width > maxWidth) width = maxWidth;

        which.style.width = `${width}px`;
    }

    private stopDragging() : void
    {
        if (!this.clipperDrag)
            return;

        this.clipperDrag.classList.remove('dragging');
        return this.clipperDrag = undefined;
    }
}