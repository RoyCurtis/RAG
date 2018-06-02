/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Union type for iterable types with a .length property */
type Lengthable = Array<any> | NodeList | HTMLCollection | string;

/** Represents a platform as a digit and optional letter tuple */
type Platform = [string, string];

/** Represents the format of the National Rail station name dataset */
type StationsDB = { [index: string]: string };

/** Represents a dictionary of picker classes for the editor */
type PickerDictionary = { [index: string]: Picker };

/** Defines the config object passed into RAG.main on init */
interface RAGConfig
{
    /** Selector for getting the phrase set XML IFrame element */
    phraseSetEmbed : string;
    /** Raw array of excuses for train delays or cancellations to use */
    excusesData    : string[];
    /** Raw array of names for special trains to use */
    namedData      : string[];
    /** Raw array of names for services/networks to use */
    servicesData   : string[];
    /** Raw dictionary of station codes and names to use */
    stationsData   : StationsDB;
}

/** Fill in for ES2017 string padding methods */
interface String
{
    padStart(targetLength: number, padString?: string) : string;
    padEnd(targetLength: number, padString?: string) : string;
}