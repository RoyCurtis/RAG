"use strict";
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
        for (let i = 0; i < 26; i++) {
            let option = document.createElement('option');
            let letter = L.LETTERS[i];
            option.text = option.value = letter;
            this.inputLetter.appendChild(option);
        }
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
        this.TITLE_OPT_OPEN = () => 'Click to open this optional part';
        this.TITLE_OPT_CLOSE = () => 'Click to close this optional part';
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
        this.ST_VOX = () => 'Speech';
        this.ST_VOX_CHOICE = () => 'Voice';
        this.ST_VOX_EMPTY = () => 'None available';
        this.ST_VOX_VOL = () => 'Volume';
        this.ST_VOX_PITCH = () => 'Pitch';
        this.ST_VOX_RATE = () => 'Rate';
        this.ST_VOX_TEST = () => 'Test speech';
        this.ST_VOX_TEST_T = () => 'Play a speech sample with the current settings';
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
        // Vox form
        this.selVoxChoice = DOM.require('#selVoxChoice');
        this.rangeVoxVol = DOM.require('#rangeVoxVol');
        this.rangeVoxPitch = DOM.require('#rangeVoxPitch');
        this.rangeVoxRate = DOM.require('#rangeVoxRate');
        this.btnVoxTest = DOM.require('#btnVoxTest');
        this.btnVoxTest.onclick = this.handleVoxTest.bind(this);
        // Legal and acknowledgements
        Linkdown.parse(DOM.require('#legalBlock'));
    }
    /** Opens the settings screen */
    open() {
        this.dom.classList.remove('hidden');
        // The vox list has to be populated each open, in case it changes
        this.populateVoxList();
        this.selVoxChoice.selectedIndex = RAG.config.voxChoice;
        this.rangeVoxVol.valueAsNumber = RAG.config.voxVolume;
        this.rangeVoxPitch.valueAsNumber = RAG.config.voxPitch;
        this.rangeVoxRate.valueAsNumber = RAG.config.voxRate;
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
    populateVoxList() {
        this.selVoxChoice.innerHTML = '';
        let voices = RAG.speech.getVoices();
        // Handle empty list
        if (voices.length <= 0) {
            let option = document.createElement('option');
            option.textContent = L.ST_VOX_EMPTY();
            option.disabled = true;
            this.selVoxChoice.appendChild(option);
            return;
        }
        // https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
        for (let i = 0; i < voices.length; i++) {
            let option = document.createElement('option');
            option.textContent = `${voices[i].name} (${voices[i].lang})`;
            this.selVoxChoice.appendChild(option);
        }
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
        RAG.config.voxChoice = this.selVoxChoice.selectedIndex;
        RAG.config.voxVolume = parseFloat(this.rangeVoxVol.value);
        RAG.config.voxPitch = parseFloat(this.rangeVoxPitch.value);
        RAG.config.voxRate = parseFloat(this.rangeVoxRate.value);
        RAG.config.save();
        this.close();
    }
    /** Handles the speech test button, speaking a test phrase */
    handleVoxTest(ev) {
        ev.preventDefault();
        RAG.speech.cancel();
        this.btnVoxTest.disabled = true;
        // Has to execute on a delay, as speech cancel is unreliable without it
        window.setTimeout(() => {
            this.btnVoxTest.disabled = false;
            let time = Strings.fromTime(new Date());
            let phrase = document.createElement('span');
            phrase.innerHTML = '<span data-type="phrase" data-ref="sample">' +
                'This is a test of the Rail Announcement Generator at' +
                '<span data-type="time">' + time + '</span>' +
                '</span>';
            RAG.speech.speak(phrase.firstElementChild, {
                voiceIdx: this.selVoxChoice.selectedIndex,
                volume: this.rangeVoxVol.valueAsNumber,
                pitch: this.rangeVoxPitch.valueAsNumber,
                rate: this.rangeVoxRate.valueAsNumber
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
            window.localStorage['state'] = raw;
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
        let data = window.localStorage['state'];
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
        if (state)
            span.setAttribute('collapsed', '');
        else
            span.removeAttribute('collapsed');
        toggle.title = state
            ? L.TITLE_OPT_OPEN()
            : L.TITLE_OPT_CLOSE();
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
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Custom voice that synthesizes speech by piecing pre-recorded files together */
class CustomVoice {
    constructor(name, lang) {
        this.default = false;
        this.localService = false;
        this.name = `RAG-VOX ${name}`;
        this.lang = lang;
        this.voiceURI = `./${name}_${lang}/`;
    }
}
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
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Manages speech synthesis and wraps around HTML5 speech API */
class SpeechEngine {
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
        this.customVoices.push(new CustomVoice('Roy', 'en-GB'));
    }
    /** Gets all the voices currently available */
    getVoices() {
        // TODO: Re-enable
        // return this.customVoices.concat(this.browserVoices);
        return this.browserVoices;
    }
    /** Begins speaking the given phrase components */
    speak(phrase, settings = {}) {
        // Reset to first voice, if configured choice is missing
        let voices = this.getVoices();
        let voiceIdx = either(settings.voiceIdx, RAG.config.voxChoice);
        let voice = voices[voiceIdx] || voices[0];
        let engine = (voice instanceof CustomVoice)
            ? this.speakCustom.bind(this)
            : this.speakBrowser.bind(this);
        engine(phrase, voice, settings);
    }
    /** Stops and cancels all queued speech */
    cancel() {
        window.speechSynthesis.cancel();
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
            utterance.volume = either(settings.volume, RAG.config.voxVolume);
            utterance.pitch = either(settings.pitch, RAG.config.voxPitch);
            utterance.rate = either(settings.rate, RAG.config.voxRate);
            window.speechSynthesis.speak(utterance);
        });
    }
    /**
     * Synthesizes voice by walking through the given phrase elements, resolving parts to
     * sound files by ID, and piecing together the sound files.
     *
     * @param phrase Phrase elements to speak
     * @param voice Custom voice to use
     * @param settings Settings to use for the voice
     */
    speakCustom(phrase, _, __) {
        // TODO: use volume settings
        let clips = [];
        let resolver = new Resolver();
        let treeWalker = document.createTreeWalker(phrase, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: Resolver.nodeFilter }, false);
        while (treeWalker.nextNode()) {
            console.log(resolver.resolve(treeWalker.currentNode), Strings.clean(treeWalker.currentNode.textContent));
        }
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Holds runtime configuration */
class Config {
    /** Safely loads runtime configuration from localStorage, if any */
    constructor(load) {
        /** Volume for speech to be set at */
        this.voxVolume = 1.0;
        /** Pitch for speech to be set at */
        this.voxPitch = 1.0;
        /** Rate for speech to be set at */
        this.voxRate = 1.0;
        /** Choice of speech voice to use, as getVoices index or -1 if unset */
        this._voxChoice = -1;
        /** If user has clicked shuffle at least once */
        this.clickedGenerate = false;
        if (!load || !window.localStorage['settings'])
            return;
        try {
            let config = JSON.parse(window.localStorage['settings']);
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
    get voxChoice() {
        // TODO: this is probably better off using voice names
        // If there's a user-defined value, use that
        if (this._voxChoice !== -1)
            return this._voxChoice;
        // Select English voices by default
        for (let i = 0, v = RAG.speech.getVoices(); i < v.length; i++) {
            let lang = v[i].lang;
            if (lang === 'en-GB' || lang === 'en-US')
                return i;
        }
        // Else, first voice on the list
        return 0;
    }
    set voxChoice(value) {
        this._voxChoice = value;
    }
    /** Safely saves runtime configuration to localStorage */
    save() {
        try {
            window.localStorage['settings'] = JSON.stringify(this);
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
        I18n.init();
        RAG.config = new Config(true);
        RAG.database = new Database(dataRefs);
        RAG.views = new Views();
        RAG.phraser = new Phraser();
        RAG.speech = new SpeechEngine();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL3N0YXRpb25DaG9vc2VyLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkxpc3RJdGVtLnRzIiwidWkvcGlja2Vycy9waWNrZXIudHMiLCJ1aS9waWNrZXJzL2NvYWNoUGlja2VyLnRzIiwidWkvcGlja2Vycy9leGN1c2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2ludGVnZXJQaWNrZXIudHMiLCJ1aS9waWNrZXJzL25hbWVkUGlja2VyLnRzIiwidWkvcGlja2Vycy9waHJhc2VzZXRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BsYXRmb3JtUGlja2VyLnRzIiwidWkvcGlja2Vycy9zZXJ2aWNlUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uUGlja2VyLnRzIiwidWkvcGlja2Vycy9zdGF0aW9uTGlzdFBpY2tlci50cyIsInVpL3BpY2tlcnMvdGltZVBpY2tlci50cyIsImxhbmcvYmFzZUxhbmd1YWdlLnRzIiwibGFuZy9lbmdsaXNoTGFuZ3VhZ2UudHMiLCJwaHJhc2VyL2VsZW1lbnRQcm9jZXNzb3JzLnRzIiwicGhyYXNlci9waHJhc2VDb250ZXh0LnRzIiwicGhyYXNlci9waHJhc2VyLnRzIiwidWkvZWRpdG9yLnRzIiwidWkvbWFycXVlZS50cyIsInVpL3NldHRpbmdzLnRzIiwidWkvdG9vbGJhci50cyIsInVpL3ZpZXdzLnRzIiwidXRpbC9jb2xsYXBzaWJsZXMudHMiLCJ1dGlsL2NvbmRpdGlvbmFscy50cyIsInV0aWwvZG9tLnRzIiwidXRpbC9saW5rZG93bi50cyIsInV0aWwvcGFyc2UudHMiLCJ1dGlsL3JhbmRvbS50cyIsInV0aWwvc3RyaW5ncy50cyIsInV0aWwvdHlwZXMudHMiLCJ2b3gvY3VzdG9tVm9pY2UudHMiLCJ2b3gvcmVzb2x2ZXIudHMiLCJ2b3gvc3BlZWNoRW5naW5lLnRzIiwiY29u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QUFDLE9BQU8sQ0FBQyxDQUFFLENBQUM7SUFDN0QsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogR2xvYmFsIHJlZmVyZW5jZSB0byB0aGUgbGFuZ3VhZ2UgY29udGFpbmVyLCBzZXQgYXQgaW5pdCAqL1xyXG5sZXQgTCA6IEVuZ2xpc2hMYW5ndWFnZSB8IEJhc2VMYW5ndWFnZTtcclxuXHJcbmNsYXNzIEkxOG5cclxue1xyXG4gICAgLyoqIENvbnN0YW50IHJlZ2V4IHRvIG1hdGNoIGZvciB0cmFuc2xhdGlvbiBrZXlzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBUQUdfUkVHRVggOiBSZWdFeHAgPSAvJVtBLVpfXSslLztcclxuXHJcbiAgICAvKiogTGFuZ3VhZ2VzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGxhbmd1YWdlcyAgIDogRGljdGlvbmFyeTxCYXNlTGFuZ3VhZ2U+O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byBsYW5ndWFnZSBjdXJyZW50bHkgaW4gdXNlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBjdXJyZW50TGFuZyA6IEJhc2VMYW5ndWFnZTtcclxuXHJcbiAgICAvKiogUGlja3MgYSBsYW5ndWFnZSwgYW5kIHRyYW5zZm9ybXMgYWxsIHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGRvY3VtZW50ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5sYW5ndWFnZXMpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSTE4biBpcyBhbHJlYWR5IGluaXRpYWxpemVkJyk7XHJcblxyXG4gICAgICAgIHRoaXMubGFuZ3VhZ2VzID0ge1xyXG4gICAgICAgICAgICAnZW4nIDogbmV3IEVuZ2xpc2hMYW5ndWFnZSgpXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTGFuZ3VhZ2Ugc2VsZWN0aW9uXHJcbiAgICAgICAgTCA9IHRoaXMuY3VycmVudExhbmcgPSB0aGlzLmxhbmd1YWdlc1snZW4nXTtcclxuXHJcbiAgICAgICAgSTE4bi5hcHBseVRvRG9tKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXYWxrcyB0aHJvdWdoIGFsbCB0ZXh0IG5vZGVzIGluIHRoZSBET00sIHJlcGxhY2luZyBhbnkgdHJhbnNsYXRpb24ga2V5cy5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMDczMDc3Ny8zMzU0OTIwXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGFwcGx5VG9Eb20oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgbmV4dCA6IE5vZGUgfCBudWxsO1xyXG4gICAgICAgIGxldCB3YWxrID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keSxcclxuICAgICAgICAgICAgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQgfCBOb2RlRmlsdGVyLlNIT1dfVEVYVCxcclxuICAgICAgICAgICAgeyBhY2NlcHROb2RlOiBJMThuLm5vZGVGaWx0ZXIgfSxcclxuICAgICAgICAgICAgZmFsc2VcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB3aGlsZSAoIG5leHQgPSB3YWxrLm5leHROb2RlKCkgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKG5leHQubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5leHQgYXMgRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuYXR0cmlidXRlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgICAgICAgICBJMThuLmV4cGFuZEF0dHJpYnV0ZShlbGVtZW50LmF0dHJpYnV0ZXNbaV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKG5leHQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFICYmIG5leHQudGV4dENvbnRlbnQpXHJcbiAgICAgICAgICAgICAgICBJMThuLmV4cGFuZFRleHROb2RlKG5leHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsdGVycyB0aGUgdHJlZSB3YWxrZXIgdG8gZXhjbHVkZSBzY3JpcHQgYW5kIHN0eWxlIHRhZ3MgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgdGFnID0gKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgICAgICA/IChub2RlIGFzIEVsZW1lbnQpLnRhZ05hbWUudG9VcHBlckNhc2UoKVxyXG4gICAgICAgICAgICA6IG5vZGUucGFyZW50RWxlbWVudCEudGFnTmFtZS50b1VwcGVyQ2FzZSgpO1xyXG5cclxuICAgICAgICByZXR1cm4gWydTQ1JJUFQnLCAnU1RZTEUnXS5pbmNsdWRlcyh0YWcpXHJcbiAgICAgICAgICAgID8gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUXHJcbiAgICAgICAgICAgIDogTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFeHBhbmRzIGFueSB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBnaXZlbiBhdHRyaWJ1dGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGV4cGFuZEF0dHJpYnV0ZShhdHRyOiBBdHRyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTZXR0aW5nIGFuIGF0dHJpYnV0ZSwgZXZlbiBpZiBub3RoaW5nIGFjdHVhbGx5IGNoYW5nZXMsIHdpbGwgY2F1c2UgdmFyaW91c1xyXG4gICAgICAgIC8vIHNpZGUtZWZmZWN0cyAoZS5nLiByZWxvYWRpbmcgaWZyYW1lcykuIFNvLCBhcyB3YXN0ZWZ1bCBhcyB0aGlzIGxvb2tzLCB3ZSBoYXZlXHJcbiAgICAgICAgLy8gdG8gbWF0Y2ggZmlyc3QgYmVmb3JlIGFjdHVhbGx5IHJlcGxhY2luZy5cclxuXHJcbiAgICAgICAgaWYgKCBhdHRyLnZhbHVlLm1hdGNoKHRoaXMuVEFHX1JFR0VYKSApXHJcbiAgICAgICAgICAgIGF0dHIudmFsdWUgPSBhdHRyLnZhbHVlLnJlcGxhY2UodGhpcy5UQUdfUkVHRVgsIEkxOG4ucmVwbGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEV4cGFuZHMgYW55IHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGdpdmVuIHRleHQgbm9kZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZXhwYW5kVGV4dE5vZGUobm9kZTogTm9kZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbm9kZS50ZXh0Q29udGVudCA9IG5vZGUudGV4dENvbnRlbnQhLnJlcGxhY2UodGhpcy5UQUdfUkVHRVgsIEkxOG4ucmVwbGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcGxhY2VzIGtleSB3aXRoIHZhbHVlIGlmIGl0IGV4aXN0cywgZWxzZSBrZWVwcyB0aGUga2V5ICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXBsYWNlKG1hdGNoOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSAgID0gbWF0Y2guc2xpY2UoMSwgLTEpO1xyXG4gICAgICAgIGxldCB2YWx1ZSA9IExba2V5XSBhcyBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgICAgICBpZiAoIXZhbHVlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignTWlzc2luZyB0cmFuc2xhdGlvbiBrZXk6JywgbWF0Y2gpO1xyXG4gICAgICAgICAgICByZXR1cm4gbWF0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBEZWxlZ2F0ZSB0eXBlIGZvciBjaG9vc2VyIHNlbGVjdCBldmVudCBoYW5kbGVycyAqL1xyXG50eXBlIFNlbGVjdERlbGVnYXRlID0gKGVudHJ5OiBIVE1MRWxlbWVudCkgPT4gdm9pZDtcclxuXHJcbi8qKiBVSSBlbGVtZW50IHdpdGggYSBmaWx0ZXJhYmxlIGFuZCBrZXlib2FyZCBuYXZpZ2FibGUgbGlzdCBvZiBjaG9pY2VzICovXHJcbmNsYXNzIENob29zZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIHRlbXBsYXRlIHRvIGNsb25lLCBmb3IgZWFjaCBjaG9vc2VyIGNyZWF0ZWQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFICAgID0gRE9NLnJlcXVpcmUoJyNjaG9vc2VyVGVtcGxhdGUnKTtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLmlkID0gJyc7XHJcblxyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGNvbnRhaW5lciAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRvbSAgICAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBmaWx0ZXIgaW5wdXQgYm94ICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5wdXRGaWx0ZXIgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgY29udGFpbmVyIG9mIGl0ZW0gZWxlbWVudHMgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBpbnB1dENob2ljZXMgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogT3B0aW9uYWwgZXZlbnQgaGFuZGxlciB0byBmaXJlIHdoZW4gYW4gaXRlbSBpcyBzZWxlY3RlZCBieSB0aGUgdXNlciAqL1xyXG4gICAgcHVibGljICAgIG9uU2VsZWN0PyAgICAgOiBTZWxlY3REZWxlZ2F0ZTtcclxuICAgIC8qKiBXaGV0aGVyIHRvIHZpc3VhbGx5IHNlbGVjdCB0aGUgY2xpY2tlZCBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgICAgc2VsZWN0T25DbGljayA6IGJvb2xlYW4gPSB0cnVlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGl0ZW0sIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIGRvbVNlbGVjdGVkPyAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGF1dG8tZmlsdGVyIHRpbWVvdXQsIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIGZpbHRlclRpbWVvdXQgOiBudW1iZXIgPSAwO1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gZ3JvdXAgYWRkZWQgZWxlbWVudHMgYnkgYWxwaGFiZXRpY2FsIHNlY3Rpb25zICovXHJcbiAgICBwcm90ZWN0ZWQgZ3JvdXBCeUFCQyAgICA6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIC8qKiBUaXRsZSBhdHRyaWJ1dGUgdG8gYXBwbHkgdG8gZXZlcnkgaXRlbSBhZGRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGl0ZW1UaXRsZSAgICAgOiBzdHJpbmcgPSAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgaXRlbSc7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYSBjaG9vc2VyLCBieSByZXBsYWNpbmcgdGhlIHBsYWNlaG9sZGVyIGluIGEgZ2l2ZW4gcGFyZW50ICovXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGFyZW50OiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICBpZiAoIUNob29zZXIuVEVNUExBVEUpXHJcbiAgICAgICAgICAgIENob29zZXIuaW5pdCgpO1xyXG5cclxuICAgICAgICBsZXQgdGFyZ2V0ICAgICAgPSBET00ucmVxdWlyZSgnY2hvb3NlcicsIHBhcmVudCk7XHJcbiAgICAgICAgbGV0IHBsYWNlaG9sZGVyID0gRE9NLmdldEF0dHIoIHRhcmdldCwgJ3BsYWNlaG9sZGVyJywgTC5QX0dFTkVSSUNfUEgoKSApO1xyXG4gICAgICAgIGxldCB0aXRsZSAgICAgICA9IERPTS5nZXRBdHRyKCB0YXJnZXQsICd0aXRsZScsIEwuUF9HRU5FUklDX1QoKSApO1xyXG4gICAgICAgIHRoaXMuaXRlbVRpdGxlICA9IERPTS5nZXRBdHRyKHRhcmdldCwgJ2l0ZW1UaXRsZScsIHRoaXMuaXRlbVRpdGxlKTtcclxuICAgICAgICB0aGlzLmdyb3VwQnlBQkMgPSB0YXJnZXQuaGFzQXR0cmlidXRlKCdncm91cEJ5QUJDJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgID0gQ2hvb3Nlci5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlciAgPSBET00ucmVxdWlyZSgnLmNoU2VhcmNoQm94JywgIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcyA9IERPTS5yZXF1aXJlKCcuY2hDaG9pY2VzQm94JywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy50aXRsZSAgICAgID0gdGl0bGU7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci5wbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyO1xyXG4gICAgICAgIC8vIFRPRE86IFJldXNpbmcgdGhlIHBsYWNlaG9sZGVyIGFzIHRpdGxlIGlzIHByb2JhYmx5IGJhZFxyXG4gICAgICAgIC8vIGh0dHBzOi8vbGFrZW4ubmV0L2Jsb2cvbW9zdC1jb21tb24tYTExeS1taXN0YWtlcy9cclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnRpdGxlICAgICAgID0gcGxhY2Vob2xkZXI7XHJcblxyXG4gICAgICAgIHRhcmdldC5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2JlZm9yZWJlZ2luJywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRhcmdldC5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFkZHMgdGhlIGdpdmVuIHZhbHVlIHRvIHRoZSBjaG9vc2VyIGFzIGEgc2VsZWN0YWJsZSBpdGVtLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBUZXh0IG9mIHRoZSBzZWxlY3RhYmxlIGl0ZW1cclxuICAgICAqIEBwYXJhbSBzZWxlY3QgV2hldGhlciB0byBzZWxlY3QgdGhpcyBpdGVtIG9uY2UgYWRkZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGFkZCh2YWx1ZTogc3RyaW5nLCBzZWxlY3Q6IGJvb2xlYW4gPSBmYWxzZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG5cclxuICAgICAgICBpdGVtLmlubmVyVGV4dCA9IHZhbHVlO1xyXG5cclxuICAgICAgICB0aGlzLmFkZFJhdyhpdGVtLCBzZWxlY3QpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQWRkcyB0aGUgZ2l2ZW4gZWxlbWVudCB0byB0aGUgY2hvb3NlciBhcyBhIHNlbGVjdGFibGUgaXRlbS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaXRlbSBFbGVtZW50IHRvIGFkZCB0byB0aGUgY2hvb3NlclxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBXaGV0aGVyIHRvIHNlbGVjdCB0aGlzIGl0ZW0gb25jZSBhZGRlZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYWRkUmF3KGl0ZW06IEhUTUxFbGVtZW50LCBzZWxlY3Q6IGJvb2xlYW4gPSBmYWxzZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaXRlbS50aXRsZSAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgICAgIGl0ZW0udGFiSW5kZXggPSAtMTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuYXBwZW5kQ2hpbGQoaXRlbSk7XHJcblxyXG4gICAgICAgIGlmIChzZWxlY3QpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChpdGVtKTtcclxuICAgICAgICAgICAgaXRlbS5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYXJzIGFsbCBpdGVtcyBmcm9tIHRoaXMgY2hvb3NlciBhbmQgdGhlIGN1cnJlbnQgZmlsdGVyICovXHJcbiAgICBwdWJsaWMgY2xlYXIoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5pbm5lckhUTUwgPSAnJztcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnZhbHVlICAgICAgPSAnJztcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2VsZWN0IGFuZCBmb2N1cyB0aGUgZW50cnkgdGhhdCBtYXRjaGVzIHRoZSBnaXZlbiB2YWx1ZSAqL1xyXG4gICAgcHVibGljIHByZXNlbGVjdCh2YWx1ZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCBrZXkgaW4gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW4pXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaXRlbSA9IHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuW2tleV0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICBpZiAodmFsdWUgPT09IGl0ZW0uaW5uZXJUZXh0KVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChpdGVtKTtcclxuICAgICAgICAgICAgICAgIGl0ZW0uZm9jdXMoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsaWNrIGV2ZW50cywgZm9yIGNob29zaW5nIGl0ZW1zICovXHJcbiAgICBwdWJsaWMgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhcmdldCA9IGV2LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCB0aGlzLmlzQ2hvaWNlKHRhcmdldCkgKVxyXG4gICAgICAgIGlmICggIXRhcmdldC5oYXNBdHRyaWJ1dGUoJ2Rpc2FibGVkJykgKVxyXG4gICAgICAgICAgICB0aGlzLnNlbGVjdCh0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsb3NlIG1ldGhvZHMsIGRvaW5nIGFueSB0aW1lciBjbGVhbnVwICovXHJcbiAgICBwdWJsaWMgb25DbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBpbnB1dCBldmVudHMsIGZvciBmaWx0ZXJpbmcgYW5kIG5hdmlnYXRpb24gKi9cclxuICAgIHB1YmxpYyBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQga2V5ICAgICA9IGV2LmtleTtcclxuICAgICAgICBsZXQgZm9jdXNlZCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBmb2N1c2VkLnBhcmVudEVsZW1lbnQhO1xyXG5cclxuICAgICAgICBpZiAoIWZvY3VzZWQpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gT25seSBoYW5kbGUgZXZlbnRzIG9uIHRoaXMgY2hvb3NlcidzIGNvbnRyb2xzXHJcbiAgICAgICAgaWYgKCAhdGhpcy5vd25zKGZvY3VzZWQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgdHlwaW5nIGludG8gZmlsdGVyIGJveFxyXG4gICAgICAgIGlmIChmb2N1c2VkID09PSB0aGlzLmlucHV0RmlsdGVyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5maWx0ZXJUaW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoXyA9PiB0aGlzLmZpbHRlcigpLCA1MDApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBSZWRpcmVjdCB0eXBpbmcgdG8gaW5wdXQgZmlsdGVyIGJveFxyXG4gICAgICAgIGlmIChmb2N1c2VkICE9PSB0aGlzLmlucHV0RmlsdGVyKVxyXG4gICAgICAgIGlmIChrZXkubGVuZ3RoID09PSAxIHx8IGtleSA9PT0gJ0JhY2tzcGFjZScpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlucHV0RmlsdGVyLmZvY3VzKCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwcmVzc2luZyBFTlRFUiBhZnRlciBrZXlib2FyZCBuYXZpZ2F0aW5nIHRvIGFuIGl0ZW1cclxuICAgICAgICBpZiAoIHRoaXMuaXNDaG9pY2UoZm9jdXNlZCkgKVxyXG4gICAgICAgIGlmIChrZXkgPT09ICdFbnRlcicpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlbGVjdChmb2N1c2VkKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIG5hdmlnYXRpb24gd2hlbiBjb250YWluZXIgb3IgaXRlbSBpcyBmb2N1c2VkXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5ID09PSAnQXJyb3dSaWdodCcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZGlyID0gKGtleSA9PT0gJ0Fycm93TGVmdCcpID8gLTEgOiAxO1xyXG4gICAgICAgICAgICBsZXQgbmF2ID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQsIGlmIHVzaW5nIGdyb3Vwc1xyXG4gICAgICAgICAgICBpZiAgICAgICggdGhpcy5ncm91cEJ5QUJDICYmIHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2dyb3VwJykgKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LCBpZiBjaG9pY2VzIGFyZSBmbGF0XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKCF0aGlzLmdyb3VwQnlBQkMgJiYgZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0Q2hvaWNlcylcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnRcclxuICAgICAgICAgICAgZWxzZSBpZiAoZm9jdXNlZCA9PT0gdGhpcy5kb21TZWxlY3RlZClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyh0aGlzLmRvbVNlbGVjdGVkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsZXZhbnQgdG8gYmVnaW5uaW5nIG9yIGVuZCBvZiBjb250YWluZXJcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID09PSAtMSlcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5sYXN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKG5hdikgbmF2LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIHN1Ym1pdCBldmVudHMsIGZvciBpbnN0YW50IGZpbHRlcmluZyAqL1xyXG4gICAgcHVibGljIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICB0aGlzLmZpbHRlcigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIaWRlIG9yIHNob3cgY2hvaWNlcyBpZiB0aGV5IHBhcnRpYWxseSBtYXRjaCB0aGUgdXNlciBxdWVyeSAqL1xyXG4gICAgcHJvdGVjdGVkIGZpbHRlcigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuXHJcbiAgICAgICAgbGV0IGZpbHRlciA9IHRoaXMuaW5wdXRGaWx0ZXIudmFsdWUudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBsZXQgaXRlbXMgID0gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW47XHJcbiAgICAgICAgbGV0IGVuZ2luZSA9IHRoaXMuZ3JvdXBCeUFCQ1xyXG4gICAgICAgICAgICA/IENob29zZXIuZmlsdGVyR3JvdXBcclxuICAgICAgICAgICAgOiBDaG9vc2VyLmZpbHRlckl0ZW07XHJcblxyXG4gICAgICAgIC8vIFByZXZlbnQgYnJvd3NlciByZWRyYXcvcmVmbG93IGR1cmluZyBmaWx0ZXJpbmdcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcclxuXHJcbiAgICAgICAgLy8gSXRlcmF0ZSB0aHJvdWdoIGFsbCB0aGUgaXRlbXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICBlbmdpbmUoaXRlbXNbaV0gYXMgSFRNTEVsZW1lbnQsIGZpbHRlcik7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBcHBsaWVzIGZpbHRlciB0byBhbiBpdGVtLCBzaG93aW5nIGl0IGlmIG1hdGNoZWQsIGhpZGluZyBpZiBub3QgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgZmlsdGVySXRlbShpdGVtOiBIVE1MRWxlbWVudCwgZmlsdGVyOiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2hvdyBpZiBjb250YWlucyBzZWFyY2ggdGVybVxyXG4gICAgICAgIGlmIChpdGVtLmlubmVyVGV4dC50b0xvd2VyQ2FzZSgpLmluZGV4T2YoZmlsdGVyKSA+PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaXRlbS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIaWRlIGlmIG5vdFxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGl0ZW0uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XHJcbiAgICAgICAgICAgIHJldHVybiAxO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQXBwbGllcyBmaWx0ZXIgdG8gY2hpbGRyZW4gb2YgYSBncm91cCwgaGlkaW5nIHRoZSBncm91cCBpZiBhbGwgY2hpbGRyZW4gaGlkZSAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBmaWx0ZXJHcm91cChncm91cDogSFRNTEVsZW1lbnQsIGZpbHRlcjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cmllcyA9IGdyb3VwLmNoaWxkcmVuO1xyXG4gICAgICAgIGxldCBjb3VudCAgID0gZW50cmllcy5sZW5ndGggLSAxOyAvLyAtMSBmb3IgaGVhZGVyIGVsZW1lbnRcclxuICAgICAgICBsZXQgaGlkZGVuICA9IDA7XHJcblxyXG4gICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHN0YXRpb24gbmFtZSBpbiB0aGlzIGxldHRlciBzZWN0aW9uLiBIZWFkZXIgc2tpcHBlZC5cclxuICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGVudHJpZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIGhpZGRlbiArPSBDaG9vc2VyLmZpbHRlckl0ZW0oZW50cmllc1tpXSBhcyBIVE1MRWxlbWVudCwgZmlsdGVyKTtcclxuXHJcbiAgICAgICAgLy8gSWYgYWxsIHN0YXRpb24gbmFtZXMgaW4gdGhpcyBsZXR0ZXIgc2VjdGlvbiB3ZXJlIGhpZGRlbiwgaGlkZSB0aGUgc2VjdGlvblxyXG4gICAgICAgIGlmIChoaWRkZW4gPj0gY291bnQpXHJcbiAgICAgICAgICAgIGdyb3VwLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgZ3JvdXAuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IGNoYW5nZXMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLCBhbmQgdXBkYXRlcyB0aGUgc3RhdGUgYW5kIGVkaXRvciAqL1xyXG4gICAgcHJvdGVjdGVkIHNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBhbHJlYWR5U2VsZWN0ZWQgPSAoZW50cnkgPT09IHRoaXMuZG9tU2VsZWN0ZWQpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zZWxlY3RPbkNsaWNrKVxyXG4gICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChlbnRyeSk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm9uU2VsZWN0KVxyXG4gICAgICAgICAgICB0aGlzLm9uU2VsZWN0KGVudHJ5KTtcclxuXHJcbiAgICAgICAgaWYgKGFscmVhZHlTZWxlY3RlZClcclxuICAgICAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSBjaGFuZ2VzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudCAqL1xyXG4gICAgcHJvdGVjdGVkIHZpc3VhbFNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMudmlzdWFsVW5zZWxlY3QoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZCAgICAgICAgICA9IGVudHJ5O1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQudGFiSW5kZXggPSA1MDtcclxuICAgICAgICBlbnRyeS5zZXRBdHRyaWJ1dGUoJ3NlbGVjdGVkJywgJ3RydWUnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgdW5zZWxlY3RzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudCwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgdmlzdWFsVW5zZWxlY3QoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuZG9tU2VsZWN0ZWQpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC5yZW1vdmVBdHRyaWJ1dGUoJ3NlbGVjdGVkJyk7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC50YWJJbmRleCA9IC0xO1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQgICAgICAgICAgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXaGV0aGVyIHRoaXMgY2hvb3NlciBpcyBhbiBhbmNlc3RvciAob3duZXIpIG9mIHRoZSBnaXZlbiBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWxlbWVudCB0byBjaGVjayBpZiB0aGlzIGNob29zZXIgaXMgYW4gYW5jZXN0b3Igb2ZcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG93bnModGFyZ2V0OiBIVE1MRWxlbWVudCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmNvbnRhaW5zKHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgdGhlIGdpdmVuIGVsZW1lbnQgaXMgYSBjaG9vc2FibGUgb25lIG93bmVkIGJ5IHRoaXMgY2hvb3NlciAqL1xyXG4gICAgcHJvdGVjdGVkIGlzQ2hvaWNlKHRhcmdldD86IEhUTUxFbGVtZW50KSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGFyZ2V0ICE9PSB1bmRlZmluZWRcclxuICAgICAgICAgICAgJiYgdGFyZ2V0LnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2RkJ1xyXG4gICAgICAgICAgICAmJiB0aGlzLm93bnModGFyZ2V0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqXHJcbiAqIFNpbmdsZXRvbiBpbnN0YW5jZSBvZiB0aGUgc3RhdGlvbiBwaWNrZXIuIFNpbmNlIHRoZXJlIGFyZSBleHBlY3RlZCB0byBiZSAyNTAwK1xyXG4gKiBzdGF0aW9ucywgdGhpcyBlbGVtZW50IHdvdWxkIHRha2UgdXAgYSBsb3Qgb2YgbWVtb3J5IGFuZCBnZW5lcmF0ZSBhIGxvdCBvZiBET00uIFNvLCBpdFxyXG4gKiBoYXMgdG8gYmUgXCJzd2FwcGVkXCIgYmV0d2VlbiBwaWNrZXJzIGFuZCB2aWV3cyB0aGF0IHdhbnQgdG8gdXNlIGl0LlxyXG4gKi9cclxuY2xhc3MgU3RhdGlvbkNob29zZXIgZXh0ZW5kcyBDaG9vc2VyXHJcbntcclxuICAgIC8qKiBTaG9ydGN1dCByZWZlcmVuY2VzIHRvIGFsbCB0aGUgZ2VuZXJhdGVkIEEtWiBzdGF0aW9uIGxpc3QgZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tU3RhdGlvbnMgOiBEaWN0aW9uYXJ5PEhUTUxETGlzdEVsZW1lbnQ+ID0ge307XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIocGFyZW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMudGFiSW5kZXggPSAwO1xyXG5cclxuICAgICAgICAvLyBQb3B1bGF0ZXMgdGhlIGxpc3Qgb2Ygc3RhdGlvbnMgZnJvbSB0aGUgZGF0YWJhc2UuIFdlIGRvIHRoaXMgYnkgY3JlYXRpbmcgYSBkbFxyXG4gICAgICAgIC8vIGVsZW1lbnQgZm9yIGVhY2ggbGV0dGVyIG9mIHRoZSBhbHBoYWJldCwgY3JlYXRpbmcgYSBkdCBlbGVtZW50IGhlYWRlciwgYW5kIHRoZW5cclxuICAgICAgICAvLyBwb3B1bGF0aW5nIHRoZSBkbCB3aXRoIHN0YXRpb24gbmFtZSBkZCBjaGlsZHJlbi5cclxuICAgICAgICBPYmplY3Qua2V5cyhSQUcuZGF0YWJhc2Uuc3RhdGlvbnMpLmZvckVhY2goIHRoaXMuYWRkU3RhdGlvbi5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRhY2hlcyB0aGlzIGNvbnRyb2wgdG8gdGhlIGdpdmVuIHBhcmVudCBhbmQgcmVzZXRzIHNvbWUgc3RhdGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBpY2tlciBQaWNrZXIgdG8gYXR0YWNoIHRoaXMgY29udHJvbCB0b1xyXG4gICAgICogQHBhcmFtIG9uU2VsZWN0IERlbGVnYXRlIHRvIGZpcmUgd2hlbiBjaG9vc2luZyBhIHN0YXRpb25cclxuICAgICAqL1xyXG4gICAgcHVibGljIGF0dGFjaChwaWNrZXI6IFBpY2tlciwgb25TZWxlY3Q6IFNlbGVjdERlbGVnYXRlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IHBpY2tlci5kb21Gb3JtO1xyXG4gICAgICAgIGxldCBjdXJyZW50ID0gdGhpcy5kb20ucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgLy8gUmUtZW5hYmxlIGFsbCBkaXNhYmxlZCBlbGVtZW50c1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnF1ZXJ5U2VsZWN0b3JBbGwoYGRkW2Rpc2FibGVkXWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKCB0aGlzLmVuYWJsZS5iaW5kKHRoaXMpICk7XHJcblxyXG4gICAgICAgIGlmICghY3VycmVudCB8fCBjdXJyZW50ICE9PSBwYXJlbnQpXHJcbiAgICAgICAgICAgIHBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMudmlzdWFsVW5zZWxlY3QoKTtcclxuICAgICAgICB0aGlzLm9uU2VsZWN0ID0gb25TZWxlY3QuYmluZChwaWNrZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQcmUtc2VsZWN0cyBhIHN0YXRpb24gZW50cnkgYnkgaXRzIGNvZGUgKi9cclxuICAgIHB1YmxpYyBwcmVzZWxlY3RDb2RlKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gdGhpcy5nZXRCeUNvZGUoY29kZSk7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoZW50cnkpO1xyXG4gICAgICAgIGVudHJ5LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEVuYWJsZXMgdGhlIGdpdmVuIHN0YXRpb24gY29kZSBvciBzdGF0aW9uIGVsZW1lbnQgZm9yIHNlbGVjdGlvbiAqL1xyXG4gICAgcHVibGljIGVuYWJsZShjb2RlT3JOb2RlOiBzdHJpbmcgfCBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gKHR5cGVvZiBjb2RlT3JOb2RlID09PSAnc3RyaW5nJylcclxuICAgICAgICAgICAgPyB0aGlzLmdldEJ5Q29kZShjb2RlT3JOb2RlKVxyXG4gICAgICAgICAgICA6IGNvZGVPck5vZGU7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgZW50cnkucmVtb3ZlQXR0cmlidXRlKCdkaXNhYmxlZCcpO1xyXG4gICAgICAgIGVudHJ5LnRhYkluZGV4ID0gLTE7XHJcbiAgICAgICAgZW50cnkudGl0bGUgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRGlzYWJsZXMgdGhlIGdpdmVuIHN0YXRpb24gY29kZSBmcm9tIHNlbGVjdGlvbiAqL1xyXG4gICAgcHVibGljIGRpc2FibGUoY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSB0aGlzLmdldEJ5Q29kZShjb2RlKTtcclxuICAgICAgICBsZXQgbmV4dCAgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZW50cnksIDEpO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGVudHJ5LnNldEF0dHJpYnV0ZSgnZGlzYWJsZWQnLCAnJyk7XHJcbiAgICAgICAgZW50cnkucmVtb3ZlQXR0cmlidXRlKCd0YWJpbmRleCcpO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlID0gJyc7XHJcblxyXG4gICAgICAgIC8vIFNoaWZ0IGZvY3VzIHRvIG5leHQgYXZhaWxhYmxlIGVsZW1lbnQsIGZvciBrZXlib2FyZCBuYXZpZ2F0aW9uXHJcbiAgICAgICAgaWYgKG5leHQpXHJcbiAgICAgICAgICAgIG5leHQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyBhIHN0YXRpb24ncyBjaG9pY2UgZWxlbWVudCBieSBpdHMgY29kZSAqL1xyXG4gICAgcHJpdmF0ZSBnZXRCeUNvZGUoY29kZTogc3RyaW5nKSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaW5wdXRDaG9pY2VzXHJcbiAgICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKGBkZFtkYXRhLWNvZGU9JHtjb2RlfV1gKSBhcyBIVE1MRWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGdpdmVuIHN0YXRpb24gY29kZSAqL1xyXG4gICAgcHJpdmF0ZSBhZGRTdGF0aW9uKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSBSQUcuZGF0YWJhc2Uuc3RhdGlvbnNbY29kZV07XHJcbiAgICAgICAgbGV0IGxldHRlciAgPSBzdGF0aW9uWzBdO1xyXG4gICAgICAgIGxldCBncm91cCAgID0gdGhpcy5kb21TdGF0aW9uc1tsZXR0ZXJdO1xyXG5cclxuICAgICAgICBpZiAoIWdyb3VwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGhlYWRlciAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2R0Jyk7XHJcbiAgICAgICAgICAgIGhlYWRlci5pbm5lclRleHQgPSBsZXR0ZXIudG9VcHBlckNhc2UoKTtcclxuICAgICAgICAgICAgaGVhZGVyLnRhYkluZGV4ICA9IC0xO1xyXG5cclxuICAgICAgICAgICAgZ3JvdXAgPSB0aGlzLmRvbVN0YXRpb25zW2xldHRlcl0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkbCcpO1xyXG4gICAgICAgICAgICBncm91cC50YWJJbmRleCA9IDUwO1xyXG5cclxuICAgICAgICAgICAgZ3JvdXAuc2V0QXR0cmlidXRlKCdncm91cCcsICcnKTtcclxuICAgICAgICAgICAgZ3JvdXAuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuYXBwZW5kQ2hpbGQoZ3JvdXApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGVudHJ5ICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuICAgICAgICBlbnRyeS5kYXRhc2V0Wydjb2RlJ10gPSBjb2RlO1xyXG4gICAgICAgIGVudHJ5LmlubmVyVGV4dCAgICAgICA9IFJBRy5kYXRhYmFzZS5zdGF0aW9uc1tjb2RlXTtcclxuICAgICAgICBlbnRyeS50aXRsZSAgICAgICAgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgICAgICBlbnRyeS50YWJJbmRleCAgICAgICAgPSAtMTtcclxuXHJcbiAgICAgICAgZ3JvdXAuYXBwZW5kQ2hpbGQoZW50cnkpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogU3RhdGlvbiBsaXN0IGl0ZW0gdGhhdCBjYW4gYmUgZHJhZ2dlZCBhbmQgZHJvcHBlZCAqL1xyXG5jbGFzcyBTdGF0aW9uTGlzdEl0ZW1cclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIHRlbXBsYXRlIHRvIGNsb25lLCBmb3IgZWFjaCBpdGVtIGNyZWF0ZWQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUgICAgPSBET00ucmVxdWlyZSgnI3N0YXRpb25MaXN0SXRlbVRlbXBsYXRlJyk7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmlkID0gJyc7XHJcblxyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGl0ZW0ncyBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgc3RhdGlvbiBsaXN0IGl0ZW0sIG1lYW50IGZvciB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBjcmVhdGUgdGhpcyBpdGVtIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoY29kZTogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIGlmICghU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uaW5pdCgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbSAgICAgICAgICAgPSBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuZG9tLmlubmVyVGV4dCA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUsIGZhbHNlKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uZGF0YXNldFsnY29kZSddID0gY29kZTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEJhc2UgY2xhc3MgZm9yIHBpY2tlciB2aWV3cyAqL1xyXG5hYnN0cmFjdCBjbGFzcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgZm9ybSBET00gZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbUZvcm0gICA6IEhUTUxGb3JtRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBoZWFkZXIgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbUhlYWRlciA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIEdldHMgdGhlIG5hbWUgb2YgdGhlIFhNTCB0YWcgdGhpcyBwaWNrZXIgaGFuZGxlcyAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IHhtbFRhZyAgICA6IHN0cmluZztcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2UgZWxlbWVudCBiZWluZyBlZGl0ZWQgYnkgdGhpcyBwaWNrZXIgKi9cclxuICAgIHByb3RlY3RlZCBkb21FZGl0aW5nPyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHBpY2tlciB0byBoYW5kbGUgdGhlIGdpdmVuIHBocmFzZSBlbGVtZW50IHR5cGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHhtbFRhZyBOYW1lIG9mIHRoZSBYTUwgdGFnIHRoaXMgcGlja2VyIHdpbGwgaGFuZGxlLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3IoeG1sVGFnOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgPSBET00ucmVxdWlyZShgIyR7eG1sVGFnfVBpY2tlcmApO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybSAgID0gRE9NLnJlcXVpcmUoJ2Zvcm0nLCAgIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlciA9IERPTS5yZXF1aXJlKCdoZWFkZXInLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy54bWxUYWcgICAgPSB4bWxUYWc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmNoYW5nZSAgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uaW5wdXQgICA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25jbGljayAgID0gdGhpcy5vbkNsaWNrLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9ua2V5ZG93biA9IHRoaXMub25JbnB1dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbnN1Ym1pdCAgPSB0aGlzLm9uU3VibWl0LmJpbmQodGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxsZWQgd2hlbiBmb3JtIGZpZWxkcyBjaGFuZ2UuIFRoZSBpbXBsZW1lbnRpbmcgcGlja2VyIHNob3VsZCB1cGRhdGUgYWxsIGxpbmtlZFxyXG4gICAgICogZWxlbWVudHMgKGUuZy4gb2Ygc2FtZSB0eXBlKSB3aXRoIHRoZSBuZXcgZGF0YSBoZXJlLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25DaGFuZ2UoZXY6IEV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIGEgbW91c2UgY2xpY2sgaGFwcGVucyBhbnl3aGVyZSBpbiBvciBvbiB0aGUgcGlja2VyJ3MgZm9ybSAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKiogQ2FsbGVkIHdoZW4gYSBrZXkgaXMgcHJlc3NlZCB3aGlsc3QgdGhlIHBpY2tlcidzIGZvcm0gaXMgZm9jdXNlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENhbGxlZCB3aGVuIEVOVEVSIGlzIHByZXNzZWQgd2hpbHN0IGEgZm9ybSBjb250cm9sIG9mIHRoZSBwaWNrZXIgaXMgZm9jdXNlZC5cclxuICAgICAqIEJ5IGRlZmF1bHQsIHRoaXMgd2lsbCB0cmlnZ2VyIHRoZSBvbkNoYW5nZSBoYW5kbGVyIGFuZCBjbG9zZSB0aGUgZGlhbG9nLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIHRoaXMub25DaGFuZ2UoZXYpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9wZW4gdGhpcyBwaWNrZXIgZm9yIGEgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQuIFRoZSBpbXBsZW1lbnRpbmcgcGlja2VyIHNob3VsZCBmaWxsXHJcbiAgICAgKiBpdHMgZm9ybSBlbGVtZW50cyB3aXRoIGRhdGEgZnJvbSB0aGUgY3VycmVudCBzdGF0ZSBhbmQgdGFyZ2V0ZWQgZWxlbWVudCBoZXJlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IHRhcmdldCBQaHJhc2UgZWxlbWVudCB0aGF0IHRoaXMgcGlja2VyIGlzIGJlaW5nIG9wZW5lZCBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nID0gdGFyZ2V0O1xyXG4gICAgICAgIHRoaXMubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlcyB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gRml4IGtleWJvYXJkIHN0YXlpbmcgb3BlbiBpbiBpT1Mgb24gY2xvc2VcclxuICAgICAgICBET00uYmx1ckFjdGl2ZSh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3NpdGlvbnMgdGhpcyBwaWNrZXIgcmVsYXRpdmUgdG8gdGhlIHRhcmdldCBwaHJhc2UgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIGxheW91dCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5kb21FZGl0aW5nKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCB0YXJnZXRSZWN0ID0gdGhpcy5kb21FZGl0aW5nLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGxldCBmdWxsV2lkdGggID0gdGhpcy5kb20uY2xhc3NMaXN0LmNvbnRhaW5zKCdmdWxsV2lkdGgnKTtcclxuICAgICAgICBsZXQgaXNNb2RhbCAgICA9IHRoaXMuZG9tLmNsYXNzTGlzdC5jb250YWlucygnbW9kYWwnKTtcclxuICAgICAgICBsZXQgZG9jVyAgICAgICA9IGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGg7XHJcbiAgICAgICAgbGV0IGRvY0ggICAgICAgPSBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodDtcclxuICAgICAgICBsZXQgZGlhbG9nWCAgICA9ICh0YXJnZXRSZWN0LmxlZnQgICB8IDApIC0gODtcclxuICAgICAgICBsZXQgZGlhbG9nWSAgICA9ICB0YXJnZXRSZWN0LmJvdHRvbSB8IDA7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1cgICAgPSAodGFyZ2V0UmVjdC53aWR0aCAgfCAwKSArIDE2O1xyXG5cclxuICAgICAgICAvLyBBZGp1c3QgaWYgaG9yaXpvbnRhbGx5IG9mZiBzY3JlZW5cclxuICAgICAgICBpZiAoIWZ1bGxXaWR0aCAmJiAhaXNNb2RhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEZvcmNlIGZ1bGwgd2lkdGggb24gbW9iaWxlXHJcbiAgICAgICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLndpZHRoID0gYDEwMCVgO1xyXG5cclxuICAgICAgICAgICAgICAgIGRpYWxvZ1ggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUud2lkdGggICAgPSBgaW5pdGlhbGA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS5taW5XaWR0aCA9IGAke2RpYWxvZ1d9cHhgO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChkaWFsb2dYICsgdGhpcy5kb20ub2Zmc2V0V2lkdGggPiBkb2NXKVxyXG4gICAgICAgICAgICAgICAgICAgIGRpYWxvZ1ggPSAodGFyZ2V0UmVjdC5yaWdodCB8IDApIC0gdGhpcy5kb20ub2Zmc2V0V2lkdGggKyA4O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGlja2VycyB0aGF0IGluc3RlYWQgdGFrZSB1cCB0aGUgd2hvbGUgZGlzcGxheS4gQ1NTIGlzbid0IHVzZWQgaGVyZSxcclxuICAgICAgICAvLyBiZWNhdXNlIHBlcmNlbnRhZ2UtYmFzZWQgbGVmdC90b3AgY2F1c2VzIHN1YnBpeGVsIGlzc3VlcyBvbiBDaHJvbWUuXHJcbiAgICAgICAgaWYgKGlzTW9kYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBkaWFsb2dYID0gRE9NLmlzTW9iaWxlID8gMCA6XHJcbiAgICAgICAgICAgICAgICAoIChkb2NXICAqIDAuMSkgLyAyICkgfCAwO1xyXG5cclxuICAgICAgICAgICAgZGlhbG9nWSA9IERPTS5pc01vYmlsZSA/IDAgOlxyXG4gICAgICAgICAgICAgICAgKCAoZG9jSCAqIDAuMSkgLyAyICkgfCAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgdG8gdG9wIGVkZ2Ugb2YgZG9jdW1lbnRcclxuICAgICAgICBlbHNlIGlmIChkaWFsb2dZIDwgMClcclxuICAgICAgICAgICAgZGlhbG9nWSA9IDA7XHJcblxyXG4gICAgICAgIC8vIEFkanVzdCBpZiB2ZXJ0aWNhbGx5IG9mZiBzY3JlZW5cclxuICAgICAgICBlbHNlIGlmIChkaWFsb2dZICsgdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ID4gZG9jSClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSAodGFyZ2V0UmVjdC50b3AgfCAwKSAtIHRoaXMuZG9tLm9mZnNldEhlaWdodCArIDE7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QuYWRkKCdiZWxvdycpO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LnJlbW92ZSgnYWJvdmUnKTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHN0aWxsIG9mZi1zY3JlZW4sIGNsYW1wIHRvIGJvdHRvbVxyXG4gICAgICAgICAgICBpZiAoZGlhbG9nWSArIHRoaXMuZG9tLm9mZnNldEhlaWdodCA+IGRvY0gpXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dZID0gZG9jSCAtIHRoaXMuZG9tLm9mZnNldEhlaWdodDtcclxuXHJcbiAgICAgICAgICAgIC8vIENsYW1wIHRvIHRvcCBlZGdlIG9mIGRvY3VtZW50LiBMaWtlbHkgaGFwcGVucyBpZiB0YXJnZXQgZWxlbWVudCBpcyBsYXJnZS5cclxuICAgICAgICAgICAgaWYgKGRpYWxvZ1kgPCAwKVxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWSA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QuYWRkKCdhYm92ZScpO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LnJlbW92ZSgnYmVsb3cnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLnN0eWxlLmxlZnQgPSAoZnVsbFdpZHRoID8gMCA6IGRpYWxvZ1gpICsgJ3B4JztcclxuICAgICAgICB0aGlzLmRvbS5zdHlsZS50b3AgID0gZGlhbG9nWSArICdweCc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJldHVybnMgdHJ1ZSBpZiBhbiBlbGVtZW50IGluIHRoaXMgcGlja2VyIGN1cnJlbnRseSBoYXMgZm9jdXMgKi9cclxuICAgIHB1YmxpYyBoYXNGb2N1cygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5jb250YWlucyhkb2N1bWVudC5hY3RpdmVFbGVtZW50KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgY29hY2ggcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBDb2FjaFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbGV0dGVyIGRyb3AtZG93biBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGV0dGVyIDogSFRNTFNlbGVjdEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBjb2FjaCBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignY29hY2gnKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlciA9IERPTS5yZXF1aXJlKCdzZWxlY3QnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMjY7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcclxuICAgICAgICAgICAgbGV0IGxldHRlciA9IEwuTEVUVEVSU1tpXTtcclxuXHJcbiAgICAgICAgICAgIG9wdGlvbi50ZXh0ID0gb3B0aW9uLnZhbHVlID0gbGV0dGVyO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5pbnB1dExldHRlci5hcHBlbmRDaGlsZChvcHRpb24pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIHRhcmdldCBjb250ZXh0J3MgY29hY2ggbGV0dGVyICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfQ09BQ0godGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9IFJBRy5zdGF0ZS5nZXRDb2FjaCh0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgY29hY2ggZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9DT0FDSF9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldENvYWNoKHRoaXMuY3VycmVudEN0eCwgdGhpcy5pbnB1dExldHRlci52YWx1ZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPWNvYWNoXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgZXhjdXNlIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgRXhjdXNlUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignZXhjdXNlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0VYQ1VTRSgpO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2UuZXhjdXNlcy5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBleGN1c2UgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgZXhjdXNlXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdChSQUcuc3RhdGUuZXhjdXNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIGV4Y3VzZSBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5leGN1c2UgPSBlbnRyeS5pbm5lclRleHQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoJ2V4Y3VzZScsIFJBRy5zdGF0ZS5leGN1c2UpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBpbnRlZ2VyIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgSW50ZWdlclBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbnVtZXJpY2FsIGlucHV0IHNwaW5uZXIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXREaWdpdCA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3Mgb3B0aW9uYWwgc3VmZml4IGxhYmVsICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUxhYmVsICAgOiBIVE1MTGFiZWxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4PyA6IHN0cmluZztcclxuICAgIC8qKiBIb2xkcyB0aGUgb3B0aW9uYWwgc2luZ3VsYXIgc3VmZml4IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzaW5ndWxhcj8gICA6IHN0cmluZztcclxuICAgIC8qKiBIb2xkcyB0aGUgb3B0aW9uYWwgcGx1cmFsIHN1ZmZpeCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgcGx1cmFsPyAgICAgOiBzdHJpbmc7XHJcbiAgICAvKiogV2hldGhlciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCB3YW50cyB3b3JkIGRpZ2l0cyAqL1xyXG4gICAgcHJpdmF0ZSB3b3Jkcz8gICAgICA6IGJvb2xlYW47XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignaW50ZWdlcicpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21MYWJlbCAgID0gRE9NLnJlcXVpcmUoJ2xhYmVsJywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICAvLyBpT1MgbmVlZHMgZGlmZmVyZW50IHR5cGUgYW5kIHBhdHRlcm4gdG8gc2hvdyBhIG51bWVyaWNhbCBrZXlib2FyZFxyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQudHlwZSAgICA9ICd0ZWwnO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQucGF0dGVybiA9ICdbMC05XSsnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIHRhcmdldCBjb250ZXh0J3MgaW50ZWdlciBkYXRhICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5zaW5ndWxhciAgID0gdGFyZ2V0LmRhdGFzZXRbJ3Npbmd1bGFyJ107XHJcbiAgICAgICAgdGhpcy5wbHVyYWwgICAgID0gdGFyZ2V0LmRhdGFzZXRbJ3BsdXJhbCddO1xyXG4gICAgICAgIHRoaXMud29yZHMgICAgICA9IFBhcnNlLmJvb2xlYW4odGFyZ2V0LmRhdGFzZXRbJ3dvcmRzJ10gfHwgJ2ZhbHNlJyk7XHJcblxyXG4gICAgICAgIGxldCB2YWx1ZSA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKHRoaXMuc2luZ3VsYXIgJiYgdmFsdWUgPT09IDEpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5zaW5ndWxhcjtcclxuICAgICAgICBlbHNlIGlmICh0aGlzLnBsdXJhbCAmJiB2YWx1ZSAhPT0gMSlcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnBsdXJhbDtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gJyc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0lOVEVHRVIodGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQudmFsdWUgICAgPSB2YWx1ZS50b1N0cmluZygpO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBpbnRlZ2VyIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfSU5UX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICAvLyBDYW4ndCB1c2UgdmFsdWVBc051bWJlciBkdWUgdG8gaU9TIGlucHV0IHR5cGUgd29ya2Fyb3VuZHNcclxuICAgICAgICBsZXQgaW50ICAgID0gcGFyc2VJbnQodGhpcy5pbnB1dERpZ2l0LnZhbHVlKTtcclxuICAgICAgICBsZXQgaW50U3RyID0gKHRoaXMud29yZHMpXHJcbiAgICAgICAgICAgID8gTC5ESUdJVFNbaW50XSB8fCBpbnQudG9TdHJpbmcoKVxyXG4gICAgICAgICAgICA6IGludC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgaW52YWxpZCB2YWx1ZXNcclxuICAgICAgICBpZiAoIGlzTmFOKGludCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gJyc7XHJcblxyXG4gICAgICAgIGlmIChpbnQgPT09IDEgJiYgdGhpcy5zaW5ndWxhcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7dGhpcy5zaW5ndWxhcn1gO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMuc2luZ3VsYXI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKGludCAhPT0gMSAmJiB0aGlzLnBsdXJhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7dGhpcy5wbHVyYWx9YDtcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnBsdXJhbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRJbnRlZ2VyKHRoaXMuY3VycmVudEN0eCwgaW50KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9aW50ZWdlcl1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgbmFtZWQgdHJhaW4gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBOYW1lZFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ25hbWVkJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX05BTUVEKCk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5uYW1lZC5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBuYW1lXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdChSQUcuc3RhdGUubmFtZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgbmFtZWQgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUubmFtZWQgPSBlbnRyeS5pbm5lclRleHQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoJ25hbWVkJywgUkFHLnN0YXRlLm5hbWVkKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGhyYXNlc2V0IHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgUGhyYXNlc2V0UGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSByZWZlcmVuY2UgdGFnIGZvciB0aGUgY3VycmVudCBwaHJhc2VzZXQgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFJlZj8gOiBzdHJpbmc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigncGhyYXNlc2V0Jyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBwaHJhc2VzZXQncyBsaXN0IG9mIHBocmFzZXMgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgbGV0IHJlZiA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdyZWYnKTtcclxuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoIERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdpZHgnKSApO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9QU0VUX1VOS05PV04ocmVmKSApO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRSZWYgICAgICAgICAgPSByZWY7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfUEhSQVNFU0VUKHJlZik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5jbGVhcigpO1xyXG5cclxuICAgICAgICAvLyBGb3IgZWFjaCBwaHJhc2UsIHdlIG5lZWQgdG8gcnVuIGl0IHRocm91Z2ggdGhlIHBocmFzZXIgdXNpbmcgdGhlIGN1cnJlbnQgc3RhdGVcclxuICAgICAgICAvLyB0byBnZW5lcmF0ZSBcInByZXZpZXdzXCIgb2YgaG93IHRoZSBwaHJhc2Ugd2lsbCBsb29rLlxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGhyYXNlc2V0LmNoaWxkcmVuLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHBocmFzZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcblxyXG4gICAgICAgICAgICBET00uY2xvbmVJbnRvKHBocmFzZXNldC5jaGlsZHJlbltpXSBhcyBIVE1MRWxlbWVudCwgcGhyYXNlKTtcclxuICAgICAgICAgICAgUkFHLnBocmFzZXIucHJvY2VzcyhwaHJhc2UpO1xyXG5cclxuICAgICAgICAgICAgcGhyYXNlLmlubmVyVGV4dCAgID0gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dChwaHJhc2UpO1xyXG4gICAgICAgICAgICBwaHJhc2UuZGF0YXNldC5pZHggPSBpLnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmRvbUNob29zZXIuYWRkUmF3KHBocmFzZSwgaSA9PT0gaWR4KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBwaHJhc2VzZXQgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFJlZilcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9QU0VUX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoZW50cnkuZGF0YXNldFsnaWR4J10hKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFBocmFzZXNldElkeCh0aGlzLmN1cnJlbnRSZWYsIGlkeCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IucmVmcmVzaFBocmFzZXNldCh0aGlzLmN1cnJlbnRSZWYpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBwbGF0Zm9ybSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFBsYXRmb3JtUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBudW1lcmljYWwgaW5wdXQgc3Bpbm5lciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dERpZ2l0ICA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbGV0dGVyIGRyb3AtZG93biBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGV0dGVyIDogSFRNTFNlbGVjdEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigncGxhdGZvcm0nKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0ICAgICAgICAgID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIgICAgICAgICA9IERPTS5yZXF1aXJlKCdzZWxlY3QnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfUExBVEZPUk0oKTtcclxuXHJcbiAgICAgICAgLy8gaU9TIG5lZWRzIGRpZmZlcmVudCB0eXBlIGFuZCBwYXR0ZXJuIHRvIHNob3cgYSBudW1lcmljYWwga2V5Ym9hcmRcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnR5cGUgICAgPSAndGVsJztcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnBhdHRlcm4gPSAnWzAtOV0rJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgcGxhdGZvcm0gZGF0YSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICBsZXQgdmFsdWUgPSBSQUcuc3RhdGUucGxhdGZvcm07XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC52YWx1ZSAgPSB2YWx1ZVswXTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gdmFsdWVbMV07XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHBsYXRmb3JtIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gSWdub3JlIGludmFsaWQgdmFsdWVzXHJcbiAgICAgICAgaWYgKCBpc05hTiggcGFyc2VJbnQodGhpcy5pbnB1dERpZ2l0LnZhbHVlKSApIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUucGxhdGZvcm0gPSBbdGhpcy5pbnB1dERpZ2l0LnZhbHVlLCB0aGlzLmlucHV0TGV0dGVyLnZhbHVlXTtcclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoICdwbGF0Zm9ybScsIFJBRy5zdGF0ZS5wbGF0Zm9ybS5qb2luKCcnKSApO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2VydmljZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFNlcnZpY2VQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHNlcnZpY2UgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3NlcnZpY2UnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5zZXJ2aWNlcy5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBzZXJ2aWNlICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU0VSVklDRSh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBzZXJ2aWNlXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdCggUkFHLnN0YXRlLmdldFNlcnZpY2UodGhpcy5jdXJyZW50Q3R4KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgc2VydmljZSBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1NFUlZJQ0VfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTZXJ2aWNlKHRoaXMuY3VycmVudEN0eCwgZW50cnkuaW5uZXJUZXh0KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9c2VydmljZV1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBlbnRyeS5pbm5lclRleHQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0aW9uIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU3RhdGlvblBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3Mgc2hhcmVkIHN0YXRpb24gY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGNob29zZXIgOiBTdGF0aW9uQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHN0YXRpb24gZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9uT3BlbiBkZWxlZ2F0ZSBmb3IgU3RhdGlvblBpY2tlciBvciBmb3IgU3RhdGlvbkxpc3RQaWNrZXIgKi9cclxuICAgIHByb3RlY3RlZCBvbk9wZW4gICAgIDogKHRhcmdldDogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHRhZzogc3RyaW5nID0gJ3N0YXRpb24nKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKHRhZyk7XHJcblxyXG4gICAgICAgIGlmICghU3RhdGlvblBpY2tlci5jaG9vc2VyKVxyXG4gICAgICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIgPSBuZXcgU3RhdGlvbkNob29zZXIodGhpcy5kb21Gb3JtKTtcclxuXHJcbiAgICAgICAgdGhpcy5vbk9wZW4gPSB0aGlzLm9uU3RhdGlvblBpY2tlck9wZW4uYmluZCh0aGlzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlyZXMgdGhlIG9uT3BlbiBkZWxlZ2F0ZSByZWdpc3RlcmVkIGZvciB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG4gICAgICAgIHRoaXMub25PcGVuKHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEF0dGFjaGVzIHRoZSBzdGF0aW9uIGNob29zZXIgYW5kIGZvY3VzZXMgaXQgb250byB0aGUgY3VycmVudCBlbGVtZW50J3Mgc3RhdGlvbiAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3RhdGlvblBpY2tlck9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNob29zZXIgICAgID0gU3RhdGlvblBpY2tlci5jaG9vc2VyO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGNob29zZXIuYXR0YWNoKHRoaXMsIHRoaXMub25TZWxlY3RTdGF0aW9uKTtcclxuICAgICAgICBjaG9vc2VyLnByZXNlbGVjdENvZGUoIFJBRy5zdGF0ZS5nZXRTdGF0aW9uKHRoaXMuY3VycmVudEN0eCkgKTtcclxuICAgICAgICBjaG9vc2VyLnNlbGVjdE9uQ2xpY2sgPSB0cnVlO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TVEFUSU9OKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIHN0YXRpb24gY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uQ2xpY2soZXYpOyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uSW5wdXQoZXYpOyB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBzdGF0aW9uIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0U3RhdGlvbihlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBxdWVyeSA9IGBbZGF0YS10eXBlPXN0YXRpb25dW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYDtcclxuICAgICAgICBsZXQgY29kZSAgPSBlbnRyeS5kYXRhc2V0Wydjb2RlJ10hO1xyXG4gICAgICAgIGxldCBuYW1lICA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUsIHRydWUpO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U3RhdGlvbih0aGlzLmN1cnJlbnRDdHgsIGNvZGUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShxdWVyeSlcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gbmFtZSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJzdGF0aW9uUGlja2VyLnRzXCIvPlxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiLi4vLi4vdmVuZG9yL2RyYWdnYWJsZS5kLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0aW9uIGxpc3QgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTdGF0aW9uTGlzdFBpY2tlciBleHRlbmRzIFN0YXRpb25QaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNvbnRhaW5lciBmb3IgdGhlIGxpc3QgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21MaXN0ICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1vYmlsZS1vbmx5IGFkZCBzdGF0aW9uIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5BZGQgICAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1vYmlsZS1vbmx5IGNsb3NlIHBpY2tlciBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQ2xvc2UgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBkcm9wIHpvbmUgZm9yIGRlbGV0aW5nIHN0YXRpb24gZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tRGVsICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBhY3R1YWwgc29ydGFibGUgbGlzdCBvZiBzdGF0aW9ucyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExpc3QgICAgOiBIVE1MRExpc3RFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byBwbGFjZWhvbGRlciBzaG93biBpZiB0aGUgbGlzdCBpcyBlbXB0eSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21FbXB0eUxpc3QgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKFwic3RhdGlvbmxpc3RcIik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tTGlzdCAgICAgID0gRE9NLnJlcXVpcmUoJy5zdGF0aW9uTGlzdCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmJ0bkFkZCAgICAgICA9IERPTS5yZXF1aXJlKCcuYWRkU3RhdGlvbicsICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuYnRuQ2xvc2UgICAgID0gRE9NLnJlcXVpcmUoJy5jbG9zZVBpY2tlcicsIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5kb21EZWwgICAgICAgPSBET00ucmVxdWlyZSgnLmRlbFN0YXRpb24nLCAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmlucHV0TGlzdCAgICA9IERPTS5yZXF1aXJlKCdkbCcsICAgICAgICAgICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0ID0gRE9NLnJlcXVpcmUoJ3AnLCAgICAgICAgICAgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5vbk9wZW4gICAgICAgPSB0aGlzLm9uU3RhdGlvbkxpc3RQaWNrZXJPcGVuLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIG5ldyBEcmFnZ2FibGUuU29ydGFibGUoW3RoaXMuaW5wdXRMaXN0LCB0aGlzLmRvbURlbF0sIHsgZHJhZ2dhYmxlOiAnZGQnIH0pXHJcbiAgICAgICAgICAgIC8vIEhhdmUgdG8gdXNlIHRpbWVvdXQsIHRvIGxldCBEcmFnZ2FibGUgZmluaXNoIHNvcnRpbmcgdGhlIGxpc3RcclxuICAgICAgICAgICAgLm9uKCAnZHJhZzpzdG9wJywgZXYgPT4gc2V0VGltZW91dCgoKSA9PiB0aGlzLm9uRHJhZ1N0b3AoZXYpLCAxKSApXHJcbiAgICAgICAgICAgIC5vbiggJ21pcnJvcjpjcmVhdGUnLCB0aGlzLm9uRHJhZ01pcnJvckNyZWF0ZS5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQb3B1bGF0ZXMgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyLCB3aXRoIHRoZSBzZWxlY3RlZCBsaXN0LiBCZWNhdXNlIHRoaXMgcGlja2VyXHJcbiAgICAgKiBleHRlbmRzIGZyb20gU3RhdGlvbkxpc3QsIHRoaXMgaGFuZGxlciBvdmVycmlkZXMgdGhlICdvbk9wZW4nIGRlbGVnYXRlIHByb3BlcnR5XHJcbiAgICAgKiBvZiBTdGF0aW9uTGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IFN0YXRpb24gbGlzdCBlZGl0b3IgZWxlbWVudCB0byBvcGVuIGZvclxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdGF0aW9uTGlzdFBpY2tlck9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2luY2Ugd2Ugc2hhcmUgdGhlIHN0YXRpb24gcGlja2VyIHdpdGggU3RhdGlvbkxpc3QsIGdyYWIgaXRcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuYXR0YWNoKHRoaXMsIHRoaXMub25BZGRTdGF0aW9uKTtcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuc2VsZWN0T25DbGljayA9IGZhbHNlO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBlbnRyaWVzICAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdCh0aGlzLmN1cnJlbnRDdHgpLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NUQVRJT05MSVNUKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIC8vIFJlbW92ZSBhbGwgb2xkIGxpc3QgZWxlbWVudHNcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgICAgICAgLy8gRmluYWxseSwgcG9wdWxhdGUgbGlzdCBmcm9tIHRoZSBjbGlja2VkIHN0YXRpb24gbGlzdCBlbGVtZW50XHJcbiAgICAgICAgZW50cmllcy5mb3JFYWNoKCB2ID0+IHRoaXMuYWRkKHYpICk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkIHsgc3VwZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xpY2sgZXZlbnRzLCBmb3IgY2hvb3NpbmcgaXRlbXMgKi9cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vbkNsaWNrKGV2KTtcclxuXHJcbiAgICAgICAgaWYgKGV2LnRhcmdldCA9PT0gdGhpcy5idG5DbG9zZSlcclxuICAgICAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIC8vIEZvciBtb2JpbGUgdXNlcnMsIHN3aXRjaCB0byBzdGF0aW9uIGNob29zZXIgc2NyZWVuIGlmIFwiQWRkLi4uXCIgd2FzIGNsaWNrZWRcclxuICAgICAgICBpZiAoZXYudGFyZ2V0ID09PSB0aGlzLmJ0bkFkZClcclxuICAgICAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LmFkZCgnYWRkaW5nU3RhdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGtleWJvYXJkIG5hdmlnYXRpb24gZm9yIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciAqL1xyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9uSW5wdXQoZXYpO1xyXG5cclxuICAgICAgICBsZXQga2V5ICAgICA9IGV2LmtleTtcclxuICAgICAgICBsZXQgZm9jdXNlZCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgaGFuZGxlIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciBjb250cm9sXHJcbiAgICAgICAgaWYgKCAhZm9jdXNlZCB8fCAhdGhpcy5pbnB1dExpc3QuY29udGFpbnMoZm9jdXNlZCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBrZXlib2FyZCBuYXZpZ2F0aW9uXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5ID09PSAnQXJyb3dSaWdodCcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZGlyID0gKGtleSA9PT0gJ0Fycm93TGVmdCcpID8gLTEgOiAxO1xyXG4gICAgICAgICAgICBsZXQgbmF2ID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGZvY3VzZWQgZWxlbWVudFxyXG4gICAgICAgICAgICBpZiAoZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0TGlzdClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsZXZhbnQgdG8gYmVnaW5uaW5nIG9yIGVuZCBvZiBjb250YWluZXJcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID09PSAtMSlcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5sYXN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKG5hdikgbmF2LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgZW50cnkgZGVsZXRpb25cclxuICAgICAgICBpZiAoa2V5ID09PSAnRGVsZXRlJyB8fCBrZXkgPT09ICdCYWNrc3BhY2UnKVxyXG4gICAgICAgIGlmIChmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRMaXN0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gRm9jdXMgb24gbmV4dCBlbGVtZW50IG9yIHBhcmVudCBvbiBkZWxldGVcclxuICAgICAgICAgICAgbGV0IG5leHQgPSBmb2N1c2VkLnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBmb2N1c2VkLm5leHRFbGVtZW50U2libGluZyAgICAgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCB0aGlzLmlucHV0TGlzdDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGZvY3VzZWQpO1xyXG4gICAgICAgICAgICBuZXh0LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVyIGZvciB3aGVuIGEgc3RhdGlvbiBpcyBjaG9zZW4gKi9cclxuICAgIHByaXZhdGUgb25BZGRTdGF0aW9uKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5ld0VudHJ5ID0gdGhpcy5hZGQoZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcblxyXG4gICAgICAgIC8vIFN3aXRjaCBiYWNrIHRvIGJ1aWxkZXIgc2NyZWVuLCBpZiBvbiBtb2JpbGVcclxuICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QucmVtb3ZlKCdhZGRpbmdTdGF0aW9uJyk7XHJcbiAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuXHJcbiAgICAgICAgLy8gRm9jdXMgb25seSBpZiBvbiBtb2JpbGUsIHNpbmNlIHRoZSBzdGF0aW9uIGxpc3QgaXMgb24gYSBkZWRpY2F0ZWQgc2NyZWVuXHJcbiAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICAgICAgbmV3RW50cnkuZG9tLmZvY3VzKCk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBuZXdFbnRyeS5kb20uc2Nyb2xsSW50b1ZpZXcoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRml4ZXMgbWlycm9ycyBub3QgaGF2aW5nIGNvcnJlY3Qgd2lkdGggb2YgdGhlIHNvdXJjZSBlbGVtZW50LCBvbiBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgb25EcmFnTWlycm9yQ3JlYXRlKGV2OiBEcmFnZ2FibGUuRHJhZ0V2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIWV2LmRhdGEuc291cmNlIHx8ICFldi5kYXRhLm9yaWdpbmFsU291cmNlKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1NMX0RSQUdfTUlTU0lORygpICk7XHJcblxyXG4gICAgICAgIGV2LmRhdGEuc291cmNlLnN0eWxlLndpZHRoID0gZXYuZGF0YS5vcmlnaW5hbFNvdXJjZS5jbGllbnRXaWR0aCArICdweCc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgZHJhZ2dhYmxlIHN0YXRpb24gbmFtZSBiZWluZyBkcm9wcGVkICovXHJcbiAgICBwcml2YXRlIG9uRHJhZ1N0b3AoZXY6IERyYWdnYWJsZS5EcmFnRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoZXYuZGF0YS5vcmlnaW5hbFNvdXJjZS5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmRvbURlbClcclxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhbmQgYWRkcyBhIG5ldyBlbnRyeSBmb3IgdGhlIGJ1aWxkZXIgbGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGNyZWF0ZSBhbiBpdGVtIGZvclxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFkZChjb2RlOiBzdHJpbmcpIDogU3RhdGlvbkxpc3RJdGVtXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5ld0VudHJ5ID0gbmV3IFN0YXRpb25MaXN0SXRlbShjb2RlKTtcclxuXHJcbiAgICAgICAgLy8gQWRkIHRoZSBuZXcgZW50cnkgdG8gdGhlIHNvcnRhYmxlIGxpc3RcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5hcHBlbmRDaGlsZChuZXdFbnRyeS5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xyXG5cclxuICAgICAgICAvLyBEaXNhYmxlIHRoZSBhZGRlZCBzdGF0aW9uIGluIHRoZSBjaG9vc2VyXHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmRpc2FibGUoY29kZSk7XHJcblxyXG4gICAgICAgIC8vIERlbGV0ZSBpdGVtIG9uIGRvdWJsZSBjbGlja1xyXG4gICAgICAgIG5ld0VudHJ5LmRvbS5vbmRibGNsaWNrID0gXyA9PiB0aGlzLnJlbW92ZShuZXdFbnRyeS5kb20pO1xyXG5cclxuICAgICAgICByZXR1cm4gbmV3RW50cnk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZW1vdmVzIHRoZSBnaXZlbiBzdGF0aW9uIGVudHJ5IGVsZW1lbnQgZnJvbSB0aGUgYnVpbGRlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZW50cnkgRWxlbWVudCBvZiB0aGUgc3RhdGlvbiBlbnRyeSB0byByZW1vdmVcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZW1vdmUoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoICF0aGlzLmRvbUxpc3QuY29udGFpbnMoZW50cnkpIClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ0F0dGVtcHRlZCB0byByZW1vdmUgZW50cnkgbm90IG9uIHN0YXRpb24gbGlzdCBidWlsZGVyJyk7XHJcblxyXG4gICAgICAgIC8vIEVuYWJsZWQgdGhlIHJlbW92ZWQgc3RhdGlvbiBpbiB0aGUgY2hvb3NlclxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5lbmFibGUoZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcblxyXG4gICAgICAgIGVudHJ5LnJlbW92ZSgpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlucHV0TGlzdC5jaGlsZHJlbi5sZW5ndGggPT09IDApXHJcbiAgICAgICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBzdGF0aW9uIGxpc3QgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgY2hpbGRyZW4gPSB0aGlzLmlucHV0TGlzdC5jaGlsZHJlbjtcclxuXHJcbiAgICAgICAgLy8gRG9uJ3QgdXBkYXRlIGlmIGxpc3QgaXMgZW1wdHlcclxuICAgICAgICBpZiAoY2hpbGRyZW4ubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCBsaXN0ID0gW107XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZW50cnkgPSBjaGlsZHJlbltpXSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgIGxpc3QucHVzaChlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCB0ZXh0TGlzdCA9IFN0cmluZ3MuZnJvbVN0YXRpb25MaXN0KGxpc3Quc2xpY2UoKSwgdGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICBsZXQgcXVlcnkgICAgPSBgW2RhdGEtdHlwZT1zdGF0aW9ubGlzdF1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U3RhdGlvbkxpc3QodGhpcy5jdXJyZW50Q3R4LCBsaXN0KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkocXVlcnkpXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRleHRMaXN0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgdGltZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFRpbWVQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIHRpbWUgaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dFRpbWU6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCB0aW1lIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCd0aW1lJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIHRpbWUgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9USU1FKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lLnZhbHVlID0gUkFHLnN0YXRlLmdldFRpbWUodGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICB0aGlzLmlucHV0VGltZS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSB0aW1lIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfVElNRV9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFRpbWUodGhpcy5jdXJyZW50Q3R4LCB0aGlzLmlucHV0VGltZS52YWx1ZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPXRpbWVdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5pbnB1dFRpbWUudmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIExhbmd1YWdlIGVudHJpZXMgYXJlIHRlbXBsYXRlIGRlbGVnYXRlcyAqL1xyXG50eXBlIExhbmd1YWdlRW50cnkgPSAoLi4ucGFydHM6IHN0cmluZ1tdKSA9PiBzdHJpbmcgO1xyXG5cclxuYWJzdHJhY3QgY2xhc3MgQmFzZUxhbmd1YWdlXHJcbntcclxuICAgIFtpbmRleDogc3RyaW5nXSA6IExhbmd1YWdlRW50cnkgfCBzdHJpbmcgfCBzdHJpbmdbXTtcclxuXHJcbiAgICAvLyBSQUdcclxuXHJcbiAgICAvKiogV2VsY29tZSBtZXNzYWdlLCBzaG93biBvbiBtYXJxdWVlIG9uIGZpcnN0IGxvYWQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFdFTENPTUUgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcXVpcmVkIERPTSBlbGVtZW50IGlzIG1pc3NpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERPTV9NSVNTSU5HICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcXVpcmVkIGVsZW1lbnQgYXR0cmlidXRlIGlzIG1pc3NpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEFUVFJfTUlTU0lORyAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcXVpcmVkIGRhdGFzZXQgZW50cnkgaXMgbWlzc2luZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREFUQV9NSVNTSU5HICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQmFkIGRpcmVjdGlvbiBhcmd1bWVudCBnaXZlbiB0byBkaXJlY3Rpb25hbCBmdW5jdGlvbiAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQkFEX0RJUkVDVElPTiA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQmFkIGJvb2xlYW4gc3RyaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBCQURfQk9PTEVBTiAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBTdGF0ZVxyXG5cclxuICAgIC8qKiBTdGF0ZSBzdWNjZXNzZnVsbHkgbG9hZGVkIGZyb20gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfRlJPTV9TVE9SQUdFICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTdGF0ZSBzdWNjZXNzZnVsbHkgc2F2ZWQgdG8gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfVE9fU1RPUkFHRSAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBJbnN0cnVjdGlvbnMgZm9yIGNvcHkvcGFzdGluZyBzYXZlZCBzdGF0ZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfQ09QWV9QQVNURSAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBIZWFkZXIgZm9yIGR1bXBlZCByYXcgc3RhdGUgSlNPTiAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfUkFXX0pTT04gICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBDb3VsZCBub3Qgc2F2ZSBzdGF0ZSB0byBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9TQVZFX0ZBSUwgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIE5vIHN0YXRlIHdhcyBhdmFpbGFibGUgdG8gbG9hZCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfU0FWRV9NSVNTSU5HICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBOb24tZXhpc3RlbnQgcGhyYXNlc2V0IHJlZmVyZW5jZSB3aGVuIGdldHRpbmcgZnJvbSBzdGF0ZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfTk9ORVhJU1RBTlRfUEhSQVNFU0VUIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBDb25maWdcclxuXHJcbiAgICAvKiogQ29uZmlnIGZhaWxlZCB0byBsb2FkIGZyb20gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQ09ORklHX0xPQURfRkFJTCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIENvbmZpZyBmYWlsZWQgdG8gc2F2ZSB0byBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBDT05GSUdfU0FWRV9GQUlMICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQ29uZmlnIGZhaWxlZCB0byBjbGVhciBmcm9tIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IENPTkZJR19SRVNFVF9GQUlMIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBEYXRhYmFzZVxyXG5cclxuICAgIC8qKiBHaXZlbiBlbGVtZW50IGlzbid0IGEgcGhyYXNlc2V0IGlGcmFtZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRSA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogVW5rbm93biBzdGF0aW9uIGNvZGUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERCX1VOS05PV05fU1RBVElPTiAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFN0YXRpb24gY29kZSB3aXRoIGJsYW5rIG5hbWUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERCX0VNUFRZX1NUQVRJT04gICAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFBpY2tpbmcgdG9vIG1hbnkgc3RhdGlvbiBjb2RlcyBpbiBvbmUgZ28gKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERCX1RPT19NQU5ZX1NUQVRJT05TICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFRvb2xiYXJcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSB0ZXh0IGZvciB0b29sYmFyIGJ1dHRvbnNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfUExBWSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TVE9QICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NIVUZGTEUgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU0FWRSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9MT0FEICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NFVFRJTkdTIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBFZGl0b3JcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSB0ZXh0IGZvciBlZGl0b3IgZWxlbWVudHNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX0NPQUNIICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX0VYQ1VTRSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX0lOVEVHRVIgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX05BTUVEICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX09QVF9PUEVOICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX09QVF9DTE9TRSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1BIUkFTRVNFVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1BMQVRGT1JNICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1NFUlZJQ0UgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1NUQVRJT04gICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1NUQVRJT05MSVNUIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1RJTUUgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvKiogSW5pdGlhbCBtZXNzYWdlIHdoZW4gc2V0dGluZyB1cCBlZGl0b3IgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEVESVRPUl9JTklUICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVwbGFjZW1lbnQgdGV4dCBmb3IgdW5rbm93biBlZGl0b3IgZWxlbWVudHMgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEVESVRPUl9VTktOT1dOX0VMRU1FTlQgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVwbGFjZW1lbnQgdGV4dCBmb3IgZWRpdG9yIHBocmFzZXMgd2l0aCB1bmtub3duIHJlZmVyZW5jZSBpZHMgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEVESVRPUl9VTktOT1dOX1BIUkFTRSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVwbGFjZW1lbnQgdGV4dCBmb3IgZWRpdG9yIHBocmFzZXNldHMgd2l0aCB1bmtub3duIHJlZmVyZW5jZSBpZHMgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEVESVRPUl9VTktOT1dOX1BIUkFTRVNFVCA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gUGhyYXNlclxyXG5cclxuICAgIC8qKiBUb28gbWFueSBsZXZlbHMgb2YgcmVjdXJzaW9uIGluIHRoZSBwaHJhc2VyICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQSFJBU0VSX1RPT19SRUNVUlNJVkUgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFBpY2tlcnNcclxuXHJcbiAgICAvLyBIZWFkZXJzIGZvciBwaWNrZXIgZGlhbG9nc1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX0NPQUNIICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9FWENVU0UgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfSU5URUdFUiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX05BTUVEICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9QSFJBU0VTRVQgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfUExBVEZPUk0gICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1NFUlZJQ0UgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9TVEFUSU9OICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfU1RBVElPTkxJU1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1RJTUUgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSBhbmQgcGxhY2Vob2xkZXIgdGV4dCBmb3IgcGlja2VyIGNvbnRyb2xzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0dFTkVSSUNfVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfR0VORVJJQ19QSCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9DT0FDSF9UICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0VYQ1VTRV9UICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfRVhDVVNFX1BIICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9FWENVU0VfSVRFTV9UICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0lOVF9UICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfTkFNRURfVCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9OQU1FRF9QSCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX05BTUVEX0lURU1fVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX1BIICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfSVRFTV9UICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUExBVF9OVU1CRVJfVCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QTEFUX0xFVFRFUl9UICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZfVCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVl9QSCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWX0lURU1fVCAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NUQVRJT05fVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU1RBVElPTl9QSCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TVEFUSU9OX0lURU1fVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0FERCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQUREX1QgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9DTE9TRSAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0NMT1NFX1QgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfRU1QVFkgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9EUkFHX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RFTEVURSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfREVMRVRFX1QgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9JVEVNX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1RJTUVfVCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvKiogQ29hY2ggcGlja2VyJ3Mgb25DaGFuZ2UgZmlyZWQgd2l0aG91dCBjb250ZXh0ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0NPQUNIX01JU1NJTkdfU1RBVEUgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogSW50ZWdlciBwaWNrZXIncyBvbkNoYW5nZSBmaXJlZCB3aXRob3V0IGNvbnRleHQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfSU5UX01JU1NJTkdfU1RBVEUgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBQaHJhc2VzZXQgcGlja2VyJ3Mgb25TZWxlY3QgZmlyZWQgd2l0aG91dCByZWZlcmVuY2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9NSVNTSU5HX1NUQVRFICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTZXJ2aWNlIHBpY2tlcidzIG9uU2VsZWN0IGZpcmVkIHdpdGhvdXQgcmVmZXJlbmNlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZJQ0VfTUlTU0lOR19TVEFURSA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU2VydmljZSBwaWNrZXIncyBvbkNoYW5nZSBmaXJlZCB3aXRob3V0IHJlZmVyZW5jZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9USU1FX01JU1NJTkdfU1RBVEUgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFBocmFzZXNldCBwaWNrZXIgb3BlbmVkIGZvciB1bmtub3duIHBocmFzZXNldCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX1VOS05PV04gICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIERyYWcgbWlycm9yIGNyZWF0ZSBldmVudCBpbiBzdGF0aW9uIGxpc3QgbWlzc2luZyBzdGF0ZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9EUkFHX01JU1NJTkcgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFNldHRpbmdzXHJcblxyXG4gICAgLy8gVG9vbHRpcHMvdGl0bGUgYW5kIGxhYmVsIHRleHQgZm9yIHNldHRpbmdzIGVsZW1lbnRzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVCAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfVCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX0NPTkZJUk0gICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9DT05GSVJNX1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfRE9ORSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NBVkUgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TQVZFX1QgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfVk9YICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1ZPWF9DSE9JQ0UgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9WT1hfRU1QVFkgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfVk9YX1ZPTCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1ZPWF9QSVRDSCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9WT1hfUkFURSAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfVk9YX1RFU1QgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1ZPWF9URVNUX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9MRUdBTCAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFVJIGNvbnRyb2xzXHJcblxyXG4gICAgLyoqIEhlYWRlciBmb3IgdGhlIFwidG9vIHNtYWxsXCIgd2FybmluZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgV0FSTl9TSE9SVF9IRUFERVIgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEJvZHkgdGV4dCBmb3IgdGhlIFwidG9vIHNtYWxsXCIgd2FybmluZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgV0FSTl9TSE9SVCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIE1pc2MuIGNvbnN0YW50c1xyXG5cclxuICAgIC8qKiBBcnJheSBvZiB0aGUgZW50aXJlIGFscGhhYmV0IG9mIHRoZSBsYW5ndWFnZSwgZm9yIGNvYWNoIGxldHRlcnMgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IExFVFRFUlMgOiBzdHJpbmc7XHJcbiAgICAvKiogQXJyYXkgb2YgbnVtYmVycyBhcyB3b3JkcyAoZS5nLiB6ZXJvLCBvbmUsIHR3byksIG1hdGNoaW5nIHRoZWlyIGluZGV4ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBESUdJVFMgIDogc3RyaW5nW107XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJCYXNlTGFuZ3VhZ2UudHNcIi8+XHJcblxyXG5jbGFzcyBFbmdsaXNoTGFuZ3VhZ2UgZXh0ZW5kcyBCYXNlTGFuZ3VhZ2Vcclxue1xyXG4gICAgV0VMQ09NRSAgICAgICA9ICgpID0+ICdXZWxjb21lIHRvIFJhaWwgQW5ub3VuY2VtZW50IEdlbmVyYXRvci4nO1xyXG4gICAgRE9NX01JU1NJTkcgICA9IChxOiBzdHJpbmcpID0+IGBSZXF1aXJlZCBET00gZWxlbWVudCBpcyBtaXNzaW5nOiAnJHtxfSdgO1xyXG4gICAgQVRUUl9NSVNTSU5HICA9IChhOiBzdHJpbmcpID0+IGBSZXF1aXJlZCBhdHRyaWJ1dGUgaXMgbWlzc2luZzogJyR7YX0nYDtcclxuICAgIERBVEFfTUlTU0lORyAgPSAoazogc3RyaW5nKSA9PiBgUmVxdWlyZWQgZGF0YXNldCBrZXkgaXMgbWlzc2luZyBvciBlbXB0eTogJyR7a30nYDtcclxuICAgIEJBRF9ESVJFQ1RJT04gPSAodjogc3RyaW5nKSA9PiBgRGlyZWN0aW9uIG5lZWRzIHRvIGJlIC0xIG9yIDEsIG5vdCAnJHt2fSdgO1xyXG4gICAgQkFEX0JPT0xFQU4gICA9ICh2OiBzdHJpbmcpID0+IGBHaXZlbiBzdHJpbmcgZG9lcyBub3QgcmVwcmVzZW50IGEgYm9vbGVhbjogJyR7dn0nYDtcclxuXHJcbiAgICBTVEFURV9GUk9NX1NUT1JBR0UgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTdGF0ZSBoYXMgYmVlbiBsb2FkZWQgZnJvbSBzdG9yYWdlLic7XHJcbiAgICBTVEFURV9UT19TVE9SQUdFICAgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTdGF0ZSBoYXMgYmVlbiBzYXZlZCB0byBzdG9yYWdlLCBhbmQgZHVtcGVkIHRvIGNvbnNvbGUuJztcclxuICAgIFNUQVRFX0NPUFlfUEFTVEUgICAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJyVjQ29weSBhbmQgcGFzdGUgdGhpcyBpbiBjb25zb2xlIHRvIGxvYWQgbGF0ZXI6JztcclxuICAgIFNUQVRFX1JBV19KU09OICAgICAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJyVjUmF3IEpTT04gc3RhdGU6JztcclxuICAgIFNUQVRFX1NBVkVfRkFJTCAgICAgICAgICAgICA9IChtc2c6IHN0cmluZykgPT5cclxuICAgICAgICBgU29ycnksIHN0YXRlIGNvdWxkIG5vdCBiZSBzYXZlZCB0byBzdG9yYWdlOiAke21zZ30uYDtcclxuICAgIFNUQVRFX1NBVkVfTUlTU0lORyAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1NvcnJ5LCBubyBzdGF0ZSB3YXMgZm91bmQgaW4gc3RvcmFnZS4nO1xyXG4gICAgU1RBVEVfTk9ORVhJU1RBTlRfUEhSQVNFU0VUID0gKHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQXR0ZW1wdGVkIHRvIGdldCBjaG9zZW4gaW5kZXggZm9yIHBocmFzZXNldCAoJHtyfSkgdGhhdCBkb2Vzbid0IGV4aXN0YDtcclxuXHJcbiAgICBDT05GSUdfTE9BRF9GQUlMICA9IChtc2c6IHN0cmluZykgPT4gYENvdWxkIG5vdCBsb2FkIHNldHRpbmdzOiAke21zZ31gO1xyXG4gICAgQ09ORklHX1NBVkVfRkFJTCAgPSAobXNnOiBzdHJpbmcpID0+IGBDb3VsZCBub3Qgc2F2ZSBzZXR0aW5nczogJHttc2d9YDtcclxuICAgIENPTkZJR19SRVNFVF9GQUlMID0gKG1zZzogc3RyaW5nKSA9PiBgQ291bGQgbm90IGNsZWFyIHNldHRpbmdzOiAke21zZ31gO1xyXG5cclxuICAgIERCX0VMRU1FTlRfTk9UX1BIUkFTRVNFVF9JRlJBTUUgPSAoZTogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDb25maWd1cmVkIHBocmFzZXNldCBlbGVtZW50IHF1ZXJ5ICgke2V9KSBkb2VzIG5vdCBwb2ludCB0byBhbiBpRnJhbWUgZW1iZWRgO1xyXG4gICAgREJfVU5LTk9XTl9TVEFUSU9OICAgPSAoYzogc3RyaW5nKSA9PiBgVU5LTk9XTiBTVEFUSU9OOiAke2N9YDtcclxuICAgIERCX0VNUFRZX1NUQVRJT04gICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgU3RhdGlvbiBkYXRhYmFzZSBhcHBlYXJzIHRvIGNvbnRhaW4gYW4gZW1wdHkgbmFtZSBmb3IgY29kZSAnJHtjfSdgO1xyXG4gICAgREJfVE9PX01BTllfU1RBVElPTlMgPSAoKSA9PiAnUGlja2luZyB0b28gbWFueSBzdGF0aW9ucyB0aGFuIHRoZXJlIGFyZSBhdmFpbGFibGUnO1xyXG5cclxuICAgIFRPT0xCQVJfUExBWSAgICAgPSAoKSA9PiAnUGxheSBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TVE9QICAgICA9ICgpID0+ICdTdG9wIHBsYXlpbmcgcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU0hVRkZMRSAgPSAoKSA9PiAnR2VuZXJhdGUgcmFuZG9tIHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NBVkUgICAgID0gKCkgPT4gJ1NhdmUgc3RhdGUgdG8gc3RvcmFnZSc7XHJcbiAgICBUT09MQkFSX0xPQUQgICAgID0gKCkgPT4gJ1JlY2FsbCBzdGF0ZSBmcm9tIHN0b3JhZ2UnO1xyXG4gICAgVE9PTEJBUl9TRVRUSU5HUyA9ICgpID0+ICdPcGVuIHNldHRpbmdzJztcclxuXHJcbiAgICBUSVRMRV9DT0FDSCAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIGNvYWNoICgnJHtjfScpYDtcclxuICAgIFRJVExFX0VYQ1VTRSAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICAnQ2xpY2sgdG8gY2hhbmdlIHRoaXMgZXhjdXNlJztcclxuICAgIFRJVExFX0lOVEVHRVIgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgbnVtYmVyICgnJHtjfScpYDtcclxuICAgIFRJVExFX05BTUVEICAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICBcIkNsaWNrIHRvIGNoYW5nZSB0aGlzIHRyYWluJ3MgbmFtZVwiO1xyXG4gICAgVElUTEVfT1BUX09QRU4gICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdDbGljayB0byBvcGVuIHRoaXMgb3B0aW9uYWwgcGFydCc7XHJcbiAgICBUSVRMRV9PUFRfQ0xPU0UgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgJ0NsaWNrIHRvIGNsb3NlIHRoaXMgb3B0aW9uYWwgcGFydCc7XHJcbiAgICBUSVRMRV9QSFJBU0VTRVQgICA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGUgcGhyYXNlIHVzZWQgaW4gdGhpcyBzZWN0aW9uICgnJHtyfScpYDtcclxuICAgIFRJVExFX1BMQVRGT1JNICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICBcIkNsaWNrIHRvIGNoYW5nZSB0aGlzIHRyYWluJ3MgcGxhdGZvcm1cIjtcclxuICAgIFRJVExFX1NFUlZJQ0UgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc2VydmljZSAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9TVEFUSU9OICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHN0YXRpb24gKCcke2N9JylgO1xyXG4gICAgVElUTEVfU1RBVElPTkxJU1QgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBzdGF0aW9uIGxpc3QgKCcke2N9JylgO1xyXG4gICAgVElUTEVfVElNRSAgICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyB0aW1lICgnJHtjfScpYDtcclxuXHJcbiAgICBFRElUT1JfSU5JVCAgICAgICAgICAgICAgPSAoKSA9PiAnUGxlYXNlIHdhaXQuLi4nO1xyXG4gICAgRURJVE9SX1VOS05PV05fRUxFTUVOVCAgID0gKG46IHN0cmluZykgPT4gYChVTktOT1dOIFhNTCBFTEVNRU5UOiAke259KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0UgICAgPSAocjogc3RyaW5nKSA9PiBgKFVOS05PV04gUEhSQVNFOiAke3J9KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQgPSAocjogc3RyaW5nKSA9PiBgKFVOS05PV04gUEhSQVNFU0VUOiAke3J9KWA7XHJcblxyXG4gICAgUEhSQVNFUl9UT09fUkVDVVJTSVZFID0gKCkgPT5cclxuICAgICAgICAnVG9vIG1hbnkgbGV2ZWxzIG9mIHJlY3Vyc2lvbiB3aGlsc3QgcHJvY2Vzc2luZyBwaHJhc2UnO1xyXG5cclxuICAgIEhFQURFUl9DT0FDSCAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBjb2FjaCBsZXR0ZXIgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfRVhDVVNFICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGFuIGV4Y3VzZSc7XHJcbiAgICBIRUFERVJfSU5URUdFUiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgbnVtYmVyIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX05BTUVEICAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICAnUGljayBhIG5hbWVkIHRyYWluJztcclxuICAgIEhFQURFUl9QSFJBU0VTRVQgICA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBwaHJhc2UgZm9yIHRoZSAnJHtyfScgc2VjdGlvbmA7XHJcbiAgICBIRUFERVJfUExBVEZPUk0gICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGEgcGxhdGZvcm0nO1xyXG4gICAgSEVBREVSX1NFUlZJQ0UgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHNlcnZpY2UgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfU1RBVElPTiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgc3RhdGlvbiBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9TVEFUSU9OTElTVCA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYEJ1aWxkIGEgc3RhdGlvbiBsaXN0IGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1RJTUUgICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHRpbWUgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcblxyXG4gICAgUF9HRU5FUklDX1QgICAgICA9ICgpID0+ICdMaXN0IG9mIGNob2ljZXMnO1xyXG4gICAgUF9HRU5FUklDX1BIICAgICA9ICgpID0+ICdGaWx0ZXIgY2hvaWNlcy4uLic7XHJcbiAgICBQX0NPQUNIX1QgICAgICAgID0gKCkgPT4gJ0NvYWNoIGxldHRlcic7XHJcbiAgICBQX0VYQ1VTRV9UICAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgZGVsYXkgb3IgY2FuY2VsbGF0aW9uIGV4Y3VzZXMnO1xyXG4gICAgUF9FWENVU0VfUEggICAgICA9ICgpID0+ICdGaWx0ZXIgZXhjdXNlcy4uLic7XHJcbiAgICBQX0VYQ1VTRV9JVEVNX1QgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIGV4Y3VzZSc7XHJcbiAgICBQX0lOVF9UICAgICAgICAgID0gKCkgPT4gJ0ludGVnZXIgdmFsdWUnO1xyXG4gICAgUF9OQU1FRF9UICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHRyYWluIG5hbWVzJztcclxuICAgIFBfTkFNRURfUEggICAgICAgPSAoKSA9PiAnRmlsdGVyIHRyYWluIG5hbWUuLi4nO1xyXG4gICAgUF9OQU1FRF9JVEVNX1QgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBuYW1lJztcclxuICAgIFBfUFNFVF9UICAgICAgICAgPSAoKSA9PiAnTGlzdCBvZiBwaHJhc2VzJztcclxuICAgIFBfUFNFVF9QSCAgICAgICAgPSAoKSA9PiAnRmlsdGVyIHBocmFzZXMuLi4nO1xyXG4gICAgUF9QU0VUX0lURU1fVCAgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBwaHJhc2UnO1xyXG4gICAgUF9QTEFUX05VTUJFUl9UICA9ICgpID0+ICdQbGF0Zm9ybSBudW1iZXInO1xyXG4gICAgUF9QTEFUX0xFVFRFUl9UICA9ICgpID0+ICdPcHRpb25hbCBwbGF0Zm9ybSBsZXR0ZXInO1xyXG4gICAgUF9TRVJWX1QgICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHNlcnZpY2UgbmFtZXMnO1xyXG4gICAgUF9TRVJWX1BIICAgICAgICA9ICgpID0+ICdGaWx0ZXIgc2VydmljZXMuLi4nO1xyXG4gICAgUF9TRVJWX0lURU1fVCAgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBzZXJ2aWNlJztcclxuICAgIFBfU1RBVElPTl9UICAgICAgPSAoKSA9PiAnTGlzdCBvZiBzdGF0aW9uIG5hbWVzJztcclxuICAgIFBfU1RBVElPTl9QSCAgICAgPSAoKSA9PiAnRmlsdGVyIHN0YXRpb25zLi4uJztcclxuICAgIFBfU1RBVElPTl9JVEVNX1QgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IG9yIGFkZCB0aGlzIHN0YXRpb24nO1xyXG4gICAgUF9TTF9BREQgICAgICAgICA9ICgpID0+ICdBZGQgc3RhdGlvbi4uLic7XHJcbiAgICBQX1NMX0FERF9UICAgICAgID0gKCkgPT4gJ0FkZCBzdGF0aW9uIHRvIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0NMT1NFICAgICAgID0gKCkgPT4gJ0Nsb3NlJztcclxuICAgIFBfU0xfQ0xPU0VfVCAgICAgPSAoKSA9PiAnQ2xvc2UgdGhpcyBwaWNrZXInO1xyXG4gICAgUF9TTF9FTVBUWSAgICAgICA9ICgpID0+ICdQbGVhc2UgYWRkIGF0IGxlYXN0IG9uZSBzdGF0aW9uIHRvIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0RSQUdfVCAgICAgID0gKCkgPT4gJ0RyYWdnYWJsZSBzZWxlY3Rpb24gb2Ygc3RhdGlvbnMgZm9yIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0RFTEVURSAgICAgID0gKCkgPT4gJ0Ryb3AgaGVyZSB0byBkZWxldGUnO1xyXG4gICAgUF9TTF9ERUxFVEVfVCAgICA9ICgpID0+ICdEcm9wIHN0YXRpb24gaGVyZSB0byBkZWxldGUgaXQgZnJvbSB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9JVEVNX1QgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ0RyYWcgdG8gcmVvcmRlcjsgZG91YmxlLWNsaWNrIG9yIGRyYWcgaW50byBkZWxldGUgem9uZSB0byByZW1vdmUnO1xyXG4gICAgUF9USU1FX1QgICAgICAgICA9ICgpID0+ICdUaW1lIGVkaXRvcic7XHJcblxyXG4gICAgUF9DT0FDSF9NSVNTSU5HX1NUQVRFICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIGNvYWNoIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfSU5UX01JU1NJTkdfU1RBVEUgICAgID0gKCkgPT4gJ29uQ2hhbmdlIGZpcmVkIGZvciBpbnRlZ2VyIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfUFNFVF9NSVNTSU5HX1NUQVRFICAgID0gKCkgPT4gJ29uU2VsZWN0IGZpcmVkIGZvciBwaHJhc2VzZXQgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9TRVJWSUNFX01JU1NJTkdfU1RBVEUgPSAoKSA9PiAnb25TZWxlY3QgZmlyZWQgZm9yIHNlcnZpY2UgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9USU1FX01JU1NJTkdfU1RBVEUgICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIHRpbWUgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9QU0VUX1VOS05PV04gICAgICAgICAgPSAocjogc3RyaW5nKSA9PiBgUGhyYXNlc2V0ICcke3J9JyBkb2Vzbid0IGV4aXN0YDtcclxuICAgIFBfU0xfRFJBR19NSVNTSU5HICAgICAgID0gKCkgPT4gJ0RyYWdnYWJsZTogTWlzc2luZyBzb3VyY2UgZWxlbWVudHMgZm9yIG1pcnJvciBldmVudCc7XHJcblxyXG4gICAgU1RfUkVTRVQgICAgICAgICAgID0gKCkgPT4gJ1Jlc2V0IHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX1QgICAgICAgICA9ICgpID0+ICdSZXNldCBzZXR0aW5ncyB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9DT05GSVJNICAgPSAoKSA9PiAnQXJlIHlvdSBzdXJlPyc7XHJcbiAgICBTVF9SRVNFVF9DT05GSVJNX1QgPSAoKSA9PiAnQ29uZmlybSByZXNldCB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9ET05FICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTZXR0aW5ncyBoYXZlIGJlZW4gcmVzZXQgdG8gdGhlaXIgZGVmYXVsdHMsIGFuZCBkZWxldGVkIGZyb20gc3RvcmFnZS4nO1xyXG4gICAgU1RfU0FWRSAgICAgICAgICAgID0gKCkgPT4gJ1NhdmUgJiBjbG9zZSc7XHJcbiAgICBTVF9TQVZFX1QgICAgICAgICAgPSAoKSA9PiAnU2F2ZSBhbmQgY2xvc2Ugc2V0dGluZ3MnO1xyXG4gICAgU1RfVk9YICAgICAgICAgICAgID0gKCkgPT4gJ1NwZWVjaCc7XHJcbiAgICBTVF9WT1hfQ0hPSUNFICAgICAgPSAoKSA9PiAnVm9pY2UnO1xyXG4gICAgU1RfVk9YX0VNUFRZICAgICAgID0gKCkgPT4gJ05vbmUgYXZhaWxhYmxlJztcclxuICAgIFNUX1ZPWF9WT0wgICAgICAgICA9ICgpID0+ICdWb2x1bWUnO1xyXG4gICAgU1RfVk9YX1BJVENIICAgICAgID0gKCkgPT4gJ1BpdGNoJztcclxuICAgIFNUX1ZPWF9SQVRFICAgICAgICA9ICgpID0+ICdSYXRlJztcclxuICAgIFNUX1ZPWF9URVNUICAgICAgICA9ICgpID0+ICdUZXN0IHNwZWVjaCc7XHJcbiAgICBTVF9WT1hfVEVTVF9UICAgICAgPSAoKSA9PiAnUGxheSBhIHNwZWVjaCBzYW1wbGUgd2l0aCB0aGUgY3VycmVudCBzZXR0aW5ncyc7XHJcbiAgICBTVF9MRUdBTCAgICAgICAgICAgPSAoKSA9PiAnTGVnYWwgJiBBY2tub3dsZWRnZW1lbnRzJztcclxuXHJcbiAgICBXQVJOX1NIT1JUX0hFQURFUiA9ICgpID0+ICdcIk1heSBJIGhhdmUgeW91ciBhdHRlbnRpb24gcGxlYXNlLi4uXCInO1xyXG4gICAgV0FSTl9TSE9SVCAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdUaGlzIGRpc3BsYXkgaXMgdG9vIHNob3J0IHRvIHN1cHBvcnQgUkFHLiBQbGVhc2UgbWFrZSB0aGlzIHdpbmRvdyB0YWxsZXIsIG9yJyArXHJcbiAgICAgICAgJyByb3RhdGUgeW91ciBkZXZpY2UgZnJvbSBsYW5kc2NhcGUgdG8gcG9ydHJhaXQuJztcclxuXHJcbiAgICAvLyBUT0RPOiBUaGVzZSBkb24ndCBmaXQgaGVyZTsgdGhpcyBzaG91bGQgZ28gaW4gdGhlIGRhdGFcclxuICAgIExFVFRFUlMgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVonO1xyXG4gICAgRElHSVRTICA9IFtcclxuICAgICAgICAnemVybycsICAgICAnb25lJywgICAgICd0d28nLCAgICAgJ3RocmVlJywgICAgICdmb3VyJywgICAgICdmaXZlJywgICAgJ3NpeCcsXHJcbiAgICAgICAgJ3NldmVuJywgICAgJ2VpZ2h0JywgICAnbmluZScsICAgICd0ZW4nLCAgICAgICAnZWxldmVuJywgICAndHdlbHZlJywgICd0aGlydGVlbicsXHJcbiAgICAgICAgJ2ZvdXJ0ZWVuJywgJ2ZpZnRlZW4nLCAnc2l4dGVlbicsICdzZXZlbnRlZW4nLCAnZWlnaHRlZW4nLCAnbmludGVlbicsICd0d2VudHknXHJcbiAgICBdO1xyXG5cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqXHJcbiAqIEhvbGRzIG1ldGhvZHMgZm9yIHByb2Nlc3NpbmcgZWFjaCB0eXBlIG9mIHBocmFzZSBlbGVtZW50IGludG8gSFRNTCwgd2l0aCBkYXRhIHRha2VuXHJcbiAqIGZyb20gdGhlIGN1cnJlbnQgc3RhdGUuIEVhY2ggbWV0aG9kIHRha2VzIGEgY29udGV4dCBvYmplY3QsIGhvbGRpbmcgZGF0YSBmb3IgdGhlXHJcbiAqIGN1cnJlbnQgWE1MIGVsZW1lbnQgYmVpbmcgcHJvY2Vzc2VkIGFuZCB0aGUgWE1MIGRvY3VtZW50IGJlaW5nIHVzZWQuXHJcbiAqL1xyXG5jbGFzcyBFbGVtZW50UHJvY2Vzc29yc1xyXG57XHJcbiAgICAvKiogRmlsbHMgaW4gY29hY2ggbGV0dGVycyBmcm9tIEEgdG8gWiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb2FjaChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9DT0FDSChjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRDb2FjaChjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGV4Y3VzZSwgZm9yIGEgZGVsYXkgb3IgY2FuY2VsbGF0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGV4Y3VzZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0VYQ1VTRSgpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmV4Y3VzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gaW50ZWdlcnMsIG9wdGlvbmFsbHkgd2l0aCBub3VucyBhbmQgaW4gd29yZCBmb3JtICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGludGVnZXIoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgc2luZ3VsYXIgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3Npbmd1bGFyJyk7XHJcbiAgICAgICAgbGV0IHBsdXJhbCAgID0gY3R4LnhtbEVsZW1lbnQuZ2V0QXR0cmlidXRlKCdwbHVyYWwnKTtcclxuICAgICAgICBsZXQgd29yZHMgICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3dvcmRzJyk7XHJcblxyXG4gICAgICAgIGxldCBpbnQgICAgPSBSQUcuc3RhdGUuZ2V0SW50ZWdlcihjb250ZXh0KTtcclxuICAgICAgICBsZXQgaW50U3RyID0gKHdvcmRzICYmIHdvcmRzLnRvTG93ZXJDYXNlKCkgPT09ICd0cnVlJylcclxuICAgICAgICAgICAgPyBMLkRJR0lUU1tpbnRdIHx8IGludC50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogaW50LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKGludCA9PT0gMSAmJiBzaW5ndWxhcilcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHtzaW5ndWxhcn1gO1xyXG4gICAgICAgIGVsc2UgaWYgKGludCAhPT0gMSAmJiBwbHVyYWwpXHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7cGx1cmFsfWA7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9JTlRFR0VSKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gaW50U3RyO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG5cclxuICAgICAgICBpZiAoc2luZ3VsYXIpIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3Npbmd1bGFyJ10gPSBzaW5ndWxhcjtcclxuICAgICAgICBpZiAocGx1cmFsKSAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3BsdXJhbCddICAgPSBwbHVyYWw7XHJcbiAgICAgICAgaWYgKHdvcmRzKSAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wyd3b3JkcyddICAgID0gd29yZHM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBuYW1lZChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX05BTUVEKCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUubmFtZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEluY2x1ZGVzIGEgcHJldmlvdXNseSBkZWZpbmVkIHBocmFzZSwgYnkgaXRzIGBpZGAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGhyYXNlKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVmICAgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IHBocmFzZSA9IFJBRy5kYXRhYmFzZS5nZXRQaHJhc2UocmVmKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgICAgPSAnJztcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydyZWYnXSA9IHJlZjtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2UpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fUEhSQVNFKHJlZik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaHJhc2VzIHdpdGggYSBjaGFuY2UgdmFsdWUgYXMgY29sbGFwc2libGVcclxuICAgICAgICBpZiAoIGN0eC54bWxFbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY2hhbmNlJykgKVxyXG4gICAgICAgICAgICB0aGlzLm1ha2VDb2xsYXBzaWJsZShjdHgsIHBocmFzZSwgcmVmKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIERPTS5jbG9uZUludG8ocGhyYXNlLCBjdHgubmV3RWxlbWVudCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEluY2x1ZGVzIGEgcGhyYXNlIGZyb20gYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlc2V0LCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VzZXQoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydyZWYnXSA9IHJlZjtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fUEhSQVNFU0VUKHJlZik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBpZHggICAgPSBSQUcuc3RhdGUuZ2V0UGhyYXNlc2V0SWR4KHJlZik7XHJcbiAgICAgICAgbGV0IHBocmFzZSA9IHBocmFzZXNldC5jaGlsZHJlbltpZHhdIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydpZHgnXSA9IGlkeC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSA9IEwuVElUTEVfUEhSQVNFU0VUKHJlZik7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaHJhc2VzZXRzIHdpdGggYSBjaGFuY2UgdmFsdWUgYXMgY29sbGFwc2libGVcclxuICAgICAgICBpZiAoIGN0eC54bWxFbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY2hhbmNlJykgKVxyXG4gICAgICAgICAgICB0aGlzLm1ha2VDb2xsYXBzaWJsZShjdHgsIHBocmFzZSwgcmVmKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIERPTS5jbG9uZUludG8ocGhyYXNlLCBjdHgubmV3RWxlbWVudCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBjdXJyZW50IHBsYXRmb3JtICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBsYXRmb3JtKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfUExBVEZPUk0oKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5wbGF0Zm9ybS5qb2luKCcnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIHJhaWwgbmV0d29yayBuYW1lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNlcnZpY2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU0VSVklDRShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBzdGF0aW9uIG5hbWVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRpb24oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBjb2RlICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb24oY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TVEFUSU9OKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSwgdHJ1ZSk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHN0YXRpb24gbGlzdHMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RhdGlvbmxpc3QoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ICAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgc3RhdGlvbnMgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbkxpc3QoY29udGV4dCkuc2xpY2UoKTtcclxuICAgICAgICBsZXQgc3RhdGlvbkxpc3QgPSBTdHJpbmdzLmZyb21TdGF0aW9uTGlzdChzdGF0aW9ucywgY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TVEFUSU9OTElTVChjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IHN0YXRpb25MaXN0O1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgdGltZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0aW1lKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1RJTUUoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZ2V0VGltZShjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB1bmtub3duIGVsZW1lbnRzIHdpdGggYW4gaW5saW5lIGVycm9yIG1lc3NhZ2UgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdW5rbm93bihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5hbWUgPSBjdHgueG1sRWxlbWVudC5ub2RlTmFtZTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX0VMRU1FTlQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50IGludG8gYSBuZXcgaW5uZXIgc3BhbiB0YWcsIHNvIHRoYXQgdGhleVxyXG4gICAgICogY2FuIGJlIG1hZGUgY29sbGFwc2libGUuIEFwcGVuZHMgaXQgdG8gdGhlIG5ldyBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbWFrZUNvbGxhcHNpYmxlKGN0eDogUGhyYXNlQ29udGV4dCwgc291cmNlOiBIVE1MRWxlbWVudCwgcmVmOiBzdHJpbmcpXHJcbiAgICAgICAgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNoYW5jZSAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnY2hhbmNlJykhO1xyXG4gICAgICAgIGxldCBpbm5lciAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgbGV0IHRvZ2dsZSAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICBsZXQgY29sbGFwc2VkID0gUkFHLnN0YXRlLmdldENvbGxhcHNlZCggcmVmLCBwYXJzZUludChjaGFuY2UpICk7XHJcblxyXG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5hZGQoJ2lubmVyJyk7XHJcbiAgICAgICAgdG9nZ2xlLmNsYXNzTGlzdC5hZGQoJ3RvZ2dsZScpO1xyXG5cclxuICAgICAgICBET00uY2xvbmVJbnRvKHNvdXJjZSwgaW5uZXIpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddID0gY2hhbmNlO1xyXG5cclxuICAgICAgICBDb2xsYXBzaWJsZXMuc2V0KGN0eC5uZXdFbGVtZW50LCB0b2dnbGUsIGNvbGxhcHNlZCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQodG9nZ2xlKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5hcHBlbmRDaGlsZChpbm5lcik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBSZXByZXNlbnRzIGNvbnRleHQgZGF0YSBmb3IgYSBwaHJhc2UsIHRvIGJlIHBhc3NlZCB0byBhbiBlbGVtZW50IHByb2Nlc3NvciAqL1xyXG5pbnRlcmZhY2UgUGhyYXNlQ29udGV4dFxyXG57XHJcbiAgICAvKiogR2V0cyB0aGUgWE1MIHBocmFzZSBlbGVtZW50IHRoYXQgaXMgYmVpbmcgcmVwbGFjZWQgKi9cclxuICAgIHhtbEVsZW1lbnQgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBHZXRzIHRoZSBIVE1MIHNwYW4gZWxlbWVudCB0aGF0IGlzIHJlcGxhY2luZyB0aGUgWE1MIGVsZW1lbnQgKi9cclxuICAgIG5ld0VsZW1lbnQgOiBIVE1MU3BhbkVsZW1lbnQ7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKlxyXG4gKiBIYW5kbGVzIHRoZSB0cmFuc2Zvcm1hdGlvbiBvZiBwaHJhc2UgWE1MIGRhdGEsIGludG8gSFRNTCBlbGVtZW50cyB3aXRoIHRoZWlyIGRhdGFcclxuICogZmlsbGVkIGluIGFuZCB0aGVpciBVSSBsb2dpYyB3aXJlZC5cclxuICovXHJcbmNsYXNzIFBocmFzZXJcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBSZWN1cnNpdmVseSBwcm9jZXNzZXMgWE1MIGVsZW1lbnRzLCBmaWxsaW5nIGluIGRhdGEgYW5kIGFwcGx5aW5nIHRyYW5zZm9ybXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciBQYXJlbnQgdG8gcHJvY2VzcyB0aGUgY2hpbGRyZW4gb2ZcclxuICAgICAqIEBwYXJhbSBsZXZlbCBDdXJyZW50IGxldmVsIG9mIHJlY3Vyc2lvbiwgbWF4LiAyMFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcHJvY2Vzcyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBsZXZlbDogbnVtYmVyID0gMClcclxuICAgIHtcclxuICAgICAgICAvLyBJbml0aWFsbHksIHRoaXMgbWV0aG9kIHdhcyBzdXBwb3NlZCB0byBqdXN0IGFkZCB0aGUgWE1MIGVsZW1lbnRzIGRpcmVjdGx5IGludG9cclxuICAgICAgICAvLyB0aGUgZG9jdW1lbnQuIEhvd2V2ZXIsIHRoaXMgY2F1c2VkIGEgbG90IG9mIHByb2JsZW1zIChlLmcuIHRpdGxlIG5vdCB3b3JraW5nKS5cclxuICAgICAgICAvLyBIVE1MIGRvZXMgbm90IHdvcmsgcmVhbGx5IHdlbGwgd2l0aCBjdXN0b20gZWxlbWVudHMsIGVzcGVjaWFsbHkgaWYgdGhleSBhcmUgb2ZcclxuICAgICAgICAvLyBhbm90aGVyIFhNTCBuYW1lc3BhY2UuXHJcblxyXG4gICAgICAgIGxldCBwZW5kaW5nID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJzpub3Qoc3BhbiknKSBhcyBOb2RlTGlzdE9mPEhUTUxFbGVtZW50PjtcclxuXHJcbiAgICAgICAgLy8gTm8gbW9yZSBYTUwgZWxlbWVudHMgdG8gZXhwYW5kXHJcbiAgICAgICAgaWYgKHBlbmRpbmcubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZvciBlYWNoIFhNTCBlbGVtZW50IGN1cnJlbnRseSBpbiB0aGUgY29udGFpbmVyOlxyXG4gICAgICAgIC8vICogQ3JlYXRlIGEgbmV3IHNwYW4gZWxlbWVudCBmb3IgaXRcclxuICAgICAgICAvLyAqIEhhdmUgdGhlIHByb2Nlc3NvcnMgdGFrZSBkYXRhIGZyb20gdGhlIFhNTCBlbGVtZW50LCB0byBwb3B1bGF0ZSB0aGUgbmV3IG9uZVxyXG4gICAgICAgIC8vICogUmVwbGFjZSB0aGUgWE1MIGVsZW1lbnQgd2l0aCB0aGUgbmV3IG9uZVxyXG4gICAgICAgIHBlbmRpbmcuZm9yRWFjaChlbGVtZW50ID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudE5hbWUgPSBlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICAgICAgbGV0IGNvbnRleHQgICAgID0ge1xyXG4gICAgICAgICAgICAgICAgeG1sRWxlbWVudDogZWxlbWVudCxcclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQ6IG5ld0VsZW1lbnRcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIG5ld0VsZW1lbnQuZGF0YXNldFsndHlwZSddID0gZWxlbWVudE5hbWU7XHJcblxyXG4gICAgICAgICAgICAvLyBJIHdhbnRlZCB0byB1c2UgYW4gaW5kZXggb24gRWxlbWVudFByb2Nlc3NvcnMgZm9yIHRoaXMsIGJ1dCBpdCBjYXVzZWQgZXZlcnlcclxuICAgICAgICAgICAgLy8gcHJvY2Vzc29yIHRvIGhhdmUgYW4gXCJ1bnVzZWQgbWV0aG9kXCIgd2FybmluZy5cclxuICAgICAgICAgICAgc3dpdGNoIChlbGVtZW50TmFtZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnY29hY2gnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5jb2FjaChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdleGN1c2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLmV4Y3VzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2ludGVnZXInOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuaW50ZWdlcihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnbmFtZWQnOiAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5uYW1lZChjb250ZXh0KTsgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2UnOiAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZShjb250ZXh0KTsgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BocmFzZXNldCc6ICAgRWxlbWVudFByb2Nlc3NvcnMucGhyYXNlc2V0KGNvbnRleHQpOyAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGxhdGZvcm0nOiAgICBFbGVtZW50UHJvY2Vzc29ycy5wbGF0Zm9ybShjb250ZXh0KTsgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnNlcnZpY2UoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb24nOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc3RhdGlvbmxpc3QnOiBFbGVtZW50UHJvY2Vzc29ycy5zdGF0aW9ubGlzdChjb250ZXh0KTsgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICd0aW1lJzogICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnRpbWUoY29udGV4dCk7ICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6ICAgICAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudW5rbm93bihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUmVjdXJzZSBzbyB0aGF0IHdlIGNhbiBleHBhbmQgYW55IG5ldyBlbGVtZW50c1xyXG4gICAgICAgIGlmIChsZXZlbCA8IDIwKVxyXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGFpbmVyLCBsZXZlbCArIDEpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUEhSQVNFUl9UT09fUkVDVVJTSVZFKCkgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBwaHJhc2UgZWRpdG9yICovXHJcbmNsYXNzIEVkaXRvclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBET00gY29udGFpbmVyIGZvciB0aGUgZWRpdG9yICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBkaWFsb2csIGlmIGFueSAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50UGlja2VyPyA6IFBpY2tlcjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBocmFzZSBlbGVtZW50IGN1cnJlbnRseSBiZWluZyBlZGl0ZWQsIGlmIGFueSAqL1xyXG4gICAgLy8gRG8gbm90IERSWTsgbmVlZHMgdG8gYmUgcGFzc2VkIHRvIHRoZSBwaWNrZXIgZm9yIGNsZWFuZXIgY29kZVxyXG4gICAgcHJpdmF0ZSBkb21FZGl0aW5nPyAgICA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gPSBET00ucmVxdWlyZSgnI2VkaXRvcicpO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5ib2R5Lm9uY2xpY2sgPSB0aGlzLm9uQ2xpY2suYmluZCh0aGlzKTtcclxuICAgICAgICB3aW5kb3cub25yZXNpemUgICAgICAgPSB0aGlzLm9uUmVzaXplLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb20ub25zY3JvbGwgICAgID0gdGhpcy5vblNjcm9sbC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tLnRleHRDb250ZW50ICA9IEwuRURJVE9SX0lOSVQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVwbGFjZXMgdGhlIGVkaXRvciB3aXRoIGEgcm9vdCBwaHJhc2VzZXQgcmVmZXJlbmNlLCBhbmQgZXhwYW5kcyBpdCBpbnRvIEhUTUwgKi9cclxuICAgIHB1YmxpYyBnZW5lcmF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tLmlubmVySFRNTCA9ICc8cGhyYXNlc2V0IHJlZj1cInJvb3RcIiAvPic7XHJcblxyXG4gICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3ModGhpcy5kb20pO1xyXG5cclxuICAgICAgICAvLyBGb3Igc2Nyb2xsLXBhc3QgcGFkZGluZyB1bmRlciB0aGUgcGhyYXNlXHJcbiAgICAgICAgbGV0IHBhZGRpbmcgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgcGFkZGluZy5jbGFzc05hbWUgPSAnYm90dG9tUGFkZGluZyc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmFwcGVuZENoaWxkKHBhZGRpbmcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXByb2Nlc3NlcyBhbGwgcGhyYXNlc2V0IGVsZW1lbnRzIG9mIHRoZSBnaXZlbiByZWYsIGlmIHRoZWlyIGluZGV4IGhhcyBjaGFuZ2VkICovXHJcbiAgICBwdWJsaWMgcmVmcmVzaFBocmFzZXNldChyZWY6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gTm90ZSwgdGhpcyBjb3VsZCBwb3RlbnRpYWxseSBidWcgb3V0IGlmIGEgcGhyYXNlc2V0J3MgZGVzY2VuZGFudCByZWZlcmVuY2VzXHJcbiAgICAgICAgLy8gdGhlIHNhbWUgcGhyYXNlc2V0IChyZWN1cnNpb24pLiBCdXQgdGhpcyBpcyBva2F5IGJlY2F1c2UgcGhyYXNlc2V0cyBzaG91bGRcclxuICAgICAgICAvLyBuZXZlciBpbmNsdWRlIHRoZW1zZWx2ZXMsIGV2ZW4gZXZlbnR1YWxseS5cclxuXHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChgc3BhbltkYXRhLXR5cGU9cGhyYXNlc2V0XVtkYXRhLXJlZj0ke3JlZn1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goXyA9PlxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCAgICA9IF8gYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBsZXQgbmV3RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3BocmFzZXNldCcpO1xyXG4gICAgICAgICAgICAgICAgbGV0IGNoYW5jZSAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddO1xyXG5cclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQuc2V0QXR0cmlidXRlKCdyZWYnLCByZWYpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChjaGFuY2UpXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2NoYW5jZScsIGNoYW5jZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZWxlbWVudC5wYXJlbnRFbGVtZW50IS5yZXBsYWNlQ2hpbGQobmV3RWxlbWVudCwgZWxlbWVudCk7XHJcbiAgICAgICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKG5ld0VsZW1lbnQucGFyZW50RWxlbWVudCEpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSBzdGF0aWMgTm9kZUxpc3Qgb2YgYWxsIHBocmFzZSBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gcXVlcnkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IFF1ZXJ5IHN0cmluZyB0byBhZGQgb250byB0aGUgYHNwYW5gIHNlbGVjdG9yXHJcbiAgICAgKiBAcmV0dXJucyBOb2RlIGxpc3Qgb2YgYWxsIGVsZW1lbnRzIG1hdGNoaW5nIHRoZSBnaXZlbiBzcGFuIHF1ZXJ5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRFbGVtZW50c0J5UXVlcnkocXVlcnk6IHN0cmluZykgOiBOb2RlTGlzdFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuJHtxdWVyeX1gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCBwaHJhc2UncyByb290IERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlKCkgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCBwaHJhc2UgaW4gdGhlIGVkaXRvciBhcyB0ZXh0LCBleGNsdWRpbmcgdGhlIGhpZGRlbiBwYXJ0cyAqL1xyXG4gICAgcHVibGljIGdldFRleHQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIGFsbCBwaHJhc2UgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHR5cGUsIGFuZCBzZXRzIHRoZWlyIHRleHQgdG8gZ2l2ZW4gdmFsdWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHR5cGUgT3JpZ2luYWwgWE1MIG5hbWUgb2YgZWxlbWVudHMgdG8gcmVwbGFjZSBjb250ZW50cyBvZlxyXG4gICAgICogQHBhcmFtIHZhbHVlIE5ldyB0ZXh0IGZvciB0aGUgZm91bmQgZWxlbWVudHMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRFbGVtZW50c1RleHQodHlwZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT0ke3R5cGV9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIGFueSBjdXJyZW50bHkgb3BlbiBlZGl0b3IgZGlhbG9ncyAqL1xyXG4gICAgcHVibGljIGNsb3NlRGlhbG9nKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmNsb3NlKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmRvbUVkaXRpbmcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcucmVtb3ZlQXR0cmlidXRlKCdlZGl0aW5nJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdhYm92ZScsICdiZWxvdycpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBhIGNsaWNrIGFueXdoZXJlIGluIHRoZSB3aW5kb3cgZGVwZW5kaW5nIG9uIHRoZSBjb250ZXh0ICovXHJcbiAgICBwcml2YXRlIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSBldi50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IHR5cGUgICA9IHRhcmdldCA/IHRhcmdldC5kYXRhc2V0Wyd0eXBlJ10gICAgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgbGV0IHBpY2tlciA9IHR5cGUgICA/IFJBRy52aWV3cy5nZXRQaWNrZXIodHlwZSkgOiB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgIGlmICghdGFyZ2V0KVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBSZWRpcmVjdCBjbGlja3Mgb2YgaW5uZXIgZWxlbWVudHNcclxuICAgICAgICBpZiAoIHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2lubmVyJykgJiYgdGFyZ2V0LnBhcmVudEVsZW1lbnQgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGFyZ2V0ID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIHR5cGUgICA9IHRhcmdldC5kYXRhc2V0Wyd0eXBlJ107XHJcbiAgICAgICAgICAgIHBpY2tlciA9IHR5cGUgPyBSQUcudmlld3MuZ2V0UGlja2VyKHR5cGUpIDogdW5kZWZpbmVkO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWdub3JlIGNsaWNrcyB0byBhbnkgaW5uZXIgZG9jdW1lbnQgb3IgdW5vd25lZCBlbGVtZW50XHJcbiAgICAgICAgaWYgKCAhZG9jdW1lbnQuYm9keS5jb250YWlucyh0YXJnZXQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIHRvIGFueSBlbGVtZW50IG9mIGFscmVhZHkgb3BlbiBwaWNrZXJzXHJcbiAgICAgICAgaWYgKCB0aGlzLmN1cnJlbnRQaWNrZXIgKVxyXG4gICAgICAgIGlmICggdGhpcy5jdXJyZW50UGlja2VyLmRvbS5jb250YWlucyh0YXJnZXQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBDYW5jZWwgYW55IG9wZW4gZWRpdG9yc1xyXG4gICAgICAgIGxldCBwcmV2VGFyZ2V0ID0gdGhpcy5kb21FZGl0aW5nO1xyXG4gICAgICAgIHRoaXMuY2xvc2VEaWFsb2coKTtcclxuXHJcbiAgICAgICAgLy8gSWYgY2xpY2tpbmcgdGhlIGVsZW1lbnQgYWxyZWFkeSBiZWluZyBlZGl0ZWQsIGRvbid0IHJlb3BlblxyXG4gICAgICAgIGlmICh0YXJnZXQgPT09IHByZXZUYXJnZXQpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGNvbGxhcHNpYmxlIGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKCB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCd0b2dnbGUnKSApXHJcbiAgICAgICAgICAgIHRoaXMudG9nZ2xlQ29sbGFwc2lhYmxlKHRhcmdldCk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYW5kIG9wZW4gcGlja2VyIGZvciB0aGUgdGFyZ2V0IGVsZW1lbnRcclxuICAgICAgICBlbHNlIGlmICh0eXBlICYmIHBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5vcGVuUGlja2VyKHRhcmdldCwgcGlja2VyKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmUtbGF5b3V0IHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgb24gcmVzaXplICovXHJcbiAgICBwcml2YXRlIG9uUmVzaXplKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlLWxheW91dCB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIG9uIHNjcm9sbCAqL1xyXG4gICAgcHJpdmF0ZSBvblNjcm9sbChfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRQaWNrZXIpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gV29ya2Fyb3VuZCBmb3IgbGF5b3V0IGJlaGF2aW5nIHdlaXJkIHdoZW4gaU9TIGtleWJvYXJkIGlzIG9wZW5cclxuICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKVxyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRQaWNrZXIuaGFzRm9jdXMoKSlcclxuICAgICAgICAgICAgRE9NLmJsdXJBY3RpdmUoKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmxpcHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUsIGFuZCBwcm9wYWdhdGVzIHRoZSBuZXcgc3RhdGUgdG8gb3RoZXJcclxuICAgICAqIGNvbGxhcHNpYmxlcyBvZiB0aGUgc2FtZSByZWZlcmVuY2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBDb2xsYXBzaWJsZSBlbGVtZW50IGJlaW5nIHRvZ2dsZWRcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB0b2dnbGVDb2xsYXBzaWFibGUodGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgICAgPSB0YXJnZXQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgbGV0IHJlZiAgICAgICAgPSBET00ucmVxdWlyZURhdGEocGFyZW50LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IHR5cGUgICAgICAgPSBET00ucmVxdWlyZURhdGEocGFyZW50LCAndHlwZScpO1xyXG4gICAgICAgIGxldCBjb2xsYXBhc2VkID0gcGFyZW50Lmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJyk7XHJcblxyXG4gICAgICAgIC8vIFByb3BhZ2F0ZSBuZXcgY29sbGFwc2Ugc3RhdGUgdG8gYWxsIGNvbGxhcHNpYmxlcyBvZiB0aGUgc2FtZSByZWZcclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuW2RhdGEtdHlwZT0ke3R5cGV9XVtkYXRhLXJlZj0ke3JlZn1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goXyA9PlxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgcGhyYXNlc2V0ID0gXyBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGxldCB0b2dnbGUgICAgPSBwaHJhc2VzZXQuY2hpbGRyZW5bMF0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gU2tpcCBzYW1lLXJlZiBlbGVtZW50cyB0aGF0IGFyZW4ndCBjb2xsYXBzaWJsZVxyXG4gICAgICAgICAgICAgICAgaWYgKCAhdG9nZ2xlIHx8ICF0b2dnbGUuY2xhc3NMaXN0LmNvbnRhaW5zKCd0b2dnbGUnKSApXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgICAgIENvbGxhcHNpYmxlcy5zZXQocGhyYXNlc2V0LCB0b2dnbGUsICFjb2xsYXBhc2VkKTtcclxuICAgICAgICAgICAgICAgIC8vIERvbid0IG1vdmUgdGhpcyB0byBzZXRDb2xsYXBzaWJsZSwgYXMgc3RhdGUgc2F2ZS9sb2FkIGlzIGhhbmRsZWRcclxuICAgICAgICAgICAgICAgIC8vIG91dHNpZGUgaW4gYm90aCB1c2FnZXMgb2Ygc2V0Q29sbGFwc2libGUuXHJcbiAgICAgICAgICAgICAgICBSQUcuc3RhdGUuc2V0Q29sbGFwc2VkKHJlZiwgIWNvbGxhcGFzZWQpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9wZW5zIGEgcGlja2VyIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVkaXRvciBlbGVtZW50IHRvIG9wZW4gdGhlIHBpY2tlciBmb3JcclxuICAgICAqIEBwYXJhbSBwaWNrZXIgUGlja2VyIHRvIG9wZW5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvcGVuUGlja2VyKHRhcmdldDogSFRNTEVsZW1lbnQsIHBpY2tlcjogUGlja2VyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0YXJnZXQuc2V0QXR0cmlidXRlKCdlZGl0aW5nJywgJ3RydWUnKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyID0gcGlja2VyO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyAgICA9IHRhcmdldDtcclxuICAgICAgICBwaWNrZXIub3Blbih0YXJnZXQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNjcm9sbGluZyBtYXJxdWVlICovXHJcbmNsYXNzIE1hcnF1ZWVcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFycXVlZSdzIERPTSBlbGVtZW50ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbSAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNwYW4gZWxlbWVudCBpbiB0aGUgbWFycXVlZSwgd2hlcmUgdGhlIHRleHQgaXMgc2V0ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbVNwYW4gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIElEIGZvciB0aGUgc2Nyb2xsaW5nIGFuaW1hdGlvbiB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSB0aW1lciAgOiBudW1iZXIgPSAwO1xyXG4gICAgLyoqIEN1cnJlbnQgb2Zmc2V0IChpbiBwaXhlbHMpIG9mIHRoZSBzY3JvbGxpbmcgbWFycXVlZSAqL1xyXG4gICAgcHJpdmF0ZSBvZmZzZXQgOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgID0gRE9NLnJlcXVpcmUoJyNtYXJxdWVlJyk7XHJcbiAgICAgICAgdGhpcy5kb21TcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5pbm5lckhUTUwgPSAnJztcclxuICAgICAgICB0aGlzLmRvbS5hcHBlbmRDaGlsZCh0aGlzLmRvbVNwYW4pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBtZXNzYWdlIG9uIHRoZSBzY3JvbGxpbmcgbWFycXVlZSwgYW5kIHN0YXJ0cyBhbmltYXRpbmcgaXQgKi9cclxuICAgIHB1YmxpYyBzZXQobXNnOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLnRpbWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TcGFuLnRleHRDb250ZW50ID0gbXNnO1xyXG4gICAgICAgIHRoaXMub2Zmc2V0ICAgICAgICAgICAgICA9IHRoaXMuZG9tLmNsaWVudFdpZHRoO1xyXG5cclxuICAgICAgICAvLyBJIHRyaWVkIHRvIHVzZSBDU1MgYW5pbWF0aW9uIGZvciB0aGlzLCBidXQgY291bGRuJ3QgZmlndXJlIG91dCBob3cgZm9yIGFcclxuICAgICAgICAvLyBkeW5hbWljYWxseSBzaXplZCBlbGVtZW50IGxpa2UgdGhlIHNwYW4uXHJcbiAgICAgICAgbGV0IGxpbWl0ID0gLXRoaXMuZG9tU3Bhbi5jbGllbnRXaWR0aCAtIDEwMDtcclxuICAgICAgICBsZXQgYW5pbSAgPSAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5vZmZzZXQgLT0gKERPTS5pc01vYmlsZSA/IDUgOiA3KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlWCgke3RoaXMub2Zmc2V0fXB4KWA7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vZmZzZXQgPCBsaW1pdClcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhpcy50aW1lciA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3RvcHMgdGhlIGN1cnJlbnQgbWFycXVlZSBhbmltYXRpb24gKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuY2xhc3MgU2V0dGluZ3Ncclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY29udGFpbmVyIGZvciB0aGUgc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwcml2YXRlIGRvbSAgICAgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIFwiUmVzZXQgc2V0dGluZ3NcIiBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuUmVzZXQgICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgXCJTYXZlIGFuZCBjbG9zZVwiIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5TYXZlICAgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSB2b2ljZSBzZWxlY3Rpb24gYm94ICovXHJcbiAgICBwcml2YXRlIHNlbFZveENob2ljZSAgOiBIVE1MU2VsZWN0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHZvaWNlIHZvbHVtZSBzbGlkZXIgKi9cclxuICAgIHByaXZhdGUgcmFuZ2VWb3hWb2wgICA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSB2b2ljZSBwaXRjaCBzbGlkZXIgKi9cclxuICAgIHByaXZhdGUgcmFuZ2VWb3hQaXRjaCA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSB2b2ljZSByYXRlIHNsaWRlciAqL1xyXG4gICAgcHJpdmF0ZSByYW5nZVZveFJhdGUgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNwZWVjaCB0ZXN0IGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5Wb3hUZXN0ICAgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHRpbWVyIGZvciB0aGUgXCJSZXNldFwiIGJ1dHRvbiBjb25maXJtYXRpb24gc3RlcCAqL1xyXG4gICAgcHJpdmF0ZSByZXNldFRpbWVvdXQ/IDogbnVtYmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gR2VuZXJhbCBzZXR0aW5ncyBmb3JtXHJcblxyXG4gICAgICAgIHRoaXMuZG9tICAgICAgPSBET00ucmVxdWlyZSgnI3NldHRpbmdzU2NyZWVuJyk7XHJcbiAgICAgICAgdGhpcy5idG5SZXNldCA9IERPTS5yZXF1aXJlKCcjYnRuUmVzZXRTZXR0aW5ncycpO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZSAgPSBET00ucmVxdWlyZSgnI2J0blNhdmVTZXR0aW5ncycpO1xyXG5cclxuICAgICAgICB0aGlzLmJ0blJlc2V0Lm9uY2xpY2sgPSB0aGlzLmhhbmRsZVJlc2V0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlLm9uY2xpY2sgID0gdGhpcy5oYW5kbGVTYXZlLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIFZveCBmb3JtXHJcblxyXG4gICAgICAgIHRoaXMuc2VsVm94Q2hvaWNlICA9IERPTS5yZXF1aXJlKCcjc2VsVm94Q2hvaWNlJyk7XHJcbiAgICAgICAgdGhpcy5yYW5nZVZveFZvbCAgID0gRE9NLnJlcXVpcmUoJyNyYW5nZVZveFZvbCcpO1xyXG4gICAgICAgIHRoaXMucmFuZ2VWb3hQaXRjaCA9IERPTS5yZXF1aXJlKCcjcmFuZ2VWb3hQaXRjaCcpO1xyXG4gICAgICAgIHRoaXMucmFuZ2VWb3hSYXRlICA9IERPTS5yZXF1aXJlKCcjcmFuZ2VWb3hSYXRlJyk7XHJcbiAgICAgICAgdGhpcy5idG5Wb3hUZXN0ICAgID0gRE9NLnJlcXVpcmUoJyNidG5Wb3hUZXN0Jyk7XHJcblxyXG4gICAgICAgIHRoaXMuYnRuVm94VGVzdC5vbmNsaWNrID0gdGhpcy5oYW5kbGVWb3hUZXN0LmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIExlZ2FsIGFuZCBhY2tub3dsZWRnZW1lbnRzXHJcblxyXG4gICAgICAgIExpbmtkb3duLnBhcnNlKCBET00ucmVxdWlyZSgnI2xlZ2FsQmxvY2snKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBPcGVucyB0aGUgc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgb3BlbigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG5cclxuICAgICAgICAvLyBUaGUgdm94IGxpc3QgaGFzIHRvIGJlIHBvcHVsYXRlZCBlYWNoIG9wZW4sIGluIGNhc2UgaXQgY2hhbmdlc1xyXG4gICAgICAgIHRoaXMucG9wdWxhdGVWb3hMaXN0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuc2VsVm94Q2hvaWNlLnNlbGVjdGVkSW5kZXggID0gUkFHLmNvbmZpZy52b3hDaG9pY2U7XHJcbiAgICAgICAgdGhpcy5yYW5nZVZveFZvbC52YWx1ZUFzTnVtYmVyICAgPSBSQUcuY29uZmlnLnZveFZvbHVtZTtcclxuICAgICAgICB0aGlzLnJhbmdlVm94UGl0Y2gudmFsdWVBc051bWJlciA9IFJBRy5jb25maWcudm94UGl0Y2g7XHJcbiAgICAgICAgdGhpcy5yYW5nZVZveFJhdGUudmFsdWVBc051bWJlciAgPSBSQUcuY29uZmlnLnZveFJhdGU7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlcyB0aGUgc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmNhbmNlbFJlc2V0KCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5jYW5jZWwoKTtcclxuICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcclxuICAgICAgICBET00uYmx1ckFjdGl2ZSh0aGlzLmRvbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFycyBhbmQgcG9wdWxhdGVzIHRoZSB2b2ljZSBsaXN0ICovXHJcbiAgICBwcml2YXRlIHBvcHVsYXRlVm94TGlzdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuc2VsVm94Q2hvaWNlLmlubmVySFRNTCA9ICcnO1xyXG5cclxuICAgICAgICBsZXQgdm9pY2VzID0gUkFHLnNwZWVjaC5nZXRWb2ljZXMoKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGxpc3RcclxuICAgICAgICBpZiAodm9pY2VzLmxlbmd0aCA8PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpO1xyXG5cclxuICAgICAgICAgICAgb3B0aW9uLnRleHRDb250ZW50ID0gTC5TVF9WT1hfRU1QVFkoKTtcclxuICAgICAgICAgICAgb3B0aW9uLmRpc2FibGVkICAgID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2VsVm94Q2hvaWNlLmFwcGVuZENoaWxkKG9wdGlvbik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9TcGVlY2hTeW50aGVzaXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHZvaWNlcy5sZW5ndGggOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XHJcblxyXG4gICAgICAgICAgICBvcHRpb24udGV4dENvbnRlbnQgPSBgJHt2b2ljZXNbaV0ubmFtZX0gKCR7dm9pY2VzW2ldLmxhbmd9KWA7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnNlbFZveENob2ljZS5hcHBlbmRDaGlsZChvcHRpb24pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgcmVzZXQgYnV0dG9uLCB3aXRoIGEgY29uZmlybSBzdGVwIHRoYXQgY2FuY2VscyBhZnRlciAxNSBzZWNvbmRzICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnJlc2V0VGltZW91dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMucmVzZXRUaW1lb3V0ICAgICAgID0gc2V0VGltZW91dCh0aGlzLmNhbmNlbFJlc2V0LmJpbmQodGhpcyksIDE1MDAwKTtcclxuICAgICAgICAgICAgdGhpcy5idG5SZXNldC5pbm5lclRleHQgPSBMLlNUX1JFU0VUX0NPTkZJUk0oKTtcclxuICAgICAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX0NPTkZJUk1fVCgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBSQUcuY29uZmlnLnJlc2V0KCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5jYW5jZWwoKTtcclxuICAgICAgICB0aGlzLmNhbmNlbFJlc2V0KCk7XHJcbiAgICAgICAgdGhpcy5vcGVuKCk7XHJcbiAgICAgICAgYWxlcnQoIEwuU1RfUkVTRVRfRE9ORSgpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbmNlbCB0aGUgcmVzZXQgdGltZW91dCBhbmQgcmVzdG9yZSB0aGUgcmVzZXQgYnV0dG9uIHRvIG5vcm1hbCAqL1xyXG4gICAgcHJpdmF0ZSBjYW5jZWxSZXNldCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5yZXNldFRpbWVvdXQpO1xyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQuaW5uZXJUZXh0ID0gTC5TVF9SRVNFVCgpO1xyXG4gICAgICAgIHRoaXMuYnRuUmVzZXQudGl0bGUgICAgID0gTC5TVF9SRVNFVF9UKCk7XHJcbiAgICAgICAgdGhpcy5yZXNldFRpbWVvdXQgICAgICAgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNhdmUgYnV0dG9uLCBzYXZpbmcgY29uZmlnIHRvIHN0b3JhZ2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlU2F2ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5jb25maWcudm94Q2hvaWNlID0gdGhpcy5zZWxWb3hDaG9pY2Uuc2VsZWN0ZWRJbmRleDtcclxuICAgICAgICBSQUcuY29uZmlnLnZveFZvbHVtZSA9IHBhcnNlRmxvYXQodGhpcy5yYW5nZVZveFZvbC52YWx1ZSk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hQaXRjaCAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VWb3hQaXRjaC52YWx1ZSk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hSYXRlICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VWb3hSYXRlLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNhdmUoKTtcclxuICAgICAgICB0aGlzLmNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNwZWVjaCB0ZXN0IGJ1dHRvbiwgc3BlYWtpbmcgYSB0ZXN0IHBocmFzZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVWb3hUZXN0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIHRoaXMuYnRuVm94VGVzdC5kaXNhYmxlZCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEhhcyB0byBleGVjdXRlIG9uIGEgZGVsYXksIGFzIHNwZWVjaCBjYW5jZWwgaXMgdW5yZWxpYWJsZSB3aXRob3V0IGl0XHJcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuVm94VGVzdC5kaXNhYmxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgbGV0IHRpbWUgICA9IFN0cmluZ3MuZnJvbVRpbWUoIG5ldyBEYXRlKCkgKTtcclxuICAgICAgICAgICAgbGV0IHBocmFzZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHJcbiAgICAgICAgICAgIHBocmFzZS5pbm5lckhUTUwgPSAnPHNwYW4gZGF0YS10eXBlPVwicGhyYXNlXCIgZGF0YS1yZWY9XCJzYW1wbGVcIj4nICtcclxuICAgICAgICAgICAgICAgICdUaGlzIGlzIGEgdGVzdCBvZiB0aGUgUmFpbCBBbm5vdW5jZW1lbnQgR2VuZXJhdG9yIGF0JyArXHJcbiAgICAgICAgICAgICAgICAnPHNwYW4gZGF0YS10eXBlPVwidGltZVwiPicgKyB0aW1lICsgJzwvc3Bhbj4nICtcclxuICAgICAgICAgICAgICAgICc8L3NwYW4+JztcclxuXHJcbiAgICAgICAgICAgIFJBRy5zcGVlY2guc3BlYWsoXHJcbiAgICAgICAgICAgICAgICBwaHJhc2UuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LFxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHZvaWNlSWR4IDogdGhpcy5zZWxWb3hDaG9pY2Uuc2VsZWN0ZWRJbmRleCxcclxuICAgICAgICAgICAgICAgICAgICB2b2x1bWUgICA6IHRoaXMucmFuZ2VWb3hWb2wudmFsdWVBc051bWJlcixcclxuICAgICAgICAgICAgICAgICAgICBwaXRjaCAgICA6IHRoaXMucmFuZ2VWb3hQaXRjaC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHJhdGUgICAgIDogdGhpcy5yYW5nZVZveFJhdGUudmFsdWVBc051bWJlclxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0sIDIwMCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgdG9wIHRvb2xiYXIgKi9cclxuY2xhc3MgVG9vbGJhclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjb250YWluZXIgZm9yIHRoZSB0b29sYmFyICovXHJcbiAgICBwcml2YXRlIGRvbSAgICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwbGF5IGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5QbGF5ICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc3RvcCBidXR0b24gKi9cclxuICAgIHByaXZhdGUgYnRuU3RvcCAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGdlbmVyYXRlIHJhbmRvbSBwaHJhc2UgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0bkdlbmVyYXRlIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzYXZlIHN0YXRlIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5TYXZlICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcmVjYWxsIHN0YXRlIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSBidG5SZWNhbGwgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc2V0dGluZ3MgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIGJ0bk9wdGlvbiAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSAgICAgICAgID0gRE9NLnJlcXVpcmUoJyN0b29sYmFyJyk7XHJcbiAgICAgICAgdGhpcy5idG5QbGF5ICAgICA9IERPTS5yZXF1aXJlKCcjYnRuUGxheScpO1xyXG4gICAgICAgIHRoaXMuYnRuU3RvcCAgICAgPSBET00ucmVxdWlyZSgnI2J0blN0b3AnKTtcclxuICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlID0gRE9NLnJlcXVpcmUoJyNidG5TaHVmZmxlJyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlICAgICA9IERPTS5yZXF1aXJlKCcjYnRuU2F2ZScpO1xyXG4gICAgICAgIHRoaXMuYnRuUmVjYWxsICAgPSBET00ucmVxdWlyZSgnI2J0bkxvYWQnKTtcclxuICAgICAgICB0aGlzLmJ0bk9wdGlvbiAgID0gRE9NLnJlcXVpcmUoJyNidG5TZXR0aW5ncycpO1xyXG5cclxuICAgICAgICB0aGlzLmJ0blN0b3Aub25jbGljayAgICAgPSB0aGlzLmhhbmRsZVN0b3AuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLm9uY2xpY2sgPSB0aGlzLmhhbmRsZUdlbmVyYXRlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlLm9uY2xpY2sgICAgID0gdGhpcy5oYW5kbGVTYXZlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5SZWNhbGwub25jbGljayAgID0gdGhpcy5oYW5kbGVMb2FkLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5PcHRpb24ub25jbGljayAgID0gdGhpcy5oYW5kbGVPcHRpb24uYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgdGhpcy5idG5QbGF5Lm9uY2xpY2sgPSBldiA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gSGFzIHRvIGV4ZWN1dGUgb24gYSBkZWxheSwgYXMgc3BlZWNoIGNhbmNlbCBpcyB1bnJlbGlhYmxlIHdpdGhvdXQgaXRcclxuICAgICAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgUkFHLnNwZWVjaC5jYW5jZWwoKTtcclxuICAgICAgICAgICAgdGhpcy5idG5QbGF5LmRpc2FibGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQodGhpcy5oYW5kbGVQbGF5LmJpbmQodGhpcyksIDIwMCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gQWRkIHRocm9iIGNsYXNzIGlmIHRoZSBnZW5lcmF0ZSBidXR0b24gaGFzbid0IGJlZW4gY2xpY2tlZCBiZWZvcmVcclxuICAgICAgICBpZiAoIVJBRy5jb25maWcuY2xpY2tlZEdlbmVyYXRlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5idG5HZW5lcmF0ZS5jbGFzc0xpc3QuYWRkKCd0aHJvYicpO1xyXG4gICAgICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5idG5QbGF5LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHBsYXkgYnV0dG9uLCBwbGF5aW5nIHRoZSBlZGl0b3IncyBjdXJyZW50IHBocmFzZSB3aXRoIHNwZWVjaCAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVQbGF5KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gTm90ZTogSXQgd291bGQgYmUgbmljZSB0byBoYXZlIHRoZSBwbGF5IGJ1dHRvbiBjaGFuZ2UgdG8gdGhlIHN0b3AgYnV0dG9uIGFuZFxyXG4gICAgICAgIC8vIGF1dG9tYXRpY2FsbHkgY2hhbmdlIGJhY2suIEhvd2V2ZXIsIHNwZWVjaCdzICdvbmVuZCcgZXZlbnQgd2FzIGZvdW5kIHRvIGJlXHJcbiAgICAgICAgLy8gdW5yZWxpYWJsZSwgc28gSSBkZWNpZGVkIHRvIGtlZXAgcGxheSBhbmQgc3RvcCBzZXBhcmF0ZS5cclxuXHJcbiAgICAgICAgUkFHLnNwZWVjaC5zcGVhayggUkFHLnZpZXdzLmVkaXRvci5nZXRQaHJhc2UoKSApO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggUkFHLnZpZXdzLmVkaXRvci5nZXRUZXh0KCkgKTtcclxuICAgICAgICB0aGlzLmJ0blBsYXkuZGlzYWJsZWQgPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc3RvcCBidXR0b24sIHN0b3BwaW5nIHRoZSBtYXJxdWVlIGFuZCBhbnkgc3BlZWNoICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVN0b3AoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnN0b3AoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgZ2VuZXJhdGUgYnV0dG9uLCBnZW5lcmF0aW5nIG5ldyByYW5kb20gc3RhdGUgYW5kIHBocmFzZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVHZW5lcmF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFJlbW92ZSB0aGUgY2FsbC10by1hY3Rpb24gdGhyb2IgZnJvbSBpbml0aWFsIGxvYWRcclxuICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmNsYXNzTGlzdC5yZW1vdmUoJ3Rocm9iJyk7XHJcbiAgICAgICAgUkFHLmdlbmVyYXRlKCk7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5jbGlja2VkR2VuZXJhdGUgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzYXZlIGJ1dHRvbiwgcGVyc2lzdGluZyB0aGUgY3VycmVudCB0cmFpbiBzdGF0ZSB0byBzdG9yYWdlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjc3MgPSAnZm9udC1zaXplOiBsYXJnZTsgZm9udC13ZWlnaHQ6IGJvbGQ7JztcclxuICAgICAgICAgICAgbGV0IHJhdyA9IEpTT04uc3RyaW5naWZ5KFJBRy5zdGF0ZSk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2VbJ3N0YXRlJ10gPSByYXc7XHJcblxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhMLlNUQVRFX0NPUFlfUEFTVEUoKSwgY3NzKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJSQUcubG9hZCgnXCIsIHJhdy5yZXBsYWNlKFwiJ1wiLCBcIlxcXFwnXCIpLCBcIicpXCIpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhMLlNUQVRFX1JBV19KU09OKCksIGNzcyk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHJhdyk7XHJcblxyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfVE9fU1RPUkFHRSgpICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX1NBVkVfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBsb2FkIGJ1dHRvbiwgbG9hZGluZyB0cmFpbiBzdGF0ZSBmcm9tIHN0b3JhZ2UsIGlmIGl0IGV4aXN0cyAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVMb2FkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGRhdGEgPSB3aW5kb3cubG9jYWxTdG9yYWdlWydzdGF0ZSddO1xyXG5cclxuICAgICAgICByZXR1cm4gZGF0YVxyXG4gICAgICAgICAgICA/IFJBRy5sb2FkKGRhdGEpXHJcbiAgICAgICAgICAgIDogUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX1NBVkVfTUlTU0lORygpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNldHRpbmdzIGJ1dHRvbiwgb3BlbmluZyB0aGUgc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwcml2YXRlIGhhbmRsZU9wdGlvbigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy52aWV3cy5zZXR0aW5ncy5vcGVuKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYW5hZ2VzIFVJIGVsZW1lbnRzIGFuZCB0aGVpciBsb2dpYyAqL1xyXG5jbGFzcyBWaWV3c1xyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIGVkaXRvciBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZWRpdG9yICAgOiBFZGl0b3I7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIG1hcnF1ZWUgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IG1hcnF1ZWUgIDogTWFycXVlZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHNldHRpbmdzIDogU2V0dGluZ3M7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIHRvb2xiYXIgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHRvb2xiYXIgIDogVG9vbGJhcjtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGFsbCB0aGUgcGlja2Vycywgb25lIGZvciBlYWNoIHR5cGUgb2YgWE1MIGVsZW1lbnQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcGlja2VycyAgOiBEaWN0aW9uYXJ5PFBpY2tlcj47XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmVkaXRvciAgID0gbmV3IEVkaXRvcigpO1xyXG4gICAgICAgIHRoaXMubWFycXVlZSAgPSBuZXcgTWFycXVlZSgpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBuZXcgU2V0dGluZ3MoKTtcclxuICAgICAgICB0aGlzLnRvb2xiYXIgID0gbmV3IFRvb2xiYXIoKTtcclxuICAgICAgICB0aGlzLnBpY2tlcnMgID0ge307XHJcblxyXG4gICAgICAgIFtcclxuICAgICAgICAgICAgbmV3IENvYWNoUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBFeGN1c2VQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IEludGVnZXJQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IE5hbWVkUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBQaHJhc2VzZXRQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFBsYXRmb3JtUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTZXJ2aWNlUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTdGF0aW9uUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTdGF0aW9uTGlzdFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgVGltZVBpY2tlcigpXHJcbiAgICAgICAgXS5mb3JFYWNoKHBpY2tlciA9PiB0aGlzLnBpY2tlcnNbcGlja2VyLnhtbFRhZ10gPSBwaWNrZXIpO1xyXG5cclxuICAgICAgICAvLyBHbG9iYWwgaG90a2V5c1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkub25rZXlkb3duID0gdGhpcy5vbklucHV0LmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGlPUy1zcGVjaWZpYyBDU1MgZml4ZXNcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoJ2lvcycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBwaWNrZXIgdGhhdCBoYW5kbGVzIGEgZ2l2ZW4gdGFnLCBpZiBhbnkgKi9cclxuICAgIHB1YmxpYyBnZXRQaWNrZXIoeG1sVGFnOiBzdHJpbmcpIDogUGlja2VyXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucGlja2Vyc1t4bWxUYWddO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGUgRVNDIHRvIGNsb3NlIHBpY2tlcnMgb3Igc2V0dGlnbnMgKi9cclxuICAgIHByaXZhdGUgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGV2LmtleSAhPT0gJ0VzY2FwZScpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzLmNsb3NlKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCBjb2xsYXBzaWJsZSBlbGVtZW50cyAqL1xyXG5jbGFzcyBDb2xsYXBzaWJsZXNcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNwYW4gVGhlIGVuY2Fwc3VsYXRpbmcgY29sbGFwc2libGUgZWxlbWVudFxyXG4gICAgICogQHBhcmFtIHRvZ2dsZSBUaGUgdG9nZ2xlIGNoaWxkIG9mIHRoZSBjb2xsYXBzaWJsZSBlbGVtZW50XHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgVHJ1ZSB0byBjb2xsYXBzZSwgZmFsc2UgdG8gb3BlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNldChzcGFuOiBIVE1MRWxlbWVudCwgdG9nZ2xlOiBIVE1MRWxlbWVudCwgc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmIChzdGF0ZSkgc3Bhbi5zZXRBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcsICcnKTtcclxuICAgICAgICBlbHNlICAgICAgIHNwYW4ucmVtb3ZlQXR0cmlidXRlKCdjb2xsYXBzZWQnKTtcclxuXHJcbiAgICAgICAgdG9nZ2xlLnRpdGxlID0gc3RhdGVcclxuICAgICAgICAgICAgPyBMLlRJVExFX09QVF9PUEVOKClcclxuICAgICAgICAgICAgOiBMLlRJVExFX09QVF9DTE9TRSgpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogU3VnYXIgZm9yIGNob29zaW5nIHNlY29uZCB2YWx1ZSBpZiBmaXJzdCBpcyB1bmRlZmluZWQsIGluc3RlYWQgb2YgZmFsc3kgKi9cclxuZnVuY3Rpb24gZWl0aGVyPFQ+KHZhbHVlOiBUIHwgdW5kZWZpbmVkLCB2YWx1ZTI6IFQpIDogVFxyXG57XHJcbiAgICByZXR1cm4gKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpID8gdmFsdWUyIDogdmFsdWU7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCB0aGUgRE9NICovXHJcbmNsYXNzIERPTVxyXG57XHJcbiAgICAvKiogV2hldGhlciB0aGUgd2luZG93IGlzIHRoaW5uZXIgdGhhbiBhIHNwZWNpZmljIHNpemUgKGFuZCwgdGh1cywgaXMgXCJtb2JpbGVcIikgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGlzTW9iaWxlKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGggPD0gNTAwO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIFJBRyBhcHBlYXJzIHRvIGJlIHJ1bm5pbmcgb24gYW4gaU9TIGRldmljZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgaXNpT1MoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLnBsYXRmb3JtLm1hdGNoKC9pUGhvbmV8aVBvZHxpUGFkL2dpKSAhPT0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gYXR0cmlidXRlIGZyb20gdGhlIGdpdmVuIGVsZW1lbnQsIG9yIHJldHVybnMgdGhlIGdpdmVuXHJcbiAgICAgKiBkZWZhdWx0IHZhbHVlIGlmIHVuc2V0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBhdHRyIE5hbWUgb2YgdGhlIGF0dHJpYnV0ZSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcGFyYW0gZGVmIERlZmF1bHQgdmFsdWUgaWYgYXR0cmlidXRlIGlzbid0IHNldFxyXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGF0dHJpYnV0ZSdzIHZhbHVlLCBvciBkZWZhdWx0IHZhbHVlIGlmIHVuc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2V0QXR0cihlbGVtZW50OiBIVE1MRWxlbWVudCwgYXR0cjogc3RyaW5nLCBkZWY6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gZWxlbWVudC5oYXNBdHRyaWJ1dGUoYXR0cilcclxuICAgICAgICAgICAgPyBlbGVtZW50LmdldEF0dHJpYnV0ZShhdHRyKSFcclxuICAgICAgICAgICAgOiBkZWY7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyBhbiBlbGVtZW50IGZyb20gdGhlIGdpdmVuIGRvY3VtZW50LCB0aHJvd2luZyBhbiBlcnJvciBpZiBubyBtYXRjaCBpcyBmb3VuZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgQ1NTIHNlbGVjdG9yIHF1ZXJ5IHRvIHVzZVxyXG4gICAgICogQHBhcmFtIHBhcmVudCBQYXJlbnQgb2JqZWN0IHRvIHNlYXJjaDsgZGVmYXVsdHMgdG8gZG9jdW1lbnRcclxuICAgICAqIEByZXR1cm5zIFRoZSBmaXJzdCBlbGVtZW50IHRvIG1hdGNoIHRoZSBnaXZlbiBxdWVyeVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmU8VCBleHRlbmRzIEhUTUxFbGVtZW50PlxyXG4gICAgICAgIChxdWVyeTogc3RyaW5nLCBwYXJlbnQ6IFBhcmVudE5vZGUgPSB3aW5kb3cuZG9jdW1lbnQpXHJcbiAgICAgICAgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IHBhcmVudC5xdWVyeVNlbGVjdG9yKHF1ZXJ5KSBhcyBUO1xyXG5cclxuICAgICAgICBpZiAoIXJlc3VsdClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuRE9NX01JU1NJTkcocXVlcnkpICk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGF0dHJpYnV0ZSBmcm9tIHRoZSBnaXZlbiBlbGVtZW50LCB0aHJvd2luZyBhbiBlcnJvclxyXG4gICAgICogaWYgdGhlIGF0dHJpYnV0ZSBpcyBtaXNzaW5nLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBhdHRyIE5hbWUgb2YgdGhlIGF0dHJpYnV0ZSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gYXR0cmlidXRlJ3MgdmFsdWVcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZXF1aXJlQXR0cihlbGVtZW50OiBIVE1MRWxlbWVudCwgYXR0cjogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICggIWVsZW1lbnQuaGFzQXR0cmlidXRlKGF0dHIpIClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuQVRUUl9NSVNTSU5HKGF0dHIpICk7XHJcblxyXG4gICAgICAgIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZShhdHRyKSE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGtleSBvZiB0aGUgZ2l2ZW4gZWxlbWVudCdzIGRhdGFzZXQsIHRocm93aW5nIGFuIGVycm9yXHJcbiAgICAgKiBpZiB0aGUgdmFsdWUgaXMgbWlzc2luZyBvciBlbXB0eS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgZGF0YSBvZlxyXG4gICAgICogQHBhcmFtIGtleSBLZXkgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxyXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGRhdGFzZXQncyB2YWx1ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmVEYXRhKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBrZXk6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgdmFsdWUgPSBlbGVtZW50LmRhdGFzZXRba2V5XTtcclxuXHJcbiAgICAgICAgaWYgKCBTdHJpbmdzLmlzTnVsbE9yRW1wdHkodmFsdWUpIClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuREFUQV9NSVNTSU5HKGtleSkgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHZhbHVlITtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEJsdXJzICh1bmZvY3VzZXMpIHRoZSBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwYXJlbnQgSWYgZ2l2ZW4sIG9ubHkgYmx1cnMgaWYgYWN0aXZlIGlzIGRlc2NlbmRhbnRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBibHVyQWN0aXZlKHBhcmVudDogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5ib2R5KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgYWN0aXZlID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCBhY3RpdmUgJiYgYWN0aXZlLmJsdXIgJiYgcGFyZW50LmNvbnRhaW5zKGFjdGl2ZSkgKVxyXG4gICAgICAgICAgICBhY3RpdmUuYmx1cigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRGVlcCBjbG9uZXMgYWxsIHRoZSBjaGlsZHJlbiBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgaW50byB0aGUgdGFyZ2V0IGVsZW1lbnQuXHJcbiAgICAgKiBVc2luZyBpbm5lckhUTUwgd291bGQgYmUgZWFzaWVyLCBob3dldmVyIGl0IGhhbmRsZXMgc2VsZi1jbG9zaW5nIHRhZ3MgcG9vcmx5LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzb3VyY2UgRWxlbWVudCB3aG9zZSBjaGlsZHJlbiB0byBjbG9uZVxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFbGVtZW50IHRvIGFwcGVuZCB0aGUgY2xvbmVkIGNoaWxkcmVuIHRvXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY2xvbmVJbnRvKHNvdXJjZTogSFRNTEVsZW1lbnQsIHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc291cmNlLmNoaWxkTm9kZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIHRhcmdldC5hcHBlbmRDaGlsZCggc291cmNlLmNoaWxkTm9kZXNbaV0uY2xvbmVOb2RlKHRydWUpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGV4Y2x1ZGluZyB0aGUgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW4uXHJcbiAgICAgKiBCZSB3YXJuZWQ7IHRoaXMgbWV0aG9kIHVzZXMgUkFHLXNwZWNpZmljIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gcmVjdXJzaXZlbHkgZ2V0IHRleHQgY29udGVudCBvZlxyXG4gICAgICogQHJldHVybnMgVGV4dCBjb250ZW50IG9mIGdpdmVuIGVsZW1lbnQsIHdpdGhvdXQgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRWaXNpYmxlVGV4dChlbGVtZW50OiBFbGVtZW50KSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICAgICAgKGVsZW1lbnQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudC50ZXh0Q29udGVudCB8fCAnJztcclxuICAgICAgICBlbHNlIGlmICggZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3RvZ2dsZScpIClcclxuICAgICAgICAgICAgcmV0dXJuICcnO1xyXG5cclxuICAgICAgICAvLyBSZXR1cm4gYmxhbmsgKHNraXApIGlmIGNoaWxkIG9mIGEgY29sbGFwc2VkIGVsZW1lbnQuIFByZXZpb3VzbHksIHRoaXMgdXNlZFxyXG4gICAgICAgIC8vIGdldENvbXB1dGVkU3R5bGUsIGJ1dCB0aGF0IGRvZXNuJ3Qgd29yayBpZiB0aGUgZWxlbWVudCBpcyBwYXJ0IG9mIGFuIG9ycGhhbmVkXHJcbiAgICAgICAgLy8gcGhyYXNlIChhcyBoYXBwZW5zIHdpdGggdGhlIHBocmFzZXNldCBwaWNrZXIpLlxyXG4gICAgICAgIGxldCBwYXJlbnQgPSBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggcGFyZW50ICYmIHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpIClcclxuICAgICAgICAgICAgcmV0dXJuICcnO1xyXG5cclxuICAgICAgICBsZXQgdGV4dCA9ICcnO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICB0ZXh0ICs9IERPTS5nZXRWaXNpYmxlVGV4dChlbGVtZW50LmNoaWxkTm9kZXNbaV0gYXMgRWxlbWVudCk7XHJcblxyXG4gICAgICAgIHJldHVybiB0ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdGV4dCBjb250ZW50IG9mIHRoZSBnaXZlbiBlbGVtZW50LCBleGNsdWRpbmcgdGhlIHRleHQgb2YgaGlkZGVuIGNoaWxkcmVuLFxyXG4gICAgICogYW5kIGV4Y2VzcyB3aGl0ZXNwYWNlIGFzIGEgcmVzdWx0IG9mIGNvbnZlcnRpbmcgZnJvbSBIVE1ML1hNTC5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xOTk4NjMyOFxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byByZWN1cnNpdmVseSBnZXQgdGV4dCBjb250ZW50IG9mXHJcbiAgICAgKiBAcmV0dXJucyBDbGVhbmVkIHRleHQgb2YgZ2l2ZW4gZWxlbWVudCwgd2l0aG91dCB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldENsZWFuZWRWaXNpYmxlVGV4dChlbGVtZW50OiBFbGVtZW50KSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBTdHJpbmdzLmNsZWFuKCBET00uZ2V0VmlzaWJsZVRleHQoZWxlbWVudCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNjYW5zIGZvciB0aGUgbmV4dCBmb2N1c2FibGUgc2libGluZyBmcm9tIGEgZ2l2ZW4gZWxlbWVudCwgc2tpcHBpbmcgaGlkZGVuIG9yXHJcbiAgICAgKiB1bmZvY3VzYWJsZSBlbGVtZW50cy4gSWYgdGhlIGVuZCBvZiB0aGUgY29udGFpbmVyIGlzIGhpdCwgdGhlIHNjYW4gd3JhcHMgYXJvdW5kLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBmcm9tIEVsZW1lbnQgdG8gc3RhcnQgc2Nhbm5pbmcgZnJvbVxyXG4gICAgICogQHBhcmFtIGRpciBEaXJlY3Rpb247IC0xIGZvciBsZWZ0IChwcmV2aW91cyksIDEgZm9yIHJpZ2h0IChuZXh0KVxyXG4gICAgICogQHJldHVybnMgVGhlIG5leHQgYXZhaWxhYmxlIHNpYmxpbmcsIG9yIG51bGwgaWYgbm9uZSBmb3VuZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZyb206IEhUTUxFbGVtZW50LCBkaXI6IG51bWJlcilcclxuICAgICAgICA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdXJyZW50ID0gZnJvbTtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IGZyb20ucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCFwYXJlbnQpXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICB3aGlsZSAodHJ1ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIFByb2NlZWQgdG8gbmV4dCBlbGVtZW50LCBvciB3cmFwIGFyb3VuZCBpZiBoaXQgdGhlIGVuZCBvZiBwYXJlbnRcclxuICAgICAgICAgICAgaWYgICAgICAoZGlyIDwgMClcclxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBwYXJlbnQubGFzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID4gMClcclxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IHBhcmVudC5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuQkFEX0RJUkVDVElPTiggZGlyLnRvU3RyaW5nKCkgKSApO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgd2UndmUgY29tZSBiYWNrIHRvIHRoZSBzdGFydGluZyBlbGVtZW50LCBub3RoaW5nIHdhcyBmb3VuZFxyXG4gICAgICAgICAgICBpZiAoY3VycmVudCA9PT0gZnJvbSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgdGhpcyBlbGVtZW50IGlzbid0IGhpZGRlbiBhbmQgaXMgZm9jdXNhYmxlLCByZXR1cm4gaXQhXHJcbiAgICAgICAgICAgIGlmICggIWN1cnJlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdoaWRkZW4nKSApXHJcbiAgICAgICAgICAgIGlmICggY3VycmVudC5oYXNBdHRyaWJ1dGUoJ3RhYmluZGV4JykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBlbGVtZW50LCByZWxldmFudCB0byBpdHMgcGFyZW50LlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIGVsZW1lbnQgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluZGV4T2YoY2hpbGQ6IEhUTUxFbGVtZW50KSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGRyZW4sIGNoaWxkKVxyXG4gICAgICAgICAgICA6IC0xO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQSB2ZXJ5LCB2ZXJ5IHNtYWxsIHN1YnNldCBvZiBNYXJrZG93biBmb3IgaHlwZXJsaW5raW5nIGEgYmxvY2sgb2YgdGV4dCAqL1xyXG5jbGFzcyBMaW5rZG93blxyXG57XHJcbiAgICAvKiogUmVnZXggcGF0dGVybiBmb3IgbWF0Y2hpbmcgbGlua2VkIHRleHQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX0xJTksgPSAvXFxbKC4rPylcXF0vZ2k7XHJcbiAgICAvKiogUmVnZXggcGF0dGVybiBmb3IgbWF0Y2hpbmcgbGluayByZWZlcmVuY2VzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUdFWF9SRUYgID0gL1xcWyhcXGQrKVxcXTpcXHMrKFxcUyspL2dpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGFyc2VzIHRoZSB0ZXh0IG9mIHRoZSBnaXZlbiBibG9jayBhcyBMaW5rZG93biwgY29udmVydGluZyB0YWdnZWQgdGV4dCBpbnRvIGxpbmtzXHJcbiAgICAgKiB1c2luZyBhIGdpdmVuIGxpc3Qgb2YgaW5kZXgtYmFzZWQgcmVmZXJlbmNlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gYmxvY2sgRWxlbWVudCB3aXRoIHRleHQgdG8gcmVwbGFjZTsgYWxsIGNoaWxkcmVuIGNsZWFyZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZShibG9jazogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBsaW5rcyA6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBnZXQgdGhlIGxpc3Qgb2YgcmVmZXJlbmNlcywgcmVtb3ZpbmcgdGhlbSBmcm9tIHRoZSB0ZXh0XHJcbiAgICAgICAgbGV0IGlkeCAgPSAwO1xyXG4gICAgICAgIGxldCB0ZXh0ID0gYmxvY2suaW5uZXJUZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9SRUYsIChfLCBrLCB2KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGlua3NbIHBhcnNlSW50KGspIF0gPSB2O1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFRoZW4sIHJlcGxhY2UgZWFjaCB0YWdnZWQgcGFydCBvZiB0ZXh0IHdpdGggYSBsaW5rIGVsZW1lbnRcclxuICAgICAgICBibG9jay5pbm5lckhUTUwgPSB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9MSU5LLCAoXywgdCkgPT5cclxuICAgICAgICAgICAgYDxhIGhyZWY9JyR7bGlua3NbaWR4KytdfScgdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9vcGVuZXJcIj4ke3R9PC9hPmBcclxuICAgICAgICApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBwYXJzaW5nIGRhdGEgZnJvbSBzdHJpbmdzICovXHJcbmNsYXNzIFBhcnNlXHJcbntcclxuICAgIC8qKiBQYXJzZXMgYSBnaXZlbiBzdHJpbmcgaW50byBhIGJvb2xlYW4gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYm9vbGVhbihzdHI6IHN0cmluZykgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgc3RyID0gc3RyLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIGlmIChzdHIgPT09ICd0cnVlJyB8fCBzdHIgPT09ICcxJylcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgaWYgKHN0ciA9PT0gJ2ZhbHNlJyB8fCBzdHIgPT09ICcwJylcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICB0aHJvdyBFcnJvciggTC5CQURfQk9PTEVBTihzdHIpICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGdlbmVyYXRpbmcgcmFuZG9tIGRhdGEgKi9cclxuY2xhc3MgUmFuZG9tXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gaW50ZWdlciBmcm9tIHRoZSBnaXZlbiByYW5nZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gaW50ZWdlciB0byBwaWNrLCBpbmNsdXNpdmVcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBpbnRlZ2VyIHRvIHBpY2ssIGluY2x1c2l2ZVxyXG4gICAgICogQHJldHVybnMgUmFuZG9tIGludGVnZXIgd2l0aGluIHRoZSBnaXZlbiByYW5nZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGludChtaW46IG51bWJlciA9IDAsIG1heDogbnVtYmVyID0gMSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5mbG9vciggTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4pICkgKyBtaW47XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5LWxpa2Ugb2JqZWN0IHdpdGggYSBsZW5ndGggcHJvcGVydHkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXJyYXkoYXJyOiBMZW5ndGhhYmxlKSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBhcnJbIFJhbmRvbS5pbnQoMCwgYXJyLmxlbmd0aCkgXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3BsaWNlcyBhIHJhbmRvbSBlbGVtZW50IGZyb20gYSBnaXZlbiBhcnJheSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhcnJheVNwbGljZTxUPihhcnI6IFRbXSkgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGFyci5zcGxpY2UoUmFuZG9tLmludCgwLCBhcnIubGVuZ3RoKSwgMSlbMF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGtleSBmcm9tIGEgZ2l2ZW4gb2JqZWN0ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG9iamVjdEtleShvYmo6IHt9KSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkoIE9iamVjdC5rZXlzKG9iaikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIHRydWUgb3IgZmFsc2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNoYW5jZSBDaGFuY2Ugb3V0IG9mIDEwMCwgdG8gcGljayBgdHJ1ZWBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sKGNoYW5jZTogbnVtYmVyID0gNTApIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uaW50KDAsIDEwMCkgPCBjaGFuY2U7XHJcbiAgICB9XHJcbn1cclxuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBkZWFsaW5nIHdpdGggc3RyaW5ncyAqL1xyXG5jbGFzcyBTdHJpbmdzXHJcbntcclxuICAgIC8qKiBDaGVja3MgaWYgdGhlIGdpdmVuIHN0cmluZyBpcyBudWxsLCBvciBlbXB0eSAod2hpdGVzcGFjZSBvbmx5IG9yIHplcm8tbGVuZ3RoKSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpc051bGxPckVtcHR5KHN0cjogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuICFzdHIgfHwgIXN0ci50cmltKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQcmV0dHktcHJpbnQncyBhIGdpdmVuIGxpc3Qgb2Ygc3RhdGlvbnMsIHdpdGggY29udGV4dCBzZW5zaXRpdmUgZXh0cmFzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlcyBMaXN0IG9mIHN0YXRpb24gY29kZXMgdG8gam9pblxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgTGlzdCdzIGNvbnRleHQuIElmICdjYWxsaW5nJywgaGFuZGxlcyBzcGVjaWFsIGNhc2VcclxuICAgICAqIEByZXR1cm5zIFByZXR0eS1wcmludGVkIGxpc3Qgb2YgZ2l2ZW4gc3RhdGlvbnNcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tU3RhdGlvbkxpc3QoY29kZXM6IHN0cmluZ1tdLCBjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9ICcnO1xyXG4gICAgICAgIGxldCBuYW1lcyAgPSBjb2Rlcy5zbGljZSgpO1xyXG5cclxuICAgICAgICBuYW1lcy5mb3JFYWNoKCAoYywgaSkgPT4gbmFtZXNbaV0gPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjLCB0cnVlKSApO1xyXG5cclxuICAgICAgICBpZiAobmFtZXMubGVuZ3RoID09PSAxKVxyXG4gICAgICAgICAgICByZXN1bHQgPSAoY29udGV4dCA9PT0gJ2NhbGxpbmcnKVxyXG4gICAgICAgICAgICAgICAgPyBgJHtuYW1lc1swXX0gb25seWBcclxuICAgICAgICAgICAgICAgIDogbmFtZXNbMF07XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGxhc3RTdGF0aW9uID0gbmFtZXMucG9wKCk7XHJcblxyXG4gICAgICAgICAgICByZXN1bHQgID0gbmFtZXMuam9pbignLCAnKTtcclxuICAgICAgICAgICAgcmVzdWx0ICs9IGAgYW5kICR7bGFzdFN0YXRpb259YDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQcmV0dHktcHJpbnRzIHRoZSBnaXZlbiBkYXRlIG9yIGhvdXJzIGFuZCBtaW51dGVzIGludG8gYSAyNC1ob3VyIHRpbWUgKGUuZy4gMDE6MDkpLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBob3VycyBIb3VycywgZnJvbSAwIHRvIDIzLCBvciBEYXRlIG9iamVjdFxyXG4gICAgICogQHBhcmFtIG1pbnV0ZXMgTWludXRlcywgZnJvbSAwIHRvIDU5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZnJvbVRpbWUoaG91cnM6IG51bWJlciB8IERhdGUsIG1pbnV0ZXM6IG51bWJlciA9IDApIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGhvdXJzIGluc3RhbmNlb2YgRGF0ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG1pbnV0ZXMgPSBob3Vycy5nZXRNaW51dGVzKCk7XHJcbiAgICAgICAgICAgIGhvdXJzICAgPSBob3Vycy5nZXRIb3VycygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGhvdXJzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKSArICc6JyArXHJcbiAgICAgICAgICAgIG1pbnV0ZXMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbGVhbnMgdXAgdGhlIGdpdmVuIHRleHQgb2YgZXhjZXNzIHdoaXRlc3BhY2UgYW5kIGFueSBuZXdsaW5lcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjbGVhbih0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRleHQudHJpbSgpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFxuXFxyXS9naSwgJycpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHN7Mix9L2dpLCAnICcpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMoWy4sXSkvZ2ksICckMScpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVW5pb24gdHlwZSBmb3IgaXRlcmFibGUgdHlwZXMgd2l0aCBhIC5sZW5ndGggcHJvcGVydHkgKi9cclxudHlwZSBMZW5ndGhhYmxlID0gQXJyYXk8YW55PiB8IE5vZGVMaXN0IHwgSFRNTENvbGxlY3Rpb24gfCBzdHJpbmc7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHBsYXRmb3JtIGFzIGEgZGlnaXQgYW5kIG9wdGlvbmFsIGxldHRlciB0dXBsZSAqL1xyXG50eXBlIFBsYXRmb3JtID0gW3N0cmluZywgc3RyaW5nXTtcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgZ2VuZXJpYyBrZXktdmFsdWUgZGljdGlvbmFyeSwgd2l0aCBzdHJpbmcga2V5cyAqL1xyXG50eXBlIERpY3Rpb25hcnk8VD4gPSB7IFtpbmRleDogc3RyaW5nXTogVCB9O1xyXG5cclxuLyoqIERlZmluZXMgdGhlIGRhdGEgcmVmZXJlbmNlcyBjb25maWcgb2JqZWN0IHBhc3NlZCBpbnRvIFJBRy5tYWluIG9uIGluaXQgKi9cclxuaW50ZXJmYWNlIERhdGFSZWZzXHJcbntcclxuICAgIC8qKiBTZWxlY3RvciBmb3IgZ2V0dGluZyB0aGUgcGhyYXNlIHNldCBYTUwgSUZyYW1lIGVsZW1lbnQgKi9cclxuICAgIHBocmFzZXNldEVtYmVkIDogc3RyaW5nO1xyXG4gICAgLyoqIFJhdyBhcnJheSBvZiBleGN1c2VzIGZvciB0cmFpbiBkZWxheXMgb3IgY2FuY2VsbGF0aW9ucyB0byB1c2UgKi9cclxuICAgIGV4Y3VzZXNEYXRhICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIG5hbWVzIGZvciBzcGVjaWFsIHRyYWlucyB0byB1c2UgKi9cclxuICAgIG5hbWVkRGF0YSAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIG5hbWVzIGZvciBzZXJ2aWNlcy9uZXR3b3JrcyB0byB1c2UgKi9cclxuICAgIHNlcnZpY2VzRGF0YSAgIDogc3RyaW5nW107XHJcbiAgICAvKiogUmF3IGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBjb2RlcyBhbmQgbmFtZXMgdG8gdXNlICovXHJcbiAgICBzdGF0aW9uc0RhdGEgICA6IERpY3Rpb25hcnk8c3RyaW5nPjtcclxufVxyXG5cclxuLyoqIEZpbGwgaW4gZm9yIEVTMjAxNyBzdHJpbmcgcGFkZGluZyBtZXRob2RzICovXHJcbmludGVyZmFjZSBTdHJpbmdcclxue1xyXG4gICAgcGFkU3RhcnQodGFyZ2V0TGVuZ3RoOiBudW1iZXIsIHBhZFN0cmluZz86IHN0cmluZykgOiBzdHJpbmc7XHJcbiAgICBwYWRFbmQodGFyZ2V0TGVuZ3RoOiBudW1iZXIsIHBhZFN0cmluZz86IHN0cmluZykgOiBzdHJpbmc7XHJcbn1cclxuXHJcbi8qKiBGaWxsIGluIGZvciBFUzIwMTcgYXJyYXkgbWV0aG9kcyAqL1xyXG5pbnRlcmZhY2UgQXJyYXk8VD5cclxue1xyXG4gICAgaW5jbHVkZXMoc2VhcmNoRWxlbWVudDogVCwgZnJvbUluZGV4PzogbnVtYmVyKSA6IGJvb2xlYW47XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDdXN0b20gdm9pY2UgdGhhdCBzeW50aGVzaXplcyBzcGVlY2ggYnkgcGllY2luZyBwcmUtcmVjb3JkZWQgZmlsZXMgdG9nZXRoZXIgKi9cclxuY2xhc3MgQ3VzdG9tVm9pY2Vcclxue1xyXG4gICAgLyoqIE9ubHkgcHJlc2VudCBmb3IgY29uc2lzdGVuY3kgd2l0aCBTcGVlY2hTeW50aGVzaXNWb2ljZSAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRlZmF1bHQgICAgICA6IGJvb2xlYW47XHJcbiAgICAvKiogR2V0cyB0aGUgQkNQIDQ3IHRhZyBpbmRpY2F0aW5nIHRoZSBsYW5ndWFnZSBvZiB0aGlzIHZvaWNlICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgbGFuZyAgICAgICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIE9ubHkgcHJlc2VudCBmb3IgY29uc2lzdGVuY3kgd2l0aCBTcGVlY2hTeW50aGVzaXNWb2ljZSAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGxvY2FsU2VydmljZSA6IGJvb2xlYW47XHJcbiAgICAvKiogR2V0cyB0aGUgY2Fub25pY2FsIG5hbWUgb2YgdGhpcyB2b2ljZSAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IG5hbWUgICAgICAgICA6IHN0cmluZztcclxuICAgIC8qKiBHZXRzIHRoZSByZWxhdGl2ZSBVUkkgb2YgdGhpcyB2b2ljZSdzIGZpbGVzICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgdm9pY2VVUkkgICAgIDogc3RyaW5nO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIGxhbmc6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRlZmF1bHQgICAgICA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMubG9jYWxTZXJ2aWNlID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5uYW1lICAgICAgICAgPSBgUkFHLVZPWCAke25hbWV9YDtcclxuICAgICAgICB0aGlzLmxhbmcgICAgICAgICA9IGxhbmc7XHJcbiAgICAgICAgdGhpcy52b2ljZVVSSSAgICAgPSBgLi8ke25hbWV9XyR7bGFuZ30vYDtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgY2xhc3MgZm9yIHJlc29sdmluZyBhIGdpdmVuIHBocmFzZSBlbGVtZW50IHRvIGEgdm94IGtleSAqL1xyXG5jbGFzcyBSZXNvbHZlclxyXG57XHJcbiAgICAvKiogVHJlZVdhbGtlciBmaWx0ZXIgdG8gcmVkdWNlIGEgd2FsayB0byBqdXN0IHRoZSBlbGVtZW50cyB0aGUgcmVzb2x2ZXIgbmVlZHMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbm9kZUZpbHRlcihub2RlOiBOb2RlKTogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgICAgPSBub2RlLnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCBwYXJlbnRUeXBlID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuXHJcbiAgICAgICAgLy8gSWYgdHlwZSBpcyBtaXNzaW5nLCBwYXJlbnQgaXMgYSB3cmFwcGVyXHJcbiAgICAgICAgaWYgKCFwYXJlbnRUeXBlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcGFyZW50ICAgICA9IHBhcmVudC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICAgICAgcGFyZW50VHlwZSA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBPbmx5IGFjY2VwdCB0ZXh0IG5vZGVzIHdpdGggd29yZHMgaW4gdGhlbVxyXG4gICAgICAgICAgICBpZiAoICFub2RlLnRleHRDb250ZW50IS5tYXRjaCgvW2EtejAtOV0vaSkgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVDtcclxuXHJcbiAgICAgICAgICAgIC8vIEFjY2VwdCB0ZXh0IG9ubHkgZnJvbSBwaHJhc2UgYW5kIHBocmFzZXNldHNcclxuICAgICAgICAgICAgaWYgKHBhcmVudFR5cGUgIT09ICdwaHJhc2VzZXQnICYmIHBhcmVudFR5cGUgIT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5vZGUgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgICAgICAvLyBSZWplY3QgY29sbGFwc2VkIGVsZW1lbnRzIGFuZCB0aGVpciBjaGlsZHJlblxyXG4gICAgICAgICAgICBpZiAoIGVsZW1lbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCB0eXBlbGVzcyAod3JhcHBlcikgZWxlbWVudHNcclxuICAgICAgICAgICAgaWYgKCF0eXBlKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIG92ZXIgcGhyYXNlIGFuZCBwaHJhc2VzZXRzIChpbnN0ZWFkLCBvbmx5IGdvaW5nIGZvciB0aGVpciBjaGlsZHJlbilcclxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnIHx8IHR5cGUgPT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBLZWVwcyB0cmFjayBvZiBwaHJhc2VzJyB0ZXh0IG5vZGUgcmVsYXRpdmUgaW5kZXhlcyAqL1xyXG4gICAgcHJpdmF0ZSBwaHJhc2VJZHhzIDogRGljdGlvbmFyeTxudW1iZXI+ID0ge307XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVc2VzIHRoZSB0eXBlIGFuZCB2YWx1ZSBvZiB0aGUgZ2l2ZW4gbm9kZSwgdG8gcmVzb2x2ZSBpdCB0byB2b3ggZmlsZSBJRHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIG5vZGUgTm9kZSB0byByZXNvbHZlIHRvIHZveCBJRHNcclxuICAgICAqIEByZXR1cm5zIEFycmF5IG9mIElEcyB0aGF0IG1ha2UgdXAgb25lIG9yIG1vcmUgZmlsZSBJRHMuIENhbiBiZSBlbXB0eS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHJlc29sdmUobm9kZTogTm9kZSkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRleHQobm9kZSk7XHJcblxyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVzb2x2ZSB0ZXh0IG5vZGVzIGZyb20gcGhyYXNlcyBhbmQgcGhyYXNlc2V0cyB0byBJRCBzdHJpbmdzICovXHJcbiAgICBwcml2YXRlIHJlc29sdmVUZXh0KG5vZGU6IE5vZGUpIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ID0gbm9kZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgdHlwZSAgID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuXHJcbiAgICAgICAgLy8gSWYgdHlwZSBpcyBtaXNzaW5nLCBwYXJlbnQgaXMgYSB3cmFwcGVyXHJcbiAgICAgICAgaWYgKCF0eXBlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcGFyZW50ID0gcGFyZW50LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgICAgICB0eXBlICAgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHJlZiA9IHBhcmVudC5kYXRhc2V0WydyZWYnXTtcclxuICAgICAgICBsZXQgaWQgID0gYHBocmFzZS4ke3JlZn1gO1xyXG5cclxuICAgICAgICAvLyBBcHBlbmQgaW5kZXggb2YgcGhyYXNlc2V0J3MgY2hvaWNlIG9mIHBocmFzZVxyXG4gICAgICAgIGlmICh0eXBlID09PSAncGhyYXNlc2V0JylcclxuICAgICAgICAgICAgaWQgKz0gYC4ke3BhcmVudC5kYXRhc2V0WydpZHgnXX1gO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMucGhyYXNlSWR4c1tpZF0pXHJcbiAgICAgICAgICAgIHRoaXMucGhyYXNlSWR4c1tpZF0gPSAwO1xyXG5cclxuICAgICAgICBpZCArPSBgLiR7dGhpcy5waHJhc2VJZHhzW2lkXSsrfWA7XHJcblxyXG4gICAgICAgIHJldHVybiBbaWRdO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVHlwZSBkZWZpbml0aW9uIGZvciBzcGVlY2ggY29uZmlnIG92ZXJyaWRlcyBwYXNzZWQgdG8gdGhlIHNwZWFrIG1ldGhvZCAqL1xyXG5pbnRlcmZhY2UgU3BlZWNoU2V0dGluZ3Ncclxue1xyXG4gICAgLyoqIE92ZXJyaWRlIGNob2ljZSBvZiB2b2ljZSAqL1xyXG4gICAgdm9pY2VJZHg/IDogbnVtYmVyO1xyXG4gICAgLyoqIE92ZXJyaWRlIHZvbHVtZSBvZiB2b2ljZSAqL1xyXG4gICAgdm9sdW1lPyAgIDogbnVtYmVyO1xyXG4gICAgLyoqIE92ZXJyaWRlIHBpdGNoIG9mIHZvaWNlICovXHJcbiAgICBwaXRjaD8gICAgOiBudW1iZXI7XHJcbiAgICAvKiogT3ZlcnJpZGUgcmF0ZSBvZiB2b2ljZSAqL1xyXG4gICAgcmF0ZT8gICAgIDogbnVtYmVyO1xyXG59XHJcblxyXG4vKiogVW5pb24gdHlwZSBmb3IgYm90aCBraW5kcyBvZiB2b2ljZXMgYXZhaWxhYmxlICovXHJcbnR5cGUgVm9pY2UgPSBTcGVlY2hTeW50aGVzaXNWb2ljZSB8IEN1c3RvbVZvaWNlO1xyXG5cclxuLyoqIE1hbmFnZXMgc3BlZWNoIHN5bnRoZXNpcyBhbmQgd3JhcHMgYXJvdW5kIEhUTUw1IHNwZWVjaCBBUEkgKi9cclxuY2xhc3MgU3BlZWNoRW5naW5lXHJcbntcclxuICAgIC8qKiBBcnJheSBvZiBicm93c2VyLXByb3ZpZGVkIHZvaWNlcyBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgYnJvd3NlclZvaWNlcyA6IFNwZWVjaFN5bnRoZXNpc1ZvaWNlW10gPSBbXTtcclxuICAgIC8qKiBBcnJheSBvZiBjdXN0b20gcHJlLXJlY29yZGVkIHZvaWNlcyBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgY3VzdG9tVm9pY2VzICA6IEN1c3RvbVZvaWNlW10gICAgICAgICAgPSBbXTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFNvbWUgYnJvd3NlcnMgZG9uJ3QgcHJvcGVybHkgY2FuY2VsIHNwZWVjaCBvbiBwYWdlIGNsb3NlLlxyXG4gICAgICAgIC8vIEJVRzogb25wYWdlc2hvdyBhbmQgb25wYWdlaGlkZSBub3Qgd29ya2luZyBvbiBpT1MgMTFcclxuICAgICAgICB3aW5kb3cub25iZWZvcmV1bmxvYWQgPVxyXG4gICAgICAgIHdpbmRvdy5vbnVubG9hZCAgICAgICA9XHJcbiAgICAgICAgd2luZG93Lm9ucGFnZXNob3cgICAgID1cclxuICAgICAgICB3aW5kb3cub25wYWdlaGlkZSAgICAgPSB0aGlzLmNhbmNlbC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5vbnZpc2liaWxpdHljaGFuZ2UgICAgICAgICAgICA9IHRoaXMub25WaXNpYmlsaXR5Q2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5vbnZvaWNlc2NoYW5nZWQgPSB0aGlzLm9uVm9pY2VzQ2hhbmdlZC5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBFdmVuIHRob3VnaCAnb252b2ljZXNjaGFuZ2VkJyBpcyB1c2VkIGxhdGVyIHRvIHBvcHVsYXRlIHRoZSBsaXN0LCBDaHJvbWUgZG9lc1xyXG4gICAgICAgIC8vIG5vdCBhY3R1YWxseSBmaXJlIHRoZSBldmVudCB1bnRpbCB0aGlzIGNhbGwuLi5cclxuICAgICAgICB0aGlzLm9uVm9pY2VzQ2hhbmdlZCgpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBNYWtlIHRoaXMgYSBkeW5hbWljIHJlZ2lzdHJhdGlvbiBhbmQgY2hlY2sgZm9yIGZlYXR1cmVzXHJcbiAgICAgICAgdGhpcy5jdXN0b21Wb2ljZXMucHVzaCggbmV3IEN1c3RvbVZvaWNlKCdSb3knLCAnZW4tR0InKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIGFsbCB0aGUgdm9pY2VzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBnZXRWb2ljZXMoKSA6IFZvaWNlW11cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5jdXN0b21Wb2ljZXMuY29uY2F0KHRoaXMuYnJvd3NlclZvaWNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBzcGVha2luZyB0aGUgZ2l2ZW4gcGhyYXNlIGNvbXBvbmVudHMgKi9cclxuICAgIHB1YmxpYyBzcGVhayhwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MgPSB7fSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gUmVzZXQgdG8gZmlyc3Qgdm9pY2UsIGlmIGNvbmZpZ3VyZWQgY2hvaWNlIGlzIG1pc3NpbmdcclxuICAgICAgICBsZXQgdm9pY2VzICAgPSB0aGlzLmdldFZvaWNlcygpO1xyXG4gICAgICAgIGxldCB2b2ljZUlkeCA9IGVpdGhlcihzZXR0aW5ncy52b2ljZUlkeCwgUkFHLmNvbmZpZy52b3hDaG9pY2UpO1xyXG4gICAgICAgIGxldCB2b2ljZSAgICA9IHZvaWNlc1t2b2ljZUlkeF0gfHwgdm9pY2VzWzBdO1xyXG4gICAgICAgIGxldCBlbmdpbmUgICA9ICh2b2ljZSBpbnN0YW5jZW9mIEN1c3RvbVZvaWNlKVxyXG4gICAgICAgICAgICA/IHRoaXMuc3BlYWtDdXN0b20uYmluZCh0aGlzKVxyXG4gICAgICAgICAgICA6IHRoaXMuc3BlYWtCcm93c2VyLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIGVuZ2luZShwaHJhc2UsIHZvaWNlLCBzZXR0aW5ncyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIGFuZCBjYW5jZWxzIGFsbCBxdWV1ZWQgc3BlZWNoICovXHJcbiAgICBwdWJsaWMgY2FuY2VsKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5jYW5jZWwoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGF1c2UgYW5kIHVucGF1c2Ugc3BlZWNoIGlmIHRoZSBwYWdlIGlzIGhpZGRlbiBvciB1bmhpZGRlbiAqL1xyXG4gICAgcHJpdmF0ZSBvblZpc2liaWxpdHlDaGFuZ2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaGlkaW5nID0gKGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gJ2hpZGRlbicpO1xyXG5cclxuICAgICAgICBpZiAoaGlkaW5nKSB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnBhdXNlKCk7XHJcbiAgICAgICAgZWxzZSAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5yZXN1bWUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBhc3luYyB2b2ljZSBsaXN0IGxvYWRpbmcgb24gc29tZSBicm93c2VycywgYW5kIHNldHMgZGVmYXVsdCAqL1xyXG4gICAgcHJpdmF0ZSBvblZvaWNlc0NoYW5nZWQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmJyb3dzZXJWb2ljZXMgPSB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmdldFZvaWNlcygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIGdpdmVuIHBocmFzZSB0byB0ZXh0IGFuZCBzcGVha3MgaXQgdmlhIG5hdGl2ZSBicm93c2VyIHZvaWNlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGhyYXNlIFBocmFzZSBlbGVtZW50cyB0byBzcGVha1xyXG4gICAgICogQHBhcmFtIHZvaWNlIEJyb3dzZXIgdm9pY2UgdG8gdXNlXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgU2V0dGluZ3MgdG8gdXNlIGZvciB0aGUgdm9pY2VcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzcGVha0Jyb3dzZXIocGhyYXNlOiBIVE1MRWxlbWVudCwgdm9pY2U6IFZvaWNlLCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVGhlIHBocmFzZSB0ZXh0IGlzIHNwbGl0IGludG8gc2VudGVuY2VzLCBhcyBxdWV1ZWluZyBsYXJnZSBzZW50ZW5jZXMgdGhhdCBsYXN0XHJcbiAgICAgICAgLy8gbWFueSBzZWNvbmRzIGNhbiBicmVhayBzb21lIFRUUyBlbmdpbmVzIGFuZCBicm93c2Vycy5cclxuICAgICAgICBsZXQgdGV4dCAgPSBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHBocmFzZSk7XHJcbiAgICAgICAgbGV0IHBhcnRzID0gdGV4dC5zcGxpdCgvXFwuXFxzL2kpO1xyXG5cclxuICAgICAgICBSQUcuc3BlZWNoLmNhbmNlbCgpO1xyXG4gICAgICAgIHBhcnRzLmZvckVhY2goIChzZWdtZW50LCBpZHgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBBZGQgbWlzc2luZyBmdWxsIHN0b3AgdG8gZWFjaCBzZW50ZW5jZSBleGNlcHQgdGhlIGxhc3QsIHdoaWNoIGhhcyBpdFxyXG4gICAgICAgICAgICBpZiAoaWR4IDwgcGFydHMubGVuZ3RoIC0gMSlcclxuICAgICAgICAgICAgICAgIHNlZ21lbnQgKz0gJy4nO1xyXG5cclxuICAgICAgICAgICAgbGV0IHV0dGVyYW5jZSA9IG5ldyBTcGVlY2hTeW50aGVzaXNVdHRlcmFuY2Uoc2VnbWVudCk7XHJcblxyXG4gICAgICAgICAgICB1dHRlcmFuY2Uudm9pY2UgID0gdm9pY2U7XHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS52b2x1bWUgPSBlaXRoZXIoc2V0dGluZ3Mudm9sdW1lLCBSQUcuY29uZmlnLnZveFZvbHVtZSk7XHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS5waXRjaCAgPSBlaXRoZXIoc2V0dGluZ3MucGl0Y2gsICBSQUcuY29uZmlnLnZveFBpdGNoKTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnJhdGUgICA9IGVpdGhlcihzZXR0aW5ncy5yYXRlLCAgIFJBRy5jb25maWcudm94UmF0ZSk7XHJcblxyXG4gICAgICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFrKHV0dGVyYW5jZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTeW50aGVzaXplcyB2b2ljZSBieSB3YWxraW5nIHRocm91Z2ggdGhlIGdpdmVuIHBocmFzZSBlbGVtZW50cywgcmVzb2x2aW5nIHBhcnRzIHRvXHJcbiAgICAgKiBzb3VuZCBmaWxlcyBieSBJRCwgYW5kIHBpZWNpbmcgdG9nZXRoZXIgdGhlIHNvdW5kIGZpbGVzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwaHJhc2UgUGhyYXNlIGVsZW1lbnRzIHRvIHNwZWFrXHJcbiAgICAgKiBAcGFyYW0gdm9pY2UgQ3VzdG9tIHZvaWNlIHRvIHVzZVxyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFNldHRpbmdzIHRvIHVzZSBmb3IgdGhlIHZvaWNlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3BlYWtDdXN0b20ocGhyYXNlOiBIVE1MRWxlbWVudCwgXzogVm9pY2UsIF9fOiBTcGVlY2hTZXR0aW5ncylcclxuICAgIHtcclxuICAgICAgICAvLyBUT0RPOiB1c2Ugdm9sdW1lIHNldHRpbmdzXHJcbiAgICAgICAgbGV0IGNsaXBzICAgICAgPSBbXTtcclxuICAgICAgICBsZXQgcmVzb2x2ZXIgICA9IG5ldyBSZXNvbHZlcigpO1xyXG4gICAgICAgIGxldCB0cmVlV2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgcGhyYXNlLFxyXG4gICAgICAgICAgICBOb2RlRmlsdGVyLlNIT1dfVEVYVCB8IE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5ULFxyXG4gICAgICAgICAgICB7IGFjY2VwdE5vZGU6IFJlc29sdmVyLm5vZGVGaWx0ZXIgfSxcclxuICAgICAgICAgICAgZmFsc2VcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB3aGlsZSAoIHRyZWVXYWxrZXIubmV4dE5vZGUoKSApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcclxuICAgICAgICAgICAgICAgIHJlc29sdmVyLnJlc29sdmUodHJlZVdhbGtlci5jdXJyZW50Tm9kZSksXHJcbiAgICAgICAgICAgICAgICBTdHJpbmdzLmNsZWFuKCB0cmVlV2Fsa2VyLmN1cnJlbnROb2RlLnRleHRDb250ZW50ISApXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogSG9sZHMgcnVudGltZSBjb25maWd1cmF0aW9uICovXHJcbmNsYXNzIENvbmZpZ1xyXG57XHJcbiAgICAvKiogVm9sdW1lIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgIHZveFZvbHVtZSAgICAgIDogbnVtYmVyID0gMS4wO1xyXG4gICAgLyoqIFBpdGNoIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgIHZveFBpdGNoICAgICAgIDogbnVtYmVyID0gMS4wO1xyXG4gICAgLyoqIFJhdGUgZm9yIHNwZWVjaCB0byBiZSBzZXQgYXQgKi9cclxuICAgIHB1YmxpYyAgdm94UmF0ZSAgICAgICAgOiBudW1iZXIgPSAxLjA7XHJcbiAgICAvKiogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UsIGFzIGdldFZvaWNlcyBpbmRleCBvciAtMSBpZiB1bnNldCAqL1xyXG4gICAgcHJpdmF0ZSBfdm94Q2hvaWNlICAgICA6IG51bWJlciA9IC0xO1xyXG4gICAgLyoqIElmIHVzZXIgaGFzIGNsaWNrZWQgc2h1ZmZsZSBhdCBsZWFzdCBvbmNlICovXHJcbiAgICBwdWJsaWMgY2xpY2tlZEdlbmVyYXRlIDogYm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UsIGFzIGdldFZvaWNlcyBpbmRleC4gQmVjYXVzZSBvZiB0aGUgYXN5bmMgbmF0dXJlIG9mXHJcbiAgICAgKiBnZXRWb2ljZXMsIHRoZSBkZWZhdWx0IHZhbHVlIHdpbGwgYmUgZmV0Y2hlZCBmcm9tIGl0IGVhY2ggdGltZS5cclxuICAgICAqL1xyXG4gICAgZ2V0IHZveENob2ljZSgpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVE9ETzogdGhpcyBpcyBwcm9iYWJseSBiZXR0ZXIgb2ZmIHVzaW5nIHZvaWNlIG5hbWVzXHJcbiAgICAgICAgLy8gSWYgdGhlcmUncyBhIHVzZXItZGVmaW5lZCB2YWx1ZSwgdXNlIHRoYXRcclxuICAgICAgICBpZiAgKHRoaXMuX3ZveENob2ljZSAhPT0gLTEpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl92b3hDaG9pY2U7XHJcblxyXG4gICAgICAgIC8vIFNlbGVjdCBFbmdsaXNoIHZvaWNlcyBieSBkZWZhdWx0XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIHYgPSBSQUcuc3BlZWNoLmdldFZvaWNlcygpOyBpIDwgdi5sZW5ndGggOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFuZyA9IHZbaV0ubGFuZztcclxuXHJcbiAgICAgICAgICAgIGlmIChsYW5nID09PSAnZW4tR0InIHx8IGxhbmcgPT09ICdlbi1VUycpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEVsc2UsIGZpcnN0IHZvaWNlIG9uIHRoZSBsaXN0XHJcbiAgICAgICAgcmV0dXJuIDA7XHJcbiAgICB9XHJcblxyXG4gICAgc2V0IHZveENob2ljZSh2YWx1ZTogbnVtYmVyKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3ZveENob2ljZSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgbG9hZHMgcnVudGltZSBjb25maWd1cmF0aW9uIGZyb20gbG9jYWxTdG9yYWdlLCBpZiBhbnkgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcihsb2FkOiBib29sZWFuKVxyXG4gICAge1xyXG4gICAgICAgIGlmICghbG9hZCB8fCAhd2luZG93LmxvY2FsU3RvcmFnZVsnc2V0dGluZ3MnXSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjb25maWcgPSBKU09OLnBhcnNlKHdpbmRvdy5sb2NhbFN0b3JhZ2VbJ3NldHRpbmdzJ10pO1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIGNvbmZpZyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX0xPQURfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgc2F2ZXMgcnVudGltZSBjb25maWd1cmF0aW9uIHRvIGxvY2FsU3RvcmFnZSAqL1xyXG4gICAgcHVibGljIHNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2VbJ3NldHRpbmdzJ10gPSBKU09OLnN0cmluZ2lmeSh0aGlzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfU0FWRV9GQUlMKGUubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBkZWxldGVzIHJ1bnRpbWUgY29uZmlndXJhdGlvbiBmcm9tIGxvY2FsU3RvcmFnZSBhbmQgcmVzZXRzIHN0YXRlICovXHJcbiAgICBwdWJsaWMgcmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oIHRoaXMsIG5ldyBDb25maWcoZmFsc2UpICk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnc2V0dGluZ3MnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfUkVTRVRfRkFJTChlLm1lc3NhZ2UpICk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBkYXRhIGZvciBleGN1c2VzLCB0cmFpbnMsIHNlcnZpY2VzIGFuZCBzdGF0aW9ucyAqL1xyXG5jbGFzcyBEYXRhYmFzZVxyXG57XHJcbiAgICAvKiogTG9hZGVkIGRhdGFzZXQgb2YgZGVsYXkgb3IgY2FuY2VsbGF0aW9uIGV4Y3VzZXMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZXhjdXNlcyAgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIG5hbWVkIHRyYWlucyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBuYW1lZCAgICAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRhdGFzZXQgb2Ygc2VydmljZSBvciBuZXR3b3JrIG5hbWVzICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHNlcnZpY2VzICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGljdGlvbmFyeSBvZiBzdGF0aW9uIG5hbWVzLCB3aXRoIHRocmVlLWxldHRlciBjb2RlIGtleXMgKGUuZy4gQUJDKSAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzdGF0aW9ucyAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+O1xyXG4gICAgLyoqIExvYWRlZCBYTUwgZG9jdW1lbnQgY29udGFpbmluZyBwaHJhc2VzZXQgZGF0YSAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBwaHJhc2VzZXRzICAgIDogRG9jdW1lbnQ7XHJcbiAgICAvKiogQW1vdW50IG9mIHN0YXRpb25zIGluIHRoZSBjdXJyZW50bHkgbG9hZGVkIGRhdGFzZXQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc3RhdGlvbnNDb3VudCA6IG51bWJlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoZGF0YVJlZnM6IERhdGFSZWZzKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBxdWVyeSAgPSBkYXRhUmVmcy5waHJhc2VzZXRFbWJlZDtcclxuICAgICAgICBsZXQgaWZyYW1lID0gRE9NLnJlcXVpcmUgPEhUTUxJRnJhbWVFbGVtZW50PiAocXVlcnkpO1xyXG5cclxuICAgICAgICBpZiAoIWlmcmFtZS5jb250ZW50RG9jdW1lbnQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX0VMRU1FTlRfTk9UX1BIUkFTRVNFVF9JRlJBTUUocXVlcnkpICk7XHJcblxyXG4gICAgICAgIHRoaXMucGhyYXNlc2V0cyAgICA9IGlmcmFtZS5jb250ZW50RG9jdW1lbnQ7XHJcbiAgICAgICAgdGhpcy5leGN1c2VzICAgICAgID0gZGF0YVJlZnMuZXhjdXNlc0RhdGE7XHJcbiAgICAgICAgdGhpcy5uYW1lZCAgICAgICAgID0gZGF0YVJlZnMubmFtZWREYXRhO1xyXG4gICAgICAgIHRoaXMuc2VydmljZXMgICAgICA9IGRhdGFSZWZzLnNlcnZpY2VzRGF0YTtcclxuICAgICAgICB0aGlzLnN0YXRpb25zICAgICAgPSBkYXRhUmVmcy5zdGF0aW9uc0RhdGE7XHJcbiAgICAgICAgdGhpcy5zdGF0aW9uc0NvdW50ID0gT2JqZWN0LmtleXModGhpcy5zdGF0aW9ucykubGVuZ3RoO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygnW0RhdGFiYXNlXSBFbnRyaWVzIGxvYWRlZDonKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFx0RXhjdXNlczonLCAgICAgIHRoaXMuZXhjdXNlcy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHROYW1lZCB0cmFpbnM6JywgdGhpcy5uYW1lZC5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRTZXJ2aWNlczonLCAgICAgdGhpcy5zZXJ2aWNlcy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRTdGF0aW9uczonLCAgICAgdGhpcy5zdGF0aW9uc0NvdW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gZXhjdXNlIGZvciBhIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiAqL1xyXG4gICAgcHVibGljIHBpY2tFeGN1c2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5leGN1c2VzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGlja3MgYSByYW5kb20gbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBwaWNrTmFtZWQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5uYW1lZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgYW5kIGdldHMgcGhyYXNlIHdpdGggdGhlIGdpdmVuIElELCBvciBudWxsIGlmIGl0IGRvZXNuJ3QgZXhpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkIElEIG9mIHRoZSBwaHJhc2UgdG8gZ2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2UoaWQ6IHN0cmluZykgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gdGhpcy5waHJhc2VzZXRzLnF1ZXJ5U2VsZWN0b3IoJ3BocmFzZSMnICsgaWQpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAocmVzdWx0KVxyXG4gICAgICAgICAgICByZXN1bHQgPSByZXN1bHQuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhIHBocmFzZXNldCB3aXRoIHRoZSBnaXZlbiBJRCwgb3IgbnVsbCBpZiBpdCBkb2Vzbid0IGV4aXN0LiBOb3RlIHRoYXQgdGhlXHJcbiAgICAgKiByZXR1cm5lZCBwaHJhc2VzZXQgY29tZXMgZnJvbSB0aGUgWE1MIGRvY3VtZW50LCBzbyBpdCBzaG91bGQgbm90IGJlIG11dGF0ZWQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkIElEIG9mIHRoZSBwaHJhc2VzZXQgdG8gZ2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2VzZXQoaWQ6IHN0cmluZykgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5waHJhc2VzZXRzLnF1ZXJ5U2VsZWN0b3IoJ3BocmFzZXNldCMnICsgaWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSByYWlsIG5ldHdvcmsgbmFtZSAqL1xyXG4gICAgcHVibGljIHBpY2tTZXJ2aWNlKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gUmFuZG9tLmFycmF5KHRoaXMuc2VydmljZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gc3RhdGlvbiBjb2RlIGZyb20gdGhlIGRhdGFzZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGUgTGlzdCBvZiBjb2RlcyB0byBleGNsdWRlLiBNYXkgYmUgaWdub3JlZCBpZiBzZWFyY2ggdGFrZXMgdG9vIGxvbmcuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBwaWNrU3RhdGlvbkNvZGUoZXhjbHVkZT86IHN0cmluZ1tdKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIC8vIEdpdmUgdXAgZmluZGluZyByYW5kb20gc3RhdGlvbiB0aGF0J3Mgbm90IGluIHRoZSBnaXZlbiBsaXN0LCBpZiB3ZSB0cnkgbW9yZVxyXG4gICAgICAgIC8vIHRpbWVzIHRoZW4gdGhlcmUgYXJlIHN0YXRpb25zLiBJbmFjY3VyYXRlLCBidXQgYXZvaWRzIGluZmluaXRlIGxvb3BzLlxyXG4gICAgICAgIGlmIChleGNsdWRlKSBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc3RhdGlvbnNDb3VudDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHZhbHVlID0gUmFuZG9tLm9iamVjdEtleSh0aGlzLnN0YXRpb25zKTtcclxuXHJcbiAgICAgICAgICAgIGlmICggIWV4Y2x1ZGUuaW5jbHVkZXModmFsdWUpIClcclxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgc3RhdGlvbiBuYW1lIGZyb20gdGhlIGdpdmVuIHRocmVlIGxldHRlciBjb2RlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gZ2V0IHRoZSBuYW1lIG9mXHJcbiAgICAgKiBAcGFyYW0gZmlsdGVyZWQgV2hldGhlciB0byBmaWx0ZXIgb3V0IHBhcmVudGhlc2l6ZWQgbG9jYXRpb24gY29udGV4dFxyXG4gICAgICogQHJldHVybnMgU3RhdGlvbiBuYW1lIGZvciB0aGUgZ2l2ZW4gY29kZSwgZmlsdGVyZWQgaWYgc3BlY2lmaWVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uKGNvZGU6IHN0cmluZywgZmlsdGVyZWQ6IGJvb2xlYW4gPSBmYWxzZSkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IHRoaXMuc3RhdGlvbnNbY29kZV07XHJcblxyXG4gICAgICAgIGlmICAgICAgKCFzdGF0aW9uKVxyXG4gICAgICAgICAgICByZXR1cm4gTC5EQl9VTktOT1dOX1NUQVRJT04oY29kZSk7XHJcbiAgICAgICAgZWxzZSBpZiAoIFN0cmluZ3MuaXNOdWxsT3JFbXB0eShzdGF0aW9uKSApXHJcbiAgICAgICAgICAgIHJldHVybiBMLkRCX0VNUFRZX1NUQVRJT04oY29kZSk7XHJcblxyXG4gICAgICAgIGlmIChmaWx0ZXJlZClcclxuICAgICAgICAgICAgc3RhdGlvbiA9IHN0YXRpb24ucmVwbGFjZSgvXFwoLitcXCkvaSwgJycpLnRyaW0oKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHN0YXRpb247XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSByYW5nZSBvZiBzdGF0aW9uIGNvZGVzLCBlbnN1cmluZyB0aGVyZSBhcmUgbm8gZHVwbGljYXRlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gYW1vdW50IG9mIHN0YXRpb25zIHRvIHBpY2tcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBhbW91bnQgb2Ygc3RhdGlvbnMgdG8gcGlja1xyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGVcclxuICAgICAqIEByZXR1cm5zIEEgbGlzdCBvZiB1bmlxdWUgc3RhdGlvbiBuYW1lc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcGlja1N0YXRpb25Db2RlcyhtaW4gPSAxLCBtYXggPSAxNiwgZXhjbHVkZT8gOiBzdHJpbmdbXSkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChtYXggLSBtaW4gPiBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX1RPT19NQU5ZX1NUQVRJT05TKCkgKTtcclxuXHJcbiAgICAgICAgbGV0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICAgICAgbGV0IGxlbmd0aCA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIGxldCB0cmllcyAgPSAwO1xyXG5cclxuICAgICAgICB3aGlsZSAocmVzdWx0Lmxlbmd0aCA8IGxlbmd0aClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgLy8gR2l2ZSB1cCB0cnlpbmcgdG8gYXZvaWQgZHVwbGljYXRlcywgaWYgd2UgdHJ5IG1vcmUgdGltZXMgdGhhbiB0aGVyZSBhcmVcclxuICAgICAgICAgICAgLy8gc3RhdGlvbnMgYXZhaWxhYmxlLiBJbmFjY3VyYXRlLCBidXQgZ29vZCBlbm91Z2guXHJcbiAgICAgICAgICAgIGlmICh0cmllcysrID49IHRoaXMuc3RhdGlvbnNDb3VudClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBnaXZlbiBhbiBleGNsdXNpb24gbGlzdCwgY2hlY2sgYWdhaW5zdCBib3RoIHRoYXQgYW5kIHJlc3VsdHNcclxuICAgICAgICAgICAgZWxzZSBpZiAoIGV4Y2x1ZGUgJiYgIWV4Y2x1ZGUuaW5jbHVkZXMoa2V5KSAmJiAhcmVzdWx0LmluY2x1ZGVzKGtleSkgKVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIG5vdCwganVzdCBjaGVjayB3aGF0IHJlc3VsdHMgd2UndmUgYWxyZWFkeSBmb3VuZFxyXG4gICAgICAgICAgICBlbHNlIGlmICggIWV4Y2x1ZGUgJiYgIXJlc3VsdC5pbmNsdWRlcyhrZXkpIClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFpbiBjbGFzcyBvZiB0aGUgZW50aXJlIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IgYXBwbGljYXRpb24gKi9cclxuY2xhc3MgUkFHXHJcbntcclxuICAgIC8qKiBHZXRzIHRoZSBjb25maWd1cmF0aW9uIGhvbGRlciAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb25maWcgICA6IENvbmZpZztcclxuICAgIC8qKiBHZXRzIHRoZSBkYXRhYmFzZSBtYW5hZ2VyLCB3aGljaCBob2xkcyBwaHJhc2UsIHN0YXRpb24gYW5kIHRyYWluIGRhdGEgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZGF0YWJhc2UgOiBEYXRhYmFzZTtcclxuICAgIC8qKiBHZXRzIHRoZSBwaHJhc2UgbWFuYWdlciwgd2hpY2ggZ2VuZXJhdGVzIEhUTUwgcGhyYXNlcyBmcm9tIFhNTCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VyICA6IFBocmFzZXI7XHJcbiAgICAvKiogR2V0cyB0aGUgc3BlZWNoIGVuZ2luZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzcGVlY2ggICA6IFNwZWVjaEVuZ2luZTtcclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHRyYWluIGFuZCBzdGF0aW9uIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRlICAgIDogU3RhdGU7XHJcbiAgICAvKiogR2V0cyB0aGUgdmlldyBjb250cm9sbGVyLCB3aGljaCBtYW5hZ2VzIFVJIGludGVyYWN0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZpZXdzICAgIDogVmlld3M7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFbnRyeSBwb2ludCBmb3IgUkFHLCB0byBiZSBjYWxsZWQgZnJvbSBKYXZhc2NyaXB0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBkYXRhUmVmcyBDb25maWd1cmF0aW9uIG9iamVjdCwgd2l0aCByYWlsIGRhdGEgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbWFpbihkYXRhUmVmczogRGF0YVJlZnMpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5vbmVycm9yID0gZXJyb3IgPT4gUkFHLnBhbmljKGVycm9yKTtcclxuXHJcbiAgICAgICAgSTE4bi5pbml0KCk7XHJcblxyXG4gICAgICAgIFJBRy5jb25maWcgICA9IG5ldyBDb25maWcodHJ1ZSk7XHJcbiAgICAgICAgUkFHLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlKGRhdGFSZWZzKTtcclxuICAgICAgICBSQUcudmlld3MgICAgPSBuZXcgVmlld3MoKTtcclxuICAgICAgICBSQUcucGhyYXNlciAgPSBuZXcgUGhyYXNlcigpO1xyXG4gICAgICAgIFJBRy5zcGVlY2ggICA9IG5ldyBTcGVlY2hFbmdpbmUoKTtcclxuXHJcbiAgICAgICAgLy8gQmVnaW5cclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLldFTENPTUUoKSApO1xyXG4gICAgICAgIFJBRy5nZW5lcmF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZW5lcmF0ZXMgYSBuZXcgcmFuZG9tIHBocmFzZSBhbmQgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2VuZXJhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUgPSBuZXcgU3RhdGUoKTtcclxuICAgICAgICBSQUcuc3RhdGUuZ2VuRGVmYXVsdFN0YXRlKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5nZW5lcmF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBMb2FkcyBzdGF0ZSBmcm9tIGdpdmVuIEpTT04gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbG9hZChqc29uOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZSA9IE9iamVjdC5hc3NpZ24oIG5ldyBTdGF0ZSgpLCBKU09OLnBhcnNlKGpzb24pICkgYXMgU3RhdGU7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5nZW5lcmF0ZSgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9GUk9NX1NUT1JBR0UoKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHbG9iYWwgZXJyb3IgaGFuZGxlcjsgdGhyb3dzIHVwIGEgYmlnIHJlZCBwYW5pYyBzY3JlZW4gb24gdW5jYXVnaHQgZXJyb3IgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHBhbmljKGVycm9yOiBzdHJpbmcgfCBFdmVudCA9IFwiVW5rbm93biBlcnJvclwiKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBtc2cgPSAnPGRpdiBpZD1cInBhbmljU2NyZWVuXCIgY2xhc3M9XCJ3YXJuaW5nU2NyZWVuXCI+JztcclxuICAgICAgICBtc2cgICAgKz0gJzxoMT5cIldlIGFyZSBzb3JyeSB0byBhbm5vdW5jZSB0aGF0Li4uXCI8L2gxPic7XHJcbiAgICAgICAgbXNnICAgICs9IGA8cD5SQUcgaGFzIGNyYXNoZWQgYmVjYXVzZTogPGNvZGU+JHtlcnJvcn08L2NvZGU+LjwvcD5gO1xyXG4gICAgICAgIG1zZyAgICArPSBgPHA+UGxlYXNlIG9wZW4gdGhlIGNvbnNvbGUgZm9yIG1vcmUgaW5mb3JtYXRpb24uPC9wPmA7XHJcbiAgICAgICAgbXNnICAgICs9ICc8L2Rpdj4nO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5ib2R5LmlubmVySFRNTCA9IG1zZztcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIERpc3Bvc2FibGUgY2xhc3MgdGhhdCBob2xkcyBzdGF0ZSBmb3IgdGhlIGN1cnJlbnQgc2NoZWR1bGUsIHRyYWluLCBldGMuICovXHJcbmNsYXNzIFN0YXRlXHJcbntcclxuICAgIC8qKiBTdGF0ZSBvZiBjb2xsYXBzaWJsZSBlbGVtZW50cy4gS2V5IGlzIHJlZmVyZW5jZSBJRCwgdmFsdWUgaXMgY29sbGFwc2VkLiAqL1xyXG4gICAgcHJpdmF0ZSBfY29sbGFwc2libGVzIDogRGljdGlvbmFyeTxib29sZWFuPiAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IGNvYWNoIGxldHRlciBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgbGV0dGVyLiAqL1xyXG4gICAgcHJpdmF0ZSBfY29hY2hlcyAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IGludGVnZXIgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGludGVnZXIuICovXHJcbiAgICBwcml2YXRlIF9pbnRlZ2VycyAgICAgOiBEaWN0aW9uYXJ5PG51bWJlcj4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgcGhyYXNlc2V0IHBocmFzZSBjaG9pY2VzLiBLZXkgaXMgcmVmZXJlbmNlIElELCB2YWx1ZSBpcyBpbmRleC4gKi9cclxuICAgIHByaXZhdGUgX3BocmFzZXNldHMgICA6IERpY3Rpb25hcnk8bnVtYmVyPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzZXJ2aWNlIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBzZXJ2aWNlLiAqL1xyXG4gICAgcHJpdmF0ZSBfc2VydmljZXMgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHN0YXRpb24gY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIHN0YXRpb24gY29kZS4gKi9cclxuICAgIHByaXZhdGUgX3N0YXRpb25zICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzdGF0aW9uIGxpc3QgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGFycmF5IG9mIGNvZGVzLiAqL1xyXG4gICAgcHJpdmF0ZSBfc3RhdGlvbkxpc3RzIDogRGljdGlvbmFyeTxzdHJpbmdbXT4gPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHRpbWUgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIHRpbWUuICovXHJcbiAgICBwcml2YXRlIF90aW1lcyAgICAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG5cclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIGV4Y3VzZSAqL1xyXG4gICAgcHJpdmF0ZSBfZXhjdXNlPyAgIDogc3RyaW5nO1xyXG4gICAgLyoqIEN1cnJlbnRseSBjaG9zZW4gcGxhdGZvcm0gKi9cclxuICAgIHByaXZhdGUgX3BsYXRmb3JtPyA6IFBsYXRmb3JtO1xyXG4gICAgLyoqIEN1cnJlbnRseSBjaG9zZW4gbmFtZWQgdHJhaW4gKi9cclxuICAgIHByaXZhdGUgX25hbWVkPyAgICA6IHN0cmluZztcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gY29hY2ggbGV0dGVyLCBvciByYW5kb21seSBwaWNrcyBvbmUgZnJvbSBBIHRvIFouXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBsZXR0ZXIgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRDb2FjaChjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2NvYWNoZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NvYWNoZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX2NvYWNoZXNbY29udGV4dF0gPSBSYW5kb20uYXJyYXkoTC5MRVRURVJTKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fY29hY2hlc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBjb2FjaCBsZXR0ZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIGxldHRlciBmb3JcclxuICAgICAqIEBwYXJhbSBjb2FjaCBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldENvYWNoKGNvbnRleHQ6IHN0cmluZywgY29hY2g6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fY29hY2hlc1tjb250ZXh0XSA9IGNvYWNoO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY29sbGFwc2Ugc3RhdGUgb2YgYSBjb2xsYXBzaWJsZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSByZWYgUmVmZXJlbmNlIElEIHRvIGdldCB0aGUgY29sbGFwc2libGUgc3RhdGUgb2ZcclxuICAgICAqIEBwYXJhbSBjaGFuY2UgQ2hhbmNlIGJldHdlZW4gMCBhbmQgMTAwIG9mIGNob29zaW5nIHRydWUsIGlmIHVuc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRDb2xsYXBzZWQocmVmOiBzdHJpbmcsIGNoYW5jZTogbnVtYmVyKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fY29sbGFwc2libGVzW3JlZl0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdO1xyXG5cclxuICAgICAgICB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXSA9ICFSYW5kb20uYm9vbChjaGFuY2UpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBjb2xsYXBzaWJsZSdzIHN0YXRlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSByZWYgUmVmZXJlbmNlIElEIHRvIHNldCB0aGUgY29sbGFwc2libGUgc3RhdGUgb2ZcclxuICAgICAqIEBwYXJhbSBzdGF0ZSBWYWx1ZSB0byBzZXQsIHdoZXJlIHRydWUgaXMgXCJjb2xsYXBzZWRcIlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0Q29sbGFwc2VkKHJlZjogc3RyaW5nLCBzdGF0ZTogYm9vbGVhbikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fY29sbGFwc2libGVzW3JlZl0gPSBzdGF0ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gaW50ZWdlciwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgaW50ZWdlciBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldEludGVnZXIoY29udGV4dDogc3RyaW5nKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faW50ZWdlcnNbY29udGV4dF07XHJcblxyXG4gICAgICAgIGxldCBtaW4gPSAwLCBtYXggPSAwO1xyXG5cclxuICAgICAgICBzd2l0Y2goY29udGV4dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJjb2FjaGVzXCI6ICAgICAgIG1pbiA9IDE7IG1heCA9IDEwOyAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJkZWxheWVkXCI6ICAgICAgIG1pbiA9IDU7IG1heCA9IDEyMDsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJmcm9udF9jb2FjaGVzXCI6IG1pbiA9IDI7IG1heCA9IDU7ICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJyZWFyX2NvYWNoZXNcIjogIG1pbiA9IDI7IG1heCA9IDU7ICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYW4gaW50ZWdlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgaW50ZWdlciBmb3JcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEludGVnZXIoY29udGV4dDogc3RyaW5nLCB2YWx1ZTogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBwaHJhc2Ugb2YgYSBwaHJhc2VzZXQsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBwaHJhc2VzZXQncyBwaHJhc2Ugb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldElkeChyZWY6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fcGhyYXNlc2V0c1tyZWZdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9waHJhc2VzZXRzW3JlZl07XHJcblxyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZik7XHJcblxyXG4gICAgICAgIC8vIFRPRE86IGlzIHRoaXMgc2FmZSBhY3Jvc3MgcGhyYXNlc2V0IGNoYW5nZXM/XHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlNUQVRFX05PTkVYSVNUQU5UX1BIUkFTRVNFVChyZWYpICk7XHJcblxyXG4gICAgICAgIHRoaXMuX3BocmFzZXNldHNbcmVmXSA9IFJhbmRvbS5pbnQoMCwgcGhyYXNlc2V0LmNoaWxkcmVuLmxlbmd0aCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BocmFzZXNldHNbcmVmXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGNob3NlbiBpbmRleCBmb3IgYSBwaHJhc2VzZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gc2V0IHRoZSBwaHJhc2VzZXQgaW5kZXggb2ZcclxuICAgICAqIEBwYXJhbSBpZHggSW5kZXggdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRQaHJhc2VzZXRJZHgocmVmOiBzdHJpbmcsIGlkeDogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBpZHg7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHNlcnZpY2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHNlcnZpY2UgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc2VydmljZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU2VydmljZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzZXJ2aWNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBzZXJ2aWNlIGZvclxyXG4gICAgICogQHBhcmFtIHNlcnZpY2UgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZywgc2VydmljZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IHNlcnZpY2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHN0YXRpb24gY29kZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zdGF0aW9uc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbnNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzdGF0aW9uIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBmb3JcclxuICAgICAqIEBwYXJhbSBjb2RlIFN0YXRpb24gY29kZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFN0YXRpb24oY29udGV4dDogc3RyaW5nLCBjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gY29kZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gbGlzdCBvZiBzdGF0aW9uIGNvZGVzLCBvciByYW5kb21seSBnZW5lcmF0ZXMgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBsaXN0IGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbkxpc3QoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1tdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdO1xyXG4gICAgICAgIGVsc2UgaWYgKGNvbnRleHQgPT09ICdjYWxsaW5nX2ZpcnN0JylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U3RhdGlvbkxpc3QoJ2NhbGxpbmcnKTtcclxuXHJcbiAgICAgICAgbGV0IG1pbiA9IDEsIG1heCA9IDE2O1xyXG5cclxuICAgICAgICBzd2l0Y2goY29udGV4dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NhbGxpbmdfc3BsaXQnOiBtaW4gPSAyOyBtYXggPSAxNjsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NoYW5nZXMnOiAgICAgICBtaW4gPSAxOyBtYXggPSA0OyAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ25vdF9zdG9wcGluZyc6ICBtaW4gPSAxOyBtYXggPSA4OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcyhtaW4sIG1heCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBsaXN0IG9mIHN0YXRpb24gY29kZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBsaXN0IGZvclxyXG4gICAgICogQHBhcmFtIGNvZGVzIFN0YXRpb24gY29kZXMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTdGF0aW9uTGlzdChjb250ZXh0OiBzdHJpbmcsIGNvZGVzOiBzdHJpbmdbXSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdID0gY29kZXM7XHJcblxyXG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnY2FsbGluZ19maXJzdCcpXHJcbiAgICAgICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1snY2FsbGluZyddID0gY29kZXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHRpbWVcclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHRpbWUgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRUaW1lKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fdGltZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3RpbWVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IFN0cmluZ3MuZnJvbVRpbWUoIFJhbmRvbS5pbnQoMCwgMjMpLCBSYW5kb20uaW50KDAsIDU5KSApO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl90aW1lc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSB0aW1lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSB0aW1lIGZvclxyXG4gICAgICogQHBhcmFtIHRpbWUgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRUaW1lKGNvbnRleHQ6IHN0cmluZywgdGltZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IHRpbWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBleGN1c2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSAqL1xyXG4gICAgcHVibGljIGdldCBleGN1c2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9leGN1c2UpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9leGN1c2U7XHJcblxyXG4gICAgICAgIHRoaXMuX2V4Y3VzZSA9IFJBRy5kYXRhYmFzZS5waWNrRXhjdXNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2V4Y3VzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBleGN1c2UgKi9cclxuICAgIHB1YmxpYyBzZXQgZXhjdXNlKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fZXhjdXNlID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBwbGF0Zm9ybSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IHBsYXRmb3JtKCkgOiBQbGF0Zm9ybVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9wbGF0Zm9ybSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXRmb3JtO1xyXG5cclxuICAgICAgICBsZXQgcGxhdGZvcm0gOiBQbGF0Zm9ybSA9IFsnJywgJyddO1xyXG5cclxuICAgICAgICAvLyBPbmx5IDIlIGNoYW5jZSBmb3IgcGxhdGZvcm0gMCwgc2luY2UgaXQncyByYXJlXHJcbiAgICAgICAgcGxhdGZvcm1bMF0gPSBSYW5kb20uYm9vbCg5OClcclxuICAgICAgICAgICAgPyBSYW5kb20uaW50KDEsIDI2KS50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogJzAnO1xyXG5cclxuICAgICAgICAvLyBPbmx5IDEwJSBjaGFuY2UgZm9yIHBsYXRmb3JtIGxldHRlciwgc2luY2UgaXQncyB1bmNvbW1vblxyXG4gICAgICAgIHBsYXRmb3JtWzFdID0gUmFuZG9tLmJvb2woMTApXHJcbiAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCdBQkMnKVxyXG4gICAgICAgICAgICA6ICcnO1xyXG5cclxuICAgICAgICB0aGlzLl9wbGF0Zm9ybSA9IHBsYXRmb3JtO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9wbGF0Zm9ybTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBwbGF0Zm9ybSAqL1xyXG4gICAgcHVibGljIHNldCBwbGF0Zm9ybSh2YWx1ZTogUGxhdGZvcm0pXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fcGxhdGZvcm0gPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIG5hbWVkIHRyYWluLCBvciByYW5kb21seSBwaWNrcyBvbmUgKi9cclxuICAgIHB1YmxpYyBnZXQgbmFtZWQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9uYW1lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVkO1xyXG5cclxuICAgICAgICB0aGlzLl9uYW1lZCA9IFJBRy5kYXRhYmFzZS5waWNrTmFtZWQoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fbmFtZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBzZXQgbmFtZWQodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9uYW1lZCA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB1cCB0aGUgc3RhdGUgaW4gYSBwYXJ0aWN1bGFyIHdheSwgc28gdGhhdCBpdCBtYWtlcyBzb21lIHJlYWwtd29ybGQgc2Vuc2UuXHJcbiAgICAgKiBUbyBkbyBzbywgd2UgaGF2ZSB0byBnZW5lcmF0ZSBkYXRhIGluIGEgcGFydGljdWxhciBvcmRlciwgYW5kIG1ha2Ugc3VyZSB0byBhdm9pZFxyXG4gICAgICogZHVwbGljYXRlcyBpbiBpbmFwcHJvcHJpYXRlIHBsYWNlcyBhbmQgY29udGV4dHMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZW5EZWZhdWx0U3RhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTdGVwIDEuIFByZXBvcHVsYXRlIHN0YXRpb24gbGlzdHNcclxuXHJcbiAgICAgICAgbGV0IHNsQ2FsbGluZyAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgMTYpO1xyXG4gICAgICAgIGxldCBzbENhbGxTcGxpdCA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDIsIDE2LCBzbENhbGxpbmcpO1xyXG4gICAgICAgIGxldCBhbGxDYWxsaW5nICA9IFsuLi5zbENhbGxpbmcsIC4uLnNsQ2FsbFNwbGl0XTtcclxuXHJcbiAgICAgICAgLy8gTGlzdCBvZiBvdGhlciBzdGF0aW9ucyBmb3VuZCB2aWEgYSBzcGVjaWZpYyBjYWxsaW5nIHBvaW50XHJcbiAgICAgICAgbGV0IHNsQ2hhbmdlcyAgICAgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygxLCA0LCBhbGxDYWxsaW5nKTtcclxuICAgICAgICAvLyBMaXN0IG9mIG90aGVyIHN0YXRpb25zIHRoYXQgdGhpcyB0cmFpbiB1c3VhbGx5IHNlcnZlcywgYnV0IGN1cnJlbnRseSBpc24ndFxyXG4gICAgICAgIGxldCBzbE5vdFN0b3BwaW5nID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgOCxcclxuICAgICAgICAgICAgWy4uLmFsbENhbGxpbmcsIC4uLnNsQ2hhbmdlc11cclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBUYWtlIGEgcmFuZG9tIHNsaWNlIGZyb20gdGhlIGNhbGxpbmcgbGlzdCwgdG8gaWRlbnRpZnkgYXMgcmVxdWVzdCBzdG9wc1xyXG4gICAgICAgIGxldCByZXFDb3VudCAgID0gUmFuZG9tLmludCgxLCBzbENhbGxpbmcubGVuZ3RoIC0gMSk7XHJcbiAgICAgICAgbGV0IHNsUmVxdWVzdHMgPSBzbENhbGxpbmcuc2xpY2UoMCwgcmVxQ291bnQpO1xyXG5cclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjYWxsaW5nJywgICAgICAgc2xDYWxsaW5nKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjYWxsaW5nX3NwbGl0Jywgc2xDYWxsU3BsaXQpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ2NoYW5nZXMnLCAgICAgICBzbENoYW5nZXMpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ25vdF9zdG9wcGluZycsICBzbE5vdFN0b3BwaW5nKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdyZXF1ZXN0JywgICAgICAgc2xSZXF1ZXN0cyk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgMi4gUHJlcG9wdWxhdGUgc3RhdGlvbnNcclxuXHJcbiAgICAgICAgLy8gQW55IHN0YXRpb24gbWF5IGJlIGJsYW1lZCBmb3IgYW4gZXhjdXNlLCBldmVuIG9uZXMgYWxyZWFkeSBwaWNrZWRcclxuICAgICAgICBsZXQgc3RFeGN1c2UgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZSgpO1xyXG4gICAgICAgIC8vIERlc3RpbmF0aW9uIGlzIGZpbmFsIGNhbGwgb2YgdGhlIGNhbGxpbmcgbGlzdFxyXG4gICAgICAgIGxldCBzdERlc3QgICAgPSBzbENhbGxpbmdbc2xDYWxsaW5nLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIC8vIFZpYSBpcyBhIGNhbGwgYmVmb3JlIHRoZSBkZXN0aW5hdGlvbiwgb3Igb25lIGluIHRoZSBzcGxpdCBsaXN0IGlmIHRvbyBzbWFsbFxyXG4gICAgICAgIGxldCBzdFZpYSAgICAgPSBzbENhbGxpbmcubGVuZ3RoID4gMVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSggc2xDYWxsaW5nLnNsaWNlKDAsIC0xKSAgIClcclxuICAgICAgICAgICAgOiBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG4gICAgICAgIC8vIERpdHRvIGZvciBwaWNraW5nIGEgcmFuZG9tIGNhbGxpbmcgc3RhdGlvbiBhcyBhIHNpbmdsZSByZXF1ZXN0IG9yIGNoYW5nZSBzdG9wXHJcbiAgICAgICAgbGV0IHN0Q2FsbGluZyA9IHNsQ2FsbGluZy5sZW5ndGggPiAxXHJcbiAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCBzbENhbGxpbmcuc2xpY2UoMCwgLTEpICAgKVxyXG4gICAgICAgICAgICA6IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcblxyXG4gICAgICAgIC8vIERlc3RpbmF0aW9uIChsYXN0IGNhbGwpIG9mIHRoZSBzcGxpdCB0cmFpbidzIHNlY29uZCBoYWxmIG9mIHRoZSBsaXN0XHJcbiAgICAgICAgbGV0IHN0RGVzdFNwbGl0ID0gc2xDYWxsU3BsaXRbc2xDYWxsU3BsaXQubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgLy8gUmFuZG9tIG5vbi1kZXN0aW5hdGlvbiBzdG9wIG9mIHRoZSBzcGxpdCB0cmFpbidzIHNlY29uZCBoYWxmIG9mIHRoZSBsaXN0XHJcbiAgICAgICAgbGV0IHN0VmlhU3BsaXQgID0gUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuICAgICAgICAvLyBXaGVyZSB0aGUgdHJhaW4gY29tZXMgZnJvbSwgc28gY2FuJ3QgYmUgb24gYW55IGxpc3RzIG9yIHByaW9yIHN0YXRpb25zXHJcbiAgICAgICAgbGV0IHN0U291cmNlICAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZShbXHJcbiAgICAgICAgICAgIC4uLmFsbENhbGxpbmcsIC4uLnNsQ2hhbmdlcywgLi4uc2xOb3RTdG9wcGluZywgLi4uc2xSZXF1ZXN0cyxcclxuICAgICAgICAgICAgc3RDYWxsaW5nLCBzdERlc3QsIHN0VmlhLCBzdERlc3RTcGxpdCwgc3RWaWFTcGxpdFxyXG4gICAgICAgIF0pO1xyXG5cclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2NhbGxpbmcnLCAgICAgICAgICAgc3RDYWxsaW5nKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2Rlc3RpbmF0aW9uJywgICAgICAgc3REZXN0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2Rlc3RpbmF0aW9uX3NwbGl0Jywgc3REZXN0U3BsaXQpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignZXhjdXNlJywgICAgICAgICAgICBzdEV4Y3VzZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdzb3VyY2UnLCAgICAgICAgICAgIHN0U291cmNlKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3ZpYScsICAgICAgICAgICAgICAgc3RWaWEpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbigndmlhX3NwbGl0JywgICAgICAgICBzdFZpYVNwbGl0KTtcclxuXHJcbiAgICAgICAgLy8gU3RlcCAzLiBQcmVwb3B1bGF0ZSBjb2FjaCBudW1iZXJzXHJcblxyXG4gICAgICAgIGxldCBpbnRDb2FjaGVzID0gdGhpcy5nZXRJbnRlZ2VyKCdjb2FjaGVzJyk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZXJlIGFyZSBlbm91Z2ggY29hY2hlcywganVzdCBzcGxpdCB0aGUgbnVtYmVyIGRvd24gdGhlIG1pZGRsZSBpbnN0ZWFkLlxyXG4gICAgICAgIC8vIEVsc2UsIGZyb250IGFuZCByZWFyIGNvYWNoZXMgd2lsbCBiZSByYW5kb21seSBwaWNrZWQgKHdpdGhvdXQgbWFraW5nIHNlbnNlKVxyXG4gICAgICAgIGlmIChpbnRDb2FjaGVzID49IDQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaW50RnJvbnRDb2FjaGVzID0gKGludENvYWNoZXMgLyAyKSB8IDA7XHJcbiAgICAgICAgICAgIGxldCBpbnRSZWFyQ29hY2hlcyAgPSBpbnRDb2FjaGVzIC0gaW50RnJvbnRDb2FjaGVzO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXRJbnRlZ2VyKCdmcm9udF9jb2FjaGVzJywgaW50RnJvbnRDb2FjaGVzKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRJbnRlZ2VyKCdyZWFyX2NvYWNoZXMnLCBpbnRSZWFyQ29hY2hlcyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgZW5vdWdoIGNvYWNoZXMsIGFzc2lnbiBjb2FjaCBsZXR0ZXJzIGZvciBjb250ZXh0cy5cclxuICAgICAgICAvLyBFbHNlLCBsZXR0ZXJzIHdpbGwgYmUgcmFuZG9tbHkgcGlja2VkICh3aXRob3V0IG1ha2luZyBzZW5zZSlcclxuICAgICAgICBpZiAoaW50Q29hY2hlcyA+PSA0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGxldHRlcnMgPSBMLkxFVFRFUlMuc2xpY2UoMCwgaW50Q29hY2hlcykuc3BsaXQoJycpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ2ZpcnN0JywgICAgIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc2hvcCcsICAgICAgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzdGFuZGFyZDEnLCBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3N0YW5kYXJkMicsIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU3RlcCA0LiBQcmVwb3B1bGF0ZSBzZXJ2aWNlc1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBtb3JlIHRoYW4gb25lIHNlcnZpY2UsIHBpY2sgb25lIHRvIGJlIHRoZSBcIm1haW5cIiBhbmQgb25lIHRvIGJlIHRoZVxyXG4gICAgICAgIC8vIFwiYWx0ZXJuYXRlXCIsIGVsc2UgdGhlIG9uZSBzZXJ2aWNlIHdpbGwgYmUgdXNlZCBmb3IgYm90aCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpLlxyXG4gICAgICAgIGlmIChSQUcuZGF0YWJhc2Uuc2VydmljZXMubGVuZ3RoID4gMSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBzZXJ2aWNlcyA9IFJBRy5kYXRhYmFzZS5zZXJ2aWNlcy5zbGljZSgpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXRTZXJ2aWNlKCAncHJvdmlkZXInLCAgICBSYW5kb20uYXJyYXlTcGxpY2Uoc2VydmljZXMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VydmljZSggJ2FsdGVybmF0aXZlJywgUmFuZG9tLmFycmF5U3BsaWNlKHNlcnZpY2VzKSApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU3RlcCA1LiBQcmVwb3B1bGF0ZSB0aW1lc1xyXG4gICAgICAgIC8vIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMjE0NzUzXHJcblxyXG4gICAgICAgIC8vIFRoZSBhbHRlcm5hdGl2ZSB0aW1lIGlzIGZvciBhIHRyYWluIHRoYXQncyBsYXRlciB0aGFuIHRoZSBtYWluIHRyYWluXHJcbiAgICAgICAgbGV0IHRpbWUgICAgPSBuZXcgRGF0ZSggbmV3IERhdGUoKS5nZXRUaW1lKCkgKyBSYW5kb20uaW50KDAsIDU5KSAqIDYwMDAwKTtcclxuICAgICAgICBsZXQgdGltZUFsdCA9IG5ldyBEYXRlKCB0aW1lLmdldFRpbWUoKSAgICAgICArIFJhbmRvbS5pbnQoMCwgMzApICogNjAwMDApO1xyXG5cclxuICAgICAgICB0aGlzLnNldFRpbWUoICdtYWluJywgICAgICAgIFN0cmluZ3MuZnJvbVRpbWUodGltZSkgICAgKTtcclxuICAgICAgICB0aGlzLnNldFRpbWUoICdhbHRlcm5hdGl2ZScsIFN0cmluZ3MuZnJvbVRpbWUodGltZUFsdCkgKTtcclxuICAgIH1cclxufSJdfQ==