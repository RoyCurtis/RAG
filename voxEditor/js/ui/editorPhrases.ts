/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";

/** Controller for the phrase list part of the editor */
export class EditorPhrases
{
    /** Reference to the list of clickable phrase IDs */
    private readonly domList        : HTMLUListElement;
    /** Reference to the "mark missing" button */
    private readonly btnMarkMissing : HTMLButtonElement;
    /** Reference to the phrase search box */
    private readonly inputFind      : HTMLInputElement;

    /** Reference to the currently selected phrase entry */
    public  currentEntry?     : HTMLElement;
    /** Reference to the currently highlighted phrase entry */
    private currentHighlight? : HTMLElement;

    public constructor()
    {
        this.domList        = DOM.require('#partSelector ul');
        this.btnMarkMissing = DOM.require('#btnMarkMissing');
        this.inputFind      = DOM.require('#inputFind');

        this.domList.onclick        = this.onClick.bind(this);
        this.btnMarkMissing.onclick = this.onMarkMissing.bind(this);
        this.inputFind.onkeydown    = this.onFind.bind(this);

        this.populateList();
    }

    /** Selects the given phrase entry, calling handlers elsewhere */
    public select(item: HTMLElement) : void
    {
        this.visualSelect(item);
        this.checkMissing(item);
        VoxEditor.views.tapedeck.load( item.dataset['key']! );
        VoxEditor.views.tapedeck.update();
    }

    /** Selects the previous phrase entry, relative to current selection */
    public selectPrev() : void
    {
        if (!this.currentEntry)
            return;

        let next = this.currentEntry.previousElementSibling
            || this.domList.lastElementChild;

        this.select(next as HTMLElement);
    }

    /** Selects the next phrase entry, relative to current selection */
    public selectNext() : void
    {
        if (!this.currentEntry)
            return;

        let next = this.currentEntry.nextElementSibling
            || this.domList.firstElementChild;

        this.select(next as HTMLElement);
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

    /** Marks all phrase entries that are missing files, in red */
    private onMarkMissing() : void
    {
        this.btnMarkMissing.disabled = true;
        this.domList.classList.add('hidden');

        for (let i = 0; i < this.domList.children.length; i++)
            this.checkMissing(this.domList.children[i] as HTMLElement);

        this.btnMarkMissing.disabled = false;
        this.domList.classList.remove('hidden');
    }

    /**
     * Scans the phrase list for those whose ID or caption matches the query value.
     * Case-insensitive, supports wrap-around and SHIFT for reverse search.
     */
    private onFind(ev: KeyboardEvent) : void
    {
        this.inputFind.classList.remove('noMatches');

        // Only handle ENTER to find
        if (ev.key !== 'Enter')
            return;

        // Don't operate on empty list
        if (this.domList.children.length === 0)
            return;

        // Clear highlight if empty
        if ( Strings.isNullOrEmpty(this.inputFind.value) )
            return this.clearHighlight();

        let dir     = ev.shiftKey ? -1 : 1;
        let query   = this.inputFind.value.toLowerCase();
        let current = this.currentHighlight as HTMLElement;

        if (!current)
            current = (dir === 1)
                ? this.domList.lastElementChild!  as HTMLElement
                : this.domList.firstElementChild! as HTMLElement;

        this.clearHighlight();

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
            {
                this.currentHighlight = current;
                this.currentHighlight.classList.add('highlight');
                this.currentHighlight.scrollIntoView(
                {
                    behavior : 'instant',
                    block    : 'center',
                    inline   : 'center'
                });

                return;
            }
        }

        this.inputFind.classList.add('noMatches');
    }

    /** Clears the currently highlighted entry */
    private clearHighlight() : void
    {
        if (!this.currentHighlight)
            return;

        this.currentHighlight.classList.remove('highlight');
        this.currentHighlight = undefined;
    }

    /** Clears and fills the list with all available IDs and captions */
    private populateList() : void
    {
        this.domList.classList.add('hidden');

        this.clearHighlight();
        this.domList.innerText = '';

        for (let key in VoxEditor.captioner.captionBank)
        {
            let element = document.createElement('li');
            let value   = VoxEditor.captioner.captionBank[key];

            element.dataset['key'] = key;
            element.innerHTML      = `<code>${key}</code> "${value}"`;

            this.domList.appendChild(element);
        }

        this.inputFind.disabled = (this.domList.children.length === 0);

        this.domList.classList.remove('hidden');
    }
}