/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Language entries are template delegates */
type LanguageEntry = (...parts: string[]) => string;

/** Language definitions for English; also acts as the base language */
class EnglishLanguage
{
    [index: string] : LanguageEntry | string | string[];

    // RAG

    WELCOME       = 'Welcome to Rail Announcement Generator.';
    DOM_MISSING   = (q: any) => `Required DOM element is missing: '${q}'`;
    ATTR_MISSING  = (a: any) => `Required attribute is missing: '${a}'`;
    DATA_MISSING  = (k: any) => `Required dataset key is missing or empty: '${k}'`;
    BAD_DIRECTION = (v: any) => `Direction needs to be -1 or 1, not '${v}'`;
    BAD_BOOLEAN   = (v: any) => `Given string does not represent a boolean: '${v}'`;

    // State

    STATE_FROM_STORAGE  = 'State has been loaded from storage.';
    STATE_TO_STORAGE    = 'State has been saved to storage, and dumped to console.';
    STATE_COPY_PASTE    = '%cCopy and paste this in console to load later:';
    STATE_RAW_JSON      = '%cRaw JSON state:';
    STATE_SAVE_MISSING  = 'Sorry, no state was found in storage.';
    STATE_SAVE_FAIL     = (msg: string) =>
        `Sorry, state could not be saved to storage: ${msg}`;
    STATE_BAD_PHRASESET = (r: string) =>
        `Attempted to get chosen index for phraseset (${r}) that doesn't exist.`;

    // Config

    CONFIG_LOAD_FAIL  = (msg: any) => `Could not load settings: ${msg}`;
    CONFIG_SAVE_FAIL  = (msg: any) => `Could not save settings: ${msg}`;
    CONFIG_RESET_FAIL = (msg: any) => `Could not clear settings: ${msg}`;

    // Database

    DB_ELEMENT_NOT_PHRASESET_IFRAME = (e: string) =>
        `Configured phraseset element query '${e}' does not point to an iframe embed.`;

    DB_UNKNOWN_STATION   = (c: any) => `UNKNOWN STATION: ${c}`;
    DB_EMPTY_STATION     = (c: any) =>
        `Station database appears to contain an empty name for code '${c}'.`;
    DB_TOO_MANY_STATIONS = () => 'Picking too many stations than there are available';

    // Toolbar

    TOOLBAR_PLAY     = 'Play phrase';
    TOOLBAR_STOP     = 'Stop playing phrase';
    TOOLBAR_SHUFFLE  = 'Generate random phrase';
    TOOLBAR_SAVE     = 'Save state to storage';
    TOOLBAR_LOAD     = 'Recall state from storage';
    TOOLBAR_SETTINGS = 'Open settings';

    // Editor

    TITLE_COACH       = (c: any) => `Click to change this coach ('${c}')`;
    TITLE_EXCUSE      = 'Click to change this excuse';
    TITLE_INTEGER     = (c: any) => `Click to change this number ('${c}')`;
    TITLE_NAMED       = 'Click to change this train\'s name';
    TITLE_OPT_OPEN    = (t: any, r: any) =>
        `Click to open this optional ${t} ('${r}')`;
    TITLE_OPT_CLOSE   = (t: any, r: any) =>
        `Click to close this optional ${t} ('${r}')`;
    TITLE_PHRASESET   = (r: any) =>
        `Click to change the phrase used in this section ('${r}')`;
    TITLE_PLATFORM    = 'Click to change this train\'s platform';
    TITLE_SERVICE     = (c: any) => `Click to change this service ('${c}')`;
    TITLE_STATION     = (c: any) => `Click to change this station ('${c}')`;
    TITLE_STATIONLIST = (c: any) => `Click to change this station list ('${c}')`;
    TITLE_TIME        = (c: any) => `Click to change this time ('${c}')`;

    EDITOR_INIT              = 'Please wait...';
    EDITOR_UNKNOWN_ELEMENT   = (n: any) => `(UNKNOWN XML ELEMENT: ${n})`;
    EDITOR_UNKNOWN_PHRASE    = (r: any) => `(UNKNOWN PHRASE: ${r})`;
    EDITOR_UNKNOWN_PHRASESET = (r: any) => `(UNKNOWN PHRASESET: ${r})`;

    // Phraser

    PHRASER_TOO_RECURSIVE = 'Too many levels of recursion whilst processing phrase.';

    // Pickers

    HEADER_COACH       = (c: any) => `Pick a coach letter for the '${c}' context`;
    HEADER_EXCUSE      = 'Pick an excuse';
    HEADER_INTEGER     = (c: any) => `Pick a number for the '${c}' context`;
    HEADER_NAMED       = 'Pick a named train';
    HEADER_PHRASESET   = (r: any) => `Pick a phrase for the '${r}' section`;
    HEADER_PLATFORM    = 'Pick a platform';
    HEADER_SERVICE     = (c: any) => `Pick a service for the '${c}' context`;
    HEADER_STATION     = (c: any) => `Pick a station for the '${c}' context`;
    HEADER_STATIONLIST = (c: any) => `Build a station list for the '${c}' context`;
    HEADER_TIME        = (c: any) => `Pick a time for the '${c}' context`;

    P_GENERIC_T      = 'List of choices';
    P_GENERIC_PH     = 'Filter choices...';
    P_COACH_T        = 'Coach letter';
    P_EXCUSE_T       = 'List of delay or cancellation excuses';
    P_EXCUSE_PH      = 'Filter excuses...';
    P_EXCUSE_ITEM_T  = 'Click to select this excuse';
    P_INT_T          = 'Integer value';
    P_NAMED_T        = 'List of train names';
    P_NAMED_PH       = 'Filter train name...';
    P_NAMED_ITEM_T   = 'Click to select this name';
    P_PSET_T         = 'List of phrases';
    P_PSET_PH        = 'Filter phrases...';
    P_PSET_ITEM_T    = 'Click to select this phrase';
    P_PLAT_NUMBER_T  = 'Platform number';
    P_PLAT_LETTER_T  = 'Optional platform letter';
    P_SERV_T         = 'List of service names';
    P_SERV_PH        = 'Filter services...';
    P_SERV_ITEM_T    = 'Click to select this service';
    P_STATION_T      = 'List of station names';
    P_STATION_PH     = 'Filter stations...';
    P_STATION_ITEM_T = 'Click to select or add this station';
    P_SL_ADD         = 'Add station...';
    P_SL_ADD_T       = 'Add station to this list';
    P_SL_CLOSE       = 'Close';
    P_SL_CLOSE_T     = 'Close this picker';
    P_SL_EMPTY       = 'Please add at least one station to this list';
    P_SL_DRAG_T      = 'Draggable selection of stations for this list';
    P_SL_DELETE      = 'Drop here to delete';
    P_SL_DELETE_T    = 'Drop station here to delete it from this list';
    P_SL_ITEM_T      = 'Drag to reorder; double-click or drag into delete zone to remove';
    P_TIME_T         = 'Time editor';

    // Settings

    ST_RESET           = 'Reset to defaults';
    ST_RESET_T         = 'Reset settings to defaults';
    ST_RESET_CONFIRM   = 'Are you sure?';
    ST_RESET_CONFIRM_T = 'Confirm reset to defaults';
    ST_RESET_DONE      = 'Settings have been reset to their defaults, and deleted from' +
        ' storage.';
    ST_SAVE            = 'Save & close';
    ST_SAVE_T          = 'Save and close settings';
    ST_SPEECH          = 'Speech';
    ST_SPEECH_CHOICE   = 'Voice';
    ST_SPEECH_EMPTY    = 'None available';
    ST_SPEECH_VOL      = 'Volume';
    ST_SPEECH_PITCH    = 'Pitch';
    ST_SPEECH_RATE     = 'Rate';
    ST_SPEECH_TEST     = 'Test speech';
    ST_SPEECH_TEST_T   = 'Play a speech sample with the current settings';
    ST_LEGAL           = 'Legal & Acknowledgements';

    WARN_SHORT_HEADER = '"May I have your attention please..."';
    WARN_SHORT        = 'This display is too short to support RAG. Please make this' +
        ' window taller, or rotate your device from landscape to portrait.';

    // TODO: These don't fit here; this should go in the data
    LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    DIGITS  = [
        'zero',     'one',     'two',     'three',     'four',     'five',    'six',
        'seven',    'eight',   'nine',    'ten',       'eleven',   'twelve',  'thirteen',
        'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'ninteen', 'twenty'
    ];
}