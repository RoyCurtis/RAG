/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {EditorPhrases} from "./editorPhrases";
import {EditorSetup} from "./editorSetup";
import {EditorTapedeck} from "./editorTapedeck";
import {Gamepads} from "../util/gamepads";

/** Manages vox editor UI elements, their logic, and input */
export class EditorViews
{
    /** Reference to the phrase list component */
    public readonly phrases  : EditorPhrases;
    /** Reference to the setup component*/
    public readonly setup    : EditorSetup;
    /** Reference to the tapedeck component */
    public readonly tapedeck : EditorTapedeck;

    public constructor()
    {
        this.phrases  = new EditorPhrases();
        this.setup    = new EditorSetup();
        this.tapedeck = new EditorTapedeck();

        Gamepads.init();
    }
}