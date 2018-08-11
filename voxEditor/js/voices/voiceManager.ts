/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import * as fs from "fs";
import {Files} from "../util/files";
import * as path from "path";
import {VoxEditor} from "../voxEditor";
import Mp3Encoder = lamejs.Mp3Encoder;

/** Manages available voices and clips */
// TODO: Rename clip manager?
export class VoiceManager
{
    private static readonly VOX_DIR   : string = '../data/vox';

    private static readonly VOX_REGEX : RegExp = /(.+)_([a-z]{2}-[A-Z]{2})/;

    public readonly list         : CustomVoice[];

    public readonly audioContext : AudioContext;

    public  currentClip?    : AudioBuffer;

    public  currentPath?    : string;
    /** Audio buffer node holding and playing the current voice clip */
    private currentBufNode? : AudioBufferSourceNode;

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

    public keyToPath(key: string) : string
    {
        return path.join(VoxEditor.config.voicePath, `${key}.mp3`);
    }

    public hasClip(key: string) : boolean
    {
        // If no voice path available, skip
        if (VoxEditor.config.voicePath === '')
            return false;

        let clipPath = this.keyToPath(key);

        return fs.existsSync(clipPath) && fs.lstatSync(clipPath).isFile();
    }

    public loadFromBuffer(key: string, buffer: AudioBuffer) : void
    {
        this.currentClip = buffer;
        this.currentPath = this.keyToPath(key);
    }

    public async loadFromDisk(key: string) : Promise<void>
    {
        if ( !this.hasClip(key) )
        {
            this.currentClip = undefined;
            this.currentPath = undefined;
        }
        else
        {
            // For some reason, we have to copy the given buffer using slice. Else, repeat
            // calls to this method for the same clip will silently fail, or hang. It's
            // possible because decodeAudioData holds a copy of the given buffer,
            // preventing the release of resources held by readFileSync.

            // TODO: BUG: There appears to be a Chromium bug, where some clips repeat
            // themselves after being loaded multiple times. It may just be an issue with
            // the mp3 files exported from Audacity.

            let path         = this.keyToPath(key);
            let buffer       = fs.readFileSync(path);
            let arrayBuffer  = buffer.buffer.slice(0);
            this.currentClip = await this.audioContext.decodeAudioData(arrayBuffer);
            this.currentPath = path;
        }

        return;
    }

    public playClip(bounds?: [number, number]) : void
    {
        if (!this.currentClip)
            return;

        this.stopClip();
        this.currentBufNode         = this.audioContext.createBufferSource();
        this.currentBufNode.buffer  = this.currentClip;
        this.currentBufNode.onended = _ => { this.stopClip(); };

        this.currentBufNode.connect(this.audioContext.destination);
        VoxEditor.views.tapedeck.handleBeginPlay();

        // If given bounds, only play within those bounds
        if ( bounds && (bounds[0] > 0 || bounds[1] < 1) )
        {
            let duration = this.currentClip.duration;
            let begin    = duration * bounds[0];
            let end      = (duration * bounds[1]) - begin;

            this.currentBufNode.start(0, begin, end);
        }
        else
            this.currentBufNode.start();
    }

    public stopClip() : void
    {
        if (!this.currentBufNode)
            return;

        this.currentBufNode.onended = null;
        this.currentBufNode.stop();
        this.currentBufNode.disconnect();
        this.currentBufNode = undefined;

        VoxEditor.views.tapedeck.handleEndPlay();
    }

    public saveClip(key: string, bounds?: [number, number]) : void
    {
        if ( !this.currentClip || Strings.isNullOrEmpty(key) )
            return;

        // https://github.com/zhuker/lamejs/issues/10#issuecomment-141720630
        let blocks : Int8Array[] = [];

        let intChannel : Int16Array;
        let encoder    = new Mp3Encoder(1, this.currentClip.sampleRate, 128);
        let channel    = this.currentClip.getChannelData(0);
        let blockSize  = 1152;
        let length     = channel.length;
        let totalSize  = 0;

        // First, get a clipped copy of the data if given bounds
        // TODO: Soften like on mic recordings

        if ( bounds && (bounds[0] > 0 || bounds[1] < 1) )
        {
            let left  = length * bounds[0];
            let right = length * bounds[1];

            channel = channel.slice(left, right);
            length  = channel.length;
        }

        intChannel = new Int16Array(length);

        // Then, convert the clip data from -1..1 floats to -32768..32767 integers

        for (let i = 0; i < length; i++)
        {
            let n = channel[i];
            let v = n < 0
                ? n * 32768
                : n * 32767;

            intChannel[i] = Math.max( -32768, Math.min(32768, v) );
        }

        // Then, encode the clip's data into mp3 chunks

        for (let i = 0; i < length; i += blockSize)
        {
            let bufBlock = intChannel.subarray(i, i + blockSize);
            let mp3Block = encoder.encodeBuffer(bufBlock);

            if (mp3Block.length > 0)
            {
                blocks.push(mp3Block);
                totalSize += mp3Block.length;
            }
        }

        // Then, finalize the MP3

        let finalBlock = encoder.flush();

        if (finalBlock.length > 0)
        {
            blocks.push(finalBlock);
            totalSize += finalBlock.length;
        }

        // Finally, write it to disk

        let bytes  = Buffer.alloc(totalSize);
        let offset = 0;

        blocks.forEach(block =>
        {
            bytes.set(block, offset);
            offset += block.length;
        });

        fs.writeFileSync(this.keyToPath(key), bytes, { encoding : null });
    }
}