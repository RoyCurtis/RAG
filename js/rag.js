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
        this.dom.innerText = RAG.database.getStation(code, false);
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
        let name = RAG.database.getStation(code, true);
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
        ctx.newElement.textContent = RAG.database.getStation(code, true);
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
    constructor(name, lang) {
        this.default = false;
        this.localService = false;
        this.name = `RAG-VOX ${name}`;
        this.lang = lang;
        this.voiceURI = `${CustomVoice.basePath}/${name}_${lang}`;
    }
}
/** Changeable base path for all custom voices */
CustomVoice.basePath = 'data/vox';
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility class for resolving a given phrase element to a vox key */
class Resolver {
    constructor() {
        /** Keeps track of phrases' text node relative indexes */
        this.phraseIdxs = {};
    }
    /** TreeWalker filter to reduce a walk to just the elements the resolver needs */
    static nodeFilter(node) {
        let parent = node.parentElement;
        let parentType = parent.dataset['type'];
        // If type is missing, parent is a wrapper
        if (!parentType) {
            parent = parent.parentElement;
            parentType = parent.dataset['type'];
        }
        if (node.nodeType === Node.TEXT_NODE) {
            // Only accept text nodes with words in them
            if (!node.textContent.match(/[a-z0-9]/i))
                return NodeFilter.FILTER_REJECT;
            // Accept text only from phrase and phrasesets
            if (parentType !== 'phraseset' && parentType !== 'phrase')
                return NodeFilter.FILTER_SKIP;
        }
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
    /**
     * Uses the type and value of the given node, to resolve it to vox file IDs.
     *
     * @param node Node to resolve to vox IDs
     * @returns Array of IDs that make up one or more file IDs. Can be empty.
     */
    resolve(node) {
        if (node.nodeType === Node.TEXT_NODE)
            return this.resolveText(node);
        let element = node;
        let type = element.dataset['type'];
        switch (type) {
            case 'coach': return this.resolveCoach(element);
            case 'excuse': return this.resolveExcuse();
            case 'integer': return this.resolveInteger(element);
            case 'named': return this.resolveNamed();
            case 'platform': return this.resolvePlatform();
            case 'service': return this.resolveService(element);
            case 'station': return this.resolveStation(element);
            case 'stationlist': return this.resolveStationList(element);
            case 'time': return this.resolveTime(element);
        }
        return [];
    }
    /** Resolve text nodes from phrases and phrasesets to ID strings */
    resolveText(node) {
        let parent = node.parentElement;
        let type = parent.dataset['type'];
        // If type is missing, parent is a wrapper
        if (!type) {
            parent = parent.parentElement;
            type = parent.dataset['type'];
        }
        let ref = parent.dataset['ref'];
        let id = `phrase.${ref}`;
        // Append index of phraseset's choice of phrase
        if (type === 'phraseset')
            id += `.${parent.dataset['idx']}`;
        if (!this.phraseIdxs[id])
            this.phraseIdxs[id] = 0;
        id += `.${this.phraseIdxs[id]++}`;
        return [id];
    }
    /** Resolve ID from a given coach element and current state */
    resolveCoach(element) {
        let ctx = element.dataset['context'];
        let coach = RAG.state.getCoach(ctx);
        return [`letter.${coach}`];
    }
    /** Resolve ID from a given excuse element and current state */
    resolveExcuse() {
        let excuse = RAG.state.excuse;
        let index = RAG.database.excuses.indexOf(excuse);
        // TODO: Error handling
        return [`excuse.${index}`];
    }
    /** Resolve IDs from a given integer element and current state */
    resolveInteger(element) {
        let ctx = element.dataset['context'];
        let singular = element.dataset['singular'];
        let plural = element.dataset['plural'];
        let integer = RAG.state.getInteger(ctx);
        let parts = [`number.${integer}`];
        if (singular && integer === 1)
            parts.push(`number.suffix.${singular}`);
        else if (plural && integer !== 1)
            parts.push(`number.suffix.${plural}`);
        return parts;
    }
    /** Resolve ID from a given named element and current state */
    resolveNamed() {
        let named = Strings.filename(RAG.state.named);
        return [`named.${named}`];
    }
    /** Resolve IDs from a given platform element and current state */
    resolvePlatform() {
        let platform = RAG.state.platform;
        let parts = [];
        parts.push(`number.${platform[0]}`);
        if (platform[1])
            parts.push(`letter.${platform[1]}`);
        return parts;
    }
    /** Resolve ID from a given service element and current state */
    resolveService(element) {
        let ctx = element.dataset['context'];
        let service = Strings.filename(RAG.state.getService(ctx));
        return [`service.${service}`];
    }
    /** Resolve ID from a given station element and current state */
    resolveStation(element) {
        let ctx = element.dataset['context'];
        let station = RAG.state.getStation(ctx);
        // TODO: Context sensitive types
        let type = 'end';
        return [`station.end.${station}`];
    }
    /** Resolve IDs from a given station list element and current state */
    resolveStationList(element) {
        let ctx = element.dataset['context'];
        let list = RAG.state.getStationList(ctx);
        let parts = [];
        list.forEach((v, k) => {
            // Handle end of list inflection
            if (k === list.length - 1) {
                // Add "and" if list has more than 1 station and this is the end
                if (list.length > 1)
                    parts.push('station.parts.and');
                parts.push(`station.end.${v}`);
            }
            else
                parts.push(`station.middle.${v}`);
        });
        // Add "only" if only one station in the calling list
        if (list.length === 1 && ctx === 'calling')
            parts.push('station.parts.only');
        return parts;
    }
    /** Resolve IDs from a given time element and current state */
    resolveTime(element) {
        let ctx = element.dataset['context'];
        let time = RAG.state.getTime(ctx).split(':');
        let parts = [];
        if (time[0] === '00' && time[1] === '00')
            return ['number.0000'];
        // Hours
        parts.push(`number.${time[0]}`);
        if (time[1] === '00')
            parts.push('number.hundred');
        else
            parts.push(`number.${time[1]}`);
        return parts;
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
        let ids = [];
        let resolver = new Resolver();
        let treeWalker = document.createTreeWalker(phrase, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: Resolver.nodeFilter }, false);
        while (treeWalker.nextNode())
            ids.push(...resolver.resolve(treeWalker.currentNode));
        this.voxEngine.speak(ids, voice, settings);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Synthesizes speech by dynamically loading and piecing together voice files */
class VoxEngine {
    constructor() {
        // Setup the core audio context
        /** Whether this engine is currently running and speaking */
        this.isSpeaking = false;
        /** Reference number for the current pump timer */
        this.pumpTimer = 0;
        /** References to currently pending requests, as a FIFO queue */
        this.pendingReqs = [];
        // @ts-ignore
        let AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext({ latencyHint: 'playback' });
        // Setup tannoy filter
        this.audioFilter = this.audioContext.createBiquadFilter();
        this.audioFilter.type = 'highpass';
        this.audioFilter.Q.value = 0.4;
        this.audioFilter.connect(this.audioContext.destination);
        // Setup reverb
        // TODO: Make this user configurable and choosable
        fetch('data/vox/ir.stalbans_a_mono.wav')
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
        if (this.currentBufNode) {
            this.currentBufNode.onended = null;
            this.currentBufNode.stop();
            this.currentBufNode.disconnect();
            this.currentBufNode = undefined;
        }
        this.currentIds = undefined;
        this.currentVoice = undefined;
        this.currentSettings = undefined;
        this.pendingReqs = [];
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
        // First, feed fulfilled requests into the audio buffer, in FIFO order
        this.playNext();
        // Then, fill any free pending slots with new requests
        while (this.currentIds[0] && this.pendingReqs.length < 10) {
            let id = this.currentIds.shift();
            let path = `${this.currentVoice.voiceURI}/${id}.mp3`;
            this.pendingReqs.push(new VoxRequest(path));
        }
        // Stop pumping when we're out of IDs to queue and nothing is playing
        if (this.currentIds.length <= 0)
            if (this.pendingReqs.length <= 0)
                if (!this.currentBufNode)
                    return this.stop();
        this.pumpTimer = setTimeout(this.pump.bind(this), 100);
    }
    /**
     * If there's a pending request and it's ready, and a buffer node is not currently
     * playing, then that next pending request is played. The buffer node created by this
     * method, automatically calls this method when playing is done.
     */
    playNext() {
        // Ignore if there are no pending requests
        if (!this.pendingReqs[0] || !this.pendingReqs[0].isDone || this.currentBufNode)
            return;
        let req = this.pendingReqs.shift();
        console.log('VOX PLAYING:', req.path);
        // If the next request errored out (buffer missing), skip it
        // TODO: Replace with silence?
        if (!req.buffer)
            return this.playNext();
        this.currentBufNode = this.audioContext.createBufferSource();
        this.currentBufNode.buffer = req.buffer;
        // Only connect to reverb if it's available
        this.currentBufNode.connect(this.audioFilter);
        this.currentBufNode.start();
        // Have this buffer node automatically try to play next, when done
        this.currentBufNode.onended = _ => {
            if (!this.isSpeaking)
                return;
            this.currentBufNode = undefined;
            this.playNext();
        };
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Represents a request for a vox file, immediately begun on creation */
class VoxRequest {
    constructor(path) {
        /** Whether this request is done and ready for handling (even if failed) */
        this.isDone = false;
        console.debug('VOX REQUEST:', path);
        this.path = path;
        fetch(path)
            .then(this.onFulfill.bind(this))
            .catch(this.onError.bind(this));
    }
    cancel() {
        // TODO: Cancellation controllers
    }
    /** Begins decoding the loaded MP3 voice file to raw audio data */
    onFulfill(res) {
        if (!res.ok)
            throw Error(`VOX NOT FOUND: ${res.status} @ ${this.path}`);
        res.arrayBuffer().then(this.onArrayBuffer.bind(this));
    }
    onArrayBuffer(buffer) {
        Sounds.decode(RAG.speech.voxEngine.audioContext, buffer)
            .then(this.onDecode.bind(this))
            .catch(this.onError.bind(this));
    }
    onDecode(buffer) {
        this.buffer = buffer;
        this.isDone = true;
    }
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
    set(msg) {
        window.cancelAnimationFrame(this.timer);
        this.domSpan.textContent = msg;
        this.offset = this.dom.clientWidth;
        // I tried to use CSS animation for this, but couldn't figure out how for a
        // dynamically sized element like the span.
        let limit = -this.domSpan.clientWidth - 100;
        let anim = () => {
            this.offset -= (DOM.isMobile ? 5 : 7);
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
    static decode(context, buf) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                return context.decodeAudioData(buf, resolve, reject);
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
        names.forEach((c, i) => names[i] = RAG.database.getStation(c, true));
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
    /** Formats the given string to one more filename friendly */
    static filename(text) {
        return text
            .toLowerCase()
            .replace(/\s/g, '_')
            .replace(/[^a-z0-9_]/g, '');
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
    getStation(code, filtered = false) {
        let station = this.stations[code];
        if (!station)
            return L.DB_UNKNOWN_STATION(code);
        else if (Strings.isNullOrEmpty(station))
            return L.DB_EMPTY_STATION(code);
        if (filtered)
            station = station.replace(/\(.+\)/i, '').trim();
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
        console.log(error);
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
                max = 120;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL3N0YXRpb25DaG9vc2VyLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkxpc3RJdGVtLnRzIiwidWkvcGlja2Vycy9waWNrZXIudHMiLCJ1aS9waWNrZXJzL2NvYWNoUGlja2VyLnRzIiwidWkvcGlja2Vycy9leGN1c2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2ludGVnZXJQaWNrZXIudHMiLCJ1aS9waWNrZXJzL25hbWVkUGlja2VyLnRzIiwidWkvcGlja2Vycy9waHJhc2VzZXRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BsYXRmb3JtUGlja2VyLnRzIiwidWkvcGlja2Vycy9zZXJ2aWNlUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uTGlzdFBpY2tlci50cyIsInVpL3BpY2tlcnMvdGltZVBpY2tlci50cyIsImxhbmcvYmFzZUxhbmd1YWdlLnRzIiwibGFuZy9lbmdsaXNoTGFuZ3VhZ2UudHMiLCJwaHJhc2VyL2VsZW1lbnRQcm9jZXNzb3JzLnRzIiwicGhyYXNlci9waHJhc2VDb250ZXh0LnRzIiwicGhyYXNlci9waHJhc2VyLnRzIiwic3BlZWNoL2N1c3RvbVZvaWNlLnRzIiwic3BlZWNoL3Jlc29sdmVyLnRzIiwic3BlZWNoL3NwZWVjaC50cyIsInNwZWVjaC9zcGVlY2hTZXR0aW5ncy50cyIsInNwZWVjaC92b3hFbmdpbmUudHMiLCJzcGVlY2gvdm94UmVxdWVzdC50cyIsInVpL2VkaXRvci50cyIsInVpL21hcnF1ZWUudHMiLCJ1aS9zZXR0aW5ncy50cyIsInVpL3Rvb2xiYXIudHMiLCJ1aS92aWV3cy50cyIsInV0aWwvY29sbGFwc2libGVzLnRzIiwidXRpbC9jb25kaXRpb25hbHMudHMiLCJ1dGlsL2RvbS50cyIsInV0aWwvbGlua2Rvd24udHMiLCJ1dGlsL3BhcnNlLnRzIiwidXRpbC9yYW5kb20udHMiLCJ1dGlsL3NvdW5kcy50cyIsInV0aWwvc3RyaW5ncy50cyIsInV0aWwvdHlwZXMudHMiLCJjb25maWcudHMiLCJkYXRhYmFzZS50cyIsInJhZy50cyIsInN0YXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLHFFQUFxRTtBQUVyRSw4REFBOEQ7QUFDOUQsSUFBSSxDQUFrQyxDQUFDO0FBRXZDLE1BQU0sSUFBSTtJQVVOLDRFQUE0RTtJQUNyRSxNQUFNLENBQUMsSUFBSTtRQUVkLElBQUksSUFBSSxDQUFDLFNBQVM7WUFDZCxNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFFbkQsSUFBSSxDQUFDLFNBQVMsR0FBRztZQUNiLElBQUksRUFBRyxJQUFJLGVBQWUsRUFBRTtTQUMvQixDQUFDO1FBRUYsMkJBQTJCO1FBQzNCLENBQUMsR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFNUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ3RCLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ssTUFBTSxDQUFDLFVBQVU7UUFFckIsSUFBSSxJQUFrQixDQUFDO1FBQ3ZCLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FDaEMsUUFBUSxDQUFDLElBQUksRUFDYixVQUFVLENBQUMsWUFBWSxHQUFHLFVBQVUsQ0FBQyxTQUFTLEVBQzlDLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFDL0IsS0FBSyxDQUNSLENBQUM7UUFFRixPQUFRLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQzlCO1lBQ0ksSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxZQUFZLEVBQ3ZDO2dCQUNJLElBQUksT0FBTyxHQUFHLElBQWUsQ0FBQztnQkFFOUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVB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RXRDLHVFQUF1RTtRQUN2RSxJQUFJLElBQUksR0FBTSxJQUFJLElBQUksQ0FBRSxJQUFJLElBQUksRUFBRSxDQUFDLE9BQU8sRUFBRSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDO1FBQzFFLElBQUksT0FBTyxHQUFHLElBQUksSUFBSSxDQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBUyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztRQUUxRSxJQUFJLENBQUMsT0FBTyxDQUFFLE1BQU0sRUFBUyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFLLENBQUM7UUFDekQsSUFBSSxDQUFDLE9BQU8sQ0FBRSxhQUFhLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBRSxDQUFDO0lBQzdELENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEdsb2JhbCByZWZlcmVuY2UgdG8gdGhlIGxhbmd1YWdlIGNvbnRhaW5lciwgc2V0IGF0IGluaXQgKi9cclxubGV0IEwgOiBFbmdsaXNoTGFuZ3VhZ2UgfCBCYXNlTGFuZ3VhZ2U7XHJcblxyXG5jbGFzcyBJMThuXHJcbntcclxuICAgIC8qKiBDb25zdGFudCByZWdleCB0byBtYXRjaCBmb3IgdHJhbnNsYXRpb24ga2V5cyAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVEFHX1JFR0VYIDogUmVnRXhwID0gLyVbQS1aX10rJS87XHJcblxyXG4gICAgLyoqIExhbmd1YWdlcyBjdXJyZW50bHkgYXZhaWxhYmxlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBsYW5ndWFnZXMgICA6IERpY3Rpb25hcnk8QmFzZUxhbmd1YWdlPjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gbGFuZ3VhZ2UgY3VycmVudGx5IGluIHVzZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgY3VycmVudExhbmcgOiBCYXNlTGFuZ3VhZ2U7XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgbGFuZ3VhZ2UsIGFuZCB0cmFuc2Zvcm1zIGFsbCB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBkb2N1bWVudCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMubGFuZ3VhZ2VzKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0kxOG4gaXMgYWxyZWFkeSBpbml0aWFsaXplZCcpO1xyXG5cclxuICAgICAgICB0aGlzLmxhbmd1YWdlcyA9IHtcclxuICAgICAgICAgICAgJ2VuJyA6IG5ldyBFbmdsaXNoTGFuZ3VhZ2UoKVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIFRPRE86IExhbmd1YWdlIHNlbGVjdGlvblxyXG4gICAgICAgIEwgPSB0aGlzLmN1cnJlbnRMYW5nID0gdGhpcy5sYW5ndWFnZXNbJ2VuJ107XHJcblxyXG4gICAgICAgIEkxOG4uYXBwbHlUb0RvbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogV2Fsa3MgdGhyb3VnaCBhbGwgdGV4dCBub2RlcyBpbiB0aGUgRE9NLCByZXBsYWNpbmcgYW55IHRyYW5zbGF0aW9uIGtleXMuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTA3MzA3NzcvMzM1NDkyMFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBhcHBseVRvRG9tKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5leHQgOiBOb2RlIHwgbnVsbDtcclxuICAgICAgICBsZXQgd2FsayA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoXHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHksXHJcbiAgICAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5UIHwgTm9kZUZpbHRlci5TSE9XX1RFWFQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogSTE4bi5ub2RlRmlsdGVyIH0sXHJcbiAgICAgICAgICAgIGZhbHNlXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgd2hpbGUgKCBuZXh0ID0gd2Fsay5uZXh0Tm9kZSgpIClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmIChuZXh0Lm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnQgPSBuZXh0IGFzIEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBlbGVtZW50LmF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgICAgICAgICAgSTE4bi5leHBhbmRBdHRyaWJ1dGUoZWxlbWVudC5hdHRyaWJ1dGVzW2ldKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChuZXh0Lm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSAmJiBuZXh0LnRleHRDb250ZW50KVxyXG4gICAgICAgICAgICAgICAgSTE4bi5leHBhbmRUZXh0Tm9kZShuZXh0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbHRlcnMgdGhlIHRyZWUgd2Fsa2VyIHRvIGV4Y2x1ZGUgc2NyaXB0IGFuZCBzdHlsZSB0YWdzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBub2RlRmlsdGVyKG5vZGU6IE5vZGUpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhZyA9IChub2RlLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSlcclxuICAgICAgICAgICAgPyAobm9kZSBhcyBFbGVtZW50KS50YWdOYW1lLnRvVXBwZXJDYXNlKClcclxuICAgICAgICAgICAgOiBub2RlLnBhcmVudEVsZW1lbnQhLnRhZ05hbWUudG9VcHBlckNhc2UoKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsnU0NSSVBUJywgJ1NUWUxFJ10uaW5jbHVkZXModGFnKVxyXG4gICAgICAgICAgICA/IE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVFxyXG4gICAgICAgICAgICA6IE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRXhwYW5kcyBhbnkgdHJhbnNsYXRpb24ga2V5cyBpbiB0aGUgZ2l2ZW4gYXR0cmlidXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBleHBhbmRBdHRyaWJ1dGUoYXR0cjogQXR0cikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2V0dGluZyBhbiBhdHRyaWJ1dGUsIGV2ZW4gaWYgbm90aGluZyBhY3R1YWxseSBjaGFuZ2VzLCB3aWxsIGNhdXNlIHZhcmlvdXNcclxuICAgICAgICAvLyBzaWRlLWVmZmVjdHMgKGUuZy4gcmVsb2FkaW5nIGlmcmFtZXMpLiBTbywgYXMgd2FzdGVmdWwgYXMgdGhpcyBsb29rcywgd2UgaGF2ZVxyXG4gICAgICAgIC8vIHRvIG1hdGNoIGZpcnN0IGJlZm9yZSBhY3R1YWxseSByZXBsYWNpbmcuXHJcblxyXG4gICAgICAgIGlmICggYXR0ci52YWx1ZS5tYXRjaCh0aGlzLlRBR19SRUdFWCkgKVxyXG4gICAgICAgICAgICBhdHRyLnZhbHVlID0gYXR0ci52YWx1ZS5yZXBsYWNlKHRoaXMuVEFHX1JFR0VYLCBJMThuLnJlcGxhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFeHBhbmRzIGFueSB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBnaXZlbiB0ZXh0IG5vZGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGV4cGFuZFRleHROb2RlKG5vZGU6IE5vZGUpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIG5vZGUudGV4dENvbnRlbnQgPSBub2RlLnRleHRDb250ZW50IS5yZXBsYWNlKHRoaXMuVEFHX1JFR0VYLCBJMThuLnJlcGxhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyBrZXkgd2l0aCB2YWx1ZSBpZiBpdCBleGlzdHMsIGVsc2Uga2VlcHMgdGhlIGtleSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVwbGFjZShtYXRjaDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBrZXkgICA9IG1hdGNoLnNsaWNlKDEsIC0xKTtcclxuICAgICAgICBsZXQgdmFsdWUgPSBMW2tleV0gYXMgTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAgICAgaWYgKCF2YWx1ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgdHJhbnNsYXRpb24ga2V5OicsIG1hdGNoKTtcclxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSgpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogRGVsZWdhdGUgdHlwZSBmb3IgY2hvb3NlciBzZWxlY3QgZXZlbnQgaGFuZGxlcnMgKi9cclxudHlwZSBTZWxlY3REZWxlZ2F0ZSA9IChlbnRyeTogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XHJcblxyXG4vKiogVUkgZWxlbWVudCB3aXRoIGEgZmlsdGVyYWJsZSBhbmQga2V5Ym9hcmQgbmF2aWdhYmxlIGxpc3Qgb2YgY2hvaWNlcyAqL1xyXG5jbGFzcyBDaG9vc2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSwgZm9yIGVhY2ggY2hvb3NlciBjcmVhdGVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURSAgICA9IERPTS5yZXF1aXJlKCcjY2hvb3NlclRlbXBsYXRlJyk7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5pZCA9ICcnO1xyXG5cclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBjb250YWluZXIgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkb20gICAgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgZmlsdGVyIGlucHV0IGJveCAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlucHV0RmlsdGVyICA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGNvbnRhaW5lciBvZiBpdGVtIGVsZW1lbnRzICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5wdXRDaG9pY2VzIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIE9wdGlvbmFsIGV2ZW50IGhhbmRsZXIgdG8gZmlyZSB3aGVuIGFuIGl0ZW0gaXMgc2VsZWN0ZWQgYnkgdGhlIHVzZXIgKi9cclxuICAgIHB1YmxpYyAgICBvblNlbGVjdD8gICAgIDogU2VsZWN0RGVsZWdhdGU7XHJcbiAgICAvKiogV2hldGhlciB0byB2aXN1YWxseSBzZWxlY3QgdGhlIGNsaWNrZWQgZWxlbWVudCAqL1xyXG4gICAgcHVibGljICAgIHNlbGVjdE9uQ2xpY2sgOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBpdGVtLCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCBkb21TZWxlY3RlZD8gIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBhdXRvLWZpbHRlciB0aW1lb3V0LCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCBmaWx0ZXJUaW1lb3V0IDogbnVtYmVyID0gMDtcclxuICAgIC8qKiBXaGV0aGVyIHRvIGdyb3VwIGFkZGVkIGVsZW1lbnRzIGJ5IGFscGhhYmV0aWNhbCBzZWN0aW9ucyAqL1xyXG4gICAgcHJvdGVjdGVkIGdyb3VwQnlBQkMgICAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogVGl0bGUgYXR0cmlidXRlIHRvIGFwcGx5IHRvIGV2ZXJ5IGl0ZW0gYWRkZWQgKi9cclxuICAgIHByb3RlY3RlZCBpdGVtVGl0bGUgICAgIDogc3RyaW5nID0gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIGl0ZW0nO1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGEgY2hvb3NlciwgYnkgcmVwbGFjaW5nIHRoZSBwbGFjZWhvbGRlciBpbiBhIGdpdmVuIHBhcmVudCAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFDaG9vc2VyLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBDaG9vc2VyLmluaXQoKTtcclxuXHJcbiAgICAgICAgbGV0IHRhcmdldCAgICAgID0gRE9NLnJlcXVpcmUoJ2Nob29zZXInLCBwYXJlbnQpO1xyXG4gICAgICAgIGxldCBwbGFjZWhvbGRlciA9IERPTS5nZXRBdHRyKCB0YXJnZXQsICdwbGFjZWhvbGRlcicsIEwuUF9HRU5FUklDX1BIKCkgKTtcclxuICAgICAgICBsZXQgdGl0bGUgICAgICAgPSBET00uZ2V0QXR0ciggdGFyZ2V0LCAndGl0bGUnLCBMLlBfR0VORVJJQ19UKCkgKTtcclxuICAgICAgICB0aGlzLml0ZW1UaXRsZSAgPSBET00uZ2V0QXR0cih0YXJnZXQsICdpdGVtVGl0bGUnLCB0aGlzLml0ZW1UaXRsZSk7XHJcbiAgICAgICAgdGhpcy5ncm91cEJ5QUJDID0gdGFyZ2V0Lmhhc0F0dHJpYnV0ZSgnZ3JvdXBCeUFCQycpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbSAgICAgICAgICA9IENob29zZXIuVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIgID0gRE9NLnJlcXVpcmUoJy5jaFNlYXJjaEJveCcsICB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMgPSBET00ucmVxdWlyZSgnLmNoQ2hvaWNlc0JveCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMudGl0bGUgICAgICA9IHRpdGxlO1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIucGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcclxuICAgICAgICAvLyBUT0RPOiBSZXVzaW5nIHRoZSBwbGFjZWhvbGRlciBhcyB0aXRsZSBpcyBwcm9iYWJseSBiYWRcclxuICAgICAgICAvLyBodHRwczovL2xha2VuLm5ldC9ibG9nL21vc3QtY29tbW9uLWExMXktbWlzdGFrZXMvXHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci50aXRsZSAgICAgICA9IHBsYWNlaG9sZGVyO1xyXG5cclxuICAgICAgICB0YXJnZXQuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdiZWZvcmViZWdpbicsIHRoaXMuZG9tKTtcclxuICAgICAgICB0YXJnZXQucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBZGRzIHRoZSBnaXZlbiB2YWx1ZSB0byB0aGUgY2hvb3NlciBhcyBhIHNlbGVjdGFibGUgaXRlbS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVGV4dCBvZiB0aGUgc2VsZWN0YWJsZSBpdGVtXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFdoZXRoZXIgdG8gc2VsZWN0IHRoaXMgaXRlbSBvbmNlIGFkZGVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhZGQodmFsdWU6IHN0cmluZywgc2VsZWN0OiBib29sZWFuID0gZmFsc2UpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuXHJcbiAgICAgICAgaXRlbS5pbm5lclRleHQgPSB2YWx1ZTtcclxuXHJcbiAgICAgICAgdGhpcy5hZGRSYXcoaXRlbSwgc2VsZWN0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFkZHMgdGhlIGdpdmVuIGVsZW1lbnQgdG8gdGhlIGNob29zZXIgYXMgYSBzZWxlY3RhYmxlIGl0ZW0uXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGl0ZW0gRWxlbWVudCB0byBhZGQgdG8gdGhlIGNob29zZXJcclxuICAgICAqIEBwYXJhbSBzZWxlY3QgV2hldGhlciB0byBzZWxlY3QgdGhpcyBpdGVtIG9uY2UgYWRkZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGFkZFJhdyhpdGVtOiBIVE1MRWxlbWVudCwgc2VsZWN0OiBib29sZWFuID0gZmFsc2UpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGl0ZW0udGl0bGUgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgICAgICBpdGVtLnRhYkluZGV4ID0gLTE7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmFwcGVuZENoaWxkKGl0ZW0pO1xyXG5cclxuICAgICAgICBpZiAoc2VsZWN0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoaXRlbSk7XHJcbiAgICAgICAgICAgIGl0ZW0uZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFycyBhbGwgaXRlbXMgZnJvbSB0aGlzIGNob29zZXIgYW5kIHRoZSBjdXJyZW50IGZpbHRlciAqL1xyXG4gICAgcHVibGljIGNsZWFyKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuaW5uZXJIVE1MID0gJyc7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci52YWx1ZSAgICAgID0gJyc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNlbGVjdCBhbmQgZm9jdXMgdGhlIGVudHJ5IHRoYXQgbWF0Y2hlcyB0aGUgZ2l2ZW4gdmFsdWUgKi9cclxuICAgIHB1YmxpYyBwcmVzZWxlY3QodmFsdWU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQga2V5IGluIHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGl0ZW0gPSB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbltrZXldIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgaWYgKHZhbHVlID09PSBpdGVtLmlubmVyVGV4dClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoaXRlbSk7XHJcbiAgICAgICAgICAgICAgICBpdGVtLmZvY3VzKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbGljayBldmVudHMsIGZvciBjaG9vc2luZyBpdGVtcyAqL1xyXG4gICAgcHVibGljIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSBldi50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggdGhpcy5pc0Nob2ljZSh0YXJnZXQpIClcclxuICAgICAgICBpZiAoICF0YXJnZXQuaGFzQXR0cmlidXRlKCdkaXNhYmxlZCcpIClcclxuICAgICAgICAgICAgdGhpcy5zZWxlY3QodGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbG9zZSBtZXRob2RzLCBkb2luZyBhbnkgdGltZXIgY2xlYW51cCAqL1xyXG4gICAgcHVibGljIG9uQ2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgaW5wdXQgZXZlbnRzLCBmb3IgZmlsdGVyaW5nIGFuZCBuYXZpZ2F0aW9uICovXHJcbiAgICBwdWJsaWMgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSAgICAgPSBldi5rZXk7XHJcbiAgICAgICAgbGV0IGZvY3VzZWQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCBwYXJlbnQgID0gZm9jdXNlZC5wYXJlbnRFbGVtZW50ITtcclxuXHJcbiAgICAgICAgaWYgKCFmb2N1c2VkKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIE9ubHkgaGFuZGxlIGV2ZW50cyBvbiB0aGlzIGNob29zZXIncyBjb250cm9sc1xyXG4gICAgICAgIGlmICggIXRoaXMub3ducyhmb2N1c2VkKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHR5cGluZyBpbnRvIGZpbHRlciBib3hcclxuICAgICAgICBpZiAoZm9jdXNlZCA9PT0gdGhpcy5pbnB1dEZpbHRlcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyVGltZW91dCA9IHdpbmRvdy5zZXRUaW1lb3V0KF8gPT4gdGhpcy5maWx0ZXIoKSwgNTAwKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUmVkaXJlY3QgdHlwaW5nIHRvIGlucHV0IGZpbHRlciBib3hcclxuICAgICAgICBpZiAoZm9jdXNlZCAhPT0gdGhpcy5pbnB1dEZpbHRlcilcclxuICAgICAgICBpZiAoa2V5Lmxlbmd0aCA9PT0gMSB8fCBrZXkgPT09ICdCYWNrc3BhY2UnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pbnB1dEZpbHRlci5mb2N1cygpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcHJlc3NpbmcgRU5URVIgYWZ0ZXIga2V5Ym9hcmQgbmF2aWdhdGluZyB0byBhbiBpdGVtXHJcbiAgICAgICAgaWYgKCB0aGlzLmlzQ2hvaWNlKGZvY3VzZWQpIClcclxuICAgICAgICBpZiAoa2V5ID09PSAnRW50ZXInKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3QoZm9jdXNlZCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBuYXZpZ2F0aW9uIHdoZW4gY29udGFpbmVyIG9yIGl0ZW0gaXMgZm9jdXNlZFxyXG4gICAgICAgIGlmIChrZXkgPT09ICdBcnJvd0xlZnQnIHx8IGtleSA9PT0gJ0Fycm93UmlnaHQnKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGRpciA9IChrZXkgPT09ICdBcnJvd0xlZnQnKSA/IC0xIDogMTtcclxuICAgICAgICAgICAgbGV0IG5hdiA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LCBpZiB1c2luZyBncm91cHNcclxuICAgICAgICAgICAgaWYgICAgICAoIHRoaXMuZ3JvdXBCeUFCQyAmJiBwYXJlbnQuaGFzQXR0cmlidXRlKCdncm91cCcpIClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudCwgaWYgY2hvaWNlcyBhcmUgZmxhdFxyXG4gICAgICAgICAgICBlbHNlIGlmICghdGhpcy5ncm91cEJ5QUJDICYmIGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dENob2ljZXMpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGZvY3VzZWQgPT09IHRoaXMuZG9tU2VsZWN0ZWQpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcodGhpcy5kb21TZWxlY3RlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGV2YW50IHRvIGJlZ2lubmluZyBvciBlbmQgb2YgY29udGFpbmVyXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA9PT0gLTEpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5maXJzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQubGFzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChuYXYpIG5hdi5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBzdWJtaXQgZXZlbnRzLCBmb3IgaW5zdGFudCBmaWx0ZXJpbmcgKi9cclxuICAgIHB1YmxpYyBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgdGhpcy5maWx0ZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGlkZSBvciBzaG93IGNob2ljZXMgaWYgdGhleSBwYXJ0aWFsbHkgbWF0Y2ggdGhlIHVzZXIgcXVlcnkgKi9cclxuICAgIHByb3RlY3RlZCBmaWx0ZXIoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcblxyXG4gICAgICAgIGxldCBmaWx0ZXIgPSB0aGlzLmlucHV0RmlsdGVyLnZhbHVlLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgbGV0IGl0ZW1zICA9IHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuO1xyXG4gICAgICAgIGxldCBlbmdpbmUgPSB0aGlzLmdyb3VwQnlBQkNcclxuICAgICAgICAgICAgPyBDaG9vc2VyLmZpbHRlckdyb3VwXHJcbiAgICAgICAgICAgIDogQ2hvb3Nlci5maWx0ZXJJdGVtO1xyXG5cclxuICAgICAgICAvLyBQcmV2ZW50IGJyb3dzZXIgcmVkcmF3L3JlZmxvdyBkdXJpbmcgZmlsdGVyaW5nXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XHJcblxyXG4gICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBhbGwgdGhlIGl0ZW1zXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgZW5naW5lKGl0ZW1zW2ldIGFzIEhUTUxFbGVtZW50LCBmaWx0ZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQXBwbGllcyBmaWx0ZXIgdG8gYW4gaXRlbSwgc2hvd2luZyBpdCBpZiBtYXRjaGVkLCBoaWRpbmcgaWYgbm90ICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGZpbHRlckl0ZW0oaXRlbTogSFRNTEVsZW1lbnQsIGZpbHRlcjogc3RyaW5nKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIC8vIFNob3cgaWYgY29udGFpbnMgc2VhcmNoIHRlcm1cclxuICAgICAgICBpZiAoaXRlbS5pbm5lclRleHQudG9Mb3dlckNhc2UoKS5pbmRleE9mKGZpbHRlcikgPj0gMClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGl0ZW0uY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGlkZSBpZiBub3RcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpdGVtLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xyXG4gICAgICAgICAgICByZXR1cm4gMTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEFwcGxpZXMgZmlsdGVyIHRvIGNoaWxkcmVuIG9mIGEgZ3JvdXAsIGhpZGluZyB0aGUgZ3JvdXAgaWYgYWxsIGNoaWxkcmVuIGhpZGUgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgZmlsdGVyR3JvdXAoZ3JvdXA6IEhUTUxFbGVtZW50LCBmaWx0ZXI6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJpZXMgPSBncm91cC5jaGlsZHJlbjtcclxuICAgICAgICBsZXQgY291bnQgICA9IGVudHJpZXMubGVuZ3RoIC0gMTsgLy8gLTEgZm9yIGhlYWRlciBlbGVtZW50XHJcbiAgICAgICAgbGV0IGhpZGRlbiAgPSAwO1xyXG5cclxuICAgICAgICAvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBzdGF0aW9uIG5hbWUgaW4gdGhpcyBsZXR0ZXIgc2VjdGlvbi4gSGVhZGVyIHNraXBwZWQuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBlbnRyaWVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICBoaWRkZW4gKz0gQ2hvb3Nlci5maWx0ZXJJdGVtKGVudHJpZXNbaV0gYXMgSFRNTEVsZW1lbnQsIGZpbHRlcik7XHJcblxyXG4gICAgICAgIC8vIElmIGFsbCBzdGF0aW9uIG5hbWVzIGluIHRoaXMgbGV0dGVyIHNlY3Rpb24gd2VyZSBoaWRkZW4sIGhpZGUgdGhlIHNlY3Rpb25cclxuICAgICAgICBpZiAoaGlkZGVuID49IGNvdW50KVxyXG4gICAgICAgICAgICBncm91cC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIGdyb3VwLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSBjaGFuZ2VzIHRoZSBjdXJyZW50IHNlbGVjdGlvbiwgYW5kIHVwZGF0ZXMgdGhlIHN0YXRlIGFuZCBlZGl0b3IgKi9cclxuICAgIHByb3RlY3RlZCBzZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgYWxyZWFkeVNlbGVjdGVkID0gKGVudHJ5ID09PSB0aGlzLmRvbVNlbGVjdGVkKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0T25DbGljaylcclxuICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoZW50cnkpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5vblNlbGVjdClcclxuICAgICAgICAgICAgdGhpcy5vblNlbGVjdChlbnRyeSk7XHJcblxyXG4gICAgICAgIGlmIChhbHJlYWR5U2VsZWN0ZWQpXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgY2hhbmdlcyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnQgKi9cclxuICAgIHByb3RlY3RlZCB2aXN1YWxTZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLnZpc3VhbFVuc2VsZWN0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQgICAgICAgICAgPSBlbnRyeTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnRhYkluZGV4ID0gNTA7XHJcbiAgICAgICAgZW50cnkuc2V0QXR0cmlidXRlKCdzZWxlY3RlZCcsICd0cnVlJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IHVuc2VsZWN0cyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnQsIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIHZpc3VhbFVuc2VsZWN0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRvbVNlbGVjdGVkKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQucmVtb3ZlQXR0cmlidXRlKCdzZWxlY3RlZCcpO1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQudGFiSW5kZXggPSAtMTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkICAgICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogV2hldGhlciB0aGlzIGNob29zZXIgaXMgYW4gYW5jZXN0b3IgKG93bmVyKSBvZiB0aGUgZ2l2ZW4gZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVsZW1lbnQgdG8gY2hlY2sgaWYgdGhpcyBjaG9vc2VyIGlzIGFuIGFuY2VzdG9yIG9mXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvd25zKHRhcmdldDogSFRNTEVsZW1lbnQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5jb250YWlucyh0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoZSBnaXZlbiBlbGVtZW50IGlzIGEgY2hvb3NhYmxlIG9uZSBvd25lZCBieSB0aGlzIGNob29zZXIgKi9cclxuICAgIHByb3RlY3RlZCBpc0Nob2ljZSh0YXJnZXQ/OiBIVE1MRWxlbWVudCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRhcmdldCAhPT0gdW5kZWZpbmVkXHJcbiAgICAgICAgICAgICYmIHRhcmdldC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdkZCdcclxuICAgICAgICAgICAgJiYgdGhpcy5vd25zKHRhcmdldCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKlxyXG4gKiBTaW5nbGV0b24gaW5zdGFuY2Ugb2YgdGhlIHN0YXRpb24gcGlja2VyLiBTaW5jZSB0aGVyZSBhcmUgZXhwZWN0ZWQgdG8gYmUgMjUwMCtcclxuICogc3RhdGlvbnMsIHRoaXMgZWxlbWVudCB3b3VsZCB0YWtlIHVwIGEgbG90IG9mIG1lbW9yeSBhbmQgZ2VuZXJhdGUgYSBsb3Qgb2YgRE9NLiBTbywgaXRcclxuICogaGFzIHRvIGJlIFwic3dhcHBlZFwiIGJldHdlZW4gcGlja2VycyBhbmQgdmlld3MgdGhhdCB3YW50IHRvIHVzZSBpdC5cclxuICovXHJcbmNsYXNzIFN0YXRpb25DaG9vc2VyIGV4dGVuZHMgQ2hvb3NlclxyXG57XHJcbiAgICAvKiogU2hvcnRjdXQgcmVmZXJlbmNlcyB0byBhbGwgdGhlIGdlbmVyYXRlZCBBLVogc3RhdGlvbiBsaXN0IGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbVN0YXRpb25zIDogRGljdGlvbmFyeTxIVE1MRExpc3RFbGVtZW50PiA9IHt9O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKHBhcmVudCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnRhYkluZGV4ID0gMDtcclxuXHJcbiAgICAgICAgLy8gUG9wdWxhdGVzIHRoZSBsaXN0IG9mIHN0YXRpb25zIGZyb20gdGhlIGRhdGFiYXNlLiBXZSBkbyB0aGlzIGJ5IGNyZWF0aW5nIGEgZGxcclxuICAgICAgICAvLyBlbGVtZW50IGZvciBlYWNoIGxldHRlciBvZiB0aGUgYWxwaGFiZXQsIGNyZWF0aW5nIGEgZHQgZWxlbWVudCBoZWFkZXIsIGFuZCB0aGVuXHJcbiAgICAgICAgLy8gcG9wdWxhdGluZyB0aGUgZGwgd2l0aCBzdGF0aW9uIG5hbWUgZGQgY2hpbGRyZW4uXHJcbiAgICAgICAgT2JqZWN0LmtleXMoUkFHLmRhdGFiYXNlLnN0YXRpb25zKS5mb3JFYWNoKCB0aGlzLmFkZFN0YXRpb24uYmluZCh0aGlzKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXR0YWNoZXMgdGhpcyBjb250cm9sIHRvIHRoZSBnaXZlbiBwYXJlbnQgYW5kIHJlc2V0cyBzb21lIHN0YXRlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwaWNrZXIgUGlja2VyIHRvIGF0dGFjaCB0aGlzIGNvbnRyb2wgdG9cclxuICAgICAqIEBwYXJhbSBvblNlbGVjdCBEZWxlZ2F0ZSB0byBmaXJlIHdoZW4gY2hvb3NpbmcgYSBzdGF0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhdHRhY2gocGlja2VyOiBQaWNrZXIsIG9uU2VsZWN0OiBTZWxlY3REZWxlZ2F0ZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBwaWNrZXIuZG9tRm9ybTtcclxuICAgICAgICBsZXQgY3VycmVudCA9IHRoaXMuZG9tLnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIFJlLWVuYWJsZSBhbGwgZGlzYWJsZWQgZWxlbWVudHNcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5xdWVyeVNlbGVjdG9yQWxsKGBkZFtkaXNhYmxlZF1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaCggdGhpcy5lbmFibGUuYmluZCh0aGlzKSApO1xyXG5cclxuICAgICAgICBpZiAoIWN1cnJlbnQgfHwgY3VycmVudCAhPT0gcGFyZW50KVxyXG4gICAgICAgICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5kb20pO1xyXG5cclxuICAgICAgICB0aGlzLnZpc3VhbFVuc2VsZWN0KCk7XHJcbiAgICAgICAgdGhpcy5vblNlbGVjdCA9IG9uU2VsZWN0LmJpbmQocGlja2VyKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUHJlLXNlbGVjdHMgYSBzdGF0aW9uIGVudHJ5IGJ5IGl0cyBjb2RlICovXHJcbiAgICBwdWJsaWMgcHJlc2VsZWN0Q29kZShjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9IHRoaXMuZ2V0QnlDb2RlKGNvZGUpO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGVudHJ5KTtcclxuICAgICAgICBlbnRyeS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFbmFibGVzIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgb3Igc3RhdGlvbiBlbGVtZW50IGZvciBzZWxlY3Rpb24gKi9cclxuICAgIHB1YmxpYyBlbmFibGUoY29kZU9yTm9kZTogc3RyaW5nIHwgSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9ICh0eXBlb2YgY29kZU9yTm9kZSA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgICAgID8gdGhpcy5nZXRCeUNvZGUoY29kZU9yTm9kZSlcclxuICAgICAgICAgICAgOiBjb2RlT3JOb2RlO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGVudHJ5LnJlbW92ZUF0dHJpYnV0ZSgnZGlzYWJsZWQnKTtcclxuICAgICAgICBlbnRyeS50YWJJbmRleCA9IC0xO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIERpc2FibGVzIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgZnJvbSBzZWxlY3Rpb24gKi9cclxuICAgIHB1YmxpYyBkaXNhYmxlKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gdGhpcy5nZXRCeUNvZGUoY29kZSk7XHJcbiAgICAgICAgbGV0IG5leHQgID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGVudHJ5LCAxKTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBlbnRyeS5zZXRBdHRyaWJ1dGUoJ2Rpc2FibGVkJywgJycpO1xyXG4gICAgICAgIGVudHJ5LnJlbW92ZUF0dHJpYnV0ZSgndGFiaW5kZXgnKTtcclxuICAgICAgICBlbnRyeS50aXRsZSA9ICcnO1xyXG5cclxuICAgICAgICAvLyBTaGlmdCBmb2N1cyB0byBuZXh0IGF2YWlsYWJsZSBlbGVtZW50LCBmb3Iga2V5Ym9hcmQgbmF2aWdhdGlvblxyXG4gICAgICAgIGlmIChuZXh0KVxyXG4gICAgICAgICAgICBuZXh0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgYSBzdGF0aW9uJ3MgY2hvaWNlIGVsZW1lbnQgYnkgaXRzIGNvZGUgKi9cclxuICAgIHByaXZhdGUgZ2V0QnlDb2RlKGNvZGU6IHN0cmluZykgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmlucHV0Q2hvaWNlc1xyXG4gICAgICAgICAgICAucXVlcnlTZWxlY3RvcihgZGRbZGF0YS1jb2RlPSR7Y29kZX1dYCkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgKi9cclxuICAgIHByaXZhdGUgYWRkU3RhdGlvbihjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gUkFHLmRhdGFiYXNlLnN0YXRpb25zW2NvZGVdO1xyXG4gICAgICAgIGxldCBsZXR0ZXIgID0gc3RhdGlvblswXTtcclxuICAgICAgICBsZXQgZ3JvdXAgICA9IHRoaXMuZG9tU3RhdGlvbnNbbGV0dGVyXTtcclxuXHJcbiAgICAgICAgaWYgKCFncm91cClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBoZWFkZXIgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkdCcpO1xyXG4gICAgICAgICAgICBoZWFkZXIuaW5uZXJUZXh0ID0gbGV0dGVyLnRvVXBwZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGhlYWRlci50YWJJbmRleCAgPSAtMTtcclxuXHJcbiAgICAgICAgICAgIGdyb3VwID0gdGhpcy5kb21TdGF0aW9uc1tsZXR0ZXJdID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGwnKTtcclxuICAgICAgICAgICAgZ3JvdXAudGFiSW5kZXggPSA1MDtcclxuXHJcbiAgICAgICAgICAgIGdyb3VwLnNldEF0dHJpYnV0ZSgnZ3JvdXAnLCAnJyk7XHJcbiAgICAgICAgICAgIGdyb3VwLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmFwcGVuZENoaWxkKGdyb3VwKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBlbnRyeSAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcbiAgICAgICAgZW50cnkuZGF0YXNldFsnY29kZSddID0gY29kZTtcclxuICAgICAgICBlbnRyeS5pbm5lclRleHQgICAgICAgPSBSQUcuZGF0YWJhc2Uuc3RhdGlvbnNbY29kZV07XHJcbiAgICAgICAgZW50cnkudGl0bGUgICAgICAgICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICAgICAgZW50cnkudGFiSW5kZXggICAgICAgID0gLTE7XHJcblxyXG4gICAgICAgIGdyb3VwLmFwcGVuZENoaWxkKGVudHJ5KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFN0YXRpb24gbGlzdCBpdGVtIHRoYXQgY2FuIGJlIGRyYWdnZWQgYW5kIGRyb3BwZWQgKi9cclxuY2xhc3MgU3RhdGlvbkxpc3RJdGVtXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSwgZm9yIGVhY2ggaXRlbSBjcmVhdGVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFICAgID0gRE9NLnJlcXVpcmUoJyNzdGF0aW9uTGlzdEl0ZW1UZW1wbGF0ZScpO1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5pZCA9ICcnO1xyXG5cclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBpdGVtJ3MgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHN0YXRpb24gbGlzdCBpdGVtLCBtZWFudCBmb3IgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gY3JlYXRlIHRoaXMgaXRlbSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGNvZGU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICBpZiAoIVN0YXRpb25MaXN0SXRlbS5URU1QTEFURSlcclxuICAgICAgICAgICAgU3RhdGlvbkxpc3RJdGVtLmluaXQoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgICAgID0gU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICB0aGlzLmRvbS5pbm5lclRleHQgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlLCBmYWxzZSk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmRhdGFzZXRbJ2NvZGUnXSA9IGNvZGU7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBCYXNlIGNsYXNzIGZvciBwaWNrZXIgdmlld3MgKi9cclxuYWJzdHJhY3QgY2xhc3MgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBET00gZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbSAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGZvcm0gRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb21Gb3JtICAgOiBIVE1MRm9ybUVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgaGVhZGVyIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb21IZWFkZXIgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBHZXRzIHRoZSBuYW1lIG9mIHRoZSBYTUwgdGFnIHRoaXMgcGlja2VyIGhhbmRsZXMgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSB4bWxUYWcgICAgOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlIGVsZW1lbnQgYmVpbmcgZWRpdGVkIGJ5IHRoaXMgcGlja2VyICovXHJcbiAgICBwcm90ZWN0ZWQgZG9tRWRpdGluZz8gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBwaWNrZXIgdG8gaGFuZGxlIHRoZSBnaXZlbiBwaHJhc2UgZWxlbWVudCB0eXBlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB4bWxUYWcgTmFtZSBvZiB0aGUgWE1MIHRhZyB0aGlzIHBpY2tlciB3aWxsIGhhbmRsZS5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKHhtbFRhZzogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICAgID0gRE9NLnJlcXVpcmUoYCMke3htbFRhZ31QaWNrZXJgKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0gICA9IERPTS5yZXF1aXJlKCdmb3JtJywgICB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIgPSBET00ucmVxdWlyZSgnaGVhZGVyJywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMueG1sVGFnICAgID0geG1sVGFnO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25jaGFuZ2UgID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmlucHV0ICAgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uY2xpY2sgICA9IHRoaXMub25DbGljay5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmtleWRvd24gPSB0aGlzLm9uSW5wdXQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25zdWJtaXQgID0gdGhpcy5vblN1Ym1pdC5iaW5kKHRoaXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2FsbGVkIHdoZW4gZm9ybSBmaWVsZHMgY2hhbmdlLiBUaGUgaW1wbGVtZW50aW5nIHBpY2tlciBzaG91bGQgdXBkYXRlIGFsbCBsaW5rZWRcclxuICAgICAqIGVsZW1lbnRzIChlLmcuIG9mIHNhbWUgdHlwZSkgd2l0aCB0aGUgbmV3IGRhdGEgaGVyZS5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uQ2hhbmdlKGV2OiBFdmVudCkgOiB2b2lkO1xyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiBhIG1vdXNlIGNsaWNrIGhhcHBlbnMgYW55d2hlcmUgaW4gb3Igb24gdGhlIHBpY2tlcidzIGZvcm0gKi9cclxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIGEga2V5IGlzIHByZXNzZWQgd2hpbHN0IHRoZSBwaWNrZXIncyBmb3JtIGlzIGZvY3VzZWQgKi9cclxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxsZWQgd2hlbiBFTlRFUiBpcyBwcmVzc2VkIHdoaWxzdCBhIGZvcm0gY29udHJvbCBvZiB0aGUgcGlja2VyIGlzIGZvY3VzZWQuXHJcbiAgICAgKiBCeSBkZWZhdWx0LCB0aGlzIHdpbGwgdHJpZ2dlciB0aGUgb25DaGFuZ2UgaGFuZGxlciBhbmQgY2xvc2UgdGhlIGRpYWxvZy5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICB0aGlzLm9uQ2hhbmdlKGV2KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBPcGVuIHRoaXMgcGlja2VyIGZvciBhIGdpdmVuIHBocmFzZSBlbGVtZW50LiBUaGUgaW1wbGVtZW50aW5nIHBpY2tlciBzaG91bGQgZmlsbFxyXG4gICAgICogaXRzIGZvcm0gZWxlbWVudHMgd2l0aCBkYXRhIGZyb20gdGhlIGN1cnJlbnQgc3RhdGUgYW5kIHRhcmdldGVkIGVsZW1lbnQgaGVyZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSB0YXJnZXQgUGhyYXNlIGVsZW1lbnQgdGhhdCB0aGlzIHBpY2tlciBpcyBiZWluZyBvcGVuZWQgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyA9IHRhcmdldDtcclxuICAgICAgICB0aGlzLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIEZpeCBrZXlib2FyZCBzdGF5aW5nIG9wZW4gaW4gaU9TIG9uIGNsb3NlXHJcbiAgICAgICAgRE9NLmJsdXJBY3RpdmUodGhpcy5kb20pO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9zaXRpb25zIHRoaXMgcGlja2VyIHJlbGF0aXZlIHRvIHRoZSB0YXJnZXQgcGhyYXNlIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyBsYXlvdXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuZG9tRWRpdGluZylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgdGFyZ2V0UmVjdCA9IHRoaXMuZG9tRWRpdGluZy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBsZXQgZnVsbFdpZHRoICA9IHRoaXMuZG9tLmNsYXNzTGlzdC5jb250YWlucygnZnVsbFdpZHRoJyk7XHJcbiAgICAgICAgbGV0IGlzTW9kYWwgICAgPSB0aGlzLmRvbS5jbGFzc0xpc3QuY29udGFpbnMoJ21vZGFsJyk7XHJcbiAgICAgICAgbGV0IGRvY1cgICAgICAgPSBkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoO1xyXG4gICAgICAgIGxldCBkb2NIICAgICAgID0gZG9jdW1lbnQuYm9keS5jbGllbnRIZWlnaHQ7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1ggICAgPSAodGFyZ2V0UmVjdC5sZWZ0ICAgfCAwKSAtIDg7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1kgICAgPSAgdGFyZ2V0UmVjdC5ib3R0b20gfCAwO1xyXG4gICAgICAgIGxldCBkaWFsb2dXICAgID0gKHRhcmdldFJlY3Qud2lkdGggIHwgMCkgKyAxNjtcclxuXHJcbiAgICAgICAgLy8gQWRqdXN0IGlmIGhvcml6b250YWxseSBvZmYgc2NyZWVuXHJcbiAgICAgICAgaWYgKCFmdWxsV2lkdGggJiYgIWlzTW9kYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBGb3JjZSBmdWxsIHdpZHRoIG9uIG1vYmlsZVxyXG4gICAgICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS53aWR0aCA9IGAxMDAlYDtcclxuXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dYID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLndpZHRoICAgID0gYGluaXRpYWxgO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUubWluV2lkdGggPSBgJHtkaWFsb2dXfXB4YDtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoZGlhbG9nWCArIHRoaXMuZG9tLm9mZnNldFdpZHRoID4gZG9jVylcclxuICAgICAgICAgICAgICAgICAgICBkaWFsb2dYID0gKHRhcmdldFJlY3QucmlnaHQgfCAwKSAtIHRoaXMuZG9tLm9mZnNldFdpZHRoICsgODtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBpY2tlcnMgdGhhdCBpbnN0ZWFkIHRha2UgdXAgdGhlIHdob2xlIGRpc3BsYXkuIENTUyBpc24ndCB1c2VkIGhlcmUsXHJcbiAgICAgICAgLy8gYmVjYXVzZSBwZXJjZW50YWdlLWJhc2VkIGxlZnQvdG9wIGNhdXNlcyBzdWJwaXhlbCBpc3N1ZXMgb24gQ2hyb21lLlxyXG4gICAgICAgIGlmIChpc01vZGFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZGlhbG9nWCA9IERPTS5pc01vYmlsZSA/IDAgOlxyXG4gICAgICAgICAgICAgICAgKCAoZG9jVyAgKiAwLjEpIC8gMiApIHwgMDtcclxuXHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSBET00uaXNNb2JpbGUgPyAwIDpcclxuICAgICAgICAgICAgICAgICggKGRvY0ggKiAwLjEpIC8gMiApIHwgMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsYW1wIHRvIHRvcCBlZGdlIG9mIGRvY3VtZW50XHJcbiAgICAgICAgZWxzZSBpZiAoZGlhbG9nWSA8IDApXHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSAwO1xyXG5cclxuICAgICAgICAvLyBBZGp1c3QgaWYgdmVydGljYWxseSBvZmYgc2NyZWVuXHJcbiAgICAgICAgZWxzZSBpZiAoZGlhbG9nWSArIHRoaXMuZG9tLm9mZnNldEhlaWdodCA+IGRvY0gpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBkaWFsb2dZID0gKHRhcmdldFJlY3QudG9wIHwgMCkgLSB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgKyAxO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LmFkZCgnYmVsb3cnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2Fib3ZlJyk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBzdGlsbCBvZmYtc2NyZWVuLCBjbGFtcCB0byBib3R0b21cclxuICAgICAgICAgICAgaWYgKGRpYWxvZ1kgKyB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgPiBkb2NIKVxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWSA9IGRvY0ggLSB0aGlzLmRvbS5vZmZzZXRIZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICAvLyBDbGFtcCB0byB0b3AgZWRnZSBvZiBkb2N1bWVudC4gTGlrZWx5IGhhcHBlbnMgaWYgdGFyZ2V0IGVsZW1lbnQgaXMgbGFyZ2UuXHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dZIDwgMClcclxuICAgICAgICAgICAgICAgIGRpYWxvZ1kgPSAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LmFkZCgnYWJvdmUnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2JlbG93Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmRvbS5zdHlsZS5sZWZ0ID0gKGZ1bGxXaWR0aCA/IDAgOiBkaWFsb2dYKSArICdweCc7XHJcbiAgICAgICAgdGhpcy5kb20uc3R5bGUudG9wICA9IGRpYWxvZ1kgKyAncHgnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXR1cm5zIHRydWUgaWYgYW4gZWxlbWVudCBpbiB0aGlzIHBpY2tlciBjdXJyZW50bHkgaGFzIGZvY3VzICovXHJcbiAgICBwdWJsaWMgaGFzRm9jdXMoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20uY29udGFpbnMoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGNvYWNoIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgQ29hY2hQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGxldHRlciBkcm9wLWRvd24gaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExldHRlciA6IEhUTUxTZWxlY3RFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgY29hY2ggZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2NvYWNoJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIgPSBET00ucmVxdWlyZSgnc2VsZWN0JywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDI2OyBpKyspXHJcbiAgICAgICAgICAgIERPTS5hZGRPcHRpb24odGhpcy5pbnB1dExldHRlciwgTC5MRVRURVJTW2ldLCBMLkxFVFRFUlNbaV0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgdGFyZ2V0IGNvbnRleHQncyBjb2FjaCBsZXR0ZXIgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9DT0FDSCh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gUkFHLnN0YXRlLmdldENvYWNoKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBjb2FjaCBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX0NPQUNIX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0Q29hY2godGhpcy5jdXJyZW50Q3R4LCB0aGlzLmlucHV0TGV0dGVyLnZhbHVlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9Y29hY2hdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5pbnB1dExldHRlci52YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBleGN1c2UgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBFeGN1c2VQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdleGN1c2UnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfRVhDVVNFKCk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5leGN1c2VzLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIGV4Y3VzZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBleGN1c2VcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KFJBRy5zdGF0ZS5leGN1c2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgZXhjdXNlIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlLmV4Y3VzZSA9IGVudHJ5LmlubmVyVGV4dDtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCgnZXhjdXNlJywgUkFHLnN0YXRlLmV4Y3VzZSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGludGVnZXIgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBJbnRlZ2VyUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBudW1lcmljYWwgaW5wdXQgc3Bpbm5lciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dERpZ2l0IDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBvcHRpb25hbCBzdWZmaXggbGFiZWwgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tTGFiZWwgICA6IEhUTUxMYWJlbEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHg/IDogc3RyaW5nO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvcHRpb25hbCBzaW5ndWxhciBzdWZmaXggZm9yIHRoZSBjdXJyZW50IGludGVnZXIgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHNpbmd1bGFyPyAgIDogc3RyaW5nO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvcHRpb25hbCBwbHVyYWwgc3VmZml4IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBwbHVyYWw/ICAgICA6IHN0cmluZztcclxuICAgIC8qKiBXaGV0aGVyIHRoZSBjdXJyZW50IGludGVnZXIgYmVpbmcgZWRpdGVkIHdhbnRzIHdvcmQgZGlnaXRzICovXHJcbiAgICBwcml2YXRlIHdvcmRzPyAgICAgIDogYm9vbGVhbjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdpbnRlZ2VyJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdCA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUxhYmVsICAgPSBET00ucmVxdWlyZSgnbGFiZWwnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIC8vIGlPUyBuZWVkcyBkaWZmZXJlbnQgdHlwZSBhbmQgcGF0dGVybiB0byBzaG93IGEgbnVtZXJpY2FsIGtleWJvYXJkXHJcbiAgICAgICAgaWYgKERPTS5pc2lPUylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC50eXBlICAgID0gJ3RlbCc7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5wYXR0ZXJuID0gJ1swLTldKyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgdGFyZ2V0IGNvbnRleHQncyBpbnRlZ2VyIGRhdGEgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLnNpbmd1bGFyICAgPSB0YXJnZXQuZGF0YXNldFsnc2luZ3VsYXInXTtcclxuICAgICAgICB0aGlzLnBsdXJhbCAgICAgPSB0YXJnZXQuZGF0YXNldFsncGx1cmFsJ107XHJcbiAgICAgICAgdGhpcy53b3JkcyAgICAgID0gUGFyc2UuYm9vbGVhbih0YXJnZXQuZGF0YXNldFsnd29yZHMnXSB8fCAnZmFsc2UnKTtcclxuXHJcbiAgICAgICAgbGV0IHZhbHVlID0gUkFHLnN0YXRlLmdldEludGVnZXIodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgaWYgICAgICAodGhpcy5zaW5ndWxhciAmJiB2YWx1ZSA9PT0gMSlcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnNpbmd1bGFyO1xyXG4gICAgICAgIGVsc2UgaWYgKHRoaXMucGx1cmFsICYmIHZhbHVlICE9PSAxKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMucGx1cmFsO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSAnJztcclxuXHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfSU5URUdFUih0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC52YWx1ZSAgICA9IHZhbHVlLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIGludGVnZXIgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9JTlRfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIC8vIENhbid0IHVzZSB2YWx1ZUFzTnVtYmVyIGR1ZSB0byBpT1MgaW5wdXQgdHlwZSB3b3JrYXJvdW5kc1xyXG4gICAgICAgIGxldCBpbnQgICAgPSBwYXJzZUludCh0aGlzLmlucHV0RGlnaXQudmFsdWUpO1xyXG4gICAgICAgIGxldCBpbnRTdHIgPSAodGhpcy53b3JkcylcclxuICAgICAgICAgICAgPyBMLkRJR0lUU1tpbnRdIHx8IGludC50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogaW50LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBpbnZhbGlkIHZhbHVlc1xyXG4gICAgICAgIGlmICggaXNOYU4oaW50KSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSAnJztcclxuXHJcbiAgICAgICAgaWYgKGludCA9PT0gMSAmJiB0aGlzLnNpbmd1bGFyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHt0aGlzLnNpbmd1bGFyfWA7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5zaW5ndWxhcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHRoaXMucGx1cmFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHt0aGlzLnBsdXJhbH1gO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMucGx1cmFsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldEludGVnZXIodGhpcy5jdXJyZW50Q3R4LCBpbnQpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1pbnRlZ2VyXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IGludFN0cik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBuYW1lZCB0cmFpbiBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIE5hbWVkUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignbmFtZWQnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfTkFNRUQoKTtcclxuXHJcbiAgICAgICAgUkFHLmRhdGFiYXNlLm5hbWVkLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIC8vIFByZS1zZWxlY3QgdGhlIGN1cnJlbnRseSB1c2VkIG5hbWVcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KFJBRy5zdGF0ZS5uYW1lZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBuYW1lZCBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5uYW1lZCA9IGVudHJ5LmlubmVyVGV4dDtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCgnbmFtZWQnLCBSQUcuc3RhdGUubmFtZWQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBwaHJhc2VzZXQgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBQaHJhc2VzZXRQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIHJlZmVyZW5jZSB0YWcgZm9yIHRoZSBjdXJyZW50IHBocmFzZXNldCBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50UmVmPyA6IHN0cmluZztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdwaHJhc2VzZXQnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHBocmFzZXNldCdzIGxpc3Qgb2YgcGhyYXNlcyAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICBsZXQgcmVmID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBpZHggPSBwYXJzZUludCggRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2lkeCcpICk7XHJcblxyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZik7XHJcblxyXG4gICAgICAgIGlmICghcGhyYXNlc2V0KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1BTRVRfVU5LTk9XTihyZWYpICk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFJlZiAgICAgICAgICA9IHJlZjtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9QSFJBU0VTRVQocmVmKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLmNsZWFyKCk7XHJcblxyXG4gICAgICAgIC8vIEZvciBlYWNoIHBocmFzZSwgd2UgbmVlZCB0byBydW4gaXQgdGhyb3VnaCB0aGUgcGhyYXNlciB1c2luZyB0aGUgY3VycmVudCBzdGF0ZVxyXG4gICAgICAgIC8vIHRvIGdlbmVyYXRlIFwicHJldmlld3NcIiBvZiBob3cgdGhlIHBocmFzZSB3aWxsIGxvb2suXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaHJhc2VzZXQuY2hpbGRyZW4ubGVuZ3RoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcGhyYXNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuXHJcbiAgICAgICAgICAgIERPTS5jbG9uZUludG8ocGhyYXNlc2V0LmNoaWxkcmVuW2ldIGFzIEhUTUxFbGVtZW50LCBwaHJhc2UpO1xyXG4gICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKHBocmFzZSk7XHJcblxyXG4gICAgICAgICAgICBwaHJhc2UuaW5uZXJUZXh0ICAgPSBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHBocmFzZSk7XHJcbiAgICAgICAgICAgIHBocmFzZS5kYXRhc2V0LmlkeCA9IGkudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5hZGRSYXcocGhyYXNlLCBpID09PSBpZHgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHBocmFzZXNldCBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UmVmKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1BTRVRfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIGxldCBpZHggPSBwYXJzZUludChlbnRyeS5kYXRhc2V0WydpZHgnXSEpO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0UGhyYXNlc2V0SWR4KHRoaXMuY3VycmVudFJlZiwgaWR4KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5yZWZyZXNoUGhyYXNlc2V0KHRoaXMuY3VycmVudFJlZik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBsYXRmb3JtIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgUGxhdGZvcm1QaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG51bWVyaWNhbCBpbnB1dCBzcGlubmVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0RGlnaXQgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBsZXR0ZXIgZHJvcC1kb3duIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMZXR0ZXIgOiBIVE1MU2VsZWN0RWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdwbGF0Zm9ybScpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQgICAgICAgICAgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlciAgICAgICAgID0gRE9NLnJlcXVpcmUoJ3NlbGVjdCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9QTEFURk9STSgpO1xyXG5cclxuICAgICAgICAvLyBpT1MgbmVlZHMgZGlmZmVyZW50IHR5cGUgYW5kIHBhdHRlcm4gdG8gc2hvdyBhIG51bWVyaWNhbCBrZXlib2FyZFxyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQudHlwZSAgICA9ICd0ZWwnO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQucGF0dGVybiA9ICdbMC05XSsnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBwbGF0Zm9ybSBkYXRhICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIGxldCB2YWx1ZSA9IFJBRy5zdGF0ZS5wbGF0Zm9ybTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnZhbHVlICA9IHZhbHVlWzBdO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgPSB2YWx1ZVsxXTtcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgcGxhdGZvcm0gZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBJZ25vcmUgaW52YWxpZCB2YWx1ZXNcclxuICAgICAgICBpZiAoIGlzTmFOKCBwYXJzZUludCh0aGlzLmlucHV0RGlnaXQudmFsdWUpICkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5wbGF0Zm9ybSA9IFt0aGlzLmlucHV0RGlnaXQudmFsdWUsIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWVdO1xyXG5cclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCggJ3BsYXRmb3JtJywgUkFHLnN0YXRlLnBsYXRmb3JtLmpvaW4oJycpICk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzZXJ2aWNlIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU2VydmljZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgc2VydmljZSBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignc2VydmljZScpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuXHJcbiAgICAgICAgUkFHLmRhdGFiYXNlLnNlcnZpY2VzLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIHNlcnZpY2UgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TRVJWSUNFKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIC8vIFByZS1zZWxlY3QgdGhlIGN1cnJlbnRseSB1c2VkIHNlcnZpY2VcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KCBSQUcuc3RhdGUuZ2V0U2VydmljZSh0aGlzLmN1cnJlbnRDdHgpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBzZXJ2aWNlIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfU0VSVklDRV9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFNlcnZpY2UodGhpcy5jdXJyZW50Q3R4LCBlbnRyeS5pbm5lclRleHQpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1zZXJ2aWNlXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IGVudHJ5LmlubmVyVGV4dCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHN0YXRpb24gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTdGF0aW9uUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBzaGFyZWQgc3RhdGlvbiBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgY2hvb3NlciA6IFN0YXRpb25DaG9vc2VyO1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgc3RhdGlvbiBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuICAgIC8qKiBIb2xkcyB0aGUgb25PcGVuIGRlbGVnYXRlIGZvciBTdGF0aW9uUGlja2VyIG9yIGZvciBTdGF0aW9uTGlzdFBpY2tlciAqL1xyXG4gICAgcHJvdGVjdGVkIG9uT3BlbiAgICAgOiAodGFyZ2V0OiBIVE1MRWxlbWVudCkgPT4gdm9pZDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IodGFnOiBzdHJpbmcgPSAnc3RhdGlvbicpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIodGFnKTtcclxuXHJcbiAgICAgICAgaWYgKCFTdGF0aW9uUGlja2VyLmNob29zZXIpXHJcbiAgICAgICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3NlciA9IG5ldyBTdGF0aW9uQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG5cclxuICAgICAgICB0aGlzLm9uT3BlbiA9IHRoaXMub25TdGF0aW9uUGlja2VyT3Blbi5iaW5kKHRoaXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaXJlcyB0aGUgb25PcGVuIGRlbGVnYXRlIHJlZ2lzdGVyZWQgZm9yIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcbiAgICAgICAgdGhpcy5vbk9wZW4odGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQXR0YWNoZXMgdGhlIHN0YXRpb24gY2hvb3NlciBhbmQgZm9jdXNlcyBpdCBvbnRvIHRoZSBjdXJyZW50IGVsZW1lbnQncyBzdGF0aW9uICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdGF0aW9uUGlja2VyT3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgY2hvb3NlciAgICAgPSBTdGF0aW9uUGlja2VyLmNob29zZXI7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY2hvb3Nlci5hdHRhY2godGhpcywgdGhpcy5vblNlbGVjdFN0YXRpb24pO1xyXG4gICAgICAgIGNob29zZXIucHJlc2VsZWN0Q29kZSggUkFHLnN0YXRlLmdldFN0YXRpb24odGhpcy5jdXJyZW50Q3R4KSApO1xyXG4gICAgICAgIGNob29zZXIuc2VsZWN0T25DbGljayA9IHRydWU7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NUQVRJT04odGhpcy5jdXJyZW50Q3R4KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgc3RhdGlvbiBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyBTdGF0aW9uUGlja2VyLmNob29zZXIub25DbGljayhldik7IH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyBTdGF0aW9uUGlja2VyLmNob29zZXIub25JbnB1dChldik7IH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyBTdGF0aW9uUGlja2VyLmNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHN0YXRpb24gZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3RTdGF0aW9uKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ID0gYFtkYXRhLXR5cGU9c3RhdGlvbl1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gO1xyXG4gICAgICAgIGxldCBjb2RlICA9IGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSE7XHJcbiAgICAgICAgbGV0IG5hbWUgID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSwgdHJ1ZSk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTdGF0aW9uKHRoaXMuY3VycmVudEN0eCwgY29kZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KHF1ZXJ5KVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBuYW1lKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInN0YXRpb25QaWNrZXIudHNcIi8+XHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi8uLi92ZW5kb3IvZHJhZ2dhYmxlLmQudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHN0YXRpb24gbGlzdCBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFN0YXRpb25MaXN0UGlja2VyIGV4dGVuZHMgU3RhdGlvblBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY29udGFpbmVyIGZvciB0aGUgbGlzdCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUxpc3QgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbW9iaWxlLW9ubHkgYWRkIHN0YXRpb24gYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkFkZCAgICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbW9iaWxlLW9ubHkgY2xvc2UgcGlja2VyIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5DbG9zZSAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGRyb3Agem9uZSBmb3IgZGVsZXRpbmcgc3RhdGlvbiBlbGVtZW50cyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21EZWwgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGFjdHVhbCBzb3J0YWJsZSBsaXN0IG9mIHN0YXRpb25zICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGlzdCAgICA6IEhUTUxETGlzdEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHBsYWNlaG9sZGVyIHNob3duIGlmIHRoZSBsaXN0IGlzIGVtcHR5ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUVtcHR5TGlzdCA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoXCJzdGF0aW9ubGlzdFwiKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21MaXN0ICAgICAgPSBET00ucmVxdWlyZSgnLnN0YXRpb25MaXN0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuYnRuQWRkICAgICAgID0gRE9NLnJlcXVpcmUoJy5hZGRTdGF0aW9uJywgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5idG5DbG9zZSAgICAgPSBET00ucmVxdWlyZSgnLmNsb3NlUGlja2VyJywgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmRvbURlbCAgICAgICA9IERPTS5yZXF1aXJlKCcuZGVsU3RhdGlvbicsICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0ICAgID0gRE9NLnJlcXVpcmUoJ2RsJywgICAgICAgICAgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QgPSBET00ucmVxdWlyZSgncCcsICAgICAgICAgICAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLm9uT3BlbiAgICAgICA9IHRoaXMub25TdGF0aW9uTGlzdFBpY2tlck9wZW4uYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgbmV3IERyYWdnYWJsZS5Tb3J0YWJsZShbdGhpcy5pbnB1dExpc3QsIHRoaXMuZG9tRGVsXSwgeyBkcmFnZ2FibGU6ICdkZCcgfSlcclxuICAgICAgICAgICAgLy8gSGF2ZSB0byB1c2UgdGltZW91dCwgdG8gbGV0IERyYWdnYWJsZSBmaW5pc2ggc29ydGluZyB0aGUgbGlzdFxyXG4gICAgICAgICAgICAub24oICdkcmFnOnN0b3AnLCBldiA9PiBzZXRUaW1lb3V0KCgpID0+IHRoaXMub25EcmFnU3RvcChldiksIDEpIClcclxuICAgICAgICAgICAgLm9uKCAnbWlycm9yOmNyZWF0ZScsIHRoaXMub25EcmFnTWlycm9yQ3JlYXRlLmJpbmQodGhpcykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBvcHVsYXRlcyB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIsIHdpdGggdGhlIHNlbGVjdGVkIGxpc3QuIEJlY2F1c2UgdGhpcyBwaWNrZXJcclxuICAgICAqIGV4dGVuZHMgZnJvbSBTdGF0aW9uTGlzdCwgdGhpcyBoYW5kbGVyIG92ZXJyaWRlcyB0aGUgJ29uT3BlbicgZGVsZWdhdGUgcHJvcGVydHlcclxuICAgICAqIG9mIFN0YXRpb25MaXN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgU3RhdGlvbiBsaXN0IGVkaXRvciBlbGVtZW50IHRvIG9wZW4gZm9yXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvblN0YXRpb25MaXN0UGlja2VyT3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTaW5jZSB3ZSBzaGFyZSB0aGUgc3RhdGlvbiBwaWNrZXIgd2l0aCBTdGF0aW9uTGlzdCwgZ3JhYiBpdFxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5hdHRhY2godGhpcywgdGhpcy5vbkFkZFN0YXRpb24pO1xyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5zZWxlY3RPbkNsaWNrID0gZmFsc2U7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IGVudHJpZXMgICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KHRoaXMuY3VycmVudEN0eCkuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU1RBVElPTkxJU1QodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgLy8gUmVtb3ZlIGFsbCBvbGQgbGlzdCBlbGVtZW50c1xyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0LmlubmVySFRNTCA9ICcnO1xyXG5cclxuICAgICAgICAvLyBGaW5hbGx5LCBwb3B1bGF0ZSBsaXN0IGZyb20gdGhlIGNsaWNrZWQgc3RhdGlvbiBsaXN0IGVsZW1lbnRcclxuICAgICAgICBlbnRyaWVzLmZvckVhY2goIHYgPT4gdGhpcy5hZGQodikgKTtcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWQgeyBzdXBlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbGljayBldmVudHMsIGZvciBjaG9vc2luZyBpdGVtcyAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9uQ2xpY2soZXYpO1xyXG5cclxuICAgICAgICBpZiAoZXYudGFyZ2V0ID09PSB0aGlzLmJ0bkNsb3NlKVxyXG4gICAgICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgLy8gRm9yIG1vYmlsZSB1c2Vycywgc3dpdGNoIHRvIHN0YXRpb24gY2hvb3NlciBzY3JlZW4gaWYgXCJBZGQuLi5cIiB3YXMgY2xpY2tlZFxyXG4gICAgICAgIGlmIChldi50YXJnZXQgPT09IHRoaXMuYnRuQWRkKVxyXG4gICAgICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QuYWRkKCdhZGRpbmdTdGF0aW9uJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMga2V5Ym9hcmQgbmF2aWdhdGlvbiBmb3IgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyICovXHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub25JbnB1dChldik7XHJcblxyXG4gICAgICAgIGxldCBrZXkgICAgID0gZXYua2V5O1xyXG4gICAgICAgIGxldCBmb2N1c2VkID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgLy8gT25seSBoYW5kbGUgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyIGNvbnRyb2xcclxuICAgICAgICBpZiAoICFmb2N1c2VkIHx8ICF0aGlzLmlucHV0TGlzdC5jb250YWlucyhmb2N1c2VkKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGtleWJvYXJkIG5hdmlnYXRpb25cclxuICAgICAgICBpZiAoa2V5ID09PSAnQXJyb3dMZWZ0JyB8fCBrZXkgPT09ICdBcnJvd1JpZ2h0JylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBkaXIgPSAoa2V5ID09PSAnQXJyb3dMZWZ0JykgPyAtMSA6IDE7XHJcbiAgICAgICAgICAgIGxldCBuYXYgPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gZm9jdXNlZCBlbGVtZW50XHJcbiAgICAgICAgICAgIGlmIChmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRMaXN0KVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxldmFudCB0byBiZWdpbm5pbmcgb3IgZW5kIG9mIGNvbnRhaW5lclxyXG4gICAgICAgICAgICBlbHNlIGlmIChkaXIgPT09IC0xKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmxhc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBpZiAobmF2KSBuYXYuZm9jdXMoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBlbnRyeSBkZWxldGlvblxyXG4gICAgICAgIGlmIChrZXkgPT09ICdEZWxldGUnIHx8IGtleSA9PT0gJ0JhY2tzcGFjZScpXHJcbiAgICAgICAgaWYgKGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dExpc3QpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBGb2N1cyBvbiBuZXh0IGVsZW1lbnQgb3IgcGFyZW50IG9uIGRlbGV0ZVxyXG4gICAgICAgICAgICBsZXQgbmV4dCA9IGZvY3VzZWQucHJldmlvdXNFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IGZvY3VzZWQubmV4dEVsZW1lbnRTaWJsaW5nICAgICBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IHRoaXMuaW5wdXRMaXN0O1xyXG5cclxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZm9jdXNlZCk7XHJcbiAgICAgICAgICAgIG5leHQuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXIgZm9yIHdoZW4gYSBzdGF0aW9uIGlzIGNob3NlbiAqL1xyXG4gICAgcHJpdmF0ZSBvbkFkZFN0YXRpb24oZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgbmV3RW50cnkgPSB0aGlzLmFkZChlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuXHJcbiAgICAgICAgLy8gU3dpdGNoIGJhY2sgdG8gYnVpbGRlciBzY3JlZW4sIGlmIG9uIG1vYmlsZVxyXG4gICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5yZW1vdmUoJ2FkZGluZ1N0YXRpb24nKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG5cclxuICAgICAgICAvLyBGb2N1cyBvbmx5IGlmIG9uIG1vYmlsZSwgc2luY2UgdGhlIHN0YXRpb24gbGlzdCBpcyBvbiBhIGRlZGljYXRlZCBzY3JlZW5cclxuICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKVxyXG4gICAgICAgICAgICBuZXdFbnRyeS5kb20uZm9jdXMoKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIG5ld0VudHJ5LmRvbS5zY3JvbGxJbnRvVmlldygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaXhlcyBtaXJyb3JzIG5vdCBoYXZpbmcgY29ycmVjdCB3aWR0aCBvZiB0aGUgc291cmNlIGVsZW1lbnQsIG9uIGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvbkRyYWdNaXJyb3JDcmVhdGUoZXY6IERyYWdnYWJsZS5EcmFnRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghZXYuZGF0YS5zb3VyY2UgfHwgIWV2LmRhdGEub3JpZ2luYWxTb3VyY2UpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfU0xfRFJBR19NSVNTSU5HKCkgKTtcclxuXHJcbiAgICAgICAgZXYuZGF0YS5zb3VyY2Uuc3R5bGUud2lkdGggPSBldi5kYXRhLm9yaWdpbmFsU291cmNlLmNsaWVudFdpZHRoICsgJ3B4JztcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBkcmFnZ2FibGUgc3RhdGlvbiBuYW1lIGJlaW5nIGRyb3BwZWQgKi9cclxuICAgIHByaXZhdGUgb25EcmFnU3RvcChldjogRHJhZ2dhYmxlLkRyYWdFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFldi5kYXRhLm9yaWdpbmFsU291cmNlKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmIChldi5kYXRhLm9yaWdpbmFsU291cmNlLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuZG9tRGVsKVxyXG4gICAgICAgICAgICB0aGlzLnJlbW92ZShldi5kYXRhLm9yaWdpbmFsU291cmNlKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGFuZCBhZGRzIGEgbmV3IGVudHJ5IGZvciB0aGUgYnVpbGRlciBsaXN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gY3JlYXRlIGFuIGl0ZW0gZm9yXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYWRkKGNvZGU6IHN0cmluZykgOiBTdGF0aW9uTGlzdEl0ZW1cclxuICAgIHtcclxuICAgICAgICBsZXQgbmV3RW50cnkgPSBuZXcgU3RhdGlvbkxpc3RJdGVtKGNvZGUpO1xyXG5cclxuICAgICAgICAvLyBBZGQgdGhlIG5ldyBlbnRyeSB0byB0aGUgc29ydGFibGUgbGlzdFxyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0LmFwcGVuZENoaWxkKG5ld0VudHJ5LmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XHJcblxyXG4gICAgICAgIC8vIERpc2FibGUgdGhlIGFkZGVkIHN0YXRpb24gaW4gdGhlIGNob29zZXJcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuZGlzYWJsZShjb2RlKTtcclxuXHJcbiAgICAgICAgLy8gRGVsZXRlIGl0ZW0gb24gZG91YmxlIGNsaWNrXHJcbiAgICAgICAgbmV3RW50cnkuZG9tLm9uZGJsY2xpY2sgPSBfID0+IHRoaXMucmVtb3ZlKG5ld0VudHJ5LmRvbSk7XHJcblxyXG4gICAgICAgIHJldHVybiBuZXdFbnRyeTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlbW92ZXMgdGhlIGdpdmVuIHN0YXRpb24gZW50cnkgZWxlbWVudCBmcm9tIHRoZSBidWlsZGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbnRyeSBFbGVtZW50IG9mIHRoZSBzdGF0aW9uIGVudHJ5IHRvIHJlbW92ZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlbW92ZShlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICggIXRoaXMuZG9tTGlzdC5jb250YWlucyhlbnRyeSkgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcignQXR0ZW1wdGVkIHRvIHJlbW92ZSBlbnRyeSBub3Qgb24gc3RhdGlvbiBsaXN0IGJ1aWxkZXInKTtcclxuXHJcbiAgICAgICAgLy8gRW5hYmxlZCB0aGUgcmVtb3ZlZCBzdGF0aW9uIGluIHRoZSBjaG9vc2VyXHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmVuYWJsZShlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuXHJcbiAgICAgICAgZW50cnkucmVtb3ZlKCk7XHJcbiAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuaW5wdXRMaXN0LmNoaWxkcmVuLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHN0YXRpb24gbGlzdCBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjaGlsZHJlbiA9IHRoaXMuaW5wdXRMaXN0LmNoaWxkcmVuO1xyXG5cclxuICAgICAgICAvLyBEb24ndCB1cGRhdGUgaWYgbGlzdCBpcyBlbXB0eVxyXG4gICAgICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPT09IDApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGxpc3QgPSBbXTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBlbnRyeSA9IGNoaWxkcmVuW2ldIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgbGlzdC5wdXNoKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHRleHRMaXN0ID0gU3RyaW5ncy5mcm9tU3RhdGlvbkxpc3QobGlzdC5zbGljZSgpLCB0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIGxldCBxdWVyeSAgICA9IGBbZGF0YS10eXBlPXN0YXRpb25saXN0XVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWA7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTdGF0aW9uTGlzdCh0aGlzLmN1cnJlbnRDdHgsIGxpc3QpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShxdWVyeSlcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGV4dExpc3QpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSB0aW1lIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgVGltZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgdGltZSBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0VGltZTogSFRNTElucHV0RWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHRpbWUgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3RpbWUnKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgdGltZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1RJTUUodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUudmFsdWUgPSBSQUcuc3RhdGUuZ2V0VGltZSh0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHRpbWUgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9USU1FX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0VGltZSh0aGlzLmN1cnJlbnRDdHgsIHRoaXMuaW5wdXRUaW1lLnZhbHVlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9dGltZV1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLmlucHV0VGltZS52YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTGFuZ3VhZ2UgZW50cmllcyBhcmUgdGVtcGxhdGUgZGVsZWdhdGVzICovXHJcbnR5cGUgTGFuZ3VhZ2VFbnRyeSA9ICguLi5wYXJ0czogc3RyaW5nW10pID0+IHN0cmluZyA7XHJcblxyXG5hYnN0cmFjdCBjbGFzcyBCYXNlTGFuZ3VhZ2Vcclxue1xyXG4gICAgW2luZGV4OiBzdHJpbmddIDogTGFuZ3VhZ2VFbnRyeSB8IHN0cmluZyB8IHN0cmluZ1tdO1xyXG5cclxuICAgIC8vIFJBR1xyXG5cclxuICAgIC8qKiBXZWxjb21lIG1lc3NhZ2UsIHNob3duIG9uIG1hcnF1ZWUgb24gZmlyc3QgbG9hZCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgV0VMQ09NRSAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVxdWlyZWQgRE9NIGVsZW1lbnQgaXMgbWlzc2luZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRE9NX01JU1NJTkcgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVxdWlyZWQgZWxlbWVudCBhdHRyaWJ1dGUgaXMgbWlzc2luZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQVRUUl9NSVNTSU5HICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVxdWlyZWQgZGF0YXNldCBlbnRyeSBpcyBtaXNzaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQVRBX01JU1NJTkcgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBCYWQgZGlyZWN0aW9uIGFyZ3VtZW50IGdpdmVuIHRvIGRpcmVjdGlvbmFsIGZ1bmN0aW9uICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBCQURfRElSRUNUSU9OIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBCYWQgYm9vbGVhbiBzdHJpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEJBRF9CT09MRUFOICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFN0YXRlXHJcblxyXG4gICAgLyoqIFN0YXRlIHN1Y2Nlc3NmdWxseSBsb2FkZWQgZnJvbSBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9GUk9NX1NUT1JBR0UgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFN0YXRlIHN1Y2Nlc3NmdWxseSBzYXZlZCB0byBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9UT19TVE9SQUdFICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEluc3RydWN0aW9ucyBmb3IgY29weS9wYXN0aW5nIHNhdmVkIHN0YXRlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9DT1BZX1BBU1RFICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEhlYWRlciBmb3IgZHVtcGVkIHJhdyBzdGF0ZSBKU09OICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9SQVdfSlNPTiAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIENvdWxkIG5vdCBzYXZlIHN0YXRlIHRvIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1NBVkVfRkFJTCAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogTm8gc3RhdGUgd2FzIGF2YWlsYWJsZSB0byBsb2FkICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9TQVZFX01JU1NJTkcgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIE5vbi1leGlzdGVudCBwaHJhc2VzZXQgcmVmZXJlbmNlIHdoZW4gZ2V0dGluZyBmcm9tIHN0YXRlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9OT05FWElTVEFOVF9QSFJBU0VTRVQgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIENvbmZpZ1xyXG5cclxuICAgIC8qKiBDb25maWcgZmFpbGVkIHRvIGxvYWQgZnJvbSBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBDT05GSUdfTE9BRF9GQUlMICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQ29uZmlnIGZhaWxlZCB0byBzYXZlIHRvIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IENPTkZJR19TQVZFX0ZBSUwgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBDb25maWcgZmFpbGVkIHRvIGNsZWFyIGZyb20gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQ09ORklHX1JFU0VUX0ZBSUwgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIERhdGFiYXNlXHJcblxyXG4gICAgLyoqIEdpdmVuIGVsZW1lbnQgaXNuJ3QgYSBwaHJhc2VzZXQgaUZyYW1lICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9FTEVNRU5UX05PVF9QSFJBU0VTRVRfSUZSQU1FIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBVbmtub3duIHN0YXRpb24gY29kZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfVU5LTk9XTl9TVEFUSU9OICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU3RhdGlvbiBjb2RlIHdpdGggYmxhbmsgbmFtZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfRU1QVFlfU1RBVElPTiAgICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUGlja2luZyB0b28gbWFueSBzdGF0aW9uIGNvZGVzIGluIG9uZSBnbyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfVE9PX01BTllfU1RBVElPTlMgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gVG9vbGJhclxyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIHRleHQgZm9yIHRvb2xiYXIgYnV0dG9uc1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9QTEFZICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NUT1AgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU0hVRkZMRSAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TQVZFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX0xPQUQgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU0VUVElOR1MgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIEVkaXRvclxyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIHRleHQgZm9yIGVkaXRvciBlbGVtZW50c1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfQ09BQ0ggICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfRVhDVVNFICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfSU5URUdFUiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfTkFNRUQgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfT1BUX09QRU4gICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfT1BUX0NMT1NFICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfUEhSQVNFU0VUICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfUExBVEZPUk0gICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfU0VSVklDRSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfU1RBVElPTiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfU1RBVElPTkxJU1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfVElNRSAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8qKiBJbml0aWFsIG1lc3NhZ2Ugd2hlbiBzZXR0aW5nIHVwIGVkaXRvciAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX0lOSVQgICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXBsYWNlbWVudCB0ZXh0IGZvciB1bmtub3duIGVkaXRvciBlbGVtZW50cyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX1VOS05PV05fRUxFTUVOVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXBsYWNlbWVudCB0ZXh0IGZvciBlZGl0b3IgcGhyYXNlcyB3aXRoIHVua25vd24gcmVmZXJlbmNlIGlkcyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX1VOS05PV05fUEhSQVNFICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXBsYWNlbWVudCB0ZXh0IGZvciBlZGl0b3IgcGhyYXNlc2V0cyB3aXRoIHVua25vd24gcmVmZXJlbmNlIGlkcyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX1VOS05PV05fUEhSQVNFU0VUIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBQaHJhc2VyXHJcblxyXG4gICAgLyoqIFRvbyBtYW55IGxldmVscyBvZiByZWN1cnNpb24gaW4gdGhlIHBocmFzZXIgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBIUkFTRVJfVE9PX1JFQ1VSU0lWRSA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gUGlja2Vyc1xyXG5cclxuICAgIC8vIEhlYWRlcnMgZm9yIHBpY2tlciBkaWFsb2dzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfQ09BQ0ggICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX0VYQ1VTRSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9JTlRFR0VSICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfTkFNRUQgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1BIUkFTRVNFVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9QTEFURk9STSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfU0VSVklDRSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1NUQVRJT04gICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9TVEFUSU9OTElTVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfVElNRSAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIGFuZCBwbGFjZWhvbGRlciB0ZXh0IGZvciBwaWNrZXIgY29udHJvbHNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfR0VORVJJQ19UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9HRU5FUklDX1BIICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0NPQUNIX1QgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfRVhDVVNFX1QgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9FWENVU0VfUEggICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0VYQ1VTRV9JVEVNX1QgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfSU5UX1QgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9OQU1FRF9UICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX05BTUVEX1BIICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfTkFNRURfSVRFTV9UICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfUEggICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9JVEVNX1QgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QTEFUX05VTUJFUl9UICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BMQVRfTEVUVEVSX1QgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVl9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWX1BIICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZfSVRFTV9UICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU1RBVElPTl9UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TVEFUSU9OX1BIICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NUQVRJT05fSVRFTV9UIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQUREICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9BRERfVCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0NMT1NFICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQ0xPU0VfVCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9FTVBUWSAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RSQUdfVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfREVMRVRFICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9ERUxFVEVfVCAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0lURU1fVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfVElNRV9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8qKiBDb2FjaCBwaWNrZXIncyBvbkNoYW5nZSBmaXJlZCB3aXRob3V0IGNvbnRleHQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfQ09BQ0hfTUlTU0lOR19TVEFURSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBJbnRlZ2VyIHBpY2tlcidzIG9uQ2hhbmdlIGZpcmVkIHdpdGhvdXQgY29udGV4dCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9JTlRfTUlTU0lOR19TVEFURSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFBocmFzZXNldCBwaWNrZXIncyBvblNlbGVjdCBmaXJlZCB3aXRob3V0IHJlZmVyZW5jZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX01JU1NJTkdfU1RBVEUgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFNlcnZpY2UgcGlja2VyJ3Mgb25TZWxlY3QgZmlyZWQgd2l0aG91dCByZWZlcmVuY2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVklDRV9NSVNTSU5HX1NUQVRFIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTZXJ2aWNlIHBpY2tlcidzIG9uQ2hhbmdlIGZpcmVkIHdpdGhvdXQgcmVmZXJlbmNlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1RJTUVfTUlTU0lOR19TVEFURSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUGhyYXNlc2V0IHBpY2tlciBvcGVuZWQgZm9yIHVua25vd24gcGhyYXNlc2V0ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfVU5LTk9XTiAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogRHJhZyBtaXJyb3IgY3JlYXRlIGV2ZW50IGluIHN0YXRpb24gbGlzdCBtaXNzaW5nIHN0YXRlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RSQUdfTUlTU0lORyAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gU2V0dGluZ3NcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSBhbmQgbGFiZWwgdGV4dCBmb3Igc2V0dGluZ3MgZWxlbWVudHNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfQ09ORklSTSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX0NPTkZJUk1fVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9ET05FICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU0FWRSAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NBVkVfVCAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0ggICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX0NIT0lDRSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9FTVBUWSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfVk9MICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1BJVENIICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9SQVRFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfVEVTVCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1RFU1RfVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX0xFR0FMICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gVUkgY29udHJvbHNcclxuXHJcbiAgICAvKiogSGVhZGVyIGZvciB0aGUgXCJ0b28gc21hbGxcIiB3YXJuaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBXQVJOX1NIT1JUX0hFQURFUiA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQm9keSB0ZXh0IGZvciB0aGUgXCJ0b28gc21hbGxcIiB3YXJuaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBXQVJOX1NIT1JUICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gTWlzYy4gY29uc3RhbnRzXHJcblxyXG4gICAgLyoqIEFycmF5IG9mIHRoZSBlbnRpcmUgYWxwaGFiZXQgb2YgdGhlIGxhbmd1YWdlLCBmb3IgY29hY2ggbGV0dGVycyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgTEVUVEVSUyA6IHN0cmluZztcclxuICAgIC8qKiBBcnJheSBvZiBudW1iZXJzIGFzIHdvcmRzIChlLmcuIHplcm8sIG9uZSwgdHdvKSwgbWF0Y2hpbmcgdGhlaXIgaW5kZXggKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERJR0lUUyAgOiBzdHJpbmdbXTtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkJhc2VMYW5ndWFnZS50c1wiLz5cclxuXHJcbmNsYXNzIEVuZ2xpc2hMYW5ndWFnZSBleHRlbmRzIEJhc2VMYW5ndWFnZVxyXG57XHJcbiAgICBXRUxDT01FICAgICAgID0gKCkgPT4gJ1dlbGNvbWUgdG8gUmFpbCBBbm5vdW5jZW1lbnQgR2VuZXJhdG9yLic7XHJcbiAgICBET01fTUlTU0lORyAgID0gKHE6IHN0cmluZykgPT4gYFJlcXVpcmVkIERPTSBlbGVtZW50IGlzIG1pc3Npbmc6ICcke3F9J2A7XHJcbiAgICBBVFRSX01JU1NJTkcgID0gKGE6IHN0cmluZykgPT4gYFJlcXVpcmVkIGF0dHJpYnV0ZSBpcyBtaXNzaW5nOiAnJHthfSdgO1xyXG4gICAgREFUQV9NSVNTSU5HICA9IChrOiBzdHJpbmcpID0+IGBSZXF1aXJlZCBkYXRhc2V0IGtleSBpcyBtaXNzaW5nIG9yIGVtcHR5OiAnJHtrfSdgO1xyXG4gICAgQkFEX0RJUkVDVElPTiA9ICh2OiBzdHJpbmcpID0+IGBEaXJlY3Rpb24gbmVlZHMgdG8gYmUgLTEgb3IgMSwgbm90ICcke3Z9J2A7XHJcbiAgICBCQURfQk9PTEVBTiAgID0gKHY6IHN0cmluZykgPT4gYEdpdmVuIHN0cmluZyBkb2VzIG5vdCByZXByZXNlbnQgYSBib29sZWFuOiAnJHt2fSdgO1xyXG5cclxuICAgIFNUQVRFX0ZST01fU1RPUkFHRSAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1N0YXRlIGhhcyBiZWVuIGxvYWRlZCBmcm9tIHN0b3JhZ2UuJztcclxuICAgIFNUQVRFX1RPX1NUT1JBR0UgICAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1N0YXRlIGhhcyBiZWVuIHNhdmVkIHRvIHN0b3JhZ2UsIGFuZCBkdW1wZWQgdG8gY29uc29sZS4nO1xyXG4gICAgU1RBVEVfQ09QWV9QQVNURSAgICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnJWNDb3B5IGFuZCBwYXN0ZSB0aGlzIGluIGNvbnNvbGUgdG8gbG9hZCBsYXRlcjonO1xyXG4gICAgU1RBVEVfUkFXX0pTT04gICAgICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnJWNSYXcgSlNPTiBzdGF0ZTonO1xyXG4gICAgU1RBVEVfU0FWRV9GQUlMICAgICAgICAgICAgID0gKG1zZzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBTb3JyeSwgc3RhdGUgY291bGQgbm90IGJlIHNhdmVkIHRvIHN0b3JhZ2U6ICR7bXNnfS5gO1xyXG4gICAgU1RBVEVfU0FWRV9NSVNTSU5HICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnU29ycnksIG5vIHN0YXRlIHdhcyBmb3VuZCBpbiBzdG9yYWdlLic7XHJcbiAgICBTVEFURV9OT05FWElTVEFOVF9QSFJBU0VTRVQgPSAocjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBBdHRlbXB0ZWQgdG8gZ2V0IGNob3NlbiBpbmRleCBmb3IgcGhyYXNlc2V0ICgke3J9KSB0aGF0IGRvZXNuJ3QgZXhpc3RgO1xyXG5cclxuICAgIENPTkZJR19MT0FEX0ZBSUwgID0gKG1zZzogc3RyaW5nKSA9PiBgQ291bGQgbm90IGxvYWQgc2V0dGluZ3M6ICR7bXNnfWA7XHJcbiAgICBDT05GSUdfU0FWRV9GQUlMICA9IChtc2c6IHN0cmluZykgPT4gYENvdWxkIG5vdCBzYXZlIHNldHRpbmdzOiAke21zZ31gO1xyXG4gICAgQ09ORklHX1JFU0VUX0ZBSUwgPSAobXNnOiBzdHJpbmcpID0+IGBDb3VsZCBub3QgY2xlYXIgc2V0dGluZ3M6ICR7bXNnfWA7XHJcblxyXG4gICAgREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRSA9IChlOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENvbmZpZ3VyZWQgcGhyYXNlc2V0IGVsZW1lbnQgcXVlcnkgKCR7ZX0pIGRvZXMgbm90IHBvaW50IHRvIGFuIGlGcmFtZSBlbWJlZGA7XHJcbiAgICBEQl9VTktOT1dOX1NUQVRJT04gICA9IChjOiBzdHJpbmcpID0+IGBVTktOT1dOIFNUQVRJT046ICR7Y31gO1xyXG4gICAgREJfRU1QVFlfU1RBVElPTiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBTdGF0aW9uIGRhdGFiYXNlIGFwcGVhcnMgdG8gY29udGFpbiBhbiBlbXB0eSBuYW1lIGZvciBjb2RlICcke2N9J2A7XHJcbiAgICBEQl9UT09fTUFOWV9TVEFUSU9OUyA9ICgpID0+ICdQaWNraW5nIHRvbyBtYW55IHN0YXRpb25zIHRoYW4gdGhlcmUgYXJlIGF2YWlsYWJsZSc7XHJcblxyXG4gICAgVE9PTEJBUl9QTEFZICAgICA9ICgpID0+ICdQbGF5IHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NUT1AgICAgID0gKCkgPT4gJ1N0b3AgcGxheWluZyBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TSFVGRkxFICA9ICgpID0+ICdHZW5lcmF0ZSByYW5kb20gcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU0FWRSAgICAgPSAoKSA9PiAnU2F2ZSBzdGF0ZSB0byBzdG9yYWdlJztcclxuICAgIFRPT0xCQVJfTE9BRCAgICAgPSAoKSA9PiAnUmVjYWxsIHN0YXRlIGZyb20gc3RvcmFnZSc7XHJcbiAgICBUT09MQkFSX1NFVFRJTkdTID0gKCkgPT4gJ09wZW4gc2V0dGluZ3MnO1xyXG5cclxuICAgIFRJVExFX0NPQUNIICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgY29hY2ggKCcke2N9JylgO1xyXG4gICAgVElUTEVfRVhDVVNFICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdDbGljayB0byBjaGFuZ2UgdGhpcyBleGN1c2UnO1xyXG4gICAgVElUTEVfSU5URUdFUiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBudW1iZXIgKCcke2N9JylgO1xyXG4gICAgVElUTEVfTkFNRUQgICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgIFwiQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdHJhaW4ncyBuYW1lXCI7XHJcbiAgICBUSVRMRV9PUFRfT1BFTiAgICA9ICh0OiBzdHJpbmcsIHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gb3BlbiB0aGlzIG9wdGlvbmFsICR7dH0gKCcke3J9JylgO1xyXG4gICAgVElUTEVfT1BUX0NMT1NFICAgPSAodDogc3RyaW5nLCByOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNsb3NlIHRoaXMgb3B0aW9uYWwgJHt0fSAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9QSFJBU0VTRVQgICA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGUgcGhyYXNlIHVzZWQgaW4gdGhpcyBzZWN0aW9uICgnJHtyfScpYDtcclxuICAgIFRJVExFX1BMQVRGT1JNICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICBcIkNsaWNrIHRvIGNoYW5nZSB0aGlzIHRyYWluJ3MgcGxhdGZvcm1cIjtcclxuICAgIFRJVExFX1NFUlZJQ0UgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc2VydmljZSAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9TVEFUSU9OICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHN0YXRpb24gKCcke2N9JylgO1xyXG4gICAgVElUTEVfU1RBVElPTkxJU1QgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBzdGF0aW9uIGxpc3QgKCcke2N9JylgO1xyXG4gICAgVElUTEVfVElNRSAgICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyB0aW1lICgnJHtjfScpYDtcclxuXHJcbiAgICBFRElUT1JfSU5JVCAgICAgICAgICAgICAgPSAoKSA9PiAnUGxlYXNlIHdhaXQuLi4nO1xyXG4gICAgRURJVE9SX1VOS05PV05fRUxFTUVOVCAgID0gKG46IHN0cmluZykgPT4gYChVTktOT1dOIFhNTCBFTEVNRU5UOiAke259KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0UgICAgPSAocjogc3RyaW5nKSA9PiBgKFVOS05PV04gUEhSQVNFOiAke3J9KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQgPSAocjogc3RyaW5nKSA9PiBgKFVOS05PV04gUEhSQVNFU0VUOiAke3J9KWA7XHJcblxyXG4gICAgUEhSQVNFUl9UT09fUkVDVVJTSVZFID0gKCkgPT5cclxuICAgICAgICAnVG9vIG1hbnkgbGV2ZWxzIG9mIHJlY3Vyc2lvbiB3aGlsc3QgcHJvY2Vzc2luZyBwaHJhc2UnO1xyXG5cclxuICAgIEhFQURFUl9DT0FDSCAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBjb2FjaCBsZXR0ZXIgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfRVhDVVNFICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGFuIGV4Y3VzZSc7XHJcbiAgICBIRUFERVJfSU5URUdFUiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgbnVtYmVyIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX05BTUVEICAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICAnUGljayBhIG5hbWVkIHRyYWluJztcclxuICAgIEhFQURFUl9QSFJBU0VTRVQgICA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBwaHJhc2UgZm9yIHRoZSAnJHtyfScgc2VjdGlvbmA7XHJcbiAgICBIRUFERVJfUExBVEZPUk0gICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGEgcGxhdGZvcm0nO1xyXG4gICAgSEVBREVSX1NFUlZJQ0UgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHNlcnZpY2UgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfU1RBVElPTiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgc3RhdGlvbiBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9TVEFUSU9OTElTVCA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYEJ1aWxkIGEgc3RhdGlvbiBsaXN0IGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1RJTUUgICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHRpbWUgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcblxyXG4gICAgUF9HRU5FUklDX1QgICAgICA9ICgpID0+ICdMaXN0IG9mIGNob2ljZXMnO1xyXG4gICAgUF9HRU5FUklDX1BIICAgICA9ICgpID0+ICdGaWx0ZXIgY2hvaWNlcy4uLic7XHJcbiAgICBQX0NPQUNIX1QgICAgICAgID0gKCkgPT4gJ0NvYWNoIGxldHRlcic7XHJcbiAgICBQX0VYQ1VTRV9UICAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgZGVsYXkgb3IgY2FuY2VsbGF0aW9uIGV4Y3VzZXMnO1xyXG4gICAgUF9FWENVU0VfUEggICAgICA9ICgpID0+ICdGaWx0ZXIgZXhjdXNlcy4uLic7XHJcbiAgICBQX0VYQ1VTRV9JVEVNX1QgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIGV4Y3VzZSc7XHJcbiAgICBQX0lOVF9UICAgICAgICAgID0gKCkgPT4gJ0ludGVnZXIgdmFsdWUnO1xyXG4gICAgUF9OQU1FRF9UICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHRyYWluIG5hbWVzJztcclxuICAgIFBfTkFNRURfUEggICAgICAgPSAoKSA9PiAnRmlsdGVyIHRyYWluIG5hbWUuLi4nO1xyXG4gICAgUF9OQU1FRF9JVEVNX1QgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBuYW1lJztcclxuICAgIFBfUFNFVF9UICAgICAgICAgPSAoKSA9PiAnTGlzdCBvZiBwaHJhc2VzJztcclxuICAgIFBfUFNFVF9QSCAgICAgICAgPSAoKSA9PiAnRmlsdGVyIHBocmFzZXMuLi4nO1xyXG4gICAgUF9QU0VUX0lURU1fVCAgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBwaHJhc2UnO1xyXG4gICAgUF9QTEFUX05VTUJFUl9UICA9ICgpID0+ICdQbGF0Zm9ybSBudW1iZXInO1xyXG4gICAgUF9QTEFUX0xFVFRFUl9UICA9ICgpID0+ICdPcHRpb25hbCBwbGF0Zm9ybSBsZXR0ZXInO1xyXG4gICAgUF9TRVJWX1QgICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHNlcnZpY2UgbmFtZXMnO1xyXG4gICAgUF9TRVJWX1BIICAgICAgICA9ICgpID0+ICdGaWx0ZXIgc2VydmljZXMuLi4nO1xyXG4gICAgUF9TRVJWX0lURU1fVCAgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBzZXJ2aWNlJztcclxuICAgIFBfU1RBVElPTl9UICAgICAgPSAoKSA9PiAnTGlzdCBvZiBzdGF0aW9uIG5hbWVzJztcclxuICAgIFBfU1RBVElPTl9QSCAgICAgPSAoKSA9PiAnRmlsdGVyIHN0YXRpb25zLi4uJztcclxuICAgIFBfU1RBVElPTl9JVEVNX1QgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IG9yIGFkZCB0aGlzIHN0YXRpb24nO1xyXG4gICAgUF9TTF9BREQgICAgICAgICA9ICgpID0+ICdBZGQgc3RhdGlvbi4uLic7XHJcbiAgICBQX1NMX0FERF9UICAgICAgID0gKCkgPT4gJ0FkZCBzdGF0aW9uIHRvIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0NMT1NFICAgICAgID0gKCkgPT4gJ0Nsb3NlJztcclxuICAgIFBfU0xfQ0xPU0VfVCAgICAgPSAoKSA9PiAnQ2xvc2UgdGhpcyBwaWNrZXInO1xyXG4gICAgUF9TTF9FTVBUWSAgICAgICA9ICgpID0+ICdQbGVhc2UgYWRkIGF0IGxlYXN0IG9uZSBzdGF0aW9uIHRvIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0RSQUdfVCAgICAgID0gKCkgPT4gJ0RyYWdnYWJsZSBzZWxlY3Rpb24gb2Ygc3RhdGlvbnMgZm9yIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0RFTEVURSAgICAgID0gKCkgPT4gJ0Ryb3AgaGVyZSB0byBkZWxldGUnO1xyXG4gICAgUF9TTF9ERUxFVEVfVCAgICA9ICgpID0+ICdEcm9wIHN0YXRpb24gaGVyZSB0byBkZWxldGUgaXQgZnJvbSB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9JVEVNX1QgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ0RyYWcgdG8gcmVvcmRlcjsgZG91YmxlLWNsaWNrIG9yIGRyYWcgaW50byBkZWxldGUgem9uZSB0byByZW1vdmUnO1xyXG4gICAgUF9USU1FX1QgICAgICAgICA9ICgpID0+ICdUaW1lIGVkaXRvcic7XHJcblxyXG4gICAgUF9DT0FDSF9NSVNTSU5HX1NUQVRFICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIGNvYWNoIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfSU5UX01JU1NJTkdfU1RBVEUgICAgID0gKCkgPT4gJ29uQ2hhbmdlIGZpcmVkIGZvciBpbnRlZ2VyIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfUFNFVF9NSVNTSU5HX1NUQVRFICAgID0gKCkgPT4gJ29uU2VsZWN0IGZpcmVkIGZvciBwaHJhc2VzZXQgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9TRVJWSUNFX01JU1NJTkdfU1RBVEUgPSAoKSA9PiAnb25TZWxlY3QgZmlyZWQgZm9yIHNlcnZpY2UgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9USU1FX01JU1NJTkdfU1RBVEUgICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIHRpbWUgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9QU0VUX1VOS05PV04gICAgICAgICAgPSAocjogc3RyaW5nKSA9PiBgUGhyYXNlc2V0ICcke3J9JyBkb2Vzbid0IGV4aXN0YDtcclxuICAgIFBfU0xfRFJBR19NSVNTSU5HICAgICAgID0gKCkgPT4gJ0RyYWdnYWJsZTogTWlzc2luZyBzb3VyY2UgZWxlbWVudHMgZm9yIG1pcnJvciBldmVudCc7XHJcblxyXG4gICAgU1RfUkVTRVQgICAgICAgICAgID0gKCkgPT4gJ1Jlc2V0IHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX1QgICAgICAgICA9ICgpID0+ICdSZXNldCBzZXR0aW5ncyB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9DT05GSVJNICAgPSAoKSA9PiAnQXJlIHlvdSBzdXJlPyc7XHJcbiAgICBTVF9SRVNFVF9DT05GSVJNX1QgPSAoKSA9PiAnQ29uZmlybSByZXNldCB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9ET05FICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTZXR0aW5ncyBoYXZlIGJlZW4gcmVzZXQgdG8gdGhlaXIgZGVmYXVsdHMsIGFuZCBkZWxldGVkIGZyb20gc3RvcmFnZS4nO1xyXG4gICAgU1RfU0FWRSAgICAgICAgICAgID0gKCkgPT4gJ1NhdmUgJiBjbG9zZSc7XHJcbiAgICBTVF9TQVZFX1QgICAgICAgICAgPSAoKSA9PiAnU2F2ZSBhbmQgY2xvc2Ugc2V0dGluZ3MnO1xyXG4gICAgU1RfU1BFRUNIICAgICAgICAgID0gKCkgPT4gJ1NwZWVjaCc7XHJcbiAgICBTVF9TUEVFQ0hfQ0hPSUNFICAgPSAoKSA9PiAnVm9pY2UnO1xyXG4gICAgU1RfU1BFRUNIX0VNUFRZICAgID0gKCkgPT4gJ05vbmUgYXZhaWxhYmxlJztcclxuICAgIFNUX1NQRUVDSF9WT0wgICAgICA9ICgpID0+ICdWb2x1bWUnO1xyXG4gICAgU1RfU1BFRUNIX1BJVENIICAgID0gKCkgPT4gJ1BpdGNoJztcclxuICAgIFNUX1NQRUVDSF9SQVRFICAgICA9ICgpID0+ICdSYXRlJztcclxuICAgIFNUX1NQRUVDSF9URVNUICAgICA9ICgpID0+ICdUZXN0IHNwZWVjaCc7XHJcbiAgICBTVF9TUEVFQ0hfVEVTVF9UICAgPSAoKSA9PiAnUGxheSBhIHNwZWVjaCBzYW1wbGUgd2l0aCB0aGUgY3VycmVudCBzZXR0aW5ncyc7XHJcbiAgICBTVF9MRUdBTCAgICAgICAgICAgPSAoKSA9PiAnTGVnYWwgJiBBY2tub3dsZWRnZW1lbnRzJztcclxuXHJcbiAgICBXQVJOX1NIT1JUX0hFQURFUiA9ICgpID0+ICdcIk1heSBJIGhhdmUgeW91ciBhdHRlbnRpb24gcGxlYXNlLi4uXCInO1xyXG4gICAgV0FSTl9TSE9SVCAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdUaGlzIGRpc3BsYXkgaXMgdG9vIHNob3J0IHRvIHN1cHBvcnQgUkFHLiBQbGVhc2UgbWFrZSB0aGlzIHdpbmRvdyB0YWxsZXIsIG9yJyArXHJcbiAgICAgICAgJyByb3RhdGUgeW91ciBkZXZpY2UgZnJvbSBsYW5kc2NhcGUgdG8gcG9ydHJhaXQuJztcclxuXHJcbiAgICAvLyBUT0RPOiBUaGVzZSBkb24ndCBmaXQgaGVyZTsgdGhpcyBzaG91bGQgZ28gaW4gdGhlIGRhdGFcclxuICAgIExFVFRFUlMgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVonO1xyXG4gICAgRElHSVRTICA9IFtcclxuICAgICAgICAnemVybycsICAgICAnb25lJywgICAgICd0d28nLCAgICAgJ3RocmVlJywgICAgICdmb3VyJywgICAgICdmaXZlJywgICAgJ3NpeCcsXHJcbiAgICAgICAgJ3NldmVuJywgICAgJ2VpZ2h0JywgICAnbmluZScsICAgICd0ZW4nLCAgICAgICAnZWxldmVuJywgICAndHdlbHZlJywgICd0aGlydGVlbicsXHJcbiAgICAgICAgJ2ZvdXJ0ZWVuJywgJ2ZpZnRlZW4nLCAnc2l4dGVlbicsICdzZXZlbnRlZW4nLCAnZWlnaHRlZW4nLCAnbmludGVlbicsICd0d2VudHknXHJcbiAgICBdO1xyXG5cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqXHJcbiAqIEhvbGRzIG1ldGhvZHMgZm9yIHByb2Nlc3NpbmcgZWFjaCB0eXBlIG9mIHBocmFzZSBlbGVtZW50IGludG8gSFRNTCwgd2l0aCBkYXRhIHRha2VuXHJcbiAqIGZyb20gdGhlIGN1cnJlbnQgc3RhdGUuIEVhY2ggbWV0aG9kIHRha2VzIGEgY29udGV4dCBvYmplY3QsIGhvbGRpbmcgZGF0YSBmb3IgdGhlXHJcbiAqIGN1cnJlbnQgWE1MIGVsZW1lbnQgYmVpbmcgcHJvY2Vzc2VkIGFuZCB0aGUgWE1MIGRvY3VtZW50IGJlaW5nIHVzZWQuXHJcbiAqL1xyXG5jbGFzcyBFbGVtZW50UHJvY2Vzc29yc1xyXG57XHJcbiAgICAvKiogRmlsbHMgaW4gY29hY2ggbGV0dGVycyBmcm9tIEEgdG8gWiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb2FjaChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9DT0FDSChjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRDb2FjaChjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGV4Y3VzZSwgZm9yIGEgZGVsYXkgb3IgY2FuY2VsbGF0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGV4Y3VzZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0VYQ1VTRSgpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmV4Y3VzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gaW50ZWdlcnMsIG9wdGlvbmFsbHkgd2l0aCBub3VucyBhbmQgaW4gd29yZCBmb3JtICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGludGVnZXIoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgc2luZ3VsYXIgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3Npbmd1bGFyJyk7XHJcbiAgICAgICAgbGV0IHBsdXJhbCAgID0gY3R4LnhtbEVsZW1lbnQuZ2V0QXR0cmlidXRlKCdwbHVyYWwnKTtcclxuICAgICAgICBsZXQgd29yZHMgICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3dvcmRzJyk7XHJcblxyXG4gICAgICAgIGxldCBpbnQgICAgPSBSQUcuc3RhdGUuZ2V0SW50ZWdlcihjb250ZXh0KTtcclxuICAgICAgICBsZXQgaW50U3RyID0gKHdvcmRzICYmIHdvcmRzLnRvTG93ZXJDYXNlKCkgPT09ICd0cnVlJylcclxuICAgICAgICAgICAgPyBMLkRJR0lUU1tpbnRdIHx8IGludC50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogaW50LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKGludCA9PT0gMSAmJiBzaW5ndWxhcilcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHtzaW5ndWxhcn1gO1xyXG4gICAgICAgIGVsc2UgaWYgKGludCAhPT0gMSAmJiBwbHVyYWwpXHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7cGx1cmFsfWA7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9JTlRFR0VSKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gaW50U3RyO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG5cclxuICAgICAgICBpZiAoc2luZ3VsYXIpIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3Npbmd1bGFyJ10gPSBzaW5ndWxhcjtcclxuICAgICAgICBpZiAocGx1cmFsKSAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3BsdXJhbCddICAgPSBwbHVyYWw7XHJcbiAgICAgICAgaWYgKHdvcmRzKSAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wyd3b3JkcyddICAgID0gd29yZHM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBuYW1lZChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX05BTUVEKCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUubmFtZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEluY2x1ZGVzIGEgcHJldmlvdXNseSBkZWZpbmVkIHBocmFzZSwgYnkgaXRzIGBpZGAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGhyYXNlKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVmICAgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IHBocmFzZSA9IFJBRy5kYXRhYmFzZS5nZXRQaHJhc2UocmVmKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgICAgPSAnJztcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydyZWYnXSA9IHJlZjtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2UpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fUEhSQVNFKHJlZik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaHJhc2VzIHdpdGggYSBjaGFuY2UgdmFsdWUgYXMgY29sbGFwc2libGVcclxuICAgICAgICBpZiAoIGN0eC54bWxFbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY2hhbmNlJykgKVxyXG4gICAgICAgICAgICB0aGlzLm1ha2VDb2xsYXBzaWJsZShjdHgsIHBocmFzZSwgcmVmKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIERPTS5jbG9uZUludG8ocGhyYXNlLCBjdHgubmV3RWxlbWVudCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEluY2x1ZGVzIGEgcGhyYXNlIGZyb20gYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlc2V0LCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VzZXQoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydyZWYnXSA9IHJlZjtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fUEhSQVNFU0VUKHJlZik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBpZHggICAgPSBSQUcuc3RhdGUuZ2V0UGhyYXNlc2V0SWR4KHJlZik7XHJcbiAgICAgICAgbGV0IHBocmFzZSA9IHBocmFzZXNldC5jaGlsZHJlbltpZHhdIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydpZHgnXSA9IGlkeC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSA9IEwuVElUTEVfUEhSQVNFU0VUKHJlZik7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaHJhc2VzZXRzIHdpdGggYSBjaGFuY2UgdmFsdWUgYXMgY29sbGFwc2libGVcclxuICAgICAgICBpZiAoIGN0eC54bWxFbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY2hhbmNlJykgKVxyXG4gICAgICAgICAgICB0aGlzLm1ha2VDb2xsYXBzaWJsZShjdHgsIHBocmFzZSwgcmVmKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIERPTS5jbG9uZUludG8ocGhyYXNlLCBjdHgubmV3RWxlbWVudCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBjdXJyZW50IHBsYXRmb3JtICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBsYXRmb3JtKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfUExBVEZPUk0oKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5wbGF0Zm9ybS5qb2luKCcnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIHJhaWwgbmV0d29yayBuYW1lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNlcnZpY2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU0VSVklDRShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBzdGF0aW9uIG5hbWVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRpb24oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBjb2RlICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb24oY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TVEFUSU9OKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSwgdHJ1ZSk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHN0YXRpb24gbGlzdHMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RhdGlvbmxpc3QoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ICAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgc3RhdGlvbnMgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbkxpc3QoY29udGV4dCkuc2xpY2UoKTtcclxuICAgICAgICBsZXQgc3RhdGlvbkxpc3QgPSBTdHJpbmdzLmZyb21TdGF0aW9uTGlzdChzdGF0aW9ucywgY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TVEFUSU9OTElTVChjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IHN0YXRpb25MaXN0O1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgdGltZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0aW1lKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1RJTUUoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZ2V0VGltZShjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB1bmtub3duIGVsZW1lbnRzIHdpdGggYW4gaW5saW5lIGVycm9yIG1lc3NhZ2UgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdW5rbm93bihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5hbWUgPSBjdHgueG1sRWxlbWVudC5ub2RlTmFtZTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX0VMRU1FTlQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50IGludG8gYSBuZXcgaW5uZXIgc3BhbiB0YWcsIHNvIHRoYXQgdGhleVxyXG4gICAgICogY2FuIGJlIG1hZGUgY29sbGFwc2libGUuIEFwcGVuZHMgaXQgdG8gdGhlIG5ldyBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbWFrZUNvbGxhcHNpYmxlKGN0eDogUGhyYXNlQ29udGV4dCwgc291cmNlOiBIVE1MRWxlbWVudCwgcmVmOiBzdHJpbmcpXHJcbiAgICAgICAgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNoYW5jZSAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnY2hhbmNlJykhO1xyXG4gICAgICAgIGxldCBpbm5lciAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgbGV0IHRvZ2dsZSAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICBsZXQgY29sbGFwc2VkID0gUkFHLnN0YXRlLmdldENvbGxhcHNlZCggcmVmLCBwYXJzZUludChjaGFuY2UpICk7XHJcblxyXG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5hZGQoJ2lubmVyJyk7XHJcbiAgICAgICAgdG9nZ2xlLmNsYXNzTGlzdC5hZGQoJ3RvZ2dsZScpO1xyXG5cclxuICAgICAgICBET00uY2xvbmVJbnRvKHNvdXJjZSwgaW5uZXIpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddID0gY2hhbmNlO1xyXG5cclxuICAgICAgICBDb2xsYXBzaWJsZXMuc2V0KGN0eC5uZXdFbGVtZW50LCB0b2dnbGUsIGNvbGxhcHNlZCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQodG9nZ2xlKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5hcHBlbmRDaGlsZChpbm5lcik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBSZXByZXNlbnRzIGNvbnRleHQgZGF0YSBmb3IgYSBwaHJhc2UsIHRvIGJlIHBhc3NlZCB0byBhbiBlbGVtZW50IHByb2Nlc3NvciAqL1xyXG5pbnRlcmZhY2UgUGhyYXNlQ29udGV4dFxyXG57XHJcbiAgICAvKiogR2V0cyB0aGUgWE1MIHBocmFzZSBlbGVtZW50IHRoYXQgaXMgYmVpbmcgcmVwbGFjZWQgKi9cclxuICAgIHhtbEVsZW1lbnQgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBHZXRzIHRoZSBIVE1MIHNwYW4gZWxlbWVudCB0aGF0IGlzIHJlcGxhY2luZyB0aGUgWE1MIGVsZW1lbnQgKi9cclxuICAgIG5ld0VsZW1lbnQgOiBIVE1MU3BhbkVsZW1lbnQ7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKlxyXG4gKiBIYW5kbGVzIHRoZSB0cmFuc2Zvcm1hdGlvbiBvZiBwaHJhc2UgWE1MIGRhdGEsIGludG8gSFRNTCBlbGVtZW50cyB3aXRoIHRoZWlyIGRhdGFcclxuICogZmlsbGVkIGluIGFuZCB0aGVpciBVSSBsb2dpYyB3aXJlZC5cclxuICovXHJcbmNsYXNzIFBocmFzZXJcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBSZWN1cnNpdmVseSBwcm9jZXNzZXMgWE1MIGVsZW1lbnRzLCBmaWxsaW5nIGluIGRhdGEgYW5kIGFwcGx5aW5nIHRyYW5zZm9ybXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciBQYXJlbnQgdG8gcHJvY2VzcyB0aGUgY2hpbGRyZW4gb2ZcclxuICAgICAqIEBwYXJhbSBsZXZlbCBDdXJyZW50IGxldmVsIG9mIHJlY3Vyc2lvbiwgbWF4LiAyMFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcHJvY2Vzcyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBsZXZlbDogbnVtYmVyID0gMClcclxuICAgIHtcclxuICAgICAgICAvLyBJbml0aWFsbHksIHRoaXMgbWV0aG9kIHdhcyBzdXBwb3NlZCB0byBqdXN0IGFkZCB0aGUgWE1MIGVsZW1lbnRzIGRpcmVjdGx5IGludG9cclxuICAgICAgICAvLyB0aGUgZG9jdW1lbnQuIEhvd2V2ZXIsIHRoaXMgY2F1c2VkIGEgbG90IG9mIHByb2JsZW1zIChlLmcuIHRpdGxlIG5vdCB3b3JraW5nKS5cclxuICAgICAgICAvLyBIVE1MIGRvZXMgbm90IHdvcmsgcmVhbGx5IHdlbGwgd2l0aCBjdXN0b20gZWxlbWVudHMsIGVzcGVjaWFsbHkgaWYgdGhleSBhcmUgb2ZcclxuICAgICAgICAvLyBhbm90aGVyIFhNTCBuYW1lc3BhY2UuXHJcblxyXG4gICAgICAgIGxldCBwZW5kaW5nID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJzpub3Qoc3BhbiknKSBhcyBOb2RlTGlzdE9mPEhUTUxFbGVtZW50PjtcclxuXHJcbiAgICAgICAgLy8gTm8gbW9yZSBYTUwgZWxlbWVudHMgdG8gZXhwYW5kXHJcbiAgICAgICAgaWYgKHBlbmRpbmcubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZvciBlYWNoIFhNTCBlbGVtZW50IGN1cnJlbnRseSBpbiB0aGUgY29udGFpbmVyOlxyXG4gICAgICAgIC8vICogQ3JlYXRlIGEgbmV3IHNwYW4gZWxlbWVudCBmb3IgaXRcclxuICAgICAgICAvLyAqIEhhdmUgdGhlIHByb2Nlc3NvcnMgdGFrZSBkYXRhIGZyb20gdGhlIFhNTCBlbGVtZW50LCB0byBwb3B1bGF0ZSB0aGUgbmV3IG9uZVxyXG4gICAgICAgIC8vICogUmVwbGFjZSB0aGUgWE1MIGVsZW1lbnQgd2l0aCB0aGUgbmV3IG9uZVxyXG4gICAgICAgIHBlbmRpbmcuZm9yRWFjaChlbGVtZW50ID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudE5hbWUgPSBlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICAgICAgbGV0IGNvbnRleHQgICAgID0ge1xyXG4gICAgICAgICAgICAgICAgeG1sRWxlbWVudDogZWxlbWVudCxcclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQ6IG5ld0VsZW1lbnRcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIG5ld0VsZW1lbnQuZGF0YXNldFsndHlwZSddID0gZWxlbWVudE5hbWU7XHJcblxyXG4gICAgICAgICAgICAvLyBJIHdhbnRlZCB0byB1c2UgYW4gaW5kZXggb24gRWxlbWVudFByb2Nlc3NvcnMgZm9yIHRoaXMsIGJ1dCBpdCBjYXVzZWQgZXZlcnlcclxuICAgICAgICAgICAgLy8gcHJvY2Vzc29yIHRvIGhhdmUgYW4gXCJ1bnVzZWQgbWV0aG9kXCIgd2FybmluZy5cclxuICAgICAgICAgICAgc3dpdGNoIChlbGVtZW50TmFtZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnY29hY2gnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5jb2FjaChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdleGN1c2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLmV4Y3VzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2ludGVnZXInOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuaW50ZWdlcihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnbmFtZWQnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5uYW1lZChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BocmFzZXNldCc6ICAgRWxlbWVudFByb2Nlc3NvcnMucGhyYXNlc2V0KGNvbnRleHQpOyAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGxhdGZvcm0nOiAgICBFbGVtZW50UHJvY2Vzc29ycy5wbGF0Zm9ybShjb250ZXh0KTsgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnNlcnZpY2UoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb24nOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc3RhdGlvbmxpc3QnOiBFbGVtZW50UHJvY2Vzc29ycy5zdGF0aW9ubGlzdChjb250ZXh0KTsgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICd0aW1lJzogICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnRpbWUoY29udGV4dCk7ICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6ICAgICAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudW5rbm93bihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUmVjdXJzZSBzbyB0aGF0IHdlIGNhbiBleHBhbmQgYW55IG5ldyBlbGVtZW50c1xyXG4gICAgICAgIGlmIChsZXZlbCA8IDIwKVxyXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGFpbmVyLCBsZXZlbCArIDEpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUEhSQVNFUl9UT09fUkVDVVJTSVZFKCkgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEN1c3RvbSB2b2ljZSB0aGF0IHN5bnRoZXNpemVzIHNwZWVjaCBieSBwaWVjaW5nIHByZS1yZWNvcmRlZCBmaWxlcyB0b2dldGhlciAqL1xyXG5jbGFzcyBDdXN0b21Wb2ljZVxyXG57XHJcbiAgICAvKiogQ2hhbmdlYWJsZSBiYXNlIHBhdGggZm9yIGFsbCBjdXN0b20gdm9pY2VzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJhc2VQYXRoIDogc3RyaW5nID0gJ2RhdGEvdm94JztcclxuXHJcbiAgICAvKiogT25seSBwcmVzZW50IGZvciBjb25zaXN0ZW5jeSB3aXRoIFNwZWVjaFN5bnRoZXNpc1ZvaWNlICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZGVmYXVsdCAgICAgIDogYm9vbGVhbjtcclxuICAgIC8qKiBHZXRzIHRoZSBCQ1AgNDcgdGFnIGluZGljYXRpbmcgdGhlIGxhbmd1YWdlIG9mIHRoaXMgdm9pY2UgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBsYW5nICAgICAgICAgOiBzdHJpbmc7XHJcbiAgICAvKiogT25seSBwcmVzZW50IGZvciBjb25zaXN0ZW5jeSB3aXRoIFNwZWVjaFN5bnRoZXNpc1ZvaWNlICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgbG9jYWxTZXJ2aWNlIDogYm9vbGVhbjtcclxuICAgIC8qKiBHZXRzIHRoZSBjYW5vbmljYWwgbmFtZSBvZiB0aGlzIHZvaWNlICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgbmFtZSAgICAgICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIEdldHMgdGhlIHJlbGF0aXZlIFVSSSBvZiB0aGlzIHZvaWNlJ3MgZmlsZXMgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSB2b2ljZVVSSSAgICAgOiBzdHJpbmc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgbGFuZzogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZGVmYXVsdCAgICAgID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5sb2NhbFNlcnZpY2UgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLm5hbWUgICAgICAgICA9IGBSQUctVk9YICR7bmFtZX1gO1xyXG4gICAgICAgIHRoaXMubGFuZyAgICAgICAgID0gbGFuZztcclxuICAgICAgICB0aGlzLnZvaWNlVVJJICAgICA9IGAke0N1c3RvbVZvaWNlLmJhc2VQYXRofS8ke25hbWV9XyR7bGFuZ31gO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBjbGFzcyBmb3IgcmVzb2x2aW5nIGEgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQgdG8gYSB2b3gga2V5ICovXHJcbmNsYXNzIFJlc29sdmVyXHJcbntcclxuICAgIC8qKiBUcmVlV2Fsa2VyIGZpbHRlciB0byByZWR1Y2UgYSB3YWxrIHRvIGp1c3QgdGhlIGVsZW1lbnRzIHRoZSByZXNvbHZlciBuZWVkcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBub2RlRmlsdGVyKG5vZGU6IE5vZGUpOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICAgICA9IG5vZGUucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgbGV0IHBhcmVudFR5cGUgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG5cclxuICAgICAgICAvLyBJZiB0eXBlIGlzIG1pc3NpbmcsIHBhcmVudCBpcyBhIHdyYXBwZXJcclxuICAgICAgICBpZiAoIXBhcmVudFR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBwYXJlbnQgICAgID0gcGFyZW50LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgICAgICBwYXJlbnRUeXBlID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIE9ubHkgYWNjZXB0IHRleHQgbm9kZXMgd2l0aCB3b3JkcyBpbiB0aGVtXHJcbiAgICAgICAgICAgIGlmICggIW5vZGUudGV4dENvbnRlbnQhLm1hdGNoKC9bYS16MC05XS9pKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUO1xyXG5cclxuICAgICAgICAgICAgLy8gQWNjZXB0IHRleHQgb25seSBmcm9tIHBocmFzZSBhbmQgcGhyYXNlc2V0c1xyXG4gICAgICAgICAgICBpZiAocGFyZW50VHlwZSAhPT0gJ3BocmFzZXNldCcgJiYgcGFyZW50VHlwZSAhPT0gJ3BocmFzZScpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfU0tJUDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBlbGVtZW50ID0gbm9kZSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgbGV0IHR5cGUgICAgPSBlbGVtZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuXHJcbiAgICAgICAgICAgIC8vIFJlamVjdCBjb2xsYXBzZWQgZWxlbWVudHMgYW5kIHRoZWlyIGNoaWxkcmVuXHJcbiAgICAgICAgICAgIGlmICggZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpIClcclxuICAgICAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9SRUpFQ1Q7XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIHR5cGVsZXNzICh3cmFwcGVyKSBlbGVtZW50c1xyXG4gICAgICAgICAgICBpZiAoIXR5cGUpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfU0tJUDtcclxuXHJcbiAgICAgICAgICAgIC8vIFNraXAgb3ZlciBwaHJhc2UgYW5kIHBocmFzZXNldHMgKGluc3RlYWQsIG9ubHkgZ29pbmcgZm9yIHRoZWlyIGNoaWxkcmVuKVxyXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ3BocmFzZXNldCcgfHwgdHlwZSA9PT0gJ3BocmFzZScpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfU0tJUDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9BQ0NFUFQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEtlZXBzIHRyYWNrIG9mIHBocmFzZXMnIHRleHQgbm9kZSByZWxhdGl2ZSBpbmRleGVzICovXHJcbiAgICBwcml2YXRlIHBocmFzZUlkeHMgOiBEaWN0aW9uYXJ5PG51bWJlcj4gPSB7fTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFVzZXMgdGhlIHR5cGUgYW5kIHZhbHVlIG9mIHRoZSBnaXZlbiBub2RlLCB0byByZXNvbHZlIGl0IHRvIHZveCBmaWxlIElEcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbm9kZSBOb2RlIHRvIHJlc29sdmUgdG8gdm94IElEc1xyXG4gICAgICogQHJldHVybnMgQXJyYXkgb2YgSURzIHRoYXQgbWFrZSB1cCBvbmUgb3IgbW9yZSBmaWxlIElEcy4gQ2FuIGJlIGVtcHR5LlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcmVzb2x2ZShub2RlOiBOb2RlKSA6IHN0cmluZ1tdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlVGV4dChub2RlKTtcclxuXHJcbiAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUNvYWNoKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICdleGN1c2UnOiAgICAgIHJldHVybiB0aGlzLnJlc29sdmVFeGN1c2UoKTtcclxuICAgICAgICAgICAgY2FzZSAnaW50ZWdlcic6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlSW50ZWdlcihlbGVtZW50KTtcclxuICAgICAgICAgICAgY2FzZSAnbmFtZWQnOiAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlTmFtZWQoKTtcclxuICAgICAgICAgICAgY2FzZSAncGxhdGZvcm0nOiAgICByZXR1cm4gdGhpcy5yZXNvbHZlUGxhdGZvcm0oKTtcclxuICAgICAgICAgICAgY2FzZSAnc2VydmljZSc6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlU2VydmljZShlbGVtZW50KTtcclxuICAgICAgICAgICAgY2FzZSAnc3RhdGlvbic6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlU3RhdGlvbihlbGVtZW50KTtcclxuICAgICAgICAgICAgY2FzZSAnc3RhdGlvbmxpc3QnOiByZXR1cm4gdGhpcy5yZXNvbHZlU3RhdGlvbkxpc3QoZWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3RpbWUnOiAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRpbWUoZWxlbWVudCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlc29sdmUgdGV4dCBub2RlcyBmcm9tIHBocmFzZXMgYW5kIHBocmFzZXNldHMgdG8gSUQgc3RyaW5ncyAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlVGV4dChub2RlOiBOb2RlKSA6IHN0cmluZ1tdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCA9IG5vZGUucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgbGV0IHR5cGUgICA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghdHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICAgICAgdHlwZSAgID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCByZWYgPSBwYXJlbnQuZGF0YXNldFsncmVmJ107XHJcbiAgICAgICAgbGV0IGlkICA9IGBwaHJhc2UuJHtyZWZ9YDtcclxuXHJcbiAgICAgICAgLy8gQXBwZW5kIGluZGV4IG9mIHBocmFzZXNldCdzIGNob2ljZSBvZiBwaHJhc2VcclxuICAgICAgICBpZiAodHlwZSA9PT0gJ3BocmFzZXNldCcpXHJcbiAgICAgICAgICAgIGlkICs9IGAuJHtwYXJlbnQuZGF0YXNldFsnaWR4J119YDtcclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLnBocmFzZUlkeHNbaWRdKVxyXG4gICAgICAgICAgICB0aGlzLnBocmFzZUlkeHNbaWRdID0gMDtcclxuXHJcbiAgICAgICAgaWQgKz0gYC4ke3RoaXMucGhyYXNlSWR4c1tpZF0rK31gO1xyXG5cclxuICAgICAgICByZXR1cm4gW2lkXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVzb2x2ZSBJRCBmcm9tIGEgZ2l2ZW4gY29hY2ggZWxlbWVudCBhbmQgY3VycmVudCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlQ29hY2goZWxlbWVudDogSFRNTEVsZW1lbnQpIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IGNvYWNoID0gUkFHLnN0YXRlLmdldENvYWNoKGN0eCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbYGxldHRlci4ke2NvYWNofWBdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXNvbHZlIElEIGZyb20gYSBnaXZlbiBleGN1c2UgZWxlbWVudCBhbmQgY3VycmVudCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlRXhjdXNlKCkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBleGN1c2UgPSBSQUcuc3RhdGUuZXhjdXNlO1xyXG4gICAgICAgIGxldCBpbmRleCAgPSBSQUcuZGF0YWJhc2UuZXhjdXNlcy5pbmRleE9mKGV4Y3VzZSk7XHJcblxyXG4gICAgICAgIC8vIFRPRE86IEVycm9yIGhhbmRsaW5nXHJcbiAgICAgICAgcmV0dXJuIFtgZXhjdXNlLiR7aW5kZXh9YF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlc29sdmUgSURzIGZyb20gYSBnaXZlbiBpbnRlZ2VyIGVsZW1lbnQgYW5kIGN1cnJlbnQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgcmVzb2x2ZUludGVnZXIoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHNpbmd1bGFyID0gZWxlbWVudC5kYXRhc2V0WydzaW5ndWxhciddO1xyXG4gICAgICAgIGxldCBwbHVyYWwgICA9IGVsZW1lbnQuZGF0YXNldFsncGx1cmFsJ107XHJcbiAgICAgICAgbGV0IGludGVnZXIgID0gUkFHLnN0YXRlLmdldEludGVnZXIoY3R4KTtcclxuICAgICAgICBsZXQgcGFydHMgICAgPSBbYG51bWJlci4ke2ludGVnZXJ9YF07XHJcblxyXG4gICAgICAgIGlmICAgICAgKHNpbmd1bGFyICYmIGludGVnZXIgPT09IDEpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goYG51bWJlci5zdWZmaXguJHtzaW5ndWxhcn1gKTtcclxuICAgICAgICBlbHNlIGlmIChwbHVyYWwgICAmJiBpbnRlZ2VyICE9PSAxKVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKGBudW1iZXIuc3VmZml4LiR7cGx1cmFsfWApO1xyXG5cclxuICAgICAgICByZXR1cm4gcGFydHM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlc29sdmUgSUQgZnJvbSBhIGdpdmVuIG5hbWVkIGVsZW1lbnQgYW5kIGN1cnJlbnQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgcmVzb2x2ZU5hbWVkKCkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBuYW1lZCA9IFN0cmluZ3MuZmlsZW5hbWUoUkFHLnN0YXRlLm5hbWVkKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFtgbmFtZWQuJHtuYW1lZH1gXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVzb2x2ZSBJRHMgZnJvbSBhIGdpdmVuIHBsYXRmb3JtIGVsZW1lbnQgYW5kIGN1cnJlbnQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgcmVzb2x2ZVBsYXRmb3JtKCkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA9IFJBRy5zdGF0ZS5wbGF0Zm9ybTtcclxuICAgICAgICBsZXQgcGFydHMgICAgPSBbXTtcclxuXHJcbiAgICAgICAgcGFydHMucHVzaChgbnVtYmVyLiR7cGxhdGZvcm1bMF19YCk7XHJcblxyXG4gICAgICAgIGlmIChwbGF0Zm9ybVsxXSlcclxuICAgICAgICAgICAgcGFydHMucHVzaChgbGV0dGVyLiR7cGxhdGZvcm1bMV19YCk7XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJ0cztcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVzb2x2ZSBJRCBmcm9tIGEgZ2l2ZW4gc2VydmljZSBlbGVtZW50IGFuZCBjdXJyZW50IHN0YXRlICovXHJcbiAgICBwcml2YXRlIHJlc29sdmVTZXJ2aWNlKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IHN0cmluZ1tdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHNlcnZpY2UgPSBTdHJpbmdzLmZpbGVuYW1lKCBSQUcuc3RhdGUuZ2V0U2VydmljZShjdHgpICk7XHJcblxyXG4gICAgICAgIHJldHVybiBbYHNlcnZpY2UuJHtzZXJ2aWNlfWBdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXNvbHZlIElEIGZyb20gYSBnaXZlbiBzdGF0aW9uIGVsZW1lbnQgYW5kIGN1cnJlbnQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb24oZWxlbWVudDogSFRNTEVsZW1lbnQpIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uKGN0eCk7XHJcbiAgICAgICAgLy8gVE9ETzogQ29udGV4dCBzZW5zaXRpdmUgdHlwZXNcclxuICAgICAgICBsZXQgdHlwZSAgICA9ICdlbmQnO1xyXG5cclxuICAgICAgICByZXR1cm4gW2BzdGF0aW9uLmVuZC4ke3N0YXRpb259YF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlc29sdmUgSURzIGZyb20gYSBnaXZlbiBzdGF0aW9uIGxpc3QgZWxlbWVudCBhbmQgY3VycmVudCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlU3RhdGlvbkxpc3QoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgbGlzdCA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdChjdHgpO1xyXG5cclxuICAgICAgICBsZXQgcGFydHMgOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgICAgICBsaXN0LmZvckVhY2goICh2LCBrKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gSGFuZGxlIGVuZCBvZiBsaXN0IGluZmxlY3Rpb25cclxuICAgICAgICAgICAgaWYgKGsgPT09IGxpc3QubGVuZ3RoIC0gMSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgLy8gQWRkIFwiYW5kXCIgaWYgbGlzdCBoYXMgbW9yZSB0aGFuIDEgc3RhdGlvbiBhbmQgdGhpcyBpcyB0aGUgZW5kXHJcbiAgICAgICAgICAgICAgICBpZiAobGlzdC5sZW5ndGggPiAxKVxyXG4gICAgICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goJ3N0YXRpb24ucGFydHMuYW5kJyk7XHJcblxyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaChgc3RhdGlvbi5lbmQuJHt2fWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24ubWlkZGxlLiR7dn1gKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gQWRkIFwib25seVwiIGlmIG9ubHkgb25lIHN0YXRpb24gaW4gdGhlIGNhbGxpbmcgbGlzdFxyXG4gICAgICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSAmJiBjdHggPT09ICdjYWxsaW5nJylcclxuICAgICAgICAgICAgcGFydHMucHVzaCgnc3RhdGlvbi5wYXJ0cy5vbmx5Jyk7XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJ0cztcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVzb2x2ZSBJRHMgZnJvbSBhIGdpdmVuIHRpbWUgZWxlbWVudCBhbmQgY3VycmVudCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlVGltZShlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgdGltZSAgPSBSQUcuc3RhdGUuZ2V0VGltZShjdHgpLnNwbGl0KCc6Jyk7XHJcbiAgICAgICAgbGV0IHBhcnRzID0gW107XHJcblxyXG4gICAgICAgIGlmICh0aW1lWzBdID09PSAnMDAnICYmIHRpbWVbMV0gPT09ICcwMCcpXHJcbiAgICAgICAgICAgIHJldHVybiBbJ251bWJlci4wMDAwJ107XHJcblxyXG4gICAgICAgIC8vIEhvdXJzXHJcbiAgICAgICAgcGFydHMucHVzaChgbnVtYmVyLiR7dGltZVswXX1gKTtcclxuXHJcbiAgICAgICAgaWYgKHRpbWVbMV0gPT09ICcwMCcpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goJ251bWJlci5odW5kcmVkJyk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKGBudW1iZXIuJHt0aW1lWzFdfWApO1xyXG5cclxuICAgICAgICByZXR1cm4gcGFydHM7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVbmlvbiB0eXBlIGZvciBib3RoIGtpbmRzIG9mIHZvaWNlcyBhdmFpbGFibGUgKi9cclxudHlwZSBWb2ljZSA9IFNwZWVjaFN5bnRoZXNpc1ZvaWNlIHwgQ3VzdG9tVm9pY2U7XHJcblxyXG4vKiogTWFuYWdlcyBzcGVlY2ggc3ludGhlc2lzIHVzaW5nIGJvdGggbmF0aXZlIGFuZCBjdXN0b20gZW5naW5lcyAqL1xyXG5jbGFzcyBTcGVlY2hcclxue1xyXG4gICAgLyoqIEluc3RhbmNlIG9mIHRoZSBjdXN0b20gdm9pY2UgZW5naW5lICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgdm94RW5naW5lIDogVm94RW5naW5lO1xyXG5cclxuICAgIC8qKiBBcnJheSBvZiBicm93c2VyLXByb3ZpZGVkIHZvaWNlcyBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgYnJvd3NlclZvaWNlcyA6IFNwZWVjaFN5bnRoZXNpc1ZvaWNlW10gPSBbXTtcclxuICAgIC8qKiBBcnJheSBvZiBjdXN0b20gcHJlLXJlY29yZGVkIHZvaWNlcyBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgY3VzdG9tVm9pY2VzICA6IEN1c3RvbVZvaWNlW10gICAgICAgICAgPSBbXTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFNvbWUgYnJvd3NlcnMgZG9uJ3QgcHJvcGVybHkgY2FuY2VsIHNwZWVjaCBvbiBwYWdlIGNsb3NlLlxyXG4gICAgICAgIC8vIEJVRzogb25wYWdlc2hvdyBhbmQgb25wYWdlaGlkZSBub3Qgd29ya2luZyBvbiBpT1MgMTFcclxuICAgICAgICB3aW5kb3cub25iZWZvcmV1bmxvYWQgPVxyXG4gICAgICAgIHdpbmRvdy5vbnVubG9hZCAgICAgICA9XHJcbiAgICAgICAgd2luZG93Lm9ucGFnZXNob3cgICAgID1cclxuICAgICAgICB3aW5kb3cub25wYWdlaGlkZSAgICAgPSB0aGlzLmNhbmNlbC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5vbnZpc2liaWxpdHljaGFuZ2UgICAgICAgICAgICA9IHRoaXMub25WaXNpYmlsaXR5Q2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5vbnZvaWNlc2NoYW5nZWQgPSB0aGlzLm9uVm9pY2VzQ2hhbmdlZC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBFdmVuIHRob3VnaCAnb252b2ljZXNjaGFuZ2VkJyBpcyB1c2VkIGxhdGVyIHRvIHBvcHVsYXRlIHRoZSBsaXN0LCBDaHJvbWUgZG9lc1xyXG4gICAgICAgIC8vIG5vdCBhY3R1YWxseSBmaXJlIHRoZSBldmVudCB1bnRpbCB0aGlzIGNhbGwuLi5cclxuICAgICAgICB0aGlzLm9uVm9pY2VzQ2hhbmdlZCgpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBNYWtlIHRoaXMgYSBkeW5hbWljIHJlZ2lzdHJhdGlvbiBhbmQgY2hlY2sgZm9yIGZlYXR1cmVzXHJcbiAgICAgICAgdGhpcy52b3hFbmdpbmUgPSBuZXcgVm94RW5naW5lKCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VzdG9tVm9pY2VzLnB1c2goIG5ldyBDdXN0b21Wb2ljZSgnVGVzdCcsICdlbi1HQicpICk7XHJcbiAgICAgICAgdGhpcy5jdXN0b21Wb2ljZXMucHVzaCggbmV3IEN1c3RvbVZvaWNlKCdSb3knLCAgJ2VuLUdCJykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyBhbGwgdGhlIHZvaWNlcyBjdXJyZW50bHkgYXZhaWxhYmxlICovXHJcbiAgICBwdWJsaWMgZ2V0Vm9pY2VzKCkgOiBWb2ljZVtdXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY3VzdG9tVm9pY2VzLmNvbmNhdCh0aGlzLmJyb3dzZXJWb2ljZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBCZWdpbnMgc3BlYWtpbmcgdGhlIGdpdmVuIHBocmFzZSBjb21wb25lbnRzICovXHJcbiAgICBwdWJsaWMgc3BlYWsocGhyYXNlOiBIVE1MRWxlbWVudCwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzID0ge30pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFJlc2V0IHRvIGZpcnN0IHZvaWNlLCBpZiBjb25maWd1cmVkIGNob2ljZSBpcyBtaXNzaW5nXHJcbiAgICAgICAgbGV0IHZvaWNlcyAgID0gdGhpcy5nZXRWb2ljZXMoKTtcclxuICAgICAgICBsZXQgdm9pY2VJZHggPSBlaXRoZXIoc2V0dGluZ3Mudm9pY2VJZHgsIFJBRy5jb25maWcuc3BlZWNoVm9pY2UpO1xyXG4gICAgICAgIGxldCB2b2ljZSAgICA9IHZvaWNlc1t2b2ljZUlkeF0gfHwgdm9pY2VzWzBdO1xyXG4gICAgICAgIGxldCBlbmdpbmUgICA9ICh2b2ljZSBpbnN0YW5jZW9mIEN1c3RvbVZvaWNlKVxyXG4gICAgICAgICAgICA/IHRoaXMuc3BlYWtDdXN0b20uYmluZCh0aGlzKVxyXG4gICAgICAgICAgICA6IHRoaXMuc3BlYWtCcm93c2VyLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIGVuZ2luZShwaHJhc2UsIHZvaWNlLCBzZXR0aW5ncyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIGFuZCBjYW5jZWxzIGFsbCBxdWV1ZWQgc3BlZWNoICovXHJcbiAgICBwdWJsaWMgY2FuY2VsKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5jYW5jZWwoKTtcclxuICAgICAgICB0aGlzLnZveEVuZ2luZS5zdG9wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBhdXNlIGFuZCB1bnBhdXNlIHNwZWVjaCBpZiB0aGUgcGFnZSBpcyBoaWRkZW4gb3IgdW5oaWRkZW4gKi9cclxuICAgIHByaXZhdGUgb25WaXNpYmlsaXR5Q2hhbmdlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGhpZGluZyA9IChkb2N1bWVudC52aXNpYmlsaXR5U3RhdGUgPT09ICdoaWRkZW4nKTtcclxuXHJcbiAgICAgICAgaWYgKGhpZGluZykgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5wYXVzZSgpO1xyXG4gICAgICAgIGVsc2UgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMucmVzdW1lKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgYXN5bmMgdm9pY2UgbGlzdCBsb2FkaW5nIG9uIHNvbWUgYnJvd3NlcnMsIGFuZCBzZXRzIGRlZmF1bHQgKi9cclxuICAgIHByaXZhdGUgb25Wb2ljZXNDaGFuZ2VkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5icm93c2VyVm9pY2VzID0gd2luZG93LnNwZWVjaFN5bnRoZXNpcy5nZXRWb2ljZXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbnZlcnRzIHRoZSBnaXZlbiBwaHJhc2UgdG8gdGV4dCBhbmQgc3BlYWtzIGl0IHZpYSBuYXRpdmUgYnJvd3NlciB2b2ljZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBocmFzZSBQaHJhc2UgZWxlbWVudHMgdG8gc3BlYWtcclxuICAgICAqIEBwYXJhbSB2b2ljZSBCcm93c2VyIHZvaWNlIHRvIHVzZVxyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFNldHRpbmdzIHRvIHVzZSBmb3IgdGhlIHZvaWNlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3BlYWtCcm93c2VyKHBocmFzZTogSFRNTEVsZW1lbnQsIHZvaWNlOiBWb2ljZSwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzKVxyXG4gICAgICAgIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRoZSBwaHJhc2UgdGV4dCBpcyBzcGxpdCBpbnRvIHNlbnRlbmNlcywgYXMgcXVldWVpbmcgbGFyZ2Ugc2VudGVuY2VzIHRoYXQgbGFzdFxyXG4gICAgICAgIC8vIG1hbnkgc2Vjb25kcyBjYW4gYnJlYWsgc29tZSBUVFMgZW5naW5lcyBhbmQgYnJvd3NlcnMuXHJcbiAgICAgICAgbGV0IHRleHQgID0gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dChwaHJhc2UpO1xyXG4gICAgICAgIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoL1xcLlxccy9pKTtcclxuXHJcbiAgICAgICAgUkFHLnNwZWVjaC5jYW5jZWwoKTtcclxuICAgICAgICBwYXJ0cy5mb3JFYWNoKCAoc2VnbWVudCwgaWR4KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gQWRkIG1pc3NpbmcgZnVsbCBzdG9wIHRvIGVhY2ggc2VudGVuY2UgZXhjZXB0IHRoZSBsYXN0LCB3aGljaCBoYXMgaXRcclxuICAgICAgICAgICAgaWYgKGlkeCA8IHBhcnRzLmxlbmd0aCAtIDEpXHJcbiAgICAgICAgICAgICAgICBzZWdtZW50ICs9ICcuJztcclxuXHJcbiAgICAgICAgICAgIGxldCB1dHRlcmFuY2UgPSBuZXcgU3BlZWNoU3ludGhlc2lzVXR0ZXJhbmNlKHNlZ21lbnQpO1xyXG5cclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnZvaWNlICA9IHZvaWNlO1xyXG4gICAgICAgICAgICB1dHRlcmFuY2Uudm9sdW1lID0gZWl0aGVyKHNldHRpbmdzLnZvbHVtZSwgUkFHLmNvbmZpZy5zcGVlY2hWb2wpO1xyXG4gICAgICAgICAgICB1dHRlcmFuY2UucGl0Y2ggID0gZWl0aGVyKHNldHRpbmdzLnBpdGNoLCAgUkFHLmNvbmZpZy5zcGVlY2hQaXRjaCk7XHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS5yYXRlICAgPSBlaXRoZXIoc2V0dGluZ3MucmF0ZSwgICBSQUcuY29uZmlnLnNwZWVjaFJhdGUpO1xyXG5cclxuICAgICAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5zcGVhayh1dHRlcmFuY2UpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3ludGhlc2l6ZXMgdm9pY2UgYnkgd2Fsa2luZyB0aHJvdWdoIHRoZSBnaXZlbiBwaHJhc2UgZWxlbWVudHMsIHJlc29sdmluZyBwYXJ0cyB0b1xyXG4gICAgICogc291bmQgZmlsZSBJRHMsIGFuZCBmZWVkaW5nIHRoZSBlbnRpcmUgYXJyYXkgdG8gdGhlIHZveCBlbmdpbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBocmFzZSBQaHJhc2UgZWxlbWVudHMgdG8gc3BlYWtcclxuICAgICAqIEBwYXJhbSB2b2ljZSBDdXN0b20gdm9pY2UgdG8gdXNlXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgU2V0dGluZ3MgdG8gdXNlIGZvciB0aGUgdm9pY2VcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzcGVha0N1c3RvbShwaHJhc2U6IEhUTUxFbGVtZW50LCB2b2ljZTogVm9pY2UsIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncylcclxuICAgICAgICA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBUT0RPOiB1c2Ugdm9sdW1lIHNldHRpbmdzXHJcbiAgICAgICAgbGV0IGlkcyAgICAgICAgPSBbXTtcclxuICAgICAgICBsZXQgcmVzb2x2ZXIgICA9IG5ldyBSZXNvbHZlcigpO1xyXG4gICAgICAgIGxldCB0cmVlV2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgcGhyYXNlLFxyXG4gICAgICAgICAgICBOb2RlRmlsdGVyLlNIT1dfVEVYVCB8IE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5ULFxyXG4gICAgICAgICAgICB7IGFjY2VwdE5vZGU6IFJlc29sdmVyLm5vZGVGaWx0ZXIgfSxcclxuICAgICAgICAgICAgZmFsc2VcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB3aGlsZSAoIHRyZWVXYWxrZXIubmV4dE5vZGUoKSApXHJcbiAgICAgICAgICAgIGlkcy5wdXNoKCAuLi5yZXNvbHZlci5yZXNvbHZlKHRyZWVXYWxrZXIuY3VycmVudE5vZGUpICk7XHJcblxyXG4gICAgICAgIHRoaXMudm94RW5naW5lLnNwZWFrKGlkcywgdm9pY2UsIHNldHRpbmdzKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFR5cGUgZGVmaW5pdGlvbiBmb3Igc3BlZWNoIGNvbmZpZyBvdmVycmlkZXMgcGFzc2VkIHRvIHRoZSBzcGVhayBtZXRob2QgKi9cclxuaW50ZXJmYWNlIFNwZWVjaFNldHRpbmdzXHJcbntcclxuICAgIC8qKiBPdmVycmlkZSBjaG9pY2Ugb2Ygdm9pY2UgKi9cclxuICAgIHZvaWNlSWR4PzogbnVtYmVyO1xyXG4gICAgLyoqIE92ZXJyaWRlIHZvbHVtZSBvZiB2b2ljZSAqL1xyXG4gICAgdm9sdW1lPzogbnVtYmVyO1xyXG4gICAgLyoqIE92ZXJyaWRlIHBpdGNoIG9mIHZvaWNlICovXHJcbiAgICBwaXRjaD86IG51bWJlcjtcclxuICAgIC8qKiBPdmVycmlkZSByYXRlIG9mIHZvaWNlICovXHJcbiAgICByYXRlPzogbnVtYmVyO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogU3ludGhlc2l6ZXMgc3BlZWNoIGJ5IGR5bmFtaWNhbGx5IGxvYWRpbmcgYW5kIHBpZWNpbmcgdG9nZXRoZXIgdm9pY2UgZmlsZXMgKi9cclxuY2xhc3MgVm94RW5naW5lXHJcbntcclxuICAgIC8qKiBUaGUgY29yZSBhdWRpbyBjb250ZXh0IHRoYXQgaGFuZGxlcyBhdWRpbyBlZmZlY3RzIGFuZCBwbGF5YmFjayAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGF1ZGlvQ29udGV4dCA6IEF1ZGlvQ29udGV4dDtcclxuICAgIC8qKiBBdWRpbyBub2RlIHRoYXQgZmlsdGVycyB2b2ljZSB3aXRoIHZhcmlvdXMgZWZmZWN0cyAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGF1ZGlvRmlsdGVyICA6IEJpcXVhZEZpbHRlck5vZGU7XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgdGhpcyBlbmdpbmUgaXMgY3VycmVudGx5IHJ1bm5pbmcgYW5kIHNwZWFraW5nICovXHJcbiAgICBwdWJsaWMgIGlzU3BlYWtpbmcgICAgICAgOiBib29sZWFuICAgICAgPSBmYWxzZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgbnVtYmVyIGZvciB0aGUgY3VycmVudCBwdW1wIHRpbWVyICovXHJcbiAgICBwcml2YXRlIHB1bXBUaW1lciAgICAgICAgOiBudW1iZXIgICAgICAgPSAwO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gY3VycmVudGx5IHBlbmRpbmcgcmVxdWVzdHMsIGFzIGEgRklGTyBxdWV1ZSAqL1xyXG4gICAgcHJpdmF0ZSBwZW5kaW5nUmVxcyAgICAgIDogVm94UmVxdWVzdFtdID0gW107XHJcbiAgICAvKiogTGlzdCBvZiB2b3ggSURzIGN1cnJlbnRseSBiZWluZyBydW4gdGhyb3VnaCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50SWRzPyAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogVm9pY2UgY3VycmVudGx5IGJlaW5nIHVzZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFZvaWNlPyAgICA6IEN1c3RvbVZvaWNlO1xyXG4gICAgLyoqIFNwZWVjaCBzZXR0aW5ncyBjdXJyZW50bHkgYmVpbmcgdXNlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50U2V0dGluZ3M/IDogU3BlZWNoU2V0dGluZ3M7XHJcbiAgICAvKiogQXVkaW8gYnVmZmVyIG5vZGUgaG9sZGluZyBhbmQgcGxheWluZyB0aGUgY3VycmVudCB2b2ljZSBmaWxlICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRCdWZOb2RlPyAgOiBBdWRpb0J1ZmZlclNvdXJjZU5vZGU7XHJcbiAgICAvKiogQXVkaW8gbm9kZSB0aGF0IGFkZHMgYSByZXZlcmIgdG8gdGhlIHZvaWNlLCBpZiBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgYXVkaW9SZXZlcmI/ICAgICA6IENvbnZvbHZlck5vZGU7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICAvLyBTZXR1cCB0aGUgY29yZSBhdWRpbyBjb250ZXh0XHJcblxyXG4gICAgICAgIC8vIEB0cy1pZ25vcmVcclxuICAgICAgICBsZXQgQXVkaW9Db250ZXh0ID0gd2luZG93LkF1ZGlvQ29udGV4dCB8fCB3aW5kb3cud2Via2l0QXVkaW9Db250ZXh0O1xyXG5cclxuICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dCA9IG5ldyBBdWRpb0NvbnRleHQoeyBsYXRlbmN5SGludCA6ICdwbGF5YmFjaycgfSk7XHJcblxyXG4gICAgICAgIC8vIFNldHVwIHRhbm5veSBmaWx0ZXJcclxuXHJcbiAgICAgICAgdGhpcy5hdWRpb0ZpbHRlciAgICAgICAgID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XHJcbiAgICAgICAgdGhpcy5hdWRpb0ZpbHRlci50eXBlICAgID0gJ2hpZ2hwYXNzJztcclxuICAgICAgICB0aGlzLmF1ZGlvRmlsdGVyLlEudmFsdWUgPSAwLjQ7XHJcblxyXG4gICAgICAgIHRoaXMuYXVkaW9GaWx0ZXIuY29ubmVjdCh0aGlzLmF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XHJcblxyXG4gICAgICAgIC8vIFNldHVwIHJldmVyYlxyXG5cclxuICAgICAgICAvLyBUT0RPOiBNYWtlIHRoaXMgdXNlciBjb25maWd1cmFibGUgYW5kIGNob29zYWJsZVxyXG4gICAgICAgIGZldGNoKCdkYXRhL3ZveC9pci5zdGFsYmFuc19hX21vbm8ud2F2JylcclxuICAgICAgICAgICAgLnRoZW4oIHJlcyA9PiByZXMuYXJyYXlCdWZmZXIoKSApXHJcbiAgICAgICAgICAgIC50aGVuKCBidWYgPT4gU291bmRzLmRlY29kZSh0aGlzLmF1ZGlvQ29udGV4dCwgYnVmKSApXHJcbiAgICAgICAgICAgIC50aGVuKCByZXYgPT5cclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdWRpb1JldmVyYiAgICAgICAgICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVDb252b2x2ZXIoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9SZXZlcmIuYnVmZmVyICAgID0gcmV2O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdWRpb1JldmVyYi5ub3JtYWxpemUgPSB0cnVlO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9GaWx0ZXIuY29ubmVjdCh0aGlzLmF1ZGlvUmV2ZXJiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9SZXZlcmIuY29ubmVjdCh0aGlzLmF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggUkVWRVJCIExPQURFRCcpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEJlZ2lucyBsb2FkaW5nIGFuZCBzcGVha2luZyBhIHNldCBvZiB2b3ggZmlsZXMuIFN0b3BzIGFueSBzcGVlY2guXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkcyBMaXN0IG9mIHZveCBpZHMgdG8gbG9hZCBhcyBmaWxlcywgaW4gc3BlYWtpbmcgb3JkZXJcclxuICAgICAqIEBwYXJhbSB2b2ljZSBDdXN0b20gdm9pY2UgdG8gdXNlXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgVm9pY2Ugc2V0dGluZ3MgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzcGVhayhpZHM6IHN0cmluZ1tdLCB2b2ljZTogVm9pY2UsIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFNQRUFLOicsIGlkcywgdm9pY2UsIHNldHRpbmdzKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuaXNTcGVha2luZylcclxuICAgICAgICAgICAgdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIHRoaXMuaXNTcGVha2luZyAgICAgID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRJZHMgICAgICA9IGlkcztcclxuICAgICAgICB0aGlzLmN1cnJlbnRWb2ljZSAgICA9IHZvaWNlO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0gc2V0dGluZ3M7XHJcblxyXG4gICAgICAgIC8vIEJlZ2luIHRoZSBwdW1wIGxvb3AuIE9uIGlPUywgdGhlIGNvbnRleHQgbWF5IGhhdmUgdG8gYmUgcmVzdW1lZCBmaXJzdFxyXG4gICAgICAgIGlmICh0aGlzLmF1ZGlvQ29udGV4dC5zdGF0ZSA9PT0gJ3N1c3BlbmRlZCcpXHJcbiAgICAgICAgICAgIHRoaXMuYXVkaW9Db250ZXh0LnJlc3VtZSgpLnRoZW4oICgpID0+IHRoaXMucHVtcCgpICk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLnB1bXAoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3RvcHMgcGxheWluZyBhbnkgY3VycmVudGx5IHNwb2tlbiBzcGVlY2ggYW5kIHJlc2V0cyBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHN0b3AoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmdcclxuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5wdW1wVGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgLy8gQ2FuY2VsIGFsbCBwZW5kaW5nIHJlcXVlc3RzXHJcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVxcy5mb3JFYWNoKCByID0+IHIuY2FuY2VsKCkgKTtcclxuXHJcbiAgICAgICAgLy8gS2lsbCBhbmQgZGVyZWZlcmVuY2UgYW55IGN1cnJlbnRseSBwbGF5aW5nIGZpbGVcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50QnVmTm9kZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEJ1Zk5vZGUub25lbmRlZCA9IG51bGw7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEJ1Zk5vZGUuc3RvcCgpO1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRCdWZOb2RlLmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QnVmTm9kZSA9IHVuZGVmaW5lZDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudElkcyAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFZvaWNlICAgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXMgICAgID0gW107XHJcblxyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBTVE9QUEVEJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQdW1wcyB0aGUgc3BlZWNoIHF1ZXVlLCBieSBrZWVwaW5nIHVwIHRvIDEwIGZldGNoIHJlcXVlc3RzIGZvciB2b2ljZSBmaWxlcyBnb2luZyxcclxuICAgICAqIGFuZCB0aGVuIGZlZWRpbmcgdGhlaXIgZGF0YSAoaW4gZW5mb3JjZWQgb3JkZXIpIHRvIHRoZSBhdWRpbyBjaGFpbiwgb25lIGF0IGEgdGltZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBwdW1wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gSWYgdGhlIGVuZ2luZSBoYXMgc3RvcHBlZCwgZG8gbm90IHByb2NlZWQuXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzU3BlYWtpbmcgfHwgIXRoaXMuY3VycmVudElkcyB8fCAhdGhpcy5jdXJyZW50Vm9pY2UpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gRmlyc3QsIGZlZWQgZnVsZmlsbGVkIHJlcXVlc3RzIGludG8gdGhlIGF1ZGlvIGJ1ZmZlciwgaW4gRklGTyBvcmRlclxyXG4gICAgICAgIHRoaXMucGxheU5leHQoKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgZmlsbCBhbnkgZnJlZSBwZW5kaW5nIHNsb3RzIHdpdGggbmV3IHJlcXVlc3RzXHJcbiAgICAgICAgd2hpbGUgKHRoaXMuY3VycmVudElkc1swXSAmJiB0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCA8IDEwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGlkICAgPSB0aGlzLmN1cnJlbnRJZHMuc2hpZnQoKTtcclxuICAgICAgICAgICAgbGV0IHBhdGggPSBgJHt0aGlzLmN1cnJlbnRWb2ljZS52b2ljZVVSSX0vJHtpZH0ubXAzYDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucGVuZGluZ1JlcXMucHVzaCggbmV3IFZveFJlcXVlc3QocGF0aCkgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0b3AgcHVtcGluZyB3aGVuIHdlJ3JlIG91dCBvZiBJRHMgdG8gcXVldWUgYW5kIG5vdGhpbmcgaXMgcGxheWluZ1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRJZHMubGVuZ3RoICA8PSAwKVxyXG4gICAgICAgIGlmICh0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCA8PSAwKVxyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50QnVmTm9kZSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLnB1bXBUaW1lciA9IHNldFRpbWVvdXQodGhpcy5wdW1wLmJpbmQodGhpcyksIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBJZiB0aGVyZSdzIGEgcGVuZGluZyByZXF1ZXN0IGFuZCBpdCdzIHJlYWR5LCBhbmQgYSBidWZmZXIgbm9kZSBpcyBub3QgY3VycmVudGx5XHJcbiAgICAgKiBwbGF5aW5nLCB0aGVuIHRoYXQgbmV4dCBwZW5kaW5nIHJlcXVlc3QgaXMgcGxheWVkLiBUaGUgYnVmZmVyIG5vZGUgY3JlYXRlZCBieSB0aGlzXHJcbiAgICAgKiBtZXRob2QsIGF1dG9tYXRpY2FsbHkgY2FsbHMgdGhpcyBtZXRob2Qgd2hlbiBwbGF5aW5nIGlzIGRvbmUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcGxheU5leHQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBJZ25vcmUgaWYgdGhlcmUgYXJlIG5vIHBlbmRpbmcgcmVxdWVzdHNcclxuICAgICAgICBpZiAoIXRoaXMucGVuZGluZ1JlcXNbMF0gfHwgIXRoaXMucGVuZGluZ1JlcXNbMF0uaXNEb25lIHx8IHRoaXMuY3VycmVudEJ1Zk5vZGUpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IHJlcSA9IHRoaXMucGVuZGluZ1JlcXMuc2hpZnQoKSE7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdWT1ggUExBWUlORzonLCByZXEucGF0aCk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSBuZXh0IHJlcXVlc3QgZXJyb3JlZCBvdXQgKGJ1ZmZlciBtaXNzaW5nKSwgc2tpcCBpdFxyXG4gICAgICAgIC8vIFRPRE86IFJlcGxhY2Ugd2l0aCBzaWxlbmNlP1xyXG4gICAgICAgIGlmICghcmVxLmJ1ZmZlcilcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucGxheU5leHQoKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50QnVmTm9kZSAgICAgICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRCdWZOb2RlLmJ1ZmZlciA9IHJlcS5idWZmZXI7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgY29ubmVjdCB0byByZXZlcmIgaWYgaXQncyBhdmFpbGFibGVcclxuICAgICAgICB0aGlzLmN1cnJlbnRCdWZOb2RlLmNvbm5lY3QodGhpcy5hdWRpb0ZpbHRlcik7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QnVmTm9kZS5zdGFydCgpO1xyXG5cclxuICAgICAgICAvLyBIYXZlIHRoaXMgYnVmZmVyIG5vZGUgYXV0b21hdGljYWxseSB0cnkgdG8gcGxheSBuZXh0LCB3aGVuIGRvbmVcclxuICAgICAgICB0aGlzLmN1cnJlbnRCdWZOb2RlLm9uZW5kZWQgPSBfID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNTcGVha2luZylcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEJ1Zk5vZGUgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIHRoaXMucGxheU5leHQoKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHJlcXVlc3QgZm9yIGEgdm94IGZpbGUsIGltbWVkaWF0ZWx5IGJlZ3VuIG9uIGNyZWF0aW9uICovXHJcbmNsYXNzIFZveFJlcXVlc3Rcclxue1xyXG4gICAgLyoqIFJlbGF0aXZlIHJlbW90ZSBwYXRoIG9mIHRoaXMgdm9pY2UgZmlsZSByZXF1ZXN0ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgcGF0aCA6IHN0cmluZztcclxuICAgIC8qKiBXaGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBkb25lIGFuZCByZWFkeSBmb3IgaGFuZGxpbmcgKGV2ZW4gaWYgZmFpbGVkKSAqL1xyXG4gICAgcHVibGljIGlzRG9uZSAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogUmF3IGF1ZGlvIGRhdGEgZnJvbSB0aGUgbG9hZGVkIGZpbGUsIGlmIGF2YWlsYWJsZSAqL1xyXG4gICAgcHVibGljIGJ1ZmZlcj8gOiBBdWRpb0J1ZmZlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGF0aDogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBSRVFVRVNUOicsIHBhdGgpO1xyXG4gICAgICAgIHRoaXMucGF0aCA9IHBhdGg7XHJcblxyXG4gICAgICAgIGZldGNoKHBhdGgpXHJcbiAgICAgICAgICAgIC50aGVuICggdGhpcy5vbkZ1bGZpbGwuYmluZCh0aGlzKSApXHJcbiAgICAgICAgICAgIC5jYXRjaCggdGhpcy5vbkVycm9yLmJpbmQodGhpcykgICApO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBjYW5jZWwoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBUT0RPOiBDYW5jZWxsYXRpb24gY29udHJvbGxlcnNcclxuICAgIH1cclxuXHJcbiAgICAvKiogQmVnaW5zIGRlY29kaW5nIHRoZSBsb2FkZWQgTVAzIHZvaWNlIGZpbGUgdG8gcmF3IGF1ZGlvIGRhdGEgKi9cclxuICAgIHByaXZhdGUgb25GdWxmaWxsKHJlczogUmVzcG9uc2UpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghcmVzLm9rKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcihgVk9YIE5PVCBGT1VORDogJHtyZXMuc3RhdHVzfSBAICR7dGhpcy5wYXRofWApO1xyXG5cclxuICAgICAgICByZXMuYXJyYXlCdWZmZXIoKS50aGVuKCB0aGlzLm9uQXJyYXlCdWZmZXIuYmluZCh0aGlzKSApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25BcnJheUJ1ZmZlcihidWZmZXI6IEFycmF5QnVmZmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBTb3VuZHMuZGVjb2RlKFJBRy5zcGVlY2gudm94RW5naW5lLmF1ZGlvQ29udGV4dCwgYnVmZmVyKVxyXG4gICAgICAgICAgICAudGhlbiAoIHRoaXMub25EZWNvZGUuYmluZCh0aGlzKSApXHJcbiAgICAgICAgICAgIC5jYXRjaCggdGhpcy5vbkVycm9yLmJpbmQodGhpcykgICk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbkRlY29kZShidWZmZXI6IEF1ZGlvQnVmZmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmJ1ZmZlciA9IGJ1ZmZlcjtcclxuICAgICAgICB0aGlzLmlzRG9uZSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbkVycm9yKGVycjogYW55KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnUkVRVUVTVCBGQUlMOicsIGVycik7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBocmFzZSBlZGl0b3IgKi9cclxuY2xhc3MgRWRpdG9yXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSBjb250YWluZXIgZm9yIHRoZSBlZGl0b3IgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIGRpYWxvZywgaWYgYW55ICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRQaWNrZXI/IDogUGlja2VyO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlIGVsZW1lbnQgY3VycmVudGx5IGJlaW5nIGVkaXRlZCwgaWYgYW55ICovXHJcbiAgICAvLyBEbyBub3QgRFJZOyBuZWVkcyB0byBiZSBwYXNzZWQgdG8gdGhlIHBpY2tlciBmb3IgY2xlYW5lciBjb2RlXHJcbiAgICBwcml2YXRlIGRvbUVkaXRpbmc/ICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSA9IERPTS5yZXF1aXJlKCcjZWRpdG9yJyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkub25jbGljayA9IHRoaXMub25DbGljay5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHdpbmRvdy5vbnJlc2l6ZSAgICAgICA9IHRoaXMub25SZXNpemUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbS5vbnNjcm9sbCAgICAgPSB0aGlzLm9uU2Nyb2xsLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb20udGV4dENvbnRlbnQgID0gTC5FRElUT1JfSU5JVCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyB0aGUgZWRpdG9yIHdpdGggYSByb290IHBocmFzZXNldCByZWZlcmVuY2UsIGFuZCBleHBhbmRzIGl0IGludG8gSFRNTCAqL1xyXG4gICAgcHVibGljIGdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJzxwaHJhc2VzZXQgcmVmPVwicm9vdFwiIC8+JztcclxuXHJcbiAgICAgICAgUkFHLnBocmFzZXIucHJvY2Vzcyh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIC8vIEZvciBzY3JvbGwtcGFzdCBwYWRkaW5nIHVuZGVyIHRoZSBwaHJhc2VcclxuICAgICAgICBsZXQgcGFkZGluZyAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICBwYWRkaW5nLmNsYXNzTmFtZSA9ICdib3R0b21QYWRkaW5nJztcclxuXHJcbiAgICAgICAgdGhpcy5kb20uYXBwZW5kQ2hpbGQocGFkZGluZyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcHJvY2Vzc2VzIGFsbCBwaHJhc2VzZXQgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHJlZiwgaWYgdGhlaXIgaW5kZXggaGFzIGNoYW5nZWQgKi9cclxuICAgIHB1YmxpYyByZWZyZXNoUGhyYXNlc2V0KHJlZjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBOb3RlLCB0aGlzIGNvdWxkIHBvdGVudGlhbGx5IGJ1ZyBvdXQgaWYgYSBwaHJhc2VzZXQncyBkZXNjZW5kYW50IHJlZmVyZW5jZXNcclxuICAgICAgICAvLyB0aGUgc2FtZSBwaHJhc2VzZXQgKHJlY3Vyc2lvbikuIEJ1dCB0aGlzIGlzIG9rYXkgYmVjYXVzZSBwaHJhc2VzZXRzIHNob3VsZFxyXG4gICAgICAgIC8vIG5ldmVyIGluY2x1ZGUgdGhlbXNlbHZlcywgZXZlbiBldmVudHVhbGx5LlxyXG5cclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuW2RhdGEtdHlwZT1waHJhc2VzZXRdW2RhdGEtcmVmPSR7cmVmfV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChfID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50ICAgID0gXyBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncGhyYXNlc2V0Jyk7XHJcbiAgICAgICAgICAgICAgICBsZXQgY2hhbmNlICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY2hhbmNlJ107XHJcblxyXG4gICAgICAgICAgICAgICAgbmV3RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JlZicsIHJlZik7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGNoYW5jZSlcclxuICAgICAgICAgICAgICAgICAgICBuZXdFbGVtZW50LnNldEF0dHJpYnV0ZSgnY2hhbmNlJywgY2hhbmNlKTtcclxuXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MobmV3RWxlbWVudC5wYXJlbnRFbGVtZW50ISk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhIHN0YXRpYyBOb2RlTGlzdCBvZiBhbGwgcGhyYXNlIGVsZW1lbnRzIG9mIHRoZSBnaXZlbiBxdWVyeS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgUXVlcnkgc3RyaW5nIHRvIGFkZCBvbnRvIHRoZSBgc3BhbmAgc2VsZWN0b3JcclxuICAgICAqIEByZXR1cm5zIE5vZGUgbGlzdCBvZiBhbGwgZWxlbWVudHMgbWF0Y2hpbmcgdGhlIGdpdmVuIHNwYW4gcXVlcnlcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldEVsZW1lbnRzQnlRdWVyeShxdWVyeTogc3RyaW5nKSA6IE5vZGVMaXN0XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoYHNwYW4ke3F1ZXJ5fWApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHBocmFzZSdzIHJvb3QgRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2UoKSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmZpcnN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHBocmFzZSBpbiB0aGUgZWRpdG9yIGFzIHRleHQsIGV4Y2x1ZGluZyB0aGUgaGlkZGVuIHBhcnRzICovXHJcbiAgICBwdWJsaWMgZ2V0VGV4dCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIERPTS5nZXRDbGVhbmVkVmlzaWJsZVRleHQodGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgYWxsIHBocmFzZSBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gdHlwZSwgYW5kIHNldHMgdGhlaXIgdGV4dCB0byBnaXZlbiB2YWx1ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdHlwZSBPcmlnaW5hbCBYTUwgbmFtZSBvZiBlbGVtZW50cyB0byByZXBsYWNlIGNvbnRlbnRzIG9mXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgTmV3IHRleHQgZm9yIHRoZSBmb3VuZCBlbGVtZW50cyB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEVsZW1lbnRzVGV4dCh0eXBlOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPSR7dHlwZX1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgYW55IGN1cnJlbnRseSBvcGVuIGVkaXRvciBkaWFsb2dzICovXHJcbiAgICBwdWJsaWMgY2xvc2VEaWFsb2coKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIuY2xvc2UoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZG9tRWRpdGluZylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5yZW1vdmVBdHRyaWJ1dGUoJ2VkaXRpbmcnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2Fib3ZlJywgJ2JlbG93Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGEgY2xpY2sgYW55d2hlcmUgaW4gdGhlIHdpbmRvdyBkZXBlbmRpbmcgb24gdGhlIGNvbnRleHQgKi9cclxuICAgIHByaXZhdGUgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhcmdldCA9IGV2LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgdHlwZSAgID0gdGFyZ2V0ID8gdGFyZ2V0LmRhdGFzZXRbJ3R5cGUnXSAgICA6IHVuZGVmaW5lZDtcclxuICAgICAgICBsZXQgcGlja2VyID0gdHlwZSAgID8gUkFHLnZpZXdzLmdldFBpY2tlcih0eXBlKSA6IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKCF0YXJnZXQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNsb3NlRGlhbG9nKCk7XHJcblxyXG4gICAgICAgIC8vIFJlZGlyZWN0IGNsaWNrcyBvZiBpbm5lciBlbGVtZW50c1xyXG4gICAgICAgIGlmICggdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnaW5uZXInKSAmJiB0YXJnZXQucGFyZW50RWxlbWVudCApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0YXJnZXQgPSB0YXJnZXQucGFyZW50RWxlbWVudDtcclxuICAgICAgICAgICAgdHlwZSAgID0gdGFyZ2V0LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICAgICAgcGlja2VyID0gdHlwZSA/IFJBRy52aWV3cy5nZXRQaWNrZXIodHlwZSkgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIHRvIGFueSBpbm5lciBkb2N1bWVudCBvciB1bm93bmVkIGVsZW1lbnRcclxuICAgICAgICBpZiAoICFkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3MgdG8gYW55IGVsZW1lbnQgb2YgYWxyZWFkeSBvcGVuIHBpY2tlcnNcclxuICAgICAgICBpZiAoIHRoaXMuY3VycmVudFBpY2tlciApXHJcbiAgICAgICAgaWYgKCB0aGlzLmN1cnJlbnRQaWNrZXIuZG9tLmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbnkgb3BlbiBlZGl0b3JzXHJcbiAgICAgICAgbGV0IHByZXZUYXJnZXQgPSB0aGlzLmRvbUVkaXRpbmc7XHJcbiAgICAgICAgdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBJZiBjbGlja2luZyB0aGUgZWxlbWVudCBhbHJlYWR5IGJlaW5nIGVkaXRlZCwgZG9uJ3QgcmVvcGVuXHJcbiAgICAgICAgaWYgKHRhcmdldCA9PT0gcHJldlRhcmdldClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgY29sbGFwc2libGUgZWxlbWVudHNcclxuICAgICAgICBpZiAoIHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3RvZ2dsZScpIClcclxuICAgICAgICAgICAgdGhpcy50b2dnbGVDb2xsYXBzaWFibGUodGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gRmluZCBhbmQgb3BlbiBwaWNrZXIgZm9yIHRoZSB0YXJnZXQgZWxlbWVudFxyXG4gICAgICAgIGVsc2UgaWYgKHR5cGUgJiYgcGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLm9wZW5QaWNrZXIodGFyZ2V0LCBwaWNrZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZS1sYXlvdXQgdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBvbiByZXNpemUgKi9cclxuICAgIHByaXZhdGUgb25SZXNpemUoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRQaWNrZXIpXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpY2tlci5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmUtbGF5b3V0IHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgb24gc2Nyb2xsICovXHJcbiAgICBwcml2YXRlIG9uU2Nyb2xsKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBXb3JrYXJvdW5kIGZvciBsYXlvdXQgYmVoYXZpbmcgd2VpcmQgd2hlbiBpT1Mga2V5Ym9hcmQgaXMgb3BlblxyXG4gICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlci5oYXNGb2N1cygpKVxyXG4gICAgICAgICAgICBET00uYmx1ckFjdGl2ZSgpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGbGlwcyB0aGUgY29sbGFwc2Ugc3RhdGUgb2YgYSBjb2xsYXBzaWJsZSwgYW5kIHByb3BhZ2F0ZXMgdGhlIG5ldyBzdGF0ZSB0byBvdGhlclxyXG4gICAgICogY29sbGFwc2libGVzIG9mIHRoZSBzYW1lIHJlZmVyZW5jZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IENvbGxhcHNpYmxlIGVsZW1lbnQgYmVpbmcgdG9nZ2xlZFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHRvZ2dsZUNvbGxhcHNpYWJsZSh0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICAgICA9IHRhcmdldC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgcmVmICAgICAgICA9IERPTS5yZXF1aXJlRGF0YShwYXJlbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgdHlwZSAgICAgICA9IERPTS5yZXF1aXJlRGF0YShwYXJlbnQsICd0eXBlJyk7XHJcbiAgICAgICAgbGV0IGNvbGxhcGFzZWQgPSBwYXJlbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKTtcclxuXHJcbiAgICAgICAgLy8gUHJvcGFnYXRlIG5ldyBjb2xsYXBzZSBzdGF0ZSB0byBhbGwgY29sbGFwc2libGVzIG9mIHRoZSBzYW1lIHJlZlxyXG4gICAgICAgIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoYHNwYW5bZGF0YS10eXBlPSR7dHlwZX1dW2RhdGEtcmVmPSR7cmVmfV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChfID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBwaHJhc2VzZXQgPSBfIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgbGV0IHRvZ2dsZSAgICA9IHBocmFzZXNldC5jaGlsZHJlblswXSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBTa2lwIHNhbWUtcmVmIGVsZW1lbnRzIHRoYXQgYXJlbid0IGNvbGxhcHNpYmxlXHJcbiAgICAgICAgICAgICAgICBpZiAoICF0b2dnbGUgfHwgIXRvZ2dsZS5jbGFzc0xpc3QuY29udGFpbnMoJ3RvZ2dsZScpIClcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAgICAgQ29sbGFwc2libGVzLnNldChwaHJhc2VzZXQsIHRvZ2dsZSwgIWNvbGxhcGFzZWQpO1xyXG4gICAgICAgICAgICAgICAgLy8gRG9uJ3QgbW92ZSB0aGlzIHRvIHNldENvbGxhcHNpYmxlLCBhcyBzdGF0ZSBzYXZlL2xvYWQgaXMgaGFuZGxlZFxyXG4gICAgICAgICAgICAgICAgLy8gb3V0c2lkZSBpbiBib3RoIHVzYWdlcyBvZiBzZXRDb2xsYXBzaWJsZS5cclxuICAgICAgICAgICAgICAgIFJBRy5zdGF0ZS5zZXRDb2xsYXBzZWQocmVmLCAhY29sbGFwYXNlZCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogT3BlbnMgYSBwaWNrZXIgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWRpdG9yIGVsZW1lbnQgdG8gb3BlbiB0aGUgcGlja2VyIGZvclxyXG4gICAgICogQHBhcmFtIHBpY2tlciBQaWNrZXIgdG8gb3BlblxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9wZW5QaWNrZXIodGFyZ2V0OiBIVE1MRWxlbWVudCwgcGlja2VyOiBQaWNrZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRhcmdldC5zZXRBdHRyaWJ1dGUoJ2VkaXRpbmcnLCAndHJ1ZScpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIgPSBwaWNrZXI7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nICAgID0gdGFyZ2V0O1xyXG4gICAgICAgIHBpY2tlci5vcGVuKHRhcmdldCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUgKi9cclxuY2xhc3MgTWFycXVlZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYXJxdWVlJ3MgRE9NIGVsZW1lbnQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc3BhbiBlbGVtZW50IGluIHRoZSBtYXJxdWVlLCB3aGVyZSB0aGUgdGV4dCBpcyBzZXQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tU3BhbiA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgSUQgZm9yIHRoZSBzY3JvbGxpbmcgYW5pbWF0aW9uIHRpbWVyICovXHJcbiAgICBwcml2YXRlIHRpbWVyICA6IG51bWJlciA9IDA7XHJcbiAgICAvKiogQ3VycmVudCBvZmZzZXQgKGluIHBpeGVscykgb2YgdGhlIHNjcm9sbGluZyBtYXJxdWVlICovXHJcbiAgICBwcml2YXRlIG9mZnNldCA6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSAgICAgPSBET00ucmVxdWlyZSgnI21hcnF1ZWUnKTtcclxuICAgICAgICB0aGlzLmRvbVNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmlubmVySFRNTCA9ICcnO1xyXG4gICAgICAgIHRoaXMuZG9tLmFwcGVuZENoaWxkKHRoaXMuZG9tU3Bhbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIG1lc3NhZ2Ugb24gdGhlIHNjcm9sbGluZyBtYXJxdWVlLCBhbmQgc3RhcnRzIGFuaW1hdGluZyBpdCAqL1xyXG4gICAgcHVibGljIHNldChtc2c6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNwYW4udGV4dENvbnRlbnQgPSBtc2c7XHJcbiAgICAgICAgdGhpcy5vZmZzZXQgICAgICAgICAgICAgID0gdGhpcy5kb20uY2xpZW50V2lkdGg7XHJcblxyXG4gICAgICAgIC8vIEkgdHJpZWQgdG8gdXNlIENTUyBhbmltYXRpb24gZm9yIHRoaXMsIGJ1dCBjb3VsZG4ndCBmaWd1cmUgb3V0IGhvdyBmb3IgYVxyXG4gICAgICAgIC8vIGR5bmFtaWNhbGx5IHNpemVkIGVsZW1lbnQgbGlrZSB0aGUgc3Bhbi5cclxuICAgICAgICBsZXQgbGltaXQgPSAtdGhpcy5kb21TcGFuLmNsaWVudFdpZHRoIC0gMTAwO1xyXG4gICAgICAgIGxldCBhbmltICA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLm9mZnNldCAtPSAoRE9NLmlzTW9iaWxlID8gNSA6IDcpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGVYKCR7dGhpcy5vZmZzZXR9cHgpYDtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9mZnNldCA8IGxpbWl0KVxyXG4gICAgICAgICAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWVyID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdG9wcyB0aGUgY3VycmVudCBtYXJxdWVlIGFuaW1hdGlvbiAqL1xyXG4gICAgcHVibGljIHN0b3AoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy50aW1lcik7XHJcbiAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG5jbGFzcyBTZXR0aW5nc1xyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjb250YWluZXIgZm9yIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHByaXZhdGUgZG9tICAgICAgICAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgXCJSZXNldCBzZXR0aW5nc1wiIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5SZXNldCAgICAgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBcIlNhdmUgYW5kIGNsb3NlXCIgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blNhdmUgICAgICAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHZvaWNlIHNlbGVjdGlvbiBib3ggKi9cclxuICAgIHByaXZhdGUgc2VsU3BlZWNoVm9pY2UgICA6IEhUTUxTZWxlY3RFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgdm9pY2Ugdm9sdW1lIHNsaWRlciAqL1xyXG4gICAgcHJpdmF0ZSByYW5nZVNwZWVjaFZvbCAgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHZvaWNlIHBpdGNoIHNsaWRlciAqL1xyXG4gICAgcHJpdmF0ZSByYW5nZVNwZWVjaFBpdGNoIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHZvaWNlIHJhdGUgc2xpZGVyICovXHJcbiAgICBwcml2YXRlIHJhbmdlU3BlZWNoUmF0ZSAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc3BlZWNoIHRlc3QgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blNwZWVjaFRlc3QgICAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgdGltZXIgZm9yIHRoZSBcIlJlc2V0XCIgYnV0dG9uIGNvbmZpcm1hdGlvbiBzdGVwICovXHJcbiAgICBwcml2YXRlIHJlc2V0VGltZW91dD8gICAgOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICAvLyBHZW5lcmFsIHNldHRpbmdzIGZvcm1cclxuXHJcbiAgICAgICAgdGhpcy5kb20gICAgICA9IERPTS5yZXF1aXJlKCcjc2V0dGluZ3NTY3JlZW4nKTtcclxuICAgICAgICB0aGlzLmJ0blJlc2V0ID0gRE9NLnJlcXVpcmUoJyNidG5SZXNldFNldHRpbmdzJyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlICA9IERPTS5yZXF1aXJlKCcjYnRuU2F2ZVNldHRpbmdzJyk7XHJcblxyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQub25jbGljayA9IHRoaXMuaGFuZGxlUmVzZXQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUub25jbGljayAgPSB0aGlzLmhhbmRsZVNhdmUuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gU3BlZWNoIGZvcm1cclxuXHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZSAgID0gRE9NLnJlcXVpcmUoJyNzZWxTcGVlY2hDaG9pY2UnKTtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoVm9sICAgPSBET00ucmVxdWlyZSgnI3JhbmdlU3BlZWNoVm9sJyk7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFBpdGNoID0gRE9NLnJlcXVpcmUoJyNyYW5nZVNwZWVjaFBpdGNoJyk7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFJhdGUgID0gRE9NLnJlcXVpcmUoJyNyYW5nZVNwZWVjaFJhdGUnKTtcclxuICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3QgICAgPSBET00ucmVxdWlyZSgnI2J0blNwZWVjaFRlc3QnKTtcclxuXHJcbiAgICAgICAgdGhpcy5idG5TcGVlY2hUZXN0Lm9uY2xpY2sgPSB0aGlzLmhhbmRsZVZvaWNlVGVzdC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBMZWdhbCBhbmQgYWNrbm93bGVkZ2VtZW50c1xyXG5cclxuICAgICAgICBMaW5rZG93bi5wYXJzZSggRE9NLnJlcXVpcmUoJyNsZWdhbEJsb2NrJykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogT3BlbnMgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljIG9wZW4oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuXHJcbiAgICAgICAgLy8gVGhlIHZvaWNlIGxpc3QgaGFzIHRvIGJlIHBvcHVsYXRlZCBlYWNoIG9wZW4sIGluIGNhc2UgaXQgY2hhbmdlc1xyXG4gICAgICAgIHRoaXMucG9wdWxhdGVWb2ljZUxpc3QoKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZS5zZWxlY3RlZEluZGV4ICAgPSBSQUcuY29uZmlnLnNwZWVjaFZvaWNlO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWVBc051bWJlciAgID0gUkFHLmNvbmZpZy5zcGVlY2hWb2w7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlQXNOdW1iZXIgPSBSQUcuY29uZmlnLnNwZWVjaFBpdGNoO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlQXNOdW1iZXIgID0gUkFHLmNvbmZpZy5zcGVlY2hSYXRlO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxSZXNldCgpO1xyXG4gICAgICAgIFJBRy5zcGVlY2guY2FuY2VsKCk7XHJcbiAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XHJcbiAgICAgICAgRE9NLmJsdXJBY3RpdmUodGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbGVhcnMgYW5kIHBvcHVsYXRlcyB0aGUgdm9pY2UgbGlzdCAqL1xyXG4gICAgcHJpdmF0ZSBwb3B1bGF0ZVZvaWNlTGlzdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuc2VsU3BlZWNoVm9pY2UuaW5uZXJIVE1MID0gJyc7XHJcblxyXG4gICAgICAgIGxldCB2b2ljZXMgPSBSQUcuc3BlZWNoLmdldFZvaWNlcygpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgZW1wdHkgbGlzdFxyXG4gICAgICAgIGlmICh2b2ljZXMubGVuZ3RoIDw9IDApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgb3B0aW9uICAgICAgPSBET00uYWRkT3B0aW9uKCB0aGlzLnNlbFNwZWVjaFZvaWNlLCBMLlNUX1NQRUVDSF9FTVBUWSgpICk7XHJcbiAgICAgICAgICAgIG9wdGlvbi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9TcGVlY2hTeW50aGVzaXNcclxuICAgICAgICBlbHNlIGZvciAobGV0IGkgPSAwOyBpIDwgdm9pY2VzLmxlbmd0aCA7IGkrKylcclxuICAgICAgICAgICAgRE9NLmFkZE9wdGlvbih0aGlzLnNlbFNwZWVjaFZvaWNlLCBgJHt2b2ljZXNbaV0ubmFtZX0gKCR7dm9pY2VzW2ldLmxhbmd9KWApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSByZXNldCBidXR0b24sIHdpdGggYSBjb25maXJtIHN0ZXAgdGhhdCBjYW5jZWxzIGFmdGVyIDE1IHNlY29uZHMgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlUmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMucmVzZXRUaW1lb3V0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5yZXNldFRpbWVvdXQgICAgICAgPSBzZXRUaW1lb3V0KHRoaXMuY2FuY2VsUmVzZXQuYmluZCh0aGlzKSwgMTUwMDApO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blJlc2V0LmlubmVyVGV4dCA9IEwuU1RfUkVTRVRfQ09ORklSTSgpO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blJlc2V0LnRpdGxlICAgICA9IEwuU1RfUkVTRVRfQ09ORklSTV9UKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFJBRy5jb25maWcucmVzZXQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIHRoaXMuY2FuY2VsUmVzZXQoKTtcclxuICAgICAgICB0aGlzLm9wZW4oKTtcclxuICAgICAgICBhbGVydCggTC5TVF9SRVNFVF9ET05FKCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2FuY2VsIHRoZSByZXNldCB0aW1lb3V0IGFuZCByZXN0b3JlIHRoZSByZXNldCBidXR0b24gdG8gbm9ybWFsICovXHJcbiAgICBwcml2YXRlIGNhbmNlbFJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnJlc2V0VGltZW91dCk7XHJcbiAgICAgICAgdGhpcy5idG5SZXNldC5pbm5lclRleHQgPSBMLlNUX1JFU0VUKCk7XHJcbiAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX1QoKTtcclxuICAgICAgICB0aGlzLnJlc2V0VGltZW91dCAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2F2ZSBidXR0b24sIHNhdmluZyBjb25maWcgdG8gc3RvcmFnZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVTYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2ljZSAgPSB0aGlzLnNlbFNwZWVjaFZvaWNlLnNlbGVjdGVkSW5kZXg7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2wgICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2ggID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoUGl0Y2gudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSAgID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZSk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zYXZlKCk7XHJcbiAgICAgICAgdGhpcy5jbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzcGVlY2ggdGVzdCBidXR0b24sIHNwZWFraW5nIGEgdGVzdCBwaHJhc2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlVm9pY2VUZXN0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEhhcyB0byBleGVjdXRlIG9uIGEgZGVsYXksIGFzIHNwZWVjaCBjYW5jZWwgaXMgdW5yZWxpYWJsZSB3aXRob3V0IGl0XHJcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgbGV0IHRpbWUgICA9IFN0cmluZ3MuZnJvbVRpbWUoIG5ldyBEYXRlKCkgKTtcclxuICAgICAgICAgICAgbGV0IHBocmFzZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHJcbiAgICAgICAgICAgIHBocmFzZS5pbm5lckhUTUwgPSAnPHNwYW4gZGF0YS10eXBlPVwicGhyYXNlXCIgZGF0YS1yZWY9XCJzYW1wbGVcIj4nICtcclxuICAgICAgICAgICAgICAgICdUaGlzIGlzIGEgdGVzdCBvZiB0aGUgUmFpbCBBbm5vdW5jZW1lbnQgR2VuZXJhdG9yIGF0JyArXHJcbiAgICAgICAgICAgICAgICAnPHNwYW4gZGF0YS10eXBlPVwidGltZVwiPicgKyB0aW1lICsgJzwvc3Bhbj4nICtcclxuICAgICAgICAgICAgICAgICc8L3NwYW4+JztcclxuXHJcbiAgICAgICAgICAgIFJBRy5zcGVlY2guc3BlYWsoXHJcbiAgICAgICAgICAgICAgICBwaHJhc2UuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LFxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHZvaWNlSWR4IDogdGhpcy5zZWxTcGVlY2hWb2ljZS5zZWxlY3RlZEluZGV4LFxyXG4gICAgICAgICAgICAgICAgICAgIHZvbHVtZSAgIDogdGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHBpdGNoICAgIDogdGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlQXNOdW1iZXIsXHJcbiAgICAgICAgICAgICAgICAgICAgcmF0ZSAgICAgOiB0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZUFzTnVtYmVyXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfSwgMjAwKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSB0b3AgdG9vbGJhciAqL1xyXG5jbGFzcyBUb29sYmFyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGNvbnRhaW5lciBmb3IgdGhlIHRvb2xiYXIgKi9cclxuICAgIHByaXZhdGUgZG9tICAgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBsYXkgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blBsYXkgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzdG9wIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5TdG9wICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgZ2VuZXJhdGUgcmFuZG9tIHBocmFzZSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuR2VuZXJhdGUgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNhdmUgc3RhdGUgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blNhdmUgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSByZWNhbGwgc3RhdGUgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blJlY2FsbCAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzZXR0aW5ncyBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuT3B0aW9uICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgPSBET00ucmVxdWlyZSgnI3Rvb2xiYXInKTtcclxuICAgICAgICB0aGlzLmJ0blBsYXkgICAgID0gRE9NLnJlcXVpcmUoJyNidG5QbGF5Jyk7XHJcbiAgICAgICAgdGhpcy5idG5TdG9wICAgICA9IERPTS5yZXF1aXJlKCcjYnRuU3RvcCcpO1xyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUgPSBET00ucmVxdWlyZSgnI2J0blNodWZmbGUnKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUgICAgID0gRE9NLnJlcXVpcmUoJyNidG5TYXZlJyk7XHJcbiAgICAgICAgdGhpcy5idG5SZWNhbGwgICA9IERPTS5yZXF1aXJlKCcjYnRuTG9hZCcpO1xyXG4gICAgICAgIHRoaXMuYnRuT3B0aW9uICAgPSBET00ucmVxdWlyZSgnI2J0blNldHRpbmdzJyk7XHJcblxyXG4gICAgICAgIHRoaXMuYnRuU3RvcC5vbmNsaWNrICAgICA9IHRoaXMuaGFuZGxlU3RvcC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUub25jbGljayA9IHRoaXMuaGFuZGxlR2VuZXJhdGUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUub25jbGljayAgICAgPSB0aGlzLmhhbmRsZVNhdmUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blJlY2FsbC5vbmNsaWNrICAgPSB0aGlzLmhhbmRsZUxvYWQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0bk9wdGlvbi5vbmNsaWNrICAgPSB0aGlzLmhhbmRsZU9wdGlvbi5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICB0aGlzLmJ0blBsYXkub25jbGljayA9IGV2ID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBIYXMgdG8gZXhlY3V0ZSBvbiBhIGRlbGF5LCBhcyBzcGVlY2ggY2FuY2VsIGlzIHVucmVsaWFibGUgd2l0aG91dCBpdFxyXG4gICAgICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dCh0aGlzLmhhbmRsZVBsYXkuYmluZCh0aGlzKSwgMjAwKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBBZGQgdGhyb2IgY2xhc3MgaWYgdGhlIGdlbmVyYXRlIGJ1dHRvbiBoYXNuJ3QgYmVlbiBjbGlja2VkIGJlZm9yZVxyXG4gICAgICAgIGlmICghUkFHLmNvbmZpZy5jbGlja2VkR2VuZXJhdGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmNsYXNzTGlzdC5hZGQoJ3Rocm9iJyk7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgcGxheSBidXR0b24sIHBsYXlpbmcgdGhlIGVkaXRvcidzIGN1cnJlbnQgcGhyYXNlIHdpdGggc3BlZWNoICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVBsYXkoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBOb3RlOiBJdCB3b3VsZCBiZSBuaWNlIHRvIGhhdmUgdGhlIHBsYXkgYnV0dG9uIGNoYW5nZSB0byB0aGUgc3RvcCBidXR0b24gYW5kXHJcbiAgICAgICAgLy8gYXV0b21hdGljYWxseSBjaGFuZ2UgYmFjay4gSG93ZXZlciwgc3BlZWNoJ3MgJ29uZW5kJyBldmVudCB3YXMgZm91bmQgdG8gYmVcclxuICAgICAgICAvLyB1bnJlbGlhYmxlLCBzbyBJIGRlY2lkZWQgdG8ga2VlcCBwbGF5IGFuZCBzdG9wIHNlcGFyYXRlLlxyXG5cclxuICAgICAgICBSQUcuc3BlZWNoLnNwZWFrKCBSQUcudmlld3MuZWRpdG9yLmdldFBocmFzZSgpICk7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBSQUcudmlld3MuZWRpdG9yLmdldFRleHQoKSApO1xyXG4gICAgICAgIHRoaXMuYnRuUGxheS5kaXNhYmxlZCA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzdG9wIGJ1dHRvbiwgc3RvcHBpbmcgdGhlIG1hcnF1ZWUgYW5kIGFueSBzcGVlY2ggKi9cclxuICAgIHByaXZhdGUgaGFuZGxlU3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zcGVlY2guY2FuY2VsKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBnZW5lcmF0ZSBidXR0b24sIGdlbmVyYXRpbmcgbmV3IHJhbmRvbSBzdGF0ZSBhbmQgcGhyYXNlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gUmVtb3ZlIHRoZSBjYWxsLXRvLWFjdGlvbiB0aHJvYiBmcm9tIGluaXRpYWwgbG9hZFxyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuY2xhc3NMaXN0LnJlbW92ZSgndGhyb2InKTtcclxuICAgICAgICBSQUcuZ2VuZXJhdGUoKTtcclxuICAgICAgICBSQUcuY29uZmlnLmNsaWNrZWRHZW5lcmF0ZSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNhdmUgYnV0dG9uLCBwZXJzaXN0aW5nIHRoZSBjdXJyZW50IHRyYWluIHN0YXRlIHRvIHN0b3JhZ2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlU2F2ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGNzcyA9ICdmb250LXNpemU6IGxhcmdlOyBmb250LXdlaWdodDogYm9sZDsnO1xyXG4gICAgICAgICAgICBsZXQgcmF3ID0gSlNPTi5zdHJpbmdpZnkoUkFHLnN0YXRlKTtcclxuICAgICAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdzdGF0ZScsIHJhdyk7XHJcblxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhMLlNUQVRFX0NPUFlfUEFTVEUoKSwgY3NzKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJSQUcubG9hZCgnXCIsIHJhdy5yZXBsYWNlKFwiJ1wiLCBcIlxcXFwnXCIpLCBcIicpXCIpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhMLlNUQVRFX1JBV19KU09OKCksIGNzcyk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHJhdyk7XHJcblxyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfVE9fU1RPUkFHRSgpICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX1NBVkVfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBsb2FkIGJ1dHRvbiwgbG9hZGluZyB0cmFpbiBzdGF0ZSBmcm9tIHN0b3JhZ2UsIGlmIGl0IGV4aXN0cyAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVMb2FkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGRhdGEgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3N0YXRlJyk7XHJcblxyXG4gICAgICAgIHJldHVybiBkYXRhXHJcbiAgICAgICAgICAgID8gUkFHLmxvYWQoZGF0YSlcclxuICAgICAgICAgICAgOiBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfU0FWRV9NSVNTSU5HKCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2V0dGluZ3MgYnV0dG9uLCBvcGVuaW5nIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHByaXZhdGUgaGFuZGxlT3B0aW9uKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnZpZXdzLnNldHRpbmdzLm9wZW4oKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgVUkgZWxlbWVudHMgYW5kIHRoZWlyIGxvZ2ljICovXHJcbmNsYXNzIFZpZXdzXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gZWRpdG9yIGNvbXBvbmVudCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBlZGl0b3IgICA6IEVkaXRvcjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gbWFycXVlZSBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbWFycXVlZSAgOiBNYXJxdWVlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc2V0dGluZ3MgOiBTZXR0aW5ncztcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gdG9vbGJhciBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgdG9vbGJhciAgOiBUb29sYmFyO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gYWxsIHRoZSBwaWNrZXJzLCBvbmUgZm9yIGVhY2ggdHlwZSBvZiBYTUwgZWxlbWVudCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBwaWNrZXJzICA6IERpY3Rpb25hcnk8UGlja2VyPjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZWRpdG9yICAgPSBuZXcgRWRpdG9yKCk7XHJcbiAgICAgICAgdGhpcy5tYXJxdWVlICA9IG5ldyBNYXJxdWVlKCk7XHJcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IG5ldyBTZXR0aW5ncygpO1xyXG4gICAgICAgIHRoaXMudG9vbGJhciAgPSBuZXcgVG9vbGJhcigpO1xyXG4gICAgICAgIHRoaXMucGlja2VycyAgPSB7fTtcclxuXHJcbiAgICAgICAgW1xyXG4gICAgICAgICAgICBuZXcgQ29hY2hQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IEV4Y3VzZVBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgSW50ZWdlclBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgTmFtZWRQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFBocmFzZXNldFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgUGxhdGZvcm1QaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFNlcnZpY2VQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFN0YXRpb25QaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFN0YXRpb25MaXN0UGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBUaW1lUGlja2VyKClcclxuICAgICAgICBdLmZvckVhY2gocGlja2VyID0+IHRoaXMucGlja2Vyc1twaWNrZXIueG1sVGFnXSA9IHBpY2tlcik7XHJcblxyXG4gICAgICAgIC8vIEdsb2JhbCBob3RrZXlzXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5vbmtleWRvd24gPSB0aGlzLm9uSW5wdXQuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaU9TLXNwZWNpZmljIENTUyBmaXhlc1xyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZCgnaW9zJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIHBpY2tlciB0aGF0IGhhbmRsZXMgYSBnaXZlbiB0YWcsIGlmIGFueSAqL1xyXG4gICAgcHVibGljIGdldFBpY2tlcih4bWxUYWc6IHN0cmluZykgOiBQaWNrZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5waWNrZXJzW3htbFRhZ107XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZSBFU0MgdG8gY2xvc2UgcGlja2VycyBvciBzZXR0aWducyAqL1xyXG4gICAgcHJpdmF0ZSBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoZXYua2V5ICE9PSAnRXNjYXBlJylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MuY2xvc2UoKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIGNvbGxhcHNpYmxlIGVsZW1lbnRzICovXHJcbmNsYXNzIENvbGxhcHNpYmxlc1xyXG57XHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc3BhbiBUaGUgZW5jYXBzdWxhdGluZyBjb2xsYXBzaWJsZSBlbGVtZW50XHJcbiAgICAgKiBAcGFyYW0gdG9nZ2xlIFRoZSB0b2dnbGUgY2hpbGQgb2YgdGhlIGNvbGxhcHNpYmxlIGVsZW1lbnRcclxuICAgICAqIEBwYXJhbSBzdGF0ZSBUcnVlIHRvIGNvbGxhcHNlLCBmYWxzZSB0byBvcGVuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2V0KHNwYW46IEhUTUxFbGVtZW50LCB0b2dnbGU6IEhUTUxFbGVtZW50LCBzdGF0ZTogYm9vbGVhbikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgPSBzcGFuLmRhdGFzZXRbJ3JlZiddIHx8ICc/Pz8nO1xyXG4gICAgICAgIGxldCB0eXBlID0gc3Bhbi5kYXRhc2V0Wyd0eXBlJ10hO1xyXG5cclxuICAgICAgICBpZiAoc3RhdGUpIHNwYW4uc2V0QXR0cmlidXRlKCdjb2xsYXBzZWQnLCAnJyk7XHJcbiAgICAgICAgZWxzZSAgICAgICBzcGFuLnJlbW92ZUF0dHJpYnV0ZSgnY29sbGFwc2VkJyk7XHJcblxyXG4gICAgICAgIHRvZ2dsZS50aXRsZSA9IHN0YXRlXHJcbiAgICAgICAgICAgID8gTC5USVRMRV9PUFRfT1BFTih0eXBlLCByZWYpXHJcbiAgICAgICAgICAgIDogTC5USVRMRV9PUFRfQ0xPU0UodHlwZSwgcmVmKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFN1Z2FyIGZvciBjaG9vc2luZyBzZWNvbmQgdmFsdWUgaWYgZmlyc3QgaXMgdW5kZWZpbmVkLCBpbnN0ZWFkIG9mIGZhbHN5ICovXHJcbmZ1bmN0aW9uIGVpdGhlcjxUPih2YWx1ZTogVCB8IHVuZGVmaW5lZCwgdmFsdWUyOiBUKSA6IFRcclxue1xyXG4gICAgcmV0dXJuICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSA/IHZhbHVlMiA6IHZhbHVlO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBkZWFsaW5nIHdpdGggdGhlIERPTSAqL1xyXG5jbGFzcyBET01cclxue1xyXG4gICAgLyoqIFdoZXRoZXIgdGhlIHdpbmRvdyBpcyB0aGlubmVyIHRoYW4gYSBzcGVjaWZpYyBzaXplIChhbmQsIHRodXMsIGlzIFwibW9iaWxlXCIpICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBpc01vYmlsZSgpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoIDw9IDUwMDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogV2hldGhlciBSQUcgYXBwZWFycyB0byBiZSBydW5uaW5nIG9uIGFuIGlPUyBkZXZpY2UgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGlzaU9TKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5wbGF0Zm9ybS5tYXRjaCgvaVBob25lfGlQb2R8aVBhZC9naSkgIT09IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGF0dHJpYnV0ZSBmcm9tIHRoZSBnaXZlbiBlbGVtZW50LCBvciByZXR1cm5zIHRoZSBnaXZlblxyXG4gICAgICogZGVmYXVsdCB2YWx1ZSBpZiB1bnNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgYXR0cmlidXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gYXR0ciBOYW1lIG9mIHRoZSBhdHRyaWJ1dGUgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxyXG4gICAgICogQHBhcmFtIGRlZiBEZWZhdWx0IHZhbHVlIGlmIGF0dHJpYnV0ZSBpc24ndCBzZXRcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBhdHRyaWJ1dGUncyB2YWx1ZSwgb3IgZGVmYXVsdCB2YWx1ZSBpZiB1bnNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldEF0dHIoZWxlbWVudDogSFRNTEVsZW1lbnQsIGF0dHI6IHN0cmluZywgZGVmOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuaGFzQXR0cmlidXRlKGF0dHIpXHJcbiAgICAgICAgICAgID8gZWxlbWVudC5nZXRBdHRyaWJ1dGUoYXR0cikhXHJcbiAgICAgICAgICAgIDogZGVmO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgYW4gZWxlbWVudCBmcm9tIHRoZSBnaXZlbiBkb2N1bWVudCwgdGhyb3dpbmcgYW4gZXJyb3IgaWYgbm8gbWF0Y2ggaXMgZm91bmQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IENTUyBzZWxlY3RvciBxdWVyeSB0byB1c2VcclxuICAgICAqIEBwYXJhbSBwYXJlbnQgUGFyZW50IG9iamVjdCB0byBzZWFyY2g7IGRlZmF1bHRzIHRvIGRvY3VtZW50XHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZmlyc3QgZWxlbWVudCB0byBtYXRjaCB0aGUgZ2l2ZW4gcXVlcnlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXF1aXJlPFQgZXh0ZW5kcyBIVE1MRWxlbWVudD5cclxuICAgICAgICAocXVlcnk6IHN0cmluZywgcGFyZW50OiBQYXJlbnROb2RlID0gd2luZG93LmRvY3VtZW50KVxyXG4gICAgICAgIDogVFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBwYXJlbnQucXVlcnlTZWxlY3RvcihxdWVyeSkgYXMgVDtcclxuXHJcbiAgICAgICAgaWYgKCFyZXN1bHQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRPTV9NSVNTSU5HKHF1ZXJ5KSApO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBhdHRyaWJ1dGUgZnJvbSB0aGUgZ2l2ZW4gZWxlbWVudCwgdGhyb3dpbmcgYW4gZXJyb3JcclxuICAgICAqIGlmIHRoZSBhdHRyaWJ1dGUgaXMgbWlzc2luZy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgYXR0cmlidXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gYXR0ciBOYW1lIG9mIHRoZSBhdHRyaWJ1dGUgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxyXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGF0dHJpYnV0ZSdzIHZhbHVlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZUF0dHIoZWxlbWVudDogSFRNTEVsZW1lbnQsIGF0dHI6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAoICFlbGVtZW50Lmhhc0F0dHJpYnV0ZShhdHRyKSApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkFUVFJfTUlTU0lORyhhdHRyKSApO1xyXG5cclxuICAgICAgICByZXR1cm4gZWxlbWVudC5nZXRBdHRyaWJ1dGUoYXR0cikhO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBrZXkgb2YgdGhlIGdpdmVuIGVsZW1lbnQncyBkYXRhc2V0LCB0aHJvd2luZyBhbiBlcnJvclxyXG4gICAgICogaWYgdGhlIHZhbHVlIGlzIG1pc3Npbmcgb3IgZW1wdHkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGRhdGEgb2ZcclxuICAgICAqIEBwYXJhbSBrZXkgS2V5IHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBkYXRhc2V0J3MgdmFsdWVcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXF1aXJlRGF0YShlbGVtZW50OiBIVE1MRWxlbWVudCwga2V5OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHZhbHVlID0gZWxlbWVudC5kYXRhc2V0W2tleV07XHJcblxyXG4gICAgICAgIGlmICggU3RyaW5ncy5pc051bGxPckVtcHR5KHZhbHVlKSApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRBVEFfTUlTU0lORyhrZXkpICk7XHJcblxyXG4gICAgICAgIHJldHVybiB2YWx1ZSE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCbHVycyAodW5mb2N1c2VzKSB0aGUgY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGFyZW50IElmIGdpdmVuLCBvbmx5IGJsdXJzIGlmIGFjdGl2ZSBpcyBkZXNjZW5kYW50XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYmx1ckFjdGl2ZShwYXJlbnQ6IEhUTUxFbGVtZW50ID0gZG9jdW1lbnQuYm9keSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGFjdGl2ZSA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggYWN0aXZlICYmIGFjdGl2ZS5ibHVyICYmIHBhcmVudC5jb250YWlucyhhY3RpdmUpIClcclxuICAgICAgICAgICAgYWN0aXZlLmJsdXIoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIERlZXAgY2xvbmVzIGFsbCB0aGUgY2hpbGRyZW4gb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGludG8gdGhlIHRhcmdldCBlbGVtZW50LlxyXG4gICAgICogVXNpbmcgaW5uZXJIVE1MIHdvdWxkIGJlIGVhc2llciwgaG93ZXZlciBpdCBoYW5kbGVzIHNlbGYtY2xvc2luZyB0YWdzIHBvb3JseS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc291cmNlIEVsZW1lbnQgd2hvc2UgY2hpbGRyZW4gdG8gY2xvbmVcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWxlbWVudCB0byBhcHBlbmQgdGhlIGNsb25lZCBjaGlsZHJlbiB0b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsb25lSW50byhzb3VyY2U6IEhUTUxFbGVtZW50LCB0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNvdXJjZS5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICB0YXJnZXQuYXBwZW5kQ2hpbGQoIHNvdXJjZS5jaGlsZE5vZGVzW2ldLmNsb25lTm9kZSh0cnVlKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3VnYXIgZm9yIGNyZWF0aW5nIGFuZCBhZGRpbmcgYW4gb3B0aW9uIGVsZW1lbnQgdG8gYSBzZWxlY3QgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFNlbGVjdCBsaXN0IGVsZW1lbnQgdG8gYWRkIHRoZSBvcHRpb24gdG9cclxuICAgICAqIEBwYXJhbSB0ZXh0IExhYmVsIGZvciB0aGUgb3B0aW9uXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVmFsdWUgZm9yIHRoZSBvcHRpb25cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhZGRPcHRpb24oc2VsZWN0OiBIVE1MU2VsZWN0RWxlbWVudCwgdGV4dDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nID0gJycpXHJcbiAgICAgICAgOiBIVE1MT3B0aW9uRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIGxldCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKSBhcyBIVE1MT3B0aW9uRWxlbWVudDtcclxuXHJcbiAgICAgICAgb3B0aW9uLnRleHQgID0gdGV4dDtcclxuICAgICAgICBvcHRpb24udmFsdWUgPSB2YWx1ZTtcclxuXHJcbiAgICAgICAgc2VsZWN0LmFkZChvcHRpb24pO1xyXG4gICAgICAgIHJldHVybiBvcHRpb247XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGV4Y2x1ZGluZyB0aGUgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW4uXHJcbiAgICAgKiBCZSB3YXJuZWQ7IHRoaXMgbWV0aG9kIHVzZXMgUkFHLXNwZWNpZmljIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gcmVjdXJzaXZlbHkgZ2V0IHRleHQgY29udGVudCBvZlxyXG4gICAgICogQHJldHVybnMgVGV4dCBjb250ZW50IG9mIGdpdmVuIGVsZW1lbnQsIHdpdGhvdXQgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRWaXNpYmxlVGV4dChlbGVtZW50OiBFbGVtZW50KSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICAgICAgKGVsZW1lbnQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudC50ZXh0Q29udGVudCB8fCAnJztcclxuICAgICAgICBlbHNlIGlmICggZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3RvZ2dsZScpIClcclxuICAgICAgICAgICAgcmV0dXJuICcnO1xyXG5cclxuICAgICAgICAvLyBSZXR1cm4gYmxhbmsgKHNraXApIGlmIGNoaWxkIG9mIGEgY29sbGFwc2VkIGVsZW1lbnQuIFByZXZpb3VzbHksIHRoaXMgdXNlZFxyXG4gICAgICAgIC8vIGdldENvbXB1dGVkU3R5bGUsIGJ1dCB0aGF0IGRvZXNuJ3Qgd29yayBpZiB0aGUgZWxlbWVudCBpcyBwYXJ0IG9mIGFuIG9ycGhhbmVkXHJcbiAgICAgICAgLy8gcGhyYXNlIChhcyBoYXBwZW5zIHdpdGggdGhlIHBocmFzZXNldCBwaWNrZXIpLlxyXG4gICAgICAgIGxldCBwYXJlbnQgPSBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggcGFyZW50ICYmIHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpIClcclxuICAgICAgICAgICAgcmV0dXJuICcnO1xyXG5cclxuICAgICAgICBsZXQgdGV4dCA9ICcnO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICB0ZXh0ICs9IERPTS5nZXRWaXNpYmxlVGV4dChlbGVtZW50LmNoaWxkTm9kZXNbaV0gYXMgRWxlbWVudCk7XHJcblxyXG4gICAgICAgIHJldHVybiB0ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdGV4dCBjb250ZW50IG9mIHRoZSBnaXZlbiBlbGVtZW50LCBleGNsdWRpbmcgdGhlIHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuLFxyXG4gICAgICogYW5kIGV4Y2VzcyB3aGl0ZXNwYWNlIGFzIGEgcmVzdWx0IG9mIGNvbnZlcnRpbmcgZnJvbSBIVE1ML1hNTC5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xOTk4NjMyOFxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byByZWN1cnNpdmVseSBnZXQgdGV4dCBjb250ZW50IG9mXHJcbiAgICAgKiBAcmV0dXJucyBDbGVhbmVkIHRleHQgb2YgZ2l2ZW4gZWxlbWVudCwgd2l0aG91dCB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldENsZWFuZWRWaXNpYmxlVGV4dChlbGVtZW50OiBFbGVtZW50KSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBTdHJpbmdzLmNsZWFuKCBET00uZ2V0VmlzaWJsZVRleHQoZWxlbWVudCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNjYW5zIGZvciB0aGUgbmV4dCBmb2N1c2FibGUgc2libGluZyBmcm9tIGEgZ2l2ZW4gZWxlbWVudCwgc2tpcHBpbmcgaGlkZGVuIG9yXHJcbiAgICAgKiB1bmZvY3VzYWJsZSBlbGVtZW50cy4gSWYgdGhlIGVuZCBvZiB0aGUgY29udGFpbmVyIGlzIGhpdCwgdGhlIHNjYW4gd3JhcHMgYXJvdW5kLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBmcm9tIEVsZW1lbnQgdG8gc3RhcnQgc2Nhbm5pbmcgZnJvbVxyXG4gICAgICogQHBhcmFtIGRpciBEaXJlY3Rpb247IC0xIGZvciBsZWZ0IChwcmV2aW91cyksIDEgZm9yIHJpZ2h0IChuZXh0KVxyXG4gICAgICogQHJldHVybnMgVGhlIG5leHQgYXZhaWxhYmxlIHNpYmxpbmcsIG9yIG51bGwgaWYgbm9uZSBmb3VuZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZyb206IEhUTUxFbGVtZW50LCBkaXI6IG51bWJlcilcclxuICAgICAgICA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdXJyZW50ID0gZnJvbTtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IGZyb20ucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCFwYXJlbnQpXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICB3aGlsZSAodHJ1ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIFByb2NlZWQgdG8gbmV4dCBlbGVtZW50LCBvciB3cmFwIGFyb3VuZCBpZiBoaXQgdGhlIGVuZCBvZiBwYXJlbnRcclxuICAgICAgICAgICAgaWYgICAgICAoZGlyIDwgMClcclxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBwYXJlbnQubGFzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID4gMClcclxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IHBhcmVudC5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuQkFEX0RJUkVDVElPTiggZGlyLnRvU3RyaW5nKCkgKSApO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgd2UndmUgY29tZSBiYWNrIHRvIHRoZSBzdGFydGluZyBlbGVtZW50LCBub3RoaW5nIHdhcyBmb3VuZFxyXG4gICAgICAgICAgICBpZiAoY3VycmVudCA9PT0gZnJvbSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgdGhpcyBlbGVtZW50IGlzbid0IGhpZGRlbiBhbmQgaXMgZm9jdXNhYmxlLCByZXR1cm4gaXQhXHJcbiAgICAgICAgICAgIGlmICggIWN1cnJlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdoaWRkZW4nKSApXHJcbiAgICAgICAgICAgIGlmICggY3VycmVudC5oYXNBdHRyaWJ1dGUoJ3RhYmluZGV4JykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBlbGVtZW50LCByZWxldmFudCB0byBpdHMgcGFyZW50LlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIGVsZW1lbnQgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluZGV4T2YoY2hpbGQ6IEhUTUxFbGVtZW50KSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGRyZW4sIGNoaWxkKVxyXG4gICAgICAgICAgICA6IC0xO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQSB2ZXJ5LCB2ZXJ5IHNtYWxsIHN1YnNldCBvZiBNYXJrZG93biBmb3IgaHlwZXJsaW5raW5nIGEgYmxvY2sgb2YgdGV4dCAqL1xyXG5jbGFzcyBMaW5rZG93blxyXG57XHJcbiAgICAvKiogUmVnZXggcGF0dGVybiBmb3IgbWF0Y2hpbmcgbGlua2VkIHRleHQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX0xJTksgPSAvXFxbKC4rPylcXF0vZ2k7XHJcbiAgICAvKiogUmVnZXggcGF0dGVybiBmb3IgbWF0Y2hpbmcgbGluayByZWZlcmVuY2VzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUdFWF9SRUYgID0gL1xcWyhcXGQrKVxcXTpcXHMrKFxcUyspL2dpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGFyc2VzIHRoZSB0ZXh0IG9mIHRoZSBnaXZlbiBibG9jayBhcyBMaW5rZG93biwgY29udmVydGluZyB0YWdnZWQgdGV4dCBpbnRvIGxpbmtzXHJcbiAgICAgKiB1c2luZyBhIGdpdmVuIGxpc3Qgb2YgaW5kZXgtYmFzZWQgcmVmZXJlbmNlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gYmxvY2sgRWxlbWVudCB3aXRoIHRleHQgdG8gcmVwbGFjZTsgYWxsIGNoaWxkcmVuIGNsZWFyZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZShibG9jazogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBsaW5rcyA6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBnZXQgdGhlIGxpc3Qgb2YgcmVmZXJlbmNlcywgcmVtb3ZpbmcgdGhlbSBmcm9tIHRoZSB0ZXh0XHJcbiAgICAgICAgbGV0IGlkeCAgPSAwO1xyXG4gICAgICAgIGxldCB0ZXh0ID0gYmxvY2suaW5uZXJUZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9SRUYsIChfLCBrLCB2KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGlua3NbIHBhcnNlSW50KGspIF0gPSB2O1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFRoZW4sIHJlcGxhY2UgZWFjaCB0YWdnZWQgcGFydCBvZiB0ZXh0IHdpdGggYSBsaW5rIGVsZW1lbnRcclxuICAgICAgICBibG9jay5pbm5lckhUTUwgPSB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9MSU5LLCAoXywgdCkgPT5cclxuICAgICAgICAgICAgYDxhIGhyZWY9JyR7bGlua3NbaWR4KytdfScgdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9vcGVuZXJcIj4ke3R9PC9hPmBcclxuICAgICAgICApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBwYXJzaW5nIGRhdGEgZnJvbSBzdHJpbmdzICovXHJcbmNsYXNzIFBhcnNlXHJcbntcclxuICAgIC8qKiBQYXJzZXMgYSBnaXZlbiBzdHJpbmcgaW50byBhIGJvb2xlYW4gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYm9vbGVhbihzdHI6IHN0cmluZykgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgc3RyID0gc3RyLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIGlmIChzdHIgPT09ICd0cnVlJyB8fCBzdHIgPT09ICcxJylcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgaWYgKHN0ciA9PT0gJ2ZhbHNlJyB8fCBzdHIgPT09ICcwJylcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICB0aHJvdyBFcnJvciggTC5CQURfQk9PTEVBTihzdHIpICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGdlbmVyYXRpbmcgcmFuZG9tIGRhdGEgKi9cclxuY2xhc3MgUmFuZG9tXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gaW50ZWdlciBmcm9tIHRoZSBnaXZlbiByYW5nZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gaW50ZWdlciB0byBwaWNrLCBpbmNsdXNpdmVcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBpbnRlZ2VyIHRvIHBpY2ssIGluY2x1c2l2ZVxyXG4gICAgICogQHJldHVybnMgUmFuZG9tIGludGVnZXIgd2l0aGluIHRoZSBnaXZlbiByYW5nZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGludChtaW46IG51bWJlciA9IDAsIG1heDogbnVtYmVyID0gMSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5mbG9vciggTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4pICkgKyBtaW47XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5LWxpa2Ugb2JqZWN0IHdpdGggYSBsZW5ndGggcHJvcGVydHkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXJyYXkoYXJyOiBMZW5ndGhhYmxlKSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBhcnJbIFJhbmRvbS5pbnQoMCwgYXJyLmxlbmd0aCkgXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3BsaWNlcyBhIHJhbmRvbSBlbGVtZW50IGZyb20gYSBnaXZlbiBhcnJheSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhcnJheVNwbGljZTxUPihhcnI6IFRbXSkgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGFyci5zcGxpY2UoUmFuZG9tLmludCgwLCBhcnIubGVuZ3RoKSwgMSlbMF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGtleSBmcm9tIGEgZ2l2ZW4gb2JqZWN0ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG9iamVjdEtleShvYmo6IHt9KSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkoIE9iamVjdC5rZXlzKG9iaikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIHRydWUgb3IgZmFsc2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNoYW5jZSBDaGFuY2Ugb3V0IG9mIDEwMCwgdG8gcGljayBgdHJ1ZWBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sKGNoYW5jZTogbnVtYmVyID0gNTApIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uaW50KDAsIDEwMCkgPCBjaGFuY2U7XHJcbiAgICB9XHJcbn1cclxuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBjbGFzcyBmb3IgYXVkaW8gZnVuY3Rpb25hbGl0eSAqL1xyXG5jbGFzcyBTb3VuZHNcclxue1xyXG4gICAgcHVibGljIHN0YXRpYyBhc3luYyBkZWNvZGUoY29udGV4dDogQXVkaW9Db250ZXh0LCBidWY6IEFycmF5QnVmZmVyKVxyXG4gICAgICAgIDogUHJvbWlzZTxBdWRpb0J1ZmZlcj5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UgPEF1ZGlvQnVmZmVyPiAoIChyZXNvbHZlLCByZWplY3QpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICByZXR1cm4gY29udGV4dC5kZWNvZGVBdWRpb0RhdGEoYnVmLCByZXNvbHZlLCByZWplY3QpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBkZWFsaW5nIHdpdGggc3RyaW5ncyAqL1xyXG5jbGFzcyBTdHJpbmdzXHJcbntcclxuICAgIC8qKiBDaGVja3MgaWYgdGhlIGdpdmVuIHN0cmluZyBpcyBudWxsLCBvciBlbXB0eSAod2hpdGVzcGFjZSBvbmx5IG9yIHplcm8tbGVuZ3RoKSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpc051bGxPckVtcHR5KHN0cjogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuICFzdHIgfHwgIXN0ci50cmltKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQcmV0dHktcHJpbnQncyBhIGdpdmVuIGxpc3Qgb2Ygc3RhdGlvbnMsIHdpdGggY29udGV4dCBzZW5zaXRpdmUgZXh0cmFzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlcyBMaXN0IG9mIHN0YXRpb24gY29kZXMgdG8gam9pblxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgTGlzdCdzIGNvbnRleHQuIElmICdjYWxsaW5nJywgaGFuZGxlcyBzcGVjaWFsIGNhc2VcclxuICAgICAqIEByZXR1cm5zIFByZXR0eS1wcmludGVkIGxpc3Qgb2YgZ2l2ZW4gc3RhdGlvbnNcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tU3RhdGlvbkxpc3QoY29kZXM6IHN0cmluZ1tdLCBjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9ICcnO1xyXG4gICAgICAgIGxldCBuYW1lcyAgPSBjb2Rlcy5zbGljZSgpO1xyXG5cclxuICAgICAgICBuYW1lcy5mb3JFYWNoKCAoYywgaSkgPT4gbmFtZXNbaV0gPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjLCB0cnVlKSApO1xyXG5cclxuICAgICAgICBpZiAobmFtZXMubGVuZ3RoID09PSAxKVxyXG4gICAgICAgICAgICByZXN1bHQgPSAoY29udGV4dCA9PT0gJ2NhbGxpbmcnKVxyXG4gICAgICAgICAgICAgICAgPyBgJHtuYW1lc1swXX0gb25seWBcclxuICAgICAgICAgICAgICAgIDogbmFtZXNbMF07XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGxhc3RTdGF0aW9uID0gbmFtZXMucG9wKCk7XHJcblxyXG4gICAgICAgICAgICByZXN1bHQgID0gbmFtZXMuam9pbignLCAnKTtcclxuICAgICAgICAgICAgcmVzdWx0ICs9IGAgYW5kICR7bGFzdFN0YXRpb259YDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQcmV0dHktcHJpbnRzIHRoZSBnaXZlbiBkYXRlIG9yIGhvdXJzIGFuZCBtaW51dGVzIGludG8gYSAyNC1ob3VyIHRpbWUgKGUuZy4gMDE6MDkpLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBob3VycyBIb3VycywgZnJvbSAwIHRvIDIzLCBvciBEYXRlIG9iamVjdFxyXG4gICAgICogQHBhcmFtIG1pbnV0ZXMgTWludXRlcywgZnJvbSAwIHRvIDU5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbVRpbWUoaG91cnM6IG51bWJlciB8IERhdGUsIG1pbnV0ZXM6IG51bWJlciA9IDApIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGhvdXJzIGluc3RhbmNlb2YgRGF0ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG1pbnV0ZXMgPSBob3Vycy5nZXRNaW51dGVzKCk7XHJcbiAgICAgICAgICAgIGhvdXJzICAgPSBob3Vycy5nZXRIb3VycygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGhvdXJzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKSArICc6JyArXHJcbiAgICAgICAgICAgIG1pbnV0ZXMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbGVhbnMgdXAgdGhlIGdpdmVuIHRleHQgb2YgZXhjZXNzIHdoaXRlc3BhY2UgYW5kIGFueSBuZXdsaW5lcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjbGVhbih0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRleHQudHJpbSgpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFxuXFxyXS9naSwgICAnJyAgKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxzezIsfS9naSwgICAnICcgKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxzKFsuLF0pL2dpLCAnJDEnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRm9ybWF0cyB0aGUgZ2l2ZW4gc3RyaW5nIHRvIG9uZSBtb3JlIGZpbGVuYW1lIGZyaWVuZGx5ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZpbGVuYW1lKHRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGV4dFxyXG4gICAgICAgICAgICAudG9Mb3dlckNhc2UoKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxzL2csICAgICAgICAgJ18nKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvW15hLXowLTlfXS9nLCAnJyApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVW5pb24gdHlwZSBmb3IgaXRlcmFibGUgdHlwZXMgd2l0aCBhIC5sZW5ndGggcHJvcGVydHkgKi9cclxudHlwZSBMZW5ndGhhYmxlID0gQXJyYXk8YW55PiB8IE5vZGVMaXN0IHwgSFRNTENvbGxlY3Rpb24gfCBzdHJpbmc7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHBsYXRmb3JtIGFzIGEgZGlnaXQgYW5kIG9wdGlvbmFsIGxldHRlciB0dXBsZSAqL1xyXG50eXBlIFBsYXRmb3JtID0gW3N0cmluZywgc3RyaW5nXTtcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgZ2VuZXJpYyBrZXktdmFsdWUgZGljdGlvbmFyeSwgd2l0aCBzdHJpbmcga2V5cyAqL1xyXG50eXBlIERpY3Rpb25hcnk8VD4gPSB7IFtpbmRleDogc3RyaW5nXTogVCB9O1xyXG5cclxuLyoqIERlZmluZXMgdGhlIGRhdGEgcmVmZXJlbmNlcyBjb25maWcgb2JqZWN0IHBhc3NlZCBpbnRvIFJBRy5tYWluIG9uIGluaXQgKi9cclxuaW50ZXJmYWNlIERhdGFSZWZzXHJcbntcclxuICAgIC8qKiBTZWxlY3RvciBmb3IgZ2V0dGluZyB0aGUgcGhyYXNlIHNldCBYTUwgSUZyYW1lIGVsZW1lbnQgKi9cclxuICAgIHBocmFzZXNldEVtYmVkIDogc3RyaW5nO1xyXG4gICAgLyoqIFJhdyBhcnJheSBvZiBleGN1c2VzIGZvciB0cmFpbiBkZWxheXMgb3IgY2FuY2VsbGF0aW9ucyB0byB1c2UgKi9cclxuICAgIGV4Y3VzZXNEYXRhICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIG5hbWVzIGZvciBzcGVjaWFsIHRyYWlucyB0byB1c2UgKi9cclxuICAgIG5hbWVkRGF0YSAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIG5hbWVzIGZvciBzZXJ2aWNlcy9uZXR3b3JrcyB0byB1c2UgKi9cclxuICAgIHNlcnZpY2VzRGF0YSAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBjb2RlcyBhbmQgbmFtZXMgdG8gdXNlICovXHJcbiAgICBzdGF0aW9uc0RhdGEgICA6IERpY3Rpb25hcnk8c3RyaW5nPjtcclxufVxyXG5cclxuLyoqIEZpbGwgaW5zIGZvciB2YXJpb3VzIG1pc3NpbmcgZGVmaW5pdGlvbnMgb2YgbW9kZXJuIEphdmFzY3JpcHQgZmVhdHVyZXMgKi9cclxuXHJcbmludGVyZmFjZSBXaW5kb3dcclxue1xyXG4gICAgb251bmhhbmRsZWRyZWplY3Rpb246IEVycm9yRXZlbnRIYW5kbGVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU3RyaW5nXHJcbntcclxuICAgIHBhZFN0YXJ0KHRhcmdldExlbmd0aDogbnVtYmVyLCBwYWRTdHJpbmc/OiBzdHJpbmcpIDogc3RyaW5nO1xyXG4gICAgcGFkRW5kKHRhcmdldExlbmd0aDogbnVtYmVyLCBwYWRTdHJpbmc/OiBzdHJpbmcpIDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXJyYXk8VD5cclxue1xyXG4gICAgaW5jbHVkZXMoc2VhcmNoRWxlbWVudDogVCwgZnJvbUluZGV4PzogbnVtYmVyKSA6IGJvb2xlYW47XHJcbn1cclxuXHJcbmRlY2xhcmUgY2xhc3MgTWVkaWFSZWNvcmRlclxyXG57XHJcbiAgICBjb25zdHJ1Y3RvcihzdHJlYW06IE1lZGlhU3RyZWFtLCBvcHRpb25zPzogTWVkaWFSZWNvcmRlck9wdGlvbnMpO1xyXG4gICAgc3RhcnQodGltZXNsaWNlPzogbnVtYmVyKSA6IHZvaWQ7XHJcbiAgICBzdG9wKCkgOiB2b2lkO1xyXG4gICAgb25kYXRhYXZhaWxhYmxlIDogKCh0aGlzOiBNZWRpYVJlY29yZGVyLCBldjogQmxvYkV2ZW50KSA9PiBhbnkpIHwgbnVsbDtcclxuICAgIG9uc3RvcCA6ICgodGhpczogTWVkaWFSZWNvcmRlciwgZXY6IEV2ZW50KSA9PiBhbnkpIHwgbnVsbDtcclxufVxyXG5cclxuaW50ZXJmYWNlIE1lZGlhUmVjb3JkZXJPcHRpb25zXHJcbntcclxuICAgIG1pbWVUeXBlPyA6IHN0cmluZztcclxuICAgIGF1ZGlvQml0c1BlclNlY29uZD8gOiBudW1iZXI7XHJcbiAgICB2aWRlb0JpdHNQZXJTZWNvbmQ/IDogbnVtYmVyO1xyXG4gICAgYml0c1BlclNlY29uZD8gOiBudW1iZXI7XHJcbn1cclxuXHJcbmRlY2xhcmUgY2xhc3MgQmxvYkV2ZW50IGV4dGVuZHMgRXZlbnRcclxue1xyXG4gICAgcmVhZG9ubHkgZGF0YSAgICAgOiBCbG9iO1xyXG4gICAgcmVhZG9ubHkgdGltZWNvZGUgOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBdWRpb0NvbnRleHRCYXNlXHJcbntcclxuICAgIGF1ZGlvV29ya2xldCA6IEF1ZGlvV29ya2xldDtcclxufVxyXG5cclxudHlwZSBTYW1wbGVDaGFubmVscyA9IEZsb2F0MzJBcnJheVtdW107XHJcblxyXG5kZWNsYXJlIGNsYXNzIEF1ZGlvV29ya2xldFByb2Nlc3NvclxyXG57XHJcbiAgICBzdGF0aWMgcGFyYW1ldGVyRGVzY3JpcHRvcnMgOiBBdWRpb1BhcmFtRGVzY3JpcHRvcltdO1xyXG5cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3RvcihvcHRpb25zPzogQXVkaW9Xb3JrbGV0Tm9kZU9wdGlvbnMpO1xyXG4gICAgcmVhZG9ubHkgcG9ydD86IE1lc3NhZ2VQb3J0O1xyXG5cclxuICAgIHByb2Nlc3MoXHJcbiAgICAgICAgaW5wdXRzOiBTYW1wbGVDaGFubmVscyxcclxuICAgICAgICBvdXRwdXRzOiBTYW1wbGVDaGFubmVscyxcclxuICAgICAgICBwYXJhbWV0ZXJzOiBEaWN0aW9uYXJ5PEZsb2F0MzJBcnJheT5cclxuICAgICkgOiBib29sZWFuO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXVkaW9Xb3JrbGV0Tm9kZU9wdGlvbnMgZXh0ZW5kcyBBdWRpb05vZGVPcHRpb25zXHJcbntcclxuICAgIG51bWJlck9mSW5wdXRzPyA6IG51bWJlcjtcclxuICAgIG51bWJlck9mT3V0cHV0cz8gOiBudW1iZXI7XHJcbiAgICBvdXRwdXRDaGFubmVsQ291bnQ/IDogbnVtYmVyW107XHJcbiAgICBwYXJhbWV0ZXJEYXRhPyA6IHtbaW5kZXg6IHN0cmluZ10gOiBudW1iZXJ9O1xyXG4gICAgcHJvY2Vzc29yT3B0aW9ucz8gOiBhbnk7XHJcbn1cclxuXHJcbmludGVyZmFjZSBNZWRpYVRyYWNrQ29uc3RyYWludFNldFxyXG57XHJcbiAgICBhdXRvR2FpbkNvbnRyb2w/OiBib29sZWFuIHwgQ29uc3RyYWluQm9vbGVhblBhcmFtZXRlcnM7XHJcbiAgICBub2lzZVN1cHByZXNzaW9uPzogYm9vbGVhbiB8IENvbnN0cmFpbkJvb2xlYW5QYXJhbWV0ZXJzO1xyXG59XHJcblxyXG5kZWNsYXJlIGZ1bmN0aW9uIHJlZ2lzdGVyUHJvY2Vzc29yKG5hbWU6IHN0cmluZywgY3RvcjogQXVkaW9Xb3JrbGV0UHJvY2Vzc29yKSA6IHZvaWQ7IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogSG9sZHMgcnVudGltZSBjb25maWd1cmF0aW9uICovXHJcbmNsYXNzIENvbmZpZ1xyXG57XHJcbiAgICAvKiogVm9sdW1lIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgIHNwZWVjaFZvbCAgICAgIDogbnVtYmVyID0gMS4wO1xyXG4gICAgLyoqIFBpdGNoIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgIHNwZWVjaFBpdGNoICAgIDogbnVtYmVyID0gMS4wO1xyXG4gICAgLyoqIFJhdGUgZm9yIHNwZWVjaCB0byBiZSBzZXQgYXQgKi9cclxuICAgIHB1YmxpYyAgc3BlZWNoUmF0ZSAgICAgOiBudW1iZXIgPSAxLjA7XHJcbiAgICAvKiogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UsIGFzIGdldFZvaWNlcyBpbmRleCBvciAtMSBpZiB1bnNldCAqL1xyXG4gICAgcHJpdmF0ZSBfc3BlZWNoVm9pY2UgICA6IG51bWJlciA9IC0xO1xyXG4gICAgLyoqIElmIHVzZXIgaGFzIGNsaWNrZWQgc2h1ZmZsZSBhdCBsZWFzdCBvbmNlICovXHJcbiAgICBwdWJsaWMgY2xpY2tlZEdlbmVyYXRlIDogYm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UsIGFzIGdldFZvaWNlcyBpbmRleC4gQmVjYXVzZSBvZiB0aGUgYXN5bmMgbmF0dXJlIG9mXHJcbiAgICAgKiBnZXRWb2ljZXMsIHRoZSBkZWZhdWx0IHZhbHVlIHdpbGwgYmUgZmV0Y2hlZCBmcm9tIGl0IGVhY2ggdGltZS5cclxuICAgICAqL1xyXG4gICAgZ2V0IHNwZWVjaFZvaWNlKCkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICAvLyBUT0RPOiB0aGlzIGlzIHByb2JhYmx5IGJldHRlciBvZmYgdXNpbmcgdm9pY2UgbmFtZXNcclxuICAgICAgICAvLyBJZiB0aGVyZSdzIGEgdXNlci1kZWZpbmVkIHZhbHVlLCB1c2UgdGhhdFxyXG4gICAgICAgIGlmICAodGhpcy5fc3BlZWNoVm9pY2UgIT09IC0xKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3BlZWNoVm9pY2U7XHJcblxyXG4gICAgICAgIC8vIFNlbGVjdCBFbmdsaXNoIHZvaWNlcyBieSBkZWZhdWx0XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIHYgPSBSQUcuc3BlZWNoLmdldFZvaWNlcygpOyBpIDwgdi5sZW5ndGggOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFuZyA9IHZbaV0ubGFuZztcclxuXHJcbiAgICAgICAgICAgIGlmIChsYW5nID09PSAnZW4tR0InIHx8IGxhbmcgPT09ICdlbi1VUycpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEVsc2UsIGZpcnN0IHZvaWNlIG9uIHRoZSBsaXN0XHJcbiAgICAgICAgcmV0dXJuIDA7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGNob2ljZSBvZiBzcGVlY2ggdG8gdXNlLCBhcyBnZXRWb2ljZXMgaW5kZXggKi9cclxuICAgIHNldCBzcGVlY2hWb2ljZSh2YWx1ZTogbnVtYmVyKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3NwZWVjaFZvaWNlID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBsb2FkcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gZnJvbSBsb2NhbFN0b3JhZ2UsIGlmIGFueSAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGxvYWQ6IGJvb2xlYW4pXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHNldHRpbmdzID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdzZXR0aW5ncycpO1xyXG5cclxuICAgICAgICBpZiAoIWxvYWQgfHwgIXNldHRpbmdzKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGNvbmZpZyA9IEpTT04ucGFyc2Uoc2V0dGluZ3MpO1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIGNvbmZpZyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX0xPQURfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgc2F2ZXMgcnVudGltZSBjb25maWd1cmF0aW9uIHRvIGxvY2FsU3RvcmFnZSAqL1xyXG4gICAgcHVibGljIHNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSggJ3NldHRpbmdzJywgSlNPTi5zdHJpbmdpZnkodGhpcykgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfU0FWRV9GQUlMKGUubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBkZWxldGVzIHJ1bnRpbWUgY29uZmlndXJhdGlvbiBmcm9tIGxvY2FsU3RvcmFnZSBhbmQgcmVzZXRzIHN0YXRlICovXHJcbiAgICBwdWJsaWMgcmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oIHRoaXMsIG5ldyBDb25maWcoZmFsc2UpICk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnc2V0dGluZ3MnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfUkVTRVRfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBkYXRhIGZvciBleGN1c2VzLCB0cmFpbnMsIHNlcnZpY2VzIGFuZCBzdGF0aW9ucyAqL1xyXG5jbGFzcyBEYXRhYmFzZVxyXG57XHJcbiAgICAvKiogTG9hZGVkIGRhdGFzZXQgb2YgZGVsYXkgb3IgY2FuY2VsbGF0aW9uIGV4Y3VzZXMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZXhjdXNlcyAgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIG5hbWVkIHRyYWlucyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBuYW1lZCAgICAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRhdGFzZXQgb2Ygc2VydmljZSBvciBuZXR3b3JrIG5hbWVzICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHNlcnZpY2VzICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGljdGlvbmFyeSBvZiBzdGF0aW9uIG5hbWVzLCB3aXRoIHRocmVlLWxldHRlciBjb2RlIGtleXMgKGUuZy4gQUJDKSAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzdGF0aW9ucyAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+O1xyXG4gICAgLyoqIExvYWRlZCBYTUwgZG9jdW1lbnQgY29udGFpbmluZyBwaHJhc2VzZXQgZGF0YSAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBwaHJhc2VzZXRzICAgIDogRG9jdW1lbnQ7XHJcbiAgICAvKiogQW1vdW50IG9mIHN0YXRpb25zIGluIHRoZSBjdXJyZW50bHkgbG9hZGVkIGRhdGFzZXQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc3RhdGlvbnNDb3VudCA6IG51bWJlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoZGF0YVJlZnM6IERhdGFSZWZzKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBxdWVyeSAgPSBkYXRhUmVmcy5waHJhc2VzZXRFbWJlZDtcclxuICAgICAgICBsZXQgaWZyYW1lID0gRE9NLnJlcXVpcmUgPEhUTUxJRnJhbWVFbGVtZW50PiAocXVlcnkpO1xyXG5cclxuICAgICAgICBpZiAoIWlmcmFtZS5jb250ZW50RG9jdW1lbnQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX0VMRU1FTlRfTk9UX1BIUkFTRVNFVF9JRlJBTUUocXVlcnkpICk7XHJcblxyXG4gICAgICAgIHRoaXMucGhyYXNlc2V0cyAgICA9IGlmcmFtZS5jb250ZW50RG9jdW1lbnQ7XHJcbiAgICAgICAgdGhpcy5leGN1c2VzICAgICAgID0gZGF0YVJlZnMuZXhjdXNlc0RhdGE7XHJcbiAgICAgICAgdGhpcy5uYW1lZCAgICAgICAgID0gZGF0YVJlZnMubmFtZWREYXRhO1xyXG4gICAgICAgIHRoaXMuc2VydmljZXMgICAgICA9IGRhdGFSZWZzLnNlcnZpY2VzRGF0YTtcclxuICAgICAgICB0aGlzLnN0YXRpb25zICAgICAgPSBkYXRhUmVmcy5zdGF0aW9uc0RhdGE7XHJcbiAgICAgICAgdGhpcy5zdGF0aW9uc0NvdW50ID0gT2JqZWN0LmtleXModGhpcy5zdGF0aW9ucykubGVuZ3RoO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygnW0RhdGFiYXNlXSBFbnRyaWVzIGxvYWRlZDonKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0RXhjdXNlczonLCAgICAgIHRoaXMuZXhjdXNlcy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHROYW1lZCB0cmFpbnM6JywgdGhpcy5uYW1lZC5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRTZXJ2aWNlczonLCAgICAgdGhpcy5zZXJ2aWNlcy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRTdGF0aW9uczonLCAgICAgdGhpcy5zdGF0aW9uc0NvdW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gZXhjdXNlIGZvciBhIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiAqL1xyXG4gICAgcHVibGljIHBpY2tFeGN1c2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5leGN1c2VzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBwaWNrTmFtZWQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5uYW1lZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgYW5kIGdldHMgcGhyYXNlIHdpdGggdGhlIGdpdmVuIElELCBvciBudWxsIGlmIGl0IGRvZXNuJ3QgZXhpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkIElEIG9mIHRoZSBwaHJhc2UgdG8gZ2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2UoaWQ6IHN0cmluZykgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gdGhpcy5waHJhc2VzZXRzLnF1ZXJ5U2VsZWN0b3IoJ3BocmFzZSMnICsgaWQpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAocmVzdWx0KVxyXG4gICAgICAgICAgICByZXN1bHQgPSByZXN1bHQuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhIHBocmFzZXNldCB3aXRoIHRoZSBnaXZlbiBJRCwgb3IgbnVsbCBpZiBpdCBkb2Vzbid0IGV4aXN0LiBOb3RlIHRoYXQgdGhlXHJcbiAgICAgKiByZXR1cm5lZCBwaHJhc2VzZXQgY29tZXMgZnJvbSB0aGUgWE1MIGRvY3VtZW50LCBzbyBpdCBzaG91bGQgbm90IGJlIG11dGF0ZWQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkIElEIG9mIHRoZSBwaHJhc2VzZXQgdG8gZ2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2VzZXQoaWQ6IHN0cmluZykgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5waHJhc2VzZXRzLnF1ZXJ5U2VsZWN0b3IoJ3BocmFzZXNldCMnICsgaWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSByYWlsIG5ldHdvcmsgbmFtZSAqL1xyXG4gICAgcHVibGljIHBpY2tTZXJ2aWNlKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmFycmF5KHRoaXMuc2VydmljZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gc3RhdGlvbiBjb2RlIGZyb20gdGhlIGRhdGFzZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGUgTGlzdCBvZiBjb2RlcyB0byBleGNsdWRlLiBNYXkgYmUgaWdub3JlZCBpZiBzZWFyY2ggdGFrZXMgdG9vIGxvbmcuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBwaWNrU3RhdGlvbkNvZGUoZXhjbHVkZT86IHN0cmluZ1tdKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIC8vIEdpdmUgdXAgZmluZGluZyByYW5kb20gc3RhdGlvbiB0aGF0J3Mgbm90IGluIHRoZSBnaXZlbiBsaXN0LCBpZiB3ZSB0cnkgbW9yZVxyXG4gICAgICAgIC8vIHRpbWVzIHRoZW4gdGhlcmUgYXJlIHN0YXRpb25zLiBJbmFjY3VyYXRlLCBidXQgYXZvaWRzIGluZmluaXRlIGxvb3BzLlxyXG4gICAgICAgIGlmIChleGNsdWRlKSBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc3RhdGlvbnNDb3VudDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHZhbHVlID0gUmFuZG9tLm9iamVjdEtleSh0aGlzLnN0YXRpb25zKTtcclxuXHJcbiAgICAgICAgICAgIGlmICggIWV4Y2x1ZGUuaW5jbHVkZXModmFsdWUpIClcclxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgc3RhdGlvbiBuYW1lIGZyb20gdGhlIGdpdmVuIHRocmVlIGxldHRlciBjb2RlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gZ2V0IHRoZSBuYW1lIG9mXHJcbiAgICAgKiBAcGFyYW0gZmlsdGVyZWQgV2hldGhlciB0byBmaWx0ZXIgb3V0IHBhcmVudGhlc2l6ZWQgbG9jYXRpb24gY29udGV4dFxyXG4gICAgICogQHJldHVybnMgU3RhdGlvbiBuYW1lIGZvciB0aGUgZ2l2ZW4gY29kZSwgZmlsdGVyZWQgaWYgc3BlY2lmaWVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uKGNvZGU6IHN0cmluZywgZmlsdGVyZWQ6IGJvb2xlYW4gPSBmYWxzZSkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IHRoaXMuc3RhdGlvbnNbY29kZV07XHJcblxyXG4gICAgICAgIGlmICAgICAgKCFzdGF0aW9uKVxyXG4gICAgICAgICAgICByZXR1cm4gTC5EQl9VTktOT1dOX1NUQVRJT04oY29kZSk7XHJcbiAgICAgICAgZWxzZSBpZiAoIFN0cmluZ3MuaXNOdWxsT3JFbXB0eShzdGF0aW9uKSApXHJcbiAgICAgICAgICAgIHJldHVybiBMLkRCX0VNUFRZX1NUQVRJT04oY29kZSk7XHJcblxyXG4gICAgICAgIGlmIChmaWx0ZXJlZClcclxuICAgICAgICAgICAgc3RhdGlvbiA9IHN0YXRpb24ucmVwbGFjZSgvXFwoLitcXCkvaSwgJycpLnRyaW0oKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHN0YXRpb247XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSByYW5nZSBvZiBzdGF0aW9uIGNvZGVzLCBlbnN1cmluZyB0aGVyZSBhcmUgbm8gZHVwbGljYXRlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gYW1vdW50IG9mIHN0YXRpb25zIHRvIHBpY2tcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBhbW91bnQgb2Ygc3RhdGlvbnMgdG8gcGlja1xyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGVcclxuICAgICAqIEByZXR1cm5zIEEgbGlzdCBvZiB1bmlxdWUgc3RhdGlvbiBuYW1lc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcGlja1N0YXRpb25Db2RlcyhtaW4gPSAxLCBtYXggPSAxNiwgZXhjbHVkZT8gOiBzdHJpbmdbXSkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChtYXggLSBtaW4gPiBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX1RPT19NQU5ZX1NUQVRJT05TKCkgKTtcclxuXHJcbiAgICAgICAgbGV0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICAgICAgbGV0IGxlbmd0aCA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIGxldCB0cmllcyAgPSAwO1xyXG5cclxuICAgICAgICB3aGlsZSAocmVzdWx0Lmxlbmd0aCA8IGxlbmd0aClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgLy8gR2l2ZSB1cCB0cnlpbmcgdG8gYXZvaWQgZHVwbGljYXRlcywgaWYgd2UgdHJ5IG1vcmUgdGltZXMgdGhhbiB0aGVyZSBhcmVcclxuICAgICAgICAgICAgLy8gc3RhdGlvbnMgYXZhaWxhYmxlLiBJbmFjY3VyYXRlLCBidXQgZ29vZCBlbm91Z2guXHJcbiAgICAgICAgICAgIGlmICh0cmllcysrID49IHRoaXMuc3RhdGlvbnNDb3VudClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBnaXZlbiBhbiBleGNsdXNpb24gbGlzdCwgY2hlY2sgYWdhaW5zdCBib3RoIHRoYXQgYW5kIHJlc3VsdHNcclxuICAgICAgICAgICAgZWxzZSBpZiAoIGV4Y2x1ZGUgJiYgIWV4Y2x1ZGUuaW5jbHVkZXMoa2V5KSAmJiAhcmVzdWx0LmluY2x1ZGVzKGtleSkgKVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIG5vdCwganVzdCBjaGVjayB3aGF0IHJlc3VsdHMgd2UndmUgYWxyZWFkeSBmb3VuZFxyXG4gICAgICAgICAgICBlbHNlIGlmICggIWV4Y2x1ZGUgJiYgIXJlc3VsdC5pbmNsdWRlcyhrZXkpIClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFpbiBjbGFzcyBvZiB0aGUgZW50aXJlIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IgYXBwbGljYXRpb24gKi9cclxuY2xhc3MgUkFHXHJcbntcclxuICAgIC8qKiBHZXRzIHRoZSBjb25maWd1cmF0aW9uIGhvbGRlciAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb25maWcgICA6IENvbmZpZztcclxuICAgIC8qKiBHZXRzIHRoZSBkYXRhYmFzZSBtYW5hZ2VyLCB3aGljaCBob2xkcyBwaHJhc2UsIHN0YXRpb24gYW5kIHRyYWluIGRhdGEgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZGF0YWJhc2UgOiBEYXRhYmFzZTtcclxuICAgIC8qKiBHZXRzIHRoZSBwaHJhc2UgbWFuYWdlciwgd2hpY2ggZ2VuZXJhdGVzIEhUTUwgcGhyYXNlcyBmcm9tIFhNTCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VyICA6IFBocmFzZXI7XHJcbiAgICAvKiogR2V0cyB0aGUgc3BlZWNoIGVuZ2luZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzcGVlY2ggICA6IFNwZWVjaDtcclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHRyYWluIGFuZCBzdGF0aW9uIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRlICAgIDogU3RhdGU7XHJcbiAgICAvKiogR2V0cyB0aGUgdmlldyBjb250cm9sbGVyLCB3aGljaCBtYW5hZ2VzIFVJIGludGVyYWN0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZpZXdzICAgIDogVmlld3M7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFbnRyeSBwb2ludCBmb3IgUkFHLCB0byBiZSBjYWxsZWQgZnJvbSBKYXZhc2NyaXB0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBkYXRhUmVmcyBDb25maWd1cmF0aW9uIG9iamVjdCwgd2l0aCByYWlsIGRhdGEgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbWFpbihkYXRhUmVmczogRGF0YVJlZnMpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5vbmVycm9yICAgICAgICAgICAgICA9IGVycm9yID0+IFJBRy5wYW5pYyhlcnJvcik7XHJcbiAgICAgICAgd2luZG93Lm9udW5oYW5kbGVkcmVqZWN0aW9uID0gZXJyb3IgPT4gUkFHLnBhbmljKGVycm9yKTtcclxuXHJcbiAgICAgICAgSTE4bi5pbml0KCk7XHJcblxyXG4gICAgICAgIFJBRy5jb25maWcgICA9IG5ldyBDb25maWcodHJ1ZSk7XHJcbiAgICAgICAgUkFHLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlKGRhdGFSZWZzKTtcclxuICAgICAgICBSQUcudmlld3MgICAgPSBuZXcgVmlld3MoKTtcclxuICAgICAgICBSQUcucGhyYXNlciAgPSBuZXcgUGhyYXNlcigpO1xyXG4gICAgICAgIFJBRy5zcGVlY2ggICA9IG5ldyBTcGVlY2goKTtcclxuXHJcbiAgICAgICAgLy8gQmVnaW5cclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLldFTENPTUUoKSApO1xyXG4gICAgICAgIFJBRy5nZW5lcmF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZW5lcmF0ZXMgYSBuZXcgcmFuZG9tIHBocmFzZSBhbmQgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2VuZXJhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUgPSBuZXcgU3RhdGUoKTtcclxuICAgICAgICBSQUcuc3RhdGUuZ2VuRGVmYXVsdFN0YXRlKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5nZW5lcmF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBMb2FkcyBzdGF0ZSBmcm9tIGdpdmVuIEpTT04gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbG9hZChqc29uOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZSA9IE9iamVjdC5hc3NpZ24oIG5ldyBTdGF0ZSgpLCBKU09OLnBhcnNlKGpzb24pICkgYXMgU3RhdGU7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5nZW5lcmF0ZSgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9GUk9NX1NUT1JBR0UoKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHbG9iYWwgZXJyb3IgaGFuZGxlcjsgdGhyb3dzIHVwIGEgYmlnIHJlZCBwYW5pYyBzY3JlZW4gb24gdW5jYXVnaHQgZXJyb3IgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHBhbmljKGVycm9yOiBzdHJpbmcgfCBFdmVudCA9IFwiVW5rbm93biBlcnJvclwiKVxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGVycm9yKTtcclxuXHJcbiAgICAgICAgbGV0IG1zZyA9ICc8ZGl2IGlkPVwicGFuaWNTY3JlZW5cIiBjbGFzcz1cIndhcm5pbmdTY3JlZW5cIj4nO1xyXG4gICAgICAgIG1zZyAgICArPSAnPGgxPlwiV2UgYXJlIHNvcnJ5IHRvIGFubm91bmNlIHRoYXQuLi5cIjwvaDE+JztcclxuICAgICAgICBtc2cgICAgKz0gYDxwPlJBRyBoYXMgY3Jhc2hlZCBiZWNhdXNlOiA8Y29kZT4ke2Vycm9yfTwvY29kZT4uPC9wPmA7XHJcbiAgICAgICAgbXNnICAgICs9IGA8cD5QbGVhc2Ugb3BlbiB0aGUgY29uc29sZSBmb3IgbW9yZSBpbmZvcm1hdGlvbi48L3A+YDtcclxuICAgICAgICBtc2cgICAgKz0gJzwvZGl2Pic7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuaW5uZXJIVE1MID0gbXNnO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogRGlzcG9zYWJsZSBjbGFzcyB0aGF0IGhvbGRzIHN0YXRlIGZvciB0aGUgY3VycmVudCBzY2hlZHVsZSwgdHJhaW4sIGV0Yy4gKi9cclxuY2xhc3MgU3RhdGVcclxue1xyXG4gICAgLyoqIFN0YXRlIG9mIGNvbGxhcHNpYmxlIGVsZW1lbnRzLiBLZXkgaXMgcmVmZXJlbmNlIElELCB2YWx1ZSBpcyBjb2xsYXBzZWQuICovXHJcbiAgICBwcml2YXRlIF9jb2xsYXBzaWJsZXMgOiBEaWN0aW9uYXJ5PGJvb2xlYW4+ICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgY29hY2ggbGV0dGVyIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBsZXR0ZXIuICovXHJcbiAgICBwcml2YXRlIF9jb2FjaGVzICAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgaW50ZWdlciBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgaW50ZWdlci4gKi9cclxuICAgIHByaXZhdGUgX2ludGVnZXJzICAgICA6IERpY3Rpb25hcnk8bnVtYmVyPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBwaHJhc2VzZXQgcGhyYXNlIGNob2ljZXMuIEtleSBpcyByZWZlcmVuY2UgSUQsIHZhbHVlIGlzIGluZGV4LiAqL1xyXG4gICAgcHJpdmF0ZSBfcGhyYXNlc2V0cyAgIDogRGljdGlvbmFyeTxudW1iZXI+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHNlcnZpY2UgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIHNlcnZpY2UuICovXHJcbiAgICBwcml2YXRlIF9zZXJ2aWNlcyAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc3RhdGlvbiBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgc3RhdGlvbiBjb2RlLiAqL1xyXG4gICAgcHJpdmF0ZSBfc3RhdGlvbnMgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHN0YXRpb24gbGlzdCBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgYXJyYXkgb2YgY29kZXMuICovXHJcbiAgICBwcml2YXRlIF9zdGF0aW9uTGlzdHMgOiBEaWN0aW9uYXJ5PHN0cmluZ1tdPiA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgdGltZSBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgdGltZS4gKi9cclxuICAgIHByaXZhdGUgX3RpbWVzICAgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcblxyXG4gICAgLyoqIEN1cnJlbnRseSBjaG9zZW4gZXhjdXNlICovXHJcbiAgICBwcml2YXRlIF9leGN1c2U/ICAgOiBzdHJpbmc7XHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBwbGF0Zm9ybSAqL1xyXG4gICAgcHJpdmF0ZSBfcGxhdGZvcm0/IDogUGxhdGZvcm07XHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHJpdmF0ZSBfbmFtZWQ/ICAgIDogc3RyaW5nO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBjb2FjaCBsZXR0ZXIsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSBmcm9tIEEgdG8gWi5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIGxldHRlciBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldENvYWNoKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fY29hY2hlc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29hY2hlc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29hY2hlc1tjb250ZXh0XSA9IFJhbmRvbS5hcnJheShMLkxFVFRFUlMpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9jb2FjaGVzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGNvYWNoIGxldHRlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgbGV0dGVyIGZvclxyXG4gICAgICogQHBhcmFtIGNvYWNoIFZhbHVlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0Q29hY2goY29udGV4dDogc3RyaW5nLCBjb2FjaDogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9jb2FjaGVzW2NvbnRleHRdID0gY29hY2g7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gZ2V0IHRoZSBjb2xsYXBzaWJsZSBzdGF0ZSBvZlxyXG4gICAgICogQHBhcmFtIGNoYW5jZSBDaGFuY2UgYmV0d2VlbiAwIGFuZCAxMDAgb2YgY2hvb3NpbmcgdHJ1ZSwgaWYgdW5zZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldENvbGxhcHNlZChyZWY6IHN0cmluZywgY2hhbmNlOiBudW1iZXIpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29sbGFwc2libGVzW3JlZl07XHJcblxyXG4gICAgICAgIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdID0gIVJhbmRvbS5ib29sKGNoYW5jZSk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGNvbGxhcHNpYmxlJ3Mgc3RhdGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gc2V0IHRoZSBjb2xsYXBzaWJsZSBzdGF0ZSBvZlxyXG4gICAgICogQHBhcmFtIHN0YXRlIFZhbHVlIHRvIHNldCwgd2hlcmUgdHJ1ZSBpcyBcImNvbGxhcHNlZFwiXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRDb2xsYXBzZWQocmVmOiBzdHJpbmcsIHN0YXRlOiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXSA9IHN0YXRlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBpbnRlZ2VyLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBpbnRlZ2VyIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0SW50ZWdlcihjb250ZXh0OiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2ludGVnZXJzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgbGV0IG1pbiA9IDAsIG1heCA9IDA7XHJcblxyXG4gICAgICAgIHN3aXRjaChjb250ZXh0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2FzZSBcImNvYWNoZXNcIjogICAgICAgbWluID0gMTsgbWF4ID0gMTA7ICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImRlbGF5ZWRcIjogICAgICAgbWluID0gNTsgbWF4ID0gMTIwOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImZyb250X2NvYWNoZXNcIjogbWluID0gMjsgbWF4ID0gNTsgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInJlYXJfY29hY2hlc1wiOiAgbWluID0gMjsgbWF4ID0gNTsgICBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdID0gUmFuZG9tLmludChtaW4sIG1heCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhbiBpbnRlZ2VyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBpbnRlZ2VyIGZvclxyXG4gICAgICogQHBhcmFtIHZhbHVlIFZhbHVlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0SW50ZWdlcihjb250ZXh0OiBzdHJpbmcsIHZhbHVlOiBudW1iZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHBocmFzZSBvZiBhIHBocmFzZXNldCwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSByZWYgUmVmZXJlbmNlIElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHBocmFzZXNldCdzIHBocmFzZSBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlc2V0SWR4KHJlZjogc3RyaW5nKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9waHJhc2VzZXRzW3JlZl0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BocmFzZXNldHNbcmVmXTtcclxuXHJcbiAgICAgICAgbGV0IHBocmFzZXNldCA9IFJBRy5kYXRhYmFzZS5nZXRQaHJhc2VzZXQocmVmKTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogaXMgdGhpcyBzYWZlIGFjcm9zcyBwaHJhc2VzZXQgY2hhbmdlcz9cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuU1RBVEVfTk9ORVhJU1RBTlRfUEhSQVNFU0VUKHJlZikgKTtcclxuXHJcbiAgICAgICAgdGhpcy5fcGhyYXNlc2V0c1tyZWZdID0gUmFuZG9tLmludCgwLCBwaHJhc2VzZXQuY2hpbGRyZW4ubGVuZ3RoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGhyYXNlc2V0c1tyZWZdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB0aGUgY2hvc2VuIGluZGV4IGZvciBhIHBocmFzZXNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBzZXQgdGhlIHBocmFzZXNldCBpbmRleCBvZlxyXG4gICAgICogQHBhcmFtIGlkeCBJbmRleCB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFBocmFzZXNldElkeChyZWY6IHN0cmluZywgaWR4OiBudW1iZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BocmFzZXNldHNbcmVmXSA9IGlkeDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gc2VydmljZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc2VydmljZSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFNlcnZpY2UoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2VydmljZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTZXJ2aWNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHNlcnZpY2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHNlcnZpY2UgZm9yXHJcbiAgICAgKiBAcGFyYW0gc2VydmljZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFNlcnZpY2UoY29udGV4dDogc3RyaW5nLCBzZXJ2aWNlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdID0gc2VydmljZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gc3RhdGlvbiBjb2RlLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBzdGF0aW9uIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbihjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3N0YXRpb25zW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbnNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHN0YXRpb24gY29kZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgc3RhdGlvbiBjb2RlIGZvclxyXG4gICAgICogQHBhcmFtIGNvZGUgU3RhdGlvbiBjb2RlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0U3RhdGlvbihjb250ZXh0OiBzdHJpbmcsIGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbnNbY29udGV4dF0gPSBjb2RlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBsaXN0IG9mIHN0YXRpb24gY29kZXMsIG9yIHJhbmRvbWx5IGdlbmVyYXRlcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBzdGF0aW9uIGxpc3QgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uTGlzdChjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF07XHJcbiAgICAgICAgZWxzZSBpZiAoY29udGV4dCA9PT0gJ2NhbGxpbmdfZmlyc3QnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRTdGF0aW9uTGlzdCgnY2FsbGluZycpO1xyXG5cclxuICAgICAgICBsZXQgbWluID0gMSwgbWF4ID0gMTY7XHJcblxyXG4gICAgICAgIHN3aXRjaChjb250ZXh0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2FzZSAnY2FsbGluZ19zcGxpdCc6IG1pbiA9IDI7IG1heCA9IDE2OyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnY2hhbmdlcyc6ICAgICAgIG1pbiA9IDE7IG1heCA9IDQ7ICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnbm90X3N0b3BwaW5nJzogIG1pbiA9IDE7IG1heCA9IDg7ICBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKG1pbiwgbWF4KTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGxpc3Qgb2Ygc3RhdGlvbiBjb2Rlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgc3RhdGlvbiBjb2RlIGxpc3QgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29kZXMgU3RhdGlvbiBjb2RlcyB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFN0YXRpb25MaXN0KGNvbnRleHQ6IHN0cmluZywgY29kZXM6IHN0cmluZ1tdKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gPSBjb2RlcztcclxuXHJcbiAgICAgICAgaWYgKGNvbnRleHQgPT09ICdjYWxsaW5nX2ZpcnN0JylcclxuICAgICAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzWydjYWxsaW5nJ10gPSBjb2RlcztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gdGltZVxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgdGltZSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFRpbWUoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl90aW1lc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fdGltZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3RpbWVzW2NvbnRleHRdID0gU3RyaW5ncy5mcm9tVGltZSggUmFuZG9tLmludCgwLCAyMyksIFJhbmRvbS5pbnQoMCwgNTkpICk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3RpbWVzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHRpbWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHRpbWUgZm9yXHJcbiAgICAgKiBAcGFyYW0gdGltZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFRpbWUoY29udGV4dDogc3RyaW5nLCB0aW1lOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3RpbWVzW2NvbnRleHRdID0gdGltZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIGV4Y3VzZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IGV4Y3VzZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2V4Y3VzZSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2V4Y3VzZTtcclxuXHJcbiAgICAgICAgdGhpcy5fZXhjdXNlID0gUkFHLmRhdGFiYXNlLnBpY2tFeGN1c2UoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fZXhjdXNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IGV4Y3VzZSAqL1xyXG4gICAgcHVibGljIHNldCBleGN1c2UodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9leGN1c2UgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIHBsYXRmb3JtLCBvciByYW5kb21seSBwaWNrcyBvbmUgKi9cclxuICAgIHB1YmxpYyBnZXQgcGxhdGZvcm0oKSA6IFBsYXRmb3JtXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3BsYXRmb3JtKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcblxyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA6IFBsYXRmb3JtID0gWycnLCAnJ107XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMiUgY2hhbmNlIGZvciBwbGF0Zm9ybSAwLCBzaW5jZSBpdCdzIHJhcmVcclxuICAgICAgICBwbGF0Zm9ybVswXSA9IFJhbmRvbS5ib29sKDk4KVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5pbnQoMSwgMjYpLnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiAnMCc7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMTAlIGNoYW5jZSBmb3IgcGxhdGZvcm0gbGV0dGVyLCBzaW5jZSBpdCdzIHVuY29tbW9uXHJcbiAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgxMClcclxuICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoJ0FCQycpXHJcbiAgICAgICAgICAgIDogJyc7XHJcblxyXG4gICAgICAgIHRoaXMuX3BsYXRmb3JtID0gcGxhdGZvcm07XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXRmb3JtO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IHBsYXRmb3JtICovXHJcbiAgICBwdWJsaWMgc2V0IHBsYXRmb3JtKHZhbHVlOiBQbGF0Zm9ybSlcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9wbGF0Zm9ybSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjaG9zZW4gbmFtZWQgdHJhaW4sIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSAqL1xyXG4gICAgcHVibGljIGdldCBuYW1lZCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX25hbWVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fbmFtZWQ7XHJcblxyXG4gICAgICAgIHRoaXMuX25hbWVkID0gUkFHLmRhdGFiYXNlLnBpY2tOYW1lZCgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9uYW1lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHNldCBuYW1lZCh2YWx1ZTogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX25hbWVkID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHVwIHRoZSBzdGF0ZSBpbiBhIHBhcnRpY3VsYXIgd2F5LCBzbyB0aGF0IGl0IG1ha2VzIHNvbWUgcmVhbC13b3JsZCBzZW5zZS5cclxuICAgICAqIFRvIGRvIHNvLCB3ZSBoYXZlIHRvIGdlbmVyYXRlIGRhdGEgaW4gYSBwYXJ0aWN1bGFyIG9yZGVyLCBhbmQgbWFrZSBzdXJlIHRvIGF2b2lkXHJcbiAgICAgKiBkdXBsaWNhdGVzIGluIGluYXBwcm9wcmlhdGUgcGxhY2VzIGFuZCBjb250ZXh0cy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGdlbkRlZmF1bHRTdGF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFN0ZXAgMS4gUHJlcG9wdWxhdGUgc3RhdGlvbiBsaXN0c1xyXG5cclxuICAgICAgICBsZXQgc2xDYWxsaW5nICAgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygxLCAxNik7XHJcbiAgICAgICAgbGV0IHNsQ2FsbFNwbGl0ID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMiwgMTYsIHNsQ2FsbGluZyk7XHJcbiAgICAgICAgbGV0IGFsbENhbGxpbmcgID0gWy4uLnNsQ2FsbGluZywgLi4uc2xDYWxsU3BsaXRdO1xyXG5cclxuICAgICAgICAvLyBMaXN0IG9mIG90aGVyIHN0YXRpb25zIGZvdW5kIHZpYSBhIHNwZWNpZmljIGNhbGxpbmcgcG9pbnRcclxuICAgICAgICBsZXQgc2xDaGFuZ2VzICAgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDQsIGFsbENhbGxpbmcpO1xyXG4gICAgICAgIC8vIExpc3Qgb2Ygb3RoZXIgc3RhdGlvbnMgdGhhdCB0aGlzIHRyYWluIHVzdWFsbHkgc2VydmVzLCBidXQgY3VycmVudGx5IGlzbid0XHJcbiAgICAgICAgbGV0IHNsTm90U3RvcHBpbmcgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygxLCA4LFxyXG4gICAgICAgICAgICBbLi4uYWxsQ2FsbGluZywgLi4uc2xDaGFuZ2VzXVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIFRha2UgYSByYW5kb20gc2xpY2UgZnJvbSB0aGUgY2FsbGluZyBsaXN0LCB0byBpZGVudGlmeSBhcyByZXF1ZXN0IHN0b3BzXHJcbiAgICAgICAgbGV0IHJlcUNvdW50ICAgPSBSYW5kb20uaW50KDEsIHNsQ2FsbGluZy5sZW5ndGggLSAxKTtcclxuICAgICAgICBsZXQgc2xSZXF1ZXN0cyA9IHNsQ2FsbGluZy5zbGljZSgwLCByZXFDb3VudCk7XHJcblxyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ2NhbGxpbmcnLCAgICAgICBzbENhbGxpbmcpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ2NhbGxpbmdfc3BsaXQnLCBzbENhbGxTcGxpdCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2hhbmdlcycsICAgICAgIHNsQ2hhbmdlcyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnbm90X3N0b3BwaW5nJywgIHNsTm90U3RvcHBpbmcpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ3JlcXVlc3QnLCAgICAgICBzbFJlcXVlc3RzKTtcclxuXHJcbiAgICAgICAgLy8gU3RlcCAyLiBQcmVwb3B1bGF0ZSBzdGF0aW9uc1xyXG5cclxuICAgICAgICAvLyBBbnkgc3RhdGlvbiBtYXkgYmUgYmxhbWVkIGZvciBhbiBleGN1c2UsIGV2ZW4gb25lcyBhbHJlYWR5IHBpY2tlZFxyXG4gICAgICAgIGxldCBzdEV4Y3VzZSAgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlKCk7XHJcbiAgICAgICAgLy8gRGVzdGluYXRpb24gaXMgZmluYWwgY2FsbCBvZiB0aGUgY2FsbGluZyBsaXN0XHJcbiAgICAgICAgbGV0IHN0RGVzdCAgICA9IHNsQ2FsbGluZ1tzbENhbGxpbmcubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgLy8gVmlhIGlzIGEgY2FsbCBiZWZvcmUgdGhlIGRlc3RpbmF0aW9uLCBvciBvbmUgaW4gdGhlIHNwbGl0IGxpc3QgaWYgdG9vIHNtYWxsXHJcbiAgICAgICAgbGV0IHN0VmlhICAgICA9IHNsQ2FsbGluZy5sZW5ndGggPiAxXHJcbiAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCBzbENhbGxpbmcuc2xpY2UoMCwgLTEpICAgKVxyXG4gICAgICAgICAgICA6IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcbiAgICAgICAgLy8gRGl0dG8gZm9yIHBpY2tpbmcgYSByYW5kb20gY2FsbGluZyBzdGF0aW9uIGFzIGEgc2luZ2xlIHJlcXVlc3Qgb3IgY2hhbmdlIHN0b3BcclxuICAgICAgICBsZXQgc3RDYWxsaW5nID0gc2xDYWxsaW5nLmxlbmd0aCA+IDFcclxuICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoIHNsQ2FsbGluZy5zbGljZSgwLCAtMSkgICApXHJcbiAgICAgICAgICAgIDogUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuXHJcbiAgICAgICAgLy8gRGVzdGluYXRpb24gKGxhc3QgY2FsbCkgb2YgdGhlIHNwbGl0IHRyYWluJ3Mgc2Vjb25kIGhhbGYgb2YgdGhlIGxpc3RcclxuICAgICAgICBsZXQgc3REZXN0U3BsaXQgPSBzbENhbGxTcGxpdFtzbENhbGxTcGxpdC5sZW5ndGggLSAxXTtcclxuICAgICAgICAvLyBSYW5kb20gbm9uLWRlc3RpbmF0aW9uIHN0b3Agb2YgdGhlIHNwbGl0IHRyYWluJ3Mgc2Vjb25kIGhhbGYgb2YgdGhlIGxpc3RcclxuICAgICAgICBsZXQgc3RWaWFTcGxpdCAgPSBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG4gICAgICAgIC8vIFdoZXJlIHRoZSB0cmFpbiBjb21lcyBmcm9tLCBzbyBjYW4ndCBiZSBvbiBhbnkgbGlzdHMgb3IgcHJpb3Igc3RhdGlvbnNcclxuICAgICAgICBsZXQgc3RTb3VyY2UgICAgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlKFtcclxuICAgICAgICAgICAgLi4uYWxsQ2FsbGluZywgLi4uc2xDaGFuZ2VzLCAuLi5zbE5vdFN0b3BwaW5nLCAuLi5zbFJlcXVlc3RzLFxyXG4gICAgICAgICAgICBzdENhbGxpbmcsIHN0RGVzdCwgc3RWaWEsIHN0RGVzdFNwbGl0LCBzdFZpYVNwbGl0XHJcbiAgICAgICAgXSk7XHJcblxyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignY2FsbGluZycsICAgICAgICAgICBzdENhbGxpbmcpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignZGVzdGluYXRpb24nLCAgICAgICBzdERlc3QpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignZGVzdGluYXRpb25fc3BsaXQnLCBzdERlc3RTcGxpdCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdleGN1c2UnLCAgICAgICAgICAgIHN0RXhjdXNlKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3NvdXJjZScsICAgICAgICAgICAgc3RTb3VyY2UpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbigndmlhJywgICAgICAgICAgICAgICBzdFZpYSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCd2aWFfc3BsaXQnLCAgICAgICAgIHN0VmlhU3BsaXQpO1xyXG5cclxuICAgICAgICAvLyBTdGVwIDMuIFByZXBvcHVsYXRlIGNvYWNoIG51bWJlcnNcclxuXHJcbiAgICAgICAgbGV0IGludENvYWNoZXMgPSB0aGlzLmdldEludGVnZXIoJ2NvYWNoZXMnKTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgYXJlIGVub3VnaCBjb2FjaGVzLCBqdXN0IHNwbGl0IHRoZSBudW1iZXIgZG93biB0aGUgbWlkZGxlIGluc3RlYWQuXHJcbiAgICAgICAgLy8gRWxzZSwgZnJvbnQgYW5kIHJlYXIgY29hY2hlcyB3aWxsIGJlIHJhbmRvbWx5IHBpY2tlZCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpXHJcbiAgICAgICAgaWYgKGludENvYWNoZXMgPj0gNClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBpbnRGcm9udENvYWNoZXMgPSAoaW50Q29hY2hlcyAvIDIpIHwgMDtcclxuICAgICAgICAgICAgbGV0IGludFJlYXJDb2FjaGVzICA9IGludENvYWNoZXMgLSBpbnRGcm9udENvYWNoZXM7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnNldEludGVnZXIoJ2Zyb250X2NvYWNoZXMnLCBpbnRGcm9udENvYWNoZXMpO1xyXG4gICAgICAgICAgICB0aGlzLnNldEludGVnZXIoJ3JlYXJfY29hY2hlcycsIGludFJlYXJDb2FjaGVzKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIElmIHRoZXJlIGFyZSBlbm91Z2ggY29hY2hlcywgYXNzaWduIGNvYWNoIGxldHRlcnMgZm9yIGNvbnRleHRzLlxyXG4gICAgICAgIC8vIEVsc2UsIGxldHRlcnMgd2lsbCBiZSByYW5kb21seSBwaWNrZWQgKHdpdGhvdXQgbWFraW5nIHNlbnNlKVxyXG4gICAgICAgIGlmIChpbnRDb2FjaGVzID49IDQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGV0dGVycyA9IEwuTEVUVEVSUy5zbGljZSgwLCBpbnRDb2FjaGVzKS5zcGxpdCgnJyk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnZmlyc3QnLCAgICAgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzaG9wJywgICAgICBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3N0YW5kYXJkMScsIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc3RhbmRhcmQyJywgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTdGVwIDQuIFByZXBvcHVsYXRlIHNlcnZpY2VzXHJcblxyXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG1vcmUgdGhhbiBvbmUgc2VydmljZSwgcGljayBvbmUgdG8gYmUgdGhlIFwibWFpblwiIGFuZCBvbmUgdG8gYmUgdGhlXHJcbiAgICAgICAgLy8gXCJhbHRlcm5hdGVcIiwgZWxzZSB0aGUgb25lIHNlcnZpY2Ugd2lsbCBiZSB1c2VkIGZvciBib3RoICh3aXRob3V0IG1ha2luZyBzZW5zZSkuXHJcbiAgICAgICAgaWYgKFJBRy5kYXRhYmFzZS5zZXJ2aWNlcy5sZW5ndGggPiAxKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHNlcnZpY2VzID0gUkFHLmRhdGFiYXNlLnNlcnZpY2VzLnNsaWNlKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnNldFNlcnZpY2UoICdwcm92aWRlcicsICAgIFJhbmRvbS5hcnJheVNwbGljZShzZXJ2aWNlcykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRTZXJ2aWNlKCAnYWx0ZXJuYXRpdmUnLCBSYW5kb20uYXJyYXlTcGxpY2Uoc2VydmljZXMpICk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTdGVwIDUuIFByZXBvcHVsYXRlIHRpbWVzXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzEyMTQ3NTNcclxuXHJcbiAgICAgICAgLy8gVGhlIGFsdGVybmF0aXZlIHRpbWUgaXMgZm9yIGEgdHJhaW4gdGhhdCdzIGxhdGVyIHRoYW4gdGhlIG1haW4gdHJhaW5cclxuICAgICAgICBsZXQgdGltZSAgICA9IG5ldyBEYXRlKCBuZXcgRGF0ZSgpLmdldFRpbWUoKSArIFJhbmRvbS5pbnQoMCwgNTkpICogNjAwMDApO1xyXG4gICAgICAgIGxldCB0aW1lQWx0ID0gbmV3IERhdGUoIHRpbWUuZ2V0VGltZSgpICAgICAgICsgUmFuZG9tLmludCgwLCAzMCkgKiA2MDAwMCk7XHJcblxyXG4gICAgICAgIHRoaXMuc2V0VGltZSggJ21haW4nLCAgICAgICAgU3RyaW5ncy5mcm9tVGltZSh0aW1lKSAgICApO1xyXG4gICAgICAgIHRoaXMuc2V0VGltZSggJ2FsdGVybmF0aXZlJywgU3RyaW5ncy5mcm9tVGltZSh0aW1lQWx0KSApO1xyXG4gICAgfVxyXG59Il19