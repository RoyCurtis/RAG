/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Manages data for excuses, trains, services and stations. */
class Database
{
    public readonly excuses    : string[];
    public readonly named      : string[];
    public readonly services   : string[];
    public readonly stations   : Dictionary<string>;
    public readonly phraseSets : Document;

    constructor(config: RAGConfig)
    {
        let iframe = DOM.require(config.phraseSetEmbed) as HTMLIFrameElement;

        if (!iframe.contentDocument)
            throw new Error("Configured phraseset element is not an iframe embed");

        this.phraseSets = iframe.contentDocument;
        this.excuses    = config.excusesData;
        this.named      = config.namedData;
        this.services   = config.servicesData;
        this.stations   = config.stationsData;

        console.log("[Database] Entries loaded:");
        console.log("\tExcuses:",      this.excuses.length);
        console.log("\tNamed trains:", this.named.length);
        console.log("\tServices:",     this.services.length);
        console.log("\tStations:",     Object.keys(this.stations).length);
    }

    /** Picks a random excuse for a delay or cancellation */
    public pickExcuse() : string
    {
        return Random.array(this.excuses);
    }

    /** Picks a random named train */
    public pickNamed() : string
    {
        return Random.array(this.named);
    }

    /** Gets a phrase with the given ID, or null if it doesn't exist */
    public getPhrase(id: string) : HTMLElement | null
    {
        // TODO: test if cloning works, cause it'll be safer
        return this.phraseSets.querySelector('phrase#' + id);
    }

    /** Gets a phraseset with the given ID, or null if it doesn't exist */
    public getPhraseset(id: string) : HTMLElement | null
    {
        return this.phraseSets.querySelector('phraseset#' + id);
    }

    /** Picks a random rail network name */
    public pickService() : string
    {
        return Random.array(this.services);
    }

    /** Picks a random station code */
    public pickStationCode() : string
    {
        return Random.objectKey(this.stations);
    }

    /** Gets the station name from the given three letter code */
    public getStation(code: string) : string
    {
        if (!this.stations[code])
            return `UNKNOWN STATION: ${code}`;

        return this.stations[code];
    }

    /**
     * Picks a random range of stations, ensuring there are no duplicates.
     *
     * @param {number} min Minimum amount of stations to pick
     * @param {number} max Maximum amount of stations to pick
     * @returns {string[]} A list of unique station names
     */
    public pickStations(min = 1, max = 16) : string[]
    {
        if (max - min > Object.keys(this.stations).length)
            throw new Error("Picking too many stations than there are available");

        let result: string[] = [];

        let length = Random.int(min, max);
        let cloned = Object.assign({}, this.stations);

        while (result.length < length)
        {
            let key = Random.objectKey(cloned);
            result.push(cloned[key]);
            delete cloned[key];
        }

        return result;
    }
}