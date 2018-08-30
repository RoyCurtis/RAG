/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Manages data for excuses, trains, services and stations */
class Database
{
    /** Loaded dataset of delay or cancellation excuses */
    public  readonly excuses       : string[];
    /** Loaded dataset of named trains */
    public  readonly named         : string[];
    /** Loaded dataset of service or network names */
    public  readonly services      : string[];
    /** Loaded dictionary of station names, with three-letter code keys (e.g. ABC) */
    public  readonly stations      : Dictionary<Station>;
    /** Loaded XML document containing phraseset data */
    public  readonly phrasesets    : Document;
    /** Amount of stations in the currently loaded dataset */
    private readonly stationsCount : number;

    public constructor(dataRefs: DataRefs)
    {
        let query  = dataRefs.phrasesetEmbed;
        let iframe = DOM.require <HTMLIFrameElement> (query);

        if (!iframe.contentDocument)
            throw Error( L.DB_ELEMENT_NOT_PHRASESET_IFRAME(query) );

        this.phrasesets    = iframe.contentDocument;
        this.excuses       = dataRefs.excusesData;
        this.named         = dataRefs.namedData;
        this.services      = dataRefs.servicesData;
        this.stations      = dataRefs.stationsData;
        this.stationsCount = Object.keys(this.stations).length;

        console.log('[Database] Entries loaded:');
        console.log('\tExcuses:',      this.excuses.length);
        console.log('\tNamed trains:', this.named.length);
        console.log('\tServices:',     this.services.length);
        console.log('\tStations:',     this.stationsCount);
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

    /**
     * Clones and gets phrase with the given ID, or null if it doesn't exist.
     *
     * @param id ID of the phrase to get
     */
    public getPhrase(id: string) : HTMLElement | null
    {
        let result = this.phrasesets.querySelector('phrase#' + id) as HTMLElement;

        if (result)
            result = result.cloneNode(true) as HTMLElement;

        return result;
    }

    /**
     * Gets a phraseset with the given ID, or null if it doesn't exist. Note that the
     * returned phraseset comes from the XML document, so it should not be mutated.
     *
     * @param id ID of the phraseset to get
     */
    public getPhraseset(id: string) : HTMLElement | null
    {
        return this.phrasesets.querySelector('phraseset#' + id);
    }

    /** Picks a random rail network name */
    public pickService() : string
    {
        return Random.array(this.services);
    }

    /**
     * Picks a random station code from the dataset.
     *
     * @param exclude List of codes to exclude. May be ignored if search takes too long.
     */
    public pickStationCode(exclude?: string[]) : string
    {
        // Give up finding random station that's not in the given list, if we try more
        // times then there are stations. Inaccurate, but avoids infinite loops.
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
     * @param code Three-letter station code to get the name of
     * @returns Station name for the given code
     */
    public getStation(code: string) : string
    {
        let station = this.stations[code];

        if (!station)
            return L.DB_UNKNOWN_STATION(code);

        if (typeof station === 'string')
            return Strings.isNullOrEmpty(station)
                ? L.DB_EMPTY_STATION(code)
                : station;
        else
            return !station.name
                ? L.DB_EMPTY_STATION(code)
                : station.name;
    }

    /**
     * Gets the given station code's vox alias, if any. A vox alias is the code of another
     * station's voice file, that the given code should use instead. This is used for
     * stations with duplicate names.
     *
     * @param code Station code to get the vox alias of
     * @returns The alias code, else the given code
     */
    public getStationVox(code: string) : string
    {
        let station = this.stations[code];

        // Unknown station
        if      (!station)
            return '???';
        // Station is just a string; assume no alias
        else if (typeof station === 'string')
            return code;
        else
            return either(station.voxAlias, code);
    }

    /**
     * Picks a random range of station codes, ensuring there are no duplicates.
     *
     * @param min Minimum amount of stations to pick
     * @param max Maximum amount of stations to pick
     * @param exclude
     * @returns A list of unique station names
     */
    public pickStationCodes(min = 1, max = 16, exclude? : string[]) : string[]
    {
        if (max - min > Object.keys(this.stations).length)
            throw Error( L.DB_TOO_MANY_STATIONS() );

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