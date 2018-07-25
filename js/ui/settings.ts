/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the settings dialog */
class Settings
{
    private dom           : HTMLElement;
    private btnReset      : HTMLButtonElement;
    private btnSave       : HTMLButtonElement;
    private selVoxChoice  : HTMLSelectElement;
    private rangeVoxVol   : HTMLInputElement;
    private rangeVoxPitch : HTMLInputElement;
    private rangeVoxRate  : HTMLInputElement;
    private btnVoxTest    : HTMLInputElement;

    private resetTimeout? : number;

    private ready : boolean = false;

    constructor()
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

    public close() : void
    {
        this.cancelReset();
        RAG.speechSynth.cancel();
        document.body.classList.remove('settingsVisible');
        DOM.blurActive(this.dom);
    }

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
        for (let i = 0; i < voices.length ; i++)
        {
            let option = document.createElement('option');

            option.textContent = `${voices[i].name} (${voices[i].lang})`;

            this.selVoxChoice.appendChild(option);
        }

        this.ready = true;
    }

    private handleReset() : void
    {
        if (!this.resetTimeout)
        {
            this.resetTimeout       = setTimeout(this.cancelReset.bind(this), 15000);
            this.btnReset.innerText = 'Are you sure?';
            this.btnReset.title     = 'Confirm reset to defaults';
            return;
        }

        RAG.config.reset();
        RAG.speechSynth.cancel();
        this.cancelReset();
        this.open();
        alert('Settings have been reset to their defaults, and deleted from storage.');
    }

    private cancelReset() : void
    {
        window.clearTimeout(this.resetTimeout);
        this.btnReset.innerText = 'Reset to defaults';
        this.btnReset.title     = 'Reset settings to defaults';
        this.resetTimeout       = undefined;
    }

    private handleSave() : void
    {
        RAG.config.voxChoice = this.selVoxChoice.selectedIndex;
        RAG.config.voxVolume = parseInt(this.rangeVoxVol.value);
        RAG.config.voxPitch  = parseInt(this.rangeVoxPitch.value);
        RAG.config.voxRate   = parseInt(this.rangeVoxRate.value);
        RAG.config.save();
        this.close();
    }

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