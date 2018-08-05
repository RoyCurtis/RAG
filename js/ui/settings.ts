/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the settings screen */
class Settings
{
    /** Reference to the container for the settings screen */
    private dom           : HTMLElement;
    /** Reference to the "Reset settings" button */
    private btnReset      : HTMLButtonElement;
    /** Reference to the "Save and close" button */
    private btnSave       : HTMLButtonElement;
    /** Reference to the voice selection box */
    private selVoxChoice  : HTMLSelectElement;
    /** Reference to the voice volume slider */
    private rangeVoxVol   : HTMLInputElement;
    /** Reference to the voice pitch slider */
    private rangeVoxPitch : HTMLInputElement;
    /** Reference to the voice rate slider */
    private rangeVoxRate  : HTMLInputElement;
    /** Reference to the speech test button */
    private btnVoxTest    : HTMLInputElement;
    /** Reference to the timer for the "Reset" button confirmation step */
    private resetTimeout? : number;

    public constructor()
    {
        // General settings form

        this.dom      = DOM.require('#settingsScreen');
        this.btnReset = DOM.require('#btnResetSettings');
        this.btnSave  = DOM.require('#btnSaveSettings');

        this.btnReset.onclick = this.handleReset.bind(this);
        this.btnSave.onclick  = this.handleSave.bind(this);

        // Vox form

        this.selVoxChoice  = DOM.require('#selVoxChoice');
        this.rangeVoxVol   = DOM.require('#rangeVoxVol');
        this.rangeVoxPitch = DOM.require('#rangeVoxPitch');
        this.rangeVoxRate  = DOM.require('#rangeVoxRate');
        this.btnVoxTest    = DOM.require('#btnVoxTest');

        this.btnVoxTest.onclick = this.handleVoxTest.bind(this);

        // Legal and acknowledgements

        Linkdown.parse( DOM.require('#legalBlock') );
    }

    /** Opens the settings screen */
    public open() : void
    {
        this.dom.classList.remove('hidden');

        // The vox list has to be populated each open, in case it changes
        this.populateVoxList();

        this.selVoxChoice.selectedIndex  = RAG.config.voxChoice;
        this.rangeVoxVol.valueAsNumber   = RAG.config.voxVolume;
        this.rangeVoxPitch.valueAsNumber = RAG.config.voxPitch;
        this.rangeVoxRate.valueAsNumber  = RAG.config.voxRate;
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
    private populateVoxList() : void
    {
        this.selVoxChoice.innerHTML = '';

        let voices = RAG.speech.getVoices();

        // Handle empty list
        if (voices.length <= 0)
        {
            let option = document.createElement('option');

            option.textContent = L.ST_VOX_EMPTY();
            option.disabled    = true;

            this.selVoxChoice.appendChild(option);
            return;
        }

        // https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
        for (let i = 0; i < voices.length ; i++)
        {
            let option = document.createElement('option');

            option.textContent = `${voices[i].name} (${voices[i].lang})`;

            this.selVoxChoice.appendChild(option);
        }
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
        RAG.config.voxChoice = this.selVoxChoice.selectedIndex;
        RAG.config.voxVolume = parseFloat(this.rangeVoxVol.value);
        RAG.config.voxPitch  = parseFloat(this.rangeVoxPitch.value);
        RAG.config.voxRate   = parseFloat(this.rangeVoxRate.value);
        RAG.config.save();
        this.close();
    }

    /** Handles the speech test button, speaking a test phrase */
    private handleVoxTest(ev: Event) : void
    {
        ev.preventDefault();
        RAG.speech.cancel();
        this.btnVoxTest.disabled = true;

        // Has to execute on a delay, as speech cancel is unreliable without it
        window.setTimeout(() =>
        {
            this.btnVoxTest.disabled = false;

            let time      = Strings.fromTime( new Date() );
            let utterance = new SpeechSynthesisUtterance(
                `This is a test of the Rail Announcement Generator at ${time}.`
            );

            utterance.volume = this.rangeVoxVol.valueAsNumber;
            utterance.pitch  = this.rangeVoxPitch.valueAsNumber;
            utterance.rate   = this.rangeVoxRate.valueAsNumber;
            utterance.voice  = RAG.speech.getVoices()[this.selVoxChoice.selectedIndex];

            RAG.speech.speak(utterance);
        }, 200);
    }
}