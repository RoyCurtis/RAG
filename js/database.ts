/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Manages data for excuses, trains, services and stations. */
class Database
{
    public readonly excuses    : string[];
    public readonly named      : string[];
    public readonly services   : string[];
    public readonly stations   : Dictionary<string>;
    public readonly phrasesets : Document;

    private readonly stationsCount : number;

    constructor(config: RAGConfig)
    {
        let iframe = DOM.require(config.phrasesetEmbed) as HTMLIFrameElement;

        if (!iframe.contentDocument)
            throw new Error("Configured phraseset element is not an iframe embed");

        this.phrasesets    = iframe.contentDocument;
        this.excuses       = config.excusesData;
        this.named         = config.namedData;
        this.services      = config.servicesData;
        this.stations      = config.stationsData;
        this.stationsCount = Object.keys(this.stations).length;

        console.log("[Database] Entries loaded:");
        console.log("\tExcuses:",      this.excuses.length);
        console.log("\tNamed trains:", this.named.length);
        console.log("\tServices:",     this.services.length);
        console.log("\tStations:",     this.stationsCount);
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
        let result = this.phrasesets.querySelector('phrase#' + id) as HTMLElement;

        if (result)
            result = result.cloneNode(true) as HTMLElement;

        return result;
    }

    /** Gets a phraseset with the given ID, or null if it doesn't exist */
    public getPhraseset(id: string) : HTMLElement | null
    {
        return this.phrasesets.querySelector('phraseset#' + id);
    }

    /** Picks a random rail network name */
    public pickService() : string
    {
        return Random.array(this.services);
    }

    /** Picks a random station code */
    public pickStationCode(exclude?: string[]) : string
    {
        // Give up finding random station that's not in the given list, if we try more
        // times then there are stations. Inaccurate, but good enough.
        if (exclude) for (let i = 0; i < this.stationsCount; i++)
        {
            let value = Random.objectKey(this.stations);

            if ( !exclude.includes(value) )
                return value;
        }

        return Random.objectKey(this.stations);
    }

    /**
     * Gets the station name from the given three letter code.
     *
     * @param {string} code Three-letter station code to get the name of
     * @param {boolean} filtered Whether to filter out parenthesized location context
     * @returns {string} Station name for the given code, filtered if specified
     */
    public getStation(code: string, filtered: boolean = false) : string
    {
        let station = this.stations[code];

        if (!station)
            return `UNKNOWN STATION: ${code}`;

        if (filtered)
            station = station.replace(/\(.+\)/i, '').trim();

        return station;
    }

    /**
     * Picks a random range of station codes, ensuring there are no duplicates.
     *
     * @param {number} min Minimum amount of stations to pick
     * @param {number} max Maximum amount of stations to pick
     * @param {string[]} exclude
     * @returns {string[]} A list of unique station names
     */
    public pickStationCodes(min = 1, max = 16, exclude? : string[]) : string[]
    {
        if (max - min > Object.keys(this.stations).length)
            throw new Error("Picking too many stations than there are available");

        let result: string[] = [];

        let length = Random.int(min, max);
        let tries  = 0;

        while (result.length < length)
        {
            let key = Random.objectKey(this.stations);

            // Give up trying to avoid duplicates, if we try more times than there are
            // stations available. Inaccurate, but good enough.
            if (tries++ >= this.stationsCount)
                result.push(key);

            // If given an exclusion list, check against both that and results
            else if ( exclude && !exclude.includes(key) && !result.includes(key) )
                result.push(key);

            // If not, just check what results we've already found
            else if ( !exclude && !result.includes(key) )
                result.push(key);
        }

        return result;
    }
}