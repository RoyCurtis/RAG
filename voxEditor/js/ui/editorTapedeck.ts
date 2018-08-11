/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";
import {ClipEditor} from "./controls/clipEditor";
import {VoiceMeter} from "./controls/voiceMeter";

/** Controller for the tape deck part of the editor */
export class EditorTapedeck
{
    private readonly clipEditor   : ClipEditor;

    private readonly voiceMeter   : VoiceMeter;

    private readonly domForm      : HTMLFormElement;

    private readonly btnPrev      : HTMLButtonElement;

    private readonly btnPlay      : HTMLButtonElement;

    private readonly btnStop      : HTMLButtonElement;

    private readonly btnRec       : HTMLButtonElement;

    private readonly btnSave      : HTMLButtonElement;

    private readonly btnNext      : HTMLButtonElement;

    private readonly lblId        : HTMLParagraphElement;

    private readonly lblCaption   : HTMLParagraphElement;

    public constructor()
    {
        this.clipEditor = new ClipEditor('.clipEditor');
        this.voiceMeter = new VoiceMeter('.voiceMeter');
        this.domForm    = DOM.require('#frmTapedeck');
        this.btnPrev    = DOM.require('#btnPrev',    this.domForm);
        this.btnPlay    = DOM.require('#btnPlay',    this.domForm);
        this.btnStop    = DOM.require('#btnStop',    this.domForm);
        this.btnRec     = DOM.require('#btnRec',     this.domForm);
        this.btnSave    = DOM.require('#btnSave',    this.domForm);
        this.btnNext    = DOM.require('#btnNext',    this.domForm);
        this.lblId      = DOM.require('.id',         this.domForm);
        this.lblCaption = DOM.require('.caption',    this.domForm);

        window.onresize       = this.onResize.bind(this);
        this.domForm.onsubmit = ev => ev.preventDefault();
        this.btnPrev.onclick  = this.onPrev.bind(this);
        this.btnPlay.onclick  = this.onPlay.bind(this);
        this.btnStop.onclick  = this.onStop.bind(this);
        this.btnRec.onclick   = this.onRec.bind(this);
        this.btnSave.onclick  = this.onSave.bind(this);
        this.btnNext.onclick  = this.onNext.bind(this);
    }

    public load(key: string) : void
    {
        let path = VoxEditor.voices.keyToPath(key);

        this.lblId.innerText      = `Loading '${key}'...`;
        this.lblCaption.innerText = `Loading from: ${path}`;

        VoxEditor.voices.loadFromDisk(key)
            .then ( this.onLoadSuccess.bind(this) )
            .catch( this.update.bind(this)        );
    }

    /** Updates the tapedeck UI to reflect the current state */
    public update() : void
    {
        this.btnPrev.disabled = true;
        this.btnPlay.disabled = true;
        this.btnStop.disabled = true;
        this.btnRec.disabled  = true;
        this.btnSave.disabled = true;
        this.btnNext.disabled = true;

        this.clipEditor.redraw();

        // Check if a track has actually been selected
        let currentTrack = VoxEditor.views.phrases.currentEntry;
        if (!currentTrack)
            return;

        let key = VoxEditor.views.phrases.currentKey!;

        this.lblId.innerText      = key;
        this.lblCaption.innerText = VoxEditor.captioner.captionBank[key];

        this.btnPrev.disabled = false;
        this.btnNext.disabled = false;

        // Check if we can record
        if (VoxEditor.mics.canRecord)
            this.btnRec.disabled = false;
        else
            this.btnRec.classList.remove('recording');

        if (VoxEditor.voices.currentClip)
        {
            this.btnPlay.disabled = false;
            this.btnStop.disabled = false;
            this.btnSave.disabled = false;
        }
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
    public handleRecDone() : void
    {
        this.voiceMeter.redraw();
        VoxEditor.views.tapedeck.onPlay();
    }

    private onResize() : void
    {
        this.clipEditor.redraw();
        this.voiceMeter.redraw();
    }

    private onPrev() : void
    {
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
            VoxEditor.mics.startRecording();
        else
        {
            VoxEditor.mics.stopRecording();
            this.update();
        }
    }

    private onSave() : void
    {
        VoxEditor.voices.saveClip(
            VoxEditor.views.phrases.currentKey!,
            this.clipEditor.getBounds()
        );
    }

    private onNext() : void
    {
        VoxEditor.views.phrases.selectNext();
    }

    private onLoadSuccess() : void
    {
        this.update();
    }
}