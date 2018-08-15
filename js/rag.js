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
/** Utility class for resolving a given phrase to vox keys */
class Resolver {
    static toVox(phrase) {
        // First, walk through the phrase and "flatten" it into an array of parts. This is
        // so the resolver can look-ahead or look-behind.
        let flattened = [];
        let resolved = [];
        let treeWalker = document.createTreeWalker(phrase, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: Resolver.nodeFilter }, false);
        while (treeWalker.nextNode())
            if (treeWalker.currentNode.textContent.trim() !== '')
                flattened.push(treeWalker.currentNode);
        // Then, resolve all the phrases' nodes into vox keys
        flattened.forEach((v, i) => {
            resolved.push(...Resolver.resolve(v, flattened, i));
        });
        console.log(flattened);
        return resolved;
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
    /**
     * Uses the type and value of the given node, to resolve it to vox file IDs.
     *
     * @param node Node to resolve to vox IDs
     * @param phrase Flattened array of nodes that make up the whole phrase
     * @param idx Index of the node being resolved relative to the phrase array
     * @returns Array of IDs that make up one or more file IDs. Can be empty.
     */
    static resolve(node, phrase, idx) {
        if (node.nodeType === Node.TEXT_NODE)
            return this.resolveText(node);
        let element = node;
        let type = element.dataset['type'];
        switch (type) {
            case 'coach': return this.resolveCoach(element);
            case 'excuse': return this.resolveExcuse();
            case 'integer': return this.resolveInteger(element);
            case 'named': return this.resolveNamed();
            case 'platform': return this.resolvePlatform(element);
            case 'service': return this.resolveService(element);
            case 'station': return this.resolveStation(element, phrase, idx);
            case 'stationlist': return this.resolveStationList(element);
            case 'time': return this.resolveTime(element);
        }
        return [];
    }
    static resolveText(node) {
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
            return [];
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
    static resolveCoach(element) {
        let ctx = element.dataset['context'];
        let coach = RAG.state.getCoach(ctx);
        return [0.1, `letter.${coach}`, 0.1];
    }
    static resolveExcuse() {
        let excuse = RAG.state.excuse;
        let index = RAG.database.excuses.indexOf(excuse);
        // TODO: Error handling
        return [0.1, `excuse.${index}`, 0.1];
    }
    static resolveInteger(element) {
        let ctx = element.dataset['context'];
        let singular = element.dataset['singular'];
        let plural = element.dataset['plural'];
        let integer = RAG.state.getInteger(ctx);
        let parts = [0.1, `number.mid.${integer}`];
        if (singular && integer === 1)
            parts.push(0.1, `number.suffix.${singular}`);
        else if (plural && integer !== 1)
            parts.push(0.1, `number.suffix.${plural}`);
        return parts;
    }
    static resolveNamed() {
        let named = Strings.filename(RAG.state.named);
        return [0.1, `named.${named}`, 0.1];
    }
    static resolvePlatform(element) {
        let platform = RAG.state.platform;
        let vox = element.dataset['vox'] || 'mid';
        let key = `number.${vox}.${platform[0]}${platform[1]}`;
        return [0.1, key, 0.1];
    }
    static resolveService(element) {
        let ctx = element.dataset['context'];
        let service = Strings.filename(RAG.state.getService(ctx));
        return [0.1, `service.${service}`, 0.1];
    }
    static resolveStation(element, phrase, idx) {
        let ctx = element.dataset['context'];
        let station = RAG.state.getStation(ctx);
        let next = phrase[idx + 1];
        let type = 'mid';
        if (!next || next.textContent.trim() === '.')
            type = 'end';
        return [0.1, `station.${type}.${station}`, 0.1];
    }
    static resolveStationList(element) {
        let ctx = element.dataset['context'];
        let list = RAG.state.getStationList(ctx);
        let parts = [0.1];
        list.forEach((v, k) => {
            // Handle end of list inflection
            if (k === list.length - 1) {
                // Add "and" if list has more than 1 station and this is the end
                if (list.length > 1)
                    parts.push(0.15, 'station.parts.and', 0.15);
                parts.push(`station.end.${v}`);
            }
            else
                parts.push(`station.mid.${v}`, 0.25);
        });
        // Add "only" if only one station in the calling list
        if (list.length === 1 && ctx === 'calling')
            parts.push(0.1, 'station.parts.only');
        return [...parts, 0.2];
    }
    static resolveTime(element) {
        let ctx = element.dataset['context'];
        let time = RAG.state.getTime(ctx).split(':');
        let parts = [0.1];
        if (time[0] === '00' && time[1] === '00')
            return [...parts, 'number.0000'];
        // Hours
        parts.push(`number.mid.${time[0]}`);
        if (time[1] === '00')
            parts.push('number.mid.hundred');
        else
            parts.push(0.1, `number.mid.${time[1]}`);
        return [...parts, 0.05];
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
        this.voxEngine.speak(Resolver.toVox(phrase), voice, settings);
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
            // If this key is a number, it's an amount of silence, so hold it as the
            // playback delay for the next available request (if any).
            if (typeof key === 'number') {
                nextDelay = key;
                continue;
            }
            let path = `${this.currentVoice.voiceURI}/${key}.mp3`;
            this.pendingReqs.push(new VoxRequest(path, nextDelay));
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
        let latency = this.audioContext.baseLatency + 0.1;
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
    constructor(path, delay) {
        /** Whether this request is done and ready for handling (even if failed) */
        this.isDone = false;
        console.debug('VOX REQUEST:', path);
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
        Sounds.decode(RAG.speech.voxEngine.audioContext, buffer)
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL3N0YXRpb25DaG9vc2VyLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkxpc3RJdGVtLnRzIiwidWkvcGlja2Vycy9waWNrZXIudHMiLCJ1aS9waWNrZXJzL2NvYWNoUGlja2VyLnRzIiwidWkvcGlja2Vycy9leGN1c2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2ludGVnZXJQaWNrZXIudHMiLCJ1aS9waWNrZXJzL25hbWVkUGlja2VyLnRzIiwidWkvcGlja2Vycy9waHJhc2VzZXRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BsYXRmb3JtUGlja2VyLnRzIiwidWkvcGlja2Vycy9zZXJ2aWNlUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uTGlzdFBpY2tlci50cyIsInVpL3BpY2tlcnMvdGltZVBpY2tlci50cyIsImxhbmcvYmFzZUxhbmd1YWdlLnRzIiwibGFuZy9lbmdsaXNoTGFuZ3VhZ2UudHMiLCJwaHJhc2VyL2VsZW1lbnRQcm9jZXNzb3JzLnRzIiwicGhyYXNlci9waHJhc2VDb250ZXh0LnRzIiwicGhyYXNlci9waHJhc2VyLnRzIiwic3BlZWNoL2N1c3RvbVZvaWNlLnRzIiwic3BlZWNoL3Jlc29sdmVyLnRzIiwic3BlZWNoL3NwZWVjaC50cyIsInNwZWVjaC9zcGVlY2hTZXR0aW5ncy50cyIsInNwZWVjaC92b3hFbmdpbmUudHMiLCJzcGVlY2gvdm94UmVxdWVzdC50cyIsInVpL2VkaXRvci50cyIsInVpL21hcnF1ZWUudHMiLCJ1aS9zZXR0aW5ncy50cyIsInVpL3Rvb2xiYXIudHMiLCJ1aS92aWV3cy50cyIsInV0aWwvY29sbGFwc2libGVzLnRzIiwidXRpbC9jb25kaXRpb25hbHMudHMiLCJ1dGlsL2RvbS50cyIsInV0aWwvbGlua2Rvd24udHMiLCJ1dGlsL3BhcnNlLnRzIiwidXRpbC9yYW5kb20udHMiLCJ1dGlsL3NvdW5kcy50cyIsInV0aWwvc3RyaW5ncy50cyIsInV0aWwvdHlwZXMudHMiLCJjb25maWcudHMiLCJkYXRhYmFzZS50cyIsInJhZy50cyIsInN0YXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLHFFQUFxRTtBQUVyRSw4REFBOEQ7QUFDOUQsSUFBSSxDQUFrQyxDQUFDO0FBRXZDLE1BQU0sSUFBSTtJQVVOLDRFQUE0RTtJQUNyRSxNQUFNLENBQUMsSUFBSTtRQUVkLElBQUksSUFBSSxDQUFDLFNBQVM7WUFDZCxNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFFbkQsSUFBSSxDQUFDLFNBQVMsR0FBRztZQUNiLElBQUksRUFBRyxJQUFJLGVBQWUsRUFBRTtTQUMvQixDQUFDO1FBRUYsMkJBQTJCO1FBQzNCLENBQUMsR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFNUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ3RCLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ssTUFBTSxDQUFDLFVBQVU7UUFFckIsSUFBSSxJQUFrQixDQUFDO1FBQ3ZCLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FDaEMsUUFBUSxDQUFDLElBQUksRUFDYixVQUFVLENBQUMsWUFBWSxHQUFHLFVBQVUsQ0FBQyxTQUFTLEVBQzlDLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFDL0IsS0FBSyxDQUNSLENBQUM7UUFFRixPQUFRLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQzlCO1lBQ0ksSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxZQUFZLEVBQ3ZDO2dCQUNJLElBQUksT0FBTyxHQUFHLElBQWUsQ0FBQztnQkFFOUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVB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SyxDQUFDLENBQUM7UUFFMUUsSUFBSSxDQUFDLE9BQU8sQ0FBRSxNQUFNLEVBQVMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBSyxDQUFDO1FBQ3pELElBQUksQ0FBQyxPQUFPLENBQUUsYUFBYSxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUUsQ0FBQztJQUM3RCxDQUFDO0NBQ0oiLCJzb3VyY2VzQ29udGVudCI6WyIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBHbG9iYWwgcmVmZXJlbmNlIHRvIHRoZSBsYW5ndWFnZSBjb250YWluZXIsIHNldCBhdCBpbml0ICovXHJcbmxldCBMIDogRW5nbGlzaExhbmd1YWdlIHwgQmFzZUxhbmd1YWdlO1xyXG5cclxuY2xhc3MgSTE4blxyXG57XHJcbiAgICAvKiogQ29uc3RhbnQgcmVnZXggdG8gbWF0Y2ggZm9yIHRyYW5zbGF0aW9uIGtleXMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRBR19SRUdFWCA6IFJlZ0V4cCA9IC8lW0EtWl9dKyUvO1xyXG5cclxuICAgIC8qKiBMYW5ndWFnZXMgY3VycmVudGx5IGF2YWlsYWJsZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbGFuZ3VhZ2VzICAgOiBEaWN0aW9uYXJ5PEJhc2VMYW5ndWFnZT47XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIGxhbmd1YWdlIGN1cnJlbnRseSBpbiB1c2UgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGN1cnJlbnRMYW5nIDogQmFzZUxhbmd1YWdlO1xyXG5cclxuICAgIC8qKiBQaWNrcyBhIGxhbmd1YWdlLCBhbmQgdHJhbnNmb3JtcyBhbGwgdHJhbnNsYXRpb24ga2V5cyBpbiB0aGUgZG9jdW1lbnQgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmxhbmd1YWdlcylcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJMThuIGlzIGFscmVhZHkgaW5pdGlhbGl6ZWQnKTtcclxuXHJcbiAgICAgICAgdGhpcy5sYW5ndWFnZXMgPSB7XHJcbiAgICAgICAgICAgICdlbicgOiBuZXcgRW5nbGlzaExhbmd1YWdlKClcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBMYW5ndWFnZSBzZWxlY3Rpb25cclxuICAgICAgICBMID0gdGhpcy5jdXJyZW50TGFuZyA9IHRoaXMubGFuZ3VhZ2VzWydlbiddO1xyXG5cclxuICAgICAgICBJMThuLmFwcGx5VG9Eb20oKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFdhbGtzIHRocm91Z2ggYWxsIHRleHQgbm9kZXMgaW4gdGhlIERPTSwgcmVwbGFjaW5nIGFueSB0cmFuc2xhdGlvbiBrZXlzLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzEwNzMwNzc3LzMzNTQ5MjBcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgYXBwbHlUb0RvbSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXh0IDogTm9kZSB8IG51bGw7XHJcbiAgICAgICAgbGV0IHdhbGsgPSBkb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKFxyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LFxyXG4gICAgICAgICAgICBOb2RlRmlsdGVyLlNIT1dfRUxFTUVOVCB8IE5vZGVGaWx0ZXIuU0hPV19URVhULFxyXG4gICAgICAgICAgICB7IGFjY2VwdE5vZGU6IEkxOG4ubm9kZUZpbHRlciB9LFxyXG4gICAgICAgICAgICBmYWxzZVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHdoaWxlICggbmV4dCA9IHdhbGsubmV4dE5vZGUoKSApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAobmV4dC5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50ID0gbmV4dCBhcyBFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5hdHRyaWJ1dGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICAgICAgICAgIEkxOG4uZXhwYW5kQXR0cmlidXRlKGVsZW1lbnQuYXR0cmlidXRlc1tpXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSBpZiAobmV4dC5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUgJiYgbmV4dC50ZXh0Q29udGVudClcclxuICAgICAgICAgICAgICAgIEkxOG4uZXhwYW5kVGV4dE5vZGUobmV4dCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWx0ZXJzIHRoZSB0cmVlIHdhbGtlciB0byBleGNsdWRlIHNjcmlwdCBhbmQgc3R5bGUgdGFncyAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbm9kZUZpbHRlcihub2RlOiBOb2RlKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YWcgPSAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAgICAgID8gKG5vZGUgYXMgRWxlbWVudCkudGFnTmFtZS50b1VwcGVyQ2FzZSgpXHJcbiAgICAgICAgICAgIDogbm9kZS5wYXJlbnRFbGVtZW50IS50YWdOYW1lLnRvVXBwZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbJ1NDUklQVCcsICdTVFlMRSddLmluY2x1ZGVzKHRhZylcclxuICAgICAgICAgICAgPyBOb2RlRmlsdGVyLkZJTFRFUl9SRUpFQ1RcclxuICAgICAgICAgICAgOiBOb2RlRmlsdGVyLkZJTFRFUl9BQ0NFUFQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEV4cGFuZHMgYW55IHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGdpdmVuIGF0dHJpYnV0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZXhwYW5kQXR0cmlidXRlKGF0dHI6IEF0dHIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFNldHRpbmcgYW4gYXR0cmlidXRlLCBldmVuIGlmIG5vdGhpbmcgYWN0dWFsbHkgY2hhbmdlcywgd2lsbCBjYXVzZSB2YXJpb3VzXHJcbiAgICAgICAgLy8gc2lkZS1lZmZlY3RzIChlLmcuIHJlbG9hZGluZyBpZnJhbWVzKS4gU28sIGFzIHdhc3RlZnVsIGFzIHRoaXMgbG9va3MsIHdlIGhhdmVcclxuICAgICAgICAvLyB0byBtYXRjaCBmaXJzdCBiZWZvcmUgYWN0dWFsbHkgcmVwbGFjaW5nLlxyXG5cclxuICAgICAgICBpZiAoIGF0dHIudmFsdWUubWF0Y2godGhpcy5UQUdfUkVHRVgpIClcclxuICAgICAgICAgICAgYXR0ci52YWx1ZSA9IGF0dHIudmFsdWUucmVwbGFjZSh0aGlzLlRBR19SRUdFWCwgSTE4bi5yZXBsYWNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRXhwYW5kcyBhbnkgdHJhbnNsYXRpb24ga2V5cyBpbiB0aGUgZ2l2ZW4gdGV4dCBub2RlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBleHBhbmRUZXh0Tm9kZShub2RlOiBOb2RlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBub2RlLnRleHRDb250ZW50ID0gbm9kZS50ZXh0Q29udGVudCEucmVwbGFjZSh0aGlzLlRBR19SRUdFWCwgSTE4bi5yZXBsYWNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVwbGFjZXMga2V5IHdpdGggdmFsdWUgaWYgaXQgZXhpc3RzLCBlbHNlIGtlZXBzIHRoZSBrZXkgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlcGxhY2UobWF0Y2g6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQga2V5ICAgPSBtYXRjaC5zbGljZSgxLCAtMSk7XHJcbiAgICAgICAgbGV0IHZhbHVlID0gTFtrZXldIGFzIExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgICAgIGlmICghdmFsdWUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdNaXNzaW5nIHRyYW5zbGF0aW9uIGtleTonLCBtYXRjaCk7XHJcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWUoKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIERlbGVnYXRlIHR5cGUgZm9yIGNob29zZXIgc2VsZWN0IGV2ZW50IGhhbmRsZXJzICovXHJcbnR5cGUgU2VsZWN0RGVsZWdhdGUgPSAoZW50cnk6IEhUTUxFbGVtZW50KSA9PiB2b2lkO1xyXG5cclxuLyoqIFVJIGVsZW1lbnQgd2l0aCBhIGZpbHRlcmFibGUgYW5kIGtleWJvYXJkIG5hdmlnYWJsZSBsaXN0IG9mIGNob2ljZXMgKi9cclxuY2xhc3MgQ2hvb3NlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBET00gdGVtcGxhdGUgdG8gY2xvbmUsIGZvciBlYWNoIGNob29zZXIgY3JlYXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgVEVNUExBVEUgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgZGV0YWNoZXMgdGhlIHRlbXBsYXRlIG9uIGZpcnN0IGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUgICAgPSBET00ucmVxdWlyZSgnI2Nob29zZXJUZW1wbGF0ZScpO1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUuaWQgPSAnJztcclxuXHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgY29udGFpbmVyICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZG9tICAgICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGZpbHRlciBpbnB1dCBib3ggKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBpbnB1dEZpbHRlciAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBjb250YWluZXIgb2YgaXRlbSBlbGVtZW50cyAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlucHV0Q2hvaWNlcyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBPcHRpb25hbCBldmVudCBoYW5kbGVyIHRvIGZpcmUgd2hlbiBhbiBpdGVtIGlzIHNlbGVjdGVkIGJ5IHRoZSB1c2VyICovXHJcbiAgICBwdWJsaWMgICAgb25TZWxlY3Q/ICAgICA6IFNlbGVjdERlbGVnYXRlO1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gdmlzdWFsbHkgc2VsZWN0IHRoZSBjbGlja2VkIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyAgICBzZWxlY3RPbkNsaWNrIDogYm9vbGVhbiA9IHRydWU7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgaXRlbSwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgZG9tU2VsZWN0ZWQ/ICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgYXV0by1maWx0ZXIgdGltZW91dCwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgZmlsdGVyVGltZW91dCA6IG51bWJlciA9IDA7XHJcbiAgICAvKiogV2hldGhlciB0byBncm91cCBhZGRlZCBlbGVtZW50cyBieSBhbHBoYWJldGljYWwgc2VjdGlvbnMgKi9cclxuICAgIHByb3RlY3RlZCBncm91cEJ5QUJDICAgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFRpdGxlIGF0dHJpYnV0ZSB0byBhcHBseSB0byBldmVyeSBpdGVtIGFkZGVkICovXHJcbiAgICBwcm90ZWN0ZWQgaXRlbVRpdGxlICAgICA6IHN0cmluZyA9ICdDbGljayB0byBzZWxlY3QgdGhpcyBpdGVtJztcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhIGNob29zZXIsIGJ5IHJlcGxhY2luZyB0aGUgcGxhY2Vob2xkZXIgaW4gYSBnaXZlbiBwYXJlbnQgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIGlmICghQ2hvb3Nlci5URU1QTEFURSlcclxuICAgICAgICAgICAgQ2hvb3Nlci5pbml0KCk7XHJcblxyXG4gICAgICAgIGxldCB0YXJnZXQgICAgICA9IERPTS5yZXF1aXJlKCdjaG9vc2VyJywgcGFyZW50KTtcclxuICAgICAgICBsZXQgcGxhY2Vob2xkZXIgPSBET00uZ2V0QXR0ciggdGFyZ2V0LCAncGxhY2Vob2xkZXInLCBMLlBfR0VORVJJQ19QSCgpICk7XHJcbiAgICAgICAgbGV0IHRpdGxlICAgICAgID0gRE9NLmdldEF0dHIoIHRhcmdldCwgJ3RpdGxlJywgTC5QX0dFTkVSSUNfVCgpICk7XHJcbiAgICAgICAgdGhpcy5pdGVtVGl0bGUgID0gRE9NLmdldEF0dHIodGFyZ2V0LCAnaXRlbVRpdGxlJywgdGhpcy5pdGVtVGl0bGUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdXBCeUFCQyA9IHRhcmdldC5oYXNBdHRyaWJ1dGUoJ2dyb3VwQnlBQkMnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgICAgPSBDaG9vc2VyLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyICA9IERPTS5yZXF1aXJlKCcuY2hTZWFyY2hCb3gnLCAgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzID0gRE9NLnJlcXVpcmUoJy5jaENob2ljZXNCb3gnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnRpdGxlICAgICAgPSB0aXRsZTtcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XHJcbiAgICAgICAgLy8gVE9ETzogUmV1c2luZyB0aGUgcGxhY2Vob2xkZXIgYXMgdGl0bGUgaXMgcHJvYmFibHkgYmFkXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9sYWtlbi5uZXQvYmxvZy9tb3N0LWNvbW1vbi1hMTF5LW1pc3Rha2VzL1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIudGl0bGUgICAgICAgPSBwbGFjZWhvbGRlcjtcclxuXHJcbiAgICAgICAgdGFyZ2V0Lmluc2VydEFkamFjZW50RWxlbWVudCgnYmVmb3JlYmVnaW4nLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGFyZ2V0LnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQWRkcyB0aGUgZ2l2ZW4gdmFsdWUgdG8gdGhlIGNob29zZXIgYXMgYSBzZWxlY3RhYmxlIGl0ZW0uXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHZhbHVlIFRleHQgb2YgdGhlIHNlbGVjdGFibGUgaXRlbVxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBXaGV0aGVyIHRvIHNlbGVjdCB0aGlzIGl0ZW0gb25jZSBhZGRlZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYWRkKHZhbHVlOiBzdHJpbmcsIHNlbGVjdDogYm9vbGVhbiA9IGZhbHNlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaXRlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcblxyXG4gICAgICAgIGl0ZW0uaW5uZXJUZXh0ID0gdmFsdWU7XHJcblxyXG4gICAgICAgIHRoaXMuYWRkUmF3KGl0ZW0sIHNlbGVjdCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBZGRzIHRoZSBnaXZlbiBlbGVtZW50IHRvIHRoZSBjaG9vc2VyIGFzIGEgc2VsZWN0YWJsZSBpdGVtLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpdGVtIEVsZW1lbnQgdG8gYWRkIHRvIHRoZSBjaG9vc2VyXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFdoZXRoZXIgdG8gc2VsZWN0IHRoaXMgaXRlbSBvbmNlIGFkZGVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhZGRSYXcoaXRlbTogSFRNTEVsZW1lbnQsIHNlbGVjdDogYm9vbGVhbiA9IGZhbHNlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpdGVtLnRpdGxlICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICAgICAgaXRlbS50YWJJbmRleCA9IC0xO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5hcHBlbmRDaGlsZChpdGVtKTtcclxuXHJcbiAgICAgICAgaWYgKHNlbGVjdClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGl0ZW0pO1xyXG4gICAgICAgICAgICBpdGVtLmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbGVhcnMgYWxsIGl0ZW1zIGZyb20gdGhpcyBjaG9vc2VyIGFuZCB0aGUgY3VycmVudCBmaWx0ZXIgKi9cclxuICAgIHB1YmxpYyBjbGVhcigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmlubmVySFRNTCA9ICcnO1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIudmFsdWUgICAgICA9ICcnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZWxlY3QgYW5kIGZvY3VzIHRoZSBlbnRyeSB0aGF0IG1hdGNoZXMgdGhlIGdpdmVuIHZhbHVlICovXHJcbiAgICBwdWJsaWMgcHJlc2VsZWN0KHZhbHVlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGZvciAobGV0IGtleSBpbiB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBpdGVtID0gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW5ba2V5XSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gaXRlbS5pbm5lclRleHQpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgaXRlbS5mb2N1cygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xpY2sgZXZlbnRzLCBmb3IgY2hvb3NpbmcgaXRlbXMgKi9cclxuICAgIHB1YmxpYyBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgdGFyZ2V0ID0gZXYudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIHRoaXMuaXNDaG9pY2UodGFyZ2V0KSApXHJcbiAgICAgICAgaWYgKCAhdGFyZ2V0Lmhhc0F0dHJpYnV0ZSgnZGlzYWJsZWQnKSApXHJcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0KHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xvc2UgbWV0aG9kcywgZG9pbmcgYW55IHRpbWVyIGNsZWFudXAgKi9cclxuICAgIHB1YmxpYyBvbkNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGlucHV0IGV2ZW50cywgZm9yIGZpbHRlcmluZyBhbmQgbmF2aWdhdGlvbiAqL1xyXG4gICAgcHVibGljIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBrZXkgICAgID0gZXYua2V5O1xyXG4gICAgICAgIGxldCBmb2N1c2VkID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IGZvY3VzZWQucGFyZW50RWxlbWVudCE7XHJcblxyXG4gICAgICAgIGlmICghZm9jdXNlZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBPbmx5IGhhbmRsZSBldmVudHMgb24gdGhpcyBjaG9vc2VyJ3MgY29udHJvbHNcclxuICAgICAgICBpZiAoICF0aGlzLm93bnMoZm9jdXNlZCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSB0eXBpbmcgaW50byBmaWx0ZXIgYm94XHJcbiAgICAgICAgaWYgKGZvY3VzZWQgPT09IHRoaXMuaW5wdXRGaWx0ZXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmZpbHRlclRpbWVvdXQgPSB3aW5kb3cuc2V0VGltZW91dChfID0+IHRoaXMuZmlsdGVyKCksIDUwMCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFJlZGlyZWN0IHR5cGluZyB0byBpbnB1dCBmaWx0ZXIgYm94XHJcbiAgICAgICAgaWYgKGZvY3VzZWQgIT09IHRoaXMuaW5wdXRGaWx0ZXIpXHJcbiAgICAgICAgaWYgKGtleS5sZW5ndGggPT09IDEgfHwga2V5ID09PSAnQmFja3NwYWNlJylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaW5wdXRGaWx0ZXIuZm9jdXMoKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHByZXNzaW5nIEVOVEVSIGFmdGVyIGtleWJvYXJkIG5hdmlnYXRpbmcgdG8gYW4gaXRlbVxyXG4gICAgICAgIGlmICggdGhpcy5pc0Nob2ljZShmb2N1c2VkKSApXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0VudGVyJylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0KGZvY3VzZWQpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgbmF2aWdhdGlvbiB3aGVuIGNvbnRhaW5lciBvciBpdGVtIGlzIGZvY3VzZWRcclxuICAgICAgICBpZiAoa2V5ID09PSAnQXJyb3dMZWZ0JyB8fCBrZXkgPT09ICdBcnJvd1JpZ2h0JylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBkaXIgPSAoa2V5ID09PSAnQXJyb3dMZWZ0JykgPyAtMSA6IDE7XHJcbiAgICAgICAgICAgIGxldCBuYXYgPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudCwgaWYgdXNpbmcgZ3JvdXBzXHJcbiAgICAgICAgICAgIGlmICAgICAgKCB0aGlzLmdyb3VwQnlBQkMgJiYgcGFyZW50Lmhhc0F0dHJpYnV0ZSgnZ3JvdXAnKSApXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQsIGlmIGNob2ljZXMgYXJlIGZsYXRcclxuICAgICAgICAgICAgZWxzZSBpZiAoIXRoaXMuZ3JvdXBCeUFCQyAmJiBmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRDaG9pY2VzKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudFxyXG4gICAgICAgICAgICBlbHNlIGlmIChmb2N1c2VkID09PSB0aGlzLmRvbVNlbGVjdGVkKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKHRoaXMuZG9tU2VsZWN0ZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxldmFudCB0byBiZWdpbm5pbmcgb3IgZW5kIG9mIGNvbnRhaW5lclxyXG4gICAgICAgICAgICBlbHNlIGlmIChkaXIgPT09IC0xKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmxhc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBpZiAobmF2KSBuYXYuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2Vycycgc3VibWl0IGV2ZW50cywgZm9yIGluc3RhbnQgZmlsdGVyaW5nICovXHJcbiAgICBwdWJsaWMgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIHRoaXMuZmlsdGVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhpZGUgb3Igc2hvdyBjaG9pY2VzIGlmIHRoZXkgcGFydGlhbGx5IG1hdGNoIHRoZSB1c2VyIHF1ZXJ5ICovXHJcbiAgICBwcm90ZWN0ZWQgZmlsdGVyKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG5cclxuICAgICAgICBsZXQgZmlsdGVyID0gdGhpcy5pbnB1dEZpbHRlci52YWx1ZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIGxldCBpdGVtcyAgPSB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbjtcclxuICAgICAgICBsZXQgZW5naW5lID0gdGhpcy5ncm91cEJ5QUJDXHJcbiAgICAgICAgICAgID8gQ2hvb3Nlci5maWx0ZXJHcm91cFxyXG4gICAgICAgICAgICA6IENob29zZXIuZmlsdGVySXRlbTtcclxuXHJcbiAgICAgICAgLy8gUHJldmVudCBicm93c2VyIHJlZHJhdy9yZWZsb3cgZHVyaW5nIGZpbHRlcmluZ1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xyXG5cclxuICAgICAgICAvLyBJdGVyYXRlIHRocm91Z2ggYWxsIHRoZSBpdGVtc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIGVuZ2luZShpdGVtc1tpXSBhcyBIVE1MRWxlbWVudCwgZmlsdGVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEFwcGxpZXMgZmlsdGVyIHRvIGFuIGl0ZW0sIHNob3dpbmcgaXQgaWYgbWF0Y2hlZCwgaGlkaW5nIGlmIG5vdCAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBmaWx0ZXJJdGVtKGl0ZW06IEhUTUxFbGVtZW50LCBmaWx0ZXI6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICAvLyBTaG93IGlmIGNvbnRhaW5zIHNlYXJjaCB0ZXJtXHJcbiAgICAgICAgaWYgKGl0ZW0uaW5uZXJUZXh0LnRvTG93ZXJDYXNlKCkuaW5kZXhPZihmaWx0ZXIpID49IDApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpdGVtLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG4gICAgICAgICAgICByZXR1cm4gMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhpZGUgaWYgbm90XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaXRlbS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcclxuICAgICAgICAgICAgcmV0dXJuIDE7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBcHBsaWVzIGZpbHRlciB0byBjaGlsZHJlbiBvZiBhIGdyb3VwLCBoaWRpbmcgdGhlIGdyb3VwIGlmIGFsbCBjaGlsZHJlbiBoaWRlICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGZpbHRlckdyb3VwKGdyb3VwOiBIVE1MRWxlbWVudCwgZmlsdGVyOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyaWVzID0gZ3JvdXAuY2hpbGRyZW47XHJcbiAgICAgICAgbGV0IGNvdW50ICAgPSBlbnRyaWVzLmxlbmd0aCAtIDE7IC8vIC0xIGZvciBoZWFkZXIgZWxlbWVudFxyXG4gICAgICAgIGxldCBoaWRkZW4gID0gMDtcclxuXHJcbiAgICAgICAgLy8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggc3RhdGlvbiBuYW1lIGluIHRoaXMgbGV0dGVyIHNlY3Rpb24uIEhlYWRlciBza2lwcGVkLlxyXG4gICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgZW50cmllcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgaGlkZGVuICs9IENob29zZXIuZmlsdGVySXRlbShlbnRyaWVzW2ldIGFzIEhUTUxFbGVtZW50LCBmaWx0ZXIpO1xyXG5cclxuICAgICAgICAvLyBJZiBhbGwgc3RhdGlvbiBuYW1lcyBpbiB0aGlzIGxldHRlciBzZWN0aW9uIHdlcmUgaGlkZGVuLCBoaWRlIHRoZSBzZWN0aW9uXHJcbiAgICAgICAgaWYgKGhpZGRlbiA+PSBjb3VudClcclxuICAgICAgICAgICAgZ3JvdXAuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBncm91cC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgY2hhbmdlcyB0aGUgY3VycmVudCBzZWxlY3Rpb24sIGFuZCB1cGRhdGVzIHRoZSBzdGF0ZSBhbmQgZWRpdG9yICovXHJcbiAgICBwcm90ZWN0ZWQgc2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGFscmVhZHlTZWxlY3RlZCA9IChlbnRyeSA9PT0gdGhpcy5kb21TZWxlY3RlZCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnNlbGVjdE9uQ2xpY2spXHJcbiAgICAgICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGVudHJ5KTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25TZWxlY3QpXHJcbiAgICAgICAgICAgIHRoaXMub25TZWxlY3QoZW50cnkpO1xyXG5cclxuICAgICAgICBpZiAoYWxyZWFkeVNlbGVjdGVkKVxyXG4gICAgICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IGNoYW5nZXMgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50ICovXHJcbiAgICBwcm90ZWN0ZWQgdmlzdWFsU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy52aXN1YWxVbnNlbGVjdCgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkICAgICAgICAgID0gZW50cnk7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC50YWJJbmRleCA9IDUwO1xyXG4gICAgICAgIGVudHJ5LnNldEF0dHJpYnV0ZSgnc2VsZWN0ZWQnLCAndHJ1ZScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSB1bnNlbGVjdHMgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50LCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCB2aXN1YWxVbnNlbGVjdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5kb21TZWxlY3RlZClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnJlbW92ZUF0dHJpYnV0ZSgnc2VsZWN0ZWQnKTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnRhYkluZGV4ID0gLTE7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZCAgICAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFdoZXRoZXIgdGhpcyBjaG9vc2VyIGlzIGFuIGFuY2VzdG9yIChvd25lcikgb2YgdGhlIGdpdmVuIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFbGVtZW50IHRvIGNoZWNrIGlmIHRoaXMgY2hvb3NlciBpcyBhbiBhbmNlc3RvciBvZlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb3ducyh0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20uY29udGFpbnModGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogV2hldGhlciB0aGUgZ2l2ZW4gZWxlbWVudCBpcyBhIGNob29zYWJsZSBvbmUgb3duZWQgYnkgdGhpcyBjaG9vc2VyICovXHJcbiAgICBwcm90ZWN0ZWQgaXNDaG9pY2UodGFyZ2V0PzogSFRNTEVsZW1lbnQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0YXJnZXQgIT09IHVuZGVmaW5lZFxyXG4gICAgICAgICAgICAmJiB0YXJnZXQudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnZGQnXHJcbiAgICAgICAgICAgICYmIHRoaXMub3ducyh0YXJnZXQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKipcclxuICogU2luZ2xldG9uIGluc3RhbmNlIG9mIHRoZSBzdGF0aW9uIHBpY2tlci4gU2luY2UgdGhlcmUgYXJlIGV4cGVjdGVkIHRvIGJlIDI1MDArXHJcbiAqIHN0YXRpb25zLCB0aGlzIGVsZW1lbnQgd291bGQgdGFrZSB1cCBhIGxvdCBvZiBtZW1vcnkgYW5kIGdlbmVyYXRlIGEgbG90IG9mIERPTS4gU28sIGl0XHJcbiAqIGhhcyB0byBiZSBcInN3YXBwZWRcIiBiZXR3ZWVuIHBpY2tlcnMgYW5kIHZpZXdzIHRoYXQgd2FudCB0byB1c2UgaXQuXHJcbiAqL1xyXG5jbGFzcyBTdGF0aW9uQ2hvb3NlciBleHRlbmRzIENob29zZXJcclxue1xyXG4gICAgLyoqIFNob3J0Y3V0IHJlZmVyZW5jZXMgdG8gYWxsIHRoZSBnZW5lcmF0ZWQgQS1aIHN0YXRpb24gbGlzdCBlbGVtZW50cyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21TdGF0aW9ucyA6IERpY3Rpb25hcnk8SFRNTERMaXN0RWxlbWVudD4gPSB7fTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGFyZW50OiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICBzdXBlcihwYXJlbnQpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy50YWJJbmRleCA9IDA7XHJcblxyXG4gICAgICAgIC8vIFBvcHVsYXRlcyB0aGUgbGlzdCBvZiBzdGF0aW9ucyBmcm9tIHRoZSBkYXRhYmFzZS4gV2UgZG8gdGhpcyBieSBjcmVhdGluZyBhIGRsXHJcbiAgICAgICAgLy8gZWxlbWVudCBmb3IgZWFjaCBsZXR0ZXIgb2YgdGhlIGFscGhhYmV0LCBjcmVhdGluZyBhIGR0IGVsZW1lbnQgaGVhZGVyLCBhbmQgdGhlblxyXG4gICAgICAgIC8vIHBvcHVsYXRpbmcgdGhlIGRsIHdpdGggc3RhdGlvbiBuYW1lIGRkIGNoaWxkcmVuLlxyXG4gICAgICAgIE9iamVjdC5rZXlzKFJBRy5kYXRhYmFzZS5zdGF0aW9ucykuZm9yRWFjaCggdGhpcy5hZGRTdGF0aW9uLmJpbmQodGhpcykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEF0dGFjaGVzIHRoaXMgY29udHJvbCB0byB0aGUgZ2l2ZW4gcGFyZW50IGFuZCByZXNldHMgc29tZSBzdGF0ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGlja2VyIFBpY2tlciB0byBhdHRhY2ggdGhpcyBjb250cm9sIHRvXHJcbiAgICAgKiBAcGFyYW0gb25TZWxlY3QgRGVsZWdhdGUgdG8gZmlyZSB3aGVuIGNob29zaW5nIGEgc3RhdGlvblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYXR0YWNoKHBpY2tlcjogUGlja2VyLCBvblNlbGVjdDogU2VsZWN0RGVsZWdhdGUpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgID0gcGlja2VyLmRvbUZvcm07XHJcbiAgICAgICAgbGV0IGN1cnJlbnQgPSB0aGlzLmRvbS5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICAvLyBSZS1lbmFibGUgYWxsIGRpc2FibGVkIGVsZW1lbnRzXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMucXVlcnlTZWxlY3RvckFsbChgZGRbZGlzYWJsZWRdYClcclxuICAgICAgICAgICAgLmZvckVhY2goIHRoaXMuZW5hYmxlLmJpbmQodGhpcykgKTtcclxuXHJcbiAgICAgICAgaWYgKCFjdXJyZW50IHx8IGN1cnJlbnQgIT09IHBhcmVudClcclxuICAgICAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgdGhpcy52aXN1YWxVbnNlbGVjdCgpO1xyXG4gICAgICAgIHRoaXMub25TZWxlY3QgPSBvblNlbGVjdC5iaW5kKHBpY2tlcik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFByZS1zZWxlY3RzIGEgc3RhdGlvbiBlbnRyeSBieSBpdHMgY29kZSAqL1xyXG4gICAgcHVibGljIHByZXNlbGVjdENvZGUoY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSB0aGlzLmdldEJ5Q29kZShjb2RlKTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChlbnRyeSk7XHJcbiAgICAgICAgZW50cnkuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRW5hYmxlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlIG9yIHN0YXRpb24gZWxlbWVudCBmb3Igc2VsZWN0aW9uICovXHJcbiAgICBwdWJsaWMgZW5hYmxlKGNvZGVPck5vZGU6IHN0cmluZyB8IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSAodHlwZW9mIGNvZGVPck5vZGUgPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICA/IHRoaXMuZ2V0QnlDb2RlKGNvZGVPck5vZGUpXHJcbiAgICAgICAgICAgIDogY29kZU9yTm9kZTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBlbnRyeS5yZW1vdmVBdHRyaWJ1dGUoJ2Rpc2FibGVkJyk7XHJcbiAgICAgICAgZW50cnkudGFiSW5kZXggPSAtMTtcclxuICAgICAgICBlbnRyeS50aXRsZSAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBEaXNhYmxlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlIGZyb20gc2VsZWN0aW9uICovXHJcbiAgICBwdWJsaWMgZGlzYWJsZShjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9IHRoaXMuZ2V0QnlDb2RlKGNvZGUpO1xyXG4gICAgICAgIGxldCBuZXh0ICA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhlbnRyeSwgMSk7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgZW50cnkuc2V0QXR0cmlidXRlKCdkaXNhYmxlZCcsICcnKTtcclxuICAgICAgICBlbnRyeS5yZW1vdmVBdHRyaWJ1dGUoJ3RhYmluZGV4Jyk7XHJcbiAgICAgICAgZW50cnkudGl0bGUgPSAnJztcclxuXHJcbiAgICAgICAgLy8gU2hpZnQgZm9jdXMgdG8gbmV4dCBhdmFpbGFibGUgZWxlbWVudCwgZm9yIGtleWJvYXJkIG5hdmlnYXRpb25cclxuICAgICAgICBpZiAobmV4dClcclxuICAgICAgICAgICAgbmV4dC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIGEgc3RhdGlvbidzIGNob2ljZSBlbGVtZW50IGJ5IGl0cyBjb2RlICovXHJcbiAgICBwcml2YXRlIGdldEJ5Q29kZShjb2RlOiBzdHJpbmcpIDogSFRNTEVsZW1lbnRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbnB1dENob2ljZXNcclxuICAgICAgICAgICAgLnF1ZXJ5U2VsZWN0b3IoYGRkW2RhdGEtY29kZT0ke2NvZGV9XWApIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlICovXHJcbiAgICBwcml2YXRlIGFkZFN0YXRpb24oY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IFJBRy5kYXRhYmFzZS5zdGF0aW9uc1tjb2RlXTtcclxuICAgICAgICBsZXQgbGV0dGVyICA9IHN0YXRpb25bMF07XHJcbiAgICAgICAgbGV0IGdyb3VwICAgPSB0aGlzLmRvbVN0YXRpb25zW2xldHRlcl07XHJcblxyXG4gICAgICAgIGlmICghZ3JvdXApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaGVhZGVyICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZHQnKTtcclxuICAgICAgICAgICAgaGVhZGVyLmlubmVyVGV4dCA9IGxldHRlci50b1VwcGVyQ2FzZSgpO1xyXG4gICAgICAgICAgICBoZWFkZXIudGFiSW5kZXggID0gLTE7XHJcblxyXG4gICAgICAgICAgICBncm91cCA9IHRoaXMuZG9tU3RhdGlvbnNbbGV0dGVyXSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RsJyk7XHJcbiAgICAgICAgICAgIGdyb3VwLnRhYkluZGV4ID0gNTA7XHJcblxyXG4gICAgICAgICAgICBncm91cC5zZXRBdHRyaWJ1dGUoJ2dyb3VwJywgJycpO1xyXG4gICAgICAgICAgICBncm91cC5hcHBlbmRDaGlsZChoZWFkZXIpO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5hcHBlbmRDaGlsZChncm91cCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgZW50cnkgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG4gICAgICAgIGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSA9IGNvZGU7XHJcbiAgICAgICAgZW50cnkuaW5uZXJUZXh0ICAgICAgID0gUkFHLmRhdGFiYXNlLnN0YXRpb25zW2NvZGVdO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlICAgICAgICAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgICAgIGVudHJ5LnRhYkluZGV4ICAgICAgICA9IC0xO1xyXG5cclxuICAgICAgICBncm91cC5hcHBlbmRDaGlsZChlbnRyeSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBTdGF0aW9uIGxpc3QgaXRlbSB0aGF0IGNhbiBiZSBkcmFnZ2VkIGFuZCBkcm9wcGVkICovXHJcbmNsYXNzIFN0YXRpb25MaXN0SXRlbVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBET00gdGVtcGxhdGUgdG8gY2xvbmUsIGZvciBlYWNoIGl0ZW0gY3JlYXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgVEVNUExBVEUgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgZGV0YWNoZXMgdGhlIHRlbXBsYXRlIG9uIGZpcnN0IGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURSAgICA9IERPTS5yZXF1aXJlKCcjc3RhdGlvbkxpc3RJdGVtVGVtcGxhdGUnKTtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuaWQgPSAnJztcclxuXHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgaXRlbSdzIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb20gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBzdGF0aW9uIGxpc3QgaXRlbSwgbWVhbnQgZm9yIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGNyZWF0ZSB0aGlzIGl0ZW0gZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcihjb2RlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUpXHJcbiAgICAgICAgICAgIFN0YXRpb25MaXN0SXRlbS5pbml0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgICA9IFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJUZXh0ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSwgZmFsc2UpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5kYXRhc2V0Wydjb2RlJ10gPSBjb2RlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQmFzZSBjbGFzcyBmb3IgcGlja2VyIHZpZXdzICovXHJcbmFic3RyYWN0IGNsYXNzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb20gICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBmb3JtIERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tRm9ybSAgIDogSFRNTEZvcm1FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGhlYWRlciBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tSGVhZGVyIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogR2V0cyB0aGUgbmFtZSBvZiB0aGUgWE1MIHRhZyB0aGlzIHBpY2tlciBoYW5kbGVzICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgeG1sVGFnICAgIDogc3RyaW5nO1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBocmFzZSBlbGVtZW50IGJlaW5nIGVkaXRlZCBieSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHJvdGVjdGVkIGRvbUVkaXRpbmc/IDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgcGlja2VyIHRvIGhhbmRsZSB0aGUgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQgdHlwZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30geG1sVGFnIE5hbWUgb2YgdGhlIFhNTCB0YWcgdGhpcyBwaWNrZXIgd2lsbCBoYW5kbGUuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3Rvcih4bWxUYWc6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSAgICAgICA9IERPTS5yZXF1aXJlKGAjJHt4bWxUYWd9UGlja2VyYCk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtICAgPSBET00ucmVxdWlyZSgnZm9ybScsICAgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyID0gRE9NLnJlcXVpcmUoJ2hlYWRlcicsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLnhtbFRhZyAgICA9IHhtbFRhZztcclxuXHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uY2hhbmdlICA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25pbnB1dCAgID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmNsaWNrICAgPSB0aGlzLm9uQ2xpY2suYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25rZXlkb3duID0gdGhpcy5vbklucHV0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uc3VibWl0ICA9IHRoaXMub25TdWJtaXQuYmluZCh0aGlzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENhbGxlZCB3aGVuIGZvcm0gZmllbGRzIGNoYW5nZS4gVGhlIGltcGxlbWVudGluZyBwaWNrZXIgc2hvdWxkIHVwZGF0ZSBhbGwgbGlua2VkXHJcbiAgICAgKiBlbGVtZW50cyAoZS5nLiBvZiBzYW1lIHR5cGUpIHdpdGggdGhlIG5ldyBkYXRhIGhlcmUuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBvbkNoYW5nZShldjogRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKiogQ2FsbGVkIHdoZW4gYSBtb3VzZSBjbGljayBoYXBwZW5zIGFueXdoZXJlIGluIG9yIG9uIHRoZSBwaWNrZXIncyBmb3JtICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkO1xyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiBhIGtleSBpcyBwcmVzc2VkIHdoaWxzdCB0aGUgcGlja2VyJ3MgZm9ybSBpcyBmb2N1c2VkICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2FsbGVkIHdoZW4gRU5URVIgaXMgcHJlc3NlZCB3aGlsc3QgYSBmb3JtIGNvbnRyb2wgb2YgdGhlIHBpY2tlciBpcyBmb2N1c2VkLlxyXG4gICAgICogQnkgZGVmYXVsdCwgdGhpcyB3aWxsIHRyaWdnZXIgdGhlIG9uQ2hhbmdlIGhhbmRsZXIgYW5kIGNsb3NlIHRoZSBkaWFsb2cuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgdGhpcy5vbkNoYW5nZShldik7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogT3BlbiB0aGlzIHBpY2tlciBmb3IgYSBnaXZlbiBwaHJhc2UgZWxlbWVudC4gVGhlIGltcGxlbWVudGluZyBwaWNrZXIgc2hvdWxkIGZpbGxcclxuICAgICAqIGl0cyBmb3JtIGVsZW1lbnRzIHdpdGggZGF0YSBmcm9tIHRoZSBjdXJyZW50IHN0YXRlIGFuZCB0YXJnZXRlZCBlbGVtZW50IGhlcmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gdGFyZ2V0IFBocmFzZSBlbGVtZW50IHRoYXQgdGhpcyBwaWNrZXIgaXMgYmVpbmcgb3BlbmVkIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuICAgICAgICB0aGlzLmRvbUVkaXRpbmcgPSB0YXJnZXQ7XHJcbiAgICAgICAgdGhpcy5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBGaXgga2V5Ym9hcmQgc3RheWluZyBvcGVuIGluIGlPUyBvbiBjbG9zZVxyXG4gICAgICAgIERPTS5ibHVyQWN0aXZlKHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvc2l0aW9ucyB0aGlzIHBpY2tlciByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0IHBocmFzZSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgbGF5b3V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRvbUVkaXRpbmcpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IHRhcmdldFJlY3QgPSB0aGlzLmRvbUVkaXRpbmcuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgbGV0IGZ1bGxXaWR0aCAgPSB0aGlzLmRvbS5jbGFzc0xpc3QuY29udGFpbnMoJ2Z1bGxXaWR0aCcpO1xyXG4gICAgICAgIGxldCBpc01vZGFsICAgID0gdGhpcy5kb20uY2xhc3NMaXN0LmNvbnRhaW5zKCdtb2RhbCcpO1xyXG4gICAgICAgIGxldCBkb2NXICAgICAgID0gZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aDtcclxuICAgICAgICBsZXQgZG9jSCAgICAgICA9IGRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0O1xyXG4gICAgICAgIGxldCBkaWFsb2dYICAgID0gKHRhcmdldFJlY3QubGVmdCAgIHwgMCkgLSA4O1xyXG4gICAgICAgIGxldCBkaWFsb2dZICAgID0gIHRhcmdldFJlY3QuYm90dG9tIHwgMDtcclxuICAgICAgICBsZXQgZGlhbG9nVyAgICA9ICh0YXJnZXRSZWN0LndpZHRoICB8IDApICsgMTY7XHJcblxyXG4gICAgICAgIC8vIEFkanVzdCBpZiBob3Jpem9udGFsbHkgb2ZmIHNjcmVlblxyXG4gICAgICAgIGlmICghZnVsbFdpZHRoICYmICFpc01vZGFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gRm9yY2UgZnVsbCB3aWR0aCBvbiBtb2JpbGVcclxuICAgICAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUud2lkdGggPSBgMTAwJWA7XHJcblxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS53aWR0aCAgICA9IGBpbml0aWFsYDtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLm1pbldpZHRoID0gYCR7ZGlhbG9nV31weGA7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGRpYWxvZ1ggKyB0aGlzLmRvbS5vZmZzZXRXaWR0aCA+IGRvY1cpXHJcbiAgICAgICAgICAgICAgICAgICAgZGlhbG9nWCA9ICh0YXJnZXRSZWN0LnJpZ2h0IHwgMCkgLSB0aGlzLmRvbS5vZmZzZXRXaWR0aCArIDg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaWNrZXJzIHRoYXQgaW5zdGVhZCB0YWtlIHVwIHRoZSB3aG9sZSBkaXNwbGF5LiBDU1MgaXNuJ3QgdXNlZCBoZXJlLFxyXG4gICAgICAgIC8vIGJlY2F1c2UgcGVyY2VudGFnZS1iYXNlZCBsZWZ0L3RvcCBjYXVzZXMgc3VicGl4ZWwgaXNzdWVzIG9uIENocm9tZS5cclxuICAgICAgICBpZiAoaXNNb2RhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGRpYWxvZ1ggPSBET00uaXNNb2JpbGUgPyAwIDpcclxuICAgICAgICAgICAgICAgICggKGRvY1cgICogMC4xKSAvIDIgKSB8IDA7XHJcblxyXG4gICAgICAgICAgICBkaWFsb2dZID0gRE9NLmlzTW9iaWxlID8gMCA6XHJcbiAgICAgICAgICAgICAgICAoIChkb2NIICogMC4xKSAvIDIgKSB8IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDbGFtcCB0byB0b3AgZWRnZSBvZiBkb2N1bWVudFxyXG4gICAgICAgIGVsc2UgaWYgKGRpYWxvZ1kgPCAwKVxyXG4gICAgICAgICAgICBkaWFsb2dZID0gMDtcclxuXHJcbiAgICAgICAgLy8gQWRqdXN0IGlmIHZlcnRpY2FsbHkgb2ZmIHNjcmVlblxyXG4gICAgICAgIGVsc2UgaWYgKGRpYWxvZ1kgKyB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgPiBkb2NIKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZGlhbG9nWSA9ICh0YXJnZXRSZWN0LnRvcCB8IDApIC0gdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ICsgMTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5hZGQoJ2JlbG93Jyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdhYm92ZScpO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgc3RpbGwgb2ZmLXNjcmVlbiwgY2xhbXAgdG8gYm90dG9tXHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dZICsgdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ID4gZG9jSClcclxuICAgICAgICAgICAgICAgIGRpYWxvZ1kgPSBkb2NIIC0gdGhpcy5kb20ub2Zmc2V0SGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgLy8gQ2xhbXAgdG8gdG9wIGVkZ2Ugb2YgZG9jdW1lbnQuIExpa2VseSBoYXBwZW5zIGlmIHRhcmdldCBlbGVtZW50IGlzIGxhcmdlLlxyXG4gICAgICAgICAgICBpZiAoZGlhbG9nWSA8IDApXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dZID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5hZGQoJ2Fib3ZlJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdiZWxvdycpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5kb20uc3R5bGUubGVmdCA9IChmdWxsV2lkdGggPyAwIDogZGlhbG9nWCkgKyAncHgnO1xyXG4gICAgICAgIHRoaXMuZG9tLnN0eWxlLnRvcCAgPSBkaWFsb2dZICsgJ3B4JztcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmV0dXJucyB0cnVlIGlmIGFuIGVsZW1lbnQgaW4gdGhpcyBwaWNrZXIgY3VycmVudGx5IGhhcyBmb2N1cyAqL1xyXG4gICAgcHVibGljIGhhc0ZvY3VzKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmNvbnRhaW5zKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBjb2FjaCBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIENvYWNoUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBsZXR0ZXIgZHJvcC1kb3duIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMZXR0ZXIgOiBIVE1MU2VsZWN0RWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IGNvYWNoIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdjb2FjaCcpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyID0gRE9NLnJlcXVpcmUoJ3NlbGVjdCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCAyNjsgaSsrKVxyXG4gICAgICAgICAgICBET00uYWRkT3B0aW9uKHRoaXMuaW5wdXRMZXR0ZXIsIEwuTEVUVEVSU1tpXSwgTC5MRVRURVJTW2ldKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIHRhcmdldCBjb250ZXh0J3MgY29hY2ggbGV0dGVyICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfQ09BQ0godGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9IFJBRy5zdGF0ZS5nZXRDb2FjaCh0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgY29hY2ggZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9DT0FDSF9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldENvYWNoKHRoaXMuY3VycmVudEN0eCwgdGhpcy5pbnB1dExldHRlci52YWx1ZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPWNvYWNoXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgZXhjdXNlIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgRXhjdXNlUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignZXhjdXNlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0VYQ1VTRSgpO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2UuZXhjdXNlcy5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBleGN1c2UgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgZXhjdXNlXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdChSQUcuc3RhdGUuZXhjdXNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIGV4Y3VzZSBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5leGN1c2UgPSBlbnRyeS5pbm5lclRleHQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoJ2V4Y3VzZScsIFJBRy5zdGF0ZS5leGN1c2UpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBpbnRlZ2VyIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgSW50ZWdlclBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbnVtZXJpY2FsIGlucHV0IHNwaW5uZXIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXREaWdpdCA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3Mgb3B0aW9uYWwgc3VmZml4IGxhYmVsICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUxhYmVsICAgOiBIVE1MTGFiZWxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4PyA6IHN0cmluZztcclxuICAgIC8qKiBIb2xkcyB0aGUgb3B0aW9uYWwgc2luZ3VsYXIgc3VmZml4IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzaW5ndWxhcj8gICA6IHN0cmluZztcclxuICAgIC8qKiBIb2xkcyB0aGUgb3B0aW9uYWwgcGx1cmFsIHN1ZmZpeCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgcGx1cmFsPyAgICAgOiBzdHJpbmc7XHJcbiAgICAvKiogV2hldGhlciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCB3YW50cyB3b3JkIGRpZ2l0cyAqL1xyXG4gICAgcHJpdmF0ZSB3b3Jkcz8gICAgICA6IGJvb2xlYW47XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignaW50ZWdlcicpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21MYWJlbCAgID0gRE9NLnJlcXVpcmUoJ2xhYmVsJywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICAvLyBpT1MgbmVlZHMgZGlmZmVyZW50IHR5cGUgYW5kIHBhdHRlcm4gdG8gc2hvdyBhIG51bWVyaWNhbCBrZXlib2FyZFxyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQudHlwZSAgICA9ICd0ZWwnO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQucGF0dGVybiA9ICdbMC05XSsnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIHRhcmdldCBjb250ZXh0J3MgaW50ZWdlciBkYXRhICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5zaW5ndWxhciAgID0gdGFyZ2V0LmRhdGFzZXRbJ3Npbmd1bGFyJ107XHJcbiAgICAgICAgdGhpcy5wbHVyYWwgICAgID0gdGFyZ2V0LmRhdGFzZXRbJ3BsdXJhbCddO1xyXG4gICAgICAgIHRoaXMud29yZHMgICAgICA9IFBhcnNlLmJvb2xlYW4odGFyZ2V0LmRhdGFzZXRbJ3dvcmRzJ10gfHwgJ2ZhbHNlJyk7XHJcblxyXG4gICAgICAgIGxldCB2YWx1ZSA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKHRoaXMuc2luZ3VsYXIgJiYgdmFsdWUgPT09IDEpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5zaW5ndWxhcjtcclxuICAgICAgICBlbHNlIGlmICh0aGlzLnBsdXJhbCAmJiB2YWx1ZSAhPT0gMSlcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnBsdXJhbDtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gJyc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0lOVEVHRVIodGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQudmFsdWUgICAgPSB2YWx1ZS50b1N0cmluZygpO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBpbnRlZ2VyIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfSU5UX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICAvLyBDYW4ndCB1c2UgdmFsdWVBc051bWJlciBkdWUgdG8gaU9TIGlucHV0IHR5cGUgd29ya2Fyb3VuZHNcclxuICAgICAgICBsZXQgaW50ICAgID0gcGFyc2VJbnQodGhpcy5pbnB1dERpZ2l0LnZhbHVlKTtcclxuICAgICAgICBsZXQgaW50U3RyID0gKHRoaXMud29yZHMpXHJcbiAgICAgICAgICAgID8gTC5ESUdJVFNbaW50XSB8fCBpbnQudG9TdHJpbmcoKVxyXG4gICAgICAgICAgICA6IGludC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgaW52YWxpZCB2YWx1ZXNcclxuICAgICAgICBpZiAoIGlzTmFOKGludCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gJyc7XHJcblxyXG4gICAgICAgIGlmIChpbnQgPT09IDEgJiYgdGhpcy5zaW5ndWxhcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7dGhpcy5zaW5ndWxhcn1gO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMuc2luZ3VsYXI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKGludCAhPT0gMSAmJiB0aGlzLnBsdXJhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7dGhpcy5wbHVyYWx9YDtcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnBsdXJhbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRJbnRlZ2VyKHRoaXMuY3VycmVudEN0eCwgaW50KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9aW50ZWdlcl1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgbmFtZWQgdHJhaW4gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBOYW1lZFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ25hbWVkJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX05BTUVEKCk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5uYW1lZC5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBuYW1lXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdChSQUcuc3RhdGUubmFtZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgbmFtZWQgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUubmFtZWQgPSBlbnRyeS5pbm5lclRleHQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoJ25hbWVkJywgUkFHLnN0YXRlLm5hbWVkKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGhyYXNlc2V0IHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgUGhyYXNlc2V0UGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSByZWZlcmVuY2UgdGFnIGZvciB0aGUgY3VycmVudCBwaHJhc2VzZXQgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFJlZj8gOiBzdHJpbmc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigncGhyYXNlc2V0Jyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBwaHJhc2VzZXQncyBsaXN0IG9mIHBocmFzZXMgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgbGV0IHJlZiA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdyZWYnKTtcclxuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoIERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdpZHgnKSApO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9QU0VUX1VOS05PV04ocmVmKSApO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRSZWYgICAgICAgICAgPSByZWY7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfUEhSQVNFU0VUKHJlZik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5jbGVhcigpO1xyXG5cclxuICAgICAgICAvLyBGb3IgZWFjaCBwaHJhc2UsIHdlIG5lZWQgdG8gcnVuIGl0IHRocm91Z2ggdGhlIHBocmFzZXIgdXNpbmcgdGhlIGN1cnJlbnQgc3RhdGVcclxuICAgICAgICAvLyB0byBnZW5lcmF0ZSBcInByZXZpZXdzXCIgb2YgaG93IHRoZSBwaHJhc2Ugd2lsbCBsb29rLlxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGhyYXNlc2V0LmNoaWxkcmVuLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHBocmFzZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcblxyXG4gICAgICAgICAgICBET00uY2xvbmVJbnRvKHBocmFzZXNldC5jaGlsZHJlbltpXSBhcyBIVE1MRWxlbWVudCwgcGhyYXNlKTtcclxuICAgICAgICAgICAgUkFHLnBocmFzZXIucHJvY2VzcyhwaHJhc2UpO1xyXG5cclxuICAgICAgICAgICAgcGhyYXNlLmlubmVyVGV4dCAgID0gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dChwaHJhc2UpO1xyXG4gICAgICAgICAgICBwaHJhc2UuZGF0YXNldC5pZHggPSBpLnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmRvbUNob29zZXIuYWRkUmF3KHBocmFzZSwgaSA9PT0gaWR4KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBwaHJhc2VzZXQgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFJlZilcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9QU0VUX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoZW50cnkuZGF0YXNldFsnaWR4J10hKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFBocmFzZXNldElkeCh0aGlzLmN1cnJlbnRSZWYsIGlkeCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IucmVmcmVzaFBocmFzZXNldCh0aGlzLmN1cnJlbnRSZWYpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBwbGF0Zm9ybSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFBsYXRmb3JtUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBudW1lcmljYWwgaW5wdXQgc3Bpbm5lciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dERpZ2l0ICA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbGV0dGVyIGRyb3AtZG93biBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGV0dGVyIDogSFRNTFNlbGVjdEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigncGxhdGZvcm0nKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0ICAgICAgICAgID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIgICAgICAgICA9IERPTS5yZXF1aXJlKCdzZWxlY3QnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfUExBVEZPUk0oKTtcclxuXHJcbiAgICAgICAgLy8gaU9TIG5lZWRzIGRpZmZlcmVudCB0eXBlIGFuZCBwYXR0ZXJuIHRvIHNob3cgYSBudW1lcmljYWwga2V5Ym9hcmRcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnR5cGUgICAgPSAndGVsJztcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnBhdHRlcm4gPSAnWzAtOV0rJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgcGxhdGZvcm0gZGF0YSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICBsZXQgdmFsdWUgPSBSQUcuc3RhdGUucGxhdGZvcm07XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC52YWx1ZSAgPSB2YWx1ZVswXTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gdmFsdWVbMV07XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHBsYXRmb3JtIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gSWdub3JlIGludmFsaWQgdmFsdWVzXHJcbiAgICAgICAgaWYgKCBpc05hTiggcGFyc2VJbnQodGhpcy5pbnB1dERpZ2l0LnZhbHVlKSApIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUucGxhdGZvcm0gPSBbdGhpcy5pbnB1dERpZ2l0LnZhbHVlLCB0aGlzLmlucHV0TGV0dGVyLnZhbHVlXTtcclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoICdwbGF0Zm9ybScsIFJBRy5zdGF0ZS5wbGF0Zm9ybS5qb2luKCcnKSApO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2VydmljZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFNlcnZpY2VQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHNlcnZpY2UgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3NlcnZpY2UnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5zZXJ2aWNlcy5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBzZXJ2aWNlICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU0VSVklDRSh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBzZXJ2aWNlXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdCggUkFHLnN0YXRlLmdldFNlcnZpY2UodGhpcy5jdXJyZW50Q3R4KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgc2VydmljZSBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1NFUlZJQ0VfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTZXJ2aWNlKHRoaXMuY3VycmVudEN0eCwgZW50cnkuaW5uZXJUZXh0KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9c2VydmljZV1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBlbnRyeS5pbm5lclRleHQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0aW9uIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU3RhdGlvblBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3Mgc2hhcmVkIHN0YXRpb24gY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGNob29zZXIgOiBTdGF0aW9uQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHN0YXRpb24gZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9uT3BlbiBkZWxlZ2F0ZSBmb3IgU3RhdGlvblBpY2tlciBvciBmb3IgU3RhdGlvbkxpc3RQaWNrZXIgKi9cclxuICAgIHByb3RlY3RlZCBvbk9wZW4gICAgIDogKHRhcmdldDogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHRhZzogc3RyaW5nID0gJ3N0YXRpb24nKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKHRhZyk7XHJcblxyXG4gICAgICAgIGlmICghU3RhdGlvblBpY2tlci5jaG9vc2VyKVxyXG4gICAgICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIgPSBuZXcgU3RhdGlvbkNob29zZXIodGhpcy5kb21Gb3JtKTtcclxuXHJcbiAgICAgICAgdGhpcy5vbk9wZW4gPSB0aGlzLm9uU3RhdGlvblBpY2tlck9wZW4uYmluZCh0aGlzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlyZXMgdGhlIG9uT3BlbiBkZWxlZ2F0ZSByZWdpc3RlcmVkIGZvciB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG4gICAgICAgIHRoaXMub25PcGVuKHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEF0dGFjaGVzIHRoZSBzdGF0aW9uIGNob29zZXIgYW5kIGZvY3VzZXMgaXQgb250byB0aGUgY3VycmVudCBlbGVtZW50J3Mgc3RhdGlvbiAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3RhdGlvblBpY2tlck9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNob29zZXIgICAgID0gU3RhdGlvblBpY2tlci5jaG9vc2VyO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGNob29zZXIuYXR0YWNoKHRoaXMsIHRoaXMub25TZWxlY3RTdGF0aW9uKTtcclxuICAgICAgICBjaG9vc2VyLnByZXNlbGVjdENvZGUoIFJBRy5zdGF0ZS5nZXRTdGF0aW9uKHRoaXMuY3VycmVudEN0eCkgKTtcclxuICAgICAgICBjaG9vc2VyLnNlbGVjdE9uQ2xpY2sgPSB0cnVlO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TVEFUSU9OKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIHN0YXRpb24gY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uQ2xpY2soZXYpOyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uSW5wdXQoZXYpOyB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBzdGF0aW9uIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0U3RhdGlvbihlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBxdWVyeSA9IGBbZGF0YS10eXBlPXN0YXRpb25dW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYDtcclxuICAgICAgICBsZXQgY29kZSAgPSBlbnRyeS5kYXRhc2V0Wydjb2RlJ10hO1xyXG4gICAgICAgIGxldCBuYW1lICA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUsIHRydWUpO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U3RhdGlvbih0aGlzLmN1cnJlbnRDdHgsIGNvZGUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShxdWVyeSlcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gbmFtZSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJzdGF0aW9uUGlja2VyLnRzXCIvPlxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiLi4vLi4vdmVuZG9yL2RyYWdnYWJsZS5kLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0aW9uIGxpc3QgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTdGF0aW9uTGlzdFBpY2tlciBleHRlbmRzIFN0YXRpb25QaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNvbnRhaW5lciBmb3IgdGhlIGxpc3QgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21MaXN0ICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1vYmlsZS1vbmx5IGFkZCBzdGF0aW9uIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5BZGQgICAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1vYmlsZS1vbmx5IGNsb3NlIHBpY2tlciBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQ2xvc2UgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBkcm9wIHpvbmUgZm9yIGRlbGV0aW5nIHN0YXRpb24gZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tRGVsICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBhY3R1YWwgc29ydGFibGUgbGlzdCBvZiBzdGF0aW9ucyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExpc3QgICAgOiBIVE1MRExpc3RFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byBwbGFjZWhvbGRlciBzaG93biBpZiB0aGUgbGlzdCBpcyBlbXB0eSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21FbXB0eUxpc3QgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKFwic3RhdGlvbmxpc3RcIik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tTGlzdCAgICAgID0gRE9NLnJlcXVpcmUoJy5zdGF0aW9uTGlzdCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmJ0bkFkZCAgICAgICA9IERPTS5yZXF1aXJlKCcuYWRkU3RhdGlvbicsICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuYnRuQ2xvc2UgICAgID0gRE9NLnJlcXVpcmUoJy5jbG9zZVBpY2tlcicsIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5kb21EZWwgICAgICAgPSBET00ucmVxdWlyZSgnLmRlbFN0YXRpb24nLCAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmlucHV0TGlzdCAgICA9IERPTS5yZXF1aXJlKCdkbCcsICAgICAgICAgICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0ID0gRE9NLnJlcXVpcmUoJ3AnLCAgICAgICAgICAgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5vbk9wZW4gICAgICAgPSB0aGlzLm9uU3RhdGlvbkxpc3RQaWNrZXJPcGVuLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIG5ldyBEcmFnZ2FibGUuU29ydGFibGUoW3RoaXMuaW5wdXRMaXN0LCB0aGlzLmRvbURlbF0sIHsgZHJhZ2dhYmxlOiAnZGQnIH0pXHJcbiAgICAgICAgICAgIC8vIEhhdmUgdG8gdXNlIHRpbWVvdXQsIHRvIGxldCBEcmFnZ2FibGUgZmluaXNoIHNvcnRpbmcgdGhlIGxpc3RcclxuICAgICAgICAgICAgLm9uKCAnZHJhZzpzdG9wJywgZXYgPT4gc2V0VGltZW91dCgoKSA9PiB0aGlzLm9uRHJhZ1N0b3AoZXYpLCAxKSApXHJcbiAgICAgICAgICAgIC5vbiggJ21pcnJvcjpjcmVhdGUnLCB0aGlzLm9uRHJhZ01pcnJvckNyZWF0ZS5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQb3B1bGF0ZXMgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyLCB3aXRoIHRoZSBzZWxlY3RlZCBsaXN0LiBCZWNhdXNlIHRoaXMgcGlja2VyXHJcbiAgICAgKiBleHRlbmRzIGZyb20gU3RhdGlvbkxpc3QsIHRoaXMgaGFuZGxlciBvdmVycmlkZXMgdGhlICdvbk9wZW4nIGRlbGVnYXRlIHByb3BlcnR5XHJcbiAgICAgKiBvZiBTdGF0aW9uTGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IFN0YXRpb24gbGlzdCBlZGl0b3IgZWxlbWVudCB0byBvcGVuIGZvclxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdGF0aW9uTGlzdFBpY2tlck9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2luY2Ugd2Ugc2hhcmUgdGhlIHN0YXRpb24gcGlja2VyIHdpdGggU3RhdGlvbkxpc3QsIGdyYWIgaXRcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuYXR0YWNoKHRoaXMsIHRoaXMub25BZGRTdGF0aW9uKTtcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuc2VsZWN0T25DbGljayA9IGZhbHNlO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBlbnRyaWVzICAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdCh0aGlzLmN1cnJlbnRDdHgpLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NUQVRJT05MSVNUKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIC8vIFJlbW92ZSBhbGwgb2xkIGxpc3QgZWxlbWVudHNcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgICAgICAgLy8gRmluYWxseSwgcG9wdWxhdGUgbGlzdCBmcm9tIHRoZSBjbGlja2VkIHN0YXRpb24gbGlzdCBlbGVtZW50XHJcbiAgICAgICAgZW50cmllcy5mb3JFYWNoKCB2ID0+IHRoaXMuYWRkKHYpICk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkIHsgc3VwZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xpY2sgZXZlbnRzLCBmb3IgY2hvb3NpbmcgaXRlbXMgKi9cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vbkNsaWNrKGV2KTtcclxuXHJcbiAgICAgICAgaWYgKGV2LnRhcmdldCA9PT0gdGhpcy5idG5DbG9zZSlcclxuICAgICAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIC8vIEZvciBtb2JpbGUgdXNlcnMsIHN3aXRjaCB0byBzdGF0aW9uIGNob29zZXIgc2NyZWVuIGlmIFwiQWRkLi4uXCIgd2FzIGNsaWNrZWRcclxuICAgICAgICBpZiAoZXYudGFyZ2V0ID09PSB0aGlzLmJ0bkFkZClcclxuICAgICAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LmFkZCgnYWRkaW5nU3RhdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGtleWJvYXJkIG5hdmlnYXRpb24gZm9yIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciAqL1xyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9uSW5wdXQoZXYpO1xyXG5cclxuICAgICAgICBsZXQga2V5ICAgICA9IGV2LmtleTtcclxuICAgICAgICBsZXQgZm9jdXNlZCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgaGFuZGxlIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciBjb250cm9sXHJcbiAgICAgICAgaWYgKCAhZm9jdXNlZCB8fCAhdGhpcy5pbnB1dExpc3QuY29udGFpbnMoZm9jdXNlZCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBrZXlib2FyZCBuYXZpZ2F0aW9uXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5ID09PSAnQXJyb3dSaWdodCcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZGlyID0gKGtleSA9PT0gJ0Fycm93TGVmdCcpID8gLTEgOiAxO1xyXG4gICAgICAgICAgICBsZXQgbmF2ID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGZvY3VzZWQgZWxlbWVudFxyXG4gICAgICAgICAgICBpZiAoZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0TGlzdClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsZXZhbnQgdG8gYmVnaW5uaW5nIG9yIGVuZCBvZiBjb250YWluZXJcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID09PSAtMSlcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5sYXN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKG5hdikgbmF2LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgZW50cnkgZGVsZXRpb25cclxuICAgICAgICBpZiAoa2V5ID09PSAnRGVsZXRlJyB8fCBrZXkgPT09ICdCYWNrc3BhY2UnKVxyXG4gICAgICAgIGlmIChmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRMaXN0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gRm9jdXMgb24gbmV4dCBlbGVtZW50IG9yIHBhcmVudCBvbiBkZWxldGVcclxuICAgICAgICAgICAgbGV0IG5leHQgPSBmb2N1c2VkLnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBmb2N1c2VkLm5leHRFbGVtZW50U2libGluZyAgICAgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCB0aGlzLmlucHV0TGlzdDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGZvY3VzZWQpO1xyXG4gICAgICAgICAgICBuZXh0LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVyIGZvciB3aGVuIGEgc3RhdGlvbiBpcyBjaG9zZW4gKi9cclxuICAgIHByaXZhdGUgb25BZGRTdGF0aW9uKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5ld0VudHJ5ID0gdGhpcy5hZGQoZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcblxyXG4gICAgICAgIC8vIFN3aXRjaCBiYWNrIHRvIGJ1aWxkZXIgc2NyZWVuLCBpZiBvbiBtb2JpbGVcclxuICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QucmVtb3ZlKCdhZGRpbmdTdGF0aW9uJyk7XHJcbiAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuXHJcbiAgICAgICAgLy8gRm9jdXMgb25seSBpZiBvbiBtb2JpbGUsIHNpbmNlIHRoZSBzdGF0aW9uIGxpc3QgaXMgb24gYSBkZWRpY2F0ZWQgc2NyZWVuXHJcbiAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICAgICAgbmV3RW50cnkuZG9tLmZvY3VzKCk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBuZXdFbnRyeS5kb20uc2Nyb2xsSW50b1ZpZXcoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRml4ZXMgbWlycm9ycyBub3QgaGF2aW5nIGNvcnJlY3Qgd2lkdGggb2YgdGhlIHNvdXJjZSBlbGVtZW50LCBvbiBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgb25EcmFnTWlycm9yQ3JlYXRlKGV2OiBEcmFnZ2FibGUuRHJhZ0V2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIWV2LmRhdGEuc291cmNlIHx8ICFldi5kYXRhLm9yaWdpbmFsU291cmNlKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1NMX0RSQUdfTUlTU0lORygpICk7XHJcblxyXG4gICAgICAgIGV2LmRhdGEuc291cmNlLnN0eWxlLndpZHRoID0gZXYuZGF0YS5vcmlnaW5hbFNvdXJjZS5jbGllbnRXaWR0aCArICdweCc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgZHJhZ2dhYmxlIHN0YXRpb24gbmFtZSBiZWluZyBkcm9wcGVkICovXHJcbiAgICBwcml2YXRlIG9uRHJhZ1N0b3AoZXY6IERyYWdnYWJsZS5EcmFnRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoZXYuZGF0YS5vcmlnaW5hbFNvdXJjZS5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmRvbURlbClcclxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhbmQgYWRkcyBhIG5ldyBlbnRyeSBmb3IgdGhlIGJ1aWxkZXIgbGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGNyZWF0ZSBhbiBpdGVtIGZvclxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFkZChjb2RlOiBzdHJpbmcpIDogU3RhdGlvbkxpc3RJdGVtXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5ld0VudHJ5ID0gbmV3IFN0YXRpb25MaXN0SXRlbShjb2RlKTtcclxuXHJcbiAgICAgICAgLy8gQWRkIHRoZSBuZXcgZW50cnkgdG8gdGhlIHNvcnRhYmxlIGxpc3RcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5hcHBlbmRDaGlsZChuZXdFbnRyeS5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xyXG5cclxuICAgICAgICAvLyBEaXNhYmxlIHRoZSBhZGRlZCBzdGF0aW9uIGluIHRoZSBjaG9vc2VyXHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmRpc2FibGUoY29kZSk7XHJcblxyXG4gICAgICAgIC8vIERlbGV0ZSBpdGVtIG9uIGRvdWJsZSBjbGlja1xyXG4gICAgICAgIG5ld0VudHJ5LmRvbS5vbmRibGNsaWNrID0gXyA9PiB0aGlzLnJlbW92ZShuZXdFbnRyeS5kb20pO1xyXG5cclxuICAgICAgICByZXR1cm4gbmV3RW50cnk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZW1vdmVzIHRoZSBnaXZlbiBzdGF0aW9uIGVudHJ5IGVsZW1lbnQgZnJvbSB0aGUgYnVpbGRlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZW50cnkgRWxlbWVudCBvZiB0aGUgc3RhdGlvbiBlbnRyeSB0byByZW1vdmVcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZW1vdmUoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoICF0aGlzLmRvbUxpc3QuY29udGFpbnMoZW50cnkpIClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ0F0dGVtcHRlZCB0byByZW1vdmUgZW50cnkgbm90IG9uIHN0YXRpb24gbGlzdCBidWlsZGVyJyk7XHJcblxyXG4gICAgICAgIC8vIEVuYWJsZWQgdGhlIHJlbW92ZWQgc3RhdGlvbiBpbiB0aGUgY2hvb3NlclxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5lbmFibGUoZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcblxyXG4gICAgICAgIGVudHJ5LnJlbW92ZSgpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlucHV0TGlzdC5jaGlsZHJlbi5sZW5ndGggPT09IDApXHJcbiAgICAgICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBzdGF0aW9uIGxpc3QgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgY2hpbGRyZW4gPSB0aGlzLmlucHV0TGlzdC5jaGlsZHJlbjtcclxuXHJcbiAgICAgICAgLy8gRG9uJ3QgdXBkYXRlIGlmIGxpc3QgaXMgZW1wdHlcclxuICAgICAgICBpZiAoY2hpbGRyZW4ubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCBsaXN0ID0gW107XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZW50cnkgPSBjaGlsZHJlbltpXSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgIGxpc3QucHVzaChlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCB0ZXh0TGlzdCA9IFN0cmluZ3MuZnJvbVN0YXRpb25MaXN0KGxpc3Quc2xpY2UoKSwgdGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICBsZXQgcXVlcnkgICAgPSBgW2RhdGEtdHlwZT1zdGF0aW9ubGlzdF1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U3RhdGlvbkxpc3QodGhpcy5jdXJyZW50Q3R4LCBsaXN0KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkocXVlcnkpXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRleHRMaXN0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgdGltZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFRpbWVQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIHRpbWUgaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dFRpbWU6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCB0aW1lIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCd0aW1lJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIHRpbWUgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9USU1FKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lLnZhbHVlID0gUkFHLnN0YXRlLmdldFRpbWUodGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICB0aGlzLmlucHV0VGltZS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSB0aW1lIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfVElNRV9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFRpbWUodGhpcy5jdXJyZW50Q3R4LCB0aGlzLmlucHV0VGltZS52YWx1ZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPXRpbWVdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5pbnB1dFRpbWUudmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIExhbmd1YWdlIGVudHJpZXMgYXJlIHRlbXBsYXRlIGRlbGVnYXRlcyAqL1xyXG50eXBlIExhbmd1YWdlRW50cnkgPSAoLi4ucGFydHM6IHN0cmluZ1tdKSA9PiBzdHJpbmcgO1xyXG5cclxuYWJzdHJhY3QgY2xhc3MgQmFzZUxhbmd1YWdlXHJcbntcclxuICAgIFtpbmRleDogc3RyaW5nXSA6IExhbmd1YWdlRW50cnkgfCBzdHJpbmcgfCBzdHJpbmdbXTtcclxuXHJcbiAgICAvLyBSQUdcclxuXHJcbiAgICAvKiogV2VsY29tZSBtZXNzYWdlLCBzaG93biBvbiBtYXJxdWVlIG9uIGZpcnN0IGxvYWQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFdFTENPTUUgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcXVpcmVkIERPTSBlbGVtZW50IGlzIG1pc3NpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERPTV9NSVNTSU5HICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcXVpcmVkIGVsZW1lbnQgYXR0cmlidXRlIGlzIG1pc3NpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEFUVFJfTUlTU0lORyAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcXVpcmVkIGRhdGFzZXQgZW50cnkgaXMgbWlzc2luZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREFUQV9NSVNTSU5HICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQmFkIGRpcmVjdGlvbiBhcmd1bWVudCBnaXZlbiB0byBkaXJlY3Rpb25hbCBmdW5jdGlvbiAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQkFEX0RJUkVDVElPTiA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQmFkIGJvb2xlYW4gc3RyaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBCQURfQk9PTEVBTiAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBTdGF0ZVxyXG5cclxuICAgIC8qKiBTdGF0ZSBzdWNjZXNzZnVsbHkgbG9hZGVkIGZyb20gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfRlJPTV9TVE9SQUdFICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTdGF0ZSBzdWNjZXNzZnVsbHkgc2F2ZWQgdG8gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfVE9fU1RPUkFHRSAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBJbnN0cnVjdGlvbnMgZm9yIGNvcHkvcGFzdGluZyBzYXZlZCBzdGF0ZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfQ09QWV9QQVNURSAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBIZWFkZXIgZm9yIGR1bXBlZCByYXcgc3RhdGUgSlNPTiAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfUkFXX0pTT04gICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBDb3VsZCBub3Qgc2F2ZSBzdGF0ZSB0byBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9TQVZFX0ZBSUwgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIE5vIHN0YXRlIHdhcyBhdmFpbGFibGUgdG8gbG9hZCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfU0FWRV9NSVNTSU5HICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBOb24tZXhpc3RlbnQgcGhyYXNlc2V0IHJlZmVyZW5jZSB3aGVuIGdldHRpbmcgZnJvbSBzdGF0ZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfTk9ORVhJU1RBTlRfUEhSQVNFU0VUIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBDb25maWdcclxuXHJcbiAgICAvKiogQ29uZmlnIGZhaWxlZCB0byBsb2FkIGZyb20gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQ09ORklHX0xPQURfRkFJTCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIENvbmZpZyBmYWlsZWQgdG8gc2F2ZSB0byBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBDT05GSUdfU0FWRV9GQUlMICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQ29uZmlnIGZhaWxlZCB0byBjbGVhciBmcm9tIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IENPTkZJR19SRVNFVF9GQUlMIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBEYXRhYmFzZVxyXG5cclxuICAgIC8qKiBHaXZlbiBlbGVtZW50IGlzbid0IGEgcGhyYXNlc2V0IGlGcmFtZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRSA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogVW5rbm93biBzdGF0aW9uIGNvZGUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERCX1VOS05PV05fU1RBVElPTiAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFN0YXRpb24gY29kZSB3aXRoIGJsYW5rIG5hbWUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERCX0VNUFRZX1NUQVRJT04gICAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFBpY2tpbmcgdG9vIG1hbnkgc3RhdGlvbiBjb2RlcyBpbiBvbmUgZ28gKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERCX1RPT19NQU5ZX1NUQVRJT05TICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFRvb2xiYXJcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSB0ZXh0IGZvciB0b29sYmFyIGJ1dHRvbnNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfUExBWSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TVE9QICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NIVUZGTEUgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU0FWRSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9MT0FEICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NFVFRJTkdTIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBFZGl0b3JcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSB0ZXh0IGZvciBlZGl0b3IgZWxlbWVudHNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX0NPQUNIICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX0VYQ1VTRSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX0lOVEVHRVIgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX05BTUVEICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX09QVF9PUEVOICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX09QVF9DTE9TRSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1BIUkFTRVNFVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1BMQVRGT1JNICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1NFUlZJQ0UgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1NUQVRJT04gICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1NUQVRJT05MSVNUIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1RJTUUgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvKiogSW5pdGlhbCBtZXNzYWdlIHdoZW4gc2V0dGluZyB1cCBlZGl0b3IgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEVESVRPUl9JTklUICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVwbGFjZW1lbnQgdGV4dCBmb3IgdW5rbm93biBlZGl0b3IgZWxlbWVudHMgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEVESVRPUl9VTktOT1dOX0VMRU1FTlQgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVwbGFjZW1lbnQgdGV4dCBmb3IgZWRpdG9yIHBocmFzZXMgd2l0aCB1bmtub3duIHJlZmVyZW5jZSBpZHMgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEVESVRPUl9VTktOT1dOX1BIUkFTRSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVwbGFjZW1lbnQgdGV4dCBmb3IgZWRpdG9yIHBocmFzZXNldHMgd2l0aCB1bmtub3duIHJlZmVyZW5jZSBpZHMgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEVESVRPUl9VTktOT1dOX1BIUkFTRVNFVCA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gUGhyYXNlclxyXG5cclxuICAgIC8qKiBUb28gbWFueSBsZXZlbHMgb2YgcmVjdXJzaW9uIGluIHRoZSBwaHJhc2VyICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQSFJBU0VSX1RPT19SRUNVUlNJVkUgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFBpY2tlcnNcclxuXHJcbiAgICAvLyBIZWFkZXJzIGZvciBwaWNrZXIgZGlhbG9nc1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX0NPQUNIICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9FWENVU0UgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfSU5URUdFUiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX05BTUVEICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9QSFJBU0VTRVQgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfUExBVEZPUk0gICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1NFUlZJQ0UgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9TVEFUSU9OICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfU1RBVElPTkxJU1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1RJTUUgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSBhbmQgcGxhY2Vob2xkZXIgdGV4dCBmb3IgcGlja2VyIGNvbnRyb2xzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0dFTkVSSUNfVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfR0VORVJJQ19QSCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9DT0FDSF9UICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0VYQ1VTRV9UICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfRVhDVVNFX1BIICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9FWENVU0VfSVRFTV9UICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0lOVF9UICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfTkFNRURfVCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9OQU1FRF9QSCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX05BTUVEX0lURU1fVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX1BIICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfSVRFTV9UICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUExBVF9OVU1CRVJfVCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QTEFUX0xFVFRFUl9UICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZfVCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVl9QSCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWX0lURU1fVCAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NUQVRJT05fVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU1RBVElPTl9QSCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TVEFUSU9OX0lURU1fVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0FERCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQUREX1QgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9DTE9TRSAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0NMT1NFX1QgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfRU1QVFkgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9EUkFHX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RFTEVURSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfREVMRVRFX1QgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9JVEVNX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1RJTUVfVCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvKiogQ29hY2ggcGlja2VyJ3Mgb25DaGFuZ2UgZmlyZWQgd2l0aG91dCBjb250ZXh0ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0NPQUNIX01JU1NJTkdfU1RBVEUgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogSW50ZWdlciBwaWNrZXIncyBvbkNoYW5nZSBmaXJlZCB3aXRob3V0IGNvbnRleHQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfSU5UX01JU1NJTkdfU1RBVEUgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBQaHJhc2VzZXQgcGlja2VyJ3Mgb25TZWxlY3QgZmlyZWQgd2l0aG91dCByZWZlcmVuY2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9NSVNTSU5HX1NUQVRFICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTZXJ2aWNlIHBpY2tlcidzIG9uU2VsZWN0IGZpcmVkIHdpdGhvdXQgcmVmZXJlbmNlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZJQ0VfTUlTU0lOR19TVEFURSA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU2VydmljZSBwaWNrZXIncyBvbkNoYW5nZSBmaXJlZCB3aXRob3V0IHJlZmVyZW5jZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9USU1FX01JU1NJTkdfU1RBVEUgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFBocmFzZXNldCBwaWNrZXIgb3BlbmVkIGZvciB1bmtub3duIHBocmFzZXNldCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX1VOS05PV04gICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIERyYWcgbWlycm9yIGNyZWF0ZSBldmVudCBpbiBzdGF0aW9uIGxpc3QgbWlzc2luZyBzdGF0ZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9EUkFHX01JU1NJTkcgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFNldHRpbmdzXHJcblxyXG4gICAgLy8gVG9vbHRpcHMvdGl0bGUgYW5kIGxhYmVsIHRleHQgZm9yIHNldHRpbmdzIGVsZW1lbnRzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVCAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfVCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX0NPTkZJUk0gICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9DT05GSVJNX1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfRE9ORSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NBVkUgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TQVZFX1QgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9DSE9JQ0UgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfRU1QVFkgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1ZPTCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9QSVRDSCAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfUkFURSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1RFU1QgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9URVNUX1QgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9MRUdBTCAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFVJIGNvbnRyb2xzXHJcblxyXG4gICAgLyoqIEhlYWRlciBmb3IgdGhlIFwidG9vIHNtYWxsXCIgd2FybmluZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgV0FSTl9TSE9SVF9IRUFERVIgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEJvZHkgdGV4dCBmb3IgdGhlIFwidG9vIHNtYWxsXCIgd2FybmluZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgV0FSTl9TSE9SVCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIE1pc2MuIGNvbnN0YW50c1xyXG5cclxuICAgIC8qKiBBcnJheSBvZiB0aGUgZW50aXJlIGFscGhhYmV0IG9mIHRoZSBsYW5ndWFnZSwgZm9yIGNvYWNoIGxldHRlcnMgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IExFVFRFUlMgOiBzdHJpbmc7XHJcbiAgICAvKiogQXJyYXkgb2YgbnVtYmVycyBhcyB3b3JkcyAoZS5nLiB6ZXJvLCBvbmUsIHR3byksIG1hdGNoaW5nIHRoZWlyIGluZGV4ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBESUdJVFMgIDogc3RyaW5nW107XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJCYXNlTGFuZ3VhZ2UudHNcIi8+XHJcblxyXG5jbGFzcyBFbmdsaXNoTGFuZ3VhZ2UgZXh0ZW5kcyBCYXNlTGFuZ3VhZ2Vcclxue1xyXG4gICAgV0VMQ09NRSAgICAgICA9ICgpID0+ICdXZWxjb21lIHRvIFJhaWwgQW5ub3VuY2VtZW50IEdlbmVyYXRvci4nO1xyXG4gICAgRE9NX01JU1NJTkcgICA9IChxOiBzdHJpbmcpID0+IGBSZXF1aXJlZCBET00gZWxlbWVudCBpcyBtaXNzaW5nOiAnJHtxfSdgO1xyXG4gICAgQVRUUl9NSVNTSU5HICA9IChhOiBzdHJpbmcpID0+IGBSZXF1aXJlZCBhdHRyaWJ1dGUgaXMgbWlzc2luZzogJyR7YX0nYDtcclxuICAgIERBVEFfTUlTU0lORyAgPSAoazogc3RyaW5nKSA9PiBgUmVxdWlyZWQgZGF0YXNldCBrZXkgaXMgbWlzc2luZyBvciBlbXB0eTogJyR7a30nYDtcclxuICAgIEJBRF9ESVJFQ1RJT04gPSAodjogc3RyaW5nKSA9PiBgRGlyZWN0aW9uIG5lZWRzIHRvIGJlIC0xIG9yIDEsIG5vdCAnJHt2fSdgO1xyXG4gICAgQkFEX0JPT0xFQU4gICA9ICh2OiBzdHJpbmcpID0+IGBHaXZlbiBzdHJpbmcgZG9lcyBub3QgcmVwcmVzZW50IGEgYm9vbGVhbjogJyR7dn0nYDtcclxuXHJcbiAgICBTVEFURV9GUk9NX1NUT1JBR0UgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTdGF0ZSBoYXMgYmVlbiBsb2FkZWQgZnJvbSBzdG9yYWdlLic7XHJcbiAgICBTVEFURV9UT19TVE9SQUdFICAgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTdGF0ZSBoYXMgYmVlbiBzYXZlZCB0byBzdG9yYWdlLCBhbmQgZHVtcGVkIHRvIGNvbnNvbGUuJztcclxuICAgIFNUQVRFX0NPUFlfUEFTVEUgICAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJyVjQ29weSBhbmQgcGFzdGUgdGhpcyBpbiBjb25zb2xlIHRvIGxvYWQgbGF0ZXI6JztcclxuICAgIFNUQVRFX1JBV19KU09OICAgICAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJyVjUmF3IEpTT04gc3RhdGU6JztcclxuICAgIFNUQVRFX1NBVkVfRkFJTCAgICAgICAgICAgICA9IChtc2c6IHN0cmluZykgPT5cclxuICAgICAgICBgU29ycnksIHN0YXRlIGNvdWxkIG5vdCBiZSBzYXZlZCB0byBzdG9yYWdlOiAke21zZ30uYDtcclxuICAgIFNUQVRFX1NBVkVfTUlTU0lORyAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1NvcnJ5LCBubyBzdGF0ZSB3YXMgZm91bmQgaW4gc3RvcmFnZS4nO1xyXG4gICAgU1RBVEVfTk9ORVhJU1RBTlRfUEhSQVNFU0VUID0gKHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQXR0ZW1wdGVkIHRvIGdldCBjaG9zZW4gaW5kZXggZm9yIHBocmFzZXNldCAoJHtyfSkgdGhhdCBkb2Vzbid0IGV4aXN0YDtcclxuXHJcbiAgICBDT05GSUdfTE9BRF9GQUlMICA9IChtc2c6IHN0cmluZykgPT4gYENvdWxkIG5vdCBsb2FkIHNldHRpbmdzOiAke21zZ31gO1xyXG4gICAgQ09ORklHX1NBVkVfRkFJTCAgPSAobXNnOiBzdHJpbmcpID0+IGBDb3VsZCBub3Qgc2F2ZSBzZXR0aW5nczogJHttc2d9YDtcclxuICAgIENPTkZJR19SRVNFVF9GQUlMID0gKG1zZzogc3RyaW5nKSA9PiBgQ291bGQgbm90IGNsZWFyIHNldHRpbmdzOiAke21zZ31gO1xyXG5cclxuICAgIERCX0VMRU1FTlRfTk9UX1BIUkFTRVNFVF9JRlJBTUUgPSAoZTogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDb25maWd1cmVkIHBocmFzZXNldCBlbGVtZW50IHF1ZXJ5ICgke2V9KSBkb2VzIG5vdCBwb2ludCB0byBhbiBpRnJhbWUgZW1iZWRgO1xyXG4gICAgREJfVU5LTk9XTl9TVEFUSU9OICAgPSAoYzogc3RyaW5nKSA9PiBgVU5LTk9XTiBTVEFUSU9OOiAke2N9YDtcclxuICAgIERCX0VNUFRZX1NUQVRJT04gICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgU3RhdGlvbiBkYXRhYmFzZSBhcHBlYXJzIHRvIGNvbnRhaW4gYW4gZW1wdHkgbmFtZSBmb3IgY29kZSAnJHtjfSdgO1xyXG4gICAgREJfVE9PX01BTllfU1RBVElPTlMgPSAoKSA9PiAnUGlja2luZyB0b28gbWFueSBzdGF0aW9ucyB0aGFuIHRoZXJlIGFyZSBhdmFpbGFibGUnO1xyXG5cclxuICAgIFRPT0xCQVJfUExBWSAgICAgPSAoKSA9PiAnUGxheSBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TVE9QICAgICA9ICgpID0+ICdTdG9wIHBsYXlpbmcgcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU0hVRkZMRSAgPSAoKSA9PiAnR2VuZXJhdGUgcmFuZG9tIHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NBVkUgICAgID0gKCkgPT4gJ1NhdmUgc3RhdGUgdG8gc3RvcmFnZSc7XHJcbiAgICBUT09MQkFSX0xPQUQgICAgID0gKCkgPT4gJ1JlY2FsbCBzdGF0ZSBmcm9tIHN0b3JhZ2UnO1xyXG4gICAgVE9PTEJBUl9TRVRUSU5HUyA9ICgpID0+ICdPcGVuIHNldHRpbmdzJztcclxuXHJcbiAgICBUSVRMRV9DT0FDSCAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIGNvYWNoICgnJHtjfScpYDtcclxuICAgIFRJVExFX0VYQ1VTRSAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICAnQ2xpY2sgdG8gY2hhbmdlIHRoaXMgZXhjdXNlJztcclxuICAgIFRJVExFX0lOVEVHRVIgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgbnVtYmVyICgnJHtjfScpYDtcclxuICAgIFRJVExFX05BTUVEICAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICBcIkNsaWNrIHRvIGNoYW5nZSB0aGlzIHRyYWluJ3MgbmFtZVwiO1xyXG4gICAgVElUTEVfT1BUX09QRU4gICAgPSAodDogc3RyaW5nLCByOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIG9wZW4gdGhpcyBvcHRpb25hbCAke3R9ICgnJHtyfScpYDtcclxuICAgIFRJVExFX09QVF9DTE9TRSAgID0gKHQ6IHN0cmluZywgcjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjbG9zZSB0aGlzIG9wdGlvbmFsICR7dH0gKCcke3J9JylgO1xyXG4gICAgVElUTEVfUEhSQVNFU0VUICAgPSAocjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhlIHBocmFzZSB1c2VkIGluIHRoaXMgc2VjdGlvbiAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9QTEFURk9STSAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgXCJDbGljayB0byBjaGFuZ2UgdGhpcyB0cmFpbidzIHBsYXRmb3JtXCI7XHJcbiAgICBUSVRMRV9TRVJWSUNFICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHNlcnZpY2UgKCcke2N9JylgO1xyXG4gICAgVElUTEVfU1RBVElPTiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBzdGF0aW9uICgnJHtjfScpYDtcclxuICAgIFRJVExFX1NUQVRJT05MSVNUID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc3RhdGlvbiBsaXN0ICgnJHtjfScpYDtcclxuICAgIFRJVExFX1RJTUUgICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdGltZSAoJyR7Y30nKWA7XHJcblxyXG4gICAgRURJVE9SX0lOSVQgICAgICAgICAgICAgID0gKCkgPT4gJ1BsZWFzZSB3YWl0Li4uJztcclxuICAgIEVESVRPUl9VTktOT1dOX0VMRU1FTlQgICA9IChuOiBzdHJpbmcpID0+IGAoVU5LTk9XTiBYTUwgRUxFTUVOVDogJHtufSlgO1xyXG4gICAgRURJVE9SX1VOS05PV05fUEhSQVNFICAgID0gKHI6IHN0cmluZykgPT4gYChVTktOT1dOIFBIUkFTRTogJHtyfSlgO1xyXG4gICAgRURJVE9SX1VOS05PV05fUEhSQVNFU0VUID0gKHI6IHN0cmluZykgPT4gYChVTktOT1dOIFBIUkFTRVNFVDogJHtyfSlgO1xyXG5cclxuICAgIFBIUkFTRVJfVE9PX1JFQ1VSU0lWRSA9ICgpID0+XHJcbiAgICAgICAgJ1RvbyBtYW55IGxldmVscyBvZiByZWN1cnNpb24gd2hpbHN0IHByb2Nlc3NpbmcgcGhyYXNlJztcclxuXHJcbiAgICBIRUFERVJfQ09BQ0ggICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgY29hY2ggbGV0dGVyIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX0VYQ1VTRSAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICAnUGljayBhbiBleGN1c2UnO1xyXG4gICAgSEVBREVSX0lOVEVHRVIgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIG51bWJlciBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9OQU1FRCAgICAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgJ1BpY2sgYSBuYW1lZCB0cmFpbic7XHJcbiAgICBIRUFERVJfUEhSQVNFU0VUICAgPSAocjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgcGhyYXNlIGZvciB0aGUgJyR7cn0nIHNlY3Rpb25gO1xyXG4gICAgSEVBREVSX1BMQVRGT1JNICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICAnUGljayBhIHBsYXRmb3JtJztcclxuICAgIEhFQURFUl9TRVJWSUNFICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBzZXJ2aWNlIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1NUQVRJT04gICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHN0YXRpb24gZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfU1RBVElPTkxJU1QgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBCdWlsZCBhIHN0YXRpb24gbGlzdCBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9USU1FICAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSB0aW1lIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG5cclxuICAgIFBfR0VORVJJQ19UICAgICAgPSAoKSA9PiAnTGlzdCBvZiBjaG9pY2VzJztcclxuICAgIFBfR0VORVJJQ19QSCAgICAgPSAoKSA9PiAnRmlsdGVyIGNob2ljZXMuLi4nO1xyXG4gICAgUF9DT0FDSF9UICAgICAgICA9ICgpID0+ICdDb2FjaCBsZXR0ZXInO1xyXG4gICAgUF9FWENVU0VfVCAgICAgICA9ICgpID0+ICdMaXN0IG9mIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiBleGN1c2VzJztcclxuICAgIFBfRVhDVVNFX1BIICAgICAgPSAoKSA9PiAnRmlsdGVyIGV4Y3VzZXMuLi4nO1xyXG4gICAgUF9FWENVU0VfSVRFTV9UICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBleGN1c2UnO1xyXG4gICAgUF9JTlRfVCAgICAgICAgICA9ICgpID0+ICdJbnRlZ2VyIHZhbHVlJztcclxuICAgIFBfTkFNRURfVCAgICAgICAgPSAoKSA9PiAnTGlzdCBvZiB0cmFpbiBuYW1lcyc7XHJcbiAgICBQX05BTUVEX1BIICAgICAgID0gKCkgPT4gJ0ZpbHRlciB0cmFpbiBuYW1lLi4uJztcclxuICAgIFBfTkFNRURfSVRFTV9UICAgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgbmFtZSc7XHJcbiAgICBQX1BTRVRfVCAgICAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgcGhyYXNlcyc7XHJcbiAgICBQX1BTRVRfUEggICAgICAgID0gKCkgPT4gJ0ZpbHRlciBwaHJhc2VzLi4uJztcclxuICAgIFBfUFNFVF9JVEVNX1QgICAgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgcGhyYXNlJztcclxuICAgIFBfUExBVF9OVU1CRVJfVCAgPSAoKSA9PiAnUGxhdGZvcm0gbnVtYmVyJztcclxuICAgIFBfUExBVF9MRVRURVJfVCAgPSAoKSA9PiAnT3B0aW9uYWwgcGxhdGZvcm0gbGV0dGVyJztcclxuICAgIFBfU0VSVl9UICAgICAgICAgPSAoKSA9PiAnTGlzdCBvZiBzZXJ2aWNlIG5hbWVzJztcclxuICAgIFBfU0VSVl9QSCAgICAgICAgPSAoKSA9PiAnRmlsdGVyIHNlcnZpY2VzLi4uJztcclxuICAgIFBfU0VSVl9JVEVNX1QgICAgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgc2VydmljZSc7XHJcbiAgICBQX1NUQVRJT05fVCAgICAgID0gKCkgPT4gJ0xpc3Qgb2Ygc3RhdGlvbiBuYW1lcyc7XHJcbiAgICBQX1NUQVRJT05fUEggICAgID0gKCkgPT4gJ0ZpbHRlciBzdGF0aW9ucy4uLic7XHJcbiAgICBQX1NUQVRJT05fSVRFTV9UID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCBvciBhZGQgdGhpcyBzdGF0aW9uJztcclxuICAgIFBfU0xfQUREICAgICAgICAgPSAoKSA9PiAnQWRkIHN0YXRpb24uLi4nO1xyXG4gICAgUF9TTF9BRERfVCAgICAgICA9ICgpID0+ICdBZGQgc3RhdGlvbiB0byB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9DTE9TRSAgICAgICA9ICgpID0+ICdDbG9zZSc7XHJcbiAgICBQX1NMX0NMT1NFX1QgICAgID0gKCkgPT4gJ0Nsb3NlIHRoaXMgcGlja2VyJztcclxuICAgIFBfU0xfRU1QVFkgICAgICAgPSAoKSA9PiAnUGxlYXNlIGFkZCBhdCBsZWFzdCBvbmUgc3RhdGlvbiB0byB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9EUkFHX1QgICAgICA9ICgpID0+ICdEcmFnZ2FibGUgc2VsZWN0aW9uIG9mIHN0YXRpb25zIGZvciB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9ERUxFVEUgICAgICA9ICgpID0+ICdEcm9wIGhlcmUgdG8gZGVsZXRlJztcclxuICAgIFBfU0xfREVMRVRFX1QgICAgPSAoKSA9PiAnRHJvcCBzdGF0aW9uIGhlcmUgdG8gZGVsZXRlIGl0IGZyb20gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfSVRFTV9UICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdEcmFnIHRvIHJlb3JkZXI7IGRvdWJsZS1jbGljayBvciBkcmFnIGludG8gZGVsZXRlIHpvbmUgdG8gcmVtb3ZlJztcclxuICAgIFBfVElNRV9UICAgICAgICAgPSAoKSA9PiAnVGltZSBlZGl0b3InO1xyXG5cclxuICAgIFBfQ09BQ0hfTUlTU0lOR19TVEFURSAgID0gKCkgPT4gJ29uQ2hhbmdlIGZpcmVkIGZvciBjb2FjaCBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX0lOVF9NSVNTSU5HX1NUQVRFICAgICA9ICgpID0+ICdvbkNoYW5nZSBmaXJlZCBmb3IgaW50ZWdlciBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX1BTRVRfTUlTU0lOR19TVEFURSAgICA9ICgpID0+ICdvblNlbGVjdCBmaXJlZCBmb3IgcGhyYXNlc2V0IHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfU0VSVklDRV9NSVNTSU5HX1NUQVRFID0gKCkgPT4gJ29uU2VsZWN0IGZpcmVkIGZvciBzZXJ2aWNlIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfVElNRV9NSVNTSU5HX1NUQVRFICAgID0gKCkgPT4gJ29uQ2hhbmdlIGZpcmVkIGZvciB0aW1lIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfUFNFVF9VTktOT1dOICAgICAgICAgID0gKHI6IHN0cmluZykgPT4gYFBocmFzZXNldCAnJHtyfScgZG9lc24ndCBleGlzdGA7XHJcbiAgICBQX1NMX0RSQUdfTUlTU0lORyAgICAgICA9ICgpID0+ICdEcmFnZ2FibGU6IE1pc3Npbmcgc291cmNlIGVsZW1lbnRzIGZvciBtaXJyb3IgZXZlbnQnO1xyXG5cclxuICAgIFNUX1JFU0VUICAgICAgICAgICA9ICgpID0+ICdSZXNldCB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9UICAgICAgICAgPSAoKSA9PiAnUmVzZXQgc2V0dGluZ3MgdG8gZGVmYXVsdHMnO1xyXG4gICAgU1RfUkVTRVRfQ09ORklSTSAgID0gKCkgPT4gJ0FyZSB5b3Ugc3VyZT8nO1xyXG4gICAgU1RfUkVTRVRfQ09ORklSTV9UID0gKCkgPT4gJ0NvbmZpcm0gcmVzZXQgdG8gZGVmYXVsdHMnO1xyXG4gICAgU1RfUkVTRVRfRE9ORSAgICAgID0gKCkgPT5cclxuICAgICAgICAnU2V0dGluZ3MgaGF2ZSBiZWVuIHJlc2V0IHRvIHRoZWlyIGRlZmF1bHRzLCBhbmQgZGVsZXRlZCBmcm9tIHN0b3JhZ2UuJztcclxuICAgIFNUX1NBVkUgICAgICAgICAgICA9ICgpID0+ICdTYXZlICYgY2xvc2UnO1xyXG4gICAgU1RfU0FWRV9UICAgICAgICAgID0gKCkgPT4gJ1NhdmUgYW5kIGNsb3NlIHNldHRpbmdzJztcclxuICAgIFNUX1NQRUVDSCAgICAgICAgICA9ICgpID0+ICdTcGVlY2gnO1xyXG4gICAgU1RfU1BFRUNIX0NIT0lDRSAgID0gKCkgPT4gJ1ZvaWNlJztcclxuICAgIFNUX1NQRUVDSF9FTVBUWSAgICA9ICgpID0+ICdOb25lIGF2YWlsYWJsZSc7XHJcbiAgICBTVF9TUEVFQ0hfVk9MICAgICAgPSAoKSA9PiAnVm9sdW1lJztcclxuICAgIFNUX1NQRUVDSF9QSVRDSCAgICA9ICgpID0+ICdQaXRjaCc7XHJcbiAgICBTVF9TUEVFQ0hfUkFURSAgICAgPSAoKSA9PiAnUmF0ZSc7XHJcbiAgICBTVF9TUEVFQ0hfVEVTVCAgICAgPSAoKSA9PiAnVGVzdCBzcGVlY2gnO1xyXG4gICAgU1RfU1BFRUNIX1RFU1RfVCAgID0gKCkgPT4gJ1BsYXkgYSBzcGVlY2ggc2FtcGxlIHdpdGggdGhlIGN1cnJlbnQgc2V0dGluZ3MnO1xyXG4gICAgU1RfTEVHQUwgICAgICAgICAgID0gKCkgPT4gJ0xlZ2FsICYgQWNrbm93bGVkZ2VtZW50cyc7XHJcblxyXG4gICAgV0FSTl9TSE9SVF9IRUFERVIgPSAoKSA9PiAnXCJNYXkgSSBoYXZlIHlvdXIgYXR0ZW50aW9uIHBsZWFzZS4uLlwiJztcclxuICAgIFdBUk5fU0hPUlQgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnVGhpcyBkaXNwbGF5IGlzIHRvbyBzaG9ydCB0byBzdXBwb3J0IFJBRy4gUGxlYXNlIG1ha2UgdGhpcyB3aW5kb3cgdGFsbGVyLCBvcicgK1xyXG4gICAgICAgICcgcm90YXRlIHlvdXIgZGV2aWNlIGZyb20gbGFuZHNjYXBlIHRvIHBvcnRyYWl0Lic7XHJcblxyXG4gICAgLy8gVE9ETzogVGhlc2UgZG9uJ3QgZml0IGhlcmU7IHRoaXMgc2hvdWxkIGdvIGluIHRoZSBkYXRhXHJcbiAgICBMRVRURVJTID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaJztcclxuICAgIERJR0lUUyAgPSBbXHJcbiAgICAgICAgJ3plcm8nLCAgICAgJ29uZScsICAgICAndHdvJywgICAgICd0aHJlZScsICAgICAnZm91cicsICAgICAnZml2ZScsICAgICdzaXgnLFxyXG4gICAgICAgICdzZXZlbicsICAgICdlaWdodCcsICAgJ25pbmUnLCAgICAndGVuJywgICAgICAgJ2VsZXZlbicsICAgJ3R3ZWx2ZScsICAndGhpcnRlZW4nLFxyXG4gICAgICAgICdmb3VydGVlbicsICdmaWZ0ZWVuJywgJ3NpeHRlZW4nLCAnc2V2ZW50ZWVuJywgJ2VpZ2h0ZWVuJywgJ25pbnRlZW4nLCAndHdlbnR5J1xyXG4gICAgXTtcclxuXHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKlxyXG4gKiBIb2xkcyBtZXRob2RzIGZvciBwcm9jZXNzaW5nIGVhY2ggdHlwZSBvZiBwaHJhc2UgZWxlbWVudCBpbnRvIEhUTUwsIHdpdGggZGF0YSB0YWtlblxyXG4gKiBmcm9tIHRoZSBjdXJyZW50IHN0YXRlLiBFYWNoIG1ldGhvZCB0YWtlcyBhIGNvbnRleHQgb2JqZWN0LCBob2xkaW5nIGRhdGEgZm9yIHRoZVxyXG4gKiBjdXJyZW50IFhNTCBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZCBhbmQgdGhlIFhNTCBkb2N1bWVudCBiZWluZyB1c2VkLlxyXG4gKi9cclxuY2xhc3MgRWxlbWVudFByb2Nlc3NvcnNcclxue1xyXG4gICAgLyoqIEZpbGxzIGluIGNvYWNoIGxldHRlcnMgZnJvbSBBIHRvIFogKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY29hY2goY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfQ09BQ0goY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZ2V0Q29hY2goY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBleGN1c2UsIGZvciBhIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBleGN1c2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9FWENVU0UoKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5leGN1c2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIGludGVnZXJzLCBvcHRpb25hbGx5IHdpdGggbm91bnMgYW5kIGluIHdvcmQgZm9ybSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbnRlZ2VyKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IHNpbmd1bGFyID0gY3R4LnhtbEVsZW1lbnQuZ2V0QXR0cmlidXRlKCdzaW5ndWxhcicpO1xyXG4gICAgICAgIGxldCBwbHVyYWwgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgncGx1cmFsJyk7XHJcbiAgICAgICAgbGV0IHdvcmRzICAgID0gY3R4LnhtbEVsZW1lbnQuZ2V0QXR0cmlidXRlKCd3b3JkcycpO1xyXG5cclxuICAgICAgICBsZXQgaW50ICAgID0gUkFHLnN0YXRlLmdldEludGVnZXIoY29udGV4dCk7XHJcbiAgICAgICAgbGV0IGludFN0ciA9ICh3b3JkcyAmJiB3b3Jkcy50b0xvd2VyQ2FzZSgpID09PSAndHJ1ZScpXHJcbiAgICAgICAgICAgID8gTC5ESUdJVFNbaW50XSB8fCBpbnQudG9TdHJpbmcoKVxyXG4gICAgICAgICAgICA6IGludC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICBpZiAgICAgIChpbnQgPT09IDEgJiYgc2luZ3VsYXIpXHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7c2luZ3VsYXJ9YDtcclxuICAgICAgICBlbHNlIGlmIChpbnQgIT09IDEgJiYgcGx1cmFsKVxyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3BsdXJhbH1gO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfSU5URUdFUihjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IGludFN0cjtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuXHJcbiAgICAgICAgaWYgKHNpbmd1bGFyKSBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydzaW5ndWxhciddID0gc2luZ3VsYXI7XHJcbiAgICAgICAgaWYgKHBsdXJhbCkgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydwbHVyYWwnXSAgID0gcGx1cmFsO1xyXG4gICAgICAgIGlmICh3b3JkcykgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnd29yZHMnXSAgICA9IHdvcmRzO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbmFtZWQoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9OQU1FRCgpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLm5hbWVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBJbmNsdWRlcyBhIHByZXZpb3VzbHkgZGVmaW5lZCBwaHJhc2UsIGJ5IGl0cyBgaWRgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBocmFzZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBwaHJhc2UgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlKHJlZik7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgICAgID0gJyc7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsncmVmJ10gPSByZWY7XHJcblxyXG4gICAgICAgIGlmICghcGhyYXNlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX1BIUkFTRShyZWYpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGhyYXNlcyB3aXRoIGEgY2hhbmNlIHZhbHVlIGFzIGNvbGxhcHNpYmxlXHJcbiAgICAgICAgaWYgKCBjdHgueG1sRWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2NoYW5jZScpIClcclxuICAgICAgICAgICAgdGhpcy5tYWtlQ29sbGFwc2libGUoY3R4LCBwaHJhc2UsIHJlZik7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBET00uY2xvbmVJbnRvKHBocmFzZSwgY3R4Lm5ld0VsZW1lbnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBJbmNsdWRlcyBhIHBocmFzZSBmcm9tIGEgcHJldmlvdXNseSBkZWZpbmVkIHBocmFzZXNldCwgYnkgaXRzIGBpZGAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGhyYXNlc2V0KGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVmICAgICAgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IHBocmFzZXNldCA9IFJBRy5kYXRhYmFzZS5nZXRQaHJhc2VzZXQocmVmKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsncmVmJ10gPSByZWY7XHJcblxyXG4gICAgICAgIGlmICghcGhyYXNlc2V0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX1BIUkFTRVNFVChyZWYpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgaWR4ICAgID0gUkFHLnN0YXRlLmdldFBocmFzZXNldElkeChyZWYpO1xyXG4gICAgICAgIGxldCBwaHJhc2UgPSBwaHJhc2VzZXQuY2hpbGRyZW5baWR4XSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnaWR4J10gPSBpZHgudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgPSBMLlRJVExFX1BIUkFTRVNFVChyZWYpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGhyYXNlc2V0cyB3aXRoIGEgY2hhbmNlIHZhbHVlIGFzIGNvbGxhcHNpYmxlXHJcbiAgICAgICAgaWYgKCBjdHgueG1sRWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2NoYW5jZScpIClcclxuICAgICAgICAgICAgdGhpcy5tYWtlQ29sbGFwc2libGUoY3R4LCBwaHJhc2UsIHJlZik7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBET00uY2xvbmVJbnRvKHBocmFzZSwgY3R4Lm5ld0VsZW1lbnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgY3VycmVudCBwbGF0Zm9ybSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwbGF0Zm9ybShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1BMQVRGT1JNKCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUucGxhdGZvcm0uam9pbignJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSByYWlsIG5ldHdvcmsgbmFtZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzZXJ2aWNlKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1NFUlZJQ0UoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZ2V0U2VydmljZShjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gc3RhdGlvbiBuYW1lcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzdGF0aW9uKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgY29kZSAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU1RBVElPTihjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUsIHRydWUpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBzdGF0aW9uIGxpc3RzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRpb25saXN0KGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCAgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IHN0YXRpb25zICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KGNvbnRleHQpLnNsaWNlKCk7XHJcbiAgICAgICAgbGV0IHN0YXRpb25MaXN0ID0gU3RyaW5ncy5mcm9tU3RhdGlvbkxpc3Qoc3RhdGlvbnMsIGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU1RBVElPTkxJU1QoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBzdGF0aW9uTGlzdDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIHRpbWUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdGltZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9USU1FKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldFRpbWUoY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdW5rbm93biBlbGVtZW50cyB3aXRoIGFuIGlubGluZSBlcnJvciBtZXNzYWdlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHVua25vd24oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBuYW1lID0gY3R4LnhtbEVsZW1lbnQubm9kZU5hbWU7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9FTEVNRU5UKG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xvbmVzIHRoZSBjaGlsZHJlbiBvZiB0aGUgZ2l2ZW4gZWxlbWVudCBpbnRvIGEgbmV3IGlubmVyIHNwYW4gdGFnLCBzbyB0aGF0IHRoZXlcclxuICAgICAqIGNhbiBiZSBtYWRlIGNvbGxhcHNpYmxlLiBBcHBlbmRzIGl0IHRvIHRoZSBuZXcgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG1ha2VDb2xsYXBzaWJsZShjdHg6IFBocmFzZUNvbnRleHQsIHNvdXJjZTogSFRNTEVsZW1lbnQsIHJlZjogc3RyaW5nKVxyXG4gICAgICAgIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjaGFuY2UgICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2NoYW5jZScpITtcclxuICAgICAgICBsZXQgaW5uZXIgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG4gICAgICAgIGxldCB0b2dnbGUgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgbGV0IGNvbGxhcHNlZCA9IFJBRy5zdGF0ZS5nZXRDb2xsYXBzZWQoIHJlZiwgcGFyc2VJbnQoY2hhbmNlKSApO1xyXG5cclxuICAgICAgICBpbm5lci5jbGFzc0xpc3QuYWRkKCdpbm5lcicpO1xyXG4gICAgICAgIHRvZ2dsZS5jbGFzc0xpc3QuYWRkKCd0b2dnbGUnKTtcclxuXHJcbiAgICAgICAgRE9NLmNsb25lSW50byhzb3VyY2UsIGlubmVyKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydjaGFuY2UnXSA9IGNoYW5jZTtcclxuXHJcbiAgICAgICAgQ29sbGFwc2libGVzLnNldChjdHgubmV3RWxlbWVudCwgdG9nZ2xlLCBjb2xsYXBzZWQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmFwcGVuZENoaWxkKHRvZ2dsZSk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQoaW5uZXIpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogUmVwcmVzZW50cyBjb250ZXh0IGRhdGEgZm9yIGEgcGhyYXNlLCB0byBiZSBwYXNzZWQgdG8gYW4gZWxlbWVudCBwcm9jZXNzb3IgKi9cclxuaW50ZXJmYWNlIFBocmFzZUNvbnRleHRcclxue1xyXG4gICAgLyoqIEdldHMgdGhlIFhNTCBwaHJhc2UgZWxlbWVudCB0aGF0IGlzIGJlaW5nIHJlcGxhY2VkICovXHJcbiAgICB4bWxFbGVtZW50IDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogR2V0cyB0aGUgSFRNTCBzcGFuIGVsZW1lbnQgdGhhdCBpcyByZXBsYWNpbmcgdGhlIFhNTCBlbGVtZW50ICovXHJcbiAgICBuZXdFbGVtZW50IDogSFRNTFNwYW5FbGVtZW50O1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKipcclxuICogSGFuZGxlcyB0aGUgdHJhbnNmb3JtYXRpb24gb2YgcGhyYXNlIFhNTCBkYXRhLCBpbnRvIEhUTUwgZWxlbWVudHMgd2l0aCB0aGVpciBkYXRhXHJcbiAqIGZpbGxlZCBpbiBhbmQgdGhlaXIgVUkgbG9naWMgd2lyZWQuXHJcbiAqL1xyXG5jbGFzcyBQaHJhc2VyXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogUmVjdXJzaXZlbHkgcHJvY2Vzc2VzIFhNTCBlbGVtZW50cywgZmlsbGluZyBpbiBkYXRhIGFuZCBhcHBseWluZyB0cmFuc2Zvcm1zLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250YWluZXIgUGFyZW50IHRvIHByb2Nlc3MgdGhlIGNoaWxkcmVuIG9mXHJcbiAgICAgKiBAcGFyYW0gbGV2ZWwgQ3VycmVudCBsZXZlbCBvZiByZWN1cnNpb24sIG1heC4gMjBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHByb2Nlc3MoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgbGV2ZWw6IG51bWJlciA9IDApXHJcbiAgICB7XHJcbiAgICAgICAgLy8gSW5pdGlhbGx5LCB0aGlzIG1ldGhvZCB3YXMgc3VwcG9zZWQgdG8ganVzdCBhZGQgdGhlIFhNTCBlbGVtZW50cyBkaXJlY3RseSBpbnRvXHJcbiAgICAgICAgLy8gdGhlIGRvY3VtZW50LiBIb3dldmVyLCB0aGlzIGNhdXNlZCBhIGxvdCBvZiBwcm9ibGVtcyAoZS5nLiB0aXRsZSBub3Qgd29ya2luZykuXHJcbiAgICAgICAgLy8gSFRNTCBkb2VzIG5vdCB3b3JrIHJlYWxseSB3ZWxsIHdpdGggY3VzdG9tIGVsZW1lbnRzLCBlc3BlY2lhbGx5IGlmIHRoZXkgYXJlIG9mXHJcbiAgICAgICAgLy8gYW5vdGhlciBYTUwgbmFtZXNwYWNlLlxyXG5cclxuICAgICAgICBsZXQgcGVuZGluZyA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCc6bm90KHNwYW4pJykgYXMgTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XHJcblxyXG4gICAgICAgIC8vIE5vIG1vcmUgWE1MIGVsZW1lbnRzIHRvIGV4cGFuZFxyXG4gICAgICAgIGlmIChwZW5kaW5nLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGb3IgZWFjaCBYTUwgZWxlbWVudCBjdXJyZW50bHkgaW4gdGhlIGNvbnRhaW5lcjpcclxuICAgICAgICAvLyAqIENyZWF0ZSBhIG5ldyBzcGFuIGVsZW1lbnQgZm9yIGl0XHJcbiAgICAgICAgLy8gKiBIYXZlIHRoZSBwcm9jZXNzb3JzIHRha2UgZGF0YSBmcm9tIHRoZSBYTUwgZWxlbWVudCwgdG8gcG9wdWxhdGUgdGhlIG5ldyBvbmVcclxuICAgICAgICAvLyAqIFJlcGxhY2UgdGhlIFhNTCBlbGVtZW50IHdpdGggdGhlIG5ldyBvbmVcclxuICAgICAgICBwZW5kaW5nLmZvckVhY2goZWxlbWVudCA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVsZW1lbnROYW1lID0gZWxlbWVudC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBsZXQgbmV3RWxlbWVudCAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgICAgIGxldCBjb250ZXh0ICAgICA9IHtcclxuICAgICAgICAgICAgICAgIHhtbEVsZW1lbnQ6IGVsZW1lbnQsXHJcbiAgICAgICAgICAgICAgICBuZXdFbGVtZW50OiBuZXdFbGVtZW50XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBuZXdFbGVtZW50LmRhdGFzZXRbJ3R5cGUnXSA9IGVsZW1lbnROYW1lO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgdGhlIGVsZW1lbnQgaXMgdm94IGhpbnRhYmxlLCBhZGQgdGhlIHZveCBoaW50XHJcbiAgICAgICAgICAgIGlmICggZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ3ZveCcpIClcclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQuZGF0YXNldFsndm94J10gPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgndm94JykhO1xyXG5cclxuICAgICAgICAgICAgLy8gSSB3YW50ZWQgdG8gdXNlIGFuIGluZGV4IG9uIEVsZW1lbnRQcm9jZXNzb3JzIGZvciB0aGlzLCBidXQgaXQgY2F1c2VkIGV2ZXJ5XHJcbiAgICAgICAgICAgIC8vIHByb2Nlc3NvciB0byBoYXZlIGFuIFwidW51c2VkIG1ldGhvZFwiIHdhcm5pbmcuXHJcbiAgICAgICAgICAgIHN3aXRjaCAoZWxlbWVudE5hbWUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgRWxlbWVudFByb2Nlc3NvcnMuY29hY2goY29udGV4dCk7ICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnZXhjdXNlJzogICAgICBFbGVtZW50UHJvY2Vzc29ycy5leGN1c2UoY29udGV4dCk7ICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLmludGVnZXIoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ25hbWVkJzogICAgICAgRWxlbWVudFByb2Nlc3NvcnMubmFtZWQoY29udGV4dCk7ICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGhyYXNlJzogICAgICBFbGVtZW50UHJvY2Vzc29ycy5waHJhc2UoY29udGV4dCk7ICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2VzZXQnOiAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZXNldChjb250ZXh0KTsgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BsYXRmb3JtJzogICAgRWxlbWVudFByb2Nlc3NvcnMucGxhdGZvcm0oY29udGV4dCk7ICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc2VydmljZSc6ICAgICBFbGVtZW50UHJvY2Vzc29ycy5zZXJ2aWNlKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnN0YXRpb24oY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbmxpc3QoY29udGV4dCk7IGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAndGltZSc6ICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy50aW1lKGNvbnRleHQpOyAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiAgICAgICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnVua25vd24oY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgZWxlbWVudC5wYXJlbnRFbGVtZW50IS5yZXBsYWNlQ2hpbGQobmV3RWxlbWVudCwgZWxlbWVudCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFJlY3Vyc2Ugc28gdGhhdCB3ZSBjYW4gZXhwYW5kIGFueSBuZXcgZWxlbWVudHNcclxuICAgICAgICBpZiAobGV2ZWwgPCAyMClcclxuICAgICAgICAgICAgdGhpcy5wcm9jZXNzKGNvbnRhaW5lciwgbGV2ZWwgKyAxKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBIUkFTRVJfVE9PX1JFQ1VSU0lWRSgpICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDdXN0b20gdm9pY2UgdGhhdCBzeW50aGVzaXplcyBzcGVlY2ggYnkgcGllY2luZyBwcmUtcmVjb3JkZWQgZmlsZXMgdG9nZXRoZXIgKi9cclxuY2xhc3MgQ3VzdG9tVm9pY2Vcclxue1xyXG4gICAgLyoqIENoYW5nZWFibGUgYmFzZSBwYXRoIGZvciBhbGwgY3VzdG9tIHZvaWNlcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBiYXNlUGF0aCA6IHN0cmluZyA9ICdkYXRhL3ZveCc7XHJcblxyXG4gICAgLyoqIE9ubHkgcHJlc2VudCBmb3IgY29uc2lzdGVuY3kgd2l0aCBTcGVlY2hTeW50aGVzaXNWb2ljZSAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRlZmF1bHQgICAgICA6IGJvb2xlYW47XHJcbiAgICAvKiogR2V0cyB0aGUgQkNQIDQ3IHRhZyBpbmRpY2F0aW5nIHRoZSBsYW5ndWFnZSBvZiB0aGlzIHZvaWNlICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgbGFuZyAgICAgICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIE9ubHkgcHJlc2VudCBmb3IgY29uc2lzdGVuY3kgd2l0aCBTcGVlY2hTeW50aGVzaXNWb2ljZSAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGxvY2FsU2VydmljZSA6IGJvb2xlYW47XHJcbiAgICAvKiogR2V0cyB0aGUgY2Fub25pY2FsIG5hbWUgb2YgdGhpcyB2b2ljZSAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IG5hbWUgICAgICAgICA6IHN0cmluZztcclxuICAgIC8qKiBHZXRzIHRoZSByZWxhdGl2ZSBVUkkgb2YgdGhpcyB2b2ljZSdzIGZpbGVzICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgdm9pY2VVUkkgICAgIDogc3RyaW5nO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIGxhbmc6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRlZmF1bHQgICAgICA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMubG9jYWxTZXJ2aWNlID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5uYW1lICAgICAgICAgPSBgUkFHLVZPWCAke25hbWV9YDtcclxuICAgICAgICB0aGlzLmxhbmcgICAgICAgICA9IGxhbmc7XHJcbiAgICAgICAgdGhpcy52b2ljZVVSSSAgICAgPSBgJHtDdXN0b21Wb2ljZS5iYXNlUGF0aH0vJHtuYW1lfV8ke2xhbmd9YDtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgY2xhc3MgZm9yIHJlc29sdmluZyBhIGdpdmVuIHBocmFzZSB0byB2b3gga2V5cyAqL1xyXG5jbGFzcyBSZXNvbHZlclxyXG57XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyB0b1ZveChwaHJhc2U6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgLy8gRmlyc3QsIHdhbGsgdGhyb3VnaCB0aGUgcGhyYXNlIGFuZCBcImZsYXR0ZW5cIiBpdCBpbnRvIGFuIGFycmF5IG9mIHBhcnRzLiBUaGlzIGlzXHJcbiAgICAgICAgLy8gc28gdGhlIHJlc29sdmVyIGNhbiBsb29rLWFoZWFkIG9yIGxvb2stYmVoaW5kLlxyXG5cclxuICAgICAgICBsZXQgZmxhdHRlbmVkIDogTm9kZVtdICAgPSBbXTtcclxuICAgICAgICBsZXQgcmVzb2x2ZWQgIDogVm94S2V5W10gPSBbXTtcclxuICAgICAgICBsZXQgdHJlZVdhbGtlciA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoXHJcbiAgICAgICAgICAgIHBocmFzZSxcclxuICAgICAgICAgICAgTm9kZUZpbHRlci5TSE9XX1RFWFQgfCBOb2RlRmlsdGVyLlNIT1dfRUxFTUVOVCxcclxuICAgICAgICAgICAgeyBhY2NlcHROb2RlOiBSZXNvbHZlci5ub2RlRmlsdGVyIH0sXHJcbiAgICAgICAgICAgIGZhbHNlXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgd2hpbGUgKCB0cmVlV2Fsa2VyLm5leHROb2RlKCkgKVxyXG4gICAgICAgIGlmICh0cmVlV2Fsa2VyLmN1cnJlbnROb2RlLnRleHRDb250ZW50IS50cmltKCkgIT09ICcnKVxyXG4gICAgICAgICAgICBmbGF0dGVuZWQucHVzaCh0cmVlV2Fsa2VyLmN1cnJlbnROb2RlKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgcmVzb2x2ZSBhbGwgdGhlIHBocmFzZXMnIG5vZGVzIGludG8gdm94IGtleXNcclxuXHJcbiAgICAgICAgZmxhdHRlbmVkLmZvckVhY2goICh2LCBpKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmVzb2x2ZWQucHVzaCggLi4uUmVzb2x2ZXIucmVzb2x2ZSh2LCBmbGF0dGVuZWQsIGkpICk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKGZsYXR0ZW5lZCk7XHJcbiAgICAgICAgcmV0dXJuIHJlc29sdmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBUcmVlV2Fsa2VyIGZpbHRlciB0byByZWR1Y2UgYSB3YWxrIHRvIGp1c3QgdGhlIGVsZW1lbnRzIHRoZSByZXNvbHZlciBuZWVkcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBub2RlRmlsdGVyKG5vZGU6IE5vZGUpOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICAgICA9IG5vZGUucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgbGV0IHBhcmVudFR5cGUgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG5cclxuICAgICAgICAvLyBJZiB0eXBlIGlzIG1pc3NpbmcsIHBhcmVudCBpcyBhIHdyYXBwZXJcclxuICAgICAgICBpZiAoIXBhcmVudFR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBwYXJlbnQgICAgID0gcGFyZW50LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgICAgICBwYXJlbnRUeXBlID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFjY2VwdCB0ZXh0IG9ubHkgZnJvbSBwaHJhc2UgYW5kIHBocmFzZXNldHNcclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpXHJcbiAgICAgICAgaWYgKHBhcmVudFR5cGUgIT09ICdwaHJhc2VzZXQnICYmIHBhcmVudFR5cGUgIT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfU0tJUDtcclxuXHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBsZXQgdHlwZSAgICA9IGVsZW1lbnQuZGF0YXNldFsndHlwZSddO1xyXG5cclxuICAgICAgICAgICAgLy8gUmVqZWN0IGNvbGxhcHNlZCBlbGVtZW50cyBhbmQgdGhlaXIgY2hpbGRyZW5cclxuICAgICAgICAgICAgaWYgKCBlbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVDtcclxuXHJcbiAgICAgICAgICAgIC8vIFNraXAgdHlwZWxlc3MgKHdyYXBwZXIpIGVsZW1lbnRzXHJcbiAgICAgICAgICAgIGlmICghdHlwZSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCBvdmVyIHBocmFzZSBhbmQgcGhyYXNlc2V0cyAoaW5zdGVhZCwgb25seSBnb2luZyBmb3IgdGhlaXIgY2hpbGRyZW4pXHJcbiAgICAgICAgICAgIGlmICh0eXBlID09PSAncGhyYXNlc2V0JyB8fCB0eXBlID09PSAncGhyYXNlJylcclxuICAgICAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVzZXMgdGhlIHR5cGUgYW5kIHZhbHVlIG9mIHRoZSBnaXZlbiBub2RlLCB0byByZXNvbHZlIGl0IHRvIHZveCBmaWxlIElEcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbm9kZSBOb2RlIHRvIHJlc29sdmUgdG8gdm94IElEc1xyXG4gICAgICogQHBhcmFtIHBocmFzZSBGbGF0dGVuZWQgYXJyYXkgb2Ygbm9kZXMgdGhhdCBtYWtlIHVwIHRoZSB3aG9sZSBwaHJhc2VcclxuICAgICAqIEBwYXJhbSBpZHggSW5kZXggb2YgdGhlIG5vZGUgYmVpbmcgcmVzb2x2ZWQgcmVsYXRpdmUgdG8gdGhlIHBocmFzZSBhcnJheVxyXG4gICAgICogQHJldHVybnMgQXJyYXkgb2YgSURzIHRoYXQgbWFrZSB1cCBvbmUgb3IgbW9yZSBmaWxlIElEcy4gQ2FuIGJlIGVtcHR5LlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlc29sdmUobm9kZTogTm9kZSwgcGhyYXNlOiBOb2RlW10sIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlVGV4dChub2RlKTtcclxuXHJcbiAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUNvYWNoKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICdleGN1c2UnOiAgICAgIHJldHVybiB0aGlzLnJlc29sdmVFeGN1c2UoKTtcclxuICAgICAgICAgICAgY2FzZSAnaW50ZWdlcic6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlSW50ZWdlcihlbGVtZW50KTtcclxuICAgICAgICAgICAgY2FzZSAnbmFtZWQnOiAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlTmFtZWQoKTtcclxuICAgICAgICAgICAgY2FzZSAncGxhdGZvcm0nOiAgICByZXR1cm4gdGhpcy5yZXNvbHZlUGxhdGZvcm0oZWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3NlcnZpY2UnOiAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVNlcnZpY2UoZWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3N0YXRpb24nOiAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVN0YXRpb24oZWxlbWVudCwgcGhyYXNlLCBpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdzdGF0aW9ubGlzdCc6IHJldHVybiB0aGlzLnJlc29sdmVTdGF0aW9uTGlzdChlbGVtZW50KTtcclxuICAgICAgICAgICAgY2FzZSAndGltZSc6ICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlVGltZShlbGVtZW50KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXNvbHZlVGV4dChub2RlOiBOb2RlKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCA9IG5vZGUucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgbGV0IHR5cGUgICA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcbiAgICAgICAgbGV0IHRleHQgICA9IFN0cmluZ3MuY2xlYW4obm9kZS50ZXh0Q29udGVudCEpO1xyXG4gICAgICAgIGxldCBzZXQgICAgPSBbXTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGV4dCBpcyBqdXN0IGEgZnVsbCBzdG9wLCByZXR1cm4gc2lsZW5jZVxyXG4gICAgICAgIGlmICh0ZXh0ID09PSAnLicpXHJcbiAgICAgICAgICAgIHJldHVybiBbMC41XTtcclxuXHJcbiAgICAgICAgLy8gSWYgaXQgYmVnaW5zIHdpdGggYSBmdWxsIHN0b3AsIGFkZCBzaWxlbmNlXHJcbiAgICAgICAgaWYgKCB0ZXh0LnN0YXJ0c1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgIHNldC5wdXNoKDAuNSk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSB0ZXh0IGRvZXNuJ3QgY29udGFpbiBhbnkgd29yZHMsIHNraXBcclxuICAgICAgICBpZiAoICF0ZXh0Lm1hdGNoKC9bYS16MC05XS9pKSApXHJcbiAgICAgICAgICAgIHJldHVybiBbXTtcclxuXHJcbiAgICAgICAgLy8gSWYgdHlwZSBpcyBtaXNzaW5nLCBwYXJlbnQgaXMgYSB3cmFwcGVyXHJcbiAgICAgICAgaWYgKCF0eXBlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcGFyZW50ID0gcGFyZW50LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgICAgICB0eXBlICAgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHJlZiA9IHBhcmVudC5kYXRhc2V0WydyZWYnXTtcclxuICAgICAgICBsZXQgaWR4ID0gRE9NLm5vZGVJbmRleE9mKG5vZGUpO1xyXG4gICAgICAgIGxldCBpZCAgPSBgcGhyYXNlLiR7cmVmfWA7XHJcblxyXG4gICAgICAgIC8vIEFwcGVuZCBpbmRleCBvZiBwaHJhc2VzZXQncyBjaG9pY2Ugb2YgcGhyYXNlXHJcbiAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnKVxyXG4gICAgICAgICAgICBpZCArPSBgLiR7cGFyZW50LmRhdGFzZXRbJ2lkeCddfWA7XHJcblxyXG4gICAgICAgIGlkICs9IGAuJHtpZHh9YDtcclxuICAgICAgICBzZXQucHVzaChpZCk7XHJcblxyXG4gICAgICAgIC8vIElmIHRleHQgZW5kcyB3aXRoIGEgZnVsbCBzdG9wLCBhZGQgc2lsZW5jZVxyXG4gICAgICAgIGlmICggdGV4dC5lbmRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgc2V0LnB1c2goMC41KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHNldDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXNvbHZlQ29hY2goZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IGNvYWNoID0gUkFHLnN0YXRlLmdldENvYWNoKGN0eCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbMC4xLCBgbGV0dGVyLiR7Y29hY2h9YCwgMC4xXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXNvbHZlRXhjdXNlKCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBleGN1c2UgPSBSQUcuc3RhdGUuZXhjdXNlO1xyXG4gICAgICAgIGxldCBpbmRleCAgPSBSQUcuZGF0YWJhc2UuZXhjdXNlcy5pbmRleE9mKGV4Y3VzZSk7XHJcblxyXG4gICAgICAgIC8vIFRPRE86IEVycm9yIGhhbmRsaW5nXHJcbiAgICAgICAgcmV0dXJuIFswLjEsIGBleGN1c2UuJHtpbmRleH1gLCAwLjFdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIHJlc29sdmVJbnRlZ2VyKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzaW5ndWxhciA9IGVsZW1lbnQuZGF0YXNldFsnc2luZ3VsYXInXTtcclxuICAgICAgICBsZXQgcGx1cmFsICAgPSBlbGVtZW50LmRhdGFzZXRbJ3BsdXJhbCddO1xyXG4gICAgICAgIGxldCBpbnRlZ2VyICA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKGN0eCk7XHJcbiAgICAgICAgbGV0IHBhcnRzICAgID0gWzAuMSwgYG51bWJlci5taWQuJHtpbnRlZ2VyfWBdO1xyXG5cclxuICAgICAgICBpZiAgICAgIChzaW5ndWxhciAmJiBpbnRlZ2VyID09PSAxKVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMSwgYG51bWJlci5zdWZmaXguJHtzaW5ndWxhcn1gKTtcclxuICAgICAgICBlbHNlIGlmIChwbHVyYWwgICAmJiBpbnRlZ2VyICE9PSAxKVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMSwgYG51bWJlci5zdWZmaXguJHtwbHVyYWx9YCk7XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJ0cztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXNvbHZlTmFtZWQoKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5hbWVkID0gU3RyaW5ncy5maWxlbmFtZShSQUcuc3RhdGUubmFtZWQpO1xyXG5cclxuICAgICAgICByZXR1cm4gWzAuMSwgYG5hbWVkLiR7bmFtZWR9YCwgMC4xXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXNvbHZlUGxhdGZvcm0oZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgcGxhdGZvcm0gPSBSQUcuc3RhdGUucGxhdGZvcm07XHJcbiAgICAgICAgbGV0IHZveCAgICAgID0gZWxlbWVudC5kYXRhc2V0Wyd2b3gnXSB8fCAnbWlkJztcclxuICAgICAgICBsZXQga2V5ICAgICAgPSBgbnVtYmVyLiR7dm94fS4ke3BsYXRmb3JtWzBdfSR7cGxhdGZvcm1bMV19YDtcclxuXHJcbiAgICAgICAgcmV0dXJuIFswLjEsIGtleSwgMC4xXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXNvbHZlU2VydmljZShlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzZXJ2aWNlID0gU3RyaW5ncy5maWxlbmFtZSggUkFHLnN0YXRlLmdldFNlcnZpY2UoY3R4KSApO1xyXG5cclxuICAgICAgICByZXR1cm4gWzAuMSwgYHNlcnZpY2UuJHtzZXJ2aWNlfWAsIDAuMV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVzb2x2ZVN0YXRpb24oZWxlbWVudDogSFRNTEVsZW1lbnQsIHBocmFzZTogTm9kZVtdLCBpZHg6IG51bWJlcilcclxuICAgICAgICA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbihjdHgpO1xyXG4gICAgICAgIGxldCBuZXh0ICAgID0gcGhyYXNlW2lkeCArIDFdO1xyXG4gICAgICAgIGxldCB0eXBlICAgID0gJ21pZCc7XHJcblxyXG4gICAgICAgIGlmICghbmV4dCB8fCBuZXh0LnRleHRDb250ZW50IS50cmltKCkgPT09ICcuJylcclxuICAgICAgICAgICAgdHlwZSA9ICdlbmQnO1xyXG5cclxuICAgICAgICByZXR1cm4gWzAuMSwgYHN0YXRpb24uJHt0eXBlfS4ke3N0YXRpb259YCwgMC4xXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXNvbHZlU3RhdGlvbkxpc3QoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgbGlzdCA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdChjdHgpO1xyXG5cclxuICAgICAgICBsZXQgcGFydHMgOiBWb3hLZXlbXSA9IFswLjFdO1xyXG5cclxuICAgICAgICBsaXN0LmZvckVhY2goICh2LCBrKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gSGFuZGxlIGVuZCBvZiBsaXN0IGluZmxlY3Rpb25cclxuICAgICAgICAgICAgaWYgKGsgPT09IGxpc3QubGVuZ3RoIC0gMSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgLy8gQWRkIFwiYW5kXCIgaWYgbGlzdCBoYXMgbW9yZSB0aGFuIDEgc3RhdGlvbiBhbmQgdGhpcyBpcyB0aGUgZW5kXHJcbiAgICAgICAgICAgICAgICBpZiAobGlzdC5sZW5ndGggPiAxKVxyXG4gICAgICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goMC4xNSwgJ3N0YXRpb24ucGFydHMuYW5kJywgMC4xNSk7XHJcblxyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaChgc3RhdGlvbi5lbmQuJHt2fWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24ubWlkLiR7dn1gLCAwLjI1KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gQWRkIFwib25seVwiIGlmIG9ubHkgb25lIHN0YXRpb24gaW4gdGhlIGNhbGxpbmcgbGlzdFxyXG4gICAgICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSAmJiBjdHggPT09ICdjYWxsaW5nJylcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjEsICdzdGF0aW9uLnBhcnRzLm9ubHknKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgMC4yXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXNvbHZlVGltZShlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgdGltZSAgPSBSQUcuc3RhdGUuZ2V0VGltZShjdHgpLnNwbGl0KCc6Jyk7XHJcblxyXG4gICAgICAgIGxldCBwYXJ0cyA6IFZveEtleVtdID0gWzAuMV07XHJcblxyXG4gICAgICAgIGlmICh0aW1lWzBdID09PSAnMDAnICYmIHRpbWVbMV0gPT09ICcwMCcpXHJcbiAgICAgICAgICAgIHJldHVybiBbLi4ucGFydHMsICdudW1iZXIuMDAwMCddO1xyXG5cclxuICAgICAgICAvLyBIb3Vyc1xyXG4gICAgICAgIHBhcnRzLnB1c2goYG51bWJlci5taWQuJHt0aW1lWzBdfWApO1xyXG5cclxuICAgICAgICBpZiAodGltZVsxXSA9PT0gJzAwJylcclxuICAgICAgICAgICAgcGFydHMucHVzaCgnbnVtYmVyLm1pZC5odW5kcmVkJyk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMSwgYG51bWJlci5taWQuJHt0aW1lWzFdfWApO1xyXG5cclxuICAgICAgICByZXR1cm4gWy4uLnBhcnRzLCAwLjA1XTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFVuaW9uIHR5cGUgZm9yIGJvdGgga2luZHMgb2Ygdm9pY2VzIGF2YWlsYWJsZSAqL1xyXG50eXBlIFZvaWNlID0gU3BlZWNoU3ludGhlc2lzVm9pY2UgfCBDdXN0b21Wb2ljZTtcclxuXHJcbi8qKiBNYW5hZ2VzIHNwZWVjaCBzeW50aGVzaXMgdXNpbmcgYm90aCBuYXRpdmUgYW5kIGN1c3RvbSBlbmdpbmVzICovXHJcbmNsYXNzIFNwZWVjaFxyXG57XHJcbiAgICAvKiogSW5zdGFuY2Ugb2YgdGhlIGN1c3RvbSB2b2ljZSBlbmdpbmUgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSB2b3hFbmdpbmUgOiBWb3hFbmdpbmU7XHJcblxyXG4gICAgLyoqIEFycmF5IG9mIGJyb3dzZXItcHJvdmlkZWQgdm9pY2VzIGF2YWlsYWJsZSAqL1xyXG4gICAgcHJpdmF0ZSBicm93c2VyVm9pY2VzIDogU3BlZWNoU3ludGhlc2lzVm9pY2VbXSA9IFtdO1xyXG4gICAgLyoqIEFycmF5IG9mIGN1c3RvbSBwcmUtcmVjb3JkZWQgdm9pY2VzIGF2YWlsYWJsZSAqL1xyXG4gICAgcHJpdmF0ZSBjdXN0b21Wb2ljZXMgIDogQ3VzdG9tVm9pY2VbXSAgICAgICAgICA9IFtdO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU29tZSBicm93c2VycyBkb24ndCBwcm9wZXJseSBjYW5jZWwgc3BlZWNoIG9uIHBhZ2UgY2xvc2UuXHJcbiAgICAgICAgLy8gQlVHOiBvbnBhZ2VzaG93IGFuZCBvbnBhZ2VoaWRlIG5vdCB3b3JraW5nIG9uIGlPUyAxMVxyXG4gICAgICAgIHdpbmRvdy5vbmJlZm9yZXVubG9hZCA9XHJcbiAgICAgICAgd2luZG93Lm9udW5sb2FkICAgICAgID1cclxuICAgICAgICB3aW5kb3cub25wYWdlc2hvdyAgICAgPVxyXG4gICAgICAgIHdpbmRvdy5vbnBhZ2VoaWRlICAgICA9IHRoaXMuY2FuY2VsLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50Lm9udmlzaWJpbGl0eWNoYW5nZSAgICAgICAgICAgID0gdGhpcy5vblZpc2liaWxpdHlDaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLm9udm9pY2VzY2hhbmdlZCA9IHRoaXMub25Wb2ljZXNDaGFuZ2VkLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEV2ZW4gdGhvdWdoICdvbnZvaWNlc2NoYW5nZWQnIGlzIHVzZWQgbGF0ZXIgdG8gcG9wdWxhdGUgdGhlIGxpc3QsIENocm9tZSBkb2VzXHJcbiAgICAgICAgLy8gbm90IGFjdHVhbGx5IGZpcmUgdGhlIGV2ZW50IHVudGlsIHRoaXMgY2FsbC4uLlxyXG4gICAgICAgIHRoaXMub25Wb2ljZXNDaGFuZ2VkKCk7XHJcblxyXG4gICAgICAgIC8vIFRPRE86IE1ha2UgdGhpcyBhIGR5bmFtaWMgcmVnaXN0cmF0aW9uIGFuZCBjaGVjayBmb3IgZmVhdHVyZXNcclxuICAgICAgICB0aGlzLnZveEVuZ2luZSA9IG5ldyBWb3hFbmdpbmUoKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXN0b21Wb2ljZXMucHVzaCggbmV3IEN1c3RvbVZvaWNlKCdUZXN0JywgJ2VuLUdCJykgKTtcclxuICAgICAgICB0aGlzLmN1c3RvbVZvaWNlcy5wdXNoKCBuZXcgQ3VzdG9tVm9pY2UoJ1JveScsICAnZW4tR0InKSApO1xyXG4gICAgICAgIHRoaXMuY3VzdG9tVm9pY2VzLnB1c2goIG5ldyBDdXN0b21Wb2ljZSgnUm95UmF3JywgICdlbi1HQicpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgYWxsIHRoZSB2b2ljZXMgY3VycmVudGx5IGF2YWlsYWJsZSAqL1xyXG4gICAgcHVibGljIGdldFZvaWNlcygpIDogVm9pY2VbXVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmN1c3RvbVZvaWNlcy5jb25jYXQodGhpcy5icm93c2VyVm9pY2VzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQmVnaW5zIHNwZWFraW5nIHRoZSBnaXZlbiBwaHJhc2UgY29tcG9uZW50cyAqL1xyXG4gICAgcHVibGljIHNwZWFrKHBocmFzZTogSFRNTEVsZW1lbnQsIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncyA9IHt9KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBSZXNldCB0byBmaXJzdCB2b2ljZSwgaWYgY29uZmlndXJlZCBjaG9pY2UgaXMgbWlzc2luZ1xyXG4gICAgICAgIGxldCB2b2ljZXMgICA9IHRoaXMuZ2V0Vm9pY2VzKCk7XHJcbiAgICAgICAgbGV0IHZvaWNlSWR4ID0gZWl0aGVyKHNldHRpbmdzLnZvaWNlSWR4LCBSQUcuY29uZmlnLnNwZWVjaFZvaWNlKTtcclxuICAgICAgICBsZXQgdm9pY2UgICAgPSB2b2ljZXNbdm9pY2VJZHhdIHx8IHZvaWNlc1swXTtcclxuICAgICAgICBsZXQgZW5naW5lICAgPSAodm9pY2UgaW5zdGFuY2VvZiBDdXN0b21Wb2ljZSlcclxuICAgICAgICAgICAgPyB0aGlzLnNwZWFrQ3VzdG9tLmJpbmQodGhpcylcclxuICAgICAgICAgICAgOiB0aGlzLnNwZWFrQnJvd3Nlci5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICBlbmdpbmUocGhyYXNlLCB2b2ljZSwgc2V0dGluZ3MpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdG9wcyBhbmQgY2FuY2VscyBhbGwgcXVldWVkIHNwZWVjaCAqL1xyXG4gICAgcHVibGljIGNhbmNlbCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuY2FuY2VsKCk7XHJcbiAgICAgICAgdGhpcy52b3hFbmdpbmUuc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQYXVzZSBhbmQgdW5wYXVzZSBzcGVlY2ggaWYgdGhlIHBhZ2UgaXMgaGlkZGVuIG9yIHVuaGlkZGVuICovXHJcbiAgICBwcml2YXRlIG9uVmlzaWJpbGl0eUNoYW5nZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBoaWRpbmcgPSAoZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSAnaGlkZGVuJyk7XHJcblxyXG4gICAgICAgIGlmIChoaWRpbmcpIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMucGF1c2UoKTtcclxuICAgICAgICBlbHNlICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnJlc3VtZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGFzeW5jIHZvaWNlIGxpc3QgbG9hZGluZyBvbiBzb21lIGJyb3dzZXJzLCBhbmQgc2V0cyBkZWZhdWx0ICovXHJcbiAgICBwcml2YXRlIG9uVm9pY2VzQ2hhbmdlZCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuYnJvd3NlclZvaWNlcyA9IHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuZ2V0Vm9pY2VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb252ZXJ0cyB0aGUgZ2l2ZW4gcGhyYXNlIHRvIHRleHQgYW5kIHNwZWFrcyBpdCB2aWEgbmF0aXZlIGJyb3dzZXIgdm9pY2VzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwaHJhc2UgUGhyYXNlIGVsZW1lbnRzIHRvIHNwZWFrXHJcbiAgICAgKiBAcGFyYW0gdm9pY2UgQnJvd3NlciB2b2ljZSB0byB1c2VcclxuICAgICAqIEBwYXJhbSBzZXR0aW5ncyBTZXR0aW5ncyB0byB1c2UgZm9yIHRoZSB2b2ljZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNwZWFrQnJvd3NlcihwaHJhc2U6IEhUTUxFbGVtZW50LCB2b2ljZTogVm9pY2UsIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncylcclxuICAgICAgICA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBUaGUgcGhyYXNlIHRleHQgaXMgc3BsaXQgaW50byBzZW50ZW5jZXMsIGFzIHF1ZXVlaW5nIGxhcmdlIHNlbnRlbmNlcyB0aGF0IGxhc3RcclxuICAgICAgICAvLyBtYW55IHNlY29uZHMgY2FuIGJyZWFrIHNvbWUgVFRTIGVuZ2luZXMgYW5kIGJyb3dzZXJzLlxyXG4gICAgICAgIGxldCB0ZXh0ICA9IERPTS5nZXRDbGVhbmVkVmlzaWJsZVRleHQocGhyYXNlKTtcclxuICAgICAgICBsZXQgcGFydHMgPSB0ZXh0LnNwbGl0KC9cXC5cXHMvaSk7XHJcblxyXG4gICAgICAgIFJBRy5zcGVlY2guY2FuY2VsKCk7XHJcbiAgICAgICAgcGFydHMuZm9yRWFjaCggKHNlZ21lbnQsIGlkeCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEFkZCBtaXNzaW5nIGZ1bGwgc3RvcCB0byBlYWNoIHNlbnRlbmNlIGV4Y2VwdCB0aGUgbGFzdCwgd2hpY2ggaGFzIGl0XHJcbiAgICAgICAgICAgIGlmIChpZHggPCBwYXJ0cy5sZW5ndGggLSAxKVxyXG4gICAgICAgICAgICAgICAgc2VnbWVudCArPSAnLic7XHJcblxyXG4gICAgICAgICAgICBsZXQgdXR0ZXJhbmNlID0gbmV3IFNwZWVjaFN5bnRoZXNpc1V0dGVyYW5jZShzZWdtZW50KTtcclxuXHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS52b2ljZSAgPSB2b2ljZTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnZvbHVtZSA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsIFJBRy5jb25maWcuc3BlZWNoVm9sKTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnBpdGNoICA9IGVpdGhlcihzZXR0aW5ncy5waXRjaCwgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2gpO1xyXG4gICAgICAgICAgICB1dHRlcmFuY2UucmF0ZSAgID0gZWl0aGVyKHNldHRpbmdzLnJhdGUsICAgUkFHLmNvbmZpZy5zcGVlY2hSYXRlKTtcclxuXHJcbiAgICAgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuc3BlYWsodXR0ZXJhbmNlKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN5bnRoZXNpemVzIHZvaWNlIGJ5IHdhbGtpbmcgdGhyb3VnaCB0aGUgZ2l2ZW4gcGhyYXNlIGVsZW1lbnRzLCByZXNvbHZpbmcgcGFydHMgdG9cclxuICAgICAqIHNvdW5kIGZpbGUgSURzLCBhbmQgZmVlZGluZyB0aGUgZW50aXJlIGFycmF5IHRvIHRoZSB2b3ggZW5naW5lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwaHJhc2UgUGhyYXNlIGVsZW1lbnRzIHRvIHNwZWFrXHJcbiAgICAgKiBAcGFyYW0gdm9pY2UgQ3VzdG9tIHZvaWNlIHRvIHVzZVxyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFNldHRpbmdzIHRvIHVzZSBmb3IgdGhlIHZvaWNlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3BlYWtDdXN0b20ocGhyYXNlOiBIVE1MRWxlbWVudCwgdm9pY2U6IFZvaWNlLCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpXHJcbiAgICAgICAgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVE9ETzogdXNlIHZvbHVtZSBzZXR0aW5nc1xyXG4gICAgICAgIHRoaXMudm94RW5naW5lLnNwZWFrKFJlc29sdmVyLnRvVm94KHBocmFzZSksIHZvaWNlLCBzZXR0aW5ncyk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBUeXBlIGRlZmluaXRpb24gZm9yIHNwZWVjaCBjb25maWcgb3ZlcnJpZGVzIHBhc3NlZCB0byB0aGUgc3BlYWsgbWV0aG9kICovXHJcbmludGVyZmFjZSBTcGVlY2hTZXR0aW5nc1xyXG57XHJcbiAgICAvKiogT3ZlcnJpZGUgY2hvaWNlIG9mIHZvaWNlICovXHJcbiAgICB2b2ljZUlkeD86IG51bWJlcjtcclxuICAgIC8qKiBPdmVycmlkZSB2b2x1bWUgb2Ygdm9pY2UgKi9cclxuICAgIHZvbHVtZT86IG51bWJlcjtcclxuICAgIC8qKiBPdmVycmlkZSBwaXRjaCBvZiB2b2ljZSAqL1xyXG4gICAgcGl0Y2g/OiBudW1iZXI7XHJcbiAgICAvKiogT3ZlcnJpZGUgcmF0ZSBvZiB2b2ljZSAqL1xyXG4gICAgcmF0ZT86IG51bWJlcjtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxudHlwZSBWb3hLZXkgPSBzdHJpbmcgfCBudW1iZXI7XHJcblxyXG4vKiogU3ludGhlc2l6ZXMgc3BlZWNoIGJ5IGR5bmFtaWNhbGx5IGxvYWRpbmcgYW5kIHBpZWNpbmcgdG9nZXRoZXIgdm9pY2UgZmlsZXMgKi9cclxuY2xhc3MgVm94RW5naW5lXHJcbntcclxuICAgIC8qKiBUaGUgY29yZSBhdWRpbyBjb250ZXh0IHRoYXQgaGFuZGxlcyBhdWRpbyBlZmZlY3RzIGFuZCBwbGF5YmFjayAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGF1ZGlvQ29udGV4dCA6IEF1ZGlvQ29udGV4dDtcclxuICAgIC8qKiBBdWRpbyBub2RlIHRoYXQgZmlsdGVycyB2b2ljZSB3aXRoIHZhcmlvdXMgZWZmZWN0cyAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGF1ZGlvRmlsdGVyICA6IEJpcXVhZEZpbHRlck5vZGU7XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgdGhpcyBlbmdpbmUgaXMgY3VycmVudGx5IHJ1bm5pbmcgYW5kIHNwZWFraW5nICovXHJcbiAgICBwdWJsaWMgIGlzU3BlYWtpbmcgICAgICAgOiBib29sZWFuICAgICAgPSBmYWxzZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgbnVtYmVyIGZvciB0aGUgY3VycmVudCBwdW1wIHRpbWVyICovXHJcbiAgICBwcml2YXRlIHB1bXBUaW1lciAgICAgICAgOiBudW1iZXIgICAgICAgPSAwO1xyXG4gICAgLyoqIFRyYWNrcyB0aGUgYXVkaW8gY29udGV4dCdzIHdhbGwtY2xvY2sgdGltZSB0byBzY2hlZHVsZSBuZXh0IGNsaXAgKi9cclxuICAgIHByaXZhdGUgbmV4dEJlZ2luICAgICAgICA6IG51bWJlciAgICAgICA9IDA7XHJcbiAgICAvKiogUmVmZXJlbmNlcyB0byBjdXJyZW50bHkgcGVuZGluZyByZXF1ZXN0cywgYXMgYSBGSUZPIHF1ZXVlICovXHJcbiAgICBwcml2YXRlIHBlbmRpbmdSZXFzICAgICAgOiBWb3hSZXF1ZXN0W10gPSBbXTtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGN1cnJlbnRseSBzY2hlZHVsZWQgYXVkaW8gYnVmZmVycyAqL1xyXG4gICAgcHJpdmF0ZSBzY2hlZHVsZWRCdWZmZXJzIDogQXVkaW9CdWZmZXJTb3VyY2VOb2RlW10gPSBbXTtcclxuICAgIC8qKiBMaXN0IG9mIHZveCBJRHMgY3VycmVudGx5IGJlaW5nIHJ1biB0aHJvdWdoICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRJZHM/ICAgICAgOiBWb3hLZXlbXTtcclxuICAgIC8qKiBWb2ljZSBjdXJyZW50bHkgYmVpbmcgdXNlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Vm9pY2U/ICAgIDogQ3VzdG9tVm9pY2U7XHJcbiAgICAvKiogU3BlZWNoIHNldHRpbmdzIGN1cnJlbnRseSBiZWluZyB1c2VkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRTZXR0aW5ncz8gOiBTcGVlY2hTZXR0aW5ncztcclxuICAgIC8qKiBBdWRpbyBub2RlIHRoYXQgYWRkcyBhIHJldmVyYiB0byB0aGUgdm9pY2UsIGlmIGF2YWlsYWJsZSAqL1xyXG4gICAgcHJpdmF0ZSBhdWRpb1JldmVyYj8gICAgIDogQ29udm9sdmVyTm9kZTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFNldHVwIHRoZSBjb3JlIGF1ZGlvIGNvbnRleHRcclxuXHJcbiAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgIGxldCBBdWRpb0NvbnRleHQgID0gd2luZG93LkF1ZGlvQ29udGV4dCB8fCB3aW5kb3cud2Via2l0QXVkaW9Db250ZXh0O1xyXG4gICAgICAgIHRoaXMuYXVkaW9Db250ZXh0ID0gbmV3IEF1ZGlvQ29udGV4dCgpO1xyXG5cclxuICAgICAgICAvLyBTZXR1cCB0YW5ub3kgZmlsdGVyXHJcblxyXG4gICAgICAgIHRoaXMuYXVkaW9GaWx0ZXIgICAgICAgICA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUJpcXVhZEZpbHRlcigpO1xyXG4gICAgICAgIHRoaXMuYXVkaW9GaWx0ZXIudHlwZSAgICA9ICdoaWdocGFzcyc7XHJcbiAgICAgICAgdGhpcy5hdWRpb0ZpbHRlci5RLnZhbHVlID0gMC40O1xyXG5cclxuICAgICAgICB0aGlzLmF1ZGlvRmlsdGVyLmNvbm5lY3QodGhpcy5hdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG5cclxuICAgICAgICAvLyBTZXR1cCByZXZlcmJcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTWFrZSB0aGlzIHVzZXIgY29uZmlndXJhYmxlIGFuZCBjaG9vc2FibGVcclxuICAgICAgICBmZXRjaCgnZGF0YS92b3gvaXIuc3RhbGJhbnNfYV9tb25vLndhdicpXHJcbiAgICAgICAgICAgIC50aGVuKCByZXMgPT4gcmVzLmFycmF5QnVmZmVyKCkgKVxyXG4gICAgICAgICAgICAudGhlbiggYnVmID0+IFNvdW5kcy5kZWNvZGUodGhpcy5hdWRpb0NvbnRleHQsIGJ1ZikgKVxyXG4gICAgICAgICAgICAudGhlbiggcmV2ID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9SZXZlcmIgICAgICAgICAgID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQ29udm9sdmVyKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvUmV2ZXJiLmJ1ZmZlciAgICA9IHJldjtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9SZXZlcmIubm9ybWFsaXplID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvRmlsdGVyLmNvbm5lY3QodGhpcy5hdWRpb1JldmVyYik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvUmV2ZXJiLmNvbm5lY3QodGhpcy5hdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFJFVkVSQiBMT0FERUQnKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCZWdpbnMgbG9hZGluZyBhbmQgc3BlYWtpbmcgYSBzZXQgb2Ygdm94IGZpbGVzLiBTdG9wcyBhbnkgc3BlZWNoLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZHMgTGlzdCBvZiB2b3ggaWRzIHRvIGxvYWQgYXMgZmlsZXMsIGluIHNwZWFraW5nIG9yZGVyXHJcbiAgICAgKiBAcGFyYW0gdm9pY2UgQ3VzdG9tIHZvaWNlIHRvIHVzZVxyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFZvaWNlIHNldHRpbmdzIHRvIHVzZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3BlYWsoaWRzOiBWb3hLZXlbXSwgdm9pY2U6IFZvaWNlLCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBTUEVBSzonLCBpZHMsIHZvaWNlLCBzZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlzU3BlYWtpbmcpXHJcbiAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgICAgICA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50SWRzICAgICAgPSBpZHM7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50Vm9pY2UgICAgPSB2b2ljZTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzO1xyXG5cclxuICAgICAgICAvLyBCZWdpbiB0aGUgcHVtcCBsb29wLiBPbiBpT1MsIHRoZSBjb250ZXh0IG1heSBoYXZlIHRvIGJlIHJlc3VtZWQgZmlyc3RcclxuICAgICAgICBpZiAodGhpcy5hdWRpb0NvbnRleHQuc3RhdGUgPT09ICdzdXNwZW5kZWQnKVxyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dC5yZXN1bWUoKS50aGVuKCAoKSA9PiB0aGlzLnB1bXAoKSApO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5wdW1wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHBsYXlpbmcgYW55IGN1cnJlbnRseSBzcG9rZW4gc3BlZWNoIGFuZCByZXNldHMgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RvcCBwdW1waW5nXHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMucHVtcFRpbWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5pc1NwZWFraW5nID0gZmFsc2U7XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbGwgcGVuZGluZyByZXF1ZXN0c1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXMuZm9yRWFjaCggciA9PiByLmNhbmNlbCgpICk7XHJcblxyXG4gICAgICAgIC8vIEtpbGwgYW5kIGRlcmVmZXJlbmNlIGFueSBjdXJyZW50bHkgcGxheWluZyBmaWxlXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzLmZvckVhY2gobm9kZSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbm9kZS5zdG9wKCk7XHJcbiAgICAgICAgICAgIG5vZGUuZGlzY29ubmVjdCgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm5leHRCZWdpbiAgICAgICAgPSAwO1xyXG4gICAgICAgIHRoaXMuY3VycmVudElkcyAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRWb2ljZSAgICAgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXMgICAgICA9IFtdO1xyXG4gICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycyA9IFtdO1xyXG5cclxuICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggU1RPUFBFRCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHVtcHMgdGhlIHNwZWVjaCBxdWV1ZSwgYnkga2VlcGluZyB1cCB0byAxMCBmZXRjaCByZXF1ZXN0cyBmb3Igdm9pY2UgZmlsZXMgZ29pbmcsXHJcbiAgICAgKiBhbmQgdGhlbiBmZWVkaW5nIHRoZWlyIGRhdGEgKGluIGVuZm9yY2VkIG9yZGVyKSB0byB0aGUgYXVkaW8gY2hhaW4sIG9uZSBhdCBhIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcHVtcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIElmIHRoZSBlbmdpbmUgaGFzIHN0b3BwZWQsIGRvIG5vdCBwcm9jZWVkLlxyXG4gICAgICAgIGlmICghdGhpcy5pc1NwZWFraW5nIHx8ICF0aGlzLmN1cnJlbnRJZHMgfHwgIXRoaXMuY3VycmVudFZvaWNlKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBzY2hlZHVsZSBmdWxmaWxsZWQgcmVxdWVzdHMgaW50byB0aGUgYXVkaW8gYnVmZmVyLCBpbiBGSUZPIG9yZGVyXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZSgpO1xyXG5cclxuICAgICAgICAvLyBUaGVuLCBmaWxsIGFueSBmcmVlIHBlbmRpbmcgc2xvdHMgd2l0aCBuZXcgcmVxdWVzdHNcclxuICAgICAgICBsZXQgbmV4dERlbGF5ID0gMDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRoaXMuY3VycmVudElkc1swXSAmJiB0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCA8IDEwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGtleSA9IHRoaXMuY3VycmVudElkcy5zaGlmdCgpITtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMga2V5IGlzIGEgbnVtYmVyLCBpdCdzIGFuIGFtb3VudCBvZiBzaWxlbmNlLCBzbyBob2xkIGl0IGFzIHRoZVxyXG4gICAgICAgICAgICAvLyBwbGF5YmFjayBkZWxheSBmb3IgdGhlIG5leHQgYXZhaWxhYmxlIHJlcXVlc3QgKGlmIGFueSkuXHJcbiAgICAgICAgICAgIGlmICh0eXBlb2Yga2V5ID09PSAnbnVtYmVyJylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbmV4dERlbGF5ID0ga2V5O1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGxldCBwYXRoID0gYCR7dGhpcy5jdXJyZW50Vm9pY2Uudm9pY2VVUkl9LyR7a2V5fS5tcDNgO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5wZW5kaW5nUmVxcy5wdXNoKCBuZXcgVm94UmVxdWVzdChwYXRoLCBuZXh0RGVsYXkpICk7XHJcbiAgICAgICAgICAgIG5leHREZWxheSA9IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmcgd2hlbiB3ZSdyZSBvdXQgb2YgSURzIHRvIHF1ZXVlIGFuZCBub3RoaW5nIGlzIHBsYXlpbmdcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50SWRzLmxlbmd0aCAgICAgICA8PSAwKVxyXG4gICAgICAgIGlmICh0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCAgICAgIDw9IDApXHJcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGVkQnVmZmVycy5sZW5ndGggPD0gMClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLnB1bXBUaW1lciA9IHNldFRpbWVvdXQodGhpcy5wdW1wLmJpbmQodGhpcyksIDEwMCk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIHByaXZhdGUgc2NoZWR1bGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTdG9wIHNjaGVkdWxpbmcgaWYgdGhlcmUgYXJlIG5vIHBlbmRpbmcgcmVxdWVzdHNcclxuICAgICAgICBpZiAoIXRoaXMucGVuZGluZ1JlcXNbMF0gfHwgIXRoaXMucGVuZGluZ1JlcXNbMF0uaXNEb25lKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIERvbid0IHNjaGVkdWxlIGlmIG1vcmUgdGhhbiA1IG5vZGVzIGFyZSwgYXMgbm90IHRvIGJsb3cgYW55IGJ1ZmZlcnNcclxuICAgICAgICBpZiAodGhpcy5zY2hlZHVsZWRCdWZmZXJzLmxlbmd0aCA+IDUpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IHJlcSA9IHRoaXMucGVuZGluZ1JlcXMuc2hpZnQoKSE7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSBuZXh0IHJlcXVlc3QgZXJyb3JlZCBvdXQgKGJ1ZmZlciBtaXNzaW5nKSwgc2tpcCBpdFxyXG4gICAgICAgIC8vIFRPRE86IFJlcGxhY2Ugd2l0aCBzaWxlbmNlP1xyXG4gICAgICAgIGlmICghcmVxLmJ1ZmZlcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdWT1ggQ0xJUCBTS0lQUEVEOicsIHJlcS5wYXRoKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2NoZWR1bGUoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIElmIHRoaXMgaXMgdGhlIGZpcnN0IGNsaXAgYmVpbmcgcGxheWVkLCBzdGFydCBmcm9tIGN1cnJlbnQgd2FsbC1jbG9ja1xyXG4gICAgICAgIGlmICh0aGlzLm5leHRCZWdpbiA9PT0gMClcclxuICAgICAgICAgICAgdGhpcy5uZXh0QmVnaW4gPSB0aGlzLmF1ZGlvQ29udGV4dC5jdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBDTElQIFBMQVlJTkc6JywgcmVxLnBhdGgsIHJlcS5idWZmZXIuZHVyYXRpb24sIHRoaXMubmV4dEJlZ2luKTtcclxuXHJcbiAgICAgICAgbGV0IG5vZGUgICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcclxuICAgICAgICBsZXQgbGF0ZW5jeSA9IHRoaXMuYXVkaW9Db250ZXh0LmJhc2VMYXRlbmN5ICsgMC4xO1xyXG4gICAgICAgIGxldCBkZWxheSAgID0gcmVxLmRlbGF5O1xyXG4gICAgICAgIG5vZGUuYnVmZmVyID0gcmVxLmJ1ZmZlcjtcclxuXHJcbiAgICAgICAgbm9kZS5wbGF5YmFja1JhdGUudmFsdWUgPSAwLjk4O1xyXG4gICAgICAgIG5vZGUuY29ubmVjdCh0aGlzLmF1ZGlvRmlsdGVyKTtcclxuICAgICAgICBub2RlLnN0YXJ0KHRoaXMubmV4dEJlZ2luICsgZGVsYXkpO1xyXG5cclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMucHVzaChub2RlKTtcclxuICAgICAgICB0aGlzLm5leHRCZWdpbiArPSAobm9kZS5idWZmZXIuZHVyYXRpb24gKyBkZWxheSAtIGxhdGVuY3kpO1xyXG5cclxuICAgICAgICAvLyBIYXZlIHRoaXMgYnVmZmVyIG5vZGUgcmVtb3ZlIGl0c2VsZiBmcm9tIHRoZSBzY2hlZHVsZSB3aGVuIGRvbmVcclxuICAgICAgICBub2RlLm9uZW5kZWQgPSBfID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgRU5ERUQ6JywgcmVxLnBhdGgpO1xyXG4gICAgICAgICAgICBsZXQgaWR4ID0gdGhpcy5zY2hlZHVsZWRCdWZmZXJzLmluZGV4T2Yobm9kZSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoaWR4ICE9PSAtMSlcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycy5zcGxpY2UoaWR4LCAxKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHJlcXVlc3QgZm9yIGEgdm94IGZpbGUsIGltbWVkaWF0ZWx5IGJlZ3VuIG9uIGNyZWF0aW9uICovXHJcbmNsYXNzIFZveFJlcXVlc3Rcclxue1xyXG4gICAgLyoqIFJlbGF0aXZlIHJlbW90ZSBwYXRoIG9mIHRoaXMgdm9pY2UgZmlsZSByZXF1ZXN0ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgcGF0aCAgOiBzdHJpbmc7XHJcbiAgICAvKiogQW1vdW50IG9mIHNlY29uZHMgdG8gZGVsYXkgdGhlIHBsYXliYWNrIG9mIHRoaXMgcmVxdWVzdCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRlbGF5IDogbnVtYmVyO1xyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBkb25lIGFuZCByZWFkeSBmb3IgaGFuZGxpbmcgKGV2ZW4gaWYgZmFpbGVkKSAqL1xyXG4gICAgcHVibGljIGlzRG9uZSAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogUmF3IGF1ZGlvIGRhdGEgZnJvbSB0aGUgbG9hZGVkIGZpbGUsIGlmIGF2YWlsYWJsZSAqL1xyXG4gICAgcHVibGljIGJ1ZmZlcj8gOiBBdWRpb0J1ZmZlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGF0aDogc3RyaW5nLCBkZWxheTogbnVtYmVyKVxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBSRVFVRVNUOicsIHBhdGgpO1xyXG4gICAgICAgIHRoaXMucGF0aCAgPSBwYXRoO1xyXG4gICAgICAgIHRoaXMuZGVsYXkgPSBkZWxheTtcclxuXHJcbiAgICAgICAgZmV0Y2gocGF0aClcclxuICAgICAgICAgICAgLnRoZW4gKCB0aGlzLm9uRnVsZmlsbC5iaW5kKHRoaXMpIClcclxuICAgICAgICAgICAgLmNhdGNoKCB0aGlzLm9uRXJyb3IuYmluZCh0aGlzKSAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbmNlbHMgdGhpcyByZXF1ZXN0IGZyb20gcHJvY2VlZGluZyBhbnkgZnVydGhlciAqL1xyXG4gICAgcHVibGljIGNhbmNlbCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IENhbmNlbGxhdGlvbiBjb250cm9sbGVyc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBCZWdpbnMgZGVjb2RpbmcgdGhlIGxvYWRlZCBNUDMgdm9pY2UgZmlsZSB0byByYXcgYXVkaW8gZGF0YSAqL1xyXG4gICAgcHJpdmF0ZSBvbkZ1bGZpbGwocmVzOiBSZXNwb25zZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFyZXMub2spXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKGBWT1ggTk9UIEZPVU5EOiAke3Jlcy5zdGF0dXN9IEAgJHt0aGlzLnBhdGh9YCk7XHJcblxyXG4gICAgICAgIHJlcy5hcnJheUJ1ZmZlcigpLnRoZW4oIHRoaXMub25BcnJheUJ1ZmZlci5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFRha2VzIHRoZSBhcnJheSBidWZmZXIgZnJvbSB0aGUgZnVsZmlsbGVkIGZldGNoIGFuZCBkZWNvZGVzIGl0ICovXHJcbiAgICBwcml2YXRlIG9uQXJyYXlCdWZmZXIoYnVmZmVyOiBBcnJheUJ1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgU291bmRzLmRlY29kZShSQUcuc3BlZWNoLnZveEVuZ2luZS5hdWRpb0NvbnRleHQsIGJ1ZmZlcilcclxuICAgICAgICAgICAgLnRoZW4gKCB0aGlzLm9uRGVjb2RlLmJpbmQodGhpcykgKVxyXG4gICAgICAgICAgICAuY2F0Y2goIHRoaXMub25FcnJvci5iaW5kKHRoaXMpICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiB0aGUgZmV0Y2hlZCBidWZmZXIgaXMgZGVjb2RlZCBzdWNjZXNzZnVsbHkgKi9cclxuICAgIHByaXZhdGUgb25EZWNvZGUoYnVmZmVyOiBBdWRpb0J1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5idWZmZXIgPSBidWZmZXI7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgaWYgdGhlIGZldGNoIG9yIGRlY29kZSBzdGFnZXMgZmFpbCAqL1xyXG4gICAgcHJpdmF0ZSBvbkVycm9yKGVycjogYW55KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnUkVRVUVTVCBGQUlMOicsIGVycik7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBocmFzZSBlZGl0b3IgKi9cclxuY2xhc3MgRWRpdG9yXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSBjb250YWluZXIgZm9yIHRoZSBlZGl0b3IgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIGRpYWxvZywgaWYgYW55ICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRQaWNrZXI/IDogUGlja2VyO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlIGVsZW1lbnQgY3VycmVudGx5IGJlaW5nIGVkaXRlZCwgaWYgYW55ICovXHJcbiAgICAvLyBEbyBub3QgRFJZOyBuZWVkcyB0byBiZSBwYXNzZWQgdG8gdGhlIHBpY2tlciBmb3IgY2xlYW5lciBjb2RlXHJcbiAgICBwcml2YXRlIGRvbUVkaXRpbmc/ICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSA9IERPTS5yZXF1aXJlKCcjZWRpdG9yJyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkub25jbGljayA9IHRoaXMub25DbGljay5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHdpbmRvdy5vbnJlc2l6ZSAgICAgICA9IHRoaXMub25SZXNpemUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbS5vbnNjcm9sbCAgICAgPSB0aGlzLm9uU2Nyb2xsLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb20udGV4dENvbnRlbnQgID0gTC5FRElUT1JfSU5JVCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyB0aGUgZWRpdG9yIHdpdGggYSByb290IHBocmFzZXNldCByZWZlcmVuY2UsIGFuZCBleHBhbmRzIGl0IGludG8gSFRNTCAqL1xyXG4gICAgcHVibGljIGdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJzxwaHJhc2VzZXQgcmVmPVwicm9vdFwiIC8+JztcclxuXHJcbiAgICAgICAgUkFHLnBocmFzZXIucHJvY2Vzcyh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIC8vIEZvciBzY3JvbGwtcGFzdCBwYWRkaW5nIHVuZGVyIHRoZSBwaHJhc2VcclxuICAgICAgICBsZXQgcGFkZGluZyAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICBwYWRkaW5nLmNsYXNzTmFtZSA9ICdib3R0b21QYWRkaW5nJztcclxuXHJcbiAgICAgICAgdGhpcy5kb20uYXBwZW5kQ2hpbGQocGFkZGluZyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcHJvY2Vzc2VzIGFsbCBwaHJhc2VzZXQgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHJlZiwgaWYgdGhlaXIgaW5kZXggaGFzIGNoYW5nZWQgKi9cclxuICAgIHB1YmxpYyByZWZyZXNoUGhyYXNlc2V0KHJlZjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBOb3RlLCB0aGlzIGNvdWxkIHBvdGVudGlhbGx5IGJ1ZyBvdXQgaWYgYSBwaHJhc2VzZXQncyBkZXNjZW5kYW50IHJlZmVyZW5jZXNcclxuICAgICAgICAvLyB0aGUgc2FtZSBwaHJhc2VzZXQgKHJlY3Vyc2lvbikuIEJ1dCB0aGlzIGlzIG9rYXkgYmVjYXVzZSBwaHJhc2VzZXRzIHNob3VsZFxyXG4gICAgICAgIC8vIG5ldmVyIGluY2x1ZGUgdGhlbXNlbHZlcywgZXZlbiBldmVudHVhbGx5LlxyXG5cclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuW2RhdGEtdHlwZT1waHJhc2VzZXRdW2RhdGEtcmVmPSR7cmVmfV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChfID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50ICAgID0gXyBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncGhyYXNlc2V0Jyk7XHJcbiAgICAgICAgICAgICAgICBsZXQgY2hhbmNlICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY2hhbmNlJ107XHJcblxyXG4gICAgICAgICAgICAgICAgbmV3RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JlZicsIHJlZik7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGNoYW5jZSlcclxuICAgICAgICAgICAgICAgICAgICBuZXdFbGVtZW50LnNldEF0dHJpYnV0ZSgnY2hhbmNlJywgY2hhbmNlKTtcclxuXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MobmV3RWxlbWVudC5wYXJlbnRFbGVtZW50ISk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhIHN0YXRpYyBOb2RlTGlzdCBvZiBhbGwgcGhyYXNlIGVsZW1lbnRzIG9mIHRoZSBnaXZlbiBxdWVyeS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgUXVlcnkgc3RyaW5nIHRvIGFkZCBvbnRvIHRoZSBgc3BhbmAgc2VsZWN0b3JcclxuICAgICAqIEByZXR1cm5zIE5vZGUgbGlzdCBvZiBhbGwgZWxlbWVudHMgbWF0Y2hpbmcgdGhlIGdpdmVuIHNwYW4gcXVlcnlcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldEVsZW1lbnRzQnlRdWVyeShxdWVyeTogc3RyaW5nKSA6IE5vZGVMaXN0XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoYHNwYW4ke3F1ZXJ5fWApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHBocmFzZSdzIHJvb3QgRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2UoKSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmZpcnN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHBocmFzZSBpbiB0aGUgZWRpdG9yIGFzIHRleHQsIGV4Y2x1ZGluZyB0aGUgaGlkZGVuIHBhcnRzICovXHJcbiAgICBwdWJsaWMgZ2V0VGV4dCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIERPTS5nZXRDbGVhbmVkVmlzaWJsZVRleHQodGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgYWxsIHBocmFzZSBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gdHlwZSwgYW5kIHNldHMgdGhlaXIgdGV4dCB0byBnaXZlbiB2YWx1ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdHlwZSBPcmlnaW5hbCBYTUwgbmFtZSBvZiBlbGVtZW50cyB0byByZXBsYWNlIGNvbnRlbnRzIG9mXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgTmV3IHRleHQgZm9yIHRoZSBmb3VuZCBlbGVtZW50cyB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEVsZW1lbnRzVGV4dCh0eXBlOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPSR7dHlwZX1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgYW55IGN1cnJlbnRseSBvcGVuIGVkaXRvciBkaWFsb2dzICovXHJcbiAgICBwdWJsaWMgY2xvc2VEaWFsb2coKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIuY2xvc2UoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZG9tRWRpdGluZylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5yZW1vdmVBdHRyaWJ1dGUoJ2VkaXRpbmcnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2Fib3ZlJywgJ2JlbG93Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGEgY2xpY2sgYW55d2hlcmUgaW4gdGhlIHdpbmRvdyBkZXBlbmRpbmcgb24gdGhlIGNvbnRleHQgKi9cclxuICAgIHByaXZhdGUgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhcmdldCA9IGV2LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgdHlwZSAgID0gdGFyZ2V0ID8gdGFyZ2V0LmRhdGFzZXRbJ3R5cGUnXSAgICA6IHVuZGVmaW5lZDtcclxuICAgICAgICBsZXQgcGlja2VyID0gdHlwZSAgID8gUkFHLnZpZXdzLmdldFBpY2tlcih0eXBlKSA6IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKCF0YXJnZXQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNsb3NlRGlhbG9nKCk7XHJcblxyXG4gICAgICAgIC8vIFJlZGlyZWN0IGNsaWNrcyBvZiBpbm5lciBlbGVtZW50c1xyXG4gICAgICAgIGlmICggdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnaW5uZXInKSAmJiB0YXJnZXQucGFyZW50RWxlbWVudCApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0YXJnZXQgPSB0YXJnZXQucGFyZW50RWxlbWVudDtcclxuICAgICAgICAgICAgdHlwZSAgID0gdGFyZ2V0LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICAgICAgcGlja2VyID0gdHlwZSA/IFJBRy52aWV3cy5nZXRQaWNrZXIodHlwZSkgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIHRvIGFueSBpbm5lciBkb2N1bWVudCBvciB1bm93bmVkIGVsZW1lbnRcclxuICAgICAgICBpZiAoICFkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3MgdG8gYW55IGVsZW1lbnQgb2YgYWxyZWFkeSBvcGVuIHBpY2tlcnNcclxuICAgICAgICBpZiAoIHRoaXMuY3VycmVudFBpY2tlciApXHJcbiAgICAgICAgaWYgKCB0aGlzLmN1cnJlbnRQaWNrZXIuZG9tLmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbnkgb3BlbiBlZGl0b3JzXHJcbiAgICAgICAgbGV0IHByZXZUYXJnZXQgPSB0aGlzLmRvbUVkaXRpbmc7XHJcbiAgICAgICAgdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBJZiBjbGlja2luZyB0aGUgZWxlbWVudCBhbHJlYWR5IGJlaW5nIGVkaXRlZCwgZG9uJ3QgcmVvcGVuXHJcbiAgICAgICAgaWYgKHRhcmdldCA9PT0gcHJldlRhcmdldClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgY29sbGFwc2libGUgZWxlbWVudHNcclxuICAgICAgICBpZiAoIHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3RvZ2dsZScpIClcclxuICAgICAgICAgICAgdGhpcy50b2dnbGVDb2xsYXBzaWFibGUodGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gRmluZCBhbmQgb3BlbiBwaWNrZXIgZm9yIHRoZSB0YXJnZXQgZWxlbWVudFxyXG4gICAgICAgIGVsc2UgaWYgKHR5cGUgJiYgcGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLm9wZW5QaWNrZXIodGFyZ2V0LCBwaWNrZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZS1sYXlvdXQgdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBvbiByZXNpemUgKi9cclxuICAgIHByaXZhdGUgb25SZXNpemUoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRQaWNrZXIpXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpY2tlci5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmUtbGF5b3V0IHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgb24gc2Nyb2xsICovXHJcbiAgICBwcml2YXRlIG9uU2Nyb2xsKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBXb3JrYXJvdW5kIGZvciBsYXlvdXQgYmVoYXZpbmcgd2VpcmQgd2hlbiBpT1Mga2V5Ym9hcmQgaXMgb3BlblxyXG4gICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlci5oYXNGb2N1cygpKVxyXG4gICAgICAgICAgICBET00uYmx1ckFjdGl2ZSgpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGbGlwcyB0aGUgY29sbGFwc2Ugc3RhdGUgb2YgYSBjb2xsYXBzaWJsZSwgYW5kIHByb3BhZ2F0ZXMgdGhlIG5ldyBzdGF0ZSB0byBvdGhlclxyXG4gICAgICogY29sbGFwc2libGVzIG9mIHRoZSBzYW1lIHJlZmVyZW5jZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IENvbGxhcHNpYmxlIGVsZW1lbnQgYmVpbmcgdG9nZ2xlZFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHRvZ2dsZUNvbGxhcHNpYWJsZSh0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICAgICA9IHRhcmdldC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgcmVmICAgICAgICA9IERPTS5yZXF1aXJlRGF0YShwYXJlbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgdHlwZSAgICAgICA9IERPTS5yZXF1aXJlRGF0YShwYXJlbnQsICd0eXBlJyk7XHJcbiAgICAgICAgbGV0IGNvbGxhcGFzZWQgPSBwYXJlbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKTtcclxuXHJcbiAgICAgICAgLy8gUHJvcGFnYXRlIG5ldyBjb2xsYXBzZSBzdGF0ZSB0byBhbGwgY29sbGFwc2libGVzIG9mIHRoZSBzYW1lIHJlZlxyXG4gICAgICAgIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoYHNwYW5bZGF0YS10eXBlPSR7dHlwZX1dW2RhdGEtcmVmPSR7cmVmfV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChfID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBwaHJhc2VzZXQgPSBfIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgbGV0IHRvZ2dsZSAgICA9IHBocmFzZXNldC5jaGlsZHJlblswXSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBTa2lwIHNhbWUtcmVmIGVsZW1lbnRzIHRoYXQgYXJlbid0IGNvbGxhcHNpYmxlXHJcbiAgICAgICAgICAgICAgICBpZiAoICF0b2dnbGUgfHwgIXRvZ2dsZS5jbGFzc0xpc3QuY29udGFpbnMoJ3RvZ2dsZScpIClcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAgICAgQ29sbGFwc2libGVzLnNldChwaHJhc2VzZXQsIHRvZ2dsZSwgIWNvbGxhcGFzZWQpO1xyXG4gICAgICAgICAgICAgICAgLy8gRG9uJ3QgbW92ZSB0aGlzIHRvIHNldENvbGxhcHNpYmxlLCBhcyBzdGF0ZSBzYXZlL2xvYWQgaXMgaGFuZGxlZFxyXG4gICAgICAgICAgICAgICAgLy8gb3V0c2lkZSBpbiBib3RoIHVzYWdlcyBvZiBzZXRDb2xsYXBzaWJsZS5cclxuICAgICAgICAgICAgICAgIFJBRy5zdGF0ZS5zZXRDb2xsYXBzZWQocmVmLCAhY29sbGFwYXNlZCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogT3BlbnMgYSBwaWNrZXIgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWRpdG9yIGVsZW1lbnQgdG8gb3BlbiB0aGUgcGlja2VyIGZvclxyXG4gICAgICogQHBhcmFtIHBpY2tlciBQaWNrZXIgdG8gb3BlblxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9wZW5QaWNrZXIodGFyZ2V0OiBIVE1MRWxlbWVudCwgcGlja2VyOiBQaWNrZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRhcmdldC5zZXRBdHRyaWJ1dGUoJ2VkaXRpbmcnLCAndHJ1ZScpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIgPSBwaWNrZXI7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nICAgID0gdGFyZ2V0O1xyXG4gICAgICAgIHBpY2tlci5vcGVuKHRhcmdldCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUgKi9cclxuY2xhc3MgTWFycXVlZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYXJxdWVlJ3MgRE9NIGVsZW1lbnQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc3BhbiBlbGVtZW50IGluIHRoZSBtYXJxdWVlLCB3aGVyZSB0aGUgdGV4dCBpcyBzZXQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tU3BhbiA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgSUQgZm9yIHRoZSBzY3JvbGxpbmcgYW5pbWF0aW9uIHRpbWVyICovXHJcbiAgICBwcml2YXRlIHRpbWVyICA6IG51bWJlciA9IDA7XHJcbiAgICAvKiogQ3VycmVudCBvZmZzZXQgKGluIHBpeGVscykgb2YgdGhlIHNjcm9sbGluZyBtYXJxdWVlICovXHJcbiAgICBwcml2YXRlIG9mZnNldCA6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSAgICAgPSBET00ucmVxdWlyZSgnI21hcnF1ZWUnKTtcclxuICAgICAgICB0aGlzLmRvbVNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmlubmVySFRNTCA9ICcnO1xyXG4gICAgICAgIHRoaXMuZG9tLmFwcGVuZENoaWxkKHRoaXMuZG9tU3Bhbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIG1lc3NhZ2Ugb24gdGhlIHNjcm9sbGluZyBtYXJxdWVlLCBhbmQgc3RhcnRzIGFuaW1hdGluZyBpdCAqL1xyXG4gICAgcHVibGljIHNldChtc2c6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNwYW4udGV4dENvbnRlbnQgPSBtc2c7XHJcbiAgICAgICAgdGhpcy5vZmZzZXQgICAgICAgICAgICAgID0gdGhpcy5kb20uY2xpZW50V2lkdGg7XHJcblxyXG4gICAgICAgIC8vIEkgdHJpZWQgdG8gdXNlIENTUyBhbmltYXRpb24gZm9yIHRoaXMsIGJ1dCBjb3VsZG4ndCBmaWd1cmUgb3V0IGhvdyBmb3IgYVxyXG4gICAgICAgIC8vIGR5bmFtaWNhbGx5IHNpemVkIGVsZW1lbnQgbGlrZSB0aGUgc3Bhbi5cclxuICAgICAgICBsZXQgbGltaXQgPSAtdGhpcy5kb21TcGFuLmNsaWVudFdpZHRoIC0gMTAwO1xyXG4gICAgICAgIGxldCBhbmltICA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLm9mZnNldCAtPSAoRE9NLmlzTW9iaWxlID8gNSA6IDcpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGVYKCR7dGhpcy5vZmZzZXR9cHgpYDtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9mZnNldCA8IGxpbWl0KVxyXG4gICAgICAgICAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWVyID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdG9wcyB0aGUgY3VycmVudCBtYXJxdWVlIGFuaW1hdGlvbiAqL1xyXG4gICAgcHVibGljIHN0b3AoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy50aW1lcik7XHJcbiAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG5jbGFzcyBTZXR0aW5nc1xyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjb250YWluZXIgZm9yIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHByaXZhdGUgZG9tICAgICAgICAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgXCJSZXNldCBzZXR0aW5nc1wiIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5SZXNldCAgICAgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBcIlNhdmUgYW5kIGNsb3NlXCIgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blNhdmUgICAgICAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHZvaWNlIHNlbGVjdGlvbiBib3ggKi9cclxuICAgIHByaXZhdGUgc2VsU3BlZWNoVm9pY2UgICA6IEhUTUxTZWxlY3RFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgdm9pY2Ugdm9sdW1lIHNsaWRlciAqL1xyXG4gICAgcHJpdmF0ZSByYW5nZVNwZWVjaFZvbCAgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHZvaWNlIHBpdGNoIHNsaWRlciAqL1xyXG4gICAgcHJpdmF0ZSByYW5nZVNwZWVjaFBpdGNoIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHZvaWNlIHJhdGUgc2xpZGVyICovXHJcbiAgICBwcml2YXRlIHJhbmdlU3BlZWNoUmF0ZSAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc3BlZWNoIHRlc3QgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blNwZWVjaFRlc3QgICAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgdGltZXIgZm9yIHRoZSBcIlJlc2V0XCIgYnV0dG9uIGNvbmZpcm1hdGlvbiBzdGVwICovXHJcbiAgICBwcml2YXRlIHJlc2V0VGltZW91dD8gICAgOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICAvLyBHZW5lcmFsIHNldHRpbmdzIGZvcm1cclxuXHJcbiAgICAgICAgdGhpcy5kb20gICAgICA9IERPTS5yZXF1aXJlKCcjc2V0dGluZ3NTY3JlZW4nKTtcclxuICAgICAgICB0aGlzLmJ0blJlc2V0ID0gRE9NLnJlcXVpcmUoJyNidG5SZXNldFNldHRpbmdzJyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlICA9IERPTS5yZXF1aXJlKCcjYnRuU2F2ZVNldHRpbmdzJyk7XHJcblxyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQub25jbGljayA9IHRoaXMuaGFuZGxlUmVzZXQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUub25jbGljayAgPSB0aGlzLmhhbmRsZVNhdmUuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gU3BlZWNoIGZvcm1cclxuXHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZSAgID0gRE9NLnJlcXVpcmUoJyNzZWxTcGVlY2hDaG9pY2UnKTtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoVm9sICAgPSBET00ucmVxdWlyZSgnI3JhbmdlU3BlZWNoVm9sJyk7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFBpdGNoID0gRE9NLnJlcXVpcmUoJyNyYW5nZVNwZWVjaFBpdGNoJyk7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFJhdGUgID0gRE9NLnJlcXVpcmUoJyNyYW5nZVNwZWVjaFJhdGUnKTtcclxuICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3QgICAgPSBET00ucmVxdWlyZSgnI2J0blNwZWVjaFRlc3QnKTtcclxuXHJcbiAgICAgICAgdGhpcy5idG5TcGVlY2hUZXN0Lm9uY2xpY2sgPSB0aGlzLmhhbmRsZVZvaWNlVGVzdC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBMZWdhbCBhbmQgYWNrbm93bGVkZ2VtZW50c1xyXG5cclxuICAgICAgICBMaW5rZG93bi5wYXJzZSggRE9NLnJlcXVpcmUoJyNsZWdhbEJsb2NrJykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogT3BlbnMgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljIG9wZW4oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuXHJcbiAgICAgICAgLy8gVGhlIHZvaWNlIGxpc3QgaGFzIHRvIGJlIHBvcHVsYXRlZCBlYWNoIG9wZW4sIGluIGNhc2UgaXQgY2hhbmdlc1xyXG4gICAgICAgIHRoaXMucG9wdWxhdGVWb2ljZUxpc3QoKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZS5zZWxlY3RlZEluZGV4ICAgPSBSQUcuY29uZmlnLnNwZWVjaFZvaWNlO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWVBc051bWJlciAgID0gUkFHLmNvbmZpZy5zcGVlY2hWb2w7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlQXNOdW1iZXIgPSBSQUcuY29uZmlnLnNwZWVjaFBpdGNoO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlQXNOdW1iZXIgID0gUkFHLmNvbmZpZy5zcGVlY2hSYXRlO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxSZXNldCgpO1xyXG4gICAgICAgIFJBRy5zcGVlY2guY2FuY2VsKCk7XHJcbiAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XHJcbiAgICAgICAgRE9NLmJsdXJBY3RpdmUodGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbGVhcnMgYW5kIHBvcHVsYXRlcyB0aGUgdm9pY2UgbGlzdCAqL1xyXG4gICAgcHJpdmF0ZSBwb3B1bGF0ZVZvaWNlTGlzdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuc2VsU3BlZWNoVm9pY2UuaW5uZXJIVE1MID0gJyc7XHJcblxyXG4gICAgICAgIGxldCB2b2ljZXMgPSBSQUcuc3BlZWNoLmdldFZvaWNlcygpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgZW1wdHkgbGlzdFxyXG4gICAgICAgIGlmICh2b2ljZXMubGVuZ3RoIDw9IDApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgb3B0aW9uICAgICAgPSBET00uYWRkT3B0aW9uKCB0aGlzLnNlbFNwZWVjaFZvaWNlLCBMLlNUX1NQRUVDSF9FTVBUWSgpICk7XHJcbiAgICAgICAgICAgIG9wdGlvbi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9TcGVlY2hTeW50aGVzaXNcclxuICAgICAgICBlbHNlIGZvciAobGV0IGkgPSAwOyBpIDwgdm9pY2VzLmxlbmd0aCA7IGkrKylcclxuICAgICAgICAgICAgRE9NLmFkZE9wdGlvbih0aGlzLnNlbFNwZWVjaFZvaWNlLCBgJHt2b2ljZXNbaV0ubmFtZX0gKCR7dm9pY2VzW2ldLmxhbmd9KWApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSByZXNldCBidXR0b24sIHdpdGggYSBjb25maXJtIHN0ZXAgdGhhdCBjYW5jZWxzIGFmdGVyIDE1IHNlY29uZHMgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlUmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMucmVzZXRUaW1lb3V0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5yZXNldFRpbWVvdXQgICAgICAgPSBzZXRUaW1lb3V0KHRoaXMuY2FuY2VsUmVzZXQuYmluZCh0aGlzKSwgMTUwMDApO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blJlc2V0LmlubmVyVGV4dCA9IEwuU1RfUkVTRVRfQ09ORklSTSgpO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blJlc2V0LnRpdGxlICAgICA9IEwuU1RfUkVTRVRfQ09ORklSTV9UKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFJBRy5jb25maWcucmVzZXQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIHRoaXMuY2FuY2VsUmVzZXQoKTtcclxuICAgICAgICB0aGlzLm9wZW4oKTtcclxuICAgICAgICBhbGVydCggTC5TVF9SRVNFVF9ET05FKCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2FuY2VsIHRoZSByZXNldCB0aW1lb3V0IGFuZCByZXN0b3JlIHRoZSByZXNldCBidXR0b24gdG8gbm9ybWFsICovXHJcbiAgICBwcml2YXRlIGNhbmNlbFJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnJlc2V0VGltZW91dCk7XHJcbiAgICAgICAgdGhpcy5idG5SZXNldC5pbm5lclRleHQgPSBMLlNUX1JFU0VUKCk7XHJcbiAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX1QoKTtcclxuICAgICAgICB0aGlzLnJlc2V0VGltZW91dCAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2F2ZSBidXR0b24sIHNhdmluZyBjb25maWcgdG8gc3RvcmFnZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVTYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2ljZSAgPSB0aGlzLnNlbFNwZWVjaFZvaWNlLnNlbGVjdGVkSW5kZXg7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2wgICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2ggID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoUGl0Y2gudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSAgID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZSk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zYXZlKCk7XHJcbiAgICAgICAgdGhpcy5jbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzcGVlY2ggdGVzdCBidXR0b24sIHNwZWFraW5nIGEgdGVzdCBwaHJhc2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlVm9pY2VUZXN0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEhhcyB0byBleGVjdXRlIG9uIGEgZGVsYXksIGFzIHNwZWVjaCBjYW5jZWwgaXMgdW5yZWxpYWJsZSB3aXRob3V0IGl0XHJcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgbGV0IHRpbWUgICA9IFN0cmluZ3MuZnJvbVRpbWUoIG5ldyBEYXRlKCkgKTtcclxuICAgICAgICAgICAgbGV0IHBocmFzZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHJcbiAgICAgICAgICAgIHBocmFzZS5pbm5lckhUTUwgPSAnPHNwYW4gZGF0YS10eXBlPVwicGhyYXNlXCIgZGF0YS1yZWY9XCJzYW1wbGVcIj4nICtcclxuICAgICAgICAgICAgICAgICdUaGlzIGlzIGEgdGVzdCBvZiB0aGUgUmFpbCBBbm5vdW5jZW1lbnQgR2VuZXJhdG9yIGF0JyArXHJcbiAgICAgICAgICAgICAgICAnPHNwYW4gZGF0YS10eXBlPVwidGltZVwiPicgKyB0aW1lICsgJzwvc3Bhbj4nICtcclxuICAgICAgICAgICAgICAgICc8L3NwYW4+JztcclxuXHJcbiAgICAgICAgICAgIFJBRy5zcGVlY2guc3BlYWsoXHJcbiAgICAgICAgICAgICAgICBwaHJhc2UuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LFxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHZvaWNlSWR4IDogdGhpcy5zZWxTcGVlY2hWb2ljZS5zZWxlY3RlZEluZGV4LFxyXG4gICAgICAgICAgICAgICAgICAgIHZvbHVtZSAgIDogdGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHBpdGNoICAgIDogdGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlQXNOdW1iZXIsXHJcbiAgICAgICAgICAgICAgICAgICAgcmF0ZSAgICAgOiB0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZUFzTnVtYmVyXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfSwgMjAwKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSB0b3AgdG9vbGJhciAqL1xyXG5jbGFzcyBUb29sYmFyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGNvbnRhaW5lciBmb3IgdGhlIHRvb2xiYXIgKi9cclxuICAgIHByaXZhdGUgZG9tICAgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBsYXkgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blBsYXkgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzdG9wIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5TdG9wICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgZ2VuZXJhdGUgcmFuZG9tIHBocmFzZSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuR2VuZXJhdGUgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNhdmUgc3RhdGUgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blNhdmUgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSByZWNhbGwgc3RhdGUgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blJlY2FsbCAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzZXR0aW5ncyBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuT3B0aW9uICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgPSBET00ucmVxdWlyZSgnI3Rvb2xiYXInKTtcclxuICAgICAgICB0aGlzLmJ0blBsYXkgICAgID0gRE9NLnJlcXVpcmUoJyNidG5QbGF5Jyk7XHJcbiAgICAgICAgdGhpcy5idG5TdG9wICAgICA9IERPTS5yZXF1aXJlKCcjYnRuU3RvcCcpO1xyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUgPSBET00ucmVxdWlyZSgnI2J0blNodWZmbGUnKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUgICAgID0gRE9NLnJlcXVpcmUoJyNidG5TYXZlJyk7XHJcbiAgICAgICAgdGhpcy5idG5SZWNhbGwgICA9IERPTS5yZXF1aXJlKCcjYnRuTG9hZCcpO1xyXG4gICAgICAgIHRoaXMuYnRuT3B0aW9uICAgPSBET00ucmVxdWlyZSgnI2J0blNldHRpbmdzJyk7XHJcblxyXG4gICAgICAgIHRoaXMuYnRuU3RvcC5vbmNsaWNrICAgICA9IHRoaXMuaGFuZGxlU3RvcC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUub25jbGljayA9IHRoaXMuaGFuZGxlR2VuZXJhdGUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUub25jbGljayAgICAgPSB0aGlzLmhhbmRsZVNhdmUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blJlY2FsbC5vbmNsaWNrICAgPSB0aGlzLmhhbmRsZUxvYWQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0bk9wdGlvbi5vbmNsaWNrICAgPSB0aGlzLmhhbmRsZU9wdGlvbi5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICB0aGlzLmJ0blBsYXkub25jbGljayA9IGV2ID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBIYXMgdG8gZXhlY3V0ZSBvbiBhIGRlbGF5LCBhcyBzcGVlY2ggY2FuY2VsIGlzIHVucmVsaWFibGUgd2l0aG91dCBpdFxyXG4gICAgICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dCh0aGlzLmhhbmRsZVBsYXkuYmluZCh0aGlzKSwgMjAwKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBBZGQgdGhyb2IgY2xhc3MgaWYgdGhlIGdlbmVyYXRlIGJ1dHRvbiBoYXNuJ3QgYmVlbiBjbGlja2VkIGJlZm9yZVxyXG4gICAgICAgIGlmICghUkFHLmNvbmZpZy5jbGlja2VkR2VuZXJhdGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmNsYXNzTGlzdC5hZGQoJ3Rocm9iJyk7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgcGxheSBidXR0b24sIHBsYXlpbmcgdGhlIGVkaXRvcidzIGN1cnJlbnQgcGhyYXNlIHdpdGggc3BlZWNoICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVBsYXkoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBOb3RlOiBJdCB3b3VsZCBiZSBuaWNlIHRvIGhhdmUgdGhlIHBsYXkgYnV0dG9uIGNoYW5nZSB0byB0aGUgc3RvcCBidXR0b24gYW5kXHJcbiAgICAgICAgLy8gYXV0b21hdGljYWxseSBjaGFuZ2UgYmFjay4gSG93ZXZlciwgc3BlZWNoJ3MgJ29uZW5kJyBldmVudCB3YXMgZm91bmQgdG8gYmVcclxuICAgICAgICAvLyB1bnJlbGlhYmxlLCBzbyBJIGRlY2lkZWQgdG8ga2VlcCBwbGF5IGFuZCBzdG9wIHNlcGFyYXRlLlxyXG5cclxuICAgICAgICBSQUcuc3BlZWNoLnNwZWFrKCBSQUcudmlld3MuZWRpdG9yLmdldFBocmFzZSgpICk7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBSQUcudmlld3MuZWRpdG9yLmdldFRleHQoKSApO1xyXG4gICAgICAgIHRoaXMuYnRuUGxheS5kaXNhYmxlZCA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzdG9wIGJ1dHRvbiwgc3RvcHBpbmcgdGhlIG1hcnF1ZWUgYW5kIGFueSBzcGVlY2ggKi9cclxuICAgIHByaXZhdGUgaGFuZGxlU3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zcGVlY2guY2FuY2VsKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBnZW5lcmF0ZSBidXR0b24sIGdlbmVyYXRpbmcgbmV3IHJhbmRvbSBzdGF0ZSBhbmQgcGhyYXNlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gUmVtb3ZlIHRoZSBjYWxsLXRvLWFjdGlvbiB0aHJvYiBmcm9tIGluaXRpYWwgbG9hZFxyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuY2xhc3NMaXN0LnJlbW92ZSgndGhyb2InKTtcclxuICAgICAgICBSQUcuZ2VuZXJhdGUoKTtcclxuICAgICAgICBSQUcuY29uZmlnLmNsaWNrZWRHZW5lcmF0ZSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNhdmUgYnV0dG9uLCBwZXJzaXN0aW5nIHRoZSBjdXJyZW50IHRyYWluIHN0YXRlIHRvIHN0b3JhZ2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlU2F2ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGNzcyA9ICdmb250LXNpemU6IGxhcmdlOyBmb250LXdlaWdodDogYm9sZDsnO1xyXG4gICAgICAgICAgICBsZXQgcmF3ID0gSlNPTi5zdHJpbmdpZnkoUkFHLnN0YXRlKTtcclxuICAgICAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdzdGF0ZScsIHJhdyk7XHJcblxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhMLlNUQVRFX0NPUFlfUEFTVEUoKSwgY3NzKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJSQUcubG9hZCgnXCIsIHJhdy5yZXBsYWNlKFwiJ1wiLCBcIlxcXFwnXCIpLCBcIicpXCIpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhMLlNUQVRFX1JBV19KU09OKCksIGNzcyk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHJhdyk7XHJcblxyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfVE9fU1RPUkFHRSgpICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX1NBVkVfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBsb2FkIGJ1dHRvbiwgbG9hZGluZyB0cmFpbiBzdGF0ZSBmcm9tIHN0b3JhZ2UsIGlmIGl0IGV4aXN0cyAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVMb2FkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGRhdGEgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3N0YXRlJyk7XHJcblxyXG4gICAgICAgIHJldHVybiBkYXRhXHJcbiAgICAgICAgICAgID8gUkFHLmxvYWQoZGF0YSlcclxuICAgICAgICAgICAgOiBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfU0FWRV9NSVNTSU5HKCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2V0dGluZ3MgYnV0dG9uLCBvcGVuaW5nIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHByaXZhdGUgaGFuZGxlT3B0aW9uKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnZpZXdzLnNldHRpbmdzLm9wZW4oKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgVUkgZWxlbWVudHMgYW5kIHRoZWlyIGxvZ2ljICovXHJcbmNsYXNzIFZpZXdzXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gZWRpdG9yIGNvbXBvbmVudCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBlZGl0b3IgICA6IEVkaXRvcjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gbWFycXVlZSBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbWFycXVlZSAgOiBNYXJxdWVlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc2V0dGluZ3MgOiBTZXR0aW5ncztcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gdG9vbGJhciBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgdG9vbGJhciAgOiBUb29sYmFyO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gYWxsIHRoZSBwaWNrZXJzLCBvbmUgZm9yIGVhY2ggdHlwZSBvZiBYTUwgZWxlbWVudCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBwaWNrZXJzICA6IERpY3Rpb25hcnk8UGlja2VyPjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZWRpdG9yICAgPSBuZXcgRWRpdG9yKCk7XHJcbiAgICAgICAgdGhpcy5tYXJxdWVlICA9IG5ldyBNYXJxdWVlKCk7XHJcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IG5ldyBTZXR0aW5ncygpO1xyXG4gICAgICAgIHRoaXMudG9vbGJhciAgPSBuZXcgVG9vbGJhcigpO1xyXG4gICAgICAgIHRoaXMucGlja2VycyAgPSB7fTtcclxuXHJcbiAgICAgICAgW1xyXG4gICAgICAgICAgICBuZXcgQ29hY2hQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IEV4Y3VzZVBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgSW50ZWdlclBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgTmFtZWRQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFBocmFzZXNldFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgUGxhdGZvcm1QaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFNlcnZpY2VQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFN0YXRpb25QaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFN0YXRpb25MaXN0UGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBUaW1lUGlja2VyKClcclxuICAgICAgICBdLmZvckVhY2gocGlja2VyID0+IHRoaXMucGlja2Vyc1twaWNrZXIueG1sVGFnXSA9IHBpY2tlcik7XHJcblxyXG4gICAgICAgIC8vIEdsb2JhbCBob3RrZXlzXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5vbmtleWRvd24gPSB0aGlzLm9uSW5wdXQuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaU9TLXNwZWNpZmljIENTUyBmaXhlc1xyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZCgnaW9zJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIHBpY2tlciB0aGF0IGhhbmRsZXMgYSBnaXZlbiB0YWcsIGlmIGFueSAqL1xyXG4gICAgcHVibGljIGdldFBpY2tlcih4bWxUYWc6IHN0cmluZykgOiBQaWNrZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5waWNrZXJzW3htbFRhZ107XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZSBFU0MgdG8gY2xvc2UgcGlja2VycyBvciBzZXR0aWducyAqL1xyXG4gICAgcHJpdmF0ZSBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoZXYua2V5ICE9PSAnRXNjYXBlJylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MuY2xvc2UoKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIGNvbGxhcHNpYmxlIGVsZW1lbnRzICovXHJcbmNsYXNzIENvbGxhcHNpYmxlc1xyXG57XHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc3BhbiBUaGUgZW5jYXBzdWxhdGluZyBjb2xsYXBzaWJsZSBlbGVtZW50XHJcbiAgICAgKiBAcGFyYW0gdG9nZ2xlIFRoZSB0b2dnbGUgY2hpbGQgb2YgdGhlIGNvbGxhcHNpYmxlIGVsZW1lbnRcclxuICAgICAqIEBwYXJhbSBzdGF0ZSBUcnVlIHRvIGNvbGxhcHNlLCBmYWxzZSB0byBvcGVuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2V0KHNwYW46IEhUTUxFbGVtZW50LCB0b2dnbGU6IEhUTUxFbGVtZW50LCBzdGF0ZTogYm9vbGVhbikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgPSBzcGFuLmRhdGFzZXRbJ3JlZiddIHx8ICc/Pz8nO1xyXG4gICAgICAgIGxldCB0eXBlID0gc3Bhbi5kYXRhc2V0Wyd0eXBlJ10hO1xyXG5cclxuICAgICAgICBpZiAoc3RhdGUpIHNwYW4uc2V0QXR0cmlidXRlKCdjb2xsYXBzZWQnLCAnJyk7XHJcbiAgICAgICAgZWxzZSAgICAgICBzcGFuLnJlbW92ZUF0dHJpYnV0ZSgnY29sbGFwc2VkJyk7XHJcblxyXG4gICAgICAgIHRvZ2dsZS50aXRsZSA9IHN0YXRlXHJcbiAgICAgICAgICAgID8gTC5USVRMRV9PUFRfT1BFTih0eXBlLCByZWYpXHJcbiAgICAgICAgICAgIDogTC5USVRMRV9PUFRfQ0xPU0UodHlwZSwgcmVmKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFN1Z2FyIGZvciBjaG9vc2luZyBzZWNvbmQgdmFsdWUgaWYgZmlyc3QgaXMgdW5kZWZpbmVkLCBpbnN0ZWFkIG9mIGZhbHN5ICovXHJcbmZ1bmN0aW9uIGVpdGhlcjxUPih2YWx1ZTogVCB8IHVuZGVmaW5lZCwgdmFsdWUyOiBUKSA6IFRcclxue1xyXG4gICAgcmV0dXJuICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSA/IHZhbHVlMiA6IHZhbHVlO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBkZWFsaW5nIHdpdGggdGhlIERPTSAqL1xyXG5jbGFzcyBET01cclxue1xyXG4gICAgLyoqIFdoZXRoZXIgdGhlIHdpbmRvdyBpcyB0aGlubmVyIHRoYW4gYSBzcGVjaWZpYyBzaXplIChhbmQsIHRodXMsIGlzIFwibW9iaWxlXCIpICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBpc01vYmlsZSgpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoIDw9IDUwMDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogV2hldGhlciBSQUcgYXBwZWFycyB0byBiZSBydW5uaW5nIG9uIGFuIGlPUyBkZXZpY2UgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGlzaU9TKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5wbGF0Zm9ybS5tYXRjaCgvaVBob25lfGlQb2R8aVBhZC9naSkgIT09IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGF0dHJpYnV0ZSBmcm9tIHRoZSBnaXZlbiBlbGVtZW50LCBvciByZXR1cm5zIHRoZSBnaXZlblxyXG4gICAgICogZGVmYXVsdCB2YWx1ZSBpZiB1bnNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgYXR0cmlidXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gYXR0ciBOYW1lIG9mIHRoZSBhdHRyaWJ1dGUgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxyXG4gICAgICogQHBhcmFtIGRlZiBEZWZhdWx0IHZhbHVlIGlmIGF0dHJpYnV0ZSBpc24ndCBzZXRcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBhdHRyaWJ1dGUncyB2YWx1ZSwgb3IgZGVmYXVsdCB2YWx1ZSBpZiB1bnNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldEF0dHIoZWxlbWVudDogSFRNTEVsZW1lbnQsIGF0dHI6IHN0cmluZywgZGVmOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuaGFzQXR0cmlidXRlKGF0dHIpXHJcbiAgICAgICAgICAgID8gZWxlbWVudC5nZXRBdHRyaWJ1dGUoYXR0cikhXHJcbiAgICAgICAgICAgIDogZGVmO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgYW4gZWxlbWVudCBmcm9tIHRoZSBnaXZlbiBkb2N1bWVudCwgdGhyb3dpbmcgYW4gZXJyb3IgaWYgbm8gbWF0Y2ggaXMgZm91bmQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IENTUyBzZWxlY3RvciBxdWVyeSB0byB1c2VcclxuICAgICAqIEBwYXJhbSBwYXJlbnQgUGFyZW50IG9iamVjdCB0byBzZWFyY2g7IGRlZmF1bHRzIHRvIGRvY3VtZW50XHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZmlyc3QgZWxlbWVudCB0byBtYXRjaCB0aGUgZ2l2ZW4gcXVlcnlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXF1aXJlPFQgZXh0ZW5kcyBIVE1MRWxlbWVudD5cclxuICAgICAgICAocXVlcnk6IHN0cmluZywgcGFyZW50OiBQYXJlbnROb2RlID0gd2luZG93LmRvY3VtZW50KVxyXG4gICAgICAgIDogVFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBwYXJlbnQucXVlcnlTZWxlY3RvcihxdWVyeSkgYXMgVDtcclxuXHJcbiAgICAgICAgaWYgKCFyZXN1bHQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRPTV9NSVNTSU5HKHF1ZXJ5KSApO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBhdHRyaWJ1dGUgZnJvbSB0aGUgZ2l2ZW4gZWxlbWVudCwgdGhyb3dpbmcgYW4gZXJyb3JcclxuICAgICAqIGlmIHRoZSBhdHRyaWJ1dGUgaXMgbWlzc2luZy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgYXR0cmlidXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gYXR0ciBOYW1lIG9mIHRoZSBhdHRyaWJ1dGUgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxyXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGF0dHJpYnV0ZSdzIHZhbHVlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZUF0dHIoZWxlbWVudDogSFRNTEVsZW1lbnQsIGF0dHI6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAoICFlbGVtZW50Lmhhc0F0dHJpYnV0ZShhdHRyKSApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkFUVFJfTUlTU0lORyhhdHRyKSApO1xyXG5cclxuICAgICAgICByZXR1cm4gZWxlbWVudC5nZXRBdHRyaWJ1dGUoYXR0cikhO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBrZXkgb2YgdGhlIGdpdmVuIGVsZW1lbnQncyBkYXRhc2V0LCB0aHJvd2luZyBhbiBlcnJvclxyXG4gICAgICogaWYgdGhlIHZhbHVlIGlzIG1pc3Npbmcgb3IgZW1wdHkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGRhdGEgb2ZcclxuICAgICAqIEBwYXJhbSBrZXkgS2V5IHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBkYXRhc2V0J3MgdmFsdWVcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXF1aXJlRGF0YShlbGVtZW50OiBIVE1MRWxlbWVudCwga2V5OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHZhbHVlID0gZWxlbWVudC5kYXRhc2V0W2tleV07XHJcblxyXG4gICAgICAgIGlmICggU3RyaW5ncy5pc051bGxPckVtcHR5KHZhbHVlKSApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRBVEFfTUlTU0lORyhrZXkpICk7XHJcblxyXG4gICAgICAgIHJldHVybiB2YWx1ZSE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCbHVycyAodW5mb2N1c2VzKSB0aGUgY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGFyZW50IElmIGdpdmVuLCBvbmx5IGJsdXJzIGlmIGFjdGl2ZSBpcyBkZXNjZW5kYW50XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYmx1ckFjdGl2ZShwYXJlbnQ6IEhUTUxFbGVtZW50ID0gZG9jdW1lbnQuYm9keSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGFjdGl2ZSA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggYWN0aXZlICYmIGFjdGl2ZS5ibHVyICYmIHBhcmVudC5jb250YWlucyhhY3RpdmUpIClcclxuICAgICAgICAgICAgYWN0aXZlLmJsdXIoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIERlZXAgY2xvbmVzIGFsbCB0aGUgY2hpbGRyZW4gb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGludG8gdGhlIHRhcmdldCBlbGVtZW50LlxyXG4gICAgICogVXNpbmcgaW5uZXJIVE1MIHdvdWxkIGJlIGVhc2llciwgaG93ZXZlciBpdCBoYW5kbGVzIHNlbGYtY2xvc2luZyB0YWdzIHBvb3JseS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc291cmNlIEVsZW1lbnQgd2hvc2UgY2hpbGRyZW4gdG8gY2xvbmVcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWxlbWVudCB0byBhcHBlbmQgdGhlIGNsb25lZCBjaGlsZHJlbiB0b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsb25lSW50byhzb3VyY2U6IEhUTUxFbGVtZW50LCB0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNvdXJjZS5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICB0YXJnZXQuYXBwZW5kQ2hpbGQoIHNvdXJjZS5jaGlsZE5vZGVzW2ldLmNsb25lTm9kZSh0cnVlKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3VnYXIgZm9yIGNyZWF0aW5nIGFuZCBhZGRpbmcgYW4gb3B0aW9uIGVsZW1lbnQgdG8gYSBzZWxlY3QgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFNlbGVjdCBsaXN0IGVsZW1lbnQgdG8gYWRkIHRoZSBvcHRpb24gdG9cclxuICAgICAqIEBwYXJhbSB0ZXh0IExhYmVsIGZvciB0aGUgb3B0aW9uXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVmFsdWUgZm9yIHRoZSBvcHRpb25cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhZGRPcHRpb24oc2VsZWN0OiBIVE1MU2VsZWN0RWxlbWVudCwgdGV4dDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nID0gJycpXHJcbiAgICAgICAgOiBIVE1MT3B0aW9uRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIGxldCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKSBhcyBIVE1MT3B0aW9uRWxlbWVudDtcclxuXHJcbiAgICAgICAgb3B0aW9uLnRleHQgID0gdGV4dDtcclxuICAgICAgICBvcHRpb24udmFsdWUgPSB2YWx1ZTtcclxuXHJcbiAgICAgICAgc2VsZWN0LmFkZChvcHRpb24pO1xyXG4gICAgICAgIHJldHVybiBvcHRpb247XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGV4Y2x1ZGluZyB0aGUgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW4uXHJcbiAgICAgKiBCZSB3YXJuZWQ7IHRoaXMgbWV0aG9kIHVzZXMgUkFHLXNwZWNpZmljIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gcmVjdXJzaXZlbHkgZ2V0IHRleHQgY29udGVudCBvZlxyXG4gICAgICogQHJldHVybnMgVGV4dCBjb250ZW50IG9mIGdpdmVuIGVsZW1lbnQsIHdpdGhvdXQgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRWaXNpYmxlVGV4dChlbGVtZW50OiBFbGVtZW50KSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICAgICAgKGVsZW1lbnQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudC50ZXh0Q29udGVudCB8fCAnJztcclxuICAgICAgICBlbHNlIGlmICggZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3RvZ2dsZScpIClcclxuICAgICAgICAgICAgcmV0dXJuICcnO1xyXG5cclxuICAgICAgICAvLyBSZXR1cm4gYmxhbmsgKHNraXApIGlmIGNoaWxkIG9mIGEgY29sbGFwc2VkIGVsZW1lbnQuIFByZXZpb3VzbHksIHRoaXMgdXNlZFxyXG4gICAgICAgIC8vIGdldENvbXB1dGVkU3R5bGUsIGJ1dCB0aGF0IGRvZXNuJ3Qgd29yayBpZiB0aGUgZWxlbWVudCBpcyBwYXJ0IG9mIGFuIG9ycGhhbmVkXHJcbiAgICAgICAgLy8gcGhyYXNlIChhcyBoYXBwZW5zIHdpdGggdGhlIHBocmFzZXNldCBwaWNrZXIpLlxyXG4gICAgICAgIGxldCBwYXJlbnQgPSBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggcGFyZW50ICYmIHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpIClcclxuICAgICAgICAgICAgcmV0dXJuICcnO1xyXG5cclxuICAgICAgICBsZXQgdGV4dCA9ICcnO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICB0ZXh0ICs9IERPTS5nZXRWaXNpYmxlVGV4dChlbGVtZW50LmNoaWxkTm9kZXNbaV0gYXMgRWxlbWVudCk7XHJcblxyXG4gICAgICAgIHJldHVybiB0ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdGV4dCBjb250ZW50IG9mIHRoZSBnaXZlbiBlbGVtZW50LCBleGNsdWRpbmcgdGhlIHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuLFxyXG4gICAgICogYW5kIGV4Y2VzcyB3aGl0ZXNwYWNlIGFzIGEgcmVzdWx0IG9mIGNvbnZlcnRpbmcgZnJvbSBIVE1ML1hNTC5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xOTk4NjMyOFxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byByZWN1cnNpdmVseSBnZXQgdGV4dCBjb250ZW50IG9mXHJcbiAgICAgKiBAcmV0dXJucyBDbGVhbmVkIHRleHQgb2YgZ2l2ZW4gZWxlbWVudCwgd2l0aG91dCB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldENsZWFuZWRWaXNpYmxlVGV4dChlbGVtZW50OiBFbGVtZW50KSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBTdHJpbmdzLmNsZWFuKCBET00uZ2V0VmlzaWJsZVRleHQoZWxlbWVudCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNjYW5zIGZvciB0aGUgbmV4dCBmb2N1c2FibGUgc2libGluZyBmcm9tIGEgZ2l2ZW4gZWxlbWVudCwgc2tpcHBpbmcgaGlkZGVuIG9yXHJcbiAgICAgKiB1bmZvY3VzYWJsZSBlbGVtZW50cy4gSWYgdGhlIGVuZCBvZiB0aGUgY29udGFpbmVyIGlzIGhpdCwgdGhlIHNjYW4gd3JhcHMgYXJvdW5kLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBmcm9tIEVsZW1lbnQgdG8gc3RhcnQgc2Nhbm5pbmcgZnJvbVxyXG4gICAgICogQHBhcmFtIGRpciBEaXJlY3Rpb247IC0xIGZvciBsZWZ0IChwcmV2aW91cyksIDEgZm9yIHJpZ2h0IChuZXh0KVxyXG4gICAgICogQHJldHVybnMgVGhlIG5leHQgYXZhaWxhYmxlIHNpYmxpbmcsIG9yIG51bGwgaWYgbm9uZSBmb3VuZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZyb206IEhUTUxFbGVtZW50LCBkaXI6IG51bWJlcilcclxuICAgICAgICA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdXJyZW50ID0gZnJvbTtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IGZyb20ucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCFwYXJlbnQpXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICB3aGlsZSAodHJ1ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIFByb2NlZWQgdG8gbmV4dCBlbGVtZW50LCBvciB3cmFwIGFyb3VuZCBpZiBoaXQgdGhlIGVuZCBvZiBwYXJlbnRcclxuICAgICAgICAgICAgaWYgICAgICAoZGlyIDwgMClcclxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBwYXJlbnQubGFzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID4gMClcclxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IHBhcmVudC5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuQkFEX0RJUkVDVElPTiggZGlyLnRvU3RyaW5nKCkgKSApO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgd2UndmUgY29tZSBiYWNrIHRvIHRoZSBzdGFydGluZyBlbGVtZW50LCBub3RoaW5nIHdhcyBmb3VuZFxyXG4gICAgICAgICAgICBpZiAoY3VycmVudCA9PT0gZnJvbSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgdGhpcyBlbGVtZW50IGlzbid0IGhpZGRlbiBhbmQgaXMgZm9jdXNhYmxlLCByZXR1cm4gaXQhXHJcbiAgICAgICAgICAgIGlmICggIWN1cnJlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdoaWRkZW4nKSApXHJcbiAgICAgICAgICAgIGlmICggY3VycmVudC5oYXNBdHRyaWJ1dGUoJ3RhYmluZGV4JykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBlbGVtZW50LCByZWxldmFudCB0byBpdHMgcGFyZW50LlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIGVsZW1lbnQgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluZGV4T2YoY2hpbGQ6IEhUTUxFbGVtZW50KSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGRyZW4sIGNoaWxkKVxyXG4gICAgICAgICAgICA6IC0xO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBub2RlLCByZWxldmFudCB0byBpdHMgcGFyZW50LiBVc2VkIGZvciB0ZXh0IG5vZGVzLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIG5vZGUgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG5vZGVJbmRleE9mKGNoaWxkOiBOb2RlKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnROb2RlO1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGROb2RlcywgY2hpbGQpXHJcbiAgICAgICAgICAgIDogLTE7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBBIHZlcnksIHZlcnkgc21hbGwgc3Vic2V0IG9mIE1hcmtkb3duIGZvciBoeXBlcmxpbmtpbmcgYSBibG9jayBvZiB0ZXh0ICovXHJcbmNsYXNzIExpbmtkb3duXHJcbntcclxuICAgIC8qKiBSZWdleCBwYXR0ZXJuIGZvciBtYXRjaGluZyBsaW5rZWQgdGV4dCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVHRVhfTElOSyA9IC9cXFsoLis/KVxcXS9naTtcclxuICAgIC8qKiBSZWdleCBwYXR0ZXJuIGZvciBtYXRjaGluZyBsaW5rIHJlZmVyZW5jZXMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX1JFRiAgPSAvXFxbKFxcZCspXFxdOlxccysoXFxTKykvZ2k7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQYXJzZXMgdGhlIHRleHQgb2YgdGhlIGdpdmVuIGJsb2NrIGFzIExpbmtkb3duLCBjb252ZXJ0aW5nIHRhZ2dlZCB0ZXh0IGludG8gbGlua3NcclxuICAgICAqIHVzaW5nIGEgZ2l2ZW4gbGlzdCBvZiBpbmRleC1iYXNlZCByZWZlcmVuY2VzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBibG9jayBFbGVtZW50IHdpdGggdGV4dCB0byByZXBsYWNlOyBhbGwgY2hpbGRyZW4gY2xlYXJlZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlKGJsb2NrOiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGxpbmtzIDogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICAgICAgLy8gRmlyc3QsIGdldCB0aGUgbGlzdCBvZiByZWZlcmVuY2VzLCByZW1vdmluZyB0aGVtIGZyb20gdGhlIHRleHRcclxuICAgICAgICBsZXQgaWR4ICA9IDA7XHJcbiAgICAgICAgbGV0IHRleHQgPSBibG9jay5pbm5lclRleHQucmVwbGFjZSh0aGlzLlJFR0VYX1JFRiwgKF8sIGssIHYpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsaW5rc1sgcGFyc2VJbnQoaykgXSA9IHY7XHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgcmVwbGFjZSBlYWNoIHRhZ2dlZCBwYXJ0IG9mIHRleHQgd2l0aCBhIGxpbmsgZWxlbWVudFxyXG4gICAgICAgIGJsb2NrLmlubmVySFRNTCA9IHRleHQucmVwbGFjZSh0aGlzLlJFR0VYX0xJTkssIChfLCB0KSA9PlxyXG4gICAgICAgICAgICBgPGEgaHJlZj0nJHtsaW5rc1tpZHgrK119JyB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub29wZW5lclwiPiR7dH08L2E+YFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIHBhcnNpbmcgZGF0YSBmcm9tIHN0cmluZ3MgKi9cclxuY2xhc3MgUGFyc2Vcclxue1xyXG4gICAgLyoqIFBhcnNlcyBhIGdpdmVuIHN0cmluZyBpbnRvIGEgYm9vbGVhbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sZWFuKHN0cjogc3RyaW5nKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICBzdHIgPSBzdHIudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgICAgICAgaWYgKHN0ciA9PT0gJ3RydWUnIHx8IHN0ciA9PT0gJzEnKVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBpZiAoc3RyID09PSAnZmFsc2UnIHx8IHN0ciA9PT0gJzAnKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIHRocm93IEVycm9yKCBMLkJBRF9CT09MRUFOKHN0cikgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZ2VuZXJhdGluZyByYW5kb20gZGF0YSAqL1xyXG5jbGFzcyBSYW5kb21cclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSBpbnRlZ2VyIGZyb20gdGhlIGdpdmVuIHJhbmdlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBtaW4gTWluaW11bSBpbnRlZ2VyIHRvIHBpY2ssIGluY2x1c2l2ZVxyXG4gICAgICogQHBhcmFtIG1heCBNYXhpbXVtIGludGVnZXIgdG8gcGljaywgaW5jbHVzaXZlXHJcbiAgICAgKiBAcmV0dXJucyBSYW5kb20gaW50ZWdlciB3aXRoaW4gdGhlIGdpdmVuIHJhbmdlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50KG1pbjogbnVtYmVyID0gMCwgbWF4OiBudW1iZXIgPSAxKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBNYXRoLmZsb29yKCBNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbikgKSArIG1pbjtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gZWxlbWVudCBmcm9tIGEgZ2l2ZW4gYXJyYXktbGlrZSBvYmplY3Qgd2l0aCBhIGxlbmd0aCBwcm9wZXJ0eSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhcnJheShhcnI6IExlbmd0aGFibGUpIDogYW55XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGFyclsgUmFuZG9tLmludCgwLCBhcnIubGVuZ3RoKSBdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTcGxpY2VzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFycmF5U3BsaWNlPFQ+KGFycjogVFtdKSA6IFRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gYXJyLnNwbGljZShSYW5kb20uaW50KDAsIGFyci5sZW5ndGgpLCAxKVswXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20ga2V5IGZyb20gYSBnaXZlbiBvYmplY3QgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgb2JqZWN0S2V5KG9iajoge30pIDogYW55XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSggT2JqZWN0LmtleXMob2JqKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgdHJ1ZSBvciBmYWxzZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIENoYW5jZSBvdXQgb2YgMTAwLCB0byBwaWNrIGB0cnVlYFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJvb2woY2hhbmNlOiBudW1iZXIgPSA1MCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5pbnQoMCwgMTAwKSA8IGNoYW5jZTtcclxuICAgIH1cclxufVxyXG4iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IGNsYXNzIGZvciBhdWRpbyBmdW5jdGlvbmFsaXR5ICovXHJcbmNsYXNzIFNvdW5kc1xyXG57XHJcbiAgICAvKipcclxuICAgICAqIERlY29kZXMgdGhlIGdpdmVuIGF1ZGlvIGZpbGUgaW50byByYXcgYXVkaW8gZGF0YS4gVGhpcyBpcyBhIHdyYXBwZXIgZm9yIHRoZSBvbGRlclxyXG4gICAgICogY2FsbGJhY2stYmFzZWQgc3ludGF4LCBzaW5jZSBpdCBpcyB0aGUgb25seSBvbmUgaU9TIGN1cnJlbnRseSBzdXBwb3J0cy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBBdWRpbyBjb250ZXh0IHRvIHVzZSBmb3IgZGVjb2RpbmdcclxuICAgICAqIEBwYXJhbSBidWZmZXIgQnVmZmVyIG9mIGVuY29kZWQgZmlsZSBkYXRhIChlLmcuIG1wMykgdG8gZGVjb2RlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXN5bmMgZGVjb2RlKGNvbnRleHQ6IEF1ZGlvQ29udGV4dCwgYnVmZmVyOiBBcnJheUJ1ZmZlcilcclxuICAgICAgICA6IFByb21pc2U8QXVkaW9CdWZmZXI+XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlIDxBdWRpb0J1ZmZlcj4gKCAocmVzb2x2ZSwgcmVqZWN0KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQuZGVjb2RlQXVkaW9EYXRhKGJ1ZmZlciwgcmVzb2x2ZSwgcmVqZWN0KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIHN0cmluZ3MgKi9cclxuY2xhc3MgU3RyaW5nc1xyXG57XHJcbiAgICAvKiogQ2hlY2tzIGlmIHRoZSBnaXZlbiBzdHJpbmcgaXMgbnVsbCwgb3IgZW1wdHkgKHdoaXRlc3BhY2Ugb25seSBvciB6ZXJvLWxlbmd0aCkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNOdWxsT3JFbXB0eShzdHI6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiAhc3RyIHx8ICFzdHIudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJldHR5LXByaW50J3MgYSBnaXZlbiBsaXN0IG9mIHN0YXRpb25zLCB3aXRoIGNvbnRleHQgc2Vuc2l0aXZlIGV4dHJhcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZXMgTGlzdCBvZiBzdGF0aW9uIGNvZGVzIHRvIGpvaW5cclxuICAgICAqIEBwYXJhbSBjb250ZXh0IExpc3QncyBjb250ZXh0LiBJZiAnY2FsbGluZycsIGhhbmRsZXMgc3BlY2lhbCBjYXNlXHJcbiAgICAgKiBAcmV0dXJucyBQcmV0dHktcHJpbnRlZCBsaXN0IG9mIGdpdmVuIHN0YXRpb25zXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbVN0YXRpb25MaXN0KGNvZGVzOiBzdHJpbmdbXSwgY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSAnJztcclxuICAgICAgICBsZXQgbmFtZXMgID0gY29kZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgbmFtZXMuZm9yRWFjaCggKGMsIGkpID0+IG5hbWVzW2ldID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oYywgdHJ1ZSkgKTtcclxuXHJcbiAgICAgICAgaWYgKG5hbWVzLmxlbmd0aCA9PT0gMSlcclxuICAgICAgICAgICAgcmVzdWx0ID0gKGNvbnRleHQgPT09ICdjYWxsaW5nJylcclxuICAgICAgICAgICAgICAgID8gYCR7bmFtZXNbMF19IG9ubHlgXHJcbiAgICAgICAgICAgICAgICA6IG5hbWVzWzBdO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsYXN0U3RhdGlvbiA9IG5hbWVzLnBvcCgpO1xyXG5cclxuICAgICAgICAgICAgcmVzdWx0ICA9IG5hbWVzLmpvaW4oJywgJyk7XHJcbiAgICAgICAgICAgIHJlc3VsdCArPSBgIGFuZCAke2xhc3RTdGF0aW9ufWA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJldHR5LXByaW50cyB0aGUgZ2l2ZW4gZGF0ZSBvciBob3VycyBhbmQgbWludXRlcyBpbnRvIGEgMjQtaG91ciB0aW1lIChlLmcuIDAxOjA5KS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaG91cnMgSG91cnMsIGZyb20gMCB0byAyMywgb3IgRGF0ZSBvYmplY3RcclxuICAgICAqIEBwYXJhbSBtaW51dGVzIE1pbnV0ZXMsIGZyb20gMCB0byA1OVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21UaW1lKGhvdXJzOiBudW1iZXIgfCBEYXRlLCBtaW51dGVzOiBudW1iZXIgPSAwKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmIChob3VycyBpbnN0YW5jZW9mIERhdGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBtaW51dGVzID0gaG91cnMuZ2V0TWludXRlcygpO1xyXG4gICAgICAgICAgICBob3VycyAgID0gaG91cnMuZ2V0SG91cnMoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBob3Vycy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJykgKyAnOicgK1xyXG4gICAgICAgICAgICBtaW51dGVzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYW5zIHVwIHRoZSBnaXZlbiB0ZXh0IG9mIGV4Y2VzcyB3aGl0ZXNwYWNlIGFuZCBhbnkgbmV3bGluZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2xlYW4odGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0ZXh0LnRyaW0oKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xcblxccl0vZ2ksICAgJycgIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcc3syLH0vZ2ksICAgJyAnIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccyhbLixdKS9naSwgJyQxJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZvcm1hdHMgdGhlIGdpdmVuIHN0cmluZyB0byBvbmUgbW9yZSBmaWxlbmFtZSBmcmllbmRseSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaWxlbmFtZSh0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRleHRcclxuICAgICAgICAgICAgLnRvTG93ZXJDYXNlKClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccy9nLCAgICAgICAgICdfJylcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1teYS16MC05X10vZywgJycgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFVuaW9uIHR5cGUgZm9yIGl0ZXJhYmxlIHR5cGVzIHdpdGggYSAubGVuZ3RoIHByb3BlcnR5ICovXHJcbnR5cGUgTGVuZ3RoYWJsZSA9IEFycmF5PGFueT4gfCBOb2RlTGlzdCB8IEhUTUxDb2xsZWN0aW9uIHwgc3RyaW5nO1xyXG5cclxuLyoqIFJlcHJlc2VudHMgYSBwbGF0Zm9ybSBhcyBhIGRpZ2l0IGFuZCBvcHRpb25hbCBsZXR0ZXIgdHVwbGUgKi9cclxudHlwZSBQbGF0Zm9ybSA9IFtzdHJpbmcsIHN0cmluZ107XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIGdlbmVyaWMga2V5LXZhbHVlIGRpY3Rpb25hcnksIHdpdGggc3RyaW5nIGtleXMgKi9cclxudHlwZSBEaWN0aW9uYXJ5PFQ+ID0geyBbaW5kZXg6IHN0cmluZ106IFQgfTtcclxuXHJcbi8qKiBEZWZpbmVzIHRoZSBkYXRhIHJlZmVyZW5jZXMgY29uZmlnIG9iamVjdCBwYXNzZWQgaW50byBSQUcubWFpbiBvbiBpbml0ICovXHJcbmludGVyZmFjZSBEYXRhUmVmc1xyXG57XHJcbiAgICAvKiogU2VsZWN0b3IgZm9yIGdldHRpbmcgdGhlIHBocmFzZSBzZXQgWE1MIElGcmFtZSBlbGVtZW50ICovXHJcbiAgICBwaHJhc2VzZXRFbWJlZCA6IHN0cmluZztcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgZXhjdXNlcyBmb3IgdHJhaW4gZGVsYXlzIG9yIGNhbmNlbGxhdGlvbnMgdG8gdXNlICovXHJcbiAgICBleGN1c2VzRGF0YSAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIFJhdyBhcnJheSBvZiBuYW1lcyBmb3Igc3BlY2lhbCB0cmFpbnMgdG8gdXNlICovXHJcbiAgICBuYW1lZERhdGEgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIFJhdyBhcnJheSBvZiBuYW1lcyBmb3Igc2VydmljZXMvbmV0d29ya3MgdG8gdXNlICovXHJcbiAgICBzZXJ2aWNlc0RhdGEgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIFJhdyBkaWN0aW9uYXJ5IG9mIHN0YXRpb24gY29kZXMgYW5kIG5hbWVzIHRvIHVzZSAqL1xyXG4gICAgc3RhdGlvbnNEYXRhICAgOiBEaWN0aW9uYXJ5PHN0cmluZz47XHJcbn1cclxuXHJcbi8qKiBGaWxsIGlucyBmb3IgdmFyaW91cyBtaXNzaW5nIGRlZmluaXRpb25zIG9mIG1vZGVybiBKYXZhc2NyaXB0IGZlYXR1cmVzICovXHJcblxyXG5pbnRlcmZhY2UgV2luZG93XHJcbntcclxuICAgIG9udW5oYW5kbGVkcmVqZWN0aW9uOiBFcnJvckV2ZW50SGFuZGxlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFN0cmluZ1xyXG57XHJcbiAgICBwYWRTdGFydCh0YXJnZXRMZW5ndGg6IG51bWJlciwgcGFkU3RyaW5nPzogc3RyaW5nKSA6IHN0cmluZztcclxuICAgIHBhZEVuZCh0YXJnZXRMZW5ndGg6IG51bWJlciwgcGFkU3RyaW5nPzogc3RyaW5nKSA6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEFycmF5PFQ+XHJcbntcclxuICAgIGluY2x1ZGVzKHNlYXJjaEVsZW1lbnQ6IFQsIGZyb21JbmRleD86IG51bWJlcikgOiBib29sZWFuO1xyXG59XHJcblxyXG5kZWNsYXJlIGNsYXNzIE1lZGlhUmVjb3JkZXJcclxue1xyXG4gICAgY29uc3RydWN0b3Ioc3RyZWFtOiBNZWRpYVN0cmVhbSwgb3B0aW9ucz86IE1lZGlhUmVjb3JkZXJPcHRpb25zKTtcclxuICAgIHN0YXJ0KHRpbWVzbGljZT86IG51bWJlcikgOiB2b2lkO1xyXG4gICAgc3RvcCgpIDogdm9pZDtcclxuICAgIG9uZGF0YWF2YWlsYWJsZSA6ICgodGhpczogTWVkaWFSZWNvcmRlciwgZXY6IEJsb2JFdmVudCkgPT4gYW55KSB8IG51bGw7XHJcbiAgICBvbnN0b3AgOiAoKHRoaXM6IE1lZGlhUmVjb3JkZXIsIGV2OiBFdmVudCkgPT4gYW55KSB8IG51bGw7XHJcbn1cclxuXHJcbmludGVyZmFjZSBNZWRpYVJlY29yZGVyT3B0aW9uc1xyXG57XHJcbiAgICBtaW1lVHlwZT8gOiBzdHJpbmc7XHJcbiAgICBhdWRpb0JpdHNQZXJTZWNvbmQ/IDogbnVtYmVyO1xyXG4gICAgdmlkZW9CaXRzUGVyU2Vjb25kPyA6IG51bWJlcjtcclxuICAgIGJpdHNQZXJTZWNvbmQ/IDogbnVtYmVyO1xyXG59XHJcblxyXG5kZWNsYXJlIGNsYXNzIEJsb2JFdmVudCBleHRlbmRzIEV2ZW50XHJcbntcclxuICAgIHJlYWRvbmx5IGRhdGEgICAgIDogQmxvYjtcclxuICAgIHJlYWRvbmx5IHRpbWVjb2RlIDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXVkaW9Db250ZXh0QmFzZVxyXG57XHJcbiAgICBhdWRpb1dvcmtsZXQgOiBBdWRpb1dvcmtsZXQ7XHJcbn1cclxuXHJcbnR5cGUgU2FtcGxlQ2hhbm5lbHMgPSBGbG9hdDMyQXJyYXlbXVtdO1xyXG5cclxuZGVjbGFyZSBjbGFzcyBBdWRpb1dvcmtsZXRQcm9jZXNzb3Jcclxue1xyXG4gICAgc3RhdGljIHBhcmFtZXRlckRlc2NyaXB0b3JzIDogQXVkaW9QYXJhbURlc2NyaXB0b3JbXTtcclxuXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3Iob3B0aW9ucz86IEF1ZGlvV29ya2xldE5vZGVPcHRpb25zKTtcclxuICAgIHJlYWRvbmx5IHBvcnQ/OiBNZXNzYWdlUG9ydDtcclxuXHJcbiAgICBwcm9jZXNzKFxyXG4gICAgICAgIGlucHV0czogU2FtcGxlQ2hhbm5lbHMsXHJcbiAgICAgICAgb3V0cHV0czogU2FtcGxlQ2hhbm5lbHMsXHJcbiAgICAgICAgcGFyYW1ldGVyczogRGljdGlvbmFyeTxGbG9hdDMyQXJyYXk+XHJcbiAgICApIDogYm9vbGVhbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEF1ZGlvV29ya2xldE5vZGVPcHRpb25zIGV4dGVuZHMgQXVkaW9Ob2RlT3B0aW9uc1xyXG57XHJcbiAgICBudW1iZXJPZklucHV0cz8gOiBudW1iZXI7XHJcbiAgICBudW1iZXJPZk91dHB1dHM/IDogbnVtYmVyO1xyXG4gICAgb3V0cHV0Q2hhbm5lbENvdW50PyA6IG51bWJlcltdO1xyXG4gICAgcGFyYW1ldGVyRGF0YT8gOiB7W2luZGV4OiBzdHJpbmddIDogbnVtYmVyfTtcclxuICAgIHByb2Nlc3Nvck9wdGlvbnM/IDogYW55O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTWVkaWFUcmFja0NvbnN0cmFpbnRTZXRcclxue1xyXG4gICAgYXV0b0dhaW5Db250cm9sPzogYm9vbGVhbiB8IENvbnN0cmFpbkJvb2xlYW5QYXJhbWV0ZXJzO1xyXG4gICAgbm9pc2VTdXBwcmVzc2lvbj86IGJvb2xlYW4gfCBDb25zdHJhaW5Cb29sZWFuUGFyYW1ldGVycztcclxufVxyXG5cclxuZGVjbGFyZSBmdW5jdGlvbiByZWdpc3RlclByb2Nlc3NvcihuYW1lOiBzdHJpbmcsIGN0b3I6IEF1ZGlvV29ya2xldFByb2Nlc3NvcikgOiB2b2lkOyIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEhvbGRzIHJ1bnRpbWUgY29uZmlndXJhdGlvbiAqL1xyXG5jbGFzcyBDb25maWdcclxue1xyXG4gICAgLyoqIFZvbHVtZSBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljICBzcGVlY2hWb2wgICAgICA6IG51bWJlciA9IDEuMDtcclxuICAgIC8qKiBQaXRjaCBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljICBzcGVlY2hQaXRjaCAgICA6IG51bWJlciA9IDEuMDtcclxuICAgIC8qKiBSYXRlIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgIHNwZWVjaFJhdGUgICAgIDogbnVtYmVyID0gMS4wO1xyXG4gICAgLyoqIENob2ljZSBvZiBzcGVlY2ggdm9pY2UgdG8gdXNlLCBhcyBnZXRWb2ljZXMgaW5kZXggb3IgLTEgaWYgdW5zZXQgKi9cclxuICAgIHByaXZhdGUgX3NwZWVjaFZvaWNlICAgOiBudW1iZXIgPSAtMTtcclxuICAgIC8qKiBJZiB1c2VyIGhhcyBjbGlja2VkIHNodWZmbGUgYXQgbGVhc3Qgb25jZSAqL1xyXG4gICAgcHVibGljIGNsaWNrZWRHZW5lcmF0ZSA6IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENob2ljZSBvZiBzcGVlY2ggdm9pY2UgdG8gdXNlLCBhcyBnZXRWb2ljZXMgaW5kZXguIEJlY2F1c2Ugb2YgdGhlIGFzeW5jIG5hdHVyZSBvZlxyXG4gICAgICogZ2V0Vm9pY2VzLCB0aGUgZGVmYXVsdCB2YWx1ZSB3aWxsIGJlIGZldGNoZWQgZnJvbSBpdCBlYWNoIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIGdldCBzcGVlY2hWb2ljZSgpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVE9ETzogdGhpcyBpcyBwcm9iYWJseSBiZXR0ZXIgb2ZmIHVzaW5nIHZvaWNlIG5hbWVzXHJcbiAgICAgICAgLy8gSWYgdGhlcmUncyBhIHVzZXItZGVmaW5lZCB2YWx1ZSwgdXNlIHRoYXRcclxuICAgICAgICBpZiAgKHRoaXMuX3NwZWVjaFZvaWNlICE9PSAtMSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NwZWVjaFZvaWNlO1xyXG5cclxuICAgICAgICAvLyBTZWxlY3QgRW5nbGlzaCB2b2ljZXMgYnkgZGVmYXVsdFxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwLCB2ID0gUkFHLnNwZWVjaC5nZXRWb2ljZXMoKTsgaSA8IHYubGVuZ3RoIDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGxhbmcgPSB2W2ldLmxhbmc7XHJcblxyXG4gICAgICAgICAgICBpZiAobGFuZyA9PT0gJ2VuLUdCJyB8fCBsYW5nID09PSAnZW4tVVMnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBFbHNlLCBmaXJzdCB2b2ljZSBvbiB0aGUgbGlzdFxyXG4gICAgICAgIHJldHVybiAwO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjaG9pY2Ugb2Ygc3BlZWNoIHRvIHVzZSwgYXMgZ2V0Vm9pY2VzIGluZGV4ICovXHJcbiAgICBzZXQgc3BlZWNoVm9pY2UodmFsdWU6IG51bWJlcilcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zcGVlY2hWb2ljZSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgbG9hZHMgcnVudGltZSBjb25maWd1cmF0aW9uIGZyb20gbG9jYWxTdG9yYWdlLCBpZiBhbnkgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcihsb2FkOiBib29sZWFuKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBzZXR0aW5ncyA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnc2V0dGluZ3MnKTtcclxuXHJcbiAgICAgICAgaWYgKCFsb2FkIHx8ICFzZXR0aW5ncylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjb25maWcgPSBKU09OLnBhcnNlKHNldHRpbmdzKTtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCBjb25maWcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGFsZXJ0KCBMLkNPTkZJR19MT0FEX0ZBSUwoZS5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogU2FmZWx5IHNhdmVzIHJ1bnRpbWUgY29uZmlndXJhdGlvbiB0byBsb2NhbFN0b3JhZ2UgKi9cclxuICAgIHB1YmxpYyBzYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oICdzZXR0aW5ncycsIEpTT04uc3RyaW5naWZ5KHRoaXMpICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX1NBVkVfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgZGVsZXRlcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gZnJvbSBsb2NhbFN0b3JhZ2UgYW5kIHJlc2V0cyBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKCB0aGlzLCBuZXcgQ29uZmlnKGZhbHNlKSApO1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ3NldHRpbmdzJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX1JFU0VUX0ZBSUwoZS5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgZGF0YSBmb3IgZXhjdXNlcywgdHJhaW5zLCBzZXJ2aWNlcyBhbmQgc3RhdGlvbnMgKi9cclxuY2xhc3MgRGF0YWJhc2Vcclxue1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiBleGN1c2VzICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGV4Y3VzZXMgICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGF0YXNldCBvZiBuYW1lZCB0cmFpbnMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbmFtZWQgICAgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIHNlcnZpY2Ugb3IgbmV0d29yayBuYW1lcyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzZXJ2aWNlcyAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBuYW1lcywgd2l0aCB0aHJlZS1sZXR0ZXIgY29kZSBrZXlzIChlLmcuIEFCQykgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc3RhdGlvbnMgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPjtcclxuICAgIC8qKiBMb2FkZWQgWE1MIGRvY3VtZW50IGNvbnRhaW5pbmcgcGhyYXNlc2V0IGRhdGEgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgcGhyYXNlc2V0cyAgICA6IERvY3VtZW50O1xyXG4gICAgLyoqIEFtb3VudCBvZiBzdGF0aW9ucyBpbiB0aGUgY3VycmVudGx5IGxvYWRlZCBkYXRhc2V0ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHN0YXRpb25zQ291bnQgOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGRhdGFSZWZzOiBEYXRhUmVmcylcclxuICAgIHtcclxuICAgICAgICBsZXQgcXVlcnkgID0gZGF0YVJlZnMucGhyYXNlc2V0RW1iZWQ7XHJcbiAgICAgICAgbGV0IGlmcmFtZSA9IERPTS5yZXF1aXJlIDxIVE1MSUZyYW1lRWxlbWVudD4gKHF1ZXJ5KTtcclxuXHJcbiAgICAgICAgaWYgKCFpZnJhbWUuY29udGVudERvY3VtZW50KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5EQl9FTEVNRU5UX05PVF9QSFJBU0VTRVRfSUZSQU1FKHF1ZXJ5KSApO1xyXG5cclxuICAgICAgICB0aGlzLnBocmFzZXNldHMgICAgPSBpZnJhbWUuY29udGVudERvY3VtZW50O1xyXG4gICAgICAgIHRoaXMuZXhjdXNlcyAgICAgICA9IGRhdGFSZWZzLmV4Y3VzZXNEYXRhO1xyXG4gICAgICAgIHRoaXMubmFtZWQgICAgICAgICA9IGRhdGFSZWZzLm5hbWVkRGF0YTtcclxuICAgICAgICB0aGlzLnNlcnZpY2VzICAgICAgPSBkYXRhUmVmcy5zZXJ2aWNlc0RhdGE7XHJcbiAgICAgICAgdGhpcy5zdGF0aW9ucyAgICAgID0gZGF0YVJlZnMuc3RhdGlvbnNEYXRhO1xyXG4gICAgICAgIHRoaXMuc3RhdGlvbnNDb3VudCA9IE9iamVjdC5rZXlzKHRoaXMuc3RhdGlvbnMpLmxlbmd0aDtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tEYXRhYmFzZV0gRW50cmllcyBsb2FkZWQ6Jyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdEV4Y3VzZXM6JywgICAgICB0aGlzLmV4Y3VzZXMubGVuZ3RoKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0TmFtZWQgdHJhaW5zOicsIHRoaXMubmFtZWQubGVuZ3RoKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0U2VydmljZXM6JywgICAgIHRoaXMuc2VydmljZXMubGVuZ3RoKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0U3RhdGlvbnM6JywgICAgIHRoaXMuc3RhdGlvbnNDb3VudCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGV4Y3VzZSBmb3IgYSBkZWxheSBvciBjYW5jZWxsYXRpb24gKi9cclxuICAgIHB1YmxpYyBwaWNrRXhjdXNlKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmFycmF5KHRoaXMuZXhjdXNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgcGlja05hbWVkKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmFycmF5KHRoaXMubmFtZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xvbmVzIGFuZCBnZXRzIHBocmFzZSB3aXRoIHRoZSBnaXZlbiBJRCwgb3IgbnVsbCBpZiBpdCBkb2Vzbid0IGV4aXN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZCBJRCBvZiB0aGUgcGhyYXNlIHRvIGdldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlKGlkOiBzdHJpbmcpIDogSFRNTEVsZW1lbnQgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IHRoaXMucGhyYXNlc2V0cy5xdWVyeVNlbGVjdG9yKCdwaHJhc2UjJyArIGlkKSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKHJlc3VsdClcclxuICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0LmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSBwaHJhc2VzZXQgd2l0aCB0aGUgZ2l2ZW4gSUQsIG9yIG51bGwgaWYgaXQgZG9lc24ndCBleGlzdC4gTm90ZSB0aGF0IHRoZVxyXG4gICAgICogcmV0dXJuZWQgcGhyYXNlc2V0IGNvbWVzIGZyb20gdGhlIFhNTCBkb2N1bWVudCwgc28gaXQgc2hvdWxkIG5vdCBiZSBtdXRhdGVkLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZCBJRCBvZiB0aGUgcGhyYXNlc2V0IHRvIGdldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlc2V0KGlkOiBzdHJpbmcpIDogSFRNTEVsZW1lbnQgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucGhyYXNlc2V0cy5xdWVyeVNlbGVjdG9yKCdwaHJhc2VzZXQjJyArIGlkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gcmFpbCBuZXR3b3JrIG5hbWUgKi9cclxuICAgIHB1YmxpYyBwaWNrU2VydmljZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLnNlcnZpY2VzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIGEgcmFuZG9tIHN0YXRpb24gY29kZSBmcm9tIHRoZSBkYXRhc2V0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBleGNsdWRlIExpc3Qgb2YgY29kZXMgdG8gZXhjbHVkZS4gTWF5IGJlIGlnbm9yZWQgaWYgc2VhcmNoIHRha2VzIHRvbyBsb25nLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcGlja1N0YXRpb25Db2RlKGV4Y2x1ZGU/OiBzdHJpbmdbXSkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICAvLyBHaXZlIHVwIGZpbmRpbmcgcmFuZG9tIHN0YXRpb24gdGhhdCdzIG5vdCBpbiB0aGUgZ2l2ZW4gbGlzdCwgaWYgd2UgdHJ5IG1vcmVcclxuICAgICAgICAvLyB0aW1lcyB0aGVuIHRoZXJlIGFyZSBzdGF0aW9ucy4gSW5hY2N1cmF0ZSwgYnV0IGF2b2lkcyBpbmZpbml0ZSBsb29wcy5cclxuICAgICAgICBpZiAoZXhjbHVkZSkgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnN0YXRpb25zQ291bnQ7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IFJhbmRvbS5vYmplY3RLZXkodGhpcy5zdGF0aW9ucyk7XHJcblxyXG4gICAgICAgICAgICBpZiAoICFleGNsdWRlLmluY2x1ZGVzKHZhbHVlKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gUmFuZG9tLm9iamVjdEtleSh0aGlzLnN0YXRpb25zKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHN0YXRpb24gbmFtZSBmcm9tIHRoZSBnaXZlbiB0aHJlZSBsZXR0ZXIgY29kZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGdldCB0aGUgbmFtZSBvZlxyXG4gICAgICogQHBhcmFtIGZpbHRlcmVkIFdoZXRoZXIgdG8gZmlsdGVyIG91dCBwYXJlbnRoZXNpemVkIGxvY2F0aW9uIGNvbnRleHRcclxuICAgICAqIEByZXR1cm5zIFN0YXRpb24gbmFtZSBmb3IgdGhlIGdpdmVuIGNvZGUsIGZpbHRlcmVkIGlmIHNwZWNpZmllZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbihjb2RlOiBzdHJpbmcsIGZpbHRlcmVkOiBib29sZWFuID0gZmFsc2UpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSB0aGlzLnN0YXRpb25zW2NvZGVdO1xyXG5cclxuICAgICAgICBpZiAgICAgICghc3RhdGlvbilcclxuICAgICAgICAgICAgcmV0dXJuIEwuREJfVU5LTk9XTl9TVEFUSU9OKGNvZGUpO1xyXG4gICAgICAgIGVsc2UgaWYgKCBTdHJpbmdzLmlzTnVsbE9yRW1wdHkoc3RhdGlvbikgKVxyXG4gICAgICAgICAgICByZXR1cm4gTC5EQl9FTVBUWV9TVEFUSU9OKGNvZGUpO1xyXG5cclxuICAgICAgICBpZiAoZmlsdGVyZWQpXHJcbiAgICAgICAgICAgIHN0YXRpb24gPSBzdGF0aW9uLnJlcGxhY2UoL1xcKC4rXFwpL2ksICcnKS50cmltKCk7XHJcblxyXG4gICAgICAgIHJldHVybiBzdGF0aW9uO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gcmFuZ2Ugb2Ygc3RhdGlvbiBjb2RlcywgZW5zdXJpbmcgdGhlcmUgYXJlIG5vIGR1cGxpY2F0ZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIG1pbiBNaW5pbXVtIGFtb3VudCBvZiBzdGF0aW9ucyB0byBwaWNrXHJcbiAgICAgKiBAcGFyYW0gbWF4IE1heGltdW0gYW1vdW50IG9mIHN0YXRpb25zIHRvIHBpY2tcclxuICAgICAqIEBwYXJhbSBleGNsdWRlXHJcbiAgICAgKiBAcmV0dXJucyBBIGxpc3Qgb2YgdW5pcXVlIHN0YXRpb24gbmFtZXNcclxuICAgICAqL1xyXG4gICAgcHVibGljIHBpY2tTdGF0aW9uQ29kZXMobWluID0gMSwgbWF4ID0gMTYsIGV4Y2x1ZGU/IDogc3RyaW5nW10pIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBpZiAobWF4IC0gbWluID4gT2JqZWN0LmtleXModGhpcy5zdGF0aW9ucykubGVuZ3RoKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5EQl9UT09fTUFOWV9TVEFUSU9OUygpICk7XHJcblxyXG4gICAgICAgIGxldCByZXN1bHQ6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgICAgIGxldCBsZW5ndGggPSBSYW5kb20uaW50KG1pbiwgbWF4KTtcclxuICAgICAgICBsZXQgdHJpZXMgID0gMDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHJlc3VsdC5sZW5ndGggPCBsZW5ndGgpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQga2V5ID0gUmFuZG9tLm9iamVjdEtleSh0aGlzLnN0YXRpb25zKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEdpdmUgdXAgdHJ5aW5nIHRvIGF2b2lkIGR1cGxpY2F0ZXMsIGlmIHdlIHRyeSBtb3JlIHRpbWVzIHRoYW4gdGhlcmUgYXJlXHJcbiAgICAgICAgICAgIC8vIHN0YXRpb25zIGF2YWlsYWJsZS4gSW5hY2N1cmF0ZSwgYnV0IGdvb2QgZW5vdWdoLlxyXG4gICAgICAgICAgICBpZiAodHJpZXMrKyA+PSB0aGlzLnN0YXRpb25zQ291bnQpXHJcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgZ2l2ZW4gYW4gZXhjbHVzaW9uIGxpc3QsIGNoZWNrIGFnYWluc3QgYm90aCB0aGF0IGFuZCByZXN1bHRzXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKCBleGNsdWRlICYmICFleGNsdWRlLmluY2x1ZGVzKGtleSkgJiYgIXJlc3VsdC5pbmNsdWRlcyhrZXkpIClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBub3QsIGp1c3QgY2hlY2sgd2hhdCByZXN1bHRzIHdlJ3ZlIGFscmVhZHkgZm91bmRcclxuICAgICAgICAgICAgZWxzZSBpZiAoICFleGNsdWRlICYmICFyZXN1bHQuaW5jbHVkZXMoa2V5KSApXHJcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1haW4gY2xhc3Mgb2YgdGhlIGVudGlyZSBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yIGFwcGxpY2F0aW9uICovXHJcbmNsYXNzIFJBR1xyXG57XHJcbiAgICAvKiogR2V0cyB0aGUgY29uZmlndXJhdGlvbiBob2xkZXIgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY29uZmlnICAgOiBDb25maWc7XHJcbiAgICAvKiogR2V0cyB0aGUgZGF0YWJhc2UgbWFuYWdlciwgd2hpY2ggaG9sZHMgcGhyYXNlLCBzdGF0aW9uIGFuZCB0cmFpbiBkYXRhICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGRhdGFiYXNlIDogRGF0YWJhc2U7XHJcbiAgICAvKiogR2V0cyB0aGUgcGhyYXNlIG1hbmFnZXIsIHdoaWNoIGdlbmVyYXRlcyBIVE1MIHBocmFzZXMgZnJvbSBYTUwgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGhyYXNlciAgOiBQaHJhc2VyO1xyXG4gICAgLyoqIEdldHMgdGhlIHNwZWVjaCBlbmdpbmUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3BlZWNoICAgOiBTcGVlY2g7XHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCB0cmFpbiBhbmQgc3RhdGlvbiBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzdGF0ZSAgICA6IFN0YXRlO1xyXG4gICAgLyoqIEdldHMgdGhlIHZpZXcgY29udHJvbGxlciwgd2hpY2ggbWFuYWdlcyBVSSBpbnRlcmFjdGlvbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB2aWV3cyAgICA6IFZpZXdzO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogRW50cnkgcG9pbnQgZm9yIFJBRywgdG8gYmUgY2FsbGVkIGZyb20gSmF2YXNjcmlwdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZGF0YVJlZnMgQ29uZmlndXJhdGlvbiBvYmplY3QsIHdpdGggcmFpbCBkYXRhIHRvIHVzZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG1haW4oZGF0YVJlZnM6IERhdGFSZWZzKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cub25lcnJvciAgICAgICAgICAgICAgPSBlcnJvciA9PiBSQUcucGFuaWMoZXJyb3IpO1xyXG4gICAgICAgIHdpbmRvdy5vbnVuaGFuZGxlZHJlamVjdGlvbiA9IGVycm9yID0+IFJBRy5wYW5pYyhlcnJvcik7XHJcblxyXG4gICAgICAgIEkxOG4uaW5pdCgpO1xyXG5cclxuICAgICAgICBSQUcuY29uZmlnICAgPSBuZXcgQ29uZmlnKHRydWUpO1xyXG4gICAgICAgIFJBRy5kYXRhYmFzZSA9IG5ldyBEYXRhYmFzZShkYXRhUmVmcyk7XHJcbiAgICAgICAgUkFHLnZpZXdzICAgID0gbmV3IFZpZXdzKCk7XHJcbiAgICAgICAgUkFHLnBocmFzZXIgID0gbmV3IFBocmFzZXIoKTtcclxuICAgICAgICBSQUcuc3BlZWNoICAgPSBuZXcgU3BlZWNoKCk7XHJcblxyXG4gICAgICAgIC8vIEJlZ2luXHJcblxyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5XRUxDT01FKCkgKTtcclxuICAgICAgICBSQUcuZ2VuZXJhdGUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2VuZXJhdGVzIGEgbmV3IHJhbmRvbSBwaHJhc2UgYW5kIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlID0gbmV3IFN0YXRlKCk7XHJcbiAgICAgICAgUkFHLnN0YXRlLmdlbkRlZmF1bHRTdGF0ZSgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuZ2VuZXJhdGUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogTG9hZHMgc3RhdGUgZnJvbSBnaXZlbiBKU09OICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxvYWQoanNvbjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUgPSBPYmplY3QuYXNzaWduKCBuZXcgU3RhdGUoKSwgSlNPTi5wYXJzZShqc29uKSApIGFzIFN0YXRlO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuZ2VuZXJhdGUoKTtcclxuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfRlJPTV9TVE9SQUdFKCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2xvYmFsIGVycm9yIGhhbmRsZXI7IHRocm93cyB1cCBhIGJpZyByZWQgcGFuaWMgc2NyZWVuIG9uIHVuY2F1Z2h0IGVycm9yICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBwYW5pYyhlcnJvcjogc3RyaW5nIHwgRXZlbnQgPSBcIlVua25vd24gZXJyb3JcIilcclxuICAgIHtcclxuICAgICAgICBsZXQgbXNnID0gJzxkaXYgaWQ9XCJwYW5pY1NjcmVlblwiIGNsYXNzPVwid2FybmluZ1NjcmVlblwiPic7XHJcbiAgICAgICAgbXNnICAgICs9ICc8aDE+XCJXZSBhcmUgc29ycnkgdG8gYW5ub3VuY2UgdGhhdC4uLlwiPC9oMT4nO1xyXG4gICAgICAgIG1zZyAgICArPSBgPHA+UkFHIGhhcyBjcmFzaGVkIGJlY2F1c2U6IDxjb2RlPiR7ZXJyb3J9PC9jb2RlPi48L3A+YDtcclxuICAgICAgICBtc2cgICAgKz0gYDxwPlBsZWFzZSBvcGVuIHRoZSBjb25zb2xlIGZvciBtb3JlIGluZm9ybWF0aW9uLjwvcD5gO1xyXG4gICAgICAgIG1zZyAgICArPSAnPC9kaXY+JztcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5pbm5lckhUTUwgPSBtc2c7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBEaXNwb3NhYmxlIGNsYXNzIHRoYXQgaG9sZHMgc3RhdGUgZm9yIHRoZSBjdXJyZW50IHNjaGVkdWxlLCB0cmFpbiwgZXRjLiAqL1xyXG5jbGFzcyBTdGF0ZVxyXG57XHJcbiAgICAvKiogU3RhdGUgb2YgY29sbGFwc2libGUgZWxlbWVudHMuIEtleSBpcyByZWZlcmVuY2UgSUQsIHZhbHVlIGlzIGNvbGxhcHNlZC4gKi9cclxuICAgIHByaXZhdGUgX2NvbGxhcHNpYmxlcyA6IERpY3Rpb25hcnk8Ym9vbGVhbj4gID0ge307XHJcbiAgICAvKiogQ3VycmVudCBjb2FjaCBsZXR0ZXIgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGxldHRlci4gKi9cclxuICAgIHByaXZhdGUgX2NvYWNoZXMgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBpbnRlZ2VyIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBpbnRlZ2VyLiAqL1xyXG4gICAgcHJpdmF0ZSBfaW50ZWdlcnMgICAgIDogRGljdGlvbmFyeTxudW1iZXI+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHBocmFzZXNldCBwaHJhc2UgY2hvaWNlcy4gS2V5IGlzIHJlZmVyZW5jZSBJRCwgdmFsdWUgaXMgaW5kZXguICovXHJcbiAgICBwcml2YXRlIF9waHJhc2VzZXRzICAgOiBEaWN0aW9uYXJ5PG51bWJlcj4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc2VydmljZSBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgc2VydmljZS4gKi9cclxuICAgIHByaXZhdGUgX3NlcnZpY2VzICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzdGF0aW9uIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBzdGF0aW9uIGNvZGUuICovXHJcbiAgICBwcml2YXRlIF9zdGF0aW9ucyAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc3RhdGlvbiBsaXN0IGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBhcnJheSBvZiBjb2Rlcy4gKi9cclxuICAgIHByaXZhdGUgX3N0YXRpb25MaXN0cyA6IERpY3Rpb25hcnk8c3RyaW5nW10+ID0ge307XHJcbiAgICAvKiogQ3VycmVudCB0aW1lIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyB0aW1lLiAqL1xyXG4gICAgcHJpdmF0ZSBfdGltZXMgICAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuXHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBleGN1c2UgKi9cclxuICAgIHByaXZhdGUgX2V4Y3VzZT8gICA6IHN0cmluZztcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIHBsYXRmb3JtICovXHJcbiAgICBwcml2YXRlIF9wbGF0Zm9ybT8gOiBQbGF0Zm9ybTtcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIG5hbWVkIHRyYWluICovXHJcbiAgICBwcml2YXRlIF9uYW1lZD8gICAgOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGNvYWNoIGxldHRlciwgb3IgcmFuZG9tbHkgcGlja3Mgb25lIGZyb20gQSB0byBaLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgbGV0dGVyIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29hY2goY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb2FjaGVzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2FjaGVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9jb2FjaGVzW2NvbnRleHRdID0gUmFuZG9tLmFycmF5KEwuTEVUVEVSUyk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvYWNoZXNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29hY2ggbGV0dGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBsZXR0ZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29hY2ggVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRDb2FjaChjb250ZXh0OiBzdHJpbmcsIGNvYWNoOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvYWNoZXNbY29udGV4dF0gPSBjb2FjaDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIENoYW5jZSBiZXR3ZWVuIDAgYW5kIDEwMCBvZiBjaG9vc2luZyB0cnVlLCBpZiB1bnNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29sbGFwc2VkKHJlZjogc3RyaW5nLCBjaGFuY2U6IG51bWJlcikgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29sbGFwc2libGVzW3JlZl0gPSAhUmFuZG9tLmJvb2woY2hhbmNlKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fY29sbGFwc2libGVzW3JlZl07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29sbGFwc2libGUncyBzdGF0ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBzZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgVmFsdWUgdG8gc2V0LCB3aGVyZSB0cnVlIGlzIFwiY29sbGFwc2VkXCJcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldENvbGxhcHNlZChyZWY6IHN0cmluZywgc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdID0gc3RhdGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGludGVnZXIsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIGludGVnZXIgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRJbnRlZ2VyKGNvbnRleHQ6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5faW50ZWdlcnNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICBsZXQgbWluID0gMCwgbWF4ID0gMDtcclxuXHJcbiAgICAgICAgc3dpdGNoKGNvbnRleHQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlIFwiY29hY2hlc1wiOiAgICAgICBtaW4gPSAxOyBtYXggPSAxMDsgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZGVsYXllZFwiOiAgICAgICBtaW4gPSA1OyBtYXggPSAxMjA7IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZnJvbnRfY29hY2hlc1wiOiBtaW4gPSAyOyBtYXggPSA1OyAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwicmVhcl9jb2FjaGVzXCI6ICBtaW4gPSAyOyBtYXggPSA1OyAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5faW50ZWdlcnNbY29udGV4dF0gPSBSYW5kb20uaW50KG1pbiwgbWF4KTtcclxuICAgICAgICByZXR1cm4gdGhpcy5faW50ZWdlcnNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGFuIGludGVnZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIGludGVnZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRJbnRlZ2VyKGNvbnRleHQ6IHN0cmluZywgdmFsdWU6IG51bWJlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5faW50ZWdlcnNbY29udGV4dF0gPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gcGhyYXNlIG9mIGEgcGhyYXNlc2V0LCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgcGhyYXNlc2V0J3MgcGhyYXNlIG9mXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2VzZXRJZHgocmVmOiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3BocmFzZXNldHNbcmVmXSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGhyYXNlc2V0c1tyZWZdO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBpcyB0aGlzIHNhZmUgYWNyb3NzIHBocmFzZXNldCBjaGFuZ2VzP1xyXG4gICAgICAgIGlmICghcGhyYXNlc2V0KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5TVEFURV9OT05FWElTVEFOVF9QSFJBU0VTRVQocmVmKSApO1xyXG5cclxuICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBSYW5kb20uaW50KDAsIHBocmFzZXNldC5jaGlsZHJlbi5sZW5ndGgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9waHJhc2VzZXRzW3JlZl07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSBjaG9zZW4gaW5kZXggZm9yIGEgcGhyYXNlc2V0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSByZWYgUmVmZXJlbmNlIElEIHRvIHNldCB0aGUgcGhyYXNlc2V0IGluZGV4IG9mXHJcbiAgICAgKiBAcGFyYW0gaWR4IEluZGV4IHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0UGhyYXNlc2V0SWR4KHJlZjogc3RyaW5nLCBpZHg6IG51bWJlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fcGhyYXNlc2V0c1tyZWZdID0gaWR4O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBzZXJ2aWNlLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBzZXJ2aWNlIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U2VydmljZShjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fc2VydmljZXNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1NlcnZpY2UoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fc2VydmljZXNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgc2VydmljZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgc2VydmljZSBmb3JcclxuICAgICAqIEBwYXJhbSBzZXJ2aWNlIFZhbHVlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0U2VydmljZShjb250ZXh0OiBzdHJpbmcsIHNlcnZpY2U6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc2VydmljZXNbY29udGV4dF0gPSBzZXJ2aWNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBzdGF0aW9uIGNvZGUsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHN0YXRpb24gZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc3RhdGlvbnNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbnNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgc3RhdGlvbiBjb2RlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBzdGF0aW9uIGNvZGUgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29kZSBTdGF0aW9uIGNvZGUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTdGF0aW9uKGNvbnRleHQ6IHN0cmluZywgY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XSA9IGNvZGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGxpc3Qgb2Ygc3RhdGlvbiBjb2Rlcywgb3IgcmFuZG9tbHkgZ2VuZXJhdGVzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHN0YXRpb24gbGlzdCBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb25MaXN0KGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XTtcclxuICAgICAgICBlbHNlIGlmIChjb250ZXh0ID09PSAnY2FsbGluZ19maXJzdCcpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldFN0YXRpb25MaXN0KCdjYWxsaW5nJyk7XHJcblxyXG4gICAgICAgIGxldCBtaW4gPSAxLCBtYXggPSAxNjtcclxuXHJcbiAgICAgICAgc3dpdGNoKGNvbnRleHQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlICdjYWxsaW5nX3NwbGl0JzogbWluID0gMjsgbWF4ID0gMTY7IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdjaGFuZ2VzJzogICAgICAgbWluID0gMTsgbWF4ID0gNDsgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdub3Rfc3RvcHBpbmcnOiAgbWluID0gMTsgbWF4ID0gODsgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMobWluLCBtYXgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgbGlzdCBvZiBzdGF0aW9uIGNvZGVzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBzdGF0aW9uIGNvZGUgbGlzdCBmb3JcclxuICAgICAqIEBwYXJhbSBjb2RlcyBTdGF0aW9uIGNvZGVzIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0U3RhdGlvbkxpc3QoY29udGV4dDogc3RyaW5nLCBjb2Rlczogc3RyaW5nW10pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSA9IGNvZGVzO1xyXG5cclxuICAgICAgICBpZiAoY29udGV4dCA9PT0gJ2NhbGxpbmdfZmlyc3QnKVxyXG4gICAgICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbJ2NhbGxpbmcnXSA9IGNvZGVzO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiB0aW1lXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSB0aW1lIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0VGltZShjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3RpbWVzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl90aW1lc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fdGltZXNbY29udGV4dF0gPSBTdHJpbmdzLmZyb21UaW1lKCBSYW5kb20uaW50KDAsIDIzKSwgUmFuZG9tLmludCgwLCA1OSkgKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fdGltZXNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgdGltZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgdGltZSBmb3JcclxuICAgICAqIEBwYXJhbSB0aW1lIFZhbHVlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0VGltZShjb250ZXh0OiBzdHJpbmcsIHRpbWU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fdGltZXNbY29udGV4dF0gPSB0aW1lO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjaG9zZW4gZXhjdXNlLCBvciByYW5kb21seSBwaWNrcyBvbmUgKi9cclxuICAgIHB1YmxpYyBnZXQgZXhjdXNlKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fZXhjdXNlKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZXhjdXNlO1xyXG5cclxuICAgICAgICB0aGlzLl9leGN1c2UgPSBSQUcuZGF0YWJhc2UucGlja0V4Y3VzZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9leGN1c2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgZXhjdXNlICovXHJcbiAgICBwdWJsaWMgc2V0IGV4Y3VzZSh2YWx1ZTogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2V4Y3VzZSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjaG9zZW4gcGxhdGZvcm0sIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSAqL1xyXG4gICAgcHVibGljIGdldCBwbGF0Zm9ybSgpIDogUGxhdGZvcm1cclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fcGxhdGZvcm0pXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9wbGF0Zm9ybTtcclxuXHJcbiAgICAgICAgbGV0IHBsYXRmb3JtIDogUGxhdGZvcm0gPSBbJycsICcnXTtcclxuXHJcbiAgICAgICAgLy8gT25seSAyJSBjaGFuY2UgZm9yIHBsYXRmb3JtIDAsIHNpbmNlIGl0J3MgcmFyZVxyXG4gICAgICAgIHBsYXRmb3JtWzBdID0gUmFuZG9tLmJvb2woOTgpXHJcbiAgICAgICAgICAgID8gUmFuZG9tLmludCgxLCAyNikudG9TdHJpbmcoKVxyXG4gICAgICAgICAgICA6ICcwJztcclxuXHJcbiAgICAgICAgLy8gT25seSAxMCUgY2hhbmNlIGZvciBwbGF0Zm9ybSBsZXR0ZXIsIHNpbmNlIGl0J3MgdW5jb21tb25cclxuICAgICAgICBwbGF0Zm9ybVsxXSA9IFJhbmRvbS5ib29sKDEwKVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSgnQUJDJylcclxuICAgICAgICAgICAgOiAnJztcclxuXHJcbiAgICAgICAgdGhpcy5fcGxhdGZvcm0gPSBwbGF0Zm9ybTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzZXQgcGxhdGZvcm0odmFsdWU6IFBsYXRmb3JtKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BsYXRmb3JtID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBuYW1lZCB0cmFpbiwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IG5hbWVkKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fbmFtZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9uYW1lZDtcclxuXHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSBSQUcuZGF0YWJhc2UucGlja05hbWVkKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgc2V0IG5hbWVkKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgdGhlIHN0YXRlIGluIGEgcGFydGljdWxhciB3YXksIHNvIHRoYXQgaXQgbWFrZXMgc29tZSByZWFsLXdvcmxkIHNlbnNlLlxyXG4gICAgICogVG8gZG8gc28sIHdlIGhhdmUgdG8gZ2VuZXJhdGUgZGF0YSBpbiBhIHBhcnRpY3VsYXIgb3JkZXIsIGFuZCBtYWtlIHN1cmUgdG8gYXZvaWRcclxuICAgICAqIGR1cGxpY2F0ZXMgaW4gaW5hcHByb3ByaWF0ZSBwbGFjZXMgYW5kIGNvbnRleHRzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2VuRGVmYXVsdFN0YXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RlcCAxLiBQcmVwb3B1bGF0ZSBzdGF0aW9uIGxpc3RzXHJcblxyXG4gICAgICAgIGxldCBzbENhbGxpbmcgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDE2KTtcclxuICAgICAgICBsZXQgc2xDYWxsU3BsaXQgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygyLCAxNiwgc2xDYWxsaW5nKTtcclxuICAgICAgICBsZXQgYWxsQ2FsbGluZyAgPSBbLi4uc2xDYWxsaW5nLCAuLi5zbENhbGxTcGxpdF07XHJcblxyXG4gICAgICAgIC8vIExpc3Qgb2Ygb3RoZXIgc3RhdGlvbnMgZm91bmQgdmlhIGEgc3BlY2lmaWMgY2FsbGluZyBwb2ludFxyXG4gICAgICAgIGxldCBzbENoYW5nZXMgICAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgNCwgYWxsQ2FsbGluZyk7XHJcbiAgICAgICAgLy8gTGlzdCBvZiBvdGhlciBzdGF0aW9ucyB0aGF0IHRoaXMgdHJhaW4gdXN1YWxseSBzZXJ2ZXMsIGJ1dCBjdXJyZW50bHkgaXNuJ3RcclxuICAgICAgICBsZXQgc2xOb3RTdG9wcGluZyA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDgsXHJcbiAgICAgICAgICAgIFsuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXNdXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gVGFrZSBhIHJhbmRvbSBzbGljZSBmcm9tIHRoZSBjYWxsaW5nIGxpc3QsIHRvIGlkZW50aWZ5IGFzIHJlcXVlc3Qgc3RvcHNcclxuICAgICAgICBsZXQgcmVxQ291bnQgICA9IFJhbmRvbS5pbnQoMSwgc2xDYWxsaW5nLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgIGxldCBzbFJlcXVlc3RzID0gc2xDYWxsaW5nLnNsaWNlKDAsIHJlcUNvdW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZycsICAgICAgIHNsQ2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZ19zcGxpdCcsIHNsQ2FsbFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjaGFuZ2VzJywgICAgICAgc2xDaGFuZ2VzKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdub3Rfc3RvcHBpbmcnLCAgc2xOb3RTdG9wcGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgncmVxdWVzdCcsICAgICAgIHNsUmVxdWVzdHMpO1xyXG5cclxuICAgICAgICAvLyBTdGVwIDIuIFByZXBvcHVsYXRlIHN0YXRpb25zXHJcblxyXG4gICAgICAgIC8vIEFueSBzdGF0aW9uIG1heSBiZSBibGFtZWQgZm9yIGFuIGV4Y3VzZSwgZXZlbiBvbmVzIGFscmVhZHkgcGlja2VkXHJcbiAgICAgICAgbGV0IHN0RXhjdXNlICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoKTtcclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiBpcyBmaW5hbCBjYWxsIG9mIHRoZSBjYWxsaW5nIGxpc3RcclxuICAgICAgICBsZXQgc3REZXN0ICAgID0gc2xDYWxsaW5nW3NsQ2FsbGluZy5sZW5ndGggLSAxXTtcclxuICAgICAgICAvLyBWaWEgaXMgYSBjYWxsIGJlZm9yZSB0aGUgZGVzdGluYXRpb24sIG9yIG9uZSBpbiB0aGUgc3BsaXQgbGlzdCBpZiB0b28gc21hbGxcclxuICAgICAgICBsZXQgc3RWaWEgICAgID0gc2xDYWxsaW5nLmxlbmd0aCA+IDFcclxuICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoIHNsQ2FsbGluZy5zbGljZSgwLCAtMSkgICApXHJcbiAgICAgICAgICAgIDogUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuICAgICAgICAvLyBEaXR0byBmb3IgcGlja2luZyBhIHJhbmRvbSBjYWxsaW5nIHN0YXRpb24gYXMgYSBzaW5nbGUgcmVxdWVzdCBvciBjaGFuZ2Ugc3RvcFxyXG4gICAgICAgIGxldCBzdENhbGxpbmcgPSBzbENhbGxpbmcubGVuZ3RoID4gMVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSggc2xDYWxsaW5nLnNsaWNlKDAsIC0xKSAgIClcclxuICAgICAgICAgICAgOiBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG5cclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiAobGFzdCBjYWxsKSBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdERlc3RTcGxpdCA9IHNsQ2FsbFNwbGl0W3NsQ2FsbFNwbGl0Lmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIC8vIFJhbmRvbSBub24tZGVzdGluYXRpb24gc3RvcCBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdFZpYVNwbGl0ICA9IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcbiAgICAgICAgLy8gV2hlcmUgdGhlIHRyYWluIGNvbWVzIGZyb20sIHNvIGNhbid0IGJlIG9uIGFueSBsaXN0cyBvciBwcmlvciBzdGF0aW9uc1xyXG4gICAgICAgIGxldCBzdFNvdXJjZSAgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoW1xyXG4gICAgICAgICAgICAuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXMsIC4uLnNsTm90U3RvcHBpbmcsIC4uLnNsUmVxdWVzdHMsXHJcbiAgICAgICAgICAgIHN0Q2FsbGluZywgc3REZXN0LCBzdFZpYSwgc3REZXN0U3BsaXQsIHN0VmlhU3BsaXRcclxuICAgICAgICBdKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdjYWxsaW5nJywgICAgICAgICAgIHN0Q2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbicsICAgICAgIHN0RGVzdCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbl9zcGxpdCcsIHN0RGVzdFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2V4Y3VzZScsICAgICAgICAgICAgc3RFeGN1c2UpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignc291cmNlJywgICAgICAgICAgICBzdFNvdXJjZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCd2aWEnLCAgICAgICAgICAgICAgIHN0VmlhKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3ZpYV9zcGxpdCcsICAgICAgICAgc3RWaWFTcGxpdCk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgMy4gUHJlcG9wdWxhdGUgY29hY2ggbnVtYmVyc1xyXG5cclxuICAgICAgICBsZXQgaW50Q29hY2hlcyA9IHRoaXMuZ2V0SW50ZWdlcignY29hY2hlcycpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgZW5vdWdoIGNvYWNoZXMsIGp1c3Qgc3BsaXQgdGhlIG51bWJlciBkb3duIHRoZSBtaWRkbGUgaW5zdGVhZC5cclxuICAgICAgICAvLyBFbHNlLCBmcm9udCBhbmQgcmVhciBjb2FjaGVzIHdpbGwgYmUgcmFuZG9tbHkgcGlja2VkICh3aXRob3V0IG1ha2luZyBzZW5zZSlcclxuICAgICAgICBpZiAoaW50Q29hY2hlcyA+PSA0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGludEZyb250Q29hY2hlcyA9IChpbnRDb2FjaGVzIC8gMikgfCAwO1xyXG4gICAgICAgICAgICBsZXQgaW50UmVhckNvYWNoZXMgID0gaW50Q29hY2hlcyAtIGludEZyb250Q29hY2hlcztcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcignZnJvbnRfY29hY2hlcycsIGludEZyb250Q29hY2hlcyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcigncmVhcl9jb2FjaGVzJywgaW50UmVhckNvYWNoZXMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgYXJlIGVub3VnaCBjb2FjaGVzLCBhc3NpZ24gY29hY2ggbGV0dGVycyBmb3IgY29udGV4dHMuXHJcbiAgICAgICAgLy8gRWxzZSwgbGV0dGVycyB3aWxsIGJlIHJhbmRvbWx5IHBpY2tlZCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpXHJcbiAgICAgICAgaWYgKGludENvYWNoZXMgPj0gNClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsZXR0ZXJzID0gTC5MRVRURVJTLnNsaWNlKDAsIGludENvYWNoZXMpLnNwbGl0KCcnKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdmaXJzdCcsICAgICBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3Nob3AnLCAgICAgIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc3RhbmRhcmQxJywgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzdGFuZGFyZDInLCBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNC4gUHJlcG9wdWxhdGUgc2VydmljZXNcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBzZXJ2aWNlLCBwaWNrIG9uZSB0byBiZSB0aGUgXCJtYWluXCIgYW5kIG9uZSB0byBiZSB0aGVcclxuICAgICAgICAvLyBcImFsdGVybmF0ZVwiLCBlbHNlIHRoZSBvbmUgc2VydmljZSB3aWxsIGJlIHVzZWQgZm9yIGJvdGggKHdpdGhvdXQgbWFraW5nIHNlbnNlKS5cclxuICAgICAgICBpZiAoUkFHLmRhdGFiYXNlLnNlcnZpY2VzLmxlbmd0aCA+IDEpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgc2VydmljZXMgPSBSQUcuZGF0YWJhc2Uuc2VydmljZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VydmljZSggJ3Byb3ZpZGVyJywgICAgUmFuZG9tLmFycmF5U3BsaWNlKHNlcnZpY2VzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldFNlcnZpY2UoICdhbHRlcm5hdGl2ZScsIFJhbmRvbS5hcnJheVNwbGljZShzZXJ2aWNlcykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNS4gUHJlcG9wdWxhdGUgdGltZXNcclxuICAgICAgICAvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTIxNDc1M1xyXG5cclxuICAgICAgICAvLyBUaGUgYWx0ZXJuYXRpdmUgdGltZSBpcyBmb3IgYSB0cmFpbiB0aGF0J3MgbGF0ZXIgdGhhbiB0aGUgbWFpbiB0cmFpblxyXG4gICAgICAgIGxldCB0aW1lICAgID0gbmV3IERhdGUoIG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgUmFuZG9tLmludCgwLCA1OSkgKiA2MDAwMCk7XHJcbiAgICAgICAgbGV0IHRpbWVBbHQgPSBuZXcgRGF0ZSggdGltZS5nZXRUaW1lKCkgICAgICAgKyBSYW5kb20uaW50KDAsIDMwKSAqIDYwMDAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnbWFpbicsICAgICAgICBTdHJpbmdzLmZyb21UaW1lKHRpbWUpICAgICk7XHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnYWx0ZXJuYXRpdmUnLCBTdHJpbmdzLmZyb21UaW1lKHRpbWVBbHQpICk7XHJcbiAgICB9XHJcbn0iXX0=