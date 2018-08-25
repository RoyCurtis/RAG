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
        try {
            this.voxEngine = new VoxEngine();
        }
        catch (err) {
            console.error('Could not create VOX engine:', err);
        }
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
        // TODO: This needs to pause VOX engine
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
    constructor(dataPath = 'data/vox') {
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
        // @ts-ignore - Defining these in Window interface does not work
        let audioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new audioContext();
        if (!this.audioContext)
            throw new Error('Could not get audio context');
        // Setup nodes
        this.dataPath = dataPath;
        this.gainNode = this.audioContext.createGain();
        this.filterNode = this.audioContext.createBiquadFilter();
        this.reverbNode = this.audioContext.createConvolver();
        this.reverbNode.normalize = true;
        this.filterNode.type = 'highpass';
        this.filterNode.Q.value = 0.4;
        this.gainNode.connect(this.filterNode);
        // Rest of nodes get connected when speak is called
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
        Linkdown.loadInto('ABOUT.md', '#aboutBlock');
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
        document.querySelectorAll(`[for='${element.id}']`)
            .forEach(l => l.hidden = hidden);
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
/** A very small subset of Markdown for hyperlinking a block of text */
class Linkdown {
    /**
     * Attempts to load the given linkdown file, parse and set it as an element's text.
     *
     * @param path Relative or absolute URL to fetch the linkdown from
     * @param query DOM query for the object to put the text into
     */
    static loadInto(path, query) {
        let dom = DOM.require(query);
        dom.innerText = `Loading text from '${path}'...`;
        fetch(path)
            .then(req => req.text())
            .then(txt => dom.innerHTML = Linkdown.parse(txt))
            .catch(err => dom.innerText = `Could not load '${path}': ${err}`);
    }
    /**
     * Parses the given text from Linkdown to HTML, converting tagged text into links
     * using a given list of references.
     *
     * @param text Linkdown text to transform to HTML
     */
    static parse(text) {
        let links = {};
        // First, sanitize any HTML
        text = text.replace('<', '&lt;').replace('>', '&gt;');
        // Then, get the list of references, removing them from the text
        text = text.replace(this.REGEX_REF, (_, k, v) => {
            links[k] = v;
            return '';
        });
        // Finally, replace each tagged part of text with a link element
        return text.replace(this.REGEX_LINK, (_, t, k) => `<a href='${links[k]}' target="_blank" rel="noopener">${t}</a>`);
    }
}
/** Regex pattern for matching linked text */
Linkdown.REGEX_LINK = /\[(.+?)\]\[(\d+)\]/gi;
/** Regex pattern for matching link references */
Linkdown.REGEX_REF = /^\[(\d+)\]:\s+(\S+)$/gmi;
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
        // TODO: introduce an asserts util, and start using them all over
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL3N0YXRpb25DaG9vc2VyLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkxpc3RJdGVtLnRzIiwidWkvcGlja2Vycy9waWNrZXIudHMiLCJ1aS9waWNrZXJzL2NvYWNoUGlja2VyLnRzIiwidWkvcGlja2Vycy9leGN1c2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2ludGVnZXJQaWNrZXIudHMiLCJ1aS9waWNrZXJzL25hbWVkUGlja2VyLnRzIiwidWkvcGlja2Vycy9waHJhc2VzZXRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BsYXRmb3JtUGlja2VyLnRzIiwidWkvcGlja2Vycy9zZXJ2aWNlUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uTGlzdFBpY2tlci50cyIsInVpL3BpY2tlcnMvdGltZVBpY2tlci50cyIsImxhbmcvYmFzZUxhbmd1YWdlLnRzIiwibGFuZy9lbmdsaXNoTGFuZ3VhZ2UudHMiLCJwaHJhc2VyL2VsZW1lbnRQcm9jZXNzb3JzLnRzIiwicGhyYXNlci9waHJhc2VDb250ZXh0LnRzIiwicGhyYXNlci9waHJhc2VyLnRzIiwic3BlZWNoL3Jlc29sdmVyLnRzIiwic3BlZWNoL3NwZWVjaC50cyIsInNwZWVjaC9zcGVlY2hTZXR0aW5ncy50cyIsInNwZWVjaC92b3hFbmdpbmUudHMiLCJzcGVlY2gvdm94UmVxdWVzdC50cyIsInVpL2Jhc2VWaWV3LnRzIiwidWkvZWRpdG9yLnRzIiwidWkvbWFycXVlZS50cyIsInVpL3NldHRpbmdzLnRzIiwidWkvdG9vbGJhci50cyIsInVpL3ZpZXdzLnRzIiwidXRpbC9jb2xsYXBzaWJsZXMudHMiLCJ1dGlsL2NvbmRpdGlvbmFscy50cyIsInV0aWwvZG9tLnRzIiwidXRpbC9saW5rZG93bi50cyIsInV0aWwvcGFyc2UudHMiLCJ1dGlsL3JhbmRvbS50cyIsInV0aWwvc291bmRzLnRzIiwidXRpbC9zdHJpbmdzLnRzIiwidXRpbC90eXBlcy50cyIsImNvbmZpZy50cyIsImRhdGFiYXNlLnRzIiwicmFnLnRzIiwic3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEscUVBQXFFO0FBRXJFLDhEQUE4RDtBQUM5RCxJQUFJLENBQWtDLENBQUM7QUFFdkMsTUFBTSxJQUFJO0lBVU4sNEVBQTRFO0lBQ3JFLE1BQU0sQ0FBQyxJQUFJO1FBRWQsSUFBSSxJQUFJLENBQUMsU0FBUztZQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUVuRCxJQUFJLENBQUMsU0FBUyxHQUFHO1lBQ2IsSUFBSSxFQUFHLElBQUksZUFBZSxFQUFFO1NBQy9CLENBQUM7UUFFRiwyQkFBMkI7UUFDM0IsQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUU1QyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUVEOzs7O09BSUc7SUFDSyxNQUFNLENBQUMsVUFBVTtRQUVyQixJQUFJLElBQWtCLENBQUM7UUFDdkIsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDLGdCQUFnQixDQUNoQyxRQUFRLENBQUMsSUFBSSxFQUNiLFVBQVUsQ0FBQyxZQUFZLEdBQUcsVUFBVSxDQUFDLFNBQVMsRUFDOUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUMvQixLQUFLLENBQ1IsQ0FBQztRQUVGLE9BQVEsSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFDOUI7WUFDSSxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssSUFBSSxDQUFDLFlBQVksRUFDdkM7Z0JBQ0ksSUFBSSxPQUFPLEdBQUcsSUFBZSxDQUFDO2dCQUU5QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFD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QyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUssQ0FBQztRQUN6RCxJQUFJLENBQUMsT0FBTyxDQUFFLGFBQWEsRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFFLENBQUM7SUFDN0QsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogR2xvYmFsIHJlZmVyZW5jZSB0byB0aGUgbGFuZ3VhZ2UgY29udGFpbmVyLCBzZXQgYXQgaW5pdCAqL1xyXG5sZXQgTCA6IEVuZ2xpc2hMYW5ndWFnZSB8IEJhc2VMYW5ndWFnZTtcclxuXHJcbmNsYXNzIEkxOG5cclxue1xyXG4gICAgLyoqIENvbnN0YW50IHJlZ2V4IHRvIG1hdGNoIGZvciB0cmFuc2xhdGlvbiBrZXlzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBUQUdfUkVHRVggOiBSZWdFeHAgPSAvJVtBLVpfXSslLztcclxuXHJcbiAgICAvKiogTGFuZ3VhZ2VzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGxhbmd1YWdlcyAgIDogRGljdGlvbmFyeTxCYXNlTGFuZ3VhZ2U+O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byBsYW5ndWFnZSBjdXJyZW50bHkgaW4gdXNlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBjdXJyZW50TGFuZyA6IEJhc2VMYW5ndWFnZTtcclxuXHJcbiAgICAvKiogUGlja3MgYSBsYW5ndWFnZSwgYW5kIHRyYW5zZm9ybXMgYWxsIHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGRvY3VtZW50ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5sYW5ndWFnZXMpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSTE4biBpcyBhbHJlYWR5IGluaXRpYWxpemVkJyk7XHJcblxyXG4gICAgICAgIHRoaXMubGFuZ3VhZ2VzID0ge1xyXG4gICAgICAgICAgICAnZW4nIDogbmV3IEVuZ2xpc2hMYW5ndWFnZSgpXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTGFuZ3VhZ2Ugc2VsZWN0aW9uXHJcbiAgICAgICAgTCA9IHRoaXMuY3VycmVudExhbmcgPSB0aGlzLmxhbmd1YWdlc1snZW4nXTtcclxuXHJcbiAgICAgICAgSTE4bi5hcHBseVRvRG9tKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXYWxrcyB0aHJvdWdoIGFsbCB0ZXh0IG5vZGVzIGluIHRoZSBET00sIHJlcGxhY2luZyBhbnkgdHJhbnNsYXRpb24ga2V5cy5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMDczMDc3Ny8zMzU0OTIwXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGFwcGx5VG9Eb20oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgbmV4dCA6IE5vZGUgfCBudWxsO1xyXG4gICAgICAgIGxldCB3YWxrID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keSxcclxuICAgICAgICAgICAgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQgfCBOb2RlRmlsdGVyLlNIT1dfVEVYVCxcclxuICAgICAgICAgICAgeyBhY2NlcHROb2RlOiBJMThuLm5vZGVGaWx0ZXIgfSxcclxuICAgICAgICAgICAgZmFsc2VcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB3aGlsZSAoIG5leHQgPSB3YWxrLm5leHROb2RlKCkgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKG5leHQubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5leHQgYXMgRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuYXR0cmlidXRlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgICAgICAgICBJMThuLmV4cGFuZEF0dHJpYnV0ZShlbGVtZW50LmF0dHJpYnV0ZXNbaV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKG5leHQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFICYmIG5leHQudGV4dENvbnRlbnQpXHJcbiAgICAgICAgICAgICAgICBJMThuLmV4cGFuZFRleHROb2RlKG5leHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsdGVycyB0aGUgdHJlZSB3YWxrZXIgdG8gZXhjbHVkZSBzY3JpcHQgYW5kIHN0eWxlIHRhZ3MgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgdGFnID0gKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgICAgICA/IChub2RlIGFzIEVsZW1lbnQpLnRhZ05hbWUudG9VcHBlckNhc2UoKVxyXG4gICAgICAgICAgICA6IG5vZGUucGFyZW50RWxlbWVudCEudGFnTmFtZS50b1VwcGVyQ2FzZSgpO1xyXG5cclxuICAgICAgICByZXR1cm4gWydTQ1JJUFQnLCAnU1RZTEUnXS5pbmNsdWRlcyh0YWcpXHJcbiAgICAgICAgICAgID8gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUXHJcbiAgICAgICAgICAgIDogTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFeHBhbmRzIGFueSB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBnaXZlbiBhdHRyaWJ1dGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGV4cGFuZEF0dHJpYnV0ZShhdHRyOiBBdHRyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTZXR0aW5nIGFuIGF0dHJpYnV0ZSwgZXZlbiBpZiBub3RoaW5nIGFjdHVhbGx5IGNoYW5nZXMsIHdpbGwgY2F1c2UgdmFyaW91c1xyXG4gICAgICAgIC8vIHNpZGUtZWZmZWN0cyAoZS5nLiByZWxvYWRpbmcgaWZyYW1lcykuIFNvLCBhcyB3YXN0ZWZ1bCBhcyB0aGlzIGxvb2tzLCB3ZSBoYXZlXHJcbiAgICAgICAgLy8gdG8gbWF0Y2ggZmlyc3QgYmVmb3JlIGFjdHVhbGx5IHJlcGxhY2luZy5cclxuXHJcbiAgICAgICAgaWYgKCBhdHRyLnZhbHVlLm1hdGNoKHRoaXMuVEFHX1JFR0VYKSApXHJcbiAgICAgICAgICAgIGF0dHIudmFsdWUgPSBhdHRyLnZhbHVlLnJlcGxhY2UodGhpcy5UQUdfUkVHRVgsIEkxOG4ucmVwbGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEV4cGFuZHMgYW55IHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGdpdmVuIHRleHQgbm9kZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZXhwYW5kVGV4dE5vZGUobm9kZTogTm9kZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbm9kZS50ZXh0Q29udGVudCA9IG5vZGUudGV4dENvbnRlbnQhLnJlcGxhY2UodGhpcy5UQUdfUkVHRVgsIEkxOG4ucmVwbGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcGxhY2VzIGtleSB3aXRoIHZhbHVlIGlmIGl0IGV4aXN0cywgZWxzZSBrZWVwcyB0aGUga2V5ICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXBsYWNlKG1hdGNoOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSAgID0gbWF0Y2guc2xpY2UoMSwgLTEpO1xyXG4gICAgICAgIGxldCB2YWx1ZSA9IExba2V5XSBhcyBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgICAgICBpZiAoIXZhbHVlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignTWlzc2luZyB0cmFuc2xhdGlvbiBrZXk6JywgbWF0Y2gpO1xyXG4gICAgICAgICAgICByZXR1cm4gbWF0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBEZWxlZ2F0ZSB0eXBlIGZvciBjaG9vc2VyIHNlbGVjdCBldmVudCBoYW5kbGVycyAqL1xyXG50eXBlIFNlbGVjdERlbGVnYXRlID0gKGVudHJ5OiBIVE1MRWxlbWVudCkgPT4gdm9pZDtcclxuXHJcbi8qKiBVSSBlbGVtZW50IHdpdGggYSBmaWx0ZXJhYmxlIGFuZCBrZXlib2FyZCBuYXZpZ2FibGUgbGlzdCBvZiBjaG9pY2VzICovXHJcbmNsYXNzIENob29zZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIHRlbXBsYXRlIHRvIGNsb25lLCBmb3IgZWFjaCBjaG9vc2VyIGNyZWF0ZWQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFICAgICAgICA9IERPTS5yZXF1aXJlKCcjY2hvb3NlclRlbXBsYXRlJyk7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5pZCAgICAgPSAnJztcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBjb250YWluZXIgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkb20gICAgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgZmlsdGVyIGlucHV0IGJveCAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlucHV0RmlsdGVyICA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGNvbnRhaW5lciBvZiBpdGVtIGVsZW1lbnRzICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5wdXRDaG9pY2VzIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIE9wdGlvbmFsIGV2ZW50IGhhbmRsZXIgdG8gZmlyZSB3aGVuIGFuIGl0ZW0gaXMgc2VsZWN0ZWQgYnkgdGhlIHVzZXIgKi9cclxuICAgIHB1YmxpYyAgICBvblNlbGVjdD8gICAgIDogU2VsZWN0RGVsZWdhdGU7XHJcbiAgICAvKiogV2hldGhlciB0byB2aXN1YWxseSBzZWxlY3QgdGhlIGNsaWNrZWQgZWxlbWVudCAqL1xyXG4gICAgcHVibGljICAgIHNlbGVjdE9uQ2xpY2sgOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBpdGVtLCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCBkb21TZWxlY3RlZD8gIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBhdXRvLWZpbHRlciB0aW1lb3V0LCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCBmaWx0ZXJUaW1lb3V0IDogbnVtYmVyID0gMDtcclxuICAgIC8qKiBXaGV0aGVyIHRvIGdyb3VwIGFkZGVkIGVsZW1lbnRzIGJ5IGFscGhhYmV0aWNhbCBzZWN0aW9ucyAqL1xyXG4gICAgcHJvdGVjdGVkIGdyb3VwQnlBQkMgICAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogVGl0bGUgYXR0cmlidXRlIHRvIGFwcGx5IHRvIGV2ZXJ5IGl0ZW0gYWRkZWQgKi9cclxuICAgIHByb3RlY3RlZCBpdGVtVGl0bGUgICAgIDogc3RyaW5nID0gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIGl0ZW0nO1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGEgY2hvb3NlciwgYnkgcmVwbGFjaW5nIHRoZSBwbGFjZWhvbGRlciBpbiBhIGdpdmVuIHBhcmVudCAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFDaG9vc2VyLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBDaG9vc2VyLmluaXQoKTtcclxuXHJcbiAgICAgICAgbGV0IHRhcmdldCAgICAgID0gRE9NLnJlcXVpcmUoJ2Nob29zZXInLCBwYXJlbnQpO1xyXG4gICAgICAgIGxldCBwbGFjZWhvbGRlciA9IERPTS5nZXRBdHRyKCB0YXJnZXQsICdwbGFjZWhvbGRlcicsIEwuUF9HRU5FUklDX1BIKCkgKTtcclxuICAgICAgICBsZXQgdGl0bGUgICAgICAgPSBET00uZ2V0QXR0ciggdGFyZ2V0LCAndGl0bGUnLCBMLlBfR0VORVJJQ19UKCkgKTtcclxuICAgICAgICB0aGlzLml0ZW1UaXRsZSAgPSBET00uZ2V0QXR0cih0YXJnZXQsICdpdGVtVGl0bGUnLCB0aGlzLml0ZW1UaXRsZSk7XHJcbiAgICAgICAgdGhpcy5ncm91cEJ5QUJDID0gdGFyZ2V0Lmhhc0F0dHJpYnV0ZSgnZ3JvdXBCeUFCQycpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbSAgICAgICAgICA9IENob29zZXIuVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIgID0gRE9NLnJlcXVpcmUoJy5jaFNlYXJjaEJveCcsICB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMgPSBET00ucmVxdWlyZSgnLmNoQ2hvaWNlc0JveCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMudGl0bGUgICAgICA9IHRpdGxlO1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIucGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcclxuICAgICAgICAvLyBUT0RPOiBSZXVzaW5nIHRoZSBwbGFjZWhvbGRlciBhcyB0aXRsZSBpcyBwcm9iYWJseSBiYWRcclxuICAgICAgICAvLyBodHRwczovL2xha2VuLm5ldC9ibG9nL21vc3QtY29tbW9uLWExMXktbWlzdGFrZXMvXHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci50aXRsZSAgICAgICA9IHBsYWNlaG9sZGVyO1xyXG5cclxuICAgICAgICB0YXJnZXQuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdiZWZvcmViZWdpbicsIHRoaXMuZG9tKTtcclxuICAgICAgICB0YXJnZXQucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBZGRzIHRoZSBnaXZlbiB2YWx1ZSB0byB0aGUgY2hvb3NlciBhcyBhIHNlbGVjdGFibGUgaXRlbS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVGV4dCBvZiB0aGUgc2VsZWN0YWJsZSBpdGVtXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFdoZXRoZXIgdG8gc2VsZWN0IHRoaXMgaXRlbSBvbmNlIGFkZGVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhZGQodmFsdWU6IHN0cmluZywgc2VsZWN0OiBib29sZWFuID0gZmFsc2UpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuXHJcbiAgICAgICAgaXRlbS5pbm5lclRleHQgPSB2YWx1ZTtcclxuXHJcbiAgICAgICAgdGhpcy5hZGRSYXcoaXRlbSwgc2VsZWN0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFkZHMgdGhlIGdpdmVuIGVsZW1lbnQgdG8gdGhlIGNob29zZXIgYXMgYSBzZWxlY3RhYmxlIGl0ZW0uXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGl0ZW0gRWxlbWVudCB0byBhZGQgdG8gdGhlIGNob29zZXJcclxuICAgICAqIEBwYXJhbSBzZWxlY3QgV2hldGhlciB0byBzZWxlY3QgdGhpcyBpdGVtIG9uY2UgYWRkZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGFkZFJhdyhpdGVtOiBIVE1MRWxlbWVudCwgc2VsZWN0OiBib29sZWFuID0gZmFsc2UpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGl0ZW0udGl0bGUgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgICAgICBpdGVtLnRhYkluZGV4ID0gLTE7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmFwcGVuZENoaWxkKGl0ZW0pO1xyXG5cclxuICAgICAgICBpZiAoc2VsZWN0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoaXRlbSk7XHJcbiAgICAgICAgICAgIGl0ZW0uZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFycyBhbGwgaXRlbXMgZnJvbSB0aGlzIGNob29zZXIgYW5kIHRoZSBjdXJyZW50IGZpbHRlciAqL1xyXG4gICAgcHVibGljIGNsZWFyKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuaW5uZXJIVE1MID0gJyc7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci52YWx1ZSAgICAgID0gJyc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNlbGVjdCBhbmQgZm9jdXMgdGhlIGVudHJ5IHRoYXQgbWF0Y2hlcyB0aGUgZ2l2ZW4gdmFsdWUgKi9cclxuICAgIHB1YmxpYyBwcmVzZWxlY3QodmFsdWU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQga2V5IGluIHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGl0ZW0gPSB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbltrZXldIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgaWYgKHZhbHVlID09PSBpdGVtLmlubmVyVGV4dClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoaXRlbSk7XHJcbiAgICAgICAgICAgICAgICBpdGVtLmZvY3VzKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbGljayBldmVudHMsIGZvciBjaG9vc2luZyBpdGVtcyAqL1xyXG4gICAgcHVibGljIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSBldi50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggdGhpcy5pc0Nob2ljZSh0YXJnZXQpIClcclxuICAgICAgICBpZiAoICF0YXJnZXQuaGFzQXR0cmlidXRlKCdkaXNhYmxlZCcpIClcclxuICAgICAgICAgICAgdGhpcy5zZWxlY3QodGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbG9zZSBtZXRob2RzLCBkb2luZyBhbnkgdGltZXIgY2xlYW51cCAqL1xyXG4gICAgcHVibGljIG9uQ2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgaW5wdXQgZXZlbnRzLCBmb3IgZmlsdGVyaW5nIGFuZCBuYXZpZ2F0aW9uICovXHJcbiAgICBwdWJsaWMgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSAgICAgPSBldi5rZXk7XHJcbiAgICAgICAgbGV0IGZvY3VzZWQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCBwYXJlbnQgID0gZm9jdXNlZC5wYXJlbnRFbGVtZW50ITtcclxuXHJcbiAgICAgICAgaWYgKCFmb2N1c2VkKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIE9ubHkgaGFuZGxlIGV2ZW50cyBvbiB0aGlzIGNob29zZXIncyBjb250cm9sc1xyXG4gICAgICAgIGlmICggIXRoaXMub3ducyhmb2N1c2VkKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHR5cGluZyBpbnRvIGZpbHRlciBib3hcclxuICAgICAgICBpZiAoZm9jdXNlZCA9PT0gdGhpcy5pbnB1dEZpbHRlcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyVGltZW91dCA9IHdpbmRvdy5zZXRUaW1lb3V0KF8gPT4gdGhpcy5maWx0ZXIoKSwgNTAwKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUmVkaXJlY3QgdHlwaW5nIHRvIGlucHV0IGZpbHRlciBib3hcclxuICAgICAgICBpZiAoZm9jdXNlZCAhPT0gdGhpcy5pbnB1dEZpbHRlcilcclxuICAgICAgICBpZiAoa2V5Lmxlbmd0aCA9PT0gMSB8fCBrZXkgPT09ICdCYWNrc3BhY2UnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pbnB1dEZpbHRlci5mb2N1cygpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcHJlc3NpbmcgRU5URVIgYWZ0ZXIga2V5Ym9hcmQgbmF2aWdhdGluZyB0byBhbiBpdGVtXHJcbiAgICAgICAgaWYgKCB0aGlzLmlzQ2hvaWNlKGZvY3VzZWQpIClcclxuICAgICAgICBpZiAoa2V5ID09PSAnRW50ZXInKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3QoZm9jdXNlZCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBuYXZpZ2F0aW9uIHdoZW4gY29udGFpbmVyIG9yIGl0ZW0gaXMgZm9jdXNlZFxyXG4gICAgICAgIGlmIChrZXkgPT09ICdBcnJvd0xlZnQnIHx8IGtleSA9PT0gJ0Fycm93UmlnaHQnKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGRpciA9IChrZXkgPT09ICdBcnJvd0xlZnQnKSA/IC0xIDogMTtcclxuICAgICAgICAgICAgbGV0IG5hdiA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LCBpZiB1c2luZyBncm91cHNcclxuICAgICAgICAgICAgaWYgICAgICAoIHRoaXMuZ3JvdXBCeUFCQyAmJiBwYXJlbnQuaGFzQXR0cmlidXRlKCdncm91cCcpIClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudCwgaWYgY2hvaWNlcyBhcmUgZmxhdFxyXG4gICAgICAgICAgICBlbHNlIGlmICghdGhpcy5ncm91cEJ5QUJDICYmIGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dENob2ljZXMpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGZvY3VzZWQgPT09IHRoaXMuZG9tU2VsZWN0ZWQpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcodGhpcy5kb21TZWxlY3RlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGV2YW50IHRvIGJlZ2lubmluZyBvciBlbmQgb2YgY29udGFpbmVyXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA9PT0gLTEpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5maXJzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQubGFzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChuYXYpIG5hdi5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBzdWJtaXQgZXZlbnRzLCBmb3IgaW5zdGFudCBmaWx0ZXJpbmcgKi9cclxuICAgIHB1YmxpYyBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgdGhpcy5maWx0ZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGlkZSBvciBzaG93IGNob2ljZXMgaWYgdGhleSBwYXJ0aWFsbHkgbWF0Y2ggdGhlIHVzZXIgcXVlcnkgKi9cclxuICAgIHByb3RlY3RlZCBmaWx0ZXIoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcblxyXG4gICAgICAgIGxldCBmaWx0ZXIgPSB0aGlzLmlucHV0RmlsdGVyLnZhbHVlLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgbGV0IGl0ZW1zICA9IHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuO1xyXG4gICAgICAgIGxldCBlbmdpbmUgPSB0aGlzLmdyb3VwQnlBQkNcclxuICAgICAgICAgICAgPyBDaG9vc2VyLmZpbHRlckdyb3VwXHJcbiAgICAgICAgICAgIDogQ2hvb3Nlci5maWx0ZXJJdGVtO1xyXG5cclxuICAgICAgICAvLyBQcmV2ZW50IGJyb3dzZXIgcmVkcmF3L3JlZmxvdyBkdXJpbmcgZmlsdGVyaW5nXHJcbiAgICAgICAgLy8gVE9ETzogTWlnaHQgdGhlIHVzZSBvZiBoaWRkZW4gYnJlYWsgQTExeSBoZXJlPyAoZS5nLiBkZWZvY3VzKVxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmhpZGRlbiA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBhbGwgdGhlIGl0ZW1zXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgZW5naW5lKGl0ZW1zW2ldIGFzIEhUTUxFbGVtZW50LCBmaWx0ZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5oaWRkZW4gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQXBwbGllcyBmaWx0ZXIgdG8gYW4gaXRlbSwgc2hvd2luZyBpdCBpZiBtYXRjaGVkLCBoaWRpbmcgaWYgbm90ICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGZpbHRlckl0ZW0oaXRlbTogSFRNTEVsZW1lbnQsIGZpbHRlcjogc3RyaW5nKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIC8vIFNob3cgaWYgY29udGFpbnMgc2VhcmNoIHRlcm1cclxuICAgICAgICBpZiAoaXRlbS5pbm5lclRleHQudG9Mb3dlckNhc2UoKS5pbmRleE9mKGZpbHRlcikgPj0gMClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGl0ZW0uaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGlkZSBpZiBub3RcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpdGVtLmhpZGRlbiA9IHRydWU7XHJcbiAgICAgICAgICAgIHJldHVybiAxO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQXBwbGllcyBmaWx0ZXIgdG8gY2hpbGRyZW4gb2YgYSBncm91cCwgaGlkaW5nIHRoZSBncm91cCBpZiBhbGwgY2hpbGRyZW4gaGlkZSAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBmaWx0ZXJHcm91cChncm91cDogSFRNTEVsZW1lbnQsIGZpbHRlcjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cmllcyA9IGdyb3VwLmNoaWxkcmVuO1xyXG4gICAgICAgIGxldCBjb3VudCAgID0gZW50cmllcy5sZW5ndGggLSAxOyAvLyAtMSBmb3IgaGVhZGVyIGVsZW1lbnRcclxuICAgICAgICBsZXQgaGlkZGVuICA9IDA7XHJcblxyXG4gICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHN0YXRpb24gbmFtZSBpbiB0aGlzIGxldHRlciBzZWN0aW9uLiBIZWFkZXIgc2tpcHBlZC5cclxuICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGVudHJpZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIGhpZGRlbiArPSBDaG9vc2VyLmZpbHRlckl0ZW0oZW50cmllc1tpXSBhcyBIVE1MRWxlbWVudCwgZmlsdGVyKTtcclxuXHJcbiAgICAgICAgLy8gSWYgYWxsIHN0YXRpb24gbmFtZXMgaW4gdGhpcyBsZXR0ZXIgc2VjdGlvbiB3ZXJlIGhpZGRlbiwgaGlkZSB0aGUgc2VjdGlvblxyXG4gICAgICAgIGlmIChoaWRkZW4gPj0gY291bnQpXHJcbiAgICAgICAgICAgIGdyb3VwLmhpZGRlbiA9IHRydWU7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBncm91cC5oaWRkZW4gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgY2hhbmdlcyB0aGUgY3VycmVudCBzZWxlY3Rpb24sIGFuZCB1cGRhdGVzIHRoZSBzdGF0ZSBhbmQgZWRpdG9yICovXHJcbiAgICBwcm90ZWN0ZWQgc2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGFscmVhZHlTZWxlY3RlZCA9IChlbnRyeSA9PT0gdGhpcy5kb21TZWxlY3RlZCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnNlbGVjdE9uQ2xpY2spXHJcbiAgICAgICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGVudHJ5KTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25TZWxlY3QpXHJcbiAgICAgICAgICAgIHRoaXMub25TZWxlY3QoZW50cnkpO1xyXG5cclxuICAgICAgICBpZiAoYWxyZWFkeVNlbGVjdGVkKVxyXG4gICAgICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IGNoYW5nZXMgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50ICovXHJcbiAgICBwcm90ZWN0ZWQgdmlzdWFsU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy52aXN1YWxVbnNlbGVjdCgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkICAgICAgICAgID0gZW50cnk7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC50YWJJbmRleCA9IDUwO1xyXG4gICAgICAgIGVudHJ5LnNldEF0dHJpYnV0ZSgnc2VsZWN0ZWQnLCAndHJ1ZScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSB1bnNlbGVjdHMgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50LCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCB2aXN1YWxVbnNlbGVjdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5kb21TZWxlY3RlZClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnJlbW92ZUF0dHJpYnV0ZSgnc2VsZWN0ZWQnKTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnRhYkluZGV4ID0gLTE7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZCAgICAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFdoZXRoZXIgdGhpcyBjaG9vc2VyIGlzIGFuIGFuY2VzdG9yIChvd25lcikgb2YgdGhlIGdpdmVuIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFbGVtZW50IHRvIGNoZWNrIGlmIHRoaXMgY2hvb3NlciBpcyBhbiBhbmNlc3RvciBvZlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb3ducyh0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20uY29udGFpbnModGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogV2hldGhlciB0aGUgZ2l2ZW4gZWxlbWVudCBpcyBhIGNob29zYWJsZSBvbmUgb3duZWQgYnkgdGhpcyBjaG9vc2VyICovXHJcbiAgICBwcm90ZWN0ZWQgaXNDaG9pY2UodGFyZ2V0PzogSFRNTEVsZW1lbnQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0YXJnZXQgIT09IHVuZGVmaW5lZFxyXG4gICAgICAgICAgICAmJiB0YXJnZXQudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnZGQnXHJcbiAgICAgICAgICAgICYmIHRoaXMub3ducyh0YXJnZXQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLyBUT0RPOiBTZWFyY2ggYnkgc3RhdGlvbiBjb2RlXHJcblxyXG4vKipcclxuICogU2luZ2xldG9uIGluc3RhbmNlIG9mIHRoZSBzdGF0aW9uIHBpY2tlci4gU2luY2UgdGhlcmUgYXJlIGV4cGVjdGVkIHRvIGJlIDI1MDArXHJcbiAqIHN0YXRpb25zLCB0aGlzIGVsZW1lbnQgd291bGQgdGFrZSB1cCBhIGxvdCBvZiBtZW1vcnkgYW5kIGdlbmVyYXRlIGEgbG90IG9mIERPTS4gU28sIGl0XHJcbiAqIGhhcyB0byBiZSBcInN3YXBwZWRcIiBiZXR3ZWVuIHBpY2tlcnMgYW5kIHZpZXdzIHRoYXQgd2FudCB0byB1c2UgaXQuXHJcbiAqL1xyXG5jbGFzcyBTdGF0aW9uQ2hvb3NlciBleHRlbmRzIENob29zZXJcclxue1xyXG4gICAgLyoqIFNob3J0Y3V0IHJlZmVyZW5jZXMgdG8gYWxsIHRoZSBnZW5lcmF0ZWQgQS1aIHN0YXRpb24gbGlzdCBlbGVtZW50cyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21TdGF0aW9ucyA6IERpY3Rpb25hcnk8SFRNTERMaXN0RWxlbWVudD4gPSB7fTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGFyZW50OiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICBzdXBlcihwYXJlbnQpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy50YWJJbmRleCA9IDA7XHJcblxyXG4gICAgICAgIC8vIFBvcHVsYXRlcyB0aGUgbGlzdCBvZiBzdGF0aW9ucyBmcm9tIHRoZSBkYXRhYmFzZS4gV2UgZG8gdGhpcyBieSBjcmVhdGluZyBhIGRsXHJcbiAgICAgICAgLy8gZWxlbWVudCBmb3IgZWFjaCBsZXR0ZXIgb2YgdGhlIGFscGhhYmV0LCBjcmVhdGluZyBhIGR0IGVsZW1lbnQgaGVhZGVyLCBhbmQgdGhlblxyXG4gICAgICAgIC8vIHBvcHVsYXRpbmcgdGhlIGRsIHdpdGggc3RhdGlvbiBuYW1lIGRkIGNoaWxkcmVuLlxyXG4gICAgICAgIE9iamVjdC5rZXlzKFJBRy5kYXRhYmFzZS5zdGF0aW9ucykuZm9yRWFjaCggdGhpcy5hZGRTdGF0aW9uLmJpbmQodGhpcykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEF0dGFjaGVzIHRoaXMgY29udHJvbCB0byB0aGUgZ2l2ZW4gcGFyZW50IGFuZCByZXNldHMgc29tZSBzdGF0ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGlja2VyIFBpY2tlciB0byBhdHRhY2ggdGhpcyBjb250cm9sIHRvXHJcbiAgICAgKiBAcGFyYW0gb25TZWxlY3QgRGVsZWdhdGUgdG8gZmlyZSB3aGVuIGNob29zaW5nIGEgc3RhdGlvblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYXR0YWNoKHBpY2tlcjogUGlja2VyLCBvblNlbGVjdDogU2VsZWN0RGVsZWdhdGUpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgID0gcGlja2VyLmRvbUZvcm07XHJcbiAgICAgICAgbGV0IGN1cnJlbnQgPSB0aGlzLmRvbS5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICAvLyBSZS1lbmFibGUgYWxsIGRpc2FibGVkIGVsZW1lbnRzXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMucXVlcnlTZWxlY3RvckFsbChgZGRbZGlzYWJsZWRdYClcclxuICAgICAgICAgICAgLmZvckVhY2goIHRoaXMuZW5hYmxlLmJpbmQodGhpcykgKTtcclxuXHJcbiAgICAgICAgaWYgKCFjdXJyZW50IHx8IGN1cnJlbnQgIT09IHBhcmVudClcclxuICAgICAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgdGhpcy52aXN1YWxVbnNlbGVjdCgpO1xyXG4gICAgICAgIHRoaXMub25TZWxlY3QgPSBvblNlbGVjdC5iaW5kKHBpY2tlcik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFByZS1zZWxlY3RzIGEgc3RhdGlvbiBlbnRyeSBieSBpdHMgY29kZSAqL1xyXG4gICAgcHVibGljIHByZXNlbGVjdENvZGUoY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSB0aGlzLmdldEJ5Q29kZShjb2RlKTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChlbnRyeSk7XHJcbiAgICAgICAgZW50cnkuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRW5hYmxlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlIG9yIHN0YXRpb24gZWxlbWVudCBmb3Igc2VsZWN0aW9uICovXHJcbiAgICBwdWJsaWMgZW5hYmxlKGNvZGVPck5vZGU6IHN0cmluZyB8IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSAodHlwZW9mIGNvZGVPck5vZGUgPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICA/IHRoaXMuZ2V0QnlDb2RlKGNvZGVPck5vZGUpXHJcbiAgICAgICAgICAgIDogY29kZU9yTm9kZTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBlbnRyeS5yZW1vdmVBdHRyaWJ1dGUoJ2Rpc2FibGVkJyk7XHJcbiAgICAgICAgZW50cnkudGFiSW5kZXggPSAtMTtcclxuICAgICAgICBlbnRyeS50aXRsZSAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBEaXNhYmxlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlIGZyb20gc2VsZWN0aW9uICovXHJcbiAgICBwdWJsaWMgZGlzYWJsZShjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9IHRoaXMuZ2V0QnlDb2RlKGNvZGUpO1xyXG4gICAgICAgIGxldCBuZXh0ICA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhlbnRyeSwgMSk7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgZW50cnkuc2V0QXR0cmlidXRlKCdkaXNhYmxlZCcsICcnKTtcclxuICAgICAgICBlbnRyeS5yZW1vdmVBdHRyaWJ1dGUoJ3RhYmluZGV4Jyk7XHJcbiAgICAgICAgZW50cnkudGl0bGUgPSAnJztcclxuXHJcbiAgICAgICAgLy8gU2hpZnQgZm9jdXMgdG8gbmV4dCBhdmFpbGFibGUgZWxlbWVudCwgZm9yIGtleWJvYXJkIG5hdmlnYXRpb25cclxuICAgICAgICBpZiAobmV4dClcclxuICAgICAgICAgICAgbmV4dC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIGEgc3RhdGlvbidzIGNob2ljZSBlbGVtZW50IGJ5IGl0cyBjb2RlICovXHJcbiAgICBwcml2YXRlIGdldEJ5Q29kZShjb2RlOiBzdHJpbmcpIDogSFRNTEVsZW1lbnRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbnB1dENob2ljZXNcclxuICAgICAgICAgICAgLnF1ZXJ5U2VsZWN0b3IoYGRkW2RhdGEtY29kZT0ke2NvZGV9XWApIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlICovXHJcbiAgICBwcml2YXRlIGFkZFN0YXRpb24oY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IFJBRy5kYXRhYmFzZS5zdGF0aW9uc1tjb2RlXTtcclxuICAgICAgICBsZXQgbGV0dGVyICA9IHN0YXRpb25bMF07XHJcbiAgICAgICAgbGV0IGdyb3VwICAgPSB0aGlzLmRvbVN0YXRpb25zW2xldHRlcl07XHJcblxyXG4gICAgICAgIGlmICghZ3JvdXApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaGVhZGVyICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZHQnKTtcclxuICAgICAgICAgICAgaGVhZGVyLmlubmVyVGV4dCA9IGxldHRlci50b1VwcGVyQ2FzZSgpO1xyXG4gICAgICAgICAgICBoZWFkZXIudGFiSW5kZXggID0gLTE7XHJcblxyXG4gICAgICAgICAgICBncm91cCA9IHRoaXMuZG9tU3RhdGlvbnNbbGV0dGVyXSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RsJyk7XHJcbiAgICAgICAgICAgIGdyb3VwLnRhYkluZGV4ID0gNTA7XHJcblxyXG4gICAgICAgICAgICBncm91cC5zZXRBdHRyaWJ1dGUoJ2dyb3VwJywgJycpO1xyXG4gICAgICAgICAgICBncm91cC5hcHBlbmRDaGlsZChoZWFkZXIpO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5hcHBlbmRDaGlsZChncm91cCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgZW50cnkgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG4gICAgICAgIGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSA9IGNvZGU7XHJcbiAgICAgICAgZW50cnkuaW5uZXJUZXh0ICAgICAgID0gUkFHLmRhdGFiYXNlLnN0YXRpb25zW2NvZGVdO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlICAgICAgICAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgICAgIGVudHJ5LnRhYkluZGV4ICAgICAgICA9IC0xO1xyXG5cclxuICAgICAgICBncm91cC5hcHBlbmRDaGlsZChlbnRyeSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBTdGF0aW9uIGxpc3QgaXRlbSB0aGF0IGNhbiBiZSBkcmFnZ2VkIGFuZCBkcm9wcGVkICovXHJcbmNsYXNzIFN0YXRpb25MaXN0SXRlbVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBET00gdGVtcGxhdGUgdG8gY2xvbmUsIGZvciBlYWNoIGl0ZW0gY3JlYXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgVEVNUExBVEUgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgZGV0YWNoZXMgdGhlIHRlbXBsYXRlIG9uIGZpcnN0IGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURSAgICAgICAgPSBET00ucmVxdWlyZSgnI3N0YXRpb25MaXN0SXRlbVRlbXBsYXRlJyk7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmlkICAgICA9ICcnO1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGl0ZW0ncyBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgc3RhdGlvbiBsaXN0IGl0ZW0sIG1lYW50IGZvciB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBjcmVhdGUgdGhpcyBpdGVtIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoY29kZTogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIGlmICghU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uaW5pdCgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbSAgICAgICAgICAgPSBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuZG9tLmlubmVyVGV4dCA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5kYXRhc2V0Wydjb2RlJ10gPSBjb2RlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQmFzZSBjbGFzcyBmb3IgcGlja2VyIHZpZXdzICovXHJcbmFic3RyYWN0IGNsYXNzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb20gICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBmb3JtIERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tRm9ybSAgIDogSFRNTEZvcm1FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGhlYWRlciBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tSGVhZGVyIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogR2V0cyB0aGUgbmFtZSBvZiB0aGUgWE1MIHRhZyB0aGlzIHBpY2tlciBoYW5kbGVzICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgeG1sVGFnICAgIDogc3RyaW5nO1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBocmFzZSBlbGVtZW50IGJlaW5nIGVkaXRlZCBieSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHJvdGVjdGVkIGRvbUVkaXRpbmc/IDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgcGlja2VyIHRvIGhhbmRsZSB0aGUgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQgdHlwZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30geG1sVGFnIE5hbWUgb2YgdGhlIFhNTCB0YWcgdGhpcyBwaWNrZXIgd2lsbCBoYW5kbGUuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3Rvcih4bWxUYWc6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSAgICAgICA9IERPTS5yZXF1aXJlKGAjJHt4bWxUYWd9UGlja2VyYCk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtICAgPSBET00ucmVxdWlyZSgnZm9ybScsICAgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyID0gRE9NLnJlcXVpcmUoJ2hlYWRlcicsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLnhtbFRhZyAgICA9IHhtbFRhZztcclxuXHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uY2hhbmdlICA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25pbnB1dCAgID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmNsaWNrICAgPSB0aGlzLm9uQ2xpY2suYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25rZXlkb3duID0gdGhpcy5vbklucHV0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uc3VibWl0ICA9IHRoaXMub25TdWJtaXQuYmluZCh0aGlzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENhbGxlZCB3aGVuIGZvcm0gZmllbGRzIGNoYW5nZS4gVGhlIGltcGxlbWVudGluZyBwaWNrZXIgc2hvdWxkIHVwZGF0ZSBhbGwgbGlua2VkXHJcbiAgICAgKiBlbGVtZW50cyAoZS5nLiBvZiBzYW1lIHR5cGUpIHdpdGggdGhlIG5ldyBkYXRhIGhlcmUuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBvbkNoYW5nZShldjogRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKiogQ2FsbGVkIHdoZW4gYSBtb3VzZSBjbGljayBoYXBwZW5zIGFueXdoZXJlIGluIG9yIG9uIHRoZSBwaWNrZXIncyBmb3JtICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkO1xyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiBhIGtleSBpcyBwcmVzc2VkIHdoaWxzdCB0aGUgcGlja2VyJ3MgZm9ybSBpcyBmb2N1c2VkICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2FsbGVkIHdoZW4gRU5URVIgaXMgcHJlc3NlZCB3aGlsc3QgYSBmb3JtIGNvbnRyb2wgb2YgdGhlIHBpY2tlciBpcyBmb2N1c2VkLlxyXG4gICAgICogQnkgZGVmYXVsdCwgdGhpcyB3aWxsIHRyaWdnZXIgdGhlIG9uQ2hhbmdlIGhhbmRsZXIgYW5kIGNsb3NlIHRoZSBkaWFsb2cuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgdGhpcy5vbkNoYW5nZShldik7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogT3BlbiB0aGlzIHBpY2tlciBmb3IgYSBnaXZlbiBwaHJhc2UgZWxlbWVudC4gVGhlIGltcGxlbWVudGluZyBwaWNrZXIgc2hvdWxkIGZpbGxcclxuICAgICAqIGl0cyBmb3JtIGVsZW1lbnRzIHdpdGggZGF0YSBmcm9tIHRoZSBjdXJyZW50IHN0YXRlIGFuZCB0YXJnZXRlZCBlbGVtZW50IGhlcmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gdGFyZ2V0IFBocmFzZSBlbGVtZW50IHRoYXQgdGhpcyBwaWNrZXIgaXMgYmVpbmcgb3BlbmVkIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmRvbUVkaXRpbmcgPSB0YXJnZXQ7XHJcbiAgICAgICAgdGhpcy5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBGaXgga2V5Ym9hcmQgc3RheWluZyBvcGVuIGluIGlPUyBvbiBjbG9zZVxyXG4gICAgICAgIERPTS5ibHVyQWN0aXZlKHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9zaXRpb25zIHRoaXMgcGlja2VyIHJlbGF0aXZlIHRvIHRoZSB0YXJnZXQgcGhyYXNlIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyBsYXlvdXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuZG9tRWRpdGluZylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgdGFyZ2V0UmVjdCA9IHRoaXMuZG9tRWRpdGluZy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBsZXQgZnVsbFdpZHRoICA9IHRoaXMuZG9tLmNsYXNzTGlzdC5jb250YWlucygnZnVsbFdpZHRoJyk7XHJcbiAgICAgICAgbGV0IGlzTW9kYWwgICAgPSB0aGlzLmRvbS5jbGFzc0xpc3QuY29udGFpbnMoJ21vZGFsJyk7XHJcbiAgICAgICAgbGV0IGRvY1cgICAgICAgPSBkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoO1xyXG4gICAgICAgIGxldCBkb2NIICAgICAgID0gZG9jdW1lbnQuYm9keS5jbGllbnRIZWlnaHQ7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1ggICAgPSAodGFyZ2V0UmVjdC5sZWZ0ICAgfCAwKSAtIDg7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1kgICAgPSAgdGFyZ2V0UmVjdC5ib3R0b20gfCAwO1xyXG4gICAgICAgIGxldCBkaWFsb2dXICAgID0gKHRhcmdldFJlY3Qud2lkdGggIHwgMCkgKyAxNjtcclxuXHJcbiAgICAgICAgLy8gQWRqdXN0IGlmIGhvcml6b250YWxseSBvZmYgc2NyZWVuXHJcbiAgICAgICAgaWYgKCFmdWxsV2lkdGggJiYgIWlzTW9kYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBGb3JjZSBmdWxsIHdpZHRoIG9uIG1vYmlsZVxyXG4gICAgICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS53aWR0aCA9IGAxMDAlYDtcclxuXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dYID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLndpZHRoICAgID0gYGluaXRpYWxgO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUubWluV2lkdGggPSBgJHtkaWFsb2dXfXB4YDtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoZGlhbG9nWCArIHRoaXMuZG9tLm9mZnNldFdpZHRoID4gZG9jVylcclxuICAgICAgICAgICAgICAgICAgICBkaWFsb2dYID0gKHRhcmdldFJlY3QucmlnaHQgfCAwKSAtIHRoaXMuZG9tLm9mZnNldFdpZHRoICsgODtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBpY2tlcnMgdGhhdCBpbnN0ZWFkIHRha2UgdXAgdGhlIHdob2xlIGRpc3BsYXkuIENTUyBpc24ndCB1c2VkIGhlcmUsXHJcbiAgICAgICAgLy8gYmVjYXVzZSBwZXJjZW50YWdlLWJhc2VkIGxlZnQvdG9wIGNhdXNlcyBzdWJwaXhlbCBpc3N1ZXMgb24gQ2hyb21lLlxyXG4gICAgICAgIGlmIChpc01vZGFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZGlhbG9nWCA9IERPTS5pc01vYmlsZSA/IDAgOlxyXG4gICAgICAgICAgICAgICAgKCAoZG9jVyAgKiAwLjEpIC8gMiApIHwgMDtcclxuXHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSBET00uaXNNb2JpbGUgPyAwIDpcclxuICAgICAgICAgICAgICAgICggKGRvY0ggKiAwLjEpIC8gMiApIHwgMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsYW1wIHRvIHRvcCBlZGdlIG9mIGRvY3VtZW50XHJcbiAgICAgICAgZWxzZSBpZiAoZGlhbG9nWSA8IDApXHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSAwO1xyXG5cclxuICAgICAgICAvLyBBZGp1c3QgaWYgdmVydGljYWxseSBvZmYgc2NyZWVuXHJcbiAgICAgICAgZWxzZSBpZiAoZGlhbG9nWSArIHRoaXMuZG9tLm9mZnNldEhlaWdodCA+IGRvY0gpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBkaWFsb2dZID0gKHRhcmdldFJlY3QudG9wIHwgMCkgLSB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgKyAxO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LmFkZCgnYmVsb3cnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2Fib3ZlJyk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBzdGlsbCBvZmYtc2NyZWVuLCBjbGFtcCB0byBib3R0b21cclxuICAgICAgICAgICAgaWYgKGRpYWxvZ1kgKyB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgPiBkb2NIKVxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWSA9IGRvY0ggLSB0aGlzLmRvbS5vZmZzZXRIZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICAvLyBDbGFtcCB0byB0b3AgZWRnZSBvZiBkb2N1bWVudC4gTGlrZWx5IGhhcHBlbnMgaWYgdGFyZ2V0IGVsZW1lbnQgaXMgbGFyZ2UuXHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dZIDwgMClcclxuICAgICAgICAgICAgICAgIGRpYWxvZ1kgPSAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LmFkZCgnYWJvdmUnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2JlbG93Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmRvbS5zdHlsZS5sZWZ0ID0gKGZ1bGxXaWR0aCA/IDAgOiBkaWFsb2dYKSArICdweCc7XHJcbiAgICAgICAgdGhpcy5kb20uc3R5bGUudG9wICA9IGRpYWxvZ1kgKyAncHgnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXR1cm5zIHRydWUgaWYgYW4gZWxlbWVudCBpbiB0aGlzIHBpY2tlciBjdXJyZW50bHkgaGFzIGZvY3VzICovXHJcbiAgICBwdWJsaWMgaGFzRm9jdXMoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20uY29udGFpbnMoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGNvYWNoIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgQ29hY2hQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGxldHRlciBkcm9wLWRvd24gaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExldHRlciA6IEhUTUxTZWxlY3RFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgY29hY2ggZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2NvYWNoJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIgPSBET00ucmVxdWlyZSgnc2VsZWN0JywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDI2OyBpKyspXHJcbiAgICAgICAgICAgIERPTS5hZGRPcHRpb24odGhpcy5pbnB1dExldHRlciwgTC5MRVRURVJTW2ldLCBMLkxFVFRFUlNbaV0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgdGFyZ2V0IGNvbnRleHQncyBjb2FjaCBsZXR0ZXIgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9DT0FDSCh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gUkFHLnN0YXRlLmdldENvYWNoKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBjb2FjaCBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX0NPQUNIX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0Q29hY2godGhpcy5jdXJyZW50Q3R4LCB0aGlzLmlucHV0TGV0dGVyLnZhbHVlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9Y29hY2hdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5pbnB1dExldHRlci52YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBleGN1c2UgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBFeGN1c2VQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdleGN1c2UnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfRVhDVVNFKCk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5leGN1c2VzLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIGV4Y3VzZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBleGN1c2VcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KFJBRy5zdGF0ZS5leGN1c2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgZXhjdXNlIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlLmV4Y3VzZSA9IGVudHJ5LmlubmVyVGV4dDtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCgnZXhjdXNlJywgUkFHLnN0YXRlLmV4Y3VzZSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGludGVnZXIgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBJbnRlZ2VyUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBudW1lcmljYWwgaW5wdXQgc3Bpbm5lciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dERpZ2l0IDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBvcHRpb25hbCBzdWZmaXggbGFiZWwgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tTGFiZWwgICA6IEhUTUxMYWJlbEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHg/IDogc3RyaW5nO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvcHRpb25hbCBzaW5ndWxhciBzdWZmaXggZm9yIHRoZSBjdXJyZW50IGludGVnZXIgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHNpbmd1bGFyPyAgIDogc3RyaW5nO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvcHRpb25hbCBwbHVyYWwgc3VmZml4IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBwbHVyYWw/ICAgICA6IHN0cmluZztcclxuICAgIC8qKiBXaGV0aGVyIHRoZSBjdXJyZW50IGludGVnZXIgYmVpbmcgZWRpdGVkIHdhbnRzIHdvcmQgZGlnaXRzICovXHJcbiAgICBwcml2YXRlIHdvcmRzPyAgICAgIDogYm9vbGVhbjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdpbnRlZ2VyJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdCA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUxhYmVsICAgPSBET00ucmVxdWlyZSgnbGFiZWwnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIC8vIGlPUyBuZWVkcyBkaWZmZXJlbnQgdHlwZSBhbmQgcGF0dGVybiB0byBzaG93IGEgbnVtZXJpY2FsIGtleWJvYXJkXHJcbiAgICAgICAgaWYgKERPTS5pc2lPUylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC50eXBlICAgID0gJ3RlbCc7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5wYXR0ZXJuID0gJ1swLTldKyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgdGFyZ2V0IGNvbnRleHQncyBpbnRlZ2VyIGRhdGEgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLnNpbmd1bGFyICAgPSB0YXJnZXQuZGF0YXNldFsnc2luZ3VsYXInXTtcclxuICAgICAgICB0aGlzLnBsdXJhbCAgICAgPSB0YXJnZXQuZGF0YXNldFsncGx1cmFsJ107XHJcbiAgICAgICAgdGhpcy53b3JkcyAgICAgID0gUGFyc2UuYm9vbGVhbih0YXJnZXQuZGF0YXNldFsnd29yZHMnXSB8fCAnZmFsc2UnKTtcclxuXHJcbiAgICAgICAgbGV0IHZhbHVlID0gUkFHLnN0YXRlLmdldEludGVnZXIodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgaWYgICAgICAodGhpcy5zaW5ndWxhciAmJiB2YWx1ZSA9PT0gMSlcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnNpbmd1bGFyO1xyXG4gICAgICAgIGVsc2UgaWYgKHRoaXMucGx1cmFsICYmIHZhbHVlICE9PSAxKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMucGx1cmFsO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSAnJztcclxuXHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfSU5URUdFUih0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC52YWx1ZSAgICA9IHZhbHVlLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIGludGVnZXIgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9JTlRfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIC8vIENhbid0IHVzZSB2YWx1ZUFzTnVtYmVyIGR1ZSB0byBpT1MgaW5wdXQgdHlwZSB3b3JrYXJvdW5kc1xyXG4gICAgICAgIGxldCBpbnQgICAgPSBwYXJzZUludCh0aGlzLmlucHV0RGlnaXQudmFsdWUpO1xyXG4gICAgICAgIGxldCBpbnRTdHIgPSAodGhpcy53b3JkcylcclxuICAgICAgICAgICAgPyBMLkRJR0lUU1tpbnRdIHx8IGludC50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogaW50LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBpbnZhbGlkIHZhbHVlc1xyXG4gICAgICAgIGlmICggaXNOYU4oaW50KSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSAnJztcclxuXHJcbiAgICAgICAgaWYgKGludCA9PT0gMSAmJiB0aGlzLnNpbmd1bGFyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHt0aGlzLnNpbmd1bGFyfWA7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5zaW5ndWxhcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHRoaXMucGx1cmFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHt0aGlzLnBsdXJhbH1gO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMucGx1cmFsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldEludGVnZXIodGhpcy5jdXJyZW50Q3R4LCBpbnQpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1pbnRlZ2VyXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IGludFN0cik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBuYW1lZCB0cmFpbiBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIE5hbWVkUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignbmFtZWQnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfTkFNRUQoKTtcclxuXHJcbiAgICAgICAgUkFHLmRhdGFiYXNlLm5hbWVkLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIC8vIFByZS1zZWxlY3QgdGhlIGN1cnJlbnRseSB1c2VkIG5hbWVcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KFJBRy5zdGF0ZS5uYW1lZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBuYW1lZCBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5uYW1lZCA9IGVudHJ5LmlubmVyVGV4dDtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCgnbmFtZWQnLCBSQUcuc3RhdGUubmFtZWQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBwaHJhc2VzZXQgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBQaHJhc2VzZXRQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIHJlZmVyZW5jZSB0YWcgZm9yIHRoZSBjdXJyZW50IHBocmFzZXNldCBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50UmVmPyA6IHN0cmluZztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdwaHJhc2VzZXQnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHBocmFzZXNldCdzIGxpc3Qgb2YgcGhyYXNlcyAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICBsZXQgcmVmID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBpZHggPSBwYXJzZUludCggRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2lkeCcpICk7XHJcblxyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZik7XHJcblxyXG4gICAgICAgIGlmICghcGhyYXNlc2V0KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1BTRVRfVU5LTk9XTihyZWYpICk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFJlZiAgICAgICAgICA9IHJlZjtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9QSFJBU0VTRVQocmVmKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLmNsZWFyKCk7XHJcblxyXG4gICAgICAgIC8vIEZvciBlYWNoIHBocmFzZSwgd2UgbmVlZCB0byBydW4gaXQgdGhyb3VnaCB0aGUgcGhyYXNlciB1c2luZyB0aGUgY3VycmVudCBzdGF0ZVxyXG4gICAgICAgIC8vIHRvIGdlbmVyYXRlIFwicHJldmlld3NcIiBvZiBob3cgdGhlIHBocmFzZSB3aWxsIGxvb2suXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaHJhc2VzZXQuY2hpbGRyZW4ubGVuZ3RoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcGhyYXNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuXHJcbiAgICAgICAgICAgIERPTS5jbG9uZUludG8ocGhyYXNlc2V0LmNoaWxkcmVuW2ldIGFzIEhUTUxFbGVtZW50LCBwaHJhc2UpO1xyXG4gICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKHBocmFzZSk7XHJcblxyXG4gICAgICAgICAgICBwaHJhc2UuaW5uZXJUZXh0ICAgPSBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHBocmFzZSk7XHJcbiAgICAgICAgICAgIHBocmFzZS5kYXRhc2V0LmlkeCA9IGkudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5hZGRSYXcocGhyYXNlLCBpID09PSBpZHgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHBocmFzZXNldCBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UmVmKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1BTRVRfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIGxldCBpZHggPSBwYXJzZUludChlbnRyeS5kYXRhc2V0WydpZHgnXSEpO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0UGhyYXNlc2V0SWR4KHRoaXMuY3VycmVudFJlZiwgaWR4KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5yZWZyZXNoUGhyYXNlc2V0KHRoaXMuY3VycmVudFJlZik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBsYXRmb3JtIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgUGxhdGZvcm1QaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG51bWVyaWNhbCBpbnB1dCBzcGlubmVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0RGlnaXQgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBsZXR0ZXIgZHJvcC1kb3duIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMZXR0ZXIgOiBIVE1MU2VsZWN0RWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdwbGF0Zm9ybScpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQgICAgICAgICAgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlciAgICAgICAgID0gRE9NLnJlcXVpcmUoJ3NlbGVjdCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9QTEFURk9STSgpO1xyXG5cclxuICAgICAgICAvLyBpT1MgbmVlZHMgZGlmZmVyZW50IHR5cGUgYW5kIHBhdHRlcm4gdG8gc2hvdyBhIG51bWVyaWNhbCBrZXlib2FyZFxyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQudHlwZSAgICA9ICd0ZWwnO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQucGF0dGVybiA9ICdbMC05XSsnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBwbGF0Zm9ybSBkYXRhICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIGxldCB2YWx1ZSA9IFJBRy5zdGF0ZS5wbGF0Zm9ybTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnZhbHVlICA9IHZhbHVlWzBdO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgPSB2YWx1ZVsxXTtcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgcGxhdGZvcm0gZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBJZ25vcmUgaW52YWxpZCB2YWx1ZXNcclxuICAgICAgICBpZiAoIGlzTmFOKCBwYXJzZUludCh0aGlzLmlucHV0RGlnaXQudmFsdWUpICkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5wbGF0Zm9ybSA9IFt0aGlzLmlucHV0RGlnaXQudmFsdWUsIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWVdO1xyXG5cclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCggJ3BsYXRmb3JtJywgUkFHLnN0YXRlLnBsYXRmb3JtLmpvaW4oJycpICk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzZXJ2aWNlIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU2VydmljZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgc2VydmljZSBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignc2VydmljZScpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuXHJcbiAgICAgICAgUkFHLmRhdGFiYXNlLnNlcnZpY2VzLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIHNlcnZpY2UgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TRVJWSUNFKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIC8vIFByZS1zZWxlY3QgdGhlIGN1cnJlbnRseSB1c2VkIHNlcnZpY2VcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KCBSQUcuc3RhdGUuZ2V0U2VydmljZSh0aGlzLmN1cnJlbnRDdHgpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBzZXJ2aWNlIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfU0VSVklDRV9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFNlcnZpY2UodGhpcy5jdXJyZW50Q3R4LCBlbnRyeS5pbm5lclRleHQpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1zZXJ2aWNlXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IGVudHJ5LmlubmVyVGV4dCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHN0YXRpb24gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTdGF0aW9uUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBzaGFyZWQgc3RhdGlvbiBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgY2hvb3NlciA6IFN0YXRpb25DaG9vc2VyO1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgc3RhdGlvbiBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuICAgIC8qKiBIb2xkcyB0aGUgb25PcGVuIGRlbGVnYXRlIGZvciBTdGF0aW9uUGlja2VyIG9yIGZvciBTdGF0aW9uTGlzdFBpY2tlciAqL1xyXG4gICAgcHJvdGVjdGVkIG9uT3BlbiAgICAgOiAodGFyZ2V0OiBIVE1MRWxlbWVudCkgPT4gdm9pZDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IodGFnOiBzdHJpbmcgPSAnc3RhdGlvbicpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIodGFnKTtcclxuXHJcbiAgICAgICAgaWYgKCFTdGF0aW9uUGlja2VyLmNob29zZXIpXHJcbiAgICAgICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3NlciA9IG5ldyBTdGF0aW9uQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG5cclxuICAgICAgICB0aGlzLm9uT3BlbiA9IHRoaXMub25TdGF0aW9uUGlja2VyT3Blbi5iaW5kKHRoaXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaXJlcyB0aGUgb25PcGVuIGRlbGVnYXRlIHJlZ2lzdGVyZWQgZm9yIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcbiAgICAgICAgdGhpcy5vbk9wZW4odGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQXR0YWNoZXMgdGhlIHN0YXRpb24gY2hvb3NlciBhbmQgZm9jdXNlcyBpdCBvbnRvIHRoZSBjdXJyZW50IGVsZW1lbnQncyBzdGF0aW9uICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdGF0aW9uUGlja2VyT3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgY2hvb3NlciAgICAgPSBTdGF0aW9uUGlja2VyLmNob29zZXI7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY2hvb3Nlci5hdHRhY2godGhpcywgdGhpcy5vblNlbGVjdFN0YXRpb24pO1xyXG4gICAgICAgIGNob29zZXIucHJlc2VsZWN0Q29kZSggUkFHLnN0YXRlLmdldFN0YXRpb24odGhpcy5jdXJyZW50Q3R4KSApO1xyXG4gICAgICAgIGNob29zZXIuc2VsZWN0T25DbGljayA9IHRydWU7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NUQVRJT04odGhpcy5jdXJyZW50Q3R4KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgc3RhdGlvbiBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyBTdGF0aW9uUGlja2VyLmNob29zZXIub25DbGljayhldik7IH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyBTdGF0aW9uUGlja2VyLmNob29zZXIub25JbnB1dChldik7IH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyBTdGF0aW9uUGlja2VyLmNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHN0YXRpb24gZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3RTdGF0aW9uKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ID0gYFtkYXRhLXR5cGU9c3RhdGlvbl1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gO1xyXG4gICAgICAgIGxldCBjb2RlICA9IGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSE7XHJcbiAgICAgICAgbGV0IG5hbWUgID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTdGF0aW9uKHRoaXMuY3VycmVudEN0eCwgY29kZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KHF1ZXJ5KVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBuYW1lKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInN0YXRpb25QaWNrZXIudHNcIi8+XHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi8uLi92ZW5kb3IvZHJhZ2dhYmxlLmQudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHN0YXRpb24gbGlzdCBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFN0YXRpb25MaXN0UGlja2VyIGV4dGVuZHMgU3RhdGlvblBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY29udGFpbmVyIGZvciB0aGUgbGlzdCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUxpc3QgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbW9iaWxlLW9ubHkgYWRkIHN0YXRpb24gYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkFkZCAgICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbW9iaWxlLW9ubHkgY2xvc2UgcGlja2VyIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5DbG9zZSAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGRyb3Agem9uZSBmb3IgZGVsZXRpbmcgc3RhdGlvbiBlbGVtZW50cyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21EZWwgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGFjdHVhbCBzb3J0YWJsZSBsaXN0IG9mIHN0YXRpb25zICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGlzdCAgICA6IEhUTUxETGlzdEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHBsYWNlaG9sZGVyIHNob3duIGlmIHRoZSBsaXN0IGlzIGVtcHR5ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUVtcHR5TGlzdCA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoXCJzdGF0aW9ubGlzdFwiKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21MaXN0ICAgICAgPSBET00ucmVxdWlyZSgnLnN0YXRpb25MaXN0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuYnRuQWRkICAgICAgID0gRE9NLnJlcXVpcmUoJy5hZGRTdGF0aW9uJywgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5idG5DbG9zZSAgICAgPSBET00ucmVxdWlyZSgnLmNsb3NlUGlja2VyJywgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmRvbURlbCAgICAgICA9IERPTS5yZXF1aXJlKCcuZGVsU3RhdGlvbicsICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0ICAgID0gRE9NLnJlcXVpcmUoJ2RsJywgICAgICAgICAgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QgPSBET00ucmVxdWlyZSgncCcsICAgICAgICAgICAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLm9uT3BlbiAgICAgICA9IHRoaXMub25TdGF0aW9uTGlzdFBpY2tlck9wZW4uYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgbmV3IERyYWdnYWJsZS5Tb3J0YWJsZShbdGhpcy5pbnB1dExpc3QsIHRoaXMuZG9tRGVsXSwgeyBkcmFnZ2FibGU6ICdkZCcgfSlcclxuICAgICAgICAgICAgLy8gSGF2ZSB0byB1c2UgdGltZW91dCwgdG8gbGV0IERyYWdnYWJsZSBmaW5pc2ggc29ydGluZyB0aGUgbGlzdFxyXG4gICAgICAgICAgICAub24oICdkcmFnOnN0b3AnLCBldiA9PiBzZXRUaW1lb3V0KCgpID0+IHRoaXMub25EcmFnU3RvcChldiksIDEpIClcclxuICAgICAgICAgICAgLm9uKCAnbWlycm9yOmNyZWF0ZScsIHRoaXMub25EcmFnTWlycm9yQ3JlYXRlLmJpbmQodGhpcykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBvcHVsYXRlcyB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIsIHdpdGggdGhlIHNlbGVjdGVkIGxpc3QuIEJlY2F1c2UgdGhpcyBwaWNrZXJcclxuICAgICAqIGV4dGVuZHMgZnJvbSBTdGF0aW9uTGlzdCwgdGhpcyBoYW5kbGVyIG92ZXJyaWRlcyB0aGUgJ29uT3BlbicgZGVsZWdhdGUgcHJvcGVydHlcclxuICAgICAqIG9mIFN0YXRpb25MaXN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgU3RhdGlvbiBsaXN0IGVkaXRvciBlbGVtZW50IHRvIG9wZW4gZm9yXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvblN0YXRpb25MaXN0UGlja2VyT3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTaW5jZSB3ZSBzaGFyZSB0aGUgc3RhdGlvbiBwaWNrZXIgd2l0aCBTdGF0aW9uTGlzdCwgZ3JhYiBpdFxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5hdHRhY2godGhpcywgdGhpcy5vbkFkZFN0YXRpb24pO1xyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5zZWxlY3RPbkNsaWNrID0gZmFsc2U7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IGVudHJpZXMgICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KHRoaXMuY3VycmVudEN0eCkuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU1RBVElPTkxJU1QodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgLy8gUmVtb3ZlIGFsbCBvbGQgbGlzdCBlbGVtZW50c1xyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0LmlubmVySFRNTCA9ICcnO1xyXG5cclxuICAgICAgICAvLyBGaW5hbGx5LCBwb3B1bGF0ZSBsaXN0IGZyb20gdGhlIGNsaWNrZWQgc3RhdGlvbiBsaXN0IGVsZW1lbnRcclxuICAgICAgICBlbnRyaWVzLmZvckVhY2goIHYgPT4gdGhpcy5hZGQodikgKTtcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWQgeyBzdXBlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbGljayBldmVudHMsIGZvciBjaG9vc2luZyBpdGVtcyAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9uQ2xpY2soZXYpO1xyXG5cclxuICAgICAgICBpZiAoZXYudGFyZ2V0ID09PSB0aGlzLmJ0bkNsb3NlKVxyXG4gICAgICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgLy8gRm9yIG1vYmlsZSB1c2Vycywgc3dpdGNoIHRvIHN0YXRpb24gY2hvb3NlciBzY3JlZW4gaWYgXCJBZGQuLi5cIiB3YXMgY2xpY2tlZFxyXG4gICAgICAgIGlmIChldi50YXJnZXQgPT09IHRoaXMuYnRuQWRkKVxyXG4gICAgICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QuYWRkKCdhZGRpbmdTdGF0aW9uJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMga2V5Ym9hcmQgbmF2aWdhdGlvbiBmb3IgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyICovXHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub25JbnB1dChldik7XHJcblxyXG4gICAgICAgIGxldCBrZXkgICAgID0gZXYua2V5O1xyXG4gICAgICAgIGxldCBmb2N1c2VkID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgLy8gT25seSBoYW5kbGUgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyIGNvbnRyb2xcclxuICAgICAgICBpZiAoICFmb2N1c2VkIHx8ICF0aGlzLmlucHV0TGlzdC5jb250YWlucyhmb2N1c2VkKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGtleWJvYXJkIG5hdmlnYXRpb25cclxuICAgICAgICBpZiAoa2V5ID09PSAnQXJyb3dMZWZ0JyB8fCBrZXkgPT09ICdBcnJvd1JpZ2h0JylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBkaXIgPSAoa2V5ID09PSAnQXJyb3dMZWZ0JykgPyAtMSA6IDE7XHJcbiAgICAgICAgICAgIGxldCBuYXYgPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gZm9jdXNlZCBlbGVtZW50XHJcbiAgICAgICAgICAgIGlmIChmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRMaXN0KVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxldmFudCB0byBiZWdpbm5pbmcgb3IgZW5kIG9mIGNvbnRhaW5lclxyXG4gICAgICAgICAgICBlbHNlIGlmIChkaXIgPT09IC0xKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmxhc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBpZiAobmF2KSBuYXYuZm9jdXMoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBlbnRyeSBkZWxldGlvblxyXG4gICAgICAgIGlmIChrZXkgPT09ICdEZWxldGUnIHx8IGtleSA9PT0gJ0JhY2tzcGFjZScpXHJcbiAgICAgICAgaWYgKGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dExpc3QpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBGb2N1cyBvbiBuZXh0IGVsZW1lbnQgb3IgcGFyZW50IG9uIGRlbGV0ZVxyXG4gICAgICAgICAgICBsZXQgbmV4dCA9IGZvY3VzZWQucHJldmlvdXNFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IGZvY3VzZWQubmV4dEVsZW1lbnRTaWJsaW5nICAgICBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IHRoaXMuaW5wdXRMaXN0O1xyXG5cclxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZm9jdXNlZCk7XHJcbiAgICAgICAgICAgIG5leHQuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXIgZm9yIHdoZW4gYSBzdGF0aW9uIGlzIGNob3NlbiAqL1xyXG4gICAgcHJpdmF0ZSBvbkFkZFN0YXRpb24oZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgbmV3RW50cnkgPSB0aGlzLmFkZChlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuXHJcbiAgICAgICAgLy8gU3dpdGNoIGJhY2sgdG8gYnVpbGRlciBzY3JlZW4sIGlmIG9uIG1vYmlsZVxyXG4gICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5yZW1vdmUoJ2FkZGluZ1N0YXRpb24nKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG5cclxuICAgICAgICAvLyBGb2N1cyBvbmx5IGlmIG9uIG1vYmlsZSwgc2luY2UgdGhlIHN0YXRpb24gbGlzdCBpcyBvbiBhIGRlZGljYXRlZCBzY3JlZW5cclxuICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKVxyXG4gICAgICAgICAgICBuZXdFbnRyeS5kb20uZm9jdXMoKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIG5ld0VudHJ5LmRvbS5zY3JvbGxJbnRvVmlldygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaXhlcyBtaXJyb3JzIG5vdCBoYXZpbmcgY29ycmVjdCB3aWR0aCBvZiB0aGUgc291cmNlIGVsZW1lbnQsIG9uIGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvbkRyYWdNaXJyb3JDcmVhdGUoZXY6IERyYWdnYWJsZS5EcmFnRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghZXYuZGF0YS5zb3VyY2UgfHwgIWV2LmRhdGEub3JpZ2luYWxTb3VyY2UpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfU0xfRFJBR19NSVNTSU5HKCkgKTtcclxuXHJcbiAgICAgICAgZXYuZGF0YS5zb3VyY2Uuc3R5bGUud2lkdGggPSBldi5kYXRhLm9yaWdpbmFsU291cmNlLmNsaWVudFdpZHRoICsgJ3B4JztcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBkcmFnZ2FibGUgc3RhdGlvbiBuYW1lIGJlaW5nIGRyb3BwZWQgKi9cclxuICAgIHByaXZhdGUgb25EcmFnU3RvcChldjogRHJhZ2dhYmxlLkRyYWdFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFldi5kYXRhLm9yaWdpbmFsU291cmNlKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmIChldi5kYXRhLm9yaWdpbmFsU291cmNlLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuZG9tRGVsKVxyXG4gICAgICAgICAgICB0aGlzLnJlbW92ZShldi5kYXRhLm9yaWdpbmFsU291cmNlKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGFuZCBhZGRzIGEgbmV3IGVudHJ5IGZvciB0aGUgYnVpbGRlciBsaXN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gY3JlYXRlIGFuIGl0ZW0gZm9yXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYWRkKGNvZGU6IHN0cmluZykgOiBTdGF0aW9uTGlzdEl0ZW1cclxuICAgIHtcclxuICAgICAgICBsZXQgbmV3RW50cnkgPSBuZXcgU3RhdGlvbkxpc3RJdGVtKGNvZGUpO1xyXG5cclxuICAgICAgICAvLyBBZGQgdGhlIG5ldyBlbnRyeSB0byB0aGUgc29ydGFibGUgbGlzdFxyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0LmFwcGVuZENoaWxkKG5ld0VudHJ5LmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QuaGlkZGVuID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gRGlzYWJsZSB0aGUgYWRkZWQgc3RhdGlvbiBpbiB0aGUgY2hvb3NlclxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5kaXNhYmxlKGNvZGUpO1xyXG5cclxuICAgICAgICAvLyBEZWxldGUgaXRlbSBvbiBkb3VibGUgY2xpY2tcclxuICAgICAgICBuZXdFbnRyeS5kb20ub25kYmxjbGljayA9IF8gPT4gdGhpcy5yZW1vdmUobmV3RW50cnkuZG9tKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIG5ld0VudHJ5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVtb3ZlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBlbnRyeSBlbGVtZW50IGZyb20gdGhlIGJ1aWxkZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVudHJ5IEVsZW1lbnQgb2YgdGhlIHN0YXRpb24gZW50cnkgdG8gcmVtb3ZlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcmVtb3ZlKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhdGhpcy5kb21MaXN0LmNvbnRhaW5zKGVudHJ5KSApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdBdHRlbXB0ZWQgdG8gcmVtb3ZlIGVudHJ5IG5vdCBvbiBzdGF0aW9uIGxpc3QgYnVpbGRlcicpO1xyXG5cclxuICAgICAgICAvLyBFbmFibGVkIHRoZSByZW1vdmVkIHN0YXRpb24gaW4gdGhlIGNob29zZXJcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuZW5hYmxlKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG5cclxuICAgICAgICBlbnRyeS5yZW1vdmUoKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5pbnB1dExpc3QuY2hpbGRyZW4ubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdC5oaWRkZW4gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgc3RhdGlvbiBsaXN0IGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNoaWxkcmVuID0gdGhpcy5pbnB1dExpc3QuY2hpbGRyZW47XHJcblxyXG4gICAgICAgIC8vIERvbid0IHVwZGF0ZSBpZiBsaXN0IGlzIGVtcHR5XHJcbiAgICAgICAgaWYgKGNoaWxkcmVuLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgbGlzdCA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVudHJ5ID0gY2hpbGRyZW5baV0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICBsaXN0LnB1c2goZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgdGV4dExpc3QgPSBTdHJpbmdzLmZyb21TdGF0aW9uTGlzdChsaXN0LnNsaWNlKCksIHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ICAgID0gYFtkYXRhLXR5cGU9c3RhdGlvbmxpc3RdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYDtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFN0YXRpb25MaXN0KHRoaXMuY3VycmVudEN0eCwgbGlzdCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KHF1ZXJ5KVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0ZXh0TGlzdCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHRpbWUgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBUaW1lUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyB0aW1lIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRUaW1lOiBIVE1MSW5wdXRFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgdGltZSBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigndGltZScpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0VGltZSA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyB0aW1lICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfVElNRSh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0VGltZS52YWx1ZSA9IFJBRy5zdGF0ZS5nZXRUaW1lKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgdGltZSBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1RJTUVfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRUaW1lKHRoaXMuY3VycmVudEN0eCwgdGhpcy5pbnB1dFRpbWUudmFsdWUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT10aW1lXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuaW5wdXRUaW1lLnZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBMYW5ndWFnZSBlbnRyaWVzIGFyZSB0ZW1wbGF0ZSBkZWxlZ2F0ZXMgKi9cclxudHlwZSBMYW5ndWFnZUVudHJ5ID0gKC4uLnBhcnRzOiBzdHJpbmdbXSkgPT4gc3RyaW5nIDtcclxuXHJcbmFic3RyYWN0IGNsYXNzIEJhc2VMYW5ndWFnZVxyXG57XHJcbiAgICBbaW5kZXg6IHN0cmluZ10gOiBMYW5ndWFnZUVudHJ5IHwgc3RyaW5nIHwgc3RyaW5nW107XHJcblxyXG4gICAgLy8gUkFHXHJcblxyXG4gICAgLyoqIFdlbGNvbWUgbWVzc2FnZSwgc2hvd24gb24gbWFycXVlZSBvbiBmaXJzdCBsb2FkICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBXRUxDT01FICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXF1aXJlZCBET00gZWxlbWVudCBpcyBtaXNzaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBET01fTUlTU0lORyAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXF1aXJlZCBlbGVtZW50IGF0dHJpYnV0ZSBpcyBtaXNzaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBBVFRSX01JU1NJTkcgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXF1aXJlZCBkYXRhc2V0IGVudHJ5IGlzIG1pc3NpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERBVEFfTUlTU0lORyAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEJhZCBkaXJlY3Rpb24gYXJndW1lbnQgZ2l2ZW4gdG8gZGlyZWN0aW9uYWwgZnVuY3Rpb24gKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEJBRF9ESVJFQ1RJT04gOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEJhZCBib29sZWFuIHN0cmluZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQkFEX0JPT0xFQU4gICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gU3RhdGVcclxuXHJcbiAgICAvKiogU3RhdGUgc3VjY2Vzc2Z1bGx5IGxvYWRlZCBmcm9tIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX0ZST01fU1RPUkFHRSAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU3RhdGUgc3VjY2Vzc2Z1bGx5IHNhdmVkIHRvIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1RPX1NUT1JBR0UgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogSW5zdHJ1Y3Rpb25zIGZvciBjb3B5L3Bhc3Rpbmcgc2F2ZWQgc3RhdGUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX0NPUFlfUEFTVEUgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogSGVhZGVyIGZvciBkdW1wZWQgcmF3IHN0YXRlIEpTT04gKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1JBV19KU09OICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQ291bGQgbm90IHNhdmUgc3RhdGUgdG8gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfU0FWRV9GQUlMICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBObyBzdGF0ZSB3YXMgYXZhaWxhYmxlIHRvIGxvYWQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1NBVkVfTUlTU0lORyAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogTm9uLWV4aXN0ZW50IHBocmFzZXNldCByZWZlcmVuY2Ugd2hlbiBnZXR0aW5nIGZyb20gc3RhdGUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX05PTkVYSVNUQU5UX1BIUkFTRVNFVCA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gQ29uZmlnXHJcblxyXG4gICAgLyoqIENvbmZpZyBmYWlsZWQgdG8gbG9hZCBmcm9tIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IENPTkZJR19MT0FEX0ZBSUwgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBDb25maWcgZmFpbGVkIHRvIHNhdmUgdG8gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQ09ORklHX1NBVkVfRkFJTCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIENvbmZpZyBmYWlsZWQgdG8gY2xlYXIgZnJvbSBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBDT05GSUdfUkVTRVRfRkFJTCA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gRGF0YWJhc2VcclxuXHJcbiAgICAvKiogR2l2ZW4gZWxlbWVudCBpc24ndCBhIHBocmFzZXNldCBpRnJhbWUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERCX0VMRU1FTlRfTk9UX1BIUkFTRVNFVF9JRlJBTUUgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFVua25vd24gc3RhdGlvbiBjb2RlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9VTktOT1dOX1NUQVRJT04gICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTdGF0aW9uIGNvZGUgd2l0aCBibGFuayBuYW1lICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9FTVBUWV9TVEFUSU9OICAgICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBQaWNraW5nIHRvbyBtYW55IHN0YXRpb24gY29kZXMgaW4gb25lIGdvICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9UT09fTUFOWV9TVEFUSU9OUyAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBUb29sYmFyXHJcblxyXG4gICAgLy8gVG9vbHRpcHMvdGl0bGUgdGV4dCBmb3IgdG9vbGJhciBidXR0b25zXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1BMQVkgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU1RPUCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TSFVGRkxFICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NBVkUgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfTE9BRCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TRVRUSU5HUyA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gRWRpdG9yXHJcblxyXG4gICAgLy8gVG9vbHRpcHMvdGl0bGUgdGV4dCBmb3IgZWRpdG9yIGVsZW1lbnRzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9DT0FDSCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9FWENVU0UgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9JTlRFR0VSICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9OQU1FRCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9PUFRfT1BFTiAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9PUFRfQ0xPU0UgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9QSFJBU0VTRVQgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9QTEFURk9STSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9TRVJWSUNFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9TVEFUSU9OICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9TVEFUSU9OTElTVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUSVRMRV9USU1FICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLyoqIEluaXRpYWwgbWVzc2FnZSB3aGVuIHNldHRpbmcgdXAgZWRpdG9yICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBFRElUT1JfSU5JVCAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcGxhY2VtZW50IHRleHQgZm9yIHVua25vd24gZWRpdG9yIGVsZW1lbnRzICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBFRElUT1JfVU5LTk9XTl9FTEVNRU5UICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcGxhY2VtZW50IHRleHQgZm9yIGVkaXRvciBwaHJhc2VzIHdpdGggdW5rbm93biByZWZlcmVuY2UgaWRzICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBFRElUT1JfVU5LTk9XTl9QSFJBU0UgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcGxhY2VtZW50IHRleHQgZm9yIGVkaXRvciBwaHJhc2VzZXRzIHdpdGggdW5rbm93biByZWZlcmVuY2UgaWRzICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBFRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFBocmFzZXJcclxuXHJcbiAgICAvKiogVG9vIG1hbnkgbGV2ZWxzIG9mIHJlY3Vyc2lvbiBpbiB0aGUgcGhyYXNlciAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUEhSQVNFUl9UT09fUkVDVVJTSVZFIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBQaWNrZXJzXHJcblxyXG4gICAgLy8gSGVhZGVycyBmb3IgcGlja2VyIGRpYWxvZ3NcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9DT0FDSCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfRVhDVVNFICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX0lOVEVHRVIgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9OQU1FRCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfUEhSQVNFU0VUICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1BMQVRGT1JNICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9TRVJWSUNFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfU1RBVElPTiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1NUQVRJT05MSVNUIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9USU1FICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gVG9vbHRpcHMvdGl0bGUgYW5kIHBsYWNlaG9sZGVyIHRleHQgZm9yIHBpY2tlciBjb250cm9sc1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9HRU5FUklDX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0dFTkVSSUNfUEggICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfQ09BQ0hfVCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9FWENVU0VfVCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0VYQ1VTRV9QSCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfRVhDVVNFX0lURU1fVCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9JTlRfVCAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX05BTUVEX1QgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfTkFNRURfUEggICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9OQU1FRF9JVEVNX1QgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfVCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9QSCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX0lURU1fVCAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BMQVRfTlVNQkVSX1QgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUExBVF9MRVRURVJfVCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZfUEggICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVl9JVEVNX1QgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TVEFUSU9OX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NUQVRJT05fUEggICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU1RBVElPTl9JVEVNX1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9BREQgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0FERF9UICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQ0xPU0UgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9DTE9TRV9UICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0VNUFRZICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfRFJBR19UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9ERUxFVEUgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RFTEVURV9UICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfSVRFTV9UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9USU1FX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLyoqIENvYWNoIHBpY2tlcidzIG9uQ2hhbmdlIGZpcmVkIHdpdGhvdXQgY29udGV4dCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9DT0FDSF9NSVNTSU5HX1NUQVRFICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEludGVnZXIgcGlja2VyJ3Mgb25DaGFuZ2UgZmlyZWQgd2l0aG91dCBjb250ZXh0ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0lOVF9NSVNTSU5HX1NUQVRFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUGhyYXNlc2V0IHBpY2tlcidzIG9uU2VsZWN0IGZpcmVkIHdpdGhvdXQgcmVmZXJlbmNlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfTUlTU0lOR19TVEFURSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU2VydmljZSBwaWNrZXIncyBvblNlbGVjdCBmaXJlZCB3aXRob3V0IHJlZmVyZW5jZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWSUNFX01JU1NJTkdfU1RBVEUgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFNlcnZpY2UgcGlja2VyJ3Mgb25DaGFuZ2UgZmlyZWQgd2l0aG91dCByZWZlcmVuY2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfVElNRV9NSVNTSU5HX1NUQVRFICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBQaHJhc2VzZXQgcGlja2VyIG9wZW5lZCBmb3IgdW5rbm93biBwaHJhc2VzZXQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9VTktOT1dOICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBEcmFnIG1pcnJvciBjcmVhdGUgZXZlbnQgaW4gc3RhdGlvbiBsaXN0IG1pc3Npbmcgc3RhdGUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfRFJBR19NSVNTSU5HICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBTZXR0aW5nc1xyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIGFuZCBsYWJlbCB0ZXh0IGZvciBzZXR0aW5ncyBlbGVtZW50c1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVQgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9DT05GSVJNICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfQ09ORklSTV9UIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX0RPTkUgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TQVZFICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU0FWRV9UICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSCAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfQ0hPSUNFICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX0VNUFRZICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9WT0wgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfUElUQ0ggICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1JBVEUgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9URVNUICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfVEVTVF9UICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfTEVHQUwgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBVSSBjb250cm9sc1xyXG5cclxuICAgIC8qKiBIZWFkZXIgZm9yIHRoZSBcInRvbyBzbWFsbFwiIHdhcm5pbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFdBUk5fU0hPUlRfSEVBREVSIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBCb2R5IHRleHQgZm9yIHRoZSBcInRvbyBzbWFsbFwiIHdhcm5pbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFdBUk5fU0hPUlQgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBNaXNjLiBjb25zdGFudHNcclxuXHJcbiAgICAvKiogQXJyYXkgb2YgdGhlIGVudGlyZSBhbHBoYWJldCBvZiB0aGUgbGFuZ3VhZ2UsIGZvciBjb2FjaCBsZXR0ZXJzICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBMRVRURVJTIDogc3RyaW5nO1xyXG4gICAgLyoqIEFycmF5IG9mIG51bWJlcnMgYXMgd29yZHMgKGUuZy4gemVybywgb25lLCB0d28pLCBtYXRjaGluZyB0aGVpciBpbmRleCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRElHSVRTICA6IHN0cmluZ1tdO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiQmFzZUxhbmd1YWdlLnRzXCIvPlxyXG5cclxuY2xhc3MgRW5nbGlzaExhbmd1YWdlIGV4dGVuZHMgQmFzZUxhbmd1YWdlXHJcbntcclxuICAgIFdFTENPTUUgICAgICAgPSAoKSA9PiAnV2VsY29tZSB0byBSYWlsIEFubm91bmNlbWVudCBHZW5lcmF0b3IuJztcclxuICAgIERPTV9NSVNTSU5HICAgPSAocTogc3RyaW5nKSA9PiBgUmVxdWlyZWQgRE9NIGVsZW1lbnQgaXMgbWlzc2luZzogJyR7cX0nYDtcclxuICAgIEFUVFJfTUlTU0lORyAgPSAoYTogc3RyaW5nKSA9PiBgUmVxdWlyZWQgYXR0cmlidXRlIGlzIG1pc3Npbmc6ICcke2F9J2A7XHJcbiAgICBEQVRBX01JU1NJTkcgID0gKGs6IHN0cmluZykgPT4gYFJlcXVpcmVkIGRhdGFzZXQga2V5IGlzIG1pc3Npbmcgb3IgZW1wdHk6ICcke2t9J2A7XHJcbiAgICBCQURfRElSRUNUSU9OID0gKHY6IHN0cmluZykgPT4gYERpcmVjdGlvbiBuZWVkcyB0byBiZSAtMSBvciAxLCBub3QgJyR7dn0nYDtcclxuICAgIEJBRF9CT09MRUFOICAgPSAodjogc3RyaW5nKSA9PiBgR2l2ZW4gc3RyaW5nIGRvZXMgbm90IHJlcHJlc2VudCBhIGJvb2xlYW46ICcke3Z9J2A7XHJcblxyXG4gICAgU1RBVEVfRlJPTV9TVE9SQUdFICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnU3RhdGUgaGFzIGJlZW4gbG9hZGVkIGZyb20gc3RvcmFnZS4nO1xyXG4gICAgU1RBVEVfVE9fU1RPUkFHRSAgICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnU3RhdGUgaGFzIGJlZW4gc2F2ZWQgdG8gc3RvcmFnZSwgYW5kIGR1bXBlZCB0byBjb25zb2xlLic7XHJcbiAgICBTVEFURV9DT1BZX1BBU1RFICAgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICclY0NvcHkgYW5kIHBhc3RlIHRoaXMgaW4gY29uc29sZSB0byBsb2FkIGxhdGVyOic7XHJcbiAgICBTVEFURV9SQVdfSlNPTiAgICAgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICclY1JhdyBKU09OIHN0YXRlOic7XHJcbiAgICBTVEFURV9TQVZFX0ZBSUwgICAgICAgICAgICAgPSAobXNnOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFNvcnJ5LCBzdGF0ZSBjb3VsZCBub3QgYmUgc2F2ZWQgdG8gc3RvcmFnZTogJHttc2d9LmA7XHJcbiAgICBTVEFURV9TQVZFX01JU1NJTkcgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTb3JyeSwgbm8gc3RhdGUgd2FzIGZvdW5kIGluIHN0b3JhZ2UuJztcclxuICAgIFNUQVRFX05PTkVYSVNUQU5UX1BIUkFTRVNFVCA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYEF0dGVtcHRlZCB0byBnZXQgY2hvc2VuIGluZGV4IGZvciBwaHJhc2VzZXQgKCR7cn0pIHRoYXQgZG9lc24ndCBleGlzdGA7XHJcblxyXG4gICAgQ09ORklHX0xPQURfRkFJTCAgPSAobXNnOiBzdHJpbmcpID0+IGBDb3VsZCBub3QgbG9hZCBzZXR0aW5nczogJHttc2d9YDtcclxuICAgIENPTkZJR19TQVZFX0ZBSUwgID0gKG1zZzogc3RyaW5nKSA9PiBgQ291bGQgbm90IHNhdmUgc2V0dGluZ3M6ICR7bXNnfWA7XHJcbiAgICBDT05GSUdfUkVTRVRfRkFJTCA9IChtc2c6IHN0cmluZykgPT4gYENvdWxkIG5vdCBjbGVhciBzZXR0aW5nczogJHttc2d9YDtcclxuXHJcbiAgICBEQl9FTEVNRU5UX05PVF9QSFJBU0VTRVRfSUZSQU1FID0gKGU6IHN0cmluZykgPT5cclxuICAgICAgICBgQ29uZmlndXJlZCBwaHJhc2VzZXQgZWxlbWVudCBxdWVyeSAoJHtlfSkgZG9lcyBub3QgcG9pbnQgdG8gYW4gaUZyYW1lIGVtYmVkYDtcclxuICAgIERCX1VOS05PV05fU1RBVElPTiAgID0gKGM6IHN0cmluZykgPT4gYFVOS05PV04gU1RBVElPTjogJHtjfWA7XHJcbiAgICBEQl9FTVBUWV9TVEFUSU9OICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFN0YXRpb24gZGF0YWJhc2UgYXBwZWFycyB0byBjb250YWluIGFuIGVtcHR5IG5hbWUgZm9yIGNvZGUgJyR7Y30nYDtcclxuICAgIERCX1RPT19NQU5ZX1NUQVRJT05TID0gKCkgPT4gJ1BpY2tpbmcgdG9vIG1hbnkgc3RhdGlvbnMgdGhhbiB0aGVyZSBhcmUgYXZhaWxhYmxlJztcclxuXHJcbiAgICBUT09MQkFSX1BMQVkgICAgID0gKCkgPT4gJ1BsYXkgcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU1RPUCAgICAgPSAoKSA9PiAnU3RvcCBwbGF5aW5nIHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NIVUZGTEUgID0gKCkgPT4gJ0dlbmVyYXRlIHJhbmRvbSBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TQVZFICAgICA9ICgpID0+ICdTYXZlIHN0YXRlIHRvIHN0b3JhZ2UnO1xyXG4gICAgVE9PTEJBUl9MT0FEICAgICA9ICgpID0+ICdSZWNhbGwgc3RhdGUgZnJvbSBzdG9yYWdlJztcclxuICAgIFRPT0xCQVJfU0VUVElOR1MgPSAoKSA9PiAnT3BlbiBzZXR0aW5ncyc7XHJcblxyXG4gICAgVElUTEVfQ09BQ0ggICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBjb2FjaCAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9FWENVU0UgICAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgJ0NsaWNrIHRvIGNoYW5nZSB0aGlzIGV4Y3VzZSc7XHJcbiAgICBUSVRMRV9JTlRFR0VSICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIG51bWJlciAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9OQU1FRCAgICAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgXCJDbGljayB0byBjaGFuZ2UgdGhpcyB0cmFpbidzIG5hbWVcIjtcclxuICAgIFRJVExFX09QVF9PUEVOICAgID0gKHQ6IHN0cmluZywgcjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBvcGVuIHRoaXMgb3B0aW9uYWwgJHt0fSAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9PUFRfQ0xPU0UgICA9ICh0OiBzdHJpbmcsIHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2xvc2UgdGhpcyBvcHRpb25hbCAke3R9ICgnJHtyfScpYDtcclxuICAgIFRJVExFX1BIUkFTRVNFVCAgID0gKHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoZSBwaHJhc2UgdXNlZCBpbiB0aGlzIHNlY3Rpb24gKCcke3J9JylgO1xyXG4gICAgVElUTEVfUExBVEZPUk0gICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgIFwiQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdHJhaW4ncyBwbGF0Zm9ybVwiO1xyXG4gICAgVElUTEVfU0VSVklDRSAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBzZXJ2aWNlICgnJHtjfScpYDtcclxuICAgIFRJVExFX1NUQVRJT04gICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc3RhdGlvbiAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9TVEFUSU9OTElTVCA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHN0YXRpb24gbGlzdCAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9USU1FICAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHRpbWUgKCcke2N9JylgO1xyXG5cclxuICAgIEVESVRPUl9JTklUICAgICAgICAgICAgICA9ICgpID0+ICdQbGVhc2Ugd2FpdC4uLic7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9FTEVNRU5UICAgPSAobjogc3RyaW5nKSA9PiBgKFVOS05PV04gWE1MIEVMRU1FTlQ6ICR7bn0pYDtcclxuICAgIEVESVRPUl9VTktOT1dOX1BIUkFTRSAgICA9IChyOiBzdHJpbmcpID0+IGAoVU5LTk9XTiBQSFJBU0U6ICR7cn0pYDtcclxuICAgIEVESVRPUl9VTktOT1dOX1BIUkFTRVNFVCA9IChyOiBzdHJpbmcpID0+IGAoVU5LTk9XTiBQSFJBU0VTRVQ6ICR7cn0pYDtcclxuXHJcbiAgICBQSFJBU0VSX1RPT19SRUNVUlNJVkUgPSAoKSA9PlxyXG4gICAgICAgICdUb28gbWFueSBsZXZlbHMgb2YgcmVjdXJzaW9uIHdoaWxzdCBwcm9jZXNzaW5nIHBocmFzZSc7XHJcblxyXG4gICAgSEVBREVSX0NPQUNIICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIGNvYWNoIGxldHRlciBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9FWENVU0UgICAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgJ1BpY2sgYW4gZXhjdXNlJztcclxuICAgIEhFQURFUl9JTlRFR0VSICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBudW1iZXIgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfTkFNRUQgICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGEgbmFtZWQgdHJhaW4nO1xyXG4gICAgSEVBREVSX1BIUkFTRVNFVCAgID0gKHI6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHBocmFzZSBmb3IgdGhlICcke3J9JyBzZWN0aW9uYDtcclxuICAgIEhFQURFUl9QTEFURk9STSAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgJ1BpY2sgYSBwbGF0Zm9ybSc7XHJcbiAgICBIRUFERVJfU0VSVklDRSAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgc2VydmljZSBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9TVEFUSU9OICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBzdGF0aW9uIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1NUQVRJT05MSVNUID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQnVpbGQgYSBzdGF0aW9uIGxpc3QgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfVElNRSAgICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgdGltZSBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuXHJcbiAgICBQX0dFTkVSSUNfVCAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgY2hvaWNlcyc7XHJcbiAgICBQX0dFTkVSSUNfUEggICAgID0gKCkgPT4gJ0ZpbHRlciBjaG9pY2VzLi4uJztcclxuICAgIFBfQ09BQ0hfVCAgICAgICAgPSAoKSA9PiAnQ29hY2ggbGV0dGVyJztcclxuICAgIFBfRVhDVVNFX1QgICAgICAgPSAoKSA9PiAnTGlzdCBvZiBkZWxheSBvciBjYW5jZWxsYXRpb24gZXhjdXNlcyc7XHJcbiAgICBQX0VYQ1VTRV9QSCAgICAgID0gKCkgPT4gJ0ZpbHRlciBleGN1c2VzLi4uJztcclxuICAgIFBfRVhDVVNFX0lURU1fVCAgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgZXhjdXNlJztcclxuICAgIFBfSU5UX1QgICAgICAgICAgPSAoKSA9PiAnSW50ZWdlciB2YWx1ZSc7XHJcbiAgICBQX05BTUVEX1QgICAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgdHJhaW4gbmFtZXMnO1xyXG4gICAgUF9OQU1FRF9QSCAgICAgICA9ICgpID0+ICdGaWx0ZXIgdHJhaW4gbmFtZS4uLic7XHJcbiAgICBQX05BTUVEX0lURU1fVCAgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIG5hbWUnO1xyXG4gICAgUF9QU0VUX1QgICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHBocmFzZXMnO1xyXG4gICAgUF9QU0VUX1BIICAgICAgICA9ICgpID0+ICdGaWx0ZXIgcGhyYXNlcy4uLic7XHJcbiAgICBQX1BTRVRfSVRFTV9UICAgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIHBocmFzZSc7XHJcbiAgICBQX1BMQVRfTlVNQkVSX1QgID0gKCkgPT4gJ1BsYXRmb3JtIG51bWJlcic7XHJcbiAgICBQX1BMQVRfTEVUVEVSX1QgID0gKCkgPT4gJ09wdGlvbmFsIHBsYXRmb3JtIGxldHRlcic7XHJcbiAgICBQX1NFUlZfVCAgICAgICAgID0gKCkgPT4gJ0xpc3Qgb2Ygc2VydmljZSBuYW1lcyc7XHJcbiAgICBQX1NFUlZfUEggICAgICAgID0gKCkgPT4gJ0ZpbHRlciBzZXJ2aWNlcy4uLic7XHJcbiAgICBQX1NFUlZfSVRFTV9UICAgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIHNlcnZpY2UnO1xyXG4gICAgUF9TVEFUSU9OX1QgICAgICA9ICgpID0+ICdMaXN0IG9mIHN0YXRpb24gbmFtZXMnO1xyXG4gICAgUF9TVEFUSU9OX1BIICAgICA9ICgpID0+ICdGaWx0ZXIgc3RhdGlvbnMuLi4nO1xyXG4gICAgUF9TVEFUSU9OX0lURU1fVCA9ICgpID0+ICdDbGljayB0byBzZWxlY3Qgb3IgYWRkIHRoaXMgc3RhdGlvbic7XHJcbiAgICBQX1NMX0FERCAgICAgICAgID0gKCkgPT4gJ0FkZCBzdGF0aW9uLi4uJztcclxuICAgIFBfU0xfQUREX1QgICAgICAgPSAoKSA9PiAnQWRkIHN0YXRpb24gdG8gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfQ0xPU0UgICAgICAgPSAoKSA9PiAnQ2xvc2UnO1xyXG4gICAgUF9TTF9DTE9TRV9UICAgICA9ICgpID0+ICdDbG9zZSB0aGlzIHBpY2tlcic7XHJcbiAgICBQX1NMX0VNUFRZICAgICAgID0gKCkgPT4gJ1BsZWFzZSBhZGQgYXQgbGVhc3Qgb25lIHN0YXRpb24gdG8gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfRFJBR19UICAgICAgPSAoKSA9PiAnRHJhZ2dhYmxlIHNlbGVjdGlvbiBvZiBzdGF0aW9ucyBmb3IgdGhpcyBsaXN0JztcclxuICAgIFBfU0xfREVMRVRFICAgICAgPSAoKSA9PiAnRHJvcCBoZXJlIHRvIGRlbGV0ZSc7XHJcbiAgICBQX1NMX0RFTEVURV9UICAgID0gKCkgPT4gJ0Ryb3Agc3RhdGlvbiBoZXJlIHRvIGRlbGV0ZSBpdCBmcm9tIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0lURU1fVCAgICAgID0gKCkgPT5cclxuICAgICAgICAnRHJhZyB0byByZW9yZGVyOyBkb3VibGUtY2xpY2sgb3IgZHJhZyBpbnRvIGRlbGV0ZSB6b25lIHRvIHJlbW92ZSc7XHJcbiAgICBQX1RJTUVfVCAgICAgICAgID0gKCkgPT4gJ1RpbWUgZWRpdG9yJztcclxuXHJcbiAgICBQX0NPQUNIX01JU1NJTkdfU1RBVEUgICA9ICgpID0+ICdvbkNoYW5nZSBmaXJlZCBmb3IgY29hY2ggcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9JTlRfTUlTU0lOR19TVEFURSAgICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIGludGVnZXIgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9QU0VUX01JU1NJTkdfU1RBVEUgICAgPSAoKSA9PiAnb25TZWxlY3QgZmlyZWQgZm9yIHBocmFzZXNldCBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX1NFUlZJQ0VfTUlTU0lOR19TVEFURSA9ICgpID0+ICdvblNlbGVjdCBmaXJlZCBmb3Igc2VydmljZSBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX1RJTUVfTUlTU0lOR19TVEFURSAgICA9ICgpID0+ICdvbkNoYW5nZSBmaXJlZCBmb3IgdGltZSBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX1BTRVRfVU5LTk9XTiAgICAgICAgICA9IChyOiBzdHJpbmcpID0+IGBQaHJhc2VzZXQgJyR7cn0nIGRvZXNuJ3QgZXhpc3RgO1xyXG4gICAgUF9TTF9EUkFHX01JU1NJTkcgICAgICAgPSAoKSA9PiAnRHJhZ2dhYmxlOiBNaXNzaW5nIHNvdXJjZSBlbGVtZW50cyBmb3IgbWlycm9yIGV2ZW50JztcclxuXHJcbiAgICBTVF9SRVNFVCAgICAgICAgICAgPSAoKSA9PiAnUmVzZXQgdG8gZGVmYXVsdHMnO1xyXG4gICAgU1RfUkVTRVRfVCAgICAgICAgID0gKCkgPT4gJ1Jlc2V0IHNldHRpbmdzIHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX0NPTkZJUk0gICA9ICgpID0+ICdBcmUgeW91IHN1cmU/JztcclxuICAgIFNUX1JFU0VUX0NPTkZJUk1fVCA9ICgpID0+ICdDb25maXJtIHJlc2V0IHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX0RPTkUgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1NldHRpbmdzIGhhdmUgYmVlbiByZXNldCB0byB0aGVpciBkZWZhdWx0cywgYW5kIGRlbGV0ZWQgZnJvbSBzdG9yYWdlLic7XHJcbiAgICBTVF9TQVZFICAgICAgICAgICAgPSAoKSA9PiAnU2F2ZSAmIGNsb3NlJztcclxuICAgIFNUX1NBVkVfVCAgICAgICAgICA9ICgpID0+ICdTYXZlIGFuZCBjbG9zZSBzZXR0aW5ncyc7XHJcbiAgICBTVF9TUEVFQ0ggICAgICAgICAgPSAoKSA9PiAnU3BlZWNoJztcclxuICAgIFNUX1NQRUVDSF9DSE9JQ0UgICA9ICgpID0+ICdWb2ljZSc7XHJcbiAgICBTVF9TUEVFQ0hfRU1QVFkgICAgPSAoKSA9PiAnTm9uZSBhdmFpbGFibGUnO1xyXG4gICAgU1RfU1BFRUNIX1ZPTCAgICAgID0gKCkgPT4gJ1ZvbHVtZSc7XHJcbiAgICBTVF9TUEVFQ0hfUElUQ0ggICAgPSAoKSA9PiAnUGl0Y2gnO1xyXG4gICAgU1RfU1BFRUNIX1JBVEUgICAgID0gKCkgPT4gJ1JhdGUnO1xyXG4gICAgU1RfU1BFRUNIX1RFU1QgICAgID0gKCkgPT4gJ1Rlc3Qgc3BlZWNoJztcclxuICAgIFNUX1NQRUVDSF9URVNUX1QgICA9ICgpID0+ICdQbGF5IGEgc3BlZWNoIHNhbXBsZSB3aXRoIHRoZSBjdXJyZW50IHNldHRpbmdzJztcclxuICAgIFNUX0xFR0FMICAgICAgICAgICA9ICgpID0+ICdMZWdhbCAmIEFja25vd2xlZGdlbWVudHMnO1xyXG5cclxuICAgIFdBUk5fU0hPUlRfSEVBREVSID0gKCkgPT4gJ1wiTWF5IEkgaGF2ZSB5b3VyIGF0dGVudGlvbiBwbGVhc2UuLi5cIic7XHJcbiAgICBXQVJOX1NIT1JUICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1RoaXMgZGlzcGxheSBpcyB0b28gc2hvcnQgdG8gc3VwcG9ydCBSQUcuIFBsZWFzZSBtYWtlIHRoaXMgd2luZG93IHRhbGxlciwgb3InICtcclxuICAgICAgICAnIHJvdGF0ZSB5b3VyIGRldmljZSBmcm9tIGxhbmRzY2FwZSB0byBwb3J0cmFpdC4nO1xyXG5cclxuICAgIC8vIFRPRE86IFRoZXNlIGRvbid0IGZpdCBoZXJlOyB0aGlzIHNob3VsZCBnbyBpbiB0aGUgZGF0YVxyXG4gICAgTEVUVEVSUyA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWic7XHJcbiAgICBESUdJVFMgID0gW1xyXG4gICAgICAgICd6ZXJvJywgICAgICdvbmUnLCAgICAgJ3R3bycsICAgICAndGhyZWUnLCAgICAgJ2ZvdXInLCAgICAgJ2ZpdmUnLCAgICAnc2l4JyxcclxuICAgICAgICAnc2V2ZW4nLCAgICAnZWlnaHQnLCAgICduaW5lJywgICAgJ3RlbicsICAgICAgICdlbGV2ZW4nLCAgICd0d2VsdmUnLCAgJ3RoaXJ0ZWVuJyxcclxuICAgICAgICAnZm91cnRlZW4nLCAnZmlmdGVlbicsICdzaXh0ZWVuJywgJ3NldmVudGVlbicsICdlaWdodGVlbicsICduaW50ZWVuJywgJ3R3ZW50eSdcclxuICAgIF07XHJcblxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKipcclxuICogSG9sZHMgbWV0aG9kcyBmb3IgcHJvY2Vzc2luZyBlYWNoIHR5cGUgb2YgcGhyYXNlIGVsZW1lbnQgaW50byBIVE1MLCB3aXRoIGRhdGEgdGFrZW5cclxuICogZnJvbSB0aGUgY3VycmVudCBzdGF0ZS4gRWFjaCBtZXRob2QgdGFrZXMgYSBjb250ZXh0IG9iamVjdCwgaG9sZGluZyBkYXRhIGZvciB0aGVcclxuICogY3VycmVudCBYTUwgZWxlbWVudCBiZWluZyBwcm9jZXNzZWQgYW5kIHRoZSBYTUwgZG9jdW1lbnQgYmVpbmcgdXNlZC5cclxuICovXHJcbmNsYXNzIEVsZW1lbnRQcm9jZXNzb3JzXHJcbntcclxuICAgIC8qKiBGaWxscyBpbiBjb2FjaCBsZXR0ZXJzIGZyb20gQSB0byBaICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNvYWNoKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0NPQUNIKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldENvYWNoKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgZXhjdXNlLCBmb3IgYSBkZWxheSBvciBjYW5jZWxsYXRpb24gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZXhjdXNlKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfRVhDVVNFKCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZXhjdXNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBpbnRlZ2Vycywgb3B0aW9uYWxseSB3aXRoIG5vdW5zIGFuZCBpbiB3b3JkIGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50ZWdlcihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzaW5ndWxhciA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnc2luZ3VsYXInKTtcclxuICAgICAgICBsZXQgcGx1cmFsICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3BsdXJhbCcpO1xyXG4gICAgICAgIGxldCB3b3JkcyAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnd29yZHMnKTtcclxuXHJcbiAgICAgICAgbGV0IGludCAgICA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKGNvbnRleHQpO1xyXG4gICAgICAgIGxldCBpbnRTdHIgPSAod29yZHMgJiYgd29yZHMudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoaW50ID09PSAxICYmIHNpbmd1bGFyKVxyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3Npbmd1bGFyfWA7XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHBsdXJhbClcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHtwbHVyYWx9YDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0lOVEVHRVIoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHI7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcblxyXG4gICAgICAgIGlmIChzaW5ndWxhcikgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnc2luZ3VsYXInXSA9IHNpbmd1bGFyO1xyXG4gICAgICAgIGlmIChwbHVyYWwpICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsncGx1cmFsJ10gICA9IHBsdXJhbDtcclxuICAgICAgICBpZiAod29yZHMpICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3dvcmRzJ10gICAgPSB3b3JkcztcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG5hbWVkKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfTkFNRUQoKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5uYW1lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlLCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZShyZWYpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICAgICA9ICcnO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0UocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBocmFzZXMgd2l0aCBhIGNoYW5jZSB2YWx1ZSBhcyBjb2xsYXBzaWJsZVxyXG4gICAgICAgIGlmICggY3R4LnhtbEVsZW1lbnQuaGFzQXR0cmlidXRlKCdjaGFuY2UnKSApXHJcbiAgICAgICAgICAgIHRoaXMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcGhyYXNlLCByZWYpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgRE9NLmNsb25lSW50byhwaHJhc2UsIGN0eC5uZXdFbGVtZW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwaHJhc2UgZnJvbSBhIHByZXZpb3VzbHkgZGVmaW5lZCBwaHJhc2VzZXQsIGJ5IGl0cyBgaWRgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBocmFzZXNldChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgICAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZik7XHJcbiAgICAgICAgbGV0IGZvcmNlZElkeCA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnaWR4Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGlkeCA9IGZvcmNlZElkeFxyXG4gICAgICAgICAgICA/IHBhcnNlSW50KGZvcmNlZElkeClcclxuICAgICAgICAgICAgOiBSQUcuc3RhdGUuZ2V0UGhyYXNlc2V0SWR4KHJlZik7XHJcblxyXG4gICAgICAgIGxldCBwaHJhc2UgPSBwaHJhc2VzZXQuY2hpbGRyZW5baWR4XSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnaWR4J10gPSBmb3JjZWRJZHggfHwgaWR4LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlID0gTC5USVRMRV9QSFJBU0VTRVQocmVmKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBocmFzZXNldHMgd2l0aCBhIGNoYW5jZSB2YWx1ZSBhcyBjb2xsYXBzaWJsZVxyXG4gICAgICAgIGlmICggY3R4LnhtbEVsZW1lbnQuaGFzQXR0cmlidXRlKCdjaGFuY2UnKSApXHJcbiAgICAgICAgICAgIHRoaXMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcGhyYXNlLCByZWYpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgRE9NLmNsb25lSW50byhwaHJhc2UsIGN0eC5uZXdFbGVtZW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGxhdGZvcm0oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9QTEFURk9STSgpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLnBsYXRmb3JtLmpvaW4oJycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgcmFpbCBuZXR3b3JrIG5hbWUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2VydmljZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TRVJWSUNFKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldFNlcnZpY2UoY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHN0YXRpb24gbmFtZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RhdGlvbihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IGNvZGUgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbihjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1NUQVRJT04oY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gc3RhdGlvbiBsaXN0cyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzdGF0aW9ubGlzdChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgICAgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzdGF0aW9ucyAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdChjb250ZXh0KS5zbGljZSgpO1xyXG4gICAgICAgIGxldCBzdGF0aW9uTGlzdCA9IFN0cmluZ3MuZnJvbVN0YXRpb25MaXN0KHN0YXRpb25zLCBjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1NUQVRJT05MSVNUKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gc3RhdGlvbkxpc3Q7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSB0aW1lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRpbWUoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfVElNRShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRUaW1lKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB2b3ggcGFydHMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdm94KGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQga2V5ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAna2V5Jyk7XHJcblxyXG4gICAgICAgIC8vIFRPRE86IExvY2FsaXplXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgICAgPSBjdHgueG1sRWxlbWVudC50ZXh0Q29udGVudDtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICAgICA9IGBDbGljayB0byBlZGl0IHRoaXMgcGhyYXNlICgke2tleX0pYDtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydrZXknXSA9IGtleTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB1bmtub3duIGVsZW1lbnRzIHdpdGggYW4gaW5saW5lIGVycm9yIG1lc3NhZ2UgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdW5rbm93bihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5hbWUgPSBjdHgueG1sRWxlbWVudC5ub2RlTmFtZTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX0VMRU1FTlQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50IGludG8gYSBuZXcgaW5uZXIgc3BhbiB0YWcsIHNvIHRoYXQgdGhleVxyXG4gICAgICogY2FuIGJlIG1hZGUgY29sbGFwc2libGUuIEFwcGVuZHMgaXQgdG8gdGhlIG5ldyBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbWFrZUNvbGxhcHNpYmxlKGN0eDogUGhyYXNlQ29udGV4dCwgc291cmNlOiBIVE1MRWxlbWVudCwgcmVmOiBzdHJpbmcpXHJcbiAgICAgICAgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNoYW5jZSAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnY2hhbmNlJykhO1xyXG4gICAgICAgIGxldCBpbm5lciAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgbGV0IHRvZ2dsZSAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICBsZXQgY29sbGFwc2VkID0gUkFHLnN0YXRlLmdldENvbGxhcHNlZCggcmVmLCBwYXJzZUludChjaGFuY2UpICk7XHJcblxyXG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5hZGQoJ2lubmVyJyk7XHJcbiAgICAgICAgdG9nZ2xlLmNsYXNzTGlzdC5hZGQoJ3RvZ2dsZScpO1xyXG5cclxuICAgICAgICBET00uY2xvbmVJbnRvKHNvdXJjZSwgaW5uZXIpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddID0gY2hhbmNlO1xyXG5cclxuICAgICAgICBDb2xsYXBzaWJsZXMuc2V0KGN0eC5uZXdFbGVtZW50LCB0b2dnbGUsIGNvbGxhcHNlZCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQodG9nZ2xlKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5hcHBlbmRDaGlsZChpbm5lcik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBSZXByZXNlbnRzIGNvbnRleHQgZGF0YSBmb3IgYSBwaHJhc2UsIHRvIGJlIHBhc3NlZCB0byBhbiBlbGVtZW50IHByb2Nlc3NvciAqL1xyXG5pbnRlcmZhY2UgUGhyYXNlQ29udGV4dFxyXG57XHJcbiAgICAvKiogR2V0cyB0aGUgWE1MIHBocmFzZSBlbGVtZW50IHRoYXQgaXMgYmVpbmcgcmVwbGFjZWQgKi9cclxuICAgIHhtbEVsZW1lbnQgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBHZXRzIHRoZSBIVE1MIHNwYW4gZWxlbWVudCB0aGF0IGlzIHJlcGxhY2luZyB0aGUgWE1MIGVsZW1lbnQgKi9cclxuICAgIG5ld0VsZW1lbnQgOiBIVE1MU3BhbkVsZW1lbnQ7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKlxyXG4gKiBIYW5kbGVzIHRoZSB0cmFuc2Zvcm1hdGlvbiBvZiBwaHJhc2UgWE1MIGRhdGEsIGludG8gSFRNTCBlbGVtZW50cyB3aXRoIHRoZWlyIGRhdGFcclxuICogZmlsbGVkIGluIGFuZCB0aGVpciBVSSBsb2dpYyB3aXJlZC5cclxuICovXHJcbmNsYXNzIFBocmFzZXJcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBSZWN1cnNpdmVseSBwcm9jZXNzZXMgWE1MIGVsZW1lbnRzLCBmaWxsaW5nIGluIGRhdGEgYW5kIGFwcGx5aW5nIHRyYW5zZm9ybXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciBQYXJlbnQgdG8gcHJvY2VzcyB0aGUgY2hpbGRyZW4gb2ZcclxuICAgICAqIEBwYXJhbSBsZXZlbCBDdXJyZW50IGxldmVsIG9mIHJlY3Vyc2lvbiwgbWF4LiAyMFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcHJvY2Vzcyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBsZXZlbDogbnVtYmVyID0gMClcclxuICAgIHtcclxuICAgICAgICAvLyBJbml0aWFsbHksIHRoaXMgbWV0aG9kIHdhcyBzdXBwb3NlZCB0byBqdXN0IGFkZCB0aGUgWE1MIGVsZW1lbnRzIGRpcmVjdGx5IGludG9cclxuICAgICAgICAvLyB0aGUgZG9jdW1lbnQuIEhvd2V2ZXIsIHRoaXMgY2F1c2VkIGEgbG90IG9mIHByb2JsZW1zIChlLmcuIHRpdGxlIG5vdCB3b3JraW5nKS5cclxuICAgICAgICAvLyBIVE1MIGRvZXMgbm90IHdvcmsgcmVhbGx5IHdlbGwgd2l0aCBjdXN0b20gZWxlbWVudHMsIGVzcGVjaWFsbHkgaWYgdGhleSBhcmUgb2ZcclxuICAgICAgICAvLyBhbm90aGVyIFhNTCBuYW1lc3BhY2UuXHJcblxyXG4gICAgICAgIGxldCBwZW5kaW5nID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJzpub3Qoc3BhbiknKSBhcyBOb2RlTGlzdE9mPEhUTUxFbGVtZW50PjtcclxuXHJcbiAgICAgICAgLy8gTm8gbW9yZSBYTUwgZWxlbWVudHMgdG8gZXhwYW5kXHJcbiAgICAgICAgaWYgKHBlbmRpbmcubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZvciBlYWNoIFhNTCBlbGVtZW50IGN1cnJlbnRseSBpbiB0aGUgY29udGFpbmVyOlxyXG4gICAgICAgIC8vICogQ3JlYXRlIGEgbmV3IHNwYW4gZWxlbWVudCBmb3IgaXRcclxuICAgICAgICAvLyAqIEhhdmUgdGhlIHByb2Nlc3NvcnMgdGFrZSBkYXRhIGZyb20gdGhlIFhNTCBlbGVtZW50LCB0byBwb3B1bGF0ZSB0aGUgbmV3IG9uZVxyXG4gICAgICAgIC8vICogUmVwbGFjZSB0aGUgWE1MIGVsZW1lbnQgd2l0aCB0aGUgbmV3IG9uZVxyXG4gICAgICAgIHBlbmRpbmcuZm9yRWFjaChlbGVtZW50ID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudE5hbWUgPSBlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICAgICAgbGV0IGNvbnRleHQgICAgID0ge1xyXG4gICAgICAgICAgICAgICAgeG1sRWxlbWVudDogZWxlbWVudCxcclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQ6IG5ld0VsZW1lbnRcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIG5ld0VsZW1lbnQuZGF0YXNldFsndHlwZSddID0gZWxlbWVudE5hbWU7XHJcblxyXG4gICAgICAgICAgICAvLyBJIHdhbnRlZCB0byB1c2UgYW4gaW5kZXggb24gRWxlbWVudFByb2Nlc3NvcnMgZm9yIHRoaXMsIGJ1dCBpdCBjYXVzZWQgZXZlcnlcclxuICAgICAgICAgICAgLy8gcHJvY2Vzc29yIHRvIGhhdmUgYW4gXCJ1bnVzZWQgbWV0aG9kXCIgd2FybmluZy5cclxuICAgICAgICAgICAgc3dpdGNoIChlbGVtZW50TmFtZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnY29hY2gnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5jb2FjaChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdleGN1c2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLmV4Y3VzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2ludGVnZXInOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuaW50ZWdlcihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnbmFtZWQnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5uYW1lZChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BocmFzZXNldCc6ICAgRWxlbWVudFByb2Nlc3NvcnMucGhyYXNlc2V0KGNvbnRleHQpOyAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGxhdGZvcm0nOiAgICBFbGVtZW50UHJvY2Vzc29ycy5wbGF0Zm9ybShjb250ZXh0KTsgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnNlcnZpY2UoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb24nOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc3RhdGlvbmxpc3QnOiBFbGVtZW50UHJvY2Vzc29ycy5zdGF0aW9ubGlzdChjb250ZXh0KTsgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICd0aW1lJzogICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnRpbWUoY29udGV4dCk7ICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3ZveCc6ICAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudm94KGNvbnRleHQpOyAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogICAgICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy51bmtub3duKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGVsZW1lbnQucGFyZW50RWxlbWVudCEucmVwbGFjZUNoaWxkKG5ld0VsZW1lbnQsIGVsZW1lbnQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBSZWN1cnNlIHNvIHRoYXQgd2UgY2FuIGV4cGFuZCBhbnkgbmV3IGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKGxldmVsIDwgMjApXHJcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhjb250YWluZXIsIGxldmVsICsgMSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QSFJBU0VSX1RPT19SRUNVUlNJVkUoKSApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBjbGFzcyBmb3IgcmVzb2x2aW5nIGEgZ2l2ZW4gcGhyYXNlIHRvIHZveCBrZXlzICovXHJcbmNsYXNzIFJlc29sdmVyXHJcbntcclxuICAgIC8qKiBUcmVlV2Fsa2VyIGZpbHRlciB0byByZWR1Y2UgYSB3YWxrIHRvIGp1c3QgdGhlIGVsZW1lbnRzIHRoZSByZXNvbHZlciBuZWVkcyAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbm9kZUZpbHRlcihub2RlOiBOb2RlKTogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgICAgPSBub2RlLnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCBwYXJlbnRUeXBlID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuXHJcbiAgICAgICAgLy8gSWYgdHlwZSBpcyBtaXNzaW5nLCBwYXJlbnQgaXMgYSB3cmFwcGVyXHJcbiAgICAgICAgaWYgKCFwYXJlbnRUeXBlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcGFyZW50ICAgICA9IHBhcmVudC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICAgICAgcGFyZW50VHlwZSA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBY2NlcHQgdGV4dCBvbmx5IGZyb20gcGhyYXNlIGFuZCBwaHJhc2VzZXRzXHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgIGlmIChwYXJlbnRUeXBlICE9PSAncGhyYXNlc2V0JyAmJiBwYXJlbnRUeXBlICE9PSAncGhyYXNlJylcclxuICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcblxyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBlbGVtZW50ID0gbm9kZSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgbGV0IHR5cGUgICAgPSBlbGVtZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuXHJcbiAgICAgICAgICAgIC8vIFJlamVjdCBjb2xsYXBzZWQgZWxlbWVudHMgYW5kIHRoZWlyIGNoaWxkcmVuXHJcbiAgICAgICAgICAgIGlmICggZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpIClcclxuICAgICAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9SRUpFQ1Q7XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIHR5cGVsZXNzICh3cmFwcGVyKSBlbGVtZW50c1xyXG4gICAgICAgICAgICBpZiAoIXR5cGUpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfU0tJUDtcclxuXHJcbiAgICAgICAgICAgIC8vIFNraXAgb3ZlciBwaHJhc2UgYW5kIHBocmFzZXNldHMgKGluc3RlYWQsIG9ubHkgZ29pbmcgZm9yIHRoZWlyIGNoaWxkcmVuKVxyXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ3BocmFzZXNldCcgfHwgdHlwZSA9PT0gJ3BocmFzZScpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfU0tJUDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9BQ0NFUFQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwaHJhc2UgICAgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwcml2YXRlIGZsYXR0ZW5lZCA6IE5vZGVbXTtcclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVkICA6IFZveEtleVtdO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihwaHJhc2U6IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMucGhyYXNlICAgID0gcGhyYXNlO1xyXG4gICAgICAgIHRoaXMuZmxhdHRlbmVkID0gW107XHJcbiAgICAgICAgdGhpcy5yZXNvbHZlZCAgPSBbXTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgdG9Wb3goKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgLy8gRmlyc3QsIHdhbGsgdGhyb3VnaCB0aGUgcGhyYXNlIGFuZCBcImZsYXR0ZW5cIiBpdCBpbnRvIGFuIGFycmF5IG9mIHBhcnRzLiBUaGlzIGlzXHJcbiAgICAgICAgLy8gc28gdGhlIHJlc29sdmVyIGNhbiBsb29rLWFoZWFkIG9yIGxvb2stYmVoaW5kLlxyXG5cclxuICAgICAgICB0aGlzLmZsYXR0ZW5lZCA9IFtdO1xyXG4gICAgICAgIHRoaXMucmVzb2x2ZWQgID0gW107XHJcbiAgICAgICAgbGV0IHRyZWVXYWxrZXIgPSBkb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKFxyXG4gICAgICAgICAgICB0aGlzLnBocmFzZSxcclxuICAgICAgICAgICAgTm9kZUZpbHRlci5TSE9XX1RFWFQgfCBOb2RlRmlsdGVyLlNIT1dfRUxFTUVOVCxcclxuICAgICAgICAgICAgeyBhY2NlcHROb2RlOiBSZXNvbHZlci5ub2RlRmlsdGVyIH0sXHJcbiAgICAgICAgICAgIGZhbHNlXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgd2hpbGUgKCB0cmVlV2Fsa2VyLm5leHROb2RlKCkgKVxyXG4gICAgICAgIGlmICh0cmVlV2Fsa2VyLmN1cnJlbnROb2RlLnRleHRDb250ZW50IS50cmltKCkgIT09ICcnKVxyXG4gICAgICAgICAgICB0aGlzLmZsYXR0ZW5lZC5wdXNoKHRyZWVXYWxrZXIuY3VycmVudE5vZGUpO1xyXG5cclxuICAgICAgICAvLyBUaGVuLCByZXNvbHZlIGFsbCB0aGUgcGhyYXNlcycgbm9kZXMgaW50byB2b3gga2V5c1xyXG5cclxuICAgICAgICB0aGlzLmZsYXR0ZW5lZC5mb3JFYWNoKCAodiwgaSkgPT4gdGhpcy5yZXNvbHZlZC5wdXNoKCAuLi50aGlzLnJlc29sdmUodiwgaSkgKSApO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyh0aGlzLmZsYXR0ZW5lZCwgdGhpcy5yZXNvbHZlZCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVc2VzIHRoZSB0eXBlIGFuZCB2YWx1ZSBvZiB0aGUgZ2l2ZW4gbm9kZSwgdG8gcmVzb2x2ZSBpdCB0byB2b3ggZmlsZSBJRHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIG5vZGUgTm9kZSB0byByZXNvbHZlIHRvIHZveCBJRHNcclxuICAgICAqIEBwYXJhbSBpZHggSW5kZXggb2YgdGhlIG5vZGUgYmVpbmcgcmVzb2x2ZWQgcmVsYXRpdmUgdG8gdGhlIHBocmFzZSBhcnJheVxyXG4gICAgICogQHJldHVybnMgQXJyYXkgb2YgSURzIHRoYXQgbWFrZSB1cCBvbmUgb3IgbW9yZSBmaWxlIElEcy4gQ2FuIGJlIGVtcHR5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlc29sdmUobm9kZTogTm9kZSwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVUZXh0KG5vZGUpO1xyXG5cclxuICAgICAgICBsZXQgZWxlbWVudCA9IG5vZGUgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IHR5cGUgICAgPSBlbGVtZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0eXBlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2FzZSAnY29hY2gnOiAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlQ29hY2goZWxlbWVudCwgaWR4KTtcclxuICAgICAgICAgICAgY2FzZSAnZXhjdXNlJzogICAgICByZXR1cm4gdGhpcy5yZXNvbHZlRXhjdXNlKGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ2ludGVnZXInOiAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUludGVnZXIoZWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ25hbWVkJzogICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZU5hbWVkKCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3BsYXRmb3JtJzogICAgcmV0dXJuIHRoaXMucmVzb2x2ZVBsYXRmb3JtKGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3NlcnZpY2UnOiAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVNlcnZpY2UoZWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3N0YXRpb24nOiAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVN0YXRpb24oZWxlbWVudCwgaWR4KTtcclxuICAgICAgICAgICAgY2FzZSAnc3RhdGlvbmxpc3QnOiByZXR1cm4gdGhpcy5yZXNvbHZlU3RhdGlvbkxpc3QoZWxlbWVudCwgaWR4KTtcclxuICAgICAgICAgICAgY2FzZSAndGltZSc6ICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlVGltZShlbGVtZW50KTtcclxuICAgICAgICAgICAgY2FzZSAndm94JzogICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlVm94KGVsZW1lbnQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0SW5mbGVjdGlvbihpZHg6IG51bWJlcikgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgbmV4dCA9IHRoaXMuZmxhdHRlbmVkW2lkeCArIDFdO1xyXG5cclxuICAgICAgICByZXR1cm4gKCBuZXh0ICYmIG5leHQudGV4dENvbnRlbnQhLnRyaW0oKS5zdGFydHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICA/ICdlbmQnXHJcbiAgICAgICAgICAgIDogJ21pZCc7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlVGV4dChub2RlOiBOb2RlKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCA9IG5vZGUucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgbGV0IHR5cGUgICA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcbiAgICAgICAgbGV0IHRleHQgICA9IFN0cmluZ3MuY2xlYW4obm9kZS50ZXh0Q29udGVudCEpO1xyXG4gICAgICAgIGxldCBzZXQgICAgPSBbXTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGV4dCBpcyBqdXN0IGEgZnVsbCBzdG9wLCByZXR1cm4gc2lsZW5jZVxyXG4gICAgICAgIGlmICh0ZXh0ID09PSAnLicpXHJcbiAgICAgICAgICAgIHJldHVybiBbMC42NV07XHJcblxyXG4gICAgICAgIC8vIElmIGl0IGJlZ2lucyB3aXRoIGEgZnVsbCBzdG9wLCBhZGQgc2lsZW5jZVxyXG4gICAgICAgIGlmICggdGV4dC5zdGFydHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICBzZXQucHVzaCgwLjY1KTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlIHRleHQgZG9lc24ndCBjb250YWluIGFueSB3b3Jkcywgc2tpcFxyXG4gICAgICAgIGlmICggIXRleHQubWF0Y2goL1thLXowLTldL2kpIClcclxuICAgICAgICAgICAgcmV0dXJuIHNldDtcclxuXHJcbiAgICAgICAgLy8gSWYgdHlwZSBpcyBtaXNzaW5nLCBwYXJlbnQgaXMgYSB3cmFwcGVyXHJcbiAgICAgICAgaWYgKCF0eXBlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcGFyZW50ID0gcGFyZW50LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgICAgICB0eXBlICAgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHJlZiA9IHBhcmVudC5kYXRhc2V0WydyZWYnXTtcclxuICAgICAgICBsZXQgaWR4ID0gRE9NLm5vZGVJbmRleE9mKG5vZGUpO1xyXG4gICAgICAgIGxldCBpZCAgPSBgJHt0eXBlfS4ke3JlZn1gO1xyXG5cclxuICAgICAgICAvLyBBcHBlbmQgaW5kZXggb2YgcGhyYXNlc2V0J3MgY2hvaWNlIG9mIHBocmFzZVxyXG4gICAgICAgIGlmICh0eXBlID09PSAncGhyYXNlc2V0JylcclxuICAgICAgICAgICAgaWQgKz0gYC4ke3BhcmVudC5kYXRhc2V0WydpZHgnXX1gO1xyXG5cclxuICAgICAgICBpZCArPSBgLiR7aWR4fWA7XHJcbiAgICAgICAgc2V0LnB1c2goaWQpO1xyXG5cclxuICAgICAgICAvLyBJZiB0ZXh0IGVuZHMgd2l0aCBhIGZ1bGwgc3RvcCwgYWRkIHNpbGVuY2VcclxuICAgICAgICBpZiAoIHRleHQuZW5kc1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgIHNldC5wdXNoKDAuNjUpO1xyXG5cclxuICAgICAgICByZXR1cm4gc2V0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUNvYWNoKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBjb2FjaCAgID0gUkFHLnN0YXRlLmdldENvYWNoKGN0eCk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgcmVzdWx0ICA9IFswLjIsIGBsZXR0ZXIuJHtjb2FjaH0uJHtpbmZsZWN0fWBdO1xyXG5cclxuICAgICAgICBpZiAoaW5mbGVjdCA9PT0gJ21pZCcpXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuMik7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlRXhjdXNlKGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGV4Y3VzZSAgPSBSQUcuc3RhdGUuZXhjdXNlO1xyXG4gICAgICAgIGxldCBrZXkgICAgID0gU3RyaW5ncy5maWxlbmFtZShleGN1c2UpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgPSBbMC4xNSwgYGV4Y3VzZS4ke2tleX0uJHtpbmZsZWN0fWBdO1xyXG5cclxuICAgICAgICBpZiAoaW5mbGVjdCA9PT0gJ21pZCcpXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuMik7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlSW50ZWdlcihlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc2luZ3VsYXIgPSBlbGVtZW50LmRhdGFzZXRbJ3Npbmd1bGFyJ107XHJcbiAgICAgICAgbGV0IHBsdXJhbCAgID0gZWxlbWVudC5kYXRhc2V0WydwbHVyYWwnXTtcclxuICAgICAgICBsZXQgaW50ZWdlciAgPSBSQUcuc3RhdGUuZ2V0SW50ZWdlcihjdHgpO1xyXG4gICAgICAgIGxldCBwYXJ0cyAgICA9IFswLjEyNSwgYG51bWJlci4ke2ludGVnZXJ9Lm1pZGBdO1xyXG5cclxuICAgICAgICBpZiAgICAgIChzaW5ndWxhciAmJiBpbnRlZ2VyID09PSAxKVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMTUsIGBudW1iZXIuc3VmZml4LiR7c2luZ3VsYXJ9LmVuZGApO1xyXG4gICAgICAgIGVsc2UgaWYgKHBsdXJhbCAgICYmIGludGVnZXIgIT09IDEpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4xNSwgYG51bWJlci5zdWZmaXguJHtwbHVyYWx9LmVuZGApO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjE1KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHBhcnRzO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZU5hbWVkKCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBuYW1lZCA9IFN0cmluZ3MuZmlsZW5hbWUoUkFHLnN0YXRlLm5hbWVkKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFswLjIsIGBuYW1lZC4ke25hbWVkfS5taWRgLCAwLjJdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVBsYXRmb3JtKGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBsYXRmb3JtID0gUkFHLnN0YXRlLnBsYXRmb3JtO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ICA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCBsZXR0ZXIgICA9IChwbGF0Zm9ybVsxXSA9PT0gJ8K+JykgPyAnTScgOiBwbGF0Zm9ybVsxXTtcclxuICAgICAgICBsZXQgcmVzdWx0ICAgPSBbMC4xNSwgYG51bWJlci4ke3BsYXRmb3JtWzBdfSR7bGV0dGVyfS4ke2luZmxlY3R9YF07XHJcblxyXG4gICAgICAgIGlmIChpbmZsZWN0ID09PSAnbWlkJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4yKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVTZXJ2aWNlKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHNlcnZpY2UgPSBTdHJpbmdzLmZpbGVuYW1lKCBSQUcuc3RhdGUuZ2V0U2VydmljZShjdHgpICk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgPSBbXTtcclxuXHJcbiAgICAgICAgLy8gT25seSBhZGQgYmVnaW5uaW5nIGRlbGF5IGlmIHRoZXJlIGlzbid0IGFscmVhZHkgb25lIHByaW9yXHJcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnJlc29sdmVkLnNsaWNlKC0xKVswXSAhPT0gJ251bWJlcicpXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuMSk7XHJcblxyXG4gICAgICAgIHJldHVybiBbLi4ucmVzdWx0LCBgc2VydmljZS4ke3NlcnZpY2V9Lm1pZGAsIDAuMTVdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb24oZWxlbWVudDogSFRNTEVsZW1lbnQsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbihjdHgpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgPSBbMC4yLCBgc3RhdGlvbi4ke3N0YXRpb259LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBsaXN0ICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KGN0eCk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuXHJcbiAgICAgICAgbGV0IHBhcnRzIDogVm94S2V5W10gPSBbMC4yXTtcclxuXHJcbiAgICAgICAgbGlzdC5mb3JFYWNoKCAodiwgaykgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEhhbmRsZSBtaWRkbGUgb2YgbGlzdCBpbmZsZWN0aW9uXHJcbiAgICAgICAgICAgIGlmIChrICE9PSBsaXN0Lmxlbmd0aCAtIDEpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2fS5taWRgLCAwLjI1KTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFwiYW5kXCIgaWYgbGlzdCBoYXMgbW9yZSB0aGFuIDEgc3RhdGlvbiBhbmQgdGhpcyBpcyB0aGUgZW5kXHJcbiAgICAgICAgICAgIGlmIChsaXN0Lmxlbmd0aCA+IDEpXHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKCdzdGF0aW9uLnBhcnRzLmFuZC5taWQnLCAwLjI1KTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFkZCBcIm9ubHlcIiBpZiBvbmx5IG9uZSBzdGF0aW9uIGluIHRoZSBjYWxsaW5nIGxpc3RcclxuICAgICAgICAgICAgaWYgKGxpc3QubGVuZ3RoID09PSAxICYmIGN0eCA9PT0gJ2NhbGxpbmcnKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGBzdGF0aW9uLiR7dn0ubWlkYCk7XHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMiwgJ3N0YXRpb24ucGFydHMub25seS5lbmQnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGBzdGF0aW9uLiR7dn0uJHtpbmZsZWN0fWApO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gWy4uLnBhcnRzLCAwLjJdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVRpbWUoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHRpbWUgID0gUkFHLnN0YXRlLmdldFRpbWUoY3R4KS5zcGxpdCgnOicpO1xyXG5cclxuICAgICAgICBsZXQgcGFydHMgOiBWb3hLZXlbXSA9IFswLjJdO1xyXG5cclxuICAgICAgICBpZiAodGltZVswXSA9PT0gJzAwJyAmJiB0aW1lWzFdID09PSAnMDAnKVxyXG4gICAgICAgICAgICByZXR1cm4gWy4uLnBhcnRzLCAnbnVtYmVyLjAwMDAubWlkJywgMC4yXTtcclxuXHJcbiAgICAgICAgLy8gSG91cnNcclxuICAgICAgICBwYXJ0cy5wdXNoKGBudW1iZXIuJHt0aW1lWzBdfS5iZWdpbmApO1xyXG5cclxuICAgICAgICBpZiAodGltZVsxXSA9PT0gJzAwJylcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjA3NSwgJ251bWJlci5odW5kcmVkLm1pZCcpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjIsIGBudW1iZXIuJHt0aW1lWzFdfS5taWRgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgMC4xNV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlVm94KGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRleHQgICA9IGVsZW1lbnQuaW5uZXJUZXh0LnRyaW0oKTtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gW107XHJcblxyXG4gICAgICAgIGlmICggdGV4dC5zdGFydHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjY1KTtcclxuXHJcbiAgICAgICAgcmVzdWx0LnB1c2goIGVsZW1lbnQuZGF0YXNldFsna2V5J10hICk7XHJcblxyXG4gICAgICAgIGlmICggdGV4dC5lbmRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYW5hZ2VzIHNwZWVjaCBzeW50aGVzaXMgdXNpbmcgYm90aCBuYXRpdmUgYW5kIGN1c3RvbSBlbmdpbmVzICovXHJcbmNsYXNzIFNwZWVjaFxyXG57XHJcbiAgICAvKiogSW5zdGFuY2Ugb2YgdGhlIGN1c3RvbSB2b2ljZSBlbmdpbmUgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgdm94RW5naW5lPyA6IFZveEVuZ2luZTtcclxuXHJcbiAgICAvKiogQXJyYXkgb2YgYnJvd3Nlci1wcm92aWRlZCB2b2ljZXMgYXZhaWxhYmxlICovXHJcbiAgICBwdWJsaWMgIGJyb3dzZXJWb2ljZXMgOiBTcGVlY2hTeW50aGVzaXNWb2ljZVtdID0gW107XHJcbiAgICAvKiogRXZlbnQgaGFuZGxlciBmb3Igd2hlbiBzcGVlY2ggaGFzIGVuZGVkICovXHJcbiAgICBwdWJsaWMgIG9uc3RvcD8gICAgICAgOiAoKSA9PiB2b2lkO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbmF0aXZlIHNwZWVjaC1zdG9wcGVkIGNoZWNrIHRpbWVyICovXHJcbiAgICBwcml2YXRlIHN0b3BUaW1lciAgICAgOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU29tZSBicm93c2VycyBkb24ndCBwcm9wZXJseSBjYW5jZWwgc3BlZWNoIG9uIHBhZ2UgY2xvc2UuXHJcbiAgICAgICAgLy8gQlVHOiBvbnBhZ2VzaG93IGFuZCBvbnBhZ2VoaWRlIG5vdCB3b3JraW5nIG9uIGlPUyAxMVxyXG4gICAgICAgIHdpbmRvdy5vbmJlZm9yZXVubG9hZCA9XHJcbiAgICAgICAgd2luZG93Lm9udW5sb2FkICAgICAgID1cclxuICAgICAgICB3aW5kb3cub25wYWdlc2hvdyAgICAgPVxyXG4gICAgICAgIHdpbmRvdy5vbnBhZ2VoaWRlICAgICA9IHRoaXMuc3RvcC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5vbnZpc2liaWxpdHljaGFuZ2UgICAgICAgICAgICA9IHRoaXMub25WaXNpYmlsaXR5Q2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5vbnZvaWNlc2NoYW5nZWQgPSB0aGlzLm9uVm9pY2VzQ2hhbmdlZC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBFdmVuIHRob3VnaCAnb252b2ljZXNjaGFuZ2VkJyBpcyB1c2VkIGxhdGVyIHRvIHBvcHVsYXRlIHRoZSBsaXN0LCBDaHJvbWUgZG9lc1xyXG4gICAgICAgIC8vIG5vdCBhY3R1YWxseSBmaXJlIHRoZSBldmVudCB1bnRpbCB0aGlzIGNhbGwuLi5cclxuICAgICAgICB0aGlzLm9uVm9pY2VzQ2hhbmdlZCgpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBNYWtlIHRoaXMgYSBkeW5hbWljIHJlZ2lzdHJhdGlvbiBhbmQgY2hlY2sgZm9yIGZlYXR1cmVzXHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnZveEVuZ2luZSA9IG5ldyBWb3hFbmdpbmUoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGVycilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0NvdWxkIG5vdCBjcmVhdGUgVk9YIGVuZ2luZTonLCBlcnIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQmVnaW5zIHNwZWFraW5nIHRoZSBnaXZlbiBwaHJhc2UgY29tcG9uZW50cyAqL1xyXG4gICAgcHVibGljIHNwZWFrKHBocmFzZTogSFRNTEVsZW1lbnQsIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncyA9IHt9KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLnN0b3AoKTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoIHRoaXMudm94RW5naW5lICYmIGVpdGhlcihzZXR0aW5ncy51c2VWb3gsIFJBRy5jb25maWcudm94RW5hYmxlZCkgKVxyXG4gICAgICAgICAgICB0aGlzLnNwZWFrVm94KHBocmFzZSwgc2V0dGluZ3MpO1xyXG4gICAgICAgIGVsc2UgaWYgKHdpbmRvdy5zcGVlY2hTeW50aGVzaXMpXHJcbiAgICAgICAgICAgIHRoaXMuc3BlYWtCcm93c2VyKHBocmFzZSwgc2V0dGluZ3MpO1xyXG4gICAgICAgIGVsc2UgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdG9wcyBhbmQgY2FuY2VscyBhbGwgcXVldWVkIHNwZWVjaCAqL1xyXG4gICAgcHVibGljIHN0b3AoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBUT0RPOiBDaGVjayBmb3Igc3BlZWNoIHN5bnRoZXNpc1xyXG5cclxuICAgICAgICBpZiAod2luZG93LnNwZWVjaFN5bnRoZXNpcylcclxuICAgICAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5jYW5jZWwoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMudm94RW5naW5lKVxyXG4gICAgICAgICAgICB0aGlzLnZveEVuZ2luZS5zdG9wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBhdXNlIGFuZCB1bnBhdXNlIHNwZWVjaCBpZiB0aGUgcGFnZSBpcyBoaWRkZW4gb3IgdW5oaWRkZW4gKi9cclxuICAgIHByaXZhdGUgb25WaXNpYmlsaXR5Q2hhbmdlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVE9ETzogVGhpcyBuZWVkcyB0byBwYXVzZSBWT1ggZW5naW5lXHJcbiAgICAgICAgbGV0IGhpZGluZyA9IChkb2N1bWVudC52aXNpYmlsaXR5U3RhdGUgPT09ICdoaWRkZW4nKTtcclxuXHJcbiAgICAgICAgaWYgKGhpZGluZykgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5wYXVzZSgpO1xyXG4gICAgICAgIGVsc2UgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMucmVzdW1lKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgYXN5bmMgdm9pY2UgbGlzdCBsb2FkaW5nIG9uIHNvbWUgYnJvd3NlcnMsIGFuZCBzZXRzIGRlZmF1bHQgKi9cclxuICAgIHByaXZhdGUgb25Wb2ljZXNDaGFuZ2VkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5icm93c2VyVm9pY2VzID0gd2luZG93LnNwZWVjaFN5bnRoZXNpcy5nZXRWb2ljZXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbnZlcnRzIHRoZSBnaXZlbiBwaHJhc2UgdG8gdGV4dCBhbmQgc3BlYWtzIGl0IHZpYSBuYXRpdmUgYnJvd3NlciB2b2ljZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBocmFzZSBQaHJhc2UgZWxlbWVudHMgdG8gc3BlYWtcclxuICAgICAqIEBwYXJhbSBzZXR0aW5ncyBTZXR0aW5ncyB0byB1c2UgZm9yIHRoZSB2b2ljZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNwZWFrQnJvd3NlcihwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFJlc2V0IHRvIGZpcnN0IHZvaWNlLCBpZiBjb25maWd1cmVkIGNob2ljZSBpcyBtaXNzaW5nXHJcbiAgICAgICAgbGV0IHZvaWNlSWR4ID0gZWl0aGVyKHNldHRpbmdzLnZvaWNlSWR4LCBSQUcuY29uZmlnLnNwZWVjaFZvaWNlKTtcclxuICAgICAgICBsZXQgdm9pY2UgICAgPSB0aGlzLmJyb3dzZXJWb2ljZXNbdm9pY2VJZHhdIHx8IHRoaXMuYnJvd3NlclZvaWNlc1swXTtcclxuXHJcbiAgICAgICAgLy8gVGhlIHBocmFzZSB0ZXh0IGlzIHNwbGl0IGludG8gc2VudGVuY2VzLCBhcyBxdWV1ZWluZyBsYXJnZSBzZW50ZW5jZXMgdGhhdCBsYXN0XHJcbiAgICAgICAgLy8gbWFueSBzZWNvbmRzIGNhbiBicmVhayBzb21lIFRUUyBlbmdpbmVzIGFuZCBicm93c2Vycy5cclxuICAgICAgICBsZXQgdGV4dCAgPSBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHBocmFzZSk7XHJcbiAgICAgICAgbGV0IHBhcnRzID0gdGV4dC5zcGxpdCgvXFwuXFxzL2kpO1xyXG5cclxuICAgICAgICBwYXJ0cy5mb3JFYWNoKCAoc2VnbWVudCwgaWR4KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gQWRkIG1pc3NpbmcgZnVsbCBzdG9wIHRvIGVhY2ggc2VudGVuY2UgZXhjZXB0IHRoZSBsYXN0LCB3aGljaCBoYXMgaXRcclxuICAgICAgICAgICAgaWYgKGlkeCA8IHBhcnRzLmxlbmd0aCAtIDEpXHJcbiAgICAgICAgICAgICAgICBzZWdtZW50ICs9ICcuJztcclxuXHJcbiAgICAgICAgICAgIGxldCB1dHRlcmFuY2UgPSBuZXcgU3BlZWNoU3ludGhlc2lzVXR0ZXJhbmNlKHNlZ21lbnQpO1xyXG5cclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnZvaWNlICA9IHZvaWNlO1xyXG4gICAgICAgICAgICB1dHRlcmFuY2Uudm9sdW1lID0gZWl0aGVyKHNldHRpbmdzLnZvbHVtZSwgUkFHLmNvbmZpZy5zcGVlY2hWb2wpO1xyXG4gICAgICAgICAgICB1dHRlcmFuY2UucGl0Y2ggID0gZWl0aGVyKHNldHRpbmdzLnBpdGNoLCAgUkFHLmNvbmZpZy5zcGVlY2hQaXRjaCk7XHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS5yYXRlICAgPSBlaXRoZXIoc2V0dGluZ3MucmF0ZSwgICBSQUcuY29uZmlnLnNwZWVjaFJhdGUpO1xyXG5cclxuICAgICAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5zcGVhayh1dHRlcmFuY2UpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBUaGlzIGNoZWNrcyBmb3Igd2hlbiB0aGUgbmF0aXZlIGVuZ2luZSBoYXMgc3RvcHBlZCBzcGVha2luZywgYW5kIGNhbGxzIHRoZVxyXG4gICAgICAgIC8vIG9uc3RvcCBldmVudCBoYW5kbGVyLiBJIGNvdWxkIHVzZSBTcGVlY2hTeW50aGVzaXMub25lbmQgaW5zdGVhZCwgYnV0IGl0IHdhc1xyXG4gICAgICAgIC8vIGZvdW5kIHRvIGJlIHVucmVsaWFibGUsIHNvIEkgaGF2ZSB0byBwb2xsIHRoZSBzcGVha2luZyBwcm9wZXJ0eSB0aGlzIHdheS5cclxuICAgICAgICBjbGVhckludGVydmFsKHRoaXMuc3RvcFRpbWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5zdG9wVGltZXIgPSBzZXRJbnRlcnZhbCgoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuc3BlYWtpbmcpXHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuc3RvcFRpbWVyKTtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9uc3RvcClcclxuICAgICAgICAgICAgICAgIHRoaXMub25zdG9wKCk7XHJcbiAgICAgICAgfSwgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN5bnRoZXNpemVzIHZvaWNlIGJ5IHdhbGtpbmcgdGhyb3VnaCB0aGUgZ2l2ZW4gcGhyYXNlIGVsZW1lbnRzLCByZXNvbHZpbmcgcGFydHMgdG9cclxuICAgICAqIHNvdW5kIGZpbGUgSURzLCBhbmQgZmVlZGluZyB0aGUgZW50aXJlIGFycmF5IHRvIHRoZSB2b3ggZW5naW5lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwaHJhc2UgUGhyYXNlIGVsZW1lbnRzIHRvIHNwZWFrXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgU2V0dGluZ3MgdG8gdXNlIGZvciB0aGUgdm9pY2VcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzcGVha1ZveChwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXNvbHZlciA9IG5ldyBSZXNvbHZlcihwaHJhc2UpO1xyXG4gICAgICAgIGxldCB2b3hQYXRoICA9IFJBRy5jb25maWcudm94UGF0aCB8fCBSQUcuY29uZmlnLnZveEN1c3RvbVBhdGg7XHJcblxyXG4gICAgICAgIHRoaXMudm94RW5naW5lIS5vbnN0b3AgPSAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy52b3hFbmdpbmUhLm9uc3RvcCA9IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9uc3RvcClcclxuICAgICAgICAgICAgICAgIHRoaXMub25zdG9wKCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgc2V0dGluZ3MgZnJvbSBjb25maWcgaGVyZSwgdG8ga2VlcCBWT1ggZW5naW5lIGRlY291cGxlZCBmcm9tIFJBR1xyXG4gICAgICAgIHNldHRpbmdzLnZveFBhdGggICA9IGVpdGhlcihzZXR0aW5ncy52b3hQYXRoLCAgIHZveFBhdGgpO1xyXG4gICAgICAgIHNldHRpbmdzLnZveFJldmVyYiA9IGVpdGhlcihzZXR0aW5ncy52b3hSZXZlcmIsIFJBRy5jb25maWcudm94UmV2ZXJiKTtcclxuICAgICAgICBzZXR0aW5ncy52b3hDaGltZSAgPSBlaXRoZXIoc2V0dGluZ3Mudm94Q2hpbWUsICBSQUcuY29uZmlnLnZveENoaW1lKTtcclxuICAgICAgICBzZXR0aW5ncy52b2x1bWUgICAgPSBlaXRoZXIoc2V0dGluZ3Mudm9sdW1lLCAgICBSQUcuY29uZmlnLnNwZWVjaFZvbCk7XHJcbiAgICAgICAgc2V0dGluZ3MucmF0ZSAgICAgID0gZWl0aGVyKHNldHRpbmdzLnJhdGUsICAgICAgUkFHLmNvbmZpZy5zcGVlY2hSYXRlKTtcclxuXHJcbiAgICAgICAgdGhpcy52b3hFbmdpbmUhLnNwZWFrKHJlc29sdmVyLnRvVm94KCksIHNldHRpbmdzKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xuXG4vKiogVHlwZSBkZWZpbml0aW9uIGZvciBzcGVlY2ggY29uZmlnIG92ZXJyaWRlcyBwYXNzZWQgdG8gdGhlIHNwZWFrIG1ldGhvZCAqL1xuaW50ZXJmYWNlIFNwZWVjaFNldHRpbmdzXG57XG4gICAgLyoqIFdoZXRoZXIgdG8gZm9yY2UgdXNlIG9mIHRoZSBWT1ggZW5naW5lICovXG4gICAgdXNlVm94PyAgICA6IGJvb2xlYW47XG4gICAgLyoqIE92ZXJyaWRlIGFic29sdXRlIG9yIHJlbGF0aXZlIFVSTCBvZiBWT1ggdm9pY2UgdG8gdXNlICovXG4gICAgdm94UGF0aD8gICA6IHN0cmluZztcbiAgICAvKiogT3ZlcnJpZGUgY2hvaWNlIG9mIHJldmVyYiB0byB1c2UgKi9cbiAgICB2b3hSZXZlcmI/IDogc3RyaW5nO1xuICAgIC8qKiBPdmVycmlkZSBjaG9pY2Ugb2YgY2hpbWUgdG8gdXNlICovXG4gICAgdm94Q2hpbWU/ICA6IHN0cmluZztcbiAgICAvKiogT3ZlcnJpZGUgY2hvaWNlIG9mIHZvaWNlICovXG4gICAgdm9pY2VJZHg/ICA6IG51bWJlcjtcbiAgICAvKiogT3ZlcnJpZGUgdm9sdW1lIG9mIHZvaWNlICovXG4gICAgdm9sdW1lPyAgICA6IG51bWJlcjtcbiAgICAvKiogT3ZlcnJpZGUgcGl0Y2ggb2Ygdm9pY2UgKi9cbiAgICBwaXRjaD8gICAgIDogbnVtYmVyO1xuICAgIC8qKiBPdmVycmlkZSByYXRlIG9mIHZvaWNlICovXG4gICAgcmF0ZT8gICAgICA6IG51bWJlcjtcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbnR5cGUgVm94S2V5ID0gc3RyaW5nIHwgbnVtYmVyO1xyXG5cclxuLyoqIFN5bnRoZXNpemVzIHNwZWVjaCBieSBkeW5hbWljYWxseSBsb2FkaW5nIGFuZCBwaWVjaW5nIHRvZ2V0aGVyIHZvaWNlIGZpbGVzICovXHJcbmNsYXNzIFZveEVuZ2luZVxyXG57XHJcbiAgICAvKiogVGhlIGNvcmUgYXVkaW8gY29udGV4dCB0aGF0IGhhbmRsZXMgYXVkaW8gZWZmZWN0cyBhbmQgcGxheWJhY2sgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYXVkaW9Db250ZXh0IDogQXVkaW9Db250ZXh0O1xyXG4gICAgLyoqIEF1ZGlvIG5vZGUgdGhhdCBhbXBsaWZpZXMgb3IgYXR0ZW51YXRlcyB2b2ljZSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBnYWluTm9kZSAgICAgOiBHYWluTm9kZTtcclxuICAgIC8qKiBBdWRpbyBub2RlIHRoYXQgYXBwbGllcyB0aGUgdGFubm95IGZpbHRlciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBmaWx0ZXJOb2RlICAgOiBCaXF1YWRGaWx0ZXJOb2RlO1xyXG4gICAgLyoqIEF1ZGlvIG5vZGUgdGhhdCBhZGRzIGEgcmV2ZXJiIHRvIHRoZSB2b2ljZSwgaWYgYXZhaWxhYmxlICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHJldmVyYk5vZGUgICA6IENvbnZvbHZlck5vZGU7XHJcbiAgICAvKiogQ2FjaGUgb2YgaW1wdWxzZSByZXNwb25zZXMgYXVkaW8gZGF0YSwgZm9yIHJldmVyYiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbXB1bHNlcyAgICAgOiBEaWN0aW9uYXJ5PEF1ZGlvQnVmZmVyPiA9IHt9O1xyXG4gICAgLyoqIFJlbGF0aXZlIHBhdGggdG8gZmV0Y2ggaW1wdWxzZSByZXNwb25zZSBhbmQgY2hpbWUgZmlsZXMgZnJvbSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkYXRhUGF0aCAgICAgOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGhhcyBlbmRlZCAqL1xyXG4gICAgcHVibGljICBvbnN0b3A/ICAgICAgICAgIDogKCkgPT4gdm9pZDtcclxuICAgIC8qKiBXaGV0aGVyIHRoaXMgZW5naW5lIGlzIGN1cnJlbnRseSBydW5uaW5nIGFuZCBzcGVha2luZyAqL1xyXG4gICAgcHJpdmF0ZSBpc1NwZWFraW5nICAgICAgIDogYm9vbGVhbiAgICAgID0gZmFsc2U7XHJcbiAgICAvKiogUmVmZXJlbmNlIG51bWJlciBmb3IgdGhlIGN1cnJlbnQgcHVtcCB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSBwdW1wVGltZXIgICAgICAgIDogbnVtYmVyICAgICAgID0gMDtcclxuICAgIC8qKiBUcmFja3MgdGhlIGF1ZGlvIGNvbnRleHQncyB3YWxsLWNsb2NrIHRpbWUgdG8gc2NoZWR1bGUgbmV4dCBjbGlwICovXHJcbiAgICBwcml2YXRlIG5leHRCZWdpbiAgICAgICAgOiBudW1iZXIgICAgICAgPSAwO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gY3VycmVudGx5IHBlbmRpbmcgcmVxdWVzdHMsIGFzIGEgRklGTyBxdWV1ZSAqL1xyXG4gICAgcHJpdmF0ZSBwZW5kaW5nUmVxcyAgICAgIDogVm94UmVxdWVzdFtdID0gW107XHJcbiAgICAvKiogUmVmZXJlbmNlcyB0byBjdXJyZW50bHkgc2NoZWR1bGVkIGF1ZGlvIGJ1ZmZlcnMgKi9cclxuICAgIHByaXZhdGUgc2NoZWR1bGVkQnVmZmVycyA6IEF1ZGlvQnVmZmVyU291cmNlTm9kZVtdID0gW107XHJcbiAgICAvKiogTGlzdCBvZiB2b3ggSURzIGN1cnJlbnRseSBiZWluZyBydW4gdGhyb3VnaCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50SWRzPyAgICAgIDogVm94S2V5W107XHJcbiAgICAvKiogU3BlZWNoIHNldHRpbmdzIGN1cnJlbnRseSBiZWluZyB1c2VkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRTZXR0aW5ncz8gOiBTcGVlY2hTZXR0aW5ncztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoZGF0YVBhdGg6IHN0cmluZyA9ICdkYXRhL3ZveCcpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2V0dXAgdGhlIGNvcmUgYXVkaW8gY29udGV4dFxyXG5cclxuICAgICAgICAvLyBAdHMtaWdub3JlIC0gRGVmaW5pbmcgdGhlc2UgaW4gV2luZG93IGludGVyZmFjZSBkb2VzIG5vdCB3b3JrXHJcbiAgICAgICAgbGV0IGF1ZGlvQ29udGV4dCAgPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XHJcbiAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQgPSBuZXcgYXVkaW9Db250ZXh0KCk7XHJcblxyXG4gICAgICAgIGlmICghdGhpcy5hdWRpb0NvbnRleHQpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGdldCBhdWRpbyBjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIC8vIFNldHVwIG5vZGVzXHJcblxyXG4gICAgICAgIHRoaXMuZGF0YVBhdGggICA9IGRhdGFQYXRoO1xyXG4gICAgICAgIHRoaXMuZ2Fpbk5vZGUgICA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKTtcclxuICAgICAgICB0aGlzLmZpbHRlck5vZGUgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCaXF1YWRGaWx0ZXIoKTtcclxuICAgICAgICB0aGlzLnJldmVyYk5vZGUgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVDb252b2x2ZXIoKTtcclxuXHJcbiAgICAgICAgdGhpcy5yZXZlcmJOb2RlLm5vcm1hbGl6ZSA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlLnR5cGUgICAgICA9ICdoaWdocGFzcyc7XHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlLlEudmFsdWUgICA9IDAuNDtcclxuXHJcbiAgICAgICAgdGhpcy5nYWluTm9kZS5jb25uZWN0KHRoaXMuZmlsdGVyTm9kZSk7XHJcbiAgICAgICAgLy8gUmVzdCBvZiBub2RlcyBnZXQgY29ubmVjdGVkIHdoZW4gc3BlYWsgaXMgY2FsbGVkXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCZWdpbnMgbG9hZGluZyBhbmQgc3BlYWtpbmcgYSBzZXQgb2Ygdm94IGZpbGVzLiBTdG9wcyBhbnkgc3BlZWNoLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZHMgTGlzdCBvZiB2b3ggaWRzIHRvIGxvYWQgYXMgZmlsZXMsIGluIHNwZWFraW5nIG9yZGVyXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgVm9pY2Ugc2V0dGluZ3MgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzcGVhayhpZHM6IFZveEtleVtdLCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBTUEVBSzonLCBpZHMsIHNldHRpbmdzKTtcclxuXHJcbiAgICAgICAgLy8gU2V0IHN0YXRlXHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlzU3BlYWtpbmcpXHJcbiAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgICAgICA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50SWRzICAgICAgPSBpZHM7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50U2V0dGluZ3MgPSBzZXR0aW5ncztcclxuXHJcbiAgICAgICAgLy8gU2V0IHJldmVyYlxyXG5cclxuICAgICAgICBpZiAoIFN0cmluZ3MuaXNOdWxsT3JFbXB0eShzZXR0aW5ncy52b3hSZXZlcmIpIClcclxuICAgICAgICAgICAgdGhpcy50b2dnbGVSZXZlcmIoZmFsc2UpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBmaWxlICAgID0gc2V0dGluZ3Mudm94UmV2ZXJiITtcclxuICAgICAgICAgICAgbGV0IGltcHVsc2UgPSB0aGlzLmltcHVsc2VzW2ZpbGVdO1xyXG5cclxuICAgICAgICAgICAgaWYgKCFpbXB1bHNlKVxyXG4gICAgICAgICAgICAgICAgZmV0Y2goYCR7dGhpcy5kYXRhUGF0aH0vJHtmaWxlfWApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIHJlcyA9PiByZXMuYXJyYXlCdWZmZXIoKSApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIGJ1ZiA9PiBTb3VuZHMuZGVjb2RlKHRoaXMuYXVkaW9Db250ZXh0LCBidWYpIClcclxuICAgICAgICAgICAgICAgICAgICAudGhlbiggaW1wID0+XHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDYWNoZSBidWZmZXIgZm9yIGxhdGVyXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW1wdWxzZXNbZmlsZV0gICAgPSBpbXA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmV2ZXJiTm9kZS5idWZmZXIgPSBpbXA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudG9nZ2xlUmV2ZXJiKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggUkVWRVJCIExPQURFRCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucmV2ZXJiTm9kZS5idWZmZXIgPSBpbXB1bHNlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50b2dnbGVSZXZlcmIodHJ1ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNldCB2b2x1bWVcclxuXHJcbiAgICAgICAgbGV0IHZvbHVtZSA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsIDEpO1xyXG5cclxuICAgICAgICAvLyBSZW1hcHMgdGhlIDEuMS4uLjEuOSByYW5nZSB0byAyLi4uMTBcclxuICAgICAgICBpZiAodm9sdW1lID4gMSlcclxuICAgICAgICAgICAgdm9sdW1lID0gKHZvbHVtZSAqIDEwKSAtIDk7XHJcblxyXG4gICAgICAgIHRoaXMuZ2Fpbk5vZGUuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcclxuXHJcbiAgICAgICAgLy8gU2V0IGNoaW1lLCBhdCBmb3JjZWQgcGxheWJhY2sgcmF0ZSBvZiAxXHJcblxyXG4gICAgICAgIGlmICggIVN0cmluZ3MuaXNOdWxsT3JFbXB0eShzZXR0aW5ncy52b3hDaGltZSkgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHBhdGggICAgICA9IGAke3RoaXMuZGF0YVBhdGh9LyR7c2V0dGluZ3Mudm94Q2hpbWUhfWA7XHJcbiAgICAgICAgICAgIGxldCByZXEgICAgICAgPSBuZXcgVm94UmVxdWVzdChwYXRoLCAwLCB0aGlzLmF1ZGlvQ29udGV4dCk7XHJcbiAgICAgICAgICAgIHJlcS5mb3JjZVJhdGUgPSAxO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5wZW5kaW5nUmVxcy5wdXNoKHJlcSk7XHJcbiAgICAgICAgICAgIGlkcy51bnNoaWZ0KDEuMCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBCZWdpbiB0aGUgcHVtcCBsb29wLiBPbiBpT1MsIHRoZSBjb250ZXh0IG1heSBoYXZlIHRvIGJlIHJlc3VtZWQgZmlyc3RcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0LnN0YXRlID09PSAnc3VzcGVuZGVkJylcclxuICAgICAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQucmVzdW1lKCkudGhlbiggKCkgPT4gdGhpcy5wdW1wKCkgKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMucHVtcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdG9wcyBwbGF5aW5nIGFueSBjdXJyZW50bHkgc3Bva2VuIHNwZWVjaCBhbmQgcmVzZXRzIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIEFscmVhZHkgc3RvcHBlZD8gRG8gbm90IGNvbnRpbnVlXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzU3BlYWtpbmcpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gU3RvcCBwdW1waW5nXHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMucHVtcFRpbWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5pc1NwZWFraW5nID0gZmFsc2U7XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbGwgcGVuZGluZyByZXF1ZXN0c1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXMuZm9yRWFjaCggciA9PiByLmNhbmNlbCgpICk7XHJcblxyXG4gICAgICAgIC8vIEtpbGwgYW5kIGRlcmVmZXJlbmNlIGFueSBjdXJyZW50bHkgcGxheWluZyBmaWxlXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzLmZvckVhY2gobm9kZSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbm9kZS5zdG9wKCk7XHJcbiAgICAgICAgICAgIG5vZGUuZGlzY29ubmVjdCgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm5leHRCZWdpbiAgICAgICAgPSAwO1xyXG4gICAgICAgIHRoaXMuY3VycmVudElkcyAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyAgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVxcyAgICAgID0gW107XHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzID0gW107XHJcblxyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBTVE9QUEVEJyk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm9uc3RvcClcclxuICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFB1bXBzIHRoZSBzcGVlY2ggcXVldWUsIGJ5IGtlZXBpbmcgdXAgdG8gMTAgZmV0Y2ggcmVxdWVzdHMgZm9yIHZvaWNlIGZpbGVzIGdvaW5nLFxyXG4gICAgICogYW5kIHRoZW4gZmVlZGluZyB0aGVpciBkYXRhIChpbiBlbmZvcmNlZCBvcmRlcikgdG8gdGhlIGF1ZGlvIGNoYWluLCBvbmUgYXQgYSB0aW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHB1bXAoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBJZiB0aGUgZW5naW5lIGhhcyBzdG9wcGVkLCBkbyBub3QgcHJvY2VlZC5cclxuICAgICAgICBpZiAoIXRoaXMuaXNTcGVha2luZyB8fCAhdGhpcy5jdXJyZW50SWRzIHx8ICF0aGlzLmN1cnJlbnRTZXR0aW5ncylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGaXJzdCwgc2NoZWR1bGUgZnVsZmlsbGVkIHJlcXVlc3RzIGludG8gdGhlIGF1ZGlvIGJ1ZmZlciwgaW4gRklGTyBvcmRlclxyXG4gICAgICAgIHRoaXMuc2NoZWR1bGUoKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgZmlsbCBhbnkgZnJlZSBwZW5kaW5nIHNsb3RzIHdpdGggbmV3IHJlcXVlc3RzXHJcbiAgICAgICAgbGV0IG5leHREZWxheSA9IDA7XHJcblxyXG4gICAgICAgIHdoaWxlICh0aGlzLmN1cnJlbnRJZHNbMF0gJiYgdGhpcy5wZW5kaW5nUmVxcy5sZW5ndGggPCAxMClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSB0aGlzLmN1cnJlbnRJZHMuc2hpZnQoKSE7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiB0aGlzIGtleSBpcyBhIG51bWJlciwgaXQncyBhbiBhbW91bnQgb2Ygc2lsZW5jZSwgc28gYWRkIGl0IGFzIHRoZVxyXG4gICAgICAgICAgICAvLyBwbGF5YmFjayBkZWxheSBmb3IgdGhlIG5leHQgcGxheWFibGUgcmVxdWVzdCAoaWYgYW55KS5cclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBrZXkgPT09ICdudW1iZXInKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuZXh0RGVsYXkgKz0ga2V5O1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGxldCBwYXRoID0gYCR7dGhpcy5jdXJyZW50U2V0dGluZ3Mudm94UGF0aH0vJHtrZXl9Lm1wM2A7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdSZXFzLnB1c2goIG5ldyBWb3hSZXF1ZXN0KHBhdGgsIG5leHREZWxheSwgdGhpcy5hdWRpb0NvbnRleHQpICk7XHJcbiAgICAgICAgICAgIG5leHREZWxheSA9IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmcgd2hlbiB3ZSdyZSBvdXQgb2YgSURzIHRvIHF1ZXVlIGFuZCBub3RoaW5nIGlzIHBsYXlpbmdcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50SWRzLmxlbmd0aCAgICAgICA8PSAwKVxyXG4gICAgICAgIGlmICh0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCAgICAgIDw9IDApXHJcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGVkQnVmZmVycy5sZW5ndGggPD0gMClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLnB1bXBUaW1lciA9IHNldFRpbWVvdXQodGhpcy5wdW1wLmJpbmQodGhpcyksIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzY2hlZHVsZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFN0b3Agc2NoZWR1bGluZyBpZiB0aGVyZSBhcmUgbm8gcGVuZGluZyByZXF1ZXN0c1xyXG4gICAgICAgIGlmICghdGhpcy5wZW5kaW5nUmVxc1swXSB8fCAhdGhpcy5wZW5kaW5nUmVxc1swXS5pc0RvbmUpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gRG9uJ3Qgc2NoZWR1bGUgaWYgbW9yZSB0aGFuIDUgbm9kZXMgYXJlLCBhcyBub3QgdG8gYmxvdyBhbnkgYnVmZmVyc1xyXG4gICAgICAgIGlmICh0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMubGVuZ3RoID4gNSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgcmVxID0gdGhpcy5wZW5kaW5nUmVxcy5zaGlmdCgpITtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlIG5leHQgcmVxdWVzdCBlcnJvcmVkIG91dCAoYnVmZmVyIG1pc3NpbmcpLCBza2lwIGl0XHJcbiAgICAgICAgaWYgKCFyZXEuYnVmZmVyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBDTElQIFNLSVBQRUQ6JywgcmVxLnBhdGgpO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zY2hlZHVsZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhpcyBpcyB0aGUgZmlyc3QgY2xpcCBiZWluZyBwbGF5ZWQsIHN0YXJ0IGZyb20gY3VycmVudCB3YWxsLWNsb2NrXHJcbiAgICAgICAgaWYgKHRoaXMubmV4dEJlZ2luID09PSAwKVxyXG4gICAgICAgICAgICB0aGlzLm5leHRCZWdpbiA9IHRoaXMuYXVkaW9Db250ZXh0LmN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgUVVFVUVEOicsIHJlcS5wYXRoLCByZXEuYnVmZmVyLmR1cmF0aW9uLCB0aGlzLm5leHRCZWdpbik7XHJcblxyXG4gICAgICAgIC8vIEJhc2UgbGF0ZW5jeSBub3QgYXZhaWxhYmxlIGluIHNvbWUgYnJvd3NlcnNcclxuICAgICAgICBsZXQgbGF0ZW5jeSA9ICh0aGlzLmF1ZGlvQ29udGV4dC5iYXNlTGF0ZW5jeSB8fCAwLjAxKSArIDAuMTU7XHJcbiAgICAgICAgbGV0IG5vZGUgICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcclxuICAgICAgICBsZXQgcmF0ZSAgICA9IHJlcS5mb3JjZVJhdGUgfHwgdGhpcy5jdXJyZW50U2V0dGluZ3MhLnJhdGUgfHwgMTtcclxuICAgICAgICBub2RlLmJ1ZmZlciA9IHJlcS5idWZmZXI7XHJcblxyXG4gICAgICAgIC8vIFJlbWFwIHJhdGUgZnJvbSAwLjEuLjEuOSB0byAwLjguLjEuNVxyXG4gICAgICAgIGlmICAgICAgKHJhdGUgPCAxKSByYXRlID0gKHJhdGUgKiAwLjIpICsgMC44O1xyXG4gICAgICAgIGVsc2UgaWYgKHJhdGUgPiAxKSByYXRlID0gKHJhdGUgKiAwLjUpICsgMC41O1xyXG5cclxuICAgICAgICAvLyBDYWxjdWxhdGUgZGVsYXkgYW5kIGR1cmF0aW9uIGJhc2VkIG9uIHBsYXliYWNrIHJhdGVcclxuICAgICAgICBsZXQgZGVsYXkgICAgPSByZXEuZGVsYXkgKiAoMSAvIHJhdGUpO1xyXG4gICAgICAgIGxldCBkdXJhdGlvbiA9IG5vZGUuYnVmZmVyLmR1cmF0aW9uICogKDEgLyByYXRlKTtcclxuXHJcbiAgICAgICAgbm9kZS5wbGF5YmFja1JhdGUudmFsdWUgPSByYXRlO1xyXG4gICAgICAgIG5vZGUuY29ubmVjdCh0aGlzLmdhaW5Ob2RlKTtcclxuICAgICAgICBub2RlLnN0YXJ0KHRoaXMubmV4dEJlZ2luICsgZGVsYXkpO1xyXG5cclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMucHVzaChub2RlKTtcclxuICAgICAgICB0aGlzLm5leHRCZWdpbiArPSAoZHVyYXRpb24gKyBkZWxheSAtIGxhdGVuY3kpO1xyXG5cclxuICAgICAgICAvLyBIYXZlIHRoaXMgYnVmZmVyIG5vZGUgcmVtb3ZlIGl0c2VsZiBmcm9tIHRoZSBzY2hlZHVsZSB3aGVuIGRvbmVcclxuICAgICAgICBub2RlLm9uZW5kZWQgPSBfID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgRU5ERUQ6JywgcmVxLnBhdGgpO1xyXG4gICAgICAgICAgICBsZXQgaWR4ID0gdGhpcy5zY2hlZHVsZWRCdWZmZXJzLmluZGV4T2Yobm9kZSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoaWR4ICE9PSAtMSlcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycy5zcGxpY2UoaWR4LCAxKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdG9nZ2xlUmV2ZXJiKHN0YXRlOiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLnJldmVyYk5vZGUuZGlzY29ubmVjdCgpO1xyXG4gICAgICAgIHRoaXMuZmlsdGVyTm9kZS5kaXNjb25uZWN0KCk7XHJcblxyXG4gICAgICAgIGlmIChzdGF0ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyTm9kZS5jb25uZWN0KHRoaXMucmV2ZXJiTm9kZSk7XHJcbiAgICAgICAgICAgIHRoaXMucmV2ZXJiTm9kZS5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmZpbHRlck5vZGUuY29ubmVjdCh0aGlzLmF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgcmVxdWVzdCBmb3IgYSB2b3ggZmlsZSwgaW1tZWRpYXRlbHkgYmVndW4gb24gY3JlYXRpb24gKi9cclxuY2xhc3MgVm94UmVxdWVzdFxyXG57XHJcbiAgICAvKiogUmVsYXRpdmUgcmVtb3RlIHBhdGggb2YgdGhpcyB2b2ljZSBmaWxlIHJlcXVlc3QgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgcGF0aCAgICA6IHN0cmluZztcclxuICAgIC8qKiBBbW91bnQgb2Ygc2Vjb25kcyB0byBkZWxheSB0aGUgcGxheWJhY2sgb2YgdGhpcyByZXF1ZXN0ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGRlbGF5ICAgOiBudW1iZXI7XHJcbiAgICAvKiogQXVkaW8gY29udGV4dCB0byB1c2UgZm9yIGRlY29kaW5nICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQgOiBBdWRpb0NvbnRleHQ7XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgdGhpcyByZXF1ZXN0IGlzIGRvbmUgYW5kIHJlYWR5IGZvciBoYW5kbGluZyAoZXZlbiBpZiBmYWlsZWQpICovXHJcbiAgICBwdWJsaWMgaXNEb25lICAgICA6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIC8qKiBSYXcgYXVkaW8gZGF0YSBmcm9tIHRoZSBsb2FkZWQgZmlsZSwgaWYgYXZhaWxhYmxlICovXHJcbiAgICBwdWJsaWMgYnVmZmVyPyAgICA6IEF1ZGlvQnVmZmVyO1xyXG4gICAgLyoqIFBsYXliYWNrIHJhdGUgdG8gZm9yY2UgdGhpcyBjbGlwIHRvIHBsYXkgYXQgKi9cclxuICAgIHB1YmxpYyBmb3JjZVJhdGU/IDogbnVtYmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihwYXRoOiBzdHJpbmcsIGRlbGF5OiBudW1iZXIsIGNvbnRleHQ6IEF1ZGlvQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggUkVRVUVTVDonLCBwYXRoKTtcclxuICAgICAgICB0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xyXG4gICAgICAgIHRoaXMucGF0aCAgICA9IHBhdGg7XHJcbiAgICAgICAgdGhpcy5kZWxheSAgID0gZGVsYXk7XHJcblxyXG4gICAgICAgIGZldGNoKHBhdGgpXHJcbiAgICAgICAgICAgIC50aGVuICggdGhpcy5vbkZ1bGZpbGwuYmluZCh0aGlzKSApXHJcbiAgICAgICAgICAgIC5jYXRjaCggdGhpcy5vbkVycm9yLmJpbmQodGhpcykgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYW5jZWxzIHRoaXMgcmVxdWVzdCBmcm9tIHByb2NlZWRpbmcgYW55IGZ1cnRoZXIgKi9cclxuICAgIHB1YmxpYyBjYW5jZWwoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBUT0RPOiBDYW5jZWxsYXRpb24gY29udHJvbGxlcnNcclxuICAgIH1cclxuXHJcbiAgICAvKiogQmVnaW5zIGRlY29kaW5nIHRoZSBsb2FkZWQgTVAzIHZvaWNlIGZpbGUgdG8gcmF3IGF1ZGlvIGRhdGEgKi9cclxuICAgIHByaXZhdGUgb25GdWxmaWxsKHJlczogUmVzcG9uc2UpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghcmVzLm9rKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcihgVk9YIE5PVCBGT1VORDogJHtyZXMuc3RhdHVzfSBAICR7dGhpcy5wYXRofWApO1xyXG5cclxuICAgICAgICByZXMuYXJyYXlCdWZmZXIoKS50aGVuKCB0aGlzLm9uQXJyYXlCdWZmZXIuYmluZCh0aGlzKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBUYWtlcyB0aGUgYXJyYXkgYnVmZmVyIGZyb20gdGhlIGZ1bGZpbGxlZCBmZXRjaCBhbmQgZGVjb2RlcyBpdCAqL1xyXG4gICAgcHJpdmF0ZSBvbkFycmF5QnVmZmVyKGJ1ZmZlcjogQXJyYXlCdWZmZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFNvdW5kcy5kZWNvZGUodGhpcy5jb250ZXh0LCBidWZmZXIpXHJcbiAgICAgICAgICAgIC50aGVuICggdGhpcy5vbkRlY29kZS5iaW5kKHRoaXMpIClcclxuICAgICAgICAgICAgLmNhdGNoKCB0aGlzLm9uRXJyb3IuYmluZCh0aGlzKSAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2FsbGVkIHdoZW4gdGhlIGZldGNoZWQgYnVmZmVyIGlzIGRlY29kZWQgc3VjY2Vzc2Z1bGx5ICovXHJcbiAgICBwcml2YXRlIG9uRGVjb2RlKGJ1ZmZlcjogQXVkaW9CdWZmZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuYnVmZmVyID0gYnVmZmVyO1xyXG4gICAgICAgIHRoaXMuaXNEb25lID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2FsbGVkIGlmIHRoZSBmZXRjaCBvciBkZWNvZGUgc3RhZ2VzIGZhaWwgKi9cclxuICAgIHByaXZhdGUgb25FcnJvcihlcnI6IGFueSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1JFUVVFU1QgRkFJTDonLCBlcnIpO1xyXG4gICAgICAgIHRoaXMuaXNEb25lID0gdHJ1ZTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8gVE9ETzogTWFrZSBhbGwgdmlld3MgdXNlIHRoaXMgY2xhc3NcclxuLyoqIEJhc2UgY2xhc3MgZm9yIGEgdmlldzsgYW55dGhpbmcgd2l0aCBhIGJhc2UgRE9NIGVsZW1lbnQgKi9cclxuYWJzdHJhY3QgY2xhc3MgQmFzZVZpZXdcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHZpZXcncyBwcmltYXJ5IERPTSBlbGVtZW50ICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgdGhpcyBiYXNlIHZpZXcsIGF0dGFjaGluZyBpdCB0byB0aGUgZWxlbWVudCBtYXRjaGluZyB0aGUgZ2l2ZW4gcXVlcnkgKi9cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3Rvcihkb21RdWVyeTogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tID0gRE9NLnJlcXVpcmUoZG9tUXVlcnkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoaXMgdmlldydzIGNoaWxkIGVsZW1lbnQgbWF0Y2hpbmcgdGhlIGdpdmVuIHF1ZXJ5ICovXHJcbiAgICBwcm90ZWN0ZWQgYXR0YWNoPFQgZXh0ZW5kcyBIVE1MRWxlbWVudD4ocXVlcnk6IHN0cmluZykgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIERPTS5yZXF1aXJlKHF1ZXJ5LCB0aGlzLmRvbSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGhyYXNlIGVkaXRvciAqL1xyXG5jbGFzcyBFZGl0b3Jcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIGNvbnRhaW5lciBmb3IgdGhlIGVkaXRvciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgZGlhbG9nLCBpZiBhbnkgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFBpY2tlcj8gOiBQaWNrZXI7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2UgZWxlbWVudCBjdXJyZW50bHkgYmVpbmcgZWRpdGVkLCBpZiBhbnkgKi9cclxuICAgIC8vIERvIG5vdCBEUlk7IG5lZWRzIHRvIGJlIHBhc3NlZCB0byB0aGUgcGlja2VyIGZvciBjbGVhbmVyIGNvZGVcclxuICAgIHByaXZhdGUgZG9tRWRpdGluZz8gICAgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tID0gRE9NLnJlcXVpcmUoJyNlZGl0b3InKTtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5vbmNsaWNrID0gdGhpcy5vbkNsaWNrLmJpbmQodGhpcyk7XHJcbiAgICAgICAgd2luZG93Lm9ucmVzaXplICAgICAgID0gdGhpcy5vblJlc2l6ZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tLm9uc2Nyb2xsICAgICA9IHRoaXMub25TY3JvbGwuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbS50ZXh0Q29udGVudCAgPSBMLkVESVRPUl9JTklUKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcGxhY2VzIHRoZSBlZGl0b3Igd2l0aCBhIHJvb3QgcGhyYXNlc2V0IHJlZmVyZW5jZSwgYW5kIGV4cGFuZHMgaXQgaW50byBIVE1MICovXHJcbiAgICBwdWJsaWMgZ2VuZXJhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5pbm5lckhUTUwgPSAnPHBocmFzZXNldCByZWY9XCJyb290XCIgLz4nO1xyXG5cclxuICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgLy8gRm9yIHNjcm9sbC1wYXN0IHBhZGRpbmcgdW5kZXIgdGhlIHBocmFzZVxyXG4gICAgICAgIGxldCBwYWRkaW5nICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG4gICAgICAgIHBhZGRpbmcuY2xhc3NOYW1lID0gJ2JvdHRvbVBhZGRpbmcnO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5hcHBlbmRDaGlsZChwYWRkaW5nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVwcm9jZXNzZXMgYWxsIHBocmFzZXNldCBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gcmVmLCBpZiB0aGVpciBpbmRleCBoYXMgY2hhbmdlZCAqL1xyXG4gICAgcHVibGljIHJlZnJlc2hQaHJhc2VzZXQocmVmOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIE5vdGUsIHRoaXMgY291bGQgcG90ZW50aWFsbHkgYnVnIG91dCBpZiBhIHBocmFzZXNldCdzIGRlc2NlbmRhbnQgcmVmZXJlbmNlc1xyXG4gICAgICAgIC8vIHRoZSBzYW1lIHBocmFzZXNldCAocmVjdXJzaW9uKS4gQnV0IHRoaXMgaXMgb2theSBiZWNhdXNlIHBocmFzZXNldHMgc2hvdWxkXHJcbiAgICAgICAgLy8gbmV2ZXIgaW5jbHVkZSB0aGVtc2VsdmVzLCBldmVuIGV2ZW50dWFsbHkuXHJcblxyXG4gICAgICAgIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoYHNwYW5bZGF0YS10eXBlPXBocmFzZXNldF1bZGF0YS1yZWY9JHtyZWZ9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKF8gPT5cclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnQgICAgPSBfIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgbGV0IG5ld0VsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwaHJhc2VzZXQnKTtcclxuICAgICAgICAgICAgICAgIGxldCBjaGFuY2UgICAgID0gZWxlbWVudC5kYXRhc2V0WydjaGFuY2UnXTtcclxuXHJcbiAgICAgICAgICAgICAgICBuZXdFbGVtZW50LnNldEF0dHJpYnV0ZSgncmVmJywgcmVmKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoY2hhbmNlKVxyXG4gICAgICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQuc2V0QXR0cmlidXRlKCdjaGFuY2UnLCBjaGFuY2UpO1xyXG5cclxuICAgICAgICAgICAgICAgIGVsZW1lbnQucGFyZW50RWxlbWVudCEucmVwbGFjZUNoaWxkKG5ld0VsZW1lbnQsIGVsZW1lbnQpO1xyXG4gICAgICAgICAgICAgICAgUkFHLnBocmFzZXIucHJvY2VzcyhuZXdFbGVtZW50LnBhcmVudEVsZW1lbnQhKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgc3RhdGljIE5vZGVMaXN0IG9mIGFsbCBwaHJhc2UgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHF1ZXJ5LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBxdWVyeSBRdWVyeSBzdHJpbmcgdG8gYWRkIG9udG8gdGhlIGBzcGFuYCBzZWxlY3RvclxyXG4gICAgICogQHJldHVybnMgTm9kZSBsaXN0IG9mIGFsbCBlbGVtZW50cyBtYXRjaGluZyB0aGUgZ2l2ZW4gc3BhbiBxdWVyeVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0RWxlbWVudHNCeVF1ZXJ5KHF1ZXJ5OiBzdHJpbmcpIDogTm9kZUxpc3RcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChgc3BhbiR7cXVlcnl9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGN1cnJlbnQgcGhyYXNlJ3Mgcm9vdCBET00gZWxlbWVudCAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZSgpIDogSFRNTEVsZW1lbnRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20uZmlyc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGN1cnJlbnQgcGhyYXNlIGluIHRoZSBlZGl0b3IgYXMgdGV4dCwgZXhjbHVkaW5nIHRoZSBoaWRkZW4gcGFydHMgKi9cclxuICAgIHB1YmxpYyBnZXRUZXh0KCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dCh0aGlzLmRvbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyBhbGwgcGhyYXNlIGVsZW1lbnRzIG9mIHRoZSBnaXZlbiB0eXBlLCBhbmQgc2V0cyB0aGVpciB0ZXh0IHRvIGdpdmVuIHZhbHVlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0eXBlIE9yaWdpbmFsIFhNTCBuYW1lIG9mIGVsZW1lbnRzIHRvIHJlcGxhY2UgY29udGVudHMgb2ZcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBOZXcgdGV4dCBmb3IgdGhlIGZvdW5kIGVsZW1lbnRzIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0RWxlbWVudHNUZXh0KHR5cGU6IHN0cmluZywgdmFsdWU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9JHt0eXBlfV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlcyBhbnkgY3VycmVudGx5IG9wZW4gZWRpdG9yIGRpYWxvZ3MgKi9cclxuICAgIHB1YmxpYyBjbG9zZURpYWxvZygpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRQaWNrZXIpXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpY2tlci5jbG9zZSgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5kb21FZGl0aW5nKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLnJlbW92ZUF0dHJpYnV0ZSgnZWRpdGluZycpO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LnJlbW92ZSgnYWJvdmUnLCAnYmVsb3cnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFBpY2tlciA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLmRvbUVkaXRpbmcgICAgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgYSBjbGljayBhbnl3aGVyZSBpbiB0aGUgd2luZG93IGRlcGVuZGluZyBvbiB0aGUgY29udGV4dCAqL1xyXG4gICAgcHJpdmF0ZSBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgdGFyZ2V0ID0gZXYudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCB0eXBlICAgPSB0YXJnZXQgPyB0YXJnZXQuZGF0YXNldFsndHlwZSddICAgIDogdW5kZWZpbmVkO1xyXG4gICAgICAgIGxldCBwaWNrZXIgPSB0eXBlICAgPyBSQUcudmlld3MuZ2V0UGlja2VyKHR5cGUpIDogdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICBpZiAoIXRhcmdldClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2xvc2VEaWFsb2coKTtcclxuXHJcbiAgICAgICAgLy8gUmVkaXJlY3QgY2xpY2tzIG9mIGlubmVyIGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKCB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdpbm5lcicpICYmIHRhcmdldC5wYXJlbnRFbGVtZW50IClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRhcmdldCA9IHRhcmdldC5wYXJlbnRFbGVtZW50O1xyXG4gICAgICAgICAgICB0eXBlICAgPSB0YXJnZXQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgICAgICBwaWNrZXIgPSB0eXBlID8gUkFHLnZpZXdzLmdldFBpY2tlcih0eXBlKSA6IHVuZGVmaW5lZDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3MgdG8gYW55IGlubmVyIGRvY3VtZW50IG9yIHVub3duZWQgZWxlbWVudFxyXG4gICAgICAgIGlmICggIWRvY3VtZW50LmJvZHkuY29udGFpbnModGFyZ2V0KSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSWdub3JlIGNsaWNrcyB0byBhbnkgZWxlbWVudCBvZiBhbHJlYWR5IG9wZW4gcGlja2Vyc1xyXG4gICAgICAgIGlmICggdGhpcy5jdXJyZW50UGlja2VyIClcclxuICAgICAgICBpZiAoIHRoaXMuY3VycmVudFBpY2tlci5kb20uY29udGFpbnModGFyZ2V0KSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gQ2FuY2VsIGFueSBvcGVuIGVkaXRvcnNcclxuICAgICAgICBsZXQgcHJldlRhcmdldCA9IHRoaXMuZG9tRWRpdGluZztcclxuICAgICAgICB0aGlzLmNsb3NlRGlhbG9nKCk7XHJcblxyXG4gICAgICAgIC8vIElmIGNsaWNraW5nIHRoZSBlbGVtZW50IGFscmVhZHkgYmVpbmcgZWRpdGVkLCBkb24ndCByZW9wZW5cclxuICAgICAgICBpZiAodGFyZ2V0ID09PSBwcmV2VGFyZ2V0KVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBjb2xsYXBzaWJsZSBlbGVtZW50c1xyXG4gICAgICAgIGlmICggdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygndG9nZ2xlJykgKVxyXG4gICAgICAgICAgICB0aGlzLnRvZ2dsZUNvbGxhcHNpYWJsZSh0YXJnZXQpO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGFuZCBvcGVuIHBpY2tlciBmb3IgdGhlIHRhcmdldCBlbGVtZW50XHJcbiAgICAgICAgZWxzZSBpZiAodHlwZSAmJiBwaWNrZXIpXHJcbiAgICAgICAgICAgIHRoaXMub3BlblBpY2tlcih0YXJnZXQsIHBpY2tlcik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlLWxheW91dCB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIG9uIHJlc2l6ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblJlc2l6ZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZS1sYXlvdXQgdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBvbiBzY3JvbGwgKi9cclxuICAgIHByaXZhdGUgb25TY3JvbGwoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIFdvcmthcm91bmQgZm9yIGxheW91dCBiZWhhdmluZyB3ZWlyZCB3aGVuIGlPUyBrZXlib2FyZCBpcyBvcGVuXHJcbiAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyLmhhc0ZvY3VzKCkpXHJcbiAgICAgICAgICAgIERPTS5ibHVyQWN0aXZlKCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFBpY2tlci5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZsaXBzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlLCBhbmQgcHJvcGFnYXRlcyB0aGUgbmV3IHN0YXRlIHRvIG90aGVyXHJcbiAgICAgKiBjb2xsYXBzaWJsZXMgb2YgdGhlIHNhbWUgcmVmZXJlbmNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgQ29sbGFwc2libGUgZWxlbWVudCBiZWluZyB0b2dnbGVkXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdG9nZ2xlQ29sbGFwc2lhYmxlKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgICAgID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCByZWYgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHBhcmVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCB0eXBlICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHBhcmVudCwgJ3R5cGUnKTtcclxuICAgICAgICBsZXQgY29sbGFwYXNlZCA9IHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpO1xyXG5cclxuICAgICAgICAvLyBQcm9wYWdhdGUgbmV3IGNvbGxhcHNlIHN0YXRlIHRvIGFsbCBjb2xsYXBzaWJsZXMgb2YgdGhlIHNhbWUgcmVmXHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChgc3BhbltkYXRhLXR5cGU9JHt0eXBlfV1bZGF0YS1yZWY9JHtyZWZ9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKF8gPT5cclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IHBocmFzZXNldCA9IF8gYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBsZXQgdG9nZ2xlICAgID0gcGhyYXNlc2V0LmNoaWxkcmVuWzBdIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFNraXAgc2FtZS1yZWYgZWxlbWVudHMgdGhhdCBhcmVuJ3QgY29sbGFwc2libGVcclxuICAgICAgICAgICAgICAgIGlmICggIXRvZ2dsZSB8fCAhdG9nZ2xlLmNsYXNzTGlzdC5jb250YWlucygndG9nZ2xlJykgKVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgICAgICBDb2xsYXBzaWJsZXMuc2V0KHBocmFzZXNldCwgdG9nZ2xlLCAhY29sbGFwYXNlZCk7XHJcbiAgICAgICAgICAgICAgICAvLyBEb24ndCBtb3ZlIHRoaXMgdG8gc2V0Q29sbGFwc2libGUsIGFzIHN0YXRlIHNhdmUvbG9hZCBpcyBoYW5kbGVkXHJcbiAgICAgICAgICAgICAgICAvLyBvdXRzaWRlIGluIGJvdGggdXNhZ2VzIG9mIHNldENvbGxhcHNpYmxlLlxyXG4gICAgICAgICAgICAgICAgUkFHLnN0YXRlLnNldENvbGxhcHNlZChyZWYsICFjb2xsYXBhc2VkKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBPcGVucyBhIHBpY2tlciBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFZGl0b3IgZWxlbWVudCB0byBvcGVuIHRoZSBwaWNrZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gcGlja2VyIFBpY2tlciB0byBvcGVuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb3BlblBpY2tlcih0YXJnZXQ6IEhUTUxFbGVtZW50LCBwaWNrZXI6IFBpY2tlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGFyZ2V0LnNldEF0dHJpYnV0ZSgnZWRpdGluZycsICd0cnVlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFBpY2tlciA9IHBpY2tlcjtcclxuICAgICAgICB0aGlzLmRvbUVkaXRpbmcgICAgPSB0YXJnZXQ7XHJcbiAgICAgICAgcGlja2VyLm9wZW4odGFyZ2V0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzY3JvbGxpbmcgbWFycXVlZSAqL1xyXG5jbGFzcyBNYXJxdWVlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1hcnF1ZWUncyBET00gZWxlbWVudCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzcGFuIGVsZW1lbnQgaW4gdGhlIG1hcnF1ZWUsIHdoZXJlIHRoZSB0ZXh0IGlzIHNldCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21TcGFuIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSBJRCBmb3IgdGhlIHNjcm9sbGluZyBhbmltYXRpb24gdGltZXIgKi9cclxuICAgIHByaXZhdGUgdGltZXIgIDogbnVtYmVyID0gMDtcclxuICAgIC8qKiBDdXJyZW50IG9mZnNldCAoaW4gcGl4ZWxzKSBvZiB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUgKi9cclxuICAgIHByaXZhdGUgb2Zmc2V0IDogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICA9IERPTS5yZXF1aXJlKCcjbWFycXVlZScpO1xyXG4gICAgICAgIHRoaXMuZG9tU3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJyc7XHJcbiAgICAgICAgdGhpcy5kb20uYXBwZW5kQ2hpbGQodGhpcy5kb21TcGFuKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgbWVzc2FnZSBvbiB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUsIGFuZCBzdGFydHMgYW5pbWF0aW5nIGl0ICovXHJcbiAgICBwdWJsaWMgc2V0KG1zZzogc3RyaW5nLCBhbmltYXRlOiBib29sZWFuID0gdHJ1ZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNwYW4udGV4dENvbnRlbnQgICAgID0gbXNnO1xyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuXHJcbiAgICAgICAgaWYgKCFhbmltYXRlKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEkgdHJpZWQgdG8gdXNlIENTUyBhbmltYXRpb24gZm9yIHRoaXMsIGJ1dCBjb3VsZG4ndCBmaWd1cmUgb3V0IGhvdyBmb3IgYVxyXG4gICAgICAgIC8vIGR5bmFtaWNhbGx5IHNpemVkIGVsZW1lbnQgbGlrZSB0aGUgc3Bhbi5cclxuICAgICAgICB0aGlzLm9mZnNldCA9IHRoaXMuZG9tLmNsaWVudFdpZHRoO1xyXG4gICAgICAgIGxldCBsaW1pdCAgID0gLXRoaXMuZG9tU3Bhbi5jbGllbnRXaWR0aCAtIDEwMDtcclxuICAgICAgICBsZXQgYW5pbSAgICA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLm9mZnNldCAgICAgICAgICAgICAgICAgIC09IDY7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gID0gYHRyYW5zbGF0ZVgoJHt0aGlzLm9mZnNldH1weClgO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub2Zmc2V0IDwgbGltaXQpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbVNwYW4uc3R5bGUudHJhbnNmb3JtID0gJyc7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHRoaXMudGltZXIgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW0pO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHRoZSBjdXJyZW50IG1hcnF1ZWUgYW5pbWF0aW9uICovXHJcbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLnRpbWVyKTtcclxuICAgICAgICB0aGlzLmRvbVNwYW4uc3R5bGUudHJhbnNmb3JtID0gJyc7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLzxyZWZlcmVuY2UgcGF0aD1cImJhc2VWaWV3LnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuY2xhc3MgU2V0dGluZ3MgZXh0ZW5kcyBCYXNlVmlld1xyXG57XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blJlc2V0ICAgICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MQnV0dG9uRWxlbWVudD4gKCcjYnRuUmVzZXRTZXR0aW5ncycpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5TYXZlICAgICAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTEJ1dHRvbkVsZW1lbnQ+ICgnI2J0blNhdmVTZXR0aW5ncycpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBjaGtVc2VWb3ggICAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI2Noa1VzZVZveCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBoaW50VXNlVm94ICAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTEVsZW1lbnQ+ICAgICAgICgnI2hpbnRVc2VWb3gnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VsVm94Vm9pY2UgICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxTZWxlY3RFbGVtZW50PiAoJyNzZWxWb3hWb2ljZScpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dFZveFBhdGggICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI2lucHV0Vm94UGF0aCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzZWxWb3hSZXZlcmIgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTFNlbGVjdEVsZW1lbnQ+ICgnI3NlbFZveFJldmVyYicpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzZWxWb3hDaGltZSAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTFNlbGVjdEVsZW1lbnQ+ICgnI3NlbFZveENoaW1lJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlbFNwZWVjaFZvaWNlICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsU3BlZWNoQ2hvaWNlJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHJhbmdlU3BlZWNoVm9sICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjcmFuZ2VTcGVlY2hWb2wnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hQaXRjaCA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNyYW5nZVNwZWVjaFBpdGNoJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHJhbmdlU3BlZWNoUmF0ZSAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjcmFuZ2VTcGVlY2hSYXRlJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blNwZWVjaFRlc3QgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MQnV0dG9uRWxlbWVudD4gKCcjYnRuU3BlZWNoVGVzdCcpO1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHRpbWVyIGZvciB0aGUgXCJSZXNldFwiIGJ1dHRvbiBjb25maXJtYXRpb24gc3RlcCAqL1xyXG4gICAgcHJpdmF0ZSByZXNldFRpbWVvdXQ/IDogbnVtYmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJyNzZXR0aW5nc1NjcmVlbicpO1xyXG4gICAgICAgIC8vIFRPRE86IENoZWNrIGlmIFZPWCBpcyBhdmFpbGFibGUsIGRpc2FibGUgaWYgbm90XHJcblxyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQub25jbGljayAgICAgID0gdGhpcy5oYW5kbGVSZXNldC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZS5vbmNsaWNrICAgICAgID0gdGhpcy5oYW5kbGVTYXZlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5jaGtVc2VWb3gub25jaGFuZ2UgICAgPSB0aGlzLmxheW91dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuc2VsVm94Vm9pY2Uub25jaGFuZ2UgID0gdGhpcy5sYXlvdXQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3Qub25jbGljayA9IHRoaXMuaGFuZGxlVm9pY2VUZXN0LmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIExpbmtkb3duLmxvYWRJbnRvKCdBQk9VVC5tZCcsICcjYWJvdXRCbG9jaycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBPcGVucyB0aGUgc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgb3BlbigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRoZSB2b2ljZSBsaXN0IGhhcyB0byBiZSBwb3B1bGF0ZWQgZWFjaCBvcGVuLCBpbiBjYXNlIGl0IGNoYW5nZXNcclxuICAgICAgICB0aGlzLnBvcHVsYXRlVm9pY2VMaXN0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuY2hrVXNlVm94LmNoZWNrZWQgICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hFbmFibGVkO1xyXG4gICAgICAgIHRoaXMuc2VsVm94Vm9pY2UudmFsdWUgICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hQYXRoO1xyXG4gICAgICAgIHRoaXMuaW5wdXRWb3hQYXRoLnZhbHVlICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hDdXN0b21QYXRoO1xyXG4gICAgICAgIHRoaXMuc2VsVm94UmV2ZXJiLnZhbHVlICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hSZXZlcmI7XHJcbiAgICAgICAgdGhpcy5zZWxWb3hDaGltZS52YWx1ZSAgICAgICAgICAgICAgPSBSQUcuY29uZmlnLnZveENoaW1lO1xyXG4gICAgICAgIHRoaXMuc2VsU3BlZWNoVm9pY2Uuc2VsZWN0ZWRJbmRleCAgID0gUkFHLmNvbmZpZy5zcGVlY2hWb2ljZTtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoVm9sLnZhbHVlQXNOdW1iZXIgICA9IFJBRy5jb25maWcuc3BlZWNoVm9sO1xyXG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hQaXRjaC52YWx1ZUFzTnVtYmVyID0gUkFHLmNvbmZpZy5zcGVlY2hQaXRjaDtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZUFzTnVtYmVyICA9IFJBRy5jb25maWcuc3BlZWNoUmF0ZTtcclxuXHJcbiAgICAgICAgdGhpcy5sYXlvdXQoKTtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuY2FuY2VsUmVzZXQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gPSB0cnVlO1xyXG4gICAgICAgIERPTS5ibHVyQWN0aXZlKHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2FsY3VsYXRlcyBmb3JtIGxheW91dCBhbmQgY29udHJvbCB2aXNpYmlsaXR5IGJhc2VkIG9uIHN0YXRlICovXHJcbiAgICBwcml2YXRlIGxheW91dCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB2b3hFbmFibGVkID0gdGhpcy5jaGtVc2VWb3guY2hlY2tlZDtcclxuICAgICAgICBsZXQgdm94Q3VzdG9tICA9ICh0aGlzLnNlbFZveFZvaWNlLnZhbHVlID09PSAnJyk7XHJcblxyXG4gICAgICAgIC8vIFRPRE86IE1pZ3JhdGUgYWxsIG9mIFJBRyB0byB1c2UgaGlkZGVuIGF0dHJpYnV0ZXMgaW5zdGVhZCwgZm9yIHNjcmVlbiByZWFkZXJzXHJcbiAgICAgICAgRE9NLnRvZ2dsZUhpZGRlbkFsbChcclxuICAgICAgICAgICAgW3RoaXMuc2VsU3BlZWNoVm9pY2UsICAgIXZveEVuYWJsZWRdLFxyXG4gICAgICAgICAgICBbdGhpcy5yYW5nZVNwZWVjaFBpdGNoLCAhdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLnNlbFZveFZvaWNlLCAgICAgICB2b3hFbmFibGVkXSxcclxuICAgICAgICAgICAgW3RoaXMuaW5wdXRWb3hQYXRoLCAgICAgIHZveEVuYWJsZWQgJiYgdm94Q3VzdG9tXSxcclxuICAgICAgICAgICAgW3RoaXMuc2VsVm94UmV2ZXJiLCAgICAgIHZveEVuYWJsZWRdLFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxWb3hDaGltZSwgICAgICAgdm94RW5hYmxlZF1cclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbGVhcnMgYW5kIHBvcHVsYXRlcyB0aGUgdm9pY2UgbGlzdCAqL1xyXG4gICAgcHJpdmF0ZSBwb3B1bGF0ZVZvaWNlTGlzdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuc2VsU3BlZWNoVm9pY2UuaW5uZXJIVE1MID0gJyc7XHJcblxyXG4gICAgICAgIGxldCB2b2ljZXMgPSBSQUcuc3BlZWNoLmJyb3dzZXJWb2ljZXM7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBlbXB0eSBsaXN0XHJcbiAgICAgICAgaWYgKHZvaWNlcy5sZW5ndGggPD0gMClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBvcHRpb24gICAgICA9IERPTS5hZGRPcHRpb24oIHRoaXMuc2VsU3BlZWNoVm9pY2UsIEwuU1RfU1BFRUNIX0VNUFRZKCkgKTtcclxuICAgICAgICAgICAgb3B0aW9uLmRpc2FibGVkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL1NwZWVjaFN5bnRoZXNpc1xyXG4gICAgICAgIGVsc2UgZm9yIChsZXQgaSA9IDA7IGkgPCB2b2ljZXMubGVuZ3RoIDsgaSsrKVxyXG4gICAgICAgICAgICBET00uYWRkT3B0aW9uKHRoaXMuc2VsU3BlZWNoVm9pY2UsIGAke3ZvaWNlc1tpXS5uYW1lfSAoJHt2b2ljZXNbaV0ubGFuZ30pYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHJlc2V0IGJ1dHRvbiwgd2l0aCBhIGNvbmZpcm0gc3RlcCB0aGF0IGNhbmNlbHMgYWZ0ZXIgMTUgc2Vjb25kcyAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVSZXNldCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5yZXNldFRpbWVvdXQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnJlc2V0VGltZW91dCAgICAgICA9IHNldFRpbWVvdXQodGhpcy5jYW5jZWxSZXNldC5iaW5kKHRoaXMpLCAxNTAwMCk7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuUmVzZXQuaW5uZXJUZXh0ID0gTC5TVF9SRVNFVF9DT05GSVJNKCk7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuUmVzZXQudGl0bGUgICAgID0gTC5TVF9SRVNFVF9DT05GSVJNX1QoKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgUkFHLmNvbmZpZy5yZXNldCgpO1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgIHRoaXMuY2FuY2VsUmVzZXQoKTtcclxuICAgICAgICB0aGlzLm9wZW4oKTtcclxuICAgICAgICBhbGVydCggTC5TVF9SRVNFVF9ET05FKCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2FuY2VsIHRoZSByZXNldCB0aW1lb3V0IGFuZCByZXN0b3JlIHRoZSByZXNldCBidXR0b24gdG8gbm9ybWFsICovXHJcbiAgICBwcml2YXRlIGNhbmNlbFJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnJlc2V0VGltZW91dCk7XHJcbiAgICAgICAgdGhpcy5idG5SZXNldC5pbm5lclRleHQgPSBMLlNUX1JFU0VUKCk7XHJcbiAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX1QoKTtcclxuICAgICAgICB0aGlzLnJlc2V0VGltZW91dCAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2F2ZSBidXR0b24sIHNhdmluZyBjb25maWcgdG8gc3RvcmFnZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVTYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hFbmFibGVkICAgID0gdGhpcy5jaGtVc2VWb3guY2hlY2tlZDtcclxuICAgICAgICBSQUcuY29uZmlnLnZveFBhdGggICAgICAgPSB0aGlzLnNlbFZveFZvaWNlLnZhbHVlO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94Q3VzdG9tUGF0aCA9IHRoaXMuaW5wdXRWb3hQYXRoLnZhbHVlO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94UmV2ZXJiICAgICA9IHRoaXMuc2VsVm94UmV2ZXJiLnZhbHVlO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94Q2hpbWUgICAgICA9IHRoaXMuc2VsVm94Q2hpbWUudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2ljZSAgID0gdGhpcy5zZWxTcGVlY2hWb2ljZS5zZWxlY3RlZEluZGV4O1xyXG4gICAgICAgIC8vIHBhcnNlRmxvYXQgaW5zdGVhZCBvZiB2YWx1ZUFzTnVtYmVyOyBzZWUgQXJjaGl0ZWN0dXJlLm1kXHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2wgICAgID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoVm9sLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFBpdGNoICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hQaXRjaC52YWx1ZSk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hSYXRlICAgID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZSk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5zYXZlKCk7XHJcbiAgICAgICAgdGhpcy5jbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzcGVlY2ggdGVzdCBidXR0b24sIHNwZWFraW5nIGEgdGVzdCBwaHJhc2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlVm9pY2VUZXN0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcclxuICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3QuZGlzYWJsZWQgPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBIYXMgdG8gZXhlY3V0ZSBvbiBhIGRlbGF5LCBhcyBzcGVlY2ggY2FuY2VsIGlzIHVucmVsaWFibGUgd2l0aG91dCBpdFxyXG4gICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3QuZGlzYWJsZWQgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgIGxldCBwaHJhc2UgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICAgICAgcGhyYXNlLmlubmVySFRNTCA9ICc8cGhyYXNlIHJlZj1cInNhbXBsZVwiLz4nO1xyXG5cclxuICAgICAgICAgICAgUkFHLnBocmFzZXIucHJvY2VzcyhwaHJhc2UpO1xyXG5cclxuICAgICAgICAgICAgUkFHLnNwZWVjaC5zcGVhayhcclxuICAgICAgICAgICAgICAgIHBocmFzZS5maXJzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgdXNlVm94ICAgIDogdGhpcy5jaGtVc2VWb3guY2hlY2tlZCxcclxuICAgICAgICAgICAgICAgICAgICB2b3hQYXRoICAgOiB0aGlzLnNlbFZveFZvaWNlLnZhbHVlIHx8IHRoaXMuaW5wdXRWb3hQYXRoLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgIHZveFJldmVyYiA6IHRoaXMuc2VsVm94UmV2ZXJiLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgIHZveENoaW1lICA6IHRoaXMuc2VsVm94Q2hpbWUudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdm9pY2VJZHggIDogdGhpcy5zZWxTcGVlY2hWb2ljZS5zZWxlY3RlZEluZGV4LFxyXG4gICAgICAgICAgICAgICAgICAgIHZvbHVtZSAgICA6IHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWVBc051bWJlcixcclxuICAgICAgICAgICAgICAgICAgICBwaXRjaCAgICAgOiB0aGlzLnJhbmdlU3BlZWNoUGl0Y2gudmFsdWVBc051bWJlcixcclxuICAgICAgICAgICAgICAgICAgICByYXRlICAgICAgOiB0aGlzLnJhbmdlU3BlZWNoUmF0ZS52YWx1ZUFzTnVtYmVyXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfSwgMjAwKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSB0b3AgdG9vbGJhciAqL1xyXG5jbGFzcyBUb29sYmFyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGNvbnRhaW5lciBmb3IgdGhlIHRvb2xiYXIgKi9cclxuICAgIHByaXZhdGUgZG9tICAgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBsYXkgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blBsYXkgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzdG9wIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5TdG9wICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgZ2VuZXJhdGUgcmFuZG9tIHBocmFzZSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuR2VuZXJhdGUgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNhdmUgc3RhdGUgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blNhdmUgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSByZWNhbGwgc3RhdGUgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0blJlY2FsbCAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzZXR0aW5ncyBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuT3B0aW9uICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgPSBET00ucmVxdWlyZSgnI3Rvb2xiYXInKTtcclxuICAgICAgICB0aGlzLmJ0blBsYXkgICAgID0gRE9NLnJlcXVpcmUoJyNidG5QbGF5Jyk7XHJcbiAgICAgICAgdGhpcy5idG5TdG9wICAgICA9IERPTS5yZXF1aXJlKCcjYnRuU3RvcCcpO1xyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUgPSBET00ucmVxdWlyZSgnI2J0blNodWZmbGUnKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUgICAgID0gRE9NLnJlcXVpcmUoJyNidG5TYXZlJyk7XHJcbiAgICAgICAgdGhpcy5idG5SZWNhbGwgICA9IERPTS5yZXF1aXJlKCcjYnRuTG9hZCcpO1xyXG4gICAgICAgIHRoaXMuYnRuT3B0aW9uICAgPSBET00ucmVxdWlyZSgnI2J0blNldHRpbmdzJyk7XHJcblxyXG4gICAgICAgIHRoaXMuYnRuU3RvcC5vbmNsaWNrICAgICA9IHRoaXMuaGFuZGxlU3RvcC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUub25jbGljayA9IHRoaXMuaGFuZGxlR2VuZXJhdGUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUub25jbGljayAgICAgPSB0aGlzLmhhbmRsZVNhdmUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0blJlY2FsbC5vbmNsaWNrICAgPSB0aGlzLmhhbmRsZUxvYWQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0bk9wdGlvbi5vbmNsaWNrICAgPSB0aGlzLmhhbmRsZU9wdGlvbi5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBIYXMgdG8gZXhlY3V0ZSBvbiBhIGRlbGF5LCBhcyBzcGVlY2ggY2FuY2VsIGlzIHVucmVsaWFibGUgd2l0aG91dCBpdFxyXG4gICAgICAgIHRoaXMuYnRuUGxheS5vbmNsaWNrID0gZXYgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dCh0aGlzLmhhbmRsZVBsYXkuYmluZCh0aGlzKSwgMjAwKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBBZGQgdGhyb2IgY2xhc3MgaWYgdGhlIGdlbmVyYXRlIGJ1dHRvbiBoYXNuJ3QgYmVlbiBjbGlja2VkIGJlZm9yZVxyXG4gICAgICAgIGlmICghUkFHLmNvbmZpZy5jbGlja2VkR2VuZXJhdGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmNsYXNzTGlzdC5hZGQoJ3Rocm9iJyk7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgcGxheSBidXR0b24sIHBsYXlpbmcgdGhlIGVkaXRvcidzIGN1cnJlbnQgcGhyYXNlIHdpdGggc3BlZWNoICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVBsYXkoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3BlZWNoLm9uc3RvcCA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmJ0blN0b3AuaGlkZGVuID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5idG5QbGF5LmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgICAgICBSQUcuc3BlZWNoLm9uc3RvcCAgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMuYnRuUGxheS5kaXNhYmxlZCA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuYnRuU3RvcC5oaWRkZW4gICA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuYnRuUGxheS5oaWRkZW4gICA9IHRydWU7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBSQUcudmlld3MuZWRpdG9yLmdldFRleHQoKSApO1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3BlYWsoIFJBRy52aWV3cy5lZGl0b3IuZ2V0UGhyYXNlKCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc3RvcCBidXR0b24sIHN0b3BwaW5nIHRoZSBtYXJxdWVlIGFuZCBhbnkgc3BlZWNoICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVN0b3AoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcclxuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zdG9wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIGdlbmVyYXRlIGJ1dHRvbiwgZ2VuZXJhdGluZyBuZXcgcmFuZG9tIHN0YXRlIGFuZCBwaHJhc2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlR2VuZXJhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBSZW1vdmUgdGhlIGNhbGwtdG8tYWN0aW9uIHRocm9iIGZyb20gaW5pdGlhbCBsb2FkXHJcbiAgICAgICAgdGhpcy5idG5HZW5lcmF0ZS5jbGFzc0xpc3QucmVtb3ZlKCd0aHJvYicpO1xyXG4gICAgICAgIFJBRy5nZW5lcmF0ZSgpO1xyXG4gICAgICAgIFJBRy5jb25maWcuY2xpY2tlZEdlbmVyYXRlID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2F2ZSBidXR0b24sIHBlcnNpc3RpbmcgdGhlIGN1cnJlbnQgdHJhaW4gc3RhdGUgdG8gc3RvcmFnZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVTYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgY3NzID0gJ2ZvbnQtc2l6ZTogbGFyZ2U7IGZvbnQtd2VpZ2h0OiBib2xkOyc7XHJcbiAgICAgICAgICAgIGxldCByYXcgPSBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpO1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3N0YXRlJywgcmF3KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKEwuU1RBVEVfQ09QWV9QQVNURSgpLCBjc3MpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIlJBRy5sb2FkKCdcIiwgcmF3LnJlcGxhY2UoXCInXCIsIFwiXFxcXCdcIiksIFwiJylcIik7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKEwuU1RBVEVfUkFXX0pTT04oKSwgY3NzKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2cocmF3KTtcclxuXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9UT19TVE9SQUdFKCkgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfU0FWRV9GQUlMKGUubWVzc2FnZSkgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIGxvYWQgYnV0dG9uLCBsb2FkaW5nIHRyYWluIHN0YXRlIGZyb20gc3RvcmFnZSwgaWYgaXQgZXhpc3RzICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUxvYWQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZGF0YSA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnc3RhdGUnKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGRhdGFcclxuICAgICAgICAgICAgPyBSQUcubG9hZChkYXRhKVxyXG4gICAgICAgICAgICA6IFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9TQVZFX01JU1NJTkcoKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzZXR0aW5ncyBidXR0b24sIG9wZW5pbmcgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVPcHRpb24oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcudmlld3Muc2V0dGluZ3Mub3BlbigpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBVSSBlbGVtZW50cyBhbmQgdGhlaXIgbG9naWMgKi9cclxuY2xhc3MgVmlld3Ncclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBlZGl0b3IgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGVkaXRvciAgIDogRWRpdG9yO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBtYXJxdWVlIGNvbXBvbmVudCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBtYXJxdWVlICA6IE1hcnF1ZWU7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzZXR0aW5ncyA6IFNldHRpbmdzO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiB0b29sYmFyIGNvbXBvbmVudCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSB0b29sYmFyICA6IFRvb2xiYXI7XHJcbiAgICAvKiogUmVmZXJlbmNlcyB0byBhbGwgdGhlIHBpY2tlcnMsIG9uZSBmb3IgZWFjaCB0eXBlIG9mIFhNTCBlbGVtZW50ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHBpY2tlcnMgIDogRGljdGlvbmFyeTxQaWNrZXI+O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5lZGl0b3IgICA9IG5ldyBFZGl0b3IoKTtcclxuICAgICAgICB0aGlzLm1hcnF1ZWUgID0gbmV3IE1hcnF1ZWUoKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzID0gbmV3IFNldHRpbmdzKCk7XHJcbiAgICAgICAgdGhpcy50b29sYmFyICA9IG5ldyBUb29sYmFyKCk7XHJcbiAgICAgICAgdGhpcy5waWNrZXJzICA9IHt9O1xyXG5cclxuICAgICAgICBbXHJcbiAgICAgICAgICAgIG5ldyBDb2FjaFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgRXhjdXNlUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBJbnRlZ2VyUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBOYW1lZFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgUGhyYXNlc2V0UGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBQbGF0Zm9ybVBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgU2VydmljZVBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgU3RhdGlvblBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgU3RhdGlvbkxpc3RQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFRpbWVQaWNrZXIoKVxyXG4gICAgICAgIF0uZm9yRWFjaChwaWNrZXIgPT4gdGhpcy5waWNrZXJzW3BpY2tlci54bWxUYWddID0gcGlja2VyKTtcclxuXHJcbiAgICAgICAgLy8gR2xvYmFsIGhvdGtleXNcclxuICAgICAgICBkb2N1bWVudC5ib2R5Lm9ua2V5ZG93biA9IHRoaXMub25JbnB1dC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBBcHBseSBpT1Mtc3BlY2lmaWMgQ1NTIGZpeGVzXHJcbiAgICAgICAgaWYgKERPTS5pc2lPUylcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdpb3MnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgcGlja2VyIHRoYXQgaGFuZGxlcyBhIGdpdmVuIHRhZywgaWYgYW55ICovXHJcbiAgICBwdWJsaWMgZ2V0UGlja2VyKHhtbFRhZzogc3RyaW5nKSA6IFBpY2tlclxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnBpY2tlcnNbeG1sVGFnXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlIEVTQyB0byBjbG9zZSBwaWNrZXJzIG9yIHNldHRpZ25zICovXHJcbiAgICBwcml2YXRlIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmIChldi5rZXkgIT09ICdFc2NhcGUnKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgdGhpcy5zZXR0aW5ncy5jbG9zZSgpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBkZWFsaW5nIHdpdGggY29sbGFwc2libGUgZWxlbWVudHMgKi9cclxuY2xhc3MgQ29sbGFwc2libGVzXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB0aGUgY29sbGFwc2Ugc3RhdGUgb2YgYSBjb2xsYXBzaWJsZSBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzcGFuIFRoZSBlbmNhcHN1bGF0aW5nIGNvbGxhcHNpYmxlIGVsZW1lbnRcclxuICAgICAqIEBwYXJhbSB0b2dnbGUgVGhlIHRvZ2dsZSBjaGlsZCBvZiB0aGUgY29sbGFwc2libGUgZWxlbWVudFxyXG4gICAgICogQHBhcmFtIHN0YXRlIFRydWUgdG8gY29sbGFwc2UsIGZhbHNlIHRvIG9wZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzZXQoc3BhbjogSFRNTEVsZW1lbnQsIHRvZ2dsZTogSFRNTEVsZW1lbnQsIHN0YXRlOiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVmICA9IHNwYW4uZGF0YXNldFsncmVmJ10gfHwgJz8/Pyc7XHJcbiAgICAgICAgbGV0IHR5cGUgPSBzcGFuLmRhdGFzZXRbJ3R5cGUnXSE7XHJcblxyXG4gICAgICAgIGlmIChzdGF0ZSkgc3Bhbi5zZXRBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcsICcnKTtcclxuICAgICAgICBlbHNlICAgICAgIHNwYW4ucmVtb3ZlQXR0cmlidXRlKCdjb2xsYXBzZWQnKTtcclxuXHJcbiAgICAgICAgdG9nZ2xlLnRpdGxlID0gc3RhdGVcclxuICAgICAgICAgICAgPyBMLlRJVExFX09QVF9PUEVOKHR5cGUsIHJlZilcclxuICAgICAgICAgICAgOiBMLlRJVExFX09QVF9DTE9TRSh0eXBlLCByZWYpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogU3VnYXIgZm9yIGNob29zaW5nIHNlY29uZCB2YWx1ZSBpZiBmaXJzdCBpcyB1bmRlZmluZWQsIGluc3RlYWQgb2YgZmFsc3kgKi9cclxuZnVuY3Rpb24gZWl0aGVyPFQ+KHZhbHVlOiBUIHwgdW5kZWZpbmVkLCB2YWx1ZTI6IFQpIDogVFxyXG57XHJcbiAgICByZXR1cm4gKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpID8gdmFsdWUyIDogdmFsdWU7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCB0aGUgRE9NICovXHJcbmNsYXNzIERPTVxyXG57XHJcbiAgICAvKiogV2hldGhlciB0aGUgd2luZG93IGlzIHRoaW5uZXIgdGhhbiBhIHNwZWNpZmljIHNpemUgKGFuZCwgdGh1cywgaXMgXCJtb2JpbGVcIikgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGlzTW9iaWxlKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGggPD0gNTAwO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIFJBRyBhcHBlYXJzIHRvIGJlIHJ1bm5pbmcgb24gYW4gaU9TIGRldmljZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgaXNpT1MoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLnBsYXRmb3JtLm1hdGNoKC9pUGhvbmV8aVBvZHxpUGFkL2dpKSAhPT0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gYXR0cmlidXRlIGZyb20gdGhlIGdpdmVuIGVsZW1lbnQsIG9yIHJldHVybnMgdGhlIGdpdmVuXHJcbiAgICAgKiBkZWZhdWx0IHZhbHVlIGlmIHVuc2V0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBhdHRyIE5hbWUgb2YgdGhlIGF0dHJpYnV0ZSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcGFyYW0gZGVmIERlZmF1bHQgdmFsdWUgaWYgYXR0cmlidXRlIGlzbid0IHNldFxyXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGF0dHJpYnV0ZSdzIHZhbHVlLCBvciBkZWZhdWx0IHZhbHVlIGlmIHVuc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0QXR0cihlbGVtZW50OiBIVE1MRWxlbWVudCwgYXR0cjogc3RyaW5nLCBkZWY6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gZWxlbWVudC5oYXNBdHRyaWJ1dGUoYXR0cilcclxuICAgICAgICAgICAgPyBlbGVtZW50LmdldEF0dHJpYnV0ZShhdHRyKSFcclxuICAgICAgICAgICAgOiBkZWY7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyBhbiBlbGVtZW50IGZyb20gdGhlIGdpdmVuIGRvY3VtZW50LCB0aHJvd2luZyBhbiBlcnJvciBpZiBubyBtYXRjaCBpcyBmb3VuZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgQ1NTIHNlbGVjdG9yIHF1ZXJ5IHRvIHVzZVxyXG4gICAgICogQHBhcmFtIHBhcmVudCBQYXJlbnQgb2JqZWN0IHRvIHNlYXJjaDsgZGVmYXVsdHMgdG8gZG9jdW1lbnRcclxuICAgICAqIEByZXR1cm5zIFRoZSBmaXJzdCBlbGVtZW50IHRvIG1hdGNoIHRoZSBnaXZlbiBxdWVyeVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmU8VCBleHRlbmRzIEhUTUxFbGVtZW50PlxyXG4gICAgICAgIChxdWVyeTogc3RyaW5nLCBwYXJlbnQ6IFBhcmVudE5vZGUgPSB3aW5kb3cuZG9jdW1lbnQpXHJcbiAgICAgICAgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IHBhcmVudC5xdWVyeVNlbGVjdG9yKHF1ZXJ5KSBhcyBUO1xyXG5cclxuICAgICAgICBpZiAoIXJlc3VsdClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuRE9NX01JU1NJTkcocXVlcnkpICk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGF0dHJpYnV0ZSBmcm9tIHRoZSBnaXZlbiBlbGVtZW50LCB0aHJvd2luZyBhbiBlcnJvclxyXG4gICAgICogaWYgdGhlIGF0dHJpYnV0ZSBpcyBtaXNzaW5nLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBhdHRyIE5hbWUgb2YgdGhlIGF0dHJpYnV0ZSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gYXR0cmlidXRlJ3MgdmFsdWVcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXF1aXJlQXR0cihlbGVtZW50OiBIVE1MRWxlbWVudCwgYXR0cjogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICggIWVsZW1lbnQuaGFzQXR0cmlidXRlKGF0dHIpIClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuQVRUUl9NSVNTSU5HKGF0dHIpICk7XHJcblxyXG4gICAgICAgIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZShhdHRyKSE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGtleSBvZiB0aGUgZ2l2ZW4gZWxlbWVudCdzIGRhdGFzZXQsIHRocm93aW5nIGFuIGVycm9yXHJcbiAgICAgKiBpZiB0aGUgdmFsdWUgaXMgbWlzc2luZyBvciBlbXB0eS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgZGF0YSBvZlxyXG4gICAgICogQHBhcmFtIGtleSBLZXkgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxyXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGRhdGFzZXQncyB2YWx1ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmVEYXRhKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBrZXk6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgdmFsdWUgPSBlbGVtZW50LmRhdGFzZXRba2V5XTtcclxuXHJcbiAgICAgICAgaWYgKCBTdHJpbmdzLmlzTnVsbE9yRW1wdHkodmFsdWUpIClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuREFUQV9NSVNTSU5HKGtleSkgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHZhbHVlITtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEJsdXJzICh1bmZvY3VzZXMpIHRoZSBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwYXJlbnQgSWYgZ2l2ZW4sIG9ubHkgYmx1cnMgaWYgYWN0aXZlIGlzIGRlc2NlbmRhbnRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBibHVyQWN0aXZlKHBhcmVudDogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5ib2R5KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgYWN0aXZlID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCBhY3RpdmUgJiYgYWN0aXZlLmJsdXIgJiYgcGFyZW50LmNvbnRhaW5zKGFjdGl2ZSkgKVxyXG4gICAgICAgICAgICBhY3RpdmUuYmx1cigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRGVlcCBjbG9uZXMgYWxsIHRoZSBjaGlsZHJlbiBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgaW50byB0aGUgdGFyZ2V0IGVsZW1lbnQuXHJcbiAgICAgKiBVc2luZyBpbm5lckhUTUwgd291bGQgYmUgZWFzaWVyLCBob3dldmVyIGl0IGhhbmRsZXMgc2VsZi1jbG9zaW5nIHRhZ3MgcG9vcmx5LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzb3VyY2UgRWxlbWVudCB3aG9zZSBjaGlsZHJlbiB0byBjbG9uZVxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFbGVtZW50IHRvIGFwcGVuZCB0aGUgY2xvbmVkIGNoaWxkcmVuIHRvXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2xvbmVJbnRvKHNvdXJjZTogSFRNTEVsZW1lbnQsIHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc291cmNlLmNoaWxkTm9kZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIHRhcmdldC5hcHBlbmRDaGlsZCggc291cmNlLmNoaWxkTm9kZXNbaV0uY2xvbmVOb2RlKHRydWUpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdWdhciBmb3IgY3JlYXRpbmcgYW5kIGFkZGluZyBhbiBvcHRpb24gZWxlbWVudCB0byBhIHNlbGVjdCBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzZWxlY3QgU2VsZWN0IGxpc3QgZWxlbWVudCB0byBhZGQgdGhlIG9wdGlvbiB0b1xyXG4gICAgICogQHBhcmFtIHRleHQgTGFiZWwgZm9yIHRoZSBvcHRpb25cclxuICAgICAqIEBwYXJhbSB2YWx1ZSBWYWx1ZSBmb3IgdGhlIG9wdGlvblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFkZE9wdGlvbihzZWxlY3Q6IEhUTUxTZWxlY3RFbGVtZW50LCB0ZXh0OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgPSAnJylcclxuICAgICAgICA6IEhUTUxPcHRpb25FbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpIGFzIEhUTUxPcHRpb25FbGVtZW50O1xyXG5cclxuICAgICAgICBvcHRpb24udGV4dCAgPSB0ZXh0O1xyXG4gICAgICAgIG9wdGlvbi52YWx1ZSA9IHZhbHVlO1xyXG5cclxuICAgICAgICBzZWxlY3QuYWRkKG9wdGlvbik7XHJcbiAgICAgICAgcmV0dXJuIG9wdGlvbjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHRleHQgY29udGVudCBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgZXhjbHVkaW5nIHRoZSB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlbi5cclxuICAgICAqIEJlIHdhcm5lZDsgdGhpcyBtZXRob2QgdXNlcyBSQUctc3BlY2lmaWMgY29kZS5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xOTk4NjMyOFxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byByZWN1cnNpdmVseSBnZXQgdGV4dCBjb250ZW50IG9mXHJcbiAgICAgKiBAcmV0dXJucyBUZXh0IGNvbnRlbnQgb2YgZ2l2ZW4gZWxlbWVudCwgd2l0aG91dCB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldFZpc2libGVUZXh0KGVsZW1lbnQ6IEVsZW1lbnQpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgICAgICAoZWxlbWVudC5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpXHJcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50LnRleHRDb250ZW50IHx8ICcnO1xyXG4gICAgICAgIGVsc2UgaWYgKCBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygndG9nZ2xlJykgKVxyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcblxyXG4gICAgICAgIC8vIFJldHVybiBibGFuayAoc2tpcCkgaWYgY2hpbGQgb2YgYSBjb2xsYXBzZWQgZWxlbWVudC4gUHJldmlvdXNseSwgdGhpcyB1c2VkXHJcbiAgICAgICAgLy8gZ2V0Q29tcHV0ZWRTdHlsZSwgYnV0IHRoYXQgZG9lc24ndCB3b3JrIGlmIHRoZSBlbGVtZW50IGlzIHBhcnQgb2YgYW4gb3JwaGFuZWRcclxuICAgICAgICAvLyBwaHJhc2UgKGFzIGhhcHBlbnMgd2l0aCB0aGUgcGhyYXNlc2V0IHBpY2tlcikuXHJcbiAgICAgICAgbGV0IHBhcmVudCA9IGVsZW1lbnQucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCBwYXJlbnQgJiYgcGFyZW50Lmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJykgKVxyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcblxyXG4gICAgICAgIGxldCB0ZXh0ID0gJyc7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBlbGVtZW50LmNoaWxkTm9kZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIHRleHQgKz0gRE9NLmdldFZpc2libGVUZXh0KGVsZW1lbnQuY2hpbGROb2Rlc1tpXSBhcyBFbGVtZW50KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGV4Y2x1ZGluZyB0aGUgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW4sXHJcbiAgICAgKiBhbmQgZXhjZXNzIHdoaXRlc3BhY2UgYXMgYSByZXN1bHQgb2YgY29udmVydGluZyBmcm9tIEhUTUwvWE1MLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE5OTg2MzI4XHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIHJlY3Vyc2l2ZWx5IGdldCB0ZXh0IGNvbnRlbnQgb2ZcclxuICAgICAqIEByZXR1cm5zIENsZWFuZWQgdGV4dCBvZiBnaXZlbiBlbGVtZW50LCB3aXRob3V0IHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0Q2xlYW5lZFZpc2libGVUZXh0KGVsZW1lbnQ6IEVsZW1lbnQpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFN0cmluZ3MuY2xlYW4oIERPTS5nZXRWaXNpYmxlVGV4dChlbGVtZW50KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2NhbnMgZm9yIHRoZSBuZXh0IGZvY3VzYWJsZSBzaWJsaW5nIGZyb20gYSBnaXZlbiBlbGVtZW50LCBza2lwcGluZyBoaWRkZW4gb3JcclxuICAgICAqIHVuZm9jdXNhYmxlIGVsZW1lbnRzLiBJZiB0aGUgZW5kIG9mIHRoZSBjb250YWluZXIgaXMgaGl0LCB0aGUgc2NhbiB3cmFwcyBhcm91bmQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGZyb20gRWxlbWVudCB0byBzdGFydCBzY2FubmluZyBmcm9tXHJcbiAgICAgKiBAcGFyYW0gZGlyIERpcmVjdGlvbjsgLTEgZm9yIGxlZnQgKHByZXZpb3VzKSwgMSBmb3IgcmlnaHQgKG5leHQpXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgbmV4dCBhdmFpbGFibGUgc2libGluZywgb3IgbnVsbCBpZiBub25lIGZvdW5kXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZnJvbTogSFRNTEVsZW1lbnQsIGRpcjogbnVtYmVyKVxyXG4gICAgICAgIDogSFRNTEVsZW1lbnQgfCBudWxsXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN1cnJlbnQgPSBmcm9tO1xyXG4gICAgICAgIGxldCBwYXJlbnQgID0gZnJvbS5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIXBhcmVudClcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgIHdoaWxlICh0cnVlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gUHJvY2VlZCB0byBuZXh0IGVsZW1lbnQsIG9yIHdyYXAgYXJvdW5kIGlmIGhpdCB0aGUgZW5kIG9mIHBhcmVudFxyXG4gICAgICAgICAgICBpZiAgICAgIChkaXIgPCAwKVxyXG4gICAgICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnQucHJldmlvdXNFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IHBhcmVudC5sYXN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBlbHNlIGlmIChkaXIgPiAwKVxyXG4gICAgICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnQubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgcGFyZW50LmZpcnN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICB0aHJvdyBFcnJvciggTC5CQURfRElSRUNUSU9OKCBkaXIudG9TdHJpbmcoKSApICk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBjb21lIGJhY2sgdG8gdGhlIHN0YXJ0aW5nIGVsZW1lbnQsIG5vdGhpbmcgd2FzIGZvdW5kXHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50ID09PSBmcm9tKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiB0aGlzIGVsZW1lbnQgaXNuJ3QgaGlkZGVuIGFuZCBpcyBmb2N1c2FibGUsIHJldHVybiBpdCFcclxuICAgICAgICAgICAgaWYgKCAhY3VycmVudC5oaWRkZW4gKVxyXG4gICAgICAgICAgICBpZiAoIGN1cnJlbnQuaGFzQXR0cmlidXRlKCd0YWJpbmRleCcpIClcclxuICAgICAgICAgICAgICAgIHJldHVybiBjdXJyZW50O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGluZGV4IG9mIGEgY2hpbGQgZWxlbWVudCwgcmVsZXZhbnQgdG8gaXRzIHBhcmVudC5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS85MTMyNTc1LzMzNTQ5MjBcclxuICAgICAqIEBwYXJhbSBjaGlsZCBDaGlsZCBlbGVtZW50IHRvIGdldCB0aGUgaW5kZXggb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbmRleE9mKGNoaWxkOiBIVE1MRWxlbWVudCkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ID0gY2hpbGQucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgcmV0dXJuIHBhcmVudFxyXG4gICAgICAgICAgICA/IEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwocGFyZW50LmNoaWxkcmVuLCBjaGlsZClcclxuICAgICAgICAgICAgOiAtMTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGluZGV4IG9mIGEgY2hpbGQgbm9kZSwgcmVsZXZhbnQgdG8gaXRzIHBhcmVudC4gVXNlZCBmb3IgdGV4dCBub2Rlcy5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS85MTMyNTc1LzMzNTQ5MjBcclxuICAgICAqIEBwYXJhbSBjaGlsZCBDaGlsZCBub2RlIHRvIGdldCB0aGUgaW5kZXggb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBub2RlSW5kZXhPZihjaGlsZDogTm9kZSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ID0gY2hpbGQucGFyZW50Tm9kZTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHBhcmVudFxyXG4gICAgICAgICAgICA/IEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwocGFyZW50LmNoaWxkTm9kZXMsIGNoaWxkKVxyXG4gICAgICAgICAgICA6IC0xO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVG9nZ2xlcyB0aGUgaGlkZGVuIGF0dHJpYnV0ZSBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgYW5kIGFsbCBpdHMgbGFiZWxzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gdG9nZ2xlIHRoZSBoaWRkZW4gYXR0cmlidXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gZm9yY2UgT3B0aW9uYWwgdmFsdWUgdG8gZm9yY2UgdG9nZ2xpbmcgdG9cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0b2dnbGVIaWRkZW4oZWxlbWVudDogSFRNTEVsZW1lbnQsIGZvcmNlPzogYm9vbGVhbikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGhpZGRlbiA9ICFlbGVtZW50LmhpZGRlbjtcclxuXHJcbiAgICAgICAgLy8gRG8gbm90aGluZyBpZiBhbHJlYWR5IHRvZ2dsZWQgdG8gdGhlIGZvcmNlZCBzdGF0ZVxyXG4gICAgICAgIGlmIChoaWRkZW4gPT09IGZvcmNlKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGVsZW1lbnQuaGlkZGVuID0gaGlkZGVuO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbZm9yPScke2VsZW1lbnQuaWR9J11gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChsID0+IChsIGFzIEhUTUxFbGVtZW50KS5oaWRkZW4gPSBoaWRkZW4pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVG9nZ2xlcyB0aGUgaGlkZGVuIGF0dHJpYnV0ZSBvZiBhIGdyb3VwIG9mIGVsZW1lbnRzLCBpbiBidWxrLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBsaXN0IEFuIGFycmF5IG9mIGFyZ3VtZW50IHBhaXJzIGZvciB7dG9nZ2xlSGlkZGVufVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRvZ2dsZUhpZGRlbkFsbCguLi5saXN0OiBbSFRNTEVsZW1lbnQsIGJvb2xlYW4/XVtdKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsaXN0LmZvckVhY2goIGwgPT4gdGhpcy50b2dnbGVIaWRkZW4oLi4ubCkgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEEgdmVyeSBzbWFsbCBzdWJzZXQgb2YgTWFya2Rvd24gZm9yIGh5cGVybGlua2luZyBhIGJsb2NrIG9mIHRleHQgKi9cclxuY2xhc3MgTGlua2Rvd25cclxue1xyXG4gICAgLyoqIFJlZ2V4IHBhdHRlcm4gZm9yIG1hdGNoaW5nIGxpbmtlZCB0ZXh0ICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUdFWF9MSU5LID0gL1xcWyguKz8pXFxdXFxbKFxcZCspXFxdL2dpO1xyXG4gICAgLyoqIFJlZ2V4IHBhdHRlcm4gZm9yIG1hdGNoaW5nIGxpbmsgcmVmZXJlbmNlcyAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVHRVhfUkVGICA9IC9eXFxbKFxcZCspXFxdOlxccysoXFxTKykkL2dtaTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEF0dGVtcHRzIHRvIGxvYWQgdGhlIGdpdmVuIGxpbmtkb3duIGZpbGUsIHBhcnNlIGFuZCBzZXQgaXQgYXMgYW4gZWxlbWVudCdzIHRleHQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBhdGggUmVsYXRpdmUgb3IgYWJzb2x1dGUgVVJMIHRvIGZldGNoIHRoZSBsaW5rZG93biBmcm9tXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgRE9NIHF1ZXJ5IGZvciB0aGUgb2JqZWN0IHRvIHB1dCB0aGUgdGV4dCBpbnRvXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbG9hZEludG8ocGF0aDogc3RyaW5nLCBxdWVyeTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZG9tID0gRE9NLnJlcXVpcmUocXVlcnkpO1xyXG5cclxuICAgICAgICBkb20uaW5uZXJUZXh0ID0gYExvYWRpbmcgdGV4dCBmcm9tICcke3BhdGh9Jy4uLmA7XHJcblxyXG4gICAgICAgIGZldGNoKHBhdGgpXHJcbiAgICAgICAgICAgIC50aGVuKCByZXEgPT4gcmVxLnRleHQoKSApXHJcbiAgICAgICAgICAgIC50aGVuKCB0eHQgPT4gZG9tLmlubmVySFRNTCA9IExpbmtkb3duLnBhcnNlKHR4dCkgKVxyXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IGRvbS5pbm5lclRleHQgPSBgQ291bGQgbm90IGxvYWQgJyR7cGF0aH0nOiAke2Vycn1gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBhcnNlcyB0aGUgZ2l2ZW4gdGV4dCBmcm9tIExpbmtkb3duIHRvIEhUTUwsIGNvbnZlcnRpbmcgdGFnZ2VkIHRleHQgaW50byBsaW5rc1xyXG4gICAgICogdXNpbmcgYSBnaXZlbiBsaXN0IG9mIHJlZmVyZW5jZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRleHQgTGlua2Rvd24gdGV4dCB0byB0cmFuc2Zvcm0gdG8gSFRNTFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBwYXJzZSh0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGxpbmtzIDogRGljdGlvbmFyeTxzdHJpbmc+ID0ge307XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBzYW5pdGl6ZSBhbnkgSFRNTFxyXG4gICAgICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UoJzwnLCAnJmx0OycpLnJlcGxhY2UoJz4nLCAnJmd0OycpO1xyXG5cclxuICAgICAgICAvLyBUaGVuLCBnZXQgdGhlIGxpc3Qgb2YgcmVmZXJlbmNlcywgcmVtb3ZpbmcgdGhlbSBmcm9tIHRoZSB0ZXh0XHJcbiAgICAgICAgdGV4dCA9IHRleHQucmVwbGFjZSh0aGlzLlJFR0VYX1JFRiwgKF8sIGssIHYpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsaW5rc1trXSA9IHY7XHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmluYWxseSwgcmVwbGFjZSBlYWNoIHRhZ2dlZCBwYXJ0IG9mIHRleHQgd2l0aCBhIGxpbmsgZWxlbWVudFxyXG4gICAgICAgIHJldHVybiB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9MSU5LLCAoXywgdCwgaykgPT5cclxuICAgICAgICAgICAgYDxhIGhyZWY9JyR7bGlua3Nba119JyB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub29wZW5lclwiPiR7dH08L2E+YFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIHBhcnNpbmcgZGF0YSBmcm9tIHN0cmluZ3MgKi9cclxuY2xhc3MgUGFyc2Vcclxue1xyXG4gICAgLyoqIFBhcnNlcyBhIGdpdmVuIHN0cmluZyBpbnRvIGEgYm9vbGVhbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sZWFuKHN0cjogc3RyaW5nKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICBzdHIgPSBzdHIudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgICAgICAgaWYgKHN0ciA9PT0gJ3RydWUnIHx8IHN0ciA9PT0gJzEnKVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBpZiAoc3RyID09PSAnZmFsc2UnIHx8IHN0ciA9PT0gJzAnKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIHRocm93IEVycm9yKCBMLkJBRF9CT09MRUFOKHN0cikgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZ2VuZXJhdGluZyByYW5kb20gZGF0YSAqL1xyXG5jbGFzcyBSYW5kb21cclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSBpbnRlZ2VyIGZyb20gdGhlIGdpdmVuIHJhbmdlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBtaW4gTWluaW11bSBpbnRlZ2VyIHRvIHBpY2ssIGluY2x1c2l2ZVxyXG4gICAgICogQHBhcmFtIG1heCBNYXhpbXVtIGludGVnZXIgdG8gcGljaywgaW5jbHVzaXZlXHJcbiAgICAgKiBAcmV0dXJucyBSYW5kb20gaW50ZWdlciB3aXRoaW4gdGhlIGdpdmVuIHJhbmdlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50KG1pbjogbnVtYmVyID0gMCwgbWF4OiBudW1iZXIgPSAxKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBNYXRoLmZsb29yKCBNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbikgKSArIG1pbjtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gZWxlbWVudCBmcm9tIGEgZ2l2ZW4gYXJyYXktbGlrZSBvYmplY3Qgd2l0aCBhIGxlbmd0aCBwcm9wZXJ0eSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhcnJheShhcnI6IExlbmd0aGFibGUpIDogYW55XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGFyclsgUmFuZG9tLmludCgwLCBhcnIubGVuZ3RoKSBdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTcGxpY2VzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFycmF5U3BsaWNlPFQ+KGFycjogVFtdKSA6IFRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gYXJyLnNwbGljZShSYW5kb20uaW50KDAsIGFyci5sZW5ndGgpLCAxKVswXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20ga2V5IGZyb20gYSBnaXZlbiBvYmplY3QgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgb2JqZWN0S2V5KG9iajoge30pIDogYW55XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSggT2JqZWN0LmtleXMob2JqKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgdHJ1ZSBvciBmYWxzZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIENoYW5jZSBvdXQgb2YgMTAwLCB0byBwaWNrIGB0cnVlYFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJvb2woY2hhbmNlOiBudW1iZXIgPSA1MCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5pbnQoMCwgMTAwKSA8IGNoYW5jZTtcclxuICAgIH1cclxufVxyXG4iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IGNsYXNzIGZvciBhdWRpbyBmdW5jdGlvbmFsaXR5ICovXHJcbmNsYXNzIFNvdW5kc1xyXG57XHJcbiAgICAvKipcclxuICAgICAqIERlY29kZXMgdGhlIGdpdmVuIGF1ZGlvIGZpbGUgaW50byByYXcgYXVkaW8gZGF0YS4gVGhpcyBpcyBhIHdyYXBwZXIgZm9yIHRoZSBvbGRlclxyXG4gICAgICogY2FsbGJhY2stYmFzZWQgc3ludGF4LCBzaW5jZSBpdCBpcyB0aGUgb25seSBvbmUgaU9TIGN1cnJlbnRseSBzdXBwb3J0cy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBBdWRpbyBjb250ZXh0IHRvIHVzZSBmb3IgZGVjb2RpbmdcclxuICAgICAqIEBwYXJhbSBidWZmZXIgQnVmZmVyIG9mIGVuY29kZWQgZmlsZSBkYXRhIChlLmcuIG1wMykgdG8gZGVjb2RlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXN5bmMgZGVjb2RlKGNvbnRleHQ6IEF1ZGlvQ29udGV4dCwgYnVmZmVyOiBBcnJheUJ1ZmZlcilcclxuICAgICAgICA6IFByb21pc2U8QXVkaW9CdWZmZXI+XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlIDxBdWRpb0J1ZmZlcj4gKCAocmVzb2x2ZSwgcmVqZWN0KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQuZGVjb2RlQXVkaW9EYXRhKGJ1ZmZlciwgcmVzb2x2ZSwgcmVqZWN0KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIHN0cmluZ3MgKi9cclxuY2xhc3MgU3RyaW5nc1xyXG57XHJcbiAgICAvKiogQ2hlY2tzIGlmIHRoZSBnaXZlbiBzdHJpbmcgaXMgbnVsbCwgb3IgZW1wdHkgKHdoaXRlc3BhY2Ugb25seSBvciB6ZXJvLWxlbmd0aCkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaXNOdWxsT3JFbXB0eShzdHI6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiAhc3RyIHx8ICFzdHIudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJldHR5LXByaW50J3MgYSBnaXZlbiBsaXN0IG9mIHN0YXRpb25zLCB3aXRoIGNvbnRleHQgc2Vuc2l0aXZlIGV4dHJhcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZXMgTGlzdCBvZiBzdGF0aW9uIGNvZGVzIHRvIGpvaW5cclxuICAgICAqIEBwYXJhbSBjb250ZXh0IExpc3QncyBjb250ZXh0LiBJZiAnY2FsbGluZycsIGhhbmRsZXMgc3BlY2lhbCBjYXNlXHJcbiAgICAgKiBAcmV0dXJucyBQcmV0dHktcHJpbnRlZCBsaXN0IG9mIGdpdmVuIHN0YXRpb25zXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbVN0YXRpb25MaXN0KGNvZGVzOiBzdHJpbmdbXSwgY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSAnJztcclxuICAgICAgICBsZXQgbmFtZXMgID0gY29kZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgbmFtZXMuZm9yRWFjaCggKGMsIGkpID0+IG5hbWVzW2ldID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oYykgKTtcclxuXHJcbiAgICAgICAgaWYgKG5hbWVzLmxlbmd0aCA9PT0gMSlcclxuICAgICAgICAgICAgcmVzdWx0ID0gKGNvbnRleHQgPT09ICdjYWxsaW5nJylcclxuICAgICAgICAgICAgICAgID8gYCR7bmFtZXNbMF19IG9ubHlgXHJcbiAgICAgICAgICAgICAgICA6IG5hbWVzWzBdO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsYXN0U3RhdGlvbiA9IG5hbWVzLnBvcCgpO1xyXG5cclxuICAgICAgICAgICAgcmVzdWx0ICA9IG5hbWVzLmpvaW4oJywgJyk7XHJcbiAgICAgICAgICAgIHJlc3VsdCArPSBgIGFuZCAke2xhc3RTdGF0aW9ufWA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJldHR5LXByaW50cyB0aGUgZ2l2ZW4gZGF0ZSBvciBob3VycyBhbmQgbWludXRlcyBpbnRvIGEgMjQtaG91ciB0aW1lIChlLmcuIDAxOjA5KS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaG91cnMgSG91cnMsIGZyb20gMCB0byAyMywgb3IgRGF0ZSBvYmplY3RcclxuICAgICAqIEBwYXJhbSBtaW51dGVzIE1pbnV0ZXMsIGZyb20gMCB0byA1OVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21UaW1lKGhvdXJzOiBudW1iZXIgfCBEYXRlLCBtaW51dGVzOiBudW1iZXIgPSAwKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmIChob3VycyBpbnN0YW5jZW9mIERhdGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBtaW51dGVzID0gaG91cnMuZ2V0TWludXRlcygpO1xyXG4gICAgICAgICAgICBob3VycyAgID0gaG91cnMuZ2V0SG91cnMoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBob3Vycy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJykgKyAnOicgK1xyXG4gICAgICAgICAgICBtaW51dGVzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYW5zIHVwIHRoZSBnaXZlbiB0ZXh0IG9mIGV4Y2VzcyB3aGl0ZXNwYWNlIGFuZCBhbnkgbmV3bGluZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2xlYW4odGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0ZXh0LnRyaW0oKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xcblxccl0vZ2ksICAgJycgIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcc3syLH0vZ2ksICAgJyAnIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccyhbLixdKS9naSwgJyQxJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0cm9uZ2x5IGNvbXByZXNzZXMgdGhlIGdpdmVuIHN0cmluZyB0byBvbmUgbW9yZSBmaWxlbmFtZSBmcmllbmRseSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaWxlbmFtZSh0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRleHRcclxuICAgICAgICAgICAgLnRvTG93ZXJDYXNlKClcclxuICAgICAgICAgICAgLy8gUmVwbGFjZSBwbHVyYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pZXNcXGIvZywgJ3knKVxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgY29tbW9uIHdvcmRzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGIoYXxhbnxhdHxiZXxvZnxvbnx0aGV8dG98aW58aXN8aGFzfGJ5fHdpdGgpXFxiL2csICcnKVxyXG4gICAgICAgICAgICAudHJpbSgpXHJcbiAgICAgICAgICAgIC8vIENvbnZlcnQgc3BhY2VzIHRvIHVuZGVyc2NvcmVzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMrL2csICdfJylcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGFsbCBub24tYWxwaGFudW1lcmljYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXmEtejAtOV9dL2csICcnKVxyXG4gICAgICAgICAgICAvLyBMaW1pdCB0byAxMDAgY2hhcnM7IG1vc3Qgc3lzdGVtcyBzdXBwb3J0IG1heC4gMjU1IGJ5dGVzIGluIGZpbGVuYW1lc1xyXG4gICAgICAgICAgICAuc3Vic3RyaW5nKDAsIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGZpcnN0IG1hdGNoIG9mIGEgcGF0dGVybiBpbiBhIHN0cmluZywgb3IgdW5kZWZpbmVkIGlmIG5vdCBmb3VuZCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaXJzdE1hdGNoKHRleHQ6IHN0cmluZywgcGF0dGVybjogUmVnRXhwLCBpZHg6IG51bWJlcilcclxuICAgICAgICA6IHN0cmluZyB8IHVuZGVmaW5lZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBtYXRjaCA9IHRleHQubWF0Y2gocGF0dGVybik7XHJcblxyXG4gICAgICAgIHJldHVybiAobWF0Y2ggJiYgbWF0Y2hbaWR4XSlcclxuICAgICAgICAgICAgPyBtYXRjaFtpZHhdXHJcbiAgICAgICAgICAgIDogdW5kZWZpbmVkO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVW5pb24gdHlwZSBmb3IgaXRlcmFibGUgdHlwZXMgd2l0aCBhIC5sZW5ndGggcHJvcGVydHkgKi9cclxudHlwZSBMZW5ndGhhYmxlID0gQXJyYXk8YW55PiB8IE5vZGVMaXN0IHwgSFRNTENvbGxlY3Rpb24gfCBzdHJpbmc7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHBsYXRmb3JtIGFzIGEgZGlnaXQgYW5kIG9wdGlvbmFsIGxldHRlciB0dXBsZSAqL1xyXG50eXBlIFBsYXRmb3JtID0gW3N0cmluZywgc3RyaW5nXTtcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgZ2VuZXJpYyBrZXktdmFsdWUgZGljdGlvbmFyeSwgd2l0aCBzdHJpbmcga2V5cyAqL1xyXG50eXBlIERpY3Rpb25hcnk8VD4gPSB7IFtpbmRleDogc3RyaW5nXTogVCB9O1xyXG5cclxuLyoqIERlZmluZXMgdGhlIGRhdGEgcmVmZXJlbmNlcyBjb25maWcgb2JqZWN0IHBhc3NlZCBpbnRvIFJBRy5tYWluIG9uIGluaXQgKi9cclxuaW50ZXJmYWNlIERhdGFSZWZzXHJcbntcclxuICAgIC8qKiBTZWxlY3RvciBmb3IgZ2V0dGluZyB0aGUgcGhyYXNlIHNldCBYTUwgSUZyYW1lIGVsZW1lbnQgKi9cclxuICAgIHBocmFzZXNldEVtYmVkIDogc3RyaW5nO1xyXG4gICAgLyoqIFJhdyBhcnJheSBvZiBleGN1c2VzIGZvciB0cmFpbiBkZWxheXMgb3IgY2FuY2VsbGF0aW9ucyB0byB1c2UgKi9cclxuICAgIGV4Y3VzZXNEYXRhICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIG5hbWVzIGZvciBzcGVjaWFsIHRyYWlucyB0byB1c2UgKi9cclxuICAgIG5hbWVkRGF0YSAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIG5hbWVzIGZvciBzZXJ2aWNlcy9uZXR3b3JrcyB0byB1c2UgKi9cclxuICAgIHNlcnZpY2VzRGF0YSAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBjb2RlcyBhbmQgbmFtZXMgdG8gdXNlICovXHJcbiAgICBzdGF0aW9uc0RhdGEgICA6IERpY3Rpb25hcnk8c3RyaW5nPjtcclxufVxyXG5cclxuLyoqIEZpbGwgaW5zIGZvciB2YXJpb3VzIG1pc3NpbmcgZGVmaW5pdGlvbnMgb2YgbW9kZXJuIEphdmFzY3JpcHQgZmVhdHVyZXMgKi9cclxuXHJcbmludGVyZmFjZSBXaW5kb3dcclxue1xyXG4gICAgb251bmhhbmRsZWRyZWplY3Rpb246IEVycm9yRXZlbnRIYW5kbGVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU3RyaW5nXHJcbntcclxuICAgIHBhZFN0YXJ0KHRhcmdldExlbmd0aDogbnVtYmVyLCBwYWRTdHJpbmc/OiBzdHJpbmcpIDogc3RyaW5nO1xyXG4gICAgcGFkRW5kKHRhcmdldExlbmd0aDogbnVtYmVyLCBwYWRTdHJpbmc/OiBzdHJpbmcpIDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXJyYXk8VD5cclxue1xyXG4gICAgaW5jbHVkZXMoc2VhcmNoRWxlbWVudDogVCwgZnJvbUluZGV4PzogbnVtYmVyKSA6IGJvb2xlYW47XHJcbn1cclxuXHJcbmludGVyZmFjZSBIVE1MRWxlbWVudFxyXG57XHJcbiAgICBsYWJlbHMgOiBOb2RlTGlzdE9mPEhUTUxFbGVtZW50PjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEF1ZGlvQ29udGV4dEJhc2Vcclxue1xyXG4gICAgYXVkaW9Xb3JrbGV0IDogQXVkaW9Xb3JrbGV0O1xyXG59XHJcblxyXG50eXBlIFNhbXBsZUNoYW5uZWxzID0gRmxvYXQzMkFycmF5W11bXTtcclxuXHJcbmRlY2xhcmUgY2xhc3MgQXVkaW9Xb3JrbGV0UHJvY2Vzc29yXHJcbntcclxuICAgIHN0YXRpYyBwYXJhbWV0ZXJEZXNjcmlwdG9ycyA6IEF1ZGlvUGFyYW1EZXNjcmlwdG9yW107XHJcblxyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKG9wdGlvbnM/OiBBdWRpb1dvcmtsZXROb2RlT3B0aW9ucyk7XHJcbiAgICByZWFkb25seSBwb3J0PzogTWVzc2FnZVBvcnQ7XHJcblxyXG4gICAgcHJvY2VzcyhcclxuICAgICAgICBpbnB1dHM6IFNhbXBsZUNoYW5uZWxzLFxyXG4gICAgICAgIG91dHB1dHM6IFNhbXBsZUNoYW5uZWxzLFxyXG4gICAgICAgIHBhcmFtZXRlcnM6IERpY3Rpb25hcnk8RmxvYXQzMkFycmF5PlxyXG4gICAgKSA6IGJvb2xlYW47XHJcbn1cclxuXHJcbmludGVyZmFjZSBBdWRpb1dvcmtsZXROb2RlT3B0aW9ucyBleHRlbmRzIEF1ZGlvTm9kZU9wdGlvbnNcclxue1xyXG4gICAgbnVtYmVyT2ZJbnB1dHM/IDogbnVtYmVyO1xyXG4gICAgbnVtYmVyT2ZPdXRwdXRzPyA6IG51bWJlcjtcclxuICAgIG91dHB1dENoYW5uZWxDb3VudD8gOiBudW1iZXJbXTtcclxuICAgIHBhcmFtZXRlckRhdGE/IDoge1tpbmRleDogc3RyaW5nXSA6IG51bWJlcn07XHJcbiAgICBwcm9jZXNzb3JPcHRpb25zPyA6IGFueTtcclxufVxyXG5cclxuaW50ZXJmYWNlIE1lZGlhVHJhY2tDb25zdHJhaW50U2V0XHJcbntcclxuICAgIGF1dG9HYWluQ29udHJvbD86IGJvb2xlYW4gfCBDb25zdHJhaW5Cb29sZWFuUGFyYW1ldGVycztcclxuICAgIG5vaXNlU3VwcHJlc3Npb24/OiBib29sZWFuIHwgQ29uc3RyYWluQm9vbGVhblBhcmFtZXRlcnM7XHJcbn1cclxuXHJcbmRlY2xhcmUgZnVuY3Rpb24gcmVnaXN0ZXJQcm9jZXNzb3IobmFtZTogc3RyaW5nLCBjdG9yOiBBdWRpb1dvcmtsZXRQcm9jZXNzb3IpIDogdm9pZDsiLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBIb2xkcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gKi9cclxuY2xhc3MgQ29uZmlnXHJcbntcclxuICAgIC8qKiBJZiB1c2VyIGhhcyBjbGlja2VkIHNodWZmbGUgYXQgbGVhc3Qgb25jZSAqL1xyXG4gICAgcHVibGljIGNsaWNrZWRHZW5lcmF0ZSA6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIC8qKiBWb2x1bWUgZm9yIHNwZWVjaCB0byBiZSBzZXQgYXQgKi9cclxuICAgIHB1YmxpYyAgc3BlZWNoVm9sICAgICAgOiBudW1iZXIgID0gMS4wO1xyXG4gICAgLyoqIFBpdGNoIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgIHNwZWVjaFBpdGNoICAgIDogbnVtYmVyICA9IDEuMDtcclxuICAgIC8qKiBSYXRlIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgIHNwZWVjaFJhdGUgICAgIDogbnVtYmVyICA9IDEuMDtcclxuICAgIC8qKiBDaG9pY2Ugb2Ygc3BlZWNoIHZvaWNlIHRvIHVzZSwgYXMgZ2V0Vm9pY2VzIGluZGV4IG9yIC0xIGlmIHVuc2V0ICovXHJcbiAgICBwcml2YXRlIF9zcGVlY2hWb2ljZSAgIDogbnVtYmVyICA9IC0xO1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gdXNlIHRoZSBWT1ggZW5naW5lICovXHJcbiAgICBwdWJsaWMgIHZveEVuYWJsZWQgICAgIDogYm9vbGVhbiA9IHRydWU7XHJcbiAgICAvKiogUmVsYXRpdmUgb3IgYWJzb2x1dGUgVVJMIG9mIHRoZSBWT1ggdm9pY2UgdG8gdXNlICovXHJcbiAgICBwdWJsaWMgIHZveFBhdGggICAgICAgIDogc3RyaW5nICA9ICdodHRwczovL3JveWN1cnRpcy5naXRodWIuaW8vUkFHLVZPWC1Sb3knO1xyXG4gICAgLyoqIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCBvZiB0aGUgY3VzdG9tIFZPWCB2b2ljZSB0byB1c2UgKi9cclxuICAgIHB1YmxpYyAgdm94Q3VzdG9tUGF0aCAgOiBzdHJpbmcgID0gJyc7XHJcbiAgICAvKiogSW1wdWxzZSByZXNwb25zZSB0byB1c2UgZm9yIFZPWCdzIHJldmVyYiAqL1xyXG4gICAgcHVibGljICB2b3hSZXZlcmIgICAgICA6IHN0cmluZyAgPSAnaXIuc3RhbGJhbnNfYV9tb25vLndhdic7XHJcbiAgICAvKiogVk9YIGtleSBvZiB0aGUgY2hpbWUgdG8gdXNlIHByaW9yIHRvIHNwZWFraW5nICovXHJcbiAgICBwdWJsaWMgIHZveENoaW1lICAgICAgIDogc3RyaW5nICA9ICcnO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UsIGFzIGdldFZvaWNlcyBpbmRleC4gQmVjYXVzZSBvZiB0aGUgYXN5bmMgbmF0dXJlIG9mXHJcbiAgICAgKiBnZXRWb2ljZXMsIHRoZSBkZWZhdWx0IHZhbHVlIHdpbGwgYmUgZmV0Y2hlZCBmcm9tIGl0IGVhY2ggdGltZS5cclxuICAgICAqL1xyXG4gICAgZ2V0IHNwZWVjaFZvaWNlKCkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICAvLyBUT0RPOiB0aGlzIGlzIHByb2JhYmx5IGJldHRlciBvZmYgdXNpbmcgdm9pY2UgbmFtZXNcclxuICAgICAgICAvLyBJZiB0aGVyZSdzIGEgdXNlci1kZWZpbmVkIHZhbHVlLCB1c2UgdGhhdFxyXG4gICAgICAgIGlmICAodGhpcy5fc3BlZWNoVm9pY2UgIT09IC0xKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3BlZWNoVm9pY2U7XHJcblxyXG4gICAgICAgIC8vIFNlbGVjdCBFbmdsaXNoIHZvaWNlcyBieSBkZWZhdWx0XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIHYgPSBSQUcuc3BlZWNoLmJyb3dzZXJWb2ljZXM7IGkgPCB2Lmxlbmd0aCA7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsYW5nID0gdltpXS5sYW5nO1xyXG5cclxuICAgICAgICAgICAgaWYgKGxhbmcgPT09ICdlbi1HQicgfHwgbGFuZyA9PT0gJ2VuLVVTJylcclxuICAgICAgICAgICAgICAgIHJldHVybiBpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRWxzZSwgZmlyc3Qgdm9pY2Ugb24gdGhlIGxpc3RcclxuICAgICAgICByZXR1cm4gMDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY2hvaWNlIG9mIHNwZWVjaCB0byB1c2UsIGFzIGdldFZvaWNlcyBpbmRleCAqL1xyXG4gICAgc2V0IHNwZWVjaFZvaWNlKHZhbHVlOiBudW1iZXIpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3BlZWNoVm9pY2UgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2FmZWx5IGxvYWRzIHJ1bnRpbWUgY29uZmlndXJhdGlvbiBmcm9tIGxvY2FsU3RvcmFnZSwgaWYgYW55ICovXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IobG9hZDogYm9vbGVhbilcclxuICAgIHtcclxuICAgICAgICBsZXQgc2V0dGluZ3MgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3NldHRpbmdzJyk7XHJcblxyXG4gICAgICAgIGlmICghbG9hZCB8fCAhc2V0dGluZ3MpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgY29uZmlnID0gSlNPTi5wYXJzZShzZXR0aW5ncyk7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgY29uZmlnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfTE9BRF9GQUlMKGUubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBzYXZlcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gdG8gbG9jYWxTdG9yYWdlICovXHJcbiAgICBwdWJsaWMgc2F2ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCAnc2V0dGluZ3MnLCBKU09OLnN0cmluZ2lmeSh0aGlzKSApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGFsZXJ0KCBMLkNPTkZJR19TQVZFX0ZBSUwoZS5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogU2FmZWx5IGRlbGV0ZXMgcnVudGltZSBjb25maWd1cmF0aW9uIGZyb20gbG9jYWxTdG9yYWdlIGFuZCByZXNldHMgc3RhdGUgKi9cclxuICAgIHB1YmxpYyByZXNldCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbiggdGhpcywgbmV3IENvbmZpZyhmYWxzZSkgKTtcclxuICAgICAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdzZXR0aW5ncycpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGFsZXJ0KCBMLkNPTkZJR19SRVNFVF9GQUlMKGUubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYW5hZ2VzIGRhdGEgZm9yIGV4Y3VzZXMsIHRyYWlucywgc2VydmljZXMgYW5kIHN0YXRpb25zICovXHJcbmNsYXNzIERhdGFiYXNlXHJcbntcclxuICAgIC8qKiBMb2FkZWQgZGF0YXNldCBvZiBkZWxheSBvciBjYW5jZWxsYXRpb24gZXhjdXNlcyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBleGN1c2VzICAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRhdGFzZXQgb2YgbmFtZWQgdHJhaW5zICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IG5hbWVkICAgICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGF0YXNldCBvZiBzZXJ2aWNlIG9yIG5ldHdvcmsgbmFtZXMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc2VydmljZXMgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkaWN0aW9uYXJ5IG9mIHN0YXRpb24gbmFtZXMsIHdpdGggdGhyZWUtbGV0dGVyIGNvZGUga2V5cyAoZS5nLiBBQkMpICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHN0YXRpb25zICAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz47XHJcbiAgICAvKiogTG9hZGVkIFhNTCBkb2N1bWVudCBjb250YWluaW5nIHBocmFzZXNldCBkYXRhICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHBocmFzZXNldHMgICAgOiBEb2N1bWVudDtcclxuICAgIC8qKiBBbW91bnQgb2Ygc3RhdGlvbnMgaW4gdGhlIGN1cnJlbnRseSBsb2FkZWQgZGF0YXNldCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzdGF0aW9uc0NvdW50IDogbnVtYmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihkYXRhUmVmczogRGF0YVJlZnMpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ICA9IGRhdGFSZWZzLnBocmFzZXNldEVtYmVkO1xyXG4gICAgICAgIGxldCBpZnJhbWUgPSBET00ucmVxdWlyZSA8SFRNTElGcmFtZUVsZW1lbnQ+IChxdWVyeSk7XHJcblxyXG4gICAgICAgIGlmICghaWZyYW1lLmNvbnRlbnREb2N1bWVudClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRShxdWVyeSkgKTtcclxuXHJcbiAgICAgICAgdGhpcy5waHJhc2VzZXRzICAgID0gaWZyYW1lLmNvbnRlbnREb2N1bWVudDtcclxuICAgICAgICB0aGlzLmV4Y3VzZXMgICAgICAgPSBkYXRhUmVmcy5leGN1c2VzRGF0YTtcclxuICAgICAgICB0aGlzLm5hbWVkICAgICAgICAgPSBkYXRhUmVmcy5uYW1lZERhdGE7XHJcbiAgICAgICAgdGhpcy5zZXJ2aWNlcyAgICAgID0gZGF0YVJlZnMuc2VydmljZXNEYXRhO1xyXG4gICAgICAgIHRoaXMuc3RhdGlvbnMgICAgICA9IGRhdGFSZWZzLnN0YXRpb25zRGF0YTtcclxuICAgICAgICB0aGlzLnN0YXRpb25zQ291bnQgPSBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGg7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbRGF0YWJhc2VdIEVudHJpZXMgbG9hZGVkOicpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRFeGN1c2VzOicsICAgICAgdGhpcy5leGN1c2VzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdE5hbWVkIHRyYWluczonLCB0aGlzLm5hbWVkLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdFNlcnZpY2VzOicsICAgICB0aGlzLnNlcnZpY2VzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdFN0YXRpb25zOicsICAgICB0aGlzLnN0YXRpb25zQ291bnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBleGN1c2UgZm9yIGEgZGVsYXkgb3IgY2FuY2VsbGF0aW9uICovXHJcbiAgICBwdWJsaWMgcGlja0V4Y3VzZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLmV4Y3VzZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHBpY2tOYW1lZCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLm5hbWVkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENsb25lcyBhbmQgZ2V0cyBwaHJhc2Ugd2l0aCB0aGUgZ2l2ZW4gSUQsIG9yIG51bGwgaWYgaXQgZG9lc24ndCBleGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWQgSUQgb2YgdGhlIHBocmFzZSB0byBnZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZShpZDogc3RyaW5nKSA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSB0aGlzLnBocmFzZXNldHMucXVlcnlTZWxlY3RvcigncGhyYXNlIycgKyBpZCkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmIChyZXN1bHQpXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgcGhyYXNlc2V0IHdpdGggdGhlIGdpdmVuIElELCBvciBudWxsIGlmIGl0IGRvZXNuJ3QgZXhpc3QuIE5vdGUgdGhhdCB0aGVcclxuICAgICAqIHJldHVybmVkIHBocmFzZXNldCBjb21lcyBmcm9tIHRoZSBYTUwgZG9jdW1lbnQsIHNvIGl0IHNob3VsZCBub3QgYmUgbXV0YXRlZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWQgSUQgb2YgdGhlIHBocmFzZXNldCB0byBnZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldChpZDogc3RyaW5nKSA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnBocmFzZXNldHMucXVlcnlTZWxlY3RvcigncGhyYXNlc2V0IycgKyBpZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIHJhaWwgbmV0d29yayBuYW1lICovXHJcbiAgICBwdWJsaWMgcGlja1NlcnZpY2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5zZXJ2aWNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSBzdGF0aW9uIGNvZGUgZnJvbSB0aGUgZGF0YXNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZSBMaXN0IG9mIGNvZGVzIHRvIGV4Y2x1ZGUuIE1heSBiZSBpZ25vcmVkIGlmIHNlYXJjaCB0YWtlcyB0b28gbG9uZy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHBpY2tTdGF0aW9uQ29kZShleGNsdWRlPzogc3RyaW5nW10pIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgLy8gR2l2ZSB1cCBmaW5kaW5nIHJhbmRvbSBzdGF0aW9uIHRoYXQncyBub3QgaW4gdGhlIGdpdmVuIGxpc3QsIGlmIHdlIHRyeSBtb3JlXHJcbiAgICAgICAgLy8gdGltZXMgdGhlbiB0aGVyZSBhcmUgc3RhdGlvbnMuIEluYWNjdXJhdGUsIGJ1dCBhdm9pZHMgaW5maW5pdGUgbG9vcHMuXHJcbiAgICAgICAgaWYgKGV4Y2x1ZGUpIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zdGF0aW9uc0NvdW50OyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCAhZXhjbHVkZS5pbmNsdWRlcyh2YWx1ZSkgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5vYmplY3RLZXkodGhpcy5zdGF0aW9ucyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBzdGF0aW9uIG5hbWUgZnJvbSB0aGUgZ2l2ZW4gdGhyZWUgbGV0dGVyIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBnZXQgdGhlIG5hbWUgb2ZcclxuICAgICAqIEBwYXJhbSBmaWx0ZXJlZCBXaGV0aGVyIHRvIGZpbHRlciBvdXQgcGFyZW50aGVzaXplZCBsb2NhdGlvbiBjb250ZXh0XHJcbiAgICAgKiBAcmV0dXJucyBTdGF0aW9uIG5hbWUgZm9yIHRoZSBnaXZlbiBjb2RlLCBmaWx0ZXJlZCBpZiBzcGVjaWZpZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29kZTogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gdGhpcy5zdGF0aW9uc1tjb2RlXTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoIXN0YXRpb24pXHJcbiAgICAgICAgICAgIHJldHVybiBMLkRCX1VOS05PV05fU1RBVElPTihjb2RlKTtcclxuICAgICAgICBlbHNlIGlmICggU3RyaW5ncy5pc051bGxPckVtcHR5KHN0YXRpb24pIClcclxuICAgICAgICAgICAgcmV0dXJuIEwuREJfRU1QVFlfU1RBVElPTihjb2RlKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHN0YXRpb247XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSByYW5nZSBvZiBzdGF0aW9uIGNvZGVzLCBlbnN1cmluZyB0aGVyZSBhcmUgbm8gZHVwbGljYXRlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gYW1vdW50IG9mIHN0YXRpb25zIHRvIHBpY2tcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBhbW91bnQgb2Ygc3RhdGlvbnMgdG8gcGlja1xyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGVcclxuICAgICAqIEByZXR1cm5zIEEgbGlzdCBvZiB1bmlxdWUgc3RhdGlvbiBuYW1lc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcGlja1N0YXRpb25Db2RlcyhtaW4gPSAxLCBtYXggPSAxNiwgZXhjbHVkZT8gOiBzdHJpbmdbXSkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChtYXggLSBtaW4gPiBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX1RPT19NQU5ZX1NUQVRJT05TKCkgKTtcclxuXHJcbiAgICAgICAgbGV0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICAgICAgbGV0IGxlbmd0aCA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIGxldCB0cmllcyAgPSAwO1xyXG5cclxuICAgICAgICB3aGlsZSAocmVzdWx0Lmxlbmd0aCA8IGxlbmd0aClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgLy8gR2l2ZSB1cCB0cnlpbmcgdG8gYXZvaWQgZHVwbGljYXRlcywgaWYgd2UgdHJ5IG1vcmUgdGltZXMgdGhhbiB0aGVyZSBhcmVcclxuICAgICAgICAgICAgLy8gc3RhdGlvbnMgYXZhaWxhYmxlLiBJbmFjY3VyYXRlLCBidXQgZ29vZCBlbm91Z2guXHJcbiAgICAgICAgICAgIGlmICh0cmllcysrID49IHRoaXMuc3RhdGlvbnNDb3VudClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBnaXZlbiBhbiBleGNsdXNpb24gbGlzdCwgY2hlY2sgYWdhaW5zdCBib3RoIHRoYXQgYW5kIHJlc3VsdHNcclxuICAgICAgICAgICAgZWxzZSBpZiAoIGV4Y2x1ZGUgJiYgIWV4Y2x1ZGUuaW5jbHVkZXMoa2V5KSAmJiAhcmVzdWx0LmluY2x1ZGVzKGtleSkgKVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIG5vdCwganVzdCBjaGVjayB3aGF0IHJlc3VsdHMgd2UndmUgYWxyZWFkeSBmb3VuZFxyXG4gICAgICAgICAgICBlbHNlIGlmICggIWV4Y2x1ZGUgJiYgIXJlc3VsdC5pbmNsdWRlcyhrZXkpIClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFpbiBjbGFzcyBvZiB0aGUgZW50aXJlIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IgYXBwbGljYXRpb24gKi9cclxuY2xhc3MgUkFHXHJcbntcclxuICAgIC8qKiBHZXRzIHRoZSBjb25maWd1cmF0aW9uIGhvbGRlciAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb25maWcgICA6IENvbmZpZztcclxuICAgIC8qKiBHZXRzIHRoZSBkYXRhYmFzZSBtYW5hZ2VyLCB3aGljaCBob2xkcyBwaHJhc2UsIHN0YXRpb24gYW5kIHRyYWluIGRhdGEgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZGF0YWJhc2UgOiBEYXRhYmFzZTtcclxuICAgIC8qKiBHZXRzIHRoZSBwaHJhc2UgbWFuYWdlciwgd2hpY2ggZ2VuZXJhdGVzIEhUTUwgcGhyYXNlcyBmcm9tIFhNTCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VyICA6IFBocmFzZXI7XHJcbiAgICAvKiogR2V0cyB0aGUgc3BlZWNoIGVuZ2luZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzcGVlY2ggICA6IFNwZWVjaDtcclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHRyYWluIGFuZCBzdGF0aW9uIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRlICAgIDogU3RhdGU7XHJcbiAgICAvKiogR2V0cyB0aGUgdmlldyBjb250cm9sbGVyLCB3aGljaCBtYW5hZ2VzIFVJIGludGVyYWN0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZpZXdzICAgIDogVmlld3M7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFbnRyeSBwb2ludCBmb3IgUkFHLCB0byBiZSBjYWxsZWQgZnJvbSBKYXZhc2NyaXB0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBkYXRhUmVmcyBDb25maWd1cmF0aW9uIG9iamVjdCwgd2l0aCByYWlsIGRhdGEgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbWFpbihkYXRhUmVmczogRGF0YVJlZnMpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5vbmVycm9yICAgICAgICAgICAgICA9IGVycm9yID0+IFJBRy5wYW5pYyhlcnJvcik7XHJcbiAgICAgICAgd2luZG93Lm9udW5oYW5kbGVkcmVqZWN0aW9uID0gZXJyb3IgPT4gUkFHLnBhbmljKGVycm9yKTtcclxuXHJcbiAgICAgICAgSTE4bi5pbml0KCk7XHJcblxyXG4gICAgICAgIFJBRy5jb25maWcgICA9IG5ldyBDb25maWcodHJ1ZSk7XHJcbiAgICAgICAgUkFHLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlKGRhdGFSZWZzKTtcclxuICAgICAgICBSQUcudmlld3MgICAgPSBuZXcgVmlld3MoKTtcclxuICAgICAgICBSQUcucGhyYXNlciAgPSBuZXcgUGhyYXNlcigpO1xyXG4gICAgICAgIFJBRy5zcGVlY2ggICA9IG5ldyBTcGVlY2goKTtcclxuXHJcbiAgICAgICAgLy8gQmVnaW5cclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLldFTENPTUUoKSApO1xyXG4gICAgICAgIFJBRy5nZW5lcmF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZW5lcmF0ZXMgYSBuZXcgcmFuZG9tIHBocmFzZSBhbmQgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2VuZXJhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUgPSBuZXcgU3RhdGUoKTtcclxuICAgICAgICBSQUcuc3RhdGUuZ2VuRGVmYXVsdFN0YXRlKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5nZW5lcmF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBMb2FkcyBzdGF0ZSBmcm9tIGdpdmVuIEpTT04gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbG9hZChqc29uOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZSA9IE9iamVjdC5hc3NpZ24oIG5ldyBTdGF0ZSgpLCBKU09OLnBhcnNlKGpzb24pICkgYXMgU3RhdGU7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5nZW5lcmF0ZSgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9GUk9NX1NUT1JBR0UoKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHbG9iYWwgZXJyb3IgaGFuZGxlcjsgdGhyb3dzIHVwIGEgYmlnIHJlZCBwYW5pYyBzY3JlZW4gb24gdW5jYXVnaHQgZXJyb3IgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHBhbmljKGVycm9yOiBzdHJpbmcgfCBFdmVudCA9IFwiVW5rbm93biBlcnJvclwiKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBtc2cgPSAnPGRpdiBpZD1cInBhbmljU2NyZWVuXCIgY2xhc3M9XCJ3YXJuaW5nU2NyZWVuXCI+JztcclxuICAgICAgICBtc2cgICAgKz0gJzxoMT5cIldlIGFyZSBzb3JyeSB0byBhbm5vdW5jZSB0aGF0Li4uXCI8L2gxPic7XHJcbiAgICAgICAgbXNnICAgICs9IGA8cD5SQUcgaGFzIGNyYXNoZWQgYmVjYXVzZTogPGNvZGU+JHtlcnJvcn08L2NvZGU+PC9wPmA7XHJcbiAgICAgICAgbXNnICAgICs9IGA8cD5QbGVhc2Ugb3BlbiB0aGUgY29uc29sZSBmb3IgbW9yZSBpbmZvcm1hdGlvbi48L3A+YDtcclxuICAgICAgICBtc2cgICAgKz0gJzwvZGl2Pic7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuaW5uZXJIVE1MID0gbXNnO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogRGlzcG9zYWJsZSBjbGFzcyB0aGF0IGhvbGRzIHN0YXRlIGZvciB0aGUgY3VycmVudCBzY2hlZHVsZSwgdHJhaW4sIGV0Yy4gKi9cclxuY2xhc3MgU3RhdGVcclxue1xyXG4gICAgLyoqIFN0YXRlIG9mIGNvbGxhcHNpYmxlIGVsZW1lbnRzLiBLZXkgaXMgcmVmZXJlbmNlIElELCB2YWx1ZSBpcyBjb2xsYXBzZWQuICovXHJcbiAgICBwcml2YXRlIF9jb2xsYXBzaWJsZXMgOiBEaWN0aW9uYXJ5PGJvb2xlYW4+ICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgY29hY2ggbGV0dGVyIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBsZXR0ZXIuICovXHJcbiAgICBwcml2YXRlIF9jb2FjaGVzICAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgaW50ZWdlciBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgaW50ZWdlci4gKi9cclxuICAgIHByaXZhdGUgX2ludGVnZXJzICAgICA6IERpY3Rpb25hcnk8bnVtYmVyPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBwaHJhc2VzZXQgcGhyYXNlIGNob2ljZXMuIEtleSBpcyByZWZlcmVuY2UgSUQsIHZhbHVlIGlzIGluZGV4LiAqL1xyXG4gICAgcHJpdmF0ZSBfcGhyYXNlc2V0cyAgIDogRGljdGlvbmFyeTxudW1iZXI+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHNlcnZpY2UgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIHNlcnZpY2UuICovXHJcbiAgICBwcml2YXRlIF9zZXJ2aWNlcyAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc3RhdGlvbiBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgc3RhdGlvbiBjb2RlLiAqL1xyXG4gICAgcHJpdmF0ZSBfc3RhdGlvbnMgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHN0YXRpb24gbGlzdCBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgYXJyYXkgb2YgY29kZXMuICovXHJcbiAgICBwcml2YXRlIF9zdGF0aW9uTGlzdHMgOiBEaWN0aW9uYXJ5PHN0cmluZ1tdPiA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgdGltZSBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgdGltZS4gKi9cclxuICAgIHByaXZhdGUgX3RpbWVzICAgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcblxyXG4gICAgLyoqIEN1cnJlbnRseSBjaG9zZW4gZXhjdXNlICovXHJcbiAgICBwcml2YXRlIF9leGN1c2U/ICAgOiBzdHJpbmc7XHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBwbGF0Zm9ybSAqL1xyXG4gICAgcHJpdmF0ZSBfcGxhdGZvcm0/IDogUGxhdGZvcm07XHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHJpdmF0ZSBfbmFtZWQ/ICAgIDogc3RyaW5nO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBjb2FjaCBsZXR0ZXIsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSBmcm9tIEEgdG8gWi5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIGxldHRlciBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldENvYWNoKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fY29hY2hlc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29hY2hlc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29hY2hlc1tjb250ZXh0XSA9IFJhbmRvbS5hcnJheShMLkxFVFRFUlMpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9jb2FjaGVzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGNvYWNoIGxldHRlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgbGV0dGVyIGZvclxyXG4gICAgICogQHBhcmFtIGNvYWNoIFZhbHVlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0Q29hY2goY29udGV4dDogc3RyaW5nLCBjb2FjaDogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9jb2FjaGVzW2NvbnRleHRdID0gY29hY2g7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gZ2V0IHRoZSBjb2xsYXBzaWJsZSBzdGF0ZSBvZlxyXG4gICAgICogQHBhcmFtIGNoYW5jZSBDaGFuY2UgYmV0d2VlbiAwIGFuZCAxMDAgb2YgY2hvb3NpbmcgdHJ1ZSwgaWYgdW5zZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldENvbGxhcHNlZChyZWY6IHN0cmluZywgY2hhbmNlOiBudW1iZXIpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29sbGFwc2libGVzW3JlZl07XHJcblxyXG4gICAgICAgIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdID0gIVJhbmRvbS5ib29sKGNoYW5jZSk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGNvbGxhcHNpYmxlJ3Mgc3RhdGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gc2V0IHRoZSBjb2xsYXBzaWJsZSBzdGF0ZSBvZlxyXG4gICAgICogQHBhcmFtIHN0YXRlIFZhbHVlIHRvIHNldCwgd2hlcmUgdHJ1ZSBpcyBcImNvbGxhcHNlZFwiXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRDb2xsYXBzZWQocmVmOiBzdHJpbmcsIHN0YXRlOiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXSA9IHN0YXRlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBpbnRlZ2VyLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBpbnRlZ2VyIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0SW50ZWdlcihjb250ZXh0OiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2ludGVnZXJzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgbGV0IG1pbiA9IDAsIG1heCA9IDA7XHJcblxyXG4gICAgICAgIHN3aXRjaChjb250ZXh0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2FzZSBcImNvYWNoZXNcIjogICAgICAgbWluID0gMTsgbWF4ID0gMTA7IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZGVsYXllZFwiOiAgICAgICBtaW4gPSA1OyBtYXggPSA2MDsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJmcm9udF9jb2FjaGVzXCI6IG1pbiA9IDI7IG1heCA9IDU7ICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInJlYXJfY29hY2hlc1wiOiAgbWluID0gMjsgbWF4ID0gNTsgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5faW50ZWdlcnNbY29udGV4dF0gPSBSYW5kb20uaW50KG1pbiwgbWF4KTtcclxuICAgICAgICByZXR1cm4gdGhpcy5faW50ZWdlcnNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGFuIGludGVnZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIGludGVnZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRJbnRlZ2VyKGNvbnRleHQ6IHN0cmluZywgdmFsdWU6IG51bWJlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5faW50ZWdlcnNbY29udGV4dF0gPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gcGhyYXNlIG9mIGEgcGhyYXNlc2V0LCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgcGhyYXNlc2V0J3MgcGhyYXNlIG9mXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2VzZXRJZHgocmVmOiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3BocmFzZXNldHNbcmVmXSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGhyYXNlc2V0c1tyZWZdO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBpcyB0aGlzIHNhZmUgYWNyb3NzIHBocmFzZXNldCBjaGFuZ2VzP1xyXG4gICAgICAgIC8vIFRPRE86IGludHJvZHVjZSBhbiBhc3NlcnRzIHV0aWwsIGFuZCBzdGFydCB1c2luZyB0aGVtIGFsbCBvdmVyXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlNUQVRFX05PTkVYSVNUQU5UX1BIUkFTRVNFVChyZWYpICk7XHJcblxyXG4gICAgICAgIHRoaXMuX3BocmFzZXNldHNbcmVmXSA9IFJhbmRvbS5pbnQoMCwgcGhyYXNlc2V0LmNoaWxkcmVuLmxlbmd0aCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BocmFzZXNldHNbcmVmXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGNob3NlbiBpbmRleCBmb3IgYSBwaHJhc2VzZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gc2V0IHRoZSBwaHJhc2VzZXQgaW5kZXggb2ZcclxuICAgICAqIEBwYXJhbSBpZHggSW5kZXggdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRQaHJhc2VzZXRJZHgocmVmOiBzdHJpbmcsIGlkeDogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBpZHg7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHNlcnZpY2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHNlcnZpY2UgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc2VydmljZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU2VydmljZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzZXJ2aWNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBzZXJ2aWNlIGZvclxyXG4gICAgICogQHBhcmFtIHNlcnZpY2UgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZywgc2VydmljZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IHNlcnZpY2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHN0YXRpb24gY29kZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zdGF0aW9uc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbnNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzdGF0aW9uIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBmb3JcclxuICAgICAqIEBwYXJhbSBjb2RlIFN0YXRpb24gY29kZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFN0YXRpb24oY29udGV4dDogc3RyaW5nLCBjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gY29kZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gbGlzdCBvZiBzdGF0aW9uIGNvZGVzLCBvciByYW5kb21seSBnZW5lcmF0ZXMgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBsaXN0IGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbkxpc3QoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1tdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdO1xyXG4gICAgICAgIGVsc2UgaWYgKGNvbnRleHQgPT09ICdjYWxsaW5nX2ZpcnN0JylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U3RhdGlvbkxpc3QoJ2NhbGxpbmcnKTtcclxuXHJcbiAgICAgICAgbGV0IG1pbiA9IDEsIG1heCA9IDE2O1xyXG5cclxuICAgICAgICBzd2l0Y2goY29udGV4dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NhbGxpbmdfc3BsaXQnOiBtaW4gPSAyOyBtYXggPSAxNjsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NoYW5nZXMnOiAgICAgICBtaW4gPSAxOyBtYXggPSA0OyAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ25vdF9zdG9wcGluZyc6ICBtaW4gPSAxOyBtYXggPSA4OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcyhtaW4sIG1heCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBsaXN0IG9mIHN0YXRpb24gY29kZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBsaXN0IGZvclxyXG4gICAgICogQHBhcmFtIGNvZGVzIFN0YXRpb24gY29kZXMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTdGF0aW9uTGlzdChjb250ZXh0OiBzdHJpbmcsIGNvZGVzOiBzdHJpbmdbXSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdID0gY29kZXM7XHJcblxyXG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnY2FsbGluZ19maXJzdCcpXHJcbiAgICAgICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1snY2FsbGluZyddID0gY29kZXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHRpbWVcclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHRpbWUgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRUaW1lKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fdGltZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3RpbWVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IFN0cmluZ3MuZnJvbVRpbWUoIFJhbmRvbS5pbnQoMCwgMjMpLCBSYW5kb20uaW50KDAsIDU5KSApO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl90aW1lc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSB0aW1lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSB0aW1lIGZvclxyXG4gICAgICogQHBhcmFtIHRpbWUgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRUaW1lKGNvbnRleHQ6IHN0cmluZywgdGltZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IHRpbWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBleGN1c2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSAqL1xyXG4gICAgcHVibGljIGdldCBleGN1c2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9leGN1c2UpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9leGN1c2U7XHJcblxyXG4gICAgICAgIHRoaXMuX2V4Y3VzZSA9IFJBRy5kYXRhYmFzZS5waWNrRXhjdXNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2V4Y3VzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBleGN1c2UgKi9cclxuICAgIHB1YmxpYyBzZXQgZXhjdXNlKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fZXhjdXNlID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBwbGF0Zm9ybSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IHBsYXRmb3JtKCkgOiBQbGF0Zm9ybVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9wbGF0Zm9ybSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXRmb3JtO1xyXG5cclxuICAgICAgICBsZXQgcGxhdGZvcm0gOiBQbGF0Zm9ybSA9IFsnJywgJyddO1xyXG5cclxuICAgICAgICAvLyBPbmx5IDIlIGNoYW5jZSBmb3IgcGxhdGZvcm0gMCwgc2luY2UgaXQncyByYXJlXHJcbiAgICAgICAgcGxhdGZvcm1bMF0gPSBSYW5kb20uYm9vbCg5OClcclxuICAgICAgICAgICAgPyBSYW5kb20uaW50KDEsIDI2KS50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogJzAnO1xyXG5cclxuICAgICAgICAvLyBNYWdpYyB2YWx1ZXNcclxuICAgICAgICBpZiAocGxhdGZvcm1bMF0gPT09ICc5JylcclxuICAgICAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgyNSkgPyAnwr4nIDogJyc7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMTAlIGNoYW5jZSBmb3IgcGxhdGZvcm0gbGV0dGVyLCBzaW5jZSBpdCdzIHVuY29tbW9uXHJcbiAgICAgICAgaWYgKHBsYXRmb3JtWzFdID09PSAnJylcclxuICAgICAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgxMClcclxuICAgICAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCdBQkMnKVxyXG4gICAgICAgICAgICAgICAgOiAnJztcclxuXHJcbiAgICAgICAgdGhpcy5fcGxhdGZvcm0gPSBwbGF0Zm9ybTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzZXQgcGxhdGZvcm0odmFsdWU6IFBsYXRmb3JtKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BsYXRmb3JtID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBuYW1lZCB0cmFpbiwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IG5hbWVkKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fbmFtZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9uYW1lZDtcclxuXHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSBSQUcuZGF0YWJhc2UucGlja05hbWVkKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgc2V0IG5hbWVkKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgdGhlIHN0YXRlIGluIGEgcGFydGljdWxhciB3YXksIHNvIHRoYXQgaXQgbWFrZXMgc29tZSByZWFsLXdvcmxkIHNlbnNlLlxyXG4gICAgICogVG8gZG8gc28sIHdlIGhhdmUgdG8gZ2VuZXJhdGUgZGF0YSBpbiBhIHBhcnRpY3VsYXIgb3JkZXIsIGFuZCBtYWtlIHN1cmUgdG8gYXZvaWRcclxuICAgICAqIGR1cGxpY2F0ZXMgaW4gaW5hcHByb3ByaWF0ZSBwbGFjZXMgYW5kIGNvbnRleHRzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2VuRGVmYXVsdFN0YXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RlcCAxLiBQcmVwb3B1bGF0ZSBzdGF0aW9uIGxpc3RzXHJcblxyXG4gICAgICAgIGxldCBzbENhbGxpbmcgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDE2KTtcclxuICAgICAgICBsZXQgc2xDYWxsU3BsaXQgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygyLCAxNiwgc2xDYWxsaW5nKTtcclxuICAgICAgICBsZXQgYWxsQ2FsbGluZyAgPSBbLi4uc2xDYWxsaW5nLCAuLi5zbENhbGxTcGxpdF07XHJcblxyXG4gICAgICAgIC8vIExpc3Qgb2Ygb3RoZXIgc3RhdGlvbnMgZm91bmQgdmlhIGEgc3BlY2lmaWMgY2FsbGluZyBwb2ludFxyXG4gICAgICAgIGxldCBzbENoYW5nZXMgICAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgNCwgYWxsQ2FsbGluZyk7XHJcbiAgICAgICAgLy8gTGlzdCBvZiBvdGhlciBzdGF0aW9ucyB0aGF0IHRoaXMgdHJhaW4gdXN1YWxseSBzZXJ2ZXMsIGJ1dCBjdXJyZW50bHkgaXNuJ3RcclxuICAgICAgICBsZXQgc2xOb3RTdG9wcGluZyA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDgsXHJcbiAgICAgICAgICAgIFsuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXNdXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gVGFrZSBhIHJhbmRvbSBzbGljZSBmcm9tIHRoZSBjYWxsaW5nIGxpc3QsIHRvIGlkZW50aWZ5IGFzIHJlcXVlc3Qgc3RvcHNcclxuICAgICAgICBsZXQgcmVxQ291bnQgICA9IFJhbmRvbS5pbnQoMSwgc2xDYWxsaW5nLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgIGxldCBzbFJlcXVlc3RzID0gc2xDYWxsaW5nLnNsaWNlKDAsIHJlcUNvdW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZycsICAgICAgIHNsQ2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZ19zcGxpdCcsIHNsQ2FsbFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjaGFuZ2VzJywgICAgICAgc2xDaGFuZ2VzKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdub3Rfc3RvcHBpbmcnLCAgc2xOb3RTdG9wcGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgncmVxdWVzdCcsICAgICAgIHNsUmVxdWVzdHMpO1xyXG5cclxuICAgICAgICAvLyBTdGVwIDIuIFByZXBvcHVsYXRlIHN0YXRpb25zXHJcblxyXG4gICAgICAgIC8vIEFueSBzdGF0aW9uIG1heSBiZSBibGFtZWQgZm9yIGFuIGV4Y3VzZSwgZXZlbiBvbmVzIGFscmVhZHkgcGlja2VkXHJcbiAgICAgICAgbGV0IHN0RXhjdXNlICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoKTtcclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiBpcyBmaW5hbCBjYWxsIG9mIHRoZSBjYWxsaW5nIGxpc3RcclxuICAgICAgICBsZXQgc3REZXN0ICAgID0gc2xDYWxsaW5nW3NsQ2FsbGluZy5sZW5ndGggLSAxXTtcclxuICAgICAgICAvLyBWaWEgaXMgYSBjYWxsIGJlZm9yZSB0aGUgZGVzdGluYXRpb24sIG9yIG9uZSBpbiB0aGUgc3BsaXQgbGlzdCBpZiB0b28gc21hbGxcclxuICAgICAgICBsZXQgc3RWaWEgICAgID0gc2xDYWxsaW5nLmxlbmd0aCA+IDFcclxuICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoIHNsQ2FsbGluZy5zbGljZSgwLCAtMSkgICApXHJcbiAgICAgICAgICAgIDogUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuICAgICAgICAvLyBEaXR0byBmb3IgcGlja2luZyBhIHJhbmRvbSBjYWxsaW5nIHN0YXRpb24gYXMgYSBzaW5nbGUgcmVxdWVzdCBvciBjaGFuZ2Ugc3RvcFxyXG4gICAgICAgIGxldCBzdENhbGxpbmcgPSBzbENhbGxpbmcubGVuZ3RoID4gMVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSggc2xDYWxsaW5nLnNsaWNlKDAsIC0xKSAgIClcclxuICAgICAgICAgICAgOiBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG5cclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiAobGFzdCBjYWxsKSBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdERlc3RTcGxpdCA9IHNsQ2FsbFNwbGl0W3NsQ2FsbFNwbGl0Lmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIC8vIFJhbmRvbSBub24tZGVzdGluYXRpb24gc3RvcCBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdFZpYVNwbGl0ICA9IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcbiAgICAgICAgLy8gV2hlcmUgdGhlIHRyYWluIGNvbWVzIGZyb20sIHNvIGNhbid0IGJlIG9uIGFueSBsaXN0cyBvciBwcmlvciBzdGF0aW9uc1xyXG4gICAgICAgIGxldCBzdFNvdXJjZSAgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoW1xyXG4gICAgICAgICAgICAuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXMsIC4uLnNsTm90U3RvcHBpbmcsIC4uLnNsUmVxdWVzdHMsXHJcbiAgICAgICAgICAgIHN0Q2FsbGluZywgc3REZXN0LCBzdFZpYSwgc3REZXN0U3BsaXQsIHN0VmlhU3BsaXRcclxuICAgICAgICBdKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdjYWxsaW5nJywgICAgICAgICAgIHN0Q2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbicsICAgICAgIHN0RGVzdCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbl9zcGxpdCcsIHN0RGVzdFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2V4Y3VzZScsICAgICAgICAgICAgc3RFeGN1c2UpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignc291cmNlJywgICAgICAgICAgICBzdFNvdXJjZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCd2aWEnLCAgICAgICAgICAgICAgIHN0VmlhKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3ZpYV9zcGxpdCcsICAgICAgICAgc3RWaWFTcGxpdCk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgMy4gUHJlcG9wdWxhdGUgY29hY2ggbnVtYmVyc1xyXG5cclxuICAgICAgICBsZXQgaW50Q29hY2hlcyA9IHRoaXMuZ2V0SW50ZWdlcignY29hY2hlcycpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgZW5vdWdoIGNvYWNoZXMsIGp1c3Qgc3BsaXQgdGhlIG51bWJlciBkb3duIHRoZSBtaWRkbGUgaW5zdGVhZC5cclxuICAgICAgICAvLyBFbHNlLCBmcm9udCBhbmQgcmVhciBjb2FjaGVzIHdpbGwgYmUgcmFuZG9tbHkgcGlja2VkICh3aXRob3V0IG1ha2luZyBzZW5zZSlcclxuICAgICAgICBpZiAoaW50Q29hY2hlcyA+PSA0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGludEZyb250Q29hY2hlcyA9IChpbnRDb2FjaGVzIC8gMikgfCAwO1xyXG4gICAgICAgICAgICBsZXQgaW50UmVhckNvYWNoZXMgID0gaW50Q29hY2hlcyAtIGludEZyb250Q29hY2hlcztcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcignZnJvbnRfY29hY2hlcycsIGludEZyb250Q29hY2hlcyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcigncmVhcl9jb2FjaGVzJywgaW50UmVhckNvYWNoZXMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgYXJlIGVub3VnaCBjb2FjaGVzLCBhc3NpZ24gY29hY2ggbGV0dGVycyBmb3IgY29udGV4dHMuXHJcbiAgICAgICAgLy8gRWxzZSwgbGV0dGVycyB3aWxsIGJlIHJhbmRvbWx5IHBpY2tlZCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpXHJcbiAgICAgICAgaWYgKGludENvYWNoZXMgPj0gNClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsZXR0ZXJzID0gTC5MRVRURVJTLnNsaWNlKDAsIGludENvYWNoZXMpLnNwbGl0KCcnKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdmaXJzdCcsICAgICBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3Nob3AnLCAgICAgIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc3RhbmRhcmQxJywgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzdGFuZGFyZDInLCBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNC4gUHJlcG9wdWxhdGUgc2VydmljZXNcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBzZXJ2aWNlLCBwaWNrIG9uZSB0byBiZSB0aGUgXCJtYWluXCIgYW5kIG9uZSB0byBiZSB0aGVcclxuICAgICAgICAvLyBcImFsdGVybmF0ZVwiLCBlbHNlIHRoZSBvbmUgc2VydmljZSB3aWxsIGJlIHVzZWQgZm9yIGJvdGggKHdpdGhvdXQgbWFraW5nIHNlbnNlKS5cclxuICAgICAgICBpZiAoUkFHLmRhdGFiYXNlLnNlcnZpY2VzLmxlbmd0aCA+IDEpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgc2VydmljZXMgPSBSQUcuZGF0YWJhc2Uuc2VydmljZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VydmljZSggJ3Byb3ZpZGVyJywgICAgUmFuZG9tLmFycmF5U3BsaWNlKHNlcnZpY2VzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldFNlcnZpY2UoICdhbHRlcm5hdGl2ZScsIFJhbmRvbS5hcnJheVNwbGljZShzZXJ2aWNlcykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNS4gUHJlcG9wdWxhdGUgdGltZXNcclxuICAgICAgICAvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTIxNDc1M1xyXG5cclxuICAgICAgICAvLyBUaGUgYWx0ZXJuYXRpdmUgdGltZSBpcyBmb3IgYSB0cmFpbiB0aGF0J3MgbGF0ZXIgdGhhbiB0aGUgbWFpbiB0cmFpblxyXG4gICAgICAgIGxldCB0aW1lICAgID0gbmV3IERhdGUoIG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgUmFuZG9tLmludCgwLCA1OSkgKiA2MDAwMCk7XHJcbiAgICAgICAgbGV0IHRpbWVBbHQgPSBuZXcgRGF0ZSggdGltZS5nZXRUaW1lKCkgICAgICAgKyBSYW5kb20uaW50KDAsIDMwKSAqIDYwMDAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnbWFpbicsICAgICAgICBTdHJpbmdzLmZyb21UaW1lKHRpbWUpICAgICk7XHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnYWx0ZXJuYXRpdmUnLCBTdHJpbmdzLmZyb21UaW1lKHRpbWVBbHQpICk7XHJcbiAgICB9XHJcbn0iXX0=