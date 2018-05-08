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
        ctx.newElement.textContent = RAG.database.pickNamed();
    }
    static optional(ctx) {
        this.makeCollapsible(ctx, '50');
        ctx.newElement.appendChild(this.cloneIntoInner(ctx.xmlElement));
    }
    static phrase(ctx) {
        let ref = ctx.xmlElement.getAttribute('ref') || '';
        let phrase = ctx.phraseSet.querySelector('phrase#' + ref);
        if (!phrase) {
            ctx.newElement.textContent = `(UNKNOWN PHRASE: ${ref})`;
            return;
        }
        ctx.newElement.dataset['ref'] = ref;
        this.makeCollapsible(ctx);
        ctx.newElement.appendChild(this.cloneIntoInner(phrase));
    }
    static phraseset(ctx) {
        let ref = ctx.xmlElement.getAttribute('ref') || '';
        let phraseset = ctx.phraseSet.querySelector('phraseset#' + ref);
        if (Strings.isNullOrEmpty(ref))
            throw new Error('phraseset element missing a ref attribute');
        if (!phraseset) {
            ctx.newElement.textContent = `(UNKNOWN PHRASESET: ${ref})`;
            return;
        }
        let phrase = Random.array(phraseset.children);
        this.makeCollapsible(ctx);
        ctx.newElement.appendChild(this.cloneIntoInner(phrase));
    }
    static platform(ctx) {
        ctx.newElement.addEventListener('click', ev => RAG.viewController.platformPicker.onClick(ev, ctx), true);
        ctx.newElement.textContent = RAG.state.platform.join('');
    }
    static service(ctx) {
        ctx.newElement.textContent = RAG.database.pickService();
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
        ctx.newElement.addEventListener('click', ev => RAG.viewController.timePicker.onClick(ev, ctx), true);
        ctx.newElement.textContent = RAG.state.time;
    }
    static unknown(ctx) {
        let name = ctx.xmlElement.nodeName;
        ctx.newElement.textContent = `(UNKNOWN XML ELEMENT: ${name})`;
    }
    static cloneIntoInner(element) {
        let inner = document.createElement('span');
        for (let i = 0; i < element.childNodes.length; i++)
            inner.appendChild(element.childNodes[i].cloneNode(true));
        return inner;
    }
    static makeCollapsible(ctx, defChance = '') {
        let chance = ctx.xmlElement.getAttribute('chance') || defChance;
        if (Strings.isNullOrEmpty(chance))
            return;
        ctx.newElement.dataset['chance'] = chance;
        if (!Random.bool(parseInt(chance)))
            ctx.newElement.setAttribute('collapsed', '');
        ctx.newElement.addEventListener('click', ev => {
            ev.stopPropagation();
            if (ctx.newElement.hasAttribute('collapsed'))
                ctx.newElement.removeAttribute('collapsed');
            else
                ctx.newElement.setAttribute('collapsed', '');
        });
    }
}
class Phraser {
    constructor(config) {
        let iframe = DOM.require(config.phraseSetEmbed);
        if (!iframe.contentDocument)
            throw new Error("Configured phraseset element is not an iframe embed");
        this.phraseSets = iframe.contentDocument;
    }
    generate() {
        let editor = RAG.viewController.getEditor();
        editor.innerHTML = '<phraseset ref="root" />';
        this.process(editor);
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
class PlatformPicker {
    constructor() {
        let self = this;
        this.dom = DOM.require('#platformPicker');
        this.domForm = DOM.require('form', this.dom);
        this.inputDigit = DOM.require('input', this.dom);
        this.inputLetter = DOM.require('select', this.dom);
        this.domForm.onchange = ev => self.onChange(ev);
        this.domForm.onsubmit = ev => self.onSubmit(ev);
    }
    onClick(ev, ctx) {
        ev.stopPropagation();
        if (this.editing) {
            this.editing.removeAttribute('editing');
            if (ev.target === this.editing) {
                this.editing = undefined;
                this.dom.classList.add('hidden');
                return;
            }
        }
        this.dom.classList.remove('hidden');
        ctx.newElement.setAttribute('editing', 'true');
        this.editing = ev.target;
        let rect = ctx.newElement.getBoundingClientRect();
        let dialogX = (rect.left | 0) - 8;
        let dialogY = rect.bottom | 0;
        let value = RAG.state.platform;
        this.inputDigit.value = value[0];
        this.inputLetter.value = value[1];
        if (dialogX + this.dom.offsetWidth > document.body.clientWidth)
            dialogX = (rect.right | 0) - this.dom.offsetWidth + 8;
        this.dom.style.transform = `translate(${dialogX}px, ${dialogY}px)`;
    }
    onChange(ev) {
        let elements = RAG.viewController.getEditor()
            .querySelectorAll('span[data-type=platform]');
        RAG.state.platform = [this.inputDigit.value, this.inputLetter.value];
        elements.forEach(element => {
            element.textContent = RAG.state.platform.join('');
        });
        ev;
    }
    onSubmit(ev) {
        ev.preventDefault();
        this.onChange(ev);
    }
}
class TimePicker {
    constructor() {
        let self = this;
        this.dom = DOM.require('#timePicker');
        this.domForm = DOM.require('form', this.dom);
        this.inputTime = DOM.require('input', this.dom);
        this.domForm.onchange = ev => self.onChange(ev);
        this.domForm.onsubmit = ev => self.onSubmit(ev);
    }
    onClick(ev, ctx) {
        ev.stopPropagation();
        if (this.editing) {
            this.editing.removeAttribute('editing');
            if (ev.target === this.editing) {
                this.editing = undefined;
                this.dom.classList.add('hidden');
                return;
            }
        }
        this.dom.classList.remove('hidden');
        ctx.newElement.setAttribute('editing', 'true');
        this.editing = ev.target;
        let rect = ctx.newElement.getBoundingClientRect();
        let dialogX = (rect.left | 0) - 8;
        let dialogY = rect.bottom | 0;
        let width = (rect.width | 0) + 16;
        let value = RAG.state.time;
        this.dom.style.minWidth = `${width}px`;
        this.inputTime.value = value;
        if (dialogX + this.dom.offsetWidth > document.body.clientWidth)
            dialogX = (rect.right | 0) - this.dom.offsetWidth + 8;
        this.dom.style.transform = `translate(${dialogX}px, ${dialogY}px)`;
    }
    onChange(ev) {
        let elements = RAG.viewController.getEditor()
            .querySelectorAll('span[data-type=time]');
        RAG.state.time = this.inputTime.value;
        elements.forEach(element => {
            element.textContent = RAG.state.time.toString();
        });
        ev;
    }
    onSubmit(ev) {
        ev.preventDefault();
        this.onChange(ev);
    }
}
class Toolbar {
    constructor() {
        this.domToolbar = DOM.require('#toolbar');
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
        let text = DOM.getVisibleText(RAG.viewController.getEditor());
        let parts = text.trim().split(/\.\s/i);
        RAG.speechSynth.cancel();
        parts.forEach(segment => RAG.speechSynth.speak(new SpeechSynthesisUtterance(segment)));
        RAG.viewController.setMarquee(text);
    }
    handleStop() {
        RAG.speechSynth.cancel();
        RAG.viewController.stopMarquee();
    }
}
class ViewController {
    constructor() {
        this.signageTimer = 0;
        this.signageOffset = 0;
        this.platformPicker = new PlatformPicker();
        this.timePicker = new TimePicker();
        this.toolbar = new Toolbar();
        this.domEditor = DOM.require('#editor');
        this.domSignage = DOM.require('#signage');
        this.domSignageSpan = document.createElement('span');
        this.domSignage.innerHTML = '';
        this.domSignage.appendChild(this.domSignageSpan);
        this.domEditor.textContent = "Please wait...";
        this.domSignageSpan.textContent = "Please wait...";
    }
    setMarquee(msg) {
        window.cancelAnimationFrame(this.signageTimer);
        this.domSignageSpan.textContent = msg;
        this.signageOffset = this.domSignage.clientWidth;
        let limit = -this.domSignageSpan.clientWidth - 100;
        let anim = () => {
            this.signageOffset -= 6;
            this.domSignageSpan.style.transform = `translateX(${this.signageOffset}px)`;
            if (this.signageOffset < limit)
                this.domSignageSpan.style.transform = '';
            else
                this.signageTimer = window.requestAnimationFrame(anim);
        };
        anim();
    }
    stopMarquee() {
        window.cancelAnimationFrame(this.signageTimer);
        this.domSignageSpan.style.transform = '';
    }
    getEditor() {
        return this.domEditor;
    }
}
class DOM {
    static require(query, parent = window.document) {
        let result = parent.querySelector(query);
        if (!result)
            throw new Error(`Required DOM element is missing: '${query}'`);
        return result;
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
        RAG.viewController = new ViewController();
        RAG.database = new Database(config);
        RAG.phraser = new Phraser(config);
        RAG.speechSynth = window.speechSynthesis;
        RAG.viewController.setMarquee("Welcome to RAG.");
        RAG.generate();
        window.onbeforeunload = _ => {
            RAG.speechSynth.cancel();
        };
    }
    static generate() {
        RAG.state = new State();
        RAG.phraser.generate();
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