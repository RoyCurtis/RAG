/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../../voxEditor";

/** UI control for visualizing and editing waveform data */
export class ClipEditor
{
    private readonly dom          : HTMLElement;

    private readonly domCanvas    : HTMLCanvasElement;

    private readonly domTitle     : HTMLSpanElement;

    private readonly clipperLeft  : HTMLElement;

    private readonly clipperRight : HTMLElement;

    private readonly context      : CanvasRenderingContext2D;

    private clipperDrag? : HTMLElement;

    public constructor(query: string)
    {
        this.dom          = DOM.require(query);
        this.domCanvas    = DOM.require('canvas',         this.dom);
        this.domTitle     = DOM.require('.title',         this.dom);
        this.domTitle     = DOM.require('.title',         this.dom);
        this.clipperLeft  = DOM.require('.clipper.left',  this.dom);
        this.clipperRight = DOM.require('.clipper.right', this.dom);
        this.context      = this.domCanvas.getContext('2d')!;

        this.dom.onmousedown =
        this.dom.onmousemove =
        this.dom.onmouseout  =
        this.dom.onmouseup   = this.onClipperInteract.bind(this);

        this.redraw();
    }

    public redraw() : void
    {
        let width     = this.domCanvas.width  = this.dom.clientWidth  * 2;
        let height    = this.domCanvas.height = this.dom.clientHeight * 2;
        let midHeight = height / 2;
        let buffer    = VoxEditor.voices.currentClip;
        let path      = VoxEditor.voices.currentPath;

        // Reset clippers
        this.stopDragging();
        this.clipperLeft.style.width  =
        this.clipperRight.style.width = '1px';

        // Handle metadata
        if (!buffer)
        {
            this.domTitle.innerText = 'No data available';
            return;
        }
        else
            this.domTitle.innerText = path!;

        let channel = buffer.getChannelData(0);
        let sums    = this.summarize(channel, width);

        // Draw middle line
        this.context.fillStyle = 'orange';
        this.context.fillRect(0, midHeight - 1, width, 3);

        // Draw the summarized data
        this.context.fillStyle = '#CC7E00';
        for (let x = 0; x < width; x++)
        {
            this.context.fillRect(x, midHeight - 1, 1, (sums[x][0] * height) * 0.75);
            this.context.fillRect(x, midHeight + 1, 1, (sums[x][1] * height) * 0.75);
        }
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
        let thisClipper  = this.clipperDrag;
        let otherClipper = (thisClipper === this.clipperLeft)
            ? this.clipperRight
            : this.clipperLeft;

        let rect     = thisClipper.getBoundingClientRect();
        let maxWidth = (this.dom.clientWidth - otherClipper.clientWidth) - 10;
        let width    = (thisClipper === this.clipperLeft)
            ? ev.clientX - rect.left
            : rect.right - ev.clientX;

        if (width < 1)        width = 1;
        if (width > maxWidth) width = maxWidth;

        thisClipper.style.width = `${width}px`;
    }

    private stopDragging() : void
    {
        if (!this.clipperDrag)
            return;

        this.clipperDrag.classList.remove('dragging');
        return this.clipperDrag = undefined;
    }
}