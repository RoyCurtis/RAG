/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

///<reference path="viewBase.ts"/>

/** Controller for the settings screen */
class Settings extends ViewBase
{
    private readonly btnReset         =
        this.attach <HTMLButtonElement> ('#btnResetSettings');
    private readonly btnSave          =
        this.attach <HTMLButtonElement> ('#btnSaveSettings');
    private readonly chkUseVox        =
        this.attach <HTMLInputElement>  ('#chkUseVox');
    private readonly hintUseVox       =
        this.attach <HTMLElement>       ('#hintUseVox');
    private readonly selVoxVoice      =
        this.attach <HTMLSelectElement> ('#selVoxVoice');
    private readonly inputVoxPath     =
        this.attach <HTMLInputElement>  ('#inputVoxPath');
    private readonly selVoxReverb     =
        this.attach <HTMLSelectElement> ('#selVoxReverb');
    private readonly selVoxChime      =
        this.attach <HTMLSelectElement> ('#selVoxChime');
    private readonly selSpeechVoice   =
        this.attach <HTMLSelectElement> ('#selSpeechChoice');
    private readonly rangeSpeechVol   =
        this.attach <HTMLInputElement>  ('#rangeSpeechVol');
    private readonly rangeSpeechPitch =
        this.attach <HTMLInputElement>  ('#rangeSpeechPitch');
    private readonly rangeSpeechRate  =
        this.attach <HTMLInputElement>  ('#rangeSpeechRate');
    private readonly btnSpeechTest    =
        this.attach <HTMLButtonElement> ('#btnSpeechTest');

    /** Reference to the timer for the "Reset" button confirmation step */
    private resetTimeout? : number;

    public constructor()
    {
        super('#settingsScreen');
        // TODO: Check if VOX is available, disable if not

        this.btnReset.onclick      = this.handleReset.bind(this);
        this.btnSave.onclick       = this.handleSave.bind(this);
        this.chkUseVox.onchange    = this.layout.bind(this);
        this.selVoxVoice.onchange  = this.layout.bind(this);
        this.btnSpeechTest.onclick = this.handleVoiceTest.bind(this);

        // Populate list of impulse response files
        DOM.populate(this.selVoxReverb, VoxEngine.REVERBS, RAG.config.voxReverb);

        // Populate the legal & acknowledgements block
        Linkdown.loadInto('ABOUT.md', '#aboutBlock');
    }

    /** Opens the settings screen */
    public open() : void
    {
        // The voice list has to be populated each open, in case it changes
        this.populateVoiceList();

        if (!RAG.speech.voxAvailable)
        {
            // TODO : Localize
            this.chkUseVox.checked    = false;
            this.chkUseVox.disabled   = true;
            this.hintUseVox.innerHTML = '<strong>VOX engine</strong> is unavailable.' +
                ' Your browser or device may not be supported; please check the console' +
                ' for more information.';
        }
        else
            this.chkUseVox.checked = RAG.config.voxEnabled;

        this.selVoxVoice.value              = RAG.config.voxPath;
        this.inputVoxPath.value             = RAG.config.voxCustomPath;
        this.selVoxReverb.value             = RAG.config.voxReverb;
        this.selVoxChime.value              = RAG.config.voxChime;
        this.selSpeechVoice.value           = RAG.config.speechVoice;
        this.rangeSpeechVol.valueAsNumber   = RAG.config.speechVol;
        this.rangeSpeechPitch.valueAsNumber = RAG.config.speechPitch;
        this.rangeSpeechRate.valueAsNumber  = RAG.config.speechRate;

        this.layout();
        this.dom.hidden       = false;
        RAG.views.main.hidden = true;
        this.btnSave.focus();
    }

    /** Closes the settings screen */
    public close() : void
    {
        this.cancelReset();
        RAG.speech.stop();
        RAG.views.main.hidden = false;
        this.dom.hidden       = true;
        RAG.views.toolbar.btnOption.focus();
    }

    /** Calculates form layout and control visibility based on state */
    private layout() : void
    {
        let voxEnabled = this.chkUseVox.checked;
        let voxCustom  = (this.selVoxVoice.value === '');

        DOM.toggleHiddenAll(
            [this.selSpeechVoice,   !voxEnabled],
            [this.rangeSpeechPitch, !voxEnabled],
            [this.selVoxVoice,       voxEnabled],
            [this.inputVoxPath,      voxEnabled && voxCustom],
            [this.selVoxReverb,      voxEnabled],
            [this.selVoxChime,       voxEnabled]
        );
    }

    /** Clears and populates the voice list */
    private populateVoiceList() : void
    {
        this.selSpeechVoice.innerHTML = '';

        let voices = RAG.speech.browserVoices;

        // Handle empty list
        if (voices === {})
        {
            let option      = DOM.addOption( this.selSpeechVoice, L.ST_SPEECH_EMPTY() );
            option.disabled = true;
        }
        // https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
        else for (let name in voices)
            DOM.addOption(this.selSpeechVoice, `${name} (${voices[name].lang})`, name);
    }

    /** Handles the reset button, with a confirm step that cancels after 15 seconds */
    private handleReset() : void
    {
        if (!this.resetTimeout)
        {
            this.resetTimeout       = setTimeout(this.cancelReset.bind(this), 15000);
            this.btnReset.innerText = L.ST_RESET_CONFIRM();
            this.btnReset.title     = L.ST_RESET_CONFIRM_T();
            return;
        }

        RAG.config.reset();
        RAG.speech.stop();
        this.cancelReset();
        this.open();
        alert( L.ST_RESET_DONE() );
    }

    /** Cancel the reset timeout and restore the reset button to normal */
    private cancelReset() : void
    {
        window.clearTimeout(this.resetTimeout);
        this.btnReset.innerText = L.ST_RESET();
        this.btnReset.title     = L.ST_RESET_T();
        this.resetTimeout       = undefined;
    }

    /** Handles the save button, saving config to storage */
    private handleSave() : void
    {
        RAG.config.voxEnabled    = this.chkUseVox.checked;
        RAG.config.voxPath       = this.selVoxVoice.value;
        RAG.config.voxCustomPath = this.inputVoxPath.value;
        RAG.config.voxReverb     = this.selVoxReverb.value;
        RAG.config.voxChime      = this.selVoxChime.value;
        RAG.config.speechVoice   = this.selSpeechVoice.value;
        // parseFloat instead of valueAsNumber; see Architecture.md
        RAG.config.speechVol     = parseFloat(this.rangeSpeechVol.value);
        RAG.config.speechPitch   = parseFloat(this.rangeSpeechPitch.value);
        RAG.config.speechRate    = parseFloat(this.rangeSpeechRate.value);
        RAG.config.save();
        this.close();
    }

    /** Handles the speech test button, speaking a test phrase */
    private handleVoiceTest(ev: Event) : void
    {
        ev.preventDefault();
        RAG.speech.stop();
        this.btnSpeechTest.disabled = true;

        // Has to execute on a delay, as speech cancel is unreliable without it
        window.setTimeout(() =>
        {
            this.btnSpeechTest.disabled = false;

            let phrase       = document.createElement('div');
            phrase.innerHTML = '<phrase ref="sample"/>';

            RAG.phraser.process(phrase);

            RAG.speech.speak(
                phrase.firstElementChild! as HTMLElement,
                {
                    useVox    : this.chkUseVox.checked,
                    voxPath   : this.selVoxVoice.value || this.inputVoxPath.value,
                    voxReverb : this.selVoxReverb.value,
                    voxChime  : this.selVoxChime.value,
                    voiceName : this.selSpeechVoice.value,
                    volume    : this.rangeSpeechVol.valueAsNumber,
                    pitch     : this.rangeSpeechPitch.valueAsNumber,
                    rate      : this.rangeSpeechRate.valueAsNumber
                }
            );
        }, 200);
    }
}