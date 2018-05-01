"use strict";
class Random {
    static int(min = 0, max = 1) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
    static array(arr) {
        let idx = Random.int(0, arr.length - 1);
        return arr[idx];
    }
    static objectKey(obj) {
        return Random.array(Object.keys(obj));
    }
    static bool(chance = 50) {
        return Random.int(0, 100) < chance;
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
class DOM {
    static require(query, document = window.document) {
        let result = document.querySelector(query);
        if (!result)
            throw new Error(`Required DOM element is missing: '${query}'`);
        return result;
    }
}
class Strings {
    static isNullOrEmpty(str) {
        return !str || !str.trim();
    }
}
class Phraser {
    constructor(config) {
        this.DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six',
            'seven', 'eight', 'nine', 'ten'];
        let iframe = DOM.require(config.phraseSetEmbed);
        if (!iframe.contentDocument)
            throw new Error("Configured phraseset element is not an iframe embed");
        this.document = iframe.contentDocument;
        this.rootPhrases = DOM.require('#root', this.document);
        let setCount = this.document.querySelectorAll('messages > phraseset').length;
        let rootCount = this.rootPhrases.children.length;
        console.log("[Phraser] Phrases loaded:");
        console.log("\tSets:", setCount);
        console.log("\tRoot phrases:", rootCount);
    }
    randomPhrase() {
        let domEditor = RAG.domEditor;
        let phrase = Random.array(this.rootPhrases.children);
        phrase = phrase.cloneNode(true);
        if (!phrase.firstChild)
            throw new Error(`Empty phrase: '${phrase}'`);
        this.process(phrase.firstChild);
        domEditor.appendChild(phrase);
    }
    getPhraseSet(id) {
        return this.document.querySelector('phraseset#' + id);
    }
    process(element) {
        if (!element.parentElement)
            throw new Error(`Phrase element has no parent: '${element}'`);
        let refId = element.attributes
            ? element.attributes.getNamedItem('ref')
            : null;
        switch (element.nodeName.toLowerCase()) {
            case "excuse":
                element.textContent = RAG.database.pickExcuse();
                break;
            case "integer":
                if (!element.attributes)
                    throw new Error("Integer tag is missing required attributes");
                let attrMin = element.attributes.getNamedItem('min');
                let attrMax = element.attributes.getNamedItem('max');
                let attrSingular = element.attributes.getNamedItem('singular');
                let attrPlural = element.attributes.getNamedItem('plural');
                let attrWords = element.attributes.getNamedItem('words');
                if (!attrMin || !attrMax)
                    throw new Error("Integer tag is missing required attributes");
                let intMin = parseInt(attrMin.value);
                let intMax = parseInt(attrMax.value);
                let int = Random.int(intMin, intMax);
                let intStr = attrWords && attrWords.value.toLowerCase() === 'true'
                    ? this.DIGITS[int]
                    : int.toString();
                if (int === 1 && attrSingular)
                    intStr += ` ${attrSingular.value}`;
                else if (int !== 1 && attrPlural)
                    intStr += ` ${attrPlural.value}`;
                element.textContent = intStr;
                break;
            case "letter":
                element.textContent = Random.array("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
                break;
            case "named":
                element.textContent = RAG.database.pickNamed();
                break;
            case "phrase":
                if (!refId)
                    break;
                let phrase = this.document.querySelector('phrase#' + refId.value);
                if (phrase) {
                    let newPhrase = phrase.cloneNode(true);
                    element.parentElement.replaceChild(newPhrase, element);
                    element = newPhrase;
                }
                else
                    element.textContent = `(UNKNOWN PHRASE: ${refId.value})`;
                break;
            case "phraseset":
                if (!refId)
                    break;
                let phraseset = this.getPhraseSet(refId.value);
                if (phraseset) {
                    let phrase = Random.array(phraseset.children);
                    element.appendChild(phrase.cloneNode(true));
                }
                else
                    element.textContent = `(UNKNOWN PHRASE: ${refId.value})`;
                break;
            case "platform":
                element.textContent = Random.bool(98)
                    ? Random.int(1, 16).toString()
                    : '0';
                if (Random.bool(10))
                    element.textContent += Random.array('ABC');
                break;
            case "service":
                element.textContent = RAG.database.pickService();
                break;
            case "station":
                element.textContent = RAG.database.pickStation();
                break;
            case "stationlist":
                let stations = RAG.database.pickStations();
                let stationList = '';
                if (stations.length === 1)
                    stationList = element.id === 'calling'
                        ? `${stations[0]} only`
                        : stations[0];
                else {
                    let lastStation = stations.pop();
                    stationList = stations.join(', ');
                    stationList += ` and ${lastStation}`;
                }
                element.textContent = stationList;
                break;
            case "time":
                let hour = Random.int(0, 23).toString().padStart(2, '0');
                let minute = Random.int(0, 59).toString().padStart(2, '0');
                element.textContent = `${hour}:${minute}`;
                break;
        }
        if (element.firstChild)
            this.process(element.firstChild);
        if (element.nextSibling)
            this.process(element.nextSibling);
    }
}
class RAG {
    static main(config) {
        RAG.domSignage = DOM.require('.signage');
        RAG.domEditor = DOM.require('.editor');
        RAG.domSignage.textContent = "Please wait...";
        RAG.domEditor.textContent = "";
        RAG.database = new Database(config);
        RAG.phraser = new Phraser(config);
        RAG.domSignage.textContent = "Hello, world!";
        RAG.phraser.randomPhrase();
    }
}
//# sourceMappingURL=rag.js.map