/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../../voxEditor";

/** UI control for visualizing and editing waveform data */
export class ClipEditor
{
    private readonly dom          : HTMLElement;

    private readonly domCanvas    : HTMLCanvasElement;

    private readonly domTitle     : HTMLSpanElement;

    private readonly domSubtitle  : HTMLSpanElement;

    private readonly domNeedle    : HTMLElement;

    private readonly clipperLeft  : HTMLElement;

    private readonly clipperRight : HTMLElement;

    private readonly context      : CanvasRenderingContext2D;

    public  onchange?    : () => void;

    private clipperDrag? : HTMLElement;

    private needleTimer  : number = 0;

    public constructor(query: string)
    {
        this.dom          = DOM.require(query);
        this.domCanvas    = DOM.require('canvas',         this.dom);
        this.domTitle     = DOM.require('.title',         this.dom);
        this.domSubtitle  = DOM.require('.subtitle',      this.dom);
        this.domNeedle    = DOM.require('.needle',        this.dom);
        this.clipperLeft  = DOM.require('.clipper.left',  this.dom);
        this.clipperRight = DOM.require('.clipper.right', this.dom);
        this.context      = this.domCanvas.getContext('2d')!;

        this.dom.onmousedown =
        this.dom.onmousemove =
        this.dom.onmouseout  =
        this.dom.onmouseup   = this.onClipperInteract.bind(this);

        this.redraw(true);
    }

    /** Shows and begins animating the needle from left to right bound */
    public beginNeedle() : void
    {
        this.domNeedle.hidden = false;

        let clip = VoxEditor.voices.currentClip;

        if (!clip)
            return;

        // This is not 100% accurate as it has no way to sync with playing audio, but
        // it's better than the more complicated setup of using an analyser node.

        let step  = (this.dom.offsetWidth / clip.duration) / 1000;
        let last  = performance.now();
        let left  = this.clipperLeft.offsetWidth;
        let right = this.clipperRight.offsetLeft;
        let loop  = (time : number) =>
        {
            left += step * (time - last);
            last  = time;

            // Clamp to left, kill if out of right
            if (left < 0)     left = 0;
            if (left > right) return this.endNeedle();

            this.domNeedle.style.left = `${left}px`;
            this.needleTimer          = requestAnimationFrame(loop);
        };

        loop(last);
    }

    /** Stops animating the needle and hides it */
    public endNeedle() : void
    {
        cancelAnimationFrame(this.needleTimer);
        this.domNeedle.hidden = true;
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

    public redraw(reset: boolean) : void
    {
        let width     = this.domCanvas.width  = this.dom.clientWidth  * 2;
        let height    = this.domCanvas.height = this.dom.clientHeight * 2;
        let midHeight = height / 2;
        let buffer    = VoxEditor.voices.currentClip;

        // Reset clippers
        if (reset)
        {
            this.stopDragging();
            this.clipperLeft.style.width  =
            this.clipperRight.style.width = '1px';
        }

        // Draw middle line
        this.context.fillStyle = buffer ? 'orange' : '#AAAAAA';
        this.context.fillRect(0, midHeight - 1, width, 3);

        // Don't proceed if there's no buffer to work with, else set text
        if (!buffer)
        {
            this.domSubtitle.innerText = '--/--';
            this.domTitle.innerText    = VoxEditor.voices.currentPath
                ? `New file, will be saved at: ${VoxEditor.voices.currentPath}`
                : 'No data available';

            return;
        }
        else
        {
            let duration = buffer.duration.toPrecision(3);
            let length   = buffer.length;

            this.domTitle.innerText    = VoxEditor.voices.currentPath!;
            this.domSubtitle.innerText = `${duration} seconds, ${length} samples`;
        }

        // Summarize and draw the data. Inlined here for least garbage generation.
        // http://joesul.li/van/2014/03/drawing-waveforms/

        // Define a minimum sample size per pixel
        let channel     = buffer.getChannelData(0);
        let pixelLength = channel.length / width;
        let gridLength  = (buffer.sampleRate / 20) / pixelLength;
        let sampleSize  = Math.min(pixelLength, 512);

        // For each pixel column we draw...
        for (let x = 0; x < width; x++)
        {
            let posSum = 0,
                negSum = 0;

            // If it's roughly 50ms, draw a grid line
            if (x % (gridLength | 0) === 0)
            {
                this.context.fillStyle = '#444444';
                this.context.fillRect(x, 0, 1, height);
                this.context.fillStyle = '#CC7E00';
            }

            // Cycle through the data-points relevant to the column.
            // Don't cycle through more than sampleSize frames per pixel.
            for (let j = 0; j < sampleSize; j++)
            {
                let idx = Math.floor(x * pixelLength + j);
                let val = channel[idx];

                // Keep track of positive and negative values separately
                if (val > 0) posSum += val;
                else         negSum += val;
            }

            posSum = ( (posSum / sampleSize) * height ) * 2;
            negSum = ( (negSum / sampleSize) * height ) * 2;

            this.context.fillRect(x, midHeight + 1, 1, posSum);
            this.context.fillRect(x, midHeight - 1, 1, negSum);
        }
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

        if (this.onchange)
            this.onchange();
    }

    private stopDragging() : void
    {
        if (!this.clipperDrag)
            return;

        this.clipperDrag.classList.remove('dragging');
        return this.clipperDrag = undefined;
    }
}