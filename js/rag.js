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
        /** If user has read the disclaimer */
        this.readDisclaimer = false;
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
        if (this.voxEngine && either(settings.useVox, RAG.config.voxEnabled))
            this.speakVox(phrase, settings);
        else if (window.speechSynthesis)
            this.speakBrowser(phrase, settings);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFuZy9pMThuLnRzIiwidWkvY29udHJvbHMvY2hvb3Nlci50cyIsInVpL2NvbnRyb2xzL2NvbGxhcHNlVG9nZ2xlLnRzIiwidWkvY29udHJvbHMvcGhyYXNlc2V0QnV0dG9uLnRzIiwidWkvY29udHJvbHMvc3RhdGlvbkNob29zZXIudHMiLCJ1aS9jb250cm9scy9zdGF0aW9uTGlzdEl0ZW0udHMiLCJ1aS9waWNrZXJzL3BpY2tlci50cyIsInVpL3BpY2tlcnMvY29hY2hQaWNrZXIudHMiLCJ1aS9waWNrZXJzL2V4Y3VzZVBpY2tlci50cyIsInVpL3BpY2tlcnMvaW50ZWdlclBpY2tlci50cyIsInVpL3BpY2tlcnMvbmFtZWRQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3BocmFzZXNldFBpY2tlci50cyIsInVpL3BpY2tlcnMvcGxhdGZvcm1QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3NlcnZpY2VQaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25QaWNrZXIudHMiLCJ1aS9waWNrZXJzL3N0YXRpb25MaXN0UGlja2VyLnRzIiwidWkvcGlja2Vycy90aW1lUGlja2VyLnRzIiwiY29uZmlnL2NvbmZpZ0Jhc2UudHMiLCJjb25maWcvY29uZmlnLnRzIiwibGFuZy9iYXNlTGFuZ3VhZ2UudHMiLCJsYW5nL2VuZ2xpc2hMYW5ndWFnZS50cyIsInBocmFzZXIvZWxlbWVudFByb2Nlc3NvcnMudHMiLCJwaHJhc2VyL3BocmFzZUNvbnRleHQudHMiLCJwaHJhc2VyL3BocmFzZXIudHMiLCJzcGVlY2gvcmVzb2x2ZXIudHMiLCJzcGVlY2gvc3BlZWNoLnRzIiwic3BlZWNoL3NwZWVjaFNldHRpbmdzLnRzIiwic3BlZWNoL3ZveEVuZ2luZS50cyIsInNwZWVjaC92b3hSZXF1ZXN0LnRzIiwidWkvdmlld0Jhc2UudHMiLCJ1aS9kaXNjbGFpbWVyLnRzIiwidWkvZWRpdG9yLnRzIiwidWkvbWFycXVlZS50cyIsInVpL3NldHRpbmdzLnRzIiwidWkvdG9vbGJhci50cyIsInVpL3ZpZXdzLnRzIiwidXRpbC9jb2xsYXBzaWJsZXMudHMiLCJ1dGlsL2NvbmRpdGlvbmFscy50cyIsInV0aWwvZG9tLnRzIiwidXRpbC9saW5rZG93bi50cyIsInV0aWwvcGFyc2UudHMiLCJ1dGlsL3JhbmRvbS50cyIsInV0aWwvc291bmRzLnRzIiwidXRpbC9zdHJpbmdzLnRzIiwidXRpbC90eXBlcy50cyIsImRhdGFiYXNlLnRzIiwicmFnLnRzIiwic3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEscUVBQXFFO0FBRXJFLDhEQUE4RDtBQUM5RCxJQUFJLENBQWtDLENBQUM7QUFFdkMsTUFBTSxJQUFJO0lBVU4sNEVBQTRFO0lBQ3JFLE1BQU0sQ0FBQyxJQUFJO1FBRWQsSUFBSSxJQUFJLENBQUMsU0FBUztZQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUVuRCxJQUFJLENBQUMsU0FBUyxHQUFHO1lBQ2IsSUFBSSxFQUFHLElBQUksZUFBZSxFQUFFO1NBQy9CLENBQUM7UUFFRiwyQkFBMkI7UUFDM0IsQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUU1QyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUVEOzs7O09BSUc7SUFDSyxNQUFNLENBQUMsVUFBVTtRQUVyQixJQUFJLElBQWtCLENBQUM7UUFDdkIsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDLGdCQUFnQixDQUNoQyxRQUFRLENBQUMsSUFBSSxFQUNiLFVBQVUsQ0FBQyxZQUFZLEdBQUcsVUFBVSxDQUFDLFNBQVMsRUFDOUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUMvQixLQUFLLENBQ1IsQ0FBQztRQUVGLE9BQVEsSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFDOUI7WUFDSSxJQUFJ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Q3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIEdsb2JhbCByZWZlcmVuY2UgdG8gdGhlIGxhbmd1YWdlIGNvbnRhaW5lciwgc2V0IGF0IGluaXQgKi9cclxubGV0IEwgOiBFbmdsaXNoTGFuZ3VhZ2UgfCBCYXNlTGFuZ3VhZ2U7XHJcblxyXG5jbGFzcyBJMThuXHJcbntcclxuICAgIC8qKiBDb25zdGFudCByZWdleCB0byBtYXRjaCBmb3IgdHJhbnNsYXRpb24ga2V5cyAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVEFHX1JFR0VYIDogUmVnRXhwID0gLyVbQS1aX10rJS87XHJcblxyXG4gICAgLyoqIExhbmd1YWdlcyBjdXJyZW50bHkgYXZhaWxhYmxlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBsYW5ndWFnZXMgICA6IERpY3Rpb25hcnk8QmFzZUxhbmd1YWdlPjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gbGFuZ3VhZ2UgY3VycmVudGx5IGluIHVzZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgY3VycmVudExhbmcgOiBCYXNlTGFuZ3VhZ2U7XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgbGFuZ3VhZ2UsIGFuZCB0cmFuc2Zvcm1zIGFsbCB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBkb2N1bWVudCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMubGFuZ3VhZ2VzKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0kxOG4gaXMgYWxyZWFkeSBpbml0aWFsaXplZCcpO1xyXG5cclxuICAgICAgICB0aGlzLmxhbmd1YWdlcyA9IHtcclxuICAgICAgICAgICAgJ2VuJyA6IG5ldyBFbmdsaXNoTGFuZ3VhZ2UoKVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIFRPRE86IExhbmd1YWdlIHNlbGVjdGlvblxyXG4gICAgICAgIEwgPSB0aGlzLmN1cnJlbnRMYW5nID0gdGhpcy5sYW5ndWFnZXNbJ2VuJ107XHJcblxyXG4gICAgICAgIEkxOG4uYXBwbHlUb0RvbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogV2Fsa3MgdGhyb3VnaCBhbGwgdGV4dCBub2RlcyBpbiB0aGUgRE9NLCByZXBsYWNpbmcgYW55IHRyYW5zbGF0aW9uIGtleXMuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTA3MzA3NzcvMzM1NDkyMFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBhcHBseVRvRG9tKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5leHQgOiBOb2RlIHwgbnVsbDtcclxuICAgICAgICBsZXQgd2FsayA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoXHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHksXHJcbiAgICAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5UIHwgTm9kZUZpbHRlci5TSE9XX1RFWFQsXHJcbiAgICAgICAgICAgIHsgYWNjZXB0Tm9kZTogSTE4bi5ub2RlRmlsdGVyIH0sXHJcbiAgICAgICAgICAgIGZhbHNlXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgd2hpbGUgKCBuZXh0ID0gd2Fsay5uZXh0Tm9kZSgpIClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmIChuZXh0Lm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnQgPSBuZXh0IGFzIEVsZW1lbnQ7XHJcblxyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBlbGVtZW50LmF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgICAgICAgICAgSTE4bi5leHBhbmRBdHRyaWJ1dGUoZWxlbWVudC5hdHRyaWJ1dGVzW2ldKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChuZXh0Lm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSAmJiBuZXh0LnRleHRDb250ZW50KVxyXG4gICAgICAgICAgICAgICAgSTE4bi5leHBhbmRUZXh0Tm9kZShuZXh0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbHRlcnMgdGhlIHRyZWUgd2Fsa2VyIHRvIGV4Y2x1ZGUgc2NyaXB0IGFuZCBzdHlsZSB0YWdzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBub2RlRmlsdGVyKG5vZGU6IE5vZGUpIDogbnVtYmVyXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhZyA9IChub2RlLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSlcclxuICAgICAgICAgICAgPyAobm9kZSBhcyBFbGVtZW50KS50YWdOYW1lLnRvVXBwZXJDYXNlKClcclxuICAgICAgICAgICAgOiBub2RlLnBhcmVudEVsZW1lbnQhLnRhZ05hbWUudG9VcHBlckNhc2UoKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsnU0NSSVBUJywgJ1NUWUxFJ10uaW5jbHVkZXModGFnKVxyXG4gICAgICAgICAgICA/IE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVFxyXG4gICAgICAgICAgICA6IE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRXhwYW5kcyBhbnkgdHJhbnNsYXRpb24ga2V5cyBpbiB0aGUgZ2l2ZW4gYXR0cmlidXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBleHBhbmRBdHRyaWJ1dGUoYXR0cjogQXR0cikgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2V0dGluZyBhbiBhdHRyaWJ1dGUsIGV2ZW4gaWYgbm90aGluZyBhY3R1YWxseSBjaGFuZ2VzLCB3aWxsIGNhdXNlIHZhcmlvdXNcclxuICAgICAgICAvLyBzaWRlLWVmZmVjdHMgKGUuZy4gcmVsb2FkaW5nIGlmcmFtZXMpLiBTbywgYXMgd2FzdGVmdWwgYXMgdGhpcyBsb29rcywgd2UgaGF2ZVxyXG4gICAgICAgIC8vIHRvIG1hdGNoIGZpcnN0IGJlZm9yZSBhY3R1YWxseSByZXBsYWNpbmcuXHJcblxyXG4gICAgICAgIGlmICggYXR0ci52YWx1ZS5tYXRjaCh0aGlzLlRBR19SRUdFWCkgKVxyXG4gICAgICAgICAgICBhdHRyLnZhbHVlID0gYXR0ci52YWx1ZS5yZXBsYWNlKHRoaXMuVEFHX1JFR0VYLCBJMThuLnJlcGxhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBFeHBhbmRzIGFueSB0cmFuc2xhdGlvbiBrZXlzIGluIHRoZSBnaXZlbiB0ZXh0IG5vZGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGV4cGFuZFRleHROb2RlKG5vZGU6IE5vZGUpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIG5vZGUudGV4dENvbnRlbnQgPSBub2RlLnRleHRDb250ZW50IS5yZXBsYWNlKHRoaXMuVEFHX1JFR0VYLCBJMThuLnJlcGxhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZXBsYWNlcyBrZXkgd2l0aCB2YWx1ZSBpZiBpdCBleGlzdHMsIGVsc2Uga2VlcHMgdGhlIGtleSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVwbGFjZShtYXRjaDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBrZXkgICA9IG1hdGNoLnNsaWNlKDEsIC0xKTtcclxuICAgICAgICBsZXQgdmFsdWUgPSBMW2tleV0gYXMgTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAgICAgaWYgKCF2YWx1ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgdHJhbnNsYXRpb24ga2V5OicsIG1hdGNoKTtcclxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSgpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogRGVsZWdhdGUgdHlwZSBmb3IgY2hvb3NlciBzZWxlY3QgZXZlbnQgaGFuZGxlcnMgKi9cclxudHlwZSBTZWxlY3REZWxlZ2F0ZSA9IChlbnRyeTogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XHJcblxyXG4vKiogVUkgZWxlbWVudCB3aXRoIGEgZmlsdGVyYWJsZSBhbmQga2V5Ym9hcmQgbmF2aWdhYmxlIGxpc3Qgb2YgY2hvaWNlcyAqL1xyXG5jbGFzcyBDaG9vc2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIERPTSB0ZW1wbGF0ZSB0byBjbG9uZSwgZm9yIGVhY2ggY2hvb3NlciBjcmVhdGVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURSAgICAgICAgPSBET00ucmVxdWlyZSgnI2Nob29zZXJUZW1wbGF0ZScpO1xyXG4gICAgICAgIENob29zZXIuVEVNUExBVEUuaWQgICAgID0gJyc7XHJcbiAgICAgICAgQ2hvb3Nlci5URU1QTEFURS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICBDaG9vc2VyLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBjaG9vc2VyJ3MgY29udGFpbmVyICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZG9tICAgICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgY2hvb3NlcidzIGZpbHRlciBpbnB1dCBib3ggKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBpbnB1dEZpbHRlciAgOiBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGNob29zZXIncyBjb250YWluZXIgb2YgaXRlbSBlbGVtZW50cyAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGlucHV0Q2hvaWNlcyA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBPcHRpb25hbCBldmVudCBoYW5kbGVyIHRvIGZpcmUgd2hlbiBhbiBpdGVtIGlzIHNlbGVjdGVkIGJ5IHRoZSB1c2VyICovXHJcbiAgICBwdWJsaWMgICAgb25TZWxlY3Q/ICAgICA6IFNlbGVjdERlbGVnYXRlO1xyXG4gICAgLyoqIFdoZXRoZXIgdG8gdmlzdWFsbHkgc2VsZWN0IHRoZSBjbGlja2VkIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyAgICBzZWxlY3RPbkNsaWNrIDogYm9vbGVhbiA9IHRydWU7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgaXRlbSwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgZG9tU2VsZWN0ZWQ/ICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgYXV0by1maWx0ZXIgdGltZW91dCwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgZmlsdGVyVGltZW91dCA6IG51bWJlciA9IDA7XHJcbiAgICAvKiogV2hldGhlciB0byBncm91cCBhZGRlZCBlbGVtZW50cyBieSBhbHBoYWJldGljYWwgc2VjdGlvbnMgKi9cclxuICAgIHByb3RlY3RlZCBncm91cEJ5QUJDICAgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIFRpdGxlIGF0dHJpYnV0ZSB0byBhcHBseSB0byBldmVyeSBpdGVtIGFkZGVkICovXHJcbiAgICBwcm90ZWN0ZWQgaXRlbVRpdGxlICAgICA6IHN0cmluZyA9ICdDbGljayB0byBzZWxlY3QgdGhpcyBpdGVtJztcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhIGNob29zZXIsIGJ5IHJlcGxhY2luZyB0aGUgcGxhY2Vob2xkZXIgaW4gYSBnaXZlbiBwYXJlbnQgKi9cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIGlmICghQ2hvb3Nlci5URU1QTEFURSlcclxuICAgICAgICAgICAgQ2hvb3Nlci5pbml0KCk7XHJcblxyXG4gICAgICAgIGxldCB0YXJnZXQgICAgICA9IERPTS5yZXF1aXJlKCdjaG9vc2VyJywgcGFyZW50KTtcclxuICAgICAgICBsZXQgcGxhY2Vob2xkZXIgPSBET00uZ2V0QXR0ciggdGFyZ2V0LCAncGxhY2Vob2xkZXInLCBMLlBfR0VORVJJQ19QSCgpICk7XHJcbiAgICAgICAgbGV0IHRpdGxlICAgICAgID0gRE9NLmdldEF0dHIoIHRhcmdldCwgJ3RpdGxlJywgTC5QX0dFTkVSSUNfVCgpICk7XHJcbiAgICAgICAgdGhpcy5pdGVtVGl0bGUgID0gRE9NLmdldEF0dHIodGFyZ2V0LCAnaXRlbVRpdGxlJywgdGhpcy5pdGVtVGl0bGUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdXBCeUFCQyA9IHRhcmdldC5oYXNBdHRyaWJ1dGUoJ2dyb3VwQnlBQkMnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgICAgPSBDaG9vc2VyLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyICA9IERPTS5yZXF1aXJlKCcuY2hTZWFyY2hCb3gnLCAgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzID0gRE9NLnJlcXVpcmUoJy5jaENob2ljZXNCb3gnLCB0aGlzLmRvbSk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLnRpdGxlICAgICAgPSB0aXRsZTtcclxuICAgICAgICB0aGlzLmlucHV0RmlsdGVyLnBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XHJcbiAgICAgICAgLy8gVE9ETzogUmV1c2luZyB0aGUgcGxhY2Vob2xkZXIgYXMgdGl0bGUgaXMgcHJvYmFibHkgYmFkXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9sYWtlbi5uZXQvYmxvZy9tb3N0LWNvbW1vbi1hMTF5LW1pc3Rha2VzL1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIudGl0bGUgICAgICAgPSBwbGFjZWhvbGRlcjtcclxuXHJcbiAgICAgICAgdGFyZ2V0Lmluc2VydEFkamFjZW50RWxlbWVudCgnYmVmb3JlYmVnaW4nLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGFyZ2V0LnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQWRkcyB0aGUgZ2l2ZW4gdmFsdWUgdG8gdGhlIGNob29zZXIgYXMgYSBzZWxlY3RhYmxlIGl0ZW0uXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHZhbHVlIFRleHQgb2YgdGhlIHNlbGVjdGFibGUgaXRlbVxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBXaGV0aGVyIHRvIHNlbGVjdCB0aGlzIGl0ZW0gb25jZSBhZGRlZFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYWRkKHZhbHVlOiBzdHJpbmcsIHNlbGVjdDogYm9vbGVhbiA9IGZhbHNlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaXRlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcblxyXG4gICAgICAgIGl0ZW0uaW5uZXJUZXh0ID0gdmFsdWU7XHJcblxyXG4gICAgICAgIHRoaXMuYWRkUmF3KGl0ZW0sIHNlbGVjdCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBZGRzIHRoZSBnaXZlbiBlbGVtZW50IHRvIHRoZSBjaG9vc2VyIGFzIGEgc2VsZWN0YWJsZSBpdGVtLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBpdGVtIEVsZW1lbnQgdG8gYWRkIHRvIHRoZSBjaG9vc2VyXHJcbiAgICAgKiBAcGFyYW0gc2VsZWN0IFdoZXRoZXIgdG8gc2VsZWN0IHRoaXMgaXRlbSBvbmNlIGFkZGVkXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBhZGRSYXcoaXRlbTogSFRNTEVsZW1lbnQsIHNlbGVjdDogYm9vbGVhbiA9IGZhbHNlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpdGVtLnRpdGxlICAgID0gdGhpcy5pdGVtVGl0bGU7XHJcbiAgICAgICAgaXRlbS50YWJJbmRleCA9IC0xO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5hcHBlbmRDaGlsZChpdGVtKTtcclxuXHJcbiAgICAgICAgaWYgKHNlbGVjdClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGl0ZW0pO1xyXG4gICAgICAgICAgICBpdGVtLmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbGVhcnMgYWxsIGl0ZW1zIGZyb20gdGhpcyBjaG9vc2VyIGFuZCB0aGUgY3VycmVudCBmaWx0ZXIgKi9cclxuICAgIHB1YmxpYyBjbGVhcigpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmlubmVySFRNTCA9ICcnO1xyXG4gICAgICAgIHRoaXMuaW5wdXRGaWx0ZXIudmFsdWUgICAgICA9ICcnO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZWxlY3QgYW5kIGZvY3VzIHRoZSBlbnRyeSB0aGF0IG1hdGNoZXMgdGhlIGdpdmVuIHZhbHVlICovXHJcbiAgICBwdWJsaWMgcHJlc2VsZWN0KHZhbHVlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGZvciAobGV0IGtleSBpbiB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBpdGVtID0gdGhpcy5pbnB1dENob2ljZXMuY2hpbGRyZW5ba2V5XSBhcyBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gaXRlbS5pbm5lclRleHQpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudmlzdWFsU2VsZWN0KGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgaXRlbS5mb2N1cygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xpY2sgZXZlbnRzLCBmb3IgY2hvb3NpbmcgaXRlbXMgKi9cclxuICAgIHB1YmxpYyBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgdGFyZ2V0ID0gZXYudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIHRoaXMuaXNDaG9pY2UodGFyZ2V0KSApXHJcbiAgICAgICAgaWYgKCAhdGFyZ2V0Lmhhc0F0dHJpYnV0ZSgnZGlzYWJsZWQnKSApXHJcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0KHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xvc2UgbWV0aG9kcywgZG9pbmcgYW55IHRpbWVyIGNsZWFudXAgKi9cclxuICAgIHB1YmxpYyBvbkNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHBpY2tlcnMnIGlucHV0IGV2ZW50cywgZm9yIGZpbHRlcmluZyBhbmQgbmF2aWdhdGlvbiAqL1xyXG4gICAgcHVibGljIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBrZXkgICAgID0gZXYua2V5O1xyXG4gICAgICAgIGxldCBmb2N1c2VkID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgcGFyZW50ICA9IGZvY3VzZWQucGFyZW50RWxlbWVudCE7XHJcblxyXG4gICAgICAgIGlmICghZm9jdXNlZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBPbmx5IGhhbmRsZSBldmVudHMgb24gdGhpcyBjaG9vc2VyJ3MgY29udHJvbHNcclxuICAgICAgICBpZiAoICF0aGlzLm93bnMoZm9jdXNlZCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSB0eXBpbmcgaW50byBmaWx0ZXIgYm94XHJcbiAgICAgICAgaWYgKGZvY3VzZWQgPT09IHRoaXMuaW5wdXRGaWx0ZXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZmlsdGVyVGltZW91dCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmZpbHRlclRpbWVvdXQgPSB3aW5kb3cuc2V0VGltZW91dChfID0+IHRoaXMuZmlsdGVyKCksIDUwMCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFJlZGlyZWN0IHR5cGluZyB0byBpbnB1dCBmaWx0ZXIgYm94XHJcbiAgICAgICAgaWYgKGZvY3VzZWQgIT09IHRoaXMuaW5wdXRGaWx0ZXIpXHJcbiAgICAgICAgaWYgKGtleS5sZW5ndGggPT09IDEgfHwga2V5ID09PSAnQmFja3NwYWNlJylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaW5wdXRGaWx0ZXIuZm9jdXMoKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHByZXNzaW5nIEVOVEVSIGFmdGVyIGtleWJvYXJkIG5hdmlnYXRpbmcgdG8gYW4gaXRlbVxyXG4gICAgICAgIGlmICggdGhpcy5pc0Nob2ljZShmb2N1c2VkKSApXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0VudGVyJylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0KGZvY3VzZWQpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgbmF2aWdhdGlvbiB3aGVuIGNvbnRhaW5lciBvciBpdGVtIGlzIGZvY3VzZWRcclxuICAgICAgICBpZiAoa2V5ID09PSAnQXJyb3dMZWZ0JyB8fCBrZXkgPT09ICdBcnJvd1JpZ2h0JylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBkaXIgPSAoa2V5ID09PSAnQXJyb3dMZWZ0JykgPyAtMSA6IDE7XHJcbiAgICAgICAgICAgIGxldCBuYXYgPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsYXRpdmUgdG8gY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudCwgaWYgdXNpbmcgZ3JvdXBzXHJcbiAgICAgICAgICAgIGlmICAgICAgKCB0aGlzLmdyb3VwQnlBQkMgJiYgcGFyZW50Lmhhc0F0dHJpYnV0ZSgnZ3JvdXAnKSApXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoZm9jdXNlZCwgZGlyKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQsIGlmIGNob2ljZXMgYXJlIGZsYXRcclxuICAgICAgICAgICAgZWxzZSBpZiAoIXRoaXMuZ3JvdXBCeUFCQyAmJiBmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRDaG9pY2VzKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKGZvY3VzZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxhdGl2ZSB0byBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudFxyXG4gICAgICAgICAgICBlbHNlIGlmIChmb2N1c2VkID09PSB0aGlzLmRvbVNlbGVjdGVkKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKHRoaXMuZG9tU2VsZWN0ZWQsIGRpcik7XHJcblxyXG4gICAgICAgICAgICAvLyBOYXZpZ2F0ZSByZWxldmFudCB0byBiZWdpbm5pbmcgb3IgZW5kIG9mIGNvbnRhaW5lclxyXG4gICAgICAgICAgICBlbHNlIGlmIChkaXIgPT09IC0xKVxyXG4gICAgICAgICAgICAgICAgbmF2ID0gRE9NLmdldE5leHRGb2N1c2FibGVTaWJsaW5nKFxyXG4gICAgICAgICAgICAgICAgICAgIGZvY3VzZWQuZmlyc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmxhc3RFbGVtZW50Q2hpbGQhIGFzIEhUTUxFbGVtZW50LCBkaXJcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBpZiAobmF2KSBuYXYuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2Vycycgc3VibWl0IGV2ZW50cywgZm9yIGluc3RhbnQgZmlsdGVyaW5nICovXHJcbiAgICBwdWJsaWMgb25TdWJtaXQoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIHRoaXMuZmlsdGVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhpZGUgb3Igc2hvdyBjaG9pY2VzIGlmIHRoZXkgcGFydGlhbGx5IG1hdGNoIHRoZSB1c2VyIHF1ZXJ5ICovXHJcbiAgICBwcm90ZWN0ZWQgZmlsdGVyKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmZpbHRlclRpbWVvdXQpO1xyXG5cclxuICAgICAgICBsZXQgZmlsdGVyID0gdGhpcy5pbnB1dEZpbHRlci52YWx1ZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIGxldCBpdGVtcyAgPSB0aGlzLmlucHV0Q2hvaWNlcy5jaGlsZHJlbjtcclxuICAgICAgICBsZXQgZW5naW5lID0gdGhpcy5ncm91cEJ5QUJDXHJcbiAgICAgICAgICAgID8gQ2hvb3Nlci5maWx0ZXJHcm91cFxyXG4gICAgICAgICAgICA6IENob29zZXIuZmlsdGVySXRlbTtcclxuXHJcbiAgICAgICAgLy8gUHJldmVudCBicm93c2VyIHJlZHJhdy9yZWZsb3cgZHVyaW5nIGZpbHRlcmluZ1xyXG4gICAgICAgIC8vIFRPRE86IE1pZ2h0IHRoZSB1c2Ugb2YgaGlkZGVuIGJyZWFrIEExMXkgaGVyZT8gKGUuZy4gZGVmb2N1cylcclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy5oaWRkZW4gPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBJdGVyYXRlIHRocm91Z2ggYWxsIHRoZSBpdGVtc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIGVuZ2luZShpdGVtc1tpXSBhcyBIVE1MRWxlbWVudCwgZmlsdGVyKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMuaGlkZGVuID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEFwcGxpZXMgZmlsdGVyIHRvIGFuIGl0ZW0sIHNob3dpbmcgaXQgaWYgbWF0Y2hlZCwgaGlkaW5nIGlmIG5vdCAqL1xyXG4gICAgcHJvdGVjdGVkIHN0YXRpYyBmaWx0ZXJJdGVtKGl0ZW06IEhUTUxFbGVtZW50LCBmaWx0ZXI6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICAvLyBTaG93IGlmIGNvbnRhaW5zIHNlYXJjaCB0ZXJtXHJcbiAgICAgICAgaWYgKGl0ZW0uaW5uZXJUZXh0LnRvTG93ZXJDYXNlKCkuaW5kZXhPZihmaWx0ZXIpID49IDApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpdGVtLmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhpZGUgaWYgbm90XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaXRlbS5oaWRkZW4gPSB0cnVlO1xyXG4gICAgICAgICAgICByZXR1cm4gMTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEFwcGxpZXMgZmlsdGVyIHRvIGNoaWxkcmVuIG9mIGEgZ3JvdXAsIGhpZGluZyB0aGUgZ3JvdXAgaWYgYWxsIGNoaWxkcmVuIGhpZGUgKi9cclxuICAgIHByb3RlY3RlZCBzdGF0aWMgZmlsdGVyR3JvdXAoZ3JvdXA6IEhUTUxFbGVtZW50LCBmaWx0ZXI6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGVudHJpZXMgPSBncm91cC5jaGlsZHJlbjtcclxuICAgICAgICBsZXQgY291bnQgICA9IGVudHJpZXMubGVuZ3RoIC0gMTsgLy8gLTEgZm9yIGhlYWRlciBlbGVtZW50XHJcbiAgICAgICAgbGV0IGhpZGRlbiAgPSAwO1xyXG5cclxuICAgICAgICAvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBzdGF0aW9uIG5hbWUgaW4gdGhpcyBsZXR0ZXIgc2VjdGlvbi4gSGVhZGVyIHNraXBwZWQuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBlbnRyaWVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICBoaWRkZW4gKz0gQ2hvb3Nlci5maWx0ZXJJdGVtKGVudHJpZXNbaV0gYXMgSFRNTEVsZW1lbnQsIGZpbHRlcik7XHJcblxyXG4gICAgICAgIC8vIElmIGFsbCBzdGF0aW9uIG5hbWVzIGluIHRoaXMgbGV0dGVyIHNlY3Rpb24gd2VyZSBoaWRkZW4sIGhpZGUgdGhlIHNlY3Rpb25cclxuICAgICAgICBpZiAoaGlkZGVuID49IGNvdW50KVxyXG4gICAgICAgICAgICBncm91cC5oaWRkZW4gPSB0cnVlO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgZ3JvdXAuaGlkZGVuID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFZpc3VhbGx5IGNoYW5nZXMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLCBhbmQgdXBkYXRlcyB0aGUgc3RhdGUgYW5kIGVkaXRvciAqL1xyXG4gICAgcHJvdGVjdGVkIHNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBhbHJlYWR5U2VsZWN0ZWQgPSAoZW50cnkgPT09IHRoaXMuZG9tU2VsZWN0ZWQpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zZWxlY3RPbkNsaWNrKVxyXG4gICAgICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChlbnRyeSk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm9uU2VsZWN0KVxyXG4gICAgICAgICAgICB0aGlzLm9uU2VsZWN0KGVudHJ5KTtcclxuXHJcbiAgICAgICAgaWYgKGFscmVhZHlTZWxlY3RlZClcclxuICAgICAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBWaXN1YWxseSBjaGFuZ2VzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudCAqL1xyXG4gICAgcHJvdGVjdGVkIHZpc3VhbFNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMudmlzdWFsVW5zZWxlY3QoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZCAgICAgICAgICA9IGVudHJ5O1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQudGFiSW5kZXggPSA1MDtcclxuICAgICAgICBlbnRyeS5zZXRBdHRyaWJ1dGUoJ3NlbGVjdGVkJywgJ3RydWUnKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVmlzdWFsbHkgdW5zZWxlY3RzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgZWxlbWVudCwgaWYgYW55ICovXHJcbiAgICBwcm90ZWN0ZWQgdmlzdWFsVW5zZWxlY3QoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuZG9tU2VsZWN0ZWQpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC5yZW1vdmVBdHRyaWJ1dGUoJ3NlbGVjdGVkJyk7XHJcbiAgICAgICAgdGhpcy5kb21TZWxlY3RlZC50YWJJbmRleCA9IC0xO1xyXG4gICAgICAgIHRoaXMuZG9tU2VsZWN0ZWQgICAgICAgICAgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBXaGV0aGVyIHRoaXMgY2hvb3NlciBpcyBhbiBhbmNlc3RvciAob3duZXIpIG9mIHRoZSBnaXZlbiBlbGVtZW50LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0YXJnZXQgRWxlbWVudCB0byBjaGVjayBpZiB0aGlzIGNob29zZXIgaXMgYW4gYW5jZXN0b3Igb2ZcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIG93bnModGFyZ2V0OiBIVE1MRWxlbWVudCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmNvbnRhaW5zKHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgdGhlIGdpdmVuIGVsZW1lbnQgaXMgYSBjaG9vc2FibGUgb25lIG93bmVkIGJ5IHRoaXMgY2hvb3NlciAqL1xyXG4gICAgcHJvdGVjdGVkIGlzQ2hvaWNlKHRhcmdldD86IEhUTUxFbGVtZW50KSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGFyZ2V0ICE9PSB1bmRlZmluZWRcclxuICAgICAgICAgICAgJiYgdGFyZ2V0LnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2RkJ1xyXG4gICAgICAgICAgICAmJiB0aGlzLm93bnModGFyZ2V0KTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFVJIGVsZW1lbnQgZm9yIHRvZ2dsaW5nIHRoZSBzdGF0ZSBvZiBjb2xsYXBzaWJsZSBlZGl0b3IgZWxlbWVudHMgKi9cclxuY2xhc3MgQ29sbGFwc2VUb2dnbGVcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgdG9nZ2xlIGJ1dHRvbiBET00gdGVtcGxhdGUgdG8gY2xvbmUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIFRFTVBMQVRFIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqIENyZWF0ZXMgYW5kIGRldGFjaGVzIHRoZSB0ZW1wbGF0ZSBvbiBmaXJzdCBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIGluaXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBDb2xsYXBzZVRvZ2dsZS5URU1QTEFURSAgICAgICAgPSBET00ucmVxdWlyZSgnI2NvbGxhcHNpYmxlQnV0dG9uVGVtcGxhdGUnKTtcclxuICAgICAgICBDb2xsYXBzZVRvZ2dsZS5URU1QTEFURS5pZCAgICAgPSAnJztcclxuICAgICAgICBDb2xsYXBzZVRvZ2dsZS5URU1QTEFURS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICBDb2xsYXBzZVRvZ2dsZS5URU1QTEFURS5yZW1vdmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgYXR0YWNoZXMgdG9nZ2xlIGVsZW1lbnQgZm9yIHRvZ2dsaW5nIGNvbGxhcHNpYmxlcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjcmVhdGVBbmRBdHRhY2gocGFyZW50OiBFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTa2lwIGlmIGEgdG9nZ2xlIGlzIGFscmVhZHkgYXR0YWNoZWRcclxuICAgICAgICBpZiAoIHBhcmVudC5xdWVyeVNlbGVjdG9yKCcudG9nZ2xlJykgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICghQ29sbGFwc2VUb2dnbGUuVEVNUExBVEUpXHJcbiAgICAgICAgICAgIENvbGxhcHNlVG9nZ2xlLmluaXQoKTtcclxuXHJcbiAgICAgICAgcGFyZW50Lmluc2VydEFkamFjZW50RWxlbWVudCgnYWZ0ZXJiZWdpbicsXHJcbiAgICAgICAgICAgIENvbGxhcHNlVG9nZ2xlLlRFTVBMQVRFLmNsb25lTm9kZSh0cnVlKSBhcyBFbGVtZW50XHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgZ2l2ZW4gY29sbGFwc2UgdG9nZ2xlJ3MgdGl0bGUgdGV4dCwgZGVwZW5kaW5nIG9uIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHVwZGF0ZShzcGFuOiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHJlZiAgICA9IHNwYW4uZGF0YXNldFsncmVmJ10gfHwgJz8/Pyc7XHJcbiAgICAgICAgbGV0IHR5cGUgICA9IHNwYW4uZGF0YXNldFsndHlwZSddITtcclxuICAgICAgICBsZXQgc3RhdGUgID0gc3Bhbi5oYXNBdHRyaWJ1dGUoJ2NvbGxhcHNlZCcpO1xyXG4gICAgICAgIGxldCB0b2dnbGUgPSBET00ucmVxdWlyZSgnLnRvZ2dsZScsIHNwYW4pO1xyXG5cclxuICAgICAgICB0b2dnbGUudGl0bGUgPSBzdGF0ZVxyXG4gICAgICAgICAgICA/IEwuVElUTEVfT1BUX09QRU4odHlwZSwgcmVmKVxyXG4gICAgICAgICAgICA6IEwuVElUTEVfT1BUX0NMT1NFKHR5cGUsIHJlZik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVSSBlbGVtZW50IGZvciBvcGVuaW5nIHRoZSBwaWNrZXIgZm9yIHBocmFzZXNldCBlZGl0b3IgZWxlbWVudHMgKi9cclxuY2xhc3MgUGhyYXNlc2V0QnV0dG9uXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBocmFzZXNldCBidXR0b24gRE9NIHRlbXBsYXRlIHRvIGNsb25lICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBURU1QTEFURSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBkZXRhY2hlcyB0aGUgdGVtcGxhdGUgb24gZmlyc3QgY3JlYXRlICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbml0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVE9ETzogVGhpcyBpcyBiZWluZyBkdXBsaWNhdGVkIGluIHZhcmlvdXMgcGxhY2VzOyBEUlkgd2l0aCBzdWdhciBtZXRob2RcclxuICAgICAgICBQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUgICAgICAgID0gRE9NLnJlcXVpcmUoJyNwaHJhc2VzZXRCdXR0b25UZW1wbGF0ZScpO1xyXG4gICAgICAgIFBocmFzZXNldEJ1dHRvbi5URU1QTEFURS5pZCAgICAgPSAnJztcclxuICAgICAgICBQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUuaGlkZGVuID0gZmFsc2U7XHJcbiAgICAgICAgUGhyYXNlc2V0QnV0dG9uLlRFTVBMQVRFLnJlbW92ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBhdHRhY2hlcyBhIGJ1dHRvbiBmb3IgdGhlIGdpdmVuIHBocmFzZXNldCBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNyZWF0ZUFuZEF0dGFjaChwaHJhc2VzZXQ6IEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFNraXAgaWYgYSBidXR0b24gaXMgYWxyZWFkeSBhdHRhY2hlZFxyXG4gICAgICAgIGlmICggcGhyYXNlc2V0LnF1ZXJ5U2VsZWN0b3IoJy5jaG9vc2VQaHJhc2UnKSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKCFQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUpXHJcbiAgICAgICAgICAgIFBocmFzZXNldEJ1dHRvbi5pbml0KCk7XHJcblxyXG4gICAgICAgIGxldCByZWYgICAgICA9IERPTS5yZXF1aXJlRGF0YShwaHJhc2VzZXQgYXMgSFRNTEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgYnV0dG9uICAgPSBQaHJhc2VzZXRCdXR0b24uVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGJ1dHRvbi50aXRsZSA9IEwuVElUTEVfUEhSQVNFU0VUKHJlZik7XHJcblxyXG4gICAgICAgIHBocmFzZXNldC5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2FmdGVyYmVnaW4nLCBidXR0b24pO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLyBUT0RPOiBTZWFyY2ggYnkgc3RhdGlvbiBjb2RlXHJcblxyXG4vKipcclxuICogU2luZ2xldG9uIGluc3RhbmNlIG9mIHRoZSBzdGF0aW9uIHBpY2tlci4gU2luY2UgdGhlcmUgYXJlIGV4cGVjdGVkIHRvIGJlIDI1MDArXHJcbiAqIHN0YXRpb25zLCB0aGlzIGVsZW1lbnQgd291bGQgdGFrZSB1cCBhIGxvdCBvZiBtZW1vcnkgYW5kIGdlbmVyYXRlIGEgbG90IG9mIERPTS4gU28sIGl0XHJcbiAqIGhhcyB0byBiZSBcInN3YXBwZWRcIiBiZXR3ZWVuIHBpY2tlcnMgYW5kIHZpZXdzIHRoYXQgd2FudCB0byB1c2UgaXQuXHJcbiAqL1xyXG5jbGFzcyBTdGF0aW9uQ2hvb3NlciBleHRlbmRzIENob29zZXJcclxue1xyXG4gICAgLyoqIFNob3J0Y3V0IHJlZmVyZW5jZXMgdG8gYWxsIHRoZSBnZW5lcmF0ZWQgQS1aIHN0YXRpb24gbGlzdCBlbGVtZW50cyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21TdGF0aW9ucyA6IERpY3Rpb25hcnk8SFRNTERMaXN0RWxlbWVudD4gPSB7fTtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGFyZW50OiBIVE1MRWxlbWVudClcclxuICAgIHtcclxuICAgICAgICBzdXBlcihwYXJlbnQpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0Q2hvaWNlcy50YWJJbmRleCA9IDA7XHJcblxyXG4gICAgICAgIC8vIFBvcHVsYXRlcyB0aGUgbGlzdCBvZiBzdGF0aW9ucyBmcm9tIHRoZSBkYXRhYmFzZS4gV2UgZG8gdGhpcyBieSBjcmVhdGluZyBhIGRsXHJcbiAgICAgICAgLy8gZWxlbWVudCBmb3IgZWFjaCBsZXR0ZXIgb2YgdGhlIGFscGhhYmV0LCBjcmVhdGluZyBhIGR0IGVsZW1lbnQgaGVhZGVyLCBhbmQgdGhlblxyXG4gICAgICAgIC8vIHBvcHVsYXRpbmcgdGhlIGRsIHdpdGggc3RhdGlvbiBuYW1lIGRkIGNoaWxkcmVuLlxyXG4gICAgICAgIE9iamVjdC5rZXlzKFJBRy5kYXRhYmFzZS5zdGF0aW9ucykuZm9yRWFjaCggdGhpcy5hZGRTdGF0aW9uLmJpbmQodGhpcykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEF0dGFjaGVzIHRoaXMgY29udHJvbCB0byB0aGUgZ2l2ZW4gcGFyZW50IGFuZCByZXNldHMgc29tZSBzdGF0ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGlja2VyIFBpY2tlciB0byBhdHRhY2ggdGhpcyBjb250cm9sIHRvXHJcbiAgICAgKiBAcGFyYW0gb25TZWxlY3QgRGVsZWdhdGUgdG8gZmlyZSB3aGVuIGNob29zaW5nIGEgc3RhdGlvblxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgYXR0YWNoKHBpY2tlcjogUGlja2VyLCBvblNlbGVjdDogU2VsZWN0RGVsZWdhdGUpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgID0gcGlja2VyLmRvbUZvcm07XHJcbiAgICAgICAgbGV0IGN1cnJlbnQgPSB0aGlzLmRvbS5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICAvLyBSZS1lbmFibGUgYWxsIGRpc2FibGVkIGVsZW1lbnRzXHJcbiAgICAgICAgdGhpcy5pbnB1dENob2ljZXMucXVlcnlTZWxlY3RvckFsbChgZGRbZGlzYWJsZWRdYClcclxuICAgICAgICAgICAgLmZvckVhY2goIHRoaXMuZW5hYmxlLmJpbmQodGhpcykgKTtcclxuXHJcbiAgICAgICAgaWYgKCFjdXJyZW50IHx8IGN1cnJlbnQgIT09IHBhcmVudClcclxuICAgICAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgdGhpcy52aXN1YWxVbnNlbGVjdCgpO1xyXG4gICAgICAgIHRoaXMub25TZWxlY3QgPSBvblNlbGVjdC5iaW5kKHBpY2tlcik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFByZS1zZWxlY3RzIGEgc3RhdGlvbiBlbnRyeSBieSBpdHMgY29kZSAqL1xyXG4gICAgcHVibGljIHByZXNlbGVjdENvZGUoY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSB0aGlzLmdldEJ5Q29kZShjb2RlKTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLnZpc3VhbFNlbGVjdChlbnRyeSk7XHJcbiAgICAgICAgZW50cnkuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRW5hYmxlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlIG9yIHN0YXRpb24gZWxlbWVudCBmb3Igc2VsZWN0aW9uICovXHJcbiAgICBwdWJsaWMgZW5hYmxlKGNvZGVPck5vZGU6IHN0cmluZyB8IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZW50cnkgPSAodHlwZW9mIGNvZGVPck5vZGUgPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICA/IHRoaXMuZ2V0QnlDb2RlKGNvZGVPck5vZGUpXHJcbiAgICAgICAgICAgIDogY29kZU9yTm9kZTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBlbnRyeS5yZW1vdmVBdHRyaWJ1dGUoJ2Rpc2FibGVkJyk7XHJcbiAgICAgICAgZW50cnkudGFiSW5kZXggPSAtMTtcclxuICAgICAgICBlbnRyeS50aXRsZSAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBEaXNhYmxlcyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlIGZyb20gc2VsZWN0aW9uICovXHJcbiAgICBwdWJsaWMgZGlzYWJsZShjb2RlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBlbnRyeSA9IHRoaXMuZ2V0QnlDb2RlKGNvZGUpO1xyXG4gICAgICAgIGxldCBuZXh0ICA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhlbnRyeSwgMSk7XHJcblxyXG4gICAgICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICAgICAgZW50cnkuc2V0QXR0cmlidXRlKCdkaXNhYmxlZCcsICcnKTtcclxuICAgICAgICBlbnRyeS5yZW1vdmVBdHRyaWJ1dGUoJ3RhYmluZGV4Jyk7XHJcbiAgICAgICAgZW50cnkudGl0bGUgPSAnJztcclxuXHJcbiAgICAgICAgLy8gU2hpZnQgZm9jdXMgdG8gbmV4dCBhdmFpbGFibGUgZWxlbWVudCwgZm9yIGtleWJvYXJkIG5hdmlnYXRpb25cclxuICAgICAgICBpZiAobmV4dClcclxuICAgICAgICAgICAgbmV4dC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIGEgc3RhdGlvbidzIGNob2ljZSBlbGVtZW50IGJ5IGl0cyBjb2RlICovXHJcbiAgICBwcml2YXRlIGdldEJ5Q29kZShjb2RlOiBzdHJpbmcpIDogSFRNTEVsZW1lbnRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbnB1dENob2ljZXNcclxuICAgICAgICAgICAgLnF1ZXJ5U2VsZWN0b3IoYGRkW2RhdGEtY29kZT0ke2NvZGV9XWApIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlICovXHJcbiAgICBwcml2YXRlIGFkZFN0YXRpb24oY29kZTogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgc3RhdGlvbiA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUpO1xyXG4gICAgICAgIGxldCBsZXR0ZXIgID0gc3RhdGlvblswXTtcclxuICAgICAgICBsZXQgZ3JvdXAgICA9IHRoaXMuZG9tU3RhdGlvbnNbbGV0dGVyXTtcclxuXHJcbiAgICAgICAgaWYgKCFncm91cClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBoZWFkZXIgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkdCcpO1xyXG4gICAgICAgICAgICBoZWFkZXIuaW5uZXJUZXh0ID0gbGV0dGVyLnRvVXBwZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGhlYWRlci50YWJJbmRleCAgPSAtMTtcclxuXHJcbiAgICAgICAgICAgIGdyb3VwID0gdGhpcy5kb21TdGF0aW9uc1tsZXR0ZXJdID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGwnKTtcclxuICAgICAgICAgICAgZ3JvdXAudGFiSW5kZXggPSA1MDtcclxuXHJcbiAgICAgICAgICAgIGdyb3VwLnNldEF0dHJpYnV0ZSgnZ3JvdXAnLCAnJyk7XHJcbiAgICAgICAgICAgIGdyb3VwLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXRDaG9pY2VzLmFwcGVuZENoaWxkKGdyb3VwKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBlbnRyeSAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcbiAgICAgICAgZW50cnkuZGF0YXNldFsnY29kZSddID0gY29kZTtcclxuICAgICAgICBlbnRyeS5pbm5lclRleHQgICAgICAgPSBzdGF0aW9uO1xyXG4gICAgICAgIGVudHJ5LnRpdGxlICAgICAgICAgICA9IHRoaXMuaXRlbVRpdGxlO1xyXG4gICAgICAgIGVudHJ5LnRhYkluZGV4ICAgICAgICA9IC0xO1xyXG5cclxuICAgICAgICBncm91cC5hcHBlbmRDaGlsZChlbnRyeSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBTdGF0aW9uIGxpc3QgaXRlbSB0aGF0IGNhbiBiZSBkcmFnZ2VkIGFuZCBkcm9wcGVkICovXHJcbmNsYXNzIFN0YXRpb25MaXN0SXRlbVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBET00gdGVtcGxhdGUgdG8gY2xvbmUsIGZvciBlYWNoIGl0ZW0gY3JlYXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgVEVNUExBVEUgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogQ3JlYXRlcyBhbmQgZGV0YWNoZXMgdGhlIHRlbXBsYXRlIG9uIGZpcnN0IGNyZWF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5pdCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURSAgICAgICAgPSBET00ucmVxdWlyZSgnI3N0YXRpb25MaXN0SXRlbVRlbXBsYXRlJyk7XHJcbiAgICAgICAgU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFLmlkICAgICA9ICcnO1xyXG4gICAgICAgIFN0YXRpb25MaXN0SXRlbS5URU1QTEFURS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIGl0ZW0ncyBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tIDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgc3RhdGlvbiBsaXN0IGl0ZW0sIG1lYW50IGZvciB0aGUgc3RhdGlvbiBsaXN0IGJ1aWxkZXIuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBjcmVhdGUgdGhpcyBpdGVtIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoY29kZTogc3RyaW5nKVxyXG4gICAge1xyXG4gICAgICAgIGlmICghU3RhdGlvbkxpc3RJdGVtLlRFTVBMQVRFKVxyXG4gICAgICAgICAgICBTdGF0aW9uTGlzdEl0ZW0uaW5pdCgpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbSAgICAgICAgICAgPSBTdGF0aW9uTGlzdEl0ZW0uVEVNUExBVEUuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuZG9tLmlubmVyVGV4dCA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5kYXRhc2V0Wydjb2RlJ10gPSBjb2RlO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQmFzZSBjbGFzcyBmb3IgcGlja2VyIHZpZXdzICovXHJcbmFic3RyYWN0IGNsYXNzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyByZWFkb25seSBkb20gICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBmb3JtIERPTSBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tRm9ybSAgIDogSFRNTEZvcm1FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGhlYWRlciBlbGVtZW50ICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZG9tSGVhZGVyIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogR2V0cyB0aGUgbmFtZSBvZiB0aGUgWE1MIHRhZyB0aGlzIHBpY2tlciBoYW5kbGVzICovXHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgeG1sVGFnICAgIDogc3RyaW5nO1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHBocmFzZSBlbGVtZW50IGJlaW5nIGVkaXRlZCBieSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHJvdGVjdGVkIGRvbUVkaXRpbmc/IDogSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgcGlja2VyIHRvIGhhbmRsZSB0aGUgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQgdHlwZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30geG1sVGFnIE5hbWUgb2YgdGhlIFhNTCB0YWcgdGhpcyBwaWNrZXIgd2lsbCBoYW5kbGUuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBjb25zdHJ1Y3Rvcih4bWxUYWc6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbSAgICAgICA9IERPTS5yZXF1aXJlKGAjJHt4bWxUYWd9UGlja2VyYCk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtICAgPSBET00ucmVxdWlyZSgnZm9ybScsICAgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyID0gRE9NLnJlcXVpcmUoJ2hlYWRlcicsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLnhtbFRhZyAgICA9IHhtbFRhZztcclxuXHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uY2hhbmdlICA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25pbnB1dCAgID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tRm9ybS5vbmNsaWNrICAgPSB0aGlzLm9uQ2xpY2suYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbUZvcm0ub25rZXlkb3duID0gdGhpcy5vbklucHV0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5kb21Gb3JtLm9uc3VibWl0ICA9IHRoaXMub25TdWJtaXQuYmluZCh0aGlzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENhbGxlZCB3aGVuIGZvcm0gZmllbGRzIGNoYW5nZS4gVGhlIGltcGxlbWVudGluZyBwaWNrZXIgc2hvdWxkIHVwZGF0ZSBhbGwgbGlua2VkXHJcbiAgICAgKiBlbGVtZW50cyAoZS5nLiBvZiBzYW1lIHR5cGUpIHdpdGggdGhlIG5ldyBkYXRhIGhlcmUuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBhYnN0cmFjdCBvbkNoYW5nZShldjogRXZlbnQpIDogdm9pZDtcclxuXHJcbiAgICAvKiogQ2FsbGVkIHdoZW4gYSBtb3VzZSBjbGljayBoYXBwZW5zIGFueXdoZXJlIGluIG9yIG9uIHRoZSBwaWNrZXIncyBmb3JtICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkO1xyXG5cclxuICAgIC8qKiBDYWxsZWQgd2hlbiBhIGtleSBpcyBwcmVzc2VkIHdoaWxzdCB0aGUgcGlja2VyJ3MgZm9ybSBpcyBmb2N1c2VkICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3Qgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2FsbGVkIHdoZW4gRU5URVIgaXMgcHJlc3NlZCB3aGlsc3QgYSBmb3JtIGNvbnRyb2wgb2YgdGhlIHBpY2tlciBpcyBmb2N1c2VkLlxyXG4gICAgICogQnkgZGVmYXVsdCwgdGhpcyB3aWxsIHRyaWdnZXIgdGhlIG9uQ2hhbmdlIGhhbmRsZXIgYW5kIGNsb3NlIHRoZSBkaWFsb2cuXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgdGhpcy5vbkNoYW5nZShldik7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogT3BlbiB0aGlzIHBpY2tlciBmb3IgYSBnaXZlbiBwaHJhc2UgZWxlbWVudC4gVGhlIGltcGxlbWVudGluZyBwaWNrZXIgc2hvdWxkIGZpbGxcclxuICAgICAqIGl0cyBmb3JtIGVsZW1lbnRzIHdpdGggZGF0YSBmcm9tIHRoZSBjdXJyZW50IHN0YXRlIGFuZCB0YXJnZXRlZCBlbGVtZW50IGhlcmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gdGFyZ2V0IFBocmFzZSBlbGVtZW50IHRoYXQgdGhpcyBwaWNrZXIgaXMgYmVpbmcgb3BlbmVkIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmRvbUVkaXRpbmcgPSB0YXJnZXQ7XHJcbiAgICAgICAgdGhpcy5sYXlvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3NpdGlvbnMgdGhpcyBwaWNrZXIgcmVsYXRpdmUgdG8gdGhlIHRhcmdldCBwaHJhc2UgZWxlbWVudCAqL1xyXG4gICAgcHVibGljIGxheW91dCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5kb21FZGl0aW5nKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCB0YXJnZXRSZWN0ID0gdGhpcy5kb21FZGl0aW5nLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGxldCBmdWxsV2lkdGggID0gdGhpcy5kb20uY2xhc3NMaXN0LmNvbnRhaW5zKCdmdWxsV2lkdGgnKTtcclxuICAgICAgICBsZXQgaXNNb2RhbCAgICA9IHRoaXMuZG9tLmNsYXNzTGlzdC5jb250YWlucygnbW9kYWwnKTtcclxuICAgICAgICBsZXQgZG9jVyAgICAgICA9IGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGg7XHJcbiAgICAgICAgbGV0IGRvY0ggICAgICAgPSBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodDtcclxuICAgICAgICBsZXQgZGlhbG9nWCAgICA9ICh0YXJnZXRSZWN0LmxlZnQgICB8IDApIC0gODtcclxuICAgICAgICBsZXQgZGlhbG9nWSAgICA9ICB0YXJnZXRSZWN0LmJvdHRvbSB8IDA7XHJcbiAgICAgICAgbGV0IGRpYWxvZ1cgICAgPSAodGFyZ2V0UmVjdC53aWR0aCAgfCAwKSArIDE2O1xyXG5cclxuICAgICAgICAvLyBBZGp1c3QgaWYgaG9yaXpvbnRhbGx5IG9mZiBzY3JlZW5cclxuICAgICAgICBpZiAoIWZ1bGxXaWR0aCAmJiAhaXNNb2RhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEZvcmNlIGZ1bGwgd2lkdGggb24gbW9iaWxlXHJcbiAgICAgICAgICAgIGlmIChET00uaXNNb2JpbGUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tLnN0eWxlLndpZHRoID0gYDEwMCVgO1xyXG5cclxuICAgICAgICAgICAgICAgIGRpYWxvZ1ggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb20uc3R5bGUud2lkdGggICAgPSBgaW5pdGlhbGA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5zdHlsZS5taW5XaWR0aCA9IGAke2RpYWxvZ1d9cHhgO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChkaWFsb2dYICsgdGhpcy5kb20ub2Zmc2V0V2lkdGggPiBkb2NXKVxyXG4gICAgICAgICAgICAgICAgICAgIGRpYWxvZ1ggPSAodGFyZ2V0UmVjdC5yaWdodCB8IDApIC0gdGhpcy5kb20ub2Zmc2V0V2lkdGggKyA4O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGlja2VycyB0aGF0IGluc3RlYWQgdGFrZSB1cCB0aGUgd2hvbGUgZGlzcGxheS4gQ1NTIGlzbid0IHVzZWQgaGVyZSxcclxuICAgICAgICAvLyBiZWNhdXNlIHBlcmNlbnRhZ2UtYmFzZWQgbGVmdC90b3AgY2F1c2VzIHN1YnBpeGVsIGlzc3VlcyBvbiBDaHJvbWUuXHJcbiAgICAgICAgaWYgKGlzTW9kYWwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBkaWFsb2dYID0gRE9NLmlzTW9iaWxlID8gMCA6ICggKGRvY1cgKiAwLjEpIC8gMiApIHwgMDtcclxuICAgICAgICAgICAgZGlhbG9nWSA9IERPTS5pc01vYmlsZSA/IDAgOiAoIChkb2NIICogMC4xKSAvIDIgKSB8IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDbGFtcCB0byB0b3AgZWRnZSBvZiBkb2N1bWVudFxyXG4gICAgICAgIGVsc2UgaWYgKGRpYWxvZ1kgPCAwKVxyXG4gICAgICAgICAgICBkaWFsb2dZID0gMDtcclxuXHJcbiAgICAgICAgLy8gQWRqdXN0IGlmIHZlcnRpY2FsbHkgb2ZmIHNjcmVlblxyXG4gICAgICAgIGVsc2UgaWYgKGRpYWxvZ1kgKyB0aGlzLmRvbS5vZmZzZXRIZWlnaHQgPiBkb2NIKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZGlhbG9nWSA9ICh0YXJnZXRSZWN0LnRvcCB8IDApIC0gdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ICsgMTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5hZGQoJ2JlbG93Jyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdhYm92ZScpO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgc3RpbGwgb2ZmLXNjcmVlbiwgY2xhbXAgdG8gYm90dG9tXHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dZICsgdGhpcy5kb20ub2Zmc2V0SGVpZ2h0ID4gZG9jSClcclxuICAgICAgICAgICAgICAgIGRpYWxvZ1kgPSBkb2NIIC0gdGhpcy5kb20ub2Zmc2V0SGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgLy8gQ2xhbXAgdG8gdG9wIGVkZ2Ugb2YgZG9jdW1lbnQuIExpa2VseSBoYXBwZW5zIGlmIHRhcmdldCBlbGVtZW50IGlzIGxhcmdlLlxyXG4gICAgICAgICAgICBpZiAoZGlhbG9nWSA8IDApXHJcbiAgICAgICAgICAgICAgICBkaWFsb2dZID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5hZGQoJ2Fib3ZlJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5jbGFzc0xpc3QucmVtb3ZlKCdiZWxvdycpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5kb20uc3R5bGUubGVmdCA9IChmdWxsV2lkdGggPyAwIDogZGlhbG9nWCkgKyAncHgnO1xyXG4gICAgICAgIHRoaXMuZG9tLnN0eWxlLnRvcCAgPSBkaWFsb2dZICsgJ3B4JztcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmV0dXJucyB0cnVlIGlmIGFuIGVsZW1lbnQgaW4gdGhpcyBwaWNrZXIgY3VycmVudGx5IGhhcyBmb2N1cyAqL1xyXG4gICAgcHVibGljIGhhc0ZvY3VzKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmNvbnRhaW5zKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBjb2FjaCBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIENvYWNoUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBsZXR0ZXIgZHJvcC1kb3duIGlucHV0IGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRMZXR0ZXIgOiBIVE1MU2VsZWN0RWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IGNvYWNoIGVsZW1lbnQgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRDdHggOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCdjb2FjaCcpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyID0gRE9NLnJlcXVpcmUoJ3NlbGVjdCcsIHRoaXMuZG9tKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCAyNjsgaSsrKVxyXG4gICAgICAgICAgICBET00uYWRkT3B0aW9uKHRoaXMuaW5wdXRMZXR0ZXIsIEwuTEVUVEVSU1tpXSwgTC5MRVRURVJTW2ldKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIHRhcmdldCBjb250ZXh0J3MgY29hY2ggbGV0dGVyICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfQ09BQ0godGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dExldHRlci52YWx1ZSA9IFJBRy5zdGF0ZS5nZXRDb2FjaCh0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVXBkYXRlcyB0aGUgY29hY2ggZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9DT0FDSF9NSVNTSU5HX1NUQVRFKCkgKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldENvYWNoKHRoaXMuY3VycmVudEN0eCwgdGhpcy5pbnB1dExldHRlci52YWx1ZSk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvclxyXG4gICAgICAgICAgICAuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPWNvYWNoXVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuaW5wdXRMZXR0ZXIudmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgZXhjdXNlIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgRXhjdXNlUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignZXhjdXNlJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0VYQ1VTRSgpO1xyXG5cclxuICAgICAgICBSQUcuZGF0YWJhc2UuZXhjdXNlcy5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBleGN1c2UgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgLy8gUHJlLXNlbGVjdCB0aGUgY3VycmVudGx5IHVzZWQgZXhjdXNlXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdChSQUcuc3RhdGUuZXhjdXNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2UgdGhpcyBwaWNrZXIgKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uQ2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uQ2xpY2soZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbklucHV0KGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvblN1Ym1pdChldjogRXZlbnQpICAgICAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgY2hvb3NlciBzZWxlY3Rpb24gYnkgdXBkYXRpbmcgdGhlIGV4Y3VzZSBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZS5leGN1c2UgPSBlbnRyeS5pbm5lclRleHQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoJ2V4Y3VzZScsIFJBRy5zdGF0ZS5leGN1c2UpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBpbnRlZ2VyIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgSW50ZWdlclBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbnVtZXJpY2FsIGlucHV0IHNwaW5uZXIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW5wdXREaWdpdCA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3Mgb3B0aW9uYWwgc3VmZml4IGxhYmVsICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUxhYmVsICAgOiBIVE1MTGFiZWxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBIb2xkcyB0aGUgY29udGV4dCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBlbGVtZW50IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50Q3R4PyA6IHN0cmluZztcclxuICAgIC8qKiBIb2xkcyB0aGUgb3B0aW9uYWwgc2luZ3VsYXIgc3VmZml4IGZvciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJpdmF0ZSBzaW5ndWxhcj8gICA6IHN0cmluZztcclxuICAgIC8qKiBIb2xkcyB0aGUgb3B0aW9uYWwgcGx1cmFsIHN1ZmZpeCBmb3IgdGhlIGN1cnJlbnQgaW50ZWdlciBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgcGx1cmFsPyAgICAgOiBzdHJpbmc7XHJcbiAgICAvKiogV2hldGhlciB0aGUgY3VycmVudCBpbnRlZ2VyIGJlaW5nIGVkaXRlZCB3YW50cyB3b3JkIGRpZ2l0cyAqL1xyXG4gICAgcHJpdmF0ZSB3b3Jkcz8gICAgICA6IGJvb2xlYW47XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignaW50ZWdlcicpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21MYWJlbCAgID0gRE9NLnJlcXVpcmUoJ2xhYmVsJywgdGhpcy5kb20pO1xyXG5cclxuICAgICAgICAvLyBpT1MgbmVlZHMgZGlmZmVyZW50IHR5cGUgYW5kIHBhdHRlcm4gdG8gc2hvdyBhIG51bWVyaWNhbCBrZXlib2FyZFxyXG4gICAgICAgIGlmIChET00uaXNpT1MpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQudHlwZSAgICA9ICd0ZWwnO1xyXG4gICAgICAgICAgICB0aGlzLmlucHV0RGlnaXQucGF0dGVybiA9ICdbMC05XSsnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBmb3JtIHdpdGggdGhlIHRhcmdldCBjb250ZXh0J3MgaW50ZWdlciBkYXRhICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5zaW5ndWxhciAgID0gdGFyZ2V0LmRhdGFzZXRbJ3Npbmd1bGFyJ107XHJcbiAgICAgICAgdGhpcy5wbHVyYWwgICAgID0gdGFyZ2V0LmRhdGFzZXRbJ3BsdXJhbCddO1xyXG4gICAgICAgIHRoaXMud29yZHMgICAgICA9IFBhcnNlLmJvb2xlYW4odGFyZ2V0LmRhdGFzZXRbJ3dvcmRzJ10gfHwgJ2ZhbHNlJyk7XHJcblxyXG4gICAgICAgIGxldCB2YWx1ZSA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKHRoaXMuc2luZ3VsYXIgJiYgdmFsdWUgPT09IDEpXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5zaW5ndWxhcjtcclxuICAgICAgICBlbHNlIGlmICh0aGlzLnBsdXJhbCAmJiB2YWx1ZSAhPT0gMSlcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnBsdXJhbDtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gJyc7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX0lOVEVHRVIodGhpcy5jdXJyZW50Q3R4KTtcclxuICAgICAgICB0aGlzLmlucHV0RGlnaXQudmFsdWUgICAgPSB2YWx1ZS50b1N0cmluZygpO1xyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBVcGRhdGVzIHRoZSBpbnRlZ2VyIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRDdHgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBfSU5UX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICAvLyBDYW4ndCB1c2UgdmFsdWVBc051bWJlciBkdWUgdG8gaU9TIGlucHV0IHR5cGUgd29ya2Fyb3VuZHNcclxuICAgICAgICBsZXQgaW50ICAgID0gcGFyc2VJbnQodGhpcy5pbnB1dERpZ2l0LnZhbHVlKTtcclxuICAgICAgICBsZXQgaW50U3RyID0gKHRoaXMud29yZHMpXHJcbiAgICAgICAgICAgID8gTC5ESUdJVFNbaW50XSB8fCBpbnQudG9TdHJpbmcoKVxyXG4gICAgICAgICAgICA6IGludC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICAvLyBJZ25vcmUgaW52YWxpZCB2YWx1ZXNcclxuICAgICAgICBpZiAoIGlzTmFOKGludCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuZG9tTGFiZWwuaW5uZXJUZXh0ID0gJyc7XHJcblxyXG4gICAgICAgIGlmIChpbnQgPT09IDEgJiYgdGhpcy5zaW5ndWxhcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7dGhpcy5zaW5ndWxhcn1gO1xyXG4gICAgICAgICAgICB0aGlzLmRvbUxhYmVsLmlubmVyVGV4dCA9IHRoaXMuc2luZ3VsYXI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKGludCAhPT0gMSAmJiB0aGlzLnBsdXJhbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7dGhpcy5wbHVyYWx9YDtcclxuICAgICAgICAgICAgdGhpcy5kb21MYWJlbC5pbm5lclRleHQgPSB0aGlzLnBsdXJhbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRJbnRlZ2VyKHRoaXMuY3VycmVudEN0eCwgaW50KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9aW50ZWdlcl1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBpbnRTdHIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgbmFtZWQgdHJhaW4gcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBOYW1lZFBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbUNob29zZXIgOiBDaG9vc2VyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ25hbWVkJyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX05BTUVEKCk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5uYW1lZC5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBuYW1lXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdChSQUcuc3RhdGUubmFtZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgbmFtZWQgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3RhdGUubmFtZWQgPSBlbnRyeS5pbm5lclRleHQ7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoJ25hbWVkJywgUkFHLnN0YXRlLm5hbWVkKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGhyYXNlc2V0IHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgUGhyYXNlc2V0UGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBjaG9vc2VyIGNvbnRyb2wgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tQ2hvb3NlciA6IENob29zZXI7XHJcblxyXG4gICAgLyoqIEhvbGRzIHRoZSByZWZlcmVuY2UgdGFnIGZvciB0aGUgY3VycmVudCBwaHJhc2VzZXQgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFJlZj8gOiBzdHJpbmc7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigncGhyYXNlc2V0Jyk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3NlciAgICAgICAgICA9IG5ldyBDaG9vc2VyKHRoaXMuZG9tRm9ybSk7XHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLm9uU2VsZWN0ID0gZSA9PiB0aGlzLm9uU2VsZWN0KGUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQb3B1bGF0ZXMgdGhlIGNob29zZXIgd2l0aCB0aGUgY3VycmVudCBwaHJhc2VzZXQncyBsaXN0IG9mIHBocmFzZXMgKi9cclxuICAgIHB1YmxpYyBvcGVuKHRhcmdldDogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9wZW4odGFyZ2V0KTtcclxuXHJcbiAgICAgICAgbGV0IHJlZiA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdyZWYnKTtcclxuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoIERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdpZHgnKSApO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9QU0VUX1VOS05PV04ocmVmKSApO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRSZWYgICAgICAgICAgPSByZWY7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfUEhSQVNFU0VUKHJlZik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5jbGVhcigpO1xyXG5cclxuICAgICAgICAvLyBGb3IgZWFjaCBwaHJhc2UsIHdlIG5lZWQgdG8gcnVuIGl0IHRocm91Z2ggdGhlIHBocmFzZXIgdXNpbmcgdGhlIGN1cnJlbnQgc3RhdGVcclxuICAgICAgICAvLyB0byBnZW5lcmF0ZSBcInByZXZpZXdzXCIgb2YgaG93IHRoZSBwaHJhc2Ugd2lsbCBsb29rLlxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGhyYXNlc2V0LmNoaWxkcmVuLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHBocmFzZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XHJcblxyXG4gICAgICAgICAgICBET00uY2xvbmVJbnRvKHBocmFzZXNldC5jaGlsZHJlbltpXSBhcyBIVE1MRWxlbWVudCwgcGhyYXNlKTtcclxuICAgICAgICAgICAgUkFHLnBocmFzZXIucHJvY2VzcyhwaHJhc2UpO1xyXG5cclxuICAgICAgICAgICAgcGhyYXNlLmlubmVyVGV4dCAgID0gRE9NLmdldENsZWFuZWRWaXNpYmxlVGV4dChwaHJhc2UpO1xyXG4gICAgICAgICAgICBwaHJhc2UuZGF0YXNldC5pZHggPSBpLnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmRvbUNob29zZXIuYWRkUmF3KHBocmFzZSwgaSA9PT0gaWR4KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsb3NlIHRoaXMgcGlja2VyICovXHJcbiAgICBwdWJsaWMgY2xvc2UoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMuZG9tQ2hvb3Nlci5vbkNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIGNob29zZXJcclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgICAgICAgICA6IHZvaWQgeyAvKiogTk8tT1AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soZXY6IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vbkNsaWNrKGV2KTsgIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KGV2OiBLZXlib2FyZEV2ZW50KSA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25JbnB1dChldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBwaHJhc2VzZXQgZWxlbWVudCBhbmQgc3RhdGUgKi9cclxuICAgIHByaXZhdGUgb25TZWxlY3QoZW50cnk6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFJlZilcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9QU0VUX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBsZXQgaWR4ID0gcGFyc2VJbnQoZW50cnkuZGF0YXNldFsnaWR4J10hKTtcclxuXHJcbiAgICAgICAgUkFHLnN0YXRlLnNldFBocmFzZXNldElkeCh0aGlzLmN1cnJlbnRSZWYsIGlkeCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3IucmVmcmVzaFBocmFzZXNldCh0aGlzLmN1cnJlbnRSZWYpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBwbGF0Zm9ybSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFBsYXRmb3JtUGlja2VyIGV4dGVuZHMgUGlja2VyXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyBwaWNrZXIncyBudW1lcmljYWwgaW5wdXQgc3Bpbm5lciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dERpZ2l0ICA6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgbGV0dGVyIGRyb3AtZG93biBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0TGV0dGVyIDogSFRNTFNlbGVjdEVsZW1lbnQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigncGxhdGZvcm0nKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0ICAgICAgICAgID0gRE9NLnJlcXVpcmUoJ2lucHV0JywgdGhpcy5kb20pO1xyXG4gICAgICAgIHRoaXMuaW5wdXRMZXR0ZXIgICAgICAgICA9IERPTS5yZXF1aXJlKCdzZWxlY3QnLCB0aGlzLmRvbSk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfUExBVEZPUk0oKTtcclxuXHJcbiAgICAgICAgLy8gaU9TIG5lZWRzIGRpZmZlcmVudCB0eXBlIGFuZCBwYXR0ZXJuIHRvIHNob3cgYSBudW1lcmljYWwga2V5Ym9hcmRcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnR5cGUgICAgPSAndGVsJztcclxuICAgICAgICAgICAgdGhpcy5pbnB1dERpZ2l0LnBhdHRlcm4gPSAnWzAtOV0rJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgcGxhdGZvcm0gZGF0YSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICBsZXQgdmFsdWUgPSBSQUcuc3RhdGUucGxhdGZvcm07XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXREaWdpdC52YWx1ZSAgPSB2YWx1ZVswXTtcclxuICAgICAgICB0aGlzLmlucHV0TGV0dGVyLnZhbHVlID0gdmFsdWVbMV07XHJcbiAgICAgICAgdGhpcy5pbnB1dERpZ2l0LmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHBsYXRmb3JtIGVsZW1lbnQgYW5kIHN0YXRlIGN1cnJlbnRseSBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBvbkNoYW5nZShfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gSWdub3JlIGludmFsaWQgdmFsdWVzXHJcbiAgICAgICAgaWYgKCBpc05hTiggcGFyc2VJbnQodGhpcy5pbnB1dERpZ2l0LnZhbHVlKSApIClcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUucGxhdGZvcm0gPSBbdGhpcy5pbnB1dERpZ2l0LnZhbHVlLCB0aGlzLmlucHV0TGV0dGVyLnZhbHVlXTtcclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5zZXRFbGVtZW50c1RleHQoICdwbGF0Zm9ybScsIFJBRy5zdGF0ZS5wbGF0Zm9ybS5qb2luKCcnKSApO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKF86IE1vdXNlRXZlbnQpICAgIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxuICAgIHByb3RlY3RlZCBvbklucHV0KF86IEtleWJvYXJkRXZlbnQpIDogdm9pZCB7IC8qIG5vLW9wICovIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInBpY2tlci50c1wiLz5cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgc2VydmljZSBwaWNrZXIgZGlhbG9nICovXHJcbmNsYXNzIFNlcnZpY2VQaWNrZXIgZXh0ZW5kcyBQaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNob29zZXIgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21DaG9vc2VyIDogQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHNlcnZpY2UgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3NlcnZpY2UnKTtcclxuXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyICAgICAgICAgID0gbmV3IENob29zZXIodGhpcy5kb21Gb3JtKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25TZWxlY3QgPSBlID0+IHRoaXMub25TZWxlY3QoZSk7XHJcblxyXG4gICAgICAgIFJBRy5kYXRhYmFzZS5zZXJ2aWNlcy5mb3JFYWNoKCB2ID0+IHRoaXMuZG9tQ2hvb3Nlci5hZGQodikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUG9wdWxhdGVzIHRoZSBjaG9vc2VyIHdpdGggdGhlIGN1cnJlbnQgc3RhdGUncyBzZXJ2aWNlICovXHJcbiAgICBwdWJsaWMgb3Blbih0YXJnZXQ6IEhUTUxFbGVtZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vcGVuKHRhcmdldCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCAgICAgICAgICA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcbiAgICAgICAgdGhpcy5kb21IZWFkZXIuaW5uZXJUZXh0ID0gTC5IRUFERVJfU0VSVklDRSh0aGlzLmN1cnJlbnRDdHgpO1xyXG5cclxuICAgICAgICAvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgdXNlZCBzZXJ2aWNlXHJcbiAgICAgICAgdGhpcy5kb21DaG9vc2VyLnByZXNlbGVjdCggUkFHLnN0YXRlLmdldFNlcnZpY2UodGhpcy5jdXJyZW50Q3R4KSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZSB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIGNsb3NlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIuY2xvc2UoKTtcclxuICAgICAgICB0aGlzLmRvbUNob29zZXIub25DbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvcndhcmQgdGhlc2UgZXZlbnRzIHRvIHRoZSBjaG9vc2VyXHJcbiAgICBwcm90ZWN0ZWQgb25DaGFuZ2UoXzogRXZlbnQpICAgICAgICAgOiB2b2lkIHsgLyoqIE5PLU9QICovIH1cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSAgICA6IHZvaWQgeyB0aGlzLmRvbUNob29zZXIub25DbGljayhldik7ICB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgdGhpcy5kb21DaG9vc2VyLm9uSW5wdXQoZXYpOyAgfVxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgICAgICAgIDogdm9pZCB7IHRoaXMuZG9tQ2hvb3Nlci5vblN1Ym1pdChldik7IH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyBjaG9vc2VyIHNlbGVjdGlvbiBieSB1cGRhdGluZyB0aGUgc2VydmljZSBlbGVtZW50IGFuZCBzdGF0ZSAqL1xyXG4gICAgcHJpdmF0ZSBvblNlbGVjdChlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50Q3R4KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1NFUlZJQ0VfTUlTU0lOR19TVEFURSgpICk7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTZXJ2aWNlKHRoaXMuY3VycmVudEN0eCwgZW50cnkuaW5uZXJUZXh0KTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9c2VydmljZV1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSBlbnRyeS5pbm5lclRleHQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0aW9uIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgU3RhdGlvblBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3Mgc2hhcmVkIHN0YXRpb24gY2hvb3NlciBjb250cm9sICovXHJcbiAgICBwcm90ZWN0ZWQgc3RhdGljIGNob29zZXIgOiBTdGF0aW9uQ2hvb3NlcjtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHN0YXRpb24gZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByb3RlY3RlZCBjdXJyZW50Q3R4IDogc3RyaW5nID0gJyc7XHJcbiAgICAvKiogSG9sZHMgdGhlIG9uT3BlbiBkZWxlZ2F0ZSBmb3IgU3RhdGlvblBpY2tlciBvciBmb3IgU3RhdGlvbkxpc3RQaWNrZXIgKi9cclxuICAgIHByb3RlY3RlZCBvbk9wZW4gICAgIDogKHRhcmdldDogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHRhZzogc3RyaW5nID0gJ3N0YXRpb24nKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKHRhZyk7XHJcblxyXG4gICAgICAgIGlmICghU3RhdGlvblBpY2tlci5jaG9vc2VyKVxyXG4gICAgICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIgPSBuZXcgU3RhdGlvbkNob29zZXIodGhpcy5kb21Gb3JtKTtcclxuXHJcbiAgICAgICAgdGhpcy5vbk9wZW4gPSB0aGlzLm9uU3RhdGlvblBpY2tlck9wZW4uYmluZCh0aGlzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlyZXMgdGhlIG9uT3BlbiBkZWxlZ2F0ZSByZWdpc3RlcmVkIGZvciB0aGlzIHBpY2tlciAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG4gICAgICAgIHRoaXMub25PcGVuKHRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEF0dGFjaGVzIHRoZSBzdGF0aW9uIGNob29zZXIgYW5kIGZvY3VzZXMgaXQgb250byB0aGUgY3VycmVudCBlbGVtZW50J3Mgc3RhdGlvbiAqL1xyXG4gICAgcHJvdGVjdGVkIG9uU3RhdGlvblBpY2tlck9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNob29zZXIgICAgID0gU3RhdGlvblBpY2tlci5jaG9vc2VyO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEN0eCA9IERPTS5yZXF1aXJlRGF0YSh0YXJnZXQsICdjb250ZXh0Jyk7XHJcblxyXG4gICAgICAgIGNob29zZXIuYXR0YWNoKHRoaXMsIHRoaXMub25TZWxlY3RTdGF0aW9uKTtcclxuICAgICAgICBjaG9vc2VyLnByZXNlbGVjdENvZGUoIFJBRy5zdGF0ZS5nZXRTdGF0aW9uKHRoaXMuY3VycmVudEN0eCkgKTtcclxuICAgICAgICBjaG9vc2VyLnNlbGVjdE9uQ2xpY2sgPSB0cnVlO1xyXG5cclxuICAgICAgICB0aGlzLmRvbUhlYWRlci5pbm5lclRleHQgPSBMLkhFQURFUl9TVEFUSU9OKHRoaXMuY3VycmVudEN0eCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yd2FyZCB0aGVzZSBldmVudHMgdG8gdGhlIHN0YXRpb24gY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSAgICAgICAgIDogdm9pZCB7IC8qKiBOTy1PUCAqLyB9XHJcbiAgICBwcm90ZWN0ZWQgb25DbGljayhldjogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uQ2xpY2soZXYpOyB9XHJcbiAgICBwcm90ZWN0ZWQgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uSW5wdXQoZXYpOyB9XHJcbiAgICBwcm90ZWN0ZWQgb25TdWJtaXQoZXY6IEV2ZW50KSAgICAgICAgOiB2b2lkIHsgU3RhdGlvblBpY2tlci5jaG9vc2VyLm9uU3VibWl0KGV2KTsgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGNob29zZXIgc2VsZWN0aW9uIGJ5IHVwZGF0aW5nIHRoZSBzdGF0aW9uIGVsZW1lbnQgYW5kIHN0YXRlICovXHJcbiAgICBwcml2YXRlIG9uU2VsZWN0U3RhdGlvbihlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBxdWVyeSA9IGBbZGF0YS10eXBlPXN0YXRpb25dW2RhdGEtY29udGV4dD0ke3RoaXMuY3VycmVudEN0eH1dYDtcclxuICAgICAgICBsZXQgY29kZSAgPSBlbnRyeS5kYXRhc2V0Wydjb2RlJ10hO1xyXG4gICAgICAgIGxldCBuYW1lICA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUpO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0U3RhdGlvbih0aGlzLmN1cnJlbnRDdHgsIGNvZGUpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShxdWVyeSlcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gbmFtZSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJwaWNrZXIudHNcIi8+XHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJzdGF0aW9uUGlja2VyLnRzXCIvPlxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiLi4vLi4vdmVuZG9yL2RyYWdnYWJsZS5kLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSBzdGF0aW9uIGxpc3QgcGlja2VyIGRpYWxvZyAqL1xyXG5jbGFzcyBTdGF0aW9uTGlzdFBpY2tlciBleHRlbmRzIFN0YXRpb25QaWNrZXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGlzIHBpY2tlcidzIGNvbnRhaW5lciBmb3IgdGhlIGxpc3QgY29udHJvbCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21MaXN0ICAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1vYmlsZS1vbmx5IGFkZCBzdGF0aW9uIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5BZGQgICAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1vYmlsZS1vbmx5IGNsb3NlIHBpY2tlciBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuQ2xvc2UgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBkcm9wIHpvbmUgZm9yIGRlbGV0aW5nIHN0YXRpb24gZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZG9tRGVsICAgICAgIDogSFRNTEVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBhY3R1YWwgc29ydGFibGUgbGlzdCBvZiBzdGF0aW9ucyAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBpbnB1dExpc3QgICAgOiBIVE1MRExpc3RFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byBwbGFjZWhvbGRlciBzaG93biBpZiB0aGUgbGlzdCBpcyBlbXB0eSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb21FbXB0eUxpc3QgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKFwic3RhdGlvbmxpc3RcIik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tTGlzdCAgICAgID0gRE9NLnJlcXVpcmUoJy5zdGF0aW9uTGlzdCcsIHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmJ0bkFkZCAgICAgICA9IERPTS5yZXF1aXJlKCcuYWRkU3RhdGlvbicsICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuYnRuQ2xvc2UgICAgID0gRE9NLnJlcXVpcmUoJy5jbG9zZVBpY2tlcicsIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5kb21EZWwgICAgICAgPSBET00ucmVxdWlyZSgnLmRlbFN0YXRpb24nLCAgdGhpcy5kb21MaXN0KTtcclxuICAgICAgICB0aGlzLmlucHV0TGlzdCAgICA9IERPTS5yZXF1aXJlKCdkbCcsICAgICAgICAgICB0aGlzLmRvbUxpc3QpO1xyXG4gICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0ID0gRE9NLnJlcXVpcmUoJ3AnLCAgICAgICAgICAgIHRoaXMuZG9tTGlzdCk7XHJcbiAgICAgICAgdGhpcy5vbk9wZW4gICAgICAgPSB0aGlzLm9uU3RhdGlvbkxpc3RQaWNrZXJPcGVuLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIG5ldyBEcmFnZ2FibGUuU29ydGFibGUoW3RoaXMuaW5wdXRMaXN0LCB0aGlzLmRvbURlbF0sIHsgZHJhZ2dhYmxlOiAnZGQnIH0pXHJcbiAgICAgICAgICAgIC8vIEhhdmUgdG8gdXNlIHRpbWVvdXQsIHRvIGxldCBEcmFnZ2FibGUgZmluaXNoIHNvcnRpbmcgdGhlIGxpc3RcclxuICAgICAgICAgICAgLm9uKCAnZHJhZzpzdG9wJywgZXYgPT4gc2V0VGltZW91dCgoKSA9PiB0aGlzLm9uRHJhZ1N0b3AoZXYpLCAxKSApXHJcbiAgICAgICAgICAgIC5vbiggJ21pcnJvcjpjcmVhdGUnLCB0aGlzLm9uRHJhZ01pcnJvckNyZWF0ZS5iaW5kKHRoaXMpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQb3B1bGF0ZXMgdGhlIHN0YXRpb24gbGlzdCBidWlsZGVyLCB3aXRoIHRoZSBzZWxlY3RlZCBsaXN0LiBCZWNhdXNlIHRoaXMgcGlja2VyXHJcbiAgICAgKiBleHRlbmRzIGZyb20gU3RhdGlvbkxpc3QsIHRoaXMgaGFuZGxlciBvdmVycmlkZXMgdGhlICdvbk9wZW4nIGRlbGVnYXRlIHByb3BlcnR5XHJcbiAgICAgKiBvZiBTdGF0aW9uTGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IFN0YXRpb24gbGlzdCBlZGl0b3IgZWxlbWVudCB0byBvcGVuIGZvclxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgb25TdGF0aW9uTGlzdFBpY2tlck9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU2luY2Ugd2Ugc2hhcmUgdGhlIHN0YXRpb24gcGlja2VyIHdpdGggU3RhdGlvbkxpc3QsIGdyYWIgaXRcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuYXR0YWNoKHRoaXMsIHRoaXMub25BZGRTdGF0aW9uKTtcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuc2VsZWN0T25DbGljayA9IGZhbHNlO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBlbnRyaWVzICAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdCh0aGlzLmN1cnJlbnRDdHgpLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1NUQVRJT05MSVNUKHRoaXMuY3VycmVudEN0eCk7XHJcblxyXG4gICAgICAgIC8vIFJlbW92ZSBhbGwgb2xkIGxpc3QgZWxlbWVudHNcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgICAgICAgLy8gRmluYWxseSwgcG9wdWxhdGUgbGlzdCBmcm9tIHRoZSBjbGlja2VkIHN0YXRpb24gbGlzdCBlbGVtZW50XHJcbiAgICAgICAgZW50cmllcy5mb3JFYWNoKCB2ID0+IHRoaXMuYWRkKHYpICk7XHJcbiAgICAgICAgdGhpcy5pbnB1dExpc3QuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3J3YXJkIHRoZXNlIGV2ZW50cyB0byB0aGUgY2hvb3NlclxyXG4gICAgcHJvdGVjdGVkIG9uU3VibWl0KGV2OiBFdmVudCkgOiB2b2lkIHsgc3VwZXIub25TdWJtaXQoZXYpOyB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgcGlja2VycycgY2xpY2sgZXZlbnRzLCBmb3IgY2hvb3NpbmcgaXRlbXMgKi9cclxuICAgIHByb3RlY3RlZCBvbkNsaWNrKGV2OiBNb3VzZUV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBzdXBlci5vbkNsaWNrKGV2KTtcclxuXHJcbiAgICAgICAgaWYgKGV2LnRhcmdldCA9PT0gdGhpcy5idG5DbG9zZSlcclxuICAgICAgICAgICAgUkFHLnZpZXdzLmVkaXRvci5jbG9zZURpYWxvZygpO1xyXG4gICAgICAgIC8vIEZvciBtb2JpbGUgdXNlcnMsIHN3aXRjaCB0byBzdGF0aW9uIGNob29zZXIgc2NyZWVuIGlmIFwiQWRkLi4uXCIgd2FzIGNsaWNrZWRcclxuICAgICAgICBpZiAoZXYudGFyZ2V0ID09PSB0aGlzLmJ0bkFkZClcclxuICAgICAgICAgICAgdGhpcy5kb20uY2xhc3NMaXN0LmFkZCgnYWRkaW5nU3RhdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGtleWJvYXJkIG5hdmlnYXRpb24gZm9yIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciAqL1xyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoZXY6IEtleWJvYXJkRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyLm9uSW5wdXQoZXYpO1xyXG5cclxuICAgICAgICBsZXQga2V5ICAgICA9IGV2LmtleTtcclxuICAgICAgICBsZXQgZm9jdXNlZCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIE9ubHkgaGFuZGxlIHRoZSBzdGF0aW9uIGxpc3QgYnVpbGRlciBjb250cm9sXHJcbiAgICAgICAgaWYgKCAhZm9jdXNlZCB8fCAhdGhpcy5pbnB1dExpc3QuY29udGFpbnMoZm9jdXNlZCkgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBrZXlib2FyZCBuYXZpZ2F0aW9uXHJcbiAgICAgICAgaWYgKGtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5ID09PSAnQXJyb3dSaWdodCcpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZGlyID0gKGtleSA9PT0gJ0Fycm93TGVmdCcpID8gLTEgOiAxO1xyXG4gICAgICAgICAgICBsZXQgbmF2ID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIE5hdmlnYXRlIHJlbGF0aXZlIHRvIGZvY3VzZWQgZWxlbWVudFxyXG4gICAgICAgICAgICBpZiAoZm9jdXNlZC5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmlucHV0TGlzdClcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhmb2N1c2VkLCBkaXIpO1xyXG5cclxuICAgICAgICAgICAgLy8gTmF2aWdhdGUgcmVsZXZhbnQgdG8gYmVnaW5uaW5nIG9yIGVuZCBvZiBjb250YWluZXJcclxuICAgICAgICAgICAgZWxzZSBpZiAoZGlyID09PSAtMSlcclxuICAgICAgICAgICAgICAgIG5hdiA9IERPTS5nZXROZXh0Rm9jdXNhYmxlU2libGluZyhcclxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBuYXYgPSBET00uZ2V0TmV4dEZvY3VzYWJsZVNpYmxpbmcoXHJcbiAgICAgICAgICAgICAgICAgICAgZm9jdXNlZC5sYXN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCwgZGlyXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKG5hdikgbmF2LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgZW50cnkgZGVsZXRpb25cclxuICAgICAgICBpZiAoa2V5ID09PSAnRGVsZXRlJyB8fCBrZXkgPT09ICdCYWNrc3BhY2UnKVxyXG4gICAgICAgIGlmIChmb2N1c2VkLnBhcmVudEVsZW1lbnQgPT09IHRoaXMuaW5wdXRMaXN0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gRm9jdXMgb24gbmV4dCBlbGVtZW50IG9yIHBhcmVudCBvbiBkZWxldGVcclxuICAgICAgICAgICAgbGV0IG5leHQgPSBmb2N1c2VkLnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBmb2N1c2VkLm5leHRFbGVtZW50U2libGluZyAgICAgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCB0aGlzLmlucHV0TGlzdDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGZvY3VzZWQpO1xyXG4gICAgICAgICAgICBuZXh0LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVyIGZvciB3aGVuIGEgc3RhdGlvbiBpcyBjaG9zZW4gKi9cclxuICAgIHByaXZhdGUgb25BZGRTdGF0aW9uKGVudHJ5OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5ld0VudHJ5ID0gdGhpcy5hZGQoZW50cnkuZGF0YXNldFsnY29kZSddISk7XHJcblxyXG4gICAgICAgIC8vIFN3aXRjaCBiYWNrIHRvIGJ1aWxkZXIgc2NyZWVuLCBpZiBvbiBtb2JpbGVcclxuICAgICAgICB0aGlzLmRvbS5jbGFzc0xpc3QucmVtb3ZlKCdhZGRpbmdTdGF0aW9uJyk7XHJcbiAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuXHJcbiAgICAgICAgLy8gRm9jdXMgb25seSBpZiBvbiBtb2JpbGUsIHNpbmNlIHRoZSBzdGF0aW9uIGxpc3QgaXMgb24gYSBkZWRpY2F0ZWQgc2NyZWVuXHJcbiAgICAgICAgaWYgKERPTS5pc01vYmlsZSlcclxuICAgICAgICAgICAgbmV3RW50cnkuZG9tLmZvY3VzKCk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBuZXdFbnRyeS5kb20uc2Nyb2xsSW50b1ZpZXcoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRml4ZXMgbWlycm9ycyBub3QgaGF2aW5nIGNvcnJlY3Qgd2lkdGggb2YgdGhlIHNvdXJjZSBlbGVtZW50LCBvbiBjcmVhdGUgKi9cclxuICAgIHByaXZhdGUgb25EcmFnTWlycm9yQ3JlYXRlKGV2OiBEcmFnZ2FibGUuRHJhZ0V2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIWV2LmRhdGEuc291cmNlIHx8ICFldi5kYXRhLm9yaWdpbmFsU291cmNlKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5QX1NMX0RSQUdfTUlTU0lORygpICk7XHJcblxyXG4gICAgICAgIGV2LmRhdGEuc291cmNlLnN0eWxlLndpZHRoID0gZXYuZGF0YS5vcmlnaW5hbFNvdXJjZS5jbGllbnRXaWR0aCArICdweCc7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgZHJhZ2dhYmxlIHN0YXRpb24gbmFtZSBiZWluZyBkcm9wcGVkICovXHJcbiAgICBwcml2YXRlIG9uRHJhZ1N0b3AoZXY6IERyYWdnYWJsZS5EcmFnRXZlbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICghZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoZXYuZGF0YS5vcmlnaW5hbFNvdXJjZS5wYXJlbnRFbGVtZW50ID09PSB0aGlzLmRvbURlbClcclxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZXYuZGF0YS5vcmlnaW5hbFNvdXJjZSk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhbmQgYWRkcyBhIG5ldyBlbnRyeSBmb3IgdGhlIGJ1aWxkZXIgbGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29kZSBUaHJlZS1sZXR0ZXIgc3RhdGlvbiBjb2RlIHRvIGNyZWF0ZSBhbiBpdGVtIGZvclxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFkZChjb2RlOiBzdHJpbmcpIDogU3RhdGlvbkxpc3RJdGVtXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5ld0VudHJ5ID0gbmV3IFN0YXRpb25MaXN0SXRlbShjb2RlKTtcclxuXHJcbiAgICAgICAgLy8gQWRkIHRoZSBuZXcgZW50cnkgdG8gdGhlIHNvcnRhYmxlIGxpc3RcclxuICAgICAgICB0aGlzLmlucHV0TGlzdC5hcHBlbmRDaGlsZChuZXdFbnRyeS5kb20pO1xyXG4gICAgICAgIHRoaXMuZG9tRW1wdHlMaXN0LmhpZGRlbiA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIERpc2FibGUgdGhlIGFkZGVkIHN0YXRpb24gaW4gdGhlIGNob29zZXJcclxuICAgICAgICBTdGF0aW9uUGlja2VyLmNob29zZXIuZGlzYWJsZShjb2RlKTtcclxuXHJcbiAgICAgICAgLy8gRGVsZXRlIGl0ZW0gb24gZG91YmxlIGNsaWNrXHJcbiAgICAgICAgbmV3RW50cnkuZG9tLm9uZGJsY2xpY2sgPSBfID0+IHRoaXMucmVtb3ZlKG5ld0VudHJ5LmRvbSk7XHJcblxyXG4gICAgICAgIHJldHVybiBuZXdFbnRyeTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlbW92ZXMgdGhlIGdpdmVuIHN0YXRpb24gZW50cnkgZWxlbWVudCBmcm9tIHRoZSBidWlsZGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbnRyeSBFbGVtZW50IG9mIHRoZSBzdGF0aW9uIGVudHJ5IHRvIHJlbW92ZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlbW92ZShlbnRyeTogSFRNTEVsZW1lbnQpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICggIXRoaXMuZG9tTGlzdC5jb250YWlucyhlbnRyeSkgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcignQXR0ZW1wdGVkIHRvIHJlbW92ZSBlbnRyeSBub3Qgb24gc3RhdGlvbiBsaXN0IGJ1aWxkZXInKTtcclxuXHJcbiAgICAgICAgLy8gRW5hYmxlZCB0aGUgcmVtb3ZlZCBzdGF0aW9uIGluIHRoZSBjaG9vc2VyXHJcbiAgICAgICAgU3RhdGlvblBpY2tlci5jaG9vc2VyLmVuYWJsZShlbnRyeS5kYXRhc2V0Wydjb2RlJ10hKTtcclxuXHJcbiAgICAgICAgZW50cnkucmVtb3ZlKCk7XHJcbiAgICAgICAgdGhpcy51cGRhdGUoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuaW5wdXRMaXN0LmNoaWxkcmVuLmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgdGhpcy5kb21FbXB0eUxpc3QuaGlkZGVuID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHN0YXRpb24gbGlzdCBlbGVtZW50IGFuZCBzdGF0ZSBjdXJyZW50bHkgYmVpbmcgZWRpdGVkICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBjaGlsZHJlbiA9IHRoaXMuaW5wdXRMaXN0LmNoaWxkcmVuO1xyXG5cclxuICAgICAgICAvLyBEb24ndCB1cGRhdGUgaWYgbGlzdCBpcyBlbXB0eVxyXG4gICAgICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPT09IDApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IGxpc3QgPSBbXTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBlbnRyeSA9IGNoaWxkcmVuW2ldIGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgbGlzdC5wdXNoKGVudHJ5LmRhdGFzZXRbJ2NvZGUnXSEpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHRleHRMaXN0ID0gU3RyaW5ncy5mcm9tU3RhdGlvbkxpc3QobGlzdC5zbGljZSgpLCB0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIGxldCBxdWVyeSAgICA9IGBbZGF0YS10eXBlPXN0YXRpb25saXN0XVtkYXRhLWNvbnRleHQ9JHt0aGlzLmN1cnJlbnRDdHh9XWA7XHJcblxyXG4gICAgICAgIFJBRy5zdGF0ZS5zZXRTdGF0aW9uTGlzdCh0aGlzLmN1cnJlbnRDdHgsIGxpc3QpO1xyXG4gICAgICAgIFJBRy52aWV3cy5lZGl0b3JcclxuICAgICAgICAgICAgLmdldEVsZW1lbnRzQnlRdWVyeShxdWVyeSlcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdGV4dExpc3QpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwicGlja2VyLnRzXCIvPlxyXG5cclxuLyoqIENvbnRyb2xsZXIgZm9yIHRoZSB0aW1lIHBpY2tlciBkaWFsb2cgKi9cclxuY2xhc3MgVGltZVBpY2tlciBleHRlbmRzIFBpY2tlclxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoaXMgcGlja2VyJ3MgdGltZSBpbnB1dCBjb250cm9sICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0VGltZTogSFRNTElucHV0RWxlbWVudDtcclxuXHJcbiAgICAvKiogSG9sZHMgdGhlIGNvbnRleHQgZm9yIHRoZSBjdXJyZW50IHRpbWUgZWxlbWVudCBiZWluZyBlZGl0ZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudEN0eCA6IHN0cmluZyA9ICcnO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoJ3RpbWUnKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUgPSBET00ucmVxdWlyZSgnaW5wdXQnLCB0aGlzLmRvbSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBvcHVsYXRlcyB0aGUgZm9ybSB3aXRoIHRoZSBjdXJyZW50IHN0YXRlJ3MgdGltZSAqL1xyXG4gICAgcHVibGljIG9wZW4odGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIub3Blbih0YXJnZXQpO1xyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRDdHggICAgICAgICAgPSBET00ucmVxdWlyZURhdGEodGFyZ2V0LCAnY29udGV4dCcpO1xyXG4gICAgICAgIHRoaXMuZG9tSGVhZGVyLmlubmVyVGV4dCA9IEwuSEVBREVSX1RJTUUodGhpcy5jdXJyZW50Q3R4KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dFRpbWUudmFsdWUgPSBSQUcuc3RhdGUuZ2V0VGltZSh0aGlzLmN1cnJlbnRDdHgpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRUaW1lLmZvY3VzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFVwZGF0ZXMgdGhlIHRpbWUgZWxlbWVudCBhbmQgc3RhdGUgY3VycmVudGx5IGJlaW5nIGVkaXRlZCAqL1xyXG4gICAgcHJvdGVjdGVkIG9uQ2hhbmdlKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3VycmVudEN0eClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuUF9USU1FX01JU1NJTkdfU1RBVEUoKSApO1xyXG5cclxuICAgICAgICBSQUcuc3RhdGUuc2V0VGltZSh0aGlzLmN1cnJlbnRDdHgsIHRoaXMuaW5wdXRUaW1lLnZhbHVlKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yXHJcbiAgICAgICAgICAgIC5nZXRFbGVtZW50c0J5UXVlcnkoYFtkYXRhLXR5cGU9dGltZV1bZGF0YS1jb250ZXh0PSR7dGhpcy5jdXJyZW50Q3R4fV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLmlucHV0VGltZS52YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIG9uQ2xpY2soXzogTW91c2VFdmVudCkgICAgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG4gICAgcHJvdGVjdGVkIG9uSW5wdXQoXzogS2V5Ym9hcmRFdmVudCkgOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQmFzZSBjbGFzcyBmb3IgY29uZmlndXJhdGlvbiBvYmplY3RzLCB0aGF0IGNhbiBzYXZlLCBsb2FkLCBhbmQgcmVzZXQgdGhlbXNlbHZlcyAqL1xyXG5hYnN0cmFjdCBjbGFzcyBDb25maWdCYXNlPFQgZXh0ZW5kcyBDb25maWdCYXNlPFQ+PlxyXG57XHJcbiAgICAvKiogbG9jYWxTdG9yYWdlIGtleSB3aGVyZSBjb25maWcgaXMgZXhwZWN0ZWQgdG8gYmUgc3RvcmVkICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRVRUSU5HU19LRVkgOiBzdHJpbmcgPSAnc2V0dGluZ3MnO1xyXG5cclxuICAgIC8qKiBQcm90b3R5cGUgb2JqZWN0IGZvciBjcmVhdGluZyBuZXcgY29waWVzIG9mIHNlbGYgKi9cclxuICAgIHByaXZhdGUgdHlwZSA6IChuZXcgKCkgPT4gVCk7XHJcblxyXG4gICAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKCB0eXBlOiAobmV3ICgpID0+IFQpIClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnR5cGUgPSB0eXBlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTYWZlbHkgbG9hZHMgcnVudGltZSBjb25maWd1cmF0aW9uIGZyb20gbG9jYWxTdG9yYWdlLCBpZiBhbnkgKi9cclxuICAgIHB1YmxpYyBsb2FkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHNldHRpbmdzID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKENvbmZpZ0Jhc2UuU0VUVElOR1NfS0VZKTtcclxuXHJcbiAgICAgICAgaWYgKCFzZXR0aW5ncylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICB0cnlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjb25maWcgPSBKU09OLnBhcnNlKHNldHRpbmdzKTtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCBjb25maWcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZXJyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX0xPQURfRkFJTChlcnIubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogU2FmZWx5IHNhdmVzIHRoaXMgY29uZmlndXJhdGlvbiB0byBsb2NhbFN0b3JhZ2UgKi9cclxuICAgIHB1YmxpYyBzYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oIENvbmZpZ0Jhc2UuU0VUVElOR1NfS0VZLCBKU09OLnN0cmluZ2lmeSh0aGlzKSApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZXJyKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWxlcnQoIEwuQ09ORklHX1NBVkVfRkFJTChlcnIubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKiogU2FmZWx5IGRlbGV0ZXMgdGhpcyBjb25maWd1cmF0aW9uIGZyb20gbG9jYWxTdG9yYWdlIGFuZCByZXNldHMgc3RhdGUgKi9cclxuICAgIHB1YmxpYyByZXNldCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRyeVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbiggdGhpcywgbmV3IHRoaXMudHlwZSgpICk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShDb25maWdCYXNlLlNFVFRJTkdTX0tFWSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhbGVydCggTC5DT05GSUdfUkVTRVRfRkFJTChlcnIubWVzc2FnZSkgKTtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vPHJlZmVyZW5jZSBwYXRoPVwiY29uZmlnQmFzZS50c1wiLz5cclxuXHJcbi8qKiBIb2xkcyBydW50aW1lIGNvbmZpZ3VyYXRpb24gZm9yIFJBRyAqL1xyXG5jbGFzcyBDb25maWcgZXh0ZW5kcyBDb25maWdCYXNlPENvbmZpZz5cclxue1xyXG4gICAgLyoqIElmIHVzZXIgaGFzIHJlYWQgdGhlIGRpc2NsYWltZXIgKi9cclxuICAgIHB1YmxpYyAgcmVhZERpc2NsYWltZXIgIDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgLyoqIElmIHVzZXIgaGFzIGNsaWNrZWQgc2h1ZmZsZSBhdCBsZWFzdCBvbmNlICovXHJcbiAgICBwdWJsaWMgIGNsaWNrZWRHZW5lcmF0ZSA6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIC8qKiBWb2x1bWUgZm9yIHNwZWVjaCB0byBiZSBzZXQgYXQgKi9cclxuICAgIHB1YmxpYyAgc3BlZWNoVm9sICAgICAgIDogbnVtYmVyICA9IDEuMDtcclxuICAgIC8qKiBQaXRjaCBmb3Igc3BlZWNoIHRvIGJlIHNldCBhdCAqL1xyXG4gICAgcHVibGljICBzcGVlY2hQaXRjaCAgICAgOiBudW1iZXIgID0gMS4wO1xyXG4gICAgLyoqIFJhdGUgZm9yIHNwZWVjaCB0byBiZSBzZXQgYXQgKi9cclxuICAgIHB1YmxpYyAgc3BlZWNoUmF0ZSAgICAgIDogbnVtYmVyICA9IDEuMDtcclxuICAgIC8qKiBXaGV0aGVyIHRvIHVzZSB0aGUgVk9YIGVuZ2luZSAqL1xyXG4gICAgcHVibGljICB2b3hFbmFibGVkICAgICAgOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIC8qKiBSZWxhdGl2ZSBvciBhYnNvbHV0ZSBVUkwgb2YgdGhlIFZPWCB2b2ljZSB0byB1c2UgKi9cclxuICAgIHB1YmxpYyAgdm94UGF0aCAgICAgICAgIDogc3RyaW5nICA9ICdodHRwczovL3JveWN1cnRpcy5naXRodWIuaW8vUkFHLVZPWC1Sb3knO1xyXG4gICAgLyoqIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCBvZiB0aGUgY3VzdG9tIFZPWCB2b2ljZSB0byB1c2UgKi9cclxuICAgIHB1YmxpYyAgdm94Q3VzdG9tUGF0aCAgIDogc3RyaW5nICA9ICcnO1xyXG4gICAgLyoqIFZPWCBrZXkgb2YgdGhlIGNoaW1lIHRvIHVzZSBwcmlvciB0byBzcGVha2luZyAqL1xyXG4gICAgcHVibGljICB2b3hDaGltZSAgICAgICAgOiBzdHJpbmcgID0gJyc7XHJcbiAgICAvKiogQ2hvaWNlIG9mIHNwZWVjaCB2b2ljZSB0byB1c2UsIGFzIGdldFZvaWNlcyBpbmRleCBvciAtMSBpZiB1bnNldCAqL1xyXG4gICAgcHJpdmF0ZSBfc3BlZWNoVm9pY2UgICAgOiBudW1iZXIgID0gLTE7XHJcbiAgICAvKiogSW1wdWxzZSByZXNwb25zZSB0byB1c2UgZm9yIFZPWCdzIHJldmVyYiAqL1xyXG4gICAgcHJpdmF0ZSBfdm94UmV2ZXJiICAgICAgOiBzdHJpbmcgID0gJ2lyLnN0YWxiYW5zLndhdic7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDaG9pY2Ugb2Ygc3BlZWNoIHZvaWNlIHRvIHVzZSwgYXMgZ2V0Vm9pY2VzIGluZGV4LiBCZWNhdXNlIG9mIHRoZSBhc3luYyBuYXR1cmUgb2ZcclxuICAgICAqIGdldFZvaWNlcywgdGhlIGRlZmF1bHQgdmFsdWUgd2lsbCBiZSBmZXRjaGVkIGZyb20gaXQgZWFjaCB0aW1lLlxyXG4gICAgICovXHJcbiAgICBnZXQgc3BlZWNoVm9pY2UoKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIC8vIFRPRE86IHRoaXMgaXMgcHJvYmFibHkgYmV0dGVyIG9mZiB1c2luZyB2b2ljZSBuYW1lc1xyXG4gICAgICAgIC8vIElmIHRoZXJlJ3MgYSB1c2VyLWRlZmluZWQgdmFsdWUsIHVzZSB0aGF0XHJcbiAgICAgICAgaWYgICh0aGlzLl9zcGVlY2hWb2ljZSAhPT0gLTEpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zcGVlY2hWb2ljZTtcclxuXHJcbiAgICAgICAgLy8gU2VsZWN0IEVuZ2xpc2ggdm9pY2VzIGJ5IGRlZmF1bHRcclxuICAgICAgICBmb3IgKGxldCBpID0gMCwgdiA9IFJBRy5zcGVlY2guYnJvd3NlclZvaWNlczsgaSA8IHYubGVuZ3RoIDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGxhbmcgPSB2W2ldLmxhbmc7XHJcblxyXG4gICAgICAgICAgICBpZiAobGFuZyA9PT0gJ2VuLUdCJyB8fCBsYW5nID09PSAnZW4tVVMnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBFbHNlLCBmaXJzdCB2b2ljZSBvbiB0aGUgbGlzdFxyXG4gICAgICAgIHJldHVybiAwO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjaG9pY2Ugb2Ygc3BlZWNoIHRvIHVzZSwgYXMgZ2V0Vm9pY2VzIGluZGV4ICovXHJcbiAgICBzZXQgc3BlZWNoVm9pY2UodmFsdWU6IG51bWJlcilcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zcGVlY2hWb2ljZSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBpbXB1bHNlIHJlc3BvbnNlIGZpbGUgdG8gdXNlIGZvciBWT1ggZW5naW5lJ3MgcmV2ZXJiICovXHJcbiAgICBnZXQgdm94UmV2ZXJiKCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICAvLyBSZXNldCBjaG9pY2Ugb2YgcmV2ZXJiIGlmIGl0J3MgaW52YWxpZFxyXG4gICAgICAgIGxldCBjaG9pY2VzID0gT2JqZWN0LmtleXMoVm94RW5naW5lLlJFVkVSQlMpO1xyXG5cclxuICAgICAgICBpZiAoICFjaG9pY2VzLmluY2x1ZGVzKHRoaXMuX3ZveFJldmVyYikgKVxyXG4gICAgICAgICAgICB0aGlzLl92b3hSZXZlcmIgPSBjaG9pY2VzWzBdO1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcy5fdm94UmV2ZXJiO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBpbXB1bHNlIHJlc3BvbnNlIGZpbGUgdG8gdXNlIGZvciBWT1ggZW5naW5lJ3MgcmV2ZXJiICovXHJcbiAgICBzZXQgdm94UmV2ZXJiKHZhbHVlOiBzdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fdm94UmV2ZXJiID0gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGF1dG9Mb2FkOiBib29sZWFuID0gZmFsc2UpXHJcbiAgICB7XHJcbiAgICAgICAgc3VwZXIoQ29uZmlnKTtcclxuXHJcbiAgICAgICAgaWYgKGF1dG9Mb2FkKVxyXG4gICAgICAgICAgICB0aGlzLmxvYWQoKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIExhbmd1YWdlIGVudHJpZXMgYXJlIHRlbXBsYXRlIGRlbGVnYXRlcyAqL1xyXG50eXBlIExhbmd1YWdlRW50cnkgPSAoLi4ucGFydHM6IHN0cmluZ1tdKSA9PiBzdHJpbmcgO1xyXG5cclxuYWJzdHJhY3QgY2xhc3MgQmFzZUxhbmd1YWdlXHJcbntcclxuICAgIFtpbmRleDogc3RyaW5nXSA6IExhbmd1YWdlRW50cnkgfCBzdHJpbmcgfCBzdHJpbmdbXTtcclxuXHJcbiAgICAvLyBSQUdcclxuXHJcbiAgICAvKiogV2VsY29tZSBtZXNzYWdlLCBzaG93biBvbiBtYXJxdWVlIG9uIGZpcnN0IGxvYWQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFdFTENPTUUgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcXVpcmVkIERPTSBlbGVtZW50IGlzIG1pc3NpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERPTV9NSVNTSU5HICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcXVpcmVkIGVsZW1lbnQgYXR0cmlidXRlIGlzIG1pc3NpbmcgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEFUVFJfTUlTU0lORyAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFJlcXVpcmVkIGRhdGFzZXQgZW50cnkgaXMgbWlzc2luZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREFUQV9NSVNTSU5HICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQmFkIGRpcmVjdGlvbiBhcmd1bWVudCBnaXZlbiB0byBkaXJlY3Rpb25hbCBmdW5jdGlvbiAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQkFEX0RJUkVDVElPTiA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQmFkIGJvb2xlYW4gc3RyaW5nICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBCQURfQk9PTEVBTiAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBTdGF0ZVxyXG5cclxuICAgIC8qKiBTdGF0ZSBzdWNjZXNzZnVsbHkgbG9hZGVkIGZyb20gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfRlJPTV9TVE9SQUdFICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTdGF0ZSBzdWNjZXNzZnVsbHkgc2F2ZWQgdG8gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfVE9fU1RPUkFHRSAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBJbnN0cnVjdGlvbnMgZm9yIGNvcHkvcGFzdGluZyBzYXZlZCBzdGF0ZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfQ09QWV9QQVNURSAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBIZWFkZXIgZm9yIGR1bXBlZCByYXcgc3RhdGUgSlNPTiAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfUkFXX0pTT04gICAgICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBDb3VsZCBub3Qgc2F2ZSBzdGF0ZSB0byBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVEFURV9TQVZFX0ZBSUwgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIE5vIHN0YXRlIHdhcyBhdmFpbGFibGUgdG8gbG9hZCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfU0FWRV9NSVNTSU5HICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBOb24tZXhpc3RlbnQgcGhyYXNlc2V0IHJlZmVyZW5jZSB3aGVuIGdldHRpbmcgZnJvbSBzdGF0ZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RBVEVfTk9ORVhJU1RBTlRfUEhSQVNFU0VUIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBDb25maWdcclxuXHJcbiAgICAvKiogQ29uZmlnIGZhaWxlZCB0byBsb2FkIGZyb20gc3RvcmFnZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgQ09ORklHX0xPQURfRkFJTCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIENvbmZpZyBmYWlsZWQgdG8gc2F2ZSB0byBzdG9yYWdlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBDT05GSUdfU0FWRV9GQUlMICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogQ29uZmlnIGZhaWxlZCB0byBjbGVhciBmcm9tIHN0b3JhZ2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IENPTkZJR19SRVNFVF9GQUlMIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBEYXRhYmFzZVxyXG5cclxuICAgIC8qKiBHaXZlbiBlbGVtZW50IGlzbid0IGEgcGhyYXNlc2V0IGlGcmFtZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRSA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogVW5rbm93biBzdGF0aW9uIGNvZGUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERCX1VOS05PV05fU1RBVElPTiAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFN0YXRpb24gY29kZSB3aXRoIGJsYW5rIG5hbWUgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERCX0VNUFRZX1NUQVRJT04gICAgICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFBpY2tpbmcgdG9vIG1hbnkgc3RhdGlvbiBjb2RlcyBpbiBvbmUgZ28gKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IERCX1RPT19NQU5ZX1NUQVRJT05TICAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFRvb2xiYXJcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSB0ZXh0IGZvciB0b29sYmFyIGJ1dHRvbnNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfUExBWSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9TVE9QICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NIVUZGTEUgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRPT0xCQVJfU0FWRSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgVE9PTEJBUl9MT0FEICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBUT09MQkFSX1NFVFRJTkdTIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBFZGl0b3JcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSB0ZXh0IGZvciBlZGl0b3IgZWxlbWVudHNcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX0NPQUNIICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX0VYQ1VTRSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX0lOVEVHRVIgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX05BTUVEICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX09QVF9PUEVOICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX09QVF9DTE9TRSAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1BIUkFTRVNFVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1BMQVRGT1JNICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1NFUlZJQ0UgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1NUQVRJT04gICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1NUQVRJT05MSVNUIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFRJVExFX1RJTUUgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvKiogSW5pdGlhbCBtZXNzYWdlIHdoZW4gc2V0dGluZyB1cCBlZGl0b3IgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEVESVRPUl9JTklUICAgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVwbGFjZW1lbnQgdGV4dCBmb3IgdW5rbm93biBlZGl0b3IgZWxlbWVudHMgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEVESVRPUl9VTktOT1dOX0VMRU1FTlQgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVwbGFjZW1lbnQgdGV4dCBmb3IgZWRpdG9yIHBocmFzZXMgd2l0aCB1bmtub3duIHJlZmVyZW5jZSBpZHMgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEVESVRPUl9VTktOT1dOX1BIUkFTRSAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogUmVwbGFjZW1lbnQgdGV4dCBmb3IgZWRpdG9yIHBocmFzZXNldHMgd2l0aCB1bmtub3duIHJlZmVyZW5jZSBpZHMgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEVESVRPUl9VTktOT1dOX1BIUkFTRVNFVCA6IExhbmd1YWdlRW50cnk7XHJcblxyXG4gICAgLy8gUGhyYXNlclxyXG5cclxuICAgIC8qKiBUb28gbWFueSBsZXZlbHMgb2YgcmVjdXJzaW9uIGluIHRoZSBwaHJhc2VyICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQSFJBU0VSX1RPT19SRUNVUlNJVkUgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFBpY2tlcnNcclxuXHJcbiAgICAvLyBIZWFkZXJzIGZvciBwaWNrZXIgZGlhbG9nc1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX0NPQUNIICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9FWENVU0UgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfSU5URUdFUiAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX05BTUVEICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9QSFJBU0VTRVQgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfUExBVEZPUk0gICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1NFUlZJQ0UgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IEhFQURFUl9TVEFUSU9OICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBIRUFERVJfU1RBVElPTkxJU1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgSEVBREVSX1RJTUUgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvLyBUb29sdGlwcy90aXRsZSBhbmQgcGxhY2Vob2xkZXIgdGV4dCBmb3IgcGlja2VyIGNvbnRyb2xzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0dFTkVSSUNfVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfR0VORVJJQ19QSCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9DT0FDSF9UICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0VYQ1VTRV9UICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfRVhDVVNFX1BIICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9FWENVU0VfSVRFTV9UICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0lOVF9UICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfTkFNRURfVCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9OQU1FRF9QSCAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX05BTUVEX0lURU1fVCAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9UICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX1BIICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1BTRVRfSVRFTV9UICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUExBVF9OVU1CRVJfVCAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QTEFUX0xFVFRFUl9UICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZfVCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0VSVl9QSCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TRVJWX0lURU1fVCAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NUQVRJT05fVCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU1RBVElPTl9QSCAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TVEFUSU9OX0lURU1fVCA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0FERCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfQUREX1QgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9DTE9TRSAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0NMT1NFX1QgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfRU1QVFkgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9EUkFHX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NMX0RFTEVURSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfU0xfREVMRVRFX1QgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9JVEVNX1QgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1RJTUVfVCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuXHJcbiAgICAvKiogQ29hY2ggcGlja2VyJ3Mgb25DaGFuZ2UgZmlyZWQgd2l0aG91dCBjb250ZXh0ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX0NPQUNIX01JU1NJTkdfU1RBVEUgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogSW50ZWdlciBwaWNrZXIncyBvbkNoYW5nZSBmaXJlZCB3aXRob3V0IGNvbnRleHQgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfSU5UX01JU1NJTkdfU1RBVEUgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBQaHJhc2VzZXQgcGlja2VyJ3Mgb25TZWxlY3QgZmlyZWQgd2l0aG91dCByZWZlcmVuY2UgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFBfUFNFVF9NSVNTSU5HX1NUQVRFICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIC8qKiBTZXJ2aWNlIHBpY2tlcidzIG9uU2VsZWN0IGZpcmVkIHdpdGhvdXQgcmVmZXJlbmNlICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBQX1NFUlZJQ0VfTUlTU0lOR19TVEFURSA6IExhbmd1YWdlRW50cnk7XHJcbiAgICAvKiogU2VydmljZSBwaWNrZXIncyBvbkNoYW5nZSBmaXJlZCB3aXRob3V0IHJlZmVyZW5jZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9USU1FX01JU1NJTkdfU1RBVEUgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIFBocmFzZXNldCBwaWNrZXIgb3BlbmVkIGZvciB1bmtub3duIHBocmFzZXNldCAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9QU0VUX1VOS05PV04gICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIERyYWcgbWlycm9yIGNyZWF0ZSBldmVudCBpbiBzdGF0aW9uIGxpc3QgbWlzc2luZyBzdGF0ZSAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgUF9TTF9EUkFHX01JU1NJTkcgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFNldHRpbmdzXHJcblxyXG4gICAgLy8gVG9vbHRpcHMvdGl0bGUgYW5kIGxhYmVsIHRleHQgZm9yIHNldHRpbmdzIGVsZW1lbnRzXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVCAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfVCAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1JFU0VUX0NPTkZJUk0gICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9SRVNFVF9DT05GSVJNX1QgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfUkVTRVRfRE9ORSAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NBVkUgICAgICAgICAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TQVZFX1QgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIICAgICAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9DSE9JQ0UgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfRU1QVFkgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1ZPTCAgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9QSVRDSCAgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9TUEVFQ0hfUkFURSAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgU1RfU1BFRUNIX1RFU1QgICAgIDogTGFuZ3VhZ2VFbnRyeTtcclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IFNUX1NQRUVDSF9URVNUX1QgICA6IExhbmd1YWdlRW50cnk7XHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBTVF9MRUdBTCAgICAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIFVJIGNvbnRyb2xzXHJcblxyXG4gICAgLyoqIEhlYWRlciBmb3IgdGhlIFwidG9vIHNtYWxsXCIgd2FybmluZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgV0FSTl9TSE9SVF9IRUFERVIgOiBMYW5ndWFnZUVudHJ5O1xyXG4gICAgLyoqIEJvZHkgdGV4dCBmb3IgdGhlIFwidG9vIHNtYWxsXCIgd2FybmluZyAqL1xyXG4gICAgcmVhZG9ubHkgYWJzdHJhY3QgV0FSTl9TSE9SVCAgICAgICAgOiBMYW5ndWFnZUVudHJ5O1xyXG5cclxuICAgIC8vIE1pc2MuIGNvbnN0YW50c1xyXG5cclxuICAgIC8qKiBBcnJheSBvZiB0aGUgZW50aXJlIGFscGhhYmV0IG9mIHRoZSBsYW5ndWFnZSwgZm9yIGNvYWNoIGxldHRlcnMgKi9cclxuICAgIHJlYWRvbmx5IGFic3RyYWN0IExFVFRFUlMgOiBzdHJpbmc7XHJcbiAgICAvKiogQXJyYXkgb2YgbnVtYmVycyBhcyB3b3JkcyAoZS5nLiB6ZXJvLCBvbmUsIHR3byksIG1hdGNoaW5nIHRoZWlyIGluZGV4ICovXHJcbiAgICByZWFkb25seSBhYnN0cmFjdCBESUdJVFMgIDogc3RyaW5nW107XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJCYXNlTGFuZ3VhZ2UudHNcIi8+XHJcblxyXG5jbGFzcyBFbmdsaXNoTGFuZ3VhZ2UgZXh0ZW5kcyBCYXNlTGFuZ3VhZ2Vcclxue1xyXG4gICAgV0VMQ09NRSAgICAgICA9ICgpID0+ICdXZWxjb21lIHRvIFJhaWwgQW5ub3VuY2VtZW50IEdlbmVyYXRvci4nO1xyXG4gICAgRE9NX01JU1NJTkcgICA9IChxOiBzdHJpbmcpID0+IGBSZXF1aXJlZCBET00gZWxlbWVudCBpcyBtaXNzaW5nOiAnJHtxfSdgO1xyXG4gICAgQVRUUl9NSVNTSU5HICA9IChhOiBzdHJpbmcpID0+IGBSZXF1aXJlZCBhdHRyaWJ1dGUgaXMgbWlzc2luZzogJyR7YX0nYDtcclxuICAgIERBVEFfTUlTU0lORyAgPSAoazogc3RyaW5nKSA9PiBgUmVxdWlyZWQgZGF0YXNldCBrZXkgaXMgbWlzc2luZyBvciBlbXB0eTogJyR7a30nYDtcclxuICAgIEJBRF9ESVJFQ1RJT04gPSAodjogc3RyaW5nKSA9PiBgRGlyZWN0aW9uIG5lZWRzIHRvIGJlIC0xIG9yIDEsIG5vdCAnJHt2fSdgO1xyXG4gICAgQkFEX0JPT0xFQU4gICA9ICh2OiBzdHJpbmcpID0+IGBHaXZlbiBzdHJpbmcgZG9lcyBub3QgcmVwcmVzZW50IGEgYm9vbGVhbjogJyR7dn0nYDtcclxuXHJcbiAgICBTVEFURV9GUk9NX1NUT1JBR0UgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTdGF0ZSBoYXMgYmVlbiBsb2FkZWQgZnJvbSBzdG9yYWdlLic7XHJcbiAgICBTVEFURV9UT19TVE9SQUdFICAgICAgICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdTdGF0ZSBoYXMgYmVlbiBzYXZlZCB0byBzdG9yYWdlLCBhbmQgZHVtcGVkIHRvIGNvbnNvbGUuJztcclxuICAgIFNUQVRFX0NPUFlfUEFTVEUgICAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJyVjQ29weSBhbmQgcGFzdGUgdGhpcyBpbiBjb25zb2xlIHRvIGxvYWQgbGF0ZXI6JztcclxuICAgIFNUQVRFX1JBV19KU09OICAgICAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJyVjUmF3IEpTT04gc3RhdGU6JztcclxuICAgIFNUQVRFX1NBVkVfRkFJTCAgICAgICAgICAgICA9IChtc2c6IHN0cmluZykgPT5cclxuICAgICAgICBgU29ycnksIHN0YXRlIGNvdWxkIG5vdCBiZSBzYXZlZCB0byBzdG9yYWdlOiAke21zZ30uYDtcclxuICAgIFNUQVRFX1NBVkVfTUlTU0lORyAgICAgICAgICA9ICgpID0+XHJcbiAgICAgICAgJ1NvcnJ5LCBubyBzdGF0ZSB3YXMgZm91bmQgaW4gc3RvcmFnZS4nO1xyXG4gICAgU1RBVEVfTk9ORVhJU1RBTlRfUEhSQVNFU0VUID0gKHI6IHN0cmluZykgPT5cclxuICAgICAgICBgQXR0ZW1wdGVkIHRvIGdldCBjaG9zZW4gaW5kZXggZm9yIHBocmFzZXNldCAoJHtyfSkgdGhhdCBkb2Vzbid0IGV4aXN0YDtcclxuXHJcbiAgICBDT05GSUdfTE9BRF9GQUlMICA9IChtc2c6IHN0cmluZykgPT4gYENvdWxkIG5vdCBsb2FkIHNldHRpbmdzOiAke21zZ31gO1xyXG4gICAgQ09ORklHX1NBVkVfRkFJTCAgPSAobXNnOiBzdHJpbmcpID0+IGBDb3VsZCBub3Qgc2F2ZSBzZXR0aW5nczogJHttc2d9YDtcclxuICAgIENPTkZJR19SRVNFVF9GQUlMID0gKG1zZzogc3RyaW5nKSA9PiBgQ291bGQgbm90IGNsZWFyIHNldHRpbmdzOiAke21zZ31gO1xyXG5cclxuICAgIERCX0VMRU1FTlRfTk9UX1BIUkFTRVNFVF9JRlJBTUUgPSAoZTogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDb25maWd1cmVkIHBocmFzZXNldCBlbGVtZW50IHF1ZXJ5ICgke2V9KSBkb2VzIG5vdCBwb2ludCB0byBhbiBpRnJhbWUgZW1iZWRgO1xyXG4gICAgREJfVU5LTk9XTl9TVEFUSU9OICAgPSAoYzogc3RyaW5nKSA9PiBgVU5LTk9XTiBTVEFUSU9OOiAke2N9YDtcclxuICAgIERCX0VNUFRZX1NUQVRJT04gICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgU3RhdGlvbiBkYXRhYmFzZSBhcHBlYXJzIHRvIGNvbnRhaW4gYW4gZW1wdHkgbmFtZSBmb3IgY29kZSAnJHtjfSdgO1xyXG4gICAgREJfVE9PX01BTllfU1RBVElPTlMgPSAoKSA9PiAnUGlja2luZyB0b28gbWFueSBzdGF0aW9ucyB0aGFuIHRoZXJlIGFyZSBhdmFpbGFibGUnO1xyXG5cclxuICAgIFRPT0xCQVJfUExBWSAgICAgPSAoKSA9PiAnUGxheSBwaHJhc2UnO1xyXG4gICAgVE9PTEJBUl9TVE9QICAgICA9ICgpID0+ICdTdG9wIHBsYXlpbmcgcGhyYXNlJztcclxuICAgIFRPT0xCQVJfU0hVRkZMRSAgPSAoKSA9PiAnR2VuZXJhdGUgcmFuZG9tIHBocmFzZSc7XHJcbiAgICBUT09MQkFSX1NBVkUgICAgID0gKCkgPT4gJ1NhdmUgc3RhdGUgdG8gc3RvcmFnZSc7XHJcbiAgICBUT09MQkFSX0xPQUQgICAgID0gKCkgPT4gJ1JlY2FsbCBzdGF0ZSBmcm9tIHN0b3JhZ2UnO1xyXG4gICAgVE9PTEJBUl9TRVRUSU5HUyA9ICgpID0+ICdPcGVuIHNldHRpbmdzJztcclxuXHJcbiAgICBUSVRMRV9DT0FDSCAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIGNvYWNoICgnJHtjfScpYDtcclxuICAgIFRJVExFX0VYQ1VTRSAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICAnQ2xpY2sgdG8gY2hhbmdlIHRoaXMgZXhjdXNlJztcclxuICAgIFRJVExFX0lOVEVHRVIgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgbnVtYmVyICgnJHtjfScpYDtcclxuICAgIFRJVExFX05BTUVEICAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICBcIkNsaWNrIHRvIGNoYW5nZSB0aGlzIHRyYWluJ3MgbmFtZVwiO1xyXG4gICAgVElUTEVfT1BUX09QRU4gICAgPSAodDogc3RyaW5nLCByOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIG9wZW4gdGhpcyBvcHRpb25hbCAke3R9ICgnJHtyfScpYDtcclxuICAgIFRJVExFX09QVF9DTE9TRSAgID0gKHQ6IHN0cmluZywgcjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjbG9zZSB0aGlzIG9wdGlvbmFsICR7dH0gKCcke3J9JylgO1xyXG4gICAgVElUTEVfUEhSQVNFU0VUICAgPSAocjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhlIHBocmFzZSB1c2VkIGluIHRoaXMgc2VjdGlvbiAoJyR7cn0nKWA7XHJcbiAgICBUSVRMRV9QTEFURk9STSAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgXCJDbGljayB0byBjaGFuZ2UgdGhpcyB0cmFpbidzIHBsYXRmb3JtXCI7XHJcbiAgICBUSVRMRV9TRVJWSUNFICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYENsaWNrIHRvIGNoYW5nZSB0aGlzIHNlcnZpY2UgKCcke2N9JylgO1xyXG4gICAgVElUTEVfU1RBVElPTiAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBDbGljayB0byBjaGFuZ2UgdGhpcyBzdGF0aW9uICgnJHtjfScpYDtcclxuICAgIFRJVExFX1NUQVRJT05MSVNUID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgc3RhdGlvbiBsaXN0ICgnJHtjfScpYDtcclxuICAgIFRJVExFX1RJTUUgICAgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgQ2xpY2sgdG8gY2hhbmdlIHRoaXMgdGltZSAoJyR7Y30nKWA7XHJcblxyXG4gICAgRURJVE9SX0lOSVQgICAgICAgICAgICAgID0gKCkgPT4gJ1BsZWFzZSB3YWl0Li4uJztcclxuICAgIEVESVRPUl9VTktOT1dOX0VMRU1FTlQgICA9IChuOiBzdHJpbmcpID0+IGAoVU5LTk9XTiBYTUwgRUxFTUVOVDogJHtufSlgO1xyXG4gICAgRURJVE9SX1VOS05PV05fUEhSQVNFICAgID0gKHI6IHN0cmluZykgPT4gYChVTktOT1dOIFBIUkFTRTogJHtyfSlgO1xyXG4gICAgRURJVE9SX1VOS05PV05fUEhSQVNFU0VUID0gKHI6IHN0cmluZykgPT4gYChVTktOT1dOIFBIUkFTRVNFVDogJHtyfSlgO1xyXG5cclxuICAgIFBIUkFTRVJfVE9PX1JFQ1VSU0lWRSA9ICgpID0+XHJcbiAgICAgICAgJ1RvbyBtYW55IGxldmVscyBvZiByZWN1cnNpb24gd2hpbHN0IHByb2Nlc3NpbmcgcGhyYXNlJztcclxuXHJcbiAgICBIRUFERVJfQ09BQ0ggICAgICAgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgY29hY2ggbGV0dGVyIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX0VYQ1VTRSAgICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICAnUGljayBhbiBleGN1c2UnO1xyXG4gICAgSEVBREVSX0lOVEVHRVIgICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIG51bWJlciBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9OQU1FRCAgICAgICA9ICgpICAgICAgICAgID0+XHJcbiAgICAgICAgJ1BpY2sgYSBuYW1lZCB0cmFpbic7XHJcbiAgICBIRUFERVJfUEhSQVNFU0VUICAgPSAocjogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBQaWNrIGEgcGhyYXNlIGZvciB0aGUgJyR7cn0nIHNlY3Rpb25gO1xyXG4gICAgSEVBREVSX1BMQVRGT1JNICAgID0gKCkgICAgICAgICAgPT5cclxuICAgICAgICAnUGljayBhIHBsYXRmb3JtJztcclxuICAgIEhFQURFUl9TRVJWSUNFICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSBzZXJ2aWNlIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG4gICAgSEVBREVSX1NUQVRJT04gICAgID0gKGM6IHN0cmluZykgPT5cclxuICAgICAgICBgUGljayBhIHN0YXRpb24gZm9yIHRoZSAnJHtjfScgY29udGV4dGA7XHJcbiAgICBIRUFERVJfU1RBVElPTkxJU1QgPSAoYzogc3RyaW5nKSA9PlxyXG4gICAgICAgIGBCdWlsZCBhIHN0YXRpb24gbGlzdCBmb3IgdGhlICcke2N9JyBjb250ZXh0YDtcclxuICAgIEhFQURFUl9USU1FICAgICAgICA9IChjOiBzdHJpbmcpID0+XHJcbiAgICAgICAgYFBpY2sgYSB0aW1lIGZvciB0aGUgJyR7Y30nIGNvbnRleHRgO1xyXG5cclxuICAgIFBfR0VORVJJQ19UICAgICAgPSAoKSA9PiAnTGlzdCBvZiBjaG9pY2VzJztcclxuICAgIFBfR0VORVJJQ19QSCAgICAgPSAoKSA9PiAnRmlsdGVyIGNob2ljZXMuLi4nO1xyXG4gICAgUF9DT0FDSF9UICAgICAgICA9ICgpID0+ICdDb2FjaCBsZXR0ZXInO1xyXG4gICAgUF9FWENVU0VfVCAgICAgICA9ICgpID0+ICdMaXN0IG9mIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiBleGN1c2VzJztcclxuICAgIFBfRVhDVVNFX1BIICAgICAgPSAoKSA9PiAnRmlsdGVyIGV4Y3VzZXMuLi4nO1xyXG4gICAgUF9FWENVU0VfSVRFTV9UICA9ICgpID0+ICdDbGljayB0byBzZWxlY3QgdGhpcyBleGN1c2UnO1xyXG4gICAgUF9JTlRfVCAgICAgICAgICA9ICgpID0+ICdJbnRlZ2VyIHZhbHVlJztcclxuICAgIFBfTkFNRURfVCAgICAgICAgPSAoKSA9PiAnTGlzdCBvZiB0cmFpbiBuYW1lcyc7XHJcbiAgICBQX05BTUVEX1BIICAgICAgID0gKCkgPT4gJ0ZpbHRlciB0cmFpbiBuYW1lLi4uJztcclxuICAgIFBfTkFNRURfSVRFTV9UICAgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgbmFtZSc7XHJcbiAgICBQX1BTRVRfVCAgICAgICAgID0gKCkgPT4gJ0xpc3Qgb2YgcGhyYXNlcyc7XHJcbiAgICBQX1BTRVRfUEggICAgICAgID0gKCkgPT4gJ0ZpbHRlciBwaHJhc2VzLi4uJztcclxuICAgIFBfUFNFVF9JVEVNX1QgICAgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgcGhyYXNlJztcclxuICAgIFBfUExBVF9OVU1CRVJfVCAgPSAoKSA9PiAnUGxhdGZvcm0gbnVtYmVyJztcclxuICAgIFBfUExBVF9MRVRURVJfVCAgPSAoKSA9PiAnT3B0aW9uYWwgcGxhdGZvcm0gbGV0dGVyJztcclxuICAgIFBfU0VSVl9UICAgICAgICAgPSAoKSA9PiAnTGlzdCBvZiBzZXJ2aWNlIG5hbWVzJztcclxuICAgIFBfU0VSVl9QSCAgICAgICAgPSAoKSA9PiAnRmlsdGVyIHNlcnZpY2VzLi4uJztcclxuICAgIFBfU0VSVl9JVEVNX1QgICAgPSAoKSA9PiAnQ2xpY2sgdG8gc2VsZWN0IHRoaXMgc2VydmljZSc7XHJcbiAgICBQX1NUQVRJT05fVCAgICAgID0gKCkgPT4gJ0xpc3Qgb2Ygc3RhdGlvbiBuYW1lcyc7XHJcbiAgICBQX1NUQVRJT05fUEggICAgID0gKCkgPT4gJ0ZpbHRlciBzdGF0aW9ucy4uLic7XHJcbiAgICBQX1NUQVRJT05fSVRFTV9UID0gKCkgPT4gJ0NsaWNrIHRvIHNlbGVjdCBvciBhZGQgdGhpcyBzdGF0aW9uJztcclxuICAgIFBfU0xfQUREICAgICAgICAgPSAoKSA9PiAnQWRkIHN0YXRpb24uLi4nO1xyXG4gICAgUF9TTF9BRERfVCAgICAgICA9ICgpID0+ICdBZGQgc3RhdGlvbiB0byB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9DTE9TRSAgICAgICA9ICgpID0+ICdDbG9zZSc7XHJcbiAgICBQX1NMX0NMT1NFX1QgICAgID0gKCkgPT4gJ0Nsb3NlIHRoaXMgcGlja2VyJztcclxuICAgIFBfU0xfRU1QVFkgICAgICAgPSAoKSA9PiAnUGxlYXNlIGFkZCBhdCBsZWFzdCBvbmUgc3RhdGlvbiB0byB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9EUkFHX1QgICAgICA9ICgpID0+ICdEcmFnZ2FibGUgc2VsZWN0aW9uIG9mIHN0YXRpb25zIGZvciB0aGlzIGxpc3QnO1xyXG4gICAgUF9TTF9ERUxFVEUgICAgICA9ICgpID0+ICdEcm9wIGhlcmUgdG8gZGVsZXRlJztcclxuICAgIFBfU0xfREVMRVRFX1QgICAgPSAoKSA9PiAnRHJvcCBzdGF0aW9uIGhlcmUgdG8gZGVsZXRlIGl0IGZyb20gdGhpcyBsaXN0JztcclxuICAgIFBfU0xfSVRFTV9UICAgICAgPSAoKSA9PlxyXG4gICAgICAgICdEcmFnIHRvIHJlb3JkZXI7IGRvdWJsZS1jbGljayBvciBkcmFnIGludG8gZGVsZXRlIHpvbmUgdG8gcmVtb3ZlJztcclxuICAgIFBfVElNRV9UICAgICAgICAgPSAoKSA9PiAnVGltZSBlZGl0b3InO1xyXG5cclxuICAgIFBfQ09BQ0hfTUlTU0lOR19TVEFURSAgID0gKCkgPT4gJ29uQ2hhbmdlIGZpcmVkIGZvciBjb2FjaCBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX0lOVF9NSVNTSU5HX1NUQVRFICAgICA9ICgpID0+ICdvbkNoYW5nZSBmaXJlZCBmb3IgaW50ZWdlciBwaWNrZXIgd2l0aG91dCBzdGF0ZSc7XHJcbiAgICBQX1BTRVRfTUlTU0lOR19TVEFURSAgICA9ICgpID0+ICdvblNlbGVjdCBmaXJlZCBmb3IgcGhyYXNlc2V0IHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfU0VSVklDRV9NSVNTSU5HX1NUQVRFID0gKCkgPT4gJ29uU2VsZWN0IGZpcmVkIGZvciBzZXJ2aWNlIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfVElNRV9NSVNTSU5HX1NUQVRFICAgID0gKCkgPT4gJ29uQ2hhbmdlIGZpcmVkIGZvciB0aW1lIHBpY2tlciB3aXRob3V0IHN0YXRlJztcclxuICAgIFBfUFNFVF9VTktOT1dOICAgICAgICAgID0gKHI6IHN0cmluZykgPT4gYFBocmFzZXNldCAnJHtyfScgZG9lc24ndCBleGlzdGA7XHJcbiAgICBQX1NMX0RSQUdfTUlTU0lORyAgICAgICA9ICgpID0+ICdEcmFnZ2FibGU6IE1pc3Npbmcgc291cmNlIGVsZW1lbnRzIGZvciBtaXJyb3IgZXZlbnQnO1xyXG5cclxuICAgIFNUX1JFU0VUICAgICAgICAgICA9ICgpID0+ICdSZXNldCB0byBkZWZhdWx0cyc7XHJcbiAgICBTVF9SRVNFVF9UICAgICAgICAgPSAoKSA9PiAnUmVzZXQgc2V0dGluZ3MgdG8gZGVmYXVsdHMnO1xyXG4gICAgU1RfUkVTRVRfQ09ORklSTSAgID0gKCkgPT4gJ0FyZSB5b3Ugc3VyZT8nO1xyXG4gICAgU1RfUkVTRVRfQ09ORklSTV9UID0gKCkgPT4gJ0NvbmZpcm0gcmVzZXQgdG8gZGVmYXVsdHMnO1xyXG4gICAgU1RfUkVTRVRfRE9ORSAgICAgID0gKCkgPT5cclxuICAgICAgICAnU2V0dGluZ3MgaGF2ZSBiZWVuIHJlc2V0IHRvIHRoZWlyIGRlZmF1bHRzLCBhbmQgZGVsZXRlZCBmcm9tIHN0b3JhZ2UuJztcclxuICAgIFNUX1NBVkUgICAgICAgICAgICA9ICgpID0+ICdTYXZlICYgY2xvc2UnO1xyXG4gICAgU1RfU0FWRV9UICAgICAgICAgID0gKCkgPT4gJ1NhdmUgYW5kIGNsb3NlIHNldHRpbmdzJztcclxuICAgIFNUX1NQRUVDSCAgICAgICAgICA9ICgpID0+ICdTcGVlY2gnO1xyXG4gICAgU1RfU1BFRUNIX0NIT0lDRSAgID0gKCkgPT4gJ1ZvaWNlJztcclxuICAgIFNUX1NQRUVDSF9FTVBUWSAgICA9ICgpID0+ICdOb25lIGF2YWlsYWJsZSc7XHJcbiAgICBTVF9TUEVFQ0hfVk9MICAgICAgPSAoKSA9PiAnVm9sdW1lJztcclxuICAgIFNUX1NQRUVDSF9QSVRDSCAgICA9ICgpID0+ICdQaXRjaCc7XHJcbiAgICBTVF9TUEVFQ0hfUkFURSAgICAgPSAoKSA9PiAnUmF0ZSc7XHJcbiAgICBTVF9TUEVFQ0hfVEVTVCAgICAgPSAoKSA9PiAnVGVzdCBzcGVlY2gnO1xyXG4gICAgU1RfU1BFRUNIX1RFU1RfVCAgID0gKCkgPT4gJ1BsYXkgYSBzcGVlY2ggc2FtcGxlIHdpdGggdGhlIGN1cnJlbnQgc2V0dGluZ3MnO1xyXG4gICAgU1RfTEVHQUwgICAgICAgICAgID0gKCkgPT4gJ0xlZ2FsICYgQWNrbm93bGVkZ2VtZW50cyc7XHJcblxyXG4gICAgV0FSTl9TSE9SVF9IRUFERVIgPSAoKSA9PiAnXCJNYXkgSSBoYXZlIHlvdXIgYXR0ZW50aW9uIHBsZWFzZS4uLlwiJztcclxuICAgIFdBUk5fU0hPUlQgICAgICAgID0gKCkgPT5cclxuICAgICAgICAnVGhpcyBkaXNwbGF5IGlzIHRvbyBzaG9ydCB0byBzdXBwb3J0IFJBRy4gUGxlYXNlIG1ha2UgdGhpcyB3aW5kb3cgdGFsbGVyLCBvcicgK1xyXG4gICAgICAgICcgcm90YXRlIHlvdXIgZGV2aWNlIGZyb20gbGFuZHNjYXBlIHRvIHBvcnRyYWl0Lic7XHJcblxyXG4gICAgLy8gVE9ETzogVGhlc2UgZG9uJ3QgZml0IGhlcmU7IHRoaXMgc2hvdWxkIGdvIGluIHRoZSBkYXRhXHJcbiAgICBMRVRURVJTID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaJztcclxuICAgIERJR0lUUyAgPSBbXHJcbiAgICAgICAgJ3plcm8nLCAgICAgJ29uZScsICAgICAndHdvJywgICAgICd0aHJlZScsICAgICAnZm91cicsICAgICAnZml2ZScsICAgICdzaXgnLFxyXG4gICAgICAgICdzZXZlbicsICAgICdlaWdodCcsICAgJ25pbmUnLCAgICAndGVuJywgICAgICAgJ2VsZXZlbicsICAgJ3R3ZWx2ZScsICAndGhpcnRlZW4nLFxyXG4gICAgICAgICdmb3VydGVlbicsICdmaWZ0ZWVuJywgJ3NpeHRlZW4nLCAnc2V2ZW50ZWVuJywgJ2VpZ2h0ZWVuJywgJ25pbnRlZW4nLCAndHdlbnR5J1xyXG4gICAgXTtcclxuXHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKlxyXG4gKiBIb2xkcyBtZXRob2RzIGZvciBwcm9jZXNzaW5nIGVhY2ggdHlwZSBvZiBwaHJhc2UgZWxlbWVudCBpbnRvIEhUTUwsIHdpdGggZGF0YSB0YWtlblxyXG4gKiBmcm9tIHRoZSBjdXJyZW50IHN0YXRlLiBFYWNoIG1ldGhvZCB0YWtlcyBhIGNvbnRleHQgb2JqZWN0LCBob2xkaW5nIGRhdGEgZm9yIHRoZVxyXG4gKiBjdXJyZW50IFhNTCBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZCBhbmQgdGhlIFhNTCBkb2N1bWVudCBiZWluZyB1c2VkLlxyXG4gKi9cclxuY2xhc3MgRWxlbWVudFByb2Nlc3NvcnNcclxue1xyXG4gICAgLyoqIEZpbGxzIGluIGNvYWNoIGxldHRlcnMgZnJvbSBBIHRvIFogKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgY29hY2goY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfQ09BQ0goY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZ2V0Q29hY2goY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgZXhjdXNlLCBmb3IgYSBkZWxheSBvciBjYW5jZWxsYXRpb24gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZXhjdXNlKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfRVhDVVNFKCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZXhjdXNlO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gaW50ZWdlcnMsIG9wdGlvbmFsbHkgd2l0aCBub3VucyBhbmQgaW4gd29yZCBmb3JtICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGludGVnZXIoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ICA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgc2luZ3VsYXIgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3Npbmd1bGFyJyk7XHJcbiAgICAgICAgbGV0IHBsdXJhbCAgID0gY3R4LnhtbEVsZW1lbnQuZ2V0QXR0cmlidXRlKCdwbHVyYWwnKTtcclxuICAgICAgICBsZXQgd29yZHMgICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3dvcmRzJyk7XHJcblxyXG4gICAgICAgIGxldCBpbnQgICAgPSBSQUcuc3RhdGUuZ2V0SW50ZWdlcihjb250ZXh0KTtcclxuICAgICAgICBsZXQgaW50U3RyID0gKHdvcmRzICYmIHdvcmRzLnRvTG93ZXJDYXNlKCkgPT09ICd0cnVlJylcclxuICAgICAgICAgICAgPyBMLkRJR0lUU1tpbnRdIHx8IGludC50b1N0cmluZygpXHJcbiAgICAgICAgICAgIDogaW50LnRvU3RyaW5nKCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKGludCA9PT0gMSAmJiBzaW5ndWxhcilcclxuICAgICAgICAgICAgaW50U3RyICs9IGAgJHtzaW5ndWxhcn1gO1xyXG4gICAgICAgIGVsc2UgaWYgKGludCAhPT0gMSAmJiBwbHVyYWwpXHJcbiAgICAgICAgICAgIGludFN0ciArPSBgICR7cGx1cmFsfWA7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9JTlRFR0VSKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gaW50U3RyO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuXHJcbiAgICAgICAgaWYgKHNpbmd1bGFyKSBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydzaW5ndWxhciddID0gc2luZ3VsYXI7XHJcbiAgICAgICAgaWYgKHBsdXJhbCkgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydwbHVyYWwnXSAgID0gcGx1cmFsO1xyXG4gICAgICAgIGlmICh3b3JkcykgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnd29yZHMnXSAgICA9IHdvcmRzO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbmFtZWQoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9OQU1FRCgpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLm5hbWVkO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSW5jbHVkZXMgYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlLCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZShyZWYpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICAgICA9ICcnO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ3JlZiddID0gcmVmO1xyXG5cclxuICAgICAgICBpZiAoIXBocmFzZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gTC5FRElUT1JfVU5LTk9XTl9QSFJBU0UocmVmKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBocmFzZXMgd2l0aCBhIGNoYW5jZSB2YWx1ZSBhcyBjb2xsYXBzaWJsZVxyXG4gICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLm1ha2VDb2xsYXBzaWJsZShjdHgsIHJlZik7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmFwcGVuZENoaWxkKCBFbGVtZW50UHJvY2Vzc29ycy53cmFwVG9Jbm5lcihwaHJhc2UpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEluY2x1ZGVzIGEgcGhyYXNlIGZyb20gYSBwcmV2aW91c2x5IGRlZmluZWQgcGhyYXNlc2V0LCBieSBpdHMgYGlkYCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VzZXQoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCByZWYgICAgICAgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdyZWYnKTtcclxuICAgICAgICBsZXQgcGhyYXNlc2V0ID0gUkFHLmRhdGFiYXNlLmdldFBocmFzZXNldChyZWYpO1xyXG4gICAgICAgIGxldCBmb3JjZWRJZHggPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkeCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydyZWYnXSA9IHJlZjtcclxuXHJcbiAgICAgICAgaWYgKCFwaHJhc2VzZXQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IEwuRURJVE9SX1VOS05PV05fUEhSQVNFU0VUKHJlZik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBpZHggPSBmb3JjZWRJZHhcclxuICAgICAgICAgICAgPyBwYXJzZUludChmb3JjZWRJZHgpXHJcbiAgICAgICAgICAgIDogUkFHLnN0YXRlLmdldFBocmFzZXNldElkeChyZWYpO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlID0gcGhyYXNlc2V0LmNoaWxkcmVuW2lkeF0gYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2lkeCddID0gZm9yY2VkSWR4IHx8IGlkeC50b1N0cmluZygpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGhyYXNlc2V0cyB3aXRoIGEgY2hhbmNlIHZhbHVlIGFzIGNvbGxhcHNpYmxlXHJcbiAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMubWFrZUNvbGxhcHNpYmxlKGN0eCwgcmVmKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuYXBwZW5kQ2hpbGQoIEVsZW1lbnRQcm9jZXNzb3JzLndyYXBUb0lubmVyKHBocmFzZSkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIGN1cnJlbnQgcGxhdGZvcm0gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcGxhdGZvcm0oY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgID0gTC5USVRMRV9QTEFURk9STSgpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gUkFHLnN0YXRlLnBsYXRmb3JtLmpvaW4oJycpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gdGhlIHJhaWwgbmV0d29yayBuYW1lICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHNlcnZpY2UoY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjb250ZXh0ID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU0VSVklDRShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gc3RhdGlvbiBuYW1lcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzdGF0aW9uKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuICAgICAgICBsZXQgY29kZSAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uKGNvbnRleHQpO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC50aXRsZSAgICAgICA9IEwuVElUTEVfU1RBVElPTihjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGNvZGUpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgID0gMTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQuZGF0YXNldFsnY29udGV4dCddID0gY29udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKiogRmlsbHMgaW4gc3RhdGlvbiBsaXN0cyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzdGF0aW9ubGlzdChjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNvbnRleHQgICAgID0gRE9NLnJlcXVpcmVBdHRyKGN0eC54bWxFbGVtZW50LCAnY29udGV4dCcpO1xyXG4gICAgICAgIGxldCBzdGF0aW9ucyAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdChjb250ZXh0KS5zbGljZSgpO1xyXG4gICAgICAgIGxldCBzdGF0aW9uTGlzdCA9IFN0cmluZ3MuZnJvbVN0YXRpb25MaXN0KHN0YXRpb25zLCBjb250ZXh0KTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1NUQVRJT05MSVNUKGNvbnRleHQpO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRleHRDb250ZW50ID0gc3RhdGlvbkxpc3Q7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGFiSW5kZXggICAgPSAxO1xyXG5cclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10gPSBjb250ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBGaWxscyBpbiB0aGUgdGltZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB0aW1lKGN0eDogUGhyYXNlQ29udGV4dClcclxuICAgIHtcclxuICAgICAgICBsZXQgY29udGV4dCA9IERPTS5yZXF1aXJlQXR0cihjdHgueG1sRWxlbWVudCwgJ2NvbnRleHQnKTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGl0bGUgICAgICAgPSBMLlRJVExFX1RJTUUoY29udGV4dCk7XHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBSQUcuc3RhdGUuZ2V0VGltZShjb250ZXh0KTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50YWJJbmRleCAgICA9IDE7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSA9IGNvbnRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEZpbGxzIGluIHZveCBwYXJ0cyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyB2b3goY3R4OiBQaHJhc2VDb250ZXh0KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBrZXkgPSBET00ucmVxdWlyZUF0dHIoY3R4LnhtbEVsZW1lbnQsICdrZXknKTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTG9jYWxpemVcclxuICAgICAgICBjdHgubmV3RWxlbWVudC50ZXh0Q29udGVudCAgICA9IGN0eC54bWxFbGVtZW50LnRleHRDb250ZW50O1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRpdGxlICAgICAgICAgID0gYENsaWNrIHRvIGVkaXQgdGhpcyBwaHJhc2UgKCR7a2V5fSlgO1xyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LnRhYkluZGV4ICAgICAgID0gMTtcclxuICAgICAgICBjdHgubmV3RWxlbWVudC5kYXRhc2V0WydrZXknXSA9IGtleTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB1bmtub3duIGVsZW1lbnRzIHdpdGggYW4gaW5saW5lIGVycm9yIG1lc3NhZ2UgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdW5rbm93bihjdHg6IFBocmFzZUNvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5hbWUgPSBjdHgueG1sRWxlbWVudC5ub2RlTmFtZTtcclxuXHJcbiAgICAgICAgY3R4Lm5ld0VsZW1lbnQudGV4dENvbnRlbnQgPSBMLkVESVRPUl9VTktOT1dOX0VMRU1FTlQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRhY2hlcyBjaGFuY2UgYW5kIGEgcHJlLWRldGVybWluZWQgY29sbGFwc2Ugc3RhdGUgZm9yIGEgZ2l2ZW4gcGhyYXNlIGVsZW1lbnQsIGlmXHJcbiAgICAgKiBpdCBkb2VzIGhhdmUgYSBjaGFuY2UgYXR0cmlidWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGN0eCBDb250ZXh0IG9mIHRoZSBjdXJyZW50IHBocmFzZSBlbGVtZW50IGJlaW5nIHByb2Nlc3NlZFxyXG4gICAgICogQHBhcmFtIHJlZiBSZWZlcmVuY2UgSUQgdG8gZ2V0IChvciBwaWNrKSB0aGUgY29sbGFwc2Ugc3RhdGUgb2ZcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgbWFrZUNvbGxhcHNpYmxlKGN0eDogUGhyYXNlQ29udGV4dCwgcmVmOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGlmICggIWN0eC54bWxFbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY2hhbmNlJykgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCBjaGFuY2UgICAgPSBjdHgueG1sRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2NoYW5jZScpITtcclxuICAgICAgICBsZXQgY29sbGFwc2VkID0gUkFHLnN0YXRlLmdldENvbGxhcHNlZCggcmVmLCBwYXJzZUludChjaGFuY2UpICk7XHJcblxyXG4gICAgICAgIGN0eC5uZXdFbGVtZW50LmRhdGFzZXRbJ2NoYW5jZSddID0gY2hhbmNlO1xyXG5cclxuICAgICAgICBDb2xsYXBzaWJsZXMuc2V0KGN0eC5uZXdFbGVtZW50LCBjb2xsYXBzZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xvbmVzIHRoZSBjaGlsZHJlbiBvZiB0aGUgZ2l2ZW4gZWxlbWVudCBpbnRvIGEgbmV3IGlubmVyIHNwYW4gdGFnLCBzbyB0aGF0IHRoZXlcclxuICAgICAqIGNhbiBiZSBtYWRlIGNvbGxhcHNpYmxlIG9yIGJ1bmRsZWQgd2l0aCBidXR0b25zLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBzb3VyY2UgUGFyZW50IHRvIGNsb25lIHRoZSBjaGlsZHJlbiBvZiwgaW50byBhIHdyYXBwZXJcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgd3JhcFRvSW5uZXIoc291cmNlOiBIVE1MRWxlbWVudCkgOiBIVE1MRWxlbWVudFxyXG4gICAge1xyXG4gICAgICAgIGxldCBpbm5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuXHJcbiAgICAgICAgaW5uZXIuY2xhc3NMaXN0LmFkZCgnaW5uZXInKTtcclxuICAgICAgICBET00uY2xvbmVJbnRvKHNvdXJjZSwgaW5uZXIpO1xyXG5cclxuICAgICAgICByZXR1cm4gaW5uZXI7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBSZXByZXNlbnRzIGNvbnRleHQgZGF0YSBmb3IgYSBwaHJhc2UsIHRvIGJlIHBhc3NlZCB0byBhbiBlbGVtZW50IHByb2Nlc3NvciAqL1xyXG5pbnRlcmZhY2UgUGhyYXNlQ29udGV4dFxyXG57XHJcbiAgICAvKiogR2V0cyB0aGUgWE1MIHBocmFzZSBlbGVtZW50IHRoYXQgaXMgYmVpbmcgcmVwbGFjZWQgKi9cclxuICAgIHhtbEVsZW1lbnQgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBHZXRzIHRoZSBIVE1MIHNwYW4gZWxlbWVudCB0aGF0IGlzIHJlcGxhY2luZyB0aGUgWE1MIGVsZW1lbnQgKi9cclxuICAgIG5ld0VsZW1lbnQgOiBIVE1MU3BhbkVsZW1lbnQ7XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKlxyXG4gKiBIYW5kbGVzIHRoZSB0cmFuc2Zvcm1hdGlvbiBvZiBwaHJhc2UgWE1MIGRhdGEsIGludG8gSFRNTCBlbGVtZW50cyB3aXRoIHRoZWlyIGRhdGFcclxuICogZmlsbGVkIGluIGFuZCB0aGVpciBVSSBsb2dpYyB3aXJlZC5cclxuICovXHJcbmNsYXNzIFBocmFzZXJcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBSZWN1cnNpdmVseSBwcm9jZXNzZXMgWE1MIGVsZW1lbnRzLCBmaWxsaW5nIGluIGRhdGEgYW5kIGFwcGx5aW5nIHRyYW5zZm9ybXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciBQYXJlbnQgdG8gcHJvY2VzcyB0aGUgY2hpbGRyZW4gb2ZcclxuICAgICAqIEBwYXJhbSBsZXZlbCBDdXJyZW50IGxldmVsIG9mIHJlY3Vyc2lvbiwgbWF4LiAyMFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcHJvY2Vzcyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBsZXZlbDogbnVtYmVyID0gMClcclxuICAgIHtcclxuICAgICAgICAvLyBJbml0aWFsbHksIHRoaXMgbWV0aG9kIHdhcyBzdXBwb3NlZCB0byBqdXN0IGFkZCB0aGUgWE1MIGVsZW1lbnRzIGRpcmVjdGx5IGludG9cclxuICAgICAgICAvLyB0aGUgZG9jdW1lbnQuIEhvd2V2ZXIsIHRoaXMgY2F1c2VkIGEgbG90IG9mIHByb2JsZW1zIChlLmcuIHRpdGxlIG5vdCB3b3JraW5nKS5cclxuICAgICAgICAvLyBIVE1MIGRvZXMgbm90IHdvcmsgcmVhbGx5IHdlbGwgd2l0aCBjdXN0b20gZWxlbWVudHMsIGVzcGVjaWFsbHkgaWYgdGhleSBhcmUgb2ZcclxuICAgICAgICAvLyBhbm90aGVyIFhNTCBuYW1lc3BhY2UuXHJcblxyXG4gICAgICAgIGxldCBxdWVyeSAgID0gJzpub3Qoc3Bhbik6bm90KHN2Zyk6bm90KHVzZSk6bm90KGJ1dHRvbiknO1xyXG4gICAgICAgIGxldCBwZW5kaW5nID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwocXVlcnkpIGFzIE5vZGVMaXN0T2Y8SFRNTEVsZW1lbnQ+O1xyXG5cclxuICAgICAgICAvLyBObyBtb3JlIFhNTCBlbGVtZW50cyB0byBleHBhbmRcclxuICAgICAgICBpZiAocGVuZGluZy5sZW5ndGggPT09IDApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gRm9yIGVhY2ggWE1MIGVsZW1lbnQgY3VycmVudGx5IGluIHRoZSBjb250YWluZXI6XHJcbiAgICAgICAgLy8gKiBDcmVhdGUgYSBuZXcgc3BhbiBlbGVtZW50IGZvciBpdFxyXG4gICAgICAgIC8vICogSGF2ZSB0aGUgcHJvY2Vzc29ycyB0YWtlIGRhdGEgZnJvbSB0aGUgWE1MIGVsZW1lbnQsIHRvIHBvcHVsYXRlIHRoZSBuZXcgb25lXHJcbiAgICAgICAgLy8gKiBSZXBsYWNlIHRoZSBYTUwgZWxlbWVudCB3aXRoIHRoZSBuZXcgb25lXHJcbiAgICAgICAgcGVuZGluZy5mb3JFYWNoKGVsZW1lbnQgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBlbGVtZW50TmFtZSA9IGVsZW1lbnQubm9kZU5hbWUudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgbGV0IG5ld0VsZW1lbnQgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG4gICAgICAgICAgICBsZXQgY29udGV4dCAgICAgPSB7XHJcbiAgICAgICAgICAgICAgICB4bWxFbGVtZW50OiBlbGVtZW50LFxyXG4gICAgICAgICAgICAgICAgbmV3RWxlbWVudDogbmV3RWxlbWVudFxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgbmV3RWxlbWVudC5kYXRhc2V0Wyd0eXBlJ10gPSBlbGVtZW50TmFtZTtcclxuXHJcbiAgICAgICAgICAgIC8vIEkgd2FudGVkIHRvIHVzZSBhbiBpbmRleCBvbiBFbGVtZW50UHJvY2Vzc29ycyBmb3IgdGhpcywgYnV0IGl0IGNhdXNlZCBldmVyeVxyXG4gICAgICAgICAgICAvLyBwcm9jZXNzb3IgdG8gaGF2ZSBhbiBcInVudXNlZCBtZXRob2RcIiB3YXJuaW5nLlxyXG4gICAgICAgICAgICBzd2l0Y2ggKGVsZW1lbnROYW1lKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdjb2FjaCc6ICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLmNvYWNoKGNvbnRleHQpOyAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2V4Y3VzZSc6ICAgICAgRWxlbWVudFByb2Nlc3NvcnMuZXhjdXNlKGNvbnRleHQpOyAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnaW50ZWdlcic6ICAgICBFbGVtZW50UHJvY2Vzc29ycy5pbnRlZ2VyKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICduYW1lZCc6ICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLm5hbWVkKGNvbnRleHQpOyAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3BocmFzZSc6ICAgICAgRWxlbWVudFByb2Nlc3NvcnMucGhyYXNlKGNvbnRleHQpOyAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAncGhyYXNlc2V0JzogICBFbGVtZW50UHJvY2Vzc29ycy5waHJhc2VzZXQoY29udGV4dCk7ICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdwbGF0Zm9ybSc6ICAgIEVsZW1lbnRQcm9jZXNzb3JzLnBsYXRmb3JtKGNvbnRleHQpOyAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3NlcnZpY2UnOiAgICAgRWxlbWVudFByb2Nlc3NvcnMuc2VydmljZShjb250ZXh0KTsgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc3RhdGlvbic6ICAgICBFbGVtZW50UHJvY2Vzc29ycy5zdGF0aW9uKGNvbnRleHQpOyAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdzdGF0aW9ubGlzdCc6IEVsZW1lbnRQcm9jZXNzb3JzLnN0YXRpb25saXN0KGNvbnRleHQpOyBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ3RpbWUnOiAgICAgICAgRWxlbWVudFByb2Nlc3NvcnMudGltZShjb250ZXh0KTsgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAndm94JzogICAgICAgICBFbGVtZW50UHJvY2Vzc29ycy52b3goY29udGV4dCk7ICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiAgICAgICAgICAgIEVsZW1lbnRQcm9jZXNzb3JzLnVua25vd24oY29udGV4dCk7ICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgZWxlbWVudC5wYXJlbnRFbGVtZW50IS5yZXBsYWNlQ2hpbGQobmV3RWxlbWVudCwgZWxlbWVudCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFJlY3Vyc2Ugc28gdGhhdCB3ZSBjYW4gZXhwYW5kIGFueSBuZXcgZWxlbWVudHNcclxuICAgICAgICBpZiAobGV2ZWwgPCAyMClcclxuICAgICAgICAgICAgdGhpcy5wcm9jZXNzKGNvbnRhaW5lciwgbGV2ZWwgKyAxKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLlBIUkFTRVJfVE9PX1JFQ1VSU0lWRSgpICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IGNsYXNzIGZvciByZXNvbHZpbmcgYSBnaXZlbiBwaHJhc2UgdG8gdm94IGtleXMgKi9cclxuY2xhc3MgUmVzb2x2ZXJcclxue1xyXG4gICAgLyoqIFRyZWVXYWxrZXIgZmlsdGVyIHRvIHJlZHVjZSBhIHdhbGsgdG8ganVzdCB0aGUgZWxlbWVudHMgdGhlIHJlc29sdmVyIG5lZWRzICovXHJcbiAgICBwcml2YXRlIHN0YXRpYyBub2RlRmlsdGVyKG5vZGU6IE5vZGUpOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ICAgICA9IG5vZGUucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgbGV0IHBhcmVudFR5cGUgPSBwYXJlbnQuZGF0YXNldFsndHlwZSddO1xyXG5cclxuICAgICAgICAvLyBJZiB0eXBlIGlzIG1pc3NpbmcsIHBhcmVudCBpcyBhIHdyYXBwZXJcclxuICAgICAgICBpZiAoIXBhcmVudFR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBwYXJlbnQgICAgID0gcGFyZW50LnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgICAgICBwYXJlbnRUeXBlID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFjY2VwdCB0ZXh0IG9ubHkgZnJvbSBwaHJhc2UgYW5kIHBocmFzZXNldHNcclxuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpXHJcbiAgICAgICAgaWYgKHBhcmVudFR5cGUgIT09ICdwaHJhc2VzZXQnICYmIHBhcmVudFR5cGUgIT09ICdwaHJhc2UnKVxyXG4gICAgICAgICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfU0tJUDtcclxuXHJcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGVsZW1lbnQgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBsZXQgdHlwZSAgICA9IGVsZW1lbnQuZGF0YXNldFsndHlwZSddO1xyXG5cclxuICAgICAgICAgICAgLy8gUmVqZWN0IGNvbGxhcHNlZCBlbGVtZW50cyBhbmQgdGhlaXIgY2hpbGRyZW5cclxuICAgICAgICAgICAgaWYgKCBlbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVDtcclxuXHJcbiAgICAgICAgICAgIC8vIFNraXAgdHlwZWxlc3MgKHdyYXBwZXIpIGVsZW1lbnRzXHJcbiAgICAgICAgICAgIGlmICghdHlwZSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCBvdmVyIHBocmFzZSBhbmQgcGhyYXNlc2V0cyAoaW5zdGVhZCwgb25seSBnb2luZyBmb3IgdGhlaXIgY2hpbGRyZW4pXHJcbiAgICAgICAgICAgIGlmICh0eXBlID09PSAncGhyYXNlc2V0JyB8fCB0eXBlID09PSAncGhyYXNlJylcclxuICAgICAgICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBocmFzZSAgICA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIHByaXZhdGUgZmxhdHRlbmVkIDogTm9kZVtdO1xyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZWQgIDogVm94S2V5W107XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKHBocmFzZTogSFRNTEVsZW1lbnQpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5waHJhc2UgICAgPSBwaHJhc2U7XHJcbiAgICAgICAgdGhpcy5mbGF0dGVuZWQgPSBbXTtcclxuICAgICAgICB0aGlzLnJlc29sdmVkICA9IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyB0b1ZveCgpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICAvLyBGaXJzdCwgd2FsayB0aHJvdWdoIHRoZSBwaHJhc2UgYW5kIFwiZmxhdHRlblwiIGl0IGludG8gYW4gYXJyYXkgb2YgcGFydHMuIFRoaXMgaXNcclxuICAgICAgICAvLyBzbyB0aGUgcmVzb2x2ZXIgY2FuIGxvb2stYWhlYWQgb3IgbG9vay1iZWhpbmQuXHJcblxyXG4gICAgICAgIHRoaXMuZmxhdHRlbmVkID0gW107XHJcbiAgICAgICAgdGhpcy5yZXNvbHZlZCAgPSBbXTtcclxuICAgICAgICBsZXQgdHJlZVdhbGtlciA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoXHJcbiAgICAgICAgICAgIHRoaXMucGhyYXNlLFxyXG4gICAgICAgICAgICBOb2RlRmlsdGVyLlNIT1dfVEVYVCB8IE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5ULFxyXG4gICAgICAgICAgICB7IGFjY2VwdE5vZGU6IFJlc29sdmVyLm5vZGVGaWx0ZXIgfSxcclxuICAgICAgICAgICAgZmFsc2VcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB3aGlsZSAoIHRyZWVXYWxrZXIubmV4dE5vZGUoKSApXHJcbiAgICAgICAgaWYgKHRyZWVXYWxrZXIuY3VycmVudE5vZGUudGV4dENvbnRlbnQhLnRyaW0oKSAhPT0gJycpXHJcbiAgICAgICAgICAgIHRoaXMuZmxhdHRlbmVkLnB1c2godHJlZVdhbGtlci5jdXJyZW50Tm9kZSk7XHJcblxyXG4gICAgICAgIC8vIFRoZW4sIHJlc29sdmUgYWxsIHRoZSBwaHJhc2VzJyBub2RlcyBpbnRvIHZveCBrZXlzXHJcblxyXG4gICAgICAgIHRoaXMuZmxhdHRlbmVkLmZvckVhY2goICh2LCBpKSA9PiB0aGlzLnJlc29sdmVkLnB1c2goIC4uLnRoaXMucmVzb2x2ZSh2LCBpKSApICk7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMuZmxhdHRlbmVkLCB0aGlzLnJlc29sdmVkKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlZDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVzZXMgdGhlIHR5cGUgYW5kIHZhbHVlIG9mIHRoZSBnaXZlbiBub2RlLCB0byByZXNvbHZlIGl0IHRvIHZveCBmaWxlIElEcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbm9kZSBOb2RlIHRvIHJlc29sdmUgdG8gdm94IElEc1xyXG4gICAgICogQHBhcmFtIGlkeCBJbmRleCBvZiB0aGUgbm9kZSBiZWluZyByZXNvbHZlZCByZWxhdGl2ZSB0byB0aGUgcGhyYXNlIGFycmF5XHJcbiAgICAgKiBAcmV0dXJucyBBcnJheSBvZiBJRHMgdGhhdCBtYWtlIHVwIG9uZSBvciBtb3JlIGZpbGUgSURzLiBDYW4gYmUgZW1wdHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcmVzb2x2ZShub2RlOiBOb2RlLCBpZHg6IG51bWJlcikgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZVRleHQobm9kZSk7XHJcblxyXG4gICAgICAgIGxldCBlbGVtZW50ID0gbm9kZSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgdHlwZSAgICA9IGVsZW1lbnQuZGF0YXNldFsndHlwZSddO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlICdjb2FjaCc6ICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVDb2FjaChlbGVtZW50LCBpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdleGN1c2UnOiAgICAgIHJldHVybiB0aGlzLnJlc29sdmVFeGN1c2UoaWR4KTtcclxuICAgICAgICAgICAgY2FzZSAnaW50ZWdlcic6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlSW50ZWdlcihlbGVtZW50KTtcclxuICAgICAgICAgICAgY2FzZSAnbmFtZWQnOiAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlTmFtZWQoKTtcclxuICAgICAgICAgICAgY2FzZSAncGxhdGZvcm0nOiAgICByZXR1cm4gdGhpcy5yZXNvbHZlUGxhdGZvcm0oaWR4KTtcclxuICAgICAgICAgICAgY2FzZSAnc2VydmljZSc6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlU2VydmljZShlbGVtZW50KTtcclxuICAgICAgICAgICAgY2FzZSAnc3RhdGlvbic6ICAgICByZXR1cm4gdGhpcy5yZXNvbHZlU3RhdGlvbihlbGVtZW50LCBpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICdzdGF0aW9ubGlzdCc6IHJldHVybiB0aGlzLnJlc29sdmVTdGF0aW9uTGlzdChlbGVtZW50LCBpZHgpO1xyXG4gICAgICAgICAgICBjYXNlICd0aW1lJzogICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVUaW1lKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjYXNlICd2b3gnOiAgICAgICAgIHJldHVybiB0aGlzLnJlc29sdmVWb3goZWxlbWVudCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRJbmZsZWN0aW9uKGlkeDogbnVtYmVyKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBuZXh0ID0gdGhpcy5mbGF0dGVuZWRbaWR4ICsgMV07XHJcblxyXG4gICAgICAgIHJldHVybiAoIG5leHQgJiYgbmV4dC50ZXh0Q29udGVudCEudHJpbSgpLnN0YXJ0c1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgID8gJ2VuZCdcclxuICAgICAgICAgICAgOiAnbWlkJztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVUZXh0KG5vZGU6IE5vZGUpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgcGFyZW50ID0gbm9kZS5wYXJlbnRFbGVtZW50ITtcclxuICAgICAgICBsZXQgdHlwZSAgID0gcGFyZW50LmRhdGFzZXRbJ3R5cGUnXTtcclxuICAgICAgICBsZXQgdGV4dCAgID0gU3RyaW5ncy5jbGVhbihub2RlLnRleHRDb250ZW50ISk7XHJcbiAgICAgICAgbGV0IHNldCAgICA9IFtdO1xyXG5cclxuICAgICAgICAvLyBJZiB0ZXh0IGlzIGp1c3QgYSBmdWxsIHN0b3AsIHJldHVybiBzaWxlbmNlXHJcbiAgICAgICAgaWYgKHRleHQgPT09ICcuJylcclxuICAgICAgICAgICAgcmV0dXJuIFswLjY1XTtcclxuXHJcbiAgICAgICAgLy8gSWYgaXQgYmVnaW5zIHdpdGggYSBmdWxsIHN0b3AsIGFkZCBzaWxlbmNlXHJcbiAgICAgICAgaWYgKCB0ZXh0LnN0YXJ0c1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgIHNldC5wdXNoKDAuNjUpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgdGV4dCBkb2Vzbid0IGNvbnRhaW4gYW55IHdvcmRzLCBza2lwXHJcbiAgICAgICAgaWYgKCAhdGV4dC5tYXRjaCgvW2EtejAtOV0vaSkgKVxyXG4gICAgICAgICAgICByZXR1cm4gc2V0O1xyXG5cclxuICAgICAgICAvLyBJZiB0eXBlIGlzIG1pc3NpbmcsIHBhcmVudCBpcyBhIHdyYXBwZXJcclxuICAgICAgICBpZiAoIXR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgICAgIHR5cGUgICA9IHBhcmVudC5kYXRhc2V0Wyd0eXBlJ107XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgcmVmID0gcGFyZW50LmRhdGFzZXRbJ3JlZiddO1xyXG4gICAgICAgIGxldCBpZHggPSBET00ubm9kZUluZGV4T2Yobm9kZSk7XHJcbiAgICAgICAgbGV0IGlkICA9IGAke3R5cGV9LiR7cmVmfWA7XHJcblxyXG4gICAgICAgIC8vIEFwcGVuZCBpbmRleCBvZiBwaHJhc2VzZXQncyBjaG9pY2Ugb2YgcGhyYXNlXHJcbiAgICAgICAgaWYgKHR5cGUgPT09ICdwaHJhc2VzZXQnKVxyXG4gICAgICAgICAgICBpZCArPSBgLiR7cGFyZW50LmRhdGFzZXRbJ2lkeCddfWA7XHJcblxyXG4gICAgICAgIGlkICs9IGAuJHtpZHh9YDtcclxuICAgICAgICBzZXQucHVzaChpZCk7XHJcblxyXG4gICAgICAgIC8vIElmIHRleHQgZW5kcyB3aXRoIGEgZnVsbCBzdG9wLCBhZGQgc2lsZW5jZVxyXG4gICAgICAgIGlmICggdGV4dC5lbmRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgc2V0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIHJldHVybiBzZXQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlQ29hY2goZWxlbWVudDogSFRNTEVsZW1lbnQsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IGNvYWNoICAgPSBSQUcuc3RhdGUuZ2V0Q29hY2goY3R4KTtcclxuICAgICAgICBsZXQgaW5mbGVjdCA9IHRoaXMuZ2V0SW5mbGVjdGlvbihpZHgpO1xyXG4gICAgICAgIGxldCByZXN1bHQgID0gWzAuMiwgYGxldHRlci4ke2NvYWNofS4ke2luZmxlY3R9YF07XHJcblxyXG4gICAgICAgIGlmIChpbmZsZWN0ID09PSAnbWlkJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4yKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVFeGN1c2UoaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgZXhjdXNlICA9IFJBRy5zdGF0ZS5leGN1c2U7XHJcbiAgICAgICAgbGV0IGtleSAgICAgPSBTdHJpbmdzLmZpbGVuYW1lKGV4Y3VzZSk7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgcmVzdWx0ICA9IFswLjE1LCBgZXhjdXNlLiR7a2V5fS4ke2luZmxlY3R9YF07XHJcblxyXG4gICAgICAgIGlmIChpbmZsZWN0ID09PSAnbWlkJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4yKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVJbnRlZ2VyKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCBzaW5ndWxhciA9IGVsZW1lbnQuZGF0YXNldFsnc2luZ3VsYXInXTtcclxuICAgICAgICBsZXQgcGx1cmFsICAgPSBlbGVtZW50LmRhdGFzZXRbJ3BsdXJhbCddO1xyXG4gICAgICAgIGxldCBpbnRlZ2VyICA9IFJBRy5zdGF0ZS5nZXRJbnRlZ2VyKGN0eCk7XHJcbiAgICAgICAgbGV0IHBhcnRzICAgID0gWzAuMTI1LCBgbnVtYmVyLiR7aW50ZWdlcn0ubWlkYF07XHJcblxyXG4gICAgICAgIGlmICAgICAgKHNpbmd1bGFyICYmIGludGVnZXIgPT09IDEpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4xNSwgYG51bWJlci5zdWZmaXguJHtzaW5ndWxhcn0uZW5kYCk7XHJcbiAgICAgICAgZWxzZSBpZiAocGx1cmFsICAgJiYgaW50ZWdlciAhPT0gMSlcclxuICAgICAgICAgICAgcGFydHMucHVzaCgwLjE1LCBgbnVtYmVyLnN1ZmZpeC4ke3BsdXJhbH0uZW5kYCk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKDAuMTUpO1xyXG5cclxuICAgICAgICByZXR1cm4gcGFydHM7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlTmFtZWQoKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG5hbWVkID0gU3RyaW5ncy5maWxlbmFtZShSQUcuc3RhdGUubmFtZWQpO1xyXG5cclxuICAgICAgICByZXR1cm4gWzAuMiwgYG5hbWVkLiR7bmFtZWR9Lm1pZGAsIDAuMl07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlUGxhdGZvcm0oaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgcGxhdGZvcm0gPSBSQUcuc3RhdGUucGxhdGZvcm07XHJcbiAgICAgICAgbGV0IGluZmxlY3QgID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcbiAgICAgICAgbGV0IGxldHRlciAgID0gKHBsYXRmb3JtWzFdID09PSAnwr4nKSA/ICdNJyA6IHBsYXRmb3JtWzFdO1xyXG4gICAgICAgIGxldCByZXN1bHQgICA9IFswLjE1LCBgbnVtYmVyLiR7cGxhdGZvcm1bMF19JHtsZXR0ZXJ9LiR7aW5mbGVjdH1gXTtcclxuXHJcbiAgICAgICAgaWYgKGluZmxlY3QgPT09ICdtaWQnKVxyXG4gICAgICAgICAgICByZXN1bHQucHVzaCgwLjIpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVNlcnZpY2UoZWxlbWVudDogSFRNTEVsZW1lbnQpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgc2VydmljZSA9IFN0cmluZ3MuZmlsZW5hbWUoIFJBRy5zdGF0ZS5nZXRTZXJ2aWNlKGN0eCkgKTtcclxuICAgICAgICBsZXQgcmVzdWx0ICA9IFtdO1xyXG5cclxuICAgICAgICAvLyBPbmx5IGFkZCBiZWdpbm5pbmcgZGVsYXkgaWYgdGhlcmUgaXNuJ3QgYWxyZWFkeSBvbmUgcHJpb3JcclxuICAgICAgICBpZiAodHlwZW9mIHRoaXMucmVzb2x2ZWQuc2xpY2UoLTEpWzBdICE9PSAnbnVtYmVyJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4xNSk7XHJcblxyXG4gICAgICAgIHJldHVybiBbLi4ucmVzdWx0LCBgc2VydmljZS4ke3NlcnZpY2V9Lm1pZGAsIDAuMTVdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVN0YXRpb24oZWxlbWVudDogSFRNTEVsZW1lbnQsIGlkeDogbnVtYmVyKSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgICAgPSBlbGVtZW50LmRhdGFzZXRbJ2NvbnRleHQnXSE7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSBSQUcuc3RhdGUuZ2V0U3RhdGlvbihjdHgpO1xyXG4gICAgICAgIGxldCB2b3hLZXkgID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb25Wb3goc3RhdGlvbik7XHJcbiAgICAgICAgbGV0IGluZmxlY3QgPSB0aGlzLmdldEluZmxlY3Rpb24oaWR4KTtcclxuICAgICAgICBsZXQgcmVzdWx0ICA9IFswLjIsIGBzdGF0aW9uLiR7dm94S2V5fS4ke2luZmxlY3R9YF07XHJcblxyXG4gICAgICAgIGlmIChpbmZsZWN0ID09PSAnbWlkJylcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC4yKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVTdGF0aW9uTGlzdChlbGVtZW50OiBIVE1MRWxlbWVudCwgaWR4OiBudW1iZXIpIDogVm94S2V5W11cclxuICAgIHtcclxuICAgICAgICBsZXQgY3R4ICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY29udGV4dCddITtcclxuICAgICAgICBsZXQgbGlzdCAgICA9IFJBRy5zdGF0ZS5nZXRTdGF0aW9uTGlzdChjdHgpO1xyXG4gICAgICAgIGxldCBpbmZsZWN0ID0gdGhpcy5nZXRJbmZsZWN0aW9uKGlkeCk7XHJcblxyXG4gICAgICAgIGxldCBwYXJ0cyA6IFZveEtleVtdID0gWzAuMl07XHJcblxyXG4gICAgICAgIGxpc3QuZm9yRWFjaCggKGNvZGUsIGspID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgdm94S2V5ID0gUkFHLmRhdGFiYXNlLmdldFN0YXRpb25Wb3goY29kZSk7XHJcblxyXG4gICAgICAgICAgICAvLyBIYW5kbGUgbWlkZGxlIG9mIGxpc3QgaW5mbGVjdGlvblxyXG4gICAgICAgICAgICBpZiAoayAhPT0gbGlzdC5sZW5ndGggLSAxKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGBzdGF0aW9uLiR7dm94S2V5fS5taWRgLCAwLjI1KTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFwiYW5kXCIgaWYgbGlzdCBoYXMgbW9yZSB0aGFuIDEgc3RhdGlvbiBhbmQgdGhpcyBpcyB0aGUgZW5kXHJcbiAgICAgICAgICAgIGlmIChsaXN0Lmxlbmd0aCA+IDEpXHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKCdzdGF0aW9uLnBhcnRzLmFuZC5taWQnLCAwLjI1KTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFkZCBcIm9ubHlcIiBpZiBvbmx5IG9uZSBzdGF0aW9uIGluIHRoZSBjYWxsaW5nIGxpc3RcclxuICAgICAgICAgICAgaWYgKGxpc3QubGVuZ3RoID09PSAxICYmIGN0eCA9PT0gJ2NhbGxpbmcnKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGBzdGF0aW9uLiR7dm94S2V5fS5taWRgKTtcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goMC4yLCAnc3RhdGlvbi5wYXJ0cy5vbmx5LmVuZCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goYHN0YXRpb24uJHt2b3hLZXl9LiR7aW5mbGVjdH1gKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgMC4yXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc29sdmVUaW1lKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA6IFZveEtleVtdXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCAgID0gZWxlbWVudC5kYXRhc2V0Wydjb250ZXh0J10hO1xyXG4gICAgICAgIGxldCB0aW1lICA9IFJBRy5zdGF0ZS5nZXRUaW1lKGN0eCkuc3BsaXQoJzonKTtcclxuXHJcbiAgICAgICAgbGV0IHBhcnRzIDogVm94S2V5W10gPSBbMC4yXTtcclxuXHJcbiAgICAgICAgaWYgKHRpbWVbMF0gPT09ICcwMCcgJiYgdGltZVsxXSA9PT0gJzAwJylcclxuICAgICAgICAgICAgcmV0dXJuIFsuLi5wYXJ0cywgJ251bWJlci4wMDAwLm1pZCcsIDAuMl07XHJcblxyXG4gICAgICAgIC8vIEhvdXJzXHJcbiAgICAgICAgcGFydHMucHVzaChgbnVtYmVyLiR7dGltZVswXX0uYmVnaW5gKTtcclxuXHJcbiAgICAgICAgaWYgKHRpbWVbMV0gPT09ICcwMCcpXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4wNzUsICdudW1iZXIuaHVuZHJlZC5taWQnKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHBhcnRzLnB1c2goMC4yLCBgbnVtYmVyLiR7dGltZVsxXX0ubWlkYCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbLi4ucGFydHMsIDAuMTVdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzb2x2ZVZveChlbGVtZW50OiBIVE1MRWxlbWVudCkgOiBWb3hLZXlbXVxyXG4gICAge1xyXG4gICAgICAgIGxldCB0ZXh0ICAgPSBlbGVtZW50LmlubmVyVGV4dC50cmltKCk7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IFtdO1xyXG5cclxuICAgICAgICBpZiAoIHRleHQuc3RhcnRzV2l0aCgnLicpIClcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2goMC42NSk7XHJcblxyXG4gICAgICAgIHJlc3VsdC5wdXNoKCBlbGVtZW50LmRhdGFzZXRbJ2tleSddISApO1xyXG5cclxuICAgICAgICBpZiAoIHRleHQuZW5kc1dpdGgoJy4nKSApXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKDAuNjUpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBzcGVlY2ggc3ludGhlc2lzIHVzaW5nIGJvdGggbmF0aXZlIGFuZCBjdXN0b20gZW5naW5lcyAqL1xyXG5jbGFzcyBTcGVlY2hcclxue1xyXG4gICAgLyoqIEluc3RhbmNlIG9mIHRoZSBjdXN0b20gdm9pY2UgZW5naW5lICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHZveEVuZ2luZT8gOiBWb3hFbmdpbmU7XHJcblxyXG4gICAgLyoqIEFycmF5IG9mIGJyb3dzZXItcHJvdmlkZWQgdm9pY2VzIGF2YWlsYWJsZSAqL1xyXG4gICAgcHVibGljICBicm93c2VyVm9pY2VzIDogU3BlZWNoU3ludGhlc2lzVm9pY2VbXSA9IFtdO1xyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGlzIGF1ZGlibHkgc3Bva2VuICovXHJcbiAgICBwdWJsaWMgIG9uc3BlYWs/ICAgICAgOiAoKSA9PiB2b2lkO1xyXG4gICAgLyoqIEV2ZW50IGhhbmRsZXIgZm9yIHdoZW4gc3BlZWNoIGhhcyBlbmRlZCAqL1xyXG4gICAgcHVibGljICBvbnN0b3A/ICAgICAgIDogKCkgPT4gdm9pZDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG5hdGl2ZSBzcGVlY2gtc3RvcHBlZCBjaGVjayB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSBzdG9wVGltZXIgICAgIDogbnVtYmVyID0gMDtcclxuXHJcbiAgICAvKiogV2hldGhlciBhbnkgc3BlZWNoIGVuZ2luZSBpcyBjdXJyZW50bHkgc3BlYWtpbmcgKi9cclxuICAgIHB1YmxpYyBnZXQgaXNTcGVha2luZygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLnZveEVuZ2luZSAmJiB0aGlzLnZveEVuZ2luZS5pc1NwZWFraW5nKVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFraW5nO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoZSBWT1ggZW5naW5lIGlzIGN1cnJlbnRseSBhdmFpbGFibGUgKi9cclxuICAgIHB1YmxpYyBnZXQgdm94QXZhaWxhYmxlKCkgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudm94RW5naW5lICE9PSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICAvLyBTb21lIGJyb3dzZXJzIGRvbid0IHByb3Blcmx5IGNhbmNlbCBzcGVlY2ggb24gcGFnZSBjbG9zZS5cclxuICAgICAgICAvLyBCVUc6IG9ucGFnZXNob3cgYW5kIG9ucGFnZWhpZGUgbm90IHdvcmtpbmcgb24gaU9TIDExXHJcbiAgICAgICAgd2luZG93Lm9uYmVmb3JldW5sb2FkID1cclxuICAgICAgICB3aW5kb3cub251bmxvYWQgICAgICAgPVxyXG4gICAgICAgIHdpbmRvdy5vbnBhZ2VzaG93ICAgICA9XHJcbiAgICAgICAgd2luZG93Lm9ucGFnZWhpZGUgICAgID0gdGhpcy5zdG9wLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIGRvY3VtZW50Lm9udmlzaWJpbGl0eWNoYW5nZSAgICAgICAgICAgID0gdGhpcy5vblZpc2liaWxpdHlDaGFuZ2UuYmluZCh0aGlzKTtcclxuICAgICAgICB3aW5kb3cuc3BlZWNoU3ludGhlc2lzLm9udm9pY2VzY2hhbmdlZCA9IHRoaXMub25Wb2ljZXNDaGFuZ2VkLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEV2ZW4gdGhvdWdoICdvbnZvaWNlc2NoYW5nZWQnIGlzIHVzZWQgbGF0ZXIgdG8gcG9wdWxhdGUgdGhlIGxpc3QsIENocm9tZSBkb2VzXHJcbiAgICAgICAgLy8gbm90IGFjdHVhbGx5IGZpcmUgdGhlIGV2ZW50IHVudGlsIHRoaXMgY2FsbC4uLlxyXG4gICAgICAgIHRoaXMub25Wb2ljZXNDaGFuZ2VkKCk7XHJcblxyXG4gICAgICAgIC8vIEZvciBzb21lIHJlYXNvbiwgQ2hyb21lIG5lZWRzIHRoaXMgY2FsbGVkIG9uY2UgZm9yIG5hdGl2ZSBzcGVlY2ggdG8gd29ya1xyXG4gICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuY2FuY2VsKCk7XHJcblxyXG4gICAgICAgIHRyeSAgICAgICAgIHsgdGhpcy52b3hFbmdpbmUgPSBuZXcgVm94RW5naW5lKCk7IH1cclxuICAgICAgICBjYXRjaCAoZXJyKSB7IGNvbnNvbGUuZXJyb3IoJ0NvdWxkIG5vdCBjcmVhdGUgVk9YIGVuZ2luZTonLCBlcnIpOyB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBzcGVha2luZyB0aGUgZ2l2ZW4gcGhyYXNlIGNvbXBvbmVudHMgKi9cclxuICAgIHB1YmxpYyBzcGVhayhwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MgPSB7fSkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIGlmICAgICAgKCB0aGlzLnZveEVuZ2luZSAmJiBlaXRoZXIoc2V0dGluZ3MudXNlVm94LCBSQUcuY29uZmlnLnZveEVuYWJsZWQpIClcclxuICAgICAgICAgICAgdGhpcy5zcGVha1ZveChwaHJhc2UsIHNldHRpbmdzKTtcclxuICAgICAgICBlbHNlIGlmICh3aW5kb3cuc3BlZWNoU3ludGhlc2lzKVxyXG4gICAgICAgICAgICB0aGlzLnNwZWFrQnJvd3NlcihwaHJhc2UsIHNldHRpbmdzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3RvcHMgYW5kIGNhbmNlbHMgYWxsIHF1ZXVlZCBzcGVlY2ggKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzU3BlYWtpbmcpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKHdpbmRvdy5zcGVlY2hTeW50aGVzaXMpXHJcbiAgICAgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMuY2FuY2VsKCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnZveEVuZ2luZSlcclxuICAgICAgICAgICAgdGhpcy52b3hFbmdpbmUuc3RvcCgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5vbnN0b3ApXHJcbiAgICAgICAgICAgIHRoaXMub25zdG9wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBhdXNlIGFuZCB1bnBhdXNlIHNwZWVjaCBpZiB0aGUgcGFnZSBpcyBoaWRkZW4gb3IgdW5oaWRkZW4gKi9cclxuICAgIHByaXZhdGUgb25WaXNpYmlsaXR5Q2hhbmdlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVE9ETzogVGhpcyBuZWVkcyB0byBwYXVzZSBWT1ggZW5naW5lXHJcbiAgICAgICAgbGV0IGhpZGluZyA9IChkb2N1bWVudC52aXNpYmlsaXR5U3RhdGUgPT09ICdoaWRkZW4nKTtcclxuXHJcbiAgICAgICAgaWYgKGhpZGluZykgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5wYXVzZSgpO1xyXG4gICAgICAgIGVsc2UgICAgICAgIHdpbmRvdy5zcGVlY2hTeW50aGVzaXMucmVzdW1lKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgYXN5bmMgdm9pY2UgbGlzdCBsb2FkaW5nIG9uIHNvbWUgYnJvd3NlcnMsIGFuZCBzZXRzIGRlZmF1bHQgKi9cclxuICAgIHByaXZhdGUgb25Wb2ljZXNDaGFuZ2VkKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5icm93c2VyVm9pY2VzID0gd2luZG93LnNwZWVjaFN5bnRoZXNpcy5nZXRWb2ljZXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbnZlcnRzIHRoZSBnaXZlbiBwaHJhc2UgdG8gdGV4dCBhbmQgc3BlYWtzIGl0IHZpYSBuYXRpdmUgYnJvd3NlciB2b2ljZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBocmFzZSBQaHJhc2UgZWxlbWVudHMgdG8gc3BlYWtcclxuICAgICAqIEBwYXJhbSBzZXR0aW5ncyBTZXR0aW5ncyB0byB1c2UgZm9yIHRoZSB2b2ljZVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNwZWFrQnJvd3NlcihwaHJhc2U6IEhUTUxFbGVtZW50LCBzZXR0aW5nczogU3BlZWNoU2V0dGluZ3MpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIFJlc2V0IHRvIGZpcnN0IHZvaWNlLCBpZiBjb25maWd1cmVkIGNob2ljZSBpcyBtaXNzaW5nXHJcbiAgICAgICAgbGV0IHZvaWNlSWR4ID0gZWl0aGVyKHNldHRpbmdzLnZvaWNlSWR4LCBSQUcuY29uZmlnLnNwZWVjaFZvaWNlKTtcclxuICAgICAgICBsZXQgdm9pY2UgICAgPSB0aGlzLmJyb3dzZXJWb2ljZXNbdm9pY2VJZHhdIHx8IHRoaXMuYnJvd3NlclZvaWNlc1swXTtcclxuXHJcbiAgICAgICAgLy8gVGhlIHBocmFzZSB0ZXh0IGlzIHNwbGl0IGludG8gc2VudGVuY2VzLCBhcyBxdWV1ZWluZyBsYXJnZSBzZW50ZW5jZXMgdGhhdCBsYXN0XHJcbiAgICAgICAgLy8gbWFueSBzZWNvbmRzIGNhbiBicmVhayBzb21lIFRUUyBlbmdpbmVzIGFuZCBicm93c2Vycy5cclxuICAgICAgICBsZXQgdGV4dCAgPSBET00uZ2V0Q2xlYW5lZFZpc2libGVUZXh0KHBocmFzZSk7XHJcbiAgICAgICAgbGV0IHBhcnRzID0gdGV4dC5zcGxpdCgvXFwuXFxzL2kpO1xyXG5cclxuICAgICAgICBwYXJ0cy5mb3JFYWNoKCAoc2VnbWVudCwgaWR4KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gQWRkIG1pc3NpbmcgZnVsbCBzdG9wIHRvIGVhY2ggc2VudGVuY2UgZXhjZXB0IHRoZSBsYXN0LCB3aGljaCBoYXMgaXRcclxuICAgICAgICAgICAgaWYgKGlkeCA8IHBhcnRzLmxlbmd0aCAtIDEpXHJcbiAgICAgICAgICAgICAgICBzZWdtZW50ICs9ICcuJztcclxuXHJcbiAgICAgICAgICAgIGxldCB1dHRlcmFuY2UgPSBuZXcgU3BlZWNoU3ludGhlc2lzVXR0ZXJhbmNlKHNlZ21lbnQpO1xyXG5cclxuICAgICAgICAgICAgdXR0ZXJhbmNlLnZvaWNlICA9IHZvaWNlO1xyXG4gICAgICAgICAgICB1dHRlcmFuY2Uudm9sdW1lID0gZWl0aGVyKHNldHRpbmdzLnZvbHVtZSwgUkFHLmNvbmZpZy5zcGVlY2hWb2wpO1xyXG4gICAgICAgICAgICB1dHRlcmFuY2UucGl0Y2ggID0gZWl0aGVyKHNldHRpbmdzLnBpdGNoLCAgUkFHLmNvbmZpZy5zcGVlY2hQaXRjaCk7XHJcbiAgICAgICAgICAgIHV0dGVyYW5jZS5yYXRlICAgPSBlaXRoZXIoc2V0dGluZ3MucmF0ZSwgICBSQUcuY29uZmlnLnNwZWVjaFJhdGUpO1xyXG5cclxuICAgICAgICAgICAgd2luZG93LnNwZWVjaFN5bnRoZXNpcy5zcGVhayh1dHRlcmFuY2UpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaXJlIGltbWVkaWF0ZWx5LiBJIGRvbid0IHRydXN0IHNwZWVjaCBldmVudHMgdG8gYmUgcmVsaWFibGU7IHNlZSBiZWxvdy5cclxuICAgICAgICBpZiAodGhpcy5vbnNwZWFrKVxyXG4gICAgICAgICAgICB0aGlzLm9uc3BlYWsoKTtcclxuXHJcbiAgICAgICAgLy8gVGhpcyBjaGVja3MgZm9yIHdoZW4gdGhlIG5hdGl2ZSBlbmdpbmUgaGFzIHN0b3BwZWQgc3BlYWtpbmcsIGFuZCBjYWxscyB0aGVcclxuICAgICAgICAvLyBvbnN0b3AgZXZlbnQgaGFuZGxlci4gSSBjb3VsZCB1c2UgU3BlZWNoU3ludGhlc2lzLm9uZW5kIGluc3RlYWQsIGJ1dCBpdCB3YXNcclxuICAgICAgICAvLyBmb3VuZCB0byBiZSB1bnJlbGlhYmxlLCBzbyBJIGhhdmUgdG8gcG9sbCB0aGUgc3BlYWtpbmcgcHJvcGVydHkgdGhpcyB3YXkuXHJcbiAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLnN0b3BUaW1lcik7XHJcblxyXG4gICAgICAgIHRoaXMuc3RvcFRpbWVyID0gc2V0SW50ZXJ2YWwoKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmICh3aW5kb3cuc3BlZWNoU3ludGhlc2lzLnNwZWFraW5nKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLnN0b3BUaW1lcik7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vbnN0b3ApXHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgICAgIH0sIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTeW50aGVzaXplcyB2b2ljZSBieSB3YWxraW5nIHRocm91Z2ggdGhlIGdpdmVuIHBocmFzZSBlbGVtZW50cywgcmVzb2x2aW5nIHBhcnRzIHRvXHJcbiAgICAgKiBzb3VuZCBmaWxlIElEcywgYW5kIGZlZWRpbmcgdGhlIGVudGlyZSBhcnJheSB0byB0aGUgdm94IGVuZ2luZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcGhyYXNlIFBocmFzZSBlbGVtZW50cyB0byBzcGVha1xyXG4gICAgICogQHBhcmFtIHNldHRpbmdzIFNldHRpbmdzIHRvIHVzZSBmb3IgdGhlIHZvaWNlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3BlYWtWb3gocGhyYXNlOiBIVE1MRWxlbWVudCwgc2V0dGluZ3M6IFNwZWVjaFNldHRpbmdzKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzb2x2ZXIgPSBuZXcgUmVzb2x2ZXIocGhyYXNlKTtcclxuICAgICAgICBsZXQgdm94UGF0aCAgPSBSQUcuY29uZmlnLnZveFBhdGggfHwgUkFHLmNvbmZpZy52b3hDdXN0b21QYXRoO1xyXG5cclxuICAgICAgICB0aGlzLnZveEVuZ2luZSEub25zcGVhayA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5vbnNwZWFrKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbnNwZWFrKCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy52b3hFbmdpbmUhLm9uc3RvcCA9ICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnZveEVuZ2luZSEub25zcGVhayA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgdGhpcy52b3hFbmdpbmUhLm9uc3RvcCAgPSB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vbnN0b3ApXHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IHNldHRpbmdzIGZyb20gY29uZmlnIGhlcmUsIHRvIGtlZXAgVk9YIGVuZ2luZSBkZWNvdXBsZWQgZnJvbSBSQUdcclxuICAgICAgICBzZXR0aW5ncy52b3hQYXRoICAgPSBlaXRoZXIoc2V0dGluZ3Mudm94UGF0aCwgICB2b3hQYXRoKTtcclxuICAgICAgICBzZXR0aW5ncy52b3hSZXZlcmIgPSBlaXRoZXIoc2V0dGluZ3Mudm94UmV2ZXJiLCBSQUcuY29uZmlnLnZveFJldmVyYik7XHJcbiAgICAgICAgc2V0dGluZ3Mudm94Q2hpbWUgID0gZWl0aGVyKHNldHRpbmdzLnZveENoaW1lLCAgUkFHLmNvbmZpZy52b3hDaGltZSk7XHJcbiAgICAgICAgc2V0dGluZ3Mudm9sdW1lICAgID0gZWl0aGVyKHNldHRpbmdzLnZvbHVtZSwgICAgUkFHLmNvbmZpZy5zcGVlY2hWb2wpO1xyXG4gICAgICAgIHNldHRpbmdzLnJhdGUgICAgICA9IGVpdGhlcihzZXR0aW5ncy5yYXRlLCAgICAgIFJBRy5jb25maWcuc3BlZWNoUmF0ZSk7XHJcblxyXG4gICAgICAgIHRoaXMudm94RW5naW5lIS5zcGVhayhyZXNvbHZlci50b1ZveCgpLCBzZXR0aW5ncyk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cblxuLyoqIFR5cGUgZGVmaW5pdGlvbiBmb3Igc3BlZWNoIGNvbmZpZyBvdmVycmlkZXMgcGFzc2VkIHRvIHRoZSBzcGVhayBtZXRob2QgKi9cbmludGVyZmFjZSBTcGVlY2hTZXR0aW5nc1xue1xuICAgIC8qKiBXaGV0aGVyIHRvIGZvcmNlIHVzZSBvZiB0aGUgVk9YIGVuZ2luZSAqL1xuICAgIHVzZVZveD8gICAgOiBib29sZWFuO1xuICAgIC8qKiBPdmVycmlkZSBhYnNvbHV0ZSBvciByZWxhdGl2ZSBVUkwgb2YgVk9YIHZvaWNlIHRvIHVzZSAqL1xuICAgIHZveFBhdGg/ICAgOiBzdHJpbmc7XG4gICAgLyoqIE92ZXJyaWRlIGNob2ljZSBvZiByZXZlcmIgdG8gdXNlICovXG4gICAgdm94UmV2ZXJiPyA6IHN0cmluZztcbiAgICAvKiogT3ZlcnJpZGUgY2hvaWNlIG9mIGNoaW1lIHRvIHVzZSAqL1xuICAgIHZveENoaW1lPyAgOiBzdHJpbmc7XG4gICAgLyoqIE92ZXJyaWRlIGNob2ljZSBvZiB2b2ljZSAqL1xuICAgIHZvaWNlSWR4PyAgOiBudW1iZXI7XG4gICAgLyoqIE92ZXJyaWRlIHZvbHVtZSBvZiB2b2ljZSAqL1xuICAgIHZvbHVtZT8gICAgOiBudW1iZXI7XG4gICAgLyoqIE92ZXJyaWRlIHBpdGNoIG9mIHZvaWNlICovXG4gICAgcGl0Y2g/ICAgICA6IG51bWJlcjtcbiAgICAvKiogT3ZlcnJpZGUgcmF0ZSBvZiB2b2ljZSAqL1xuICAgIHJhdGU/ICAgICAgOiBudW1iZXI7XG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG50eXBlIFZveEtleSA9IHN0cmluZyB8IG51bWJlcjtcclxuXHJcbi8qKiBTeW50aGVzaXplcyBzcGVlY2ggYnkgZHluYW1pY2FsbHkgbG9hZGluZyBhbmQgcGllY2luZyB0b2dldGhlciB2b2ljZSBmaWxlcyAqL1xyXG5jbGFzcyBWb3hFbmdpbmVcclxue1xyXG4gICAgLyoqIExpc3Qgb2YgaW1wdWxzZSByZXNwb25zZXMgdGhhdCBjb21lIHdpdGggUkFHICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IFJFVkVSQlMgOiBEaWN0aW9uYXJ5PHN0cmluZz4gPSB7XHJcbiAgICAgICAgJycgICAgICAgICAgICAgICAgICAgICA6ICdOb25lJyxcclxuICAgICAgICAnaXIuc3RhbGJhbnMud2F2JyAgICAgIDogJ1RoZSBMYWR5IENoYXBlbCwgU3QgQWxiYW5zIENhdGhlZHJhbCcsXHJcbiAgICAgICAgJ2lyLm1pZGRsZV90dW5uZWwud2F2JyA6ICdJbm5vY2VudCBSYWlsd2F5IFR1bm5lbCwgRWRpbmJ1cmdoJyxcclxuICAgICAgICAnaXIuZ3JhbmdlLWNlbnRyZS53YXYnIDogJ0dyYW5nZSBzdG9uZSBjaXJjbGUsIENvdW50eSBMaW1lcmljaydcclxuICAgIH07XHJcblxyXG4gICAgLyoqIFRoZSBjb3JlIGF1ZGlvIGNvbnRleHQgdGhhdCBoYW5kbGVzIGF1ZGlvIGVmZmVjdHMgYW5kIHBsYXliYWNrICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGF1ZGlvQ29udGV4dCA6IEF1ZGlvQ29udGV4dDtcclxuICAgIC8qKiBBdWRpbyBub2RlIHRoYXQgYW1wbGlmaWVzIG9yIGF0dGVudWF0ZXMgdm9pY2UgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZ2Fpbk5vZGUgICAgIDogR2Fpbk5vZGU7XHJcbiAgICAvKiogQXVkaW8gbm9kZSB0aGF0IGFwcGxpZXMgdGhlIHRhbm5veSBmaWx0ZXIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyTm9kZSAgIDogQmlxdWFkRmlsdGVyTm9kZTtcclxuICAgIC8qKiBBdWRpbyBub2RlIHRoYXQgYWRkcyBhIHJldmVyYiB0byB0aGUgdm9pY2UsIGlmIGF2YWlsYWJsZSAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSByZXZlcmJOb2RlICAgOiBDb252b2x2ZXJOb2RlO1xyXG4gICAgLyoqIENhY2hlIG9mIGltcHVsc2UgcmVzcG9uc2VzIGF1ZGlvIGRhdGEsIGZvciByZXZlcmIgKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgaW1wdWxzZXMgICAgIDogRGljdGlvbmFyeTxBdWRpb0J1ZmZlcj4gPSB7fTtcclxuICAgIC8qKiBSZWxhdGl2ZSBwYXRoIHRvIGZldGNoIGltcHVsc2UgcmVzcG9uc2UgYW5kIGNoaW1lIGZpbGVzIGZyb20gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZGF0YVBhdGggICAgIDogc3RyaW5nO1xyXG5cclxuICAgIC8qKiBFdmVudCBoYW5kbGVyIGZvciB3aGVuIHNwZWVjaCBoYXMgYXVkaWJseSBiZWd1biAqL1xyXG4gICAgcHVibGljICBvbnNwZWFrPyAgICAgICAgIDogKCkgPT4gdm9pZDtcclxuICAgIC8qKiBFdmVudCBoYW5kbGVyIGZvciB3aGVuIHNwZWVjaCBoYXMgZW5kZWQgKi9cclxuICAgIHB1YmxpYyAgb25zdG9wPyAgICAgICAgICA6ICgpID0+IHZvaWQ7XHJcbiAgICAvKiogV2hldGhlciB0aGlzIGVuZ2luZSBpcyBjdXJyZW50bHkgcnVubmluZyBhbmQgc3BlYWtpbmcgKi9cclxuICAgIHB1YmxpYyAgaXNTcGVha2luZyAgICAgICA6IGJvb2xlYW4gICAgICA9IGZhbHNlO1xyXG4gICAgLyoqIFdoZXRoZXIgdGhpcyBlbmdpbmUgaGFzIGJlZ3VuIHNwZWFraW5nIGZvciBhIGN1cnJlbnQgc3BlZWNoICovXHJcbiAgICBwcml2YXRlIGJlZ3VuU3BlYWtpbmcgICAgOiBib29sZWFuICAgICAgPSBmYWxzZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgbnVtYmVyIGZvciB0aGUgY3VycmVudCBwdW1wIHRpbWVyICovXHJcbiAgICBwcml2YXRlIHB1bXBUaW1lciAgICAgICAgOiBudW1iZXIgICAgICAgPSAwO1xyXG4gICAgLyoqIFRyYWNrcyB0aGUgYXVkaW8gY29udGV4dCdzIHdhbGwtY2xvY2sgdGltZSB0byBzY2hlZHVsZSBuZXh0IGNsaXAgKi9cclxuICAgIHByaXZhdGUgbmV4dEJlZ2luICAgICAgICA6IG51bWJlciAgICAgICA9IDA7XHJcbiAgICAvKiogUmVmZXJlbmNlcyB0byBjdXJyZW50bHkgcGVuZGluZyByZXF1ZXN0cywgYXMgYSBGSUZPIHF1ZXVlICovXHJcbiAgICBwcml2YXRlIHBlbmRpbmdSZXFzICAgICAgOiBWb3hSZXF1ZXN0W10gPSBbXTtcclxuICAgIC8qKiBSZWZlcmVuY2VzIHRvIGN1cnJlbnRseSBzY2hlZHVsZWQgYXVkaW8gYnVmZmVycyAqL1xyXG4gICAgcHJpdmF0ZSBzY2hlZHVsZWRCdWZmZXJzIDogQXVkaW9CdWZmZXJTb3VyY2VOb2RlW10gPSBbXTtcclxuICAgIC8qKiBMaXN0IG9mIHZveCBJRHMgY3VycmVudGx5IGJlaW5nIHJ1biB0aHJvdWdoICovXHJcbiAgICBwcml2YXRlIGN1cnJlbnRJZHM/ICAgICAgOiBWb3hLZXlbXTtcclxuICAgIC8qKiBTcGVlY2ggc2V0dGluZ3MgY3VycmVudGx5IGJlaW5nIHVzZWQgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFNldHRpbmdzPyA6IFNwZWVjaFNldHRpbmdzO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihkYXRhUGF0aDogc3RyaW5nID0gJ2RhdGEvdm94JylcclxuICAgIHtcclxuICAgICAgICAvLyBTZXR1cCB0aGUgY29yZSBhdWRpbyBjb250ZXh0XHJcblxyXG4gICAgICAgIC8vIEB0cy1pZ25vcmUgLSBEZWZpbmluZyB0aGVzZSBpbiBXaW5kb3cgaW50ZXJmYWNlIGRvZXMgbm90IHdvcmtcclxuICAgICAgICBsZXQgYXVkaW9Db250ZXh0ICA9IHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgd2luZG93LndlYmtpdEF1ZGlvQ29udGV4dDtcclxuICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dCA9IG5ldyBhdWRpb0NvbnRleHQoKTtcclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmF1ZGlvQ29udGV4dClcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZ2V0IGF1ZGlvIGNvbnRleHQnKTtcclxuXHJcbiAgICAgICAgLy8gU2V0dXAgbm9kZXNcclxuXHJcbiAgICAgICAgdGhpcy5kYXRhUGF0aCAgID0gZGF0YVBhdGg7XHJcbiAgICAgICAgdGhpcy5nYWluTm9kZSAgID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlR2FpbigpO1xyXG4gICAgICAgIHRoaXMuZmlsdGVyTm9kZSA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUJpcXVhZEZpbHRlcigpO1xyXG4gICAgICAgIHRoaXMucmV2ZXJiTm9kZSA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUNvbnZvbHZlcigpO1xyXG5cclxuICAgICAgICB0aGlzLnJldmVyYk5vZGUubm9ybWFsaXplID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmZpbHRlck5vZGUudHlwZSAgICAgID0gJ2hpZ2hwYXNzJztcclxuICAgICAgICB0aGlzLmZpbHRlck5vZGUuUS52YWx1ZSAgID0gMC40O1xyXG5cclxuICAgICAgICB0aGlzLmdhaW5Ob2RlLmNvbm5lY3QodGhpcy5maWx0ZXJOb2RlKTtcclxuICAgICAgICAvLyBSZXN0IG9mIG5vZGVzIGdldCBjb25uZWN0ZWQgd2hlbiBzcGVhayBpcyBjYWxsZWRcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEJlZ2lucyBsb2FkaW5nIGFuZCBzcGVha2luZyBhIHNldCBvZiB2b3ggZmlsZXMuIFN0b3BzIGFueSBzcGVlY2guXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGlkcyBMaXN0IG9mIHZveCBpZHMgdG8gbG9hZCBhcyBmaWxlcywgaW4gc3BlYWtpbmcgb3JkZXJcclxuICAgICAqIEBwYXJhbSBzZXR0aW5ncyBWb2ljZSBzZXR0aW5ncyB0byB1c2VcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNwZWFrKGlkczogVm94S2V5W10sIHNldHRpbmdzOiBTcGVlY2hTZXR0aW5ncykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFNQRUFLOicsIGlkcywgc2V0dGluZ3MpO1xyXG5cclxuICAgICAgICAvLyBTZXQgc3RhdGVcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuaXNTcGVha2luZylcclxuICAgICAgICAgICAgdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIHRoaXMuaXNTcGVha2luZyAgICAgID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmJlZ3VuU3BlYWtpbmcgICA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuY3VycmVudElkcyAgICAgID0gaWRzO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzID0gc2V0dGluZ3M7XHJcblxyXG4gICAgICAgIC8vIFNldCByZXZlcmJcclxuXHJcbiAgICAgICAgaWYgKCBTdHJpbmdzLmlzTnVsbE9yRW1wdHkoc2V0dGluZ3Mudm94UmV2ZXJiKSApXHJcbiAgICAgICAgICAgIHRoaXMudG9nZ2xlUmV2ZXJiKGZhbHNlKTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZmlsZSAgICA9IHNldHRpbmdzLnZveFJldmVyYiE7XHJcbiAgICAgICAgICAgIGxldCBpbXB1bHNlID0gdGhpcy5pbXB1bHNlc1tmaWxlXTtcclxuXHJcbiAgICAgICAgICAgIGlmICghaW1wdWxzZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgLy8gTWFrZSBzdXJlIHJldmVyYiBpcyBvZmYgZmlyc3QsIGVsc2UgY2xpcHMgd2lsbCBxdWV1ZSBpbiB0aGUgYXVkaW9cclxuICAgICAgICAgICAgICAgIC8vIGJ1ZmZlciBhbmQgYWxsIHN1ZGRlbmx5IHBsYXkgYXQgdGhlIHNhbWUgdGltZSwgd2hlbiByZXZlcmIgbG9hZHMuXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRvZ2dsZVJldmVyYihmYWxzZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZmV0Y2goYCR7dGhpcy5kYXRhUGF0aH0vJHtmaWxlfWApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIHJlcyA9PiByZXMuYXJyYXlCdWZmZXIoKSApXHJcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oIGJ1ZiA9PiBTb3VuZHMuZGVjb2RlKHRoaXMuYXVkaW9Db250ZXh0LCBidWYpIClcclxuICAgICAgICAgICAgICAgICAgICAudGhlbiggaW1wID0+XHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDYWNoZSBidWZmZXIgZm9yIGxhdGVyXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW1wdWxzZXNbZmlsZV0gICAgPSBpbXA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmV2ZXJiTm9kZS5idWZmZXIgPSBpbXA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudG9nZ2xlUmV2ZXJiKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKCdWT1ggUkVWRVJCIExPQURFRCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yZXZlcmJOb2RlLmJ1ZmZlciA9IGltcHVsc2U7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRvZ2dsZVJldmVyYih0cnVlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2V0IHZvbHVtZVxyXG5cclxuICAgICAgICBsZXQgdm9sdW1lID0gZWl0aGVyKHNldHRpbmdzLnZvbHVtZSwgMSk7XHJcblxyXG4gICAgICAgIC8vIFJlbWFwcyB0aGUgMS4xLi4uMS45IHJhbmdlIHRvIDIuLi4xMFxyXG4gICAgICAgIGlmICh2b2x1bWUgPiAxKVxyXG4gICAgICAgICAgICB2b2x1bWUgPSAodm9sdW1lICogMTApIC0gOTtcclxuXHJcbiAgICAgICAgdGhpcy5nYWluTm9kZS5nYWluLnZhbHVlID0gdm9sdW1lO1xyXG5cclxuICAgICAgICAvLyBTZXQgY2hpbWUsIGF0IGZvcmNlZCBwbGF5YmFjayByYXRlIG9mIDFcclxuXHJcbiAgICAgICAgaWYgKCAhU3RyaW5ncy5pc051bGxPckVtcHR5KHNldHRpbmdzLnZveENoaW1lKSApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcGF0aCAgICAgID0gYCR7dGhpcy5kYXRhUGF0aH0vJHtzZXR0aW5ncy52b3hDaGltZSF9YDtcclxuICAgICAgICAgICAgbGV0IHJlcSAgICAgICA9IG5ldyBWb3hSZXF1ZXN0KHBhdGgsIDAsIHRoaXMuYXVkaW9Db250ZXh0KTtcclxuICAgICAgICAgICAgcmVxLmZvcmNlUmF0ZSA9IDE7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdSZXFzLnB1c2gocmVxKTtcclxuICAgICAgICAgICAgaWRzLnVuc2hpZnQoMS4wKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEJlZ2luIHRoZSBwdW1wIGxvb3AuIE9uIGlPUywgdGhlIGNvbnRleHQgbWF5IGhhdmUgdG8gYmUgcmVzdW1lZCBmaXJzdFxyXG5cclxuICAgICAgICBpZiAodGhpcy5hdWRpb0NvbnRleHQuc3RhdGUgPT09ICdzdXNwZW5kZWQnKVxyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dC5yZXN1bWUoKS50aGVuKCAoKSA9PiB0aGlzLnB1bXAoKSApO1xyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgdGhpcy5wdW1wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0b3BzIHBsYXlpbmcgYW55IGN1cnJlbnRseSBzcG9rZW4gc3BlZWNoIGFuZCByZXNldHMgc3RhdGUgKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gQWxyZWFkeSBzdG9wcGVkPyBEbyBub3QgY29udGludWVcclxuICAgICAgICBpZiAoIXRoaXMuaXNTcGVha2luZylcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBTdG9wIHB1bXBpbmdcclxuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5wdW1wVGltZXIpO1xyXG5cclxuICAgICAgICB0aGlzLmlzU3BlYWtpbmcgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgLy8gQ2FuY2VsIGFsbCBwZW5kaW5nIHJlcXVlc3RzXHJcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVxcy5mb3JFYWNoKCByID0+IHIuY2FuY2VsKCkgKTtcclxuXHJcbiAgICAgICAgLy8gS2lsbCBhbmQgZGVyZWZlcmVuY2UgYW55IGN1cnJlbnRseSBwbGF5aW5nIGZpbGVcclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMuZm9yRWFjaChub2RlID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBub2RlLnN0b3AoKTtcclxuICAgICAgICAgICAgbm9kZS5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMubmV4dEJlZ2luICAgICAgICA9IDA7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50SWRzICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNldHRpbmdzICA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLnBlbmRpbmdSZXFzICAgICAgPSBbXTtcclxuICAgICAgICB0aGlzLnNjaGVkdWxlZEJ1ZmZlcnMgPSBbXTtcclxuXHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFNUT1BQRUQnKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25zdG9wKVxyXG4gICAgICAgICAgICB0aGlzLm9uc3RvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHVtcHMgdGhlIHNwZWVjaCBxdWV1ZSwgYnkga2VlcGluZyB1cCB0byAxMCBmZXRjaCByZXF1ZXN0cyBmb3Igdm9pY2UgZmlsZXMgZ29pbmcsXHJcbiAgICAgKiBhbmQgdGhlbiBmZWVkaW5nIHRoZWlyIGRhdGEgKGluIGVuZm9yY2VkIG9yZGVyKSB0byB0aGUgYXVkaW8gY2hhaW4sIG9uZSBhdCBhIHRpbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcHVtcCgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIC8vIElmIHRoZSBlbmdpbmUgaGFzIHN0b3BwZWQsIGRvIG5vdCBwcm9jZWVkLlxyXG4gICAgICAgIGlmICghdGhpcy5pc1NwZWFraW5nIHx8ICF0aGlzLmN1cnJlbnRJZHMgfHwgIXRoaXMuY3VycmVudFNldHRpbmdzKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZpcnN0LCBzY2hlZHVsZSBmdWxmaWxsZWQgcmVxdWVzdHMgaW50byB0aGUgYXVkaW8gYnVmZmVyLCBpbiBGSUZPIG9yZGVyXHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZSgpO1xyXG5cclxuICAgICAgICAvLyBUaGVuLCBmaWxsIGFueSBmcmVlIHBlbmRpbmcgc2xvdHMgd2l0aCBuZXcgcmVxdWVzdHNcclxuICAgICAgICBsZXQgbmV4dERlbGF5ID0gMDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRoaXMuY3VycmVudElkc1swXSAmJiB0aGlzLnBlbmRpbmdSZXFzLmxlbmd0aCA8IDEwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGtleSA9IHRoaXMuY3VycmVudElkcy5zaGlmdCgpITtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMga2V5IGlzIGEgbnVtYmVyLCBpdCdzIGFuIGFtb3VudCBvZiBzaWxlbmNlLCBzbyBhZGQgaXQgYXMgdGhlXHJcbiAgICAgICAgICAgIC8vIHBsYXliYWNrIGRlbGF5IGZvciB0aGUgbmV4dCBwbGF5YWJsZSByZXF1ZXN0IChpZiBhbnkpLlxyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGtleSA9PT0gJ251bWJlcicpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG5leHREZWxheSArPSBrZXk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbGV0IHBhdGggPSBgJHt0aGlzLmN1cnJlbnRTZXR0aW5ncy52b3hQYXRofS8ke2tleX0ubXAzYDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucGVuZGluZ1JlcXMucHVzaCggbmV3IFZveFJlcXVlc3QocGF0aCwgbmV4dERlbGF5LCB0aGlzLmF1ZGlvQ29udGV4dCkgKTtcclxuICAgICAgICAgICAgbmV4dERlbGF5ID0gMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0b3AgcHVtcGluZyB3aGVuIHdlJ3JlIG91dCBvZiBJRHMgdG8gcXVldWUgYW5kIG5vdGhpbmcgaXMgcGxheWluZ1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRJZHMubGVuZ3RoICAgICAgIDw9IDApXHJcbiAgICAgICAgaWYgKHRoaXMucGVuZGluZ1JlcXMubGVuZ3RoICAgICAgPD0gMClcclxuICAgICAgICBpZiAodGhpcy5zY2hlZHVsZWRCdWZmZXJzLmxlbmd0aCA8PSAwKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdG9wKCk7XHJcblxyXG4gICAgICAgIHRoaXMucHVtcFRpbWVyID0gc2V0VGltZW91dCh0aGlzLnB1bXAuYmluZCh0aGlzKSwgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNjaGVkdWxlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gU3RvcCBzY2hlZHVsaW5nIGlmIHRoZXJlIGFyZSBubyBwZW5kaW5nIHJlcXVlc3RzXHJcbiAgICAgICAgaWYgKCF0aGlzLnBlbmRpbmdSZXFzWzBdIHx8ICF0aGlzLnBlbmRpbmdSZXFzWzBdLmlzRG9uZSlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBEb24ndCBzY2hlZHVsZSBpZiBtb3JlIHRoYW4gNSBub2RlcyBhcmUsIGFzIG5vdCB0byBibG93IGFueSBidWZmZXJzXHJcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGVkQnVmZmVycy5sZW5ndGggPiA1KVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIGxldCByZXEgPSB0aGlzLnBlbmRpbmdSZXFzLnNoaWZ0KCkhO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgbmV4dCByZXF1ZXN0IGVycm9yZWQgb3V0IChidWZmZXIgbWlzc2luZyksIHNraXAgaXRcclxuICAgICAgICBpZiAoIXJlcS5idWZmZXIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgU0tJUFBFRDonLCByZXEucGF0aCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNjaGVkdWxlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZiB0aGlzIGlzIHRoZSBmaXJzdCBjbGlwIGJlaW5nIHBsYXllZCwgc3RhcnQgZnJvbSBjdXJyZW50IHdhbGwtY2xvY2tcclxuICAgICAgICBpZiAodGhpcy5uZXh0QmVnaW4gPT09IDApXHJcbiAgICAgICAgICAgIHRoaXMubmV4dEJlZ2luID0gdGhpcy5hdWRpb0NvbnRleHQuY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdWT1ggQ0xJUCBRVUVVRUQ6JywgcmVxLnBhdGgsIHJlcS5idWZmZXIuZHVyYXRpb24sIHRoaXMubmV4dEJlZ2luKTtcclxuXHJcbiAgICAgICAgLy8gQmFzZSBsYXRlbmN5IG5vdCBhdmFpbGFibGUgaW4gc29tZSBicm93c2Vyc1xyXG4gICAgICAgIGxldCBsYXRlbmN5ID0gKHRoaXMuYXVkaW9Db250ZXh0LmJhc2VMYXRlbmN5IHx8IDAuMDEpICsgMC4xNTtcclxuICAgICAgICBsZXQgbm9kZSAgICA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpO1xyXG4gICAgICAgIGxldCByYXRlICAgID0gcmVxLmZvcmNlUmF0ZSB8fCB0aGlzLmN1cnJlbnRTZXR0aW5ncyEucmF0ZSB8fCAxO1xyXG4gICAgICAgIG5vZGUuYnVmZmVyID0gcmVxLmJ1ZmZlcjtcclxuXHJcbiAgICAgICAgLy8gUmVtYXAgcmF0ZSBmcm9tIDAuMS4uMS45IHRvIDAuOC4uMS41XHJcbiAgICAgICAgaWYgICAgICAocmF0ZSA8IDEpIHJhdGUgPSAocmF0ZSAqIDAuMikgKyAwLjg7XHJcbiAgICAgICAgZWxzZSBpZiAocmF0ZSA+IDEpIHJhdGUgPSAocmF0ZSAqIDAuNSkgKyAwLjU7XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSBkZWxheSBhbmQgZHVyYXRpb24gYmFzZWQgb24gcGxheWJhY2sgcmF0ZVxyXG4gICAgICAgIGxldCBkZWxheSAgICA9IHJlcS5kZWxheSAqICgxIC8gcmF0ZSk7XHJcbiAgICAgICAgbGV0IGR1cmF0aW9uID0gbm9kZS5idWZmZXIuZHVyYXRpb24gKiAoMSAvIHJhdGUpO1xyXG5cclxuICAgICAgICBub2RlLnBsYXliYWNrUmF0ZS52YWx1ZSA9IHJhdGU7XHJcbiAgICAgICAgbm9kZS5jb25uZWN0KHRoaXMuZ2Fpbk5vZGUpO1xyXG4gICAgICAgIG5vZGUuc3RhcnQodGhpcy5uZXh0QmVnaW4gKyBkZWxheSk7XHJcblxyXG4gICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycy5wdXNoKG5vZGUpO1xyXG4gICAgICAgIHRoaXMubmV4dEJlZ2luICs9IChkdXJhdGlvbiArIGRlbGF5IC0gbGF0ZW5jeSk7XHJcblxyXG4gICAgICAgIC8vIEZpcmUgb24tZmlyc3Qtc3BlYWsgZXZlbnRcclxuICAgICAgICBpZiAoIXRoaXMuYmVndW5TcGVha2luZylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYmVndW5TcGVha2luZyA9IHRydWU7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vbnNwZWFrKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbnNwZWFrKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYXZlIHRoaXMgYnVmZmVyIG5vZGUgcmVtb3ZlIGl0c2VsZiBmcm9tIHRoZSBzY2hlZHVsZSB3aGVuIGRvbmVcclxuICAgICAgICBub2RlLm9uZW5kZWQgPSBfID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnVk9YIENMSVAgRU5ERUQ6JywgcmVxLnBhdGgpO1xyXG4gICAgICAgICAgICBsZXQgaWR4ID0gdGhpcy5zY2hlZHVsZWRCdWZmZXJzLmluZGV4T2Yobm9kZSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoaWR4ICE9PSAtMSlcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVkQnVmZmVycy5zcGxpY2UoaWR4LCAxKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdG9nZ2xlUmV2ZXJiKHN0YXRlOiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLnJldmVyYk5vZGUuZGlzY29ubmVjdCgpO1xyXG4gICAgICAgIHRoaXMuZmlsdGVyTm9kZS5kaXNjb25uZWN0KCk7XHJcblxyXG4gICAgICAgIGlmIChzdGF0ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyTm9kZS5jb25uZWN0KHRoaXMucmV2ZXJiTm9kZSk7XHJcbiAgICAgICAgICAgIHRoaXMucmV2ZXJiTm9kZS5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmZpbHRlck5vZGUuY29ubmVjdCh0aGlzLmF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgcmVxdWVzdCBmb3IgYSB2b3ggZmlsZSwgaW1tZWRpYXRlbHkgYmVndW4gb24gY3JlYXRpb24gKi9cclxuY2xhc3MgVm94UmVxdWVzdFxyXG57XHJcbiAgICAvKiogUmVsYXRpdmUgcmVtb3RlIHBhdGggb2YgdGhpcyB2b2ljZSBmaWxlIHJlcXVlc3QgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgcGF0aCAgICA6IHN0cmluZztcclxuICAgIC8qKiBBbW91bnQgb2Ygc2Vjb25kcyB0byBkZWxheSB0aGUgcGxheWJhY2sgb2YgdGhpcyByZXF1ZXN0ICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGRlbGF5ICAgOiBudW1iZXI7XHJcbiAgICAvKiogQXVkaW8gY29udGV4dCB0byB1c2UgZm9yIGRlY29kaW5nICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQgOiBBdWRpb0NvbnRleHQ7XHJcbiAgICAvKiogQWJvcnQgY29udHJvbGxlciB0byBhbGxvdyB0aGUgZmV0Y2ggdG8gYmUgYWJvcnRlZCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBhYm9ydCAgIDogQWJvcnRDb250cm9sbGVyO1xyXG5cclxuICAgIC8qKiBXaGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBkb25lIGFuZCByZWFkeSBmb3IgaGFuZGxpbmcgKGV2ZW4gaWYgZmFpbGVkKSAqL1xyXG4gICAgcHVibGljIGlzRG9uZSAgICAgOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKiogUmF3IGF1ZGlvIGRhdGEgZnJvbSB0aGUgbG9hZGVkIGZpbGUsIGlmIGF2YWlsYWJsZSAqL1xyXG4gICAgcHVibGljIGJ1ZmZlcj8gICAgOiBBdWRpb0J1ZmZlcjtcclxuICAgIC8qKiBQbGF5YmFjayByYXRlIHRvIGZvcmNlIHRoaXMgY2xpcCB0byBwbGF5IGF0ICovXHJcbiAgICBwdWJsaWMgZm9yY2VSYXRlPyA6IG51bWJlcjtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IocGF0aDogc3RyaW5nLCBkZWxheTogbnVtYmVyLCBjb250ZXh0OiBBdWRpb0NvbnRleHQpXHJcbiAgICB7XHJcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnVk9YIFJFUVVFU1Q6JywgcGF0aCk7XHJcbiAgICAgICAgdGhpcy5jb250ZXh0ID0gY29udGV4dDtcclxuICAgICAgICB0aGlzLnBhdGggICAgPSBwYXRoO1xyXG4gICAgICAgIHRoaXMuZGVsYXkgICA9IGRlbGF5O1xyXG4gICAgICAgIHRoaXMuYWJvcnQgICA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcclxuXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vd2ViL3VwZGF0ZXMvMjAxNy8wOS9hYm9ydGFibGUtZmV0Y2hcclxuICAgICAgICBmZXRjaChwYXRoLCB7IHNpZ25hbCA6IHRoaXMuYWJvcnQuc2lnbmFsIH0pXHJcbiAgICAgICAgICAgIC50aGVuICggdGhpcy5vbkZ1bGZpbGwuYmluZCh0aGlzKSApXHJcbiAgICAgICAgICAgIC5jYXRjaCggdGhpcy5vbkVycm9yLmJpbmQodGhpcykgICApO1xyXG5cclxuICAgICAgICAvLyBUaW1lb3V0IGFsbCBmZXRjaGVzIGJ5IDEwIHNlY29uZHNcclxuICAgICAgICBzZXRUaW1lb3V0KF8gPT4gdGhpcy5hYm9ydC5hYm9ydCgpLCAxMCAqIDEwMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYW5jZWxzIHRoaXMgcmVxdWVzdCBmcm9tIHByb2NlZWRpbmcgYW55IGZ1cnRoZXIgKi9cclxuICAgIHB1YmxpYyBjYW5jZWwoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmFib3J0LmFib3J0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEJlZ2lucyBkZWNvZGluZyB0aGUgbG9hZGVkIE1QMyB2b2ljZSBmaWxlIHRvIHJhdyBhdWRpbyBkYXRhICovXHJcbiAgICBwcml2YXRlIG9uRnVsZmlsbChyZXM6IFJlc3BvbnNlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoIXJlcy5vaylcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoYFZPWCBOT1QgRk9VTkQ6ICR7cmVzLnN0YXR1c30gQCAke3RoaXMucGF0aH1gKTtcclxuXHJcbiAgICAgICAgcmVzLmFycmF5QnVmZmVyKCkudGhlbiggdGhpcy5vbkFycmF5QnVmZmVyLmJpbmQodGhpcykgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogVGFrZXMgdGhlIGFycmF5IGJ1ZmZlciBmcm9tIHRoZSBmdWxmaWxsZWQgZmV0Y2ggYW5kIGRlY29kZXMgaXQgKi9cclxuICAgIHByaXZhdGUgb25BcnJheUJ1ZmZlcihidWZmZXI6IEFycmF5QnVmZmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBTb3VuZHMuZGVjb2RlKHRoaXMuY29udGV4dCwgYnVmZmVyKVxyXG4gICAgICAgICAgICAudGhlbiAoIHRoaXMub25EZWNvZGUuYmluZCh0aGlzKSApXHJcbiAgICAgICAgICAgIC5jYXRjaCggdGhpcy5vbkVycm9yLmJpbmQodGhpcykgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbGxlZCB3aGVuIHRoZSBmZXRjaGVkIGJ1ZmZlciBpcyBkZWNvZGVkIHN1Y2Nlc3NmdWxseSAqL1xyXG4gICAgcHJpdmF0ZSBvbkRlY29kZShidWZmZXI6IEF1ZGlvQnVmZmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmJ1ZmZlciA9IGJ1ZmZlcjtcclxuICAgICAgICB0aGlzLmlzRG9uZSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENhbGxlZCBpZiB0aGUgZmV0Y2ggb3IgZGVjb2RlIHN0YWdlcyBmYWlsICovXHJcbiAgICBwcml2YXRlIG9uRXJyb3IoZXJyOiBhbnkpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdSRVFVRVNUIEZBSUw6JywgZXJyKTtcclxuICAgICAgICB0aGlzLmlzRG9uZSA9IHRydWU7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vIFRPRE86IE1ha2UgYWxsIHZpZXdzIHVzZSB0aGlzIGNsYXNzXHJcbi8qKiBCYXNlIGNsYXNzIGZvciBhIHZpZXc7IGFueXRoaW5nIHdpdGggYSBiYXNlIERPTSBlbGVtZW50ICovXHJcbmFic3RyYWN0IGNsYXNzIFZpZXdCYXNlXHJcbntcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhpcyB2aWV3J3MgcHJpbWFyeSBET00gZWxlbWVudCAqL1xyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IGRvbSA6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8qKiBDcmVhdGVzIHRoaXMgYmFzZSB2aWV3LCBhdHRhY2hpbmcgaXQgdG8gdGhlIGVsZW1lbnQgbWF0Y2hpbmcgdGhlIGdpdmVuIHF1ZXJ5ICovXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3IoZG9tUXVlcnk6IHN0cmluZyB8IEhUTUxFbGVtZW50KVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0eXBlb2YgZG9tUXVlcnkgPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICB0aGlzLmRvbSA9IERPTS5yZXF1aXJlKGRvbVF1ZXJ5KTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuZG9tID0gZG9tUXVlcnk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhpcyB2aWV3J3MgY2hpbGQgZWxlbWVudCBtYXRjaGluZyB0aGUgZ2l2ZW4gcXVlcnkgKi9cclxuICAgIHByb3RlY3RlZCBhdHRhY2g8VCBleHRlbmRzIEhUTUxFbGVtZW50PihxdWVyeTogc3RyaW5nKSA6IFRcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gRE9NLnJlcXVpcmUocXVlcnksIHRoaXMuZG9tKTtcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vPHJlZmVyZW5jZSBwYXRoPVwidmlld0Jhc2UudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIGRpc2NsYWltZXIgc2NyZWVuICovXHJcbmNsYXNzIERpc2NsYWltZXIgZXh0ZW5kcyBWaWV3QmFzZVxyXG57XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBcImNvbnRpbnVlXCIgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0bkRpc21pc3MgOiBIVE1MQnV0dG9uRWxlbWVudCA9IHRoaXMuYXR0YWNoKCcjYnRuRGlzbWlzcycpO1xyXG5cclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIGxhc3QgZm9jdXNlZCBlbGVtZW50LCBpZiBhbnkgKi9cclxuICAgIHByaXZhdGUgbGFzdEFjdGl2ZT8gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCcjZGlzY2xhaW1lclNjcmVlbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBPcGVucyB0aGUgZGlzY2xhaW1lciBmb3IgZmlyc3QgdGltZSB1c2VycyAqL1xyXG4gICAgcHVibGljIGRpc2NsYWltKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKFJBRy5jb25maWcucmVhZERpc2NsYWltZXIpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5sYXN0QWN0aXZlICAgICAgICAgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIFJBRy52aWV3cy5tYWluLmhpZGRlbiAgID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gICAgICAgICA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuYnRuRGlzbWlzcy5vbmNsaWNrID0gdGhpcy5vbkRpc21pc3MuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmJ0bkRpc21pc3MuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUGVyc2lzdHMgdGhlIGRpc21pc3NhbCB0byBzdG9yYWdlIGFuZCByZXN0b3JlcyB0aGUgbWFpbiBzY3JlZW4gKi9cclxuICAgIHByaXZhdGUgb25EaXNtaXNzKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLmNvbmZpZy5yZWFkRGlzY2xhaW1lciA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuICAgICAgICAgICA9IHRydWU7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1haW4uaGlkZGVuICAgICA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuYnRuRGlzbWlzcy5vbmNsaWNrICAgPSBudWxsO1xyXG4gICAgICAgIFJBRy5jb25maWcuc2F2ZSgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5sYXN0QWN0aXZlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5sYXN0QWN0aXZlLmZvY3VzKCk7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEFjdGl2ZSA9IHVuZGVmaW5lZDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBDb250cm9sbGVyIGZvciB0aGUgcGhyYXNlIGVkaXRvciAqL1xyXG5jbGFzcyBFZGl0b3Jcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgRE9NIGNvbnRhaW5lciBmb3IgdGhlIGVkaXRvciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgZGlhbG9nLCBpZiBhbnkgKi9cclxuICAgIHByaXZhdGUgY3VycmVudFBpY2tlcj8gOiBQaWNrZXI7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBwaHJhc2UgZWxlbWVudCBjdXJyZW50bHkgYmVpbmcgZWRpdGVkLCBpZiBhbnkgKi9cclxuICAgIC8vIERvIG5vdCBEUlk7IG5lZWRzIHRvIGJlIHBhc3NlZCB0byB0aGUgcGlja2VyIGZvciBjbGVhbmVyIGNvZGVcclxuICAgIHByaXZhdGUgZG9tRWRpdGluZz8gICAgOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICBwdWJsaWMgY29uc3RydWN0b3IoKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZG9tID0gRE9NLnJlcXVpcmUoJyNlZGl0b3InKTtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5vbmNsaWNrID0gdGhpcy5vbkNsaWNrLmJpbmQodGhpcyk7XHJcbiAgICAgICAgd2luZG93Lm9ucmVzaXplICAgICAgID0gdGhpcy5vblJlc2l6ZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZG9tLm9uc2Nyb2xsICAgICA9IHRoaXMub25TY3JvbGwuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmRvbS50ZXh0Q29udGVudCAgPSBMLkVESVRPUl9JTklUKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcGxhY2VzIHRoZSBlZGl0b3Igd2l0aCBhIHJvb3QgcGhyYXNlc2V0IHJlZmVyZW5jZSwgYW5kIGV4cGFuZHMgaXQgaW50byBIVE1MICovXHJcbiAgICBwdWJsaWMgZ2VuZXJhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5pbm5lckhUTUwgPSAnPHBocmFzZXNldCByZWY9XCJyb290XCIgLz4nO1xyXG5cclxuICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKHRoaXMuZG9tKTtcclxuICAgICAgICB0aGlzLmF0dGFjaENvbnRyb2xzKCk7XHJcblxyXG4gICAgICAgIC8vIEZvciBzY3JvbGwtcGFzdCBwYWRkaW5nIHVuZGVyIHRoZSBwaHJhc2VcclxuICAgICAgICBsZXQgcGFkZGluZyAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICBwYWRkaW5nLmNsYXNzTmFtZSA9ICdib3R0b21QYWRkaW5nJztcclxuXHJcbiAgICAgICAgdGhpcy5kb20uYXBwZW5kQ2hpbGQocGFkZGluZyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlcHJvY2Vzc2VzIGFsbCBwaHJhc2VzZXQgZWxlbWVudHMgb2YgdGhlIGdpdmVuIHJlZiwgaWYgdGhlaXIgaW5kZXggaGFzIGNoYW5nZWQgKi9cclxuICAgIHB1YmxpYyByZWZyZXNoUGhyYXNlc2V0KHJlZjogc3RyaW5nKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBOb3RlLCB0aGlzIGNvdWxkIHBvdGVudGlhbGx5IGJ1ZyBvdXQgaWYgYSBwaHJhc2VzZXQncyBkZXNjZW5kYW50IHJlZmVyZW5jZXNcclxuICAgICAgICAvLyB0aGUgc2FtZSBwaHJhc2VzZXQgKHJlY3Vyc2lvbikuIEJ1dCB0aGlzIGlzIG9rYXkgYmVjYXVzZSBwaHJhc2VzZXRzIHNob3VsZFxyXG4gICAgICAgIC8vIG5ldmVyIGluY2x1ZGUgdGhlbXNlbHZlcywgZXZlbiBldmVudHVhbGx5LlxyXG5cclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKGBzcGFuW2RhdGEtdHlwZT1waHJhc2VzZXRdW2RhdGEtcmVmPSR7cmVmfV1gKVxyXG4gICAgICAgICAgICAuZm9yRWFjaChfID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBlbGVtZW50ICAgID0gXyBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGxldCBuZXdFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncGhyYXNlc2V0Jyk7XHJcbiAgICAgICAgICAgICAgICBsZXQgY2hhbmNlICAgICA9IGVsZW1lbnQuZGF0YXNldFsnY2hhbmNlJ107XHJcblxyXG4gICAgICAgICAgICAgICAgbmV3RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JlZicsIHJlZik7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGNoYW5jZSlcclxuICAgICAgICAgICAgICAgICAgICBuZXdFbGVtZW50LnNldEF0dHJpYnV0ZSgnY2hhbmNlJywgY2hhbmNlKTtcclxuXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50LnBhcmVudEVsZW1lbnQhLnJlcGxhY2VDaGlsZChuZXdFbGVtZW50LCBlbGVtZW50KTtcclxuICAgICAgICAgICAgICAgIFJBRy5waHJhc2VyLnByb2Nlc3MobmV3RWxlbWVudC5wYXJlbnRFbGVtZW50ISk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF0dGFjaENvbnRyb2xzKCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyBhIHN0YXRpYyBOb2RlTGlzdCBvZiBhbGwgcGhyYXNlIGVsZW1lbnRzIG9mIHRoZSBnaXZlbiBxdWVyeS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcXVlcnkgUXVlcnkgc3RyaW5nIHRvIGFkZCBvbnRvIHRoZSBgc3BhbmAgc2VsZWN0b3JcclxuICAgICAqIEByZXR1cm5zIE5vZGUgbGlzdCBvZiBhbGwgZWxlbWVudHMgbWF0Y2hpbmcgdGhlIGdpdmVuIHNwYW4gcXVlcnlcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldEVsZW1lbnRzQnlRdWVyeShxdWVyeTogc3RyaW5nKSA6IE5vZGVMaXN0XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoYHNwYW4ke3F1ZXJ5fWApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHBocmFzZSdzIHJvb3QgRE9NIGVsZW1lbnQgKi9cclxuICAgIHB1YmxpYyBnZXRQaHJhc2UoKSA6IEhUTUxFbGVtZW50XHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tLmZpcnN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHBocmFzZSBpbiB0aGUgZWRpdG9yIGFzIHRleHQsIGV4Y2x1ZGluZyB0aGUgaGlkZGVuIHBhcnRzICovXHJcbiAgICBwdWJsaWMgZ2V0VGV4dCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIERPTS5nZXRDbGVhbmVkVmlzaWJsZVRleHQodGhpcy5kb20pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgYWxsIHBocmFzZSBlbGVtZW50cyBvZiB0aGUgZ2l2ZW4gdHlwZSwgYW5kIHNldHMgdGhlaXIgdGV4dCB0byBnaXZlbiB2YWx1ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdHlwZSBPcmlnaW5hbCBYTUwgbmFtZSBvZiBlbGVtZW50cyB0byByZXBsYWNlIGNvbnRlbnRzIG9mXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgTmV3IHRleHQgZm9yIHRoZSBmb3VuZCBlbGVtZW50cyB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEVsZW1lbnRzVGV4dCh0eXBlOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZ2V0RWxlbWVudHNCeVF1ZXJ5KGBbZGF0YS10eXBlPSR7dHlwZX1dYClcclxuICAgICAgICAgICAgLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50ID0gdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDbG9zZXMgYW55IGN1cnJlbnRseSBvcGVuIGVkaXRvciBkaWFsb2dzICovXHJcbiAgICBwdWJsaWMgY2xvc2VEaWFsb2coKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIuY2xvc2UoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZG9tRWRpdGluZylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9tRWRpdGluZy5yZW1vdmVBdHRyaWJ1dGUoJ2VkaXRpbmcnKTtcclxuICAgICAgICAgICAgdGhpcy5kb21FZGl0aW5nLmNsYXNzTGlzdC5yZW1vdmUoJ2Fib3ZlJywgJ2JlbG93Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5kb21FZGl0aW5nICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDcmVhdGVzIGFuZCBhdHRhY2hlcyBVSSBjb250cm9scyBmb3IgY2VydGFpbiBwaHJhc2UgZWxlbWVudHMgKi9cclxuICAgIHByaXZhdGUgYXR0YWNoQ29udHJvbHMoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS10eXBlPXBocmFzZXNldF0nKS5mb3JFYWNoKHNwYW4gPT5cclxuICAgICAgICAgICAgUGhyYXNlc2V0QnV0dG9uLmNyZWF0ZUFuZEF0dGFjaChzcGFuKVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWNoYW5jZV0nKS5mb3JFYWNoKHNwYW4gPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIENvbGxhcHNlVG9nZ2xlLmNyZWF0ZUFuZEF0dGFjaChzcGFuKTtcclxuICAgICAgICAgICAgQ29sbGFwc2VUb2dnbGUudXBkYXRlKHNwYW4gYXMgSFRNTEVsZW1lbnQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIGEgY2xpY2sgYW55d2hlcmUgaW4gdGhlIHdpbmRvdyBkZXBlbmRpbmcgb24gdGhlIGNvbnRleHQgKi9cclxuICAgIHByaXZhdGUgb25DbGljayhldjogTW91c2VFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRhcmdldCA9IGV2LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBsZXQgdHlwZSAgID0gdGFyZ2V0ID8gdGFyZ2V0LmRhdGFzZXRbJ3R5cGUnXSAgICA6IHVuZGVmaW5lZDtcclxuICAgICAgICBsZXQgcGlja2VyID0gdHlwZSAgID8gUkFHLnZpZXdzLmdldFBpY2tlcih0eXBlKSA6IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKCF0YXJnZXQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNsb3NlRGlhbG9nKCk7XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3Mgb2YgaW5uZXIgZWxlbWVudHNcclxuICAgICAgICBpZiAoIHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2lubmVyJykgKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIElnbm9yZSBjbGlja3MgdG8gYW55IGlubmVyIGRvY3VtZW50IG9yIHVub3duZWQgZWxlbWVudFxyXG4gICAgICAgIGlmICggIWRvY3VtZW50LmJvZHkuY29udGFpbnModGFyZ2V0KSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSWdub3JlIGNsaWNrcyB0byBhbnkgZWxlbWVudCBvZiBhbHJlYWR5IG9wZW4gcGlja2Vyc1xyXG4gICAgICAgIGlmICggdGhpcy5jdXJyZW50UGlja2VyIClcclxuICAgICAgICBpZiAoIHRoaXMuY3VycmVudFBpY2tlci5kb20uY29udGFpbnModGFyZ2V0KSApXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gQ2FuY2VsIGFueSBvcGVuIGVkaXRvcnNcclxuICAgICAgICBsZXQgcHJldlRhcmdldCA9IHRoaXMuZG9tRWRpdGluZztcclxuICAgICAgICB0aGlzLmNsb3NlRGlhbG9nKCk7XHJcblxyXG4gICAgICAgIC8vIERvbid0IGhhbmRsZSBwaHJhc2Ugb3IgcGhyYXNlc2V0cyAtIG9ubHkgdmlhIHRoZWlyIGJ1dHRvbnNcclxuICAgICAgICBpZiAodHlwZSA9PT0gJ3BocmFzZScgfHwgdHlwZSA9PT0gJ3BocmFzZXNldCcpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSWYgY2xpY2tpbmcgdGhlIGVsZW1lbnQgYWxyZWFkeSBiZWluZyBlZGl0ZWQsIGRvbid0IHJlb3BlblxyXG4gICAgICAgIGlmICh0YXJnZXQgPT09IHByZXZUYXJnZXQpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgbGV0IHRvZ2dsZSAgICAgICA9IHRhcmdldC5jbG9zZXN0KCcudG9nZ2xlJykgICAgICAgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgbGV0IGNob29zZVBocmFzZSA9IHRhcmdldC5jbG9zZXN0KCcuY2hvb3NlUGhyYXNlJykgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBjb2xsYXBzaWJsZSBlbGVtZW50c1xyXG4gICAgICAgIGlmICh0b2dnbGUpXHJcbiAgICAgICAgICAgIHRoaXMudG9nZ2xlQ29sbGFwc2lhYmxlKHRvZ2dsZSk7XHJcblxyXG4gICAgICAgIC8vIFNwZWNpYWwgY2FzZSBmb3IgcGhyYXNlc2V0IGNob29zZXJcclxuICAgICAgICBlbHNlIGlmIChjaG9vc2VQaHJhc2UpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBUT0RPOiBBc3NlcnQgaGVyZT9cclxuICAgICAgICAgICAgdGFyZ2V0ID0gY2hvb3NlUGhyYXNlLnBhcmVudEVsZW1lbnQhO1xyXG4gICAgICAgICAgICBwaWNrZXIgPSBSQUcudmlld3MuZ2V0UGlja2VyKHRhcmdldC5kYXRhc2V0Wyd0eXBlJ10hKTtcclxuICAgICAgICAgICAgdGhpcy5vcGVuUGlja2VyKHRhcmdldCwgcGlja2VyKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYW5kIG9wZW4gcGlja2VyIGZvciB0aGUgdGFyZ2V0IGVsZW1lbnRcclxuICAgICAgICBlbHNlIGlmICh0eXBlICYmIHBpY2tlcilcclxuICAgICAgICAgICAgdGhpcy5vcGVuUGlja2VyKHRhcmdldCwgcGlja2VyKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogUmUtbGF5b3V0IHRoZSBjdXJyZW50bHkgb3BlbiBwaWNrZXIgb24gcmVzaXplICovXHJcbiAgICBwcml2YXRlIG9uUmVzaXplKF86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGlja2VyKVxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWNrZXIubGF5b3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFJlLWxheW91dCB0aGUgY3VycmVudGx5IG9wZW4gcGlja2VyIG9uIHNjcm9sbCAqL1xyXG4gICAgcHJpdmF0ZSBvblNjcm9sbChfOiBFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRQaWNrZXIpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gV29ya2Fyb3VuZCBmb3IgbGF5b3V0IGJlaGF2aW5nIHdlaXJkIHdoZW4gaU9TIGtleWJvYXJkIGlzIG9wZW5cclxuICAgICAgICBpZiAoRE9NLmlzTW9iaWxlKVxyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRQaWNrZXIuaGFzRm9jdXMoKSlcclxuICAgICAgICAgICAgRE9NLmJsdXJBY3RpdmUoKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyLmxheW91dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmxpcHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUsIGFuZCBwcm9wYWdhdGVzIHRoZSBuZXcgc3RhdGUgdG8gb3RoZXJcclxuICAgICAqIGNvbGxhcHNpYmxlcyBvZiB0aGUgc2FtZSByZWZlcmVuY2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHRhcmdldCBDb2xsYXBzaWJsZSBlbGVtZW50IGJlaW5nIHRvZ2dsZWRcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB0b2dnbGVDb2xsYXBzaWFibGUodGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHBhcmVudCAgICAgPSB0YXJnZXQucGFyZW50RWxlbWVudCE7XHJcbiAgICAgICAgbGV0IHJlZiAgICAgICAgPSBET00ucmVxdWlyZURhdGEocGFyZW50LCAncmVmJyk7XHJcbiAgICAgICAgbGV0IHR5cGUgICAgICAgPSBET00ucmVxdWlyZURhdGEocGFyZW50LCAndHlwZScpO1xyXG4gICAgICAgIGxldCBjb2xsYXBhc2VkID0gcGFyZW50Lmhhc0F0dHJpYnV0ZSgnY29sbGFwc2VkJyk7XHJcblxyXG4gICAgICAgIC8vIFByb3BhZ2F0ZSBuZXcgY29sbGFwc2Ugc3RhdGUgdG8gYWxsIGNvbGxhcHNpYmxlcyBvZiB0aGUgc2FtZSByZWZcclxuICAgICAgICB0aGlzLmRvbS5xdWVyeVNlbGVjdG9yQWxsKFxyXG4gICAgICAgICAgICBgc3BhbltkYXRhLXR5cGU9JHt0eXBlfV1bZGF0YS1yZWY9JHtyZWZ9XVtkYXRhLWNoYW5jZV1gXHJcbiAgICAgICAgKS5mb3JFYWNoKHNwYW4gPT5cclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgQ29sbGFwc2libGVzLnNldChzcGFuIGFzIEhUTUxFbGVtZW50LCAhY29sbGFwYXNlZCk7XHJcbiAgICAgICAgICAgICAgICBDb2xsYXBzZVRvZ2dsZS51cGRhdGUoc3BhbiBhcyBIVE1MRWxlbWVudCk7XHJcbiAgICAgICAgICAgICAgICAvLyBEb24ndCBtb3ZlIHRoaXMgdG8gQ29sbGFwc2libGVzLnNldCwgYXMgc3RhdGUgc2F2ZS9sb2FkIGlzIGhhbmRsZWRcclxuICAgICAgICAgICAgICAgIC8vIG91dHNpZGUgaW4gYm90aCB1c2FnZXMgb2Ygc2V0Q29sbGFwc2libGUuXHJcbiAgICAgICAgICAgICAgICBSQUcuc3RhdGUuc2V0Q29sbGFwc2VkKHJlZiwgIWNvbGxhcGFzZWQpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE9wZW5zIGEgcGlja2VyIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVkaXRvciBlbGVtZW50IHRvIG9wZW4gdGhlIHBpY2tlciBmb3JcclxuICAgICAqIEBwYXJhbSBwaWNrZXIgUGlja2VyIHRvIG9wZW5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvcGVuUGlja2VyKHRhcmdldDogSFRNTEVsZW1lbnQsIHBpY2tlcjogUGlja2VyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0YXJnZXQuc2V0QXR0cmlidXRlKCdlZGl0aW5nJywgJ3RydWUnKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGlja2VyID0gcGlja2VyO1xyXG4gICAgICAgIHRoaXMuZG9tRWRpdGluZyAgICA9IHRhcmdldDtcclxuICAgICAgICBwaWNrZXIub3Blbih0YXJnZXQpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNjcm9sbGluZyBtYXJxdWVlICovXHJcbmNsYXNzIE1hcnF1ZWVcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFycXVlZSdzIERPTSBlbGVtZW50ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbSAgICAgOiBIVE1MRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNwYW4gZWxlbWVudCBpbiB0aGUgbWFycXVlZSwgd2hlcmUgdGhlIHRleHQgaXMgc2V0ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvbVNwYW4gOiBIVE1MRWxlbWVudDtcclxuXHJcbiAgICAvKiogUmVmZXJlbmNlIElEIGZvciB0aGUgc2Nyb2xsaW5nIGFuaW1hdGlvbiB0aW1lciAqL1xyXG4gICAgcHJpdmF0ZSB0aW1lciAgOiBudW1iZXIgPSAwO1xyXG4gICAgLyoqIEN1cnJlbnQgb2Zmc2V0IChpbiBwaXhlbHMpIG9mIHRoZSBzY3JvbGxpbmcgbWFycXVlZSAqL1xyXG4gICAgcHJpdmF0ZSBvZmZzZXQgOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgID0gRE9NLnJlcXVpcmUoJyNtYXJxdWVlJyk7XHJcbiAgICAgICAgdGhpcy5kb21TcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG5cclxuICAgICAgICB0aGlzLmRvbS5pbm5lckhUTUwgPSAnJztcclxuICAgICAgICB0aGlzLmRvbS5hcHBlbmRDaGlsZCh0aGlzLmRvbVNwYW4pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBtZXNzYWdlIG9uIHRoZSBzY3JvbGxpbmcgbWFycXVlZSwgYW5kIHN0YXJ0cyBhbmltYXRpbmcgaXQgKi9cclxuICAgIHB1YmxpYyBzZXQobXNnOiBzdHJpbmcsIGFuaW1hdGU6IGJvb2xlYW4gPSB0cnVlKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy50aW1lcik7XHJcblxyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi50ZXh0Q29udGVudCAgICAgPSBtc2c7XHJcbiAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xyXG5cclxuICAgICAgICBpZiAoIWFuaW1hdGUpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSSB0cmllZCB0byB1c2UgQ1NTIGFuaW1hdGlvbiBmb3IgdGhpcywgYnV0IGNvdWxkbid0IGZpZ3VyZSBvdXQgaG93IGZvciBhXHJcbiAgICAgICAgLy8gZHluYW1pY2FsbHkgc2l6ZWQgZWxlbWVudCBsaWtlIHRoZSBzcGFuLlxyXG4gICAgICAgIHRoaXMub2Zmc2V0ID0gdGhpcy5kb20uY2xpZW50V2lkdGg7XHJcbiAgICAgICAgbGV0IGxpbWl0ICAgPSAtdGhpcy5kb21TcGFuLmNsaWVudFdpZHRoIC0gMTAwO1xyXG4gICAgICAgIGxldCBhbmltICAgID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMub2Zmc2V0ICAgICAgICAgICAgICAgICAgLT0gNjtcclxuICAgICAgICAgICAgdGhpcy5kb21TcGFuLnN0eWxlLnRyYW5zZm9ybSAgPSBgdHJhbnNsYXRlWCgke3RoaXMub2Zmc2V0fXB4KWA7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5vZmZzZXQgPCBsaW1pdClcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhpcy50aW1lciA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3RvcHMgdGhlIGN1cnJlbnQgbWFycXVlZSBhbmltYXRpb24gKi9cclxuICAgIHB1YmxpYyBzdG9wKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMudGltZXIpO1xyXG4gICAgICAgIHRoaXMuZG9tU3Bhbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcclxuICAgIH1cclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vPHJlZmVyZW5jZSBwYXRoPVwidmlld0Jhc2UudHNcIi8+XHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG5jbGFzcyBTZXR0aW5ncyBleHRlbmRzIFZpZXdCYXNlXHJcbntcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuUmVzZXQgICAgICAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxCdXR0b25FbGVtZW50PiAoJyNidG5SZXNldFNldHRpbmdzJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blNhdmUgICAgICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MQnV0dG9uRWxlbWVudD4gKCcjYnRuU2F2ZVNldHRpbmdzJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNoa1VzZVZveCAgICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjY2hrVXNlVm94Jyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGhpbnRVc2VWb3ggICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MRWxlbWVudD4gICAgICAgKCcjaGludFVzZVZveCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzZWxWb3hWb2ljZSAgICAgID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTFNlbGVjdEVsZW1lbnQ+ICgnI3NlbFZveFZvaWNlJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGlucHV0Vm94UGF0aCAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MSW5wdXRFbGVtZW50PiAgKCcjaW5wdXRWb3hQYXRoJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlbFZveFJldmVyYiAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsVm94UmV2ZXJiJyk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNlbFZveENoaW1lICAgICAgPVxyXG4gICAgICAgIHRoaXMuYXR0YWNoIDxIVE1MU2VsZWN0RWxlbWVudD4gKCcjc2VsVm94Q2hpbWUnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2VsU3BlZWNoVm9pY2UgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxTZWxlY3RFbGVtZW50PiAoJyNzZWxTcGVlY2hDaG9pY2UnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hWb2wgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNyYW5nZVNwZWVjaFZvbCcpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSByYW5nZVNwZWVjaFBpdGNoID1cclxuICAgICAgICB0aGlzLmF0dGFjaCA8SFRNTElucHV0RWxlbWVudD4gICgnI3JhbmdlU3BlZWNoUGl0Y2gnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2VTcGVlY2hSYXRlICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxJbnB1dEVsZW1lbnQ+ICAoJyNyYW5nZVNwZWVjaFJhdGUnKTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuU3BlZWNoVGVzdCAgICA9XHJcbiAgICAgICAgdGhpcy5hdHRhY2ggPEhUTUxCdXR0b25FbGVtZW50PiAoJyNidG5TcGVlY2hUZXN0Jyk7XHJcblxyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgdGltZXIgZm9yIHRoZSBcIlJlc2V0XCIgYnV0dG9uIGNvbmZpcm1hdGlvbiBzdGVwICovXHJcbiAgICBwcml2YXRlIHJlc2V0VGltZW91dD8gOiBudW1iZXI7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICBzdXBlcignI3NldHRpbmdzU2NyZWVuJyk7XHJcbiAgICAgICAgLy8gVE9ETzogQ2hlY2sgaWYgVk9YIGlzIGF2YWlsYWJsZSwgZGlzYWJsZSBpZiBub3RcclxuXHJcbiAgICAgICAgdGhpcy5idG5SZXNldC5vbmNsaWNrICAgICAgPSB0aGlzLmhhbmRsZVJlc2V0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5TYXZlLm9uY2xpY2sgICAgICAgPSB0aGlzLmhhbmRsZVNhdmUuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLmNoa1VzZVZveC5vbmNoYW5nZSAgICA9IHRoaXMubGF5b3V0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5zZWxWb3hWb2ljZS5vbmNoYW5nZSAgPSB0aGlzLmxheW91dC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5vbmNsaWNrID0gdGhpcy5oYW5kbGVWb2ljZVRlc3QuYmluZCh0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gUG9wdWxhdGUgbGlzdCBvZiBpbXB1bHNlIHJlc3BvbnNlIGZpbGVzXHJcbiAgICAgICAgRE9NLnBvcHVsYXRlKHRoaXMuc2VsVm94UmV2ZXJiLCBWb3hFbmdpbmUuUkVWRVJCUywgUkFHLmNvbmZpZy52b3hSZXZlcmIpO1xyXG5cclxuICAgICAgICAvLyBQb3B1bGF0ZSB0aGUgbGVnYWwgJiBhY2tub3dsZWRnZW1lbnRzIGJsb2NrXHJcbiAgICAgICAgTGlua2Rvd24ubG9hZEludG8oJ0FCT1VULm1kJywgJyNhYm91dEJsb2NrJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIE9wZW5zIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyBvcGVuKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgLy8gVGhlIHZvaWNlIGxpc3QgaGFzIHRvIGJlIHBvcHVsYXRlZCBlYWNoIG9wZW4sIGluIGNhc2UgaXQgY2hhbmdlc1xyXG4gICAgICAgIHRoaXMucG9wdWxhdGVWb2ljZUxpc3QoKTtcclxuXHJcbiAgICAgICAgaWYgKCFSQUcuc3BlZWNoLnZveEF2YWlsYWJsZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIFRPRE8gOiBMb2NhbGl6ZVxyXG4gICAgICAgICAgICB0aGlzLmNoa1VzZVZveC5jaGVja2VkICAgID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuY2hrVXNlVm94LmRpc2FibGVkICAgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLmhpbnRVc2VWb3guaW5uZXJIVE1MID0gJzxzdHJvbmc+Vk9YIGVuZ2luZTwvc3Ryb25nPiBpcyB1bmF2YWlsYWJsZS4nICtcclxuICAgICAgICAgICAgICAgICcgWW91ciBicm93c2VyIG9yIGRldmljZSBtYXkgbm90IGJlIHN1cHBvcnRlZDsgcGxlYXNlIGNoZWNrIHRoZSBjb25zb2xlJyArXHJcbiAgICAgICAgICAgICAgICAnIGZvciBtb3JlIGluZm9ybWF0aW9uLidcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB0aGlzLmNoa1VzZVZveC5jaGVja2VkID0gUkFHLmNvbmZpZy52b3hFbmFibGVkO1xyXG5cclxuICAgICAgICB0aGlzLnNlbFZveFZvaWNlLnZhbHVlICAgICAgICAgICAgICA9IFJBRy5jb25maWcudm94UGF0aDtcclxuICAgICAgICB0aGlzLmlucHV0Vm94UGF0aC52YWx1ZSAgICAgICAgICAgICA9IFJBRy5jb25maWcudm94Q3VzdG9tUGF0aDtcclxuICAgICAgICB0aGlzLnNlbFZveFJldmVyYi52YWx1ZSAgICAgICAgICAgICA9IFJBRy5jb25maWcudm94UmV2ZXJiO1xyXG4gICAgICAgIHRoaXMuc2VsVm94Q2hpbWUudmFsdWUgICAgICAgICAgICAgID0gUkFHLmNvbmZpZy52b3hDaGltZTtcclxuICAgICAgICB0aGlzLnNlbFNwZWVjaFZvaWNlLnNlbGVjdGVkSW5kZXggICA9IFJBRy5jb25maWcuc3BlZWNoVm9pY2U7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZUFzTnVtYmVyICAgPSBSQUcuY29uZmlnLnNwZWVjaFZvbDtcclxuICAgICAgICB0aGlzLnJhbmdlU3BlZWNoUGl0Y2gudmFsdWVBc051bWJlciA9IFJBRy5jb25maWcuc3BlZWNoUGl0Y2g7XHJcbiAgICAgICAgdGhpcy5yYW5nZVNwZWVjaFJhdGUudmFsdWVBc051bWJlciAgPSBSQUcuY29uZmlnLnNwZWVjaFJhdGU7XHJcblxyXG4gICAgICAgIHRoaXMubGF5b3V0KCk7XHJcbiAgICAgICAgdGhpcy5kb20uaGlkZGVuICAgICAgID0gZmFsc2U7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1haW4uaGlkZGVuID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmJ0blNhdmUuZm9jdXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogQ2xvc2VzIHRoZSBzZXR0aW5ncyBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyBjbG9zZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuY2FuY2VsUmVzZXQoKTtcclxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcclxuICAgICAgICBSQUcudmlld3MubWFpbi5oaWRkZW4gPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmRvbS5oaWRkZW4gICAgICAgPSB0cnVlO1xyXG4gICAgICAgIFJBRy52aWV3cy50b29sYmFyLmJ0bk9wdGlvbi5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYWxjdWxhdGVzIGZvcm0gbGF5b3V0IGFuZCBjb250cm9sIHZpc2liaWxpdHkgYmFzZWQgb24gc3RhdGUgKi9cclxuICAgIHByaXZhdGUgbGF5b3V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHZveEVuYWJsZWQgPSB0aGlzLmNoa1VzZVZveC5jaGVja2VkO1xyXG4gICAgICAgIGxldCB2b3hDdXN0b20gID0gKHRoaXMuc2VsVm94Vm9pY2UudmFsdWUgPT09ICcnKTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTWlncmF0ZSBhbGwgb2YgUkFHIHRvIHVzZSBoaWRkZW4gYXR0cmlidXRlcyBpbnN0ZWFkLCBmb3Igc2NyZWVuIHJlYWRlcnNcclxuICAgICAgICBET00udG9nZ2xlSGlkZGVuQWxsKFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxTcGVlY2hWb2ljZSwgICAhdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLnJhbmdlU3BlZWNoUGl0Y2gsICF2b3hFbmFibGVkXSxcclxuICAgICAgICAgICAgW3RoaXMuc2VsVm94Vm9pY2UsICAgICAgIHZveEVuYWJsZWRdLFxyXG4gICAgICAgICAgICBbdGhpcy5pbnB1dFZveFBhdGgsICAgICAgdm94RW5hYmxlZCAmJiB2b3hDdXN0b21dLFxyXG4gICAgICAgICAgICBbdGhpcy5zZWxWb3hSZXZlcmIsICAgICAgdm94RW5hYmxlZF0sXHJcbiAgICAgICAgICAgIFt0aGlzLnNlbFZveENoaW1lLCAgICAgICB2b3hFbmFibGVkXVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFycyBhbmQgcG9wdWxhdGVzIHRoZSB2b2ljZSBsaXN0ICovXHJcbiAgICBwcml2YXRlIHBvcHVsYXRlVm9pY2VMaXN0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5zZWxTcGVlY2hWb2ljZS5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgICAgICAgbGV0IHZvaWNlcyA9IFJBRy5zcGVlY2guYnJvd3NlclZvaWNlcztcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGxpc3RcclxuICAgICAgICBpZiAodm9pY2VzLmxlbmd0aCA8PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IG9wdGlvbiAgICAgID0gRE9NLmFkZE9wdGlvbiggdGhpcy5zZWxTcGVlY2hWb2ljZSwgTC5TVF9TUEVFQ0hfRU1QVFkoKSApO1xyXG4gICAgICAgICAgICBvcHRpb24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvU3BlZWNoU3ludGhlc2lzXHJcbiAgICAgICAgZWxzZSBmb3IgKGxldCBpID0gMDsgaSA8IHZvaWNlcy5sZW5ndGggOyBpKyspXHJcbiAgICAgICAgICAgIERPTS5hZGRPcHRpb24odGhpcy5zZWxTcGVlY2hWb2ljZSwgYCR7dm9pY2VzW2ldLm5hbWV9ICgke3ZvaWNlc1tpXS5sYW5nfSlgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgcmVzZXQgYnV0dG9uLCB3aXRoIGEgY29uZmlybSBzdGVwIHRoYXQgY2FuY2VscyBhZnRlciAxNSBzZWNvbmRzICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVJlc2V0KCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnJlc2V0VGltZW91dClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMucmVzZXRUaW1lb3V0ICAgICAgID0gc2V0VGltZW91dCh0aGlzLmNhbmNlbFJlc2V0LmJpbmQodGhpcyksIDE1MDAwKTtcclxuICAgICAgICAgICAgdGhpcy5idG5SZXNldC5pbm5lclRleHQgPSBMLlNUX1JFU0VUX0NPTkZJUk0oKTtcclxuICAgICAgICAgICAgdGhpcy5idG5SZXNldC50aXRsZSAgICAgPSBMLlNUX1JFU0VUX0NPTkZJUk1fVCgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBSQUcuY29uZmlnLnJlc2V0KCk7XHJcbiAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxSZXNldCgpO1xyXG4gICAgICAgIHRoaXMub3BlbigpO1xyXG4gICAgICAgIGFsZXJ0KCBMLlNUX1JFU0VUX0RPTkUoKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBDYW5jZWwgdGhlIHJlc2V0IHRpbWVvdXQgYW5kIHJlc3RvcmUgdGhlIHJlc2V0IGJ1dHRvbiB0byBub3JtYWwgKi9cclxuICAgIHByaXZhdGUgY2FuY2VsUmVzZXQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMucmVzZXRUaW1lb3V0KTtcclxuICAgICAgICB0aGlzLmJ0blJlc2V0LmlubmVyVGV4dCA9IEwuU1RfUkVTRVQoKTtcclxuICAgICAgICB0aGlzLmJ0blJlc2V0LnRpdGxlICAgICA9IEwuU1RfUkVTRVRfVCgpO1xyXG4gICAgICAgIHRoaXMucmVzZXRUaW1lb3V0ICAgICAgID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzYXZlIGJ1dHRvbiwgc2F2aW5nIGNvbmZpZyB0byBzdG9yYWdlICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVNhdmUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuY29uZmlnLnZveEVuYWJsZWQgICAgPSB0aGlzLmNoa1VzZVZveC5jaGVja2VkO1xyXG4gICAgICAgIFJBRy5jb25maWcudm94UGF0aCAgICAgICA9IHRoaXMuc2VsVm94Vm9pY2UudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hDdXN0b21QYXRoID0gdGhpcy5pbnB1dFZveFBhdGgudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hSZXZlcmIgICAgID0gdGhpcy5zZWxWb3hSZXZlcmIudmFsdWU7XHJcbiAgICAgICAgUkFHLmNvbmZpZy52b3hDaGltZSAgICAgID0gdGhpcy5zZWxWb3hDaGltZS52YWx1ZTtcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFZvaWNlICAgPSB0aGlzLnNlbFNwZWVjaFZvaWNlLnNlbGVjdGVkSW5kZXg7XHJcbiAgICAgICAgLy8gcGFyc2VGbG9hdCBpbnN0ZWFkIG9mIHZhbHVlQXNOdW1iZXI7IHNlZSBBcmNoaXRlY3R1cmUubWRcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFZvbCAgICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hWb2wudmFsdWUpO1xyXG4gICAgICAgIFJBRy5jb25maWcuc3BlZWNoUGl0Y2ggICA9IHBhcnNlRmxvYXQodGhpcy5yYW5nZVNwZWVjaFBpdGNoLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNwZWVjaFJhdGUgICAgPSBwYXJzZUZsb2F0KHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlKTtcclxuICAgICAgICBSQUcuY29uZmlnLnNhdmUoKTtcclxuICAgICAgICB0aGlzLmNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIHNwZWVjaCB0ZXN0IGJ1dHRvbiwgc3BlYWtpbmcgYSB0ZXN0IHBocmFzZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVWb2ljZVRlc3QoZXY6IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEhhcyB0byBleGVjdXRlIG9uIGEgZGVsYXksIGFzIHNwZWVjaCBjYW5jZWwgaXMgdW5yZWxpYWJsZSB3aXRob3V0IGl0XHJcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuU3BlZWNoVGVzdC5kaXNhYmxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgbGV0IHBocmFzZSAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBwaHJhc2UuaW5uZXJIVE1MID0gJzxwaHJhc2UgcmVmPVwic2FtcGxlXCIvPic7XHJcblxyXG4gICAgICAgICAgICBSQUcucGhyYXNlci5wcm9jZXNzKHBocmFzZSk7XHJcblxyXG4gICAgICAgICAgICBSQUcuc3BlZWNoLnNwZWFrKFxyXG4gICAgICAgICAgICAgICAgcGhyYXNlLmZpcnN0RWxlbWVudENoaWxkISBhcyBIVE1MRWxlbWVudCxcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICB1c2VWb3ggICAgOiB0aGlzLmNoa1VzZVZveC5jaGVja2VkLFxyXG4gICAgICAgICAgICAgICAgICAgIHZveFBhdGggICA6IHRoaXMuc2VsVm94Vm9pY2UudmFsdWUgfHwgdGhpcy5pbnB1dFZveFBhdGgudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdm94UmV2ZXJiIDogdGhpcy5zZWxWb3hSZXZlcmIudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdm94Q2hpbWUgIDogdGhpcy5zZWxWb3hDaGltZS52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICB2b2ljZUlkeCAgOiB0aGlzLnNlbFNwZWVjaFZvaWNlLnNlbGVjdGVkSW5kZXgsXHJcbiAgICAgICAgICAgICAgICAgICAgdm9sdW1lICAgIDogdGhpcy5yYW5nZVNwZWVjaFZvbC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHBpdGNoICAgICA6IHRoaXMucmFuZ2VTcGVlY2hQaXRjaC52YWx1ZUFzTnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHJhdGUgICAgICA6IHRoaXMucmFuZ2VTcGVlY2hSYXRlLnZhbHVlQXNOdW1iZXJcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9LCAyMDApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQ29udHJvbGxlciBmb3IgdGhlIHRvcCB0b29sYmFyICovXHJcbmNsYXNzIFRvb2xiYXJcclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgY29udGFpbmVyIGZvciB0aGUgdG9vbGJhciAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb20gICAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgcGxheSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuUGxheSAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHN0b3AgYnV0dG9uICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ0blN0b3AgICAgIDogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICAvKiogUmVmZXJlbmNlIHRvIHRoZSBnZW5lcmF0ZSByYW5kb20gcGhyYXNlIGJ1dHRvbiAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBidG5HZW5lcmF0ZSA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgc2F2ZSBzdGF0ZSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuU2F2ZSAgICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHJlY2FsbCBzdGF0ZSBidXR0b24gKi9cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgYnRuUmVjYWxsICAgOiBIVE1MQnV0dG9uRWxlbWVudDtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIHNldHRpbmdzIGJ1dHRvbiAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBidG5PcHRpb24gICA6IEhUTUxCdXR0b25FbGVtZW50O1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5kb20gICAgICAgICA9IERPTS5yZXF1aXJlKCcjdG9vbGJhcicpO1xyXG4gICAgICAgIHRoaXMuYnRuUGxheSAgICAgPSBET00ucmVxdWlyZSgnI2J0blBsYXknKTtcclxuICAgICAgICB0aGlzLmJ0blN0b3AgICAgID0gRE9NLnJlcXVpcmUoJyNidG5TdG9wJyk7XHJcbiAgICAgICAgdGhpcy5idG5HZW5lcmF0ZSA9IERPTS5yZXF1aXJlKCcjYnRuU2h1ZmZsZScpO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZSAgICAgPSBET00ucmVxdWlyZSgnI2J0blNhdmUnKTtcclxuICAgICAgICB0aGlzLmJ0blJlY2FsbCAgID0gRE9NLnJlcXVpcmUoJyNidG5Mb2FkJyk7XHJcbiAgICAgICAgdGhpcy5idG5PcHRpb24gICA9IERPTS5yZXF1aXJlKCcjYnRuU2V0dGluZ3MnKTtcclxuXHJcbiAgICAgICAgdGhpcy5idG5QbGF5Lm9uY2xpY2sgICAgID0gdGhpcy5oYW5kbGVQbGF5LmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5TdG9wLm9uY2xpY2sgICAgID0gdGhpcy5oYW5kbGVTdG9wLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5idG5HZW5lcmF0ZS5vbmNsaWNrID0gdGhpcy5oYW5kbGVHZW5lcmF0ZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuU2F2ZS5vbmNsaWNrICAgICA9IHRoaXMuaGFuZGxlU2F2ZS5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuUmVjYWxsLm9uY2xpY2sgICA9IHRoaXMuaGFuZGxlTG9hZC5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMuYnRuT3B0aW9uLm9uY2xpY2sgICA9IHRoaXMuaGFuZGxlT3B0aW9uLmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEFkZCB0aHJvYiBjbGFzcyBpZiB0aGUgZ2VuZXJhdGUgYnV0dG9uIGhhc24ndCBiZWVuIGNsaWNrZWQgYmVmb3JlXHJcbiAgICAgICAgaWYgKCFSQUcuY29uZmlnLmNsaWNrZWRHZW5lcmF0ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuYnRuR2VuZXJhdGUuY2xhc3NMaXN0LmFkZCgndGhyb2InKTtcclxuICAgICAgICAgICAgdGhpcy5idG5HZW5lcmF0ZS5mb2N1cygpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHRoaXMuYnRuUGxheS5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBwbGF5IGJ1dHRvbiwgcGxheWluZyB0aGUgZWRpdG9yJ3MgY3VycmVudCBwaHJhc2Ugd2l0aCBzcGVlY2ggKi9cclxuICAgIHByaXZhdGUgaGFuZGxlUGxheSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zcGVlY2guc3RvcCgpO1xyXG4gICAgICAgIHRoaXMuYnRuUGxheS5kaXNhYmxlZCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEhhcyB0byBleGVjdXRlIG9uIGEgZGVsYXksIG90aGVyd2lzZSBuYXRpdmUgc3BlZWNoIGNhbmNlbCBiZWNvbWVzIHVucmVsaWFibGVcclxuICAgICAgICB3aW5kb3cuc2V0VGltZW91dCh0aGlzLmhhbmRsZVBsYXkyLmJpbmQodGhpcyksIDIwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENvbnRpbnVhdGlvbiBvZiBoYW5kbGVQbGF5LCBleGVjdXRlZCBhZnRlciBhIGRlbGF5ICovXHJcbiAgICBwcml2YXRlIGhhbmRsZVBsYXkyKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGhhc1Nwb2tlbiAgICAgICAgID0gZmFsc2U7XHJcbiAgICAgICAgbGV0IHNwZWVjaFRleHQgICAgICAgID0gUkFHLnZpZXdzLmVkaXRvci5nZXRUZXh0KCk7XHJcbiAgICAgICAgdGhpcy5idG5QbGF5LmhpZGRlbiAgID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmJ0blBsYXkuZGlzYWJsZWQgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmJ0blN0b3AuaGlkZGVuICAgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogTG9jYWxpemVcclxuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoJ0xvYWRpbmcgVk9YLi4uJywgZmFsc2UpO1xyXG5cclxuICAgICAgICAvLyBJZiBzcGVlY2ggdGFrZXMgdG9vIGxvbmcgKDEwIHNlY29uZHMpIHRvIGxvYWQsIGNhbmNlbCBpdFxyXG4gICAgICAgIGxldCB0aW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcclxuICAgICAgICAgICAgUkFHLnNwZWVjaC5zdG9wKCk7XHJcbiAgICAgICAgfSwgMTAgKiAxMDAwKTtcclxuXHJcbiAgICAgICAgUkFHLnNwZWVjaC5vbnNwZWFrID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcclxuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KHNwZWVjaFRleHQpO1xyXG5cclxuICAgICAgICAgICAgaGFzU3Bva2VuICAgICAgICAgID0gdHJ1ZTtcclxuICAgICAgICAgICAgUkFHLnNwZWVjaC5vbnNwZWFrID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIFJBRy5zcGVlY2gub25zdG9wID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcclxuICAgICAgICAgICAgdGhpcy5oYW5kbGVTdG9wKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBhbnl0aGluZyB3YXMgYWN0dWFsbHkgc3Bva2VuLiBJZiBub3QsIHNvbWV0aGluZyB3ZW50IHdyb25nLlxyXG4gICAgICAgICAgICBpZiAoIWhhc1Nwb2tlbiAmJiBSQUcuY29uZmlnLnZveEVuYWJsZWQpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIFJBRy5jb25maWcudm94RW5hYmxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFRPRE86IExvY2FsaXplXHJcbiAgICAgICAgICAgICAgICBhbGVydChcclxuICAgICAgICAgICAgICAgICAgICAnSXQgYXBwZWFycyB0aGF0IHRoZSBWT1ggZW5naW5lIHdhcyB1bmFibGUgdG8gc2F5IGFueXRoaW5nLicgICArXHJcbiAgICAgICAgICAgICAgICAgICAgJyBFaXRoZXIgdGhlIGN1cnJlbnQgdm9pY2UgcGF0aCBpcyB1bnJlYWNoYWJsZSwgb3IgdGhlIGVuZ2luZScgK1xyXG4gICAgICAgICAgICAgICAgICAgICcgY3Jhc2hlZC4gUGxlYXNlIGNoZWNrIHRoZSBjb25zb2xlLiBUaGUgVk9YIGVuZ2luZSBoYXMgYmVlbicgICtcclxuICAgICAgICAgICAgICAgICAgICAnIGRpc2FibGVkIGFuZCBuYXRpdmUgdGV4dC10by1zcGVlY2ggd2lsbCBiZSB1c2VkIG9uIG5leHQgcGxheS4nXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKCFoYXNTcG9rZW4pXHJcbiAgICAgICAgICAgICAgICBhbGVydChcclxuICAgICAgICAgICAgICAgICAgICAnSXQgYXBwZWFycyB0aGF0IHRoZSBicm93c2VyIHdhcyB1bmFibGUgdG8gc2F5IGFueXRoaW5nLicgICAgICAgICtcclxuICAgICAgICAgICAgICAgICAgICAnIEVpdGhlciB0aGUgY3VycmVudCB2b2ljZSBmYWlsZWQgdG8gbG9hZCwgb3IgdGhpcyBicm93c2VyIGRvZXMnICtcclxuICAgICAgICAgICAgICAgICAgICAnIG5vdCBzdXBwb3J0IHN1cHBvcnQgdGV4dC10by1zcGVlY2guIFBsZWFzZSBjaGVjayB0aGUgY29uc29sZS4nXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgLy8gU2luY2UgdGhlIG1hcnF1ZWUgd291bGQgaGF2ZSBiZWVuIHN0dWNrIG9uIFwiTG9hZGluZy4uLlwiLCBzY3JvbGwgaXRcclxuICAgICAgICAgICAgaWYgKCFoYXNTcG9rZW4pXHJcbiAgICAgICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoc3BlZWNoVGV4dCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgUkFHLnNwZWVjaC5zcGVhayggUkFHLnZpZXdzLmVkaXRvci5nZXRQaHJhc2UoKSApO1xyXG4gICAgICAgIHRoaXMuYnRuU3RvcC5mb2N1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzdG9wIGJ1dHRvbiwgc3RvcHBpbmcgdGhlIG1hcnF1ZWUgYW5kIGFueSBzcGVlY2ggKi9cclxuICAgIHByaXZhdGUgaGFuZGxlU3RvcChldj86IEV2ZW50KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcuc3BlZWNoLm9uc3BlYWsgID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIFJBRy5zcGVlY2gub25zdG9wICAgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5idG5QbGF5LmhpZGRlbiA9IGZhbHNlO1xyXG5cclxuICAgICAgICAvLyBPbmx5IGZvY3VzIHBsYXkgYnV0dG9uIGlmIHVzZXIgZGlkbid0IG1vdmUgZm9jdXMgZWxzZXdoZXJlLiBQcmV2ZW50c1xyXG4gICAgICAgIC8vIGFubm95aW5nIHN1cnByaXNlIG9mIGZvY3VzIHN1ZGRlbmx5IHNoaWZ0aW5nIGF3YXkuXHJcbiAgICAgICAgaWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IHRoaXMuYnRuU3RvcClcclxuICAgICAgICAgICAgdGhpcy5idG5QbGF5LmZvY3VzKCk7XHJcblxyXG4gICAgICAgIHRoaXMuYnRuU3RvcC5oaWRkZW4gPSB0cnVlO1xyXG5cclxuICAgICAgICBSQUcuc3BlZWNoLnN0b3AoKTtcclxuXHJcbiAgICAgICAgLy8gSWYgZXZlbnQgZXhpc3RzLCB0aGlzIHN0b3Agd2FzIGNhbGxlZCBieSB0aGUgdXNlclxyXG4gICAgICAgIGlmIChldilcclxuICAgICAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KFJBRy52aWV3cy5lZGl0b3IuZ2V0VGV4dCgpLCBmYWxzZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIGdlbmVyYXRlIGJ1dHRvbiwgZ2VuZXJhdGluZyBuZXcgcmFuZG9tIHN0YXRlIGFuZCBwaHJhc2UgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlR2VuZXJhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBSZW1vdmUgdGhlIGNhbGwtdG8tYWN0aW9uIHRocm9iIGZyb20gaW5pdGlhbCBsb2FkXHJcbiAgICAgICAgdGhpcy5idG5HZW5lcmF0ZS5jbGFzc0xpc3QucmVtb3ZlKCd0aHJvYicpO1xyXG4gICAgICAgIFJBRy5nZW5lcmF0ZSgpO1xyXG4gICAgICAgIFJBRy5jb25maWcuY2xpY2tlZEdlbmVyYXRlID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogSGFuZGxlcyB0aGUgc2F2ZSBidXR0b24sIHBlcnNpc3RpbmcgdGhlIGN1cnJlbnQgdHJhaW4gc3RhdGUgdG8gc3RvcmFnZSAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVTYXZlKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgY3NzID0gJ2ZvbnQtc2l6ZTogbGFyZ2U7IGZvbnQtd2VpZ2h0OiBib2xkOyc7XHJcbiAgICAgICAgICAgIGxldCByYXcgPSBKU09OLnN0cmluZ2lmeShSQUcuc3RhdGUpO1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3N0YXRlJywgcmF3KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKEwuU1RBVEVfQ09QWV9QQVNURSgpLCBjc3MpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIlJBRy5sb2FkKCdcIiwgcmF3LnJlcGxhY2UoXCInXCIsIFwiXFxcXCdcIiksIFwiJylcIik7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKEwuU1RBVEVfUkFXX0pTT04oKSwgY3NzKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2cocmF3KTtcclxuXHJcbiAgICAgICAgICAgIFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9UT19TVE9SQUdFKCkgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuU1RBVEVfU0FWRV9GQUlMKGUubWVzc2FnZSkgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEhhbmRsZXMgdGhlIGxvYWQgYnV0dG9uLCBsb2FkaW5nIHRyYWluIHN0YXRlIGZyb20gc3RvcmFnZSwgaWYgaXQgZXhpc3RzICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUxvYWQoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgZGF0YSA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnc3RhdGUnKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGRhdGFcclxuICAgICAgICAgICAgPyBSQUcubG9hZChkYXRhKVxyXG4gICAgICAgICAgICA6IFJBRy52aWV3cy5tYXJxdWVlLnNldCggTC5TVEFURV9TQVZFX01JU1NJTkcoKSApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGVzIHRoZSBzZXR0aW5ncyBidXR0b24sIG9wZW5pbmcgdGhlIHNldHRpbmdzIHNjcmVlbiAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVPcHRpb24oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBSQUcudmlld3Muc2V0dGluZ3Mub3BlbigpO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFuYWdlcyBVSSBlbGVtZW50cyBhbmQgdGhlaXIgbG9naWMgKi9cclxuY2xhc3MgVmlld3Ncclxue1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBzY3JlZW4gKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbWFpbiAgICAgICA6IEhUTUxFbGVtZW50O1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBkaXNjbGFpbWVyIHNjcmVlbiAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBkaXNjbGFpbWVyIDogRGlzY2xhaW1lcjtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gZWRpdG9yIGNvbXBvbmVudCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBlZGl0b3IgICAgIDogRWRpdG9yO1xyXG4gICAgLyoqIFJlZmVyZW5jZSB0byB0aGUgbWFpbiBtYXJxdWVlIGNvbXBvbmVudCAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBtYXJxdWVlICAgIDogTWFycXVlZTtcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gc2V0dGluZ3Mgc2NyZWVuICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHNldHRpbmdzICAgOiBTZXR0aW5ncztcclxuICAgIC8qKiBSZWZlcmVuY2UgdG8gdGhlIG1haW4gdG9vbGJhciBjb21wb25lbnQgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgdG9vbGJhciAgICA6IFRvb2xiYXI7XHJcbiAgICAvKiogUmVmZXJlbmNlcyB0byBhbGwgdGhlIHBpY2tlcnMsIG9uZSBmb3IgZWFjaCB0eXBlIG9mIFhNTCBlbGVtZW50ICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHBpY2tlcnMgICAgOiBEaWN0aW9uYXJ5PFBpY2tlcj47XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLm1haW4gICAgICAgPSBET00ucmVxdWlyZSgnI21haW5TY3JlZW4nKTtcclxuICAgICAgICB0aGlzLmRpc2NsYWltZXIgPSBuZXcgRGlzY2xhaW1lcigpO1xyXG4gICAgICAgIHRoaXMuZWRpdG9yICAgICA9IG5ldyBFZGl0b3IoKTtcclxuICAgICAgICB0aGlzLm1hcnF1ZWUgICAgPSBuZXcgTWFycXVlZSgpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MgICA9IG5ldyBTZXR0aW5ncygpO1xyXG4gICAgICAgIHRoaXMudG9vbGJhciAgICA9IG5ldyBUb29sYmFyKCk7XHJcbiAgICAgICAgdGhpcy5waWNrZXJzICAgID0ge307XHJcblxyXG4gICAgICAgIFtcclxuICAgICAgICAgICAgbmV3IENvYWNoUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBFeGN1c2VQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IEludGVnZXJQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IE5hbWVkUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBQaHJhc2VzZXRQaWNrZXIoKSxcclxuICAgICAgICAgICAgbmV3IFBsYXRmb3JtUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTZXJ2aWNlUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTdGF0aW9uUGlja2VyKCksXHJcbiAgICAgICAgICAgIG5ldyBTdGF0aW9uTGlzdFBpY2tlcigpLFxyXG4gICAgICAgICAgICBuZXcgVGltZVBpY2tlcigpXHJcbiAgICAgICAgXS5mb3JFYWNoKHBpY2tlciA9PiB0aGlzLnBpY2tlcnNbcGlja2VyLnhtbFRhZ10gPSBwaWNrZXIpO1xyXG5cclxuICAgICAgICAvLyBHbG9iYWwgaG90a2V5c1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkub25rZXlkb3duID0gdGhpcy5vbklucHV0LmJpbmQodGhpcyk7XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGlPUy1zcGVjaWZpYyBDU1MgZml4ZXNcclxuICAgICAgICBpZiAoRE9NLmlzaU9TKVxyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoJ2lvcycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBHZXRzIHRoZSBwaWNrZXIgdGhhdCBoYW5kbGVzIGEgZ2l2ZW4gdGFnLCBpZiBhbnkgKi9cclxuICAgIHB1YmxpYyBnZXRQaWNrZXIoeG1sVGFnOiBzdHJpbmcpIDogUGlja2VyXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucGlja2Vyc1t4bWxUYWddO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBIYW5kbGUgRVNDIHRvIGNsb3NlIHBpY2tlcnMgb3Igc2V0dGlnbnMgKi9cclxuICAgIHByaXZhdGUgb25JbnB1dChldjogS2V5Ym9hcmRFdmVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGV2LmtleSAhPT0gJ0VzY2FwZScpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5lZGl0b3IuY2xvc2VEaWFsb2coKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzLmNsb3NlKCk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCBjb2xsYXBzaWJsZSBlbGVtZW50cyAqL1xyXG5jbGFzcyBDb2xsYXBzaWJsZXNcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHRoZSBjb2xsYXBzZSBzdGF0ZSBvZiBhIGNvbGxhcHNpYmxlIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNwYW4gVGhlIGVuY2Fwc3VsYXRpbmcgY29sbGFwc2libGUgZWxlbWVudFxyXG4gICAgICogQHBhcmFtIHN0YXRlIFRydWUgdG8gY29sbGFwc2UsIGZhbHNlIHRvIG9wZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzZXQoc3BhbjogSFRNTEVsZW1lbnQsIHN0YXRlOiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBpZiAoc3RhdGUpIHNwYW4uc2V0QXR0cmlidXRlKCdjb2xsYXBzZWQnLCAnJyk7XHJcbiAgICAgICAgZWxzZSAgICAgICBzcGFuLnJlbW92ZUF0dHJpYnV0ZSgnY29sbGFwc2VkJyk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBTdWdhciBmb3IgY2hvb3Npbmcgc2Vjb25kIHZhbHVlIGlmIGZpcnN0IGlzIHVuZGVmaW5lZCwgaW5zdGVhZCBvZiBmYWxzeSAqL1xyXG5mdW5jdGlvbiBlaXRoZXI8VD4odmFsdWU6IFQgfCB1bmRlZmluZWQsIHZhbHVlMjogVCkgOiBUXHJcbntcclxuICAgIHJldHVybiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkgPyB2YWx1ZTIgOiB2YWx1ZTtcclxufSIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIFV0aWxpdHkgbWV0aG9kcyBmb3IgZGVhbGluZyB3aXRoIHRoZSBET00gKi9cclxuY2xhc3MgRE9NXHJcbntcclxuICAgIC8qKiBXaGV0aGVyIHRoZSB3aW5kb3cgaXMgdGhpbm5lciB0aGFuIGEgc3BlY2lmaWMgc2l6ZSAoYW5kLCB0aHVzLCBpcyBcIm1vYmlsZVwiKSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXQgaXNNb2JpbGUoKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aCA8PSA1MDA7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFdoZXRoZXIgUkFHIGFwcGVhcnMgdG8gYmUgcnVubmluZyBvbiBhbiBpT1MgZGV2aWNlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldCBpc2lPUygpIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3IucGxhdGZvcm0ubWF0Y2goL2lQaG9uZXxpUG9kfGlQYWQvZ2kpICE9PSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmluZHMgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBhdHRyaWJ1dGUgZnJvbSB0aGUgZ2l2ZW4gZWxlbWVudCwgb3IgcmV0dXJucyB0aGUgZ2l2ZW5cclxuICAgICAqIGRlZmF1bHQgdmFsdWUgaWYgdW5zZXQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGF0dHJpYnV0ZSBvZlxyXG4gICAgICogQHBhcmFtIGF0dHIgTmFtZSBvZiB0aGUgYXR0cmlidXRlIHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEBwYXJhbSBkZWYgRGVmYXVsdCB2YWx1ZSBpZiBhdHRyaWJ1dGUgaXNuJ3Qgc2V0XHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gYXR0cmlidXRlJ3MgdmFsdWUsIG9yIGRlZmF1bHQgdmFsdWUgaWYgdW5zZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRBdHRyKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBhdHRyOiBzdHJpbmcsIGRlZjogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBlbGVtZW50Lmhhc0F0dHJpYnV0ZShhdHRyKVxyXG4gICAgICAgICAgICA/IGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHIpIVxyXG4gICAgICAgICAgICA6IGRlZjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIGFuIGVsZW1lbnQgZnJvbSB0aGUgZ2l2ZW4gZG9jdW1lbnQsIHRocm93aW5nIGFuIGVycm9yIGlmIG5vIG1hdGNoIGlzIGZvdW5kLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBxdWVyeSBDU1Mgc2VsZWN0b3IgcXVlcnkgdG8gdXNlXHJcbiAgICAgKiBAcGFyYW0gcGFyZW50IFBhcmVudCBvYmplY3QgdG8gc2VhcmNoOyBkZWZhdWx0cyB0byBkb2N1bWVudFxyXG4gICAgICogQHJldHVybnMgVGhlIGZpcnN0IGVsZW1lbnQgdG8gbWF0Y2ggdGhlIGdpdmVuIHF1ZXJ5XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZTxUIGV4dGVuZHMgSFRNTEVsZW1lbnQ+XHJcbiAgICAgICAgKHF1ZXJ5OiBzdHJpbmcsIHBhcmVudDogUGFyZW50Tm9kZSA9IHdpbmRvdy5kb2N1bWVudClcclxuICAgICAgICA6IFRcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gcGFyZW50LnF1ZXJ5U2VsZWN0b3IocXVlcnkpIGFzIFQ7XHJcblxyXG4gICAgICAgIGlmICghcmVzdWx0KVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5ET01fTUlTU0lORyhxdWVyeSkgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gYXR0cmlidXRlIGZyb20gdGhlIGdpdmVuIGVsZW1lbnQsIHRocm93aW5nIGFuIGVycm9yXHJcbiAgICAgKiBpZiB0aGUgYXR0cmlidXRlIGlzIG1pc3NpbmcuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byBnZXQgdGhlIGF0dHJpYnV0ZSBvZlxyXG4gICAgICogQHBhcmFtIGF0dHIgTmFtZSBvZiB0aGUgYXR0cmlidXRlIHRvIGdldCB0aGUgdmFsdWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFRoZSBnaXZlbiBhdHRyaWJ1dGUncyB2YWx1ZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlcXVpcmVBdHRyKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBhdHRyOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAhZWxlbWVudC5oYXNBdHRyaWJ1dGUoYXR0cikgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5BVFRSX01JU1NJTkcoYXR0cikgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHIpITtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpbmRzIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4ga2V5IG9mIHRoZSBnaXZlbiBlbGVtZW50J3MgZGF0YXNldCwgdGhyb3dpbmcgYW4gZXJyb3JcclxuICAgICAqIGlmIHRoZSB2YWx1ZSBpcyBtaXNzaW5nIG9yIGVtcHR5LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gZ2V0IHRoZSBkYXRhIG9mXHJcbiAgICAgKiBAcGFyYW0ga2V5IEtleSB0byBnZXQgdGhlIHZhbHVlIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgZ2l2ZW4gZGF0YXNldCdzIHZhbHVlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcmVxdWlyZURhdGEoZWxlbWVudDogSFRNTEVsZW1lbnQsIGtleTogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCB2YWx1ZSA9IGVsZW1lbnQuZGF0YXNldFtrZXldO1xyXG5cclxuICAgICAgICBpZiAoIFN0cmluZ3MuaXNOdWxsT3JFbXB0eSh2YWx1ZSkgKVxyXG4gICAgICAgICAgICB0aHJvdyBFcnJvciggTC5EQVRBX01JU1NJTkcoa2V5KSApO1xyXG5cclxuICAgICAgICByZXR1cm4gdmFsdWUhO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQmx1cnMgKHVuZm9jdXNlcykgdGhlIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHBhcmVudCBJZiBnaXZlbiwgb25seSBibHVycyBpZiBhY3RpdmUgaXMgZGVzY2VuZGFudFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJsdXJBY3RpdmUocGFyZW50OiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmJvZHkpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBhY3RpdmUgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIGFjdGl2ZSAmJiBhY3RpdmUuYmx1ciAmJiBwYXJlbnQuY29udGFpbnMoYWN0aXZlKSApXHJcbiAgICAgICAgICAgIGFjdGl2ZS5ibHVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBEZWVwIGNsb25lcyBhbGwgdGhlIGNoaWxkcmVuIG9mIHRoZSBnaXZlbiBlbGVtZW50LCBpbnRvIHRoZSB0YXJnZXQgZWxlbWVudC5cclxuICAgICAqIFVzaW5nIGlubmVySFRNTCB3b3VsZCBiZSBlYXNpZXIsIGhvd2V2ZXIgaXQgaGFuZGxlcyBzZWxmLWNsb3NpbmcgdGFncyBwb29ybHkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNvdXJjZSBFbGVtZW50IHdob3NlIGNoaWxkcmVuIHRvIGNsb25lXHJcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IEVsZW1lbnQgdG8gYXBwZW5kIHRoZSBjbG9uZWQgY2hpbGRyZW4gdG9cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjbG9uZUludG8oc291cmNlOiBIVE1MRWxlbWVudCwgdGFyZ2V0OiBIVE1MRWxlbWVudCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzb3VyY2UuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgdGFyZ2V0LmFwcGVuZENoaWxkKCBzb3VyY2UuY2hpbGROb2Rlc1tpXS5jbG9uZU5vZGUodHJ1ZSkgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN1Z2FyIGZvciBjcmVhdGluZyBhbmQgYWRkaW5nIGFuIG9wdGlvbiBlbGVtZW50IHRvIGEgc2VsZWN0IGVsZW1lbnQuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHNlbGVjdCBTZWxlY3QgbGlzdCBlbGVtZW50IHRvIGFkZCB0aGUgb3B0aW9uIHRvXHJcbiAgICAgKiBAcGFyYW0gdGV4dCBMYWJlbCBmb3IgdGhlIG9wdGlvblxyXG4gICAgICogQHBhcmFtIHZhbHVlIFZhbHVlIGZvciB0aGUgb3B0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYWRkT3B0aW9uKHNlbGVjdDogSFRNTFNlbGVjdEVsZW1lbnQsIHRleHQ6IHN0cmluZywgdmFsdWU6IHN0cmluZyA9ICcnKVxyXG4gICAgICAgIDogSFRNTE9wdGlvbkVsZW1lbnRcclxuICAgIHtcclxuICAgICAgICBsZXQgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJykgYXMgSFRNTE9wdGlvbkVsZW1lbnQ7XHJcblxyXG4gICAgICAgIG9wdGlvbi50ZXh0ICA9IHRleHQ7XHJcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gdmFsdWU7XHJcblxyXG4gICAgICAgIHNlbGVjdC5hZGQob3B0aW9uKTtcclxuICAgICAgICByZXR1cm4gb3B0aW9uO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3VnYXIgZm9yIHBvcHVsYXRpbmcgYSBzZWxlY3QgZWxlbWVudCB3aXRoIGl0ZW1zIGZyb20gYSBnaXZlbiBvYmplY3QuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGxpc3QgU2VsZWN0IGVsZW1lbnQgdG8gcG9wdWxhdGVcclxuICAgICAqIEBwYXJhbSBpdGVtcyBBIGRpY3Rpb25hcnkgd2hlcmUga2V5cyBhY3QgbGlrZSB2YWx1ZXMsIGFuZCB2YWx1ZXMgbGlrZSBsYWJlbHNcclxuICAgICAqIEBwYXJhbSBzZWxlY3RlZCBJZiBtYXRjaGVzIGEgZGljdGlvbmFyeSBrZXksIHRoYXQga2V5IGlzIHRoZSBwcmUtc2VsZWN0ZWQgb3B0aW9uXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgcG9wdWxhdGUobGlzdDogSFRNTFNlbGVjdEVsZW1lbnQsIGl0ZW1zOiBhbnksIHNlbGVjdGVkPzogYW55KSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCB2YWx1ZSBpbiBpdGVtcylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsYWJlbCA9IGl0ZW1zW3ZhbHVlXTtcclxuICAgICAgICAgICAgbGV0IG9wdCAgID0gRE9NLmFkZE9wdGlvbihsaXN0LCBsYWJlbCwgdmFsdWUpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHNlbGVjdGVkICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgPT09IHNlbGVjdGVkKVxyXG4gICAgICAgICAgICAgICAgb3B0LnNlbGVjdGVkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIGdpdmVuIGVsZW1lbnQsIGV4Y2x1ZGluZyB0aGUgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW4uXHJcbiAgICAgKiBCZSB3YXJuZWQ7IHRoaXMgbWV0aG9kIHVzZXMgUkFHLXNwZWNpZmljIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gcmVjdXJzaXZlbHkgZ2V0IHRleHQgY29udGVudCBvZlxyXG4gICAgICogQHJldHVybnMgVGV4dCBjb250ZW50IG9mIGdpdmVuIGVsZW1lbnQsIHdpdGhvdXQgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRWaXNpYmxlVGV4dChlbGVtZW50OiBFbGVtZW50KSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICAgICAgKGVsZW1lbnQubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKVxyXG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudC50ZXh0Q29udGVudCB8fCAnJztcclxuICAgICAgICBlbHNlIGlmICggZWxlbWVudC50YWdOYW1lID09PSAnQlVUVE9OJyApXHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuXHJcbiAgICAgICAgLy8gUmV0dXJuIGJsYW5rIChza2lwKSBpZiBjaGlsZCBvZiBhIGNvbGxhcHNlZCBlbGVtZW50LiBQcmV2aW91c2x5LCB0aGlzIHVzZWRcclxuICAgICAgICAvLyBnZXRDb21wdXRlZFN0eWxlLCBidXQgdGhhdCBkb2Vzbid0IHdvcmsgaWYgdGhlIGVsZW1lbnQgaXMgcGFydCBvZiBhbiBvcnBoYW5lZFxyXG4gICAgICAgIC8vIHBocmFzZSAoYXMgaGFwcGVucyB3aXRoIHRoZSBwaHJhc2VzZXQgcGlja2VyKS5cclxuICAgICAgICBsZXQgcGFyZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICBpZiAoIHBhcmVudCAmJiBwYXJlbnQuaGFzQXR0cmlidXRlKCdjb2xsYXBzZWQnKSApXHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuXHJcbiAgICAgICAgbGV0IHRleHQgPSAnJztcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgdGV4dCArPSBET00uZ2V0VmlzaWJsZVRleHQoZWxlbWVudC5jaGlsZE5vZGVzW2ldIGFzIEVsZW1lbnQpO1xyXG5cclxuICAgICAgICByZXR1cm4gdGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHRleHQgY29udGVudCBvZiB0aGUgZ2l2ZW4gZWxlbWVudCwgZXhjbHVkaW5nIHRoZSB0ZXh0IG9mIGhpZGRlbiBjaGlsZHJlbixcclxuICAgICAqIGFuZCBleGNlc3Mgd2hpdGVzcGFjZSBhcyBhIHJlc3VsdCBvZiBjb252ZXJ0aW5nIGZyb20gSFRNTC9YTUwuXHJcbiAgICAgKlxyXG4gICAgICogQHNlZSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTk5ODYzMjhcclxuICAgICAqIEBwYXJhbSBlbGVtZW50IEVsZW1lbnQgdG8gcmVjdXJzaXZlbHkgZ2V0IHRleHQgY29udGVudCBvZlxyXG4gICAgICogQHJldHVybnMgQ2xlYW5lZCB0ZXh0IG9mIGdpdmVuIGVsZW1lbnQsIHdpdGhvdXQgdGV4dCBvZiBoaWRkZW4gY2hpbGRyZW5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXRDbGVhbmVkVmlzaWJsZVRleHQoZWxlbWVudDogRWxlbWVudCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gU3RyaW5ncy5jbGVhbiggRE9NLmdldFZpc2libGVUZXh0KGVsZW1lbnQpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTY2FucyBmb3IgdGhlIG5leHQgZm9jdXNhYmxlIHNpYmxpbmcgZnJvbSBhIGdpdmVuIGVsZW1lbnQsIHNraXBwaW5nIGhpZGRlbiBvclxyXG4gICAgICogdW5mb2N1c2FibGUgZWxlbWVudHMuIElmIHRoZSBlbmQgb2YgdGhlIGNvbnRhaW5lciBpcyBoaXQsIHRoZSBzY2FuIHdyYXBzIGFyb3VuZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZnJvbSBFbGVtZW50IHRvIHN0YXJ0IHNjYW5uaW5nIGZyb21cclxuICAgICAqIEBwYXJhbSBkaXIgRGlyZWN0aW9uOyAtMSBmb3IgbGVmdCAocHJldmlvdXMpLCAxIGZvciByaWdodCAobmV4dClcclxuICAgICAqIEByZXR1cm5zIFRoZSBuZXh0IGF2YWlsYWJsZSBzaWJsaW5nLCBvciBudWxsIGlmIG5vbmUgZm91bmRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZXROZXh0Rm9jdXNhYmxlU2libGluZyhmcm9tOiBIVE1MRWxlbWVudCwgZGlyOiBudW1iZXIpXHJcbiAgICAgICAgOiBIVE1MRWxlbWVudCB8IG51bGxcclxuICAgIHtcclxuICAgICAgICBsZXQgY3VycmVudCA9IGZyb207XHJcbiAgICAgICAgbGV0IHBhcmVudCAgPSBmcm9tLnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmICghcGFyZW50KVxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgd2hpbGUgKHRydWUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBQcm9jZWVkIHRvIG5leHQgZWxlbWVudCwgb3Igd3JhcCBhcm91bmQgaWYgaGl0IHRoZSBlbmQgb2YgcGFyZW50XHJcbiAgICAgICAgICAgIGlmICAgICAgKGRpciA8IDApXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50XHJcbiAgICAgICAgICAgICAgICAgICAgfHwgcGFyZW50Lmxhc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGRpciA+IDApXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnRcclxuICAgICAgICAgICAgICAgICAgICB8fCBwYXJlbnQuZmlyc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkJBRF9ESVJFQ1RJT04oIGRpci50b1N0cmluZygpICkgKTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGNvbWUgYmFjayB0byB0aGUgc3RhcnRpbmcgZWxlbWVudCwgbm90aGluZyB3YXMgZm91bmRcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnQgPT09IGZyb20pXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoaXMgZWxlbWVudCBpc24ndCBoaWRkZW4gYW5kIGlzIGZvY3VzYWJsZSwgcmV0dXJuIGl0IVxyXG4gICAgICAgICAgICBpZiAoICFjdXJyZW50LmhpZGRlbiApXHJcbiAgICAgICAgICAgIGlmICggY3VycmVudC5oYXNBdHRyaWJ1dGUoJ3RhYmluZGV4JykgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBlbGVtZW50LCByZWxldmFudCB0byBpdHMgcGFyZW50LlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIGVsZW1lbnQgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGluZGV4T2YoY2hpbGQ6IEhUTUxFbGVtZW50KSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGRyZW4sIGNoaWxkKVxyXG4gICAgICAgICAgICA6IC0xO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaW5kZXggb2YgYSBjaGlsZCBub2RlLCByZWxldmFudCB0byBpdHMgcGFyZW50LiBVc2VkIGZvciB0ZXh0IG5vZGVzLlxyXG4gICAgICpcclxuICAgICAqIEBzZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxMzI1NzUvMzM1NDkyMFxyXG4gICAgICogQHBhcmFtIGNoaWxkIENoaWxkIG5vZGUgdG8gZ2V0IHRoZSBpbmRleCBvZlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG5vZGVJbmRleE9mKGNoaWxkOiBOb2RlKSA6IG51bWJlclxyXG4gICAge1xyXG4gICAgICAgIGxldCBwYXJlbnQgPSBjaGlsZC5wYXJlbnROb2RlO1xyXG5cclxuICAgICAgICByZXR1cm4gcGFyZW50XHJcbiAgICAgICAgICAgID8gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGROb2RlcywgY2hpbGQpXHJcbiAgICAgICAgICAgIDogLTE7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUb2dnbGVzIHRoZSBoaWRkZW4gYXR0cmlidXRlIG9mIHRoZSBnaXZlbiBlbGVtZW50LCBhbmQgYWxsIGl0cyBsYWJlbHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGVsZW1lbnQgRWxlbWVudCB0byB0b2dnbGUgdGhlIGhpZGRlbiBhdHRyaWJ1dGUgb2ZcclxuICAgICAqIEBwYXJhbSBmb3JjZSBPcHRpb25hbCB2YWx1ZSB0byBmb3JjZSB0b2dnbGluZyB0b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHRvZ2dsZUhpZGRlbihlbGVtZW50OiBIVE1MRWxlbWVudCwgZm9yY2U/OiBib29sZWFuKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBsZXQgaGlkZGVuID0gIWVsZW1lbnQuaGlkZGVuO1xyXG5cclxuICAgICAgICAvLyBEbyBub3RoaW5nIGlmIGFscmVhZHkgdG9nZ2xlZCB0byB0aGUgZm9yY2VkIHN0YXRlXHJcbiAgICAgICAgaWYgKGhpZGRlbiA9PT0gZm9yY2UpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgZWxlbWVudC5oaWRkZW4gPSBoaWRkZW47XHJcblxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtmb3I9JyR7ZWxlbWVudC5pZH0nXWApXHJcbiAgICAgICAgICAgIC5mb3JFYWNoKGwgPT4gKGwgYXMgSFRNTEVsZW1lbnQpLmhpZGRlbiA9IGhpZGRlbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUb2dnbGVzIHRoZSBoaWRkZW4gYXR0cmlidXRlIG9mIGEgZ3JvdXAgb2YgZWxlbWVudHMsIGluIGJ1bGsuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGxpc3QgQW4gYXJyYXkgb2YgYXJndW1lbnQgcGFpcnMgZm9yIHt0b2dnbGVIaWRkZW59XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgdG9nZ2xlSGlkZGVuQWxsKC4uLmxpc3Q6IFtIVE1MRWxlbWVudCwgYm9vbGVhbj9dW10pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGxpc3QuZm9yRWFjaCggbCA9PiB0aGlzLnRvZ2dsZUhpZGRlbiguLi5sKSApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogQSB2ZXJ5IHNtYWxsIHN1YnNldCBvZiBNYXJrZG93biBmb3IgaHlwZXJsaW5raW5nIGEgYmxvY2sgb2YgdGV4dCAqL1xyXG5jbGFzcyBMaW5rZG93blxyXG57XHJcbiAgICAvKiogUmVnZXggcGF0dGVybiBmb3IgbWF0Y2hpbmcgbGlua2VkIHRleHQgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX0xJTksgPSAvXFxbKFtcXHNcXFNdKz8pXFxdXFxbKFxcZCspXFxdL2dtaTtcclxuICAgIC8qKiBSZWdleCBwYXR0ZXJuIGZvciBtYXRjaGluZyBsaW5rIHJlZmVyZW5jZXMgKi9cclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFR0VYX1JFRiAgPSAvXlxcWyhcXGQrKVxcXTpcXHMrKFxcUyspJC9nbWk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBdHRlbXB0cyB0byBsb2FkIHRoZSBnaXZlbiBsaW5rZG93biBmaWxlLCBwYXJzZSBhbmQgc2V0IGl0IGFzIGFuIGVsZW1lbnQncyB0ZXh0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBwYXRoIFJlbGF0aXZlIG9yIGFic29sdXRlIFVSTCB0byBmZXRjaCB0aGUgbGlua2Rvd24gZnJvbVxyXG4gICAgICogQHBhcmFtIHF1ZXJ5IERPTSBxdWVyeSBmb3IgdGhlIG9iamVjdCB0byBwdXQgdGhlIHRleHQgaW50b1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGxvYWRJbnRvKHBhdGg6IHN0cmluZywgcXVlcnk6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGRvbSA9IERPTS5yZXF1aXJlKHF1ZXJ5KTtcclxuXHJcbiAgICAgICAgZG9tLmlubmVyVGV4dCA9IGBMb2FkaW5nIHRleHQgZnJvbSAnJHtwYXRofScuLi5gO1xyXG5cclxuICAgICAgICBmZXRjaChwYXRoKVxyXG4gICAgICAgICAgICAudGhlbiggcmVxID0+IHJlcS50ZXh0KCkgKVxyXG4gICAgICAgICAgICAudGhlbiggdHh0ID0+IGRvbS5pbm5lckhUTUwgPSBMaW5rZG93bi5wYXJzZSh0eHQpIClcclxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiBkb20uaW5uZXJUZXh0ID0gYENvdWxkIG5vdCBsb2FkICcke3BhdGh9JzogJHtlcnJ9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQYXJzZXMgdGhlIGdpdmVuIHRleHQgZnJvbSBMaW5rZG93biB0byBIVE1MLCBjb252ZXJ0aW5nIHRhZ2dlZCB0ZXh0IGludG8gbGlua3NcclxuICAgICAqIHVzaW5nIGEgZ2l2ZW4gbGlzdCBvZiByZWZlcmVuY2VzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB0ZXh0IExpbmtkb3duIHRleHQgdG8gdHJhbnNmb3JtIHRvIEhUTUxcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcGFyc2UodGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBsaW5rcyA6IERpY3Rpb25hcnk8c3RyaW5nPiA9IHt9O1xyXG5cclxuICAgICAgICAvLyBGaXJzdCwgc2FuaXRpemUgYW55IEhUTUxcclxuICAgICAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKCc8JywgJyZsdDsnKS5yZXBsYWNlKCc+JywgJyZndDsnKTtcclxuXHJcbiAgICAgICAgLy8gVGhlbiwgZ2V0IHRoZSBsaXN0IG9mIHJlZmVyZW5jZXMsIHJlbW92aW5nIHRoZW0gZnJvbSB0aGUgdGV4dFxyXG4gICAgICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9SRUYsIChfLCBrLCB2KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGlua3Nba10gPSB2O1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmFsbHksIHJlcGxhY2UgZWFjaCB0YWdnZWQgcGFydCBvZiB0ZXh0IHdpdGggYSBsaW5rIGVsZW1lbnQuIElmIGEgdGFnIGhhc1xyXG4gICAgICAgIC8vIGFuIGludmFsaWQgcmVmZXJlbmNlLCBpdCBpcyBpZ25vcmVkLlxyXG4gICAgICAgIHJldHVybiB0ZXh0LnJlcGxhY2UodGhpcy5SRUdFWF9MSU5LLCAobWF0Y2gsIHQsIGspID0+XHJcbiAgICAgICAgICAgIGxpbmtzW2tdXHJcbiAgICAgICAgICAgICAgICA/IGA8YSBocmVmPScke2xpbmtzW2tdfScgdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9vcGVuZXJcIj4ke3R9PC9hPmBcclxuICAgICAgICAgICAgICAgIDogbWF0Y2hcclxuICAgICAgICApO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBtZXRob2RzIGZvciBwYXJzaW5nIGRhdGEgZnJvbSBzdHJpbmdzICovXHJcbmNsYXNzIFBhcnNlXHJcbntcclxuICAgIC8qKiBQYXJzZXMgYSBnaXZlbiBzdHJpbmcgaW50byBhIGJvb2xlYW4gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYm9vbGVhbihzdHI6IHN0cmluZykgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgc3RyID0gc3RyLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIGlmIChzdHIgPT09ICd0cnVlJyB8fCBzdHIgPT09ICcxJylcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgaWYgKHN0ciA9PT0gJ2ZhbHNlJyB8fCBzdHIgPT09ICcwJylcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICB0aHJvdyBFcnJvciggTC5CQURfQk9PTEVBTihzdHIpICk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGdlbmVyYXRpbmcgcmFuZG9tIGRhdGEgKi9cclxuY2xhc3MgUmFuZG9tXHJcbntcclxuICAgIC8qKlxyXG4gICAgICogUGlja3MgYSByYW5kb20gaW50ZWdlciBmcm9tIHRoZSBnaXZlbiByYW5nZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gaW50ZWdlciB0byBwaWNrLCBpbmNsdXNpdmVcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBpbnRlZ2VyIHRvIHBpY2ssIGluY2x1c2l2ZVxyXG4gICAgICogQHJldHVybnMgUmFuZG9tIGludGVnZXIgd2l0aGluIHRoZSBnaXZlbiByYW5nZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGludChtaW46IG51bWJlciA9IDAsIG1heDogbnVtYmVyID0gMSkgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5mbG9vciggTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4pICkgKyBtaW47XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGVsZW1lbnQgZnJvbSBhIGdpdmVuIGFycmF5LWxpa2Ugb2JqZWN0IHdpdGggYSBsZW5ndGggcHJvcGVydHkgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgYXJyYXkoYXJyOiBMZW5ndGhhYmxlKSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBhcnJbIFJhbmRvbS5pbnQoMCwgYXJyLmxlbmd0aCkgXTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU3BsaWNlcyBhIHJhbmRvbSBlbGVtZW50IGZyb20gYSBnaXZlbiBhcnJheSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBhcnJheVNwbGljZTxUPihhcnI6IFRbXSkgOiBUXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIGFyci5zcGxpY2UoUmFuZG9tLmludCgwLCBhcnIubGVuZ3RoKSwgMSlbMF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIGtleSBmcm9tIGEgZ2l2ZW4gb2JqZWN0ICovXHJcbiAgICBwdWJsaWMgc3RhdGljIG9iamVjdEtleShvYmo6IHt9KSA6IGFueVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkoIE9iamVjdC5rZXlzKG9iaikgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFBpY2tzIHRydWUgb3IgZmFsc2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNoYW5jZSBDaGFuY2Ugb3V0IG9mIDEwMCwgdG8gcGljayBgdHJ1ZWBcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBib29sKGNoYW5jZTogbnVtYmVyID0gNTApIDogYm9vbGVhblxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uaW50KDAsIDEwMCkgPCBjaGFuY2U7XHJcbiAgICB9XHJcbn1cclxuIiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVXRpbGl0eSBjbGFzcyBmb3IgYXVkaW8gZnVuY3Rpb25hbGl0eSAqL1xyXG5jbGFzcyBTb3VuZHNcclxue1xyXG4gICAgLyoqXHJcbiAgICAgKiBEZWNvZGVzIHRoZSBnaXZlbiBhdWRpbyBmaWxlIGludG8gcmF3IGF1ZGlvIGRhdGEuIFRoaXMgaXMgYSB3cmFwcGVyIGZvciB0aGUgb2xkZXJcclxuICAgICAqIGNhbGxiYWNrLWJhc2VkIHN5bnRheCwgc2luY2UgaXQgaXMgdGhlIG9ubHkgb25lIGlPUyBjdXJyZW50bHkgc3VwcG9ydHMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQXVkaW8gY29udGV4dCB0byB1c2UgZm9yIGRlY29kaW5nXHJcbiAgICAgKiBAcGFyYW0gYnVmZmVyIEJ1ZmZlciBvZiBlbmNvZGVkIGZpbGUgZGF0YSAoZS5nLiBtcDMpIHRvIGRlY29kZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGFzeW5jIGRlY29kZShjb250ZXh0OiBBdWRpb0NvbnRleHQsIGJ1ZmZlcjogQXJyYXlCdWZmZXIpXHJcbiAgICAgICAgOiBQcm9taXNlPEF1ZGlvQnVmZmVyPlxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSA8QXVkaW9CdWZmZXI+ICggKHJlc29sdmUsIHJlamVjdCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiBjb250ZXh0LmRlY29kZUF1ZGlvRGF0YShidWZmZXIsIHJlc29sdmUsIHJlamVjdCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBVdGlsaXR5IG1ldGhvZHMgZm9yIGRlYWxpbmcgd2l0aCBzdHJpbmdzICovXHJcbmNsYXNzIFN0cmluZ3Ncclxue1xyXG4gICAgLyoqIENoZWNrcyBpZiB0aGUgZ2l2ZW4gc3RyaW5nIGlzIG51bGwsIG9yIGVtcHR5ICh3aGl0ZXNwYWNlIG9ubHkgb3IgemVyby1sZW5ndGgpICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGlzTnVsbE9yRW1wdHkoc3RyOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA6IGJvb2xlYW5cclxuICAgIHtcclxuICAgICAgICByZXR1cm4gIXN0ciB8fCAhc3RyLnRyaW0oKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByZXR0eS1wcmludCdzIGEgZ2l2ZW4gbGlzdCBvZiBzdGF0aW9ucywgd2l0aCBjb250ZXh0IHNlbnNpdGl2ZSBleHRyYXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGVzIExpc3Qgb2Ygc3RhdGlvbiBjb2RlcyB0byBqb2luXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBMaXN0J3MgY29udGV4dC4gSWYgJ2NhbGxpbmcnLCBoYW5kbGVzIHNwZWNpYWwgY2FzZVxyXG4gICAgICogQHJldHVybnMgUHJldHR5LXByaW50ZWQgbGlzdCBvZiBnaXZlbiBzdGF0aW9uc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGZyb21TdGF0aW9uTGlzdChjb2Rlczogc3RyaW5nW10sIGNvbnRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gJyc7XHJcbiAgICAgICAgbGV0IG5hbWVzICA9IGNvZGVzLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIG5hbWVzLmZvckVhY2goIChjLCBpKSA9PiBuYW1lc1tpXSA9IFJBRy5kYXRhYmFzZS5nZXRTdGF0aW9uKGMpICk7XHJcblxyXG4gICAgICAgIGlmIChuYW1lcy5sZW5ndGggPT09IDEpXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IChjb250ZXh0ID09PSAnY2FsbGluZycpXHJcbiAgICAgICAgICAgICAgICA/IGAke25hbWVzWzBdfSBvbmx5YFxyXG4gICAgICAgICAgICAgICAgOiBuYW1lc1swXTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGFzdFN0YXRpb24gPSBuYW1lcy5wb3AoKTtcclxuXHJcbiAgICAgICAgICAgIHJlc3VsdCAgPSBuYW1lcy5qb2luKCcsICcpO1xyXG4gICAgICAgICAgICByZXN1bHQgKz0gYCBhbmQgJHtsYXN0U3RhdGlvbn1gO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByZXR0eS1wcmludHMgdGhlIGdpdmVuIGRhdGUgb3IgaG91cnMgYW5kIG1pbnV0ZXMgaW50byBhIDI0LWhvdXIgdGltZSAoZS5nLiAwMTowOSkuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGhvdXJzIEhvdXJzLCBmcm9tIDAgdG8gMjMsIG9yIERhdGUgb2JqZWN0XHJcbiAgICAgKiBAcGFyYW0gbWludXRlcyBNaW51dGVzLCBmcm9tIDAgdG8gNTlcclxuICAgICAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmcm9tVGltZShob3VyczogbnVtYmVyIHwgRGF0ZSwgbWludXRlczogbnVtYmVyID0gMCkgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICBpZiAoaG91cnMgaW5zdGFuY2VvZiBEYXRlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbWludXRlcyA9IGhvdXJzLmdldE1pbnV0ZXMoKTtcclxuICAgICAgICAgICAgaG91cnMgICA9IGhvdXJzLmdldEhvdXJzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gaG91cnMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpICsgJzonICtcclxuICAgICAgICAgICAgbWludXRlcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIENsZWFucyB1cCB0aGUgZ2l2ZW4gdGV4dCBvZiBleGNlc3Mgd2hpdGVzcGFjZSBhbmQgYW55IG5ld2xpbmVzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGNsZWFuKHRleHQ6IHN0cmluZykgOiBzdHJpbmdcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdGV4dC50cmltKClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXG5cXHJdL2dpLCAgICcnICApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHN7Mix9L2dpLCAgICcgJyApXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC/igJxcXHMrL2dpLCAgICAgJ+KAnCcgKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxzK+KAnS9naSwgICAgICfigJ0nIClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccyhbLixdKS9naSwgJyQxJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFN0cm9uZ2x5IGNvbXByZXNzZXMgdGhlIGdpdmVuIHN0cmluZyB0byBvbmUgbW9yZSBmaWxlbmFtZSBmcmllbmRseSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaWxlbmFtZSh0ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRleHRcclxuICAgICAgICAgICAgLnRvTG93ZXJDYXNlKClcclxuICAgICAgICAgICAgLy8gUmVwbGFjZSBwbHVyYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pZXNcXGIvZywgJ3knKVxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgY29tbW9uIHdvcmRzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGIoYXxhbnxhdHxiZXxvZnxvbnx0aGV8dG98aW58aXN8aGFzfGJ5fHdpdGgpXFxiL2csICcnKVxyXG4gICAgICAgICAgICAudHJpbSgpXHJcbiAgICAgICAgICAgIC8vIENvbnZlcnQgc3BhY2VzIHRvIHVuZGVyc2NvcmVzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMrL2csICdfJylcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGFsbCBub24tYWxwaGFudW1lcmljYWxzXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXmEtejAtOV9dL2csICcnKVxyXG4gICAgICAgICAgICAvLyBMaW1pdCB0byAxMDAgY2hhcnM7IG1vc3Qgc3lzdGVtcyBzdXBwb3J0IG1heC4gMjU1IGJ5dGVzIGluIGZpbGVuYW1lc1xyXG4gICAgICAgICAgICAuc3Vic3RyaW5nKDAsIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIGZpcnN0IG1hdGNoIG9mIGEgcGF0dGVybiBpbiBhIHN0cmluZywgb3IgdW5kZWZpbmVkIGlmIG5vdCBmb3VuZCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBmaXJzdE1hdGNoKHRleHQ6IHN0cmluZywgcGF0dGVybjogUmVnRXhwLCBpZHg6IG51bWJlcilcclxuICAgICAgICA6IHN0cmluZyB8IHVuZGVmaW5lZFxyXG4gICAge1xyXG4gICAgICAgIGxldCBtYXRjaCA9IHRleHQubWF0Y2gocGF0dGVybik7XHJcblxyXG4gICAgICAgIHJldHVybiAobWF0Y2ggJiYgbWF0Y2hbaWR4XSlcclxuICAgICAgICAgICAgPyBtYXRjaFtpZHhdXHJcbiAgICAgICAgICAgIDogdW5kZWZpbmVkO1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogVW5pb24gdHlwZSBmb3IgaXRlcmFibGUgdHlwZXMgd2l0aCBhIC5sZW5ndGggcHJvcGVydHkgKi9cclxudHlwZSBMZW5ndGhhYmxlID0gQXJyYXk8YW55PiB8IE5vZGVMaXN0IHwgSFRNTENvbGxlY3Rpb24gfCBzdHJpbmc7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIHBsYXRmb3JtIGFzIGEgZGlnaXQgYW5kIG9wdGlvbmFsIGxldHRlciB0dXBsZSAqL1xyXG50eXBlIFBsYXRmb3JtID0gW3N0cmluZywgc3RyaW5nXTtcclxuXHJcbi8qKiBSZXByZXNlbnRzIGEgc3RhdGlvbiBuYW1lLCB3aGljaCBjYW4gYmUgYSBzaW1wbGUgc3RyaW5nIG9yIGNvbXBsZXggb2JqZWN0ICovXHJcbnR5cGUgU3RhdGlvbiA9IHN0cmluZyB8IFN0YXRpb25EZWY7XHJcblxyXG4vKiogUmVwcmVzZW50cyBhIGNvbXBsZXggc3RhdGlvbiBuYW1lIGRlZmluaXRpb24gKi9cclxuaW50ZXJmYWNlIFN0YXRpb25EZWZcclxue1xyXG4gICAgLyoqIENhbm9uaWNhbCBuYW1lIG9mIHRoZSBzdGF0aW9uICovXHJcbiAgICBuYW1lICAgICAgOiBzdHJpbmc7XHJcbiAgICAvKiogU3RhdGlvbiBjb2RlIHRvIHVzZSB0aGUgc2FtZSByZWNvcmRpbmcgb2YgKi9cclxuICAgIHZveEFsaWFzPyA6IHN0cmluZztcclxufVxyXG5cclxuLyoqIFJlcHJlc2VudHMgYSBnZW5lcmljIGtleS12YWx1ZSBkaWN0aW9uYXJ5LCB3aXRoIHN0cmluZyBrZXlzICovXHJcbnR5cGUgRGljdGlvbmFyeTxUPiA9IHsgW2luZGV4OiBzdHJpbmddOiBUIH07XHJcblxyXG4vKiogRGVmaW5lcyB0aGUgZGF0YSByZWZlcmVuY2VzIGNvbmZpZyBvYmplY3QgcGFzc2VkIGludG8gUkFHLm1haW4gb24gaW5pdCAqL1xyXG5pbnRlcmZhY2UgRGF0YVJlZnNcclxue1xyXG4gICAgLyoqIFNlbGVjdG9yIGZvciBnZXR0aW5nIHRoZSBwaHJhc2Ugc2V0IFhNTCBJRnJhbWUgZWxlbWVudCAqL1xyXG4gICAgcGhyYXNlc2V0RW1iZWQgOiBzdHJpbmc7XHJcbiAgICAvKiogUmF3IGFycmF5IG9mIGV4Y3VzZXMgZm9yIHRyYWluIGRlbGF5cyBvciBjYW5jZWxsYXRpb25zIHRvIHVzZSAqL1xyXG4gICAgZXhjdXNlc0RhdGEgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgbmFtZXMgZm9yIHNwZWNpYWwgdHJhaW5zIHRvIHVzZSAqL1xyXG4gICAgbmFtZWREYXRhICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgYXJyYXkgb2YgbmFtZXMgZm9yIHNlcnZpY2VzL25ldHdvcmtzIHRvIHVzZSAqL1xyXG4gICAgc2VydmljZXNEYXRhICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBSYXcgZGljdGlvbmFyeSBvZiBzdGF0aW9uIGNvZGVzIGFuZCBuYW1lcyB0byB1c2UgKi9cclxuICAgIHN0YXRpb25zRGF0YSAgIDogRGljdGlvbmFyeTxzdHJpbmc+O1xyXG59XHJcblxyXG4vKiogRmlsbCBpbnMgZm9yIHZhcmlvdXMgbWlzc2luZyBkZWZpbml0aW9ucyBvZiBtb2Rlcm4gSmF2YXNjcmlwdCBmZWF0dXJlcyAqL1xyXG5cclxuaW50ZXJmYWNlIFdpbmRvd1xyXG57XHJcbiAgICBvbnVuaGFuZGxlZHJlamVjdGlvbjogRXJyb3JFdmVudEhhbmRsZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTdHJpbmdcclxue1xyXG4gICAgcGFkU3RhcnQodGFyZ2V0TGVuZ3RoOiBudW1iZXIsIHBhZFN0cmluZz86IHN0cmluZykgOiBzdHJpbmc7XHJcbiAgICBwYWRFbmQodGFyZ2V0TGVuZ3RoOiBudW1iZXIsIHBhZFN0cmluZz86IHN0cmluZykgOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBcnJheTxUPlxyXG57XHJcbiAgICBpbmNsdWRlcyhzZWFyY2hFbGVtZW50OiBULCBmcm9tSW5kZXg/OiBudW1iZXIpIDogYm9vbGVhbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEhUTUxFbGVtZW50XHJcbntcclxuICAgIGxhYmVscyA6IE5vZGVMaXN0T2Y8SFRNTEVsZW1lbnQ+O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXVkaW9Db250ZXh0QmFzZVxyXG57XHJcbiAgICBhdWRpb1dvcmtsZXQgOiBBdWRpb1dvcmtsZXQ7XHJcbn1cclxuXHJcbnR5cGUgU2FtcGxlQ2hhbm5lbHMgPSBGbG9hdDMyQXJyYXlbXVtdO1xyXG5cclxuZGVjbGFyZSBjbGFzcyBBdWRpb1dvcmtsZXRQcm9jZXNzb3Jcclxue1xyXG4gICAgc3RhdGljIHBhcmFtZXRlckRlc2NyaXB0b3JzIDogQXVkaW9QYXJhbURlc2NyaXB0b3JbXTtcclxuXHJcbiAgICBwcm90ZWN0ZWQgY29uc3RydWN0b3Iob3B0aW9ucz86IEF1ZGlvV29ya2xldE5vZGVPcHRpb25zKTtcclxuICAgIHJlYWRvbmx5IHBvcnQ/OiBNZXNzYWdlUG9ydDtcclxuXHJcbiAgICBwcm9jZXNzKFxyXG4gICAgICAgIGlucHV0czogU2FtcGxlQ2hhbm5lbHMsXHJcbiAgICAgICAgb3V0cHV0czogU2FtcGxlQ2hhbm5lbHMsXHJcbiAgICAgICAgcGFyYW1ldGVyczogRGljdGlvbmFyeTxGbG9hdDMyQXJyYXk+XHJcbiAgICApIDogYm9vbGVhbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEF1ZGlvV29ya2xldE5vZGVPcHRpb25zIGV4dGVuZHMgQXVkaW9Ob2RlT3B0aW9uc1xyXG57XHJcbiAgICBudW1iZXJPZklucHV0cz8gOiBudW1iZXI7XHJcbiAgICBudW1iZXJPZk91dHB1dHM/IDogbnVtYmVyO1xyXG4gICAgb3V0cHV0Q2hhbm5lbENvdW50PyA6IG51bWJlcltdO1xyXG4gICAgcGFyYW1ldGVyRGF0YT8gOiB7W2luZGV4OiBzdHJpbmddIDogbnVtYmVyfTtcclxuICAgIHByb2Nlc3Nvck9wdGlvbnM/IDogYW55O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTWVkaWFUcmFja0NvbnN0cmFpbnRTZXRcclxue1xyXG4gICAgYXV0b0dhaW5Db250cm9sPzogYm9vbGVhbiB8IENvbnN0cmFpbkJvb2xlYW5QYXJhbWV0ZXJzO1xyXG4gICAgbm9pc2VTdXBwcmVzc2lvbj86IGJvb2xlYW4gfCBDb25zdHJhaW5Cb29sZWFuUGFyYW1ldGVycztcclxufVxyXG5cclxuZGVjbGFyZSBmdW5jdGlvbiByZWdpc3RlclByb2Nlc3NvcihuYW1lOiBzdHJpbmcsIGN0b3I6IEF1ZGlvV29ya2xldFByb2Nlc3NvcikgOiB2b2lkOyIsIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLyoqIE1hbmFnZXMgZGF0YSBmb3IgZXhjdXNlcywgdHJhaW5zLCBzZXJ2aWNlcyBhbmQgc3RhdGlvbnMgKi9cclxuY2xhc3MgRGF0YWJhc2Vcclxue1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIGRlbGF5IG9yIGNhbmNlbGxhdGlvbiBleGN1c2VzICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IGV4Y3VzZXMgICAgICAgOiBzdHJpbmdbXTtcclxuICAgIC8qKiBMb2FkZWQgZGF0YXNldCBvZiBuYW1lZCB0cmFpbnMgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgbmFtZWQgICAgICAgICA6IHN0cmluZ1tdO1xyXG4gICAgLyoqIExvYWRlZCBkYXRhc2V0IG9mIHNlcnZpY2Ugb3IgbmV0d29yayBuYW1lcyAqL1xyXG4gICAgcHVibGljICByZWFkb25seSBzZXJ2aWNlcyAgICAgIDogc3RyaW5nW107XHJcbiAgICAvKiogTG9hZGVkIGRpY3Rpb25hcnkgb2Ygc3RhdGlvbiBuYW1lcywgd2l0aCB0aHJlZS1sZXR0ZXIgY29kZSBrZXlzIChlLmcuIEFCQykgKi9cclxuICAgIHB1YmxpYyAgcmVhZG9ubHkgc3RhdGlvbnMgICAgICA6IERpY3Rpb25hcnk8U3RhdGlvbj47XHJcbiAgICAvKiogTG9hZGVkIFhNTCBkb2N1bWVudCBjb250YWluaW5nIHBocmFzZXNldCBkYXRhICovXHJcbiAgICBwdWJsaWMgIHJlYWRvbmx5IHBocmFzZXNldHMgICAgOiBEb2N1bWVudDtcclxuICAgIC8qKiBBbW91bnQgb2Ygc3RhdGlvbnMgaW4gdGhlIGN1cnJlbnRseSBsb2FkZWQgZGF0YXNldCAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzdGF0aW9uc0NvdW50IDogbnVtYmVyO1xyXG5cclxuICAgIHB1YmxpYyBjb25zdHJ1Y3RvcihkYXRhUmVmczogRGF0YVJlZnMpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHF1ZXJ5ICA9IGRhdGFSZWZzLnBocmFzZXNldEVtYmVkO1xyXG4gICAgICAgIGxldCBpZnJhbWUgPSBET00ucmVxdWlyZSA8SFRNTElGcmFtZUVsZW1lbnQ+IChxdWVyeSk7XHJcblxyXG4gICAgICAgIGlmICghaWZyYW1lLmNvbnRlbnREb2N1bWVudClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuREJfRUxFTUVOVF9OT1RfUEhSQVNFU0VUX0lGUkFNRShxdWVyeSkgKTtcclxuXHJcbiAgICAgICAgdGhpcy5waHJhc2VzZXRzICAgID0gaWZyYW1lLmNvbnRlbnREb2N1bWVudDtcclxuICAgICAgICB0aGlzLmV4Y3VzZXMgICAgICAgPSBkYXRhUmVmcy5leGN1c2VzRGF0YTtcclxuICAgICAgICB0aGlzLm5hbWVkICAgICAgICAgPSBkYXRhUmVmcy5uYW1lZERhdGE7XHJcbiAgICAgICAgdGhpcy5zZXJ2aWNlcyAgICAgID0gZGF0YVJlZnMuc2VydmljZXNEYXRhO1xyXG4gICAgICAgIHRoaXMuc3RhdGlvbnMgICAgICA9IGRhdGFSZWZzLnN0YXRpb25zRGF0YTtcclxuICAgICAgICB0aGlzLnN0YXRpb25zQ291bnQgPSBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGg7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbRGF0YWJhc2VdIEVudHJpZXMgbG9hZGVkOicpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXHRFeGN1c2VzOicsICAgICAgdGhpcy5leGN1c2VzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdE5hbWVkIHRyYWluczonLCB0aGlzLm5hbWVkLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdFNlcnZpY2VzOicsICAgICB0aGlzLnNlcnZpY2VzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcdFN0YXRpb25zOicsICAgICB0aGlzLnN0YXRpb25zQ291bnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBleGN1c2UgZm9yIGEgZGVsYXkgb3IgY2FuY2VsbGF0aW9uICovXHJcbiAgICBwdWJsaWMgcGlja0V4Y3VzZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLmV4Y3VzZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBQaWNrcyBhIHJhbmRvbSBuYW1lZCB0cmFpbiAqL1xyXG4gICAgcHVibGljIHBpY2tOYW1lZCgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5hcnJheSh0aGlzLm5hbWVkKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENsb25lcyBhbmQgZ2V0cyBwaHJhc2Ugd2l0aCB0aGUgZ2l2ZW4gSUQsIG9yIG51bGwgaWYgaXQgZG9lc24ndCBleGlzdC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWQgSUQgb2YgdGhlIHBocmFzZSB0byBnZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZShpZDogc3RyaW5nKSA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSB0aGlzLnBocmFzZXNldHMucXVlcnlTZWxlY3RvcigncGhyYXNlIycgKyBpZCkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIGlmIChyZXN1bHQpXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQ7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgcGhyYXNlc2V0IHdpdGggdGhlIGdpdmVuIElELCBvciBudWxsIGlmIGl0IGRvZXNuJ3QgZXhpc3QuIE5vdGUgdGhhdCB0aGVcclxuICAgICAqIHJldHVybmVkIHBocmFzZXNldCBjb21lcyBmcm9tIHRoZSBYTUwgZG9jdW1lbnQsIHNvIGl0IHNob3VsZCBub3QgYmUgbXV0YXRlZC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gaWQgSUQgb2YgdGhlIHBocmFzZXNldCB0byBnZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldChpZDogc3RyaW5nKSA6IEhUTUxFbGVtZW50IHwgbnVsbFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnBocmFzZXNldHMucXVlcnlTZWxlY3RvcigncGhyYXNlc2V0IycgKyBpZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFBpY2tzIGEgcmFuZG9tIHJhaWwgbmV0d29yayBuYW1lICovXHJcbiAgICBwdWJsaWMgcGlja1NlcnZpY2UoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBSYW5kb20uYXJyYXkodGhpcy5zZXJ2aWNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSBzdGF0aW9uIGNvZGUgZnJvbSB0aGUgZGF0YXNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gZXhjbHVkZSBMaXN0IG9mIGNvZGVzIHRvIGV4Y2x1ZGUuIE1heSBiZSBpZ25vcmVkIGlmIHNlYXJjaCB0YWtlcyB0b28gbG9uZy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIHBpY2tTdGF0aW9uQ29kZShleGNsdWRlPzogc3RyaW5nW10pIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgLy8gR2l2ZSB1cCBmaW5kaW5nIHJhbmRvbSBzdGF0aW9uIHRoYXQncyBub3QgaW4gdGhlIGdpdmVuIGxpc3QsIGlmIHdlIHRyeSBtb3JlXHJcbiAgICAgICAgLy8gdGltZXMgdGhlbiB0aGVyZSBhcmUgc3RhdGlvbnMuIEluYWNjdXJhdGUsIGJ1dCBhdm9pZHMgaW5maW5pdGUgbG9vcHMuXHJcbiAgICAgICAgaWYgKGV4Y2x1ZGUpIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zdGF0aW9uc0NvdW50OyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCAhZXhjbHVkZS5pbmNsdWRlcyh2YWx1ZSkgKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIFJhbmRvbS5vYmplY3RLZXkodGhpcy5zdGF0aW9ucyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBzdGF0aW9uIG5hbWUgZnJvbSB0aGUgZ2l2ZW4gdGhyZWUgbGV0dGVyIGNvZGUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgVGhyZWUtbGV0dGVyIHN0YXRpb24gY29kZSB0byBnZXQgdGhlIG5hbWUgb2ZcclxuICAgICAqIEByZXR1cm5zIFN0YXRpb24gbmFtZSBmb3IgdGhlIGdpdmVuIGNvZGVcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFN0YXRpb24oY29kZTogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGxldCBzdGF0aW9uID0gdGhpcy5zdGF0aW9uc1tjb2RlXTtcclxuXHJcbiAgICAgICAgaWYgKCFzdGF0aW9uKVxyXG4gICAgICAgICAgICByZXR1cm4gTC5EQl9VTktOT1dOX1NUQVRJT04oY29kZSk7XHJcblxyXG4gICAgICAgIGlmICh0eXBlb2Ygc3RhdGlvbiA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgICAgIHJldHVybiBTdHJpbmdzLmlzTnVsbE9yRW1wdHkoc3RhdGlvbilcclxuICAgICAgICAgICAgICAgID8gTC5EQl9FTVBUWV9TVEFUSU9OKGNvZGUpXHJcbiAgICAgICAgICAgICAgICA6IHN0YXRpb247XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICByZXR1cm4gIXN0YXRpb24ubmFtZVxyXG4gICAgICAgICAgICAgICAgPyBMLkRCX0VNUFRZX1NUQVRJT04oY29kZSlcclxuICAgICAgICAgICAgICAgIDogc3RhdGlvbi5uYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgZ2l2ZW4gc3RhdGlvbiBjb2RlJ3Mgdm94IGFsaWFzLCBpZiBhbnkuIEEgdm94IGFsaWFzIGlzIHRoZSBjb2RlIG9mIGFub3RoZXJcclxuICAgICAqIHN0YXRpb24ncyB2b2ljZSBmaWxlLCB0aGF0IHRoZSBnaXZlbiBjb2RlIHNob3VsZCB1c2UgaW5zdGVhZC4gVGhpcyBpcyB1c2VkIGZvclxyXG4gICAgICogc3RhdGlvbnMgd2l0aCBkdXBsaWNhdGUgbmFtZXMuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvZGUgU3RhdGlvbiBjb2RlIHRvIGdldCB0aGUgdm94IGFsaWFzIG9mXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgYWxpYXMgY29kZSwgZWxzZSB0aGUgZ2l2ZW4gY29kZVxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvblZveChjb2RlOiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXRpb24gPSB0aGlzLnN0YXRpb25zW2NvZGVdO1xyXG5cclxuICAgICAgICAvLyBVbmtub3duIHN0YXRpb25cclxuICAgICAgICBpZiAgICAgICghc3RhdGlvbilcclxuICAgICAgICAgICAgcmV0dXJuICc/Pz8nO1xyXG4gICAgICAgIC8vIFN0YXRpb24gaXMganVzdCBhIHN0cmluZzsgYXNzdW1lIG5vIGFsaWFzXHJcbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIHN0YXRpb24gPT09ICdzdHJpbmcnKVxyXG4gICAgICAgICAgICByZXR1cm4gY29kZTtcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiBlaXRoZXIoc3RhdGlvbi52b3hBbGlhcywgY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBQaWNrcyBhIHJhbmRvbSByYW5nZSBvZiBzdGF0aW9uIGNvZGVzLCBlbnN1cmluZyB0aGVyZSBhcmUgbm8gZHVwbGljYXRlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gbWluIE1pbmltdW0gYW1vdW50IG9mIHN0YXRpb25zIHRvIHBpY2tcclxuICAgICAqIEBwYXJhbSBtYXggTWF4aW11bSBhbW91bnQgb2Ygc3RhdGlvbnMgdG8gcGlja1xyXG4gICAgICogQHBhcmFtIGV4Y2x1ZGVcclxuICAgICAqIEByZXR1cm5zIEEgbGlzdCBvZiB1bmlxdWUgc3RhdGlvbiBuYW1lc1xyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcGlja1N0YXRpb25Db2RlcyhtaW4gPSAxLCBtYXggPSAxNiwgZXhjbHVkZT8gOiBzdHJpbmdbXSkgOiBzdHJpbmdbXVxyXG4gICAge1xyXG4gICAgICAgIGlmIChtYXggLSBtaW4gPiBPYmplY3Qua2V5cyh0aGlzLnN0YXRpb25zKS5sZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCBMLkRCX1RPT19NQU5ZX1NUQVRJT05TKCkgKTtcclxuXHJcbiAgICAgICAgbGV0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICAgICAgbGV0IGxlbmd0aCA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIGxldCB0cmllcyAgPSAwO1xyXG5cclxuICAgICAgICB3aGlsZSAocmVzdWx0Lmxlbmd0aCA8IGxlbmd0aClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBrZXkgPSBSYW5kb20ub2JqZWN0S2V5KHRoaXMuc3RhdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgLy8gR2l2ZSB1cCB0cnlpbmcgdG8gYXZvaWQgZHVwbGljYXRlcywgaWYgd2UgdHJ5IG1vcmUgdGltZXMgdGhhbiB0aGVyZSBhcmVcclxuICAgICAgICAgICAgLy8gc3RhdGlvbnMgYXZhaWxhYmxlLiBJbmFjY3VyYXRlLCBidXQgZ29vZCBlbm91Z2guXHJcbiAgICAgICAgICAgIGlmICh0cmllcysrID49IHRoaXMuc3RhdGlvbnNDb3VudClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBnaXZlbiBhbiBleGNsdXNpb24gbGlzdCwgY2hlY2sgYWdhaW5zdCBib3RoIHRoYXQgYW5kIHJlc3VsdHNcclxuICAgICAgICAgICAgZWxzZSBpZiAoIGV4Y2x1ZGUgJiYgIWV4Y2x1ZGUuaW5jbHVkZXMoa2V5KSAmJiAhcmVzdWx0LmluY2x1ZGVzKGtleSkgKVxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIG5vdCwganVzdCBjaGVjayB3aGF0IHJlc3VsdHMgd2UndmUgYWxyZWFkeSBmb3VuZFxyXG4gICAgICAgICAgICBlbHNlIGlmICggIWV4Y2x1ZGUgJiYgIXJlc3VsdC5pbmNsdWRlcyhrZXkpIClcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59IiwiLyoqIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IuIEJ5IFJveSBDdXJ0aXMsIE1JVCBsaWNlbnNlLCAyMDE4ICovXHJcblxyXG4vKiogTWFpbiBjbGFzcyBvZiB0aGUgZW50aXJlIFJhaWwgQW5ub3VuY2VtZW50cyBHZW5lcmF0b3IgYXBwbGljYXRpb24gKi9cclxuY2xhc3MgUkFHXHJcbntcclxuICAgIC8qKiBHZXRzIHRoZSBjb25maWd1cmF0aW9uIGNvbnRhaW5lciAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBjb25maWcgICA6IENvbmZpZztcclxuICAgIC8qKiBHZXRzIHRoZSBkYXRhYmFzZSBtYW5hZ2VyLCB3aGljaCBob2xkcyBwaHJhc2UsIHN0YXRpb24gYW5kIHRyYWluIGRhdGEgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZGF0YWJhc2UgOiBEYXRhYmFzZTtcclxuICAgIC8qKiBHZXRzIHRoZSBwaHJhc2UgbWFuYWdlciwgd2hpY2ggZ2VuZXJhdGVzIEhUTUwgcGhyYXNlcyBmcm9tIFhNTCAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBwaHJhc2VyICA6IFBocmFzZXI7XHJcbiAgICAvKiogR2V0cyB0aGUgc3BlZWNoIGVuZ2luZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBzcGVlY2ggICA6IFNwZWVjaDtcclxuICAgIC8qKiBHZXRzIHRoZSBjdXJyZW50IHRyYWluIGFuZCBzdGF0aW9uIHN0YXRlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHN0YXRlICAgIDogU3RhdGU7XHJcbiAgICAvKiogR2V0cyB0aGUgdmlldyBjb250cm9sbGVyLCB3aGljaCBtYW5hZ2VzIFVJIGludGVyYWN0aW9uICovXHJcbiAgICBwdWJsaWMgc3RhdGljIHZpZXdzICAgIDogVmlld3M7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFbnRyeSBwb2ludCBmb3IgUkFHLCB0byBiZSBjYWxsZWQgZnJvbSBKYXZhc2NyaXB0LlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBkYXRhUmVmcyBDb25maWd1cmF0aW9uIG9iamVjdCwgd2l0aCByYWlsIGRhdGEgdG8gdXNlXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgbWFpbihkYXRhUmVmczogRGF0YVJlZnMpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHdpbmRvdy5vbmVycm9yICAgICAgICAgICAgICA9IGVycm9yID0+IFJBRy5wYW5pYyhlcnJvcik7XHJcbiAgICAgICAgd2luZG93Lm9udW5oYW5kbGVkcmVqZWN0aW9uID0gZXJyb3IgPT4gUkFHLnBhbmljKGVycm9yKTtcclxuXHJcbiAgICAgICAgSTE4bi5pbml0KCk7XHJcblxyXG4gICAgICAgIFJBRy5jb25maWcgICA9IG5ldyBDb25maWcodHJ1ZSk7XHJcbiAgICAgICAgUkFHLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlKGRhdGFSZWZzKTtcclxuICAgICAgICBSQUcudmlld3MgICAgPSBuZXcgVmlld3MoKTtcclxuICAgICAgICBSQUcucGhyYXNlciAgPSBuZXcgUGhyYXNlcigpO1xyXG4gICAgICAgIFJBRy5zcGVlY2ggICA9IG5ldyBTcGVlY2goKTtcclxuXHJcbiAgICAgICAgLy8gQmVnaW5cclxuXHJcbiAgICAgICAgUkFHLnZpZXdzLmRpc2NsYWltZXIuZGlzY2xhaW0oKTtcclxuICAgICAgICBSQUcudmlld3MubWFycXVlZS5zZXQoIEwuV0VMQ09NRSgpICk7XHJcbiAgICAgICAgUkFHLmdlbmVyYXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdlbmVyYXRlcyBhIG5ldyByYW5kb20gcGhyYXNlIGFuZCBzdGF0ZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBnZW5lcmF0ZSgpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIFJBRy5zdGF0ZSA9IG5ldyBTdGF0ZSgpO1xyXG4gICAgICAgIFJBRy5zdGF0ZS5nZW5EZWZhdWx0U3RhdGUoKTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmdlbmVyYXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIExvYWRzIHN0YXRlIGZyb20gZ2l2ZW4gSlNPTiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBsb2FkKGpzb246IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgUkFHLnN0YXRlID0gT2JqZWN0LmFzc2lnbiggbmV3IFN0YXRlKCksIEpTT04ucGFyc2UoanNvbikgKSBhcyBTdGF0ZTtcclxuICAgICAgICBSQUcudmlld3MuZWRpdG9yLmdlbmVyYXRlKCk7XHJcbiAgICAgICAgUkFHLnZpZXdzLm1hcnF1ZWUuc2V0KCBMLlNUQVRFX0ZST01fU1RPUkFHRSgpICk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdsb2JhbCBlcnJvciBoYW5kbGVyOyB0aHJvd3MgdXAgYSBiaWcgcmVkIHBhbmljIHNjcmVlbiBvbiB1bmNhdWdodCBlcnJvciAqL1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgcGFuaWMoZXJyb3I6IHN0cmluZyB8IEV2ZW50ID0gXCJVbmtub3duIGVycm9yXCIpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IG1zZyA9ICc8ZGl2IGlkPVwicGFuaWNTY3JlZW5cIiBjbGFzcz1cIndhcm5pbmdTY3JlZW5cIj4nO1xyXG4gICAgICAgIG1zZyAgICArPSAnPGgxPlwiV2UgYXJlIHNvcnJ5IHRvIGFubm91bmNlIHRoYXQuLi5cIjwvaDE+JztcclxuICAgICAgICBtc2cgICAgKz0gYDxwPlJBRyBoYXMgY3Jhc2hlZCBiZWNhdXNlOiA8Y29kZT4ke2Vycm9yfTwvY29kZT48L3A+YDtcclxuICAgICAgICBtc2cgICAgKz0gYDxwPlBsZWFzZSBvcGVuIHRoZSBjb25zb2xlIGZvciBtb3JlIGluZm9ybWF0aW9uLjwvcD5gO1xyXG4gICAgICAgIG1zZyAgICArPSAnPC9kaXY+JztcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5pbm5lckhUTUwgPSBtc2c7XHJcbiAgICB9XHJcbn0iLCIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8qKiBEaXNwb3NhYmxlIGNsYXNzIHRoYXQgaG9sZHMgc3RhdGUgZm9yIHRoZSBjdXJyZW50IHNjaGVkdWxlLCB0cmFpbiwgZXRjLiAqL1xyXG5jbGFzcyBTdGF0ZVxyXG57XHJcbiAgICAvKiogU3RhdGUgb2YgY29sbGFwc2libGUgZWxlbWVudHMuIEtleSBpcyByZWZlcmVuY2UgSUQsIHZhbHVlIGlzIGNvbGxhcHNlZC4gKi9cclxuICAgIHByaXZhdGUgX2NvbGxhcHNpYmxlcyA6IERpY3Rpb25hcnk8Ym9vbGVhbj4gID0ge307XHJcbiAgICAvKiogQ3VycmVudCBjb2FjaCBsZXR0ZXIgY2hvaWNlcy4gS2V5IGlzIGNvbnRleHQgSUQsIHZhbHVlIGlzIGxldHRlci4gKi9cclxuICAgIHByaXZhdGUgX2NvYWNoZXMgICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBpbnRlZ2VyIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBpbnRlZ2VyLiAqL1xyXG4gICAgcHJpdmF0ZSBfaW50ZWdlcnMgICAgIDogRGljdGlvbmFyeTxudW1iZXI+ICAgPSB7fTtcclxuICAgIC8qKiBDdXJyZW50IHBocmFzZXNldCBwaHJhc2UgY2hvaWNlcy4gS2V5IGlzIHJlZmVyZW5jZSBJRCwgdmFsdWUgaXMgaW5kZXguICovXHJcbiAgICBwcml2YXRlIF9waHJhc2VzZXRzICAgOiBEaWN0aW9uYXJ5PG51bWJlcj4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc2VydmljZSBjaG9pY2VzLiBLZXkgaXMgY29udGV4dCBJRCwgdmFsdWUgaXMgc2VydmljZS4gKi9cclxuICAgIHByaXZhdGUgX3NlcnZpY2VzICAgICA6IERpY3Rpb25hcnk8c3RyaW5nPiAgID0ge307XHJcbiAgICAvKiogQ3VycmVudCBzdGF0aW9uIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBzdGF0aW9uIGNvZGUuICovXHJcbiAgICBwcml2YXRlIF9zdGF0aW9ucyAgICAgOiBEaWN0aW9uYXJ5PHN0cmluZz4gICA9IHt9O1xyXG4gICAgLyoqIEN1cnJlbnQgc3RhdGlvbiBsaXN0IGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyBhcnJheSBvZiBjb2Rlcy4gKi9cclxuICAgIHByaXZhdGUgX3N0YXRpb25MaXN0cyA6IERpY3Rpb25hcnk8c3RyaW5nW10+ID0ge307XHJcbiAgICAvKiogQ3VycmVudCB0aW1lIGNob2ljZXMuIEtleSBpcyBjb250ZXh0IElELCB2YWx1ZSBpcyB0aW1lLiAqL1xyXG4gICAgcHJpdmF0ZSBfdGltZXMgICAgICAgIDogRGljdGlvbmFyeTxzdHJpbmc+ICAgPSB7fTtcclxuXHJcbiAgICAvKiogQ3VycmVudGx5IGNob3NlbiBleGN1c2UgKi9cclxuICAgIHByaXZhdGUgX2V4Y3VzZT8gICA6IHN0cmluZztcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIHBsYXRmb3JtICovXHJcbiAgICBwcml2YXRlIF9wbGF0Zm9ybT8gOiBQbGF0Zm9ybTtcclxuICAgIC8qKiBDdXJyZW50bHkgY2hvc2VuIG5hbWVkIHRyYWluICovXHJcbiAgICBwcml2YXRlIF9uYW1lZD8gICAgOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGNvYWNoIGxldHRlciwgb3IgcmFuZG9tbHkgcGlja3Mgb25lIGZyb20gQSB0byBaLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgbGV0dGVyIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29hY2goY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb2FjaGVzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2FjaGVzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICB0aGlzLl9jb2FjaGVzW2NvbnRleHRdID0gUmFuZG9tLmFycmF5KEwuTEVUVEVSUyk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvYWNoZXNbY29udGV4dF07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29hY2ggbGV0dGVyLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gc2V0IHRoZSBsZXR0ZXIgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29hY2ggVmFsdWUgdG8gc2V0XHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBzZXRDb2FjaChjb250ZXh0OiBzdHJpbmcsIGNvYWNoOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvYWNoZXNbY29udGV4dF0gPSBjb2FjaDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGNvbGxhcHNlIHN0YXRlIG9mIGEgY29sbGFwc2libGUsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gY2hhbmNlIENoYW5jZSBiZXR3ZWVuIDAgYW5kIDEwMCBvZiBjaG9vc2luZyB0cnVlLCBpZiB1bnNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0Q29sbGFwc2VkKHJlZjogc3RyaW5nLCBjaGFuY2U6IG51bWJlcikgOiBib29sZWFuXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb2xsYXBzaWJsZXNbcmVmXTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29sbGFwc2libGVzW3JlZl0gPSAhUmFuZG9tLmJvb2woY2hhbmNlKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fY29sbGFwc2libGVzW3JlZl07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIGEgY29sbGFwc2libGUncyBzdGF0ZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBzZXQgdGhlIGNvbGxhcHNpYmxlIHN0YXRlIG9mXHJcbiAgICAgKiBAcGFyYW0gc3RhdGUgVmFsdWUgdG8gc2V0LCB3aGVyZSB0cnVlIGlzIFwiY29sbGFwc2VkXCJcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldENvbGxhcHNlZChyZWY6IHN0cmluZywgc3RhdGU6IGJvb2xlYW4pIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX2NvbGxhcHNpYmxlc1tyZWZdID0gc3RhdGU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50bHkgY2hvc2VuIGludGVnZXIsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIGdldCBvciBjaG9vc2UgdGhlIGludGVnZXIgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRJbnRlZ2VyKGNvbnRleHQ6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5faW50ZWdlcnNbY29udGV4dF0gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2ludGVnZXJzW2NvbnRleHRdO1xyXG5cclxuICAgICAgICBsZXQgbWluID0gMCwgbWF4ID0gMDtcclxuXHJcbiAgICAgICAgc3dpdGNoKGNvbnRleHQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlIFwiY29hY2hlc1wiOiAgICAgICBtaW4gPSAxOyBtYXggPSAxMDsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJkZWxheWVkXCI6ICAgICAgIG1pbiA9IDU7IG1heCA9IDYwOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImZyb250X2NvYWNoZXNcIjogbWluID0gMjsgbWF4ID0gNTsgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwicmVhcl9jb2FjaGVzXCI6ICBtaW4gPSAyOyBtYXggPSA1OyAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IFJhbmRvbS5pbnQobWluLCBtYXgpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgYW4gaW50ZWdlci5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgaW50ZWdlciBmb3JcclxuICAgICAqIEBwYXJhbSB2YWx1ZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldEludGVnZXIoY29udGV4dDogc3RyaW5nLCB2YWx1ZTogbnVtYmVyKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9pbnRlZ2Vyc1tjb250ZXh0XSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBwaHJhc2Ugb2YgYSBwaHJhc2VzZXQsIG9yIHJhbmRvbWx5IHBpY2tzIG9uZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBwaHJhc2VzZXQncyBwaHJhc2Ugb2ZcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFBocmFzZXNldElkeChyZWY6IHN0cmluZykgOiBudW1iZXJcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fcGhyYXNlc2V0c1tyZWZdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9waHJhc2VzZXRzW3JlZl07XHJcblxyXG4gICAgICAgIGxldCBwaHJhc2VzZXQgPSBSQUcuZGF0YWJhc2UuZ2V0UGhyYXNlc2V0KHJlZik7XHJcblxyXG4gICAgICAgIC8vIFRPRE86IGlzIHRoaXMgc2FmZSBhY3Jvc3MgcGhyYXNlc2V0IGNoYW5nZXM/XHJcbiAgICAgICAgLy8gVE9ETzogaW50cm9kdWNlIGFuIGFzc2VydHMgdXRpbCwgYW5kIHN0YXJ0IHVzaW5nIHRoZW0gYWxsIG92ZXJcclxuICAgICAgICBpZiAoIXBocmFzZXNldClcclxuICAgICAgICAgICAgdGhyb3cgRXJyb3IoIEwuU1RBVEVfTk9ORVhJU1RBTlRfUEhSQVNFU0VUKHJlZikgKTtcclxuXHJcbiAgICAgICAgdGhpcy5fcGhyYXNlc2V0c1tyZWZdID0gUmFuZG9tLmludCgwLCBwaHJhc2VzZXQuY2hpbGRyZW4ubGVuZ3RoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcGhyYXNlc2V0c1tyZWZdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB0aGUgY2hvc2VuIGluZGV4IGZvciBhIHBocmFzZXNldC5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gcmVmIFJlZmVyZW5jZSBJRCB0byBzZXQgdGhlIHBocmFzZXNldCBpbmRleCBvZlxyXG4gICAgICogQHBhcmFtIGlkeCBJbmRleCB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFBocmFzZXNldElkeChyZWY6IHN0cmluZywgaWR4OiBudW1iZXIpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3BocmFzZXNldHNbcmVmXSA9IGlkeDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gc2VydmljZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgc2VydmljZSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFNlcnZpY2UoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9zZXJ2aWNlc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2VydmljZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdID0gUkFHLmRhdGFiYXNlLnBpY2tTZXJ2aWNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHNlcnZpY2UuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHNlcnZpY2UgZm9yXHJcbiAgICAgKiBAcGFyYW0gc2VydmljZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFNlcnZpY2UoY29udGV4dDogc3RyaW5nLCBzZXJ2aWNlOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3NlcnZpY2VzW2NvbnRleHRdID0gc2VydmljZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gc3RhdGlvbiBjb2RlLCBvciByYW5kb21seSBwaWNrcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBzdGF0aW9uIGZvclxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0U3RhdGlvbihjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3N0YXRpb25zW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uc1tjb250ZXh0XTtcclxuXHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbnNbY29udGV4dF0gPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXRpb25zW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHN0YXRpb24gY29kZS5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgc3RhdGlvbiBjb2RlIGZvclxyXG4gICAgICogQHBhcmFtIGNvZGUgU3RhdGlvbiBjb2RlIHRvIHNldFxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc2V0U3RhdGlvbihjb250ZXh0OiBzdHJpbmcsIGNvZGU6IHN0cmluZykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fc3RhdGlvbnNbY29udGV4dF0gPSBjb2RlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgY3VycmVudGx5IGNob3NlbiBsaXN0IG9mIHN0YXRpb24gY29kZXMsIG9yIHJhbmRvbWx5IGdlbmVyYXRlcyBvbmUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBnZXQgb3IgY2hvb3NlIHRoZSBzdGF0aW9uIGxpc3QgZm9yXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZXRTdGF0aW9uTGlzdChjb250ZXh0OiBzdHJpbmcpIDogc3RyaW5nW11cclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF07XHJcbiAgICAgICAgZWxzZSBpZiAoY29udGV4dCA9PT0gJ2NhbGxpbmdfZmlyc3QnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRTdGF0aW9uTGlzdCgnY2FsbGluZycpO1xyXG5cclxuICAgICAgICBsZXQgbWluID0gMSwgbWF4ID0gMTY7XHJcblxyXG4gICAgICAgIHN3aXRjaChjb250ZXh0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2FzZSAnY2FsbGluZ19zcGxpdCc6IG1pbiA9IDI7IG1heCA9IDE2OyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnY2hhbmdlcyc6ICAgICAgIG1pbiA9IDE7IG1heCA9IDQ7ICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnbm90X3N0b3BwaW5nJzogIG1pbiA9IDE7IG1heCA9IDg7ICBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX3N0YXRpb25MaXN0c1tjb250ZXh0XSA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKG1pbiwgbWF4KTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fc3RhdGlvbkxpc3RzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIGxpc3Qgb2Ygc3RhdGlvbiBjb2Rlcy5cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0gY29udGV4dCBDb250ZXh0IElEIHRvIHNldCB0aGUgc3RhdGlvbiBjb2RlIGxpc3QgZm9yXHJcbiAgICAgKiBAcGFyYW0gY29kZXMgU3RhdGlvbiBjb2RlcyB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFN0YXRpb25MaXN0KGNvbnRleHQ6IHN0cmluZywgY29kZXM6IHN0cmluZ1tdKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9zdGF0aW9uTGlzdHNbY29udGV4dF0gPSBjb2RlcztcclxuXHJcbiAgICAgICAgaWYgKGNvbnRleHQgPT09ICdjYWxsaW5nX2ZpcnN0JylcclxuICAgICAgICAgICAgdGhpcy5fc3RhdGlvbkxpc3RzWydjYWxsaW5nJ10gPSBjb2RlcztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGN1cnJlbnRseSBjaG9zZW4gdGltZVxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSBjb250ZXh0IENvbnRleHQgSUQgdG8gZ2V0IG9yIGNob29zZSB0aGUgdGltZSBmb3JcclxuICAgICAqL1xyXG4gICAgcHVibGljIGdldFRpbWUoY29udGV4dDogc3RyaW5nKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl90aW1lc1tjb250ZXh0XSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fdGltZXNbY29udGV4dF07XHJcblxyXG4gICAgICAgIHRoaXMuX3RpbWVzW2NvbnRleHRdID0gU3RyaW5ncy5mcm9tVGltZSggUmFuZG9tLmludCgwLCAyMyksIFJhbmRvbS5pbnQoMCwgNTkpICk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3RpbWVzW2NvbnRleHRdO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyBhIHRpbWUuXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRleHQgQ29udGV4dCBJRCB0byBzZXQgdGhlIHRpbWUgZm9yXHJcbiAgICAgKiBAcGFyYW0gdGltZSBWYWx1ZSB0byBzZXRcclxuICAgICAqL1xyXG4gICAgcHVibGljIHNldFRpbWUoY29udGV4dDogc3RyaW5nLCB0aW1lOiBzdHJpbmcpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuX3RpbWVzW2NvbnRleHRdID0gdGltZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIGV4Y3VzZSwgb3IgcmFuZG9tbHkgcGlja3Mgb25lICovXHJcbiAgICBwdWJsaWMgZ2V0IGV4Y3VzZSgpIDogc3RyaW5nXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2V4Y3VzZSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2V4Y3VzZTtcclxuXHJcbiAgICAgICAgdGhpcy5fZXhjdXNlID0gUkFHLmRhdGFiYXNlLnBpY2tFeGN1c2UoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fZXhjdXNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBjdXJyZW50IGV4Y3VzZSAqL1xyXG4gICAgcHVibGljIHNldCBleGN1c2UodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9leGN1c2UgPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIHBsYXRmb3JtLCBvciByYW5kb21seSBwaWNrcyBvbmUgKi9cclxuICAgIHB1YmxpYyBnZXQgcGxhdGZvcm0oKSA6IFBsYXRmb3JtXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3BsYXRmb3JtKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGxhdGZvcm07XHJcblxyXG4gICAgICAgIGxldCBwbGF0Zm9ybSA6IFBsYXRmb3JtID0gWycnLCAnJ107XHJcblxyXG4gICAgICAgIC8vIE9ubHkgMiUgY2hhbmNlIGZvciBwbGF0Zm9ybSAwLCBzaW5jZSBpdCdzIHJhcmVcclxuICAgICAgICBwbGF0Zm9ybVswXSA9IFJhbmRvbS5ib29sKDk4KVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5pbnQoMSwgMjYpLnRvU3RyaW5nKClcclxuICAgICAgICAgICAgOiAnMCc7XHJcblxyXG4gICAgICAgIC8vIE1hZ2ljIHZhbHVlc1xyXG4gICAgICAgIGlmIChwbGF0Zm9ybVswXSA9PT0gJzknKVxyXG4gICAgICAgICAgICBwbGF0Zm9ybVsxXSA9IFJhbmRvbS5ib29sKDI1KSA/ICfCvicgOiAnJztcclxuXHJcbiAgICAgICAgLy8gT25seSAxMCUgY2hhbmNlIGZvciBwbGF0Zm9ybSBsZXR0ZXIsIHNpbmNlIGl0J3MgdW5jb21tb25cclxuICAgICAgICBpZiAocGxhdGZvcm1bMV0gPT09ICcnKVxyXG4gICAgICAgICAgICBwbGF0Zm9ybVsxXSA9IFJhbmRvbS5ib29sKDEwKVxyXG4gICAgICAgICAgICAgICAgPyBSYW5kb20uYXJyYXkoJ0FCQycpXHJcbiAgICAgICAgICAgICAgICA6ICcnO1xyXG5cclxuICAgICAgICB0aGlzLl9wbGF0Zm9ybSA9IHBsYXRmb3JtO1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9wbGF0Zm9ybTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogU2V0cyB0aGUgY3VycmVudCBwbGF0Zm9ybSAqL1xyXG4gICAgcHVibGljIHNldCBwbGF0Zm9ybSh2YWx1ZTogUGxhdGZvcm0pXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5fcGxhdGZvcm0gPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgY2hvc2VuIG5hbWVkIHRyYWluLCBvciByYW5kb21seSBwaWNrcyBvbmUgKi9cclxuICAgIHB1YmxpYyBnZXQgbmFtZWQoKSA6IHN0cmluZ1xyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLl9uYW1lZClcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVkO1xyXG5cclxuICAgICAgICB0aGlzLl9uYW1lZCA9IFJBRy5kYXRhYmFzZS5waWNrTmFtZWQoKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5fbmFtZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIFNldHMgdGhlIGN1cnJlbnQgbmFtZWQgdHJhaW4gKi9cclxuICAgIHB1YmxpYyBzZXQgbmFtZWQodmFsdWU6IHN0cmluZylcclxuICAgIHtcclxuICAgICAgICB0aGlzLl9uYW1lZCA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB1cCB0aGUgc3RhdGUgaW4gYSBwYXJ0aWN1bGFyIHdheSwgc28gdGhhdCBpdCBtYWtlcyBzb21lIHJlYWwtd29ybGQgc2Vuc2UuXHJcbiAgICAgKiBUbyBkbyBzbywgd2UgaGF2ZSB0byBnZW5lcmF0ZSBkYXRhIGluIGEgcGFydGljdWxhciBvcmRlciwgYW5kIG1ha2Ugc3VyZSB0byBhdm9pZFxyXG4gICAgICogZHVwbGljYXRlcyBpbiBpbmFwcHJvcHJpYXRlIHBsYWNlcyBhbmQgY29udGV4dHMuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyBnZW5EZWZhdWx0U3RhdGUoKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICAvLyBTdGVwIDEuIFByZXBvcHVsYXRlIHN0YXRpb24gbGlzdHNcclxuXHJcbiAgICAgICAgbGV0IHNsQ2FsbGluZyAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgMTYpO1xyXG4gICAgICAgIGxldCBzbENhbGxTcGxpdCA9IFJBRy5kYXRhYmFzZS5waWNrU3RhdGlvbkNvZGVzKDIsIDE2LCBzbENhbGxpbmcpO1xyXG4gICAgICAgIGxldCBhbGxDYWxsaW5nICA9IFsuLi5zbENhbGxpbmcsIC4uLnNsQ2FsbFNwbGl0XTtcclxuXHJcbiAgICAgICAgLy8gTGlzdCBvZiBvdGhlciBzdGF0aW9ucyBmb3VuZCB2aWEgYSBzcGVjaWZpYyBjYWxsaW5nIHBvaW50XHJcbiAgICAgICAgbGV0IHNsQ2hhbmdlcyAgICAgPSBSQUcuZGF0YWJhc2UucGlja1N0YXRpb25Db2RlcygxLCA0LCBhbGxDYWxsaW5nKTtcclxuICAgICAgICAvLyBMaXN0IG9mIG90aGVyIHN0YXRpb25zIHRoYXQgdGhpcyB0cmFpbiB1c3VhbGx5IHNlcnZlcywgYnV0IGN1cnJlbnRseSBpc24ndFxyXG4gICAgICAgIGxldCBzbE5vdFN0b3BwaW5nID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZXMoMSwgOCxcclxuICAgICAgICAgICAgWy4uLmFsbENhbGxpbmcsIC4uLnNsQ2hhbmdlc11cclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBUYWtlIGEgcmFuZG9tIHNsaWNlIGZyb20gdGhlIGNhbGxpbmcgbGlzdCwgdG8gaWRlbnRpZnkgYXMgcmVxdWVzdCBzdG9wc1xyXG4gICAgICAgIGxldCByZXFDb3VudCAgID0gUmFuZG9tLmludCgxLCBzbENhbGxpbmcubGVuZ3RoIC0gMSk7XHJcbiAgICAgICAgbGV0IHNsUmVxdWVzdHMgPSBzbENhbGxpbmcuc2xpY2UoMCwgcmVxQ291bnQpO1xyXG5cclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjYWxsaW5nJywgICAgICAgc2xDYWxsaW5nKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdjYWxsaW5nX3NwbGl0Jywgc2xDYWxsU3BsaXQpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ2NoYW5nZXMnLCAgICAgICBzbENoYW5nZXMpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbkxpc3QoJ25vdF9zdG9wcGluZycsICBzbE5vdFN0b3BwaW5nKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb25MaXN0KCdyZXF1ZXN0JywgICAgICAgc2xSZXF1ZXN0cyk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgMi4gUHJlcG9wdWxhdGUgc3RhdGlvbnNcclxuXHJcbiAgICAgICAgLy8gQW55IHN0YXRpb24gbWF5IGJlIGJsYW1lZCBmb3IgYW4gZXhjdXNlLCBldmVuIG9uZXMgYWxyZWFkeSBwaWNrZWRcclxuICAgICAgICBsZXQgc3RFeGN1c2UgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZSgpO1xyXG4gICAgICAgIC8vIERlc3RpbmF0aW9uIGlzIGZpbmFsIGNhbGwgb2YgdGhlIGNhbGxpbmcgbGlzdFxyXG4gICAgICAgIGxldCBzdERlc3QgICAgPSBzbENhbGxpbmdbc2xDYWxsaW5nLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIC8vIFZpYSBpcyBhIGNhbGwgYmVmb3JlIHRoZSBkZXN0aW5hdGlvbiwgb3Igb25lIGluIHRoZSBzcGxpdCBsaXN0IGlmIHRvbyBzbWFsbFxyXG4gICAgICAgIGxldCBzdFZpYSAgICAgPSBzbENhbGxpbmcubGVuZ3RoID4gMVxyXG4gICAgICAgICAgICA/IFJhbmRvbS5hcnJheSggc2xDYWxsaW5nLnNsaWNlKDAsIC0xKSAgIClcclxuICAgICAgICAgICAgOiBSYW5kb20uYXJyYXkoIHNsQ2FsbFNwbGl0LnNsaWNlKDAsIC0xKSApO1xyXG4gICAgICAgIC8vIERpdHRvIGZvciBwaWNraW5nIGEgcmFuZG9tIGNhbGxpbmcgc3RhdGlvbiBhcyBhIHNpbmdsZSByZXF1ZXN0IG9yIGNoYW5nZSBzdG9wXHJcbiAgICAgICAgbGV0IHN0Q2FsbGluZyA9IHNsQ2FsbGluZy5sZW5ndGggPiAxXHJcbiAgICAgICAgICAgID8gUmFuZG9tLmFycmF5KCBzbENhbGxpbmcuc2xpY2UoMCwgLTEpICAgKVxyXG4gICAgICAgICAgICA6IFJhbmRvbS5hcnJheSggc2xDYWxsU3BsaXQuc2xpY2UoMCwgLTEpICk7XHJcblxyXG4gICAgICAgIC8vIERlc3RpbmF0aW9uIChsYXN0IGNhbGwpIG9mIHRoZSBzcGxpdCB0cmFpbidzIHNlY29uZCBoYWxmIG9mIHRoZSBsaXN0XHJcbiAgICAgICAgbGV0IHN0RGVzdFNwbGl0ID0gc2xDYWxsU3BsaXRbc2xDYWxsU3BsaXQubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgLy8gUmFuZG9tIG5vbi1kZXN0aW5hdGlvbiBzdG9wIG9mIHRoZSBzcGxpdCB0cmFpbidzIHNlY29uZCBoYWxmIG9mIHRoZSBsaXN0XHJcbiAgICAgICAgbGV0IHN0VmlhU3BsaXQgID0gUmFuZG9tLmFycmF5KCBzbENhbGxTcGxpdC5zbGljZSgwLCAtMSkgKTtcclxuICAgICAgICAvLyBXaGVyZSB0aGUgdHJhaW4gY29tZXMgZnJvbSwgc28gY2FuJ3QgYmUgb24gYW55IGxpc3RzIG9yIHByaW9yIHN0YXRpb25zXHJcbiAgICAgICAgbGV0IHN0U291cmNlICAgID0gUkFHLmRhdGFiYXNlLnBpY2tTdGF0aW9uQ29kZShbXHJcbiAgICAgICAgICAgIC4uLmFsbENhbGxpbmcsIC4uLnNsQ2hhbmdlcywgLi4uc2xOb3RTdG9wcGluZywgLi4uc2xSZXF1ZXN0cyxcclxuICAgICAgICAgICAgc3RDYWxsaW5nLCBzdERlc3QsIHN0VmlhLCBzdERlc3RTcGxpdCwgc3RWaWFTcGxpdFxyXG4gICAgICAgIF0pO1xyXG5cclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2NhbGxpbmcnLCAgICAgICAgICAgc3RDYWxsaW5nKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2Rlc3RpbmF0aW9uJywgICAgICAgc3REZXN0KTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ2Rlc3RpbmF0aW9uX3NwbGl0Jywgc3REZXN0U3BsaXQpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbignZXhjdXNlJywgICAgICAgICAgICBzdEV4Y3VzZSk7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0aW9uKCdzb3VyY2UnLCAgICAgICAgICAgIHN0U291cmNlKTtcclxuICAgICAgICB0aGlzLnNldFN0YXRpb24oJ3ZpYScsICAgICAgICAgICAgICAgc3RWaWEpO1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGlvbigndmlhX3NwbGl0JywgICAgICAgICBzdFZpYVNwbGl0KTtcclxuXHJcbiAgICAgICAgLy8gU3RlcCAzLiBQcmVwb3B1bGF0ZSBjb2FjaCBudW1iZXJzXHJcblxyXG4gICAgICAgIGxldCBpbnRDb2FjaGVzID0gdGhpcy5nZXRJbnRlZ2VyKCdjb2FjaGVzJyk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZXJlIGFyZSBlbm91Z2ggY29hY2hlcywganVzdCBzcGxpdCB0aGUgbnVtYmVyIGRvd24gdGhlIG1pZGRsZSBpbnN0ZWFkLlxyXG4gICAgICAgIC8vIEVsc2UsIGZyb250IGFuZCByZWFyIGNvYWNoZXMgd2lsbCBiZSByYW5kb21seSBwaWNrZWQgKHdpdGhvdXQgbWFraW5nIHNlbnNlKVxyXG4gICAgICAgIGlmIChpbnRDb2FjaGVzID49IDQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgaW50RnJvbnRDb2FjaGVzID0gKGludENvYWNoZXMgLyAyKSB8IDA7XHJcbiAgICAgICAgICAgIGxldCBpbnRSZWFyQ29hY2hlcyAgPSBpbnRDb2FjaGVzIC0gaW50RnJvbnRDb2FjaGVzO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXRJbnRlZ2VyKCdmcm9udF9jb2FjaGVzJywgaW50RnJvbnRDb2FjaGVzKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRJbnRlZ2VyKCdyZWFyX2NvYWNoZXMnLCBpbnRSZWFyQ29hY2hlcyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgZW5vdWdoIGNvYWNoZXMsIGFzc2lnbiBjb2FjaCBsZXR0ZXJzIGZvciBjb250ZXh0cy5cclxuICAgICAgICAvLyBFbHNlLCBsZXR0ZXJzIHdpbGwgYmUgcmFuZG9tbHkgcGlja2VkICh3aXRob3V0IG1ha2luZyBzZW5zZSlcclxuICAgICAgICBpZiAoaW50Q29hY2hlcyA+PSA0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGxldHRlcnMgPSBMLkxFVFRFUlMuc2xpY2UoMCwgaW50Q29hY2hlcykuc3BsaXQoJycpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ2ZpcnN0JywgICAgIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgICAgICB0aGlzLnNldENvYWNoKCAnc2hvcCcsICAgICAgUmFuZG9tLmFycmF5U3BsaWNlKGxldHRlcnMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Q29hY2goICdzdGFuZGFyZDEnLCBSYW5kb20uYXJyYXlTcGxpY2UobGV0dGVycykgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRDb2FjaCggJ3N0YW5kYXJkMicsIFJhbmRvbS5hcnJheVNwbGljZShsZXR0ZXJzKSApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU3RlcCA0LiBQcmVwb3B1bGF0ZSBzZXJ2aWNlc1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBtb3JlIHRoYW4gb25lIHNlcnZpY2UsIHBpY2sgb25lIHRvIGJlIHRoZSBcIm1haW5cIiBhbmQgb25lIHRvIGJlIHRoZVxyXG4gICAgICAgIC8vIFwiYWx0ZXJuYXRlXCIsIGVsc2UgdGhlIG9uZSBzZXJ2aWNlIHdpbGwgYmUgdXNlZCBmb3IgYm90aCAod2l0aG91dCBtYWtpbmcgc2Vuc2UpLlxyXG4gICAgICAgIGlmIChSQUcuZGF0YWJhc2Uuc2VydmljZXMubGVuZ3RoID4gMSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBzZXJ2aWNlcyA9IFJBRy5kYXRhYmFzZS5zZXJ2aWNlcy5zbGljZSgpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zZXRTZXJ2aWNlKCAncHJvdmlkZXInLCAgICBSYW5kb20uYXJyYXlTcGxpY2Uoc2VydmljZXMpICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U2VydmljZSggJ2FsdGVybmF0aXZlJywgUmFuZG9tLmFycmF5U3BsaWNlKHNlcnZpY2VzKSApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU3RlcCA1LiBQcmVwb3B1bGF0ZSB0aW1lc1xyXG4gICAgICAgIC8vIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMjE0NzUzXHJcblxyXG4gICAgICAgIC8vIFRoZSBhbHRlcm5hdGl2ZSB0aW1lIGlzIGZvciBhIHRyYWluIHRoYXQncyBsYXRlciB0aGFuIHRoZSBtYWluIHRyYWluXHJcbiAgICAgICAgbGV0IHRpbWUgICAgPSBuZXcgRGF0ZSggbmV3IERhdGUoKS5nZXRUaW1lKCkgKyBSYW5kb20uaW50KDAsIDU5KSAqIDYwMDAwKTtcclxuICAgICAgICBsZXQgdGltZUFsdCA9IG5ldyBEYXRlKCB0aW1lLmdldFRpbWUoKSAgICAgICArIFJhbmRvbS5pbnQoMCwgMzApICogNjAwMDApO1xyXG5cclxuICAgICAgICB0aGlzLnNldFRpbWUoICdtYWluJywgICAgICAgIFN0cmluZ3MuZnJvbVRpbWUodGltZSkgICAgKTtcclxuICAgICAgICB0aGlzLnNldFRpbWUoICdhbHRlcm5hdGl2ZScsIFN0cmluZ3MuZnJvbVRpbWUodGltZUFsdCkgKTtcclxuICAgIH1cclxufSJdfQ==