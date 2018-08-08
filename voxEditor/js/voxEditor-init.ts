/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {app, BrowserWindow} from 'electron';
import * as path from "path";

let window : BrowserWindow | null;

/** Entry point for VoxEditor when starting Electron */
console.log('VOX Editor', process.version);

// For IntelliJ debugging of the render process
app.commandLine.appendSwitch('remote-debugging-port', '9222');

app.on('ready', () =>
{
    window = new BrowserWindow(
    {
        width:  1280,
        height: 800
    });

    window.loadFile( path.join(__dirname, "../index.html") );

    window.webContents.openDevTools();

    window.on('closed', () => window = null);
});

app.on( 'window-all-closed', () => app.quit() );