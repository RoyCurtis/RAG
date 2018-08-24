/// <reference path="vendor/draggable.d.ts" />
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Global reference to the language container, set at init */
declare let L: EnglishLanguage | BaseLanguage;
declare class I18n {
    /** Constant regex to match for translation keys */
    private static readonly TAG_REGEX;
    /** Languages currently available */
    private static languages;
    /** Reference to language currently in use */
    private static currentLang;
    /** Picks a language, and transforms all translation keys in the document */
    static init(): void;
    /**
     * Walks through all text nodes in the DOM, replacing any translation keys.
     *
     * @see https://stackoverflow.com/a/10730777/3354920
     */
    private static applyToDom;
    /** Filters the tree walker to exclude script and style tags */
    private static nodeFilter;
    /** Expands any translation keys in the given attribute */
    private static expandAttribute;
    /** Expands any translation keys in the given text node */
    private static expandTextNode;
    /** Replaces key with value if it exists, else keeps the key */
    private static replace;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Delegate type for chooser select event handlers */
declare type SelectDelegate = (entry: HTMLElement) => void;
/** UI element with a filterable and keyboard navigable list of choices */
declare class Chooser {
    /** Reference to the DOM template to clone, for each chooser created */
    private static TEMPLATE;
    /** Creates and detaches the template on first create */
    private static init;
    /** Reference to this chooser's container */
    protected readonly dom: HTMLElement;
    /** Reference to this chooser's filter input box */
    protected readonly inputFilter: HTMLInputElement;
    /** Reference to this chooser's container of item elements */
    protected readonly inputChoices: HTMLElement;
    /** Optional event handler to fire when an item is selected by the user */
    onSelect?: SelectDelegate;
    /** Whether to visually select the clicked element */
    selectOnClick: boolean;
    /** Reference to the currently selected item, if any */
    protected domSelected?: HTMLElement;
    /** Reference to the auto-filter timeout, if any */
    protected filterTimeout: number;
    /** Whether to group added elements by alphabetical sections */
    protected groupByABC: boolean;
    /** Title attribute to apply to every item added */
    protected itemTitle: string;
    /** Creates a chooser, by replacing the placeholder in a given parent */
    constructor(parent: HTMLElement);
    /**
     * Adds the given value to the chooser as a selectable item.
     *
     * @param value Text of the selectable item
     * @param select Whether to select this item once added
     */
    add(value: string, select?: boolean): void;
    /**
     * Adds the given element to the chooser as a selectable item.
     *
     * @param item Element to add to the chooser
     * @param select Whether to select this item once added
     */
    addRaw(item: HTMLElement, select?: boolean): void;
    /** Clears all items from this chooser and the current filter */
    clear(): void;
    /** Select and focus the entry that matches the given value */
    preselect(value: string): void;
    /** Handles pickers' click events, for choosing items */
    onClick(ev: MouseEvent): void;
    /** Handles pickers' close methods, doing any timer cleanup */
    onClose(): void;
    /** Handles pickers' input events, for filtering and navigation */
    onInput(ev: KeyboardEvent): void;
    /** Handles pickers' submit events, for instant filtering */
    onSubmit(ev: Event): void;
    /** Hide or show choices if they partially match the user query */
    protected filter(): void;
    /** Applies filter to an item, showing it if matched, hiding if not */
    protected static filterItem(item: HTMLElement, filter: string): number;
    /** Applies filter to children of a group, hiding the group if all children hide */
    protected static filterGroup(group: HTMLElement, filter: string): void;
    /** Visually changes the current selection, and updates the state and editor */
    protected select(entry: HTMLElement): void;
    /** Visually changes the currently selected element */
    protected visualSelect(entry: HTMLElement): void;
    /** Visually unselects the currently selected element, if any */
    protected visualUnselect(): void;
    /**
     * Whether this chooser is an ancestor (owner) of the given element.
     *
     * @param target Element to check if this chooser is an ancestor of
     */
    protected owns(target: HTMLElement): boolean;
    /** Whether the given element is a choosable one owned by this chooser */
    protected isChoice(target?: HTMLElement): boolean;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/**
 * Singleton instance of the station picker. Since there are expected to be 2500+
 * stations, this element would take up a lot of memory and generate a lot of DOM. So, it
 * has to be "swapped" between pickers and views that want to use it.
 */
declare class StationChooser extends Chooser {
    /** Shortcut references to all the generated A-Z station list elements */
    private readonly domStations;
    constructor(parent: HTMLElement);
    /**
     * Attaches this control to the given parent and resets some state.
     *
     * @param picker Picker to attach this control to
     * @param onSelect Delegate to fire when choosing a station
     */
    attach(picker: Picker, onSelect: SelectDelegate): void;
    /** Pre-selects a station entry by its code */
    preselectCode(code: string): void;
    /** Enables the given station code or station element for selection */
    enable(codeOrNode: string | HTMLElement): void;
    /** Disables the given station code from selection */
    disable(code: string): void;
    /** Gets a station's choice element by its code */
    private getByCode;
    /** Populates the chooser with the given station code */
    private addStation;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Station list item that can be dragged and dropped */
declare class StationListItem {
    /** Reference to the DOM template to clone, for each item created */
    private static TEMPLATE;
    /** Creates and detaches the template on first create */
    private static init;
    /** Reference to this item's element */
    readonly dom: HTMLElement;
    /**
     * Creates a station list item, meant for the station list builder.
     *
     * @param code Three-letter station code to create this item for
     */
    constructor(code: string);
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Base class for picker views */
declare abstract class Picker {
    /** Reference to this picker's DOM element */
    readonly dom: HTMLElement;
    /** Reference to this picker's form DOM element */
    readonly domForm: HTMLFormElement;
    /** Reference to this picker's header element */
    readonly domHeader: HTMLElement;
    /** Gets the name of the XML tag this picker handles */
    readonly xmlTag: string;
    /** Reference to the phrase element being edited by this picker */
    protected domEditing?: HTMLElement;
    /**
     * Creates a picker to handle the given phrase element type.
     *
     * @param {string} xmlTag Name of the XML tag this picker will handle.
     */
    protected constructor(xmlTag: string);
    /**
     * Called when form fields change. The implementing picker should update all linked
     * elements (e.g. of same type) with the new data here.
     */
    protected abstract onChange(ev: Event): void;
    /** Called when a mouse click happens anywhere in or on the picker's form */
    protected abstract onClick(ev: MouseEvent): void;
    /** Called when a key is pressed whilst the picker's form is focused */
    protected abstract onInput(ev: KeyboardEvent): void;
    /**
     * Called when ENTER is pressed whilst a form control of the picker is focused.
     * By default, this will trigger the onChange handler and close the dialog.
     */
    protected onSubmit(ev: Event): void;
    /**
     * Open this picker for a given phrase element. The implementing picker should fill
     * its form elements with data from the current state and targeted element here.
     *
     * @param {HTMLElement} target Phrase element that this picker is being opened for
     */
    open(target: HTMLElement): void;
    /** Closes this picker */
    close(): void;
    /** Positions this picker relative to the target phrase element */
    layout(): void;
    /** Returns true if an element in this picker currently has focus */
    hasFocus(): boolean;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the coach picker dialog */
declare class CoachPicker extends Picker {
    /** Reference to this picker's letter drop-down input control */
    private readonly inputLetter;
    /** Holds the context for the current coach element being edited */
    private currentCtx;
    constructor();
    /** Populates the form with the target context's coach letter */
    open(target: HTMLElement): void;
    /** Updates the coach element and state currently being edited */
    protected onChange(_: Event): void;
    protected onClick(_: MouseEvent): void;
    protected onInput(_: KeyboardEvent): void;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the excuse picker dialog */
declare class ExcusePicker extends Picker {
    /** Reference to this picker's chooser control */
    private readonly domChooser;
    constructor();
    /** Populates the chooser with the current state's excuse */
    open(target: HTMLElement): void;
    /** Close this picker */
    close(): void;
    protected onChange(_: Event): void;
    protected onClick(ev: MouseEvent): void;
    protected onInput(ev: KeyboardEvent): void;
    protected onSubmit(ev: Event): void;
    /** Handles chooser selection by updating the excuse element and state */
    private onSelect;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the integer picker dialog */
declare class IntegerPicker extends Picker {
    /** Reference to this picker's numerical input spinner */
    private readonly inputDigit;
    /** Reference to this picker's optional suffix label */
    private readonly domLabel;
    /** Holds the context for the current integer element being edited */
    private currentCtx?;
    /** Holds the optional singular suffix for the current integer being edited */
    private singular?;
    /** Holds the optional plural suffix for the current integer being edited */
    private plural?;
    /** Whether the current integer being edited wants word digits */
    private words?;
    constructor();
    /** Populates the form with the target context's integer data */
    open(target: HTMLElement): void;
    /** Updates the integer element and state currently being edited */
    protected onChange(_: Event): void;
    protected onClick(_: MouseEvent): void;
    protected onInput(_: KeyboardEvent): void;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the named train picker dialog */
declare class NamedPicker extends Picker {
    /** Reference to this picker's chooser control */
    private readonly domChooser;
    constructor();
    /** Populates the chooser with the current state's named train */
    open(target: HTMLElement): void;
    /** Close this picker */
    close(): void;
    protected onChange(_: Event): void;
    protected onClick(ev: MouseEvent): void;
    protected onInput(ev: KeyboardEvent): void;
    protected onSubmit(ev: Event): void;
    /** Handles chooser selection by updating the named element and state */
    private onSelect;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the phraseset picker dialog */
declare class PhrasesetPicker extends Picker {
    /** Reference to this picker's chooser control */
    private readonly domChooser;
    /** Holds the reference tag for the current phraseset element being edited */
    private currentRef?;
    constructor();
    /** Populates the chooser with the current phraseset's list of phrases */
    open(target: HTMLElement): void;
    /** Close this picker */
    close(): void;
    protected onChange(_: Event): void;
    protected onClick(ev: MouseEvent): void;
    protected onInput(ev: KeyboardEvent): void;
    protected onSubmit(ev: Event): void;
    /** Handles chooser selection by updating the phraseset element and state */
    private onSelect;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the platform picker dialog */
declare class PlatformPicker extends Picker {
    /** Reference to this picker's numerical input spinner */
    private readonly inputDigit;
    /** Reference to this picker's letter drop-down input control */
    private readonly inputLetter;
    constructor();
    /** Populates the form with the current state's platform data */
    open(target: HTMLElement): void;
    /** Updates the platform element and state currently being edited */
    protected onChange(_: Event): void;
    protected onClick(_: MouseEvent): void;
    protected onInput(_: KeyboardEvent): void;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the service picker dialog */
declare class ServicePicker extends Picker {
    /** Reference to this picker's chooser control */
    private readonly domChooser;
    /** Holds the context for the current service element being edited */
    private currentCtx;
    constructor();
    /** Populates the chooser with the current state's service */
    open(target: HTMLElement): void;
    /** Close this picker */
    close(): void;
    protected onChange(_: Event): void;
    protected onClick(ev: MouseEvent): void;
    protected onInput(ev: KeyboardEvent): void;
    protected onSubmit(ev: Event): void;
    /** Handles chooser selection by updating the service element and state */
    private onSelect;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the station picker dialog */
declare class StationPicker extends Picker {
    /** Reference to this picker's shared station chooser control */
    protected static chooser: StationChooser;
    /** Holds the context for the current station element being edited */
    protected currentCtx: string;
    /** Holds the onOpen delegate for StationPicker or for StationListPicker */
    protected onOpen: (target: HTMLElement) => void;
    constructor(tag?: string);
    /** Fires the onOpen delegate registered for this picker */
    open(target: HTMLElement): void;
    /** Attaches the station chooser and focuses it onto the current element's station */
    protected onStationPickerOpen(target: HTMLElement): void;
    protected onChange(_: Event): void;
    protected onClick(ev: MouseEvent): void;
    protected onInput(ev: KeyboardEvent): void;
    protected onSubmit(ev: Event): void;
    /** Handles chooser selection by updating the station element and state */
    private onSelectStation;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the station list picker dialog */
declare class StationListPicker extends StationPicker {
    /** Reference to this picker's container for the list control */
    private readonly domList;
    /** Reference to the mobile-only add station button */
    private readonly btnAdd;
    /** Reference to the mobile-only close picker button */
    private readonly btnClose;
    /** Reference to the drop zone for deleting station elements */
    private readonly domDel;
    /** Reference to the actual sortable list of stations */
    private readonly inputList;
    /** Reference to placeholder shown if the list is empty */
    private readonly domEmptyList;
    constructor();
    /**
     * Populates the station list builder, with the selected list. Because this picker
     * extends from StationList, this handler overrides the 'onOpen' delegate property
     * of StationList.
     *
     * @param target Station list editor element to open for
     */
    protected onStationListPickerOpen(target: HTMLElement): void;
    protected onSubmit(ev: Event): void;
    /** Handles pickers' click events, for choosing items */
    protected onClick(ev: MouseEvent): void;
    /** Handles keyboard navigation for the station list builder */
    protected onInput(ev: KeyboardEvent): void;
    /** Handler for when a station is chosen */
    private onAddStation;
    /** Fixes mirrors not having correct width of the source element, on create */
    private onDragMirrorCreate;
    /** Handles draggable station name being dropped */
    private onDragStop;
    /**
     * Creates and adds a new entry for the builder list.
     *
     * @param code Three-letter station code to create an item for
     */
    private add;
    /**
     * Removes the given station entry element from the builder.
     *
     * @param entry Element of the station entry to remove
     */
    private remove;
    /** Updates the station list element and state currently being edited */
    private update;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the time picker dialog */
declare class TimePicker extends Picker {
    /** Reference to this picker's time input control */
    private readonly inputTime;
    /** Holds the context for the current time element being edited */
    private currentCtx;
    constructor();
    /** Populates the form with the current state's time */
    open(target: HTMLElement): void;
    /** Updates the time element and state currently being edited */
    protected onChange(_: Event): void;
    protected onClick(_: MouseEvent): void;
    protected onInput(_: KeyboardEvent): void;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Language entries are template delegates */
declare type LanguageEntry = (...parts: string[]) => string;
declare abstract class BaseLanguage {
    [index: string]: LanguageEntry | string | string[];
    /** Welcome message, shown on marquee on first load */
    readonly abstract WELCOME: LanguageEntry;
    /** Required DOM element is missing */
    readonly abstract DOM_MISSING: LanguageEntry;
    /** Required element attribute is missing */
    readonly abstract ATTR_MISSING: LanguageEntry;
    /** Required dataset entry is missing */
    readonly abstract DATA_MISSING: LanguageEntry;
    /** Bad direction argument given to directional function */
    readonly abstract BAD_DIRECTION: LanguageEntry;
    /** Bad boolean string */
    readonly abstract BAD_BOOLEAN: LanguageEntry;
    /** State successfully loaded from storage */
    readonly abstract STATE_FROM_STORAGE: LanguageEntry;
    /** State successfully saved to storage */
    readonly abstract STATE_TO_STORAGE: LanguageEntry;
    /** Instructions for copy/pasting saved state */
    readonly abstract STATE_COPY_PASTE: LanguageEntry;
    /** Header for dumped raw state JSON */
    readonly abstract STATE_RAW_JSON: LanguageEntry;
    /** Could not save state to storage */
    readonly abstract STATE_SAVE_FAIL: LanguageEntry;
    /** No state was available to load */
    readonly abstract STATE_SAVE_MISSING: LanguageEntry;
    /** Non-existent phraseset reference when getting from state */
    readonly abstract STATE_NONEXISTANT_PHRASESET: LanguageEntry;
    /** Config failed to load from storage */
    readonly abstract CONFIG_LOAD_FAIL: LanguageEntry;
    /** Config failed to save to storage */
    readonly abstract CONFIG_SAVE_FAIL: LanguageEntry;
    /** Config failed to clear from storage */
    readonly abstract CONFIG_RESET_FAIL: LanguageEntry;
    /** Given element isn't a phraseset iFrame */
    readonly abstract DB_ELEMENT_NOT_PHRASESET_IFRAME: LanguageEntry;
    /** Unknown station code */
    readonly abstract DB_UNKNOWN_STATION: LanguageEntry;
    /** Station code with blank name */
    readonly abstract DB_EMPTY_STATION: LanguageEntry;
    /** Picking too many station codes in one go */
    readonly abstract DB_TOO_MANY_STATIONS: LanguageEntry;
    readonly abstract TOOLBAR_PLAY: LanguageEntry;
    readonly abstract TOOLBAR_STOP: LanguageEntry;
    readonly abstract TOOLBAR_SHUFFLE: LanguageEntry;
    readonly abstract TOOLBAR_SAVE: LanguageEntry;
    readonly abstract TOOLBAR_LOAD: LanguageEntry;
    readonly abstract TOOLBAR_SETTINGS: LanguageEntry;
    readonly abstract TITLE_COACH: LanguageEntry;
    readonly abstract TITLE_EXCUSE: LanguageEntry;
    readonly abstract TITLE_INTEGER: LanguageEntry;
    readonly abstract TITLE_NAMED: LanguageEntry;
    readonly abstract TITLE_OPT_OPEN: LanguageEntry;
    readonly abstract TITLE_OPT_CLOSE: LanguageEntry;
    readonly abstract TITLE_PHRASESET: LanguageEntry;
    readonly abstract TITLE_PLATFORM: LanguageEntry;
    readonly abstract TITLE_SERVICE: LanguageEntry;
    readonly abstract TITLE_STATION: LanguageEntry;
    readonly abstract TITLE_STATIONLIST: LanguageEntry;
    readonly abstract TITLE_TIME: LanguageEntry;
    /** Initial message when setting up editor */
    readonly abstract EDITOR_INIT: LanguageEntry;
    /** Replacement text for unknown editor elements */
    readonly abstract EDITOR_UNKNOWN_ELEMENT: LanguageEntry;
    /** Replacement text for editor phrases with unknown reference ids */
    readonly abstract EDITOR_UNKNOWN_PHRASE: LanguageEntry;
    /** Replacement text for editor phrasesets with unknown reference ids */
    readonly abstract EDITOR_UNKNOWN_PHRASESET: LanguageEntry;
    /** Too many levels of recursion in the phraser */
    readonly abstract PHRASER_TOO_RECURSIVE: LanguageEntry;
    readonly abstract HEADER_COACH: LanguageEntry;
    readonly abstract HEADER_EXCUSE: LanguageEntry;
    readonly abstract HEADER_INTEGER: LanguageEntry;
    readonly abstract HEADER_NAMED: LanguageEntry;
    readonly abstract HEADER_PHRASESET: LanguageEntry;
    readonly abstract HEADER_PLATFORM: LanguageEntry;
    readonly abstract HEADER_SERVICE: LanguageEntry;
    readonly abstract HEADER_STATION: LanguageEntry;
    readonly abstract HEADER_STATIONLIST: LanguageEntry;
    readonly abstract HEADER_TIME: LanguageEntry;
    readonly abstract P_GENERIC_T: LanguageEntry;
    readonly abstract P_GENERIC_PH: LanguageEntry;
    readonly abstract P_COACH_T: LanguageEntry;
    readonly abstract P_EXCUSE_T: LanguageEntry;
    readonly abstract P_EXCUSE_PH: LanguageEntry;
    readonly abstract P_EXCUSE_ITEM_T: LanguageEntry;
    readonly abstract P_INT_T: LanguageEntry;
    readonly abstract P_NAMED_T: LanguageEntry;
    readonly abstract P_NAMED_PH: LanguageEntry;
    readonly abstract P_NAMED_ITEM_T: LanguageEntry;
    readonly abstract P_PSET_T: LanguageEntry;
    readonly abstract P_PSET_PH: LanguageEntry;
    readonly abstract P_PSET_ITEM_T: LanguageEntry;
    readonly abstract P_PLAT_NUMBER_T: LanguageEntry;
    readonly abstract P_PLAT_LETTER_T: LanguageEntry;
    readonly abstract P_SERV_T: LanguageEntry;
    readonly abstract P_SERV_PH: LanguageEntry;
    readonly abstract P_SERV_ITEM_T: LanguageEntry;
    readonly abstract P_STATION_T: LanguageEntry;
    readonly abstract P_STATION_PH: LanguageEntry;
    readonly abstract P_STATION_ITEM_T: LanguageEntry;
    readonly abstract P_SL_ADD: LanguageEntry;
    readonly abstract P_SL_ADD_T: LanguageEntry;
    readonly abstract P_SL_CLOSE: LanguageEntry;
    readonly abstract P_SL_CLOSE_T: LanguageEntry;
    readonly abstract P_SL_EMPTY: LanguageEntry;
    readonly abstract P_SL_DRAG_T: LanguageEntry;
    readonly abstract P_SL_DELETE: LanguageEntry;
    readonly abstract P_SL_DELETE_T: LanguageEntry;
    readonly abstract P_SL_ITEM_T: LanguageEntry;
    readonly abstract P_TIME_T: LanguageEntry;
    /** Coach picker's onChange fired without context */
    readonly abstract P_COACH_MISSING_STATE: LanguageEntry;
    /** Integer picker's onChange fired without context */
    readonly abstract P_INT_MISSING_STATE: LanguageEntry;
    /** Phraseset picker's onSelect fired without reference */
    readonly abstract P_PSET_MISSING_STATE: LanguageEntry;
    /** Service picker's onSelect fired without reference */
    readonly abstract P_SERVICE_MISSING_STATE: LanguageEntry;
    /** Service picker's onChange fired without reference */
    readonly abstract P_TIME_MISSING_STATE: LanguageEntry;
    /** Phraseset picker opened for unknown phraseset */
    readonly abstract P_PSET_UNKNOWN: LanguageEntry;
    /** Drag mirror create event in station list missing state */
    readonly abstract P_SL_DRAG_MISSING: LanguageEntry;
    readonly abstract ST_RESET: LanguageEntry;
    readonly abstract ST_RESET_T: LanguageEntry;
    readonly abstract ST_RESET_CONFIRM: LanguageEntry;
    readonly abstract ST_RESET_CONFIRM_T: LanguageEntry;
    readonly abstract ST_RESET_DONE: LanguageEntry;
    readonly abstract ST_SAVE: LanguageEntry;
    readonly abstract ST_SAVE_T: LanguageEntry;
    readonly abstract ST_SPEECH: LanguageEntry;
    readonly abstract ST_SPEECH_CHOICE: LanguageEntry;
    readonly abstract ST_SPEECH_EMPTY: LanguageEntry;
    readonly abstract ST_SPEECH_VOL: LanguageEntry;
    readonly abstract ST_SPEECH_PITCH: LanguageEntry;
    readonly abstract ST_SPEECH_RATE: LanguageEntry;
    readonly abstract ST_SPEECH_TEST: LanguageEntry;
    readonly abstract ST_SPEECH_TEST_T: LanguageEntry;
    readonly abstract ST_LEGAL: LanguageEntry;
    /** Header for the "too small" warning */
    readonly abstract WARN_SHORT_HEADER: LanguageEntry;
    /** Body text for the "too small" warning */
    readonly abstract WARN_SHORT: LanguageEntry;
    /** Array of the entire alphabet of the language, for coach letters */
    readonly abstract LETTERS: string;
    /** Array of numbers as words (e.g. zero, one, two), matching their index */
    readonly abstract DIGITS: string[];
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
declare class EnglishLanguage extends BaseLanguage {
    WELCOME: () => string;
    DOM_MISSING: (q: string) => string;
    ATTR_MISSING: (a: string) => string;
    DATA_MISSING: (k: string) => string;
    BAD_DIRECTION: (v: string) => string;
    BAD_BOOLEAN: (v: string) => string;
    STATE_FROM_STORAGE: () => string;
    STATE_TO_STORAGE: () => string;
    STATE_COPY_PASTE: () => string;
    STATE_RAW_JSON: () => string;
    STATE_SAVE_FAIL: (msg: string) => string;
    STATE_SAVE_MISSING: () => string;
    STATE_NONEXISTANT_PHRASESET: (r: string) => string;
    CONFIG_LOAD_FAIL: (msg: string) => string;
    CONFIG_SAVE_FAIL: (msg: string) => string;
    CONFIG_RESET_FAIL: (msg: string) => string;
    DB_ELEMENT_NOT_PHRASESET_IFRAME: (e: string) => string;
    DB_UNKNOWN_STATION: (c: string) => string;
    DB_EMPTY_STATION: (c: string) => string;
    DB_TOO_MANY_STATIONS: () => string;
    TOOLBAR_PLAY: () => string;
    TOOLBAR_STOP: () => string;
    TOOLBAR_SHUFFLE: () => string;
    TOOLBAR_SAVE: () => string;
    TOOLBAR_LOAD: () => string;
    TOOLBAR_SETTINGS: () => string;
    TITLE_COACH: (c: string) => string;
    TITLE_EXCUSE: () => string;
    TITLE_INTEGER: (c: string) => string;
    TITLE_NAMED: () => string;
    TITLE_OPT_OPEN: (t: string, r: string) => string;
    TITLE_OPT_CLOSE: (t: string, r: string) => string;
    TITLE_PHRASESET: (r: string) => string;
    TITLE_PLATFORM: () => string;
    TITLE_SERVICE: (c: string) => string;
    TITLE_STATION: (c: string) => string;
    TITLE_STATIONLIST: (c: string) => string;
    TITLE_TIME: (c: string) => string;
    EDITOR_INIT: () => string;
    EDITOR_UNKNOWN_ELEMENT: (n: string) => string;
    EDITOR_UNKNOWN_PHRASE: (r: string) => string;
    EDITOR_UNKNOWN_PHRASESET: (r: string) => string;
    PHRASER_TOO_RECURSIVE: () => string;
    HEADER_COACH: (c: string) => string;
    HEADER_EXCUSE: () => string;
    HEADER_INTEGER: (c: string) => string;
    HEADER_NAMED: () => string;
    HEADER_PHRASESET: (r: string) => string;
    HEADER_PLATFORM: () => string;
    HEADER_SERVICE: (c: string) => string;
    HEADER_STATION: (c: string) => string;
    HEADER_STATIONLIST: (c: string) => string;
    HEADER_TIME: (c: string) => string;
    P_GENERIC_T: () => string;
    P_GENERIC_PH: () => string;
    P_COACH_T: () => string;
    P_EXCUSE_T: () => string;
    P_EXCUSE_PH: () => string;
    P_EXCUSE_ITEM_T: () => string;
    P_INT_T: () => string;
    P_NAMED_T: () => string;
    P_NAMED_PH: () => string;
    P_NAMED_ITEM_T: () => string;
    P_PSET_T: () => string;
    P_PSET_PH: () => string;
    P_PSET_ITEM_T: () => string;
    P_PLAT_NUMBER_T: () => string;
    P_PLAT_LETTER_T: () => string;
    P_SERV_T: () => string;
    P_SERV_PH: () => string;
    P_SERV_ITEM_T: () => string;
    P_STATION_T: () => string;
    P_STATION_PH: () => string;
    P_STATION_ITEM_T: () => string;
    P_SL_ADD: () => string;
    P_SL_ADD_T: () => string;
    P_SL_CLOSE: () => string;
    P_SL_CLOSE_T: () => string;
    P_SL_EMPTY: () => string;
    P_SL_DRAG_T: () => string;
    P_SL_DELETE: () => string;
    P_SL_DELETE_T: () => string;
    P_SL_ITEM_T: () => string;
    P_TIME_T: () => string;
    P_COACH_MISSING_STATE: () => string;
    P_INT_MISSING_STATE: () => string;
    P_PSET_MISSING_STATE: () => string;
    P_SERVICE_MISSING_STATE: () => string;
    P_TIME_MISSING_STATE: () => string;
    P_PSET_UNKNOWN: (r: string) => string;
    P_SL_DRAG_MISSING: () => string;
    ST_RESET: () => string;
    ST_RESET_T: () => string;
    ST_RESET_CONFIRM: () => string;
    ST_RESET_CONFIRM_T: () => string;
    ST_RESET_DONE: () => string;
    ST_SAVE: () => string;
    ST_SAVE_T: () => string;
    ST_SPEECH: () => string;
    ST_SPEECH_CHOICE: () => string;
    ST_SPEECH_EMPTY: () => string;
    ST_SPEECH_VOL: () => string;
    ST_SPEECH_PITCH: () => string;
    ST_SPEECH_RATE: () => string;
    ST_SPEECH_TEST: () => string;
    ST_SPEECH_TEST_T: () => string;
    ST_LEGAL: () => string;
    WARN_SHORT_HEADER: () => string;
    WARN_SHORT: () => string;
    LETTERS: string;
    DIGITS: string[];
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/**
 * Holds methods for processing each type of phrase element into HTML, with data taken
 * from the current state. Each method takes a context object, holding data for the
 * current XML element being processed and the XML document being used.
 */
declare class ElementProcessors {
    /** Fills in coach letters from A to Z */
    static coach(ctx: PhraseContext): void;
    /** Fills in the excuse, for a delay or cancellation */
    static excuse(ctx: PhraseContext): void;
    /** Fills in integers, optionally with nouns and in word form */
    static integer(ctx: PhraseContext): void;
    /** Fills in the named train */
    static named(ctx: PhraseContext): void;
    /** Includes a previously defined phrase, by its `id` */
    static phrase(ctx: PhraseContext): void;
    /** Includes a phrase from a previously defined phraseset, by its `id` */
    static phraseset(ctx: PhraseContext): void;
    /** Fills in the current platform */
    static platform(ctx: PhraseContext): void;
    /** Fills in the rail network name */
    static service(ctx: PhraseContext): void;
    /** Fills in station names */
    static station(ctx: PhraseContext): void;
    /** Fills in station lists */
    static stationlist(ctx: PhraseContext): void;
    /** Fills in the time */
    static time(ctx: PhraseContext): void;
    /** Fills in vox parts */
    static vox(ctx: PhraseContext): void;
    /** Handles unknown elements with an inline error message */
    static unknown(ctx: PhraseContext): void;
    /**
     * Clones the children of the given element into a new inner span tag, so that they
     * can be made collapsible. Appends it to the new element being processed.
     */
    private static makeCollapsible;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Represents context data for a phrase, to be passed to an element processor */
interface PhraseContext {
    /** Gets the XML phrase element that is being replaced */
    xmlElement: HTMLElement;
    /** Gets the HTML span element that is replacing the XML element */
    newElement: HTMLSpanElement;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/**
 * Handles the transformation of phrase XML data, into HTML elements with their data
 * filled in and their UI logic wired.
 */
declare class Phraser {
    /**
     * Recursively processes XML elements, filling in data and applying transforms.
     *
     * @param container Parent to process the children of
     * @param level Current level of recursion, max. 20
     */
    process(container: HTMLElement, level?: number): void;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility class for resolving a given phrase to vox keys */
declare class Resolver {
    /** TreeWalker filter to reduce a walk to just the elements the resolver needs */
    private static nodeFilter;
    private phrase;
    private flattened;
    private resolved;
    constructor(phrase: HTMLElement);
    toVox(): VoxKey[];
    /**
     * Uses the type and value of the given node, to resolve it to vox file IDs.
     *
     * @param node Node to resolve to vox IDs
     * @param idx Index of the node being resolved relative to the phrase array
     * @returns Array of IDs that make up one or more file IDs. Can be empty.
     */
    private resolve;
    private getInflection;
    private resolveText;
    private resolveCoach;
    private resolveExcuse;
    private resolveInteger;
    private resolveNamed;
    private resolvePlatform;
    private resolveService;
    private resolveStation;
    private resolveStationList;
    private resolveTime;
    private resolveVox;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Manages speech synthesis using both native and custom engines */
declare class Speech {
    /** Instance of the custom voice engine */
    private readonly voxEngine?;
    /** Array of browser-provided voices available */
    browserVoices: SpeechSynthesisVoice[];
    /** Event handler for when speech has ended */
    onstop?: () => void;
    /** Reference to the native speech-stopped check timer */
    private stopTimer;
    constructor();
    /** Begins speaking the given phrase components */
    speak(phrase: HTMLElement, settings?: SpeechSettings): void;
    /** Stops and cancels all queued speech */
    stop(): void;
    /** Pause and unpause speech if the page is hidden or unhidden */
    private onVisibilityChange;
    /** Handles async voice list loading on some browsers, and sets default */
    private onVoicesChanged;
    /**
     * Converts the given phrase to text and speaks it via native browser voices.
     *
     * @param phrase Phrase elements to speak
     * @param settings Settings to use for the voice
     */
    private speakBrowser;
    /**
     * Synthesizes voice by walking through the given phrase elements, resolving parts to
     * sound file IDs, and feeding the entire array to the vox engine.
     *
     * @param phrase Phrase elements to speak
     * @param settings Settings to use for the voice
     */
    private speakVox;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Type definition for speech config overrides passed to the speak method */
interface SpeechSettings {
    /** Whether to force use of the VOX engine */
    useVox?: boolean;
    /** Override absolute or relative URL of VOX voice to use */
    voxPath?: string;
    /** Override choice of reverb to use */
    voxReverb?: string;
    /** Override choice of chime to use */
    voxChime?: string;
    /** Override choice of voice */
    voiceIdx?: number;
    /** Override volume of voice */
    volume?: number;
    /** Override pitch of voice */
    pitch?: number;
    /** Override rate of voice */
    rate?: number;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
declare type VoxKey = string | number;
/** Synthesizes speech by dynamically loading and piecing together voice files */
declare class VoxEngine {
    private static instance;
    static getInstance(dataPath?: string): VoxEngine | undefined;
    /** The core audio context that handles audio effects and playback */
    private readonly audioContext;
    /** Audio node that amplifies or attenuates voice */
    private readonly gainNode;
    /** Audio node that applies the tannoy filter */
    private readonly filterNode;
    /** Audio node that adds a reverb to the voice, if available */
    private readonly reverbNode;
    /** Cache of impulse responses audio data, for reverb */
    private readonly impulses;
    /** Relative path to fetch impulse response and chime files from */
    private readonly dataPath;
    /** Event handler for when speech has ended */
    onstop?: () => void;
    /** Whether this engine is currently running and speaking */
    private isSpeaking;
    /** Reference number for the current pump timer */
    private pumpTimer;
    /** Tracks the audio context's wall-clock time to schedule next clip */
    private nextBegin;
    /** References to currently pending requests, as a FIFO queue */
    private pendingReqs;
    /** References to currently scheduled audio buffers */
    private scheduledBuffers;
    /** List of vox IDs currently being run through */
    private currentIds?;
    /** Speech settings currently being used */
    private currentSettings?;
    private constructor();
    /**
     * Begins loading and speaking a set of vox files. Stops any speech.
     *
     * @param ids List of vox ids to load as files, in speaking order
     * @param settings Voice settings to use
     */
    speak(ids: VoxKey[], settings: SpeechSettings): void;
    /** Stops playing any currently spoken speech and resets state */
    stop(): void;
    /**
     * Pumps the speech queue, by keeping up to 10 fetch requests for voice files going,
     * and then feeding their data (in enforced order) to the audio chain, one at a time.
     */
    private pump;
    private schedule;
    private toggleReverb;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Represents a request for a vox file, immediately begun on creation */
declare class VoxRequest {
    /** Relative remote path of this voice file request */
    readonly path: string;
    /** Amount of seconds to delay the playback of this request */
    readonly delay: number;
    /** Audio context to use for decoding */
    private readonly context;
    /** Whether this request is done and ready for handling (even if failed) */
    isDone: boolean;
    /** Raw audio data from the loaded file, if available */
    buffer?: AudioBuffer;
    /** Playback rate to force this clip to play at */
    forceRate?: number;
    constructor(path: string, delay: number, context: AudioContext);
    /** Cancels this request from proceeding any further */
    cancel(): void;
    /** Begins decoding the loaded MP3 voice file to raw audio data */
    private onFulfill;
    /** Takes the array buffer from the fulfilled fetch and decodes it */
    private onArrayBuffer;
    /** Called when the fetched buffer is decoded successfully */
    private onDecode;
    /** Called if the fetch or decode stages fail */
    private onError;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Base class for a view; anything with a base DOM element */
declare abstract class BaseView {
    /** Reference to this view's primary DOM element */
    protected readonly dom: HTMLElement;
    /** Creates this base view, attaching it to the element matching the given query */
    protected constructor(domQuery: string);
    /** Gets this view's child element matching the given query */
    protected attach<T extends HTMLElement>(query: string): T;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the phrase editor */
declare class Editor {
    /** Reference to the DOM container for the editor */
    private readonly dom;
    /** Reference to the currently open picker dialog, if any */
    private currentPicker?;
    /** Reference to the phrase element currently being edited, if any */
    private domEditing?;
    constructor();
    /** Replaces the editor with a root phraseset reference, and expands it into HTML */
    generate(): void;
    /** Reprocesses all phraseset elements of the given ref, if their index has changed */
    refreshPhraseset(ref: string): void;
    /**
     * Gets a static NodeList of all phrase elements of the given query.
     *
     * @param query Query string to add onto the `span` selector
     * @returns Node list of all elements matching the given span query
     */
    getElementsByQuery(query: string): NodeList;
    /** Gets the current phrase's root DOM element */
    getPhrase(): HTMLElement;
    /** Gets the current phrase in the editor as text, excluding the hidden parts */
    getText(): string;
    /**
     * Finds all phrase elements of the given type, and sets their text to given value.
     *
     * @param type Original XML name of elements to replace contents of
     * @param value New text for the found elements to set
     */
    setElementsText(type: string, value: string): void;
    /** Closes any currently open editor dialogs */
    closeDialog(): void;
    /** Handles a click anywhere in the window depending on the context */
    private onClick;
    /** Re-layout the currently open picker on resize */
    private onResize;
    /** Re-layout the currently open picker on scroll */
    private onScroll;
    /**
     * Flips the collapse state of a collapsible, and propagates the new state to other
     * collapsibles of the same reference.
     *
     * @param target Collapsible element being toggled
     */
    private toggleCollapsiable;
    /**
     * Opens a picker for the given element.
     *
     * @param target Editor element to open the picker for
     * @param picker Picker to open
     */
    private openPicker;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the scrolling marquee */
declare class Marquee {
    /** Reference to the marquee's DOM element */
    private readonly dom;
    /** Reference to the span element in the marquee, where the text is set */
    private readonly domSpan;
    /** Reference ID for the scrolling animation timer */
    private timer;
    /** Current offset (in pixels) of the scrolling marquee */
    private offset;
    constructor();
    /** Sets the message on the scrolling marquee, and starts animating it */
    set(msg: string, animate?: boolean): void;
    /** Stops the current marquee animation */
    stop(): void;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the settings screen */
declare class Settings extends BaseView {
    private readonly btnReset;
    private readonly btnSave;
    private readonly chkUseVox;
    private readonly hintUseVox;
    private readonly selVoxVoice;
    private readonly inputVoxPath;
    private readonly selVoxReverb;
    private readonly selVoxChime;
    private readonly selSpeechVoice;
    private readonly rangeSpeechVol;
    private readonly rangeSpeechPitch;
    private readonly rangeSpeechRate;
    private readonly btnSpeechTest;
    /** Reference to the timer for the "Reset" button confirmation step */
    private resetTimeout?;
    constructor();
    /** Opens the settings screen */
    open(): void;
    /** Closes the settings screen */
    close(): void;
    /** Calculates form layout and control visibility based on state */
    private layout;
    /** Clears and populates the voice list */
    private populateVoiceList;
    /** Handles the reset button, with a confirm step that cancels after 15 seconds */
    private handleReset;
    /** Cancel the reset timeout and restore the reset button to normal */
    private cancelReset;
    /** Handles the save button, saving config to storage */
    private handleSave;
    /** Handles the speech test button, speaking a test phrase */
    private handleVoiceTest;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Controller for the top toolbar */
declare class Toolbar {
    /** Reference to the container for the toolbar */
    private dom;
    /** Reference to the play button */
    private btnPlay;
    /** Reference to the stop button */
    private btnStop;
    /** Reference to the generate random phrase button */
    private btnGenerate;
    /** Reference to the save state button */
    private btnSave;
    /** Reference to the recall state button */
    private btnRecall;
    /** Reference to the settings button */
    private btnOption;
    constructor();
    /** Handles the play button, playing the editor's current phrase with speech */
    private handlePlay;
    /** Handles the stop button, stopping the marquee and any speech */
    private handleStop;
    /** Handles the generate button, generating new random state and phrase */
    private handleGenerate;
    /** Handles the save button, persisting the current train state to storage */
    private handleSave;
    /** Handles the load button, loading train state from storage, if it exists */
    private handleLoad;
    /** Handles the settings button, opening the settings screen */
    private handleOption;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Manages UI elements and their logic */
declare class Views {
    /** Reference to the main editor component */
    readonly editor: Editor;
    /** Reference to the main marquee component */
    readonly marquee: Marquee;
    /** Reference to the main settings screen */
    readonly settings: Settings;
    /** Reference to the main toolbar component */
    readonly toolbar: Toolbar;
    /** References to all the pickers, one for each type of XML element */
    private readonly pickers;
    constructor();
    /** Gets the picker that handles a given tag, if any */
    getPicker(xmlTag: string): Picker;
    /** Handle ESC to close pickers or settigns */
    private onInput;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility methods for dealing with collapsible elements */
declare class Collapsibles {
    /**
     * Sets the collapse state of a collapsible element.
     *
     * @param span The encapsulating collapsible element
     * @param toggle The toggle child of the collapsible element
     * @param state True to collapse, false to open
     */
    static set(span: HTMLElement, toggle: HTMLElement, state: boolean): void;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Sugar for choosing second value if first is undefined, instead of falsy */
declare function either<T>(value: T | undefined, value2: T): T;
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility methods for dealing with the DOM */
declare class DOM {
    /** Whether the window is thinner than a specific size (and, thus, is "mobile") */
    static readonly isMobile: boolean;
    /** Whether RAG appears to be running on an iOS device */
    static readonly isiOS: boolean;
    /**
     * Finds the value of the given attribute from the given element, or returns the given
     * default value if unset.
     *
     * @param element Element to get the attribute of
     * @param attr Name of the attribute to get the value of
     * @param def Default value if attribute isn't set
     * @returns The given attribute's value, or default value if unset
     */
    static getAttr(element: HTMLElement, attr: string, def: string): string;
    /**
     * Finds an element from the given document, throwing an error if no match is found.
     *
     * @param query CSS selector query to use
     * @param parent Parent object to search; defaults to document
     * @returns The first element to match the given query
     */
    static require<T extends HTMLElement>(query: string, parent?: ParentNode): T;
    /**
     * Finds the value of the given attribute from the given element, throwing an error
     * if the attribute is missing.
     *
     * @param element Element to get the attribute of
     * @param attr Name of the attribute to get the value of
     * @returns The given attribute's value
     */
    static requireAttr(element: HTMLElement, attr: string): string;
    /**
     * Finds the value of the given key of the given element's dataset, throwing an error
     * if the value is missing or empty.
     *
     * @param element Element to get the data of
     * @param key Key to get the value of
     * @returns The given dataset's value
     */
    static requireData(element: HTMLElement, key: string): string;
    /**
     * Blurs (unfocuses) the currently focused element.
     *
     * @param parent If given, only blurs if active is descendant
     */
    static blurActive(parent?: HTMLElement): void;
    /**
     * Deep clones all the children of the given element, into the target element.
     * Using innerHTML would be easier, however it handles self-closing tags poorly.
     *
     * @param source Element whose children to clone
     * @param target Element to append the cloned children to
     */
    static cloneInto(source: HTMLElement, target: HTMLElement): void;
    /**
     * Sugar for creating and adding an option element to a select element.
     *
     * @param select Select list element to add the option to
     * @param text Label for the option
     * @param value Value for the option
     */
    static addOption(select: HTMLSelectElement, text: string, value?: string): HTMLOptionElement;
    /**
     * Gets the text content of the given element, excluding the text of hidden children.
     * Be warned; this method uses RAG-specific code.
     *
     * @see https://stackoverflow.com/a/19986328
     * @param element Element to recursively get text content of
     * @returns Text content of given element, without text of hidden children
     */
    static getVisibleText(element: Element): string;
    /**
     * Gets the text content of the given element, excluding the text of hidden children,
     * and excess whitespace as a result of converting from HTML/XML.
     *
     * @see https://stackoverflow.com/a/19986328
     * @param element Element to recursively get text content of
     * @returns Cleaned text of given element, without text of hidden children
     */
    static getCleanedVisibleText(element: Element): string;
    /**
     * Scans for the next focusable sibling from a given element, skipping hidden or
     * unfocusable elements. If the end of the container is hit, the scan wraps around.
     *
     * @param from Element to start scanning from
     * @param dir Direction; -1 for left (previous), 1 for right (next)
     * @returns The next available sibling, or null if none found
     */
    static getNextFocusableSibling(from: HTMLElement, dir: number): HTMLElement | null;
    /**
     * Gets the index of a child element, relevant to its parent.
     *
     * @see https://stackoverflow.com/a/9132575/3354920
     * @param child Child element to get the index of
     */
    static indexOf(child: HTMLElement): number;
    /**
     * Gets the index of a child node, relevant to its parent. Used for text nodes.
     *
     * @see https://stackoverflow.com/a/9132575/3354920
     * @param child Child node to get the index of
     */
    static nodeIndexOf(child: Node): number;
    /**
     * Toggles the hidden attribute of the given element, and all its labels.
     *
     * @param element Element to toggle the hidden attribute of
     * @param force Optional value to force toggling to
     */
    static toggleHidden(element: HTMLElement, force?: boolean): void;
    /**
     * Toggles the hidden attribute of a group of elements, in bulk.
     *
     * @param list An array of argument pairs for {toggleHidden}
     */
    static toggleHiddenAll(...list: [HTMLElement, boolean?][]): void;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** A very, very small subset of Markdown for hyperlinking a block of text */
declare class Linkdown {
    /** Regex pattern for matching linked text */
    private static readonly REGEX_LINK;
    /** Regex pattern for matching link references */
    private static readonly REGEX_REF;
    /**
     * Parses the text of the given block as Linkdown, converting tagged text into links
     * using a given list of index-based references.
     *
     * @param block Element with text to replace; all children cleared
     */
    static parse(block: HTMLElement): void;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility methods for parsing data from strings */
declare class Parse {
    /** Parses a given string into a boolean */
    static boolean(str: string): boolean;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility methods for generating random data */
declare class Random {
    /**
     * Picks a random integer from the given range.
     *
     * @param min Minimum integer to pick, inclusive
     * @param max Maximum integer to pick, inclusive
     * @returns Random integer within the given range
     */
    static int(min?: number, max?: number): number;
    /** Picks a random element from a given array-like object with a length property */
    static array(arr: Lengthable): any;
    /** Splices a random element from a given array */
    static arraySplice<T>(arr: T[]): T;
    /** Picks a random key from a given object */
    static objectKey(obj: {}): any;
    /**
     * Picks true or false.
     *
     * @param chance Chance out of 100, to pick `true`
     */
    static bool(chance?: number): boolean;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility class for audio functionality */
declare class Sounds {
    /**
     * Decodes the given audio file into raw audio data. This is a wrapper for the older
     * callback-based syntax, since it is the only one iOS currently supports.
     *
     * @param context Audio context to use for decoding
     * @param buffer Buffer of encoded file data (e.g. mp3) to decode
     */
    static decode(context: AudioContext, buffer: ArrayBuffer): Promise<AudioBuffer>;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Utility methods for dealing with strings */
declare class Strings {
    /** Checks if the given string is null, or empty (whitespace only or zero-length) */
    static isNullOrEmpty(str: string | null | undefined): boolean;
    /**
     * Pretty-print's a given list of stations, with context sensitive extras.
     *
     * @param codes List of station codes to join
     * @param context List's context. If 'calling', handles special case
     * @returns Pretty-printed list of given stations
     */
    static fromStationList(codes: string[], context: string): string;
    /**
     * Pretty-prints the given date or hours and minutes into a 24-hour time (e.g. 01:09).
     *
     * @param hours Hours, from 0 to 23, or Date object
     * @param minutes Minutes, from 0 to 59
     */
    static fromTime(hours: number | Date, minutes?: number): string;
    /** Cleans up the given text of excess whitespace and any newlines */
    static clean(text: string): string;
    /** Strongly compresses the given string to one more filename friendly */
    static filename(text: string): string;
    /** Gets the first match of a pattern in a string, or undefined if not found */
    static firstMatch(text: string, pattern: RegExp, idx: number): string | undefined;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Union type for iterable types with a .length property */
declare type Lengthable = Array<any> | NodeList | HTMLCollection | string;
/** Represents a platform as a digit and optional letter tuple */
declare type Platform = [string, string];
/** Represents a generic key-value dictionary, with string keys */
declare type Dictionary<T> = {
    [index: string]: T;
};
/** Defines the data references config object passed into RAG.main on init */
interface DataRefs {
    /** Selector for getting the phrase set XML IFrame element */
    phrasesetEmbed: string;
    /** Raw array of excuses for train delays or cancellations to use */
    excusesData: string[];
    /** Raw array of names for special trains to use */
    namedData: string[];
    /** Raw array of names for services/networks to use */
    servicesData: string[];
    /** Raw dictionary of station codes and names to use */
    stationsData: Dictionary<string>;
}
/** Fill ins for various missing definitions of modern Javascript features */
interface Window {
    onunhandledrejection: ErrorEventHandler;
}
interface String {
    padStart(targetLength: number, padString?: string): string;
    padEnd(targetLength: number, padString?: string): string;
}
interface Array<T> {
    includes(searchElement: T, fromIndex?: number): boolean;
}
interface HTMLElement {
    labels: NodeListOf<HTMLElement>;
}
declare class MediaRecorder {
    constructor(stream: MediaStream, options?: MediaRecorderOptions);
    start(timeslice?: number): void;
    stop(): void;
    ondataavailable: ((this: MediaRecorder, ev: BlobEvent) => any) | null;
    onstop: ((this: MediaRecorder, ev: Event) => any) | null;
}
interface MediaRecorderOptions {
    mimeType?: string;
    audioBitsPerSecond?: number;
    videoBitsPerSecond?: number;
    bitsPerSecond?: number;
}
declare class BlobEvent extends Event {
    readonly data: Blob;
    readonly timecode: number;
}
interface AudioContextBase {
    audioWorklet: AudioWorklet;
}
declare type SampleChannels = Float32Array[][];
declare class AudioWorkletProcessor {
    static parameterDescriptors: AudioParamDescriptor[];
    protected constructor(options?: AudioWorkletNodeOptions);
    readonly port?: MessagePort;
    process(inputs: SampleChannels, outputs: SampleChannels, parameters: Dictionary<Float32Array>): boolean;
}
interface AudioWorkletNodeOptions extends AudioNodeOptions {
    numberOfInputs?: number;
    numberOfOutputs?: number;
    outputChannelCount?: number[];
    parameterData?: {
        [index: string]: number;
    };
    processorOptions?: any;
}
interface MediaTrackConstraintSet {
    autoGainControl?: boolean | ConstrainBooleanParameters;
    noiseSuppression?: boolean | ConstrainBooleanParameters;
}
declare function registerProcessor(name: string, ctor: AudioWorkletProcessor): void;
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Holds runtime configuration */
declare class Config {
    /** If user has clicked shuffle at least once */
    clickedGenerate: boolean;
    /** Volume for speech to be set at */
    speechVol: number;
    /** Pitch for speech to be set at */
    speechPitch: number;
    /** Rate for speech to be set at */
    speechRate: number;
    /** Choice of speech voice to use, as getVoices index or -1 if unset */
    private _speechVoice;
    /** Whether to use the VOX engine */
    voxEnabled: boolean;
    /** Relative or absolute URL of the VOX voice to use */
    voxPath: string;
    /** Relative or absolute URL of the custom VOX voice to use */
    voxCustomPath: string;
    /** Impulse response to use for VOX's reverb */
    voxReverb: string;
    /** VOX key of the chime to use prior to speaking */
    voxChime: string;
    /**
     * Choice of speech voice to use, as getVoices index. Because of the async nature of
     * getVoices, the default value will be fetched from it each time.
     */
    /** Sets the choice of speech to use, as getVoices index */
    speechVoice: number;
    /** Safely loads runtime configuration from localStorage, if any */
    constructor(load: boolean);
    /** Safely saves runtime configuration to localStorage */
    save(): void;
    /** Safely deletes runtime configuration from localStorage and resets state */
    reset(): void;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Manages data for excuses, trains, services and stations */
declare class Database {
    /** Loaded dataset of delay or cancellation excuses */
    readonly excuses: string[];
    /** Loaded dataset of named trains */
    readonly named: string[];
    /** Loaded dataset of service or network names */
    readonly services: string[];
    /** Loaded dictionary of station names, with three-letter code keys (e.g. ABC) */
    readonly stations: Dictionary<string>;
    /** Loaded XML document containing phraseset data */
    readonly phrasesets: Document;
    /** Amount of stations in the currently loaded dataset */
    private readonly stationsCount;
    constructor(dataRefs: DataRefs);
    /** Picks a random excuse for a delay or cancellation */
    pickExcuse(): string;
    /** Picks a random named train */
    pickNamed(): string;
    /**
     * Clones and gets phrase with the given ID, or null if it doesn't exist.
     *
     * @param id ID of the phrase to get
     */
    getPhrase(id: string): HTMLElement | null;
    /**
     * Gets a phraseset with the given ID, or null if it doesn't exist. Note that the
     * returned phraseset comes from the XML document, so it should not be mutated.
     *
     * @param id ID of the phraseset to get
     */
    getPhraseset(id: string): HTMLElement | null;
    /** Picks a random rail network name */
    pickService(): string;
    /**
     * Picks a random station code from the dataset.
     *
     * @param exclude List of codes to exclude. May be ignored if search takes too long.
     */
    pickStationCode(exclude?: string[]): string;
    /**
     * Gets the station name from the given three letter code.
     *
     * @param code Three-letter station code to get the name of
     * @param filtered Whether to filter out parenthesized location context
     * @returns Station name for the given code, filtered if specified
     */
    getStation(code: string): string;
    /**
     * Picks a random range of station codes, ensuring there are no duplicates.
     *
     * @param min Minimum amount of stations to pick
     * @param max Maximum amount of stations to pick
     * @param exclude
     * @returns A list of unique station names
     */
    pickStationCodes(min?: number, max?: number, exclude?: string[]): string[];
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Main class of the entire Rail Announcements Generator application */
declare class RAG {
    /** Gets the configuration holder */
    static config: Config;
    /** Gets the database manager, which holds phrase, station and train data */
    static database: Database;
    /** Gets the phrase manager, which generates HTML phrases from XML */
    static phraser: Phraser;
    /** Gets the speech engine */
    static speech: Speech;
    /** Gets the current train and station state */
    static state: State;
    /** Gets the view controller, which manages UI interaction */
    static views: Views;
    /**
     * Entry point for RAG, to be called from Javascript.
     *
     * @param dataRefs Configuration object, with rail data to use
     */
    static main(dataRefs: DataRefs): void;
    /** Generates a new random phrase and state */
    static generate(): void;
    /** Loads state from given JSON */
    static load(json: string): void;
    /** Global error handler; throws up a big red panic screen on uncaught error */
    private static panic;
}
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
/** Disposable class that holds state for the current schedule, train, etc. */
declare class State {
    /** State of collapsible elements. Key is reference ID, value is collapsed. */
    private _collapsibles;
    /** Current coach letter choices. Key is context ID, value is letter. */
    private _coaches;
    /** Current integer choices. Key is context ID, value is integer. */
    private _integers;
    /** Current phraseset phrase choices. Key is reference ID, value is index. */
    private _phrasesets;
    /** Current service choices. Key is context ID, value is service. */
    private _services;
    /** Current station choices. Key is context ID, value is station code. */
    private _stations;
    /** Current station list choices. Key is context ID, value is array of codes. */
    private _stationLists;
    /** Current time choices. Key is context ID, value is time. */
    private _times;
    /** Currently chosen excuse */
    private _excuse?;
    /** Currently chosen platform */
    private _platform?;
    /** Currently chosen named train */
    private _named?;
    /**
     * Gets the currently chosen coach letter, or randomly picks one from A to Z.
     *
     * @param context Context ID to get or choose the letter for
     */
    getCoach(context: string): string;
    /**
     * Sets a coach letter.
     *
     * @param context Context ID to set the letter for
     * @param coach Value to set
     */
    setCoach(context: string, coach: string): void;
    /**
     * Gets the collapse state of a collapsible, or randomly picks one.
     *
     * @param ref Reference ID to get the collapsible state of
     * @param chance Chance between 0 and 100 of choosing true, if unset
     */
    getCollapsed(ref: string, chance: number): boolean;
    /**
     * Sets a collapsible's state.
     *
     * @param ref Reference ID to set the collapsible state of
     * @param state Value to set, where true is "collapsed"
     */
    setCollapsed(ref: string, state: boolean): void;
    /**
     * Gets the currently chosen integer, or randomly picks one.
     *
     * @param context Context ID to get or choose the integer for
     */
    getInteger(context: string): number;
    /**
     * Sets an integer.
     *
     * @param context Context ID to set the integer for
     * @param value Value to set
     */
    setInteger(context: string, value: number): void;
    /**
     * Gets the currently chosen phrase of a phraseset, or randomly picks one.
     *
     * @param ref Reference ID to get or choose the phraseset's phrase of
     */
    getPhrasesetIdx(ref: string): number;
    /**
     * Sets the chosen index for a phraseset.
     *
     * @param ref Reference ID to set the phraseset index of
     * @param idx Index to set
     */
    setPhrasesetIdx(ref: string, idx: number): void;
    /**
     * Gets the currently chosen service, or randomly picks one.
     *
     * @param context Context ID to get or choose the service for
     */
    getService(context: string): string;
    /**
     * Sets a service.
     *
     * @param context Context ID to set the service for
     * @param service Value to set
     */
    setService(context: string, service: string): void;
    /**
     * Gets the currently chosen station code, or randomly picks one.
     *
     * @param context Context ID to get or choose the station for
     */
    getStation(context: string): string;
    /**
     * Sets a station code.
     *
     * @param context Context ID to set the station code for
     * @param code Station code to set
     */
    setStation(context: string, code: string): void;
    /**
     * Gets the currently chosen list of station codes, or randomly generates one.
     *
     * @param context Context ID to get or choose the station list for
     */
    getStationList(context: string): string[];
    /**
     * Sets a list of station codes.
     *
     * @param context Context ID to set the station code list for
     * @param codes Station codes to set
     */
    setStationList(context: string, codes: string[]): void;
    /**
     * Gets the currently chosen time
     *
     * @param context Context ID to get or choose the time for
     */
    getTime(context: string): string;
    /**
     * Sets a time.
     *
     * @param context Context ID to set the time for
     * @param time Value to set
     */
    setTime(context: string, time: string): void;
    /** Gets the chosen excuse, or randomly picks one */
    /** Sets the current excuse */
    excuse: string;
    /** Gets the chosen platform, or randomly picks one */
    /** Sets the current platform */
    platform: Platform;
    /** Gets the chosen named train, or randomly picks one */
    /** Sets the current named train */
    named: string;
    /**
     * Sets up the state in a particular way, so that it makes some real-world sense.
     * To do so, we have to generate data in a particular order, and make sure to avoid
     * duplicates in inappropriate places and contexts.
     */
    genDefaultState(): void;
}
