/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Main class of the entire Rail Announcements Generator application */
class RAG
{
    /** Gets the configuration container */
    public static config   : Config;
    /** Gets the database manager, which holds phrase, station and train data */
    public static database : Database;
    /** Gets the phrase manager, which generates HTML phrases from XML */
    public static phraser  : Phraser;
    /** Gets the speech engine */
    public static speech   : Speech;
    /** Gets the current train and station state */
    public static state    : State;
    /** Gets the view controller, which manages UI interaction */
    public static views    : Views;

    /**
     * Entry point for RAG, to be called from Javascript.
     *
     * @param dataRefs Configuration object, with rail data to use
     */
    public static main(dataRefs: DataRefs) : void
    {
        window.onerror              = error => RAG.panic(error);
        window.onunhandledrejection = error => RAG.panic(error);

        I18n.init();

        RAG.config   = new Config(true);
        RAG.database = new Database(dataRefs);
        RAG.views    = new Views();
        RAG.phraser  = new Phraser();
        RAG.speech   = new Speech();

        // Begin

        RAG.views.disclaimer.disclaim();
        RAG.views.marquee.set(L.WELCOME);
        RAG.generate();
    }

    /** Generates a new random phrase and state */
    public static generate() : void
    {
        RAG.state = new State();
        RAG.state.genDefaultState();
        RAG.views.editor.generate();
    }

    /** Loads state from given JSON */
    public static load(json: string) : void
    {
        RAG.state = Object.assign( new State(), JSON.parse(json) ) as State;
        RAG.views.editor.generate();
        RAG.views.marquee.set(L.STATE_FROM_STORAGE);
    }

    /** Global error handler; throws up a big red panic screen on uncaught error */
    private static panic(error: string | Event = "Unknown error")
    {
        let msg = '<div id="panicScreen" class="warningScreen">'          +
                  '<h1>"We are sorry to announce that..."</h1>'           +
                  `<p>RAG has crashed because: <code>${error}</code></p>` +
                  `<p>Please open the console for more information.</p>`  +
                  '</div>';

        document.body.innerHTML = msg;
    }
}