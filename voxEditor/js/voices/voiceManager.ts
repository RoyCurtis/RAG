/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import * as fs from "fs";
import {Files} from "../util/files";
import * as path from "path";
import {VoxEditor} from "../voxEditor";
import * as child_process from "child_process";
import {VoiceExporter} from "./voiceExporter";

/** Manages available voices and clips */
export class VoiceManager
{
    /** Relative path to find voices in */
    private static readonly VOX_DIR : string = '../data/vox';

    /** List of discovered and available voices */
    public  readonly voxList      : string[];
    /** Audio output through which clips are played */
    private readonly audioContext : AudioContext;
    /** Vox engine instance for preview phrases */
    private readonly voxEngine    : VoxEngine;

    /** Current clip's audio buffer */
    public  currentClip?    : AudioBuffer;
    /** Current clip's file path */
    public  currentPath?    : string;
    /** Audio buffer node holding and playing the current voice clip */
    private currentBufNode? : AudioBufferSourceNode;

    public get currentVoice() : string | undefined
    {
        return this.voxList.find(v => v === VoxEditor.config.voicePath);
    }

    public get currentPlayVoice() : string | undefined
    {
        return this.voxList.find(v => v === VoxEditor.config.voicePlayPath);
    }

    public constructor()
    {
        this.voxList      = [];
        this.audioContext = new AudioContext();
        this.voxEngine    = new VoxEngine('../data/vox');

        // Discover valid voice folders
        this.discoverVoices();

        // Create new voice if none found
        if (VoxEditor.config.voicePath === '')
            this.createNewVoice();
    }

    /** Makes a relative path out of the given key */
    public keyToPath(key: string) : string
    {
        if (!this.currentVoice)
            throw Error('Attempted to get path of key with no voice set');

        let format = VoxEditor.config.format;

        return path.join(this.currentVoice, `${key}.${format}`);
    }

    /** Checks whether a clip for the given key exists on disk */
    public hasClip(key: string) : boolean
    {
        let clipPath = this.keyToPath(key);

        // If no voice path is set, skip
        if (!clipPath)
            return false;

        return fs.existsSync(clipPath) && fs.lstatSync(clipPath).isFile();
    }

    /** Loads the given audio buffer as a clip for the current key */
    public loadFromBuffer(buffer: AudioBuffer) : void
    {
        let key = VoxEditor.views.phrases.currentKey;

        if ( Strings.isNullOrEmpty(key) )
            throw Error('Attempted to load with no key selected');

        this.currentClip = buffer;
        this.currentPath = this.keyToPath(key!);
    }

    /** Attempts to load the current key's voice clip from disk, if it exists */
    public loadFromDisk() : void
    {
        this.unload();

        let key = VoxEditor.views.phrases.currentKey;

        if ( Strings.isNullOrEmpty(key) )
            throw Error('Attempted to load with no key selected');

        this.currentPath = this.keyToPath(key!);

        if ( !this.currentPath || !this.hasClip(key!) )
            return VoxEditor.views.tapedeck.handleClipLoad(key!);
        else
            VoxEditor.views.tapedeck.handleClipLoading(key!);

        // For some reason, we have to copy the given buffer using slice. Else, repeat
        // calls to this method for the same clip will silently fail, or hang. It's
        // possible because decodeAudioData holds a copy of the given buffer, preventing
        // the release of resources held by readFileSync.

        let buffer      = fs.readFileSync(this.currentPath);
        let arrayBuffer = buffer.buffer.slice(0);
        this.audioContext.decodeAudioData(arrayBuffer)
            .then(audio =>
            {
                this.currentClip = audio;
                VoxEditor.views.tapedeck.handleClipLoad(key!);
            })
            .catch( _ => VoxEditor.views.tapedeck.handleClipFail(key!) );
    }

    /** Unloads the current clip from memory */
    public unload() : void
    {
        if (!this.currentClip)
            return;

        this.stopClip();
        this.stopPreview();

        this.currentClip = undefined;
        this.currentPath = undefined;

        VoxEditor.views.tapedeck.handleClipUnload();
    }

    public playPreview(phrase: HTMLElement) : void
    {
        this.stopPreview();

        if (!this.currentPlayVoice)
            return;

        let resolver = new Resolver(phrase);
        let settings = {
            voxPath   : this.currentPlayVoice,
            voxReverb : VoxEditor.config.voiceReverb
        };

        this.voxEngine.speak(resolver.toVox(), settings);
        VoxEditor.views.tapedeck.handleBeginPlay(false);
    }

    /** Plays the currently loaded clip, if any */
    public playClip(bounds?: [number, number]) : void
    {
        if (!this.currentClip)
            return;

        this.stopClip();
        this.currentBufNode         = this.audioContext.createBufferSource();
        this.currentBufNode.buffer  = this.currentClip;
        this.currentBufNode.onended = _ => { this.stopClip(); };

        this.currentBufNode.connect(this.audioContext.destination);
        VoxEditor.views.tapedeck.handleBeginPlay(true);

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

    public stopPreview() : void
    {
        this.voxEngine.stop();
        VoxEditor.views.tapedeck.handleEndPlay();
    }

    /** Stops playing the current clip, if any */
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

    /** Scales part or all of the current clip's volume (gain) by given amount */
    public scaleClip(factor: number, bounds?: [number, number]) : void
    {
        if (!this.currentClip)
            return;

        let data   = this.currentClip.getChannelData(0);
        let length = data.length;
        let lower  = 0;
        let upper  = length;

        if ( bounds && (bounds[0] > 0 || bounds[1] < 1) )
        {
            lower = (length * bounds[0]) | 0;
            upper = (length * bounds[1]) | 0;
        }

        for (let i = lower; i < upper; i++)
            data[i] *= factor;
    }

    /** Saves the current clip to disk as an MP3 */
    public saveClip(bounds?: [number, number]) : void
    {
        if (!this.currentClip || !this.currentPath)
            throw Error('Attempted to save without state nor path');
        else
            this.stopClip();

        let channel = this.currentClip.getChannelData(0);
        let length  = channel.length;

        // First, clip the data to the given bounds and replace original buffer
        // Only do so if necessary (e.g. useful bounds given)

        if ( bounds && (bounds[0] > 0 || bounds[1] < 1) )
        {
            let lower = (length * bounds[0]) | 0;
            let upper = (length * bounds[1]) | 0;
            let rate  = this.currentClip.sampleRate;

            channel = channel.slice(lower, upper);
            length  = channel.length;

            this.currentClip = this.audioContext.createBuffer(1, length, rate);
            this.currentClip.copyToChannel(channel, 0);
        }

        // Then, encode it to the user's configured format

        new VoiceExporter(this.currentClip)
            .write(this.currentPath, VoxEditor.config.format);
        VoxEditor.views.phrases.handleSave();

        // Finally, post-process it with an external command, if configured

        if ( Strings.isNullOrEmpty(VoxEditor.config.ppCommand) )
            return;

        let key      = VoxEditor.views.phrases.currentKey;
        let playPath = path.join(this.currentPlayVoice!, `${key}.mp3`);
        let command  = VoxEditor.config.ppCommand
            .replace('$1', this.currentPath)
            .replace('$2', playPath);

        child_process.execSync(command);
    }

    public handleFormatChange() : void
    {
        if (!this.currentPath || !VoxEditor.views.phrases.currentKey)
            return;

        this.currentPath = this.keyToPath(VoxEditor.views.phrases.currentKey);
        this.loadFromDisk();
    }

    /** Looks for and keeps track of any voices available on disk */
    private discoverVoices() : void
    {
        fs.readdirSync(VoiceManager.VOX_DIR)
            .map( name => path.join(VoiceManager.VOX_DIR, name) )
            .filter(Files.isDir)
            .forEach(dir =>
            {
                this.voxList.push(dir);

                // If no voice configured yet, choose the first one found
                if (VoxEditor.config.voicePath === '')
                    VoxEditor.config.voicePath = dir;
            });
    }

    /** Creates a new voice directory on disk */
    private createNewVoice() : void
    {
        let newName  = 'NuVoice';
        let newVoice = path.join(VoiceManager.VOX_DIR, newName);

        fs.mkdirSync(newVoice);
        VoxEditor.config.voicePath     = newVoice;
        VoxEditor.config.voicePlayPath = newVoice;
        this.voxList.push(newVoice);

        alert(`No voices were found, so a new one was made at '${newVoice}'`);
    }
}