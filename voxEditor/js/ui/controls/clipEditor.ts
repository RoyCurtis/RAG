/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../../voxEditor";

/** UI control for visualizing and editing waveform data */
export class ClipEditor
{
    private readonly dom       : HTMLElement;

    private readonly domCanvas : HTMLCanvasElement;

    private readonly domTitle  : HTMLSpanElement;

    private readonly context   : CanvasRenderingContext2D;

    public constructor(query: string)
    {
        this.dom       = DOM.require(query);
        this.domCanvas = DOM.require('canvas', this.dom);
        this.domTitle  = DOM.require('.title', this.dom);
        this.context   = this.domCanvas.getContext('2d')!;

        window.onresize = this.redraw.bind(this);
        this.redraw();
    }

    public redraw() : void
    {
        let width     = this.domCanvas.width  = this.dom.clientWidth  * 2;
        let height    = this.domCanvas.height = this.dom.clientHeight * 2;
        let midHeight = height / 2;

        let buffer = VoxEditor.voices.currentClip;
        let path   = VoxEditor.voices.currentPath;

        if (!buffer)
        {
            this.domTitle.innerText = 'No data loaded';
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
            this.context.fillRect(x, midHeight - 1, 1, sums[x][0] * height);
            this.context.fillRect(x, midHeight + 1, 1, sums[x][1] * height);
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
}