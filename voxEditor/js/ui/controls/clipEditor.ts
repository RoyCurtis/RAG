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

        this.redraw();
    }

    public redraw() : void
    {
        this.domCanvas.width  = this.dom.clientWidth;
        this.domCanvas.height = this.dom.clientHeight;

        let buffer = VoxEditor.voices.currentClip;
        let path   = VoxEditor.voices.currentPath;

        if (!buffer)
            return this.drawNone();

        this.domTitle.innerText = path!;
    }

    private drawNone() : void
    {
        this.domTitle.innerText = 'No data loaded';
    }
}