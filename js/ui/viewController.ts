/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Manages UI elements and their logic */
class ViewController
{
    public readonly platformPicker : PlatformPicker;
    public readonly timePicker     : TimePicker;
    public readonly toolbar        : Toolbar;
    public readonly marquee        : Marquee;

    private domEditor      : HTMLElement;

    constructor()
    {
        this.platformPicker = new PlatformPicker();
        this.timePicker     = new TimePicker();
        this.toolbar        = new Toolbar();
        this.marquee        = new Marquee();
        this.domEditor      = DOM.require('#editor');

        this.domEditor.textContent = "Please wait...";
        this.marquee.set('Please wait...');
    }

    public getEditor() : HTMLElement
    {
        return this.domEditor;
    }
}