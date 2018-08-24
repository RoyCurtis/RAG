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
        Chooser.TEMPLATE.hidden = false;
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
        // TODO: Might the use of hidden break A11y here? (e.g. defocus)
        this.inputChoices.hidden = true;
        // Iterate through all the items
        for (let i = 0; i < items.length; i++)
            engine(items[i], filter);
        this.inputChoices.hidden = false;
    }
    /** Applies filter to an item, showing it if matched, hiding if not */
    static filterItem(item, filter) {
        // Show if contains search term
        if (item.innerText.toLowerCase().indexOf(filter) >= 0) {
            item.hidden = false;
            return 0;
        }
        // Hide if not
        else {
            item.hidden = true;
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
            group.hidden = true;
        else
            group.hidden = false;
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
// TODO: Search by station code
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
        StationListItem.TEMPLATE.hidden = false;
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
        this.dom.hidden = false;
        this.domEditing = target;
        this.layout();
    }
    /** Closes this picker */
    close() {
        // Fix keyboard staying open in iOS on close
        DOM.blurActive(this.dom);
        this.dom.hidden = true;
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
        this.domEmptyList.hidden = true;
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
            this.domEmptyList.hidden = false;
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
        let forcedIdx = ctx.xmlElement.getAttribute('idx');
        ctx.newElement.dataset['ref'] = ref;
        if (!phraseset) {
            ctx.newElement.textContent = L.EDITOR_UNKNOWN_PHRASESET(ref);
            return;
        }
        let idx = forcedIdx
            ? parseInt(forcedIdx)
            : RAG.state.getPhrasesetIdx(ref);
        let phrase = phraseset.children[idx];
        ctx.newElement.dataset['idx'] = forcedIdx || idx.toString();
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
            return [0.65];
        // If it begins with a full stop, add silence
        if (text.startsWith('.'))
            set.push(0.65);
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
            set.push(0.65);
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
        let result = [0.15, `excuse.${key}.${inflect}`];
        if (inflect === 'mid')
            result.push(0.2);
        return result;
    }
    resolveInteger(element) {
        let ctx = element.dataset['context'];
        let singular = element.dataset['singular'];
        let plural = element.dataset['plural'];
        let integer = RAG.state.getInteger(ctx);
        let parts = [0.125, `number.${integer}.mid`];
        if (singular && integer === 1)
            parts.push(0.15, `number.suffix.${singular}.end`);
        else if (plural && integer !== 1)
            parts.push(0.15, `number.suffix.${plural}.end`);
        else
            parts.push(0.15);
        return parts;
    }
    resolveNamed() {
        let named = Strings.filename(RAG.state.named);
        return [0.2, `named.${named}.mid`, 0.2];
    }
    resolvePlatform(idx) {
        let platform = RAG.state.platform;
        let inflect = this.getInflection(idx);
        let letter = (platform[1] === '¾') ? 'M' : platform[1];
        let result = [0.15, `number.${platform[0]}${letter}.${inflect}`];
        if (inflect === 'mid')
            result.push(0.2);
        return result;
    }
    resolveService(element) {
        let ctx = element.dataset['context'];
        let service = Strings.filename(RAG.state.getService(ctx));
        let result = [];
        // Only add beginning delay if there isn't already one prior
        if (typeof this.resolved.slice(-1)[0] !== 'number')
            result.push(0.1);
        return [...result, `service.${service}.mid`, 0.15];
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
        let parts = [0.2];
        list.forEach((v, k) => {
            // Handle middle of list inflection
            if (k !== list.length - 1) {
                parts.push(`station.${v}.mid`, 0.25);
                return;
            }
            // Add "and" if list has more than 1 station and this is the end
            if (list.length > 1)
                parts.push('station.parts.and.mid', 0.25);
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
            return [...parts, 'number.0000.mid', 0.2];
        // Hours
        parts.push(`number.${time[0]}.begin`);
        if (time[1] === '00')
            parts.push(0.075, 'number.hundred.mid');
        else
            parts.push(0.2, `number.${time[1]}.mid`);
        return [...parts, 0.15];
    }
    resolveVox(element) {
        let text = element.innerText.trim();
        let result = [];
        if (text.startsWith('.'))
            result.push(0.65);
        result.push(element.dataset['key']);
        if (text.endsWith('.'))
            result.push(0.65);
        return result;
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Manages speech synthesis using both native and custom engines */
class Speech {
    constructor() {
        /** Array of browser-provided voices available */
        this.browserVoices = [];
        /** Reference to the native speech-stopped check timer */
        this.stopTimer = 0;
        // Some browsers don't properly cancel speech on page close.
        // BUG: onpageshow and onpagehide not working on iOS 11
        window.onbeforeunload =
            window.onunload =
                window.onpageshow =
                    window.onpagehide = this.stop.bind(this);
        document.onvisibilitychange = this.onVisibilityChange.bind(this);
        window.speechSynthesis.onvoiceschanged = this.onVoicesChanged.bind(this);
        // Even though 'onvoiceschanged' is used later to populate the list, Chrome does
        // not actually fire the event until this call...
        this.onVoicesChanged();
        // TODO: Make this a dynamic registration and check for features
        this.voxEngine = VoxEngine.getInstance();
    }
    /** Begins speaking the given phrase components */
    speak(phrase, settings = {}) {
        this.stop();
        if (this.voxEngine && either(settings.useVox, RAG.config.voxEnabled))
            this.speakVox(phrase, settings);
        else if (window.speechSynthesis)
            this.speakBrowser(phrase, settings);
        else if (this.onstop)
            this.onstop();
    }
    /** Stops and cancels all queued speech */
    stop() {
        // TODO: Check for speech synthesis
        if (window.speechSynthesis)
            window.speechSynthesis.cancel();
        if (this.voxEngine)
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
     * @param settings Settings to use for the voice
     */
    speakBrowser(phrase, settings) {
        // Reset to first voice, if configured choice is missing
        let voiceIdx = either(settings.voiceIdx, RAG.config.speechVoice);
        let voice = this.browserVoices[voiceIdx] || this.browserVoices[0];
        // The phrase text is split into sentences, as queueing large sentences that last
        // many seconds can break some TTS engines and browsers.
        let text = DOM.getCleanedVisibleText(phrase);
        let parts = text.split(/\.\s/i);
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
        // This checks for when the native engine has stopped speaking, and calls the
        // onstop event handler. I could use SpeechSynthesis.onend instead, but it was
        // found to be unreliable, so I have to poll the speaking property this way.
        clearInterval(this.stopTimer);
        this.stopTimer = setInterval(() => {
            if (window.speechSynthesis.speaking)
                return;
            clearInterval(this.stopTimer);
            if (this.onstop)
                this.onstop();
        }, 100);
    }
    /**
     * Synthesizes voice by walking through the given phrase elements, resolving parts to
     * sound file IDs, and feeding the entire array to the vox engine.
     *
     * @param phrase Phrase elements to speak
     * @param settings Settings to use for the voice
     */
    speakVox(phrase, settings) {
        let resolver = new Resolver(phrase);
        let voxPath = RAG.config.voxPath || RAG.config.voxCustomPath;
        this.voxEngine.onstop = () => {
            this.voxEngine.onstop = undefined;
            if (this.onstop)
                this.onstop();
        };
        // Apply settings from config here, to keep VOX engine decoupled from RAG
        settings.voxPath = either(settings.voxPath, voxPath);
        settings.voxReverb = either(settings.voxReverb, RAG.config.voxReverb);
        settings.voxChime = either(settings.voxChime, RAG.config.voxChime);
        settings.volume = either(settings.volume, RAG.config.speechVol);
        settings.rate = either(settings.rate, RAG.config.speechRate);
        this.voxEngine.speak(resolver.toVox(), settings);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Synthesizes speech by dynamically loading and piecing together voice files */
class VoxEngine {
    constructor(dataPath) {
        // Setup the core audio context
        /** Cache of impulse responses audio data, for reverb */
        this.impulses = {};
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
        if (AudioContext)
            this.audioContext = new AudioContext();
        else if (webkitAudioContext)
            this.audioContext = new webkitAudioContext();
        else
            this.audioContext = new mozAudioContext();
        if (!this.audioContext)
            throw new Error('Could not get audio context');
        // Setup nodes
        this.dataPath = dataPath;
        this.gainNode = this.audioContext.createGain();
        this.filterNode = this.audioContext.createBiquadFilter();
        this.reverbNode = this.audioContext.createConvolver();
        this.reverbNode.buffer = this.impulses[''];
        this.reverbNode.normalize = true;
        this.filterNode.type = 'highpass';
        this.filterNode.Q.value = 0.4;
        this.gainNode.connect(this.filterNode);
        // Rest of nodes get connected when speak is called
    }
    static getInstance(dataPath = 'data/vox') {
        if (VoxEngine.instance)
            return VoxEngine.instance;
        try {
            VoxEngine.instance = new VoxEngine(dataPath);
            return VoxEngine.instance;
        }
        catch (err) {
            // TODO: Localize
            console.error('Could not create a VOX engine instance:', err);
            return;
        }
    }
    /**
     * Begins loading and speaking a set of vox files. Stops any speech.
     *
     * @param ids List of vox ids to load as files, in speaking order
     * @param settings Voice settings to use
     */
    speak(ids, settings) {
        console.debug('VOX SPEAK:', ids, settings);
        // Set state
        if (this.isSpeaking)
            this.stop();
        this.isSpeaking = true;
        this.currentIds = ids;
        this.currentSettings = settings;
        // Set reverb
        if (Strings.isNullOrEmpty(settings.voxReverb))
            this.toggleReverb(false);
        else {
            let file = settings.voxReverb;
            let impulse = this.impulses[file];
            if (!impulse)
                fetch(`${this.dataPath}/${file}`)
                    .then(res => res.arrayBuffer())
                    .then(buf => Sounds.decode(this.audioContext, buf))
                    .then(imp => {
                    // Cache buffer for later
                    this.impulses[file] = imp;
                    this.reverbNode.buffer = imp;
                    this.toggleReverb(true);
                    console.debug('VOX REVERB LOADED');
                });
            else {
                this.reverbNode.buffer = impulse;
                this.toggleReverb(true);
            }
        }
        // Set volume
        let volume = either(settings.volume, 1);
        // Remaps the 1.1...1.9 range to 2...10
        if (volume > 1)
            volume = (volume * 10) - 9;
        this.gainNode.gain.value = volume;
        // Set chime, at forced playback rate of 1
        if (!Strings.isNullOrEmpty(settings.voxChime)) {
            let path = `${this.dataPath}/${settings.voxChime}`;
            let req = new VoxRequest(path, 0, this.audioContext);
            req.forceRate = 1;
            this.pendingReqs.push(req);
            ids.unshift(1.0);
        }
        // Begin the pump loop. On iOS, the context may have to be resumed first
        if (this.audioContext.state === 'suspended')
            this.audioContext.resume().then(() => this.pump());
        else
            this.pump();
    }
    /** Stops playing any currently spoken speech and resets state */
    stop() {
        // Already stopped? Do not continue
        if (!this.isSpeaking)
            return;
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
        this.currentSettings = undefined;
        this.pendingReqs = [];
        this.scheduledBuffers = [];
        console.debug('VOX STOPPED');
        if (this.onstop)
            this.onstop();
    }
    /**
     * Pumps the speech queue, by keeping up to 10 fetch requests for voice files going,
     * and then feeding their data (in enforced order) to the audio chain, one at a time.
     */
    pump() {
        // If the engine has stopped, do not proceed.
        if (!this.isSpeaking || !this.currentIds || !this.currentSettings)
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
            let path = `${this.currentSettings.voxPath}/${key}.mp3`;
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
        if (!req.buffer) {
            console.log('VOX CLIP SKIPPED:', req.path);
            return this.schedule();
        }
        // If this is the first clip being played, start from current wall-clock
        if (this.nextBegin === 0)
            this.nextBegin = this.audioContext.currentTime;
        console.log('VOX CLIP QUEUED:', req.path, req.buffer.duration, this.nextBegin);
        // Base latency not available in some browsers
        let latency = (this.audioContext.baseLatency || 0.01) + 0.15;
        let node = this.audioContext.createBufferSource();
        let rate = req.forceRate || this.currentSettings.rate || 1;
        node.buffer = req.buffer;
        // Remap rate from 0.1..1.9 to 0.8..1.5
        if (rate < 1)
            rate = (rate * 0.2) + 0.8;
        else if (rate > 1)
            rate = (rate * 0.5) + 0.5;
        // Calculate delay and duration based on playback rate
        let delay = req.delay * (1 / rate);
        let duration = node.buffer.duration * (1 / rate);
        node.playbackRate.value = rate;
        node.connect(this.gainNode);
        node.start(this.nextBegin + delay);
        this.scheduledBuffers.push(node);
        this.nextBegin += (duration + delay - latency);
        // Have this buffer node remove itself from the schedule when done
        node.onended = _ => {
            console.log('VOX CLIP ENDED:', req.path);
            let idx = this.scheduledBuffers.indexOf(node);
            if (idx !== -1)
                this.scheduledBuffers.splice(idx, 1);
        };
    }
    toggleReverb(state) {
        this.reverbNode.disconnect();
        this.filterNode.disconnect();
        if (state) {
            this.filterNode.connect(this.reverbNode);
            this.reverbNode.connect(this.audioContext.destination);
        }
        else
            this.filterNode.connect(this.audioContext.destination);
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
// TODO: Make all views use this class
/** Base class for a view; anything with a base DOM element */
class BaseView {
    /** Creates this base view, attaching it to the element matching the given query */
    constructor(domQuery) {
        this.dom = DOM.require(domQuery);
    }
    /** Gets this view's child element matching the given query */
    attach(query) {
        return DOM.require(query, this.dom);
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
        this.domSpan.style.transform = '';
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
///<reference path="baseView.ts"/>
/** Controller for the settings screen */
class Settings extends BaseView {
    constructor() {
        super('#settingsScreen');
        this.btnReset = this.attach('#btnResetSettings');
        this.btnSave = this.attach('#btnSaveSettings');
        this.chkUseVox = this.attach('#chkUseVox');
        this.hintUseVox = this.attach('#hintUseVox');
        this.selVoxVoice = this.attach('#selVoxVoice');
        this.inputVoxPath = this.attach('#inputVoxPath');
        this.selVoxReverb = this.attach('#selVoxReverb');
        this.selVoxChime = this.attach('#selVoxChime');
        this.selSpeechVoice = this.attach('#selSpeechChoice');
        this.rangeSpeechVol = this.attach('#rangeSpeechVol');
        this.rangeSpeechPitch = this.attach('#rangeSpeechPitch');
        this.rangeSpeechRate = this.attach('#rangeSpeechRate');
        this.btnSpeechTest = this.attach('#btnSpeechTest');
        // TODO: Check if VOX is available, disable if not
        this.btnReset.onclick = this.handleReset.bind(this);
        this.btnSave.onclick = this.handleSave.bind(this);
        this.chkUseVox.onchange = this.layout.bind(this);
        this.selVoxVoice.onchange = this.layout.bind(this);
        this.btnSpeechTest.onclick = this.handleVoiceTest.bind(this);
        Linkdown.parse(DOM.require('#legalBlock'));
    }
    /** Opens the settings screen */
    open() {
        // The voice list has to be populated each open, in case it changes
        this.populateVoiceList();
        this.chkUseVox.checked = RAG.config.voxEnabled;
        this.selVoxVoice.value = RAG.config.voxPath;
        this.inputVoxPath.value = RAG.config.voxCustomPath;
        this.selVoxReverb.value = RAG.config.voxReverb;
        this.selVoxChime.value = RAG.config.voxChime;
        this.selSpeechVoice.selectedIndex = RAG.config.speechVoice;
        this.rangeSpeechVol.valueAsNumber = RAG.config.speechVol;
        this.rangeSpeechPitch.valueAsNumber = RAG.config.speechPitch;
        this.rangeSpeechRate.valueAsNumber = RAG.config.speechRate;
        this.layout();
        this.dom.hidden = false;
        this.btnSave.focus();
    }
    /** Closes the settings screen */
    close() {
        this.cancelReset();
        RAG.speech.stop();
        this.dom.hidden = true;
        DOM.blurActive(this.dom);
    }
    /** Calculates form layout and control visibility based on state */
    layout() {
        let voxEnabled = this.chkUseVox.checked;
        let voxCustom = (this.selVoxVoice.value === '');
        // TODO: Migrate all of RAG to use hidden attributes instead, for screen readers
        DOM.toggleHiddenAll([this.selSpeechVoice, !voxEnabled], [this.rangeSpeechPitch, !voxEnabled], [this.selVoxVoice, voxEnabled], [this.inputVoxPath, voxEnabled && voxCustom], [this.selVoxReverb, voxEnabled], [this.selVoxChime, voxEnabled]);
    }
    /** Clears and populates the voice list */
    populateVoiceList() {
        this.selSpeechVoice.innerHTML = '';
        let voices = RAG.speech.browserVoices;
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
        RAG.speech.stop();
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
        RAG.config.voxEnabled = this.chkUseVox.checked;
        RAG.config.voxPath = this.selVoxVoice.value;
        RAG.config.voxCustomPath = this.inputVoxPath.value;
        RAG.config.voxReverb = this.selVoxReverb.value;
        RAG.config.voxChime = this.selVoxChime.value;
        RAG.config.speechVoice = this.selSpeechVoice.selectedIndex;
        // parseFloat instead of valueAsNumber; see Architecture.md
        RAG.config.speechVol = parseFloat(this.rangeSpeechVol.value);
        RAG.config.speechPitch = parseFloat(this.rangeSpeechPitch.value);
        RAG.config.speechRate = parseFloat(this.rangeSpeechRate.value);
        RAG.config.save();
        this.close();
    }
    /** Handles the speech test button, speaking a test phrase */
    handleVoiceTest(ev) {
        ev.preventDefault();
        RAG.speech.stop();
        this.btnSpeechTest.disabled = true;
        // Has to execute on a delay, as speech cancel is unreliable without it
        window.setTimeout(() => {
            this.btnSpeechTest.disabled = false;
            let phrase = document.createElement('div');
            phrase.innerHTML = '<phrase ref="sample"/>';
            RAG.phraser.process(phrase);
            RAG.speech.speak(phrase.firstElementChild, {
                useVox: this.chkUseVox.checked,
                voxPath: this.selVoxVoice.value || this.inputVoxPath.value,
                voxReverb: this.selVoxReverb.value,
                voxChime: this.selVoxChime.value,
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
        // Has to execute on a delay, as speech cancel is unreliable without it
        this.btnPlay.onclick = ev => {
            ev.preventDefault();
            RAG.speech.stop();
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
        RAG.speech.onstop = () => {
            this.btnStop.hidden = true;
            this.btnPlay.hidden = false;
            RAG.speech.onstop = undefined;
        };
        this.btnPlay.disabled = false;
        this.btnStop.hidden = false;
        this.btnPlay.hidden = true;
        RAG.views.marquee.set(RAG.views.editor.getText());
        RAG.speech.speak(RAG.views.editor.getPhrase());
    }
    /** Handles the stop button, stopping the marquee and any speech */
    handleStop() {
        RAG.speech.stop();
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
            if (!current.hidden)
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
    /**
     * Toggles the hidden attribute of the given element, and all its labels.
     *
     * @param element Element to toggle the hidden attribute of
     * @param force Optional value to force toggling to
     */
    static toggleHidden(element, force) {
        let hidden = !element.hidden;
        // Do nothing if already toggled to the forced state
        if (hidden === force)
            return;
        element.hidden = hidden;
        if (element.labels)
            element.labels.forEach(l => l.hidden = hidden);
    }
    /**
     * Toggles the hidden attribute of a group of elements, in bulk.
     *
     * @param list An array of argument pairs for {toggleHidden}
     */
    static toggleHiddenAll(...list) {
        list.forEach(l => this.toggleHidden(...l));
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
        /** If user has clicked shuffle at least once */
        this.clickedGenerate = false;
        /** Volume for speech to be set at */
        this.speechVol = 1.0;
        /** Pitch for speech to be set at */
        this.speechPitch = 1.0;
        /** Rate for speech to be set at */
        this.speechRate = 1.0;
        /** Choice of speech voice to use, as getVoices index or -1 if unset */
        this._speechVoice = -1;
        /** Whether to use the VOX engine */
        this.voxEnabled = true;
        /** Relative or absolute URL of the VOX voice to use */
        this.voxPath = 'https://roycurtis.github.io/RAG-VOX-Roy';
        /** Relative or absolute URL of the custom VOX voice to use */
        this.voxCustomPath = '';
        /** Impulse response to use for VOX's reverb */
        this.voxReverb = 'ir.stalbans_a_mono.wav';
        /** VOX key of the chime to use prior to speaking */
        this.voxChime = '';
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
        for (let i = 0, v = RAG.speech.browserVoices; i < v.length; i++) {
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
        msg += `<p>RAG has crashed because: <code>${error}</code></p>`;
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
        // Magic values
        if (platform[0] === '9')
            platform[1] = Random.bool(25) ? '¾' : '';
        // Only 10% chance for platform letter, since it's uncommon
        if (platform[1] === '')
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL3N0YXRpb25DaG9vc2VyLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkxpc3RJdGVtLnRzIiwidWkvcGlja2Vycy9waWNrZXIudHMiLCJ1aS9waWNrZXJzL2NvYWNoUGlja2VyLnRzIiwidWkvcGlja2Vycy9leGN1c2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2ludGVnZXJQaWNrZXIudHMiLCJ1aS9waWNrZXJzL25hbWVkUGlja2VyLnRzIiwidWkvcGlja2Vycy9waHJhc2VzZXRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BsYXRmb3JtUGlja2VyLnRzIiwidWkvcGlja2Vycy9zZXJ2aWNlUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uTGlzdFBpY2tlci50cyIsInVpL3BpY2tlcnMvdGltZVBpY2tlci50cyIsImxhbmcvYmFzZUxhbmd1YWdlLnRzIiwibGFuZy9lbmdsaXNoTGFuZ3VhZ2UudHMiLCJwaHJhc2VyL2VsZW1lbnRQcm9jZXNzb3JzLnRzIiwicGhyYXNlci9waHJhc2VDb250ZXh0LnRzIiwicGhyYXNlci9waHJhc2VyLnRzIiwic3BlZWNoL3Jlc29sdmVyLnRzIiwic3BlZWNoL3NwZWVjaC50cyIsInNwZWVjaC9zcGVlY2hTZXR0aW5ncy50cyIsInNwZWVjaC92b3hFbmdpbmUudHMiLCJzcGVlY2gvdm94UmVxdWVzdC50cyIsInVpL2Jhc2VWaWV3LnRzIiwidWkvZWRpdG9yLnRzIiwidWkvbWFycXVlZS50cyIsInVpL3NldHRpbmdzLnRzIiwidWkvdG9vbGJhci50cyIsInVpL3ZpZXdzLnRzIiwidXRpbC9jb2xsYXBzaWJsZXMudHMiLCJ1dGlsL2NvbmRpdGlvbmFscy50cyIsInV0aWwvZG9tLnRzIiwidXRpbC9saW5rZG93bi50cyIsInV0aWwvcGFyc2UudHMiLCJ1dGlsL3JhbmRvbS50cyIsInV0aWwvc291bmRzLnRzIiwidXRpbC9zdHJpbmdzLnRzIiwidXRpbC90eXBlcy50cyIsImNvbmZpZy50cyIsImRhdGFiYXNlLnRzIiwicmFnLnRzIiwic3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEscUVBQXFFO0FBRXJFLDhEQUE4RDtBQUM5RCxJQUFJLENBQWtDLENBQUM7QUFFdkMsTUFBTSxJQUFJO0lBVU4sNEVBQTRFO0lBQ3JFLE1BQU0sQ0FBQyxJQUFJO1FBRWQsSUFBSSxJQUFJLENBQUMsU0FBUztZQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUVuRCxJQUFJLENBQUMsU0FBUyxHQUFHO1lBQ2IsSUFBSSxFQUFHLElBQUksZUFBZSxFQUFFO1NBQy9CLENBQUM7UUFFRiwyQkFBMkI7UUFDM0IsQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUU1QyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUVEOzs7O09BSUc7SUFDSyxNQUFNLENBQUMsVUFBVTtRQUVyQixJQUFJLElBQWtCLENBQUM7UUFDdkIsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDLGdCQUFnQixDQUNoQyxRQUFRLENBQUMsSUFBSSxFQUNiLFVBQVUsQ0FBQyxZQUFZLEdBQUcsVUFBVSxDQUFDLFNBQVMsRUFDOUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUMvQixLQUFLLENBQ1IsQ0FBQztRQUVGLE9BQVEsSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFDOUI7WUFDSSxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssSUFBSSxDQUFDLFlBQVksRUFDdkM7Z0JBQ0ksSUFBSSxPQUFPLEdBQUcsSUFBZSxDQUFDO2dCQUU5QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFD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ekQsSUFBSSxDQUFDLE9BQU8sQ0FBRSxhQUFhLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBRSxDQUFDO0lBQzdELENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEdsb2JhbCByZWZlcmVuY2UgdG8gdGhlIGxhbmd1YWdlIGNvbnRhaW5lciwgc2V0IGF0IGluaXQgKi9cclxubGV0IEwgOiBFbmdsaXNoTGFuZ3VhZ2UgfCBCYXNlTGFuZ3VhZ2U7XHJcblxyXG5jbGFzcyBJMThuXHJcbntcclxuICAgIC8qKiBDb25zdGFudCByZWdleCB0byBtYXRjaCBmb3IgdHJhbnNsYXRpb24ga2V5cyAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVEFHX1JFR0VYIDogUmVnRXhwID0gLyVbQS1aX10rJS87XHJcblxyXG4gICAgLyoqIExhbmd1YWdlcyBjdXJyZW50bHkgYXZhaWxhYmxlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBsYW5ndWFnZXMgICA6IERpY3Rpb25hcnk8QmFzZUxhbmd1YWdlPjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gbGFuZ3VhZ2UgY3VycmVudGx5IGluIHVzZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgY3VycmVudExhbmcgOiBCYXNlTGFuZ3VhZ2U7XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgbGFuZ3VhZ2UsIGFuZCB0cmFuc2Zvcm1zIGFsbCB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBkb2N1bWVudCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMubGFuZ3VhZ2VzKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0kxOG4gaXMgYWxyZWFkeSBpbml0aWFsaXplZCcpO1xyXG5cclxuICAgICAgICB0aGlzLmxhbmd1YWdlcyA9IHtcclxuICAgICAgICAgICAgJ2VuJyA6IG5ldyBFbmdsaXNoTGFuZ3VhZ2UoKVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIFRPRE86IExhbmd1YWdlIHNlbGVjdGlvblxyXG4gICAgICAgIEwgPSB0aGlzLmN1cnJlbnRMYW5nID0gdGhpcy5sYW5ndWFnZXNbJ2VuJ107XHJcblxyXG4gICAgICAgIEkxOG4uYXBwbHlUb0RvbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogV2Fsa3MgdGhyb3VnaCBhbGwgdGV4dCBub2RlcyBpbiB0aGUgRE9NLCByZXBsYWNpbmcgYW55IHRyYW5zbGF0aW9uIGtleXMuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTA3MzA3NzcvMzM1NDkyMFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBhcHBseVRvRG9tKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5leHQgOiBOb2RlIHwgbnVsbDtcclxuICAgICAgICBsZXQgd2FsayA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoXHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHksXHJcbiAgICAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5UIHwgTm9kZUZpbHRlci5TSE9XX1RFWFQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogSTE4bi5ub2RlRmlsdGVyIH0sXHJcbiAgICAgICAgICAgIGZhbHNlXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgd2hpbGUgKCBuZXh0ID0gd2Fsay5uZXh0Tm9kZSgpIClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmIChuZXh0Lm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnQgPSBuZXh0IGFzIEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBlbGVtZW50LmF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgICAgICAgICAgSTE4bi5leHBhbmRBdHRyaWJ1dGUoZWxlbWVudC5hdHRyaWJ1dGVzW2ldKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChuZXh0Lm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSAmJiBuZXh0LnRleHRDb250ZW50KVxyXG4gICAgICAgICAgICAgICAgSTE4bi5leHBhbmRUZXh0Tm9kZShuZXh0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbHRlcnMgdGhlIHRyZWUgd2Fsa2VyIHRvIGV4Y2x1ZGUgc2NyaXB0IGFuZCBzdHlsZSB0YWdzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBub2RlRmlsdGVyKG5vZGU6IE5vZGUpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhZyA9IChub2RlLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSlcclxuICAgICAgICAgICAgPyAobm9kZSBhcyBFbGVtZW50KS50YWdOYW1lLnRvVXBwZXJDYXNlKClcclxuICAgICAgICAgICAgOiBub2RlLnBhcmVudEVsZW1lbnQhLnRhZ05hbWUudG9VcHBlckNhc2UoKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsnU0NSSVBUJywgJ1NUWUxFJ10uaW5jbHVkZXModGFnKVxyXG4gICAgICAgICAgICA/IE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVFxyXG4gICAgICAgICAgICA6IE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRXhwYW5kcyBhbnkgdHJhbnNsYXRpb24ga2V5cyBpbiB0aGUgZ2l2ZW4gYXR0cmlidXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBleHBhbmRBdHRyaWJ1dGUoYXR0cjogQXR0cikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2V0dGluZyBhbiBhdHRyaWJ1dGUsIGV2ZW4gaWYgbm90aGluZyBhY3R1YWxseSBjaGFuZ2VzLCB3aWxsIGNhdXNlIHZhcmlvdXNcclxuICAgICAgICAvLyBzaWRlLWVmZmVjdHMgKGUuZy4gcmVsb2FkaW5nIGlmcmFtZXMpLiBTbywgYXMgd2FzdGVmdWwgYXMgdGhpcyBsb29rcywgd2UgaGF2ZVxyXG4gICAgICAgIC8vIHRvIG1hdGNoIGZpcnN0IGJlZm9yZSBhY3R1YWxseSByZXBsYWNpbmcuXHJcblxyXG4gICAgICAgIGlmICggYXR0ci52YWx1ZS5tYXRjaCh0aGlzLlRBR19SRUdFWCkgKVxyXG4gICAgICAgICAgICBhdHRyLnZhbHVlID0gYXR0ci52YWx1ZS5yZXBsYWNlKHRoaXMuVEFHX1JFR0VYLCBJMThuLnJlcGxhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFeHBhbmRzIGFueSB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBnaXZlbiB0ZXh0IG5vZGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGV4cGFuZFRleHROb2RlKG5vZGU6IE5vZGUpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIG5vZGUudGV4dENvbnRlbnQgPSBub2RlLnRleHRDb250ZW50IS5yZXBsYWNlKHRoaXMuVEFHX1JFR0VYLCBJMThuLnJlcGxhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyBrZXkgd2l0aCB2YWx1ZSBpZiBpdCBleGlzdHMsIGVsc2Uga2VlcHMgdGhlIGtleSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVwbGFjZShtYXRjaDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBrZXkgICA9IG1hdGNoLnNsaWNlKDEsIC0xKTtcclxuICAgICAgICBsZXQgdmFsdWUgPSBMW2tleV0gYXMgTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAgICAgaWYgKCF2YWx1ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgdHJhbnNsYXRpb24ga2V5OicsIG1hdGNoKTtcclxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSgpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogRGVsZWdhdGUgdHlwZSBmb3IgY2hvb3NlciBzZWxlY3QgZXZlbnQgaGFuZGxlcnMgKi9cclxudHlwZSBTZWxlY3REZWxlZ2F0ZSA9IChlbnRyeTogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XHJcblxyXG4vKiogVUkgZWxlbWVudCB3aXRoIGEgZmlsdGVyYWJsZSBhbmQga2V5Ym9hcmQgbmF2aWdhYmxlIGxpc3Qgb2YgY2hvaWNlcyAqL1xyXG5jbGFzcyBDaG9vc2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSwgZm9yIGVhY2ggY2hvb3NlciBjcmVhdGVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURSAgICAgICAgPSBET00ucmVxdWlyZSgnI2Nob29zZXJUZW1wbGF0ZScpO1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgY29udGFpbmVyICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZG9tICAgICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGZpbHRlciBpbnB1dCBib3ggKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBpbnB1dEZpbHRlciAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBjb250YWluZXIgb2YgaXRlbSBlbGVtZW50cyAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlucHV0Q2hvaWNlcyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBPcHRpb25hbCBldmVudCBoYW5kbGVyIHRvIGZpcmUgd2hlbiBhbiBpdGVtIGlzIHNlbGVjdGVkIGJ5IHRoZSB1c2VyICovXHJcbiAgICBwdWJsaWMgICAgb25TZWxlY3Q/ICAgICA6IFNlbGVjdERlbGVnYXRlO1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gdmlzdWFsbHkgc2VsZWN0IHRoZSBjbGlja2VkIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyAgICBzZWxlY3RPbkNsaWNrIDogYm9vbGVhbiA9IHRydWU7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgaXRlbSwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgZG9tU2VsZWN0ZWQ/ICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgYXV0by1maWx0ZXIgdGltZW91dCwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgZmlsdGVyVGltZW91dCA6IG51bWJlciA9IDA7XHJcbiAgICAvKiogV2hldGhlciB0byBncm91cCBhZGRlZCBlbGVtZW50cyBieSBhbHBoYWJldGljYWwgc2VjdGlvbnMgKi9cclxuICAgIHByb3RlY3RlZCBncm91cEJ5QUJDICAgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFRpdGxlIGF0dHJpYnV0ZSB0byBhcHBseSB0byBldmVyeSBpdGVtIGFkZGVkICovXHJcbiAgICBwcm90ZWN0ZWQgaXRlbVRpdGxlICAgICA6IHN0cmluZyA9ICdDbGljayB0byBzZWxlY3QgdGhpcyBpdGVtJztcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhIGNob29zZXIsIGJ5IHJlcGxhY2luZyB0aGUgcGxhY2Vob2xkZXIgaW4gYSBnaXZlbiBwYXJlbnQgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIGlmICghQ2hvb3Nlci5URU1QTEFURSlcclxuICAgICAgICAgICAgQ2hvb3Nlci5pbml0KCk7XHJcblxyXG4gICAgICAgIGxldCB0YXJnZXQgICAgICA9IERPTS5yZXF1aXJlKCdjaG9vc2VyJywgcGFyZW50KTtcclxuICAgICAgICBsZXQgcGxhY2Vob2xkZXIgPSBET00uZ2V0QXR0ciggdGFyZ2V0LCAncGxhY2Vob2xkZXInLCBMLlBfR0VORVJJQ19QSCgpICk7XHJcbiAgICAgICAgbGV0IHRpdGxlICAgICAgID0gRE9NLmdldEF0dHIoIHRhcmdldCwgJ3RpdGxlJywgTC5QX0dFTkVSSUNfVCgpICk7XHJcbiAgICAgICAgdGhpcy5pdGVtVGl0bGUgID0gRE9NLmdldEF0dHIodGFyZ2V0LCAnaXRlbVRpdGxlJywgdGhpcy5pdGVtVGl0bGUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdXBCeUFCQyA9IHRhcmdldC5oYXNBdHRyaWJ1dGUoJ2dyb3VwQnlBQkMnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgICAgPSBDaG9vc2VyLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyICA9IERPTS5yZXF1aXJlKCcuY2hTZWFyY2hCb3gnLCAgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzID0gRE9NLnJlcXVpcmUoJy5jaENob2ljZXNCb3gnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnRpdGxlICAgICAgPSB0aXRsZTtcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XHJcbiAgICAgICAgLy8gVE9ETzogUmV1c2luZyB0aGUgcGxhY2Vob2xkZXIgYXMgdGl0bGUgaXMgcHJvYmFibHkgYmFkXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9sYWtlbi5uZXQvYmxvZy9tb3N0LWNvbW1vbi1hMTF5LW1pc3Rha2VzL1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIudGl0bGUgICAgICAgPSBwbGFjZWhvbGRlcjtcclxuXHJcbiAgICAgICAgdGFyZ2V0Lmluc2VydEFkamFjZW50RWxlbWVudCgnYmVmb3JlYmVnaW4nLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGFyZ2V0LnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQWRkcyB0aGUgZ2l2ZW4gdmFsdWUgdG8gdGhlIGNob29zZXIgYXMgYSBzZWxlY3RhYmxlIGl0ZW0uXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHZhbHVlIFRleHQgb2YgdGhlIHNlbGVjdGFibGUgaXRlbVxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBXaGV0aGVyIHRvIHNlbGVjdCB0aGlzIGl0ZW0gb25jZSBhZGRlZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYWRkKHZhbHVlOiBzdHJpbmcsIHNlbGVjdDogYm9vbGVhbiA9IGZhbHNlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaXRlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcblxyXG4gICAgICAgIGl0ZW0uaW5uZXJUZXh0ID0gdmFsdWU7XHJcblxyXG4gICAgICAgIHRoaXMuYWRkUmF3KGl0ZW0sIHNlbGVjdCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBZGRzIHRoZSBnaXZlbiBlbGVtZW50IHRvIHRoZSBjaG9vc2VyIGFzIGEgc2VsZWN0YWJsZSBpdGVtLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpdGVtIEVsZW1lbnQgdG8gYWRkIHRvIHRoZSBjaG9vc2VyXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFdoZXRoZXIgdG8gc2VsZWN0IHRoaXMgaXRlbSBvbmNlIGFkZGVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhZGRSYXcoaXRlbTogSFRNTEVsZW1lbnQsIHNlbGVjdDogYm9vbGVhbiA9IGZhbHNlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpdGVtLnRpdGxlICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICAgICAgaXRlbS50YWJJbmRleCA9IC0xO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5hcHBlbmRDaGlsZChpdGVtKTtcclxuXHJcbiAgICAgICAgaWYgKHNlbGVjdClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGl0ZW0pO1xyXG4gICAgICAgICAgICBpdGVtLmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbGVhcnMgYWxsIGl0ZW1zIGZyb20gdGhpcyBjaG9vc2VyIGFuZCB0aGUgY3VycmVudCBmaWx0ZXIgKi9cclxuICAgIHB1YmxpYyBjbGVhcigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmlubmVySFRNTCA9ICcnO1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIudmFsdWUgICAgICA9ICcnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZWxlY3QgYW5kIGZvY3VzIHRoZSBlbnRyeSB0aGF0IG1hdGNoZXMgdGhlIGdpdmVuIHZhbHVlICovXHJcbiAgICBwdWJsaWMgcHJlc2VsZWN0KHZhbHVlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGZvciAobGV0IGtleSBpbiB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBpdGVtID0gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW5ba2V5XSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gaXRlbS5pbm5lclRleHQpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgaXRlbS5mb2N1cygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xpY2sgZXZlbnRzLCBmb3IgY2hvb3NpbmcgaXRlbXMgKi9cclxuICAgIHB1YmxpYyBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgdGFyZ2V0ID0gZXYudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIHRoaXMuaXNDaG9pY2UodGFyZ2V0KSApXHJcbiAgICAgICAgaWYgKCAhdGFyZ2V0Lmhhc0F0dHJpYnV0ZSgnZGlzYWJsZWQnKSApXHJcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0KHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xvc2UgbWV0aG9kcywgZG9pbmcgYW55IHRpbWVyIGNsZWFudXAgKi9cclxuICAgIHB1YmxpYyBvbkNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGlucHV0IGV2ZW50cywgZm9yIGZpbHRlcmluZyBhbmQgbmF2aWdhdGlvbiAqL1xyXG4gICAgcHVibGljIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBrZXkgICAgID0gZXYua2V5O1xyXG4gICAgICAgIGxldCBmb2N1c2VkID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IGZvY3VzZWQucGFyZW50RWxlbWVudCE7XHJcblxyXG4gICAgICAgIGlmICghZm9jdXNlZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBPbmx5IGhhbmRsZSBldmVudHMgb24gdGhpcyBjaG9vc2VyJ3MgY29udHJvbHNcclxuICAgICAgICBpZiAoICF0aGlzLm93bnMoZm9jdXNlZCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSB0eXBpbmcgaW50byBmaWx0ZXIgYm94XHJcbiAgICAgICAgaWYgKGZvY3VzZWQgPT09IHRoaXMuaW5wdXRGaWx0ZXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmZpbHRlclRpbWVvdXQgPSB3aW5kb3cuc2V0VGltZW91dChfID0+IHRoaXMuZmlsdGVyKCksIDUwMCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFJlZGlyZWN0IHR5cGluZyB0byBpbnB1dCBmaWx0ZXIgYm94XHJcbiAgICAgICAgaWYgKGZvY3VzZWQgIT09IHRoaXMuaW5wdXRGaWx0ZXIpXHJcbiAgICAgICAgaWYgKGtleS5sZW5ndGggPT09IDEgfHwga2V5ID09PSAnQmFja3NwYWNlJylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaW5wdXRGaWx0ZXIuZm9jdXMoKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHByZXNzaW5nIEVOVEVSIGFmdGVyIGtleWJvYXJkIG5hdmlnYXRpbmcgdG8gYW4gaXRlbVxyXG4gICAgICAgIGlmICggdGhpcy5pc0Nob2ljZShmb2N1c2VkKSApXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0VudGVyJylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0KGZvY3VzZWQpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgbmF2aWdhdGlvbiB3aGVuIGNvbnRhaW5lciBvciBpdGVtIGlzIGZvY3VzZWRcclxuICAgICAgICBpZiAoa2V5ID09PSAnQXJyb3dMZWZ0JyB8fCBrZXkgPT09ICdBcnJvd1JpZ2h0JylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBkaXIgPSAoa2V5ID09PSAnQXJyb3dMZWZ0JykgPyAtMSA6IDE7XHJcbiAgICAgICAgICAgIGxldCBuYXYgPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudCwgaWYgdXNpbmcgZ3JvdXBzXHJcbiAgICAgICAgICAgIGlmICAgICAgKCB0aGlzLmdyb3VwQnlBQkMgJiYgcGFyZW50Lmhhc0F0dHJpYnV0ZSgnZ3JvdXAnKSApXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQsIGlmIGNob2ljZXMgYXJlIGZsYXRcclxuICAgICAgICAgICAgZWxzZSBpZiAoIXRoaXMuZ3JvdXBCeUFCQyAmJiBmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRDaG9pY2VzKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudFxyXG4gICAgICAgICAgICBlbHNlIGlmIChmb2N1c2VkID09PSB0aGlzLmRvbVNlbGVjdGVkKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKHRoaXMuZG9tU2VsZWN0ZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxldmFudCB0byBiZWdpbm5pbmcgb3IgZW5kIG9mIGNvbnRhaW5lclxyXG4gICAgICAgICAgICBlbHNlIGlmIChkaXIgPT09IC0xKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmxhc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBpZiAobmF2KSBuYXYuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2Vycycgc3VibWl0IGV2ZW50cywgZm9yIGluc3RhbnQgZmlsdGVyaW5nICovXHJcbiAgICBwdWJsaWMgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIHRoaXMuZmlsdGVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhpZGUgb3Igc2hvdyBjaG9pY2VzIGlmIHRoZXkgcGFydGlhbGx5IG1hdGNoIHRoZSB1c2VyIHF1ZXJ5ICovXHJcbiAgICBwcm90ZWN0ZWQgZmlsdGVyKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG5cclxuICAgICAgICBsZXQgZmlsdGVyID0gdGhpcy5pbnB1dEZpbHRlci52YWx1ZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIGxldCBpdGVtcyAgPSB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbjtcclxuICAgICAgICBsZXQgZW5naW5lID0gdGhpcy5ncm91cEJ5QUJDXHJcbiAgICAgICAgICAgID8gQ2hvb3Nlci5maWx0ZXJHcm91cFxyXG4gICAgICAgICAgICA6IENob29zZXIuZmlsdGVySXRlbTtcclxuXHJcbiAgICAgICAgLy8gUHJldmVudCBicm93c2VyIHJlZHJhdy9yZWZsb3cgZHVyaW5nIGZpbHRlcmluZ1xyXG4gICAgICAgIC8vIFRPRE86IE1pZ2h0IHRoZSB1c2Ugb2YgaGlkZGVuIGJyZWFrIEExMXkgaGVyZT8gKGUuZy4gZGVmb2N1cylcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5oaWRkZW4gPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBJdGVyYXRlIHRocm91Z2ggYWxsIHRoZSBpdGVtc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIGVuZ2luZShpdGVtc1tpXSBhcyBIVE1MRWxlbWVudCwgZmlsdGVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuaGlkZGVuID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEFwcGxpZXMgZmlsdGVyIHRvIGFuIGl0ZW0sIHNob3dpbmcgaXQgaWYgbWF0Y2hlZCwgaGlkaW5nIGlmIG5vdCAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBmaWx0ZXJJdGVtKGl0ZW06IEhUTUxFbGVtZW50LCBmaWx0ZXI6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICAvLyBTaG93IGlmIGNvbnRhaW5zIHNlYXJjaCB0ZXJtXHJcbiAgICAgICAgaWYgKGl0ZW0uaW5uZXJUZXh0LnRvTG93ZXJDYXNlKCkuaW5kZXhPZihmaWx0ZXIpID49IDApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpdGVtLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhpZGUgaWYgbm90XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaXRlbS5oaWRkZW4gPSB0cnVlO1xyXG4gICAgICAgICAgICByZXR1cm4gMTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEFwcGxpZXMgZmlsdGVyIHRvIGNoaWxkcmVuIG9mIGEgZ3JvdXAsIGhpZGluZyB0aGUgZ3JvdXAgaWYgYWxsIGNoaWxkcmVuIGhpZGUgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgZmlsdGVyR3JvdXAoZ3JvdXA6IEhUTUxFbGVtZW50LCBmaWx0ZXI6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJpZXMgPSBncm91cC5jaGlsZHJlbjtcclxuICAgICAgICBsZXQgY291bnQgICA9IGVudHJpZXMubGVuZ3RoIC0gMTsgLy8gLTEgZm9yIGhlYWRlciBlbGVtZW50XHJcbiAgICAgICAgbGV0IGhpZGRlbiAgPSAwO1xyXG5cclxuICAgICAgICAvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBzdGF0aW9uIG5hbWUgaW4gdGhpcyBsZXR0ZXIgc2VjdGlvbi4gSGVhZGVyIHNraXBwZWQuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBlbnRyaWVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICBoaWRkZW4gKz0gQ2hvb3Nlci5maWx0ZXJJdGVtKGVudHJpZXNbaV0gYXMgSFRNTEVsZW1lbnQsIGZpbHRlcik7XHJcblxyXG4gICAgICAgIC8vIElmIGFsbCBzdGF0aW9uIG5hbWVzIGluIHRoaXMgbGV0dGVyIHNlY3Rpb24gd2VyZSBoaWRkZW4sIGhpZGUgdGhlIHNlY3Rpb25cclxuICAgICAgICBpZiAoaGlkZGVuID49IGNvdW50KVxyXG4gICAgICAgICAgICBncm91cC5oaWRkZW4gPSB0cnVlO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgZ3JvdXAuaGlkZGVuID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IGNoYW5nZXMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLCBhbmQgdXBkYXRlcyB0aGUgc3RhdGUgYW5kIGVkaXRvciAqL1xyXG4gICAgcHJvdGVjdGVkIHNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBhbHJlYWR5U2VsZWN0ZWQgPSAoZW50cnkgPT09IHRoaXMuZG9tU2VsZWN0ZWQpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zZWxlY3RPbkNsaWNrKVxyXG4gICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChlbnRyeSk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm9uU2VsZWN0KVxyXG4gICAgICAgICAgICB0aGlzLm9uU2VsZWN0KGVudHJ5KTtcclxuXHJcbiAgICAgICAgaWYgKGFscmVhZHlTZWxlY3RlZClcclxuICAgICAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSBjaGFuZ2VzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudCAqL1xyXG4gICAgcHJvdGVjdGVkIHZpc3VhbFNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMudmlzdWFsVW5zZWxlY3QoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZCAgICAgICAgICA9IGVudHJ5O1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQudGFiSW5kZXggPSA1MDtcclxuICAgICAgICBlbnRyeS5zZXRBdHRyaWJ1dGUoJ3NlbGVjdGVkJywgJ3RydWUnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgdW5zZWxlY3RzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudCwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgdmlzdWFsVW5zZWxlY3QoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuZG9tU2VsZWN0ZWQpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC5yZW1vdmVBdHRyaWJ1dGUoJ3NlbGVjdGVkJyk7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC50YWJJbmRleCA9IC0xO1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQgICAgICAgICAgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXaGV0aGVyIHRoaXMgY2hvb3NlciBpcyBhbiBhbmNlc3RvciAob3duZXIpIG9mIHRoZSBnaXZlbiBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWxlbWVudCB0byBjaGVjayBpZiB0aGlzIGNob29zZXIgaXMgYW4gYW5jZXN0b3Igb2ZcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG93bnModGFyZ2V0OiBIVE1MRWxlbWVudCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmNvbnRhaW5zKHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgdGhlIGdpdmVuIGVsZW1lbnQgaXMgYSBjaG9vc2FibGUgb25lIG93bmVkIGJ5IHRoaXMgY2hvb3NlciAqL1xyXG4gICAgcHJvdGVjdGVkIGlzQ2hvaWNlKHRhcmdldD86IEhUTUxFbGVtZW50KSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGFyZ2V0ICE9PSB1bmRlZmluZWRcclxuICAgICAgICAgICAgJiYgdGFyZ2V0LnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2RkJ1xyXG4gICAgICAgICAgICAmJiB0aGlzLm93bnModGFyZ2V0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8gVE9ETzogU2VhcmNoIGJ5IHN0YXRpb24gY29kZVxyXG5cclxuLyoqXHJcbiAqIFNpbmdsZXRvbiBpbnN0YW5jZSBvZiB0aGUgc3RhdGlvbiBwaWNrZXIuIFNpbmNlIHRoZXJlIGFyZSBleHBlY3RlZCB0byBiZSAyNTAwK1xyXG4gKiBzdGF0aW9ucywgdGhpcyBlbGVtZW50IHdvdWxkIHRha2UgdXAgYSBsb3Qgb2YgbWVtb3J5IGFuZCBnZW5lcmF0ZSBhIGxvdCBvZiBET00uIFNvLCBpdFxyXG4gKiBoYXMgdG8gYmUgXCJzd2FwcGVkXCIgYmV0d2VlbiBwaWNrZXJzIGFuZCB2aWV3cyB0aGF0IHdhbnQgdG8gdXNlIGl0LlxyXG4gKi9cclxuY2xhc3MgU3RhdGlvbkNob29zZXIgZXh0ZW5kcyBDaG9vc2VyXHJcbntcclxuICAgIC8qKiBTaG9ydGN1dCByZWZlcmVuY2VzIHRvIGFsbCB0aGUgZ2VuZXJhdGVkIEEtWiBzdGF0aW9uIGxpc3QgZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tU3RhdGlvbnMgOiBEaWN0aW9uYXJ5PEhUTUxETGlzdEVsZW1lbnQ+ID0ge307XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIocGFyZW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMudGFiSW5kZXggPSAwO1xyXG5cclxuICAgICAgICAvLyBQb3B1bGF0ZXMgdGhlIGxpc3Qgb2Ygc3RhdGlvbnMgZnJvbSB0aGUgZGF0YWJhc2UuIFdlIGRvIHRoaXMgYnkgY3JlYXRpbmcgYSBkbFxyXG4gICAgICAgIC8vIGVsZW1lbnQgZm9yIGVhY2ggbGV0dGVyIG9mIHRoZSBhbHBoYWJldCwgY3JlYXRpbmcgYSBkdCBlbGVtZW50IGhlYWRlciwgYW5kIHRoZW5cclxuICAgICAgICAvLyBwb3B1bGF0aW5nIHRoZSBkbCB3aXRoIHN0YXRpb24gbmFtZSBkZCBjaGlsZHJlbi5cclxuICAgICAgICBPYmplY3Qua2V5cyhSQUcuZGF0YWJhc2Uuc3RhdGlvbnMpLmZvckVhY2goIHRoaXMuYWRkU3RhdGlvbi5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRhY2hlcyB0aGlzIGNvbnRyb2wgdG8gdGhlIGdpdmVuIHBhcmVudCBhbmQgcmVzZXRzIHNvbWUgc3RhdGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBpY2tlciBQaWNrZXIgdG8gYXR0YWNoIHRoaXMgY29udHJvbCB0b1xyXG4gICAgICogQHBhcmFtIG9uU2VsZWN0IERlbGVnYXRlIHRvIGZpcmUgd2hlbiBjaG9vc2luZyBhIHN0YXRpb25cclxuICAgICAqL1xyXG4gICAgcHVibGljIGF0dGFjaChwaWNrZXI6IFBpY2tlciwgb25TZWxlY3Q6IFNlbGVjdERlbGVnYXRlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IHBpY2tlci5kb21Gb3JtO1xyXG4gICAgICAgIGxldCBjdXJyZW50ID0gdGhpcy5kb20ucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgLy8gUmUtZW5hYmxlIGFsbCBkaXNhYmxlZCBlbGVtZW50c1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnF1ZXJ5U2VsZWN0b3JBbGwoYGRkW2Rpc2FibGVkXWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKCB0aGlzLmVuYWJsZS5iaW5kKHRoaXMpICk7XHJcblxyXG4gICAgICAgIGlmICghY3VycmVudCB8fCBjdXJyZW50ICE9PSBwYXJlbnQpXHJcbiAgICAgICAgICAgIHBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMudmlzdWFsVW5zZWxlY3QoKTtcclxuICAgICAgICB0aGlzLm9uU2VsZWN0ID0gb25TZWxlY3QuYmluZChwaWNrZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQcmUtc2VsZWN0cyBhIHN0YXRpb24gZW50cnkgYnkgaXRzIGNvZGUgKi9cclxuICAgIHB1YmxpYyBwcmVzZWxlY3RDb2RlKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gdGhpcy5nZXRCeUNvZGUoY29kZSk7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoZW50cnkpO1xyXG4gICAgICAgIGVudHJ5LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEVuYWJsZXMgdGhlIGdpdmVuIHN0YXRpb24gY29kZSBvciBzdGF0aW9uIGVsZW1lbnQgZm9yIHNlbGVjdGlvbiAqL1xyXG4gICAgcHVibGljIGVuYWJsZShjb2RlT3JOb2RlOiBzdHJpbmcgfCBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gKHR5cGVvZiBjb2RlT3JOb2RlID09PSAnc3RyaW5nJylcclxuICAgICAgICAgICAgPyB0aGlzLmdldEJ5Q29kZShjb2RlT3JOb2RlKVxyXG4gICAgICAgICAgICA6IGNvZGVPck5vZGU7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgZW50cnkucmVtb3ZlQXR0cmlidXRlKCdkaXNhYmxlZCcpO1xyXG4gICAgICAgIGVudHJ5LnRhYkluZGV4ID0gLTE7XHJcbiAgICAgICAgZW50cnkudGl0bGUgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRGlzYWJsZXMgdGhlIGdpdmVuIHN0YXRpb24gY29kZSBmcm9tIHNlbGVjdGlvbiAqL1xyXG4gICAgcHVibGljIGRpc2FibGUoY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSB0aGlzLmdldEJ5Q29kZShjb2RlKTtcclxuICAgICAgICBsZXQgbmV4dCAgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZW50cnksIDEpO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGVudHJ5LnNldEF0dHJpYnV0ZSgnZGlzYWJsZWQnLCAnJyk7XHJcbiAgICAgICAgZW50cnkucmVtb3ZlQXR0cmlidXRlKCd0YWJpbmRleCcpO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlID0gJyc7XHJcblxyXG4gICAgICAgIC8vIFNoaWZ0IGZvY3VzIHRvIG5leHQgYXZhaWxhYmxlIGVsZW1lbnQsIGZvciBrZXlib2FyZCBuYXZpZ2F0aW9uXHJcbiAgICAgICAgaWYgKG5leHQpXHJcbiAgICAgICAgICAgIG5leHQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyBhIHN0YXRpb24ncyBjaG9pY2UgZWxlbWVudCBieSBpdHMgY29kZSAqL1xyXG4gICAgcHJpdmF0ZSBnZXRCeUNvZGUoY29kZTogc3RyaW5nKSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaW5wdXRDaG9pY2VzXHJcbiAgICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKGBkZFtkYXRhLWNvZGU9JHtjb2RlfV1gKSBhcyBIVE1MRWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGdpdmVuIHN0YXRpb24gY29kZSAqL1xyXG4gICAgcHJpdmF0ZSBhZGRTdGF0aW9uKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSBSQUcuZGF0YWJhc2Uuc3RhdGlvbnNbY29kZV07XHJcbiAgICAgICAgbGV0IGxldHRlciAgPSBzdGF0aW9uWzBdO1xyXG4gICAgICAgIGxldCBncm91cCAgID0gdGhpcy5kb21TdGF0aW9uc1tsZXR0ZXJdO1xyXG5cclxuICAgICAgICBpZiAoIWdyb3VwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGhlYWRlciAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2R0Jyk7XHJcbiAgICAgICAgICAgIGhlYWRlci5pbm5lclRleHQgPSBsZXR0ZXIudG9VcHBlckNhc2UoKTtcclxuICAgICAgICAgICAgaGVhZGVyLnRhYkluZGV4ICA9IC0xO1xyXG5cclxuICAgICAgICAgICAgZ3JvdXAgPSB0aGlzLmRvbVN0YXRpb25zW2xldHRlcl0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkbCcpO1xyXG4gICAgICAgICAgICBncm91cC50YWJJbmRleCA9IDUwO1xyXG5cclxuICAgICAgICAgICAgZ3JvdXAuc2V0QXR0cmlidXRlKCdncm91cCcsICcnKTtcclxuICAgICAgICAgICAgZ3JvdXAuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuYXBwZW5kQ2hpbGQoZ3JvdXApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGVudHJ5ICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuICAgICAgICBlbnRyeS5kYXRhc2V0Wydjb2RlJ10gPSBjb2RlO1xyXG4gICAgICAgIGVudHJ5LmlubmVyVGV4dCAgICAgICA9IFJBRy5kYXRhYmFzZS5zdGF0aW9uc1tjb2RlXTtcclxuICAgICAgICBlbnRyeS50aXRsZSAgICAgICAgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgICAgICBlbnRyeS50YWJJbmRleCAgICAgICAgPSAtMTtcclxuXHJcbiAgICAgICAgZ3JvdXAuYXBwZW5kQ2hpbGQoZW50cnkpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogU3RhdGlvbiBsaXN0IGl0ZW0gdGhhdCBjYW4gYmUgZHJhZ2dlZCBhbmQgZHJvcHBlZCAqL1xyXG5jbGFzcyBTdGF0aW9uTGlzdEl0ZW1cclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIHRlbXBsYXRlIHRvIGNsb25lLCBmb3IgZWFjaCBpdGVtIGNyZWF0ZWQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUgICAgICAgID0gRE9NLnJlcXVpcmUoJyNzdGF0aW9uTGlzdEl0ZW1UZW1wbGF0ZScpO1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5pZCAgICAgPSAnJztcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBpdGVtJ3MgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHN0YXRpb24gbGlzdCBpdGVtLCBtZWFudCBmb3IgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gY3JlYXRlIHRoaXMgaXRlbSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGNvZGU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICBpZiAoIVN0YXRpb25MaXN0SXRlbS5URU1QTEFURSlcclxuICAgICAgICAgICAgU3RhdGlvbkxpc3RJdGVtLmluaXQoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgICAgID0gU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICB0aGlzLmRvbS5pbm5lclRleHQgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uZGF0YXNldFsnY29kZSddID0gY29kZTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEJhc2UgY2xhc3MgZm9yIHBpY2tlciB2aWV3cyAqL1xyXG5hYnN0cmFjdCBjbGFzcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgZm9ybSBET00gZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbUZvcm0gICA6IEhUTUxGb3JtRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBoZWFkZXIgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbUhlYWRlciA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIEdldHMgdGhlIG5hbWUgb2YgdGhlIFhNTCB0YWcgdGhpcyBwaWNrZXIgaGFuZGxlcyAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IHhtbFRhZyAgICA6IHN0cmluZztcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2UgZWxlbWVudCBiZWluZyBlZGl0ZWQgYnkgdGhpcyBwaWNrZXIgKi9cclxuICAgIHByb3RlY3RlZCBkb21FZGl0aW5nPyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHBpY2tlciB0byBoYW5kbGUgdGhlIGdpdmVuIHBocmFzZSBlbGVtZW50IHR5cGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHhtbFRhZyBOYW1lIG9mIHRoZSBYTUwgdGFnIHRoaXMgcGlja2VyIHdpbGwgaGFuZGxlLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3IoeG1sVGFnOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgPSBET00ucmVxdWlyZShgIyR7eG1sVGFnfVBpY2tlcmApO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybSAgID0gRE9NLnJlcXVpcmUoJ2Zvcm0nLCAgIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlciA9IERPTS5yZXF1aXJlKCdoZWFkZXInLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy54bWxUYWcgICAgPSB4bWxUYWc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmNoYW5nZSAgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uaW5wdXQgICA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25jbGljayAgID0gdGhpcy5vbkNsaWNrLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9ua2V5ZG93biA9IHRoaXMub25JbnB1dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbnN1Ym1pdCAgPSB0aGlzLm9uU3VibWl0LmJpbmQodGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxsZWQgd2hlbiBmb3JtIGZpZWxkcyBjaGFuZ2UuIFRoZSBpbXBsZW1lbnRpbmcgcGlja2VyIHNob3VsZCB1cGRhdGUgYWxsIGxpbmtlZFxyXG4gICAgICogZWxlbWVudHMgKGUuZy4gb2Ygc2FtZSB0eXBlKSB3aXRoIHRoZSBuZXcgZGF0YSBoZXJlLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25DaGFuZ2UoZXY6IEV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIGEgbW91c2UgY2xpY2sgaGFwcGVucyBhbnl3aGVyZSBpbiBvciBvbiB0aGUgcGlja2VyJ3MgZm9ybSAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKiogQ2FsbGVkIHdoZW4gYSBrZXkgaXMgcHJlc3NlZCB3aGlsc3QgdGhlIHBpY2tlcidzIGZvcm0gaXMgZm9jdXNlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENhbGxlZCB3aGVuIEVOVEVSIGlzIHByZXNzZWQgd2hpbHN0IGEgZm9ybSBjb250cm9sIG9mIHRoZSBwaWNrZXIgaXMgZm9jdXNlZC5cclxuICAgICAqIEJ5IGRlZmF1bHQsIHRoaXMgd2lsbCB0cmlnZ2VyIHRoZSBvbkNoYW5nZSBoYW5kbGVyIGFuZCBjbG9zZSB0aGUgZGlhbG9nLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIHRoaXMub25DaGFuZ2UoZXYpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9wZW4gdGhpcyBwaWNrZXIgZm9yIGEgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQuIFRoZSBpbXBsZW1lbnRpbmcgcGlja2VyIHNob3VsZCBmaWxsXHJcbiAgICAgKiBpdHMgZm9ybSBlbGVtZW50cyB3aXRoIGRhdGEgZnJvbSB0aGUgY3VycmVudCBzdGF0ZSBhbmQgdGFyZ2V0ZWQgZWxlbWVudCBoZXJlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IHRhcmdldCBQaHJhc2UgZWxlbWVudCB0aGF0IHRoaXMgcGlja2VyIGlzIGJlaW5nIG9wZW5lZCBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nID0gdGFyZ2V0O1xyXG4gICAgICAgIHRoaXMubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlcyB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gRml4IGtleWJvYXJkIHN0YXlpbmcgb3BlbiBpbiBpT1Mgb24gY2xvc2VcclxuICAgICAgICBET00uYmx1ckFjdGl2ZSh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvc2l0aW9ucyB0aGlzIHBpY2tlciByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0IHBocmFzZSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgbGF5b3V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRvbUVkaXRpbmcpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IHRhcmdldFJlY3QgPSB0aGlzLmRvbUVkaXRpbmcuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgbGV0IGZ1bGxXaWR0aCAgPSB0aGlzLmRvbS5jbGFzc0xpc3QuY29udGFpbnMoJ2Z1bGxXaWR0aCcpO1xyXG4gICAgICAgIGxldCBpc01vZGFsICAgID0gdGhpcy5kb20uY2xhc3NMaXN0LmNvbnRhaW5zKCdtb2RhbCcpO1xyXG4gICAgICAgIGxldCBkb2NXICAgICAgID0gZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aDtcclxuICAgICAgICBsZXQgZG9jSCAgICAgICA9IGRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0O1xyXG4gICAgICAgIGxldCBkaWFsb2dYICAgID0gKHRhcmdldFJlY3QubGVmdCAgIHwgMCkgLSA4O1xyXG4gICAgICAgIGxldCBkaWFsb2dZICAgID0gIHRhcmdldFJlY3QuYm90dG9tIHwgMDtcclxuICAgICAgICBsZXQgZGlhbG9nVyAgICA9ICh0YXJnZXRSZWN0LndpZHRoICB8IDApICsgMTY7XHJcblxyXG4gICAgICAgIC8vIEFkanVzdCBpZiBob3Jpem9udGFsbHkgb2ZmIHNjcmVlblxyXG4gICAgICAgIGlmICghZnVsbFdpZHRoICYmICFpc01vZGFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gRm9yY2UgZnVsbCB3aWR0aCBvbiBtb2JpbGVcclxuICAgICAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUud2lkdGggPSBgMTAwJWA7XHJcblxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS53aWR0aCAgICA9IGBpbml0aWFsYDtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLm1pbldpZHRoID0gYCR7ZGlhbG9nV31weGA7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGRpYWxvZ1ggKyB0aGlzLmRvbS5vZmZzZXRXaWR0aCA+IGRvY1cpXHJcbiAgICAgICAgICAgICAgICAgICAgZGlhbG9nWCA9ICh0YXJnZXRSZWN0LnJpZ2h0IHwgMCkgLSB0aGlzLmRvbS5vZmZzZXRXaWR0aCArIDg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaWNrZXJzIHRoYXQgaW5zdGVhZCB0YWtlIHVwIHRoZSB3aG9sZSBkaXNwbGF5LiBDU1MgaXNuJ3QgdXNlZCBoZXJlLFxyXG4gICAgICAgIC8vIGJlY2F1c2UgcGVyY2VudGFnZS1iYXNlZCBsZWZ0L3RvcCBjYXVzZXMgc3VicGl4ZWwgaXNzdWVzIG9uIENocm9tZS5cclxuICAgICAgICBpZiAoaXNNb2RhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGRpYWxvZ1ggPSBET00uaXNNb2JpbGUgPyAwIDpcclxuICAgICAgICAgICAgICAgICggKGRvY1cgICogMC4xKSAvIDIgKSB8IDA7XHJcblxyXG4gICAgICAgICAgICBkaWFsb2dZID0gRE9NLmlzTW9iaWxlID8gMCA6XHJcbiAgICAgICAgICAgICAgICAoIChkb2NIICogMC4xKSAvIDIgKSB8IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDbGFtcCB0byB0b3AgZWRnZSBvZiBkb2N1bWVudFxyXG4gICAgICAgIGVsc2UgaWYgKGRpYWxvZ1kgPCAwKVxyXG4gICAgICAgICAgICBkaWFsb2dZID0gMDtcclxuXHJcbiAgICAgICAgLy8gQWRqdXN0IGlmIHZlcnRpY2FsbHkgb2ZmIHNjcmVlblxyXG4gICAgICAgIGVsc2UgaWYgKGRpYWxvZ1kgKyB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgPiBkb2NIKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZGlhbG9nWSA9ICh0YXJnZXRSZWN0LnRvcCB8IDApIC0gdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ICsgMTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5hZGQoJ2JlbG93Jyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdhYm92ZScpO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgc3RpbGwgb2ZmLXNjcmVlbiwgY2xhbXAgdG8gYm90dG9tXHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dZICsgdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ID4gZG9jSClcclxuICAgICAgICAgICAgICAgIGRpYWxvZ1kgPSBkb2NIIC0gdGhpcy5kb20ub2Zmc2V0SGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgLy8gQ2xhbXAgdG8gdG9wIGVkZ2Ugb2YgZG9jdW1lbnQuIExpa2VseSBoYXBwZW5zIGlmIHRhcmdldCBlbGVtZW50IGlzIGxhcmdlLlxyXG4gICAgICAgICAgICBpZiAoZGlhbG9nWSA8IDApXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dZID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5hZGQoJ2Fib3ZlJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdiZWxvdycpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5kb20uc3R5bGUubGVmdCA9IChmdWxsV2lkdGggPyAwIDogZGlhbG9nWCkgKyAncHgnO1xyXG4gICAgICAgIHRoaXMuZG9tLnN0eWxlLnRvcCAgPSBkaWFsb2dZICsgJ3B4JztcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmV0dXJucyB0cnVlIGlmIGFuIGVsZW1lbnQgaW4gdGhpcyBwaWNrZXIgY3VycmVudGx5IGhhcyBmb2N1cyAqL1xyXG4gICAgcHVibGljIGhhc0ZvY3VzKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmNvbnRhaW5zKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBjb2FjaCBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIENvYWNoUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBsZXR0ZXIgZHJvcC1kb3duIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMZXR0ZXIgOiBIVE1MU2VsZWN0RWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IGNvYWNoIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdjb2FjaCcpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyID0gRE9NLnJlcXVpcmUoJ3NlbGVjdCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCAyNjsgaSsrKVxyXG4gICAgICAgICAgICBET00uYWRkT3B0aW9uKHRoaXMuaW5wdXRMZXR0ZXIsIEwuTEVUVEVSU1tpXSwgTC5MRVRURVJTW2ldKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIHRhcmdldCBjb250ZXh0J3MgY29hY2ggbGV0dGVyICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfQ09BQ0godGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9IFJBRy5zdGF0ZS5nZXRDb2FjaCh0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgY29hY2ggZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9DT0FDSF9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldENvYWNoKHRoaXMuY3VycmVudEN0eCwgdGhpcy5pbnB1dExldHRlci52YWx1ZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPWNvYWNoXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgZXhjdXNlIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgRXhjdXNlUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignZXhjdXNlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0VYQ1VTRSgpO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2UuZXhjdXNlcy5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBleGN1c2UgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgZXhjdXNlXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdChSQUcuc3RhdGUuZXhjdXNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIGV4Y3VzZSBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5leGN1c2UgPSBlbnRyeS5pbm5lclRleHQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoJ2V4Y3VzZScsIFJBRy5zdGF0ZS5leGN1c2UpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBpbnRlZ2VyIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgSW50ZWdlclBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbnVtZXJpY2FsIGlucHV0IHNwaW5uZXIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXREaWdpdCA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3Mgb3B0aW9uYWwgc3VmZml4IGxhYmVsICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUxhYmVsICAgOiBIVE1MTGFiZWxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4PyA6IHN0cmluZztcclxuICAgIC8qKiBIb2xkcyB0aGUgb3B0aW9uYWwgc2luZ3VsYXIgc3VmZml4IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzaW5ndWxhcj8gICA6IHN0cmluZztcclxuICAgIC8qKiBIb2xkcyB0aGUgb3B0aW9uYWwgcGx1cmFsIHN1ZmZpeCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgcGx1cmFsPyAgICAgOiBzdHJpbmc7XHJcbiAgICAvKiogV2hldGhlciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCB3YW50cyB3b3JkIGRpZ2l0cyAqL1xyXG4gICAgcHJpdmF0ZSB3b3Jkcz8gICAgICA6IGJvb2xlYW47XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignaW50ZWdlcicpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21MYWJlbCAgID0gRE9NLnJlcXVpcmUoJ2xhYmVsJywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICAvLyBpT1MgbmVlZHMgZGlmZmVyZW50IHR5cGUgYW5kIHBhdHRlcm4gdG8gc2hvdyBhIG51bWVyaWNhbCBrZXlib2FyZFxyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQudHlwZSAgICA9ICd0ZWwnO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQucGF0dGVybiA9ICdbMC05XSsnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIHRhcmdldCBjb250ZXh0J3MgaW50ZWdlciBkYXRhICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5zaW5ndWxhciAgID0gdGFyZ2V0LmRhdGFzZXRbJ3Npbmd1bGFyJ107XHJcbiAgICAgICAgdGhpcy5wbHVyYWwgICAgID0gdGFyZ2V0LmRhdGFzZXRbJ3BsdXJhbCddO1xyXG4gICAgICAgIHRoaXMud29yZHMgICAgICA9IFBhcnNlLmJvb2xlYW4odGFyZ2V0LmRhdGFzZXRbJ3dvcmRzJ10gfHwgJ2ZhbHNlJyk7XHJcblxyXG4gICAgICAgIGxldCB2YWx1ZSA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKHRoaXMuc2luZ3VsYXIgJiYgdmFsdWUgPT09IDEpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5zaW5ndWxhcjtcclxuICAgICAgICBlbHNlIGlmICh0aGlzLnBsdXJhbCAmJiB2YWx1ZSAhPT0gMSlcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnBsdXJhbDtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gJyc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0lOVEVHRVIodGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQudmFsdWUgICAgPSB2YWx1ZS50b1N0cmluZygpO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBpbnRlZ2VyIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfSU5UX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICAvLyBDYW4ndCB1c2UgdmFsdWVBc051bWJlciBkdWUgdG8gaU9TIGlucHV0IHR5cGUgd29ya2Fyb3VuZHNcclxuICAgICAgICBsZXQgaW50ICAgID0gcGFyc2VJbnQodGhpcy5pbnB1dERpZ2l0LnZhbHVlKTtcclxuICAgICAgICBsZXQgaW50U3RyID0gKHRoaXMud29yZHMpXHJcbiAgICAgICAgICAgID8gTC5ESUdJVFNbaW50XSB8fCBpbnQudG9TdHJpbmcoKVxyXG4gICAgICAgICAgICA6IGludC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgaW52YWxpZCB2YWx1ZXNcclxuICAgICAgICBpZiAoIGlzTmFOKGludCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gJyc7XHJcblxyXG4gICAgICAgIGlmIChpbnQgPT09IDEgJiYgdGhpcy5zaW5ndWxhcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7dGhpcy5zaW5ndWxhcn1gO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMuc2luZ3VsYXI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKGludCAhPT0gMSAmJiB0aGlzLnBsdXJhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7dGhpcy5wbHVyYWx9YDtcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnBsdXJhbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRJbnRlZ2VyKHRoaXMuY3VycmVudEN0eCwgaW50KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9aW50ZWdlcl1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgbmFtZWQgdHJhaW4gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBOYW1lZFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ25hbWVkJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX05BTUVEKCk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5uYW1lZC5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBuYW1lXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdChSQUcuc3RhdGUubmFtZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgbmFtZWQgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUubmFtZWQgPSBlbnRyeS5pbm5lclRleHQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoJ25hbWVkJywgUkFHLnN0YXRlLm5hbWVkKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGhyYXNlc2V0IHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgUGhyYXNlc2V0UGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSByZWZlcmVuY2UgdGFnIGZvciB0aGUgY3VycmVudCBwaHJhc2VzZXQgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFJlZj8gOiBzdHJpbmc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigncGhyYXNlc2V0Jyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBwaHJhc2VzZXQncyBsaXN0IG9mIHBocmFzZXMgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgbGV0IHJlZiA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdyZWYnKTtcclxuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoIERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdpZHgnKSApO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9QU0VUX1VOS05PV04ocmVmKSApO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRSZWYgICAgICAgICAgPSByZWY7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfUEhSQVNFU0VUKHJlZik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5jbGVhcigpO1xyXG5cclxuICAgICAgICAvLyBGb3IgZWFjaCBwaHJhc2UsIHdlIG5lZWQgdG8gcnVuIGl0IHRocm91Z2ggdGhlIHBocmFzZXIgdXNpbmcgdGhlIGN1cnJlbnQgc3RhdGVcclxuICAgICAgICAvLyB0byBnZW5lcmF0ZSBcInByZXZpZXdzXCIgb2YgaG93IHRoZSBwaHJhc2Ugd2lsbCBsb29rLlxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGhyYXNlc2V0LmNoaWxkcmVuLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHBocmFzZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcblxyXG4gICAgICAgICAgICBET00uY2xvbmVJbnRvKHBocmFzZXNldC5jaGlsZHJlbltpXSBhcyBIVE1MRWxlbWVudCwgcGhyYXNlKTtcclxuICAgICAgICAgICAgUkFHLnBocmFzZXIucHJvY2VzcyhwaHJhc2UpO1xyXG5cclxuICAgICAgICAgICAgcGhyYXNlLmlubmVyVGV4dCAgID0gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dChwaHJhc2UpO1xyXG4gICAgICAgICAgICBwaHJhc2UuZGF0YXNldC5pZHggPSBpLnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmRvbUNob29zZXIuYWRkUmF3KHBocmFzZSwgaSA9PT0gaWR4KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBwaHJhc2VzZXQgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFJlZilcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9QU0VUX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoZW50cnkuZGF0YXNldFsnaWR4J10hKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFBocmFzZXNldElkeCh0aGlzLmN1cnJlbnRSZWYsIGlkeCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IucmVmcmVzaFBocmFzZXNldCh0aGlzLmN1cnJlbnRSZWYpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBwbGF0Zm9ybSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFBsYXRmb3JtUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBudW1lcmljYWwgaW5wdXQgc3Bpbm5lciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dERpZ2l0ICA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbGV0dGVyIGRyb3AtZG93biBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGV0dGVyIDogSFRNTFNlbGVjdEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigncGxhdGZvcm0nKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0ICAgICAgICAgID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIgICAgICAgICA9IERPTS5yZXF1aXJlKCdzZWxlY3QnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfUExBVEZPUk0oKTtcclxuXHJcbiAgICAgICAgLy8gaU9TIG5lZWRzIGRpZmZlcmVudCB0eXBlIGFuZCBwYXR0ZXJuIHRvIHNob3cgYSBudW1lcmljYWwga2V5Ym9hcmRcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnR5cGUgICAgPSAndGVsJztcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnBhdHRlcm4gPSAnWzAtOV0rJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgcGxhdGZvcm0gZGF0YSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICBsZXQgdmFsdWUgPSBSQUcuc3RhdGUucGxhdGZvcm07XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC52YWx1ZSAgPSB2YWx1ZVswXTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gdmFsdWVbMV07XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHBsYXRmb3JtIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gSWdub3JlIGludmFsaWQgdmFsdWVzXHJcbiAgICAgICAgaWYgKCBpc05hTiggcGFyc2VJbnQodGhpcy5pbnB1dERpZ2l0LnZhbHVlKSApIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUucGxhdGZvcm0gPSBbdGhpcy5pbnB1dERpZ2l0LnZhbHVlLCB0aGlzLmlucHV0TGV0dGVyLnZhbHVlXTtcclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoICdwbGF0Zm9ybScsIFJBRy5zdGF0ZS5wbGF0Zm9ybS5qb2luKCcnKSApO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2VydmljZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFNlcnZpY2VQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHNlcnZpY2UgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3NlcnZpY2UnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5zZXJ2aWNlcy5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBzZXJ2aWNlICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU0VSVklDRSh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBzZXJ2aWNlXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdCggUkFHLnN0YXRlLmdldFNlcnZpY2UodGhpcy5jdXJyZW50Q3R4KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgc2VydmljZSBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1NFUlZJQ0VfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTZXJ2aWNlKHRoaXMuY3VycmVudEN0eCwgZW50cnkuaW5uZXJUZXh0KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9c2VydmljZV1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBlbnRyeS5pbm5lclRleHQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0aW9uIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU3RhdGlvblBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3Mgc2hhcmVkIHN0YXRpb24gY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGNob29zZXIgOiBTdGF0aW9uQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHN0YXRpb24gZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9uT3BlbiBkZWxlZ2F0ZSBmb3IgU3RhdGlvblBpY2tlciBvciBmb3IgU3RhdGlvbkxpc3RQaWNrZXIgKi9cclxuICAgIHByb3RlY3RlZCBvbk9wZW4gICAgIDogKHRhcmdldDogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHRhZzogc3RyaW5nID0gJ3N0YXRpb24nKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKHRhZyk7XHJcblxyXG4gICAgICAgIGlmICghU3RhdGlvblBpY2tlci5jaG9vc2VyKVxyXG4gICAgICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIgPSBuZXcgU3RhdGlvbkNob29zZXIodGhpcy5kb21Gb3JtKTtcclxuXHJcbiAgICAgICAgdGhpcy5vbk9wZW4gPSB0aGlzLm9uU3RhdGlvblBpY2tlck9wZW4uYmluZCh0aGlzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlyZXMgdGhlIG9uT3BlbiBkZWxlZ2F0ZSByZWdpc3RlcmVkIGZvciB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG4gICAgICAgIHRoaXMub25PcGVuKHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEF0dGFjaGVzIHRoZSBzdGF0aW9uIGNob29zZXIgYW5kIGZvY3VzZXMgaXQgb250byB0aGUgY3VycmVudCBlbGVtZW50J3Mgc3RhdGlvbiAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3RhdGlvblBpY2tlck9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNob29zZXIgICAgID0gU3RhdGlvblBpY2tlci5jaG9vc2VyO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGNob29zZXIuYXR0YWNoKHRoaXMsIHRoaXMub25TZWxlY3RTdGF0aW9uKTtcclxuICAgICAgICBjaG9vc2VyLnByZXNlbGVjdENvZGUoIFJBRy5zdGF0ZS5nZXRTdGF0aW9uKHRoaXMuY3VycmVudEN0eCkgKTtcclxuICAgICAgICBjaG9vc2VyLnNlbGVjdE9uQ2xpY2sgPSB0cnVlO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TVEFUSU9OKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIHN0YXRpb24gY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uQ2xpY2soZXYpOyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uSW5wdXQoZXYpOyB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBzdGF0aW9uIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0U3RhdGlvbihlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBxdWVyeSA9IGBbZGF0YS10eXBlPXN0YXRpb25dW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYDtcclxuICAgICAgICBsZXQgY29kZSAgPSBlbnRyeS5kYXRhc2V0Wydjb2RlJ10hO1xyXG4gICAgICAgIGxldCBuYW1lICA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUpO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U3RhdGlvbih0aGlzLmN1cnJlbnRDdHgsIGNvZGUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShxdWVyeSlcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gbmFtZSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJzdGF0aW9uUGlja2VyLnRzXCIvPlxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiLi4vLi4vdmVuZG9yL2RyYWdnYWJsZS5kLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0aW9uIGxpc3QgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTdGF0aW9uTGlzdFBpY2tlciBleHRlbmRzIFN0YXRpb25QaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNvbnRhaW5lciBmb3IgdGhlIGxpc3QgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21MaXN0ICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1vYmlsZS1vbmx5IGFkZCBzdGF0aW9uIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5BZGQgICAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1vYmlsZS1vbmx5IGNsb3NlIHBpY2tlciBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQ2xvc2UgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBkcm9wIHpvbmUgZm9yIGRlbGV0aW5nIHN0YXRpb24gZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tRGVsICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBhY3R1YWwgc29ydGFibGUgbGlzdCBvZiBzdGF0aW9ucyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExpc3QgICAgOiBIVE1MRExpc3RFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byBwbGFjZWhvbGRlciBzaG93biBpZiB0aGUgbGlzdCBpcyBlbXB0eSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21FbXB0eUxpc3QgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKFwic3RhdGlvbmxpc3RcIik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tTGlzdCAgICAgID0gRE9NLnJlcXVpcmUoJy5zdGF0aW9uTGlzdCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmJ0bkFkZCAgICAgICA9IERPTS5yZXF1aXJlKCcuYWRkU3RhdGlvbicsICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuYnRuQ2xvc2UgICAgID0gRE9NLnJlcXVpcmUoJy5jbG9zZVBpY2tlcicsIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5kb21EZWwgICAgICAgPSBET00ucmVxdWlyZSgnLmRlbFN0YXRpb24nLCAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmlucHV0TGlzdCAgICA9IERPTS5yZXF1aXJlKCdkbCcsICAgICAgICAgICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0ID0gRE9NLnJlcXVpcmUoJ3AnLCAgICAgICAgICAgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5vbk9wZW4gICAgICAgPSB0aGlzLm9uU3RhdGlvbkxpc3RQaWNrZXJPcGVuLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIG5ldyBEcmFnZ2FibGUuU29ydGFibGUoW3RoaXMuaW5wdXRMaXN0LCB0aGlzLmRvbURlbF0sIHsgZHJhZ2dhYmxlOiAnZGQnIH0pXHJcbiAgICAgICAgICAgIC8vIEhhdmUgdG8gdXNlIHRpbWVvdXQsIHRvIGxldCBEcmFnZ2FibGUgZmluaXNoIHNvcnRpbmcgdGhlIGxpc3RcclxuICAgICAgICAgICAgLm9uKCAnZHJhZzpzdG9wJywgZXYgPT4gc2V0VGltZW91dCgoKSA9PiB0aGlzLm9uRHJhZ1N0b3AoZXYpLCAxKSApXHJcbiAgICAgICAgICAgIC5vbiggJ21pcnJvcjpjcmVhdGUnLCB0aGlzLm9uRHJhZ01pcnJvckNyZWF0ZS5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQb3B1bGF0ZXMgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyLCB3aXRoIHRoZSBzZWxlY3RlZCBsaXN0LiBCZWNhdXNlIHRoaXMgcGlja2VyXHJcbiAgICAgKiBleHRlbmRzIGZyb20gU3RhdGlvbkxpc3QsIHRoaXMgaGFuZGxlciBvdmVycmlkZXMgdGhlICdvbk9wZW4nIGRlbGVnYXRlIHByb3BlcnR5XHJcbiAgICAgKiBvZiBTdGF0aW9uTGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IFN0YXRpb24gbGlzdCBlZGl0b3IgZWxlbWVudCB0byBvcGVuIGZvclxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdGF0aW9uTGlzdFBpY2tlck9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2luY2Ugd2Ugc2hhcmUgdGhlIHN0YXRpb24gcGlja2VyIHdpdGggU3RhdGlvbkxpc3QsIGdyYWIgaXRcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuYXR0YWNoKHRoaXMsIHRoaXMub25BZGRTdGF0aW9uKTtcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuc2VsZWN0T25DbGljayA9IGZhbHNlO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBlbnRyaWVzICAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdCh0aGlzLmN1cnJlbnRDdHgpLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NUQVRJT05MSVNUKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIC8vIFJlbW92ZSBhbGwgb2xkIGxpc3QgZWxlbWVudHNcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgICAgICAgLy8gRmluYWxseSwgcG9wdWxhdGUgbGlzdCBmcm9tIHRoZSBjbGlja2VkIHN0YXRpb24gbGlzdCBlbGVtZW50XHJcbiAgICAgICAgZW50cmllcy5mb3JFYWNoKCB2ID0+IHRoaXMuYWRkKHYpICk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkIHsgc3VwZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xpY2sgZXZlbnRzLCBmb3IgY2hvb3NpbmcgaXRlbXMgKi9cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vbkNsaWNrKGV2KTtcclxuXHJcbiAgICAgICAgaWYgKGV2LnRhcmdldCA9PT0gdGhpcy5idG5DbG9zZSlcclxuICAgICAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIC8vIEZvciBtb2JpbGUgdXNlcnMsIHN3aXRjaCB0byBzdGF0aW9uIGNob29zZXIgc2NyZWVuIGlmIFwiQWRkLi4uXCIgd2FzIGNsaWNrZWRcclxuICAgICAgICBpZiAoZXYudGFyZ2V0ID09PSB0aGlzLmJ0bkFkZClcclxuICAgICAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LmFkZCgnYWRkaW5nU3RhdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGtleWJvYXJkIG5hdmlnYXRpb24gZm9yIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciAqL1xyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9uSW5wdXQoZXYpO1xyXG5cclxuICAgICAgICBsZXQga2V5ICAgICA9IGV2LmtleTtcclxuICAgICAgICBsZXQgZm9jdXNlZCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgaGFuZGxlIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciBjb250cm9sXHJcbiAgICAgICAgaWYgKCAhZm9jdXNlZCB8fCAhdGhpcy5pbnB1dExpc3QuY29udGFpbnMoZm9jdXNlZCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBrZXlib2FyZCBuYXZpZ2F0aW9uXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5ID09PSAnQXJyb3dSaWdodCcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZGlyID0gKGtleSA9PT0gJ0Fycm93TGVmdCcpID8gLTEgOiAxO1xyXG4gICAgICAgICAgICBsZXQgbmF2ID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGZvY3VzZWQgZWxlbWVudFxyXG4gICAgICAgICAgICBpZiAoZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0TGlzdClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsZXZhbnQgdG8gYmVnaW5uaW5nIG9yIGVuZCBvZiBjb250YWluZXJcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID09PSAtMSlcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5sYXN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKG5hdikgbmF2LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgZW50cnkgZGVsZXRpb25cclxuICAgICAgICBpZiAoa2V5ID09PSAnRGVsZXRlJyB8fCBrZXkgPT09ICdCYWNrc3BhY2UnKVxyXG4gICAgICAgIGlmIChmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRMaXN0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gRm9jdXMgb24gbmV4dCBlbGVtZW50IG9yIHBhcmVudCBvbiBkZWxldGVcclxuICAgICAgICAgICAgbGV0IG5leHQgPSBmb2N1c2VkLnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBmb2N1c2VkLm5leHRFbGVtZW50U2libGluZyAgICAgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCB0aGlzLmlucHV0TGlzdDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGZvY3VzZWQpO1xyXG4gICAgICAgICAgICBuZXh0LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVyIGZvciB3aGVuIGEgc3RhdGlvbiBpcyBjaG9zZW4gKi9cclxuICAgIHByaXZhdGUgb25BZGRTdGF0aW9uKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5ld0VudHJ5ID0gdGhpcy5hZGQoZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcblxyXG4gICAgICAgIC8vIFN3aXRjaCBiYWNrIHRvIGJ1aWxkZXIgc2NyZWVuLCBpZiBvbiBtb2JpbGVcclxuICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QucmVtb3ZlKCdhZGRpbmdTdGF0aW9uJyk7XHJcbiAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuXHJcbiAgICAgICAgLy8gRm9jdXMgb25seSBpZiBvbiBtb2JpbGUsIHNpbmNlIHRoZSBzdGF0aW9uIGxpc3QgaXMgb24gYSBkZWRpY2F0ZWQgc2NyZWVuXHJcbiAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICAgICAgbmV3RW50cnkuZG9tLmZvY3VzKCk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBuZXdFbnRyeS5kb20uc2Nyb2xsSW50b1ZpZXcoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRml4ZXMgbWlycm9ycyBub3QgaGF2aW5nIGNvcnJlY3Qgd2lkdGggb2YgdGhlIHNvdXJjZSBlbGVtZW50LCBvbiBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgb25EcmFnTWlycm9yQ3JlYXRlKGV2OiBEcmFnZ2FibGUuRHJhZ0V2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIWV2LmRhdGEuc291cmNlIHx8ICFldi5kYXRhLm9yaWdpbmFsU291cmNlKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1NMX0RSQUdfTUlTU0lORygpICk7XHJcblxyXG4gICAgICAgIGV2LmRhdGEuc291cmNlLnN0eWxlLndpZHRoID0gZXYuZGF0YS5vcmlnaW5hbFNvdXJjZS5jbGllbnRXaWR0aCArICdweCc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgZHJhZ2dhYmxlIHN0YXRpb24gbmFtZSBiZWluZyBkcm9wcGVkICovXHJcbiAgICBwcml2YXRlIG9uRHJhZ1N0b3AoZXY6IERyYWdnYWJsZS5EcmFnRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoZXYuZGF0YS5vcmlnaW5hbFNvdXJjZS5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmRvbURlbClcclxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhbmQgYWRkcyBhIG5ldyBlbnRyeSBmb3IgdGhlIGJ1aWxkZXIgbGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGNyZWF0ZSBhbiBpdGVtIGZvclxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFkZChjb2RlOiBzdHJpbmcpIDogU3RhdGlvbkxpc3RJdGVtXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5ld0VudHJ5ID0gbmV3IFN0YXRpb25MaXN0SXRlbShjb2RlKTtcclxuXHJcbiAgICAgICAgLy8gQWRkIHRoZSBuZXcgZW50cnkgdG8gdGhlIHNvcnRhYmxlIGxpc3RcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5hcHBlbmRDaGlsZChuZXdFbnRyeS5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0LmhpZGRlbiA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIERpc2FibGUgdGhlIGFkZGVkIHN0YXRpb24gaW4gdGhlIGNob29zZXJcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuZGlzYWJsZShjb2RlKTtcclxuXHJcbiAgICAgICAgLy8gRGVsZXRlIGl0ZW0gb24gZG91YmxlIGNsaWNrXHJcbiAgICAgICAgbmV3RW50cnkuZG9tLm9uZGJsY2xpY2sgPSBfID0+IHRoaXMucmVtb3ZlKG5ld0VudHJ5LmRvbSk7XHJcblxyXG4gICAgICAgIHJldHVybiBuZXdFbnRyeTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlbW92ZXMgdGhlIGdpdmVuIHN0YXRpb24gZW50cnkgZWxlbWVudCBmcm9tIHRoZSBidWlsZGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbnRyeSBFbGVtZW50IG9mIHRoZSBzdGF0aW9uIGVudHJ5IHRvIHJlbW92ZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlbW92ZShlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICggIXRoaXMuZG9tTGlzdC5jb250YWlucyhlbnRyeSkgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcignQXR0ZW1wdGVkIHRvIHJlbW92ZSBlbnRyeSBub3Qgb24gc3RhdGlvbiBsaXN0IGJ1aWxkZXInKTtcclxuXHJcbiAgICAgICAgLy8gRW5hYmxlZCB0aGUgcmVtb3ZlZCBzdGF0aW9uIGluIHRoZSBjaG9vc2VyXHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmVuYWJsZShlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuXHJcbiAgICAgICAgZW50cnkucmVtb3ZlKCk7XHJcbiAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuaW5wdXRMaXN0LmNoaWxkcmVuLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QuaGlkZGVuID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHN0YXRpb24gbGlzdCBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjaGlsZHJlbiA9IHRoaXMuaW5wdXRMaXN0LmNoaWxkcmVuO1xyXG5cclxuICAgICAgICAvLyBEb24ndCB1cGRhdGUgaWYgbGlzdCBpcyBlbXB0eVxyXG4gICAgICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPT09IDApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGxpc3QgPSBbXTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBlbnRyeSA9IGNoaWxkcmVuW2ldIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgbGlzdC5wdXNoKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHRleHRMaXN0ID0gU3RyaW5ncy5mcm9tU3RhdGlvbkxpc3QobGlzdC5zbGljZSgpLCB0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIGxldCBxdWVyeSAgICA9IGBbZGF0YS10eXBlPXN0YXRpb25saXN0XVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWA7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTdGF0aW9uTGlzdCh0aGlzLmN1cnJlbnRDdHgsIGxpc3QpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShxdWVyeSlcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGV4dExpc3QpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSB0aW1lIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgVGltZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgdGltZSBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0VGltZTogSFRNTElucHV0RWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHRpbWUgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3RpbWUnKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgdGltZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1RJTUUodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUudmFsdWUgPSBSQUcuc3RhdGUuZ2V0VGltZSh0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHRpbWUgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9USU1FX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0VGltZSh0aGlzLmN1cnJlbnRDdHgsIHRoaXMuaW5wdXRUaW1lLnZhbHVlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9dGltZV1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLmlucHV0VGltZS52YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTGFuZ3VhZ2UgZW50cmllcyBhcmUgdGVtcGxhdGUgZGVsZWdhdGVzICovXHJcbnR5cGUgTGFuZ3VhZ2VFbnRyeSA9ICguLi5wYXJ0czogc3RyaW5nW10pID0+IHN0cmluZyA7XHJcblxyXG5hYnN0cmFjdCBjbGFzcyBCYXNlTGFuZ3VhZ2Vcclxue1xyXG4gICAgW2luZGV4OiBzdHJpbmddIDogTGFuZ3VhZ2VFbnRyeSB8IHN0cmluZyB8IHN0cmluZ1tdO1xyXG5cclxuICAgIC8vIFJBR1xyXG5cclxuICAgIC8qKiBXZWxjb21lIG1lc3NhZ2UsIHNob3duIG9uIG1hcnF1ZWUgb24gZmlyc3QgbG9hZCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgV0VMQ09NRSAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVxdWlyZWQgRE9NIGVsZW1lbnQgaXMgbWlzc2luZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRE9NX01JU1NJTkcgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVxdWlyZWQgZWxlbWVudCBhdHRyaWJ1dGUgaXMgbWlzc2luZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQVRUUl9NSVNTSU5HICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVxdWlyZWQgZGF0YXNldCBlbnRyeSBpcyBtaXNzaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQVRBX01JU1NJTkcgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBCYWQgZGlyZWN0aW9uIGFyZ3VtZW50IGdpdmVuIHRvIGRpcmVjdGlvbmFsIGZ1bmN0aW9uICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBCQURfRElSRUNUSU9OIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBCYWQgYm9vbGVhbiBzdHJpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEJBRF9CT09MRUFOICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFN0YXRlXHJcblxyXG4gICAgLyoqIFN0YXRlIHN1Y2Nlc3NmdWxseSBsb2FkZWQgZnJvbSBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9GUk9NX1NUT1JBR0UgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFN0YXRlIHN1Y2Nlc3NmdWxseSBzYXZlZCB0byBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9UT19TVE9SQUdFICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEluc3RydWN0aW9ucyBmb3IgY29weS9wYXN0aW5nIHNhdmVkIHN0YXRlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9DT1BZX1BBU1RFICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEhlYWRlciBmb3IgZHVtcGVkIHJhdyBzdGF0ZSBKU09OICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9SQVdfSlNPTiAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIENvdWxkIG5vdCBzYXZlIHN0YXRlIHRvIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1NBVkVfRkFJTCAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogTm8gc3RhdGUgd2FzIGF2YWlsYWJsZSB0byBsb2FkICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9TQVZFX01JU1NJTkcgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIE5vbi1leGlzdGVudCBwaHJhc2VzZXQgcmVmZXJlbmNlIHdoZW4gZ2V0dGluZyBmcm9tIHN0YXRlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9OT05FWElTVEFOVF9QSFJBU0VTRVQgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIENvbmZpZ1xyXG5cclxuICAgIC8qKiBDb25maWcgZmFpbGVkIHRvIGxvYWQgZnJvbSBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBDT05GSUdfTE9BRF9GQUlMICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQ29uZmlnIGZhaWxlZCB0byBzYXZlIHRvIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IENPTkZJR19TQVZFX0ZBSUwgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBDb25maWcgZmFpbGVkIHRvIGNsZWFyIGZyb20gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQ09ORklHX1JFU0VUX0ZBSUwgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIERhdGFiYXNlXHJcblxyXG4gICAgLyoqIEdpdmVuIGVsZW1lbnQgaXNuJ3QgYSBwaHJhc2VzZXQgaUZyYW1lICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9FTEVNRU5UX05PVF9QSFJBU0VTRVRfSUZSQU1FIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBVbmtub3duIHN0YXRpb24gY29kZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfVU5LTk9XTl9TVEFUSU9OICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU3RhdGlvbiBjb2RlIHdpdGggYmxhbmsgbmFtZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfRU1QVFlfU1RBVElPTiAgICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUGlja2luZyB0b28gbWFueSBzdGF0aW9uIGNvZGVzIGluIG9uZSBnbyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfVE9PX01BTllfU1RBVElPTlMgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gVG9vbGJhclxyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIHRleHQgZm9yIHRvb2xiYXIgYnV0dG9uc1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9QTEFZICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NUT1AgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU0hVRkZMRSAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TQVZFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX0xPQUQgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU0VUVElOR1MgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIEVkaXRvclxyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIHRleHQgZm9yIGVkaXRvciBlbGVtZW50c1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfQ09BQ0ggICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfRVhDVVNFICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfSU5URUdFUiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfTkFNRUQgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfT1BUX09QRU4gICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfT1BUX0NMT1NFICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfUEhSQVNFU0VUICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfUExBVEZPUk0gICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfU0VSVklDRSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfU1RBVElPTiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfU1RBVElPTkxJU1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfVElNRSAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8qKiBJbml0aWFsIG1lc3NhZ2Ugd2hlbiBzZXR0aW5nIHVwIGVkaXRvciAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX0lOSVQgICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXBsYWNlbWVudCB0ZXh0IGZvciB1bmtub3duIGVkaXRvciBlbGVtZW50cyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX1VOS05PV05fRUxFTUVOVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXBsYWNlbWVudCB0ZXh0IGZvciBlZGl0b3IgcGhyYXNlcyB3aXRoIHVua25vd24gcmVmZXJlbmNlIGlkcyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX1VOS05PV05fUEhSQVNFICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXBsYWNlbWVudCB0ZXh0IGZvciBlZGl0b3IgcGhyYXNlc2V0cyB3aXRoIHVua25vd24gcmVmZXJlbmNlIGlkcyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX1VOS05PV05fUEhSQVNFU0VUIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBQaHJhc2VyXHJcblxyXG4gICAgLyoqIFRvbyBtYW55IGxldmVscyBvZiByZWN1cnNpb24gaW4gdGhlIHBocmFzZXIgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBIUkFTRVJfVE9PX1JFQ1VSU0lWRSA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gUGlja2Vyc1xyXG5cclxuICAgIC8vIEhlYWRlcnMgZm9yIHBpY2tlciBkaWFsb2dzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfQ09BQ0ggICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX0VYQ1VTRSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9JTlRFR0VSICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfTkFNRUQgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1BIUkFTRVNFVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9QTEFURk9STSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfU0VSVklDRSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1NUQVRJT04gICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9TVEFUSU9OTElTVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfVElNRSAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIGFuZCBwbGFjZWhvbGRlciB0ZXh0IGZvciBwaWNrZXIgY29udHJvbHNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfR0VORVJJQ19UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9HRU5FUklDX1BIICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0NPQUNIX1QgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfRVhDVVNFX1QgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9FWENVU0VfUEggICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0VYQ1VTRV9JVEVNX1QgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfSU5UX1QgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9OQU1FRF9UICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX05BTUVEX1BIICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfTkFNRURfSVRFTV9UICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfUEggICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9JVEVNX1QgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QTEFUX05VTUJFUl9UICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BMQVRfTEVUVEVSX1QgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVl9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWX1BIICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZfSVRFTV9UICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU1RBVElPTl9UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TVEFUSU9OX1BIICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NUQVRJT05fSVRFTV9UIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQUREICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9BRERfVCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0NMT1NFICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQ0xPU0VfVCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9FTVBUWSAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RSQUdfVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfREVMRVRFICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9ERUxFVEVfVCAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0lURU1fVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfVElNRV9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8qKiBDb2FjaCBwaWNrZXIncyBvbkNoYW5nZSBmaXJlZCB3aXRob3V0IGNvbnRleHQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfQ09BQ0hfTUlTU0lOR19TVEFURSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBJbnRlZ2VyIHBpY2tlcidzIG9uQ2hhbmdlIGZpcmVkIHdpdGhvdXQgY29udGV4dCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9JTlRfTUlTU0lOR19TVEFURSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFBocmFzZXNldCBwaWNrZXIncyBvblNlbGVjdCBmaXJlZCB3aXRob3V0IHJlZmVyZW5jZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX01JU1NJTkdfU1RBVEUgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFNlcnZpY2UgcGlja2VyJ3Mgb25TZWxlY3QgZmlyZWQgd2l0aG91dCByZWZlcmVuY2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVklDRV9NSVNTSU5HX1NUQVRFIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTZXJ2aWNlIHBpY2tlcidzIG9uQ2hhbmdlIGZpcmVkIHdpdGhvdXQgcmVmZXJlbmNlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1RJTUVfTUlTU0lOR19TVEFURSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUGhyYXNlc2V0IHBpY2tlciBvcGVuZWQgZm9yIHVua25vd24gcGhyYXNlc2V0ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfVU5LTk9XTiAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogRHJhZyBtaXJyb3IgY3JlYXRlIGV2ZW50IGluIHN0YXRpb24gbGlzdCBtaXNzaW5nIHN0YXRlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RSQUdfTUlTU0lORyAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gU2V0dGluZ3NcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSBhbmQgbGFiZWwgdGV4dCBmb3Igc2V0dGluZ3MgZWxlbWVudHNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfQ09ORklSTSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX0NPTkZJUk1fVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9ET05FICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU0FWRSAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NBVkVfVCAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0ggICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX0NIT0lDRSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9FTVBUWSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfVk9MICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1BJVENIICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9SQVRFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfVEVTVCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1RFU1RfVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX0xFR0FMICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gVUkgY29udHJvbHNcclxuXHJcbiAgICAvKiogSGVhZGVyIGZvciB0aGUgXCJ0b28gc21hbGxcIiB3YXJuaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBXQVJOX1NIT1JUX0hFQURFUiA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQm9keSB0ZXh0IGZvciB0aGUgXCJ0b28gc21hbGxcIiB3YXJuaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBXQVJOX1NIT1JUICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gTWlzYy4gY29uc3RhbnRzXHJcblxyXG4gICAgLyoqIEFycmF5IG9mIHRoZSBlbnRpcmUgYWxwaGFiZXQgb2YgdGhlIGxhbmd1YWdlLCBmb3IgY29hY2ggbGV0dGVycyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgTEVUVEVSUyA6IHN0cmluZztcclxuICAgIC8qKiBBcnJheSBvZiBudW1iZXJzIGFzIHdvcmRzIChlLmcuIHplcm8sIG9uZSwgdHdvKSwgbWF0Y2hpbmcgdGhlaXIgaW5kZXggKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERJR0lUUyAgOiBzdHJpbmdbXTtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkJhc2VMYW5ndWFnZS50c1wiLz5cclxuXHJcbmNsYXNzIEVuZ2xpc2hMYW5ndWFnZSBleHRlbmRzIEJhc2VMYW5ndWFnZVxyXG57XHJcbiAgICBXRUxDT01FICAgICAgID0gKCkgPT4gJ1dlbGNvbWUgdG8gUmFpbCBBbm5vdW5jZW1lbnQgR2VuZXJhdG9yLic7XHJcbiAgICBET01fTUlTU0lORyAgID0gKHE6IHN0cmluZykgPT4gYFJlcXVpcmVkIERPTSBlbGVtZW50IGlzIG1pc3Npbmc6ICcke3F9J2A7XHJcbiAgICBBVFRSX01JU1NJTkcgID0gKGE6IHN0cmluZykgPT4gYFJlcXVpcmVkIGF0dHJpYnV0ZSBpcyBtaXNzaW5nOiAnJHthfSdgO1xyXG4gICAgREFUQV9NSVNTSU5HICA9IChrOiBzdHJpbmcpID0+IGBSZXF1aXJlZCBkYXRhc2V0IGtleSBpcyBtaXNzaW5nIG9yIGVtcHR5OiAnJHtrfSdgO1xyXG4gICAgQkFEX0RJUkVDVElPTiA9ICh2OiBzdHJpbmcpID0+IGBEaXJlY3Rpb24gbmVlZHMgdG8gYmUgLTEgb3IgMSwgbm90ICcke3Z9J2A7XHJcbiAgICBCQURfQk9PTEVBTiAgID0gKHY6IHN0cmluZykgPT4gYEdpdmVuIHN0cmluZyBkb2VzIG5vdCByZXByZXNlbnQgYSBib29sZWFuOiAnJHt2fSdgO1xyXG5cclxuICAgIFNUQVRFX0ZST01fU1RPUkFHRSAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1N0YXRlIGhhcyBiZWVuIGxvYWRlZCBmcm9tIHN0b3JhZ2UuJztcclxuICAgIFNUQVRFX1RPX1NUT1JBR0UgICAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1N0YXRlIGhhcyBiZWVuIHNhdmVkIHRvIHN0b3JhZ2UsIGFuZCBkdW1wZWQgdG8gY29uc29sZS4nO1xyXG4gICAgU1RBVEVfQ09QWV9QQVNURSAgICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnJWNDb3B5IGFuZCBwYXN0ZSB0aGlzIGluIGNvbnNvbGUgdG8gbG9hZCBsYXRlcjonO1xyXG4gICAgU1RBVEVfUkFXX0pTT04gICAgICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnJWNSYXcgSlNPTiBzdGF0ZTonO1xyXG4gICAgU1RBVEVfU0FWRV9GQUlMICAgICAgICAgICAgID0gKG1zZzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBTb3JyeSwgc3RhdGUgY291bGQgbm90IGJlIHNhdmVkIHRvIHN0b3JhZ2U6ICR7bXNnfS5gO1xyXG4gICAgU1RBVEVfU0FWRV9NSVNTSU5HICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnU29ycnksIG5vIHN0YXRlIHdhcyBmb3VuZCBpbiBzdG9yYWdlLic7XHJcbiAgICBTVEFURV9OT05FWElTVEFOVF9QSFJBU0VTRVQgPSAocjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBBdHRlbXB0ZWQgdG8gZ2V0IGNob3NlbiBpbmRleCBmb3IgcGhyYXNlc2V0ICgke3J9KSB0aGF0IGRvZXNuJ3QgZXhpc3RgO1xyXG5cclxuICAgIENPTkZJR19MT0FEX0ZBSUwgID0gKG1zZzogc3RyaW5nKSA9PiBgQ291bGQgbm90IGxvYWQgc2V0dGluZ3M6ICR7bXNnfWA7XHJcbiAgICBDT05GSUdfU0FWRV9GQUlMICA9IChtc2c6IHN0cmluZykgPT4gYENvdWxkIG5vdCBzYXZlIHNldHRpbmdzOiAke21zZ31gO1xyXG4gICAgQ09ORklHX1JFU0VUX0ZBSUwgPSAobXNnOiBzdHJpbmcpID0+IGBDb3VsZCBub3QgY2xlYXIgc2V0dGluZ3M6ICR7bXNnfWA7XHJcblxyXG4gICAgREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRSA9IChlOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENvbmZpZ3VyZWQgcGhyYXNlc2V0IGVsZW1lbnQgcXVlcnkgKCR7ZX0pIGRvZXMgbm90IHBvaW50IHRvIGFuIGlGcmFtZSBlbWJlZGA7XHJcbiAgICBEQl9VTktOT1dOX1NUQVRJT04gICA9IChjOiBzdHJpbmcpID0+IGBVTktOT1dOIFNUQVRJT046ICR7Y31gO1xyXG4gICAgREJfRU1QVFlfU1RBVElPTiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBTdGF0aW9uIGRhdGFiYXNlIGFwcGVhcnMgdG8gY29udGFpbiBhbiBlbXB0eSBuYW1lIGZvciBjb2RlICcke2N9J2A7XHJcbiAgICBEQl9UT09fTUFOWV9TVEFUSU9OUyA9ICgpID0+ICdQaWNraW5nIHRvbyBtYW55IHN0YXRpb25zIHRoYW4gdGhlcmUgYXJlIGF2YWlsYWJsZSc7XHJcblxyXG4gICAgVE9PTEJBUl9QTEFZICAgICA9ICgpID0+ICdQbGF5IHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NUT1AgICAgID0gKCkgPT4gJ1N0b3AgcGxheWluZyBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TSFVGRkxFICA9ICgpID0+ICdHZW5lcmF0ZSByYW5kb20gcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU0FWRSAgICAgPSAoKSA9PiAnU2F2ZSBzdGF0ZSB0byBzdG9yYWdlJztcclxuICAgIFRPT0xCQVJfTE9BRCAgICAgPSAoKSA9PiAnUmVjYWxsIHN0YXRlIGZyb20gc3RvcmFnZSc7XHJcbiAgICBUT09MQkFSX1NFVFRJTkdTID0gKCkgPT4gJ09wZW4gc2V0dGluZ3MnO1xyXG5cclxuICAgIFRJVExFX0NPQUNIICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgY29hY2ggKCcke2N9JylgO1xyXG4gICAgVElUTEVfRVhDVVNFICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdDbGljayB0byBjaGFuZ2UgdGhpcyBleGN1c2UnO1xyXG4gICAgVElUTEVfSU5URUdFUiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBudW1iZXIgKCcke2N9JylgO1xyXG4gICAgVElUTEVfTkFNRUQgICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgIFwiQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdHJhaW4ncyBuYW1lXCI7XHJcbiAgICBUSVRMRV9PUFRfT1BFTiAgICA9ICh0OiBzdHJpbmcsIHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gb3BlbiB0aGlzIG9wdGlvbmFsICR7dH0gKCcke3J9JylgO1xyXG4gICAgVElUTEVfT1BUX0NMT1NFICAgPSAodDogc3RyaW5nLCByOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNsb3NlIHRoaXMgb3B0aW9uYWwgJHt0fSAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9QSFJBU0VTRVQgICA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGUgcGhyYXNlIHVzZWQgaW4gdGhpcyBzZWN0aW9uICgnJHtyfScpYDtcclxuICAgIFRJVExFX1BMQVRGT1JNICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICBcIkNsaWNrIHRvIGNoYW5nZSB0aGlzIHRyYWluJ3MgcGxhdGZvcm1cIjtcclxuICAgIFRJVExFX1NFUlZJQ0UgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc2VydmljZSAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9TVEFUSU9OICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHN0YXRpb24gKCcke2N9JylgO1xyXG4gICAgVElUTEVfU1RBVElPTkxJU1QgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBzdGF0aW9uIGxpc3QgKCcke2N9JylgO1xyXG4gICAgVElUTEVfVElNRSAgICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyB0aW1lICgnJHtjfScpYDtcclxuXHJcbiAgICBFRElUT1JfSU5JVCAgICAgICAgICAgICAgPSAoKSA9PiAnUGxlYXNlIHdhaXQuLi4nO1xyXG4gICAgRURJVE9SX1VOS05PV05fRUxFTUVOVCAgID0gKG46IHN0cmluZykgPT4gYChVTktOT1dOIFhNTCBFTEVNRU5UOiAke259KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0UgICAgPSAocjogc3RyaW5nKSA9PiBgKFVOS05PV04gUEhSQVNFOiAke3J9KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQgPSAocjogc3RyaW5nKSA9PiBgKFVOS05PV04gUEhSQVNFU0VUOiAke3J9KWA7XHJcblxyXG4gICAgUEhSQVNFUl9UT09fUkVDVVJTSVZFID0gKCkgPT5cclxuICAgICAgICAnVG9vIG1hbnkgbGV2ZWxzIG9mIHJlY3Vyc2lvbiB3aGlsc3QgcHJvY2Vzc2luZyBwaHJhc2UnO1xyXG5cclxuICAgIEhFQURFUl9DT0FDSCAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBjb2FjaCBsZXR0ZXIgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfRVhDVVNFICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGFuIGV4Y3VzZSc7XHJcbiAgICBIRUFERVJfSU5URUdFUiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgbnVtYmVyIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX05BTUVEICAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICAnUGljayBhIG5hbWVkIHRyYWluJztcclxuICAgIEhFQURFUl9QSFJBU0VTRVQgICA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBwaHJhc2UgZm9yIHRoZSAnJHtyfScgc2VjdGlvbmA7XHJcbiAgICBIRUFERVJfUExBVEZPUk0gICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGEgcGxhdGZvcm0nO1xyXG4gICAgSEVBREVSX1NFUlZJQ0UgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHNlcnZpY2UgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfU1RBVElPTiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgc3RhdGlvbiBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9TVEFUSU9OTElTVCA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYEJ1aWxkIGEgc3RhdGlvbiBsaXN0IGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1RJTUUgICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHRpbWUgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcblxyXG4gICAgUF9HRU5FUklDX1QgICAgICA9ICgpID0+ICdMaXN0IG9mIGNob2ljZXMnO1xyXG4gICAgUF9HRU5FUklDX1BIICAgICA9ICgpID0+ICdGaWx0ZXIgY2hvaWNlcy4uLic7XHJcbiAgICBQX0NPQUNIX1QgICAgICAgID0gKCkgPT4gJ0NvYWNoIGxldHRlcic7XHJcbiAgICBQX0VYQ1VTRV9UICAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgZGVsYXkgb3IgY2FuY2VsbGF0aW9uIGV4Y3VzZXMnO1xyXG4gICAgUF9FWENVU0VfUEggICAgICA9ICgpID0+ICdGaWx0ZXIgZXhjdXNlcy4uLic7XHJcbiAgICBQX0VYQ1VTRV9JVEVNX1QgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIGV4Y3VzZSc7XHJcbiAgICBQX0lOVF9UICAgICAgICAgID0gKCkgPT4gJ0ludGVnZXIgdmFsdWUnO1xyXG4gICAgUF9OQU1FRF9UICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHRyYWluIG5hbWVzJztcclxuICAgIFBfTkFNRURfUEggICAgICAgPSAoKSA9PiAnRmlsdGVyIHRyYWluIG5hbWUuLi4nO1xyXG4gICAgUF9OQU1FRF9JVEVNX1QgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBuYW1lJztcclxuICAgIFBfUFNFVF9UICAgICAgICAgPSAoKSA9PiAnTGlzdCBvZiBwaHJhc2VzJztcclxuICAgIFBfUFNFVF9QSCAgICAgICAgPSAoKSA9PiAnRmlsdGVyIHBocmFzZXMuLi4nO1xyXG4gICAgUF9QU0VUX0lURU1fVCAgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBwaHJhc2UnO1xyXG4gICAgUF9QTEFUX05VTUJFUl9UICA9ICgpID0+ICdQbGF0Zm9ybSBudW1iZXInO1xyXG4gICAgUF9QTEFUX0xFVFRFUl9UICA9ICgpID0+ICdPcHRpb25hbCBwbGF0Zm9ybSBsZXR0ZXInO1xyXG4gICAgUF9TRVJWX1QgICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHNlcnZpY2UgbmFtZXMnO1xyXG4gICAgUF9TRVJWX1BIICAgICAgICA9ICgpID0+ICdGaWx0ZXIgc2VydmljZXMuLi4nO1xyXG4gICAgUF9TRVJWX0lURU1fVCAgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBzZXJ2aWNlJztcclxuICAgIFBfU1RBVElPTl9UICAgICAgPSAoKSA9PiAnTGlzdCBvZiBzdGF0aW9uIG5hbWVzJztcclxuICAgIFBfU1RBVElPTl9QSCAgICAgPSAoKSA9PiAnRmlsdGVyIHN0YXRpb25zLi4uJztcclxuICAgIFBfU1RBVElPTl9JVEVNX1QgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IG9yIGFkZCB0aGlzIHN0YXRpb24nO1xyXG4gICAgUF9TTF9BREQgICAgICAgICA9ICgpID0+ICdBZGQgc3RhdGlvbi4uLic7XHJcbiAgICBQX1NMX0FERF9UICAgICAgID0gKCkgPT4gJ0FkZCBzdGF0aW9uIHRvIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0NMT1NFICAgICAgID0gKCkgPT4gJ0Nsb3NlJztcclxuICAgIFBfU0xfQ0xPU0VfVCAgICAgPSAoKSA9PiAnQ2xvc2UgdGhpcyBwaWNrZXInO1xyXG4gICAgUF9TTF9FTVBUWSAgICAgICA9ICgpID0+ICdQbGVhc2UgYWRkIGF0IGxlYXN0IG9uZSBzdGF0aW9uIHRvIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0RSQUdfVCAgICAgID0gKCkgPT4gJ0RyYWdnYWJsZSBzZWxlY3Rpb24gb2Ygc3RhdGlvbnMgZm9yIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0RFTEVURSAgICAgID0gKCkgPT4gJ0Ryb3AgaGVyZSB0byBkZWxldGUnO1xyXG4gICAgUF9TTF9ERUxFVEVfVCAgICA9ICgpID0+ICdEcm9wIHN0YXRpb24gaGVyZSB0byBkZWxldGUgaXQgZnJvbSB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9JVEVNX1QgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ0RyYWcgdG8gcmVvcmRlcjsgZG91YmxlLWNsaWNrIG9yIGRyYWcgaW50byBkZWxldGUgem9uZSB0byByZW1vdmUnO1xyXG4gICAgUF9USU1FX1QgICAgICAgICA9ICgpID0+ICdUaW1lIGVkaXRvcic7XHJcblxyXG4gICAgUF9DT0FDSF9NSVNTSU5HX1NUQVRFICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIGNvYWNoIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfSU5UX01JU1NJTkdfU1RBVEUgICAgID0gKCkgPT4gJ29uQ2hhbmdlIGZpcmVkIGZvciBpbnRlZ2VyIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfUFNFVF9NSVNTSU5HX1NUQVRFICAgID0gKCkgPT4gJ29uU2VsZWN0IGZpcmVkIGZvciBwaHJhc2VzZXQgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9TRVJWSUNFX01JU1NJTkdfU1RBVEUgPSAoKSA9PiAnb25TZWxlY3QgZmlyZWQgZm9yIHNlcnZpY2UgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9USU1FX01JU1NJTkdfU1RBVEUgICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIHRpbWUgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9QU0VUX1VOS05PV04gICAgICAgICAgPSAocjogc3RyaW5nKSA9PiBgUGhyYXNlc2V0ICcke3J9JyBkb2Vzbid0IGV4aXN0YDtcclxuICAgIFBfU0xfRFJBR19NSVNTSU5HICAgICAgID0gKCkgPT4gJ0RyYWdnYWJsZTogTWlzc2luZyBzb3VyY2UgZWxlbWVudHMgZm9yIG1pcnJvciBldmVudCc7XHJcblxyXG4gICAgU1RfUkVTRVQgICAgICAgICAgID0gKCkgPT4gJ1Jlc2V0IHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX1QgICAgICAgICA9ICgpID0+ICdSZXNldCBzZXR0aW5ncyB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9DT05GSVJNICAgPSAoKSA9PiAnQXJlIHlvdSBzdXJlPyc7XHJcbiAgICBTVF9SRVNFVF9DT05GSVJNX1QgPSAoKSA9PiAnQ29uZmlybSByZXNldCB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9ET05FICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTZXR0aW5ncyBoYXZlIGJlZW4gcmVzZXQgdG8gdGhlaXIgZGVmYXVsdHMsIGFuZCBkZWxldGVkIGZyb20gc3RvcmFnZS4nO1xyXG4gICAgU1RfU0FWRSAgICAgICAgICAgID0gKCkgPT4gJ1NhdmUgJiBjbG9zZSc7XHJcbiAgICBTVF9TQVZFX1QgICAgICAgICAgPSAoKSA9PiAnU2F2ZSBhbmQgY2xvc2Ugc2V0dGluZ3MnO1xyXG4gICAgU1RfU1BFRUNIICAgICAgICAgID0gKCkgPT4gJ1NwZWVjaCc7XHJcbiAgICBTVF9TUEVFQ0hfQ0hPSUNFICAgPSAoKSA9PiAnVm9pY2UnO1xyXG4gICAgU1RfU1BFRUNIX0VNUFRZICAgID0gKCkgPT4gJ05vbmUgYXZhaWxhYmxlJztcclxuICAgIFNUX1NQRUVDSF9WT0wgICAgICA9ICgpID0+ICdWb2x1bWUnO1xyXG4gICAgU1RfU1BFRUNIX1BJVENIICAgID0gKCkgPT4gJ1BpdGNoJztcclxuICAgIFNUX1NQRUVDSF9SQVRFICAgICA9ICgpID0+ICdSYXRlJztcclxuICAgIFNUX1NQRUVDSF9URVNUICAgICA9ICgpID0+ICdUZXN0IHNwZWVjaCc7XHJcbiAgICBTVF9TUEVFQ0hfVEVTVF9UICAgPSAoKSA9PiAnUGxheSBhIHNwZWVjaCBzYW1wbGUgd2l0aCB0aGUgY3VycmVudCBzZXR0aW5ncyc7XHJcbiAgICBTVF9MRUdBTCAgICAgICAgICAgPSAoKSA9PiAnTGVnYWwgJiBBY2tub3dsZWRnZW1lbnRzJztcclxuXHJcbiAgICBXQVJOX1NIT1JUX0hFQURFUiA9ICgpID0+ICdcIk1heSBJIGhhdmUgeW91ciBhdHRlbnRpb24gcGxlYXNlLi4uXCInO1xyXG4gICAgV0FSTl9TSE9SVCAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdUaGlzIGRpc3BsYXkgaXMgdG9vIHNob3J0IHRvIHN1cHBvcnQgUkFHLiBQbGVhc2UgbWFrZSB0aGlzIHdpbmRvdyB0YWxsZXIsIG9yJyArXHJcbiAgICAgICAgJyByb3RhdGUgeW91ciBkZXZpY2UgZnJvbSBsYW5kc2NhcGUgdG8gcG9ydHJhaXQuJztcclxuXHJcbiAgICAvLyBUT0RPOiBUaGVzZSBkb24ndCBmaXQgaGVyZTsgdGhpcyBzaG91bGQgZ28gaW4gdGhlIGRhdGFcclxuICAgIExFVFRFUlMgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVonO1xyXG4gICAgRElHSVRTICA9IFtcclxuICAgICAgICAnemVybycsICAgICAnb25lJywgICAgICd0d28nLCAgICAgJ3RocmVlJywgICAgICdmb3VyJywgICAgICdmaXZlJywgICAgJ3NpeCcsXHJcbiAgICAgICAgJ3NldmVuJywgICAgJ2VpZ2h0JywgICAnbmluZScsICAgICd0ZW4nLCAgICAgICAnZWxldmVuJywgICAndHdlbHZlJywgICd0aGlydGVlbicsXHJcbiAgICAgICAgJ2ZvdXJ0ZWVuJywgJ2ZpZnRlZW4nLCAnc2l4dGVlbicsICdzZXZlbnRlZW4nLCAnZWlnaHRlZW4nLCAnbmludGVlbicsICd0d2VudHknXHJcbiAgICBdO1xyXG5cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqXHJcbiAqIEhvbGRzIG1ldGhvZHMgZm9yIHByb2Nlc3NpbmcgZWFjaCB0eXBlIG9mIHBocmFzZSBlbGVtZW50IGludG8gSFRNTCwgd2l0aCBkYXRhIHRha2VuXHJcbiAqIGZyb20gdGhlIGN1cnJlbnQgc3RhdGUuIEVhY2ggbWV0aG9kIHRha2VzIGEgY29udGV4dCBvYmplY3QsIGhvbGRpbmcgZGF0YSBmb3IgdGhlXHJcbiAqIGN1cnJlbnQgWE1MIGVsZW1lbnQgYmVpbmcgcHJvY2Vzc2VkIGFuZCB0aGUgWE1MIGRvY3VtZW50IGJlaW5nIHVzZWQuXHJcbiAqL1xyXG5jbGFzcyBFbGVtZW50UHJvY2Vzc29yc1xyXG57XHJcbiAgICAvKiogRmlsbHMgaW4gY29hY2ggbGV0dGVycyBmcm9tIEEgdG8gWiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb2FjaChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9DT0FDSChjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRDb2FjaChjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGV4Y3VzZSwgZm9yIGEgZGVsYXkgb3IgY2FuY2VsbGF0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGV4Y3VzZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0VYQ1VTRSgpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmV4Y3VzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gaW50ZWdlcnMsIG9wdGlvbmFsbHkgd2l0aCBub3VucyBhbmQgaW4gd29yZCBmb3JtICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGludGVnZXIoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgc2luZ3VsYXIgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3Npbmd1bGFyJyk7XHJcbiAgICAgICAgbGV0IHBsdXJhbCAgID0gY3R4LnhtbEVsZW1lbnQuZ2V0QXR0cmlidXRlKCdwbHVyYWwnKTtcclxuICAgICAgICBsZXQgd29yZHMgICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3dvcmRzJyk7XHJcblxyXG4gICAgICAgIGxldCBpbnQgICAgPSBSQUcuc3RhdGUuZ2V0SW50ZWdlcihjb250ZXh0KTtcclxuICAgICAgICBsZXQgaW50U3RyID0gKHdvcmRzICYmIHdvcmRzLnRvTG93ZXJDYXNlKCkgPT09ICd0cnVlJylcclxuICAgICAgICAgICAgPyBMLkRJR0lUU1tpbnRdIHx8IGludC50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogaW50LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKGludCA9PT0gMSAmJiBzaW5ndWxhcilcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHtzaW5ndWxhcn1gO1xyXG4gICAgICAgIGVsc2UgaWYgKGludCAhPT0gMSAmJiBwbHVyYWwpXHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7cGx1cmFsfWA7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9JTlRFR0VSKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gaW50U3RyO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG5cclxuICAgICAgICBpZiAoc2luZ3VsYXIpIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3Npbmd1bGFyJ10gPSBzaW5ndWxhcjtcclxuICAgICAgICBpZiAocGx1cmFsKSAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3BsdXJhbCddICAgPSBwbHVyYWw7XHJcbiAgICAgICAgaWYgKHdvcmRzKSAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wyd3b3JkcyddICAgID0gd29yZHM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBuYW1lZChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX05BTUVEKCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUubmFtZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEluY2x1ZGVzIGEgcHJldmlvdXNseSBkZWZpbmVkIHBocmFzZSwgYnkgaXRzIGBpZGAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGhyYXNlKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVmICAgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IHBocmFzZSA9IFJBRy5kYXRhYmFzZS5nZXRQaHJhc2UocmVmKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgICAgPSAnJztcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydyZWYnXSA9IHJlZjtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2UpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fUEhSQVNFKHJlZik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaHJhc2VzIHdpdGggYSBjaGFuY2UgdmFsdWUgYXMgY29sbGFwc2libGVcclxuICAgICAgICBpZiAoIGN0eC54bWxFbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY2hhbmNlJykgKVxyXG4gICAgICAgICAgICB0aGlzLm1ha2VDb2xsYXBzaWJsZShjdHgsIHBocmFzZSwgcmVmKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIERPTS5jbG9uZUludG8ocGhyYXNlLCBjdHgubmV3RWxlbWVudCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEluY2x1ZGVzIGEgcGhyYXNlIGZyb20gYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlc2V0LCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VzZXQoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG4gICAgICAgIGxldCBmb3JjZWRJZHggPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkeCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydyZWYnXSA9IHJlZjtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fUEhSQVNFU0VUKHJlZik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBpZHggPSBmb3JjZWRJZHhcclxuICAgICAgICAgICAgPyBwYXJzZUludChmb3JjZWRJZHgpXHJcbiAgICAgICAgICAgIDogUkFHLnN0YXRlLmdldFBocmFzZXNldElkeChyZWYpO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlID0gcGhyYXNlc2V0LmNoaWxkcmVuW2lkeF0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2lkeCddID0gZm9yY2VkSWR4IHx8IGlkeC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSA9IEwuVElUTEVfUEhSQVNFU0VUKHJlZik7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaHJhc2VzZXRzIHdpdGggYSBjaGFuY2UgdmFsdWUgYXMgY29sbGFwc2libGVcclxuICAgICAgICBpZiAoIGN0eC54bWxFbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY2hhbmNlJykgKVxyXG4gICAgICAgICAgICB0aGlzLm1ha2VDb2xsYXBzaWJsZShjdHgsIHBocmFzZSwgcmVmKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIERPTS5jbG9uZUludG8ocGhyYXNlLCBjdHgubmV3RWxlbWVudCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBjdXJyZW50IHBsYXRmb3JtICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBsYXRmb3JtKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfUExBVEZPUk0oKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5wbGF0Zm9ybS5qb2luKCcnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIHJhaWwgbmV0d29yayBuYW1lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNlcnZpY2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU0VSVklDRShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBzdGF0aW9uIG5hbWVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRpb24oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBjb2RlICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb24oY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TVEFUSU9OKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHN0YXRpb24gbGlzdHMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RhdGlvbmxpc3QoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ICAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgc3RhdGlvbnMgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbkxpc3QoY29udGV4dCkuc2xpY2UoKTtcclxuICAgICAgICBsZXQgc3RhdGlvbkxpc3QgPSBTdHJpbmdzLmZyb21TdGF0aW9uTGlzdChzdGF0aW9ucywgY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TVEFUSU9OTElTVChjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IHN0YXRpb25MaXN0O1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgdGltZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0aW1lKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1RJTUUoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZ2V0VGltZShjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdm94IHBhcnRzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZveChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2tleScpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBMb2NhbGl6ZVxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ICAgID0gY3R4LnhtbEVsZW1lbnQudGV4dENvbnRlbnQ7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgICAgPSBgQ2xpY2sgdG8gZWRpdCB0aGlzIHBocmFzZSAoJHtrZXl9KWA7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsna2V5J10gPSBrZXk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdW5rbm93biBlbGVtZW50cyB3aXRoIGFuIGlubGluZSBlcnJvciBtZXNzYWdlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHVua25vd24oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBuYW1lID0gY3R4LnhtbEVsZW1lbnQubm9kZU5hbWU7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9FTEVNRU5UKG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xvbmVzIHRoZSBjaGlsZHJlbiBvZiB0aGUgZ2l2ZW4gZWxlbWVudCBpbnRvIGEgbmV3IGlubmVyIHNwYW4gdGFnLCBzbyB0aGF0IHRoZXlcclxuICAgICAqIGNhbiBiZSBtYWRlIGNvbGxhcHNpYmxlLiBBcHBlbmRzIGl0IHRvIHRoZSBuZXcgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG1ha2VDb2xsYXBzaWJsZShjdHg6IFBocmFzZUNvbnRleHQsIHNvdXJjZTogSFRNTEVsZW1lbnQsIHJlZjogc3RyaW5nKVxyXG4gICAgICAgIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjaGFuY2UgICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2NoYW5jZScpITtcclxuICAgICAgICBsZXQgaW5uZXIgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG4gICAgICAgIGxldCB0b2dnbGUgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgbGV0IGNvbGxhcHNlZCA9IFJBRy5zdGF0ZS5nZXRDb2xsYXBzZWQoIHJlZiwgcGFyc2VJbnQoY2hhbmNlKSApO1xyXG5cclxuICAgICAgICBpbm5lci5jbGFzc0xpc3QuYWRkKCdpbm5lcicpO1xyXG4gICAgICAgIHRvZ2dsZS5jbGFzc0xpc3QuYWRkKCd0b2dnbGUnKTtcclxuXHJcbiAgICAgICAgRE9NLmNsb25lSW50byhzb3VyY2UsIGlubmVyKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydjaGFuY2UnXSA9IGNoYW5jZTtcclxuXHJcbiAgICAgICAgQ29sbGFwc2libGVzLnNldChjdHgubmV3RWxlbWVudCwgdG9nZ2xlLCBjb2xsYXBzZWQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmFwcGVuZENoaWxkKHRvZ2dsZSk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQoaW5uZXIpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogUmVwcmVzZW50cyBjb250ZXh0IGRhdGEgZm9yIGEgcGhyYXNlLCB0byBiZSBwYXNzZWQgdG8gYW4gZWxlbWVudCBwcm9jZXNzb3IgKi9cclxuaW50ZXJmYWNlIFBocmFzZUNvbnRleHRcclxue1xyXG4gICAgLyoqIEdldHMgdGhlIFhNTCBwaHJhc2UgZWxlbWVudCB0aGF0IGlzIGJlaW5nIHJlcGxhY2VkICovXHJcbiAgICB4bWxFbGVtZW50IDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogR2V0cyB0aGUgSFRNTCBzcGFuIGVsZW1lbnQgdGhhdCBpcyByZXBsYWNpbmcgdGhlIFhNTCBlbGVtZW50ICovXHJcbiAgICBuZXdFbGVtZW50IDogSFRNTFNwYW5FbGVtZW50O1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKipcclxuICogSGFuZGxlcyB0aGUgdHJhbnNmb3JtYXRpb24gb2YgcGhyYXNlIFhNTCBkYXRhLCBpbnRvIEhUTUwgZWxlbWVudHMgd2l0aCB0aGVpciBkYXRhXHJcbiAqIGZpbGxlZCBpbiBhbmQgdGhlaXIgVUkgbG9naWMgd2lyZWQuXHJcbiAqL1xyXG5jbGFzcyBQaHJhc2VyXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogUmVjdXJzaXZlbHkgcHJvY2Vzc2VzIFhNTCBlbGVtZW50cywgZmlsbGluZyBpbiBkYXRhIGFuZCBhcHBseWluZyB0cmFuc2Zvcm1zLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250YWluZXIgUGFyZW50IHRvIHByb2Nlc3MgdGhlIGNoaWxkcmVuIG9mXHJcbiAgICAgKiBAcGFyYW0gbGV2ZWwgQ3VycmVudCBsZXZlbCBvZiByZWN1cnNpb24sIG1heC4gMjBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHByb2Nlc3MoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgbGV2ZWw6IG51bWJlciA9IDApXHJcbiAgICB7XHJcbiAgICAgICAgLy8gSW5pdGlhbGx5LCB0aGlzIG1ldGhvZCB3YXMgc3VwcG9zZWQgdG8ganVzdCBhZGQgdGhlIFhNTCBlbGVtZW50cyBkaXJlY3RseSBpbnRvXHJcbiAgICAgICAgLy8gdGhlIGRvY3VtZW50LiBIb3dldmVyLCB0aGlzIGNhdXNlZCBhIGxvdCBvZiBwcm9ibGVtcyAoZS5nLiB0aXRsZSBub3Qgd29ya2luZykuXHJcbiAgICAgICAgLy8gSFRNTCBkb2VzIG5vdCB3b3JrIHJlYWxseSB3ZWxsIHdpdGggY3VzdG9tIGVsZW1lbnRzLCBlc3BlY2lhbGx5IGlmIHRoZXkgYXJlIG9mXHJcbiAgICAgICAgLy8gYW5vdGhlciBYTUwgbmFtZXNwYWNlLlxyXG5cclxuICAgICAgICBsZXQgcGVuZGluZyA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCc6bm90KHNwYW4pJykgYXMgTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XHJcblxyXG4gICAgICAgIC8vIE5vIG1vcmUgWE1MIGVsZW1lbnRzIHRvIGV4cGFuZFxyXG4gICAgICAgIGlmIChwZW5kaW5nLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGb3IgZWFjaCBYTUwgZWxlbWVudCBjdXJyZW50bHkgaW4gdGhlIGNvbnRhaW5lcjpcclxuICAgICAgICAvLyAqIENyZWF0ZSBhIG5ldyBzcGFuIGVsZW1lbnQgZm9yIGl0XHJcbiAgICAgICAgLy8gKiBIYXZlIHRoZSBwcm9jZXNzb3JzIHRha2UgZGF0YSBmcm9tIHRoZSBYTUwgZWxlbWVudCwgdG8gcG9wdWxhdGUgdGhlIG5ldyBvbmVcclxuICAgICAgICAvLyAqIFJlcGxhY2UgdGhlIFhNTCBlbGVtZW50IHdpdGggdGhlIG5ldyBvbmVcclxuICAgICAgICBwZW5kaW5nLmZvckVhY2goZWxlbWVudCA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVsZW1lbnROYW1lID0gZWxlbWVudC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBsZXQgbmV3RWxlbWVudCAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgICAgIGxldCBjb250ZXh0ICAgICA9IHtcclxuICAgICAgICAgICAgICAgIHhtbEVsZW1lbnQ6IGVsZW1lbnQsXHJcbiAgICAgICAgICAgICAgICBuZXdFbGVtZW50OiBuZXdFbGVtZW50XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBuZXdFbGVtZW50LmRhdGFzZXRbJ3R5cGUnXSA9IGVsZW1lbnROYW1lO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgdGhlIGVsZW1lbnQgaXMgdm94IGhpbnRhYmxlLCBhZGQgdGhlIHZveCBoaW50XHJcbiAgICAgICAgICAgIGlmICggZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ3ZveCcpIClcclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQuZGF0YXNldFsndm94J10gPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgndm94JykhO1xyXG5cclxuICAgICAgICAgICAgLy8gSSB3YW50ZWQgdG8gdXNlIGFuIGluZGV4IG9uIEVsZW1lbnRQcm9jZXNzb3JzIGZvciB0aGlzLCBidXQgaXQgY2F1c2VkIGV2ZXJ5XHJcbiAgICAgICAgICAgIC8vIHByb2Nlc3NvciB0byBoYXZlIGFuIFwidW51c2VkIG1ldGhvZFwiIHdhcm5pbmcuXHJcbiAgICAgICAgICAgIHN3aXRjaCAoZWxlbWVudE5hbWUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgRWxlbWVudFByb2Nlc3NvcnMuY29hY2goY29udGV4dCk7ICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnZXhjdXNlJzogICAgICBFbGVtZW50UHJvY2Vzc29ycy5leGN1c2UoY29udGV4dCk7ICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLmludGVnZXIoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ25hbWVkJzogICAgICAgRWxlbWVudFByb2Nlc3NvcnMubmFtZWQoY29udGV4dCk7ICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGhyYXNlJzogICAgICBFbGVtZW50UHJvY2Vzc29ycy5waHJhc2UoY29udGV4dCk7ICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2VzZXQnOiAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZXNldChjb250ZXh0KTsgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BsYXRmb3JtJzogICAgRWxlbWVudFByb2Nlc3NvcnMucGxhdGZvcm0oY29udGV4dCk7ICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc2VydmljZSc6ICAgICBFbGVtZW50UHJvY2Vzc29ycy5zZXJ2aWNlKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnN0YXRpb24oY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbmxpc3QoY29udGV4dCk7IGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAndGltZSc6ICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy50aW1lKGNvbnRleHQpOyAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICd2b3gnOiAgICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnZveChjb250ZXh0KTsgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6ICAgICAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudW5rbm93bihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUmVjdXJzZSBzbyB0aGF0IHdlIGNhbiBleHBhbmQgYW55IG5ldyBlbGVtZW50c1xyXG4gICAgICAgIGlmIChsZXZlbCA8IDIwKVxyXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGFpbmVyLCBsZXZlbCArIDEpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUEhSQVNFUl9UT09fUkVDVVJTSVZFKCkgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgY2xhc3MgZm9yIHJlc29sdmluZyBhIGdpdmVuIHBocmFzZSB0byB2b3gga2V5cyAqL1xyXG5jbGFzcyBSZXNvbHZlclxyXG57XHJcbiAgICAvKiogVHJlZVdhbGtlciBmaWx0ZXIgdG8gcmVkdWNlIGEgd2FsayB0byBqdXN0IHRoZSBlbGVtZW50cyB0aGUgcmVzb2x2ZXIgbmVlZHMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSk6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgICAgID0gbm9kZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgcGFyZW50VHlwZSA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghcGFyZW50VHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCAgICAgPSBwYXJlbnQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHBhcmVudFR5cGUgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQWNjZXB0IHRleHQgb25seSBmcm9tIHBocmFzZSBhbmQgcGhyYXNlc2V0c1xyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICBpZiAocGFyZW50VHlwZSAhPT0gJ3BocmFzZXNldCcgJiYgcGFyZW50VHlwZSAhPT0gJ3BocmFzZScpXHJcbiAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG5cclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5vZGUgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgICAgICAvLyBSZWplY3QgY29sbGFwc2VkIGVsZW1lbnRzIGFuZCB0aGVpciBjaGlsZHJlblxyXG4gICAgICAgICAgICBpZiAoIGVsZW1lbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCB0eXBlbGVzcyAod3JhcHBlcikgZWxlbWVudHNcclxuICAgICAgICAgICAgaWYgKCF0eXBlKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIG92ZXIgcGhyYXNlIGFuZCBwaHJhc2VzZXRzIChpbnN0ZWFkLCBvbmx5IGdvaW5nIGZvciB0aGVpciBjaGlsZHJlbilcclxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnIHx8IHR5cGUgPT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGhyYXNlICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHJpdmF0ZSBmbGF0dGVuZWQgOiBOb2RlW107XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlZCAgOiBWb3hLZXlbXTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGhyYXNlOiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnBocmFzZSAgICA9IHBocmFzZTtcclxuICAgICAgICB0aGlzLmZsYXR0ZW5lZCA9IFtdO1xyXG4gICAgICAgIHRoaXMucmVzb2x2ZWQgID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHRvVm94KCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIC8vIEZpcnN0LCB3YWxrIHRocm91Z2ggdGhlIHBocmFzZSBhbmQgXCJmbGF0dGVuXCIgaXQgaW50byBhbiBhcnJheSBvZiBwYXJ0cy4gVGhpcyBpc1xyXG4gICAgICAgIC8vIHNvIHRoZSByZXNvbHZlciBjYW4gbG9vay1haGVhZCBvciBsb29rLWJlaGluZC5cclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQgPSBbXTtcclxuICAgICAgICB0aGlzLnJlc29sdmVkICA9IFtdO1xyXG4gICAgICAgIGxldCB0cmVlV2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgdGhpcy5waHJhc2UsXHJcbiAgICAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19URVhUIHwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogUmVzb2x2ZXIubm9kZUZpbHRlciB9LFxyXG4gICAgICAgICAgICBmYWxzZVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHdoaWxlICggdHJlZVdhbGtlci5uZXh0Tm9kZSgpIClcclxuICAgICAgICBpZiAodHJlZVdhbGtlci5jdXJyZW50Tm9kZS50ZXh0Q29udGVudCEudHJpbSgpICE9PSAnJylcclxuICAgICAgICAgICAgdGhpcy5mbGF0dGVuZWQucHVzaCh0cmVlV2Fsa2VyLmN1cnJlbnROb2RlKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgcmVzb2x2ZSBhbGwgdGhlIHBocmFzZXMnIG5vZGVzIGludG8gdm94IGtleXNcclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQuZm9yRWFjaCggKHYsIGkpID0+IHRoaXMucmVzb2x2ZWQucHVzaCggLi4udGhpcy5yZXNvbHZlKHYsIGkpICkgKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5mbGF0dGVuZWQsIHRoaXMucmVzb2x2ZWQpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXNlcyB0aGUgdHlwZSBhbmQgdmFsdWUgb2YgdGhlIGdpdmVuIG5vZGUsIHRvIHJlc29sdmUgaXQgdG8gdm94IGZpbGUgSURzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBub2RlIE5vZGUgdG8gcmVzb2x2ZSB0byB2b3ggSURzXHJcbiAgICAgKiBAcGFyYW0gaWR4IEluZGV4IG9mIHRoZSBub2RlIGJlaW5nIHJlc29sdmVkIHJlbGF0aXZlIHRvIHRoZSBwaHJhc2UgYXJyYXlcclxuICAgICAqIEByZXR1cm5zIEFycmF5IG9mIElEcyB0aGF0IG1ha2UgdXAgb25lIG9yIG1vcmUgZmlsZSBJRHMuIENhbiBiZSBlbXB0eS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlKG5vZGU6IE5vZGUsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlVGV4dChub2RlKTtcclxuXHJcbiAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUNvYWNoKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ2V4Y3VzZSc6ICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUV4Y3VzZShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVJbnRlZ2VyKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICduYW1lZCc6ICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVOYW1lZCgpO1xyXG4gICAgICAgICAgICBjYXNlICdwbGF0Zm9ybSc6ICAgIHJldHVybiB0aGlzLnJlc29sdmVQbGF0Zm9ybShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTZXJ2aWNlKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTdGF0aW9uKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogcmV0dXJuIHRoaXMucmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3RpbWUnOiAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRpbWUoZWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3ZveCc6ICAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVZveChlbGVtZW50KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEluZmxlY3Rpb24oaWR4OiBudW1iZXIpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5leHQgPSB0aGlzLmZsYXR0ZW5lZFtpZHggKyAxXTtcclxuXHJcbiAgICAgICAgcmV0dXJuICggbmV4dCAmJiBuZXh0LnRleHRDb250ZW50IS50cmltKCkuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgPyAnZW5kJ1xyXG4gICAgICAgICAgICA6ICdtaWQnO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVRleHQobm9kZTogTm9kZSkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBub2RlLnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCB0eXBlICAgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIGxldCB0ZXh0ICAgPSBTdHJpbmdzLmNsZWFuKG5vZGUudGV4dENvbnRlbnQhKTtcclxuICAgICAgICBsZXQgc2V0ICAgID0gW107XHJcblxyXG4gICAgICAgIC8vIElmIHRleHQgaXMganVzdCBhIGZ1bGwgc3RvcCwgcmV0dXJuIHNpbGVuY2VcclxuICAgICAgICBpZiAodGV4dCA9PT0gJy4nKVxyXG4gICAgICAgICAgICByZXR1cm4gWzAuNjVdO1xyXG5cclxuICAgICAgICAvLyBJZiBpdCBiZWdpbnMgd2l0aCBhIGZ1bGwgc3RvcCwgYWRkIHNpbGVuY2VcclxuICAgICAgICBpZiAoIHRleHQuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgc2V0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSB0ZXh0IGRvZXNuJ3QgY29udGFpbiBhbnkgd29yZHMsIHNraXBcclxuICAgICAgICBpZiAoICF0ZXh0Lm1hdGNoKC9bYS16MC05XS9pKSApXHJcbiAgICAgICAgICAgIHJldHVybiBzZXQ7XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghdHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICAgICAgdHlwZSAgID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCByZWYgPSBwYXJlbnQuZGF0YXNldFsncmVmJ107XHJcbiAgICAgICAgbGV0IGlkeCA9IERPTS5ub2RlSW5kZXhPZihub2RlKTtcclxuICAgICAgICBsZXQgaWQgID0gYCR7dHlwZX0uJHtyZWZ9YDtcclxuXHJcbiAgICAgICAgLy8gQXBwZW5kIGluZGV4IG9mIHBocmFzZXNldCdzIGNob2ljZSBvZiBwaHJhc2VcclxuICAgICAgICBpZiAodHlwZSA9PT0gJ3BocmFzZXNldCcpXHJcbiAgICAgICAgICAgIGlkICs9IGAuJHtwYXJlbnQuZGF0YXNldFsnaWR4J119YDtcclxuXHJcbiAgICAgICAgaWQgKz0gYC4ke2lkeH1gO1xyXG4gICAgICAgIHNldC5wdXNoKGlkKTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGV4dCBlbmRzIHdpdGggYSBmdWxsIHN0b3AsIGFkZCBzaWxlbmNlXHJcbiAgICAgICAgaWYgKCB0ZXh0LmVuZHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICBzZXQucHVzaCgwLjY1KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHNldDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVDb2FjaChlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgY29hY2ggICA9IFJBRy5zdGF0ZS5nZXRDb2FjaChjdHgpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgPSBbMC4yLCBgbGV0dGVyLiR7Y29hY2h9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUV4Y3VzZShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBleGN1c2UgID0gUkFHLnN0YXRlLmV4Y3VzZTtcclxuICAgICAgICBsZXQga2V5ICAgICA9IFN0cmluZ3MuZmlsZW5hbWUoZXhjdXNlKTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMTUsIGBleGN1c2UuJHtrZXl9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUludGVnZXIoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHNpbmd1bGFyID0gZWxlbWVudC5kYXRhc2V0WydzaW5ndWxhciddO1xyXG4gICAgICAgIGxldCBwbHVyYWwgICA9IGVsZW1lbnQuZGF0YXNldFsncGx1cmFsJ107XHJcbiAgICAgICAgbGV0IGludGVnZXIgID0gUkFHLnN0YXRlLmdldEludGVnZXIoY3R4KTtcclxuICAgICAgICBsZXQgcGFydHMgICAgPSBbMC4xMjUsIGBudW1iZXIuJHtpbnRlZ2VyfS5taWRgXTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoc2luZ3VsYXIgJiYgaW50ZWdlciA9PT0gMSlcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjE1LCBgbnVtYmVyLnN1ZmZpeC4ke3Npbmd1bGFyfS5lbmRgKTtcclxuICAgICAgICBlbHNlIGlmIChwbHVyYWwgICAmJiBpbnRlZ2VyICE9PSAxKVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMTUsIGBudW1iZXIuc3VmZml4LiR7cGx1cmFsfS5lbmRgKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4xNSk7XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJ0cztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVOYW1lZCgpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgbmFtZWQgPSBTdHJpbmdzLmZpbGVuYW1lKFJBRy5zdGF0ZS5uYW1lZCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbMC4yLCBgbmFtZWQuJHtuYW1lZH0ubWlkYCwgMC4yXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVQbGF0Zm9ybShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA9IFJBRy5zdGF0ZS5wbGF0Zm9ybTtcclxuICAgICAgICBsZXQgaW5mbGVjdCAgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgbGV0dGVyICAgPSAocGxhdGZvcm1bMV0gPT09ICfCvicpID8gJ00nIDogcGxhdGZvcm1bMV07XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgID0gWzAuMTUsIGBudW1iZXIuJHtwbGF0Zm9ybVswXX0ke2xldHRlcn0uJHtpbmZsZWN0fWBdO1xyXG5cclxuICAgICAgICBpZiAoaW5mbGVjdCA9PT0gJ21pZCcpXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuMik7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlU2VydmljZShlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzZXJ2aWNlID0gU3RyaW5ncy5maWxlbmFtZSggUkFHLnN0YXRlLmdldFNlcnZpY2UoY3R4KSApO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gW107XHJcblxyXG4gICAgICAgIC8vIE9ubHkgYWRkIGJlZ2lubmluZyBkZWxheSBpZiB0aGVyZSBpc24ndCBhbHJlYWR5IG9uZSBwcmlvclxyXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5yZXNvbHZlZC5zbGljZSgtMSlbMF0gIT09ICdudW1iZXInKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjEpO1xyXG5cclxuICAgICAgICByZXR1cm4gWy4uLnJlc3VsdCwgYHNlcnZpY2UuJHtzZXJ2aWNlfS5taWRgLCAwLjE1XTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVTdGF0aW9uKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gUkFHLnN0YXRlLmdldFN0YXRpb24oY3R4KTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMiwgYHN0YXRpb24uJHtzdGF0aW9ufS4ke2luZmxlY3R9YF07XHJcblxyXG4gICAgICAgIGlmIChpbmZsZWN0ID09PSAnbWlkJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4yKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVTdGF0aW9uTGlzdChlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgbGlzdCAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdChjdHgpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcblxyXG4gICAgICAgIGxldCBwYXJ0cyA6IFZveEtleVtdID0gWzAuMl07XHJcblxyXG4gICAgICAgIGxpc3QuZm9yRWFjaCggKHYsIGspID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBIYW5kbGUgbWlkZGxlIG9mIGxpc3QgaW5mbGVjdGlvblxyXG4gICAgICAgICAgICBpZiAoayAhPT0gbGlzdC5sZW5ndGggLSAxKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGBzdGF0aW9uLiR7dn0ubWlkYCwgMC4yNSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIEFkZCBcImFuZFwiIGlmIGxpc3QgaGFzIG1vcmUgdGhhbiAxIHN0YXRpb24gYW5kIHRoaXMgaXMgdGhlIGVuZFxyXG4gICAgICAgICAgICBpZiAobGlzdC5sZW5ndGggPiAxKVxyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaCgnc3RhdGlvbi5wYXJ0cy5hbmQubWlkJywgMC4yNSk7XHJcblxyXG4gICAgICAgICAgICAvLyBBZGQgXCJvbmx5XCIgaWYgb25seSBvbmUgc3RhdGlvbiBpbiB0aGUgY2FsbGluZyBsaXN0XHJcbiAgICAgICAgICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSAmJiBjdHggPT09ICdjYWxsaW5nJylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaChgc3RhdGlvbi4ke3Z9Lm1pZGApO1xyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaCgwLjIsICdzdGF0aW9uLnBhcnRzLm9ubHkuZW5kJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaChgc3RhdGlvbi4ke3Z9LiR7aW5mbGVjdH1gKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgMC4yXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVUaW1lKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCB0aW1lICA9IFJBRy5zdGF0ZS5nZXRUaW1lKGN0eCkuc3BsaXQoJzonKTtcclxuXHJcbiAgICAgICAgbGV0IHBhcnRzIDogVm94S2V5W10gPSBbMC4yXTtcclxuXHJcbiAgICAgICAgaWYgKHRpbWVbMF0gPT09ICcwMCcgJiYgdGltZVsxXSA9PT0gJzAwJylcclxuICAgICAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgJ251bWJlci4wMDAwLm1pZCcsIDAuMl07XHJcblxyXG4gICAgICAgIC8vIEhvdXJzXHJcbiAgICAgICAgcGFydHMucHVzaChgbnVtYmVyLiR7dGltZVswXX0uYmVnaW5gKTtcclxuXHJcbiAgICAgICAgaWYgKHRpbWVbMV0gPT09ICcwMCcpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4wNzUsICdudW1iZXIuaHVuZHJlZC5taWQnKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4yLCBgbnVtYmVyLiR7dGltZVsxXX0ubWlkYCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbLi4ucGFydHMsIDAuMTVdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVZveChlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCB0ZXh0ICAgPSBlbGVtZW50LmlubmVyVGV4dC50cmltKCk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IFtdO1xyXG5cclxuICAgICAgICBpZiAoIHRleHQuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIHJlc3VsdC5wdXNoKCBlbGVtZW50LmRhdGFzZXRbJ2tleSddISApO1xyXG5cclxuICAgICAgICBpZiAoIHRleHQuZW5kc1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuNjUpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBzcGVlY2ggc3ludGhlc2lzIHVzaW5nIGJvdGggbmF0aXZlIGFuZCBjdXN0b20gZW5naW5lcyAqL1xyXG5jbGFzcyBTcGVlY2hcclxue1xyXG4gICAgLyoqIEluc3RhbmNlIG9mIHRoZSBjdXN0b20gdm9pY2UgZW5naW5lICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHZveEVuZ2luZT8gOiBWb3hFbmdpbmU7XHJcblxyXG4gICAgLyoqIEFycmF5IG9mIGJyb3dzZXItcHJvdmlkZWQgdm9pY2VzIGF2YWlsYWJsZSAqL1xyXG4gICAgcHVibGljICBicm93c2VyVm9pY2VzIDogU3BlZWNoU3ludGhlc2lzVm9pY2VbXSA9IFtdO1xyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGhhcyBlbmRlZCAqL1xyXG4gICAgcHVibGljICBvbnN0b3A/ICAgICAgIDogKCkgPT4gdm9pZDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG5hdGl2ZSBzcGVlY2gtc3RvcHBlZCBjaGVjayB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSBzdG9wVGltZXIgICAgIDogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFNvbWUgYnJvd3NlcnMgZG9uJ3QgcHJvcGVybHkgY2FuY2VsIHNwZWVjaCBvbiBwYWdlIGNsb3NlLlxyXG4gICAgICAgIC8vIEJVRzogb25wYWdlc2hvdyBhbmQgb25wYWdlaGlkZSBub3Qgd29ya2luZyBvbiBpT1MgMTFcclxuICAgICAgICB3aW5kb3cub25iZWZvcmV1bmxvYWQgPVxyXG4gICAgICAgIHdpbmRvdy5vbnVubG9hZCAgICAgICA9XHJcbiAgICAgICAgd2luZG93Lm9ucGFnZXNob3cgICAgID1cclxuICAgICAgICB3aW5kb3cub25wYWdlaGlkZSAgICAgPSB0aGlzLnN0b3AuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQub252aXNpYmlsaXR5Y2hhbmdlICAgICAgICAgICAgPSB0aGlzLm9uVmlzaWJpbGl0eUNoYW5nZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMub252b2ljZXNjaGFuZ2VkID0gdGhpcy5vblZvaWNlc0NoYW5nZWQuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gRXZlbiB0aG91Z2ggJ29udm9pY2VzY2hhbmdlZCcgaXMgdXNlZCBsYXRlciB0byBwb3B1bGF0ZSB0aGUgbGlzdCwgQ2hyb21lIGRvZXNcclxuICAgICAgICAvLyBub3QgYWN0dWFsbHkgZmlyZSB0aGUgZXZlbnQgdW50aWwgdGhpcyBjYWxsLi4uXHJcbiAgICAgICAgdGhpcy5vblZvaWNlc0NoYW5nZWQoKTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTWFrZSB0aGlzIGEgZHluYW1pYyByZWdpc3RyYXRpb24gYW5kIGNoZWNrIGZvciBmZWF0dXJlc1xyXG4gICAgICAgIHRoaXMudm94RW5naW5lID0gVm94RW5naW5lLmdldEluc3RhbmNlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBzcGVha2luZyB0aGUgZ2l2ZW4gcGhyYXNlIGNvbXBvbmVudHMgKi9cclxuICAgIHB1YmxpYyBzcGVhayhwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MgPSB7fSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKCB0aGlzLnZveEVuZ2luZSAmJiBlaXRoZXIoc2V0dGluZ3MudXNlVm94LCBSQUcuY29uZmlnLnZveEVuYWJsZWQpIClcclxuICAgICAgICAgICAgdGhpcy5zcGVha1ZveChwaHJhc2UsIHNldHRpbmdzKTtcclxuICAgICAgICBlbHNlIGlmICh3aW5kb3cuc3BlZWNoU3ludGhlc2lzKVxyXG4gICAgICAgICAgICB0aGlzLnNwZWFrQnJvd3NlcihwaHJhc2UsIHNldHRpbmdzKTtcclxuICAgICAgICBlbHNlIGlmICh0aGlzLm9uc3RvcClcclxuICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3RvcHMgYW5kIGNhbmNlbHMgYWxsIHF1ZXVlZCBzcGVlY2ggKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVE9ETzogQ2hlY2sgZm9yIHNwZWVjaCBzeW50aGVzaXNcclxuXHJcbiAgICAgICAgaWYgKHdpbmRvdy5zcGVlY2hTeW50aGVzaXMpXHJcbiAgICAgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuY2FuY2VsKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnZveEVuZ2luZSlcclxuICAgICAgICAgICAgdGhpcy52b3hFbmdpbmUuc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQYXVzZSBhbmQgdW5wYXVzZSBzcGVlY2ggaWYgdGhlIHBhZ2UgaXMgaGlkZGVuIG9yIHVuaGlkZGVuICovXHJcbiAgICBwcml2YXRlIG9uVmlzaWJpbGl0eUNoYW5nZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBoaWRpbmcgPSAoZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSAnaGlkZGVuJyk7XHJcblxyXG4gICAgICAgIGlmIChoaWRpbmcpIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMucGF1c2UoKTtcclxuICAgICAgICBlbHNlICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnJlc3VtZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGFzeW5jIHZvaWNlIGxpc3QgbG9hZGluZyBvbiBzb21lIGJyb3dzZXJzLCBhbmQgc2V0cyBkZWZhdWx0ICovXHJcbiAgICBwcml2YXRlIG9uVm9pY2VzQ2hhbmdlZCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuYnJvd3NlclZvaWNlcyA9IHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuZ2V0Vm9pY2VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb252ZXJ0cyB0aGUgZ2l2ZW4gcGhyYXNlIHRvIHRleHQgYW5kIHNwZWFrcyBpdCB2aWEgbmF0aXZlIGJyb3dzZXIgdm9pY2VzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwaHJhc2UgUGhyYXNlIGVsZW1lbnRzIHRvIHNwZWFrXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgU2V0dGluZ3MgdG8gdXNlIGZvciB0aGUgdm9pY2VcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzcGVha0Jyb3dzZXIocGhyYXNlOiBIVE1MRWxlbWVudCwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBSZXNldCB0byBmaXJzdCB2b2ljZSwgaWYgY29uZmlndXJlZCBjaG9pY2UgaXMgbWlzc2luZ1xyXG4gICAgICAgIGxldCB2b2ljZUlkeCA9IGVpdGhlcihzZXR0aW5ncy52b2ljZUlkeCwgUkFHLmNvbmZpZy5zcGVlY2hWb2ljZSk7XHJcbiAgICAgICAgbGV0IHZvaWNlICAgID0gdGhpcy5icm93c2VyVm9pY2VzW3ZvaWNlSWR4XSB8fCB0aGlzLmJyb3dzZXJWb2ljZXNbMF07XHJcblxyXG4gICAgICAgIC8vIFRoZSBwaHJhc2UgdGV4dCBpcyBzcGxpdCBpbnRvIHNlbnRlbmNlcywgYXMgcXVldWVpbmcgbGFyZ2Ugc2VudGVuY2VzIHRoYXQgbGFzdFxyXG4gICAgICAgIC8vIG1hbnkgc2Vjb25kcyBjYW4gYnJlYWsgc29tZSBUVFMgZW5naW5lcyBhbmQgYnJvd3NlcnMuXHJcbiAgICAgICAgbGV0IHRleHQgID0gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dChwaHJhc2UpO1xyXG4gICAgICAgIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoL1xcLlxccy9pKTtcclxuXHJcbiAgICAgICAgcGFydHMuZm9yRWFjaCggKHNlZ21lbnQsIGlkeCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEFkZCBtaXNzaW5nIGZ1bGwgc3RvcCB0byBlYWNoIHNlbnRlbmNlIGV4Y2VwdCB0aGUgbGFzdCwgd2hpY2ggaGFzIGl0XHJcbiAgICAgICAgICAgIGlmIChpZHggPCBwYXJ0cy5sZW5ndGggLSAxKVxyXG4gICAgICAgICAgICAgICAgc2VnbWVudCArPSAnLic7XHJcblxyXG4gICAgICAgICAgICBsZXQgdXR0ZXJhbmNlID0gbmV3IFNwZWVjaFN5bnRoZXNpc1V0dGVyYW5jZShzZWdtZW50KTtcclxuXHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS52b2ljZSAgPSB2b2ljZTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnZvbHVtZSA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsIFJBRy5jb25maWcuc3BlZWNoVm9sKTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnBpdGNoICA9IGVpdGhlcihzZXR0aW5ncy5waXRjaCwgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2gpO1xyXG4gICAgICAgICAgICB1dHRlcmFuY2UucmF0ZSAgID0gZWl0aGVyKHNldHRpbmdzLnJhdGUsICAgUkFHLmNvbmZpZy5zcGVlY2hSYXRlKTtcclxuXHJcbiAgICAgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuc3BlYWsodXR0ZXJhbmNlKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gVGhpcyBjaGVja3MgZm9yIHdoZW4gdGhlIG5hdGl2ZSBlbmdpbmUgaGFzIHN0b3BwZWQgc3BlYWtpbmcsIGFuZCBjYWxscyB0aGVcclxuICAgICAgICAvLyBvbnN0b3AgZXZlbnQgaGFuZGxlci4gSSBjb3VsZCB1c2UgU3BlZWNoU3ludGhlc2lzLm9uZW5kIGluc3RlYWQsIGJ1dCBpdCB3YXNcclxuICAgICAgICAvLyBmb3VuZCB0byBiZSB1bnJlbGlhYmxlLCBzbyBJIGhhdmUgdG8gcG9sbCB0aGUgc3BlYWtpbmcgcHJvcGVydHkgdGhpcyB3YXkuXHJcbiAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLnN0b3BUaW1lcik7XHJcblxyXG4gICAgICAgIHRoaXMuc3RvcFRpbWVyID0gc2V0SW50ZXJ2YWwoKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmICh3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFraW5nKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLnN0b3BUaW1lcik7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vbnN0b3ApXHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgICAgIH0sIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTeW50aGVzaXplcyB2b2ljZSBieSB3YWxraW5nIHRocm91Z2ggdGhlIGdpdmVuIHBocmFzZSBlbGVtZW50cywgcmVzb2x2aW5nIHBhcnRzIHRvXHJcbiAgICAgKiBzb3VuZCBmaWxlIElEcywgYW5kIGZlZWRpbmcgdGhlIGVudGlyZSBhcnJheSB0byB0aGUgdm94IGVuZ2luZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGhyYXNlIFBocmFzZSBlbGVtZW50cyB0byBzcGVha1xyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFNldHRpbmdzIHRvIHVzZSBmb3IgdGhlIHZvaWNlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3BlYWtWb3gocGhyYXNlOiBIVE1MRWxlbWVudCwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzb2x2ZXIgPSBuZXcgUmVzb2x2ZXIocGhyYXNlKTtcclxuICAgICAgICBsZXQgdm94UGF0aCAgPSBSQUcuY29uZmlnLnZveFBhdGggfHwgUkFHLmNvbmZpZy52b3hDdXN0b21QYXRoO1xyXG5cclxuICAgICAgICB0aGlzLnZveEVuZ2luZSEub25zdG9wID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMudm94RW5naW5lIS5vbnN0b3AgPSB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vbnN0b3ApXHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IHNldHRpbmdzIGZyb20gY29uZmlnIGhlcmUsIHRvIGtlZXAgVk9YIGVuZ2luZSBkZWNvdXBsZWQgZnJvbSBSQUdcclxuICAgICAgICBzZXR0aW5ncy52b3hQYXRoICAgPSBlaXRoZXIoc2V0dGluZ3Mudm94UGF0aCwgICB2b3hQYXRoKTtcclxuICAgICAgICBzZXR0aW5ncy52b3hSZXZlcmIgPSBlaXRoZXIoc2V0dGluZ3Mudm94UmV2ZXJiLCBSQUcuY29uZmlnLnZveFJldmVyYik7XHJcbiAgICAgICAgc2V0dGluZ3Mudm94Q2hpbWUgID0gZWl0aGVyKHNldHRpbmdzLnZveENoaW1lLCAgUkFHLmNvbmZpZy52b3hDaGltZSk7XHJcbiAgICAgICAgc2V0dGluZ3Mudm9sdW1lICAgID0gZWl0aGVyKHNldHRpbmdzLnZvbHVtZSwgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2wpO1xyXG4gICAgICAgIHNldHRpbmdzLnJhdGUgICAgICA9IGVpdGhlcihzZXR0aW5ncy5yYXRlLCAgICAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSk7XHJcblxyXG4gICAgICAgIHRoaXMudm94RW5naW5lIS5zcGVhayhyZXNvbHZlci50b1ZveCgpLCBzZXR0aW5ncyk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cblxuLyoqIFR5cGUgZGVmaW5pdGlvbiBmb3Igc3BlZWNoIGNvbmZpZyBvdmVycmlkZXMgcGFzc2VkIHRvIHRoZSBzcGVhayBtZXRob2QgKi9cbmludGVyZmFjZSBTcGVlY2hTZXR0aW5nc1xue1xuICAgIC8qKiBXaGV0aGVyIHRvIGZvcmNlIHVzZSBvZiB0aGUgVk9YIGVuZ2luZSAqL1xuICAgIHVzZVZveD8gICAgOiBib29sZWFuO1xuICAgIC8qKiBPdmVycmlkZSBhYnNvbHV0ZSBvciByZWxhdGl2ZSBVUkwgb2YgVk9YIHZvaWNlIHRvIHVzZSAqL1xuICAgIHZveFBhdGg/ICAgOiBzdHJpbmc7XG4gICAgLyoqIE92ZXJyaWRlIGNob2ljZSBvZiByZXZlcmIgdG8gdXNlICovXG4gICAgdm94UmV2ZXJiPyA6IHN0cmluZztcbiAgICAvKiogT3ZlcnJpZGUgY2hvaWNlIG9mIGNoaW1lIHRvIHVzZSAqL1xuICAgIHZveENoaW1lPyAgOiBzdHJpbmc7XG4gICAgLyoqIE92ZXJyaWRlIGNob2ljZSBvZiB2b2ljZSAqL1xuICAgIHZvaWNlSWR4PyAgOiBudW1iZXI7XG4gICAgLyoqIE92ZXJyaWRlIHZvbHVtZSBvZiB2b2ljZSAqL1xuICAgIHZvbHVtZT8gICAgOiBudW1iZXI7XG4gICAgLyoqIE92ZXJyaWRlIHBpdGNoIG9mIHZvaWNlICovXG4gICAgcGl0Y2g/ICAgICA6IG51bWJlcjtcbiAgICAvKiogT3ZlcnJpZGUgcmF0ZSBvZiB2b2ljZSAqL1xuICAgIHJhdGU/ICAgICAgOiBudW1iZXI7XG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG50eXBlIFZveEtleSA9IHN0cmluZyB8IG51bWJlcjtcclxuXHJcbi8qKiBTeW50aGVzaXplcyBzcGVlY2ggYnkgZHluYW1pY2FsbHkgbG9hZGluZyBhbmQgcGllY2luZyB0b2dldGhlciB2b2ljZSBmaWxlcyAqL1xyXG5jbGFzcyBWb3hFbmdpbmVcclxue1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2UgOiBWb3hFbmdpbmU7XHJcblxyXG4gICAgcHVibGljIHN0YXRpYyBnZXRJbnN0YW5jZShkYXRhUGF0aDogc3RyaW5nICA9ICdkYXRhL3ZveCcpIDogVm94RW5naW5lIHwgdW5kZWZpbmVkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKFZveEVuZ2luZS5pbnN0YW5jZSlcclxuICAgICAgICAgICAgcmV0dXJuIFZveEVuZ2luZS5pbnN0YW5jZTtcclxuXHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBWb3hFbmdpbmUuaW5zdGFuY2UgPSAgbmV3IFZveEVuZ2luZShkYXRhUGF0aCk7XHJcbiAgICAgICAgICAgIHJldHVybiBWb3hFbmdpbmUuaW5zdGFuY2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBUT0RPOiBMb2NhbGl6ZVxyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdDb3VsZCBub3QgY3JlYXRlIGEgVk9YIGVuZ2luZSBpbnN0YW5jZTonLCBlcnIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBUaGUgY29yZSBhdWRpbyBjb250ZXh0IHRoYXQgaGFuZGxlcyBhdWRpbyBlZmZlY3RzIGFuZCBwbGF5YmFjayAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBhdWRpb0NvbnRleHQgOiBBdWRpb0NvbnRleHQ7XHJcbiAgICAvKiogQXVkaW8gbm9kZSB0aGF0IGFtcGxpZmllcyBvciBhdHRlbnVhdGVzIHZvaWNlICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGdhaW5Ob2RlICAgICA6IEdhaW5Ob2RlO1xyXG4gICAgLyoqIEF1ZGlvIG5vZGUgdGhhdCBhcHBsaWVzIHRoZSB0YW5ub3kgZmlsdGVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGZpbHRlck5vZGUgICA6IEJpcXVhZEZpbHRlck5vZGU7XHJcbiAgICAvKiogQXVkaW8gbm9kZSB0aGF0IGFkZHMgYSByZXZlcmIgdG8gdGhlIHZvaWNlLCBpZiBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmV2ZXJiTm9kZSAgIDogQ29udm9sdmVyTm9kZTtcclxuICAgIC8qKiBDYWNoZSBvZiBpbXB1bHNlIHJlc3BvbnNlcyBhdWRpbyBkYXRhLCBmb3IgcmV2ZXJiICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGltcHVsc2VzICAgICA6IERpY3Rpb25hcnk8QXVkaW9CdWZmZXI+ID0ge307XHJcbiAgICAvKiogUmVsYXRpdmUgcGF0aCB0byBmZXRjaCBpbXB1bHNlIHJlc3BvbnNlIGFuZCBjaGltZSBmaWxlcyBmcm9tICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRhdGFQYXRoICAgICA6IHN0cmluZztcclxuXHJcbiAgICAvKiogRXZlbnQgaGFuZGxlciBmb3Igd2hlbiBzcGVlY2ggaGFzIGVuZGVkICovXHJcbiAgICBwdWJsaWMgIG9uc3RvcD8gICAgICAgICAgOiAoKSA9PiB2b2lkO1xyXG4gICAgLyoqIFdoZXRoZXIgdGhpcyBlbmdpbmUgaXMgY3VycmVudGx5IHJ1bm5pbmcgYW5kIHNwZWFraW5nICovXHJcbiAgICBwcml2YXRlIGlzU3BlYWtpbmcgICAgICAgOiBib29sZWFuICAgICAgPSBmYWxzZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgbnVtYmVyIGZvciB0aGUgY3VycmVudCBwdW1wIHRpbWVyICovXHJcbiAgICBwcml2YXRlIHB1bXBUaW1lciAgICAgICAgOiBudW1iZXIgICAgICAgPSAwO1xyXG4gICAgLyoqIFRyYWNrcyB0aGUgYXVkaW8gY29udGV4dCdzIHdhbGwtY2xvY2sgdGltZSB0byBzY2hlZHVsZSBuZXh0IGNsaXAgKi9cclxuICAgIHByaXZhdGUgbmV4dEJlZ2luICAgICAgICA6IG51bWJlciAgICAgICA9IDA7XHJcbiAgICAvKiogUmVmZXJlbmNlcyB0byBjdXJyZW50bHkgcGVuZGluZyByZXF1ZXN0cywgYXMgYSBGSUZPIHF1ZXVlICovXHJcbiAgICBwcml2YXRlIHBlbmRpbmdSZXFzICAgICAgOiBWb3hSZXF1ZXN0W10gPSBbXTtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGN1cnJlbnRseSBzY2hlZHVsZWQgYXVkaW8gYnVmZmVycyAqL1xyXG4gICAgcHJpdmF0ZSBzY2hlZHVsZWRCdWZmZXJzIDogQXVkaW9CdWZmZXJTb3VyY2VOb2RlW10gPSBbXTtcclxuICAgIC8qKiBMaXN0IG9mIHZveCBJRHMgY3VycmVudGx5IGJlaW5nIHJ1biB0aHJvdWdoICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRJZHM/ICAgICAgOiBWb3hLZXlbXTtcclxuICAgIC8qKiBTcGVlY2ggc2V0dGluZ3MgY3VycmVudGx5IGJlaW5nIHVzZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFNldHRpbmdzPyA6IFNwZWVjaFNldHRpbmdzO1xyXG5cclxuICAgIHByaXZhdGUgY29uc3RydWN0b3IoZGF0YVBhdGg6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICAvLyBTZXR1cCB0aGUgY29yZSBhdWRpbyBjb250ZXh0XHJcblxyXG4gICAgICAgIGlmICAgICAgKEF1ZGlvQ29udGV4dCkgICAgICAgdGhpcy5hdWRpb0NvbnRleHQgPSBuZXcgQXVkaW9Db250ZXh0KCk7XHJcbiAgICAgICAgZWxzZSBpZiAod2Via2l0QXVkaW9Db250ZXh0KSB0aGlzLmF1ZGlvQ29udGV4dCA9IG5ldyB3ZWJraXRBdWRpb0NvbnRleHQoKTtcclxuICAgICAgICBlbHNlICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9Db250ZXh0ID0gbmV3IG1vekF1ZGlvQ29udGV4dCgpO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuYXVkaW9Db250ZXh0KVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBnZXQgYXVkaW8gY29udGV4dCcpO1xyXG5cclxuICAgICAgICAvLyBTZXR1cCBub2Rlc1xyXG5cclxuICAgICAgICB0aGlzLmRhdGFQYXRoICAgPSBkYXRhUGF0aDtcclxuICAgICAgICB0aGlzLmdhaW5Ob2RlICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XHJcbiAgICAgICAgdGhpcy5yZXZlcmJOb2RlID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQ29udm9sdmVyKCk7XHJcblxyXG4gICAgICAgIHRoaXMucmV2ZXJiTm9kZS5idWZmZXIgICAgPSB0aGlzLmltcHVsc2VzWycnXTtcclxuICAgICAgICB0aGlzLnJldmVyYk5vZGUubm9ybWFsaXplID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmZpbHRlck5vZGUudHlwZSAgICAgID0gJ2hpZ2hwYXNzJztcclxuICAgICAgICB0aGlzLmZpbHRlck5vZGUuUS52YWx1ZSAgID0gMC40O1xyXG5cclxuICAgICAgICB0aGlzLmdhaW5Ob2RlLmNvbm5lY3QodGhpcy5maWx0ZXJOb2RlKTtcclxuICAgICAgICAvLyBSZXN0IG9mIG5vZGVzIGdldCBjb25uZWN0ZWQgd2hlbiBzcGVhayBpcyBjYWxsZWRcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEJlZ2lucyBsb2FkaW5nIGFuZCBzcGVha2luZyBhIHNldCBvZiB2b3ggZmlsZXMuIFN0b3BzIGFueSBzcGVlY2guXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkcyBMaXN0IG9mIHZveCBpZHMgdG8gbG9hZCBhcyBmaWxlcywgaW4gc3BlYWtpbmcgb3JkZXJcclxuICAgICAqIEBwYXJhbSBzZXR0aW5ncyBWb2ljZSBzZXR0aW5ncyB0byB1c2VcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNwZWFrKGlkczogVm94S2V5W10sIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFNQRUFLOicsIGlkcywgc2V0dGluZ3MpO1xyXG5cclxuICAgICAgICAvLyBTZXQgc3RhdGVcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuaXNTcGVha2luZylcclxuICAgICAgICAgICAgdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIHRoaXMuaXNTcGVha2luZyAgICAgID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRJZHMgICAgICA9IGlkcztcclxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzO1xyXG5cclxuICAgICAgICAvLyBTZXQgcmV2ZXJiXHJcblxyXG4gICAgICAgIGlmICggU3RyaW5ncy5pc051bGxPckVtcHR5KHNldHRpbmdzLnZveFJldmVyYikgKVxyXG4gICAgICAgICAgICB0aGlzLnRvZ2dsZVJldmVyYihmYWxzZSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGZpbGUgICAgPSBzZXR0aW5ncy52b3hSZXZlcmIhO1xyXG4gICAgICAgICAgICBsZXQgaW1wdWxzZSA9IHRoaXMuaW1wdWxzZXNbZmlsZV07XHJcblxyXG4gICAgICAgICAgICBpZiAoIWltcHVsc2UpXHJcbiAgICAgICAgICAgICAgICBmZXRjaChgJHt0aGlzLmRhdGFQYXRofS8ke2ZpbGV9YClcclxuICAgICAgICAgICAgICAgICAgICAudGhlbiggcmVzID0+IHJlcy5hcnJheUJ1ZmZlcigpIClcclxuICAgICAgICAgICAgICAgICAgICAudGhlbiggYnVmID0+IFNvdW5kcy5kZWNvZGUodGhpcy5hdWRpb0NvbnRleHQsIGJ1ZikgKVxyXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKCBpbXAgPT5cclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENhY2hlIGJ1ZmZlciBmb3IgbGF0ZXJcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pbXB1bHNlc1tmaWxlXSAgICA9IGltcDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZXZlcmJOb2RlLmJ1ZmZlciA9IGltcDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50b2dnbGVSZXZlcmIodHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBSRVZFUkIgTE9BREVEJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yZXZlcmJOb2RlLmJ1ZmZlciA9IGltcHVsc2U7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRvZ2dsZVJldmVyYih0cnVlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2V0IHZvbHVtZVxyXG5cclxuICAgICAgICBsZXQgdm9sdW1lID0gZWl0aGVyKHNldHRpbmdzLnZvbHVtZSwgMSk7XHJcblxyXG4gICAgICAgIC8vIFJlbWFwcyB0aGUgMS4xLi4uMS45IHJhbmdlIHRvIDIuLi4xMFxyXG4gICAgICAgIGlmICh2b2x1bWUgPiAxKVxyXG4gICAgICAgICAgICB2b2x1bWUgPSAodm9sdW1lICogMTApIC0gOTtcclxuXHJcbiAgICAgICAgdGhpcy5nYWluTm9kZS5nYWluLnZhbHVlID0gdm9sdW1lO1xyXG5cclxuICAgICAgICAvLyBTZXQgY2hpbWUsIGF0IGZvcmNlZCBwbGF5YmFjayByYXRlIG9mIDFcclxuXHJcbiAgICAgICAgaWYgKCAhU3RyaW5ncy5pc051bGxPckVtcHR5KHNldHRpbmdzLnZveENoaW1lKSApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcGF0aCAgICAgID0gYCR7dGhpcy5kYXRhUGF0aH0vJHtzZXR0aW5ncy52b3hDaGltZSF9YDtcclxuICAgICAgICAgICAgbGV0IHJlcSAgICAgICA9IG5ldyBWb3hSZXF1ZXN0KHBhdGgsIDAsIHRoaXMuYXVkaW9Db250ZXh0KTtcclxuICAgICAgICAgICAgcmVxLmZvcmNlUmF0ZSA9IDE7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdSZXFzLnB1c2gocmVxKTtcclxuICAgICAgICAgICAgaWRzLnVuc2hpZnQoMS4wKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEJlZ2luIHRoZSBwdW1wIGxvb3AuIE9uIGlPUywgdGhlIGNvbnRleHQgbWF5IGhhdmUgdG8gYmUgcmVzdW1lZCBmaXJzdFxyXG5cclxuICAgICAgICBpZiAodGhpcy5hdWRpb0NvbnRleHQuc3RhdGUgPT09ICdzdXNwZW5kZWQnKVxyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dC5yZXN1bWUoKS50aGVuKCAoKSA9PiB0aGlzLnB1bXAoKSApO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5wdW1wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHBsYXlpbmcgYW55IGN1cnJlbnRseSBzcG9rZW4gc3BlZWNoIGFuZCByZXNldHMgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gQWxyZWFkeSBzdG9wcGVkPyBEbyBub3QgY29udGludWVcclxuICAgICAgICBpZiAoIXRoaXMuaXNTcGVha2luZylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmdcclxuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5wdW1wVGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgLy8gQ2FuY2VsIGFsbCBwZW5kaW5nIHJlcXVlc3RzXHJcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVxcy5mb3JFYWNoKCByID0+IHIuY2FuY2VsKCkgKTtcclxuXHJcbiAgICAgICAgLy8gS2lsbCBhbmQgZGVyZWZlcmVuY2UgYW55IGN1cnJlbnRseSBwbGF5aW5nIGZpbGVcclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMuZm9yRWFjaChub2RlID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBub2RlLnN0b3AoKTtcclxuICAgICAgICAgICAgbm9kZS5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMubmV4dEJlZ2luICAgICAgICA9IDA7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50SWRzICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzICA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLnBlbmRpbmdSZXFzICAgICAgPSBbXTtcclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMgPSBbXTtcclxuXHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFNUT1BQRUQnKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHVtcHMgdGhlIHNwZWVjaCBxdWV1ZSwgYnkga2VlcGluZyB1cCB0byAxMCBmZXRjaCByZXF1ZXN0cyBmb3Igdm9pY2UgZmlsZXMgZ29pbmcsXHJcbiAgICAgKiBhbmQgdGhlbiBmZWVkaW5nIHRoZWlyIGRhdGEgKGluIGVuZm9yY2VkIG9yZGVyKSB0byB0aGUgYXVkaW8gY2hhaW4sIG9uZSBhdCBhIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcHVtcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIElmIHRoZSBlbmdpbmUgaGFzIHN0b3BwZWQsIGRvIG5vdCBwcm9jZWVkLlxyXG4gICAgICAgIGlmICghdGhpcy5pc1NwZWFraW5nIHx8ICF0aGlzLmN1cnJlbnRJZHMgfHwgIXRoaXMuY3VycmVudFNldHRpbmdzKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBzY2hlZHVsZSBmdWxmaWxsZWQgcmVxdWVzdHMgaW50byB0aGUgYXVkaW8gYnVmZmVyLCBpbiBGSUZPIG9yZGVyXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZSgpO1xyXG5cclxuICAgICAgICAvLyBUaGVuLCBmaWxsIGFueSBmcmVlIHBlbmRpbmcgc2xvdHMgd2l0aCBuZXcgcmVxdWVzdHNcclxuICAgICAgICBsZXQgbmV4dERlbGF5ID0gMDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRoaXMuY3VycmVudElkc1swXSAmJiB0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCA8IDEwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGtleSA9IHRoaXMuY3VycmVudElkcy5zaGlmdCgpITtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMga2V5IGlzIGEgbnVtYmVyLCBpdCdzIGFuIGFtb3VudCBvZiBzaWxlbmNlLCBzbyBhZGQgaXQgYXMgdGhlXHJcbiAgICAgICAgICAgIC8vIHBsYXliYWNrIGRlbGF5IGZvciB0aGUgbmV4dCBwbGF5YWJsZSByZXF1ZXN0IChpZiBhbnkpLlxyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGtleSA9PT0gJ251bWJlcicpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG5leHREZWxheSArPSBrZXk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbGV0IHBhdGggPSBgJHt0aGlzLmN1cnJlbnRTZXR0aW5ncy52b3hQYXRofS8ke2tleX0ubXAzYDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucGVuZGluZ1JlcXMucHVzaCggbmV3IFZveFJlcXVlc3QocGF0aCwgbmV4dERlbGF5LCB0aGlzLmF1ZGlvQ29udGV4dCkgKTtcclxuICAgICAgICAgICAgbmV4dERlbGF5ID0gMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0b3AgcHVtcGluZyB3aGVuIHdlJ3JlIG91dCBvZiBJRHMgdG8gcXVldWUgYW5kIG5vdGhpbmcgaXMgcGxheWluZ1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRJZHMubGVuZ3RoICAgICAgIDw9IDApXHJcbiAgICAgICAgaWYgKHRoaXMucGVuZGluZ1JlcXMubGVuZ3RoICAgICAgPD0gMClcclxuICAgICAgICBpZiAodGhpcy5zY2hlZHVsZWRCdWZmZXJzLmxlbmd0aCA8PSAwKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIHRoaXMucHVtcFRpbWVyID0gc2V0VGltZW91dCh0aGlzLnB1bXAuYmluZCh0aGlzKSwgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNjaGVkdWxlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RvcCBzY2hlZHVsaW5nIGlmIHRoZXJlIGFyZSBubyBwZW5kaW5nIHJlcXVlc3RzXHJcbiAgICAgICAgaWYgKCF0aGlzLnBlbmRpbmdSZXFzWzBdIHx8ICF0aGlzLnBlbmRpbmdSZXFzWzBdLmlzRG9uZSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBEb24ndCBzY2hlZHVsZSBpZiBtb3JlIHRoYW4gNSBub2RlcyBhcmUsIGFzIG5vdCB0byBibG93IGFueSBidWZmZXJzXHJcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGVkQnVmZmVycy5sZW5ndGggPiA1KVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCByZXEgPSB0aGlzLnBlbmRpbmdSZXFzLnNoaWZ0KCkhO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgbmV4dCByZXF1ZXN0IGVycm9yZWQgb3V0IChidWZmZXIgbWlzc2luZyksIHNraXAgaXRcclxuICAgICAgICBpZiAoIXJlcS5idWZmZXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgU0tJUFBFRDonLCByZXEucGF0aCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNjaGVkdWxlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZiB0aGlzIGlzIHRoZSBmaXJzdCBjbGlwIGJlaW5nIHBsYXllZCwgc3RhcnQgZnJvbSBjdXJyZW50IHdhbGwtY2xvY2tcclxuICAgICAgICBpZiAodGhpcy5uZXh0QmVnaW4gPT09IDApXHJcbiAgICAgICAgICAgIHRoaXMubmV4dEJlZ2luID0gdGhpcy5hdWRpb0NvbnRleHQuY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdWT1ggQ0xJUCBRVUVVRUQ6JywgcmVxLnBhdGgsIHJlcS5idWZmZXIuZHVyYXRpb24sIHRoaXMubmV4dEJlZ2luKTtcclxuXHJcbiAgICAgICAgLy8gQmFzZSBsYXRlbmN5IG5vdCBhdmFpbGFibGUgaW4gc29tZSBicm93c2Vyc1xyXG4gICAgICAgIGxldCBsYXRlbmN5ID0gKHRoaXMuYXVkaW9Db250ZXh0LmJhc2VMYXRlbmN5IHx8IDAuMDEpICsgMC4xNTtcclxuICAgICAgICBsZXQgbm9kZSAgICA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpO1xyXG4gICAgICAgIGxldCByYXRlICAgID0gcmVxLmZvcmNlUmF0ZSB8fCB0aGlzLmN1cnJlbnRTZXR0aW5ncyEucmF0ZSB8fCAxO1xyXG4gICAgICAgIG5vZGUuYnVmZmVyID0gcmVxLmJ1ZmZlcjtcclxuXHJcbiAgICAgICAgLy8gUmVtYXAgcmF0ZSBmcm9tIDAuMS4uMS45IHRvIDAuOC4uMS41XHJcbiAgICAgICAgaWYgICAgICAocmF0ZSA8IDEpIHJhdGUgPSAocmF0ZSAqIDAuMikgKyAwLjg7XHJcbiAgICAgICAgZWxzZSBpZiAocmF0ZSA+IDEpIHJhdGUgPSAocmF0ZSAqIDAuNSkgKyAwLjU7XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSBkZWxheSBhbmQgZHVyYXRpb24gYmFzZWQgb24gcGxheWJhY2sgcmF0ZVxyXG4gICAgICAgIGxldCBkZWxheSAgICA9IHJlcS5kZWxheSAqICgxIC8gcmF0ZSk7XHJcbiAgICAgICAgbGV0IGR1cmF0aW9uID0gbm9kZS5idWZmZXIuZHVyYXRpb24gKiAoMSAvIHJhdGUpO1xyXG5cclxuICAgICAgICBub2RlLnBsYXliYWNrUmF0ZS52YWx1ZSA9IHJhdGU7XHJcbiAgICAgICAgbm9kZS5jb25uZWN0KHRoaXMuZ2Fpbk5vZGUpO1xyXG4gICAgICAgIG5vZGUuc3RhcnQodGhpcy5uZXh0QmVnaW4gKyBkZWxheSk7XHJcblxyXG4gICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycy5wdXNoKG5vZGUpO1xyXG4gICAgICAgIHRoaXMubmV4dEJlZ2luICs9IChkdXJhdGlvbiArIGRlbGF5IC0gbGF0ZW5jeSk7XHJcblxyXG4gICAgICAgIC8vIEhhdmUgdGhpcyBidWZmZXIgbm9kZSByZW1vdmUgaXRzZWxmIGZyb20gdGhlIHNjaGVkdWxlIHdoZW4gZG9uZVxyXG4gICAgICAgIG5vZGUub25lbmRlZCA9IF8gPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdWT1ggQ0xJUCBFTkRFRDonLCByZXEucGF0aCk7XHJcbiAgICAgICAgICAgIGxldCBpZHggPSB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMuaW5kZXhPZihub2RlKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChpZHggIT09IC0xKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzLnNwbGljZShpZHgsIDEpO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB0b2dnbGVSZXZlcmIoc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMucmV2ZXJiTm9kZS5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlLmRpc2Nvbm5lY3QoKTtcclxuXHJcbiAgICAgICAgaWYgKHN0YXRlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5maWx0ZXJOb2RlLmNvbm5lY3QodGhpcy5yZXZlcmJOb2RlKTtcclxuICAgICAgICAgICAgdGhpcy5yZXZlcmJOb2RlLmNvbm5lY3QodGhpcy5hdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyTm9kZS5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFJlcHJlc2VudHMgYSByZXF1ZXN0IGZvciBhIHZveCBmaWxlLCBpbW1lZGlhdGVseSBiZWd1biBvbiBjcmVhdGlvbiAqL1xyXG5jbGFzcyBWb3hSZXF1ZXN0XHJcbntcclxuICAgIC8qKiBSZWxhdGl2ZSByZW1vdGUgcGF0aCBvZiB0aGlzIHZvaWNlIGZpbGUgcmVxdWVzdCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBwYXRoICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIEFtb3VudCBvZiBzZWNvbmRzIHRvIGRlbGF5IHRoZSBwbGF5YmFjayBvZiB0aGlzIHJlcXVlc3QgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZGVsYXkgICA6IG51bWJlcjtcclxuICAgIC8qKiBBdWRpbyBjb250ZXh0IHRvIHVzZSBmb3IgZGVjb2RpbmcgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dCA6IEF1ZGlvQ29udGV4dDtcclxuXHJcbiAgICAvKiogV2hldGhlciB0aGlzIHJlcXVlc3QgaXMgZG9uZSBhbmQgcmVhZHkgZm9yIGhhbmRsaW5nIChldmVuIGlmIGZhaWxlZCkgKi9cclxuICAgIHB1YmxpYyBpc0RvbmUgICAgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFJhdyBhdWRpbyBkYXRhIGZyb20gdGhlIGxvYWRlZCBmaWxlLCBpZiBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBidWZmZXI/ICAgIDogQXVkaW9CdWZmZXI7XHJcbiAgICAvKiogUGxheWJhY2sgcmF0ZSB0byBmb3JjZSB0aGlzIGNsaXAgdG8gcGxheSBhdCAqL1xyXG4gICAgcHVibGljIGZvcmNlUmF0ZT8gOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgZGVsYXk6IG51bWJlciwgY29udGV4dDogQXVkaW9Db250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBSRVFVRVNUOicsIHBhdGgpO1xyXG4gICAgICAgIHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XHJcbiAgICAgICAgdGhpcy5wYXRoICAgID0gcGF0aDtcclxuICAgICAgICB0aGlzLmRlbGF5ICAgPSBkZWxheTtcclxuXHJcbiAgICAgICAgZmV0Y2gocGF0aClcclxuICAgICAgICAgICAgLnRoZW4gKCB0aGlzLm9uRnVsZmlsbC5iaW5kKHRoaXMpIClcclxuICAgICAgICAgICAgLmNhdGNoKCB0aGlzLm9uRXJyb3IuYmluZCh0aGlzKSAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbmNlbHMgdGhpcyByZXF1ZXN0IGZyb20gcHJvY2VlZGluZyBhbnkgZnVydGhlciAqL1xyXG4gICAgcHVibGljIGNhbmNlbCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IENhbmNlbGxhdGlvbiBjb250cm9sbGVyc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBCZWdpbnMgZGVjb2RpbmcgdGhlIGxvYWRlZCBNUDMgdm9pY2UgZmlsZSB0byByYXcgYXVkaW8gZGF0YSAqL1xyXG4gICAgcHJpdmF0ZSBvbkZ1bGZpbGwocmVzOiBSZXNwb25zZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFyZXMub2spXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKGBWT1ggTk9UIEZPVU5EOiAke3Jlcy5zdGF0dXN9IEAgJHt0aGlzLnBhdGh9YCk7XHJcblxyXG4gICAgICAgIHJlcy5hcnJheUJ1ZmZlcigpLnRoZW4oIHRoaXMub25BcnJheUJ1ZmZlci5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFRha2VzIHRoZSBhcnJheSBidWZmZXIgZnJvbSB0aGUgZnVsZmlsbGVkIGZldGNoIGFuZCBkZWNvZGVzIGl0ICovXHJcbiAgICBwcml2YXRlIG9uQXJyYXlCdWZmZXIoYnVmZmVyOiBBcnJheUJ1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgU291bmRzLmRlY29kZSh0aGlzLmNvbnRleHQsIGJ1ZmZlcilcclxuICAgICAgICAgICAgLnRoZW4gKCB0aGlzLm9uRGVjb2RlLmJpbmQodGhpcykgKVxyXG4gICAgICAgICAgICAuY2F0Y2goIHRoaXMub25FcnJvci5iaW5kKHRoaXMpICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiB0aGUgZmV0Y2hlZCBidWZmZXIgaXMgZGVjb2RlZCBzdWNjZXNzZnVsbHkgKi9cclxuICAgIHByaXZhdGUgb25EZWNvZGUoYnVmZmVyOiBBdWRpb0J1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5idWZmZXIgPSBidWZmZXI7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgaWYgdGhlIGZldGNoIG9yIGRlY29kZSBzdGFnZXMgZmFpbCAqL1xyXG4gICAgcHJpdmF0ZSBvbkVycm9yKGVycjogYW55KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnUkVRVUVTVCBGQUlMOicsIGVycik7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLyBUT0RPOiBNYWtlIGFsbCB2aWV3cyB1c2UgdGhpcyBjbGFzc1xyXG4vKiogQmFzZSBjbGFzcyBmb3IgYSB2aWV3OyBhbnl0aGluZyB3aXRoIGEgYmFzZSBET00gZWxlbWVudCAqL1xyXG5hYnN0cmFjdCBjbGFzcyBCYXNlVmlld1xyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgdmlldydzIHByaW1hcnkgRE9NIGVsZW1lbnQgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkb20gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyB0aGlzIGJhc2UgdmlldywgYXR0YWNoaW5nIGl0IHRvIHRoZSBlbGVtZW50IG1hdGNoaW5nIHRoZSBnaXZlbiBxdWVyeSAqL1xyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKGRvbVF1ZXJ5OiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gPSBET00ucmVxdWlyZShkb21RdWVyeSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhpcyB2aWV3J3MgY2hpbGQgZWxlbWVudCBtYXRjaGluZyB0aGUgZ2l2ZW4gcXVlcnkgKi9cclxuICAgIHByb3RlY3RlZCBhdHRhY2g8VCBleHRlbmRzIEhUTUxFbGVtZW50PihxdWVyeTogc3RyaW5nKSA6IFRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gRE9NLnJlcXVpcmUocXVlcnksIHRoaXMuZG9tKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBwaHJhc2UgZWRpdG9yICovXHJcbmNsYXNzIEVkaXRvclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBET00gY29udGFpbmVyIGZvciB0aGUgZWRpdG9yICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBkaWFsb2csIGlmIGFueSAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50UGlja2VyPyA6IFBpY2tlcjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBocmFzZSBlbGVtZW50IGN1cnJlbnRseSBiZWluZyBlZGl0ZWQsIGlmIGFueSAqL1xyXG4gICAgLy8gRG8gbm90IERSWTsgbmVlZHMgdG8gYmUgcGFzc2VkIHRvIHRoZSBwaWNrZXIgZm9yIGNsZWFuZXIgY29kZVxyXG4gICAgcHJpdmF0ZSBkb21FZGl0aW5nPyAgICA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gPSBET00ucmVxdWlyZSgnI2VkaXRvcicpO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5ib2R5Lm9uY2xpY2sgPSB0aGlzLm9uQ2xpY2suYmluZCh0aGlzKTtcclxuICAgICAgICB3aW5kb3cub25yZXNpemUgICAgICAgPSB0aGlzLm9uUmVzaXplLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb20ub25zY3JvbGwgICAgID0gdGhpcy5vblNjcm9sbC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tLnRleHRDb250ZW50ICA9IEwuRURJVE9SX0lOSVQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVwbGFjZXMgdGhlIGVkaXRvciB3aXRoIGEgcm9vdCBwaHJhc2VzZXQgcmVmZXJlbmNlLCBhbmQgZXhwYW5kcyBpdCBpbnRvIEhUTUwgKi9cclxuICAgIHB1YmxpYyBnZW5lcmF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tLmlubmVySFRNTCA9ICc8cGhyYXNlc2V0IHJlZj1cInJvb3RcIiAvPic7XHJcblxyXG4gICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3ModGhpcy5kb20pO1xyXG5cclxuICAgICAgICAvLyBGb3Igc2Nyb2xsLXBhc3QgcGFkZGluZyB1bmRlciB0aGUgcGhyYXNlXHJcbiAgICAgICAgbGV0IHBhZGRpbmcgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgcGFkZGluZy5jbGFzc05hbWUgPSAnYm90dG9tUGFkZGluZyc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmFwcGVuZENoaWxkKHBhZGRpbmcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXByb2Nlc3NlcyBhbGwgcGhyYXNlc2V0IGVsZW1lbnRzIG9mIHRoZSBnaXZlbiByZWYsIGlmIHRoZWlyIGluZGV4IGhhcyBjaGFuZ2VkICovXHJcbiAgICBwdWJsaWMgcmVmcmVzaFBocmFzZXNldChyZWY6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gTm90ZSwgdGhpcyBjb3VsZCBwb3RlbnRpYWxseSBidWcgb3V0IGlmIGEgcGhyYXNlc2V0J3MgZGVzY2VuZGFudCByZWZlcmVuY2VzXHJcbiAgICAgICAgLy8gdGhlIHNhbWUgcGhyYXNlc2V0IChyZWN1cnNpb24pLiBCdXQgdGhpcyBpcyBva2F5IGJlY2F1c2UgcGhyYXNlc2V0cyBzaG91bGRcclxuICAgICAgICAvLyBuZXZlciBpbmNsdWRlIHRoZW1zZWx2ZXMsIGV2ZW4gZXZlbnR1YWxseS5cclxuXHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChgc3BhbltkYXRhLXR5cGU9cGhyYXNlc2V0XVtkYXRhLXJlZj0ke3JlZn1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goXyA9PlxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCAgICA9IF8gYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBsZXQgbmV3RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3BocmFzZXNldCcpO1xyXG4gICAgICAgICAgICAgICAgbGV0IGNoYW5jZSAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddO1xyXG5cclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQuc2V0QXR0cmlidXRlKCdyZWYnLCByZWYpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChjaGFuY2UpXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2NoYW5jZScsIGNoYW5jZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZWxlbWVudC5wYXJlbnRFbGVtZW50IS5yZXBsYWNlQ2hpbGQobmV3RWxlbWVudCwgZWxlbWVudCk7XHJcbiAgICAgICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKG5ld0VsZW1lbnQucGFyZW50RWxlbWVudCEpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSBzdGF0aWMgTm9kZUxpc3Qgb2YgYWxsIHBocmFzZSBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gcXVlcnkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IFF1ZXJ5IHN0cmluZyB0byBhZGQgb250byB0aGUgYHNwYW5gIHNlbGVjdG9yXHJcbiAgICAgKiBAcmV0dXJucyBOb2RlIGxpc3Qgb2YgYWxsIGVsZW1lbnRzIG1hdGNoaW5nIHRoZSBnaXZlbiBzcGFuIHF1ZXJ5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRFbGVtZW50c0J5UXVlcnkocXVlcnk6IHN0cmluZykgOiBOb2RlTGlzdFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuJHtxdWVyeX1gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCBwaHJhc2UncyByb290IERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlKCkgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCBwaHJhc2UgaW4gdGhlIGVkaXRvciBhcyB0ZXh0LCBleGNsdWRpbmcgdGhlIGhpZGRlbiBwYXJ0cyAqL1xyXG4gICAgcHVibGljIGdldFRleHQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIGFsbCBwaHJhc2UgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHR5cGUsIGFuZCBzZXRzIHRoZWlyIHRleHQgdG8gZ2l2ZW4gdmFsdWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHR5cGUgT3JpZ2luYWwgWE1MIG5hbWUgb2YgZWxlbWVudHMgdG8gcmVwbGFjZSBjb250ZW50cyBvZlxyXG4gICAgICogQHBhcmFtIHZhbHVlIE5ldyB0ZXh0IGZvciB0aGUgZm91bmQgZWxlbWVudHMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRFbGVtZW50c1RleHQodHlwZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT0ke3R5cGV9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIGFueSBjdXJyZW50bHkgb3BlbiBlZGl0b3IgZGlhbG9ncyAqL1xyXG4gICAgcHVibGljIGNsb3NlRGlhbG9nKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmNsb3NlKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmRvbUVkaXRpbmcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcucmVtb3ZlQXR0cmlidXRlKCdlZGl0aW5nJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdhYm92ZScsICdiZWxvdycpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBhIGNsaWNrIGFueXdoZXJlIGluIHRoZSB3aW5kb3cgZGVwZW5kaW5nIG9uIHRoZSBjb250ZXh0ICovXHJcbiAgICBwcml2YXRlIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSBldi50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IHR5cGUgICA9IHRhcmdldCA/IHRhcmdldC5kYXRhc2V0Wyd0eXBlJ10gICAgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgbGV0IHBpY2tlciA9IHR5cGUgICA/IFJBRy52aWV3cy5nZXRQaWNrZXIodHlwZSkgOiB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgIGlmICghdGFyZ2V0KVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBSZWRpcmVjdCBjbGlja3Mgb2YgaW5uZXIgZWxlbWVudHNcclxuICAgICAgICBpZiAoIHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2lubmVyJykgJiYgdGFyZ2V0LnBhcmVudEVsZW1lbnQgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGFyZ2V0ID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIHR5cGUgICA9IHRhcmdldC5kYXRhc2V0Wyd0eXBlJ107XHJcbiAgICAgICAgICAgIHBpY2tlciA9IHR5cGUgPyBSQUcudmlld3MuZ2V0UGlja2VyKHR5cGUpIDogdW5kZWZpbmVkO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWdub3JlIGNsaWNrcyB0byBhbnkgaW5uZXIgZG9jdW1lbnQgb3IgdW5vd25lZCBlbGVtZW50XHJcbiAgICAgICAgaWYgKCAhZG9jdW1lbnQuYm9keS5jb250YWlucyh0YXJnZXQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIHRvIGFueSBlbGVtZW50IG9mIGFscmVhZHkgb3BlbiBwaWNrZXJzXHJcbiAgICAgICAgaWYgKCB0aGlzLmN1cnJlbnRQaWNrZXIgKVxyXG4gICAgICAgIGlmICggdGhpcy5jdXJyZW50UGlja2VyLmRvbS5jb250YWlucyh0YXJnZXQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBDYW5jZWwgYW55IG9wZW4gZWRpdG9yc1xyXG4gICAgICAgIGxldCBwcmV2VGFyZ2V0ID0gdGhpcy5kb21FZGl0aW5nO1xyXG4gICAgICAgIHRoaXMuY2xvc2VEaWFsb2coKTtcclxuXHJcbiAgICAgICAgLy8gSWYgY2xpY2tpbmcgdGhlIGVsZW1lbnQgYWxyZWFkeSBiZWluZyBlZGl0ZWQsIGRvbid0IHJlb3BlblxyXG4gICAgICAgIGlmICh0YXJnZXQgPT09IHByZXZUYXJnZXQpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGNvbGxhcHNpYmxlIGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKCB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCd0b2dnbGUnKSApXHJcbiAgICAgICAgICAgIHRoaXMudG9nZ2xlQ29sbGFwc2lhYmxlKHRhcmdldCk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYW5kIG9wZW4gcGlja2VyIGZvciB0aGUgdGFyZ2V0IGVsZW1lbnRcclxuICAgICAgICBlbHNlIGlmICh0eXBlICYmIHBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5vcGVuUGlja2VyKHRhcmdldCwgcGlja2VyKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmUtbGF5b3V0IHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgb24gcmVzaXplICovXHJcbiAgICBwcml2YXRlIG9uUmVzaXplKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlLWxheW91dCB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIG9uIHNjcm9sbCAqL1xyXG4gICAgcHJpdmF0ZSBvblNjcm9sbChfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRQaWNrZXIpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gV29ya2Fyb3VuZCBmb3IgbGF5b3V0IGJlaGF2aW5nIHdlaXJkIHdoZW4gaU9TIGtleWJvYXJkIGlzIG9wZW5cclxuICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKVxyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRQaWNrZXIuaGFzRm9jdXMoKSlcclxuICAgICAgICAgICAgRE9NLmJsdXJBY3RpdmUoKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmxpcHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUsIGFuZCBwcm9wYWdhdGVzIHRoZSBuZXcgc3RhdGUgdG8gb3RoZXJcclxuICAgICAqIGNvbGxhcHNpYmxlcyBvZiB0aGUgc2FtZSByZWZlcmVuY2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBDb2xsYXBzaWJsZSBlbGVtZW50IGJlaW5nIHRvZ2dsZWRcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB0b2dnbGVDb2xsYXBzaWFibGUodGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgICAgPSB0YXJnZXQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgbGV0IHJlZiAgICAgICAgPSBET00ucmVxdWlyZURhdGEocGFyZW50LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IHR5cGUgICAgICAgPSBET00ucmVxdWlyZURhdGEocGFyZW50LCAndHlwZScpO1xyXG4gICAgICAgIGxldCBjb2xsYXBhc2VkID0gcGFyZW50Lmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJyk7XHJcblxyXG4gICAgICAgIC8vIFByb3BhZ2F0ZSBuZXcgY29sbGFwc2Ugc3RhdGUgdG8gYWxsIGNvbGxhcHNpYmxlcyBvZiB0aGUgc2FtZSByZWZcclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuW2RhdGEtdHlwZT0ke3R5cGV9XVtkYXRhLXJlZj0ke3JlZn1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goXyA9PlxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgcGhyYXNlc2V0ID0gXyBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGxldCB0b2dnbGUgICAgPSBwaHJhc2VzZXQuY2hpbGRyZW5bMF0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gU2tpcCBzYW1lLXJlZiBlbGVtZW50cyB0aGF0IGFyZW4ndCBjb2xsYXBzaWJsZVxyXG4gICAgICAgICAgICAgICAgaWYgKCAhdG9nZ2xlIHx8ICF0b2dnbGUuY2xhc3NMaXN0LmNvbnRhaW5zKCd0b2dnbGUnKSApXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgICAgIENvbGxhcHNpYmxlcy5zZXQocGhyYXNlc2V0LCB0b2dnbGUsICFjb2xsYXBhc2VkKTtcclxuICAgICAgICAgICAgICAgIC8vIERvbid0IG1vdmUgdGhpcyB0byBzZXRDb2xsYXBzaWJsZSwgYXMgc3RhdGUgc2F2ZS9sb2FkIGlzIGhhbmRsZWRcclxuICAgICAgICAgICAgICAgIC8vIG91dHNpZGUgaW4gYm90aCB1c2FnZXMgb2Ygc2V0Q29sbGFwc2libGUuXHJcbiAgICAgICAgICAgICAgICBSQUcuc3RhdGUuc2V0Q29sbGFwc2VkKHJlZiwgIWNvbGxhcGFzZWQpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9wZW5zIGEgcGlja2VyIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVkaXRvciBlbGVtZW50IHRvIG9wZW4gdGhlIHBpY2tlciBmb3JcclxuICAgICAqIEBwYXJhbSBwaWNrZXIgUGlja2VyIHRvIG9wZW5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvcGVuUGlja2VyKHRhcmdldDogSFRNTEVsZW1lbnQsIHBpY2tlcjogUGlja2VyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0YXJnZXQuc2V0QXR0cmlidXRlKCdlZGl0aW5nJywgJ3RydWUnKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyID0gcGlja2VyO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyAgICA9IHRhcmdldDtcclxuICAgICAgICBwaWNrZXIub3Blbih0YXJnZXQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNjcm9sbGluZyBtYXJxdWVlICovXHJcbmNsYXNzIE1hcnF1ZWVcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFycXVlZSdzIERPTSBlbGVtZW50ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbSAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNwYW4gZWxlbWVudCBpbiB0aGUgbWFycXVlZSwgd2hlcmUgdGhlIHRleHQgaXMgc2V0ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbVNwYW4gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIElEIGZvciB0aGUgc2Nyb2xsaW5nIGFuaW1hdGlvbiB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSB0aW1lciAgOiBudW1iZXIgPSAwO1xyXG4gICAgLyoqIEN1cnJlbnQgb2Zmc2V0IChpbiBwaXhlbHMpIG9mIHRoZSBzY3JvbGxpbmcgbWFycXVlZSAqL1xyXG4gICAgcHJpdmF0ZSBvZmZzZXQgOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgID0gRE9NLnJlcXVpcmUoJyNtYXJxdWVlJyk7XHJcbiAgICAgICAgdGhpcy5kb21TcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5pbm5lckhUTUwgPSAnJztcclxuICAgICAgICB0aGlzLmRvbS5hcHBlbmRDaGlsZCh0aGlzLmRvbVNwYW4pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBtZXNzYWdlIG9uIHRoZSBzY3JvbGxpbmcgbWFycXVlZSwgYW5kIHN0YXJ0cyBhbmltYXRpbmcgaXQgKi9cclxuICAgIHB1YmxpYyBzZXQobXNnOiBzdHJpbmcsIGFuaW1hdGU6IGJvb2xlYW4gPSB0cnVlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy50aW1lcik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi50ZXh0Q29udGVudCAgICAgPSBtc2c7XHJcbiAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xyXG5cclxuICAgICAgICBpZiAoIWFuaW1hdGUpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSSB0cmllZCB0byB1c2UgQ1NTIGFuaW1hdGlvbiBmb3IgdGhpcywgYnV0IGNvdWxkbid0IGZpZ3VyZSBvdXQgaG93IGZvciBhXHJcbiAgICAgICAgLy8gZHluYW1pY2FsbHkgc2l6ZWQgZWxlbWVudCBsaWtlIHRoZSBzcGFuLlxyXG4gICAgICAgIHRoaXMub2Zmc2V0ID0gdGhpcy5kb20uY2xpZW50V2lkdGg7XHJcbiAgICAgICAgbGV0IGxpbWl0ICAgPSAtdGhpcy5kb21TcGFuLmNsaWVudFdpZHRoIC0gMTAwO1xyXG4gICAgICAgIGxldCBhbmltICAgID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMub2Zmc2V0ICAgICAgICAgICAgICAgICAgLT0gNjtcclxuICAgICAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSAgPSBgdHJhbnNsYXRlWCgke3RoaXMub2Zmc2V0fXB4KWA7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vZmZzZXQgPCBsaW1pdClcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhpcy50aW1lciA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3RvcHMgdGhlIGN1cnJlbnQgbWFycXVlZSBhbmltYXRpb24gKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vPHJlZmVyZW5jZSBwYXRoPVwiYmFzZVZpZXcudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG5jbGFzcyBTZXR0aW5ncyBleHRlbmRzIEJhc2VWaWV3XHJcbntcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuUmVzZXQgICAgICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxCdXR0b25FbGVtZW50PiAoJyNidG5SZXNldFNldHRpbmdzJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blNhdmUgICAgICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MQnV0dG9uRWxlbWVudD4gKCcjYnRuU2F2ZVNldHRpbmdzJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNoa1VzZVZveCAgICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjY2hrVXNlVm94Jyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGhpbnRVc2VWb3ggICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MRWxlbWVudD4gICAgICAgKCcjaGludFVzZVZveCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzZWxWb3hWb2ljZSAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTFNlbGVjdEVsZW1lbnQ+ICgnI3NlbFZveFZvaWNlJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0Vm94UGF0aCAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjaW5wdXRWb3hQYXRoJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlbFZveFJldmVyYiAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsVm94UmV2ZXJiJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlbFZveENoaW1lICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsVm94Q2hpbWUnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VsU3BlZWNoVm9pY2UgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxTZWxlY3RFbGVtZW50PiAoJyNzZWxTcGVlY2hDaG9pY2UnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hWb2wgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNyYW5nZVNwZWVjaFZvbCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSByYW5nZVNwZWVjaFBpdGNoID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI3JhbmdlU3BlZWNoUGl0Y2gnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hSYXRlICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNyYW5nZVNwZWVjaFJhdGUnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuU3BlZWNoVGVzdCAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxCdXR0b25FbGVtZW50PiAoJyNidG5TcGVlY2hUZXN0Jyk7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgdGltZXIgZm9yIHRoZSBcIlJlc2V0XCIgYnV0dG9uIGNvbmZpcm1hdGlvbiBzdGVwICovXHJcbiAgICBwcml2YXRlIHJlc2V0VGltZW91dD8gOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignI3NldHRpbmdzU2NyZWVuJyk7XHJcbiAgICAgICAgLy8gVE9ETzogQ2hlY2sgaWYgVk9YIGlzIGF2YWlsYWJsZSwgZGlzYWJsZSBpZiBub3RcclxuXHJcbiAgICAgICAgdGhpcy5idG5SZXNldC5vbmNsaWNrICAgICAgPSB0aGlzLmhhbmRsZVJlc2V0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlLm9uY2xpY2sgICAgICAgPSB0aGlzLmhhbmRsZVNhdmUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmNoa1VzZVZveC5vbmNoYW5nZSAgICA9IHRoaXMubGF5b3V0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5zZWxWb3hWb2ljZS5vbmNoYW5nZSAgPSB0aGlzLmxheW91dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5vbmNsaWNrID0gdGhpcy5oYW5kbGVWb2ljZVRlc3QuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgTGlua2Rvd24ucGFyc2UoIERPTS5yZXF1aXJlKCcjbGVnYWxCbG9jaycpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIE9wZW5zIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyBvcGVuKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVGhlIHZvaWNlIGxpc3QgaGFzIHRvIGJlIHBvcHVsYXRlZCBlYWNoIG9wZW4sIGluIGNhc2UgaXQgY2hhbmdlc1xyXG4gICAgICAgIHRoaXMucG9wdWxhdGVWb2ljZUxpc3QoKTtcclxuXHJcbiAgICAgICAgdGhpcy5jaGtVc2VWb3guY2hlY2tlZCAgICAgICAgICAgICAgPSBSQUcuY29uZmlnLnZveEVuYWJsZWQ7XHJcbiAgICAgICAgdGhpcy5zZWxWb3hWb2ljZS52YWx1ZSAgICAgICAgICAgICAgPSBSQUcuY29uZmlnLnZveFBhdGg7XHJcbiAgICAgICAgdGhpcy5pbnB1dFZveFBhdGgudmFsdWUgICAgICAgICAgICAgPSBSQUcuY29uZmlnLnZveEN1c3RvbVBhdGg7XHJcbiAgICAgICAgdGhpcy5zZWxWb3hSZXZlcmIudmFsdWUgICAgICAgICAgICAgPSBSQUcuY29uZmlnLnZveFJldmVyYjtcclxuICAgICAgICB0aGlzLnNlbFZveENoaW1lLnZhbHVlICAgICAgICAgICAgICA9IFJBRy5jb25maWcudm94Q2hpbWU7XHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZS5zZWxlY3RlZEluZGV4ICAgPSBSQUcuY29uZmlnLnNwZWVjaFZvaWNlO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWVBc051bWJlciAgID0gUkFHLmNvbmZpZy5zcGVlY2hWb2w7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlQXNOdW1iZXIgPSBSQUcuY29uZmlnLnNwZWVjaFBpdGNoO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlQXNOdW1iZXIgID0gUkFHLmNvbmZpZy5zcGVlY2hSYXRlO1xyXG5cclxuICAgICAgICB0aGlzLmxheW91dCgpO1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxSZXNldCgpO1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiA9IHRydWU7XHJcbiAgICAgICAgRE9NLmJsdXJBY3RpdmUodGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxjdWxhdGVzIGZvcm0gbGF5b3V0IGFuZCBjb250cm9sIHZpc2liaWxpdHkgYmFzZWQgb24gc3RhdGUgKi9cclxuICAgIHByaXZhdGUgbGF5b3V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHZveEVuYWJsZWQgPSB0aGlzLmNoa1VzZVZveC5jaGVja2VkO1xyXG4gICAgICAgIGxldCB2b3hDdXN0b20gID0gKHRoaXMuc2VsVm94Vm9pY2UudmFsdWUgPT09ICcnKTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTWlncmF0ZSBhbGwgb2YgUkFHIHRvIHVzZSBoaWRkZW4gYXR0cmlidXRlcyBpbnN0ZWFkLCBmb3Igc2NyZWVuIHJlYWRlcnNcclxuICAgICAgICBET00udG9nZ2xlSGlkZGVuQWxsKFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxTcGVlY2hWb2ljZSwgICAhdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLnJhbmdlU3BlZWNoUGl0Y2gsICF2b3hFbmFibGVkXSxcclxuICAgICAgICAgICAgW3RoaXMuc2VsVm94Vm9pY2UsICAgICAgIHZveEVuYWJsZWRdLFxyXG4gICAgICAgICAgICBbdGhpcy5pbnB1dFZveFBhdGgsICAgICAgdm94RW5hYmxlZCAmJiB2b3hDdXN0b21dLFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxWb3hSZXZlcmIsICAgICAgdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLnNlbFZveENoaW1lLCAgICAgICB2b3hFbmFibGVkXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFycyBhbmQgcG9wdWxhdGVzIHRoZSB2b2ljZSBsaXN0ICovXHJcbiAgICBwcml2YXRlIHBvcHVsYXRlVm9pY2VMaXN0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZS5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgICAgICAgbGV0IHZvaWNlcyA9IFJBRy5zcGVlY2guYnJvd3NlclZvaWNlcztcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGxpc3RcclxuICAgICAgICBpZiAodm9pY2VzLmxlbmd0aCA8PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IG9wdGlvbiAgICAgID0gRE9NLmFkZE9wdGlvbiggdGhpcy5zZWxTcGVlY2hWb2ljZSwgTC5TVF9TUEVFQ0hfRU1QVFkoKSApO1xyXG4gICAgICAgICAgICBvcHRpb24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvU3BlZWNoU3ludGhlc2lzXHJcbiAgICAgICAgZWxzZSBmb3IgKGxldCBpID0gMDsgaSA8IHZvaWNlcy5sZW5ndGggOyBpKyspXHJcbiAgICAgICAgICAgIERPTS5hZGRPcHRpb24odGhpcy5zZWxTcGVlY2hWb2ljZSwgYCR7dm9pY2VzW2ldLm5hbWV9ICgke3ZvaWNlc1tpXS5sYW5nfSlgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgcmVzZXQgYnV0dG9uLCB3aXRoIGEgY29uZmlybSBzdGVwIHRoYXQgY2FuY2VscyBhZnRlciAxNSBzZWNvbmRzICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnJlc2V0VGltZW91dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMucmVzZXRUaW1lb3V0ICAgICAgID0gc2V0VGltZW91dCh0aGlzLmNhbmNlbFJlc2V0LmJpbmQodGhpcyksIDE1MDAwKTtcclxuICAgICAgICAgICAgdGhpcy5idG5SZXNldC5pbm5lclRleHQgPSBMLlNUX1JFU0VUX0NPTkZJUk0oKTtcclxuICAgICAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX0NPTkZJUk1fVCgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBSQUcuY29uZmlnLnJlc2V0KCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxSZXNldCgpO1xyXG4gICAgICAgIHRoaXMub3BlbigpO1xyXG4gICAgICAgIGFsZXJ0KCBMLlNUX1JFU0VUX0RPTkUoKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYW5jZWwgdGhlIHJlc2V0IHRpbWVvdXQgYW5kIHJlc3RvcmUgdGhlIHJlc2V0IGJ1dHRvbiB0byBub3JtYWwgKi9cclxuICAgIHByaXZhdGUgY2FuY2VsUmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMucmVzZXRUaW1lb3V0KTtcclxuICAgICAgICB0aGlzLmJ0blJlc2V0LmlubmVyVGV4dCA9IEwuU1RfUkVTRVQoKTtcclxuICAgICAgICB0aGlzLmJ0blJlc2V0LnRpdGxlICAgICA9IEwuU1RfUkVTRVRfVCgpO1xyXG4gICAgICAgIHRoaXMucmVzZXRUaW1lb3V0ICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzYXZlIGJ1dHRvbiwgc2F2aW5nIGNvbmZpZyB0byBzdG9yYWdlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuY29uZmlnLnZveEVuYWJsZWQgICAgPSB0aGlzLmNoa1VzZVZveC5jaGVja2VkO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94UGF0aCAgICAgICA9IHRoaXMuc2VsVm94Vm9pY2UudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hDdXN0b21QYXRoID0gdGhpcy5pbnB1dFZveFBhdGgudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hSZXZlcmIgICAgID0gdGhpcy5zZWxWb3hSZXZlcmIudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hDaGltZSAgICAgID0gdGhpcy5zZWxWb3hDaGltZS52YWx1ZTtcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFZvaWNlICAgPSB0aGlzLnNlbFNwZWVjaFZvaWNlLnNlbGVjdGVkSW5kZXg7XHJcbiAgICAgICAgLy8gcGFyc2VGbG9hdCBpbnN0ZWFkIG9mIHZhbHVlQXNOdW1iZXI7IHNlZSBBcmNoaXRlY3R1cmUubWRcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFZvbCAgICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2ggICA9IHBhcnNlRmxvYXQodGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFJhdGUgICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNhdmUoKTtcclxuICAgICAgICB0aGlzLmNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNwZWVjaCB0ZXN0IGJ1dHRvbiwgc3BlYWtpbmcgYSB0ZXN0IHBocmFzZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVWb2ljZVRlc3QoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEhhcyB0byBleGVjdXRlIG9uIGEgZGVsYXksIGFzIHNwZWVjaCBjYW5jZWwgaXMgdW5yZWxpYWJsZSB3aXRob3V0IGl0XHJcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgbGV0IHBocmFzZSAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBwaHJhc2UuaW5uZXJIVE1MID0gJzxwaHJhc2UgcmVmPVwic2FtcGxlXCIvPic7XHJcblxyXG4gICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKHBocmFzZSk7XHJcblxyXG4gICAgICAgICAgICBSQUcuc3BlZWNoLnNwZWFrKFxyXG4gICAgICAgICAgICAgICAgcGhyYXNlLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCxcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICB1c2VWb3ggICAgOiB0aGlzLmNoa1VzZVZveC5jaGVja2VkLFxyXG4gICAgICAgICAgICAgICAgICAgIHZveFBhdGggICA6IHRoaXMuc2VsVm94Vm9pY2UudmFsdWUgfHwgdGhpcy5pbnB1dFZveFBhdGgudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdm94UmV2ZXJiIDogdGhpcy5zZWxWb3hSZXZlcmIudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdm94Q2hpbWUgIDogdGhpcy5zZWxWb3hDaGltZS52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICB2b2ljZUlkeCAgOiB0aGlzLnNlbFNwZWVjaFZvaWNlLnNlbGVjdGVkSW5kZXgsXHJcbiAgICAgICAgICAgICAgICAgICAgdm9sdW1lICAgIDogdGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHBpdGNoICAgICA6IHRoaXMucmFuZ2VTcGVlY2hQaXRjaC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHJhdGUgICAgICA6IHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlQXNOdW1iZXJcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9LCAyMDApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHRvcCB0b29sYmFyICovXHJcbmNsYXNzIFRvb2xiYXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY29udGFpbmVyIGZvciB0aGUgdG9vbGJhciAqL1xyXG4gICAgcHJpdmF0ZSBkb20gICAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGxheSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuUGxheSAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHN0b3AgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blN0b3AgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBnZW5lcmF0ZSByYW5kb20gcGhyYXNlIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5HZW5lcmF0ZSA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc2F2ZSBzdGF0ZSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuU2F2ZSAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHJlY2FsbCBzdGF0ZSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuUmVjYWxsICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNldHRpbmdzIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5PcHRpb24gICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgICA9IERPTS5yZXF1aXJlKCcjdG9vbGJhcicpO1xyXG4gICAgICAgIHRoaXMuYnRuUGxheSAgICAgPSBET00ucmVxdWlyZSgnI2J0blBsYXknKTtcclxuICAgICAgICB0aGlzLmJ0blN0b3AgICAgID0gRE9NLnJlcXVpcmUoJyNidG5TdG9wJyk7XHJcbiAgICAgICAgdGhpcy5idG5HZW5lcmF0ZSA9IERPTS5yZXF1aXJlKCcjYnRuU2h1ZmZsZScpO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZSAgICAgPSBET00ucmVxdWlyZSgnI2J0blNhdmUnKTtcclxuICAgICAgICB0aGlzLmJ0blJlY2FsbCAgID0gRE9NLnJlcXVpcmUoJyNidG5Mb2FkJyk7XHJcbiAgICAgICAgdGhpcy5idG5PcHRpb24gICA9IERPTS5yZXF1aXJlKCcjYnRuU2V0dGluZ3MnKTtcclxuXHJcbiAgICAgICAgdGhpcy5idG5TdG9wLm9uY2xpY2sgICAgID0gdGhpcy5oYW5kbGVTdG9wLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5HZW5lcmF0ZS5vbmNsaWNrID0gdGhpcy5oYW5kbGVHZW5lcmF0ZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZS5vbmNsaWNrICAgICA9IHRoaXMuaGFuZGxlU2F2ZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuUmVjYWxsLm9uY2xpY2sgICA9IHRoaXMuaGFuZGxlTG9hZC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuT3B0aW9uLm9uY2xpY2sgICA9IHRoaXMuaGFuZGxlT3B0aW9uLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEhhcyB0byBleGVjdXRlIG9uIGEgZGVsYXksIGFzIHNwZWVjaCBjYW5jZWwgaXMgdW5yZWxpYWJsZSB3aXRob3V0IGl0XHJcbiAgICAgICAgdGhpcy5idG5QbGF5Lm9uY2xpY2sgPSBldiA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuUGxheS5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KHRoaXMuaGFuZGxlUGxheS5iaW5kKHRoaXMpLCAyMDApO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIEFkZCB0aHJvYiBjbGFzcyBpZiB0aGUgZ2VuZXJhdGUgYnV0dG9uIGhhc24ndCBiZWVuIGNsaWNrZWQgYmVmb3JlXHJcbiAgICAgICAgaWYgKCFSQUcuY29uZmlnLmNsaWNrZWRHZW5lcmF0ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuY2xhc3NMaXN0LmFkZCgndGhyb2InKTtcclxuICAgICAgICAgICAgdGhpcy5idG5HZW5lcmF0ZS5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuYnRuUGxheS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBwbGF5IGJ1dHRvbiwgcGxheWluZyB0aGUgZWRpdG9yJ3MgY3VycmVudCBwaHJhc2Ugd2l0aCBzcGVlY2ggKi9cclxuICAgIHByaXZhdGUgaGFuZGxlUGxheSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zcGVlY2gub25zdG9wID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuU3RvcC5oaWRkZW4gPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgICAgIFJBRy5zcGVlY2gub25zdG9wICAgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5idG5QbGF5LmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5idG5TdG9wLmhpZGRlbiAgID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5idG5QbGF5LmhpZGRlbiAgID0gdHJ1ZTtcclxuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIFJBRy52aWV3cy5lZGl0b3IuZ2V0VGV4dCgpICk7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5zcGVhayggUkFHLnZpZXdzLmVkaXRvci5nZXRQaHJhc2UoKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzdG9wIGJ1dHRvbiwgc3RvcHBpbmcgdGhlIG1hcnF1ZWUgYW5kIGFueSBzcGVlY2ggKi9cclxuICAgIHByaXZhdGUgaGFuZGxlU3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnN0b3AoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgZ2VuZXJhdGUgYnV0dG9uLCBnZW5lcmF0aW5nIG5ldyByYW5kb20gc3RhdGUgYW5kIHBocmFzZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVHZW5lcmF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFJlbW92ZSB0aGUgY2FsbC10by1hY3Rpb24gdGhyb2IgZnJvbSBpbml0aWFsIGxvYWRcclxuICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmNsYXNzTGlzdC5yZW1vdmUoJ3Rocm9iJyk7XHJcbiAgICAgICAgUkFHLmdlbmVyYXRlKCk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5jbGlja2VkR2VuZXJhdGUgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzYXZlIGJ1dHRvbiwgcGVyc2lzdGluZyB0aGUgY3VycmVudCB0cmFpbiBzdGF0ZSB0byBzdG9yYWdlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjc3MgPSAnZm9udC1zaXplOiBsYXJnZTsgZm9udC13ZWlnaHQ6IGJvbGQ7JztcclxuICAgICAgICAgICAgbGV0IHJhdyA9IEpTT04uc3RyaW5naWZ5KFJBRy5zdGF0ZSk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnc3RhdGUnLCByYXcpO1xyXG5cclxuICAgICAgICAgICAgY29uc29sZS5sb2coTC5TVEFURV9DT1BZX1BBU1RFKCksIGNzcyk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiUkFHLmxvYWQoJ1wiLCByYXcucmVwbGFjZShcIidcIiwgXCJcXFxcJ1wiKSwgXCInKVwiKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coTC5TVEFURV9SQVdfSlNPTigpLCBjc3MpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhyYXcpO1xyXG5cclxuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX1RPX1NUT1JBR0UoKSApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9TQVZFX0ZBSUwoZS5tZXNzYWdlKSApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgbG9hZCBidXR0b24sIGxvYWRpbmcgdHJhaW4gc3RhdGUgZnJvbSBzdG9yYWdlLCBpZiBpdCBleGlzdHMgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlTG9hZCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBkYXRhID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdzdGF0ZScpO1xyXG5cclxuICAgICAgICByZXR1cm4gZGF0YVxyXG4gICAgICAgICAgICA/IFJBRy5sb2FkKGRhdGEpXHJcbiAgICAgICAgICAgIDogUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX1NBVkVfTUlTU0lORygpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNldHRpbmdzIGJ1dHRvbiwgb3BlbmluZyB0aGUgc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwcml2YXRlIGhhbmRsZU9wdGlvbigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy52aWV3cy5zZXR0aW5ncy5vcGVuKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYW5hZ2VzIFVJIGVsZW1lbnRzIGFuZCB0aGVpciBsb2dpYyAqL1xyXG5jbGFzcyBWaWV3c1xyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIGVkaXRvciBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZWRpdG9yICAgOiBFZGl0b3I7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIG1hcnF1ZWUgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IG1hcnF1ZWUgIDogTWFycXVlZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHNldHRpbmdzIDogU2V0dGluZ3M7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIHRvb2xiYXIgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHRvb2xiYXIgIDogVG9vbGJhcjtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGFsbCB0aGUgcGlja2Vycywgb25lIGZvciBlYWNoIHR5cGUgb2YgWE1MIGVsZW1lbnQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcGlja2VycyAgOiBEaWN0aW9uYXJ5PFBpY2tlcj47XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmVkaXRvciAgID0gbmV3IEVkaXRvcigpO1xyXG4gICAgICAgIHRoaXMubWFycXVlZSAgPSBuZXcgTWFycXVlZSgpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBuZXcgU2V0dGluZ3MoKTtcclxuICAgICAgICB0aGlzLnRvb2xiYXIgID0gbmV3IFRvb2xiYXIoKTtcclxuICAgICAgICB0aGlzLnBpY2tlcnMgID0ge307XHJcblxyXG4gICAgICAgIFtcclxuICAgICAgICAgICAgbmV3IENvYWNoUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBFeGN1c2VQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IEludGVnZXJQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IE5hbWVkUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBQaHJhc2VzZXRQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFBsYXRmb3JtUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTZXJ2aWNlUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTdGF0aW9uUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTdGF0aW9uTGlzdFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgVGltZVBpY2tlcigpXHJcbiAgICAgICAgXS5mb3JFYWNoKHBpY2tlciA9PiB0aGlzLnBpY2tlcnNbcGlja2VyLnhtbFRhZ10gPSBwaWNrZXIpO1xyXG5cclxuICAgICAgICAvLyBHbG9iYWwgaG90a2V5c1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkub25rZXlkb3duID0gdGhpcy5vbklucHV0LmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGlPUy1zcGVjaWZpYyBDU1MgZml4ZXNcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoJ2lvcycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBwaWNrZXIgdGhhdCBoYW5kbGVzIGEgZ2l2ZW4gdGFnLCBpZiBhbnkgKi9cclxuICAgIHB1YmxpYyBnZXRQaWNrZXIoeG1sVGFnOiBzdHJpbmcpIDogUGlja2VyXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucGlja2Vyc1t4bWxUYWddO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGUgRVNDIHRvIGNsb3NlIHBpY2tlcnMgb3Igc2V0dGlnbnMgKi9cclxuICAgIHByaXZhdGUgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGV2LmtleSAhPT0gJ0VzY2FwZScpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzLmNsb3NlKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCBjb2xsYXBzaWJsZSBlbGVtZW50cyAqL1xyXG5jbGFzcyBDb2xsYXBzaWJsZXNcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNwYW4gVGhlIGVuY2Fwc3VsYXRpbmcgY29sbGFwc2libGUgZWxlbWVudFxyXG4gICAgICogQHBhcmFtIHRvZ2dsZSBUaGUgdG9nZ2xlIGNoaWxkIG9mIHRoZSBjb2xsYXBzaWJsZSBlbGVtZW50XHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgVHJ1ZSB0byBjb2xsYXBzZSwgZmFsc2UgdG8gb3BlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNldChzcGFuOiBIVE1MRWxlbWVudCwgdG9nZ2xlOiBIVE1MRWxlbWVudCwgc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgID0gc3Bhbi5kYXRhc2V0WydyZWYnXSB8fCAnPz8/JztcclxuICAgICAgICBsZXQgdHlwZSA9IHNwYW4uZGF0YXNldFsndHlwZSddITtcclxuXHJcbiAgICAgICAgaWYgKHN0YXRlKSBzcGFuLnNldEF0dHJpYnV0ZSgnY29sbGFwc2VkJywgJycpO1xyXG4gICAgICAgIGVsc2UgICAgICAgc3Bhbi5yZW1vdmVBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpO1xyXG5cclxuICAgICAgICB0b2dnbGUudGl0bGUgPSBzdGF0ZVxyXG4gICAgICAgICAgICA/IEwuVElUTEVfT1BUX09QRU4odHlwZSwgcmVmKVxyXG4gICAgICAgICAgICA6IEwuVElUTEVfT1BUX0NMT1NFKHR5cGUsIHJlZik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBTdWdhciBmb3IgY2hvb3Npbmcgc2Vjb25kIHZhbHVlIGlmIGZpcnN0IGlzIHVuZGVmaW5lZCwgaW5zdGVhZCBvZiBmYWxzeSAqL1xyXG5mdW5jdGlvbiBlaXRoZXI8VD4odmFsdWU6IFQgfCB1bmRlZmluZWQsIHZhbHVlMjogVCkgOiBUXHJcbntcclxuICAgIHJldHVybiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkgPyB2YWx1ZTIgOiB2YWx1ZTtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIHRoZSBET00gKi9cclxuY2xhc3MgRE9NXHJcbntcclxuICAgIC8qKiBXaGV0aGVyIHRoZSB3aW5kb3cgaXMgdGhpbm5lciB0aGFuIGEgc3BlY2lmaWMgc2l6ZSAoYW5kLCB0aHVzLCBpcyBcIm1vYmlsZVwiKSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgaXNNb2JpbGUoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aCA8PSA1MDA7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgUkFHIGFwcGVhcnMgdG8gYmUgcnVubmluZyBvbiBhbiBpT1MgZGV2aWNlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBpc2lPUygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3IucGxhdGZvcm0ubWF0Y2goL2lQaG9uZXxpUG9kfGlQYWQvZ2kpICE9PSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBhdHRyaWJ1dGUgZnJvbSB0aGUgZ2l2ZW4gZWxlbWVudCwgb3IgcmV0dXJucyB0aGUgZ2l2ZW5cclxuICAgICAqIGRlZmF1bHQgdmFsdWUgaWYgdW5zZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGF0dHJpYnV0ZSBvZlxyXG4gICAgICogQHBhcmFtIGF0dHIgTmFtZSBvZiB0aGUgYXR0cmlidXRlIHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEBwYXJhbSBkZWYgRGVmYXVsdCB2YWx1ZSBpZiBhdHRyaWJ1dGUgaXNuJ3Qgc2V0XHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gYXR0cmlidXRlJ3MgdmFsdWUsIG9yIGRlZmF1bHQgdmFsdWUgaWYgdW5zZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRBdHRyKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBhdHRyOiBzdHJpbmcsIGRlZjogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBlbGVtZW50Lmhhc0F0dHJpYnV0ZShhdHRyKVxyXG4gICAgICAgICAgICA/IGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHIpIVxyXG4gICAgICAgICAgICA6IGRlZjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIGFuIGVsZW1lbnQgZnJvbSB0aGUgZ2l2ZW4gZG9jdW1lbnQsIHRocm93aW5nIGFuIGVycm9yIGlmIG5vIG1hdGNoIGlzIGZvdW5kLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBxdWVyeSBDU1Mgc2VsZWN0b3IgcXVlcnkgdG8gdXNlXHJcbiAgICAgKiBAcGFyYW0gcGFyZW50IFBhcmVudCBvYmplY3QgdG8gc2VhcmNoOyBkZWZhdWx0cyB0byBkb2N1bWVudFxyXG4gICAgICogQHJldHVybnMgVGhlIGZpcnN0IGVsZW1lbnQgdG8gbWF0Y2ggdGhlIGdpdmVuIHF1ZXJ5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZTxUIGV4dGVuZHMgSFRNTEVsZW1lbnQ+XHJcbiAgICAgICAgKHF1ZXJ5OiBzdHJpbmcsIHBhcmVudDogUGFyZW50Tm9kZSA9IHdpbmRvdy5kb2N1bWVudClcclxuICAgICAgICA6IFRcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gcGFyZW50LnF1ZXJ5U2VsZWN0b3IocXVlcnkpIGFzIFQ7XHJcblxyXG4gICAgICAgIGlmICghcmVzdWx0KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5ET01fTUlTU0lORyhxdWVyeSkgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gYXR0cmlidXRlIGZyb20gdGhlIGdpdmVuIGVsZW1lbnQsIHRocm93aW5nIGFuIGVycm9yXHJcbiAgICAgKiBpZiB0aGUgYXR0cmlidXRlIGlzIG1pc3NpbmcuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGF0dHJpYnV0ZSBvZlxyXG4gICAgICogQHBhcmFtIGF0dHIgTmFtZSBvZiB0aGUgYXR0cmlidXRlIHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBhdHRyaWJ1dGUncyB2YWx1ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmVBdHRyKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBhdHRyOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhZWxlbWVudC5oYXNBdHRyaWJ1dGUoYXR0cikgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5BVFRSX01JU1NJTkcoYXR0cikgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHIpITtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4ga2V5IG9mIHRoZSBnaXZlbiBlbGVtZW50J3MgZGF0YXNldCwgdGhyb3dpbmcgYW4gZXJyb3JcclxuICAgICAqIGlmIHRoZSB2YWx1ZSBpcyBtaXNzaW5nIG9yIGVtcHR5LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBkYXRhIG9mXHJcbiAgICAgKiBAcGFyYW0ga2V5IEtleSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gZGF0YXNldCdzIHZhbHVlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZURhdGEoZWxlbWVudDogSFRNTEVsZW1lbnQsIGtleTogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCB2YWx1ZSA9IGVsZW1lbnQuZGF0YXNldFtrZXldO1xyXG5cclxuICAgICAgICBpZiAoIFN0cmluZ3MuaXNOdWxsT3JFbXB0eSh2YWx1ZSkgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5EQVRBX01JU1NJTkcoa2V5KSApO1xyXG5cclxuICAgICAgICByZXR1cm4gdmFsdWUhO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQmx1cnMgKHVuZm9jdXNlcykgdGhlIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBhcmVudCBJZiBnaXZlbiwgb25seSBibHVycyBpZiBhY3RpdmUgaXMgZGVzY2VuZGFudFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJsdXJBY3RpdmUocGFyZW50OiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmJvZHkpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBhY3RpdmUgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIGFjdGl2ZSAmJiBhY3RpdmUuYmx1ciAmJiBwYXJlbnQuY29udGFpbnMoYWN0aXZlKSApXHJcbiAgICAgICAgICAgIGFjdGl2ZS5ibHVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBEZWVwIGNsb25lcyBhbGwgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50LCBpbnRvIHRoZSB0YXJnZXQgZWxlbWVudC5cclxuICAgICAqIFVzaW5nIGlubmVySFRNTCB3b3VsZCBiZSBlYXNpZXIsIGhvd2V2ZXIgaXQgaGFuZGxlcyBzZWxmLWNsb3NpbmcgdGFncyBwb29ybHkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNvdXJjZSBFbGVtZW50IHdob3NlIGNoaWxkcmVuIHRvIGNsb25lXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVsZW1lbnQgdG8gYXBwZW5kIHRoZSBjbG9uZWQgY2hpbGRyZW4gdG9cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjbG9uZUludG8oc291cmNlOiBIVE1MRWxlbWVudCwgdGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzb3VyY2UuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgdGFyZ2V0LmFwcGVuZENoaWxkKCBzb3VyY2UuY2hpbGROb2Rlc1tpXS5jbG9uZU5vZGUodHJ1ZSkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN1Z2FyIGZvciBjcmVhdGluZyBhbmQgYWRkaW5nIGFuIG9wdGlvbiBlbGVtZW50IHRvIGEgc2VsZWN0IGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBTZWxlY3QgbGlzdCBlbGVtZW50IHRvIGFkZCB0aGUgb3B0aW9uIHRvXHJcbiAgICAgKiBAcGFyYW0gdGV4dCBMYWJlbCBmb3IgdGhlIG9wdGlvblxyXG4gICAgICogQHBhcmFtIHZhbHVlIFZhbHVlIGZvciB0aGUgb3B0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYWRkT3B0aW9uKHNlbGVjdDogSFRNTFNlbGVjdEVsZW1lbnQsIHRleHQ6IHN0cmluZywgdmFsdWU6IHN0cmluZyA9ICcnKVxyXG4gICAgICAgIDogSFRNTE9wdGlvbkVsZW1lbnRcclxuICAgIHtcclxuICAgICAgICBsZXQgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJykgYXMgSFRNTE9wdGlvbkVsZW1lbnQ7XHJcblxyXG4gICAgICAgIG9wdGlvbi50ZXh0ICA9IHRleHQ7XHJcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gdmFsdWU7XHJcblxyXG4gICAgICAgIHNlbGVjdC5hZGQob3B0aW9uKTtcclxuICAgICAgICByZXR1cm4gb3B0aW9uO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdGV4dCBjb250ZW50IG9mIHRoZSBnaXZlbiBlbGVtZW50LCBleGNsdWRpbmcgdGhlIHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuLlxyXG4gICAgICogQmUgd2FybmVkOyB0aGlzIG1ldGhvZCB1c2VzIFJBRy1zcGVjaWZpYyBjb2RlLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE5OTg2MzI4XHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIHJlY3Vyc2l2ZWx5IGdldCB0ZXh0IGNvbnRlbnQgb2ZcclxuICAgICAqIEByZXR1cm5zIFRleHQgY29udGVudCBvZiBnaXZlbiBlbGVtZW50LCB3aXRob3V0IHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0VmlzaWJsZVRleHQoZWxlbWVudDogRWxlbWVudCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAgICAgIChlbGVtZW50Lm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQgfHwgJyc7XHJcbiAgICAgICAgZWxzZSBpZiAoIGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCd0b2dnbGUnKSApXHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuXHJcbiAgICAgICAgLy8gUmV0dXJuIGJsYW5rIChza2lwKSBpZiBjaGlsZCBvZiBhIGNvbGxhcHNlZCBlbGVtZW50LiBQcmV2aW91c2x5LCB0aGlzIHVzZWRcclxuICAgICAgICAvLyBnZXRDb21wdXRlZFN0eWxlLCBidXQgdGhhdCBkb2Vzbid0IHdvcmsgaWYgdGhlIGVsZW1lbnQgaXMgcGFydCBvZiBhbiBvcnBoYW5lZFxyXG4gICAgICAgIC8vIHBocmFzZSAoYXMgaGFwcGVucyB3aXRoIHRoZSBwaHJhc2VzZXQgcGlja2VyKS5cclxuICAgICAgICBsZXQgcGFyZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIHBhcmVudCAmJiBwYXJlbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuXHJcbiAgICAgICAgbGV0IHRleHQgPSAnJztcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgdGV4dCArPSBET00uZ2V0VmlzaWJsZVRleHQoZWxlbWVudC5jaGlsZE5vZGVzW2ldIGFzIEVsZW1lbnQpO1xyXG5cclxuICAgICAgICByZXR1cm4gdGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHRleHQgY29udGVudCBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgZXhjbHVkaW5nIHRoZSB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlbixcclxuICAgICAqIGFuZCBleGNlc3Mgd2hpdGVzcGFjZSBhcyBhIHJlc3VsdCBvZiBjb252ZXJ0aW5nIGZyb20gSFRNTC9YTUwuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gcmVjdXJzaXZlbHkgZ2V0IHRleHQgY29udGVudCBvZlxyXG4gICAgICogQHJldHVybnMgQ2xlYW5lZCB0ZXh0IG9mIGdpdmVuIGVsZW1lbnQsIHdpdGhvdXQgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRDbGVhbmVkVmlzaWJsZVRleHQoZWxlbWVudDogRWxlbWVudCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gU3RyaW5ncy5jbGVhbiggRE9NLmdldFZpc2libGVUZXh0KGVsZW1lbnQpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTY2FucyBmb3IgdGhlIG5leHQgZm9jdXNhYmxlIHNpYmxpbmcgZnJvbSBhIGdpdmVuIGVsZW1lbnQsIHNraXBwaW5nIGhpZGRlbiBvclxyXG4gICAgICogdW5mb2N1c2FibGUgZWxlbWVudHMuIElmIHRoZSBlbmQgb2YgdGhlIGNvbnRhaW5lciBpcyBoaXQsIHRoZSBzY2FuIHdyYXBzIGFyb3VuZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZnJvbSBFbGVtZW50IHRvIHN0YXJ0IHNjYW5uaW5nIGZyb21cclxuICAgICAqIEBwYXJhbSBkaXIgRGlyZWN0aW9uOyAtMSBmb3IgbGVmdCAocHJldmlvdXMpLCAxIGZvciByaWdodCAobmV4dClcclxuICAgICAqIEByZXR1cm5zIFRoZSBuZXh0IGF2YWlsYWJsZSBzaWJsaW5nLCBvciBudWxsIGlmIG5vbmUgZm91bmRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXROZXh0Rm9jdXNhYmxlU2libGluZyhmcm9tOiBIVE1MRWxlbWVudCwgZGlyOiBudW1iZXIpXHJcbiAgICAgICAgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICBsZXQgY3VycmVudCA9IGZyb207XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBmcm9tLnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICghcGFyZW50KVxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRydWUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBQcm9jZWVkIHRvIG5leHQgZWxlbWVudCwgb3Igd3JhcCBhcm91bmQgaWYgaGl0IHRoZSBlbmQgb2YgcGFyZW50XHJcbiAgICAgICAgICAgIGlmICAgICAgKGRpciA8IDApXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgcGFyZW50Lmxhc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA+IDApXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBwYXJlbnQuZmlyc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkJBRF9ESVJFQ1RJT04oIGRpci50b1N0cmluZygpICkgKTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGNvbWUgYmFjayB0byB0aGUgc3RhcnRpbmcgZWxlbWVudCwgbm90aGluZyB3YXMgZm91bmRcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnQgPT09IGZyb20pXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMgZWxlbWVudCBpc24ndCBoaWRkZW4gYW5kIGlzIGZvY3VzYWJsZSwgcmV0dXJuIGl0IVxyXG4gICAgICAgICAgICBpZiAoICFjdXJyZW50LmhpZGRlbiApXHJcbiAgICAgICAgICAgIGlmICggY3VycmVudC5oYXNBdHRyaWJ1dGUoJ3RhYmluZGV4JykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBlbGVtZW50LCByZWxldmFudCB0byBpdHMgcGFyZW50LlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIGVsZW1lbnQgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluZGV4T2YoY2hpbGQ6IEhUTUxFbGVtZW50KSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGRyZW4sIGNoaWxkKVxyXG4gICAgICAgICAgICA6IC0xO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBub2RlLCByZWxldmFudCB0byBpdHMgcGFyZW50LiBVc2VkIGZvciB0ZXh0IG5vZGVzLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIG5vZGUgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG5vZGVJbmRleE9mKGNoaWxkOiBOb2RlKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnROb2RlO1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGROb2RlcywgY2hpbGQpXHJcbiAgICAgICAgICAgIDogLTE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUb2dnbGVzIHRoZSBoaWRkZW4gYXR0cmlidXRlIG9mIHRoZSBnaXZlbiBlbGVtZW50LCBhbmQgYWxsIGl0cyBsYWJlbHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byB0b2dnbGUgdGhlIGhpZGRlbiBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBmb3JjZSBPcHRpb25hbCB2YWx1ZSB0byBmb3JjZSB0b2dnbGluZyB0b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRvZ2dsZUhpZGRlbihlbGVtZW50OiBIVE1MRWxlbWVudCwgZm9yY2U/OiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaGlkZGVuID0gIWVsZW1lbnQuaGlkZGVuO1xyXG5cclxuICAgICAgICAvLyBEbyBub3RoaW5nIGlmIGFscmVhZHkgdG9nZ2xlZCB0byB0aGUgZm9yY2VkIHN0YXRlXHJcbiAgICAgICAgaWYgKGhpZGRlbiA9PT0gZm9yY2UpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgZWxlbWVudC5oaWRkZW4gPSBoaWRkZW47XHJcblxyXG4gICAgICAgIGlmIChlbGVtZW50LmxhYmVscylcclxuICAgICAgICAgICAgZWxlbWVudC5sYWJlbHMuZm9yRWFjaChsID0+IGwuaGlkZGVuID0gaGlkZGVuKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRvZ2dsZXMgdGhlIGhpZGRlbiBhdHRyaWJ1dGUgb2YgYSBncm91cCBvZiBlbGVtZW50cywgaW4gYnVsay5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbGlzdCBBbiBhcnJheSBvZiBhcmd1bWVudCBwYWlycyBmb3Ige3RvZ2dsZUhpZGRlbn1cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0b2dnbGVIaWRkZW5BbGwoLi4ubGlzdDogW0hUTUxFbGVtZW50LCBib29sZWFuP11bXSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGlzdC5mb3JFYWNoKCBsID0+IHRoaXMudG9nZ2xlSGlkZGVuKC4uLmwpICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBBIHZlcnksIHZlcnkgc21hbGwgc3Vic2V0IG9mIE1hcmtkb3duIGZvciBoeXBlcmxpbmtpbmcgYSBibG9jayBvZiB0ZXh0ICovXHJcbmNsYXNzIExpbmtkb3duXHJcbntcclxuICAgIC8qKiBSZWdleCBwYXR0ZXJuIGZvciBtYXRjaGluZyBsaW5rZWQgdGV4dCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVHRVhfTElOSyA9IC9cXFsoLis/KVxcXS9naTtcclxuICAgIC8qKiBSZWdleCBwYXR0ZXJuIGZvciBtYXRjaGluZyBsaW5rIHJlZmVyZW5jZXMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX1JFRiAgPSAvXFxbKFxcZCspXFxdOlxccysoXFxTKykvZ2k7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQYXJzZXMgdGhlIHRleHQgb2YgdGhlIGdpdmVuIGJsb2NrIGFzIExpbmtkb3duLCBjb252ZXJ0aW5nIHRhZ2dlZCB0ZXh0IGludG8gbGlua3NcclxuICAgICAqIHVzaW5nIGEgZ2l2ZW4gbGlzdCBvZiBpbmRleC1iYXNlZCByZWZlcmVuY2VzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBibG9jayBFbGVtZW50IHdpdGggdGV4dCB0byByZXBsYWNlOyBhbGwgY2hpbGRyZW4gY2xlYXJlZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlKGJsb2NrOiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGxpbmtzIDogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICAgICAgLy8gRmlyc3QsIGdldCB0aGUgbGlzdCBvZiByZWZlcmVuY2VzLCByZW1vdmluZyB0aGVtIGZyb20gdGhlIHRleHRcclxuICAgICAgICBsZXQgaWR4ICA9IDA7XHJcbiAgICAgICAgbGV0IHRleHQgPSBibG9jay5pbm5lclRleHQucmVwbGFjZSh0aGlzLlJFR0VYX1JFRiwgKF8sIGssIHYpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsaW5rc1sgcGFyc2VJbnQoaykgXSA9IHY7XHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgcmVwbGFjZSBlYWNoIHRhZ2dlZCBwYXJ0IG9mIHRleHQgd2l0aCBhIGxpbmsgZWxlbWVudFxyXG4gICAgICAgIGJsb2NrLmlubmVySFRNTCA9IHRleHQucmVwbGFjZSh0aGlzLlJFR0VYX0xJTkssIChfLCB0KSA9PlxyXG4gICAgICAgICAgICBgPGEgaHJlZj0nJHtsaW5rc1tpZHgrK119JyB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub29wZW5lclwiPiR7dH08L2E+YFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIHBhcnNpbmcgZGF0YSBmcm9tIHN0cmluZ3MgKi9cclxuY2xhc3MgUGFyc2Vcclxue1xyXG4gICAgLyoqIFBhcnNlcyBhIGdpdmVuIHN0cmluZyBpbnRvIGEgYm9vbGVhbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sZWFuKHN0cjogc3RyaW5nKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICBzdHIgPSBzdHIudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgICAgICAgaWYgKHN0ciA9PT0gJ3RydWUnIHx8IHN0ciA9PT0gJzEnKVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBpZiAoc3RyID09PSAnZmFsc2UnIHx8IHN0ciA9PT0gJzAnKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIHRocm93IEVycm9yKCBMLkJBRF9CT09MRUFOKHN0cikgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZ2VuZXJhdGluZyByYW5kb20gZGF0YSAqL1xyXG5jbGFzcyBSYW5kb21cclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSBpbnRlZ2VyIGZyb20gdGhlIGdpdmVuIHJhbmdlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBtaW4gTWluaW11bSBpbnRlZ2VyIHRvIHBpY2ssIGluY2x1c2l2ZVxyXG4gICAgICogQHBhcmFtIG1heCBNYXhpbXVtIGludGVnZXIgdG8gcGljaywgaW5jbHVzaXZlXHJcbiAgICAgKiBAcmV0dXJucyBSYW5kb20gaW50ZWdlciB3aXRoaW4gdGhlIGdpdmVuIHJhbmdlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50KG1pbjogbnVtYmVyID0gMCwgbWF4OiBudW1iZXIgPSAxKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBNYXRoLmZsb29yKCBNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbikgKSArIG1pbjtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gZWxlbWVudCBmcm9tIGEgZ2l2ZW4gYXJyYXktbGlrZSBvYmplY3Qgd2l0aCBhIGxlbmd0aCBwcm9wZXJ0eSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhcnJheShhcnI6IExlbmd0aGFibGUpIDogYW55XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGFyclsgUmFuZG9tLmludCgwLCBhcnIubGVuZ3RoKSBdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTcGxpY2VzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFycmF5U3BsaWNlPFQ+KGFycjogVFtdKSA6IFRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gYXJyLnNwbGljZShSYW5kb20uaW50KDAsIGFyci5sZW5ndGgpLCAxKVswXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20ga2V5IGZyb20gYSBnaXZlbiBvYmplY3QgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgb2JqZWN0S2V5KG9iajoge30pIDogYW55XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSggT2JqZWN0LmtleXMob2JqKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgdHJ1ZSBvciBmYWxzZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIENoYW5jZSBvdXQgb2YgMTAwLCB0byBwaWNrIGB0cnVlYFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJvb2woY2hhbmNlOiBudW1iZXIgPSA1MCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5pbnQoMCwgMTAwKSA8IGNoYW5jZTtcclxuICAgIH1cclxufVxyXG4iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IGNsYXNzIGZvciBhdWRpbyBmdW5jdGlvbmFsaXR5ICovXHJcbmNsYXNzIFNvdW5kc1xyXG57XHJcbiAgICAvKipcclxuICAgICAqIERlY29kZXMgdGhlIGdpdmVuIGF1ZGlvIGZpbGUgaW50byByYXcgYXVkaW8gZGF0YS4gVGhpcyBpcyBhIHdyYXBwZXIgZm9yIHRoZSBvbGRlclxyXG4gICAgICogY2FsbGJhY2stYmFzZWQgc3ludGF4LCBzaW5jZSBpdCBpcyB0aGUgb25seSBvbmUgaU9TIGN1cnJlbnRseSBzdXBwb3J0cy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBBdWRpbyBjb250ZXh0IHRvIHVzZSBmb3IgZGVjb2RpbmdcclxuICAgICAqIEBwYXJhbSBidWZmZXIgQnVmZmVyIG9mIGVuY29kZWQgZmlsZSBkYXRhIChlLmcuIG1wMykgdG8gZGVjb2RlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXN5bmMgZGVjb2RlKGNvbnRleHQ6IEF1ZGlvQ29udGV4dCwgYnVmZmVyOiBBcnJheUJ1ZmZlcilcclxuICAgICAgICA6IFByb21pc2U8QXVkaW9CdWZmZXI+XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlIDxBdWRpb0J1ZmZlcj4gKCAocmVzb2x2ZSwgcmVqZWN0KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQuZGVjb2RlQXVkaW9EYXRhKGJ1ZmZlciwgcmVzb2x2ZSwgcmVqZWN0KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIHN0cmluZ3MgKi9cclxuY2xhc3MgU3RyaW5nc1xyXG57XHJcbiAgICAvKiogQ2hlY2tzIGlmIHRoZSBnaXZlbiBzdHJpbmcgaXMgbnVsbCwgb3IgZW1wdHkgKHdoaXRlc3BhY2Ugb25seSBvciB6ZXJvLWxlbmd0aCkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNOdWxsT3JFbXB0eShzdHI6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiAhc3RyIHx8ICFzdHIudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJldHR5LXByaW50J3MgYSBnaXZlbiBsaXN0IG9mIHN0YXRpb25zLCB3aXRoIGNvbnRleHQgc2Vuc2l0aXZlIGV4dHJhcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZXMgTGlzdCBvZiBzdGF0aW9uIGNvZGVzIHRvIGpvaW5cclxuICAgICAqIEBwYXJhbSBjb250ZXh0IExpc3QncyBjb250ZXh0LiBJZiAnY2FsbGluZycsIGhhbmRsZXMgc3BlY2lhbCBjYXNlXHJcbiAgICAgKiBAcmV0dXJucyBQcmV0dHktcHJpbnRlZCBsaXN0IG9mIGdpdmVuIHN0YXRpb25zXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbVN0YXRpb25MaXN0KGNvZGVzOiBzdHJpbmdbXSwgY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSAnJztcclxuICAgICAgICBsZXQgbmFtZXMgID0gY29kZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgbmFtZXMuZm9yRWFjaCggKGMsIGkpID0+IG5hbWVzW2ldID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oYykgKTtcclxuXHJcbiAgICAgICAgaWYgKG5hbWVzLmxlbmd0aCA9PT0gMSlcclxuICAgICAgICAgICAgcmVzdWx0ID0gKGNvbnRleHQgPT09ICdjYWxsaW5nJylcclxuICAgICAgICAgICAgICAgID8gYCR7bmFtZXNbMF19IG9ubHlgXHJcbiAgICAgICAgICAgICAgICA6IG5hbWVzWzBdO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsYXN0U3RhdGlvbiA9IG5hbWVzLnBvcCgpO1xyXG5cclxuICAgICAgICAgICAgcmVzdWx0ICA9IG5hbWVzLmpvaW4oJywgJyk7XHJcbiAgICAgICAgICAgIHJlc3VsdCArPSBgIGFuZCAke2xhc3RTdGF0aW9ufWA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJldHR5LXByaW50cyB0aGUgZ2l2ZW4gZGF0ZSBvciBob3VycyBhbmQgbWludXRlcyBpbnRvIGEgMjQtaG91ciB0aW1lIChlLmcuIDAxOjA5KS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaG91cnMgSG91cnMsIGZyb20gMCB0byAyMywgb3IgRGF0ZSBvYmplY3RcclxuICAgICAqIEBwYXJhbSBtaW51dGVzIE1pbnV0ZXMsIGZyb20gMCB0byA1OVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21UaW1lKGhvdXJzOiBudW1iZXIgfCBEYXRlLCBtaW51dGVzOiBudW1iZXIgPSAwKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmIChob3VycyBpbnN0YW5jZW9mIERhdGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBtaW51dGVzID0gaG91cnMuZ2V0TWludXRlcygpO1xyXG4gICAgICAgICAgICBob3VycyAgID0gaG91cnMuZ2V0SG91cnMoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBob3Vycy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJykgKyAnOicgK1xyXG4gICAgICAgICAgICBtaW51dGVzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYW5zIHVwIHRoZSBnaXZlbiB0ZXh0IG9mIGV4Y2VzcyB3aGl0ZXNwYWNlIGFuZCBhbnkgbmV3bGluZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2xlYW4odGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0ZXh0LnRyaW0oKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xcblxccl0vZ2ksICAgJycgIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcc3syLH0vZ2ksICAgJyAnIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccyhbLixdKS9naSwgJyQxJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0cm9uZ2x5IGNvbXByZXNzZXMgdGhlIGdpdmVuIHN0cmluZyB0byBvbmUgbW9yZSBmaWxlbmFtZSBmcmllbmRseSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaWxlbmFtZSh0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRleHRcclxuICAgICAgICAgICAgLnRvTG93ZXJDYXNlKClcclxuICAgICAgICAgICAgLy8gUmVwbGFjZSBwbHVyYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pZXNcXGIvZywgJ3knKVxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgY29tbW9uIHdvcmRzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGIoYXxhbnxhdHxiZXxvZnxvbnx0aGV8dG98aW58aXN8aGFzfGJ5fHdpdGgpXFxiL2csICcnKVxyXG4gICAgICAgICAgICAudHJpbSgpXHJcbiAgICAgICAgICAgIC8vIENvbnZlcnQgc3BhY2VzIHRvIHVuZGVyc2NvcmVzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMrL2csICdfJylcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGFsbCBub24tYWxwaGFudW1lcmljYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXmEtejAtOV9dL2csICcnKVxyXG4gICAgICAgICAgICAvLyBMaW1pdCB0byAxMDAgY2hhcnM7IG1vc3Qgc3lzdGVtcyBzdXBwb3J0IG1heC4gMjU1IGJ5dGVzIGluIGZpbGVuYW1lc1xyXG4gICAgICAgICAgICAuc3Vic3RyaW5nKDAsIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGZpcnN0IG1hdGNoIG9mIGEgcGF0dGVybiBpbiBhIHN0cmluZywgb3IgdW5kZWZpbmVkIGlmIG5vdCBmb3VuZCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaXJzdE1hdGNoKHRleHQ6IHN0cmluZywgcGF0dGVybjogUmVnRXhwLCBpZHg6IG51bWJlcilcclxuICAgICAgICA6IHN0cmluZyB8IHVuZGVmaW5lZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBtYXRjaCA9IHRleHQubWF0Y2gocGF0dGVybik7XHJcblxyXG4gICAgICAgIHJldHVybiAobWF0Y2ggJiYgbWF0Y2hbaWR4XSlcclxuICAgICAgICAgICAgPyBtYXRjaFtpZHhdXHJcbiAgICAgICAgICAgIDogdW5kZWZpbmVkO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVW5pb24gdHlwZSBmb3IgaXRlcmFibGUgdHlwZXMgd2l0aCBhIC5sZW5ndGggcHJvcGVydHkgKi9cclxudHlwZSBMZW5ndGhhYmxlID0gQXJyYXk8YW55PiB8IE5vZGVMaXN0IHwgSFRNTENvbGxlY3Rpb24gfCBzdHJpbmc7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHBsYXRmb3JtIGFzIGEgZGlnaXQgYW5kIG9wdGlvbmFsIGxldHRlciB0dXBsZSAqL1xyXG50eXBlIFBsYXRmb3JtID0gW3N0cmluZywgc3RyaW5nXTtcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgZ2VuZXJpYyBrZXktdmFsdWUgZGljdGlvbmFyeSwgd2l0aCBzdHJpbmcga2V5cyAqL1xyXG50eXBlIERpY3Rpb25hcnk8VD4gPSB7IFtpbmRleDogc3RyaW5nXTogVCB9O1xyXG5cclxuLyoqIERlZmluZXMgdGhlIGRhdGEgcmVmZXJlbmNlcyBjb25maWcgb2JqZWN0IHBhc3NlZCBpbnRvIFJBRy5tYWluIG9uIGluaXQgKi9cclxuaW50ZXJmYWNlIERhdGFSZWZzXHJcbntcclxuICAgIC8qKiBTZWxlY3RvciBmb3IgZ2V0dGluZyB0aGUgcGhyYXNlIHNldCBYTUwgSUZyYW1lIGVsZW1lbnQgKi9cclxuICAgIHBocmFzZXNldEVtYmVkIDogc3RyaW5nO1xyXG4gICAgLyoqIFJhdyBhcnJheSBvZiBleGN1c2VzIGZvciB0cmFpbiBkZWxheXMgb3IgY2FuY2VsbGF0aW9ucyB0byB1c2UgKi9cclxuICAgIGV4Y3VzZXNEYXRhICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIG5hbWVzIGZvciBzcGVjaWFsIHRyYWlucyB0byB1c2UgKi9cclxuICAgIG5hbWVkRGF0YSAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIG5hbWVzIGZvciBzZXJ2aWNlcy9uZXR3b3JrcyB0byB1c2UgKi9cclxuICAgIHNlcnZpY2VzRGF0YSAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBjb2RlcyBhbmQgbmFtZXMgdG8gdXNlICovXHJcbiAgICBzdGF0aW9uc0RhdGEgICA6IERpY3Rpb25hcnk8c3RyaW5nPjtcclxufVxyXG5cclxuLyoqIEZpbGwgaW5zIGZvciB2YXJpb3VzIG1pc3NpbmcgZGVmaW5pdGlvbnMgb2YgbW9kZXJuIEphdmFzY3JpcHQgZmVhdHVyZXMgKi9cclxuXHJcbmludGVyZmFjZSBXaW5kb3dcclxue1xyXG4gICAgb251bmhhbmRsZWRyZWplY3Rpb246IEVycm9yRXZlbnRIYW5kbGVyO1xyXG59XHJcblxyXG5kZWNsYXJlIHZhciB3ZWJraXRBdWRpb0NvbnRleHQ6XHJcbntcclxuICAgIHByb3RvdHlwZTogQXVkaW9Db250ZXh0O1xyXG4gICAgbmV3KGNvbnRleHRPcHRpb25zPzogQXVkaW9Db250ZXh0T3B0aW9ucyk6IEF1ZGlvQ29udGV4dDtcclxufTtcclxuXHJcbmRlY2xhcmUgdmFyIG1vekF1ZGlvQ29udGV4dDpcclxue1xyXG4gICAgcHJvdG90eXBlOiBBdWRpb0NvbnRleHQ7XHJcbiAgICBuZXcoY29udGV4dE9wdGlvbnM/OiBBdWRpb0NvbnRleHRPcHRpb25zKTogQXVkaW9Db250ZXh0O1xyXG59O1xyXG5cclxuaW50ZXJmYWNlIFN0cmluZ1xyXG57XHJcbiAgICBwYWRTdGFydCh0YXJnZXRMZW5ndGg6IG51bWJlciwgcGFkU3RyaW5nPzogc3RyaW5nKSA6IHN0cmluZztcclxuICAgIHBhZEVuZCh0YXJnZXRMZW5ndGg6IG51bWJlciwgcGFkU3RyaW5nPzogc3RyaW5nKSA6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEFycmF5PFQ+XHJcbntcclxuICAgIGluY2x1ZGVzKHNlYXJjaEVsZW1lbnQ6IFQsIGZyb21JbmRleD86IG51bWJlcikgOiBib29sZWFuO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSFRNTEVsZW1lbnRcclxue1xyXG4gICAgbGFiZWxzIDogTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XHJcbn1cclxuXHJcbmRlY2xhcmUgY2xhc3MgTWVkaWFSZWNvcmRlclxyXG57XHJcbiAgICBjb25zdHJ1Y3RvcihzdHJlYW06IE1lZGlhU3RyZWFtLCBvcHRpb25zPzogTWVkaWFSZWNvcmRlck9wdGlvbnMpO1xyXG4gICAgc3RhcnQodGltZXNsaWNlPzogbnVtYmVyKSA6IHZvaWQ7XHJcbiAgICBzdG9wKCkgOiB2b2lkO1xyXG4gICAgb25kYXRhYXZhaWxhYmxlIDogKCh0aGlzOiBNZWRpYVJlY29yZGVyLCBldjogQmxvYkV2ZW50KSA9PiBhbnkpIHwgbnVsbDtcclxuICAgIG9uc3RvcCA6ICgodGhpczogTWVkaWFSZWNvcmRlciwgZXY6IEV2ZW50KSA9PiBhbnkpIHwgbnVsbDtcclxufVxyXG5cclxuaW50ZXJmYWNlIE1lZGlhUmVjb3JkZXJPcHRpb25zXHJcbntcclxuICAgIG1pbWVUeXBlPyA6IHN0cmluZztcclxuICAgIGF1ZGlvQml0c1BlclNlY29uZD8gOiBudW1iZXI7XHJcbiAgICB2aWRlb0JpdHNQZXJTZWNvbmQ/IDogbnVtYmVyO1xyXG4gICAgYml0c1BlclNlY29uZD8gOiBudW1iZXI7XHJcbn1cclxuXHJcbmRlY2xhcmUgY2xhc3MgQmxvYkV2ZW50IGV4dGVuZHMgRXZlbnRcclxue1xyXG4gICAgcmVhZG9ubHkgZGF0YSAgICAgOiBCbG9iO1xyXG4gICAgcmVhZG9ubHkgdGltZWNvZGUgOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBdWRpb0NvbnRleHRCYXNlXHJcbntcclxuICAgIGF1ZGlvV29ya2xldCA6IEF1ZGlvV29ya2xldDtcclxufVxyXG5cclxudHlwZSBTYW1wbGVDaGFubmVscyA9IEZsb2F0MzJBcnJheVtdW107XHJcblxyXG5kZWNsYXJlIGNsYXNzIEF1ZGlvV29ya2xldFByb2Nlc3NvclxyXG57XHJcbiAgICBzdGF0aWMgcGFyYW1ldGVyRGVzY3JpcHRvcnMgOiBBdWRpb1BhcmFtRGVzY3JpcHRvcltdO1xyXG5cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3RvcihvcHRpb25zPzogQXVkaW9Xb3JrbGV0Tm9kZU9wdGlvbnMpO1xyXG4gICAgcmVhZG9ubHkgcG9ydD86IE1lc3NhZ2VQb3J0O1xyXG5cclxuICAgIHByb2Nlc3MoXHJcbiAgICAgICAgaW5wdXRzOiBTYW1wbGVDaGFubmVscyxcclxuICAgICAgICBvdXRwdXRzOiBTYW1wbGVDaGFubmVscyxcclxuICAgICAgICBwYXJhbWV0ZXJzOiBEaWN0aW9uYXJ5PEZsb2F0MzJBcnJheT5cclxuICAgICkgOiBib29sZWFuO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXVkaW9Xb3JrbGV0Tm9kZU9wdGlvbnMgZXh0ZW5kcyBBdWRpb05vZGVPcHRpb25zXHJcbntcclxuICAgIG51bWJlck9mSW5wdXRzPyA6IG51bWJlcjtcclxuICAgIG51bWJlck9mT3V0cHV0cz8gOiBudW1iZXI7XHJcbiAgICBvdXRwdXRDaGFubmVsQ291bnQ/IDogbnVtYmVyW107XHJcbiAgICBwYXJhbWV0ZXJEYXRhPyA6IHtbaW5kZXg6IHN0cmluZ10gOiBudW1iZXJ9O1xyXG4gICAgcHJvY2Vzc29yT3B0aW9ucz8gOiBhbnk7XHJcbn1cclxuXHJcbmludGVyZmFjZSBNZWRpYVRyYWNrQ29uc3RyYWludFNldFxyXG57XHJcbiAgICBhdXRvR2FpbkNvbnRyb2w/OiBib29sZWFuIHwgQ29uc3RyYWluQm9vbGVhblBhcmFtZXRlcnM7XHJcbiAgICBub2lzZVN1cHByZXNzaW9uPzogYm9vbGVhbiB8IENvbnN0cmFpbkJvb2xlYW5QYXJhbWV0ZXJzO1xyXG59XHJcblxyXG5kZWNsYXJlIGZ1bmN0aW9uIHJlZ2lzdGVyUHJvY2Vzc29yKG5hbWU6IHN0cmluZywgY3RvcjogQXVkaW9Xb3JrbGV0UHJvY2Vzc29yKSA6IHZvaWQ7IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogSG9sZHMgcnVudGltZSBjb25maWd1cmF0aW9uICovXHJcbmNsYXNzIENvbmZpZ1xyXG57XHJcbiAgICAvKiogSWYgdXNlciBoYXMgY2xpY2tlZCBzaHVmZmxlIGF0IGxlYXN0IG9uY2UgKi9cclxuICAgIHB1YmxpYyBjbGlja2VkR2VuZXJhdGUgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogVm9sdW1lIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgIHNwZWVjaFZvbCAgICAgIDogbnVtYmVyICA9IDEuMDtcclxuICAgIC8qKiBQaXRjaCBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljICBzcGVlY2hQaXRjaCAgICA6IG51bWJlciAgPSAxLjA7XHJcbiAgICAvKiogUmF0ZSBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljICBzcGVlY2hSYXRlICAgICA6IG51bWJlciAgPSAxLjA7XHJcbiAgICAvKiogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UsIGFzIGdldFZvaWNlcyBpbmRleCBvciAtMSBpZiB1bnNldCAqL1xyXG4gICAgcHJpdmF0ZSBfc3BlZWNoVm9pY2UgICA6IG51bWJlciAgPSAtMTtcclxuICAgIC8qKiBXaGV0aGVyIHRvIHVzZSB0aGUgVk9YIGVuZ2luZSAqL1xyXG4gICAgcHVibGljICB2b3hFbmFibGVkICAgICA6IGJvb2xlYW4gPSB0cnVlO1xyXG4gICAgLyoqIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCBvZiB0aGUgVk9YIHZvaWNlIHRvIHVzZSAqL1xyXG4gICAgcHVibGljICB2b3hQYXRoICAgICAgICA6IHN0cmluZyAgPSAnaHR0cHM6Ly9yb3ljdXJ0aXMuZ2l0aHViLmlvL1JBRy1WT1gtUm95JztcclxuICAgIC8qKiBSZWxhdGl2ZSBvciBhYnNvbHV0ZSBVUkwgb2YgdGhlIGN1c3RvbSBWT1ggdm9pY2UgdG8gdXNlICovXHJcbiAgICBwdWJsaWMgIHZveEN1c3RvbVBhdGggIDogc3RyaW5nICA9ICcnO1xyXG4gICAgLyoqIEltcHVsc2UgcmVzcG9uc2UgdG8gdXNlIGZvciBWT1gncyByZXZlcmIgKi9cclxuICAgIHB1YmxpYyAgdm94UmV2ZXJiICAgICAgOiBzdHJpbmcgID0gJ2lyLnN0YWxiYW5zX2FfbW9uby53YXYnO1xyXG4gICAgLyoqIFZPWCBrZXkgb2YgdGhlIGNoaW1lIHRvIHVzZSBwcmlvciB0byBzcGVha2luZyAqL1xyXG4gICAgcHVibGljICB2b3hDaGltZSAgICAgICA6IHN0cmluZyAgPSAnJztcclxuXHJcbiAgICAvKipcclxuICAgICAqIENob2ljZSBvZiBzcGVlY2ggdm9pY2UgdG8gdXNlLCBhcyBnZXRWb2ljZXMgaW5kZXguIEJlY2F1c2Ugb2YgdGhlIGFzeW5jIG5hdHVyZSBvZlxyXG4gICAgICogZ2V0Vm9pY2VzLCB0aGUgZGVmYXVsdCB2YWx1ZSB3aWxsIGJlIGZldGNoZWQgZnJvbSBpdCBlYWNoIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIGdldCBzcGVlY2hWb2ljZSgpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVE9ETzogdGhpcyBpcyBwcm9iYWJseSBiZXR0ZXIgb2ZmIHVzaW5nIHZvaWNlIG5hbWVzXHJcbiAgICAgICAgLy8gSWYgdGhlcmUncyBhIHVzZXItZGVmaW5lZCB2YWx1ZSwgdXNlIHRoYXRcclxuICAgICAgICBpZiAgKHRoaXMuX3NwZWVjaFZvaWNlICE9PSAtMSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NwZWVjaFZvaWNlO1xyXG5cclxuICAgICAgICAvLyBTZWxlY3QgRW5nbGlzaCB2b2ljZXMgYnkgZGVmYXVsdFxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwLCB2ID0gUkFHLnNwZWVjaC5icm93c2VyVm9pY2VzOyBpIDwgdi5sZW5ndGggOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFuZyA9IHZbaV0ubGFuZztcclxuXHJcbiAgICAgICAgICAgIGlmIChsYW5nID09PSAnZW4tR0InIHx8IGxhbmcgPT09ICdlbi1VUycpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEVsc2UsIGZpcnN0IHZvaWNlIG9uIHRoZSBsaXN0XHJcbiAgICAgICAgcmV0dXJuIDA7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGNob2ljZSBvZiBzcGVlY2ggdG8gdXNlLCBhcyBnZXRWb2ljZXMgaW5kZXggKi9cclxuICAgIHNldCBzcGVlY2hWb2ljZSh2YWx1ZTogbnVtYmVyKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3NwZWVjaFZvaWNlID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBsb2FkcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gZnJvbSBsb2NhbFN0b3JhZ2UsIGlmIGFueSAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGxvYWQ6IGJvb2xlYW4pXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHNldHRpbmdzID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdzZXR0aW5ncycpO1xyXG5cclxuICAgICAgICBpZiAoIWxvYWQgfHwgIXNldHRpbmdzKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGNvbmZpZyA9IEpTT04ucGFyc2Uoc2V0dGluZ3MpO1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIGNvbmZpZyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX0xPQURfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgc2F2ZXMgcnVudGltZSBjb25maWd1cmF0aW9uIHRvIGxvY2FsU3RvcmFnZSAqL1xyXG4gICAgcHVibGljIHNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSggJ3NldHRpbmdzJywgSlNPTi5zdHJpbmdpZnkodGhpcykgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfU0FWRV9GQUlMKGUubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBkZWxldGVzIHJ1bnRpbWUgY29uZmlndXJhdGlvbiBmcm9tIGxvY2FsU3RvcmFnZSBhbmQgcmVzZXRzIHN0YXRlICovXHJcbiAgICBwdWJsaWMgcmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oIHRoaXMsIG5ldyBDb25maWcoZmFsc2UpICk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnc2V0dGluZ3MnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfUkVTRVRfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBkYXRhIGZvciBleGN1c2VzLCB0cmFpbnMsIHNlcnZpY2VzIGFuZCBzdGF0aW9ucyAqL1xyXG5jbGFzcyBEYXRhYmFzZVxyXG57XHJcbiAgICAvKiogTG9hZGVkIGRhdGFzZXQgb2YgZGVsYXkgb3IgY2FuY2VsbGF0aW9uIGV4Y3VzZXMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZXhjdXNlcyAgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIG5hbWVkIHRyYWlucyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBuYW1lZCAgICAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRhdGFzZXQgb2Ygc2VydmljZSBvciBuZXR3b3JrIG5hbWVzICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHNlcnZpY2VzICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGljdGlvbmFyeSBvZiBzdGF0aW9uIG5hbWVzLCB3aXRoIHRocmVlLWxldHRlciBjb2RlIGtleXMgKGUuZy4gQUJDKSAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzdGF0aW9ucyAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+O1xyXG4gICAgLyoqIExvYWRlZCBYTUwgZG9jdW1lbnQgY29udGFpbmluZyBwaHJhc2VzZXQgZGF0YSAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBwaHJhc2VzZXRzICAgIDogRG9jdW1lbnQ7XHJcbiAgICAvKiogQW1vdW50IG9mIHN0YXRpb25zIGluIHRoZSBjdXJyZW50bHkgbG9hZGVkIGRhdGFzZXQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc3RhdGlvbnNDb3VudCA6IG51bWJlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoZGF0YVJlZnM6IERhdGFSZWZzKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBxdWVyeSAgPSBkYXRhUmVmcy5waHJhc2VzZXRFbWJlZDtcclxuICAgICAgICBsZXQgaWZyYW1lID0gRE9NLnJlcXVpcmUgPEhUTUxJRnJhbWVFbGVtZW50PiAocXVlcnkpO1xyXG5cclxuICAgICAgICBpZiAoIWlmcmFtZS5jb250ZW50RG9jdW1lbnQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX0VMRU1FTlRfTk9UX1BIUkFTRVNFVF9JRlJBTUUocXVlcnkpICk7XHJcblxyXG4gICAgICAgIHRoaXMucGhyYXNlc2V0cyAgICA9IGlmcmFtZS5jb250ZW50RG9jdW1lbnQ7XHJcbiAgICAgICAgdGhpcy5leGN1c2VzICAgICAgID0gZGF0YVJlZnMuZXhjdXNlc0RhdGE7XHJcbiAgICAgICAgdGhpcy5uYW1lZCAgICAgICAgID0gZGF0YVJlZnMubmFtZWREYXRhO1xyXG4gICAgICAgIHRoaXMuc2VydmljZXMgICAgICA9IGRhdGFSZWZzLnNlcnZpY2VzRGF0YTtcclxuICAgICAgICB0aGlzLnN0YXRpb25zICAgICAgPSBkYXRhUmVmcy5zdGF0aW9uc0RhdGE7XHJcbiAgICAgICAgdGhpcy5zdGF0aW9uc0NvdW50ID0gT2JqZWN0LmtleXModGhpcy5zdGF0aW9ucykubGVuZ3RoO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygnW0RhdGFiYXNlXSBFbnRyaWVzIGxvYWRlZDonKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0RXhjdXNlczonLCAgICAgIHRoaXMuZXhjdXNlcy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHROYW1lZCB0cmFpbnM6JywgdGhpcy5uYW1lZC5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRTZXJ2aWNlczonLCAgICAgdGhpcy5zZXJ2aWNlcy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRTdGF0aW9uczonLCAgICAgdGhpcy5zdGF0aW9uc0NvdW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gZXhjdXNlIGZvciBhIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiAqL1xyXG4gICAgcHVibGljIHBpY2tFeGN1c2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5leGN1c2VzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBwaWNrTmFtZWQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5uYW1lZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgYW5kIGdldHMgcGhyYXNlIHdpdGggdGhlIGdpdmVuIElELCBvciBudWxsIGlmIGl0IGRvZXNuJ3QgZXhpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkIElEIG9mIHRoZSBwaHJhc2UgdG8gZ2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2UoaWQ6IHN0cmluZykgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gdGhpcy5waHJhc2VzZXRzLnF1ZXJ5U2VsZWN0b3IoJ3BocmFzZSMnICsgaWQpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAocmVzdWx0KVxyXG4gICAgICAgICAgICByZXN1bHQgPSByZXN1bHQuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhIHBocmFzZXNldCB3aXRoIHRoZSBnaXZlbiBJRCwgb3IgbnVsbCBpZiBpdCBkb2Vzbid0IGV4aXN0LiBOb3RlIHRoYXQgdGhlXHJcbiAgICAgKiByZXR1cm5lZCBwaHJhc2VzZXQgY29tZXMgZnJvbSB0aGUgWE1MIGRvY3VtZW50LCBzbyBpdCBzaG91bGQgbm90IGJlIG11dGF0ZWQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkIElEIG9mIHRoZSBwaHJhc2VzZXQgdG8gZ2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2VzZXQoaWQ6IHN0cmluZykgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5waHJhc2VzZXRzLnF1ZXJ5U2VsZWN0b3IoJ3BocmFzZXNldCMnICsgaWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSByYWlsIG5ldHdvcmsgbmFtZSAqL1xyXG4gICAgcHVibGljIHBpY2tTZXJ2aWNlKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmFycmF5KHRoaXMuc2VydmljZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gc3RhdGlvbiBjb2RlIGZyb20gdGhlIGRhdGFzZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGUgTGlzdCBvZiBjb2RlcyB0byBleGNsdWRlLiBNYXkgYmUgaWdub3JlZCBpZiBzZWFyY2ggdGFrZXMgdG9vIGxvbmcuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBwaWNrU3RhdGlvbkNvZGUoZXhjbHVkZT86IHN0cmluZ1tdKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIC8vIEdpdmUgdXAgZmluZGluZyByYW5kb20gc3RhdGlvbiB0aGF0J3Mgbm90IGluIHRoZSBnaXZlbiBsaXN0LCBpZiB3ZSB0cnkgbW9yZVxyXG4gICAgICAgIC8vIHRpbWVzIHRoZW4gdGhlcmUgYXJlIHN0YXRpb25zLiBJbmFjY3VyYXRlLCBidXQgYXZvaWRzIGluZmluaXRlIGxvb3BzLlxyXG4gICAgICAgIGlmIChleGNsdWRlKSBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc3RhdGlvbnNDb3VudDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHZhbHVlID0gUmFuZG9tLm9iamVjdEtleSh0aGlzLnN0YXRpb25zKTtcclxuXHJcbiAgICAgICAgICAgIGlmICggIWV4Y2x1ZGUuaW5jbHVkZXModmFsdWUpIClcclxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgc3RhdGlvbiBuYW1lIGZyb20gdGhlIGdpdmVuIHRocmVlIGxldHRlciBjb2RlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gZ2V0IHRoZSBuYW1lIG9mXHJcbiAgICAgKiBAcGFyYW0gZmlsdGVyZWQgV2hldGhlciB0byBmaWx0ZXIgb3V0IHBhcmVudGhlc2l6ZWQgbG9jYXRpb24gY29udGV4dFxyXG4gICAgICogQHJldHVybnMgU3RhdGlvbiBuYW1lIGZvciB0aGUgZ2l2ZW4gY29kZSwgZmlsdGVyZWQgaWYgc3BlY2lmaWVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uKGNvZGU6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IHRoaXMuc3RhdGlvbnNbY29kZV07XHJcblxyXG4gICAgICAgIGlmICAgICAgKCFzdGF0aW9uKVxyXG4gICAgICAgICAgICByZXR1cm4gTC5EQl9VTktOT1dOX1NUQVRJT04oY29kZSk7XHJcbiAgICAgICAgZWxzZSBpZiAoIFN0cmluZ3MuaXNOdWxsT3JFbXB0eShzdGF0aW9uKSApXHJcbiAgICAgICAgICAgIHJldHVybiBMLkRCX0VNUFRZX1NUQVRJT04oY29kZSk7XHJcblxyXG4gICAgICAgIHJldHVybiBzdGF0aW9uO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gcmFuZ2Ugb2Ygc3RhdGlvbiBjb2RlcywgZW5zdXJpbmcgdGhlcmUgYXJlIG5vIGR1cGxpY2F0ZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIG1pbiBNaW5pbXVtIGFtb3VudCBvZiBzdGF0aW9ucyB0byBwaWNrXHJcbiAgICAgKiBAcGFyYW0gbWF4IE1heGltdW0gYW1vdW50IG9mIHN0YXRpb25zIHRvIHBpY2tcclxuICAgICAqIEBwYXJhbSBleGNsdWRlXHJcbiAgICAgKiBAcmV0dXJucyBBIGxpc3Qgb2YgdW5pcXVlIHN0YXRpb24gbmFtZXNcclxuICAgICAqL1xyXG4gICAgcHVibGljIHBpY2tTdGF0aW9uQ29kZXMobWluID0gMSwgbWF4ID0gMTYsIGV4Y2x1ZGU/IDogc3RyaW5nW10pIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBpZiAobWF4IC0gbWluID4gT2JqZWN0LmtleXModGhpcy5zdGF0aW9ucykubGVuZ3RoKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5EQl9UT09fTUFOWV9TVEFUSU9OUygpICk7XHJcblxyXG4gICAgICAgIGxldCByZXN1bHQ6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgICAgIGxldCBsZW5ndGggPSBSYW5kb20uaW50KG1pbiwgbWF4KTtcclxuICAgICAgICBsZXQgdHJpZXMgID0gMDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHJlc3VsdC5sZW5ndGggPCBsZW5ndGgpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQga2V5ID0gUmFuZG9tLm9iamVjdEtleSh0aGlzLnN0YXRpb25zKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEdpdmUgdXAgdHJ5aW5nIHRvIGF2b2lkIGR1cGxpY2F0ZXMsIGlmIHdlIHRyeSBtb3JlIHRpbWVzIHRoYW4gdGhlcmUgYXJlXHJcbiAgICAgICAgICAgIC8vIHN0YXRpb25zIGF2YWlsYWJsZS4gSW5hY2N1cmF0ZSwgYnV0IGdvb2QgZW5vdWdoLlxyXG4gICAgICAgICAgICBpZiAodHJpZXMrKyA+PSB0aGlzLnN0YXRpb25zQ291bnQpXHJcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgZ2l2ZW4gYW4gZXhjbHVzaW9uIGxpc3QsIGNoZWNrIGFnYWluc3QgYm90aCB0aGF0IGFuZCByZXN1bHRzXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKCBleGNsdWRlICYmICFleGNsdWRlLmluY2x1ZGVzKGtleSkgJiYgIXJlc3VsdC5pbmNsdWRlcyhrZXkpIClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBub3QsIGp1c3QgY2hlY2sgd2hhdCByZXN1bHRzIHdlJ3ZlIGFscmVhZHkgZm91bmRcclxuICAgICAgICAgICAgZWxzZSBpZiAoICFleGNsdWRlICYmICFyZXN1bHQuaW5jbHVkZXMoa2V5KSApXHJcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1haW4gY2xhc3Mgb2YgdGhlIGVudGlyZSBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yIGFwcGxpY2F0aW9uICovXHJcbmNsYXNzIFJBR1xyXG57XHJcbiAgICAvKiogR2V0cyB0aGUgY29uZmlndXJhdGlvbiBob2xkZXIgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY29uZmlnICAgOiBDb25maWc7XHJcbiAgICAvKiogR2V0cyB0aGUgZGF0YWJhc2UgbWFuYWdlciwgd2hpY2ggaG9sZHMgcGhyYXNlLCBzdGF0aW9uIGFuZCB0cmFpbiBkYXRhICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGRhdGFiYXNlIDogRGF0YWJhc2U7XHJcbiAgICAvKiogR2V0cyB0aGUgcGhyYXNlIG1hbmFnZXIsIHdoaWNoIGdlbmVyYXRlcyBIVE1MIHBocmFzZXMgZnJvbSBYTUwgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGhyYXNlciAgOiBQaHJhc2VyO1xyXG4gICAgLyoqIEdldHMgdGhlIHNwZWVjaCBlbmdpbmUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3BlZWNoICAgOiBTcGVlY2g7XHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCB0cmFpbiBhbmQgc3RhdGlvbiBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzdGF0ZSAgICA6IFN0YXRlO1xyXG4gICAgLyoqIEdldHMgdGhlIHZpZXcgY29udHJvbGxlciwgd2hpY2ggbWFuYWdlcyBVSSBpbnRlcmFjdGlvbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB2aWV3cyAgICA6IFZpZXdzO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogRW50cnkgcG9pbnQgZm9yIFJBRywgdG8gYmUgY2FsbGVkIGZyb20gSmF2YXNjcmlwdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZGF0YVJlZnMgQ29uZmlndXJhdGlvbiBvYmplY3QsIHdpdGggcmFpbCBkYXRhIHRvIHVzZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG1haW4oZGF0YVJlZnM6IERhdGFSZWZzKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cub25lcnJvciAgICAgICAgICAgICAgPSBlcnJvciA9PiBSQUcucGFuaWMoZXJyb3IpO1xyXG4gICAgICAgIHdpbmRvdy5vbnVuaGFuZGxlZHJlamVjdGlvbiA9IGVycm9yID0+IFJBRy5wYW5pYyhlcnJvcik7XHJcblxyXG4gICAgICAgIEkxOG4uaW5pdCgpO1xyXG5cclxuICAgICAgICBSQUcuY29uZmlnICAgPSBuZXcgQ29uZmlnKHRydWUpO1xyXG4gICAgICAgIFJBRy5kYXRhYmFzZSA9IG5ldyBEYXRhYmFzZShkYXRhUmVmcyk7XHJcbiAgICAgICAgUkFHLnZpZXdzICAgID0gbmV3IFZpZXdzKCk7XHJcbiAgICAgICAgUkFHLnBocmFzZXIgID0gbmV3IFBocmFzZXIoKTtcclxuICAgICAgICBSQUcuc3BlZWNoICAgPSBuZXcgU3BlZWNoKCk7XHJcblxyXG4gICAgICAgIC8vIEJlZ2luXHJcblxyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5XRUxDT01FKCkgKTtcclxuICAgICAgICBSQUcuZ2VuZXJhdGUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2VuZXJhdGVzIGEgbmV3IHJhbmRvbSBwaHJhc2UgYW5kIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlID0gbmV3IFN0YXRlKCk7XHJcbiAgICAgICAgUkFHLnN0YXRlLmdlbkRlZmF1bHRTdGF0ZSgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuZ2VuZXJhdGUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogTG9hZHMgc3RhdGUgZnJvbSBnaXZlbiBKU09OICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxvYWQoanNvbjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUgPSBPYmplY3QuYXNzaWduKCBuZXcgU3RhdGUoKSwgSlNPTi5wYXJzZShqc29uKSApIGFzIFN0YXRlO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuZ2VuZXJhdGUoKTtcclxuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfRlJPTV9TVE9SQUdFKCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2xvYmFsIGVycm9yIGhhbmRsZXI7IHRocm93cyB1cCBhIGJpZyByZWQgcGFuaWMgc2NyZWVuIG9uIHVuY2F1Z2h0IGVycm9yICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBwYW5pYyhlcnJvcjogc3RyaW5nIHwgRXZlbnQgPSBcIlVua25vd24gZXJyb3JcIilcclxuICAgIHtcclxuICAgICAgICBsZXQgbXNnID0gJzxkaXYgaWQ9XCJwYW5pY1NjcmVlblwiIGNsYXNzPVwid2FybmluZ1NjcmVlblwiPic7XHJcbiAgICAgICAgbXNnICAgICs9ICc8aDE+XCJXZSBhcmUgc29ycnkgdG8gYW5ub3VuY2UgdGhhdC4uLlwiPC9oMT4nO1xyXG4gICAgICAgIG1zZyAgICArPSBgPHA+UkFHIGhhcyBjcmFzaGVkIGJlY2F1c2U6IDxjb2RlPiR7ZXJyb3J9PC9jb2RlPjwvcD5gO1xyXG4gICAgICAgIG1zZyAgICArPSBgPHA+UGxlYXNlIG9wZW4gdGhlIGNvbnNvbGUgZm9yIG1vcmUgaW5mb3JtYXRpb24uPC9wPmA7XHJcbiAgICAgICAgbXNnICAgICs9ICc8L2Rpdj4nO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5ib2R5LmlubmVySFRNTCA9IG1zZztcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIERpc3Bvc2FibGUgY2xhc3MgdGhhdCBob2xkcyBzdGF0ZSBmb3IgdGhlIGN1cnJlbnQgc2NoZWR1bGUsIHRyYWluLCBldGMuICovXHJcbmNsYXNzIFN0YXRlXHJcbntcclxuICAgIC8qKiBTdGF0ZSBvZiBjb2xsYXBzaWJsZSBlbGVtZW50cy4gS2V5IGlzIHJlZmVyZW5jZSBJRCwgdmFsdWUgaXMgY29sbGFwc2VkLiAqL1xyXG4gICAgcHJpdmF0ZSBfY29sbGFwc2libGVzIDogRGljdGlvbmFyeTxib29sZWFuPiAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IGNvYWNoIGxldHRlciBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgbGV0dGVyLiAqL1xyXG4gICAgcHJpdmF0ZSBfY29hY2hlcyAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IGludGVnZXIgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGludGVnZXIuICovXHJcbiAgICBwcml2YXRlIF9pbnRlZ2VycyAgICAgOiBEaWN0aW9uYXJ5PG51bWJlcj4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgcGhyYXNlc2V0IHBocmFzZSBjaG9pY2VzLiBLZXkgaXMgcmVmZXJlbmNlIElELCB2YWx1ZSBpcyBpbmRleC4gKi9cclxuICAgIHByaXZhdGUgX3BocmFzZXNldHMgICA6IERpY3Rpb25hcnk8bnVtYmVyPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzZXJ2aWNlIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBzZXJ2aWNlLiAqL1xyXG4gICAgcHJpdmF0ZSBfc2VydmljZXMgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHN0YXRpb24gY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIHN0YXRpb24gY29kZS4gKi9cclxuICAgIHByaXZhdGUgX3N0YXRpb25zICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzdGF0aW9uIGxpc3QgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGFycmF5IG9mIGNvZGVzLiAqL1xyXG4gICAgcHJpdmF0ZSBfc3RhdGlvbkxpc3RzIDogRGljdGlvbmFyeTxzdHJpbmdbXT4gPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHRpbWUgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIHRpbWUuICovXHJcbiAgICBwcml2YXRlIF90aW1lcyAgICAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG5cclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIGV4Y3VzZSAqL1xyXG4gICAgcHJpdmF0ZSBfZXhjdXNlPyAgIDogc3RyaW5nO1xyXG4gICAgLyoqIEN1cnJlbnRseSBjaG9zZW4gcGxhdGZvcm0gKi9cclxuICAgIHByaXZhdGUgX3BsYXRmb3JtPyA6IFBsYXRmb3JtO1xyXG4gICAgLyoqIEN1cnJlbnRseSBjaG9zZW4gbmFtZWQgdHJhaW4gKi9cclxuICAgIHByaXZhdGUgX25hbWVkPyAgICA6IHN0cmluZztcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gY29hY2ggbGV0dGVyLCBvciByYW5kb21seSBwaWNrcyBvbmUgZnJvbSBBIHRvIFouXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBsZXR0ZXIgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRDb2FjaChjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2NvYWNoZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NvYWNoZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX2NvYWNoZXNbY29udGV4dF0gPSBSYW5kb20uYXJyYXkoTC5MRVRURVJTKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fY29hY2hlc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBjb2FjaCBsZXR0ZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIGxldHRlciBmb3JcclxuICAgICAqIEBwYXJhbSBjb2FjaCBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldENvYWNoKGNvbnRleHQ6IHN0cmluZywgY29hY2g6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fY29hY2hlc1tjb250ZXh0XSA9IGNvYWNoO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY29sbGFwc2Ugc3RhdGUgb2YgYSBjb2xsYXBzaWJsZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSByZWYgUmVmZXJlbmNlIElEIHRvIGdldCB0aGUgY29sbGFwc2libGUgc3RhdGUgb2ZcclxuICAgICAqIEBwYXJhbSBjaGFuY2UgQ2hhbmNlIGJldHdlZW4gMCBhbmQgMTAwIG9mIGNob29zaW5nIHRydWUsIGlmIHVuc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRDb2xsYXBzZWQocmVmOiBzdHJpbmcsIGNoYW5jZTogbnVtYmVyKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fY29sbGFwc2libGVzW3JlZl0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdO1xyXG5cclxuICAgICAgICB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXSA9ICFSYW5kb20uYm9vbChjaGFuY2UpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBjb2xsYXBzaWJsZSdzIHN0YXRlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSByZWYgUmVmZXJlbmNlIElEIHRvIHNldCB0aGUgY29sbGFwc2libGUgc3RhdGUgb2ZcclxuICAgICAqIEBwYXJhbSBzdGF0ZSBWYWx1ZSB0byBzZXQsIHdoZXJlIHRydWUgaXMgXCJjb2xsYXBzZWRcIlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0Q29sbGFwc2VkKHJlZjogc3RyaW5nLCBzdGF0ZTogYm9vbGVhbikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fY29sbGFwc2libGVzW3JlZl0gPSBzdGF0ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gaW50ZWdlciwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgaW50ZWdlciBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldEludGVnZXIoY29udGV4dDogc3RyaW5nKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faW50ZWdlcnNbY29udGV4dF07XHJcblxyXG4gICAgICAgIGxldCBtaW4gPSAwLCBtYXggPSAwO1xyXG5cclxuICAgICAgICBzd2l0Y2goY29udGV4dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJjb2FjaGVzXCI6ICAgICAgIG1pbiA9IDE7IG1heCA9IDEwOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImRlbGF5ZWRcIjogICAgICAgbWluID0gNTsgbWF4ID0gNjA7IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZnJvbnRfY29hY2hlc1wiOiBtaW4gPSAyOyBtYXggPSA1OyAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJyZWFyX2NvYWNoZXNcIjogIG1pbiA9IDI7IG1heCA9IDU7ICBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdID0gUmFuZG9tLmludChtaW4sIG1heCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhbiBpbnRlZ2VyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBpbnRlZ2VyIGZvclxyXG4gICAgICogQHBhcmFtIHZhbHVlIFZhbHVlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0SW50ZWdlcihjb250ZXh0OiBzdHJpbmcsIHZhbHVlOiBudW1iZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHBocmFzZSBvZiBhIHBocmFzZXNldCwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSByZWYgUmVmZXJlbmNlIElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHBocmFzZXNldCdzIHBocmFzZSBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlc2V0SWR4KHJlZjogc3RyaW5nKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9waHJhc2VzZXRzW3JlZl0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BocmFzZXNldHNbcmVmXTtcclxuXHJcbiAgICAgICAgbGV0IHBocmFzZXNldCA9IFJBRy5kYXRhYmFzZS5nZXRQaHJhc2VzZXQocmVmKTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogaXMgdGhpcyBzYWZlIGFjcm9zcyBwaHJhc2VzZXQgY2hhbmdlcz9cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuU1RBVEVfTk9ORVhJU1RBTlRfUEhSQVNFU0VUKHJlZikgKTtcclxuXHJcbiAgICAgICAgdGhpcy5fcGhyYXNlc2V0c1tyZWZdID0gUmFuZG9tLmludCgwLCBwaHJhc2VzZXQuY2hpbGRyZW4ubGVuZ3RoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGhyYXNlc2V0c1tyZWZdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB0aGUgY2hvc2VuIGluZGV4IGZvciBhIHBocmFzZXNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBzZXQgdGhlIHBocmFzZXNldCBpbmRleCBvZlxyXG4gICAgICogQHBhcmFtIGlkeCBJbmRleCB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFBocmFzZXNldElkeChyZWY6IHN0cmluZywgaWR4OiBudW1iZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BocmFzZXNldHNbcmVmXSA9IGlkeDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gc2VydmljZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc2VydmljZSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFNlcnZpY2UoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2VydmljZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTZXJ2aWNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHNlcnZpY2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHNlcnZpY2UgZm9yXHJcbiAgICAgKiBAcGFyYW0gc2VydmljZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFNlcnZpY2UoY29udGV4dDogc3RyaW5nLCBzZXJ2aWNlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdID0gc2VydmljZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gc3RhdGlvbiBjb2RlLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBzdGF0aW9uIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbihjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3N0YXRpb25zW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbnNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHN0YXRpb24gY29kZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgc3RhdGlvbiBjb2RlIGZvclxyXG4gICAgICogQHBhcmFtIGNvZGUgU3RhdGlvbiBjb2RlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0U3RhdGlvbihjb250ZXh0OiBzdHJpbmcsIGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbnNbY29udGV4dF0gPSBjb2RlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBsaXN0IG9mIHN0YXRpb24gY29kZXMsIG9yIHJhbmRvbWx5IGdlbmVyYXRlcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBzdGF0aW9uIGxpc3QgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uTGlzdChjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF07XHJcbiAgICAgICAgZWxzZSBpZiAoY29udGV4dCA9PT0gJ2NhbGxpbmdfZmlyc3QnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRTdGF0aW9uTGlzdCgnY2FsbGluZycpO1xyXG5cclxuICAgICAgICBsZXQgbWluID0gMSwgbWF4ID0gMTY7XHJcblxyXG4gICAgICAgIHN3aXRjaChjb250ZXh0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2FzZSAnY2FsbGluZ19zcGxpdCc6IG1pbiA9IDI7IG1heCA9IDE2OyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnY2hhbmdlcyc6ICAgICAgIG1pbiA9IDE7IG1heCA9IDQ7ICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnbm90X3N0b3BwaW5nJzogIG1pbiA9IDE7IG1heCA9IDg7ICBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKG1pbiwgbWF4KTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGxpc3Qgb2Ygc3RhdGlvbiBjb2Rlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgc3RhdGlvbiBjb2RlIGxpc3QgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29kZXMgU3RhdGlvbiBjb2RlcyB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFN0YXRpb25MaXN0KGNvbnRleHQ6IHN0cmluZywgY29kZXM6IHN0cmluZ1tdKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gPSBjb2RlcztcclxuXHJcbiAgICAgICAgaWYgKGNvbnRleHQgPT09ICdjYWxsaW5nX2ZpcnN0JylcclxuICAgICAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzWydjYWxsaW5nJ10gPSBjb2RlcztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gdGltZVxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgdGltZSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFRpbWUoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl90aW1lc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fdGltZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3RpbWVzW2NvbnRleHRdID0gU3RyaW5ncy5mcm9tVGltZSggUmFuZG9tLmludCgwLCAyMyksIFJhbmRvbS5pbnQoMCwgNTkpICk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3RpbWVzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHRpbWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHRpbWUgZm9yXHJcbiAgICAgKiBAcGFyYW0gdGltZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFRpbWUoY29udGV4dDogc3RyaW5nLCB0aW1lOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3RpbWVzW2NvbnRleHRdID0gdGltZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIGV4Y3VzZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IGV4Y3VzZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2V4Y3VzZSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2V4Y3VzZTtcclxuXHJcbiAgICAgICAgdGhpcy5fZXhjdXNlID0gUkFHLmRhdGFiYXNlLnBpY2tFeGN1c2UoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fZXhjdXNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IGV4Y3VzZSAqL1xyXG4gICAgcHVibGljIHNldCBleGN1c2UodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9leGN1c2UgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIHBsYXRmb3JtLCBvciByYW5kb21seSBwaWNrcyBvbmUgKi9cclxuICAgIHB1YmxpYyBnZXQgcGxhdGZvcm0oKSA6IFBsYXRmb3JtXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3BsYXRmb3JtKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcblxyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA6IFBsYXRmb3JtID0gWycnLCAnJ107XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMiUgY2hhbmNlIGZvciBwbGF0Zm9ybSAwLCBzaW5jZSBpdCdzIHJhcmVcclxuICAgICAgICBwbGF0Zm9ybVswXSA9IFJhbmRvbS5ib29sKDk4KVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5pbnQoMSwgMjYpLnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiAnMCc7XHJcblxyXG4gICAgICAgIC8vIE1hZ2ljIHZhbHVlc1xyXG4gICAgICAgIGlmIChwbGF0Zm9ybVswXSA9PT0gJzknKVxyXG4gICAgICAgICAgICBwbGF0Zm9ybVsxXSA9IFJhbmRvbS5ib29sKDI1KSA/ICfCvicgOiAnJztcclxuXHJcbiAgICAgICAgLy8gT25seSAxMCUgY2hhbmNlIGZvciBwbGF0Zm9ybSBsZXR0ZXIsIHNpbmNlIGl0J3MgdW5jb21tb25cclxuICAgICAgICBpZiAocGxhdGZvcm1bMV0gPT09ICcnKVxyXG4gICAgICAgICAgICBwbGF0Zm9ybVsxXSA9IFJhbmRvbS5ib29sKDEwKVxyXG4gICAgICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoJ0FCQycpXHJcbiAgICAgICAgICAgICAgICA6ICcnO1xyXG5cclxuICAgICAgICB0aGlzLl9wbGF0Zm9ybSA9IHBsYXRmb3JtO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9wbGF0Zm9ybTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBwbGF0Zm9ybSAqL1xyXG4gICAgcHVibGljIHNldCBwbGF0Zm9ybSh2YWx1ZTogUGxhdGZvcm0pXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fcGxhdGZvcm0gPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIG5hbWVkIHRyYWluLCBvciByYW5kb21seSBwaWNrcyBvbmUgKi9cclxuICAgIHB1YmxpYyBnZXQgbmFtZWQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9uYW1lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVkO1xyXG5cclxuICAgICAgICB0aGlzLl9uYW1lZCA9IFJBRy5kYXRhYmFzZS5waWNrTmFtZWQoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fbmFtZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBzZXQgbmFtZWQodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9uYW1lZCA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB1cCB0aGUgc3RhdGUgaW4gYSBwYXJ0aWN1bGFyIHdheSwgc28gdGhhdCBpdCBtYWtlcyBzb21lIHJlYWwtd29ybGQgc2Vuc2UuXHJcbiAgICAgKiBUbyBkbyBzbywgd2UgaGF2ZSB0byBnZW5lcmF0ZSBkYXRhIGluIGEgcGFydGljdWxhciBvcmRlciwgYW5kIG1ha2Ugc3VyZSB0byBhdm9pZFxyXG4gICAgICogZHVwbGljYXRlcyBpbiBpbmFwcHJvcHJpYXRlIHBsYWNlcyBhbmQgY29udGV4dHMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZW5EZWZhdWx0U3RhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTdGVwIDEuIFByZXBvcHVsYXRlIHN0YXRpb24gbGlzdHNcclxuXHJcbiAgICAgICAgbGV0IHNsQ2FsbGluZyAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgMTYpO1xyXG4gICAgICAgIGxldCBzbENhbGxTcGxpdCA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDIsIDE2LCBzbENhbGxpbmcpO1xyXG4gICAgICAgIGxldCBhbGxDYWxsaW5nICA9IFsuLi5zbENhbGxpbmcsIC4uLnNsQ2FsbFNwbGl0XTtcclxuXHJcbiAgICAgICAgLy8gTGlzdCBvZiBvdGhlciBzdGF0aW9ucyBmb3VuZCB2aWEgYSBzcGVjaWZpYyBjYWxsaW5nIHBvaW50XHJcbiAgICAgICAgbGV0IHNsQ2hhbmdlcyAgICAgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygxLCA0LCBhbGxDYWxsaW5nKTtcclxuICAgICAgICAvLyBMaXN0IG9mIG90aGVyIHN0YXRpb25zIHRoYXQgdGhpcyB0cmFpbiB1c3VhbGx5IHNlcnZlcywgYnV0IGN1cnJlbnRseSBpc24ndFxyXG4gICAgICAgIGxldCBzbE5vdFN0b3BwaW5nID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgOCxcclxuICAgICAgICAgICAgWy4uLmFsbENhbGxpbmcsIC4uLnNsQ2hhbmdlc11cclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBUYWtlIGEgcmFuZG9tIHNsaWNlIGZyb20gdGhlIGNhbGxpbmcgbGlzdCwgdG8gaWRlbnRpZnkgYXMgcmVxdWVzdCBzdG9wc1xyXG4gICAgICAgIGxldCByZXFDb3VudCAgID0gUmFuZG9tLmludCgxLCBzbENhbGxpbmcubGVuZ3RoIC0gMSk7XHJcbiAgICAgICAgbGV0IHNsUmVxdWVzdHMgPSBzbENhbGxpbmcuc2xpY2UoMCwgcmVxQ291bnQpO1xyXG5cclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjYWxsaW5nJywgICAgICAgc2xDYWxsaW5nKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjYWxsaW5nX3NwbGl0Jywgc2xDYWxsU3BsaXQpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ2NoYW5nZXMnLCAgICAgICBzbENoYW5nZXMpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ25vdF9zdG9wcGluZycsICBzbE5vdFN0b3BwaW5nKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdyZXF1ZXN0JywgICAgICAgc2xSZXF1ZXN0cyk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgMi4gUHJlcG9wdWxhdGUgc3RhdGlvbnNcclxuXHJcbiAgICAgICAgLy8gQW55IHN0YXRpb24gbWF5IGJlIGJsYW1lZCBmb3IgYW4gZXhjdXNlLCBldmVuIG9uZXMgYWxyZWFkeSBwaWNrZWRcclxuICAgICAgICBsZXQgc3RFeGN1c2UgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZSgpO1xyXG4gICAgICAgIC8vIERlc3RpbmF0aW9uIGlzIGZpbmFsIGNhbGwgb2YgdGhlIGNhbGxpbmcgbGlzdFxyXG4gICAgICAgIGxldCBzdERlc3QgICAgPSBzbENhbGxpbmdbc2xDYWxsaW5nLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIC8vIFZpYSBpcyBhIGNhbGwgYmVmb3JlIHRoZSBkZXN0aW5hdGlvbiwgb3Igb25lIGluIHRoZSBzcGxpdCBsaXN0IGlmIHRvbyBzbWFsbFxyXG4gICAgICAgIGxldCBzdFZpYSAgICAgPSBzbENhbGxpbmcubGVuZ3RoID4gMVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSggc2xDYWxsaW5nLnNsaWNlKDAsIC0xKSAgIClcclxuICAgICAgICAgICAgOiBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG4gICAgICAgIC8vIERpdHRvIGZvciBwaWNraW5nIGEgcmFuZG9tIGNhbGxpbmcgc3RhdGlvbiBhcyBhIHNpbmdsZSByZXF1ZXN0IG9yIGNoYW5nZSBzdG9wXHJcbiAgICAgICAgbGV0IHN0Q2FsbGluZyA9IHNsQ2FsbGluZy5sZW5ndGggPiAxXHJcbiAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCBzbENhbGxpbmcuc2xpY2UoMCwgLTEpICAgKVxyXG4gICAgICAgICAgICA6IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcblxyXG4gICAgICAgIC8vIERlc3RpbmF0aW9uIChsYXN0IGNhbGwpIG9mIHRoZSBzcGxpdCB0cmFpbidzIHNlY29uZCBoYWxmIG9mIHRoZSBsaXN0XHJcbiAgICAgICAgbGV0IHN0RGVzdFNwbGl0ID0gc2xDYWxsU3BsaXRbc2xDYWxsU3BsaXQubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgLy8gUmFuZG9tIG5vbi1kZXN0aW5hdGlvbiBzdG9wIG9mIHRoZSBzcGxpdCB0cmFpbidzIHNlY29uZCBoYWxmIG9mIHRoZSBsaXN0XHJcbiAgICAgICAgbGV0IHN0VmlhU3BsaXQgID0gUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuICAgICAgICAvLyBXaGVyZSB0aGUgdHJhaW4gY29tZXMgZnJvbSwgc28gY2FuJ3QgYmUgb24gYW55IGxpc3RzIG9yIHByaW9yIHN0YXRpb25zXHJcbiAgICAgICAgbGV0IHN0U291cmNlICAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZShbXHJcbiAgICAgICAgICAgIC4uLmFsbENhbGxpbmcsIC4uLnNsQ2hhbmdlcywgLi4uc2xOb3RTdG9wcGluZywgLi4uc2xSZXF1ZXN0cyxcclxuICAgICAgICAgICAgc3RDYWxsaW5nLCBzdERlc3QsIHN0VmlhLCBzdERlc3RTcGxpdCwgc3RWaWFTcGxpdFxyXG4gICAgICAgIF0pO1xyXG5cclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2NhbGxpbmcnLCAgICAgICAgICAgc3RDYWxsaW5nKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2Rlc3RpbmF0aW9uJywgICAgICAgc3REZXN0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2Rlc3RpbmF0aW9uX3NwbGl0Jywgc3REZXN0U3BsaXQpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignZXhjdXNlJywgICAgICAgICAgICBzdEV4Y3VzZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdzb3VyY2UnLCAgICAgICAgICAgIHN0U291cmNlKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3ZpYScsICAgICAgICAgICAgICAgc3RWaWEpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbigndmlhX3NwbGl0JywgICAgICAgICBzdFZpYVNwbGl0KTtcclxuXHJcbiAgICAgICAgLy8gU3RlcCAzLiBQcmVwb3B1bGF0ZSBjb2FjaCBudW1iZXJzXHJcblxyXG4gICAgICAgIGxldCBpbnRDb2FjaGVzID0gdGhpcy5nZXRJbnRlZ2VyKCdjb2FjaGVzJyk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZXJlIGFyZSBlbm91Z2ggY29hY2hlcywganVzdCBzcGxpdCB0aGUgbnVtYmVyIGRvd24gdGhlIG1pZGRsZSBpbnN0ZWFkLlxyXG4gICAgICAgIC8vIEVsc2UsIGZyb250IGFuZCByZWFyIGNvYWNoZXMgd2lsbCBiZSByYW5kb21seSBwaWNrZWQgKHdpdGhvdXQgbWFraW5nIHNlbnNlKVxyXG4gICAgICAgIGlmIChpbnRDb2FjaGVzID49IDQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaW50RnJvbnRDb2FjaGVzID0gKGludENvYWNoZXMgLyAyKSB8IDA7XHJcbiAgICAgICAgICAgIGxldCBpbnRSZWFyQ29hY2hlcyAgPSBpbnRDb2FjaGVzIC0gaW50RnJvbnRDb2FjaGVzO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXRJbnRlZ2VyKCdmcm9udF9jb2FjaGVzJywgaW50RnJvbnRDb2FjaGVzKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRJbnRlZ2VyKCdyZWFyX2NvYWNoZXMnLCBpbnRSZWFyQ29hY2hlcyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgZW5vdWdoIGNvYWNoZXMsIGFzc2lnbiBjb2FjaCBsZXR0ZXJzIGZvciBjb250ZXh0cy5cclxuICAgICAgICAvLyBFbHNlLCBsZXR0ZXJzIHdpbGwgYmUgcmFuZG9tbHkgcGlja2VkICh3aXRob3V0IG1ha2luZyBzZW5zZSlcclxuICAgICAgICBpZiAoaW50Q29hY2hlcyA+PSA0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGxldHRlcnMgPSBMLkxFVFRFUlMuc2xpY2UoMCwgaW50Q29hY2hlcykuc3BsaXQoJycpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ2ZpcnN0JywgICAgIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc2hvcCcsICAgICAgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzdGFuZGFyZDEnLCBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3N0YW5kYXJkMicsIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU3RlcCA0LiBQcmVwb3B1bGF0ZSBzZXJ2aWNlc1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBtb3JlIHRoYW4gb25lIHNlcnZpY2UsIHBpY2sgb25lIHRvIGJlIHRoZSBcIm1haW5cIiBhbmQgb25lIHRvIGJlIHRoZVxyXG4gICAgICAgIC8vIFwiYWx0ZXJuYXRlXCIsIGVsc2UgdGhlIG9uZSBzZXJ2aWNlIHdpbGwgYmUgdXNlZCBmb3IgYm90aCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpLlxyXG4gICAgICAgIGlmIChSQUcuZGF0YWJhc2Uuc2VydmljZXMubGVuZ3RoID4gMSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBzZXJ2aWNlcyA9IFJBRy5kYXRhYmFzZS5zZXJ2aWNlcy5zbGljZSgpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXRTZXJ2aWNlKCAncHJvdmlkZXInLCAgICBSYW5kb20uYXJyYXlTcGxpY2Uoc2VydmljZXMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VydmljZSggJ2FsdGVybmF0aXZlJywgUmFuZG9tLmFycmF5U3BsaWNlKHNlcnZpY2VzKSApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU3RlcCA1LiBQcmVwb3B1bGF0ZSB0aW1lc1xyXG4gICAgICAgIC8vIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMjE0NzUzXHJcblxyXG4gICAgICAgIC8vIFRoZSBhbHRlcm5hdGl2ZSB0aW1lIGlzIGZvciBhIHRyYWluIHRoYXQncyBsYXRlciB0aGFuIHRoZSBtYWluIHRyYWluXHJcbiAgICAgICAgbGV0IHRpbWUgICAgPSBuZXcgRGF0ZSggbmV3IERhdGUoKS5nZXRUaW1lKCkgKyBSYW5kb20uaW50KDAsIDU5KSAqIDYwMDAwKTtcclxuICAgICAgICBsZXQgdGltZUFsdCA9IG5ldyBEYXRlKCB0aW1lLmdldFRpbWUoKSAgICAgICArIFJhbmRvbS5pbnQoMCwgMzApICogNjAwMDApO1xyXG5cclxuICAgICAgICB0aGlzLnNldFRpbWUoICdtYWluJywgICAgICAgIFN0cmluZ3MuZnJvbVRpbWUodGltZSkgICAgKTtcclxuICAgICAgICB0aGlzLnNldFRpbWUoICdhbHRlcm5hdGl2ZScsIFN0cmluZ3MuZnJvbVRpbWUodGltZUFsdCkgKTtcclxuICAgIH1cclxufSJdfQ==