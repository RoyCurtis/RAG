/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="../../js/rag.d.ts"/>

/** Main class of the entire vox editor application */
class VoxEditor
{
    /** Gets the database manager, which holds phrase, station and train data */
    public static database : Database;

    /**
     * Entry point for the vox editor, to be called from Javascript.
     *
     * @param dataRefs Configuration object, with rail data to use
     */
    public static main(dataRefs: DataRefs) : void
    {
        VoxEditor.database = new Database(dataRefs);

        let phrasesList = DOM.require <HTMLUListElement> ('#phrasesList');
        let acceptNode  = (node: Node) : number =>
        {
            // Only accept text nodes with words in them
            if (node.textContent!.match(/[a-z0-9]/i))
                return NodeFilter.FILTER_ACCEPT;

            return NodeFilter.FILTER_REJECT;
        };

        let treeWalker = document.createTreeWalker(
            VoxEditor.database.phrasesets,
            NodeFilter.SHOW_TEXT,
            { acceptNode: acceptNode },
            false
        );

        let phraseParts : {[id: string] : string[][]} = {};

        // Walk 1: Discover phrase parts to record
        while ( treeWalker.nextNode() )
        {
            let current = treeWalker.currentNode;
            let parent  = current.parentElement!;
            let psIndex = 0;
            let id      = '';

            // If text is part of a phraseset, get index of the phrase within the set
            if ( !parent.hasAttribute('id') )
            {
                let phraseSet = parent.parentElement!;

                // https://stackoverflow.com/a/9132575/3354920
                psIndex = Array.prototype.indexOf.call(phraseSet.children, parent);
                parent  = phraseSet;
            }

            // Skip debug phrases
            if (parent.id.indexOf('debug') !== -1)
                continue;

            id = 'phrase.' + parent.id;

            if ( !phraseParts[id] )
                phraseParts[id] = [];

            if ( !phraseParts[id][psIndex] )
                phraseParts[id][psIndex] = [];

            phraseParts[id][psIndex].push( Strings.clean(current.textContent!) );
        }

        console.log(phraseParts);
    }
}