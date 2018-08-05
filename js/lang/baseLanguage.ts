/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Language entries are template delegates */
type LanguageEntry = (...parts: string[]) => string ;

abstract class BaseLanguage
{
    [index: string] : LanguageEntry | string | string[];

    // RAG

    /** Welcome message, shown on marquee on first load */
    readonly abstract WELCOME       : LanguageEntry;
    /** Required DOM element is missing */
    readonly abstract DOM_MISSING   : LanguageEntry;
    /** Required element attribute is missing */
    readonly abstract ATTR_MISSING  : LanguageEntry;
    /** Required dataset entry is missing */
    readonly abstract DATA_MISSING  : LanguageEntry;
    /** Bad direction argument given to directional function */
    readonly abstract BAD_DIRECTION : LanguageEntry;
    /** Bad boolean string */
    readonly abstract BAD_BOOLEAN   : LanguageEntry;

    // State

    /** State successfully loaded from storage */
    readonly abstract STATE_FROM_STORAGE          : LanguageEntry;
    /** State successfully saved to storage */
    readonly abstract STATE_TO_STORAGE            : LanguageEntry;
    /** Instructions for copy/pasting saved state */
    readonly abstract STATE_COPY_PASTE            : LanguageEntry;
    /** Header for dumped raw state JSON */
    readonly abstract STATE_RAW_JSON              : LanguageEntry;
    /** Could not save state to storage */
    readonly abstract STATE_SAVE_FAIL             : LanguageEntry;
    /** No state was available to load */
    readonly abstract STATE_SAVE_MISSING          : LanguageEntry;
    /** Non-existent phraseset reference when getting from state */
    readonly abstract STATE_NONEXISTANT_PHRASESET : LanguageEntry;

    // Config

    /** Config failed to load from storage */
    readonly abstract CONFIG_LOAD_FAIL  : LanguageEntry;
    /** Config failed to save to storage */
    readonly abstract CONFIG_SAVE_FAIL  : LanguageEntry;
    /** Config failed to clear from storage */
    readonly abstract CONFIG_RESET_FAIL : LanguageEntry;

    // Database

    /** Given element isn't a phraseset iFrame */
    readonly abstract DB_ELEMENT_NOT_PHRASESET_IFRAME : LanguageEntry;
    /** Unknown station code */
    readonly abstract DB_UNKNOWN_STATION              : LanguageEntry;
    /** Station code with blank name */
    readonly abstract DB_EMPTY_STATION                : LanguageEntry;
    /** Picking too many station codes in one go */
    readonly abstract DB_TOO_MANY_STATIONS            : LanguageEntry;

    // Toolbar

    // Tooltips/title text for toolbar buttons
    readonly abstract TOOLBAR_PLAY     : LanguageEntry;
    readonly abstract TOOLBAR_STOP     : LanguageEntry;
    readonly abstract TOOLBAR_SHUFFLE  : LanguageEntry;
    readonly abstract TOOLBAR_SAVE     : LanguageEntry;
    readonly abstract TOOLBAR_LOAD     : LanguageEntry;
    readonly abstract TOOLBAR_SETTINGS : LanguageEntry;

    // Editor

    // Tooltips/title text for editor elements
    readonly abstract TITLE_COACH       : LanguageEntry;
    readonly abstract TITLE_EXCUSE      : LanguageEntry;
    readonly abstract TITLE_INTEGER     : LanguageEntry;
    readonly abstract TITLE_NAMED       : LanguageEntry;
    readonly abstract TITLE_OPT_OPEN    : LanguageEntry;
    readonly abstract TITLE_OPT_CLOSE   : LanguageEntry;
    readonly abstract TITLE_PHRASESET   : LanguageEntry;
    readonly abstract TITLE_PLATFORM    : LanguageEntry;
    readonly abstract TITLE_SERVICE     : LanguageEntry;
    readonly abstract TITLE_STATION     : LanguageEntry;
    readonly abstract TITLE_STATIONLIST : LanguageEntry;
    readonly abstract TITLE_TIME        : LanguageEntry;

    /** Initial message when setting up editor */
    readonly abstract EDITOR_INIT              : LanguageEntry;
    /** Replacement text for unknown editor elements */
    readonly abstract EDITOR_UNKNOWN_ELEMENT   : LanguageEntry;
    /** Replacement text for editor phrases with unknown reference ids */
    readonly abstract EDITOR_UNKNOWN_PHRASE    : LanguageEntry;
    /** Replacement text for editor phrasesets with unknown reference ids */
    readonly abstract EDITOR_UNKNOWN_PHRASESET : LanguageEntry;

    // Phraser

    /** Too many levels of recursion in the phraser */
    readonly abstract PHRASER_TOO_RECURSIVE : LanguageEntry;

    // Pickers

    // Headers for picker dialogs
    readonly abstract HEADER_COACH       : LanguageEntry;
    readonly abstract HEADER_EXCUSE      : LanguageEntry;
    readonly abstract HEADER_INTEGER     : LanguageEntry;
    readonly abstract HEADER_NAMED       : LanguageEntry;
    readonly abstract HEADER_PHRASESET   : LanguageEntry;
    readonly abstract HEADER_PLATFORM    : LanguageEntry;
    readonly abstract HEADER_SERVICE     : LanguageEntry;
    readonly abstract HEADER_STATION     : LanguageEntry;
    readonly abstract HEADER_STATIONLIST : LanguageEntry;
    readonly abstract HEADER_TIME        : LanguageEntry;

    // Tooltips/title and placeholder text for picker controls
    readonly abstract P_GENERIC_T      : LanguageEntry;
    readonly abstract P_GENERIC_PH     : LanguageEntry;
    readonly abstract P_COACH_T        : LanguageEntry;
    readonly abstract P_EXCUSE_T       : LanguageEntry;
    readonly abstract P_EXCUSE_PH      : LanguageEntry;
    readonly abstract P_EXCUSE_ITEM_T  : LanguageEntry;
    readonly abstract P_INT_T          : LanguageEntry;
    readonly abstract P_NAMED_T        : LanguageEntry;
    readonly abstract P_NAMED_PH       : LanguageEntry;
    readonly abstract P_NAMED_ITEM_T   : LanguageEntry;
    readonly abstract P_PSET_T         : LanguageEntry;
    readonly abstract P_PSET_PH        : LanguageEntry;
    readonly abstract P_PSET_ITEM_T    : LanguageEntry;
    readonly abstract P_PLAT_NUMBER_T  : LanguageEntry;
    readonly abstract P_PLAT_LETTER_T  : LanguageEntry;
    readonly abstract P_SERV_T         : LanguageEntry;
    readonly abstract P_SERV_PH        : LanguageEntry;
    readonly abstract P_SERV_ITEM_T    : LanguageEntry;
    readonly abstract P_STATION_T      : LanguageEntry;
    readonly abstract P_STATION_PH     : LanguageEntry;
    readonly abstract P_STATION_ITEM_T : LanguageEntry;
    readonly abstract P_SL_ADD         : LanguageEntry;
    readonly abstract P_SL_ADD_T       : LanguageEntry;
    readonly abstract P_SL_CLOSE       : LanguageEntry;
    readonly abstract P_SL_CLOSE_T     : LanguageEntry;
    readonly abstract P_SL_EMPTY       : LanguageEntry;
    readonly abstract P_SL_DRAG_T      : LanguageEntry;
    readonly abstract P_SL_DELETE      : LanguageEntry;
    readonly abstract P_SL_DELETE_T    : LanguageEntry;
    readonly abstract P_SL_ITEM_T      : LanguageEntry;
    readonly abstract P_TIME_T         : LanguageEntry;

    /** Coach picker's onChange fired without context */
    readonly abstract P_COACH_MISSING_STATE   : LanguageEntry;
    /** Integer picker's onChange fired without context */
    readonly abstract P_INT_MISSING_STATE     : LanguageEntry;
    /** Phraseset picker's onSelect fired without reference */
    readonly abstract P_PSET_MISSING_STATE    : LanguageEntry;
    /** Service picker's onSelect fired without reference */
    readonly abstract P_SERVICE_MISSING_STATE : LanguageEntry;
    /** Service picker's onChange fired without reference */
    readonly abstract P_TIME_MISSING_STATE    : LanguageEntry;
    /** Phraseset picker opened for unknown phraseset */
    readonly abstract P_PSET_UNKNOWN          : LanguageEntry;
    /** Drag mirror create event in station list missing state */
    readonly abstract P_SL_DRAG_MISSING       : LanguageEntry;

    // Settings

    // Tooltips/title and label text for settings elements
    readonly abstract ST_RESET           : LanguageEntry;
    readonly abstract ST_RESET_T         : LanguageEntry;
    readonly abstract ST_RESET_CONFIRM   : LanguageEntry;
    readonly abstract ST_RESET_CONFIRM_T : LanguageEntry;
    readonly abstract ST_RESET_DONE      : LanguageEntry;
    readonly abstract ST_SAVE            : LanguageEntry;
    readonly abstract ST_SAVE_T          : LanguageEntry;
    readonly abstract ST_VOX             : LanguageEntry;
    readonly abstract ST_VOX_CHOICE      : LanguageEntry;
    readonly abstract ST_VOX_EMPTY       : LanguageEntry;
    readonly abstract ST_VOX_VOL         : LanguageEntry;
    readonly abstract ST_VOX_PITCH       : LanguageEntry;
    readonly abstract ST_VOX_RATE        : LanguageEntry;
    readonly abstract ST_VOX_TEST        : LanguageEntry;
    readonly abstract ST_VOX_TEST_T      : LanguageEntry;
    readonly abstract ST_LEGAL           : LanguageEntry;

    // UI controls

    /** Header for the "too small" warning */
    readonly abstract WARN_SHORT_HEADER : LanguageEntry;
    /** Body text for the "too small" warning */
    readonly abstract WARN_SHORT        : LanguageEntry;

    // Misc. constants

    /** Array of the entire alphabet of the language, for coach letters */
    readonly abstract LETTERS : string;
    /** Array of numbers as words (e.g. zero, one, two), matching their index */
    readonly abstract DIGITS  : string[];
}