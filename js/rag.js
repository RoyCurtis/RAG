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
}
class DOM {
    static require(query) {
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
        let iframe = DOM.require(config.phraseSetEmbed);
        if (!iframe.contentDocument)
            throw new Error("Configured phraseset element is not an iframe embed");
        this.document = iframe.contentDocument;
        let setCount = this.document.querySelectorAll('messages > phraseset').length;
        console.log("[Phraser] Phrases loaded:");
        console.log("\tSets:", setCount);
    }
    getPhraseSet(id) {
        return this.document.querySelector('phraseset#' + id);
    }
    process(node) {
        let parent = node.parentNode;
        if (!parent)
            throw new Error('Element is missing parent');
        switch (node.nodeName.toLowerCase()) {
            case "excuse":
                node.textContent = Random.array(["a fatality", "a signal failure"]);
                break;
            case "platform":
                node.textContent = Random.int(0, 16).toString();
                break;
            case "station":
                node.textContent = Random.array(["Crewe", "Tring"]);
                break;
        }
        console.log(node);
        if (node.firstChild)
            this.process(node.firstChild);
        if (node.nextSibling)
            this.process(node.nextSibling);
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
    }
}
//# sourceMappingURL=rag.js.map