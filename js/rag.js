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
        let id = `phrase.${ref}`;
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
        return [0.1, `letter.${coach}.${inflect}`, 0.1];
    }
    resolveExcuse(idx) {
        let excuse = RAG.state.excuse;
        let key = Strings.filename(excuse);
        let inflect = this.getInflection(idx);
        return [0.2, `excuse.${key}.${inflect}`];
    }
    resolveInteger(element) {
        let ctx = element.dataset['context'];
        let singular = element.dataset['singular'];
        let plural = element.dataset['plural'];
        let integer = RAG.state.getInteger(ctx);
        let parts = [0.1, `number.${integer}.mid`];
        if (singular && integer === 1)
            parts.push(0.1, `number.suffix.${singular}.end`);
        else if (plural && integer !== 1)
            parts.push(0.1, `number.suffix.${plural}.end`);
        return parts;
    }
    resolveNamed() {
        let named = Strings.filename(RAG.state.named);
        return [0.1, `named.${named}.mid`, 0.1];
    }
    resolvePlatform(idx) {
        let platform = RAG.state.platform;
        let inflect = this.getInflection(idx);
        let result = [0.1, `number.${platform[0]}${platform[1]}.${inflect}`];
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
        let result = [0.15, `station.${station}.${inflect}`];
        if (inflect === 'mid')
            result.push(0.2);
        return result;
    }
    resolveStationList(element, idx) {
        let ctx = element.dataset['context'];
        let list = RAG.state.getStationList(ctx);
        let inflect = this.getInflection(idx);
        let parts = [0.2];
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
        let parts = [0.1];
        if (time[0] === '00' && time[1] === '00')
            return [...parts, 'number.0000.mid'];
        // Hours
        parts.push(`number.${time[0]}.mid`);
        if (time[1] === '00')
            parts.push('number.hundred.mid');
        else
            parts.push(0.1, `number.${time[1]}.mid`);
        return [...parts, 0.15];
    }
    resolveVox(element) {
        return [element.dataset['key']];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL3N0YXRpb25DaG9vc2VyLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkxpc3RJdGVtLnRzIiwidWkvcGlja2Vycy9waWNrZXIudHMiLCJ1aS9waWNrZXJzL2NvYWNoUGlja2VyLnRzIiwidWkvcGlja2Vycy9leGN1c2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2ludGVnZXJQaWNrZXIudHMiLCJ1aS9waWNrZXJzL25hbWVkUGlja2VyLnRzIiwidWkvcGlja2Vycy9waHJhc2VzZXRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BsYXRmb3JtUGlja2VyLnRzIiwidWkvcGlja2Vycy9zZXJ2aWNlUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uTGlzdFBpY2tlci50cyIsInVpL3BpY2tlcnMvdGltZVBpY2tlci50cyIsImxhbmcvYmFzZUxhbmd1YWdlLnRzIiwibGFuZy9lbmdsaXNoTGFuZ3VhZ2UudHMiLCJwaHJhc2VyL2VsZW1lbnRQcm9jZXNzb3JzLnRzIiwicGhyYXNlci9waHJhc2VDb250ZXh0LnRzIiwicGhyYXNlci9waHJhc2VyLnRzIiwic3BlZWNoL2N1c3RvbVZvaWNlLnRzIiwic3BlZWNoL3Jlc29sdmVyLnRzIiwic3BlZWNoL3NwZWVjaC50cyIsInNwZWVjaC9zcGVlY2hTZXR0aW5ncy50cyIsInNwZWVjaC92b3hFbmdpbmUudHMiLCJzcGVlY2gvdm94UmVxdWVzdC50cyIsInVpL2VkaXRvci50cyIsInVpL21hcnF1ZWUudHMiLCJ1aS9zZXR0aW5ncy50cyIsInVpL3Rvb2xiYXIudHMiLCJ1aS92aWV3cy50cyIsInV0aWwvY29sbGFwc2libGVzLnRzIiwidXRpbC9jb25kaXRpb25hbHMudHMiLCJ1dGlsL2RvbS50cyIsInV0aWwvbGlua2Rvd24udHMiLCJ1dGlsL3BhcnNlLnRzIiwidXRpbC9yYW5kb20udHMiLCJ1dGlsL3NvdW5kcy50cyIsInV0aWwvc3RyaW5ncy50cyIsInV0aWwvdHlwZXMudHMiLCJjb25maWcudHMiLCJkYXRhYmFzZS50cyIsInJhZy50cyIsInN0YXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLHFFQUFxRTtBQUVyRSw4REFBOEQ7QUFDOUQsSUFBSSxDQUFrQyxDQUFDO0FBRXZDLE1BQU0sSUFBSTtJQVVOLDRFQUE0RTtJQUNyRSxNQUFNLENBQUMsSUFBSTtRQUVkLElBQUksSUFBSSxDQUFDLFNBQVM7WUFDZCxNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFFbkQsSUFBSSxDQUFDLFNBQVMsR0FBRztZQUNiLElBQUksRUFBRyxJQUFJLGVBQWUsRUFBRTtTQUMvQixDQUFDO1FBRUYsMkJBQTJCO1FBQzNCLENBQUMsR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFNUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ3RCLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ssTUFBTSxDQUFDLFVBQVU7UUFFckIsSUFBSSxJQUFrQixDQUFDO1FBQ3ZCLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FDaEMsUUFBUSxDQUFDLElBQUksRUFDYixVQUFVLENBQUMsWUFBWSxHQUFHLFVBQVUsQ0FBQyxTQUFTLEVBQzlDLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFDL0IsS0FBSyxDQUNSLENBQUM7UUFFRixPQUFRLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQzlCO1lBQ0ksSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxZQUFZLEVBQ3ZDO2dCQUNJLElBQUksT0FBTyxHQUFHLElBQWUsQ0FBQztnQkFFOUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVB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QyxDQUFFLENBQUM7SUFDN0QsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogR2xvYmFsIHJlZmVyZW5jZSB0byB0aGUgbGFuZ3VhZ2UgY29udGFpbmVyLCBzZXQgYXQgaW5pdCAqL1xyXG5sZXQgTCA6IEVuZ2xpc2hMYW5ndWFnZSB8IEJhc2VMYW5ndWFnZTtcclxuXHJcbmNsYXNzIEkxOG5cclxue1xyXG4gICAgLyoqIENvbnN0YW50IHJlZ2V4IHRvIG1hdGNoIGZvciB0cmFuc2xhdGlvbiBrZXlzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBUQUdfUkVHRVggOiBSZWdFeHAgPSAvJVtBLVpfXSslLztcclxuXHJcbiAgICAvKiogTGFuZ3VhZ2VzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGxhbmd1YWdlcyAgIDogRGljdGlvbmFyeTxCYXNlTGFuZ3VhZ2U+O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byBsYW5ndWFnZSBjdXJyZW50bHkgaW4gdXNlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBjdXJyZW50TGFuZyA6IEJhc2VMYW5ndWFnZTtcclxuXHJcbiAgICAvKiogUGlja3MgYSBsYW5ndWFnZSwgYW5kIHRyYW5zZm9ybXMgYWxsIHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGRvY3VtZW50ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5sYW5ndWFnZXMpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSTE4biBpcyBhbHJlYWR5IGluaXRpYWxpemVkJyk7XHJcblxyXG4gICAgICAgIHRoaXMubGFuZ3VhZ2VzID0ge1xyXG4gICAgICAgICAgICAnZW4nIDogbmV3IEVuZ2xpc2hMYW5ndWFnZSgpXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTGFuZ3VhZ2Ugc2VsZWN0aW9uXHJcbiAgICAgICAgTCA9IHRoaXMuY3VycmVudExhbmcgPSB0aGlzLmxhbmd1YWdlc1snZW4nXTtcclxuXHJcbiAgICAgICAgSTE4bi5hcHBseVRvRG9tKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXYWxrcyB0aHJvdWdoIGFsbCB0ZXh0IG5vZGVzIGluIHRoZSBET00sIHJlcGxhY2luZyBhbnkgdHJhbnNsYXRpb24ga2V5cy5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMDczMDc3Ny8zMzU0OTIwXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGFwcGx5VG9Eb20oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgbmV4dCA6IE5vZGUgfCBudWxsO1xyXG4gICAgICAgIGxldCB3YWxrID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keSxcclxuICAgICAgICAgICAgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQgfCBOb2RlRmlsdGVyLlNIT1dfVEVYVCxcclxuICAgICAgICAgICAgeyBhY2NlcHROb2RlOiBJMThuLm5vZGVGaWx0ZXIgfSxcclxuICAgICAgICAgICAgZmFsc2VcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB3aGlsZSAoIG5leHQgPSB3YWxrLm5leHROb2RlKCkgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKG5leHQubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5leHQgYXMgRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuYXR0cmlidXRlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgICAgICAgICBJMThuLmV4cGFuZEF0dHJpYnV0ZShlbGVtZW50LmF0dHJpYnV0ZXNbaV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKG5leHQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFICYmIG5leHQudGV4dENvbnRlbnQpXHJcbiAgICAgICAgICAgICAgICBJMThuLmV4cGFuZFRleHROb2RlKG5leHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsdGVycyB0aGUgdHJlZSB3YWxrZXIgdG8gZXhjbHVkZSBzY3JpcHQgYW5kIHN0eWxlIHRhZ3MgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgdGFnID0gKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgICAgICA/IChub2RlIGFzIEVsZW1lbnQpLnRhZ05hbWUudG9VcHBlckNhc2UoKVxyXG4gICAgICAgICAgICA6IG5vZGUucGFyZW50RWxlbWVudCEudGFnTmFtZS50b1VwcGVyQ2FzZSgpO1xyXG5cclxuICAgICAgICByZXR1cm4gWydTQ1JJUFQnLCAnU1RZTEUnXS5pbmNsdWRlcyh0YWcpXHJcbiAgICAgICAgICAgID8gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUXHJcbiAgICAgICAgICAgIDogTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFeHBhbmRzIGFueSB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBnaXZlbiBhdHRyaWJ1dGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGV4cGFuZEF0dHJpYnV0ZShhdHRyOiBBdHRyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTZXR0aW5nIGFuIGF0dHJpYnV0ZSwgZXZlbiBpZiBub3RoaW5nIGFjdHVhbGx5IGNoYW5nZXMsIHdpbGwgY2F1c2UgdmFyaW91c1xyXG4gICAgICAgIC8vIHNpZGUtZWZmZWN0cyAoZS5nLiByZWxvYWRpbmcgaWZyYW1lcykuIFNvLCBhcyB3YXN0ZWZ1bCBhcyB0aGlzIGxvb2tzLCB3ZSBoYXZlXHJcbiAgICAgICAgLy8gdG8gbWF0Y2ggZmlyc3QgYmVmb3JlIGFjdHVhbGx5IHJlcGxhY2luZy5cclxuXHJcbiAgICAgICAgaWYgKCBhdHRyLnZhbHVlLm1hdGNoKHRoaXMuVEFHX1JFR0VYKSApXHJcbiAgICAgICAgICAgIGF0dHIudmFsdWUgPSBhdHRyLnZhbHVlLnJlcGxhY2UodGhpcy5UQUdfUkVHRVgsIEkxOG4ucmVwbGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEV4cGFuZHMgYW55IHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGdpdmVuIHRleHQgbm9kZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZXhwYW5kVGV4dE5vZGUobm9kZTogTm9kZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbm9kZS50ZXh0Q29udGVudCA9IG5vZGUudGV4dENvbnRlbnQhLnJlcGxhY2UodGhpcy5UQUdfUkVHRVgsIEkxOG4ucmVwbGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcGxhY2VzIGtleSB3aXRoIHZhbHVlIGlmIGl0IGV4aXN0cywgZWxzZSBrZWVwcyB0aGUga2V5ICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXBsYWNlKG1hdGNoOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSAgID0gbWF0Y2guc2xpY2UoMSwgLTEpO1xyXG4gICAgICAgIGxldCB2YWx1ZSA9IExba2V5XSBhcyBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgICAgICBpZiAoIXZhbHVlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignTWlzc2luZyB0cmFuc2xhdGlvbiBrZXk6JywgbWF0Y2gpO1xyXG4gICAgICAgICAgICByZXR1cm4gbWF0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBEZWxlZ2F0ZSB0eXBlIGZvciBjaG9vc2VyIHNlbGVjdCBldmVudCBoYW5kbGVycyAqL1xyXG50eXBlIFNlbGVjdERlbGVnYXRlID0gKGVudHJ5OiBIVE1MRWxlbWVudCkgPT4gdm9pZDtcclxuXHJcbi8qKiBVSSBlbGVtZW50IHdpdGggYSBmaWx0ZXJhYmxlIGFuZCBrZXlib2FyZCBuYXZpZ2FibGUgbGlzdCBvZiBjaG9pY2VzICovXHJcbmNsYXNzIENob29zZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIHRlbXBsYXRlIHRvIGNsb25lLCBmb3IgZWFjaCBjaG9vc2VyIGNyZWF0ZWQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFICAgID0gRE9NLnJlcXVpcmUoJyNjaG9vc2VyVGVtcGxhdGUnKTtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLmlkID0gJyc7XHJcblxyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGNvbnRhaW5lciAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRvbSAgICAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBmaWx0ZXIgaW5wdXQgYm94ICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5wdXRGaWx0ZXIgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgY29udGFpbmVyIG9mIGl0ZW0gZWxlbWVudHMgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBpbnB1dENob2ljZXMgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogT3B0aW9uYWwgZXZlbnQgaGFuZGxlciB0byBmaXJlIHdoZW4gYW4gaXRlbSBpcyBzZWxlY3RlZCBieSB0aGUgdXNlciAqL1xyXG4gICAgcHVibGljICAgIG9uU2VsZWN0PyAgICAgOiBTZWxlY3REZWxlZ2F0ZTtcclxuICAgIC8qKiBXaGV0aGVyIHRvIHZpc3VhbGx5IHNlbGVjdCB0aGUgY2xpY2tlZCBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgICAgc2VsZWN0T25DbGljayA6IGJvb2xlYW4gPSB0cnVlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGl0ZW0sIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIGRvbVNlbGVjdGVkPyAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGF1dG8tZmlsdGVyIHRpbWVvdXQsIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIGZpbHRlclRpbWVvdXQgOiBudW1iZXIgPSAwO1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gZ3JvdXAgYWRkZWQgZWxlbWVudHMgYnkgYWxwaGFiZXRpY2FsIHNlY3Rpb25zICovXHJcbiAgICBwcm90ZWN0ZWQgZ3JvdXBCeUFCQyAgICA6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIC8qKiBUaXRsZSBhdHRyaWJ1dGUgdG8gYXBwbHkgdG8gZXZlcnkgaXRlbSBhZGRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGl0ZW1UaXRsZSAgICAgOiBzdHJpbmcgPSAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgaXRlbSc7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYSBjaG9vc2VyLCBieSByZXBsYWNpbmcgdGhlIHBsYWNlaG9sZGVyIGluIGEgZ2l2ZW4gcGFyZW50ICovXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGFyZW50OiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICBpZiAoIUNob29zZXIuVEVNUExBVEUpXHJcbiAgICAgICAgICAgIENob29zZXIuaW5pdCgpO1xyXG5cclxuICAgICAgICBsZXQgdGFyZ2V0ICAgICAgPSBET00ucmVxdWlyZSgnY2hvb3NlcicsIHBhcmVudCk7XHJcbiAgICAgICAgbGV0IHBsYWNlaG9sZGVyID0gRE9NLmdldEF0dHIoIHRhcmdldCwgJ3BsYWNlaG9sZGVyJywgTC5QX0dFTkVSSUNfUEgoKSApO1xyXG4gICAgICAgIGxldCB0aXRsZSAgICAgICA9IERPTS5nZXRBdHRyKCB0YXJnZXQsICd0aXRsZScsIEwuUF9HRU5FUklDX1QoKSApO1xyXG4gICAgICAgIHRoaXMuaXRlbVRpdGxlICA9IERPTS5nZXRBdHRyKHRhcmdldCwgJ2l0ZW1UaXRsZScsIHRoaXMuaXRlbVRpdGxlKTtcclxuICAgICAgICB0aGlzLmdyb3VwQnlBQkMgPSB0YXJnZXQuaGFzQXR0cmlidXRlKCdncm91cEJ5QUJDJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgID0gQ2hvb3Nlci5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlciAgPSBET00ucmVxdWlyZSgnLmNoU2VhcmNoQm94JywgIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcyA9IERPTS5yZXF1aXJlKCcuY2hDaG9pY2VzQm94JywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy50aXRsZSAgICAgID0gdGl0bGU7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci5wbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyO1xyXG4gICAgICAgIC8vIFRPRE86IFJldXNpbmcgdGhlIHBsYWNlaG9sZGVyIGFzIHRpdGxlIGlzIHByb2JhYmx5IGJhZFxyXG4gICAgICAgIC8vIGh0dHBzOi8vbGFrZW4ubmV0L2Jsb2cvbW9zdC1jb21tb24tYTExeS1taXN0YWtlcy9cclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnRpdGxlICAgICAgID0gcGxhY2Vob2xkZXI7XHJcblxyXG4gICAgICAgIHRhcmdldC5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2JlZm9yZWJlZ2luJywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRhcmdldC5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFkZHMgdGhlIGdpdmVuIHZhbHVlIHRvIHRoZSBjaG9vc2VyIGFzIGEgc2VsZWN0YWJsZSBpdGVtLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBUZXh0IG9mIHRoZSBzZWxlY3RhYmxlIGl0ZW1cclxuICAgICAqIEBwYXJhbSBzZWxlY3QgV2hldGhlciB0byBzZWxlY3QgdGhpcyBpdGVtIG9uY2UgYWRkZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGFkZCh2YWx1ZTogc3RyaW5nLCBzZWxlY3Q6IGJvb2xlYW4gPSBmYWxzZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG5cclxuICAgICAgICBpdGVtLmlubmVyVGV4dCA9IHZhbHVlO1xyXG5cclxuICAgICAgICB0aGlzLmFkZFJhdyhpdGVtLCBzZWxlY3QpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQWRkcyB0aGUgZ2l2ZW4gZWxlbWVudCB0byB0aGUgY2hvb3NlciBhcyBhIHNlbGVjdGFibGUgaXRlbS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaXRlbSBFbGVtZW50IHRvIGFkZCB0byB0aGUgY2hvb3NlclxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBXaGV0aGVyIHRvIHNlbGVjdCB0aGlzIGl0ZW0gb25jZSBhZGRlZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYWRkUmF3KGl0ZW06IEhUTUxFbGVtZW50LCBzZWxlY3Q6IGJvb2xlYW4gPSBmYWxzZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaXRlbS50aXRsZSAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgICAgIGl0ZW0udGFiSW5kZXggPSAtMTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuYXBwZW5kQ2hpbGQoaXRlbSk7XHJcblxyXG4gICAgICAgIGlmIChzZWxlY3QpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChpdGVtKTtcclxuICAgICAgICAgICAgaXRlbS5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYXJzIGFsbCBpdGVtcyBmcm9tIHRoaXMgY2hvb3NlciBhbmQgdGhlIGN1cnJlbnQgZmlsdGVyICovXHJcbiAgICBwdWJsaWMgY2xlYXIoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5pbm5lckhUTUwgPSAnJztcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnZhbHVlICAgICAgPSAnJztcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2VsZWN0IGFuZCBmb2N1cyB0aGUgZW50cnkgdGhhdCBtYXRjaGVzIHRoZSBnaXZlbiB2YWx1ZSAqL1xyXG4gICAgcHVibGljIHByZXNlbGVjdCh2YWx1ZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCBrZXkgaW4gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW4pXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaXRlbSA9IHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuW2tleV0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICBpZiAodmFsdWUgPT09IGl0ZW0uaW5uZXJUZXh0KVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChpdGVtKTtcclxuICAgICAgICAgICAgICAgIGl0ZW0uZm9jdXMoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsaWNrIGV2ZW50cywgZm9yIGNob29zaW5nIGl0ZW1zICovXHJcbiAgICBwdWJsaWMgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhcmdldCA9IGV2LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCB0aGlzLmlzQ2hvaWNlKHRhcmdldCkgKVxyXG4gICAgICAgIGlmICggIXRhcmdldC5oYXNBdHRyaWJ1dGUoJ2Rpc2FibGVkJykgKVxyXG4gICAgICAgICAgICB0aGlzLnNlbGVjdCh0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsb3NlIG1ldGhvZHMsIGRvaW5nIGFueSB0aW1lciBjbGVhbnVwICovXHJcbiAgICBwdWJsaWMgb25DbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBpbnB1dCBldmVudHMsIGZvciBmaWx0ZXJpbmcgYW5kIG5hdmlnYXRpb24gKi9cclxuICAgIHB1YmxpYyBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQga2V5ICAgICA9IGV2LmtleTtcclxuICAgICAgICBsZXQgZm9jdXNlZCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBmb2N1c2VkLnBhcmVudEVsZW1lbnQhO1xyXG5cclxuICAgICAgICBpZiAoIWZvY3VzZWQpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gT25seSBoYW5kbGUgZXZlbnRzIG9uIHRoaXMgY2hvb3NlcidzIGNvbnRyb2xzXHJcbiAgICAgICAgaWYgKCAhdGhpcy5vd25zKGZvY3VzZWQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgdHlwaW5nIGludG8gZmlsdGVyIGJveFxyXG4gICAgICAgIGlmIChmb2N1c2VkID09PSB0aGlzLmlucHV0RmlsdGVyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5maWx0ZXJUaW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoXyA9PiB0aGlzLmZpbHRlcigpLCA1MDApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBSZWRpcmVjdCB0eXBpbmcgdG8gaW5wdXQgZmlsdGVyIGJveFxyXG4gICAgICAgIGlmIChmb2N1c2VkICE9PSB0aGlzLmlucHV0RmlsdGVyKVxyXG4gICAgICAgIGlmIChrZXkubGVuZ3RoID09PSAxIHx8IGtleSA9PT0gJ0JhY2tzcGFjZScpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlucHV0RmlsdGVyLmZvY3VzKCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwcmVzc2luZyBFTlRFUiBhZnRlciBrZXlib2FyZCBuYXZpZ2F0aW5nIHRvIGFuIGl0ZW1cclxuICAgICAgICBpZiAoIHRoaXMuaXNDaG9pY2UoZm9jdXNlZCkgKVxyXG4gICAgICAgIGlmIChrZXkgPT09ICdFbnRlcicpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlbGVjdChmb2N1c2VkKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIG5hdmlnYXRpb24gd2hlbiBjb250YWluZXIgb3IgaXRlbSBpcyBmb2N1c2VkXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5ID09PSAnQXJyb3dSaWdodCcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZGlyID0gKGtleSA9PT0gJ0Fycm93TGVmdCcpID8gLTEgOiAxO1xyXG4gICAgICAgICAgICBsZXQgbmF2ID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQsIGlmIHVzaW5nIGdyb3Vwc1xyXG4gICAgICAgICAgICBpZiAgICAgICggdGhpcy5ncm91cEJ5QUJDICYmIHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2dyb3VwJykgKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LCBpZiBjaG9pY2VzIGFyZSBmbGF0XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKCF0aGlzLmdyb3VwQnlBQkMgJiYgZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0Q2hvaWNlcylcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnRcclxuICAgICAgICAgICAgZWxzZSBpZiAoZm9jdXNlZCA9PT0gdGhpcy5kb21TZWxlY3RlZClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyh0aGlzLmRvbVNlbGVjdGVkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsZXZhbnQgdG8gYmVnaW5uaW5nIG9yIGVuZCBvZiBjb250YWluZXJcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID09PSAtMSlcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5sYXN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKG5hdikgbmF2LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIHN1Ym1pdCBldmVudHMsIGZvciBpbnN0YW50IGZpbHRlcmluZyAqL1xyXG4gICAgcHVibGljIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICB0aGlzLmZpbHRlcigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIaWRlIG9yIHNob3cgY2hvaWNlcyBpZiB0aGV5IHBhcnRpYWxseSBtYXRjaCB0aGUgdXNlciBxdWVyeSAqL1xyXG4gICAgcHJvdGVjdGVkIGZpbHRlcigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuXHJcbiAgICAgICAgbGV0IGZpbHRlciA9IHRoaXMuaW5wdXRGaWx0ZXIudmFsdWUudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBsZXQgaXRlbXMgID0gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW47XHJcbiAgICAgICAgbGV0IGVuZ2luZSA9IHRoaXMuZ3JvdXBCeUFCQ1xyXG4gICAgICAgICAgICA/IENob29zZXIuZmlsdGVyR3JvdXBcclxuICAgICAgICAgICAgOiBDaG9vc2VyLmZpbHRlckl0ZW07XHJcblxyXG4gICAgICAgIC8vIFByZXZlbnQgYnJvd3NlciByZWRyYXcvcmVmbG93IGR1cmluZyBmaWx0ZXJpbmdcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcclxuXHJcbiAgICAgICAgLy8gSXRlcmF0ZSB0aHJvdWdoIGFsbCB0aGUgaXRlbXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICBlbmdpbmUoaXRlbXNbaV0gYXMgSFRNTEVsZW1lbnQsIGZpbHRlcik7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBcHBsaWVzIGZpbHRlciB0byBhbiBpdGVtLCBzaG93aW5nIGl0IGlmIG1hdGNoZWQsIGhpZGluZyBpZiBub3QgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgZmlsdGVySXRlbShpdGVtOiBIVE1MRWxlbWVudCwgZmlsdGVyOiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2hvdyBpZiBjb250YWlucyBzZWFyY2ggdGVybVxyXG4gICAgICAgIGlmIChpdGVtLmlubmVyVGV4dC50b0xvd2VyQ2FzZSgpLmluZGV4T2YoZmlsdGVyKSA+PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaXRlbS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIaWRlIGlmIG5vdFxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGl0ZW0uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XHJcbiAgICAgICAgICAgIHJldHVybiAxO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQXBwbGllcyBmaWx0ZXIgdG8gY2hpbGRyZW4gb2YgYSBncm91cCwgaGlkaW5nIHRoZSBncm91cCBpZiBhbGwgY2hpbGRyZW4gaGlkZSAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBmaWx0ZXJHcm91cChncm91cDogSFRNTEVsZW1lbnQsIGZpbHRlcjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cmllcyA9IGdyb3VwLmNoaWxkcmVuO1xyXG4gICAgICAgIGxldCBjb3VudCAgID0gZW50cmllcy5sZW5ndGggLSAxOyAvLyAtMSBmb3IgaGVhZGVyIGVsZW1lbnRcclxuICAgICAgICBsZXQgaGlkZGVuICA9IDA7XHJcblxyXG4gICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHN0YXRpb24gbmFtZSBpbiB0aGlzIGxldHRlciBzZWN0aW9uLiBIZWFkZXIgc2tpcHBlZC5cclxuICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGVudHJpZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIGhpZGRlbiArPSBDaG9vc2VyLmZpbHRlckl0ZW0oZW50cmllc1tpXSBhcyBIVE1MRWxlbWVudCwgZmlsdGVyKTtcclxuXHJcbiAgICAgICAgLy8gSWYgYWxsIHN0YXRpb24gbmFtZXMgaW4gdGhpcyBsZXR0ZXIgc2VjdGlvbiB3ZXJlIGhpZGRlbiwgaGlkZSB0aGUgc2VjdGlvblxyXG4gICAgICAgIGlmIChoaWRkZW4gPj0gY291bnQpXHJcbiAgICAgICAgICAgIGdyb3VwLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgZ3JvdXAuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IGNoYW5nZXMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLCBhbmQgdXBkYXRlcyB0aGUgc3RhdGUgYW5kIGVkaXRvciAqL1xyXG4gICAgcHJvdGVjdGVkIHNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBhbHJlYWR5U2VsZWN0ZWQgPSAoZW50cnkgPT09IHRoaXMuZG9tU2VsZWN0ZWQpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zZWxlY3RPbkNsaWNrKVxyXG4gICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChlbnRyeSk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm9uU2VsZWN0KVxyXG4gICAgICAgICAgICB0aGlzLm9uU2VsZWN0KGVudHJ5KTtcclxuXHJcbiAgICAgICAgaWYgKGFscmVhZHlTZWxlY3RlZClcclxuICAgICAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSBjaGFuZ2VzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudCAqL1xyXG4gICAgcHJvdGVjdGVkIHZpc3VhbFNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMudmlzdWFsVW5zZWxlY3QoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZCAgICAgICAgICA9IGVudHJ5O1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQudGFiSW5kZXggPSA1MDtcclxuICAgICAgICBlbnRyeS5zZXRBdHRyaWJ1dGUoJ3NlbGVjdGVkJywgJ3RydWUnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgdW5zZWxlY3RzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudCwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgdmlzdWFsVW5zZWxlY3QoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuZG9tU2VsZWN0ZWQpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC5yZW1vdmVBdHRyaWJ1dGUoJ3NlbGVjdGVkJyk7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC50YWJJbmRleCA9IC0xO1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQgICAgICAgICAgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXaGV0aGVyIHRoaXMgY2hvb3NlciBpcyBhbiBhbmNlc3RvciAob3duZXIpIG9mIHRoZSBnaXZlbiBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWxlbWVudCB0byBjaGVjayBpZiB0aGlzIGNob29zZXIgaXMgYW4gYW5jZXN0b3Igb2ZcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG93bnModGFyZ2V0OiBIVE1MRWxlbWVudCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmNvbnRhaW5zKHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgdGhlIGdpdmVuIGVsZW1lbnQgaXMgYSBjaG9vc2FibGUgb25lIG93bmVkIGJ5IHRoaXMgY2hvb3NlciAqL1xyXG4gICAgcHJvdGVjdGVkIGlzQ2hvaWNlKHRhcmdldD86IEhUTUxFbGVtZW50KSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGFyZ2V0ICE9PSB1bmRlZmluZWRcclxuICAgICAgICAgICAgJiYgdGFyZ2V0LnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2RkJ1xyXG4gICAgICAgICAgICAmJiB0aGlzLm93bnModGFyZ2V0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqXHJcbiAqIFNpbmdsZXRvbiBpbnN0YW5jZSBvZiB0aGUgc3RhdGlvbiBwaWNrZXIuIFNpbmNlIHRoZXJlIGFyZSBleHBlY3RlZCB0byBiZSAyNTAwK1xyXG4gKiBzdGF0aW9ucywgdGhpcyBlbGVtZW50IHdvdWxkIHRha2UgdXAgYSBsb3Qgb2YgbWVtb3J5IGFuZCBnZW5lcmF0ZSBhIGxvdCBvZiBET00uIFNvLCBpdFxyXG4gKiBoYXMgdG8gYmUgXCJzd2FwcGVkXCIgYmV0d2VlbiBwaWNrZXJzIGFuZCB2aWV3cyB0aGF0IHdhbnQgdG8gdXNlIGl0LlxyXG4gKi9cclxuY2xhc3MgU3RhdGlvbkNob29zZXIgZXh0ZW5kcyBDaG9vc2VyXHJcbntcclxuICAgIC8qKiBTaG9ydGN1dCByZWZlcmVuY2VzIHRvIGFsbCB0aGUgZ2VuZXJhdGVkIEEtWiBzdGF0aW9uIGxpc3QgZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tU3RhdGlvbnMgOiBEaWN0aW9uYXJ5PEhUTUxETGlzdEVsZW1lbnQ+ID0ge307XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIocGFyZW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMudGFiSW5kZXggPSAwO1xyXG5cclxuICAgICAgICAvLyBQb3B1bGF0ZXMgdGhlIGxpc3Qgb2Ygc3RhdGlvbnMgZnJvbSB0aGUgZGF0YWJhc2UuIFdlIGRvIHRoaXMgYnkgY3JlYXRpbmcgYSBkbFxyXG4gICAgICAgIC8vIGVsZW1lbnQgZm9yIGVhY2ggbGV0dGVyIG9mIHRoZSBhbHBoYWJldCwgY3JlYXRpbmcgYSBkdCBlbGVtZW50IGhlYWRlciwgYW5kIHRoZW5cclxuICAgICAgICAvLyBwb3B1bGF0aW5nIHRoZSBkbCB3aXRoIHN0YXRpb24gbmFtZSBkZCBjaGlsZHJlbi5cclxuICAgICAgICBPYmplY3Qua2V5cyhSQUcuZGF0YWJhc2Uuc3RhdGlvbnMpLmZvckVhY2goIHRoaXMuYWRkU3RhdGlvbi5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRhY2hlcyB0aGlzIGNvbnRyb2wgdG8gdGhlIGdpdmVuIHBhcmVudCBhbmQgcmVzZXRzIHNvbWUgc3RhdGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBpY2tlciBQaWNrZXIgdG8gYXR0YWNoIHRoaXMgY29udHJvbCB0b1xyXG4gICAgICogQHBhcmFtIG9uU2VsZWN0IERlbGVnYXRlIHRvIGZpcmUgd2hlbiBjaG9vc2luZyBhIHN0YXRpb25cclxuICAgICAqL1xyXG4gICAgcHVibGljIGF0dGFjaChwaWNrZXI6IFBpY2tlciwgb25TZWxlY3Q6IFNlbGVjdERlbGVnYXRlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IHBpY2tlci5kb21Gb3JtO1xyXG4gICAgICAgIGxldCBjdXJyZW50ID0gdGhpcy5kb20ucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgLy8gUmUtZW5hYmxlIGFsbCBkaXNhYmxlZCBlbGVtZW50c1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnF1ZXJ5U2VsZWN0b3JBbGwoYGRkW2Rpc2FibGVkXWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKCB0aGlzLmVuYWJsZS5iaW5kKHRoaXMpICk7XHJcblxyXG4gICAgICAgIGlmICghY3VycmVudCB8fCBjdXJyZW50ICE9PSBwYXJlbnQpXHJcbiAgICAgICAgICAgIHBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMudmlzdWFsVW5zZWxlY3QoKTtcclxuICAgICAgICB0aGlzLm9uU2VsZWN0ID0gb25TZWxlY3QuYmluZChwaWNrZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQcmUtc2VsZWN0cyBhIHN0YXRpb24gZW50cnkgYnkgaXRzIGNvZGUgKi9cclxuICAgIHB1YmxpYyBwcmVzZWxlY3RDb2RlKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gdGhpcy5nZXRCeUNvZGUoY29kZSk7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoZW50cnkpO1xyXG4gICAgICAgIGVudHJ5LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEVuYWJsZXMgdGhlIGdpdmVuIHN0YXRpb24gY29kZSBvciBzdGF0aW9uIGVsZW1lbnQgZm9yIHNlbGVjdGlvbiAqL1xyXG4gICAgcHVibGljIGVuYWJsZShjb2RlT3JOb2RlOiBzdHJpbmcgfCBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gKHR5cGVvZiBjb2RlT3JOb2RlID09PSAnc3RyaW5nJylcclxuICAgICAgICAgICAgPyB0aGlzLmdldEJ5Q29kZShjb2RlT3JOb2RlKVxyXG4gICAgICAgICAgICA6IGNvZGVPck5vZGU7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgZW50cnkucmVtb3ZlQXR0cmlidXRlKCdkaXNhYmxlZCcpO1xyXG4gICAgICAgIGVudHJ5LnRhYkluZGV4ID0gLTE7XHJcbiAgICAgICAgZW50cnkudGl0bGUgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRGlzYWJsZXMgdGhlIGdpdmVuIHN0YXRpb24gY29kZSBmcm9tIHNlbGVjdGlvbiAqL1xyXG4gICAgcHVibGljIGRpc2FibGUoY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSB0aGlzLmdldEJ5Q29kZShjb2RlKTtcclxuICAgICAgICBsZXQgbmV4dCAgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZW50cnksIDEpO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGVudHJ5LnNldEF0dHJpYnV0ZSgnZGlzYWJsZWQnLCAnJyk7XHJcbiAgICAgICAgZW50cnkucmVtb3ZlQXR0cmlidXRlKCd0YWJpbmRleCcpO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlID0gJyc7XHJcblxyXG4gICAgICAgIC8vIFNoaWZ0IGZvY3VzIHRvIG5leHQgYXZhaWxhYmxlIGVsZW1lbnQsIGZvciBrZXlib2FyZCBuYXZpZ2F0aW9uXHJcbiAgICAgICAgaWYgKG5leHQpXHJcbiAgICAgICAgICAgIG5leHQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyBhIHN0YXRpb24ncyBjaG9pY2UgZWxlbWVudCBieSBpdHMgY29kZSAqL1xyXG4gICAgcHJpdmF0ZSBnZXRCeUNvZGUoY29kZTogc3RyaW5nKSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaW5wdXRDaG9pY2VzXHJcbiAgICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKGBkZFtkYXRhLWNvZGU9JHtjb2RlfV1gKSBhcyBIVE1MRWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGdpdmVuIHN0YXRpb24gY29kZSAqL1xyXG4gICAgcHJpdmF0ZSBhZGRTdGF0aW9uKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSBSQUcuZGF0YWJhc2Uuc3RhdGlvbnNbY29kZV07XHJcbiAgICAgICAgbGV0IGxldHRlciAgPSBzdGF0aW9uWzBdO1xyXG4gICAgICAgIGxldCBncm91cCAgID0gdGhpcy5kb21TdGF0aW9uc1tsZXR0ZXJdO1xyXG5cclxuICAgICAgICBpZiAoIWdyb3VwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGhlYWRlciAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2R0Jyk7XHJcbiAgICAgICAgICAgIGhlYWRlci5pbm5lclRleHQgPSBsZXR0ZXIudG9VcHBlckNhc2UoKTtcclxuICAgICAgICAgICAgaGVhZGVyLnRhYkluZGV4ICA9IC0xO1xyXG5cclxuICAgICAgICAgICAgZ3JvdXAgPSB0aGlzLmRvbVN0YXRpb25zW2xldHRlcl0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkbCcpO1xyXG4gICAgICAgICAgICBncm91cC50YWJJbmRleCA9IDUwO1xyXG5cclxuICAgICAgICAgICAgZ3JvdXAuc2V0QXR0cmlidXRlKCdncm91cCcsICcnKTtcclxuICAgICAgICAgICAgZ3JvdXAuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuYXBwZW5kQ2hpbGQoZ3JvdXApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGVudHJ5ICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuICAgICAgICBlbnRyeS5kYXRhc2V0Wydjb2RlJ10gPSBjb2RlO1xyXG4gICAgICAgIGVudHJ5LmlubmVyVGV4dCAgICAgICA9IFJBRy5kYXRhYmFzZS5zdGF0aW9uc1tjb2RlXTtcclxuICAgICAgICBlbnRyeS50aXRsZSAgICAgICAgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgICAgICBlbnRyeS50YWJJbmRleCAgICAgICAgPSAtMTtcclxuXHJcbiAgICAgICAgZ3JvdXAuYXBwZW5kQ2hpbGQoZW50cnkpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogU3RhdGlvbiBsaXN0IGl0ZW0gdGhhdCBjYW4gYmUgZHJhZ2dlZCBhbmQgZHJvcHBlZCAqL1xyXG5jbGFzcyBTdGF0aW9uTGlzdEl0ZW1cclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIHRlbXBsYXRlIHRvIGNsb25lLCBmb3IgZWFjaCBpdGVtIGNyZWF0ZWQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUgICAgPSBET00ucmVxdWlyZSgnI3N0YXRpb25MaXN0SXRlbVRlbXBsYXRlJyk7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmlkID0gJyc7XHJcblxyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGl0ZW0ncyBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgc3RhdGlvbiBsaXN0IGl0ZW0sIG1lYW50IGZvciB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBjcmVhdGUgdGhpcyBpdGVtIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoY29kZTogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIGlmICghU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uaW5pdCgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbSAgICAgICAgICAgPSBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuZG9tLmlubmVyVGV4dCA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUsIGZhbHNlKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uZGF0YXNldFsnY29kZSddID0gY29kZTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEJhc2UgY2xhc3MgZm9yIHBpY2tlciB2aWV3cyAqL1xyXG5hYnN0cmFjdCBjbGFzcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgZm9ybSBET00gZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbUZvcm0gICA6IEhUTUxGb3JtRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBoZWFkZXIgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbUhlYWRlciA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIEdldHMgdGhlIG5hbWUgb2YgdGhlIFhNTCB0YWcgdGhpcyBwaWNrZXIgaGFuZGxlcyAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IHhtbFRhZyAgICA6IHN0cmluZztcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2UgZWxlbWVudCBiZWluZyBlZGl0ZWQgYnkgdGhpcyBwaWNrZXIgKi9cclxuICAgIHByb3RlY3RlZCBkb21FZGl0aW5nPyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHBpY2tlciB0byBoYW5kbGUgdGhlIGdpdmVuIHBocmFzZSBlbGVtZW50IHR5cGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHhtbFRhZyBOYW1lIG9mIHRoZSBYTUwgdGFnIHRoaXMgcGlja2VyIHdpbGwgaGFuZGxlLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3IoeG1sVGFnOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgPSBET00ucmVxdWlyZShgIyR7eG1sVGFnfVBpY2tlcmApO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybSAgID0gRE9NLnJlcXVpcmUoJ2Zvcm0nLCAgIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlciA9IERPTS5yZXF1aXJlKCdoZWFkZXInLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy54bWxUYWcgICAgPSB4bWxUYWc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmNoYW5nZSAgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uaW5wdXQgICA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25jbGljayAgID0gdGhpcy5vbkNsaWNrLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9ua2V5ZG93biA9IHRoaXMub25JbnB1dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbnN1Ym1pdCAgPSB0aGlzLm9uU3VibWl0LmJpbmQodGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxsZWQgd2hlbiBmb3JtIGZpZWxkcyBjaGFuZ2UuIFRoZSBpbXBsZW1lbnRpbmcgcGlja2VyIHNob3VsZCB1cGRhdGUgYWxsIGxpbmtlZFxyXG4gICAgICogZWxlbWVudHMgKGUuZy4gb2Ygc2FtZSB0eXBlKSB3aXRoIHRoZSBuZXcgZGF0YSBoZXJlLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25DaGFuZ2UoZXY6IEV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIGEgbW91c2UgY2xpY2sgaGFwcGVucyBhbnl3aGVyZSBpbiBvciBvbiB0aGUgcGlja2VyJ3MgZm9ybSAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKiogQ2FsbGVkIHdoZW4gYSBrZXkgaXMgcHJlc3NlZCB3aGlsc3QgdGhlIHBpY2tlcidzIGZvcm0gaXMgZm9jdXNlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENhbGxlZCB3aGVuIEVOVEVSIGlzIHByZXNzZWQgd2hpbHN0IGEgZm9ybSBjb250cm9sIG9mIHRoZSBwaWNrZXIgaXMgZm9jdXNlZC5cclxuICAgICAqIEJ5IGRlZmF1bHQsIHRoaXMgd2lsbCB0cmlnZ2VyIHRoZSBvbkNoYW5nZSBoYW5kbGVyIGFuZCBjbG9zZSB0aGUgZGlhbG9nLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIHRoaXMub25DaGFuZ2UoZXYpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9wZW4gdGhpcyBwaWNrZXIgZm9yIGEgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQuIFRoZSBpbXBsZW1lbnRpbmcgcGlja2VyIHNob3VsZCBmaWxsXHJcbiAgICAgKiBpdHMgZm9ybSBlbGVtZW50cyB3aXRoIGRhdGEgZnJvbSB0aGUgY3VycmVudCBzdGF0ZSBhbmQgdGFyZ2V0ZWQgZWxlbWVudCBoZXJlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IHRhcmdldCBQaHJhc2UgZWxlbWVudCB0aGF0IHRoaXMgcGlja2VyIGlzIGJlaW5nIG9wZW5lZCBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nID0gdGFyZ2V0O1xyXG4gICAgICAgIHRoaXMubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlcyB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gRml4IGtleWJvYXJkIHN0YXlpbmcgb3BlbiBpbiBpT1Mgb24gY2xvc2VcclxuICAgICAgICBET00uYmx1ckFjdGl2ZSh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3NpdGlvbnMgdGhpcyBwaWNrZXIgcmVsYXRpdmUgdG8gdGhlIHRhcmdldCBwaHJhc2UgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIGxheW91dCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5kb21FZGl0aW5nKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCB0YXJnZXRSZWN0ID0gdGhpcy5kb21FZGl0aW5nLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGxldCBmdWxsV2lkdGggID0gdGhpcy5kb20uY2xhc3NMaXN0LmNvbnRhaW5zKCdmdWxsV2lkdGgnKTtcclxuICAgICAgICBsZXQgaXNNb2RhbCAgICA9IHRoaXMuZG9tLmNsYXNzTGlzdC5jb250YWlucygnbW9kYWwnKTtcclxuICAgICAgICBsZXQgZG9jVyAgICAgICA9IGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGg7XHJcbiAgICAgICAgbGV0IGRvY0ggICAgICAgPSBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodDtcclxuICAgICAgICBsZXQgZGlhbG9nWCAgICA9ICh0YXJnZXRSZWN0LmxlZnQgICB8IDApIC0gODtcclxuICAgICAgICBsZXQgZGlhbG9nWSAgICA9ICB0YXJnZXRSZWN0LmJvdHRvbSB8IDA7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1cgICAgPSAodGFyZ2V0UmVjdC53aWR0aCAgfCAwKSArIDE2O1xyXG5cclxuICAgICAgICAvLyBBZGp1c3QgaWYgaG9yaXpvbnRhbGx5IG9mZiBzY3JlZW5cclxuICAgICAgICBpZiAoIWZ1bGxXaWR0aCAmJiAhaXNNb2RhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEZvcmNlIGZ1bGwgd2lkdGggb24gbW9iaWxlXHJcbiAgICAgICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLndpZHRoID0gYDEwMCVgO1xyXG5cclxuICAgICAgICAgICAgICAgIGRpYWxvZ1ggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUud2lkdGggICAgPSBgaW5pdGlhbGA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS5taW5XaWR0aCA9IGAke2RpYWxvZ1d9cHhgO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChkaWFsb2dYICsgdGhpcy5kb20ub2Zmc2V0V2lkdGggPiBkb2NXKVxyXG4gICAgICAgICAgICAgICAgICAgIGRpYWxvZ1ggPSAodGFyZ2V0UmVjdC5yaWdodCB8IDApIC0gdGhpcy5kb20ub2Zmc2V0V2lkdGggKyA4O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGlja2VycyB0aGF0IGluc3RlYWQgdGFrZSB1cCB0aGUgd2hvbGUgZGlzcGxheS4gQ1NTIGlzbid0IHVzZWQgaGVyZSxcclxuICAgICAgICAvLyBiZWNhdXNlIHBlcmNlbnRhZ2UtYmFzZWQgbGVmdC90b3AgY2F1c2VzIHN1YnBpeGVsIGlzc3VlcyBvbiBDaHJvbWUuXHJcbiAgICAgICAgaWYgKGlzTW9kYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBkaWFsb2dYID0gRE9NLmlzTW9iaWxlID8gMCA6XHJcbiAgICAgICAgICAgICAgICAoIChkb2NXICAqIDAuMSkgLyAyICkgfCAwO1xyXG5cclxuICAgICAgICAgICAgZGlhbG9nWSA9IERPTS5pc01vYmlsZSA/IDAgOlxyXG4gICAgICAgICAgICAgICAgKCAoZG9jSCAqIDAuMSkgLyAyICkgfCAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgdG8gdG9wIGVkZ2Ugb2YgZG9jdW1lbnRcclxuICAgICAgICBlbHNlIGlmIChkaWFsb2dZIDwgMClcclxuICAgICAgICAgICAgZGlhbG9nWSA9IDA7XHJcblxyXG4gICAgICAgIC8vIEFkanVzdCBpZiB2ZXJ0aWNhbGx5IG9mZiBzY3JlZW5cclxuICAgICAgICBlbHNlIGlmIChkaWFsb2dZICsgdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ID4gZG9jSClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSAodGFyZ2V0UmVjdC50b3AgfCAwKSAtIHRoaXMuZG9tLm9mZnNldEhlaWdodCArIDE7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QuYWRkKCdiZWxvdycpO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LnJlbW92ZSgnYWJvdmUnKTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHN0aWxsIG9mZi1zY3JlZW4sIGNsYW1wIHRvIGJvdHRvbVxyXG4gICAgICAgICAgICBpZiAoZGlhbG9nWSArIHRoaXMuZG9tLm9mZnNldEhlaWdodCA+IGRvY0gpXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dZID0gZG9jSCAtIHRoaXMuZG9tLm9mZnNldEhlaWdodDtcclxuXHJcbiAgICAgICAgICAgIC8vIENsYW1wIHRvIHRvcCBlZGdlIG9mIGRvY3VtZW50LiBMaWtlbHkgaGFwcGVucyBpZiB0YXJnZXQgZWxlbWVudCBpcyBsYXJnZS5cclxuICAgICAgICAgICAgaWYgKGRpYWxvZ1kgPCAwKVxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWSA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QuYWRkKCdhYm92ZScpO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LnJlbW92ZSgnYmVsb3cnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLnN0eWxlLmxlZnQgPSAoZnVsbFdpZHRoID8gMCA6IGRpYWxvZ1gpICsgJ3B4JztcclxuICAgICAgICB0aGlzLmRvbS5zdHlsZS50b3AgID0gZGlhbG9nWSArICdweCc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJldHVybnMgdHJ1ZSBpZiBhbiBlbGVtZW50IGluIHRoaXMgcGlja2VyIGN1cnJlbnRseSBoYXMgZm9jdXMgKi9cclxuICAgIHB1YmxpYyBoYXNGb2N1cygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5jb250YWlucyhkb2N1bWVudC5hY3RpdmVFbGVtZW50KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgY29hY2ggcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBDb2FjaFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbGV0dGVyIGRyb3AtZG93biBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGV0dGVyIDogSFRNTFNlbGVjdEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBjb2FjaCBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignY29hY2gnKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlciA9IERPTS5yZXF1aXJlKCdzZWxlY3QnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMjY7IGkrKylcclxuICAgICAgICAgICAgRE9NLmFkZE9wdGlvbih0aGlzLmlucHV0TGV0dGVyLCBMLkxFVFRFUlNbaV0sIEwuTEVUVEVSU1tpXSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSB0YXJnZXQgY29udGV4dCdzIGNvYWNoIGxldHRlciAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0NPQUNIKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgPSBSQUcuc3RhdGUuZ2V0Q29hY2godGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIGNvYWNoIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfQ09BQ0hfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRDb2FjaCh0aGlzLmN1cnJlbnRDdHgsIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1jb2FjaF1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLmlucHV0TGV0dGVyLnZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGV4Y3VzZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIEV4Y3VzZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2V4Y3VzZScpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9FWENVU0UoKTtcclxuXHJcbiAgICAgICAgUkFHLmRhdGFiYXNlLmV4Y3VzZXMuZm9yRWFjaCggdiA9PiB0aGlzLmRvbUNob29zZXIuYWRkKHYpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgZXhjdXNlICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIC8vIFByZS1zZWxlY3QgdGhlIGN1cnJlbnRseSB1c2VkIGV4Y3VzZVxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5wcmVzZWxlY3QoUkFHLnN0YXRlLmV4Y3VzZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBleGN1c2UgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUuZXhjdXNlID0gZW50cnkuaW5uZXJUZXh0O1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCdleGN1c2UnLCBSQUcuc3RhdGUuZXhjdXNlKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgaW50ZWdlciBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIEludGVnZXJQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG51bWVyaWNhbCBpbnB1dCBzcGlubmVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0RGlnaXQgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG9wdGlvbmFsIHN1ZmZpeCBsYWJlbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21MYWJlbCAgIDogSFRNTExhYmVsRWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IGludGVnZXIgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eD8gOiBzdHJpbmc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9wdGlvbmFsIHNpbmd1bGFyIHN1ZmZpeCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgc2luZ3VsYXI/ICAgOiBzdHJpbmc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9wdGlvbmFsIHBsdXJhbCBzdWZmaXggZm9yIHRoZSBjdXJyZW50IGludGVnZXIgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHBsdXJhbD8gICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIFdoZXRoZXIgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgd2FudHMgd29yZCBkaWdpdHMgKi9cclxuICAgIHByaXZhdGUgd29yZHM/ICAgICAgOiBib29sZWFuO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2ludGVnZXInKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0ID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tTGFiZWwgICA9IERPTS5yZXF1aXJlKCdsYWJlbCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgLy8gaU9TIG5lZWRzIGRpZmZlcmVudCB0eXBlIGFuZCBwYXR0ZXJuIHRvIHNob3cgYSBudW1lcmljYWwga2V5Ym9hcmRcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnR5cGUgICAgPSAndGVsJztcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnBhdHRlcm4gPSAnWzAtOV0rJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSB0YXJnZXQgY29udGV4dCdzIGludGVnZXIgZGF0YSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuc2luZ3VsYXIgICA9IHRhcmdldC5kYXRhc2V0WydzaW5ndWxhciddO1xyXG4gICAgICAgIHRoaXMucGx1cmFsICAgICA9IHRhcmdldC5kYXRhc2V0WydwbHVyYWwnXTtcclxuICAgICAgICB0aGlzLndvcmRzICAgICAgPSBQYXJzZS5ib29sZWFuKHRhcmdldC5kYXRhc2V0Wyd3b3JkcyddIHx8ICdmYWxzZScpO1xyXG5cclxuICAgICAgICBsZXQgdmFsdWUgPSBSQUcuc3RhdGUuZ2V0SW50ZWdlcih0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICBpZiAgICAgICh0aGlzLnNpbmd1bGFyICYmIHZhbHVlID09PSAxKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMuc2luZ3VsYXI7XHJcbiAgICAgICAgZWxzZSBpZiAodGhpcy5wbHVyYWwgJiYgdmFsdWUgIT09IDEpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5wbHVyYWw7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9ICcnO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9JTlRFR0VSKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnZhbHVlICAgID0gdmFsdWUudG9TdHJpbmcoKTtcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgaW50ZWdlciBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX0lOVF9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgLy8gQ2FuJ3QgdXNlIHZhbHVlQXNOdW1iZXIgZHVlIHRvIGlPUyBpbnB1dCB0eXBlIHdvcmthcm91bmRzXHJcbiAgICAgICAgbGV0IGludCAgICA9IHBhcnNlSW50KHRoaXMuaW5wdXREaWdpdC52YWx1ZSk7XHJcbiAgICAgICAgbGV0IGludFN0ciA9ICh0aGlzLndvcmRzKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgLy8gSWdub3JlIGludmFsaWQgdmFsdWVzXHJcbiAgICAgICAgaWYgKCBpc05hTihpbnQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9ICcnO1xyXG5cclxuICAgICAgICBpZiAoaW50ID09PSAxICYmIHRoaXMuc2luZ3VsYXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3RoaXMuc2luZ3VsYXJ9YDtcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnNpbmd1bGFyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmIChpbnQgIT09IDEgJiYgdGhpcy5wbHVyYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3RoaXMucGx1cmFsfWA7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5wbHVyYWw7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0SW50ZWdlcih0aGlzLmN1cnJlbnRDdHgsIGludCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPWludGVnZXJdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gaW50U3RyKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIG5hbWVkIHRyYWluIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgTmFtZWRQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCduYW1lZCcpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9OQU1FRCgpO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2UubmFtZWQuZm9yRWFjaCggdiA9PiB0aGlzLmRvbUNob29zZXIuYWRkKHYpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgbmFtZVxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5wcmVzZWxlY3QoUkFHLnN0YXRlLm5hbWVkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIG5hbWVkIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlLm5hbWVkID0gZW50cnkuaW5uZXJUZXh0O1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCduYW1lZCcsIFJBRy5zdGF0ZS5uYW1lZCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBocmFzZXNldCBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFBocmFzZXNldFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgcmVmZXJlbmNlIHRhZyBmb3IgdGhlIGN1cnJlbnQgcGhyYXNlc2V0IGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRSZWY/IDogc3RyaW5nO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3BocmFzZXNldCcpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgcGhyYXNlc2V0J3MgbGlzdCBvZiBwaHJhc2VzICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIGxldCByZWYgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IGlkeCA9IHBhcnNlSW50KCBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnaWR4JykgKTtcclxuXHJcbiAgICAgICAgbGV0IHBocmFzZXNldCA9IFJBRy5kYXRhYmFzZS5nZXRQaHJhc2VzZXQocmVmKTtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfUFNFVF9VTktOT1dOKHJlZikgKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UmVmICAgICAgICAgID0gcmVmO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1BIUkFTRVNFVChyZWYpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIuY2xlYXIoKTtcclxuXHJcbiAgICAgICAgLy8gRm9yIGVhY2ggcGhyYXNlLCB3ZSBuZWVkIHRvIHJ1biBpdCB0aHJvdWdoIHRoZSBwaHJhc2VyIHVzaW5nIHRoZSBjdXJyZW50IHN0YXRlXHJcbiAgICAgICAgLy8gdG8gZ2VuZXJhdGUgXCJwcmV2aWV3c1wiIG9mIGhvdyB0aGUgcGhyYXNlIHdpbGwgbG9vay5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBocmFzZXNldC5jaGlsZHJlbi5sZW5ndGg7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBwaHJhc2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG5cclxuICAgICAgICAgICAgRE9NLmNsb25lSW50byhwaHJhc2VzZXQuY2hpbGRyZW5baV0gYXMgSFRNTEVsZW1lbnQsIHBocmFzZSk7XHJcbiAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MocGhyYXNlKTtcclxuXHJcbiAgICAgICAgICAgIHBocmFzZS5pbm5lclRleHQgICA9IERPTS5nZXRDbGVhbmVkVmlzaWJsZVRleHQocGhyYXNlKTtcclxuICAgICAgICAgICAgcGhyYXNlLmRhdGFzZXQuaWR4ID0gaS50b1N0cmluZygpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5kb21DaG9vc2VyLmFkZFJhdyhwaHJhc2UsIGkgPT09IGlkeCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgcGhyYXNlc2V0IGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRSZWYpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfUFNFVF9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgbGV0IGlkeCA9IHBhcnNlSW50KGVudHJ5LmRhdGFzZXRbJ2lkeCddISk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRQaHJhc2VzZXRJZHgodGhpcy5jdXJyZW50UmVmLCBpZHgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnJlZnJlc2hQaHJhc2VzZXQodGhpcy5jdXJyZW50UmVmKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGxhdGZvcm0gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBQbGF0Zm9ybVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbnVtZXJpY2FsIGlucHV0IHNwaW5uZXIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXREaWdpdCAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGxldHRlciBkcm9wLWRvd24gaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExldHRlciA6IEhUTUxTZWxlY3RFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3BsYXRmb3JtJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdCAgICAgICAgICA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyICAgICAgICAgPSBET00ucmVxdWlyZSgnc2VsZWN0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1BMQVRGT1JNKCk7XHJcblxyXG4gICAgICAgIC8vIGlPUyBuZWVkcyBkaWZmZXJlbnQgdHlwZSBhbmQgcGF0dGVybiB0byBzaG93IGEgbnVtZXJpY2FsIGtleWJvYXJkXHJcbiAgICAgICAgaWYgKERPTS5pc2lPUylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC50eXBlICAgID0gJ3RlbCc7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5wYXR0ZXJuID0gJ1swLTldKyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIHBsYXRmb3JtIGRhdGEgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgbGV0IHZhbHVlID0gUkFHLnN0YXRlLnBsYXRmb3JtO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQudmFsdWUgID0gdmFsdWVbMF07XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9IHZhbHVlWzFdO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBwbGF0Zm9ybSBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIElnbm9yZSBpbnZhbGlkIHZhbHVlc1xyXG4gICAgICAgIGlmICggaXNOYU4oIHBhcnNlSW50KHRoaXMuaW5wdXREaWdpdC52YWx1ZSkgKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnBsYXRmb3JtID0gW3RoaXMuaW5wdXREaWdpdC52YWx1ZSwgdGhpcy5pbnB1dExldHRlci52YWx1ZV07XHJcblxyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCAncGxhdGZvcm0nLCBSQUcuc3RhdGUucGxhdGZvcm0uam9pbignJykgKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNlcnZpY2UgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTZXJ2aWNlUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBzZXJ2aWNlIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdzZXJ2aWNlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2Uuc2VydmljZXMuZm9yRWFjaCggdiA9PiB0aGlzLmRvbUNob29zZXIuYWRkKHYpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3Mgc2VydmljZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NFUlZJQ0UodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgc2VydmljZVxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5wcmVzZWxlY3QoIFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKHRoaXMuY3VycmVudEN0eCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHNlcnZpY2UgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9TRVJWSUNFX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U2VydmljZSh0aGlzLmN1cnJlbnRDdHgsIGVudHJ5LmlubmVyVGV4dCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPXNlcnZpY2VdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gZW50cnkuaW5uZXJUZXh0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc3RhdGlvbiBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFN0YXRpb25QaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIHNoYXJlZCBzdGF0aW9uIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBjaG9vc2VyIDogU3RhdGlvbkNob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBzdGF0aW9uIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvbk9wZW4gZGVsZWdhdGUgZm9yIFN0YXRpb25QaWNrZXIgb3IgZm9yIFN0YXRpb25MaXN0UGlja2VyICovXHJcbiAgICBwcm90ZWN0ZWQgb25PcGVuICAgICA6ICh0YXJnZXQ6IEhUTUxFbGVtZW50KSA9PiB2b2lkO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcih0YWc6IHN0cmluZyA9ICdzdGF0aW9uJylcclxuICAgIHtcclxuICAgICAgICBzdXBlcih0YWcpO1xyXG5cclxuICAgICAgICBpZiAoIVN0YXRpb25QaWNrZXIuY2hvb3NlcilcclxuICAgICAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyID0gbmV3IFN0YXRpb25DaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcblxyXG4gICAgICAgIHRoaXMub25PcGVuID0gdGhpcy5vblN0YXRpb25QaWNrZXJPcGVuLmJpbmQodGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpcmVzIHRoZSBvbk9wZW4gZGVsZWdhdGUgcmVnaXN0ZXJlZCBmb3IgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuICAgICAgICB0aGlzLm9uT3Blbih0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBdHRhY2hlcyB0aGUgc3RhdGlvbiBjaG9vc2VyIGFuZCBmb2N1c2VzIGl0IG9udG8gdGhlIGN1cnJlbnQgZWxlbWVudCdzIHN0YXRpb24gKi9cclxuICAgIHByb3RlY3RlZCBvblN0YXRpb25QaWNrZXJPcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjaG9vc2VyICAgICA9IFN0YXRpb25QaWNrZXIuY2hvb3NlcjtcclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjaG9vc2VyLmF0dGFjaCh0aGlzLCB0aGlzLm9uU2VsZWN0U3RhdGlvbik7XHJcbiAgICAgICAgY2hvb3Nlci5wcmVzZWxlY3RDb2RlKCBSQUcuc3RhdGUuZ2V0U3RhdGlvbih0aGlzLmN1cnJlbnRDdHgpICk7XHJcbiAgICAgICAgY2hvb3Nlci5zZWxlY3RPbkNsaWNrID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU1RBVElPTih0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBzdGF0aW9uIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IFN0YXRpb25QaWNrZXIuY2hvb3Nlci5vbkNsaWNrKGV2KTsgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IFN0YXRpb25QaWNrZXIuY2hvb3Nlci5vbklucHV0KGV2KTsgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IFN0YXRpb25QaWNrZXIuY2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgc3RhdGlvbiBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdFN0YXRpb24oZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcXVlcnkgPSBgW2RhdGEtdHlwZT1zdGF0aW9uXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWA7XHJcbiAgICAgICAgbGV0IGNvZGUgID0gZW50cnkuZGF0YXNldFsnY29kZSddITtcclxuICAgICAgICBsZXQgbmFtZSAgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlLCB0cnVlKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFN0YXRpb24odGhpcy5jdXJyZW50Q3R4LCBjb2RlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkocXVlcnkpXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IG5hbWUpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwic3RhdGlvblBpY2tlci50c1wiLz5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uLy4uL3ZlbmRvci9kcmFnZ2FibGUuZC50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc3RhdGlvbiBsaXN0IHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU3RhdGlvbkxpc3RQaWNrZXIgZXh0ZW5kcyBTdGF0aW9uUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjb250YWluZXIgZm9yIHRoZSBsaXN0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tTGlzdCAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtb2JpbGUtb25seSBhZGQgc3RhdGlvbiBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQWRkICAgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtb2JpbGUtb25seSBjbG9zZSBwaWNrZXIgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkNsb3NlICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgZHJvcCB6b25lIGZvciBkZWxldGluZyBzdGF0aW9uIGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbURlbCAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgYWN0dWFsIHNvcnRhYmxlIGxpc3Qgb2Ygc3RhdGlvbnMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMaXN0ICAgIDogSFRNTERMaXN0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gcGxhY2Vob2xkZXIgc2hvd24gaWYgdGhlIGxpc3QgaXMgZW1wdHkgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tRW1wdHlMaXN0IDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcihcInN0YXRpb25saXN0XCIpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUxpc3QgICAgICA9IERPTS5yZXF1aXJlKCcuc3RhdGlvbkxpc3QnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5idG5BZGQgICAgICAgPSBET00ucmVxdWlyZSgnLmFkZFN0YXRpb24nLCAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmJ0bkNsb3NlICAgICA9IERPTS5yZXF1aXJlKCcuY2xvc2VQaWNrZXInLCB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuZG9tRGVsICAgICAgID0gRE9NLnJlcXVpcmUoJy5kZWxTdGF0aW9uJywgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QgICAgPSBET00ucmVxdWlyZSgnZGwnLCAgICAgICAgICAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdCA9IERPTS5yZXF1aXJlKCdwJywgICAgICAgICAgICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMub25PcGVuICAgICAgID0gdGhpcy5vblN0YXRpb25MaXN0UGlja2VyT3Blbi5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICBuZXcgRHJhZ2dhYmxlLlNvcnRhYmxlKFt0aGlzLmlucHV0TGlzdCwgdGhpcy5kb21EZWxdLCB7IGRyYWdnYWJsZTogJ2RkJyB9KVxyXG4gICAgICAgICAgICAvLyBIYXZlIHRvIHVzZSB0aW1lb3V0LCB0byBsZXQgRHJhZ2dhYmxlIGZpbmlzaCBzb3J0aW5nIHRoZSBsaXN0XHJcbiAgICAgICAgICAgIC5vbiggJ2RyYWc6c3RvcCcsIGV2ID0+IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5vbkRyYWdTdG9wKGV2KSwgMSkgKVxyXG4gICAgICAgICAgICAub24oICdtaXJyb3I6Y3JlYXRlJywgdGhpcy5vbkRyYWdNaXJyb3JDcmVhdGUuYmluZCh0aGlzKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUG9wdWxhdGVzIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciwgd2l0aCB0aGUgc2VsZWN0ZWQgbGlzdC4gQmVjYXVzZSB0aGlzIHBpY2tlclxyXG4gICAgICogZXh0ZW5kcyBmcm9tIFN0YXRpb25MaXN0LCB0aGlzIGhhbmRsZXIgb3ZlcnJpZGVzIHRoZSAnb25PcGVuJyBkZWxlZ2F0ZSBwcm9wZXJ0eVxyXG4gICAgICogb2YgU3RhdGlvbkxpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBTdGF0aW9uIGxpc3QgZWRpdG9yIGVsZW1lbnQgdG8gb3BlbiBmb3JcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3RhdGlvbkxpc3RQaWNrZXJPcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFNpbmNlIHdlIHNoYXJlIHRoZSBzdGF0aW9uIHBpY2tlciB3aXRoIFN0YXRpb25MaXN0LCBncmFiIGl0XHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmF0dGFjaCh0aGlzLCB0aGlzLm9uQWRkU3RhdGlvbik7XHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLnNlbGVjdE9uQ2xpY2sgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgZW50cmllcyAgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbkxpc3QodGhpcy5jdXJyZW50Q3R4KS5zbGljZSgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TVEFUSU9OTElTVCh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICAvLyBSZW1vdmUgYWxsIG9sZCBsaXN0IGVsZW1lbnRzXHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuaW5uZXJIVE1MID0gJyc7XHJcblxyXG4gICAgICAgIC8vIEZpbmFsbHksIHBvcHVsYXRlIGxpc3QgZnJvbSB0aGUgY2xpY2tlZCBzdGF0aW9uIGxpc3QgZWxlbWVudFxyXG4gICAgICAgIGVudHJpZXMuZm9yRWFjaCggdiA9PiB0aGlzLmFkZCh2KSApO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZCB7IHN1cGVyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsaWNrIGV2ZW50cywgZm9yIGNob29zaW5nIGl0ZW1zICovXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub25DbGljayhldik7XHJcblxyXG4gICAgICAgIGlmIChldi50YXJnZXQgPT09IHRoaXMuYnRuQ2xvc2UpXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICAvLyBGb3IgbW9iaWxlIHVzZXJzLCBzd2l0Y2ggdG8gc3RhdGlvbiBjaG9vc2VyIHNjcmVlbiBpZiBcIkFkZC4uLlwiIHdhcyBjbGlja2VkXHJcbiAgICAgICAgaWYgKGV2LnRhcmdldCA9PT0gdGhpcy5idG5BZGQpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5hZGQoJ2FkZGluZ1N0YXRpb24nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBrZXlib2FyZCBuYXZpZ2F0aW9uIGZvciB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIgKi9cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vbklucHV0KGV2KTtcclxuXHJcbiAgICAgICAgbGV0IGtleSAgICAgPSBldi5rZXk7XHJcbiAgICAgICAgbGV0IGZvY3VzZWQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAvLyBPbmx5IGhhbmRsZSB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIgY29udHJvbFxyXG4gICAgICAgIGlmICggIWZvY3VzZWQgfHwgIXRoaXMuaW5wdXRMaXN0LmNvbnRhaW5zKGZvY3VzZWQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUga2V5Ym9hcmQgbmF2aWdhdGlvblxyXG4gICAgICAgIGlmIChrZXkgPT09ICdBcnJvd0xlZnQnIHx8IGtleSA9PT0gJ0Fycm93UmlnaHQnKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGRpciA9IChrZXkgPT09ICdBcnJvd0xlZnQnKSA/IC0xIDogMTtcclxuICAgICAgICAgICAgbGV0IG5hdiA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBmb2N1c2VkIGVsZW1lbnRcclxuICAgICAgICAgICAgaWYgKGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dExpc3QpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGV2YW50IHRvIGJlZ2lubmluZyBvciBlbmQgb2YgY29udGFpbmVyXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA9PT0gLTEpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5maXJzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQubGFzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChuYXYpIG5hdi5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGVudHJ5IGRlbGV0aW9uXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0RlbGV0ZScgfHwga2V5ID09PSAnQmFja3NwYWNlJylcclxuICAgICAgICBpZiAoZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0TGlzdClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEZvY3VzIG9uIG5leHQgZWxlbWVudCBvciBwYXJlbnQgb24gZGVsZXRlXHJcbiAgICAgICAgICAgIGxldCBuZXh0ID0gZm9jdXNlZC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgZm9jdXNlZC5uZXh0RWxlbWVudFNpYmxpbmcgICAgIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgdGhpcy5pbnB1dExpc3Q7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnJlbW92ZShmb2N1c2VkKTtcclxuICAgICAgICAgICAgbmV4dC5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlciBmb3Igd2hlbiBhIHN0YXRpb24gaXMgY2hvc2VuICovXHJcbiAgICBwcml2YXRlIG9uQWRkU3RhdGlvbihlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXdFbnRyeSA9IHRoaXMuYWRkKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG5cclxuICAgICAgICAvLyBTd2l0Y2ggYmFjayB0byBidWlsZGVyIHNjcmVlbiwgaWYgb24gbW9iaWxlXHJcbiAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LnJlbW92ZSgnYWRkaW5nU3RhdGlvbicpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlKCk7XHJcblxyXG4gICAgICAgIC8vIEZvY3VzIG9ubHkgaWYgb24gbW9iaWxlLCBzaW5jZSB0aGUgc3RhdGlvbiBsaXN0IGlzIG9uIGEgZGVkaWNhdGVkIHNjcmVlblxyXG4gICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgICAgIG5ld0VudHJ5LmRvbS5mb2N1cygpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgbmV3RW50cnkuZG9tLnNjcm9sbEludG9WaWV3KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpeGVzIG1pcnJvcnMgbm90IGhhdmluZyBjb3JyZWN0IHdpZHRoIG9mIHRoZSBzb3VyY2UgZWxlbWVudCwgb24gY3JlYXRlICovXHJcbiAgICBwcml2YXRlIG9uRHJhZ01pcnJvckNyZWF0ZShldjogRHJhZ2dhYmxlLkRyYWdFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFldi5kYXRhLnNvdXJjZSB8fCAhZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSlcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9TTF9EUkFHX01JU1NJTkcoKSApO1xyXG5cclxuICAgICAgICBldi5kYXRhLnNvdXJjZS5zdHlsZS53aWR0aCA9IGV2LmRhdGEub3JpZ2luYWxTb3VyY2UuY2xpZW50V2lkdGggKyAncHgnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGRyYWdnYWJsZSBzdGF0aW9uIG5hbWUgYmVpbmcgZHJvcHBlZCAqL1xyXG4gICAgcHJpdmF0ZSBvbkRyYWdTdG9wKGV2OiBEcmFnZ2FibGUuRHJhZ0V2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIWV2LmRhdGEub3JpZ2luYWxTb3VyY2UpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKGV2LmRhdGEub3JpZ2luYWxTb3VyY2UucGFyZW50RWxlbWVudCA9PT0gdGhpcy5kb21EZWwpXHJcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGV2LmRhdGEub3JpZ2luYWxTb3VyY2UpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYW5kIGFkZHMgYSBuZXcgZW50cnkgZm9yIHRoZSBidWlsZGVyIGxpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBjcmVhdGUgYW4gaXRlbSBmb3JcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhZGQoY29kZTogc3RyaW5nKSA6IFN0YXRpb25MaXN0SXRlbVxyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXdFbnRyeSA9IG5ldyBTdGF0aW9uTGlzdEl0ZW0oY29kZSk7XHJcblxyXG4gICAgICAgIC8vIEFkZCB0aGUgbmV3IGVudHJ5IHRvIHRoZSBzb3J0YWJsZSBsaXN0XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuYXBwZW5kQ2hpbGQobmV3RW50cnkuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcclxuXHJcbiAgICAgICAgLy8gRGlzYWJsZSB0aGUgYWRkZWQgc3RhdGlvbiBpbiB0aGUgY2hvb3NlclxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5kaXNhYmxlKGNvZGUpO1xyXG5cclxuICAgICAgICAvLyBEZWxldGUgaXRlbSBvbiBkb3VibGUgY2xpY2tcclxuICAgICAgICBuZXdFbnRyeS5kb20ub25kYmxjbGljayA9IF8gPT4gdGhpcy5yZW1vdmUobmV3RW50cnkuZG9tKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIG5ld0VudHJ5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVtb3ZlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBlbnRyeSBlbGVtZW50IGZyb20gdGhlIGJ1aWxkZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVudHJ5IEVsZW1lbnQgb2YgdGhlIHN0YXRpb24gZW50cnkgdG8gcmVtb3ZlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcmVtb3ZlKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhdGhpcy5kb21MaXN0LmNvbnRhaW5zKGVudHJ5KSApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdBdHRlbXB0ZWQgdG8gcmVtb3ZlIGVudHJ5IG5vdCBvbiBzdGF0aW9uIGxpc3QgYnVpbGRlcicpO1xyXG5cclxuICAgICAgICAvLyBFbmFibGVkIHRoZSByZW1vdmVkIHN0YXRpb24gaW4gdGhlIGNob29zZXJcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuZW5hYmxlKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG5cclxuICAgICAgICBlbnRyeS5yZW1vdmUoKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5pbnB1dExpc3QuY2hpbGRyZW4ubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgc3RhdGlvbiBsaXN0IGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNoaWxkcmVuID0gdGhpcy5pbnB1dExpc3QuY2hpbGRyZW47XHJcblxyXG4gICAgICAgIC8vIERvbid0IHVwZGF0ZSBpZiBsaXN0IGlzIGVtcHR5XHJcbiAgICAgICAgaWYgKGNoaWxkcmVuLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgbGlzdCA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVudHJ5ID0gY2hpbGRyZW5baV0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICBsaXN0LnB1c2goZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgdGV4dExpc3QgPSBTdHJpbmdzLmZyb21TdGF0aW9uTGlzdChsaXN0LnNsaWNlKCksIHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ICAgID0gYFtkYXRhLXR5cGU9c3RhdGlvbmxpc3RdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYDtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFN0YXRpb25MaXN0KHRoaXMuY3VycmVudEN0eCwgbGlzdCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KHF1ZXJ5KVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0ZXh0TGlzdCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHRpbWUgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBUaW1lUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyB0aW1lIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRUaW1lOiBIVE1MSW5wdXRFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgdGltZSBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigndGltZScpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0VGltZSA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyB0aW1lICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfVElNRSh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0VGltZS52YWx1ZSA9IFJBRy5zdGF0ZS5nZXRUaW1lKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgdGltZSBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1RJTUVfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRUaW1lKHRoaXMuY3VycmVudEN0eCwgdGhpcy5pbnB1dFRpbWUudmFsdWUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT10aW1lXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuaW5wdXRUaW1lLnZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBMYW5ndWFnZSBlbnRyaWVzIGFyZSB0ZW1wbGF0ZSBkZWxlZ2F0ZXMgKi9cclxudHlwZSBMYW5ndWFnZUVudHJ5ID0gKC4uLnBhcnRzOiBzdHJpbmdbXSkgPT4gc3RyaW5nIDtcclxuXHJcbmFic3RyYWN0IGNsYXNzIEJhc2VMYW5ndWFnZVxyXG57XHJcbiAgICBbaW5kZXg6IHN0cmluZ10gOiBMYW5ndWFnZUVudHJ5IHwgc3RyaW5nIHwgc3RyaW5nW107XHJcblxyXG4gICAgLy8gUkFHXHJcblxyXG4gICAgLyoqIFdlbGNvbWUgbWVzc2FnZSwgc2hvd24gb24gbWFycXVlZSBvbiBmaXJzdCBsb2FkICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBXRUxDT01FICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXF1aXJlZCBET00gZWxlbWVudCBpcyBtaXNzaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBET01fTUlTU0lORyAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXF1aXJlZCBlbGVtZW50IGF0dHJpYnV0ZSBpcyBtaXNzaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBBVFRSX01JU1NJTkcgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXF1aXJlZCBkYXRhc2V0IGVudHJ5IGlzIG1pc3NpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERBVEFfTUlTU0lORyAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEJhZCBkaXJlY3Rpb24gYXJndW1lbnQgZ2l2ZW4gdG8gZGlyZWN0aW9uYWwgZnVuY3Rpb24gKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEJBRF9ESVJFQ1RJT04gOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEJhZCBib29sZWFuIHN0cmluZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQkFEX0JPT0xFQU4gICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gU3RhdGVcclxuXHJcbiAgICAvKiogU3RhdGUgc3VjY2Vzc2Z1bGx5IGxvYWRlZCBmcm9tIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX0ZST01fU1RPUkFHRSAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU3RhdGUgc3VjY2Vzc2Z1bGx5IHNhdmVkIHRvIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1RPX1NUT1JBR0UgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogSW5zdHJ1Y3Rpb25zIGZvciBjb3B5L3Bhc3Rpbmcgc2F2ZWQgc3RhdGUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX0NPUFlfUEFTVEUgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogSGVhZGVyIGZvciBkdW1wZWQgcmF3IHN0YXRlIEpTT04gKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1JBV19KU09OICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQ291bGQgbm90IHNhdmUgc3RhdGUgdG8gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfU0FWRV9GQUlMICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBObyBzdGF0ZSB3YXMgYXZhaWxhYmxlIHRvIGxvYWQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1NBVkVfTUlTU0lORyAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogTm9uLWV4aXN0ZW50IHBocmFzZXNldCByZWZlcmVuY2Ugd2hlbiBnZXR0aW5nIGZyb20gc3RhdGUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX05PTkVYSVNUQU5UX1BIUkFTRVNFVCA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gQ29uZmlnXHJcblxyXG4gICAgLyoqIENvbmZpZyBmYWlsZWQgdG8gbG9hZCBmcm9tIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IENPTkZJR19MT0FEX0ZBSUwgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBDb25maWcgZmFpbGVkIHRvIHNhdmUgdG8gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQ09ORklHX1NBVkVfRkFJTCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIENvbmZpZyBmYWlsZWQgdG8gY2xlYXIgZnJvbSBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBDT05GSUdfUkVTRVRfRkFJTCA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gRGF0YWJhc2VcclxuXHJcbiAgICAvKiogR2l2ZW4gZWxlbWVudCBpc24ndCBhIHBocmFzZXNldCBpRnJhbWUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERCX0VMRU1FTlRfTk9UX1BIUkFTRVNFVF9JRlJBTUUgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFVua25vd24gc3RhdGlvbiBjb2RlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9VTktOT1dOX1NUQVRJT04gICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTdGF0aW9uIGNvZGUgd2l0aCBibGFuayBuYW1lICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9FTVBUWV9TVEFUSU9OICAgICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBQaWNraW5nIHRvbyBtYW55IHN0YXRpb24gY29kZXMgaW4gb25lIGdvICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9UT09fTUFOWV9TVEFUSU9OUyAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBUb29sYmFyXHJcblxyXG4gICAgLy8gVG9vbHRpcHMvdGl0bGUgdGV4dCBmb3IgdG9vbGJhciBidXR0b25zXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1BMQVkgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU1RPUCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TSFVGRkxFICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NBVkUgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfTE9BRCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TRVRUSU5HUyA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gRWRpdG9yXHJcblxyXG4gICAgLy8gVG9vbHRpcHMvdGl0bGUgdGV4dCBmb3IgZWRpdG9yIGVsZW1lbnRzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9DT0FDSCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9FWENVU0UgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9JTlRFR0VSICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9OQU1FRCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9PUFRfT1BFTiAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9PUFRfQ0xPU0UgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9QSFJBU0VTRVQgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9QTEFURk9STSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9TRVJWSUNFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9TVEFUSU9OICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9TVEFUSU9OTElTVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9USU1FICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLyoqIEluaXRpYWwgbWVzc2FnZSB3aGVuIHNldHRpbmcgdXAgZWRpdG9yICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBFRElUT1JfSU5JVCAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcGxhY2VtZW50IHRleHQgZm9yIHVua25vd24gZWRpdG9yIGVsZW1lbnRzICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBFRElUT1JfVU5LTk9XTl9FTEVNRU5UICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcGxhY2VtZW50IHRleHQgZm9yIGVkaXRvciBwaHJhc2VzIHdpdGggdW5rbm93biByZWZlcmVuY2UgaWRzICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBFRElUT1JfVU5LTk9XTl9QSFJBU0UgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcGxhY2VtZW50IHRleHQgZm9yIGVkaXRvciBwaHJhc2VzZXRzIHdpdGggdW5rbm93biByZWZlcmVuY2UgaWRzICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBFRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFBocmFzZXJcclxuXHJcbiAgICAvKiogVG9vIG1hbnkgbGV2ZWxzIG9mIHJlY3Vyc2lvbiBpbiB0aGUgcGhyYXNlciAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUEhSQVNFUl9UT09fUkVDVVJTSVZFIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBQaWNrZXJzXHJcblxyXG4gICAgLy8gSGVhZGVycyBmb3IgcGlja2VyIGRpYWxvZ3NcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9DT0FDSCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfRVhDVVNFICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX0lOVEVHRVIgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9OQU1FRCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfUEhSQVNFU0VUICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1BMQVRGT1JNICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9TRVJWSUNFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfU1RBVElPTiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1NUQVRJT05MSVNUIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9USU1FICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gVG9vbHRpcHMvdGl0bGUgYW5kIHBsYWNlaG9sZGVyIHRleHQgZm9yIHBpY2tlciBjb250cm9sc1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9HRU5FUklDX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0dFTkVSSUNfUEggICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfQ09BQ0hfVCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9FWENVU0VfVCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0VYQ1VTRV9QSCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfRVhDVVNFX0lURU1fVCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9JTlRfVCAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX05BTUVEX1QgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfTkFNRURfUEggICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9OQU1FRF9JVEVNX1QgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfVCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9QSCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX0lURU1fVCAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BMQVRfTlVNQkVSX1QgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUExBVF9MRVRURVJfVCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZfUEggICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVl9JVEVNX1QgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TVEFUSU9OX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NUQVRJT05fUEggICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU1RBVElPTl9JVEVNX1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9BREQgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0FERF9UICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQ0xPU0UgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9DTE9TRV9UICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0VNUFRZICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfRFJBR19UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9ERUxFVEUgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RFTEVURV9UICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfSVRFTV9UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9USU1FX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLyoqIENvYWNoIHBpY2tlcidzIG9uQ2hhbmdlIGZpcmVkIHdpdGhvdXQgY29udGV4dCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9DT0FDSF9NSVNTSU5HX1NUQVRFICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEludGVnZXIgcGlja2VyJ3Mgb25DaGFuZ2UgZmlyZWQgd2l0aG91dCBjb250ZXh0ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0lOVF9NSVNTSU5HX1NUQVRFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUGhyYXNlc2V0IHBpY2tlcidzIG9uU2VsZWN0IGZpcmVkIHdpdGhvdXQgcmVmZXJlbmNlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfTUlTU0lOR19TVEFURSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU2VydmljZSBwaWNrZXIncyBvblNlbGVjdCBmaXJlZCB3aXRob3V0IHJlZmVyZW5jZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWSUNFX01JU1NJTkdfU1RBVEUgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFNlcnZpY2UgcGlja2VyJ3Mgb25DaGFuZ2UgZmlyZWQgd2l0aG91dCByZWZlcmVuY2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfVElNRV9NSVNTSU5HX1NUQVRFICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBQaHJhc2VzZXQgcGlja2VyIG9wZW5lZCBmb3IgdW5rbm93biBwaHJhc2VzZXQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9VTktOT1dOICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBEcmFnIG1pcnJvciBjcmVhdGUgZXZlbnQgaW4gc3RhdGlvbiBsaXN0IG1pc3Npbmcgc3RhdGUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfRFJBR19NSVNTSU5HICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBTZXR0aW5nc1xyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIGFuZCBsYWJlbCB0ZXh0IGZvciBzZXR0aW5ncyBlbGVtZW50c1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVQgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9DT05GSVJNICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfQ09ORklSTV9UIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX0RPTkUgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TQVZFICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU0FWRV9UICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSCAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfQ0hPSUNFICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX0VNUFRZICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9WT0wgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfUElUQ0ggICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1JBVEUgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9URVNUICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfVEVTVF9UICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfTEVHQUwgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBVSSBjb250cm9sc1xyXG5cclxuICAgIC8qKiBIZWFkZXIgZm9yIHRoZSBcInRvbyBzbWFsbFwiIHdhcm5pbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFdBUk5fU0hPUlRfSEVBREVSIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBCb2R5IHRleHQgZm9yIHRoZSBcInRvbyBzbWFsbFwiIHdhcm5pbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFdBUk5fU0hPUlQgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBNaXNjLiBjb25zdGFudHNcclxuXHJcbiAgICAvKiogQXJyYXkgb2YgdGhlIGVudGlyZSBhbHBoYWJldCBvZiB0aGUgbGFuZ3VhZ2UsIGZvciBjb2FjaCBsZXR0ZXJzICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBMRVRURVJTIDogc3RyaW5nO1xyXG4gICAgLyoqIEFycmF5IG9mIG51bWJlcnMgYXMgd29yZHMgKGUuZy4gemVybywgb25lLCB0d28pLCBtYXRjaGluZyB0aGVpciBpbmRleCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRElHSVRTICA6IHN0cmluZ1tdO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiQmFzZUxhbmd1YWdlLnRzXCIvPlxyXG5cclxuY2xhc3MgRW5nbGlzaExhbmd1YWdlIGV4dGVuZHMgQmFzZUxhbmd1YWdlXHJcbntcclxuICAgIFdFTENPTUUgICAgICAgPSAoKSA9PiAnV2VsY29tZSB0byBSYWlsIEFubm91bmNlbWVudCBHZW5lcmF0b3IuJztcclxuICAgIERPTV9NSVNTSU5HICAgPSAocTogc3RyaW5nKSA9PiBgUmVxdWlyZWQgRE9NIGVsZW1lbnQgaXMgbWlzc2luZzogJyR7cX0nYDtcclxuICAgIEFUVFJfTUlTU0lORyAgPSAoYTogc3RyaW5nKSA9PiBgUmVxdWlyZWQgYXR0cmlidXRlIGlzIG1pc3Npbmc6ICcke2F9J2A7XHJcbiAgICBEQVRBX01JU1NJTkcgID0gKGs6IHN0cmluZykgPT4gYFJlcXVpcmVkIGRhdGFzZXQga2V5IGlzIG1pc3Npbmcgb3IgZW1wdHk6ICcke2t9J2A7XHJcbiAgICBCQURfRElSRUNUSU9OID0gKHY6IHN0cmluZykgPT4gYERpcmVjdGlvbiBuZWVkcyB0byBiZSAtMSBvciAxLCBub3QgJyR7dn0nYDtcclxuICAgIEJBRF9CT09MRUFOICAgPSAodjogc3RyaW5nKSA9PiBgR2l2ZW4gc3RyaW5nIGRvZXMgbm90IHJlcHJlc2VudCBhIGJvb2xlYW46ICcke3Z9J2A7XHJcblxyXG4gICAgU1RBVEVfRlJPTV9TVE9SQUdFICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnU3RhdGUgaGFzIGJlZW4gbG9hZGVkIGZyb20gc3RvcmFnZS4nO1xyXG4gICAgU1RBVEVfVE9fU1RPUkFHRSAgICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnU3RhdGUgaGFzIGJlZW4gc2F2ZWQgdG8gc3RvcmFnZSwgYW5kIGR1bXBlZCB0byBjb25zb2xlLic7XHJcbiAgICBTVEFURV9DT1BZX1BBU1RFICAgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICclY0NvcHkgYW5kIHBhc3RlIHRoaXMgaW4gY29uc29sZSB0byBsb2FkIGxhdGVyOic7XHJcbiAgICBTVEFURV9SQVdfSlNPTiAgICAgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICclY1JhdyBKU09OIHN0YXRlOic7XHJcbiAgICBTVEFURV9TQVZFX0ZBSUwgICAgICAgICAgICAgPSAobXNnOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFNvcnJ5LCBzdGF0ZSBjb3VsZCBub3QgYmUgc2F2ZWQgdG8gc3RvcmFnZTogJHttc2d9LmA7XHJcbiAgICBTVEFURV9TQVZFX01JU1NJTkcgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTb3JyeSwgbm8gc3RhdGUgd2FzIGZvdW5kIGluIHN0b3JhZ2UuJztcclxuICAgIFNUQVRFX05PTkVYSVNUQU5UX1BIUkFTRVNFVCA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYEF0dGVtcHRlZCB0byBnZXQgY2hvc2VuIGluZGV4IGZvciBwaHJhc2VzZXQgKCR7cn0pIHRoYXQgZG9lc24ndCBleGlzdGA7XHJcblxyXG4gICAgQ09ORklHX0xPQURfRkFJTCAgPSAobXNnOiBzdHJpbmcpID0+IGBDb3VsZCBub3QgbG9hZCBzZXR0aW5nczogJHttc2d9YDtcclxuICAgIENPTkZJR19TQVZFX0ZBSUwgID0gKG1zZzogc3RyaW5nKSA9PiBgQ291bGQgbm90IHNhdmUgc2V0dGluZ3M6ICR7bXNnfWA7XHJcbiAgICBDT05GSUdfUkVTRVRfRkFJTCA9IChtc2c6IHN0cmluZykgPT4gYENvdWxkIG5vdCBjbGVhciBzZXR0aW5nczogJHttc2d9YDtcclxuXHJcbiAgICBEQl9FTEVNRU5UX05PVF9QSFJBU0VTRVRfSUZSQU1FID0gKGU6IHN0cmluZykgPT5cclxuICAgICAgICBgQ29uZmlndXJlZCBwaHJhc2VzZXQgZWxlbWVudCBxdWVyeSAoJHtlfSkgZG9lcyBub3QgcG9pbnQgdG8gYW4gaUZyYW1lIGVtYmVkYDtcclxuICAgIERCX1VOS05PV05fU1RBVElPTiAgID0gKGM6IHN0cmluZykgPT4gYFVOS05PV04gU1RBVElPTjogJHtjfWA7XHJcbiAgICBEQl9FTVBUWV9TVEFUSU9OICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFN0YXRpb24gZGF0YWJhc2UgYXBwZWFycyB0byBjb250YWluIGFuIGVtcHR5IG5hbWUgZm9yIGNvZGUgJyR7Y30nYDtcclxuICAgIERCX1RPT19NQU5ZX1NUQVRJT05TID0gKCkgPT4gJ1BpY2tpbmcgdG9vIG1hbnkgc3RhdGlvbnMgdGhhbiB0aGVyZSBhcmUgYXZhaWxhYmxlJztcclxuXHJcbiAgICBUT09MQkFSX1BMQVkgICAgID0gKCkgPT4gJ1BsYXkgcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU1RPUCAgICAgPSAoKSA9PiAnU3RvcCBwbGF5aW5nIHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NIVUZGTEUgID0gKCkgPT4gJ0dlbmVyYXRlIHJhbmRvbSBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TQVZFICAgICA9ICgpID0+ICdTYXZlIHN0YXRlIHRvIHN0b3JhZ2UnO1xyXG4gICAgVE9PTEJBUl9MT0FEICAgICA9ICgpID0+ICdSZWNhbGwgc3RhdGUgZnJvbSBzdG9yYWdlJztcclxuICAgIFRPT0xCQVJfU0VUVElOR1MgPSAoKSA9PiAnT3BlbiBzZXR0aW5ncyc7XHJcblxyXG4gICAgVElUTEVfQ09BQ0ggICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBjb2FjaCAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9FWENVU0UgICAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgJ0NsaWNrIHRvIGNoYW5nZSB0aGlzIGV4Y3VzZSc7XHJcbiAgICBUSVRMRV9JTlRFR0VSICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIG51bWJlciAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9OQU1FRCAgICAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgXCJDbGljayB0byBjaGFuZ2UgdGhpcyB0cmFpbidzIG5hbWVcIjtcclxuICAgIFRJVExFX09QVF9PUEVOICAgID0gKHQ6IHN0cmluZywgcjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBvcGVuIHRoaXMgb3B0aW9uYWwgJHt0fSAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9PUFRfQ0xPU0UgICA9ICh0OiBzdHJpbmcsIHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2xvc2UgdGhpcyBvcHRpb25hbCAke3R9ICgnJHtyfScpYDtcclxuICAgIFRJVExFX1BIUkFTRVNFVCAgID0gKHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoZSBwaHJhc2UgdXNlZCBpbiB0aGlzIHNlY3Rpb24gKCcke3J9JylgO1xyXG4gICAgVElUTEVfUExBVEZPUk0gICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgIFwiQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdHJhaW4ncyBwbGF0Zm9ybVwiO1xyXG4gICAgVElUTEVfU0VSVklDRSAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBzZXJ2aWNlICgnJHtjfScpYDtcclxuICAgIFRJVExFX1NUQVRJT04gICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc3RhdGlvbiAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9TVEFUSU9OTElTVCA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHN0YXRpb24gbGlzdCAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9USU1FICAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHRpbWUgKCcke2N9JylgO1xyXG5cclxuICAgIEVESVRPUl9JTklUICAgICAgICAgICAgICA9ICgpID0+ICdQbGVhc2Ugd2FpdC4uLic7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9FTEVNRU5UICAgPSAobjogc3RyaW5nKSA9PiBgKFVOS05PV04gWE1MIEVMRU1FTlQ6ICR7bn0pYDtcclxuICAgIEVESVRPUl9VTktOT1dOX1BIUkFTRSAgICA9IChyOiBzdHJpbmcpID0+IGAoVU5LTk9XTiBQSFJBU0U6ICR7cn0pYDtcclxuICAgIEVESVRPUl9VTktOT1dOX1BIUkFTRVNFVCA9IChyOiBzdHJpbmcpID0+IGAoVU5LTk9XTiBQSFJBU0VTRVQ6ICR7cn0pYDtcclxuXHJcbiAgICBQSFJBU0VSX1RPT19SRUNVUlNJVkUgPSAoKSA9PlxyXG4gICAgICAgICdUb28gbWFueSBsZXZlbHMgb2YgcmVjdXJzaW9uIHdoaWxzdCBwcm9jZXNzaW5nIHBocmFzZSc7XHJcblxyXG4gICAgSEVBREVSX0NPQUNIICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIGNvYWNoIGxldHRlciBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9FWENVU0UgICAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgJ1BpY2sgYW4gZXhjdXNlJztcclxuICAgIEhFQURFUl9JTlRFR0VSICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBudW1iZXIgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfTkFNRUQgICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGEgbmFtZWQgdHJhaW4nO1xyXG4gICAgSEVBREVSX1BIUkFTRVNFVCAgID0gKHI6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHBocmFzZSBmb3IgdGhlICcke3J9JyBzZWN0aW9uYDtcclxuICAgIEhFQURFUl9QTEFURk9STSAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgJ1BpY2sgYSBwbGF0Zm9ybSc7XHJcbiAgICBIRUFERVJfU0VSVklDRSAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgc2VydmljZSBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9TVEFUSU9OICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBzdGF0aW9uIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1NUQVRJT05MSVNUID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQnVpbGQgYSBzdGF0aW9uIGxpc3QgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfVElNRSAgICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgdGltZSBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuXHJcbiAgICBQX0dFTkVSSUNfVCAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgY2hvaWNlcyc7XHJcbiAgICBQX0dFTkVSSUNfUEggICAgID0gKCkgPT4gJ0ZpbHRlciBjaG9pY2VzLi4uJztcclxuICAgIFBfQ09BQ0hfVCAgICAgICAgPSAoKSA9PiAnQ29hY2ggbGV0dGVyJztcclxuICAgIFBfRVhDVVNFX1QgICAgICAgPSAoKSA9PiAnTGlzdCBvZiBkZWxheSBvciBjYW5jZWxsYXRpb24gZXhjdXNlcyc7XHJcbiAgICBQX0VYQ1VTRV9QSCAgICAgID0gKCkgPT4gJ0ZpbHRlciBleGN1c2VzLi4uJztcclxuICAgIFBfRVhDVVNFX0lURU1fVCAgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgZXhjdXNlJztcclxuICAgIFBfSU5UX1QgICAgICAgICAgPSAoKSA9PiAnSW50ZWdlciB2YWx1ZSc7XHJcbiAgICBQX05BTUVEX1QgICAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgdHJhaW4gbmFtZXMnO1xyXG4gICAgUF9OQU1FRF9QSCAgICAgICA9ICgpID0+ICdGaWx0ZXIgdHJhaW4gbmFtZS4uLic7XHJcbiAgICBQX05BTUVEX0lURU1fVCAgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIG5hbWUnO1xyXG4gICAgUF9QU0VUX1QgICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHBocmFzZXMnO1xyXG4gICAgUF9QU0VUX1BIICAgICAgICA9ICgpID0+ICdGaWx0ZXIgcGhyYXNlcy4uLic7XHJcbiAgICBQX1BTRVRfSVRFTV9UICAgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIHBocmFzZSc7XHJcbiAgICBQX1BMQVRfTlVNQkVSX1QgID0gKCkgPT4gJ1BsYXRmb3JtIG51bWJlcic7XHJcbiAgICBQX1BMQVRfTEVUVEVSX1QgID0gKCkgPT4gJ09wdGlvbmFsIHBsYXRmb3JtIGxldHRlcic7XHJcbiAgICBQX1NFUlZfVCAgICAgICAgID0gKCkgPT4gJ0xpc3Qgb2Ygc2VydmljZSBuYW1lcyc7XHJcbiAgICBQX1NFUlZfUEggICAgICAgID0gKCkgPT4gJ0ZpbHRlciBzZXJ2aWNlcy4uLic7XHJcbiAgICBQX1NFUlZfSVRFTV9UICAgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIHNlcnZpY2UnO1xyXG4gICAgUF9TVEFUSU9OX1QgICAgICA9ICgpID0+ICdMaXN0IG9mIHN0YXRpb24gbmFtZXMnO1xyXG4gICAgUF9TVEFUSU9OX1BIICAgICA9ICgpID0+ICdGaWx0ZXIgc3RhdGlvbnMuLi4nO1xyXG4gICAgUF9TVEFUSU9OX0lURU1fVCA9ICgpID0+ICdDbGljayB0byBzZWxlY3Qgb3IgYWRkIHRoaXMgc3RhdGlvbic7XHJcbiAgICBQX1NMX0FERCAgICAgICAgID0gKCkgPT4gJ0FkZCBzdGF0aW9uLi4uJztcclxuICAgIFBfU0xfQUREX1QgICAgICAgPSAoKSA9PiAnQWRkIHN0YXRpb24gdG8gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfQ0xPU0UgICAgICAgPSAoKSA9PiAnQ2xvc2UnO1xyXG4gICAgUF9TTF9DTE9TRV9UICAgICA9ICgpID0+ICdDbG9zZSB0aGlzIHBpY2tlcic7XHJcbiAgICBQX1NMX0VNUFRZICAgICAgID0gKCkgPT4gJ1BsZWFzZSBhZGQgYXQgbGVhc3Qgb25lIHN0YXRpb24gdG8gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfRFJBR19UICAgICAgPSAoKSA9PiAnRHJhZ2dhYmxlIHNlbGVjdGlvbiBvZiBzdGF0aW9ucyBmb3IgdGhpcyBsaXN0JztcclxuICAgIFBfU0xfREVMRVRFICAgICAgPSAoKSA9PiAnRHJvcCBoZXJlIHRvIGRlbGV0ZSc7XHJcbiAgICBQX1NMX0RFTEVURV9UICAgID0gKCkgPT4gJ0Ryb3Agc3RhdGlvbiBoZXJlIHRvIGRlbGV0ZSBpdCBmcm9tIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0lURU1fVCAgICAgID0gKCkgPT5cclxuICAgICAgICAnRHJhZyB0byByZW9yZGVyOyBkb3VibGUtY2xpY2sgb3IgZHJhZyBpbnRvIGRlbGV0ZSB6b25lIHRvIHJlbW92ZSc7XHJcbiAgICBQX1RJTUVfVCAgICAgICAgID0gKCkgPT4gJ1RpbWUgZWRpdG9yJztcclxuXHJcbiAgICBQX0NPQUNIX01JU1NJTkdfU1RBVEUgICA9ICgpID0+ICdvbkNoYW5nZSBmaXJlZCBmb3IgY29hY2ggcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9JTlRfTUlTU0lOR19TVEFURSAgICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIGludGVnZXIgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9QU0VUX01JU1NJTkdfU1RBVEUgICAgPSAoKSA9PiAnb25TZWxlY3QgZmlyZWQgZm9yIHBocmFzZXNldCBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX1NFUlZJQ0VfTUlTU0lOR19TVEFURSA9ICgpID0+ICdvblNlbGVjdCBmaXJlZCBmb3Igc2VydmljZSBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX1RJTUVfTUlTU0lOR19TVEFURSAgICA9ICgpID0+ICdvbkNoYW5nZSBmaXJlZCBmb3IgdGltZSBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX1BTRVRfVU5LTk9XTiAgICAgICAgICA9IChyOiBzdHJpbmcpID0+IGBQaHJhc2VzZXQgJyR7cn0nIGRvZXNuJ3QgZXhpc3RgO1xyXG4gICAgUF9TTF9EUkFHX01JU1NJTkcgICAgICAgPSAoKSA9PiAnRHJhZ2dhYmxlOiBNaXNzaW5nIHNvdXJjZSBlbGVtZW50cyBmb3IgbWlycm9yIGV2ZW50JztcclxuXHJcbiAgICBTVF9SRVNFVCAgICAgICAgICAgPSAoKSA9PiAnUmVzZXQgdG8gZGVmYXVsdHMnO1xyXG4gICAgU1RfUkVTRVRfVCAgICAgICAgID0gKCkgPT4gJ1Jlc2V0IHNldHRpbmdzIHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX0NPTkZJUk0gICA9ICgpID0+ICdBcmUgeW91IHN1cmU/JztcclxuICAgIFNUX1JFU0VUX0NPTkZJUk1fVCA9ICgpID0+ICdDb25maXJtIHJlc2V0IHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX0RPTkUgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1NldHRpbmdzIGhhdmUgYmVlbiByZXNldCB0byB0aGVpciBkZWZhdWx0cywgYW5kIGRlbGV0ZWQgZnJvbSBzdG9yYWdlLic7XHJcbiAgICBTVF9TQVZFICAgICAgICAgICAgPSAoKSA9PiAnU2F2ZSAmIGNsb3NlJztcclxuICAgIFNUX1NBVkVfVCAgICAgICAgICA9ICgpID0+ICdTYXZlIGFuZCBjbG9zZSBzZXR0aW5ncyc7XHJcbiAgICBTVF9TUEVFQ0ggICAgICAgICAgPSAoKSA9PiAnU3BlZWNoJztcclxuICAgIFNUX1NQRUVDSF9DSE9JQ0UgICA9ICgpID0+ICdWb2ljZSc7XHJcbiAgICBTVF9TUEVFQ0hfRU1QVFkgICAgPSAoKSA9PiAnTm9uZSBhdmFpbGFibGUnO1xyXG4gICAgU1RfU1BFRUNIX1ZPTCAgICAgID0gKCkgPT4gJ1ZvbHVtZSc7XHJcbiAgICBTVF9TUEVFQ0hfUElUQ0ggICAgPSAoKSA9PiAnUGl0Y2gnO1xyXG4gICAgU1RfU1BFRUNIX1JBVEUgICAgID0gKCkgPT4gJ1JhdGUnO1xyXG4gICAgU1RfU1BFRUNIX1RFU1QgICAgID0gKCkgPT4gJ1Rlc3Qgc3BlZWNoJztcclxuICAgIFNUX1NQRUVDSF9URVNUX1QgICA9ICgpID0+ICdQbGF5IGEgc3BlZWNoIHNhbXBsZSB3aXRoIHRoZSBjdXJyZW50IHNldHRpbmdzJztcclxuICAgIFNUX0xFR0FMICAgICAgICAgICA9ICgpID0+ICdMZWdhbCAmIEFja25vd2xlZGdlbWVudHMnO1xyXG5cclxuICAgIFdBUk5fU0hPUlRfSEVBREVSID0gKCkgPT4gJ1wiTWF5IEkgaGF2ZSB5b3VyIGF0dGVudGlvbiBwbGVhc2UuLi5cIic7XHJcbiAgICBXQVJOX1NIT1JUICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1RoaXMgZGlzcGxheSBpcyB0b28gc2hvcnQgdG8gc3VwcG9ydCBSQUcuIFBsZWFzZSBtYWtlIHRoaXMgd2luZG93IHRhbGxlciwgb3InICtcclxuICAgICAgICAnIHJvdGF0ZSB5b3VyIGRldmljZSBmcm9tIGxhbmRzY2FwZSB0byBwb3J0cmFpdC4nO1xyXG5cclxuICAgIC8vIFRPRE86IFRoZXNlIGRvbid0IGZpdCBoZXJlOyB0aGlzIHNob3VsZCBnbyBpbiB0aGUgZGF0YVxyXG4gICAgTEVUVEVSUyA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWic7XHJcbiAgICBESUdJVFMgID0gW1xyXG4gICAgICAgICd6ZXJvJywgICAgICdvbmUnLCAgICAgJ3R3bycsICAgICAndGhyZWUnLCAgICAgJ2ZvdXInLCAgICAgJ2ZpdmUnLCAgICAnc2l4JyxcclxuICAgICAgICAnc2V2ZW4nLCAgICAnZWlnaHQnLCAgICduaW5lJywgICAgJ3RlbicsICAgICAgICdlbGV2ZW4nLCAgICd0d2VsdmUnLCAgJ3RoaXJ0ZWVuJyxcclxuICAgICAgICAnZm91cnRlZW4nLCAnZmlmdGVlbicsICdzaXh0ZWVuJywgJ3NldmVudGVlbicsICdlaWdodGVlbicsICduaW50ZWVuJywgJ3R3ZW50eSdcclxuICAgIF07XHJcblxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKipcclxuICogSG9sZHMgbWV0aG9kcyBmb3IgcHJvY2Vzc2luZyBlYWNoIHR5cGUgb2YgcGhyYXNlIGVsZW1lbnQgaW50byBIVE1MLCB3aXRoIGRhdGEgdGFrZW5cclxuICogZnJvbSB0aGUgY3VycmVudCBzdGF0ZS4gRWFjaCBtZXRob2QgdGFrZXMgYSBjb250ZXh0IG9iamVjdCwgaG9sZGluZyBkYXRhIGZvciB0aGVcclxuICogY3VycmVudCBYTUwgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQgYW5kIHRoZSBYTUwgZG9jdW1lbnQgYmVpbmcgdXNlZC5cclxuICovXHJcbmNsYXNzIEVsZW1lbnRQcm9jZXNzb3JzXHJcbntcclxuICAgIC8qKiBGaWxscyBpbiBjb2FjaCBsZXR0ZXJzIGZyb20gQSB0byBaICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNvYWNoKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0NPQUNIKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldENvYWNoKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgZXhjdXNlLCBmb3IgYSBkZWxheSBvciBjYW5jZWxsYXRpb24gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZXhjdXNlKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfRVhDVVNFKCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZXhjdXNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBpbnRlZ2Vycywgb3B0aW9uYWxseSB3aXRoIG5vdW5zIGFuZCBpbiB3b3JkIGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50ZWdlcihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzaW5ndWxhciA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnc2luZ3VsYXInKTtcclxuICAgICAgICBsZXQgcGx1cmFsICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3BsdXJhbCcpO1xyXG4gICAgICAgIGxldCB3b3JkcyAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnd29yZHMnKTtcclxuXHJcbiAgICAgICAgbGV0IGludCAgICA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKGNvbnRleHQpO1xyXG4gICAgICAgIGxldCBpbnRTdHIgPSAod29yZHMgJiYgd29yZHMudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoaW50ID09PSAxICYmIHNpbmd1bGFyKVxyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3Npbmd1bGFyfWA7XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHBsdXJhbClcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHtwbHVyYWx9YDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0lOVEVHRVIoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHI7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcblxyXG4gICAgICAgIGlmIChzaW5ndWxhcikgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnc2luZ3VsYXInXSA9IHNpbmd1bGFyO1xyXG4gICAgICAgIGlmIChwbHVyYWwpICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsncGx1cmFsJ10gICA9IHBsdXJhbDtcclxuICAgICAgICBpZiAod29yZHMpICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3dvcmRzJ10gICAgPSB3b3JkcztcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG5hbWVkKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfTkFNRUQoKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5uYW1lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlLCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZShyZWYpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICAgICA9ICcnO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0UocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBocmFzZXMgd2l0aCBhIGNoYW5jZSB2YWx1ZSBhcyBjb2xsYXBzaWJsZVxyXG4gICAgICAgIGlmICggY3R4LnhtbEVsZW1lbnQuaGFzQXR0cmlidXRlKCdjaGFuY2UnKSApXHJcbiAgICAgICAgICAgIHRoaXMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcGhyYXNlLCByZWYpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgRE9NLmNsb25lSW50byhwaHJhc2UsIGN0eC5uZXdFbGVtZW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwaHJhc2UgZnJvbSBhIHByZXZpb3VzbHkgZGVmaW5lZCBwaHJhc2VzZXQsIGJ5IGl0cyBgaWRgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBocmFzZXNldChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgICAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZik7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGlkeCAgICA9IFJBRy5zdGF0ZS5nZXRQaHJhc2VzZXRJZHgocmVmKTtcclxuICAgICAgICBsZXQgcGhyYXNlID0gcGhyYXNlc2V0LmNoaWxkcmVuW2lkeF0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2lkeCddID0gaWR4LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlID0gTC5USVRMRV9QSFJBU0VTRVQocmVmKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBocmFzZXNldHMgd2l0aCBhIGNoYW5jZSB2YWx1ZSBhcyBjb2xsYXBzaWJsZVxyXG4gICAgICAgIGlmICggY3R4LnhtbEVsZW1lbnQuaGFzQXR0cmlidXRlKCdjaGFuY2UnKSApXHJcbiAgICAgICAgICAgIHRoaXMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcGhyYXNlLCByZWYpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgRE9NLmNsb25lSW50byhwaHJhc2UsIGN0eC5uZXdFbGVtZW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGxhdGZvcm0oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9QTEFURk9STSgpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLnBsYXRmb3JtLmpvaW4oJycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgcmFpbCBuZXR3b3JrIG5hbWUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2VydmljZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TRVJWSUNFKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldFNlcnZpY2UoY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHN0YXRpb24gbmFtZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RhdGlvbihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IGNvZGUgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbihjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1NUQVRJT04oY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlLCB0cnVlKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gc3RhdGlvbiBsaXN0cyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzdGF0aW9ubGlzdChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgICAgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzdGF0aW9ucyAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdChjb250ZXh0KS5zbGljZSgpO1xyXG4gICAgICAgIGxldCBzdGF0aW9uTGlzdCA9IFN0cmluZ3MuZnJvbVN0YXRpb25MaXN0KHN0YXRpb25zLCBjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1NUQVRJT05MSVNUKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gc3RhdGlvbkxpc3Q7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSB0aW1lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRpbWUoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfVElNRShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRUaW1lKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB2b3ggcGFydHMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdm94KGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQga2V5ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAna2V5Jyk7XHJcblxyXG4gICAgICAgIC8vIFRPRE86IExvY2FsaXplXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgICAgPSBjdHgueG1sRWxlbWVudC50ZXh0Q29udGVudDtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICAgICA9IGBDbGljayB0byBlZGl0IHRoaXMgcGhyYXNlICgke2tleX0pYDtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydrZXknXSA9IGtleTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB1bmtub3duIGVsZW1lbnRzIHdpdGggYW4gaW5saW5lIGVycm9yIG1lc3NhZ2UgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdW5rbm93bihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5hbWUgPSBjdHgueG1sRWxlbWVudC5ub2RlTmFtZTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX0VMRU1FTlQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50IGludG8gYSBuZXcgaW5uZXIgc3BhbiB0YWcsIHNvIHRoYXQgdGhleVxyXG4gICAgICogY2FuIGJlIG1hZGUgY29sbGFwc2libGUuIEFwcGVuZHMgaXQgdG8gdGhlIG5ldyBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbWFrZUNvbGxhcHNpYmxlKGN0eDogUGhyYXNlQ29udGV4dCwgc291cmNlOiBIVE1MRWxlbWVudCwgcmVmOiBzdHJpbmcpXHJcbiAgICAgICAgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNoYW5jZSAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnY2hhbmNlJykhO1xyXG4gICAgICAgIGxldCBpbm5lciAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgbGV0IHRvZ2dsZSAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICBsZXQgY29sbGFwc2VkID0gUkFHLnN0YXRlLmdldENvbGxhcHNlZCggcmVmLCBwYXJzZUludChjaGFuY2UpICk7XHJcblxyXG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5hZGQoJ2lubmVyJyk7XHJcbiAgICAgICAgdG9nZ2xlLmNsYXNzTGlzdC5hZGQoJ3RvZ2dsZScpO1xyXG5cclxuICAgICAgICBET00uY2xvbmVJbnRvKHNvdXJjZSwgaW5uZXIpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddID0gY2hhbmNlO1xyXG5cclxuICAgICAgICBDb2xsYXBzaWJsZXMuc2V0KGN0eC5uZXdFbGVtZW50LCB0b2dnbGUsIGNvbGxhcHNlZCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQodG9nZ2xlKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5hcHBlbmRDaGlsZChpbm5lcik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBSZXByZXNlbnRzIGNvbnRleHQgZGF0YSBmb3IgYSBwaHJhc2UsIHRvIGJlIHBhc3NlZCB0byBhbiBlbGVtZW50IHByb2Nlc3NvciAqL1xyXG5pbnRlcmZhY2UgUGhyYXNlQ29udGV4dFxyXG57XHJcbiAgICAvKiogR2V0cyB0aGUgWE1MIHBocmFzZSBlbGVtZW50IHRoYXQgaXMgYmVpbmcgcmVwbGFjZWQgKi9cclxuICAgIHhtbEVsZW1lbnQgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBHZXRzIHRoZSBIVE1MIHNwYW4gZWxlbWVudCB0aGF0IGlzIHJlcGxhY2luZyB0aGUgWE1MIGVsZW1lbnQgKi9cclxuICAgIG5ld0VsZW1lbnQgOiBIVE1MU3BhbkVsZW1lbnQ7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKlxyXG4gKiBIYW5kbGVzIHRoZSB0cmFuc2Zvcm1hdGlvbiBvZiBwaHJhc2UgWE1MIGRhdGEsIGludG8gSFRNTCBlbGVtZW50cyB3aXRoIHRoZWlyIGRhdGFcclxuICogZmlsbGVkIGluIGFuZCB0aGVpciBVSSBsb2dpYyB3aXJlZC5cclxuICovXHJcbmNsYXNzIFBocmFzZXJcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBSZWN1cnNpdmVseSBwcm9jZXNzZXMgWE1MIGVsZW1lbnRzLCBmaWxsaW5nIGluIGRhdGEgYW5kIGFwcGx5aW5nIHRyYW5zZm9ybXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciBQYXJlbnQgdG8gcHJvY2VzcyB0aGUgY2hpbGRyZW4gb2ZcclxuICAgICAqIEBwYXJhbSBsZXZlbCBDdXJyZW50IGxldmVsIG9mIHJlY3Vyc2lvbiwgbWF4LiAyMFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcHJvY2Vzcyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBsZXZlbDogbnVtYmVyID0gMClcclxuICAgIHtcclxuICAgICAgICAvLyBJbml0aWFsbHksIHRoaXMgbWV0aG9kIHdhcyBzdXBwb3NlZCB0byBqdXN0IGFkZCB0aGUgWE1MIGVsZW1lbnRzIGRpcmVjdGx5IGludG9cclxuICAgICAgICAvLyB0aGUgZG9jdW1lbnQuIEhvd2V2ZXIsIHRoaXMgY2F1c2VkIGEgbG90IG9mIHByb2JsZW1zIChlLmcuIHRpdGxlIG5vdCB3b3JraW5nKS5cclxuICAgICAgICAvLyBIVE1MIGRvZXMgbm90IHdvcmsgcmVhbGx5IHdlbGwgd2l0aCBjdXN0b20gZWxlbWVudHMsIGVzcGVjaWFsbHkgaWYgdGhleSBhcmUgb2ZcclxuICAgICAgICAvLyBhbm90aGVyIFhNTCBuYW1lc3BhY2UuXHJcblxyXG4gICAgICAgIGxldCBwZW5kaW5nID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJzpub3Qoc3BhbiknKSBhcyBOb2RlTGlzdE9mPEhUTUxFbGVtZW50PjtcclxuXHJcbiAgICAgICAgLy8gTm8gbW9yZSBYTUwgZWxlbWVudHMgdG8gZXhwYW5kXHJcbiAgICAgICAgaWYgKHBlbmRpbmcubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZvciBlYWNoIFhNTCBlbGVtZW50IGN1cnJlbnRseSBpbiB0aGUgY29udGFpbmVyOlxyXG4gICAgICAgIC8vICogQ3JlYXRlIGEgbmV3IHNwYW4gZWxlbWVudCBmb3IgaXRcclxuICAgICAgICAvLyAqIEhhdmUgdGhlIHByb2Nlc3NvcnMgdGFrZSBkYXRhIGZyb20gdGhlIFhNTCBlbGVtZW50LCB0byBwb3B1bGF0ZSB0aGUgbmV3IG9uZVxyXG4gICAgICAgIC8vICogUmVwbGFjZSB0aGUgWE1MIGVsZW1lbnQgd2l0aCB0aGUgbmV3IG9uZVxyXG4gICAgICAgIHBlbmRpbmcuZm9yRWFjaChlbGVtZW50ID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudE5hbWUgPSBlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICAgICAgbGV0IGNvbnRleHQgICAgID0ge1xyXG4gICAgICAgICAgICAgICAgeG1sRWxlbWVudDogZWxlbWVudCxcclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQ6IG5ld0VsZW1lbnRcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIG5ld0VsZW1lbnQuZGF0YXNldFsndHlwZSddID0gZWxlbWVudE5hbWU7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiB0aGUgZWxlbWVudCBpcyB2b3ggaGludGFibGUsIGFkZCB0aGUgdm94IGhpbnRcclxuICAgICAgICAgICAgaWYgKCBlbGVtZW50Lmhhc0F0dHJpYnV0ZSgndm94JykgKVxyXG4gICAgICAgICAgICAgICAgbmV3RWxlbWVudC5kYXRhc2V0Wyd2b3gnXSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCd2b3gnKSE7XHJcblxyXG4gICAgICAgICAgICAvLyBJIHdhbnRlZCB0byB1c2UgYW4gaW5kZXggb24gRWxlbWVudFByb2Nlc3NvcnMgZm9yIHRoaXMsIGJ1dCBpdCBjYXVzZWQgZXZlcnlcclxuICAgICAgICAgICAgLy8gcHJvY2Vzc29yIHRvIGhhdmUgYW4gXCJ1bnVzZWQgbWV0aG9kXCIgd2FybmluZy5cclxuICAgICAgICAgICAgc3dpdGNoIChlbGVtZW50TmFtZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnY29hY2gnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5jb2FjaChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdleGN1c2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLmV4Y3VzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2ludGVnZXInOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuaW50ZWdlcihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnbmFtZWQnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5uYW1lZChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BocmFzZXNldCc6ICAgRWxlbWVudFByb2Nlc3NvcnMucGhyYXNlc2V0KGNvbnRleHQpOyAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGxhdGZvcm0nOiAgICBFbGVtZW50UHJvY2Vzc29ycy5wbGF0Zm9ybShjb250ZXh0KTsgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnNlcnZpY2UoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb24nOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc3RhdGlvbmxpc3QnOiBFbGVtZW50UHJvY2Vzc29ycy5zdGF0aW9ubGlzdChjb250ZXh0KTsgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICd0aW1lJzogICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnRpbWUoY29udGV4dCk7ICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3ZveCc6ICAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudm94KGNvbnRleHQpOyAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogICAgICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy51bmtub3duKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGVsZW1lbnQucGFyZW50RWxlbWVudCEucmVwbGFjZUNoaWxkKG5ld0VsZW1lbnQsIGVsZW1lbnQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBSZWN1cnNlIHNvIHRoYXQgd2UgY2FuIGV4cGFuZCBhbnkgbmV3IGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKGxldmVsIDwgMjApXHJcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhjb250YWluZXIsIGxldmVsICsgMSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QSFJBU0VSX1RPT19SRUNVUlNJVkUoKSApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ3VzdG9tIHZvaWNlIHRoYXQgc3ludGhlc2l6ZXMgc3BlZWNoIGJ5IHBpZWNpbmcgcHJlLXJlY29yZGVkIGZpbGVzIHRvZ2V0aGVyICovXHJcbmNsYXNzIEN1c3RvbVZvaWNlXHJcbntcclxuICAgIC8qKiBDaGFuZ2VhYmxlIGJhc2UgcGF0aCBmb3IgYWxsIGN1c3RvbSB2b2ljZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYmFzZVBhdGggOiBzdHJpbmcgPSAnZGF0YS92b3gnO1xyXG5cclxuICAgIC8qKiBPbmx5IHByZXNlbnQgZm9yIGNvbnNpc3RlbmN5IHdpdGggU3BlZWNoU3ludGhlc2lzVm9pY2UgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkZWZhdWx0ICAgICAgOiBib29sZWFuO1xyXG4gICAgLyoqIEdldHMgdGhlIEJDUCA0NyB0YWcgaW5kaWNhdGluZyB0aGUgbGFuZ3VhZ2Ugb2YgdGhpcyB2b2ljZSAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGxhbmcgICAgICAgICA6IHN0cmluZztcclxuICAgIC8qKiBPbmx5IHByZXNlbnQgZm9yIGNvbnNpc3RlbmN5IHdpdGggU3BlZWNoU3ludGhlc2lzVm9pY2UgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBsb2NhbFNlcnZpY2UgOiBib29sZWFuO1xyXG4gICAgLyoqIEdldHMgdGhlIElEIG9mIHRoaXMgdm9pY2UgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBuYW1lICAgICAgICAgOiBzdHJpbmc7XHJcbiAgICAvKiogR2V0cyB0aGUgcmVsYXRpdmUgVVJJIG9mIHRoaXMgdm9pY2UncyBmaWxlcyAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IHZvaWNlVVJJICAgICA6IHN0cmluZztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoaWQ6IHN0cmluZywgbGFuZzogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZGVmYXVsdCAgICAgID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5sb2NhbFNlcnZpY2UgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLm5hbWUgICAgICAgICA9IGlkO1xyXG4gICAgICAgIHRoaXMubGFuZyAgICAgICAgID0gbGFuZztcclxuICAgICAgICB0aGlzLnZvaWNlVVJJICAgICA9IGAke0N1c3RvbVZvaWNlLmJhc2VQYXRofS8ke2lkfV8ke2xhbmd9YDtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgY2xhc3MgZm9yIHJlc29sdmluZyBhIGdpdmVuIHBocmFzZSB0byB2b3gga2V5cyAqL1xyXG5jbGFzcyBSZXNvbHZlclxyXG57XHJcbiAgICAvKiogVHJlZVdhbGtlciBmaWx0ZXIgdG8gcmVkdWNlIGEgd2FsayB0byBqdXN0IHRoZSBlbGVtZW50cyB0aGUgcmVzb2x2ZXIgbmVlZHMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSk6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgICAgID0gbm9kZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgcGFyZW50VHlwZSA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghcGFyZW50VHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCAgICAgPSBwYXJlbnQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHBhcmVudFR5cGUgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQWNjZXB0IHRleHQgb25seSBmcm9tIHBocmFzZSBhbmQgcGhyYXNlc2V0c1xyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICBpZiAocGFyZW50VHlwZSAhPT0gJ3BocmFzZXNldCcgJiYgcGFyZW50VHlwZSAhPT0gJ3BocmFzZScpXHJcbiAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG5cclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5vZGUgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgICAgICAvLyBSZWplY3QgY29sbGFwc2VkIGVsZW1lbnRzIGFuZCB0aGVpciBjaGlsZHJlblxyXG4gICAgICAgICAgICBpZiAoIGVsZW1lbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCB0eXBlbGVzcyAod3JhcHBlcikgZWxlbWVudHNcclxuICAgICAgICAgICAgaWYgKCF0eXBlKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIG92ZXIgcGhyYXNlIGFuZCBwaHJhc2VzZXRzIChpbnN0ZWFkLCBvbmx5IGdvaW5nIGZvciB0aGVpciBjaGlsZHJlbilcclxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnIHx8IHR5cGUgPT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGhyYXNlICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHJpdmF0ZSBmbGF0dGVuZWQgOiBOb2RlW107XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlZCAgOiBWb3hLZXlbXTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGhyYXNlOiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnBocmFzZSAgICA9IHBocmFzZTtcclxuICAgICAgICB0aGlzLmZsYXR0ZW5lZCA9IFtdO1xyXG4gICAgICAgIHRoaXMucmVzb2x2ZWQgID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHRvVm94KCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIC8vIEZpcnN0LCB3YWxrIHRocm91Z2ggdGhlIHBocmFzZSBhbmQgXCJmbGF0dGVuXCIgaXQgaW50byBhbiBhcnJheSBvZiBwYXJ0cy4gVGhpcyBpc1xyXG4gICAgICAgIC8vIHNvIHRoZSByZXNvbHZlciBjYW4gbG9vay1haGVhZCBvciBsb29rLWJlaGluZC5cclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQgPSBbXTtcclxuICAgICAgICB0aGlzLnJlc29sdmVkICA9IFtdO1xyXG4gICAgICAgIGxldCB0cmVlV2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgdGhpcy5waHJhc2UsXHJcbiAgICAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19URVhUIHwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogUmVzb2x2ZXIubm9kZUZpbHRlciB9LFxyXG4gICAgICAgICAgICBmYWxzZVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHdoaWxlICggdHJlZVdhbGtlci5uZXh0Tm9kZSgpIClcclxuICAgICAgICBpZiAodHJlZVdhbGtlci5jdXJyZW50Tm9kZS50ZXh0Q29udGVudCEudHJpbSgpICE9PSAnJylcclxuICAgICAgICAgICAgdGhpcy5mbGF0dGVuZWQucHVzaCh0cmVlV2Fsa2VyLmN1cnJlbnROb2RlKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgcmVzb2x2ZSBhbGwgdGhlIHBocmFzZXMnIG5vZGVzIGludG8gdm94IGtleXNcclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQuZm9yRWFjaCggKHYsIGkpID0+IHRoaXMucmVzb2x2ZWQucHVzaCggLi4udGhpcy5yZXNvbHZlKHYsIGkpICkgKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5mbGF0dGVuZWQsIHRoaXMucmVzb2x2ZWQpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXNlcyB0aGUgdHlwZSBhbmQgdmFsdWUgb2YgdGhlIGdpdmVuIG5vZGUsIHRvIHJlc29sdmUgaXQgdG8gdm94IGZpbGUgSURzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBub2RlIE5vZGUgdG8gcmVzb2x2ZSB0byB2b3ggSURzXHJcbiAgICAgKiBAcGFyYW0gaWR4IEluZGV4IG9mIHRoZSBub2RlIGJlaW5nIHJlc29sdmVkIHJlbGF0aXZlIHRvIHRoZSBwaHJhc2UgYXJyYXlcclxuICAgICAqIEByZXR1cm5zIEFycmF5IG9mIElEcyB0aGF0IG1ha2UgdXAgb25lIG9yIG1vcmUgZmlsZSBJRHMuIENhbiBiZSBlbXB0eS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlKG5vZGU6IE5vZGUsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlVGV4dChub2RlKTtcclxuXHJcbiAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUNvYWNoKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ2V4Y3VzZSc6ICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUV4Y3VzZShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVJbnRlZ2VyKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICduYW1lZCc6ICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVOYW1lZCgpO1xyXG4gICAgICAgICAgICBjYXNlICdwbGF0Zm9ybSc6ICAgIHJldHVybiB0aGlzLnJlc29sdmVQbGF0Zm9ybShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTZXJ2aWNlKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTdGF0aW9uKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogcmV0dXJuIHRoaXMucmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3RpbWUnOiAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRpbWUoZWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3ZveCc6ICAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVZveChlbGVtZW50KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEluZmxlY3Rpb24oaWR4OiBudW1iZXIpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5leHQgPSB0aGlzLmZsYXR0ZW5lZFtpZHggKyAxXTtcclxuXHJcbiAgICAgICAgcmV0dXJuICggbmV4dCAmJiBuZXh0LnRleHRDb250ZW50IS50cmltKCkuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgPyAnZW5kJ1xyXG4gICAgICAgICAgICA6ICdtaWQnO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVRleHQobm9kZTogTm9kZSkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBub2RlLnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCB0eXBlICAgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIGxldCB0ZXh0ICAgPSBTdHJpbmdzLmNsZWFuKG5vZGUudGV4dENvbnRlbnQhKTtcclxuICAgICAgICBsZXQgc2V0ICAgID0gW107XHJcblxyXG4gICAgICAgIC8vIElmIHRleHQgaXMganVzdCBhIGZ1bGwgc3RvcCwgcmV0dXJuIHNpbGVuY2VcclxuICAgICAgICBpZiAodGV4dCA9PT0gJy4nKVxyXG4gICAgICAgICAgICByZXR1cm4gWzAuNV07XHJcblxyXG4gICAgICAgIC8vIElmIGl0IGJlZ2lucyB3aXRoIGEgZnVsbCBzdG9wLCBhZGQgc2lsZW5jZVxyXG4gICAgICAgIGlmICggdGV4dC5zdGFydHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICBzZXQucHVzaCgwLjUpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgdGV4dCBkb2Vzbid0IGNvbnRhaW4gYW55IHdvcmRzLCBza2lwXHJcbiAgICAgICAgaWYgKCAhdGV4dC5tYXRjaCgvW2EtejAtOV0vaSkgKVxyXG4gICAgICAgICAgICByZXR1cm4gc2V0O1xyXG5cclxuICAgICAgICAvLyBJZiB0eXBlIGlzIG1pc3NpbmcsIHBhcmVudCBpcyBhIHdyYXBwZXJcclxuICAgICAgICBpZiAoIXR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHR5cGUgICA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgcmVmID0gcGFyZW50LmRhdGFzZXRbJ3JlZiddO1xyXG4gICAgICAgIGxldCBpZHggPSBET00ubm9kZUluZGV4T2Yobm9kZSk7XHJcbiAgICAgICAgbGV0IGlkICA9IGBwaHJhc2UuJHtyZWZ9YDtcclxuXHJcbiAgICAgICAgLy8gQXBwZW5kIGluZGV4IG9mIHBocmFzZXNldCdzIGNob2ljZSBvZiBwaHJhc2VcclxuICAgICAgICBpZiAodHlwZSA9PT0gJ3BocmFzZXNldCcpXHJcbiAgICAgICAgICAgIGlkICs9IGAuJHtwYXJlbnQuZGF0YXNldFsnaWR4J119YDtcclxuXHJcbiAgICAgICAgaWQgKz0gYC4ke2lkeH1gO1xyXG4gICAgICAgIHNldC5wdXNoKGlkKTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGV4dCBlbmRzIHdpdGggYSBmdWxsIHN0b3AsIGFkZCBzaWxlbmNlXHJcbiAgICAgICAgaWYgKCB0ZXh0LmVuZHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICBzZXQucHVzaCgwLjUpO1xyXG5cclxuICAgICAgICByZXR1cm4gc2V0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUNvYWNoKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBjb2FjaCAgID0gUkFHLnN0YXRlLmdldENvYWNoKGN0eCk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFswLjEsIGBsZXR0ZXIuJHtjb2FjaH0uJHtpbmZsZWN0fWAsIDAuMV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlRXhjdXNlKGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGV4Y3VzZSAgPSBSQUcuc3RhdGUuZXhjdXNlO1xyXG4gICAgICAgIGxldCBrZXkgICAgID0gU3RyaW5ncy5maWxlbmFtZShleGN1c2UpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbMC4yLCBgZXhjdXNlLiR7a2V5fS4ke2luZmxlY3R9YF07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlSW50ZWdlcihlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc2luZ3VsYXIgPSBlbGVtZW50LmRhdGFzZXRbJ3Npbmd1bGFyJ107XHJcbiAgICAgICAgbGV0IHBsdXJhbCAgID0gZWxlbWVudC5kYXRhc2V0WydwbHVyYWwnXTtcclxuICAgICAgICBsZXQgaW50ZWdlciAgPSBSQUcuc3RhdGUuZ2V0SW50ZWdlcihjdHgpO1xyXG4gICAgICAgIGxldCBwYXJ0cyAgICA9IFswLjEsIGBudW1iZXIuJHtpbnRlZ2VyfS5taWRgXTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoc2luZ3VsYXIgJiYgaW50ZWdlciA9PT0gMSlcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjEsIGBudW1iZXIuc3VmZml4LiR7c2luZ3VsYXJ9LmVuZGApO1xyXG4gICAgICAgIGVsc2UgaWYgKHBsdXJhbCAgICYmIGludGVnZXIgIT09IDEpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4xLCBgbnVtYmVyLnN1ZmZpeC4ke3BsdXJhbH0uZW5kYCk7XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJ0cztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVOYW1lZCgpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgbmFtZWQgPSBTdHJpbmdzLmZpbGVuYW1lKFJBRy5zdGF0ZS5uYW1lZCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbMC4xLCBgbmFtZWQuJHtuYW1lZH0ubWlkYCwgMC4xXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVQbGF0Zm9ybShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA9IFJBRy5zdGF0ZS5wbGF0Zm9ybTtcclxuICAgICAgICBsZXQgaW5mbGVjdCAgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgcmVzdWx0ICAgPSBbMC4xLCBgbnVtYmVyLiR7cGxhdGZvcm1bMF19JHtwbGF0Zm9ybVsxXX0uJHtpbmZsZWN0fWBdO1xyXG5cclxuICAgICAgICBpZiAoaW5mbGVjdCA9PT0gJ21pZCcpXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuMik7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlU2VydmljZShlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzZXJ2aWNlID0gU3RyaW5ncy5maWxlbmFtZSggUkFHLnN0YXRlLmdldFNlcnZpY2UoY3R4KSApO1xyXG5cclxuICAgICAgICByZXR1cm4gWzAuMSwgYHNlcnZpY2UuJHtzZXJ2aWNlfS5taWRgLCAwLjFdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb24oZWxlbWVudDogSFRNTEVsZW1lbnQsIGlkeDogbnVtYmVyKVxyXG4gICAgICAgIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uKGN0eCk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgcmVzdWx0ICA9IFswLjE1LCBgc3RhdGlvbi4ke3N0YXRpb259LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBsaXN0ICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KGN0eCk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuXHJcbiAgICAgICAgbGV0IHBhcnRzIDogVm94S2V5W10gPSBbMC4yXTtcclxuXHJcbiAgICAgICAgbGlzdC5mb3JFYWNoKCAodiwgaykgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEhhbmRsZSBtaWRkbGUgb2YgbGlzdCBpbmZsZWN0aW9uXHJcbiAgICAgICAgICAgIGlmIChrICE9PSBsaXN0Lmxlbmd0aCAtIDEpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2fS5taWRgLCAwLjI1KTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFwiYW5kXCIgaWYgbGlzdCBoYXMgbW9yZSB0aGFuIDEgc3RhdGlvbiBhbmQgdGhpcyBpcyB0aGUgZW5kXHJcbiAgICAgICAgICAgIGlmIChsaXN0Lmxlbmd0aCA+IDEpXHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKCdzdGF0aW9uLnBhcnRzLmFuZC5taWQnLCAwLjIpO1xyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFwib25seVwiIGlmIG9ubHkgb25lIHN0YXRpb24gaW4gdGhlIGNhbGxpbmcgbGlzdFxyXG4gICAgICAgICAgICBpZiAobGlzdC5sZW5ndGggPT09IDEgJiYgY3R4ID09PSAnY2FsbGluZycpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2fS5taWRgKTtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goMC4yLCAnc3RhdGlvbi5wYXJ0cy5vbmx5LmVuZCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2fS4ke2luZmxlY3R9YCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBbLi4ucGFydHMsIDAuMl07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlVGltZShlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgdGltZSAgPSBSQUcuc3RhdGUuZ2V0VGltZShjdHgpLnNwbGl0KCc6Jyk7XHJcblxyXG4gICAgICAgIGxldCBwYXJ0cyA6IFZveEtleVtdID0gWzAuMV07XHJcblxyXG4gICAgICAgIGlmICh0aW1lWzBdID09PSAnMDAnICYmIHRpbWVbMV0gPT09ICcwMCcpXHJcbiAgICAgICAgICAgIHJldHVybiBbLi4ucGFydHMsICdudW1iZXIuMDAwMC5taWQnXTtcclxuXHJcbiAgICAgICAgLy8gSG91cnNcclxuICAgICAgICBwYXJ0cy5wdXNoKGBudW1iZXIuJHt0aW1lWzBdfS5taWRgKTtcclxuXHJcbiAgICAgICAgaWYgKHRpbWVbMV0gPT09ICcwMCcpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goJ251bWJlci5odW5kcmVkLm1pZCcpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjEsIGBudW1iZXIuJHt0aW1lWzFdfS5taWRgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgMC4xNV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlVm94KGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFtlbGVtZW50LmRhdGFzZXRbJ2tleSddIV07XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVbmlvbiB0eXBlIGZvciBib3RoIGtpbmRzIG9mIHZvaWNlcyBhdmFpbGFibGUgKi9cclxudHlwZSBWb2ljZSA9IFNwZWVjaFN5bnRoZXNpc1ZvaWNlIHwgQ3VzdG9tVm9pY2U7XHJcblxyXG4vKiogTWFuYWdlcyBzcGVlY2ggc3ludGhlc2lzIHVzaW5nIGJvdGggbmF0aXZlIGFuZCBjdXN0b20gZW5naW5lcyAqL1xyXG5jbGFzcyBTcGVlY2hcclxue1xyXG4gICAgLyoqIEluc3RhbmNlIG9mIHRoZSBjdXN0b20gdm9pY2UgZW5naW5lICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgdm94RW5naW5lIDogVm94RW5naW5lO1xyXG5cclxuICAgIC8qKiBBcnJheSBvZiBicm93c2VyLXByb3ZpZGVkIHZvaWNlcyBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgYnJvd3NlclZvaWNlcyA6IFNwZWVjaFN5bnRoZXNpc1ZvaWNlW10gPSBbXTtcclxuICAgIC8qKiBBcnJheSBvZiBjdXN0b20gcHJlLXJlY29yZGVkIHZvaWNlcyBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgY3VzdG9tVm9pY2VzICA6IEN1c3RvbVZvaWNlW10gICAgICAgICAgPSBbXTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFNvbWUgYnJvd3NlcnMgZG9uJ3QgcHJvcGVybHkgY2FuY2VsIHNwZWVjaCBvbiBwYWdlIGNsb3NlLlxyXG4gICAgICAgIC8vIEJVRzogb25wYWdlc2hvdyBhbmQgb25wYWdlaGlkZSBub3Qgd29ya2luZyBvbiBpT1MgMTFcclxuICAgICAgICB3aW5kb3cub25iZWZvcmV1bmxvYWQgPVxyXG4gICAgICAgIHdpbmRvdy5vbnVubG9hZCAgICAgICA9XHJcbiAgICAgICAgd2luZG93Lm9ucGFnZXNob3cgICAgID1cclxuICAgICAgICB3aW5kb3cub25wYWdlaGlkZSAgICAgPSB0aGlzLmNhbmNlbC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5vbnZpc2liaWxpdHljaGFuZ2UgICAgICAgICAgICA9IHRoaXMub25WaXNpYmlsaXR5Q2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5vbnZvaWNlc2NoYW5nZWQgPSB0aGlzLm9uVm9pY2VzQ2hhbmdlZC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBFdmVuIHRob3VnaCAnb252b2ljZXNjaGFuZ2VkJyBpcyB1c2VkIGxhdGVyIHRvIHBvcHVsYXRlIHRoZSBsaXN0LCBDaHJvbWUgZG9lc1xyXG4gICAgICAgIC8vIG5vdCBhY3R1YWxseSBmaXJlIHRoZSBldmVudCB1bnRpbCB0aGlzIGNhbGwuLi5cclxuICAgICAgICB0aGlzLm9uVm9pY2VzQ2hhbmdlZCgpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBNYWtlIHRoaXMgYSBkeW5hbWljIHJlZ2lzdHJhdGlvbiBhbmQgY2hlY2sgZm9yIGZlYXR1cmVzXHJcbiAgICAgICAgdGhpcy52b3hFbmdpbmUgPSBuZXcgVm94RW5naW5lKCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VzdG9tVm9pY2VzLnB1c2goIG5ldyBDdXN0b21Wb2ljZSgnVGVzdCcsICdlbi1HQicpICk7XHJcbiAgICAgICAgdGhpcy5jdXN0b21Wb2ljZXMucHVzaCggbmV3IEN1c3RvbVZvaWNlKCdSb3knLCAgJ2VuLUdCJykgKTtcclxuICAgICAgICB0aGlzLmN1c3RvbVZvaWNlcy5wdXNoKCBuZXcgQ3VzdG9tVm9pY2UoJ1JveVJhdycsICAnZW4tR0InKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIGFsbCB0aGUgdm9pY2VzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBnZXRWb2ljZXMoKSA6IFZvaWNlW11cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5jdXN0b21Wb2ljZXMuY29uY2F0KHRoaXMuYnJvd3NlclZvaWNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBzcGVha2luZyB0aGUgZ2l2ZW4gcGhyYXNlIGNvbXBvbmVudHMgKi9cclxuICAgIHB1YmxpYyBzcGVhayhwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MgPSB7fSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gUmVzZXQgdG8gZmlyc3Qgdm9pY2UsIGlmIGNvbmZpZ3VyZWQgY2hvaWNlIGlzIG1pc3NpbmdcclxuICAgICAgICBsZXQgdm9pY2VzICAgPSB0aGlzLmdldFZvaWNlcygpO1xyXG4gICAgICAgIGxldCB2b2ljZUlkeCA9IGVpdGhlcihzZXR0aW5ncy52b2ljZUlkeCwgUkFHLmNvbmZpZy5zcGVlY2hWb2ljZSk7XHJcbiAgICAgICAgbGV0IHZvaWNlICAgID0gdm9pY2VzW3ZvaWNlSWR4XSB8fCB2b2ljZXNbMF07XHJcbiAgICAgICAgbGV0IGVuZ2luZSAgID0gKHZvaWNlIGluc3RhbmNlb2YgQ3VzdG9tVm9pY2UpXHJcbiAgICAgICAgICAgID8gdGhpcy5zcGVha0N1c3RvbS5iaW5kKHRoaXMpXHJcbiAgICAgICAgICAgIDogdGhpcy5zcGVha0Jyb3dzZXIuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgZW5naW5lKHBocmFzZSwgdm9pY2UsIHNldHRpbmdzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3RvcHMgYW5kIGNhbmNlbHMgYWxsIHF1ZXVlZCBzcGVlY2ggKi9cclxuICAgIHB1YmxpYyBjYW5jZWwoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmNhbmNlbCgpO1xyXG4gICAgICAgIHRoaXMudm94RW5naW5lLnN0b3AoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGF1c2UgYW5kIHVucGF1c2Ugc3BlZWNoIGlmIHRoZSBwYWdlIGlzIGhpZGRlbiBvciB1bmhpZGRlbiAqL1xyXG4gICAgcHJpdmF0ZSBvblZpc2liaWxpdHlDaGFuZ2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaGlkaW5nID0gKGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gJ2hpZGRlbicpO1xyXG5cclxuICAgICAgICBpZiAoaGlkaW5nKSB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnBhdXNlKCk7XHJcbiAgICAgICAgZWxzZSAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5yZXN1bWUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBhc3luYyB2b2ljZSBsaXN0IGxvYWRpbmcgb24gc29tZSBicm93c2VycywgYW5kIHNldHMgZGVmYXVsdCAqL1xyXG4gICAgcHJpdmF0ZSBvblZvaWNlc0NoYW5nZWQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmJyb3dzZXJWb2ljZXMgPSB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmdldFZvaWNlcygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIGdpdmVuIHBocmFzZSB0byB0ZXh0IGFuZCBzcGVha3MgaXQgdmlhIG5hdGl2ZSBicm93c2VyIHZvaWNlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGhyYXNlIFBocmFzZSBlbGVtZW50cyB0byBzcGVha1xyXG4gICAgICogQHBhcmFtIHZvaWNlIEJyb3dzZXIgdm9pY2UgdG8gdXNlXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgU2V0dGluZ3MgdG8gdXNlIGZvciB0aGUgdm9pY2VcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzcGVha0Jyb3dzZXIocGhyYXNlOiBIVE1MRWxlbWVudCwgdm9pY2U6IFZvaWNlLCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpXHJcbiAgICAgICAgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVGhlIHBocmFzZSB0ZXh0IGlzIHNwbGl0IGludG8gc2VudGVuY2VzLCBhcyBxdWV1ZWluZyBsYXJnZSBzZW50ZW5jZXMgdGhhdCBsYXN0XHJcbiAgICAgICAgLy8gbWFueSBzZWNvbmRzIGNhbiBicmVhayBzb21lIFRUUyBlbmdpbmVzIGFuZCBicm93c2Vycy5cclxuICAgICAgICBsZXQgdGV4dCAgPSBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHBocmFzZSk7XHJcbiAgICAgICAgbGV0IHBhcnRzID0gdGV4dC5zcGxpdCgvXFwuXFxzL2kpO1xyXG5cclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIHBhcnRzLmZvckVhY2goIChzZWdtZW50LCBpZHgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBBZGQgbWlzc2luZyBmdWxsIHN0b3AgdG8gZWFjaCBzZW50ZW5jZSBleGNlcHQgdGhlIGxhc3QsIHdoaWNoIGhhcyBpdFxyXG4gICAgICAgICAgICBpZiAoaWR4IDwgcGFydHMubGVuZ3RoIC0gMSlcclxuICAgICAgICAgICAgICAgIHNlZ21lbnQgKz0gJy4nO1xyXG5cclxuICAgICAgICAgICAgbGV0IHV0dGVyYW5jZSA9IG5ldyBTcGVlY2hTeW50aGVzaXNVdHRlcmFuY2Uoc2VnbWVudCk7XHJcblxyXG4gICAgICAgICAgICB1dHRlcmFuY2Uudm9pY2UgID0gdm9pY2U7XHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS52b2x1bWUgPSBlaXRoZXIoc2V0dGluZ3Mudm9sdW1lLCBSQUcuY29uZmlnLnNwZWVjaFZvbCk7XHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS5waXRjaCAgPSBlaXRoZXIoc2V0dGluZ3MucGl0Y2gsICBSQUcuY29uZmlnLnNwZWVjaFBpdGNoKTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnJhdGUgICA9IGVpdGhlcihzZXR0aW5ncy5yYXRlLCAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSk7XHJcblxyXG4gICAgICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFrKHV0dGVyYW5jZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTeW50aGVzaXplcyB2b2ljZSBieSB3YWxraW5nIHRocm91Z2ggdGhlIGdpdmVuIHBocmFzZSBlbGVtZW50cywgcmVzb2x2aW5nIHBhcnRzIHRvXHJcbiAgICAgKiBzb3VuZCBmaWxlIElEcywgYW5kIGZlZWRpbmcgdGhlIGVudGlyZSBhcnJheSB0byB0aGUgdm94IGVuZ2luZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGhyYXNlIFBocmFzZSBlbGVtZW50cyB0byBzcGVha1xyXG4gICAgICogQHBhcmFtIHZvaWNlIEN1c3RvbSB2b2ljZSB0byB1c2VcclxuICAgICAqIEBwYXJhbSBzZXR0aW5ncyBTZXR0aW5ncyB0byB1c2UgZm9yIHRoZSB2b2ljZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNwZWFrQ3VzdG9tKHBocmFzZTogSFRNTEVsZW1lbnQsIHZvaWNlOiBWb2ljZSwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzKVxyXG4gICAgICAgIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IHVzZSB2b2x1bWUgc2V0dGluZ3NcclxuICAgICAgICBsZXQgcmVzb2x2ZXIgPSBuZXcgUmVzb2x2ZXIocGhyYXNlKTtcclxuXHJcbiAgICAgICAgdGhpcy52b3hFbmdpbmUuc3BlYWsocmVzb2x2ZXIudG9Wb3goKSwgdm9pY2UsIHNldHRpbmdzKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFR5cGUgZGVmaW5pdGlvbiBmb3Igc3BlZWNoIGNvbmZpZyBvdmVycmlkZXMgcGFzc2VkIHRvIHRoZSBzcGVhayBtZXRob2QgKi9cclxuaW50ZXJmYWNlIFNwZWVjaFNldHRpbmdzXHJcbntcclxuICAgIC8qKiBPdmVycmlkZSBjaG9pY2Ugb2Ygdm9pY2UgKi9cclxuICAgIHZvaWNlSWR4PzogbnVtYmVyO1xyXG4gICAgLyoqIE92ZXJyaWRlIHZvbHVtZSBvZiB2b2ljZSAqL1xyXG4gICAgdm9sdW1lPzogbnVtYmVyO1xyXG4gICAgLyoqIE92ZXJyaWRlIHBpdGNoIG9mIHZvaWNlICovXHJcbiAgICBwaXRjaD86IG51bWJlcjtcclxuICAgIC8qKiBPdmVycmlkZSByYXRlIG9mIHZvaWNlICovXHJcbiAgICByYXRlPzogbnVtYmVyO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG50eXBlIFZveEtleSA9IHN0cmluZyB8IG51bWJlcjtcclxuXHJcbi8qKiBTeW50aGVzaXplcyBzcGVlY2ggYnkgZHluYW1pY2FsbHkgbG9hZGluZyBhbmQgcGllY2luZyB0b2dldGhlciB2b2ljZSBmaWxlcyAqL1xyXG5jbGFzcyBWb3hFbmdpbmVcclxue1xyXG4gICAgLyoqIFRoZSBjb3JlIGF1ZGlvIGNvbnRleHQgdGhhdCBoYW5kbGVzIGF1ZGlvIGVmZmVjdHMgYW5kIHBsYXliYWNrICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgYXVkaW9Db250ZXh0IDogQXVkaW9Db250ZXh0O1xyXG4gICAgLyoqIEF1ZGlvIG5vZGUgdGhhdCBmaWx0ZXJzIHZvaWNlIHdpdGggdmFyaW91cyBlZmZlY3RzICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgYXVkaW9GaWx0ZXIgIDogQmlxdWFkRmlsdGVyTm9kZTtcclxuXHJcbiAgICAvKiogV2hldGhlciB0aGlzIGVuZ2luZSBpcyBjdXJyZW50bHkgcnVubmluZyBhbmQgc3BlYWtpbmcgKi9cclxuICAgIHB1YmxpYyAgaXNTcGVha2luZyAgICAgICA6IGJvb2xlYW4gICAgICA9IGZhbHNlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSBudW1iZXIgZm9yIHRoZSBjdXJyZW50IHB1bXAgdGltZXIgKi9cclxuICAgIHByaXZhdGUgcHVtcFRpbWVyICAgICAgICA6IG51bWJlciAgICAgICA9IDA7XHJcbiAgICAvKiogVHJhY2tzIHRoZSBhdWRpbyBjb250ZXh0J3Mgd2FsbC1jbG9jayB0aW1lIHRvIHNjaGVkdWxlIG5leHQgY2xpcCAqL1xyXG4gICAgcHJpdmF0ZSBuZXh0QmVnaW4gICAgICAgIDogbnVtYmVyICAgICAgID0gMDtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGN1cnJlbnRseSBwZW5kaW5nIHJlcXVlc3RzLCBhcyBhIEZJRk8gcXVldWUgKi9cclxuICAgIHByaXZhdGUgcGVuZGluZ1JlcXMgICAgICA6IFZveFJlcXVlc3RbXSA9IFtdO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gY3VycmVudGx5IHNjaGVkdWxlZCBhdWRpbyBidWZmZXJzICovXHJcbiAgICBwcml2YXRlIHNjaGVkdWxlZEJ1ZmZlcnMgOiBBdWRpb0J1ZmZlclNvdXJjZU5vZGVbXSA9IFtdO1xyXG4gICAgLyoqIExpc3Qgb2Ygdm94IElEcyBjdXJyZW50bHkgYmVpbmcgcnVuIHRocm91Z2ggKi9cclxuICAgIHByaXZhdGUgY3VycmVudElkcz8gICAgICA6IFZveEtleVtdO1xyXG4gICAgLyoqIFZvaWNlIGN1cnJlbnRseSBiZWluZyB1c2VkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRWb2ljZT8gICAgOiBDdXN0b21Wb2ljZTtcclxuICAgIC8qKiBTcGVlY2ggc2V0dGluZ3MgY3VycmVudGx5IGJlaW5nIHVzZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFNldHRpbmdzPyA6IFNwZWVjaFNldHRpbmdzO1xyXG4gICAgLyoqIEF1ZGlvIG5vZGUgdGhhdCBhZGRzIGEgcmV2ZXJiIHRvIHRoZSB2b2ljZSwgaWYgYXZhaWxhYmxlICovXHJcbiAgICBwcml2YXRlIGF1ZGlvUmV2ZXJiPyAgICAgOiBDb252b2x2ZXJOb2RlO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihyZXZlcmI6IHN0cmluZyA9ICdkYXRhL3ZveCcpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2V0dXAgdGhlIGNvcmUgYXVkaW8gY29udGV4dFxyXG5cclxuICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgbGV0IEF1ZGlvQ29udGV4dCAgPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XHJcbiAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQgPSBuZXcgQXVkaW9Db250ZXh0KCk7XHJcblxyXG4gICAgICAgIC8vIFNldHVwIHRhbm5veSBmaWx0ZXJcclxuXHJcbiAgICAgICAgdGhpcy5hdWRpb0ZpbHRlciAgICAgICAgID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XHJcbiAgICAgICAgdGhpcy5hdWRpb0ZpbHRlci50eXBlICAgID0gJ2hpZ2hwYXNzJztcclxuICAgICAgICB0aGlzLmF1ZGlvRmlsdGVyLlEudmFsdWUgPSAwLjQ7XHJcblxyXG4gICAgICAgIHRoaXMuYXVkaW9GaWx0ZXIuY29ubmVjdCh0aGlzLmF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XHJcblxyXG4gICAgICAgIC8vIFNldHVwIHJldmVyYlxyXG5cclxuICAgICAgICAvLyBUT0RPOiBNYWtlIHRoaXMgdXNlciBjb25maWd1cmFibGUgYW5kIGNob29zYWJsZVxyXG4gICAgICAgIGZldGNoKGAke3JldmVyYn0vaXIuc3RhbGJhbnNfYV9tb25vLndhdmApXHJcbiAgICAgICAgICAgIC50aGVuKCByZXMgPT4gcmVzLmFycmF5QnVmZmVyKCkgKVxyXG4gICAgICAgICAgICAudGhlbiggYnVmID0+IFNvdW5kcy5kZWNvZGUodGhpcy5hdWRpb0NvbnRleHQsIGJ1ZikgKVxyXG4gICAgICAgICAgICAudGhlbiggcmV2ID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9SZXZlcmIgICAgICAgICAgID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQ29udm9sdmVyKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvUmV2ZXJiLmJ1ZmZlciAgICA9IHJldjtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9SZXZlcmIubm9ybWFsaXplID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvRmlsdGVyLmNvbm5lY3QodGhpcy5hdWRpb1JldmVyYik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvUmV2ZXJiLmNvbm5lY3QodGhpcy5hdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFJFVkVSQiBMT0FERUQnKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCZWdpbnMgbG9hZGluZyBhbmQgc3BlYWtpbmcgYSBzZXQgb2Ygdm94IGZpbGVzLiBTdG9wcyBhbnkgc3BlZWNoLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZHMgTGlzdCBvZiB2b3ggaWRzIHRvIGxvYWQgYXMgZmlsZXMsIGluIHNwZWFraW5nIG9yZGVyXHJcbiAgICAgKiBAcGFyYW0gdm9pY2UgQ3VzdG9tIHZvaWNlIHRvIHVzZVxyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFZvaWNlIHNldHRpbmdzIHRvIHVzZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3BlYWsoaWRzOiBWb3hLZXlbXSwgdm9pY2U6IFZvaWNlLCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBTUEVBSzonLCBpZHMsIHZvaWNlLCBzZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlzU3BlYWtpbmcpXHJcbiAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgICAgICA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50SWRzICAgICAgPSBpZHM7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50Vm9pY2UgICAgPSB2b2ljZTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzO1xyXG5cclxuICAgICAgICAvLyBCZWdpbiB0aGUgcHVtcCBsb29wLiBPbiBpT1MsIHRoZSBjb250ZXh0IG1heSBoYXZlIHRvIGJlIHJlc3VtZWQgZmlyc3RcclxuICAgICAgICBpZiAodGhpcy5hdWRpb0NvbnRleHQuc3RhdGUgPT09ICdzdXNwZW5kZWQnKVxyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dC5yZXN1bWUoKS50aGVuKCAoKSA9PiB0aGlzLnB1bXAoKSApO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5wdW1wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHBsYXlpbmcgYW55IGN1cnJlbnRseSBzcG9rZW4gc3BlZWNoIGFuZCByZXNldHMgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RvcCBwdW1waW5nXHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMucHVtcFRpbWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5pc1NwZWFraW5nID0gZmFsc2U7XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbGwgcGVuZGluZyByZXF1ZXN0c1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXMuZm9yRWFjaCggciA9PiByLmNhbmNlbCgpICk7XHJcblxyXG4gICAgICAgIC8vIEtpbGwgYW5kIGRlcmVmZXJlbmNlIGFueSBjdXJyZW50bHkgcGxheWluZyBmaWxlXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzLmZvckVhY2gobm9kZSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbm9kZS5zdG9wKCk7XHJcbiAgICAgICAgICAgIG5vZGUuZGlzY29ubmVjdCgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm5leHRCZWdpbiAgICAgICAgPSAwO1xyXG4gICAgICAgIHRoaXMuY3VycmVudElkcyAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRWb2ljZSAgICAgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXMgICAgICA9IFtdO1xyXG4gICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycyA9IFtdO1xyXG5cclxuICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggU1RPUFBFRCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHVtcHMgdGhlIHNwZWVjaCBxdWV1ZSwgYnkga2VlcGluZyB1cCB0byAxMCBmZXRjaCByZXF1ZXN0cyBmb3Igdm9pY2UgZmlsZXMgZ29pbmcsXHJcbiAgICAgKiBhbmQgdGhlbiBmZWVkaW5nIHRoZWlyIGRhdGEgKGluIGVuZm9yY2VkIG9yZGVyKSB0byB0aGUgYXVkaW8gY2hhaW4sIG9uZSBhdCBhIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcHVtcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIElmIHRoZSBlbmdpbmUgaGFzIHN0b3BwZWQsIGRvIG5vdCBwcm9jZWVkLlxyXG4gICAgICAgIGlmICghdGhpcy5pc1NwZWFraW5nIHx8ICF0aGlzLmN1cnJlbnRJZHMgfHwgIXRoaXMuY3VycmVudFZvaWNlKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBzY2hlZHVsZSBmdWxmaWxsZWQgcmVxdWVzdHMgaW50byB0aGUgYXVkaW8gYnVmZmVyLCBpbiBGSUZPIG9yZGVyXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZSgpO1xyXG5cclxuICAgICAgICAvLyBUaGVuLCBmaWxsIGFueSBmcmVlIHBlbmRpbmcgc2xvdHMgd2l0aCBuZXcgcmVxdWVzdHNcclxuICAgICAgICBsZXQgbmV4dERlbGF5ID0gMDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRoaXMuY3VycmVudElkc1swXSAmJiB0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCA8IDEwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGtleSA9IHRoaXMuY3VycmVudElkcy5zaGlmdCgpITtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMga2V5IGlzIGEgbnVtYmVyLCBpdCdzIGFuIGFtb3VudCBvZiBzaWxlbmNlLCBzbyBhZGQgaXQgYXMgdGhlXHJcbiAgICAgICAgICAgIC8vIHBsYXliYWNrIGRlbGF5IGZvciB0aGUgbmV4dCBwbGF5YWJsZSByZXF1ZXN0IChpZiBhbnkpLlxyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGtleSA9PT0gJ251bWJlcicpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG5leHREZWxheSArPSBrZXk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbGV0IHBhdGggPSBgJHt0aGlzLmN1cnJlbnRWb2ljZS52b2ljZVVSSX0vJHtrZXl9Lm1wM2A7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdSZXFzLnB1c2goIG5ldyBWb3hSZXF1ZXN0KHBhdGgsIG5leHREZWxheSwgdGhpcy5hdWRpb0NvbnRleHQpICk7XHJcbiAgICAgICAgICAgIG5leHREZWxheSA9IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmcgd2hlbiB3ZSdyZSBvdXQgb2YgSURzIHRvIHF1ZXVlIGFuZCBub3RoaW5nIGlzIHBsYXlpbmdcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50SWRzLmxlbmd0aCAgICAgICA8PSAwKVxyXG4gICAgICAgIGlmICh0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCAgICAgIDw9IDApXHJcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGVkQnVmZmVycy5sZW5ndGggPD0gMClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLnB1bXBUaW1lciA9IHNldFRpbWVvdXQodGhpcy5wdW1wLmJpbmQodGhpcyksIDEwMCk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIHByaXZhdGUgc2NoZWR1bGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTdG9wIHNjaGVkdWxpbmcgaWYgdGhlcmUgYXJlIG5vIHBlbmRpbmcgcmVxdWVzdHNcclxuICAgICAgICBpZiAoIXRoaXMucGVuZGluZ1JlcXNbMF0gfHwgIXRoaXMucGVuZGluZ1JlcXNbMF0uaXNEb25lKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIERvbid0IHNjaGVkdWxlIGlmIG1vcmUgdGhhbiA1IG5vZGVzIGFyZSwgYXMgbm90IHRvIGJsb3cgYW55IGJ1ZmZlcnNcclxuICAgICAgICBpZiAodGhpcy5zY2hlZHVsZWRCdWZmZXJzLmxlbmd0aCA+IDUpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IHJlcSA9IHRoaXMucGVuZGluZ1JlcXMuc2hpZnQoKSE7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSBuZXh0IHJlcXVlc3QgZXJyb3JlZCBvdXQgKGJ1ZmZlciBtaXNzaW5nKSwgc2tpcCBpdFxyXG4gICAgICAgIC8vIFRPRE86IFJlcGxhY2Ugd2l0aCBzaWxlbmNlP1xyXG4gICAgICAgIGlmICghcmVxLmJ1ZmZlcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdWT1ggQ0xJUCBTS0lQUEVEOicsIHJlcS5wYXRoKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2NoZWR1bGUoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIElmIHRoaXMgaXMgdGhlIGZpcnN0IGNsaXAgYmVpbmcgcGxheWVkLCBzdGFydCBmcm9tIGN1cnJlbnQgd2FsbC1jbG9ja1xyXG4gICAgICAgIGlmICh0aGlzLm5leHRCZWdpbiA9PT0gMClcclxuICAgICAgICAgICAgdGhpcy5uZXh0QmVnaW4gPSB0aGlzLmF1ZGlvQ29udGV4dC5jdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBDTElQIFBMQVlJTkc6JywgcmVxLnBhdGgsIHJlcS5idWZmZXIuZHVyYXRpb24sIHRoaXMubmV4dEJlZ2luKTtcclxuXHJcbiAgICAgICAgbGV0IG5vZGUgICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcclxuICAgICAgICBsZXQgbGF0ZW5jeSA9IHRoaXMuYXVkaW9Db250ZXh0LmJhc2VMYXRlbmN5ICsgMC4xNTtcclxuICAgICAgICBsZXQgZGVsYXkgICA9IHJlcS5kZWxheTtcclxuICAgICAgICBub2RlLmJ1ZmZlciA9IHJlcS5idWZmZXI7XHJcblxyXG4gICAgICAgIG5vZGUucGxheWJhY2tSYXRlLnZhbHVlID0gMC45ODtcclxuICAgICAgICBub2RlLmNvbm5lY3QodGhpcy5hdWRpb0ZpbHRlcik7XHJcbiAgICAgICAgbm9kZS5zdGFydCh0aGlzLm5leHRCZWdpbiArIGRlbGF5KTtcclxuXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzLnB1c2gobm9kZSk7XHJcbiAgICAgICAgdGhpcy5uZXh0QmVnaW4gKz0gKG5vZGUuYnVmZmVyLmR1cmF0aW9uICsgZGVsYXkgLSBsYXRlbmN5KTtcclxuXHJcbiAgICAgICAgLy8gSGF2ZSB0aGlzIGJ1ZmZlciBub2RlIHJlbW92ZSBpdHNlbGYgZnJvbSB0aGUgc2NoZWR1bGUgd2hlbiBkb25lXHJcbiAgICAgICAgbm9kZS5vbmVuZGVkID0gXyA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBDTElQIEVOREVEOicsIHJlcS5wYXRoKTtcclxuICAgICAgICAgICAgbGV0IGlkeCA9IHRoaXMuc2NoZWR1bGVkQnVmZmVycy5pbmRleE9mKG5vZGUpO1xyXG5cclxuICAgICAgICAgICAgaWYgKGlkeCAhPT0gLTEpXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMuc3BsaWNlKGlkeCwgMSk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFJlcHJlc2VudHMgYSByZXF1ZXN0IGZvciBhIHZveCBmaWxlLCBpbW1lZGlhdGVseSBiZWd1biBvbiBjcmVhdGlvbiAqL1xyXG5jbGFzcyBWb3hSZXF1ZXN0XHJcbntcclxuICAgIC8qKiBSZWxhdGl2ZSByZW1vdGUgcGF0aCBvZiB0aGlzIHZvaWNlIGZpbGUgcmVxdWVzdCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBwYXRoICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIEFtb3VudCBvZiBzZWNvbmRzIHRvIGRlbGF5IHRoZSBwbGF5YmFjayBvZiB0aGlzIHJlcXVlc3QgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZGVsYXkgICA6IG51bWJlcjtcclxuICAgIC8qKiBBdWRpbyBjb250ZXh0IHRvIHVzZSBmb3IgZGVjb2RpbmcgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dCA6IEF1ZGlvQ29udGV4dDtcclxuXHJcbiAgICAvKiogV2hldGhlciB0aGlzIHJlcXVlc3QgaXMgZG9uZSBhbmQgcmVhZHkgZm9yIGhhbmRsaW5nIChldmVuIGlmIGZhaWxlZCkgKi9cclxuICAgIHB1YmxpYyBpc0RvbmUgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFJhdyBhdWRpbyBkYXRhIGZyb20gdGhlIGxvYWRlZCBmaWxlLCBpZiBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBidWZmZXI/IDogQXVkaW9CdWZmZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgZGVsYXk6IG51bWJlciwgY29udGV4dDogQXVkaW9Db250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBSRVFVRVNUOicsIHBhdGgpO1xyXG4gICAgICAgIHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XHJcbiAgICAgICAgdGhpcy5wYXRoICAgID0gcGF0aDtcclxuICAgICAgICB0aGlzLmRlbGF5ICAgPSBkZWxheTtcclxuXHJcbiAgICAgICAgZmV0Y2gocGF0aClcclxuICAgICAgICAgICAgLnRoZW4gKCB0aGlzLm9uRnVsZmlsbC5iaW5kKHRoaXMpIClcclxuICAgICAgICAgICAgLmNhdGNoKCB0aGlzLm9uRXJyb3IuYmluZCh0aGlzKSAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbmNlbHMgdGhpcyByZXF1ZXN0IGZyb20gcHJvY2VlZGluZyBhbnkgZnVydGhlciAqL1xyXG4gICAgcHVibGljIGNhbmNlbCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IENhbmNlbGxhdGlvbiBjb250cm9sbGVyc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBCZWdpbnMgZGVjb2RpbmcgdGhlIGxvYWRlZCBNUDMgdm9pY2UgZmlsZSB0byByYXcgYXVkaW8gZGF0YSAqL1xyXG4gICAgcHJpdmF0ZSBvbkZ1bGZpbGwocmVzOiBSZXNwb25zZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFyZXMub2spXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKGBWT1ggTk9UIEZPVU5EOiAke3Jlcy5zdGF0dXN9IEAgJHt0aGlzLnBhdGh9YCk7XHJcblxyXG4gICAgICAgIHJlcy5hcnJheUJ1ZmZlcigpLnRoZW4oIHRoaXMub25BcnJheUJ1ZmZlci5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFRha2VzIHRoZSBhcnJheSBidWZmZXIgZnJvbSB0aGUgZnVsZmlsbGVkIGZldGNoIGFuZCBkZWNvZGVzIGl0ICovXHJcbiAgICBwcml2YXRlIG9uQXJyYXlCdWZmZXIoYnVmZmVyOiBBcnJheUJ1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgU291bmRzLmRlY29kZSh0aGlzLmNvbnRleHQsIGJ1ZmZlcilcclxuICAgICAgICAgICAgLnRoZW4gKCB0aGlzLm9uRGVjb2RlLmJpbmQodGhpcykgKVxyXG4gICAgICAgICAgICAuY2F0Y2goIHRoaXMub25FcnJvci5iaW5kKHRoaXMpICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiB0aGUgZmV0Y2hlZCBidWZmZXIgaXMgZGVjb2RlZCBzdWNjZXNzZnVsbHkgKi9cclxuICAgIHByaXZhdGUgb25EZWNvZGUoYnVmZmVyOiBBdWRpb0J1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5idWZmZXIgPSBidWZmZXI7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgaWYgdGhlIGZldGNoIG9yIGRlY29kZSBzdGFnZXMgZmFpbCAqL1xyXG4gICAgcHJpdmF0ZSBvbkVycm9yKGVycjogYW55KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnUkVRVUVTVCBGQUlMOicsIGVycik7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBocmFzZSBlZGl0b3IgKi9cclxuY2xhc3MgRWRpdG9yXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSBjb250YWluZXIgZm9yIHRoZSBlZGl0b3IgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIGRpYWxvZywgaWYgYW55ICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRQaWNrZXI/IDogUGlja2VyO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlIGVsZW1lbnQgY3VycmVudGx5IGJlaW5nIGVkaXRlZCwgaWYgYW55ICovXHJcbiAgICAvLyBEbyBub3QgRFJZOyBuZWVkcyB0byBiZSBwYXNzZWQgdG8gdGhlIHBpY2tlciBmb3IgY2xlYW5lciBjb2RlXHJcbiAgICBwcml2YXRlIGRvbUVkaXRpbmc/ICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSA9IERPTS5yZXF1aXJlKCcjZWRpdG9yJyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkub25jbGljayA9IHRoaXMub25DbGljay5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHdpbmRvdy5vbnJlc2l6ZSAgICAgICA9IHRoaXMub25SZXNpemUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbS5vbnNjcm9sbCAgICAgPSB0aGlzLm9uU2Nyb2xsLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb20udGV4dENvbnRlbnQgID0gTC5FRElUT1JfSU5JVCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyB0aGUgZWRpdG9yIHdpdGggYSByb290IHBocmFzZXNldCByZWZlcmVuY2UsIGFuZCBleHBhbmRzIGl0IGludG8gSFRNTCAqL1xyXG4gICAgcHVibGljIGdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJzxwaHJhc2VzZXQgcmVmPVwicm9vdFwiIC8+JztcclxuXHJcbiAgICAgICAgUkFHLnBocmFzZXIucHJvY2Vzcyh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIC8vIEZvciBzY3JvbGwtcGFzdCBwYWRkaW5nIHVuZGVyIHRoZSBwaHJhc2VcclxuICAgICAgICBsZXQgcGFkZGluZyAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICBwYWRkaW5nLmNsYXNzTmFtZSA9ICdib3R0b21QYWRkaW5nJztcclxuXHJcbiAgICAgICAgdGhpcy5kb20uYXBwZW5kQ2hpbGQocGFkZGluZyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcHJvY2Vzc2VzIGFsbCBwaHJhc2VzZXQgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHJlZiwgaWYgdGhlaXIgaW5kZXggaGFzIGNoYW5nZWQgKi9cclxuICAgIHB1YmxpYyByZWZyZXNoUGhyYXNlc2V0KHJlZjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBOb3RlLCB0aGlzIGNvdWxkIHBvdGVudGlhbGx5IGJ1ZyBvdXQgaWYgYSBwaHJhc2VzZXQncyBkZXNjZW5kYW50IHJlZmVyZW5jZXNcclxuICAgICAgICAvLyB0aGUgc2FtZSBwaHJhc2VzZXQgKHJlY3Vyc2lvbikuIEJ1dCB0aGlzIGlzIG9rYXkgYmVjYXVzZSBwaHJhc2VzZXRzIHNob3VsZFxyXG4gICAgICAgIC8vIG5ldmVyIGluY2x1ZGUgdGhlbXNlbHZlcywgZXZlbiBldmVudHVhbGx5LlxyXG5cclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuW2RhdGEtdHlwZT1waHJhc2VzZXRdW2RhdGEtcmVmPSR7cmVmfV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChfID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50ICAgID0gXyBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncGhyYXNlc2V0Jyk7XHJcbiAgICAgICAgICAgICAgICBsZXQgY2hhbmNlICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY2hhbmNlJ107XHJcblxyXG4gICAgICAgICAgICAgICAgbmV3RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JlZicsIHJlZik7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGNoYW5jZSlcclxuICAgICAgICAgICAgICAgICAgICBuZXdFbGVtZW50LnNldEF0dHJpYnV0ZSgnY2hhbmNlJywgY2hhbmNlKTtcclxuXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MobmV3RWxlbWVudC5wYXJlbnRFbGVtZW50ISk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhIHN0YXRpYyBOb2RlTGlzdCBvZiBhbGwgcGhyYXNlIGVsZW1lbnRzIG9mIHRoZSBnaXZlbiBxdWVyeS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgUXVlcnkgc3RyaW5nIHRvIGFkZCBvbnRvIHRoZSBgc3BhbmAgc2VsZWN0b3JcclxuICAgICAqIEByZXR1cm5zIE5vZGUgbGlzdCBvZiBhbGwgZWxlbWVudHMgbWF0Y2hpbmcgdGhlIGdpdmVuIHNwYW4gcXVlcnlcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldEVsZW1lbnRzQnlRdWVyeShxdWVyeTogc3RyaW5nKSA6IE5vZGVMaXN0XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoYHNwYW4ke3F1ZXJ5fWApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHBocmFzZSdzIHJvb3QgRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2UoKSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmZpcnN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHBocmFzZSBpbiB0aGUgZWRpdG9yIGFzIHRleHQsIGV4Y2x1ZGluZyB0aGUgaGlkZGVuIHBhcnRzICovXHJcbiAgICBwdWJsaWMgZ2V0VGV4dCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIERPTS5nZXRDbGVhbmVkVmlzaWJsZVRleHQodGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgYWxsIHBocmFzZSBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gdHlwZSwgYW5kIHNldHMgdGhlaXIgdGV4dCB0byBnaXZlbiB2YWx1ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdHlwZSBPcmlnaW5hbCBYTUwgbmFtZSBvZiBlbGVtZW50cyB0byByZXBsYWNlIGNvbnRlbnRzIG9mXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgTmV3IHRleHQgZm9yIHRoZSBmb3VuZCBlbGVtZW50cyB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEVsZW1lbnRzVGV4dCh0eXBlOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPSR7dHlwZX1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgYW55IGN1cnJlbnRseSBvcGVuIGVkaXRvciBkaWFsb2dzICovXHJcbiAgICBwdWJsaWMgY2xvc2VEaWFsb2coKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIuY2xvc2UoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZG9tRWRpdGluZylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5yZW1vdmVBdHRyaWJ1dGUoJ2VkaXRpbmcnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2Fib3ZlJywgJ2JlbG93Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGEgY2xpY2sgYW55d2hlcmUgaW4gdGhlIHdpbmRvdyBkZXBlbmRpbmcgb24gdGhlIGNvbnRleHQgKi9cclxuICAgIHByaXZhdGUgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhcmdldCA9IGV2LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgdHlwZSAgID0gdGFyZ2V0ID8gdGFyZ2V0LmRhdGFzZXRbJ3R5cGUnXSAgICA6IHVuZGVmaW5lZDtcclxuICAgICAgICBsZXQgcGlja2VyID0gdHlwZSAgID8gUkFHLnZpZXdzLmdldFBpY2tlcih0eXBlKSA6IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKCF0YXJnZXQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNsb3NlRGlhbG9nKCk7XHJcblxyXG4gICAgICAgIC8vIFJlZGlyZWN0IGNsaWNrcyBvZiBpbm5lciBlbGVtZW50c1xyXG4gICAgICAgIGlmICggdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnaW5uZXInKSAmJiB0YXJnZXQucGFyZW50RWxlbWVudCApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0YXJnZXQgPSB0YXJnZXQucGFyZW50RWxlbWVudDtcclxuICAgICAgICAgICAgdHlwZSAgID0gdGFyZ2V0LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICAgICAgcGlja2VyID0gdHlwZSA/IFJBRy52aWV3cy5nZXRQaWNrZXIodHlwZSkgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIHRvIGFueSBpbm5lciBkb2N1bWVudCBvciB1bm93bmVkIGVsZW1lbnRcclxuICAgICAgICBpZiAoICFkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3MgdG8gYW55IGVsZW1lbnQgb2YgYWxyZWFkeSBvcGVuIHBpY2tlcnNcclxuICAgICAgICBpZiAoIHRoaXMuY3VycmVudFBpY2tlciApXHJcbiAgICAgICAgaWYgKCB0aGlzLmN1cnJlbnRQaWNrZXIuZG9tLmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbnkgb3BlbiBlZGl0b3JzXHJcbiAgICAgICAgbGV0IHByZXZUYXJnZXQgPSB0aGlzLmRvbUVkaXRpbmc7XHJcbiAgICAgICAgdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBJZiBjbGlja2luZyB0aGUgZWxlbWVudCBhbHJlYWR5IGJlaW5nIGVkaXRlZCwgZG9uJ3QgcmVvcGVuXHJcbiAgICAgICAgaWYgKHRhcmdldCA9PT0gcHJldlRhcmdldClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgY29sbGFwc2libGUgZWxlbWVudHNcclxuICAgICAgICBpZiAoIHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3RvZ2dsZScpIClcclxuICAgICAgICAgICAgdGhpcy50b2dnbGVDb2xsYXBzaWFibGUodGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gRmluZCBhbmQgb3BlbiBwaWNrZXIgZm9yIHRoZSB0YXJnZXQgZWxlbWVudFxyXG4gICAgICAgIGVsc2UgaWYgKHR5cGUgJiYgcGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLm9wZW5QaWNrZXIodGFyZ2V0LCBwaWNrZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZS1sYXlvdXQgdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBvbiByZXNpemUgKi9cclxuICAgIHByaXZhdGUgb25SZXNpemUoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRQaWNrZXIpXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpY2tlci5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmUtbGF5b3V0IHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgb24gc2Nyb2xsICovXHJcbiAgICBwcml2YXRlIG9uU2Nyb2xsKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBXb3JrYXJvdW5kIGZvciBsYXlvdXQgYmVoYXZpbmcgd2VpcmQgd2hlbiBpT1Mga2V5Ym9hcmQgaXMgb3BlblxyXG4gICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlci5oYXNGb2N1cygpKVxyXG4gICAgICAgICAgICBET00uYmx1ckFjdGl2ZSgpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGbGlwcyB0aGUgY29sbGFwc2Ugc3RhdGUgb2YgYSBjb2xsYXBzaWJsZSwgYW5kIHByb3BhZ2F0ZXMgdGhlIG5ldyBzdGF0ZSB0byBvdGhlclxyXG4gICAgICogY29sbGFwc2libGVzIG9mIHRoZSBzYW1lIHJlZmVyZW5jZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IENvbGxhcHNpYmxlIGVsZW1lbnQgYmVpbmcgdG9nZ2xlZFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHRvZ2dsZUNvbGxhcHNpYWJsZSh0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICAgICA9IHRhcmdldC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgcmVmICAgICAgICA9IERPTS5yZXF1aXJlRGF0YShwYXJlbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgdHlwZSAgICAgICA9IERPTS5yZXF1aXJlRGF0YShwYXJlbnQsICd0eXBlJyk7XHJcbiAgICAgICAgbGV0IGNvbGxhcGFzZWQgPSBwYXJlbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKTtcclxuXHJcbiAgICAgICAgLy8gUHJvcGFnYXRlIG5ldyBjb2xsYXBzZSBzdGF0ZSB0byBhbGwgY29sbGFwc2libGVzIG9mIHRoZSBzYW1lIHJlZlxyXG4gICAgICAgIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoYHNwYW5bZGF0YS10eXBlPSR7dHlwZX1dW2RhdGEtcmVmPSR7cmVmfV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChfID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBwaHJhc2VzZXQgPSBfIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgbGV0IHRvZ2dsZSAgICA9IHBocmFzZXNldC5jaGlsZHJlblswXSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBTa2lwIHNhbWUtcmVmIGVsZW1lbnRzIHRoYXQgYXJlbid0IGNvbGxhcHNpYmxlXHJcbiAgICAgICAgICAgICAgICBpZiAoICF0b2dnbGUgfHwgIXRvZ2dsZS5jbGFzc0xpc3QuY29udGFpbnMoJ3RvZ2dsZScpIClcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAgICAgQ29sbGFwc2libGVzLnNldChwaHJhc2VzZXQsIHRvZ2dsZSwgIWNvbGxhcGFzZWQpO1xyXG4gICAgICAgICAgICAgICAgLy8gRG9uJ3QgbW92ZSB0aGlzIHRvIHNldENvbGxhcHNpYmxlLCBhcyBzdGF0ZSBzYXZlL2xvYWQgaXMgaGFuZGxlZFxyXG4gICAgICAgICAgICAgICAgLy8gb3V0c2lkZSBpbiBib3RoIHVzYWdlcyBvZiBzZXRDb2xsYXBzaWJsZS5cclxuICAgICAgICAgICAgICAgIFJBRy5zdGF0ZS5zZXRDb2xsYXBzZWQocmVmLCAhY29sbGFwYXNlZCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogT3BlbnMgYSBwaWNrZXIgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWRpdG9yIGVsZW1lbnQgdG8gb3BlbiB0aGUgcGlja2VyIGZvclxyXG4gICAgICogQHBhcmFtIHBpY2tlciBQaWNrZXIgdG8gb3BlblxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9wZW5QaWNrZXIodGFyZ2V0OiBIVE1MRWxlbWVudCwgcGlja2VyOiBQaWNrZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRhcmdldC5zZXRBdHRyaWJ1dGUoJ2VkaXRpbmcnLCAndHJ1ZScpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIgPSBwaWNrZXI7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nICAgID0gdGFyZ2V0O1xyXG4gICAgICAgIHBpY2tlci5vcGVuKHRhcmdldCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUgKi9cclxuY2xhc3MgTWFycXVlZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYXJxdWVlJ3MgRE9NIGVsZW1lbnQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc3BhbiBlbGVtZW50IGluIHRoZSBtYXJxdWVlLCB3aGVyZSB0aGUgdGV4dCBpcyBzZXQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tU3BhbiA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgSUQgZm9yIHRoZSBzY3JvbGxpbmcgYW5pbWF0aW9uIHRpbWVyICovXHJcbiAgICBwcml2YXRlIHRpbWVyICA6IG51bWJlciA9IDA7XHJcbiAgICAvKiogQ3VycmVudCBvZmZzZXQgKGluIHBpeGVscykgb2YgdGhlIHNjcm9sbGluZyBtYXJxdWVlICovXHJcbiAgICBwcml2YXRlIG9mZnNldCA6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSAgICAgPSBET00ucmVxdWlyZSgnI21hcnF1ZWUnKTtcclxuICAgICAgICB0aGlzLmRvbVNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmlubmVySFRNTCA9ICcnO1xyXG4gICAgICAgIHRoaXMuZG9tLmFwcGVuZENoaWxkKHRoaXMuZG9tU3Bhbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIG1lc3NhZ2Ugb24gdGhlIHNjcm9sbGluZyBtYXJxdWVlLCBhbmQgc3RhcnRzIGFuaW1hdGluZyBpdCAqL1xyXG4gICAgcHVibGljIHNldChtc2c6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNwYW4udGV4dENvbnRlbnQgPSBtc2c7XHJcbiAgICAgICAgdGhpcy5vZmZzZXQgICAgICAgICAgICAgID0gdGhpcy5kb20uY2xpZW50V2lkdGg7XHJcblxyXG4gICAgICAgIC8vIEkgdHJpZWQgdG8gdXNlIENTUyBhbmltYXRpb24gZm9yIHRoaXMsIGJ1dCBjb3VsZG4ndCBmaWd1cmUgb3V0IGhvdyBmb3IgYVxyXG4gICAgICAgIC8vIGR5bmFtaWNhbGx5IHNpemVkIGVsZW1lbnQgbGlrZSB0aGUgc3Bhbi5cclxuICAgICAgICBsZXQgbGltaXQgPSAtdGhpcy5kb21TcGFuLmNsaWVudFdpZHRoIC0gMTAwO1xyXG4gICAgICAgIGxldCBhbmltICA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLm9mZnNldCAtPSAoRE9NLmlzTW9iaWxlID8gNSA6IDcpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGVYKCR7dGhpcy5vZmZzZXR9cHgpYDtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9mZnNldCA8IGxpbWl0KVxyXG4gICAgICAgICAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWVyID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdG9wcyB0aGUgY3VycmVudCBtYXJxdWVlIGFuaW1hdGlvbiAqL1xyXG4gICAgcHVibGljIHN0b3AoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy50aW1lcik7XHJcbiAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG5jbGFzcyBTZXR0aW5nc1xyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjb250YWluZXIgZm9yIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHByaXZhdGUgZG9tICAgICAgICAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgXCJSZXNldCBzZXR0aW5nc1wiIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5SZXNldCAgICAgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBcIlNhdmUgYW5kIGNsb3NlXCIgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blNhdmUgICAgICAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHZvaWNlIHNlbGVjdGlvbiBib3ggKi9cclxuICAgIHByaXZhdGUgc2VsU3BlZWNoVm9pY2UgICA6IEhUTUxTZWxlY3RFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgdm9pY2Ugdm9sdW1lIHNsaWRlciAqL1xyXG4gICAgcHJpdmF0ZSByYW5nZVNwZWVjaFZvbCAgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHZvaWNlIHBpdGNoIHNsaWRlciAqL1xyXG4gICAgcHJpdmF0ZSByYW5nZVNwZWVjaFBpdGNoIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHZvaWNlIHJhdGUgc2xpZGVyICovXHJcbiAgICBwcml2YXRlIHJhbmdlU3BlZWNoUmF0ZSAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc3BlZWNoIHRlc3QgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blNwZWVjaFRlc3QgICAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgdGltZXIgZm9yIHRoZSBcIlJlc2V0XCIgYnV0dG9uIGNvbmZpcm1hdGlvbiBzdGVwICovXHJcbiAgICBwcml2YXRlIHJlc2V0VGltZW91dD8gICAgOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICAvLyBHZW5lcmFsIHNldHRpbmdzIGZvcm1cclxuXHJcbiAgICAgICAgdGhpcy5kb20gICAgICA9IERPTS5yZXF1aXJlKCcjc2V0dGluZ3NTY3JlZW4nKTtcclxuICAgICAgICB0aGlzLmJ0blJlc2V0ID0gRE9NLnJlcXVpcmUoJyNidG5SZXNldFNldHRpbmdzJyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlICA9IERPTS5yZXF1aXJlKCcjYnRuU2F2ZVNldHRpbmdzJyk7XHJcblxyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQub25jbGljayA9IHRoaXMuaGFuZGxlUmVzZXQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUub25jbGljayAgPSB0aGlzLmhhbmRsZVNhdmUuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gU3BlZWNoIGZvcm1cclxuXHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZSAgID0gRE9NLnJlcXVpcmUoJyNzZWxTcGVlY2hDaG9pY2UnKTtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoVm9sICAgPSBET00ucmVxdWlyZSgnI3JhbmdlU3BlZWNoVm9sJyk7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFBpdGNoID0gRE9NLnJlcXVpcmUoJyNyYW5nZVNwZWVjaFBpdGNoJyk7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFJhdGUgID0gRE9NLnJlcXVpcmUoJyNyYW5nZVNwZWVjaFJhdGUnKTtcclxuICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3QgICAgPSBET00ucmVxdWlyZSgnI2J0blNwZWVjaFRlc3QnKTtcclxuXHJcbiAgICAgICAgdGhpcy5idG5TcGVlY2hUZXN0Lm9uY2xpY2sgPSB0aGlzLmhhbmRsZVZvaWNlVGVzdC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBMZWdhbCBhbmQgYWNrbm93bGVkZ2VtZW50c1xyXG5cclxuICAgICAgICBMaW5rZG93bi5wYXJzZSggRE9NLnJlcXVpcmUoJyNsZWdhbEJsb2NrJykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogT3BlbnMgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljIG9wZW4oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuXHJcbiAgICAgICAgLy8gVGhlIHZvaWNlIGxpc3QgaGFzIHRvIGJlIHBvcHVsYXRlZCBlYWNoIG9wZW4sIGluIGNhc2UgaXQgY2hhbmdlc1xyXG4gICAgICAgIHRoaXMucG9wdWxhdGVWb2ljZUxpc3QoKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZS5zZWxlY3RlZEluZGV4ICAgPSBSQUcuY29uZmlnLnNwZWVjaFZvaWNlO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWVBc051bWJlciAgID0gUkFHLmNvbmZpZy5zcGVlY2hWb2w7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlQXNOdW1iZXIgPSBSQUcuY29uZmlnLnNwZWVjaFBpdGNoO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlQXNOdW1iZXIgID0gUkFHLmNvbmZpZy5zcGVlY2hSYXRlO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxSZXNldCgpO1xyXG4gICAgICAgIFJBRy5zcGVlY2guY2FuY2VsKCk7XHJcbiAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XHJcbiAgICAgICAgRE9NLmJsdXJBY3RpdmUodGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbGVhcnMgYW5kIHBvcHVsYXRlcyB0aGUgdm9pY2UgbGlzdCAqL1xyXG4gICAgcHJpdmF0ZSBwb3B1bGF0ZVZvaWNlTGlzdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuc2VsU3BlZWNoVm9pY2UuaW5uZXJIVE1MID0gJyc7XHJcblxyXG4gICAgICAgIGxldCB2b2ljZXMgPSBSQUcuc3BlZWNoLmdldFZvaWNlcygpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgZW1wdHkgbGlzdFxyXG4gICAgICAgIGlmICh2b2ljZXMubGVuZ3RoIDw9IDApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgb3B0aW9uICAgICAgPSBET00uYWRkT3B0aW9uKCB0aGlzLnNlbFNwZWVjaFZvaWNlLCBMLlNUX1NQRUVDSF9FTVBUWSgpICk7XHJcbiAgICAgICAgICAgIG9wdGlvbi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9TcGVlY2hTeW50aGVzaXNcclxuICAgICAgICBlbHNlIGZvciAobGV0IGkgPSAwOyBpIDwgdm9pY2VzLmxlbmd0aCA7IGkrKylcclxuICAgICAgICAgICAgRE9NLmFkZE9wdGlvbih0aGlzLnNlbFNwZWVjaFZvaWNlLCBgJHt2b2ljZXNbaV0ubmFtZX0gKCR7dm9pY2VzW2ldLmxhbmd9KWApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSByZXNldCBidXR0b24sIHdpdGggYSBjb25maXJtIHN0ZXAgdGhhdCBjYW5jZWxzIGFmdGVyIDE1IHNlY29uZHMgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlUmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMucmVzZXRUaW1lb3V0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5yZXNldFRpbWVvdXQgICAgICAgPSBzZXRUaW1lb3V0KHRoaXMuY2FuY2VsUmVzZXQuYmluZCh0aGlzKSwgMTUwMDApO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blJlc2V0LmlubmVyVGV4dCA9IEwuU1RfUkVTRVRfQ09ORklSTSgpO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blJlc2V0LnRpdGxlICAgICA9IEwuU1RfUkVTRVRfQ09ORklSTV9UKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFJBRy5jb25maWcucmVzZXQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIHRoaXMuY2FuY2VsUmVzZXQoKTtcclxuICAgICAgICB0aGlzLm9wZW4oKTtcclxuICAgICAgICBhbGVydCggTC5TVF9SRVNFVF9ET05FKCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2FuY2VsIHRoZSByZXNldCB0aW1lb3V0IGFuZCByZXN0b3JlIHRoZSByZXNldCBidXR0b24gdG8gbm9ybWFsICovXHJcbiAgICBwcml2YXRlIGNhbmNlbFJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnJlc2V0VGltZW91dCk7XHJcbiAgICAgICAgdGhpcy5idG5SZXNldC5pbm5lclRleHQgPSBMLlNUX1JFU0VUKCk7XHJcbiAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX1QoKTtcclxuICAgICAgICB0aGlzLnJlc2V0VGltZW91dCAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2F2ZSBidXR0b24sIHNhdmluZyBjb25maWcgdG8gc3RvcmFnZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVTYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2ljZSAgPSB0aGlzLnNlbFNwZWVjaFZvaWNlLnNlbGVjdGVkSW5kZXg7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2wgICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2ggID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoUGl0Y2gudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSAgID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZSk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zYXZlKCk7XHJcbiAgICAgICAgdGhpcy5jbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzcGVlY2ggdGVzdCBidXR0b24sIHNwZWFraW5nIGEgdGVzdCBwaHJhc2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlVm9pY2VUZXN0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEhhcyB0byBleGVjdXRlIG9uIGEgZGVsYXksIGFzIHNwZWVjaCBjYW5jZWwgaXMgdW5yZWxpYWJsZSB3aXRob3V0IGl0XHJcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgbGV0IHRpbWUgICA9IFN0cmluZ3MuZnJvbVRpbWUoIG5ldyBEYXRlKCkgKTtcclxuICAgICAgICAgICAgbGV0IHBocmFzZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHJcbiAgICAgICAgICAgIHBocmFzZS5pbm5lckhUTUwgPSAnPHNwYW4gZGF0YS10eXBlPVwicGhyYXNlXCIgZGF0YS1yZWY9XCJzYW1wbGVcIj4nICtcclxuICAgICAgICAgICAgICAgICdUaGlzIGlzIGEgdGVzdCBvZiB0aGUgUmFpbCBBbm5vdW5jZW1lbnQgR2VuZXJhdG9yIGF0JyArXHJcbiAgICAgICAgICAgICAgICAnPHNwYW4gZGF0YS10eXBlPVwidGltZVwiPicgKyB0aW1lICsgJzwvc3Bhbj4nICtcclxuICAgICAgICAgICAgICAgICc8L3NwYW4+JztcclxuXHJcbiAgICAgICAgICAgIFJBRy5zcGVlY2guc3BlYWsoXHJcbiAgICAgICAgICAgICAgICBwaHJhc2UuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LFxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHZvaWNlSWR4IDogdGhpcy5zZWxTcGVlY2hWb2ljZS5zZWxlY3RlZEluZGV4LFxyXG4gICAgICAgICAgICAgICAgICAgIHZvbHVtZSAgIDogdGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHBpdGNoICAgIDogdGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlQXNOdW1iZXIsXHJcbiAgICAgICAgICAgICAgICAgICAgcmF0ZSAgICAgOiB0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZUFzTnVtYmVyXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfSwgMjAwKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSB0b3AgdG9vbGJhciAqL1xyXG5jbGFzcyBUb29sYmFyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGNvbnRhaW5lciBmb3IgdGhlIHRvb2xiYXIgKi9cclxuICAgIHByaXZhdGUgZG9tICAgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBsYXkgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blBsYXkgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzdG9wIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5TdG9wICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgZ2VuZXJhdGUgcmFuZG9tIHBocmFzZSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuR2VuZXJhdGUgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNhdmUgc3RhdGUgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blNhdmUgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSByZWNhbGwgc3RhdGUgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blJlY2FsbCAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzZXR0aW5ncyBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuT3B0aW9uICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgPSBET00ucmVxdWlyZSgnI3Rvb2xiYXInKTtcclxuICAgICAgICB0aGlzLmJ0blBsYXkgICAgID0gRE9NLnJlcXVpcmUoJyNidG5QbGF5Jyk7XHJcbiAgICAgICAgdGhpcy5idG5TdG9wICAgICA9IERPTS5yZXF1aXJlKCcjYnRuU3RvcCcpO1xyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUgPSBET00ucmVxdWlyZSgnI2J0blNodWZmbGUnKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUgICAgID0gRE9NLnJlcXVpcmUoJyNidG5TYXZlJyk7XHJcbiAgICAgICAgdGhpcy5idG5SZWNhbGwgICA9IERPTS5yZXF1aXJlKCcjYnRuTG9hZCcpO1xyXG4gICAgICAgIHRoaXMuYnRuT3B0aW9uICAgPSBET00ucmVxdWlyZSgnI2J0blNldHRpbmdzJyk7XHJcblxyXG4gICAgICAgIHRoaXMuYnRuU3RvcC5vbmNsaWNrICAgICA9IHRoaXMuaGFuZGxlU3RvcC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUub25jbGljayA9IHRoaXMuaGFuZGxlR2VuZXJhdGUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUub25jbGljayAgICAgPSB0aGlzLmhhbmRsZVNhdmUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blJlY2FsbC5vbmNsaWNrICAgPSB0aGlzLmhhbmRsZUxvYWQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0bk9wdGlvbi5vbmNsaWNrICAgPSB0aGlzLmhhbmRsZU9wdGlvbi5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICB0aGlzLmJ0blBsYXkub25jbGljayA9IGV2ID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBIYXMgdG8gZXhlY3V0ZSBvbiBhIGRlbGF5LCBhcyBzcGVlY2ggY2FuY2VsIGlzIHVucmVsaWFibGUgd2l0aG91dCBpdFxyXG4gICAgICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dCh0aGlzLmhhbmRsZVBsYXkuYmluZCh0aGlzKSwgMjAwKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBBZGQgdGhyb2IgY2xhc3MgaWYgdGhlIGdlbmVyYXRlIGJ1dHRvbiBoYXNuJ3QgYmVlbiBjbGlja2VkIGJlZm9yZVxyXG4gICAgICAgIGlmICghUkFHLmNvbmZpZy5jbGlja2VkR2VuZXJhdGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmNsYXNzTGlzdC5hZGQoJ3Rocm9iJyk7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgcGxheSBidXR0b24sIHBsYXlpbmcgdGhlIGVkaXRvcidzIGN1cnJlbnQgcGhyYXNlIHdpdGggc3BlZWNoICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVBsYXkoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBOb3RlOiBJdCB3b3VsZCBiZSBuaWNlIHRvIGhhdmUgdGhlIHBsYXkgYnV0dG9uIGNoYW5nZSB0byB0aGUgc3RvcCBidXR0b24gYW5kXHJcbiAgICAgICAgLy8gYXV0b21hdGljYWxseSBjaGFuZ2UgYmFjay4gSG93ZXZlciwgc3BlZWNoJ3MgJ29uZW5kJyBldmVudCB3YXMgZm91bmQgdG8gYmVcclxuICAgICAgICAvLyB1bnJlbGlhYmxlLCBzbyBJIGRlY2lkZWQgdG8ga2VlcCBwbGF5IGFuZCBzdG9wIHNlcGFyYXRlLlxyXG5cclxuICAgICAgICBSQUcuc3BlZWNoLnNwZWFrKCBSQUcudmlld3MuZWRpdG9yLmdldFBocmFzZSgpICk7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBSQUcudmlld3MuZWRpdG9yLmdldFRleHQoKSApO1xyXG4gICAgICAgIHRoaXMuYnRuUGxheS5kaXNhYmxlZCA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzdG9wIGJ1dHRvbiwgc3RvcHBpbmcgdGhlIG1hcnF1ZWUgYW5kIGFueSBzcGVlY2ggKi9cclxuICAgIHByaXZhdGUgaGFuZGxlU3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zcGVlY2guY2FuY2VsKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBnZW5lcmF0ZSBidXR0b24sIGdlbmVyYXRpbmcgbmV3IHJhbmRvbSBzdGF0ZSBhbmQgcGhyYXNlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gUmVtb3ZlIHRoZSBjYWxsLXRvLWFjdGlvbiB0aHJvYiBmcm9tIGluaXRpYWwgbG9hZFxyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuY2xhc3NMaXN0LnJlbW92ZSgndGhyb2InKTtcclxuICAgICAgICBSQUcuZ2VuZXJhdGUoKTtcclxuICAgICAgICBSQUcuY29uZmlnLmNsaWNrZWRHZW5lcmF0ZSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNhdmUgYnV0dG9uLCBwZXJzaXN0aW5nIHRoZSBjdXJyZW50IHRyYWluIHN0YXRlIHRvIHN0b3JhZ2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlU2F2ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGNzcyA9ICdmb250LXNpemU6IGxhcmdlOyBmb250LXdlaWdodDogYm9sZDsnO1xyXG4gICAgICAgICAgICBsZXQgcmF3ID0gSlNPTi5zdHJpbmdpZnkoUkFHLnN0YXRlKTtcclxuICAgICAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdzdGF0ZScsIHJhdyk7XHJcblxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhMLlNUQVRFX0NPUFlfUEFTVEUoKSwgY3NzKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJSQUcubG9hZCgnXCIsIHJhdy5yZXBsYWNlKFwiJ1wiLCBcIlxcXFwnXCIpLCBcIicpXCIpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhMLlNUQVRFX1JBV19KU09OKCksIGNzcyk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHJhdyk7XHJcblxyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfVE9fU1RPUkFHRSgpICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX1NBVkVfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBsb2FkIGJ1dHRvbiwgbG9hZGluZyB0cmFpbiBzdGF0ZSBmcm9tIHN0b3JhZ2UsIGlmIGl0IGV4aXN0cyAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVMb2FkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGRhdGEgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3N0YXRlJyk7XHJcblxyXG4gICAgICAgIHJldHVybiBkYXRhXHJcbiAgICAgICAgICAgID8gUkFHLmxvYWQoZGF0YSlcclxuICAgICAgICAgICAgOiBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfU0FWRV9NSVNTSU5HKCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2V0dGluZ3MgYnV0dG9uLCBvcGVuaW5nIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHByaXZhdGUgaGFuZGxlT3B0aW9uKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnZpZXdzLnNldHRpbmdzLm9wZW4oKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgVUkgZWxlbWVudHMgYW5kIHRoZWlyIGxvZ2ljICovXHJcbmNsYXNzIFZpZXdzXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gZWRpdG9yIGNvbXBvbmVudCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBlZGl0b3IgICA6IEVkaXRvcjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gbWFycXVlZSBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbWFycXVlZSAgOiBNYXJxdWVlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc2V0dGluZ3MgOiBTZXR0aW5ncztcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gdG9vbGJhciBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgdG9vbGJhciAgOiBUb29sYmFyO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gYWxsIHRoZSBwaWNrZXJzLCBvbmUgZm9yIGVhY2ggdHlwZSBvZiBYTUwgZWxlbWVudCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBwaWNrZXJzICA6IERpY3Rpb25hcnk8UGlja2VyPjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZWRpdG9yICAgPSBuZXcgRWRpdG9yKCk7XHJcbiAgICAgICAgdGhpcy5tYXJxdWVlICA9IG5ldyBNYXJxdWVlKCk7XHJcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IG5ldyBTZXR0aW5ncygpO1xyXG4gICAgICAgIHRoaXMudG9vbGJhciAgPSBuZXcgVG9vbGJhcigpO1xyXG4gICAgICAgIHRoaXMucGlja2VycyAgPSB7fTtcclxuXHJcbiAgICAgICAgW1xyXG4gICAgICAgICAgICBuZXcgQ29hY2hQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IEV4Y3VzZVBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgSW50ZWdlclBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgTmFtZWRQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFBocmFzZXNldFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgUGxhdGZvcm1QaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFNlcnZpY2VQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFN0YXRpb25QaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFN0YXRpb25MaXN0UGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBUaW1lUGlja2VyKClcclxuICAgICAgICBdLmZvckVhY2gocGlja2VyID0+IHRoaXMucGlja2Vyc1twaWNrZXIueG1sVGFnXSA9IHBpY2tlcik7XHJcblxyXG4gICAgICAgIC8vIEdsb2JhbCBob3RrZXlzXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5vbmtleWRvd24gPSB0aGlzLm9uSW5wdXQuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaU9TLXNwZWNpZmljIENTUyBmaXhlc1xyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZCgnaW9zJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIHBpY2tlciB0aGF0IGhhbmRsZXMgYSBnaXZlbiB0YWcsIGlmIGFueSAqL1xyXG4gICAgcHVibGljIGdldFBpY2tlcih4bWxUYWc6IHN0cmluZykgOiBQaWNrZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5waWNrZXJzW3htbFRhZ107XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZSBFU0MgdG8gY2xvc2UgcGlja2VycyBvciBzZXR0aWducyAqL1xyXG4gICAgcHJpdmF0ZSBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoZXYua2V5ICE9PSAnRXNjYXBlJylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MuY2xvc2UoKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIGNvbGxhcHNpYmxlIGVsZW1lbnRzICovXHJcbmNsYXNzIENvbGxhcHNpYmxlc1xyXG57XHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc3BhbiBUaGUgZW5jYXBzdWxhdGluZyBjb2xsYXBzaWJsZSBlbGVtZW50XHJcbiAgICAgKiBAcGFyYW0gdG9nZ2xlIFRoZSB0b2dnbGUgY2hpbGQgb2YgdGhlIGNvbGxhcHNpYmxlIGVsZW1lbnRcclxuICAgICAqIEBwYXJhbSBzdGF0ZSBUcnVlIHRvIGNvbGxhcHNlLCBmYWxzZSB0byBvcGVuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2V0KHNwYW46IEhUTUxFbGVtZW50LCB0b2dnbGU6IEhUTUxFbGVtZW50LCBzdGF0ZTogYm9vbGVhbikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgPSBzcGFuLmRhdGFzZXRbJ3JlZiddIHx8ICc/Pz8nO1xyXG4gICAgICAgIGxldCB0eXBlID0gc3Bhbi5kYXRhc2V0Wyd0eXBlJ10hO1xyXG5cclxuICAgICAgICBpZiAoc3RhdGUpIHNwYW4uc2V0QXR0cmlidXRlKCdjb2xsYXBzZWQnLCAnJyk7XHJcbiAgICAgICAgZWxzZSAgICAgICBzcGFuLnJlbW92ZUF0dHJpYnV0ZSgnY29sbGFwc2VkJyk7XHJcblxyXG4gICAgICAgIHRvZ2dsZS50aXRsZSA9IHN0YXRlXHJcbiAgICAgICAgICAgID8gTC5USVRMRV9PUFRfT1BFTih0eXBlLCByZWYpXHJcbiAgICAgICAgICAgIDogTC5USVRMRV9PUFRfQ0xPU0UodHlwZSwgcmVmKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFN1Z2FyIGZvciBjaG9vc2luZyBzZWNvbmQgdmFsdWUgaWYgZmlyc3QgaXMgdW5kZWZpbmVkLCBpbnN0ZWFkIG9mIGZhbHN5ICovXHJcbmZ1bmN0aW9uIGVpdGhlcjxUPih2YWx1ZTogVCB8IHVuZGVmaW5lZCwgdmFsdWUyOiBUKSA6IFRcclxue1xyXG4gICAgcmV0dXJuICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSA/IHZhbHVlMiA6IHZhbHVlO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBkZWFsaW5nIHdpdGggdGhlIERPTSAqL1xyXG5jbGFzcyBET01cclxue1xyXG4gICAgLyoqIFdoZXRoZXIgdGhlIHdpbmRvdyBpcyB0aGlubmVyIHRoYW4gYSBzcGVjaWZpYyBzaXplIChhbmQsIHRodXMsIGlzIFwibW9iaWxlXCIpICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBpc01vYmlsZSgpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoIDw9IDUwMDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogV2hldGhlciBSQUcgYXBwZWFycyB0byBiZSBydW5uaW5nIG9uIGFuIGlPUyBkZXZpY2UgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGlzaU9TKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5wbGF0Zm9ybS5tYXRjaCgvaVBob25lfGlQb2R8aVBhZC9naSkgIT09IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGF0dHJpYnV0ZSBmcm9tIHRoZSBnaXZlbiBlbGVtZW50LCBvciByZXR1cm5zIHRoZSBnaXZlblxyXG4gICAgICogZGVmYXVsdCB2YWx1ZSBpZiB1bnNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgYXR0cmlidXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gYXR0ciBOYW1lIG9mIHRoZSBhdHRyaWJ1dGUgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxyXG4gICAgICogQHBhcmFtIGRlZiBEZWZhdWx0IHZhbHVlIGlmIGF0dHJpYnV0ZSBpc24ndCBzZXRcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBhdHRyaWJ1dGUncyB2YWx1ZSwgb3IgZGVmYXVsdCB2YWx1ZSBpZiB1bnNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldEF0dHIoZWxlbWVudDogSFRNTEVsZW1lbnQsIGF0dHI6IHN0cmluZywgZGVmOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuaGFzQXR0cmlidXRlKGF0dHIpXHJcbiAgICAgICAgICAgID8gZWxlbWVudC5nZXRBdHRyaWJ1dGUoYXR0cikhXHJcbiAgICAgICAgICAgIDogZGVmO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgYW4gZWxlbWVudCBmcm9tIHRoZSBnaXZlbiBkb2N1bWVudCwgdGhyb3dpbmcgYW4gZXJyb3IgaWYgbm8gbWF0Y2ggaXMgZm91bmQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IENTUyBzZWxlY3RvciBxdWVyeSB0byB1c2VcclxuICAgICAqIEBwYXJhbSBwYXJlbnQgUGFyZW50IG9iamVjdCB0byBzZWFyY2g7IGRlZmF1bHRzIHRvIGRvY3VtZW50XHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZmlyc3QgZWxlbWVudCB0byBtYXRjaCB0aGUgZ2l2ZW4gcXVlcnlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXF1aXJlPFQgZXh0ZW5kcyBIVE1MRWxlbWVudD5cclxuICAgICAgICAocXVlcnk6IHN0cmluZywgcGFyZW50OiBQYXJlbnROb2RlID0gd2luZG93LmRvY3VtZW50KVxyXG4gICAgICAgIDogVFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBwYXJlbnQucXVlcnlTZWxlY3RvcihxdWVyeSkgYXMgVDtcclxuXHJcbiAgICAgICAgaWYgKCFyZXN1bHQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRPTV9NSVNTSU5HKHF1ZXJ5KSApO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBhdHRyaWJ1dGUgZnJvbSB0aGUgZ2l2ZW4gZWxlbWVudCwgdGhyb3dpbmcgYW4gZXJyb3JcclxuICAgICAqIGlmIHRoZSBhdHRyaWJ1dGUgaXMgbWlzc2luZy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgYXR0cmlidXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gYXR0ciBOYW1lIG9mIHRoZSBhdHRyaWJ1dGUgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxyXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGF0dHJpYnV0ZSdzIHZhbHVlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZUF0dHIoZWxlbWVudDogSFRNTEVsZW1lbnQsIGF0dHI6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAoICFlbGVtZW50Lmhhc0F0dHJpYnV0ZShhdHRyKSApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkFUVFJfTUlTU0lORyhhdHRyKSApO1xyXG5cclxuICAgICAgICByZXR1cm4gZWxlbWVudC5nZXRBdHRyaWJ1dGUoYXR0cikhO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBrZXkgb2YgdGhlIGdpdmVuIGVsZW1lbnQncyBkYXRhc2V0LCB0aHJvd2luZyBhbiBlcnJvclxyXG4gICAgICogaWYgdGhlIHZhbHVlIGlzIG1pc3Npbmcgb3IgZW1wdHkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGRhdGEgb2ZcclxuICAgICAqIEBwYXJhbSBrZXkgS2V5IHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBkYXRhc2V0J3MgdmFsdWVcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXF1aXJlRGF0YShlbGVtZW50OiBIVE1MRWxlbWVudCwga2V5OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHZhbHVlID0gZWxlbWVudC5kYXRhc2V0W2tleV07XHJcblxyXG4gICAgICAgIGlmICggU3RyaW5ncy5pc051bGxPckVtcHR5KHZhbHVlKSApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRBVEFfTUlTU0lORyhrZXkpICk7XHJcblxyXG4gICAgICAgIHJldHVybiB2YWx1ZSE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCbHVycyAodW5mb2N1c2VzKSB0aGUgY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGFyZW50IElmIGdpdmVuLCBvbmx5IGJsdXJzIGlmIGFjdGl2ZSBpcyBkZXNjZW5kYW50XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYmx1ckFjdGl2ZShwYXJlbnQ6IEhUTUxFbGVtZW50ID0gZG9jdW1lbnQuYm9keSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGFjdGl2ZSA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggYWN0aXZlICYmIGFjdGl2ZS5ibHVyICYmIHBhcmVudC5jb250YWlucyhhY3RpdmUpIClcclxuICAgICAgICAgICAgYWN0aXZlLmJsdXIoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIERlZXAgY2xvbmVzIGFsbCB0aGUgY2hpbGRyZW4gb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGludG8gdGhlIHRhcmdldCBlbGVtZW50LlxyXG4gICAgICogVXNpbmcgaW5uZXJIVE1MIHdvdWxkIGJlIGVhc2llciwgaG93ZXZlciBpdCBoYW5kbGVzIHNlbGYtY2xvc2luZyB0YWdzIHBvb3JseS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc291cmNlIEVsZW1lbnQgd2hvc2UgY2hpbGRyZW4gdG8gY2xvbmVcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWxlbWVudCB0byBhcHBlbmQgdGhlIGNsb25lZCBjaGlsZHJlbiB0b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsb25lSW50byhzb3VyY2U6IEhUTUxFbGVtZW50LCB0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNvdXJjZS5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICB0YXJnZXQuYXBwZW5kQ2hpbGQoIHNvdXJjZS5jaGlsZE5vZGVzW2ldLmNsb25lTm9kZSh0cnVlKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3VnYXIgZm9yIGNyZWF0aW5nIGFuZCBhZGRpbmcgYW4gb3B0aW9uIGVsZW1lbnQgdG8gYSBzZWxlY3QgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFNlbGVjdCBsaXN0IGVsZW1lbnQgdG8gYWRkIHRoZSBvcHRpb24gdG9cclxuICAgICAqIEBwYXJhbSB0ZXh0IExhYmVsIGZvciB0aGUgb3B0aW9uXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVmFsdWUgZm9yIHRoZSBvcHRpb25cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhZGRPcHRpb24oc2VsZWN0OiBIVE1MU2VsZWN0RWxlbWVudCwgdGV4dDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nID0gJycpXHJcbiAgICAgICAgOiBIVE1MT3B0aW9uRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIGxldCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKSBhcyBIVE1MT3B0aW9uRWxlbWVudDtcclxuXHJcbiAgICAgICAgb3B0aW9uLnRleHQgID0gdGV4dDtcclxuICAgICAgICBvcHRpb24udmFsdWUgPSB2YWx1ZTtcclxuXHJcbiAgICAgICAgc2VsZWN0LmFkZChvcHRpb24pO1xyXG4gICAgICAgIHJldHVybiBvcHRpb247XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGV4Y2x1ZGluZyB0aGUgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW4uXHJcbiAgICAgKiBCZSB3YXJuZWQ7IHRoaXMgbWV0aG9kIHVzZXMgUkFHLXNwZWNpZmljIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gcmVjdXJzaXZlbHkgZ2V0IHRleHQgY29udGVudCBvZlxyXG4gICAgICogQHJldHVybnMgVGV4dCBjb250ZW50IG9mIGdpdmVuIGVsZW1lbnQsIHdpdGhvdXQgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRWaXNpYmxlVGV4dChlbGVtZW50OiBFbGVtZW50KSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICAgICAgKGVsZW1lbnQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudC50ZXh0Q29udGVudCB8fCAnJztcclxuICAgICAgICBlbHNlIGlmICggZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3RvZ2dsZScpIClcclxuICAgICAgICAgICAgcmV0dXJuICcnO1xyXG5cclxuICAgICAgICAvLyBSZXR1cm4gYmxhbmsgKHNraXApIGlmIGNoaWxkIG9mIGEgY29sbGFwc2VkIGVsZW1lbnQuIFByZXZpb3VzbHksIHRoaXMgdXNlZFxyXG4gICAgICAgIC8vIGdldENvbXB1dGVkU3R5bGUsIGJ1dCB0aGF0IGRvZXNuJ3Qgd29yayBpZiB0aGUgZWxlbWVudCBpcyBwYXJ0IG9mIGFuIG9ycGhhbmVkXHJcbiAgICAgICAgLy8gcGhyYXNlIChhcyBoYXBwZW5zIHdpdGggdGhlIHBocmFzZXNldCBwaWNrZXIpLlxyXG4gICAgICAgIGxldCBwYXJlbnQgPSBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggcGFyZW50ICYmIHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpIClcclxuICAgICAgICAgICAgcmV0dXJuICcnO1xyXG5cclxuICAgICAgICBsZXQgdGV4dCA9ICcnO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICB0ZXh0ICs9IERPTS5nZXRWaXNpYmxlVGV4dChlbGVtZW50LmNoaWxkTm9kZXNbaV0gYXMgRWxlbWVudCk7XHJcblxyXG4gICAgICAgIHJldHVybiB0ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdGV4dCBjb250ZW50IG9mIHRoZSBnaXZlbiBlbGVtZW50LCBleGNsdWRpbmcgdGhlIHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuLFxyXG4gICAgICogYW5kIGV4Y2VzcyB3aGl0ZXNwYWNlIGFzIGEgcmVzdWx0IG9mIGNvbnZlcnRpbmcgZnJvbSBIVE1ML1hNTC5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xOTk4NjMyOFxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byByZWN1cnNpdmVseSBnZXQgdGV4dCBjb250ZW50IG9mXHJcbiAgICAgKiBAcmV0dXJucyBDbGVhbmVkIHRleHQgb2YgZ2l2ZW4gZWxlbWVudCwgd2l0aG91dCB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldENsZWFuZWRWaXNpYmxlVGV4dChlbGVtZW50OiBFbGVtZW50KSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBTdHJpbmdzLmNsZWFuKCBET00uZ2V0VmlzaWJsZVRleHQoZWxlbWVudCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNjYW5zIGZvciB0aGUgbmV4dCBmb2N1c2FibGUgc2libGluZyBmcm9tIGEgZ2l2ZW4gZWxlbWVudCwgc2tpcHBpbmcgaGlkZGVuIG9yXHJcbiAgICAgKiB1bmZvY3VzYWJsZSBlbGVtZW50cy4gSWYgdGhlIGVuZCBvZiB0aGUgY29udGFpbmVyIGlzIGhpdCwgdGhlIHNjYW4gd3JhcHMgYXJvdW5kLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBmcm9tIEVsZW1lbnQgdG8gc3RhcnQgc2Nhbm5pbmcgZnJvbVxyXG4gICAgICogQHBhcmFtIGRpciBEaXJlY3Rpb247IC0xIGZvciBsZWZ0IChwcmV2aW91cyksIDEgZm9yIHJpZ2h0IChuZXh0KVxyXG4gICAgICogQHJldHVybnMgVGhlIG5leHQgYXZhaWxhYmxlIHNpYmxpbmcsIG9yIG51bGwgaWYgbm9uZSBmb3VuZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZyb206IEhUTUxFbGVtZW50LCBkaXI6IG51bWJlcilcclxuICAgICAgICA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdXJyZW50ID0gZnJvbTtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IGZyb20ucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCFwYXJlbnQpXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICB3aGlsZSAodHJ1ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIFByb2NlZWQgdG8gbmV4dCBlbGVtZW50LCBvciB3cmFwIGFyb3VuZCBpZiBoaXQgdGhlIGVuZCBvZiBwYXJlbnRcclxuICAgICAgICAgICAgaWYgICAgICAoZGlyIDwgMClcclxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBwYXJlbnQubGFzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID4gMClcclxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IHBhcmVudC5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuQkFEX0RJUkVDVElPTiggZGlyLnRvU3RyaW5nKCkgKSApO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgd2UndmUgY29tZSBiYWNrIHRvIHRoZSBzdGFydGluZyBlbGVtZW50LCBub3RoaW5nIHdhcyBmb3VuZFxyXG4gICAgICAgICAgICBpZiAoY3VycmVudCA9PT0gZnJvbSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgdGhpcyBlbGVtZW50IGlzbid0IGhpZGRlbiBhbmQgaXMgZm9jdXNhYmxlLCByZXR1cm4gaXQhXHJcbiAgICAgICAgICAgIGlmICggIWN1cnJlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdoaWRkZW4nKSApXHJcbiAgICAgICAgICAgIGlmICggY3VycmVudC5oYXNBdHRyaWJ1dGUoJ3RhYmluZGV4JykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBlbGVtZW50LCByZWxldmFudCB0byBpdHMgcGFyZW50LlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIGVsZW1lbnQgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluZGV4T2YoY2hpbGQ6IEhUTUxFbGVtZW50KSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGRyZW4sIGNoaWxkKVxyXG4gICAgICAgICAgICA6IC0xO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBub2RlLCByZWxldmFudCB0byBpdHMgcGFyZW50LiBVc2VkIGZvciB0ZXh0IG5vZGVzLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIG5vZGUgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG5vZGVJbmRleE9mKGNoaWxkOiBOb2RlKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnROb2RlO1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGROb2RlcywgY2hpbGQpXHJcbiAgICAgICAgICAgIDogLTE7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBBIHZlcnksIHZlcnkgc21hbGwgc3Vic2V0IG9mIE1hcmtkb3duIGZvciBoeXBlcmxpbmtpbmcgYSBibG9jayBvZiB0ZXh0ICovXHJcbmNsYXNzIExpbmtkb3duXHJcbntcclxuICAgIC8qKiBSZWdleCBwYXR0ZXJuIGZvciBtYXRjaGluZyBsaW5rZWQgdGV4dCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVHRVhfTElOSyA9IC9cXFsoLis/KVxcXS9naTtcclxuICAgIC8qKiBSZWdleCBwYXR0ZXJuIGZvciBtYXRjaGluZyBsaW5rIHJlZmVyZW5jZXMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX1JFRiAgPSAvXFxbKFxcZCspXFxdOlxccysoXFxTKykvZ2k7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQYXJzZXMgdGhlIHRleHQgb2YgdGhlIGdpdmVuIGJsb2NrIGFzIExpbmtkb3duLCBjb252ZXJ0aW5nIHRhZ2dlZCB0ZXh0IGludG8gbGlua3NcclxuICAgICAqIHVzaW5nIGEgZ2l2ZW4gbGlzdCBvZiBpbmRleC1iYXNlZCByZWZlcmVuY2VzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBibG9jayBFbGVtZW50IHdpdGggdGV4dCB0byByZXBsYWNlOyBhbGwgY2hpbGRyZW4gY2xlYXJlZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlKGJsb2NrOiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGxpbmtzIDogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICAgICAgLy8gRmlyc3QsIGdldCB0aGUgbGlzdCBvZiByZWZlcmVuY2VzLCByZW1vdmluZyB0aGVtIGZyb20gdGhlIHRleHRcclxuICAgICAgICBsZXQgaWR4ICA9IDA7XHJcbiAgICAgICAgbGV0IHRleHQgPSBibG9jay5pbm5lclRleHQucmVwbGFjZSh0aGlzLlJFR0VYX1JFRiwgKF8sIGssIHYpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsaW5rc1sgcGFyc2VJbnQoaykgXSA9IHY7XHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgcmVwbGFjZSBlYWNoIHRhZ2dlZCBwYXJ0IG9mIHRleHQgd2l0aCBhIGxpbmsgZWxlbWVudFxyXG4gICAgICAgIGJsb2NrLmlubmVySFRNTCA9IHRleHQucmVwbGFjZSh0aGlzLlJFR0VYX0xJTkssIChfLCB0KSA9PlxyXG4gICAgICAgICAgICBgPGEgaHJlZj0nJHtsaW5rc1tpZHgrK119JyB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub29wZW5lclwiPiR7dH08L2E+YFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIHBhcnNpbmcgZGF0YSBmcm9tIHN0cmluZ3MgKi9cclxuY2xhc3MgUGFyc2Vcclxue1xyXG4gICAgLyoqIFBhcnNlcyBhIGdpdmVuIHN0cmluZyBpbnRvIGEgYm9vbGVhbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sZWFuKHN0cjogc3RyaW5nKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICBzdHIgPSBzdHIudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgICAgICAgaWYgKHN0ciA9PT0gJ3RydWUnIHx8IHN0ciA9PT0gJzEnKVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBpZiAoc3RyID09PSAnZmFsc2UnIHx8IHN0ciA9PT0gJzAnKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIHRocm93IEVycm9yKCBMLkJBRF9CT09MRUFOKHN0cikgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZ2VuZXJhdGluZyByYW5kb20gZGF0YSAqL1xyXG5jbGFzcyBSYW5kb21cclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSBpbnRlZ2VyIGZyb20gdGhlIGdpdmVuIHJhbmdlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBtaW4gTWluaW11bSBpbnRlZ2VyIHRvIHBpY2ssIGluY2x1c2l2ZVxyXG4gICAgICogQHBhcmFtIG1heCBNYXhpbXVtIGludGVnZXIgdG8gcGljaywgaW5jbHVzaXZlXHJcbiAgICAgKiBAcmV0dXJucyBSYW5kb20gaW50ZWdlciB3aXRoaW4gdGhlIGdpdmVuIHJhbmdlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50KG1pbjogbnVtYmVyID0gMCwgbWF4OiBudW1iZXIgPSAxKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBNYXRoLmZsb29yKCBNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbikgKSArIG1pbjtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gZWxlbWVudCBmcm9tIGEgZ2l2ZW4gYXJyYXktbGlrZSBvYmplY3Qgd2l0aCBhIGxlbmd0aCBwcm9wZXJ0eSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhcnJheShhcnI6IExlbmd0aGFibGUpIDogYW55XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGFyclsgUmFuZG9tLmludCgwLCBhcnIubGVuZ3RoKSBdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTcGxpY2VzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFycmF5U3BsaWNlPFQ+KGFycjogVFtdKSA6IFRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gYXJyLnNwbGljZShSYW5kb20uaW50KDAsIGFyci5sZW5ndGgpLCAxKVswXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20ga2V5IGZyb20gYSBnaXZlbiBvYmplY3QgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgb2JqZWN0S2V5KG9iajoge30pIDogYW55XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSggT2JqZWN0LmtleXMob2JqKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgdHJ1ZSBvciBmYWxzZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIENoYW5jZSBvdXQgb2YgMTAwLCB0byBwaWNrIGB0cnVlYFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJvb2woY2hhbmNlOiBudW1iZXIgPSA1MCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5pbnQoMCwgMTAwKSA8IGNoYW5jZTtcclxuICAgIH1cclxufVxyXG4iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IGNsYXNzIGZvciBhdWRpbyBmdW5jdGlvbmFsaXR5ICovXHJcbmNsYXNzIFNvdW5kc1xyXG57XHJcbiAgICAvKipcclxuICAgICAqIERlY29kZXMgdGhlIGdpdmVuIGF1ZGlvIGZpbGUgaW50byByYXcgYXVkaW8gZGF0YS4gVGhpcyBpcyBhIHdyYXBwZXIgZm9yIHRoZSBvbGRlclxyXG4gICAgICogY2FsbGJhY2stYmFzZWQgc3ludGF4LCBzaW5jZSBpdCBpcyB0aGUgb25seSBvbmUgaU9TIGN1cnJlbnRseSBzdXBwb3J0cy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBBdWRpbyBjb250ZXh0IHRvIHVzZSBmb3IgZGVjb2RpbmdcclxuICAgICAqIEBwYXJhbSBidWZmZXIgQnVmZmVyIG9mIGVuY29kZWQgZmlsZSBkYXRhIChlLmcuIG1wMykgdG8gZGVjb2RlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXN5bmMgZGVjb2RlKGNvbnRleHQ6IEF1ZGlvQ29udGV4dCwgYnVmZmVyOiBBcnJheUJ1ZmZlcilcclxuICAgICAgICA6IFByb21pc2U8QXVkaW9CdWZmZXI+XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlIDxBdWRpb0J1ZmZlcj4gKCAocmVzb2x2ZSwgcmVqZWN0KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQuZGVjb2RlQXVkaW9EYXRhKGJ1ZmZlciwgcmVzb2x2ZSwgcmVqZWN0KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIHN0cmluZ3MgKi9cclxuY2xhc3MgU3RyaW5nc1xyXG57XHJcbiAgICAvKiogQ2hlY2tzIGlmIHRoZSBnaXZlbiBzdHJpbmcgaXMgbnVsbCwgb3IgZW1wdHkgKHdoaXRlc3BhY2Ugb25seSBvciB6ZXJvLWxlbmd0aCkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNOdWxsT3JFbXB0eShzdHI6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiAhc3RyIHx8ICFzdHIudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJldHR5LXByaW50J3MgYSBnaXZlbiBsaXN0IG9mIHN0YXRpb25zLCB3aXRoIGNvbnRleHQgc2Vuc2l0aXZlIGV4dHJhcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZXMgTGlzdCBvZiBzdGF0aW9uIGNvZGVzIHRvIGpvaW5cclxuICAgICAqIEBwYXJhbSBjb250ZXh0IExpc3QncyBjb250ZXh0LiBJZiAnY2FsbGluZycsIGhhbmRsZXMgc3BlY2lhbCBjYXNlXHJcbiAgICAgKiBAcmV0dXJucyBQcmV0dHktcHJpbnRlZCBsaXN0IG9mIGdpdmVuIHN0YXRpb25zXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbVN0YXRpb25MaXN0KGNvZGVzOiBzdHJpbmdbXSwgY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSAnJztcclxuICAgICAgICBsZXQgbmFtZXMgID0gY29kZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgbmFtZXMuZm9yRWFjaCggKGMsIGkpID0+IG5hbWVzW2ldID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oYywgdHJ1ZSkgKTtcclxuXHJcbiAgICAgICAgaWYgKG5hbWVzLmxlbmd0aCA9PT0gMSlcclxuICAgICAgICAgICAgcmVzdWx0ID0gKGNvbnRleHQgPT09ICdjYWxsaW5nJylcclxuICAgICAgICAgICAgICAgID8gYCR7bmFtZXNbMF19IG9ubHlgXHJcbiAgICAgICAgICAgICAgICA6IG5hbWVzWzBdO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsYXN0U3RhdGlvbiA9IG5hbWVzLnBvcCgpO1xyXG5cclxuICAgICAgICAgICAgcmVzdWx0ICA9IG5hbWVzLmpvaW4oJywgJyk7XHJcbiAgICAgICAgICAgIHJlc3VsdCArPSBgIGFuZCAke2xhc3RTdGF0aW9ufWA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJldHR5LXByaW50cyB0aGUgZ2l2ZW4gZGF0ZSBvciBob3VycyBhbmQgbWludXRlcyBpbnRvIGEgMjQtaG91ciB0aW1lIChlLmcuIDAxOjA5KS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaG91cnMgSG91cnMsIGZyb20gMCB0byAyMywgb3IgRGF0ZSBvYmplY3RcclxuICAgICAqIEBwYXJhbSBtaW51dGVzIE1pbnV0ZXMsIGZyb20gMCB0byA1OVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21UaW1lKGhvdXJzOiBudW1iZXIgfCBEYXRlLCBtaW51dGVzOiBudW1iZXIgPSAwKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmIChob3VycyBpbnN0YW5jZW9mIERhdGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBtaW51dGVzID0gaG91cnMuZ2V0TWludXRlcygpO1xyXG4gICAgICAgICAgICBob3VycyAgID0gaG91cnMuZ2V0SG91cnMoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBob3Vycy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJykgKyAnOicgK1xyXG4gICAgICAgICAgICBtaW51dGVzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYW5zIHVwIHRoZSBnaXZlbiB0ZXh0IG9mIGV4Y2VzcyB3aGl0ZXNwYWNlIGFuZCBhbnkgbmV3bGluZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2xlYW4odGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0ZXh0LnRyaW0oKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xcblxccl0vZ2ksICAgJycgIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcc3syLH0vZ2ksICAgJyAnIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccyhbLixdKS9naSwgJyQxJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0cm9uZ2x5IGNvbXByZXNzZXMgdGhlIGdpdmVuIHN0cmluZyB0byBvbmUgbW9yZSBmaWxlbmFtZSBmcmllbmRseSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaWxlbmFtZSh0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRleHRcclxuICAgICAgICAgICAgLnRvTG93ZXJDYXNlKClcclxuICAgICAgICAgICAgLy8gUmVwbGFjZSBwbHVyYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pZXNcXGIvZywgJ3knKVxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgY29tbW9uIHdvcmRzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGIoYXxhbnxhdHxiZXxvZnxvbnx0aGV8dG98aW58aXN8aGFzfGJ5fHdpdGgpXFxiL2csICcnKVxyXG4gICAgICAgICAgICAudHJpbSgpXHJcbiAgICAgICAgICAgIC8vIENvbnZlcnQgc3BhY2VzIHRvIHVuZGVyc2NvcmVzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMrL2csICdfJylcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGFsbCBub24tYWxwaGFudW1lcmljYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXmEtejAtOV9dL2csICcnKVxyXG4gICAgICAgICAgICAvLyBMaW1pdCB0byAxMDAgY2hhcnM7IG1vc3Qgc3lzdGVtcyBzdXBwb3J0IG1heC4gMjU1IGJ5dGVzIGluIGZpbGVuYW1lc1xyXG4gICAgICAgICAgICAuc3Vic3RyaW5nKDAsIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGZpcnN0IG1hdGNoIG9mIGEgcGF0dGVybiBpbiBhIHN0cmluZywgb3IgdW5kZWZpbmVkIGlmIG5vdCBmb3VuZCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaXJzdE1hdGNoKHRleHQ6IHN0cmluZywgcGF0dGVybjogUmVnRXhwLCBpZHg6IG51bWJlcilcclxuICAgICAgICA6IHN0cmluZyB8IHVuZGVmaW5lZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBtYXRjaCA9IHRleHQubWF0Y2gocGF0dGVybik7XHJcblxyXG4gICAgICAgIHJldHVybiAobWF0Y2ggJiYgbWF0Y2hbaWR4XSlcclxuICAgICAgICAgICAgPyBtYXRjaFtpZHhdXHJcbiAgICAgICAgICAgIDogdW5kZWZpbmVkO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVW5pb24gdHlwZSBmb3IgaXRlcmFibGUgdHlwZXMgd2l0aCBhIC5sZW5ndGggcHJvcGVydHkgKi9cclxudHlwZSBMZW5ndGhhYmxlID0gQXJyYXk8YW55PiB8IE5vZGVMaXN0IHwgSFRNTENvbGxlY3Rpb24gfCBzdHJpbmc7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHBsYXRmb3JtIGFzIGEgZGlnaXQgYW5kIG9wdGlvbmFsIGxldHRlciB0dXBsZSAqL1xyXG50eXBlIFBsYXRmb3JtID0gW3N0cmluZywgc3RyaW5nXTtcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgZ2VuZXJpYyBrZXktdmFsdWUgZGljdGlvbmFyeSwgd2l0aCBzdHJpbmcga2V5cyAqL1xyXG50eXBlIERpY3Rpb25hcnk8VD4gPSB7IFtpbmRleDogc3RyaW5nXTogVCB9O1xyXG5cclxuLyoqIERlZmluZXMgdGhlIGRhdGEgcmVmZXJlbmNlcyBjb25maWcgb2JqZWN0IHBhc3NlZCBpbnRvIFJBRy5tYWluIG9uIGluaXQgKi9cclxuaW50ZXJmYWNlIERhdGFSZWZzXHJcbntcclxuICAgIC8qKiBTZWxlY3RvciBmb3IgZ2V0dGluZyB0aGUgcGhyYXNlIHNldCBYTUwgSUZyYW1lIGVsZW1lbnQgKi9cclxuICAgIHBocmFzZXNldEVtYmVkIDogc3RyaW5nO1xyXG4gICAgLyoqIFJhdyBhcnJheSBvZiBleGN1c2VzIGZvciB0cmFpbiBkZWxheXMgb3IgY2FuY2VsbGF0aW9ucyB0byB1c2UgKi9cclxuICAgIGV4Y3VzZXNEYXRhICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIG5hbWVzIGZvciBzcGVjaWFsIHRyYWlucyB0byB1c2UgKi9cclxuICAgIG5hbWVkRGF0YSAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIG5hbWVzIGZvciBzZXJ2aWNlcy9uZXR3b3JrcyB0byB1c2UgKi9cclxuICAgIHNlcnZpY2VzRGF0YSAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBjb2RlcyBhbmQgbmFtZXMgdG8gdXNlICovXHJcbiAgICBzdGF0aW9uc0RhdGEgICA6IERpY3Rpb25hcnk8c3RyaW5nPjtcclxufVxyXG5cclxuLyoqIEZpbGwgaW5zIGZvciB2YXJpb3VzIG1pc3NpbmcgZGVmaW5pdGlvbnMgb2YgbW9kZXJuIEphdmFzY3JpcHQgZmVhdHVyZXMgKi9cclxuXHJcbmludGVyZmFjZSBXaW5kb3dcclxue1xyXG4gICAgb251bmhhbmRsZWRyZWplY3Rpb246IEVycm9yRXZlbnRIYW5kbGVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU3RyaW5nXHJcbntcclxuICAgIHBhZFN0YXJ0KHRhcmdldExlbmd0aDogbnVtYmVyLCBwYWRTdHJpbmc/OiBzdHJpbmcpIDogc3RyaW5nO1xyXG4gICAgcGFkRW5kKHRhcmdldExlbmd0aDogbnVtYmVyLCBwYWRTdHJpbmc/OiBzdHJpbmcpIDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXJyYXk8VD5cclxue1xyXG4gICAgaW5jbHVkZXMoc2VhcmNoRWxlbWVudDogVCwgZnJvbUluZGV4PzogbnVtYmVyKSA6IGJvb2xlYW47XHJcbn1cclxuXHJcbmRlY2xhcmUgY2xhc3MgTWVkaWFSZWNvcmRlclxyXG57XHJcbiAgICBjb25zdHJ1Y3RvcihzdHJlYW06IE1lZGlhU3RyZWFtLCBvcHRpb25zPzogTWVkaWFSZWNvcmRlck9wdGlvbnMpO1xyXG4gICAgc3RhcnQodGltZXNsaWNlPzogbnVtYmVyKSA6IHZvaWQ7XHJcbiAgICBzdG9wKCkgOiB2b2lkO1xyXG4gICAgb25kYXRhYXZhaWxhYmxlIDogKCh0aGlzOiBNZWRpYVJlY29yZGVyLCBldjogQmxvYkV2ZW50KSA9PiBhbnkpIHwgbnVsbDtcclxuICAgIG9uc3RvcCA6ICgodGhpczogTWVkaWFSZWNvcmRlciwgZXY6IEV2ZW50KSA9PiBhbnkpIHwgbnVsbDtcclxufVxyXG5cclxuaW50ZXJmYWNlIE1lZGlhUmVjb3JkZXJPcHRpb25zXHJcbntcclxuICAgIG1pbWVUeXBlPyA6IHN0cmluZztcclxuICAgIGF1ZGlvQml0c1BlclNlY29uZD8gOiBudW1iZXI7XHJcbiAgICB2aWRlb0JpdHNQZXJTZWNvbmQ/IDogbnVtYmVyO1xyXG4gICAgYml0c1BlclNlY29uZD8gOiBudW1iZXI7XHJcbn1cclxuXHJcbmRlY2xhcmUgY2xhc3MgQmxvYkV2ZW50IGV4dGVuZHMgRXZlbnRcclxue1xyXG4gICAgcmVhZG9ubHkgZGF0YSAgICAgOiBCbG9iO1xyXG4gICAgcmVhZG9ubHkgdGltZWNvZGUgOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBdWRpb0NvbnRleHRCYXNlXHJcbntcclxuICAgIGF1ZGlvV29ya2xldCA6IEF1ZGlvV29ya2xldDtcclxufVxyXG5cclxudHlwZSBTYW1wbGVDaGFubmVscyA9IEZsb2F0MzJBcnJheVtdW107XHJcblxyXG5kZWNsYXJlIGNsYXNzIEF1ZGlvV29ya2xldFByb2Nlc3NvclxyXG57XHJcbiAgICBzdGF0aWMgcGFyYW1ldGVyRGVzY3JpcHRvcnMgOiBBdWRpb1BhcmFtRGVzY3JpcHRvcltdO1xyXG5cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3RvcihvcHRpb25zPzogQXVkaW9Xb3JrbGV0Tm9kZU9wdGlvbnMpO1xyXG4gICAgcmVhZG9ubHkgcG9ydD86IE1lc3NhZ2VQb3J0O1xyXG5cclxuICAgIHByb2Nlc3MoXHJcbiAgICAgICAgaW5wdXRzOiBTYW1wbGVDaGFubmVscyxcclxuICAgICAgICBvdXRwdXRzOiBTYW1wbGVDaGFubmVscyxcclxuICAgICAgICBwYXJhbWV0ZXJzOiBEaWN0aW9uYXJ5PEZsb2F0MzJBcnJheT5cclxuICAgICkgOiBib29sZWFuO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXVkaW9Xb3JrbGV0Tm9kZU9wdGlvbnMgZXh0ZW5kcyBBdWRpb05vZGVPcHRpb25zXHJcbntcclxuICAgIG51bWJlck9mSW5wdXRzPyA6IG51bWJlcjtcclxuICAgIG51bWJlck9mT3V0cHV0cz8gOiBudW1iZXI7XHJcbiAgICBvdXRwdXRDaGFubmVsQ291bnQ/IDogbnVtYmVyW107XHJcbiAgICBwYXJhbWV0ZXJEYXRhPyA6IHtbaW5kZXg6IHN0cmluZ10gOiBudW1iZXJ9O1xyXG4gICAgcHJvY2Vzc29yT3B0aW9ucz8gOiBhbnk7XHJcbn1cclxuXHJcbmludGVyZmFjZSBNZWRpYVRyYWNrQ29uc3RyYWludFNldFxyXG57XHJcbiAgICBhdXRvR2FpbkNvbnRyb2w/OiBib29sZWFuIHwgQ29uc3RyYWluQm9vbGVhblBhcmFtZXRlcnM7XHJcbiAgICBub2lzZVN1cHByZXNzaW9uPzogYm9vbGVhbiB8IENvbnN0cmFpbkJvb2xlYW5QYXJhbWV0ZXJzO1xyXG59XHJcblxyXG5kZWNsYXJlIGZ1bmN0aW9uIHJlZ2lzdGVyUHJvY2Vzc29yKG5hbWU6IHN0cmluZywgY3RvcjogQXVkaW9Xb3JrbGV0UHJvY2Vzc29yKSA6IHZvaWQ7IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogSG9sZHMgcnVudGltZSBjb25maWd1cmF0aW9uICovXHJcbmNsYXNzIENvbmZpZ1xyXG57XHJcbiAgICAvKiogVm9sdW1lIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgIHNwZWVjaFZvbCAgICAgIDogbnVtYmVyID0gMS4wO1xyXG4gICAgLyoqIFBpdGNoIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgIHNwZWVjaFBpdGNoICAgIDogbnVtYmVyID0gMS4wO1xyXG4gICAgLyoqIFJhdGUgZm9yIHNwZWVjaCB0byBiZSBzZXQgYXQgKi9cclxuICAgIHB1YmxpYyAgc3BlZWNoUmF0ZSAgICAgOiBudW1iZXIgPSAxLjA7XHJcbiAgICAvKiogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UsIGFzIGdldFZvaWNlcyBpbmRleCBvciAtMSBpZiB1bnNldCAqL1xyXG4gICAgcHJpdmF0ZSBfc3BlZWNoVm9pY2UgICA6IG51bWJlciA9IC0xO1xyXG4gICAgLyoqIElmIHVzZXIgaGFzIGNsaWNrZWQgc2h1ZmZsZSBhdCBsZWFzdCBvbmNlICovXHJcbiAgICBwdWJsaWMgY2xpY2tlZEdlbmVyYXRlIDogYm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UsIGFzIGdldFZvaWNlcyBpbmRleC4gQmVjYXVzZSBvZiB0aGUgYXN5bmMgbmF0dXJlIG9mXHJcbiAgICAgKiBnZXRWb2ljZXMsIHRoZSBkZWZhdWx0IHZhbHVlIHdpbGwgYmUgZmV0Y2hlZCBmcm9tIGl0IGVhY2ggdGltZS5cclxuICAgICAqL1xyXG4gICAgZ2V0IHNwZWVjaFZvaWNlKCkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICAvLyBUT0RPOiB0aGlzIGlzIHByb2JhYmx5IGJldHRlciBvZmYgdXNpbmcgdm9pY2UgbmFtZXNcclxuICAgICAgICAvLyBJZiB0aGVyZSdzIGEgdXNlci1kZWZpbmVkIHZhbHVlLCB1c2UgdGhhdFxyXG4gICAgICAgIGlmICAodGhpcy5fc3BlZWNoVm9pY2UgIT09IC0xKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3BlZWNoVm9pY2U7XHJcblxyXG4gICAgICAgIC8vIFNlbGVjdCBFbmdsaXNoIHZvaWNlcyBieSBkZWZhdWx0XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIHYgPSBSQUcuc3BlZWNoLmdldFZvaWNlcygpOyBpIDwgdi5sZW5ndGggOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFuZyA9IHZbaV0ubGFuZztcclxuXHJcbiAgICAgICAgICAgIGlmIChsYW5nID09PSAnZW4tR0InIHx8IGxhbmcgPT09ICdlbi1VUycpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEVsc2UsIGZpcnN0IHZvaWNlIG9uIHRoZSBsaXN0XHJcbiAgICAgICAgcmV0dXJuIDA7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGNob2ljZSBvZiBzcGVlY2ggdG8gdXNlLCBhcyBnZXRWb2ljZXMgaW5kZXggKi9cclxuICAgIHNldCBzcGVlY2hWb2ljZSh2YWx1ZTogbnVtYmVyKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3NwZWVjaFZvaWNlID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBsb2FkcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gZnJvbSBsb2NhbFN0b3JhZ2UsIGlmIGFueSAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGxvYWQ6IGJvb2xlYW4pXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHNldHRpbmdzID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdzZXR0aW5ncycpO1xyXG5cclxuICAgICAgICBpZiAoIWxvYWQgfHwgIXNldHRpbmdzKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGNvbmZpZyA9IEpTT04ucGFyc2Uoc2V0dGluZ3MpO1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIGNvbmZpZyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX0xPQURfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgc2F2ZXMgcnVudGltZSBjb25maWd1cmF0aW9uIHRvIGxvY2FsU3RvcmFnZSAqL1xyXG4gICAgcHVibGljIHNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSggJ3NldHRpbmdzJywgSlNPTi5zdHJpbmdpZnkodGhpcykgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfU0FWRV9GQUlMKGUubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBkZWxldGVzIHJ1bnRpbWUgY29uZmlndXJhdGlvbiBmcm9tIGxvY2FsU3RvcmFnZSBhbmQgcmVzZXRzIHN0YXRlICovXHJcbiAgICBwdWJsaWMgcmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oIHRoaXMsIG5ldyBDb25maWcoZmFsc2UpICk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnc2V0dGluZ3MnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfUkVTRVRfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBkYXRhIGZvciBleGN1c2VzLCB0cmFpbnMsIHNlcnZpY2VzIGFuZCBzdGF0aW9ucyAqL1xyXG5jbGFzcyBEYXRhYmFzZVxyXG57XHJcbiAgICAvKiogTG9hZGVkIGRhdGFzZXQgb2YgZGVsYXkgb3IgY2FuY2VsbGF0aW9uIGV4Y3VzZXMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZXhjdXNlcyAgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIG5hbWVkIHRyYWlucyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBuYW1lZCAgICAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRhdGFzZXQgb2Ygc2VydmljZSBvciBuZXR3b3JrIG5hbWVzICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHNlcnZpY2VzICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGljdGlvbmFyeSBvZiBzdGF0aW9uIG5hbWVzLCB3aXRoIHRocmVlLWxldHRlciBjb2RlIGtleXMgKGUuZy4gQUJDKSAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzdGF0aW9ucyAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+O1xyXG4gICAgLyoqIExvYWRlZCBYTUwgZG9jdW1lbnQgY29udGFpbmluZyBwaHJhc2VzZXQgZGF0YSAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBwaHJhc2VzZXRzICAgIDogRG9jdW1lbnQ7XHJcbiAgICAvKiogQW1vdW50IG9mIHN0YXRpb25zIGluIHRoZSBjdXJyZW50bHkgbG9hZGVkIGRhdGFzZXQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc3RhdGlvbnNDb3VudCA6IG51bWJlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoZGF0YVJlZnM6IERhdGFSZWZzKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBxdWVyeSAgPSBkYXRhUmVmcy5waHJhc2VzZXRFbWJlZDtcclxuICAgICAgICBsZXQgaWZyYW1lID0gRE9NLnJlcXVpcmUgPEhUTUxJRnJhbWVFbGVtZW50PiAocXVlcnkpO1xyXG5cclxuICAgICAgICBpZiAoIWlmcmFtZS5jb250ZW50RG9jdW1lbnQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX0VMRU1FTlRfTk9UX1BIUkFTRVNFVF9JRlJBTUUocXVlcnkpICk7XHJcblxyXG4gICAgICAgIHRoaXMucGhyYXNlc2V0cyAgICA9IGlmcmFtZS5jb250ZW50RG9jdW1lbnQ7XHJcbiAgICAgICAgdGhpcy5leGN1c2VzICAgICAgID0gZGF0YVJlZnMuZXhjdXNlc0RhdGE7XHJcbiAgICAgICAgdGhpcy5uYW1lZCAgICAgICAgID0gZGF0YVJlZnMubmFtZWREYXRhO1xyXG4gICAgICAgIHRoaXMuc2VydmljZXMgICAgICA9IGRhdGFSZWZzLnNlcnZpY2VzRGF0YTtcclxuICAgICAgICB0aGlzLnN0YXRpb25zICAgICAgPSBkYXRhUmVmcy5zdGF0aW9uc0RhdGE7XHJcbiAgICAgICAgdGhpcy5zdGF0aW9uc0NvdW50ID0gT2JqZWN0LmtleXModGhpcy5zdGF0aW9ucykubGVuZ3RoO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygnW0RhdGFiYXNlXSBFbnRyaWVzIGxvYWRlZDonKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0RXhjdXNlczonLCAgICAgIHRoaXMuZXhjdXNlcy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHROYW1lZCB0cmFpbnM6JywgdGhpcy5uYW1lZC5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRTZXJ2aWNlczonLCAgICAgdGhpcy5zZXJ2aWNlcy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRTdGF0aW9uczonLCAgICAgdGhpcy5zdGF0aW9uc0NvdW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gZXhjdXNlIGZvciBhIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiAqL1xyXG4gICAgcHVibGljIHBpY2tFeGN1c2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5leGN1c2VzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBwaWNrTmFtZWQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5uYW1lZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgYW5kIGdldHMgcGhyYXNlIHdpdGggdGhlIGdpdmVuIElELCBvciBudWxsIGlmIGl0IGRvZXNuJ3QgZXhpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkIElEIG9mIHRoZSBwaHJhc2UgdG8gZ2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2UoaWQ6IHN0cmluZykgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gdGhpcy5waHJhc2VzZXRzLnF1ZXJ5U2VsZWN0b3IoJ3BocmFzZSMnICsgaWQpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAocmVzdWx0KVxyXG4gICAgICAgICAgICByZXN1bHQgPSByZXN1bHQuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhIHBocmFzZXNldCB3aXRoIHRoZSBnaXZlbiBJRCwgb3IgbnVsbCBpZiBpdCBkb2Vzbid0IGV4aXN0LiBOb3RlIHRoYXQgdGhlXHJcbiAgICAgKiByZXR1cm5lZCBwaHJhc2VzZXQgY29tZXMgZnJvbSB0aGUgWE1MIGRvY3VtZW50LCBzbyBpdCBzaG91bGQgbm90IGJlIG11dGF0ZWQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkIElEIG9mIHRoZSBwaHJhc2VzZXQgdG8gZ2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2VzZXQoaWQ6IHN0cmluZykgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5waHJhc2VzZXRzLnF1ZXJ5U2VsZWN0b3IoJ3BocmFzZXNldCMnICsgaWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSByYWlsIG5ldHdvcmsgbmFtZSAqL1xyXG4gICAgcHVibGljIHBpY2tTZXJ2aWNlKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmFycmF5KHRoaXMuc2VydmljZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gc3RhdGlvbiBjb2RlIGZyb20gdGhlIGRhdGFzZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGUgTGlzdCBvZiBjb2RlcyB0byBleGNsdWRlLiBNYXkgYmUgaWdub3JlZCBpZiBzZWFyY2ggdGFrZXMgdG9vIGxvbmcuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBwaWNrU3RhdGlvbkNvZGUoZXhjbHVkZT86IHN0cmluZ1tdKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIC8vIEdpdmUgdXAgZmluZGluZyByYW5kb20gc3RhdGlvbiB0aGF0J3Mgbm90IGluIHRoZSBnaXZlbiBsaXN0LCBpZiB3ZSB0cnkgbW9yZVxyXG4gICAgICAgIC8vIHRpbWVzIHRoZW4gdGhlcmUgYXJlIHN0YXRpb25zLiBJbmFjY3VyYXRlLCBidXQgYXZvaWRzIGluZmluaXRlIGxvb3BzLlxyXG4gICAgICAgIGlmIChleGNsdWRlKSBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc3RhdGlvbnNDb3VudDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHZhbHVlID0gUmFuZG9tLm9iamVjdEtleSh0aGlzLnN0YXRpb25zKTtcclxuXHJcbiAgICAgICAgICAgIGlmICggIWV4Y2x1ZGUuaW5jbHVkZXModmFsdWUpIClcclxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgc3RhdGlvbiBuYW1lIGZyb20gdGhlIGdpdmVuIHRocmVlIGxldHRlciBjb2RlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gZ2V0IHRoZSBuYW1lIG9mXHJcbiAgICAgKiBAcGFyYW0gZmlsdGVyZWQgV2hldGhlciB0byBmaWx0ZXIgb3V0IHBhcmVudGhlc2l6ZWQgbG9jYXRpb24gY29udGV4dFxyXG4gICAgICogQHJldHVybnMgU3RhdGlvbiBuYW1lIGZvciB0aGUgZ2l2ZW4gY29kZSwgZmlsdGVyZWQgaWYgc3BlY2lmaWVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uKGNvZGU6IHN0cmluZywgZmlsdGVyZWQ6IGJvb2xlYW4gPSBmYWxzZSkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IHRoaXMuc3RhdGlvbnNbY29kZV07XHJcblxyXG4gICAgICAgIGlmICAgICAgKCFzdGF0aW9uKVxyXG4gICAgICAgICAgICByZXR1cm4gTC5EQl9VTktOT1dOX1NUQVRJT04oY29kZSk7XHJcbiAgICAgICAgZWxzZSBpZiAoIFN0cmluZ3MuaXNOdWxsT3JFbXB0eShzdGF0aW9uKSApXHJcbiAgICAgICAgICAgIHJldHVybiBMLkRCX0VNUFRZX1NUQVRJT04oY29kZSk7XHJcblxyXG4gICAgICAgIGlmIChmaWx0ZXJlZClcclxuICAgICAgICAgICAgc3RhdGlvbiA9IHN0YXRpb24ucmVwbGFjZSgvXFwoLitcXCkvaSwgJycpLnRyaW0oKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHN0YXRpb247XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSByYW5nZSBvZiBzdGF0aW9uIGNvZGVzLCBlbnN1cmluZyB0aGVyZSBhcmUgbm8gZHVwbGljYXRlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gYW1vdW50IG9mIHN0YXRpb25zIHRvIHBpY2tcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBhbW91bnQgb2Ygc3RhdGlvbnMgdG8gcGlja1xyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGVcclxuICAgICAqIEByZXR1cm5zIEEgbGlzdCBvZiB1bmlxdWUgc3RhdGlvbiBuYW1lc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcGlja1N0YXRpb25Db2RlcyhtaW4gPSAxLCBtYXggPSAxNiwgZXhjbHVkZT8gOiBzdHJpbmdbXSkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChtYXggLSBtaW4gPiBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX1RPT19NQU5ZX1NUQVRJT05TKCkgKTtcclxuXHJcbiAgICAgICAgbGV0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICAgICAgbGV0IGxlbmd0aCA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIGxldCB0cmllcyAgPSAwO1xyXG5cclxuICAgICAgICB3aGlsZSAocmVzdWx0Lmxlbmd0aCA8IGxlbmd0aClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgLy8gR2l2ZSB1cCB0cnlpbmcgdG8gYXZvaWQgZHVwbGljYXRlcywgaWYgd2UgdHJ5IG1vcmUgdGltZXMgdGhhbiB0aGVyZSBhcmVcclxuICAgICAgICAgICAgLy8gc3RhdGlvbnMgYXZhaWxhYmxlLiBJbmFjY3VyYXRlLCBidXQgZ29vZCBlbm91Z2guXHJcbiAgICAgICAgICAgIGlmICh0cmllcysrID49IHRoaXMuc3RhdGlvbnNDb3VudClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBnaXZlbiBhbiBleGNsdXNpb24gbGlzdCwgY2hlY2sgYWdhaW5zdCBib3RoIHRoYXQgYW5kIHJlc3VsdHNcclxuICAgICAgICAgICAgZWxzZSBpZiAoIGV4Y2x1ZGUgJiYgIWV4Y2x1ZGUuaW5jbHVkZXMoa2V5KSAmJiAhcmVzdWx0LmluY2x1ZGVzKGtleSkgKVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIG5vdCwganVzdCBjaGVjayB3aGF0IHJlc3VsdHMgd2UndmUgYWxyZWFkeSBmb3VuZFxyXG4gICAgICAgICAgICBlbHNlIGlmICggIWV4Y2x1ZGUgJiYgIXJlc3VsdC5pbmNsdWRlcyhrZXkpIClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFpbiBjbGFzcyBvZiB0aGUgZW50aXJlIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IgYXBwbGljYXRpb24gKi9cclxuY2xhc3MgUkFHXHJcbntcclxuICAgIC8qKiBHZXRzIHRoZSBjb25maWd1cmF0aW9uIGhvbGRlciAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb25maWcgICA6IENvbmZpZztcclxuICAgIC8qKiBHZXRzIHRoZSBkYXRhYmFzZSBtYW5hZ2VyLCB3aGljaCBob2xkcyBwaHJhc2UsIHN0YXRpb24gYW5kIHRyYWluIGRhdGEgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZGF0YWJhc2UgOiBEYXRhYmFzZTtcclxuICAgIC8qKiBHZXRzIHRoZSBwaHJhc2UgbWFuYWdlciwgd2hpY2ggZ2VuZXJhdGVzIEhUTUwgcGhyYXNlcyBmcm9tIFhNTCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VyICA6IFBocmFzZXI7XHJcbiAgICAvKiogR2V0cyB0aGUgc3BlZWNoIGVuZ2luZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzcGVlY2ggICA6IFNwZWVjaDtcclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHRyYWluIGFuZCBzdGF0aW9uIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRlICAgIDogU3RhdGU7XHJcbiAgICAvKiogR2V0cyB0aGUgdmlldyBjb250cm9sbGVyLCB3aGljaCBtYW5hZ2VzIFVJIGludGVyYWN0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZpZXdzICAgIDogVmlld3M7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFbnRyeSBwb2ludCBmb3IgUkFHLCB0byBiZSBjYWxsZWQgZnJvbSBKYXZhc2NyaXB0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBkYXRhUmVmcyBDb25maWd1cmF0aW9uIG9iamVjdCwgd2l0aCByYWlsIGRhdGEgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbWFpbihkYXRhUmVmczogRGF0YVJlZnMpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5vbmVycm9yICAgICAgICAgICAgICA9IGVycm9yID0+IFJBRy5wYW5pYyhlcnJvcik7XHJcbiAgICAgICAgd2luZG93Lm9udW5oYW5kbGVkcmVqZWN0aW9uID0gZXJyb3IgPT4gUkFHLnBhbmljKGVycm9yKTtcclxuXHJcbiAgICAgICAgSTE4bi5pbml0KCk7XHJcblxyXG4gICAgICAgIFJBRy5jb25maWcgICA9IG5ldyBDb25maWcodHJ1ZSk7XHJcbiAgICAgICAgUkFHLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlKGRhdGFSZWZzKTtcclxuICAgICAgICBSQUcudmlld3MgICAgPSBuZXcgVmlld3MoKTtcclxuICAgICAgICBSQUcucGhyYXNlciAgPSBuZXcgUGhyYXNlcigpO1xyXG4gICAgICAgIFJBRy5zcGVlY2ggICA9IG5ldyBTcGVlY2goKTtcclxuXHJcbiAgICAgICAgLy8gQmVnaW5cclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLldFTENPTUUoKSApO1xyXG4gICAgICAgIFJBRy5nZW5lcmF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZW5lcmF0ZXMgYSBuZXcgcmFuZG9tIHBocmFzZSBhbmQgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2VuZXJhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUgPSBuZXcgU3RhdGUoKTtcclxuICAgICAgICBSQUcuc3RhdGUuZ2VuRGVmYXVsdFN0YXRlKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5nZW5lcmF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBMb2FkcyBzdGF0ZSBmcm9tIGdpdmVuIEpTT04gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbG9hZChqc29uOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZSA9IE9iamVjdC5hc3NpZ24oIG5ldyBTdGF0ZSgpLCBKU09OLnBhcnNlKGpzb24pICkgYXMgU3RhdGU7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5nZW5lcmF0ZSgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9GUk9NX1NUT1JBR0UoKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHbG9iYWwgZXJyb3IgaGFuZGxlcjsgdGhyb3dzIHVwIGEgYmlnIHJlZCBwYW5pYyBzY3JlZW4gb24gdW5jYXVnaHQgZXJyb3IgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHBhbmljKGVycm9yOiBzdHJpbmcgfCBFdmVudCA9IFwiVW5rbm93biBlcnJvclwiKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBtc2cgPSAnPGRpdiBpZD1cInBhbmljU2NyZWVuXCIgY2xhc3M9XCJ3YXJuaW5nU2NyZWVuXCI+JztcclxuICAgICAgICBtc2cgICAgKz0gJzxoMT5cIldlIGFyZSBzb3JyeSB0byBhbm5vdW5jZSB0aGF0Li4uXCI8L2gxPic7XHJcbiAgICAgICAgbXNnICAgICs9IGA8cD5SQUcgaGFzIGNyYXNoZWQgYmVjYXVzZTogPGNvZGU+JHtlcnJvcn08L2NvZGU+LjwvcD5gO1xyXG4gICAgICAgIG1zZyAgICArPSBgPHA+UGxlYXNlIG9wZW4gdGhlIGNvbnNvbGUgZm9yIG1vcmUgaW5mb3JtYXRpb24uPC9wPmA7XHJcbiAgICAgICAgbXNnICAgICs9ICc8L2Rpdj4nO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5ib2R5LmlubmVySFRNTCA9IG1zZztcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIERpc3Bvc2FibGUgY2xhc3MgdGhhdCBob2xkcyBzdGF0ZSBmb3IgdGhlIGN1cnJlbnQgc2NoZWR1bGUsIHRyYWluLCBldGMuICovXHJcbmNsYXNzIFN0YXRlXHJcbntcclxuICAgIC8qKiBTdGF0ZSBvZiBjb2xsYXBzaWJsZSBlbGVtZW50cy4gS2V5IGlzIHJlZmVyZW5jZSBJRCwgdmFsdWUgaXMgY29sbGFwc2VkLiAqL1xyXG4gICAgcHJpdmF0ZSBfY29sbGFwc2libGVzIDogRGljdGlvbmFyeTxib29sZWFuPiAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IGNvYWNoIGxldHRlciBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgbGV0dGVyLiAqL1xyXG4gICAgcHJpdmF0ZSBfY29hY2hlcyAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IGludGVnZXIgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGludGVnZXIuICovXHJcbiAgICBwcml2YXRlIF9pbnRlZ2VycyAgICAgOiBEaWN0aW9uYXJ5PG51bWJlcj4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgcGhyYXNlc2V0IHBocmFzZSBjaG9pY2VzLiBLZXkgaXMgcmVmZXJlbmNlIElELCB2YWx1ZSBpcyBpbmRleC4gKi9cclxuICAgIHByaXZhdGUgX3BocmFzZXNldHMgICA6IERpY3Rpb25hcnk8bnVtYmVyPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzZXJ2aWNlIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBzZXJ2aWNlLiAqL1xyXG4gICAgcHJpdmF0ZSBfc2VydmljZXMgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHN0YXRpb24gY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIHN0YXRpb24gY29kZS4gKi9cclxuICAgIHByaXZhdGUgX3N0YXRpb25zICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzdGF0aW9uIGxpc3QgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGFycmF5IG9mIGNvZGVzLiAqL1xyXG4gICAgcHJpdmF0ZSBfc3RhdGlvbkxpc3RzIDogRGljdGlvbmFyeTxzdHJpbmdbXT4gPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHRpbWUgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIHRpbWUuICovXHJcbiAgICBwcml2YXRlIF90aW1lcyAgICAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG5cclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIGV4Y3VzZSAqL1xyXG4gICAgcHJpdmF0ZSBfZXhjdXNlPyAgIDogc3RyaW5nO1xyXG4gICAgLyoqIEN1cnJlbnRseSBjaG9zZW4gcGxhdGZvcm0gKi9cclxuICAgIHByaXZhdGUgX3BsYXRmb3JtPyA6IFBsYXRmb3JtO1xyXG4gICAgLyoqIEN1cnJlbnRseSBjaG9zZW4gbmFtZWQgdHJhaW4gKi9cclxuICAgIHByaXZhdGUgX25hbWVkPyAgICA6IHN0cmluZztcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gY29hY2ggbGV0dGVyLCBvciByYW5kb21seSBwaWNrcyBvbmUgZnJvbSBBIHRvIFouXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBsZXR0ZXIgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRDb2FjaChjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2NvYWNoZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NvYWNoZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX2NvYWNoZXNbY29udGV4dF0gPSBSYW5kb20uYXJyYXkoTC5MRVRURVJTKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fY29hY2hlc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBjb2FjaCBsZXR0ZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIGxldHRlciBmb3JcclxuICAgICAqIEBwYXJhbSBjb2FjaCBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldENvYWNoKGNvbnRleHQ6IHN0cmluZywgY29hY2g6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fY29hY2hlc1tjb250ZXh0XSA9IGNvYWNoO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY29sbGFwc2Ugc3RhdGUgb2YgYSBjb2xsYXBzaWJsZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSByZWYgUmVmZXJlbmNlIElEIHRvIGdldCB0aGUgY29sbGFwc2libGUgc3RhdGUgb2ZcclxuICAgICAqIEBwYXJhbSBjaGFuY2UgQ2hhbmNlIGJldHdlZW4gMCBhbmQgMTAwIG9mIGNob29zaW5nIHRydWUsIGlmIHVuc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRDb2xsYXBzZWQocmVmOiBzdHJpbmcsIGNoYW5jZTogbnVtYmVyKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fY29sbGFwc2libGVzW3JlZl0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdO1xyXG5cclxuICAgICAgICB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXSA9ICFSYW5kb20uYm9vbChjaGFuY2UpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBjb2xsYXBzaWJsZSdzIHN0YXRlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSByZWYgUmVmZXJlbmNlIElEIHRvIHNldCB0aGUgY29sbGFwc2libGUgc3RhdGUgb2ZcclxuICAgICAqIEBwYXJhbSBzdGF0ZSBWYWx1ZSB0byBzZXQsIHdoZXJlIHRydWUgaXMgXCJjb2xsYXBzZWRcIlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0Q29sbGFwc2VkKHJlZjogc3RyaW5nLCBzdGF0ZTogYm9vbGVhbikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fY29sbGFwc2libGVzW3JlZl0gPSBzdGF0ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gaW50ZWdlciwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgaW50ZWdlciBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldEludGVnZXIoY29udGV4dDogc3RyaW5nKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faW50ZWdlcnNbY29udGV4dF07XHJcblxyXG4gICAgICAgIGxldCBtaW4gPSAwLCBtYXggPSAwO1xyXG5cclxuICAgICAgICBzd2l0Y2goY29udGV4dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJjb2FjaGVzXCI6ICAgICAgIG1pbiA9IDE7IG1heCA9IDEwOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImRlbGF5ZWRcIjogICAgICAgbWluID0gNTsgbWF4ID0gNjA7IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZnJvbnRfY29hY2hlc1wiOiBtaW4gPSAyOyBtYXggPSA1OyAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJyZWFyX2NvYWNoZXNcIjogIG1pbiA9IDI7IG1heCA9IDU7ICBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdID0gUmFuZG9tLmludChtaW4sIG1heCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhbiBpbnRlZ2VyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBpbnRlZ2VyIGZvclxyXG4gICAgICogQHBhcmFtIHZhbHVlIFZhbHVlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0SW50ZWdlcihjb250ZXh0OiBzdHJpbmcsIHZhbHVlOiBudW1iZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHBocmFzZSBvZiBhIHBocmFzZXNldCwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSByZWYgUmVmZXJlbmNlIElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHBocmFzZXNldCdzIHBocmFzZSBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlc2V0SWR4KHJlZjogc3RyaW5nKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9waHJhc2VzZXRzW3JlZl0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BocmFzZXNldHNbcmVmXTtcclxuXHJcbiAgICAgICAgbGV0IHBocmFzZXNldCA9IFJBRy5kYXRhYmFzZS5nZXRQaHJhc2VzZXQocmVmKTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogaXMgdGhpcyBzYWZlIGFjcm9zcyBwaHJhc2VzZXQgY2hhbmdlcz9cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuU1RBVEVfTk9ORVhJU1RBTlRfUEhSQVNFU0VUKHJlZikgKTtcclxuXHJcbiAgICAgICAgdGhpcy5fcGhyYXNlc2V0c1tyZWZdID0gUmFuZG9tLmludCgwLCBwaHJhc2VzZXQuY2hpbGRyZW4ubGVuZ3RoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGhyYXNlc2V0c1tyZWZdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB0aGUgY2hvc2VuIGluZGV4IGZvciBhIHBocmFzZXNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBzZXQgdGhlIHBocmFzZXNldCBpbmRleCBvZlxyXG4gICAgICogQHBhcmFtIGlkeCBJbmRleCB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFBocmFzZXNldElkeChyZWY6IHN0cmluZywgaWR4OiBudW1iZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BocmFzZXNldHNbcmVmXSA9IGlkeDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gc2VydmljZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc2VydmljZSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFNlcnZpY2UoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2VydmljZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTZXJ2aWNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHNlcnZpY2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHNlcnZpY2UgZm9yXHJcbiAgICAgKiBAcGFyYW0gc2VydmljZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFNlcnZpY2UoY29udGV4dDogc3RyaW5nLCBzZXJ2aWNlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdID0gc2VydmljZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gc3RhdGlvbiBjb2RlLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBzdGF0aW9uIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbihjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3N0YXRpb25zW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbnNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHN0YXRpb24gY29kZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgc3RhdGlvbiBjb2RlIGZvclxyXG4gICAgICogQHBhcmFtIGNvZGUgU3RhdGlvbiBjb2RlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0U3RhdGlvbihjb250ZXh0OiBzdHJpbmcsIGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbnNbY29udGV4dF0gPSBjb2RlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBsaXN0IG9mIHN0YXRpb24gY29kZXMsIG9yIHJhbmRvbWx5IGdlbmVyYXRlcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBzdGF0aW9uIGxpc3QgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uTGlzdChjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF07XHJcbiAgICAgICAgZWxzZSBpZiAoY29udGV4dCA9PT0gJ2NhbGxpbmdfZmlyc3QnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRTdGF0aW9uTGlzdCgnY2FsbGluZycpO1xyXG5cclxuICAgICAgICBsZXQgbWluID0gMSwgbWF4ID0gMTY7XHJcblxyXG4gICAgICAgIHN3aXRjaChjb250ZXh0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2FzZSAnY2FsbGluZ19zcGxpdCc6IG1pbiA9IDI7IG1heCA9IDE2OyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnY2hhbmdlcyc6ICAgICAgIG1pbiA9IDE7IG1heCA9IDQ7ICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnbm90X3N0b3BwaW5nJzogIG1pbiA9IDE7IG1heCA9IDg7ICBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKG1pbiwgbWF4KTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGxpc3Qgb2Ygc3RhdGlvbiBjb2Rlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgc3RhdGlvbiBjb2RlIGxpc3QgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29kZXMgU3RhdGlvbiBjb2RlcyB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFN0YXRpb25MaXN0KGNvbnRleHQ6IHN0cmluZywgY29kZXM6IHN0cmluZ1tdKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gPSBjb2RlcztcclxuXHJcbiAgICAgICAgaWYgKGNvbnRleHQgPT09ICdjYWxsaW5nX2ZpcnN0JylcclxuICAgICAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzWydjYWxsaW5nJ10gPSBjb2RlcztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gdGltZVxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgdGltZSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFRpbWUoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl90aW1lc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fdGltZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3RpbWVzW2NvbnRleHRdID0gU3RyaW5ncy5mcm9tVGltZSggUmFuZG9tLmludCgwLCAyMyksIFJhbmRvbS5pbnQoMCwgNTkpICk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3RpbWVzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHRpbWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHRpbWUgZm9yXHJcbiAgICAgKiBAcGFyYW0gdGltZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFRpbWUoY29udGV4dDogc3RyaW5nLCB0aW1lOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3RpbWVzW2NvbnRleHRdID0gdGltZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIGV4Y3VzZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IGV4Y3VzZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2V4Y3VzZSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2V4Y3VzZTtcclxuXHJcbiAgICAgICAgdGhpcy5fZXhjdXNlID0gUkFHLmRhdGFiYXNlLnBpY2tFeGN1c2UoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fZXhjdXNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IGV4Y3VzZSAqL1xyXG4gICAgcHVibGljIHNldCBleGN1c2UodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9leGN1c2UgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIHBsYXRmb3JtLCBvciByYW5kb21seSBwaWNrcyBvbmUgKi9cclxuICAgIHB1YmxpYyBnZXQgcGxhdGZvcm0oKSA6IFBsYXRmb3JtXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3BsYXRmb3JtKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcblxyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA6IFBsYXRmb3JtID0gWycnLCAnJ107XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMiUgY2hhbmNlIGZvciBwbGF0Zm9ybSAwLCBzaW5jZSBpdCdzIHJhcmVcclxuICAgICAgICBwbGF0Zm9ybVswXSA9IFJhbmRvbS5ib29sKDk4KVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5pbnQoMSwgMjYpLnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiAnMCc7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMTAlIGNoYW5jZSBmb3IgcGxhdGZvcm0gbGV0dGVyLCBzaW5jZSBpdCdzIHVuY29tbW9uXHJcbiAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgxMClcclxuICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoJ0FCQycpXHJcbiAgICAgICAgICAgIDogJyc7XHJcblxyXG4gICAgICAgIHRoaXMuX3BsYXRmb3JtID0gcGxhdGZvcm07XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXRmb3JtO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IHBsYXRmb3JtICovXHJcbiAgICBwdWJsaWMgc2V0IHBsYXRmb3JtKHZhbHVlOiBQbGF0Zm9ybSlcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9wbGF0Zm9ybSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjaG9zZW4gbmFtZWQgdHJhaW4sIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSAqL1xyXG4gICAgcHVibGljIGdldCBuYW1lZCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX25hbWVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fbmFtZWQ7XHJcblxyXG4gICAgICAgIHRoaXMuX25hbWVkID0gUkFHLmRhdGFiYXNlLnBpY2tOYW1lZCgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9uYW1lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHNldCBuYW1lZCh2YWx1ZTogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX25hbWVkID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHVwIHRoZSBzdGF0ZSBpbiBhIHBhcnRpY3VsYXIgd2F5LCBzbyB0aGF0IGl0IG1ha2VzIHNvbWUgcmVhbC13b3JsZCBzZW5zZS5cclxuICAgICAqIFRvIGRvIHNvLCB3ZSBoYXZlIHRvIGdlbmVyYXRlIGRhdGEgaW4gYSBwYXJ0aWN1bGFyIG9yZGVyLCBhbmQgbWFrZSBzdXJlIHRvIGF2b2lkXHJcbiAgICAgKiBkdXBsaWNhdGVzIGluIGluYXBwcm9wcmlhdGUgcGxhY2VzIGFuZCBjb250ZXh0cy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGdlbkRlZmF1bHRTdGF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFN0ZXAgMS4gUHJlcG9wdWxhdGUgc3RhdGlvbiBsaXN0c1xyXG5cclxuICAgICAgICBsZXQgc2xDYWxsaW5nICAgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygxLCAxNik7XHJcbiAgICAgICAgbGV0IHNsQ2FsbFNwbGl0ID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMiwgMTYsIHNsQ2FsbGluZyk7XHJcbiAgICAgICAgbGV0IGFsbENhbGxpbmcgID0gWy4uLnNsQ2FsbGluZywgLi4uc2xDYWxsU3BsaXRdO1xyXG5cclxuICAgICAgICAvLyBMaXN0IG9mIG90aGVyIHN0YXRpb25zIGZvdW5kIHZpYSBhIHNwZWNpZmljIGNhbGxpbmcgcG9pbnRcclxuICAgICAgICBsZXQgc2xDaGFuZ2VzICAgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDQsIGFsbENhbGxpbmcpO1xyXG4gICAgICAgIC8vIExpc3Qgb2Ygb3RoZXIgc3RhdGlvbnMgdGhhdCB0aGlzIHRyYWluIHVzdWFsbHkgc2VydmVzLCBidXQgY3VycmVudGx5IGlzbid0XHJcbiAgICAgICAgbGV0IHNsTm90U3RvcHBpbmcgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygxLCA4LFxyXG4gICAgICAgICAgICBbLi4uYWxsQ2FsbGluZywgLi4uc2xDaGFuZ2VzXVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIFRha2UgYSByYW5kb20gc2xpY2UgZnJvbSB0aGUgY2FsbGluZyBsaXN0LCB0byBpZGVudGlmeSBhcyByZXF1ZXN0IHN0b3BzXHJcbiAgICAgICAgbGV0IHJlcUNvdW50ICAgPSBSYW5kb20uaW50KDEsIHNsQ2FsbGluZy5sZW5ndGggLSAxKTtcclxuICAgICAgICBsZXQgc2xSZXF1ZXN0cyA9IHNsQ2FsbGluZy5zbGljZSgwLCByZXFDb3VudCk7XHJcblxyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ2NhbGxpbmcnLCAgICAgICBzbENhbGxpbmcpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ2NhbGxpbmdfc3BsaXQnLCBzbENhbGxTcGxpdCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2hhbmdlcycsICAgICAgIHNsQ2hhbmdlcyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnbm90X3N0b3BwaW5nJywgIHNsTm90U3RvcHBpbmcpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ3JlcXVlc3QnLCAgICAgICBzbFJlcXVlc3RzKTtcclxuXHJcbiAgICAgICAgLy8gU3RlcCAyLiBQcmVwb3B1bGF0ZSBzdGF0aW9uc1xyXG5cclxuICAgICAgICAvLyBBbnkgc3RhdGlvbiBtYXkgYmUgYmxhbWVkIGZvciBhbiBleGN1c2UsIGV2ZW4gb25lcyBhbHJlYWR5IHBpY2tlZFxyXG4gICAgICAgIGxldCBzdEV4Y3VzZSAgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlKCk7XHJcbiAgICAgICAgLy8gRGVzdGluYXRpb24gaXMgZmluYWwgY2FsbCBvZiB0aGUgY2FsbGluZyBsaXN0XHJcbiAgICAgICAgbGV0IHN0RGVzdCAgICA9IHNsQ2FsbGluZ1tzbENhbGxpbmcubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgLy8gVmlhIGlzIGEgY2FsbCBiZWZvcmUgdGhlIGRlc3RpbmF0aW9uLCBvciBvbmUgaW4gdGhlIHNwbGl0IGxpc3QgaWYgdG9vIHNtYWxsXHJcbiAgICAgICAgbGV0IHN0VmlhICAgICA9IHNsQ2FsbGluZy5sZW5ndGggPiAxXHJcbiAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCBzbENhbGxpbmcuc2xpY2UoMCwgLTEpICAgKVxyXG4gICAgICAgICAgICA6IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcbiAgICAgICAgLy8gRGl0dG8gZm9yIHBpY2tpbmcgYSByYW5kb20gY2FsbGluZyBzdGF0aW9uIGFzIGEgc2luZ2xlIHJlcXVlc3Qgb3IgY2hhbmdlIHN0b3BcclxuICAgICAgICBsZXQgc3RDYWxsaW5nID0gc2xDYWxsaW5nLmxlbmd0aCA+IDFcclxuICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoIHNsQ2FsbGluZy5zbGljZSgwLCAtMSkgICApXHJcbiAgICAgICAgICAgIDogUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuXHJcbiAgICAgICAgLy8gRGVzdGluYXRpb24gKGxhc3QgY2FsbCkgb2YgdGhlIHNwbGl0IHRyYWluJ3Mgc2Vjb25kIGhhbGYgb2YgdGhlIGxpc3RcclxuICAgICAgICBsZXQgc3REZXN0U3BsaXQgPSBzbENhbGxTcGxpdFtzbENhbGxTcGxpdC5sZW5ndGggLSAxXTtcclxuICAgICAgICAvLyBSYW5kb20gbm9uLWRlc3RpbmF0aW9uIHN0b3Agb2YgdGhlIHNwbGl0IHRyYWluJ3Mgc2Vjb25kIGhhbGYgb2YgdGhlIGxpc3RcclxuICAgICAgICBsZXQgc3RWaWFTcGxpdCAgPSBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG4gICAgICAgIC8vIFdoZXJlIHRoZSB0cmFpbiBjb21lcyBmcm9tLCBzbyBjYW4ndCBiZSBvbiBhbnkgbGlzdHMgb3IgcHJpb3Igc3RhdGlvbnNcclxuICAgICAgICBsZXQgc3RTb3VyY2UgICAgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlKFtcclxuICAgICAgICAgICAgLi4uYWxsQ2FsbGluZywgLi4uc2xDaGFuZ2VzLCAuLi5zbE5vdFN0b3BwaW5nLCAuLi5zbFJlcXVlc3RzLFxyXG4gICAgICAgICAgICBzdENhbGxpbmcsIHN0RGVzdCwgc3RWaWEsIHN0RGVzdFNwbGl0LCBzdFZpYVNwbGl0XHJcbiAgICAgICAgXSk7XHJcblxyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignY2FsbGluZycsICAgICAgICAgICBzdENhbGxpbmcpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignZGVzdGluYXRpb24nLCAgICAgICBzdERlc3QpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignZGVzdGluYXRpb25fc3BsaXQnLCBzdERlc3RTcGxpdCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdleGN1c2UnLCAgICAgICAgICAgIHN0RXhjdXNlKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3NvdXJjZScsICAgICAgICAgICAgc3RTb3VyY2UpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbigndmlhJywgICAgICAgICAgICAgICBzdFZpYSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCd2aWFfc3BsaXQnLCAgICAgICAgIHN0VmlhU3BsaXQpO1xyXG5cclxuICAgICAgICAvLyBTdGVwIDMuIFByZXBvcHVsYXRlIGNvYWNoIG51bWJlcnNcclxuXHJcbiAgICAgICAgbGV0IGludENvYWNoZXMgPSB0aGlzLmdldEludGVnZXIoJ2NvYWNoZXMnKTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgYXJlIGVub3VnaCBjb2FjaGVzLCBqdXN0IHNwbGl0IHRoZSBudW1iZXIgZG93biB0aGUgbWlkZGxlIGluc3RlYWQuXHJcbiAgICAgICAgLy8gRWxzZSwgZnJvbnQgYW5kIHJlYXIgY29hY2hlcyB3aWxsIGJlIHJhbmRvbWx5IHBpY2tlZCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpXHJcbiAgICAgICAgaWYgKGludENvYWNoZXMgPj0gNClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBpbnRGcm9udENvYWNoZXMgPSAoaW50Q29hY2hlcyAvIDIpIHwgMDtcclxuICAgICAgICAgICAgbGV0IGludFJlYXJDb2FjaGVzICA9IGludENvYWNoZXMgLSBpbnRGcm9udENvYWNoZXM7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnNldEludGVnZXIoJ2Zyb250X2NvYWNoZXMnLCBpbnRGcm9udENvYWNoZXMpO1xyXG4gICAgICAgICAgICB0aGlzLnNldEludGVnZXIoJ3JlYXJfY29hY2hlcycsIGludFJlYXJDb2FjaGVzKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIElmIHRoZXJlIGFyZSBlbm91Z2ggY29hY2hlcywgYXNzaWduIGNvYWNoIGxldHRlcnMgZm9yIGNvbnRleHRzLlxyXG4gICAgICAgIC8vIEVsc2UsIGxldHRlcnMgd2lsbCBiZSByYW5kb21seSBwaWNrZWQgKHdpdGhvdXQgbWFraW5nIHNlbnNlKVxyXG4gICAgICAgIGlmIChpbnRDb2FjaGVzID49IDQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGV0dGVycyA9IEwuTEVUVEVSUy5zbGljZSgwLCBpbnRDb2FjaGVzKS5zcGxpdCgnJyk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnZmlyc3QnLCAgICAgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzaG9wJywgICAgICBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3N0YW5kYXJkMScsIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc3RhbmRhcmQyJywgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTdGVwIDQuIFByZXBvcHVsYXRlIHNlcnZpY2VzXHJcblxyXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG1vcmUgdGhhbiBvbmUgc2VydmljZSwgcGljayBvbmUgdG8gYmUgdGhlIFwibWFpblwiIGFuZCBvbmUgdG8gYmUgdGhlXHJcbiAgICAgICAgLy8gXCJhbHRlcm5hdGVcIiwgZWxzZSB0aGUgb25lIHNlcnZpY2Ugd2lsbCBiZSB1c2VkIGZvciBib3RoICh3aXRob3V0IG1ha2luZyBzZW5zZSkuXHJcbiAgICAgICAgaWYgKFJBRy5kYXRhYmFzZS5zZXJ2aWNlcy5sZW5ndGggPiAxKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHNlcnZpY2VzID0gUkFHLmRhdGFiYXNlLnNlcnZpY2VzLnNsaWNlKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnNldFNlcnZpY2UoICdwcm92aWRlcicsICAgIFJhbmRvbS5hcnJheVNwbGljZShzZXJ2aWNlcykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRTZXJ2aWNlKCAnYWx0ZXJuYXRpdmUnLCBSYW5kb20uYXJyYXlTcGxpY2Uoc2VydmljZXMpICk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTdGVwIDUuIFByZXBvcHVsYXRlIHRpbWVzXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzEyMTQ3NTNcclxuXHJcbiAgICAgICAgLy8gVGhlIGFsdGVybmF0aXZlIHRpbWUgaXMgZm9yIGEgdHJhaW4gdGhhdCdzIGxhdGVyIHRoYW4gdGhlIG1haW4gdHJhaW5cclxuICAgICAgICBsZXQgdGltZSAgICA9IG5ldyBEYXRlKCBuZXcgRGF0ZSgpLmdldFRpbWUoKSArIFJhbmRvbS5pbnQoMCwgNTkpICogNjAwMDApO1xyXG4gICAgICAgIGxldCB0aW1lQWx0ID0gbmV3IERhdGUoIHRpbWUuZ2V0VGltZSgpICAgICAgICsgUmFuZG9tLmludCgwLCAzMCkgKiA2MDAwMCk7XHJcblxyXG4gICAgICAgIHRoaXMuc2V0VGltZSggJ21haW4nLCAgICAgICAgU3RyaW5ncy5mcm9tVGltZSh0aW1lKSAgICApO1xyXG4gICAgICAgIHRoaXMuc2V0VGltZSggJ2FsdGVybmF0aXZlJywgU3RyaW5ncy5mcm9tVGltZSh0aW1lQWx0KSApO1xyXG4gICAgfVxyXG59Il19