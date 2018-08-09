/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import * as fs from "fs";
import {Files} from "../util/files";
import * as path from "path";
import {VoxEditor} from "../voxEditor";

/** Manages available voices and clips */
export class VoiceManager
{
    private static readonly VOX_DIR   : string = '../data/vox';

    private static readonly VOX_REGEX : RegExp = /(.+)_([a-z]{2}-[A-Z]{2})/;

    public readonly list         : CustomVoice[];

    public readonly audioContext : AudioContext;

    public currentClip? : AudioBuffer;

    public constructor()
    {
        this.list         = [];
        this.audioContext = new AudioContext();

        CustomVoice.basePath = VoiceManager.VOX_DIR;

        fs.readdirSync(VoiceManager.VOX_DIR)
            .map( name => path.join(VoiceManager.VOX_DIR, name) )
            .filter(Files.isDir)
            .forEach(dir =>
            {
                let name  = path.basename(dir);
                let parts = name.match(VoiceManager.VOX_REGEX);

                // Skip voices that do not match the format
                if (!parts)
                    return;

                this.list.push( new CustomVoice(parts[1], parts[2]) );

                if (VoxEditor.config.voicePath === '')
                    VoxEditor.config.voicePath = dir;
            });
    }

    public hasClip(key: string) : boolean
    {
        // If no voice path available, skip
        if (VoxEditor.config.voicePath === '')
            return false;

        let clipPath = this.keyToPath(key);

        return fs.existsSync(clipPath) && fs.lstatSync(clipPath).isFile();
    }

    public async loadClip(key: string) : Promise<undefined>
    {
        if ( !this.hasClip(key) )
            this.currentClip = undefined;
        else
        {
            // For some reason, we have to copy the given buffer using slice. Else, repeat
            // calls to this method for the same clip will silently fail, or hang. It's
            // possible because decodeAudioData holds a copy of the given buffer,
            // preventing the release of resources held by readFileSync.

            let buffer       = fs.readFileSync( this.keyToPath(key) );
            let arrayBuffer  = buffer.buffer.slice(0);
            this.currentClip = await this.audioContext.decodeAudioData(arrayBuffer);
        }

        return;
    }

    public keyToPath(key: string) : string
    {
        return path.join(VoxEditor.config.voicePath, `${key}.mp3`);
    }
}