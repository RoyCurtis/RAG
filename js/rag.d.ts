/// <reference path="vendor/draggable.d.ts" />
declare let L: EnglishLanguage | BaseLanguage;
declare class I18n {
    private static readonly TAG_REGEX;
    private static languages;
    private static currentLang;
    static init(): void;
    private static applyToDom();
    private static nodeFilter(node);
    private static expandAttribute(attr);
    private static expandTextNode(node);
    private static replace(match);
}
declare type SelectDelegate = (entry: HTMLElement) => void;
declare class Chooser {
    private static TEMPLATE;
    private static init();
    protected readonly dom: HTMLElement;
    protected readonly inputFilter: HTMLInputElement;
    protected readonly inputChoices: HTMLElement;
    onSelect?: SelectDelegate;
    selectOnClick: boolean;
    protected domSelected?: HTMLElement;
    protected filterTimeout: number;
    protected groupByABC: boolean;
    protected itemTitle: string;
    constructor(parent: HTMLElement);
    add(value: string, select?: boolean): void;
    addRaw(item: HTMLElement, select?: boolean): void;
    clear(): void;
    preselect(value: string): void;
    onClick(ev: MouseEvent): void;
    onClose(): void;
    onInput(ev: KeyboardEvent): void;
    onSubmit(ev: Event): void;
    protected filter(): void;
    protected static filterItem(item: HTMLElement, filter: string): number;
    protected static filterGroup(group: HTMLElement, filter: string): void;
    protected select(entry: HTMLElement): void;
    protected visualSelect(entry: HTMLElement): void;
    protected visualUnselect(): void;
    protected owns(target: HTMLElement): boolean;
    protected isChoice(target?: HTMLElement): boolean;
}
declare class StationChooser extends Chooser {
    private readonly domStations;
    constructor(parent: HTMLElement);
    attach(picker: Picker, onSelect: SelectDelegate): void;
    preselectCode(code: string): void;
    enable(codeOrNode: string | HTMLElement): void;
    disable(code: string): void;
    private getByCode(code);
    private addStation(code);
}
declare class StationListItem {
    private static TEMPLATE;
    private static init();
    readonly dom: HTMLElement;
    constructor(code: string);
}
declare abstract class Picker {
    readonly dom: HTMLElement;
    readonly domForm: HTMLFormElement;
    readonly domHeader: HTMLElement;
    readonly xmlTag: string;
    protected domEditing?: HTMLElement;
    protected constructor(xmlTag: string);
    protected abstract onChange(ev: Event): void;
    protected abstract onClick(ev: MouseEvent): void;
    protected abstract onInput(ev: KeyboardEvent): void;
    protected onSubmit(ev: Event): void;
    open(target: HTMLElement): void;
    close(): void;
    layout(): void;
    hasFocus(): boolean;
}
declare class CoachPicker extends Picker {
    private readonly inputLetter;
    private currentCtx;
    constructor();
    open(target: HTMLElement): void;
    protected onChange(_: Event): void;
    protected onClick(_: MouseEvent): void;
    protected onInput(_: KeyboardEvent): void;
}
declare class ExcusePicker extends Picker {
    private readonly domChooser;
    constructor();
    open(target: HTMLElement): void;
    close(): void;
    protected onChange(_: Event): void;
    protected onClick(ev: MouseEvent): void;
    protected onInput(ev: KeyboardEvent): void;
    protected onSubmit(ev: Event): void;
    private onSelect(entry);
}
declare class IntegerPicker extends Picker {
    private readonly inputDigit;
    private readonly domLabel;
    private currentCtx?;
    private singular?;
    private plural?;
    private words?;
    constructor();
    open(target: HTMLElement): void;
    protected onChange(_: Event): void;
    protected onClick(_: MouseEvent): void;
    protected onInput(_: KeyboardEvent): void;
}
declare class NamedPicker extends Picker {
    private readonly domChooser;
    constructor();
    open(target: HTMLElement): void;
    close(): void;
    protected onChange(_: Event): void;
    protected onClick(ev: MouseEvent): void;
    protected onInput(ev: KeyboardEvent): void;
    protected onSubmit(ev: Event): void;
    private onSelect(entry);
}
declare class PhrasesetPicker extends Picker {
    private readonly domChooser;
    private currentRef?;
    constructor();
    open(target: HTMLElement): void;
    close(): void;
    protected onChange(_: Event): void;
    protected onClick(ev: MouseEvent): void;
    protected onInput(ev: KeyboardEvent): void;
    protected onSubmit(ev: Event): void;
    private onSelect(entry);
}
declare class PlatformPicker extends Picker {
    private readonly inputDigit;
    private readonly inputLetter;
    constructor();
    open(target: HTMLElement): void;
    protected onChange(_: Event): void;
    protected onClick(_: MouseEvent): void;
    protected onInput(_: KeyboardEvent): void;
}
declare class ServicePicker extends Picker {
    private readonly domChooser;
    private currentCtx;
    constructor();
    open(target: HTMLElement): void;
    close(): void;
    protected onChange(_: Event): void;
    protected onClick(ev: MouseEvent): void;
    protected onInput(ev: KeyboardEvent): void;
    protected onSubmit(ev: Event): void;
    private onSelect(entry);
}
declare class StationPicker extends Picker {
    protected static chooser: StationChooser;
    protected currentCtx: string;
    protected onOpen: (target: HTMLElement) => void;
    constructor(tag?: string);
    open(target: HTMLElement): void;
    protected onStationPickerOpen(target: HTMLElement): void;
    protected onChange(_: Event): void;
    protected onClick(ev: MouseEvent): void;
    protected onInput(ev: KeyboardEvent): void;
    protected onSubmit(ev: Event): void;
    private onSelectStation(entry);
}
declare class StationListPicker extends StationPicker {
    private readonly domList;
    private readonly btnAdd;
    private readonly btnClose;
    private readonly domDel;
    private readonly inputList;
    private readonly domEmptyList;
    constructor();
    protected onStationListPickerOpen(target: HTMLElement): void;
    protected onSubmit(ev: Event): void;
    protected onClick(ev: MouseEvent): void;
    protected onInput(ev: KeyboardEvent): void;
    private onAddStation(entry);
    private onDragMirrorCreate(ev);
    private onDragStop(ev);
    private add(code);
    private remove(entry);
    private update();
}
declare class TimePicker extends Picker {
    private readonly inputTime;
    private currentCtx;
    constructor();
    open(target: HTMLElement): void;
    protected onChange(_: Event): void;
    protected onClick(_: MouseEvent): void;
    protected onInput(_: KeyboardEvent): void;
}
declare type LanguageEntry = (...parts: string[]) => string;
declare abstract class BaseLanguage {
    [index: string]: LanguageEntry | string | string[];
    readonly abstract WELCOME: LanguageEntry;
    readonly abstract DOM_MISSING: LanguageEntry;
    readonly abstract ATTR_MISSING: LanguageEntry;
    readonly abstract DATA_MISSING: LanguageEntry;
    readonly abstract BAD_DIRECTION: LanguageEntry;
    readonly abstract BAD_BOOLEAN: LanguageEntry;
    readonly abstract STATE_FROM_STORAGE: LanguageEntry;
    readonly abstract STATE_TO_STORAGE: LanguageEntry;
    readonly abstract STATE_COPY_PASTE: LanguageEntry;
    readonly abstract STATE_RAW_JSON: LanguageEntry;
    readonly abstract STATE_SAVE_FAIL: LanguageEntry;
    readonly abstract STATE_SAVE_MISSING: LanguageEntry;
    readonly abstract STATE_NONEXISTANT_PHRASESET: LanguageEntry;
    readonly abstract CONFIG_LOAD_FAIL: LanguageEntry;
    readonly abstract CONFIG_SAVE_FAIL: LanguageEntry;
    readonly abstract CONFIG_RESET_FAIL: LanguageEntry;
    readonly abstract DB_ELEMENT_NOT_PHRASESET_IFRAME: LanguageEntry;
    readonly abstract DB_UNKNOWN_STATION: LanguageEntry;
    readonly abstract DB_EMPTY_STATION: LanguageEntry;
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
    readonly abstract EDITOR_INIT: LanguageEntry;
    readonly abstract EDITOR_UNKNOWN_ELEMENT: LanguageEntry;
    readonly abstract EDITOR_UNKNOWN_PHRASE: LanguageEntry;
    readonly abstract EDITOR_UNKNOWN_PHRASESET: LanguageEntry;
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
    readonly abstract P_COACH_MISSING_STATE: LanguageEntry;
    readonly abstract P_INT_MISSING_STATE: LanguageEntry;
    readonly abstract P_PSET_MISSING_STATE: LanguageEntry;
    readonly abstract P_SERVICE_MISSING_STATE: LanguageEntry;
    readonly abstract P_TIME_MISSING_STATE: LanguageEntry;
    readonly abstract P_PSET_UNKNOWN: LanguageEntry;
    readonly abstract P_SL_DRAG_MISSING: LanguageEntry;
    readonly abstract ST_RESET: LanguageEntry;
    readonly abstract ST_RESET_T: LanguageEntry;
    readonly abstract ST_RESET_CONFIRM: LanguageEntry;
    readonly abstract ST_RESET_CONFIRM_T: LanguageEntry;
    readonly abstract ST_RESET_DONE: LanguageEntry;
    readonly abstract ST_SAVE: LanguageEntry;
    readonly abstract ST_SAVE_T: LanguageEntry;
    readonly abstract ST_VOX: LanguageEntry;
    readonly abstract ST_VOX_CHOICE: LanguageEntry;
    readonly abstract ST_VOX_EMPTY: LanguageEntry;
    readonly abstract ST_VOX_VOL: LanguageEntry;
    readonly abstract ST_VOX_PITCH: LanguageEntry;
    readonly abstract ST_VOX_RATE: LanguageEntry;
    readonly abstract ST_VOX_TEST: LanguageEntry;
    readonly abstract ST_VOX_TEST_T: LanguageEntry;
    readonly abstract ST_LEGAL: LanguageEntry;
    readonly abstract WARN_SHORT_HEADER: LanguageEntry;
    readonly abstract WARN_SHORT: LanguageEntry;
    readonly abstract LETTERS: string;
    readonly abstract DIGITS: string[];
}
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
    TITLE_OPT_OPEN: () => string;
    TITLE_OPT_CLOSE: () => string;
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
    ST_VOX: () => string;
    ST_VOX_CHOICE: () => string;
    ST_VOX_EMPTY: () => string;
    ST_VOX_VOL: () => string;
    ST_VOX_PITCH: () => string;
    ST_VOX_RATE: () => string;
    ST_VOX_TEST: () => string;
    ST_VOX_TEST_T: () => string;
    ST_LEGAL: () => string;
    WARN_SHORT_HEADER: () => string;
    WARN_SHORT: () => string;
    LETTERS: string;
    DIGITS: string[];
}
declare class ElementProcessors {
    static coach(ctx: PhraseContext): void;
    static excuse(ctx: PhraseContext): void;
    static integer(ctx: PhraseContext): void;
    static named(ctx: PhraseContext): void;
    static phrase(ctx: PhraseContext): void;
    static phraseset(ctx: PhraseContext): void;
    static platform(ctx: PhraseContext): void;
    static service(ctx: PhraseContext): void;
    static station(ctx: PhraseContext): void;
    static stationlist(ctx: PhraseContext): void;
    static time(ctx: PhraseContext): void;
    static unknown(ctx: PhraseContext): void;
    private static makeCollapsible(ctx, source, ref);
}
interface PhraseContext {
    xmlElement: HTMLElement;
    newElement: HTMLSpanElement;
}
declare class Phraser {
    process(container: HTMLElement, level?: number): void;
}
declare class Editor {
    private readonly dom;
    private currentPicker?;
    private domEditing?;
    constructor();
    generate(): void;
    refreshPhraseset(ref: string): void;
    getElementsByQuery(query: string): NodeList;
    getText(): string;
    setElementsText(type: string, value: string): void;
    closeDialog(): void;
    private onClick(ev);
    private onResize(_);
    private onScroll(_);
    private toggleCollapsiable(target);
    private openPicker(target, picker);
}
declare class Marquee {
    private readonly dom;
    private readonly domSpan;
    private timer;
    private offset;
    constructor();
    set(msg: string): void;
    stop(): void;
}
declare class Settings {
    private dom;
    private btnReset;
    private btnSave;
    private selVoxChoice;
    private rangeVoxVol;
    private rangeVoxPitch;
    private rangeVoxRate;
    private btnVoxTest;
    private resetTimeout?;
    constructor();
    open(): void;
    close(): void;
    private populateVoxList();
    private handleReset();
    private cancelReset();
    private handleSave();
    private handleVoxTest(ev);
}
declare class Toolbar {
    private dom;
    private btnPlay;
    private btnStop;
    private btnGenerate;
    private btnSave;
    private btnRecall;
    private btnOption;
    constructor();
    private handlePlay();
    private handleStop();
    private handleGenerate();
    private handleSave();
    private handleLoad();
    private handleOption();
}
declare class Views {
    readonly editor: Editor;
    readonly marquee: Marquee;
    readonly settings: Settings;
    readonly toolbar: Toolbar;
    private readonly pickers;
    constructor();
    getPicker(xmlTag: string): Picker;
    private onInput(ev);
}
declare class Collapsibles {
    static set(span: HTMLElement, toggle: HTMLElement, state: boolean): void;
}
declare class DOM {
    static readonly isMobile: boolean;
    static readonly isiOS: boolean;
    static getAttr(element: HTMLElement, attr: string, def: string): string;
    static require<T extends HTMLElement>(query: string, parent?: ParentNode): T;
    static requireAttr(element: HTMLElement, attr: string): string;
    static requireData(element: HTMLElement, key: string): string;
    static blurActive(parent?: HTMLElement): void;
    static cloneInto(source: HTMLElement, target: HTMLElement): void;
    static getVisibleText(element: Element): string;
    static getCleanedVisibleText(element: Element): string;
    static getNextFocusableSibling(from: HTMLElement, dir: number): HTMLElement | null;
}
declare class Linkdown {
    private static readonly REGEX_LINK;
    private static readonly REGEX_REF;
    static parse(block: HTMLElement): void;
}
declare class Parse {
    static boolean(str: string): boolean;
}
declare class Random {
    static int(min?: number, max?: number): number;
    static array(arr: Lengthable): any;
    static arraySplice<T>(arr: T[]): T;
    static objectKey(obj: {}): any;
    static bool(chance?: number): boolean;
}
declare class Strings {
    static isNullOrEmpty(str: string | null | undefined): boolean;
    static fromStationList(codes: string[], context: string): string;
    static fromTime(hours: number | Date, minutes?: number): string;
    static clean(text: string): string;
}
declare type Lengthable = Array<any> | NodeList | HTMLCollection | string;
declare type Platform = [string, string];
declare type Dictionary<T> = {
    [index: string]: T;
};
interface DataRefs {
    phrasesetEmbed: string;
    excusesData: string[];
    namedData: string[];
    servicesData: string[];
    stationsData: Dictionary<string>;
}
interface String {
    padStart(targetLength: number, padString?: string): string;
    padEnd(targetLength: number, padString?: string): string;
}
interface Array<T> {
    includes(searchElement: T, fromIndex?: number): boolean;
}
declare class SpeechEngine {
    private voices;
    constructor();
    getVoices(): SpeechSynthesisVoice[];
    speak(utterance: SpeechSynthesisUtterance): void;
    cancel(): void;
    private onVisibilityChange();
    private onVoicesChanged();
}
declare class Config {
    voxVolume: number;
    voxPitch: number;
    voxRate: number;
    private _voxChoice;
    clickedGenerate: boolean;
    voxChoice: number;
    constructor(load: boolean);
    save(): void;
    reset(): void;
}
declare class Database {
    readonly excuses: string[];
    readonly named: string[];
    readonly services: string[];
    readonly stations: Dictionary<string>;
    readonly phrasesets: Document;
    private readonly stationsCount;
    constructor(dataRefs: DataRefs);
    pickExcuse(): string;
    pickNamed(): string;
    getPhrase(id: string): HTMLElement | null;
    getPhraseset(id: string): HTMLElement | null;
    pickService(): string;
    pickStationCode(exclude?: string[]): string;
    getStation(code: string, filtered?: boolean): string;
    pickStationCodes(min?: number, max?: number, exclude?: string[]): string[];
}
declare class RAG {
    static config: Config;
    static database: Database;
    static phraser: Phraser;
    static speech: SpeechEngine;
    static state: State;
    static views: Views;
    static main(dataRefs: DataRefs): void;
    static generate(): void;
    static load(json: string): void;
    private static panic(error?);
}
declare class State {
    private _collapsibles;
    private _coaches;
    private _integers;
    private _phrasesets;
    private _services;
    private _stations;
    private _stationLists;
    private _times;
    private _excuse?;
    private _platform?;
    private _named?;
    getCoach(context: string): string;
    setCoach(context: string, coach: string): void;
    getCollapsed(ref: string, chance: number): boolean;
    setCollapsed(ref: string, state: boolean): void;
    getInteger(context: string): number;
    setInteger(context: string, value: number): void;
    getPhrasesetIdx(ref: string): number;
    setPhrasesetIdx(ref: string, idx: number): void;
    getService(context: string): string;
    setService(context: string, service: string): void;
    getStation(context: string): string;
    setStation(context: string, code: string): void;
    getStationList(context: string): string[];
    setStationList(context: string, codes: string[]): void;
    getTime(context: string): string;
    setTime(context: string, time: string): void;
    excuse: string;
    platform: Platform;
    named: string;
    genDefaultState(): void;
}
declare class Resolver {
    static resolve(element: HTMLElement): string | null;
}
