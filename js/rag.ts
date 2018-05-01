/// <reference path="database.ts" />
/// <reference path="phraser.ts" />
/// <reference path="util/dom.ts" />
/// <reference path="util/random.ts" />
/// <reference path="util/types.ts" />

class RAG
{
    static database : Database;
    static phraser  : Phraser;

    static domSignage : Element;
    static domEditor  : Element;

    public static main(config: RAGConfig)
    {
        // DOM setup

        RAG.domSignage = DOM.require('.signage');
        RAG.domEditor  = DOM.require('.editor');

        RAG.domSignage.textContent = "Please wait...";
        RAG.domEditor.textContent = "";

        // Manager setup

        RAG.database = new Database(config);
        RAG.phraser  = new Phraser(config);
    }
}