/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";

/** Controller for the tapedeck part of the editor */
export class EditorTapedeck
{
    private readonly domForm      : HTMLFormElement;

    private readonly domAudio     : HTMLAudioElement;

    private readonly domPeaks     : HTMLDivElement;

    private readonly btnPrev      : HTMLButtonElement;

    private readonly btnPlay      : HTMLButtonElement;

    private readonly btnStop      : HTMLButtonElement;

    private readonly btnRec       : HTMLButtonElement;

    private readonly btnSave      : HTMLButtonElement;

    private readonly btnNext      : HTMLButtonElement;

    private readonly lblId        : HTMLParagraphElement;

    private readonly lblCaption   : HTMLParagraphElement;

    private peaks?     : peaks;


    public constructor()
    {
        this.domForm      = DOM.require('#frmTapedeck');
        this.domAudio     = DOM.require('.peaksAudio', this.domForm);
        this.domPeaks     = DOM.require('.peaks',      this.domForm);
        this.btnPrev      = DOM.require('#btnPrev',    this.domForm);
        this.btnPlay      = DOM.require('#btnPlay',    this.domForm);
        this.btnStop      = DOM.require('#btnStop',    this.domForm);
        this.btnRec       = DOM.require('#btnRec',     this.domForm);
        this.btnSave      = DOM.require('#btnSave',    this.domForm);
        this.btnNext      = DOM.require('#btnNext',    this.domForm);
        this.lblId        = DOM.require('.id',         this.domForm);
        this.lblCaption   = DOM.require('.caption',    this.domForm);

        this.domForm.onsubmit = ev => ev.preventDefault();
        this.btnPrev.onclick  = this.onPrev.bind(this);
        this.btnNext.onclick  = this.onNext.bind(this);
    }

    public load(key: string) : void
    {
        let path = VoxEditor.voices.keyToPath(key);

        this.lblId.innerText      = `Loading '${key}'...`;
        this.lblCaption.innerText = `Loading from: ${path}`;

        VoxEditor.voices.loadClip(key)
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

        // Check if a track has actually been selected
        let currentTrack = VoxEditor.views.phrases.currentEntry;
        if (currentTrack)
        {
            let key = currentTrack.dataset['key']!;

            this.lblId.innerText      = key;
            this.lblCaption.innerText = VoxEditor.captioner.captionBank[key];

            this.btnPrev.disabled = false;
            this.btnNext.disabled = false;

            // Check if we can record
            if (VoxEditor.mics.micTrack)
                this.btnRec.disabled = false;

            if (VoxEditor.voices.currentClip)
            {
                this.btnPlay.disabled = false;
                this.btnStop.disabled = false;
                this.btnSave.disabled = false;
            }
        }
    }

    private onPrev() : void
    {
        VoxEditor.views.phrases.selectPrev();
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