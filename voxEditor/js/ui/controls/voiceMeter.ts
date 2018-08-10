/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../../voxEditor";

/** UI control for visualizing the live input stream*/
export class VoiceMeter
{
    private readonly dom       : HTMLElement;

    private readonly domCanvas : HTMLCanvasElement;

    private readonly context   : CanvasRenderingContext2D;

    private peaked : number = 0;

    public constructor(query: string)
    {
        this.dom       = DOM.require(query);
        this.domCanvas = DOM.require('canvas', this.dom);
        this.context   = this.domCanvas.getContext('2d')!;

        window.onresize = this.reshape.bind(this);
        this.reshape();
    }

    public reshape() : void
    {
        let width  = this.domCanvas.width  = this.dom.clientWidth  * 2;
        let height = this.domCanvas.height = this.dom.clientHeight * 2;

        // Draw middle line
        this.context.fillStyle = '#CC7E00';
        this.context.fillRect(0, (height / 2) - 1, width, 3);
    }

    public draw(buf: Float32Array)
    {
        let width     = this.domCanvas.width;
        let height    = this.domCanvas.height;
        let midHeight = height / 2;
        let ctx       = this.context;

        ctx.putImageData(ctx.getImageData(0, 0, width, height), 1, 0);
        ctx.clearRect(0, 0, 1, height);

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
            this.peaked = 100;
        else
            this.peaked -= (this.peaked) ? 1 : 0;

        // Draw middle line and peak
        this.context.fillStyle = this.peaked ? '#CC0B00' : '#CC7E00';
        this.context.fillRect(0, midHeight - 1, width, 3);
        this.context.fillRect(0, midHeight - 1, 1, negSum);
        this.context.fillRect(0, midHeight + 1, 1, posSum);
    }
}