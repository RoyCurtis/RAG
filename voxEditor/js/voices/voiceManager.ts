/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import * as fs from "fs";
import {Files} from "../util/files";
import * as path from "path";
import {VoxEditor} from "../voxEditor";

/** Manages available voices */
export class VoiceManager
{
    private static readonly VOX_DIR   : string = '../data/vox';

    private static readonly VOX_REGEX : RegExp = /(.+)_([a-z]{2}-[A-Z]{2})/;

    public readonly list : CustomVoice[] = [];

    public constructor()
    {
        CustomVoice.BASE_PATH = VoiceManager.VOX_DIR;

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

    public hasClip(id: string) : boolean
    {
        // If no voice path available, skip
        if (VoxEditor.config.voicePath === '')
            return false;

        let clipPath = path.join(VoxEditor.config.voicePath, `${id}.mp3`);

        return fs.existsSync(clipPath);
    }
}