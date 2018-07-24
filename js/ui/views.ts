/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Manages UI elements and their logic */
class Views
{
    // Main components
    public readonly editor   : Editor;
    public readonly marquee  : Marquee;
    public readonly settings : Settings;
    public readonly toolbar  : Toolbar;

    private readonly pickers : Dictionary<Picker>;

    constructor()
    {
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

        // Apply iOS-specific CSS fixes
        if (DOM.isiOS)
            document.body.classList.add('ios');
    }

    public getPicker(xmlTag: string) : Picker
    {
        return this.pickers[xmlTag];
    }
}