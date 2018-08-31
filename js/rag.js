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
/** UI element for toggling the state of collapsible editor elements */
class CollapseToggle {
    /** Creates and detaches the template on first create */
    static init() {
        CollapseToggle.TEMPLATE = DOM.require('#collapsibleButtonTemplate');
        CollapseToggle.TEMPLATE.id = '';
        CollapseToggle.TEMPLATE.hidden = false;
        CollapseToggle.TEMPLATE.remove();
    }
    /** Creates and attaches toggle element for toggling collapsibles */
    static createAndAttach(parent) {
        // Skip if a toggle is already attached
        if (parent.querySelector('.toggle'))
            return;
        if (!CollapseToggle.TEMPLATE)
            CollapseToggle.init();
        parent.insertAdjacentElement('afterbegin', CollapseToggle.TEMPLATE.cloneNode(true));
    }
    /** Updates the given collapse toggle's title text, depending on state */
    static update(span) {
        let ref = span.dataset['ref'] || '???';
        let type = span.dataset['type'];
        let state = span.hasAttribute('collapsed');
        let toggle = DOM.require('.toggle', span);
        toggle.title = state
            ? L.TITLE_OPT_OPEN(type, ref)
            : L.TITLE_OPT_CLOSE(type, ref);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** UI element for opening the picker for phraseset editor elements */
class PhrasesetButton {
    /** Creates and detaches the template on first create */
    static init() {
        // TODO: This is being duplicated in various places; DRY with sugar method
        PhrasesetButton.TEMPLATE = DOM.require('#phrasesetButtonTemplate');
        PhrasesetButton.TEMPLATE.id = '';
        PhrasesetButton.TEMPLATE.hidden = false;
        PhrasesetButton.TEMPLATE.remove();
    }
    /** Creates and attaches a button for the given phraseset element */
    static createAndAttach(phraseset) {
        // Skip if a button is already attached
        if (phraseset.querySelector('.choosePhrase'))
            return;
        if (!PhrasesetButton.TEMPLATE)
            PhrasesetButton.init();
        let ref = DOM.requireData(phraseset, 'ref');
        let button = PhrasesetButton.TEMPLATE.cloneNode(true);
        button.title = L.TITLE_PHRASESET(ref);
        phraseset.insertAdjacentElement('afterbegin', button);
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
        let station = RAG.database.getStation(code);
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
        entry.innerText = station;
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
            dialogX = DOM.isMobile ? 0 : ((docW * 0.1) / 2) | 0;
            dialogY = DOM.isMobile ? 0 : ((docH * 0.1) / 2) | 0;
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
/** Base class for configuration objects, that can save, load, and reset themselves */
class ConfigBase {
    constructor(type) {
        this.type = type;
    }
    /** Safely loads runtime configuration from localStorage, if any */
    load() {
        let settings = window.localStorage.getItem(ConfigBase.SETTINGS_KEY);
        if (!settings)
            return;
        try {
            let config = JSON.parse(settings);
            Object.assign(this, config);
        }
        catch (err) {
            alert(L.CONFIG_LOAD_FAIL(err.message));
            console.error(err);
        }
    }
    /** Safely saves this configuration to localStorage */
    save() {
        try {
            window.localStorage.setItem(ConfigBase.SETTINGS_KEY, JSON.stringify(this));
        }
        catch (err) {
            alert(L.CONFIG_SAVE_FAIL(err.message));
            console.error(err);
        }
    }
    /** Safely deletes this configuration from localStorage and resets state */
    reset() {
        try {
            Object.assign(this, new this.type());
            window.localStorage.removeItem(ConfigBase.SETTINGS_KEY);
        }
        catch (err) {
            alert(L.CONFIG_RESET_FAIL(err.message));
            console.error(err);
        }
    }
}
/** localStorage key where config is expected to be stored */
ConfigBase.SETTINGS_KEY = 'settings';
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
///<reference path="configBase.ts"/>
/** Holds runtime configuration for RAG */
class Config extends ConfigBase {
    constructor(autoLoad = false) {
        super(Config);
        /** If user has clicked shuffle at least once */
        this.clickedGenerate = false;
        /** Volume for speech to be set at */
        this.speechVol = 1.0;
        /** Pitch for speech to be set at */
        this.speechPitch = 1.0;
        /** Rate for speech to be set at */
        this.speechRate = 1.0;
        /** Whether to use the VOX engine */
        this.voxEnabled = true;
        /** Relative or absolute URL of the VOX voice to use */
        this.voxPath = 'https://roycurtis.github.io/RAG-VOX-Roy';
        /** Relative or absolute URL of the custom VOX voice to use */
        this.voxCustomPath = '';
        /** VOX key of the chime to use prior to speaking */
        this.voxChime = '';
        /** Choice of speech voice to use, as getVoices index or -1 if unset */
        this._speechVoice = -1;
        /** Impulse response to use for VOX's reverb */
        this._voxReverb = 'ir.stalbans.wav';
        if (autoLoad)
            this.load();
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
    /** Gets the impulse response file to use for VOX engine's reverb */
    get voxReverb() {
        // Reset choice of reverb if it's invalid
        let choices = Object.keys(VoxEngine.REVERBS);
        if (!choices.includes(this._voxReverb))
            this._voxReverb = choices[0];
        return this._voxReverb;
    }
    /** Sets the impulse response file to use for VOX engine's reverb */
    set voxReverb(value) {
        this._voxReverb = value;
    }
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
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in the excuse, for a delay or cancellation */
    static excuse(ctx) {
        ctx.newElement.title = L.TITLE_EXCUSE();
        ctx.newElement.textContent = RAG.state.excuse;
        ctx.newElement.tabIndex = 1;
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
        ctx.newElement.tabIndex = 1;
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
        ctx.newElement.tabIndex = 1;
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
        ElementProcessors.makeCollapsible(ctx, ref);
        ctx.newElement.appendChild(ElementProcessors.wrapToInner(phrase));
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
        // Handle phrasesets with a chance value as collapsible
        ElementProcessors.makeCollapsible(ctx, ref);
        ctx.newElement.appendChild(ElementProcessors.wrapToInner(phrase));
    }
    /** Fills in the current platform */
    static platform(ctx) {
        ctx.newElement.title = L.TITLE_PLATFORM();
        ctx.newElement.textContent = RAG.state.platform.join('');
        ctx.newElement.tabIndex = 1;
    }
    /** Fills in the rail network name */
    static service(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        ctx.newElement.title = L.TITLE_SERVICE(context);
        ctx.newElement.textContent = RAG.state.getService(context);
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in station names */
    static station(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        let code = RAG.state.getStation(context);
        ctx.newElement.title = L.TITLE_STATION(context);
        ctx.newElement.textContent = RAG.database.getStation(code);
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in station lists */
    static stationlist(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        let stations = RAG.state.getStationList(context).slice();
        let stationList = Strings.fromStationList(stations, context);
        ctx.newElement.title = L.TITLE_STATIONLIST(context);
        ctx.newElement.textContent = stationList;
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in the time */
    static time(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        ctx.newElement.title = L.TITLE_TIME(context);
        ctx.newElement.textContent = RAG.state.getTime(context);
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['context'] = context;
    }
    /** Fills in vox parts */
    static vox(ctx) {
        let key = DOM.requireAttr(ctx.xmlElement, 'key');
        // TODO: Localize
        ctx.newElement.textContent = ctx.xmlElement.textContent;
        ctx.newElement.title = `Click to edit this phrase (${key})`;
        ctx.newElement.tabIndex = 1;
        ctx.newElement.dataset['key'] = key;
    }
    /** Handles unknown elements with an inline error message */
    static unknown(ctx) {
        let name = ctx.xmlElement.nodeName;
        ctx.newElement.textContent = L.EDITOR_UNKNOWN_ELEMENT(name);
    }
    /**
     * Attaches chance and a pre-determined collapse state for a given phrase element, if
     * it does have a chance attribue.
     *
     * @param ctx Context of the current phrase element being processed
     * @param ref Reference ID to get (or pick) the collapse state of
     */
    static makeCollapsible(ctx, ref) {
        if (!ctx.xmlElement.hasAttribute('chance'))
            return;
        let chance = ctx.xmlElement.getAttribute('chance');
        let collapsed = RAG.state.getCollapsed(ref, parseInt(chance));
        ctx.newElement.dataset['chance'] = chance;
        Collapsibles.set(ctx.newElement, collapsed);
    }
    /**
     * Clones the children of the given element into a new inner span tag, so that they
     * can be made collapsible or bundled with buttons.
     *
     * @param source Parent to clone the children of, into a wrapper
     */
    static wrapToInner(source) {
        let inner = document.createElement('span');
        inner.classList.add('inner');
        DOM.cloneInto(source, inner);
        return inner;
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
        let query = ':not(span):not(svg):not(use):not(button)';
        let pending = container.querySelectorAll(query);
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
            result.push(0.15);
        return [...result, `service.${service}.mid`, 0.15];
    }
    resolveStation(element, idx) {
        let ctx = element.dataset['context'];
        let station = RAG.state.getStation(ctx);
        let voxKey = RAG.database.getStationVox(station);
        let inflect = this.getInflection(idx);
        let result = [0.2, `station.${voxKey}.${inflect}`];
        if (inflect === 'mid')
            result.push(0.2);
        return result;
    }
    resolveStationList(element, idx) {
        let ctx = element.dataset['context'];
        let list = RAG.state.getStationList(ctx);
        let inflect = this.getInflection(idx);
        let parts = [0.2];
        list.forEach((code, k) => {
            let voxKey = RAG.database.getStationVox(code);
            // Handle middle of list inflection
            if (k !== list.length - 1) {
                parts.push(`station.${voxKey}.mid`, 0.25);
                return;
            }
            // Add "and" if list has more than 1 station and this is the end
            if (list.length > 1)
                parts.push('station.parts.and.mid', 0.25);
            // Add "only" if only one station in the calling list
            if (list.length === 1 && ctx === 'calling') {
                parts.push(`station.${voxKey}.mid`);
                parts.push(0.2, 'station.parts.only.end');
            }
            else
                parts.push(`station.${voxKey}.${inflect}`);
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
        try {
            this.voxEngine = new VoxEngine();
        }
        catch (err) {
            console.error('Could not create VOX engine:', err);
        }
    }
    /** Whether the VOX engine is currently available */
    get voxAvailable() {
        return this.voxEngine !== undefined;
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
            if (!impulse) {
                // Make sure reverb is off first, else clips will queue in the audio
                // buffer and all suddenly play at the same time, when reverb loads.
                this.toggleReverb(false);
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
            }
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
/** List of impulse responses that come with RAG */
VoxEngine.REVERBS = {
    '': 'None',
    'ir.stalbans.wav': 'The Lady Chapel, St Albans Cathedral',
    'ir.middle_tunnel.wav': 'Innocent Railway Tunnel, Edinburgh',
    'ir.grange-centre.wav': 'Grange stone circle, County Limerick'
};
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
        this.attachControls();
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
            this.attachControls();
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
    /** Creates and attaches UI controls for certain phrase elements */
    attachControls() {
        this.dom.querySelectorAll('[data-type=phraseset]').forEach(span => PhrasesetButton.createAndAttach(span));
        this.dom.querySelectorAll('[data-chance]').forEach(span => {
            CollapseToggle.createAndAttach(span);
            CollapseToggle.update(span);
        });
    }
    /** Handles a click anywhere in the window depending on the context */
    onClick(ev) {
        let target = ev.target;
        let type = target ? target.dataset['type'] : undefined;
        let picker = type ? RAG.views.getPicker(type) : undefined;
        if (!target)
            return this.closeDialog();
        // Ignore clicks of inner elements
        if (target.classList.contains('inner'))
            return;
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
        // Don't handle phrase or phrasesets - only via their buttons
        if (type === 'phrase' || type === 'phraseset')
            return;
        // If clicking the element already being edited, don't reopen
        if (target === prevTarget)
            return;
        let toggle = target.closest('.toggle');
        let choosePhrase = target.closest('.choosePhrase');
        // Handle collapsible elements
        if (toggle)
            this.toggleCollapsiable(toggle);
        // Special case for phraseset chooser
        else if (choosePhrase) {
            // TODO: Assert here?
            target = choosePhrase.parentElement;
            picker = RAG.views.getPicker(target.dataset['type']);
            this.openPicker(target, picker);
        }
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
        this.dom.querySelectorAll(`span[data-type=${type}][data-ref=${ref}][data-chance]`).forEach(span => {
            Collapsibles.set(span, !collapased);
            CollapseToggle.update(span);
            // Don't move this to Collapsibles.set, as state save/load is handled
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
// TODO: Make all views use this class
/** Base class for a view; anything with a base DOM element */
class ViewBase {
    /** Creates this base view, attaching it to the element matching the given query */
    constructor(domQuery) {
        if (typeof domQuery === 'string')
            this.dom = DOM.require(domQuery);
        else
            this.dom = domQuery;
    }
    /** Gets this view's child element matching the given query */
    attach(query) {
        return DOM.require(query, this.dom);
    }
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
///<reference path="viewBase.ts"/>
/** Controller for the settings screen */
class Settings extends ViewBase {
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
        // Populate list of impulse response files
        DOM.populate(this.selVoxReverb, VoxEngine.REVERBS, RAG.config.voxReverb);
        // Populate the legal & acknowledgements block
        Linkdown.loadInto('ABOUT.md', '#aboutBlock');
    }
    /** Opens the settings screen */
    open() {
        // The voice list has to be populated each open, in case it changes
        this.populateVoiceList();
        if (!RAG.speech.voxAvailable) {
            // TODO : Localize
            this.chkUseVox.checked = false;
            this.chkUseVox.disabled = true;
            this.hintUseVox.innerHTML = '<strong>VOX engine</strong> is unavailable.' +
                ' Your browser or device may not be supported; please check the console' +
                ' for more information.';
        }
        else
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
        RAG.views.main.hidden = true;
        this.btnSave.focus();
    }
    /** Closes the settings screen */
    close() {
        this.cancelReset();
        RAG.speech.stop();
        RAG.views.main.hidden = false;
        this.dom.hidden = true;
        RAG.views.toolbar.btnOption.focus();
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
            this.btnPlay.hidden = false;
            if (document.activeElement === this.btnStop)
                this.btnPlay.focus();
            this.btnStop.hidden = true;
            RAG.speech.onstop = undefined;
        };
        this.btnPlay.disabled = false;
        this.btnStop.hidden = false;
        this.btnPlay.hidden = true;
        RAG.views.marquee.set(RAG.views.editor.getText());
        RAG.speech.speak(RAG.views.editor.getPhrase());
        this.btnStop.focus();
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
        this.main = DOM.require('#mainScreen');
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
     * @param state True to collapse, false to open
     */
    static set(span, state) {
        if (state)
            span.setAttribute('collapsed', '');
        else
            span.removeAttribute('collapsed');
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
     * Sugar for populating a select element with items from a given object.
     *
     * @param list Select element to populate
     * @param items A dictionary where keys act like values, and values like labels
     * @param selected If matches a dictionary key, that key is the pre-selected option
     */
    static populate(list, items, selected) {
        for (let value in items) {
            let label = items[value];
            let opt = DOM.addOption(list, label, value);
            if (selected !== undefined && value === selected)
                opt.selected = true;
        }
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
        else if (element.tagName === 'BUTTON')
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
        // Finally, replace each tagged part of text with a link element. If a tag has
        // an invalid reference, it is ignored.
        return text.replace(this.REGEX_LINK, (match, t, k) => links[k]
            ? `<a href='${links[k]}' target="_blank" rel="noopener">${t}</a>`
            : match);
    }
}
/** Regex pattern for matching linked text */
Linkdown.REGEX_LINK = /\[([\s\S]+?)\]\[(\d+)\]/gmi;
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
            .replace(/“\s+/gi, '“')
            .replace(/\s+”/gi, '”')
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
     * @returns Station name for the given code
     */
    getStation(code) {
        let station = this.stations[code];
        if (!station)
            return L.DB_UNKNOWN_STATION(code);
        if (typeof station === 'string')
            return Strings.isNullOrEmpty(station)
                ? L.DB_EMPTY_STATION(code)
                : station;
        else
            return !station.name
                ? L.DB_EMPTY_STATION(code)
                : station.name;
    }
    /**
     * Gets the given station code's vox alias, if any. A vox alias is the code of another
     * station's voice file, that the given code should use instead. This is used for
     * stations with duplicate names.
     *
     * @param code Station code to get the vox alias of
     * @returns The alias code, else the given code
     */
    getStationVox(code) {
        let station = this.stations[code];
        // Unknown station
        if (!station)
            return '???';
        // Station is just a string; assume no alias
        else if (typeof station === 'string')
            return code;
        else
            return either(station.voxAlias, code);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL2NvbGxhcHNlVG9nZ2xlLnRzIiwidWkvY29udHJvbHMvcGhyYXNlc2V0QnV0dG9uLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkNob29zZXIudHMiLCJ1aS9jb250cm9scy9zdGF0aW9uTGlzdEl0ZW0udHMiLCJ1aS9waWNrZXJzL3BpY2tlci50cyIsInVpL3BpY2tlcnMvY29hY2hQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2V4Y3VzZVBpY2tlci50cyIsInVpL3BpY2tlcnMvaW50ZWdlclBpY2tlci50cyIsInVpL3BpY2tlcnMvbmFtZWRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BocmFzZXNldFBpY2tlci50cyIsInVpL3BpY2tlcnMvcGxhdGZvcm1QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3NlcnZpY2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25MaXN0UGlja2VyLnRzIiwidWkvcGlja2Vycy90aW1lUGlja2VyLnRzIiwiY29uZmlnL2NvbmZpZ0Jhc2UudHMiLCJjb25maWcvY29uZmlnLnRzIiwibGFuZy9iYXNlTGFuZ3VhZ2UudHMiLCJsYW5nL2VuZ2xpc2hMYW5ndWFnZS50cyIsInBocmFzZXIvZWxlbWVudFByb2Nlc3NvcnMudHMiLCJwaHJhc2VyL3BocmFzZUNvbnRleHQudHMiLCJwaHJhc2VyL3BocmFzZXIudHMiLCJzcGVlY2gvcmVzb2x2ZXIudHMiLCJzcGVlY2gvc3BlZWNoLnRzIiwic3BlZWNoL3NwZWVjaFNldHRpbmdzLnRzIiwic3BlZWNoL3ZveEVuZ2luZS50cyIsInNwZWVjaC92b3hSZXF1ZXN0LnRzIiwidWkvZWRpdG9yLnRzIiwidWkvbWFycXVlZS50cyIsInVpL3ZpZXdCYXNlLnRzIiwidWkvc2V0dGluZ3MudHMiLCJ1aS90b29sYmFyLnRzIiwidWkvdmlld3MudHMiLCJ1dGlsL2NvbGxhcHNpYmxlcy50cyIsInV0aWwvY29uZGl0aW9uYWxzLnRzIiwidXRpbC9kb20udHMiLCJ1dGlsL2xpbmtkb3duLnRzIiwidXRpbC9wYXJzZS50cyIsInV0aWwvcmFuZG9tLnRzIiwidXRpbC9zb3VuZHMudHMiLCJ1dGlsL3N0cmluZ3MudHMiLCJ1dGlsL3R5cGVzLnRzIiwiZGF0YWJhc2UudHMiLCJyYWcudHMiLCJzdGF0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSxxRUFBcUU7QUFFckUsOERBQThEO0FBQzlELElBQUksQ0FBa0MsQ0FBQztBQUV2QyxNQUFNLElBQUk7SUFVTiw0RUFBNEU7SUFDckUsTUFBTSxDQUFDLElBQUk7UUFFZCxJQUFJLElBQUksQ0FBQyxTQUFTO1lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBRW5ELElBQUksQ0FBQyxTQUFTLEdBQUc7WUFDYixJQUFJLEVBQUcsSUFBSSxlQUFlLEVBQUU7U0FDL0IsQ0FBQztRQUVGLDJCQUEyQjtRQUMzQixDQUFDLEdBQUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTVDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNLLE1BQU0sQ0FBQyxVQUFVO1FBRXJCLElBQUksSUFBa0IsQ0FBQztRQUN2QixJQUFJLElBQUksR0FBRyxRQUFRLENBQUMsZ0JBQWdCLENBQ2hDLFFBQVEsQ0FBQyxJQUFJLEVBQ2IsVUFBVSxDQUFDLFlBQVksR0FBRyxVQUFVLENBQUMsU0FBUyxFQUM5QyxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQy9CLEtBQUssQ0FDUixDQUFDO1FBRUYsT0FBUSxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUM5QjtZQUNJLElBQUksSUFBSSxDQUFDLFFBQVEsS0FB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QU0sSUFBSSxJQUFJLENBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztRQUMxRSxJQUFJLE9BQU8sR0FBRyxJQUFJLElBQUksQ0FBRSxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQVMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUM7UUFFMUUsSUFBSSxDQUFDLE9BQU8sQ0FBRSxNQUFNLEVBQVMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBSyxDQUFDO1FBQ3pELElBQUksQ0FBQyxPQUFPLENBQUUsYUFBYSxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUUsQ0FBQztJQUM3RCxDQUFDO0NBQ0oiLCJzb3VyY2VzQ29udGVudCI6WyIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBHbG9iYWwgcmVmZXJlbmNlIHRvIHRoZSBsYW5ndWFnZSBjb250YWluZXIsIHNldCBhdCBpbml0ICovXHJcbmxldCBMIDogRW5nbGlzaExhbmd1YWdlIHwgQmFzZUxhbmd1YWdlO1xyXG5cclxuY2xhc3MgSTE4blxyXG57XHJcbiAgICAvKiogQ29uc3RhbnQgcmVnZXggdG8gbWF0Y2ggZm9yIHRyYW5zbGF0aW9uIGtleXMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRBR19SRUdFWCA6IFJlZ0V4cCA9IC8lW0EtWl9dKyUvO1xyXG5cclxuICAgIC8qKiBMYW5ndWFnZXMgY3VycmVudGx5IGF2YWlsYWJsZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbGFuZ3VhZ2VzICAgOiBEaWN0aW9uYXJ5PEJhc2VMYW5ndWFnZT47XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIGxhbmd1YWdlIGN1cnJlbnRseSBpbiB1c2UgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGN1cnJlbnRMYW5nIDogQmFzZUxhbmd1YWdlO1xyXG5cclxuICAgIC8qKiBQaWNrcyBhIGxhbmd1YWdlLCBhbmQgdHJhbnNmb3JtcyBhbGwgdHJhbnNsYXRpb24ga2V5cyBpbiB0aGUgZG9jdW1lbnQgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmxhbmd1YWdlcylcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJMThuIGlzIGFscmVhZHkgaW5pdGlhbGl6ZWQnKTtcclxuXHJcbiAgICAgICAgdGhpcy5sYW5ndWFnZXMgPSB7XHJcbiAgICAgICAgICAgICdlbicgOiBuZXcgRW5nbGlzaExhbmd1YWdlKClcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBMYW5ndWFnZSBzZWxlY3Rpb25cclxuICAgICAgICBMID0gdGhpcy5jdXJyZW50TGFuZyA9IHRoaXMubGFuZ3VhZ2VzWydlbiddO1xyXG5cclxuICAgICAgICBJMThuLmFwcGx5VG9Eb20oKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFdhbGtzIHRocm91Z2ggYWxsIHRleHQgbm9kZXMgaW4gdGhlIERPTSwgcmVwbGFjaW5nIGFueSB0cmFuc2xhdGlvbiBrZXlzLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzEwNzMwNzc3LzMzNTQ5MjBcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgYXBwbHlUb0RvbSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXh0IDogTm9kZSB8IG51bGw7XHJcbiAgICAgICAgbGV0IHdhbGsgPSBkb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKFxyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LFxyXG4gICAgICAgICAgICBOb2RlRmlsdGVyLlNIT1dfRUxFTUVOVCB8IE5vZGVGaWx0ZXIuU0hPV19URVhULFxyXG4gICAgICAgICAgICB7IGFjY2VwdE5vZGU6IEkxOG4ubm9kZUZpbHRlciB9LFxyXG4gICAgICAgICAgICBmYWxzZVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHdoaWxlICggbmV4dCA9IHdhbGsubmV4dE5vZGUoKSApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAobmV4dC5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50ID0gbmV4dCBhcyBFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5hdHRyaWJ1dGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICAgICAgICAgIEkxOG4uZXhwYW5kQXR0cmlidXRlKGVsZW1lbnQuYXR0cmlidXRlc1tpXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSBpZiAobmV4dC5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUgJiYgbmV4dC50ZXh0Q29udGVudClcclxuICAgICAgICAgICAgICAgIEkxOG4uZXhwYW5kVGV4dE5vZGUobmV4dCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWx0ZXJzIHRoZSB0cmVlIHdhbGtlciB0byBleGNsdWRlIHNjcmlwdCBhbmQgc3R5bGUgdGFncyAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbm9kZUZpbHRlcihub2RlOiBOb2RlKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YWcgPSAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAgICAgID8gKG5vZGUgYXMgRWxlbWVudCkudGFnTmFtZS50b1VwcGVyQ2FzZSgpXHJcbiAgICAgICAgICAgIDogbm9kZS5wYXJlbnRFbGVtZW50IS50YWdOYW1lLnRvVXBwZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbJ1NDUklQVCcsICdTVFlMRSddLmluY2x1ZGVzKHRhZylcclxuICAgICAgICAgICAgPyBOb2RlRmlsdGVyLkZJTFRFUl9SRUpFQ1RcclxuICAgICAgICAgICAgOiBOb2RlRmlsdGVyLkZJTFRFUl9BQ0NFUFQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEV4cGFuZHMgYW55IHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGdpdmVuIGF0dHJpYnV0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZXhwYW5kQXR0cmlidXRlKGF0dHI6IEF0dHIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFNldHRpbmcgYW4gYXR0cmlidXRlLCBldmVuIGlmIG5vdGhpbmcgYWN0dWFsbHkgY2hhbmdlcywgd2lsbCBjYXVzZSB2YXJpb3VzXHJcbiAgICAgICAgLy8gc2lkZS1lZmZlY3RzIChlLmcuIHJlbG9hZGluZyBpZnJhbWVzKS4gU28sIGFzIHdhc3RlZnVsIGFzIHRoaXMgbG9va3MsIHdlIGhhdmVcclxuICAgICAgICAvLyB0byBtYXRjaCBmaXJzdCBiZWZvcmUgYWN0dWFsbHkgcmVwbGFjaW5nLlxyXG5cclxuICAgICAgICBpZiAoIGF0dHIudmFsdWUubWF0Y2godGhpcy5UQUdfUkVHRVgpIClcclxuICAgICAgICAgICAgYXR0ci52YWx1ZSA9IGF0dHIudmFsdWUucmVwbGFjZSh0aGlzLlRBR19SRUdFWCwgSTE4bi5yZXBsYWNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRXhwYW5kcyBhbnkgdHJhbnNsYXRpb24ga2V5cyBpbiB0aGUgZ2l2ZW4gdGV4dCBub2RlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBleHBhbmRUZXh0Tm9kZShub2RlOiBOb2RlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBub2RlLnRleHRDb250ZW50ID0gbm9kZS50ZXh0Q29udGVudCEucmVwbGFjZSh0aGlzLlRBR19SRUdFWCwgSTE4bi5yZXBsYWNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVwbGFjZXMga2V5IHdpdGggdmFsdWUgaWYgaXQgZXhpc3RzLCBlbHNlIGtlZXBzIHRoZSBrZXkgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlcGxhY2UobWF0Y2g6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQga2V5ICAgPSBtYXRjaC5zbGljZSgxLCAtMSk7XHJcbiAgICAgICAgbGV0IHZhbHVlID0gTFtrZXldIGFzIExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgICAgIGlmICghdmFsdWUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdNaXNzaW5nIHRyYW5zbGF0aW9uIGtleTonLCBtYXRjaCk7XHJcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWUoKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIERlbGVnYXRlIHR5cGUgZm9yIGNob29zZXIgc2VsZWN0IGV2ZW50IGhhbmRsZXJzICovXHJcbnR5cGUgU2VsZWN0RGVsZWdhdGUgPSAoZW50cnk6IEhUTUxFbGVtZW50KSA9PiB2b2lkO1xyXG5cclxuLyoqIFVJIGVsZW1lbnQgd2l0aCBhIGZpbHRlcmFibGUgYW5kIGtleWJvYXJkIG5hdmlnYWJsZSBsaXN0IG9mIGNob2ljZXMgKi9cclxuY2xhc3MgQ2hvb3NlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBET00gdGVtcGxhdGUgdG8gY2xvbmUsIGZvciBlYWNoIGNob29zZXIgY3JlYXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgVEVNUExBVEUgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgZGV0YWNoZXMgdGhlIHRlbXBsYXRlIG9uIGZpcnN0IGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUgICAgICAgID0gRE9NLnJlcXVpcmUoJyNjaG9vc2VyVGVtcGxhdGUnKTtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLmlkICAgICA9ICcnO1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUuaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGNvbnRhaW5lciAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRvbSAgICAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBmaWx0ZXIgaW5wdXQgYm94ICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5wdXRGaWx0ZXIgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgY29udGFpbmVyIG9mIGl0ZW0gZWxlbWVudHMgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBpbnB1dENob2ljZXMgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogT3B0aW9uYWwgZXZlbnQgaGFuZGxlciB0byBmaXJlIHdoZW4gYW4gaXRlbSBpcyBzZWxlY3RlZCBieSB0aGUgdXNlciAqL1xyXG4gICAgcHVibGljICAgIG9uU2VsZWN0PyAgICAgOiBTZWxlY3REZWxlZ2F0ZTtcclxuICAgIC8qKiBXaGV0aGVyIHRvIHZpc3VhbGx5IHNlbGVjdCB0aGUgY2xpY2tlZCBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgICAgc2VsZWN0T25DbGljayA6IGJvb2xlYW4gPSB0cnVlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGl0ZW0sIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIGRvbVNlbGVjdGVkPyAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGF1dG8tZmlsdGVyIHRpbWVvdXQsIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIGZpbHRlclRpbWVvdXQgOiBudW1iZXIgPSAwO1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gZ3JvdXAgYWRkZWQgZWxlbWVudHMgYnkgYWxwaGFiZXRpY2FsIHNlY3Rpb25zICovXHJcbiAgICBwcm90ZWN0ZWQgZ3JvdXBCeUFCQyAgICA6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIC8qKiBUaXRsZSBhdHRyaWJ1dGUgdG8gYXBwbHkgdG8gZXZlcnkgaXRlbSBhZGRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGl0ZW1UaXRsZSAgICAgOiBzdHJpbmcgPSAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgaXRlbSc7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYSBjaG9vc2VyLCBieSByZXBsYWNpbmcgdGhlIHBsYWNlaG9sZGVyIGluIGEgZ2l2ZW4gcGFyZW50ICovXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGFyZW50OiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICBpZiAoIUNob29zZXIuVEVNUExBVEUpXHJcbiAgICAgICAgICAgIENob29zZXIuaW5pdCgpO1xyXG5cclxuICAgICAgICBsZXQgdGFyZ2V0ICAgICAgPSBET00ucmVxdWlyZSgnY2hvb3NlcicsIHBhcmVudCk7XHJcbiAgICAgICAgbGV0IHBsYWNlaG9sZGVyID0gRE9NLmdldEF0dHIoIHRhcmdldCwgJ3BsYWNlaG9sZGVyJywgTC5QX0dFTkVSSUNfUEgoKSApO1xyXG4gICAgICAgIGxldCB0aXRsZSAgICAgICA9IERPTS5nZXRBdHRyKCB0YXJnZXQsICd0aXRsZScsIEwuUF9HRU5FUklDX1QoKSApO1xyXG4gICAgICAgIHRoaXMuaXRlbVRpdGxlICA9IERPTS5nZXRBdHRyKHRhcmdldCwgJ2l0ZW1UaXRsZScsIHRoaXMuaXRlbVRpdGxlKTtcclxuICAgICAgICB0aGlzLmdyb3VwQnlBQkMgPSB0YXJnZXQuaGFzQXR0cmlidXRlKCdncm91cEJ5QUJDJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgID0gQ2hvb3Nlci5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlciAgPSBET00ucmVxdWlyZSgnLmNoU2VhcmNoQm94JywgIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcyA9IERPTS5yZXF1aXJlKCcuY2hDaG9pY2VzQm94JywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy50aXRsZSAgICAgID0gdGl0bGU7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci5wbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyO1xyXG4gICAgICAgIC8vIFRPRE86IFJldXNpbmcgdGhlIHBsYWNlaG9sZGVyIGFzIHRpdGxlIGlzIHByb2JhYmx5IGJhZFxyXG4gICAgICAgIC8vIGh0dHBzOi8vbGFrZW4ubmV0L2Jsb2cvbW9zdC1jb21tb24tYTExeS1taXN0YWtlcy9cclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnRpdGxlICAgICAgID0gcGxhY2Vob2xkZXI7XHJcblxyXG4gICAgICAgIHRhcmdldC5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2JlZm9yZWJlZ2luJywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRhcmdldC5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFkZHMgdGhlIGdpdmVuIHZhbHVlIHRvIHRoZSBjaG9vc2VyIGFzIGEgc2VsZWN0YWJsZSBpdGVtLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBUZXh0IG9mIHRoZSBzZWxlY3RhYmxlIGl0ZW1cclxuICAgICAqIEBwYXJhbSBzZWxlY3QgV2hldGhlciB0byBzZWxlY3QgdGhpcyBpdGVtIG9uY2UgYWRkZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGFkZCh2YWx1ZTogc3RyaW5nLCBzZWxlY3Q6IGJvb2xlYW4gPSBmYWxzZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG5cclxuICAgICAgICBpdGVtLmlubmVyVGV4dCA9IHZhbHVlO1xyXG5cclxuICAgICAgICB0aGlzLmFkZFJhdyhpdGVtLCBzZWxlY3QpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQWRkcyB0aGUgZ2l2ZW4gZWxlbWVudCB0byB0aGUgY2hvb3NlciBhcyBhIHNlbGVjdGFibGUgaXRlbS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaXRlbSBFbGVtZW50IHRvIGFkZCB0byB0aGUgY2hvb3NlclxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBXaGV0aGVyIHRvIHNlbGVjdCB0aGlzIGl0ZW0gb25jZSBhZGRlZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYWRkUmF3KGl0ZW06IEhUTUxFbGVtZW50LCBzZWxlY3Q6IGJvb2xlYW4gPSBmYWxzZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaXRlbS50aXRsZSAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgICAgIGl0ZW0udGFiSW5kZXggPSAtMTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuYXBwZW5kQ2hpbGQoaXRlbSk7XHJcblxyXG4gICAgICAgIGlmIChzZWxlY3QpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChpdGVtKTtcclxuICAgICAgICAgICAgaXRlbS5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xlYXJzIGFsbCBpdGVtcyBmcm9tIHRoaXMgY2hvb3NlciBhbmQgdGhlIGN1cnJlbnQgZmlsdGVyICovXHJcbiAgICBwdWJsaWMgY2xlYXIoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5pbm5lckhUTUwgPSAnJztcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnZhbHVlICAgICAgPSAnJztcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2VsZWN0IGFuZCBmb2N1cyB0aGUgZW50cnkgdGhhdCBtYXRjaGVzIHRoZSBnaXZlbiB2YWx1ZSAqL1xyXG4gICAgcHVibGljIHByZXNlbGVjdCh2YWx1ZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCBrZXkgaW4gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW4pXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaXRlbSA9IHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuW2tleV0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICBpZiAodmFsdWUgPT09IGl0ZW0uaW5uZXJUZXh0KVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChpdGVtKTtcclxuICAgICAgICAgICAgICAgIGl0ZW0uZm9jdXMoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsaWNrIGV2ZW50cywgZm9yIGNob29zaW5nIGl0ZW1zICovXHJcbiAgICBwdWJsaWMgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhcmdldCA9IGV2LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKCB0aGlzLmlzQ2hvaWNlKHRhcmdldCkgKVxyXG4gICAgICAgIGlmICggIXRhcmdldC5oYXNBdHRyaWJ1dGUoJ2Rpc2FibGVkJykgKVxyXG4gICAgICAgICAgICB0aGlzLnNlbGVjdCh0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsb3NlIG1ldGhvZHMsIGRvaW5nIGFueSB0aW1lciBjbGVhbnVwICovXHJcbiAgICBwdWJsaWMgb25DbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBpbnB1dCBldmVudHMsIGZvciBmaWx0ZXJpbmcgYW5kIG5hdmlnYXRpb24gKi9cclxuICAgIHB1YmxpYyBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQga2V5ICAgICA9IGV2LmtleTtcclxuICAgICAgICBsZXQgZm9jdXNlZCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBmb2N1c2VkLnBhcmVudEVsZW1lbnQhO1xyXG5cclxuICAgICAgICBpZiAoIWZvY3VzZWQpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gT25seSBoYW5kbGUgZXZlbnRzIG9uIHRoaXMgY2hvb3NlcidzIGNvbnRyb2xzXHJcbiAgICAgICAgaWYgKCAhdGhpcy5vd25zKGZvY3VzZWQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgdHlwaW5nIGludG8gZmlsdGVyIGJveFxyXG4gICAgICAgIGlmIChmb2N1c2VkID09PSB0aGlzLmlucHV0RmlsdGVyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5maWx0ZXJUaW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoXyA9PiB0aGlzLmZpbHRlcigpLCA1MDApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBSZWRpcmVjdCB0eXBpbmcgdG8gaW5wdXQgZmlsdGVyIGJveFxyXG4gICAgICAgIGlmIChmb2N1c2VkICE9PSB0aGlzLmlucHV0RmlsdGVyKVxyXG4gICAgICAgIGlmIChrZXkubGVuZ3RoID09PSAxIHx8IGtleSA9PT0gJ0JhY2tzcGFjZScpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlucHV0RmlsdGVyLmZvY3VzKCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwcmVzc2luZyBFTlRFUiBhZnRlciBrZXlib2FyZCBuYXZpZ2F0aW5nIHRvIGFuIGl0ZW1cclxuICAgICAgICBpZiAoIHRoaXMuaXNDaG9pY2UoZm9jdXNlZCkgKVxyXG4gICAgICAgIGlmIChrZXkgPT09ICdFbnRlcicpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlbGVjdChmb2N1c2VkKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIG5hdmlnYXRpb24gd2hlbiBjb250YWluZXIgb3IgaXRlbSBpcyBmb2N1c2VkXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5ID09PSAnQXJyb3dSaWdodCcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZGlyID0gKGtleSA9PT0gJ0Fycm93TGVmdCcpID8gLTEgOiAxO1xyXG4gICAgICAgICAgICBsZXQgbmF2ID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQsIGlmIHVzaW5nIGdyb3Vwc1xyXG4gICAgICAgICAgICBpZiAgICAgICggdGhpcy5ncm91cEJ5QUJDICYmIHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2dyb3VwJykgKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LCBpZiBjaG9pY2VzIGFyZSBmbGF0XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKCF0aGlzLmdyb3VwQnlBQkMgJiYgZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0Q2hvaWNlcylcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnRcclxuICAgICAgICAgICAgZWxzZSBpZiAoZm9jdXNlZCA9PT0gdGhpcy5kb21TZWxlY3RlZClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyh0aGlzLmRvbVNlbGVjdGVkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsZXZhbnQgdG8gYmVnaW5uaW5nIG9yIGVuZCBvZiBjb250YWluZXJcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID09PSAtMSlcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5sYXN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKG5hdikgbmF2LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIHN1Ym1pdCBldmVudHMsIGZvciBpbnN0YW50IGZpbHRlcmluZyAqL1xyXG4gICAgcHVibGljIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICB0aGlzLmZpbHRlcigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIaWRlIG9yIHNob3cgY2hvaWNlcyBpZiB0aGV5IHBhcnRpYWxseSBtYXRjaCB0aGUgdXNlciBxdWVyeSAqL1xyXG4gICAgcHJvdGVjdGVkIGZpbHRlcigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuXHJcbiAgICAgICAgbGV0IGZpbHRlciA9IHRoaXMuaW5wdXRGaWx0ZXIudmFsdWUudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBsZXQgaXRlbXMgID0gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW47XHJcbiAgICAgICAgbGV0IGVuZ2luZSA9IHRoaXMuZ3JvdXBCeUFCQ1xyXG4gICAgICAgICAgICA/IENob29zZXIuZmlsdGVyR3JvdXBcclxuICAgICAgICAgICAgOiBDaG9vc2VyLmZpbHRlckl0ZW07XHJcblxyXG4gICAgICAgIC8vIFByZXZlbnQgYnJvd3NlciByZWRyYXcvcmVmbG93IGR1cmluZyBmaWx0ZXJpbmdcclxuICAgICAgICAvLyBUT0RPOiBNaWdodCB0aGUgdXNlIG9mIGhpZGRlbiBicmVhayBBMTF5IGhlcmU/IChlLmcuIGRlZm9jdXMpXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuaGlkZGVuID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gSXRlcmF0ZSB0aHJvdWdoIGFsbCB0aGUgaXRlbXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICBlbmdpbmUoaXRlbXNbaV0gYXMgSFRNTEVsZW1lbnQsIGZpbHRlcik7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBcHBsaWVzIGZpbHRlciB0byBhbiBpdGVtLCBzaG93aW5nIGl0IGlmIG1hdGNoZWQsIGhpZGluZyBpZiBub3QgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgZmlsdGVySXRlbShpdGVtOiBIVE1MRWxlbWVudCwgZmlsdGVyOiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2hvdyBpZiBjb250YWlucyBzZWFyY2ggdGVybVxyXG4gICAgICAgIGlmIChpdGVtLmlubmVyVGV4dC50b0xvd2VyQ2FzZSgpLmluZGV4T2YoZmlsdGVyKSA+PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaXRlbS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIaWRlIGlmIG5vdFxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGl0ZW0uaGlkZGVuID0gdHJ1ZTtcclxuICAgICAgICAgICAgcmV0dXJuIDE7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBcHBsaWVzIGZpbHRlciB0byBjaGlsZHJlbiBvZiBhIGdyb3VwLCBoaWRpbmcgdGhlIGdyb3VwIGlmIGFsbCBjaGlsZHJlbiBoaWRlICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGZpbHRlckdyb3VwKGdyb3VwOiBIVE1MRWxlbWVudCwgZmlsdGVyOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyaWVzID0gZ3JvdXAuY2hpbGRyZW47XHJcbiAgICAgICAgbGV0IGNvdW50ICAgPSBlbnRyaWVzLmxlbmd0aCAtIDE7IC8vIC0xIGZvciBoZWFkZXIgZWxlbWVudFxyXG4gICAgICAgIGxldCBoaWRkZW4gID0gMDtcclxuXHJcbiAgICAgICAgLy8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggc3RhdGlvbiBuYW1lIGluIHRoaXMgbGV0dGVyIHNlY3Rpb24uIEhlYWRlciBza2lwcGVkLlxyXG4gICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgZW50cmllcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgaGlkZGVuICs9IENob29zZXIuZmlsdGVySXRlbShlbnRyaWVzW2ldIGFzIEhUTUxFbGVtZW50LCBmaWx0ZXIpO1xyXG5cclxuICAgICAgICAvLyBJZiBhbGwgc3RhdGlvbiBuYW1lcyBpbiB0aGlzIGxldHRlciBzZWN0aW9uIHdlcmUgaGlkZGVuLCBoaWRlIHRoZSBzZWN0aW9uXHJcbiAgICAgICAgaWYgKGhpZGRlbiA+PSBjb3VudClcclxuICAgICAgICAgICAgZ3JvdXAuaGlkZGVuID0gdHJ1ZTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIGdyb3VwLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSBjaGFuZ2VzIHRoZSBjdXJyZW50IHNlbGVjdGlvbiwgYW5kIHVwZGF0ZXMgdGhlIHN0YXRlIGFuZCBlZGl0b3IgKi9cclxuICAgIHByb3RlY3RlZCBzZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgYWxyZWFkeVNlbGVjdGVkID0gKGVudHJ5ID09PSB0aGlzLmRvbVNlbGVjdGVkKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0T25DbGljaylcclxuICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoZW50cnkpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5vblNlbGVjdClcclxuICAgICAgICAgICAgdGhpcy5vblNlbGVjdChlbnRyeSk7XHJcblxyXG4gICAgICAgIGlmIChhbHJlYWR5U2VsZWN0ZWQpXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgY2hhbmdlcyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnQgKi9cclxuICAgIHByb3RlY3RlZCB2aXN1YWxTZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLnZpc3VhbFVuc2VsZWN0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQgICAgICAgICAgPSBlbnRyeTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnRhYkluZGV4ID0gNTA7XHJcbiAgICAgICAgZW50cnkuc2V0QXR0cmlidXRlKCdzZWxlY3RlZCcsICd0cnVlJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IHVuc2VsZWN0cyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGVsZW1lbnQsIGlmIGFueSAqL1xyXG4gICAgcHJvdGVjdGVkIHZpc3VhbFVuc2VsZWN0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRvbVNlbGVjdGVkKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQucmVtb3ZlQXR0cmlidXRlKCdzZWxlY3RlZCcpO1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQudGFiSW5kZXggPSAtMTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkICAgICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogV2hldGhlciB0aGlzIGNob29zZXIgaXMgYW4gYW5jZXN0b3IgKG93bmVyKSBvZiB0aGUgZ2l2ZW4gZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVsZW1lbnQgdG8gY2hlY2sgaWYgdGhpcyBjaG9vc2VyIGlzIGFuIGFuY2VzdG9yIG9mXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvd25zKHRhcmdldDogSFRNTEVsZW1lbnQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5jb250YWlucyh0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoZSBnaXZlbiBlbGVtZW50IGlzIGEgY2hvb3NhYmxlIG9uZSBvd25lZCBieSB0aGlzIGNob29zZXIgKi9cclxuICAgIHByb3RlY3RlZCBpc0Nob2ljZSh0YXJnZXQ/OiBIVE1MRWxlbWVudCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRhcmdldCAhPT0gdW5kZWZpbmVkXHJcbiAgICAgICAgICAgICYmIHRhcmdldC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdkZCdcclxuICAgICAgICAgICAgJiYgdGhpcy5vd25zKHRhcmdldCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVSSBlbGVtZW50IGZvciB0b2dnbGluZyB0aGUgc3RhdGUgb2YgY29sbGFwc2libGUgZWRpdG9yIGVsZW1lbnRzICovXHJcbmNsYXNzIENvbGxhcHNlVG9nZ2xlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHRvZ2dsZSBidXR0b24gRE9NIHRlbXBsYXRlIHRvIGNsb25lICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUgICAgICAgID0gRE9NLnJlcXVpcmUoJyNjb2xsYXBzaWJsZUJ1dHRvblRlbXBsYXRlJyk7XHJcbiAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUuaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGF0dGFjaGVzIHRvZ2dsZSBlbGVtZW50IGZvciB0b2dnbGluZyBjb2xsYXBzaWJsZXMgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY3JlYXRlQW5kQXR0YWNoKHBhcmVudDogRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2tpcCBpZiBhIHRvZ2dsZSBpcyBhbHJlYWR5IGF0dGFjaGVkXHJcbiAgICAgICAgaWYgKCBwYXJlbnQucXVlcnlTZWxlY3RvcignLnRvZ2dsZScpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoIUNvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS5pbml0KCk7XHJcblxyXG4gICAgICAgIHBhcmVudC5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2FmdGVyYmVnaW4nLFxyXG4gICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgRWxlbWVudFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIGdpdmVuIGNvbGxhcHNlIHRvZ2dsZSdzIHRpdGxlIHRleHQsIGRlcGVuZGluZyBvbiBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB1cGRhdGUoc3BhbjogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgPSBzcGFuLmRhdGFzZXRbJ3JlZiddIHx8ICc/Pz8nO1xyXG4gICAgICAgIGxldCB0eXBlICAgPSBzcGFuLmRhdGFzZXRbJ3R5cGUnXSE7XHJcbiAgICAgICAgbGV0IHN0YXRlICA9IHNwYW4uaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKTtcclxuICAgICAgICBsZXQgdG9nZ2xlID0gRE9NLnJlcXVpcmUoJy50b2dnbGUnLCBzcGFuKTtcclxuXHJcbiAgICAgICAgdG9nZ2xlLnRpdGxlID0gc3RhdGVcclxuICAgICAgICAgICAgPyBMLlRJVExFX09QVF9PUEVOKHR5cGUsIHJlZilcclxuICAgICAgICAgICAgOiBMLlRJVExFX09QVF9DTE9TRSh0eXBlLCByZWYpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVUkgZWxlbWVudCBmb3Igb3BlbmluZyB0aGUgcGlja2VyIGZvciBwaHJhc2VzZXQgZWRpdG9yIGVsZW1lbnRzICovXHJcbmNsYXNzIFBocmFzZXNldEJ1dHRvblxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2VzZXQgYnV0dG9uIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgVEVNUExBVEUgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgZGV0YWNoZXMgdGhlIHRlbXBsYXRlIG9uIGZpcnN0IGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IFRoaXMgaXMgYmVpbmcgZHVwbGljYXRlZCBpbiB2YXJpb3VzIHBsYWNlczsgRFJZIHdpdGggc3VnYXIgbWV0aG9kXHJcbiAgICAgICAgUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFICAgICAgICA9IERPTS5yZXF1aXJlKCcjcGhyYXNlc2V0QnV0dG9uVGVtcGxhdGUnKTtcclxuICAgICAgICBQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIFBocmFzZXNldEJ1dHRvbi5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgYXR0YWNoZXMgYSBidXR0b24gZm9yIHRoZSBnaXZlbiBwaHJhc2VzZXQgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjcmVhdGVBbmRBdHRhY2gocGhyYXNlc2V0OiBFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTa2lwIGlmIGEgYnV0dG9uIGlzIGFscmVhZHkgYXR0YWNoZWRcclxuICAgICAgICBpZiAoIHBocmFzZXNldC5xdWVyeVNlbGVjdG9yKCcuY2hvb3NlUGhyYXNlJykgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICghUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBQaHJhc2VzZXRCdXR0b24uaW5pdCgpO1xyXG5cclxuICAgICAgICBsZXQgcmVmICAgICAgPSBET00ucmVxdWlyZURhdGEocGhyYXNlc2V0IGFzIEhUTUxFbGVtZW50LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IGJ1dHRvbiAgID0gUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBidXR0b24udGl0bGUgPSBMLlRJVExFX1BIUkFTRVNFVChyZWYpO1xyXG5cclxuICAgICAgICBwaHJhc2VzZXQuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdhZnRlcmJlZ2luJywgYnV0dG9uKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8gVE9ETzogU2VhcmNoIGJ5IHN0YXRpb24gY29kZVxyXG5cclxuLyoqXHJcbiAqIFNpbmdsZXRvbiBpbnN0YW5jZSBvZiB0aGUgc3RhdGlvbiBwaWNrZXIuIFNpbmNlIHRoZXJlIGFyZSBleHBlY3RlZCB0byBiZSAyNTAwK1xyXG4gKiBzdGF0aW9ucywgdGhpcyBlbGVtZW50IHdvdWxkIHRha2UgdXAgYSBsb3Qgb2YgbWVtb3J5IGFuZCBnZW5lcmF0ZSBhIGxvdCBvZiBET00uIFNvLCBpdFxyXG4gKiBoYXMgdG8gYmUgXCJzd2FwcGVkXCIgYmV0d2VlbiBwaWNrZXJzIGFuZCB2aWV3cyB0aGF0IHdhbnQgdG8gdXNlIGl0LlxyXG4gKi9cclxuY2xhc3MgU3RhdGlvbkNob29zZXIgZXh0ZW5kcyBDaG9vc2VyXHJcbntcclxuICAgIC8qKiBTaG9ydGN1dCByZWZlcmVuY2VzIHRvIGFsbCB0aGUgZ2VuZXJhdGVkIEEtWiBzdGF0aW9uIGxpc3QgZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tU3RhdGlvbnMgOiBEaWN0aW9uYXJ5PEhUTUxETGlzdEVsZW1lbnQ+ID0ge307XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIocGFyZW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMudGFiSW5kZXggPSAwO1xyXG5cclxuICAgICAgICAvLyBQb3B1bGF0ZXMgdGhlIGxpc3Qgb2Ygc3RhdGlvbnMgZnJvbSB0aGUgZGF0YWJhc2UuIFdlIGRvIHRoaXMgYnkgY3JlYXRpbmcgYSBkbFxyXG4gICAgICAgIC8vIGVsZW1lbnQgZm9yIGVhY2ggbGV0dGVyIG9mIHRoZSBhbHBoYWJldCwgY3JlYXRpbmcgYSBkdCBlbGVtZW50IGhlYWRlciwgYW5kIHRoZW5cclxuICAgICAgICAvLyBwb3B1bGF0aW5nIHRoZSBkbCB3aXRoIHN0YXRpb24gbmFtZSBkZCBjaGlsZHJlbi5cclxuICAgICAgICBPYmplY3Qua2V5cyhSQUcuZGF0YWJhc2Uuc3RhdGlvbnMpLmZvckVhY2goIHRoaXMuYWRkU3RhdGlvbi5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRhY2hlcyB0aGlzIGNvbnRyb2wgdG8gdGhlIGdpdmVuIHBhcmVudCBhbmQgcmVzZXRzIHNvbWUgc3RhdGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBpY2tlciBQaWNrZXIgdG8gYXR0YWNoIHRoaXMgY29udHJvbCB0b1xyXG4gICAgICogQHBhcmFtIG9uU2VsZWN0IERlbGVnYXRlIHRvIGZpcmUgd2hlbiBjaG9vc2luZyBhIHN0YXRpb25cclxuICAgICAqL1xyXG4gICAgcHVibGljIGF0dGFjaChwaWNrZXI6IFBpY2tlciwgb25TZWxlY3Q6IFNlbGVjdERlbGVnYXRlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IHBpY2tlci5kb21Gb3JtO1xyXG4gICAgICAgIGxldCBjdXJyZW50ID0gdGhpcy5kb20ucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICAgICAgLy8gUmUtZW5hYmxlIGFsbCBkaXNhYmxlZCBlbGVtZW50c1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnF1ZXJ5U2VsZWN0b3JBbGwoYGRkW2Rpc2FibGVkXWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKCB0aGlzLmVuYWJsZS5iaW5kKHRoaXMpICk7XHJcblxyXG4gICAgICAgIGlmICghY3VycmVudCB8fCBjdXJyZW50ICE9PSBwYXJlbnQpXHJcbiAgICAgICAgICAgIHBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMudmlzdWFsVW5zZWxlY3QoKTtcclxuICAgICAgICB0aGlzLm9uU2VsZWN0ID0gb25TZWxlY3QuYmluZChwaWNrZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQcmUtc2VsZWN0cyBhIHN0YXRpb24gZW50cnkgYnkgaXRzIGNvZGUgKi9cclxuICAgIHB1YmxpYyBwcmVzZWxlY3RDb2RlKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gdGhpcy5nZXRCeUNvZGUoY29kZSk7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoZW50cnkpO1xyXG4gICAgICAgIGVudHJ5LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEVuYWJsZXMgdGhlIGdpdmVuIHN0YXRpb24gY29kZSBvciBzdGF0aW9uIGVsZW1lbnQgZm9yIHNlbGVjdGlvbiAqL1xyXG4gICAgcHVibGljIGVuYWJsZShjb2RlT3JOb2RlOiBzdHJpbmcgfCBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gKHR5cGVvZiBjb2RlT3JOb2RlID09PSAnc3RyaW5nJylcclxuICAgICAgICAgICAgPyB0aGlzLmdldEJ5Q29kZShjb2RlT3JOb2RlKVxyXG4gICAgICAgICAgICA6IGNvZGVPck5vZGU7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgZW50cnkucmVtb3ZlQXR0cmlidXRlKCdkaXNhYmxlZCcpO1xyXG4gICAgICAgIGVudHJ5LnRhYkluZGV4ID0gLTE7XHJcbiAgICAgICAgZW50cnkudGl0bGUgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRGlzYWJsZXMgdGhlIGdpdmVuIHN0YXRpb24gY29kZSBmcm9tIHNlbGVjdGlvbiAqL1xyXG4gICAgcHVibGljIGRpc2FibGUoY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSB0aGlzLmdldEJ5Q29kZShjb2RlKTtcclxuICAgICAgICBsZXQgbmV4dCAgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZW50cnksIDEpO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGVudHJ5LnNldEF0dHJpYnV0ZSgnZGlzYWJsZWQnLCAnJyk7XHJcbiAgICAgICAgZW50cnkucmVtb3ZlQXR0cmlidXRlKCd0YWJpbmRleCcpO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlID0gJyc7XHJcblxyXG4gICAgICAgIC8vIFNoaWZ0IGZvY3VzIHRvIG5leHQgYXZhaWxhYmxlIGVsZW1lbnQsIGZvciBrZXlib2FyZCBuYXZpZ2F0aW9uXHJcbiAgICAgICAgaWYgKG5leHQpXHJcbiAgICAgICAgICAgIG5leHQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyBhIHN0YXRpb24ncyBjaG9pY2UgZWxlbWVudCBieSBpdHMgY29kZSAqL1xyXG4gICAgcHJpdmF0ZSBnZXRCeUNvZGUoY29kZTogc3RyaW5nKSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaW5wdXRDaG9pY2VzXHJcbiAgICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKGBkZFtkYXRhLWNvZGU9JHtjb2RlfV1gKSBhcyBIVE1MRWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGdpdmVuIHN0YXRpb24gY29kZSAqL1xyXG4gICAgcHJpdmF0ZSBhZGRTdGF0aW9uKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlKTtcclxuICAgICAgICBsZXQgbGV0dGVyICA9IHN0YXRpb25bMF07XHJcbiAgICAgICAgbGV0IGdyb3VwICAgPSB0aGlzLmRvbVN0YXRpb25zW2xldHRlcl07XHJcblxyXG4gICAgICAgIGlmICghZ3JvdXApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaGVhZGVyICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZHQnKTtcclxuICAgICAgICAgICAgaGVhZGVyLmlubmVyVGV4dCA9IGxldHRlci50b1VwcGVyQ2FzZSgpO1xyXG4gICAgICAgICAgICBoZWFkZXIudGFiSW5kZXggID0gLTE7XHJcblxyXG4gICAgICAgICAgICBncm91cCA9IHRoaXMuZG9tU3RhdGlvbnNbbGV0dGVyXSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RsJyk7XHJcbiAgICAgICAgICAgIGdyb3VwLnRhYkluZGV4ID0gNTA7XHJcblxyXG4gICAgICAgICAgICBncm91cC5zZXRBdHRyaWJ1dGUoJ2dyb3VwJywgJycpO1xyXG4gICAgICAgICAgICBncm91cC5hcHBlbmRDaGlsZChoZWFkZXIpO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5hcHBlbmRDaGlsZChncm91cCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgZW50cnkgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG4gICAgICAgIGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSA9IGNvZGU7XHJcbiAgICAgICAgZW50cnkuaW5uZXJUZXh0ICAgICAgID0gc3RhdGlvbjtcclxuICAgICAgICBlbnRyeS50aXRsZSAgICAgICAgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgICAgICBlbnRyeS50YWJJbmRleCAgICAgICAgPSAtMTtcclxuXHJcbiAgICAgICAgZ3JvdXAuYXBwZW5kQ2hpbGQoZW50cnkpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogU3RhdGlvbiBsaXN0IGl0ZW0gdGhhdCBjYW4gYmUgZHJhZ2dlZCBhbmQgZHJvcHBlZCAqL1xyXG5jbGFzcyBTdGF0aW9uTGlzdEl0ZW1cclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIHRlbXBsYXRlIHRvIGNsb25lLCBmb3IgZWFjaCBpdGVtIGNyZWF0ZWQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUgICAgICAgID0gRE9NLnJlcXVpcmUoJyNzdGF0aW9uTGlzdEl0ZW1UZW1wbGF0ZScpO1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5pZCAgICAgPSAnJztcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBpdGVtJ3MgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHN0YXRpb24gbGlzdCBpdGVtLCBtZWFudCBmb3IgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gY3JlYXRlIHRoaXMgaXRlbSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGNvZGU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICBpZiAoIVN0YXRpb25MaXN0SXRlbS5URU1QTEFURSlcclxuICAgICAgICAgICAgU3RhdGlvbkxpc3RJdGVtLmluaXQoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgICAgID0gU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICB0aGlzLmRvbS5pbm5lclRleHQgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uZGF0YXNldFsnY29kZSddID0gY29kZTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEJhc2UgY2xhc3MgZm9yIHBpY2tlciB2aWV3cyAqL1xyXG5hYnN0cmFjdCBjbGFzcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgZm9ybSBET00gZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbUZvcm0gICA6IEhUTUxGb3JtRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBoZWFkZXIgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbUhlYWRlciA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIEdldHMgdGhlIG5hbWUgb2YgdGhlIFhNTCB0YWcgdGhpcyBwaWNrZXIgaGFuZGxlcyAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IHhtbFRhZyAgICA6IHN0cmluZztcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2UgZWxlbWVudCBiZWluZyBlZGl0ZWQgYnkgdGhpcyBwaWNrZXIgKi9cclxuICAgIHByb3RlY3RlZCBkb21FZGl0aW5nPyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhIHBpY2tlciB0byBoYW5kbGUgdGhlIGdpdmVuIHBocmFzZSBlbGVtZW50IHR5cGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHhtbFRhZyBOYW1lIG9mIHRoZSBYTUwgdGFnIHRoaXMgcGlja2VyIHdpbGwgaGFuZGxlLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3IoeG1sVGFnOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgPSBET00ucmVxdWlyZShgIyR7eG1sVGFnfVBpY2tlcmApO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybSAgID0gRE9NLnJlcXVpcmUoJ2Zvcm0nLCAgIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlciA9IERPTS5yZXF1aXJlKCdoZWFkZXInLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy54bWxUYWcgICAgPSB4bWxUYWc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmNoYW5nZSAgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uaW5wdXQgICA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25jbGljayAgID0gdGhpcy5vbkNsaWNrLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9ua2V5ZG93biA9IHRoaXMub25JbnB1dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbnN1Ym1pdCAgPSB0aGlzLm9uU3VibWl0LmJpbmQodGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxsZWQgd2hlbiBmb3JtIGZpZWxkcyBjaGFuZ2UuIFRoZSBpbXBsZW1lbnRpbmcgcGlja2VyIHNob3VsZCB1cGRhdGUgYWxsIGxpbmtlZFxyXG4gICAgICogZWxlbWVudHMgKGUuZy4gb2Ygc2FtZSB0eXBlKSB3aXRoIHRoZSBuZXcgZGF0YSBoZXJlLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25DaGFuZ2UoZXY6IEV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIGEgbW91c2UgY2xpY2sgaGFwcGVucyBhbnl3aGVyZSBpbiBvciBvbiB0aGUgcGlja2VyJ3MgZm9ybSAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKiogQ2FsbGVkIHdoZW4gYSBrZXkgaXMgcHJlc3NlZCB3aGlsc3QgdGhlIHBpY2tlcidzIGZvcm0gaXMgZm9jdXNlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENhbGxlZCB3aGVuIEVOVEVSIGlzIHByZXNzZWQgd2hpbHN0IGEgZm9ybSBjb250cm9sIG9mIHRoZSBwaWNrZXIgaXMgZm9jdXNlZC5cclxuICAgICAqIEJ5IGRlZmF1bHQsIHRoaXMgd2lsbCB0cmlnZ2VyIHRoZSBvbkNoYW5nZSBoYW5kbGVyIGFuZCBjbG9zZSB0aGUgZGlhbG9nLlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIHRoaXMub25DaGFuZ2UoZXYpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9wZW4gdGhpcyBwaWNrZXIgZm9yIGEgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQuIFRoZSBpbXBsZW1lbnRpbmcgcGlja2VyIHNob3VsZCBmaWxsXHJcbiAgICAgKiBpdHMgZm9ybSBlbGVtZW50cyB3aXRoIGRhdGEgZnJvbSB0aGUgY3VycmVudCBzdGF0ZSBhbmQgdGFyZ2V0ZWQgZWxlbWVudCBoZXJlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IHRhcmdldCBQaHJhc2UgZWxlbWVudCB0aGF0IHRoaXMgcGlja2VyIGlzIGJlaW5nIG9wZW5lZCBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nID0gdGFyZ2V0O1xyXG4gICAgICAgIHRoaXMubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlcyB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9zaXRpb25zIHRoaXMgcGlja2VyIHJlbGF0aXZlIHRvIHRoZSB0YXJnZXQgcGhyYXNlIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyBsYXlvdXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuZG9tRWRpdGluZylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgdGFyZ2V0UmVjdCA9IHRoaXMuZG9tRWRpdGluZy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBsZXQgZnVsbFdpZHRoICA9IHRoaXMuZG9tLmNsYXNzTGlzdC5jb250YWlucygnZnVsbFdpZHRoJyk7XHJcbiAgICAgICAgbGV0IGlzTW9kYWwgICAgPSB0aGlzLmRvbS5jbGFzc0xpc3QuY29udGFpbnMoJ21vZGFsJyk7XHJcbiAgICAgICAgbGV0IGRvY1cgICAgICAgPSBkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoO1xyXG4gICAgICAgIGxldCBkb2NIICAgICAgID0gZG9jdW1lbnQuYm9keS5jbGllbnRIZWlnaHQ7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1ggICAgPSAodGFyZ2V0UmVjdC5sZWZ0ICAgfCAwKSAtIDg7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1kgICAgPSAgdGFyZ2V0UmVjdC5ib3R0b20gfCAwO1xyXG4gICAgICAgIGxldCBkaWFsb2dXICAgID0gKHRhcmdldFJlY3Qud2lkdGggIHwgMCkgKyAxNjtcclxuXHJcbiAgICAgICAgLy8gQWRqdXN0IGlmIGhvcml6b250YWxseSBvZmYgc2NyZWVuXHJcbiAgICAgICAgaWYgKCFmdWxsV2lkdGggJiYgIWlzTW9kYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBGb3JjZSBmdWxsIHdpZHRoIG9uIG1vYmlsZVxyXG4gICAgICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS53aWR0aCA9IGAxMDAlYDtcclxuXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dYID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLndpZHRoICAgID0gYGluaXRpYWxgO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUubWluV2lkdGggPSBgJHtkaWFsb2dXfXB4YDtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoZGlhbG9nWCArIHRoaXMuZG9tLm9mZnNldFdpZHRoID4gZG9jVylcclxuICAgICAgICAgICAgICAgICAgICBkaWFsb2dYID0gKHRhcmdldFJlY3QucmlnaHQgfCAwKSAtIHRoaXMuZG9tLm9mZnNldFdpZHRoICsgODtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBpY2tlcnMgdGhhdCBpbnN0ZWFkIHRha2UgdXAgdGhlIHdob2xlIGRpc3BsYXkuIENTUyBpc24ndCB1c2VkIGhlcmUsXHJcbiAgICAgICAgLy8gYmVjYXVzZSBwZXJjZW50YWdlLWJhc2VkIGxlZnQvdG9wIGNhdXNlcyBzdWJwaXhlbCBpc3N1ZXMgb24gQ2hyb21lLlxyXG4gICAgICAgIGlmIChpc01vZGFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZGlhbG9nWCA9IERPTS5pc01vYmlsZSA/IDAgOiAoIChkb2NXICogMC4xKSAvIDIgKSB8IDA7XHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSBET00uaXNNb2JpbGUgPyAwIDogKCAoZG9jSCAqIDAuMSkgLyAyICkgfCAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgdG8gdG9wIGVkZ2Ugb2YgZG9jdW1lbnRcclxuICAgICAgICBlbHNlIGlmIChkaWFsb2dZIDwgMClcclxuICAgICAgICAgICAgZGlhbG9nWSA9IDA7XHJcblxyXG4gICAgICAgIC8vIEFkanVzdCBpZiB2ZXJ0aWNhbGx5IG9mZiBzY3JlZW5cclxuICAgICAgICBlbHNlIGlmIChkaWFsb2dZICsgdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ID4gZG9jSClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSAodGFyZ2V0UmVjdC50b3AgfCAwKSAtIHRoaXMuZG9tLm9mZnNldEhlaWdodCArIDE7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QuYWRkKCdiZWxvdycpO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LnJlbW92ZSgnYWJvdmUnKTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHN0aWxsIG9mZi1zY3JlZW4sIGNsYW1wIHRvIGJvdHRvbVxyXG4gICAgICAgICAgICBpZiAoZGlhbG9nWSArIHRoaXMuZG9tLm9mZnNldEhlaWdodCA+IGRvY0gpXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dZID0gZG9jSCAtIHRoaXMuZG9tLm9mZnNldEhlaWdodDtcclxuXHJcbiAgICAgICAgICAgIC8vIENsYW1wIHRvIHRvcCBlZGdlIG9mIGRvY3VtZW50LiBMaWtlbHkgaGFwcGVucyBpZiB0YXJnZXQgZWxlbWVudCBpcyBsYXJnZS5cclxuICAgICAgICAgICAgaWYgKGRpYWxvZ1kgPCAwKVxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWSA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QuYWRkKCdhYm92ZScpO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LnJlbW92ZSgnYmVsb3cnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLnN0eWxlLmxlZnQgPSAoZnVsbFdpZHRoID8gMCA6IGRpYWxvZ1gpICsgJ3B4JztcclxuICAgICAgICB0aGlzLmRvbS5zdHlsZS50b3AgID0gZGlhbG9nWSArICdweCc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJldHVybnMgdHJ1ZSBpZiBhbiBlbGVtZW50IGluIHRoaXMgcGlja2VyIGN1cnJlbnRseSBoYXMgZm9jdXMgKi9cclxuICAgIHB1YmxpYyBoYXNGb2N1cygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5jb250YWlucyhkb2N1bWVudC5hY3RpdmVFbGVtZW50KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgY29hY2ggcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBDb2FjaFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbGV0dGVyIGRyb3AtZG93biBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGV0dGVyIDogSFRNTFNlbGVjdEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBjb2FjaCBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignY29hY2gnKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlciA9IERPTS5yZXF1aXJlKCdzZWxlY3QnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMjY7IGkrKylcclxuICAgICAgICAgICAgRE9NLmFkZE9wdGlvbih0aGlzLmlucHV0TGV0dGVyLCBMLkxFVFRFUlNbaV0sIEwuTEVUVEVSU1tpXSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSB0YXJnZXQgY29udGV4dCdzIGNvYWNoIGxldHRlciAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0NPQUNIKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgPSBSQUcuc3RhdGUuZ2V0Q29hY2godGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIGNvYWNoIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfQ09BQ0hfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRDb2FjaCh0aGlzLmN1cnJlbnRDdHgsIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1jb2FjaF1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLmlucHV0TGV0dGVyLnZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGV4Y3VzZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIEV4Y3VzZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2V4Y3VzZScpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9FWENVU0UoKTtcclxuXHJcbiAgICAgICAgUkFHLmRhdGFiYXNlLmV4Y3VzZXMuZm9yRWFjaCggdiA9PiB0aGlzLmRvbUNob29zZXIuYWRkKHYpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgZXhjdXNlICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIC8vIFByZS1zZWxlY3QgdGhlIGN1cnJlbnRseSB1c2VkIGV4Y3VzZVxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5wcmVzZWxlY3QoUkFHLnN0YXRlLmV4Y3VzZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBleGN1c2UgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUuZXhjdXNlID0gZW50cnkuaW5uZXJUZXh0O1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCdleGN1c2UnLCBSQUcuc3RhdGUuZXhjdXNlKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgaW50ZWdlciBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIEludGVnZXJQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG51bWVyaWNhbCBpbnB1dCBzcGlubmVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0RGlnaXQgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG9wdGlvbmFsIHN1ZmZpeCBsYWJlbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21MYWJlbCAgIDogSFRNTExhYmVsRWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IGludGVnZXIgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eD8gOiBzdHJpbmc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9wdGlvbmFsIHNpbmd1bGFyIHN1ZmZpeCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgc2luZ3VsYXI/ICAgOiBzdHJpbmc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9wdGlvbmFsIHBsdXJhbCBzdWZmaXggZm9yIHRoZSBjdXJyZW50IGludGVnZXIgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHBsdXJhbD8gICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIFdoZXRoZXIgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgd2FudHMgd29yZCBkaWdpdHMgKi9cclxuICAgIHByaXZhdGUgd29yZHM/ICAgICAgOiBib29sZWFuO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2ludGVnZXInKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0ID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tTGFiZWwgICA9IERPTS5yZXF1aXJlKCdsYWJlbCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgLy8gaU9TIG5lZWRzIGRpZmZlcmVudCB0eXBlIGFuZCBwYXR0ZXJuIHRvIHNob3cgYSBudW1lcmljYWwga2V5Ym9hcmRcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnR5cGUgICAgPSAndGVsJztcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnBhdHRlcm4gPSAnWzAtOV0rJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSB0YXJnZXQgY29udGV4dCdzIGludGVnZXIgZGF0YSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuc2luZ3VsYXIgICA9IHRhcmdldC5kYXRhc2V0WydzaW5ndWxhciddO1xyXG4gICAgICAgIHRoaXMucGx1cmFsICAgICA9IHRhcmdldC5kYXRhc2V0WydwbHVyYWwnXTtcclxuICAgICAgICB0aGlzLndvcmRzICAgICAgPSBQYXJzZS5ib29sZWFuKHRhcmdldC5kYXRhc2V0Wyd3b3JkcyddIHx8ICdmYWxzZScpO1xyXG5cclxuICAgICAgICBsZXQgdmFsdWUgPSBSQUcuc3RhdGUuZ2V0SW50ZWdlcih0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICBpZiAgICAgICh0aGlzLnNpbmd1bGFyICYmIHZhbHVlID09PSAxKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMuc2luZ3VsYXI7XHJcbiAgICAgICAgZWxzZSBpZiAodGhpcy5wbHVyYWwgJiYgdmFsdWUgIT09IDEpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5wbHVyYWw7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9ICcnO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9JTlRFR0VSKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnZhbHVlICAgID0gdmFsdWUudG9TdHJpbmcoKTtcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgaW50ZWdlciBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX0lOVF9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgLy8gQ2FuJ3QgdXNlIHZhbHVlQXNOdW1iZXIgZHVlIHRvIGlPUyBpbnB1dCB0eXBlIHdvcmthcm91bmRzXHJcbiAgICAgICAgbGV0IGludCAgICA9IHBhcnNlSW50KHRoaXMuaW5wdXREaWdpdC52YWx1ZSk7XHJcbiAgICAgICAgbGV0IGludFN0ciA9ICh0aGlzLndvcmRzKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgLy8gSWdub3JlIGludmFsaWQgdmFsdWVzXHJcbiAgICAgICAgaWYgKCBpc05hTihpbnQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9ICcnO1xyXG5cclxuICAgICAgICBpZiAoaW50ID09PSAxICYmIHRoaXMuc2luZ3VsYXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3RoaXMuc2luZ3VsYXJ9YDtcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnNpbmd1bGFyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmIChpbnQgIT09IDEgJiYgdGhpcy5wbHVyYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3RoaXMucGx1cmFsfWA7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5wbHVyYWw7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0SW50ZWdlcih0aGlzLmN1cnJlbnRDdHgsIGludCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPWludGVnZXJdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gaW50U3RyKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIG5hbWVkIHRyYWluIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgTmFtZWRQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCduYW1lZCcpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9OQU1FRCgpO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2UubmFtZWQuZm9yRWFjaCggdiA9PiB0aGlzLmRvbUNob29zZXIuYWRkKHYpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgbmFtZVxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5wcmVzZWxlY3QoUkFHLnN0YXRlLm5hbWVkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIG5hbWVkIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlLm5hbWVkID0gZW50cnkuaW5uZXJUZXh0O1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCduYW1lZCcsIFJBRy5zdGF0ZS5uYW1lZCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBocmFzZXNldCBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFBocmFzZXNldFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgcmVmZXJlbmNlIHRhZyBmb3IgdGhlIGN1cnJlbnQgcGhyYXNlc2V0IGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRSZWY/IDogc3RyaW5nO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3BocmFzZXNldCcpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgcGhyYXNlc2V0J3MgbGlzdCBvZiBwaHJhc2VzICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIGxldCByZWYgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IGlkeCA9IHBhcnNlSW50KCBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnaWR4JykgKTtcclxuXHJcbiAgICAgICAgbGV0IHBocmFzZXNldCA9IFJBRy5kYXRhYmFzZS5nZXRQaHJhc2VzZXQocmVmKTtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfUFNFVF9VTktOT1dOKHJlZikgKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UmVmICAgICAgICAgID0gcmVmO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1BIUkFTRVNFVChyZWYpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIuY2xlYXIoKTtcclxuXHJcbiAgICAgICAgLy8gRm9yIGVhY2ggcGhyYXNlLCB3ZSBuZWVkIHRvIHJ1biBpdCB0aHJvdWdoIHRoZSBwaHJhc2VyIHVzaW5nIHRoZSBjdXJyZW50IHN0YXRlXHJcbiAgICAgICAgLy8gdG8gZ2VuZXJhdGUgXCJwcmV2aWV3c1wiIG9mIGhvdyB0aGUgcGhyYXNlIHdpbGwgbG9vay5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBocmFzZXNldC5jaGlsZHJlbi5sZW5ndGg7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBwaHJhc2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZCcpO1xyXG5cclxuICAgICAgICAgICAgRE9NLmNsb25lSW50byhwaHJhc2VzZXQuY2hpbGRyZW5baV0gYXMgSFRNTEVsZW1lbnQsIHBocmFzZSk7XHJcbiAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MocGhyYXNlKTtcclxuXHJcbiAgICAgICAgICAgIHBocmFzZS5pbm5lclRleHQgICA9IERPTS5nZXRDbGVhbmVkVmlzaWJsZVRleHQocGhyYXNlKTtcclxuICAgICAgICAgICAgcGhyYXNlLmRhdGFzZXQuaWR4ID0gaS50b1N0cmluZygpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5kb21DaG9vc2VyLmFkZFJhdyhwaHJhc2UsIGkgPT09IGlkeCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgcGhyYXNlc2V0IGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRSZWYpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfUFNFVF9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgbGV0IGlkeCA9IHBhcnNlSW50KGVudHJ5LmRhdGFzZXRbJ2lkeCddISk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRQaHJhc2VzZXRJZHgodGhpcy5jdXJyZW50UmVmLCBpZHgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnJlZnJlc2hQaHJhc2VzZXQodGhpcy5jdXJyZW50UmVmKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGxhdGZvcm0gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBQbGF0Zm9ybVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbnVtZXJpY2FsIGlucHV0IHNwaW5uZXIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXREaWdpdCAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGxldHRlciBkcm9wLWRvd24gaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExldHRlciA6IEhUTUxTZWxlY3RFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3BsYXRmb3JtJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdCAgICAgICAgICA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyICAgICAgICAgPSBET00ucmVxdWlyZSgnc2VsZWN0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1BMQVRGT1JNKCk7XHJcblxyXG4gICAgICAgIC8vIGlPUyBuZWVkcyBkaWZmZXJlbnQgdHlwZSBhbmQgcGF0dGVybiB0byBzaG93IGEgbnVtZXJpY2FsIGtleWJvYXJkXHJcbiAgICAgICAgaWYgKERPTS5pc2lPUylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC50eXBlICAgID0gJ3RlbCc7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5wYXR0ZXJuID0gJ1swLTldKyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIHBsYXRmb3JtIGRhdGEgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgbGV0IHZhbHVlID0gUkFHLnN0YXRlLnBsYXRmb3JtO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQudmFsdWUgID0gdmFsdWVbMF07XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9IHZhbHVlWzFdO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBwbGF0Zm9ybSBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIElnbm9yZSBpbnZhbGlkIHZhbHVlc1xyXG4gICAgICAgIGlmICggaXNOYU4oIHBhcnNlSW50KHRoaXMuaW5wdXREaWdpdC52YWx1ZSkgKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnBsYXRmb3JtID0gW3RoaXMuaW5wdXREaWdpdC52YWx1ZSwgdGhpcy5pbnB1dExldHRlci52YWx1ZV07XHJcblxyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3Iuc2V0RWxlbWVudHNUZXh0KCAncGxhdGZvcm0nLCBSQUcuc3RhdGUucGxhdGZvcm0uam9pbignJykgKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNlcnZpY2UgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTZXJ2aWNlUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBzZXJ2aWNlIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdzZXJ2aWNlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2Uuc2VydmljZXMuZm9yRWFjaCggdiA9PiB0aGlzLmRvbUNob29zZXIuYWRkKHYpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3Mgc2VydmljZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NFUlZJQ0UodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgc2VydmljZVxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5wcmVzZWxlY3QoIFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKHRoaXMuY3VycmVudEN0eCkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHNlcnZpY2UgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9TRVJWSUNFX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U2VydmljZSh0aGlzLmN1cnJlbnRDdHgsIGVudHJ5LmlubmVyVGV4dCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPXNlcnZpY2VdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gZW50cnkuaW5uZXJUZXh0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc3RhdGlvbiBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFN0YXRpb25QaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIHNoYXJlZCBzdGF0aW9uIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBjaG9vc2VyIDogU3RhdGlvbkNob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBzdGF0aW9uIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvbk9wZW4gZGVsZWdhdGUgZm9yIFN0YXRpb25QaWNrZXIgb3IgZm9yIFN0YXRpb25MaXN0UGlja2VyICovXHJcbiAgICBwcm90ZWN0ZWQgb25PcGVuICAgICA6ICh0YXJnZXQ6IEhUTUxFbGVtZW50KSA9PiB2b2lkO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcih0YWc6IHN0cmluZyA9ICdzdGF0aW9uJylcclxuICAgIHtcclxuICAgICAgICBzdXBlcih0YWcpO1xyXG5cclxuICAgICAgICBpZiAoIVN0YXRpb25QaWNrZXIuY2hvb3NlcilcclxuICAgICAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyID0gbmV3IFN0YXRpb25DaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcblxyXG4gICAgICAgIHRoaXMub25PcGVuID0gdGhpcy5vblN0YXRpb25QaWNrZXJPcGVuLmJpbmQodGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpcmVzIHRoZSBvbk9wZW4gZGVsZWdhdGUgcmVnaXN0ZXJlZCBmb3IgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuICAgICAgICB0aGlzLm9uT3Blbih0YXJnZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBBdHRhY2hlcyB0aGUgc3RhdGlvbiBjaG9vc2VyIGFuZCBmb2N1c2VzIGl0IG9udG8gdGhlIGN1cnJlbnQgZWxlbWVudCdzIHN0YXRpb24gKi9cclxuICAgIHByb3RlY3RlZCBvblN0YXRpb25QaWNrZXJPcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjaG9vc2VyICAgICA9IFN0YXRpb25QaWNrZXIuY2hvb3NlcjtcclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjaG9vc2VyLmF0dGFjaCh0aGlzLCB0aGlzLm9uU2VsZWN0U3RhdGlvbik7XHJcbiAgICAgICAgY2hvb3Nlci5wcmVzZWxlY3RDb2RlKCBSQUcuc3RhdGUuZ2V0U3RhdGlvbih0aGlzLmN1cnJlbnRDdHgpICk7XHJcbiAgICAgICAgY2hvb3Nlci5zZWxlY3RPbkNsaWNrID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU1RBVElPTih0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBzdGF0aW9uIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IFN0YXRpb25QaWNrZXIuY2hvb3Nlci5vbkNsaWNrKGV2KTsgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IFN0YXRpb25QaWNrZXIuY2hvb3Nlci5vbklucHV0KGV2KTsgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IFN0YXRpb25QaWNrZXIuY2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgc3RhdGlvbiBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdFN0YXRpb24oZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcXVlcnkgPSBgW2RhdGEtdHlwZT1zdGF0aW9uXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWA7XHJcbiAgICAgICAgbGV0IGNvZGUgID0gZW50cnkuZGF0YXNldFsnY29kZSddITtcclxuICAgICAgICBsZXQgbmFtZSAgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvbihjb2RlKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFN0YXRpb24odGhpcy5jdXJyZW50Q3R4LCBjb2RlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkocXVlcnkpXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IG5hbWUpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwic3RhdGlvblBpY2tlci50c1wiLz5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uLy4uL3ZlbmRvci9kcmFnZ2FibGUuZC50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc3RhdGlvbiBsaXN0IHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU3RhdGlvbkxpc3RQaWNrZXIgZXh0ZW5kcyBTdGF0aW9uUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjb250YWluZXIgZm9yIHRoZSBsaXN0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tTGlzdCAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtb2JpbGUtb25seSBhZGQgc3RhdGlvbiBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQWRkICAgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtb2JpbGUtb25seSBjbG9zZSBwaWNrZXIgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkNsb3NlICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgZHJvcCB6b25lIGZvciBkZWxldGluZyBzdGF0aW9uIGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbURlbCAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgYWN0dWFsIHNvcnRhYmxlIGxpc3Qgb2Ygc3RhdGlvbnMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMaXN0ICAgIDogSFRNTERMaXN0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gcGxhY2Vob2xkZXIgc2hvd24gaWYgdGhlIGxpc3QgaXMgZW1wdHkgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tRW1wdHlMaXN0IDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcihcInN0YXRpb25saXN0XCIpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUxpc3QgICAgICA9IERPTS5yZXF1aXJlKCcuc3RhdGlvbkxpc3QnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5idG5BZGQgICAgICAgPSBET00ucmVxdWlyZSgnLmFkZFN0YXRpb24nLCAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmJ0bkNsb3NlICAgICA9IERPTS5yZXF1aXJlKCcuY2xvc2VQaWNrZXInLCB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuZG9tRGVsICAgICAgID0gRE9NLnJlcXVpcmUoJy5kZWxTdGF0aW9uJywgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QgICAgPSBET00ucmVxdWlyZSgnZGwnLCAgICAgICAgICAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdCA9IERPTS5yZXF1aXJlKCdwJywgICAgICAgICAgICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMub25PcGVuICAgICAgID0gdGhpcy5vblN0YXRpb25MaXN0UGlja2VyT3Blbi5iaW5kKHRoaXMpO1xyXG5cclxuICAgICAgICBuZXcgRHJhZ2dhYmxlLlNvcnRhYmxlKFt0aGlzLmlucHV0TGlzdCwgdGhpcy5kb21EZWxdLCB7IGRyYWdnYWJsZTogJ2RkJyB9KVxyXG4gICAgICAgICAgICAvLyBIYXZlIHRvIHVzZSB0aW1lb3V0LCB0byBsZXQgRHJhZ2dhYmxlIGZpbmlzaCBzb3J0aW5nIHRoZSBsaXN0XHJcbiAgICAgICAgICAgIC5vbiggJ2RyYWc6c3RvcCcsIGV2ID0+IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5vbkRyYWdTdG9wKGV2KSwgMSkgKVxyXG4gICAgICAgICAgICAub24oICdtaXJyb3I6Y3JlYXRlJywgdGhpcy5vbkRyYWdNaXJyb3JDcmVhdGUuYmluZCh0aGlzKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUG9wdWxhdGVzIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciwgd2l0aCB0aGUgc2VsZWN0ZWQgbGlzdC4gQmVjYXVzZSB0aGlzIHBpY2tlclxyXG4gICAgICogZXh0ZW5kcyBmcm9tIFN0YXRpb25MaXN0LCB0aGlzIGhhbmRsZXIgb3ZlcnJpZGVzIHRoZSAnb25PcGVuJyBkZWxlZ2F0ZSBwcm9wZXJ0eVxyXG4gICAgICogb2YgU3RhdGlvbkxpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBTdGF0aW9uIGxpc3QgZWRpdG9yIGVsZW1lbnQgdG8gb3BlbiBmb3JcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3RhdGlvbkxpc3RQaWNrZXJPcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFNpbmNlIHdlIHNoYXJlIHRoZSBzdGF0aW9uIHBpY2tlciB3aXRoIFN0YXRpb25MaXN0LCBncmFiIGl0XHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmF0dGFjaCh0aGlzLCB0aGlzLm9uQWRkU3RhdGlvbik7XHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLnNlbGVjdE9uQ2xpY2sgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgZW50cmllcyAgICAgPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbkxpc3QodGhpcy5jdXJyZW50Q3R4KS5zbGljZSgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TVEFUSU9OTElTVCh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICAvLyBSZW1vdmUgYWxsIG9sZCBsaXN0IGVsZW1lbnRzXHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuaW5uZXJIVE1MID0gJyc7XHJcblxyXG4gICAgICAgIC8vIEZpbmFsbHksIHBvcHVsYXRlIGxpc3QgZnJvbSB0aGUgY2xpY2tlZCBzdGF0aW9uIGxpc3QgZWxlbWVudFxyXG4gICAgICAgIGVudHJpZXMuZm9yRWFjaCggdiA9PiB0aGlzLmFkZCh2KSApO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZCB7IHN1cGVyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGNsaWNrIGV2ZW50cywgZm9yIGNob29zaW5nIGl0ZW1zICovXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub25DbGljayhldik7XHJcblxyXG4gICAgICAgIGlmIChldi50YXJnZXQgPT09IHRoaXMuYnRuQ2xvc2UpXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICAvLyBGb3IgbW9iaWxlIHVzZXJzLCBzd2l0Y2ggdG8gc3RhdGlvbiBjaG9vc2VyIHNjcmVlbiBpZiBcIkFkZC4uLlwiIHdhcyBjbGlja2VkXHJcbiAgICAgICAgaWYgKGV2LnRhcmdldCA9PT0gdGhpcy5idG5BZGQpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5hZGQoJ2FkZGluZ1N0YXRpb24nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBrZXlib2FyZCBuYXZpZ2F0aW9uIGZvciB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIgKi9cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vbklucHV0KGV2KTtcclxuXHJcbiAgICAgICAgbGV0IGtleSAgICAgPSBldi5rZXk7XHJcbiAgICAgICAgbGV0IGZvY3VzZWQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAvLyBPbmx5IGhhbmRsZSB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIgY29udHJvbFxyXG4gICAgICAgIGlmICggIWZvY3VzZWQgfHwgIXRoaXMuaW5wdXRMaXN0LmNvbnRhaW5zKGZvY3VzZWQpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUga2V5Ym9hcmQgbmF2aWdhdGlvblxyXG4gICAgICAgIGlmIChrZXkgPT09ICdBcnJvd0xlZnQnIHx8IGtleSA9PT0gJ0Fycm93UmlnaHQnKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGRpciA9IChrZXkgPT09ICdBcnJvd0xlZnQnKSA/IC0xIDogMTtcclxuICAgICAgICAgICAgbGV0IG5hdiA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBmb2N1c2VkIGVsZW1lbnRcclxuICAgICAgICAgICAgaWYgKGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dExpc3QpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGV2YW50IHRvIGJlZ2lubmluZyBvciBlbmQgb2YgY29udGFpbmVyXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA9PT0gLTEpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5maXJzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQubGFzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChuYXYpIG5hdi5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGVudHJ5IGRlbGV0aW9uXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0RlbGV0ZScgfHwga2V5ID09PSAnQmFja3NwYWNlJylcclxuICAgICAgICBpZiAoZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0TGlzdClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEZvY3VzIG9uIG5leHQgZWxlbWVudCBvciBwYXJlbnQgb24gZGVsZXRlXHJcbiAgICAgICAgICAgIGxldCBuZXh0ID0gZm9jdXNlZC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgZm9jdXNlZC5uZXh0RWxlbWVudFNpYmxpbmcgICAgIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgdGhpcy5pbnB1dExpc3Q7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnJlbW92ZShmb2N1c2VkKTtcclxuICAgICAgICAgICAgbmV4dC5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlciBmb3Igd2hlbiBhIHN0YXRpb24gaXMgY2hvc2VuICovXHJcbiAgICBwcml2YXRlIG9uQWRkU3RhdGlvbihlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXdFbnRyeSA9IHRoaXMuYWRkKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG5cclxuICAgICAgICAvLyBTd2l0Y2ggYmFjayB0byBidWlsZGVyIHNjcmVlbiwgaWYgb24gbW9iaWxlXHJcbiAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LnJlbW92ZSgnYWRkaW5nU3RhdGlvbicpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlKCk7XHJcblxyXG4gICAgICAgIC8vIEZvY3VzIG9ubHkgaWYgb24gbW9iaWxlLCBzaW5jZSB0aGUgc3RhdGlvbiBsaXN0IGlzIG9uIGEgZGVkaWNhdGVkIHNjcmVlblxyXG4gICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgICAgIG5ld0VudHJ5LmRvbS5mb2N1cygpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgbmV3RW50cnkuZG9tLnNjcm9sbEludG9WaWV3KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpeGVzIG1pcnJvcnMgbm90IGhhdmluZyBjb3JyZWN0IHdpZHRoIG9mIHRoZSBzb3VyY2UgZWxlbWVudCwgb24gY3JlYXRlICovXHJcbiAgICBwcml2YXRlIG9uRHJhZ01pcnJvckNyZWF0ZShldjogRHJhZ2dhYmxlLkRyYWdFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFldi5kYXRhLnNvdXJjZSB8fCAhZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSlcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9TTF9EUkFHX01JU1NJTkcoKSApO1xyXG5cclxuICAgICAgICBldi5kYXRhLnNvdXJjZS5zdHlsZS53aWR0aCA9IGV2LmRhdGEub3JpZ2luYWxTb3VyY2UuY2xpZW50V2lkdGggKyAncHgnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGRyYWdnYWJsZSBzdGF0aW9uIG5hbWUgYmVpbmcgZHJvcHBlZCAqL1xyXG4gICAgcHJpdmF0ZSBvbkRyYWdTdG9wKGV2OiBEcmFnZ2FibGUuRHJhZ0V2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIWV2LmRhdGEub3JpZ2luYWxTb3VyY2UpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKGV2LmRhdGEub3JpZ2luYWxTb3VyY2UucGFyZW50RWxlbWVudCA9PT0gdGhpcy5kb21EZWwpXHJcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGV2LmRhdGEub3JpZ2luYWxTb3VyY2UpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYW5kIGFkZHMgYSBuZXcgZW50cnkgZm9yIHRoZSBidWlsZGVyIGxpc3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBjcmVhdGUgYW4gaXRlbSBmb3JcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhZGQoY29kZTogc3RyaW5nKSA6IFN0YXRpb25MaXN0SXRlbVxyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXdFbnRyeSA9IG5ldyBTdGF0aW9uTGlzdEl0ZW0oY29kZSk7XHJcblxyXG4gICAgICAgIC8vIEFkZCB0aGUgbmV3IGVudHJ5IHRvIHRoZSBzb3J0YWJsZSBsaXN0XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuYXBwZW5kQ2hpbGQobmV3RW50cnkuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdC5oaWRkZW4gPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBEaXNhYmxlIHRoZSBhZGRlZCBzdGF0aW9uIGluIHRoZSBjaG9vc2VyXHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmRpc2FibGUoY29kZSk7XHJcblxyXG4gICAgICAgIC8vIERlbGV0ZSBpdGVtIG9uIGRvdWJsZSBjbGlja1xyXG4gICAgICAgIG5ld0VudHJ5LmRvbS5vbmRibGNsaWNrID0gXyA9PiB0aGlzLnJlbW92ZShuZXdFbnRyeS5kb20pO1xyXG5cclxuICAgICAgICByZXR1cm4gbmV3RW50cnk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZW1vdmVzIHRoZSBnaXZlbiBzdGF0aW9uIGVudHJ5IGVsZW1lbnQgZnJvbSB0aGUgYnVpbGRlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZW50cnkgRWxlbWVudCBvZiB0aGUgc3RhdGlvbiBlbnRyeSB0byByZW1vdmVcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZW1vdmUoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoICF0aGlzLmRvbUxpc3QuY29udGFpbnMoZW50cnkpIClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ0F0dGVtcHRlZCB0byByZW1vdmUgZW50cnkgbm90IG9uIHN0YXRpb24gbGlzdCBidWlsZGVyJyk7XHJcblxyXG4gICAgICAgIC8vIEVuYWJsZWQgdGhlIHJlbW92ZWQgc3RhdGlvbiBpbiB0aGUgY2hvb3NlclxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5lbmFibGUoZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcblxyXG4gICAgICAgIGVudHJ5LnJlbW92ZSgpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlucHV0TGlzdC5jaGlsZHJlbi5sZW5ndGggPT09IDApXHJcbiAgICAgICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0LmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBzdGF0aW9uIGxpc3QgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgY2hpbGRyZW4gPSB0aGlzLmlucHV0TGlzdC5jaGlsZHJlbjtcclxuXHJcbiAgICAgICAgLy8gRG9uJ3QgdXBkYXRlIGlmIGxpc3QgaXMgZW1wdHlcclxuICAgICAgICBpZiAoY2hpbGRyZW4ubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCBsaXN0ID0gW107XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZW50cnkgPSBjaGlsZHJlbltpXSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgIGxpc3QucHVzaChlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCB0ZXh0TGlzdCA9IFN0cmluZ3MuZnJvbVN0YXRpb25MaXN0KGxpc3Quc2xpY2UoKSwgdGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICBsZXQgcXVlcnkgICAgPSBgW2RhdGEtdHlwZT1zdGF0aW9ubGlzdF1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U3RhdGlvbkxpc3QodGhpcy5jdXJyZW50Q3R4LCBsaXN0KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkocXVlcnkpXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRleHRMaXN0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgdGltZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFRpbWVQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIHRpbWUgaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dFRpbWU6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCB0aW1lIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCd0aW1lJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIHRpbWUgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9USU1FKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lLnZhbHVlID0gUkFHLnN0YXRlLmdldFRpbWUodGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICB0aGlzLmlucHV0VGltZS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSB0aW1lIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfVElNRV9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFRpbWUodGhpcy5jdXJyZW50Q3R4LCB0aGlzLmlucHV0VGltZS52YWx1ZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPXRpbWVdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5pbnB1dFRpbWUudmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEJhc2UgY2xhc3MgZm9yIGNvbmZpZ3VyYXRpb24gb2JqZWN0cywgdGhhdCBjYW4gc2F2ZSwgbG9hZCwgYW5kIHJlc2V0IHRoZW1zZWx2ZXMgKi9cclxuYWJzdHJhY3QgY2xhc3MgQ29uZmlnQmFzZTxUIGV4dGVuZHMgQ29uZmlnQmFzZTxUPj5cclxue1xyXG4gICAgLyoqIGxvY2FsU3RvcmFnZSBrZXkgd2hlcmUgY29uZmlnIGlzIGV4cGVjdGVkIHRvIGJlIHN0b3JlZCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VUVElOR1NfS0VZIDogc3RyaW5nID0gJ3NldHRpbmdzJztcclxuXHJcbiAgICAvKiogUHJvdG90eXBlIG9iamVjdCBmb3IgY3JlYXRpbmcgbmV3IGNvcGllcyBvZiBzZWxmICovXHJcbiAgICBwcml2YXRlIHR5cGUgOiAobmV3ICgpID0+IFQpO1xyXG5cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3Rvcih0eXBlOiAobmV3ICgpID0+IFQpKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMudHlwZSA9IHR5cGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBsb2FkcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gZnJvbSBsb2NhbFN0b3JhZ2UsIGlmIGFueSAqL1xyXG4gICAgcHVibGljIGxvYWQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgc2V0dGluZ3MgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oQ29uZmlnQmFzZS5TRVRUSU5HU19LRVkpO1xyXG5cclxuICAgICAgICBpZiAoIXNldHRpbmdzKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGNvbmZpZyA9IEpTT04ucGFyc2Uoc2V0dGluZ3MpO1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIGNvbmZpZyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfTE9BRF9GQUlMKGVyci5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgc2F2ZXMgdGhpcyBjb25maWd1cmF0aW9uIHRvIGxvY2FsU3RvcmFnZSAqL1xyXG4gICAgcHVibGljIHNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSggQ29uZmlnQmFzZS5TRVRUSU5HU19LRVksIEpTT04uc3RyaW5naWZ5KHRoaXMpICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfU0FWRV9GQUlMKGVyci5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgZGVsZXRlcyB0aGlzIGNvbmZpZ3VyYXRpb24gZnJvbSBsb2NhbFN0b3JhZ2UgYW5kIHJlc2V0cyBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKCB0aGlzLCBuZXcgdGhpcy50eXBlKCkgKTtcclxuICAgICAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKENvbmZpZ0Jhc2UuU0VUVElOR1NfS0VZKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGVycilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGFsZXJ0KCBMLkNPTkZJR19SRVNFVF9GQUlMKGVyci5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy88cmVmZXJlbmNlIHBhdGg9XCJjb25maWdCYXNlLnRzXCIvPlxyXG5cclxuLyoqIEhvbGRzIHJ1bnRpbWUgY29uZmlndXJhdGlvbiBmb3IgUkFHICovXHJcbmNsYXNzIENvbmZpZyBleHRlbmRzIENvbmZpZ0Jhc2U8Q29uZmlnPlxyXG57XHJcbiAgICAvKiogSWYgdXNlciBoYXMgY2xpY2tlZCBzaHVmZmxlIGF0IGxlYXN0IG9uY2UgKi9cclxuICAgIHB1YmxpYyAgY2xpY2tlZEdlbmVyYXRlIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFZvbHVtZSBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljICBzcGVlY2hWb2wgICAgICAgOiBudW1iZXIgID0gMS4wO1xyXG4gICAgLyoqIFBpdGNoIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXHJcbiAgICBwdWJsaWMgIHNwZWVjaFBpdGNoICAgICA6IG51bWJlciAgPSAxLjA7XHJcbiAgICAvKiogUmF0ZSBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljICBzcGVlY2hSYXRlICAgICAgOiBudW1iZXIgID0gMS4wO1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gdXNlIHRoZSBWT1ggZW5naW5lICovXHJcbiAgICBwdWJsaWMgIHZveEVuYWJsZWQgICAgICA6IGJvb2xlYW4gPSB0cnVlO1xyXG4gICAgLyoqIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCBvZiB0aGUgVk9YIHZvaWNlIHRvIHVzZSAqL1xyXG4gICAgcHVibGljICB2b3hQYXRoICAgICAgICAgOiBzdHJpbmcgID0gJ2h0dHBzOi8vcm95Y3VydGlzLmdpdGh1Yi5pby9SQUctVk9YLVJveSc7XHJcbiAgICAvKiogUmVsYXRpdmUgb3IgYWJzb2x1dGUgVVJMIG9mIHRoZSBjdXN0b20gVk9YIHZvaWNlIHRvIHVzZSAqL1xyXG4gICAgcHVibGljICB2b3hDdXN0b21QYXRoICAgOiBzdHJpbmcgID0gJyc7XHJcbiAgICAvKiogVk9YIGtleSBvZiB0aGUgY2hpbWUgdG8gdXNlIHByaW9yIHRvIHNwZWFraW5nICovXHJcbiAgICBwdWJsaWMgIHZveENoaW1lICAgICAgICA6IHN0cmluZyAgPSAnJztcclxuICAgIC8qKiBDaG9pY2Ugb2Ygc3BlZWNoIHZvaWNlIHRvIHVzZSwgYXMgZ2V0Vm9pY2VzIGluZGV4IG9yIC0xIGlmIHVuc2V0ICovXHJcbiAgICBwcml2YXRlIF9zcGVlY2hWb2ljZSAgICA6IG51bWJlciAgPSAtMTtcclxuICAgIC8qKiBJbXB1bHNlIHJlc3BvbnNlIHRvIHVzZSBmb3IgVk9YJ3MgcmV2ZXJiICovXHJcbiAgICBwcml2YXRlIF92b3hSZXZlcmIgICAgICA6IHN0cmluZyAgPSAnaXIuc3RhbGJhbnMud2F2JztcclxuXHJcbiAgICAvKipcclxuICAgICAqIENob2ljZSBvZiBzcGVlY2ggdm9pY2UgdG8gdXNlLCBhcyBnZXRWb2ljZXMgaW5kZXguIEJlY2F1c2Ugb2YgdGhlIGFzeW5jIG5hdHVyZSBvZlxyXG4gICAgICogZ2V0Vm9pY2VzLCB0aGUgZGVmYXVsdCB2YWx1ZSB3aWxsIGJlIGZldGNoZWQgZnJvbSBpdCBlYWNoIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIGdldCBzcGVlY2hWb2ljZSgpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVE9ETzogdGhpcyBpcyBwcm9iYWJseSBiZXR0ZXIgb2ZmIHVzaW5nIHZvaWNlIG5hbWVzXHJcbiAgICAgICAgLy8gSWYgdGhlcmUncyBhIHVzZXItZGVmaW5lZCB2YWx1ZSwgdXNlIHRoYXRcclxuICAgICAgICBpZiAgKHRoaXMuX3NwZWVjaFZvaWNlICE9PSAtMSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NwZWVjaFZvaWNlO1xyXG5cclxuICAgICAgICAvLyBTZWxlY3QgRW5nbGlzaCB2b2ljZXMgYnkgZGVmYXVsdFxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwLCB2ID0gUkFHLnNwZWVjaC5icm93c2VyVm9pY2VzOyBpIDwgdi5sZW5ndGggOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFuZyA9IHZbaV0ubGFuZztcclxuXHJcbiAgICAgICAgICAgIGlmIChsYW5nID09PSAnZW4tR0InIHx8IGxhbmcgPT09ICdlbi1VUycpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEVsc2UsIGZpcnN0IHZvaWNlIG9uIHRoZSBsaXN0XHJcbiAgICAgICAgcmV0dXJuIDA7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGNob2ljZSBvZiBzcGVlY2ggdG8gdXNlLCBhcyBnZXRWb2ljZXMgaW5kZXggKi9cclxuICAgIHNldCBzcGVlY2hWb2ljZSh2YWx1ZTogbnVtYmVyKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3NwZWVjaFZvaWNlID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGltcHVsc2UgcmVzcG9uc2UgZmlsZSB0byB1c2UgZm9yIFZPWCBlbmdpbmUncyByZXZlcmIgKi9cclxuICAgIGdldCB2b3hSZXZlcmIoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIC8vIFJlc2V0IGNob2ljZSBvZiByZXZlcmIgaWYgaXQncyBpbnZhbGlkXHJcbiAgICAgICAgbGV0IGNob2ljZXMgPSBPYmplY3Qua2V5cyhWb3hFbmdpbmUuUkVWRVJCUyk7XHJcblxyXG4gICAgICAgIGlmICggIWNob2ljZXMuaW5jbHVkZXModGhpcy5fdm94UmV2ZXJiKSApXHJcbiAgICAgICAgICAgIHRoaXMuX3ZveFJldmVyYiA9IGNob2ljZXNbMF07XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzLl92b3hSZXZlcmI7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGltcHVsc2UgcmVzcG9uc2UgZmlsZSB0byB1c2UgZm9yIFZPWCBlbmdpbmUncyByZXZlcmIgKi9cclxuICAgIHNldCB2b3hSZXZlcmIodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl92b3hSZXZlcmIgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoYXV0b0xvYWQ6IGJvb2xlYW4gPSBmYWxzZSlcclxuICAgIHtcclxuICAgICAgICBzdXBlcihDb25maWcpO1xyXG5cclxuICAgICAgICBpZiAoYXV0b0xvYWQpXHJcbiAgICAgICAgICAgIHRoaXMubG9hZCgpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTGFuZ3VhZ2UgZW50cmllcyBhcmUgdGVtcGxhdGUgZGVsZWdhdGVzICovXHJcbnR5cGUgTGFuZ3VhZ2VFbnRyeSA9ICguLi5wYXJ0czogc3RyaW5nW10pID0+IHN0cmluZyA7XHJcblxyXG5hYnN0cmFjdCBjbGFzcyBCYXNlTGFuZ3VhZ2Vcclxue1xyXG4gICAgW2luZGV4OiBzdHJpbmddIDogTGFuZ3VhZ2VFbnRyeSB8IHN0cmluZyB8IHN0cmluZ1tdO1xyXG5cclxuICAgIC8vIFJBR1xyXG5cclxuICAgIC8qKiBXZWxjb21lIG1lc3NhZ2UsIHNob3duIG9uIG1hcnF1ZWUgb24gZmlyc3QgbG9hZCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgV0VMQ09NRSAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVxdWlyZWQgRE9NIGVsZW1lbnQgaXMgbWlzc2luZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRE9NX01JU1NJTkcgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVxdWlyZWQgZWxlbWVudCBhdHRyaWJ1dGUgaXMgbWlzc2luZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQVRUUl9NSVNTSU5HICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVxdWlyZWQgZGF0YXNldCBlbnRyeSBpcyBtaXNzaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQVRBX01JU1NJTkcgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBCYWQgZGlyZWN0aW9uIGFyZ3VtZW50IGdpdmVuIHRvIGRpcmVjdGlvbmFsIGZ1bmN0aW9uICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBCQURfRElSRUNUSU9OIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBCYWQgYm9vbGVhbiBzdHJpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEJBRF9CT09MRUFOICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFN0YXRlXHJcblxyXG4gICAgLyoqIFN0YXRlIHN1Y2Nlc3NmdWxseSBsb2FkZWQgZnJvbSBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9GUk9NX1NUT1JBR0UgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFN0YXRlIHN1Y2Nlc3NmdWxseSBzYXZlZCB0byBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9UT19TVE9SQUdFICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEluc3RydWN0aW9ucyBmb3IgY29weS9wYXN0aW5nIHNhdmVkIHN0YXRlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9DT1BZX1BBU1RFICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEhlYWRlciBmb3IgZHVtcGVkIHJhdyBzdGF0ZSBKU09OICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9SQVdfSlNPTiAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIENvdWxkIG5vdCBzYXZlIHN0YXRlIHRvIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1NBVkVfRkFJTCAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogTm8gc3RhdGUgd2FzIGF2YWlsYWJsZSB0byBsb2FkICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9TQVZFX01JU1NJTkcgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIE5vbi1leGlzdGVudCBwaHJhc2VzZXQgcmVmZXJlbmNlIHdoZW4gZ2V0dGluZyBmcm9tIHN0YXRlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9OT05FWElTVEFOVF9QSFJBU0VTRVQgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIENvbmZpZ1xyXG5cclxuICAgIC8qKiBDb25maWcgZmFpbGVkIHRvIGxvYWQgZnJvbSBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBDT05GSUdfTE9BRF9GQUlMICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQ29uZmlnIGZhaWxlZCB0byBzYXZlIHRvIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IENPTkZJR19TQVZFX0ZBSUwgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBDb25maWcgZmFpbGVkIHRvIGNsZWFyIGZyb20gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQ09ORklHX1JFU0VUX0ZBSUwgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIERhdGFiYXNlXHJcblxyXG4gICAgLyoqIEdpdmVuIGVsZW1lbnQgaXNuJ3QgYSBwaHJhc2VzZXQgaUZyYW1lICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9FTEVNRU5UX05PVF9QSFJBU0VTRVRfSUZSQU1FIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBVbmtub3duIHN0YXRpb24gY29kZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfVU5LTk9XTl9TVEFUSU9OICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU3RhdGlvbiBjb2RlIHdpdGggYmxhbmsgbmFtZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfRU1QVFlfU1RBVElPTiAgICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUGlja2luZyB0b28gbWFueSBzdGF0aW9uIGNvZGVzIGluIG9uZSBnbyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfVE9PX01BTllfU1RBVElPTlMgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gVG9vbGJhclxyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIHRleHQgZm9yIHRvb2xiYXIgYnV0dG9uc1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9QTEFZICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NUT1AgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU0hVRkZMRSAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TQVZFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX0xPQUQgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU0VUVElOR1MgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIEVkaXRvclxyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIHRleHQgZm9yIGVkaXRvciBlbGVtZW50c1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfQ09BQ0ggICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfRVhDVVNFICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfSU5URUdFUiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfTkFNRUQgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfT1BUX09QRU4gICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfT1BUX0NMT1NFICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfUEhSQVNFU0VUICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfUExBVEZPUk0gICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfU0VSVklDRSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfU1RBVElPTiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfU1RBVElPTkxJU1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfVElNRSAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8qKiBJbml0aWFsIG1lc3NhZ2Ugd2hlbiBzZXR0aW5nIHVwIGVkaXRvciAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX0lOSVQgICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXBsYWNlbWVudCB0ZXh0IGZvciB1bmtub3duIGVkaXRvciBlbGVtZW50cyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX1VOS05PV05fRUxFTUVOVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXBsYWNlbWVudCB0ZXh0IGZvciBlZGl0b3IgcGhyYXNlcyB3aXRoIHVua25vd24gcmVmZXJlbmNlIGlkcyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX1VOS05PV05fUEhSQVNFICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXBsYWNlbWVudCB0ZXh0IGZvciBlZGl0b3IgcGhyYXNlc2V0cyB3aXRoIHVua25vd24gcmVmZXJlbmNlIGlkcyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX1VOS05PV05fUEhSQVNFU0VUIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBQaHJhc2VyXHJcblxyXG4gICAgLyoqIFRvbyBtYW55IGxldmVscyBvZiByZWN1cnNpb24gaW4gdGhlIHBocmFzZXIgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBIUkFTRVJfVE9PX1JFQ1VSU0lWRSA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gUGlja2Vyc1xyXG5cclxuICAgIC8vIEhlYWRlcnMgZm9yIHBpY2tlciBkaWFsb2dzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfQ09BQ0ggICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX0VYQ1VTRSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9JTlRFR0VSICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfTkFNRUQgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1BIUkFTRVNFVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9QTEFURk9STSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfU0VSVklDRSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1NUQVRJT04gICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9TVEFUSU9OTElTVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfVElNRSAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIGFuZCBwbGFjZWhvbGRlciB0ZXh0IGZvciBwaWNrZXIgY29udHJvbHNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfR0VORVJJQ19UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9HRU5FUklDX1BIICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0NPQUNIX1QgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfRVhDVVNFX1QgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9FWENVU0VfUEggICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0VYQ1VTRV9JVEVNX1QgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfSU5UX1QgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9OQU1FRF9UICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX05BTUVEX1BIICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfTkFNRURfSVRFTV9UICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfUEggICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9JVEVNX1QgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QTEFUX05VTUJFUl9UICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BMQVRfTEVUVEVSX1QgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVl9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWX1BIICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZfSVRFTV9UICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU1RBVElPTl9UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TVEFUSU9OX1BIICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NUQVRJT05fSVRFTV9UIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQUREICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9BRERfVCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0NMT1NFICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQ0xPU0VfVCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9FTVBUWSAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RSQUdfVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfREVMRVRFICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9ERUxFVEVfVCAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0lURU1fVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfVElNRV9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8qKiBDb2FjaCBwaWNrZXIncyBvbkNoYW5nZSBmaXJlZCB3aXRob3V0IGNvbnRleHQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfQ09BQ0hfTUlTU0lOR19TVEFURSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBJbnRlZ2VyIHBpY2tlcidzIG9uQ2hhbmdlIGZpcmVkIHdpdGhvdXQgY29udGV4dCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9JTlRfTUlTU0lOR19TVEFURSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFBocmFzZXNldCBwaWNrZXIncyBvblNlbGVjdCBmaXJlZCB3aXRob3V0IHJlZmVyZW5jZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX01JU1NJTkdfU1RBVEUgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFNlcnZpY2UgcGlja2VyJ3Mgb25TZWxlY3QgZmlyZWQgd2l0aG91dCByZWZlcmVuY2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVklDRV9NSVNTSU5HX1NUQVRFIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTZXJ2aWNlIHBpY2tlcidzIG9uQ2hhbmdlIGZpcmVkIHdpdGhvdXQgcmVmZXJlbmNlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1RJTUVfTUlTU0lOR19TVEFURSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUGhyYXNlc2V0IHBpY2tlciBvcGVuZWQgZm9yIHVua25vd24gcGhyYXNlc2V0ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfVU5LTk9XTiAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogRHJhZyBtaXJyb3IgY3JlYXRlIGV2ZW50IGluIHN0YXRpb24gbGlzdCBtaXNzaW5nIHN0YXRlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RSQUdfTUlTU0lORyAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gU2V0dGluZ3NcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSBhbmQgbGFiZWwgdGV4dCBmb3Igc2V0dGluZ3MgZWxlbWVudHNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfQ09ORklSTSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX0NPTkZJUk1fVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9ET05FICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU0FWRSAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NBVkVfVCAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0ggICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX0NIT0lDRSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9FTVBUWSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfVk9MICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1BJVENIICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9SQVRFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfVEVTVCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1RFU1RfVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX0xFR0FMICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gVUkgY29udHJvbHNcclxuXHJcbiAgICAvKiogSGVhZGVyIGZvciB0aGUgXCJ0b28gc21hbGxcIiB3YXJuaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBXQVJOX1NIT1JUX0hFQURFUiA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQm9keSB0ZXh0IGZvciB0aGUgXCJ0b28gc21hbGxcIiB3YXJuaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBXQVJOX1NIT1JUICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gTWlzYy4gY29uc3RhbnRzXHJcblxyXG4gICAgLyoqIEFycmF5IG9mIHRoZSBlbnRpcmUgYWxwaGFiZXQgb2YgdGhlIGxhbmd1YWdlLCBmb3IgY29hY2ggbGV0dGVycyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgTEVUVEVSUyA6IHN0cmluZztcclxuICAgIC8qKiBBcnJheSBvZiBudW1iZXJzIGFzIHdvcmRzIChlLmcuIHplcm8sIG9uZSwgdHdvKSwgbWF0Y2hpbmcgdGhlaXIgaW5kZXggKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERJR0lUUyAgOiBzdHJpbmdbXTtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkJhc2VMYW5ndWFnZS50c1wiLz5cclxuXHJcbmNsYXNzIEVuZ2xpc2hMYW5ndWFnZSBleHRlbmRzIEJhc2VMYW5ndWFnZVxyXG57XHJcbiAgICBXRUxDT01FICAgICAgID0gKCkgPT4gJ1dlbGNvbWUgdG8gUmFpbCBBbm5vdW5jZW1lbnQgR2VuZXJhdG9yLic7XHJcbiAgICBET01fTUlTU0lORyAgID0gKHE6IHN0cmluZykgPT4gYFJlcXVpcmVkIERPTSBlbGVtZW50IGlzIG1pc3Npbmc6ICcke3F9J2A7XHJcbiAgICBBVFRSX01JU1NJTkcgID0gKGE6IHN0cmluZykgPT4gYFJlcXVpcmVkIGF0dHJpYnV0ZSBpcyBtaXNzaW5nOiAnJHthfSdgO1xyXG4gICAgREFUQV9NSVNTSU5HICA9IChrOiBzdHJpbmcpID0+IGBSZXF1aXJlZCBkYXRhc2V0IGtleSBpcyBtaXNzaW5nIG9yIGVtcHR5OiAnJHtrfSdgO1xyXG4gICAgQkFEX0RJUkVDVElPTiA9ICh2OiBzdHJpbmcpID0+IGBEaXJlY3Rpb24gbmVlZHMgdG8gYmUgLTEgb3IgMSwgbm90ICcke3Z9J2A7XHJcbiAgICBCQURfQk9PTEVBTiAgID0gKHY6IHN0cmluZykgPT4gYEdpdmVuIHN0cmluZyBkb2VzIG5vdCByZXByZXNlbnQgYSBib29sZWFuOiAnJHt2fSdgO1xyXG5cclxuICAgIFNUQVRFX0ZST01fU1RPUkFHRSAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1N0YXRlIGhhcyBiZWVuIGxvYWRlZCBmcm9tIHN0b3JhZ2UuJztcclxuICAgIFNUQVRFX1RPX1NUT1JBR0UgICAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1N0YXRlIGhhcyBiZWVuIHNhdmVkIHRvIHN0b3JhZ2UsIGFuZCBkdW1wZWQgdG8gY29uc29sZS4nO1xyXG4gICAgU1RBVEVfQ09QWV9QQVNURSAgICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnJWNDb3B5IGFuZCBwYXN0ZSB0aGlzIGluIGNvbnNvbGUgdG8gbG9hZCBsYXRlcjonO1xyXG4gICAgU1RBVEVfUkFXX0pTT04gICAgICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnJWNSYXcgSlNPTiBzdGF0ZTonO1xyXG4gICAgU1RBVEVfU0FWRV9GQUlMICAgICAgICAgICAgID0gKG1zZzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBTb3JyeSwgc3RhdGUgY291bGQgbm90IGJlIHNhdmVkIHRvIHN0b3JhZ2U6ICR7bXNnfS5gO1xyXG4gICAgU1RBVEVfU0FWRV9NSVNTSU5HICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnU29ycnksIG5vIHN0YXRlIHdhcyBmb3VuZCBpbiBzdG9yYWdlLic7XHJcbiAgICBTVEFURV9OT05FWElTVEFOVF9QSFJBU0VTRVQgPSAocjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBBdHRlbXB0ZWQgdG8gZ2V0IGNob3NlbiBpbmRleCBmb3IgcGhyYXNlc2V0ICgke3J9KSB0aGF0IGRvZXNuJ3QgZXhpc3RgO1xyXG5cclxuICAgIENPTkZJR19MT0FEX0ZBSUwgID0gKG1zZzogc3RyaW5nKSA9PiBgQ291bGQgbm90IGxvYWQgc2V0dGluZ3M6ICR7bXNnfWA7XHJcbiAgICBDT05GSUdfU0FWRV9GQUlMICA9IChtc2c6IHN0cmluZykgPT4gYENvdWxkIG5vdCBzYXZlIHNldHRpbmdzOiAke21zZ31gO1xyXG4gICAgQ09ORklHX1JFU0VUX0ZBSUwgPSAobXNnOiBzdHJpbmcpID0+IGBDb3VsZCBub3QgY2xlYXIgc2V0dGluZ3M6ICR7bXNnfWA7XHJcblxyXG4gICAgREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRSA9IChlOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENvbmZpZ3VyZWQgcGhyYXNlc2V0IGVsZW1lbnQgcXVlcnkgKCR7ZX0pIGRvZXMgbm90IHBvaW50IHRvIGFuIGlGcmFtZSBlbWJlZGA7XHJcbiAgICBEQl9VTktOT1dOX1NUQVRJT04gICA9IChjOiBzdHJpbmcpID0+IGBVTktOT1dOIFNUQVRJT046ICR7Y31gO1xyXG4gICAgREJfRU1QVFlfU1RBVElPTiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBTdGF0aW9uIGRhdGFiYXNlIGFwcGVhcnMgdG8gY29udGFpbiBhbiBlbXB0eSBuYW1lIGZvciBjb2RlICcke2N9J2A7XHJcbiAgICBEQl9UT09fTUFOWV9TVEFUSU9OUyA9ICgpID0+ICdQaWNraW5nIHRvbyBtYW55IHN0YXRpb25zIHRoYW4gdGhlcmUgYXJlIGF2YWlsYWJsZSc7XHJcblxyXG4gICAgVE9PTEJBUl9QTEFZICAgICA9ICgpID0+ICdQbGF5IHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NUT1AgICAgID0gKCkgPT4gJ1N0b3AgcGxheWluZyBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TSFVGRkxFICA9ICgpID0+ICdHZW5lcmF0ZSByYW5kb20gcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU0FWRSAgICAgPSAoKSA9PiAnU2F2ZSBzdGF0ZSB0byBzdG9yYWdlJztcclxuICAgIFRPT0xCQVJfTE9BRCAgICAgPSAoKSA9PiAnUmVjYWxsIHN0YXRlIGZyb20gc3RvcmFnZSc7XHJcbiAgICBUT09MQkFSX1NFVFRJTkdTID0gKCkgPT4gJ09wZW4gc2V0dGluZ3MnO1xyXG5cclxuICAgIFRJVExFX0NPQUNIICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgY29hY2ggKCcke2N9JylgO1xyXG4gICAgVElUTEVfRVhDVVNFICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdDbGljayB0byBjaGFuZ2UgdGhpcyBleGN1c2UnO1xyXG4gICAgVElUTEVfSU5URUdFUiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBudW1iZXIgKCcke2N9JylgO1xyXG4gICAgVElUTEVfTkFNRUQgICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgIFwiQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdHJhaW4ncyBuYW1lXCI7XHJcbiAgICBUSVRMRV9PUFRfT1BFTiAgICA9ICh0OiBzdHJpbmcsIHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gb3BlbiB0aGlzIG9wdGlvbmFsICR7dH0gKCcke3J9JylgO1xyXG4gICAgVElUTEVfT1BUX0NMT1NFICAgPSAodDogc3RyaW5nLCByOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNsb3NlIHRoaXMgb3B0aW9uYWwgJHt0fSAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9QSFJBU0VTRVQgICA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGUgcGhyYXNlIHVzZWQgaW4gdGhpcyBzZWN0aW9uICgnJHtyfScpYDtcclxuICAgIFRJVExFX1BMQVRGT1JNICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICBcIkNsaWNrIHRvIGNoYW5nZSB0aGlzIHRyYWluJ3MgcGxhdGZvcm1cIjtcclxuICAgIFRJVExFX1NFUlZJQ0UgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc2VydmljZSAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9TVEFUSU9OICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHN0YXRpb24gKCcke2N9JylgO1xyXG4gICAgVElUTEVfU1RBVElPTkxJU1QgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBzdGF0aW9uIGxpc3QgKCcke2N9JylgO1xyXG4gICAgVElUTEVfVElNRSAgICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyB0aW1lICgnJHtjfScpYDtcclxuXHJcbiAgICBFRElUT1JfSU5JVCAgICAgICAgICAgICAgPSAoKSA9PiAnUGxlYXNlIHdhaXQuLi4nO1xyXG4gICAgRURJVE9SX1VOS05PV05fRUxFTUVOVCAgID0gKG46IHN0cmluZykgPT4gYChVTktOT1dOIFhNTCBFTEVNRU5UOiAke259KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0UgICAgPSAocjogc3RyaW5nKSA9PiBgKFVOS05PV04gUEhSQVNFOiAke3J9KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQgPSAocjogc3RyaW5nKSA9PiBgKFVOS05PV04gUEhSQVNFU0VUOiAke3J9KWA7XHJcblxyXG4gICAgUEhSQVNFUl9UT09fUkVDVVJTSVZFID0gKCkgPT5cclxuICAgICAgICAnVG9vIG1hbnkgbGV2ZWxzIG9mIHJlY3Vyc2lvbiB3aGlsc3QgcHJvY2Vzc2luZyBwaHJhc2UnO1xyXG5cclxuICAgIEhFQURFUl9DT0FDSCAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBjb2FjaCBsZXR0ZXIgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfRVhDVVNFICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGFuIGV4Y3VzZSc7XHJcbiAgICBIRUFERVJfSU5URUdFUiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgbnVtYmVyIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX05BTUVEICAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICAnUGljayBhIG5hbWVkIHRyYWluJztcclxuICAgIEhFQURFUl9QSFJBU0VTRVQgICA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBwaHJhc2UgZm9yIHRoZSAnJHtyfScgc2VjdGlvbmA7XHJcbiAgICBIRUFERVJfUExBVEZPUk0gICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGEgcGxhdGZvcm0nO1xyXG4gICAgSEVBREVSX1NFUlZJQ0UgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHNlcnZpY2UgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfU1RBVElPTiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgc3RhdGlvbiBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9TVEFUSU9OTElTVCA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYEJ1aWxkIGEgc3RhdGlvbiBsaXN0IGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1RJTUUgICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHRpbWUgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcblxyXG4gICAgUF9HRU5FUklDX1QgICAgICA9ICgpID0+ICdMaXN0IG9mIGNob2ljZXMnO1xyXG4gICAgUF9HRU5FUklDX1BIICAgICA9ICgpID0+ICdGaWx0ZXIgY2hvaWNlcy4uLic7XHJcbiAgICBQX0NPQUNIX1QgICAgICAgID0gKCkgPT4gJ0NvYWNoIGxldHRlcic7XHJcbiAgICBQX0VYQ1VTRV9UICAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgZGVsYXkgb3IgY2FuY2VsbGF0aW9uIGV4Y3VzZXMnO1xyXG4gICAgUF9FWENVU0VfUEggICAgICA9ICgpID0+ICdGaWx0ZXIgZXhjdXNlcy4uLic7XHJcbiAgICBQX0VYQ1VTRV9JVEVNX1QgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIGV4Y3VzZSc7XHJcbiAgICBQX0lOVF9UICAgICAgICAgID0gKCkgPT4gJ0ludGVnZXIgdmFsdWUnO1xyXG4gICAgUF9OQU1FRF9UICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHRyYWluIG5hbWVzJztcclxuICAgIFBfTkFNRURfUEggICAgICAgPSAoKSA9PiAnRmlsdGVyIHRyYWluIG5hbWUuLi4nO1xyXG4gICAgUF9OQU1FRF9JVEVNX1QgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBuYW1lJztcclxuICAgIFBfUFNFVF9UICAgICAgICAgPSAoKSA9PiAnTGlzdCBvZiBwaHJhc2VzJztcclxuICAgIFBfUFNFVF9QSCAgICAgICAgPSAoKSA9PiAnRmlsdGVyIHBocmFzZXMuLi4nO1xyXG4gICAgUF9QU0VUX0lURU1fVCAgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBwaHJhc2UnO1xyXG4gICAgUF9QTEFUX05VTUJFUl9UICA9ICgpID0+ICdQbGF0Zm9ybSBudW1iZXInO1xyXG4gICAgUF9QTEFUX0xFVFRFUl9UICA9ICgpID0+ICdPcHRpb25hbCBwbGF0Zm9ybSBsZXR0ZXInO1xyXG4gICAgUF9TRVJWX1QgICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHNlcnZpY2UgbmFtZXMnO1xyXG4gICAgUF9TRVJWX1BIICAgICAgICA9ICgpID0+ICdGaWx0ZXIgc2VydmljZXMuLi4nO1xyXG4gICAgUF9TRVJWX0lURU1fVCAgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBzZXJ2aWNlJztcclxuICAgIFBfU1RBVElPTl9UICAgICAgPSAoKSA9PiAnTGlzdCBvZiBzdGF0aW9uIG5hbWVzJztcclxuICAgIFBfU1RBVElPTl9QSCAgICAgPSAoKSA9PiAnRmlsdGVyIHN0YXRpb25zLi4uJztcclxuICAgIFBfU1RBVElPTl9JVEVNX1QgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IG9yIGFkZCB0aGlzIHN0YXRpb24nO1xyXG4gICAgUF9TTF9BREQgICAgICAgICA9ICgpID0+ICdBZGQgc3RhdGlvbi4uLic7XHJcbiAgICBQX1NMX0FERF9UICAgICAgID0gKCkgPT4gJ0FkZCBzdGF0aW9uIHRvIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0NMT1NFICAgICAgID0gKCkgPT4gJ0Nsb3NlJztcclxuICAgIFBfU0xfQ0xPU0VfVCAgICAgPSAoKSA9PiAnQ2xvc2UgdGhpcyBwaWNrZXInO1xyXG4gICAgUF9TTF9FTVBUWSAgICAgICA9ICgpID0+ICdQbGVhc2UgYWRkIGF0IGxlYXN0IG9uZSBzdGF0aW9uIHRvIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0RSQUdfVCAgICAgID0gKCkgPT4gJ0RyYWdnYWJsZSBzZWxlY3Rpb24gb2Ygc3RhdGlvbnMgZm9yIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0RFTEVURSAgICAgID0gKCkgPT4gJ0Ryb3AgaGVyZSB0byBkZWxldGUnO1xyXG4gICAgUF9TTF9ERUxFVEVfVCAgICA9ICgpID0+ICdEcm9wIHN0YXRpb24gaGVyZSB0byBkZWxldGUgaXQgZnJvbSB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9JVEVNX1QgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ0RyYWcgdG8gcmVvcmRlcjsgZG91YmxlLWNsaWNrIG9yIGRyYWcgaW50byBkZWxldGUgem9uZSB0byByZW1vdmUnO1xyXG4gICAgUF9USU1FX1QgICAgICAgICA9ICgpID0+ICdUaW1lIGVkaXRvcic7XHJcblxyXG4gICAgUF9DT0FDSF9NSVNTSU5HX1NUQVRFICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIGNvYWNoIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfSU5UX01JU1NJTkdfU1RBVEUgICAgID0gKCkgPT4gJ29uQ2hhbmdlIGZpcmVkIGZvciBpbnRlZ2VyIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfUFNFVF9NSVNTSU5HX1NUQVRFICAgID0gKCkgPT4gJ29uU2VsZWN0IGZpcmVkIGZvciBwaHJhc2VzZXQgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9TRVJWSUNFX01JU1NJTkdfU1RBVEUgPSAoKSA9PiAnb25TZWxlY3QgZmlyZWQgZm9yIHNlcnZpY2UgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9USU1FX01JU1NJTkdfU1RBVEUgICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIHRpbWUgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9QU0VUX1VOS05PV04gICAgICAgICAgPSAocjogc3RyaW5nKSA9PiBgUGhyYXNlc2V0ICcke3J9JyBkb2Vzbid0IGV4aXN0YDtcclxuICAgIFBfU0xfRFJBR19NSVNTSU5HICAgICAgID0gKCkgPT4gJ0RyYWdnYWJsZTogTWlzc2luZyBzb3VyY2UgZWxlbWVudHMgZm9yIG1pcnJvciBldmVudCc7XHJcblxyXG4gICAgU1RfUkVTRVQgICAgICAgICAgID0gKCkgPT4gJ1Jlc2V0IHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX1QgICAgICAgICA9ICgpID0+ICdSZXNldCBzZXR0aW5ncyB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9DT05GSVJNICAgPSAoKSA9PiAnQXJlIHlvdSBzdXJlPyc7XHJcbiAgICBTVF9SRVNFVF9DT05GSVJNX1QgPSAoKSA9PiAnQ29uZmlybSByZXNldCB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9ET05FICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTZXR0aW5ncyBoYXZlIGJlZW4gcmVzZXQgdG8gdGhlaXIgZGVmYXVsdHMsIGFuZCBkZWxldGVkIGZyb20gc3RvcmFnZS4nO1xyXG4gICAgU1RfU0FWRSAgICAgICAgICAgID0gKCkgPT4gJ1NhdmUgJiBjbG9zZSc7XHJcbiAgICBTVF9TQVZFX1QgICAgICAgICAgPSAoKSA9PiAnU2F2ZSBhbmQgY2xvc2Ugc2V0dGluZ3MnO1xyXG4gICAgU1RfU1BFRUNIICAgICAgICAgID0gKCkgPT4gJ1NwZWVjaCc7XHJcbiAgICBTVF9TUEVFQ0hfQ0hPSUNFICAgPSAoKSA9PiAnVm9pY2UnO1xyXG4gICAgU1RfU1BFRUNIX0VNUFRZICAgID0gKCkgPT4gJ05vbmUgYXZhaWxhYmxlJztcclxuICAgIFNUX1NQRUVDSF9WT0wgICAgICA9ICgpID0+ICdWb2x1bWUnO1xyXG4gICAgU1RfU1BFRUNIX1BJVENIICAgID0gKCkgPT4gJ1BpdGNoJztcclxuICAgIFNUX1NQRUVDSF9SQVRFICAgICA9ICgpID0+ICdSYXRlJztcclxuICAgIFNUX1NQRUVDSF9URVNUICAgICA9ICgpID0+ICdUZXN0IHNwZWVjaCc7XHJcbiAgICBTVF9TUEVFQ0hfVEVTVF9UICAgPSAoKSA9PiAnUGxheSBhIHNwZWVjaCBzYW1wbGUgd2l0aCB0aGUgY3VycmVudCBzZXR0aW5ncyc7XHJcbiAgICBTVF9MRUdBTCAgICAgICAgICAgPSAoKSA9PiAnTGVnYWwgJiBBY2tub3dsZWRnZW1lbnRzJztcclxuXHJcbiAgICBXQVJOX1NIT1JUX0hFQURFUiA9ICgpID0+ICdcIk1heSBJIGhhdmUgeW91ciBhdHRlbnRpb24gcGxlYXNlLi4uXCInO1xyXG4gICAgV0FSTl9TSE9SVCAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdUaGlzIGRpc3BsYXkgaXMgdG9vIHNob3J0IHRvIHN1cHBvcnQgUkFHLiBQbGVhc2UgbWFrZSB0aGlzIHdpbmRvdyB0YWxsZXIsIG9yJyArXHJcbiAgICAgICAgJyByb3RhdGUgeW91ciBkZXZpY2UgZnJvbSBsYW5kc2NhcGUgdG8gcG9ydHJhaXQuJztcclxuXHJcbiAgICAvLyBUT0RPOiBUaGVzZSBkb24ndCBmaXQgaGVyZTsgdGhpcyBzaG91bGQgZ28gaW4gdGhlIGRhdGFcclxuICAgIExFVFRFUlMgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVonO1xyXG4gICAgRElHSVRTICA9IFtcclxuICAgICAgICAnemVybycsICAgICAnb25lJywgICAgICd0d28nLCAgICAgJ3RocmVlJywgICAgICdmb3VyJywgICAgICdmaXZlJywgICAgJ3NpeCcsXHJcbiAgICAgICAgJ3NldmVuJywgICAgJ2VpZ2h0JywgICAnbmluZScsICAgICd0ZW4nLCAgICAgICAnZWxldmVuJywgICAndHdlbHZlJywgICd0aGlydGVlbicsXHJcbiAgICAgICAgJ2ZvdXJ0ZWVuJywgJ2ZpZnRlZW4nLCAnc2l4dGVlbicsICdzZXZlbnRlZW4nLCAnZWlnaHRlZW4nLCAnbmludGVlbicsICd0d2VudHknXHJcbiAgICBdO1xyXG5cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqXHJcbiAqIEhvbGRzIG1ldGhvZHMgZm9yIHByb2Nlc3NpbmcgZWFjaCB0eXBlIG9mIHBocmFzZSBlbGVtZW50IGludG8gSFRNTCwgd2l0aCBkYXRhIHRha2VuXHJcbiAqIGZyb20gdGhlIGN1cnJlbnQgc3RhdGUuIEVhY2ggbWV0aG9kIHRha2VzIGEgY29udGV4dCBvYmplY3QsIGhvbGRpbmcgZGF0YSBmb3IgdGhlXHJcbiAqIGN1cnJlbnQgWE1MIGVsZW1lbnQgYmVpbmcgcHJvY2Vzc2VkIGFuZCB0aGUgWE1MIGRvY3VtZW50IGJlaW5nIHVzZWQuXHJcbiAqL1xyXG5jbGFzcyBFbGVtZW50UHJvY2Vzc29yc1xyXG57XHJcbiAgICAvKiogRmlsbHMgaW4gY29hY2ggbGV0dGVycyBmcm9tIEEgdG8gWiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb2FjaChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9DT0FDSChjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRDb2FjaChjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBleGN1c2UsIGZvciBhIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBleGN1c2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9FWENVU0UoKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5leGN1c2U7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBpbnRlZ2Vycywgb3B0aW9uYWxseSB3aXRoIG5vdW5zIGFuZCBpbiB3b3JkIGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50ZWdlcihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzaW5ndWxhciA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnc2luZ3VsYXInKTtcclxuICAgICAgICBsZXQgcGx1cmFsICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3BsdXJhbCcpO1xyXG4gICAgICAgIGxldCB3b3JkcyAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnd29yZHMnKTtcclxuXHJcbiAgICAgICAgbGV0IGludCAgICA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKGNvbnRleHQpO1xyXG4gICAgICAgIGxldCBpbnRTdHIgPSAod29yZHMgJiYgd29yZHMudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoaW50ID09PSAxICYmIHNpbmd1bGFyKVxyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3Npbmd1bGFyfWA7XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHBsdXJhbClcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHtwbHVyYWx9YDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0lOVEVHRVIoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHI7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG5cclxuICAgICAgICBpZiAoc2luZ3VsYXIpIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3Npbmd1bGFyJ10gPSBzaW5ndWxhcjtcclxuICAgICAgICBpZiAocGx1cmFsKSAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3BsdXJhbCddICAgPSBwbHVyYWw7XHJcbiAgICAgICAgaWYgKHdvcmRzKSAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wyd3b3JkcyddICAgID0gd29yZHM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBuYW1lZChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX05BTUVEKCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUubmFtZWQ7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBJbmNsdWRlcyBhIHByZXZpb3VzbHkgZGVmaW5lZCBwaHJhc2UsIGJ5IGl0cyBgaWRgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBocmFzZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBwaHJhc2UgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlKHJlZik7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgICAgID0gJyc7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsncmVmJ10gPSByZWY7XHJcblxyXG4gICAgICAgIGlmICghcGhyYXNlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX1BIUkFTRShyZWYpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGhyYXNlcyB3aXRoIGEgY2hhbmNlIHZhbHVlIGFzIGNvbGxhcHNpYmxlXHJcbiAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcmVmKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQoIEVsZW1lbnRQcm9jZXNzb3JzLndyYXBUb0lubmVyKHBocmFzZSkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwaHJhc2UgZnJvbSBhIHByZXZpb3VzbHkgZGVmaW5lZCBwaHJhc2VzZXQsIGJ5IGl0cyBgaWRgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBocmFzZXNldChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgICAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZik7XHJcbiAgICAgICAgbGV0IGZvcmNlZElkeCA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnaWR4Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGlkeCA9IGZvcmNlZElkeFxyXG4gICAgICAgICAgICA/IHBhcnNlSW50KGZvcmNlZElkeClcclxuICAgICAgICAgICAgOiBSQUcuc3RhdGUuZ2V0UGhyYXNlc2V0SWR4KHJlZik7XHJcblxyXG4gICAgICAgIGxldCBwaHJhc2UgPSBwaHJhc2VzZXQuY2hpbGRyZW5baWR4XSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnaWR4J10gPSBmb3JjZWRJZHggfHwgaWR4LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaHJhc2VzZXRzIHdpdGggYSBjaGFuY2UgdmFsdWUgYXMgY29sbGFwc2libGVcclxuICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5tYWtlQ29sbGFwc2libGUoY3R4LCByZWYpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5hcHBlbmRDaGlsZCggRWxlbWVudFByb2Nlc3NvcnMud3JhcFRvSW5uZXIocGhyYXNlKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgY3VycmVudCBwbGF0Zm9ybSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwbGF0Zm9ybShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1BMQVRGT1JNKCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUucGxhdGZvcm0uam9pbignJyk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgcmFpbCBuZXR3b3JrIG5hbWUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2VydmljZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TRVJWSUNFKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldFNlcnZpY2UoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBzdGF0aW9uIG5hbWVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRpb24oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBjb2RlICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb24oY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TVEFUSU9OKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBzdGF0aW9uIGxpc3RzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRpb25saXN0KGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCAgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IHN0YXRpb25zICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KGNvbnRleHQpLnNsaWNlKCk7XHJcbiAgICAgICAgbGV0IHN0YXRpb25MaXN0ID0gU3RyaW5ncy5mcm9tU3RhdGlvbkxpc3Qoc3RhdGlvbnMsIGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU1RBVElPTkxJU1QoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBzdGF0aW9uTGlzdDtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSB0aW1lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRpbWUoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfVElNRShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRUaW1lKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdm94IHBhcnRzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZveChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2tleScpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBMb2NhbGl6ZVxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ICAgID0gY3R4LnhtbEVsZW1lbnQudGV4dENvbnRlbnQ7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgICAgPSBgQ2xpY2sgdG8gZWRpdCB0aGlzIHBocmFzZSAoJHtrZXl9KWA7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgICAgPSAxO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2tleSddID0ga2V5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHVua25vd24gZWxlbWVudHMgd2l0aCBhbiBpbmxpbmUgZXJyb3IgbWVzc2FnZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB1bmtub3duKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgbmFtZSA9IGN0eC54bWxFbGVtZW50Lm5vZGVOYW1lO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fRUxFTUVOVChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEF0dGFjaGVzIGNoYW5jZSBhbmQgYSBwcmUtZGV0ZXJtaW5lZCBjb2xsYXBzZSBzdGF0ZSBmb3IgYSBnaXZlbiBwaHJhc2UgZWxlbWVudCwgaWZcclxuICAgICAqIGl0IGRvZXMgaGF2ZSBhIGNoYW5jZSBhdHRyaWJ1ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY3R4IENvbnRleHQgb2YgdGhlIGN1cnJlbnQgcGhyYXNlIGVsZW1lbnQgYmVpbmcgcHJvY2Vzc2VkXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgKG9yIHBpY2spIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBtYWtlQ29sbGFwc2libGUoY3R4OiBQaHJhc2VDb250ZXh0LCByZWY6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhY3R4LnhtbEVsZW1lbnQuaGFzQXR0cmlidXRlKCdjaGFuY2UnKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGNoYW5jZSAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnY2hhbmNlJykhO1xyXG4gICAgICAgIGxldCBjb2xsYXBzZWQgPSBSQUcuc3RhdGUuZ2V0Q29sbGFwc2VkKCByZWYsIHBhcnNlSW50KGNoYW5jZSkgKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY2hhbmNlJ10gPSBjaGFuY2U7XHJcblxyXG4gICAgICAgIENvbGxhcHNpYmxlcy5zZXQoY3R4Lm5ld0VsZW1lbnQsIGNvbGxhcHNlZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50IGludG8gYSBuZXcgaW5uZXIgc3BhbiB0YWcsIHNvIHRoYXQgdGhleVxyXG4gICAgICogY2FuIGJlIG1hZGUgY29sbGFwc2libGUgb3IgYnVuZGxlZCB3aXRoIGJ1dHRvbnMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNvdXJjZSBQYXJlbnQgdG8gY2xvbmUgdGhlIGNoaWxkcmVuIG9mLCBpbnRvIGEgd3JhcHBlclxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyB3cmFwVG9Jbm5lcihzb3VyY2U6IEhUTUxFbGVtZW50KSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGlubmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG5cclxuICAgICAgICBpbm5lci5jbGFzc0xpc3QuYWRkKCdpbm5lcicpO1xyXG4gICAgICAgIERPTS5jbG9uZUludG8oc291cmNlLCBpbm5lcik7XHJcblxyXG4gICAgICAgIHJldHVybiBpbm5lcjtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFJlcHJlc2VudHMgY29udGV4dCBkYXRhIGZvciBhIHBocmFzZSwgdG8gYmUgcGFzc2VkIHRvIGFuIGVsZW1lbnQgcHJvY2Vzc29yICovXHJcbmludGVyZmFjZSBQaHJhc2VDb250ZXh0XHJcbntcclxuICAgIC8qKiBHZXRzIHRoZSBYTUwgcGhyYXNlIGVsZW1lbnQgdGhhdCBpcyBiZWluZyByZXBsYWNlZCAqL1xyXG4gICAgeG1sRWxlbWVudCA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIEdldHMgdGhlIEhUTUwgc3BhbiBlbGVtZW50IHRoYXQgaXMgcmVwbGFjaW5nIHRoZSBYTUwgZWxlbWVudCAqL1xyXG4gICAgbmV3RWxlbWVudCA6IEhUTUxTcGFuRWxlbWVudDtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqXHJcbiAqIEhhbmRsZXMgdGhlIHRyYW5zZm9ybWF0aW9uIG9mIHBocmFzZSBYTUwgZGF0YSwgaW50byBIVE1MIGVsZW1lbnRzIHdpdGggdGhlaXIgZGF0YVxyXG4gKiBmaWxsZWQgaW4gYW5kIHRoZWlyIFVJIGxvZ2ljIHdpcmVkLlxyXG4gKi9cclxuY2xhc3MgUGhyYXNlclxyXG57XHJcbiAgICAvKipcclxuICAgICAqIFJlY3Vyc2l2ZWx5IHByb2Nlc3NlcyBYTUwgZWxlbWVudHMsIGZpbGxpbmcgaW4gZGF0YSBhbmQgYXBwbHlpbmcgdHJhbnNmb3Jtcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGFpbmVyIFBhcmVudCB0byBwcm9jZXNzIHRoZSBjaGlsZHJlbiBvZlxyXG4gICAgICogQHBhcmFtIGxldmVsIEN1cnJlbnQgbGV2ZWwgb2YgcmVjdXJzaW9uLCBtYXguIDIwXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBwcm9jZXNzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGxldmVsOiBudW1iZXIgPSAwKVxyXG4gICAge1xyXG4gICAgICAgIC8vIEluaXRpYWxseSwgdGhpcyBtZXRob2Qgd2FzIHN1cHBvc2VkIHRvIGp1c3QgYWRkIHRoZSBYTUwgZWxlbWVudHMgZGlyZWN0bHkgaW50b1xyXG4gICAgICAgIC8vIHRoZSBkb2N1bWVudC4gSG93ZXZlciwgdGhpcyBjYXVzZWQgYSBsb3Qgb2YgcHJvYmxlbXMgKGUuZy4gdGl0bGUgbm90IHdvcmtpbmcpLlxyXG4gICAgICAgIC8vIEhUTUwgZG9lcyBub3Qgd29yayByZWFsbHkgd2VsbCB3aXRoIGN1c3RvbSBlbGVtZW50cywgZXNwZWNpYWxseSBpZiB0aGV5IGFyZSBvZlxyXG4gICAgICAgIC8vIGFub3RoZXIgWE1MIG5hbWVzcGFjZS5cclxuXHJcbiAgICAgICAgbGV0IHF1ZXJ5ICAgPSAnOm5vdChzcGFuKTpub3Qoc3ZnKTpub3QodXNlKTpub3QoYnV0dG9uKSc7XHJcbiAgICAgICAgbGV0IHBlbmRpbmcgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbChxdWVyeSkgYXMgTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XHJcblxyXG4gICAgICAgIC8vIE5vIG1vcmUgWE1MIGVsZW1lbnRzIHRvIGV4cGFuZFxyXG4gICAgICAgIGlmIChwZW5kaW5nLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGb3IgZWFjaCBYTUwgZWxlbWVudCBjdXJyZW50bHkgaW4gdGhlIGNvbnRhaW5lcjpcclxuICAgICAgICAvLyAqIENyZWF0ZSBhIG5ldyBzcGFuIGVsZW1lbnQgZm9yIGl0XHJcbiAgICAgICAgLy8gKiBIYXZlIHRoZSBwcm9jZXNzb3JzIHRha2UgZGF0YSBmcm9tIHRoZSBYTUwgZWxlbWVudCwgdG8gcG9wdWxhdGUgdGhlIG5ldyBvbmVcclxuICAgICAgICAvLyAqIFJlcGxhY2UgdGhlIFhNTCBlbGVtZW50IHdpdGggdGhlIG5ldyBvbmVcclxuICAgICAgICBwZW5kaW5nLmZvckVhY2goZWxlbWVudCA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVsZW1lbnROYW1lID0gZWxlbWVudC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBsZXQgbmV3RWxlbWVudCAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgICAgIGxldCBjb250ZXh0ICAgICA9IHtcclxuICAgICAgICAgICAgICAgIHhtbEVsZW1lbnQ6IGVsZW1lbnQsXHJcbiAgICAgICAgICAgICAgICBuZXdFbGVtZW50OiBuZXdFbGVtZW50XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBuZXdFbGVtZW50LmRhdGFzZXRbJ3R5cGUnXSA9IGVsZW1lbnROYW1lO1xyXG5cclxuICAgICAgICAgICAgLy8gSSB3YW50ZWQgdG8gdXNlIGFuIGluZGV4IG9uIEVsZW1lbnRQcm9jZXNzb3JzIGZvciB0aGlzLCBidXQgaXQgY2F1c2VkIGV2ZXJ5XHJcbiAgICAgICAgICAgIC8vIHByb2Nlc3NvciB0byBoYXZlIGFuIFwidW51c2VkIG1ldGhvZFwiIHdhcm5pbmcuXHJcbiAgICAgICAgICAgIHN3aXRjaCAoZWxlbWVudE5hbWUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgRWxlbWVudFByb2Nlc3NvcnMuY29hY2goY29udGV4dCk7ICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnZXhjdXNlJzogICAgICBFbGVtZW50UHJvY2Vzc29ycy5leGN1c2UoY29udGV4dCk7ICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLmludGVnZXIoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ25hbWVkJzogICAgICAgRWxlbWVudFByb2Nlc3NvcnMubmFtZWQoY29udGV4dCk7ICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGhyYXNlJzogICAgICBFbGVtZW50UHJvY2Vzc29ycy5waHJhc2UoY29udGV4dCk7ICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2VzZXQnOiAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZXNldChjb250ZXh0KTsgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BsYXRmb3JtJzogICAgRWxlbWVudFByb2Nlc3NvcnMucGxhdGZvcm0oY29udGV4dCk7ICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc2VydmljZSc6ICAgICBFbGVtZW50UHJvY2Vzc29ycy5zZXJ2aWNlKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnN0YXRpb24oY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbmxpc3QoY29udGV4dCk7IGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAndGltZSc6ICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy50aW1lKGNvbnRleHQpOyAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICd2b3gnOiAgICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnZveChjb250ZXh0KTsgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6ICAgICAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudW5rbm93bihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUmVjdXJzZSBzbyB0aGF0IHdlIGNhbiBleHBhbmQgYW55IG5ldyBlbGVtZW50c1xyXG4gICAgICAgIGlmIChsZXZlbCA8IDIwKVxyXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGFpbmVyLCBsZXZlbCArIDEpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUEhSQVNFUl9UT09fUkVDVVJTSVZFKCkgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgY2xhc3MgZm9yIHJlc29sdmluZyBhIGdpdmVuIHBocmFzZSB0byB2b3gga2V5cyAqL1xyXG5jbGFzcyBSZXNvbHZlclxyXG57XHJcbiAgICAvKiogVHJlZVdhbGtlciBmaWx0ZXIgdG8gcmVkdWNlIGEgd2FsayB0byBqdXN0IHRoZSBlbGVtZW50cyB0aGUgcmVzb2x2ZXIgbmVlZHMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSk6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgICAgID0gbm9kZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgcGFyZW50VHlwZSA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghcGFyZW50VHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCAgICAgPSBwYXJlbnQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHBhcmVudFR5cGUgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQWNjZXB0IHRleHQgb25seSBmcm9tIHBocmFzZSBhbmQgcGhyYXNlc2V0c1xyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICBpZiAocGFyZW50VHlwZSAhPT0gJ3BocmFzZXNldCcgJiYgcGFyZW50VHlwZSAhPT0gJ3BocmFzZScpXHJcbiAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG5cclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5vZGUgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgICAgICAvLyBSZWplY3QgY29sbGFwc2VkIGVsZW1lbnRzIGFuZCB0aGVpciBjaGlsZHJlblxyXG4gICAgICAgICAgICBpZiAoIGVsZW1lbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCB0eXBlbGVzcyAod3JhcHBlcikgZWxlbWVudHNcclxuICAgICAgICAgICAgaWYgKCF0eXBlKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIG92ZXIgcGhyYXNlIGFuZCBwaHJhc2VzZXRzIChpbnN0ZWFkLCBvbmx5IGdvaW5nIGZvciB0aGVpciBjaGlsZHJlbilcclxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnIHx8IHR5cGUgPT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGhyYXNlICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHJpdmF0ZSBmbGF0dGVuZWQgOiBOb2RlW107XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlZCAgOiBWb3hLZXlbXTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGhyYXNlOiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnBocmFzZSAgICA9IHBocmFzZTtcclxuICAgICAgICB0aGlzLmZsYXR0ZW5lZCA9IFtdO1xyXG4gICAgICAgIHRoaXMucmVzb2x2ZWQgID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHRvVm94KCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIC8vIEZpcnN0LCB3YWxrIHRocm91Z2ggdGhlIHBocmFzZSBhbmQgXCJmbGF0dGVuXCIgaXQgaW50byBhbiBhcnJheSBvZiBwYXJ0cy4gVGhpcyBpc1xyXG4gICAgICAgIC8vIHNvIHRoZSByZXNvbHZlciBjYW4gbG9vay1haGVhZCBvciBsb29rLWJlaGluZC5cclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQgPSBbXTtcclxuICAgICAgICB0aGlzLnJlc29sdmVkICA9IFtdO1xyXG4gICAgICAgIGxldCB0cmVlV2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgdGhpcy5waHJhc2UsXHJcbiAgICAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19URVhUIHwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogUmVzb2x2ZXIubm9kZUZpbHRlciB9LFxyXG4gICAgICAgICAgICBmYWxzZVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHdoaWxlICggdHJlZVdhbGtlci5uZXh0Tm9kZSgpIClcclxuICAgICAgICBpZiAodHJlZVdhbGtlci5jdXJyZW50Tm9kZS50ZXh0Q29udGVudCEudHJpbSgpICE9PSAnJylcclxuICAgICAgICAgICAgdGhpcy5mbGF0dGVuZWQucHVzaCh0cmVlV2Fsa2VyLmN1cnJlbnROb2RlKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgcmVzb2x2ZSBhbGwgdGhlIHBocmFzZXMnIG5vZGVzIGludG8gdm94IGtleXNcclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQuZm9yRWFjaCggKHYsIGkpID0+IHRoaXMucmVzb2x2ZWQucHVzaCggLi4udGhpcy5yZXNvbHZlKHYsIGkpICkgKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5mbGF0dGVuZWQsIHRoaXMucmVzb2x2ZWQpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXNlcyB0aGUgdHlwZSBhbmQgdmFsdWUgb2YgdGhlIGdpdmVuIG5vZGUsIHRvIHJlc29sdmUgaXQgdG8gdm94IGZpbGUgSURzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBub2RlIE5vZGUgdG8gcmVzb2x2ZSB0byB2b3ggSURzXHJcbiAgICAgKiBAcGFyYW0gaWR4IEluZGV4IG9mIHRoZSBub2RlIGJlaW5nIHJlc29sdmVkIHJlbGF0aXZlIHRvIHRoZSBwaHJhc2UgYXJyYXlcclxuICAgICAqIEByZXR1cm5zIEFycmF5IG9mIElEcyB0aGF0IG1ha2UgdXAgb25lIG9yIG1vcmUgZmlsZSBJRHMuIENhbiBiZSBlbXB0eS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlKG5vZGU6IE5vZGUsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlVGV4dChub2RlKTtcclxuXHJcbiAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUNvYWNoKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ2V4Y3VzZSc6ICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUV4Y3VzZShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVJbnRlZ2VyKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICduYW1lZCc6ICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVOYW1lZCgpO1xyXG4gICAgICAgICAgICBjYXNlICdwbGF0Zm9ybSc6ICAgIHJldHVybiB0aGlzLnJlc29sdmVQbGF0Zm9ybShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTZXJ2aWNlKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTdGF0aW9uKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogcmV0dXJuIHRoaXMucmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3RpbWUnOiAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRpbWUoZWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3ZveCc6ICAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVZveChlbGVtZW50KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEluZmxlY3Rpb24oaWR4OiBudW1iZXIpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5leHQgPSB0aGlzLmZsYXR0ZW5lZFtpZHggKyAxXTtcclxuXHJcbiAgICAgICAgcmV0dXJuICggbmV4dCAmJiBuZXh0LnRleHRDb250ZW50IS50cmltKCkuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgPyAnZW5kJ1xyXG4gICAgICAgICAgICA6ICdtaWQnO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVRleHQobm9kZTogTm9kZSkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBub2RlLnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCB0eXBlICAgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIGxldCB0ZXh0ICAgPSBTdHJpbmdzLmNsZWFuKG5vZGUudGV4dENvbnRlbnQhKTtcclxuICAgICAgICBsZXQgc2V0ICAgID0gW107XHJcblxyXG4gICAgICAgIC8vIElmIHRleHQgaXMganVzdCBhIGZ1bGwgc3RvcCwgcmV0dXJuIHNpbGVuY2VcclxuICAgICAgICBpZiAodGV4dCA9PT0gJy4nKVxyXG4gICAgICAgICAgICByZXR1cm4gWzAuNjVdO1xyXG5cclxuICAgICAgICAvLyBJZiBpdCBiZWdpbnMgd2l0aCBhIGZ1bGwgc3RvcCwgYWRkIHNpbGVuY2VcclxuICAgICAgICBpZiAoIHRleHQuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgc2V0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSB0ZXh0IGRvZXNuJ3QgY29udGFpbiBhbnkgd29yZHMsIHNraXBcclxuICAgICAgICBpZiAoICF0ZXh0Lm1hdGNoKC9bYS16MC05XS9pKSApXHJcbiAgICAgICAgICAgIHJldHVybiBzZXQ7XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghdHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICAgICAgdHlwZSAgID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCByZWYgPSBwYXJlbnQuZGF0YXNldFsncmVmJ107XHJcbiAgICAgICAgbGV0IGlkeCA9IERPTS5ub2RlSW5kZXhPZihub2RlKTtcclxuICAgICAgICBsZXQgaWQgID0gYCR7dHlwZX0uJHtyZWZ9YDtcclxuXHJcbiAgICAgICAgLy8gQXBwZW5kIGluZGV4IG9mIHBocmFzZXNldCdzIGNob2ljZSBvZiBwaHJhc2VcclxuICAgICAgICBpZiAodHlwZSA9PT0gJ3BocmFzZXNldCcpXHJcbiAgICAgICAgICAgIGlkICs9IGAuJHtwYXJlbnQuZGF0YXNldFsnaWR4J119YDtcclxuXHJcbiAgICAgICAgaWQgKz0gYC4ke2lkeH1gO1xyXG4gICAgICAgIHNldC5wdXNoKGlkKTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGV4dCBlbmRzIHdpdGggYSBmdWxsIHN0b3AsIGFkZCBzaWxlbmNlXHJcbiAgICAgICAgaWYgKCB0ZXh0LmVuZHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICBzZXQucHVzaCgwLjY1KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHNldDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVDb2FjaChlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgY29hY2ggICA9IFJBRy5zdGF0ZS5nZXRDb2FjaChjdHgpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgPSBbMC4yLCBgbGV0dGVyLiR7Y29hY2h9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUV4Y3VzZShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBleGN1c2UgID0gUkFHLnN0YXRlLmV4Y3VzZTtcclxuICAgICAgICBsZXQga2V5ICAgICA9IFN0cmluZ3MuZmlsZW5hbWUoZXhjdXNlKTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMTUsIGBleGN1c2UuJHtrZXl9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUludGVnZXIoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHNpbmd1bGFyID0gZWxlbWVudC5kYXRhc2V0WydzaW5ndWxhciddO1xyXG4gICAgICAgIGxldCBwbHVyYWwgICA9IGVsZW1lbnQuZGF0YXNldFsncGx1cmFsJ107XHJcbiAgICAgICAgbGV0IGludGVnZXIgID0gUkFHLnN0YXRlLmdldEludGVnZXIoY3R4KTtcclxuICAgICAgICBsZXQgcGFydHMgICAgPSBbMC4xMjUsIGBudW1iZXIuJHtpbnRlZ2VyfS5taWRgXTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoc2luZ3VsYXIgJiYgaW50ZWdlciA9PT0gMSlcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjE1LCBgbnVtYmVyLnN1ZmZpeC4ke3Npbmd1bGFyfS5lbmRgKTtcclxuICAgICAgICBlbHNlIGlmIChwbHVyYWwgICAmJiBpbnRlZ2VyICE9PSAxKVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMTUsIGBudW1iZXIuc3VmZml4LiR7cGx1cmFsfS5lbmRgKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4xNSk7XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJ0cztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVOYW1lZCgpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgbmFtZWQgPSBTdHJpbmdzLmZpbGVuYW1lKFJBRy5zdGF0ZS5uYW1lZCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbMC4yLCBgbmFtZWQuJHtuYW1lZH0ubWlkYCwgMC4yXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVQbGF0Zm9ybShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA9IFJBRy5zdGF0ZS5wbGF0Zm9ybTtcclxuICAgICAgICBsZXQgaW5mbGVjdCAgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgbGV0dGVyICAgPSAocGxhdGZvcm1bMV0gPT09ICfCvicpID8gJ00nIDogcGxhdGZvcm1bMV07XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgID0gWzAuMTUsIGBudW1iZXIuJHtwbGF0Zm9ybVswXX0ke2xldHRlcn0uJHtpbmZsZWN0fWBdO1xyXG5cclxuICAgICAgICBpZiAoaW5mbGVjdCA9PT0gJ21pZCcpXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuMik7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlU2VydmljZShlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzZXJ2aWNlID0gU3RyaW5ncy5maWxlbmFtZSggUkFHLnN0YXRlLmdldFNlcnZpY2UoY3R4KSApO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gW107XHJcblxyXG4gICAgICAgIC8vIE9ubHkgYWRkIGJlZ2lubmluZyBkZWxheSBpZiB0aGVyZSBpc24ndCBhbHJlYWR5IG9uZSBwcmlvclxyXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5yZXNvbHZlZC5zbGljZSgtMSlbMF0gIT09ICdudW1iZXInKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjE1KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5yZXN1bHQsIGBzZXJ2aWNlLiR7c2VydmljZX0ubWlkYCwgMC4xNV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlU3RhdGlvbihlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uKGN0eCk7XHJcbiAgICAgICAgbGV0IHZveEtleSAgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvblZveChzdGF0aW9uKTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMiwgYHN0YXRpb24uJHt2b3hLZXl9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBsaXN0ICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KGN0eCk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuXHJcbiAgICAgICAgbGV0IHBhcnRzIDogVm94S2V5W10gPSBbMC4yXTtcclxuXHJcbiAgICAgICAgbGlzdC5mb3JFYWNoKCAoY29kZSwgaykgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCB2b3hLZXkgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvblZveChjb2RlKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEhhbmRsZSBtaWRkbGUgb2YgbGlzdCBpbmZsZWN0aW9uXHJcbiAgICAgICAgICAgIGlmIChrICE9PSBsaXN0Lmxlbmd0aCAtIDEpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2b3hLZXl9Lm1pZGAsIDAuMjUpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBBZGQgXCJhbmRcIiBpZiBsaXN0IGhhcyBtb3JlIHRoYW4gMSBzdGF0aW9uIGFuZCB0aGlzIGlzIHRoZSBlbmRcclxuICAgICAgICAgICAgaWYgKGxpc3QubGVuZ3RoID4gMSlcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goJ3N0YXRpb24ucGFydHMuYW5kLm1pZCcsIDAuMjUpO1xyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFwib25seVwiIGlmIG9ubHkgb25lIHN0YXRpb24gaW4gdGhlIGNhbGxpbmcgbGlzdFxyXG4gICAgICAgICAgICBpZiAobGlzdC5sZW5ndGggPT09IDEgJiYgY3R4ID09PSAnY2FsbGluZycpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2b3hLZXl9Lm1pZGApO1xyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaCgwLjIsICdzdGF0aW9uLnBhcnRzLm9ubHkuZW5kJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaChgc3RhdGlvbi4ke3ZveEtleX0uJHtpbmZsZWN0fWApO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gWy4uLnBhcnRzLCAwLjJdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVRpbWUoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHRpbWUgID0gUkFHLnN0YXRlLmdldFRpbWUoY3R4KS5zcGxpdCgnOicpO1xyXG5cclxuICAgICAgICBsZXQgcGFydHMgOiBWb3hLZXlbXSA9IFswLjJdO1xyXG5cclxuICAgICAgICBpZiAodGltZVswXSA9PT0gJzAwJyAmJiB0aW1lWzFdID09PSAnMDAnKVxyXG4gICAgICAgICAgICByZXR1cm4gWy4uLnBhcnRzLCAnbnVtYmVyLjAwMDAubWlkJywgMC4yXTtcclxuXHJcbiAgICAgICAgLy8gSG91cnNcclxuICAgICAgICBwYXJ0cy5wdXNoKGBudW1iZXIuJHt0aW1lWzBdfS5iZWdpbmApO1xyXG5cclxuICAgICAgICBpZiAodGltZVsxXSA9PT0gJzAwJylcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjA3NSwgJ251bWJlci5odW5kcmVkLm1pZCcpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjIsIGBudW1iZXIuJHt0aW1lWzFdfS5taWRgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgMC4xNV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlVm94KGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRleHQgICA9IGVsZW1lbnQuaW5uZXJUZXh0LnRyaW0oKTtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gW107XHJcblxyXG4gICAgICAgIGlmICggdGV4dC5zdGFydHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjY1KTtcclxuXHJcbiAgICAgICAgcmVzdWx0LnB1c2goIGVsZW1lbnQuZGF0YXNldFsna2V5J10hICk7XHJcblxyXG4gICAgICAgIGlmICggdGV4dC5lbmRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYW5hZ2VzIHNwZWVjaCBzeW50aGVzaXMgdXNpbmcgYm90aCBuYXRpdmUgYW5kIGN1c3RvbSBlbmdpbmVzICovXHJcbmNsYXNzIFNwZWVjaFxyXG57XHJcbiAgICAvKiogSW5zdGFuY2Ugb2YgdGhlIGN1c3RvbSB2b2ljZSBlbmdpbmUgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgdm94RW5naW5lPyA6IFZveEVuZ2luZTtcclxuXHJcbiAgICAvKiogQXJyYXkgb2YgYnJvd3Nlci1wcm92aWRlZCB2b2ljZXMgYXZhaWxhYmxlICovXHJcbiAgICBwdWJsaWMgIGJyb3dzZXJWb2ljZXMgOiBTcGVlY2hTeW50aGVzaXNWb2ljZVtdID0gW107XHJcbiAgICAvKiogRXZlbnQgaGFuZGxlciBmb3Igd2hlbiBzcGVlY2ggaGFzIGVuZGVkICovXHJcbiAgICBwdWJsaWMgIG9uc3RvcD8gICAgICAgOiAoKSA9PiB2b2lkO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbmF0aXZlIHNwZWVjaC1zdG9wcGVkIGNoZWNrIHRpbWVyICovXHJcbiAgICBwcml2YXRlIHN0b3BUaW1lciAgICAgOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoZSBWT1ggZW5naW5lIGlzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBnZXQgdm94QXZhaWxhYmxlKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudm94RW5naW5lICE9PSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICAvLyBTb21lIGJyb3dzZXJzIGRvbid0IHByb3Blcmx5IGNhbmNlbCBzcGVlY2ggb24gcGFnZSBjbG9zZS5cclxuICAgICAgICAvLyBCVUc6IG9ucGFnZXNob3cgYW5kIG9ucGFnZWhpZGUgbm90IHdvcmtpbmcgb24gaU9TIDExXHJcbiAgICAgICAgd2luZG93Lm9uYmVmb3JldW5sb2FkID1cclxuICAgICAgICB3aW5kb3cub251bmxvYWQgICAgICAgPVxyXG4gICAgICAgIHdpbmRvdy5vbnBhZ2VzaG93ICAgICA9XHJcbiAgICAgICAgd2luZG93Lm9ucGFnZWhpZGUgICAgID0gdGhpcy5zdG9wLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50Lm9udmlzaWJpbGl0eWNoYW5nZSAgICAgICAgICAgID0gdGhpcy5vblZpc2liaWxpdHlDaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLm9udm9pY2VzY2hhbmdlZCA9IHRoaXMub25Wb2ljZXNDaGFuZ2VkLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEV2ZW4gdGhvdWdoICdvbnZvaWNlc2NoYW5nZWQnIGlzIHVzZWQgbGF0ZXIgdG8gcG9wdWxhdGUgdGhlIGxpc3QsIENocm9tZSBkb2VzXHJcbiAgICAgICAgLy8gbm90IGFjdHVhbGx5IGZpcmUgdGhlIGV2ZW50IHVudGlsIHRoaXMgY2FsbC4uLlxyXG4gICAgICAgIHRoaXMub25Wb2ljZXNDaGFuZ2VkKCk7XHJcblxyXG4gICAgICAgIHRyeSAgICAgICAgIHsgdGhpcy52b3hFbmdpbmUgPSBuZXcgVm94RW5naW5lKCk7IH1cclxuICAgICAgICBjYXRjaCAoZXJyKSB7IGNvbnNvbGUuZXJyb3IoJ0NvdWxkIG5vdCBjcmVhdGUgVk9YIGVuZ2luZTonLCBlcnIpOyB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBzcGVha2luZyB0aGUgZ2l2ZW4gcGhyYXNlIGNvbXBvbmVudHMgKi9cclxuICAgIHB1YmxpYyBzcGVhayhwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MgPSB7fSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKCB0aGlzLnZveEVuZ2luZSAmJiBlaXRoZXIoc2V0dGluZ3MudXNlVm94LCBSQUcuY29uZmlnLnZveEVuYWJsZWQpIClcclxuICAgICAgICAgICAgdGhpcy5zcGVha1ZveChwaHJhc2UsIHNldHRpbmdzKTtcclxuICAgICAgICBlbHNlIGlmICh3aW5kb3cuc3BlZWNoU3ludGhlc2lzKVxyXG4gICAgICAgICAgICB0aGlzLnNwZWFrQnJvd3NlcihwaHJhc2UsIHNldHRpbmdzKTtcclxuICAgICAgICBlbHNlIGlmICh0aGlzLm9uc3RvcClcclxuICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3RvcHMgYW5kIGNhbmNlbHMgYWxsIHF1ZXVlZCBzcGVlY2ggKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVE9ETzogQ2hlY2sgZm9yIHNwZWVjaCBzeW50aGVzaXNcclxuXHJcbiAgICAgICAgaWYgKHdpbmRvdy5zcGVlY2hTeW50aGVzaXMpXHJcbiAgICAgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuY2FuY2VsKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnZveEVuZ2luZSlcclxuICAgICAgICAgICAgdGhpcy52b3hFbmdpbmUuc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQYXVzZSBhbmQgdW5wYXVzZSBzcGVlY2ggaWYgdGhlIHBhZ2UgaXMgaGlkZGVuIG9yIHVuaGlkZGVuICovXHJcbiAgICBwcml2YXRlIG9uVmlzaWJpbGl0eUNoYW5nZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IFRoaXMgbmVlZHMgdG8gcGF1c2UgVk9YIGVuZ2luZVxyXG4gICAgICAgIGxldCBoaWRpbmcgPSAoZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSAnaGlkZGVuJyk7XHJcblxyXG4gICAgICAgIGlmIChoaWRpbmcpIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMucGF1c2UoKTtcclxuICAgICAgICBlbHNlICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnJlc3VtZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGFzeW5jIHZvaWNlIGxpc3QgbG9hZGluZyBvbiBzb21lIGJyb3dzZXJzLCBhbmQgc2V0cyBkZWZhdWx0ICovXHJcbiAgICBwcml2YXRlIG9uVm9pY2VzQ2hhbmdlZCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuYnJvd3NlclZvaWNlcyA9IHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuZ2V0Vm9pY2VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb252ZXJ0cyB0aGUgZ2l2ZW4gcGhyYXNlIHRvIHRleHQgYW5kIHNwZWFrcyBpdCB2aWEgbmF0aXZlIGJyb3dzZXIgdm9pY2VzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwaHJhc2UgUGhyYXNlIGVsZW1lbnRzIHRvIHNwZWFrXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgU2V0dGluZ3MgdG8gdXNlIGZvciB0aGUgdm9pY2VcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzcGVha0Jyb3dzZXIocGhyYXNlOiBIVE1MRWxlbWVudCwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBSZXNldCB0byBmaXJzdCB2b2ljZSwgaWYgY29uZmlndXJlZCBjaG9pY2UgaXMgbWlzc2luZ1xyXG4gICAgICAgIGxldCB2b2ljZUlkeCA9IGVpdGhlcihzZXR0aW5ncy52b2ljZUlkeCwgUkFHLmNvbmZpZy5zcGVlY2hWb2ljZSk7XHJcbiAgICAgICAgbGV0IHZvaWNlICAgID0gdGhpcy5icm93c2VyVm9pY2VzW3ZvaWNlSWR4XSB8fCB0aGlzLmJyb3dzZXJWb2ljZXNbMF07XHJcblxyXG4gICAgICAgIC8vIFRoZSBwaHJhc2UgdGV4dCBpcyBzcGxpdCBpbnRvIHNlbnRlbmNlcywgYXMgcXVldWVpbmcgbGFyZ2Ugc2VudGVuY2VzIHRoYXQgbGFzdFxyXG4gICAgICAgIC8vIG1hbnkgc2Vjb25kcyBjYW4gYnJlYWsgc29tZSBUVFMgZW5naW5lcyBhbmQgYnJvd3NlcnMuXHJcbiAgICAgICAgbGV0IHRleHQgID0gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dChwaHJhc2UpO1xyXG4gICAgICAgIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoL1xcLlxccy9pKTtcclxuXHJcbiAgICAgICAgcGFydHMuZm9yRWFjaCggKHNlZ21lbnQsIGlkeCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEFkZCBtaXNzaW5nIGZ1bGwgc3RvcCB0byBlYWNoIHNlbnRlbmNlIGV4Y2VwdCB0aGUgbGFzdCwgd2hpY2ggaGFzIGl0XHJcbiAgICAgICAgICAgIGlmIChpZHggPCBwYXJ0cy5sZW5ndGggLSAxKVxyXG4gICAgICAgICAgICAgICAgc2VnbWVudCArPSAnLic7XHJcblxyXG4gICAgICAgICAgICBsZXQgdXR0ZXJhbmNlID0gbmV3IFNwZWVjaFN5bnRoZXNpc1V0dGVyYW5jZShzZWdtZW50KTtcclxuXHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS52b2ljZSAgPSB2b2ljZTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnZvbHVtZSA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsIFJBRy5jb25maWcuc3BlZWNoVm9sKTtcclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnBpdGNoICA9IGVpdGhlcihzZXR0aW5ncy5waXRjaCwgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2gpO1xyXG4gICAgICAgICAgICB1dHRlcmFuY2UucmF0ZSAgID0gZWl0aGVyKHNldHRpbmdzLnJhdGUsICAgUkFHLmNvbmZpZy5zcGVlY2hSYXRlKTtcclxuXHJcbiAgICAgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuc3BlYWsodXR0ZXJhbmNlKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gVGhpcyBjaGVja3MgZm9yIHdoZW4gdGhlIG5hdGl2ZSBlbmdpbmUgaGFzIHN0b3BwZWQgc3BlYWtpbmcsIGFuZCBjYWxscyB0aGVcclxuICAgICAgICAvLyBvbnN0b3AgZXZlbnQgaGFuZGxlci4gSSBjb3VsZCB1c2UgU3BlZWNoU3ludGhlc2lzLm9uZW5kIGluc3RlYWQsIGJ1dCBpdCB3YXNcclxuICAgICAgICAvLyBmb3VuZCB0byBiZSB1bnJlbGlhYmxlLCBzbyBJIGhhdmUgdG8gcG9sbCB0aGUgc3BlYWtpbmcgcHJvcGVydHkgdGhpcyB3YXkuXHJcbiAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLnN0b3BUaW1lcik7XHJcblxyXG4gICAgICAgIHRoaXMuc3RvcFRpbWVyID0gc2V0SW50ZXJ2YWwoKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmICh3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFraW5nKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLnN0b3BUaW1lcik7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vbnN0b3ApXHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgICAgIH0sIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTeW50aGVzaXplcyB2b2ljZSBieSB3YWxraW5nIHRocm91Z2ggdGhlIGdpdmVuIHBocmFzZSBlbGVtZW50cywgcmVzb2x2aW5nIHBhcnRzIHRvXHJcbiAgICAgKiBzb3VuZCBmaWxlIElEcywgYW5kIGZlZWRpbmcgdGhlIGVudGlyZSBhcnJheSB0byB0aGUgdm94IGVuZ2luZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGhyYXNlIFBocmFzZSBlbGVtZW50cyB0byBzcGVha1xyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFNldHRpbmdzIHRvIHVzZSBmb3IgdGhlIHZvaWNlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3BlYWtWb3gocGhyYXNlOiBIVE1MRWxlbWVudCwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzb2x2ZXIgPSBuZXcgUmVzb2x2ZXIocGhyYXNlKTtcclxuICAgICAgICBsZXQgdm94UGF0aCAgPSBSQUcuY29uZmlnLnZveFBhdGggfHwgUkFHLmNvbmZpZy52b3hDdXN0b21QYXRoO1xyXG5cclxuICAgICAgICB0aGlzLnZveEVuZ2luZSEub25zdG9wID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMudm94RW5naW5lIS5vbnN0b3AgPSB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vbnN0b3ApXHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IHNldHRpbmdzIGZyb20gY29uZmlnIGhlcmUsIHRvIGtlZXAgVk9YIGVuZ2luZSBkZWNvdXBsZWQgZnJvbSBSQUdcclxuICAgICAgICBzZXR0aW5ncy52b3hQYXRoICAgPSBlaXRoZXIoc2V0dGluZ3Mudm94UGF0aCwgICB2b3hQYXRoKTtcclxuICAgICAgICBzZXR0aW5ncy52b3hSZXZlcmIgPSBlaXRoZXIoc2V0dGluZ3Mudm94UmV2ZXJiLCBSQUcuY29uZmlnLnZveFJldmVyYik7XHJcbiAgICAgICAgc2V0dGluZ3Mudm94Q2hpbWUgID0gZWl0aGVyKHNldHRpbmdzLnZveENoaW1lLCAgUkFHLmNvbmZpZy52b3hDaGltZSk7XHJcbiAgICAgICAgc2V0dGluZ3Mudm9sdW1lICAgID0gZWl0aGVyKHNldHRpbmdzLnZvbHVtZSwgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2wpO1xyXG4gICAgICAgIHNldHRpbmdzLnJhdGUgICAgICA9IGVpdGhlcihzZXR0aW5ncy5yYXRlLCAgICAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSk7XHJcblxyXG4gICAgICAgIHRoaXMudm94RW5naW5lIS5zcGVhayhyZXNvbHZlci50b1ZveCgpLCBzZXR0aW5ncyk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cblxuLyoqIFR5cGUgZGVmaW5pdGlvbiBmb3Igc3BlZWNoIGNvbmZpZyBvdmVycmlkZXMgcGFzc2VkIHRvIHRoZSBzcGVhayBtZXRob2QgKi9cbmludGVyZmFjZSBTcGVlY2hTZXR0aW5nc1xue1xuICAgIC8qKiBXaGV0aGVyIHRvIGZvcmNlIHVzZSBvZiB0aGUgVk9YIGVuZ2luZSAqL1xuICAgIHVzZVZveD8gICAgOiBib29sZWFuO1xuICAgIC8qKiBPdmVycmlkZSBhYnNvbHV0ZSBvciByZWxhdGl2ZSBVUkwgb2YgVk9YIHZvaWNlIHRvIHVzZSAqL1xuICAgIHZveFBhdGg/ICAgOiBzdHJpbmc7XG4gICAgLyoqIE92ZXJyaWRlIGNob2ljZSBvZiByZXZlcmIgdG8gdXNlICovXG4gICAgdm94UmV2ZXJiPyA6IHN0cmluZztcbiAgICAvKiogT3ZlcnJpZGUgY2hvaWNlIG9mIGNoaW1lIHRvIHVzZSAqL1xuICAgIHZveENoaW1lPyAgOiBzdHJpbmc7XG4gICAgLyoqIE92ZXJyaWRlIGNob2ljZSBvZiB2b2ljZSAqL1xuICAgIHZvaWNlSWR4PyAgOiBudW1iZXI7XG4gICAgLyoqIE92ZXJyaWRlIHZvbHVtZSBvZiB2b2ljZSAqL1xuICAgIHZvbHVtZT8gICAgOiBudW1iZXI7XG4gICAgLyoqIE92ZXJyaWRlIHBpdGNoIG9mIHZvaWNlICovXG4gICAgcGl0Y2g/ICAgICA6IG51bWJlcjtcbiAgICAvKiogT3ZlcnJpZGUgcmF0ZSBvZiB2b2ljZSAqL1xuICAgIHJhdGU/ICAgICAgOiBudW1iZXI7XG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG50eXBlIFZveEtleSA9IHN0cmluZyB8IG51bWJlcjtcclxuXHJcbi8qKiBTeW50aGVzaXplcyBzcGVlY2ggYnkgZHluYW1pY2FsbHkgbG9hZGluZyBhbmQgcGllY2luZyB0b2dldGhlciB2b2ljZSBmaWxlcyAqL1xyXG5jbGFzcyBWb3hFbmdpbmVcclxue1xyXG4gICAgLyoqIExpc3Qgb2YgaW1wdWxzZSByZXNwb25zZXMgdGhhdCBjb21lIHdpdGggUkFHICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IFJFVkVSQlMgOiBEaWN0aW9uYXJ5PHN0cmluZz4gPSB7XHJcbiAgICAgICAgJycgICAgICAgICAgICAgICAgICAgICA6ICdOb25lJyxcclxuICAgICAgICAnaXIuc3RhbGJhbnMud2F2JyAgICAgIDogJ1RoZSBMYWR5IENoYXBlbCwgU3QgQWxiYW5zIENhdGhlZHJhbCcsXHJcbiAgICAgICAgJ2lyLm1pZGRsZV90dW5uZWwud2F2JyA6ICdJbm5vY2VudCBSYWlsd2F5IFR1bm5lbCwgRWRpbmJ1cmdoJyxcclxuICAgICAgICAnaXIuZ3JhbmdlLWNlbnRyZS53YXYnIDogJ0dyYW5nZSBzdG9uZSBjaXJjbGUsIENvdW50eSBMaW1lcmljaydcclxuICAgIH07XHJcblxyXG4gICAgLyoqIFRoZSBjb3JlIGF1ZGlvIGNvbnRleHQgdGhhdCBoYW5kbGVzIGF1ZGlvIGVmZmVjdHMgYW5kIHBsYXliYWNrICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGF1ZGlvQ29udGV4dCA6IEF1ZGlvQ29udGV4dDtcclxuICAgIC8qKiBBdWRpbyBub2RlIHRoYXQgYW1wbGlmaWVzIG9yIGF0dGVudWF0ZXMgdm9pY2UgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZ2Fpbk5vZGUgICAgIDogR2Fpbk5vZGU7XHJcbiAgICAvKiogQXVkaW8gbm9kZSB0aGF0IGFwcGxpZXMgdGhlIHRhbm5veSBmaWx0ZXIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyTm9kZSAgIDogQmlxdWFkRmlsdGVyTm9kZTtcclxuICAgIC8qKiBBdWRpbyBub2RlIHRoYXQgYWRkcyBhIHJldmVyYiB0byB0aGUgdm9pY2UsIGlmIGF2YWlsYWJsZSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSByZXZlcmJOb2RlICAgOiBDb252b2x2ZXJOb2RlO1xyXG4gICAgLyoqIENhY2hlIG9mIGltcHVsc2UgcmVzcG9uc2VzIGF1ZGlvIGRhdGEsIGZvciByZXZlcmIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW1wdWxzZXMgICAgIDogRGljdGlvbmFyeTxBdWRpb0J1ZmZlcj4gPSB7fTtcclxuICAgIC8qKiBSZWxhdGl2ZSBwYXRoIHRvIGZldGNoIGltcHVsc2UgcmVzcG9uc2UgYW5kIGNoaW1lIGZpbGVzIGZyb20gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZGF0YVBhdGggICAgIDogc3RyaW5nO1xyXG5cclxuICAgIC8qKiBFdmVudCBoYW5kbGVyIGZvciB3aGVuIHNwZWVjaCBoYXMgZW5kZWQgKi9cclxuICAgIHB1YmxpYyAgb25zdG9wPyAgICAgICAgICA6ICgpID0+IHZvaWQ7XHJcbiAgICAvKiogV2hldGhlciB0aGlzIGVuZ2luZSBpcyBjdXJyZW50bHkgcnVubmluZyBhbmQgc3BlYWtpbmcgKi9cclxuICAgIHByaXZhdGUgaXNTcGVha2luZyAgICAgICA6IGJvb2xlYW4gICAgICA9IGZhbHNlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSBudW1iZXIgZm9yIHRoZSBjdXJyZW50IHB1bXAgdGltZXIgKi9cclxuICAgIHByaXZhdGUgcHVtcFRpbWVyICAgICAgICA6IG51bWJlciAgICAgICA9IDA7XHJcbiAgICAvKiogVHJhY2tzIHRoZSBhdWRpbyBjb250ZXh0J3Mgd2FsbC1jbG9jayB0aW1lIHRvIHNjaGVkdWxlIG5leHQgY2xpcCAqL1xyXG4gICAgcHJpdmF0ZSBuZXh0QmVnaW4gICAgICAgIDogbnVtYmVyICAgICAgID0gMDtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGN1cnJlbnRseSBwZW5kaW5nIHJlcXVlc3RzLCBhcyBhIEZJRk8gcXVldWUgKi9cclxuICAgIHByaXZhdGUgcGVuZGluZ1JlcXMgICAgICA6IFZveFJlcXVlc3RbXSA9IFtdO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gY3VycmVudGx5IHNjaGVkdWxlZCBhdWRpbyBidWZmZXJzICovXHJcbiAgICBwcml2YXRlIHNjaGVkdWxlZEJ1ZmZlcnMgOiBBdWRpb0J1ZmZlclNvdXJjZU5vZGVbXSA9IFtdO1xyXG4gICAgLyoqIExpc3Qgb2Ygdm94IElEcyBjdXJyZW50bHkgYmVpbmcgcnVuIHRocm91Z2ggKi9cclxuICAgIHByaXZhdGUgY3VycmVudElkcz8gICAgICA6IFZveEtleVtdO1xyXG4gICAgLyoqIFNwZWVjaCBzZXR0aW5ncyBjdXJyZW50bHkgYmVpbmcgdXNlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50U2V0dGluZ3M/IDogU3BlZWNoU2V0dGluZ3M7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGRhdGFQYXRoOiBzdHJpbmcgPSAnZGF0YS92b3gnKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFNldHVwIHRoZSBjb3JlIGF1ZGlvIGNvbnRleHRcclxuXHJcbiAgICAgICAgLy8gQHRzLWlnbm9yZSAtIERlZmluaW5nIHRoZXNlIGluIFdpbmRvdyBpbnRlcmZhY2UgZG9lcyBub3Qgd29ya1xyXG4gICAgICAgIGxldCBhdWRpb0NvbnRleHQgID0gd2luZG93LkF1ZGlvQ29udGV4dCB8fCB3aW5kb3cud2Via2l0QXVkaW9Db250ZXh0O1xyXG4gICAgICAgIHRoaXMuYXVkaW9Db250ZXh0ID0gbmV3IGF1ZGlvQ29udGV4dCgpO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuYXVkaW9Db250ZXh0KVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBnZXQgYXVkaW8gY29udGV4dCcpO1xyXG5cclxuICAgICAgICAvLyBTZXR1cCBub2Rlc1xyXG5cclxuICAgICAgICB0aGlzLmRhdGFQYXRoICAgPSBkYXRhUGF0aDtcclxuICAgICAgICB0aGlzLmdhaW5Ob2RlICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XHJcbiAgICAgICAgdGhpcy5yZXZlcmJOb2RlID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQ29udm9sdmVyKCk7XHJcblxyXG4gICAgICAgIHRoaXMucmV2ZXJiTm9kZS5ub3JtYWxpemUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuZmlsdGVyTm9kZS50eXBlICAgICAgPSAnaGlnaHBhc3MnO1xyXG4gICAgICAgIHRoaXMuZmlsdGVyTm9kZS5RLnZhbHVlICAgPSAwLjQ7XHJcblxyXG4gICAgICAgIHRoaXMuZ2Fpbk5vZGUuY29ubmVjdCh0aGlzLmZpbHRlck5vZGUpO1xyXG4gICAgICAgIC8vIFJlc3Qgb2Ygbm9kZXMgZ2V0IGNvbm5lY3RlZCB3aGVuIHNwZWFrIGlzIGNhbGxlZFxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQmVnaW5zIGxvYWRpbmcgYW5kIHNwZWFraW5nIGEgc2V0IG9mIHZveCBmaWxlcy4gU3RvcHMgYW55IHNwZWVjaC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWRzIExpc3Qgb2Ygdm94IGlkcyB0byBsb2FkIGFzIGZpbGVzLCBpbiBzcGVha2luZyBvcmRlclxyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFZvaWNlIHNldHRpbmdzIHRvIHVzZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3BlYWsoaWRzOiBWb3hLZXlbXSwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggU1BFQUs6JywgaWRzLCBzZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIC8vIFNldCBzdGF0ZVxyXG5cclxuICAgICAgICBpZiAodGhpcy5pc1NwZWFraW5nKVxyXG4gICAgICAgICAgICB0aGlzLnN0b3AoKTtcclxuXHJcbiAgICAgICAgdGhpcy5pc1NwZWFraW5nICAgICAgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuY3VycmVudElkcyAgICAgID0gaWRzO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0gc2V0dGluZ3M7XHJcblxyXG4gICAgICAgIC8vIFNldCByZXZlcmJcclxuXHJcbiAgICAgICAgaWYgKCBTdHJpbmdzLmlzTnVsbE9yRW1wdHkoc2V0dGluZ3Mudm94UmV2ZXJiKSApXHJcbiAgICAgICAgICAgIHRoaXMudG9nZ2xlUmV2ZXJiKGZhbHNlKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZmlsZSAgICA9IHNldHRpbmdzLnZveFJldmVyYiE7XHJcbiAgICAgICAgICAgIGxldCBpbXB1bHNlID0gdGhpcy5pbXB1bHNlc1tmaWxlXTtcclxuXHJcbiAgICAgICAgICAgIGlmICghaW1wdWxzZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgLy8gTWFrZSBzdXJlIHJldmVyYiBpcyBvZmYgZmlyc3QsIGVsc2UgY2xpcHMgd2lsbCBxdWV1ZSBpbiB0aGUgYXVkaW9cclxuICAgICAgICAgICAgICAgIC8vIGJ1ZmZlciBhbmQgYWxsIHN1ZGRlbmx5IHBsYXkgYXQgdGhlIHNhbWUgdGltZSwgd2hlbiByZXZlcmIgbG9hZHMuXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRvZ2dsZVJldmVyYihmYWxzZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZmV0Y2goYCR7dGhpcy5kYXRhUGF0aH0vJHtmaWxlfWApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIHJlcyA9PiByZXMuYXJyYXlCdWZmZXIoKSApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIGJ1ZiA9PiBTb3VuZHMuZGVjb2RlKHRoaXMuYXVkaW9Db250ZXh0LCBidWYpIClcclxuICAgICAgICAgICAgICAgICAgICAudGhlbiggaW1wID0+XHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDYWNoZSBidWZmZXIgZm9yIGxhdGVyXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW1wdWxzZXNbZmlsZV0gICAgPSBpbXA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmV2ZXJiTm9kZS5idWZmZXIgPSBpbXA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudG9nZ2xlUmV2ZXJiKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggUkVWRVJCIExPQURFRCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yZXZlcmJOb2RlLmJ1ZmZlciA9IGltcHVsc2U7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRvZ2dsZVJldmVyYih0cnVlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2V0IHZvbHVtZVxyXG5cclxuICAgICAgICBsZXQgdm9sdW1lID0gZWl0aGVyKHNldHRpbmdzLnZvbHVtZSwgMSk7XHJcblxyXG4gICAgICAgIC8vIFJlbWFwcyB0aGUgMS4xLi4uMS45IHJhbmdlIHRvIDIuLi4xMFxyXG4gICAgICAgIGlmICh2b2x1bWUgPiAxKVxyXG4gICAgICAgICAgICB2b2x1bWUgPSAodm9sdW1lICogMTApIC0gOTtcclxuXHJcbiAgICAgICAgdGhpcy5nYWluTm9kZS5nYWluLnZhbHVlID0gdm9sdW1lO1xyXG5cclxuICAgICAgICAvLyBTZXQgY2hpbWUsIGF0IGZvcmNlZCBwbGF5YmFjayByYXRlIG9mIDFcclxuXHJcbiAgICAgICAgaWYgKCAhU3RyaW5ncy5pc051bGxPckVtcHR5KHNldHRpbmdzLnZveENoaW1lKSApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcGF0aCAgICAgID0gYCR7dGhpcy5kYXRhUGF0aH0vJHtzZXR0aW5ncy52b3hDaGltZSF9YDtcclxuICAgICAgICAgICAgbGV0IHJlcSAgICAgICA9IG5ldyBWb3hSZXF1ZXN0KHBhdGgsIDAsIHRoaXMuYXVkaW9Db250ZXh0KTtcclxuICAgICAgICAgICAgcmVxLmZvcmNlUmF0ZSA9IDE7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdSZXFzLnB1c2gocmVxKTtcclxuICAgICAgICAgICAgaWRzLnVuc2hpZnQoMS4wKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEJlZ2luIHRoZSBwdW1wIGxvb3AuIE9uIGlPUywgdGhlIGNvbnRleHQgbWF5IGhhdmUgdG8gYmUgcmVzdW1lZCBmaXJzdFxyXG5cclxuICAgICAgICBpZiAodGhpcy5hdWRpb0NvbnRleHQuc3RhdGUgPT09ICdzdXNwZW5kZWQnKVxyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dC5yZXN1bWUoKS50aGVuKCAoKSA9PiB0aGlzLnB1bXAoKSApO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5wdW1wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHBsYXlpbmcgYW55IGN1cnJlbnRseSBzcG9rZW4gc3BlZWNoIGFuZCByZXNldHMgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gQWxyZWFkeSBzdG9wcGVkPyBEbyBub3QgY29udGludWVcclxuICAgICAgICBpZiAoIXRoaXMuaXNTcGVha2luZylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmdcclxuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5wdW1wVGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgLy8gQ2FuY2VsIGFsbCBwZW5kaW5nIHJlcXVlc3RzXHJcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVxcy5mb3JFYWNoKCByID0+IHIuY2FuY2VsKCkgKTtcclxuXHJcbiAgICAgICAgLy8gS2lsbCBhbmQgZGVyZWZlcmVuY2UgYW55IGN1cnJlbnRseSBwbGF5aW5nIGZpbGVcclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMuZm9yRWFjaChub2RlID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBub2RlLnN0b3AoKTtcclxuICAgICAgICAgICAgbm9kZS5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMubmV4dEJlZ2luICAgICAgICA9IDA7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50SWRzICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzICA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLnBlbmRpbmdSZXFzICAgICAgPSBbXTtcclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMgPSBbXTtcclxuXHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFNUT1BQRUQnKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHVtcHMgdGhlIHNwZWVjaCBxdWV1ZSwgYnkga2VlcGluZyB1cCB0byAxMCBmZXRjaCByZXF1ZXN0cyBmb3Igdm9pY2UgZmlsZXMgZ29pbmcsXHJcbiAgICAgKiBhbmQgdGhlbiBmZWVkaW5nIHRoZWlyIGRhdGEgKGluIGVuZm9yY2VkIG9yZGVyKSB0byB0aGUgYXVkaW8gY2hhaW4sIG9uZSBhdCBhIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcHVtcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIElmIHRoZSBlbmdpbmUgaGFzIHN0b3BwZWQsIGRvIG5vdCBwcm9jZWVkLlxyXG4gICAgICAgIGlmICghdGhpcy5pc1NwZWFraW5nIHx8ICF0aGlzLmN1cnJlbnRJZHMgfHwgIXRoaXMuY3VycmVudFNldHRpbmdzKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBzY2hlZHVsZSBmdWxmaWxsZWQgcmVxdWVzdHMgaW50byB0aGUgYXVkaW8gYnVmZmVyLCBpbiBGSUZPIG9yZGVyXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZSgpO1xyXG5cclxuICAgICAgICAvLyBUaGVuLCBmaWxsIGFueSBmcmVlIHBlbmRpbmcgc2xvdHMgd2l0aCBuZXcgcmVxdWVzdHNcclxuICAgICAgICBsZXQgbmV4dERlbGF5ID0gMDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRoaXMuY3VycmVudElkc1swXSAmJiB0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCA8IDEwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGtleSA9IHRoaXMuY3VycmVudElkcy5zaGlmdCgpITtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMga2V5IGlzIGEgbnVtYmVyLCBpdCdzIGFuIGFtb3VudCBvZiBzaWxlbmNlLCBzbyBhZGQgaXQgYXMgdGhlXHJcbiAgICAgICAgICAgIC8vIHBsYXliYWNrIGRlbGF5IGZvciB0aGUgbmV4dCBwbGF5YWJsZSByZXF1ZXN0IChpZiBhbnkpLlxyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGtleSA9PT0gJ251bWJlcicpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG5leHREZWxheSArPSBrZXk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbGV0IHBhdGggPSBgJHt0aGlzLmN1cnJlbnRTZXR0aW5ncy52b3hQYXRofS8ke2tleX0ubXAzYDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucGVuZGluZ1JlcXMucHVzaCggbmV3IFZveFJlcXVlc3QocGF0aCwgbmV4dERlbGF5LCB0aGlzLmF1ZGlvQ29udGV4dCkgKTtcclxuICAgICAgICAgICAgbmV4dERlbGF5ID0gMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0b3AgcHVtcGluZyB3aGVuIHdlJ3JlIG91dCBvZiBJRHMgdG8gcXVldWUgYW5kIG5vdGhpbmcgaXMgcGxheWluZ1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRJZHMubGVuZ3RoICAgICAgIDw9IDApXHJcbiAgICAgICAgaWYgKHRoaXMucGVuZGluZ1JlcXMubGVuZ3RoICAgICAgPD0gMClcclxuICAgICAgICBpZiAodGhpcy5zY2hlZHVsZWRCdWZmZXJzLmxlbmd0aCA8PSAwKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIHRoaXMucHVtcFRpbWVyID0gc2V0VGltZW91dCh0aGlzLnB1bXAuYmluZCh0aGlzKSwgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNjaGVkdWxlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RvcCBzY2hlZHVsaW5nIGlmIHRoZXJlIGFyZSBubyBwZW5kaW5nIHJlcXVlc3RzXHJcbiAgICAgICAgaWYgKCF0aGlzLnBlbmRpbmdSZXFzWzBdIHx8ICF0aGlzLnBlbmRpbmdSZXFzWzBdLmlzRG9uZSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBEb24ndCBzY2hlZHVsZSBpZiBtb3JlIHRoYW4gNSBub2RlcyBhcmUsIGFzIG5vdCB0byBibG93IGFueSBidWZmZXJzXHJcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGVkQnVmZmVycy5sZW5ndGggPiA1KVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCByZXEgPSB0aGlzLnBlbmRpbmdSZXFzLnNoaWZ0KCkhO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgbmV4dCByZXF1ZXN0IGVycm9yZWQgb3V0IChidWZmZXIgbWlzc2luZyksIHNraXAgaXRcclxuICAgICAgICBpZiAoIXJlcS5idWZmZXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgU0tJUFBFRDonLCByZXEucGF0aCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNjaGVkdWxlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZiB0aGlzIGlzIHRoZSBmaXJzdCBjbGlwIGJlaW5nIHBsYXllZCwgc3RhcnQgZnJvbSBjdXJyZW50IHdhbGwtY2xvY2tcclxuICAgICAgICBpZiAodGhpcy5uZXh0QmVnaW4gPT09IDApXHJcbiAgICAgICAgICAgIHRoaXMubmV4dEJlZ2luID0gdGhpcy5hdWRpb0NvbnRleHQuY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdWT1ggQ0xJUCBRVUVVRUQ6JywgcmVxLnBhdGgsIHJlcS5idWZmZXIuZHVyYXRpb24sIHRoaXMubmV4dEJlZ2luKTtcclxuXHJcbiAgICAgICAgLy8gQmFzZSBsYXRlbmN5IG5vdCBhdmFpbGFibGUgaW4gc29tZSBicm93c2Vyc1xyXG4gICAgICAgIGxldCBsYXRlbmN5ID0gKHRoaXMuYXVkaW9Db250ZXh0LmJhc2VMYXRlbmN5IHx8IDAuMDEpICsgMC4xNTtcclxuICAgICAgICBsZXQgbm9kZSAgICA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpO1xyXG4gICAgICAgIGxldCByYXRlICAgID0gcmVxLmZvcmNlUmF0ZSB8fCB0aGlzLmN1cnJlbnRTZXR0aW5ncyEucmF0ZSB8fCAxO1xyXG4gICAgICAgIG5vZGUuYnVmZmVyID0gcmVxLmJ1ZmZlcjtcclxuXHJcbiAgICAgICAgLy8gUmVtYXAgcmF0ZSBmcm9tIDAuMS4uMS45IHRvIDAuOC4uMS41XHJcbiAgICAgICAgaWYgICAgICAocmF0ZSA8IDEpIHJhdGUgPSAocmF0ZSAqIDAuMikgKyAwLjg7XHJcbiAgICAgICAgZWxzZSBpZiAocmF0ZSA+IDEpIHJhdGUgPSAocmF0ZSAqIDAuNSkgKyAwLjU7XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSBkZWxheSBhbmQgZHVyYXRpb24gYmFzZWQgb24gcGxheWJhY2sgcmF0ZVxyXG4gICAgICAgIGxldCBkZWxheSAgICA9IHJlcS5kZWxheSAqICgxIC8gcmF0ZSk7XHJcbiAgICAgICAgbGV0IGR1cmF0aW9uID0gbm9kZS5idWZmZXIuZHVyYXRpb24gKiAoMSAvIHJhdGUpO1xyXG5cclxuICAgICAgICBub2RlLnBsYXliYWNrUmF0ZS52YWx1ZSA9IHJhdGU7XHJcbiAgICAgICAgbm9kZS5jb25uZWN0KHRoaXMuZ2Fpbk5vZGUpO1xyXG4gICAgICAgIG5vZGUuc3RhcnQodGhpcy5uZXh0QmVnaW4gKyBkZWxheSk7XHJcblxyXG4gICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycy5wdXNoKG5vZGUpO1xyXG4gICAgICAgIHRoaXMubmV4dEJlZ2luICs9IChkdXJhdGlvbiArIGRlbGF5IC0gbGF0ZW5jeSk7XHJcblxyXG4gICAgICAgIC8vIEhhdmUgdGhpcyBidWZmZXIgbm9kZSByZW1vdmUgaXRzZWxmIGZyb20gdGhlIHNjaGVkdWxlIHdoZW4gZG9uZVxyXG4gICAgICAgIG5vZGUub25lbmRlZCA9IF8gPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdWT1ggQ0xJUCBFTkRFRDonLCByZXEucGF0aCk7XHJcbiAgICAgICAgICAgIGxldCBpZHggPSB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMuaW5kZXhPZihub2RlKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChpZHggIT09IC0xKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzLnNwbGljZShpZHgsIDEpO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB0b2dnbGVSZXZlcmIoc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMucmV2ZXJiTm9kZS5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlLmRpc2Nvbm5lY3QoKTtcclxuXHJcbiAgICAgICAgaWYgKHN0YXRlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5maWx0ZXJOb2RlLmNvbm5lY3QodGhpcy5yZXZlcmJOb2RlKTtcclxuICAgICAgICAgICAgdGhpcy5yZXZlcmJOb2RlLmNvbm5lY3QodGhpcy5hdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyTm9kZS5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFJlcHJlc2VudHMgYSByZXF1ZXN0IGZvciBhIHZveCBmaWxlLCBpbW1lZGlhdGVseSBiZWd1biBvbiBjcmVhdGlvbiAqL1xyXG5jbGFzcyBWb3hSZXF1ZXN0XHJcbntcclxuICAgIC8qKiBSZWxhdGl2ZSByZW1vdGUgcGF0aCBvZiB0aGlzIHZvaWNlIGZpbGUgcmVxdWVzdCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBwYXRoICAgIDogc3RyaW5nO1xyXG4gICAgLyoqIEFtb3VudCBvZiBzZWNvbmRzIHRvIGRlbGF5IHRoZSBwbGF5YmFjayBvZiB0aGlzIHJlcXVlc3QgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgZGVsYXkgICA6IG51bWJlcjtcclxuICAgIC8qKiBBdWRpbyBjb250ZXh0IHRvIHVzZSBmb3IgZGVjb2RpbmcgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dCA6IEF1ZGlvQ29udGV4dDtcclxuXHJcbiAgICAvKiogV2hldGhlciB0aGlzIHJlcXVlc3QgaXMgZG9uZSBhbmQgcmVhZHkgZm9yIGhhbmRsaW5nIChldmVuIGlmIGZhaWxlZCkgKi9cclxuICAgIHB1YmxpYyBpc0RvbmUgICAgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFJhdyBhdWRpbyBkYXRhIGZyb20gdGhlIGxvYWRlZCBmaWxlLCBpZiBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBidWZmZXI/ICAgIDogQXVkaW9CdWZmZXI7XHJcbiAgICAvKiogUGxheWJhY2sgcmF0ZSB0byBmb3JjZSB0aGlzIGNsaXAgdG8gcGxheSBhdCAqL1xyXG4gICAgcHVibGljIGZvcmNlUmF0ZT8gOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgZGVsYXk6IG51bWJlciwgY29udGV4dDogQXVkaW9Db250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBSRVFVRVNUOicsIHBhdGgpO1xyXG4gICAgICAgIHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XHJcbiAgICAgICAgdGhpcy5wYXRoICAgID0gcGF0aDtcclxuICAgICAgICB0aGlzLmRlbGF5ICAgPSBkZWxheTtcclxuXHJcbiAgICAgICAgZmV0Y2gocGF0aClcclxuICAgICAgICAgICAgLnRoZW4gKCB0aGlzLm9uRnVsZmlsbC5iaW5kKHRoaXMpIClcclxuICAgICAgICAgICAgLmNhdGNoKCB0aGlzLm9uRXJyb3IuYmluZCh0aGlzKSAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbmNlbHMgdGhpcyByZXF1ZXN0IGZyb20gcHJvY2VlZGluZyBhbnkgZnVydGhlciAqL1xyXG4gICAgcHVibGljIGNhbmNlbCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IENhbmNlbGxhdGlvbiBjb250cm9sbGVyc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBCZWdpbnMgZGVjb2RpbmcgdGhlIGxvYWRlZCBNUDMgdm9pY2UgZmlsZSB0byByYXcgYXVkaW8gZGF0YSAqL1xyXG4gICAgcHJpdmF0ZSBvbkZ1bGZpbGwocmVzOiBSZXNwb25zZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFyZXMub2spXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKGBWT1ggTk9UIEZPVU5EOiAke3Jlcy5zdGF0dXN9IEAgJHt0aGlzLnBhdGh9YCk7XHJcblxyXG4gICAgICAgIHJlcy5hcnJheUJ1ZmZlcigpLnRoZW4oIHRoaXMub25BcnJheUJ1ZmZlci5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFRha2VzIHRoZSBhcnJheSBidWZmZXIgZnJvbSB0aGUgZnVsZmlsbGVkIGZldGNoIGFuZCBkZWNvZGVzIGl0ICovXHJcbiAgICBwcml2YXRlIG9uQXJyYXlCdWZmZXIoYnVmZmVyOiBBcnJheUJ1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgU291bmRzLmRlY29kZSh0aGlzLmNvbnRleHQsIGJ1ZmZlcilcclxuICAgICAgICAgICAgLnRoZW4gKCB0aGlzLm9uRGVjb2RlLmJpbmQodGhpcykgKVxyXG4gICAgICAgICAgICAuY2F0Y2goIHRoaXMub25FcnJvci5iaW5kKHRoaXMpICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiB0aGUgZmV0Y2hlZCBidWZmZXIgaXMgZGVjb2RlZCBzdWNjZXNzZnVsbHkgKi9cclxuICAgIHByaXZhdGUgb25EZWNvZGUoYnVmZmVyOiBBdWRpb0J1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5idWZmZXIgPSBidWZmZXI7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgaWYgdGhlIGZldGNoIG9yIGRlY29kZSBzdGFnZXMgZmFpbCAqL1xyXG4gICAgcHJpdmF0ZSBvbkVycm9yKGVycjogYW55KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnUkVRVUVTVCBGQUlMOicsIGVycik7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBocmFzZSBlZGl0b3IgKi9cclxuY2xhc3MgRWRpdG9yXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSBjb250YWluZXIgZm9yIHRoZSBlZGl0b3IgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIGRpYWxvZywgaWYgYW55ICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRQaWNrZXI/IDogUGlja2VyO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlIGVsZW1lbnQgY3VycmVudGx5IGJlaW5nIGVkaXRlZCwgaWYgYW55ICovXHJcbiAgICAvLyBEbyBub3QgRFJZOyBuZWVkcyB0byBiZSBwYXNzZWQgdG8gdGhlIHBpY2tlciBmb3IgY2xlYW5lciBjb2RlXHJcbiAgICBwcml2YXRlIGRvbUVkaXRpbmc/ICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSA9IERPTS5yZXF1aXJlKCcjZWRpdG9yJyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkub25jbGljayA9IHRoaXMub25DbGljay5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHdpbmRvdy5vbnJlc2l6ZSAgICAgICA9IHRoaXMub25SZXNpemUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbS5vbnNjcm9sbCAgICAgPSB0aGlzLm9uU2Nyb2xsLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb20udGV4dENvbnRlbnQgID0gTC5FRElUT1JfSU5JVCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyB0aGUgZWRpdG9yIHdpdGggYSByb290IHBocmFzZXNldCByZWZlcmVuY2UsIGFuZCBleHBhbmRzIGl0IGludG8gSFRNTCAqL1xyXG4gICAgcHVibGljIGdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJzxwaHJhc2VzZXQgcmVmPVwicm9vdFwiIC8+JztcclxuXHJcbiAgICAgICAgUkFHLnBocmFzZXIucHJvY2Vzcyh0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5hdHRhY2hDb250cm9scygpO1xyXG5cclxuICAgICAgICAvLyBGb3Igc2Nyb2xsLXBhc3QgcGFkZGluZyB1bmRlciB0aGUgcGhyYXNlXHJcbiAgICAgICAgbGV0IHBhZGRpbmcgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgcGFkZGluZy5jbGFzc05hbWUgPSAnYm90dG9tUGFkZGluZyc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmFwcGVuZENoaWxkKHBhZGRpbmcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXByb2Nlc3NlcyBhbGwgcGhyYXNlc2V0IGVsZW1lbnRzIG9mIHRoZSBnaXZlbiByZWYsIGlmIHRoZWlyIGluZGV4IGhhcyBjaGFuZ2VkICovXHJcbiAgICBwdWJsaWMgcmVmcmVzaFBocmFzZXNldChyZWY6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gTm90ZSwgdGhpcyBjb3VsZCBwb3RlbnRpYWxseSBidWcgb3V0IGlmIGEgcGhyYXNlc2V0J3MgZGVzY2VuZGFudCByZWZlcmVuY2VzXHJcbiAgICAgICAgLy8gdGhlIHNhbWUgcGhyYXNlc2V0IChyZWN1cnNpb24pLiBCdXQgdGhpcyBpcyBva2F5IGJlY2F1c2UgcGhyYXNlc2V0cyBzaG91bGRcclxuICAgICAgICAvLyBuZXZlciBpbmNsdWRlIHRoZW1zZWx2ZXMsIGV2ZW4gZXZlbnR1YWxseS5cclxuXHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChgc3BhbltkYXRhLXR5cGU9cGhyYXNlc2V0XVtkYXRhLXJlZj0ke3JlZn1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goXyA9PlxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCAgICA9IF8gYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBsZXQgbmV3RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3BocmFzZXNldCcpO1xyXG4gICAgICAgICAgICAgICAgbGV0IGNoYW5jZSAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddO1xyXG5cclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQuc2V0QXR0cmlidXRlKCdyZWYnLCByZWYpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChjaGFuY2UpXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2NoYW5jZScsIGNoYW5jZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZWxlbWVudC5wYXJlbnRFbGVtZW50IS5yZXBsYWNlQ2hpbGQobmV3RWxlbWVudCwgZWxlbWVudCk7XHJcbiAgICAgICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKG5ld0VsZW1lbnQucGFyZW50RWxlbWVudCEpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdHRhY2hDb250cm9scygpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSBzdGF0aWMgTm9kZUxpc3Qgb2YgYWxsIHBocmFzZSBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gcXVlcnkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IFF1ZXJ5IHN0cmluZyB0byBhZGQgb250byB0aGUgYHNwYW5gIHNlbGVjdG9yXHJcbiAgICAgKiBAcmV0dXJucyBOb2RlIGxpc3Qgb2YgYWxsIGVsZW1lbnRzIG1hdGNoaW5nIHRoZSBnaXZlbiBzcGFuIHF1ZXJ5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRFbGVtZW50c0J5UXVlcnkocXVlcnk6IHN0cmluZykgOiBOb2RlTGlzdFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuJHtxdWVyeX1gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCBwaHJhc2UncyByb290IERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlKCkgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCBwaHJhc2UgaW4gdGhlIGVkaXRvciBhcyB0ZXh0LCBleGNsdWRpbmcgdGhlIGhpZGRlbiBwYXJ0cyAqL1xyXG4gICAgcHVibGljIGdldFRleHQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIGFsbCBwaHJhc2UgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHR5cGUsIGFuZCBzZXRzIHRoZWlyIHRleHQgdG8gZ2l2ZW4gdmFsdWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHR5cGUgT3JpZ2luYWwgWE1MIG5hbWUgb2YgZWxlbWVudHMgdG8gcmVwbGFjZSBjb250ZW50cyBvZlxyXG4gICAgICogQHBhcmFtIHZhbHVlIE5ldyB0ZXh0IGZvciB0aGUgZm91bmQgZWxlbWVudHMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRFbGVtZW50c1RleHQodHlwZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT0ke3R5cGV9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIGFueSBjdXJyZW50bHkgb3BlbiBlZGl0b3IgZGlhbG9ncyAqL1xyXG4gICAgcHVibGljIGNsb3NlRGlhbG9nKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmNsb3NlKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmRvbUVkaXRpbmcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcucmVtb3ZlQXR0cmlidXRlKCdlZGl0aW5nJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdhYm92ZScsICdiZWxvdycpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgYXR0YWNoZXMgVUkgY29udHJvbHMgZm9yIGNlcnRhaW4gcGhyYXNlIGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIGF0dGFjaENvbnRyb2xzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtdHlwZT1waHJhc2VzZXRdJykuZm9yRWFjaChzcGFuID0+XHJcbiAgICAgICAgICAgIFBocmFzZXNldEJ1dHRvbi5jcmVhdGVBbmRBdHRhY2goc3BhbilcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1jaGFuY2VdJykuZm9yRWFjaChzcGFuID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS5jcmVhdGVBbmRBdHRhY2goc3Bhbik7XHJcbiAgICAgICAgICAgIENvbGxhcHNlVG9nZ2xlLnVwZGF0ZShzcGFuIGFzIEhUTUxFbGVtZW50KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBhIGNsaWNrIGFueXdoZXJlIGluIHRoZSB3aW5kb3cgZGVwZW5kaW5nIG9uIHRoZSBjb250ZXh0ICovXHJcbiAgICBwcml2YXRlIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSBldi50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IHR5cGUgICA9IHRhcmdldCA/IHRhcmdldC5kYXRhc2V0Wyd0eXBlJ10gICAgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgbGV0IHBpY2tlciA9IHR5cGUgICA/IFJBRy52aWV3cy5nZXRQaWNrZXIodHlwZSkgOiB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgIGlmICghdGFyZ2V0KVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIG9mIGlubmVyIGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKCB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdpbm5lcicpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIHRvIGFueSBpbm5lciBkb2N1bWVudCBvciB1bm93bmVkIGVsZW1lbnRcclxuICAgICAgICBpZiAoICFkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3MgdG8gYW55IGVsZW1lbnQgb2YgYWxyZWFkeSBvcGVuIHBpY2tlcnNcclxuICAgICAgICBpZiAoIHRoaXMuY3VycmVudFBpY2tlciApXHJcbiAgICAgICAgaWYgKCB0aGlzLmN1cnJlbnRQaWNrZXIuZG9tLmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbnkgb3BlbiBlZGl0b3JzXHJcbiAgICAgICAgbGV0IHByZXZUYXJnZXQgPSB0aGlzLmRvbUVkaXRpbmc7XHJcbiAgICAgICAgdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBEb24ndCBoYW5kbGUgcGhyYXNlIG9yIHBocmFzZXNldHMgLSBvbmx5IHZpYSB0aGVpciBidXR0b25zXHJcbiAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2UnIHx8IHR5cGUgPT09ICdwaHJhc2VzZXQnKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElmIGNsaWNraW5nIHRoZSBlbGVtZW50IGFscmVhZHkgYmVpbmcgZWRpdGVkLCBkb24ndCByZW9wZW5cclxuICAgICAgICBpZiAodGFyZ2V0ID09PSBwcmV2VGFyZ2V0KVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCB0b2dnbGUgICAgICAgPSB0YXJnZXQuY2xvc2VzdCgnLnRvZ2dsZScpICAgICAgIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCBjaG9vc2VQaHJhc2UgPSB0YXJnZXQuY2xvc2VzdCgnLmNob29zZVBocmFzZScpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgY29sbGFwc2libGUgZWxlbWVudHNcclxuICAgICAgICBpZiAodG9nZ2xlKVxyXG4gICAgICAgICAgICB0aGlzLnRvZ2dsZUNvbGxhcHNpYWJsZSh0b2dnbGUpO1xyXG5cclxuICAgICAgICAvLyBTcGVjaWFsIGNhc2UgZm9yIHBocmFzZXNldCBjaG9vc2VyXHJcbiAgICAgICAgZWxzZSBpZiAoY2hvb3NlUGhyYXNlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gVE9ETzogQXNzZXJ0IGhlcmU/XHJcbiAgICAgICAgICAgIHRhcmdldCA9IGNob29zZVBocmFzZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICAgICAgcGlja2VyID0gUkFHLnZpZXdzLmdldFBpY2tlcih0YXJnZXQuZGF0YXNldFsndHlwZSddISk7XHJcbiAgICAgICAgICAgIHRoaXMub3BlblBpY2tlcih0YXJnZXQsIHBpY2tlcik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBGaW5kIGFuZCBvcGVuIHBpY2tlciBmb3IgdGhlIHRhcmdldCBlbGVtZW50XHJcbiAgICAgICAgZWxzZSBpZiAodHlwZSAmJiBwaWNrZXIpXHJcbiAgICAgICAgICAgIHRoaXMub3BlblBpY2tlcih0YXJnZXQsIHBpY2tlcik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlLWxheW91dCB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIG9uIHJlc2l6ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblJlc2l6ZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZS1sYXlvdXQgdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBvbiBzY3JvbGwgKi9cclxuICAgIHByaXZhdGUgb25TY3JvbGwoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIFdvcmthcm91bmQgZm9yIGxheW91dCBiZWhhdmluZyB3ZWlyZCB3aGVuIGlPUyBrZXlib2FyZCBpcyBvcGVuXHJcbiAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyLmhhc0ZvY3VzKCkpXHJcbiAgICAgICAgICAgIERPTS5ibHVyQWN0aXZlKCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFBpY2tlci5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZsaXBzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlLCBhbmQgcHJvcGFnYXRlcyB0aGUgbmV3IHN0YXRlIHRvIG90aGVyXHJcbiAgICAgKiBjb2xsYXBzaWJsZXMgb2YgdGhlIHNhbWUgcmVmZXJlbmNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgQ29sbGFwc2libGUgZWxlbWVudCBiZWluZyB0b2dnbGVkXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdG9nZ2xlQ29sbGFwc2lhYmxlKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgICAgID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCByZWYgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHBhcmVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCB0eXBlICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHBhcmVudCwgJ3R5cGUnKTtcclxuICAgICAgICBsZXQgY29sbGFwYXNlZCA9IHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpO1xyXG5cclxuICAgICAgICAvLyBQcm9wYWdhdGUgbmV3IGNvbGxhcHNlIHN0YXRlIHRvIGFsbCBjb2xsYXBzaWJsZXMgb2YgdGhlIHNhbWUgcmVmXHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgYHNwYW5bZGF0YS10eXBlPSR7dHlwZX1dW2RhdGEtcmVmPSR7cmVmfV1bZGF0YS1jaGFuY2VdYFxyXG4gICAgICAgICkuZm9yRWFjaChzcGFuID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIENvbGxhcHNpYmxlcy5zZXQoc3BhbiBhcyBIVE1MRWxlbWVudCwgIWNvbGxhcGFzZWQpO1xyXG4gICAgICAgICAgICAgICAgQ29sbGFwc2VUb2dnbGUudXBkYXRlKHNwYW4gYXMgSFRNTEVsZW1lbnQpO1xyXG4gICAgICAgICAgICAgICAgLy8gRG9uJ3QgbW92ZSB0aGlzIHRvIENvbGxhcHNpYmxlcy5zZXQsIGFzIHN0YXRlIHNhdmUvbG9hZCBpcyBoYW5kbGVkXHJcbiAgICAgICAgICAgICAgICAvLyBvdXRzaWRlIGluIGJvdGggdXNhZ2VzIG9mIHNldENvbGxhcHNpYmxlLlxyXG4gICAgICAgICAgICAgICAgUkFHLnN0YXRlLnNldENvbGxhcHNlZChyZWYsICFjb2xsYXBhc2VkKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBPcGVucyBhIHBpY2tlciBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFZGl0b3IgZWxlbWVudCB0byBvcGVuIHRoZSBwaWNrZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gcGlja2VyIFBpY2tlciB0byBvcGVuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb3BlblBpY2tlcih0YXJnZXQ6IEhUTUxFbGVtZW50LCBwaWNrZXI6IFBpY2tlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGFyZ2V0LnNldEF0dHJpYnV0ZSgnZWRpdGluZycsICd0cnVlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFBpY2tlciA9IHBpY2tlcjtcclxuICAgICAgICB0aGlzLmRvbUVkaXRpbmcgICAgPSB0YXJnZXQ7XHJcbiAgICAgICAgcGlja2VyLm9wZW4odGFyZ2V0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzY3JvbGxpbmcgbWFycXVlZSAqL1xyXG5jbGFzcyBNYXJxdWVlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1hcnF1ZWUncyBET00gZWxlbWVudCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzcGFuIGVsZW1lbnQgaW4gdGhlIG1hcnF1ZWUsIHdoZXJlIHRoZSB0ZXh0IGlzIHNldCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21TcGFuIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSBJRCBmb3IgdGhlIHNjcm9sbGluZyBhbmltYXRpb24gdGltZXIgKi9cclxuICAgIHByaXZhdGUgdGltZXIgIDogbnVtYmVyID0gMDtcclxuICAgIC8qKiBDdXJyZW50IG9mZnNldCAoaW4gcGl4ZWxzKSBvZiB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUgKi9cclxuICAgIHByaXZhdGUgb2Zmc2V0IDogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICA9IERPTS5yZXF1aXJlKCcjbWFycXVlZScpO1xyXG4gICAgICAgIHRoaXMuZG9tU3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJyc7XHJcbiAgICAgICAgdGhpcy5kb20uYXBwZW5kQ2hpbGQodGhpcy5kb21TcGFuKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgbWVzc2FnZSBvbiB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUsIGFuZCBzdGFydHMgYW5pbWF0aW5nIGl0ICovXHJcbiAgICBwdWJsaWMgc2V0KG1zZzogc3RyaW5nLCBhbmltYXRlOiBib29sZWFuID0gdHJ1ZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNwYW4udGV4dENvbnRlbnQgICAgID0gbXNnO1xyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuXHJcbiAgICAgICAgaWYgKCFhbmltYXRlKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEkgdHJpZWQgdG8gdXNlIENTUyBhbmltYXRpb24gZm9yIHRoaXMsIGJ1dCBjb3VsZG4ndCBmaWd1cmUgb3V0IGhvdyBmb3IgYVxyXG4gICAgICAgIC8vIGR5bmFtaWNhbGx5IHNpemVkIGVsZW1lbnQgbGlrZSB0aGUgc3Bhbi5cclxuICAgICAgICB0aGlzLm9mZnNldCA9IHRoaXMuZG9tLmNsaWVudFdpZHRoO1xyXG4gICAgICAgIGxldCBsaW1pdCAgID0gLXRoaXMuZG9tU3Bhbi5jbGllbnRXaWR0aCAtIDEwMDtcclxuICAgICAgICBsZXQgYW5pbSAgICA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLm9mZnNldCAgICAgICAgICAgICAgICAgIC09IDY7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gID0gYHRyYW5zbGF0ZVgoJHt0aGlzLm9mZnNldH1weClgO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub2Zmc2V0IDwgbGltaXQpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbVNwYW4uc3R5bGUudHJhbnNmb3JtID0gJyc7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHRoaXMudGltZXIgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW0pO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHRoZSBjdXJyZW50IG1hcnF1ZWUgYW5pbWF0aW9uICovXHJcbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLnRpbWVyKTtcclxuICAgICAgICB0aGlzLmRvbVNwYW4uc3R5bGUudHJhbnNmb3JtID0gJyc7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vIFRPRE86IE1ha2UgYWxsIHZpZXdzIHVzZSB0aGlzIGNsYXNzXHJcbi8qKiBCYXNlIGNsYXNzIGZvciBhIHZpZXc7IGFueXRoaW5nIHdpdGggYSBiYXNlIERPTSBlbGVtZW50ICovXHJcbmFic3RyYWN0IGNsYXNzIFZpZXdCYXNlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyB2aWV3J3MgcHJpbWFyeSBET00gZWxlbWVudCAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRvbSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIHRoaXMgYmFzZSB2aWV3LCBhdHRhY2hpbmcgaXQgdG8gdGhlIGVsZW1lbnQgbWF0Y2hpbmcgdGhlIGdpdmVuIHF1ZXJ5ICovXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3IoZG9tUXVlcnk6IHN0cmluZyB8IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0eXBlb2YgZG9tUXVlcnkgPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICB0aGlzLmRvbSA9IERPTS5yZXF1aXJlKGRvbVF1ZXJ5KTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZG9tID0gZG9tUXVlcnk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhpcyB2aWV3J3MgY2hpbGQgZWxlbWVudCBtYXRjaGluZyB0aGUgZ2l2ZW4gcXVlcnkgKi9cclxuICAgIHByb3RlY3RlZCBhdHRhY2g8VCBleHRlbmRzIEhUTUxFbGVtZW50PihxdWVyeTogc3RyaW5nKSA6IFRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gRE9NLnJlcXVpcmUocXVlcnksIHRoaXMuZG9tKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vPHJlZmVyZW5jZSBwYXRoPVwidmlld0Jhc2UudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG5jbGFzcyBTZXR0aW5ncyBleHRlbmRzIFZpZXdCYXNlXHJcbntcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuUmVzZXQgICAgICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxCdXR0b25FbGVtZW50PiAoJyNidG5SZXNldFNldHRpbmdzJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blNhdmUgICAgICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MQnV0dG9uRWxlbWVudD4gKCcjYnRuU2F2ZVNldHRpbmdzJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNoa1VzZVZveCAgICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjY2hrVXNlVm94Jyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGhpbnRVc2VWb3ggICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MRWxlbWVudD4gICAgICAgKCcjaGludFVzZVZveCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzZWxWb3hWb2ljZSAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTFNlbGVjdEVsZW1lbnQ+ICgnI3NlbFZveFZvaWNlJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0Vm94UGF0aCAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjaW5wdXRWb3hQYXRoJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlbFZveFJldmVyYiAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsVm94UmV2ZXJiJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlbFZveENoaW1lICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsVm94Q2hpbWUnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VsU3BlZWNoVm9pY2UgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxTZWxlY3RFbGVtZW50PiAoJyNzZWxTcGVlY2hDaG9pY2UnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hWb2wgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNyYW5nZVNwZWVjaFZvbCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSByYW5nZVNwZWVjaFBpdGNoID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI3JhbmdlU3BlZWNoUGl0Y2gnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hSYXRlICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNyYW5nZVNwZWVjaFJhdGUnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuU3BlZWNoVGVzdCAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxCdXR0b25FbGVtZW50PiAoJyNidG5TcGVlY2hUZXN0Jyk7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgdGltZXIgZm9yIHRoZSBcIlJlc2V0XCIgYnV0dG9uIGNvbmZpcm1hdGlvbiBzdGVwICovXHJcbiAgICBwcml2YXRlIHJlc2V0VGltZW91dD8gOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignI3NldHRpbmdzU2NyZWVuJyk7XHJcbiAgICAgICAgLy8gVE9ETzogQ2hlY2sgaWYgVk9YIGlzIGF2YWlsYWJsZSwgZGlzYWJsZSBpZiBub3RcclxuXHJcbiAgICAgICAgdGhpcy5idG5SZXNldC5vbmNsaWNrICAgICAgPSB0aGlzLmhhbmRsZVJlc2V0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlLm9uY2xpY2sgICAgICAgPSB0aGlzLmhhbmRsZVNhdmUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmNoa1VzZVZveC5vbmNoYW5nZSAgICA9IHRoaXMubGF5b3V0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5zZWxWb3hWb2ljZS5vbmNoYW5nZSAgPSB0aGlzLmxheW91dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5vbmNsaWNrID0gdGhpcy5oYW5kbGVWb2ljZVRlc3QuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gUG9wdWxhdGUgbGlzdCBvZiBpbXB1bHNlIHJlc3BvbnNlIGZpbGVzXHJcbiAgICAgICAgRE9NLnBvcHVsYXRlKHRoaXMuc2VsVm94UmV2ZXJiLCBWb3hFbmdpbmUuUkVWRVJCUywgUkFHLmNvbmZpZy52b3hSZXZlcmIpO1xyXG5cclxuICAgICAgICAvLyBQb3B1bGF0ZSB0aGUgbGVnYWwgJiBhY2tub3dsZWRnZW1lbnRzIGJsb2NrXHJcbiAgICAgICAgTGlua2Rvd24ubG9hZEludG8oJ0FCT1VULm1kJywgJyNhYm91dEJsb2NrJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIE9wZW5zIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyBvcGVuKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVGhlIHZvaWNlIGxpc3QgaGFzIHRvIGJlIHBvcHVsYXRlZCBlYWNoIG9wZW4sIGluIGNhc2UgaXQgY2hhbmdlc1xyXG4gICAgICAgIHRoaXMucG9wdWxhdGVWb2ljZUxpc3QoKTtcclxuXHJcbiAgICAgICAgaWYgKCFSQUcuc3BlZWNoLnZveEF2YWlsYWJsZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIFRPRE8gOiBMb2NhbGl6ZVxyXG4gICAgICAgICAgICB0aGlzLmNoa1VzZVZveC5jaGVja2VkICAgID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuY2hrVXNlVm94LmRpc2FibGVkICAgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLmhpbnRVc2VWb3guaW5uZXJIVE1MID0gJzxzdHJvbmc+Vk9YIGVuZ2luZTwvc3Ryb25nPiBpcyB1bmF2YWlsYWJsZS4nICtcclxuICAgICAgICAgICAgICAgICcgWW91ciBicm93c2VyIG9yIGRldmljZSBtYXkgbm90IGJlIHN1cHBvcnRlZDsgcGxlYXNlIGNoZWNrIHRoZSBjb25zb2xlJyArXHJcbiAgICAgICAgICAgICAgICAnIGZvciBtb3JlIGluZm9ybWF0aW9uLidcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmNoa1VzZVZveC5jaGVja2VkID0gUkFHLmNvbmZpZy52b3hFbmFibGVkO1xyXG5cclxuICAgICAgICB0aGlzLnNlbFZveFZvaWNlLnZhbHVlICAgICAgICAgICAgICA9IFJBRy5jb25maWcudm94UGF0aDtcclxuICAgICAgICB0aGlzLmlucHV0Vm94UGF0aC52YWx1ZSAgICAgICAgICAgICA9IFJBRy5jb25maWcudm94Q3VzdG9tUGF0aDtcclxuICAgICAgICB0aGlzLnNlbFZveFJldmVyYi52YWx1ZSAgICAgICAgICAgICA9IFJBRy5jb25maWcudm94UmV2ZXJiO1xyXG4gICAgICAgIHRoaXMuc2VsVm94Q2hpbWUudmFsdWUgICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hDaGltZTtcclxuICAgICAgICB0aGlzLnNlbFNwZWVjaFZvaWNlLnNlbGVjdGVkSW5kZXggICA9IFJBRy5jb25maWcuc3BlZWNoVm9pY2U7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZUFzTnVtYmVyICAgPSBSQUcuY29uZmlnLnNwZWVjaFZvbDtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoUGl0Y2gudmFsdWVBc051bWJlciA9IFJBRy5jb25maWcuc3BlZWNoUGl0Y2g7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFJhdGUudmFsdWVBc051bWJlciAgPSBSQUcuY29uZmlnLnNwZWVjaFJhdGU7XHJcblxyXG4gICAgICAgIHRoaXMubGF5b3V0KCk7XHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuICAgICAgID0gZmFsc2U7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1haW4uaGlkZGVuID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuY2FuY2VsUmVzZXQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcclxuICAgICAgICBSQUcudmlld3MubWFpbi5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gICAgICAgPSB0cnVlO1xyXG4gICAgICAgIFJBRy52aWV3cy50b29sYmFyLmJ0bk9wdGlvbi5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxjdWxhdGVzIGZvcm0gbGF5b3V0IGFuZCBjb250cm9sIHZpc2liaWxpdHkgYmFzZWQgb24gc3RhdGUgKi9cclxuICAgIHByaXZhdGUgbGF5b3V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHZveEVuYWJsZWQgPSB0aGlzLmNoa1VzZVZveC5jaGVja2VkO1xyXG4gICAgICAgIGxldCB2b3hDdXN0b20gID0gKHRoaXMuc2VsVm94Vm9pY2UudmFsdWUgPT09ICcnKTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTWlncmF0ZSBhbGwgb2YgUkFHIHRvIHVzZSBoaWRkZW4gYXR0cmlidXRlcyBpbnN0ZWFkLCBmb3Igc2NyZWVuIHJlYWRlcnNcclxuICAgICAgICBET00udG9nZ2xlSGlkZGVuQWxsKFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxTcGVlY2hWb2ljZSwgICAhdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLnJhbmdlU3BlZWNoUGl0Y2gsICF2b3hFbmFibGVkXSxcclxuICAgICAgICAgICAgW3RoaXMuc2VsVm94Vm9pY2UsICAgICAgIHZveEVuYWJsZWRdLFxyXG4gICAgICAgICAgICBbdGhpcy5pbnB1dFZveFBhdGgsICAgICAgdm94RW5hYmxlZCAmJiB2b3hDdXN0b21dLFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxWb3hSZXZlcmIsICAgICAgdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLnNlbFZveENoaW1lLCAgICAgICB2b3hFbmFibGVkXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFycyBhbmQgcG9wdWxhdGVzIHRoZSB2b2ljZSBsaXN0ICovXHJcbiAgICBwcml2YXRlIHBvcHVsYXRlVm9pY2VMaXN0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZS5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgICAgICAgbGV0IHZvaWNlcyA9IFJBRy5zcGVlY2guYnJvd3NlclZvaWNlcztcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGxpc3RcclxuICAgICAgICBpZiAodm9pY2VzLmxlbmd0aCA8PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IG9wdGlvbiAgICAgID0gRE9NLmFkZE9wdGlvbiggdGhpcy5zZWxTcGVlY2hWb2ljZSwgTC5TVF9TUEVFQ0hfRU1QVFkoKSApO1xyXG4gICAgICAgICAgICBvcHRpb24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvU3BlZWNoU3ludGhlc2lzXHJcbiAgICAgICAgZWxzZSBmb3IgKGxldCBpID0gMDsgaSA8IHZvaWNlcy5sZW5ndGggOyBpKyspXHJcbiAgICAgICAgICAgIERPTS5hZGRPcHRpb24odGhpcy5zZWxTcGVlY2hWb2ljZSwgYCR7dm9pY2VzW2ldLm5hbWV9ICgke3ZvaWNlc1tpXS5sYW5nfSlgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgcmVzZXQgYnV0dG9uLCB3aXRoIGEgY29uZmlybSBzdGVwIHRoYXQgY2FuY2VscyBhZnRlciAxNSBzZWNvbmRzICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnJlc2V0VGltZW91dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMucmVzZXRUaW1lb3V0ICAgICAgID0gc2V0VGltZW91dCh0aGlzLmNhbmNlbFJlc2V0LmJpbmQodGhpcyksIDE1MDAwKTtcclxuICAgICAgICAgICAgdGhpcy5idG5SZXNldC5pbm5lclRleHQgPSBMLlNUX1JFU0VUX0NPTkZJUk0oKTtcclxuICAgICAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX0NPTkZJUk1fVCgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBSQUcuY29uZmlnLnJlc2V0KCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxSZXNldCgpO1xyXG4gICAgICAgIHRoaXMub3BlbigpO1xyXG4gICAgICAgIGFsZXJ0KCBMLlNUX1JFU0VUX0RPTkUoKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYW5jZWwgdGhlIHJlc2V0IHRpbWVvdXQgYW5kIHJlc3RvcmUgdGhlIHJlc2V0IGJ1dHRvbiB0byBub3JtYWwgKi9cclxuICAgIHByaXZhdGUgY2FuY2VsUmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMucmVzZXRUaW1lb3V0KTtcclxuICAgICAgICB0aGlzLmJ0blJlc2V0LmlubmVyVGV4dCA9IEwuU1RfUkVTRVQoKTtcclxuICAgICAgICB0aGlzLmJ0blJlc2V0LnRpdGxlICAgICA9IEwuU1RfUkVTRVRfVCgpO1xyXG4gICAgICAgIHRoaXMucmVzZXRUaW1lb3V0ICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzYXZlIGJ1dHRvbiwgc2F2aW5nIGNvbmZpZyB0byBzdG9yYWdlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuY29uZmlnLnZveEVuYWJsZWQgICAgPSB0aGlzLmNoa1VzZVZveC5jaGVja2VkO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94UGF0aCAgICAgICA9IHRoaXMuc2VsVm94Vm9pY2UudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hDdXN0b21QYXRoID0gdGhpcy5pbnB1dFZveFBhdGgudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hSZXZlcmIgICAgID0gdGhpcy5zZWxWb3hSZXZlcmIudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hDaGltZSAgICAgID0gdGhpcy5zZWxWb3hDaGltZS52YWx1ZTtcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFZvaWNlICAgPSB0aGlzLnNlbFNwZWVjaFZvaWNlLnNlbGVjdGVkSW5kZXg7XHJcbiAgICAgICAgLy8gcGFyc2VGbG9hdCBpbnN0ZWFkIG9mIHZhbHVlQXNOdW1iZXI7IHNlZSBBcmNoaXRlY3R1cmUubWRcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFZvbCAgICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2ggICA9IHBhcnNlRmxvYXQodGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFJhdGUgICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNhdmUoKTtcclxuICAgICAgICB0aGlzLmNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNwZWVjaCB0ZXN0IGJ1dHRvbiwgc3BlYWtpbmcgYSB0ZXN0IHBocmFzZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVWb2ljZVRlc3QoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEhhcyB0byBleGVjdXRlIG9uIGEgZGVsYXksIGFzIHNwZWVjaCBjYW5jZWwgaXMgdW5yZWxpYWJsZSB3aXRob3V0IGl0XHJcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgbGV0IHBocmFzZSAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBwaHJhc2UuaW5uZXJIVE1MID0gJzxwaHJhc2UgcmVmPVwic2FtcGxlXCIvPic7XHJcblxyXG4gICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKHBocmFzZSk7XHJcblxyXG4gICAgICAgICAgICBSQUcuc3BlZWNoLnNwZWFrKFxyXG4gICAgICAgICAgICAgICAgcGhyYXNlLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCxcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICB1c2VWb3ggICAgOiB0aGlzLmNoa1VzZVZveC5jaGVja2VkLFxyXG4gICAgICAgICAgICAgICAgICAgIHZveFBhdGggICA6IHRoaXMuc2VsVm94Vm9pY2UudmFsdWUgfHwgdGhpcy5pbnB1dFZveFBhdGgudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdm94UmV2ZXJiIDogdGhpcy5zZWxWb3hSZXZlcmIudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdm94Q2hpbWUgIDogdGhpcy5zZWxWb3hDaGltZS52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICB2b2ljZUlkeCAgOiB0aGlzLnNlbFNwZWVjaFZvaWNlLnNlbGVjdGVkSW5kZXgsXHJcbiAgICAgICAgICAgICAgICAgICAgdm9sdW1lICAgIDogdGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHBpdGNoICAgICA6IHRoaXMucmFuZ2VTcGVlY2hQaXRjaC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHJhdGUgICAgICA6IHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlQXNOdW1iZXJcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9LCAyMDApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHRvcCB0b29sYmFyICovXHJcbmNsYXNzIFRvb2xiYXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY29udGFpbmVyIGZvciB0aGUgdG9vbGJhciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gICAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGxheSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuUGxheSAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHN0b3AgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blN0b3AgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBnZW5lcmF0ZSByYW5kb20gcGhyYXNlIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5HZW5lcmF0ZSA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc2F2ZSBzdGF0ZSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuU2F2ZSAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHJlY2FsbCBzdGF0ZSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuUmVjYWxsICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNldHRpbmdzIGJ1dHRvbiAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBidG5PcHRpb24gICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgICA9IERPTS5yZXF1aXJlKCcjdG9vbGJhcicpO1xyXG4gICAgICAgIHRoaXMuYnRuUGxheSAgICAgPSBET00ucmVxdWlyZSgnI2J0blBsYXknKTtcclxuICAgICAgICB0aGlzLmJ0blN0b3AgICAgID0gRE9NLnJlcXVpcmUoJyNidG5TdG9wJyk7XHJcbiAgICAgICAgdGhpcy5idG5HZW5lcmF0ZSA9IERPTS5yZXF1aXJlKCcjYnRuU2h1ZmZsZScpO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZSAgICAgPSBET00ucmVxdWlyZSgnI2J0blNhdmUnKTtcclxuICAgICAgICB0aGlzLmJ0blJlY2FsbCAgID0gRE9NLnJlcXVpcmUoJyNidG5Mb2FkJyk7XHJcbiAgICAgICAgdGhpcy5idG5PcHRpb24gICA9IERPTS5yZXF1aXJlKCcjYnRuU2V0dGluZ3MnKTtcclxuXHJcbiAgICAgICAgdGhpcy5idG5TdG9wLm9uY2xpY2sgICAgID0gdGhpcy5oYW5kbGVTdG9wLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5HZW5lcmF0ZS5vbmNsaWNrID0gdGhpcy5oYW5kbGVHZW5lcmF0ZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZS5vbmNsaWNrICAgICA9IHRoaXMuaGFuZGxlU2F2ZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuUmVjYWxsLm9uY2xpY2sgICA9IHRoaXMuaGFuZGxlTG9hZC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuT3B0aW9uLm9uY2xpY2sgICA9IHRoaXMuaGFuZGxlT3B0aW9uLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEhhcyB0byBleGVjdXRlIG9uIGEgZGVsYXksIGFzIHNwZWVjaCBjYW5jZWwgaXMgdW5yZWxpYWJsZSB3aXRob3V0IGl0XHJcbiAgICAgICAgdGhpcy5idG5QbGF5Lm9uY2xpY2sgPSBldiA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuUGxheS5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KHRoaXMuaGFuZGxlUGxheS5iaW5kKHRoaXMpLCAyMDApO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIEFkZCB0aHJvYiBjbGFzcyBpZiB0aGUgZ2VuZXJhdGUgYnV0dG9uIGhhc24ndCBiZWVuIGNsaWNrZWQgYmVmb3JlXHJcbiAgICAgICAgaWYgKCFSQUcuY29uZmlnLmNsaWNrZWRHZW5lcmF0ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuY2xhc3NMaXN0LmFkZCgndGhyb2InKTtcclxuICAgICAgICAgICAgdGhpcy5idG5HZW5lcmF0ZS5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuYnRuUGxheS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBwbGF5IGJ1dHRvbiwgcGxheWluZyB0aGUgZWRpdG9yJ3MgY3VycmVudCBwaHJhc2Ugd2l0aCBzcGVlY2ggKi9cclxuICAgIHByaXZhdGUgaGFuZGxlUGxheSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zcGVlY2gub25zdG9wID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuUGxheS5oaWRkZW4gPSBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgIGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSB0aGlzLmJ0blN0b3ApXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ0blBsYXkuZm9jdXMoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuYnRuU3RvcC5oaWRkZW4gPSB0cnVlO1xyXG4gICAgICAgICAgICBSQUcuc3BlZWNoLm9uc3RvcCAgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMuYnRuUGxheS5kaXNhYmxlZCA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuYnRuU3RvcC5oaWRkZW4gICA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuYnRuUGxheS5oaWRkZW4gICA9IHRydWU7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBSQUcudmlld3MuZWRpdG9yLmdldFRleHQoKSApO1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3BlYWsoIFJBRy52aWV3cy5lZGl0b3IuZ2V0UGhyYXNlKCkgKTtcclxuICAgICAgICB0aGlzLmJ0blN0b3AuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc3RvcCBidXR0b24sIHN0b3BwaW5nIHRoZSBtYXJxdWVlIGFuZCBhbnkgc3BlZWNoICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVN0b3AoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcclxuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zdG9wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIGdlbmVyYXRlIGJ1dHRvbiwgZ2VuZXJhdGluZyBuZXcgcmFuZG9tIHN0YXRlIGFuZCBwaHJhc2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlR2VuZXJhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBSZW1vdmUgdGhlIGNhbGwtdG8tYWN0aW9uIHRocm9iIGZyb20gaW5pdGlhbCBsb2FkXHJcbiAgICAgICAgdGhpcy5idG5HZW5lcmF0ZS5jbGFzc0xpc3QucmVtb3ZlKCd0aHJvYicpO1xyXG4gICAgICAgIFJBRy5nZW5lcmF0ZSgpO1xyXG4gICAgICAgIFJBRy5jb25maWcuY2xpY2tlZEdlbmVyYXRlID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2F2ZSBidXR0b24sIHBlcnNpc3RpbmcgdGhlIGN1cnJlbnQgdHJhaW4gc3RhdGUgdG8gc3RvcmFnZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVTYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgY3NzID0gJ2ZvbnQtc2l6ZTogbGFyZ2U7IGZvbnQtd2VpZ2h0OiBib2xkOyc7XHJcbiAgICAgICAgICAgIGxldCByYXcgPSBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpO1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3N0YXRlJywgcmF3KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKEwuU1RBVEVfQ09QWV9QQVNURSgpLCBjc3MpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIlJBRy5sb2FkKCdcIiwgcmF3LnJlcGxhY2UoXCInXCIsIFwiXFxcXCdcIiksIFwiJylcIik7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKEwuU1RBVEVfUkFXX0pTT04oKSwgY3NzKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2cocmF3KTtcclxuXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9UT19TVE9SQUdFKCkgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfU0FWRV9GQUlMKGUubWVzc2FnZSkgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIGxvYWQgYnV0dG9uLCBsb2FkaW5nIHRyYWluIHN0YXRlIGZyb20gc3RvcmFnZSwgaWYgaXQgZXhpc3RzICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUxvYWQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZGF0YSA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnc3RhdGUnKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGRhdGFcclxuICAgICAgICAgICAgPyBSQUcubG9hZChkYXRhKVxyXG4gICAgICAgICAgICA6IFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9TQVZFX01JU1NJTkcoKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzZXR0aW5ncyBidXR0b24sIG9wZW5pbmcgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVPcHRpb24oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcudmlld3Muc2V0dGluZ3Mub3BlbigpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBVSSBlbGVtZW50cyBhbmQgdGhlaXIgbG9naWMgKi9cclxuY2xhc3MgVmlld3Ncclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbWFpbiAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gZWRpdG9yIGNvbXBvbmVudCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBlZGl0b3IgICA6IEVkaXRvcjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gbWFycXVlZSBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbWFycXVlZSAgOiBNYXJxdWVlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc2V0dGluZ3MgOiBTZXR0aW5ncztcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gdG9vbGJhciBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgdG9vbGJhciAgOiBUb29sYmFyO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gYWxsIHRoZSBwaWNrZXJzLCBvbmUgZm9yIGVhY2ggdHlwZSBvZiBYTUwgZWxlbWVudCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBwaWNrZXJzICA6IERpY3Rpb25hcnk8UGlja2VyPjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMubWFpbiAgICAgPSBET00ucmVxdWlyZSgnI21haW5TY3JlZW4nKTtcclxuICAgICAgICB0aGlzLmVkaXRvciAgID0gbmV3IEVkaXRvcigpO1xyXG4gICAgICAgIHRoaXMubWFycXVlZSAgPSBuZXcgTWFycXVlZSgpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBuZXcgU2V0dGluZ3MoKTtcclxuICAgICAgICB0aGlzLnRvb2xiYXIgID0gbmV3IFRvb2xiYXIoKTtcclxuICAgICAgICB0aGlzLnBpY2tlcnMgID0ge307XHJcblxyXG4gICAgICAgIFtcclxuICAgICAgICAgICAgbmV3IENvYWNoUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBFeGN1c2VQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IEludGVnZXJQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IE5hbWVkUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBQaHJhc2VzZXRQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFBsYXRmb3JtUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTZXJ2aWNlUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTdGF0aW9uUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTdGF0aW9uTGlzdFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgVGltZVBpY2tlcigpXHJcbiAgICAgICAgXS5mb3JFYWNoKHBpY2tlciA9PiB0aGlzLnBpY2tlcnNbcGlja2VyLnhtbFRhZ10gPSBwaWNrZXIpO1xyXG5cclxuICAgICAgICAvLyBHbG9iYWwgaG90a2V5c1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkub25rZXlkb3duID0gdGhpcy5vbklucHV0LmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGlPUy1zcGVjaWZpYyBDU1MgZml4ZXNcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoJ2lvcycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBwaWNrZXIgdGhhdCBoYW5kbGVzIGEgZ2l2ZW4gdGFnLCBpZiBhbnkgKi9cclxuICAgIHB1YmxpYyBnZXRQaWNrZXIoeG1sVGFnOiBzdHJpbmcpIDogUGlja2VyXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucGlja2Vyc1t4bWxUYWddO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGUgRVNDIHRvIGNsb3NlIHBpY2tlcnMgb3Igc2V0dGlnbnMgKi9cclxuICAgIHByaXZhdGUgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGV2LmtleSAhPT0gJ0VzY2FwZScpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzLmNsb3NlKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCBjb2xsYXBzaWJsZSBlbGVtZW50cyAqL1xyXG5jbGFzcyBDb2xsYXBzaWJsZXNcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNwYW4gVGhlIGVuY2Fwc3VsYXRpbmcgY29sbGFwc2libGUgZWxlbWVudFxyXG4gICAgICogQHBhcmFtIHN0YXRlIFRydWUgdG8gY29sbGFwc2UsIGZhbHNlIHRvIG9wZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzZXQoc3BhbjogSFRNTEVsZW1lbnQsIHN0YXRlOiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoc3RhdGUpIHNwYW4uc2V0QXR0cmlidXRlKCdjb2xsYXBzZWQnLCAnJyk7XHJcbiAgICAgICAgZWxzZSAgICAgICBzcGFuLnJlbW92ZUF0dHJpYnV0ZSgnY29sbGFwc2VkJyk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBTdWdhciBmb3IgY2hvb3Npbmcgc2Vjb25kIHZhbHVlIGlmIGZpcnN0IGlzIHVuZGVmaW5lZCwgaW5zdGVhZCBvZiBmYWxzeSAqL1xyXG5mdW5jdGlvbiBlaXRoZXI8VD4odmFsdWU6IFQgfCB1bmRlZmluZWQsIHZhbHVlMjogVCkgOiBUXHJcbntcclxuICAgIHJldHVybiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkgPyB2YWx1ZTIgOiB2YWx1ZTtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIHRoZSBET00gKi9cclxuY2xhc3MgRE9NXHJcbntcclxuICAgIC8qKiBXaGV0aGVyIHRoZSB3aW5kb3cgaXMgdGhpbm5lciB0aGFuIGEgc3BlY2lmaWMgc2l6ZSAoYW5kLCB0aHVzLCBpcyBcIm1vYmlsZVwiKSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgaXNNb2JpbGUoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aCA8PSA1MDA7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgUkFHIGFwcGVhcnMgdG8gYmUgcnVubmluZyBvbiBhbiBpT1MgZGV2aWNlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBpc2lPUygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3IucGxhdGZvcm0ubWF0Y2goL2lQaG9uZXxpUG9kfGlQYWQvZ2kpICE9PSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBhdHRyaWJ1dGUgZnJvbSB0aGUgZ2l2ZW4gZWxlbWVudCwgb3IgcmV0dXJucyB0aGUgZ2l2ZW5cclxuICAgICAqIGRlZmF1bHQgdmFsdWUgaWYgdW5zZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGF0dHJpYnV0ZSBvZlxyXG4gICAgICogQHBhcmFtIGF0dHIgTmFtZSBvZiB0aGUgYXR0cmlidXRlIHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEBwYXJhbSBkZWYgRGVmYXVsdCB2YWx1ZSBpZiBhdHRyaWJ1dGUgaXNuJ3Qgc2V0XHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gYXR0cmlidXRlJ3MgdmFsdWUsIG9yIGRlZmF1bHQgdmFsdWUgaWYgdW5zZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRBdHRyKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBhdHRyOiBzdHJpbmcsIGRlZjogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBlbGVtZW50Lmhhc0F0dHJpYnV0ZShhdHRyKVxyXG4gICAgICAgICAgICA/IGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHIpIVxyXG4gICAgICAgICAgICA6IGRlZjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIGFuIGVsZW1lbnQgZnJvbSB0aGUgZ2l2ZW4gZG9jdW1lbnQsIHRocm93aW5nIGFuIGVycm9yIGlmIG5vIG1hdGNoIGlzIGZvdW5kLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBxdWVyeSBDU1Mgc2VsZWN0b3IgcXVlcnkgdG8gdXNlXHJcbiAgICAgKiBAcGFyYW0gcGFyZW50IFBhcmVudCBvYmplY3QgdG8gc2VhcmNoOyBkZWZhdWx0cyB0byBkb2N1bWVudFxyXG4gICAgICogQHJldHVybnMgVGhlIGZpcnN0IGVsZW1lbnQgdG8gbWF0Y2ggdGhlIGdpdmVuIHF1ZXJ5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZTxUIGV4dGVuZHMgSFRNTEVsZW1lbnQ+XHJcbiAgICAgICAgKHF1ZXJ5OiBzdHJpbmcsIHBhcmVudDogUGFyZW50Tm9kZSA9IHdpbmRvdy5kb2N1bWVudClcclxuICAgICAgICA6IFRcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gcGFyZW50LnF1ZXJ5U2VsZWN0b3IocXVlcnkpIGFzIFQ7XHJcblxyXG4gICAgICAgIGlmICghcmVzdWx0KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5ET01fTUlTU0lORyhxdWVyeSkgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gYXR0cmlidXRlIGZyb20gdGhlIGdpdmVuIGVsZW1lbnQsIHRocm93aW5nIGFuIGVycm9yXHJcbiAgICAgKiBpZiB0aGUgYXR0cmlidXRlIGlzIG1pc3NpbmcuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGF0dHJpYnV0ZSBvZlxyXG4gICAgICogQHBhcmFtIGF0dHIgTmFtZSBvZiB0aGUgYXR0cmlidXRlIHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBhdHRyaWJ1dGUncyB2YWx1ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmVBdHRyKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBhdHRyOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhZWxlbWVudC5oYXNBdHRyaWJ1dGUoYXR0cikgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5BVFRSX01JU1NJTkcoYXR0cikgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHIpITtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4ga2V5IG9mIHRoZSBnaXZlbiBlbGVtZW50J3MgZGF0YXNldCwgdGhyb3dpbmcgYW4gZXJyb3JcclxuICAgICAqIGlmIHRoZSB2YWx1ZSBpcyBtaXNzaW5nIG9yIGVtcHR5LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBkYXRhIG9mXHJcbiAgICAgKiBAcGFyYW0ga2V5IEtleSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gZGF0YXNldCdzIHZhbHVlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZURhdGEoZWxlbWVudDogSFRNTEVsZW1lbnQsIGtleTogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCB2YWx1ZSA9IGVsZW1lbnQuZGF0YXNldFtrZXldO1xyXG5cclxuICAgICAgICBpZiAoIFN0cmluZ3MuaXNOdWxsT3JFbXB0eSh2YWx1ZSkgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5EQVRBX01JU1NJTkcoa2V5KSApO1xyXG5cclxuICAgICAgICByZXR1cm4gdmFsdWUhO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQmx1cnMgKHVuZm9jdXNlcykgdGhlIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBhcmVudCBJZiBnaXZlbiwgb25seSBibHVycyBpZiBhY3RpdmUgaXMgZGVzY2VuZGFudFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJsdXJBY3RpdmUocGFyZW50OiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmJvZHkpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBhY3RpdmUgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIGFjdGl2ZSAmJiBhY3RpdmUuYmx1ciAmJiBwYXJlbnQuY29udGFpbnMoYWN0aXZlKSApXHJcbiAgICAgICAgICAgIGFjdGl2ZS5ibHVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBEZWVwIGNsb25lcyBhbGwgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50LCBpbnRvIHRoZSB0YXJnZXQgZWxlbWVudC5cclxuICAgICAqIFVzaW5nIGlubmVySFRNTCB3b3VsZCBiZSBlYXNpZXIsIGhvd2V2ZXIgaXQgaGFuZGxlcyBzZWxmLWNsb3NpbmcgdGFncyBwb29ybHkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNvdXJjZSBFbGVtZW50IHdob3NlIGNoaWxkcmVuIHRvIGNsb25lXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVsZW1lbnQgdG8gYXBwZW5kIHRoZSBjbG9uZWQgY2hpbGRyZW4gdG9cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjbG9uZUludG8oc291cmNlOiBIVE1MRWxlbWVudCwgdGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzb3VyY2UuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgdGFyZ2V0LmFwcGVuZENoaWxkKCBzb3VyY2UuY2hpbGROb2Rlc1tpXS5jbG9uZU5vZGUodHJ1ZSkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN1Z2FyIGZvciBjcmVhdGluZyBhbmQgYWRkaW5nIGFuIG9wdGlvbiBlbGVtZW50IHRvIGEgc2VsZWN0IGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBTZWxlY3QgbGlzdCBlbGVtZW50IHRvIGFkZCB0aGUgb3B0aW9uIHRvXHJcbiAgICAgKiBAcGFyYW0gdGV4dCBMYWJlbCBmb3IgdGhlIG9wdGlvblxyXG4gICAgICogQHBhcmFtIHZhbHVlIFZhbHVlIGZvciB0aGUgb3B0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYWRkT3B0aW9uKHNlbGVjdDogSFRNTFNlbGVjdEVsZW1lbnQsIHRleHQ6IHN0cmluZywgdmFsdWU6IHN0cmluZyA9ICcnKVxyXG4gICAgICAgIDogSFRNTE9wdGlvbkVsZW1lbnRcclxuICAgIHtcclxuICAgICAgICBsZXQgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJykgYXMgSFRNTE9wdGlvbkVsZW1lbnQ7XHJcblxyXG4gICAgICAgIG9wdGlvbi50ZXh0ICA9IHRleHQ7XHJcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gdmFsdWU7XHJcblxyXG4gICAgICAgIHNlbGVjdC5hZGQob3B0aW9uKTtcclxuICAgICAgICByZXR1cm4gb3B0aW9uO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3VnYXIgZm9yIHBvcHVsYXRpbmcgYSBzZWxlY3QgZWxlbWVudCB3aXRoIGl0ZW1zIGZyb20gYSBnaXZlbiBvYmplY3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGxpc3QgU2VsZWN0IGVsZW1lbnQgdG8gcG9wdWxhdGVcclxuICAgICAqIEBwYXJhbSBpdGVtcyBBIGRpY3Rpb25hcnkgd2hlcmUga2V5cyBhY3QgbGlrZSB2YWx1ZXMsIGFuZCB2YWx1ZXMgbGlrZSBsYWJlbHNcclxuICAgICAqIEBwYXJhbSBzZWxlY3RlZCBJZiBtYXRjaGVzIGEgZGljdGlvbmFyeSBrZXksIHRoYXQga2V5IGlzIHRoZSBwcmUtc2VsZWN0ZWQgb3B0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcG9wdWxhdGUobGlzdDogSFRNTFNlbGVjdEVsZW1lbnQsIGl0ZW1zOiBhbnksIHNlbGVjdGVkPzogYW55KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCB2YWx1ZSBpbiBpdGVtcylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsYWJlbCA9IGl0ZW1zW3ZhbHVlXTtcclxuICAgICAgICAgICAgbGV0IG9wdCAgID0gRE9NLmFkZE9wdGlvbihsaXN0LCBsYWJlbCwgdmFsdWUpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHNlbGVjdGVkICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgPT09IHNlbGVjdGVkKVxyXG4gICAgICAgICAgICAgICAgb3B0LnNlbGVjdGVkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGV4Y2x1ZGluZyB0aGUgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW4uXHJcbiAgICAgKiBCZSB3YXJuZWQ7IHRoaXMgbWV0aG9kIHVzZXMgUkFHLXNwZWNpZmljIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gcmVjdXJzaXZlbHkgZ2V0IHRleHQgY29udGVudCBvZlxyXG4gICAgICogQHJldHVybnMgVGV4dCBjb250ZW50IG9mIGdpdmVuIGVsZW1lbnQsIHdpdGhvdXQgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRWaXNpYmxlVGV4dChlbGVtZW50OiBFbGVtZW50KSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICAgICAgKGVsZW1lbnQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudC50ZXh0Q29udGVudCB8fCAnJztcclxuICAgICAgICBlbHNlIGlmICggZWxlbWVudC50YWdOYW1lID09PSAnQlVUVE9OJyApXHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuXHJcbiAgICAgICAgLy8gUmV0dXJuIGJsYW5rIChza2lwKSBpZiBjaGlsZCBvZiBhIGNvbGxhcHNlZCBlbGVtZW50LiBQcmV2aW91c2x5LCB0aGlzIHVzZWRcclxuICAgICAgICAvLyBnZXRDb21wdXRlZFN0eWxlLCBidXQgdGhhdCBkb2Vzbid0IHdvcmsgaWYgdGhlIGVsZW1lbnQgaXMgcGFydCBvZiBhbiBvcnBoYW5lZFxyXG4gICAgICAgIC8vIHBocmFzZSAoYXMgaGFwcGVucyB3aXRoIHRoZSBwaHJhc2VzZXQgcGlja2VyKS5cclxuICAgICAgICBsZXQgcGFyZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIHBhcmVudCAmJiBwYXJlbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuXHJcbiAgICAgICAgbGV0IHRleHQgPSAnJztcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgdGV4dCArPSBET00uZ2V0VmlzaWJsZVRleHQoZWxlbWVudC5jaGlsZE5vZGVzW2ldIGFzIEVsZW1lbnQpO1xyXG5cclxuICAgICAgICByZXR1cm4gdGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHRleHQgY29udGVudCBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgZXhjbHVkaW5nIHRoZSB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlbixcclxuICAgICAqIGFuZCBleGNlc3Mgd2hpdGVzcGFjZSBhcyBhIHJlc3VsdCBvZiBjb252ZXJ0aW5nIGZyb20gSFRNTC9YTUwuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gcmVjdXJzaXZlbHkgZ2V0IHRleHQgY29udGVudCBvZlxyXG4gICAgICogQHJldHVybnMgQ2xlYW5lZCB0ZXh0IG9mIGdpdmVuIGVsZW1lbnQsIHdpdGhvdXQgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRDbGVhbmVkVmlzaWJsZVRleHQoZWxlbWVudDogRWxlbWVudCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gU3RyaW5ncy5jbGVhbiggRE9NLmdldFZpc2libGVUZXh0KGVsZW1lbnQpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTY2FucyBmb3IgdGhlIG5leHQgZm9jdXNhYmxlIHNpYmxpbmcgZnJvbSBhIGdpdmVuIGVsZW1lbnQsIHNraXBwaW5nIGhpZGRlbiBvclxyXG4gICAgICogdW5mb2N1c2FibGUgZWxlbWVudHMuIElmIHRoZSBlbmQgb2YgdGhlIGNvbnRhaW5lciBpcyBoaXQsIHRoZSBzY2FuIHdyYXBzIGFyb3VuZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZnJvbSBFbGVtZW50IHRvIHN0YXJ0IHNjYW5uaW5nIGZyb21cclxuICAgICAqIEBwYXJhbSBkaXIgRGlyZWN0aW9uOyAtMSBmb3IgbGVmdCAocHJldmlvdXMpLCAxIGZvciByaWdodCAobmV4dClcclxuICAgICAqIEByZXR1cm5zIFRoZSBuZXh0IGF2YWlsYWJsZSBzaWJsaW5nLCBvciBudWxsIGlmIG5vbmUgZm91bmRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXROZXh0Rm9jdXNhYmxlU2libGluZyhmcm9tOiBIVE1MRWxlbWVudCwgZGlyOiBudW1iZXIpXHJcbiAgICAgICAgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICBsZXQgY3VycmVudCA9IGZyb207XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBmcm9tLnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICghcGFyZW50KVxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRydWUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBQcm9jZWVkIHRvIG5leHQgZWxlbWVudCwgb3Igd3JhcCBhcm91bmQgaWYgaGl0IHRoZSBlbmQgb2YgcGFyZW50XHJcbiAgICAgICAgICAgIGlmICAgICAgKGRpciA8IDApXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgcGFyZW50Lmxhc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA+IDApXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBwYXJlbnQuZmlyc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkJBRF9ESVJFQ1RJT04oIGRpci50b1N0cmluZygpICkgKTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGNvbWUgYmFjayB0byB0aGUgc3RhcnRpbmcgZWxlbWVudCwgbm90aGluZyB3YXMgZm91bmRcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnQgPT09IGZyb20pXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMgZWxlbWVudCBpc24ndCBoaWRkZW4gYW5kIGlzIGZvY3VzYWJsZSwgcmV0dXJuIGl0IVxyXG4gICAgICAgICAgICBpZiAoICFjdXJyZW50LmhpZGRlbiApXHJcbiAgICAgICAgICAgIGlmICggY3VycmVudC5oYXNBdHRyaWJ1dGUoJ3RhYmluZGV4JykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBlbGVtZW50LCByZWxldmFudCB0byBpdHMgcGFyZW50LlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIGVsZW1lbnQgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluZGV4T2YoY2hpbGQ6IEhUTUxFbGVtZW50KSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGRyZW4sIGNoaWxkKVxyXG4gICAgICAgICAgICA6IC0xO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBub2RlLCByZWxldmFudCB0byBpdHMgcGFyZW50LiBVc2VkIGZvciB0ZXh0IG5vZGVzLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIG5vZGUgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG5vZGVJbmRleE9mKGNoaWxkOiBOb2RlKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnROb2RlO1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGROb2RlcywgY2hpbGQpXHJcbiAgICAgICAgICAgIDogLTE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUb2dnbGVzIHRoZSBoaWRkZW4gYXR0cmlidXRlIG9mIHRoZSBnaXZlbiBlbGVtZW50LCBhbmQgYWxsIGl0cyBsYWJlbHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byB0b2dnbGUgdGhlIGhpZGRlbiBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBmb3JjZSBPcHRpb25hbCB2YWx1ZSB0byBmb3JjZSB0b2dnbGluZyB0b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRvZ2dsZUhpZGRlbihlbGVtZW50OiBIVE1MRWxlbWVudCwgZm9yY2U/OiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaGlkZGVuID0gIWVsZW1lbnQuaGlkZGVuO1xyXG5cclxuICAgICAgICAvLyBEbyBub3RoaW5nIGlmIGFscmVhZHkgdG9nZ2xlZCB0byB0aGUgZm9yY2VkIHN0YXRlXHJcbiAgICAgICAgaWYgKGhpZGRlbiA9PT0gZm9yY2UpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgZWxlbWVudC5oaWRkZW4gPSBoaWRkZW47XHJcblxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtmb3I9JyR7ZWxlbWVudC5pZH0nXWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGwgPT4gKGwgYXMgSFRNTEVsZW1lbnQpLmhpZGRlbiA9IGhpZGRlbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUb2dnbGVzIHRoZSBoaWRkZW4gYXR0cmlidXRlIG9mIGEgZ3JvdXAgb2YgZWxlbWVudHMsIGluIGJ1bGsuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGxpc3QgQW4gYXJyYXkgb2YgYXJndW1lbnQgcGFpcnMgZm9yIHt0b2dnbGVIaWRkZW59XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdG9nZ2xlSGlkZGVuQWxsKC4uLmxpc3Q6IFtIVE1MRWxlbWVudCwgYm9vbGVhbj9dW10pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxpc3QuZm9yRWFjaCggbCA9PiB0aGlzLnRvZ2dsZUhpZGRlbiguLi5sKSApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQSB2ZXJ5IHNtYWxsIHN1YnNldCBvZiBNYXJrZG93biBmb3IgaHlwZXJsaW5raW5nIGEgYmxvY2sgb2YgdGV4dCAqL1xyXG5jbGFzcyBMaW5rZG93blxyXG57XHJcbiAgICAvKiogUmVnZXggcGF0dGVybiBmb3IgbWF0Y2hpbmcgbGlua2VkIHRleHQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX0xJTksgPSAvXFxbKFtcXHNcXFNdKz8pXFxdXFxbKFxcZCspXFxdL2dtaTtcclxuICAgIC8qKiBSZWdleCBwYXR0ZXJuIGZvciBtYXRjaGluZyBsaW5rIHJlZmVyZW5jZXMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX1JFRiAgPSAvXlxcWyhcXGQrKVxcXTpcXHMrKFxcUyspJC9nbWk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRlbXB0cyB0byBsb2FkIHRoZSBnaXZlbiBsaW5rZG93biBmaWxlLCBwYXJzZSBhbmQgc2V0IGl0IGFzIGFuIGVsZW1lbnQncyB0ZXh0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwYXRoIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCB0byBmZXRjaCB0aGUgbGlua2Rvd24gZnJvbVxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IERPTSBxdWVyeSBmb3IgdGhlIG9iamVjdCB0byBwdXQgdGhlIHRleHQgaW50b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxvYWRJbnRvKHBhdGg6IHN0cmluZywgcXVlcnk6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGRvbSA9IERPTS5yZXF1aXJlKHF1ZXJ5KTtcclxuXHJcbiAgICAgICAgZG9tLmlubmVyVGV4dCA9IGBMb2FkaW5nIHRleHQgZnJvbSAnJHtwYXRofScuLi5gO1xyXG5cclxuICAgICAgICBmZXRjaChwYXRoKVxyXG4gICAgICAgICAgICAudGhlbiggcmVxID0+IHJlcS50ZXh0KCkgKVxyXG4gICAgICAgICAgICAudGhlbiggdHh0ID0+IGRvbS5pbm5lckhUTUwgPSBMaW5rZG93bi5wYXJzZSh0eHQpIClcclxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiBkb20uaW5uZXJUZXh0ID0gYENvdWxkIG5vdCBsb2FkICcke3BhdGh9JzogJHtlcnJ9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQYXJzZXMgdGhlIGdpdmVuIHRleHQgZnJvbSBMaW5rZG93biB0byBIVE1MLCBjb252ZXJ0aW5nIHRhZ2dlZCB0ZXh0IGludG8gbGlua3NcclxuICAgICAqIHVzaW5nIGEgZ2l2ZW4gbGlzdCBvZiByZWZlcmVuY2VzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0ZXh0IExpbmtkb3duIHRleHQgdG8gdHJhbnNmb3JtIHRvIEhUTUxcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcGFyc2UodGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBsaW5rcyA6IERpY3Rpb25hcnk8c3RyaW5nPiA9IHt9O1xyXG5cclxuICAgICAgICAvLyBGaXJzdCwgc2FuaXRpemUgYW55IEhUTUxcclxuICAgICAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKCc8JywgJyZsdDsnKS5yZXBsYWNlKCc+JywgJyZndDsnKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgZ2V0IHRoZSBsaXN0IG9mIHJlZmVyZW5jZXMsIHJlbW92aW5nIHRoZW0gZnJvbSB0aGUgdGV4dFxyXG4gICAgICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9SRUYsIChfLCBrLCB2KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGlua3Nba10gPSB2O1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmFsbHksIHJlcGxhY2UgZWFjaCB0YWdnZWQgcGFydCBvZiB0ZXh0IHdpdGggYSBsaW5rIGVsZW1lbnQuIElmIGEgdGFnIGhhc1xyXG4gICAgICAgIC8vIGFuIGludmFsaWQgcmVmZXJlbmNlLCBpdCBpcyBpZ25vcmVkLlxyXG4gICAgICAgIHJldHVybiB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9MSU5LLCAobWF0Y2gsIHQsIGspID0+XHJcbiAgICAgICAgICAgIGxpbmtzW2tdXHJcbiAgICAgICAgICAgICAgICA/IGA8YSBocmVmPScke2xpbmtzW2tdfScgdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9vcGVuZXJcIj4ke3R9PC9hPmBcclxuICAgICAgICAgICAgICAgIDogbWF0Y2hcclxuICAgICAgICApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBwYXJzaW5nIGRhdGEgZnJvbSBzdHJpbmdzICovXHJcbmNsYXNzIFBhcnNlXHJcbntcclxuICAgIC8qKiBQYXJzZXMgYSBnaXZlbiBzdHJpbmcgaW50byBhIGJvb2xlYW4gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYm9vbGVhbihzdHI6IHN0cmluZykgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgc3RyID0gc3RyLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIGlmIChzdHIgPT09ICd0cnVlJyB8fCBzdHIgPT09ICcxJylcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgaWYgKHN0ciA9PT0gJ2ZhbHNlJyB8fCBzdHIgPT09ICcwJylcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICB0aHJvdyBFcnJvciggTC5CQURfQk9PTEVBTihzdHIpICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGdlbmVyYXRpbmcgcmFuZG9tIGRhdGEgKi9cclxuY2xhc3MgUmFuZG9tXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gaW50ZWdlciBmcm9tIHRoZSBnaXZlbiByYW5nZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gaW50ZWdlciB0byBwaWNrLCBpbmNsdXNpdmVcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBpbnRlZ2VyIHRvIHBpY2ssIGluY2x1c2l2ZVxyXG4gICAgICogQHJldHVybnMgUmFuZG9tIGludGVnZXIgd2l0aGluIHRoZSBnaXZlbiByYW5nZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGludChtaW46IG51bWJlciA9IDAsIG1heDogbnVtYmVyID0gMSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5mbG9vciggTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4pICkgKyBtaW47XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5LWxpa2Ugb2JqZWN0IHdpdGggYSBsZW5ndGggcHJvcGVydHkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXJyYXkoYXJyOiBMZW5ndGhhYmxlKSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBhcnJbIFJhbmRvbS5pbnQoMCwgYXJyLmxlbmd0aCkgXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3BsaWNlcyBhIHJhbmRvbSBlbGVtZW50IGZyb20gYSBnaXZlbiBhcnJheSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhcnJheVNwbGljZTxUPihhcnI6IFRbXSkgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGFyci5zcGxpY2UoUmFuZG9tLmludCgwLCBhcnIubGVuZ3RoKSwgMSlbMF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGtleSBmcm9tIGEgZ2l2ZW4gb2JqZWN0ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG9iamVjdEtleShvYmo6IHt9KSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkoIE9iamVjdC5rZXlzKG9iaikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIHRydWUgb3IgZmFsc2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNoYW5jZSBDaGFuY2Ugb3V0IG9mIDEwMCwgdG8gcGljayBgdHJ1ZWBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sKGNoYW5jZTogbnVtYmVyID0gNTApIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uaW50KDAsIDEwMCkgPCBjaGFuY2U7XHJcbiAgICB9XHJcbn1cclxuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBjbGFzcyBmb3IgYXVkaW8gZnVuY3Rpb25hbGl0eSAqL1xyXG5jbGFzcyBTb3VuZHNcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBEZWNvZGVzIHRoZSBnaXZlbiBhdWRpbyBmaWxlIGludG8gcmF3IGF1ZGlvIGRhdGEuIFRoaXMgaXMgYSB3cmFwcGVyIGZvciB0aGUgb2xkZXJcclxuICAgICAqIGNhbGxiYWNrLWJhc2VkIHN5bnRheCwgc2luY2UgaXQgaXMgdGhlIG9ubHkgb25lIGlPUyBjdXJyZW50bHkgc3VwcG9ydHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQXVkaW8gY29udGV4dCB0byB1c2UgZm9yIGRlY29kaW5nXHJcbiAgICAgKiBAcGFyYW0gYnVmZmVyIEJ1ZmZlciBvZiBlbmNvZGVkIGZpbGUgZGF0YSAoZS5nLiBtcDMpIHRvIGRlY29kZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFzeW5jIGRlY29kZShjb250ZXh0OiBBdWRpb0NvbnRleHQsIGJ1ZmZlcjogQXJyYXlCdWZmZXIpXHJcbiAgICAgICAgOiBQcm9taXNlPEF1ZGlvQnVmZmVyPlxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSA8QXVkaW9CdWZmZXI+ICggKHJlc29sdmUsIHJlamVjdCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiBjb250ZXh0LmRlY29kZUF1ZGlvRGF0YShidWZmZXIsIHJlc29sdmUsIHJlamVjdCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCBzdHJpbmdzICovXHJcbmNsYXNzIFN0cmluZ3Ncclxue1xyXG4gICAgLyoqIENoZWNrcyBpZiB0aGUgZ2l2ZW4gc3RyaW5nIGlzIG51bGwsIG9yIGVtcHR5ICh3aGl0ZXNwYWNlIG9ubHkgb3IgemVyby1sZW5ndGgpICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzTnVsbE9yRW1wdHkoc3RyOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gIXN0ciB8fCAhc3RyLnRyaW0oKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByZXR0eS1wcmludCdzIGEgZ2l2ZW4gbGlzdCBvZiBzdGF0aW9ucywgd2l0aCBjb250ZXh0IHNlbnNpdGl2ZSBleHRyYXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGVzIExpc3Qgb2Ygc3RhdGlvbiBjb2RlcyB0byBqb2luXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBMaXN0J3MgY29udGV4dC4gSWYgJ2NhbGxpbmcnLCBoYW5kbGVzIHNwZWNpYWwgY2FzZVxyXG4gICAgICogQHJldHVybnMgUHJldHR5LXByaW50ZWQgbGlzdCBvZiBnaXZlbiBzdGF0aW9uc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21TdGF0aW9uTGlzdChjb2Rlczogc3RyaW5nW10sIGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gJyc7XHJcbiAgICAgICAgbGV0IG5hbWVzICA9IGNvZGVzLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIG5hbWVzLmZvckVhY2goIChjLCBpKSA9PiBuYW1lc1tpXSA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGMpICk7XHJcblxyXG4gICAgICAgIGlmIChuYW1lcy5sZW5ndGggPT09IDEpXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IChjb250ZXh0ID09PSAnY2FsbGluZycpXHJcbiAgICAgICAgICAgICAgICA/IGAke25hbWVzWzBdfSBvbmx5YFxyXG4gICAgICAgICAgICAgICAgOiBuYW1lc1swXTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFzdFN0YXRpb24gPSBuYW1lcy5wb3AoKTtcclxuXHJcbiAgICAgICAgICAgIHJlc3VsdCAgPSBuYW1lcy5qb2luKCcsICcpO1xyXG4gICAgICAgICAgICByZXN1bHQgKz0gYCBhbmQgJHtsYXN0U3RhdGlvbn1gO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByZXR0eS1wcmludHMgdGhlIGdpdmVuIGRhdGUgb3IgaG91cnMgYW5kIG1pbnV0ZXMgaW50byBhIDI0LWhvdXIgdGltZSAoZS5nLiAwMTowOSkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGhvdXJzIEhvdXJzLCBmcm9tIDAgdG8gMjMsIG9yIERhdGUgb2JqZWN0XHJcbiAgICAgKiBAcGFyYW0gbWludXRlcyBNaW51dGVzLCBmcm9tIDAgdG8gNTlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tVGltZShob3VyczogbnVtYmVyIHwgRGF0ZSwgbWludXRlczogbnVtYmVyID0gMCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAoaG91cnMgaW5zdGFuY2VvZiBEYXRlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbWludXRlcyA9IGhvdXJzLmdldE1pbnV0ZXMoKTtcclxuICAgICAgICAgICAgaG91cnMgICA9IGhvdXJzLmdldEhvdXJzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gaG91cnMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpICsgJzonICtcclxuICAgICAgICAgICAgbWludXRlcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFucyB1cCB0aGUgZ2l2ZW4gdGV4dCBvZiBleGNlc3Mgd2hpdGVzcGFjZSBhbmQgYW55IG5ld2xpbmVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsZWFuKHRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGV4dC50cmltKClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXG5cXHJdL2dpLCAgICcnICApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHN7Mix9L2dpLCAgICcgJyApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC/igJxcXHMrL2dpLCAgICAgJ+KAnCcgKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxzK+KAnS9naSwgICAgICfigJ0nIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccyhbLixdKS9naSwgJyQxJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0cm9uZ2x5IGNvbXByZXNzZXMgdGhlIGdpdmVuIHN0cmluZyB0byBvbmUgbW9yZSBmaWxlbmFtZSBmcmllbmRseSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaWxlbmFtZSh0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRleHRcclxuICAgICAgICAgICAgLnRvTG93ZXJDYXNlKClcclxuICAgICAgICAgICAgLy8gUmVwbGFjZSBwbHVyYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pZXNcXGIvZywgJ3knKVxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgY29tbW9uIHdvcmRzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGIoYXxhbnxhdHxiZXxvZnxvbnx0aGV8dG98aW58aXN8aGFzfGJ5fHdpdGgpXFxiL2csICcnKVxyXG4gICAgICAgICAgICAudHJpbSgpXHJcbiAgICAgICAgICAgIC8vIENvbnZlcnQgc3BhY2VzIHRvIHVuZGVyc2NvcmVzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMrL2csICdfJylcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGFsbCBub24tYWxwaGFudW1lcmljYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXmEtejAtOV9dL2csICcnKVxyXG4gICAgICAgICAgICAvLyBMaW1pdCB0byAxMDAgY2hhcnM7IG1vc3Qgc3lzdGVtcyBzdXBwb3J0IG1heC4gMjU1IGJ5dGVzIGluIGZpbGVuYW1lc1xyXG4gICAgICAgICAgICAuc3Vic3RyaW5nKDAsIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGZpcnN0IG1hdGNoIG9mIGEgcGF0dGVybiBpbiBhIHN0cmluZywgb3IgdW5kZWZpbmVkIGlmIG5vdCBmb3VuZCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaXJzdE1hdGNoKHRleHQ6IHN0cmluZywgcGF0dGVybjogUmVnRXhwLCBpZHg6IG51bWJlcilcclxuICAgICAgICA6IHN0cmluZyB8IHVuZGVmaW5lZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBtYXRjaCA9IHRleHQubWF0Y2gocGF0dGVybik7XHJcblxyXG4gICAgICAgIHJldHVybiAobWF0Y2ggJiYgbWF0Y2hbaWR4XSlcclxuICAgICAgICAgICAgPyBtYXRjaFtpZHhdXHJcbiAgICAgICAgICAgIDogdW5kZWZpbmVkO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVW5pb24gdHlwZSBmb3IgaXRlcmFibGUgdHlwZXMgd2l0aCBhIC5sZW5ndGggcHJvcGVydHkgKi9cclxudHlwZSBMZW5ndGhhYmxlID0gQXJyYXk8YW55PiB8IE5vZGVMaXN0IHwgSFRNTENvbGxlY3Rpb24gfCBzdHJpbmc7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHBsYXRmb3JtIGFzIGEgZGlnaXQgYW5kIG9wdGlvbmFsIGxldHRlciB0dXBsZSAqL1xyXG50eXBlIFBsYXRmb3JtID0gW3N0cmluZywgc3RyaW5nXTtcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgc3RhdGlvbiBuYW1lLCB3aGljaCBjYW4gYmUgYSBzaW1wbGUgc3RyaW5nIG9yIGNvbXBsZXggb2JqZWN0ICovXHJcbnR5cGUgU3RhdGlvbiA9IHN0cmluZyB8IFN0YXRpb25EZWY7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIGNvbXBsZXggc3RhdGlvbiBuYW1lIGRlZmluaXRpb24gKi9cclxuaW50ZXJmYWNlIFN0YXRpb25EZWZcclxue1xyXG4gICAgLyoqIENhbm9uaWNhbCBuYW1lIG9mIHRoZSBzdGF0aW9uICovXHJcbiAgICBuYW1lICAgICAgOiBzdHJpbmc7XHJcbiAgICAvKiogU3RhdGlvbiBjb2RlIHRvIHVzZSB0aGUgc2FtZSByZWNvcmRpbmcgb2YgKi9cclxuICAgIHZveEFsaWFzPyA6IHN0cmluZztcclxufVxyXG5cclxuLyoqIFJlcHJlc2VudHMgYSBnZW5lcmljIGtleS12YWx1ZSBkaWN0aW9uYXJ5LCB3aXRoIHN0cmluZyBrZXlzICovXHJcbnR5cGUgRGljdGlvbmFyeTxUPiA9IHsgW2luZGV4OiBzdHJpbmddOiBUIH07XHJcblxyXG4vKiogRGVmaW5lcyB0aGUgZGF0YSByZWZlcmVuY2VzIGNvbmZpZyBvYmplY3QgcGFzc2VkIGludG8gUkFHLm1haW4gb24gaW5pdCAqL1xyXG5pbnRlcmZhY2UgRGF0YVJlZnNcclxue1xyXG4gICAgLyoqIFNlbGVjdG9yIGZvciBnZXR0aW5nIHRoZSBwaHJhc2Ugc2V0IFhNTCBJRnJhbWUgZWxlbWVudCAqL1xyXG4gICAgcGhyYXNlc2V0RW1iZWQgOiBzdHJpbmc7XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIGV4Y3VzZXMgZm9yIHRyYWluIGRlbGF5cyBvciBjYW5jZWxsYXRpb25zIHRvIHVzZSAqL1xyXG4gICAgZXhjdXNlc0RhdGEgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgbmFtZXMgZm9yIHNwZWNpYWwgdHJhaW5zIHRvIHVzZSAqL1xyXG4gICAgbmFtZWREYXRhICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgbmFtZXMgZm9yIHNlcnZpY2VzL25ldHdvcmtzIHRvIHVzZSAqL1xyXG4gICAgc2VydmljZXNEYXRhICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgZGljdGlvbmFyeSBvZiBzdGF0aW9uIGNvZGVzIGFuZCBuYW1lcyB0byB1c2UgKi9cclxuICAgIHN0YXRpb25zRGF0YSAgIDogRGljdGlvbmFyeTxzdHJpbmc+O1xyXG59XHJcblxyXG4vKiogRmlsbCBpbnMgZm9yIHZhcmlvdXMgbWlzc2luZyBkZWZpbml0aW9ucyBvZiBtb2Rlcm4gSmF2YXNjcmlwdCBmZWF0dXJlcyAqL1xyXG5cclxuaW50ZXJmYWNlIFdpbmRvd1xyXG57XHJcbiAgICBvbnVuaGFuZGxlZHJlamVjdGlvbjogRXJyb3JFdmVudEhhbmRsZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTdHJpbmdcclxue1xyXG4gICAgcGFkU3RhcnQodGFyZ2V0TGVuZ3RoOiBudW1iZXIsIHBhZFN0cmluZz86IHN0cmluZykgOiBzdHJpbmc7XHJcbiAgICBwYWRFbmQodGFyZ2V0TGVuZ3RoOiBudW1iZXIsIHBhZFN0cmluZz86IHN0cmluZykgOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBcnJheTxUPlxyXG57XHJcbiAgICBpbmNsdWRlcyhzZWFyY2hFbGVtZW50OiBULCBmcm9tSW5kZXg/OiBudW1iZXIpIDogYm9vbGVhbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEhUTUxFbGVtZW50XHJcbntcclxuICAgIGxhYmVscyA6IE5vZGVMaXN0T2Y8SFRNTEVsZW1lbnQ+O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXVkaW9Db250ZXh0QmFzZVxyXG57XHJcbiAgICBhdWRpb1dvcmtsZXQgOiBBdWRpb1dvcmtsZXQ7XHJcbn1cclxuXHJcbnR5cGUgU2FtcGxlQ2hhbm5lbHMgPSBGbG9hdDMyQXJyYXlbXVtdO1xyXG5cclxuZGVjbGFyZSBjbGFzcyBBdWRpb1dvcmtsZXRQcm9jZXNzb3Jcclxue1xyXG4gICAgc3RhdGljIHBhcmFtZXRlckRlc2NyaXB0b3JzIDogQXVkaW9QYXJhbURlc2NyaXB0b3JbXTtcclxuXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3Iob3B0aW9ucz86IEF1ZGlvV29ya2xldE5vZGVPcHRpb25zKTtcclxuICAgIHJlYWRvbmx5IHBvcnQ/OiBNZXNzYWdlUG9ydDtcclxuXHJcbiAgICBwcm9jZXNzKFxyXG4gICAgICAgIGlucHV0czogU2FtcGxlQ2hhbm5lbHMsXHJcbiAgICAgICAgb3V0cHV0czogU2FtcGxlQ2hhbm5lbHMsXHJcbiAgICAgICAgcGFyYW1ldGVyczogRGljdGlvbmFyeTxGbG9hdDMyQXJyYXk+XHJcbiAgICApIDogYm9vbGVhbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEF1ZGlvV29ya2xldE5vZGVPcHRpb25zIGV4dGVuZHMgQXVkaW9Ob2RlT3B0aW9uc1xyXG57XHJcbiAgICBudW1iZXJPZklucHV0cz8gOiBudW1iZXI7XHJcbiAgICBudW1iZXJPZk91dHB1dHM/IDogbnVtYmVyO1xyXG4gICAgb3V0cHV0Q2hhbm5lbENvdW50PyA6IG51bWJlcltdO1xyXG4gICAgcGFyYW1ldGVyRGF0YT8gOiB7W2luZGV4OiBzdHJpbmddIDogbnVtYmVyfTtcclxuICAgIHByb2Nlc3Nvck9wdGlvbnM/IDogYW55O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTWVkaWFUcmFja0NvbnN0cmFpbnRTZXRcclxue1xyXG4gICAgYXV0b0dhaW5Db250cm9sPzogYm9vbGVhbiB8IENvbnN0cmFpbkJvb2xlYW5QYXJhbWV0ZXJzO1xyXG4gICAgbm9pc2VTdXBwcmVzc2lvbj86IGJvb2xlYW4gfCBDb25zdHJhaW5Cb29sZWFuUGFyYW1ldGVycztcclxufVxyXG5cclxuZGVjbGFyZSBmdW5jdGlvbiByZWdpc3RlclByb2Nlc3NvcihuYW1lOiBzdHJpbmcsIGN0b3I6IEF1ZGlvV29ya2xldFByb2Nlc3NvcikgOiB2b2lkOyIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgZGF0YSBmb3IgZXhjdXNlcywgdHJhaW5zLCBzZXJ2aWNlcyBhbmQgc3RhdGlvbnMgKi9cclxuY2xhc3MgRGF0YWJhc2Vcclxue1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiBleGN1c2VzICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGV4Y3VzZXMgICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGF0YXNldCBvZiBuYW1lZCB0cmFpbnMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbmFtZWQgICAgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIHNlcnZpY2Ugb3IgbmV0d29yayBuYW1lcyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzZXJ2aWNlcyAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBuYW1lcywgd2l0aCB0aHJlZS1sZXR0ZXIgY29kZSBrZXlzIChlLmcuIEFCQykgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc3RhdGlvbnMgICAgICA6IERpY3Rpb25hcnk8U3RhdGlvbj47XHJcbiAgICAvKiogTG9hZGVkIFhNTCBkb2N1bWVudCBjb250YWluaW5nIHBocmFzZXNldCBkYXRhICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHBocmFzZXNldHMgICAgOiBEb2N1bWVudDtcclxuICAgIC8qKiBBbW91bnQgb2Ygc3RhdGlvbnMgaW4gdGhlIGN1cnJlbnRseSBsb2FkZWQgZGF0YXNldCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzdGF0aW9uc0NvdW50IDogbnVtYmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihkYXRhUmVmczogRGF0YVJlZnMpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ICA9IGRhdGFSZWZzLnBocmFzZXNldEVtYmVkO1xyXG4gICAgICAgIGxldCBpZnJhbWUgPSBET00ucmVxdWlyZSA8SFRNTElGcmFtZUVsZW1lbnQ+IChxdWVyeSk7XHJcblxyXG4gICAgICAgIGlmICghaWZyYW1lLmNvbnRlbnREb2N1bWVudClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRShxdWVyeSkgKTtcclxuXHJcbiAgICAgICAgdGhpcy5waHJhc2VzZXRzICAgID0gaWZyYW1lLmNvbnRlbnREb2N1bWVudDtcclxuICAgICAgICB0aGlzLmV4Y3VzZXMgICAgICAgPSBkYXRhUmVmcy5leGN1c2VzRGF0YTtcclxuICAgICAgICB0aGlzLm5hbWVkICAgICAgICAgPSBkYXRhUmVmcy5uYW1lZERhdGE7XHJcbiAgICAgICAgdGhpcy5zZXJ2aWNlcyAgICAgID0gZGF0YVJlZnMuc2VydmljZXNEYXRhO1xyXG4gICAgICAgIHRoaXMuc3RhdGlvbnMgICAgICA9IGRhdGFSZWZzLnN0YXRpb25zRGF0YTtcclxuICAgICAgICB0aGlzLnN0YXRpb25zQ291bnQgPSBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGg7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbRGF0YWJhc2VdIEVudHJpZXMgbG9hZGVkOicpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRFeGN1c2VzOicsICAgICAgdGhpcy5leGN1c2VzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdE5hbWVkIHRyYWluczonLCB0aGlzLm5hbWVkLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdFNlcnZpY2VzOicsICAgICB0aGlzLnNlcnZpY2VzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdFN0YXRpb25zOicsICAgICB0aGlzLnN0YXRpb25zQ291bnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBleGN1c2UgZm9yIGEgZGVsYXkgb3IgY2FuY2VsbGF0aW9uICovXHJcbiAgICBwdWJsaWMgcGlja0V4Y3VzZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLmV4Y3VzZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHBpY2tOYW1lZCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLm5hbWVkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENsb25lcyBhbmQgZ2V0cyBwaHJhc2Ugd2l0aCB0aGUgZ2l2ZW4gSUQsIG9yIG51bGwgaWYgaXQgZG9lc24ndCBleGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWQgSUQgb2YgdGhlIHBocmFzZSB0byBnZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZShpZDogc3RyaW5nKSA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSB0aGlzLnBocmFzZXNldHMucXVlcnlTZWxlY3RvcigncGhyYXNlIycgKyBpZCkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmIChyZXN1bHQpXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgcGhyYXNlc2V0IHdpdGggdGhlIGdpdmVuIElELCBvciBudWxsIGlmIGl0IGRvZXNuJ3QgZXhpc3QuIE5vdGUgdGhhdCB0aGVcclxuICAgICAqIHJldHVybmVkIHBocmFzZXNldCBjb21lcyBmcm9tIHRoZSBYTUwgZG9jdW1lbnQsIHNvIGl0IHNob3VsZCBub3QgYmUgbXV0YXRlZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWQgSUQgb2YgdGhlIHBocmFzZXNldCB0byBnZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldChpZDogc3RyaW5nKSA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnBocmFzZXNldHMucXVlcnlTZWxlY3RvcigncGhyYXNlc2V0IycgKyBpZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIHJhaWwgbmV0d29yayBuYW1lICovXHJcbiAgICBwdWJsaWMgcGlja1NlcnZpY2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5zZXJ2aWNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSBzdGF0aW9uIGNvZGUgZnJvbSB0aGUgZGF0YXNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZSBMaXN0IG9mIGNvZGVzIHRvIGV4Y2x1ZGUuIE1heSBiZSBpZ25vcmVkIGlmIHNlYXJjaCB0YWtlcyB0b28gbG9uZy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHBpY2tTdGF0aW9uQ29kZShleGNsdWRlPzogc3RyaW5nW10pIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgLy8gR2l2ZSB1cCBmaW5kaW5nIHJhbmRvbSBzdGF0aW9uIHRoYXQncyBub3QgaW4gdGhlIGdpdmVuIGxpc3QsIGlmIHdlIHRyeSBtb3JlXHJcbiAgICAgICAgLy8gdGltZXMgdGhlbiB0aGVyZSBhcmUgc3RhdGlvbnMuIEluYWNjdXJhdGUsIGJ1dCBhdm9pZHMgaW5maW5pdGUgbG9vcHMuXHJcbiAgICAgICAgaWYgKGV4Y2x1ZGUpIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zdGF0aW9uc0NvdW50OyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCAhZXhjbHVkZS5pbmNsdWRlcyh2YWx1ZSkgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5vYmplY3RLZXkodGhpcy5zdGF0aW9ucyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBzdGF0aW9uIG5hbWUgZnJvbSB0aGUgZ2l2ZW4gdGhyZWUgbGV0dGVyIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBnZXQgdGhlIG5hbWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFN0YXRpb24gbmFtZSBmb3IgdGhlIGdpdmVuIGNvZGVcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29kZTogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gdGhpcy5zdGF0aW9uc1tjb2RlXTtcclxuXHJcbiAgICAgICAgaWYgKCFzdGF0aW9uKVxyXG4gICAgICAgICAgICByZXR1cm4gTC5EQl9VTktOT1dOX1NUQVRJT04oY29kZSk7XHJcblxyXG4gICAgICAgIGlmICh0eXBlb2Ygc3RhdGlvbiA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgICAgIHJldHVybiBTdHJpbmdzLmlzTnVsbE9yRW1wdHkoc3RhdGlvbilcclxuICAgICAgICAgICAgICAgID8gTC5EQl9FTVBUWV9TVEFUSU9OKGNvZGUpXHJcbiAgICAgICAgICAgICAgICA6IHN0YXRpb247XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICByZXR1cm4gIXN0YXRpb24ubmFtZVxyXG4gICAgICAgICAgICAgICAgPyBMLkRCX0VNUFRZX1NUQVRJT04oY29kZSlcclxuICAgICAgICAgICAgICAgIDogc3RhdGlvbi5uYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlJ3Mgdm94IGFsaWFzLCBpZiBhbnkuIEEgdm94IGFsaWFzIGlzIHRoZSBjb2RlIG9mIGFub3RoZXJcclxuICAgICAqIHN0YXRpb24ncyB2b2ljZSBmaWxlLCB0aGF0IHRoZSBnaXZlbiBjb2RlIHNob3VsZCB1c2UgaW5zdGVhZC4gVGhpcyBpcyB1c2VkIGZvclxyXG4gICAgICogc3RhdGlvbnMgd2l0aCBkdXBsaWNhdGUgbmFtZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgU3RhdGlvbiBjb2RlIHRvIGdldCB0aGUgdm94IGFsaWFzIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgYWxpYXMgY29kZSwgZWxzZSB0aGUgZ2l2ZW4gY29kZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvblZveChjb2RlOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSB0aGlzLnN0YXRpb25zW2NvZGVdO1xyXG5cclxuICAgICAgICAvLyBVbmtub3duIHN0YXRpb25cclxuICAgICAgICBpZiAgICAgICghc3RhdGlvbilcclxuICAgICAgICAgICAgcmV0dXJuICc/Pz8nO1xyXG4gICAgICAgIC8vIFN0YXRpb24gaXMganVzdCBhIHN0cmluZzsgYXNzdW1lIG5vIGFsaWFzXHJcbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIHN0YXRpb24gPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICByZXR1cm4gY29kZTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiBlaXRoZXIoc3RhdGlvbi52b3hBbGlhcywgY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSByYW5nZSBvZiBzdGF0aW9uIGNvZGVzLCBlbnN1cmluZyB0aGVyZSBhcmUgbm8gZHVwbGljYXRlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gYW1vdW50IG9mIHN0YXRpb25zIHRvIHBpY2tcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBhbW91bnQgb2Ygc3RhdGlvbnMgdG8gcGlja1xyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGVcclxuICAgICAqIEByZXR1cm5zIEEgbGlzdCBvZiB1bmlxdWUgc3RhdGlvbiBuYW1lc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcGlja1N0YXRpb25Db2RlcyhtaW4gPSAxLCBtYXggPSAxNiwgZXhjbHVkZT8gOiBzdHJpbmdbXSkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChtYXggLSBtaW4gPiBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX1RPT19NQU5ZX1NUQVRJT05TKCkgKTtcclxuXHJcbiAgICAgICAgbGV0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICAgICAgbGV0IGxlbmd0aCA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIGxldCB0cmllcyAgPSAwO1xyXG5cclxuICAgICAgICB3aGlsZSAocmVzdWx0Lmxlbmd0aCA8IGxlbmd0aClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgLy8gR2l2ZSB1cCB0cnlpbmcgdG8gYXZvaWQgZHVwbGljYXRlcywgaWYgd2UgdHJ5IG1vcmUgdGltZXMgdGhhbiB0aGVyZSBhcmVcclxuICAgICAgICAgICAgLy8gc3RhdGlvbnMgYXZhaWxhYmxlLiBJbmFjY3VyYXRlLCBidXQgZ29vZCBlbm91Z2guXHJcbiAgICAgICAgICAgIGlmICh0cmllcysrID49IHRoaXMuc3RhdGlvbnNDb3VudClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBnaXZlbiBhbiBleGNsdXNpb24gbGlzdCwgY2hlY2sgYWdhaW5zdCBib3RoIHRoYXQgYW5kIHJlc3VsdHNcclxuICAgICAgICAgICAgZWxzZSBpZiAoIGV4Y2x1ZGUgJiYgIWV4Y2x1ZGUuaW5jbHVkZXMoa2V5KSAmJiAhcmVzdWx0LmluY2x1ZGVzKGtleSkgKVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIG5vdCwganVzdCBjaGVjayB3aGF0IHJlc3VsdHMgd2UndmUgYWxyZWFkeSBmb3VuZFxyXG4gICAgICAgICAgICBlbHNlIGlmICggIWV4Y2x1ZGUgJiYgIXJlc3VsdC5pbmNsdWRlcyhrZXkpIClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFpbiBjbGFzcyBvZiB0aGUgZW50aXJlIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IgYXBwbGljYXRpb24gKi9cclxuY2xhc3MgUkFHXHJcbntcclxuICAgIC8qKiBHZXRzIHRoZSBjb25maWd1cmF0aW9uIGNvbnRhaW5lciAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb25maWcgICA6IENvbmZpZztcclxuICAgIC8qKiBHZXRzIHRoZSBkYXRhYmFzZSBtYW5hZ2VyLCB3aGljaCBob2xkcyBwaHJhc2UsIHN0YXRpb24gYW5kIHRyYWluIGRhdGEgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZGF0YWJhc2UgOiBEYXRhYmFzZTtcclxuICAgIC8qKiBHZXRzIHRoZSBwaHJhc2UgbWFuYWdlciwgd2hpY2ggZ2VuZXJhdGVzIEhUTUwgcGhyYXNlcyBmcm9tIFhNTCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VyICA6IFBocmFzZXI7XHJcbiAgICAvKiogR2V0cyB0aGUgc3BlZWNoIGVuZ2luZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzcGVlY2ggICA6IFNwZWVjaDtcclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHRyYWluIGFuZCBzdGF0aW9uIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRlICAgIDogU3RhdGU7XHJcbiAgICAvKiogR2V0cyB0aGUgdmlldyBjb250cm9sbGVyLCB3aGljaCBtYW5hZ2VzIFVJIGludGVyYWN0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZpZXdzICAgIDogVmlld3M7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFbnRyeSBwb2ludCBmb3IgUkFHLCB0byBiZSBjYWxsZWQgZnJvbSBKYXZhc2NyaXB0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBkYXRhUmVmcyBDb25maWd1cmF0aW9uIG9iamVjdCwgd2l0aCByYWlsIGRhdGEgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbWFpbihkYXRhUmVmczogRGF0YVJlZnMpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5vbmVycm9yICAgICAgICAgICAgICA9IGVycm9yID0+IFJBRy5wYW5pYyhlcnJvcik7XHJcbiAgICAgICAgd2luZG93Lm9udW5oYW5kbGVkcmVqZWN0aW9uID0gZXJyb3IgPT4gUkFHLnBhbmljKGVycm9yKTtcclxuXHJcbiAgICAgICAgSTE4bi5pbml0KCk7XHJcblxyXG4gICAgICAgIFJBRy5jb25maWcgICA9IG5ldyBDb25maWcodHJ1ZSk7XHJcbiAgICAgICAgUkFHLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlKGRhdGFSZWZzKTtcclxuICAgICAgICBSQUcudmlld3MgICAgPSBuZXcgVmlld3MoKTtcclxuICAgICAgICBSQUcucGhyYXNlciAgPSBuZXcgUGhyYXNlcigpO1xyXG4gICAgICAgIFJBRy5zcGVlY2ggICA9IG5ldyBTcGVlY2goKTtcclxuXHJcbiAgICAgICAgLy8gQmVnaW5cclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLldFTENPTUUoKSApO1xyXG4gICAgICAgIFJBRy5nZW5lcmF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZW5lcmF0ZXMgYSBuZXcgcmFuZG9tIHBocmFzZSBhbmQgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZ2VuZXJhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUgPSBuZXcgU3RhdGUoKTtcclxuICAgICAgICBSQUcuc3RhdGUuZ2VuRGVmYXVsdFN0YXRlKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5nZW5lcmF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBMb2FkcyBzdGF0ZSBmcm9tIGdpdmVuIEpTT04gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbG9hZChqc29uOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZSA9IE9iamVjdC5hc3NpZ24oIG5ldyBTdGF0ZSgpLCBKU09OLnBhcnNlKGpzb24pICkgYXMgU3RhdGU7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5nZW5lcmF0ZSgpO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9GUk9NX1NUT1JBR0UoKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHbG9iYWwgZXJyb3IgaGFuZGxlcjsgdGhyb3dzIHVwIGEgYmlnIHJlZCBwYW5pYyBzY3JlZW4gb24gdW5jYXVnaHQgZXJyb3IgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHBhbmljKGVycm9yOiBzdHJpbmcgfCBFdmVudCA9IFwiVW5rbm93biBlcnJvclwiKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBtc2cgPSAnPGRpdiBpZD1cInBhbmljU2NyZWVuXCIgY2xhc3M9XCJ3YXJuaW5nU2NyZWVuXCI+JztcclxuICAgICAgICBtc2cgICAgKz0gJzxoMT5cIldlIGFyZSBzb3JyeSB0byBhbm5vdW5jZSB0aGF0Li4uXCI8L2gxPic7XHJcbiAgICAgICAgbXNnICAgICs9IGA8cD5SQUcgaGFzIGNyYXNoZWQgYmVjYXVzZTogPGNvZGU+JHtlcnJvcn08L2NvZGU+PC9wPmA7XHJcbiAgICAgICAgbXNnICAgICs9IGA8cD5QbGVhc2Ugb3BlbiB0aGUgY29uc29sZSBmb3IgbW9yZSBpbmZvcm1hdGlvbi48L3A+YDtcclxuICAgICAgICBtc2cgICAgKz0gJzwvZGl2Pic7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuaW5uZXJIVE1MID0gbXNnO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogRGlzcG9zYWJsZSBjbGFzcyB0aGF0IGhvbGRzIHN0YXRlIGZvciB0aGUgY3VycmVudCBzY2hlZHVsZSwgdHJhaW4sIGV0Yy4gKi9cclxuY2xhc3MgU3RhdGVcclxue1xyXG4gICAgLyoqIFN0YXRlIG9mIGNvbGxhcHNpYmxlIGVsZW1lbnRzLiBLZXkgaXMgcmVmZXJlbmNlIElELCB2YWx1ZSBpcyBjb2xsYXBzZWQuICovXHJcbiAgICBwcml2YXRlIF9jb2xsYXBzaWJsZXMgOiBEaWN0aW9uYXJ5PGJvb2xlYW4+ICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgY29hY2ggbGV0dGVyIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBsZXR0ZXIuICovXHJcbiAgICBwcml2YXRlIF9jb2FjaGVzICAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgaW50ZWdlciBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgaW50ZWdlci4gKi9cclxuICAgIHByaXZhdGUgX2ludGVnZXJzICAgICA6IERpY3Rpb25hcnk8bnVtYmVyPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBwaHJhc2VzZXQgcGhyYXNlIGNob2ljZXMuIEtleSBpcyByZWZlcmVuY2UgSUQsIHZhbHVlIGlzIGluZGV4LiAqL1xyXG4gICAgcHJpdmF0ZSBfcGhyYXNlc2V0cyAgIDogRGljdGlvbmFyeTxudW1iZXI+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHNlcnZpY2UgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIHNlcnZpY2UuICovXHJcbiAgICBwcml2YXRlIF9zZXJ2aWNlcyAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc3RhdGlvbiBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgc3RhdGlvbiBjb2RlLiAqL1xyXG4gICAgcHJpdmF0ZSBfc3RhdGlvbnMgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHN0YXRpb24gbGlzdCBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgYXJyYXkgb2YgY29kZXMuICovXHJcbiAgICBwcml2YXRlIF9zdGF0aW9uTGlzdHMgOiBEaWN0aW9uYXJ5PHN0cmluZ1tdPiA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgdGltZSBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgdGltZS4gKi9cclxuICAgIHByaXZhdGUgX3RpbWVzICAgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcblxyXG4gICAgLyoqIEN1cnJlbnRseSBjaG9zZW4gZXhjdXNlICovXHJcbiAgICBwcml2YXRlIF9leGN1c2U/ICAgOiBzdHJpbmc7XHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBwbGF0Zm9ybSAqL1xyXG4gICAgcHJpdmF0ZSBfcGxhdGZvcm0/IDogUGxhdGZvcm07XHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHJpdmF0ZSBfbmFtZWQ/ICAgIDogc3RyaW5nO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBjb2FjaCBsZXR0ZXIsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSBmcm9tIEEgdG8gWi5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIGxldHRlciBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldENvYWNoKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fY29hY2hlc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29hY2hlc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29hY2hlc1tjb250ZXh0XSA9IFJhbmRvbS5hcnJheShMLkxFVFRFUlMpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9jb2FjaGVzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGNvYWNoIGxldHRlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgbGV0dGVyIGZvclxyXG4gICAgICogQHBhcmFtIGNvYWNoIFZhbHVlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0Q29hY2goY29udGV4dDogc3RyaW5nLCBjb2FjaDogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9jb2FjaGVzW2NvbnRleHRdID0gY29hY2g7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gZ2V0IHRoZSBjb2xsYXBzaWJsZSBzdGF0ZSBvZlxyXG4gICAgICogQHBhcmFtIGNoYW5jZSBDaGFuY2UgYmV0d2VlbiAwIGFuZCAxMDAgb2YgY2hvb3NpbmcgdHJ1ZSwgaWYgdW5zZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldENvbGxhcHNlZChyZWY6IHN0cmluZywgY2hhbmNlOiBudW1iZXIpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29sbGFwc2libGVzW3JlZl07XHJcblxyXG4gICAgICAgIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdID0gIVJhbmRvbS5ib29sKGNoYW5jZSk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGNvbGxhcHNpYmxlJ3Mgc3RhdGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gc2V0IHRoZSBjb2xsYXBzaWJsZSBzdGF0ZSBvZlxyXG4gICAgICogQHBhcmFtIHN0YXRlIFZhbHVlIHRvIHNldCwgd2hlcmUgdHJ1ZSBpcyBcImNvbGxhcHNlZFwiXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRDb2xsYXBzZWQocmVmOiBzdHJpbmcsIHN0YXRlOiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXSA9IHN0YXRlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBpbnRlZ2VyLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBpbnRlZ2VyIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0SW50ZWdlcihjb250ZXh0OiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2ludGVnZXJzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgbGV0IG1pbiA9IDAsIG1heCA9IDA7XHJcblxyXG4gICAgICAgIHN3aXRjaChjb250ZXh0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2FzZSBcImNvYWNoZXNcIjogICAgICAgbWluID0gMTsgbWF4ID0gMTA7IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZGVsYXllZFwiOiAgICAgICBtaW4gPSA1OyBtYXggPSA2MDsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJmcm9udF9jb2FjaGVzXCI6IG1pbiA9IDI7IG1heCA9IDU7ICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInJlYXJfY29hY2hlc1wiOiAgbWluID0gMjsgbWF4ID0gNTsgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5faW50ZWdlcnNbY29udGV4dF0gPSBSYW5kb20uaW50KG1pbiwgbWF4KTtcclxuICAgICAgICByZXR1cm4gdGhpcy5faW50ZWdlcnNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGFuIGludGVnZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIGludGVnZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRJbnRlZ2VyKGNvbnRleHQ6IHN0cmluZywgdmFsdWU6IG51bWJlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5faW50ZWdlcnNbY29udGV4dF0gPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gcGhyYXNlIG9mIGEgcGhyYXNlc2V0LCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgcGhyYXNlc2V0J3MgcGhyYXNlIG9mXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2VzZXRJZHgocmVmOiBzdHJpbmcpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3BocmFzZXNldHNbcmVmXSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGhyYXNlc2V0c1tyZWZdO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBpcyB0aGlzIHNhZmUgYWNyb3NzIHBocmFzZXNldCBjaGFuZ2VzP1xyXG4gICAgICAgIC8vIFRPRE86IGludHJvZHVjZSBhbiBhc3NlcnRzIHV0aWwsIGFuZCBzdGFydCB1c2luZyB0aGVtIGFsbCBvdmVyXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlNUQVRFX05PTkVYSVNUQU5UX1BIUkFTRVNFVChyZWYpICk7XHJcblxyXG4gICAgICAgIHRoaXMuX3BocmFzZXNldHNbcmVmXSA9IFJhbmRvbS5pbnQoMCwgcGhyYXNlc2V0LmNoaWxkcmVuLmxlbmd0aCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BocmFzZXNldHNbcmVmXTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGNob3NlbiBpbmRleCBmb3IgYSBwaHJhc2VzZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gc2V0IHRoZSBwaHJhc2VzZXQgaW5kZXggb2ZcclxuICAgICAqIEBwYXJhbSBpZHggSW5kZXggdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRQaHJhc2VzZXRJZHgocmVmOiBzdHJpbmcsIGlkeDogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9waHJhc2VzZXRzW3JlZl0gPSBpZHg7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHNlcnZpY2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHNlcnZpY2UgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc2VydmljZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU2VydmljZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzZXJ2aWNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBzZXJ2aWNlIGZvclxyXG4gICAgICogQHBhcmFtIHNlcnZpY2UgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTZXJ2aWNlKGNvbnRleHQ6IHN0cmluZywgc2VydmljZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSA9IHNlcnZpY2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHN0YXRpb24gY29kZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zdGF0aW9uc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbnNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZSgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBzdGF0aW9uIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBmb3JcclxuICAgICAqIEBwYXJhbSBjb2RlIFN0YXRpb24gY29kZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFN0YXRpb24oY29udGV4dDogc3RyaW5nLCBjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdID0gY29kZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gbGlzdCBvZiBzdGF0aW9uIGNvZGVzLCBvciByYW5kb21seSBnZW5lcmF0ZXMgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc3RhdGlvbiBsaXN0IGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbkxpc3QoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1tdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdO1xyXG4gICAgICAgIGVsc2UgaWYgKGNvbnRleHQgPT09ICdjYWxsaW5nX2ZpcnN0JylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U3RhdGlvbkxpc3QoJ2NhbGxpbmcnKTtcclxuXHJcbiAgICAgICAgbGV0IG1pbiA9IDEsIG1heCA9IDE2O1xyXG5cclxuICAgICAgICBzd2l0Y2goY29udGV4dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NhbGxpbmdfc3BsaXQnOiBtaW4gPSAyOyBtYXggPSAxNjsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NoYW5nZXMnOiAgICAgICBtaW4gPSAxOyBtYXggPSA0OyAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ25vdF9zdG9wcGluZyc6ICBtaW4gPSAxOyBtYXggPSA4OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcyhtaW4sIG1heCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSBsaXN0IG9mIHN0YXRpb24gY29kZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHN0YXRpb24gY29kZSBsaXN0IGZvclxyXG4gICAgICogQHBhcmFtIGNvZGVzIFN0YXRpb24gY29kZXMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRTdGF0aW9uTGlzdChjb250ZXh0OiBzdHJpbmcsIGNvZGVzOiBzdHJpbmdbXSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdID0gY29kZXM7XHJcblxyXG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnY2FsbGluZ19maXJzdCcpXHJcbiAgICAgICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1snY2FsbGluZyddID0gY29kZXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIHRpbWVcclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIHRpbWUgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRUaW1lKGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fdGltZXNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3RpbWVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IFN0cmluZ3MuZnJvbVRpbWUoIFJhbmRvbS5pbnQoMCwgMjMpLCBSYW5kb20uaW50KDAsIDU5KSApO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl90aW1lc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYSB0aW1lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSB0aW1lIGZvclxyXG4gICAgICogQHBhcmFtIHRpbWUgVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRUaW1lKGNvbnRleHQ6IHN0cmluZywgdGltZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl90aW1lc1tjb250ZXh0XSA9IHRpbWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBleGN1c2UsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZSAqL1xyXG4gICAgcHVibGljIGdldCBleGN1c2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9leGN1c2UpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9leGN1c2U7XHJcblxyXG4gICAgICAgIHRoaXMuX2V4Y3VzZSA9IFJBRy5kYXRhYmFzZS5waWNrRXhjdXNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2V4Y3VzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBleGN1c2UgKi9cclxuICAgIHB1YmxpYyBzZXQgZXhjdXNlKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fZXhjdXNlID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBwbGF0Zm9ybSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IHBsYXRmb3JtKCkgOiBQbGF0Zm9ybVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9wbGF0Zm9ybSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXRmb3JtO1xyXG5cclxuICAgICAgICBsZXQgcGxhdGZvcm0gOiBQbGF0Zm9ybSA9IFsnJywgJyddO1xyXG5cclxuICAgICAgICAvLyBPbmx5IDIlIGNoYW5jZSBmb3IgcGxhdGZvcm0gMCwgc2luY2UgaXQncyByYXJlXHJcbiAgICAgICAgcGxhdGZvcm1bMF0gPSBSYW5kb20uYm9vbCg5OClcclxuICAgICAgICAgICAgPyBSYW5kb20uaW50KDEsIDI2KS50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogJzAnO1xyXG5cclxuICAgICAgICAvLyBNYWdpYyB2YWx1ZXNcclxuICAgICAgICBpZiAocGxhdGZvcm1bMF0gPT09ICc5JylcclxuICAgICAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgyNSkgPyAnwr4nIDogJyc7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMTAlIGNoYW5jZSBmb3IgcGxhdGZvcm0gbGV0dGVyLCBzaW5jZSBpdCdzIHVuY29tbW9uXHJcbiAgICAgICAgaWYgKHBsYXRmb3JtWzFdID09PSAnJylcclxuICAgICAgICAgICAgcGxhdGZvcm1bMV0gPSBSYW5kb20uYm9vbCgxMClcclxuICAgICAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCdBQkMnKVxyXG4gICAgICAgICAgICAgICAgOiAnJztcclxuXHJcbiAgICAgICAgdGhpcy5fcGxhdGZvcm0gPSBwbGF0Zm9ybTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzZXQgcGxhdGZvcm0odmFsdWU6IFBsYXRmb3JtKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BsYXRmb3JtID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGNob3NlbiBuYW1lZCB0cmFpbiwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IG5hbWVkKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fbmFtZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9uYW1lZDtcclxuXHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSBSQUcuZGF0YWJhc2UucGlja05hbWVkKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgc2V0IG5hbWVkKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fbmFtZWQgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgdGhlIHN0YXRlIGluIGEgcGFydGljdWxhciB3YXksIHNvIHRoYXQgaXQgbWFrZXMgc29tZSByZWFsLXdvcmxkIHNlbnNlLlxyXG4gICAgICogVG8gZG8gc28sIHdlIGhhdmUgdG8gZ2VuZXJhdGUgZGF0YSBpbiBhIHBhcnRpY3VsYXIgb3JkZXIsIGFuZCBtYWtlIHN1cmUgdG8gYXZvaWRcclxuICAgICAqIGR1cGxpY2F0ZXMgaW4gaW5hcHByb3ByaWF0ZSBwbGFjZXMgYW5kIGNvbnRleHRzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2VuRGVmYXVsdFN0YXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RlcCAxLiBQcmVwb3B1bGF0ZSBzdGF0aW9uIGxpc3RzXHJcblxyXG4gICAgICAgIGxldCBzbENhbGxpbmcgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDE2KTtcclxuICAgICAgICBsZXQgc2xDYWxsU3BsaXQgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygyLCAxNiwgc2xDYWxsaW5nKTtcclxuICAgICAgICBsZXQgYWxsQ2FsbGluZyAgPSBbLi4uc2xDYWxsaW5nLCAuLi5zbENhbGxTcGxpdF07XHJcblxyXG4gICAgICAgIC8vIExpc3Qgb2Ygb3RoZXIgc3RhdGlvbnMgZm91bmQgdmlhIGEgc3BlY2lmaWMgY2FsbGluZyBwb2ludFxyXG4gICAgICAgIGxldCBzbENoYW5nZXMgICAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgNCwgYWxsQ2FsbGluZyk7XHJcbiAgICAgICAgLy8gTGlzdCBvZiBvdGhlciBzdGF0aW9ucyB0aGF0IHRoaXMgdHJhaW4gdXN1YWxseSBzZXJ2ZXMsIGJ1dCBjdXJyZW50bHkgaXNuJ3RcclxuICAgICAgICBsZXQgc2xOb3RTdG9wcGluZyA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDEsIDgsXHJcbiAgICAgICAgICAgIFsuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXNdXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gVGFrZSBhIHJhbmRvbSBzbGljZSBmcm9tIHRoZSBjYWxsaW5nIGxpc3QsIHRvIGlkZW50aWZ5IGFzIHJlcXVlc3Qgc3RvcHNcclxuICAgICAgICBsZXQgcmVxQ291bnQgICA9IFJhbmRvbS5pbnQoMSwgc2xDYWxsaW5nLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgIGxldCBzbFJlcXVlc3RzID0gc2xDYWxsaW5nLnNsaWNlKDAsIHJlcUNvdW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZycsICAgICAgIHNsQ2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgnY2FsbGluZ19zcGxpdCcsIHNsQ2FsbFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjaGFuZ2VzJywgICAgICAgc2xDaGFuZ2VzKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdub3Rfc3RvcHBpbmcnLCAgc2xOb3RTdG9wcGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uTGlzdCgncmVxdWVzdCcsICAgICAgIHNsUmVxdWVzdHMpO1xyXG5cclxuICAgICAgICAvLyBTdGVwIDIuIFByZXBvcHVsYXRlIHN0YXRpb25zXHJcblxyXG4gICAgICAgIC8vIEFueSBzdGF0aW9uIG1heSBiZSBibGFtZWQgZm9yIGFuIGV4Y3VzZSwgZXZlbiBvbmVzIGFscmVhZHkgcGlja2VkXHJcbiAgICAgICAgbGV0IHN0RXhjdXNlICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoKTtcclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiBpcyBmaW5hbCBjYWxsIG9mIHRoZSBjYWxsaW5nIGxpc3RcclxuICAgICAgICBsZXQgc3REZXN0ICAgID0gc2xDYWxsaW5nW3NsQ2FsbGluZy5sZW5ndGggLSAxXTtcclxuICAgICAgICAvLyBWaWEgaXMgYSBjYWxsIGJlZm9yZSB0aGUgZGVzdGluYXRpb24sIG9yIG9uZSBpbiB0aGUgc3BsaXQgbGlzdCBpZiB0b28gc21hbGxcclxuICAgICAgICBsZXQgc3RWaWEgICAgID0gc2xDYWxsaW5nLmxlbmd0aCA+IDFcclxuICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoIHNsQ2FsbGluZy5zbGljZSgwLCAtMSkgICApXHJcbiAgICAgICAgICAgIDogUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuICAgICAgICAvLyBEaXR0byBmb3IgcGlja2luZyBhIHJhbmRvbSBjYWxsaW5nIHN0YXRpb24gYXMgYSBzaW5nbGUgcmVxdWVzdCBvciBjaGFuZ2Ugc3RvcFxyXG4gICAgICAgIGxldCBzdENhbGxpbmcgPSBzbENhbGxpbmcubGVuZ3RoID4gMVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSggc2xDYWxsaW5nLnNsaWNlKDAsIC0xKSAgIClcclxuICAgICAgICAgICAgOiBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG5cclxuICAgICAgICAvLyBEZXN0aW5hdGlvbiAobGFzdCBjYWxsKSBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdERlc3RTcGxpdCA9IHNsQ2FsbFNwbGl0W3NsQ2FsbFNwbGl0Lmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIC8vIFJhbmRvbSBub24tZGVzdGluYXRpb24gc3RvcCBvZiB0aGUgc3BsaXQgdHJhaW4ncyBzZWNvbmQgaGFsZiBvZiB0aGUgbGlzdFxyXG4gICAgICAgIGxldCBzdFZpYVNwbGl0ICA9IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcbiAgICAgICAgLy8gV2hlcmUgdGhlIHRyYWluIGNvbWVzIGZyb20sIHNvIGNhbid0IGJlIG9uIGFueSBsaXN0cyBvciBwcmlvciBzdGF0aW9uc1xyXG4gICAgICAgIGxldCBzdFNvdXJjZSAgICA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGUoW1xyXG4gICAgICAgICAgICAuLi5hbGxDYWxsaW5nLCAuLi5zbENoYW5nZXMsIC4uLnNsTm90U3RvcHBpbmcsIC4uLnNsUmVxdWVzdHMsXHJcbiAgICAgICAgICAgIHN0Q2FsbGluZywgc3REZXN0LCBzdFZpYSwgc3REZXN0U3BsaXQsIHN0VmlhU3BsaXRcclxuICAgICAgICBdKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdjYWxsaW5nJywgICAgICAgICAgIHN0Q2FsbGluZyk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbicsICAgICAgIHN0RGVzdCk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdkZXN0aW5hdGlvbl9zcGxpdCcsIHN0RGVzdFNwbGl0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2V4Y3VzZScsICAgICAgICAgICAgc3RFeGN1c2UpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignc291cmNlJywgICAgICAgICAgICBzdFNvdXJjZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCd2aWEnLCAgICAgICAgICAgICAgIHN0VmlhKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3ZpYV9zcGxpdCcsICAgICAgICAgc3RWaWFTcGxpdCk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgMy4gUHJlcG9wdWxhdGUgY29hY2ggbnVtYmVyc1xyXG5cclxuICAgICAgICBsZXQgaW50Q29hY2hlcyA9IHRoaXMuZ2V0SW50ZWdlcignY29hY2hlcycpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgZW5vdWdoIGNvYWNoZXMsIGp1c3Qgc3BsaXQgdGhlIG51bWJlciBkb3duIHRoZSBtaWRkbGUgaW5zdGVhZC5cclxuICAgICAgICAvLyBFbHNlLCBmcm9udCBhbmQgcmVhciBjb2FjaGVzIHdpbGwgYmUgcmFuZG9tbHkgcGlja2VkICh3aXRob3V0IG1ha2luZyBzZW5zZSlcclxuICAgICAgICBpZiAoaW50Q29hY2hlcyA+PSA0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGludEZyb250Q29hY2hlcyA9IChpbnRDb2FjaGVzIC8gMikgfCAwO1xyXG4gICAgICAgICAgICBsZXQgaW50UmVhckNvYWNoZXMgID0gaW50Q29hY2hlcyAtIGludEZyb250Q29hY2hlcztcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcignZnJvbnRfY29hY2hlcycsIGludEZyb250Q29hY2hlcyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW50ZWdlcigncmVhcl9jb2FjaGVzJywgaW50UmVhckNvYWNoZXMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgYXJlIGVub3VnaCBjb2FjaGVzLCBhc3NpZ24gY29hY2ggbGV0dGVycyBmb3IgY29udGV4dHMuXHJcbiAgICAgICAgLy8gRWxzZSwgbGV0dGVycyB3aWxsIGJlIHJhbmRvbWx5IHBpY2tlZCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpXHJcbiAgICAgICAgaWYgKGludENvYWNoZXMgPj0gNClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsZXR0ZXJzID0gTC5MRVRURVJTLnNsaWNlKDAsIGludENvYWNoZXMpLnNwbGl0KCcnKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdmaXJzdCcsICAgICBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3Nob3AnLCAgICAgIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc3RhbmRhcmQxJywgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzdGFuZGFyZDInLCBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNC4gUHJlcG9wdWxhdGUgc2VydmljZXNcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBzZXJ2aWNlLCBwaWNrIG9uZSB0byBiZSB0aGUgXCJtYWluXCIgYW5kIG9uZSB0byBiZSB0aGVcclxuICAgICAgICAvLyBcImFsdGVybmF0ZVwiLCBlbHNlIHRoZSBvbmUgc2VydmljZSB3aWxsIGJlIHVzZWQgZm9yIGJvdGggKHdpdGhvdXQgbWFraW5nIHNlbnNlKS5cclxuICAgICAgICBpZiAoUkFHLmRhdGFiYXNlLnNlcnZpY2VzLmxlbmd0aCA+IDEpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgc2VydmljZXMgPSBSQUcuZGF0YWJhc2Uuc2VydmljZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VydmljZSggJ3Byb3ZpZGVyJywgICAgUmFuZG9tLmFycmF5U3BsaWNlKHNlcnZpY2VzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldFNlcnZpY2UoICdhbHRlcm5hdGl2ZScsIFJhbmRvbS5hcnJheVNwbGljZShzZXJ2aWNlcykgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgNS4gUHJlcG9wdWxhdGUgdGltZXNcclxuICAgICAgICAvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTIxNDc1M1xyXG5cclxuICAgICAgICAvLyBUaGUgYWx0ZXJuYXRpdmUgdGltZSBpcyBmb3IgYSB0cmFpbiB0aGF0J3MgbGF0ZXIgdGhhbiB0aGUgbWFpbiB0cmFpblxyXG4gICAgICAgIGxldCB0aW1lICAgID0gbmV3IERhdGUoIG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgUmFuZG9tLmludCgwLCA1OSkgKiA2MDAwMCk7XHJcbiAgICAgICAgbGV0IHRpbWVBbHQgPSBuZXcgRGF0ZSggdGltZS5nZXRUaW1lKCkgICAgICAgKyBSYW5kb20uaW50KDAsIDMwKSAqIDYwMDAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnbWFpbicsICAgICAgICBTdHJpbmdzLmZyb21UaW1lKHRpbWUpICAgICk7XHJcbiAgICAgICAgdGhpcy5zZXRUaW1lKCAnYWx0ZXJuYXRpdmUnLCBTdHJpbmdzLmZyb21UaW1lKHRpbWVBbHQpICk7XHJcbiAgICB9XHJcbn0iXX0=