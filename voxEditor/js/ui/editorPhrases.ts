/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";
import * as fs from "fs";

/** Controller for the phrase list part of the editor */
export class EditorPhrases
{
    /** Reference to the list of clickable phrase IDs */
    private readonly domList   : HTMLUListElement;
    /** Reference to the orphan files warning */
    private readonly domOrphan : HTMLElement;
    /** Reference to the phrase search box */
    private readonly inputFind : HTMLInputElement;

    /** Reference to the currently selected phrase's key */
    public  currentKey?   : string;
    /** Reference to the currently selected phrase entry */
    private currentEntry? : HTMLElement;

    public constructor()
    {
        this.domList   = DOM.require('#phraseList');
        this.domOrphan = DOM.require('#orphanWarning');
        this.inputFind = DOM.require('#inputFind');

        this.domList.onclick     = this.onClick.bind(this);
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

    /** Called when a voice clip for the current selected phrase is saved */
    public handleSave() : void
    {
        if (this.currentEntry)
            this.checkMissing(this.currentEntry);
    }

    /** Called when the choice of voice changes, by marking all missing entries */
    public handleVoiceChange() : void
    {
        this.domList.classList.add('hidden');

        for (let i = 0; i < this.domList.children.length; i++)
            this.checkMissing(this.domList.children[i] as HTMLElement);

        this.findOrphans();
        this.domList.classList.remove('hidden');
    }

    /** Handles click events for all phrase entries */
    private onClick(ev: MouseEvent) : void
    {
        let target = ev.target as HTMLElement;

        // Ignore targetless or parent clicks
        if (!target || target === this.domList)
            return;

        // Redirect child clicks
        if (target.tagName === 'CODE')
            target = target.parentElement!;

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

        // Don't operate on empty list
        if (this.domList.children.length === 0)
            return;

        let dir     = ev.shiftKey ? -1 : 1;
        let query   = this.inputFind.value.toLowerCase();
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

            // Found a match
            if (current.innerText.toLowerCase().indexOf(query) !== -1)
                return this.select(current, true);
        }

        this.inputFind.classList.add('noMatches');
    }

    /** Clears and fills the list with all available IDs and captions */
    private populateList() : void
    {
        this.domList.classList.add('hidden');

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
        this.domList.classList.remove('hidden');
    }

    /** Clears and fills the orphans list with all orphaned voice files */
    private findOrphans() : void
    {
        let found = false;

        fs.readdirSync(VoxEditor.config.voicePath).forEach(file =>
        {
            let key = file.replace('.mp3', '');

            if (key in VoxEditor.captioner.captionBank)
                return;

            if (!found)
                console.group(`Orphaned files found in ${VoxEditor.config.voicePath}:`);

            console.log(file);
            found = true;
        });

        if (found)
        {
            this.domOrphan.classList.remove('hidden');
            console.groupEnd();
        }
        else
            this.domOrphan.classList.add('hidden');
    }
}