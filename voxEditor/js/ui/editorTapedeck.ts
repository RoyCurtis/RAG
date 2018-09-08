/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";
import {ClipEditor} from "./controls/clipEditor";
import {VoiceMeter} from "./controls/voiceMeter";
import {GamepadButtonEvent, Gamepads, XBOX} from "../util/gamepads";
import {PhrasePreview} from "./controls/phrasePreview";

/** Controller for the tape deck part of the editor */
export class EditorTapedeck
{
    public  readonly btnBack    : HTMLButtonElement;

    public  readonly btnPrev    : HTMLButtonElement;

    public  readonly btnPlay    : HTMLButtonElement;

    public  readonly btnStop    : HTMLButtonElement;

    public  readonly btnRec     : HTMLButtonElement;

    public  readonly btnSave    : HTMLButtonElement;

    public  readonly btnLoad    : HTMLButtonElement;

    public  readonly btnNext    : HTMLButtonElement;

    public  readonly btnFwd     : HTMLButtonElement;

    private readonly clipEditor : ClipEditor;

    private readonly voiceMeter : VoiceMeter;

    private readonly previewer  : PhrasePreview;

    private readonly domForm    : HTMLFormElement;

    private readonly lblId      : HTMLParagraphElement;

    private history    : string[] = [];

    private historyIdx : number   = 0;

    private _dirty     : boolean  = false;

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
        this.previewer  = new PhrasePreview('#phrasePreviewer');
        // TODO: Make a View base class, with sugar for these
        this.domForm    = DOM.require('#frmTapedeck');
        this.btnBack    = DOM.require('#btnBack', this.domForm);
        this.btnPrev    = DOM.require('#btnPrev', this.domForm);
        this.btnPlay    = DOM.require('#btnPlay', this.domForm);
        this.btnStop    = DOM.require('#btnStop', this.domForm);
        this.btnRec     = DOM.require('#btnRec',  this.domForm);
        this.btnSave    = DOM.require('#btnSave', this.domForm);
        this.btnLoad    = DOM.require('#btnLoad', this.domForm);
        this.btnNext    = DOM.require('#btnNext', this.domForm);
        this.btnFwd     = DOM.require('#btnFwd',  this.domForm);
        this.lblId      = DOM.require('.id',      this.domForm);

        window.onresize       = this.onResize.bind(this);
        window.onkeydown      = this.onKeyDown.bind(this);
        Gamepads.onbuttondown = this.onPadDown.bind(this);
        Gamepads.onbuttonup   = this.onPadUp.bind(this);
        Gamepads.onbuttonhold = this.onPadHold.bind(this);
        this.domForm.onsubmit = ev => ev.preventDefault();
        this.btnBack.onclick  = this.onBack.bind(this);
        this.btnPrev.onclick  = this.onPrev.bind(this);
        this.btnPlay.onclick  = this.onPlay.bind(this);
        this.btnStop.onclick  = this.onStop.bind(this);
        this.btnRec.onclick   = this.onRec.bind(this);
        this.btnSave.onclick  = this.onSave.bind(this);
        this.btnLoad.onclick  = this.onLoad.bind(this);
        this.btnNext.onclick  = this.onNext.bind(this);
        this.btnFwd.onclick   = this.onFwd.bind(this);

        // Mark dirty from bounds change only if clip is loaded
        this.clipEditor.onchange = () =>
            this.dirty = VoxEditor.voices.currentClip !== undefined;
    }

    public handleMicChange() : void
    {
        this.btnRec.disabled = true;

        if (VoxEditor.mics.canRecord)
        if (VoxEditor.voices.currentPath)
            this.btnRec.disabled = false;
    }

    public handleClipLoading(key: string) : void
    {
        let path = VoxEditor.voices.keyToPath(key);

        this.lblId.innerText  = `Loading '${key}'...`;
        this.previewer.setText(`Loading from: ${path}`);
    }

    public handleClipLoad(key: string) : void
    {
        let clip  = VoxEditor.voices.currentClip;
        let path  = VoxEditor.voices.currentPath!;

        this.previewer.generateExample(key);
        this.lblId.innerText  = key;
        this.btnRec.disabled  =
        this.btnNext.disabled =
        this.btnPrev.disabled = false;

        this.btnPlay.disabled =
        this.btnStop.disabled =
        this.btnSave.disabled =
        this.btnLoad.disabled = (clip === undefined);

        this.clipEditor.redraw(true);

        // Don't record duplicates or back entries into history
        if (this.history[this.historyIdx] !== key)
        {
            // If this new entry is the same as the forward entry, shift index forward
            if (this.history[this.historyIdx + 1] === key)
                this.historyIdx++;
            // Else, clear all forward history and add new history entry
            else
            {
                this.history.splice(this.historyIdx + 1);
                this.history.push(key);
                this.historyIdx = this.history.length - 1;
            }
        }

        this.btnBack.disabled = (this.history.length < 2 || this.historyIdx === 0);
        this.btnFwd.disabled  = (this.historyIdx === this.history.length - 1);
    }

    public handleClipFail(key: string) : void
    {
        this.previewer.generateExample(key);
        this.clipEditor.redraw(true);
        this.lblId.innerText = key;
    }

    public handleClipUnload() : void
    {
        this.btnPlay.disabled =
        this.btnStop.disabled =
        this.btnRec.disabled  =
        this.btnSave.disabled =
        this.btnLoad.disabled = true;
        this.dirty            = false;
        this.clipEditor.redraw(true);
    }

    /** Called when a clip has begun playing */
    public handleBeginPlay(needle: boolean) : void
    {
        this.btnStop.hidden = false;
        this.btnPlay.hidden = true;

        if (needle)
            this.clipEditor.beginNeedle();
    }

    /** Called when a clip has finished or stopped playing */
    public handleEndPlay() : void
    {
        this.btnStop.hidden = true;
        this.btnPlay.hidden = false;
        this.clipEditor.endNeedle();
    }

    /** Called when raw data from recording is available */
    public handleMicData(buf: Float32Array, recording: boolean) : void
    {
        this.voiceMeter.draw(buf, recording);
    }

    /** Called when recording from the microphone is finished */
    public handleRecDone(key: string): void
    {
        this.handleClipLoad(key);
        VoxEditor.views.tapedeck.onPlay();
    }

    private onKeyDown(_: KeyboardEvent) : void
    {
        // TODO: Implement
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
            case XBOX.Left:  return this.btnBack.click();
            case XBOX.Right: return this.btnFwd.click();
            case XBOX.Down:  return this.clipEditor.redraw(true);
            case XBOX.Start: return this.btnSave.click();
            case XBOX.Back:  return this.btnLoad.click();
            case XBOX.LS:    return this.onScale(1 / 0.9);
            case XBOX.RS:    return this.onScale(0.9);
            case XBOX.X:
                if (!this.btnPlay.disabled)
                    VoxEditor.voices.playPreview(this.previewer.dom);

                return;
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
            (magLeft * 16) + (magRight * 2),
            ev.button === XBOX.RT
        );
    }

    private onResize() : void
    {
        this.clipEditor.redraw(true);
        this.voiceMeter.redraw();
    }

    private onBack() : void
    {
        // Note: Button states are handled by handleClipLoad
        let prev = this.history[this.historyIdx - 1];

        if (!prev) return;

        this.historyIdx--;
        VoxEditor.views.phrases.selectKey(prev);
    }

    private onPrev() : void
    {
        if (this.dirty)
            VoxEditor.voices.saveClip( this.clipEditor.getBounds() );

        VoxEditor.views.phrases.selectPrev();
    }

    public onPlay(ev?: MouseEvent) : void
    {
        if (ev && ev.shiftKey)
            VoxEditor.voices.playPreview(this.previewer.dom);
        else
            VoxEditor.voices.playClip( this.clipEditor.getBounds() );
    }

    private onStop() : void
    {
        VoxEditor.voices.stopClip();
        VoxEditor.voices.stopPreview();
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
            this.btnRec.disabled = true;

            // Stop recording after a delay, to prevent accidental clipping
            setTimeout(() =>
            {
                VoxEditor.mics.stopRecording();
                this.btnPrev.disabled =
                this.btnPlay.disabled =
                this.btnStop.disabled =
                this.btnRec.disabled  =
                this.btnSave.disabled =
                this.btnLoad.disabled =
                this.btnNext.disabled = false;
                this.dirty            = true;
            }, 250);
        }
    }

    private onSave() : void
    {
        this.dirty = false;
        VoxEditor.voices.saveClip( this.clipEditor.getBounds() );
        this.clipEditor.redraw(true);
    }

    private onLoad() : void
    {
        VoxEditor.voices.loadFromDisk();
    }

    private onNext() : void
    {
        // TODO: Make auto-saving on prev/next a toggleable option
        if (this.dirty)
            VoxEditor.voices.saveClip( this.clipEditor.getBounds() );

        VoxEditor.views.phrases.selectNext();
    }

    private onFwd() : void
    {
        // Note: Button states and index shifting are handled by handleClipLoad
        let next = this.history[this.historyIdx + 1];

        if (!next) return;

        this.historyIdx++;
        VoxEditor.views.phrases.selectKey(next);
    }

    private onScale(scale: number) : void
    {
        if (!VoxEditor.voices.currentClip)
            return;

        this.dirty = true;
        VoxEditor.voices.scaleClip( scale, this.clipEditor.getBounds() );
        this.clipEditor.redraw(false);
    }
}