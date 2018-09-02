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
        /** If user has read the disclaimer */
        this.readDisclaimer = false;
        /** Volume for speech to be set at */
        this.speechVol = 1.0;
        /** Pitch for speech to be set at */
        this.speechPitch = 1.0;
        /** Rate for speech to be set at */
        this.speechRate = 1.0;
        /** VOX key of the chime to use prior to speaking */
        this.voxChime = '';
        /** Relative or absolute URL of the custom VOX voice to use */
        this.voxCustomPath = '';
        /** Whether to use the VOX engine */
        this.voxEnabled = true;
        /** Relative or absolute URL of the VOX voice to use */
        this.voxPath = 'https://roycurtis.github.io/RAG-VOX-Roy';
        /** Choice of speech voice to use as voice name, or '' if unset */
        this._speechVoice = '';
        /** Impulse response to use for VOX's reverb */
        this._voxReverb = 'ir.stalbans.wav';
        if (autoLoad)
            this.load();
    }
    /**
     * Choice of speech voice to use, as a voice name. Because of the async nature of
     * getVoices, the default value will be fetched from it each time.
     */
    get speechVoice() {
        // If there's a user-defined value, use that
        if (this._speechVoice !== '')
            return this._speechVoice;
        // Select English voices by default
        let voices = RAG.speech.browserVoices;
        for (let name in voices)
            if (voices[name].lang === 'en-GB' || voices[name].lang === 'en-US')
                return name;
        // Else, first voice on the list
        return Object.keys(voices)[0];
    }
    /** Sets the choice of speech to use, as voice name */
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Synthesizes speech by dynamically loading and piecing together voice files */
class VoxEngine {
    constructor(dataPath = 'data/vox') {
        // Setup the core audio context
        /** Cache of impulse responses audio data, for reverb */
        this.impulses = {};
        /** Whether this engine is currently running and speaking */
        this.isSpeaking = false;
        /** Whether this engine has begun speaking for a current speech */
        this.begunSpeaking = false;
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
        this.begunSpeaking = false;
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
        // Fire on-first-speak event
        if (!this.begunSpeaking) {
            this.begunSpeaking = true;
            if (this.onspeak)
                this.onspeak();
        }
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
        this.abort = new AbortController();
        // https://developers.google.com/web/updates/2017/09/abortable-fetch
        fetch(path, { signal: this.abort.signal })
            .then(this.onFulfill.bind(this))
            .catch(this.onError.bind(this));
        // Timeout all fetches by 10 seconds
        setTimeout(_ => this.abort.abort(), 10 * 1000);
    }
    /** Cancels this request from proceeding any further */
    cancel() {
        this.abort.abort();
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
/** Controller for the disclaimer screen */
class Disclaimer extends ViewBase {
    constructor() {
        super('#disclaimerScreen');
        /** Reference to the "continue" button */
        this.btnDismiss = this.attach('#btnDismiss');
    }
    /** Opens the disclaimer for first time users */
    disclaim() {
        if (RAG.config.readDisclaimer)
            return;
        this.lastActive = document.activeElement;
        RAG.views.main.hidden = true;
        this.dom.hidden = false;
        this.btnDismiss.onclick = this.onDismiss.bind(this);
        this.btnDismiss.focus();
    }
    /** Persists the dismissal to storage and restores the main screen */
    onDismiss() {
        RAG.config.readDisclaimer = true;
        this.dom.hidden = true;
        RAG.views.main.hidden = false;
        this.btnDismiss.onclick = null;
        RAG.config.save();
        if (this.lastActive) {
            this.lastActive.focus();
            this.lastActive = undefined;
        }
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
        this.selSpeechVoice.value = RAG.config.speechVoice;
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
        DOM.toggleHiddenAll([this.selSpeechVoice, !voxEnabled], [this.rangeSpeechPitch, !voxEnabled], [this.selVoxVoice, voxEnabled], [this.inputVoxPath, voxEnabled && voxCustom], [this.selVoxReverb, voxEnabled], [this.selVoxChime, voxEnabled]);
    }
    /** Clears and populates the voice list */
    populateVoiceList() {
        this.selSpeechVoice.innerHTML = '';
        let voices = RAG.speech.browserVoices;
        // Handle empty list
        if (voices === {}) {
            let option = DOM.addOption(this.selSpeechVoice, L.ST_SPEECH_EMPTY());
            option.disabled = true;
        }
        // https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
        else
            for (let name in voices)
                DOM.addOption(this.selSpeechVoice, `${name} (${voices[name].lang})`, name);
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
        RAG.config.speechVoice = this.selSpeechVoice.value;
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
                voiceName: this.selSpeechVoice.value,
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
        this.btnPlay.onclick = this.handlePlay.bind(this);
        this.btnStop.onclick = this.handleStop.bind(this);
        this.btnGenerate.onclick = this.handleGenerate.bind(this);
        this.btnSave.onclick = this.handleSave.bind(this);
        this.btnRecall.onclick = this.handleLoad.bind(this);
        this.btnOption.onclick = this.handleOption.bind(this);
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
        RAG.speech.stop();
        this.btnPlay.disabled = true;
        // Has to execute on a delay, otherwise native speech cancel becomes unreliable
        window.setTimeout(this.handlePlay2.bind(this), 200);
    }
    /** Continuation of handlePlay, executed after a delay */
    handlePlay2() {
        let hasSpoken = false;
        let speechText = RAG.views.editor.getText();
        this.btnPlay.hidden = true;
        this.btnPlay.disabled = false;
        this.btnStop.hidden = false;
        // TODO: Localize
        RAG.views.marquee.set('Loading VOX...', false);
        // If speech takes too long (10 seconds) to load, cancel it
        let timeout = window.setTimeout(() => {
            clearTimeout(timeout);
            RAG.speech.stop();
        }, 10 * 1000);
        RAG.speech.onspeak = () => {
            clearTimeout(timeout);
            RAG.views.marquee.set(speechText);
            hasSpoken = true;
            RAG.speech.onspeak = undefined;
        };
        RAG.speech.onstop = () => {
            clearTimeout(timeout);
            this.handleStop();
            // Check if anything was actually spoken. If not, something went wrong.
            if (!hasSpoken && RAG.config.voxEnabled) {
                RAG.config.voxEnabled = false;
                // TODO: Localize
                alert('It appears that the VOX engine was unable to say anything.' +
                    ' Either the current voice path is unreachable, or the engine' +
                    ' crashed. Please check the console. The VOX engine has been' +
                    ' disabled and native text-to-speech will be used on next play.');
            }
            else if (!hasSpoken)
                alert('It appears that the browser was unable to say anything.' +
                    ' Either the current voice failed to load, or this browser does' +
                    ' not support support text-to-speech. Please check the console.');
            // Since the marquee would have been stuck on "Loading...", scroll it
            if (!hasSpoken)
                RAG.views.marquee.set(speechText);
        };
        RAG.speech.speak(RAG.views.editor.getPhrase());
        this.btnStop.focus();
    }
    /** Handles the stop button, stopping the marquee and any speech */
    handleStop(ev) {
        RAG.speech.onspeak = undefined;
        RAG.speech.onstop = undefined;
        this.btnPlay.hidden = false;
        // Only focus play button if user didn't move focus elsewhere. Prevents
        // annoying surprise of focus suddenly shifting away.
        if (document.activeElement === this.btnStop)
            this.btnPlay.focus();
        this.btnStop.hidden = true;
        RAG.speech.stop();
        // If event exists, this stop was called by the user
        if (ev)
            RAG.views.marquee.set(RAG.views.editor.getText(), false);
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
        this.disclaimer = new Disclaimer();
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
        RAG.views.disclaimer.disclaim();
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
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Manages speech synthesis using both native and custom engines */
class Speech {
    constructor() {
        /** Dictionary of browser-provided voices available */
        this.browserVoices = {};
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
        // For some reason, Chrome needs this called once for native speech to work
        window.speechSynthesis.cancel();
        try {
            this.voxEngine = new VoxEngine();
        }
        catch (err) {
            console.error('Could not create VOX engine:', err);
        }
    }
    /** Whether any speech engine is currently speaking */
    get isSpeaking() {
        if (this.voxEngine && this.voxEngine.isSpeaking)
            return true;
        else
            return window.speechSynthesis.speaking;
    }
    /** Whether the VOX engine is currently available */
    get voxAvailable() {
        return this.voxEngine !== undefined;
    }
    /** Begins speaking the given phrase components */
    speak(phrase, settings = {}) {
        this.stop();
        // VOX engine
        if (this.voxEngine && either(settings.useVox, RAG.config.voxEnabled))
            this.speakVox(phrase, settings);
        // Native browser text-to-speech
        else if (window.speechSynthesis)
            this.speakBrowser(phrase, settings);
        // No speech available; call stop event handler
        else if (this.onstop)
            this.onstop();
    }
    /** Stops and cancels all queued speech */
    stop() {
        if (!this.isSpeaking)
            return;
        if (window.speechSynthesis)
            window.speechSynthesis.cancel();
        if (this.voxEngine)
            this.voxEngine.stop();
        if (this.onstop)
            this.onstop();
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
        this.browserVoices = {};
        window.speechSynthesis.getVoices().forEach(v => this.browserVoices[v.name] = v);
    }
    /**
     * Converts the given phrase to text and speaks it via native browser voices.
     *
     * @param phrase Phrase elements to speak
     * @param settings Settings to use for the voice
     */
    speakBrowser(phrase, settings) {
        let voiceName = either(settings.voiceName, RAG.config.speechVoice);
        let voice = this.browserVoices[voiceName];
        // Reset to first voice, if configured choice is missing
        if (!voice) {
            let first = Object.keys(this.browserVoices)[0];
            voice = this.browserVoices[first];
        }
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
        // Fire immediately. I don't trust speech events to be reliable; see below.
        if (this.onspeak)
            this.onspeak();
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
        this.voxEngine.onspeak = () => {
            if (this.onspeak)
                this.onspeak();
        };
        this.voxEngine.onstop = () => {
            this.voxEngine.onspeak = undefined;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL2NvbGxhcHNlVG9nZ2xlLnRzIiwidWkvY29udHJvbHMvcGhyYXNlc2V0QnV0dG9uLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkNob29zZXIudHMiLCJ1aS9jb250cm9scy9zdGF0aW9uTGlzdEl0ZW0udHMiLCJ1aS9waWNrZXJzL3BpY2tlci50cyIsInVpL3BpY2tlcnMvY29hY2hQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2V4Y3VzZVBpY2tlci50cyIsInVpL3BpY2tlcnMvaW50ZWdlclBpY2tlci50cyIsInVpL3BpY2tlcnMvbmFtZWRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BocmFzZXNldFBpY2tlci50cyIsInVpL3BpY2tlcnMvcGxhdGZvcm1QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3NlcnZpY2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25MaXN0UGlja2VyLnRzIiwidWkvcGlja2Vycy90aW1lUGlja2VyLnRzIiwiY29uZmlnL2NvbmZpZ0Jhc2UudHMiLCJjb25maWcvY29uZmlnLnRzIiwibGFuZy9iYXNlTGFuZ3VhZ2UudHMiLCJsYW5nL2VuZ2xpc2hMYW5ndWFnZS50cyIsInBocmFzZXIvZWxlbWVudFByb2Nlc3NvcnMudHMiLCJwaHJhc2VyL3BocmFzZUNvbnRleHQudHMiLCJwaHJhc2VyL3BocmFzZXIudHMiLCJzcGVlY2gvcmVzb2x2ZXIudHMiLCJzcGVlY2gvc3BlZWNoU2V0dGluZ3MudHMiLCJzcGVlY2gvdm94RW5naW5lLnRzIiwic3BlZWNoL3ZveFJlcXVlc3QudHMiLCJ1aS92aWV3QmFzZS50cyIsInVpL2Rpc2NsYWltZXIudHMiLCJ1aS9lZGl0b3IudHMiLCJ1aS9tYXJxdWVlLnRzIiwidWkvc2V0dGluZ3MudHMiLCJ1aS90b29sYmFyLnRzIiwidWkvdmlld3MudHMiLCJ1dGlsL2NvbGxhcHNpYmxlcy50cyIsInV0aWwvY29uZGl0aW9uYWxzLnRzIiwidXRpbC9kb20udHMiLCJ1dGlsL2xpbmtkb3duLnRzIiwidXRpbC9wYXJzZS50cyIsInV0aWwvcmFuZG9tLnRzIiwidXRpbC9zb3VuZHMudHMiLCJ1dGlsL3N0cmluZ3MudHMiLCJ1dGlsL3R5cGVzLnRzIiwiZGF0YWJhc2UudHMiLCJyYWcudHMiLCJzdGF0ZS50cyIsInNwZWVjaC9zcGVlY2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEscUVBQXFFO0FBRXJFLDhEQUE4RDtBQUM5RCxJQUFJLENBQWtDLENBQUM7QUFFdkMsTUFBTSxJQUFJO0lBVU4sNEVBQTRFO0lBQ3JFLE1BQU0sQ0FBQyxJQUFJO1FBRWQsSUFBSSxJQUFJLENBQUMsU0FBUztZQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUVuRCxJQUFJLENBQUMsU0FBUyxHQUFHO1lBQ2IsSUFBSSxFQUFHLElBQUksZUFBZSxFQUFFO1NBQy9CLENBQUM7UUFFRiwyQkFBMkI7UUFDM0IsQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUU1QyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUVEOzs7O09BSUc7SUFDSyxNQUFNLENBQUMsVUFBVTtRQUVyQixJQUFJLElBQWtCLENBQUM7UUFDdkIsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDLGdCQUFnQixDQUNoQyxRQUFRLENBQUMsSUFBSSxFQUNiLFVBQVUsQ0FBQyxZQUFZLEdBQUcsVUFBVSxDQUFDLFNBQVMsRUFDOUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUMvQixLQUFLLENBQ1IsQ0FBQztRQUVGLE9BQVEsSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFDOUI7WUFDSSxJQUFJ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LFFBQVEsQ0FBQyxJQUFJLEVBQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUV2RSxJQUFJLENBQUMsU0FBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDdEQsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogR2xvYmFsIHJlZmVyZW5jZSB0byB0aGUgbGFuZ3VhZ2UgY29udGFpbmVyLCBzZXQgYXQgaW5pdCAqL1xyXG5sZXQgTCA6IEVuZ2xpc2hMYW5ndWFnZSB8IEJhc2VMYW5ndWFnZTtcclxuXHJcbmNsYXNzIEkxOG5cclxue1xyXG4gICAgLyoqIENvbnN0YW50IHJlZ2V4IHRvIG1hdGNoIGZvciB0cmFuc2xhdGlvbiBrZXlzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBUQUdfUkVHRVggOiBSZWdFeHAgPSAvJVtBLVpfXSslLztcclxuXHJcbiAgICAvKiogTGFuZ3VhZ2VzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGxhbmd1YWdlcyAgIDogRGljdGlvbmFyeTxCYXNlTGFuZ3VhZ2U+O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byBsYW5ndWFnZSBjdXJyZW50bHkgaW4gdXNlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBjdXJyZW50TGFuZyA6IEJhc2VMYW5ndWFnZTtcclxuXHJcbiAgICAvKiogUGlja3MgYSBsYW5ndWFnZSwgYW5kIHRyYW5zZm9ybXMgYWxsIHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGRvY3VtZW50ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5sYW5ndWFnZXMpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSTE4biBpcyBhbHJlYWR5IGluaXRpYWxpemVkJyk7XHJcblxyXG4gICAgICAgIHRoaXMubGFuZ3VhZ2VzID0ge1xyXG4gICAgICAgICAgICAnZW4nIDogbmV3IEVuZ2xpc2hMYW5ndWFnZSgpXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTGFuZ3VhZ2Ugc2VsZWN0aW9uXHJcbiAgICAgICAgTCA9IHRoaXMuY3VycmVudExhbmcgPSB0aGlzLmxhbmd1YWdlc1snZW4nXTtcclxuXHJcbiAgICAgICAgSTE4bi5hcHBseVRvRG9tKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXYWxrcyB0aHJvdWdoIGFsbCB0ZXh0IG5vZGVzIGluIHRoZSBET00sIHJlcGxhY2luZyBhbnkgdHJhbnNsYXRpb24ga2V5cy5cclxuICAgICAqXHJcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMDczMDc3Ny8zMzU0OTIwXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGFwcGx5VG9Eb20oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgbmV4dCA6IE5vZGUgfCBudWxsO1xyXG4gICAgICAgIGxldCB3YWxrID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keSxcclxuICAgICAgICAgICAgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQgfCBOb2RlRmlsdGVyLlNIT1dfVEVYVCxcclxuICAgICAgICAgICAgeyBhY2NlcHROb2RlOiBJMThuLm5vZGVGaWx0ZXIgfSxcclxuICAgICAgICAgICAgZmFsc2VcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB3aGlsZSAoIG5leHQgPSB3YWxrLm5leHROb2RlKCkgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKG5leHQubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5leHQgYXMgRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuYXR0cmlidXRlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgICAgICAgICBJMThuLmV4cGFuZEF0dHJpYnV0ZShlbGVtZW50LmF0dHJpYnV0ZXNbaV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKG5leHQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFICYmIG5leHQudGV4dENvbnRlbnQpXHJcbiAgICAgICAgICAgICAgICBJMThuLmV4cGFuZFRleHROb2RlKG5leHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsdGVycyB0aGUgdHJlZSB3YWxrZXIgdG8gZXhjbHVkZSBzY3JpcHQgYW5kIHN0eWxlIHRhZ3MgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgdGFnID0gKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgICAgICA/IChub2RlIGFzIEVsZW1lbnQpLnRhZ05hbWUudG9VcHBlckNhc2UoKVxyXG4gICAgICAgICAgICA6IG5vZGUucGFyZW50RWxlbWVudCEudGFnTmFtZS50b1VwcGVyQ2FzZSgpO1xyXG5cclxuICAgICAgICByZXR1cm4gWydTQ1JJUFQnLCAnU1RZTEUnXS5pbmNsdWRlcyh0YWcpXHJcbiAgICAgICAgICAgID8gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUXHJcbiAgICAgICAgICAgIDogTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFeHBhbmRzIGFueSB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBnaXZlbiBhdHRyaWJ1dGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGV4cGFuZEF0dHJpYnV0ZShhdHRyOiBBdHRyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTZXR0aW5nIGFuIGF0dHJpYnV0ZSwgZXZlbiBpZiBub3RoaW5nIGFjdHVhbGx5IGNoYW5nZXMsIHdpbGwgY2F1c2UgdmFyaW91c1xyXG4gICAgICAgIC8vIHNpZGUtZWZmZWN0cyAoZS5nLiByZWxvYWRpbmcgaWZyYW1lcykuIFNvLCBhcyB3YXN0ZWZ1bCBhcyB0aGlzIGxvb2tzLCB3ZSBoYXZlXHJcbiAgICAgICAgLy8gdG8gbWF0Y2ggZmlyc3QgYmVmb3JlIGFjdHVhbGx5IHJlcGxhY2luZy5cclxuXHJcbiAgICAgICAgaWYgKCBhdHRyLnZhbHVlLm1hdGNoKHRoaXMuVEFHX1JFR0VYKSApXHJcbiAgICAgICAgICAgIGF0dHIudmFsdWUgPSBhdHRyLnZhbHVlLnJlcGxhY2UodGhpcy5UQUdfUkVHRVgsIEkxOG4ucmVwbGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEV4cGFuZHMgYW55IHRyYW5zbGF0aW9uIGtleXMgaW4gdGhlIGdpdmVuIHRleHQgbm9kZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgZXhwYW5kVGV4dE5vZGUobm9kZTogTm9kZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbm9kZS50ZXh0Q29udGVudCA9IG5vZGUudGV4dENvbnRlbnQhLnJlcGxhY2UodGhpcy5UQUdfUkVHRVgsIEkxOG4ucmVwbGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcGxhY2VzIGtleSB3aXRoIHZhbHVlIGlmIGl0IGV4aXN0cywgZWxzZSBrZWVwcyB0aGUga2V5ICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZXBsYWNlKG1hdGNoOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSAgID0gbWF0Y2guc2xpY2UoMSwgLTEpO1xyXG4gICAgICAgIGxldCB2YWx1ZSA9IExba2V5XSBhcyBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgICAgICBpZiAoIXZhbHVlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignTWlzc2luZyB0cmFuc2xhdGlvbiBrZXk6JywgbWF0Y2gpO1xyXG4gICAgICAgICAgICByZXR1cm4gbWF0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBEZWxlZ2F0ZSB0eXBlIGZvciBjaG9vc2VyIHNlbGVjdCBldmVudCBoYW5kbGVycyAqL1xyXG50eXBlIFNlbGVjdERlbGVnYXRlID0gKGVudHJ5OiBIVE1MRWxlbWVudCkgPT4gdm9pZDtcclxuXHJcbi8qKiBVSSBlbGVtZW50IHdpdGggYSBmaWx0ZXJhYmxlIGFuZCBrZXlib2FyZCBuYXZpZ2FibGUgbGlzdCBvZiBjaG9pY2VzICovXHJcbmNsYXNzIENob29zZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIHRlbXBsYXRlIHRvIGNsb25lLCBmb3IgZWFjaCBjaG9vc2VyIGNyZWF0ZWQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFICAgICAgICA9IERPTS5yZXF1aXJlKCcjY2hvb3NlclRlbXBsYXRlJyk7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5pZCAgICAgPSAnJztcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBjb250YWluZXIgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkb20gICAgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgZmlsdGVyIGlucHV0IGJveCAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlucHV0RmlsdGVyICA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGNvbnRhaW5lciBvZiBpdGVtIGVsZW1lbnRzICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5wdXRDaG9pY2VzIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIE9wdGlvbmFsIGV2ZW50IGhhbmRsZXIgdG8gZmlyZSB3aGVuIGFuIGl0ZW0gaXMgc2VsZWN0ZWQgYnkgdGhlIHVzZXIgKi9cclxuICAgIHB1YmxpYyAgICBvblNlbGVjdD8gICAgIDogU2VsZWN0RGVsZWdhdGU7XHJcbiAgICAvKiogV2hldGhlciB0byB2aXN1YWxseSBzZWxlY3QgdGhlIGNsaWNrZWQgZWxlbWVudCAqL1xyXG4gICAgcHVibGljICAgIHNlbGVjdE9uQ2xpY2sgOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBpdGVtLCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCBkb21TZWxlY3RlZD8gIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBhdXRvLWZpbHRlciB0aW1lb3V0LCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCBmaWx0ZXJUaW1lb3V0IDogbnVtYmVyID0gMDtcclxuICAgIC8qKiBXaGV0aGVyIHRvIGdyb3VwIGFkZGVkIGVsZW1lbnRzIGJ5IGFscGhhYmV0aWNhbCBzZWN0aW9ucyAqL1xyXG4gICAgcHJvdGVjdGVkIGdyb3VwQnlBQkMgICAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogVGl0bGUgYXR0cmlidXRlIHRvIGFwcGx5IHRvIGV2ZXJ5IGl0ZW0gYWRkZWQgKi9cclxuICAgIHByb3RlY3RlZCBpdGVtVGl0bGUgICAgIDogc3RyaW5nID0gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIGl0ZW0nO1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGEgY2hvb3NlciwgYnkgcmVwbGFjaW5nIHRoZSBwbGFjZWhvbGRlciBpbiBhIGdpdmVuIHBhcmVudCAqL1xyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFDaG9vc2VyLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBDaG9vc2VyLmluaXQoKTtcclxuXHJcbiAgICAgICAgbGV0IHRhcmdldCAgICAgID0gRE9NLnJlcXVpcmUoJ2Nob29zZXInLCBwYXJlbnQpO1xyXG4gICAgICAgIGxldCBwbGFjZWhvbGRlciA9IERPTS5nZXRBdHRyKCB0YXJnZXQsICdwbGFjZWhvbGRlcicsIEwuUF9HRU5FUklDX1BIKCkgKTtcclxuICAgICAgICBsZXQgdGl0bGUgICAgICAgPSBET00uZ2V0QXR0ciggdGFyZ2V0LCAndGl0bGUnLCBMLlBfR0VORVJJQ19UKCkgKTtcclxuICAgICAgICB0aGlzLml0ZW1UaXRsZSAgPSBET00uZ2V0QXR0cih0YXJnZXQsICdpdGVtVGl0bGUnLCB0aGlzLml0ZW1UaXRsZSk7XHJcbiAgICAgICAgdGhpcy5ncm91cEJ5QUJDID0gdGFyZ2V0Lmhhc0F0dHJpYnV0ZSgnZ3JvdXBCeUFCQycpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbSAgICAgICAgICA9IENob29zZXIuVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIgID0gRE9NLnJlcXVpcmUoJy5jaFNlYXJjaEJveCcsICB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMgPSBET00ucmVxdWlyZSgnLmNoQ2hvaWNlc0JveCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMudGl0bGUgICAgICA9IHRpdGxlO1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIucGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcclxuICAgICAgICAvLyBUT0RPOiBSZXVzaW5nIHRoZSBwbGFjZWhvbGRlciBhcyB0aXRsZSBpcyBwcm9iYWJseSBiYWRcclxuICAgICAgICAvLyBodHRwczovL2xha2VuLm5ldC9ibG9nL21vc3QtY29tbW9uLWExMXktbWlzdGFrZXMvXHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci50aXRsZSAgICAgICA9IHBsYWNlaG9sZGVyO1xyXG5cclxuICAgICAgICB0YXJnZXQuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdiZWZvcmViZWdpbicsIHRoaXMuZG9tKTtcclxuICAgICAgICB0YXJnZXQucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBZGRzIHRoZSBnaXZlbiB2YWx1ZSB0byB0aGUgY2hvb3NlciBhcyBhIHNlbGVjdGFibGUgaXRlbS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgVGV4dCBvZiB0aGUgc2VsZWN0YWJsZSBpdGVtXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFdoZXRoZXIgdG8gc2VsZWN0IHRoaXMgaXRlbSBvbmNlIGFkZGVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhZGQodmFsdWU6IHN0cmluZywgc2VsZWN0OiBib29sZWFuID0gZmFsc2UpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuXHJcbiAgICAgICAgaXRlbS5pbm5lclRleHQgPSB2YWx1ZTtcclxuXHJcbiAgICAgICAgdGhpcy5hZGRSYXcoaXRlbSwgc2VsZWN0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFkZHMgdGhlIGdpdmVuIGVsZW1lbnQgdG8gdGhlIGNob29zZXIgYXMgYSBzZWxlY3RhYmxlIGl0ZW0uXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGl0ZW0gRWxlbWVudCB0byBhZGQgdG8gdGhlIGNob29zZXJcclxuICAgICAqIEBwYXJhbSBzZWxlY3QgV2hldGhlciB0byBzZWxlY3QgdGhpcyBpdGVtIG9uY2UgYWRkZWRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGFkZFJhdyhpdGVtOiBIVE1MRWxlbWVudCwgc2VsZWN0OiBib29sZWFuID0gZmFsc2UpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGl0ZW0udGl0bGUgICAgPSB0aGlzLml0ZW1UaXRsZTtcclxuICAgICAgICBpdGVtLnRhYkluZGV4ID0gLTE7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmFwcGVuZENoaWxkKGl0ZW0pO1xyXG5cclxuICAgICAgICBpZiAoc2VsZWN0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoaXRlbSk7XHJcbiAgICAgICAgICAgIGl0ZW0uZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFycyBhbGwgaXRlbXMgZnJvbSB0aGlzIGNob29zZXIgYW5kIHRoZSBjdXJyZW50IGZpbHRlciAqL1xyXG4gICAgcHVibGljIGNsZWFyKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuaW5uZXJIVE1MID0gJyc7XHJcbiAgICAgICAgdGhpcy5pbnB1dEZpbHRlci52YWx1ZSAgICAgID0gJyc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNlbGVjdCBhbmQgZm9jdXMgdGhlIGVudHJ5IHRoYXQgbWF0Y2hlcyB0aGUgZ2l2ZW4gdmFsdWUgKi9cclxuICAgIHB1YmxpYyBwcmVzZWxlY3QodmFsdWU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQga2V5IGluIHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGl0ZW0gPSB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbltrZXldIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgaWYgKHZhbHVlID09PSBpdGVtLmlubmVyVGV4dClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy52aXN1YWxTZWxlY3QoaXRlbSk7XHJcbiAgICAgICAgICAgICAgICBpdGVtLmZvY3VzKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbGljayBldmVudHMsIGZvciBjaG9vc2luZyBpdGVtcyAqL1xyXG4gICAgcHVibGljIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSBldi50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICggdGhpcy5pc0Nob2ljZSh0YXJnZXQpIClcclxuICAgICAgICBpZiAoICF0YXJnZXQuaGFzQXR0cmlidXRlKCdkaXNhYmxlZCcpIClcclxuICAgICAgICAgICAgdGhpcy5zZWxlY3QodGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbG9zZSBtZXRob2RzLCBkb2luZyBhbnkgdGltZXIgY2xlYW51cCAqL1xyXG4gICAgcHVibGljIG9uQ2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgaW5wdXQgZXZlbnRzLCBmb3IgZmlsdGVyaW5nIGFuZCBuYXZpZ2F0aW9uICovXHJcbiAgICBwdWJsaWMgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSAgICAgPSBldi5rZXk7XHJcbiAgICAgICAgbGV0IGZvY3VzZWQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCBwYXJlbnQgID0gZm9jdXNlZC5wYXJlbnRFbGVtZW50ITtcclxuXHJcbiAgICAgICAgaWYgKCFmb2N1c2VkKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIE9ubHkgaGFuZGxlIGV2ZW50cyBvbiB0aGlzIGNob29zZXIncyBjb250cm9sc1xyXG4gICAgICAgIGlmICggIXRoaXMub3ducyhmb2N1c2VkKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHR5cGluZyBpbnRvIGZpbHRlciBib3hcclxuICAgICAgICBpZiAoZm9jdXNlZCA9PT0gdGhpcy5pbnB1dEZpbHRlcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5maWx0ZXJUaW1lb3V0KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyVGltZW91dCA9IHdpbmRvdy5zZXRUaW1lb3V0KF8gPT4gdGhpcy5maWx0ZXIoKSwgNTAwKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUmVkaXJlY3QgdHlwaW5nIHRvIGlucHV0IGZpbHRlciBib3hcclxuICAgICAgICBpZiAoZm9jdXNlZCAhPT0gdGhpcy5pbnB1dEZpbHRlcilcclxuICAgICAgICBpZiAoa2V5Lmxlbmd0aCA9PT0gMSB8fCBrZXkgPT09ICdCYWNrc3BhY2UnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pbnB1dEZpbHRlci5mb2N1cygpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcHJlc3NpbmcgRU5URVIgYWZ0ZXIga2V5Ym9hcmQgbmF2aWdhdGluZyB0byBhbiBpdGVtXHJcbiAgICAgICAgaWYgKCB0aGlzLmlzQ2hvaWNlKGZvY3VzZWQpIClcclxuICAgICAgICBpZiAoa2V5ID09PSAnRW50ZXInKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3QoZm9jdXNlZCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBuYXZpZ2F0aW9uIHdoZW4gY29udGFpbmVyIG9yIGl0ZW0gaXMgZm9jdXNlZFxyXG4gICAgICAgIGlmIChrZXkgPT09ICdBcnJvd0xlZnQnIHx8IGtleSA9PT0gJ0Fycm93UmlnaHQnKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGRpciA9IChrZXkgPT09ICdBcnJvd0xlZnQnKSA/IC0xIDogMTtcclxuICAgICAgICAgICAgbGV0IG5hdiA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgZm9jdXNlZCBlbGVtZW50LCBpZiB1c2luZyBncm91cHNcclxuICAgICAgICAgICAgaWYgICAgICAoIHRoaXMuZ3JvdXBCeUFCQyAmJiBwYXJlbnQuaGFzQXR0cmlidXRlKCdncm91cCcpIClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudCwgaWYgY2hvaWNlcyBhcmUgZmxhdFxyXG4gICAgICAgICAgICBlbHNlIGlmICghdGhpcy5ncm91cEJ5QUJDICYmIGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dENob2ljZXMpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGZvY3VzZWQgPT09IHRoaXMuZG9tU2VsZWN0ZWQpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcodGhpcy5kb21TZWxlY3RlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGV2YW50IHRvIGJlZ2lubmluZyBvciBlbmQgb2YgY29udGFpbmVyXHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA9PT0gLTEpXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5maXJzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQubGFzdEVsZW1lbnRDaGlsZCEgYXMgSFRNTEVsZW1lbnQsIGRpclxyXG4gICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChuYXYpIG5hdi5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBzdWJtaXQgZXZlbnRzLCBmb3IgaW5zdGFudCBmaWx0ZXJpbmcgKi9cclxuICAgIHB1YmxpYyBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgdGhpcy5maWx0ZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGlkZSBvciBzaG93IGNob2ljZXMgaWYgdGhleSBwYXJ0aWFsbHkgbWF0Y2ggdGhlIHVzZXIgcXVlcnkgKi9cclxuICAgIHByb3RlY3RlZCBmaWx0ZXIoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcblxyXG4gICAgICAgIGxldCBmaWx0ZXIgPSB0aGlzLmlucHV0RmlsdGVyLnZhbHVlLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgbGV0IGl0ZW1zICA9IHRoaXMuaW5wdXRDaG9pY2VzLmNoaWxkcmVuO1xyXG4gICAgICAgIGxldCBlbmdpbmUgPSB0aGlzLmdyb3VwQnlBQkNcclxuICAgICAgICAgICAgPyBDaG9vc2VyLmZpbHRlckdyb3VwXHJcbiAgICAgICAgICAgIDogQ2hvb3Nlci5maWx0ZXJJdGVtO1xyXG5cclxuICAgICAgICAvLyBQcmV2ZW50IGJyb3dzZXIgcmVkcmF3L3JlZmxvdyBkdXJpbmcgZmlsdGVyaW5nXHJcbiAgICAgICAgLy8gVE9ETzogTWlnaHQgdGhlIHVzZSBvZiBoaWRkZW4gYnJlYWsgQTExeSBoZXJlPyAoZS5nLiBkZWZvY3VzKVxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmhpZGRlbiA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBhbGwgdGhlIGl0ZW1zXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgZW5naW5lKGl0ZW1zW2ldIGFzIEhUTUxFbGVtZW50LCBmaWx0ZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5oaWRkZW4gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQXBwbGllcyBmaWx0ZXIgdG8gYW4gaXRlbSwgc2hvd2luZyBpdCBpZiBtYXRjaGVkLCBoaWRpbmcgaWYgbm90ICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGZpbHRlckl0ZW0oaXRlbTogSFRNTEVsZW1lbnQsIGZpbHRlcjogc3RyaW5nKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIC8vIFNob3cgaWYgY29udGFpbnMgc2VhcmNoIHRlcm1cclxuICAgICAgICBpZiAoaXRlbS5pbm5lclRleHQudG9Mb3dlckNhc2UoKS5pbmRleE9mKGZpbHRlcikgPj0gMClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGl0ZW0uaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGlkZSBpZiBub3RcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpdGVtLmhpZGRlbiA9IHRydWU7XHJcbiAgICAgICAgICAgIHJldHVybiAxO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQXBwbGllcyBmaWx0ZXIgdG8gY2hpbGRyZW4gb2YgYSBncm91cCwgaGlkaW5nIHRoZSBncm91cCBpZiBhbGwgY2hpbGRyZW4gaGlkZSAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBmaWx0ZXJHcm91cChncm91cDogSFRNTEVsZW1lbnQsIGZpbHRlcjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cmllcyA9IGdyb3VwLmNoaWxkcmVuO1xyXG4gICAgICAgIGxldCBjb3VudCAgID0gZW50cmllcy5sZW5ndGggLSAxOyAvLyAtMSBmb3IgaGVhZGVyIGVsZW1lbnRcclxuICAgICAgICBsZXQgaGlkZGVuICA9IDA7XHJcblxyXG4gICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHN0YXRpb24gbmFtZSBpbiB0aGlzIGxldHRlciBzZWN0aW9uLiBIZWFkZXIgc2tpcHBlZC5cclxuICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGVudHJpZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIGhpZGRlbiArPSBDaG9vc2VyLmZpbHRlckl0ZW0oZW50cmllc1tpXSBhcyBIVE1MRWxlbWVudCwgZmlsdGVyKTtcclxuXHJcbiAgICAgICAgLy8gSWYgYWxsIHN0YXRpb24gbmFtZXMgaW4gdGhpcyBsZXR0ZXIgc2VjdGlvbiB3ZXJlIGhpZGRlbiwgaGlkZSB0aGUgc2VjdGlvblxyXG4gICAgICAgIGlmIChoaWRkZW4gPj0gY291bnQpXHJcbiAgICAgICAgICAgIGdyb3VwLmhpZGRlbiA9IHRydWU7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBncm91cC5oaWRkZW4gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgY2hhbmdlcyB0aGUgY3VycmVudCBzZWxlY3Rpb24sIGFuZCB1cGRhdGVzIHRoZSBzdGF0ZSBhbmQgZWRpdG9yICovXHJcbiAgICBwcm90ZWN0ZWQgc2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGFscmVhZHlTZWxlY3RlZCA9IChlbnRyeSA9PT0gdGhpcy5kb21TZWxlY3RlZCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnNlbGVjdE9uQ2xpY2spXHJcbiAgICAgICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGVudHJ5KTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25TZWxlY3QpXHJcbiAgICAgICAgICAgIHRoaXMub25TZWxlY3QoZW50cnkpO1xyXG5cclxuICAgICAgICBpZiAoYWxyZWFkeVNlbGVjdGVkKVxyXG4gICAgICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IGNoYW5nZXMgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50ICovXHJcbiAgICBwcm90ZWN0ZWQgdmlzdWFsU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy52aXN1YWxVbnNlbGVjdCgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkICAgICAgICAgID0gZW50cnk7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC50YWJJbmRleCA9IDUwO1xyXG4gICAgICAgIGVudHJ5LnNldEF0dHJpYnV0ZSgnc2VsZWN0ZWQnLCAndHJ1ZScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSB1bnNlbGVjdHMgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBlbGVtZW50LCBpZiBhbnkgKi9cclxuICAgIHByb3RlY3RlZCB2aXN1YWxVbnNlbGVjdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5kb21TZWxlY3RlZClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnJlbW92ZUF0dHJpYnV0ZSgnc2VsZWN0ZWQnKTtcclxuICAgICAgICB0aGlzLmRvbVNlbGVjdGVkLnRhYkluZGV4ID0gLTE7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZCAgICAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFdoZXRoZXIgdGhpcyBjaG9vc2VyIGlzIGFuIGFuY2VzdG9yIChvd25lcikgb2YgdGhlIGdpdmVuIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFbGVtZW50IHRvIGNoZWNrIGlmIHRoaXMgY2hvb3NlciBpcyBhbiBhbmNlc3RvciBvZlxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb3ducyh0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20uY29udGFpbnModGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogV2hldGhlciB0aGUgZ2l2ZW4gZWxlbWVudCBpcyBhIGNob29zYWJsZSBvbmUgb3duZWQgYnkgdGhpcyBjaG9vc2VyICovXHJcbiAgICBwcm90ZWN0ZWQgaXNDaG9pY2UodGFyZ2V0PzogSFRNTEVsZW1lbnQpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0YXJnZXQgIT09IHVuZGVmaW5lZFxyXG4gICAgICAgICAgICAmJiB0YXJnZXQudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnZGQnXHJcbiAgICAgICAgICAgICYmIHRoaXMub3ducyh0YXJnZXQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVUkgZWxlbWVudCBmb3IgdG9nZ2xpbmcgdGhlIHN0YXRlIG9mIGNvbGxhcHNpYmxlIGVkaXRvciBlbGVtZW50cyAqL1xyXG5jbGFzcyBDb2xsYXBzZVRvZ2dsZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSB0b2dnbGUgYnV0dG9uIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgVEVNUExBVEUgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgZGV0YWNoZXMgdGhlIHRlbXBsYXRlIG9uIGZpcnN0IGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIENvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFICAgICAgICA9IERPTS5yZXF1aXJlKCcjY29sbGFwc2libGVCdXR0b25UZW1wbGF0ZScpO1xyXG4gICAgICAgIENvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFLmlkICAgICA9ICcnO1xyXG4gICAgICAgIENvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIENvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBhdHRhY2hlcyB0b2dnbGUgZWxlbWVudCBmb3IgdG9nZ2xpbmcgY29sbGFwc2libGVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNyZWF0ZUFuZEF0dGFjaChwYXJlbnQ6IEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFNraXAgaWYgYSB0b2dnbGUgaXMgYWxyZWFkeSBhdHRhY2hlZFxyXG4gICAgICAgIGlmICggcGFyZW50LnF1ZXJ5U2VsZWN0b3IoJy50b2dnbGUnKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKCFDb2xsYXBzZVRvZ2dsZS5URU1QTEFURSlcclxuICAgICAgICAgICAgQ29sbGFwc2VUb2dnbGUuaW5pdCgpO1xyXG5cclxuICAgICAgICBwYXJlbnQuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdhZnRlcmJlZ2luJyxcclxuICAgICAgICAgICAgQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEVsZW1lbnRcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBnaXZlbiBjb2xsYXBzZSB0b2dnbGUncyB0aXRsZSB0ZXh0LCBkZXBlbmRpbmcgb24gc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdXBkYXRlKHNwYW46IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVmICAgID0gc3Bhbi5kYXRhc2V0WydyZWYnXSB8fCAnPz8/JztcclxuICAgICAgICBsZXQgdHlwZSAgID0gc3Bhbi5kYXRhc2V0Wyd0eXBlJ10hO1xyXG4gICAgICAgIGxldCBzdGF0ZSAgPSBzcGFuLmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJyk7XHJcbiAgICAgICAgbGV0IHRvZ2dsZSA9IERPTS5yZXF1aXJlKCcudG9nZ2xlJywgc3Bhbik7XHJcblxyXG4gICAgICAgIHRvZ2dsZS50aXRsZSA9IHN0YXRlXHJcbiAgICAgICAgICAgID8gTC5USVRMRV9PUFRfT1BFTih0eXBlLCByZWYpXHJcbiAgICAgICAgICAgIDogTC5USVRMRV9PUFRfQ0xPU0UodHlwZSwgcmVmKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFVJIGVsZW1lbnQgZm9yIG9wZW5pbmcgdGhlIHBpY2tlciBmb3IgcGhyYXNlc2V0IGVkaXRvciBlbGVtZW50cyAqL1xyXG5jbGFzcyBQaHJhc2VzZXRCdXR0b25cclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlc2V0IGJ1dHRvbiBET00gdGVtcGxhdGUgdG8gY2xvbmUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBUT0RPOiBUaGlzIGlzIGJlaW5nIGR1cGxpY2F0ZWQgaW4gdmFyaW91cyBwbGFjZXM7IERSWSB3aXRoIHN1Z2FyIG1ldGhvZFxyXG4gICAgICAgIFBocmFzZXNldEJ1dHRvbi5URU1QTEFURSAgICAgICAgPSBET00ucmVxdWlyZSgnI3BocmFzZXNldEJ1dHRvblRlbXBsYXRlJyk7XHJcbiAgICAgICAgUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFLmlkICAgICA9ICcnO1xyXG4gICAgICAgIFBocmFzZXNldEJ1dHRvbi5URU1QTEFURS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICBQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGF0dGFjaGVzIGEgYnV0dG9uIGZvciB0aGUgZ2l2ZW4gcGhyYXNlc2V0IGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY3JlYXRlQW5kQXR0YWNoKHBocmFzZXNldDogRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2tpcCBpZiBhIGJ1dHRvbiBpcyBhbHJlYWR5IGF0dGFjaGVkXHJcbiAgICAgICAgaWYgKCBwaHJhc2VzZXQucXVlcnlTZWxlY3RvcignLmNob29zZVBocmFzZScpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoIVBocmFzZXNldEJ1dHRvbi5URU1QTEFURSlcclxuICAgICAgICAgICAgUGhyYXNlc2V0QnV0dG9uLmluaXQoKTtcclxuXHJcbiAgICAgICAgbGV0IHJlZiAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHBocmFzZXNldCBhcyBIVE1MRWxlbWVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBidXR0b24gICA9IFBocmFzZXNldEJ1dHRvbi5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgYnV0dG9uLnRpdGxlID0gTC5USVRMRV9QSFJBU0VTRVQocmVmKTtcclxuXHJcbiAgICAgICAgcGhyYXNlc2V0Lmluc2VydEFkamFjZW50RWxlbWVudCgnYWZ0ZXJiZWdpbicsIGJ1dHRvbik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vIFRPRE86IFNlYXJjaCBieSBzdGF0aW9uIGNvZGVcclxuXHJcbi8qKlxyXG4gKiBTaW5nbGV0b24gaW5zdGFuY2Ugb2YgdGhlIHN0YXRpb24gcGlja2VyLiBTaW5jZSB0aGVyZSBhcmUgZXhwZWN0ZWQgdG8gYmUgMjUwMCtcclxuICogc3RhdGlvbnMsIHRoaXMgZWxlbWVudCB3b3VsZCB0YWtlIHVwIGEgbG90IG9mIG1lbW9yeSBhbmQgZ2VuZXJhdGUgYSBsb3Qgb2YgRE9NLiBTbywgaXRcclxuICogaGFzIHRvIGJlIFwic3dhcHBlZFwiIGJldHdlZW4gcGlja2VycyBhbmQgdmlld3MgdGhhdCB3YW50IHRvIHVzZSBpdC5cclxuICovXHJcbmNsYXNzIFN0YXRpb25DaG9vc2VyIGV4dGVuZHMgQ2hvb3NlclxyXG57XHJcbiAgICAvKiogU2hvcnRjdXQgcmVmZXJlbmNlcyB0byBhbGwgdGhlIGdlbmVyYXRlZCBBLVogc3RhdGlvbiBsaXN0IGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbVN0YXRpb25zIDogRGljdGlvbmFyeTxIVE1MRExpc3RFbGVtZW50PiA9IHt9O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKHBhcmVudCk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnRhYkluZGV4ID0gMDtcclxuXHJcbiAgICAgICAgLy8gUG9wdWxhdGVzIHRoZSBsaXN0IG9mIHN0YXRpb25zIGZyb20gdGhlIGRhdGFiYXNlLiBXZSBkbyB0aGlzIGJ5IGNyZWF0aW5nIGEgZGxcclxuICAgICAgICAvLyBlbGVtZW50IGZvciBlYWNoIGxldHRlciBvZiB0aGUgYWxwaGFiZXQsIGNyZWF0aW5nIGEgZHQgZWxlbWVudCBoZWFkZXIsIGFuZCB0aGVuXHJcbiAgICAgICAgLy8gcG9wdWxhdGluZyB0aGUgZGwgd2l0aCBzdGF0aW9uIG5hbWUgZGQgY2hpbGRyZW4uXHJcbiAgICAgICAgT2JqZWN0LmtleXMoUkFHLmRhdGFiYXNlLnN0YXRpb25zKS5mb3JFYWNoKCB0aGlzLmFkZFN0YXRpb24uYmluZCh0aGlzKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXR0YWNoZXMgdGhpcyBjb250cm9sIHRvIHRoZSBnaXZlbiBwYXJlbnQgYW5kIHJlc2V0cyBzb21lIHN0YXRlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwaWNrZXIgUGlja2VyIHRvIGF0dGFjaCB0aGlzIGNvbnRyb2wgdG9cclxuICAgICAqIEBwYXJhbSBvblNlbGVjdCBEZWxlZ2F0ZSB0byBmaXJlIHdoZW4gY2hvb3NpbmcgYSBzdGF0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhdHRhY2gocGlja2VyOiBQaWNrZXIsIG9uU2VsZWN0OiBTZWxlY3REZWxlZ2F0ZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBwaWNrZXIuZG9tRm9ybTtcclxuICAgICAgICBsZXQgY3VycmVudCA9IHRoaXMuZG9tLnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIFJlLWVuYWJsZSBhbGwgZGlzYWJsZWQgZWxlbWVudHNcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5xdWVyeVNlbGVjdG9yQWxsKGBkZFtkaXNhYmxlZF1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaCggdGhpcy5lbmFibGUuYmluZCh0aGlzKSApO1xyXG5cclxuICAgICAgICBpZiAoIWN1cnJlbnQgfHwgY3VycmVudCAhPT0gcGFyZW50KVxyXG4gICAgICAgICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5kb20pO1xyXG5cclxuICAgICAgICB0aGlzLnZpc3VhbFVuc2VsZWN0KCk7XHJcbiAgICAgICAgdGhpcy5vblNlbGVjdCA9IG9uU2VsZWN0LmJpbmQocGlja2VyKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUHJlLXNlbGVjdHMgYSBzdGF0aW9uIGVudHJ5IGJ5IGl0cyBjb2RlICovXHJcbiAgICBwdWJsaWMgcHJlc2VsZWN0Q29kZShjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9IHRoaXMuZ2V0QnlDb2RlKGNvZGUpO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGVudHJ5KTtcclxuICAgICAgICBlbnRyeS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFbmFibGVzIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgb3Igc3RhdGlvbiBlbGVtZW50IGZvciBzZWxlY3Rpb24gKi9cclxuICAgIHB1YmxpYyBlbmFibGUoY29kZU9yTm9kZTogc3RyaW5nIHwgSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9ICh0eXBlb2YgY29kZU9yTm9kZSA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgICAgID8gdGhpcy5nZXRCeUNvZGUoY29kZU9yTm9kZSlcclxuICAgICAgICAgICAgOiBjb2RlT3JOb2RlO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGVudHJ5LnJlbW92ZUF0dHJpYnV0ZSgnZGlzYWJsZWQnKTtcclxuICAgICAgICBlbnRyeS50YWJJbmRleCA9IC0xO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIERpc2FibGVzIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgZnJvbSBzZWxlY3Rpb24gKi9cclxuICAgIHB1YmxpYyBkaXNhYmxlKGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJ5ID0gdGhpcy5nZXRCeUNvZGUoY29kZSk7XHJcbiAgICAgICAgbGV0IG5leHQgID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGVudHJ5LCAxKTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBlbnRyeS5zZXRBdHRyaWJ1dGUoJ2Rpc2FibGVkJywgJycpO1xyXG4gICAgICAgIGVudHJ5LnJlbW92ZUF0dHJpYnV0ZSgndGFiaW5kZXgnKTtcclxuICAgICAgICBlbnRyeS50aXRsZSA9ICcnO1xyXG5cclxuICAgICAgICAvLyBTaGlmdCBmb2N1cyB0byBuZXh0IGF2YWlsYWJsZSBlbGVtZW50LCBmb3Iga2V5Ym9hcmQgbmF2aWdhdGlvblxyXG4gICAgICAgIGlmIChuZXh0KVxyXG4gICAgICAgICAgICBuZXh0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgYSBzdGF0aW9uJ3MgY2hvaWNlIGVsZW1lbnQgYnkgaXRzIGNvZGUgKi9cclxuICAgIHByaXZhdGUgZ2V0QnlDb2RlKGNvZGU6IHN0cmluZykgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmlucHV0Q2hvaWNlc1xyXG4gICAgICAgICAgICAucXVlcnlTZWxlY3RvcihgZGRbZGF0YS1jb2RlPSR7Y29kZX1dYCkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBnaXZlbiBzdGF0aW9uIGNvZGUgKi9cclxuICAgIHByaXZhdGUgYWRkU3RhdGlvbihjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcbiAgICAgICAgbGV0IGxldHRlciAgPSBzdGF0aW9uWzBdO1xyXG4gICAgICAgIGxldCBncm91cCAgID0gdGhpcy5kb21TdGF0aW9uc1tsZXR0ZXJdO1xyXG5cclxuICAgICAgICBpZiAoIWdyb3VwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGhlYWRlciAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2R0Jyk7XHJcbiAgICAgICAgICAgIGhlYWRlci5pbm5lclRleHQgPSBsZXR0ZXIudG9VcHBlckNhc2UoKTtcclxuICAgICAgICAgICAgaGVhZGVyLnRhYkluZGV4ICA9IC0xO1xyXG5cclxuICAgICAgICAgICAgZ3JvdXAgPSB0aGlzLmRvbVN0YXRpb25zW2xldHRlcl0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkbCcpO1xyXG4gICAgICAgICAgICBncm91cC50YWJJbmRleCA9IDUwO1xyXG5cclxuICAgICAgICAgICAgZ3JvdXAuc2V0QXR0cmlidXRlKCdncm91cCcsICcnKTtcclxuICAgICAgICAgICAgZ3JvdXAuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuYXBwZW5kQ2hpbGQoZ3JvdXApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGVudHJ5ICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuICAgICAgICBlbnRyeS5kYXRhc2V0Wydjb2RlJ10gPSBjb2RlO1xyXG4gICAgICAgIGVudHJ5LmlubmVyVGV4dCAgICAgICA9IHN0YXRpb247XHJcbiAgICAgICAgZW50cnkudGl0bGUgICAgICAgICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICAgICAgZW50cnkudGFiSW5kZXggICAgICAgID0gLTE7XHJcblxyXG4gICAgICAgIGdyb3VwLmFwcGVuZENoaWxkKGVudHJ5KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFN0YXRpb24gbGlzdCBpdGVtIHRoYXQgY2FuIGJlIGRyYWdnZWQgYW5kIGRyb3BwZWQgKi9cclxuY2xhc3MgU3RhdGlvbkxpc3RJdGVtXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSwgZm9yIGVhY2ggaXRlbSBjcmVhdGVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFICAgICAgICA9IERPTS5yZXF1aXJlKCcjc3RhdGlvbkxpc3RJdGVtVGVtcGxhdGUnKTtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgaXRlbSdzIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb20gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBzdGF0aW9uIGxpc3QgaXRlbSwgbWVhbnQgZm9yIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGNyZWF0ZSB0aGlzIGl0ZW0gZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcihjb2RlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUpXHJcbiAgICAgICAgICAgIFN0YXRpb25MaXN0SXRlbS5pbml0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tICAgICAgICAgICA9IFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJUZXh0ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmRhdGFzZXRbJ2NvZGUnXSA9IGNvZGU7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBCYXNlIGNsYXNzIGZvciBwaWNrZXIgdmlld3MgKi9cclxuYWJzdHJhY3QgY2xhc3MgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBET00gZWxlbWVudCAqL1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGRvbSAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGZvcm0gRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb21Gb3JtICAgOiBIVE1MRm9ybUVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgaGVhZGVyIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb21IZWFkZXIgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBHZXRzIHRoZSBuYW1lIG9mIHRoZSBYTUwgdGFnIHRoaXMgcGlja2VyIGhhbmRsZXMgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSB4bWxUYWcgICAgOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlIGVsZW1lbnQgYmVpbmcgZWRpdGVkIGJ5IHRoaXMgcGlja2VyICovXHJcbiAgICBwcm90ZWN0ZWQgZG9tRWRpdGluZz8gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYSBwaWNrZXIgdG8gaGFuZGxlIHRoZSBnaXZlbiBwaHJhc2UgZWxlbWVudCB0eXBlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB4bWxUYWcgTmFtZSBvZiB0aGUgWE1MIHRhZyB0aGlzIHBpY2tlciB3aWxsIGhhbmRsZS5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKHhtbFRhZzogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICAgID0gRE9NLnJlcXVpcmUoYCMke3htbFRhZ31QaWNrZXJgKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0gICA9IERPTS5yZXF1aXJlKCdmb3JtJywgICB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIgPSBET00ucmVxdWlyZSgnaGVhZGVyJywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMueG1sVGFnICAgID0geG1sVGFnO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25jaGFuZ2UgID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmlucHV0ICAgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uY2xpY2sgICA9IHRoaXMub25DbGljay5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmtleWRvd24gPSB0aGlzLm9uSW5wdXQuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25zdWJtaXQgID0gdGhpcy5vblN1Ym1pdC5iaW5kKHRoaXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2FsbGVkIHdoZW4gZm9ybSBmaWVsZHMgY2hhbmdlLiBUaGUgaW1wbGVtZW50aW5nIHBpY2tlciBzaG91bGQgdXBkYXRlIGFsbCBsaW5rZWRcclxuICAgICAqIGVsZW1lbnRzIChlLmcuIG9mIHNhbWUgdHlwZSkgd2l0aCB0aGUgbmV3IGRhdGEgaGVyZS5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IG9uQ2hhbmdlKGV2OiBFdmVudCkgOiB2b2lkO1xyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiBhIG1vdXNlIGNsaWNrIGhhcHBlbnMgYW55d2hlcmUgaW4gb3Igb24gdGhlIHBpY2tlcidzIGZvcm0gKi9cclxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIGEga2V5IGlzIHByZXNzZWQgd2hpbHN0IHRoZSBwaWNrZXIncyBmb3JtIGlzIGZvY3VzZWQgKi9cclxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDYWxsZWQgd2hlbiBFTlRFUiBpcyBwcmVzc2VkIHdoaWxzdCBhIGZvcm0gY29udHJvbCBvZiB0aGUgcGlja2VyIGlzIGZvY3VzZWQuXHJcbiAgICAgKiBCeSBkZWZhdWx0LCB0aGlzIHdpbGwgdHJpZ2dlciB0aGUgb25DaGFuZ2UgaGFuZGxlciBhbmQgY2xvc2UgdGhlIGRpYWxvZy5cclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICB0aGlzLm9uQ2hhbmdlKGV2KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBPcGVuIHRoaXMgcGlja2VyIGZvciBhIGdpdmVuIHBocmFzZSBlbGVtZW50LiBUaGUgaW1wbGVtZW50aW5nIHBpY2tlciBzaG91bGQgZmlsbFxyXG4gICAgICogaXRzIGZvcm0gZWxlbWVudHMgd2l0aCBkYXRhIGZyb20gdGhlIGN1cnJlbnQgc3RhdGUgYW5kIHRhcmdldGVkIGVsZW1lbnQgaGVyZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSB0YXJnZXQgUGhyYXNlIGVsZW1lbnQgdGhhdCB0aGlzIHBpY2tlciBpcyBiZWluZyBvcGVuZWQgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyA9IHRhcmdldDtcclxuICAgICAgICB0aGlzLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvc2l0aW9ucyB0aGlzIHBpY2tlciByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0IHBocmFzZSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgbGF5b3V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRvbUVkaXRpbmcpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IHRhcmdldFJlY3QgPSB0aGlzLmRvbUVkaXRpbmcuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgbGV0IGZ1bGxXaWR0aCAgPSB0aGlzLmRvbS5jbGFzc0xpc3QuY29udGFpbnMoJ2Z1bGxXaWR0aCcpO1xyXG4gICAgICAgIGxldCBpc01vZGFsICAgID0gdGhpcy5kb20uY2xhc3NMaXN0LmNvbnRhaW5zKCdtb2RhbCcpO1xyXG4gICAgICAgIGxldCBkb2NXICAgICAgID0gZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aDtcclxuICAgICAgICBsZXQgZG9jSCAgICAgICA9IGRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0O1xyXG4gICAgICAgIGxldCBkaWFsb2dYICAgID0gKHRhcmdldFJlY3QubGVmdCAgIHwgMCkgLSA4O1xyXG4gICAgICAgIGxldCBkaWFsb2dZICAgID0gIHRhcmdldFJlY3QuYm90dG9tIHwgMDtcclxuICAgICAgICBsZXQgZGlhbG9nVyAgICA9ICh0YXJnZXRSZWN0LndpZHRoICB8IDApICsgMTY7XHJcblxyXG4gICAgICAgIC8vIEFkanVzdCBpZiBob3Jpem9udGFsbHkgb2ZmIHNjcmVlblxyXG4gICAgICAgIGlmICghZnVsbFdpZHRoICYmICFpc01vZGFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gRm9yY2UgZnVsbCB3aWR0aCBvbiBtb2JpbGVcclxuICAgICAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUud2lkdGggPSBgMTAwJWA7XHJcblxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS53aWR0aCAgICA9IGBpbml0aWFsYDtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLm1pbldpZHRoID0gYCR7ZGlhbG9nV31weGA7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGRpYWxvZ1ggKyB0aGlzLmRvbS5vZmZzZXRXaWR0aCA+IGRvY1cpXHJcbiAgICAgICAgICAgICAgICAgICAgZGlhbG9nWCA9ICh0YXJnZXRSZWN0LnJpZ2h0IHwgMCkgLSB0aGlzLmRvbS5vZmZzZXRXaWR0aCArIDg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaWNrZXJzIHRoYXQgaW5zdGVhZCB0YWtlIHVwIHRoZSB3aG9sZSBkaXNwbGF5LiBDU1MgaXNuJ3QgdXNlZCBoZXJlLFxyXG4gICAgICAgIC8vIGJlY2F1c2UgcGVyY2VudGFnZS1iYXNlZCBsZWZ0L3RvcCBjYXVzZXMgc3VicGl4ZWwgaXNzdWVzIG9uIENocm9tZS5cclxuICAgICAgICBpZiAoaXNNb2RhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGRpYWxvZ1ggPSBET00uaXNNb2JpbGUgPyAwIDogKCAoZG9jVyAqIDAuMSkgLyAyICkgfCAwO1xyXG4gICAgICAgICAgICBkaWFsb2dZID0gRE9NLmlzTW9iaWxlID8gMCA6ICggKGRvY0ggKiAwLjEpIC8gMiApIHwgMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsYW1wIHRvIHRvcCBlZGdlIG9mIGRvY3VtZW50XHJcbiAgICAgICAgZWxzZSBpZiAoZGlhbG9nWSA8IDApXHJcbiAgICAgICAgICAgIGRpYWxvZ1kgPSAwO1xyXG5cclxuICAgICAgICAvLyBBZGp1c3QgaWYgdmVydGljYWxseSBvZmYgc2NyZWVuXHJcbiAgICAgICAgZWxzZSBpZiAoZGlhbG9nWSArIHRoaXMuZG9tLm9mZnNldEhlaWdodCA+IGRvY0gpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBkaWFsb2dZID0gKHRhcmdldFJlY3QudG9wIHwgMCkgLSB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgKyAxO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LmFkZCgnYmVsb3cnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2Fib3ZlJyk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBzdGlsbCBvZmYtc2NyZWVuLCBjbGFtcCB0byBib3R0b21cclxuICAgICAgICAgICAgaWYgKGRpYWxvZ1kgKyB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgPiBkb2NIKVxyXG4gICAgICAgICAgICAgICAgZGlhbG9nWSA9IGRvY0ggLSB0aGlzLmRvbS5vZmZzZXRIZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICAvLyBDbGFtcCB0byB0b3AgZWRnZSBvZiBkb2N1bWVudC4gTGlrZWx5IGhhcHBlbnMgaWYgdGFyZ2V0IGVsZW1lbnQgaXMgbGFyZ2UuXHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dZIDwgMClcclxuICAgICAgICAgICAgICAgIGRpYWxvZ1kgPSAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcuY2xhc3NMaXN0LmFkZCgnYWJvdmUnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2JlbG93Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmRvbS5zdHlsZS5sZWZ0ID0gKGZ1bGxXaWR0aCA/IDAgOiBkaWFsb2dYKSArICdweCc7XHJcbiAgICAgICAgdGhpcy5kb20uc3R5bGUudG9wICA9IGRpYWxvZ1kgKyAncHgnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXR1cm5zIHRydWUgaWYgYW4gZWxlbWVudCBpbiB0aGlzIHBpY2tlciBjdXJyZW50bHkgaGFzIGZvY3VzICovXHJcbiAgICBwdWJsaWMgaGFzRm9jdXMoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kb20uY29udGFpbnMoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGNvYWNoIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgQ29hY2hQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGxldHRlciBkcm9wLWRvd24gaW5wdXQgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExldHRlciA6IEhUTUxTZWxlY3RFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgY29hY2ggZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ2NvYWNoJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIgPSBET00ucmVxdWlyZSgnc2VsZWN0JywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDI2OyBpKyspXHJcbiAgICAgICAgICAgIERPTS5hZGRPcHRpb24odGhpcy5pbnB1dExldHRlciwgTC5MRVRURVJTW2ldLCBMLkxFVFRFUlNbaV0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgdGFyZ2V0IGNvbnRleHQncyBjb2FjaCBsZXR0ZXIgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9DT0FDSCh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gUkFHLnN0YXRlLmdldENvYWNoKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBjb2FjaCBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX0NPQUNIX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0Q29hY2godGhpcy5jdXJyZW50Q3R4LCB0aGlzLmlucHV0TGV0dGVyLnZhbHVlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9Y29hY2hdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5pbnB1dExldHRlci52YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBleGN1c2UgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBFeGN1c2VQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdleGN1c2UnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfRVhDVVNFKCk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5leGN1c2VzLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIGV4Y3VzZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBleGN1c2VcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KFJBRy5zdGF0ZS5leGN1c2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgZXhjdXNlIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlLmV4Y3VzZSA9IGVudHJ5LmlubmVyVGV4dDtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCgnZXhjdXNlJywgUkFHLnN0YXRlLmV4Y3VzZSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGludGVnZXIgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBJbnRlZ2VyUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBudW1lcmljYWwgaW5wdXQgc3Bpbm5lciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dERpZ2l0IDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBvcHRpb25hbCBzdWZmaXggbGFiZWwgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tTGFiZWwgICA6IEhUTUxMYWJlbEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSBjb250ZXh0IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHg/IDogc3RyaW5nO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvcHRpb25hbCBzaW5ndWxhciBzdWZmaXggZm9yIHRoZSBjdXJyZW50IGludGVnZXIgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHNpbmd1bGFyPyAgIDogc3RyaW5nO1xyXG4gICAgLyoqIEhvbGRzIHRoZSBvcHRpb25hbCBwbHVyYWwgc3VmZml4IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBwbHVyYWw/ICAgICA6IHN0cmluZztcclxuICAgIC8qKiBXaGV0aGVyIHRoZSBjdXJyZW50IGludGVnZXIgYmVpbmcgZWRpdGVkIHdhbnRzIHdvcmQgZGlnaXRzICovXHJcbiAgICBwcml2YXRlIHdvcmRzPyAgICAgIDogYm9vbGVhbjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdpbnRlZ2VyJyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdCA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUxhYmVsICAgPSBET00ucmVxdWlyZSgnbGFiZWwnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIC8vIGlPUyBuZWVkcyBkaWZmZXJlbnQgdHlwZSBhbmQgcGF0dGVybiB0byBzaG93IGEgbnVtZXJpY2FsIGtleWJvYXJkXHJcbiAgICAgICAgaWYgKERPTS5pc2lPUylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC50eXBlICAgID0gJ3RlbCc7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXREaWdpdC5wYXR0ZXJuID0gJ1swLTldKyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGZvcm0gd2l0aCB0aGUgdGFyZ2V0IGNvbnRleHQncyBpbnRlZ2VyIGRhdGEgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLnNpbmd1bGFyICAgPSB0YXJnZXQuZGF0YXNldFsnc2luZ3VsYXInXTtcclxuICAgICAgICB0aGlzLnBsdXJhbCAgICAgPSB0YXJnZXQuZGF0YXNldFsncGx1cmFsJ107XHJcbiAgICAgICAgdGhpcy53b3JkcyAgICAgID0gUGFyc2UuYm9vbGVhbih0YXJnZXQuZGF0YXNldFsnd29yZHMnXSB8fCAnZmFsc2UnKTtcclxuXHJcbiAgICAgICAgbGV0IHZhbHVlID0gUkFHLnN0YXRlLmdldEludGVnZXIodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgaWYgICAgICAodGhpcy5zaW5ndWxhciAmJiB2YWx1ZSA9PT0gMSlcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnNpbmd1bGFyO1xyXG4gICAgICAgIGVsc2UgaWYgKHRoaXMucGx1cmFsICYmIHZhbHVlICE9PSAxKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMucGx1cmFsO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSAnJztcclxuXHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfSU5URUdFUih0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC52YWx1ZSAgICA9IHZhbHVlLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIGludGVnZXIgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9JTlRfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIC8vIENhbid0IHVzZSB2YWx1ZUFzTnVtYmVyIGR1ZSB0byBpT1MgaW5wdXQgdHlwZSB3b3JrYXJvdW5kc1xyXG4gICAgICAgIGxldCBpbnQgICAgPSBwYXJzZUludCh0aGlzLmlucHV0RGlnaXQudmFsdWUpO1xyXG4gICAgICAgIGxldCBpbnRTdHIgPSAodGhpcy53b3JkcylcclxuICAgICAgICAgICAgPyBMLkRJR0lUU1tpbnRdIHx8IGludC50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogaW50LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBpbnZhbGlkIHZhbHVlc1xyXG4gICAgICAgIGlmICggaXNOYU4oaW50KSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSAnJztcclxuXHJcbiAgICAgICAgaWYgKGludCA9PT0gMSAmJiB0aGlzLnNpbmd1bGFyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHt0aGlzLnNpbmd1bGFyfWA7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5zaW5ndWxhcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHRoaXMucGx1cmFsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHt0aGlzLnBsdXJhbH1gO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMucGx1cmFsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldEludGVnZXIodGhpcy5jdXJyZW50Q3R4LCBpbnQpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1pbnRlZ2VyXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IGludFN0cik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBuYW1lZCB0cmFpbiBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIE5hbWVkUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignbmFtZWQnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfTkFNRUQoKTtcclxuXHJcbiAgICAgICAgUkFHLmRhdGFiYXNlLm5hbWVkLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIG5hbWVkIHRyYWluICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIC8vIFByZS1zZWxlY3QgdGhlIGN1cnJlbnRseSB1c2VkIG5hbWVcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KFJBRy5zdGF0ZS5uYW1lZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBuYW1lZCBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5uYW1lZCA9IGVudHJ5LmlubmVyVGV4dDtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCgnbmFtZWQnLCBSQUcuc3RhdGUubmFtZWQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBwaHJhc2VzZXQgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBQaHJhc2VzZXRQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIHJlZmVyZW5jZSB0YWcgZm9yIHRoZSBjdXJyZW50IHBocmFzZXNldCBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50UmVmPyA6IHN0cmluZztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdwaHJhc2VzZXQnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgY2hvb3NlciB3aXRoIHRoZSBjdXJyZW50IHBocmFzZXNldCdzIGxpc3Qgb2YgcGhyYXNlcyAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICBsZXQgcmVmID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBpZHggPSBwYXJzZUludCggRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2lkeCcpICk7XHJcblxyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZik7XHJcblxyXG4gICAgICAgIGlmICghcGhyYXNlc2V0KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1BTRVRfVU5LTk9XTihyZWYpICk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFJlZiAgICAgICAgICA9IHJlZjtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9QSFJBU0VTRVQocmVmKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLmNsZWFyKCk7XHJcblxyXG4gICAgICAgIC8vIEZvciBlYWNoIHBocmFzZSwgd2UgbmVlZCB0byBydW4gaXQgdGhyb3VnaCB0aGUgcGhyYXNlciB1c2luZyB0aGUgY3VycmVudCBzdGF0ZVxyXG4gICAgICAgIC8vIHRvIGdlbmVyYXRlIFwicHJldmlld3NcIiBvZiBob3cgdGhlIHBocmFzZSB3aWxsIGxvb2suXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaHJhc2VzZXQuY2hpbGRyZW4ubGVuZ3RoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcGhyYXNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGQnKTtcclxuXHJcbiAgICAgICAgICAgIERPTS5jbG9uZUludG8ocGhyYXNlc2V0LmNoaWxkcmVuW2ldIGFzIEhUTUxFbGVtZW50LCBwaHJhc2UpO1xyXG4gICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKHBocmFzZSk7XHJcblxyXG4gICAgICAgICAgICBwaHJhc2UuaW5uZXJUZXh0ICAgPSBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHBocmFzZSk7XHJcbiAgICAgICAgICAgIHBocmFzZS5kYXRhc2V0LmlkeCA9IGkudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5hZGRSYXcocGhyYXNlLCBpID09PSBpZHgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHBocmFzZXNldCBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UmVmKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1BTRVRfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIGxldCBpZHggPSBwYXJzZUludChlbnRyeS5kYXRhc2V0WydpZHgnXSEpO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0UGhyYXNlc2V0SWR4KHRoaXMuY3VycmVudFJlZiwgaWR4KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5yZWZyZXNoUGhyYXNlc2V0KHRoaXMuY3VycmVudFJlZik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBsYXRmb3JtIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgUGxhdGZvcm1QaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIG51bWVyaWNhbCBpbnB1dCBzcGlubmVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0RGlnaXQgIDogSFRNTElucHV0RWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBsZXR0ZXIgZHJvcC1kb3duIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMZXR0ZXIgOiBIVE1MU2VsZWN0RWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdwbGF0Zm9ybScpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQgICAgICAgICAgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlciAgICAgICAgID0gRE9NLnJlcXVpcmUoJ3NlbGVjdCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9QTEFURk9STSgpO1xyXG5cclxuICAgICAgICAvLyBpT1MgbmVlZHMgZGlmZmVyZW50IHR5cGUgYW5kIHBhdHRlcm4gdG8gc2hvdyBhIG51bWVyaWNhbCBrZXlib2FyZFxyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQudHlwZSAgICA9ICd0ZWwnO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQucGF0dGVybiA9ICdbMC05XSsnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBwbGF0Zm9ybSBkYXRhICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIGxldCB2YWx1ZSA9IFJBRy5zdGF0ZS5wbGF0Zm9ybTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnZhbHVlICA9IHZhbHVlWzBdO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUgPSB2YWx1ZVsxXTtcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgcGxhdGZvcm0gZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBJZ25vcmUgaW52YWxpZCB2YWx1ZXNcclxuICAgICAgICBpZiAoIGlzTmFOKCBwYXJzZUludCh0aGlzLmlucHV0RGlnaXQudmFsdWUpICkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5wbGF0Zm9ybSA9IFt0aGlzLmlucHV0RGlnaXQudmFsdWUsIHRoaXMuaW5wdXRMZXR0ZXIudmFsdWVdO1xyXG5cclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLnNldEVsZW1lbnRzVGV4dCggJ3BsYXRmb3JtJywgUkFHLnN0YXRlLnBsYXRmb3JtLmpvaW4oJycpICk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzZXJ2aWNlIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU2VydmljZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgc2VydmljZSBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignc2VydmljZScpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUNob29zZXIgICAgICAgICAgPSBuZXcgQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vblNlbGVjdCA9IGUgPT4gdGhpcy5vblNlbGVjdChlKTtcclxuXHJcbiAgICAgICAgUkFHLmRhdGFiYXNlLnNlcnZpY2VzLmZvckVhY2goIHYgPT4gdGhpcy5kb21DaG9vc2VyLmFkZCh2KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBzdGF0ZSdzIHNlcnZpY2UgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ICAgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TRVJWSUNFKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIC8vIFByZS1zZWxlY3QgdGhlIGN1cnJlbnRseSB1c2VkIHNlcnZpY2VcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIucHJlc2VsZWN0KCBSQUcuc3RhdGUuZ2V0U2VydmljZSh0aGlzLmN1cnJlbnRDdHgpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBzZXJ2aWNlIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0KGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfU0VSVklDRV9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFNlcnZpY2UodGhpcy5jdXJyZW50Q3R4LCBlbnRyeS5pbm5lclRleHQpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT1zZXJ2aWNlXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IGVudHJ5LmlubmVyVGV4dCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHN0YXRpb24gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTdGF0aW9uUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBzaGFyZWQgc3RhdGlvbiBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgY2hvb3NlciA6IFN0YXRpb25DaG9vc2VyO1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgc3RhdGlvbiBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuICAgIC8qKiBIb2xkcyB0aGUgb25PcGVuIGRlbGVnYXRlIGZvciBTdGF0aW9uUGlja2VyIG9yIGZvciBTdGF0aW9uTGlzdFBpY2tlciAqL1xyXG4gICAgcHJvdGVjdGVkIG9uT3BlbiAgICAgOiAodGFyZ2V0OiBIVE1MRWxlbWVudCkgPT4gdm9pZDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IodGFnOiBzdHJpbmcgPSAnc3RhdGlvbicpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIodGFnKTtcclxuXHJcbiAgICAgICAgaWYgKCFTdGF0aW9uUGlja2VyLmNob29zZXIpXHJcbiAgICAgICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3NlciA9IG5ldyBTdGF0aW9uQ2hvb3Nlcih0aGlzLmRvbUZvcm0pO1xyXG5cclxuICAgICAgICB0aGlzLm9uT3BlbiA9IHRoaXMub25TdGF0aW9uUGlja2VyT3Blbi5iaW5kKHRoaXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaXJlcyB0aGUgb25PcGVuIGRlbGVnYXRlIHJlZ2lzdGVyZWQgZm9yIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcbiAgICAgICAgdGhpcy5vbk9wZW4odGFyZ2V0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQXR0YWNoZXMgdGhlIHN0YXRpb24gY2hvb3NlciBhbmQgZm9jdXNlcyBpdCBvbnRvIHRoZSBjdXJyZW50IGVsZW1lbnQncyBzdGF0aW9uICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdGF0aW9uUGlja2VyT3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgY2hvb3NlciAgICAgPSBTdGF0aW9uUGlja2VyLmNob29zZXI7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q3R4ID0gRE9NLnJlcXVpcmVEYXRhKHRhcmdldCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY2hvb3Nlci5hdHRhY2godGhpcywgdGhpcy5vblNlbGVjdFN0YXRpb24pO1xyXG4gICAgICAgIGNob29zZXIucHJlc2VsZWN0Q29kZSggUkFHLnN0YXRlLmdldFN0YXRpb24odGhpcy5jdXJyZW50Q3R4KSApO1xyXG4gICAgICAgIGNob29zZXIuc2VsZWN0T25DbGljayA9IHRydWU7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NUQVRJT04odGhpcy5jdXJyZW50Q3R4KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgc3RhdGlvbiBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyBTdGF0aW9uUGlja2VyLmNob29zZXIub25DbGljayhldik7IH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyBTdGF0aW9uUGlja2VyLmNob29zZXIub25JbnB1dChldik7IH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyBTdGF0aW9uUGlja2VyLmNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIHN0YXRpb24gZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3RTdGF0aW9uKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ID0gYFtkYXRhLXR5cGU9c3RhdGlvbl1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gO1xyXG4gICAgICAgIGxldCBjb2RlICA9IGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSE7XHJcbiAgICAgICAgbGV0IG5hbWUgID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTdGF0aW9uKHRoaXMuY3VycmVudEN0eCwgY29kZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KHF1ZXJ5KVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBuYW1lKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInN0YXRpb25QaWNrZXIudHNcIi8+XHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi8uLi92ZW5kb3IvZHJhZ2dhYmxlLmQudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHN0YXRpb24gbGlzdCBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFN0YXRpb25MaXN0UGlja2VyIGV4dGVuZHMgU3RhdGlvblBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY29udGFpbmVyIGZvciB0aGUgbGlzdCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUxpc3QgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbW9iaWxlLW9ubHkgYWRkIHN0YXRpb24gYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkFkZCAgICAgICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbW9iaWxlLW9ubHkgY2xvc2UgcGlja2VyIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5DbG9zZSAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGRyb3Agem9uZSBmb3IgZGVsZXRpbmcgc3RhdGlvbiBlbGVtZW50cyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21EZWwgICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGFjdHVhbCBzb3J0YWJsZSBsaXN0IG9mIHN0YXRpb25zICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGlzdCAgICA6IEhUTUxETGlzdEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHBsYWNlaG9sZGVyIHNob3duIGlmIHRoZSBsaXN0IGlzIGVtcHR5ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUVtcHR5TGlzdCA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoXCJzdGF0aW9ubGlzdFwiKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21MaXN0ICAgICAgPSBET00ucmVxdWlyZSgnLnN0YXRpb25MaXN0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuYnRuQWRkICAgICAgID0gRE9NLnJlcXVpcmUoJy5hZGRTdGF0aW9uJywgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5idG5DbG9zZSAgICAgPSBET00ucmVxdWlyZSgnLmNsb3NlUGlja2VyJywgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmRvbURlbCAgICAgICA9IERPTS5yZXF1aXJlKCcuZGVsU3RhdGlvbicsICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0ICAgID0gRE9NLnJlcXVpcmUoJ2RsJywgICAgICAgICAgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QgPSBET00ucmVxdWlyZSgncCcsICAgICAgICAgICAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLm9uT3BlbiAgICAgICA9IHRoaXMub25TdGF0aW9uTGlzdFBpY2tlck9wZW4uYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgbmV3IERyYWdnYWJsZS5Tb3J0YWJsZShbdGhpcy5pbnB1dExpc3QsIHRoaXMuZG9tRGVsXSwgeyBkcmFnZ2FibGU6ICdkZCcgfSlcclxuICAgICAgICAgICAgLy8gSGF2ZSB0byB1c2UgdGltZW91dCwgdG8gbGV0IERyYWdnYWJsZSBmaW5pc2ggc29ydGluZyB0aGUgbGlzdFxyXG4gICAgICAgICAgICAub24oICdkcmFnOnN0b3AnLCBldiA9PiBzZXRUaW1lb3V0KCgpID0+IHRoaXMub25EcmFnU3RvcChldiksIDEpIClcclxuICAgICAgICAgICAgLm9uKCAnbWlycm9yOmNyZWF0ZScsIHRoaXMub25EcmFnTWlycm9yQ3JlYXRlLmJpbmQodGhpcykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBvcHVsYXRlcyB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIsIHdpdGggdGhlIHNlbGVjdGVkIGxpc3QuIEJlY2F1c2UgdGhpcyBwaWNrZXJcclxuICAgICAqIGV4dGVuZHMgZnJvbSBTdGF0aW9uTGlzdCwgdGhpcyBoYW5kbGVyIG92ZXJyaWRlcyB0aGUgJ29uT3BlbicgZGVsZWdhdGUgcHJvcGVydHlcclxuICAgICAqIG9mIFN0YXRpb25MaXN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgU3RhdGlvbiBsaXN0IGVkaXRvciBlbGVtZW50IHRvIG9wZW4gZm9yXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvblN0YXRpb25MaXN0UGlja2VyT3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTaW5jZSB3ZSBzaGFyZSB0aGUgc3RhdGlvbiBwaWNrZXIgd2l0aCBTdGF0aW9uTGlzdCwgZ3JhYiBpdFxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5hdHRhY2godGhpcywgdGhpcy5vbkFkZFN0YXRpb24pO1xyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5zZWxlY3RPbkNsaWNrID0gZmFsc2U7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IGVudHJpZXMgICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KHRoaXMuY3VycmVudEN0eCkuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU1RBVElPTkxJU1QodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgLy8gUmVtb3ZlIGFsbCBvbGQgbGlzdCBlbGVtZW50c1xyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0LmlubmVySFRNTCA9ICcnO1xyXG5cclxuICAgICAgICAvLyBGaW5hbGx5LCBwb3B1bGF0ZSBsaXN0IGZyb20gdGhlIGNsaWNrZWQgc3RhdGlvbiBsaXN0IGVsZW1lbnRcclxuICAgICAgICBlbnRyaWVzLmZvckVhY2goIHYgPT4gdGhpcy5hZGQodikgKTtcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWQgeyBzdXBlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBwaWNrZXJzJyBjbGljayBldmVudHMsIGZvciBjaG9vc2luZyBpdGVtcyAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9uQ2xpY2soZXYpO1xyXG5cclxuICAgICAgICBpZiAoZXYudGFyZ2V0ID09PSB0aGlzLmJ0bkNsb3NlKVxyXG4gICAgICAgICAgICBSQUcudmlld3MuZWRpdG9yLmNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgLy8gRm9yIG1vYmlsZSB1c2Vycywgc3dpdGNoIHRvIHN0YXRpb24gY2hvb3NlciBzY3JlZW4gaWYgXCJBZGQuLi5cIiB3YXMgY2xpY2tlZFxyXG4gICAgICAgIGlmIChldi50YXJnZXQgPT09IHRoaXMuYnRuQWRkKVxyXG4gICAgICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QuYWRkKCdhZGRpbmdTdGF0aW9uJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMga2V5Ym9hcmQgbmF2aWdhdGlvbiBmb3IgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyICovXHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub25JbnB1dChldik7XHJcblxyXG4gICAgICAgIGxldCBrZXkgICAgID0gZXYua2V5O1xyXG4gICAgICAgIGxldCBmb2N1c2VkID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgLy8gT25seSBoYW5kbGUgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyIGNvbnRyb2xcclxuICAgICAgICBpZiAoICFmb2N1c2VkIHx8ICF0aGlzLmlucHV0TGlzdC5jb250YWlucyhmb2N1c2VkKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGtleWJvYXJkIG5hdmlnYXRpb25cclxuICAgICAgICBpZiAoa2V5ID09PSAnQXJyb3dMZWZ0JyB8fCBrZXkgPT09ICdBcnJvd1JpZ2h0JylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBkaXIgPSAoa2V5ID09PSAnQXJyb3dMZWZ0JykgPyAtMSA6IDE7XHJcbiAgICAgICAgICAgIGxldCBuYXYgPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gZm9jdXNlZCBlbGVtZW50XHJcbiAgICAgICAgICAgIGlmIChmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRMaXN0KVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxldmFudCB0byBiZWdpbm5pbmcgb3IgZW5kIG9mIGNvbnRhaW5lclxyXG4gICAgICAgICAgICBlbHNlIGlmIChkaXIgPT09IC0xKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmxhc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBpZiAobmF2KSBuYXYuZm9jdXMoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBlbnRyeSBkZWxldGlvblxyXG4gICAgICAgIGlmIChrZXkgPT09ICdEZWxldGUnIHx8IGtleSA9PT0gJ0JhY2tzcGFjZScpXHJcbiAgICAgICAgaWYgKGZvY3VzZWQucGFyZW50RWxlbWVudCA9PT0gdGhpcy5pbnB1dExpc3QpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBGb2N1cyBvbiBuZXh0IGVsZW1lbnQgb3IgcGFyZW50IG9uIGRlbGV0ZVxyXG4gICAgICAgICAgICBsZXQgbmV4dCA9IGZvY3VzZWQucHJldmlvdXNFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IGZvY3VzZWQubmV4dEVsZW1lbnRTaWJsaW5nICAgICBhcyBIVE1MRWxlbWVudFxyXG4gICAgICAgICAgICAgICAgICAgIHx8IHRoaXMuaW5wdXRMaXN0O1xyXG5cclxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZm9jdXNlZCk7XHJcbiAgICAgICAgICAgIG5leHQuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXIgZm9yIHdoZW4gYSBzdGF0aW9uIGlzIGNob3NlbiAqL1xyXG4gICAgcHJpdmF0ZSBvbkFkZFN0YXRpb24oZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgbmV3RW50cnkgPSB0aGlzLmFkZChlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuXHJcbiAgICAgICAgLy8gU3dpdGNoIGJhY2sgdG8gYnVpbGRlciBzY3JlZW4sIGlmIG9uIG1vYmlsZVxyXG4gICAgICAgIHRoaXMuZG9tLmNsYXNzTGlzdC5yZW1vdmUoJ2FkZGluZ1N0YXRpb24nKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG5cclxuICAgICAgICAvLyBGb2N1cyBvbmx5IGlmIG9uIG1vYmlsZSwgc2luY2UgdGhlIHN0YXRpb24gbGlzdCBpcyBvbiBhIGRlZGljYXRlZCBzY3JlZW5cclxuICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKVxyXG4gICAgICAgICAgICBuZXdFbnRyeS5kb20uZm9jdXMoKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIG5ld0VudHJ5LmRvbS5zY3JvbGxJbnRvVmlldygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaXhlcyBtaXJyb3JzIG5vdCBoYXZpbmcgY29ycmVjdCB3aWR0aCBvZiB0aGUgc291cmNlIGVsZW1lbnQsIG9uIGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvbkRyYWdNaXJyb3JDcmVhdGUoZXY6IERyYWdnYWJsZS5EcmFnRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghZXYuZGF0YS5zb3VyY2UgfHwgIWV2LmRhdGEub3JpZ2luYWxTb3VyY2UpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfU0xfRFJBR19NSVNTSU5HKCkgKTtcclxuXHJcbiAgICAgICAgZXYuZGF0YS5zb3VyY2Uuc3R5bGUud2lkdGggPSBldi5kYXRhLm9yaWdpbmFsU291cmNlLmNsaWVudFdpZHRoICsgJ3B4JztcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBkcmFnZ2FibGUgc3RhdGlvbiBuYW1lIGJlaW5nIGRyb3BwZWQgKi9cclxuICAgIHByaXZhdGUgb25EcmFnU3RvcChldjogRHJhZ2dhYmxlLkRyYWdFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFldi5kYXRhLm9yaWdpbmFsU291cmNlKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmIChldi5kYXRhLm9yaWdpbmFsU291cmNlLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuZG9tRGVsKVxyXG4gICAgICAgICAgICB0aGlzLnJlbW92ZShldi5kYXRhLm9yaWdpbmFsU291cmNlKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGFuZCBhZGRzIGEgbmV3IGVudHJ5IGZvciB0aGUgYnVpbGRlciBsaXN0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb2RlIFRocmVlLWxldHRlciBzdGF0aW9uIGNvZGUgdG8gY3JlYXRlIGFuIGl0ZW0gZm9yXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYWRkKGNvZGU6IHN0cmluZykgOiBTdGF0aW9uTGlzdEl0ZW1cclxuICAgIHtcclxuICAgICAgICBsZXQgbmV3RW50cnkgPSBuZXcgU3RhdGlvbkxpc3RJdGVtKGNvZGUpO1xyXG5cclxuICAgICAgICAvLyBBZGQgdGhlIG5ldyBlbnRyeSB0byB0aGUgc29ydGFibGUgbGlzdFxyXG4gICAgICAgIHRoaXMuaW5wdXRMaXN0LmFwcGVuZENoaWxkKG5ld0VudHJ5LmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QuaGlkZGVuID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gRGlzYWJsZSB0aGUgYWRkZWQgc3RhdGlvbiBpbiB0aGUgY2hvb3NlclxyXG4gICAgICAgIFN0YXRpb25QaWNrZXIuY2hvb3Nlci5kaXNhYmxlKGNvZGUpO1xyXG5cclxuICAgICAgICAvLyBEZWxldGUgaXRlbSBvbiBkb3VibGUgY2xpY2tcclxuICAgICAgICBuZXdFbnRyeS5kb20ub25kYmxjbGljayA9IF8gPT4gdGhpcy5yZW1vdmUobmV3RW50cnkuZG9tKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIG5ld0VudHJ5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVtb3ZlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBlbnRyeSBlbGVtZW50IGZyb20gdGhlIGJ1aWxkZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVudHJ5IEVsZW1lbnQgb2YgdGhlIHN0YXRpb24gZW50cnkgdG8gcmVtb3ZlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcmVtb3ZlKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhdGhpcy5kb21MaXN0LmNvbnRhaW5zKGVudHJ5KSApXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdBdHRlbXB0ZWQgdG8gcmVtb3ZlIGVudHJ5IG5vdCBvbiBzdGF0aW9uIGxpc3QgYnVpbGRlcicpO1xyXG5cclxuICAgICAgICAvLyBFbmFibGVkIHRoZSByZW1vdmVkIHN0YXRpb24gaW4gdGhlIGNob29zZXJcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuZW5hYmxlKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG5cclxuICAgICAgICBlbnRyeS5yZW1vdmUoKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5pbnB1dExpc3QuY2hpbGRyZW4ubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICB0aGlzLmRvbUVtcHR5TGlzdC5oaWRkZW4gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgc3RhdGlvbiBsaXN0IGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNoaWxkcmVuID0gdGhpcy5pbnB1dExpc3QuY2hpbGRyZW47XHJcblxyXG4gICAgICAgIC8vIERvbid0IHVwZGF0ZSBpZiBsaXN0IGlzIGVtcHR5XHJcbiAgICAgICAgaWYgKGNoaWxkcmVuLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgbGlzdCA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVudHJ5ID0gY2hpbGRyZW5baV0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICBsaXN0LnB1c2goZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgdGV4dExpc3QgPSBTdHJpbmdzLmZyb21TdGF0aW9uTGlzdChsaXN0LnNsaWNlKCksIHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ICAgID0gYFtkYXRhLXR5cGU9c3RhdGlvbmxpc3RdW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYDtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFN0YXRpb25MaXN0KHRoaXMuY3VycmVudEN0eCwgbGlzdCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KHF1ZXJ5KVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0ZXh0TGlzdCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHRpbWUgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBUaW1lUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyB0aW1lIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRUaW1lOiBIVE1MSW5wdXRFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgdGltZSBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigndGltZScpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0VGltZSA9IERPTS5yZXF1aXJlKCdpbnB1dCcsIHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyB0aW1lICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfVElNRSh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0VGltZS52YWx1ZSA9IFJBRy5zdGF0ZS5nZXRUaW1lKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgdGltZSBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1RJTUVfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRUaW1lKHRoaXMuY3VycmVudEN0eCwgdGhpcy5pbnB1dFRpbWUudmFsdWUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT10aW1lXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuaW5wdXRUaW1lLnZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhfOiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChfOiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyAvKiBuby1vcCAqLyB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBCYXNlIGNsYXNzIGZvciBjb25maWd1cmF0aW9uIG9iamVjdHMsIHRoYXQgY2FuIHNhdmUsIGxvYWQsIGFuZCByZXNldCB0aGVtc2VsdmVzICovXHJcbmFic3RyYWN0IGNsYXNzIENvbmZpZ0Jhc2U8VCBleHRlbmRzIENvbmZpZ0Jhc2U8VD4+XHJcbntcclxuICAgIC8qKiBsb2NhbFN0b3JhZ2Uga2V5IHdoZXJlIGNvbmZpZyBpcyBleHBlY3RlZCB0byBiZSBzdG9yZWQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFVFRJTkdTX0tFWSA6IHN0cmluZyA9ICdzZXR0aW5ncyc7XHJcblxyXG4gICAgLyoqIFByb3RvdHlwZSBvYmplY3QgZm9yIGNyZWF0aW5nIG5ldyBjb3BpZXMgb2Ygc2VsZiAqL1xyXG4gICAgcHJpdmF0ZSB0eXBlIDogKG5ldyAoKSA9PiBUKTtcclxuXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3IoIHR5cGU6IChuZXcgKCkgPT4gVCkgKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMudHlwZSA9IHR5cGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNhZmVseSBsb2FkcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gZnJvbSBsb2NhbFN0b3JhZ2UsIGlmIGFueSAqL1xyXG4gICAgcHVibGljIGxvYWQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgc2V0dGluZ3MgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oQ29uZmlnQmFzZS5TRVRUSU5HU19LRVkpO1xyXG5cclxuICAgICAgICBpZiAoIXNldHRpbmdzKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGNvbmZpZyA9IEpTT04ucGFyc2Uoc2V0dGluZ3MpO1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIGNvbmZpZyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfTE9BRF9GQUlMKGVyci5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgc2F2ZXMgdGhpcyBjb25maWd1cmF0aW9uIHRvIGxvY2FsU3RvcmFnZSAqL1xyXG4gICAgcHVibGljIHNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSggQ29uZmlnQmFzZS5TRVRUSU5HU19LRVksIEpTT04uc3RyaW5naWZ5KHRoaXMpICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfU0FWRV9GQUlMKGVyci5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgZGVsZXRlcyB0aGlzIGNvbmZpZ3VyYXRpb24gZnJvbSBsb2NhbFN0b3JhZ2UgYW5kIHJlc2V0cyBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKCB0aGlzLCBuZXcgdGhpcy50eXBlKCkgKTtcclxuICAgICAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKENvbmZpZ0Jhc2UuU0VUVElOR1NfS0VZKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGVycilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGFsZXJ0KCBMLkNPTkZJR19SRVNFVF9GQUlMKGVyci5tZXNzYWdlKSApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXG5cbi8vLzxyZWZlcmVuY2UgcGF0aD1cImNvbmZpZ0Jhc2UudHNcIi8+XG5cbi8qKiBIb2xkcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gZm9yIFJBRyAqL1xuY2xhc3MgQ29uZmlnIGV4dGVuZHMgQ29uZmlnQmFzZTxDb25maWc+XG57XG4gICAgLyoqIElmIHVzZXIgaGFzIGNsaWNrZWQgc2h1ZmZsZSBhdCBsZWFzdCBvbmNlICovXG4gICAgcHVibGljIGNsaWNrZWRHZW5lcmF0ZSA6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICAvKiogSWYgdXNlciBoYXMgcmVhZCB0aGUgZGlzY2xhaW1lciAqL1xuICAgIHB1YmxpYyByZWFkRGlzY2xhaW1lciAgOiBib29sZWFuID0gZmFsc2U7XG4gICAgLyoqIFZvbHVtZSBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xuICAgIHB1YmxpYyBzcGVlY2hWb2wgICAgICAgOiBudW1iZXIgID0gMS4wO1xuICAgIC8qKiBQaXRjaCBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xuICAgIHB1YmxpYyBzcGVlY2hQaXRjaCAgICAgOiBudW1iZXIgID0gMS4wO1xuICAgIC8qKiBSYXRlIGZvciBzcGVlY2ggdG8gYmUgc2V0IGF0ICovXG4gICAgcHVibGljIHNwZWVjaFJhdGUgICAgICA6IG51bWJlciAgPSAxLjA7XG4gICAgLyoqIFZPWCBrZXkgb2YgdGhlIGNoaW1lIHRvIHVzZSBwcmlvciB0byBzcGVha2luZyAqL1xuICAgIHB1YmxpYyB2b3hDaGltZSAgICAgICAgOiBzdHJpbmcgID0gJyc7XG4gICAgLyoqIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCBvZiB0aGUgY3VzdG9tIFZPWCB2b2ljZSB0byB1c2UgKi9cbiAgICBwdWJsaWMgdm94Q3VzdG9tUGF0aCAgIDogc3RyaW5nICA9ICcnO1xuICAgIC8qKiBXaGV0aGVyIHRvIHVzZSB0aGUgVk9YIGVuZ2luZSAqL1xuICAgIHB1YmxpYyB2b3hFbmFibGVkICAgICAgOiBib29sZWFuID0gdHJ1ZTtcbiAgICAvKiogUmVsYXRpdmUgb3IgYWJzb2x1dGUgVVJMIG9mIHRoZSBWT1ggdm9pY2UgdG8gdXNlICovXG4gICAgcHVibGljIHZveFBhdGggICAgICAgICA6IHN0cmluZyAgPSAnaHR0cHM6Ly9yb3ljdXJ0aXMuZ2l0aHViLmlvL1JBRy1WT1gtUm95JztcblxuICAgIC8qKiBDaG9pY2Ugb2Ygc3BlZWNoIHZvaWNlIHRvIHVzZSBhcyB2b2ljZSBuYW1lLCBvciAnJyBpZiB1bnNldCAqL1xuICAgIHByaXZhdGUgX3NwZWVjaFZvaWNlIDogc3RyaW5nID0gJyc7XG4gICAgLyoqIEltcHVsc2UgcmVzcG9uc2UgdG8gdXNlIGZvciBWT1gncyByZXZlcmIgKi9cbiAgICBwcml2YXRlIF92b3hSZXZlcmIgICA6IHN0cmluZyA9ICdpci5zdGFsYmFucy53YXYnO1xuXG4gICAgLyoqXG4gICAgICogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UsIGFzIGEgdm9pY2UgbmFtZS4gQmVjYXVzZSBvZiB0aGUgYXN5bmMgbmF0dXJlIG9mXG4gICAgICogZ2V0Vm9pY2VzLCB0aGUgZGVmYXVsdCB2YWx1ZSB3aWxsIGJlIGZldGNoZWQgZnJvbSBpdCBlYWNoIHRpbWUuXG4gICAgICovXG4gICAgZ2V0IHNwZWVjaFZvaWNlKCkgOiBzdHJpbmdcbiAgICB7XG4gICAgICAgIC8vIElmIHRoZXJlJ3MgYSB1c2VyLWRlZmluZWQgdmFsdWUsIHVzZSB0aGF0XG4gICAgICAgIGlmICh0aGlzLl9zcGVlY2hWb2ljZSAhPT0gJycpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3BlZWNoVm9pY2U7XG5cbiAgICAgICAgLy8gU2VsZWN0IEVuZ2xpc2ggdm9pY2VzIGJ5IGRlZmF1bHRcbiAgICAgICAgbGV0IHZvaWNlcyA9IFJBRy5zcGVlY2guYnJvd3NlclZvaWNlcztcblxuICAgICAgICBmb3IgKGxldCBuYW1lIGluIHZvaWNlcylcbiAgICAgICAgaWYgICh2b2ljZXNbbmFtZV0ubGFuZyA9PT0gJ2VuLUdCJyB8fCB2b2ljZXNbbmFtZV0ubGFuZyA9PT0gJ2VuLVVTJylcbiAgICAgICAgICAgIHJldHVybiBuYW1lO1xuXG4gICAgICAgIC8vIEVsc2UsIGZpcnN0IHZvaWNlIG9uIHRoZSBsaXN0XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyh2b2ljZXMpWzBdO1xuICAgIH1cblxuICAgIC8qKiBTZXRzIHRoZSBjaG9pY2Ugb2Ygc3BlZWNoIHRvIHVzZSwgYXMgdm9pY2UgbmFtZSAqL1xuICAgIHNldCBzcGVlY2hWb2ljZSh2YWx1ZTogc3RyaW5nKVxuICAgIHtcbiAgICAgICAgdGhpcy5fc3BlZWNoVm9pY2UgPSB2YWx1ZTtcbiAgICB9XG5cbiAgICAvKiogR2V0cyB0aGUgaW1wdWxzZSByZXNwb25zZSBmaWxlIHRvIHVzZSBmb3IgVk9YIGVuZ2luZSdzIHJldmVyYiAqL1xuICAgIGdldCB2b3hSZXZlcmIoKSA6IHN0cmluZ1xuICAgIHtcbiAgICAgICAgLy8gUmVzZXQgY2hvaWNlIG9mIHJldmVyYiBpZiBpdCdzIGludmFsaWRcbiAgICAgICAgbGV0IGNob2ljZXMgPSBPYmplY3Qua2V5cyhWb3hFbmdpbmUuUkVWRVJCUyk7XG5cbiAgICAgICAgaWYgKCAhY2hvaWNlcy5pbmNsdWRlcyh0aGlzLl92b3hSZXZlcmIpIClcbiAgICAgICAgICAgIHRoaXMuX3ZveFJldmVyYiA9IGNob2ljZXNbMF07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX3ZveFJldmVyYjtcbiAgICB9XG5cbiAgICAvKiogU2V0cyB0aGUgaW1wdWxzZSByZXNwb25zZSBmaWxlIHRvIHVzZSBmb3IgVk9YIGVuZ2luZSdzIHJldmVyYiAqL1xuICAgIHNldCB2b3hSZXZlcmIodmFsdWU6IHN0cmluZylcbiAgICB7XG4gICAgICAgIHRoaXMuX3ZveFJldmVyYiA9IHZhbHVlO1xuICAgIH1cblxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihhdXRvTG9hZDogYm9vbGVhbiA9IGZhbHNlKVxuICAgIHtcbiAgICAgICAgc3VwZXIoQ29uZmlnKTtcblxuICAgICAgICBpZiAoYXV0b0xvYWQpXG4gICAgICAgICAgICB0aGlzLmxvYWQoKTtcbiAgICB9XG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTGFuZ3VhZ2UgZW50cmllcyBhcmUgdGVtcGxhdGUgZGVsZWdhdGVzICovXHJcbnR5cGUgTGFuZ3VhZ2VFbnRyeSA9ICguLi5wYXJ0czogc3RyaW5nW10pID0+IHN0cmluZyA7XHJcblxyXG5hYnN0cmFjdCBjbGFzcyBCYXNlTGFuZ3VhZ2Vcclxue1xyXG4gICAgW2luZGV4OiBzdHJpbmddIDogTGFuZ3VhZ2VFbnRyeSB8IHN0cmluZyB8IHN0cmluZ1tdO1xyXG5cclxuICAgIC8vIFJBR1xyXG5cclxuICAgIC8qKiBXZWxjb21lIG1lc3NhZ2UsIHNob3duIG9uIG1hcnF1ZWUgb24gZmlyc3QgbG9hZCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgV0VMQ09NRSAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVxdWlyZWQgRE9NIGVsZW1lbnQgaXMgbWlzc2luZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRE9NX01JU1NJTkcgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVxdWlyZWQgZWxlbWVudCBhdHRyaWJ1dGUgaXMgbWlzc2luZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQVRUUl9NSVNTSU5HICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVxdWlyZWQgZGF0YXNldCBlbnRyeSBpcyBtaXNzaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQVRBX01JU1NJTkcgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBCYWQgZGlyZWN0aW9uIGFyZ3VtZW50IGdpdmVuIHRvIGRpcmVjdGlvbmFsIGZ1bmN0aW9uICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBCQURfRElSRUNUSU9OIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBCYWQgYm9vbGVhbiBzdHJpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEJBRF9CT09MRUFOICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFN0YXRlXHJcblxyXG4gICAgLyoqIFN0YXRlIHN1Y2Nlc3NmdWxseSBsb2FkZWQgZnJvbSBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9GUk9NX1NUT1JBR0UgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFN0YXRlIHN1Y2Nlc3NmdWxseSBzYXZlZCB0byBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9UT19TVE9SQUdFICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEluc3RydWN0aW9ucyBmb3IgY29weS9wYXN0aW5nIHNhdmVkIHN0YXRlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9DT1BZX1BBU1RFICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEhlYWRlciBmb3IgZHVtcGVkIHJhdyBzdGF0ZSBKU09OICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9SQVdfSlNPTiAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIENvdWxkIG5vdCBzYXZlIHN0YXRlIHRvIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUQVRFX1NBVkVfRkFJTCAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogTm8gc3RhdGUgd2FzIGF2YWlsYWJsZSB0byBsb2FkICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9TQVZFX01JU1NJTkcgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIE5vbi1leGlzdGVudCBwaHJhc2VzZXQgcmVmZXJlbmNlIHdoZW4gZ2V0dGluZyBmcm9tIHN0YXRlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9OT05FWElTVEFOVF9QSFJBU0VTRVQgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIENvbmZpZ1xyXG5cclxuICAgIC8qKiBDb25maWcgZmFpbGVkIHRvIGxvYWQgZnJvbSBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBDT05GSUdfTE9BRF9GQUlMICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQ29uZmlnIGZhaWxlZCB0byBzYXZlIHRvIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IENPTkZJR19TQVZFX0ZBSUwgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBDb25maWcgZmFpbGVkIHRvIGNsZWFyIGZyb20gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQ09ORklHX1JFU0VUX0ZBSUwgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIERhdGFiYXNlXHJcblxyXG4gICAgLyoqIEdpdmVuIGVsZW1lbnQgaXNuJ3QgYSBwaHJhc2VzZXQgaUZyYW1lICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBEQl9FTEVNRU5UX05PVF9QSFJBU0VTRVRfSUZSQU1FIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBVbmtub3duIHN0YXRpb24gY29kZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfVU5LTk9XTl9TVEFUSU9OICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU3RhdGlvbiBjb2RlIHdpdGggYmxhbmsgbmFtZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfRU1QVFlfU1RBVElPTiAgICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUGlja2luZyB0b28gbWFueSBzdGF0aW9uIGNvZGVzIGluIG9uZSBnbyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfVE9PX01BTllfU1RBVElPTlMgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gVG9vbGJhclxyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIHRleHQgZm9yIHRvb2xiYXIgYnV0dG9uc1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9QTEFZICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NUT1AgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU0hVRkZMRSAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TQVZFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX0xPQUQgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU0VUVElOR1MgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIEVkaXRvclxyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIHRleHQgZm9yIGVkaXRvciBlbGVtZW50c1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfQ09BQ0ggICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfRVhDVVNFICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfSU5URUdFUiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfTkFNRUQgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfT1BUX09QRU4gICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfT1BUX0NMT1NFICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfUEhSQVNFU0VUICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfUExBVEZPUk0gICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfU0VSVklDRSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfU1RBVElPTiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfU1RBVElPTkxJU1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVElUTEVfVElNRSAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8qKiBJbml0aWFsIG1lc3NhZ2Ugd2hlbiBzZXR0aW5nIHVwIGVkaXRvciAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX0lOSVQgICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXBsYWNlbWVudCB0ZXh0IGZvciB1bmtub3duIGVkaXRvciBlbGVtZW50cyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX1VOS05PV05fRUxFTUVOVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXBsYWNlbWVudCB0ZXh0IGZvciBlZGl0b3IgcGhyYXNlcyB3aXRoIHVua25vd24gcmVmZXJlbmNlIGlkcyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX1VOS05PV05fUEhSQVNFICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBSZXBsYWNlbWVudCB0ZXh0IGZvciBlZGl0b3IgcGhyYXNlc2V0cyB3aXRoIHVua25vd24gcmVmZXJlbmNlIGlkcyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgRURJVE9SX1VOS05PV05fUEhSQVNFU0VUIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBQaHJhc2VyXHJcblxyXG4gICAgLyoqIFRvbyBtYW55IGxldmVscyBvZiByZWN1cnNpb24gaW4gdGhlIHBocmFzZXIgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBIUkFTRVJfVE9PX1JFQ1VSU0lWRSA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gUGlja2Vyc1xyXG5cclxuICAgIC8vIEhlYWRlcnMgZm9yIHBpY2tlciBkaWFsb2dzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfQ09BQ0ggICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX0VYQ1VTRSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9JTlRFR0VSICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfTkFNRUQgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1BIUkFTRVNFVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9QTEFURk9STSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfU0VSVklDRSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1NUQVRJT04gICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9TVEFUSU9OTElTVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfVElNRSAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFRvb2x0aXBzL3RpdGxlIGFuZCBwbGFjZWhvbGRlciB0ZXh0IGZvciBwaWNrZXIgY29udHJvbHNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfR0VORVJJQ19UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9HRU5FUklDX1BIICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0NPQUNIX1QgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfRVhDVVNFX1QgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9FWENVU0VfUEggICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0VYQ1VTRV9JVEVNX1QgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfSU5UX1QgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9OQU1FRF9UICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX05BTUVEX1BIICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfTkFNRURfSVRFTV9UICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX1QgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfUEggICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9JVEVNX1QgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QTEFUX05VTUJFUl9UICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BMQVRfTEVUVEVSX1QgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVl9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWX1BIICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZfSVRFTV9UICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU1RBVElPTl9UICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TVEFUSU9OX1BIICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NUQVRJT05fSVRFTV9UIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQUREICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9BRERfVCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0NMT1NFICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQ0xPU0VfVCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9FTVBUWSAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RSQUdfVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfREVMRVRFICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9ERUxFVEVfVCAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0lURU1fVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfVElNRV9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8qKiBDb2FjaCBwaWNrZXIncyBvbkNoYW5nZSBmaXJlZCB3aXRob3V0IGNvbnRleHQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfQ09BQ0hfTUlTU0lOR19TVEFURSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBJbnRlZ2VyIHBpY2tlcidzIG9uQ2hhbmdlIGZpcmVkIHdpdGhvdXQgY29udGV4dCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9JTlRfTUlTU0lOR19TVEFURSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFBocmFzZXNldCBwaWNrZXIncyBvblNlbGVjdCBmaXJlZCB3aXRob3V0IHJlZmVyZW5jZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX01JU1NJTkdfU1RBVEUgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFNlcnZpY2UgcGlja2VyJ3Mgb25TZWxlY3QgZmlyZWQgd2l0aG91dCByZWZlcmVuY2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVklDRV9NSVNTSU5HX1NUQVRFIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTZXJ2aWNlIHBpY2tlcidzIG9uQ2hhbmdlIGZpcmVkIHdpdGhvdXQgcmVmZXJlbmNlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1RJTUVfTUlTU0lOR19TVEFURSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUGhyYXNlc2V0IHBpY2tlciBvcGVuZWQgZm9yIHVua25vd24gcGhyYXNlc2V0ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfVU5LTk9XTiAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogRHJhZyBtaXJyb3IgY3JlYXRlIGV2ZW50IGluIHN0YXRpb24gbGlzdCBtaXNzaW5nIHN0YXRlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RSQUdfTUlTU0lORyAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gU2V0dGluZ3NcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSBhbmQgbGFiZWwgdGV4dCBmb3Igc2V0dGluZ3MgZWxlbWVudHNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfQ09ORklSTSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX0NPTkZJUk1fVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9ET05FICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU0FWRSAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NBVkVfVCAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0ggICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX0NIT0lDRSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9FTVBUWSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfVk9MICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1BJVENIICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9SQVRFICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfVEVTVCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1RFU1RfVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX0xFR0FMICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gVUkgY29udHJvbHNcclxuXHJcbiAgICAvKiogSGVhZGVyIGZvciB0aGUgXCJ0b28gc21hbGxcIiB3YXJuaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBXQVJOX1NIT1JUX0hFQURFUiA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQm9keSB0ZXh0IGZvciB0aGUgXCJ0b28gc21hbGxcIiB3YXJuaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBXQVJOX1NIT1JUICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gTWlzYy4gY29uc3RhbnRzXHJcblxyXG4gICAgLyoqIEFycmF5IG9mIHRoZSBlbnRpcmUgYWxwaGFiZXQgb2YgdGhlIGxhbmd1YWdlLCBmb3IgY29hY2ggbGV0dGVycyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgTEVUVEVSUyA6IHN0cmluZztcclxuICAgIC8qKiBBcnJheSBvZiBudW1iZXJzIGFzIHdvcmRzIChlLmcuIHplcm8sIG9uZSwgdHdvKSwgbWF0Y2hpbmcgdGhlaXIgaW5kZXggKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERJR0lUUyAgOiBzdHJpbmdbXTtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkJhc2VMYW5ndWFnZS50c1wiLz5cclxuXHJcbmNsYXNzIEVuZ2xpc2hMYW5ndWFnZSBleHRlbmRzIEJhc2VMYW5ndWFnZVxyXG57XHJcbiAgICBXRUxDT01FICAgICAgID0gKCkgPT4gJ1dlbGNvbWUgdG8gUmFpbCBBbm5vdW5jZW1lbnQgR2VuZXJhdG9yLic7XHJcbiAgICBET01fTUlTU0lORyAgID0gKHE6IHN0cmluZykgPT4gYFJlcXVpcmVkIERPTSBlbGVtZW50IGlzIG1pc3Npbmc6ICcke3F9J2A7XHJcbiAgICBBVFRSX01JU1NJTkcgID0gKGE6IHN0cmluZykgPT4gYFJlcXVpcmVkIGF0dHJpYnV0ZSBpcyBtaXNzaW5nOiAnJHthfSdgO1xyXG4gICAgREFUQV9NSVNTSU5HICA9IChrOiBzdHJpbmcpID0+IGBSZXF1aXJlZCBkYXRhc2V0IGtleSBpcyBtaXNzaW5nIG9yIGVtcHR5OiAnJHtrfSdgO1xyXG4gICAgQkFEX0RJUkVDVElPTiA9ICh2OiBzdHJpbmcpID0+IGBEaXJlY3Rpb24gbmVlZHMgdG8gYmUgLTEgb3IgMSwgbm90ICcke3Z9J2A7XHJcbiAgICBCQURfQk9PTEVBTiAgID0gKHY6IHN0cmluZykgPT4gYEdpdmVuIHN0cmluZyBkb2VzIG5vdCByZXByZXNlbnQgYSBib29sZWFuOiAnJHt2fSdgO1xyXG5cclxuICAgIFNUQVRFX0ZST01fU1RPUkFHRSAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1N0YXRlIGhhcyBiZWVuIGxvYWRlZCBmcm9tIHN0b3JhZ2UuJztcclxuICAgIFNUQVRFX1RPX1NUT1JBR0UgICAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1N0YXRlIGhhcyBiZWVuIHNhdmVkIHRvIHN0b3JhZ2UsIGFuZCBkdW1wZWQgdG8gY29uc29sZS4nO1xyXG4gICAgU1RBVEVfQ09QWV9QQVNURSAgICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnJWNDb3B5IGFuZCBwYXN0ZSB0aGlzIGluIGNvbnNvbGUgdG8gbG9hZCBsYXRlcjonO1xyXG4gICAgU1RBVEVfUkFXX0pTT04gICAgICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnJWNSYXcgSlNPTiBzdGF0ZTonO1xyXG4gICAgU1RBVEVfU0FWRV9GQUlMICAgICAgICAgICAgID0gKG1zZzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBTb3JyeSwgc3RhdGUgY291bGQgbm90IGJlIHNhdmVkIHRvIHN0b3JhZ2U6ICR7bXNnfS5gO1xyXG4gICAgU1RBVEVfU0FWRV9NSVNTSU5HICAgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnU29ycnksIG5vIHN0YXRlIHdhcyBmb3VuZCBpbiBzdG9yYWdlLic7XHJcbiAgICBTVEFURV9OT05FWElTVEFOVF9QSFJBU0VTRVQgPSAocjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBBdHRlbXB0ZWQgdG8gZ2V0IGNob3NlbiBpbmRleCBmb3IgcGhyYXNlc2V0ICgke3J9KSB0aGF0IGRvZXNuJ3QgZXhpc3RgO1xyXG5cclxuICAgIENPTkZJR19MT0FEX0ZBSUwgID0gKG1zZzogc3RyaW5nKSA9PiBgQ291bGQgbm90IGxvYWQgc2V0dGluZ3M6ICR7bXNnfWA7XHJcbiAgICBDT05GSUdfU0FWRV9GQUlMICA9IChtc2c6IHN0cmluZykgPT4gYENvdWxkIG5vdCBzYXZlIHNldHRpbmdzOiAke21zZ31gO1xyXG4gICAgQ09ORklHX1JFU0VUX0ZBSUwgPSAobXNnOiBzdHJpbmcpID0+IGBDb3VsZCBub3QgY2xlYXIgc2V0dGluZ3M6ICR7bXNnfWA7XHJcblxyXG4gICAgREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRSA9IChlOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENvbmZpZ3VyZWQgcGhyYXNlc2V0IGVsZW1lbnQgcXVlcnkgKCR7ZX0pIGRvZXMgbm90IHBvaW50IHRvIGFuIGlGcmFtZSBlbWJlZGA7XHJcbiAgICBEQl9VTktOT1dOX1NUQVRJT04gICA9IChjOiBzdHJpbmcpID0+IGBVTktOT1dOIFNUQVRJT046ICR7Y31gO1xyXG4gICAgREJfRU1QVFlfU1RBVElPTiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBTdGF0aW9uIGRhdGFiYXNlIGFwcGVhcnMgdG8gY29udGFpbiBhbiBlbXB0eSBuYW1lIGZvciBjb2RlICcke2N9J2A7XHJcbiAgICBEQl9UT09fTUFOWV9TVEFUSU9OUyA9ICgpID0+ICdQaWNraW5nIHRvbyBtYW55IHN0YXRpb25zIHRoYW4gdGhlcmUgYXJlIGF2YWlsYWJsZSc7XHJcblxyXG4gICAgVE9PTEJBUl9QTEFZICAgICA9ICgpID0+ICdQbGF5IHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NUT1AgICAgID0gKCkgPT4gJ1N0b3AgcGxheWluZyBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TSFVGRkxFICA9ICgpID0+ICdHZW5lcmF0ZSByYW5kb20gcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU0FWRSAgICAgPSAoKSA9PiAnU2F2ZSBzdGF0ZSB0byBzdG9yYWdlJztcclxuICAgIFRPT0xCQVJfTE9BRCAgICAgPSAoKSA9PiAnUmVjYWxsIHN0YXRlIGZyb20gc3RvcmFnZSc7XHJcbiAgICBUT09MQkFSX1NFVFRJTkdTID0gKCkgPT4gJ09wZW4gc2V0dGluZ3MnO1xyXG5cclxuICAgIFRJVExFX0NPQUNIICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgY29hY2ggKCcke2N9JylgO1xyXG4gICAgVElUTEVfRVhDVVNFICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdDbGljayB0byBjaGFuZ2UgdGhpcyBleGN1c2UnO1xyXG4gICAgVElUTEVfSU5URUdFUiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBudW1iZXIgKCcke2N9JylgO1xyXG4gICAgVElUTEVfTkFNRUQgICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgIFwiQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdHJhaW4ncyBuYW1lXCI7XHJcbiAgICBUSVRMRV9PUFRfT1BFTiAgICA9ICh0OiBzdHJpbmcsIHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gb3BlbiB0aGlzIG9wdGlvbmFsICR7dH0gKCcke3J9JylgO1xyXG4gICAgVElUTEVfT1BUX0NMT1NFICAgPSAodDogc3RyaW5nLCByOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNsb3NlIHRoaXMgb3B0aW9uYWwgJHt0fSAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9QSFJBU0VTRVQgICA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGUgcGhyYXNlIHVzZWQgaW4gdGhpcyBzZWN0aW9uICgnJHtyfScpYDtcclxuICAgIFRJVExFX1BMQVRGT1JNICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICBcIkNsaWNrIHRvIGNoYW5nZSB0aGlzIHRyYWluJ3MgcGxhdGZvcm1cIjtcclxuICAgIFRJVExFX1NFUlZJQ0UgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc2VydmljZSAoJyR7Y30nKWA7XHJcbiAgICBUSVRMRV9TVEFUSU9OICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHN0YXRpb24gKCcke2N9JylgO1xyXG4gICAgVElUTEVfU1RBVElPTkxJU1QgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBzdGF0aW9uIGxpc3QgKCcke2N9JylgO1xyXG4gICAgVElUTEVfVElNRSAgICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyB0aW1lICgnJHtjfScpYDtcclxuXHJcbiAgICBFRElUT1JfSU5JVCAgICAgICAgICAgICAgPSAoKSA9PiAnUGxlYXNlIHdhaXQuLi4nO1xyXG4gICAgRURJVE9SX1VOS05PV05fRUxFTUVOVCAgID0gKG46IHN0cmluZykgPT4gYChVTktOT1dOIFhNTCBFTEVNRU5UOiAke259KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0UgICAgPSAocjogc3RyaW5nKSA9PiBgKFVOS05PV04gUEhSQVNFOiAke3J9KWA7XHJcbiAgICBFRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQgPSAocjogc3RyaW5nKSA9PiBgKFVOS05PV04gUEhSQVNFU0VUOiAke3J9KWA7XHJcblxyXG4gICAgUEhSQVNFUl9UT09fUkVDVVJTSVZFID0gKCkgPT5cclxuICAgICAgICAnVG9vIG1hbnkgbGV2ZWxzIG9mIHJlY3Vyc2lvbiB3aGlsc3QgcHJvY2Vzc2luZyBwaHJhc2UnO1xyXG5cclxuICAgIEhFQURFUl9DT0FDSCAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBjb2FjaCBsZXR0ZXIgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfRVhDVVNFICAgICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGFuIGV4Y3VzZSc7XHJcbiAgICBIRUFERVJfSU5URUdFUiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgbnVtYmVyIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX05BTUVEICAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICAnUGljayBhIG5hbWVkIHRyYWluJztcclxuICAgIEhFQURFUl9QSFJBU0VTRVQgICA9IChyOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBwaHJhc2UgZm9yIHRoZSAnJHtyfScgc2VjdGlvbmA7XHJcbiAgICBIRUFERVJfUExBVEZPUk0gICAgPSAoKSAgICAgICAgICA9PlxyXG4gICAgICAgICdQaWNrIGEgcGxhdGZvcm0nO1xyXG4gICAgSEVBREVSX1NFUlZJQ0UgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHNlcnZpY2UgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfU1RBVElPTiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgc3RhdGlvbiBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9TVEFUSU9OTElTVCA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYEJ1aWxkIGEgc3RhdGlvbiBsaXN0IGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1RJTUUgICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHRpbWUgZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcblxyXG4gICAgUF9HRU5FUklDX1QgICAgICA9ICgpID0+ICdMaXN0IG9mIGNob2ljZXMnO1xyXG4gICAgUF9HRU5FUklDX1BIICAgICA9ICgpID0+ICdGaWx0ZXIgY2hvaWNlcy4uLic7XHJcbiAgICBQX0NPQUNIX1QgICAgICAgID0gKCkgPT4gJ0NvYWNoIGxldHRlcic7XHJcbiAgICBQX0VYQ1VTRV9UICAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgZGVsYXkgb3IgY2FuY2VsbGF0aW9uIGV4Y3VzZXMnO1xyXG4gICAgUF9FWENVU0VfUEggICAgICA9ICgpID0+ICdGaWx0ZXIgZXhjdXNlcy4uLic7XHJcbiAgICBQX0VYQ1VTRV9JVEVNX1QgID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCB0aGlzIGV4Y3VzZSc7XHJcbiAgICBQX0lOVF9UICAgICAgICAgID0gKCkgPT4gJ0ludGVnZXIgdmFsdWUnO1xyXG4gICAgUF9OQU1FRF9UICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHRyYWluIG5hbWVzJztcclxuICAgIFBfTkFNRURfUEggICAgICAgPSAoKSA9PiAnRmlsdGVyIHRyYWluIG5hbWUuLi4nO1xyXG4gICAgUF9OQU1FRF9JVEVNX1QgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBuYW1lJztcclxuICAgIFBfUFNFVF9UICAgICAgICAgPSAoKSA9PiAnTGlzdCBvZiBwaHJhc2VzJztcclxuICAgIFBfUFNFVF9QSCAgICAgICAgPSAoKSA9PiAnRmlsdGVyIHBocmFzZXMuLi4nO1xyXG4gICAgUF9QU0VUX0lURU1fVCAgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBwaHJhc2UnO1xyXG4gICAgUF9QTEFUX05VTUJFUl9UICA9ICgpID0+ICdQbGF0Zm9ybSBudW1iZXInO1xyXG4gICAgUF9QTEFUX0xFVFRFUl9UICA9ICgpID0+ICdPcHRpb25hbCBwbGF0Zm9ybSBsZXR0ZXInO1xyXG4gICAgUF9TRVJWX1QgICAgICAgICA9ICgpID0+ICdMaXN0IG9mIHNlcnZpY2UgbmFtZXMnO1xyXG4gICAgUF9TRVJWX1BIICAgICAgICA9ICgpID0+ICdGaWx0ZXIgc2VydmljZXMuLi4nO1xyXG4gICAgUF9TRVJWX0lURU1fVCAgICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBzZXJ2aWNlJztcclxuICAgIFBfU1RBVElPTl9UICAgICAgPSAoKSA9PiAnTGlzdCBvZiBzdGF0aW9uIG5hbWVzJztcclxuICAgIFBfU1RBVElPTl9QSCAgICAgPSAoKSA9PiAnRmlsdGVyIHN0YXRpb25zLi4uJztcclxuICAgIFBfU1RBVElPTl9JVEVNX1QgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IG9yIGFkZCB0aGlzIHN0YXRpb24nO1xyXG4gICAgUF9TTF9BREQgICAgICAgICA9ICgpID0+ICdBZGQgc3RhdGlvbi4uLic7XHJcbiAgICBQX1NMX0FERF9UICAgICAgID0gKCkgPT4gJ0FkZCBzdGF0aW9uIHRvIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0NMT1NFICAgICAgID0gKCkgPT4gJ0Nsb3NlJztcclxuICAgIFBfU0xfQ0xPU0VfVCAgICAgPSAoKSA9PiAnQ2xvc2UgdGhpcyBwaWNrZXInO1xyXG4gICAgUF9TTF9FTVBUWSAgICAgICA9ICgpID0+ICdQbGVhc2UgYWRkIGF0IGxlYXN0IG9uZSBzdGF0aW9uIHRvIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0RSQUdfVCAgICAgID0gKCkgPT4gJ0RyYWdnYWJsZSBzZWxlY3Rpb24gb2Ygc3RhdGlvbnMgZm9yIHRoaXMgbGlzdCc7XHJcbiAgICBQX1NMX0RFTEVURSAgICAgID0gKCkgPT4gJ0Ryb3AgaGVyZSB0byBkZWxldGUnO1xyXG4gICAgUF9TTF9ERUxFVEVfVCAgICA9ICgpID0+ICdEcm9wIHN0YXRpb24gaGVyZSB0byBkZWxldGUgaXQgZnJvbSB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9JVEVNX1QgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ0RyYWcgdG8gcmVvcmRlcjsgZG91YmxlLWNsaWNrIG9yIGRyYWcgaW50byBkZWxldGUgem9uZSB0byByZW1vdmUnO1xyXG4gICAgUF9USU1FX1QgICAgICAgICA9ICgpID0+ICdUaW1lIGVkaXRvcic7XHJcblxyXG4gICAgUF9DT0FDSF9NSVNTSU5HX1NUQVRFICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIGNvYWNoIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfSU5UX01JU1NJTkdfU1RBVEUgICAgID0gKCkgPT4gJ29uQ2hhbmdlIGZpcmVkIGZvciBpbnRlZ2VyIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfUFNFVF9NSVNTSU5HX1NUQVRFICAgID0gKCkgPT4gJ29uU2VsZWN0IGZpcmVkIGZvciBwaHJhc2VzZXQgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9TRVJWSUNFX01JU1NJTkdfU1RBVEUgPSAoKSA9PiAnb25TZWxlY3QgZmlyZWQgZm9yIHNlcnZpY2UgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9USU1FX01JU1NJTkdfU1RBVEUgICAgPSAoKSA9PiAnb25DaGFuZ2UgZmlyZWQgZm9yIHRpbWUgcGlja2VyIHdpdGhvdXQgc3RhdGUnO1xyXG4gICAgUF9QU0VUX1VOS05PV04gICAgICAgICAgPSAocjogc3RyaW5nKSA9PiBgUGhyYXNlc2V0ICcke3J9JyBkb2Vzbid0IGV4aXN0YDtcclxuICAgIFBfU0xfRFJBR19NSVNTSU5HICAgICAgID0gKCkgPT4gJ0RyYWdnYWJsZTogTWlzc2luZyBzb3VyY2UgZWxlbWVudHMgZm9yIG1pcnJvciBldmVudCc7XHJcblxyXG4gICAgU1RfUkVTRVQgICAgICAgICAgID0gKCkgPT4gJ1Jlc2V0IHRvIGRlZmF1bHRzJztcclxuICAgIFNUX1JFU0VUX1QgICAgICAgICA9ICgpID0+ICdSZXNldCBzZXR0aW5ncyB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9DT05GSVJNICAgPSAoKSA9PiAnQXJlIHlvdSBzdXJlPyc7XHJcbiAgICBTVF9SRVNFVF9DT05GSVJNX1QgPSAoKSA9PiAnQ29uZmlybSByZXNldCB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9ET05FICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTZXR0aW5ncyBoYXZlIGJlZW4gcmVzZXQgdG8gdGhlaXIgZGVmYXVsdHMsIGFuZCBkZWxldGVkIGZyb20gc3RvcmFnZS4nO1xyXG4gICAgU1RfU0FWRSAgICAgICAgICAgID0gKCkgPT4gJ1NhdmUgJiBjbG9zZSc7XHJcbiAgICBTVF9TQVZFX1QgICAgICAgICAgPSAoKSA9PiAnU2F2ZSBhbmQgY2xvc2Ugc2V0dGluZ3MnO1xyXG4gICAgU1RfU1BFRUNIICAgICAgICAgID0gKCkgPT4gJ1NwZWVjaCc7XHJcbiAgICBTVF9TUEVFQ0hfQ0hPSUNFICAgPSAoKSA9PiAnVm9pY2UnO1xyXG4gICAgU1RfU1BFRUNIX0VNUFRZICAgID0gKCkgPT4gJ05vbmUgYXZhaWxhYmxlJztcclxuICAgIFNUX1NQRUVDSF9WT0wgICAgICA9ICgpID0+ICdWb2x1bWUnO1xyXG4gICAgU1RfU1BFRUNIX1BJVENIICAgID0gKCkgPT4gJ1BpdGNoJztcclxuICAgIFNUX1NQRUVDSF9SQVRFICAgICA9ICgpID0+ICdSYXRlJztcclxuICAgIFNUX1NQRUVDSF9URVNUICAgICA9ICgpID0+ICdUZXN0IHNwZWVjaCc7XHJcbiAgICBTVF9TUEVFQ0hfVEVTVF9UICAgPSAoKSA9PiAnUGxheSBhIHNwZWVjaCBzYW1wbGUgd2l0aCB0aGUgY3VycmVudCBzZXR0aW5ncyc7XHJcbiAgICBTVF9MRUdBTCAgICAgICAgICAgPSAoKSA9PiAnTGVnYWwgJiBBY2tub3dsZWRnZW1lbnRzJztcclxuXHJcbiAgICBXQVJOX1NIT1JUX0hFQURFUiA9ICgpID0+ICdcIk1heSBJIGhhdmUgeW91ciBhdHRlbnRpb24gcGxlYXNlLi4uXCInO1xyXG4gICAgV0FSTl9TSE9SVCAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdUaGlzIGRpc3BsYXkgaXMgdG9vIHNob3J0IHRvIHN1cHBvcnQgUkFHLiBQbGVhc2UgbWFrZSB0aGlzIHdpbmRvdyB0YWxsZXIsIG9yJyArXHJcbiAgICAgICAgJyByb3RhdGUgeW91ciBkZXZpY2UgZnJvbSBsYW5kc2NhcGUgdG8gcG9ydHJhaXQuJztcclxuXHJcbiAgICAvLyBUT0RPOiBUaGVzZSBkb24ndCBmaXQgaGVyZTsgdGhpcyBzaG91bGQgZ28gaW4gdGhlIGRhdGFcclxuICAgIExFVFRFUlMgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVonO1xyXG4gICAgRElHSVRTICA9IFtcclxuICAgICAgICAnemVybycsICAgICAnb25lJywgICAgICd0d28nLCAgICAgJ3RocmVlJywgICAgICdmb3VyJywgICAgICdmaXZlJywgICAgJ3NpeCcsXHJcbiAgICAgICAgJ3NldmVuJywgICAgJ2VpZ2h0JywgICAnbmluZScsICAgICd0ZW4nLCAgICAgICAnZWxldmVuJywgICAndHdlbHZlJywgICd0aGlydGVlbicsXHJcbiAgICAgICAgJ2ZvdXJ0ZWVuJywgJ2ZpZnRlZW4nLCAnc2l4dGVlbicsICdzZXZlbnRlZW4nLCAnZWlnaHRlZW4nLCAnbmludGVlbicsICd0d2VudHknXHJcbiAgICBdO1xyXG5cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqXHJcbiAqIEhvbGRzIG1ldGhvZHMgZm9yIHByb2Nlc3NpbmcgZWFjaCB0eXBlIG9mIHBocmFzZSBlbGVtZW50IGludG8gSFRNTCwgd2l0aCBkYXRhIHRha2VuXHJcbiAqIGZyb20gdGhlIGN1cnJlbnQgc3RhdGUuIEVhY2ggbWV0aG9kIHRha2VzIGEgY29udGV4dCBvYmplY3QsIGhvbGRpbmcgZGF0YSBmb3IgdGhlXHJcbiAqIGN1cnJlbnQgWE1MIGVsZW1lbnQgYmVpbmcgcHJvY2Vzc2VkIGFuZCB0aGUgWE1MIGRvY3VtZW50IGJlaW5nIHVzZWQuXHJcbiAqL1xyXG5jbGFzcyBFbGVtZW50UHJvY2Vzc29yc1xyXG57XHJcbiAgICAvKiogRmlsbHMgaW4gY29hY2ggbGV0dGVycyBmcm9tIEEgdG8gWiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb2FjaChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9DT0FDSChjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRDb2FjaChjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBleGN1c2UsIGZvciBhIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBleGN1c2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9FWENVU0UoKTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5leGN1c2U7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBpbnRlZ2Vycywgb3B0aW9uYWxseSB3aXRoIG5vdW5zIGFuZCBpbiB3b3JkIGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgaW50ZWdlcihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzaW5ndWxhciA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnc2luZ3VsYXInKTtcclxuICAgICAgICBsZXQgcGx1cmFsICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3BsdXJhbCcpO1xyXG4gICAgICAgIGxldCB3b3JkcyAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnd29yZHMnKTtcclxuXHJcbiAgICAgICAgbGV0IGludCAgICA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKGNvbnRleHQpO1xyXG4gICAgICAgIGxldCBpbnRTdHIgPSAod29yZHMgJiYgd29yZHMudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnKVxyXG4gICAgICAgICAgICA/IEwuRElHSVRTW2ludF0gfHwgaW50LnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiBpbnQudG9TdHJpbmcoKTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoaW50ID09PSAxICYmIHNpbmd1bGFyKVxyXG4gICAgICAgICAgICBpbnRTdHIgKz0gYCAke3Npbmd1bGFyfWA7XHJcbiAgICAgICAgZWxzZSBpZiAoaW50ICE9PSAxICYmIHBsdXJhbClcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHtwbHVyYWx9YDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX0lOVEVHRVIoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHI7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG5cclxuICAgICAgICBpZiAoc2luZ3VsYXIpIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3Npbmd1bGFyJ10gPSBzaW5ndWxhcjtcclxuICAgICAgICBpZiAocGx1cmFsKSAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3BsdXJhbCddICAgPSBwbHVyYWw7XHJcbiAgICAgICAgaWYgKHdvcmRzKSAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wyd3b3JkcyddICAgID0gd29yZHM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBuYW1lZChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX05BTUVEKCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUubmFtZWQ7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBJbmNsdWRlcyBhIHByZXZpb3VzbHkgZGVmaW5lZCBwaHJhc2UsIGJ5IGl0cyBgaWRgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBocmFzZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBwaHJhc2UgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlKHJlZik7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgICAgID0gJyc7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsncmVmJ10gPSByZWY7XHJcblxyXG4gICAgICAgIGlmICghcGhyYXNlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX1BIUkFTRShyZWYpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGhyYXNlcyB3aXRoIGEgY2hhbmNlIHZhbHVlIGFzIGNvbGxhcHNpYmxlXHJcbiAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcmVmKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQoIEVsZW1lbnRQcm9jZXNzb3JzLndyYXBUb0lubmVyKHBocmFzZSkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwaHJhc2UgZnJvbSBhIHByZXZpb3VzbHkgZGVmaW5lZCBwaHJhc2VzZXQsIGJ5IGl0cyBgaWRgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHBocmFzZXNldChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgICAgICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZik7XHJcbiAgICAgICAgbGV0IGZvcmNlZElkeCA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnaWR4Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0VTRVQocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGlkeCA9IGZvcmNlZElkeFxyXG4gICAgICAgICAgICA/IHBhcnNlSW50KGZvcmNlZElkeClcclxuICAgICAgICAgICAgOiBSQUcuc3RhdGUuZ2V0UGhyYXNlc2V0SWR4KHJlZik7XHJcblxyXG4gICAgICAgIGxldCBwaHJhc2UgPSBwaHJhc2VzZXQuY2hpbGRyZW5baWR4XSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnaWR4J10gPSBmb3JjZWRJZHggfHwgaWR4LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwaHJhc2VzZXRzIHdpdGggYSBjaGFuY2UgdmFsdWUgYXMgY29sbGFwc2libGVcclxuICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy5tYWtlQ29sbGFwc2libGUoY3R4LCByZWYpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5hcHBlbmRDaGlsZCggRWxlbWVudFByb2Nlc3NvcnMud3JhcFRvSW5uZXIocGhyYXNlKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgY3VycmVudCBwbGF0Zm9ybSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwbGF0Zm9ybShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1BMQVRGT1JNKCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUucGxhdGZvcm0uam9pbignJyk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgcmFpbCBuZXR3b3JrIG5hbWUgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgc2VydmljZShjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TRVJWSUNFKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLmdldFNlcnZpY2UoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBzdGF0aW9uIG5hbWVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRpb24oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBjb2RlICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb24oY29udGV4dCk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9TVEFUSU9OKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb24oY29kZSk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiBzdGF0aW9uIGxpc3RzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRpb25saXN0KGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCAgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgbGV0IHN0YXRpb25zICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KGNvbnRleHQpLnNsaWNlKCk7XHJcbiAgICAgICAgbGV0IHN0YXRpb25MaXN0ID0gU3RyaW5ncy5mcm9tU3RhdGlvbkxpc3Qoc3RhdGlvbnMsIGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU1RBVElPTkxJU1QoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBzdGF0aW9uTGlzdDtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHRoZSB0aW1lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRpbWUoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfVElNRShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRUaW1lKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdm94IHBhcnRzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZveChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGtleSA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2tleScpO1xyXG5cclxuICAgICAgICAvLyBUT0RPOiBMb2NhbGl6ZVxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ICAgID0gY3R4LnhtbEVsZW1lbnQudGV4dENvbnRlbnQ7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgICAgPSBgQ2xpY2sgdG8gZWRpdCB0aGlzIHBocmFzZSAoJHtrZXl9KWA7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgICAgPSAxO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2tleSddID0ga2V5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHVua25vd24gZWxlbWVudHMgd2l0aCBhbiBpbmxpbmUgZXJyb3IgbWVzc2FnZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB1bmtub3duKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgbmFtZSA9IGN0eC54bWxFbGVtZW50Lm5vZGVOYW1lO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fRUxFTUVOVChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEF0dGFjaGVzIGNoYW5jZSBhbmQgYSBwcmUtZGV0ZXJtaW5lZCBjb2xsYXBzZSBzdGF0ZSBmb3IgYSBnaXZlbiBwaHJhc2UgZWxlbWVudCwgaWZcclxuICAgICAqIGl0IGRvZXMgaGF2ZSBhIGNoYW5jZSBhdHRyaWJ1ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY3R4IENvbnRleHQgb2YgdGhlIGN1cnJlbnQgcGhyYXNlIGVsZW1lbnQgYmVpbmcgcHJvY2Vzc2VkXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgKG9yIHBpY2spIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBtYWtlQ29sbGFwc2libGUoY3R4OiBQaHJhc2VDb250ZXh0LCByZWY6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhY3R4LnhtbEVsZW1lbnQuaGFzQXR0cmlidXRlKCdjaGFuY2UnKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGNoYW5jZSAgICA9IGN0eC54bWxFbGVtZW50LmdldEF0dHJpYnV0ZSgnY2hhbmNlJykhO1xyXG4gICAgICAgIGxldCBjb2xsYXBzZWQgPSBSQUcuc3RhdGUuZ2V0Q29sbGFwc2VkKCByZWYsIHBhcnNlSW50KGNoYW5jZSkgKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY2hhbmNlJ10gPSBjaGFuY2U7XHJcblxyXG4gICAgICAgIENvbGxhcHNpYmxlcy5zZXQoY3R4Lm5ld0VsZW1lbnQsIGNvbGxhcHNlZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbG9uZXMgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50IGludG8gYSBuZXcgaW5uZXIgc3BhbiB0YWcsIHNvIHRoYXQgdGhleVxyXG4gICAgICogY2FuIGJlIG1hZGUgY29sbGFwc2libGUgb3IgYnVuZGxlZCB3aXRoIGJ1dHRvbnMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNvdXJjZSBQYXJlbnQgdG8gY2xvbmUgdGhlIGNoaWxkcmVuIG9mLCBpbnRvIGEgd3JhcHBlclxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyB3cmFwVG9Jbm5lcihzb3VyY2U6IEhUTUxFbGVtZW50KSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGlubmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG5cclxuICAgICAgICBpbm5lci5jbGFzc0xpc3QuYWRkKCdpbm5lcicpO1xyXG4gICAgICAgIERPTS5jbG9uZUludG8oc291cmNlLCBpbm5lcik7XHJcblxyXG4gICAgICAgIHJldHVybiBpbm5lcjtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFJlcHJlc2VudHMgY29udGV4dCBkYXRhIGZvciBhIHBocmFzZSwgdG8gYmUgcGFzc2VkIHRvIGFuIGVsZW1lbnQgcHJvY2Vzc29yICovXHJcbmludGVyZmFjZSBQaHJhc2VDb250ZXh0XHJcbntcclxuICAgIC8qKiBHZXRzIHRoZSBYTUwgcGhyYXNlIGVsZW1lbnQgdGhhdCBpcyBiZWluZyByZXBsYWNlZCAqL1xyXG4gICAgeG1sRWxlbWVudCA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIEdldHMgdGhlIEhUTUwgc3BhbiBlbGVtZW50IHRoYXQgaXMgcmVwbGFjaW5nIHRoZSBYTUwgZWxlbWVudCAqL1xyXG4gICAgbmV3RWxlbWVudCA6IEhUTUxTcGFuRWxlbWVudDtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqXHJcbiAqIEhhbmRsZXMgdGhlIHRyYW5zZm9ybWF0aW9uIG9mIHBocmFzZSBYTUwgZGF0YSwgaW50byBIVE1MIGVsZW1lbnRzIHdpdGggdGhlaXIgZGF0YVxyXG4gKiBmaWxsZWQgaW4gYW5kIHRoZWlyIFVJIGxvZ2ljIHdpcmVkLlxyXG4gKi9cclxuY2xhc3MgUGhyYXNlclxyXG57XHJcbiAgICAvKipcclxuICAgICAqIFJlY3Vyc2l2ZWx5IHByb2Nlc3NlcyBYTUwgZWxlbWVudHMsIGZpbGxpbmcgaW4gZGF0YSBhbmQgYXBwbHlpbmcgdHJhbnNmb3Jtcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGFpbmVyIFBhcmVudCB0byBwcm9jZXNzIHRoZSBjaGlsZHJlbiBvZlxyXG4gICAgICogQHBhcmFtIGxldmVsIEN1cnJlbnQgbGV2ZWwgb2YgcmVjdXJzaW9uLCBtYXguIDIwXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBwcm9jZXNzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGxldmVsOiBudW1iZXIgPSAwKVxyXG4gICAge1xyXG4gICAgICAgIC8vIEluaXRpYWxseSwgdGhpcyBtZXRob2Qgd2FzIHN1cHBvc2VkIHRvIGp1c3QgYWRkIHRoZSBYTUwgZWxlbWVudHMgZGlyZWN0bHkgaW50b1xyXG4gICAgICAgIC8vIHRoZSBkb2N1bWVudC4gSG93ZXZlciwgdGhpcyBjYXVzZWQgYSBsb3Qgb2YgcHJvYmxlbXMgKGUuZy4gdGl0bGUgbm90IHdvcmtpbmcpLlxyXG4gICAgICAgIC8vIEhUTUwgZG9lcyBub3Qgd29yayByZWFsbHkgd2VsbCB3aXRoIGN1c3RvbSBlbGVtZW50cywgZXNwZWNpYWxseSBpZiB0aGV5IGFyZSBvZlxyXG4gICAgICAgIC8vIGFub3RoZXIgWE1MIG5hbWVzcGFjZS5cclxuXHJcbiAgICAgICAgbGV0IHF1ZXJ5ICAgPSAnOm5vdChzcGFuKTpub3Qoc3ZnKTpub3QodXNlKTpub3QoYnV0dG9uKSc7XHJcbiAgICAgICAgbGV0IHBlbmRpbmcgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbChxdWVyeSkgYXMgTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XHJcblxyXG4gICAgICAgIC8vIE5vIG1vcmUgWE1MIGVsZW1lbnRzIHRvIGV4cGFuZFxyXG4gICAgICAgIGlmIChwZW5kaW5nLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGb3IgZWFjaCBYTUwgZWxlbWVudCBjdXJyZW50bHkgaW4gdGhlIGNvbnRhaW5lcjpcclxuICAgICAgICAvLyAqIENyZWF0ZSBhIG5ldyBzcGFuIGVsZW1lbnQgZm9yIGl0XHJcbiAgICAgICAgLy8gKiBIYXZlIHRoZSBwcm9jZXNzb3JzIHRha2UgZGF0YSBmcm9tIHRoZSBYTUwgZWxlbWVudCwgdG8gcG9wdWxhdGUgdGhlIG5ldyBvbmVcclxuICAgICAgICAvLyAqIFJlcGxhY2UgdGhlIFhNTCBlbGVtZW50IHdpdGggdGhlIG5ldyBvbmVcclxuICAgICAgICBwZW5kaW5nLmZvckVhY2goZWxlbWVudCA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVsZW1lbnROYW1lID0gZWxlbWVudC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBsZXQgbmV3RWxlbWVudCAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgICAgIGxldCBjb250ZXh0ICAgICA9IHtcclxuICAgICAgICAgICAgICAgIHhtbEVsZW1lbnQ6IGVsZW1lbnQsXHJcbiAgICAgICAgICAgICAgICBuZXdFbGVtZW50OiBuZXdFbGVtZW50XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBuZXdFbGVtZW50LmRhdGFzZXRbJ3R5cGUnXSA9IGVsZW1lbnROYW1lO1xyXG5cclxuICAgICAgICAgICAgLy8gSSB3YW50ZWQgdG8gdXNlIGFuIGluZGV4IG9uIEVsZW1lbnRQcm9jZXNzb3JzIGZvciB0aGlzLCBidXQgaXQgY2F1c2VkIGV2ZXJ5XHJcbiAgICAgICAgICAgIC8vIHByb2Nlc3NvciB0byBoYXZlIGFuIFwidW51c2VkIG1ldGhvZFwiIHdhcm5pbmcuXHJcbiAgICAgICAgICAgIHN3aXRjaCAoZWxlbWVudE5hbWUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgRWxlbWVudFByb2Nlc3NvcnMuY29hY2goY29udGV4dCk7ICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnZXhjdXNlJzogICAgICBFbGVtZW50UHJvY2Vzc29ycy5leGN1c2UoY29udGV4dCk7ICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLmludGVnZXIoY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ25hbWVkJzogICAgICAgRWxlbWVudFByb2Nlc3NvcnMubmFtZWQoY29udGV4dCk7ICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGhyYXNlJzogICAgICBFbGVtZW50UHJvY2Vzc29ycy5waHJhc2UoY29udGV4dCk7ICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwaHJhc2VzZXQnOiAgIEVsZW1lbnRQcm9jZXNzb3JzLnBocmFzZXNldChjb250ZXh0KTsgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BsYXRmb3JtJzogICAgRWxlbWVudFByb2Nlc3NvcnMucGxhdGZvcm0oY29udGV4dCk7ICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc2VydmljZSc6ICAgICBFbGVtZW50UHJvY2Vzc29ycy5zZXJ2aWNlKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIEVsZW1lbnRQcm9jZXNzb3JzLnN0YXRpb24oY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogRWxlbWVudFByb2Nlc3NvcnMuc3RhdGlvbmxpc3QoY29udGV4dCk7IGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAndGltZSc6ICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy50aW1lKGNvbnRleHQpOyAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICd2b3gnOiAgICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnZveChjb250ZXh0KTsgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6ICAgICAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudW5rbm93bihjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUmVjdXJzZSBzbyB0aGF0IHdlIGNhbiBleHBhbmQgYW55IG5ldyBlbGVtZW50c1xyXG4gICAgICAgIGlmIChsZXZlbCA8IDIwKVxyXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGFpbmVyLCBsZXZlbCArIDEpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUEhSQVNFUl9UT09fUkVDVVJTSVZFKCkgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgY2xhc3MgZm9yIHJlc29sdmluZyBhIGdpdmVuIHBocmFzZSB0byB2b3gga2V5cyAqL1xyXG5jbGFzcyBSZXNvbHZlclxyXG57XHJcbiAgICAvKiogVHJlZVdhbGtlciBmaWx0ZXIgdG8gcmVkdWNlIGEgd2FsayB0byBqdXN0IHRoZSBlbGVtZW50cyB0aGUgcmVzb2x2ZXIgbmVlZHMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIG5vZGVGaWx0ZXIobm9kZTogTm9kZSk6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgICAgID0gbm9kZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgcGFyZW50VHlwZSA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghcGFyZW50VHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCAgICAgPSBwYXJlbnQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHBhcmVudFR5cGUgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQWNjZXB0IHRleHQgb25seSBmcm9tIHBocmFzZSBhbmQgcGhyYXNlc2V0c1xyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICBpZiAocGFyZW50VHlwZSAhPT0gJ3BocmFzZXNldCcgJiYgcGFyZW50VHlwZSAhPT0gJ3BocmFzZScpXHJcbiAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG5cclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudCA9IG5vZGUgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgICAgICAvLyBSZWplY3QgY29sbGFwc2VkIGVsZW1lbnRzIGFuZCB0aGVpciBjaGlsZHJlblxyXG4gICAgICAgICAgICBpZiAoIGVsZW1lbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfUkVKRUNUO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCB0eXBlbGVzcyAod3JhcHBlcikgZWxlbWVudHNcclxuICAgICAgICAgICAgaWYgKCF0eXBlKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIG92ZXIgcGhyYXNlIGFuZCBwaHJhc2VzZXRzIChpbnN0ZWFkLCBvbmx5IGdvaW5nIGZvciB0aGVpciBjaGlsZHJlbilcclxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnIHx8IHR5cGUgPT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1NLSVA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGhyYXNlICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHJpdmF0ZSBmbGF0dGVuZWQgOiBOb2RlW107XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlZCAgOiBWb3hLZXlbXTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGhyYXNlOiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnBocmFzZSAgICA9IHBocmFzZTtcclxuICAgICAgICB0aGlzLmZsYXR0ZW5lZCA9IFtdO1xyXG4gICAgICAgIHRoaXMucmVzb2x2ZWQgID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHRvVm94KCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIC8vIEZpcnN0LCB3YWxrIHRocm91Z2ggdGhlIHBocmFzZSBhbmQgXCJmbGF0dGVuXCIgaXQgaW50byBhbiBhcnJheSBvZiBwYXJ0cy4gVGhpcyBpc1xyXG4gICAgICAgIC8vIHNvIHRoZSByZXNvbHZlciBjYW4gbG9vay1haGVhZCBvciBsb29rLWJlaGluZC5cclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQgPSBbXTtcclxuICAgICAgICB0aGlzLnJlc29sdmVkICA9IFtdO1xyXG4gICAgICAgIGxldCB0cmVlV2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcclxuICAgICAgICAgICAgdGhpcy5waHJhc2UsXHJcbiAgICAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19URVhUIHwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogUmVzb2x2ZXIubm9kZUZpbHRlciB9LFxyXG4gICAgICAgICAgICBmYWxzZVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHdoaWxlICggdHJlZVdhbGtlci5uZXh0Tm9kZSgpIClcclxuICAgICAgICBpZiAodHJlZVdhbGtlci5jdXJyZW50Tm9kZS50ZXh0Q29udGVudCEudHJpbSgpICE9PSAnJylcclxuICAgICAgICAgICAgdGhpcy5mbGF0dGVuZWQucHVzaCh0cmVlV2Fsa2VyLmN1cnJlbnROb2RlKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgcmVzb2x2ZSBhbGwgdGhlIHBocmFzZXMnIG5vZGVzIGludG8gdm94IGtleXNcclxuXHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQuZm9yRWFjaCggKHYsIGkpID0+IHRoaXMucmVzb2x2ZWQucHVzaCggLi4udGhpcy5yZXNvbHZlKHYsIGkpICkgKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5mbGF0dGVuZWQsIHRoaXMucmVzb2x2ZWQpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXNlcyB0aGUgdHlwZSBhbmQgdmFsdWUgb2YgdGhlIGdpdmVuIG5vZGUsIHRvIHJlc29sdmUgaXQgdG8gdm94IGZpbGUgSURzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBub2RlIE5vZGUgdG8gcmVzb2x2ZSB0byB2b3ggSURzXHJcbiAgICAgKiBAcGFyYW0gaWR4IEluZGV4IG9mIHRoZSBub2RlIGJlaW5nIHJlc29sdmVkIHJlbGF0aXZlIHRvIHRoZSBwaHJhc2UgYXJyYXlcclxuICAgICAqIEByZXR1cm5zIEFycmF5IG9mIElEcyB0aGF0IG1ha2UgdXAgb25lIG9yIG1vcmUgZmlsZSBJRHMuIENhbiBiZSBlbXB0eS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlKG5vZGU6IE5vZGUsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlVGV4dChub2RlKTtcclxuXHJcbiAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCB0eXBlICAgID0gZWxlbWVudC5kYXRhc2V0Wyd0eXBlJ107XHJcblxyXG4gICAgICAgIHN3aXRjaCAodHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NvYWNoJzogICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUNvYWNoKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ2V4Y3VzZSc6ICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUV4Y3VzZShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdpbnRlZ2VyJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVJbnRlZ2VyKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICduYW1lZCc6ICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVOYW1lZCgpO1xyXG4gICAgICAgICAgICBjYXNlICdwbGF0Zm9ybSc6ICAgIHJldHVybiB0aGlzLnJlc29sdmVQbGF0Zm9ybShpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdzZXJ2aWNlJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTZXJ2aWNlKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICdzdGF0aW9uJzogICAgIHJldHVybiB0aGlzLnJlc29sdmVTdGF0aW9uKGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3N0YXRpb25saXN0JzogcmV0dXJuIHRoaXMucmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQsIGlkeCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3RpbWUnOiAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRpbWUoZWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3ZveCc6ICAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVZveChlbGVtZW50KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEluZmxlY3Rpb24oaWR4OiBudW1iZXIpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5leHQgPSB0aGlzLmZsYXR0ZW5lZFtpZHggKyAxXTtcclxuXHJcbiAgICAgICAgcmV0dXJuICggbmV4dCAmJiBuZXh0LnRleHRDb250ZW50IS50cmltKCkuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgPyAnZW5kJ1xyXG4gICAgICAgICAgICA6ICdtaWQnO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVRleHQobm9kZTogTm9kZSkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBub2RlLnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCB0eXBlICAgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG4gICAgICAgIGxldCB0ZXh0ICAgPSBTdHJpbmdzLmNsZWFuKG5vZGUudGV4dENvbnRlbnQhKTtcclxuICAgICAgICBsZXQgc2V0ICAgID0gW107XHJcblxyXG4gICAgICAgIC8vIElmIHRleHQgaXMganVzdCBhIGZ1bGwgc3RvcCwgcmV0dXJuIHNpbGVuY2VcclxuICAgICAgICBpZiAodGV4dCA9PT0gJy4nKVxyXG4gICAgICAgICAgICByZXR1cm4gWzAuNjVdO1xyXG5cclxuICAgICAgICAvLyBJZiBpdCBiZWdpbnMgd2l0aCBhIGZ1bGwgc3RvcCwgYWRkIHNpbGVuY2VcclxuICAgICAgICBpZiAoIHRleHQuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgc2V0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSB0ZXh0IGRvZXNuJ3QgY29udGFpbiBhbnkgd29yZHMsIHNraXBcclxuICAgICAgICBpZiAoICF0ZXh0Lm1hdGNoKC9bYS16MC05XS9pKSApXHJcbiAgICAgICAgICAgIHJldHVybiBzZXQ7XHJcblxyXG4gICAgICAgIC8vIElmIHR5cGUgaXMgbWlzc2luZywgcGFyZW50IGlzIGEgd3JhcHBlclxyXG4gICAgICAgIGlmICghdHlwZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICAgICAgdHlwZSAgID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCByZWYgPSBwYXJlbnQuZGF0YXNldFsncmVmJ107XHJcbiAgICAgICAgbGV0IGlkeCA9IERPTS5ub2RlSW5kZXhPZihub2RlKTtcclxuICAgICAgICBsZXQgaWQgID0gYCR7dHlwZX0uJHtyZWZ9YDtcclxuXHJcbiAgICAgICAgLy8gQXBwZW5kIGluZGV4IG9mIHBocmFzZXNldCdzIGNob2ljZSBvZiBwaHJhc2VcclxuICAgICAgICBpZiAodHlwZSA9PT0gJ3BocmFzZXNldCcpXHJcbiAgICAgICAgICAgIGlkICs9IGAuJHtwYXJlbnQuZGF0YXNldFsnaWR4J119YDtcclxuXHJcbiAgICAgICAgaWQgKz0gYC4ke2lkeH1gO1xyXG4gICAgICAgIHNldC5wdXNoKGlkKTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGV4dCBlbmRzIHdpdGggYSBmdWxsIHN0b3AsIGFkZCBzaWxlbmNlXHJcbiAgICAgICAgaWYgKCB0ZXh0LmVuZHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICBzZXQucHVzaCgwLjY1KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHNldDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVDb2FjaChlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgY29hY2ggICA9IFJBRy5zdGF0ZS5nZXRDb2FjaChjdHgpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgPSBbMC4yLCBgbGV0dGVyLiR7Y29hY2h9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUV4Y3VzZShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBleGN1c2UgID0gUkFHLnN0YXRlLmV4Y3VzZTtcclxuICAgICAgICBsZXQga2V5ICAgICA9IFN0cmluZ3MuZmlsZW5hbWUoZXhjdXNlKTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMTUsIGBleGN1c2UuJHtrZXl9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZUludGVnZXIoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHNpbmd1bGFyID0gZWxlbWVudC5kYXRhc2V0WydzaW5ndWxhciddO1xyXG4gICAgICAgIGxldCBwbHVyYWwgICA9IGVsZW1lbnQuZGF0YXNldFsncGx1cmFsJ107XHJcbiAgICAgICAgbGV0IGludGVnZXIgID0gUkFHLnN0YXRlLmdldEludGVnZXIoY3R4KTtcclxuICAgICAgICBsZXQgcGFydHMgICAgPSBbMC4xMjUsIGBudW1iZXIuJHtpbnRlZ2VyfS5taWRgXTtcclxuXHJcbiAgICAgICAgaWYgICAgICAoc2luZ3VsYXIgJiYgaW50ZWdlciA9PT0gMSlcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjE1LCBgbnVtYmVyLnN1ZmZpeC4ke3Npbmd1bGFyfS5lbmRgKTtcclxuICAgICAgICBlbHNlIGlmIChwbHVyYWwgICAmJiBpbnRlZ2VyICE9PSAxKVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMTUsIGBudW1iZXIuc3VmZml4LiR7cGx1cmFsfS5lbmRgKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4xNSk7XHJcblxyXG4gICAgICAgIHJldHVybiBwYXJ0cztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVOYW1lZCgpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgbmFtZWQgPSBTdHJpbmdzLmZpbGVuYW1lKFJBRy5zdGF0ZS5uYW1lZCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbMC4yLCBgbmFtZWQuJHtuYW1lZH0ubWlkYCwgMC4yXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVQbGF0Zm9ybShpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA9IFJBRy5zdGF0ZS5wbGF0Zm9ybTtcclxuICAgICAgICBsZXQgaW5mbGVjdCAgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgbGV0dGVyICAgPSAocGxhdGZvcm1bMV0gPT09ICfCvicpID8gJ00nIDogcGxhdGZvcm1bMV07XHJcbiAgICAgICAgbGV0IHJlc3VsdCAgID0gWzAuMTUsIGBudW1iZXIuJHtwbGF0Zm9ybVswXX0ke2xldHRlcn0uJHtpbmZsZWN0fWBdO1xyXG5cclxuICAgICAgICBpZiAoaW5mbGVjdCA9PT0gJ21pZCcpXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuMik7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlU2VydmljZShlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzZXJ2aWNlID0gU3RyaW5ncy5maWxlbmFtZSggUkFHLnN0YXRlLmdldFNlcnZpY2UoY3R4KSApO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gW107XHJcblxyXG4gICAgICAgIC8vIE9ubHkgYWRkIGJlZ2lubmluZyBkZWxheSBpZiB0aGVyZSBpc24ndCBhbHJlYWR5IG9uZSBwcmlvclxyXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5yZXNvbHZlZC5zbGljZSgtMSlbMF0gIT09ICdudW1iZXInKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjE1KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5yZXN1bHQsIGBzZXJ2aWNlLiR7c2VydmljZX0ubWlkYCwgMC4xNV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlU3RhdGlvbihlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uKGN0eCk7XHJcbiAgICAgICAgbGV0IHZveEtleSAgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvblZveChzdGF0aW9uKTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMiwgYHN0YXRpb24uJHt2b3hLZXl9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb25MaXN0KGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBsaXN0ICAgID0gUkFHLnN0YXRlLmdldFN0YXRpb25MaXN0KGN0eCk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuXHJcbiAgICAgICAgbGV0IHBhcnRzIDogVm94S2V5W10gPSBbMC4yXTtcclxuXHJcbiAgICAgICAgbGlzdC5mb3JFYWNoKCAoY29kZSwgaykgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCB2b3hLZXkgPSBSQUcuZGF0YWJhc2UuZ2V0U3RhdGlvblZveChjb2RlKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEhhbmRsZSBtaWRkbGUgb2YgbGlzdCBpbmZsZWN0aW9uXHJcbiAgICAgICAgICAgIGlmIChrICE9PSBsaXN0Lmxlbmd0aCAtIDEpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2b3hLZXl9Lm1pZGAsIDAuMjUpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBBZGQgXCJhbmRcIiBpZiBsaXN0IGhhcyBtb3JlIHRoYW4gMSBzdGF0aW9uIGFuZCB0aGlzIGlzIHRoZSBlbmRcclxuICAgICAgICAgICAgaWYgKGxpc3QubGVuZ3RoID4gMSlcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goJ3N0YXRpb24ucGFydHMuYW5kLm1pZCcsIDAuMjUpO1xyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFwib25seVwiIGlmIG9ubHkgb25lIHN0YXRpb24gaW4gdGhlIGNhbGxpbmcgbGlzdFxyXG4gICAgICAgICAgICBpZiAobGlzdC5sZW5ndGggPT09IDEgJiYgY3R4ID09PSAnY2FsbGluZycpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2b3hLZXl9Lm1pZGApO1xyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaCgwLjIsICdzdGF0aW9uLnBhcnRzLm9ubHkuZW5kJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgcGFydHMucHVzaChgc3RhdGlvbi4ke3ZveEtleX0uJHtpbmZsZWN0fWApO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gWy4uLnBhcnRzLCAwLjJdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVRpbWUoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHRpbWUgID0gUkFHLnN0YXRlLmdldFRpbWUoY3R4KS5zcGxpdCgnOicpO1xyXG5cclxuICAgICAgICBsZXQgcGFydHMgOiBWb3hLZXlbXSA9IFswLjJdO1xyXG5cclxuICAgICAgICBpZiAodGltZVswXSA9PT0gJzAwJyAmJiB0aW1lWzFdID09PSAnMDAnKVxyXG4gICAgICAgICAgICByZXR1cm4gWy4uLnBhcnRzLCAnbnVtYmVyLjAwMDAubWlkJywgMC4yXTtcclxuXHJcbiAgICAgICAgLy8gSG91cnNcclxuICAgICAgICBwYXJ0cy5wdXNoKGBudW1iZXIuJHt0aW1lWzBdfS5iZWdpbmApO1xyXG5cclxuICAgICAgICBpZiAodGltZVsxXSA9PT0gJzAwJylcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjA3NSwgJ251bWJlci5odW5kcmVkLm1pZCcpO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjIsIGBudW1iZXIuJHt0aW1lWzFdfS5taWRgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgMC4xNV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlVm94KGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRleHQgICA9IGVsZW1lbnQuaW5uZXJUZXh0LnRyaW0oKTtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gW107XHJcblxyXG4gICAgICAgIGlmICggdGV4dC5zdGFydHNXaXRoKCcuJykgKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjY1KTtcclxuXHJcbiAgICAgICAgcmVzdWx0LnB1c2goIGVsZW1lbnQuZGF0YXNldFsna2V5J10hICk7XHJcblxyXG4gICAgICAgIGlmICggdGV4dC5lbmRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cblxuLyoqIFR5cGUgZGVmaW5pdGlvbiBmb3Igc3BlZWNoIGNvbmZpZyBvdmVycmlkZXMgcGFzc2VkIHRvIHRoZSBzcGVhayBtZXRob2QgKi9cbmludGVyZmFjZSBTcGVlY2hTZXR0aW5nc1xue1xuICAgIC8qKiBXaGV0aGVyIHRvIGZvcmNlIHVzZSBvZiB0aGUgVk9YIGVuZ2luZSAqL1xuICAgIHVzZVZveD8gICAgOiBib29sZWFuO1xuICAgIC8qKiBPdmVycmlkZSBhYnNvbHV0ZSBvciByZWxhdGl2ZSBVUkwgb2YgVk9YIHZvaWNlIHRvIHVzZSAqL1xuICAgIHZveFBhdGg/ICAgOiBzdHJpbmc7XG4gICAgLyoqIE92ZXJyaWRlIGNob2ljZSBvZiByZXZlcmIgdG8gdXNlICovXG4gICAgdm94UmV2ZXJiPyA6IHN0cmluZztcbiAgICAvKiogT3ZlcnJpZGUgY2hvaWNlIG9mIGNoaW1lIHRvIHVzZSAqL1xuICAgIHZveENoaW1lPyAgOiBzdHJpbmc7XG4gICAgLyoqIE92ZXJyaWRlIGNob2ljZSBvZiBuYXRpdmUgdm9pY2UgKi9cbiAgICB2b2ljZU5hbWU/IDogc3RyaW5nO1xuICAgIC8qKiBPdmVycmlkZSB2b2x1bWUgb2Ygdm9pY2UgKi9cbiAgICB2b2x1bWU/ICAgIDogbnVtYmVyO1xuICAgIC8qKiBPdmVycmlkZSBwaXRjaCBvZiB2b2ljZSAqL1xuICAgIHBpdGNoPyAgICAgOiBudW1iZXI7XG4gICAgLyoqIE92ZXJyaWRlIHJhdGUgb2Ygdm9pY2UgKi9cbiAgICByYXRlPyAgICAgIDogbnVtYmVyO1xufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxudHlwZSBWb3hLZXkgPSBzdHJpbmcgfCBudW1iZXI7XHJcblxyXG4vKiogU3ludGhlc2l6ZXMgc3BlZWNoIGJ5IGR5bmFtaWNhbGx5IGxvYWRpbmcgYW5kIHBpZWNpbmcgdG9nZXRoZXIgdm9pY2UgZmlsZXMgKi9cclxuY2xhc3MgVm94RW5naW5lXHJcbntcclxuICAgIC8qKiBMaXN0IG9mIGltcHVsc2UgcmVzcG9uc2VzIHRoYXQgY29tZSB3aXRoIFJBRyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBSRVZFUkJTIDogRGljdGlvbmFyeTxzdHJpbmc+ID0ge1xyXG4gICAgICAgICcnICAgICAgICAgICAgICAgICAgICAgOiAnTm9uZScsXHJcbiAgICAgICAgJ2lyLnN0YWxiYW5zLndhdicgICAgICA6ICdUaGUgTGFkeSBDaGFwZWwsIFN0IEFsYmFucyBDYXRoZWRyYWwnLFxyXG4gICAgICAgICdpci5taWRkbGVfdHVubmVsLndhdicgOiAnSW5ub2NlbnQgUmFpbHdheSBUdW5uZWwsIEVkaW5idXJnaCcsXHJcbiAgICAgICAgJ2lyLmdyYW5nZS1jZW50cmUud2F2JyA6ICdHcmFuZ2Ugc3RvbmUgY2lyY2xlLCBDb3VudHkgTGltZXJpY2snXHJcbiAgICB9O1xyXG5cclxuICAgIC8qKiBUaGUgY29yZSBhdWRpbyBjb250ZXh0IHRoYXQgaGFuZGxlcyBhdWRpbyBlZmZlY3RzIGFuZCBwbGF5YmFjayAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBhdWRpb0NvbnRleHQgOiBBdWRpb0NvbnRleHQ7XHJcbiAgICAvKiogQXVkaW8gbm9kZSB0aGF0IGFtcGxpZmllcyBvciBhdHRlbnVhdGVzIHZvaWNlICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGdhaW5Ob2RlICAgICA6IEdhaW5Ob2RlO1xyXG4gICAgLyoqIEF1ZGlvIG5vZGUgdGhhdCBhcHBsaWVzIHRoZSB0YW5ub3kgZmlsdGVyICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGZpbHRlck5vZGUgICA6IEJpcXVhZEZpbHRlck5vZGU7XHJcbiAgICAvKiogQXVkaW8gbm9kZSB0aGF0IGFkZHMgYSByZXZlcmIgdG8gdGhlIHZvaWNlLCBpZiBhdmFpbGFibGUgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmV2ZXJiTm9kZSAgIDogQ29udm9sdmVyTm9kZTtcclxuICAgIC8qKiBDYWNoZSBvZiBpbXB1bHNlIHJlc3BvbnNlcyBhdWRpbyBkYXRhLCBmb3IgcmV2ZXJiICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGltcHVsc2VzICAgICA6IERpY3Rpb25hcnk8QXVkaW9CdWZmZXI+ID0ge307XHJcbiAgICAvKiogUmVsYXRpdmUgcGF0aCB0byBmZXRjaCBpbXB1bHNlIHJlc3BvbnNlIGFuZCBjaGltZSBmaWxlcyBmcm9tICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRhdGFQYXRoICAgICA6IHN0cmluZztcclxuXHJcbiAgICAvKiogRXZlbnQgaGFuZGxlciBmb3Igd2hlbiBzcGVlY2ggaGFzIGF1ZGlibHkgYmVndW4gKi9cclxuICAgIHB1YmxpYyAgb25zcGVhaz8gICAgICAgICA6ICgpID0+IHZvaWQ7XHJcbiAgICAvKiogRXZlbnQgaGFuZGxlciBmb3Igd2hlbiBzcGVlY2ggaGFzIGVuZGVkICovXHJcbiAgICBwdWJsaWMgIG9uc3RvcD8gICAgICAgICAgOiAoKSA9PiB2b2lkO1xyXG4gICAgLyoqIFdoZXRoZXIgdGhpcyBlbmdpbmUgaXMgY3VycmVudGx5IHJ1bm5pbmcgYW5kIHNwZWFraW5nICovXHJcbiAgICBwdWJsaWMgIGlzU3BlYWtpbmcgICAgICAgOiBib29sZWFuICAgICAgPSBmYWxzZTtcclxuICAgIC8qKiBXaGV0aGVyIHRoaXMgZW5naW5lIGhhcyBiZWd1biBzcGVha2luZyBmb3IgYSBjdXJyZW50IHNwZWVjaCAqL1xyXG4gICAgcHJpdmF0ZSBiZWd1blNwZWFraW5nICAgIDogYm9vbGVhbiAgICAgID0gZmFsc2U7XHJcbiAgICAvKiogUmVmZXJlbmNlIG51bWJlciBmb3IgdGhlIGN1cnJlbnQgcHVtcCB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSBwdW1wVGltZXIgICAgICAgIDogbnVtYmVyICAgICAgID0gMDtcclxuICAgIC8qKiBUcmFja3MgdGhlIGF1ZGlvIGNvbnRleHQncyB3YWxsLWNsb2NrIHRpbWUgdG8gc2NoZWR1bGUgbmV4dCBjbGlwICovXHJcbiAgICBwcml2YXRlIG5leHRCZWdpbiAgICAgICAgOiBudW1iZXIgICAgICAgPSAwO1xyXG4gICAgLyoqIFJlZmVyZW5jZXMgdG8gY3VycmVudGx5IHBlbmRpbmcgcmVxdWVzdHMsIGFzIGEgRklGTyBxdWV1ZSAqL1xyXG4gICAgcHJpdmF0ZSBwZW5kaW5nUmVxcyAgICAgIDogVm94UmVxdWVzdFtdID0gW107XHJcbiAgICAvKiogUmVmZXJlbmNlcyB0byBjdXJyZW50bHkgc2NoZWR1bGVkIGF1ZGlvIGJ1ZmZlcnMgKi9cclxuICAgIHByaXZhdGUgc2NoZWR1bGVkQnVmZmVycyA6IEF1ZGlvQnVmZmVyU291cmNlTm9kZVtdID0gW107XHJcbiAgICAvKiogTGlzdCBvZiB2b3ggSURzIGN1cnJlbnRseSBiZWluZyBydW4gdGhyb3VnaCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50SWRzPyAgICAgIDogVm94S2V5W107XHJcbiAgICAvKiogU3BlZWNoIHNldHRpbmdzIGN1cnJlbnRseSBiZWluZyB1c2VkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRTZXR0aW5ncz8gOiBTcGVlY2hTZXR0aW5ncztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoZGF0YVBhdGg6IHN0cmluZyA9ICdkYXRhL3ZveCcpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2V0dXAgdGhlIGNvcmUgYXVkaW8gY29udGV4dFxyXG5cclxuICAgICAgICAvLyBAdHMtaWdub3JlIC0gRGVmaW5pbmcgdGhlc2UgaW4gV2luZG93IGludGVyZmFjZSBkb2VzIG5vdCB3b3JrXHJcbiAgICAgICAgbGV0IGF1ZGlvQ29udGV4dCAgPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XHJcbiAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQgPSBuZXcgYXVkaW9Db250ZXh0KCk7XHJcblxyXG4gICAgICAgIGlmICghdGhpcy5hdWRpb0NvbnRleHQpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGdldCBhdWRpbyBjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIC8vIFNldHVwIG5vZGVzXHJcblxyXG4gICAgICAgIHRoaXMuZGF0YVBhdGggICA9IGRhdGFQYXRoO1xyXG4gICAgICAgIHRoaXMuZ2Fpbk5vZGUgICA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKTtcclxuICAgICAgICB0aGlzLmZpbHRlck5vZGUgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCaXF1YWRGaWx0ZXIoKTtcclxuICAgICAgICB0aGlzLnJldmVyYk5vZGUgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVDb252b2x2ZXIoKTtcclxuXHJcbiAgICAgICAgdGhpcy5yZXZlcmJOb2RlLm5vcm1hbGl6ZSA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlLnR5cGUgICAgICA9ICdoaWdocGFzcyc7XHJcbiAgICAgICAgdGhpcy5maWx0ZXJOb2RlLlEudmFsdWUgICA9IDAuNDtcclxuXHJcbiAgICAgICAgdGhpcy5nYWluTm9kZS5jb25uZWN0KHRoaXMuZmlsdGVyTm9kZSk7XHJcbiAgICAgICAgLy8gUmVzdCBvZiBub2RlcyBnZXQgY29ubmVjdGVkIHdoZW4gc3BlYWsgaXMgY2FsbGVkXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBCZWdpbnMgbG9hZGluZyBhbmQgc3BlYWtpbmcgYSBzZXQgb2Ygdm94IGZpbGVzLiBTdG9wcyBhbnkgc3BlZWNoLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpZHMgTGlzdCBvZiB2b3ggaWRzIHRvIGxvYWQgYXMgZmlsZXMsIGluIHNwZWFraW5nIG9yZGVyXHJcbiAgICAgKiBAcGFyYW0gc2V0dGluZ3MgVm9pY2Ugc2V0dGluZ3MgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzcGVhayhpZHM6IFZveEtleVtdLCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBTUEVBSzonLCBpZHMsIHNldHRpbmdzKTtcclxuXHJcbiAgICAgICAgLy8gU2V0IHN0YXRlXHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlzU3BlYWtpbmcpXHJcbiAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgICAgICA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5iZWd1blNwZWFraW5nICAgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRJZHMgICAgICA9IGlkcztcclxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyA9IHNldHRpbmdzO1xyXG5cclxuICAgICAgICAvLyBTZXQgcmV2ZXJiXHJcblxyXG4gICAgICAgIGlmICggU3RyaW5ncy5pc051bGxPckVtcHR5KHNldHRpbmdzLnZveFJldmVyYikgKVxyXG4gICAgICAgICAgICB0aGlzLnRvZ2dsZVJldmVyYihmYWxzZSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGZpbGUgICAgPSBzZXR0aW5ncy52b3hSZXZlcmIhO1xyXG4gICAgICAgICAgICBsZXQgaW1wdWxzZSA9IHRoaXMuaW1wdWxzZXNbZmlsZV07XHJcblxyXG4gICAgICAgICAgICBpZiAoIWltcHVsc2UpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIC8vIE1ha2Ugc3VyZSByZXZlcmIgaXMgb2ZmIGZpcnN0LCBlbHNlIGNsaXBzIHdpbGwgcXVldWUgaW4gdGhlIGF1ZGlvXHJcbiAgICAgICAgICAgICAgICAvLyBidWZmZXIgYW5kIGFsbCBzdWRkZW5seSBwbGF5IGF0IHRoZSBzYW1lIHRpbWUsIHdoZW4gcmV2ZXJiIGxvYWRzLlxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2dnbGVSZXZlcmIoZmFsc2UpO1xyXG5cclxuICAgICAgICAgICAgICAgIGZldGNoKGAke3RoaXMuZGF0YVBhdGh9LyR7ZmlsZX1gKVxyXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKCByZXMgPT4gcmVzLmFycmF5QnVmZmVyKCkgKVxyXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKCBidWYgPT4gU291bmRzLmRlY29kZSh0aGlzLmF1ZGlvQ29udGV4dCwgYnVmKSApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIGltcCA9PlxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2FjaGUgYnVmZmVyIGZvciBsYXRlclxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmltcHVsc2VzW2ZpbGVdICAgID0gaW1wO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJldmVyYk5vZGUuYnVmZmVyID0gaW1wO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRvZ2dsZVJldmVyYih0cnVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFJFVkVSQiBMT0FERUQnKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucmV2ZXJiTm9kZS5idWZmZXIgPSBpbXB1bHNlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50b2dnbGVSZXZlcmIodHJ1ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNldCB2b2x1bWVcclxuXHJcbiAgICAgICAgbGV0IHZvbHVtZSA9IGVpdGhlcihzZXR0aW5ncy52b2x1bWUsIDEpO1xyXG5cclxuICAgICAgICAvLyBSZW1hcHMgdGhlIDEuMS4uLjEuOSByYW5nZSB0byAyLi4uMTBcclxuICAgICAgICBpZiAodm9sdW1lID4gMSlcclxuICAgICAgICAgICAgdm9sdW1lID0gKHZvbHVtZSAqIDEwKSAtIDk7XHJcblxyXG4gICAgICAgIHRoaXMuZ2Fpbk5vZGUuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcclxuXHJcbiAgICAgICAgLy8gU2V0IGNoaW1lLCBhdCBmb3JjZWQgcGxheWJhY2sgcmF0ZSBvZiAxXHJcblxyXG4gICAgICAgIGlmICggIVN0cmluZ3MuaXNOdWxsT3JFbXB0eShzZXR0aW5ncy52b3hDaGltZSkgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHBhdGggICAgICA9IGAke3RoaXMuZGF0YVBhdGh9LyR7c2V0dGluZ3Mudm94Q2hpbWUhfWA7XHJcbiAgICAgICAgICAgIGxldCByZXEgICAgICAgPSBuZXcgVm94UmVxdWVzdChwYXRoLCAwLCB0aGlzLmF1ZGlvQ29udGV4dCk7XHJcbiAgICAgICAgICAgIHJlcS5mb3JjZVJhdGUgPSAxO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5wZW5kaW5nUmVxcy5wdXNoKHJlcSk7XHJcbiAgICAgICAgICAgIGlkcy51bnNoaWZ0KDEuMCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBCZWdpbiB0aGUgcHVtcCBsb29wLiBPbiBpT1MsIHRoZSBjb250ZXh0IG1heSBoYXZlIHRvIGJlIHJlc3VtZWQgZmlyc3RcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0LnN0YXRlID09PSAnc3VzcGVuZGVkJylcclxuICAgICAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQucmVzdW1lKCkudGhlbiggKCkgPT4gdGhpcy5wdW1wKCkgKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMucHVtcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTdG9wcyBwbGF5aW5nIGFueSBjdXJyZW50bHkgc3Bva2VuIHNwZWVjaCBhbmQgcmVzZXRzIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIEFscmVhZHkgc3RvcHBlZD8gRG8gbm90IGNvbnRpbnVlXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzU3BlYWtpbmcpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gU3RvcCBwdW1waW5nXHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMucHVtcFRpbWVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5pc1NwZWFraW5nID0gZmFsc2U7XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbGwgcGVuZGluZyByZXF1ZXN0c1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXMuZm9yRWFjaCggciA9PiByLmNhbmNlbCgpICk7XHJcblxyXG4gICAgICAgIC8vIEtpbGwgYW5kIGRlcmVmZXJlbmNlIGFueSBjdXJyZW50bHkgcGxheWluZyBmaWxlXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzLmZvckVhY2gobm9kZSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbm9kZS5zdG9wKCk7XHJcbiAgICAgICAgICAgIG5vZGUuZGlzY29ubmVjdCgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm5leHRCZWdpbiAgICAgICAgPSAwO1xyXG4gICAgICAgIHRoaXMuY3VycmVudElkcyAgICAgICA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRTZXR0aW5ncyAgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVxcyAgICAgID0gW107XHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZWRCdWZmZXJzID0gW107XHJcblxyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBTVE9QUEVEJyk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm9uc3RvcClcclxuICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFB1bXBzIHRoZSBzcGVlY2ggcXVldWUsIGJ5IGtlZXBpbmcgdXAgdG8gMTAgZmV0Y2ggcmVxdWVzdHMgZm9yIHZvaWNlIGZpbGVzIGdvaW5nLFxyXG4gICAgICogYW5kIHRoZW4gZmVlZGluZyB0aGVpciBkYXRhIChpbiBlbmZvcmNlZCBvcmRlcikgdG8gdGhlIGF1ZGlvIGNoYWluLCBvbmUgYXQgYSB0aW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHB1bXAoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBJZiB0aGUgZW5naW5lIGhhcyBzdG9wcGVkLCBkbyBub3QgcHJvY2VlZC5cclxuICAgICAgICBpZiAoIXRoaXMuaXNTcGVha2luZyB8fCAhdGhpcy5jdXJyZW50SWRzIHx8ICF0aGlzLmN1cnJlbnRTZXR0aW5ncylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGaXJzdCwgc2NoZWR1bGUgZnVsZmlsbGVkIHJlcXVlc3RzIGludG8gdGhlIGF1ZGlvIGJ1ZmZlciwgaW4gRklGTyBvcmRlclxyXG4gICAgICAgIHRoaXMuc2NoZWR1bGUoKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgZmlsbCBhbnkgZnJlZSBwZW5kaW5nIHNsb3RzIHdpdGggbmV3IHJlcXVlc3RzXHJcbiAgICAgICAgbGV0IG5leHREZWxheSA9IDA7XHJcblxyXG4gICAgICAgIHdoaWxlICh0aGlzLmN1cnJlbnRJZHNbMF0gJiYgdGhpcy5wZW5kaW5nUmVxcy5sZW5ndGggPCAxMClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSB0aGlzLmN1cnJlbnRJZHMuc2hpZnQoKSE7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiB0aGlzIGtleSBpcyBhIG51bWJlciwgaXQncyBhbiBhbW91bnQgb2Ygc2lsZW5jZSwgc28gYWRkIGl0IGFzIHRoZVxyXG4gICAgICAgICAgICAvLyBwbGF5YmFjayBkZWxheSBmb3IgdGhlIG5leHQgcGxheWFibGUgcmVxdWVzdCAoaWYgYW55KS5cclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBrZXkgPT09ICdudW1iZXInKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuZXh0RGVsYXkgKz0ga2V5O1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGxldCBwYXRoID0gYCR7dGhpcy5jdXJyZW50U2V0dGluZ3Mudm94UGF0aH0vJHtrZXl9Lm1wM2A7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdSZXFzLnB1c2goIG5ldyBWb3hSZXF1ZXN0KHBhdGgsIG5leHREZWxheSwgdGhpcy5hdWRpb0NvbnRleHQpICk7XHJcbiAgICAgICAgICAgIG5leHREZWxheSA9IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmcgd2hlbiB3ZSdyZSBvdXQgb2YgSURzIHRvIHF1ZXVlIGFuZCBub3RoaW5nIGlzIHBsYXlpbmdcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50SWRzLmxlbmd0aCAgICAgICA8PSAwKVxyXG4gICAgICAgIGlmICh0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCAgICAgIDw9IDApXHJcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGVkQnVmZmVycy5sZW5ndGggPD0gMClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RvcCgpO1xyXG5cclxuICAgICAgICB0aGlzLnB1bXBUaW1lciA9IHNldFRpbWVvdXQodGhpcy5wdW1wLmJpbmQodGhpcyksIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzY2hlZHVsZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFN0b3Agc2NoZWR1bGluZyBpZiB0aGVyZSBhcmUgbm8gcGVuZGluZyByZXF1ZXN0c1xyXG4gICAgICAgIGlmICghdGhpcy5wZW5kaW5nUmVxc1swXSB8fCAhdGhpcy5wZW5kaW5nUmVxc1swXS5pc0RvbmUpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gRG9uJ3Qgc2NoZWR1bGUgaWYgbW9yZSB0aGFuIDUgbm9kZXMgYXJlLCBhcyBub3QgdG8gYmxvdyBhbnkgYnVmZmVyc1xyXG4gICAgICAgIGlmICh0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMubGVuZ3RoID4gNSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBsZXQgcmVxID0gdGhpcy5wZW5kaW5nUmVxcy5zaGlmdCgpITtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlIG5leHQgcmVxdWVzdCBlcnJvcmVkIG91dCAoYnVmZmVyIG1pc3NpbmcpLCBza2lwIGl0XHJcbiAgICAgICAgaWYgKCFyZXEuYnVmZmVyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBDTElQIFNLSVBQRUQ6JywgcmVxLnBhdGgpO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zY2hlZHVsZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhpcyBpcyB0aGUgZmlyc3QgY2xpcCBiZWluZyBwbGF5ZWQsIHN0YXJ0IGZyb20gY3VycmVudCB3YWxsLWNsb2NrXHJcbiAgICAgICAgaWYgKHRoaXMubmV4dEJlZ2luID09PSAwKVxyXG4gICAgICAgICAgICB0aGlzLm5leHRCZWdpbiA9IHRoaXMuYXVkaW9Db250ZXh0LmN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgUVVFVUVEOicsIHJlcS5wYXRoLCByZXEuYnVmZmVyLmR1cmF0aW9uLCB0aGlzLm5leHRCZWdpbik7XHJcblxyXG4gICAgICAgIC8vIEJhc2UgbGF0ZW5jeSBub3QgYXZhaWxhYmxlIGluIHNvbWUgYnJvd3NlcnNcclxuICAgICAgICBsZXQgbGF0ZW5jeSA9ICh0aGlzLmF1ZGlvQ29udGV4dC5iYXNlTGF0ZW5jeSB8fCAwLjAxKSArIDAuMTU7XHJcbiAgICAgICAgbGV0IG5vZGUgICAgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcclxuICAgICAgICBsZXQgcmF0ZSAgICA9IHJlcS5mb3JjZVJhdGUgfHwgdGhpcy5jdXJyZW50U2V0dGluZ3MhLnJhdGUgfHwgMTtcclxuICAgICAgICBub2RlLmJ1ZmZlciA9IHJlcS5idWZmZXI7XHJcblxyXG4gICAgICAgIC8vIFJlbWFwIHJhdGUgZnJvbSAwLjEuLjEuOSB0byAwLjguLjEuNVxyXG4gICAgICAgIGlmICAgICAgKHJhdGUgPCAxKSByYXRlID0gKHJhdGUgKiAwLjIpICsgMC44O1xyXG4gICAgICAgIGVsc2UgaWYgKHJhdGUgPiAxKSByYXRlID0gKHJhdGUgKiAwLjUpICsgMC41O1xyXG5cclxuICAgICAgICAvLyBDYWxjdWxhdGUgZGVsYXkgYW5kIGR1cmF0aW9uIGJhc2VkIG9uIHBsYXliYWNrIHJhdGVcclxuICAgICAgICBsZXQgZGVsYXkgICAgPSByZXEuZGVsYXkgKiAoMSAvIHJhdGUpO1xyXG4gICAgICAgIGxldCBkdXJhdGlvbiA9IG5vZGUuYnVmZmVyLmR1cmF0aW9uICogKDEgLyByYXRlKTtcclxuXHJcbiAgICAgICAgbm9kZS5wbGF5YmFja1JhdGUudmFsdWUgPSByYXRlO1xyXG4gICAgICAgIG5vZGUuY29ubmVjdCh0aGlzLmdhaW5Ob2RlKTtcclxuICAgICAgICBub2RlLnN0YXJ0KHRoaXMubmV4dEJlZ2luICsgZGVsYXkpO1xyXG5cclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMucHVzaChub2RlKTtcclxuICAgICAgICB0aGlzLm5leHRCZWdpbiArPSAoZHVyYXRpb24gKyBkZWxheSAtIGxhdGVuY3kpO1xyXG5cclxuICAgICAgICAvLyBGaXJlIG9uLWZpcnN0LXNwZWFrIGV2ZW50XHJcbiAgICAgICAgaWYgKCF0aGlzLmJlZ3VuU3BlYWtpbmcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmJlZ3VuU3BlYWtpbmcgPSB0cnVlO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub25zcGVhaylcclxuICAgICAgICAgICAgICAgIHRoaXMub25zcGVhaygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGF2ZSB0aGlzIGJ1ZmZlciBub2RlIHJlbW92ZSBpdHNlbGYgZnJvbSB0aGUgc2NoZWR1bGUgd2hlbiBkb25lXHJcbiAgICAgICAgbm9kZS5vbmVuZGVkID0gXyA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBDTElQIEVOREVEOicsIHJlcS5wYXRoKTtcclxuICAgICAgICAgICAgbGV0IGlkeCA9IHRoaXMuc2NoZWR1bGVkQnVmZmVycy5pbmRleE9mKG5vZGUpO1xyXG5cclxuICAgICAgICAgICAgaWYgKGlkeCAhPT0gLTEpXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMuc3BsaWNlKGlkeCwgMSk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHRvZ2dsZVJldmVyYihzdGF0ZTogYm9vbGVhbikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5yZXZlcmJOb2RlLmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICB0aGlzLmZpbHRlck5vZGUuZGlzY29ubmVjdCgpO1xyXG5cclxuICAgICAgICBpZiAoc3RhdGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmZpbHRlck5vZGUuY29ubmVjdCh0aGlzLnJldmVyYk5vZGUpO1xyXG4gICAgICAgICAgICB0aGlzLnJldmVyYk5vZGUuY29ubmVjdCh0aGlzLmF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5maWx0ZXJOb2RlLmNvbm5lY3QodGhpcy5hdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHJlcXVlc3QgZm9yIGEgdm94IGZpbGUsIGltbWVkaWF0ZWx5IGJlZ3VuIG9uIGNyZWF0aW9uICovXHJcbmNsYXNzIFZveFJlcXVlc3Rcclxue1xyXG4gICAgLyoqIFJlbGF0aXZlIHJlbW90ZSBwYXRoIG9mIHRoaXMgdm9pY2UgZmlsZSByZXF1ZXN0ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHBhdGggICAgOiBzdHJpbmc7XHJcbiAgICAvKiogQW1vdW50IG9mIHNlY29uZHMgdG8gZGVsYXkgdGhlIHBsYXliYWNrIG9mIHRoaXMgcmVxdWVzdCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBkZWxheSAgIDogbnVtYmVyO1xyXG4gICAgLyoqIEF1ZGlvIGNvbnRleHQgdG8gdXNlIGZvciBkZWNvZGluZyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0IDogQXVkaW9Db250ZXh0O1xyXG4gICAgLyoqIEFib3J0IGNvbnRyb2xsZXIgdG8gYWxsb3cgdGhlIGZldGNoIHRvIGJlIGFib3J0ZWQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYWJvcnQgICA6IEFib3J0Q29udHJvbGxlcjtcclxuXHJcbiAgICAvKiogV2hldGhlciB0aGlzIHJlcXVlc3QgaXMgZG9uZSBhbmQgcmVhZHkgZm9yIGhhbmRsaW5nIChldmVuIGlmIGZhaWxlZCkgKi9cclxuICAgIHB1YmxpYyBpc0RvbmUgICAgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFJhdyBhdWRpbyBkYXRhIGZyb20gdGhlIGxvYWRlZCBmaWxlLCBpZiBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBidWZmZXI/ICAgIDogQXVkaW9CdWZmZXI7XHJcbiAgICAvKiogUGxheWJhY2sgcmF0ZSB0byBmb3JjZSB0aGlzIGNsaXAgdG8gcGxheSBhdCAqL1xyXG4gICAgcHVibGljIGZvcmNlUmF0ZT8gOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgZGVsYXk6IG51bWJlciwgY29udGV4dDogQXVkaW9Db250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1ZPWCBSRVFVRVNUOicsIHBhdGgpO1xyXG4gICAgICAgIHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XHJcbiAgICAgICAgdGhpcy5wYXRoICAgID0gcGF0aDtcclxuICAgICAgICB0aGlzLmRlbGF5ICAgPSBkZWxheTtcclxuICAgICAgICB0aGlzLmFib3J0ICAgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XHJcblxyXG4gICAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3dlYi91cGRhdGVzLzIwMTcvMDkvYWJvcnRhYmxlLWZldGNoXHJcbiAgICAgICAgZmV0Y2gocGF0aCwgeyBzaWduYWwgOiB0aGlzLmFib3J0LnNpZ25hbCB9KVxyXG4gICAgICAgICAgICAudGhlbiAoIHRoaXMub25GdWxmaWxsLmJpbmQodGhpcykgKVxyXG4gICAgICAgICAgICAuY2F0Y2goIHRoaXMub25FcnJvci5iaW5kKHRoaXMpICAgKTtcclxuXHJcbiAgICAgICAgLy8gVGltZW91dCBhbGwgZmV0Y2hlcyBieSAxMCBzZWNvbmRzXHJcbiAgICAgICAgc2V0VGltZW91dChfID0+IHRoaXMuYWJvcnQuYWJvcnQoKSwgMTAgKiAxMDAwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2FuY2VscyB0aGlzIHJlcXVlc3QgZnJvbSBwcm9jZWVkaW5nIGFueSBmdXJ0aGVyICovXHJcbiAgICBwdWJsaWMgY2FuY2VsKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5hYm9ydC5hYm9ydCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBCZWdpbnMgZGVjb2RpbmcgdGhlIGxvYWRlZCBNUDMgdm9pY2UgZmlsZSB0byByYXcgYXVkaW8gZGF0YSAqL1xyXG4gICAgcHJpdmF0ZSBvbkZ1bGZpbGwocmVzOiBSZXNwb25zZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCFyZXMub2spXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKGBWT1ggTk9UIEZPVU5EOiAke3Jlcy5zdGF0dXN9IEAgJHt0aGlzLnBhdGh9YCk7XHJcblxyXG4gICAgICAgIHJlcy5hcnJheUJ1ZmZlcigpLnRoZW4oIHRoaXMub25BcnJheUJ1ZmZlci5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFRha2VzIHRoZSBhcnJheSBidWZmZXIgZnJvbSB0aGUgZnVsZmlsbGVkIGZldGNoIGFuZCBkZWNvZGVzIGl0ICovXHJcbiAgICBwcml2YXRlIG9uQXJyYXlCdWZmZXIoYnVmZmVyOiBBcnJheUJ1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgU291bmRzLmRlY29kZSh0aGlzLmNvbnRleHQsIGJ1ZmZlcilcclxuICAgICAgICAgICAgLnRoZW4gKCB0aGlzLm9uRGVjb2RlLmJpbmQodGhpcykgKVxyXG4gICAgICAgICAgICAuY2F0Y2goIHRoaXMub25FcnJvci5iaW5kKHRoaXMpICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiB0aGUgZmV0Y2hlZCBidWZmZXIgaXMgZGVjb2RlZCBzdWNjZXNzZnVsbHkgKi9cclxuICAgIHByaXZhdGUgb25EZWNvZGUoYnVmZmVyOiBBdWRpb0J1ZmZlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5idWZmZXIgPSBidWZmZXI7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxsZWQgaWYgdGhlIGZldGNoIG9yIGRlY29kZSBzdGFnZXMgZmFpbCAqL1xyXG4gICAgcHJpdmF0ZSBvbkVycm9yKGVycjogYW55KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnUkVRVUVTVCBGQUlMOicsIGVycik7XHJcbiAgICAgICAgdGhpcy5pc0RvbmUgPSB0cnVlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLyBUT0RPOiBNYWtlIGFsbCB2aWV3cyB1c2UgdGhpcyBjbGFzc1xyXG4vKiogQmFzZSBjbGFzcyBmb3IgYSB2aWV3OyBhbnl0aGluZyB3aXRoIGEgYmFzZSBET00gZWxlbWVudCAqL1xyXG5hYnN0cmFjdCBjbGFzcyBWaWV3QmFzZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgdmlldydzIHByaW1hcnkgRE9NIGVsZW1lbnQgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBkb20gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyB0aGlzIGJhc2UgdmlldywgYXR0YWNoaW5nIGl0IHRvIHRoZSBlbGVtZW50IG1hdGNoaW5nIHRoZSBnaXZlbiBxdWVyeSAqL1xyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKGRvbVF1ZXJ5OiBzdHJpbmcgfCBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICBpZiAodHlwZW9mIGRvbVF1ZXJ5ID09PSAnc3RyaW5nJylcclxuICAgICAgICAgICAgdGhpcy5kb20gPSBET00ucmVxdWlyZShkb21RdWVyeSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmRvbSA9IGRvbVF1ZXJ5O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoaXMgdmlldydzIGNoaWxkIGVsZW1lbnQgbWF0Y2hpbmcgdGhlIGdpdmVuIHF1ZXJ5ICovXHJcbiAgICBwcm90ZWN0ZWQgYXR0YWNoPFQgZXh0ZW5kcyBIVE1MRWxlbWVudD4ocXVlcnk6IHN0cmluZykgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIERPTS5yZXF1aXJlKHF1ZXJ5LCB0aGlzLmRvbSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLzxyZWZlcmVuY2UgcGF0aD1cInZpZXdCYXNlLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBkaXNjbGFpbWVyIHNjcmVlbiAqL1xyXG5jbGFzcyBEaXNjbGFpbWVyIGV4dGVuZHMgVmlld0Jhc2Vcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgXCJjb250aW51ZVwiIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5EaXNtaXNzIDogSFRNTEJ1dHRvbkVsZW1lbnQgPSB0aGlzLmF0dGFjaCgnI2J0bkRpc21pc3MnKTtcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBsYXN0IGZvY3VzZWQgZWxlbWVudCwgaWYgYW55ICovXHJcbiAgICBwcml2YXRlIGxhc3RBY3RpdmU/IDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignI2Rpc2NsYWltZXJTY3JlZW4nKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogT3BlbnMgdGhlIGRpc2NsYWltZXIgZm9yIGZpcnN0IHRpbWUgdXNlcnMgKi9cclxuICAgIHB1YmxpYyBkaXNjbGFpbSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmIChSQUcuY29uZmlnLnJlYWREaXNjbGFpbWVyKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMubGFzdEFjdGl2ZSAgICAgICAgID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBSQUcudmlld3MubWFpbi5oaWRkZW4gICA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuICAgICAgICAgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmJ0bkRpc21pc3Mub25jbGljayA9IHRoaXMub25EaXNtaXNzLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5EaXNtaXNzLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBlcnNpc3RzIHRoZSBkaXNtaXNzYWwgdG8gc3RvcmFnZSBhbmQgcmVzdG9yZXMgdGhlIG1haW4gc2NyZWVuICovXHJcbiAgICBwcml2YXRlIG9uRGlzbWlzcygpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5jb25maWcucmVhZERpc2NsYWltZXIgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiAgICAgICAgICAgPSB0cnVlO1xyXG4gICAgICAgIFJBRy52aWV3cy5tYWluLmhpZGRlbiAgICAgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmJ0bkRpc21pc3Mub25jbGljayAgID0gbnVsbDtcclxuICAgICAgICBSQUcuY29uZmlnLnNhdmUoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMubGFzdEFjdGl2ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEFjdGl2ZS5mb2N1cygpO1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RBY3RpdmUgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHBocmFzZSBlZGl0b3IgKi9cclxuY2xhc3MgRWRpdG9yXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSBjb250YWluZXIgZm9yIHRoZSBlZGl0b3IgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIGRpYWxvZywgaWYgYW55ICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRQaWNrZXI/IDogUGlja2VyO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGhyYXNlIGVsZW1lbnQgY3VycmVudGx5IGJlaW5nIGVkaXRlZCwgaWYgYW55ICovXHJcbiAgICAvLyBEbyBub3QgRFJZOyBuZWVkcyB0byBiZSBwYXNzZWQgdG8gdGhlIHBpY2tlciBmb3IgY2xlYW5lciBjb2RlXHJcbiAgICBwcml2YXRlIGRvbUVkaXRpbmc/ICAgIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSA9IERPTS5yZXF1aXJlKCcjZWRpdG9yJyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmJvZHkub25jbGljayA9IHRoaXMub25DbGljay5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHdpbmRvdy5vbnJlc2l6ZSAgICAgICA9IHRoaXMub25SZXNpemUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbS5vbnNjcm9sbCAgICAgPSB0aGlzLm9uU2Nyb2xsLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb20udGV4dENvbnRlbnQgID0gTC5FRElUT1JfSU5JVCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyB0aGUgZWRpdG9yIHdpdGggYSByb290IHBocmFzZXNldCByZWZlcmVuY2UsIGFuZCBleHBhbmRzIGl0IGludG8gSFRNTCAqL1xyXG4gICAgcHVibGljIGdlbmVyYXRlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJzxwaHJhc2VzZXQgcmVmPVwicm9vdFwiIC8+JztcclxuXHJcbiAgICAgICAgUkFHLnBocmFzZXIucHJvY2Vzcyh0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5hdHRhY2hDb250cm9scygpO1xyXG5cclxuICAgICAgICAvLyBGb3Igc2Nyb2xsLXBhc3QgcGFkZGluZyB1bmRlciB0aGUgcGhyYXNlXHJcbiAgICAgICAgbGV0IHBhZGRpbmcgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcbiAgICAgICAgcGFkZGluZy5jbGFzc05hbWUgPSAnYm90dG9tUGFkZGluZyc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLmFwcGVuZENoaWxkKHBhZGRpbmcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXByb2Nlc3NlcyBhbGwgcGhyYXNlc2V0IGVsZW1lbnRzIG9mIHRoZSBnaXZlbiByZWYsIGlmIHRoZWlyIGluZGV4IGhhcyBjaGFuZ2VkICovXHJcbiAgICBwdWJsaWMgcmVmcmVzaFBocmFzZXNldChyZWY6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gTm90ZSwgdGhpcyBjb3VsZCBwb3RlbnRpYWxseSBidWcgb3V0IGlmIGEgcGhyYXNlc2V0J3MgZGVzY2VuZGFudCByZWZlcmVuY2VzXHJcbiAgICAgICAgLy8gdGhlIHNhbWUgcGhyYXNlc2V0IChyZWN1cnNpb24pLiBCdXQgdGhpcyBpcyBva2F5IGJlY2F1c2UgcGhyYXNlc2V0cyBzaG91bGRcclxuICAgICAgICAvLyBuZXZlciBpbmNsdWRlIHRoZW1zZWx2ZXMsIGV2ZW4gZXZlbnR1YWxseS5cclxuXHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChgc3BhbltkYXRhLXR5cGU9cGhyYXNlc2V0XVtkYXRhLXJlZj0ke3JlZn1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goXyA9PlxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCAgICA9IF8gYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBsZXQgbmV3RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3BocmFzZXNldCcpO1xyXG4gICAgICAgICAgICAgICAgbGV0IGNoYW5jZSAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddO1xyXG5cclxuICAgICAgICAgICAgICAgIG5ld0VsZW1lbnQuc2V0QXR0cmlidXRlKCdyZWYnLCByZWYpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChjaGFuY2UpXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2NoYW5jZScsIGNoYW5jZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZWxlbWVudC5wYXJlbnRFbGVtZW50IS5yZXBsYWNlQ2hpbGQobmV3RWxlbWVudCwgZWxlbWVudCk7XHJcbiAgICAgICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKG5ld0VsZW1lbnQucGFyZW50RWxlbWVudCEpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdHRhY2hDb250cm9scygpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSBzdGF0aWMgTm9kZUxpc3Qgb2YgYWxsIHBocmFzZSBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gcXVlcnkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IFF1ZXJ5IHN0cmluZyB0byBhZGQgb250byB0aGUgYHNwYW5gIHNlbGVjdG9yXHJcbiAgICAgKiBAcmV0dXJucyBOb2RlIGxpc3Qgb2YgYWxsIGVsZW1lbnRzIG1hdGNoaW5nIHRoZSBnaXZlbiBzcGFuIHF1ZXJ5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRFbGVtZW50c0J5UXVlcnkocXVlcnk6IHN0cmluZykgOiBOb2RlTGlzdFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuJHtxdWVyeX1gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCBwaHJhc2UncyByb290IERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgZ2V0UGhyYXNlKCkgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRvbS5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY3VycmVudCBwaHJhc2UgaW4gdGhlIGVkaXRvciBhcyB0ZXh0LCBleGNsdWRpbmcgdGhlIGhpZGRlbiBwYXJ0cyAqL1xyXG4gICAgcHVibGljIGdldFRleHQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHRoaXMuZG9tKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIGFsbCBwaHJhc2UgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHR5cGUsIGFuZCBzZXRzIHRoZWlyIHRleHQgdG8gZ2l2ZW4gdmFsdWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHR5cGUgT3JpZ2luYWwgWE1MIG5hbWUgb2YgZWxlbWVudHMgdG8gcmVwbGFjZSBjb250ZW50cyBvZlxyXG4gICAgICogQHBhcmFtIHZhbHVlIE5ldyB0ZXh0IGZvciB0aGUgZm91bmQgZWxlbWVudHMgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRFbGVtZW50c1RleHQodHlwZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmdldEVsZW1lbnRzQnlRdWVyeShgW2RhdGEtdHlwZT0ke3R5cGV9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIGFueSBjdXJyZW50bHkgb3BlbiBlZGl0b3IgZGlhbG9ncyAqL1xyXG4gICAgcHVibGljIGNsb3NlRGlhbG9nKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmNsb3NlKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmRvbUVkaXRpbmcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmRvbUVkaXRpbmcucmVtb3ZlQXR0cmlidXRlKCdlZGl0aW5nJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdhYm92ZScsICdiZWxvdycpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyAgICA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgYXR0YWNoZXMgVUkgY29udHJvbHMgZm9yIGNlcnRhaW4gcGhyYXNlIGVsZW1lbnRzICovXHJcbiAgICBwcml2YXRlIGF0dGFjaENvbnRyb2xzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtdHlwZT1waHJhc2VzZXRdJykuZm9yRWFjaChzcGFuID0+XHJcbiAgICAgICAgICAgIFBocmFzZXNldEJ1dHRvbi5jcmVhdGVBbmRBdHRhY2goc3BhbilcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1jaGFuY2VdJykuZm9yRWFjaChzcGFuID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS5jcmVhdGVBbmRBdHRhY2goc3Bhbik7XHJcbiAgICAgICAgICAgIENvbGxhcHNlVG9nZ2xlLnVwZGF0ZShzcGFuIGFzIEhUTUxFbGVtZW50KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBhIGNsaWNrIGFueXdoZXJlIGluIHRoZSB3aW5kb3cgZGVwZW5kaW5nIG9uIHRoZSBjb250ZXh0ICovXHJcbiAgICBwcml2YXRlIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSBldi50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IHR5cGUgICA9IHRhcmdldCA/IHRhcmdldC5kYXRhc2V0Wyd0eXBlJ10gICAgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgbGV0IHBpY2tlciA9IHR5cGUgICA/IFJBRy52aWV3cy5nZXRQaWNrZXIodHlwZSkgOiB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgIGlmICghdGFyZ2V0KVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIG9mIGlubmVyIGVsZW1lbnRzXHJcbiAgICAgICAgaWYgKCB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdpbm5lcicpIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgY2xpY2tzIHRvIGFueSBpbm5lciBkb2N1bWVudCBvciB1bm93bmVkIGVsZW1lbnRcclxuICAgICAgICBpZiAoICFkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3MgdG8gYW55IGVsZW1lbnQgb2YgYWxyZWFkeSBvcGVuIHBpY2tlcnNcclxuICAgICAgICBpZiAoIHRoaXMuY3VycmVudFBpY2tlciApXHJcbiAgICAgICAgaWYgKCB0aGlzLmN1cnJlbnRQaWNrZXIuZG9tLmNvbnRhaW5zKHRhcmdldCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIENhbmNlbCBhbnkgb3BlbiBlZGl0b3JzXHJcbiAgICAgICAgbGV0IHByZXZUYXJnZXQgPSB0aGlzLmRvbUVkaXRpbmc7XHJcbiAgICAgICAgdGhpcy5jbG9zZURpYWxvZygpO1xyXG5cclxuICAgICAgICAvLyBEb24ndCBoYW5kbGUgcGhyYXNlIG9yIHBocmFzZXNldHMgLSBvbmx5IHZpYSB0aGVpciBidXR0b25zXHJcbiAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2UnIHx8IHR5cGUgPT09ICdwaHJhc2VzZXQnKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElmIGNsaWNraW5nIHRoZSBlbGVtZW50IGFscmVhZHkgYmVpbmcgZWRpdGVkLCBkb24ndCByZW9wZW5cclxuICAgICAgICBpZiAodGFyZ2V0ID09PSBwcmV2VGFyZ2V0KVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCB0b2dnbGUgICAgICAgPSB0YXJnZXQuY2xvc2VzdCgnLnRvZ2dsZScpICAgICAgIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGxldCBjaG9vc2VQaHJhc2UgPSB0YXJnZXQuY2xvc2VzdCgnLmNob29zZVBocmFzZScpIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgY29sbGFwc2libGUgZWxlbWVudHNcclxuICAgICAgICBpZiAodG9nZ2xlKVxyXG4gICAgICAgICAgICB0aGlzLnRvZ2dsZUNvbGxhcHNpYWJsZSh0b2dnbGUpO1xyXG5cclxuICAgICAgICAvLyBTcGVjaWFsIGNhc2UgZm9yIHBocmFzZXNldCBjaG9vc2VyXHJcbiAgICAgICAgZWxzZSBpZiAoY2hvb3NlUGhyYXNlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gVE9ETzogQXNzZXJ0IGhlcmU/XHJcbiAgICAgICAgICAgIHRhcmdldCA9IGNob29zZVBocmFzZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICAgICAgcGlja2VyID0gUkFHLnZpZXdzLmdldFBpY2tlcih0YXJnZXQuZGF0YXNldFsndHlwZSddISk7XHJcbiAgICAgICAgICAgIHRoaXMub3BlblBpY2tlcih0YXJnZXQsIHBpY2tlcik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBGaW5kIGFuZCBvcGVuIHBpY2tlciBmb3IgdGhlIHRhcmdldCBlbGVtZW50XHJcbiAgICAgICAgZWxzZSBpZiAodHlwZSAmJiBwaWNrZXIpXHJcbiAgICAgICAgICAgIHRoaXMub3BlblBpY2tlcih0YXJnZXQsIHBpY2tlcik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlLWxheW91dCB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIG9uIHJlc2l6ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblJlc2l6ZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZS1sYXlvdXQgdGhlIGN1cnJlbnRseSBvcGVuIHBpY2tlciBvbiBzY3JvbGwgKi9cclxuICAgIHByaXZhdGUgb25TY3JvbGwoXzogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIFdvcmthcm91bmQgZm9yIGxheW91dCBiZWhhdmluZyB3ZWlyZCB3aGVuIGlPUyBrZXlib2FyZCBpcyBvcGVuXHJcbiAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyLmhhc0ZvY3VzKCkpXHJcbiAgICAgICAgICAgIERPTS5ibHVyQWN0aXZlKCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFBpY2tlci5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZsaXBzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlLCBhbmQgcHJvcGFnYXRlcyB0aGUgbmV3IHN0YXRlIHRvIG90aGVyXHJcbiAgICAgKiBjb2xsYXBzaWJsZXMgb2YgdGhlIHNhbWUgcmVmZXJlbmNlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgQ29sbGFwc2libGUgZWxlbWVudCBiZWluZyB0b2dnbGVkXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdG9nZ2xlQ29sbGFwc2lhYmxlKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgICAgID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgIGxldCByZWYgICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHBhcmVudCwgJ3JlZicpO1xyXG4gICAgICAgIGxldCB0eXBlICAgICAgID0gRE9NLnJlcXVpcmVEYXRhKHBhcmVudCwgJ3R5cGUnKTtcclxuICAgICAgICBsZXQgY29sbGFwYXNlZCA9IHBhcmVudC5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpO1xyXG5cclxuICAgICAgICAvLyBQcm9wYWdhdGUgbmV3IGNvbGxhcHNlIHN0YXRlIHRvIGFsbCBjb2xsYXBzaWJsZXMgb2YgdGhlIHNhbWUgcmVmXHJcbiAgICAgICAgdGhpcy5kb20ucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgYHNwYW5bZGF0YS10eXBlPSR7dHlwZX1dW2RhdGEtcmVmPSR7cmVmfV1bZGF0YS1jaGFuY2VdYFxyXG4gICAgICAgICkuZm9yRWFjaChzcGFuID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIENvbGxhcHNpYmxlcy5zZXQoc3BhbiBhcyBIVE1MRWxlbWVudCwgIWNvbGxhcGFzZWQpO1xyXG4gICAgICAgICAgICAgICAgQ29sbGFwc2VUb2dnbGUudXBkYXRlKHNwYW4gYXMgSFRNTEVsZW1lbnQpO1xyXG4gICAgICAgICAgICAgICAgLy8gRG9uJ3QgbW92ZSB0aGlzIHRvIENvbGxhcHNpYmxlcy5zZXQsIGFzIHN0YXRlIHNhdmUvbG9hZCBpcyBoYW5kbGVkXHJcbiAgICAgICAgICAgICAgICAvLyBvdXRzaWRlIGluIGJvdGggdXNhZ2VzIG9mIHNldENvbGxhcHNpYmxlLlxyXG4gICAgICAgICAgICAgICAgUkFHLnN0YXRlLnNldENvbGxhcHNlZChyZWYsICFjb2xsYXBhc2VkKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBPcGVucyBhIHBpY2tlciBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBFZGl0b3IgZWxlbWVudCB0byBvcGVuIHRoZSBwaWNrZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gcGlja2VyIFBpY2tlciB0byBvcGVuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb3BlblBpY2tlcih0YXJnZXQ6IEhUTUxFbGVtZW50LCBwaWNrZXI6IFBpY2tlcikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGFyZ2V0LnNldEF0dHJpYnV0ZSgnZWRpdGluZycsICd0cnVlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFBpY2tlciA9IHBpY2tlcjtcclxuICAgICAgICB0aGlzLmRvbUVkaXRpbmcgICAgPSB0YXJnZXQ7XHJcbiAgICAgICAgcGlja2VyLm9wZW4odGFyZ2V0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzY3JvbGxpbmcgbWFycXVlZSAqL1xyXG5jbGFzcyBNYXJxdWVlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1hcnF1ZWUncyBET00gZWxlbWVudCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzcGFuIGVsZW1lbnQgaW4gdGhlIG1hcnF1ZWUsIHdoZXJlIHRoZSB0ZXh0IGlzIHNldCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21TcGFuIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSBJRCBmb3IgdGhlIHNjcm9sbGluZyBhbmltYXRpb24gdGltZXIgKi9cclxuICAgIHByaXZhdGUgdGltZXIgIDogbnVtYmVyID0gMDtcclxuICAgIC8qKiBDdXJyZW50IG9mZnNldCAoaW4gcGl4ZWxzKSBvZiB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUgKi9cclxuICAgIHByaXZhdGUgb2Zmc2V0IDogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tICAgICA9IERPTS5yZXF1aXJlKCcjbWFycXVlZScpO1xyXG4gICAgICAgIHRoaXMuZG9tU3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20uaW5uZXJIVE1MID0gJyc7XHJcbiAgICAgICAgdGhpcy5kb20uYXBwZW5kQ2hpbGQodGhpcy5kb21TcGFuKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgbWVzc2FnZSBvbiB0aGUgc2Nyb2xsaW5nIG1hcnF1ZWUsIGFuZCBzdGFydHMgYW5pbWF0aW5nIGl0ICovXHJcbiAgICBwdWJsaWMgc2V0KG1zZzogc3RyaW5nLCBhbmltYXRlOiBib29sZWFuID0gdHJ1ZSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbVNwYW4udGV4dENvbnRlbnQgICAgID0gbXNnO1xyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuXHJcbiAgICAgICAgaWYgKCFhbmltYXRlKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEkgdHJpZWQgdG8gdXNlIENTUyBhbmltYXRpb24gZm9yIHRoaXMsIGJ1dCBjb3VsZG4ndCBmaWd1cmUgb3V0IGhvdyBmb3IgYVxyXG4gICAgICAgIC8vIGR5bmFtaWNhbGx5IHNpemVkIGVsZW1lbnQgbGlrZSB0aGUgc3Bhbi5cclxuICAgICAgICB0aGlzLm9mZnNldCA9IHRoaXMuZG9tLmNsaWVudFdpZHRoO1xyXG4gICAgICAgIGxldCBsaW1pdCAgID0gLXRoaXMuZG9tU3Bhbi5jbGllbnRXaWR0aCAtIDEwMDtcclxuICAgICAgICBsZXQgYW5pbSAgICA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLm9mZnNldCAgICAgICAgICAgICAgICAgIC09IDY7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gID0gYHRyYW5zbGF0ZVgoJHt0aGlzLm9mZnNldH1weClgO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMub2Zmc2V0IDwgbGltaXQpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbVNwYW4uc3R5bGUudHJhbnNmb3JtID0gJyc7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHRoaXMudGltZXIgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW0pO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHRoZSBjdXJyZW50IG1hcnF1ZWUgYW5pbWF0aW9uICovXHJcbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLnRpbWVyKTtcclxuICAgICAgICB0aGlzLmRvbVNwYW4uc3R5bGUudHJhbnNmb3JtID0gJyc7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cblxuLy8vPHJlZmVyZW5jZSBwYXRoPVwidmlld0Jhc2UudHNcIi8+XG5cbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2V0dGluZ3Mgc2NyZWVuICovXG5jbGFzcyBTZXR0aW5ncyBleHRlbmRzIFZpZXdCYXNlXG57XG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5SZXNldCAgICAgICAgID1cbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxCdXR0b25FbGVtZW50PiAoJyNidG5SZXNldFNldHRpbmdzJyk7XG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5TYXZlICAgICAgICAgID1cbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxCdXR0b25FbGVtZW50PiAoJyNidG5TYXZlU2V0dGluZ3MnKTtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNoa1VzZVZveCAgICAgICAgPVxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI2Noa1VzZVZveCcpO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgaGludFVzZVZveCAgICAgICA9XG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MRWxlbWVudD4gICAgICAgKCcjaGludFVzZVZveCcpO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VsVm94Vm9pY2UgICAgICA9XG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsVm94Vm9pY2UnKTtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0Vm94UGF0aCAgICAgPVxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI2lucHV0Vm94UGF0aCcpO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VsVm94UmV2ZXJiICAgICA9XG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsVm94UmV2ZXJiJyk7XG4gICAgcHJpdmF0ZSByZWFkb25seSBzZWxWb3hDaGltZSAgICAgID1cbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxTZWxlY3RFbGVtZW50PiAoJyNzZWxWb3hDaGltZScpO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VsU3BlZWNoVm9pY2UgICA9XG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsU3BlZWNoQ2hvaWNlJyk7XG4gICAgcHJpdmF0ZSByZWFkb25seSByYW5nZVNwZWVjaFZvbCAgID1cbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNyYW5nZVNwZWVjaFZvbCcpO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hQaXRjaCA9XG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjcmFuZ2VTcGVlY2hQaXRjaCcpO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hSYXRlICA9XG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjcmFuZ2VTcGVlY2hSYXRlJyk7XG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5TcGVlY2hUZXN0ICAgID1cbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxCdXR0b25FbGVtZW50PiAoJyNidG5TcGVlY2hUZXN0Jyk7XG5cbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSB0aW1lciBmb3IgdGhlIFwiUmVzZXRcIiBidXR0b24gY29uZmlybWF0aW9uIHN0ZXAgKi9cbiAgICBwcml2YXRlIHJlc2V0VGltZW91dD8gOiBudW1iZXI7XG5cbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxuICAgIHtcbiAgICAgICAgc3VwZXIoJyNzZXR0aW5nc1NjcmVlbicpO1xuICAgICAgICAvLyBUT0RPOiBDaGVjayBpZiBWT1ggaXMgYXZhaWxhYmxlLCBkaXNhYmxlIGlmIG5vdFxuXG4gICAgICAgIHRoaXMuYnRuUmVzZXQub25jbGljayAgICAgID0gdGhpcy5oYW5kbGVSZXNldC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmJ0blNhdmUub25jbGljayAgICAgICA9IHRoaXMuaGFuZGxlU2F2ZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmNoa1VzZVZveC5vbmNoYW5nZSAgICA9IHRoaXMubGF5b3V0LmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuc2VsVm94Vm9pY2Uub25jaGFuZ2UgID0gdGhpcy5sYXlvdXQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5idG5TcGVlY2hUZXN0Lm9uY2xpY2sgPSB0aGlzLmhhbmRsZVZvaWNlVGVzdC5iaW5kKHRoaXMpO1xuXG4gICAgICAgIC8vIFBvcHVsYXRlIGxpc3Qgb2YgaW1wdWxzZSByZXNwb25zZSBmaWxlc1xuICAgICAgICBET00ucG9wdWxhdGUodGhpcy5zZWxWb3hSZXZlcmIsIFZveEVuZ2luZS5SRVZFUkJTLCBSQUcuY29uZmlnLnZveFJldmVyYik7XG5cbiAgICAgICAgLy8gUG9wdWxhdGUgdGhlIGxlZ2FsICYgYWNrbm93bGVkZ2VtZW50cyBibG9ja1xuICAgICAgICBMaW5rZG93bi5sb2FkSW50bygnQUJPVVQubWQnLCAnI2Fib3V0QmxvY2snKTtcbiAgICB9XG5cbiAgICAvKiogT3BlbnMgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xuICAgIHB1YmxpYyBvcGVuKCkgOiB2b2lkXG4gICAge1xuICAgICAgICAvLyBUaGUgdm9pY2UgbGlzdCBoYXMgdG8gYmUgcG9wdWxhdGVkIGVhY2ggb3BlbiwgaW4gY2FzZSBpdCBjaGFuZ2VzXG4gICAgICAgIHRoaXMucG9wdWxhdGVWb2ljZUxpc3QoKTtcblxuICAgICAgICBpZiAoIVJBRy5zcGVlY2gudm94QXZhaWxhYmxlKVxuICAgICAgICB7XG4gICAgICAgICAgICAvLyBUT0RPIDogTG9jYWxpemVcbiAgICAgICAgICAgIHRoaXMuY2hrVXNlVm94LmNoZWNrZWQgICAgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuY2hrVXNlVm94LmRpc2FibGVkICAgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5oaW50VXNlVm94LmlubmVySFRNTCA9ICc8c3Ryb25nPlZPWCBlbmdpbmU8L3N0cm9uZz4gaXMgdW5hdmFpbGFibGUuJyArXG4gICAgICAgICAgICAgICAgJyBZb3VyIGJyb3dzZXIgb3IgZGV2aWNlIG1heSBub3QgYmUgc3VwcG9ydGVkOyBwbGVhc2UgY2hlY2sgdGhlIGNvbnNvbGUnICtcbiAgICAgICAgICAgICAgICAnIGZvciBtb3JlIGluZm9ybWF0aW9uLic7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5jaGtVc2VWb3guY2hlY2tlZCA9IFJBRy5jb25maWcudm94RW5hYmxlZDtcblxuICAgICAgICB0aGlzLnNlbFZveFZvaWNlLnZhbHVlICAgICAgICAgICAgICA9IFJBRy5jb25maWcudm94UGF0aDtcbiAgICAgICAgdGhpcy5pbnB1dFZveFBhdGgudmFsdWUgICAgICAgICAgICAgPSBSQUcuY29uZmlnLnZveEN1c3RvbVBhdGg7XG4gICAgICAgIHRoaXMuc2VsVm94UmV2ZXJiLnZhbHVlICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hSZXZlcmI7XG4gICAgICAgIHRoaXMuc2VsVm94Q2hpbWUudmFsdWUgICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hDaGltZTtcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZS52YWx1ZSAgICAgICAgICAgPSBSQUcuY29uZmlnLnNwZWVjaFZvaWNlO1xuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoVm9sLnZhbHVlQXNOdW1iZXIgICA9IFJBRy5jb25maWcuc3BlZWNoVm9sO1xuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoUGl0Y2gudmFsdWVBc051bWJlciA9IFJBRy5jb25maWcuc3BlZWNoUGl0Y2g7XG4gICAgICAgIHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlQXNOdW1iZXIgID0gUkFHLmNvbmZpZy5zcGVlY2hSYXRlO1xuXG4gICAgICAgIHRoaXMubGF5b3V0KCk7XG4gICAgICAgIHRoaXMuZG9tLmhpZGRlbiAgICAgICA9IGZhbHNlO1xuICAgICAgICBSQUcudmlld3MubWFpbi5oaWRkZW4gPSB0cnVlO1xuICAgICAgICB0aGlzLmJ0blNhdmUuZm9jdXMoKTtcbiAgICB9XG5cbiAgICAvKiogQ2xvc2VzIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIHRoaXMuY2FuY2VsUmVzZXQoKTtcbiAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XG4gICAgICAgIFJBRy52aWV3cy5tYWluLmhpZGRlbiA9IGZhbHNlO1xuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gICAgICAgPSB0cnVlO1xuICAgICAgICBSQUcudmlld3MudG9vbGJhci5idG5PcHRpb24uZm9jdXMoKTtcbiAgICB9XG5cbiAgICAvKiogQ2FsY3VsYXRlcyBmb3JtIGxheW91dCBhbmQgY29udHJvbCB2aXNpYmlsaXR5IGJhc2VkIG9uIHN0YXRlICovXG4gICAgcHJpdmF0ZSBsYXlvdXQoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCB2b3hFbmFibGVkID0gdGhpcy5jaGtVc2VWb3guY2hlY2tlZDtcbiAgICAgICAgbGV0IHZveEN1c3RvbSAgPSAodGhpcy5zZWxWb3hWb2ljZS52YWx1ZSA9PT0gJycpO1xuXG4gICAgICAgIERPTS50b2dnbGVIaWRkZW5BbGwoXG4gICAgICAgICAgICBbdGhpcy5zZWxTcGVlY2hWb2ljZSwgICAhdm94RW5hYmxlZF0sXG4gICAgICAgICAgICBbdGhpcy5yYW5nZVNwZWVjaFBpdGNoLCAhdm94RW5hYmxlZF0sXG4gICAgICAgICAgICBbdGhpcy5zZWxWb3hWb2ljZSwgICAgICAgdm94RW5hYmxlZF0sXG4gICAgICAgICAgICBbdGhpcy5pbnB1dFZveFBhdGgsICAgICAgdm94RW5hYmxlZCAmJiB2b3hDdXN0b21dLFxuICAgICAgICAgICAgW3RoaXMuc2VsVm94UmV2ZXJiLCAgICAgIHZveEVuYWJsZWRdLFxuICAgICAgICAgICAgW3RoaXMuc2VsVm94Q2hpbWUsICAgICAgIHZveEVuYWJsZWRdXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgLyoqIENsZWFycyBhbmQgcG9wdWxhdGVzIHRoZSB2b2ljZSBsaXN0ICovXG4gICAgcHJpdmF0ZSBwb3B1bGF0ZVZvaWNlTGlzdCgpIDogdm9pZFxuICAgIHtcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZS5pbm5lckhUTUwgPSAnJztcblxuICAgICAgICBsZXQgdm9pY2VzID0gUkFHLnNwZWVjaC5icm93c2VyVm9pY2VzO1xuXG4gICAgICAgIC8vIEhhbmRsZSBlbXB0eSBsaXN0XG4gICAgICAgIGlmICh2b2ljZXMgPT09IHt9KVxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgb3B0aW9uICAgICAgPSBET00uYWRkT3B0aW9uKCB0aGlzLnNlbFNwZWVjaFZvaWNlLCBMLlNUX1NQRUVDSF9FTVBUWSgpICk7XG4gICAgICAgICAgICBvcHRpb24uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9TcGVlY2hTeW50aGVzaXNcbiAgICAgICAgZWxzZSBmb3IgKGxldCBuYW1lIGluIHZvaWNlcylcbiAgICAgICAgICAgIERPTS5hZGRPcHRpb24odGhpcy5zZWxTcGVlY2hWb2ljZSwgYCR7bmFtZX0gKCR7dm9pY2VzW25hbWVdLmxhbmd9KWAsIG5hbWUpO1xuICAgIH1cblxuICAgIC8qKiBIYW5kbGVzIHRoZSByZXNldCBidXR0b24sIHdpdGggYSBjb25maXJtIHN0ZXAgdGhhdCBjYW5jZWxzIGFmdGVyIDE1IHNlY29uZHMgKi9cbiAgICBwcml2YXRlIGhhbmRsZVJlc2V0KCkgOiB2b2lkXG4gICAge1xuICAgICAgICBpZiAoIXRoaXMucmVzZXRUaW1lb3V0KVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLnJlc2V0VGltZW91dCAgICAgICA9IHNldFRpbWVvdXQodGhpcy5jYW5jZWxSZXNldC5iaW5kKHRoaXMpLCAxNTAwMCk7XG4gICAgICAgICAgICB0aGlzLmJ0blJlc2V0LmlubmVyVGV4dCA9IEwuU1RfUkVTRVRfQ09ORklSTSgpO1xuICAgICAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX0NPTkZJUk1fVCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgUkFHLmNvbmZpZy5yZXNldCgpO1xuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcbiAgICAgICAgdGhpcy5jYW5jZWxSZXNldCgpO1xuICAgICAgICB0aGlzLm9wZW4oKTtcbiAgICAgICAgYWxlcnQoIEwuU1RfUkVTRVRfRE9ORSgpICk7XG4gICAgfVxuXG4gICAgLyoqIENhbmNlbCB0aGUgcmVzZXQgdGltZW91dCBhbmQgcmVzdG9yZSB0aGUgcmVzZXQgYnV0dG9uIHRvIG5vcm1hbCAqL1xuICAgIHByaXZhdGUgY2FuY2VsUmVzZXQoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5yZXNldFRpbWVvdXQpO1xuICAgICAgICB0aGlzLmJ0blJlc2V0LmlubmVyVGV4dCA9IEwuU1RfUkVTRVQoKTtcbiAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX1QoKTtcbiAgICAgICAgdGhpcy5yZXNldFRpbWVvdXQgICAgICAgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNhdmUgYnV0dG9uLCBzYXZpbmcgY29uZmlnIHRvIHN0b3JhZ2UgKi9cbiAgICBwcml2YXRlIGhhbmRsZVNhdmUoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIFJBRy5jb25maWcudm94RW5hYmxlZCAgICA9IHRoaXMuY2hrVXNlVm94LmNoZWNrZWQ7XG4gICAgICAgIFJBRy5jb25maWcudm94UGF0aCAgICAgICA9IHRoaXMuc2VsVm94Vm9pY2UudmFsdWU7XG4gICAgICAgIFJBRy5jb25maWcudm94Q3VzdG9tUGF0aCA9IHRoaXMuaW5wdXRWb3hQYXRoLnZhbHVlO1xuICAgICAgICBSQUcuY29uZmlnLnZveFJldmVyYiAgICAgPSB0aGlzLnNlbFZveFJldmVyYi52YWx1ZTtcbiAgICAgICAgUkFHLmNvbmZpZy52b3hDaGltZSAgICAgID0gdGhpcy5zZWxWb3hDaGltZS52YWx1ZTtcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2ljZSAgID0gdGhpcy5zZWxTcGVlY2hWb2ljZS52YWx1ZTtcbiAgICAgICAgLy8gcGFyc2VGbG9hdCBpbnN0ZWFkIG9mIHZhbHVlQXNOdW1iZXI7IHNlZSBBcmNoaXRlY3R1cmUubWRcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2wgICAgID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoVm9sLnZhbHVlKTtcbiAgICAgICAgUkFHLmNvbmZpZy5zcGVlY2hQaXRjaCAgID0gcGFyc2VGbG9hdCh0aGlzLnJhbmdlU3BlZWNoUGl0Y2gudmFsdWUpO1xuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFJhdGUgICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlKTtcbiAgICAgICAgUkFHLmNvbmZpZy5zYXZlKCk7XG4gICAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICB9XG5cbiAgICAvKiogSGFuZGxlcyB0aGUgc3BlZWNoIHRlc3QgYnV0dG9uLCBzcGVha2luZyBhIHRlc3QgcGhyYXNlICovXG4gICAgcHJpdmF0ZSBoYW5kbGVWb2ljZVRlc3QoZXY6IEV2ZW50KSA6IHZvaWRcbiAgICB7XG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xuICAgICAgICB0aGlzLmJ0blNwZWVjaFRlc3QuZGlzYWJsZWQgPSB0cnVlO1xuXG4gICAgICAgIC8vIEhhcyB0byBleGVjdXRlIG9uIGEgZGVsYXksIGFzIHNwZWVjaCBjYW5jZWwgaXMgdW5yZWxpYWJsZSB3aXRob3V0IGl0XG4gICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICBsZXQgcGhyYXNlICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBwaHJhc2UuaW5uZXJIVE1MID0gJzxwaHJhc2UgcmVmPVwic2FtcGxlXCIvPic7XG5cbiAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MocGhyYXNlKTtcblxuICAgICAgICAgICAgUkFHLnNwZWVjaC5zcGVhayhcbiAgICAgICAgICAgICAgICBwaHJhc2UuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgdXNlVm94ICAgIDogdGhpcy5jaGtVc2VWb3guY2hlY2tlZCxcbiAgICAgICAgICAgICAgICAgICAgdm94UGF0aCAgIDogdGhpcy5zZWxWb3hWb2ljZS52YWx1ZSB8fCB0aGlzLmlucHV0Vm94UGF0aC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgdm94UmV2ZXJiIDogdGhpcy5zZWxWb3hSZXZlcmIudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIHZveENoaW1lICA6IHRoaXMuc2VsVm94Q2hpbWUudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIHZvaWNlTmFtZSA6IHRoaXMuc2VsU3BlZWNoVm9pY2UudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIHZvbHVtZSAgICA6IHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWVBc051bWJlcixcbiAgICAgICAgICAgICAgICAgICAgcGl0Y2ggICAgIDogdGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlQXNOdW1iZXIsXG4gICAgICAgICAgICAgICAgICAgIHJhdGUgICAgICA6IHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlQXNOdW1iZXJcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApO1xuICAgICAgICB9LCAyMDApO1xuICAgIH1cbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cblxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSB0b3AgdG9vbGJhciAqL1xuY2xhc3MgVG9vbGJhclxue1xuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGNvbnRhaW5lciBmb3IgdGhlIHRvb2xiYXIgKi9cbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbSAgICAgICAgIDogSFRNTEVsZW1lbnQ7XG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGxheSBidXR0b24gKi9cbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blBsYXkgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc3RvcCBidXR0b24gKi9cbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blN0b3AgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgZ2VuZXJhdGUgcmFuZG9tIHBocmFzZSBidXR0b24gKi9cbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkdlbmVyYXRlIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc2F2ZSBzdGF0ZSBidXR0b24gKi9cbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blNhdmUgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcmVjYWxsIHN0YXRlIGJ1dHRvbiAqL1xuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuUmVjYWxsICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBzZXR0aW5ncyBidXR0b24gKi9cbiAgICBwdWJsaWMgIHJlYWRvbmx5IGJ0bk9wdGlvbiAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxuICAgIHtcbiAgICAgICAgdGhpcy5kb20gICAgICAgICA9IERPTS5yZXF1aXJlKCcjdG9vbGJhcicpO1xuICAgICAgICB0aGlzLmJ0blBsYXkgICAgID0gRE9NLnJlcXVpcmUoJyNidG5QbGF5Jyk7XG4gICAgICAgIHRoaXMuYnRuU3RvcCAgICAgPSBET00ucmVxdWlyZSgnI2J0blN0b3AnKTtcbiAgICAgICAgdGhpcy5idG5HZW5lcmF0ZSA9IERPTS5yZXF1aXJlKCcjYnRuU2h1ZmZsZScpO1xuICAgICAgICB0aGlzLmJ0blNhdmUgICAgID0gRE9NLnJlcXVpcmUoJyNidG5TYXZlJyk7XG4gICAgICAgIHRoaXMuYnRuUmVjYWxsICAgPSBET00ucmVxdWlyZSgnI2J0bkxvYWQnKTtcbiAgICAgICAgdGhpcy5idG5PcHRpb24gICA9IERPTS5yZXF1aXJlKCcjYnRuU2V0dGluZ3MnKTtcblxuICAgICAgICB0aGlzLmJ0blBsYXkub25jbGljayAgICAgPSB0aGlzLmhhbmRsZVBsYXkuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5idG5TdG9wLm9uY2xpY2sgICAgID0gdGhpcy5oYW5kbGVTdG9wLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYnRuR2VuZXJhdGUub25jbGljayA9IHRoaXMuaGFuZGxlR2VuZXJhdGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5idG5TYXZlLm9uY2xpY2sgICAgID0gdGhpcy5oYW5kbGVTYXZlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYnRuUmVjYWxsLm9uY2xpY2sgICA9IHRoaXMuaGFuZGxlTG9hZC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmJ0bk9wdGlvbi5vbmNsaWNrICAgPSB0aGlzLmhhbmRsZU9wdGlvbi5iaW5kKHRoaXMpO1xuXG4gICAgICAgIC8vIEFkZCB0aHJvYiBjbGFzcyBpZiB0aGUgZ2VuZXJhdGUgYnV0dG9uIGhhc24ndCBiZWVuIGNsaWNrZWQgYmVmb3JlXG4gICAgICAgIGlmICghUkFHLmNvbmZpZy5jbGlja2VkR2VuZXJhdGUpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuY2xhc3NMaXN0LmFkZCgndGhyb2InKTtcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuZm9jdXMoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZm9jdXMoKTtcbiAgICB9XG5cbiAgICAvKiogSGFuZGxlcyB0aGUgcGxheSBidXR0b24sIHBsYXlpbmcgdGhlIGVkaXRvcidzIGN1cnJlbnQgcGhyYXNlIHdpdGggc3BlZWNoICovXG4gICAgcHJpdmF0ZSBoYW5kbGVQbGF5KCkgOiB2b2lkXG4gICAge1xuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcbiAgICAgICAgdGhpcy5idG5QbGF5LmRpc2FibGVkID0gdHJ1ZTtcblxuICAgICAgICAvLyBIYXMgdG8gZXhlY3V0ZSBvbiBhIGRlbGF5LCBvdGhlcndpc2UgbmF0aXZlIHNwZWVjaCBjYW5jZWwgYmVjb21lcyB1bnJlbGlhYmxlXG4gICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KHRoaXMuaGFuZGxlUGxheTIuYmluZCh0aGlzKSwgMjAwKTtcbiAgICB9XG5cbiAgICAvKiogQ29udGludWF0aW9uIG9mIGhhbmRsZVBsYXksIGV4ZWN1dGVkIGFmdGVyIGEgZGVsYXkgKi9cbiAgICBwcml2YXRlIGhhbmRsZVBsYXkyKCkgOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgaGFzU3Bva2VuICAgICAgICAgPSBmYWxzZTtcbiAgICAgICAgbGV0IHNwZWVjaFRleHQgICAgICAgID0gUkFHLnZpZXdzLmVkaXRvci5nZXRUZXh0KCk7XG4gICAgICAgIHRoaXMuYnRuUGxheS5oaWRkZW4gICA9IHRydWU7XG4gICAgICAgIHRoaXMuYnRuUGxheS5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmJ0blN0b3AuaGlkZGVuICAgPSBmYWxzZTtcblxuICAgICAgICAvLyBUT0RPOiBMb2NhbGl6ZVxuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ0xvYWRpbmcgVk9YLi4uJywgZmFsc2UpO1xuXG4gICAgICAgIC8vIElmIHNwZWVjaCB0YWtlcyB0b28gbG9uZyAoMTAgc2Vjb25kcykgdG8gbG9hZCwgY2FuY2VsIGl0XG4gICAgICAgIGxldCB0aW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XG4gICAgICAgIH0sIDEwICogMTAwMCk7XG5cbiAgICAgICAgUkFHLnNwZWVjaC5vbnNwZWFrID0gKCkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KHNwZWVjaFRleHQpO1xuXG4gICAgICAgICAgICBoYXNTcG9rZW4gICAgICAgICAgPSB0cnVlO1xuICAgICAgICAgICAgUkFHLnNwZWVjaC5vbnNwZWFrID0gdW5kZWZpbmVkO1xuICAgICAgICB9O1xuXG4gICAgICAgIFJBRy5zcGVlY2gub25zdG9wID0gKCkgPT5cbiAgICAgICAge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVTdG9wKCk7XG5cbiAgICAgICAgICAgIC8vIENoZWNrIGlmIGFueXRoaW5nIHdhcyBhY3R1YWxseSBzcG9rZW4uIElmIG5vdCwgc29tZXRoaW5nIHdlbnQgd3JvbmcuXG4gICAgICAgICAgICBpZiAoIWhhc1Nwb2tlbiAmJiBSQUcuY29uZmlnLnZveEVuYWJsZWQpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgUkFHLmNvbmZpZy52b3hFbmFibGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBMb2NhbGl6ZVxuICAgICAgICAgICAgICAgIGFsZXJ0KFxuICAgICAgICAgICAgICAgICAgICAnSXQgYXBwZWFycyB0aGF0IHRoZSBWT1ggZW5naW5lIHdhcyB1bmFibGUgdG8gc2F5IGFueXRoaW5nLicgICArXG4gICAgICAgICAgICAgICAgICAgICcgRWl0aGVyIHRoZSBjdXJyZW50IHZvaWNlIHBhdGggaXMgdW5yZWFjaGFibGUsIG9yIHRoZSBlbmdpbmUnICtcbiAgICAgICAgICAgICAgICAgICAgJyBjcmFzaGVkLiBQbGVhc2UgY2hlY2sgdGhlIGNvbnNvbGUuIFRoZSBWT1ggZW5naW5lIGhhcyBiZWVuJyAgK1xuICAgICAgICAgICAgICAgICAgICAnIGRpc2FibGVkIGFuZCBuYXRpdmUgdGV4dC10by1zcGVlY2ggd2lsbCBiZSB1c2VkIG9uIG5leHQgcGxheS4nXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKCFoYXNTcG9rZW4pXG4gICAgICAgICAgICAgICAgYWxlcnQoXG4gICAgICAgICAgICAgICAgICAgICdJdCBhcHBlYXJzIHRoYXQgdGhlIGJyb3dzZXIgd2FzIHVuYWJsZSB0byBzYXkgYW55dGhpbmcuJyAgICAgICAgK1xuICAgICAgICAgICAgICAgICAgICAnIEVpdGhlciB0aGUgY3VycmVudCB2b2ljZSBmYWlsZWQgdG8gbG9hZCwgb3IgdGhpcyBicm93c2VyIGRvZXMnICtcbiAgICAgICAgICAgICAgICAgICAgJyBub3Qgc3VwcG9ydCBzdXBwb3J0IHRleHQtdG8tc3BlZWNoLiBQbGVhc2UgY2hlY2sgdGhlIGNvbnNvbGUuJ1xuICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIC8vIFNpbmNlIHRoZSBtYXJxdWVlIHdvdWxkIGhhdmUgYmVlbiBzdHVjayBvbiBcIkxvYWRpbmcuLi5cIiwgc2Nyb2xsIGl0XG4gICAgICAgICAgICBpZiAoIWhhc1Nwb2tlbilcbiAgICAgICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoc3BlZWNoVGV4dCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgUkFHLnNwZWVjaC5zcGVhayggUkFHLnZpZXdzLmVkaXRvci5nZXRQaHJhc2UoKSApO1xuICAgICAgICB0aGlzLmJ0blN0b3AuZm9jdXMoKTtcbiAgICB9XG5cbiAgICAvKiogSGFuZGxlcyB0aGUgc3RvcCBidXR0b24sIHN0b3BwaW5nIHRoZSBtYXJxdWVlIGFuZCBhbnkgc3BlZWNoICovXG4gICAgcHJpdmF0ZSBoYW5kbGVTdG9wKGV2PzogRXZlbnQpIDogdm9pZFxuICAgIHtcbiAgICAgICAgUkFHLnNwZWVjaC5vbnNwZWFrICA9IHVuZGVmaW5lZDtcbiAgICAgICAgUkFHLnNwZWVjaC5vbnN0b3AgICA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5idG5QbGF5LmhpZGRlbiA9IGZhbHNlO1xuXG4gICAgICAgIC8vIE9ubHkgZm9jdXMgcGxheSBidXR0b24gaWYgdXNlciBkaWRuJ3QgbW92ZSBmb2N1cyBlbHNld2hlcmUuIFByZXZlbnRzXG4gICAgICAgIC8vIGFubm95aW5nIHN1cnByaXNlIG9mIGZvY3VzIHN1ZGRlbmx5IHNoaWZ0aW5nIGF3YXkuXG4gICAgICAgIGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSB0aGlzLmJ0blN0b3ApXG4gICAgICAgICAgICB0aGlzLmJ0blBsYXkuZm9jdXMoKTtcblxuICAgICAgICB0aGlzLmJ0blN0b3AuaGlkZGVuID0gdHJ1ZTtcblxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcblxuICAgICAgICAvLyBJZiBldmVudCBleGlzdHMsIHRoaXMgc3RvcCB3YXMgY2FsbGVkIGJ5IHRoZSB1c2VyXG4gICAgICAgIGlmIChldilcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldChSQUcudmlld3MuZWRpdG9yLmdldFRleHQoKSwgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKiBIYW5kbGVzIHRoZSBnZW5lcmF0ZSBidXR0b24sIGdlbmVyYXRpbmcgbmV3IHJhbmRvbSBzdGF0ZSBhbmQgcGhyYXNlICovXG4gICAgcHJpdmF0ZSBoYW5kbGVHZW5lcmF0ZSgpIDogdm9pZFxuICAgIHtcbiAgICAgICAgLy8gUmVtb3ZlIHRoZSBjYWxsLXRvLWFjdGlvbiB0aHJvYiBmcm9tIGluaXRpYWwgbG9hZFxuICAgICAgICB0aGlzLmJ0bkdlbmVyYXRlLmNsYXNzTGlzdC5yZW1vdmUoJ3Rocm9iJyk7XG4gICAgICAgIFJBRy5nZW5lcmF0ZSgpO1xuICAgICAgICBSQUcuY29uZmlnLmNsaWNrZWRHZW5lcmF0ZSA9IHRydWU7XG4gICAgfVxuXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNhdmUgYnV0dG9uLCBwZXJzaXN0aW5nIHRoZSBjdXJyZW50IHRyYWluIHN0YXRlIHRvIHN0b3JhZ2UgKi9cbiAgICBwcml2YXRlIGhhbmRsZVNhdmUoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIHRyeVxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgY3NzID0gJ2ZvbnQtc2l6ZTogbGFyZ2U7IGZvbnQtd2VpZ2h0OiBib2xkOyc7XG4gICAgICAgICAgICBsZXQgcmF3ID0gSlNPTi5zdHJpbmdpZnkoUkFHLnN0YXRlKTtcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnc3RhdGUnLCByYXcpO1xuXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhMLlNUQVRFX0NPUFlfUEFTVEUoKSwgY3NzKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiUkFHLmxvYWQoJ1wiLCByYXcucmVwbGFjZShcIidcIiwgXCJcXFxcJ1wiKSwgXCInKVwiKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKEwuU1RBVEVfUkFXX0pTT04oKSwgY3NzKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHJhdyk7XG5cbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9UT19TVE9SQUdFKCkgKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZSlcbiAgICAgICAge1xuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX1NBVkVfRkFJTChlLm1lc3NhZ2UpICk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKiogSGFuZGxlcyB0aGUgbG9hZCBidXR0b24sIGxvYWRpbmcgdHJhaW4gc3RhdGUgZnJvbSBzdG9yYWdlLCBpZiBpdCBleGlzdHMgKi9cbiAgICBwcml2YXRlIGhhbmRsZUxvYWQoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIGxldCBkYXRhID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdzdGF0ZScpO1xuXG4gICAgICAgIHJldHVybiBkYXRhXG4gICAgICAgICAgICA/IFJBRy5sb2FkKGRhdGEpXG4gICAgICAgICAgICA6IFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9TQVZFX01JU1NJTkcoKSApO1xuICAgIH1cblxuICAgIC8qKiBIYW5kbGVzIHRoZSBzZXR0aW5ncyBidXR0b24sIG9wZW5pbmcgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xuICAgIHByaXZhdGUgaGFuZGxlT3B0aW9uKCkgOiB2b2lkXG4gICAge1xuICAgICAgICBSQUcudmlld3Muc2V0dGluZ3Mub3BlbigpO1xuICAgIH1cbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBNYW5hZ2VzIFVJIGVsZW1lbnRzIGFuZCB0aGVpciBsb2dpYyAqL1xyXG5jbGFzcyBWaWV3c1xyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIHNjcmVlbiAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBtYWluICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIGRpc2NsYWltZXIgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGRpc2NsYWltZXIgOiBEaXNjbGFpbWVyO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBlZGl0b3IgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGVkaXRvciAgICAgOiBFZGl0b3I7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBtYWluIG1hcnF1ZWUgY29tcG9uZW50ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IG1hcnF1ZWUgICAgOiBNYXJxdWVlO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc2V0dGluZ3MgICA6IFNldHRpbmdzO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiB0b29sYmFyIGNvbXBvbmVudCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSB0b29sYmFyICAgIDogVG9vbGJhcjtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGFsbCB0aGUgcGlja2Vycywgb25lIGZvciBlYWNoIHR5cGUgb2YgWE1MIGVsZW1lbnQgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcGlja2VycyAgICA6IERpY3Rpb25hcnk8UGlja2VyPjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMubWFpbiAgICAgICA9IERPTS5yZXF1aXJlKCcjbWFpblNjcmVlbicpO1xyXG4gICAgICAgIHRoaXMuZGlzY2xhaW1lciA9IG5ldyBEaXNjbGFpbWVyKCk7XHJcbiAgICAgICAgdGhpcy5lZGl0b3IgICAgID0gbmV3IEVkaXRvcigpO1xyXG4gICAgICAgIHRoaXMubWFycXVlZSAgICA9IG5ldyBNYXJxdWVlKCk7XHJcbiAgICAgICAgdGhpcy5zZXR0aW5ncyAgID0gbmV3IFNldHRpbmdzKCk7XHJcbiAgICAgICAgdGhpcy50b29sYmFyICAgID0gbmV3IFRvb2xiYXIoKTtcclxuICAgICAgICB0aGlzLnBpY2tlcnMgICAgPSB7fTtcclxuXHJcbiAgICAgICAgW1xyXG4gICAgICAgICAgICBuZXcgQ29hY2hQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IEV4Y3VzZVBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgSW50ZWdlclBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgTmFtZWRQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFBocmFzZXNldFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgUGxhdGZvcm1QaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFNlcnZpY2VQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFN0YXRpb25QaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFN0YXRpb25MaXN0UGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBUaW1lUGlja2VyKClcclxuICAgICAgICBdLmZvckVhY2gocGlja2VyID0+IHRoaXMucGlja2Vyc1twaWNrZXIueG1sVGFnXSA9IHBpY2tlcik7XHJcblxyXG4gICAgICAgIC8vIEdsb2JhbCBob3RrZXlzXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5vbmtleWRvd24gPSB0aGlzLm9uSW5wdXQuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaU9TLXNwZWNpZmljIENTUyBmaXhlc1xyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZCgnaW9zJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIHBpY2tlciB0aGF0IGhhbmRsZXMgYSBnaXZlbiB0YWcsIGlmIGFueSAqL1xyXG4gICAgcHVibGljIGdldFBpY2tlcih4bWxUYWc6IHN0cmluZykgOiBQaWNrZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5waWNrZXJzW3htbFRhZ107XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZSBFU0MgdG8gY2xvc2UgcGlja2VycyBvciBzZXR0aWducyAqL1xyXG4gICAgcHJpdmF0ZSBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoZXYua2V5ICE9PSAnRXNjYXBlJylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MuY2xvc2UoKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIGNvbGxhcHNpYmxlIGVsZW1lbnRzICovXHJcbmNsYXNzIENvbGxhcHNpYmxlc1xyXG57XHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUgZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gc3BhbiBUaGUgZW5jYXBzdWxhdGluZyBjb2xsYXBzaWJsZSBlbGVtZW50XHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgVHJ1ZSB0byBjb2xsYXBzZSwgZmFsc2UgdG8gb3BlblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNldChzcGFuOiBIVE1MRWxlbWVudCwgc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmIChzdGF0ZSkgc3Bhbi5zZXRBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcsICcnKTtcclxuICAgICAgICBlbHNlICAgICAgIHNwYW4ucmVtb3ZlQXR0cmlidXRlKCdjb2xsYXBzZWQnKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFN1Z2FyIGZvciBjaG9vc2luZyBzZWNvbmQgdmFsdWUgaWYgZmlyc3QgaXMgdW5kZWZpbmVkLCBpbnN0ZWFkIG9mIGZhbHN5ICovXHJcbmZ1bmN0aW9uIGVpdGhlcjxUPih2YWx1ZTogVCB8IHVuZGVmaW5lZCwgdmFsdWUyOiBUKSA6IFRcclxue1xyXG4gICAgcmV0dXJuICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSA/IHZhbHVlMiA6IHZhbHVlO1xyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXG5cbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCB0aGUgRE9NICovXG5jbGFzcyBET01cbntcbiAgICAvKiogV2hldGhlciB0aGUgd2luZG93IGlzIHRoaW5uZXIgdGhhbiBhIHNwZWNpZmljIHNpemUgKGFuZCwgdGh1cywgaXMgXCJtb2JpbGVcIikgKi9cbiAgICBwdWJsaWMgc3RhdGljIGdldCBpc01vYmlsZSgpIDogYm9vbGVhblxuICAgIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGggPD0gNTAwO1xuICAgIH1cblxuICAgIC8qKiBXaGV0aGVyIFJBRyBhcHBlYXJzIHRvIGJlIHJ1bm5pbmcgb24gYW4gaU9TIGRldmljZSAqL1xuICAgIHB1YmxpYyBzdGF0aWMgZ2V0IGlzaU9TKCkgOiBib29sZWFuXG4gICAge1xuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLnBsYXRmb3JtLm1hdGNoKC9pUGhvbmV8aVBvZHxpUGFkL2dpKSAhPT0gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGF0dHJpYnV0ZSBmcm9tIHRoZSBnaXZlbiBlbGVtZW50LCBvciByZXR1cm5zIHRoZSBnaXZlblxuICAgICAqIGRlZmF1bHQgdmFsdWUgaWYgdW5zZXQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIGdldCB0aGUgYXR0cmlidXRlIG9mXG4gICAgICogQHBhcmFtIGF0dHIgTmFtZSBvZiB0aGUgYXR0cmlidXRlIHRvIGdldCB0aGUgdmFsdWUgb2ZcbiAgICAgKiBAcGFyYW0gZGVmIERlZmF1bHQgdmFsdWUgaWYgYXR0cmlidXRlIGlzbid0IHNldFxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBhdHRyaWJ1dGUncyB2YWx1ZSwgb3IgZGVmYXVsdCB2YWx1ZSBpZiB1bnNldFxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgZ2V0QXR0cihlbGVtZW50OiBIVE1MRWxlbWVudCwgYXR0cjogc3RyaW5nLCBkZWY6IHN0cmluZykgOiBzdHJpbmdcbiAgICB7XG4gICAgICAgIHJldHVybiBlbGVtZW50Lmhhc0F0dHJpYnV0ZShhdHRyKVxuICAgICAgICAgICAgPyBlbGVtZW50LmdldEF0dHJpYnV0ZShhdHRyKSFcbiAgICAgICAgICAgIDogZGVmO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpbmRzIGFuIGVsZW1lbnQgZnJvbSB0aGUgZ2l2ZW4gZG9jdW1lbnQsIHRocm93aW5nIGFuIGVycm9yIGlmIG5vIG1hdGNoIGlzIGZvdW5kLlxuICAgICAqXG4gICAgICogQHBhcmFtIHF1ZXJ5IENTUyBzZWxlY3RvciBxdWVyeSB0byB1c2VcbiAgICAgKiBAcGFyYW0gcGFyZW50IFBhcmVudCBvYmplY3QgdG8gc2VhcmNoOyBkZWZhdWx0cyB0byBkb2N1bWVudFxuICAgICAqIEByZXR1cm5zIFRoZSBmaXJzdCBlbGVtZW50IHRvIG1hdGNoIHRoZSBnaXZlbiBxdWVyeVxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZTxUIGV4dGVuZHMgSFRNTEVsZW1lbnQ+XG4gICAgICAgIChxdWVyeTogc3RyaW5nLCBwYXJlbnQ6IFBhcmVudE5vZGUgPSB3aW5kb3cuZG9jdW1lbnQpXG4gICAgICAgIDogVFxuICAgIHtcbiAgICAgICAgbGV0IHJlc3VsdCA9IHBhcmVudC5xdWVyeVNlbGVjdG9yKHF1ZXJ5KSBhcyBUO1xuXG4gICAgICAgIGlmICghcmVzdWx0KVxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuRE9NX01JU1NJTkcocXVlcnkpICk7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaW5kcyB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGF0dHJpYnV0ZSBmcm9tIHRoZSBnaXZlbiBlbGVtZW50LCB0aHJvd2luZyBhbiBlcnJvclxuICAgICAqIGlmIHRoZSBhdHRyaWJ1dGUgaXMgbWlzc2luZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBhdHRyaWJ1dGUgb2ZcbiAgICAgKiBAcGFyYW0gYXR0ciBOYW1lIG9mIHRoZSBhdHRyaWJ1dGUgdG8gZ2V0IHRoZSB2YWx1ZSBvZlxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBhdHRyaWJ1dGUncyB2YWx1ZVxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZUF0dHIoZWxlbWVudDogSFRNTEVsZW1lbnQsIGF0dHI6IHN0cmluZykgOiBzdHJpbmdcbiAgICB7XG4gICAgICAgIGlmICggIWVsZW1lbnQuaGFzQXR0cmlidXRlKGF0dHIpIClcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkFUVFJfTUlTU0lORyhhdHRyKSApO1xuXG4gICAgICAgIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZShhdHRyKSE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBrZXkgb2YgdGhlIGdpdmVuIGVsZW1lbnQncyBkYXRhc2V0LCB0aHJvd2luZyBhbiBlcnJvclxuICAgICAqIGlmIHRoZSB2YWx1ZSBpcyBtaXNzaW5nIG9yIGVtcHR5LlxuICAgICAqXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGRhdGEgb2ZcbiAgICAgKiBAcGFyYW0ga2V5IEtleSB0byBnZXQgdGhlIHZhbHVlIG9mXG4gICAgICogQHJldHVybnMgVGhlIGdpdmVuIGRhdGFzZXQncyB2YWx1ZVxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZURhdGEoZWxlbWVudDogSFRNTEVsZW1lbnQsIGtleTogc3RyaW5nKSA6IHN0cmluZ1xuICAgIHtcbiAgICAgICAgbGV0IHZhbHVlID0gZWxlbWVudC5kYXRhc2V0W2tleV07XG5cbiAgICAgICAgaWYgKCBTdHJpbmdzLmlzTnVsbE9yRW1wdHkodmFsdWUpIClcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRBVEFfTUlTU0lORyhrZXkpICk7XG5cbiAgICAgICAgcmV0dXJuIHZhbHVlITtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBCbHVycyAodW5mb2N1c2VzKSB0aGUgY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSBwYXJlbnQgSWYgZ2l2ZW4sIG9ubHkgYmx1cnMgaWYgYWN0aXZlIGlzIGRlc2NlbmRhbnRcbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIGJsdXJBY3RpdmUocGFyZW50OiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmJvZHkpIDogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IGFjdGl2ZSA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XG5cbiAgICAgICAgaWYgKCBhY3RpdmUgJiYgYWN0aXZlLmJsdXIgJiYgcGFyZW50LmNvbnRhaW5zKGFjdGl2ZSkgKVxuICAgICAgICAgICAgYWN0aXZlLmJsdXIoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZWVwIGNsb25lcyBhbGwgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50LCBpbnRvIHRoZSB0YXJnZXQgZWxlbWVudC5cbiAgICAgKiBVc2luZyBpbm5lckhUTUwgd291bGQgYmUgZWFzaWVyLCBob3dldmVyIGl0IGhhbmRsZXMgc2VsZi1jbG9zaW5nIHRhZ3MgcG9vcmx5LlxuICAgICAqXG4gICAgICogQHBhcmFtIHNvdXJjZSBFbGVtZW50IHdob3NlIGNoaWxkcmVuIHRvIGNsb25lXG4gICAgICogQHBhcmFtIHRhcmdldCBFbGVtZW50IHRvIGFwcGVuZCB0aGUgY2xvbmVkIGNoaWxkcmVuIHRvXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBjbG9uZUludG8oc291cmNlOiBIVE1MRWxlbWVudCwgdGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXG4gICAge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNvdXJjZS5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxuICAgICAgICAgICAgdGFyZ2V0LmFwcGVuZENoaWxkKCBzb3VyY2UuY2hpbGROb2Rlc1tpXS5jbG9uZU5vZGUodHJ1ZSkgKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdWdhciBmb3IgY3JlYXRpbmcgYW5kIGFkZGluZyBhbiBvcHRpb24gZWxlbWVudCB0byBhIHNlbGVjdCBlbGVtZW50LlxuICAgICAqXG4gICAgICogQHBhcmFtIHNlbGVjdCBTZWxlY3QgbGlzdCBlbGVtZW50IHRvIGFkZCB0aGUgb3B0aW9uIHRvXG4gICAgICogQHBhcmFtIHRleHQgTGFiZWwgZm9yIHRoZSBvcHRpb25cbiAgICAgKiBAcGFyYW0gdmFsdWUgVmFsdWUgZm9yIHRoZSBvcHRpb25cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIGFkZE9wdGlvbihzZWxlY3Q6IEhUTUxTZWxlY3RFbGVtZW50LCB0ZXh0OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgPSAnJylcbiAgICAgICAgOiBIVE1MT3B0aW9uRWxlbWVudFxuICAgIHtcbiAgICAgICAgbGV0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpIGFzIEhUTUxPcHRpb25FbGVtZW50O1xuXG4gICAgICAgIG9wdGlvbi50ZXh0ICA9IHRleHQ7XG4gICAgICAgIG9wdGlvbi52YWx1ZSA9IHZhbHVlO1xuXG4gICAgICAgIHNlbGVjdC5hZGQob3B0aW9uKTtcbiAgICAgICAgcmV0dXJuIG9wdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdWdhciBmb3IgcG9wdWxhdGluZyBhIHNlbGVjdCBlbGVtZW50IHdpdGggaXRlbXMgZnJvbSBhIGdpdmVuIG9iamVjdC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSBsaXN0IFNlbGVjdCBlbGVtZW50IHRvIHBvcHVsYXRlXG4gICAgICogQHBhcmFtIGl0ZW1zIEEgZGljdGlvbmFyeSB3aGVyZSBrZXlzIGFjdCBsaWtlIHZhbHVlcywgYW5kIHZhbHVlcyBsaWtlIGxhYmVsc1xuICAgICAqIEBwYXJhbSBzZWxlY3RlZCBJZiBtYXRjaGVzIGEgZGljdGlvbmFyeSBrZXksIHRoYXQga2V5IGlzIHRoZSBwcmUtc2VsZWN0ZWQgb3B0aW9uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwb3B1bGF0ZShsaXN0OiBIVE1MU2VsZWN0RWxlbWVudCwgaXRlbXM6IGFueSwgc2VsZWN0ZWQ/OiBhbnkpIDogdm9pZFxuICAgIHtcbiAgICAgICAgZm9yIChsZXQgdmFsdWUgaW4gaXRlbXMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCBsYWJlbCA9IGl0ZW1zW3ZhbHVlXTtcbiAgICAgICAgICAgIGxldCBvcHQgICA9IERPTS5hZGRPcHRpb24obGlzdCwgbGFiZWwsIHZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKHNlbGVjdGVkICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgPT09IHNlbGVjdGVkKVxuICAgICAgICAgICAgICAgIG9wdC5zZWxlY3RlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGV4Y2x1ZGluZyB0aGUgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW4uXG4gICAgICogQmUgd2FybmVkOyB0aGlzIG1ldGhvZCB1c2VzIFJBRy1zcGVjaWZpYyBjb2RlLlxuICAgICAqXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIHJlY3Vyc2l2ZWx5IGdldCB0ZXh0IGNvbnRlbnQgb2ZcbiAgICAgKiBAcmV0dXJucyBUZXh0IGNvbnRlbnQgb2YgZ2l2ZW4gZWxlbWVudCwgd2l0aG91dCB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlblxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgZ2V0VmlzaWJsZVRleHQoZWxlbWVudDogRWxlbWVudCkgOiBzdHJpbmdcbiAgICB7XG4gICAgICAgIGlmICAgICAgKGVsZW1lbnQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQgfHwgJyc7XG4gICAgICAgIGVsc2UgaWYgKCBlbGVtZW50LnRhZ05hbWUgPT09ICdCVVRUT04nIClcbiAgICAgICAgICAgIHJldHVybiAnJztcblxuICAgICAgICAvLyBSZXR1cm4gYmxhbmsgKHNraXApIGlmIGNoaWxkIG9mIGEgY29sbGFwc2VkIGVsZW1lbnQuIFByZXZpb3VzbHksIHRoaXMgdXNlZFxuICAgICAgICAvLyBnZXRDb21wdXRlZFN0eWxlLCBidXQgdGhhdCBkb2Vzbid0IHdvcmsgaWYgdGhlIGVsZW1lbnQgaXMgcGFydCBvZiBhbiBvcnBoYW5lZFxuICAgICAgICAvLyBwaHJhc2UgKGFzIGhhcHBlbnMgd2l0aCB0aGUgcGhyYXNlc2V0IHBpY2tlcikuXG4gICAgICAgIGxldCBwYXJlbnQgPSBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XG5cbiAgICAgICAgaWYgKCBwYXJlbnQgJiYgcGFyZW50Lmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJykgKVxuICAgICAgICAgICAgcmV0dXJuICcnO1xuXG4gICAgICAgIGxldCB0ZXh0ID0gJyc7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxuICAgICAgICAgICAgdGV4dCArPSBET00uZ2V0VmlzaWJsZVRleHQoZWxlbWVudC5jaGlsZE5vZGVzW2ldIGFzIEVsZW1lbnQpO1xuXG4gICAgICAgIHJldHVybiB0ZXh0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldHMgdGhlIHRleHQgY29udGVudCBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgZXhjbHVkaW5nIHRoZSB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlbixcbiAgICAgKiBhbmQgZXhjZXNzIHdoaXRlc3BhY2UgYXMgYSByZXN1bHQgb2YgY29udmVydGluZyBmcm9tIEhUTUwvWE1MLlxuICAgICAqXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcbiAgICAgKiBAcGFyYW0gZWxlbWVudCBFbGVtZW50IHRvIHJlY3Vyc2l2ZWx5IGdldCB0ZXh0IGNvbnRlbnQgb2ZcbiAgICAgKiBAcmV0dXJucyBDbGVhbmVkIHRleHQgb2YgZ2l2ZW4gZWxlbWVudCwgd2l0aG91dCB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlblxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgZ2V0Q2xlYW5lZFZpc2libGVUZXh0KGVsZW1lbnQ6IEVsZW1lbnQpIDogc3RyaW5nXG4gICAge1xuICAgICAgICByZXR1cm4gU3RyaW5ncy5jbGVhbiggRE9NLmdldFZpc2libGVUZXh0KGVsZW1lbnQpICk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2NhbnMgZm9yIHRoZSBuZXh0IGZvY3VzYWJsZSBzaWJsaW5nIGZyb20gYSBnaXZlbiBlbGVtZW50LCBza2lwcGluZyBoaWRkZW4gb3JcbiAgICAgKiB1bmZvY3VzYWJsZSBlbGVtZW50cy4gSWYgdGhlIGVuZCBvZiB0aGUgY29udGFpbmVyIGlzIGhpdCwgdGhlIHNjYW4gd3JhcHMgYXJvdW5kLlxuICAgICAqXG4gICAgICogQHBhcmFtIGZyb20gRWxlbWVudCB0byBzdGFydCBzY2FubmluZyBmcm9tXG4gICAgICogQHBhcmFtIGRpciBEaXJlY3Rpb247IC0xIGZvciBsZWZ0IChwcmV2aW91cyksIDEgZm9yIHJpZ2h0IChuZXh0KVxuICAgICAqIEByZXR1cm5zIFRoZSBuZXh0IGF2YWlsYWJsZSBzaWJsaW5nLCBvciBudWxsIGlmIG5vbmUgZm91bmRcbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIGdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZyb206IEhUTUxFbGVtZW50LCBkaXI6IG51bWJlcilcbiAgICAgICAgOiBIVE1MRWxlbWVudCB8IG51bGxcbiAgICB7XG4gICAgICAgIGxldCBjdXJyZW50ID0gZnJvbTtcbiAgICAgICAgbGV0IHBhcmVudCAgPSBmcm9tLnBhcmVudEVsZW1lbnQ7XG5cbiAgICAgICAgaWYgKCFwYXJlbnQpXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcblxuICAgICAgICB3aGlsZSAodHJ1ZSlcbiAgICAgICAge1xuICAgICAgICAgICAgLy8gUHJvY2VlZCB0byBuZXh0IGVsZW1lbnQsIG9yIHdyYXAgYXJvdW5kIGlmIGhpdCB0aGUgZW5kIG9mIHBhcmVudFxuICAgICAgICAgICAgaWYgICAgICAoZGlyIDwgMClcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50XG4gICAgICAgICAgICAgICAgICAgIHx8IHBhcmVudC5sYXN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID4gMClcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgfHwgcGFyZW50LmZpcnN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkJBRF9ESVJFQ1RJT04oIGRpci50b1N0cmluZygpICkgKTtcblxuICAgICAgICAgICAgLy8gSWYgd2UndmUgY29tZSBiYWNrIHRvIHRoZSBzdGFydGluZyBlbGVtZW50LCBub3RoaW5nIHdhcyBmb3VuZFxuICAgICAgICAgICAgaWYgKGN1cnJlbnQgPT09IGZyb20pXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgICAgIC8vIElmIHRoaXMgZWxlbWVudCBpc24ndCBoaWRkZW4gYW5kIGlzIGZvY3VzYWJsZSwgcmV0dXJuIGl0IVxuICAgICAgICAgICAgaWYgKCAhY3VycmVudC5oaWRkZW4gKVxuICAgICAgICAgICAgaWYgKCBjdXJyZW50Lmhhc0F0dHJpYnV0ZSgndGFiaW5kZXgnKSApXG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSBpbmRleCBvZiBhIGNoaWxkIGVsZW1lbnQsIHJlbGV2YW50IHRvIGl0cyBwYXJlbnQuXG4gICAgICpcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS85MTMyNTc1LzMzNTQ5MjBcbiAgICAgKiBAcGFyYW0gY2hpbGQgQ2hpbGQgZWxlbWVudCB0byBnZXQgdGhlIGluZGV4IG9mXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBpbmRleE9mKGNoaWxkOiBIVE1MRWxlbWVudCkgOiBudW1iZXJcbiAgICB7XG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnRFbGVtZW50O1xuXG4gICAgICAgIHJldHVybiBwYXJlbnRcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGRyZW4sIGNoaWxkKVxuICAgICAgICAgICAgOiAtMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSBpbmRleCBvZiBhIGNoaWxkIG5vZGUsIHJlbGV2YW50IHRvIGl0cyBwYXJlbnQuIFVzZWQgZm9yIHRleHQgbm9kZXMuXG4gICAgICpcbiAgICAgKiBAc2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS85MTMyNTc1LzMzNTQ5MjBcbiAgICAgKiBAcGFyYW0gY2hpbGQgQ2hpbGQgbm9kZSB0byBnZXQgdGhlIGluZGV4IG9mXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBub2RlSW5kZXhPZihjaGlsZDogTm9kZSkgOiBudW1iZXJcbiAgICB7XG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnROb2RlO1xuXG4gICAgICAgIHJldHVybiBwYXJlbnRcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGROb2RlcywgY2hpbGQpXG4gICAgICAgICAgICA6IC0xO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRvZ2dsZXMgdGhlIGhpZGRlbiBhdHRyaWJ1dGUgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGFuZCBhbGwgaXRzIGxhYmVscy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gdG9nZ2xlIHRoZSBoaWRkZW4gYXR0cmlidXRlIG9mXG4gICAgICogQHBhcmFtIGZvcmNlIE9wdGlvbmFsIHZhbHVlIHRvIGZvcmNlIHRvZ2dsaW5nIHRvXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyB0b2dnbGVIaWRkZW4oZWxlbWVudDogSFRNTEVsZW1lbnQsIGZvcmNlPzogYm9vbGVhbikgOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgaGlkZGVuID0gIWVsZW1lbnQuaGlkZGVuO1xuXG4gICAgICAgIC8vIERvIG5vdGhpbmcgaWYgYWxyZWFkeSB0b2dnbGVkIHRvIHRoZSBmb3JjZWQgc3RhdGVcbiAgICAgICAgaWYgKGhpZGRlbiA9PT0gZm9yY2UpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgZWxlbWVudC5oaWRkZW4gPSBoaWRkZW47XG5cbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW2Zvcj0nJHtlbGVtZW50LmlkfSddYClcbiAgICAgICAgICAgIC5mb3JFYWNoKGwgPT4gKGwgYXMgSFRNTEVsZW1lbnQpLmhpZGRlbiA9IGhpZGRlbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVG9nZ2xlcyB0aGUgaGlkZGVuIGF0dHJpYnV0ZSBvZiBhIGdyb3VwIG9mIGVsZW1lbnRzLCBpbiBidWxrLlxuICAgICAqXG4gICAgICogQHBhcmFtIGxpc3QgQW4gYXJyYXkgb2YgYXJndW1lbnQgcGFpcnMgZm9yIHt0b2dnbGVIaWRkZW59XG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyB0b2dnbGVIaWRkZW5BbGwoLi4ubGlzdDogW0hUTUxFbGVtZW50LCBib29sZWFuP11bXSkgOiB2b2lkXG4gICAge1xuICAgICAgICBsaXN0LmZvckVhY2goIGwgPT4gdGhpcy50b2dnbGVIaWRkZW4oLi4ubCkgKTtcbiAgICB9XG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQSB2ZXJ5IHNtYWxsIHN1YnNldCBvZiBNYXJrZG93biBmb3IgaHlwZXJsaW5raW5nIGEgYmxvY2sgb2YgdGV4dCAqL1xyXG5jbGFzcyBMaW5rZG93blxyXG57XHJcbiAgICAvKiogUmVnZXggcGF0dGVybiBmb3IgbWF0Y2hpbmcgbGlua2VkIHRleHQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX0xJTksgPSAvXFxbKFtcXHNcXFNdKz8pXFxdXFxbKFxcZCspXFxdL2dtaTtcclxuICAgIC8qKiBSZWdleCBwYXR0ZXJuIGZvciBtYXRjaGluZyBsaW5rIHJlZmVyZW5jZXMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX1JFRiAgPSAvXlxcWyhcXGQrKVxcXTpcXHMrKFxcUyspJC9nbWk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRlbXB0cyB0byBsb2FkIHRoZSBnaXZlbiBsaW5rZG93biBmaWxlLCBwYXJzZSBhbmQgc2V0IGl0IGFzIGFuIGVsZW1lbnQncyB0ZXh0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwYXRoIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCB0byBmZXRjaCB0aGUgbGlua2Rvd24gZnJvbVxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IERPTSBxdWVyeSBmb3IgdGhlIG9iamVjdCB0byBwdXQgdGhlIHRleHQgaW50b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxvYWRJbnRvKHBhdGg6IHN0cmluZywgcXVlcnk6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGRvbSA9IERPTS5yZXF1aXJlKHF1ZXJ5KTtcclxuXHJcbiAgICAgICAgZG9tLmlubmVyVGV4dCA9IGBMb2FkaW5nIHRleHQgZnJvbSAnJHtwYXRofScuLi5gO1xyXG5cclxuICAgICAgICBmZXRjaChwYXRoKVxyXG4gICAgICAgICAgICAudGhlbiggcmVxID0+IHJlcS50ZXh0KCkgKVxyXG4gICAgICAgICAgICAudGhlbiggdHh0ID0+IGRvbS5pbm5lckhUTUwgPSBMaW5rZG93bi5wYXJzZSh0eHQpIClcclxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiBkb20uaW5uZXJUZXh0ID0gYENvdWxkIG5vdCBsb2FkICcke3BhdGh9JzogJHtlcnJ9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQYXJzZXMgdGhlIGdpdmVuIHRleHQgZnJvbSBMaW5rZG93biB0byBIVE1MLCBjb252ZXJ0aW5nIHRhZ2dlZCB0ZXh0IGludG8gbGlua3NcclxuICAgICAqIHVzaW5nIGEgZ2l2ZW4gbGlzdCBvZiByZWZlcmVuY2VzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0ZXh0IExpbmtkb3duIHRleHQgdG8gdHJhbnNmb3JtIHRvIEhUTUxcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcGFyc2UodGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBsaW5rcyA6IERpY3Rpb25hcnk8c3RyaW5nPiA9IHt9O1xyXG5cclxuICAgICAgICAvLyBGaXJzdCwgc2FuaXRpemUgYW55IEhUTUxcclxuICAgICAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKCc8JywgJyZsdDsnKS5yZXBsYWNlKCc+JywgJyZndDsnKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgZ2V0IHRoZSBsaXN0IG9mIHJlZmVyZW5jZXMsIHJlbW92aW5nIHRoZW0gZnJvbSB0aGUgdGV4dFxyXG4gICAgICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9SRUYsIChfLCBrLCB2KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGlua3Nba10gPSB2O1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmFsbHksIHJlcGxhY2UgZWFjaCB0YWdnZWQgcGFydCBvZiB0ZXh0IHdpdGggYSBsaW5rIGVsZW1lbnQuIElmIGEgdGFnIGhhc1xyXG4gICAgICAgIC8vIGFuIGludmFsaWQgcmVmZXJlbmNlLCBpdCBpcyBpZ25vcmVkLlxyXG4gICAgICAgIHJldHVybiB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9MSU5LLCAobWF0Y2gsIHQsIGspID0+XHJcbiAgICAgICAgICAgIGxpbmtzW2tdXHJcbiAgICAgICAgICAgICAgICA/IGA8YSBocmVmPScke2xpbmtzW2tdfScgdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9vcGVuZXJcIj4ke3R9PC9hPmBcclxuICAgICAgICAgICAgICAgIDogbWF0Y2hcclxuICAgICAgICApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBwYXJzaW5nIGRhdGEgZnJvbSBzdHJpbmdzICovXHJcbmNsYXNzIFBhcnNlXHJcbntcclxuICAgIC8qKiBQYXJzZXMgYSBnaXZlbiBzdHJpbmcgaW50byBhIGJvb2xlYW4gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYm9vbGVhbihzdHI6IHN0cmluZykgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgc3RyID0gc3RyLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIGlmIChzdHIgPT09ICd0cnVlJyB8fCBzdHIgPT09ICcxJylcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgaWYgKHN0ciA9PT0gJ2ZhbHNlJyB8fCBzdHIgPT09ICcwJylcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICB0aHJvdyBFcnJvciggTC5CQURfQk9PTEVBTihzdHIpICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGdlbmVyYXRpbmcgcmFuZG9tIGRhdGEgKi9cclxuY2xhc3MgUmFuZG9tXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gaW50ZWdlciBmcm9tIHRoZSBnaXZlbiByYW5nZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gaW50ZWdlciB0byBwaWNrLCBpbmNsdXNpdmVcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBpbnRlZ2VyIHRvIHBpY2ssIGluY2x1c2l2ZVxyXG4gICAgICogQHJldHVybnMgUmFuZG9tIGludGVnZXIgd2l0aGluIHRoZSBnaXZlbiByYW5nZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGludChtaW46IG51bWJlciA9IDAsIG1heDogbnVtYmVyID0gMSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5mbG9vciggTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4pICkgKyBtaW47XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5LWxpa2Ugb2JqZWN0IHdpdGggYSBsZW5ndGggcHJvcGVydHkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXJyYXkoYXJyOiBMZW5ndGhhYmxlKSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBhcnJbIFJhbmRvbS5pbnQoMCwgYXJyLmxlbmd0aCkgXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3BsaWNlcyBhIHJhbmRvbSBlbGVtZW50IGZyb20gYSBnaXZlbiBhcnJheSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhcnJheVNwbGljZTxUPihhcnI6IFRbXSkgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGFyci5zcGxpY2UoUmFuZG9tLmludCgwLCBhcnIubGVuZ3RoKSwgMSlbMF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGtleSBmcm9tIGEgZ2l2ZW4gb2JqZWN0ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG9iamVjdEtleShvYmo6IHt9KSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkoIE9iamVjdC5rZXlzKG9iaikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIHRydWUgb3IgZmFsc2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNoYW5jZSBDaGFuY2Ugb3V0IG9mIDEwMCwgdG8gcGljayBgdHJ1ZWBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sKGNoYW5jZTogbnVtYmVyID0gNTApIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uaW50KDAsIDEwMCkgPCBjaGFuY2U7XHJcbiAgICB9XHJcbn1cclxuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBjbGFzcyBmb3IgYXVkaW8gZnVuY3Rpb25hbGl0eSAqL1xyXG5jbGFzcyBTb3VuZHNcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBEZWNvZGVzIHRoZSBnaXZlbiBhdWRpbyBmaWxlIGludG8gcmF3IGF1ZGlvIGRhdGEuIFRoaXMgaXMgYSB3cmFwcGVyIGZvciB0aGUgb2xkZXJcclxuICAgICAqIGNhbGxiYWNrLWJhc2VkIHN5bnRheCwgc2luY2UgaXQgaXMgdGhlIG9ubHkgb25lIGlPUyBjdXJyZW50bHkgc3VwcG9ydHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQXVkaW8gY29udGV4dCB0byB1c2UgZm9yIGRlY29kaW5nXHJcbiAgICAgKiBAcGFyYW0gYnVmZmVyIEJ1ZmZlciBvZiBlbmNvZGVkIGZpbGUgZGF0YSAoZS5nLiBtcDMpIHRvIGRlY29kZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFzeW5jIGRlY29kZShjb250ZXh0OiBBdWRpb0NvbnRleHQsIGJ1ZmZlcjogQXJyYXlCdWZmZXIpXHJcbiAgICAgICAgOiBQcm9taXNlPEF1ZGlvQnVmZmVyPlxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSA8QXVkaW9CdWZmZXI+ICggKHJlc29sdmUsIHJlamVjdCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiBjb250ZXh0LmRlY29kZUF1ZGlvRGF0YShidWZmZXIsIHJlc29sdmUsIHJlamVjdCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCBzdHJpbmdzICovXHJcbmNsYXNzIFN0cmluZ3Ncclxue1xyXG4gICAgLyoqIENoZWNrcyBpZiB0aGUgZ2l2ZW4gc3RyaW5nIGlzIG51bGwsIG9yIGVtcHR5ICh3aGl0ZXNwYWNlIG9ubHkgb3IgemVyby1sZW5ndGgpICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzTnVsbE9yRW1wdHkoc3RyOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gIXN0ciB8fCAhc3RyLnRyaW0oKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByZXR0eS1wcmludCdzIGEgZ2l2ZW4gbGlzdCBvZiBzdGF0aW9ucywgd2l0aCBjb250ZXh0IHNlbnNpdGl2ZSBleHRyYXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGVzIExpc3Qgb2Ygc3RhdGlvbiBjb2RlcyB0byBqb2luXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBMaXN0J3MgY29udGV4dC4gSWYgJ2NhbGxpbmcnLCBoYW5kbGVzIHNwZWNpYWwgY2FzZVxyXG4gICAgICogQHJldHVybnMgUHJldHR5LXByaW50ZWQgbGlzdCBvZiBnaXZlbiBzdGF0aW9uc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21TdGF0aW9uTGlzdChjb2Rlczogc3RyaW5nW10sIGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gJyc7XHJcbiAgICAgICAgbGV0IG5hbWVzICA9IGNvZGVzLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIG5hbWVzLmZvckVhY2goIChjLCBpKSA9PiBuYW1lc1tpXSA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGMpICk7XHJcblxyXG4gICAgICAgIGlmIChuYW1lcy5sZW5ndGggPT09IDEpXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IChjb250ZXh0ID09PSAnY2FsbGluZycpXHJcbiAgICAgICAgICAgICAgICA/IGAke25hbWVzWzBdfSBvbmx5YFxyXG4gICAgICAgICAgICAgICAgOiBuYW1lc1swXTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFzdFN0YXRpb24gPSBuYW1lcy5wb3AoKTtcclxuXHJcbiAgICAgICAgICAgIHJlc3VsdCAgPSBuYW1lcy5qb2luKCcsICcpO1xyXG4gICAgICAgICAgICByZXN1bHQgKz0gYCBhbmQgJHtsYXN0U3RhdGlvbn1gO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByZXR0eS1wcmludHMgdGhlIGdpdmVuIGRhdGUgb3IgaG91cnMgYW5kIG1pbnV0ZXMgaW50byBhIDI0LWhvdXIgdGltZSAoZS5nLiAwMTowOSkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGhvdXJzIEhvdXJzLCBmcm9tIDAgdG8gMjMsIG9yIERhdGUgb2JqZWN0XHJcbiAgICAgKiBAcGFyYW0gbWludXRlcyBNaW51dGVzLCBmcm9tIDAgdG8gNTlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tVGltZShob3VyczogbnVtYmVyIHwgRGF0ZSwgbWludXRlczogbnVtYmVyID0gMCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAoaG91cnMgaW5zdGFuY2VvZiBEYXRlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbWludXRlcyA9IGhvdXJzLmdldE1pbnV0ZXMoKTtcclxuICAgICAgICAgICAgaG91cnMgICA9IGhvdXJzLmdldEhvdXJzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gaG91cnMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpICsgJzonICtcclxuICAgICAgICAgICAgbWludXRlcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFucyB1cCB0aGUgZ2l2ZW4gdGV4dCBvZiBleGNlc3Mgd2hpdGVzcGFjZSBhbmQgYW55IG5ld2xpbmVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsZWFuKHRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGV4dC50cmltKClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXG5cXHJdL2dpLCAgICcnICApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHN7Mix9L2dpLCAgICcgJyApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC/igJxcXHMrL2dpLCAgICAgJ+KAnCcgKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxzK+KAnS9naSwgICAgICfigJ0nIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccyhbLixdKS9naSwgJyQxJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0cm9uZ2x5IGNvbXByZXNzZXMgdGhlIGdpdmVuIHN0cmluZyB0byBvbmUgbW9yZSBmaWxlbmFtZSBmcmllbmRseSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaWxlbmFtZSh0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRleHRcclxuICAgICAgICAgICAgLnRvTG93ZXJDYXNlKClcclxuICAgICAgICAgICAgLy8gUmVwbGFjZSBwbHVyYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pZXNcXGIvZywgJ3knKVxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgY29tbW9uIHdvcmRzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGIoYXxhbnxhdHxiZXxvZnxvbnx0aGV8dG98aW58aXN8aGFzfGJ5fHdpdGgpXFxiL2csICcnKVxyXG4gICAgICAgICAgICAudHJpbSgpXHJcbiAgICAgICAgICAgIC8vIENvbnZlcnQgc3BhY2VzIHRvIHVuZGVyc2NvcmVzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMrL2csICdfJylcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGFsbCBub24tYWxwaGFudW1lcmljYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXmEtejAtOV9dL2csICcnKVxyXG4gICAgICAgICAgICAvLyBMaW1pdCB0byAxMDAgY2hhcnM7IG1vc3Qgc3lzdGVtcyBzdXBwb3J0IG1heC4gMjU1IGJ5dGVzIGluIGZpbGVuYW1lc1xyXG4gICAgICAgICAgICAuc3Vic3RyaW5nKDAsIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGZpcnN0IG1hdGNoIG9mIGEgcGF0dGVybiBpbiBhIHN0cmluZywgb3IgdW5kZWZpbmVkIGlmIG5vdCBmb3VuZCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaXJzdE1hdGNoKHRleHQ6IHN0cmluZywgcGF0dGVybjogUmVnRXhwLCBpZHg6IG51bWJlcilcclxuICAgICAgICA6IHN0cmluZyB8IHVuZGVmaW5lZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBtYXRjaCA9IHRleHQubWF0Y2gocGF0dGVybik7XHJcblxyXG4gICAgICAgIHJldHVybiAobWF0Y2ggJiYgbWF0Y2hbaWR4XSlcclxuICAgICAgICAgICAgPyBtYXRjaFtpZHhdXHJcbiAgICAgICAgICAgIDogdW5kZWZpbmVkO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVW5pb24gdHlwZSBmb3IgaXRlcmFibGUgdHlwZXMgd2l0aCBhIC5sZW5ndGggcHJvcGVydHkgKi9cclxudHlwZSBMZW5ndGhhYmxlID0gQXJyYXk8YW55PiB8IE5vZGVMaXN0IHwgSFRNTENvbGxlY3Rpb24gfCBzdHJpbmc7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHBsYXRmb3JtIGFzIGEgZGlnaXQgYW5kIG9wdGlvbmFsIGxldHRlciB0dXBsZSAqL1xyXG50eXBlIFBsYXRmb3JtID0gW3N0cmluZywgc3RyaW5nXTtcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgc3RhdGlvbiBuYW1lLCB3aGljaCBjYW4gYmUgYSBzaW1wbGUgc3RyaW5nIG9yIGNvbXBsZXggb2JqZWN0ICovXHJcbnR5cGUgU3RhdGlvbiA9IHN0cmluZyB8IFN0YXRpb25EZWY7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIGNvbXBsZXggc3RhdGlvbiBuYW1lIGRlZmluaXRpb24gKi9cclxuaW50ZXJmYWNlIFN0YXRpb25EZWZcclxue1xyXG4gICAgLyoqIENhbm9uaWNhbCBuYW1lIG9mIHRoZSBzdGF0aW9uICovXHJcbiAgICBuYW1lICAgICAgOiBzdHJpbmc7XHJcbiAgICAvKiogU3RhdGlvbiBjb2RlIHRvIHVzZSB0aGUgc2FtZSByZWNvcmRpbmcgb2YgKi9cclxuICAgIHZveEFsaWFzPyA6IHN0cmluZztcclxufVxyXG5cclxuLyoqIFJlcHJlc2VudHMgYSBnZW5lcmljIGtleS12YWx1ZSBkaWN0aW9uYXJ5LCB3aXRoIHN0cmluZyBrZXlzICovXHJcbnR5cGUgRGljdGlvbmFyeTxUPiA9IHsgW2luZGV4OiBzdHJpbmddOiBUIH07XHJcblxyXG4vKiogRGVmaW5lcyB0aGUgZGF0YSByZWZlcmVuY2VzIGNvbmZpZyBvYmplY3QgcGFzc2VkIGludG8gUkFHLm1haW4gb24gaW5pdCAqL1xyXG5pbnRlcmZhY2UgRGF0YVJlZnNcclxue1xyXG4gICAgLyoqIFNlbGVjdG9yIGZvciBnZXR0aW5nIHRoZSBwaHJhc2Ugc2V0IFhNTCBJRnJhbWUgZWxlbWVudCAqL1xyXG4gICAgcGhyYXNlc2V0RW1iZWQgOiBzdHJpbmc7XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIGV4Y3VzZXMgZm9yIHRyYWluIGRlbGF5cyBvciBjYW5jZWxsYXRpb25zIHRvIHVzZSAqL1xyXG4gICAgZXhjdXNlc0RhdGEgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgbmFtZXMgZm9yIHNwZWNpYWwgdHJhaW5zIHRvIHVzZSAqL1xyXG4gICAgbmFtZWREYXRhICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgbmFtZXMgZm9yIHNlcnZpY2VzL25ldHdvcmtzIHRvIHVzZSAqL1xyXG4gICAgc2VydmljZXNEYXRhICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgZGljdGlvbmFyeSBvZiBzdGF0aW9uIGNvZGVzIGFuZCBuYW1lcyB0byB1c2UgKi9cclxuICAgIHN0YXRpb25zRGF0YSAgIDogRGljdGlvbmFyeTxzdHJpbmc+O1xyXG59XHJcblxyXG4vKiogRmlsbCBpbnMgZm9yIHZhcmlvdXMgbWlzc2luZyBkZWZpbml0aW9ucyBvZiBtb2Rlcm4gSmF2YXNjcmlwdCBmZWF0dXJlcyAqL1xyXG5cclxuaW50ZXJmYWNlIFdpbmRvd1xyXG57XHJcbiAgICBvbnVuaGFuZGxlZHJlamVjdGlvbjogRXJyb3JFdmVudEhhbmRsZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTdHJpbmdcclxue1xyXG4gICAgcGFkU3RhcnQodGFyZ2V0TGVuZ3RoOiBudW1iZXIsIHBhZFN0cmluZz86IHN0cmluZykgOiBzdHJpbmc7XHJcbiAgICBwYWRFbmQodGFyZ2V0TGVuZ3RoOiBudW1iZXIsIHBhZFN0cmluZz86IHN0cmluZykgOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBcnJheTxUPlxyXG57XHJcbiAgICBpbmNsdWRlcyhzZWFyY2hFbGVtZW50OiBULCBmcm9tSW5kZXg/OiBudW1iZXIpIDogYm9vbGVhbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEhUTUxFbGVtZW50XHJcbntcclxuICAgIGxhYmVscyA6IE5vZGVMaXN0T2Y8SFRNTEVsZW1lbnQ+O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXVkaW9Db250ZXh0QmFzZVxyXG57XHJcbiAgICBhdWRpb1dvcmtsZXQgOiBBdWRpb1dvcmtsZXQ7XHJcbn1cclxuXHJcbnR5cGUgU2FtcGxlQ2hhbm5lbHMgPSBGbG9hdDMyQXJyYXlbXVtdO1xyXG5cclxuZGVjbGFyZSBjbGFzcyBBdWRpb1dvcmtsZXRQcm9jZXNzb3Jcclxue1xyXG4gICAgc3RhdGljIHBhcmFtZXRlckRlc2NyaXB0b3JzIDogQXVkaW9QYXJhbURlc2NyaXB0b3JbXTtcclxuXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3Iob3B0aW9ucz86IEF1ZGlvV29ya2xldE5vZGVPcHRpb25zKTtcclxuICAgIHJlYWRvbmx5IHBvcnQ/OiBNZXNzYWdlUG9ydDtcclxuXHJcbiAgICBwcm9jZXNzKFxyXG4gICAgICAgIGlucHV0czogU2FtcGxlQ2hhbm5lbHMsXHJcbiAgICAgICAgb3V0cHV0czogU2FtcGxlQ2hhbm5lbHMsXHJcbiAgICAgICAgcGFyYW1ldGVyczogRGljdGlvbmFyeTxGbG9hdDMyQXJyYXk+XHJcbiAgICApIDogYm9vbGVhbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEF1ZGlvV29ya2xldE5vZGVPcHRpb25zIGV4dGVuZHMgQXVkaW9Ob2RlT3B0aW9uc1xyXG57XHJcbiAgICBudW1iZXJPZklucHV0cz8gOiBudW1iZXI7XHJcbiAgICBudW1iZXJPZk91dHB1dHM/IDogbnVtYmVyO1xyXG4gICAgb3V0cHV0Q2hhbm5lbENvdW50PyA6IG51bWJlcltdO1xyXG4gICAgcGFyYW1ldGVyRGF0YT8gOiB7W2luZGV4OiBzdHJpbmddIDogbnVtYmVyfTtcclxuICAgIHByb2Nlc3Nvck9wdGlvbnM/IDogYW55O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTWVkaWFUcmFja0NvbnN0cmFpbnRTZXRcclxue1xyXG4gICAgYXV0b0dhaW5Db250cm9sPzogYm9vbGVhbiB8IENvbnN0cmFpbkJvb2xlYW5QYXJhbWV0ZXJzO1xyXG4gICAgbm9pc2VTdXBwcmVzc2lvbj86IGJvb2xlYW4gfCBDb25zdHJhaW5Cb29sZWFuUGFyYW1ldGVycztcclxufVxyXG5cclxuZGVjbGFyZSBmdW5jdGlvbiByZWdpc3RlclByb2Nlc3NvcihuYW1lOiBzdHJpbmcsIGN0b3I6IEF1ZGlvV29ya2xldFByb2Nlc3NvcikgOiB2b2lkOyIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgZGF0YSBmb3IgZXhjdXNlcywgdHJhaW5zLCBzZXJ2aWNlcyBhbmQgc3RhdGlvbnMgKi9cclxuY2xhc3MgRGF0YWJhc2Vcclxue1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiBleGN1c2VzICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGV4Y3VzZXMgICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGF0YXNldCBvZiBuYW1lZCB0cmFpbnMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbmFtZWQgICAgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIHNlcnZpY2Ugb3IgbmV0d29yayBuYW1lcyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzZXJ2aWNlcyAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBuYW1lcywgd2l0aCB0aHJlZS1sZXR0ZXIgY29kZSBrZXlzIChlLmcuIEFCQykgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc3RhdGlvbnMgICAgICA6IERpY3Rpb25hcnk8U3RhdGlvbj47XHJcbiAgICAvKiogTG9hZGVkIFhNTCBkb2N1bWVudCBjb250YWluaW5nIHBocmFzZXNldCBkYXRhICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHBocmFzZXNldHMgICAgOiBEb2N1bWVudDtcclxuICAgIC8qKiBBbW91bnQgb2Ygc3RhdGlvbnMgaW4gdGhlIGN1cnJlbnRseSBsb2FkZWQgZGF0YXNldCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzdGF0aW9uc0NvdW50IDogbnVtYmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihkYXRhUmVmczogRGF0YVJlZnMpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ICA9IGRhdGFSZWZzLnBocmFzZXNldEVtYmVkO1xyXG4gICAgICAgIGxldCBpZnJhbWUgPSBET00ucmVxdWlyZSA8SFRNTElGcmFtZUVsZW1lbnQ+IChxdWVyeSk7XHJcblxyXG4gICAgICAgIGlmICghaWZyYW1lLmNvbnRlbnREb2N1bWVudClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRShxdWVyeSkgKTtcclxuXHJcbiAgICAgICAgdGhpcy5waHJhc2VzZXRzICAgID0gaWZyYW1lLmNvbnRlbnREb2N1bWVudDtcclxuICAgICAgICB0aGlzLmV4Y3VzZXMgICAgICAgPSBkYXRhUmVmcy5leGN1c2VzRGF0YTtcclxuICAgICAgICB0aGlzLm5hbWVkICAgICAgICAgPSBkYXRhUmVmcy5uYW1lZERhdGE7XHJcbiAgICAgICAgdGhpcy5zZXJ2aWNlcyAgICAgID0gZGF0YVJlZnMuc2VydmljZXNEYXRhO1xyXG4gICAgICAgIHRoaXMuc3RhdGlvbnMgICAgICA9IGRhdGFSZWZzLnN0YXRpb25zRGF0YTtcclxuICAgICAgICB0aGlzLnN0YXRpb25zQ291bnQgPSBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGg7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbRGF0YWJhc2VdIEVudHJpZXMgbG9hZGVkOicpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRFeGN1c2VzOicsICAgICAgdGhpcy5leGN1c2VzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdE5hbWVkIHRyYWluczonLCB0aGlzLm5hbWVkLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdFNlcnZpY2VzOicsICAgICB0aGlzLnNlcnZpY2VzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdFN0YXRpb25zOicsICAgICB0aGlzLnN0YXRpb25zQ291bnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBleGN1c2UgZm9yIGEgZGVsYXkgb3IgY2FuY2VsbGF0aW9uICovXHJcbiAgICBwdWJsaWMgcGlja0V4Y3VzZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLmV4Y3VzZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHBpY2tOYW1lZCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLm5hbWVkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENsb25lcyBhbmQgZ2V0cyBwaHJhc2Ugd2l0aCB0aGUgZ2l2ZW4gSUQsIG9yIG51bGwgaWYgaXQgZG9lc24ndCBleGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWQgSUQgb2YgdGhlIHBocmFzZSB0byBnZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZShpZDogc3RyaW5nKSA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSB0aGlzLnBocmFzZXNldHMucXVlcnlTZWxlY3RvcigncGhyYXNlIycgKyBpZCkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmIChyZXN1bHQpXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgcGhyYXNlc2V0IHdpdGggdGhlIGdpdmVuIElELCBvciBudWxsIGlmIGl0IGRvZXNuJ3QgZXhpc3QuIE5vdGUgdGhhdCB0aGVcclxuICAgICAqIHJldHVybmVkIHBocmFzZXNldCBjb21lcyBmcm9tIHRoZSBYTUwgZG9jdW1lbnQsIHNvIGl0IHNob3VsZCBub3QgYmUgbXV0YXRlZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWQgSUQgb2YgdGhlIHBocmFzZXNldCB0byBnZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldChpZDogc3RyaW5nKSA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnBocmFzZXNldHMucXVlcnlTZWxlY3RvcigncGhyYXNlc2V0IycgKyBpZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIHJhaWwgbmV0d29yayBuYW1lICovXHJcbiAgICBwdWJsaWMgcGlja1NlcnZpY2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5zZXJ2aWNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSBzdGF0aW9uIGNvZGUgZnJvbSB0aGUgZGF0YXNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZSBMaXN0IG9mIGNvZGVzIHRvIGV4Y2x1ZGUuIE1heSBiZSBpZ25vcmVkIGlmIHNlYXJjaCB0YWtlcyB0b28gbG9uZy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHBpY2tTdGF0aW9uQ29kZShleGNsdWRlPzogc3RyaW5nW10pIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgLy8gR2l2ZSB1cCBmaW5kaW5nIHJhbmRvbSBzdGF0aW9uIHRoYXQncyBub3QgaW4gdGhlIGdpdmVuIGxpc3QsIGlmIHdlIHRyeSBtb3JlXHJcbiAgICAgICAgLy8gdGltZXMgdGhlbiB0aGVyZSBhcmUgc3RhdGlvbnMuIEluYWNjdXJhdGUsIGJ1dCBhdm9pZHMgaW5maW5pdGUgbG9vcHMuXHJcbiAgICAgICAgaWYgKGV4Y2x1ZGUpIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zdGF0aW9uc0NvdW50OyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCAhZXhjbHVkZS5pbmNsdWRlcyh2YWx1ZSkgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5vYmplY3RLZXkodGhpcy5zdGF0aW9ucyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBzdGF0aW9uIG5hbWUgZnJvbSB0aGUgZ2l2ZW4gdGhyZWUgbGV0dGVyIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBnZXQgdGhlIG5hbWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFN0YXRpb24gbmFtZSBmb3IgdGhlIGdpdmVuIGNvZGVcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29kZTogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gdGhpcy5zdGF0aW9uc1tjb2RlXTtcclxuXHJcbiAgICAgICAgaWYgKCFzdGF0aW9uKVxyXG4gICAgICAgICAgICByZXR1cm4gTC5EQl9VTktOT1dOX1NUQVRJT04oY29kZSk7XHJcblxyXG4gICAgICAgIGlmICh0eXBlb2Ygc3RhdGlvbiA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgICAgIHJldHVybiBTdHJpbmdzLmlzTnVsbE9yRW1wdHkoc3RhdGlvbilcclxuICAgICAgICAgICAgICAgID8gTC5EQl9FTVBUWV9TVEFUSU9OKGNvZGUpXHJcbiAgICAgICAgICAgICAgICA6IHN0YXRpb247XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICByZXR1cm4gIXN0YXRpb24ubmFtZVxyXG4gICAgICAgICAgICAgICAgPyBMLkRCX0VNUFRZX1NUQVRJT04oY29kZSlcclxuICAgICAgICAgICAgICAgIDogc3RhdGlvbi5uYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlJ3Mgdm94IGFsaWFzLCBpZiBhbnkuIEEgdm94IGFsaWFzIGlzIHRoZSBjb2RlIG9mIGFub3RoZXJcclxuICAgICAqIHN0YXRpb24ncyB2b2ljZSBmaWxlLCB0aGF0IHRoZSBnaXZlbiBjb2RlIHNob3VsZCB1c2UgaW5zdGVhZC4gVGhpcyBpcyB1c2VkIGZvclxyXG4gICAgICogc3RhdGlvbnMgd2l0aCBkdXBsaWNhdGUgbmFtZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgU3RhdGlvbiBjb2RlIHRvIGdldCB0aGUgdm94IGFsaWFzIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgYWxpYXMgY29kZSwgZWxzZSB0aGUgZ2l2ZW4gY29kZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvblZveChjb2RlOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSB0aGlzLnN0YXRpb25zW2NvZGVdO1xyXG5cclxuICAgICAgICAvLyBVbmtub3duIHN0YXRpb25cclxuICAgICAgICBpZiAgICAgICghc3RhdGlvbilcclxuICAgICAgICAgICAgcmV0dXJuICc/Pz8nO1xyXG4gICAgICAgIC8vIFN0YXRpb24gaXMganVzdCBhIHN0cmluZzsgYXNzdW1lIG5vIGFsaWFzXHJcbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIHN0YXRpb24gPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICByZXR1cm4gY29kZTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiBlaXRoZXIoc3RhdGlvbi52b3hBbGlhcywgY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSByYW5nZSBvZiBzdGF0aW9uIGNvZGVzLCBlbnN1cmluZyB0aGVyZSBhcmUgbm8gZHVwbGljYXRlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gYW1vdW50IG9mIHN0YXRpb25zIHRvIHBpY2tcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBhbW91bnQgb2Ygc3RhdGlvbnMgdG8gcGlja1xyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGVcclxuICAgICAqIEByZXR1cm5zIEEgbGlzdCBvZiB1bmlxdWUgc3RhdGlvbiBuYW1lc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcGlja1N0YXRpb25Db2RlcyhtaW4gPSAxLCBtYXggPSAxNiwgZXhjbHVkZT8gOiBzdHJpbmdbXSkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChtYXggLSBtaW4gPiBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX1RPT19NQU5ZX1NUQVRJT05TKCkgKTtcclxuXHJcbiAgICAgICAgbGV0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICAgICAgbGV0IGxlbmd0aCA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIGxldCB0cmllcyAgPSAwO1xyXG5cclxuICAgICAgICB3aGlsZSAocmVzdWx0Lmxlbmd0aCA8IGxlbmd0aClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgLy8gR2l2ZSB1cCB0cnlpbmcgdG8gYXZvaWQgZHVwbGljYXRlcywgaWYgd2UgdHJ5IG1vcmUgdGltZXMgdGhhbiB0aGVyZSBhcmVcclxuICAgICAgICAgICAgLy8gc3RhdGlvbnMgYXZhaWxhYmxlLiBJbmFjY3VyYXRlLCBidXQgZ29vZCBlbm91Z2guXHJcbiAgICAgICAgICAgIGlmICh0cmllcysrID49IHRoaXMuc3RhdGlvbnNDb3VudClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBnaXZlbiBhbiBleGNsdXNpb24gbGlzdCwgY2hlY2sgYWdhaW5zdCBib3RoIHRoYXQgYW5kIHJlc3VsdHNcclxuICAgICAgICAgICAgZWxzZSBpZiAoIGV4Y2x1ZGUgJiYgIWV4Y2x1ZGUuaW5jbHVkZXMoa2V5KSAmJiAhcmVzdWx0LmluY2x1ZGVzKGtleSkgKVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIG5vdCwganVzdCBjaGVjayB3aGF0IHJlc3VsdHMgd2UndmUgYWxyZWFkeSBmb3VuZFxyXG4gICAgICAgICAgICBlbHNlIGlmICggIWV4Y2x1ZGUgJiYgIXJlc3VsdC5pbmNsdWRlcyhrZXkpIClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFpbiBjbGFzcyBvZiB0aGUgZW50aXJlIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IgYXBwbGljYXRpb24gKi9cclxuY2xhc3MgUkFHXHJcbntcclxuICAgIC8qKiBHZXRzIHRoZSBjb25maWd1cmF0aW9uIGNvbnRhaW5lciAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb25maWcgICA6IENvbmZpZztcclxuICAgIC8qKiBHZXRzIHRoZSBkYXRhYmFzZSBtYW5hZ2VyLCB3aGljaCBob2xkcyBwaHJhc2UsIHN0YXRpb24gYW5kIHRyYWluIGRhdGEgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZGF0YWJhc2UgOiBEYXRhYmFzZTtcclxuICAgIC8qKiBHZXRzIHRoZSBwaHJhc2UgbWFuYWdlciwgd2hpY2ggZ2VuZXJhdGVzIEhUTUwgcGhyYXNlcyBmcm9tIFhNTCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VyICA6IFBocmFzZXI7XHJcbiAgICAvKiogR2V0cyB0aGUgc3BlZWNoIGVuZ2luZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzcGVlY2ggICA6IFNwZWVjaDtcclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHRyYWluIGFuZCBzdGF0aW9uIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRlICAgIDogU3RhdGU7XHJcbiAgICAvKiogR2V0cyB0aGUgdmlldyBjb250cm9sbGVyLCB3aGljaCBtYW5hZ2VzIFVJIGludGVyYWN0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZpZXdzICAgIDogVmlld3M7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFbnRyeSBwb2ludCBmb3IgUkFHLCB0byBiZSBjYWxsZWQgZnJvbSBKYXZhc2NyaXB0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBkYXRhUmVmcyBDb25maWd1cmF0aW9uIG9iamVjdCwgd2l0aCByYWlsIGRhdGEgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbWFpbihkYXRhUmVmczogRGF0YVJlZnMpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5vbmVycm9yICAgICAgICAgICAgICA9IGVycm9yID0+IFJBRy5wYW5pYyhlcnJvcik7XHJcbiAgICAgICAgd2luZG93Lm9udW5oYW5kbGVkcmVqZWN0aW9uID0gZXJyb3IgPT4gUkFHLnBhbmljKGVycm9yKTtcclxuXHJcbiAgICAgICAgSTE4bi5pbml0KCk7XHJcblxyXG4gICAgICAgIFJBRy5jb25maWcgICA9IG5ldyBDb25maWcodHJ1ZSk7XHJcbiAgICAgICAgUkFHLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlKGRhdGFSZWZzKTtcclxuICAgICAgICBSQUcudmlld3MgICAgPSBuZXcgVmlld3MoKTtcclxuICAgICAgICBSQUcucGhyYXNlciAgPSBuZXcgUGhyYXNlcigpO1xyXG4gICAgICAgIFJBRy5zcGVlY2ggICA9IG5ldyBTcGVlY2goKTtcclxuXHJcbiAgICAgICAgLy8gQmVnaW5cclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLmRpc2NsYWltZXIuZGlzY2xhaW0oKTtcclxuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuV0VMQ09NRSgpICk7XHJcbiAgICAgICAgUkFHLmdlbmVyYXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdlbmVyYXRlcyBhIG5ldyByYW5kb20gcGhyYXNlIGFuZCBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZW5lcmF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZSA9IG5ldyBTdGF0ZSgpO1xyXG4gICAgICAgIFJBRy5zdGF0ZS5nZW5EZWZhdWx0U3RhdGUoKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmdlbmVyYXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIExvYWRzIHN0YXRlIGZyb20gZ2l2ZW4gSlNPTiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBsb2FkKGpzb246IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlID0gT2JqZWN0LmFzc2lnbiggbmV3IFN0YXRlKCksIEpTT04ucGFyc2UoanNvbikgKSBhcyBTdGF0ZTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmdlbmVyYXRlKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX0ZST01fU1RPUkFHRSgpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdsb2JhbCBlcnJvciBoYW5kbGVyOyB0aHJvd3MgdXAgYSBiaWcgcmVkIHBhbmljIHNjcmVlbiBvbiB1bmNhdWdodCBlcnJvciAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcGFuaWMoZXJyb3I6IHN0cmluZyB8IEV2ZW50ID0gXCJVbmtub3duIGVycm9yXCIpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG1zZyA9ICc8ZGl2IGlkPVwicGFuaWNTY3JlZW5cIiBjbGFzcz1cIndhcm5pbmdTY3JlZW5cIj4nO1xyXG4gICAgICAgIG1zZyAgICArPSAnPGgxPlwiV2UgYXJlIHNvcnJ5IHRvIGFubm91bmNlIHRoYXQuLi5cIjwvaDE+JztcclxuICAgICAgICBtc2cgICAgKz0gYDxwPlJBRyBoYXMgY3Jhc2hlZCBiZWNhdXNlOiA8Y29kZT4ke2Vycm9yfTwvY29kZT48L3A+YDtcclxuICAgICAgICBtc2cgICAgKz0gYDxwPlBsZWFzZSBvcGVuIHRoZSBjb25zb2xlIGZvciBtb3JlIGluZm9ybWF0aW9uLjwvcD5gO1xyXG4gICAgICAgIG1zZyAgICArPSAnPC9kaXY+JztcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5pbm5lckhUTUwgPSBtc2c7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBEaXNwb3NhYmxlIGNsYXNzIHRoYXQgaG9sZHMgc3RhdGUgZm9yIHRoZSBjdXJyZW50IHNjaGVkdWxlLCB0cmFpbiwgZXRjLiAqL1xyXG5jbGFzcyBTdGF0ZVxyXG57XHJcbiAgICAvKiogU3RhdGUgb2YgY29sbGFwc2libGUgZWxlbWVudHMuIEtleSBpcyByZWZlcmVuY2UgSUQsIHZhbHVlIGlzIGNvbGxhcHNlZC4gKi9cclxuICAgIHByaXZhdGUgX2NvbGxhcHNpYmxlcyA6IERpY3Rpb25hcnk8Ym9vbGVhbj4gID0ge307XHJcbiAgICAvKiogQ3VycmVudCBjb2FjaCBsZXR0ZXIgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGxldHRlci4gKi9cclxuICAgIHByaXZhdGUgX2NvYWNoZXMgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBpbnRlZ2VyIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBpbnRlZ2VyLiAqL1xyXG4gICAgcHJpdmF0ZSBfaW50ZWdlcnMgICAgIDogRGljdGlvbmFyeTxudW1iZXI+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHBocmFzZXNldCBwaHJhc2UgY2hvaWNlcy4gS2V5IGlzIHJlZmVyZW5jZSBJRCwgdmFsdWUgaXMgaW5kZXguICovXHJcbiAgICBwcml2YXRlIF9waHJhc2VzZXRzICAgOiBEaWN0aW9uYXJ5PG51bWJlcj4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc2VydmljZSBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgc2VydmljZS4gKi9cclxuICAgIHByaXZhdGUgX3NlcnZpY2VzICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzdGF0aW9uIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBzdGF0aW9uIGNvZGUuICovXHJcbiAgICBwcml2YXRlIF9zdGF0aW9ucyAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc3RhdGlvbiBsaXN0IGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBhcnJheSBvZiBjb2Rlcy4gKi9cclxuICAgIHByaXZhdGUgX3N0YXRpb25MaXN0cyA6IERpY3Rpb25hcnk8c3RyaW5nW10+ID0ge307XHJcbiAgICAvKiogQ3VycmVudCB0aW1lIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyB0aW1lLiAqL1xyXG4gICAgcHJpdmF0ZSBfdGltZXMgICAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuXHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBleGN1c2UgKi9cclxuICAgIHByaXZhdGUgX2V4Y3VzZT8gICA6IHN0cmluZztcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIHBsYXRmb3JtICovXHJcbiAgICBwcml2YXRlIF9wbGF0Zm9ybT8gOiBQbGF0Zm9ybTtcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIG5hbWVkIHRyYWluICovXHJcbiAgICBwcml2YXRlIF9uYW1lZD8gICAgOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGNvYWNoIGxldHRlciwgb3IgcmFuZG9tbHkgcGlja3Mgb25lIGZyb20gQSB0byBaLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgbGV0dGVyIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29hY2goY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb2FjaGVzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2FjaGVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9jb2FjaGVzW2NvbnRleHRdID0gUmFuZG9tLmFycmF5KEwuTEVUVEVSUyk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvYWNoZXNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29hY2ggbGV0dGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBsZXR0ZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29hY2ggVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRDb2FjaChjb250ZXh0OiBzdHJpbmcsIGNvYWNoOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvYWNoZXNbY29udGV4dF0gPSBjb2FjaDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIENoYW5jZSBiZXR3ZWVuIDAgYW5kIDEwMCBvZiBjaG9vc2luZyB0cnVlLCBpZiB1bnNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29sbGFwc2VkKHJlZjogc3RyaW5nLCBjaGFuY2U6IG51bWJlcikgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29sbGFwc2libGVzW3JlZl0gPSAhUmFuZG9tLmJvb2woY2hhbmNlKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fY29sbGFwc2libGVzW3JlZl07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29sbGFwc2libGUncyBzdGF0ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBzZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgVmFsdWUgdG8gc2V0LCB3aGVyZSB0cnVlIGlzIFwiY29sbGFwc2VkXCJcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldENvbGxhcHNlZChyZWY6IHN0cmluZywgc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdID0gc3RhdGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGludGVnZXIsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIGludGVnZXIgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRJbnRlZ2VyKGNvbnRleHQ6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5faW50ZWdlcnNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICBsZXQgbWluID0gMCwgbWF4ID0gMDtcclxuXHJcbiAgICAgICAgc3dpdGNoKGNvbnRleHQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlIFwiY29hY2hlc1wiOiAgICAgICBtaW4gPSAxOyBtYXggPSAxMDsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJkZWxheWVkXCI6ICAgICAgIG1pbiA9IDU7IG1heCA9IDYwOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImZyb250X2NvYWNoZXNcIjogbWluID0gMjsgbWF4ID0gNTsgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwicmVhcl9jb2FjaGVzXCI6ICBtaW4gPSAyOyBtYXggPSA1OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYW4gaW50ZWdlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgaW50ZWdlciBmb3JcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEludGVnZXIoY29udGV4dDogc3RyaW5nLCB2YWx1ZTogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBwaHJhc2Ugb2YgYSBwaHJhc2VzZXQsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBwaHJhc2VzZXQncyBwaHJhc2Ugb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldElkeChyZWY6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fcGhyYXNlc2V0c1tyZWZdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9waHJhc2VzZXRzW3JlZl07XHJcblxyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZik7XHJcblxyXG4gICAgICAgIC8vIFRPRE86IGlzIHRoaXMgc2FmZSBhY3Jvc3MgcGhyYXNlc2V0IGNoYW5nZXM/XHJcbiAgICAgICAgLy8gVE9ETzogaW50cm9kdWNlIGFuIGFzc2VydHMgdXRpbCwgYW5kIHN0YXJ0IHVzaW5nIHRoZW0gYWxsIG92ZXJcclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuU1RBVEVfTk9ORVhJU1RBTlRfUEhSQVNFU0VUKHJlZikgKTtcclxuXHJcbiAgICAgICAgdGhpcy5fcGhyYXNlc2V0c1tyZWZdID0gUmFuZG9tLmludCgwLCBwaHJhc2VzZXQuY2hpbGRyZW4ubGVuZ3RoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGhyYXNlc2V0c1tyZWZdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB0aGUgY2hvc2VuIGluZGV4IGZvciBhIHBocmFzZXNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBzZXQgdGhlIHBocmFzZXNldCBpbmRleCBvZlxyXG4gICAgICogQHBhcmFtIGlkeCBJbmRleCB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFBocmFzZXNldElkeChyZWY6IHN0cmluZywgaWR4OiBudW1iZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BocmFzZXNldHNbcmVmXSA9IGlkeDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gc2VydmljZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc2VydmljZSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFNlcnZpY2UoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2VydmljZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTZXJ2aWNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHNlcnZpY2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHNlcnZpY2UgZm9yXHJcbiAgICAgKiBAcGFyYW0gc2VydmljZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFNlcnZpY2UoY29udGV4dDogc3RyaW5nLCBzZXJ2aWNlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdID0gc2VydmljZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gc3RhdGlvbiBjb2RlLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBzdGF0aW9uIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbihjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3N0YXRpb25zW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbnNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHN0YXRpb24gY29kZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgc3RhdGlvbiBjb2RlIGZvclxyXG4gICAgICogQHBhcmFtIGNvZGUgU3RhdGlvbiBjb2RlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0U3RhdGlvbihjb250ZXh0OiBzdHJpbmcsIGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbnNbY29udGV4dF0gPSBjb2RlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBsaXN0IG9mIHN0YXRpb24gY29kZXMsIG9yIHJhbmRvbWx5IGdlbmVyYXRlcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBzdGF0aW9uIGxpc3QgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uTGlzdChjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF07XHJcbiAgICAgICAgZWxzZSBpZiAoY29udGV4dCA9PT0gJ2NhbGxpbmdfZmlyc3QnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRTdGF0aW9uTGlzdCgnY2FsbGluZycpO1xyXG5cclxuICAgICAgICBsZXQgbWluID0gMSwgbWF4ID0gMTY7XHJcblxyXG4gICAgICAgIHN3aXRjaChjb250ZXh0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2FzZSAnY2FsbGluZ19zcGxpdCc6IG1pbiA9IDI7IG1heCA9IDE2OyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnY2hhbmdlcyc6ICAgICAgIG1pbiA9IDE7IG1heCA9IDQ7ICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnbm90X3N0b3BwaW5nJzogIG1pbiA9IDE7IG1heCA9IDg7ICBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKG1pbiwgbWF4KTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGxpc3Qgb2Ygc3RhdGlvbiBjb2Rlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgc3RhdGlvbiBjb2RlIGxpc3QgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29kZXMgU3RhdGlvbiBjb2RlcyB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFN0YXRpb25MaXN0KGNvbnRleHQ6IHN0cmluZywgY29kZXM6IHN0cmluZ1tdKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gPSBjb2RlcztcclxuXHJcbiAgICAgICAgaWYgKGNvbnRleHQgPT09ICdjYWxsaW5nX2ZpcnN0JylcclxuICAgICAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzWydjYWxsaW5nJ10gPSBjb2RlcztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gdGltZVxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgdGltZSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFRpbWUoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl90aW1lc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fdGltZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3RpbWVzW2NvbnRleHRdID0gU3RyaW5ncy5mcm9tVGltZSggUmFuZG9tLmludCgwLCAyMyksIFJhbmRvbS5pbnQoMCwgNTkpICk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3RpbWVzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHRpbWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHRpbWUgZm9yXHJcbiAgICAgKiBAcGFyYW0gdGltZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFRpbWUoY29udGV4dDogc3RyaW5nLCB0aW1lOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3RpbWVzW2NvbnRleHRdID0gdGltZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIGV4Y3VzZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IGV4Y3VzZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2V4Y3VzZSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2V4Y3VzZTtcclxuXHJcbiAgICAgICAgdGhpcy5fZXhjdXNlID0gUkFHLmRhdGFiYXNlLnBpY2tFeGN1c2UoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fZXhjdXNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IGV4Y3VzZSAqL1xyXG4gICAgcHVibGljIHNldCBleGN1c2UodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9leGN1c2UgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIHBsYXRmb3JtLCBvciByYW5kb21seSBwaWNrcyBvbmUgKi9cclxuICAgIHB1YmxpYyBnZXQgcGxhdGZvcm0oKSA6IFBsYXRmb3JtXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3BsYXRmb3JtKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcblxyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA6IFBsYXRmb3JtID0gWycnLCAnJ107XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMiUgY2hhbmNlIGZvciBwbGF0Zm9ybSAwLCBzaW5jZSBpdCdzIHJhcmVcclxuICAgICAgICBwbGF0Zm9ybVswXSA9IFJhbmRvbS5ib29sKDk4KVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5pbnQoMSwgMjYpLnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiAnMCc7XHJcblxyXG4gICAgICAgIC8vIE1hZ2ljIHZhbHVlc1xyXG4gICAgICAgIGlmIChwbGF0Zm9ybVswXSA9PT0gJzknKVxyXG4gICAgICAgICAgICBwbGF0Zm9ybVsxXSA9IFJhbmRvbS5ib29sKDI1KSA/ICfCvicgOiAnJztcclxuXHJcbiAgICAgICAgLy8gT25seSAxMCUgY2hhbmNlIGZvciBwbGF0Zm9ybSBsZXR0ZXIsIHNpbmNlIGl0J3MgdW5jb21tb25cclxuICAgICAgICBpZiAocGxhdGZvcm1bMV0gPT09ICcnKVxyXG4gICAgICAgICAgICBwbGF0Zm9ybVsxXSA9IFJhbmRvbS5ib29sKDEwKVxyXG4gICAgICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoJ0FCQycpXHJcbiAgICAgICAgICAgICAgICA6ICcnO1xyXG5cclxuICAgICAgICB0aGlzLl9wbGF0Zm9ybSA9IHBsYXRmb3JtO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9wbGF0Zm9ybTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBwbGF0Zm9ybSAqL1xyXG4gICAgcHVibGljIHNldCBwbGF0Zm9ybSh2YWx1ZTogUGxhdGZvcm0pXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fcGxhdGZvcm0gPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIG5hbWVkIHRyYWluLCBvciByYW5kb21seSBwaWNrcyBvbmUgKi9cclxuICAgIHB1YmxpYyBnZXQgbmFtZWQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9uYW1lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVkO1xyXG5cclxuICAgICAgICB0aGlzLl9uYW1lZCA9IFJBRy5kYXRhYmFzZS5waWNrTmFtZWQoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fbmFtZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBzZXQgbmFtZWQodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9uYW1lZCA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB1cCB0aGUgc3RhdGUgaW4gYSBwYXJ0aWN1bGFyIHdheSwgc28gdGhhdCBpdCBtYWtlcyBzb21lIHJlYWwtd29ybGQgc2Vuc2UuXHJcbiAgICAgKiBUbyBkbyBzbywgd2UgaGF2ZSB0byBnZW5lcmF0ZSBkYXRhIGluIGEgcGFydGljdWxhciBvcmRlciwgYW5kIG1ha2Ugc3VyZSB0byBhdm9pZFxyXG4gICAgICogZHVwbGljYXRlcyBpbiBpbmFwcHJvcHJpYXRlIHBsYWNlcyBhbmQgY29udGV4dHMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZW5EZWZhdWx0U3RhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTdGVwIDEuIFByZXBvcHVsYXRlIHN0YXRpb24gbGlzdHNcclxuXHJcbiAgICAgICAgbGV0IHNsQ2FsbGluZyAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgMTYpO1xyXG4gICAgICAgIGxldCBzbENhbGxTcGxpdCA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDIsIDE2LCBzbENhbGxpbmcpO1xyXG4gICAgICAgIGxldCBhbGxDYWxsaW5nICA9IFsuLi5zbENhbGxpbmcsIC4uLnNsQ2FsbFNwbGl0XTtcclxuXHJcbiAgICAgICAgLy8gTGlzdCBvZiBvdGhlciBzdGF0aW9ucyBmb3VuZCB2aWEgYSBzcGVjaWZpYyBjYWxsaW5nIHBvaW50XHJcbiAgICAgICAgbGV0IHNsQ2hhbmdlcyAgICAgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygxLCA0LCBhbGxDYWxsaW5nKTtcclxuICAgICAgICAvLyBMaXN0IG9mIG90aGVyIHN0YXRpb25zIHRoYXQgdGhpcyB0cmFpbiB1c3VhbGx5IHNlcnZlcywgYnV0IGN1cnJlbnRseSBpc24ndFxyXG4gICAgICAgIGxldCBzbE5vdFN0b3BwaW5nID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgOCxcclxuICAgICAgICAgICAgWy4uLmFsbENhbGxpbmcsIC4uLnNsQ2hhbmdlc11cclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBUYWtlIGEgcmFuZG9tIHNsaWNlIGZyb20gdGhlIGNhbGxpbmcgbGlzdCwgdG8gaWRlbnRpZnkgYXMgcmVxdWVzdCBzdG9wc1xyXG4gICAgICAgIGxldCByZXFDb3VudCAgID0gUmFuZG9tLmludCgxLCBzbENhbGxpbmcubGVuZ3RoIC0gMSk7XHJcbiAgICAgICAgbGV0IHNsUmVxdWVzdHMgPSBzbENhbGxpbmcuc2xpY2UoMCwgcmVxQ291bnQpO1xyXG5cclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjYWxsaW5nJywgICAgICAgc2xDYWxsaW5nKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjYWxsaW5nX3NwbGl0Jywgc2xDYWxsU3BsaXQpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ2NoYW5nZXMnLCAgICAgICBzbENoYW5nZXMpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ25vdF9zdG9wcGluZycsICBzbE5vdFN0b3BwaW5nKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdyZXF1ZXN0JywgICAgICAgc2xSZXF1ZXN0cyk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgMi4gUHJlcG9wdWxhdGUgc3RhdGlvbnNcclxuXHJcbiAgICAgICAgLy8gQW55IHN0YXRpb24gbWF5IGJlIGJsYW1lZCBmb3IgYW4gZXhjdXNlLCBldmVuIG9uZXMgYWxyZWFkeSBwaWNrZWRcclxuICAgICAgICBsZXQgc3RFeGN1c2UgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZSgpO1xyXG4gICAgICAgIC8vIERlc3RpbmF0aW9uIGlzIGZpbmFsIGNhbGwgb2YgdGhlIGNhbGxpbmcgbGlzdFxyXG4gICAgICAgIGxldCBzdERlc3QgICAgPSBzbENhbGxpbmdbc2xDYWxsaW5nLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIC8vIFZpYSBpcyBhIGNhbGwgYmVmb3JlIHRoZSBkZXN0aW5hdGlvbiwgb3Igb25lIGluIHRoZSBzcGxpdCBsaXN0IGlmIHRvbyBzbWFsbFxyXG4gICAgICAgIGxldCBzdFZpYSAgICAgPSBzbENhbGxpbmcubGVuZ3RoID4gMVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSggc2xDYWxsaW5nLnNsaWNlKDAsIC0xKSAgIClcclxuICAgICAgICAgICAgOiBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG4gICAgICAgIC8vIERpdHRvIGZvciBwaWNraW5nIGEgcmFuZG9tIGNhbGxpbmcgc3RhdGlvbiBhcyBhIHNpbmdsZSByZXF1ZXN0IG9yIGNoYW5nZSBzdG9wXHJcbiAgICAgICAgbGV0IHN0Q2FsbGluZyA9IHNsQ2FsbGluZy5sZW5ndGggPiAxXHJcbiAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCBzbENhbGxpbmcuc2xpY2UoMCwgLTEpICAgKVxyXG4gICAgICAgICAgICA6IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcblxyXG4gICAgICAgIC8vIERlc3RpbmF0aW9uIChsYXN0IGNhbGwpIG9mIHRoZSBzcGxpdCB0cmFpbidzIHNlY29uZCBoYWxmIG9mIHRoZSBsaXN0XHJcbiAgICAgICAgbGV0IHN0RGVzdFNwbGl0ID0gc2xDYWxsU3BsaXRbc2xDYWxsU3BsaXQubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgLy8gUmFuZG9tIG5vbi1kZXN0aW5hdGlvbiBzdG9wIG9mIHRoZSBzcGxpdCB0cmFpbidzIHNlY29uZCBoYWxmIG9mIHRoZSBsaXN0XHJcbiAgICAgICAgbGV0IHN0VmlhU3BsaXQgID0gUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuICAgICAgICAvLyBXaGVyZSB0aGUgdHJhaW4gY29tZXMgZnJvbSwgc28gY2FuJ3QgYmUgb24gYW55IGxpc3RzIG9yIHByaW9yIHN0YXRpb25zXHJcbiAgICAgICAgbGV0IHN0U291cmNlICAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZShbXHJcbiAgICAgICAgICAgIC4uLmFsbENhbGxpbmcsIC4uLnNsQ2hhbmdlcywgLi4uc2xOb3RTdG9wcGluZywgLi4uc2xSZXF1ZXN0cyxcclxuICAgICAgICAgICAgc3RDYWxsaW5nLCBzdERlc3QsIHN0VmlhLCBzdERlc3RTcGxpdCwgc3RWaWFTcGxpdFxyXG4gICAgICAgIF0pO1xyXG5cclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2NhbGxpbmcnLCAgICAgICAgICAgc3RDYWxsaW5nKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2Rlc3RpbmF0aW9uJywgICAgICAgc3REZXN0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2Rlc3RpbmF0aW9uX3NwbGl0Jywgc3REZXN0U3BsaXQpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignZXhjdXNlJywgICAgICAgICAgICBzdEV4Y3VzZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdzb3VyY2UnLCAgICAgICAgICAgIHN0U291cmNlKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3ZpYScsICAgICAgICAgICAgICAgc3RWaWEpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbigndmlhX3NwbGl0JywgICAgICAgICBzdFZpYVNwbGl0KTtcclxuXHJcbiAgICAgICAgLy8gU3RlcCAzLiBQcmVwb3B1bGF0ZSBjb2FjaCBudW1iZXJzXHJcblxyXG4gICAgICAgIGxldCBpbnRDb2FjaGVzID0gdGhpcy5nZXRJbnRlZ2VyKCdjb2FjaGVzJyk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZXJlIGFyZSBlbm91Z2ggY29hY2hlcywganVzdCBzcGxpdCB0aGUgbnVtYmVyIGRvd24gdGhlIG1pZGRsZSBpbnN0ZWFkLlxyXG4gICAgICAgIC8vIEVsc2UsIGZyb250IGFuZCByZWFyIGNvYWNoZXMgd2lsbCBiZSByYW5kb21seSBwaWNrZWQgKHdpdGhvdXQgbWFraW5nIHNlbnNlKVxyXG4gICAgICAgIGlmIChpbnRDb2FjaGVzID49IDQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaW50RnJvbnRDb2FjaGVzID0gKGludENvYWNoZXMgLyAyKSB8IDA7XHJcbiAgICAgICAgICAgIGxldCBpbnRSZWFyQ29hY2hlcyAgPSBpbnRDb2FjaGVzIC0gaW50RnJvbnRDb2FjaGVzO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXRJbnRlZ2VyKCdmcm9udF9jb2FjaGVzJywgaW50RnJvbnRDb2FjaGVzKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRJbnRlZ2VyKCdyZWFyX2NvYWNoZXMnLCBpbnRSZWFyQ29hY2hlcyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgZW5vdWdoIGNvYWNoZXMsIGFzc2lnbiBjb2FjaCBsZXR0ZXJzIGZvciBjb250ZXh0cy5cclxuICAgICAgICAvLyBFbHNlLCBsZXR0ZXJzIHdpbGwgYmUgcmFuZG9tbHkgcGlja2VkICh3aXRob3V0IG1ha2luZyBzZW5zZSlcclxuICAgICAgICBpZiAoaW50Q29hY2hlcyA+PSA0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGxldHRlcnMgPSBMLkxFVFRFUlMuc2xpY2UoMCwgaW50Q29hY2hlcykuc3BsaXQoJycpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ2ZpcnN0JywgICAgIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc2hvcCcsICAgICAgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzdGFuZGFyZDEnLCBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3N0YW5kYXJkMicsIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU3RlcCA0LiBQcmVwb3B1bGF0ZSBzZXJ2aWNlc1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBtb3JlIHRoYW4gb25lIHNlcnZpY2UsIHBpY2sgb25lIHRvIGJlIHRoZSBcIm1haW5cIiBhbmQgb25lIHRvIGJlIHRoZVxyXG4gICAgICAgIC8vIFwiYWx0ZXJuYXRlXCIsIGVsc2UgdGhlIG9uZSBzZXJ2aWNlIHdpbGwgYmUgdXNlZCBmb3IgYm90aCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpLlxyXG4gICAgICAgIGlmIChSQUcuZGF0YWJhc2Uuc2VydmljZXMubGVuZ3RoID4gMSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBzZXJ2aWNlcyA9IFJBRy5kYXRhYmFzZS5zZXJ2aWNlcy5zbGljZSgpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXRTZXJ2aWNlKCAncHJvdmlkZXInLCAgICBSYW5kb20uYXJyYXlTcGxpY2Uoc2VydmljZXMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VydmljZSggJ2FsdGVybmF0aXZlJywgUmFuZG9tLmFycmF5U3BsaWNlKHNlcnZpY2VzKSApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU3RlcCA1LiBQcmVwb3B1bGF0ZSB0aW1lc1xyXG4gICAgICAgIC8vIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMjE0NzUzXHJcblxyXG4gICAgICAgIC8vIFRoZSBhbHRlcm5hdGl2ZSB0aW1lIGlzIGZvciBhIHRyYWluIHRoYXQncyBsYXRlciB0aGFuIHRoZSBtYWluIHRyYWluXHJcbiAgICAgICAgbGV0IHRpbWUgICAgPSBuZXcgRGF0ZSggbmV3IERhdGUoKS5nZXRUaW1lKCkgKyBSYW5kb20uaW50KDAsIDU5KSAqIDYwMDAwKTtcclxuICAgICAgICBsZXQgdGltZUFsdCA9IG5ldyBEYXRlKCB0aW1lLmdldFRpbWUoKSAgICAgICArIFJhbmRvbS5pbnQoMCwgMzApICogNjAwMDApO1xyXG5cclxuICAgICAgICB0aGlzLnNldFRpbWUoICdtYWluJywgICAgICAgIFN0cmluZ3MuZnJvbVRpbWUodGltZSkgICAgKTtcclxuICAgICAgICB0aGlzLnNldFRpbWUoICdhbHRlcm5hdGl2ZScsIFN0cmluZ3MuZnJvbVRpbWUodGltZUFsdCkgKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xuXG4vKiogTWFuYWdlcyBzcGVlY2ggc3ludGhlc2lzIHVzaW5nIGJvdGggbmF0aXZlIGFuZCBjdXN0b20gZW5naW5lcyAqL1xuY2xhc3MgU3BlZWNoXG57XG4gICAgLyoqIEluc3RhbmNlIG9mIHRoZSBjdXN0b20gdm9pY2UgZW5naW5lICovXG4gICAgcHJpdmF0ZSByZWFkb25seSB2b3hFbmdpbmU/IDogVm94RW5naW5lO1xuXG4gICAgLyoqIERpY3Rpb25hcnkgb2YgYnJvd3Nlci1wcm92aWRlZCB2b2ljZXMgYXZhaWxhYmxlICovXG4gICAgcHVibGljICBicm93c2VyVm9pY2VzIDogRGljdGlvbmFyeTxTcGVlY2hTeW50aGVzaXNWb2ljZT4gPSB7fTtcbiAgICAvKiogRXZlbnQgaGFuZGxlciBmb3Igd2hlbiBzcGVlY2ggaXMgYXVkaWJseSBzcG9rZW4gKi9cbiAgICBwdWJsaWMgIG9uc3BlYWs/ICAgICAgOiAoKSA9PiB2b2lkO1xuICAgIC8qKiBFdmVudCBoYW5kbGVyIGZvciB3aGVuIHNwZWVjaCBoYXMgZW5kZWQgKi9cbiAgICBwdWJsaWMgIG9uc3RvcD8gICAgICAgOiAoKSA9PiB2b2lkO1xuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG5hdGl2ZSBzcGVlY2gtc3RvcHBlZCBjaGVjayB0aW1lciAqL1xuICAgIHByaXZhdGUgc3RvcFRpbWVyICAgICA6IG51bWJlciA9IDA7XG5cbiAgICAvKiogV2hldGhlciBhbnkgc3BlZWNoIGVuZ2luZSBpcyBjdXJyZW50bHkgc3BlYWtpbmcgKi9cbiAgICBwdWJsaWMgZ2V0IGlzU3BlYWtpbmcoKSA6IGJvb2xlYW5cbiAgICB7XG4gICAgICAgIGlmICh0aGlzLnZveEVuZ2luZSAmJiB0aGlzLnZveEVuZ2luZS5pc1NwZWFraW5nKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFraW5nO1xuICAgIH1cblxuICAgIC8qKiBXaGV0aGVyIHRoZSBWT1ggZW5naW5lIGlzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cbiAgICBwdWJsaWMgZ2V0IHZveEF2YWlsYWJsZSgpIDogYm9vbGVhblxuICAgIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudm94RW5naW5lICE9PSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcbiAgICB7XG4gICAgICAgIC8vIFNvbWUgYnJvd3NlcnMgZG9uJ3QgcHJvcGVybHkgY2FuY2VsIHNwZWVjaCBvbiBwYWdlIGNsb3NlLlxuICAgICAgICAvLyBCVUc6IG9ucGFnZXNob3cgYW5kIG9ucGFnZWhpZGUgbm90IHdvcmtpbmcgb24gaU9TIDExXG4gICAgICAgIHdpbmRvdy5vbmJlZm9yZXVubG9hZCA9XG4gICAgICAgIHdpbmRvdy5vbnVubG9hZCAgICAgICA9XG4gICAgICAgIHdpbmRvdy5vbnBhZ2VzaG93ICAgICA9XG4gICAgICAgIHdpbmRvdy5vbnBhZ2VoaWRlICAgICA9IHRoaXMuc3RvcC5iaW5kKHRoaXMpO1xuXG4gICAgICAgIGRvY3VtZW50Lm9udmlzaWJpbGl0eWNoYW5nZSAgICAgICAgICAgID0gdGhpcy5vblZpc2liaWxpdHlDaGFuZ2UuYmluZCh0aGlzKTtcbiAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5vbnZvaWNlc2NoYW5nZWQgPSB0aGlzLm9uVm9pY2VzQ2hhbmdlZC5iaW5kKHRoaXMpO1xuXG4gICAgICAgIC8vIEV2ZW4gdGhvdWdoICdvbnZvaWNlc2NoYW5nZWQnIGlzIHVzZWQgbGF0ZXIgdG8gcG9wdWxhdGUgdGhlIGxpc3QsIENocm9tZSBkb2VzXG4gICAgICAgIC8vIG5vdCBhY3R1YWxseSBmaXJlIHRoZSBldmVudCB1bnRpbCB0aGlzIGNhbGwuLi5cbiAgICAgICAgdGhpcy5vblZvaWNlc0NoYW5nZWQoKTtcblxuICAgICAgICAvLyBGb3Igc29tZSByZWFzb24sIENocm9tZSBuZWVkcyB0aGlzIGNhbGxlZCBvbmNlIGZvciBuYXRpdmUgc3BlZWNoIHRvIHdvcmtcbiAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5jYW5jZWwoKTtcblxuICAgICAgICB0cnkgICAgICAgICB7IHRoaXMudm94RW5naW5lID0gbmV3IFZveEVuZ2luZSgpOyB9XG4gICAgICAgIGNhdGNoIChlcnIpIHsgY29uc29sZS5lcnJvcignQ291bGQgbm90IGNyZWF0ZSBWT1ggZW5naW5lOicsIGVycik7IH1cbiAgICB9XG5cbiAgICAvKiogQmVnaW5zIHNwZWFraW5nIHRoZSBnaXZlbiBwaHJhc2UgY29tcG9uZW50cyAqL1xuICAgIHB1YmxpYyBzcGVhayhwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MgPSB7fSkgOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLnN0b3AoKTtcblxuICAgICAgICAvLyBWT1ggZW5naW5lXG4gICAgICAgIGlmICAgICAgKCB0aGlzLnZveEVuZ2luZSAmJiBlaXRoZXIoc2V0dGluZ3MudXNlVm94LCBSQUcuY29uZmlnLnZveEVuYWJsZWQpIClcbiAgICAgICAgICAgIHRoaXMuc3BlYWtWb3gocGhyYXNlLCBzZXR0aW5ncyk7XG5cbiAgICAgICAgLy8gTmF0aXZlIGJyb3dzZXIgdGV4dC10by1zcGVlY2hcbiAgICAgICAgZWxzZSBpZiAod2luZG93LnNwZWVjaFN5bnRoZXNpcylcbiAgICAgICAgICAgIHRoaXMuc3BlYWtCcm93c2VyKHBocmFzZSwgc2V0dGluZ3MpO1xuXG4gICAgICAgIC8vIE5vIHNwZWVjaCBhdmFpbGFibGU7IGNhbGwgc3RvcCBldmVudCBoYW5kbGVyXG4gICAgICAgIGVsc2UgaWYgKHRoaXMub25zdG9wKVxuICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcbiAgICB9XG5cbiAgICAvKiogU3RvcHMgYW5kIGNhbmNlbHMgYWxsIHF1ZXVlZCBzcGVlY2ggKi9cbiAgICBwdWJsaWMgc3RvcCgpIDogdm9pZFxuICAgIHtcbiAgICAgICAgaWYgKCF0aGlzLmlzU3BlYWtpbmcpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHdpbmRvdy5zcGVlY2hTeW50aGVzaXMpXG4gICAgICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmNhbmNlbCgpO1xuXG4gICAgICAgIGlmICh0aGlzLnZveEVuZ2luZSlcbiAgICAgICAgICAgIHRoaXMudm94RW5naW5lLnN0b3AoKTtcblxuICAgICAgICBpZiAodGhpcy5vbnN0b3ApXG4gICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xuICAgIH1cblxuICAgIC8qKiBQYXVzZSBhbmQgdW5wYXVzZSBzcGVlY2ggaWYgdGhlIHBhZ2UgaXMgaGlkZGVuIG9yIHVuaGlkZGVuICovXG4gICAgcHJpdmF0ZSBvblZpc2liaWxpdHlDaGFuZ2UoKSA6IHZvaWRcbiAgICB7XG4gICAgICAgIC8vIFRPRE86IFRoaXMgbmVlZHMgdG8gcGF1c2UgVk9YIGVuZ2luZVxuICAgICAgICBsZXQgaGlkaW5nID0gKGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gJ2hpZGRlbicpO1xuXG4gICAgICAgIGlmIChoaWRpbmcpIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMucGF1c2UoKTtcbiAgICAgICAgZWxzZSAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5yZXN1bWUoKTtcbiAgICB9XG5cbiAgICAvKiogSGFuZGxlcyBhc3luYyB2b2ljZSBsaXN0IGxvYWRpbmcgb24gc29tZSBicm93c2VycywgYW5kIHNldHMgZGVmYXVsdCAqL1xuICAgIHByaXZhdGUgb25Wb2ljZXNDaGFuZ2VkKCkgOiB2b2lkXG4gICAge1xuICAgICAgICB0aGlzLmJyb3dzZXJWb2ljZXMgPSB7fTtcblxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLmdldFZvaWNlcygpLmZvckVhY2godiA9PiB0aGlzLmJyb3dzZXJWb2ljZXNbdi5uYW1lXSA9IHYpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIHRoZSBnaXZlbiBwaHJhc2UgdG8gdGV4dCBhbmQgc3BlYWtzIGl0IHZpYSBuYXRpdmUgYnJvd3NlciB2b2ljZXMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0gcGhyYXNlIFBocmFzZSBlbGVtZW50cyB0byBzcGVha1xuICAgICAqIEBwYXJhbSBzZXR0aW5ncyBTZXR0aW5ncyB0byB1c2UgZm9yIHRoZSB2b2ljZVxuICAgICAqL1xuICAgIHByaXZhdGUgc3BlYWtCcm93c2VyKHBocmFzZTogSFRNTEVsZW1lbnQsIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncykgOiB2b2lkXG4gICAge1xuICAgICAgICBsZXQgdm9pY2VOYW1lID0gZWl0aGVyKHNldHRpbmdzLnZvaWNlTmFtZSwgUkFHLmNvbmZpZy5zcGVlY2hWb2ljZSk7XG4gICAgICAgIGxldCB2b2ljZSAgICAgPSB0aGlzLmJyb3dzZXJWb2ljZXNbdm9pY2VOYW1lXTtcblxuICAgICAgICAvLyBSZXNldCB0byBmaXJzdCB2b2ljZSwgaWYgY29uZmlndXJlZCBjaG9pY2UgaXMgbWlzc2luZ1xuICAgICAgICBpZiAoIXZvaWNlKVxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgZmlyc3QgPSBPYmplY3Qua2V5cyh0aGlzLmJyb3dzZXJWb2ljZXMpWzBdO1xuICAgICAgICAgICAgdm9pY2UgICAgID0gdGhpcy5icm93c2VyVm9pY2VzW2ZpcnN0XTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoZSBwaHJhc2UgdGV4dCBpcyBzcGxpdCBpbnRvIHNlbnRlbmNlcywgYXMgcXVldWVpbmcgbGFyZ2Ugc2VudGVuY2VzIHRoYXQgbGFzdFxuICAgICAgICAvLyBtYW55IHNlY29uZHMgY2FuIGJyZWFrIHNvbWUgVFRTIGVuZ2luZXMgYW5kIGJyb3dzZXJzLlxuICAgICAgICBsZXQgdGV4dCAgPSBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHBocmFzZSk7XG4gICAgICAgIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoL1xcLlxccy9pKTtcblxuICAgICAgICBwYXJ0cy5mb3JFYWNoKCAoc2VnbWVudCwgaWR4KSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICAvLyBBZGQgbWlzc2luZyBmdWxsIHN0b3AgdG8gZWFjaCBzZW50ZW5jZSBleGNlcHQgdGhlIGxhc3QsIHdoaWNoIGhhcyBpdFxuICAgICAgICAgICAgaWYgKGlkeCA8IHBhcnRzLmxlbmd0aCAtIDEpXG4gICAgICAgICAgICAgICAgc2VnbWVudCArPSAnLic7XG5cbiAgICAgICAgICAgIGxldCB1dHRlcmFuY2UgPSBuZXcgU3BlZWNoU3ludGhlc2lzVXR0ZXJhbmNlKHNlZ21lbnQpO1xuXG4gICAgICAgICAgICB1dHRlcmFuY2Uudm9pY2UgID0gdm9pY2U7XG4gICAgICAgICAgICB1dHRlcmFuY2Uudm9sdW1lID0gZWl0aGVyKHNldHRpbmdzLnZvbHVtZSwgUkFHLmNvbmZpZy5zcGVlY2hWb2wpO1xuICAgICAgICAgICAgdXR0ZXJhbmNlLnBpdGNoICA9IGVpdGhlcihzZXR0aW5ncy5waXRjaCwgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2gpO1xuICAgICAgICAgICAgdXR0ZXJhbmNlLnJhdGUgICA9IGVpdGhlcihzZXR0aW5ncy5yYXRlLCAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSk7XG5cbiAgICAgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuc3BlYWsodXR0ZXJhbmNlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRmlyZSBpbW1lZGlhdGVseS4gSSBkb24ndCB0cnVzdCBzcGVlY2ggZXZlbnRzIHRvIGJlIHJlbGlhYmxlOyBzZWUgYmVsb3cuXG4gICAgICAgIGlmICh0aGlzLm9uc3BlYWspXG4gICAgICAgICAgICB0aGlzLm9uc3BlYWsoKTtcblxuICAgICAgICAvLyBUaGlzIGNoZWNrcyBmb3Igd2hlbiB0aGUgbmF0aXZlIGVuZ2luZSBoYXMgc3RvcHBlZCBzcGVha2luZywgYW5kIGNhbGxzIHRoZVxuICAgICAgICAvLyBvbnN0b3AgZXZlbnQgaGFuZGxlci4gSSBjb3VsZCB1c2UgU3BlZWNoU3ludGhlc2lzLm9uZW5kIGluc3RlYWQsIGJ1dCBpdCB3YXNcbiAgICAgICAgLy8gZm91bmQgdG8gYmUgdW5yZWxpYWJsZSwgc28gSSBoYXZlIHRvIHBvbGwgdGhlIHNwZWFraW5nIHByb3BlcnR5IHRoaXMgd2F5LlxuICAgICAgICBjbGVhckludGVydmFsKHRoaXMuc3RvcFRpbWVyKTtcblxuICAgICAgICB0aGlzLnN0b3BUaW1lciA9IHNldEludGVydmFsKCgpID0+XG4gICAgICAgIHtcbiAgICAgICAgICAgIGlmICh3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFraW5nKVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLnN0b3BUaW1lcik7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm9uc3RvcClcbiAgICAgICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xuICAgICAgICB9LCAxMDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN5bnRoZXNpemVzIHZvaWNlIGJ5IHdhbGtpbmcgdGhyb3VnaCB0aGUgZ2l2ZW4gcGhyYXNlIGVsZW1lbnRzLCByZXNvbHZpbmcgcGFydHMgdG9cbiAgICAgKiBzb3VuZCBmaWxlIElEcywgYW5kIGZlZWRpbmcgdGhlIGVudGlyZSBhcnJheSB0byB0aGUgdm94IGVuZ2luZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSBwaHJhc2UgUGhyYXNlIGVsZW1lbnRzIHRvIHNwZWFrXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFNldHRpbmdzIHRvIHVzZSBmb3IgdGhlIHZvaWNlXG4gICAgICovXG4gICAgcHJpdmF0ZSBzcGVha1ZveChwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxuICAgIHtcbiAgICAgICAgbGV0IHJlc29sdmVyID0gbmV3IFJlc29sdmVyKHBocmFzZSk7XG4gICAgICAgIGxldCB2b3hQYXRoICA9IFJBRy5jb25maWcudm94UGF0aCB8fCBSQUcuY29uZmlnLnZveEN1c3RvbVBhdGg7XG5cbiAgICAgICAgdGhpcy52b3hFbmdpbmUhLm9uc3BlYWsgPSAoKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICBpZiAodGhpcy5vbnNwZWFrKVxuICAgICAgICAgICAgICAgIHRoaXMub25zcGVhaygpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMudm94RW5naW5lIS5vbnN0b3AgPSAoKSA9PlxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLnZveEVuZ2luZSEub25zcGVhayA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHRoaXMudm94RW5naW5lIS5vbnN0b3AgID0gdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5vbnN0b3ApXG4gICAgICAgICAgICAgICAgdGhpcy5vbnN0b3AoKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBBcHBseSBzZXR0aW5ncyBmcm9tIGNvbmZpZyBoZXJlLCB0byBrZWVwIFZPWCBlbmdpbmUgZGVjb3VwbGVkIGZyb20gUkFHXG4gICAgICAgIHNldHRpbmdzLnZveFBhdGggICA9IGVpdGhlcihzZXR0aW5ncy52b3hQYXRoLCAgIHZveFBhdGgpO1xuICAgICAgICBzZXR0aW5ncy52b3hSZXZlcmIgPSBlaXRoZXIoc2V0dGluZ3Mudm94UmV2ZXJiLCBSQUcuY29uZmlnLnZveFJldmVyYik7XG4gICAgICAgIHNldHRpbmdzLnZveENoaW1lICA9IGVpdGhlcihzZXR0aW5ncy52b3hDaGltZSwgIFJBRy5jb25maWcudm94Q2hpbWUpO1xuICAgICAgICBzZXR0aW5ncy52b2x1bWUgICAgPSBlaXRoZXIoc2V0dGluZ3Mudm9sdW1lLCAgICBSQUcuY29uZmlnLnNwZWVjaFZvbCk7XG4gICAgICAgIHNldHRpbmdzLnJhdGUgICAgICA9IGVpdGhlcihzZXR0aW5ncy5yYXRlLCAgICAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSk7XG5cbiAgICAgICAgdGhpcy52b3hFbmdpbmUhLnNwZWFrKHJlc29sdmVyLnRvVm94KCksIHNldHRpbmdzKTtcbiAgICB9XG59Il19