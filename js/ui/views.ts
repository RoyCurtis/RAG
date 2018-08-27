/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Manages UI elements and their logic */
class Views
{
    /** Reference to the main screen */
    public  readonly main     : HTMLElement;
    /** Reference to the main editor component */
    public  readonly editor   : Editor;
    /** Reference to the main marquee component */
    public  readonly marquee  : Marquee;
    /** Reference to the main settings screen */
    public  readonly settings : Settings;
    /** Reference to the main toolbar component */
    public  readonly toolbar  : Toolbar;
    /** References to all the pickers, one for each type of XML element */
    private readonly pickers  : Dictionary<Picker>;

    public constructor()
    {
        this.main     = DOM.require('#mainScreen');
        this.editor   = new Editor();
        this.marquee  = new Marquee();
        this.settings = new Settings();
        this.toolbar  = new Toolbar();
        this.pickers  = {};

        [
            new CoachPicker(),
            new ExcusePicker(),
            new IntegerPicker(),
            new NamedPicker(),
            new PhrasesetPicker(),
            new PlatformPicker(),
            new ServicePicker(),
            new StationPicker(),
            new StationListPicker(),
            new TimePicker()
        ].forEach(picker => this.pickers[picker.xmlTag] = picker);

        // Global hotkeys
        document.body.onkeydown = this.onInput.bind(this);

        // Apply iOS-specific CSS fixes
        if (DOM.isiOS)
            document.body.classList.add('ios');
    }

    /** Gets the picker that handles a given tag, if any */
    public getPicker(xmlTag: string) : Picker
    {
        return this.pickers[xmlTag];
    }

    /** Handle ESC to close pickers or settigns */
    private onInput(ev: KeyboardEvent) : void
    {
        if (ev.key !== 'Escape')
            return;

        this.editor.closeDialog();
        this.settings.close();
    }
}