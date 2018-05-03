/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Main class of the entire Rail Announcements Generator application */
class RAG
{
    /** Gets the database manager, which holds station and train data */
    public static database : Database;
    /** Gets the phrase manager, which generates HTML phrases from XML */
    public static phraser  : Phraser;

    public static domSignage : Element;
    public static domEditor  : Element;

    /**
     * Entry point for RAG, to be called from Javascript.
     *
     * @param {RAGConfig} config Configuration object, with rail data to use
     */
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
        RAG.phraser.generate();
    }
}