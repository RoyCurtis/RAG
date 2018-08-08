/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the settings screen */
class Settings
{
    /** Reference to the container for the settings screen */
    private dom              : HTMLElement;
    /** Reference to the "Reset settings" button */
    private btnReset         : HTMLButtonElement;
    /** Reference to the "Save and close" button */
    private btnSave          : HTMLButtonElement;
    /** Reference to the voice selection box */
    private selSpeechVoice   : HTMLSelectElement;
    /** Reference to the voice volume slider */
    private rangeSpeechVol   : HTMLInputElement;
    /** Reference to the voice pitch slider */
    private rangeSpeechPitch : HTMLInputElement;
    /** Reference to the voice rate slider */
    private rangeSpeechRate  : HTMLInputElement;
    /** Reference to the speech test button */
    private btnSpeechTest    : HTMLInputElement;
    /** Reference to the timer for the "Reset" button confirmation step */
    private resetTimeout?    : number;

    public constructor()
    {
        // General settings form

        this.dom      = DOM.require('#settingsScreen');
        this.btnReset = DOM.require('#btnResetSettings');
        this.btnSave  = DOM.require('#btnSaveSettings');

        this.btnReset.onclick = this.handleReset.bind(this);
        this.btnSave.onclick  = this.handleSave.bind(this);

        // Speech form

        this.selSpeechVoice   = DOM.require('#selSpeechChoice');
        this.rangeSpeechVol   = DOM.require('#rangeSpeechVol');
        this.rangeSpeechPitch = DOM.require('#rangeSpeechPitch');
        this.rangeSpeechRate  = DOM.require('#rangeSpeechRate');
        this.btnSpeechTest    = DOM.require('#btnSpeechTest');

        this.btnSpeechTest.onclick = this.handleVoiceTest.bind(this);

        // Legal and acknowledgements

        Linkdown.parse( DOM.require('#legalBlock') );
    }

    /** Opens the settings screen */
    public open() : void
    {
        this.dom.classList.remove('hidden');

        // The voice list has to be populated each open, in case it changes
        this.populateVoiceList();

        this.selSpeechVoice.selectedIndex   = RAG.config.speechVoice;
        this.rangeSpeechVol.valueAsNumber   = RAG.config.speechVol;
        this.rangeSpeechPitch.valueAsNumber = RAG.config.speechPitch;
        this.rangeSpeechRate.valueAsNumber  = RAG.config.speechRate;
        this.btnSave.focus();
    }

    /** Closes the settings screen */
    public close() : void
    {
        this.cancelReset();
        RAG.speech.cancel();
        this.dom.classList.add('hidden');
        DOM.blurActive(this.dom);
    }

    /** Clears and populates the voice list */
    private populateVoiceList() : void
    {
        this.selSpeechVoice.innerHTML = '';

        let voices = RAG.speech.getVoices();

        // Handle empty list
        if (voices.length <= 0)
        {
            let option      = DOM.addOption( this.selSpeechVoice, L.ST_SPEECH_EMPTY() );
            option.disabled = true;
        }
        // https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
        else for (let i = 0; i < voices.length ; i++)
            DOM.addOption(this.selSpeechVoice, `${voices[i].name} (${voices[i].lang})`);
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
        RAG.speech.cancel();
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
        RAG.config.speechVoice  = this.selSpeechVoice.selectedIndex;
        RAG.config.speechVol    = parseFloat(this.rangeSpeechVol.value);
        RAG.config.speechPitch  = parseFloat(this.rangeSpeechPitch.value);
        RAG.config.speechRate   = parseFloat(this.rangeSpeechRate.value);
        RAG.config.save();
        this.close();
    }

    /** Handles the speech test button, speaking a test phrase */
    private handleVoiceTest(ev: Event) : void
    {
        ev.preventDefault();
        RAG.speech.cancel();
        this.btnSpeechTest.disabled = true;

        // Has to execute on a delay, as speech cancel is unreliable without it
        window.setTimeout(() =>
        {
            this.btnSpeechTest.disabled = false;

            let time   = Strings.fromTime( new Date() );
            let phrase = document.createElement('span');

            phrase.innerHTML = '<span data-type="phrase" data-ref="sample">' +
                'This is a test of the Rail Announcement Generator at' +
                '<span data-type="time">' + time + '</span>' +
                '</span>';

            RAG.speech.speak(
                phrase.firstElementChild! as HTMLElement,
                {
                    voiceIdx : this.selSpeechVoice.selectedIndex,
                    volume   : this.rangeSpeechVol.valueAsNumber,
                    pitch    : this.rangeSpeechPitch.valueAsNumber,
                    rate     : this.rangeSpeechRate.valueAsNumber
                }
            );
        }, 200);
    }
}