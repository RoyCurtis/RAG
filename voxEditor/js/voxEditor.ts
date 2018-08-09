/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {Captioner} from "./voices/captioner";
import {EditorConfig} from "./editorConfig";
import {EditorViews} from "./ui/editorViews";
import {VoiceManager} from "./voices/voiceManager";
import {MicManager} from "./voices/micManager";

/** Main class of vox editor application in the renderer process */
export class VoxEditor
{
    /** Gets the voice bank generator, which turns phrase data into a set of IDs */
    public static captioner : Captioner;
    /** Gets the configuration holder */
    public static config    : EditorConfig;
    /** Gets the database manager, which holds phrase, station and train data */
    public static database  : Database;
    /** Gets the microphone manager */
    public static mics      : MicManager;
    /** Gets the view controller, which manages UI interaction */
    public static views     : EditorViews;
    /** Gets the voice manager */
    public static voices    : VoiceManager;

    /** Entry point for VoxEditor when loading as the HTML view */
    public static main(dataRefs: DataRefs) : void
    {
        console.log('VOX Editor renderer', process.version);

        I18n.init();

        VoxEditor.config    = new EditorConfig(true);
        VoxEditor.database  = new Database(dataRefs);
        VoxEditor.captioner = new Captioner();
        VoxEditor.mics      = new MicManager();
        VoxEditor.voices    = new VoiceManager();
        VoxEditor.views     = new EditorViews();
    }
}