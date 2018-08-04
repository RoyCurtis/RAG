"use strict";
class VoxEditor {
    static main(dataRefs) {
        VoxEditor.database = new Database(dataRefs);
        let phrasesList = DOM.require('#phrasesList');
        let acceptNode = (node) => {
            if (node.textContent.match(/[a-z0-9]/i))
                return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_REJECT;
        };
        let treeWalker = document.createTreeWalker(VoxEditor.database.phrasesets, NodeFilter.SHOW_TEXT, { acceptNode: acceptNode }, false);
        let phraseParts = {};
        while (treeWalker.nextNode()) {
            let current = treeWalker.currentNode;
            let parent = current.parentElement;
            let psIndex = 0;
            let id = '';
            if (!parent.hasAttribute('id')) {
                let phraseSet = parent.parentElement;
                psIndex = Array.prototype.indexOf.call(phraseSet.children, parent);
                parent = phraseSet;
            }
            if (parent.id.indexOf('debug') !== -1)
                continue;
            id = 'phrase.' + parent.id;
            if (!phraseParts[id])
                phraseParts[id] = [];
            if (!phraseParts[id][psIndex])
                phraseParts[id][psIndex] = [];
            phraseParts[id][psIndex].push(Strings.clean(current.textContent));
        }
        console.log(phraseParts);
    }
}
//# sourceMappingURL=voxEditor.js.map