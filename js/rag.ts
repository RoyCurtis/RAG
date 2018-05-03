class RAG
{
    static database : Database;
    static phraser  : Phraser;

    public static domSignage : Element;
    public static domEditor  : Element;

    public static main(config: RAGConfig)
    {
        // DOM setup

        RAG.domSignage = DOM.require('.signage');
        RAG.domEditor  = DOM.require('.editor');

        RAG.domSignage.textContent = "Please wait...";
        RAG.domEditor.textContent  = "";

        // Manager setup

        RAG.database = new Database(config);
        RAG.phraser  = new Phraser(config);

        // Begin

        RAG.domSignage.textContent = "Hello, world!";
        RAG.phraser.randomPhrase();
    }
}