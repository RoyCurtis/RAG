"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Global reference to the language container, set at init */
let L;
class I18n {
    /** Picks a language, and transforms all translation keys in the document */
    static init() {
        if (this.languages)
            throw new Error('I18n is already initialized');
        this.languages = {
            'en': new EnglishLanguage()
        };
        // TODO: Language selection
        L = this.currentLang = this.languages['en'];
        I18n.applyToDom();
    }
    /**
     * Walks through all text nodes in the DOM, replacing any translation keys.
     *
     * @see https://stackoverflow.com/a/10730777/3354920
     */
    static applyToDom() {
        let next;
        let walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: I18n.nodeFilter }, false);
        while (next = walk.nextNode()) {
            if (next.nodeType === Node.ELEMENT_NODE) {
                let element = next;
                for (let i = 0; i < element.attributes.length; i++)
                    I18n.expandAttribute(element.attributes[i]);
            }
            else if (next.nodeType === Node.TEXT_NODE && next.textContent)
                I18n.expandTextNode(next);
        }
    }
    /** Filters the tree walker to exclude script and style tags */
    static nodeFilter(node) {
        let tag = (node.nodeType === Node.ELEMENT_NODE)
            ? node.tagName.toUpperCase()
            : node.parentElement.tagName.toUpperCase();
        return ['SCRIPT', 'STYLE'].includes(tag)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
    }
    /** Expands any translation keys in the given attribute */
    static expandAttribute(attr) {
        // Setting an attribute, even if nothing actually changes, will cause various
        // side-effects (e.g. reloading iframes). So, as wasteful as this looks, we have
        // to match first before actually replacing.
        if (attr.value.match(this.TAG_REGEX))
            attr.value = attr.value.replace(this.TAG_REGEX, I18n.replace);
    }
    /** Expands any translation keys in the given text node */
    static expandTextNode(node) {
        node.textContent = node.textContent.replace(this.TAG_REGEX, I18n.replace);
    }
    /** Replaces key with value if it exists, else keeps the key */
    static replace(match) {
        let key = match.slice(1, -1);
        let value = L[key];
        if (!value) {
            console.error('Missing translation key:', match);
            return match;
        }
        else
            return value();
    }
}
/** Constant regex to match for translation keys */
I18n.TAG_REGEX = /%[A-Z_]+%/;
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** UI element with a filterable and keyboard navigable list of choices */
class Chooser {
    /** Creates a chooser, by replacing the placeholder in a given parent */
    constructor(parent) {
        /** Whether to visually select the clicked element */
        this.selectOnClick = true;
        /** Reference to the auto-filter timeout, if any */
        this.filterTimeout = 0;
        /** Whether to group added elements by alphabetical sections */
        this.groupByABC = false;
        /** Title attribute to apply to every item added */
        this.itemTitle = 'Click to select this item';
        if (!Chooser.TEMPLATE)
            Chooser.init();
        let target = DOM.require('chooser', parent);
        let placeholder = DOM.getAttr(target, 'placeholder', L.P_GENERIC_PH());
        let title = DOM.getAttr(target, 'title', L.P_GENERIC_T());
        this.itemTitle = DOM.getAttr(target, 'itemTitle', this.itemTitle);
        this.groupByABC = target.hasAttribute('groupByABC');
        this.dom = Chooser.TEMPLATE.cloneNode(true);
        this.inputFilter = DOM.require('.chSearchBox', this.dom);
        this.inputChoices = DOM.require('.chChoicesBox', this.dom);
        this.inputChoices.title = title;
        this.inputFilter.placeholder = placeholder;
        // TODO: Reusing the placeholder as title is probably bad
        // https://laken.net/blog/most-common-a11y-mistakes/
        this.inputFilter.title = placeholder;
        target.insertAdjacentElement('beforebegin', this.dom);
        target.remove();
    }
    /** Creates and detaches the template on first create */
    static init() {
        Chooser.TEMPLATE = DOM.require('#chooserTemplate');
        Chooser.TEMPLATE.id = '';
        Chooser.TEMPLATE.classList.remove('hidden');
        Chooser.TEMPLATE.remove();
    }
    /**
     * Adds the given value to the chooser as a selectable item.
     *
     * @param value Text of the selectable item
     * @param select Whether to select this item once added
     */
    add(value, select = false) {
        let item = document.createElement('dd');
        item.innerText = value;
        this.addRaw(item, select);
    }
    /**
     * Adds the given element to the chooser as a selectable item.
     *
     * @param item Element to add to the chooser
     * @param select Whether to select this item once added
     */
    addRaw(item, select = false) {
        item.title = this.itemTitle;
        item.tabIndex = -1;
        this.inputChoices.appendChild(item);
        if (select) {
            this.visualSelect(item);
            item.focus();
        }
    }
    /** Clears all items from this chooser and the current filter */
    clear() {
        this.inputChoices.innerHTML = '';
        this.inputFilter.value = '';
    }
    /** Select and focus the entry that matches the given value */
    preselect(value) {
        for (let key in this.inputChoices.children) {
            let item = this.inputChoices.children[key];
            if (value === item.innerText) {
                this.visualSelect(item);
                item.focus();
                break;
            }
        }
    }
    /** Handles pickers' click events, for choosing items */
    onClick(ev) {
        let target = ev.target;
        if (this.isChoice(target))
            if (!target.hasAttribute('disabled'))
                this.select(target);
    }
    /** Handles pickers' close methods, doing any timer cleanup */
    onClose() {
        window.clearTimeout(this.filterTimeout);
    }
    /** Handles pickers' input events, for filtering and navigation */
    onInput(ev) {
        let key = ev.key;
        let focused = document.activeElement;
        let parent = focused.parentElement;
        if (!focused)
            return;
        // Only handle events on this chooser's controls
        if (!this.owns(focused))
            return;
        // Handle typing into filter box
        if (focused === this.inputFilter) {
            window.clearTimeout(this.filterTimeout);
            this.filterTimeout = window.setTimeout(_ => this.filter(), 500);
            return;
        }
        // Redirect typing to input filter box
        if (focused !== this.inputFilter)
            if (key.length === 1 || key === 'Backspace')
                return this.inputFilter.focus();
        // Handle pressing ENTER after keyboard navigating to an item
        if (this.isChoice(focused))
            if (key === 'Enter')
                return this.select(focused);
        // Handle navigation when container or item is focused
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            let dir = (key === 'ArrowLeft') ? -1 : 1;
            let nav = null;
            // Navigate relative to currently focused element, if using groups
            if (this.groupByABC && parent.hasAttribute('group'))
                nav = DOM.getNextFocusableSibling(focused, dir);
            // Navigate relative to currently focused element, if choices are flat
            else if (!this.groupByABC && focused.parentElement === this.inputChoices)
                nav = DOM.getNextFocusableSibling(focused, dir);
            // Navigate relative to currently selected element
            else if (focused === this.domSelected)
                nav = DOM.getNextFocusableSibling(this.domSelected, dir);
            // Navigate relevant to beginning or end of container
            else if (dir === -1)
                nav = DOM.getNextFocusableSibling(focused.firstElementChild, dir);
            else
                nav = DOM.getNextFocusableSibling(focused.lastElementChild, dir);
            if (nav)
                nav.focus();
        }
    }
    /** Handles pickers' submit events, for instant filtering */
    onSubmit(ev) {
        ev.preventDefault();
        this.filter();
    }
    /** Hide or show choices if they partially match the user query */
    filter() {
        window.clearTimeout(this.filterTimeout);
        let filter = this.inputFilter.value.toLowerCase();
        let items = this.inputChoices.children;
        let engine = this.groupByABC
            ? Chooser.filterGroup
            : Chooser.filterItem;
        // Prevent browser redraw/reflow during filtering
        this.inputChoices.classList.add('hidden');
        // Iterate through all the items
        for (let i = 0; i < items.length; i++)
            engine(items[i], filter);
        this.inputChoices.classList.remove('hidden');
    }
    /** Applies filter to an item, showing it if matched, hiding if not */
    static filterItem(item, filter) {
        // Show if contains search term
        if (item.innerText.toLowerCase().indexOf(filter) >= 0) {
            item.classList.remove('hidden');
            return 0;
        }
        // Hide if not
        else {
            item.classList.add('hidden');
            return 1;
        }
    }
    /** Applies filter to children of a group, hiding the group if all children hide */
    static filterGroup(group, filter) {
        let entries = group.children;
        let count = entries.length - 1; // -1 for header element
        let hidden = 0;
        // Iterate through each station name in this letter section. Header skipped.
        for (let i = 1; i < entries.length; i++)
            hidden += Chooser.filterItem(entries[i], filter);
        // If all station names in this letter section were hidden, hide the section
        if (hidden >= count)
            group.classList.add('hidden');
        else
            group.classList.remove('hidden');
    }
    /** Visually changes the current selection, and updates the state and editor */
    select(entry) {
        let alreadySelected = (entry === this.domSelected);
        if (this.selectOnClick)
            this.visualSelect(entry);
        if (this.onSelect)
            this.onSelect(entry);
        if (alreadySelected)
            RAG.views.editor.closeDialog();
    }
    /** Visually changes the currently selected element */
    visualSelect(entry) {
        this.visualUnselect();
        this.domSelected = entry;
        this.domSelected.tabIndex = 50;
        entry.setAttribute('selected', 'true');
    }
    /** Visually unselects the currently selected element, if any */
    visualUnselect() {
        if (!this.domSelected)
            return;
        this.domSelected.removeAttribute('selected');
        this.domSelected.tabIndex = -1;
        this.domSelected = undefined;
    }
    /**
     * Whether this chooser is an ancestor (owner) of the given element.
     *
     * @param target Element to check if this chooser is an ancestor of
     */
    owns(target) {
        return this.dom.contains(target);
    }
    /** Whether the given element is a choosable one owned by this chooser */
    isChoice(target) {
        return target !== undefined
            && target.tagName.toLowerCase() === 'dd'
            && this.owns(target);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/**
 * Singleton instance of the station picker. Since there are expected to be 2500+
 * stations, this element would take up a lot of memory and generate a lot of DOM. So, it
 * has to be "swapped" between pickers and views that want to use it.
 */
class StationChooser extends Chooser {
    constructor(parent) {
        super(parent);
        /** Shortcut references to all the generated A-Z station list elements */
        this.domStations = {};
        this.inputChoices.tabIndex = 0;
        // Populates the list of stations from the database. We do this by creating a dl
        // element for each letter of the alphabet, creating a dt element header, and then
        // populating the dl with station name dd children.
        Object.keys(RAG.database.stations).forEach(this.addStation.bind(this));
    }
    /**
     * Attaches this control to the given parent and resets some state.
     *
     * @param picker Picker to attach this control to
     * @param onSelect Delegate to fire when choosing a station
     */
    attach(picker, onSelect) {
        let parent = picker.domForm;
        let current = this.dom.parentElement;
        // Re-enable all disabled elements
        this.inputChoices.querySelectorAll(`dd[disabled]`)
            .forEach(this.enable.bind(this));
        if (!current || current !== parent)
            parent.appendChild(this.dom);
        this.visualUnselect();
        this.onSelect = onSelect.bind(picker);
    }
    /** Pre-selects a station entry by its code */
    preselectCode(code) {
        let entry = this.getByCode(code);
        if (!entry)
            return;
        this.visualSelect(entry);
        entry.focus();
    }
    /** Enables the given station code or station element for selection */
    enable(codeOrNode) {
        let entry = (typeof codeOrNode === 'string')
            ? this.getByCode(codeOrNode)
            : codeOrNode;
        if (!entry)
            return;
        entry.removeAttribute('disabled');
        entry.tabIndex = -1;
        entry.title = this.itemTitle;
    }
    /** Disables the given station code from selection */
    disable(code) {
        let entry = this.getByCode(code);
        let next = DOM.getNextFocusableSibling(entry, 1);
        if (!entry)
            return;
        entry.setAttribute('disabled', '');
        entry.removeAttribute('tabindex');
        entry.title = '';
        // Shift focus to next available element, for keyboard navigation
        if (next)
            next.focus();
    }
    /** Gets a station's choice element by its code */
    getByCode(code) {
        return this.inputChoices
            .querySelector(`dd[data-code=${code}]`);
    }
    /** Populates the chooser with the given station code */
    addStation(code) {
        let station = RAG.database.stations[code];
        let letter = station[0];
        let group = this.domStations[letter];
        if (!group) {
            let header = document.createElement('dt');
            header.innerText = letter.toUpperCase();
            header.tabIndex = -1;
            group = this.domStations[letter] = document.createElement('dl');
            group.tabIndex = 50;
            group.setAttribute('group', '');
            group.appendChild(header);
            this.inputChoices.appendChild(group);
        }
        let entry = document.createElement('dd');
        entry.dataset['code'] = code;
        entry.innerText = RAG.database.stations[code];
        entry.title = this.itemTitle;
        entry.tabIndex = -1;
        group.appendChild(entry);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Station list item that can be dragged and dropped */
class StationListItem {
    /** Creates and detaches the template on first create */
    static init() {
        StationListItem.TEMPLATE = DOM.require('#stationListItemTemplate');
        StationListItem.TEMPLATE.id = '';
        StationListItem.TEMPLATE.classList.remove('hidden');
        StationListItem.TEMPLATE.remove();
    }
    /**
     * Creates a station list item, meant for the station list builder.
     *
     * @param code Three-letter station code to create this item for
     */
    constructor(code) {
        if (!StationListItem.TEMPLATE)
            StationListItem.init();
        this.dom = StationListItem.TEMPLATE.cloneNode(true);
        this.dom.innerText = RAG.database.getStation(code);
        this.dom.dataset['code'] = code;
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Base class for picker views */
class Picker {
    /**
     * Creates a picker to handle the given phrase element type.
     *
     * @param {string} xmlTag Name of the XML tag this picker will handle.
     */
    constructor(xmlTag) {
        this.dom = DOM.require(`#${xmlTag}Picker`);
        this.domForm = DOM.require('form', this.dom);
        this.domHeader = DOM.require('header', this.dom);
        this.xmlTag = xmlTag;
        this.domForm.onchange = this.onChange.bind(this);
        this.domForm.oninput = this.onChange.bind(this);
        this.domForm.onclick = this.onClick.bind(this);
        this.domForm.onkeydown = this.onInput.bind(this);
        this.domForm.onsubmit = this.onSubmit.bind(this);
    }
    /**
     * Called when ENTER is pressed whilst a form control of the picker is focused.
     * By default, this will trigger the onChange handler and close the dialog.
     */
    onSubmit(ev) {
        ev.preventDefault();
        this.onChange(ev);
        RAG.views.editor.closeDialog();
    }
    /**
     * Open this picker for a given phrase element. The implementing picker should fill
     * its form elements with data from the current state and targeted element here.
     *
     * @param {HTMLElement} target Phrase element that this picker is being opened for
     */
    open(target) {
        this.dom.classList.remove('hidden');
        this.domEditing = target;
        this.layout();
    }
    /** Closes this picker */
    close() {
        // Fix keyboard staying open in iOS on close
        DOM.blurActive(this.dom);
        this.dom.classList.add('hidden');
    }
    /** Positions this picker relative to the target phrase element */
    layout() {
        if (!this.domEditing)
            return;
        let targetRect = this.domEditing.getBoundingClientRect();
        let fullWidth = this.dom.classList.contains('fullWidth');
        let isModal = this.dom.classList.contains('modal');
        let docW = document.body.clientWidth;
        let docH = document.body.clientHeight;
        let dialogX = (targetRect.left | 0) - 8;
        let dialogY = targetRect.bottom | 0;
        let dialogW = (targetRect.width | 0) + 16;
        // Adjust if horizontally off screen
        if (!fullWidth && !isModal) {
            // Force full width on mobile
            if (DOM.isMobile) {
                this.dom.style.width = `100%`;
                dialogX = 0;
            }
            else {
                this.dom.style.width = `initial`;
                this.dom.style.minWidth = `${dialogW}px`;
                if (dialogX + this.dom.offsetWidth > docW)
                    dialogX = (targetRect.right | 0) - this.dom.offsetWidth + 8;
            }
        }
        // Handle pickers that instead take up the whole display. CSS isn't used here,
        // because percentage-based left/top causes subpixel issues on Chrome.
        if (isModal) {
            dialogX = DOM.isMobile ? 0 :
                ((docW * 0.1) / 2) | 0;
            dialogY = DOM.isMobile ? 0 :
                ((docH * 0.1) / 2) | 0;
        }
        // Clamp to top edge of document
        else if (dialogY < 0)
            dialogY = 0;
        // Adjust if vertically off screen
        else if (dialogY + this.dom.offsetHeight > docH) {
            dialogY = (targetRect.top | 0) - this.dom.offsetHeight + 1;
            this.domEditing.classList.add('below');
            this.domEditing.classList.remove('above');
            // If still off-screen, clamp to bottom
            if (dialogY + this.dom.offsetHeight > docH)
                dialogY = docH - this.dom.offsetHeight;
            // Clamp to top edge of document. Likely happens if target element is large.
            if (dialogY < 0)
                dialogY = 0;
        }
        else {
            this.domEditing.classList.add('above');
            this.domEditing.classList.remove('below');
        }
        this.dom.style.left = (fullWidth ? 0 : dialogX) + 'px';
        this.dom.style.top = dialogY + 'px';
    }
    /** Returns true if an element in this picker currently has focus */
    hasFocus() {
        return this.dom.contains(document.activeElement);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the coach picker dialog */
class CoachPicker extends Picker {
    constructor() {
        super('coach');
        /** Holds the context for the current coach element being edited */
        this.currentCtx = '';
        this.inputLetter = DOM.require('select', this.dom);
        for (let i = 0; i < 26; i++)
            DOM.addOption(this.inputLetter, L.LETTERS[i], L.LETTERS[i]);
    }
    /** Populates the form with the target context's coach letter */
    open(target) {
        super.open(target);
        this.currentCtx = DOM.requireData(target, 'context');
        this.domHeader.innerText = L.HEADER_COACH(this.currentCtx);
        this.inputLetter.value = RAG.state.getCoach(this.currentCtx);
        this.inputLetter.focus();
    }
    /** Updates the coach element and state currently being edited */
    onChange(_) {
        if (!this.currentCtx)
            throw Error(L.P_COACH_MISSING_STATE());
        RAG.state.setCoach(this.currentCtx, this.inputLetter.value);
        RAG.views.editor
            .getElementsByQuery(`[data-type=coach][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = this.inputLetter.value);
    }
    onClick(_) { }
    onInput(_) { }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the excuse picker dialog */
class ExcusePicker extends Picker {
    constructor() {
        super('excuse');
        this.domChooser = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
        this.domHeader.innerText = L.HEADER_EXCUSE();
        RAG.database.excuses.forEach(v => this.domChooser.add(v));
    }
    /** Populates the chooser with the current state's excuse */
    open(target) {
        super.open(target);
        // Pre-select the currently used excuse
        this.domChooser.preselect(RAG.state.excuse);
    }
    /** Close this picker */
    close() {
        super.close();
        this.domChooser.onClose();
    }
    // Forward these events to the chooser
    onChange(_) { }
    onClick(ev) { this.domChooser.onClick(ev); }
    onInput(ev) { this.domChooser.onInput(ev); }
    onSubmit(ev) { this.domChooser.onSubmit(ev); }
    /** Handles chooser selection by updating the excuse element and state */
    onSelect(entry) {
        RAG.state.excuse = entry.innerText;
        RAG.views.editor.setElementsText('excuse', RAG.state.excuse);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the integer picker dialog */
class IntegerPicker extends Picker {
    constructor() {
        super('integer');
        this.inputDigit = DOM.require('input', this.dom);
        this.domLabel = DOM.require('label', this.dom);
        // iOS needs different type and pattern to show a numerical keyboard
        if (DOM.isiOS) {
            this.inputDigit.type = 'tel';
            this.inputDigit.pattern = '[0-9]+';
        }
    }
    /** Populates the form with the target context's integer data */
    open(target) {
        super.open(target);
        this.currentCtx = DOM.requireData(target, 'context');
        this.singular = target.dataset['singular'];
        this.plural = target.dataset['plural'];
        this.words = Parse.boolean(target.dataset['words'] || 'false');
        let value = RAG.state.getInteger(this.currentCtx);
        if (this.singular && value === 1)
            this.domLabel.innerText = this.singular;
        else if (this.plural && value !== 1)
            this.domLabel.innerText = this.plural;
        else
            this.domLabel.innerText = '';
        this.domHeader.innerText = L.HEADER_INTEGER(this.currentCtx);
        this.inputDigit.value = value.toString();
        this.inputDigit.focus();
    }
    /** Updates the integer element and state currently being edited */
    onChange(_) {
        if (!this.currentCtx)
            throw Error(L.P_INT_MISSING_STATE());
        // Can't use valueAsNumber due to iOS input type workarounds
        let int = parseInt(this.inputDigit.value);
        let intStr = (this.words)
            ? L.DIGITS[int] || int.toString()
            : int.toString();
        // Ignore invalid values
        if (isNaN(int))
            return;
        this.domLabel.innerText = '';
        if (int === 1 && this.singular) {
            intStr += ` ${this.singular}`;
            this.domLabel.innerText = this.singular;
        }
        else if (int !== 1 && this.plural) {
            intStr += ` ${this.plural}`;
            this.domLabel.innerText = this.plural;
        }
        RAG.state.setInteger(this.currentCtx, int);
        RAG.views.editor
            .getElementsByQuery(`[data-type=integer][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = intStr);
    }
    onClick(_) { }
    onInput(_) { }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the named train picker dialog */
class NamedPicker extends Picker {
    constructor() {
        super('named');
        this.domChooser = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
        this.domHeader.innerText = L.HEADER_NAMED();
        RAG.database.named.forEach(v => this.domChooser.add(v));
    }
    /** Populates the chooser with the current state's named train */
    open(target) {
        super.open(target);
        // Pre-select the currently used name
        this.domChooser.preselect(RAG.state.named);
    }
    /** Close this picker */
    close() {
        super.close();
        this.domChooser.onClose();
    }
    // Forward these events to the chooser
    onChange(_) { }
    onClick(ev) { this.domChooser.onClick(ev); }
    onInput(ev) { this.domChooser.onInput(ev); }
    onSubmit(ev) { this.domChooser.onSubmit(ev); }
    /** Handles chooser selection by updating the named element and state */
    onSelect(entry) {
        RAG.state.named = entry.innerText;
        RAG.views.editor.setElementsText('named', RAG.state.named);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the phraseset picker dialog */
class PhrasesetPicker extends Picker {
    constructor() {
        super('phraseset');
        this.domChooser = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
    }
    /** Populates the chooser with the current phraseset's list of phrases */
    open(target) {
        super.open(target);
        let ref = DOM.requireData(target, 'ref');
        let idx = parseInt(DOM.requireData(target, 'idx'));
        let phraseset = RAG.database.getPhraseset(ref);
        if (!phraseset)
            throw Error(L.P_PSET_UNKNOWN(ref));
        this.currentRef = ref;
        this.domHeader.innerText = L.HEADER_PHRASESET(ref);
        this.domChooser.clear();
        // For each phrase, we need to run it through the phraser using the current state
        // to generate "previews" of how the phrase will look.
        for (let i = 0; i < phraseset.children.length; i++) {
            let phrase = document.createElement('dd');
            DOM.cloneInto(phraseset.children[i], phrase);
            RAG.phraser.process(phrase);
            phrase.innerText = DOM.getCleanedVisibleText(phrase);
            phrase.dataset.idx = i.toString();
            this.domChooser.addRaw(phrase, i === idx);
        }
    }
    /** Close this picker */
    close() {
        super.close();
        this.domChooser.onClose();
    }
    // Forward these events to the chooser
    onChange(_) { }
    onClick(ev) { this.domChooser.onClick(ev); }
    onInput(ev) { this.domChooser.onInput(ev); }
    onSubmit(ev) { this.domChooser.onSubmit(ev); }
    /** Handles chooser selection by updating the phraseset element and state */
    onSelect(entry) {
        if (!this.currentRef)
            throw Error(L.P_PSET_MISSING_STATE());
        let idx = parseInt(entry.dataset['idx']);
        RAG.state.setPhrasesetIdx(this.currentRef, idx);
        RAG.views.editor.closeDialog();
        RAG.views.editor.refreshPhraseset(this.currentRef);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the platform picker dialog */
class PlatformPicker extends Picker {
    constructor() {
        super('platform');
        this.inputDigit = DOM.require('input', this.dom);
        this.inputLetter = DOM.require('select', this.dom);
        this.domHeader.innerText = L.HEADER_PLATFORM();
        // iOS needs different type and pattern to show a numerical keyboard
        if (DOM.isiOS) {
            this.inputDigit.type = 'tel';
            this.inputDigit.pattern = '[0-9]+';
        }
    }
    /** Populates the form with the current state's platform data */
    open(target) {
        super.open(target);
        let value = RAG.state.platform;
        this.inputDigit.value = value[0];
        this.inputLetter.value = value[1];
        this.inputDigit.focus();
    }
    /** Updates the platform element and state currently being edited */
    onChange(_) {
        // Ignore invalid values
        if (isNaN(parseInt(this.inputDigit.value)))
            return;
        RAG.state.platform = [this.inputDigit.value, this.inputLetter.value];
        RAG.views.editor.setElementsText('platform', RAG.state.platform.join(''));
    }
    onClick(_) { }
    onInput(_) { }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the service picker dialog */
class ServicePicker extends Picker {
    constructor() {
        super('service');
        /** Holds the context for the current service element being edited */
        this.currentCtx = '';
        this.domChooser = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
        RAG.database.services.forEach(v => this.domChooser.add(v));
    }
    /** Populates the chooser with the current state's service */
    open(target) {
        super.open(target);
        this.currentCtx = DOM.requireData(target, 'context');
        this.domHeader.innerText = L.HEADER_SERVICE(this.currentCtx);
        // Pre-select the currently used service
        this.domChooser.preselect(RAG.state.getService(this.currentCtx));
    }
    /** Close this picker */
    close() {
        super.close();
        this.domChooser.onClose();
    }
    // Forward these events to the chooser
    onChange(_) { }
    onClick(ev) { this.domChooser.onClick(ev); }
    onInput(ev) { this.domChooser.onInput(ev); }
    onSubmit(ev) { this.domChooser.onSubmit(ev); }
    /** Handles chooser selection by updating the service element and state */
    onSelect(entry) {
        if (!this.currentCtx)
            throw Error(L.P_SERVICE_MISSING_STATE());
        RAG.state.setService(this.currentCtx, entry.innerText);
        RAG.views.editor
            .getElementsByQuery(`[data-type=service][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = entry.innerText);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the station picker dialog */
class StationPicker extends Picker {
    constructor(tag = 'station') {
        super(tag);
        /** Holds the context for the current station element being edited */
        this.currentCtx = '';
        if (!StationPicker.chooser)
            StationPicker.chooser = new StationChooser(this.domForm);
        this.onOpen = this.onStationPickerOpen.bind(this);
    }
    /** Fires the onOpen delegate registered for this picker */
    open(target) {
        super.open(target);
        this.onOpen(target);
    }
    /** Attaches the station chooser and focuses it onto the current element's station */
    onStationPickerOpen(target) {
        let chooser = StationPicker.chooser;
        this.currentCtx = DOM.requireData(target, 'context');
        chooser.attach(this, this.onSelectStation);
        chooser.preselectCode(RAG.state.getStation(this.currentCtx));
        chooser.selectOnClick = true;
        this.domHeader.innerText = L.HEADER_STATION(this.currentCtx);
    }
    // Forward these events to the station chooser
    onChange(_) { }
    onClick(ev) { StationPicker.chooser.onClick(ev); }
    onInput(ev) { StationPicker.chooser.onInput(ev); }
    onSubmit(ev) { StationPicker.chooser.onSubmit(ev); }
    /** Handles chooser selection by updating the station element and state */
    onSelectStation(entry) {
        let query = `[data-type=station][data-context=${this.currentCtx}]`;
        let code = entry.dataset['code'];
        let name = RAG.database.getStation(code);
        RAG.state.setStation(this.currentCtx, code);
        RAG.views.editor
            .getElementsByQuery(query)
            .forEach(element => element.textContent = name);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/// <reference path="picker.ts"/>
/// <reference path="stationPicker.ts"/>
/// <reference path="../../vendor/draggable.d.ts"/>
/** Controller for the station list picker dialog */
class StationListPicker extends StationPicker {
    constructor() {
        super("stationlist");
        this.domList = DOM.require('.stationList', this.dom);
        this.btnAdd = DOM.require('.addStation', this.domList);
        this.btnClose = DOM.require('.closePicker', this.domList);
        this.domDel = DOM.require('.delStation', this.domList);
        this.inputList = DOM.require('dl', this.domList);
        this.domEmptyList = DOM.require('p', this.domList);
        this.onOpen = this.onStationListPickerOpen.bind(this);
        new Draggable.Sortable([this.inputList, this.domDel], { draggable: 'dd' })
            // Have to use timeout, to let Draggable finish sorting the list
            .on('drag:stop', ev => setTimeout(() => this.onDragStop(ev), 1))
            .on('mirror:create', this.onDragMirrorCreate.bind(this));
    }
    /**
     * Populates the station list builder, with the selected list. Because this picker
     * extends from StationList, this handler overrides the 'onOpen' delegate property
     * of StationList.
     *
     * @param target Station list editor element to open for
     */
    onStationListPickerOpen(target) {
        // Since we share the station picker with StationList, grab it
        StationPicker.chooser.attach(this, this.onAddStation);
        StationPicker.chooser.selectOnClick = false;
        this.currentCtx = DOM.requireData(target, 'context');
        let entries = RAG.state.getStationList(this.currentCtx).slice();
        this.domHeader.innerText = L.HEADER_STATIONLIST(this.currentCtx);
        // Remove all old list elements
        this.inputList.innerHTML = '';
        // Finally, populate list from the clicked station list element
        entries.forEach(v => this.add(v));
        this.inputList.focus();
    }
    // Forward these events to the chooser
    onSubmit(ev) { super.onSubmit(ev); }
    /** Handles pickers' click events, for choosing items */
    onClick(ev) {
        super.onClick(ev);
        if (ev.target === this.btnClose)
            RAG.views.editor.closeDialog();
        // For mobile users, switch to station chooser screen if "Add..." was clicked
        if (ev.target === this.btnAdd)
            this.dom.classList.add('addingStation');
    }
    /** Handles keyboard navigation for the station list builder */
    onInput(ev) {
        super.onInput(ev);
        let key = ev.key;
        let focused = document.activeElement;
        // Only handle the station list builder control
        if (!focused || !this.inputList.contains(focused))
            return;
        // Handle keyboard navigation
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            let dir = (key === 'ArrowLeft') ? -1 : 1;
            let nav = null;
            // Navigate relative to focused element
            if (focused.parentElement === this.inputList)
                nav = DOM.getNextFocusableSibling(focused, dir);
            // Navigate relevant to beginning or end of container
            else if (dir === -1)
                nav = DOM.getNextFocusableSibling(focused.firstElementChild, dir);
            else
                nav = DOM.getNextFocusableSibling(focused.lastElementChild, dir);
            if (nav)
                nav.focus();
        }
        // Handle entry deletion
        if (key === 'Delete' || key === 'Backspace')
            if (focused.parentElement === this.inputList) {
                // Focus on next element or parent on delete
                let next = focused.previousElementSibling
                    || focused.nextElementSibling
                    || this.inputList;
                this.remove(focused);
                next.focus();
            }
    }
    /** Handler for when a station is chosen */
    onAddStation(entry) {
        let newEntry = this.add(entry.dataset['code']);
        // Switch back to builder screen, if on mobile
        this.dom.classList.remove('addingStation');
        this.update();
        // Focus only if on mobile, since the station list is on a dedicated screen
        if (DOM.isMobile)
            newEntry.dom.focus();
        else
            newEntry.dom.scrollIntoView();
    }
    /** Fixes mirrors not having correct width of the source element, on create */
    onDragMirrorCreate(ev) {
        if (!ev.data.source || !ev.data.originalSource)
            throw Error(L.P_SL_DRAG_MISSING());
        ev.data.source.style.width = ev.data.originalSource.clientWidth + 'px';
    }
    /** Handles draggable station name being dropped */
    onDragStop(ev) {
        if (!ev.data.originalSource)
            return;
        if (ev.data.originalSource.parentElement === this.domDel)
            this.remove(ev.data.originalSource);
        else
            this.update();
    }
    /**
     * Creates and adds a new entry for the builder list.
     *
     * @param code Three-letter station code to create an item for
     */
    add(code) {
        let newEntry = new StationListItem(code);
        // Add the new entry to the sortable list
        this.inputList.appendChild(newEntry.dom);
        this.domEmptyList.classList.add('hidden');
        // Disable the added station in the chooser
        StationPicker.chooser.disable(code);
        // Delete item on double click
        newEntry.dom.ondblclick = _ => this.remove(newEntry.dom);
        return newEntry;
    }
    /**
     * Removes the given station entry element from the builder.
     *
     * @param entry Element of the station entry to remove
     */
    remove(entry) {
        if (!this.domList.contains(entry))
            throw Error('Attempted to remove entry not on station list builder');
        // Enabled the removed station in the chooser
        StationPicker.chooser.enable(entry.dataset['code']);
        entry.remove();
        this.update();
        if (this.inputList.children.length === 0)
            this.domEmptyList.classList.remove('hidden');
    }
    /** Updates the station list element and state currently being edited */
    update() {
        let children = this.inputList.children;
        // Don't update if list is empty
        if (children.length === 0)
            return;
        let list = [];
        for (let i = 0; i < children.length; i++) {
            let entry = children[i];
            list.push(entry.dataset['code']);
        }
        let textList = Strings.fromStationList(list.slice(), this.currentCtx);
        let query = `[data-type=stationlist][data-context=${this.currentCtx}]`;
        RAG.state.setStationList(this.currentCtx, list);
        RAG.views.editor
            .getElementsByQuery(query)
            .forEach(element => element.textContent = textList);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/// <reference path="picker.ts"/>
/** Controller for the time picker dialog */
class TimePicker extends Picker {
    constructor() {
        super('time');
        /** Holds the context for the current time element being edited */
        this.currentCtx = '';
        this.inputTime = DOM.require('input', this.dom);
    }
    /** Populates the form with the current state's time */
    open(target) {
        super.open(target);
        this.currentCtx = DOM.requireData(target, 'context');
        this.domHeader.innerText = L.HEADER_TIME(this.currentCtx);
        this.inputTime.value = RAG.state.getTime(this.currentCtx);
        this.inputTime.focus();
    }
    /** Updates the time element and state currently being edited */
    onChange(_) {
        if (!this.currentCtx)
            throw Error(L.P_TIME_MISSING_STATE());
        RAG.state.setTime(this.currentCtx, this.inputTime.value);
        RAG.views.editor
            .getElementsByQuery(`[data-type=time][data-context=${this.currentCtx}]`)
            .forEach(element => element.textContent = this.inputTime.value);
    }
    onClick(_) { }
    onInput(_) { }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
class BaseLanguage {
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/// <reference path="BaseLanguage.ts"/>
class EnglishLanguage extends BaseLanguage {
    constructor() {
        super(...arguments);
        this.WELCOME = () => 'Welcome to Rail Announcement Generator.';
        this.DOM_MISSING = (q) => `Required DOM element is missing: '${q}'`;
        this.ATTR_MISSING = (a) => `Required attribute is missing: '${a}'`;
        this.DATA_MISSING = (k) => `Required dataset key is missing or empty: '${k}'`;
        this.BAD_DIRECTION = (v) => `Direction needs to be -1 or 1, not '${v}'`;
        this.BAD_BOOLEAN = (v) => `Given string does not represent a boolean: '${v}'`;
        this.STATE_FROM_STORAGE = () => 'State has been loaded from storage.';
        this.STATE_TO_STORAGE = () => 'State has been saved to storage, and dumped to console.';
        this.STATE_COPY_PASTE = () => '%cCopy and paste this in console to load later:';
        this.STATE_RAW_JSON = () => '%cRaw JSON state:';
        this.STATE_SAVE_FAIL = (msg) => `Sorry, state could not be saved to storage: ${msg}.`;
        this.STATE_SAVE_MISSING = () => 'Sorry, no state was found in storage.';
        this.STATE_NONEXISTANT_PHRASESET = (r) => `Attempted to get chosen index for phraseset (${r}) that doesn't exist`;
        this.CONFIG_LOAD_FAIL = (msg) => `Could not load settings: ${msg}`;
        this.CONFIG_SAVE_FAIL = (msg) => `Could not save settings: ${msg}`;
        this.CONFIG_RESET_FAIL = (msg) => `Could not clear settings: ${msg}`;
        this.DB_ELEMENT_NOT_PHRASESET_IFRAME = (e) => `Configured phraseset element query (${e}) does not point to an iFrame embed`;
        this.DB_UNKNOWN_STATION = (c) => `UNKNOWN STATION: ${c}`;
        this.DB_EMPTY_STATION = (c) => `Station database appears to contain an empty name for code '${c}'`;
        this.DB_TOO_MANY_STATIONS = () => 'Picking too many stations than there are available';
        this.TOOLBAR_PLAY = () => 'Play phrase';
        this.TOOLBAR_STOP = () => 'Stop playing phrase';
        this.TOOLBAR_SHUFFLE = () => 'Generate random phrase';
        this.TOOLBAR_SAVE = () => 'Save state to storage';
        this.TOOLBAR_LOAD = () => 'Recall state from storage';
        this.TOOLBAR_SETTINGS = () => 'Open settings';
        this.TITLE_COACH = (c) => `Click to change this coach ('${c}')`;
        this.TITLE_EXCUSE = () => 'Click to change this excuse';
        this.TITLE_INTEGER = (c) => `Click to change this number ('${c}')`;
        this.TITLE_NAMED = () => "Click to change this train's name";
        this.TITLE_OPT_OPEN = (t, r) => `Click to open this optional ${t} ('${r}')`;
        this.TITLE_OPT_CLOSE = (t, r) => `Click to close this optional ${t} ('${r}')`;
        this.TITLE_PHRASESET = (r) => `Click to change the phrase used in this section ('${r}')`;
        this.TITLE_PLATFORM = () => "Click to change this train's platform";
        this.TITLE_SERVICE = (c) => `Click to change this service ('${c}')`;
        this.TITLE_STATION = (c) => `Click to change this station ('${c}')`;
        this.TITLE_STATIONLIST = (c) => `Click to change this station list ('${c}')`;
        this.TITLE_TIME = (c) => `Click to change this time ('${c}')`;
        this.EDITOR_INIT = () => 'Please wait...';
        this.EDITOR_UNKNOWN_ELEMENT = (n) => `(UNKNOWN XML ELEMENT: ${n})`;
        this.EDITOR_UNKNOWN_PHRASE = (r) => `(UNKNOWN PHRASE: ${r})`;
        this.EDITOR_UNKNOWN_PHRASESET = (r) => `(UNKNOWN PHRASESET: ${r})`;
        this.PHRASER_TOO_RECURSIVE = () => 'Too many levels of recursion whilst processing phrase';
        this.HEADER_COACH = (c) => `Pick a coach letter for the '${c}' context`;
        this.HEADER_EXCUSE = () => 'Pick an excuse';
        this.HEADER_INTEGER = (c) => `Pick a number for the '${c}' context`;
        this.HEADER_NAMED = () => 'Pick a named train';
        this.HEADER_PHRASESET = (r) => `Pick a phrase for the '${r}' section`;
        this.HEADER_PLATFORM = () => 'Pick a platform';
        this.HEADER_SERVICE = (c) => `Pick a service for the '${c}' context`;
        this.HEADER_STATION = (c) => `Pick a station for the '${c}' context`;
        this.HEADER_STATIONLIST = (c) => `Build a station list for the '${c}' context`;
        this.HEADER_TIME = (c) => `Pick a time for the '${c}' context`;
        this.P_GENERIC_T = () => 'List of choices';
        this.P_GENERIC_PH = () => 'Filter choices...';
        this.P_COACH_T = () => 'Coach letter';
        this.P_EXCUSE_T = () => 'List of delay or cancellation excuses';
        this.P_EXCUSE_PH = () => 'Filter excuses...';
        this.P_EXCUSE_ITEM_T = () => 'Click to select this excuse';
        this.P_INT_T = () => 'Integer value';
        this.P_NAMED_T = () => 'List of train names';
        this.P_NAMED_PH = () => 'Filter train name...';
        this.P_NAMED_ITEM_T = () => 'Click to select this name';
        this.P_PSET_T = () => 'List of phrases';
        this.P_PSET_PH = () => 'Filter phrases...';
        this.P_PSET_ITEM_T = () => 'Click to select this phrase';
        this.P_PLAT_NUMBER_T = () => 'Platform number';
        this.P_PLAT_LETTER_T = () => 'Optional platform letter';
        this.P_SERV_T = () => 'List of service names';
        this.P_SERV_PH = () => 'Filter services...';
        this.P_SERV_ITEM_T = () => 'Click to select this service';
        this.P_STATION_T = () => 'List of station names';
        this.P_STATION_PH = () => 'Filter stations...';
        this.P_STATION_ITEM_T = () => 'Click to select or add this station';
        this.P_SL_ADD = () => 'Add station...';
        this.P_SL_ADD_T = () => 'Add station to this list';
        this.P_SL_CLOSE = () => 'Close';
        this.P_SL_CLOSE_T = () => 'Close this picker';
        this.P_SL_EMPTY = () => 'Please add at least one station to this list';
        this.P_SL_DRAG_T = () => 'Draggable selection of stations for this list';
        this.P_SL_DELETE = () => 'Drop here to delete';
        this.P_SL_DELETE_T = () => 'Drop station here to delete it from this list';
        this.P_SL_ITEM_T = () => 'Drag to reorder; double-click or drag into delete zone to remove';
        this.P_TIME_T = () => 'Time editor';
        this.P_COACH_MISSING_STATE = () => 'onChange fired for coach picker without state';
        this.P_INT_MISSING_STATE = () => 'onChange fired for integer picker without state';
        this.P_PSET_MISSING_STATE = () => 'onSelect fired for phraseset picker without state';
        this.P_SERVICE_MISSING_STATE = () => 'onSelect fired for service picker without state';
        this.P_TIME_MISSING_STATE = () => 'onChange fired for time picker without state';
        this.P_PSET_UNKNOWN = (r) => `Phraseset '${r}' doesn't exist`;
        this.P_SL_DRAG_MISSING = () => 'Draggable: Missing source elements for mirror event';
        this.ST_RESET = () => 'Reset to defaults';
        this.ST_RESET_T = () => 'Reset settings to defaults';
        this.ST_RESET_CONFIRM = () => 'Are you sure?';
        this.ST_RESET_CONFIRM_T = () => 'Confirm reset to defaults';
        this.ST_RESET_DONE = () => 'Settings have been reset to their defaults, and deleted from storage.';
        this.ST_SAVE = () => 'Save & close';
        this.ST_SAVE_T = () => 'Save and close settings';
        this.ST_SPEECH = () => 'Speech';
        this.ST_SPEECH_CHOICE = () => 'Voice';
        this.ST_SPEECH_EMPTY = () => 'None available';
        this.ST_SPEECH_VOL = () => 'Volume';
        this.ST_SPEECH_PITCH = () => 'Pitch';
        this.ST_SPEECH_RATE = () => 'Rate';
        this.ST_SPEECH_TEST = () => 'Test speech';
        this.ST_SPEECH_TEST_T = () => 'Play a speech sample with the current settings';
        this.ST_LEGAL = () => 'Legal & Acknowledgements';
        this.WARN_SHORT_HEADER = () => '"May I have your attention please..."';
        this.WARN_SHORT = () => 'This display is too short to support RAG. Please make this window taller, or' +
            ' rotate your device from landscape to portrait.';
        // TODO: These don't fit here; this should go in the data
        this.LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        this.DIGITS = [
            'zero', 'one', 'two', 'three', 'four', 'five', 'six',
            'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
            'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'ninteen', 'twenty'
        ];
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/**
 * Holds methods for processing each type of phrase element into HTML, with data taken
 * from the current state. Each method takes a context object, holding data for the
 * current XML element being processed and the XML document being used.
 */
class ElementProcessors {
    /** Fills in coach letters from A to Z */
    static coach(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        ctx.newElement.title = L.TITLE_COACH(context);
        ctx.newElement.textContent = RAG.state.getCoach(context);
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in the excuse, for a delay or cancellation */
    static excuse(ctx) {
        ctx.newElement.title = L.TITLE_EXCUSE();
        ctx.newElement.textContent = RAG.state.excuse;
    }
    /** Fills in integers, optionally with nouns and in word form */
    static integer(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        let singular = ctx.xmlElement.getAttribute('singular');
        let plural = ctx.xmlElement.getAttribute('plural');
        let words = ctx.xmlElement.getAttribute('words');
        let int = RAG.state.getInteger(context);
        let intStr = (words && words.toLowerCase() === 'true')
            ? L.DIGITS[int] || int.toString()
            : int.toString();
        if (int === 1 && singular)
            intStr += ` ${singular}`;
        else if (int !== 1 && plural)
            intStr += ` ${plural}`;
        ctx.newElement.title = L.TITLE_INTEGER(context);
        ctx.newElement.textContent = intStr;
        ctx.newElement.dataset['context'] = context;
        if (singular)
            ctx.newElement.dataset['singular'] = singular;
        if (plural)
            ctx.newElement.dataset['plural'] = plural;
        if (words)
            ctx.newElement.dataset['words'] = words;
    }
    /** Fills in the named train */
    static named(ctx) {
        ctx.newElement.title = L.TITLE_NAMED();
        ctx.newElement.textContent = RAG.state.named;
    }
    /** Includes a previously defined phrase, by its `id` */
    static phrase(ctx) {
        let ref = DOM.requireAttr(ctx.xmlElement, 'ref');
        let phrase = RAG.database.getPhrase(ref);
        ctx.newElement.title = '';
        ctx.newElement.dataset['ref'] = ref;
        if (!phrase) {
            ctx.newElement.textContent = L.EDITOR_UNKNOWN_PHRASE(ref);
            return;
        }
        // Handle phrases with a chance value as collapsible
        if (ctx.xmlElement.hasAttribute('chance'))
            this.makeCollapsible(ctx, phrase, ref);
        else
            DOM.cloneInto(phrase, ctx.newElement);
    }
    /** Includes a phrase from a previously defined phraseset, by its `id` */
    static phraseset(ctx) {
        let ref = DOM.requireAttr(ctx.xmlElement, 'ref');
        let phraseset = RAG.database.getPhraseset(ref);
        ctx.newElement.dataset['ref'] = ref;
        if (!phraseset) {
            ctx.newElement.textContent = L.EDITOR_UNKNOWN_PHRASESET(ref);
            return;
        }
        let idx = RAG.state.getPhrasesetIdx(ref);
        let phrase = phraseset.children[idx];
        ctx.newElement.dataset['idx'] = idx.toString();
        ctx.newElement.title = L.TITLE_PHRASESET(ref);
        // Handle phrasesets with a chance value as collapsible
        if (ctx.xmlElement.hasAttribute('chance'))
            this.makeCollapsible(ctx, phrase, ref);
        else
            DOM.cloneInto(phrase, ctx.newElement);
    }
    /** Fills in the current platform */
    static platform(ctx) {
        ctx.newElement.title = L.TITLE_PLATFORM();
        ctx.newElement.textContent = RAG.state.platform.join('');
    }
    /** Fills in the rail network name */
    static service(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        ctx.newElement.title = L.TITLE_SERVICE(context);
        ctx.newElement.textContent = RAG.state.getService(context);
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in station names */
    static station(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        let code = RAG.state.getStation(context);
        ctx.newElement.title = L.TITLE_STATION(context);
        ctx.newElement.textContent = RAG.database.getStation(code);
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in station lists */
    static stationlist(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        let stations = RAG.state.getStationList(context).slice();
        let stationList = Strings.fromStationList(stations, context);
        ctx.newElement.title = L.TITLE_STATIONLIST(context);
        ctx.newElement.textContent = stationList;
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in the time */
    static time(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        ctx.newElement.title = L.TITLE_TIME(context);
        ctx.newElement.textContent = RAG.state.getTime(context);
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in vox parts */
    static vox(ctx) {
        let key = DOM.requireAttr(ctx.xmlElement, 'key');
        // TODO: Localize
        ctx.newElement.textContent = ctx.xmlElement.textContent;
        ctx.newElement.title = `Click to edit this phrase (${key})`;
        ctx.newElement.dataset['key'] = key;
    }
    /** Handles unknown elements with an inline error message */
    static unknown(ctx) {
        let name = ctx.xmlElement.nodeName;
        ctx.newElement.textContent = L.EDITOR_UNKNOWN_ELEMENT(name);
    }
    /**
     * Clones the children of the given element into a new inner span tag, so that they
     * can be made collapsible. Appends it to the new element being processed.
     */
    static makeCollapsible(ctx, source, ref) {
        let chance = ctx.xmlElement.getAttribute('chance');
        let inner = document.createElement('span');
        let toggle = document.createElement('span');
        let collapsed = RAG.state.getCollapsed(ref, parseInt(chance));
        inner.classList.add('inner');
        toggle.classList.add('toggle');
        DOM.cloneInto(source, inner);
        ctx.newElement.dataset['chance'] = chance;
        Collapsibles.set(ctx.newElement, toggle, collapsed);
        ctx.newElement.appendChild(toggle);
        ctx.newElement.appendChild(inner);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/**
 * Handles the transformation of phrase XML data, into HTML elements with their data
 * filled in and their UI logic wired.
 */
class Phraser {
    /**
     * Recursively processes XML elements, filling in data and applying transforms.
     *
     * @param container Parent to process the children of
     * @param level Current level of recursion, max. 20
     */
    process(container, level = 0) {
        // Initially, this method was supposed to just add the XML elements directly into
        // the document. However, this caused a lot of problems (e.g. title not working).
        // HTML does not work really well with custom elements, especially if they are of
        // another XML namespace.
        let pending = container.querySelectorAll(':not(span)');
        // No more XML elements to expand
        if (pending.length === 0)
            return;
        // For each XML element currently in the container:
        // * Create a new span element for it
        // * Have the processors take data from the XML element, to populate the new one
        // * Replace the XML element with the new one
        pending.forEach(element => {
            let elementName = element.nodeName.toLowerCase();
            let newElement = document.createElement('span');
            let context = {
                xmlElement: element,
                newElement: newElement
            };
            newElement.dataset['type'] = elementName;
            // If the element is vox hintable, add the vox hint
            if (element.hasAttribute('vox'))
                newElement.dataset['vox'] = element.getAttribute('vox');
            // I wanted to use an index on ElementProcessors for this, but it caused every
            // processor to have an "unused method" warning.
            switch (elementName) {
                case 'coach':
                    ElementProcessors.coach(context);
                    break;
                case 'excuse':
                    ElementProcessors.excuse(context);
                    break;
                case 'integer':
                    ElementProcessors.integer(context);
                    break;
                case 'named':
                    ElementProcessors.named(context);
                    break;
                case 'phrase':
                    ElementProcessors.phrase(context);
                    break;
                case 'phraseset':
                    ElementProcessors.phraseset(context);
                    break;
                case 'platform':
                    ElementProcessors.platform(context);
                    break;
                case 'service':
                    ElementProcessors.service(context);
                    break;
                case 'station':
                    ElementProcessors.station(context);
                    break;
                case 'stationlist':
                    ElementProcessors.stationlist(context);
                    break;
                case 'time':
                    ElementProcessors.time(context);
                    break;
                case 'vox':
                    ElementProcessors.vox(context);
                    break;
                default:
                    ElementProcessors.unknown(context);
                    break;
            }
            element.parentElement.replaceChild(newElement, element);
        });
        // Recurse so that we can expand any new elements
        if (level < 20)
            this.process(container, level + 1);
        else
            throw Error(L.PHRASER_TOO_RECURSIVE());
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Custom voice that synthesizes speech by piecing pre-recorded files together */
class CustomVoice {
    constructor(id, lang) {
        this.default = false;
        this.localService = false;
        this.name = id;
        this.lang = lang;
        this.voiceURI = `${CustomVoice.basePath}/${id}_${lang}`;
    }
}
/** Changeable base path for all custom voices */
CustomVoice.basePath = 'data/vox';
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility class for resolving a given phrase to vox keys */
class Resolver {
    /** TreeWalker filter to reduce a walk to just the elements the resolver needs */
    static nodeFilter(node) {
        let parent = node.parentElement;
        let parentType = parent.dataset['type'];
        // If type is missing, parent is a wrapper
        if (!parentType) {
            parent = parent.parentElement;
            parentType = parent.dataset['type'];
        }
        // Accept text only from phrase and phrasesets
        if (node.nodeType === Node.TEXT_NODE)
            if (parentType !== 'phraseset' && parentType !== 'phrase')
                return NodeFilter.FILTER_SKIP;
        if (node.nodeType === Node.ELEMENT_NODE) {
            let element = node;
            let type = element.dataset['type'];
            // Reject collapsed elements and their children
            if (element.hasAttribute('collapsed'))
                return NodeFilter.FILTER_REJECT;
            // Skip typeless (wrapper) elements
            if (!type)
                return NodeFilter.FILTER_SKIP;
            // Skip over phrase and phrasesets (instead, only going for their children)
            if (type === 'phraseset' || type === 'phrase')
                return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
    }
    constructor(phrase) {
        this.phrase = phrase;
        this.flattened = [];
        this.resolved = [];
    }
    toVox() {
        // First, walk through the phrase and "flatten" it into an array of parts. This is
        // so the resolver can look-ahead or look-behind.
        this.flattened = [];
        this.resolved = [];
        let treeWalker = document.createTreeWalker(this.phrase, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: Resolver.nodeFilter }, false);
        while (treeWalker.nextNode())
            if (treeWalker.currentNode.textContent.trim() !== '')
                this.flattened.push(treeWalker.currentNode);
        // Then, resolve all the phrases' nodes into vox keys
        this.flattened.forEach((v, i) => this.resolved.push(...this.resolve(v, i)));
        console.log(this.flattened, this.resolved);
        return this.resolved;
    }
    /**
     * Uses the type and value of the given node, to resolve it to vox file IDs.
     *
     * @param node Node to resolve to vox IDs
     * @param idx Index of the node being resolved relative to the phrase array
     * @returns Array of IDs that make up one or more file IDs. Can be empty.
     */
    resolve(node, idx) {
        if (node.nodeType === Node.TEXT_NODE)
            return this.resolveText(node);
        let element = node;
        let type = element.dataset['type'];
        switch (type) {
            case 'coach': return this.resolveCoach(element, idx);
            case 'excuse': return this.resolveExcuse(idx);
            case 'integer': return this.resolveInteger(element);
            case 'named': return this.resolveNamed();
            case 'platform': return this.resolvePlatform(idx);
            case 'service': return this.resolveService(element);
            case 'station': return this.resolveStation(element, idx);
            case 'stationlist': return this.resolveStationList(element, idx);
            case 'time': return this.resolveTime(element);
            case 'vox': return this.resolveVox(element);
        }
        return [];
    }
    getInflection(idx) {
        let next = this.flattened[idx + 1];
        return (next && next.textContent.trim().startsWith('.'))
            ? 'end'
            : 'mid';
    }
    resolveText(node) {
        let parent = node.parentElement;
        let type = parent.dataset['type'];
        let text = Strings.clean(node.textContent);
        let set = [];
        // If text is just a full stop, return silence
        if (text === '.')
            return [0.5];
        // If it begins with a full stop, add silence
        if (text.startsWith('.'))
            set.push(0.5);
        // If the text doesn't contain any words, skip
        if (!text.match(/[a-z0-9]/i))
            return set;
        // If type is missing, parent is a wrapper
        if (!type) {
            parent = parent.parentElement;
            type = parent.dataset['type'];
        }
        let ref = parent.dataset['ref'];
        let idx = DOM.nodeIndexOf(node);
        let id = `${type}.${ref}`;
        // Append index of phraseset's choice of phrase
        if (type === 'phraseset')
            id += `.${parent.dataset['idx']}`;
        id += `.${idx}`;
        set.push(id);
        // If text ends with a full stop, add silence
        if (text.endsWith('.'))
            set.push(0.5);
        return set;
    }
    resolveCoach(element, idx) {
        let ctx = element.dataset['context'];
        let coach = RAG.state.getCoach(ctx);
        let inflect = this.getInflection(idx);
        let result = [0.2, `letter.${coach}.${inflect}`];
        if (inflect === 'mid')
            result.push(0.2);
        return result;
    }
    resolveExcuse(idx) {
        let excuse = RAG.state.excuse;
        let key = Strings.filename(excuse);
        let inflect = this.getInflection(idx);
        let result = [0.2, `excuse.${key}.${inflect}`];
        if (inflect === 'mid')
            result.push(0.2);
        return result;
    }
    resolveInteger(element) {
        let ctx = element.dataset['context'];
        let singular = element.dataset['singular'];
        let plural = element.dataset['plural'];
        let integer = RAG.state.getInteger(ctx);
        let parts = [0.2, `number.${integer}.mid`];
        if (singular && integer === 1)
            parts.push(0.2, `number.suffix.${singular}.end`);
        else if (plural && integer !== 1)
            parts.push(0.2, `number.suffix.${plural}.end`);
        return parts;
    }
    resolveNamed() {
        let named = Strings.filename(RAG.state.named);
        return [0.2, `named.${named}.mid`, 0.2];
    }
    resolvePlatform(idx) {
        let platform = RAG.state.platform;
        let inflect = this.getInflection(idx);
        let result = [0.2, `number.${platform[0]}${platform[1]}.${inflect}`];
        if (inflect === 'mid')
            result.push(0.2);
        return result;
    }
    resolveService(element) {
        let ctx = element.dataset['context'];
        let service = Strings.filename(RAG.state.getService(ctx));
        return [0.1, `service.${service}.mid`, 0.1];
    }
    resolveStation(element, idx) {
        let ctx = element.dataset['context'];
        let station = RAG.state.getStation(ctx);
        let inflect = this.getInflection(idx);
        let result = [0.2, `station.${station}.${inflect}`];
        if (inflect === 'mid')
            result.push(0.2);
        return result;
    }
    resolveStationList(element, idx) {
        let ctx = element.dataset['context'];
        let list = RAG.state.getStationList(ctx);
        let inflect = this.getInflection(idx);
        let parts = [0.25];
        list.forEach((v, k) => {
            // Handle middle of list inflection
            if (k !== list.length - 1) {
                parts.push(`station.${v}.mid`, 0.25);
                return;
            }
            // Add "and" if list has more than 1 station and this is the end
            if (list.length > 1)
                parts.push('station.parts.and.mid', 0.2);
            // Add "only" if only one station in the calling list
            if (list.length === 1 && ctx === 'calling') {
                parts.push(`station.${v}.mid`);
                parts.push(0.2, 'station.parts.only.end');
            }
            else
                parts.push(`station.${v}.${inflect}`);
        });
        return [...parts, 0.2];
    }
    resolveTime(element) {
        let ctx = element.dataset['context'];
        let time = RAG.state.getTime(ctx).split(':');
        let parts = [0.2];
        if (time[0] === '00' && time[1] === '00')
            return [...parts, 'number.0000.mid'];
        // Hours
        parts.push(`number.${time[0]}.begin`);
        if (time[1] === '00')
            parts.push('number.hundred.mid');
        else
            parts.push(0.2, `number.${time[1]}.mid`);
        return [...parts, 0.15];
    }
    resolveVox(element) {
        let text = element.innerText.trim();
        let result = [];
        if (text.startsWith('.'))
            result.push(0.5);
        result.push(element.dataset['key']);
        if (text.endsWith('.'))
            result.push(0.5);
        return result;
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Manages speech synthesis using both native and custom engines */
class Speech {
    constructor() {
        /** Array of browser-provided voices available */
        this.browserVoices = [];
        /** Array of custom pre-recorded voices available */
        this.customVoices = [];
        // Some browsers don't properly cancel speech on page close.
        // BUG: onpageshow and onpagehide not working on iOS 11
        window.onbeforeunload =
            window.onunload =
                window.onpageshow =
                    window.onpagehide = this.cancel.bind(this);
        document.onvisibilitychange = this.onVisibilityChange.bind(this);
        window.speechSynthesis.onvoiceschanged = this.onVoicesChanged.bind(this);
        // Even though 'onvoiceschanged' is used later to populate the list, Chrome does
        // not actually fire the event until this call...
        this.onVoicesChanged();
        // TODO: Make this a dynamic registration and check for features
        this.voxEngine = new VoxEngine();
        this.customVoices.push(new CustomVoice('Test', 'en-GB'));
        this.customVoices.push(new CustomVoice('Roy', 'en-GB'));
        this.customVoices.push(new CustomVoice('RoyRaw', 'en-GB'));
    }
    /** Gets all the voices currently available */
    getVoices() {
        return this.customVoices.concat(this.browserVoices);
    }
    /** Begins speaking the given phrase components */
    speak(phrase, settings = {}) {
        // Reset to first voice, if configured choice is missing
        let voices = this.getVoices();
        let voiceIdx = either(settings.voiceIdx, RAG.config.speechVoice);
        let voice = voices[voiceIdx] || voices[0];
        let engine = (voice instanceof CustomVoice)
            ? this.speakCustom.bind(this)
            : this.speakBrowser.bind(this);
        engine(phrase, voice, settings);
    }
    /** Stops and cancels all queued speech */
    cancel() {
        window.speechSynthesis.cancel();
        this.voxEngine.stop();
    }
    /** Pause and unpause speech if the page is hidden or unhidden */
    onVisibilityChange() {
        let hiding = (document.visibilityState === 'hidden');
        if (hiding)
            window.speechSynthesis.pause();
        else
            window.speechSynthesis.resume();
    }
    /** Handles async voice list loading on some browsers, and sets default */
    onVoicesChanged() {
        this.browserVoices = window.speechSynthesis.getVoices();
    }
    /**
     * Converts the given phrase to text and speaks it via native browser voices.
     *
     * @param phrase Phrase elements to speak
     * @param voice Browser voice to use
     * @param settings Settings to use for the voice
     */
    speakBrowser(phrase, voice, settings) {
        // The phrase text is split into sentences, as queueing large sentences that last
        // many seconds can break some TTS engines and browsers.
        let text = DOM.getCleanedVisibleText(phrase);
        let parts = text.split(/\.\s/i);
        RAG.speech.cancel();
        parts.forEach((segment, idx) => {
            // Add missing full stop to each sentence except the last, which has it
            if (idx < parts.length - 1)
                segment += '.';
            let utterance = new SpeechSynthesisUtterance(segment);
            utterance.voice = voice;
            utterance.volume = either(settings.volume, RAG.config.speechVol);
            utterance.pitch = either(settings.pitch, RAG.config.speechPitch);
            utterance.rate = either(settings.rate, RAG.config.speechRate);
            window.speechSynthesis.speak(utterance);
        });
    }
    /**
     * Synthesizes voice by walking through the given phrase elements, resolving parts to
     * sound file IDs, and feeding the entire array to the vox engine.
     *
     * @param phrase Phrase elements to speak
     * @param voice Custom voice to use
     * @param settings Settings to use for the voice
     */
    speakCustom(phrase, voice, settings) {
        // TODO: use volume settings
        let resolver = new Resolver(phrase);
        this.voxEngine.speak(resolver.toVox(), voice, settings);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Synthesizes speech by dynamically loading and piecing together voice files */
class VoxEngine {
    constructor(reverb = 'data/vox') {
        // Setup the core audio context
        /** Whether this engine is currently running and speaking */
        this.isSpeaking = false;
        /** Reference number for the current pump timer */
        this.pumpTimer = 0;
        /** Tracks the audio context's wall-clock time to schedule next clip */
        this.nextBegin = 0;
        /** References to currently pending requests, as a FIFO queue */
        this.pendingReqs = [];
        /** References to currently scheduled audio buffers */
        this.scheduledBuffers = [];
        // @ts-ignore
        let AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
        // Setup tannoy filter
        this.audioFilter = this.audioContext.createBiquadFilter();
        this.audioFilter.type = 'highpass';
        this.audioFilter.Q.value = 0.4;
        this.audioFilter.connect(this.audioContext.destination);
        // Setup reverb
        // TODO: Make this user configurable and choosable
        fetch(`${reverb}/ir.stalbans_a_mono.wav`)
            .then(res => res.arrayBuffer())
            .then(buf => Sounds.decode(this.audioContext, buf))
            .then(rev => {
            this.audioReverb = this.audioContext.createConvolver();
            this.audioReverb.buffer = rev;
            this.audioReverb.normalize = true;
            this.audioFilter.connect(this.audioReverb);
            this.audioReverb.connect(this.audioContext.destination);
            console.debug('VOX REVERB LOADED');
        });
    }
    /**
     * Begins loading and speaking a set of vox files. Stops any speech.
     *
     * @param ids List of vox ids to load as files, in speaking order
     * @param voice Custom voice to use
     * @param settings Voice settings to use
     */
    speak(ids, voice, settings) {
        console.debug('VOX SPEAK:', ids, voice, settings);
        if (this.isSpeaking)
            this.stop();
        this.isSpeaking = true;
        this.currentIds = ids;
        this.currentVoice = voice;
        this.currentSettings = settings;
        // Begin the pump loop. On iOS, the context may have to be resumed first
        if (this.audioContext.state === 'suspended')
            this.audioContext.resume().then(() => this.pump());
        else
            this.pump();
    }
    /** Stops playing any currently spoken speech and resets state */
    stop() {
        // Stop pumping
        clearTimeout(this.pumpTimer);
        this.isSpeaking = false;
        // Cancel all pending requests
        this.pendingReqs.forEach(r => r.cancel());
        // Kill and dereference any currently playing file
        this.scheduledBuffers.forEach(node => {
            node.stop();
            node.disconnect();
        });
        this.nextBegin = 0;
        this.currentIds = undefined;
        this.currentVoice = undefined;
        this.currentSettings = undefined;
        this.pendingReqs = [];
        this.scheduledBuffers = [];
        console.debug('VOX STOPPED');
    }
    /**
     * Pumps the speech queue, by keeping up to 10 fetch requests for voice files going,
     * and then feeding their data (in enforced order) to the audio chain, one at a time.
     */
    pump() {
        // If the engine has stopped, do not proceed.
        if (!this.isSpeaking || !this.currentIds || !this.currentVoice)
            return;
        // First, schedule fulfilled requests into the audio buffer, in FIFO order
        this.schedule();
        // Then, fill any free pending slots with new requests
        let nextDelay = 0;
        while (this.currentIds[0] && this.pendingReqs.length < 10) {
            let key = this.currentIds.shift();
            // If this key is a number, it's an amount of silence, so add it as the
            // playback delay for the next playable request (if any).
            if (typeof key === 'number') {
                nextDelay += key;
                continue;
            }
            let path = `${this.currentVoice.voiceURI}/${key}.mp3`;
            this.pendingReqs.push(new VoxRequest(path, nextDelay, this.audioContext));
            nextDelay = 0;
        }
        // Stop pumping when we're out of IDs to queue and nothing is playing
        if (this.currentIds.length <= 0)
            if (this.pendingReqs.length <= 0)
                if (this.scheduledBuffers.length <= 0)
                    return this.stop();
        this.pumpTimer = setTimeout(this.pump.bind(this), 100);
    }
    schedule() {
        // Stop scheduling if there are no pending requests
        if (!this.pendingReqs[0] || !this.pendingReqs[0].isDone)
            return;
        // Don't schedule if more than 5 nodes are, as not to blow any buffers
        if (this.scheduledBuffers.length > 5)
            return;
        let req = this.pendingReqs.shift();
        // If the next request errored out (buffer missing), skip it
        // TODO: Replace with silence?
        if (!req.buffer) {
            console.log('VOX CLIP SKIPPED:', req.path);
            return this.schedule();
        }
        // If this is the first clip being played, start from current wall-clock
        if (this.nextBegin === 0)
            this.nextBegin = this.audioContext.currentTime;
        console.log('VOX CLIP PLAYING:', req.path, req.buffer.duration, this.nextBegin);
        let node = this.audioContext.createBufferSource();
        let latency = this.audioContext.baseLatency + 0.15;
        let delay = req.delay;
        node.buffer = req.buffer;
        node.playbackRate.value = 0.98;
        node.connect(this.audioFilter);
        node.start(this.nextBegin + delay);
        this.scheduledBuffers.push(node);
        this.nextBegin += (node.buffer.duration + delay - latency);
        // Have this buffer node remove itself from the schedule when done
        node.onended = _ => {
            console.log('VOX CLIP ENDED:', req.path);
            let idx = this.scheduledBuffers.indexOf(node);
            if (idx !== -1)
                this.scheduledBuffers.splice(idx, 1);
        };
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Represents a request for a vox file, immediately begun on creation */
class VoxRequest {
    constructor(path, delay, context) {
        /** Whether this request is done and ready for handling (even if failed) */
        this.isDone = false;
        console.debug('VOX REQUEST:', path);
        this.context = context;
        this.path = path;
        this.delay = delay;
        fetch(path)
            .then(this.onFulfill.bind(this))
            .catch(this.onError.bind(this));
    }
    /** Cancels this request from proceeding any further */
    cancel() {
        // TODO: Cancellation controllers
    }
    /** Begins decoding the loaded MP3 voice file to raw audio data */
    onFulfill(res) {
        if (!res.ok)
            throw Error(`VOX NOT FOUND: ${res.status} @ ${this.path}`);
        res.arrayBuffer().then(this.onArrayBuffer.bind(this));
    }
    /** Takes the array buffer from the fulfilled fetch and decodes it */
    onArrayBuffer(buffer) {
        Sounds.decode(this.context, buffer)
            .then(this.onDecode.bind(this))
            .catch(this.onError.bind(this));
    }
    /** Called when the fetched buffer is decoded successfully */
    onDecode(buffer) {
        this.buffer = buffer;
        this.isDone = true;
    }
    /** Called if the fetch or decode stages fail */
    onError(err) {
        console.log('REQUEST FAIL:', err);
        this.isDone = true;
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the phrase editor */
class Editor {
    constructor() {
        this.dom = DOM.require('#editor');
        document.body.onclick = this.onClick.bind(this);
        window.onresize = this.onResize.bind(this);
        this.dom.onscroll = this.onScroll.bind(this);
        this.dom.textContent = L.EDITOR_INIT();
    }
    /** Replaces the editor with a root phraseset reference, and expands it into HTML */
    generate() {
        this.dom.innerHTML = '<phraseset ref="root" />';
        RAG.phraser.process(this.dom);
        // For scroll-past padding under the phrase
        let padding = document.createElement('span');
        padding.className = 'bottomPadding';
        this.dom.appendChild(padding);
    }
    /** Reprocesses all phraseset elements of the given ref, if their index has changed */
    refreshPhraseset(ref) {
        // Note, this could potentially bug out if a phraseset's descendant references
        // the same phraseset (recursion). But this is okay because phrasesets should
        // never include themselves, even eventually.
        this.dom.querySelectorAll(`span[data-type=phraseset][data-ref=${ref}]`)
            .forEach(_ => {
            let element = _;
            let newElement = document.createElement('phraseset');
            let chance = element.dataset['chance'];
            newElement.setAttribute('ref', ref);
            if (chance)
                newElement.setAttribute('chance', chance);
            element.parentElement.replaceChild(newElement, element);
            RAG.phraser.process(newElement.parentElement);
        });
    }
    /**
     * Gets a static NodeList of all phrase elements of the given query.
     *
     * @param query Query string to add onto the `span` selector
     * @returns Node list of all elements matching the given span query
     */
    getElementsByQuery(query) {
        return this.dom.querySelectorAll(`span${query}`);
    }
    /** Gets the current phrase's root DOM element */
    getPhrase() {
        return this.dom.firstElementChild;
    }
    /** Gets the current phrase in the editor as text, excluding the hidden parts */
    getText() {
        return DOM.getCleanedVisibleText(this.dom);
    }
    /**
     * Finds all phrase elements of the given type, and sets their text to given value.
     *
     * @param type Original XML name of elements to replace contents of
     * @param value New text for the found elements to set
     */
    setElementsText(type, value) {
        this.getElementsByQuery(`[data-type=${type}]`)
            .forEach(element => element.textContent = value);
    }
    /** Closes any currently open editor dialogs */
    closeDialog() {
        if (this.currentPicker)
            this.currentPicker.close();
        if (this.domEditing) {
            this.domEditing.removeAttribute('editing');
            this.domEditing.classList.remove('above', 'below');
        }
        this.currentPicker = undefined;
        this.domEditing = undefined;
    }
    /** Handles a click anywhere in the window depending on the context */
    onClick(ev) {
        let target = ev.target;
        let type = target ? target.dataset['type'] : undefined;
        let picker = type ? RAG.views.getPicker(type) : undefined;
        if (!target)
            return this.closeDialog();
        // Redirect clicks of inner elements
        if (target.classList.contains('inner') && target.parentElement) {
            target = target.parentElement;
            type = target.dataset['type'];
            picker = type ? RAG.views.getPicker(type) : undefined;
        }
        // Ignore clicks to any inner document or unowned element
        if (!document.body.contains(target))
            return;
        // Ignore clicks to any element of already open pickers
        if (this.currentPicker)
            if (this.currentPicker.dom.contains(target))
                return;
        // Cancel any open editors
        let prevTarget = this.domEditing;
        this.closeDialog();
        // If clicking the element already being edited, don't reopen
        if (target === prevTarget)
            return;
        // Handle collapsible elements
        if (target.classList.contains('toggle'))
            this.toggleCollapsiable(target);
        // Find and open picker for the target element
        else if (type && picker)
            this.openPicker(target, picker);
    }
    /** Re-layout the currently open picker on resize */
    onResize(_) {
        if (this.currentPicker)
            this.currentPicker.layout();
    }
    /** Re-layout the currently open picker on scroll */
    onScroll(_) {
        if (!this.currentPicker)
            return;
        // Workaround for layout behaving weird when iOS keyboard is open
        if (DOM.isMobile)
            if (this.currentPicker.hasFocus())
                DOM.blurActive();
        this.currentPicker.layout();
    }
    /**
     * Flips the collapse state of a collapsible, and propagates the new state to other
     * collapsibles of the same reference.
     *
     * @param target Collapsible element being toggled
     */
    toggleCollapsiable(target) {
        let parent = target.parentElement;
        let ref = DOM.requireData(parent, 'ref');
        let type = DOM.requireData(parent, 'type');
        let collapased = parent.hasAttribute('collapsed');
        // Propagate new collapse state to all collapsibles of the same ref
        this.dom.querySelectorAll(`span[data-type=${type}][data-ref=${ref}]`)
            .forEach(_ => {
            let phraseset = _;
            let toggle = phraseset.children[0];
            // Skip same-ref elements that aren't collapsible
            if (!toggle || !toggle.classList.contains('toggle'))
                return;
            Collapsibles.set(phraseset, toggle, !collapased);
            // Don't move this to setCollapsible, as state save/load is handled
            // outside in both usages of setCollapsible.
            RAG.state.setCollapsed(ref, !collapased);
        });
    }
    /**
     * Opens a picker for the given element.
     *
     * @param target Editor element to open the picker for
     * @param picker Picker to open
     */
    openPicker(target, picker) {
        target.setAttribute('editing', 'true');
        this.currentPicker = picker;
        this.domEditing = target;
        picker.open(target);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the scrolling marquee */
class Marquee {
    constructor() {
        /** Reference ID for the scrolling animation timer */
        this.timer = 0;
        /** Current offset (in pixels) of the scrolling marquee */
        this.offset = 0;
        this.dom = DOM.require('#marquee');
        this.domSpan = document.createElement('span');
        this.dom.innerHTML = '';
        this.dom.appendChild(this.domSpan);
    }
    /** Sets the message on the scrolling marquee, and starts animating it */
    set(msg, animate = true) {
        window.cancelAnimationFrame(this.timer);
        this.domSpan.textContent = msg;
        if (!animate)
            return;
        // I tried to use CSS animation for this, but couldn't figure out how for a
        // dynamically sized element like the span.
        this.offset = this.dom.clientWidth;
        let limit = -this.domSpan.clientWidth - 100;
        let anim = () => {
            this.offset -= 6;
            this.domSpan.style.transform = `translateX(${this.offset}px)`;
            if (this.offset < limit)
                this.domSpan.style.transform = '';
            else
                this.timer = window.requestAnimationFrame(anim);
        };
        window.requestAnimationFrame(anim);
    }
    /** Stops the current marquee animation */
    stop() {
        window.cancelAnimationFrame(this.timer);
        this.domSpan.style.transform = '';
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the settings screen */
class Settings {
    constructor() {
        // General settings form
        this.dom = DOM.require('#settingsScreen');
        this.btnReset = DOM.require('#btnResetSettings');
        this.btnSave = DOM.require('#btnSaveSettings');
        this.btnReset.onclick = this.handleReset.bind(this);
        this.btnSave.onclick = this.handleSave.bind(this);
        // Speech form
        this.selSpeechVoice = DOM.require('#selSpeechChoice');
        this.rangeSpeechVol = DOM.require('#rangeSpeechVol');
        this.rangeSpeechPitch = DOM.require('#rangeSpeechPitch');
        this.rangeSpeechRate = DOM.require('#rangeSpeechRate');
        this.btnSpeechTest = DOM.require('#btnSpeechTest');
        this.btnSpeechTest.onclick = this.handleVoiceTest.bind(this);
        // Legal and acknowledgements
        Linkdown.parse(DOM.require('#legalBlock'));
    }
    /** Opens the settings screen */
    open() {
        this.dom.classList.remove('hidden');
        // The voice list has to be populated each open, in case it changes
        this.populateVoiceList();
        this.selSpeechVoice.selectedIndex = RAG.config.speechVoice;
        this.rangeSpeechVol.valueAsNumber = RAG.config.speechVol;
        this.rangeSpeechPitch.valueAsNumber = RAG.config.speechPitch;
        this.rangeSpeechRate.valueAsNumber = RAG.config.speechRate;
        this.btnSave.focus();
    }
    /** Closes the settings screen */
    close() {
        this.cancelReset();
        RAG.speech.cancel();
        this.dom.classList.add('hidden');
        DOM.blurActive(this.dom);
    }
    /** Clears and populates the voice list */
    populateVoiceList() {
        this.selSpeechVoice.innerHTML = '';
        let voices = RAG.speech.getVoices();
        // Handle empty list
        if (voices.length <= 0) {
            let option = DOM.addOption(this.selSpeechVoice, L.ST_SPEECH_EMPTY());
            option.disabled = true;
        }
        // https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
        else
            for (let i = 0; i < voices.length; i++)
                DOM.addOption(this.selSpeechVoice, `${voices[i].name} (${voices[i].lang})`);
    }
    /** Handles the reset button, with a confirm step that cancels after 15 seconds */
    handleReset() {
        if (!this.resetTimeout) {
            this.resetTimeout = setTimeout(this.cancelReset.bind(this), 15000);
            this.btnReset.innerText = L.ST_RESET_CONFIRM();
            this.btnReset.title = L.ST_RESET_CONFIRM_T();
            return;
        }
        RAG.config.reset();
        RAG.speech.cancel();
        this.cancelReset();
        this.open();
        alert(L.ST_RESET_DONE());
    }
    /** Cancel the reset timeout and restore the reset button to normal */
    cancelReset() {
        window.clearTimeout(this.resetTimeout);
        this.btnReset.innerText = L.ST_RESET();
        this.btnReset.title = L.ST_RESET_T();
        this.resetTimeout = undefined;
    }
    /** Handles the save button, saving config to storage */
    handleSave() {
        RAG.config.speechVoice = this.selSpeechVoice.selectedIndex;
        RAG.config.speechVol = parseFloat(this.rangeSpeechVol.value);
        RAG.config.speechPitch = parseFloat(this.rangeSpeechPitch.value);
        RAG.config.speechRate = parseFloat(this.rangeSpeechRate.value);
        RAG.config.save();
        this.close();
    }
    /** Handles the speech test button, speaking a test phrase */
    handleVoiceTest(ev) {
        ev.preventDefault();
        RAG.speech.cancel();
        this.btnSpeechTest.disabled = true;
        // Has to execute on a delay, as speech cancel is unreliable without it
        window.setTimeout(() => {
            this.btnSpeechTest.disabled = false;
            let time = Strings.fromTime(new Date());
            let phrase = document.createElement('span');
            // TODO: Use the phraseset document for this
            phrase.innerHTML = '<span data-type="phrase" data-ref="sample">' +
                'This is a test of the Rail Announcement Generator at' +
                '<span data-type="time">' + time + '</span>' +
                '</span>';
            RAG.speech.speak(phrase.firstElementChild, {
                voiceIdx: this.selSpeechVoice.selectedIndex,
                volume: this.rangeSpeechVol.valueAsNumber,
                pitch: this.rangeSpeechPitch.valueAsNumber,
                rate: this.rangeSpeechRate.valueAsNumber
            });
        }, 200);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the top toolbar */
class Toolbar {
    constructor() {
        this.dom = DOM.require('#toolbar');
        this.btnPlay = DOM.require('#btnPlay');
        this.btnStop = DOM.require('#btnStop');
        this.btnGenerate = DOM.require('#btnShuffle');
        this.btnSave = DOM.require('#btnSave');
        this.btnRecall = DOM.require('#btnLoad');
        this.btnOption = DOM.require('#btnSettings');
        this.btnStop.onclick = this.handleStop.bind(this);
        this.btnGenerate.onclick = this.handleGenerate.bind(this);
        this.btnSave.onclick = this.handleSave.bind(this);
        this.btnRecall.onclick = this.handleLoad.bind(this);
        this.btnOption.onclick = this.handleOption.bind(this);
        this.btnPlay.onclick = ev => {
            // Has to execute on a delay, as speech cancel is unreliable without it
            ev.preventDefault();
            RAG.speech.cancel();
            this.btnPlay.disabled = true;
            window.setTimeout(this.handlePlay.bind(this), 200);
        };
        // Add throb class if the generate button hasn't been clicked before
        if (!RAG.config.clickedGenerate) {
            this.btnGenerate.classList.add('throb');
            this.btnGenerate.focus();
        }
        else
            this.btnPlay.focus();
    }
    /** Handles the play button, playing the editor's current phrase with speech */
    handlePlay() {
        // Note: It would be nice to have the play button change to the stop button and
        // automatically change back. However, speech's 'onend' event was found to be
        // unreliable, so I decided to keep play and stop separate.
        RAG.speech.speak(RAG.views.editor.getPhrase());
        RAG.views.marquee.set(RAG.views.editor.getText());
        this.btnPlay.disabled = false;
    }
    /** Handles the stop button, stopping the marquee and any speech */
    handleStop() {
        RAG.speech.cancel();
        RAG.views.marquee.stop();
    }
    /** Handles the generate button, generating new random state and phrase */
    handleGenerate() {
        // Remove the call-to-action throb from initial load
        this.btnGenerate.classList.remove('throb');
        RAG.generate();
        RAG.config.clickedGenerate = true;
    }
    /** Handles the save button, persisting the current train state to storage */
    handleSave() {
        try {
            let css = 'font-size: large; font-weight: bold;';
            let raw = JSON.stringify(RAG.state);
            window.localStorage.setItem('state', raw);
            console.log(L.STATE_COPY_PASTE(), css);
            console.log("RAG.load('", raw.replace("'", "\\'"), "')");
            console.log(L.STATE_RAW_JSON(), css);
            console.log(raw);
            RAG.views.marquee.set(L.STATE_TO_STORAGE());
        }
        catch (e) {
            RAG.views.marquee.set(L.STATE_SAVE_FAIL(e.message));
        }
    }
    /** Handles the load button, loading train state from storage, if it exists */
    handleLoad() {
        let data = window.localStorage.getItem('state');
        return data
            ? RAG.load(data)
            : RAG.views.marquee.set(L.STATE_SAVE_MISSING());
    }
    /** Handles the settings button, opening the settings screen */
    handleOption() {
        RAG.views.settings.open();
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Manages UI elements and their logic */
class Views {
    constructor() {
        this.editor = new Editor();
        this.marquee = new Marquee();
        this.settings = new Settings();
        this.toolbar = new Toolbar();
        this.pickers = {};
        [
            new CoachPicker(),
            new ExcusePicker(),
            new IntegerPicker(),
            new NamedPicker(),
            new PhrasesetPicker(),
            new PlatformPicker(),
            new ServicePicker(),
            new StationPicker(),
            new StationListPicker(),
            new TimePicker()
        ].forEach(picker => this.pickers[picker.xmlTag] = picker);
        // Global hotkeys
        document.body.onkeydown = this.onInput.bind(this);
        // Apply iOS-specific CSS fixes
        if (DOM.isiOS)
            document.body.classList.add('ios');
    }
    /** Gets the picker that handles a given tag, if any */
    getPicker(xmlTag) {
        return this.pickers[xmlTag];
    }
    /** Handle ESC to close pickers or settigns */
    onInput(ev) {
        if (ev.key !== 'Escape')
            return;
        this.editor.closeDialog();
        this.settings.close();
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility methods for dealing with collapsible elements */
class Collapsibles {
    /**
     * Sets the collapse state of a collapsible element.
     *
     * @param span The encapsulating collapsible element
     * @param toggle The toggle child of the collapsible element
     * @param state True to collapse, false to open
     */
    static set(span, toggle, state) {
        let ref = span.dataset['ref'] || '???';
        let type = span.dataset['type'];
        if (state)
            span.setAttribute('collapsed', '');
        else
            span.removeAttribute('collapsed');
        toggle.title = state
            ? L.TITLE_OPT_OPEN(type, ref)
            : L.TITLE_OPT_CLOSE(type, ref);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Sugar for choosing second value if first is undefined, instead of falsy */
function either(value, value2) {
    return (value === undefined || value === null) ? value2 : value;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility methods for dealing with the DOM */
class DOM {
    /** Whether the window is thinner than a specific size (and, thus, is "mobile") */
    static get isMobile() {
        return document.body.clientWidth <= 500;
    }
    /** Whether RAG appears to be running on an iOS device */
    static get isiOS() {
        return navigator.platform.match(/iPhone|iPod|iPad/gi) !== null;
    }
    /**
     * Finds the value of the given attribute from the given element, or returns the given
     * default value if unset.
     *
     * @param element Element to get the attribute of
     * @param attr Name of the attribute to get the value of
     * @param def Default value if attribute isn't set
     * @returns The given attribute's value, or default value if unset
     */
    static getAttr(element, attr, def) {
        return element.hasAttribute(attr)
            ? element.getAttribute(attr)
            : def;
    }
    /**
     * Finds an element from the given document, throwing an error if no match is found.
     *
     * @param query CSS selector query to use
     * @param parent Parent object to search; defaults to document
     * @returns The first element to match the given query
     */
    static require(query, parent = window.document) {
        let result = parent.querySelector(query);
        if (!result)
            throw Error(L.DOM_MISSING(query));
        return result;
    }
    /**
     * Finds the value of the given attribute from the given element, throwing an error
     * if the attribute is missing.
     *
     * @param element Element to get the attribute of
     * @param attr Name of the attribute to get the value of
     * @returns The given attribute's value
     */
    static requireAttr(element, attr) {
        if (!element.hasAttribute(attr))
            throw Error(L.ATTR_MISSING(attr));
        return element.getAttribute(attr);
    }
    /**
     * Finds the value of the given key of the given element's dataset, throwing an error
     * if the value is missing or empty.
     *
     * @param element Element to get the data of
     * @param key Key to get the value of
     * @returns The given dataset's value
     */
    static requireData(element, key) {
        let value = element.dataset[key];
        if (Strings.isNullOrEmpty(value))
            throw Error(L.DATA_MISSING(key));
        return value;
    }
    /**
     * Blurs (unfocuses) the currently focused element.
     *
     * @param parent If given, only blurs if active is descendant
     */
    static blurActive(parent = document.body) {
        let active = document.activeElement;
        if (active && active.blur && parent.contains(active))
            active.blur();
    }
    /**
     * Deep clones all the children of the given element, into the target element.
     * Using innerHTML would be easier, however it handles self-closing tags poorly.
     *
     * @param source Element whose children to clone
     * @param target Element to append the cloned children to
     */
    static cloneInto(source, target) {
        for (let i = 0; i < source.childNodes.length; i++)
            target.appendChild(source.childNodes[i].cloneNode(true));
    }
    /**
     * Sugar for creating and adding an option element to a select element.
     *
     * @param select Select list element to add the option to
     * @param text Label for the option
     * @param value Value for the option
     */
    static addOption(select, text, value = '') {
        let option = document.createElement('option');
        option.text = text;
        option.value = value;
        select.add(option);
        return option;
    }
    /**
     * Gets the text content of the given element, excluding the text of hidden children.
     * Be warned; this method uses RAG-specific code.
     *
     * @see https://stackoverflow.com/a/19986328
     * @param element Element to recursively get text content of
     * @returns Text content of given element, without text of hidden children
     */
    static getVisibleText(element) {
        if (element.nodeType === Node.TEXT_NODE)
            return element.textContent || '';
        else if (element.classList.contains('toggle'))
            return '';
        // Return blank (skip) if child of a collapsed element. Previously, this used
        // getComputedStyle, but that doesn't work if the element is part of an orphaned
        // phrase (as happens with the phraseset picker).
        let parent = element.parentElement;
        if (parent && parent.hasAttribute('collapsed'))
            return '';
        let text = '';
        for (let i = 0; i < element.childNodes.length; i++)
            text += DOM.getVisibleText(element.childNodes[i]);
        return text;
    }
    /**
     * Gets the text content of the given element, excluding the text of hidden children,
     * and excess whitespace as a result of converting from HTML/XML.
     *
     * @see https://stackoverflow.com/a/19986328
     * @param element Element to recursively get text content of
     * @returns Cleaned text of given element, without text of hidden children
     */
    static getCleanedVisibleText(element) {
        return Strings.clean(DOM.getVisibleText(element));
    }
    /**
     * Scans for the next focusable sibling from a given element, skipping hidden or
     * unfocusable elements. If the end of the container is hit, the scan wraps around.
     *
     * @param from Element to start scanning from
     * @param dir Direction; -1 for left (previous), 1 for right (next)
     * @returns The next available sibling, or null if none found
     */
    static getNextFocusableSibling(from, dir) {
        let current = from;
        let parent = from.parentElement;
        if (!parent)
            return null;
        while (true) {
            // Proceed to next element, or wrap around if hit the end of parent
            if (dir < 0)
                current = current.previousElementSibling
                    || parent.lastElementChild;
            else if (dir > 0)
                current = current.nextElementSibling
                    || parent.firstElementChild;
            else
                throw Error(L.BAD_DIRECTION(dir.toString()));
            // If we've come back to the starting element, nothing was found
            if (current === from)
                return null;
            // If this element isn't hidden and is focusable, return it!
            if (!current.classList.contains('hidden'))
                if (current.hasAttribute('tabindex'))
                    return current;
        }
    }
    /**
     * Gets the index of a child element, relevant to its parent.
     *
     * @see https://stackoverflow.com/a/9132575/3354920
     * @param child Child element to get the index of
     */
    static indexOf(child) {
        let parent = child.parentElement;
        return parent
            ? Array.prototype.indexOf.call(parent.children, child)
            : -1;
    }
    /**
     * Gets the index of a child node, relevant to its parent. Used for text nodes.
     *
     * @see https://stackoverflow.com/a/9132575/3354920
     * @param child Child node to get the index of
     */
    static nodeIndexOf(child) {
        let parent = child.parentNode;
        return parent
            ? Array.prototype.indexOf.call(parent.childNodes, child)
            : -1;
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** A very, very small subset of Markdown for hyperlinking a block of text */
class Linkdown {
    /**
     * Parses the text of the given block as Linkdown, converting tagged text into links
     * using a given list of index-based references.
     *
     * @param block Element with text to replace; all children cleared
     */
    static parse(block) {
        let links = [];
        // First, get the list of references, removing them from the text
        let idx = 0;
        let text = block.innerText.replace(this.REGEX_REF, (_, k, v) => {
            links[parseInt(k)] = v;
            return '';
        });
        // Then, replace each tagged part of text with a link element
        block.innerHTML = text.replace(this.REGEX_LINK, (_, t) => `<a href='${links[idx++]}' target="_blank" rel="noopener">${t}</a>`);
    }
}
/** Regex pattern for matching linked text */
Linkdown.REGEX_LINK = /\[(.+?)\]/gi;
/** Regex pattern for matching link references */
Linkdown.REGEX_REF = /\[(\d+)\]:\s+(\S+)/gi;
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility methods for parsing data from strings */
class Parse {
    /** Parses a given string into a boolean */
    static boolean(str) {
        str = str.toLowerCase();
        if (str === 'true' || str === '1')
            return true;
        if (str === 'false' || str === '0')
            return false;
        throw Error(L.BAD_BOOLEAN(str));
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility methods for generating random data */
class Random {
    /**
     * Picks a random integer from the given range.
     *
     * @param min Minimum integer to pick, inclusive
     * @param max Maximum integer to pick, inclusive
     * @returns Random integer within the given range
     */
    static int(min = 0, max = 1) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
    /** Picks a random element from a given array-like object with a length property */
    static array(arr) {
        return arr[Random.int(0, arr.length)];
    }
    /** Splices a random element from a given array */
    static arraySplice(arr) {
        return arr.splice(Random.int(0, arr.length), 1)[0];
    }
    /** Picks a random key from a given object */
    static objectKey(obj) {
        return Random.array(Object.keys(obj));
    }
    /**
     * Picks true or false.
     *
     * @param chance Chance out of 100, to pick `true`
     */
    static bool(chance = 50) {
        return Random.int(0, 100) < chance;
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility class for audio functionality */
class Sounds {
    /**
     * Decodes the given audio file into raw audio data. This is a wrapper for the older
     * callback-based syntax, since it is the only one iOS currently supports.
     *
     * @param context Audio context to use for decoding
     * @param buffer Buffer of encoded file data (e.g. mp3) to decode
     */
    static decode(context, buffer) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                return context.decodeAudioData(buffer, resolve, reject);
            });
        });
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility methods for dealing with strings */
class Strings {
    /** Checks if the given string is null, or empty (whitespace only or zero-length) */
    static isNullOrEmpty(str) {
        return !str || !str.trim();
    }
    /**
     * Pretty-print's a given list of stations, with context sensitive extras.
     *
     * @param codes List of station codes to join
     * @param context List's context. If 'calling', handles special case
     * @returns Pretty-printed list of given stations
     */
    static fromStationList(codes, context) {
        let result = '';
        let names = codes.slice();
        names.forEach((c, i) => names[i] = RAG.database.getStation(c));
        if (names.length === 1)
            result = (context === 'calling')
                ? `${names[0]} only`
                : names[0];
        else {
            let lastStation = names.pop();
            result = names.join(', ');
            result += ` and ${lastStation}`;
        }
        return result;
    }
    /**
     * Pretty-prints the given date or hours and minutes into a 24-hour time (e.g. 01:09).
     *
     * @param hours Hours, from 0 to 23, or Date object
     * @param minutes Minutes, from 0 to 59
     */
    static fromTime(hours, minutes = 0) {
        if (hours instanceof Date) {
            minutes = hours.getMinutes();
            hours = hours.getHours();
        }
        return hours.toString().padStart(2, '0') + ':' +
            minutes.toString().padStart(2, '0');
    }
    /** Cleans up the given text of excess whitespace and any newlines */
    static clean(text) {
        return text.trim()
            .replace(/[\n\r]/gi, '')
            .replace(/\s{2,}/gi, ' ')
            .replace(/\s([.,])/gi, '$1');
    }
    /** Strongly compresses the given string to one more filename friendly */
    static filename(text) {
        return text
            .toLowerCase()
            // Replace plurals
            .replace(/ies\b/g, 'y')
            // Remove common words
            .replace(/\b(a|an|at|be|of|on|the|to|in|is|has|by|with)\b/g, '')
            .trim()
            // Convert spaces to underscores
            .replace(/\s+/g, '_')
            // Remove all non-alphanumericals
            .replace(/[^a-z0-9_]/g, '')
            // Limit to 100 chars; most systems support max. 255 bytes in filenames
            .substring(0, 100);
    }
    /** Gets the first match of a pattern in a string, or undefined if not found */
    static firstMatch(text, pattern, idx) {
        let match = text.match(pattern);
        return (match && match[idx])
            ? match[idx]
            : undefined;
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Holds runtime configuration */
class Config {
    /** Safely loads runtime configuration from localStorage, if any */
    constructor(load) {
        /** Volume for speech to be set at */
        this.speechVol = 1.0;
        /** Pitch for speech to be set at */
        this.speechPitch = 1.0;
        /** Rate for speech to be set at */
        this.speechRate = 1.0;
        /** Choice of speech voice to use, as getVoices index or -1 if unset */
        this._speechVoice = -1;
        /** If user has clicked shuffle at least once */
        this.clickedGenerate = false;
        let settings = window.localStorage.getItem('settings');
        if (!load || !settings)
            return;
        try {
            let config = JSON.parse(settings);
            Object.assign(this, config);
        }
        catch (e) {
            alert(L.CONFIG_LOAD_FAIL(e.message));
            console.error(e);
        }
    }
    /**
     * Choice of speech voice to use, as getVoices index. Because of the async nature of
     * getVoices, the default value will be fetched from it each time.
     */
    get speechVoice() {
        // TODO: this is probably better off using voice names
        // If there's a user-defined value, use that
        if (this._speechVoice !== -1)
            return this._speechVoice;
        // Select English voices by default
        for (let i = 0, v = RAG.speech.getVoices(); i < v.length; i++) {
            let lang = v[i].lang;
            if (lang === 'en-GB' || lang === 'en-US')
                return i;
        }
        // Else, first voice on the list
        return 0;
    }
    /** Sets the choice of speech to use, as getVoices index */
    set speechVoice(value) {
        this._speechVoice = value;
    }
    /** Safely saves runtime configuration to localStorage */
    save() {
        try {
            window.localStorage.setItem('settings', JSON.stringify(this));
        }
        catch (e) {
            alert(L.CONFIG_SAVE_FAIL(e.message));
            console.error(e);
        }
    }
    /** Safely deletes runtime configuration from localStorage and resets state */
    reset() {
        try {
            Object.assign(this, new Config(false));
            window.localStorage.removeItem('settings');
        }
        catch (e) {
            alert(L.CONFIG_RESET_FAIL(e.message));
            console.error(e);
        }
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Manages data for excuses, trains, services and stations */
class Database {
    constructor(dataRefs) {
        let query = dataRefs.phrasesetEmbed;
        let iframe = DOM.require(query);
        if (!iframe.contentDocument)
            throw Error(L.DB_ELEMENT_NOT_PHRASESET_IFRAME(query));
        this.phrasesets = iframe.contentDocument;
        this.excuses = dataRefs.excusesData;
        this.named = dataRefs.namedData;
        this.services = dataRefs.servicesData;
        this.stations = dataRefs.stationsData;
        this.stationsCount = Object.keys(this.stations).length;
        console.log('[Database] Entries loaded:');
        console.log('\tExcuses:', this.excuses.length);
        console.log('\tNamed trains:', this.named.length);
        console.log('\tServices:', this.services.length);
        console.log('\tStations:', this.stationsCount);
    }
    /** Picks a random excuse for a delay or cancellation */
    pickExcuse() {
        return Random.array(this.excuses);
    }
    /** Picks a random named train */
    pickNamed() {
        return Random.array(this.named);
    }
    /**
     * Clones and gets phrase with the given ID, or null if it doesn't exist.
     *
     * @param id ID of the phrase to get
     */
    getPhrase(id) {
        let result = this.phrasesets.querySelector('phrase#' + id);
        if (result)
            result = result.cloneNode(true);
        return result;
    }
    /**
     * Gets a phraseset with the given ID, or null if it doesn't exist. Note that the
     * returned phraseset comes from the XML document, so it should not be mutated.
     *
     * @param id ID of the phraseset to get
     */
    getPhraseset(id) {
        return this.phrasesets.querySelector('phraseset#' + id);
    }
    /** Picks a random rail network name */
    pickService() {
        return Random.array(this.services);
    }
    /**
     * Picks a random station code from the dataset.
     *
     * @param exclude List of codes to exclude. May be ignored if search takes too long.
     */
    pickStationCode(exclude) {
        // Give up finding random station that's not in the given list, if we try more
        // times then there are stations. Inaccurate, but avoids infinite loops.
        if (exclude)
            for (let i = 0; i < this.stationsCount; i++) {
                let value = Random.objectKey(this.stations);
                if (!exclude.includes(value))
                    return value;
            }
        return Random.objectKey(this.stations);
    }
    /**
     * Gets the station name from the given three letter code.
     *
     * @param code Three-letter station code to get the name of
     * @param filtered Whether to filter out parenthesized location context
     * @returns Station name for the given code, filtered if specified
     */
    getStation(code) {
        let station = this.stations[code];
        if (!station)
            return L.DB_UNKNOWN_STATION(code);
        else if (Strings.isNullOrEmpty(station))
            return L.DB_EMPTY_STATION(code);
        return station;
    }
    /**
     * Picks a random range of station codes, ensuring there are no duplicates.
     *
     * @param min Minimum amount of stations to pick
     * @param max Maximum amount of stations to pick
     * @param exclude
     * @returns A list of unique station names
     */
    pickStationCodes(min = 1, max = 16, exclude) {
        if (max - min > Object.keys(this.stations).length)
            throw Error(L.DB_TOO_MANY_STATIONS());
        let result = [];
        let length = Random.int(min, max);
        let tries = 0;
        while (result.length < length) {
            let key = Random.objectKey(this.stations);
            // Give up trying to avoid duplicates, if we try more times than there are
            // stations available. Inaccurate, but good enough.
            if (tries++ >= this.stationsCount)
                result.push(key);
            // If given an exclusion list, check against both that and results
            else if (exclude && !exclude.includes(key) && !result.includes(key))
                result.push(key);
            // If not, just check what results we've already found
            else if (!exclude && !result.includes(key))
                result.push(key);
        }
        return result;
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Main class of the entire Rail Announcements Generator application */
class RAG {
    /**
     * Entry point for RAG, to be called from Javascript.
     *
     * @param dataRefs Configuration object, with rail data to use
     */
    static main(dataRefs) {
        window.onerror = error => RAG.panic(error);
        window.onunhandledrejection = error => RAG.panic(error);
        I18n.init();
        RAG.config = new Config(true);
        RAG.database = new Database(dataRefs);
        RAG.views = new Views();
        RAG.phraser = new Phraser();
        RAG.speech = new Speech();
        // Begin
        RAG.views.marquee.set(L.WELCOME());
        RAG.generate();
    }
    /** Generates a new random phrase and state */
    static generate() {
        RAG.state = new State();
        RAG.state.genDefaultState();
        RAG.views.editor.generate();
    }
    /** Loads state from given JSON */
    static load(json) {
        RAG.state = Object.assign(new State(), JSON.parse(json));
        RAG.views.editor.generate();
        RAG.views.marquee.set(L.STATE_FROM_STORAGE());
    }
    /** Global error handler; throws up a big red panic screen on uncaught error */
    static panic(error = "Unknown error") {
        let msg = '<div id="panicScreen" class="warningScreen">';
        msg += '<h1>"We are sorry to announce that..."</h1>';
        msg += `<p>RAG has crashed because: <code>${error}</code>.</p>`;
        msg += `<p>Please open the console for more information.</p>`;
        msg += '</div>';
        document.body.innerHTML = msg;
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Disposable class that holds state for the current schedule, train, etc. */
class State {
    constructor() {
        /** State of collapsible elements. Key is reference ID, value is collapsed. */
        this._collapsibles = {};
        /** Current coach letter choices. Key is context ID, value is letter. */
        this._coaches = {};
        /** Current integer choices. Key is context ID, value is integer. */
        this._integers = {};
        /** Current phraseset phrase choices. Key is reference ID, value is index. */
        this._phrasesets = {};
        /** Current service choices. Key is context ID, value is service. */
        this._services = {};
        /** Current station choices. Key is context ID, value is station code. */
        this._stations = {};
        /** Current station list choices. Key is context ID, value is array of codes. */
        this._stationLists = {};
        /** Current time choices. Key is context ID, value is time. */
        this._times = {};
    }
    /**
     * Gets the currently chosen coach letter, or randomly picks one from A to Z.
     *
     * @param context Context ID to get or choose the letter for
     */
    getCoach(context) {
        if (this._coaches[context] !== undefined)
            return this._coaches[context];
        this._coaches[context] = Random.array(L.LETTERS);
        return this._coaches[context];
    }
    /**
     * Sets a coach letter.
     *
     * @param context Context ID to set the letter for
     * @param coach Value to set
     */
    setCoach(context, coach) {
        this._coaches[context] = coach;
    }
    /**
     * Gets the collapse state of a collapsible, or randomly picks one.
     *
     * @param ref Reference ID to get the collapsible state of
     * @param chance Chance between 0 and 100 of choosing true, if unset
     */
    getCollapsed(ref, chance) {
        if (this._collapsibles[ref] !== undefined)
            return this._collapsibles[ref];
        this._collapsibles[ref] = !Random.bool(chance);
        return this._collapsibles[ref];
    }
    /**
     * Sets a collapsible's state.
     *
     * @param ref Reference ID to set the collapsible state of
     * @param state Value to set, where true is "collapsed"
     */
    setCollapsed(ref, state) {
        this._collapsibles[ref] = state;
    }
    /**
     * Gets the currently chosen integer, or randomly picks one.
     *
     * @param context Context ID to get or choose the integer for
     */
    getInteger(context) {
        if (this._integers[context] !== undefined)
            return this._integers[context];
        let min = 0, max = 0;
        switch (context) {
            case "coaches":
                min = 1;
                max = 10;
                break;
            case "delayed":
                min = 5;
                max = 60;
                break;
            case "front_coaches":
                min = 2;
                max = 5;
                break;
            case "rear_coaches":
                min = 2;
                max = 5;
                break;
        }
        this._integers[context] = Random.int(min, max);
        return this._integers[context];
    }
    /**
     * Sets an integer.
     *
     * @param context Context ID to set the integer for
     * @param value Value to set
     */
    setInteger(context, value) {
        this._integers[context] = value;
    }
    /**
     * Gets the currently chosen phrase of a phraseset, or randomly picks one.
     *
     * @param ref Reference ID to get or choose the phraseset's phrase of
     */
    getPhrasesetIdx(ref) {
        if (this._phrasesets[ref] !== undefined)
            return this._phrasesets[ref];
        let phraseset = RAG.database.getPhraseset(ref);
        // TODO: is this safe across phraseset changes?
        if (!phraseset)
            throw Error(L.STATE_NONEXISTANT_PHRASESET(ref));
        this._phrasesets[ref] = Random.int(0, phraseset.children.length);
        return this._phrasesets[ref];
    }
    /**
     * Sets the chosen index for a phraseset.
     *
     * @param ref Reference ID to set the phraseset index of
     * @param idx Index to set
     */
    setPhrasesetIdx(ref, idx) {
        this._phrasesets[ref] = idx;
    }
    /**
     * Gets the currently chosen service, or randomly picks one.
     *
     * @param context Context ID to get or choose the service for
     */
    getService(context) {
        if (this._services[context] !== undefined)
            return this._services[context];
        this._services[context] = RAG.database.pickService();
        return this._services[context];
    }
    /**
     * Sets a service.
     *
     * @param context Context ID to set the service for
     * @param service Value to set
     */
    setService(context, service) {
        this._services[context] = service;
    }
    /**
     * Gets the currently chosen station code, or randomly picks one.
     *
     * @param context Context ID to get or choose the station for
     */
    getStation(context) {
        if (this._stations[context] !== undefined)
            return this._stations[context];
        this._stations[context] = RAG.database.pickStationCode();
        return this._stations[context];
    }
    /**
     * Sets a station code.
     *
     * @param context Context ID to set the station code for
     * @param code Station code to set
     */
    setStation(context, code) {
        this._stations[context] = code;
    }
    /**
     * Gets the currently chosen list of station codes, or randomly generates one.
     *
     * @param context Context ID to get or choose the station list for
     */
    getStationList(context) {
        if (this._stationLists[context] !== undefined)
            return this._stationLists[context];
        else if (context === 'calling_first')
            return this.getStationList('calling');
        let min = 1, max = 16;
        switch (context) {
            case 'calling_split':
                min = 2;
                max = 16;
                break;
            case 'changes':
                min = 1;
                max = 4;
                break;
            case 'not_stopping':
                min = 1;
                max = 8;
                break;
        }
        this._stationLists[context] = RAG.database.pickStationCodes(min, max);
        return this._stationLists[context];
    }
    /**
     * Sets a list of station codes.
     *
     * @param context Context ID to set the station code list for
     * @param codes Station codes to set
     */
    setStationList(context, codes) {
        this._stationLists[context] = codes;
        if (context === 'calling_first')
            this._stationLists['calling'] = codes;
    }
    /**
     * Gets the currently chosen time
     *
     * @param context Context ID to get or choose the time for
     */
    getTime(context) {
        if (this._times[context] !== undefined)
            return this._times[context];
        this._times[context] = Strings.fromTime(Random.int(0, 23), Random.int(0, 59));
        return this._times[context];
    }
    /**
     * Sets a time.
     *
     * @param context Context ID to set the time for
     * @param time Value to set
     */
    setTime(context, time) {
        this._times[context] = time;
    }
    /** Gets the chosen excuse, or randomly picks one */
    get excuse() {
        if (this._excuse)
            return this._excuse;
        this._excuse = RAG.database.pickExcuse();
        return this._excuse;
    }
    /** Sets the current excuse */
    set excuse(value) {
        this._excuse = value;
    }
    /** Gets the chosen platform, or randomly picks one */
    get platform() {
        if (this._platform)
            return this._platform;
        let platform = ['', ''];
        // Only 2% chance for platform 0, since it's rare
        platform[0] = Random.bool(98)
            ? Random.int(1, 26).toString()
            : '0';
        // Only 10% chance for platform letter, since it's uncommon
        platform[1] = Random.bool(10)
            ? Random.array('ABC')
            : '';
        this._platform = platform;
        return this._platform;
    }
    /** Sets the current platform */
    set platform(value) {
        this._platform = value;
    }
    /** Gets the chosen named train, or randomly picks one */
    get named() {
        if (this._named)
            return this._named;
        this._named = RAG.database.pickNamed();
        return this._named;
    }
    /** Sets the current named train */
    set named(value) {
        this._named = value;
    }
    /**
     * Sets up the state in a particular way, so that it makes some real-world sense.
     * To do so, we have to generate data in a particular order, and make sure to avoid
     * duplicates in inappropriate places and contexts.
     */
    genDefaultState() {
        // Step 1. Prepopulate station lists
        let slCalling = RAG.database.pickStationCodes(1, 16);
        let slCallSplit = RAG.database.pickStationCodes(2, 16, slCalling);
        let allCalling = [...slCalling, ...slCallSplit];
        // List of other stations found via a specific calling point
        let slChanges = RAG.database.pickStationCodes(1, 4, allCalling);
        // List of other stations that this train usually serves, but currently isn't
        let slNotStopping = RAG.database.pickStationCodes(1, 8, [...allCalling, ...slChanges]);
        // Take a random slice from the calling list, to identify as request stops
        let reqCount = Random.int(1, slCalling.length - 1);
        let slRequests = slCalling.slice(0, reqCount);
        this.setStationList('calling', slCalling);
        this.setStationList('calling_split', slCallSplit);
        this.setStationList('changes', slChanges);
        this.setStationList('not_stopping', slNotStopping);
        this.setStationList('request', slRequests);
        // Step 2. Prepopulate stations
        // Any station may be blamed for an excuse, even ones already picked
        let stExcuse = RAG.database.pickStationCode();
        // Destination is final call of the calling list
        let stDest = slCalling[slCalling.length - 1];
        // Via is a call before the destination, or one in the split list if too small
        let stVia = slCalling.length > 1
            ? Random.array(slCalling.slice(0, -1))
            : Random.array(slCallSplit.slice(0, -1));
        // Ditto for picking a random calling station as a single request or change stop
        let stCalling = slCalling.length > 1
            ? Random.array(slCalling.slice(0, -1))
            : Random.array(slCallSplit.slice(0, -1));
        // Destination (last call) of the split train's second half of the list
        let stDestSplit = slCallSplit[slCallSplit.length - 1];
        // Random non-destination stop of the split train's second half of the list
        let stViaSplit = Random.array(slCallSplit.slice(0, -1));
        // Where the train comes from, so can't be on any lists or prior stations
        let stSource = RAG.database.pickStationCode([
            ...allCalling, ...slChanges, ...slNotStopping, ...slRequests,
            stCalling, stDest, stVia, stDestSplit, stViaSplit
        ]);
        this.setStation('calling', stCalling);
        this.setStation('destination', stDest);
        this.setStation('destination_split', stDestSplit);
        this.setStation('excuse', stExcuse);
        this.setStation('source', stSource);
        this.setStation('via', stVia);
        this.setStation('via_split', stViaSplit);
        // Step 3. Prepopulate coach numbers
        let intCoaches = this.getInteger('coaches');
        // If there are enough coaches, just split the number down the middle instead.
        // Else, front and rear coaches will be randomly picked (without making sense)
        if (intCoaches >= 4) {
            let intFrontCoaches = (intCoaches / 2) | 0;
            let intRearCoaches = intCoaches - intFrontCoaches;
            this.setInteger('front_coaches', intFrontCoaches);
            this.setInteger('rear_coaches', intRearCoaches);
        }
        // If there are enough coaches, assign coach letters for contexts.
        // Else, letters will be randomly picked (without making sense)
        if (intCoaches >= 4) {
            let letters = L.LETTERS.slice(0, intCoaches).split('');
            this.setCoach('first', Random.arraySplice(letters));
            this.setCoach('shop', Random.arraySplice(letters));
            this.setCoach('standard1', Random.arraySplice(letters));
            this.setCoach('standard2', Random.arraySplice(letters));
        }
        // Step 4. Prepopulate services
        // If there is more than one service, pick one to be the "main" and one to be the
        // "alternate", else the one service will be used for both (without making sense).
        if (RAG.database.services.length > 1) {
            let services = RAG.database.services.slice();
            this.setService('provider', Random.arraySplice(services));
            this.setService('alternative', Random.arraySplice(services));
        }
        // Step 5. Prepopulate times
        // https://stackoverflow.com/a/1214753
        // The alternative time is for a train that's later than the main train
        let time = new Date(new Date().getTime() + Random.int(0, 59) * 60000);
        let timeAlt = new Date(time.getTime() + Random.int(0, 30) * 60000);
        this.setTime('main', Strings.fromTime(time));
        this.setTime('alternative', Strings.fromTime(timeAlt));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL3N0YXRpb25DaG9vc2VyLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkxpc3RJdGVtLnRzIiwidWkvcGlja2Vycy9waWNrZXIudHMiLCJ1aS9waWNrZXJzL2NvYWNoUGlja2VyLnRzIiwidWkvcGlja2Vycy9leGN1c2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2ludGVnZXJQaWNrZXIudHMiLCJ1aS9waWNrZXJzL25hbWVkUGlja2VyLnRzIiwidWkvcGlja2Vycy9waHJhc2VzZXRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BsYXRmb3JtUGlja2VyLnRzIiwidWkvcGlja2Vycy9zZXJ2aWNlUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uTGlzdFBpY2tlci50cyIsInVpL3BpY2tlcnMvdGltZVBpY2tlci50cyIsImxhbmcvYmFzZUxhbmd1YWdlLnRzIiwibGFuZy9lbmdsaXNoTGFuZ3VhZ2UudHMiLCJwaHJhc2VyL2VsZW1lbnRQcm9jZXNzb3JzLnRzIiwicGhyYXNlci9waHJhc2VDb250ZXh0LnRzIiwicGhyYXNlci9waHJhc2VyLnRzIiwic3BlZWNoL2N1c3RvbVZvaWNlLnRzIiwic3BlZWNoL3Jlc29sdmVyLnRzIiwic3BlZWNoL3NwZWVjaC50cyIsInNwZWVjaC9zcGVlY2hTZXR0aW5ncy50cyIsInNwZWVjaC92b3hFbmdpbmUudHMiLCJzcGVlY2gvdm94UmVxdWVzdC50cyIsInVpL2VkaXRvci50cyIsInVpL21hcnF1ZWUudHMiLCJ1aS9zZXR0aW5ncy50cyIsInVpL3Rvb2xiYXIudHMiLCJ1aS92aWV3cy50cyIsInV0aWwvY29sbGFwc2libGVzLnRzIiwidXRpbC9jb25kaXRpb25hbHMudHMiLCJ1dGlsL2RvbS50cyIsInV0aWwvbGlua2Rvd24udHMiLCJ1dGlsL3BhcnNlLnRzIiwidXRpbC9yYW5kb20udHMiLCJ1dGlsL3NvdW5kcy50cyIsInV0aWwvc3RyaW5ncy50cyIsInV0aWwvdHlwZXMudHMiLCJjb25maWcudHMiLCJkYXRhYmFzZS50cyIsInJhZy50cyIsInN0YXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLHFFQUFxRTtBQUVyRSw4REFBOEQ7QUFDOUQsSUFBSSxDQUFrQyxDQUFDO0FBRXZDLE1BQU0sSUFBSTtJQVVOLDRFQUE0RTtJQUNyRSxNQUFNLENBQUMsSUFBSTtRQUVkLElBQUksSUFBSSxDQUFDLFNBQVM7WUFDZCxNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFFbkQsSUFBSSxDQUFDLFNBQVMsR0FBRztZQUNiLElBQUksRUFBRyxJQUFJLGVBQWUsRUFBRTtTQUMvQixDQUFDO1FBRUYsMkJBQTJCO1FBQzNCLENBQUMsR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFNUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ3RCLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ssTUFBTSxDQUFDLFVBQVU7UUFFckIsSUFBSSxJQUFrQixDQUFDO1FBQ3ZCLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FDaEMsUUFBUSxDQUFDLElBQUksRUFDYixVQUFVLENBQUMsWUFBWSxHQUFHLFVBQVUsQ0FBQyxTQUFTLEVBQzlDLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFDL0IsS0FBSyxDQUNSLENBQUM7UUFFRixPQUFRLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQzlCO1lBQ0ksSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxZQUFZLEVBQ3ZDO2dCQUNJLElBQUksT0FBTyxHQUFHLElBQWUsQ0FBQztnQkFFOUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVB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RUFBRSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDO1FBQzFFLElBQUksT0FBTyxHQUFHLElBQUksSUFBSSxDQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBUyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztRQUUxRSxJQUFJLENBQUMsT0FBTyxDQUFFLE1BQU0sRUFBUyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFLLENBQUM7UUFDekQsSUFBSSxDQUFDLE9BQU8sQ0FBRSxhQUFhLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBRSxDQUFDO0lBQzdELENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEdsb2JhbCByZWZlcmVuY2UgdG8gdGhlIGxhbmd1YWdlIGNvbnRhaW5lciwgc2V0IGF0IGluaXQgKi9cclxubGV0IEwgOiBFbmdsaXNoTGFuZ3VhZ2UgfCBCYXNlTGFuZ3VhZ2U7XHJcblxyXG5jbGFzcyBJMThuXHJcbntcclxuICAgIC8qKiBDb25zdGFudCByZWdleCB0byBtYXRjaCBmb3IgdHJhbnNsYXRpb24ga2V5cyAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVEFHX1JFR0VYIDogUmVnRXhwID0gLyVbQS1aX10rJS87XHJcblxyXG4gICAgLyoqIExhbmd1YWdlcyBjdXJyZW50bHkgYXZhaWxhYmxlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBsYW5ndWFnZXMgICA6IERpY3Rpb25hcnk8QmFzZUxhbmd1YWdlPjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gbGFuZ3VhZ2UgY3VycmVudGx5IGluIHVzZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgY3VycmVudExhbmcgOiBCYXNlTGFuZ3VhZ2U7XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgbGFuZ3VhZ2UsIGFuZCB0cmFuc2Zvcm1zIGFsbCB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBkb2N1bWVudCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMubGFuZ3VhZ2VzKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0kxOG4gaXMgYWxyZWFkeSBpbml0aWFsaXplZCcpO1xyXG5cclxuICAgICAgICB0aGlzLmxhbmd1YWdlcyA9IHtcclxuICAgICAgICAgICAgJ2VuJyA6IG5ldyBFbmdsaXNoTGFuZ3VhZ2UoKVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIFRPRE86IExhbmd1YWdlIHNlbGVjdGlvblxyXG4gICAgICAgIEwgPSB0aGlzLmN1cnJlbnRMYW5nID0gdGhpcy5sYW5ndWFnZXNbJ2VuJ107XHJcblxyXG4gICAgICAgIEkxOG4uYXBwbHlUb0RvbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogV2Fsa3MgdGhyb3VnaCBhbGwgdGV4dCBub2RlcyBpbiB0aGUgRE9NLCByZXBsYWNpbmcgYW55IHRyYW5zbGF0aW9uIGtleXMuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTA3MzA3NzcvMzM1NDkyMFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBhcHBseVRvRG9tKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5leHQgOiBOb2RlIHwgbnVsbDtcclxuICAgICAgICBsZXQgd2FsayA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoXHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHksXHJcbiAgICAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5UIHwgTm9kZUZpbHRlci5TSE9XX1RFWFQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogSTE4bi5ub2RlRmlsdGVyIH0sXHJcbiAgICAgICAgICAgIGZhbHNlXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgd2hpbGUgKCBuZXh0ID0gd2Fsay5uZXh0Tm9kZSgpIClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmIChuZXh0Lm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnQgPSBuZXh0IGFzIEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBlbGVtZW50LmF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgICAgICAgICAgSTE4bi5leHBhbmRBdHRyaWJ1dGUoZWxlbWVudC5hdHRyaWJ1dGVzW2ldKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChuZXh0Lm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSAmJiBuZXh0LnRleHRDb250ZW50KVxyXG4gICAgICAgICAgICAgICAgSTE4bi5leHBhbmRUZXh0Tm9kZShuZXh0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbHRlcnMgdGhlIHRyZWUgd2Fsa2VyIHRvIGV4Y2x1ZGUgc2NyaXB0IGFuZCBzdHlsZSB0YWdzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBub2RlRmlsdGVyKG5vZGU6IE5vZGUpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhZyA9IChub2RlLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSlcclxuICAgICAgICAgICAgPyAobm9kZSBhcyBFbGVtZW50KS50YWdOYW1lLnRvVXBwZXJDYXNlKClcclxuICAgICAgICAgICAgOiBub2RlLnBhcmVudEVsZW1lbnQhLnRhZ05hbWUudG9VcHBlckNhc2UoKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsnU0NSSVBUJywgJ1NUWUxFJ10uaW5jbHVkZXModGFnKVxyXG4gICAgICAgICAgICA/IE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVFxyXG4gICAgICAgICAgICA6IE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRXhwYW5kcyBhbnkgdHJhbnNsYXRpb24ga2V5cyBpbiB0aGUgZ2l2ZW4gYXR0cmlidXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBleHBhbmRBdHRyaWJ1dGUoYXR0cjogQXR0cikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2V0dGluZyBhbiBhdHRyaWJ1dGUsIGV2ZW4gaWYgbm90aGluZyBhY3R1YWxseSBjaGFuZ2VzLCB3aWxsIGNhdXNlIHZhcmlvdXNcclxuICAgICAgICAvLyBzaWRlLWVmZmVjdHMgKGUuZy4gcmVsb2FkaW5nIGlmcmFtZXMpLiBTbywgYXMgd2FzdGVmdWwgYXMgdGhpcyBsb29rcywgd2UgaGF2ZVxyXG4gICAgICAgIC8vIHRvIG1hdGNoIGZpcnN0IGJlZm9yZSBhY3R1YWxseSByZXBsYWNpbmcuXHJcblxyXG4gICAgICAgIGlmICggYXR0ci52YWx1ZS5tYXRjaCh0aGlzLlRBR19SRUdFWCkgKVxyXG4gICAgICAgICAgICBhdHRyLnZhbHVlID0gYXR0ci52YWx1ZS5yZXBsYWNlKHRoaXMuVEFHX1JFR0VYLCBJMThuLnJlcGxhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFeHBhbmRzIGFueSB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBnaXZlbiB0ZXh0IG5vZGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGV4cGFuZFRleHROb2RlKG5vZGU6IE5vZGUpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIG5vZGUudGV4dENvbnRlbnQgPSBub2RlLnRleHRDb250ZW50IS5yZXBsYWNlKHRoaXMuVEFHX1JFR0VYLCBJMThuLnJlcGxhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyBrZXkgd2l0aCB2YWx1ZSBpZiBpdCBleGlzdHMsIGVsc2Uga2VlcHMgdGhlIGtleSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVwbGFjZShtYXRjaDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBrZXkgICA9IG1hdGNoLnNsaWNlKDEsIC0xKTtcclxuICAgICAgICBsZXQgdmFsdWUgPSBMW2tleV0gYXMgTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAgICAgaWYgKCF2YWx1ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgdHJhbnNsYXRpb24ga2V5OicsIG1hdGNoKTtcclxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSgpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogRGVsZWdhdGUgdHlwZSBmb3IgY2hvb3NlciBzZWxlY3QgZXZlbnQgaGFuZGxlcnMgKi9cclxudHlwZSBTZWxlY3REZWxlZ2F0ZSA9IChlbnRyeTogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XHJcblxyXG4vKiogVUkgZWxlbWVudCB3aXRoIGEgZmlsdGVyYWJsZSBhbmQga2V5Ym9hcmQgbmF2aWdhYmxlIGxpc3Qgb2YgY2hvaWNlcyAqL1xyXG5jbGFzcyBDaG9vc2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSwgZm9yIGVhY2ggY2hvb3NlciBjcmVhdGVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURSAgICA9IERPTS5yZXF1aXJlKCcjY2hvb3NlclRlbXBsYXRlJyk7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5pZCA9ICcnO1xyXG5cclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBjb250YWluZXIgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkb20gICAgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgZmlsdGVyIGlucHV0IGJveCAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlucHV0RmlsdGVyICA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGNvbnRhaW5lciBvZiBpdGVtIGVsZW1lbnRzICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5wdXRDaG9pY2VzIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIE9wdGlvbmFsIGV2ZW50IGhhbmRsZXIgdG8gZmlyZSB3aGVuIGFuIGl0ZW0gaXMgc2VsZWN0ZWQgYnkgdGhlIHVzZXIgKi9cclxuICAgIHB1YmxpYyAgICBvblNlbGVjdD8gICAgIDogU2VsZWN0RGVsZWdhdGU7XHJcbiAgICAvKiogV2hldGhlciB0byB2aXN1YWxseSBzZWxlY3QgdGhlIGNsaWNrZWQgZWxlbWVudCAqL1xyXG4gICAgcHVibGljICAgIHNlbGVjdE9uQ2xpY2sgOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBpdGVtLCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCBkb21TZWxlY3RlZD8gIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBhdXRvLWZpbHRlciB0aW1lb3V0LCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCBmaWx0ZXJUaW1lb3V0IDogbnVtYmVyID0gMDtcclxuICAgIC8qKiBXaGV0aGVyIHRvIGdyb3VwIGFkZGVkIGVsZW1lbnRzIGJ5IGFscGhhYmV0aWNhbCBzZWN0aW9ucyAqL1xyXG4gICAgcHJvdGVjdGVkIGdyb3VwQnlBQkMgICAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogVGl0bGUgYXR0cmlidXRlIHRvIGFwcGx5IHRvIGV2ZXJ5IGl0ZW0gYWRkZWQgKi9cclxuICAgIHByb3RlY3RlZCBpdGVtVGl0bGUgICAgIDogc3RyaW5nID0gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIGl0ZW0nO1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGEgY2hvb3NlciwgYnkgcmVwbGFjaW5nIHRoZSBwbGFjZWhvbGRlciBpbiBhIGdpdmVuIHBhcmVudCAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFDaG9vc2VyLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBDaG9vc2VyLmluaXQoKTtcclxuXHJcbiAgICAgICAgbGV0IHRhcmdldCAgICAgID0gRE9NLnJlcXVpcmUoJ2Nob29zZXInLCBwYXJlbnQpO1xyXG4gICAgICAgIGxldCBwbGFjZWhvbGRlciA9IERPTS5nZXRBdHRyKCB0YXJnZXQsICdwbGFjZWhvbGRlcicsIEwuUF9HRU5FUklDX1BIKCkgKTtcclxuICAgICAgICBsZXQgdGl0bGUgICAgICAgPSBET00uZ2V0QXR0ciggdGFyZ2V0LCAndGl0bGUnLCBMLlBfR0VORVJJQ19UKCkgKTtcclxuICAgICAgICB0aGlzLml0ZW1UaXRsZSAgPSBET00uZ2V0QXR0cih0YXJnZXQsICdpdGVtVGl0bGUnLCB0aGlzLml0ZW1UaXRsZSk7XHJcbiAgICAgICAgdGhpcy5ncm91cEJ5QUJDID0gdGFyZ2V0Lmhhc0F0dHJpYnV0ZSgnZ3JvdXBCeUFCQycpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbSAgICAgICAgICA9IENob29zZXIuVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIgID0gRE9NLnJlcXVpcmUoJy5jaFNlYXJjaEJveCcsICB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMgPSBET00ucmVxdWlyZSgnLmNoQ2hvaWNlc0JveCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMudGl0bGUgICAgICA9IHRpdGxlO1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIucGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcclxuICAgICAgICAvLyBUT0RPOiBSZXVzaW5nIHRoZSBwbGFjZWhvbGRlciBhcyB0aXRsZSBpcyBwcm9iYWJseSBiYWRcclxuICAgICAgICAvLyBodHRwczovL2xha2VuLm5ldC9ibG9nL21vc3QtY29tbW9uLWExMXktbWlzdGFrZXMvXHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci50aXRsZSAgICAgICA9IHBsYWNlaG9sZGVyO1xyXG5cclxuICAgICAgICB0YXJnZXQuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdiZWZvcmViZWdpbicsIHRoaXMuZG9tKTtcclxuICAgICAgICB0YXJnZXQucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBZGRzIHRoZSBnaXZlbiB2YWx1ZSB0byB0aGUgY2hvb3NlciBhcyBhIHNlbGVjdGFibGUgaXRlbS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVGV4dCBvZiB0aGUgc2VsZWN0YWJsZSBpdGVtXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFdoZXRoZXIgdG8gc2VsZWN0IHRoaXMgaXRlbSBvbmNlIGFkZGVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhZGQodmFsdWU6IHN0cmluZywgc2VsZWN0OiBib29sZWFuID0gZmFsc2UpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuXHJcbiAgICAgICAgaXRlbS5pbm5lclRleHQgPSB2YWx1ZTtcclxuXHJcbiAgICAgICAgdGhpcy5hZGRSYXcoaXRlbSwgc2VsZWN0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFkZHMgdGhlIGdpdmVuIGVsZW1lbnQgdG8gdGhlIGNob29zZXIgYXMgYSBzZWxlY3RhYmxlIGl0ZW0uXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGl0ZW0gRWxlbWVudCB0byBhZGQgdG8gdGhlIGNob29zZXJcclxuICAgICAqIEBwYXJhbSBzZWxlY3QgV2hldGhlciB0byBzZWxlY3QgdGhpcyBpdGVtIG9uY2UgYWRkZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGFkZFJhdyhpdGVtOiBIVE1MRWxlbWVudCwgc2VsZWN0OiBib29sZWFuID0gZmFsc2UpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGl0ZW0udGl0bGUgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgICAgICBpdGVtLnRhYkluZGV4ID0gLTE7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmFwcGVuZENoaWxkKGl0ZW0pO1xyXG5cclxuICAgICAgICBpZiAoc2VsZWN0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoaXRlbSk7XHJcbiAgICAgICAgICAgIGl0ZW0uZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFycyBhbGwgaXRlbXMgZnJvbSB0aGlzIGNob29zZXIgYW5kIHRoZSBjdXJyZW50IGZpbHRlciAqL1xyXG4gICAgcHVibGljIGNsZWFyKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuaW5uZXJIVE1MID0gJyc7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci52YWx1ZSAgICAgID0gJyc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNlbGVjdCBhbmQgZm9jdXMgdGhlIGVudHJ5IHRoYXQgbWF0Y2hlcyB0aGUgZ2l2ZW4gdmFsdWUgKi9cclxuICAgIHB1YmxpYyBwcmVzZWxlY3QodmFsdWU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQga2V5IGluIHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGl0ZW0gPSB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbltrZXldIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgaWYgKHZhbHVlID09PSBpdGVtLmlubmVyVGV4dClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoaXRlbSk7XHJcbiAgICAgICAgICAgICAgICBpdGVtLmZvY3VzKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbGljayBldmVudHMsIGZvciBjaG9vc2luZyBpdGVtcyAqL1xyXG4gICAgcHVibGljIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSBldi50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggdGhpcy5pc0Nob2ljZSh0YXJnZXQpIClcclxuICAgICAgICBpZiAoICF0YXJnZXQuaGFzQXR0cmlidXRlKCdkaXNhYmxlZCcpIClcclxuICAgICAgICAgICAgdGhpcy5zZWxlY3QodGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbG9zZSBtZXRob2RzLCBkb2luZyBhbnkgdGltZXIgY2xlYW51cCAqL1xyXG4gICAgcHVibGljIG9uQ2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgaW5wdXQgZXZlbnRzLCBmb3IgZmlsdGVyaW5nIGFuZCBuYXZpZ2F0aW9uICovXHJcbiAgICBwdWJsaWMgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSAgICAgPSBldi5rZXk7XHJcbiAgICAgICAgbGV0IGZvY3VzZWQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCBwYXJlbnQgID0gZm9jdXNlZC5wYXJlbnRFbGVtZW50ITtcclxuXHJcbiAgICAgICAgaWYgKCFmb2N1c2VkKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIE9ubHkgaGFuZGxlIGV2ZW50cyBvbiB0aGlzIGNob29zZXIncyBjb250cm9sc1xyXG4gICAgICAgIGlmICggIXRoaXMub3ducyhmb2N1c2VkKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHR5cGluZyBpbnRvIGZpbHRlciBib3hcclxuICAgICAgICBpZiAoZm9jdXNlZCA9PT0gdGhpcy5pbnB1dEZpbHRlcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyVGltZW91dCA9IHdpbmRvdy5zZXRUaW1lb3V0KF8gPT4gdGhpcy5maWx0ZXIoKSwgNTAwKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUmVkaXJlY3QgdHlwaW5nIHRvIGlucHV0IGZpbHRlciBib3hcclxuICAgICAgICBpZiAoZm9jdXNlZCAhPT0gdGhpcy5pbnB1dEZpbHRlcilcclxuICAgICAgICBpZiAoa2V5Lmxlbmd0aCA9PT0gMSB8fCBrZXkgPT09ICdCYWNrc3BhY2UnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pbnB1dEZpbHRlci5mb2N1cygpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcHJlc3NpbmcgRU5URVIgYWZ0ZXIga2V5Ym9hcmQgbmF2aWdhdGluZyB0byBhbiBpdGVtXHJcbiAgICAgICAgaWYgKCB0aGlzLmlzQ2hvaWNlKGZvY3VzZWQpIClcclxuICAgICAgICBpZiAoa2V5ID09PSAnRW50ZXInKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3QoZm9jdXNlZCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBuYXZpZ2F0aW9uIHdoZW4gY29udGFpbmVyIG9yIGl0ZW0gaXMgZm9jdXNlZFxyXG4gICAgICAgIGlmIChrZXkgPT09ICdBcnJvd0xlZnQnIHx8IGtleSA9PT0gJ0Fycm93UmlnaHQnKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGRpciA9IChrZXkgPT09ICdBcnJvd0xlZnQnKSA/IC0xIDogMTtcclxuICAgICAgICAgICAgbGV0IG5hdiA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LCBpZiB1c2luZyBncm91cHNcclxuICAgICAgICAgICAgaWYgICAgICAoIHRoaXMuZ3JvdXBCeUFCQyAmJiBwYXJlbnQuaGFzQXR0cmlidXRlKCdncm91cCcpIClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudCwgaWYgY2hvaWNlcyBhcmUgZmxhdFxyXG4gICAgICAgICAgICBlbHNlIGlmICghdGhpcy5ncm91cEJ5QUJDICYmIGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dENob2ljZXMpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGZvY3VzZWQgPT09IHRoaXMuZG9tU2VsZWN0ZWQpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcodGhpcy5kb21TZWxlY3RlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGV2YW50IHRvIGJlZ2lubmluZyBvciBlbmQgb2YgY29udGFpbmVyXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA9PT0gLTEpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5maXJzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQubGFzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChuYXYpIG5hdi5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBzdWJtaXQgZXZlbnRzLCBmb3IgaW5zdGFudCBmaWx0ZXJpbmcgKi9cclxuICAgIHB1YmxpYyBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgdGhpcy5maWx0ZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGlkZSBvciBzaG93IGNob2ljZXMgaWYgdGhleSBwYXJ0aWFsbHkgbWF0Y2ggdGhlIHVzZXIgcXVlcnkgKi9cclxuICAgIHByb3RlY3RlZCBmaWx0ZXIoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcblxyXG4gICAgICAgIGxldCBmaWx0ZXIgPSB0aGlzLmlucHV0RmlsdGVyLnZhbHVlLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgbGV0IGl0ZW1zICA9IHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuO1xyXG4gICAgICAgIGxldCBlbmdpbmUgPSB0aGlzLmdyb3VwQnlBQkNcclxuICAgICAgICAgICAgPyBDaG9vc2VyLmZpbHRlckdyb3VwXHJcbiAgICAgICAgICAgIDogQ2hvb3Nlci5maWx0ZXJJdGVtO1xyXG5cclxuICAgICAgICAvLyBQcmV2ZW50IGJyb3dzZXIgcmVkcmF3L3JlZmxvdyBkdXJpbmcgZmlsdGVyaW5nXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XHJcblxyXG4gICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBhbGwgdGhlIGl0ZW1zXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgZW5naW5lKGl0ZW1zW2ldIGFzIEhUTUxFbGVtZW50LCBmaWx0ZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQXBwbGllcyBmaWx0ZXIgdG8gYW4gaXRlbSwgc2hvd2luZyBpdCBpZiBtYXRjaGVkLCBoaWRpbmcgaWYgbm90ICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGZpbHRlckl0ZW0oaXRlbTogSFRNTEVsZW1lbnQsIGZpbHRlcjogc3RyaW5nKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIC8vIFNob3cgaWYgY29udGFpbnMgc2VhcmNoIHRlcm1cclxuICAgICAgICBpZiAoaXRlbS5pbm5lclRleHQudG9Mb3dlckNhc2UoKS5pbmRleE9mKGZpbHRlcikgPj0gMClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGl0ZW0uY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGlkZSBpZiBub3RcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpdGVtLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xyXG4gICAgICAgICAgICByZXR1cm4gMTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEFwcGxpZXMgZmlsdGVyIHRvIGNoaWxkcmVuIG9mIGEgZ3JvdXAsIGhpZGluZyB0aGUgZ3JvdXAgaWYgYWxsIGNoaWxkcmVuIGhpZGUgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgZmlsdGVyR3JvdXAoZ3JvdXA6IEhUTUxFbGVtZW50LCBmaWx0ZXI6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJpZXMgPSBncm91cC5jaGlsZHJlbjtcclxuICAgICAgICBsZXQgY291bnQgICA9IGVudHJpZXMubGVuZ3RoIC0gMTsgLy8gLTEgZm9yIGhlYWRlciBlbGVtZW50XHJcbiAgICAgICAgbGV0IGhpZGRlbiAgPSAwO1xyXG5cclxuICAgICAgICAvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBzdGF0aW9uIG5hbWUgaW4gdGhpcyBsZXR0ZXIgc2VjdGlvbi4gSGVhZGVyIHNraXBwZWQuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBlbnRyaWVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICBoaWRkZW4gKz0gQ2hvb3Nlci5maWx0ZXJJdGVtKGVudHJpZXNbaV0gYXMgSFRNTEVsZW1lbnQsIGZpbHRlcik7XHJcblxyXG4gICAgICAgIC8vIElmIGFsbCBzdGF0aW9uIG5hbWVzIGluIHRoaXMgbGV0dGVyIHNlY3Rpb24gd2VyZSBoaWRkZW4sIGhpZGUgdGhlIHNlY3Rpb25cclxuICAgICAgICBpZiAoaGlkZGVuID49IGNvdW50KVxyXG4gICAgICAgICAgICBncm91cC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIGdyb3VwLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSBjaGFuZ2VzIHRoZSBjdXJyZW50IHNlbGVjdGlvbiwgYW5kIHVwZGF0ZXMgdGhlIHN0YXRlIGFuZCBlZGl0b3IgKi9cclxuICAgIHByb3RlY3RlZCBzZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgYWxyZWFkeVNlbGVjdGVkID0gKGVudHJ5ID09PSB0aGlzLmRvbVNlbGVjdGVkKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0T25DbGljaylcclxuICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoZW50cnkpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5vblNlbGVjdClcclxuICAgICAgICAgICAgdGhpcy5vblNlbGVjdChlbnRyeSk7XHJcblxyXG4gICAgICAgIGlmIChhbHJlYWR5U2VsZWN0ZWQpXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgY2hhbmdlcyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnQgKi9cclxuICAgIHByb3RlY3RlZCB2aXN1YWxTZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLnZpc3VhbFVuc2VsZWN0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQgICAgICAgICAgPSBlbnRyeTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnRhYkluZGV4ID0gNTA7XHJcbiAgICAgICAgZW50cnkuc2V0QXR0cmlidXRlKCdzZWxlY3RlZCcsICd0cnVlJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IHVuc2VsZWN0cyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnQsIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIHZpc3VhbFVuc2VsZWN0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRvbVNlbGVjdGVkKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQucmVtb3ZlQXR0cmlidXRlKCdzZWxlY3RlZCcpO1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQudGFiSW5kZXggPSAtMTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkICAgICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogV2hldGhlciB0aGlzIGNob29zZXIgaXMgYW4gYW5jZXN0b3IgKG93bmVyKSBvZiB0aGUgZ2l2ZW4gZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVsZW1lbnQgdG8gY2hlY2sgaWYgdGhpcyBjaG9vc2VyIGlzIGFuIGFuY2VzdG9yIG9mXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvd25zKHRhcmdldDogSFRNTEVsZW1lbnQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5jb250YWlucyh0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoZSBnaXZlbiBlbGVtZW50IGlzIGEgY2hvb3NhYmxlIG9uZSBvd25lZCBieSB0aGlzIGNob29zZXIgKi9cclxuICAgIHByb3RlY3RlZCBpc0Nob2ljZSh0YXJnZXQ/OiBIVE1MRWxlbWVudCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRhcmdldCAhPT0gdW5kZWZpbmVkXHJcbiAgICAgICAgICAgICYmIHRhcmdldC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdkZCdcclxuICAgICAgICAgICAgJiYgdGhpcy5vd25zKHRhcmdldCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKlxyXG4gKiBTaW5nbGV0b24gaW5zdGFuY2Ugb2YgdGhlIHN0YXRpb24gcGlja2VyLiBTaW5jZSB0aGVyZSBhcmUgZXhwZWN0ZWQgdG8gYmUgMjUwMCtcclxuICogc3RhdGlvbnMsIHRoaXMgZWxlbWVudCB3b3VsZCB0YWtlIHVwIGEgbG90IG9mIG1lbW9yeSBhbmQgZ2VuZXJhdGUgYSBsb3Qgb2YgRE9NLiBTbywgaXRcclxuICogaGFzIHRvIGJlIFwic3dhcHBlZFwiIGJldHdlZW4gcGlja2VycyBhbmQgdmlld3MgdGhhdCB3YW50IHRvIHVzZSBpdC5cclxuICovXHJcbmNsYXNzIFN0YXRpb25DaG9vc2VyIGV4dGVuZHMgQ2hvb3NlclxyXG57XHJcbiAgICAvKiogU2hvcnRjdXQgcmVmZXJlbmNlcyB0byBhbGwgdGhlIGdlbmVyYXRlZCBBLVogc3RhdGlvbiBsaXN0IGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbVN0YXRpb25zIDogRGljdGlvbmFyeTxIVE1MRExpc3RFbGVtZW50PiA9IHt9O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKHBhcmVudCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnRhYkluZGV4ID0gMDtcclxuXHJcbiAgICAgICAgLy8gUG9wdWxhdGVzIHRoZSBsaXN0IG9mIHN0YXRpb25zIGZyb20gdGhlIGRhdGFiYXNlLiBXZSBkbyB0aGlzIGJ5IGNyZWF0aW5nIGEgZGxcclxuICAgICAgICAvLyBlbGVtZW50IGZvciBlYWNoIGxldHRlciBvZiB0aGUgYWxwaGFiZXQsIGNyZWF0aW5nIGEgZHQgZWxlbWVudCBoZWFkZXIsIGFuZCB0aGVuXHJcbiAgICAgICAgLy8gcG9wdWxhdGluZyB0aGUgZGwgd2l0aCBzdGF0aW9uIG5hbWUgZGQgY2hpbGRyZW4uXHJcbiAgICAgICAgT2JqZWN0LmtleXMoUkFHLmRhdGFiYXNlLnN0YXRpb25zKS5mb3JFYWNoKCB0aGlzLmFkZFN0YXRpb24uYmluZCh0aGlzKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXR0YWNoZXMgdGhpcyBjb250cm9sIHRvIHRoZSBnaXZlbiBwYXJlbnQgYW5kIHJlc2V0cyBzb21lIHN0YXRlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwaWNrZXIgUGlja2VyIHRvIGF0dGFjaCB0aGlzIGNvbnRyb2wgdG9cclxuICAgICAqIEBwYXJhbSBvblNlbGVjdCBEZWxlZ2F0ZSB0byBmaXJlIHdoZW4gY2hvb3NpbmcgYSBzdGF0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhdHRhY2gocGlja2VyOiBQaWNrZXIsIG9uU2VsZWN0OiBTZWxlY3REZWxlZ2F0ZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBwaWNrZXIuZG9tRm9ybTtcclxuICAgICAgICBsZXQgY3VycmVudCA9IHRoaXMuZG9tLnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIFJlLWVuYWJsZSBhbGwgZGlzYWJsZWQgZWxlbWVudHNcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5xdWVyeVNlbGVjdG9yQWxsKGBkZFtkaXNhYmxlZF1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaCggdGhpcy5lbmFibGUuYmluZCh0aGlzKSApO1xyXG5cclxuICAgICAgICBpZiAoIWN1cnJlbnQgfHwgY3VycmVudCAhPT0gcGFyZW50KVxyXG4gICAgICAgICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5kb20pO1xyXG5cclxuICAgICAgICB0aGlzLnZpc3VhbFVuc2VsZWN0KCk7XHJcbiAgICAgICAgdGhpcy5vblNlbGVjdCA9IG9uU2VsZWN0LmJpbmQocGlja2VyKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUHJlLXNlbGVjdHMgYSBzdGF0aW9uIGVudHJ5IGJ5IGl0cyBjb2RlICovXHJcbiAgICBwdWJsaWMgcHJlc2VsZWN0Q29kZShjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9IHRoaXMuZ2V0QnlDb2RlKGNvZGUpO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGVudHJ5KTtcclxuICAgICAgICBlbnRyeS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFbmFibGVzIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgb3Igc3RhdGlvbiBlbGVtZW50IGZvciBzZWxlY3Rpb24gKi9cclxuICAgIHB1YmxpYyBlbmFibGUoY29kZU9yTm9kZTogc3RyaW5nIHwgSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9ICh0eXBlb2YgY29kZU9yTm9kZSA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgICAgID8gdGhpcy5nZXRCeUNvZGUoY29kZU9yTm9kZSlcclxuICAgICAgICAgICAgOiBjb2RlT3JOb2RlO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGVudHJ5LnJlbW92ZUF0dHJpYnV0ZSgnZGlzYWJsZWQnKTtcclxuICAgICAgICBlbnRyeS50YWJJbmRleCA9IC0xO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIERpc2FibGVzIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgZnJvbSBzZWxlY3Rpb24gKi9cclxuICAgIHB1YmxpYyBkaXNhYmxlKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gdGhpcy5nZXRCeUNvZGUoY29kZSk7XHJcbiAgICAgICAgbGV0IG5leHQgID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGVudHJ5LCAxKTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBlbnRyeS5zZXRBdHRyaWJ1dGUoJ2Rpc2FibGVkJywgJycpO1xyXG4gICAgICAgIGVudHJ5LnJlbW92ZUF0dHJpYnV0ZSgndGFiaW5kZXgnKTtcclxuICAgICAgICBlbnRyeS50aXRsZSA9ICcnO1xyXG5cclxuICAgICAgICAvLyBTaGlmdCBmb2N1cyB0byBuZXh0IGF2YWlsYWJsZSBlbGVtZW50LCBmb3Iga2V5Ym9hcmQgbmF2aWdhdGlvblxyXG4gICAgICAgIGlmIChuZXh0KVxyXG4gICAgICAgICAgICBuZXh0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgYSBzdGF0aW9uJ3MgY2hvaWNlIGVsZW1lbnQgYnkgaXRzIGNvZGUgKi9cclxuICAgIHByaXZhdGUgZ2V0QnlDb2RlKGNvZGU6IHN0cmluZykgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmlucHV0Q2hvaWNlc1xyXG4gICAgICAgICAgICAucXVlcnlTZWxlY3RvcihgZGRbZGF0YS1jb2RlPSR7Y29kZX1dYCkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgKi9cclxuICAgIHByaXZhdGUgYWRkU3RhdGlvbihjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gUkFHLmRhdGFiYXNlLnN0YXRpb25zW2NvZGVdO1xyXG4gICAgICAgIGxldCBsZXR0ZXIgID0gc3RhdGlvblswXTtcclxuICAgICAgICBsZXQgZ3JvdXAgICA9IHRoaXMuZG9tU3RhdGlvbnNbbGV0dGVyXTtcclxuXHJcbiAgICAgICAgaWYgKCFncm91cClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBoZWFkZXIgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkdCcpO1xyXG4gICAgICAgICAgICBoZWFkZXIuaW5uZXJUZXh0ID0gbGV0dGVyLnRvVXBwZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGhlYWRlci50YWJJbmRleCAgPSAtMTtcclxuXHJcbiAgICAgICAgICAgIGdyb3VwID0gdGhpcy5kb21TdGF0aW9uc1tsZXR0ZXJdID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGwnKTtcclxuICAgICAgICAgICAgZ3JvdXAudGFiSW5kZXggPSA1MDtcclxuXHJcbiAgICAgICAgICAgIGdyb3VwLnNldEF0dHJpYnV0ZSgnZ3JvdXAnLCAnJyk7XHJcbiAgICAgICAgICAgIGdyb3VwLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmFwcGVuZENoaWxkKGdyb3VwKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBlbnRyeSAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcbiAgICAgICAgZW50cnkuZGF0YXNldFsnY29kZSddID0gY29kZTtcclxuICAgICAgICBlbnRyeS5pbm5lclRleHQgICAgICAgPSBSQUcuZGF0YWJhc2Uuc3RhdGlvbnNbY29kZV07XHJcbiAgICAgICAgZW50cnkudGl0bGUgICAgICAgICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICAgICAgZW50cnkudGFiSW5kZXggICAgICAgID0gLTE7XHJcblxyXG4gICAgICAgIGdyb3VwLmFwcGVuZENoaWxkKGVudHJ5KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFN0YXRpb24gbGlzdCBpdGVtIHRoYXQgY2FuIGJlIGRyYWdnZWQgYW5kIGRyb3BwZWQgKi9cclxuY2xhc3MgU3RhdGlvbkxpc3RJdGVtXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSwgZm9yIGVhY2ggaXRlbSBjcmVhdGVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFICAgID0gRE9NLnJlcXVpcmUoJyNzdGF0aW9uTGlzdEl0ZW1UZW1wbGF0ZScpO1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5pZCA9ICcnO1xyXG5cclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBpdGVtJ3MgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHN0YXRpb24gbGlzdCBpdGVtLCBtZWFudCBmb3IgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gY3JlYXRlIHRoaXMgaXRlbSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGNvZGU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICBpZiAoIVN0YXRpb25MaXN0SXRlbS5URU1QTEFURSlcclxuICAgICAgICAgICAgU3RhdGlvbkxpc3RJdGVtLmluaXQoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgICAgID0gU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICB0aGlzLmRvbS5pbm5lclRleHQgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uZGF0YXNldFsnY29kZSddID0gY29kZTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEJhc2UgY2xhc3MgZm9yIHBpY2tlciB2aWV3cyAqL1xyXG5hYnN0cmFjdCBjbGFzcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgZm9ybSBET00gZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbUZvcm0gICA6IEhUTUxGb3JtRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBoZWFkZXIgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbUhlYWRlciA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIEdldHMgdGhlIG5hbWUgb2YgdGhlIFhNTCB0YWcgdGhpcyBwaWNrZXIgaGFuZGxlcyAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IHhtbFRhZyAgICA6IHN0cmluZztcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2UgZWxlbWVudCBiZWluZyBlZGl0ZWQgYnkgdGhpcyBwaWNrZXIgKi9cclxuICAgIHByb3RlY3RlZCBkb21FZGl0aW5nPyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHBpY2tlciB0byBoYW5kbGUgdGhlIGdpdmVuIHBocmFzZSBlbGVtZW50IHR5cGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHhtbFRhZyBOYW1lIG9mIHRoZSBYTUwgdGFnIHRoaXMgcGlja2VyIHdpbGwgaGFuZGxlLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3IoeG1sVGFnOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgPSBET00ucmVxdWlyZShgIyR7eG1sVGFnfVBpY2tlcmApO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybSAgID0gRE9NLnJlcXVpcmUoJ2Zvcm0nLCAgIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlciA9IERPTS5yZXF1aXJlKCdoZWFkZXInLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy54bWxUYWcgICAgPSB4bWxUYWc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmNoYW5nZSAgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uaW5wdXQgICA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25jbGljayAgID0gdGhpcy5vbkNsaWNrLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9ua2V5ZG93biA9IHRoaXMub25JbnB1dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbnN1Ym1pdCAgPSB0aGlzLm9uU3VibWl0LmJpbmQodGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxsZWQgd2hlbiBmb3JtIGZpZWxkcyBjaGFuZ2UuIFRoZSBpbXBsZW1lbnRpbmcgcGlja2VyIHNob3VsZCB1cGRhdGUgYWxsIGxpbmtlZFxyXG4gICAgICogZWxlbWVudHMgKGUuZy4gb2Ygc2FtZSB0eXBlKSB3aXRoIHRoZSBuZXcgZGF0YSBoZXJlLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25DaGFuZ2UoZXY6IEV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIGEgbW91c2UgY2xpY2sgaGFwcGVucyBhbnl3aGVyZSBpbiBvciBvbiB0aGUgcGlja2VyJ3MgZm9ybSAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKiogQ2FsbGVkIHdoZW4gYSBrZXkgaXMgcHJlc3NlZCB3aGlsc3QgdGhlIHBpY2tlcidzIGZvcm0gaXMgZm9jdXNlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENhbGxlZCB3aGVuIEVOVEVSIGlzIHByZXNzZWQgd2hpbHN0IGEgZm9ybSBjb250cm9sIG9mIHRoZSBwaWNrZXIgaXMgZm9jdXNlZC5cclxuICAgICAqIEJ5IGRlZmF1bHQsIHRoaXMgd2lsbCB0cmlnZ2VyIHRoZSBvbkNoYW5nZSBoYW5kbGVyIGFuZCBjbG9zZSB0aGUgZGlhbG9nLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIHRoaXMub25DaGFuZ2UoZXYpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9wZW4gdGhpcyBwaWNrZXIgZm9yIGEgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQuIFRoZSBpbXBsZW1lbnRpbmcgcGlja2VyIHNob3VsZCBmaWxsXHJcbiAgICAgKiBpdHMgZm9ybSBlbGVtZW50cyB3aXRoIGRhdGEgZnJvbSB0aGUgY3VycmVudCBzdGF0ZSBhbmQgdGFyZ2V0ZWQgZWxlbWVudCBoZXJlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IHRhcmdldCBQaHJhc2UgZWxlbWVudCB0aGF0IHRoaXMgcGlja2VyIGlzIGJlaW5nIG9wZW5lZCBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nID0gdGFyZ2V0O1xyXG4gICAgICAgIHRoaXMubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlcyB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gRml4IGtleWJvYXJkIHN0YXlpbmcgb3BlbiBpbiBpT1Mgb24gY2xvc2VcclxuICAgICAgICBET00uYmx1ckFjdGl2ZSh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3NpdGlvbnMgdGhpcyBwaWNrZXIgcmVsYXRpdmUgdG8gdGhlIHRhcmdldCBwaHJhc2UgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIGxheW91dCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5kb21FZGl0aW5nKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCB0YXJnZXRSZWN0ID0gdGhpcy5kb21FZGl0aW5nLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGxldCBmdWxsV2lkdGggID0gdGhpcy5kb20uY2xhc3NMaXN0LmNvbnRhaW5zKCdmdWxsV2lkdGgnKTtcclxuICAgICAgICBsZXQgaXNNb2RhbCAgICA9IHRoaXMuZG9tLmNsYXNzTGlzdC5jb250YWlucygnbW9kYWwnKTtcclxuICAgICAgICBsZXQgZG9jVyAgICAgICA9IGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGg7XHJcbiAgICAgICAgbGV0IGRvY0ggICAgICAgPSBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodDtcclxuICAgICAgICBsZXQgZGlhbG9nWCAgICA9ICh0YXJnZXRSZWN0LmxlZnQgICB8IDApIC0gODtcclxuICAgICAgICBsZXQgZGlhbG9nWSAgICA9ICB0YXJnZXRSZWN0LmJvdHRvbSB8IDA7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1cgICAgPSAodGFyZ2V0UmVjdC53aWR0aCAgfCAwKSArIDE2O1xyXG5cclxuICAgICAgICAvLyBBZGp1c3QgaWYgaG9yaXpvbnRhbGx5IG9mZiBzY3JlZW5cclxuICAgICAgICBpZiAoIWZ1bGxXaWR0aCAmJiAhaXNNb2RhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEZvcmNlIGZ1bGwgd2lkdGggb24gbW9iaWxlXHJcbiAgICAgICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLndpZHRoID0gYDEwMCVgO1xyXG5cclxuICAgICAgICAgICAgICAgIGRpYWxvZ1ggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUud2lkdGggICAgPSBgaW5pdGlhbGA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS5taW5XaWR0aCA9IGAke2RpYWxvZ1d9cHhgO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChkaWFsb2dYICsgdGhpcy5kb20ub2Zmc2V0V2lkdGggPiBkb2NXKVxyXG4gICAgICAgICAgICAgICAgICAgIGRpYWxvZ1ggPSAodGFyZ2V0UmVjdC5yaWdodCB8IDApIC0gdGhpcy5kb20ub2Zmc2V0V2lkdGggKyA4O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGlja2VycyB0aGF0IGluc3RlYWQgdGFrZSB1cCB0aGUgd2hvbGUgZGlzcGxheS4gQ1NTIGlzbid0IHVzZWQgaGVyZSxcclxuICAgICAgICAvLyBiZWNhdXNlIHBlcmNlbnRhZ2UtYmFzZWQgbGVmdC90b3AgY2F1c2VzIHN1YnBpeGVsIGlzc3VlcyBvbiBDaHJvbWUuXHJcbiAgICAgICAgaWYgKGlzTW9kYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBkaWFsb2dYID0gRE9NLmlzTW9iaWxlID8gMCA6XHJcbiAgICAgICAgICAgICAgICAoIChkb2NXICAqIDAuMSkgLyAyICkgfCAwO1xyXG5cclxuICAgICAgICAgICAgZGlhbG9nWSA9IERPTS5pc01vYmlsZSA/IDAgOlxyXG4gICAgICAgICAgICAgICAgKCAoZG9jSCAqIDAuMSkgLyAyICkgfCAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgdG8gdG9wIGVkZ2Ugb2YgZG9jdW1lbnRcclxuICAgICAgICBlbHNlIGlmIChkaWFsb2dZIDwgMClcclxuICAgICAgICAgICAgZGlhbG9nWSA9IDA7XHJcblxyXG4gICAgICAgIC8vIEFkanVzdCBpZiB2ZXJ0aWNhbGx5IG9mZiBzY3JlZW5cclxuICAgICAgICBlbHNlIGlmIChkaWFsb2dZICsgdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ID4gZG9jSClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSAodGFyZ2V0UmVjdC50b3AgfCAwKSAtIHRoaXMuZG9tLm9mZnNldEhlaWdodCArIDE7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QuYWRkKCdiZWxvdycpO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LnJlbW92ZSgnYWJvdmUnKTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHN0aWxsIG9mZi1zY3JlZW4sIGNsYW1wIHRvIGJvdHRvbVxyXG4gICAgICAgICAgICBpZiAoZGlhbG9nWSArIHRoaXMuZG9tLm9mZnNldEhlaWdodCA+IGRvY0gpXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dZID0gZG9jSCAtIHRoaXMuZG9tLm9mZnNldEhlaWdodDtcclxuXHJcbiAgICAgICAgICAgIC8vIENsYW1wIHRvIHRvcCBlZGdlIG9mIGRvY3VtZW50LiBMaWtlbHkgaGFwcGVucyBpZiB0YXJnZXQgZWxlbWVudCBpcyBsYXJnZS5cclxuICAgICAgICAgICAgaWYgKGRpYWxvZ1kgPCAwKVxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWSA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QuYWRkKCdhYm92ZScpO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LnJlbW92ZSgnYmVsb3cnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLnN0eWxlLmxlZnQgPSAoZnVsbFdpZHRoID8gMCA6IGRpYWxvZ1gpICsgJ3B4JztcclxuICAgICAgICB0aGlzLmRvbS5zdHlsZS50b3AgID0gZGlhbG9nWSArICdweCc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJldHVybnMgdHJ1ZSBpZiBhbiBlbGVtZW50IGluIHRoaXMgcGlja2VyIGN1cnJlbnRseSBoYXMgZm9jdXMgKi9cclxuICAgIHB1YmxpYyBoYXNGb2N1cygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5jb250YWlucyhkb2N1bWVudC5hY3RpdmVFbGVtZW50KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgY29hY2ggcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBDb2FjaFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbGV0dGVyIGRyb3AtZG93biBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGV0dGVyIDogSFRNTFNlbGVjdEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBjb2FjaCBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignY29hY2gnKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlciA9IERPTS5yZXF1aXJlKCdzZWxlY3QnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMjY7IGkrKylcclxuICAgICAgICAgICAgRE9NLmFkZE9wdGlvbih0aGlzLmlucHV0TGV0dGVyLCBMLkxFVFRFUlNbaV0sIEwuTEVUVEVSU1tpXSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSB0YXJnZXQgY29udGV4dCdzIGNvYWNoIGxldHRlciAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0NPQUNIKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgPSBSQUcuc3RhdGUuZ2V0Q29hY2godGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIGNvYWNoIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfQ09BQ0hfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRDb2FjaCh0aGlzLmN1cnJlbnRDdHgsIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1jb2FjaF1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLmlucHV0TGV0dGVyLnZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGV4Y3VzZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIEV4Y3VzZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2V4Y3VzZScpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9FWENVU0UoKTtcclxuXHJcbiAgICAgICAgUkFHLmRhdGFiYXNlLmV4Y3VzZXMuZm9yRWFjaCggdiA9PiB0aGlzLmRvbUNob29zZXIuYWRkKHYpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgZXhjdXNlICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIC8vIFByZS1zZWxlY3QgdGhlIGN1cnJlbnRseSB1c2VkIGV4Y3VzZVxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5wcmVzZWxlY3QoUkFHLnN0YXRlLmV4Y3VzZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBleGN1c2UgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUuZXhjdXNlID0gZW50cnkuaW5uZXJUZXh0O1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCdleGN1c2UnLCBSQUcuc3RhdGUuZXhjdXNlKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgaW50ZWdlciBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIEludGVnZXJQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG51bWVyaWNhbCBpbnB1dCBzcGlubmVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0RGlnaXQgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG9wdGlvbmFsIHN1ZmZpeCBsYWJlbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21MYWJlbCAgIDogSFRNTExhYmVsRWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IGludGVnZXIgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eD8gOiBzdHJpbmc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9wdGlvbmFsIHNpbmd1bGFyIHN1ZmZpeCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgc2luZ3VsYXI/ICAgOiBzdHJpbmc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9wdGlvbmFsIHBsdXJhbCBzdWZmaXggZm9yIHRoZSBjdXJyZW50IGludGVnZXIgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHBsdXJhbD8gICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIFdoZXRoZXIgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgd2FudHMgd29yZCBkaWdpdHMgKi9cclxuICAgIHByaXZhdGUgd29yZHM/ICAgICAgOiBib29sZWFuO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2ludGVnZXInKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0ID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tTGFiZWwgICA9IERPTS5yZXF1aXJlKCdsYWJlbCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgLy8gaU9TIG5lZWRzIGRpZmZlcmVudCB0eXBlIGFuZCBwYXR0ZXJuIHRvIHNob3cgYSBudW1lcmljYWwga2V5Ym9hcmRcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnR5cGUgICAgPSAndGVsJztcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnBhdHRlcm4gPSAnWzAtOV0rJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSB0YXJnZXQgY29udGV4dCdzIGludGVnZXIgZGF0YSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuc2luZ3VsYXIgICA9IHRhcmdldC5kYXRhc2V0WydzaW5ndWxhciddO1xyXG4gICAgICAgIHRoaXMucGx1cmFsICAgICA9IHRhcmdldC5kYXRhc2V0WydwbHVyYWwnXTtcclxuICAgICAgICB0aGlzLndvcmRzICAgICAgPSBQYXJzZS5ib29sZWFuKHRhcmdldC5kYXRhc2V0Wyd3b3JkcyddIHx8ICdmYWxzZScpO1xyXG5cclxuICAgICAgICBsZXQgdmFsdWUgPSBSQUcuc3RhdGUuZ2V0SW50ZWdlcih0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICBpZiAgICAgICh0aGlzLnNpbmd1bGFyICYmIHZhbHVlID09PSAxKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMuc2luZ3VsYXI7XHJcbiAgICAgICAgZWxzZSBpZiAodGhpcy5wbHVyYWwgJiYgdmFsdWUgIT09IDEpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5wbHVyYWw7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9ICcnO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9JTlRFR0VSKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnZhbHVlICAgID0gdmFsdWUudG9TdHJpbmcoKTtcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgaW50ZWdlciBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX0lOVF9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgLy8gQ2FuJ3QgdXNlIHZhbHVlQXNOdW1iZXIgZHVlIHRvIGlPUyBpbnB1dCB0eXBlIHdvcmthcm91bmRzXHJcbiAgICAgICAgbGV0IGludCAgICA9IHBhcnNlSW50KHRoaXMuaW5wdXREaWdpdC52YWx1ZSk7XHJcbiAgICAgICAgbGV0IGludFN0ciA9ICh0aGlzLndvcmRzKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgLy8gSWdub3JlIGludmFsaWQgdmFsdWVzXHJcbiAgICAgICAgaWYgKCBpc05hTihpbnQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9ICcnO1xyXG5cclxuICAgICAgICBpZiAoaW50ID09PSAxICYmIHRoaXMuc2luZ3VsYXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3RoaXMuc2luZ3VsYXJ9YDtcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnNpbmd1bGFyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmIChpbnQgIT09IDEgJiYgdGhpcy5wbHVyYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3RoaXMucGx1cmFsfWA7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5wbHVyYWw7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0SW50ZWdlcih0aGlzLmN1cnJlbnRDdHgsIGludCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPWludGVnZXJdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gaW50U3RyKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIG5hbWVkIHRyYWluIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgTmFtZWRQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCduYW1lZCcpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9OQU1FRCgpO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2UubmFtZWQuZm9yRWFjaCggdiA9PiB0aGlzLmRvbUNob29zZXIuYWRkKHYpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgbmFtZVxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5wcmVzZWxlY3QoUkFHLnN0YXRlLm5hbWVkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIG5hbWVkIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlLm5hbWVkID0gZW50cnkuaW5uZXJUZXh0O1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCduYW1lZCcsIFJBRy5zdGF0ZS5uYW1lZCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBocmFzZXNldCBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFBocmFzZXNldFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgcmVmZXJlbmNlIHRhZyBmb3IgdGhlIGN1cnJlbnQgcGhyYXNlc2V0IGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRSZWY/IDogc3RyaW5nO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3BocmFzZXNldCcpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgcGhyYXNlc2V0J3MgbGlzdCBvZiBwaHJhc2VzICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIGxldCByZWYgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IGlkeCA9IHBhcnNlSW50KCBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnaWR4JykgKTtcclxuXHJcbiAgICAgICAgbGV0IHBocmFzZXNldCA9IFJBRy5kYXRhYmFzZS5nZXRQaHJhc2VzZXQocmVmKTtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfUFNFVF9VTktOT1dOKHJlZikgKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UmVmICAgICAgICAgID0gcmVmO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1BIUkFTRVNFVChyZWYpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIuY2xlYXIoKTtcclxuXHJcbiAgICAgICAgLy8gRm9yIGVhY2ggcGhyYXNlLCB3ZSBuZWVkIHRvIHJ1biBpdCB0aHJvdWdoIHRoZSBwaHJhc2VyIHVzaW5nIHRoZSBjdXJyZW50IHN0YXRlXHJcbiAgICAgICAgLy8gdG8gZ2VuZXJhdGUgXCJwcmV2aWV3c1wiIG9mIGhvdyB0aGUgcGhyYXNlIHdpbGwgbG9vay5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBocmFzZXNldC5jaGlsZHJlbi5sZW5ndGg7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBwaHJhc2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG5cclxuICAgICAgICAgICAgRE9NLmNsb25lSW50byhwaHJhc2VzZXQuY2hpbGRyZW5baV0gYXMgSFRNTEVsZW1lbnQsIHBocmFzZSk7XHJcbiAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MocGhyYXNlKTtcclxuXHJcbiAgICAgICAgICAgIHBocmFzZS5pbm5lclRleHQgICA9IERPTS5nZXRDbGVhbmVkVmlzaWJsZVRleHQocGhyYXNlKTtcclxuICAgICAgICAgICAgcGhyYXNlLmRhdGFzZXQuaWR4ID0gaS50b1N0cmluZygpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5kb21DaG9vc2VyLmFkZFJhdyhwaHJhc2UsIGkgPT09IGlkeCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgcGhyYXNlc2V0IGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRSZWYpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfUFNFVF9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgbGV0IGlkeCA9IHBhcnNlSW50KGVudHJ5LmRhdGFzZXRbJ2lkeCddISk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRQaHJhc2VzZXRJZHgodGhpcy5jdXJyZW50UmVmLCBpZHgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnJlZnJlc2hQaHJhc2VzZXQodGhpcy5jdXJyZW50UmVmKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGxhdGZvcm0gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBQbGF0Zm9ybVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbnVtZXJpY2FsIGlucHV0IHNwaW5uZXIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXREaWdpdCAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGxldHRlciBkcm9wLWRvd24gaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExldHRlciA6IEhUTUxTZWxlY3RFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3BsYXRmb3JtJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdCAgICAgICAgICA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyICAgICAgICAgPSBET00ucmVxdWlyZSgnc2VsZWN0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1BMQVRGT1JNKCk7XHJcblxyXG4gICAgICAgIC8vIGlPUyBuZWVkcyBkaWZmZXJlbnQgdHlwZSBhbmQgcGF0dGVybiB0byBzaG93IGEgbnVtZXJpY2FsIGtleWJvYXJkXHJcbiAgICAgICAgaWYgKERPTS5pc2lPUylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC50eXBlICAgID0gJ3RlbCc7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5wYXR0ZXJuID0gJ1swLTldKyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIHBsYXRmb3JtIGRhdGEgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgbGV0IHZhbHVlID0gUkFHLnN0YXRlLnBsYXRmb3JtO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQudmFsdWUgID0gdmFsdWVbMF07XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9IHZhbHVlWzFdO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBwbGF0Zm9ybSBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIElnbm9yZSBpbnZhbGlkIHZhbHVlc1xyXG4gICAgICAgIGlmICggaXNOYU4oIHBhcnNlSW50KHRoaXMuaW5wdXREaWdpdC52YWx1ZSkgKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnBsYXRmb3JtID0gW3RoaXMuaW5wdXREaWdpdC52YWx1ZSwgdGhpcy5pbnB1dExldHRlci52YWx1ZV07XHJcblxyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCAncGxhdGZvcm0nLCBSQUcuc3RhdGUucGxhdGZvcm0uam9pbignJykgKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNlcnZpY2UgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTZXJ2aWNlUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBzZXJ2aWNlIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdzZXJ2aWNlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2Uuc2VydmljZXMuZm9yRWFjaCggdiA9PiB0aGlzLmRvbUNob29zZXIuYWRkKHYpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3Mgc2VydmljZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NFUlZJQ0UodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgc2VydmljZVxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5wcmVzZWxlY3QoIFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKHRoaXMuY3VycmVudEN0eCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHNlcnZpY2UgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9TRVJWSUNFX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U2VydmljZSh0aGlzLmN1cnJlbnRDdHgsIGVudHJ5LmlubmVyVGV4dCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPXNlcnZpY2VdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gZW50cnkuaW5uZXJUZXh0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc3RhdGlvbiBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFN0YXRpb25QaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIHNoYXJlZCBzdGF0aW9uIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBjaG9vc2VyIDogU3RhdGlvbkNob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBzdGF0aW9uIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvbk9wZW4gZGVsZWdhdGUgZm9yIFN0YXRpb25QaWNrZXIgb3IgZm9yIFN0YXRpb25MaXN0UGlja2VyICovXHJcbiAgICBwcm90ZWN0ZWQgb25PcGVuICAgICA6ICh0YXJnZXQ6IEhUTUxFbGVtZW50KSA9PiB2b2lkO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcih0YWc6IHN0cmluZyA9ICdzdGF0aW9uJylcclxuICAgIHtcclxuICAgICAgICBzdXBlcih0YWcpO1xyXG5cclxuICAgICAgICBpZiAoIVN0YXRpb25QaWNrZXIuY2hvb3NlcilcclxuICAgICAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyID0gbmV3IFN0YXRpb25DaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcblxyXG4gICAgICAgIHRoaXMub25PcGVuID0gdGhpcy5vblN0YXRpb25QaWNrZXJPcGVuLmJpbmQodGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpcmVzIHRoZSBvbk9wZW4gZGVsZWdhdGUgcmVnaXN0ZXJlZCBmb3IgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuICAgICAgICB0aGlzLm9uT3Blbih0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBdHRhY2hlcyB0aGUgc3RhdGlvbiBjaG9vc2VyIGFuZCBmb2N1c2VzIGl0IG9udG8gdGhlIGN1cnJlbnQgZWxlbWVudCdzIHN0YXRpb24gKi9cclxuICAgIHByb3RlY3RlZCBvblN0YXRpb25QaWNrZXJPcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjaG9vc2VyICAgICA9IFN0YXRpb25QaWNrZXIuY2hvb3NlcjtcclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjaG9vc2VyLmF0dGFjaCh0aGlzLCB0aGlzLm9uU2VsZWN0U3RhdGlvbik7XHJcbiAgICAgICAgY2hvb3Nlci5wcmVzZWxlY3RDb2RlKCBSQUcuc3RhdGUuZ2V0U3RhdGlvbih0aGlzLmN1cnJlbnRDdHgpICk7XHJcbiAgICAgICAgY2hvb3Nlci5zZWxlY3RPbkNsaWNrID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU1RBVElPTih0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBzdGF0aW9uIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IFN0YXRpb25QaWNrZXIuY2hvb3Nlci5vbkNsaWNrKGV2KTsgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IFN0YXRpb25QaWNrZXIuY2hvb3Nlci5vbklucHV0KGV2KTsgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IFN0YXRpb25QaWNrZXIuY2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgc3RhdGlvbiBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdFN0YXRpb24oZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcXVlcnkgPSBgW2RhdGEtdHlwZT1zdGF0aW9uXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWA7XHJcbiAgICAgICAgbGV0IGNvZGUgID0gZW50cnkuZGF0YXNldFsnY29kZSddITtcclxuICAgICAgICBsZXQgbmFtZSAgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFN0YXRpb24odGhpcy5jdXJyZW50Q3R4LCBjb2RlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkocXVlcnkpXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IG5hbWUpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwic3RhdGlvblBpY2tlci50c1wiLz5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uLy4uL3ZlbmRvci9kcmFnZ2FibGUuZC50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc3RhdGlvbiBsaXN0IHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU3RhdGlvbkxpc3RQaWNrZXIgZXh0ZW5kcyBTdGF0aW9uUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjb250YWluZXIgZm9yIHRoZSBsaXN0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tTGlzdCAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtb2JpbGUtb25seSBhZGQgc3RhdGlvbiBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQWRkICAgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtb2JpbGUtb25seSBjbG9zZSBwaWNrZXIgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkNsb3NlICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgZHJvcCB6b25lIGZvciBkZWxldGluZyBzdGF0aW9uIGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbURlbCAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgYWN0dWFsIHNvcnRhYmxlIGxpc3Qgb2Ygc3RhdGlvbnMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMaXN0ICAgIDogSFRNTERMaXN0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gcGxhY2Vob2xkZXIgc2hvd24gaWYgdGhlIGxpc3QgaXMgZW1wdHkgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tRW1wdHlMaXN0IDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcihcInN0YXRpb25saXN0XCIpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUxpc3QgICAgICA9IERPTS5yZXF1aXJlKCcuc3RhdGlvbkxpc3QnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5idG5BZGQgICAgICAgPSBET00ucmVxdWlyZSgnLmFkZFN0YXRpb24nLCAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmJ0bkNsb3NlICAgICA9IERPTS5yZXF1aXJlKCcuY2xvc2VQaWNrZXInLCB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuZG9tRGVsICAgICAgID0gRE9NLnJlcXVpcmUoJy5kZWxTdGF0aW9uJywgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QgICAgPSBET00ucmVxdWlyZSgnZGwnLCAgICAgICAgICAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdCA9IERPTS5yZXF1aXJlKCdwJywgICAgICAgICAgICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMub25PcGVuICAgICAgID0gdGhpcy5vblN0YXRpb25MaXN0UGlja2VyT3Blbi5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICBuZXcgRHJhZ2dhYmxlLlNvcnRhYmxlKFt0aGlzLmlucHV0TGlzdCwgdGhpcy5kb21EZWxdLCB7IGRyYWdnYWJsZTogJ2RkJyB9KVxyXG4gICAgICAgICAgICAvLyBIYXZlIHRvIHVzZSB0aW1lb3V0LCB0byBsZXQgRHJhZ2dhYmxlIGZpbmlzaCBzb3J0aW5nIHRoZSBsaXN0XHJcbiAgICAgICAgICAgIC5vbiggJ2RyYWc6c3RvcCcsIGV2ID0+IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5vbkRyYWdTdG9wKGV2KSwgMSkgKVxyXG4gICAgICAgICAgICAub24oICdtaXJyb3I6Y3JlYXRlJywgdGhpcy5vbkRyYWdNaXJyb3JDcmVhdGUuYmluZCh0aGlzKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUG9wdWxhdGVzIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciwgd2l0aCB0aGUgc2VsZWN0ZWQgbGlzdC4gQmVjYXVzZSB0aGlzIHBpY2tlclxyXG4gICAgICogZXh0ZW5kcyBmcm9tIFN0YXRpb25MaXN0LCB0aGlzIGhhbmRsZXIgb3ZlcnJpZGVzIHRoZSAnb25PcGVuJyBkZWxlZ2F0ZSBwcm9wZXJ0eVxyXG4gICAgICogb2YgU3RhdGlvbkxpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBTdGF0aW9uIGxpc3QgZWRpdG9yIGVsZW1lbnQgdG8gb3BlbiBmb3JcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3RhdGlvbkxpc3RQaWNrZXJPcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFNpbmNlIHdlIHNoYXJlIHRoZSBzdGF0aW9uIHBpY2tlciB3aXRoIFN0YXRpb25MaXN0LCBncmFiIGl0XHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmF0dGFjaCh0aGlzLCB0aGlzLm9uQWRkU3RhdGlvbik7XHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLnNlbGVjdE9uQ2xpY2sgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgZW50cmllcyAgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbkxpc3QodGhpcy5jdXJyZW50Q3R4KS5zbGljZSgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TVEFUSU9OTElTVCh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICAvLyBSZW1vdmUgYWxsIG9sZCBsaXN0IGVsZW1lbnRzXHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuaW5uZXJIVE1MID0gJyc7XHJcblxyXG4gICAgICAgIC8vIEZpbmFsbHksIHBvcHVsYXRlIGxpc3QgZnJvbSB0aGUgY2xpY2tlZCBzdGF0aW9uIGxpc3QgZWxlbWVudFxyXG4gICAgICAgIGVudHJpZXMuZm9yRWFjaCggdiA9PiB0aGlzLmFkZCh2KSApO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZCB7IHN1cGVyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsaWNrIGV2ZW50cywgZm9yIGNob29zaW5nIGl0ZW1zICovXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub25DbGljayhldik7XHJcblxyXG4gICAgICAgIGlmIChldi50YXJnZXQgPT09IHRoaXMuYnRuQ2xvc2UpXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICAvLyBGb3IgbW9iaWxlIHVzZXJzLCBzd2l0Y2ggdG8gc3RhdGlvbiBjaG9vc2VyIHNjcmVlbiBpZiBcIkFkZC4uLlwiIHdhcyBjbGlja2VkXHJcbiAgICAgICAgaWYgKGV2LnRhcmdldCA9PT0gdGhpcy5idG5BZGQpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5hZGQoJ2FkZGluZ1N0YXRpb24nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBrZXlib2FyZCBuYXZpZ2F0aW9uIGZvciB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIgKi9cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vbklucHV0KGV2KTtcclxuXHJcbiAgICAgICAgbGV0IGtleSAgICAgPSBldi5rZXk7XHJcbiAgICAgICAgbGV0IGZvY3VzZWQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAvLyBPbmx5IGhhbmRsZSB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIgY29udHJvbFxyXG4gICAgICAgIGlmICggIWZvY3VzZWQgfHwgIXRoaXMuaW5wdXRMaXN0LmNvbnRhaW5zKGZvY3VzZWQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUga2V5Ym9hcmQgbmF2aWdhdGlvblxyXG4gICAgICAgIGlmIChrZXkgPT09ICdBcnJvd0xlZnQnIHx8IGtleSA9PT0gJ0Fycm93UmlnaHQnKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGRpciA9IChrZXkgPT09ICdBcnJvd0xlZnQnKSA/IC0xIDogMTtcclxuICAgICAgICAgICAgbGV0IG5hdiA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBmb2N1c2VkIGVsZW1lbnRcclxuICAgICAgICAgICAgaWYgKGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dExpc3QpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGV2YW50IHRvIGJlZ2lubmluZyBvciBlbmQgb2YgY29udGFpbmVyXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA9PT0gLTEpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5maXJzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQubGFzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChuYXYpIG5hdi5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGVudHJ5IGRlbGV0aW9uXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0RlbGV0ZScgfHwga2V5ID09PSAnQmFja3NwYWNlJylcclxuICAgICAgICBpZiAoZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0TGlzdClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEZvY3VzIG9uIG5leHQgZWxlbWVudCBvciBwYXJlbnQgb24gZGVsZXRlXHJcbiAgICAgICAgICAgIGxldCBuZXh0ID0gZm9jdXNlZC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgZm9jdXNlZC5uZXh0RWxlbWVudFNpYmxpbmcgICAgIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgdGhpcy5pbnB1dExpc3Q7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnJlbW92ZShmb2N1c2VkKTtcclxuICAgICAgICAgICAgbmV4dC5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlciBmb3Igd2hlbiBhIHN0YXRpb24gaXMgY2hvc2VuICovXHJcbiAgICBwcml2YXRlIG9uQWRkU3RhdGlvbihlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXdFbnRyeSA9IHRoaXMuYWRkKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG5cclxuICAgICAgICAvLyBTd2l0Y2ggYmFjayB0byBidWlsZGVyIHNjcmVlbiwgaWYgb24gbW9iaWxlXHJcbiAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LnJlbW92ZSgnYWRkaW5nU3RhdGlvbicpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlKCk7XHJcblxyXG4gICAgICAgIC8vIEZvY3VzIG9ubHkgaWYgb24gbW9iaWxlLCBzaW5jZSB0aGUgc3RhdGlvbiBsaXN0IGlzIG9uIGEgZGVkaWNhdGVkIHNjcmVlblxyXG4gICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgICAgIG5ld0VudHJ5LmRvbS5mb2N1cygpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgbmV3RW50cnkuZG9tLnNjcm9sbEludG9WaWV3KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpeGVzIG1pcnJvcnMgbm90IGhhdmluZyBjb3JyZWN0IHdpZHRoIG9mIHRoZSBzb3VyY2UgZWxlbWVudCwgb24gY3JlYXRlICovXHJcbiAgICBwcml2YXRlIG9uRHJhZ01pcnJvckNyZWF0ZShldjogRHJhZ2dhYmxlLkRyYWdFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFldi5kYXRhLnNvdXJjZSB8fCAhZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSlcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9TTF9EUkFHX01JU1NJTkcoKSApO1xyXG5cclxuICAgICAgICBldi5kYXRhLnNvdXJjZS5zdHlsZS53aWR0aCA9IGV2LmRhdGEub3JpZ2luYWxTb3VyY2UuY2xpZW50V2lkdGggKyAncHgnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGRyYWdnYWJsZSBzdGF0aW9uIG5hbWUgYmVpbmcgZHJvcHBlZCAqL1xyXG4gICAgcHJpdmF0ZSBvbkRyYWdTdG9wKGV2OiBEcmFnZ2FibGUuRHJhZ0V2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIWV2LmRhdGEub3JpZ2luYWxTb3VyY2UpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKGV2LmRhdGEub3JpZ2luYWxTb3VyY2UucGFyZW50RWxlbWVudCA9PT0gdGhpcy5kb21EZWwpXHJcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGV2LmRhdGEub3JpZ2luYWxTb3VyY2UpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYW5kIGFkZHMgYSBuZXcgZW50cnkgZm9yIHRoZSBidWlsZGVyIGxpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBjcmVhdGUgYW4gaXRlbSBmb3JcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhZGQoY29kZTogc3RyaW5nKSA6IFN0YXRpb25MaXN0SXRlbVxyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXdFbnRyeSA9IG5ldyBTdGF0aW9uTGlzdEl0ZW0oY29kZSk7XHJcblxyXG4gICAgICAgIC8vIEFkZCB0aGUgbmV3IGVudHJ5IHRvIHRoZSBzb3J0YWJsZSBsaXN0XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuYXBwZW5kQ2hpbGQobmV3RW50cnkuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcclxuXHJcbiAgICAgICAgLy8gRGlzYWJsZSB0aGUgYWRkZWQgc3RhdGlvbiBpbiB0aGUgY2hvb3NlclxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5kaXNhYmxlKGNvZGUpO1xyXG5cclxuICAgICAgICAvLyBEZWxldGUgaXRlbSBvbiBkb3VibGUgY2xpY2tcclxuICAgICAgICBuZXdFbnRyeS5kb20ub25kYmxjbGljayA9IF8gPT4gdGhpcy5yZW1vdmUobmV3RW50cnkuZG9tKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIG5ld0VudHJ5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVtb3ZlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBlbnRyeSBlbGVtZW50IGZyb20gdGhlIGJ1aWxkZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVudHJ5IEVsZW1lbnQgb2YgdGhlIHN0YXRpb24gZW50cnkgdG8gcmVtb3ZlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcmVtb3ZlKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhdGhpcy5kb21MaXN0LmNvbnRhaW5zKGVudHJ5KSApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdBdHRlbXB0ZWQgdG8gcmVtb3ZlIGVudHJ5IG5vdCBvbiBzdGF0aW9uIGxpc3QgYnVpbGRlcicpO1xyXG5cclxuICAgICAgICAvLyBFbmFibGVkIHRoZSByZW1vdmVkIHN0YXRpb24gaW4gdGhlIGNob29zZXJcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuZW5hYmxlKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG5cclxuICAgICAgICBlbnRyeS5yZW1vdmUoKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5pbnB1dExpc3QuY2hpbGRyZW4ubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgc3RhdGlvbiBsaXN0IGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNoaWxkcmVuID0gdGhpcy5pbnB1dExpc3QuY2hpbGRyZW47XHJcblxyXG4gICAgICAgIC8vIERvbid0IHVwZGF0ZSBpZiBsaXN0IGlzIGVtcHR5XHJcbiAgICAgICAgaWYgKGNoaWxkcmVuLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgbGlzdCA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVudHJ5ID0gY2hpbGRyZW5baV0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICBsaXN0LnB1c2goZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgdGV4dExpc3QgPSBTdHJpbmdzLmZyb21TdGF0aW9uTGlzdChsaXN0LnNsaWNlKCksIHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ICAgID0gYFtkYXRhLXR5cGU9c3RhdGlvbmxpc3RdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYDtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFN0YXRpb25MaXN0KHRoaXMuY3VycmVudEN0eCwgbGlzdCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KHF1ZXJ5KVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0ZXh0TGlzdCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHRpbWUgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBUaW1lUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyB0aW1lIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRUaW1lOiBIVE1MSW5wdXRFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgdGltZSBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigndGltZScpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0VGltZSA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyB0aW1lICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfVElNRSh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0VGltZS52YWx1ZSA9IFJBRy5zdGF0ZS5nZXRUaW1lKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgdGltZSBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1RJTUVfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRUaW1lKHRoaXMuY3VycmVudEN0eCwgdGhpcy5pbnB1dFRpbWUudmFsdWUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT10aW1lXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuaW5wdXRUaW1lLnZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBMYW5ndWFnZSBlbnRyaWVzIGFyZSB0ZW1wbGF0ZSBkZWxlZ2F0ZXMgKi9cclxudHlwZSBMYW5ndWFnZUVudHJ5ID0gKC4uLnBhcnRzOiBzdHJpbmdbXSkgPT4gc3RyaW5nIDtcclxuXHJcbmFic3RyYWN0IGNsYXNzIEJhc2VMYW5ndWFnZVxyXG57XHJcbiAgICBbaW5kZXg6IHN0cmluZ10gOiBMYW5ndWFnZUVudHJ5IHwgc3RyaW5nIHwgc3RyaW5nW107XHJcblxyXG4gICAgLy8gUkFHXHJcblxyXG4gICAgLyoqIFdlbGNvbWUgbWVzc2FnZSwgc2hvd24gb24gbWFycXVlZSBvbiBmaXJzdCBsb2FkICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBXRUxDT01FICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXF1aXJlZCBET00gZWxlbWVudCBpcyBtaXNzaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBET01fTUlTU0lORyAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXF1aXJlZCBlbGVtZW50IGF0dHJpYnV0ZSBpcyBtaXNzaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBBVFRSX01JU1NJTkcgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXF1aXJlZCBkYXRhc2V0IGVudHJ5IGlzIG1pc3NpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERBVEFfTUlTU0lORyAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEJhZCBkaXJlY3Rpb24gYXJndW1lbnQgZ2l2ZW4gdG8gZGlyZWN0aW9uYWwgZnVuY3Rpb24gKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEJBRF9ESVJFQ1RJT04gOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEJhZCBib29sZWFuIHN0cmluZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQkFEX0JPT0xFQU4gICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gU3RhdGVcclxuXHJcbiAgICAvKiogU3RhdGUgc3VjY2Vzc2Z1bGx5IGxvYWRlZCBmcm9tIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX0ZST01fU1RPUkFHRSAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU3RhdGUgc3VjY2Vzc2Z1bGx5IHNhdmVkIHRvIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1RPX1NUT1JBR0UgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogSW5zdHJ1Y3Rpb25zIGZvciBjb3B5L3Bhc3Rpbmcgc2F2ZWQgc3RhdGUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX0NPUFlfUEFTVEUgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogSGVhZGVyIGZvciBkdW1wZWQgcmF3IHN0YXRlIEpTT04gKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1JBV19KU09OICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQ291bGQgbm90IHNhdmUgc3RhdGUgdG8gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfU0FWRV9GQUlMICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBObyBzdGF0ZSB3YXMgYXZhaWxhYmxlIHRvIGxvYWQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1NBVkVfTUlTU0lORyAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogTm9uLWV4aXN0ZW50IHBocmFzZXNldCByZWZlcmVuY2Ugd2hlbiBnZXR0aW5nIGZyb20gc3RhdGUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX05PTkVYSVNUQU5UX1BIUkFTRVNFVCA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gQ29uZmlnXHJcblxyXG4gICAgLyoqIENvbmZpZyBmYWlsZWQgdG8gbG9hZCBmcm9tIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IENPTkZJR19MT0FEX0ZBSUwgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBDb25maWcgZmFpbGVkIHRvIHNhdmUgdG8gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQ09ORklHX1NBVkVfRkFJTCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIENvbmZpZyBmYWlsZWQgdG8gY2xlYXIgZnJvbSBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBDT05GSUdfUkVTRVRfRkFJTCA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gRGF0YWJhc2VcclxuXHJcbiAgICAvKiogR2l2ZW4gZWxlbWVudCBpc24ndCBhIHBocmFzZXNldCBpRnJhbWUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERCX0VMRU1FTlRfTk9UX1BIUkFTRVNFVF9JRlJBTUUgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFVua25vd24gc3RhdGlvbiBjb2RlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9VTktOT1dOX1NUQVRJT04gICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTdGF0aW9uIGNvZGUgd2l0aCBibGFuayBuYW1lICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9FTVBUWV9TVEFUSU9OICAgICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBQaWNraW5nIHRvbyBtYW55IHN0YXRpb24gY29kZXMgaW4gb25lIGdvICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9UT09fTUFOWV9TVEFUSU9OUyAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBUb29sYmFyXHJcblxyXG4gICAgLy8gVG9vbHRpcHMvdGl0bGUgdGV4dCBmb3IgdG9vbGJhciBidXR0b25zXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1BMQVkgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU1RPUCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TSFVGRkxFICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NBVkUgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfTE9BRCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TRVRUSU5HUyA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gRWRpdG9yXHJcblxyXG4gICAgLy8gVG9vbHRpcHMvdGl0bGUgdGV4dCBmb3IgZWRpdG9yIGVsZW1lbnRzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9DT0FDSCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9FWENVU0UgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9JTlRFR0VSICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9OQU1FRCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9PUFRfT1BFTiAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9PUFRfQ0xPU0UgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9QSFJBU0VTRVQgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9QTEFURk9STSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9TRVJWSUNFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9TVEFUSU9OICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9TVEFUSU9OTElTVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9USU1FICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLyoqIEluaXRpYWwgbWVzc2FnZSB3aGVuIHNldHRpbmcgdXAgZWRpdG9yICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBFRElUT1JfSU5JVCAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcGxhY2VtZW50IHRleHQgZm9yIHVua25vd24gZWRpdG9yIGVsZW1lbnRzICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBFRElUT1JfVU5LTk9XTl9FTEVNRU5UICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcGxhY2VtZW50IHRleHQgZm9yIGVkaXRvciBwaHJhc2VzIHdpdGggdW5rbm93biByZWZlcmVuY2UgaWRzICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBFRElUT1JfVU5LTk9XTl9QSFJBU0UgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcGxhY2VtZW50IHRleHQgZm9yIGVkaXRvciBwaHJhc2VzZXRzIHdpdGggdW5rbm93biByZWZlcmVuY2UgaWRzICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBFRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFBocmFzZXJcclxuXHJcbiAgICAvKiogVG9vIG1hbnkgbGV2ZWxzIG9mIHJlY3Vyc2lvbiBpbiB0aGUgcGhyYXNlciAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUEhSQVNFUl9UT09fUkVDVVJTSVZFIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBQaWNrZXJzXHJcblxyXG4gICAgLy8gSGVhZGVycyBmb3IgcGlja2VyIGRpYWxvZ3NcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9DT0FDSCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfRVhDVVNFICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX0lOVEVHRVIgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9OQU1FRCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfUEhSQVNFU0VUICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1BMQVRGT1JNICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9TRVJWSUNFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfU1RBVElPTiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1NUQVRJT05MSVNUIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9USU1FICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gVG9vbHRpcHMvdGl0bGUgYW5kIHBsYWNlaG9sZGVyIHRleHQgZm9yIHBpY2tlciBjb250cm9sc1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9HRU5FUklDX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0dFTkVSSUNfUEggICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfQ09BQ0hfVCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9FWENVU0VfVCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0VYQ1VTRV9QSCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfRVhDVVNFX0lURU1fVCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9JTlRfVCAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX05BTUVEX1QgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfTkFNRURfUEggICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9OQU1FRF9JVEVNX1QgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfVCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9QSCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX0lURU1fVCAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BMQVRfTlVNQkVSX1QgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUExBVF9MRVRURVJfVCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZfUEggICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVl9JVEVNX1QgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TVEFUSU9OX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NUQVRJT05fUEggICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU1RBVElPTl9JVEVNX1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9BREQgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0FERF9UICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQ0xPU0UgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9DTE9TRV9UICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0VNUFRZICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfRFJBR19UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9ERUxFVEUgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RFTEVURV9UICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfSVRFTV9UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9USU1FX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLyoqIENvYWNoIHBpY2tlcidzIG9uQ2hhbmdlIGZpcmVkIHdpdGhvdXQgY29udGV4dCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9DT0FDSF9NSVNTSU5HX1NUQVRFICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEludGVnZXIgcGlja2VyJ3Mgb25DaGFuZ2UgZmlyZWQgd2l0aG91dCBjb250ZXh0ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0lOVF9NSVNTSU5HX1NUQVRFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUGhyYXNlc2V0IHBpY2tlcidzIG9uU2VsZWN0IGZpcmVkIHdpdGhvdXQgcmVmZXJlbmNlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfTUlTU0lOR19TVEFURSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU2VydmljZSBwaWNrZXIncyBvblNlbGVjdCBmaXJlZCB3aXRob3V0IHJlZmVyZW5jZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWSUNFX01JU1NJTkdfU1RBVEUgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFNlcnZpY2UgcGlja2VyJ3Mgb25DaGFuZ2UgZmlyZWQgd2l0aG91dCByZWZlcmVuY2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfVElNRV9NSVNTSU5HX1NUQVRFICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBQaHJhc2VzZXQgcGlja2VyIG9wZW5lZCBmb3IgdW5rbm93biBwaHJhc2VzZXQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9VTktOT1dOICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBEcmFnIG1pcnJvciBjcmVhdGUgZXZlbnQgaW4gc3RhdGlvbiBsaXN0IG1pc3Npbmcgc3RhdGUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfRFJBR19NSVNTSU5HICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBTZXR0aW5nc1xyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIGFuZCBsYWJlbCB0ZXh0IGZvciBzZXR0aW5ncyBlbGVtZW50c1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVQgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9DT05GSVJNICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfQ09ORklSTV9UIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX0RPTkUgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TQVZFICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU0FWRV9UICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSCAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfQ0hPSUNFICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX0VNUFRZICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9WT0wgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfUElUQ0ggICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1JBVEUgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9URVNUICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfVEVTVF9UICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfTEVHQUwgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBVSSBjb250cm9sc1xyXG5cclxuICAgIC8qKiBIZWFkZXIgZm9yIHRoZSBcInRvbyBzbWFsbFwiIHdhcm5pbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFdBUk5fU0hPUlRfSEVBREVSIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBCb2R5IHRleHQgZm9yIHRoZSBcInRvbyBzbWFsbFwiIHdhcm5pbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFdBUk5fU0hPUlQgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBNaXNjLiBjb25zdGFudHNcclxuXHJcbiAgICAvKiogQXJyYXkgb2YgdGhlIGVudGlyZSBhbHBoYWJldCBvZiB0aGUgbGFuZ3VhZ2UsIGZvciBjb2FjaCBsZXR0ZXJzICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBMRVRURVJTIDogc3RyaW5nO1xyXG4gICAgLyoqIEFycmF5IG9mIG51bWJlcnMgYXMgd29yZHMgKGUuZy4gemVybywgb25lLCB0d28pLCBtYXRjaGluZyB0aGVpciBpbmRleCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRElHSVRTICA6IHN0cmluZ1tdO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiQmFzZUxhbmd1YWdlLnRzXCIvPlxyXG5cclxuY2xhc3MgRW5nbGlzaExhbmd1YWdlIGV4dGVuZHMgQmFzZUxhbmd1YWdlXHJcbntcclxuICAgIFdFTENPTUUgICAgICAgPSAoKSA9PiAnV2VsY29tZSB0byBSYWlsIEFubm91bmNlbWVudCBHZW5lcmF0b3IuJztcclxuICAgIERPTV9NSVNTSU5HICAgPSAocTogc3RyaW5nKSA9PiBgUmVxdWlyZWQgRE9NIGVsZW1lbnQgaXMgbWlzc2luZzogJyR7cX0nYDtcclxuICAgIEFUVFJfTUlTU0lORyAgPSAoYTogc3RyaW5nKSA9PiBgUmVxdWlyZWQgYXR0cmlidXRlIGlzIG1pc3Npbmc6ICcke2F9J2A7XHJcbiAgICBEQVRBX01JU1NJTkcgID0gKGs6IHN0cmluZykgPT4gYFJlcXVpcmVkIGRhdGFzZXQga2V5IGlzIG1pc3Npbmcgb3IgZW1wdHk6ICcke2t9J2A7XHJcbiAgICBCQURfRElSRUNUSU9OID0gKHY6IHN0cmluZykgPT4gYERpcmVjdGlvbiBuZWVkcyB0byBiZSAtMSBvciAxLCBub3QgJyR7dn0nYDtcclxuICAgIEJBRF9CT09MRUFOICAgPSAodjogc3RyaW5nKSA9PiBgR2l2ZW4gc3RyaW5nIGRvZXMgbm90IHJlcHJlc2VudCBhIGJvb2xlYW46ICcke3Z9J2A7XHJcblxyXG4gICAgU1RBVEVfRlJPTV9TVE9SQUdFICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnU3RhdGUgaGFzIGJlZW4gbG9hZGVkIGZyb20gc3RvcmFnZS4nO1xyXG4gICAgU1RBVEVfVE9fU1RPUkFHRSAgICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnU3RhdGUgaGFzIGJlZW4gc2F2ZWQgdG8gc3RvcmFnZSwgYW5kIGR1bXBlZCB0byBjb25zb2xlLic7XHJcbiAgICBTVEFURV9DT1BZX1BBU1RFICAgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICclY0NvcHkgYW5kIHBhc3RlIHRoaXMgaW4gY29uc29sZSB0byBsb2FkIGxhdGVyOic7XHJcbiAgICBTVEFURV9SQVdfSlNPTiAgICAgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICclY1JhdyBKU09OIHN0YXRlOic7XHJcbiAgICBTVEFURV9TQVZFX0ZBSUwgICAgICAgICAgICAgPSAobXNnOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFNvcnJ5LCBzdGF0ZSBjb3VsZCBub3QgYmUgc2F2ZWQgdG8gc3RvcmFnZTogJHttc2d9LmA7XHJcbiAgICBTVEFURV9TQVZFX01JU1NJTkcgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTb3JyeSwgbm8gc3RhdGUgd2FzIGZvdW5kIGluIHN0b3JhZ2UuJztcclxuICAgIFNUQVRFX05PTkVYSVNUQU5UX1BIUkFTRVNFVCA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYEF0dGVtcHRlZCB0byBnZXQgY2hvc2VuIGluZGV4IGZvciBwaHJhc2VzZXQgKCR7cn0pIHRoYXQgZG9lc24ndCBleGlzdGA7XHJcblxyXG4gICAgQ09ORklHX0xPQURfRkFJTCAgPSAobXNnOiBzdHJpbmcpID0+IGBDb3VsZCBub3QgbG9hZCBzZXR0aW5nczogJHttc2d9YDtcclxuICAgIENPTkZJR19TQVZFX0ZBSUwgID0gKG1zZzogc3RyaW5nKSA9PiBgQ291bGQgbm90IHNhdmUgc2V0dGluZ3M6ICR7bXNnfWA7XHJcbiAgICBDT05GSUdfUkVTRVRfRkFJTCA9IChtc2c6IHN0cmluZykgPT4gYENvdWxkIG5vdCBjbGVhciBzZXR0aW5nczogJHttc2d9YDtcclxuXHJcbiAgICBEQl9FTEVNRU5UX05PVF9QSFJBU0VTRVRfSUZSQU1FID0gKGU6IHN0cmluZykgPT5cclxuICAgICAgICBgQ29uZmlndXJlZCBwaHJhc2VzZXQgZWxlbWVudCBxdWVyeSAoJHtlfSkgZG9lcyBub3QgcG9pbnQgdG8gYW4gaUZyYW1lIGVtYmVkYDtcclxuICAgIERCX1VOS05PV05fU1RBVElPTiAgID0gKGM6IHN0cmluZykgPT4gYFVOS05PV04gU1RBVElPTjogJHtjfWA7XHJcbiAgICBEQl9FTVBUWV9TVEFUSU9OICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFN0YXRpb24gZGF0YWJhc2UgYXBwZWFycyB0byBjb250YWluIGFuIGVtcHR5IG5hbWUgZm9yIGNvZGUgJyR7Y30nYDtcclxuICAgIERCX1RPT19NQU5ZX1NUQVRJT05TID0gKCkgPT4gJ1BpY2tpbmcgdG9vIG1hbnkgc3RhdGlvbnMgdGhhbiB0aGVyZSBhcmUgYXZhaWxhYmxlJztcclxuXHJcbiAgICBUT09MQkFSX1BMQVkgICAgID0gKCkgPT4gJ1BsYXkgcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU1RPUCAgICAgPSAoKSA9PiAnU3RvcCBwbGF5aW5nIHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NIVUZGTEUgID0gKCkgPT4gJ0dlbmVyYXRlIHJhbmRvbSBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TQVZFICAgICA9ICgpID0+ICdTYXZlIHN0YXRlIHRvIHN0b3JhZ2UnO1xyXG4gICAgVE9PTEJBUl9MT0FEICAgICA9ICgpID0+ICdSZWNhbGwgc3RhdGUgZnJvbSBzdG9yYWdlJztcclxuICAgIFRPT0xCQVJfU0VUVElOR1MgPSAoKSA9PiAnT3BlbiBzZXR0aW5ncyc7XHJcblxyXG4gICAgVElUTEVfQ09BQ0ggICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBjb2FjaCAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9FWENVU0UgICAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgJ0NsaWNrIHRvIGNoYW5nZSB0aGlzIGV4Y3VzZSc7XHJcbiAgICBUSVRMRV9JTlRFR0VSICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIG51bWJlciAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9OQU1FRCAgICAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgXCJDbGljayB0byBjaGFuZ2UgdGhpcyB0cmFpbidzIG5hbWVcIjtcclxuICAgIFRJVExFX09QVF9PUEVOICAgID0gKHQ6IHN0cmluZywgcjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBvcGVuIHRoaXMgb3B0aW9uYWwgJHt0fSAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9PUFRfQ0xPU0UgICA9ICh0OiBzdHJpbmcsIHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2xvc2UgdGhpcyBvcHRpb25hbCAke3R9ICgnJHtyfScpYDtcclxuICAgIFRJVExFX1BIUkFTRVNFVCAgID0gKHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoZSBwaHJhc2UgdXNlZCBpbiB0aGlzIHNlY3Rpb24gKCcke3J9JylgO1xyXG4gICAgVElUTEVfUExBVEZPUk0gICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgIFwiQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdHJhaW4ncyBwbGF0Zm9ybVwiO1xyXG4gICAgVElUTEVfU0VSVklDRSAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBzZXJ2aWNlICgnJHtjfScpYDtcclxuICAgIFRJVExFX1NUQVRJT04gICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc3RhdGlvbiAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9TVEFUSU9OTElTVCA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHN0YXRpb24gbGlzdCAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9USU1FICAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHRpbWUgKCcke2N9JylgO1xyXG5cclxuICAgIEVESVRPUl9JTklUICAgICAgICAgICAgICA9ICgpID0+ICdQbGVhc2Ugd2FpdC4uLic7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9FTEVNRU5UICAgPSAobjogc3RyaW5nKSA9PiBgKFVOS05PV04gWE1MIEVMRU1FTlQ6ICR7bn0pYDtcclxuICAgIEVESVRPUl9VTktOT1dOX1BIUkFTRSAgICA9IChyOiBzdHJpbmcpID0+IGAoVU5LTk9XTiBQSFJBU0U6ICR7cn0pYDtcclxuICAgIEVESVRPUl9VTktOT1dOX1BIUkFTRVNFVCA9IChyOiBzdHJpbmcpID0+IGAoVU5LTk9XTiBQSFJBU0VTRVQ6ICR7cn0pYDtcclxuXHJcbiAgICBQSFJBU0VSX1RPT19SRUNVUlNJVkUgPSAoKSA9PlxyXG4gICAgICAgICdUb28gbWFueSBsZXZlbHMgb2YgcmVjdXJzaW9uIHdoaWxzdCBwcm9jZXNzaW5nIHBocmFzZSc7XHJcblxyXG4gICAgSEVBREVSX0NPQUNIICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIGNvYWNoIGxldHRlciBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9FWENVU0UgICAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgJ1BpY2sgYW4gZXhjdXNlJztcclxuICAgIEhFQURFUl9JTlRFR0VSICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBudW1iZXIgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfTkFNRUQgICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGEgbmFtZWQgdHJhaW4nO1xyXG4gICAgSEVBREVSX1BIUkFTRVNFVCAgID0gKHI6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHBocmFzZSBmb3IgdGhlICcke3J9JyBzZWN0aW9uYDtcclxuICAgIEhFQURFUl9QTEFURk9STSAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgJ1BpY2sgYSBwbGF0Zm9ybSc7XHJcbiAgICBIRUFERVJfU0VSVklDRSAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgc2VydmljZSBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9TVEFUSU9OICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBzdGF0aW9uIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1NUQVRJT05MSVNUID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQnVpbGQgYSBzdGF0aW9uIGxpc3QgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfVElNRSAgICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgdGltZSBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuXHJcbiAgICBQX0dFTkVSSUNfVCAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgY2hvaWNlcyc7XHJcbiAgICBQX0dFTkVSSUNfUEggICAgID0gKCkgPT4gJ0ZpbHRlciBjaG9pY2VzLi4uJztcclxuICAgIFBfQ09BQ0hfVCAgICAgICAgPSAoKSA9PiAnQ29hY2ggbGV0dGVyJztcclxuICAgIFBfRVhDVVNFX1QgICAgICAgPSAoKSA9PiAnTGlzdCBvZiBkZWxheSBvciBjYW5jZWxsYXRpb24gZXhjdXNlcyc7XHJcbiAgICBQX0VYQ1VTRV9QSCAgICAgID0gKCkgPT4gJ0ZpbHRlciBleGN1c2VzLi4uJztcclxuICAgIFBfRVhDVVNFX0lURU1fVCAgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgZXhjdXNlJztcclxuICAgIFBfSU5UX1QgICAgICAgICAgPSAoKSA9PiAnSW50ZWdlciB2YWx1ZSc7XHJcbiAgICBQX05BTUVEX1QgICAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgdHJhaW4gbmFtZXMnO1xyXG4gICAgUF9OQU1FRF9QSCAgICAgICA9ICgpID0+ICdGaWx0ZXIgdHJhaW4gbmFtZS4uLic7XHJcbiAgICBQX05BTUVEX0lURU1fVCAgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIG5hbWUnO1xyXG4gICAgUF9QU0VUX1QgICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHBocmFzZXMnO1xyXG4gICAgUF9QU0VUX1BIICAgICAgICA9ICgpID0+ICdGaWx0ZXIgcGhyYXNlcy4uLic7XHJcbiAgICBQX1BTRVRfSVRFTV9UICAgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIHBocmFzZSc7XHJcbiAgICBQX1BMQVRfTlVNQkVSX1QgID0gKCkgPT4gJ1BsYXRmb3JtIG51bWJlcic7XHJcbiAgICBQX1BMQVRfTEVUVEVSX1QgID0gKCkgPT4gJ09wdGlvbmFsIHBsYXRmb3JtIGxldHRlcic7XHJcbiAgICBQX1NFUlZfVCAgICAgICAgID0gKCkgPT4gJ0xpc3Qgb2Ygc2VydmljZSBuYW1lcyc7XHJcbiAgICBQX1NFUlZfUEggICAgICAgID0gKCkgPT4gJ0ZpbHRlciBzZXJ2aWNlcy4uLic7XHJcbiAgICBQX1NFUlZfSVRFTV9UICAgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIHNlcnZpY2UnO1xyXG4gICAgUF9TVEFUSU9OX1QgICAgICA9ICgpID0+ICdMaXN0IG9mIHN0YXRpb24gbmFtZXMnO1xyXG4gICAgUF9TVEFUSU9OX1BIICAgICA9ICgpID0+ICdGaWx0ZXIgc3RhdGlvbnMuLi4nO1xyXG4gICAgUF9TVEFUSU9OX0lURU1fVCA9ICgpID0+ICdDbGljayB0byBzZWxlY3Qgb3IgYWRkIHRoaXMgc3RhdGlvbic7XHJcbiAgICBQX1NMX0FERCAgICAgICAgID0gKCkgPT4gJ0FkZCBzdGF0aW9uLi4uJztcclxuICAgIFBfU0xfQUREX1QgICAgICAgPSAoKSA9PiAnQWRkIHN0YXRpb24gdG8gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfQ0xPU0UgICAgICAgPSAoKSA9PiAnQ2xvc2UnO1xyXG4gICAgUF9TTF9DTE9TRV9UICAgICA9ICgpID0+ICdDbG9zZSB0aGlzIHBpY2tlcic7XHJcbiAgICBQX1NMX0VNUFRZICAgICAgID0gKCkgPT4gJ1BsZWFzZSBhZGQgYXQgbGVhc3Qgb25lIHN0YXRpb24gdG8gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfRFJBR19UICAgICAgPSAoKSA9PiAnRHJhZ2dhYmxlIHNlbGVjdGlvbiBvZiBzdGF0aW9ucyBmb3IgdGhpcyBsaXN0JztcclxuICAgIFBfU0xfREVMRVRFICAgICAgPSAoKSA9PiAnRHJvcCBoZXJlIHRvIGRlbGV0ZSc7XHJcbiAgICBQX1NMX0RFTEVURV9UICAgID0gKCkgPT4gJ0Ryb3Agc3RhdGlvbiBoZXJlIHRvIGRlbGV0ZSBpdCBmcm9tIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0lURU1fVCAgICAgID0gKCkgPT5cclxuICAgICAgICAnRHJhZyB0byByZW9yZGVyOyBkb3VibGUtY2xpY2sgb3IgZHJhZyBpbnRvIGRlbGV0ZSB6b25lIHRvIHJlbW92ZSc7XHJcbiAgICBQX1RJTUVfVCAgICAgICAgID0gKCkgPT4gJ1RpbWUgZWRpdG9yJztcclxuXHJcbiAgICBQX0NPQUNIX01JU1NJTkdfU1RBVEUgICA9ICgpID0+ICdvbkNoYW5nZSBmaXJlZCBmb3IgY29hY2ggcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9JTlRfTUlTU0lOR19TVEFURSAgICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIGludGVnZXIgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9QU0VUX01JU1NJTkdfU1RBVEUgICAgPSAoKSA9PiAnb25TZWxlY3QgZmlyZWQgZm9yIHBocmFzZXNldCBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX1NFUlZJQ0VfTUlTU0lOR19TVEFURSA9ICgpID0+ICdvblNlbGVjdCBmaXJlZCBmb3Igc2VydmljZSBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX1RJTUVfTUlTU0lOR19TVEFURSAgICA9ICgpID0+ICdvbkNoYW5nZSBmaXJlZCBmb3IgdGltZSBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX1BTRVRfVU5LTk9XTiAgICAgICAgICA9IChyOiBzdHJpbmcpID0+IGBQaHJhc2VzZXQgJyR7cn0nIGRvZXNuJ3QgZXhpc3RgO1xyXG4gICAgUF9TTF9EUkFHX01JU1NJTkcgICAgICAgPSAoKSA9PiAnRHJhZ2dhYmxlOiBNaXNzaW5nIHNvdXJjZSBlbGVtZW50cyBmb3IgbWlycm9yIGV2ZW50JztcclxuXHJcbiAgICBTVF9SRVNFVCAgICAgICAgICAgPSAoKSA9PiAnUmVzZXQgdG8gZGVmYXVsdHMnO1xyXG4gICAgU1RfUkVTRVRfVCAgICAgICAgID0gKCkgPT4gJ1Jlc2V0IHNldHRpbmdzIHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX0NPTkZJUk0gICA9ICgpID0+ICdBcmUgeW91IHN1cmU/JztcclxuICAgIFNUX1JFU0VUX0NPTkZJUk1fVCA9ICgpID0+ICdDb25maXJtIHJlc2V0IHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX0RPTkUgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1NldHRpbmdzIGhhdmUgYmVlbiByZXNldCB0byB0aGVpciBkZWZhdWx0cywgYW5kIGRlbGV0ZWQgZnJvbSBzdG9yYWdlLic7XHJcbiAgICBTVF9TQVZFICAgICAgICAgICAgPSAoKSA9PiAnU2F2ZSAmIGNsb3NlJztcclxuICAgIFNUX1NBVkVfVCAgICAgICAgICA9ICgpID0+ICdTYXZlIGFuZCBjbG9zZSBzZXR0aW5ncyc7XHJcbiAgICBTVF9TUEVFQ0ggICAgICAgICAgPSAoKSA9PiAnU3BlZWNoJztcclxuICAgIFNUX1NQRUVDSF9DSE9JQ0UgICA9ICgpID0+ICdWb2ljZSc7XHJcbiAgICBTVF9TUEVFQ0hfRU1QVFkgICAgPSAoKSA9PiAnTm9uZSBhdmFpbGFibGUnO1xyXG4gICAgU1RfU1BFRUNIX1ZPTCAgICAgID0gKCkgPT4gJ1ZvbHVtZSc7XHJcbiAgICBTVF9TUEVFQ0hfUElUQ0ggICAgPSAoKSA9PiAnUGl0Y2gnO1xyXG4gICAgU1RfU1BFRUNIX1JBVEUgICAgID0gKCkgPT4gJ1JhdGUnO1xyXG4gICAgU1RfU1BFRUNIX1RFU1QgICAgID0gKCkgPT4gJ1Rlc3Qgc3BlZWNoJztcclxuICAgIFNUX1NQRUVDSF9URVNUX1QgICA9ICgpID0+ICdQbGF5IGEgc3BlZWNoIHNhbXBsZSB3aXRoIHRoZSBjdXJyZW50IHNldHRpbmdzJztcclxuICAgIFNUX0xFR0FMICAgICAgICAgICA9ICgpID0+ICdMZWdhbCAmIEFja25vd2xlZGdlbWVudHMnO1xyXG5cclxuICAgIFdBUk5fU0hPUlRfSEVBREVSID0gKCkgPT4gJ1wiTWF5IEkgaGF2ZSB5b3VyIGF0dGVudGlvbiBwbGVhc2UuLi5cIic7XHJcbiAgICBXQVJOX1NIT1JUICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1RoaXMgZGlzcGxheSBpcyB0b28gc2hvcnQgdG8gc3VwcG9ydCBSQUcuIFBsZWFzZSBtYWtlIHRoaXMgd2luZG93IHRhbGxlciwgb3InICtcclxuICAgICAgICAnIHJvdGF0ZSB5b3VyIGRldmljZSBmcm9tIGxhbmRzY2FwZSB0byBwb3J0cmFpdC4nO1xyXG5cclxuICAgIC8vIFRPRE86IFRoZXNlIGRvbid0IGZpdCBoZXJlOyB0aGlzIHNob3VsZCBnbyBpbiB0aGUgZGF0YVxyXG4gICAgTEVUVEVSUyA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWic7XHJcbiAgICBESUdJVFMgID0gW1xyXG4gICAgICAgICd6ZXJvJywgICAgICdvbmUnLCAgICAgJ3R3bycsICAgICAndGhyZWUnLCAgICAgJ2ZvdXInLCAgICAgJ2ZpdmUnLCAgICAnc2l4JyxcclxuICAgICAgICAnc2V2ZW4nLCAgICAnZWlnaHQnLCAgICduaW5lJywgICAgJ3RlbicsICAgICAgICdlbGV2ZW4nLCAgICd0d2VsdmUnLCAgJ3RoaXJ0ZWVuJyxcclxuICAgICAgICAnZm91cnRlZW4nLCAnZmlmdGVlbicsICdzaXh0ZWVuJywgJ3NldmVudGVlbicsICdlaWdodGVlbicsICduaW50ZWVuJywgJ3R3ZW50eSdcclxuICAgIF07XHJcblxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKipcclxuICogSG9sZHMgbWV0aG9kcyBmb3IgcHJvY2Vzc2luZyBlYWNoIHR5cGUgb2YgcGhyYXNlIGVsZW1lbnQgaW50byBIVE1MLCB3aXRoIGRhdGEgdGFrZW5cclxuICogZnJvbSB0aGUgY3VycmVudCBzdGF0ZS4gRWFjaCBtZXRob2QgdGFrZXMgYSBjb250ZXh0IG9iamVjdCwgaG9sZGluZyBkYXRhIGZvciB0aGVcclxuICogY3VycmVudCBYTUwgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQgYW5kIHRoZSBYTUwgZG9jdW1lbnQgYmVpbmcgdXNlZC5cclxuICovXHJcbmNsYXNzIEVsZW1lbnRQcm9jZXNzb3JzXHJcbntcclxuICAgIC8qKiBGaWxscyBpbiBjb2FjaCBsZXR0ZXJzIGZyb20gQSB0byBaICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNvYWNoKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0NPQUNIKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldENvYWNoKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgZXhjdXNlLCBmb3IgYSBkZWxheSBvciBjYW5jZWxsYXRpb24gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZXhjdXNlKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfRVhDVVNFKCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZXhjdXNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBpbnRlZ2Vycywgb3B0aW9uYWxseSB3aXRoIG5vdW5zIGFuZCBpbiB3b3JkIGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50ZWdlcihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzaW5ndWxhciA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnc2luZ3VsYXInKTtcclxuICAgICAgICBsZXQgcGx1cmFsICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3BsdXJhbCcpO1xyXG4gICAgICAgIGxldCB3b3JkcyAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnd29yZHMnKTtcclxuXHJcbiAgICAgICAgbGV0IGludCAgICA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKGNvbnRleHQpO1xyXG4gICAgICAgIGxldCBpbnRTdHIgPSAod29yZHMgJiYgd29yZHMudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoaW50ID09PSAxICYmIHNpbmd1bGFyKVxyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3Npbmd1bGFyfWA7XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHBsdXJhbClcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHtwbHVyYWx9YDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0lOVEVHRVIoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHI7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcblxyXG4gICAgICAgIGlmIChzaW5ndWxhcikgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnc2luZ3VsYXInXSA9IHNpbmd1bGFyO1xyXG4gICAgICAgIGlmIChwbHVyYWwpICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsncGx1cmFsJ10gICA9IHBsdXJhbDtcclxuICAgICAgICBpZiAod29yZHMpICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3dvcmRzJ10gICAgPSB3b3JkcztcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG5hbWVkKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfTkFNRUQoKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5uYW1lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlLCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZShyZWYpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICAgICA9ICcnO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0UocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBocmFzZXMgd2l0aCBhIGNoYW5jZSB2YWx1ZSBhcyBjb2xsYXBzaWJsZVxyXG4gICAgICAgIGlmICggY3R4LnhtbEVsZW1lbnQuaGFzQXR0cmlidXRlKCdjaGFuY2UnKSApXHJcbiAgICAgICAgICAgIHRoaXMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcGhyYXNlLCByZWYpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgRE9NLmNsb25lSW50byhwaHJhc2UsIGN0eC5uZXdFbGVtZW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwaHJhc2UgZnJvbSBhIHByZXZpb3VzbHkgZGVmaW5lZCBwaHJhc2VzZXQsIGJ5IGl0cyBgaWRgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBocmFzZXNldChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgICAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZik7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGlkeCAgICA9IFJBRy5zdGF0ZS5nZXRQaHJhc2VzZXRJZHgocmVmKTtcclxuICAgICAgICBsZXQgcGhyYXNlID0gcGhyYXNlc2V0LmNoaWxkcmVuW2lkeF0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2lkeCddID0gaWR4LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlID0gTC5USVRMRV9QSFJBU0VTRVQocmVmKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBocmFzZXNldHMgd2l0aCBhIGNoYW5jZSB2YWx1ZSBhcyBjb2xsYXBzaWJsZVxyXG4gICAgICAgIGlmICggY3R4LnhtbEVsZW1lbnQuaGFzQXR0cmlidXRlKCdjaGFuY2UnKSApXHJcbiAgICAgICAgICAgIHRoaXMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcGhyYXNlLCByZWYpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgRE9NLmNsb25lSW50byhwaHJhc2UsIGN0eC5uZXdFbGVtZW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGxhdGZvcm0oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9QTEFURk9STSgpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLnBsYXRmb3JtLmpvaW4oJycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgcmFpbCBuZXR3b3JrIG5hbWUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2VydmljZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TRVJWSUNFKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldFNlcnZpY2UoY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHN0YXRpb24gbmFtZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RhdGlvbihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IGNvZGUgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbihjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1NUQVRJT04oY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gc3RhdGlvbiBsaXN0cyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzdGF0aW9ubGlzdChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgICAgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzdGF0aW9ucyAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdChjb250ZXh0KS5zbGljZSgpO1xyXG4gICAgICAgIGxldCBzdGF0aW9uTGlzdCA9IFN0cmluZ3MuZnJvbVN0YXRpb25MaXN0KHN0YXRpb25zLCBjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1NUQVRJT05MSVNUKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gc3RhdGlvbkxpc3Q7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSB0aW1lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRpbWUoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfVElNRShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRUaW1lKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB2b3ggcGFydHMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdm94KGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQga2V5ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAna2V5Jyk7XHJcblxyXG4gICAgICAgIC8vIFRPRE86IExvY2FsaXplXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgICAgPSBjdHgueG1sRWxlbWVudC50ZXh0Q29udGVudDtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICAgICA9IGBDbGljayB0byBlZGl0IHRoaXMgcGhyYXNlICgke2tleX0pYDtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydrZXknXSA9IGtleTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB1bmtub3duIGVsZW1lbnRzIHdpdGggYW4gaW5saW5lIGVycm9yIG1lc3NhZ2UgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdW5rbm93bihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5hbWUgPSBjdHgueG1sRWxlbWVudC5ub2RlTmFtZTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX0VMRU1FTlQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50IGludG8gYSBuZXcgaW5uZXIgc3BhbiB0YWcsIHNvIHRoYXQgdGhleVxyXG4gICAgICogY2FuIGJlIG1hZGUgY29sbGFwc2libGUuIEFwcGVuZHMgaXQgdG8gdGhlIG5ldyBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbWFrZUNvbGxhcHNpYmxlKGN0eDogUGhyYXNlQ29udGV4dCwgc291cmNlOiBIVE1MRWxlbWVudCwgcmVmOiBzdHJpbmcpXHJcbiAgICAgICAgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNoYW5jZSAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnY2hhbmNlJykhO1xyXG4gICAgICAgIGxldCBpbm5lciAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgbGV0IHRvZ2dsZSAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICBsZXQgY29sbGFwc2VkID0gUkFHLnN0YXRlLmdldENvbGxhcHNlZCggcmVmLCBwYXJzZUludChjaGFuY2UpICk7XHJcblxyXG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5hZGQoJ2lubmVyJyk7XHJcbiAgICAgICAgdG9nZ2xlLmNsYXNzTGlzdC5hZGQoJ3RvZ2dsZScpO1xyXG5cclxuICAgICAgICBET00uY2xvbmVJbnRvKHNvdXJjZSwgaW5uZXIpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddID0gY2hhbmNlO1xyXG5cclxuICAgICAgICBDb2xsYXBzaWJsZXMuc2V0KGN0eC5uZXdFbGVtZW50LCB0b2dnbGUsIGNvbGxhcHNlZCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQodG9nZ2xlKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5hcHBlbmRDaGlsZChpbm5lcik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBSZXByZXNlbnRzIGNvbnRleHQgZGF0YSBmb3IgYSBwaHJhc2UsIHRvIGJlIHBhc3NlZCB0byBhbiBlbGVtZW50IHByb2Nlc3NvciAqL1xyXG5pbnRlcmZhY2UgUGhyYXNlQ29udGV4dFxyXG57XHJcbiAgICAvKiogR2V0cyB0aGUgWE1MIHBocmFzZSBlbGVtZW50IHRoYXQgaXMgYmVpbmcgcmVwbGFjZWQgKi9cclxuICAgIHhtbEVsZW1lbnQgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBHZXRzIHRoZSBIVE1MIHNwYW4gZWxlbWVudCB0aGF0IGlzIHJlcGxhY2luZyB0aGUgWE1MIGVsZW1lbnQgKi9cclxuICAgIG5ld0VsZW1lbnQgOiBIVE1MU3BhbkVsZW1lbnQ7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKlxyXG4gKiBIYW5kbGVzIHRoZSB0cmFuc2Zvcm1hdGlvbiBvZiBwaHJhc2UgWE1MIGRhdGEsIGludG8gSFRNTCBlbGVtZW50cyB3aXRoIHRoZWlyIGRhdGFcclxuICogZmlsbGVkIGluIGFuZCB0aGVpciBVSSBsb2dpYyB3aXJlZC5cclxuICovXHJcbmNsYXNzIFBocmFzZXJcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBSZWN1cnNpdmVseSBwcm9jZXNzZXMgWE1MIGVsZW1lbnRzLCBmaWxsaW5nIGluIGRhdGEgYW5kIGFwcGx5aW5nIHRyYW5zZm9ybXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciBQYXJlbnQgdG8gcHJvY2VzcyB0aGUgY2hpbGRyZW4gb2ZcclxuICAgICAqIEBwYXJhbSBsZXZlbCBDdXJyZW50IGxldmVsIG9mIHJlY3Vyc2lvbiwgbWF4LiAyMFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcHJvY2Vzcyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBsZXZlbDogbnVtYmVyID0gMClcclxuICAgIHtcclxuICAgICAgICAvLyBJbml0aWFsbHksIHRoaXMgbWV0aG9kIHdhcyBzdXBwb3NlZCB0byBqdXN0IGFkZCB0aGUgWE1MIGVsZW1lbnRzIGRpcmVjdGx5IGludG9cclxuICAgICAgICAvLyB0aGUgZG9jdW1lbnQuIEhvd2V2ZXIsIHRoaXMgY2F1c2VkIGEgbG90IG9mIHByb2JsZW1zIChlLmcuIHRpdGxlIG5vdCB3b3JraW5nKS5cclxuICAgICAgICAvLyBIVE1MIGRvZXMgbm90IHdvcmsgcmVhbGx5IHdlbGwgd2l0aCBjdXN0b20gZWxlbWVudHMsIGVzcGVjaWFsbHkgaWYgdGhleSBhcmUgb2ZcclxuICAgICAgICAvLyBhbm90aGVyIFhNTCBuYW1lc3BhY2UuXHJcblxyXG4gICAgICAgIGxldCBwZW5kaW5nID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJzpub3Qoc3BhbiknKSBhcyBOb2RlTGlzdE9mPEhUTUxFbGVtZW50PjtcclxuXHJcbiAgICAgICAgLy8gTm8gbW9yZSBYTUwgZWxlbWVudHMgdG8gZXhwYW5kXHJcbiAgICAgICAgaWYgKHBlbmRpbmcubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZvciBlYWNoIFhNTCBlbGVtZW50IGN1cnJlbnRseSBpbiB0aGUgY29udGFpbmVyOlxyXG4gICAgICAgIC8vICogQ3JlYXRlIGEgbmV3IHNwYW4gZWxlbWVudCBmb3IgaXRcclxuICAgICAgICAvLyAqIEhhdmUgdGhlIHByb2Nlc3NvcnMgdGFrZSBkYXRhIGZyb20gdGhlIFhNTCBlbGVtZW50LCB0byBwb3B1bGF0ZSB0aGUgbmV3IG9uZVxyXG4gICAgICAgIC8vICogUmVwbGFjZSB0aGUgWE1MIGVsZW1lbnQgd2l0aCB0aGUgbmV3IG9uZVxyXG4gICAgICAgIHBlbmRpbmcuZm9yRWFjaChlbGVtZW50ID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudE5hbWUgPSBlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICAgICAgbGV0IGNvbnRleHQgICAgID0ge1xyXG4gICAgICAgICAgICAgICAgeG1sRWxlbWVudDogZWxlbWVudCxcclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQ6IG5ld0VsZW1lbnRcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIG5ld0VsZW1lbnQuZGF0YXNldFsndHlwZSddID0gZWxlbWVudE5hbWU7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiB0aGUgZWxlbWVudCBpcyB2b3ggaGludGFibGUsIGFkZCB0aGUgdm94IGhpbnRcclxuICAgICAgICAgICAgaWYgKCBlbGVtZW50Lmhhc0F0dHJpYnV0ZSgndm94JykgKVxyXG4gICAgICAgICAgICAgICAgbmV3RWxlbWVudC5kYXRhc2V0Wyd2b3gnXSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCd2b3gnKSE7XHJcblxyXG4gICAgICAgICAgICAvLyBJIHdhbnRlZCB0byB1c2UgYW4gaW5kZXggb24gRWxlbWVudFByb2Nlc3NvcnMgZm9yIHRoaXMsIGJ1dCBpdCBjYXVzZWQgZXZlcnlcclxuICAgICAgICAgICAgLy8gcHJvY2Vzc29yIHRvIGhhdmUgYW4gXCJ1bnVzZWQgbWV0aG9kXCIgd2FybmluZy5cclxuICAgICAgICAgICAgc3dpdGNoIChlbGVtZW50TmFtZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnY29hY2gnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5jb2FjaChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdleGN1c2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLmV4Y3VzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2ludGVnZXInOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuaW50ZWdlcihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnbmFtZWQnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5uYW1lZChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BocmFzZXNldCc6ICAgRWxlbWVudFByb2Nlc3NvcnMucGhyYXNlc2V0KGNvbnRleHQpOyAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGxhdGZvcm0nOiAgICBFbGVtZW50UHJvY2Vzc29ycy5wbGF0Zm9ybShjb250ZXh0KTsgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnNlcnZpY2UoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb24nOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc3RhdGlvbmxpc3QnOiBFbGVtZW50UHJvY2Vzc29ycy5zdGF0aW9ubGlzdChjb250ZXh0KTsgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICd0aW1lJzogICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnRpbWUoY29udGV4dCk7ICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3ZveCc6ICAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudm94KGNvbnRleHQpOyAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogICAgICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy51bmtub3duKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGVsZW1lbnQucGFyZW50RWxlbWVudCEucmVwbGFjZUNoaWxkKG5ld0VsZW1lbnQsIGVsZW1lbnQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBSZWN1cnNlIHNvIHRoYXQgd2UgY2FuIGV4cGFuZCBhbnkgbmV3IGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKGxldmVsIDwgMjApXHJcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhjb250YWluZXIsIGxldmVsICsgMSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QSFJBU0VSX1RPT19SRUNVUlNJVkUoKSApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ3VzdG9tIHZvaWNlIHRoYXQgc3ludGhlc2l6ZXMgc3BlZWNoIGJ5IHBpZWNpbmcgcHJlLXJlY29yZGVkIGZpbGVzIHRvZ2V0aGVyICovXHJcbmNsYXNzIEN1c3RvbVZvaWNlXHJcbntcclxuICAgIC8qKiBDaGFuZ2VhYmxlIGJhc2UgcGF0aCBmb3IgYWxsIGN1c3RvbSB2b2ljZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYmFzZVBhdGggOiBzdHJpbmcgPSAnZGF0YS92b3gnO1xyXG5cclxuICAgIC8qKiBPbmx5IHByZXNlbnQgZm9yIGNvbnNpc3RlbmN5IHdpdGggU3BlZWNoU3ludGhlc2lzVm9pY2UgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkZWZhdWx0ICAgICAgOiBib29sZWFuO1xyXG4gICAgLyoqIEdldHMgdGhlIEJDUCA0NyB0YWcgaW5kaWNhdGluZyB0aGUgbGFuZ3VhZ2Ugb2YgdGhpcyB2b2ljZSAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGxhbmcgICAgICAgICA6IHN0cmluZztcclxuICAgIC8qKiBPbmx5IHByZXNlbnQgZm9yIGNvbnNpc3RlbmN5IHdpdGggU3BlZWNoU3ludGhlc2lzVm9pY2UgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBsb2NhbFNlcnZpY2UgOiBib29sZWFuO1xyXG4gICAgLyoqIEdldHMgdGhlIElEIG9mIHRoaXMgdm9pY2UgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBuYW1lICAgICAgICAgOiBzdHJpbmc7XHJcbiAgICAvKiogR2V0cyB0aGUgcmVsYXRpdmUgVVJJIG9mIHRoaXMgdm9pY2UncyBmaWxlcyAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IHZvaWNlVVJJICAgICA6IHN0cmluZztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoaWQ6IHN0cmluZywgbGFuZzogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZGVmYXVsdCAgICAgID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5sb2NhbFNlcnZpY2UgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLm5hbWUgICAgICAgICA9IGlkO1xyXG4gICAgICAgIHRoaXMubGFuZyAgICAgICAgID0gbGFuZztcclxuICAgICAgICB0aGlzLnZvaWNlVVJJICAgICA9IGAke0N1c3RvbVZvaWNlLmJhc2VQYXRofS8ke2lkfV8ke2xhbmd9YDtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgY2xhc3MgZm9yIHJlc29sdmluZyBhIGdpdmVuIHBocmFzZSB0byB2b3gga2V5cyAqL1xyXG5jbGFzcyBSZXNvbHZlclxyXG57XHJcbiAgICAvKiogVHJlZVdhbGtlciBmaWx0ZXIgdG8gcmVkdWNlIGEgd2FsayB0byBqdXN0IHRoZSBlbGVtZW50cyB0aGUgcmVzb2x2ZXIgbmVlZHMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSk6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgICAgID0gbm9kZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgcGFyZW50VHlwZSA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghcGFyZW50VHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCAgICAgPSBwYXJlbnQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHBhcmVudFR5cGUgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQWNjZXB0IHRleHQgb25seSBmcm9tIHBocmFzZSBhbmQgcGhyYXNlc2V0c1xyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICBpZiAocGFyZW50VHlwZSAhPT0gJ3BocmFzZXNldCcgJiYgcGFyZW50VHlwZSAhPT0gJ3BocmFzZScpXHJcbiAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG5cclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5vZGUgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgICAgICAvLyBSZWplY3QgY29sbGFwc2VkIGVsZW1lbnRzIGFuZCB0aGVpciBjaGlsZHJlblxyXG4gICAgICAgICAgICBpZiAoIGVsZW1lbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCB0eXBlbGVzcyAod3JhcHBlcikgZWxlbWVudHNcclxuICAgICAgICAgICAgaWYgKCF0eXBlKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIG92ZXIgcGhyYXNlIGFuZCBwaHJhc2VzZXRzIChpbnN0ZWFkLCBvbmx5IGdvaW5nIGZvciB0aGVpciBjaGlsZHJlbilcclxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnIHx8IHR5cGUgPT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGhyYXNlICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHJpdmF0ZSBmbGF0dGVuZWQgOiBOb2RlW107XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlZCAgOiBWb3hLZXlbXTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGhyYXNlOiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnBocmFzZSAgICA9IHBocmFzZTtcclxuICAgICAgICB0aGlzLmZsYXR0ZW5lZCA9IFtdO1xyXG4gICAgICAgIHRoaXMucmVzb2x2ZWQgID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHRvVm94KCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIC8vIEZpcnN0LCB3YWxrIHRocm91Z2ggdGhlIHBocmFzZSBhbmQgXCJmbGF0dGVuXCIgaXQgaW50byBhbiBhcnJheSBvZiBwYXJ0cy4gVGhpcyBpc1xyXG4gICAgICAgIC8vIHNvIHRoZSByZXNvbHZlciBjYW4gbG9vay1haGVhZCBvciBsb29rLWJlaGluZC5cclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQgPSBbXTtcclxuICAgICAgICB0aGlzLnJlc29sdmVkICA9IFtdO1xyXG4gICAgICAgIGxldCB0cmVlV2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgdGhpcy5waHJhc2UsXHJcbiAgICAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19URVhUIHwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogUmVzb2x2ZXIubm9kZUZpbHRlciB9LFxyXG4gICAgICAgICAgICBmYWxzZVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHdoaWxlICggdHJlZVdhbGtlci5uZXh0Tm9kZSgpIClcclxuICAgICAgICBpZiAodHJlZVdhbGtlci5jdXJyZW50Tm9kZS50ZXh0Q29udGVudCEudHJpbSgpICE9PSAnJylcclxuICAgICAgICAgICAgdGhpcy5mbGF0dGVuZWQucHVzaCh0cmVlV2Fsa2VyLmN1cnJlbnROb2RlKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgcmVzb2x2ZSBhbGwgdGhlIHBocmFzZXMnIG5vZGVzIGludG8gdm94IGtleXNcclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQuZm9yRWFjaCggKHYsIGkpID0+IHRoaXMucmVzb2x2ZWQucHVzaCggLi4udGhpcy5yZXNvbHZlKHYsIGkpICkgKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5mbGF0dGVuZWQsIHRoaXMucmVzb2x2ZWQpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXNlcyB0aGUgdHlwZSBhbmQgdmFsdWUgb2YgdGhlIGdpdmVuIG5vZGUsIHRvIHJlc29sdmUgaXQgdG8gdm94IGZpbGUgSURzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBub2RlIE5vZGUgdG8gcmVzb2x2ZSB0byB2b3ggSURzXHJcbiAgICAgKiBAcGFyYW0gaWR4IEluZGV4IG9mIHRoZSBub2RlIGJlaW5nIHJlc29sdmVkIHJlbGF0aXZlIHRvIHRoZSBwaHJhc2UgYXJyYXlcclxuICAgICAqIEByZXR1cm5zIEFycmF5IG9mIElEcyB0aGF0IG1ha2UgdXAgb25lIG9yIG1vcmUgZmlsZSBJRHMuIENhbiBiZSBlbXB0eS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlKG5vZGU6IE5vZGUsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlVGV4dChub2RlKTtcclxuXHJcbiAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUNvYWNoKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ2V4Y3VzZSc6ICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUV4Y3VzZShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVJbnRlZ2VyKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICduYW1lZCc6ICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVOYW1lZCgpO1xyXG4gICAgICAgICAgICBjYXNlICdwbGF0Zm9ybSc6ICAgIHJldHVybiB0aGlzLnJlc29sdmVQbGF0Zm9ybShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTZXJ2aWNlKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTdGF0aW9uKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogcmV0dXJuIHRoaXMucmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3RpbWUnOiAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRpbWUoZWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3ZveCc6ICAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVZveChlbGVtZW50KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEluZmxlY3Rpb24oaWR4OiBudW1iZXIpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5leHQgPSB0aGlzLmZsYXR0ZW5lZFtpZHggKyAxXTtcclxuXHJcbiAgICAgICAgcmV0dXJuICggbmV4dCAmJiBuZXh0LnRleHRDb250ZW50IS50cmltKCkuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgPyAnZW5kJ1xyXG4gICAgICAgICAgICA6ICdtaWQnO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVRleHQobm9kZTogTm9kZSkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBub2RlLnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCB0eXBlICAgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIGxldCB0ZXh0ICAgPSBTdHJpbmdzLmNsZWFuKG5vZGUudGV4dENvbnRlbnQhKTtcclxuICAgICAgICBsZXQgc2V0ICAgID0gW107XHJcblxyXG4gICAgICAgIC8vIElmIHRleHQgaXMganVzdCBhIGZ1bGwgc3RvcCwgcmV0dXJuIHNpbGVuY2VcclxuICAgICAgICBpZiAodGV4dCA9PT0gJy4nKVxyXG4gICAgICAgICAgICByZXR1cm4gWzAuNV07XHJcblxyXG4gICAgICAgIC8vIElmIGl0IGJlZ2lucyB3aXRoIGEgZnVsbCBzdG9wLCBhZGQgc2lsZW5jZVxyXG4gICAgICAgIGlmICggdGV4dC5zdGFydHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICBzZXQucHVzaCgwLjUpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgdGV4dCBkb2Vzbid0IGNvbnRhaW4gYW55IHdvcmRzLCBza2lwXHJcbiAgICAgICAgaWYgKCAhdGV4dC5tYXRjaCgvW2EtejAtOV0vaSkgKVxyXG4gICAgICAgICAgICByZXR1cm4gc2V0O1xyXG5cclxuICAgICAgICAvLyBJZiB0eXBlIGlzIG1pc3NpbmcsIHBhcmVudCBpcyBhIHdyYXBwZXJcclxuICAgICAgICBpZiAoIXR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHR5cGUgICA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgcmVmICA9IHBhcmVudC5kYXRhc2V0WydyZWYnXTtcclxuICAgICAgICBsZXQgaWR4ICA9IERPTS5ub2RlSW5kZXhPZihub2RlKTtcclxuICAgICAgICBsZXQgaWQgICA9IGAke3R5cGV9LiR7cmVmfWA7XHJcblxyXG4gICAgICAgIC8vIEFwcGVuZCBpbmRleCBvZiBwaHJhc2VzZXQncyBjaG9pY2Ugb2YgcGhyYXNlXHJcbiAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnKVxyXG4gICAgICAgICAgICBpZCArPSBgLiR7cGFyZW50LmRhdGFzZXRbJ2lkeCddfWA7XHJcblxyXG4gICAgICAgIGlkICs9IGAuJHtpZHh9YDtcclxuICAgICAgICBzZXQucHVzaChpZCk7XHJcblxyXG4gICAgICAgIC8vIElmIHRleHQgZW5kcyB3aXRoIGEgZnVsbCBzdG9wLCBhZGQgc2lsZW5jZVxyXG4gICAgICAgIGlmICggdGV4dC5lbmRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgc2V0LnB1c2goMC41KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHNldDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVDb2FjaChlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgY29hY2ggICA9IFJBRy5zdGF0ZS5nZXRDb2FjaChjdHgpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgPSBbMC4yLCBgbGV0dGVyLiR7Y29hY2h9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUV4Y3VzZShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBleGN1c2UgID0gUkFHLnN0YXRlLmV4Y3VzZTtcclxuICAgICAgICBsZXQga2V5ICAgICA9IFN0cmluZ3MuZmlsZW5hbWUoZXhjdXNlKTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMiwgYGV4Y3VzZS4ke2tleX0uJHtpbmZsZWN0fWBdO1xyXG5cclxuICAgICAgICBpZiAoaW5mbGVjdCA9PT0gJ21pZCcpXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuMik7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlSW50ZWdlcihlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc2luZ3VsYXIgPSBlbGVtZW50LmRhdGFzZXRbJ3Npbmd1bGFyJ107XHJcbiAgICAgICAgbGV0IHBsdXJhbCAgID0gZWxlbWVudC5kYXRhc2V0WydwbHVyYWwnXTtcclxuICAgICAgICBsZXQgaW50ZWdlciAgPSBSQUcuc3RhdGUuZ2V0SW50ZWdlcihjdHgpO1xyXG4gICAgICAgIGxldCBwYXJ0cyAgICA9IFswLjIsIGBudW1iZXIuJHtpbnRlZ2VyfS5taWRgXTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoc2luZ3VsYXIgJiYgaW50ZWdlciA9PT0gMSlcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjIsIGBudW1iZXIuc3VmZml4LiR7c2luZ3VsYXJ9LmVuZGApO1xyXG4gICAgICAgIGVsc2UgaWYgKHBsdXJhbCAgICYmIGludGVnZXIgIT09IDEpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4yLCBgbnVtYmVyLnN1ZmZpeC4ke3BsdXJhbH0uZW5kYCk7XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJ0cztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVOYW1lZCgpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgbmFtZWQgPSBTdHJpbmdzLmZpbGVuYW1lKFJBRy5zdGF0ZS5uYW1lZCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbMC4yLCBgbmFtZWQuJHtuYW1lZH0ubWlkYCwgMC4yXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVQbGF0Zm9ybShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA9IFJBRy5zdGF0ZS5wbGF0Zm9ybTtcclxuICAgICAgICBsZXQgaW5mbGVjdCAgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgcmVzdWx0ICAgPSBbMC4yLCBgbnVtYmVyLiR7cGxhdGZvcm1bMF19JHtwbGF0Zm9ybVsxXX0uJHtpbmZsZWN0fWBdO1xyXG5cclxuICAgICAgICBpZiAoaW5mbGVjdCA9PT0gJ21pZCcpXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuMik7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlU2VydmljZShlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzZXJ2aWNlID0gU3RyaW5ncy5maWxlbmFtZSggUkFHLnN0YXRlLmdldFNlcnZpY2UoY3R4KSApO1xyXG5cclxuICAgICAgICByZXR1cm4gWzAuMSwgYHNlcnZpY2UuJHtzZXJ2aWNlfS5taWRgLCAwLjFdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb24oZWxlbWVudDogSFRNTEVsZW1lbnQsIGlkeDogbnVtYmVyKVxyXG4gICAgICAgIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uKGN0eCk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgcmVzdWx0ICA9IFswLjIsIGBzdGF0aW9uLiR7c3RhdGlvbn0uJHtpbmZsZWN0fWBdO1xyXG5cclxuICAgICAgICBpZiAoaW5mbGVjdCA9PT0gJ21pZCcpXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuMik7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlU3RhdGlvbkxpc3QoZWxlbWVudDogSFRNTEVsZW1lbnQsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IGxpc3QgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbkxpc3QoY3R4KTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG5cclxuICAgICAgICBsZXQgcGFydHMgOiBWb3hLZXlbXSA9IFswLjI1XTtcclxuXHJcbiAgICAgICAgbGlzdC5mb3JFYWNoKCAodiwgaykgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEhhbmRsZSBtaWRkbGUgb2YgbGlzdCBpbmZsZWN0aW9uXHJcbiAgICAgICAgICAgIGlmIChrICE9PSBsaXN0Lmxlbmd0aCAtIDEpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2fS5taWRgLCAwLjI1KTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFwiYW5kXCIgaWYgbGlzdCBoYXMgbW9yZSB0aGFuIDEgc3RhdGlvbiBhbmQgdGhpcyBpcyB0aGUgZW5kXHJcbiAgICAgICAgICAgIGlmIChsaXN0Lmxlbmd0aCA+IDEpXHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKCdzdGF0aW9uLnBhcnRzLmFuZC5taWQnLCAwLjIpO1xyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFwib25seVwiIGlmIG9ubHkgb25lIHN0YXRpb24gaW4gdGhlIGNhbGxpbmcgbGlzdFxyXG4gICAgICAgICAgICBpZiAobGlzdC5sZW5ndGggPT09IDEgJiYgY3R4ID09PSAnY2FsbGluZycpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2fS5taWRgKTtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goMC4yLCAnc3RhdGlvbi5wYXJ0cy5vbmx5LmVuZCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2fS4ke2luZmxlY3R9YCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBbLi4ucGFydHMsIDAuMl07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlVGltZShlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgdGltZSAgPSBSQUcuc3RhdGUuZ2V0VGltZShjdHgpLnNwbGl0KCc6Jyk7XHJcblxyXG4gICAgICAgIGxldCBwYXJ0cyA6IFZveEtleVtdID0gWzAuMl07XHJcblxyXG4gICAgICAgIGlmICh0aW1lWzBdID09PSAnMDAnICYmIHRpbWVbMV0gPT09ICcwMCcpXHJcbiAgICAgICAgICAgIHJldHVybiBbLi4ucGFydHMsICdudW1iZXIuMDAwMC5taWQnXTtcclxuXHJcbiAgICAgICAgLy8gSG91cnNcclxuICAgICAgICBwYXJ0cy5wdXNoKGBudW1iZXIuJHt0aW1lWzBdfS5iZWdpbmApO1xyXG5cclxuICAgICAgICBpZiAodGltZVsxXSA9PT0gJzAwJylcclxuICAgICAgICAgICAgcGFydHMucHVzaCgnbnVtYmVyLmh1bmRyZWQubWlkJyk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMiwgYG51bWJlci4ke3RpbWVbMV19Lm1pZGApO1xyXG5cclxuICAgICAgICByZXR1cm4gWy4uLnBhcnRzLCAwLjE1XTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVWb3goZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgdGV4dCAgID0gZWxlbWVudC5pbm5lclRleHQudHJpbSgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBbXTtcclxuXHJcbiAgICAgICAgaWYgKCB0ZXh0LnN0YXJ0c1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuNSk7XHJcblxyXG4gICAgICAgIHJlc3VsdC5wdXNoKCBlbGVtZW50LmRhdGFzZXRbJ2tleSddISApO1xyXG5cclxuICAgICAgICBpZiAoIHRleHQuZW5kc1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuNSk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVbmlvbiB0eXBlIGZvciBib3RoIGtpbmRzIG9mIHZvaWNlcyBhdmFpbGFibGUgKi9cclxudHlwZSBWb2ljZSA9IFNwZWVjaFN5bnRoZXNpc1ZvaWNlIHwgQ3VzdG9tVm9pY2U7XHJcblxyXG4vKiogTWFuYWdlcyBzcGVlY2ggc3ludGhlc2lzIHVzaW5nIGJvdGggbmF0aXZlIGFuZCBjdXN0b20gZW5naW5lcyAqL1xyXG5jbGFzcyBTcGVlY2hcclxue1xyXG4gICAgLyoqIEluc3RhbmNlIG9mIHRoZSBjdXN0b20gdm9pY2UgZW5naW5lICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgdm94RW5naW5lIDogVm94RW5naW5lO1xyXG5cclxuICAgIC8qKiBBcnJheSBvZiBicm93c2VyLXByb3ZpZGVkIHZvaWNlcyBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgYnJvd3NlclZvaWNlcyA6IFNwZWVjaFN5bnRoZXNpc1ZvaWNlW10gPSBbXTtcclxuICAgIC8qKiBBcnJheSBvZiBjdXN0b20gcHJlLXJlY29yZGVkIHZvaWNlcyBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgY3VzdG9tVm9pY2VzICA6IEN1c3RvbVZvaWNlW10gICAgICAgICAgPSBbXTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFNvbWUgYnJvd3NlcnMgZG9uJ3QgcHJvcGVybHkgY2FuY2VsIHNwZWVjaCBvbiBwYWdlIGNsb3NlLlxyXG4gICAgICAgIC8vIEJVRzogb25wYWdlc2hvdyBhbmQgb25wYWdlaGlkZSBub3Qgd29ya2luZyBvbiBpT1MgMTFcclxuICAgICAgICB3aW5kb3cub25iZWZvcmV1bmxvYWQgPVxyXG4gICAgICAgIHdpbmRvdy5vbnVubG9hZCAgICAgICA9XHJcbiAgICAgICAgd2luZG93Lm9ucGFnZXNob3cgICAgID1cclxuICAgICAgICB3aW5kb3cub25wYWdlaGlkZSAgICAgPSB0aGlzLmNhbmNlbC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5vbnZpc2liaWxpdHljaGFuZ2UgICAgICAgICAgICA9IHRoaXMub25WaXNpYmlsaXR5Q2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5vbnZvaWNlc2NoYW5nZWQgPSB0aGlzLm9uVm9pY2VzQ2hhbmdlZC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBFdmVuIHRob3VnaCAnb252b2ljZXNjaGFuZ2VkJyBpcyB1c2VkIGxhdGVyIHRvIHBvcHVsYXRlIHRoZSBsaXN0LCBDaHJvbWUgZG9lc1xyXG4gICAgICAgIC8vIG5vdCBhY3R1YWxseSBmaXJlIHRoZSBldmVudCB1bnRpbCB0aGlzIGNhbGwuLi5cclxuICAgICAgICB0aGlzLm9uVm9pY2VzQ2hhbmdlZCgpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBNYWtlIHRoaXMgYSBkeW5hbWljIHJlZ2lzdHJhdGlvbiBhbmQgY2hlY2sgZm9yIGZlYXR1cmVzXHJcbiAgICAgICAgdGhpcy52b3hFbmdpbmUgPSBuZXcgVm94RW5naW5lKCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VzdG9tVm9pY2VzLnB1c2goIG5ldyBDdXN0b21Wb2ljZSgnVGVzdCcsICdlbi1HQicpICk7XHJcbiAgICAgICAgdGhpcy5jdXN0b21Wb2ljZXMucHVzaCggbmV3IEN1c3RvbVZvaWNlKCdSb3knLCAgJ2VuLUdCJykgKTtcclxuICAgICAgICB0aGlzLmN1c3RvbVZvaWNlcy5wdXNoKCBuZXcgQ3VzdG9tVm9pY2UoJ1JveVJhdycsICAnZW4tR0InKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIGFsbCB0aGUgdm9pY2VzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBnZXRWb2ljZXMoKSA6IFZvaWNlW11cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5jdXN0b21Wb2ljZXMuY29uY2F0KHRoaXMuYnJvd3NlclZvaWNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBzcGVha2luZyB0aGUgZ2l2ZW4gcGhyYXNlIGNvbXBvbmVudHMgKi9cclxuICAgIHB1YmxpYyBzcGVhayhwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MgPSB7fSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gUmVzZXQgdG8gZmlyc3Qgdm9pY2UsIGlmIGNvbmZpZ3VyZWQgY2hvaWNlIGlzIG1pc3NpbmdcclxuICAgICAgICBsZXQgdm9pY2VzICAgPSB0aGlzLmdldFZvaWNlcygpO1xyXG4gICAgICAgIGxldCB2b2ljZUlkeCA9IGVpdGhlcihzZXR0aW5ncy52b2ljZUlkeCwgUkFHLmNvbmZpZy5zcGVlY2hWb2ljZSk7XHJcbiAgICAgICAgbGV0IHZvaWNlICAgID0gdm9pY2VzW3ZvaWNlSWR4XSB8fCB2b2ljZXNbMF07XHJcbiAgICAgICAgbGV0IGVuZ2luZSAgID0gKHZvaWNlIGluc3RhbmNlb2YgQ3VzdG9tVm9pY2UpXHJcbiAgICAgICAgICAgID8gdGhpcy5zcGVha0N1c3RvbS5iaW5kKHRoaXMpXHJcbiAgICAgICAgICAgIDogdGhpcy5zcGVha0Jyb3dzZXIuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgZW5naW5lKHBocmFzZSwgdm9pY2UsIHNldHRpbmdzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3RvcHMgYW5kIGNhbmNlbHMgYWxsIHF1ZXVlZCBzcGVlY2ggKi9cclxuICAgIHB1YmxpYyBjYW5jZWwoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmNhbmNlbCgpO1xyXG4gICAgICAgIHRoaXMudm94RW5naW5lLnN0b3AoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGF1c2UgYW5kIHVucGF1c2Ugc3BlZWNoIGlmIHRoZSBwYWdlIGlzIGhpZGRlbiBvciB1bmhpZGRlbiAqL1xyXG4gICAgcHJpdmF0ZSBvblZpc2liaWxpdHlDaGFuZ2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaGlkaW5nID0gKGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gJ2hpZGRlbicpO1xyXG5cclxuICAgICAgICBpZiAoaGlkaW5nKSB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnBhdXNlKCk7XHJcbiAgICAgICAgZWxzZSAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5yZXN1bWUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBhc3luYyB2b2ljZSBsaXN0IGxvYWRpbmcgb24gc29tZSBicm93c2VycywgYW5kIHNldHMgZGVmYXVsdCAqL1xyXG4gICAgcHJpdmF0ZSBvblZvaWNlc0NoYW5nZWQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmJyb3dzZXJWb2ljZXMgPSB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmdldFZvaWNlcygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIGdpdmVuIHBocmFzZSB0byB0ZXh0IGFuZCBzcGVha3MgaXQgdmlhIG5hdGl2ZSBicm93c2VyIHZvaWNlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGhyYXNlIFBocmFzZSBlbGVtZW50cyB0byBzcGVha1xyXG4gICAgICogQHBhcmFtIHZvaWNlIEJyb3dzZXIgdm9pY2UgdG8gdXNlXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgU2V0dGluZ3MgdG8gdXNlIGZvciB0aGUgdm9pY2VcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzcGVha0Jyb3dzZXIocGhyYXNlOiBIVE1MRWxlbWVudCwgdm9pY2U6IFZvaWNlLCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpXHJcbiAgICAgICAgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVGhlIHBocmFzZSB0ZXh0IGlzIHNwbGl0IGludG8gc2VudGVuY2VzLCBhcyBxdWV1ZWluZyBsYXJnZSBzZW50ZW5jZXMgdGhhdCBsYXN0XHJcbiAgICAgICAgLy8gbWFueSBzZWNvbmRzIGNhbiBicmVhayBzb21lIFRUUyBlbmdpbmVzIGFuZCBicm93c2Vycy5cclxuICAgICAgICBsZXQgdGV4dCAgPSBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHBocmFzZSk7XHJcbiAgICAgICAgbGV0IHBhcnRzID0gdGV4dC5zcGxpdCgvXFwuXFxzL2kpO1xyXG5cclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIHBhcnRzLmZvckVhY2goIChzZWdtZW50LCBpZHgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBBZGQgbWlzc2luZyBmdWxsIHN0b3AgdG8gZWFjaCBzZW50ZW5jZSBleGNlcHQgdGhlIGxhc3QsIHdoaWNoIGhhcyBpdFxyXG4gICAgICAgICAgICBpZiAoaWR4IDwgcGFydHMubGVuZ3RoIC0gMSlcclxuICAgICAgICAgICAgICAgIHNlZ21lbnQgKz0gJy4nO1xyXG5cclxuICAgICAgICAgICAgbGV0IHV0dGVyYW5jZSA9IG5ldyBTcGVlY2hTeW50aGVzaXNVdHRlcmFuY2Uoc2VnbWVudCk7XHJcblxyXG4gICAgICAgICAgICB1dHRlcmFuY2Uudm9pY2UgID0gdm9pY2U7XHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS52b2x1bWUgPSBlaXRoZXIoc2V0dGluZ3Mudm9sdW1lLCBSQUcuY29uZmlnLnNwZWVjaFZvbCk7XHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS5waXRjaCAgPSBlaXRoZXIoc2V0dGluZ3MucGl0Y2gsICBSQUcuY29uZmlnLnNwZWVjaFBpdGNoKTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnJhdGUgICA9IGVpdGhlcihzZXR0aW5ncy5yYXRlLCAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSk7XHJcblxyXG4gICAgICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFrKHV0dGVyYW5jZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTeW50aGVzaXplcyB2b2ljZSBieSB3YWxraW5nIHRocm91Z2ggdGhlIGdpdmVuIHBocmFzZSBlbGVtZW50cywgcmVzb2x2aW5nIHBhcnRzIHRvXHJcbiAgICAgKiBzb3VuZCBmaWxlIElEcywgYW5kIGZlZWRpbmcgdGhlIGVudGlyZSBhcnJheSB0byB0aGUgdm94IGVuZ2luZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGhyYXNlIFBocmFzZSBlbGVtZW50cyB0byBzcGVha1xyXG4gICAgICogQHBhcmFtIHZvaWNlIEN1c3RvbSB2b2ljZSB0byB1c2VcclxuICAgICAqIEBwYXJhbSBzZXR0aW5ncyBTZXR0aW5ncyB0byB1c2UgZm9yIHRoZSB2b2ljZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNwZWFrQ3VzdG9tKHBocmFzZTogSFRNTEVsZW1lbnQsIHZvaWNlOiBWb2ljZSwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzKVxyXG4gICAgICAgIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IHVzZSB2b2x1bWUgc2V0dGluZ3NcclxuICAgICAgICBsZXQgcmVzb2x2ZXIgPSBuZXcgUmVzb2x2ZXIocGhyYXNlKTtcclxuXHJcbiAgICAgICAgdGhpcy52b3hFbmdpbmUuc3BlYWsocmVzb2x2ZXIudG9Wb3goKSwgdm9pY2UsIHNldHRpbmdzKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFR5cGUgZGVmaW5pdGlvbiBmb3Igc3BlZWNoIGNvbmZpZyBvdmVycmlkZXMgcGFzc2VkIHRvIHRoZSBzcGVhayBtZXRob2QgKi9cclxuaW50ZXJmYWNlIFNwZWVjaFNldHRpbmdzXHJcbntcclxuICAgIC8qKiBPdmVycmlkZSBjaG9pY2Ugb2Ygdm9pY2UgKi9cclxuICAgIHZvaWNlSWR4PzogbnVtYmVyO1xyXG4gICAgLyoqIE92ZXJyaWRlIHZvbHVtZSBvZiB2b2ljZSAqL1xyXG4gICAgdm9sdW1lPzogbnVtYmVyO1xyXG4gICAgLyoqIE92ZXJyaWRlIHBpdGNoIG9mIHZvaWNlICovXHJcbiAgICBwaXRjaD86IG51bWJlcjtcclxuICAgIC8qKiBPdmVycmlkZSByYXRlIG9mIHZvaWNlICovXHJcbiAgICByYXRlPzogbnVtYmVyO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG50eXBlIFZveEtleSA9IHN0cmluZyB8IG51bWJlcjtcclxuXHJcbi8qKiBTeW50aGVzaXplcyBzcGVlY2ggYnkgZHluYW1pY2FsbHkgbG9hZGluZyBhbmQgcGllY2luZyB0b2dldGhlciB2b2ljZSBmaWxlcyAqL1xyXG5jbGFzcyBWb3hFbmdpbmVcclxue1xyXG4gICAgLyoqIFRoZSBjb3JlIGF1ZGlvIGNvbnRleHQgdGhhdCBoYW5kbGVzIGF1ZGlvIGVmZmVjdHMgYW5kIHBsYXliYWNrICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgYXVkaW9Db250ZXh0IDogQXVkaW9Db250ZXh0O1xyXG4gICAgLyoqIEF1ZGlvIG5vZGUgdGhhdCBmaWx0ZXJzIHZvaWNlIHdpdGggdmFyaW91cyBlZmZlY3RzICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgYXVkaW9GaWx0ZXIgIDogQmlxdWFkRmlsdGVyTm9kZTtcclxuXHJcbiAgICAvKiogV2hldGhlciB0aGlzIGVuZ2luZSBpcyBjdXJyZW50bHkgcnVubmluZyBhbmQgc3BlYWtpbmcgKi9cclxuICAgIHB1YmxpYyAgaXNTcGVha2luZyAgICAgICA6IGJvb2xlYW4gICAgICA9IGZhbHNlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSBudW1iZXIgZm9yIHRoZSBjdXJyZW50IHB1bXAgdGltZXIgKi9cclxuICAgIHByaXZhdGUgcHVtcFRpbWVyICAgICAgICA6IG51bWJlciAgICAgICA9IDA7XHJcbiAgICAvKiogVHJhY2tzIHRoZSBhdWRpbyBjb250ZXh0J3Mgd2FsbC1jbG9jayB0aW1lIHRvIHNjaGVkdWxlIG5leHQgY2xpcCAqL1xyXG4gICAgcHJpdmF0ZSBuZXh0QmVnaW4gICAgICAgIDogbnVtYmVyICAgICAgID0gMDtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGN1cnJlbnRseSBwZW5kaW5nIHJlcXVlc3RzLCBhcyBhIEZJRk8gcXVldWUgKi9cclxuICAgIHByaXZhdGUgcGVuZGluZ1JlcXMgICAgICA6IFZveFJlcXVlc3RbXSA9IFtdO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gY3VycmVudGx5IHNjaGVkdWxlZCBhdWRpbyBidWZmZXJzICovXHJcbiAgICBwcml2YXRlIHNjaGVkdWxlZEJ1ZmZlcnMgOiBBdWRpb0J1ZmZlclNvdXJjZU5vZGVbXSA9IFtdO1xyXG4gICAgLyoqIExpc3Qgb2Ygdm94IElEcyBjdXJyZW50bHkgYmVpbmcgcnVuIHRocm91Z2ggKi9cclxuICAgIHByaXZhdGUgY3VycmVudElkcz8gICAgICA6IFZveEtleVtdO1xyXG4gICAgLyoqIFZvaWNlIGN1cnJlbnRseSBiZWluZyB1c2VkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRWb2ljZT8gICAgOiBDdXN0b21Wb2ljZTtcclxuICAgIC8qKiBTcGVlY2ggc2V0dGluZ3MgY3VycmVudGx5IGJlaW5nIHVzZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFNldHRpbmdzPyA6IFNwZWVjaFNldHRpbmdzO1xyXG4gICAgLyoqIEF1ZGlvIG5vZGUgdGhhdCBhZGRzIGEgcmV2ZXJiIHRvIHRoZSB2b2ljZSwgaWYgYXZhaWxhYmxlICovXHJcbiAgICBwcml2YXRlIGF1ZGlvUmV2ZXJiPyAgICAgOiBDb252b2x2ZXJOb2RlO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihyZXZlcmI6IHN0cmluZyA9ICdkYXRhL3ZveCcpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2V0dXAgdGhlIGNvcmUgYXVkaW8gY29udGV4dFxyXG5cclxuICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgbGV0IEF1ZGlvQ29udGV4dCAgPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XHJcbiAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQgPSBuZXcgQXVkaW9Db250ZXh0KCk7XHJcblxyXG4gICAgICAgIC8vIFNldHVwIHRhbm5veSBmaWx0ZXJcclxuXHJcbiAgICAgICAgdGhpcy5hdWRpb0ZpbHRlciAgICAgICAgID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XHJcbiAgICAgICAgdGhpcy5hdWRpb0ZpbHRlci50eXBlICAgID0gJ2hpZ2hwYXNzJztcclxuICAgICAgICB0aGlzLmF1ZGlvRmlsdGVyLlEudmFsdWUgPSAwLjQ7XHJcblxyXG4gICAgICAgIHRoaXMuYXVkaW9GaWx0ZXIuY29ubmVjdCh0aGlzLmF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XHJcblxyXG4gICAgICAgIC8vIFNldHVwIHJldmVyYlxyXG5cclxuICAgICAgICAvLyBUT0RPOiBNYWtlIHRoaXMgdXNlciBjb25maWd1cmFibGUgYW5kIGNob29zYWJsZVxyXG4gICAgICAgIGZldGNoKGAke3JldmVyYn0vaXIuc3RhbGJhbnNfYV9tb25vLndhdmApXHJcbiAgICAgICAgICAgIC50aGVuKCByZXMgPT4gcmVzLmFycmF5QnVmZmVyKCkgKVxyXG4gICAgICAgICAgICAudGhlbiggYnVmID0+IFNvdW5kcy5kZWNvZGUodGhpcy5hdWRpb0NvbnRleHQsIGJ1ZikgKVxyXG4gICAgICAgICAgICAudGhlbiggcmV2ID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9SZXZlcmIgICAgICAgICAgID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQ29udm9sdmVyKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvUmV2ZXJiLmJ1ZmZlciAgICA9IHJldjtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9SZXZlcmIubm9ybWFsaXplID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvRmlsdGVyLmNvbm5lY3QodGhpcy5hdWRpb1JldmVyYik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvUmV2ZXJiLmNvbm5lY3QodGhpcy5hdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFJFVkVSQiBMT0FERUQnKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCZWdpbnMgbG9hZGluZyBhbmQgc3BlYWtpbmcgYSBzZXQgb2Ygdm94IGZpbGVzLiBTdG9wcyBhbnkgc3BlZWNoLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZHMgTGlzdCBvZiB2b3ggaWRzIHRvIGxvYWQgYXMgZmlsZXMsIGluIHNwZWFraW5nIG9yZGVyXHJcbiAgICAgKiBAcGFyYW0gdm9pY2UgQ3VzdG9tIHZvaWNlIHRvIHVzZVxyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFZvaWNlIHNldHRpbmdzIHRvIHVzZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3BlYWsoaWRzOiBWb3hLZXlbXSwgdm9pY2U6IFZvaWNlLCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBTUEVBSzonLCBpZHMsIHZvaWNlLCBzZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlzU3BlYWtpbmcpXHJcbiAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgICAgICA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50SWRzICAgICAgPSBpZHM7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50Vm9pY2UgICAgPSB2b2ljZTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzO1xyXG5cclxuICAgICAgICAvLyBCZWdpbiB0aGUgcHVtcCBsb29wLiBPbiBpT1MsIHRoZSBjb250ZXh0IG1heSBoYXZlIHRvIGJlIHJlc3VtZWQgZmlyc3RcclxuICAgICAgICBpZiAodGhpcy5hdWRpb0NvbnRleHQuc3RhdGUgPT09ICdzdXNwZW5kZWQnKVxyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dC5yZXN1bWUoKS50aGVuKCAoKSA9PiB0aGlzLnB1bXAoKSApO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5wdW1wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHBsYXlpbmcgYW55IGN1cnJlbnRseSBzcG9rZW4gc3BlZWNoIGFuZCByZXNldHMgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RvcCBwdW1waW5nXHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMucHVtcFRpbWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5pc1NwZWFraW5nID0gZmFsc2U7XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbGwgcGVuZGluZyByZXF1ZXN0c1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXMuZm9yRWFjaCggciA9PiByLmNhbmNlbCgpICk7XHJcblxyXG4gICAgICAgIC8vIEtpbGwgYW5kIGRlcmVmZXJlbmNlIGFueSBjdXJyZW50bHkgcGxheWluZyBmaWxlXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzLmZvckVhY2gobm9kZSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbm9kZS5zdG9wKCk7XHJcbiAgICAgICAgICAgIG5vZGUuZGlzY29ubmVjdCgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm5leHRCZWdpbiAgICAgICAgPSAwO1xyXG4gICAgICAgIHRoaXMuY3VycmVudElkcyAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRWb2ljZSAgICAgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXMgICAgICA9IFtdO1xyXG4gICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycyA9IFtdO1xyXG5cclxuICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggU1RPUFBFRCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHVtcHMgdGhlIHNwZWVjaCBxdWV1ZSwgYnkga2VlcGluZyB1cCB0byAxMCBmZXRjaCByZXF1ZXN0cyBmb3Igdm9pY2UgZmlsZXMgZ29pbmcsXHJcbiAgICAgKiBhbmQgdGhlbiBmZWVkaW5nIHRoZWlyIGRhdGEgKGluIGVuZm9yY2VkIG9yZGVyKSB0byB0aGUgYXVkaW8gY2hhaW4sIG9uZSBhdCBhIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcHVtcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIElmIHRoZSBlbmdpbmUgaGFzIHN0b3BwZWQsIGRvIG5vdCBwcm9jZWVkLlxyXG4gICAgICAgIGlmICghdGhpcy5pc1NwZWFraW5nIHx8ICF0aGlzLmN1cnJlbnRJZHMgfHwgIXRoaXMuY3VycmVudFZvaWNlKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBzY2hlZHVsZSBmdWxmaWxsZWQgcmVxdWVzdHMgaW50byB0aGUgYXVkaW8gYnVmZmVyLCBpbiBGSUZPIG9yZGVyXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZSgpO1xyXG5cclxuICAgICAgICAvLyBUaGVuLCBmaWxsIGFueSBmcmVlIHBlbmRpbmcgc2xvdHMgd2l0aCBuZXcgcmVxdWVzdHNcclxuICAgICAgICBsZXQgbmV4dERlbGF5ID0gMDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRoaXMuY3VycmVudElkc1swXSAmJiB0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCA8IDEwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGtleSA9IHRoaXMuY3VycmVudElkcy5zaGlmdCgpITtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMga2V5IGlzIGEgbnVtYmVyLCBpdCdzIGFuIGFtb3VudCBvZiBzaWxlbmNlLCBzbyBhZGQgaXQgYXMgdGhlXHJcbiAgICAgICAgICAgIC8vIHBsYXliYWNrIGRlbGF5IGZvciB0aGUgbmV4dCBwbGF5YWJsZSByZXF1ZXN0IChpZiBhbnkpLlxyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGtleSA9PT0gJ251bWJlcicpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG5leHREZWxheSArPSBrZXk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbGV0IHBhdGggPSBgJHt0aGlzLmN1cnJlbnRWb2ljZS52b2ljZVVSSX0vJHtrZXl9Lm1wM2A7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdSZXFzLnB1c2goIG5ldyBWb3hSZXF1ZXN0KHBhdGgsIG5leHREZWxheSwgdGhpcy5hdWRpb0NvbnRleHQpICk7XHJcbiAgICAgICAgICAgIG5leHREZWxheSA9IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmcgd2hlbiB3ZSdyZSBvdXQgb2YgSURzIHRvIHF1ZXVlIGFuZCBub3RoaW5nIGlzIHBsYXlpbmdcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50SWRzLmxlbmd0aCAgICAgICA8PSAwKVxyXG4gICAgICAgIGlmICh0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCAgICAgIDw9IDApXHJcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGVkQnVmZmVycy5sZW5ndGggPD0gMClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLnB1bXBUaW1lciA9IHNldFRpbWVvdXQodGhpcy5wdW1wLmJpbmQodGhpcyksIDEwMCk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIHByaXZhdGUgc2NoZWR1bGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTdG9wIHNjaGVkdWxpbmcgaWYgdGhlcmUgYXJlIG5vIHBlbmRpbmcgcmVxdWVzdHNcclxuICAgICAgICBpZiAoIXRoaXMucGVuZGluZ1JlcXNbMF0gfHwgIXRoaXMucGVuZGluZ1JlcXNbMF0uaXNEb25lKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIERvbid0IHNjaGVkdWxlIGlmIG1vcmUgdGhhbiA1IG5vZGVzIGFyZSwgYXMgbm90IHRvIGJsb3cgYW55IGJ1ZmZlcnNcclxuICAgICAgICBpZiAodGhpcy5zY2hlZHVsZWRCdWZmZXJzLmxlbmd0aCA+IDUpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IHJlcSA9IHRoaXMucGVuZGluZ1JlcXMuc2hpZnQoKSE7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSBuZXh0IHJlcXVlc3QgZXJyb3JlZCBvdXQgKGJ1ZmZlciBtaXNzaW5nKSwgc2tpcCBpdFxyXG4gICAgICAgIC8vIFRPRE86IFJlcGxhY2Ugd2l0aCBzaWxlbmNlP1xyXG4gICAgICAgIGlmICghcmVxLmJ1ZmZlcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdWT1ggQ0xJUCBTS0lQUEVEOicsIHJlcS5wYXRoKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2NoZWR1bGUoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIElmIHRoaXMgaXMgdGhlIGZpcnN0IGNsaXAgYmVpbmcgcGxheWVkLCBzdGFydCBmcm9tIGN1cnJlbnQgd2FsbC1jbG9ja1xyXG4gICAgICAgIGlmICh0aGlzLm5leHRCZWdpbiA9PT0gMClcclxuICAgICAgICAgICAgdGhpcy5uZXh0QmVnaW4gPSB0aGlzLmF1ZGlvQ29udGV4dC5jdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBDTElQIFBMQVlJTkc6JywgcmVxLnBhdGgsIHJlcS5idWZmZXIuZHVyYXRpb24sIHRoaXMubmV4dEJlZ2luKTtcclxuXHJcbiAgICAgICAgbGV0IG5vZGUgICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcclxuICAgICAgICBsZXQgbGF0ZW5jeSA9IHRoaXMuYXVkaW9Db250ZXh0LmJhc2VMYXRlbmN5ICsgMC4xNTtcclxuICAgICAgICBsZXQgZGVsYXkgICA9IHJlcS5kZWxheTtcclxuICAgICAgICBub2RlLmJ1ZmZlciA9IHJlcS5idWZmZXI7XHJcblxyXG4gICAgICAgIG5vZGUucGxheWJhY2tSYXRlLnZhbHVlID0gMC45ODtcclxuICAgICAgICBub2RlLmNvbm5lY3QodGhpcy5hdWRpb0ZpbHRlcik7XHJcbiAgICAgICAgbm9kZS5zdGFydCh0aGlzLm5leHRCZWdpbiArIGRlbGF5KTtcclxuXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzLnB1c2gobm9kZSk7XHJcbiAgICAgICAgdGhpcy5uZXh0QmVnaW4gKz0gKG5vZGUuYnVmZmVyLmR1cmF0aW9uICsgZGVsYXkgLSBsYXRlbmN5KTtcclxuXHJcbiAgICAgICAgLy8gSGF2ZSB0aGlzIGJ1ZmZlciBub2RlIHJlbW92ZSBpdHNlbGYgZnJvbSB0aGUgc2NoZWR1bGUgd2hlbiBkb25lXHJcbiAgICAgICAgbm9kZS5vbmVuZGVkID0gXyA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBDTElQIEVOREVEOicsIHJlcS5wYXRoKTtcclxuICAgICAgICAgICAgbGV0IGlkeCA9IHRoaXMuc2NoZWR1bGVkQnVmZmVycy5pbmRleE9mKG5vZGUpO1xyXG5cclxuICAgICAgICAgICAgaWYgKGlkeCAhPT0gLTEpXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMuc3BsaWNlKGlkeCwgMSk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFJlcHJlc2VudHMgYSByZXF1ZXN0IGZvciBhIHZveCBmaWxlLCBpbW1lZGlhdGVseSBiZWd1biBvbiBjcmVhdGlvbiAqL1xyXG5jbGFzcyBWb3hSZXF1ZXN0XHJcbntcclxuICAgIC8qKiBSZWxhdGl2ZSByZW1vdGUgcGF0aCBvZiB0aGlzIHZvaWNlIGZpbGUgcmVxdWVzdCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBwYXRoICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIEFtb3VudCBvZiBzZWNvbmRzIHRvIGRlbGF5IHRoZSBwbGF5YmFjayBvZiB0aGlzIHJlcXVlc3QgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZGVsYXkgICA6IG51bWJlcjtcclxuICAgIC8qKiBBdWRpbyBjb250ZXh0IHRvIHVzZSBmb3IgZGVjb2RpbmcgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dCA6IEF1ZGlvQ29udGV4dDtcclxuXHJcbiAgICAvKiogV2hldGhlciB0aGlzIHJlcXVlc3QgaXMgZG9uZSBhbmQgcmVhZHkgZm9yIGhhbmRsaW5nIChldmVuIGlmIGZhaWxlZCkgKi9cclxuICAgIHB1YmxpYyBpc0RvbmUgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFJhdyBhdWRpbyBkYXRhIGZyb20gdGhlIGxvYWRlZCBmaWxlLCBpZiBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBidWZmZXI/IDogQXVkaW9CdWZmZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgZGVsYXk6IG51bWJlciwgY29udGV4dDogQXVkaW9Db250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBSRVFVRVNUOicsIHBhdGgpO1xyXG4gICAgICAgIHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XHJcbiAgICAgICAgdGhpcy5wYXRoICAgID0gcGF0aDtcclxuICAgICAgICB0aGlzLmRlbGF5ICAgPSBkZWxheTtcclxuXHJcbiAgICAgICAgZmV0Y2gocGF0aClcclxuICAgICAgICAgICAgLnRoZW4gKCB0aGlzLm9uRnVsZmlsbC5iaW5kKHRoaXMpIClcclxuICAgICAgICAgICAgLmNhdGNoKCB0aGlzLm9uRXJyb3IuYmluZCh0aGlzKSAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbmNlbHMgdGhpcyByZXF1ZXN0IGZyb20gcHJvY2VlZGluZyBhbnkgZnVydGhlciAqL1xyXG4gICAgcHVibGljIGNhbmNlbCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IENhbmNlbGxhdGlvbiBjb250cm9sbGVyc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBCZWdpbnMgZGVjb2RpbmcgdGhlIGxvYWRlZCBNUDMgdm9pY2UgZmlsZSB0byByYXcgYXVkaW8gZGF0YSAqL1xyXG4gICAgcHJpdmF0ZSBvbkZ1bGZpbGwocmVzOiBSZXNwb25zZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFyZXMub2spXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKGBWT1ggTk9UIEZPVU5EOiAke3Jlcy5zdGF0dXN9IEAgJHt0aGlzLnBhdGh9YCk7XHJcblxyXG4gICAgICAgIHJlcy5hcnJheUJ1ZmZlcigpLnRoZW4oIHRoaXMub25BcnJheUJ1ZmZlci5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFRha2VzIHRoZSBhcnJheSBidWZmZXIgZnJvbSB0aGUgZnVsZmlsbGVkIGZldGNoIGFuZCBkZWNvZGVzIGl0ICovXHJcbiAgICBwcml2YXRlIG9uQXJyYXlCdWZmZXIoYnVmZmVyOiBBcnJheUJ1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgU291bmRzLmRlY29kZSh0aGlzLmNvbnRleHQsIGJ1ZmZlcilcclxuICAgICAgICAgICAgLnRoZW4gKCB0aGlzLm9uRGVjb2RlLmJpbmQodGhpcykgKVxyXG4gICAgICAgICAgICAuY2F0Y2goIHRoaXMub25FcnJvci5iaW5kKHRoaXMpICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiB0aGUgZmV0Y2hlZCBidWZmZXIgaXMgZGVjb2RlZCBzdWNjZXNzZnVsbHkgKi9cclxuICAgIHByaXZhdGUgb25EZWNvZGUoYnVmZmVyOiBBdWRpb0J1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5idWZmZXIgPSBidWZmZXI7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgaWYgdGhlIGZldGNoIG9yIGRlY29kZSBzdGFnZXMgZmFpbCAqL1xyXG4gICAgcHJpdmF0ZSBvbkVycm9yKGVycjogYW55KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnUkVRVUVTVCBGQUlMOicsIGVycik7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBocmFzZSBlZGl0b3IgKi9cclxuY2xhc3MgRWRpdG9yXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSBjb250YWluZXIgZm9yIHRoZSBlZGl0b3IgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIGRpYWxvZywgaWYgYW55ICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRQaWNrZXI/IDogUGlja2VyO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlIGVsZW1lbnQgY3VycmVudGx5IGJlaW5nIGVkaXRlZCwgaWYgYW55ICovXHJcbiAgICAvLyBEbyBub3QgRFJZOyBuZWVkcyB0byBiZSBwYXNzZWQgdG8gdGhlIHBpY2tlciBmb3IgY2xlYW5lciBjb2RlXHJcbiAgICBwcml2YXRlIGRvbUVkaXRpbmc/ICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSA9IERPTS5yZXF1aXJlKCcjZWRpdG9yJyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkub25jbGljayA9IHRoaXMub25DbGljay5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHdpbmRvdy5vbnJlc2l6ZSAgICAgICA9IHRoaXMub25SZXNpemUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbS5vbnNjcm9sbCAgICAgPSB0aGlzLm9uU2Nyb2xsLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb20udGV4dENvbnRlbnQgID0gTC5FRElUT1JfSU5JVCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyB0aGUgZWRpdG9yIHdpdGggYSByb290IHBocmFzZXNldCByZWZlcmVuY2UsIGFuZCBleHBhbmRzIGl0IGludG8gSFRNTCAqL1xyXG4gICAgcHVibGljIGdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJzxwaHJhc2VzZXQgcmVmPVwicm9vdFwiIC8+JztcclxuXHJcbiAgICAgICAgUkFHLnBocmFzZXIucHJvY2Vzcyh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIC8vIEZvciBzY3JvbGwtcGFzdCBwYWRkaW5nIHVuZGVyIHRoZSBwaHJhc2VcclxuICAgICAgICBsZXQgcGFkZGluZyAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICBwYWRkaW5nLmNsYXNzTmFtZSA9ICdib3R0b21QYWRkaW5nJztcclxuXHJcbiAgICAgICAgdGhpcy5kb20uYXBwZW5kQ2hpbGQocGFkZGluZyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcHJvY2Vzc2VzIGFsbCBwaHJhc2VzZXQgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHJlZiwgaWYgdGhlaXIgaW5kZXggaGFzIGNoYW5nZWQgKi9cclxuICAgIHB1YmxpYyByZWZyZXNoUGhyYXNlc2V0KHJlZjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBOb3RlLCB0aGlzIGNvdWxkIHBvdGVudGlhbGx5IGJ1ZyBvdXQgaWYgYSBwaHJhc2VzZXQncyBkZXNjZW5kYW50IHJlZmVyZW5jZXNcclxuICAgICAgICAvLyB0aGUgc2FtZSBwaHJhc2VzZXQgKHJlY3Vyc2lvbikuIEJ1dCB0aGlzIGlzIG9rYXkgYmVjYXVzZSBwaHJhc2VzZXRzIHNob3VsZFxyXG4gICAgICAgIC8vIG5ldmVyIGluY2x1ZGUgdGhlbXNlbHZlcywgZXZlbiBldmVudHVhbGx5LlxyXG5cclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuW2RhdGEtdHlwZT1waHJhc2VzZXRdW2RhdGEtcmVmPSR7cmVmfV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChfID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50ICAgID0gXyBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncGhyYXNlc2V0Jyk7XHJcbiAgICAgICAgICAgICAgICBsZXQgY2hhbmNlICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY2hhbmNlJ107XHJcblxyXG4gICAgICAgICAgICAgICAgbmV3RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JlZicsIHJlZik7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGNoYW5jZSlcclxuICAgICAgICAgICAgICAgICAgICBuZXdFbGVtZW50LnNldEF0dHJpYnV0ZSgnY2hhbmNlJywgY2hhbmNlKTtcclxuXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MobmV3RWxlbWVudC5wYXJlbnRFbGVtZW50ISk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhIHN0YXRpYyBOb2RlTGlzdCBvZiBhbGwgcGhyYXNlIGVsZW1lbnRzIG9mIHRoZSBnaXZlbiBxdWVyeS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgUXVlcnkgc3RyaW5nIHRvIGFkZCBvbnRvIHRoZSBgc3BhbmAgc2VsZWN0b3JcclxuICAgICAqIEByZXR1cm5zIE5vZGUgbGlzdCBvZiBhbGwgZWxlbWVudHMgbWF0Y2hpbmcgdGhlIGdpdmVuIHNwYW4gcXVlcnlcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldEVsZW1lbnRzQnlRdWVyeShxdWVyeTogc3RyaW5nKSA6IE5vZGVMaXN0XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoYHNwYW4ke3F1ZXJ5fWApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHBocmFzZSdzIHJvb3QgRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2UoKSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmZpcnN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHBocmFzZSBpbiB0aGUgZWRpdG9yIGFzIHRleHQsIGV4Y2x1ZGluZyB0aGUgaGlkZGVuIHBhcnRzICovXHJcbiAgICBwdWJsaWMgZ2V0VGV4dCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIERPTS5nZXRDbGVhbmVkVmlzaWJsZVRleHQodGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgYWxsIHBocmFzZSBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gdHlwZSwgYW5kIHNldHMgdGhlaXIgdGV4dCB0byBnaXZlbiB2YWx1ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdHlwZSBPcmlnaW5hbCBYTUwgbmFtZSBvZiBlbGVtZW50cyB0byByZXBsYWNlIGNvbnRlbnRzIG9mXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgTmV3IHRleHQgZm9yIHRoZSBmb3VuZCBlbGVtZW50cyB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEVsZW1lbnRzVGV4dCh0eXBlOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPSR7dHlwZX1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgYW55IGN1cnJlbnRseSBvcGVuIGVkaXRvciBkaWFsb2dzICovXHJcbiAgICBwdWJsaWMgY2xvc2VEaWFsb2coKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIuY2xvc2UoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZG9tRWRpdGluZylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5yZW1vdmVBdHRyaWJ1dGUoJ2VkaXRpbmcnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2Fib3ZlJywgJ2JlbG93Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGEgY2xpY2sgYW55d2hlcmUgaW4gdGhlIHdpbmRvdyBkZXBlbmRpbmcgb24gdGhlIGNvbnRleHQgKi9cclxuICAgIHByaXZhdGUgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhcmdldCA9IGV2LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgdHlwZSAgID0gdGFyZ2V0ID8gdGFyZ2V0LmRhdGFzZXRbJ3R5cGUnXSAgICA6IHVuZGVmaW5lZDtcclxuICAgICAgICBsZXQgcGlja2VyID0gdHlwZSAgID8gUkFHLnZpZXdzLmdldFBpY2tlcih0eXBlKSA6IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKCF0YXJnZXQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNsb3NlRGlhbG9nKCk7XHJcblxyXG4gICAgICAgIC8vIFJlZGlyZWN0IGNsaWNrcyBvZiBpbm5lciBlbGVtZW50c1xyXG4gICAgICAgIGlmICggdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnaW5uZXInKSAmJiB0YXJnZXQucGFyZW50RWxlbWVudCApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0YXJnZXQgPSB0YXJnZXQucGFyZW50RWxlbWVudDtcclxuICAgICAgICAgICAgdHlwZSAgID0gdGFyZ2V0LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICAgICAgcGlja2VyID0gdHlwZSA/IFJBRy52aWV3cy5nZXRQaWNrZXIodHlwZSkgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIHRvIGFueSBpbm5lciBkb2N1bWVudCBvciB1bm93bmVkIGVsZW1lbnRcclxuICAgICAgICBpZiAoICFkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3MgdG8gYW55IGVsZW1lbnQgb2YgYWxyZWFkeSBvcGVuIHBpY2tlcnNcclxuICAgICAgICBpZiAoIHRoaXMuY3VycmVudFBpY2tlciApXHJcbiAgICAgICAgaWYgKCB0aGlzLmN1cnJlbnRQaWNrZXIuZG9tLmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbnkgb3BlbiBlZGl0b3JzXHJcbiAgICAgICAgbGV0IHByZXZUYXJnZXQgPSB0aGlzLmRvbUVkaXRpbmc7XHJcbiAgICAgICAgdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBJZiBjbGlja2luZyB0aGUgZWxlbWVudCBhbHJlYWR5IGJlaW5nIGVkaXRlZCwgZG9uJ3QgcmVvcGVuXHJcbiAgICAgICAgaWYgKHRhcmdldCA9PT0gcHJldlRhcmdldClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgY29sbGFwc2libGUgZWxlbWVudHNcclxuICAgICAgICBpZiAoIHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3RvZ2dsZScpIClcclxuICAgICAgICAgICAgdGhpcy50b2dnbGVDb2xsYXBzaWFibGUodGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gRmluZCBhbmQgb3BlbiBwaWNrZXIgZm9yIHRoZSB0YXJnZXQgZWxlbWVudFxyXG4gICAgICAgIGVsc2UgaWYgKHR5cGUgJiYgcGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLm9wZW5QaWNrZXIodGFyZ2V0LCBwaWNrZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZS1sYXlvdXQgdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBvbiByZXNpemUgKi9cclxuICAgIHByaXZhdGUgb25SZXNpemUoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRQaWNrZXIpXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpY2tlci5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmUtbGF5b3V0IHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgb24gc2Nyb2xsICovXHJcbiAgICBwcml2YXRlIG9uU2Nyb2xsKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBXb3JrYXJvdW5kIGZvciBsYXlvdXQgYmVoYXZpbmcgd2VpcmQgd2hlbiBpT1Mga2V5Ym9hcmQgaXMgb3BlblxyXG4gICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlci5oYXNGb2N1cygpKVxyXG4gICAgICAgICAgICBET00uYmx1ckFjdGl2ZSgpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGbGlwcyB0aGUgY29sbGFwc2Ugc3RhdGUgb2YgYSBjb2xsYXBzaWJsZSwgYW5kIHByb3BhZ2F0ZXMgdGhlIG5ldyBzdGF0ZSB0byBvdGhlclxyXG4gICAgICogY29sbGFwc2libGVzIG9mIHRoZSBzYW1lIHJlZmVyZW5jZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IENvbGxhcHNpYmxlIGVsZW1lbnQgYmVpbmcgdG9nZ2xlZFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHRvZ2dsZUNvbGxhcHNpYWJsZSh0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICAgICA9IHRhcmdldC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgcmVmICAgICAgICA9IERPTS5yZXF1aXJlRGF0YShwYXJlbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgdHlwZSAgICAgICA9IERPTS5yZXF1aXJlRGF0YShwYXJlbnQsICd0eXBlJyk7XHJcbiAgICAgICAgbGV0IGNvbGxhcGFzZWQgPSBwYXJlbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKTtcclxuXHJcbiAgICAgICAgLy8gUHJvcGFnYXRlIG5ldyBjb2xsYXBzZSBzdGF0ZSB0byBhbGwgY29sbGFwc2libGVzIG9mIHRoZSBzYW1lIHJlZlxyXG4gICAgICAgIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoYHNwYW5bZGF0YS10eXBlPSR7dHlwZX1dW2RhdGEtcmVmPSR7cmVmfV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChfID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBwaHJhc2VzZXQgPSBfIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgbGV0IHRvZ2dsZSAgICA9IHBocmFzZXNldC5jaGlsZHJlblswXSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBTa2lwIHNhbWUtcmVmIGVsZW1lbnRzIHRoYXQgYXJlbid0IGNvbGxhcHNpYmxlXHJcbiAgICAgICAgICAgICAgICBpZiAoICF0b2dnbGUgfHwgIXRvZ2dsZS5jbGFzc0xpc3QuY29udGFpbnMoJ3RvZ2dsZScpIClcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAgICAgQ29sbGFwc2libGVzLnNldChwaHJhc2VzZXQsIHRvZ2dsZSwgIWNvbGxhcGFzZWQpO1xyXG4gICAgICAgICAgICAgICAgLy8gRG9uJ3QgbW92ZSB0aGlzIHRvIHNldENvbGxhcHNpYmxlLCBhcyBzdGF0ZSBzYXZlL2xvYWQgaXMgaGFuZGxlZFxyXG4gICAgICAgICAgICAgICAgLy8gb3V0c2lkZSBpbiBib3RoIHVzYWdlcyBvZiBzZXRDb2xsYXBzaWJsZS5cclxuICAgICAgICAgICAgICAgIFJBRy5zdGF0ZS5zZXRDb2xsYXBzZWQocmVmLCAhY29sbGFwYXNlZCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogT3BlbnMgYSBwaWNrZXIgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWRpdG9yIGVsZW1lbnQgdG8gb3BlbiB0aGUgcGlja2VyIGZvclxyXG4gICAgICogQHBhcmFtIHBpY2tlciBQaWNrZXIgdG8gb3BlblxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9wZW5QaWNrZXIodGFyZ2V0OiBIVE1MRWxlbWVudCwgcGlja2VyOiBQaWNrZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRhcmdldC5zZXRBdHRyaWJ1dGUoJ2VkaXRpbmcnLCAndHJ1ZScpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIgPSBwaWNrZXI7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nICAgID0gdGFyZ2V0O1xyXG4gICAgICAgIHBpY2tlci5vcGVuKHRhcmdldCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUgKi9cclxuY2xhc3MgTWFycXVlZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYXJxdWVlJ3MgRE9NIGVsZW1lbnQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc3BhbiBlbGVtZW50IGluIHRoZSBtYXJxdWVlLCB3aGVyZSB0aGUgdGV4dCBpcyBzZXQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tU3BhbiA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgSUQgZm9yIHRoZSBzY3JvbGxpbmcgYW5pbWF0aW9uIHRpbWVyICovXHJcbiAgICBwcml2YXRlIHRpbWVyICA6IG51bWJlciA9IDA7XHJcbiAgICAvKiogQ3VycmVudCBvZmZzZXQgKGluIHBpeGVscykgb2YgdGhlIHNjcm9sbGluZyBtYXJxdWVlICovXHJcbiAgICBwcml2YXRlIG9mZnNldCA6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSAgICAgPSBET00ucmVxdWlyZSgnI21hcnF1ZWUnKTtcclxuICAgICAgICB0aGlzLmRvbVNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmlubmVySFRNTCA9ICcnO1xyXG4gICAgICAgIHRoaXMuZG9tLmFwcGVuZENoaWxkKHRoaXMuZG9tU3Bhbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIG1lc3NhZ2Ugb24gdGhlIHNjcm9sbGluZyBtYXJxdWVlLCBhbmQgc3RhcnRzIGFuaW1hdGluZyBpdCAqL1xyXG4gICAgcHVibGljIHNldChtc2c6IHN0cmluZywgYW5pbWF0ZTogYm9vbGVhbiA9IHRydWUpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLnRpbWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TcGFuLnRleHRDb250ZW50ID0gbXNnO1xyXG5cclxuICAgICAgICBpZiAoIWFuaW1hdGUpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSSB0cmllZCB0byB1c2UgQ1NTIGFuaW1hdGlvbiBmb3IgdGhpcywgYnV0IGNvdWxkbid0IGZpZ3VyZSBvdXQgaG93IGZvciBhXHJcbiAgICAgICAgLy8gZHluYW1pY2FsbHkgc2l6ZWQgZWxlbWVudCBsaWtlIHRoZSBzcGFuLlxyXG4gICAgICAgIHRoaXMub2Zmc2V0ID0gdGhpcy5kb20uY2xpZW50V2lkdGg7XHJcbiAgICAgICAgbGV0IGxpbWl0ICAgPSAtdGhpcy5kb21TcGFuLmNsaWVudFdpZHRoIC0gMTAwO1xyXG4gICAgICAgIGxldCBhbmltICAgID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMub2Zmc2V0ICAgICAgICAgICAgICAgICAgLT0gNjtcclxuICAgICAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSAgPSBgdHJhbnNsYXRlWCgke3RoaXMub2Zmc2V0fXB4KWA7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vZmZzZXQgPCBsaW1pdClcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhpcy50aW1lciA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3RvcHMgdGhlIGN1cnJlbnQgbWFycXVlZSBhbmltYXRpb24gKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuY2xhc3MgU2V0dGluZ3Ncclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY29udGFpbmVyIGZvciB0aGUgc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwcml2YXRlIGRvbSAgICAgICAgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIFwiUmVzZXQgc2V0dGluZ3NcIiBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuUmVzZXQgICAgICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgXCJTYXZlIGFuZCBjbG9zZVwiIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5TYXZlICAgICAgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSB2b2ljZSBzZWxlY3Rpb24gYm94ICovXHJcbiAgICBwcml2YXRlIHNlbFNwZWVjaFZvaWNlICAgOiBIVE1MU2VsZWN0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHZvaWNlIHZvbHVtZSBzbGlkZXIgKi9cclxuICAgIHByaXZhdGUgcmFuZ2VTcGVlY2hWb2wgICA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSB2b2ljZSBwaXRjaCBzbGlkZXIgKi9cclxuICAgIHByaXZhdGUgcmFuZ2VTcGVlY2hQaXRjaCA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSB2b2ljZSByYXRlIHNsaWRlciAqL1xyXG4gICAgcHJpdmF0ZSByYW5nZVNwZWVjaFJhdGUgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNwZWVjaCB0ZXN0IGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5TcGVlY2hUZXN0ICAgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHRpbWVyIGZvciB0aGUgXCJSZXNldFwiIGJ1dHRvbiBjb25maXJtYXRpb24gc3RlcCAqL1xyXG4gICAgcHJpdmF0ZSByZXNldFRpbWVvdXQ/ICAgIDogbnVtYmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gR2VuZXJhbCBzZXR0aW5ncyBmb3JtXHJcblxyXG4gICAgICAgIHRoaXMuZG9tICAgICAgPSBET00ucmVxdWlyZSgnI3NldHRpbmdzU2NyZWVuJyk7XHJcbiAgICAgICAgdGhpcy5idG5SZXNldCA9IERPTS5yZXF1aXJlKCcjYnRuUmVzZXRTZXR0aW5ncycpO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZSAgPSBET00ucmVxdWlyZSgnI2J0blNhdmVTZXR0aW5ncycpO1xyXG5cclxuICAgICAgICB0aGlzLmJ0blJlc2V0Lm9uY2xpY2sgPSB0aGlzLmhhbmRsZVJlc2V0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlLm9uY2xpY2sgID0gdGhpcy5oYW5kbGVTYXZlLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIFNwZWVjaCBmb3JtXHJcblxyXG4gICAgICAgIHRoaXMuc2VsU3BlZWNoVm9pY2UgICA9IERPTS5yZXF1aXJlKCcjc2VsU3BlZWNoQ2hvaWNlJyk7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFZvbCAgID0gRE9NLnJlcXVpcmUoJyNyYW5nZVNwZWVjaFZvbCcpO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hQaXRjaCA9IERPTS5yZXF1aXJlKCcjcmFuZ2VTcGVlY2hQaXRjaCcpO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hSYXRlICA9IERPTS5yZXF1aXJlKCcjcmFuZ2VTcGVlY2hSYXRlJyk7XHJcbiAgICAgICAgdGhpcy5idG5TcGVlY2hUZXN0ICAgID0gRE9NLnJlcXVpcmUoJyNidG5TcGVlY2hUZXN0Jyk7XHJcblxyXG4gICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5vbmNsaWNrID0gdGhpcy5oYW5kbGVWb2ljZVRlc3QuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gTGVnYWwgYW5kIGFja25vd2xlZGdlbWVudHNcclxuXHJcbiAgICAgICAgTGlua2Rvd24ucGFyc2UoIERPTS5yZXF1aXJlKCcjbGVnYWxCbG9jaycpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIE9wZW5zIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyBvcGVuKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcblxyXG4gICAgICAgIC8vIFRoZSB2b2ljZSBsaXN0IGhhcyB0byBiZSBwb3B1bGF0ZWQgZWFjaCBvcGVuLCBpbiBjYXNlIGl0IGNoYW5nZXNcclxuICAgICAgICB0aGlzLnBvcHVsYXRlVm9pY2VMaXN0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuc2VsU3BlZWNoVm9pY2Uuc2VsZWN0ZWRJbmRleCAgID0gUkFHLmNvbmZpZy5zcGVlY2hWb2ljZTtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoVm9sLnZhbHVlQXNOdW1iZXIgICA9IFJBRy5jb25maWcuc3BlZWNoVm9sO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hQaXRjaC52YWx1ZUFzTnVtYmVyID0gUkFHLmNvbmZpZy5zcGVlY2hQaXRjaDtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZUFzTnVtYmVyICA9IFJBRy5jb25maWcuc3BlZWNoUmF0ZTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuY2FuY2VsUmVzZXQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xyXG4gICAgICAgIERPTS5ibHVyQWN0aXZlKHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYXJzIGFuZCBwb3B1bGF0ZXMgdGhlIHZvaWNlIGxpc3QgKi9cclxuICAgIHByaXZhdGUgcG9wdWxhdGVWb2ljZUxpc3QoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLnNlbFNwZWVjaFZvaWNlLmlubmVySFRNTCA9ICcnO1xyXG5cclxuICAgICAgICBsZXQgdm9pY2VzID0gUkFHLnNwZWVjaC5nZXRWb2ljZXMoKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGxpc3RcclxuICAgICAgICBpZiAodm9pY2VzLmxlbmd0aCA8PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IG9wdGlvbiAgICAgID0gRE9NLmFkZE9wdGlvbiggdGhpcy5zZWxTcGVlY2hWb2ljZSwgTC5TVF9TUEVFQ0hfRU1QVFkoKSApO1xyXG4gICAgICAgICAgICBvcHRpb24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvU3BlZWNoU3ludGhlc2lzXHJcbiAgICAgICAgZWxzZSBmb3IgKGxldCBpID0gMDsgaSA8IHZvaWNlcy5sZW5ndGggOyBpKyspXHJcbiAgICAgICAgICAgIERPTS5hZGRPcHRpb24odGhpcy5zZWxTcGVlY2hWb2ljZSwgYCR7dm9pY2VzW2ldLm5hbWV9ICgke3ZvaWNlc1tpXS5sYW5nfSlgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgcmVzZXQgYnV0dG9uLCB3aXRoIGEgY29uZmlybSBzdGVwIHRoYXQgY2FuY2VscyBhZnRlciAxNSBzZWNvbmRzICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnJlc2V0VGltZW91dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMucmVzZXRUaW1lb3V0ICAgICAgID0gc2V0VGltZW91dCh0aGlzLmNhbmNlbFJlc2V0LmJpbmQodGhpcyksIDE1MDAwKTtcclxuICAgICAgICAgICAgdGhpcy5idG5SZXNldC5pbm5lclRleHQgPSBMLlNUX1JFU0VUX0NPTkZJUk0oKTtcclxuICAgICAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX0NPTkZJUk1fVCgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBSQUcuY29uZmlnLnJlc2V0KCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5jYW5jZWwoKTtcclxuICAgICAgICB0aGlzLmNhbmNlbFJlc2V0KCk7XHJcbiAgICAgICAgdGhpcy5vcGVuKCk7XHJcbiAgICAgICAgYWxlcnQoIEwuU1RfUkVTRVRfRE9ORSgpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbmNlbCB0aGUgcmVzZXQgdGltZW91dCBhbmQgcmVzdG9yZSB0aGUgcmVzZXQgYnV0dG9uIHRvIG5vcm1hbCAqL1xyXG4gICAgcHJpdmF0ZSBjYW5jZWxSZXNldCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5yZXNldFRpbWVvdXQpO1xyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQuaW5uZXJUZXh0ID0gTC5TVF9SRVNFVCgpO1xyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQudGl0bGUgICAgID0gTC5TVF9SRVNFVF9UKCk7XHJcbiAgICAgICAgdGhpcy5yZXNldFRpbWVvdXQgICAgICAgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNhdmUgYnV0dG9uLCBzYXZpbmcgY29uZmlnIHRvIHN0b3JhZ2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlU2F2ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoVm9pY2UgID0gdGhpcy5zZWxTcGVlY2hWb2ljZS5zZWxlY3RlZEluZGV4O1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoVm9sICAgID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoVm9sLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFBpdGNoICA9IHBhcnNlRmxvYXQodGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFJhdGUgICA9IHBhcnNlRmxvYXQodGhpcy5yYW5nZVNwZWVjaFJhdGUudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc2F2ZSgpO1xyXG4gICAgICAgIHRoaXMuY2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc3BlZWNoIHRlc3QgYnV0dG9uLCBzcGVha2luZyBhIHRlc3QgcGhyYXNlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVZvaWNlVGVzdChldjogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5jYW5jZWwoKTtcclxuICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3QuZGlzYWJsZWQgPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBIYXMgdG8gZXhlY3V0ZSBvbiBhIGRlbGF5LCBhcyBzcGVlY2ggY2FuY2VsIGlzIHVucmVsaWFibGUgd2l0aG91dCBpdFxyXG4gICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3QuZGlzYWJsZWQgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgIGxldCB0aW1lICAgPSBTdHJpbmdzLmZyb21UaW1lKCBuZXcgRGF0ZSgpICk7XHJcbiAgICAgICAgICAgIGxldCBwaHJhc2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcblxyXG4gICAgICAgICAgICAvLyBUT0RPOiBVc2UgdGhlIHBocmFzZXNldCBkb2N1bWVudCBmb3IgdGhpc1xyXG4gICAgICAgICAgICBwaHJhc2UuaW5uZXJIVE1MID0gJzxzcGFuIGRhdGEtdHlwZT1cInBocmFzZVwiIGRhdGEtcmVmPVwic2FtcGxlXCI+JyArXHJcbiAgICAgICAgICAgICAgICAnVGhpcyBpcyBhIHRlc3Qgb2YgdGhlIFJhaWwgQW5ub3VuY2VtZW50IEdlbmVyYXRvciBhdCcgK1xyXG4gICAgICAgICAgICAgICAgJzxzcGFuIGRhdGEtdHlwZT1cInRpbWVcIj4nICsgdGltZSArICc8L3NwYW4+JyArXHJcbiAgICAgICAgICAgICAgICAnPC9zcGFuPic7XHJcblxyXG4gICAgICAgICAgICBSQUcuc3BlZWNoLnNwZWFrKFxyXG4gICAgICAgICAgICAgICAgcGhyYXNlLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCxcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICB2b2ljZUlkeCA6IHRoaXMuc2VsU3BlZWNoVm9pY2Uuc2VsZWN0ZWRJbmRleCxcclxuICAgICAgICAgICAgICAgICAgICB2b2x1bWUgICA6IHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWVBc051bWJlcixcclxuICAgICAgICAgICAgICAgICAgICBwaXRjaCAgICA6IHRoaXMucmFuZ2VTcGVlY2hQaXRjaC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHJhdGUgICAgIDogdGhpcy5yYW5nZVNwZWVjaFJhdGUudmFsdWVBc051bWJlclxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0sIDIwMCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgdG9wIHRvb2xiYXIgKi9cclxuY2xhc3MgVG9vbGJhclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjb250YWluZXIgZm9yIHRoZSB0b29sYmFyICovXHJcbiAgICBwcml2YXRlIGRvbSAgICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwbGF5IGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5QbGF5ICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc3RvcCBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuU3RvcCAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGdlbmVyYXRlIHJhbmRvbSBwaHJhc2UgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0bkdlbmVyYXRlIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzYXZlIHN0YXRlIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5TYXZlICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcmVjYWxsIHN0YXRlIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5SZWNhbGwgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc2V0dGluZ3MgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0bk9wdGlvbiAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSAgICAgICAgID0gRE9NLnJlcXVpcmUoJyN0b29sYmFyJyk7XHJcbiAgICAgICAgdGhpcy5idG5QbGF5ICAgICA9IERPTS5yZXF1aXJlKCcjYnRuUGxheScpO1xyXG4gICAgICAgIHRoaXMuYnRuU3RvcCAgICAgPSBET00ucmVxdWlyZSgnI2J0blN0b3AnKTtcclxuICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlID0gRE9NLnJlcXVpcmUoJyNidG5TaHVmZmxlJyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlICAgICA9IERPTS5yZXF1aXJlKCcjYnRuU2F2ZScpO1xyXG4gICAgICAgIHRoaXMuYnRuUmVjYWxsICAgPSBET00ucmVxdWlyZSgnI2J0bkxvYWQnKTtcclxuICAgICAgICB0aGlzLmJ0bk9wdGlvbiAgID0gRE9NLnJlcXVpcmUoJyNidG5TZXR0aW5ncycpO1xyXG5cclxuICAgICAgICB0aGlzLmJ0blN0b3Aub25jbGljayAgICAgPSB0aGlzLmhhbmRsZVN0b3AuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLm9uY2xpY2sgPSB0aGlzLmhhbmRsZUdlbmVyYXRlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlLm9uY2xpY2sgICAgID0gdGhpcy5oYW5kbGVTYXZlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5SZWNhbGwub25jbGljayAgID0gdGhpcy5oYW5kbGVMb2FkLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5PcHRpb24ub25jbGljayAgID0gdGhpcy5oYW5kbGVPcHRpb24uYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgdGhpcy5idG5QbGF5Lm9uY2xpY2sgPSBldiA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gSGFzIHRvIGV4ZWN1dGUgb24gYSBkZWxheSwgYXMgc3BlZWNoIGNhbmNlbCBpcyB1bnJlbGlhYmxlIHdpdGhvdXQgaXRcclxuICAgICAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgUkFHLnNwZWVjaC5jYW5jZWwoKTtcclxuICAgICAgICAgICAgdGhpcy5idG5QbGF5LmRpc2FibGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQodGhpcy5oYW5kbGVQbGF5LmJpbmQodGhpcyksIDIwMCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gQWRkIHRocm9iIGNsYXNzIGlmIHRoZSBnZW5lcmF0ZSBidXR0b24gaGFzbid0IGJlZW4gY2xpY2tlZCBiZWZvcmVcclxuICAgICAgICBpZiAoIVJBRy5jb25maWcuY2xpY2tlZEdlbmVyYXRlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5idG5HZW5lcmF0ZS5jbGFzc0xpc3QuYWRkKCd0aHJvYicpO1xyXG4gICAgICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5idG5QbGF5LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHBsYXkgYnV0dG9uLCBwbGF5aW5nIHRoZSBlZGl0b3IncyBjdXJyZW50IHBocmFzZSB3aXRoIHNwZWVjaCAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVQbGF5KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gTm90ZTogSXQgd291bGQgYmUgbmljZSB0byBoYXZlIHRoZSBwbGF5IGJ1dHRvbiBjaGFuZ2UgdG8gdGhlIHN0b3AgYnV0dG9uIGFuZFxyXG4gICAgICAgIC8vIGF1dG9tYXRpY2FsbHkgY2hhbmdlIGJhY2suIEhvd2V2ZXIsIHNwZWVjaCdzICdvbmVuZCcgZXZlbnQgd2FzIGZvdW5kIHRvIGJlXHJcbiAgICAgICAgLy8gdW5yZWxpYWJsZSwgc28gSSBkZWNpZGVkIHRvIGtlZXAgcGxheSBhbmQgc3RvcCBzZXBhcmF0ZS5cclxuXHJcbiAgICAgICAgUkFHLnNwZWVjaC5zcGVhayggUkFHLnZpZXdzLmVkaXRvci5nZXRQaHJhc2UoKSApO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggUkFHLnZpZXdzLmVkaXRvci5nZXRUZXh0KCkgKTtcclxuICAgICAgICB0aGlzLmJ0blBsYXkuZGlzYWJsZWQgPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc3RvcCBidXR0b24sIHN0b3BwaW5nIHRoZSBtYXJxdWVlIGFuZCBhbnkgc3BlZWNoICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVN0b3AoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnN0b3AoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgZ2VuZXJhdGUgYnV0dG9uLCBnZW5lcmF0aW5nIG5ldyByYW5kb20gc3RhdGUgYW5kIHBocmFzZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVHZW5lcmF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFJlbW92ZSB0aGUgY2FsbC10by1hY3Rpb24gdGhyb2IgZnJvbSBpbml0aWFsIGxvYWRcclxuICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmNsYXNzTGlzdC5yZW1vdmUoJ3Rocm9iJyk7XHJcbiAgICAgICAgUkFHLmdlbmVyYXRlKCk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5jbGlja2VkR2VuZXJhdGUgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzYXZlIGJ1dHRvbiwgcGVyc2lzdGluZyB0aGUgY3VycmVudCB0cmFpbiBzdGF0ZSB0byBzdG9yYWdlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjc3MgPSAnZm9udC1zaXplOiBsYXJnZTsgZm9udC13ZWlnaHQ6IGJvbGQ7JztcclxuICAgICAgICAgICAgbGV0IHJhdyA9IEpTT04uc3RyaW5naWZ5KFJBRy5zdGF0ZSk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnc3RhdGUnLCByYXcpO1xyXG5cclxuICAgICAgICAgICAgY29uc29sZS5sb2coTC5TVEFURV9DT1BZX1BBU1RFKCksIGNzcyk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiUkFHLmxvYWQoJ1wiLCByYXcucmVwbGFjZShcIidcIiwgXCJcXFxcJ1wiKSwgXCInKVwiKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coTC5TVEFURV9SQVdfSlNPTigpLCBjc3MpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhyYXcpO1xyXG5cclxuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX1RPX1NUT1JBR0UoKSApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9TQVZFX0ZBSUwoZS5tZXNzYWdlKSApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgbG9hZCBidXR0b24sIGxvYWRpbmcgdHJhaW4gc3RhdGUgZnJvbSBzdG9yYWdlLCBpZiBpdCBleGlzdHMgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlTG9hZCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBkYXRhID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdzdGF0ZScpO1xyXG5cclxuICAgICAgICByZXR1cm4gZGF0YVxyXG4gICAgICAgICAgICA/IFJBRy5sb2FkKGRhdGEpXHJcbiAgICAgICAgICAgIDogUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX1NBVkVfTUlTU0lORygpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNldHRpbmdzIGJ1dHRvbiwgb3BlbmluZyB0aGUgc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwcml2YXRlIGhhbmRsZU9wdGlvbigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy52aWV3cy5zZXR0aW5ncy5vcGVuKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYW5hZ2VzIFVJIGVsZW1lbnRzIGFuZCB0aGVpciBsb2dpYyAqL1xyXG5jbGFzcyBWaWV3c1xyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIGVkaXRvciBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZWRpdG9yICAgOiBFZGl0b3I7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIG1hcnF1ZWUgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IG1hcnF1ZWUgIDogTWFycXVlZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHNldHRpbmdzIDogU2V0dGluZ3M7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIHRvb2xiYXIgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHRvb2xiYXIgIDogVG9vbGJhcjtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGFsbCB0aGUgcGlja2Vycywgb25lIGZvciBlYWNoIHR5cGUgb2YgWE1MIGVsZW1lbnQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcGlja2VycyAgOiBEaWN0aW9uYXJ5PFBpY2tlcj47XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmVkaXRvciAgID0gbmV3IEVkaXRvcigpO1xyXG4gICAgICAgIHRoaXMubWFycXVlZSAgPSBuZXcgTWFycXVlZSgpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBuZXcgU2V0dGluZ3MoKTtcclxuICAgICAgICB0aGlzLnRvb2xiYXIgID0gbmV3IFRvb2xiYXIoKTtcclxuICAgICAgICB0aGlzLnBpY2tlcnMgID0ge307XHJcblxyXG4gICAgICAgIFtcclxuICAgICAgICAgICAgbmV3IENvYWNoUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBFeGN1c2VQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IEludGVnZXJQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IE5hbWVkUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBQaHJhc2VzZXRQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFBsYXRmb3JtUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTZXJ2aWNlUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTdGF0aW9uUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTdGF0aW9uTGlzdFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgVGltZVBpY2tlcigpXHJcbiAgICAgICAgXS5mb3JFYWNoKHBpY2tlciA9PiB0aGlzLnBpY2tlcnNbcGlja2VyLnhtbFRhZ10gPSBwaWNrZXIpO1xyXG5cclxuICAgICAgICAvLyBHbG9iYWwgaG90a2V5c1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkub25rZXlkb3duID0gdGhpcy5vbklucHV0LmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGlPUy1zcGVjaWZpYyBDU1MgZml4ZXNcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoJ2lvcycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBwaWNrZXIgdGhhdCBoYW5kbGVzIGEgZ2l2ZW4gdGFnLCBpZiBhbnkgKi9cclxuICAgIHB1YmxpYyBnZXRQaWNrZXIoeG1sVGFnOiBzdHJpbmcpIDogUGlja2VyXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucGlja2Vyc1t4bWxUYWddO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGUgRVNDIHRvIGNsb3NlIHBpY2tlcnMgb3Igc2V0dGlnbnMgKi9cclxuICAgIHByaXZhdGUgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGV2LmtleSAhPT0gJ0VzY2FwZScpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzLmNsb3NlKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCBjb2xsYXBzaWJsZSBlbGVtZW50cyAqL1xyXG5jbGFzcyBDb2xsYXBzaWJsZXNcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNwYW4gVGhlIGVuY2Fwc3VsYXRpbmcgY29sbGFwc2libGUgZWxlbWVudFxyXG4gICAgICogQHBhcmFtIHRvZ2dsZSBUaGUgdG9nZ2xlIGNoaWxkIG9mIHRoZSBjb2xsYXBzaWJsZSBlbGVtZW50XHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgVHJ1ZSB0byBjb2xsYXBzZSwgZmFsc2UgdG8gb3BlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNldChzcGFuOiBIVE1MRWxlbWVudCwgdG9nZ2xlOiBIVE1MRWxlbWVudCwgc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgID0gc3Bhbi5kYXRhc2V0WydyZWYnXSB8fCAnPz8/JztcclxuICAgICAgICBsZXQgdHlwZSA9IHNwYW4uZGF0YXNldFsndHlwZSddITtcclxuXHJcbiAgICAgICAgaWYgKHN0YXRlKSBzcGFuLnNldEF0dHJpYnV0ZSgnY29sbGFwc2VkJywgJycpO1xyXG4gICAgICAgIGVsc2UgICAgICAgc3Bhbi5yZW1vdmVBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpO1xyXG5cclxuICAgICAgICB0b2dnbGUudGl0bGUgPSBzdGF0ZVxyXG4gICAgICAgICAgICA/IEwuVElUTEVfT1BUX09QRU4odHlwZSwgcmVmKVxyXG4gICAgICAgICAgICA6IEwuVElUTEVfT1BUX0NMT1NFKHR5cGUsIHJlZik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBTdWdhciBmb3IgY2hvb3Npbmcgc2Vjb25kIHZhbHVlIGlmIGZpcnN0IGlzIHVuZGVmaW5lZCwgaW5zdGVhZCBvZiBmYWxzeSAqL1xyXG5mdW5jdGlvbiBlaXRoZXI8VD4odmFsdWU6IFQgfCB1bmRlZmluZWQsIHZhbHVlMjogVCkgOiBUXHJcbntcclxuICAgIHJldHVybiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkgPyB2YWx1ZTIgOiB2YWx1ZTtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIHRoZSBET00gKi9cclxuY2xhc3MgRE9NXHJcbntcclxuICAgIC8qKiBXaGV0aGVyIHRoZSB3aW5kb3cgaXMgdGhpbm5lciB0aGFuIGEgc3BlY2lmaWMgc2l6ZSAoYW5kLCB0aHVzLCBpcyBcIm1vYmlsZVwiKSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgaXNNb2JpbGUoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aCA8PSA1MDA7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgUkFHIGFwcGVhcnMgdG8gYmUgcnVubmluZyBvbiBhbiBpT1MgZGV2aWNlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBpc2lPUygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3IucGxhdGZvcm0ubWF0Y2goL2lQaG9uZXxpUG9kfGlQYWQvZ2kpICE9PSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBhdHRyaWJ1dGUgZnJvbSB0aGUgZ2l2ZW4gZWxlbWVudCwgb3IgcmV0dXJucyB0aGUgZ2l2ZW5cclxuICAgICAqIGRlZmF1bHQgdmFsdWUgaWYgdW5zZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGF0dHJpYnV0ZSBvZlxyXG4gICAgICogQHBhcmFtIGF0dHIgTmFtZSBvZiB0aGUgYXR0cmlidXRlIHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEBwYXJhbSBkZWYgRGVmYXVsdCB2YWx1ZSBpZiBhdHRyaWJ1dGUgaXNuJ3Qgc2V0XHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gYXR0cmlidXRlJ3MgdmFsdWUsIG9yIGRlZmF1bHQgdmFsdWUgaWYgdW5zZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRBdHRyKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBhdHRyOiBzdHJpbmcsIGRlZjogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBlbGVtZW50Lmhhc0F0dHJpYnV0ZShhdHRyKVxyXG4gICAgICAgICAgICA/IGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHIpIVxyXG4gICAgICAgICAgICA6IGRlZjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIGFuIGVsZW1lbnQgZnJvbSB0aGUgZ2l2ZW4gZG9jdW1lbnQsIHRocm93aW5nIGFuIGVycm9yIGlmIG5vIG1hdGNoIGlzIGZvdW5kLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBxdWVyeSBDU1Mgc2VsZWN0b3IgcXVlcnkgdG8gdXNlXHJcbiAgICAgKiBAcGFyYW0gcGFyZW50IFBhcmVudCBvYmplY3QgdG8gc2VhcmNoOyBkZWZhdWx0cyB0byBkb2N1bWVudFxyXG4gICAgICogQHJldHVybnMgVGhlIGZpcnN0IGVsZW1lbnQgdG8gbWF0Y2ggdGhlIGdpdmVuIHF1ZXJ5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZTxUIGV4dGVuZHMgSFRNTEVsZW1lbnQ+XHJcbiAgICAgICAgKHF1ZXJ5OiBzdHJpbmcsIHBhcmVudDogUGFyZW50Tm9kZSA9IHdpbmRvdy5kb2N1bWVudClcclxuICAgICAgICA6IFRcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gcGFyZW50LnF1ZXJ5U2VsZWN0b3IocXVlcnkpIGFzIFQ7XHJcblxyXG4gICAgICAgIGlmICghcmVzdWx0KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5ET01fTUlTU0lORyhxdWVyeSkgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gYXR0cmlidXRlIGZyb20gdGhlIGdpdmVuIGVsZW1lbnQsIHRocm93aW5nIGFuIGVycm9yXHJcbiAgICAgKiBpZiB0aGUgYXR0cmlidXRlIGlzIG1pc3NpbmcuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGF0dHJpYnV0ZSBvZlxyXG4gICAgICogQHBhcmFtIGF0dHIgTmFtZSBvZiB0aGUgYXR0cmlidXRlIHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBhdHRyaWJ1dGUncyB2YWx1ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmVBdHRyKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBhdHRyOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhZWxlbWVudC5oYXNBdHRyaWJ1dGUoYXR0cikgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5BVFRSX01JU1NJTkcoYXR0cikgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHIpITtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4ga2V5IG9mIHRoZSBnaXZlbiBlbGVtZW50J3MgZGF0YXNldCwgdGhyb3dpbmcgYW4gZXJyb3JcclxuICAgICAqIGlmIHRoZSB2YWx1ZSBpcyBtaXNzaW5nIG9yIGVtcHR5LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBkYXRhIG9mXHJcbiAgICAgKiBAcGFyYW0ga2V5IEtleSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gZGF0YXNldCdzIHZhbHVlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZURhdGEoZWxlbWVudDogSFRNTEVsZW1lbnQsIGtleTogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCB2YWx1ZSA9IGVsZW1lbnQuZGF0YXNldFtrZXldO1xyXG5cclxuICAgICAgICBpZiAoIFN0cmluZ3MuaXNOdWxsT3JFbXB0eSh2YWx1ZSkgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5EQVRBX01JU1NJTkcoa2V5KSApO1xyXG5cclxuICAgICAgICByZXR1cm4gdmFsdWUhO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQmx1cnMgKHVuZm9jdXNlcykgdGhlIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBhcmVudCBJZiBnaXZlbiwgb25seSBibHVycyBpZiBhY3RpdmUgaXMgZGVzY2VuZGFudFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJsdXJBY3RpdmUocGFyZW50OiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmJvZHkpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBhY3RpdmUgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIGFjdGl2ZSAmJiBhY3RpdmUuYmx1ciAmJiBwYXJlbnQuY29udGFpbnMoYWN0aXZlKSApXHJcbiAgICAgICAgICAgIGFjdGl2ZS5ibHVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBEZWVwIGNsb25lcyBhbGwgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50LCBpbnRvIHRoZSB0YXJnZXQgZWxlbWVudC5cclxuICAgICAqIFVzaW5nIGlubmVySFRNTCB3b3VsZCBiZSBlYXNpZXIsIGhvd2V2ZXIgaXQgaGFuZGxlcyBzZWxmLWNsb3NpbmcgdGFncyBwb29ybHkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNvdXJjZSBFbGVtZW50IHdob3NlIGNoaWxkcmVuIHRvIGNsb25lXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVsZW1lbnQgdG8gYXBwZW5kIHRoZSBjbG9uZWQgY2hpbGRyZW4gdG9cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjbG9uZUludG8oc291cmNlOiBIVE1MRWxlbWVudCwgdGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzb3VyY2UuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgdGFyZ2V0LmFwcGVuZENoaWxkKCBzb3VyY2UuY2hpbGROb2Rlc1tpXS5jbG9uZU5vZGUodHJ1ZSkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN1Z2FyIGZvciBjcmVhdGluZyBhbmQgYWRkaW5nIGFuIG9wdGlvbiBlbGVtZW50IHRvIGEgc2VsZWN0IGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBTZWxlY3QgbGlzdCBlbGVtZW50IHRvIGFkZCB0aGUgb3B0aW9uIHRvXHJcbiAgICAgKiBAcGFyYW0gdGV4dCBMYWJlbCBmb3IgdGhlIG9wdGlvblxyXG4gICAgICogQHBhcmFtIHZhbHVlIFZhbHVlIGZvciB0aGUgb3B0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYWRkT3B0aW9uKHNlbGVjdDogSFRNTFNlbGVjdEVsZW1lbnQsIHRleHQ6IHN0cmluZywgdmFsdWU6IHN0cmluZyA9ICcnKVxyXG4gICAgICAgIDogSFRNTE9wdGlvbkVsZW1lbnRcclxuICAgIHtcclxuICAgICAgICBsZXQgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJykgYXMgSFRNTE9wdGlvbkVsZW1lbnQ7XHJcblxyXG4gICAgICAgIG9wdGlvbi50ZXh0ICA9IHRleHQ7XHJcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gdmFsdWU7XHJcblxyXG4gICAgICAgIHNlbGVjdC5hZGQob3B0aW9uKTtcclxuICAgICAgICByZXR1cm4gb3B0aW9uO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdGV4dCBjb250ZW50IG9mIHRoZSBnaXZlbiBlbGVtZW50LCBleGNsdWRpbmcgdGhlIHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuLlxyXG4gICAgICogQmUgd2FybmVkOyB0aGlzIG1ldGhvZCB1c2VzIFJBRy1zcGVjaWZpYyBjb2RlLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE5OTg2MzI4XHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIHJlY3Vyc2l2ZWx5IGdldCB0ZXh0IGNvbnRlbnQgb2ZcclxuICAgICAqIEByZXR1cm5zIFRleHQgY29udGVudCBvZiBnaXZlbiBlbGVtZW50LCB3aXRob3V0IHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0VmlzaWJsZVRleHQoZWxlbWVudDogRWxlbWVudCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAgICAgIChlbGVtZW50Lm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQgfHwgJyc7XHJcbiAgICAgICAgZWxzZSBpZiAoIGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCd0b2dnbGUnKSApXHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuXHJcbiAgICAgICAgLy8gUmV0dXJuIGJsYW5rIChza2lwKSBpZiBjaGlsZCBvZiBhIGNvbGxhcHNlZCBlbGVtZW50LiBQcmV2aW91c2x5LCB0aGlzIHVzZWRcclxuICAgICAgICAvLyBnZXRDb21wdXRlZFN0eWxlLCBidXQgdGhhdCBkb2Vzbid0IHdvcmsgaWYgdGhlIGVsZW1lbnQgaXMgcGFydCBvZiBhbiBvcnBoYW5lZFxyXG4gICAgICAgIC8vIHBocmFzZSAoYXMgaGFwcGVucyB3aXRoIHRoZSBwaHJhc2VzZXQgcGlja2VyKS5cclxuICAgICAgICBsZXQgcGFyZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIHBhcmVudCAmJiBwYXJlbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuXHJcbiAgICAgICAgbGV0IHRleHQgPSAnJztcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgdGV4dCArPSBET00uZ2V0VmlzaWJsZVRleHQoZWxlbWVudC5jaGlsZE5vZGVzW2ldIGFzIEVsZW1lbnQpO1xyXG5cclxuICAgICAgICByZXR1cm4gdGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHRleHQgY29udGVudCBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgZXhjbHVkaW5nIHRoZSB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlbixcclxuICAgICAqIGFuZCBleGNlc3Mgd2hpdGVzcGFjZSBhcyBhIHJlc3VsdCBvZiBjb252ZXJ0aW5nIGZyb20gSFRNTC9YTUwuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gcmVjdXJzaXZlbHkgZ2V0IHRleHQgY29udGVudCBvZlxyXG4gICAgICogQHJldHVybnMgQ2xlYW5lZCB0ZXh0IG9mIGdpdmVuIGVsZW1lbnQsIHdpdGhvdXQgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRDbGVhbmVkVmlzaWJsZVRleHQoZWxlbWVudDogRWxlbWVudCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gU3RyaW5ncy5jbGVhbiggRE9NLmdldFZpc2libGVUZXh0KGVsZW1lbnQpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTY2FucyBmb3IgdGhlIG5leHQgZm9jdXNhYmxlIHNpYmxpbmcgZnJvbSBhIGdpdmVuIGVsZW1lbnQsIHNraXBwaW5nIGhpZGRlbiBvclxyXG4gICAgICogdW5mb2N1c2FibGUgZWxlbWVudHMuIElmIHRoZSBlbmQgb2YgdGhlIGNvbnRhaW5lciBpcyBoaXQsIHRoZSBzY2FuIHdyYXBzIGFyb3VuZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZnJvbSBFbGVtZW50IHRvIHN0YXJ0IHNjYW5uaW5nIGZyb21cclxuICAgICAqIEBwYXJhbSBkaXIgRGlyZWN0aW9uOyAtMSBmb3IgbGVmdCAocHJldmlvdXMpLCAxIGZvciByaWdodCAobmV4dClcclxuICAgICAqIEByZXR1cm5zIFRoZSBuZXh0IGF2YWlsYWJsZSBzaWJsaW5nLCBvciBudWxsIGlmIG5vbmUgZm91bmRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXROZXh0Rm9jdXNhYmxlU2libGluZyhmcm9tOiBIVE1MRWxlbWVudCwgZGlyOiBudW1iZXIpXHJcbiAgICAgICAgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICBsZXQgY3VycmVudCA9IGZyb207XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBmcm9tLnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICghcGFyZW50KVxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRydWUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBQcm9jZWVkIHRvIG5leHQgZWxlbWVudCwgb3Igd3JhcCBhcm91bmQgaWYgaGl0IHRoZSBlbmQgb2YgcGFyZW50XHJcbiAgICAgICAgICAgIGlmICAgICAgKGRpciA8IDApXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgcGFyZW50Lmxhc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA+IDApXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBwYXJlbnQuZmlyc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkJBRF9ESVJFQ1RJT04oIGRpci50b1N0cmluZygpICkgKTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGNvbWUgYmFjayB0byB0aGUgc3RhcnRpbmcgZWxlbWVudCwgbm90aGluZyB3YXMgZm91bmRcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnQgPT09IGZyb20pXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMgZWxlbWVudCBpc24ndCBoaWRkZW4gYW5kIGlzIGZvY3VzYWJsZSwgcmV0dXJuIGl0IVxyXG4gICAgICAgICAgICBpZiAoICFjdXJyZW50LmNsYXNzTGlzdC5jb250YWlucygnaGlkZGVuJykgKVxyXG4gICAgICAgICAgICBpZiAoIGN1cnJlbnQuaGFzQXR0cmlidXRlKCd0YWJpbmRleCcpIClcclxuICAgICAgICAgICAgICAgIHJldHVybiBjdXJyZW50O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGluZGV4IG9mIGEgY2hpbGQgZWxlbWVudCwgcmVsZXZhbnQgdG8gaXRzIHBhcmVudC5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS85MTMyNTc1LzMzNTQ5MjBcclxuICAgICAqIEBwYXJhbSBjaGlsZCBDaGlsZCBlbGVtZW50IHRvIGdldCB0aGUgaW5kZXggb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbmRleE9mKGNoaWxkOiBIVE1MRWxlbWVudCkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ID0gY2hpbGQucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgcmV0dXJuIHBhcmVudFxyXG4gICAgICAgICAgICA/IEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwocGFyZW50LmNoaWxkcmVuLCBjaGlsZClcclxuICAgICAgICAgICAgOiAtMTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGluZGV4IG9mIGEgY2hpbGQgbm9kZSwgcmVsZXZhbnQgdG8gaXRzIHBhcmVudC4gVXNlZCBmb3IgdGV4dCBub2Rlcy5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS85MTMyNTc1LzMzNTQ5MjBcclxuICAgICAqIEBwYXJhbSBjaGlsZCBDaGlsZCBub2RlIHRvIGdldCB0aGUgaW5kZXggb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBub2RlSW5kZXhPZihjaGlsZDogTm9kZSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ID0gY2hpbGQucGFyZW50Tm9kZTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHBhcmVudFxyXG4gICAgICAgICAgICA/IEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwocGFyZW50LmNoaWxkTm9kZXMsIGNoaWxkKVxyXG4gICAgICAgICAgICA6IC0xO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQSB2ZXJ5LCB2ZXJ5IHNtYWxsIHN1YnNldCBvZiBNYXJrZG93biBmb3IgaHlwZXJsaW5raW5nIGEgYmxvY2sgb2YgdGV4dCAqL1xyXG5jbGFzcyBMaW5rZG93blxyXG57XHJcbiAgICAvKiogUmVnZXggcGF0dGVybiBmb3IgbWF0Y2hpbmcgbGlua2VkIHRleHQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX0xJTksgPSAvXFxbKC4rPylcXF0vZ2k7XHJcbiAgICAvKiogUmVnZXggcGF0dGVybiBmb3IgbWF0Y2hpbmcgbGluayByZWZlcmVuY2VzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUdFWF9SRUYgID0gL1xcWyhcXGQrKVxcXTpcXHMrKFxcUyspL2dpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGFyc2VzIHRoZSB0ZXh0IG9mIHRoZSBnaXZlbiBibG9jayBhcyBMaW5rZG93biwgY29udmVydGluZyB0YWdnZWQgdGV4dCBpbnRvIGxpbmtzXHJcbiAgICAgKiB1c2luZyBhIGdpdmVuIGxpc3Qgb2YgaW5kZXgtYmFzZWQgcmVmZXJlbmNlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gYmxvY2sgRWxlbWVudCB3aXRoIHRleHQgdG8gcmVwbGFjZTsgYWxsIGNoaWxkcmVuIGNsZWFyZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZShibG9jazogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBsaW5rcyA6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBnZXQgdGhlIGxpc3Qgb2YgcmVmZXJlbmNlcywgcmVtb3ZpbmcgdGhlbSBmcm9tIHRoZSB0ZXh0XHJcbiAgICAgICAgbGV0IGlkeCAgPSAwO1xyXG4gICAgICAgIGxldCB0ZXh0ID0gYmxvY2suaW5uZXJUZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9SRUYsIChfLCBrLCB2KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGlua3NbIHBhcnNlSW50KGspIF0gPSB2O1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFRoZW4sIHJlcGxhY2UgZWFjaCB0YWdnZWQgcGFydCBvZiB0ZXh0IHdpdGggYSBsaW5rIGVsZW1lbnRcclxuICAgICAgICBibG9jay5pbm5lckhUTUwgPSB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9MSU5LLCAoXywgdCkgPT5cclxuICAgICAgICAgICAgYDxhIGhyZWY9JyR7bGlua3NbaWR4KytdfScgdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9vcGVuZXJcIj4ke3R9PC9hPmBcclxuICAgICAgICApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBwYXJzaW5nIGRhdGEgZnJvbSBzdHJpbmdzICovXHJcbmNsYXNzIFBhcnNlXHJcbntcclxuICAgIC8qKiBQYXJzZXMgYSBnaXZlbiBzdHJpbmcgaW50byBhIGJvb2xlYW4gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYm9vbGVhbihzdHI6IHN0cmluZykgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgc3RyID0gc3RyLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIGlmIChzdHIgPT09ICd0cnVlJyB8fCBzdHIgPT09ICcxJylcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgaWYgKHN0ciA9PT0gJ2ZhbHNlJyB8fCBzdHIgPT09ICcwJylcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICB0aHJvdyBFcnJvciggTC5CQURfQk9PTEVBTihzdHIpICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGdlbmVyYXRpbmcgcmFuZG9tIGRhdGEgKi9cclxuY2xhc3MgUmFuZG9tXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gaW50ZWdlciBmcm9tIHRoZSBnaXZlbiByYW5nZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gaW50ZWdlciB0byBwaWNrLCBpbmNsdXNpdmVcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBpbnRlZ2VyIHRvIHBpY2ssIGluY2x1c2l2ZVxyXG4gICAgICogQHJldHVybnMgUmFuZG9tIGludGVnZXIgd2l0aGluIHRoZSBnaXZlbiByYW5nZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGludChtaW46IG51bWJlciA9IDAsIG1heDogbnVtYmVyID0gMSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5mbG9vciggTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4pICkgKyBtaW47XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5LWxpa2Ugb2JqZWN0IHdpdGggYSBsZW5ndGggcHJvcGVydHkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXJyYXkoYXJyOiBMZW5ndGhhYmxlKSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBhcnJbIFJhbmRvbS5pbnQoMCwgYXJyLmxlbmd0aCkgXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3BsaWNlcyBhIHJhbmRvbSBlbGVtZW50IGZyb20gYSBnaXZlbiBhcnJheSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhcnJheVNwbGljZTxUPihhcnI6IFRbXSkgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGFyci5zcGxpY2UoUmFuZG9tLmludCgwLCBhcnIubGVuZ3RoKSwgMSlbMF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGtleSBmcm9tIGEgZ2l2ZW4gb2JqZWN0ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG9iamVjdEtleShvYmo6IHt9KSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkoIE9iamVjdC5rZXlzKG9iaikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIHRydWUgb3IgZmFsc2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNoYW5jZSBDaGFuY2Ugb3V0IG9mIDEwMCwgdG8gcGljayBgdHJ1ZWBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sKGNoYW5jZTogbnVtYmVyID0gNTApIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uaW50KDAsIDEwMCkgPCBjaGFuY2U7XHJcbiAgICB9XHJcbn1cclxuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBjbGFzcyBmb3IgYXVkaW8gZnVuY3Rpb25hbGl0eSAqL1xyXG5jbGFzcyBTb3VuZHNcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBEZWNvZGVzIHRoZSBnaXZlbiBhdWRpbyBmaWxlIGludG8gcmF3IGF1ZGlvIGRhdGEuIFRoaXMgaXMgYSB3cmFwcGVyIGZvciB0aGUgb2xkZXJcclxuICAgICAqIGNhbGxiYWNrLWJhc2VkIHN5bnRheCwgc2luY2UgaXQgaXMgdGhlIG9ubHkgb25lIGlPUyBjdXJyZW50bHkgc3VwcG9ydHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQXVkaW8gY29udGV4dCB0byB1c2UgZm9yIGRlY29kaW5nXHJcbiAgICAgKiBAcGFyYW0gYnVmZmVyIEJ1ZmZlciBvZiBlbmNvZGVkIGZpbGUgZGF0YSAoZS5nLiBtcDMpIHRvIGRlY29kZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFzeW5jIGRlY29kZShjb250ZXh0OiBBdWRpb0NvbnRleHQsIGJ1ZmZlcjogQXJyYXlCdWZmZXIpXHJcbiAgICAgICAgOiBQcm9taXNlPEF1ZGlvQnVmZmVyPlxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSA8QXVkaW9CdWZmZXI+ICggKHJlc29sdmUsIHJlamVjdCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiBjb250ZXh0LmRlY29kZUF1ZGlvRGF0YShidWZmZXIsIHJlc29sdmUsIHJlamVjdCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCBzdHJpbmdzICovXHJcbmNsYXNzIFN0cmluZ3Ncclxue1xyXG4gICAgLyoqIENoZWNrcyBpZiB0aGUgZ2l2ZW4gc3RyaW5nIGlzIG51bGwsIG9yIGVtcHR5ICh3aGl0ZXNwYWNlIG9ubHkgb3IgemVyby1sZW5ndGgpICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzTnVsbE9yRW1wdHkoc3RyOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gIXN0ciB8fCAhc3RyLnRyaW0oKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByZXR0eS1wcmludCdzIGEgZ2l2ZW4gbGlzdCBvZiBzdGF0aW9ucywgd2l0aCBjb250ZXh0IHNlbnNpdGl2ZSBleHRyYXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGVzIExpc3Qgb2Ygc3RhdGlvbiBjb2RlcyB0byBqb2luXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBMaXN0J3MgY29udGV4dC4gSWYgJ2NhbGxpbmcnLCBoYW5kbGVzIHNwZWNpYWwgY2FzZVxyXG4gICAgICogQHJldHVybnMgUHJldHR5LXByaW50ZWQgbGlzdCBvZiBnaXZlbiBzdGF0aW9uc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21TdGF0aW9uTGlzdChjb2Rlczogc3RyaW5nW10sIGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gJyc7XHJcbiAgICAgICAgbGV0IG5hbWVzICA9IGNvZGVzLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIG5hbWVzLmZvckVhY2goIChjLCBpKSA9PiBuYW1lc1tpXSA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGMpICk7XHJcblxyXG4gICAgICAgIGlmIChuYW1lcy5sZW5ndGggPT09IDEpXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IChjb250ZXh0ID09PSAnY2FsbGluZycpXHJcbiAgICAgICAgICAgICAgICA/IGAke25hbWVzWzBdfSBvbmx5YFxyXG4gICAgICAgICAgICAgICAgOiBuYW1lc1swXTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFzdFN0YXRpb24gPSBuYW1lcy5wb3AoKTtcclxuXHJcbiAgICAgICAgICAgIHJlc3VsdCAgPSBuYW1lcy5qb2luKCcsICcpO1xyXG4gICAgICAgICAgICByZXN1bHQgKz0gYCBhbmQgJHtsYXN0U3RhdGlvbn1gO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByZXR0eS1wcmludHMgdGhlIGdpdmVuIGRhdGUgb3IgaG91cnMgYW5kIG1pbnV0ZXMgaW50byBhIDI0LWhvdXIgdGltZSAoZS5nLiAwMTowOSkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGhvdXJzIEhvdXJzLCBmcm9tIDAgdG8gMjMsIG9yIERhdGUgb2JqZWN0XHJcbiAgICAgKiBAcGFyYW0gbWludXRlcyBNaW51dGVzLCBmcm9tIDAgdG8gNTlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tVGltZShob3VyczogbnVtYmVyIHwgRGF0ZSwgbWludXRlczogbnVtYmVyID0gMCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAoaG91cnMgaW5zdGFuY2VvZiBEYXRlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbWludXRlcyA9IGhvdXJzLmdldE1pbnV0ZXMoKTtcclxuICAgICAgICAgICAgaG91cnMgICA9IGhvdXJzLmdldEhvdXJzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gaG91cnMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpICsgJzonICtcclxuICAgICAgICAgICAgbWludXRlcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFucyB1cCB0aGUgZ2l2ZW4gdGV4dCBvZiBleGNlc3Mgd2hpdGVzcGFjZSBhbmQgYW55IG5ld2xpbmVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsZWFuKHRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGV4dC50cmltKClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXG5cXHJdL2dpLCAgICcnICApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHN7Mix9L2dpLCAgICcgJyApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMoWy4sXSkvZ2ksICckMScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdHJvbmdseSBjb21wcmVzc2VzIHRoZSBnaXZlbiBzdHJpbmcgdG8gb25lIG1vcmUgZmlsZW5hbWUgZnJpZW5kbHkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZmlsZW5hbWUodGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0ZXh0XHJcbiAgICAgICAgICAgIC50b0xvd2VyQ2FzZSgpXHJcbiAgICAgICAgICAgIC8vIFJlcGxhY2UgcGx1cmFsc1xyXG4gICAgICAgICAgICAucmVwbGFjZSgvaWVzXFxiL2csICd5JylcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGNvbW1vbiB3b3Jkc1xyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxiKGF8YW58YXR8YmV8b2Z8b258dGhlfHRvfGlufGlzfGhhc3xieXx3aXRoKVxcYi9nLCAnJylcclxuICAgICAgICAgICAgLnRyaW0oKVxyXG4gICAgICAgICAgICAvLyBDb252ZXJ0IHNwYWNlcyB0byB1bmRlcnNjb3Jlc1xyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxzKy9nLCAnXycpXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBhbGwgbm9uLWFscGhhbnVtZXJpY2Fsc1xyXG4gICAgICAgICAgICAucmVwbGFjZSgvW15hLXowLTlfXS9nLCAnJylcclxuICAgICAgICAgICAgLy8gTGltaXQgdG8gMTAwIGNoYXJzOyBtb3N0IHN5c3RlbXMgc3VwcG9ydCBtYXguIDI1NSBieXRlcyBpbiBmaWxlbmFtZXNcclxuICAgICAgICAgICAgLnN1YnN0cmluZygwLCAxMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBmaXJzdCBtYXRjaCBvZiBhIHBhdHRlcm4gaW4gYSBzdHJpbmcsIG9yIHVuZGVmaW5lZCBpZiBub3QgZm91bmQgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZmlyc3RNYXRjaCh0ZXh0OiBzdHJpbmcsIHBhdHRlcm46IFJlZ0V4cCwgaWR4OiBudW1iZXIpXHJcbiAgICAgICAgOiBzdHJpbmcgfCB1bmRlZmluZWRcclxuICAgIHtcclxuICAgICAgICBsZXQgbWF0Y2ggPSB0ZXh0Lm1hdGNoKHBhdHRlcm4pO1xyXG5cclxuICAgICAgICByZXR1cm4gKG1hdGNoICYmIG1hdGNoW2lkeF0pXHJcbiAgICAgICAgICAgID8gbWF0Y2hbaWR4XVxyXG4gICAgICAgICAgICA6IHVuZGVmaW5lZDtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFVuaW9uIHR5cGUgZm9yIGl0ZXJhYmxlIHR5cGVzIHdpdGggYSAubGVuZ3RoIHByb3BlcnR5ICovXHJcbnR5cGUgTGVuZ3RoYWJsZSA9IEFycmF5PGFueT4gfCBOb2RlTGlzdCB8IEhUTUxDb2xsZWN0aW9uIHwgc3RyaW5nO1xyXG5cclxuLyoqIFJlcHJlc2VudHMgYSBwbGF0Zm9ybSBhcyBhIGRpZ2l0IGFuZCBvcHRpb25hbCBsZXR0ZXIgdHVwbGUgKi9cclxudHlwZSBQbGF0Zm9ybSA9IFtzdHJpbmcsIHN0cmluZ107XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIGdlbmVyaWMga2V5LXZhbHVlIGRpY3Rpb25hcnksIHdpdGggc3RyaW5nIGtleXMgKi9cclxudHlwZSBEaWN0aW9uYXJ5PFQ+ID0geyBbaW5kZXg6IHN0cmluZ106IFQgfTtcclxuXHJcbi8qKiBEZWZpbmVzIHRoZSBkYXRhIHJlZmVyZW5jZXMgY29uZmlnIG9iamVjdCBwYXNzZWQgaW50byBSQUcubWFpbiBvbiBpbml0ICovXHJcbmludGVyZmFjZSBEYXRhUmVmc1xyXG57XHJcbiAgICAvKiogU2VsZWN0b3IgZm9yIGdldHRpbmcgdGhlIHBocmFzZSBzZXQgWE1MIElGcmFtZSBlbGVtZW50ICovXHJcbiAgICBwaHJhc2VzZXRFbWJlZCA6IHN0cmluZztcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgZXhjdXNlcyBmb3IgdHJhaW4gZGVsYXlzIG9yIGNhbmNlbGxhdGlvbnMgdG8gdXNlICovXHJcbiAgICBleGN1c2VzRGF0YSAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIFJhdyBhcnJheSBvZiBuYW1lcyBmb3Igc3BlY2lhbCB0cmFpbnMgdG8gdXNlICovXHJcbiAgICBuYW1lZERhdGEgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIFJhdyBhcnJheSBvZiBuYW1lcyBmb3Igc2VydmljZXMvbmV0d29ya3MgdG8gdXNlICovXHJcbiAgICBzZXJ2aWNlc0RhdGEgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIFJhdyBkaWN0aW9uYXJ5IG9mIHN0YXRpb24gY29kZXMgYW5kIG5hbWVzIHRvIHVzZSAqL1xyXG4gICAgc3RhdGlvbnNEYXRhICAgOiBEaWN0aW9uYXJ5PHN0cmluZz47XHJcbn1cclxuXHJcbi8qKiBGaWxsIGlucyBmb3IgdmFyaW91cyBtaXNzaW5nIGRlZmluaXRpb25zIG9mIG1vZGVybiBKYXZhc2NyaXB0IGZlYXR1cmVzICovXHJcblxyXG5pbnRlcmZhY2UgV2luZG93XHJcbntcclxuICAgIG9udW5oYW5kbGVkcmVqZWN0aW9uOiBFcnJvckV2ZW50SGFuZGxlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFN0cmluZ1xyXG57XHJcbiAgICBwYWRTdGFydCh0YXJnZXRMZW5ndGg6IG51bWJlciwgcGFkU3RyaW5nPzogc3RyaW5nKSA6IHN0cmluZztcclxuICAgIHBhZEVuZCh0YXJnZXRMZW5ndGg6IG51bWJlciwgcGFkU3RyaW5nPzogc3RyaW5nKSA6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEFycmF5PFQ+XHJcbntcclxuICAgIGluY2x1ZGVzKHNlYXJjaEVsZW1lbnQ6IFQsIGZyb21JbmRleD86IG51bWJlcikgOiBib29sZWFuO1xyXG59XHJcblxyXG5kZWNsYXJlIGNsYXNzIE1lZGlhUmVjb3JkZXJcclxue1xyXG4gICAgY29uc3RydWN0b3Ioc3RyZWFtOiBNZWRpYVN0cmVhbSwgb3B0aW9ucz86IE1lZGlhUmVjb3JkZXJPcHRpb25zKTtcclxuICAgIHN0YXJ0KHRpbWVzbGljZT86IG51bWJlcikgOiB2b2lkO1xyXG4gICAgc3RvcCgpIDogdm9pZDtcclxuICAgIG9uZGF0YWF2YWlsYWJsZSA6ICgodGhpczogTWVkaWFSZWNvcmRlciwgZXY6IEJsb2JFdmVudCkgPT4gYW55KSB8IG51bGw7XHJcbiAgICBvbnN0b3AgOiAoKHRoaXM6IE1lZGlhUmVjb3JkZXIsIGV2OiBFdmVudCkgPT4gYW55KSB8IG51bGw7XHJcbn1cclxuXHJcbmludGVyZmFjZSBNZWRpYVJlY29yZGVyT3B0aW9uc1xyXG57XHJcbiAgICBtaW1lVHlwZT8gOiBzdHJpbmc7XHJcbiAgICBhdWRpb0JpdHNQZXJTZWNvbmQ/IDogbnVtYmVyO1xyXG4gICAgdmlkZW9CaXRzUGVyU2Vjb25kPyA6IG51bWJlcjtcclxuICAgIGJpdHNQZXJTZWNvbmQ/IDogbnVtYmVyO1xyXG59XHJcblxyXG5kZWNsYXJlIGNsYXNzIEJsb2JFdmVudCBleHRlbmRzIEV2ZW50XHJcbntcclxuICAgIHJlYWRvbmx5IGRhdGEgICAgIDogQmxvYjtcclxuICAgIHJlYWRvbmx5IHRpbWVjb2RlIDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXVkaW9Db250ZXh0QmFzZVxyXG57XHJcbiAgICBhdWRpb1dvcmtsZXQgOiBBdWRpb1dvcmtsZXQ7XHJcbn1cclxuXHJcbnR5cGUgU2FtcGxlQ2hhbm5lbHMgPSBGbG9hdDMyQXJyYXlbXVtdO1xyXG5cclxuZGVjbGFyZSBjbGFzcyBBdWRpb1dvcmtsZXRQcm9jZXNzb3Jcclxue1xyXG4gICAgc3RhdGljIHBhcmFtZXRlckRlc2NyaXB0b3JzIDogQXVkaW9QYXJhbURlc2NyaXB0b3JbXTtcclxuXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3Iob3B0aW9ucz86IEF1ZGlvV29ya2xldE5vZGVPcHRpb25zKTtcclxuICAgIHJlYWRvbmx5IHBvcnQ/OiBNZXNzYWdlUG9ydDtcclxuXHJcbiAgICBwcm9jZXNzKFxyXG4gICAgICAgIGlucHV0czogU2FtcGxlQ2hhbm5lbHMsXHJcbiAgICAgICAgb3V0cHV0czogU2FtcGxlQ2hhbm5lbHMsXHJcbiAgICAgICAgcGFyYW1ldGVyczogRGljdGlvbmFyeTxGbG9hdDMyQXJyYXk+XHJcbiAgICApIDogYm9vbGVhbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEF1ZGlvV29ya2xldE5vZGVPcHRpb25zIGV4dGVuZHMgQXVkaW9Ob2RlT3B0aW9uc1xyXG57XHJcbiAgICBudW1iZXJPZklucHV0cz8gOiBudW1iZXI7XHJcbiAgICBudW1iZXJPZk91dHB1dHM/IDogbnVtYmVyO1xyXG4gICAgb3V0cHV0Q2hhbm5lbENvdW50PyA6IG51bWJlcltdO1xyXG4gICAgcGFyYW1ldGVyRGF0YT8gOiB7W2luZGV4OiBzdHJpbmddIDogbnVtYmVyfTtcclxuICAgIHByb2Nlc3Nvck9wdGlvbnM/IDogYW55O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTWVkaWFUcmFja0NvbnN0cmFpbnRTZXRcclxue1xyXG4gICAgYXV0b0dhaW5Db250cm9sPzogYm9vbGVhbiB8IENvbnN0cmFpbkJvb2xlYW5QYXJhbWV0ZXJzO1xyXG4gICAgbm9pc2VTdXBwcmVzc2lvbj86IGJvb2xlYW4gfCBDb25zdHJhaW5Cb29sZWFuUGFyYW1ldGVycztcclxufVxyXG5cclxuZGVjbGFyZSBmdW5jdGlvbiByZWdpc3RlclByb2Nlc3NvcihuYW1lOiBzdHJpbmcsIGN0b3I6IEF1ZGlvV29ya2xldFByb2Nlc3NvcikgOiB2b2lkOyIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEhvbGRzIHJ1bnRpbWUgY29uZmlndXJhdGlvbiAqL1xyXG5jbGFzcyBDb25maWdcclxue1xyXG4gICAgLyoqIFZvbHVtZSBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljICBzcGVlY2hWb2wgICAgICA6IG51bWJlciA9IDEuMDtcclxuICAgIC8qKiBQaXRjaCBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljICBzcGVlY2hQaXRjaCAgICA6IG51bWJlciA9IDEuMDtcclxuICAgIC8qKiBSYXRlIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgIHNwZWVjaFJhdGUgICAgIDogbnVtYmVyID0gMS4wO1xyXG4gICAgLyoqIENob2ljZSBvZiBzcGVlY2ggdm9pY2UgdG8gdXNlLCBhcyBnZXRWb2ljZXMgaW5kZXggb3IgLTEgaWYgdW5zZXQgKi9cclxuICAgIHByaXZhdGUgX3NwZWVjaFZvaWNlICAgOiBudW1iZXIgPSAtMTtcclxuICAgIC8qKiBJZiB1c2VyIGhhcyBjbGlja2VkIHNodWZmbGUgYXQgbGVhc3Qgb25jZSAqL1xyXG4gICAgcHVibGljIGNsaWNrZWRHZW5lcmF0ZSA6IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENob2ljZSBvZiBzcGVlY2ggdm9pY2UgdG8gdXNlLCBhcyBnZXRWb2ljZXMgaW5kZXguIEJlY2F1c2Ugb2YgdGhlIGFzeW5jIG5hdHVyZSBvZlxyXG4gICAgICogZ2V0Vm9pY2VzLCB0aGUgZGVmYXVsdCB2YWx1ZSB3aWxsIGJlIGZldGNoZWQgZnJvbSBpdCBlYWNoIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIGdldCBzcGVlY2hWb2ljZSgpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVE9ETzogdGhpcyBpcyBwcm9iYWJseSBiZXR0ZXIgb2ZmIHVzaW5nIHZvaWNlIG5hbWVzXHJcbiAgICAgICAgLy8gSWYgdGhlcmUncyBhIHVzZXItZGVmaW5lZCB2YWx1ZSwgdXNlIHRoYXRcclxuICAgICAgICBpZiAgKHRoaXMuX3NwZWVjaFZvaWNlICE9PSAtMSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NwZWVjaFZvaWNlO1xyXG5cclxuICAgICAgICAvLyBTZWxlY3QgRW5nbGlzaCB2b2ljZXMgYnkgZGVmYXVsdFxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwLCB2ID0gUkFHLnNwZWVjaC5nZXRWb2ljZXMoKTsgaSA8IHYubGVuZ3RoIDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGxhbmcgPSB2W2ldLmxhbmc7XHJcblxyXG4gICAgICAgICAgICBpZiAobGFuZyA9PT0gJ2VuLUdCJyB8fCBsYW5nID09PSAnZW4tVVMnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBFbHNlLCBmaXJzdCB2b2ljZSBvbiB0aGUgbGlzdFxyXG4gICAgICAgIHJldHVybiAwO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjaG9pY2Ugb2Ygc3BlZWNoIHRvIHVzZSwgYXMgZ2V0Vm9pY2VzIGluZGV4ICovXHJcbiAgICBzZXQgc3BlZWNoVm9pY2UodmFsdWU6IG51bWJlcilcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zcGVlY2hWb2ljZSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgbG9hZHMgcnVudGltZSBjb25maWd1cmF0aW9uIGZyb20gbG9jYWxTdG9yYWdlLCBpZiBhbnkgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcihsb2FkOiBib29sZWFuKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBzZXR0aW5ncyA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnc2V0dGluZ3MnKTtcclxuXHJcbiAgICAgICAgaWYgKCFsb2FkIHx8ICFzZXR0aW5ncylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjb25maWcgPSBKU09OLnBhcnNlKHNldHRpbmdzKTtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCBjb25maWcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGFsZXJ0KCBMLkNPTkZJR19MT0FEX0ZBSUwoZS5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogU2FmZWx5IHNhdmVzIHJ1bnRpbWUgY29uZmlndXJhdGlvbiB0byBsb2NhbFN0b3JhZ2UgKi9cclxuICAgIHB1YmxpYyBzYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oICdzZXR0aW5ncycsIEpTT04uc3RyaW5naWZ5KHRoaXMpICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX1NBVkVfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgZGVsZXRlcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gZnJvbSBsb2NhbFN0b3JhZ2UgYW5kIHJlc2V0cyBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKCB0aGlzLCBuZXcgQ29uZmlnKGZhbHNlKSApO1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ3NldHRpbmdzJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX1JFU0VUX0ZBSUwoZS5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgZGF0YSBmb3IgZXhjdXNlcywgdHJhaW5zLCBzZXJ2aWNlcyBhbmQgc3RhdGlvbnMgKi9cclxuY2xhc3MgRGF0YWJhc2Vcclxue1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiBleGN1c2VzICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGV4Y3VzZXMgICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGF0YXNldCBvZiBuYW1lZCB0cmFpbnMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbmFtZWQgICAgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIHNlcnZpY2Ugb3IgbmV0d29yayBuYW1lcyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzZXJ2aWNlcyAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBuYW1lcywgd2l0aCB0aHJlZS1sZXR0ZXIgY29kZSBrZXlzIChlLmcuIEFCQykgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc3RhdGlvbnMgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPjtcclxuICAgIC8qKiBMb2FkZWQgWE1MIGRvY3VtZW50IGNvbnRhaW5pbmcgcGhyYXNlc2V0IGRhdGEgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgcGhyYXNlc2V0cyAgICA6IERvY3VtZW50O1xyXG4gICAgLyoqIEFtb3VudCBvZiBzdGF0aW9ucyBpbiB0aGUgY3VycmVudGx5IGxvYWRlZCBkYXRhc2V0ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHN0YXRpb25zQ291bnQgOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGRhdGFSZWZzOiBEYXRhUmVmcylcclxuICAgIHtcclxuICAgICAgICBsZXQgcXVlcnkgID0gZGF0YVJlZnMucGhyYXNlc2V0RW1iZWQ7XHJcbiAgICAgICAgbGV0IGlmcmFtZSA9IERPTS5yZXF1aXJlIDxIVE1MSUZyYW1lRWxlbWVudD4gKHF1ZXJ5KTtcclxuXHJcbiAgICAgICAgaWYgKCFpZnJhbWUuY29udGVudERvY3VtZW50KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5EQl9FTEVNRU5UX05PVF9QSFJBU0VTRVRfSUZSQU1FKHF1ZXJ5KSApO1xyXG5cclxuICAgICAgICB0aGlzLnBocmFzZXNldHMgICAgPSBpZnJhbWUuY29udGVudERvY3VtZW50O1xyXG4gICAgICAgIHRoaXMuZXhjdXNlcyAgICAgICA9IGRhdGFSZWZzLmV4Y3VzZXNEYXRhO1xyXG4gICAgICAgIHRoaXMubmFtZWQgICAgICAgICA9IGRhdGFSZWZzLm5hbWVkRGF0YTtcclxuICAgICAgICB0aGlzLnNlcnZpY2VzICAgICAgPSBkYXRhUmVmcy5zZXJ2aWNlc0RhdGE7XHJcbiAgICAgICAgdGhpcy5zdGF0aW9ucyAgICAgID0gZGF0YVJlZnMuc3RhdGlvbnNEYXRhO1xyXG4gICAgICAgIHRoaXMuc3RhdGlvbnNDb3VudCA9IE9iamVjdC5rZXlzKHRoaXMuc3RhdGlvbnMpLmxlbmd0aDtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tEYXRhYmFzZV0gRW50cmllcyBsb2FkZWQ6Jyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdEV4Y3VzZXM6JywgICAgICB0aGlzLmV4Y3VzZXMubGVuZ3RoKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0TmFtZWQgdHJhaW5zOicsIHRoaXMubmFtZWQubGVuZ3RoKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0U2VydmljZXM6JywgICAgIHRoaXMuc2VydmljZXMubGVuZ3RoKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0U3RhdGlvbnM6JywgICAgIHRoaXMuc3RhdGlvbnNDb3VudCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGV4Y3VzZSBmb3IgYSBkZWxheSBvciBjYW5jZWxsYXRpb24gKi9cclxuICAgIHB1YmxpYyBwaWNrRXhjdXNlKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmFycmF5KHRoaXMuZXhjdXNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgcGlja05hbWVkKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmFycmF5KHRoaXMubmFtZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xvbmVzIGFuZCBnZXRzIHBocmFzZSB3aXRoIHRoZSBnaXZlbiBJRCwgb3IgbnVsbCBpZiBpdCBkb2Vzbid0IGV4aXN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZCBJRCBvZiB0aGUgcGhyYXNlIHRvIGdldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlKGlkOiBzdHJpbmcpIDogSFRNTEVsZW1lbnQgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IHRoaXMucGhyYXNlc2V0cy5xdWVyeVNlbGVjdG9yKCdwaHJhc2UjJyArIGlkKSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKHJlc3VsdClcclxuICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0LmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSBwaHJhc2VzZXQgd2l0aCB0aGUgZ2l2ZW4gSUQsIG9yIG51bGwgaWYgaXQgZG9lc24ndCBleGlzdC4gTm90ZSB0aGF0IHRoZVxyXG4gICAgICogcmV0dXJuZWQgcGhyYXNlc2V0IGNvbWVzIGZyb20gdGhlIFhNTCBkb2N1bWVudCwgc28gaXQgc2hvdWxkIG5vdCBiZSBtdXRhdGVkLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZCBJRCBvZiB0aGUgcGhyYXNlc2V0IHRvIGdldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlc2V0KGlkOiBzdHJpbmcpIDogSFRNTEVsZW1lbnQgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucGhyYXNlc2V0cy5xdWVyeVNlbGVjdG9yKCdwaHJhc2VzZXQjJyArIGlkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gcmFpbCBuZXR3b3JrIG5hbWUgKi9cclxuICAgIHB1YmxpYyBwaWNrU2VydmljZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLnNlcnZpY2VzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIGEgcmFuZG9tIHN0YXRpb24gY29kZSBmcm9tIHRoZSBkYXRhc2V0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBleGNsdWRlIExpc3Qgb2YgY29kZXMgdG8gZXhjbHVkZS4gTWF5IGJlIGlnbm9yZWQgaWYgc2VhcmNoIHRha2VzIHRvbyBsb25nLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcGlja1N0YXRpb25Db2RlKGV4Y2x1ZGU/OiBzdHJpbmdbXSkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICAvLyBHaXZlIHVwIGZpbmRpbmcgcmFuZG9tIHN0YXRpb24gdGhhdCdzIG5vdCBpbiB0aGUgZ2l2ZW4gbGlzdCwgaWYgd2UgdHJ5IG1vcmVcclxuICAgICAgICAvLyB0aW1lcyB0aGVuIHRoZXJlIGFyZSBzdGF0aW9ucy4gSW5hY2N1cmF0ZSwgYnV0IGF2b2lkcyBpbmZpbml0ZSBsb29wcy5cclxuICAgICAgICBpZiAoZXhjbHVkZSkgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnN0YXRpb25zQ291bnQ7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IFJhbmRvbS5vYmplY3RLZXkodGhpcy5zdGF0aW9ucyk7XHJcblxyXG4gICAgICAgICAgICBpZiAoICFleGNsdWRlLmluY2x1ZGVzKHZhbHVlKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gUmFuZG9tLm9iamVjdEtleSh0aGlzLnN0YXRpb25zKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHN0YXRpb24gbmFtZSBmcm9tIHRoZSBnaXZlbiB0aHJlZSBsZXR0ZXIgY29kZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGdldCB0aGUgbmFtZSBvZlxyXG4gICAgICogQHBhcmFtIGZpbHRlcmVkIFdoZXRoZXIgdG8gZmlsdGVyIG91dCBwYXJlbnRoZXNpemVkIGxvY2F0aW9uIGNvbnRleHRcclxuICAgICAqIEByZXR1cm5zIFN0YXRpb24gbmFtZSBmb3IgdGhlIGdpdmVuIGNvZGUsIGZpbHRlcmVkIGlmIHNwZWNpZmllZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbihjb2RlOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSB0aGlzLnN0YXRpb25zW2NvZGVdO1xyXG5cclxuICAgICAgICBpZiAgICAgICghc3RhdGlvbilcclxuICAgICAgICAgICAgcmV0dXJuIEwuREJfVU5LTk9XTl9TVEFUSU9OKGNvZGUpO1xyXG4gICAgICAgIGVsc2UgaWYgKCBTdHJpbmdzLmlzTnVsbE9yRW1wdHkoc3RhdGlvbikgKVxyXG4gICAgICAgICAgICByZXR1cm4gTC5EQl9FTVBUWV9TVEFUSU9OKGNvZGUpO1xyXG5cclxuICAgICAgICByZXR1cm4gc3RhdGlvbjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIGEgcmFuZG9tIHJhbmdlIG9mIHN0YXRpb24gY29kZXMsIGVuc3VyaW5nIHRoZXJlIGFyZSBubyBkdXBsaWNhdGVzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBtaW4gTWluaW11bSBhbW91bnQgb2Ygc3RhdGlvbnMgdG8gcGlja1xyXG4gICAgICogQHBhcmFtIG1heCBNYXhpbXVtIGFtb3VudCBvZiBzdGF0aW9ucyB0byBwaWNrXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZVxyXG4gICAgICogQHJldHVybnMgQSBsaXN0IG9mIHVuaXF1ZSBzdGF0aW9uIG5hbWVzXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBwaWNrU3RhdGlvbkNvZGVzKG1pbiA9IDEsIG1heCA9IDE2LCBleGNsdWRlPyA6IHN0cmluZ1tdKSA6IHN0cmluZ1tdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKG1heCAtIG1pbiA+IE9iamVjdC5rZXlzKHRoaXMuc3RhdGlvbnMpLmxlbmd0aClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuREJfVE9PX01BTllfU1RBVElPTlMoKSApO1xyXG5cclxuICAgICAgICBsZXQgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgICAgICBsZXQgbGVuZ3RoID0gUmFuZG9tLmludChtaW4sIG1heCk7XHJcbiAgICAgICAgbGV0IHRyaWVzICA9IDA7XHJcblxyXG4gICAgICAgIHdoaWxlIChyZXN1bHQubGVuZ3RoIDwgbGVuZ3RoKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGtleSA9IFJhbmRvbS5vYmplY3RLZXkodGhpcy5zdGF0aW9ucyk7XHJcblxyXG4gICAgICAgICAgICAvLyBHaXZlIHVwIHRyeWluZyB0byBhdm9pZCBkdXBsaWNhdGVzLCBpZiB3ZSB0cnkgbW9yZSB0aW1lcyB0aGFuIHRoZXJlIGFyZVxyXG4gICAgICAgICAgICAvLyBzdGF0aW9ucyBhdmFpbGFibGUuIEluYWNjdXJhdGUsIGJ1dCBnb29kIGVub3VnaC5cclxuICAgICAgICAgICAgaWYgKHRyaWVzKysgPj0gdGhpcy5zdGF0aW9uc0NvdW50KVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIGdpdmVuIGFuIGV4Y2x1c2lvbiBsaXN0LCBjaGVjayBhZ2FpbnN0IGJvdGggdGhhdCBhbmQgcmVzdWx0c1xyXG4gICAgICAgICAgICBlbHNlIGlmICggZXhjbHVkZSAmJiAhZXhjbHVkZS5pbmNsdWRlcyhrZXkpICYmICFyZXN1bHQuaW5jbHVkZXMoa2V5KSApXHJcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgbm90LCBqdXN0IGNoZWNrIHdoYXQgcmVzdWx0cyB3ZSd2ZSBhbHJlYWR5IGZvdW5kXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKCAhZXhjbHVkZSAmJiAhcmVzdWx0LmluY2x1ZGVzKGtleSkgKVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYWluIGNsYXNzIG9mIHRoZSBlbnRpcmUgUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvciBhcHBsaWNhdGlvbiAqL1xyXG5jbGFzcyBSQUdcclxue1xyXG4gICAgLyoqIEdldHMgdGhlIGNvbmZpZ3VyYXRpb24gaG9sZGVyICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNvbmZpZyAgIDogQ29uZmlnO1xyXG4gICAgLyoqIEdldHMgdGhlIGRhdGFiYXNlIG1hbmFnZXIsIHdoaWNoIGhvbGRzIHBocmFzZSwgc3RhdGlvbiBhbmQgdHJhaW4gZGF0YSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBkYXRhYmFzZSA6IERhdGFiYXNlO1xyXG4gICAgLyoqIEdldHMgdGhlIHBocmFzZSBtYW5hZ2VyLCB3aGljaCBnZW5lcmF0ZXMgSFRNTCBwaHJhc2VzIGZyb20gWE1MICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBocmFzZXIgIDogUGhyYXNlcjtcclxuICAgIC8qKiBHZXRzIHRoZSBzcGVlY2ggZW5naW5lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNwZWVjaCAgIDogU3BlZWNoO1xyXG4gICAgLyoqIEdldHMgdGhlIGN1cnJlbnQgdHJhaW4gYW5kIHN0YXRpb24gc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RhdGUgICAgOiBTdGF0ZTtcclxuICAgIC8qKiBHZXRzIHRoZSB2aWV3IGNvbnRyb2xsZXIsIHdoaWNoIG1hbmFnZXMgVUkgaW50ZXJhY3Rpb24gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdmlld3MgICAgOiBWaWV3cztcclxuXHJcbiAgICAvKipcclxuICAgICAqIEVudHJ5IHBvaW50IGZvciBSQUcsIHRvIGJlIGNhbGxlZCBmcm9tIEphdmFzY3JpcHQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGRhdGFSZWZzIENvbmZpZ3VyYXRpb24gb2JqZWN0LCB3aXRoIHJhaWwgZGF0YSB0byB1c2VcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBtYWluKGRhdGFSZWZzOiBEYXRhUmVmcykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93Lm9uZXJyb3IgICAgICAgICAgICAgID0gZXJyb3IgPT4gUkFHLnBhbmljKGVycm9yKTtcclxuICAgICAgICB3aW5kb3cub251bmhhbmRsZWRyZWplY3Rpb24gPSBlcnJvciA9PiBSQUcucGFuaWMoZXJyb3IpO1xyXG5cclxuICAgICAgICBJMThuLmluaXQoKTtcclxuXHJcbiAgICAgICAgUkFHLmNvbmZpZyAgID0gbmV3IENvbmZpZyh0cnVlKTtcclxuICAgICAgICBSQUcuZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2UoZGF0YVJlZnMpO1xyXG4gICAgICAgIFJBRy52aWV3cyAgICA9IG5ldyBWaWV3cygpO1xyXG4gICAgICAgIFJBRy5waHJhc2VyICA9IG5ldyBQaHJhc2VyKCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaCAgID0gbmV3IFNwZWVjaCgpO1xyXG5cclxuICAgICAgICAvLyBCZWdpblxyXG5cclxuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuV0VMQ09NRSgpICk7XHJcbiAgICAgICAgUkFHLmdlbmVyYXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdlbmVyYXRlcyBhIG5ldyByYW5kb20gcGhyYXNlIGFuZCBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZW5lcmF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZSA9IG5ldyBTdGF0ZSgpO1xyXG4gICAgICAgIFJBRy5zdGF0ZS5nZW5EZWZhdWx0U3RhdGUoKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmdlbmVyYXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIExvYWRzIHN0YXRlIGZyb20gZ2l2ZW4gSlNPTiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBsb2FkKGpzb246IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlID0gT2JqZWN0LmFzc2lnbiggbmV3IFN0YXRlKCksIEpTT04ucGFyc2UoanNvbikgKSBhcyBTdGF0ZTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmdlbmVyYXRlKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX0ZST01fU1RPUkFHRSgpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdsb2JhbCBlcnJvciBoYW5kbGVyOyB0aHJvd3MgdXAgYSBiaWcgcmVkIHBhbmljIHNjcmVlbiBvbiB1bmNhdWdodCBlcnJvciAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcGFuaWMoZXJyb3I6IHN0cmluZyB8IEV2ZW50ID0gXCJVbmtub3duIGVycm9yXCIpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG1zZyA9ICc8ZGl2IGlkPVwicGFuaWNTY3JlZW5cIiBjbGFzcz1cIndhcm5pbmdTY3JlZW5cIj4nO1xyXG4gICAgICAgIG1zZyAgICArPSAnPGgxPlwiV2UgYXJlIHNvcnJ5IHRvIGFubm91bmNlIHRoYXQuLi5cIjwvaDE+JztcclxuICAgICAgICBtc2cgICAgKz0gYDxwPlJBRyBoYXMgY3Jhc2hlZCBiZWNhdXNlOiA8Y29kZT4ke2Vycm9yfTwvY29kZT4uPC9wPmA7XHJcbiAgICAgICAgbXNnICAgICs9IGA8cD5QbGVhc2Ugb3BlbiB0aGUgY29uc29sZSBmb3IgbW9yZSBpbmZvcm1hdGlvbi48L3A+YDtcclxuICAgICAgICBtc2cgICAgKz0gJzwvZGl2Pic7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuaW5uZXJIVE1MID0gbXNnO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogRGlzcG9zYWJsZSBjbGFzcyB0aGF0IGhvbGRzIHN0YXRlIGZvciB0aGUgY3VycmVudCBzY2hlZHVsZSwgdHJhaW4sIGV0Yy4gKi9cclxuY2xhc3MgU3RhdGVcclxue1xyXG4gICAgLyoqIFN0YXRlIG9mIGNvbGxhcHNpYmxlIGVsZW1lbnRzLiBLZXkgaXMgcmVmZXJlbmNlIElELCB2YWx1ZSBpcyBjb2xsYXBzZWQuICovXHJcbiAgICBwcml2YXRlIF9jb2xsYXBzaWJsZXMgOiBEaWN0aW9uYXJ5PGJvb2xlYW4+ICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgY29hY2ggbGV0dGVyIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBsZXR0ZXIuICovXHJcbiAgICBwcml2YXRlIF9jb2FjaGVzICAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgaW50ZWdlciBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgaW50ZWdlci4gKi9cclxuICAgIHByaXZhdGUgX2ludGVnZXJzICAgICA6IERpY3Rpb25hcnk8bnVtYmVyPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBwaHJhc2VzZXQgcGhyYXNlIGNob2ljZXMuIEtleSBpcyByZWZlcmVuY2UgSUQsIHZhbHVlIGlzIGluZGV4LiAqL1xyXG4gICAgcHJpdmF0ZSBfcGhyYXNlc2V0cyAgIDogRGljdGlvbmFyeTxudW1iZXI+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHNlcnZpY2UgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIHNlcnZpY2UuICovXHJcbiAgICBwcml2YXRlIF9zZXJ2aWNlcyAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc3RhdGlvbiBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgc3RhdGlvbiBjb2RlLiAqL1xyXG4gICAgcHJpdmF0ZSBfc3RhdGlvbnMgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHN0YXRpb24gbGlzdCBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgYXJyYXkgb2YgY29kZXMuICovXHJcbiAgICBwcml2YXRlIF9zdGF0aW9uTGlzdHMgOiBEaWN0aW9uYXJ5PHN0cmluZ1tdPiA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgdGltZSBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgdGltZS4gKi9cclxuICAgIHByaXZhdGUgX3RpbWVzICAgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcblxyXG4gICAgLyoqIEN1cnJlbnRseSBjaG9zZW4gZXhjdXNlICovXHJcbiAgICBwcml2YXRlIF9leGN1c2U/ICAgOiBzdHJpbmc7XHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBwbGF0Zm9ybSAqL1xyXG4gICAgcHJpdmF0ZSBfcGxhdGZvcm0/IDogUGxhdGZvcm07XHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHJpdmF0ZSBfbmFtZWQ/ICAgIDogc3RyaW5nO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBjb2FjaCBsZXR0ZXIsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSBmcm9tIEEgdG8gWi5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIGxldHRlciBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldENvYWNoKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fY29hY2hlc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29hY2hlc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29hY2hlc1tjb250ZXh0XSA9IFJhbmRvbS5hcnJheShMLkxFVFRFUlMpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9jb2FjaGVzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGNvYWNoIGxldHRlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgbGV0dGVyIGZvclxyXG4gICAgICogQHBhcmFtIGNvYWNoIFZhbHVlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0Q29hY2goY29udGV4dDogc3RyaW5nLCBjb2FjaDogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9jb2FjaGVzW2NvbnRleHRdID0gY29hY2g7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gZ2V0IHRoZSBjb2xsYXBzaWJsZSBzdGF0ZSBvZlxyXG4gICAgICogQHBhcmFtIGNoYW5jZSBDaGFuY2UgYmV0d2VlbiAwIGFuZCAxMDAgb2YgY2hvb3NpbmcgdHJ1ZSwgaWYgdW5zZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldENvbGxhcHNlZChyZWY6IHN0cmluZywgY2hhbmNlOiBudW1iZXIpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29sbGFwc2libGVzW3JlZl07XHJcblxyXG4gICAgICAgIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdID0gIVJhbmRvbS5ib29sKGNoYW5jZSk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGNvbGxhcHNpYmxlJ3Mgc3RhdGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gc2V0IHRoZSBjb2xsYXBzaWJsZSBzdGF0ZSBvZlxyXG4gICAgICogQHBhcmFtIHN0YXRlIFZhbHVlIHRvIHNldCwgd2hlcmUgdHJ1ZSBpcyBcImNvbGxhcHNlZFwiXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRDb2xsYXBzZWQocmVmOiBzdHJpbmcsIHN0YXRlOiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXSA9IHN0YXRlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBpbnRlZ2VyLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBpbnRlZ2VyIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0SW50ZWdlcihjb250ZXh0OiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2ludGVnZXJzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgbGV0IG1pbiA9IDAsIG1heCA9IDA7XHJcblxyXG4gICAgICAgIHN3aXRjaChjb250ZXh0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2FzZSBcImNvYWNoZXNcIjogICAgICAgbWluID0gMTsgbWF4ID0gMTA7IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZGVsYXllZFwiOiAgICAgICBtaW4gPSA1OyBtYXggPSA2MDsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJmcm9udF9jb2FjaGVzXCI6IG1pbiA9IDI7IG1heCA9IDU7ICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInJlYXJfY29hY2hlc1wiOiAgbWluID0gMjsgbWF4ID0gNTsgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5faW50ZWdlcnNbY29udGV4dF0gPSBSYW5kb20uaW50KG1pbiwgbWF4KTtcclxuICAgICAgICByZXR1cm4gdGhpcy5faW50ZWdlcnNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGFuIGludGVnZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIGludGVnZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRJbnRlZ2VyKGNvbnRleHQ6IHN0cmluZywgdmFsdWU6IG51bWJlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5faW50ZWdlcnNbY29udGV4dF0gPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gcGhyYXNlIG9mIGEgcGhyYXNlc2V0LCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgcGhyYXNlc2V0J3MgcGhyYXNlIG9mXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2VzZXRJZHgocmVmOiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3BocmFzZXNldHNbcmVmXSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGhyYXNlc2V0c1tyZWZdO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBpcyB0aGlzIHNhZmUgYWNyb3NzIHBocmFzZXNldCBjaGFuZ2VzP1xyXG4gICAgICAgIGlmICghcGhyYXNlc2V0KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5TVEFURV9OT05FWElTVEFOVF9QSFJBU0VTRVQocmVmKSApO1xyXG5cclxuICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBSYW5kb20uaW50KDAsIHBocmFzZXNldC5jaGlsZHJlbi5sZW5ndGgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9waHJhc2VzZXRzW3JlZl07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSBjaG9zZW4gaW5kZXggZm9yIGEgcGhyYXNlc2V0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSByZWYgUmVmZXJlbmNlIElEIHRvIHNldCB0aGUgcGhyYXNlc2V0IGluZGV4IG9mXHJcbiAgICAgKiBAcGFyYW0gaWR4IEluZGV4IHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0UGhyYXNlc2V0SWR4KHJlZjogc3RyaW5nLCBpZHg6IG51bWJlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fcGhyYXNlc2V0c1tyZWZdID0gaWR4O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBzZXJ2aWNlLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBzZXJ2aWNlIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U2VydmljZShjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fc2VydmljZXNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1NlcnZpY2UoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fc2VydmljZXNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgc2VydmljZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgc2VydmljZSBmb3JcclxuICAgICAqIEBwYXJhbSBzZXJ2aWNlIFZhbHVlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0U2VydmljZShjb250ZXh0OiBzdHJpbmcsIHNlcnZpY2U6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc2VydmljZXNbY29udGV4dF0gPSBzZXJ2aWNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBzdGF0aW9uIGNvZGUsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHN0YXRpb24gZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc3RhdGlvbnNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbnNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgc3RhdGlvbiBjb2RlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBzdGF0aW9uIGNvZGUgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29kZSBTdGF0aW9uIGNvZGUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTdGF0aW9uKGNvbnRleHQ6IHN0cmluZywgY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XSA9IGNvZGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGxpc3Qgb2Ygc3RhdGlvbiBjb2Rlcywgb3IgcmFuZG9tbHkgZ2VuZXJhdGVzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHN0YXRpb24gbGlzdCBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb25MaXN0KGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XTtcclxuICAgICAgICBlbHNlIGlmIChjb250ZXh0ID09PSAnY2FsbGluZ19maXJzdCcpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldFN0YXRpb25MaXN0KCdjYWxsaW5nJyk7XHJcblxyXG4gICAgICAgIGxldCBtaW4gPSAxLCBtYXggPSAxNjtcclxuXHJcbiAgICAgICAgc3dpdGNoKGNvbnRleHQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlICdjYWxsaW5nX3NwbGl0JzogbWluID0gMjsgbWF4ID0gMTY7IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdjaGFuZ2VzJzogICAgICAgbWluID0gMTsgbWF4ID0gNDsgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdub3Rfc3RvcHBpbmcnOiAgbWluID0gMTsgbWF4ID0gODsgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMobWluLCBtYXgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgbGlzdCBvZiBzdGF0aW9uIGNvZGVzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBzdGF0aW9uIGNvZGUgbGlzdCBmb3JcclxuICAgICAqIEBwYXJhbSBjb2RlcyBTdGF0aW9uIGNvZGVzIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0U3RhdGlvbkxpc3QoY29udGV4dDogc3RyaW5nLCBjb2Rlczogc3RyaW5nW10pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSA9IGNvZGVzO1xyXG5cclxuICAgICAgICBpZiAoY29udGV4dCA9PT0gJ2NhbGxpbmdfZmlyc3QnKVxyXG4gICAgICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbJ2NhbGxpbmcnXSA9IGNvZGVzO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiB0aW1lXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSB0aW1lIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0VGltZShjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3RpbWVzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl90aW1lc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fdGltZXNbY29udGV4dF0gPSBTdHJpbmdzLmZyb21UaW1lKCBSYW5kb20uaW50KDAsIDIzKSwgUmFuZG9tLmludCgwLCA1OSkgKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fdGltZXNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgdGltZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgdGltZSBmb3JcclxuICAgICAqIEBwYXJhbSB0aW1lIFZhbHVlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0VGltZShjb250ZXh0OiBzdHJpbmcsIHRpbWU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fdGltZXNbY29udGV4dF0gPSB0aW1lO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjaG9zZW4gZXhjdXNlLCBvciByYW5kb21seSBwaWNrcyBvbmUgKi9cclxuICAgIHB1YmxpYyBnZXQgZXhjdXNlKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fZXhjdXNlKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZXhjdXNlO1xyXG5cclxuICAgICAgICB0aGlzLl9leGN1c2UgPSBSQUcuZGF0YWJhc2UucGlja0V4Y3VzZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9leGN1c2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgZXhjdXNlICovXHJcbiAgICBwdWJsaWMgc2V0IGV4Y3VzZSh2YWx1ZTogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2V4Y3VzZSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjaG9zZW4gcGxhdGZvcm0sIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSAqL1xyXG4gICAgcHVibGljIGdldCBwbGF0Zm9ybSgpIDogUGxhdGZvcm1cclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fcGxhdGZvcm0pXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9wbGF0Zm9ybTtcclxuXHJcbiAgICAgICAgbGV0IHBsYXRmb3JtIDogUGxhdGZvcm0gPSBbJycsICcnXTtcclxuXHJcbiAgICAgICAgLy8gT25seSAyJSBjaGFuY2UgZm9yIHBsYXRmb3JtIDAsIHNpbmNlIGl0J3MgcmFyZVxyXG4gICAgICAgIHBsYXRmb3JtWzBdID0gUmFuZG9tLmJvb2woOTgpXHJcbiAgICAgICAgICAgID8gUmFuZG9tLmludCgxLCAyNikudG9TdHJpbmcoKVxyXG4gICAgICAgICAgICA6ICcwJztcclxuXHJcbiAgICAgICAgLy8gT25seSAxMCUgY2hhbmNlIGZvciBwbGF0Zm9ybSBsZXR0ZXIsIHNpbmNlIGl0J3MgdW5jb21tb25cclxuICAgICAgICBwbGF0Zm9ybVsxXSA9IFJhbmRvbS5ib29sKDEwKVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSgnQUJDJylcclxuICAgICAgICAgICAgOiAnJztcclxuXHJcbiAgICAgICAgdGhpcy5fcGxhdGZvcm0gPSBwbGF0Zm9ybTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzZXQgcGxhdGZvcm0odmFsdWU6IFBsYXRmb3JtKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BsYXRmb3JtID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBuYW1lZCB0cmFpbiwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IG5hbWVkKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fbmFtZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9uYW1lZDtcclxuXHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSBSQUcuZGF0YWJhc2UucGlja05hbWVkKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgc2V0IG5hbWVkKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgdGhlIHN0YXRlIGluIGEgcGFydGljdWxhciB3YXksIHNvIHRoYXQgaXQgbWFrZXMgc29tZSByZWFsLXdvcmxkIHNlbnNlLlxyXG4gICAgICogVG8gZG8gc28sIHdlIGhhdmUgdG8gZ2VuZXJhdGUgZGF0YSBpbiBhIHBhcnRpY3VsYXIgb3JkZXIsIGFuZCBtYWtlIHN1cmUgdG8gYXZvaWRcclxuICAgICAqIGR1cGxpY2F0ZXMgaW4gaW5hcHByb3ByaWF0ZSBwbGFjZXMgYW5kIGNvbnRleHRzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2VuRGVmYXVsdFN0YXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RlcCAxLiBQcmVwb3B1bGF0ZSBzdGF0aW9uIGxpc3RzXHJcblxyXG4gICAgICAgIGxldCBzbENhbGxpbmcgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDE2KTtcclxuICAgICAgICBsZXQgc2xDYWxsU3BsaXQgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygyLCAxNiwgc2xDYWxsaW5nKTtcclxuICAgICAgICBsZXQgYWxsQ2FsbGluZyAgPSBbLi4uc2xDYWxsaW5nLCAuLi5zbENhbGxTcGxpdF07XHJcblxyXG4gICAgICAgIC8vIExpc3Qgb2Ygb3RoZXIgc3RhdGlvbnMgZm91bmQgdmlhIGEgc3BlY2lmaWMgY2FsbGluZyBwb2ludFxyXG4gICAgICAgIGxldCBzbENoYW5nZXMgICAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgNCwgYWxsQ2FsbGluZyk7XHJcbiAgICAgICAgLy8gTGlzdCBvZiBvdGhlciBzdGF0aW9ucyB0aGF0IHRoaXMgdHJhaW4gdXN1YWxseSBzZXJ2ZXMsIGJ1dCBjdXJyZW50bHkgaXNuJ3RcclxuICAgICAgICBsZXQgc2xOb3RTdG9wcGluZyA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDgsXHJcbiAgICAgICAgICAgIFsuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXNdXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gVGFrZSBhIHJhbmRvbSBzbGljZSBmcm9tIHRoZSBjYWxsaW5nIGxpc3QsIHRvIGlkZW50aWZ5IGFzIHJlcXVlc3Qgc3RvcHNcclxuICAgICAgICBsZXQgcmVxQ291bnQgICA9IFJhbmRvbS5pbnQoMSwgc2xDYWxsaW5nLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgIGxldCBzbFJlcXVlc3RzID0gc2xDYWxsaW5nLnNsaWNlKDAsIHJlcUNvdW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZycsICAgICAgIHNsQ2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZ19zcGxpdCcsIHNsQ2FsbFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjaGFuZ2VzJywgICAgICAgc2xDaGFuZ2VzKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdub3Rfc3RvcHBpbmcnLCAgc2xOb3RTdG9wcGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgncmVxdWVzdCcsICAgICAgIHNsUmVxdWVzdHMpO1xyXG5cclxuICAgICAgICAvLyBTdGVwIDIuIFByZXBvcHVsYXRlIHN0YXRpb25zXHJcblxyXG4gICAgICAgIC8vIEFueSBzdGF0aW9uIG1heSBiZSBibGFtZWQgZm9yIGFuIGV4Y3VzZSwgZXZlbiBvbmVzIGFscmVhZHkgcGlja2VkXHJcbiAgICAgICAgbGV0IHN0RXhjdXNlICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoKTtcclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiBpcyBmaW5hbCBjYWxsIG9mIHRoZSBjYWxsaW5nIGxpc3RcclxuICAgICAgICBsZXQgc3REZXN0ICAgID0gc2xDYWxsaW5nW3NsQ2FsbGluZy5sZW5ndGggLSAxXTtcclxuICAgICAgICAvLyBWaWEgaXMgYSBjYWxsIGJlZm9yZSB0aGUgZGVzdGluYXRpb24sIG9yIG9uZSBpbiB0aGUgc3BsaXQgbGlzdCBpZiB0b28gc21hbGxcclxuICAgICAgICBsZXQgc3RWaWEgICAgID0gc2xDYWxsaW5nLmxlbmd0aCA+IDFcclxuICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoIHNsQ2FsbGluZy5zbGljZSgwLCAtMSkgICApXHJcbiAgICAgICAgICAgIDogUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuICAgICAgICAvLyBEaXR0byBmb3IgcGlja2luZyBhIHJhbmRvbSBjYWxsaW5nIHN0YXRpb24gYXMgYSBzaW5nbGUgcmVxdWVzdCBvciBjaGFuZ2Ugc3RvcFxyXG4gICAgICAgIGxldCBzdENhbGxpbmcgPSBzbENhbGxpbmcubGVuZ3RoID4gMVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSggc2xDYWxsaW5nLnNsaWNlKDAsIC0xKSAgIClcclxuICAgICAgICAgICAgOiBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG5cclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiAobGFzdCBjYWxsKSBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdERlc3RTcGxpdCA9IHNsQ2FsbFNwbGl0W3NsQ2FsbFNwbGl0Lmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIC8vIFJhbmRvbSBub24tZGVzdGluYXRpb24gc3RvcCBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdFZpYVNwbGl0ICA9IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcbiAgICAgICAgLy8gV2hlcmUgdGhlIHRyYWluIGNvbWVzIGZyb20sIHNvIGNhbid0IGJlIG9uIGFueSBsaXN0cyBvciBwcmlvciBzdGF0aW9uc1xyXG4gICAgICAgIGxldCBzdFNvdXJjZSAgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoW1xyXG4gICAgICAgICAgICAuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXMsIC4uLnNsTm90U3RvcHBpbmcsIC4uLnNsUmVxdWVzdHMsXHJcbiAgICAgICAgICAgIHN0Q2FsbGluZywgc3REZXN0LCBzdFZpYSwgc3REZXN0U3BsaXQsIHN0VmlhU3BsaXRcclxuICAgICAgICBdKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdjYWxsaW5nJywgICAgICAgICAgIHN0Q2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbicsICAgICAgIHN0RGVzdCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbl9zcGxpdCcsIHN0RGVzdFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2V4Y3VzZScsICAgICAgICAgICAgc3RFeGN1c2UpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignc291cmNlJywgICAgICAgICAgICBzdFNvdXJjZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCd2aWEnLCAgICAgICAgICAgICAgIHN0VmlhKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3ZpYV9zcGxpdCcsICAgICAgICAgc3RWaWFTcGxpdCk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgMy4gUHJlcG9wdWxhdGUgY29hY2ggbnVtYmVyc1xyXG5cclxuICAgICAgICBsZXQgaW50Q29hY2hlcyA9IHRoaXMuZ2V0SW50ZWdlcignY29hY2hlcycpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgZW5vdWdoIGNvYWNoZXMsIGp1c3Qgc3BsaXQgdGhlIG51bWJlciBkb3duIHRoZSBtaWRkbGUgaW5zdGVhZC5cclxuICAgICAgICAvLyBFbHNlLCBmcm9udCBhbmQgcmVhciBjb2FjaGVzIHdpbGwgYmUgcmFuZG9tbHkgcGlja2VkICh3aXRob3V0IG1ha2luZyBzZW5zZSlcclxuICAgICAgICBpZiAoaW50Q29hY2hlcyA+PSA0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGludEZyb250Q29hY2hlcyA9IChpbnRDb2FjaGVzIC8gMikgfCAwO1xyXG4gICAgICAgICAgICBsZXQgaW50UmVhckNvYWNoZXMgID0gaW50Q29hY2hlcyAtIGludEZyb250Q29hY2hlcztcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcignZnJvbnRfY29hY2hlcycsIGludEZyb250Q29hY2hlcyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcigncmVhcl9jb2FjaGVzJywgaW50UmVhckNvYWNoZXMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgYXJlIGVub3VnaCBjb2FjaGVzLCBhc3NpZ24gY29hY2ggbGV0dGVycyBmb3IgY29udGV4dHMuXHJcbiAgICAgICAgLy8gRWxzZSwgbGV0dGVycyB3aWxsIGJlIHJhbmRvbWx5IHBpY2tlZCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpXHJcbiAgICAgICAgaWYgKGludENvYWNoZXMgPj0gNClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsZXR0ZXJzID0gTC5MRVRURVJTLnNsaWNlKDAsIGludENvYWNoZXMpLnNwbGl0KCcnKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdmaXJzdCcsICAgICBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3Nob3AnLCAgICAgIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc3RhbmRhcmQxJywgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzdGFuZGFyZDInLCBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNC4gUHJlcG9wdWxhdGUgc2VydmljZXNcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBzZXJ2aWNlLCBwaWNrIG9uZSB0byBiZSB0aGUgXCJtYWluXCIgYW5kIG9uZSB0byBiZSB0aGVcclxuICAgICAgICAvLyBcImFsdGVybmF0ZVwiLCBlbHNlIHRoZSBvbmUgc2VydmljZSB3aWxsIGJlIHVzZWQgZm9yIGJvdGggKHdpdGhvdXQgbWFraW5nIHNlbnNlKS5cclxuICAgICAgICBpZiAoUkFHLmRhdGFiYXNlLnNlcnZpY2VzLmxlbmd0aCA+IDEpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgc2VydmljZXMgPSBSQUcuZGF0YWJhc2Uuc2VydmljZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VydmljZSggJ3Byb3ZpZGVyJywgICAgUmFuZG9tLmFycmF5U3BsaWNlKHNlcnZpY2VzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldFNlcnZpY2UoICdhbHRlcm5hdGl2ZScsIFJhbmRvbS5hcnJheVNwbGljZShzZXJ2aWNlcykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNS4gUHJlcG9wdWxhdGUgdGltZXNcclxuICAgICAgICAvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTIxNDc1M1xyXG5cclxuICAgICAgICAvLyBUaGUgYWx0ZXJuYXRpdmUgdGltZSBpcyBmb3IgYSB0cmFpbiB0aGF0J3MgbGF0ZXIgdGhhbiB0aGUgbWFpbiB0cmFpblxyXG4gICAgICAgIGxldCB0aW1lICAgID0gbmV3IERhdGUoIG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgUmFuZG9tLmludCgwLCA1OSkgKiA2MDAwMCk7XHJcbiAgICAgICAgbGV0IHRpbWVBbHQgPSBuZXcgRGF0ZSggdGltZS5nZXRUaW1lKCkgICAgICAgKyBSYW5kb20uaW50KDAsIDMwKSAqIDYwMDAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnbWFpbicsICAgICAgICBTdHJpbmdzLmZyb21UaW1lKHRpbWUpICAgICk7XHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnYWx0ZXJuYXRpdmUnLCBTdHJpbmdzLmZyb21UaW1lKHRpbWVBbHQpICk7XHJcbiAgICB9XHJcbn0iXX0=