/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Main class of the entire Rail Announcements Generator application */
class RAG
{
    /** Gets the database manager, which holds station and train data */
    public static database       : Database;
    /** Gets the phrase manager, which generates HTML phrases from XML */
    public static phraser        : Phraser;
    /** Gets the view controller, which manages UI interaction */
    public static viewController : ViewController;



    /**
     * Entry point for RAG, to be called from Javascript.
     *
     * @param {RAGConfig} config Configuration object, with rail data to use
     */
    public static main(config: RAGConfig)
    {
        RAG.viewController = new ViewController();
        RAG.database       = new Database(config);
        RAG.phraser        = new Phraser(config);

        // Begin

        RAG.viewController.setMarquee("this is a scroll test");
        RAG.phraser.generate();
    }

    public static panic(msg: string = "Unknown error")
    {
        msg = `PANIC: ${msg} (see console)`;

        if (this.viewController && this.viewController.isReady)
            this.viewController.setMarquee(msg);
        else
            document.body.innerHTML = `<div class="panic">${msg}</div>`;
    }
}