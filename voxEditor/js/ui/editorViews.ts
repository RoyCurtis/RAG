/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {EditorPhrases} from "./editorPhrases";
import {EditorSetup} from "./editorSetup";

/** Manages vox editor UI elements and their logic */
export class EditorViews
{
    /** Reference to the main marquee component */
    public readonly phrases : EditorPhrases;
    /** Reference to the main editor component */
    public readonly setup   : EditorSetup;

    public constructor()
    {
        this.setup   = new EditorSetup();
        this.phrases = new EditorPhrases();
    }
}