/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="../../../js/rag.d.ts"/>

import {VoxEditor} from "../voxEditor";

/** Represents a dictionary of voice keys and their captions */
export type PhraseCaptions = {[id: string] : string};

/** Generates a bank of IDs and captions from a given phraseset document and data */
export class Captioner
{
    /** Reference to the generated phrase caption bank */
    public readonly captionBank : PhraseCaptions = {};

    public constructor()
    {
        // Note that the captioner should generate IDs the same way that the Resolver
        // does, in RAG/vox/resolver.ts. Else, voice will not match text content.

        this.populateLetters();
        this.populateNumbers();
        this.populateExcuses();
        this.populatePhrasesets();
        this.populateNames();
        this.populateServices();
        this.populateStations();
        this.populateSpecial();
    }

    /** TreeWalker filter to only accept text nodes */
    private nodeFilter(node: Node): number
    {
        // Only accept text nodes with words in them
        if ( node.textContent!.match(/[a-z0-9]/i) )
            return NodeFilter.FILTER_ACCEPT;

        return NodeFilter.FILTER_REJECT;
    }

    private populateLetters() : void
    {
        // TODO: After moving letters out of I18n, fix this
        let letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

        for (let i = 0; i < letters.length; i++)
        {
            let letter = letters[i];

            this.captionBank[`letter.${letter}`] = letter;
        }
    }

    private populateNumbers() : void
    {
        // Single digits
        for (let n = 0; n <= 60; n++)
            this.captionBank[`number.${n}`] = n.toString();

        // 24 hour double digits
        for (let n = 1; n <= 9; n++)
            this.captionBank[`number.0${n}`] = `Oh-${n}`;

        // 00:MM
        this.captionBank[`number.00`] = 'Oh-oh';

        // 00:00
        this.captionBank[`number.0000`] = 'Oh-zero hundred';

        // "Hundred"
        this.captionBank['number.hundred'] = 'Hundred';
    }

    private populateExcuses() : void
    {
        for (let i = 0; i < VoxEditor.database.excuses.length; i++)
            this.captionBank[`excuse.${i}`] = VoxEditor.database.excuses[i];
    }

    /** Walks through every XML element and populates the caption bank from phrasesets */
    private populatePhrasesets() : void
    {
        let treeWalker = document.createTreeWalker(
            VoxEditor.database.phrasesets,
            NodeFilter.SHOW_TEXT,
            { acceptNode: this.nodeFilter },
            false
        );

        let lastId  = '';
        let lastIdx = 0;

        while ( treeWalker.nextNode() )
        {
            let current = treeWalker.currentNode;
            let parent  = current.parentElement!;
            let psIndex = -1;
            let id      = '';
            let value   = Strings.clean(current.textContent!);

            // If text is part of a phraseset, get index of the phrase within the set
            if ( !parent.hasAttribute('id') )
            {
                let phraseSet = parent.parentElement!;

                // https://stackoverflow.com/a/9132575/3354920
                psIndex = DOM.indexOf(parent);
                parent  = phraseSet;
            }

            // Calculate ID by getting relative indicies of phrases and text parts
            id = 'phrase.' + parent.id;

            // Append phrase index if we're in a phraseset
            if (psIndex !== -1)
                id += `.${psIndex}`;

            // Append the text part's index inside the phrase
            if (lastId !== id)
            {
                lastIdx = 0;
                lastId  = id;
            }

            id += `.${lastIdx++}`;

            // Append a "preview" of the next sibling to the text
            if (current.nextSibling)
            {
                let next = current.nextSibling as HTMLElement;
                let tag  = next.nodeName.toUpperCase();

                // Append extra reference data to tag
                if      (next.id)
                    tag += ':' + next.id;
                else if (next.hasAttribute('context'))
                    tag += ':' + next.getAttribute('context');
                else if (next.hasAttribute('ref'))
                    tag += ':' + next.getAttribute('ref');

                value += ` <${tag}>`;
            }

            this.captionBank[id] = value;
        }
    }

    private populateNames() : void
    {
        VoxEditor.database.named.forEach(name =>
        {
            let key = Strings.filename(name);
            this.captionBank[`named.${key}`] = name;
        });
    }

    private populateServices() : void
    {
        VoxEditor.database.services.forEach(service =>
        {
            let key = Strings.filename(service);
            this.captionBank[`service.${key}`] = service;
        });
    }

    private populateStations() : void
    {
        // Filter out parenthesized location context
        let filter   = (v: string) => v.replace(/\(.+\)/i, '').trim();
        let stations = VoxEditor.database.stations;
        let keys     = Object.keys(stations);

        // For the "and" in station lists
        this.captionBank[`station.parts.and`]  = 'and';

        // For the "only" at the end of some single-station lists
        this.captionBank[`station.parts.only`] = 'only';

        // For stations to be read in the middle of lists or sentences
        keys.forEach(k =>
            this.captionBank[`station.middle.${k}`] = filter(stations[k])
        );

        // For stations to be read at the end of lists or sentences
        keys.forEach(k =>
            this.captionBank[`station.end.${k}`] = filter(stations[k])
        );
    }

    private populateSpecial() : void
    {
        // Testing phrase
        this.captionBank['phrase.sample.0'] = 'This is a test of the Rail Announcement' +
            ' Generator at <TIME>';
    }
}