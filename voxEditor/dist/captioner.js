"use strict";
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
exports.__esModule = true;
/// <reference path="../../js/rag.d.ts"/>
var voxEditor_1 = require("./voxEditor");
/** Generates a bank of IDs and captions from a given phraseset document and data */
var Captioner = /** @class */ (function () {
    function Captioner() {
        // Note that the captioner should generate IDs the same way that the Resolver
        // does, in RAG/vox/resolver.ts. Else, voice will not match text content.
        /** Reference to the generated phrase caption bank */
        this.captionBank = {};
        this.populateLetters();
        this.populateNumbers();
        this.populateExcuses();
        this.populatePhrasesets();
        this.populateNames();
        this.populateServices();
        this.populateStations();
    }
    /** TreeWalker filter to only accept text nodes */
    Captioner.prototype.nodeFilter = function (node) {
        // Only accept text nodes with words in them
        if (node.textContent.match(/[a-z0-9]/i))
            return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_REJECT;
    };
    Captioner.prototype.populateLetters = function () {
        // TODO: After moving letters out of I18n, fix this
        var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (var i = 0; i < letters.length; i++) {
            var letter = letters[i];
            this.captionBank["letter." + letter] = letter;
        }
    };
    Captioner.prototype.populateNumbers = function () {
        // Single digits
        for (var n = 0; n <= 60; n++)
            this.captionBank["number." + n] = n.toString();
        // 24 hour double digits
        for (var n = 1; n <= 9; n++)
            this.captionBank["number.0" + n] = "Oh-" + n;
        // 00:MM
        this.captionBank["number.00"] = 'Oh-oh';
        // 00:00
        this.captionBank["number.0000"] = 'Oh-zero hundred';
        // "Hundred"
        this.captionBank['number.hundred'] = 'Hundred';
    };
    Captioner.prototype.populateExcuses = function () {
        for (var i = 0; i < voxEditor_1.VoxEditor.database.excuses.length; i++)
            this.captionBank["excuse." + i] = voxEditor_1.VoxEditor.database.excuses[i];
    };
    /** Walks through every XML element and populates the caption bank from phrasesets */
    Captioner.prototype.populatePhrasesets = function () {
        var treeWalker = document.createTreeWalker(voxEditor_1.VoxEditor.database.phrasesets, NodeFilter.SHOW_TEXT, { acceptNode: this.nodeFilter }, false);
        var lastId = '';
        var lastIdx = 0;
        while (treeWalker.nextNode()) {
            var current = treeWalker.currentNode;
            var parent_1 = current.parentElement;
            var psIndex = -1;
            var id = '';
            var value = Strings.clean(current.textContent);
            // If text is part of a phraseset, get index of the phrase within the set
            if (!parent_1.hasAttribute('id')) {
                var phraseSet = parent_1.parentElement;
                // https://stackoverflow.com/a/9132575/3354920
                psIndex = DOM.indexOf(parent_1);
                parent_1 = phraseSet;
            }
            // Calculate ID by getting relative indicies of phrases and text parts
            id = 'phrase.' + parent_1.id;
            // Append phrase index if we're in a phraseset
            if (psIndex !== -1)
                id += "." + psIndex;
            // Append the text part's index inside the phrase
            if (lastId !== id) {
                lastIdx = 0;
                lastId = id;
            }
            id += "." + lastIdx++;
            // Append a "preview" of the next sibling to the text
            if (current.nextSibling) {
                var next = current.nextSibling;
                var tag = next.nodeName.toUpperCase();
                // Append extra reference data to tag
                if (next.id)
                    tag += ':' + next.id;
                else if (next.hasAttribute('context'))
                    tag += ':' + next.getAttribute('context');
                else if (next.hasAttribute('ref'))
                    tag += ':' + next.getAttribute('ref');
                value += " <" + tag + ">";
            }
            this.captionBank[id] = value;
        }
    };
    Captioner.prototype.populateNames = function () {
        for (var i = 0; i < voxEditor_1.VoxEditor.database.named.length; i++)
            this.captionBank["named." + i] = voxEditor_1.VoxEditor.database.named[i];
    };
    Captioner.prototype.populateServices = function () {
        for (var i = 0; i < voxEditor_1.VoxEditor.database.services.length; i++)
            this.captionBank["service." + i] = voxEditor_1.VoxEditor.database.services[i];
    };
    Captioner.prototype.populateStations = function () {
        var _this = this;
        // Filter out parenthesized location context
        var filter = function (v) { return v.replace(/\(.+\)/i, '').trim(); };
        var stations = voxEditor_1.VoxEditor.database.stations;
        var keys = Object.keys(stations);
        // For the "and" in station lists
        this.captionBank["station.parts.and"] = 'and';
        // For the "only" at the end of some single-station lists
        this.captionBank["station.parts.only"] = 'only';
        // For stations to be read in the middle of lists or sentences
        keys.forEach(function (k) {
            return _this.captionBank["station.middle." + k] = filter(stations[k]);
        });
        // For stations to be read at the end of lists or sentences
        keys.forEach(function (k) {
            return _this.captionBank["station.end." + k] = filter(stations[k]);
        });
    };
    return Captioner;
}());
exports.Captioner = Captioner;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FwdGlvbmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NhcHRpb25lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEscUVBQXFFOztBQUVyRSx5Q0FBeUM7QUFFekMseUNBQXNDO0FBS3RDLG9GQUFvRjtBQUNwRjtJQUtJO1FBRUksNkVBQTZFO1FBQzdFLHlFQUF5RTtRQU43RSxxREFBcUQ7UUFDckMsZ0JBQVcsR0FBb0IsRUFBRSxDQUFDO1FBTzlDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUN2QixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDdkIsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNyQixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUN4QixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRUQsa0RBQWtEO0lBQzFDLDhCQUFVLEdBQWxCLFVBQW1CLElBQVU7UUFFekIsNENBQTRDO1FBQzVDLElBQUssSUFBSSxDQUFDLFdBQVksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDO1lBQ3JDLE9BQU8sVUFBVSxDQUFDLGFBQWEsQ0FBQztRQUVwQyxPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUM7SUFDcEMsQ0FBQztJQUVPLG1DQUFlLEdBQXZCO1FBRUksbURBQW1EO1FBQ25ELElBQUksT0FBTyxHQUFHLDRCQUE0QixDQUFDO1FBRTNDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUN2QztZQUNJLElBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV4QixJQUFJLENBQUMsV0FBVyxDQUFDLFlBQVUsTUFBUSxDQUFDLEdBQUcsTUFBTSxDQUFDO1NBQ2pE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O1FBQUEsaUJBc0JDO1FBcEJHLDRDQUE0QztRQUM1QyxJQUFJLE1BQU0sR0FBSyxVQUFDLENBQVMsSUFBSyxPQUFBLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUEvQixDQUErQixDQUFDO1FBQzlELElBQUksUUFBUSxHQUFHLHFCQUFTLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztRQUMzQyxJQUFJLElBQUksR0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRXJDLGlDQUFpQztRQUNqQyxJQUFJLENBQUMsV0FBVyxDQUFDLG1CQUFtQixDQUFDLEdBQUksS0FBSyxDQUFDO1FBRS9DLHlEQUF5RDtRQUN6RCxJQUFJLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLEdBQUcsTUFBTSxDQUFDO1FBRWhELDhEQUE4RDtRQUM5RCxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQUEsQ0FBQztZQUNWLE9BQUEsS0FBSSxDQUFDLFdBQVcsQ0FBQyxvQkFBa0IsQ0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUE3RCxDQUE2RCxDQUNoRSxDQUFDO1FBRUYsMkRBQTJEO1FBQzNELElBQUksQ0FBQyxPQUFPLENBQUMsVUFBQSxDQUFDO1lBQ1YsT0FBQSxLQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFlLENBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFBMUQsQ0FBMEQsQ0FDN0QsQ0FBQztJQUNOLENBQUM7SUFDTCxnQkFBQztBQUFELENBQUMsQUEzS0QsSUEyS0M7QUEzS1ksOEJBQVMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi8uLi9qcy9yYWcuZC50c1wiLz5cclxuXHJcbmltcG9ydCB7Vm94RWRpdG9yfSBmcm9tIFwiLi92b3hFZGl0b3JcIjtcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgZGljdGlvbmFyeSBvZiB2b2ljZSBrZXlzIGFuZCB0aGVpciBjYXB0aW9ucyAqL1xyXG5leHBvcnQgdHlwZSBQaHJhc2VDYXB0aW9ucyA9IHtbaWQ6IHN0cmluZ10gOiBzdHJpbmd9O1xyXG5cclxuLyoqIEdlbmVyYXRlcyBhIGJhbmsgb2YgSURzIGFuZCBjYXB0aW9ucyBmcm9tIGEgZ2l2ZW4gcGhyYXNlc2V0IGRvY3VtZW50IGFuZCBkYXRhICovXHJcbmV4cG9ydCBjbGFzcyBDYXB0aW9uZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgZ2VuZXJhdGVkIHBocmFzZSBjYXB0aW9uIGJhbmsgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBjYXB0aW9uQmFuayA6IFBocmFzZUNhcHRpb25zID0ge307XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICAvLyBOb3RlIHRoYXQgdGhlIGNhcHRpb25lciBzaG91bGQgZ2VuZXJhdGUgSURzIHRoZSBzYW1lIHdheSB0aGF0IHRoZSBSZXNvbHZlclxyXG4gICAgICAgIC8vIGRvZXMsIGluIFJBRy92b3gvcmVzb2x2ZXIudHMuIEVsc2UsIHZvaWNlIHdpbGwgbm90IG1hdGNoIHRleHQgY29udGVudC5cclxuXHJcbiAgICAgICAgdGhpcy5wb3B1bGF0ZUxldHRlcnMoKTtcclxuICAgICAgICB0aGlzLnBvcHVsYXRlTnVtYmVycygpO1xyXG4gICAgICAgIHRoaXMucG9wdWxhdGVFeGN1c2VzKCk7XHJcbiAgICAgICAgdGhpcy5wb3B1bGF0ZVBocmFzZXNldHMoKTtcclxuICAgICAgICB0aGlzLnBvcHVsYXRlTmFtZXMoKTtcclxuICAgICAgICB0aGlzLnBvcHVsYXRlU2VydmljZXMoKTtcclxuICAgICAgICB0aGlzLnBvcHVsYXRlU3RhdGlvbnMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVHJlZVdhbGtlciBmaWx0ZXIgdG8gb25seSBhY2NlcHQgdGV4dCBub2RlcyAqL1xyXG4gICAgcHJpdmF0ZSBub2RlRmlsdGVyKG5vZGU6IE5vZGUpOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICAvLyBPbmx5IGFjY2VwdCB0ZXh0IG5vZGVzIHdpdGggd29yZHMgaW4gdGhlbVxyXG4gICAgICAgIGlmICggbm9kZS50ZXh0Q29udGVudCEubWF0Y2goL1thLXowLTldL2kpIClcclxuICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVDtcclxuXHJcbiAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBvcHVsYXRlTGV0dGVycygpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IEFmdGVyIG1vdmluZyBsZXR0ZXJzIG91dCBvZiBJMThuLCBmaXggdGhpc1xyXG4gICAgICAgIGxldCBsZXR0ZXJzID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaJztcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZXR0ZXJzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGxldHRlciA9IGxldHRlcnNbaV07XHJcblxyXG4gICAgICAgICAgICB0aGlzLmNhcHRpb25CYW5rW2BsZXR0ZXIuJHtsZXR0ZXJ9YF0gPSBsZXR0ZXI7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcG9wdWxhdGVOdW1iZXJzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2luZ2xlIGRpZ2l0c1xyXG4gICAgICAgIGZvciAobGV0IG4gPSAwOyBuIDw9IDYwOyBuKyspXHJcbiAgICAgICAgICAgIHRoaXMuY2FwdGlvbkJhbmtbYG51bWJlci4ke259YF0gPSBuLnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIC8vIDI0IGhvdXIgZG91YmxlIGRpZ2l0c1xyXG4gICAgICAgIGZvciAobGV0IG4gPSAxOyBuIDw9IDk7IG4rKylcclxuICAgICAgICAgICAgdGhpcy5jYXB0aW9uQmFua1tgbnVtYmVyLjAke259YF0gPSBgT2gtJHtufWA7XHJcblxyXG4gICAgICAgIC8vIDAwOk1NXHJcbiAgICAgICAgdGhpcy5jYXB0aW9uQmFua1tgbnVtYmVyLjAwYF0gPSAnT2gtb2gnO1xyXG5cclxuICAgICAgICAvLyAwMDowMFxyXG4gICAgICAgIHRoaXMuY2FwdGlvbkJhbmtbYG51bWJlci4wMDAwYF0gPSAnT2gtemVybyBodW5kcmVkJztcclxuXHJcbiAgICAgICAgLy8gXCJIdW5kcmVkXCJcclxuICAgICAgICB0aGlzLmNhcHRpb25CYW5rWydudW1iZXIuaHVuZHJlZCddID0gJ0h1bmRyZWQnO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcG9wdWxhdGVFeGN1c2VzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBWb3hFZGl0b3IuZGF0YWJhc2UuZXhjdXNlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgdGhpcy5jYXB0aW9uQmFua1tgZXhjdXNlLiR7aX1gXSA9IFZveEVkaXRvci5kYXRhYmFzZS5leGN1c2VzW2ldO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXYWxrcyB0aHJvdWdoIGV2ZXJ5IFhNTCBlbGVtZW50IGFuZCBwb3B1bGF0ZXMgdGhlIGNhcHRpb24gYmFuayBmcm9tIHBocmFzZXNldHMgKi9cclxuICAgIHByaXZhdGUgcG9wdWxhdGVQaHJhc2VzZXRzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRyZWVXYWxrZXIgPSBkb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKFxyXG4gICAgICAgICAgICBWb3hFZGl0b3IuZGF0YWJhc2UucGhyYXNlc2V0cyxcclxuICAgICAgICAgICAgTm9kZUZpbHRlci5TSE9XX1RFWFQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogdGhpcy5ub2RlRmlsdGVyIH0sXHJcbiAgICAgICAgICAgIGZhbHNlXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgbGV0IGxhc3RJZCAgPSAnJztcclxuICAgICAgICBsZXQgbGFzdElkeCA9IDA7XHJcblxyXG4gICAgICAgIHdoaWxlICggdHJlZVdhbGtlci5uZXh0Tm9kZSgpIClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjdXJyZW50ID0gdHJlZVdhbGtlci5jdXJyZW50Tm9kZTtcclxuICAgICAgICAgICAgbGV0IHBhcmVudCAgPSBjdXJyZW50LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgICAgICBsZXQgcHNJbmRleCA9IC0xO1xyXG4gICAgICAgICAgICBsZXQgaWQgICAgICA9ICcnO1xyXG4gICAgICAgICAgICBsZXQgdmFsdWUgICA9IFN0cmluZ3MuY2xlYW4oY3VycmVudC50ZXh0Q29udGVudCEpO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgdGV4dCBpcyBwYXJ0IG9mIGEgcGhyYXNlc2V0LCBnZXQgaW5kZXggb2YgdGhlIHBocmFzZSB3aXRoaW4gdGhlIHNldFxyXG4gICAgICAgICAgICBpZiAoICFwYXJlbnQuaGFzQXR0cmlidXRlKCdpZCcpIClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IHBocmFzZVNldCA9IHBhcmVudC5wYXJlbnRFbGVtZW50ITtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvOTEzMjU3NS8zMzU0OTIwXHJcbiAgICAgICAgICAgICAgICBwc0luZGV4ID0gRE9NLmluZGV4T2YocGFyZW50KTtcclxuICAgICAgICAgICAgICAgIHBhcmVudCAgPSBwaHJhc2VTZXQ7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBJRCBieSBnZXR0aW5nIHJlbGF0aXZlIGluZGljaWVzIG9mIHBocmFzZXMgYW5kIHRleHQgcGFydHNcclxuICAgICAgICAgICAgaWQgPSAncGhyYXNlLicgKyBwYXJlbnQuaWQ7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBlbmQgcGhyYXNlIGluZGV4IGlmIHdlJ3JlIGluIGEgcGhyYXNlc2V0XHJcbiAgICAgICAgICAgIGlmIChwc0luZGV4ICE9PSAtMSlcclxuICAgICAgICAgICAgICAgIGlkICs9IGAuJHtwc0luZGV4fWA7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBlbmQgdGhlIHRleHQgcGFydCdzIGluZGV4IGluc2lkZSB0aGUgcGhyYXNlXHJcbiAgICAgICAgICAgIGlmIChsYXN0SWQgIT09IGlkKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsYXN0SWR4ID0gMDtcclxuICAgICAgICAgICAgICAgIGxhc3RJZCAgPSBpZDtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWQgKz0gYC4ke2xhc3RJZHgrK31gO1xyXG5cclxuICAgICAgICAgICAgLy8gQXBwZW5kIGEgXCJwcmV2aWV3XCIgb2YgdGhlIG5leHQgc2libGluZyB0byB0aGUgdGV4dFxyXG4gICAgICAgICAgICBpZiAoY3VycmVudC5uZXh0U2libGluZylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IG5leHQgPSBjdXJyZW50Lm5leHRTaWJsaW5nIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgbGV0IHRhZyAgPSBuZXh0Lm5vZGVOYW1lLnRvVXBwZXJDYXNlKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQXBwZW5kIGV4dHJhIHJlZmVyZW5jZSBkYXRhIHRvIHRhZ1xyXG4gICAgICAgICAgICAgICAgaWYgICAgICAobmV4dC5pZClcclxuICAgICAgICAgICAgICAgICAgICB0YWcgKz0gJzonICsgbmV4dC5pZDtcclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKG5leHQuaGFzQXR0cmlidXRlKCdjb250ZXh0JykpXHJcbiAgICAgICAgICAgICAgICAgICAgdGFnICs9ICc6JyArIG5leHQuZ2V0QXR0cmlidXRlKCdjb250ZXh0Jyk7XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChuZXh0Lmhhc0F0dHJpYnV0ZSgncmVmJykpXHJcbiAgICAgICAgICAgICAgICAgICAgdGFnICs9ICc6JyArIG5leHQuZ2V0QXR0cmlidXRlKCdyZWYnKTtcclxuXHJcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBgIDwke3RhZ30+YDtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhpcy5jYXB0aW9uQmFua1tpZF0gPSB2YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwb3B1bGF0ZU5hbWVzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBWb3hFZGl0b3IuZGF0YWJhc2UubmFtZWQubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIHRoaXMuY2FwdGlvbkJhbmtbYG5hbWVkLiR7aX1gXSA9IFZveEVkaXRvci5kYXRhYmFzZS5uYW1lZFtpXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBvcHVsYXRlU2VydmljZXMoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IFZveEVkaXRvci5kYXRhYmFzZS5zZXJ2aWNlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgdGhpcy5jYXB0aW9uQmFua1tgc2VydmljZS4ke2l9YF0gPSBWb3hFZGl0b3IuZGF0YWJhc2Uuc2VydmljZXNbaV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwb3B1bGF0ZVN0YXRpb25zKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gRmlsdGVyIG91dCBwYXJlbnRoZXNpemVkIGxvY2F0aW9uIGNvbnRleHRcclxuICAgICAgICBsZXQgZmlsdGVyICAgPSAodjogc3RyaW5nKSA9PiB2LnJlcGxhY2UoL1xcKC4rXFwpL2ksICcnKS50cmltKCk7XHJcbiAgICAgICAgbGV0IHN0YXRpb25zID0gVm94RWRpdG9yLmRhdGFiYXNlLnN0YXRpb25zO1xyXG4gICAgICAgIGxldCBrZXlzICAgICA9IE9iamVjdC5rZXlzKHN0YXRpb25zKTtcclxuXHJcbiAgICAgICAgLy8gRm9yIHRoZSBcImFuZFwiIGluIHN0YXRpb24gbGlzdHNcclxuICAgICAgICB0aGlzLmNhcHRpb25CYW5rW2BzdGF0aW9uLnBhcnRzLmFuZGBdICA9ICdhbmQnO1xyXG5cclxuICAgICAgICAvLyBGb3IgdGhlIFwib25seVwiIGF0IHRoZSBlbmQgb2Ygc29tZSBzaW5nbGUtc3RhdGlvbiBsaXN0c1xyXG4gICAgICAgIHRoaXMuY2FwdGlvbkJhbmtbYHN0YXRpb24ucGFydHMub25seWBdID0gJ29ubHknO1xyXG5cclxuICAgICAgICAvLyBGb3Igc3RhdGlvbnMgdG8gYmUgcmVhZCBpbiB0aGUgbWlkZGxlIG9mIGxpc3RzIG9yIHNlbnRlbmNlc1xyXG4gICAgICAgIGtleXMuZm9yRWFjaChrID0+XHJcbiAgICAgICAgICAgIHRoaXMuY2FwdGlvbkJhbmtbYHN0YXRpb24ubWlkZGxlLiR7a31gXSA9IGZpbHRlcihzdGF0aW9uc1trXSlcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBGb3Igc3RhdGlvbnMgdG8gYmUgcmVhZCBhdCB0aGUgZW5kIG9mIGxpc3RzIG9yIHNlbnRlbmNlc1xyXG4gICAgICAgIGtleXMuZm9yRWFjaChrID0+XHJcbiAgICAgICAgICAgIHRoaXMuY2FwdGlvbkJhbmtbYHN0YXRpb24uZW5kLiR7a31gXSA9IGZpbHRlcihzdGF0aW9uc1trXSlcclxuICAgICAgICApO1xyXG4gICAgfVxyXG59Il19