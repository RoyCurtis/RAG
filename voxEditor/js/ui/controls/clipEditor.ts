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
        let width  = this.domCanvas.width  = this.dom.clientWidth;
        let height = this.domCanvas.height = this.dom.clientHeight;

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
        let step    = channel.length / width;

        // Iterate through every horizontal coordinate
        for (let x = 0; x < width; x++)
        {
            let avg = 0;

            // Create an average for this chunk of samples
            for (let i = x; i < (step * x); i++)
                avg += channel[i];

            avg /= step;

            this.context.fillStyle = '#CC7E00';
            this.context.fillRect( x - 2, height / 2, 1, avg * -(height / 1.5) );
            this.context.fillRect( x - 2, height / 2, 1, avg *  (height / 1.5) );
        }
    }
}