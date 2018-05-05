"use strict";
class ElementProcessors {
    static coach(ctx) {
        ctx.element.textContent = Random.array("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }
    static excuse(ctx) {
        ctx.element.textContent = RAG.database.pickExcuse();
    }
    static integer(ctx) {
        let attrMin = ctx.element.getAttribute('min');
        let attrMax = ctx.element.getAttribute('max');
        let attrSingular = ctx.element.getAttribute('singular');
        let attrPlural = ctx.element.getAttribute('plural');
        let attrWords = ctx.element.getAttribute('words');
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
        ctx.element.textContent = intStr;
    }
    static named(ctx) {
        ctx.element.textContent = RAG.database.pickNamed();
    }
    static optional(ctx) {
        let chance = ctx.element.getAttribute('chance') || '50';
        if (Strings.isNullOrEmpty(chance))
            chance = '50';
        let chanceInt = parseInt(chance);
        if (!Random.bool(chanceInt))
            ctx.element.setAttribute('collapsed', '');
        ctx.element.addEventListener('click', ev => {
            ev.stopPropagation();
            if (ctx.element.hasAttribute('collapsed'))
                ctx.element.removeAttribute('collapsed');
            else
                ctx.element.setAttribute('collapsed', '');
        });
        let innerSpan = document.createElement('span');
        while (ctx.element.firstChild)
            innerSpan.appendChild(ctx.element.firstChild);
        ctx.element.appendChild(innerSpan);
    }
    static phrase(ctx) {
        let ref = ctx.element.getAttribute('ref') || '';
        if (Strings.isNullOrEmpty(ref))
            return;
        let phrase = ctx.phraseSet.querySelector('phrase#' + ref);
        if (!phrase) {
            ctx.element.textContent = `(UNKNOWN PHRASE: ${ref})`;
            return;
        }
        let phraseClone = phrase.cloneNode(true);
        let innerSpan = document.createElement('span');
        let attrChance = ctx.element.getAttribute('chance');
        phraseClone.removeAttribute('id');
        phraseClone.setAttribute('ref', ref);
        if (attrChance)
            phraseClone.setAttribute('chance', attrChance);
        if (!ctx.element.parentElement)
            throw new Error('Expected parent of processed element is missing');
        while (phraseClone.firstChild)
            innerSpan.appendChild(phraseClone.firstChild);
        phraseClone.appendChild(innerSpan);
        ctx.element.parentElement.replaceChild(phraseClone, ctx.element);
        ctx.element = phraseClone;
        let chance = ctx.element.getAttribute('chance') || '';
        if (!Strings.isNullOrEmpty(chance)) {
            ctx.element.addEventListener('click', ev => {
                ev.stopPropagation();
                if (ctx.element.hasAttribute('collapsed'))
                    ctx.element.removeAttribute('collapsed');
                else
                    ctx.element.setAttribute('collapsed', '');
            });
            let chanceInt = parseInt(chance);
            if (!Random.bool(chanceInt))
                ctx.element.setAttribute('collapsed', '');
        }
    }
    static phraseset(ctx) {
        let ref = ctx.element.getAttribute('ref') || '';
        if (Strings.isNullOrEmpty(ref))
            return;
        let phraseset = ctx.phraseSet.querySelector('phraseset#' + ref);
        if (phraseset) {
            let phrase = Random.array(phraseset.children);
            ctx.element.appendChild(phrase.cloneNode(true));
        }
        else
            ctx.element.textContent = `(UNKNOWN PHRASESET: ${ref})`;
        let chance = ctx.element.getAttribute('chance') || '';
        if (!Strings.isNullOrEmpty(chance)) {
            ctx.element.addEventListener('click', ev => {
                ev.stopPropagation();
                if (ctx.element.hasAttribute('collapsed'))
                    ctx.element.removeAttribute('collapsed');
                else
                    ctx.element.setAttribute('collapsed', '');
            });
            let chanceInt = parseInt(chance);
            if (!Random.bool(chanceInt))
                ctx.element.setAttribute('collapsed', '');
        }
    }
    static platform(ctx) {
        ctx.element.textContent = Random.bool(98)
            ? Random.int(1, 16).toString()
            : '0';
        if (Random.bool(10))
            ctx.element.textContent += Random.array('ABC');
    }
    static service(ctx) {
        ctx.element.textContent = RAG.database.pickService();
    }
    static station(ctx) {
        ctx.element.textContent = RAG.database.pickStation();
    }
    static stationlist(ctx) {
        let stations = RAG.database.pickStations();
        let stationList = '';
        if (stations.length === 1)
            stationList = (ctx.element.id === 'calling')
                ? `${stations[0]} only`
                : stations[0];
        else {
            let lastStation = stations.pop();
            stationList = stations.join(', ');
            stationList += ` and ${lastStation}`;
        }
        ctx.element.textContent = stationList;
    }
    static time(ctx) {
        let hour = Random.int(0, 23).toString().padStart(2, '0');
        let minute = Random.int(0, 59).toString().padStart(2, '0');
        ctx.element.textContent = `${hour}:${minute}`;
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
        let phraseSet = document.createElement('phraseset');
        phraseSet.setAttribute('ref', 'root');
        RAG.viewController.setEditor(phraseSet);
        this.process(phraseSet);
    }
    process(element) {
        if (!element.parentElement)
            throw new Error(`Phrase element has no parent: '${element}'`);
        let elementName = element.nodeName.toLowerCase();
        let context = {
            element: element,
            phraseSet: this.phraseSets
        };
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
        }
        element = context.element;
        if (element.firstElementChild)
            this.process(element.firstElementChild);
        if (element.nextElementSibling)
            this.process(element.nextElementSibling);
    }
}
Phraser.DIGITS = ['zero', 'one', 'two', 'three', 'four',
    'five', 'six', 'seven', 'eight', 'nine', 'ten'];
class ViewController {
    constructor() {
        this.signageTimer = 0;
        this.signageOffset = 0;
        this.domEditor = DOM.require('#editor');
        this.domSignage = DOM.require('#signage');
        this.domToolbar = DOM.require('#toolbar');
        this.domSignageSpan = document.createElement('span');
        this.btnPlay = DOM.require('#btn_play');
        this.btnStop = DOM.require('#btn_stop');
        this.btnGenerate = DOM.require('#btn_shuffle');
        this.btnSave = DOM.require('#btn_save');
        this.btnRecall = DOM.require('#btn_load');
        this.btnOption = DOM.require('#btn_settings');
        this.btnPlay.onclick = () => this.handlePlay();
        this.btnStop.onclick = () => this.handleStop();
        this.btnGenerate.onclick = () => this.handleGenerate();
        this.btnSave.onclick = () => alert('Unimplemented');
        this.btnRecall.onclick = () => alert('Unimplemented');
        this.btnOption.onclick = () => alert('Unimplemented');
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
    setEditor(element) {
        this.domEditor.innerHTML = '';
        this.domEditor.appendChild(element);
    }
    handlePlay() {
        let text = DOM.getVisibleText(this.domEditor);
        let parts = text.trim().split(/\.\s/i);
        RAG.speechSynth.cancel();
        parts.forEach(segment => RAG.speechSynth.speak(new SpeechSynthesisUtterance(segment)));
        this.setMarquee(text);
    }
    handleStop() {
        RAG.speechSynth.cancel();
        this.stopMarquee();
    }
    handleGenerate() {
        RAG.phraser.generate();
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
        RAG.viewController = new ViewController();
        RAG.database = new Database(config);
        RAG.phraser = new Phraser(config);
        RAG.speechSynth = window.speechSynthesis;
        RAG.viewController.setMarquee("Welcome to RAG.");
        RAG.phraser.generate();
        window.onbeforeunload = _ => {
            RAG.speechSynth.cancel();
        };
    }
    static panic(msg = "Unknown error") {
        msg = `PANIC: ${msg} (see console)`;
        try {
            this.viewController.setMarquee(msg);
        }
        catch (_) {
            document.body.innerHTML = `<div class="panic">${msg}</div>`;
        }
    }
}
//# sourceMappingURL=rag.js.map