"use strict";
class ElementProcessors {
    static coach(ctx) {
        ctx.newElement.textContent = Random.array("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }
    static excuse(ctx) {
        ctx.newElement.textContent = RAG.database.pickExcuse();
    }
    static integer(ctx) {
        let attrMin = ctx.xmlElement.getAttribute('min');
        let attrMax = ctx.xmlElement.getAttribute('max');
        let attrSingular = ctx.xmlElement.getAttribute('singular');
        let attrPlural = ctx.xmlElement.getAttribute('plural');
        let attrWords = ctx.xmlElement.getAttribute('words');
        if (!attrMin || !attrMax)
            throw new Error("Integer tag is missing required attributes");
        let intMin = parseInt(attrMin);
        let intMax = parseInt(attrMax);
        let int = Random.int(intMin, intMax);
        let intStr = attrWords && attrWords.toLowerCase() === 'true'
            ? Phraser.DIGITS[int]
            : int.toString();
        if (int === 1 && attrSingular)
            intStr += ` ${attrSingular}`;
        else if (int !== 1 && attrPlural)
            intStr += ` ${attrPlural}`;
        ctx.newElement.textContent = intStr;
    }
    static named(ctx) {
        ctx.newElement.textContent = RAG.state.named;
    }
    static optional(ctx) {
        if (!ctx.xmlElement.hasAttribute('chance'))
            ctx.xmlElement.setAttribute('chance', '50');
        this.makeCollapsible(ctx, ctx.xmlElement);
    }
    static phrase(ctx) {
        let ref = DOM.requireAttrValue(ctx.xmlElement, 'ref');
        let phrase = ctx.phraseSet.querySelector('phrase#' + ref);
        ctx.newElement.dataset['ref'] = ref;
        if (!phrase) {
            ctx.newElement.textContent = `(UNKNOWN PHRASE: ${ref})`;
            return;
        }
        if (ctx.xmlElement.hasAttribute('chance'))
            this.makeCollapsible(ctx, phrase);
        else
            DOM.cloneInto(phrase, ctx.newElement);
    }
    static phraseset(ctx) {
        let ref = DOM.requireAttrValue(ctx.xmlElement, 'ref');
        let phraseset = ctx.phraseSet.querySelector('phraseset#' + ref);
        ctx.newElement.dataset['ref'] = ref;
        if (!phraseset) {
            ctx.newElement.textContent = `(UNKNOWN PHRASESET: ${ref})`;
            return;
        }
        let phrase = Random.array(phraseset.children);
        if (ctx.xmlElement.hasAttribute('chance'))
            this.makeCollapsible(ctx, phrase);
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
        ctx.newElement.textContent = RAG.database.pickStation();
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
    static makeCollapsible(ctx, source) {
        let chance = ctx.xmlElement.getAttribute('chance');
        let inner = document.createElement('span');
        inner.setAttribute('inner', 'true');
        DOM.cloneInto(source, inner);
        ctx.newElement.dataset['chance'] = chance;
        if (!Random.bool(parseInt(chance))) {
            ctx.newElement.setAttribute('collapsed', '');
            ctx.newElement.title = "Click to open this optional part";
        }
        else
            ctx.newElement.title = "Click to close this optional part";
        ctx.newElement.appendChild(inner);
    }
}
class Phraser {
    constructor(config) {
        let iframe = DOM.require(config.phraseSetEmbed);
        if (!iframe.contentDocument)
            throw new Error("Configured phraseset element is not an iframe embed");
        this.phraseSets = iframe.contentDocument;
    }
    process(container, level = 0) {
        let pending = container.querySelectorAll(':not(span)');
        if (pending.length === 0)
            return;
        pending.forEach(element => {
            let elementName = element.nodeName.toLowerCase();
            let newElement = document.createElement('span');
            let context = {
                xmlElement: element,
                newElement: newElement,
                phraseSet: this.phraseSets
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
                case 'optional':
                    ElementProcessors.optional(context);
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
    getElements(type) {
        return this.dom.querySelectorAll(`span[data-type=${type}]`);
    }
    getText() {
        return DOM.getVisibleText(this.dom);
    }
    setElementsText(type, value) {
        this.getElements(type).forEach(element => element.textContent = value);
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
        let picker = type ? RAG.viewController.getPicker(type) : undefined;
        if (target && this.currentPicker)
            if (this.currentPicker.dom.contains(target))
                return;
        if (target && target === this.domEditing)
            return this.closeDialog();
        this.closeDialog();
        if (target.dataset['chance'])
            this.toggleOptional(target);
        else if (target.hasAttribute('inner'))
            this.toggleOptional(target.parentElement);
        else if (target && type && picker)
            this.openPicker(target, picker);
    }
    toggleOptional(target) {
        if (target.hasAttribute('collapsed')) {
            target.removeAttribute('collapsed');
            target.title = "Click to close this optional part";
        }
        else {
            target.setAttribute('collapsed', '');
            target.title = "Click to open this optional part";
        }
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
            this.offset -= 6;
            this.domSpan.style.transform = `translateX(${this.offset}px)`;
            if (this.offset < limit)
                this.domSpan.style.transform = '';
            else
                this.timer = window.requestAnimationFrame(anim);
        };
        anim();
    }
    stop() {
        window.cancelAnimationFrame(this.timer);
        this.domSpan.style.transform = '';
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
        let dialogX = (rect.left | 0) - 8;
        let dialogY = rect.bottom | 0;
        let width = (rect.width | 0) + 16;
        if (!fullWidth) {
            this.dom.style.minWidth = `${width}px`;
            if (dialogX + this.dom.offsetWidth > document.body.clientWidth)
                dialogX = (rect.right | 0) - this.dom.offsetWidth + 8;
        }
        if (dialogY + this.dom.offsetHeight > document.body.clientHeight) {
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
        RAG.viewController.editor.setElementsText('platform', RAG.state.platform.join(''));
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
        RAG.viewController.editor.setElementsText('service', RAG.state.service);
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
        RAG.viewController.editor.setElementsText('time', RAG.state.time.toString());
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
        let text = RAG.viewController.editor.getText();
        let parts = text.trim().split(/\.\s/i);
        RAG.speechSynth.cancel();
        parts.forEach(segment => RAG.speechSynth.speak(new SpeechSynthesisUtterance(segment)));
        RAG.viewController.marquee.set(text);
    }
    handleStop() {
        RAG.speechSynth.cancel();
        RAG.viewController.marquee.stop();
    }
}
class ViewController {
    constructor() {
        this.editor = new Editor();
        this.marquee = new Marquee();
        this.toolbar = new Toolbar();
        this.pickers = {};
        [
            new PlatformPicker(),
            new ServicePicker(),
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
    static cloneInto(source, target) {
        for (let i = 0; i < source.childNodes.length; i++)
            target.appendChild(source.childNodes[i].cloneNode(true));
    }
    static getVisibleText(element) {
        if (element.nodeType === Node.TEXT_NODE)
            return element.textContent || '';
        let style = getComputedStyle(element);
        if (style && style.display === 'none')
            return '';
        let text = '';
        for (let i = 0; i < element.childNodes.length; i++)
            text += DOM.getVisibleText(element.childNodes[i]);
        return text;
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
        this.excuses = [];
        this.named = [];
        this.services = [];
        this.stations = {};
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
    pickService() {
        return Random.array(this.services);
    }
    pickStation() {
        let code = Random.objectKey(this.stations);
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
        RAG.viewController = new ViewController();
        RAG.phraser = new Phraser(config);
        RAG.speechSynth = window.speechSynthesis;
        RAG.viewController.marquee.set("Welcome to RAG.");
        RAG.generate();
    }
    static generate() {
        RAG.state = new State();
        RAG.viewController.editor.generate();
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
//# sourceMappingURL=rag.js.map