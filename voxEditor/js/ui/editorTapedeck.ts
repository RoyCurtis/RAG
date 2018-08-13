/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";
import {ClipEditor} from "./controls/clipEditor";
import {VoiceMeter} from "./controls/voiceMeter";
import {GamepadButtonEvent, Gamepads, XBOX} from "../util/gamepads";
import {fail} from "assert";

/** Controller for the tape deck part of the editor */
export class EditorTapedeck
{
    public  readonly btnPrev    : HTMLButtonElement;

    public  readonly btnPlay    : HTMLButtonElement;

    public  readonly btnStop    : HTMLButtonElement;

    public  readonly btnRec     : HTMLButtonElement;

    public  readonly btnSave    : HTMLButtonElement;

    public  readonly btnLoad    : HTMLButtonElement;

    public  readonly btnNext    : HTMLButtonElement;

    private readonly clipEditor : ClipEditor;

    private readonly voiceMeter : VoiceMeter;

    private readonly domForm    : HTMLFormElement;

    private readonly lblId      : HTMLParagraphElement;

    private readonly lblCaption : HTMLParagraphElement;

    private _dirty : boolean = false;

    public get dirty(): boolean
    {
        return this._dirty;
    }

    public set dirty(value: boolean)
    {
        if (value) this.btnSave.classList.add('savePending');
        else       this.btnSave.classList.remove('savePending');

        this._dirty = value;
    }

    public constructor()
    {
        this.clipEditor = new ClipEditor('.clipEditor');
        this.voiceMeter = new VoiceMeter('.voiceMeter');
        this.domForm    = DOM.require('#frmTapedeck');
        this.btnPrev    = DOM.require('#btnPrev', this.domForm);
        this.btnPlay    = DOM.require('#btnPlay', this.domForm);
        this.btnStop    = DOM.require('#btnStop', this.domForm);
        this.btnRec     = DOM.require('#btnRec',  this.domForm);
        this.btnSave    = DOM.require('#btnSave', this.domForm);
        this.btnLoad    = DOM.require('#btnLoad', this.domForm);
        this.btnNext    = DOM.require('#btnNext', this.domForm);
        this.lblId      = DOM.require('.id',      this.domForm);
        this.lblCaption = DOM.require('.caption', this.domForm);

        window.onresize       = this.onResize.bind(this);
        window.onkeydown      = this.onKeyDown.bind(this);
        Gamepads.onbuttondown = this.onPadDown.bind(this);
        Gamepads.onbuttonup   = this.onPadUp.bind(this);
        Gamepads.onbuttonhold = this.onPadHold.bind(this);
        this.domForm.onsubmit = ev => ev.preventDefault();
        this.btnPrev.onclick  = this.onPrev.bind(this);
        this.btnPlay.onclick  = this.onPlay.bind(this);
        this.btnStop.onclick  = this.onStop.bind(this);
        this.btnRec.onclick   = this.onRec.bind(this);
        this.btnSave.onclick  = this.onSave.bind(this);
        this.btnLoad.onclick  = this.onLoad.bind(this);
        this.btnNext.onclick  = this.onNext.bind(this);

        // Mark dirty from bounds change only if clip is loaded
        this.clipEditor.onchange = () =>
            this.dirty = VoxEditor.voices.currentClip !== undefined;
    }

    public handleMicChange() : void
    {
        this.btnRec.disabled = true;

        if (VoxEditor.mics.canRecord)
        if (VoxEditor.voices.currentClip)
            this.btnRec.disabled = false;
    }

    public handleClipLoading(key: string) : void
    {
        let path = VoxEditor.voices.keyToPath(key);

        this.btnNext.disabled     =
        this.btnPrev.disabled     = false;
        this.lblId.innerText      = `Loading '${key}'...`;
        this.lblCaption.innerText = `Loading from: ${path}`;
    }

    public handleClipLoad(key: string) : void
    {
        let hasClip = (VoxEditor.voices.currentClip !== undefined)
        let path    = VoxEditor.voices.currentPath!;
        let title   = hasClip
            ? path
            : `New file, will be saved at: ${path}`;

        this.lblId.innerText      = key;
        this.lblCaption.innerText = VoxEditor.captioner.captionBank[key];
        this.btnRec.disabled      = false;

        this.btnPlay.disabled =
        this.btnStop.disabled =
        this.btnSave.disabled =
        this.btnLoad.disabled = !hasClip;

        this.clipEditor.setTitle(title);
        this.clipEditor.redraw();
    }

    public handleClipFail(key: string, err: any) : void
    {
        this.lblId.innerText      = key;
        this.lblCaption.innerText = VoxEditor.captioner.captionBank[key];

        this.clipEditor.setTitle(`Could not load clip: ${err}`);
    }

    public handleClipUnload() : void
    {
        this.btnPlay.disabled =
        this.btnStop.disabled =
        this.btnRec.disabled  =
        this.btnSave.disabled =
        this.btnLoad.disabled = true;
        this.dirty            = false;
        this.clipEditor.redraw();
    }

    /** Called when a clip has begun playing */
    public handleBeginPlay() : void
    {
        this.clipEditor.beginNeedle();
    }

    /** Called when a clip has finished or stopped playing */
    public handleEndPlay() : void
    {
        this.clipEditor.endNeedle();
    }

    /** Called when raw data from recording is available */
    public handleMicData(buf: Float32Array) : void
    {
        this.voiceMeter.draw(buf);
    }

    /** Called when recording from the microphone is finished */
    public handleRecDone(key: string): void
    {
        this.handleClipLoad(key);
        this.voiceMeter.redraw();
        VoxEditor.views.tapedeck.onPlay();
    }

    private onKeyDown(_: KeyboardEvent) : void
    {

    }

    private onPadDown(ev: GamepadButtonEvent) : void
    {
        switch(ev.button)
        {
            case XBOX.LT:    return this.clipEditor.glowLeftBound(true);
            case XBOX.RT:    return this.clipEditor.glowRightBound(true);
            case XBOX.A:     return this.btnPlay.click();
            case XBOX.B:     return this.btnStop.click();
            case XBOX.Y:     return this.btnRec.click();
            case XBOX.LB:    return this.btnPrev.click();
            case XBOX.RB:    return this.btnNext.click();
            case XBOX.Start: return this.btnSave.click();
            case XBOX.Back:  return this.btnLoad.click();
            case XBOX.LS:    return this.onScale(1.25);
            case XBOX.RS:    return this.onScale(0.8);
        }
    }

    private onPadUp(ev: GamepadButtonEvent) : void
    {
        switch(ev.button)
        {
            case XBOX.LT: return this.clipEditor.glowLeftBound(false);
            case XBOX.RT: return this.clipEditor.glowRightBound(false);
            case XBOX.Y:  return this.btnRec.click();
        }
    }

    private onPadHold(ev: GamepadButtonEvent) : void
    {
        if (ev.button !== XBOX.LT && ev.button !== XBOX.RT)
            return;

        // Left stick for large shifts, right stick for finer shifts
        let magLeft  = ev.gamepad.axes[0];
        let magRight = ev.gamepad.axes[2];

        // Filter out dead zone (sticks are prone to left-drift)
        if (magLeft  > -0.18 && magLeft  < 0.1) magLeft  = 0;
        if (magRight > -0.18 && magRight < 0.1) magRight = 0;
        if (magLeft + magRight === 0)          return;

        this.dirty = true;
        this.clipEditor.shiftBounds(
            (magLeft * 8) + (magRight * 2),
            ev.button === XBOX.RT
        );
    }

    private onResize() : void
    {
        this.clipEditor.redraw();
        this.voiceMeter.redraw();
    }

    private onPrev() : void
    {
        // TODO: Make this a toggle
        if (this.dirty)
            VoxEditor.voices.saveClip( this.clipEditor.getBounds() );

        VoxEditor.views.phrases.selectPrev();
    }

    public onPlay() : void
    {
        VoxEditor.voices.playClip( this.clipEditor.getBounds() );
    }

    private onStop() : void
    {
        VoxEditor.voices.stopClip();
    }

    private onRec() : void
    {
        let recording = this.btnRec.classList.toggle('recording');

        if (recording)
        {
            this.onStop();
            VoxEditor.mics.startRecording();
            this.btnPrev.disabled =
            this.btnPlay.disabled =
            this.btnStop.disabled =
            this.btnSave.disabled =
            this.btnLoad.disabled =
            this.btnNext.disabled = true;
        }
        else
        {
            VoxEditor.mics.stopRecording();
            this.btnPrev.disabled =
            this.btnPlay.disabled =
            this.btnStop.disabled =
            this.btnSave.disabled =
            this.btnLoad.disabled =
            this.btnNext.disabled = false;
            this.dirty            = true;
        }
    }

    private onSave() : void
    {
        this.dirty = false;
        VoxEditor.voices.saveClip( this.clipEditor.getBounds() );
        VoxEditor.voices.loadFromDisk();
    }

    private onLoad() : void
    {
        VoxEditor.voices.loadFromDisk();
    }

    private onNext() : void
    {
        // TODO: Make this a toggle
        if (this.dirty)
            VoxEditor.voices.saveClip( this.clipEditor.getBounds() );

        VoxEditor.views.phrases.selectNext();
    }

    private onScale(scale: number) : void
    {
        this.dirty = true;
        VoxEditor.voices.scaleClip(scale);
        this.clipEditor.redraw();
    }
}