/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="../../js/rag.d.ts"/>

import {app, BrowserWindow} from 'electron';
import {Captioner} from "./captioner";
import * as path   from "path";

/** Main class of the entire vox editor application */
export class VoxEditor
{
    /** Gets the Electron renderer window instance */
    public static electronWindow? : BrowserWindow;

    /** Entry point for VoxEditor when starting Electron */
    public static electronMain() : void
    {
        console.log('VOX Editor', process.version);

        // For IntelliJ debugging of the render process
        app.commandLine.appendSwitch('remote-debugging-port', '9222');

        app.on('ready', () =>
        {
            let window = VoxEditor.electronWindow = new BrowserWindow(
            {
                width:  1280,
                height: 800
            });

            window.loadFile( path.join(__dirname, "../views/index.html") );

            window.webContents.openDevTools();

            window.on('closed', () => VoxEditor.electronWindow = undefined);
        });

        app.on( 'window-all-closed', () => app.quit() )
    }

    /** Gets the voice bank generator, which turns phrase data into a set of IDs */
    public static banker   : Captioner;
    /** Gets the database manager, which holds phrase, station and train data */
    public static database : Database;

    /** */
    public static electronRenderer(dataRefs: DataRefs) : void
    {
        console.log('VOX Editor renderer', process.version);

        I18n.init();

        VoxEditor.database = new Database(dataRefs);
        VoxEditor.banker   = new Captioner();

        let phrasesList = DOM.require <HTMLUListElement> ('#partSelector ul');

        for (let key in VoxEditor.banker.captionBank)
        {
            let element = document.createElement('li');
            let value   = VoxEditor.banker.captionBank[key];

            element.dataset['key'] = key;
            element.innerHTML      = `<code>${key}</code> "${value}"`;

            phrasesList.appendChild(element);
        }

        phrasesList.classList.remove('hidden');
    }
}

// Boot self, if running as the Electron main thread
if (process.type === 'browser')
    VoxEditor.electronMain();