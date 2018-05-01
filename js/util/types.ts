/** Union type for iterable types with a .length property */
type Lengthable = Array<any> | NodeList;

/** Represents the format of the National Rail station name dataset */
type StationsDB = { [index: string]: string };

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