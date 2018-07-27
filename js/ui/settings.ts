/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the settings dialog */
class Settings
{
    /** Reference to the container for the settings dialog */
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
    /** Whether this dialog has been initialized yet */
    private ready         : boolean = false;

    public constructor()
    {
        // General settings form

        this.dom      = DOM.require('#settings');
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

        this.btnVoxTest.onclick = ev =>
        {
            // Has to execute on a delay, as speech cancel is unreliable without it
            ev.preventDefault();
            RAG.speechSynth.cancel();
            this.btnVoxTest.disabled = true;
            window.setTimeout(this.handleVoxTest.bind(this), 200);
        };
    }

    /** Opens the settings dialog */
    public open() : void
    {
        document.body.classList.add('settingsVisible');

        if (!this.ready)
            this.init();

        this.selVoxChoice.selectedIndex  = RAG.config.voxChoice;
        this.rangeVoxVol.valueAsNumber   = RAG.config.voxVolume;
        this.rangeVoxPitch.valueAsNumber = RAG.config.voxPitch;
        this.rangeVoxRate.valueAsNumber  = RAG.config.voxRate;
        this.btnSave.focus();
    }

    /** Closes the settings dialog */
    public close() : void
    {
        this.cancelReset();
        RAG.speechSynth.cancel();
        document.body.classList.remove('settingsVisible');
        DOM.blurActive(this.dom);
    }

    /** Prepares the settings dialog by populating the voice list */
    private init() : void
    {
        let voices = RAG.speechSynth.getVoices();

        if (voices.length <= 0)
        {
            this.ready = true;
            return;
        }

        this.selVoxChoice.innerHTML = '';

        // https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
        // TODO: Pick english voice by default
        for (let i = 0; i < voices.length ; i++)
        {
            let option = document.createElement('option');

            option.textContent = `${voices[i].name} (${voices[i].lang})`;

            this.selVoxChoice.appendChild(option);
        }

        this.ready = true;
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
        RAG.speechSynth.cancel();
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
        RAG.config.voxVolume = parseInt(this.rangeVoxVol.value);
        RAG.config.voxPitch  = parseInt(this.rangeVoxPitch.value);
        RAG.config.voxRate   = parseInt(this.rangeVoxRate.value);
        RAG.config.save();
        this.close();
    }

    /** Handles the speech test button, speaking a test phrase */
    private handleVoxTest() : void
    {
        this.btnVoxTest.disabled = false;

        let time      = new Date();
        let hour      = time.getHours().toString().padStart(2, '0');
        let minute    = time.getMinutes().toString().padStart(2, '0');
        let utterance = new SpeechSynthesisUtterance(
            `This is a test of the Rail Announcement Generator at ${hour}:${minute}.`
        );

        utterance.volume = this.rangeVoxVol.valueAsNumber;
        utterance.pitch  = this.rangeVoxPitch.valueAsNumber;
        utterance.rate   = this.rangeVoxRate.valueAsNumber;
        utterance.voice  = RAG.speechSynth.getVoices()[this.selVoxChoice.selectedIndex];

        RAG.speechSynth.speak(utterance);
    }
}