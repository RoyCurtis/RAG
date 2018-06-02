/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Manages UI elements and their logic */
class ViewController
{
    // Main components
    public readonly editor  : Editor;
    public readonly marquee : Marquee;
    public readonly toolbar : Toolbar;

    private pickers : PickerDictionary;

    constructor()
    {
        this.editor  = new Editor();
        this.marquee = new Marquee();
        this.toolbar = new Toolbar();
        this.pickers = {};

        [
            new PlatformPicker(),
            new ServicePicker(),
            new TimePicker()
        ].forEach(picker => this.pickers[picker.xmlTag] = picker);
    }

    public getPicker(xmlTag: string) : Picker
    {
        return this.pickers[xmlTag];
    }
}