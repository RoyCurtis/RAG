/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Union type for iterable types with a .length property */
type Lengthable = Array<any> | NodeList | HTMLCollection | string;

/** Represents a platform as a digit and optional letter tuple */
type Platform = [string, string];

/** Represents a generic key-value dictionary, with string keys */
type Dictionary<T> = { [index: string]: T };

/** Defines the data references config object passed into RAG.main on init */
interface DataRefs
{
    /** Selector for getting the phrase set XML IFrame element */
    phrasesetEmbed : string;
    /** Raw array of excuses for train delays or cancellations to use */
    excusesData    : string[];
    /** Raw array of names for special trains to use */
    namedData      : string[];
    /** Raw array of names for services/networks to use */
    servicesData   : string[];
    /** Raw dictionary of station codes and names to use */
    stationsData   : Dictionary<string>;
}

/** Fill ins for various missing definitions of modern Javascript features */

interface Window
{
    onunhandledrejection: ErrorEventHandler;
}

interface String
{
    padStart(targetLength: number, padString?: string) : string;
    padEnd(targetLength: number, padString?: string) : string;
}

interface Array<T>
{
    includes(searchElement: T, fromIndex?: number) : boolean;
}

interface HTMLElement
{
    labels : NodeListOf<HTMLElement>;
}

declare class MediaRecorder
{
    constructor(stream: MediaStream, options?: MediaRecorderOptions);
    start(timeslice?: number) : void;
    stop() : void;
    ondataavailable : ((this: MediaRecorder, ev: BlobEvent) => any) | null;
    onstop : ((this: MediaRecorder, ev: Event) => any) | null;
}

interface MediaRecorderOptions
{
    mimeType? : string;
    audioBitsPerSecond? : number;
    videoBitsPerSecond? : number;
    bitsPerSecond? : number;
}

declare class BlobEvent extends Event
{
    readonly data     : Blob;
    readonly timecode : number;
}

interface AudioContextBase
{
    audioWorklet : AudioWorklet;
}

type SampleChannels = Float32Array[][];

declare class AudioWorkletProcessor
{
    static parameterDescriptors : AudioParamDescriptor[];

    protected constructor(options?: AudioWorkletNodeOptions);
    readonly port?: MessagePort;

    process(
        inputs: SampleChannels,
        outputs: SampleChannels,
        parameters: Dictionary<Float32Array>
    ) : boolean;
}

interface AudioWorkletNodeOptions extends AudioNodeOptions
{
    numberOfInputs? : number;
    numberOfOutputs? : number;
    outputChannelCount? : number[];
    parameterData? : {[index: string] : number};
    processorOptions? : any;
}

interface MediaTrackConstraintSet
{
    autoGainControl?: boolean | ConstrainBooleanParameters;
    noiseSuppression?: boolean | ConstrainBooleanParameters;
}

declare function registerProcessor(name: string, ctor: AudioWorkletProcessor) : void;