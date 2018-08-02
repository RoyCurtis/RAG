"use strict";
let L;
class I18n {
    static init() {
        if (this.languages)
            throw new Error('I18n is already initialized');
        this.languages = {
            'en': new EnglishLanguage()
        };
        L = this.currentLang = this.languages['en'];
        I18n.applyToDom();
    }
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
    static nodeFilter(node) {
        let tag = (node.nodeType === Node.ELEMENT_NODE)
            ? node.tagName.toUpperCase()
            : node.parentElement.tagName.toUpperCase();
        return ['SCRIPT', 'STYLE'].includes(tag)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
    }
    static expandAttribute(attr) {
        if (attr.value.match(this.TAG_REGEX))
            attr.value = attr.value.replace(this.TAG_REGEX, I18n.replace);
    }
    static expandTextNode(node) {
        node.textContent = node.textContent.replace(this.TAG_REGEX, I18n.replace);
    }
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
I18n.TAG_REGEX = /%[A-Z_]+%/;
class Chooser {
    constructor(parent) {
        this.selectOnClick = true;
        this.filterTimeout = 0;
        this.groupByABC = false;
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
        this.inputFilter.title = placeholder;
        target.insertAdjacentElement('beforebegin', this.dom);
        target.remove();
    }
    static init() {
        Chooser.TEMPLATE = DOM.require('#chooserTemplate');
        Chooser.TEMPLATE.id = '';
        Chooser.TEMPLATE.classList.remove('hidden');
        Chooser.TEMPLATE.remove();
    }
    add(value, select = false) {
        let item = document.createElement('dd');
        item.innerText = value;
        this.addRaw(item, select);
    }
    addRaw(item, select = false) {
        item.title = this.itemTitle;
        item.tabIndex = -1;
        this.inputChoices.appendChild(item);
        if (select) {
            this.visualSelect(item);
            item.focus();
        }
    }
    clear() {
        this.inputChoices.innerHTML = '';
        this.inputFilter.value = '';
    }
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
    onClick(ev) {
        let target = ev.target;
        if (this.isChoice(target))
            if (!target.hasAttribute('disabled'))
                this.select(target);
    }
    onClose() {
        window.clearTimeout(this.filterTimeout);
    }
    onInput(ev) {
        let key = ev.key;
        let focused = document.activeElement;
        let parent = focused.parentElement;
        if (!focused)
            return;
        if (!this.owns(focused))
            return;
        if (focused === this.inputFilter) {
            window.clearTimeout(this.filterTimeout);
            this.filterTimeout = window.setTimeout(_ => this.filter(), 500);
            return;
        }
        if (focused !== this.inputFilter)
            if (key.length === 1 || key === 'Backspace')
                return this.inputFilter.focus();
        if (this.isChoice(focused))
            if (key === 'Enter')
                return this.select(focused);
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            let dir = (key === 'ArrowLeft') ? -1 : 1;
            let nav = null;
            if (this.groupByABC && parent.hasAttribute('group'))
                nav = DOM.getNextFocusableSibling(focused, dir);
            else if (!this.groupByABC && focused.parentElement === this.inputChoices)
                nav = DOM.getNextFocusableSibling(focused, dir);
            else if (focused === this.domSelected)
                nav = DOM.getNextFocusableSibling(this.domSelected, dir);
            else if (dir === -1)
                nav = DOM.getNextFocusableSibling(focused.firstElementChild, dir);
            else
                nav = DOM.getNextFocusableSibling(focused.lastElementChild, dir);
            if (nav)
                nav.focus();
        }
    }
    onSubmit(ev) {
        ev.preventDefault();
        this.filter();
    }
    filter() {
        window.clearTimeout(this.filterTimeout);
        let filter = this.inputFilter.value.toLowerCase();
        let items = this.inputChoices.children;
        let engine = this.groupByABC
            ? Chooser.filterGroup
            : Chooser.filterItem;
        this.inputChoices.classList.add('hidden');
        for (let i = 0; i < items.length; i++)
            engine(items[i], filter);
        this.inputChoices.classList.remove('hidden');
    }
    static filterItem(item, filter) {
        if (item.innerText.toLowerCase().indexOf(filter) >= 0) {
            item.classList.remove('hidden');
            return 0;
        }
        else {
            item.classList.add('hidden');
            return 1;
        }
    }
    static filterGroup(group, filter) {
        let entries = group.children;
        let count = entries.length - 1;
        let hidden = 0;
        for (let i = 1; i < entries.length; i++)
            hidden += Chooser.filterItem(entries[i], filter);
        if (hidden >= count)
            group.classList.add('hidden');
        else
            group.classList.remove('hidden');
    }
    select(entry) {
        let alreadySelected = (entry === this.domSelected);
        if (this.selectOnClick)
            this.visualSelect(entry);
        if (this.onSelect)
            this.onSelect(entry);
        if (alreadySelected)
            RAG.views.editor.closeDialog();
    }
    visualSelect(entry) {
        this.visualUnselect();
        this.domSelected = entry;
        this.domSelected.tabIndex = 50;
        entry.setAttribute('selected', 'true');
    }
    visualUnselect() {
        if (!this.domSelected)
            return;
        this.domSelected.removeAttribute('selected');
        this.domSelected.tabIndex = -1;
        this.domSelected = undefined;
    }
    owns(target) {
        return this.dom.contains(target);
    }
    isChoice(target) {
        return target !== undefined
            && target.tagName.toLowerCase() === 'dd'
            && this.owns(target);
    }
}
class StationChooser extends Chooser {
    constructor(parent) {
        super(parent);
        this.domStations = {};
        this.inputChoices.tabIndex = 0;
        Object.keys(RAG.database.stations).forEach(this.addStation.bind(this));
    }
    attach(picker, onSelect) {
        let parent = picker.domForm;
        let current = this.dom.parentElement;
        this.inputChoices.querySelectorAll(`dd[disabled]`)
            .forEach(this.enable.bind(this));
        if (!current || current !== parent)
            parent.appendChild(this.dom);
        this.visualUnselect();
        this.onSelect = onSelect.bind(picker);
    }
    preselectCode(code) {
        let entry = this.getByCode(code);
        if (!entry)
            return;
        this.visualSelect(entry);
        entry.focus();
    }
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
    disable(code) {
        let entry = this.getByCode(code);
        let next = DOM.getNextFocusableSibling(entry, 1);
        if (!entry)
            return;
        entry.setAttribute('disabled', '');
        entry.removeAttribute('tabindex');
        entry.title = '';
        if (next)
            next.focus();
    }
    getByCode(code) {
        return this.inputChoices
            .querySelector(`dd[data-code=${code}]`);
    }
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
class StationListItem {
    static init() {
        StationListItem.TEMPLATE = DOM.require('#stationListItemTemplate');
        StationListItem.TEMPLATE.id = '';
        StationListItem.TEMPLATE.classList.remove('hidden');
        StationListItem.TEMPLATE.remove();
    }
    constructor(code) {
        if (!StationListItem.TEMPLATE)
            StationListItem.init();
        this.dom = StationListItem.TEMPLATE.cloneNode(true);
        this.dom.innerText = RAG.database.getStation(code, false);
        this.dom.dataset['code'] = code;
    }
}
class Picker {
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
    onSubmit(ev) {
        ev.preventDefault();
        this.onChange(ev);
        RAG.views.editor.closeDialog();
    }
    open(target) {
        this.dom.classList.remove('hidden');
        this.domEditing = target;
        this.layout();
    }
    close() {
        DOM.blurActive(this.dom);
        this.dom.classList.add('hidden');
    }
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
        if (!fullWidth && !isModal) {
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
        if (isModal) {
            dialogX = DOM.isMobile ? 0 :
                ((docW * 0.1) / 2) | 0;
            dialogY = DOM.isMobile ? 0 :
                ((docH * 0.1) / 2) | 0;
        }
        else if (dialogY < 0)
            dialogY = 0;
        else if (dialogY + this.dom.offsetHeight > docH) {
            dialogY = (targetRect.top | 0) - this.dom.offsetHeight + 1;
            this.domEditing.classList.add('below');
            this.domEditing.classList.remove('above');
            if (dialogY + this.dom.offsetHeight > docH)
                dialogY = docH - this.dom.offsetHeight;
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
    hasFocus() {
        return this.dom.contains(document.activeElement);
    }
}
class CoachPicker extends Picker {
    constructor() {
        super('coach');
        this.currentCtx = '';
        this.inputLetter = DOM.require('select', this.dom);
        for (let i = 0; i < 26; i++) {
            let option = document.createElement('option');
            let letter = L.LETTERS[i];
            option.text = option.value = letter;
            this.inputLetter.appendChild(option);
        }
    }
    open(target) {
        super.open(target);
        this.currentCtx = DOM.requireData(target, 'context');
        this.domHeader.innerText = L.HEADER_COACH(this.currentCtx);
        this.inputLetter.value = RAG.state.getCoach(this.currentCtx);
        this.inputLetter.focus();
    }
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
class ExcusePicker extends Picker {
    constructor() {
        super('excuse');
        this.domChooser = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
        this.domHeader.innerText = L.HEADER_EXCUSE();
        RAG.database.excuses.forEach(v => this.domChooser.add(v));
    }
    open(target) {
        super.open(target);
        this.domChooser.preselect(RAG.state.excuse);
    }
    close() {
        super.close();
        this.domChooser.onClose();
    }
    onChange(_) { }
    onClick(ev) { this.domChooser.onClick(ev); }
    onInput(ev) { this.domChooser.onInput(ev); }
    onSubmit(ev) { this.domChooser.onSubmit(ev); }
    onSelect(entry) {
        RAG.state.excuse = entry.innerText;
        RAG.views.editor.setElementsText('excuse', RAG.state.excuse);
    }
}
class IntegerPicker extends Picker {
    constructor() {
        super('integer');
        this.inputDigit = DOM.require('input', this.dom);
        this.domLabel = DOM.require('label', this.dom);
        if (DOM.isiOS) {
            this.inputDigit.type = 'tel';
            this.inputDigit.pattern = '[0-9]+';
        }
    }
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
    onChange(_) {
        if (!this.currentCtx)
            throw Error(L.P_INT_MISSING_STATE());
        let int = parseInt(this.inputDigit.value);
        let intStr = (this.words)
            ? L.DIGITS[int] || int.toString()
            : int.toString();
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
class NamedPicker extends Picker {
    constructor() {
        super('named');
        this.domChooser = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
        this.domHeader.innerText = L.HEADER_NAMED();
        RAG.database.named.forEach(v => this.domChooser.add(v));
    }
    open(target) {
        super.open(target);
        this.domChooser.preselect(RAG.state.named);
    }
    close() {
        super.close();
        this.domChooser.onClose();
    }
    onChange(_) { }
    onClick(ev) { this.domChooser.onClick(ev); }
    onInput(ev) { this.domChooser.onInput(ev); }
    onSubmit(ev) { this.domChooser.onSubmit(ev); }
    onSelect(entry) {
        RAG.state.named = entry.innerText;
        RAG.views.editor.setElementsText('named', RAG.state.named);
    }
}
class PhrasesetPicker extends Picker {
    constructor() {
        super('phraseset');
        this.domChooser = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
    }
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
        for (let i = 0; i < phraseset.children.length; i++) {
            let phrase = document.createElement('dd');
            DOM.cloneInto(phraseset.children[i], phrase);
            RAG.phraser.process(phrase);
            phrase.innerText = DOM.getCleanedVisibleText(phrase);
            phrase.dataset.idx = i.toString();
            this.domChooser.addRaw(phrase, i === idx);
        }
    }
    close() {
        super.close();
        this.domChooser.onClose();
    }
    onChange(_) { }
    onClick(ev) { this.domChooser.onClick(ev); }
    onInput(ev) { this.domChooser.onInput(ev); }
    onSubmit(ev) { this.domChooser.onSubmit(ev); }
    onSelect(entry) {
        if (!this.currentRef)
            throw Error(L.P_PSET_MISSING_STATE());
        let idx = parseInt(entry.dataset['idx']);
        RAG.state.setPhrasesetIdx(this.currentRef, idx);
        RAG.views.editor.closeDialog();
        RAG.views.editor.refreshPhraseset(this.currentRef);
    }
}
class PlatformPicker extends Picker {
    constructor() {
        super('platform');
        this.inputDigit = DOM.require('input', this.dom);
        this.inputLetter = DOM.require('select', this.dom);
        this.domHeader.innerText = L.HEADER_PLATFORM();
        if (DOM.isiOS) {
            this.inputDigit.type = 'tel';
            this.inputDigit.pattern = '[0-9]+';
        }
    }
    open(target) {
        super.open(target);
        let value = RAG.state.platform;
        this.inputDigit.value = value[0];
        this.inputLetter.value = value[1];
        this.inputDigit.focus();
    }
    onChange(_) {
        if (isNaN(parseInt(this.inputDigit.value)))
            return;
        RAG.state.platform = [this.inputDigit.value, this.inputLetter.value];
        RAG.views.editor.setElementsText('platform', RAG.state.platform.join(''));
    }
    onClick(_) { }
    onInput(_) { }
}
class ServicePicker extends Picker {
    constructor() {
        super('service');
        this.domChooser = new Chooser(this.domForm);
        this.domChooser.onSelect = e => this.onSelect(e);
        this.domHeader.innerText = L.HEADER_SERVICE();
        RAG.database.services.forEach(v => this.domChooser.add(v));
    }
    open(target) {
        super.open(target);
        this.domChooser.preselect(RAG.state.service);
    }
    close() {
        super.close();
        this.domChooser.onClose();
    }
    onChange(_) { }
    onClick(ev) { this.domChooser.onClick(ev); }
    onInput(ev) { this.domChooser.onInput(ev); }
    onSubmit(ev) { this.domChooser.onSubmit(ev); }
    onSelect(entry) {
        RAG.state.service = entry.innerText;
        RAG.views.editor.setElementsText('service', RAG.state.service);
    }
}
class StationPicker extends Picker {
    constructor(tag = 'station') {
        super(tag);
        this.currentCtx = '';
        if (!StationPicker.chooser)
            StationPicker.chooser = new StationChooser(this.domForm);
        this.onOpen = this.onStationPickerOpen.bind(this);
    }
    open(target) {
        super.open(target);
        this.onOpen(target);
    }
    onStationPickerOpen(target) {
        let chooser = StationPicker.chooser;
        this.currentCtx = DOM.requireData(target, 'context');
        chooser.attach(this, this.onSelectStation);
        chooser.preselectCode(RAG.state.getStation(this.currentCtx));
        chooser.selectOnClick = true;
        this.domHeader.innerText = L.HEADER_STATION(this.currentCtx);
    }
    onChange(_) { }
    onClick(ev) { StationPicker.chooser.onClick(ev); }
    onInput(ev) { StationPicker.chooser.onInput(ev); }
    onSubmit(ev) { StationPicker.chooser.onSubmit(ev); }
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
            .on('drag:stop', ev => setTimeout(() => this.onDragStop(ev), 1))
            .on('mirror:create', this.onDragMirrorCreate.bind(this));
    }
    onStationListPickerOpen(target) {
        StationPicker.chooser.attach(this, this.onAddStation);
        StationPicker.chooser.selectOnClick = false;
        this.currentCtx = DOM.requireData(target, 'context');
        let entries = RAG.state.getStationList(this.currentCtx).slice(0);
        this.domHeader.innerText = L.HEADER_STATIONLIST(this.currentCtx);
        this.inputList.innerHTML = '';
        entries.forEach(v => this.add(v));
        this.inputList.focus();
    }
    onSubmit(ev) { super.onSubmit(ev); }
    onClick(ev) {
        super.onClick(ev);
        if (ev.target === this.btnClose)
            RAG.views.editor.closeDialog();
        if (ev.target === this.btnAdd)
            this.dom.classList.add('addingStation');
    }
    onInput(ev) {
        super.onInput(ev);
        let key = ev.key;
        let focused = document.activeElement;
        if (!focused || !this.inputList.contains(focused))
            return;
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            let dir = (key === 'ArrowLeft') ? -1 : 1;
            let nav = null;
            if (focused.parentElement === this.inputList)
                nav = DOM.getNextFocusableSibling(focused, dir);
            else if (dir === -1)
                nav = DOM.getNextFocusableSibling(focused.firstElementChild, dir);
            else
                nav = DOM.getNextFocusableSibling(focused.lastElementChild, dir);
            if (nav)
                nav.focus();
        }
        if (key === 'Delete' || key === 'Backspace')
            if (focused.parentElement === this.inputList) {
                let next = focused.previousElementSibling
                    || focused.nextElementSibling
                    || this.inputList;
                this.remove(focused);
                next.focus();
            }
    }
    onAddStation(entry) {
        let newEntry = this.add(entry.dataset['code']);
        this.dom.classList.remove('addingStation');
        this.update();
        if (DOM.isMobile)
            newEntry.dom.focus();
        else
            newEntry.dom.scrollIntoView();
    }
    onDragMirrorCreate(ev) {
        if (!ev.data.source || !ev.data.originalSource)
            throw Error(L.P_SL_DRAG_MISSING());
        ev.data.source.style.width = ev.data.originalSource.clientWidth + 'px';
    }
    onDragStop(ev) {
        if (!ev.data.originalSource)
            return;
        if (ev.data.originalSource.parentElement === this.domDel)
            this.remove(ev.data.originalSource);
        else
            this.update();
    }
    add(code) {
        let newEntry = new StationListItem(code);
        this.inputList.appendChild(newEntry.dom);
        this.domEmptyList.classList.add('hidden');
        StationPicker.chooser.disable(code);
        newEntry.dom.ondblclick = _ => this.remove(newEntry.dom);
        return newEntry;
    }
    remove(entry) {
        if (!this.domList.contains(entry))
            throw Error('Attempted to remove entry not on station list builder');
        StationPicker.chooser.enable(entry.dataset['code']);
        entry.remove();
        this.update();
        if (this.inputList.children.length === 0)
            this.domEmptyList.classList.remove('hidden');
    }
    update() {
        let children = this.inputList.children;
        if (children.length === 0)
            return;
        let list = [];
        for (let i = 0; i < children.length; i++) {
            let entry = children[i];
            list.push(entry.dataset['code']);
        }
        let textList = Strings.fromStationList(list.slice(0), this.currentCtx);
        let query = `[data-type=stationlist][data-context=${this.currentCtx}]`;
        RAG.state.setStationList(this.currentCtx, list);
        RAG.views.editor
            .getElementsByQuery(query)
            .forEach(element => element.textContent = textList);
    }
}
class TimePicker extends Picker {
    constructor() {
        super('time');
        this.inputTime = DOM.require('input', this.dom);
        this.domHeader.innerText = L.HEADER_TIME();
    }
    open(target) {
        super.open(target);
        this.inputTime.value = RAG.state.time;
        this.inputTime.focus();
    }
    onChange(_) {
        RAG.state.time = this.inputTime.value;
        RAG.views.editor.setElementsText('time', RAG.state.time.toString());
    }
    onClick(_) { }
    onInput(_) { }
}
class BaseLanguage {
}
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
        this.TITLE_SERVICE = () => "Click to change this train's network";
        this.TITLE_STATION = (c) => `Click to change this station ('${c}')`;
        this.TITLE_STATIONLIST = (c) => `Click to change this station list ('${c}')`;
        this.TITLE_TIME = () => "Click to change this train's time";
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
        this.HEADER_SERVICE = () => 'Pick a service';
        this.HEADER_STATION = (c) => `Pick a station for the '${c}' context`;
        this.HEADER_STATIONLIST = (c) => `Build a station list for the '${c}' context`;
        this.HEADER_TIME = () => 'Pick a time';
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
        this.LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        this.DIGITS = [
            'zero', 'one', 'two', 'three', 'four', 'five', 'six',
            'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
            'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'ninteen', 'twenty'
        ];
    }
}
class ElementProcessors {
    static coach(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        ctx.newElement.title = L.TITLE_COACH(context);
        ctx.newElement.textContent = RAG.state.getCoach(context);
        ctx.newElement.dataset['context'] = context;
    }
    static excuse(ctx) {
        ctx.newElement.title = L.TITLE_EXCUSE();
        ctx.newElement.textContent = RAG.state.excuse;
    }
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
    static named(ctx) {
        ctx.newElement.title = L.TITLE_NAMED();
        ctx.newElement.textContent = RAG.state.named;
    }
    static phrase(ctx) {
        let ref = DOM.requireAttr(ctx.xmlElement, 'ref');
        let phrase = RAG.database.getPhrase(ref);
        ctx.newElement.title = '';
        ctx.newElement.dataset['ref'] = ref;
        if (!phrase) {
            ctx.newElement.textContent = L.EDITOR_UNKNOWN_PHRASE(ref);
            return;
        }
        if (ctx.xmlElement.hasAttribute('chance'))
            this.makeCollapsible(ctx, phrase, ref);
        else
            DOM.cloneInto(phrase, ctx.newElement);
    }
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
        if (ctx.xmlElement.hasAttribute('chance'))
            this.makeCollapsible(ctx, phrase, ref);
        else
            DOM.cloneInto(phrase, ctx.newElement);
    }
    static platform(ctx) {
        ctx.newElement.title = L.TITLE_PLATFORM();
        ctx.newElement.textContent = RAG.state.platform.join('');
    }
    static service(ctx) {
        ctx.newElement.title = L.TITLE_SERVICE();
        ctx.newElement.textContent = RAG.state.service;
    }
    static station(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        let code = RAG.state.getStation(context);
        ctx.newElement.title = L.TITLE_STATION(context);
        ctx.newElement.textContent = RAG.database.getStation(code, true);
        ctx.newElement.dataset['context'] = context;
    }
    static stationlist(ctx) {
        let context = DOM.requireAttr(ctx.xmlElement, 'context');
        let stations = RAG.state.getStationList(context).slice(0);
        let stationList = Strings.fromStationList(stations, context);
        ctx.newElement.title = L.TITLE_STATIONLIST(context);
        ctx.newElement.textContent = stationList;
        ctx.newElement.dataset['context'] = context;
    }
    static time(ctx) {
        ctx.newElement.title = L.TITLE_TIME();
        ctx.newElement.textContent = RAG.state.time;
    }
    static unknown(ctx) {
        let name = ctx.xmlElement.nodeName;
        ctx.newElement.textContent = L.EDITOR_UNKNOWN_ELEMENT(name);
    }
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
class Phraser {
    process(container, level = 0) {
        let pending = container.querySelectorAll(':not(span)');
        if (pending.length === 0)
            return;
        pending.forEach(element => {
            let elementName = element.nodeName.toLowerCase();
            let newElement = document.createElement('span');
            let context = {
                xmlElement: element,
                newElement: newElement
            };
            newElement.dataset['type'] = elementName;
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
        if (level < 20)
            this.process(container, level + 1);
        else
            throw Error(L.PHRASER_TOO_RECURSIVE());
    }
}
class Editor {
    constructor() {
        this.dom = DOM.require('#editor');
        document.body.onclick = this.onClick.bind(this);
        document.body.onkeydown = this.onInput.bind(this);
        window.onresize = this.onResize.bind(this);
        this.dom.onscroll = this.onScroll.bind(this);
        this.dom.textContent = L.EDITOR_INIT();
    }
    generate() {
        this.dom.innerHTML = '<phraseset ref="root" />';
        RAG.phraser.process(this.dom);
        let padding = document.createElement('span');
        padding.className = 'bottomPadding';
        this.dom.appendChild(padding);
    }
    refreshPhraseset(ref) {
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
    getElementsByQuery(query) {
        return this.dom.querySelectorAll(`span${query}`);
    }
    getText() {
        return DOM.getCleanedVisibleText(this.dom);
    }
    setElementsText(type, value) {
        this.getElementsByQuery(`[data-type=${type}]`)
            .forEach(element => element.textContent = value);
    }
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
    onClick(ev) {
        let target = ev.target;
        let type = target ? target.dataset['type'] : undefined;
        let picker = type ? RAG.views.getPicker(type) : undefined;
        if (!target)
            return this.closeDialog();
        if (target.classList.contains('inner') && target.parentElement) {
            target = target.parentElement;
            type = target.dataset['type'];
            picker = type ? RAG.views.getPicker(type) : undefined;
        }
        if (!document.body.contains(target))
            return;
        if (this.currentPicker)
            if (this.currentPicker.dom.contains(target))
                return;
        let prevTarget = this.domEditing;
        this.closeDialog();
        if (target === prevTarget)
            return;
        if (target.classList.contains('toggle'))
            this.toggleCollapsiable(target);
        else if (type && picker)
            this.openPicker(target, picker);
    }
    onInput(ev) {
        if (ev.key === 'Escape')
            return this.closeDialog();
    }
    onResize(_) {
        if (this.currentPicker)
            this.currentPicker.layout();
    }
    onScroll(_) {
        if (!this.currentPicker)
            return;
        if (DOM.isMobile)
            if (this.currentPicker.hasFocus())
                DOM.blurActive();
        this.currentPicker.layout();
    }
    toggleCollapsiable(target) {
        let parent = target.parentElement;
        let ref = DOM.requireData(parent, 'ref');
        let type = DOM.requireData(parent, 'type');
        let collapased = parent.hasAttribute('collapsed');
        this.dom.querySelectorAll(`span[data-type=${type}][data-ref=${ref}]`)
            .forEach(_ => {
            let phraseset = _;
            let toggle = phraseset.children[0];
            if (!toggle || !toggle.classList.contains('toggle'))
                return;
            Collapsibles.set(phraseset, toggle, !collapased);
            RAG.state.setCollapsed(ref, !collapased);
        });
    }
    openPicker(target, picker) {
        target.setAttribute('editing', 'true');
        this.currentPicker = picker;
        this.domEditing = target;
        picker.open(target);
    }
}
class Marquee {
    constructor() {
        this.timer = 0;
        this.offset = 0;
        this.dom = DOM.require('#marquee');
        this.domSpan = document.createElement('span');
        this.dom.innerHTML = '';
        this.dom.appendChild(this.domSpan);
    }
    set(msg) {
        window.cancelAnimationFrame(this.timer);
        this.domSpan.textContent = msg;
        this.offset = this.dom.clientWidth;
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
    stop() {
        window.cancelAnimationFrame(this.timer);
        this.domSpan.style.transform = '';
    }
}
class Settings {
    constructor() {
        this.dom = DOM.require('#settingsScreen');
        this.btnReset = DOM.require('#btnResetSettings');
        this.btnSave = DOM.require('#btnSaveSettings');
        this.btnReset.onclick = this.handleReset.bind(this);
        this.btnSave.onclick = this.handleSave.bind(this);
        this.selVoxChoice = DOM.require('#selVoxChoice');
        this.rangeVoxVol = DOM.require('#rangeVoxVol');
        this.rangeVoxPitch = DOM.require('#rangeVoxPitch');
        this.rangeVoxRate = DOM.require('#rangeVoxRate');
        this.btnVoxTest = DOM.require('#btnVoxTest');
        this.btnVoxTest.onclick = this.handleVoxTest.bind(this);
        Linkdown.parse(DOM.require('#legalBlock'));
    }
    open() {
        this.dom.classList.remove('hidden');
        this.populateVoxList();
        this.selVoxChoice.selectedIndex = RAG.config.voxChoice;
        this.rangeVoxVol.valueAsNumber = RAG.config.voxVolume;
        this.rangeVoxPitch.valueAsNumber = RAG.config.voxPitch;
        this.rangeVoxRate.valueAsNumber = RAG.config.voxRate;
        this.btnSave.focus();
    }
    close() {
        this.cancelReset();
        RAG.speech.cancel();
        this.dom.classList.add('hidden');
        DOM.blurActive(this.dom);
    }
    populateVoxList() {
        this.selVoxChoice.innerHTML = '';
        let voices = RAG.speech.getVoices();
        if (voices.length <= 0) {
            let option = document.createElement('option');
            option.textContent = L.ST_VOX_EMPTY();
            option.disabled = true;
            this.selVoxChoice.appendChild(option);
            return;
        }
        for (let i = 0; i < voices.length; i++) {
            let option = document.createElement('option');
            option.textContent = `${voices[i].name} (${voices[i].lang})`;
            this.selVoxChoice.appendChild(option);
        }
    }
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
    cancelReset() {
        window.clearTimeout(this.resetTimeout);
        this.btnReset.innerText = L.ST_RESET();
        this.btnReset.title = L.ST_RESET_T();
        this.resetTimeout = undefined;
    }
    handleSave() {
        RAG.config.voxChoice = this.selVoxChoice.selectedIndex;
        RAG.config.voxVolume = parseFloat(this.rangeVoxVol.value);
        RAG.config.voxPitch = parseFloat(this.rangeVoxPitch.value);
        RAG.config.voxRate = parseFloat(this.rangeVoxRate.value);
        RAG.config.save();
        this.close();
    }
    handleVoxTest(ev) {
        ev.preventDefault();
        RAG.speech.cancel();
        this.btnVoxTest.disabled = true;
        window.setTimeout(() => {
            this.btnVoxTest.disabled = false;
            let time = new Date();
            let hour = time.getHours().toString().padStart(2, '0');
            let minute = time.getMinutes().toString().padStart(2, '0');
            let utterance = new SpeechSynthesisUtterance(`This is a test of the Rail Announcement Generator at ${hour}:${minute}.`);
            utterance.volume = this.rangeVoxVol.valueAsNumber;
            utterance.pitch = this.rangeVoxPitch.valueAsNumber;
            utterance.rate = this.rangeVoxRate.valueAsNumber;
            utterance.voice = RAG.speech.getVoices()[this.selVoxChoice.selectedIndex];
            RAG.speech.speak(utterance);
        }, 200);
    }
}
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
            ev.preventDefault();
            RAG.speech.cancel();
            this.btnPlay.disabled = true;
            window.setTimeout(this.handlePlay.bind(this), 200);
        };
        if (!RAG.config.clickedGenerate) {
            this.btnGenerate.classList.add('throb');
            this.btnGenerate.focus();
        }
        else
            this.btnPlay.focus();
    }
    handlePlay() {
        let text = RAG.views.editor.getText();
        let parts = text.trim().split(/\.\s/i);
        let voices = RAG.speech.getVoices();
        let voice = RAG.config.voxChoice;
        if (!voices[voice])
            RAG.config.voxChoice = voice = 0;
        RAG.speech.cancel();
        parts.forEach(segment => {
            let utterance = new SpeechSynthesisUtterance(segment);
            utterance.voice = voices[voice];
            utterance.volume = RAG.config.voxVolume;
            utterance.pitch = RAG.config.voxPitch;
            utterance.rate = RAG.config.voxRate;
            RAG.speech.speak(utterance);
        });
        RAG.views.marquee.set(text);
        this.btnPlay.disabled = false;
    }
    handleStop() {
        RAG.speech.cancel();
        RAG.views.marquee.stop();
    }
    handleGenerate() {
        this.btnGenerate.classList.remove('throb');
        RAG.generate();
        RAG.config.clickedGenerate = true;
    }
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
    handleLoad() {
        let data = window.localStorage['state'];
        return data
            ? RAG.load(data)
            : RAG.views.marquee.set(L.STATE_SAVE_MISSING());
    }
    handleOption() {
        RAG.views.settings.open();
    }
}
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
        if (DOM.isiOS)
            document.body.classList.add('ios');
    }
    getPicker(xmlTag) {
        return this.pickers[xmlTag];
    }
}
class Collapsibles {
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
class DOM {
    static get isMobile() {
        return document.body.clientWidth <= 500;
    }
    static get isiOS() {
        return navigator.platform.match(/iPhone|iPod|iPad/gi) !== null;
    }
    static getAttr(element, attr, def) {
        return element.hasAttribute(attr)
            ? element.getAttribute(attr)
            : def;
    }
    static require(query, parent = window.document) {
        let result = parent.querySelector(query);
        if (!result)
            throw Error(L.DOM_MISSING(query));
        return result;
    }
    static requireAttr(element, attr) {
        if (!element.hasAttribute(attr))
            throw Error(L.ATTR_MISSING(attr));
        return element.getAttribute(attr);
    }
    static requireData(element, key) {
        let value = element.dataset[key];
        if (Strings.isNullOrEmpty(value))
            throw Error(L.DATA_MISSING(key));
        return value;
    }
    static blurActive(parent = document.body) {
        let active = document.activeElement;
        if (active && active.blur && parent.contains(active))
            active.blur();
    }
    static cloneInto(source, target) {
        for (let i = 0; i < source.childNodes.length; i++)
            target.appendChild(source.childNodes[i].cloneNode(true));
    }
    static getVisibleText(element) {
        if (element.nodeType === Node.TEXT_NODE)
            return element.textContent || '';
        else if (element.classList.contains('toggle'))
            return '';
        let style = getComputedStyle(element);
        if (style && style.display === 'none')
            return '';
        let text = '';
        for (let i = 0; i < element.childNodes.length; i++)
            text += DOM.getVisibleText(element.childNodes[i]);
        return text;
    }
    static getCleanedVisibleText(element) {
        return DOM.getVisibleText(element)
            .trim()
            .replace(/[\n\r]/gi, '')
            .replace(/\s{2,}/gi, ' ')
            .replace(/\s([.,])/gi, '$1');
    }
    static getNextFocusableSibling(from, dir) {
        let current = from;
        let parent = from.parentElement;
        if (!parent)
            return null;
        while (true) {
            if (dir < 0)
                current = current.previousElementSibling
                    || parent.lastElementChild;
            else if (dir > 0)
                current = current.nextElementSibling
                    || parent.firstElementChild;
            else
                throw Error(L.BAD_DIRECTION(dir.toString()));
            if (current === from)
                return null;
            if (!current.classList.contains('hidden'))
                if (current.hasAttribute('tabindex'))
                    return current;
        }
    }
}
class Linkdown {
    static parse(block) {
        let links = [];
        let idx = 0;
        let text = block.innerText.replace(this.REGEX_REF, (_, k, v) => {
            links[parseInt(k)] = v;
            return '';
        });
        block.innerHTML = text.replace(this.REGEX_LINK, (_, t) => `<a href='${links[idx++]}' target="_blank" rel="noopener">${t}</a>`);
    }
}
Linkdown.REGEX_LINK = /\[(.+?)\]/gi;
Linkdown.REGEX_REF = /\[(\d+)\]:\s+(\S+)/gi;
class Parse {
    static boolean(str) {
        str = str.toLowerCase();
        if (str === 'true' || str === '1')
            return true;
        if (str === 'false' || str === '0')
            return false;
        throw Error(L.BAD_BOOLEAN(str));
    }
}
class Random {
    static int(min = 0, max = 1) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
    static array(arr) {
        return arr[Random.int(0, arr.length)];
    }
    static objectKey(obj) {
        return Random.array(Object.keys(obj));
    }
    static bool(chance = 50) {
        return Random.int(0, 100) < chance;
    }
}
class Strings {
    static isNullOrEmpty(str) {
        return !str || !str.trim();
    }
    static fromStationList(codes, context) {
        let result = '';
        let names = codes.slice(0);
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
}
class SpeechEngine {
    constructor() {
        this.voices = [];
        window.onbeforeunload =
            window.onunload =
                window.onpageshow =
                    window.onpagehide = this.cancel.bind(this);
        document.onvisibilitychange = this.onVisibilityChange.bind(this);
        window.speechSynthesis.onvoiceschanged = this.onVoicesChanged.bind(this);
        this.onVoicesChanged();
    }
    getVoices() {
        return this.voices;
    }
    speak(utterance) {
        window.speechSynthesis.speak(utterance);
    }
    cancel() {
        window.speechSynthesis.cancel();
    }
    onVisibilityChange() {
        let hiding = (document.visibilityState === 'hidden');
        if (hiding)
            window.speechSynthesis.pause();
        else
            window.speechSynthesis.resume();
    }
    onVoicesChanged() {
        this.voices = window.speechSynthesis.getVoices();
    }
}
class Config {
    constructor(load) {
        this.voxVolume = 1.0;
        this.voxPitch = 1.0;
        this.voxRate = 1.0;
        this._voxChoice = -1;
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
    get voxChoice() {
        if (this._voxChoice !== -1)
            return this._voxChoice;
        for (let i = 0, v = RAG.speech.getVoices(); i < v.length; i++) {
            let lang = v[i].lang;
            if (lang === 'en-GB' || lang === 'en-US')
                return i;
        }
        return 0;
    }
    set voxChoice(value) {
        this._voxChoice = value;
    }
    save() {
        try {
            window.localStorage['settings'] = JSON.stringify(this);
        }
        catch (e) {
            alert(L.CONFIG_SAVE_FAIL(e.message));
            console.error(e);
        }
    }
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
    pickExcuse() {
        return Random.array(this.excuses);
    }
    pickNamed() {
        return Random.array(this.named);
    }
    getPhrase(id) {
        let result = this.phrasesets.querySelector('phrase#' + id);
        if (result)
            result = result.cloneNode(true);
        return result;
    }
    getPhraseset(id) {
        return this.phrasesets.querySelector('phraseset#' + id);
    }
    pickService() {
        return Random.array(this.services);
    }
    pickStationCode(exclude) {
        if (exclude)
            for (let i = 0; i < this.stationsCount; i++) {
                let value = Random.objectKey(this.stations);
                if (!exclude.includes(value))
                    return value;
            }
        return Random.objectKey(this.stations);
    }
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
    pickStationCodes(min = 1, max = 16, exclude) {
        if (max - min > Object.keys(this.stations).length)
            throw Error(L.DB_TOO_MANY_STATIONS());
        let result = [];
        let length = Random.int(min, max);
        let tries = 0;
        while (result.length < length) {
            let key = Random.objectKey(this.stations);
            if (tries++ >= this.stationsCount)
                result.push(key);
            else if (exclude && !exclude.includes(key) && !result.includes(key))
                result.push(key);
            else if (!exclude && !result.includes(key))
                result.push(key);
        }
        return result;
    }
}
class RAG {
    static main(dataRefs) {
        window.onerror = error => RAG.panic(error);
        I18n.init();
        RAG.config = new Config(true);
        RAG.database = new Database(dataRefs);
        RAG.views = new Views();
        RAG.phraser = new Phraser();
        RAG.speech = new SpeechEngine();
        RAG.views.marquee.set(L.WELCOME());
        RAG.generate();
    }
    static generate() {
        RAG.state = new State();
        RAG.state.genDefaultState();
        RAG.views.editor.generate();
    }
    static load(json) {
        RAG.state = Object.assign(new State(), JSON.parse(json));
        RAG.views.editor.generate();
        RAG.views.marquee.set(L.STATE_FROM_STORAGE());
    }
    static panic(error = "Unknown error") {
        let msg = '<div id="panicScreen" class="warningScreen">';
        msg += '<h1>"We are sorry to announce that..."</h1>';
        msg += `<p>RAG has crashed because: <code>${error}</code>.</p>`;
        msg += `<p>Please open the console for more information.</p>`;
        msg += '</div>';
        document.body.innerHTML = msg;
    }
}
class State {
    constructor() {
        this._collapsibles = {};
        this._coaches = {};
        this._integers = {};
        this._phrasesets = {};
        this._stations = {};
        this._stationLists = {};
    }
    getCoach(context) {
        if (this._coaches[context] !== undefined)
            return this._coaches[context];
        this._coaches[context] = Random.array(L.LETTERS);
        return this._coaches[context];
    }
    setCoach(context, coach) {
        this._coaches[context] = coach;
    }
    getCollapsed(ref, chance) {
        if (this._collapsibles[ref] !== undefined)
            return this._collapsibles[ref];
        this._collapsibles[ref] = !Random.bool(chance);
        return this._collapsibles[ref];
    }
    setCollapsed(ref, state) {
        this._collapsibles[ref] = state;
    }
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
    setInteger(context, value) {
        this._integers[context] = value;
    }
    getPhrasesetIdx(ref) {
        if (this._phrasesets[ref] !== undefined)
            return this._phrasesets[ref];
        let phraseset = RAG.database.getPhraseset(ref);
        if (!phraseset)
            throw Error(L.STATE_NONEXISTANT_PHRASESET(ref));
        this._phrasesets[ref] = Random.int(0, phraseset.children.length);
        return this._phrasesets[ref];
    }
    setPhrasesetIdx(ref, idx) {
        this._phrasesets[ref] = idx;
    }
    getStation(context) {
        if (this._stations[context] !== undefined)
            return this._stations[context];
        this._stations[context] = RAG.database.pickStationCode();
        return this._stations[context];
    }
    setStation(context, code) {
        this._stations[context] = code;
    }
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
    setStationList(context, codes) {
        this._stationLists[context] = codes;
        if (context === 'calling_first')
            this._stationLists['calling'] = codes;
    }
    get excuse() {
        if (this._excuse)
            return this._excuse;
        this._excuse = RAG.database.pickExcuse();
        return this._excuse;
    }
    set excuse(value) {
        this._excuse = value;
    }
    get platform() {
        if (this._platform)
            return this._platform;
        let platform = ['', ''];
        platform[0] = Random.bool(98)
            ? Random.int(1, 26).toString()
            : '0';
        platform[1] = Random.bool(10)
            ? Random.array('ABC')
            : '';
        this._platform = platform;
        return this._platform;
    }
    set platform(value) {
        this._platform = value;
    }
    get named() {
        if (this._named)
            return this._named;
        this._named = RAG.database.pickNamed();
        return this._named;
    }
    set named(value) {
        this._named = value;
    }
    get service() {
        if (this._service)
            return this._service;
        this._service = RAG.database.pickService();
        return this._service;
    }
    set service(value) {
        this._service = value;
    }
    get time() {
        if (!this._time) {
            let offset = Random.int(0, 59);
            let time = new Date(new Date().getTime() + offset * 60000);
            let hour = time.getHours().toString().padStart(2, '0');
            let minute = time.getMinutes().toString().padStart(2, '0');
            this._time = `${hour}:${minute}`;
        }
        return this._time;
    }
    set time(value) {
        this._time = value;
    }
    genDefaultState() {
        let slCalling = RAG.database.pickStationCodes(1, 16);
        let slCallSplit = RAG.database.pickStationCodes(2, 16, slCalling);
        let allCalling = [...slCalling, ...slCallSplit];
        let slChanges = RAG.database.pickStationCodes(1, 4, allCalling);
        let slNotStopping = RAG.database.pickStationCodes(1, 8, [...allCalling, ...slChanges]);
        let reqCount = Random.int(1, slCalling.length - 1);
        let slRequests = slCalling.slice(0, reqCount);
        this.setStationList('calling', slCalling);
        this.setStationList('calling_split', slCallSplit);
        this.setStationList('changes', slChanges);
        this.setStationList('not_stopping', slNotStopping);
        this.setStationList('request', slRequests);
        let stExcuse = RAG.database.pickStationCode();
        let stDest = slCalling[slCalling.length - 1];
        let stVia = slCalling.length > 1
            ? Random.array(slCalling.slice(0, -1))
            : Random.array(slCallSplit.slice(0, -1));
        let stCalling = slCalling.length > 1
            ? Random.array(slCalling.slice(0, -1))
            : Random.array(slCallSplit.slice(0, -1));
        let stDestSplit = slCallSplit[slCallSplit.length - 1];
        let stViaSplit = Random.array(slCallSplit.slice(0, -1));
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
        let intCoaches = this.getInteger('coaches');
        if (intCoaches >= 4) {
            let intFrontCoaches = (intCoaches / 2) | 0;
            let intRearCoaches = intCoaches - intFrontCoaches;
            this.setInteger('front_coaches', intFrontCoaches);
            this.setInteger('rear_coaches', intRearCoaches);
        }
        if (intCoaches >= 4) {
            let letters = L.LETTERS.slice(0, intCoaches).split('');
            let randSplice = () => letters.splice(Random.int(0, letters.length), 1)[0];
            this.setCoach('first', randSplice());
            this.setCoach('shop', randSplice());
            this.setCoach('standard1', randSplice());
            this.setCoach('standard2', randSplice());
        }
    }
}
//# sourceMappingURL=rag.js.map