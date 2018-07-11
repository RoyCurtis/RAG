"use strict";
class ElementProcessors {
    static coach(ctx) {
        ctx.newElement.textContent = RAG.state.coach;
    }
    static excuse(ctx) {
        ctx.newElement.textContent = RAG.database.pickExcuse();
    }
    static integer(ctx) {
        let id = DOM.requireAttrValue(ctx.xmlElement, 'id');
        let min = DOM.requireAttrValue(ctx.xmlElement, 'min');
        let max = DOM.requireAttrValue(ctx.xmlElement, 'max');
        let singular = ctx.xmlElement.getAttribute('singular');
        let plural = ctx.xmlElement.getAttribute('plural');
        let words = ctx.xmlElement.getAttribute('words');
        let intMin = parseInt(min);
        let intMax = parseInt(max);
        let int = RAG.state.getInteger(id, intMin, intMax);
        let intStr = (words && words.toLowerCase() === 'true')
            ? Phraser.DIGITS[int]
            : int.toString();
        if (int === 1 && singular)
            intStr += ` ${singular}`;
        else if (int !== 1 && plural)
            intStr += ` ${plural}`;
        ctx.newElement.title = `Click to change this number ('${id}')`;
        ctx.newElement.textContent = intStr;
        ctx.newElement.dataset['id'] = id;
        ctx.newElement.dataset['min'] = min;
        ctx.newElement.dataset['max'] = max;
        if (singular)
            ctx.newElement.dataset['singular'] = singular;
        if (plural)
            ctx.newElement.dataset['plural'] = plural;
        if (words)
            ctx.newElement.dataset['words'] = words;
    }
    static named(ctx) {
        ctx.newElement.title = "Click to change this train's name";
        ctx.newElement.textContent = RAG.state.named;
    }
    static phrase(ctx) {
        let ref = DOM.requireAttrValue(ctx.xmlElement, 'ref');
        let phrase = RAG.database.getPhrase(ref);
        ctx.newElement.title = '';
        ctx.newElement.dataset['ref'] = ref;
        if (!phrase) {
            ctx.newElement.textContent = `(UNKNOWN PHRASE: ${ref})`;
            return;
        }
        if (ctx.xmlElement.hasAttribute('chance'))
            this.makeCollapsible(ctx, phrase, ref);
        else
            DOM.cloneInto(phrase, ctx.newElement);
    }
    static phraseset(ctx) {
        let ref = DOM.requireAttrValue(ctx.xmlElement, 'ref');
        let phraseset = RAG.database.getPhraseset(ref);
        ctx.newElement.dataset['ref'] = ref;
        if (!phraseset) {
            ctx.newElement.textContent = `(UNKNOWN PHRASESET: ${ref})`;
            return;
        }
        let idx = RAG.state.getPhrasesetIdx(ref);
        let phrase = phraseset.children[idx];
        ctx.newElement.dataset['idx'] = idx.toString();
        ctx.newElement.title =
            `Click to change this phrase used in this section ('${ref}')`;
        if (ctx.xmlElement.hasAttribute('chance'))
            this.makeCollapsible(ctx, phrase, ref);
        else
            DOM.cloneInto(phrase, ctx.newElement);
    }
    static platform(ctx) {
        ctx.newElement.title = "Click to change the platform number";
        ctx.newElement.textContent = RAG.state.platform.join('');
    }
    static service(ctx) {
        ctx.newElement.title = "Click to change this train's network";
        ctx.newElement.textContent = RAG.state.service;
    }
    static station(ctx) {
        let code = RAG.state.stationCode;
        ctx.newElement.title = "Click to change this station";
        ctx.newElement.textContent = RAG.database.getStation(code);
    }
    static stationlist(ctx) {
        let stations = RAG.database.pickStations();
        let stationList = '';
        if (stations.length === 1)
            stationList = (ctx.xmlElement.id === 'calling')
                ? `${stations[0]} only`
                : stations[0];
        else {
            let lastStation = stations.pop();
            stationList = stations.join(', ');
            stationList += ` and ${lastStation}`;
        }
        ctx.newElement.textContent = stationList;
    }
    static time(ctx) {
        ctx.newElement.title = "Click to change the time";
        ctx.newElement.textContent = RAG.state.time;
    }
    static unknown(ctx) {
        let name = ctx.xmlElement.nodeName;
        ctx.newElement.textContent = `(UNKNOWN XML ELEMENT: ${name})`;
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
        RAG.views.editor.setCollapsible(ctx.newElement, toggle, collapsed);
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
            throw new Error("Too many levels of recursion, when processing phrase.");
    }
}
Phraser.DIGITS = ['zero', 'one', 'two', 'three', 'four',
    'five', 'six', 'seven', 'eight', 'nine', 'ten'];
Phraser.LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
class Editor {
    constructor() {
        this.dom = DOM.require('#editor');
        document.body.onclick = this.handleClick.bind(this);
        this.dom.textContent = "Please wait...";
    }
    generate() {
        this.dom.innerHTML = '<phraseset ref="root" />';
        RAG.phraser.process(this.dom);
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
    getElementsByType(type) {
        return this.dom.querySelectorAll(`span[data-type=${type}]`);
    }
    getElementsByQuery(query) {
        return this.dom.querySelectorAll(`span${query}`);
    }
    getText() {
        return DOM.getCleanedVisibleText(this.dom);
    }
    setElementsText(type, value) {
        this.getElementsByType(type).forEach(element => element.textContent = value);
    }
    setCollapsible(span, toggle, state) {
        if (state)
            span.setAttribute('collapsed', '');
        else
            span.removeAttribute('collapsed');
        toggle.innerText = state ? '+' : '-';
        toggle.title = state
            ? "Click to open this optional part"
            : "Click to close this optional part";
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
    handleClick(ev) {
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
            this.setCollapsible(phraseset, toggle, !collapased);
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
        const STEP_PER_MS = 7 / (1000 / 60);
        window.cancelAnimationFrame(this.timer);
        this.domSpan.textContent = msg;
        this.offset = this.dom.clientWidth;
        let last = 0;
        let limit = -this.domSpan.clientWidth - 100;
        let anim = (time) => {
            this.offset -= (last == 0)
                ? 6
                : (time - last) * STEP_PER_MS;
            this.domSpan.style.transform = `translateX(${this.offset}px)`;
            if (this.offset < limit)
                this.domSpan.style.transform = '';
            else {
                last = time;
                this.timer = window.requestAnimationFrame(anim);
            }
        };
        window.requestAnimationFrame(anim);
    }
    stop() {
        window.cancelAnimationFrame(this.timer);
        this.domSpan.style.transform = '';
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
        this.btnPlay.onclick = () => this.handlePlay();
        this.btnStop.onclick = () => this.handleStop();
        this.btnGenerate.onclick = () => RAG.generate();
        this.btnSave.onclick = () => alert('Unimplemented');
        this.btnRecall.onclick = () => alert('Unimplemented');
        this.btnOption.onclick = () => alert('Unimplemented');
    }
    handlePlay() {
        let text = RAG.views.editor.getText();
        let parts = text.trim().split(/\.\s/i);
        RAG.speechSynth.cancel();
        parts.forEach(segment => RAG.speechSynth.speak(new SpeechSynthesisUtterance(segment)));
        RAG.views.marquee.set(text);
    }
    handleStop() {
        RAG.speechSynth.cancel();
        RAG.views.marquee.stop();
    }
}
class Views {
    constructor() {
        this.editor = new Editor();
        this.marquee = new Marquee();
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
            new TimePicker()
        ].forEach(picker => this.pickers[picker.xmlTag] = picker);
    }
    getPicker(xmlTag) {
        return this.pickers[xmlTag];
    }
}
class DOM {
    static require(query, parent = window.document) {
        let result = parent.querySelector(query);
        if (!result)
            throw new Error(`Required DOM element is missing: '${query}'`);
        return result;
    }
    static requireAttrValue(element, attr) {
        let value = element.getAttribute(attr);
        if (Strings.isNullOrEmpty(value))
            throw new Error(`Required attribute is missing or empty: '${attr}'`);
        return value;
    }
    static requireData(element, key) {
        let value = element.dataset[key];
        if (Strings.isNullOrEmpty(value))
            throw new Error(`Required dataset key is missing or empty: '${key}'`);
        return value;
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
}
class Parse {
    static boolean(str) {
        str = str.toLowerCase();
        if (str === 'true' || str === '1')
            return true;
        if (str === 'false' || str === '0')
            return false;
        throw new Error("Given string does not represent a boolean");
    }
}
class Random {
    static int(min = 0, max = 1) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
    static array(arr) {
        let idx = Random.int(0, arr.length);
        return arr[idx];
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
}
class Database {
    constructor(config) {
        let iframe = DOM.require(config.phraseSetEmbed);
        if (!iframe.contentDocument)
            throw new Error("Configured phraseset element is not an iframe embed");
        this.phraseSets = iframe.contentDocument;
        this.excuses = config.excusesData;
        this.named = config.namedData;
        this.services = config.servicesData;
        this.stations = config.stationsData;
        console.log("[Database] Entries loaded:");
        console.log("\tExcuses:", this.excuses.length);
        console.log("\tNamed trains:", this.named.length);
        console.log("\tServices:", this.services.length);
        console.log("\tStations:", Object.keys(this.stations).length);
    }
    pickExcuse() {
        return Random.array(this.excuses);
    }
    pickNamed() {
        return Random.array(this.named);
    }
    getPhrase(id) {
        return this.phraseSets.querySelector('phrase#' + id);
    }
    getPhraseset(id) {
        return this.phraseSets.querySelector('phraseset#' + id);
    }
    pickService() {
        return Random.array(this.services);
    }
    pickStationCode() {
        return Random.objectKey(this.stations);
    }
    getStation(code) {
        if (!this.stations[code])
            return `UNKNOWN STATION: ${code}`;
        return this.stations[code];
    }
    pickStations(min = 1, max = 16) {
        if (max - min > Object.keys(this.stations).length)
            throw new Error("Picking too many stations than there are available");
        let result = [];
        let length = Random.int(min, max);
        let cloned = Object.assign({}, this.stations);
        while (result.length < length) {
            let key = Random.objectKey(cloned);
            result.push(cloned[key]);
            delete cloned[key];
        }
        return result;
    }
}
class RAG {
    static main(config) {
        window.onerror = error => RAG.panic(error);
        window.onbeforeunload = _ => RAG.speechSynth.cancel();
        RAG.database = new Database(config);
        RAG.views = new Views();
        RAG.phraser = new Phraser();
        RAG.speechSynth = window.speechSynthesis;
        RAG.views.marquee.set("Welcome to RAG.");
        RAG.generate();
    }
    static generate() {
        RAG.state = new State();
        RAG.views.editor.generate();
    }
    static panic(error = "Unknown error") {
        let msg = '<div class="panic">';
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
        this._integers = {};
        this._phrasesets = {};
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
    getInteger(id, min, max) {
        if (this._integers[id] !== undefined)
            return this._integers[id];
        this._integers[id] = Random.int(min, max);
        return this._integers[id];
    }
    setInteger(id, value) {
        this._integers[id] = value;
    }
    getPhrasesetIdx(ref) {
        if (this._phrasesets[ref] !== undefined)
            return this._phrasesets[ref];
        let phraseset = RAG.database.getPhraseset(ref);
        if (!phraseset)
            throw new Error("Shouldn't get phraseset idx for one that doesn't exist");
        this._phrasesets[ref] = Random.int(0, phraseset.children.length);
        return this._phrasesets[ref];
    }
    setPhrasesetIdx(ref, idx) {
        this._phrasesets[ref] = idx;
    }
    get coach() {
        if (this._coach)
            return this._coach;
        this._coach = Random.array(Phraser.LETTERS);
        return this._coach;
    }
    set coach(value) {
        this._coach = value;
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
    get stationCode() {
        if (this._stationCode)
            return this._stationCode;
        this._stationCode = RAG.database.pickStationCode();
        return this._stationCode;
    }
    set stationCode(value) {
        this._stationCode = value;
    }
    get time() {
        if (!this._time) {
            let hour = Random.int(0, 23).toString().padStart(2, '0');
            let minute = Random.int(0, 59).toString().padStart(2, '0');
            this._time = `${hour}:${minute}`;
        }
        return this._time;
    }
    set time(value) {
        this._time = value;
    }
}
class Picker {
    constructor(xmlTag, events) {
        this.dom = DOM.require(`#${xmlTag}Picker`);
        this.domForm = DOM.require('form', this.dom);
        this.xmlTag = xmlTag;
        let self = this;
        events.forEach(event => {
            this.domForm.addEventListener(event, this.onChange.bind(self));
        });
        this.domForm.onsubmit = ev => {
            ev.preventDefault();
            self.onChange(ev);
        };
    }
    open(target) {
        this.dom.classList.remove('hidden');
        this.domEditing = target;
        this.layout();
    }
    layout() {
        if (!this.domEditing)
            return;
        let rect = this.domEditing.getBoundingClientRect();
        let fullWidth = this.dom.classList.contains('fullWidth');
        let midHeight = this.dom.classList.contains('midHeight');
        let dialogX = (rect.left | 0) - 8;
        let dialogY = rect.bottom | 0;
        let width = (rect.width | 0) + 16;
        if (!fullWidth) {
            this.dom.style.minWidth = `${width}px`;
            if (dialogX + this.dom.offsetWidth > document.body.clientWidth)
                dialogX = (rect.right | 0) - this.dom.offsetWidth + 8;
        }
        if (midHeight) {
            dialogY = (this.dom.offsetHeight / 2) | 0;
        }
        else if (dialogY + this.dom.offsetHeight > document.body.clientHeight) {
            dialogY = (rect.top | 0) - this.dom.offsetHeight + 1;
            this.domEditing.classList.add('below');
        }
        else
            this.domEditing.classList.add('above');
        this.dom.style.transform = fullWidth
            ? `translateY(${dialogY}px)`
            : `translate(${dialogX}px, ${dialogY}px)`;
    }
    close() {
        this.dom.classList.add('hidden');
    }
}
class CoachPicker extends Picker {
    constructor() {
        super('coach', ['change']);
        this.inputLetter = DOM.require('select', this.dom);
        for (let i = 0; i < 26; i++) {
            let option = document.createElement('option');
            let letter = Phraser.LETTERS[i];
            option.text = option.value = letter;
            this.inputLetter.appendChild(option);
        }
    }
    open(target) {
        super.open(target);
        this.inputLetter.value = RAG.state.coach;
    }
    onChange(_) {
        RAG.state.coach = this.inputLetter.value;
        RAG.views.editor.setElementsText('coach', RAG.state.coach);
    }
}
class ExcusePicker extends Picker {
    constructor() {
        super('excuse', ['click']);
        this.domChoices = [];
        this.inputService = DOM.require('.picker', this.dom);
        RAG.database.excuses.forEach(value => {
            let excuse = document.createElement('option');
            excuse.text = value;
            excuse.value = value;
            excuse.title = value;
            this.domChoices.push(excuse);
            this.inputService.appendChild(excuse);
        });
    }
    open(target) {
        super.open(target);
        let value = RAG.state.excuse;
        this.domChoices.some(excuse => {
            if (value !== excuse.value)
                return false;
            this.select(excuse);
            return true;
        });
    }
    select(option) {
        if (this.domSelected)
            this.domSelected.removeAttribute('selected');
        this.domSelected = option;
        option.setAttribute('selected', 'true');
    }
    onChange(ev) {
        let target = ev.target;
        if (!target || !target.value)
            return;
        else
            this.select(target);
        RAG.state.excuse = target.value;
        RAG.views.editor.setElementsText('excuse', RAG.state.excuse);
    }
}
class IntegerPicker extends Picker {
    constructor() {
        super('integer', ['change']);
        this.inputDigit = DOM.require('input', this.dom);
        this.domLabel = DOM.require('label', this.dom);
    }
    open(target) {
        super.open(target);
        let min = DOM.requireData(target, 'min');
        let max = DOM.requireData(target, 'max');
        this.min = parseInt(min);
        this.max = parseInt(max);
        this.id = DOM.requireData(target, 'id');
        this.singular = target.dataset['singular'];
        this.plural = target.dataset['plural'];
        this.words = Parse.boolean(target.dataset['words'] || 'false');
        let value = RAG.state.getInteger(this.id, this.min, this.max);
        if (this.singular && value === 1)
            this.domLabel.innerText = this.singular;
        else if (this.plural && value !== 1)
            this.domLabel.innerText = this.plural;
        else
            this.domLabel.innerText = '';
        this.inputDigit.min = min;
        this.inputDigit.max = max;
        this.inputDigit.value = value.toString();
    }
    onChange(_) {
        if (!this.id)
            throw new Error("onChange fired for integer picker without state");
        let int = parseInt(this.inputDigit.value);
        let intStr = (this.words)
            ? Phraser.DIGITS[int]
            : int.toString();
        if (int === 1 && this.singular) {
            intStr += ` ${this.singular}`;
            this.domLabel.innerText = this.singular;
        }
        else if (int !== 1 && this.plural) {
            intStr += ` ${this.plural}`;
            this.domLabel.innerText = this.plural;
        }
        RAG.state.setInteger(this.id, int);
        RAG.views.editor
            .getElementsByQuery(`[data-type=integer][data-id=${this.id}]`)
            .forEach(element => element.textContent = intStr);
    }
}
class NamedPicker extends Picker {
    constructor() {
        super('named', ['click']);
        this.domChoices = [];
        this.inputNamed = DOM.require('.picker', this.dom);
        RAG.database.named.forEach(value => {
            let named = document.createElement('option');
            named.text = value;
            named.value = value;
            named.title = value;
            this.domChoices.push(named);
            this.inputNamed.appendChild(named);
        });
    }
    open(target) {
        super.open(target);
        let value = RAG.state.named;
        this.domChoices.some(named => {
            if (value !== named.value)
                return false;
            this.select(named);
            return true;
        });
    }
    select(option) {
        if (this.domSelected)
            this.domSelected.removeAttribute('selected');
        this.domSelected = option;
        option.setAttribute('selected', 'true');
    }
    onChange(ev) {
        let target = ev.target;
        if (!target || !target.value)
            return;
        else
            this.select(target);
        RAG.state.named = target.value;
        RAG.views.editor.setElementsText('named', RAG.state.named);
    }
}
class PhrasesetPicker extends Picker {
    constructor() {
        super('phraseset', ['click']);
        this.domHeader = DOM.require('header', this.dom);
        this.inputPhrase = DOM.require('.picker', this.dom);
    }
    open(target) {
        super.open(target);
        let ref = DOM.requireData(target, 'ref');
        let idx = parseInt(DOM.requireData(target, 'idx'));
        let phraseSet = RAG.database.getPhraseset(ref);
        if (!phraseSet)
            return;
        this.currentRef = ref;
        this.domHeader.innerText = `Pick a phrase for the '${ref}' section`;
        this.inputPhrase.innerHTML = '';
        for (let i = 0; i < phraseSet.children.length; i++) {
            let phrase = document.createElement('li');
            DOM.cloneInto(phraseSet.children[i], phrase);
            RAG.phraser.process(phrase);
            phrase.innerText = DOM.getCleanedVisibleText(phrase);
            phrase.dataset.idx = i.toString();
            this.inputPhrase.appendChild(phrase);
            if (i === idx)
                this.select(phrase);
        }
    }
    select(option) {
        if (this.domSelected)
            this.domSelected.removeAttribute('selected');
        this.domSelected = option;
        option.setAttribute('selected', 'true');
    }
    onChange(ev) {
        let target = ev.target;
        if (!target || !target.dataset['idx'] || !this.currentRef)
            return;
        let idx = parseInt(target.dataset['idx']);
        RAG.state.setPhrasesetIdx(this.currentRef, idx);
        RAG.views.editor.closeDialog();
        RAG.views.editor.refreshPhraseset(this.currentRef);
    }
}
class PlatformPicker extends Picker {
    constructor() {
        super('platform', ['change']);
        this.inputDigit = DOM.require('input', this.dom);
        this.inputLetter = DOM.require('select', this.dom);
    }
    open(target) {
        super.open(target);
        let value = RAG.state.platform;
        this.inputDigit.value = value[0];
        this.inputLetter.value = value[1];
    }
    onChange(_) {
        RAG.state.platform = [this.inputDigit.value, this.inputLetter.value];
        RAG.views.editor.setElementsText('platform', RAG.state.platform.join(''));
    }
}
class ServicePicker extends Picker {
    constructor() {
        super('service', ['click']);
        this.domChoices = [];
        this.inputService = DOM.require('.picker', this.dom);
        RAG.database.services.forEach(value => {
            let service = document.createElement('option');
            service.text = value;
            service.value = value;
            service.title = value;
            this.domChoices.push(service);
            this.inputService.appendChild(service);
        });
    }
    open(target) {
        super.open(target);
        let value = RAG.state.service;
        this.domChoices.some(service => {
            if (value !== service.value)
                return false;
            this.select(service);
            return true;
        });
    }
    select(option) {
        if (this.domSelected)
            this.domSelected.removeAttribute('selected');
        this.domSelected = option;
        option.setAttribute('selected', 'true');
    }
    onChange(ev) {
        let target = ev.target;
        if (!target || !target.value)
            return;
        else
            this.select(target);
        RAG.state.service = target.value;
        RAG.views.editor.setElementsText('service', RAG.state.service);
    }
}
class StationPicker extends Picker {
    constructor() {
        super('station', ['click', 'input']);
        this.filterTimeout = 0;
        this.domChoices = {};
        this.inputFilter = DOM.require('input', this.dom);
        this.inputStation = DOM.require('.picker', this.dom);
        Object.keys(RAG.database.stations).forEach(code => {
            let station = RAG.database.stations[code];
            let letter = station[0];
            let group = this.domChoices[letter];
            if (!group) {
                let header = document.createElement('dt');
                header.innerText = letter.toUpperCase();
                group = this.domChoices[letter] = document.createElement('dl');
                group.appendChild(header);
                this.inputStation.appendChild(group);
            }
            let entry = document.createElement('dd');
            entry.innerText = RAG.database.stations[code];
            entry.dataset['code'] = code;
            group.appendChild(entry);
        });
    }
    open(target) {
        super.open(target);
        this.inputFilter.focus();
        let code = RAG.state.stationCode;
        let entry = this.inputStation.querySelector(`dd[data-code=${code}]`);
        if (entry)
            this.select(entry);
    }
    select(option) {
        if (this.domSelected)
            this.domSelected.removeAttribute('selected');
        this.domSelected = option;
        option.setAttribute('selected', 'true');
    }
    onChange(ev) {
        let target = ev.target;
        if (!target)
            return;
        else if (target === this.inputFilter) {
            window.clearTimeout(this.filterTimeout);
            this.filterTimeout = window.setTimeout(this.filter.bind(this), 500);
        }
        else if (ev.type.toLowerCase() === 'submit')
            this.filter();
        else if (target.dataset['code']) {
            this.select(target);
            RAG.state.stationCode = target.dataset['code'];
            RAG.views.editor.setElementsText('station', target.innerText);
        }
    }
    filter() {
        window.clearTimeout(this.filterTimeout);
        let filter = this.inputFilter.value.toLowerCase();
        let letters = this.inputStation.children;
        this.inputStation.classList.add('hidden');
        for (let i = 0; i < letters.length; i++) {
            let letter = letters[i];
            let entries = letters[i].children;
            let count = entries.length - 1;
            let hidden = 0;
            for (let j = 1; j < entries.length; j++) {
                let entry = entries[j];
                if (entry.innerText.toLowerCase().indexOf(filter) >= 0)
                    entry.classList.remove('hidden');
                else {
                    entry.classList.add('hidden');
                    hidden++;
                }
            }
            if (hidden >= count)
                letter.classList.add('hidden');
            else
                letter.classList.remove('hidden');
        }
        this.inputStation.classList.remove('hidden');
    }
}
class TimePicker extends Picker {
    constructor() {
        super('time', ['change']);
        this.inputTime = DOM.require('input', this.dom);
    }
    open(target) {
        super.open(target);
        this.inputTime.value = RAG.state.time;
    }
    onChange(_) {
        RAG.state.time = this.inputTime.value;
        RAG.views.editor.setElementsText('time', RAG.state.time.toString());
    }
}
//# sourceMappingURL=rag.js.map