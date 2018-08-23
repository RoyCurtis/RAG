/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";
import * as fs from "fs";

/** Controller for the phrase list part of the editor */
// TODO: Rename "phrases" to parts
export class EditorPhrases
{
    /** Reference to the entire phrase selector */
    private readonly dom       : HTMLElement;
    /** Reference to the list of clickable phrase IDs */
    private readonly domList   : HTMLUListElement;
    /** Reference to the orphan files warning */
    private readonly domOrphan : HTMLElement;

    private readonly btnGetExcuse  : HTMLButtonElement;

    private readonly btnGetLetter  : HTMLButtonElement;

    private readonly btnGetNamed   : HTMLButtonElement;

    private readonly btnGetNumber  : HTMLButtonElement;

    private readonly btnGetPhrase  : HTMLButtonElement;

    private readonly btnGetService : HTMLButtonElement;

    private readonly btnGetStation : HTMLButtonElement;
    /** Reference to the phrase search box */
    private readonly inputFind : HTMLInputElement;

    /** Reference to the currently selected phrase's key */
    public  currentKey?   : string;
    /** Reference to the currently selected phrase entry */
    private currentEntry? : HTMLElement;

    public constructor()
    {
        this.dom           = DOM.require('#partSelector');
        this.domList       = DOM.require('#phraseList',    this.dom);
        this.domOrphan     = DOM.require('#orphanWarning', this.dom);
        this.btnGetExcuse  = DOM.require('#btnGetExcuse',  this.dom);
        this.btnGetLetter  = DOM.require('#btnGetLetter',  this.dom);
        this.btnGetNamed   = DOM.require('#btnGetNamed',   this.dom);
        this.btnGetNumber  = DOM.require('#btnGetNumber',  this.dom);
        this.btnGetPhrase  = DOM.require('#btnGetPhrase',  this.dom);
        this.btnGetService = DOM.require('#btnGetService', this.dom);
        this.btnGetStation = DOM.require('#btnGetStation', this.dom);
        this.inputFind     = DOM.require('#inputFind',     this.dom);

        this.dom.onclick         = this.onClick.bind(this);
        this.inputFind.onkeydown = this.onFind.bind(this);

        this.populateList();
    }

    /** Selects the given phrase entry, calling handlers elsewhere */
    public select(item: HTMLElement, scroll: boolean = false) : void
    {
        this.visualSelect(item);
        this.checkMissing(item);

        this.currentKey = item.dataset['key']!;

        if (scroll) this.currentEntry!.scrollIntoView(
            {
                behavior : 'instant',
                block    : 'center',
                inline   : 'center'
            });

        VoxEditor.config.lastKey = this.currentKey;
        VoxEditor.config.save();
        VoxEditor.voices.loadFromDisk();
    }

    /** Selects the previous phrase entry, relative to current selection */
    public selectPrev() : void
    {
        if (!this.currentEntry)
            return;

        let next = this.currentEntry.previousElementSibling
            || this.domList.lastElementChild!;

        this.select(next as HTMLElement, true);
    }

    /** Selects the next phrase entry, relative to current selection */
    public selectNext() : void
    {
        if (!this.currentEntry)
            return;

        let next = this.currentEntry.nextElementSibling
            || this.domList.firstElementChild!;

        this.select(next as HTMLElement, true);
    }

    /** Selects the entry of the given key */
    public selectKey(key: string): void
    {
        let entry = this.domList.querySelector(`[data-key='${key}']`);

        if (entry)
            this.select(entry as HTMLElement, true);
    }

    /** Visually selects the given phrase entry */
    public visualSelect(item: HTMLElement) : void
    {
        // Ignore if not a child of the list
        if (item.parentElement !== this.domList)
            return;

        if (this.currentEntry)
            this.currentEntry.classList.remove('selected');

        this.currentEntry = item;
        this.currentEntry.classList.add('selected');
    }

    /** Visually updates the given phrase entry to reflect whether its file exists */
    public checkMissing(item: HTMLElement) : void
    {
        // Ignore if not a child of the list
        if (item.parentElement !== this.domList)
            return;

        if ( VoxEditor.voices.hasClip(item.dataset['key']!) )
            item.classList.remove('missing');
        else
            item.classList.add('missing');
    }

    /** Called when vox editor is ready */
    public handleReady(): void
    {
        if ( !Strings.isNullOrEmpty(VoxEditor.config.lastKey) )
            this.selectKey(VoxEditor.config.lastKey);
    }

    /** Called when a voice clip for the current selected phrase is saved */
    public handleSave() : void
    {
        if (this.currentEntry)
            this.checkMissing(this.currentEntry);
    }

    /** Called when the choice of voice changes, by marking all missing entries */
    public handleVoiceChange() : void
    {
        this.domList.hidden = true;

        for (let i = 0; i < this.domList.children.length; i++)
            this.checkMissing(this.domList.children[i] as HTMLElement);

        this.findOrphans();
        this.domList.hidden = false;
    }

    /** Handles click events for all phrase entries and buttons */
    private onClick(ev: MouseEvent) : void
    {
        let target = ev.target as HTMLElement;

        // Ignore targetless clicks
        if (!target)
            return;

        // Handle go-to toolbar clicks
        if (target.tagName === 'BUTTON')
        {
            this.inputFind.value = `^${target.innerText}\\.`;
            return this.findAndSelect(1, true);
        }

        // Redirect child clicks
        if (target.tagName === 'CODE')
            target = target.parentElement!;

        // Ignore non-list clicks
        if (target.parentElement! === this.domList)
            this.select(target);
    }

    /**
     * Scans the phrase list for those whose ID or caption matches the query value.
     * Case-insensitive, supports wrap-around and SHIFT for reverse search.
     */
    private onFind(ev: KeyboardEvent) : void
    {
        // Clear no-match class on typing anything
        this.inputFind.classList.remove('noMatches');

        // Only handle ENTER to find
        if (ev.key !== 'Enter')
            return;

        this.findAndSelect(ev.shiftKey ? -1 : 1);
    }

    /** Clears and fills the list with all available IDs and captions */
    private populateList() : void
    {
        this.domList.hidden = true;

        this.currentEntry      = undefined;
        this.domList.innerText = '';

        let keys = Object.keys(VoxEditor.captioner.captionBank).sort();

        for (let i = 0; i < keys.length; i++)
        {
            let key     = keys[i];
            let value   = VoxEditor.captioner.captionBank[key];
            let element = document.createElement('li');

            element.dataset['key'] = key;
            element.innerHTML      = `<code>${key}</code> "${value}"`;

            this.domList.appendChild(element);
            this.checkMissing(element);
        }

        this.inputFind.disabled = (this.domList.children.length === 0);

        this.findOrphans();
        this.domList.hidden = false;
    }

    /** Finds all orphaned voice files and logs them to console */
    private findOrphans() : void
    {
        let found = false;
        let voice = VoxEditor.voices.currentVoice;

        if (voice) fs.readdirSync(voice)
            .filter( file => file.match(/\.(mp3|wav)$/i) )
            .forEach(file =>
            {
                let key = file.replace('.mp3', '').replace('.wav', '');

                if (key in VoxEditor.captioner.captionBank)
                    return;

                if (!found)
                    console.group(`Orphaned files found in ${voice}:`);

                console.log(file);
                found = true;
            });

        if (found)
        {
            this.domOrphan.hidden = false;
            console.groupEnd();
        }
        else
            this.domOrphan.hidden = true;
    }

    private findAndSelect(dir: number, keyOnly: boolean = false) : void
    {
        // Don't operate on empty list
        if (this.domList.children.length === 0)
            return;

        let query   = new RegExp(this.inputFind.value, 'i');
        let current = this.currentEntry as HTMLElement;

        if (!current)
            current = (dir === 1)
                ? this.domList.lastElementChild!  as HTMLElement
                : this.domList.firstElementChild! as HTMLElement;

        for (let i = 0; i < this.domList.children.length; i++)
        {
            // Direction depending on SHIFT key being held
            if (dir === 1)
                current = current.nextElementSibling   as HTMLElement
                    || this.domList.firstElementChild! as HTMLElement;
            else
                current = current.previousElementSibling as HTMLElement
                    || this.domList.lastElementChild!    as HTMLElement;

            let haystack = keyOnly
                ? current.dataset['key']!.toLowerCase()
                : current.innerText.toLowerCase();

            // Found a match
            if ( query.test(haystack) )
                return this.select(current, true);
        }

        this.inputFind.classList.add('noMatches');
    }
}