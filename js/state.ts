/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Disposable class that holds state for the current schedule, train, etc. */
class State
{
    private _collapsibles : Dictionary<boolean>  = {};
    private _coaches      : Dictionary<string>   = {};
    private _integers     : Dictionary<number>   = {};
    private _phrasesets   : Dictionary<number>   = {};
    private _stations     : Dictionary<string>   = {};
    private _stationLists : Dictionary<string[]> = {};

    private _excuse?   : string;
    private _platform? : Platform;
    private _named?    : string;
    private _service?  : string;
    private _time?     : string;

    constructor()
    {
        this.genState();
    }

    public getCoach(context: string) : string
    {
        if (this._coaches[context] !== undefined)
            return this._coaches[context];

        this._coaches[context] = Random.array(Phraser.LETTERS);
        return this._coaches[context];
    }

    public setCoach(context: string, coach: string) : void
    {
        this._coaches[context] = coach;
    }

    public getCollapsed(ref: string, chance: number) : boolean
    {
        if (this._collapsibles[ref] !== undefined)
            return this._collapsibles[ref];

        this._collapsibles[ref] = !Random.bool(chance);
        return this._collapsibles[ref];
    }

    public setCollapsed(ref: string, state: boolean) : void
    {
        this._collapsibles[ref] = state;
    }

    public getInteger(context: string) : number
    {
        if (this._integers[context] !== undefined)
            return this._integers[context];

        let min = 0, max = 0;

        switch(context)
        {
            case "coaches":       min = 1; max = 10;  break;
            case "delayed":       min = 5; max = 120; break;
            case "front_coaches": min = 2; max = 5;   break;
            case "rear_coaches":  min = 2; max = 5;   break;
        }

        this._integers[context] = Random.int(min, max);
        return this._integers[context];
    }

    public setInteger(context: string, value: number) : void
    {
        this._integers[context] = value;
    }

    public getPhrasesetIdx(ref: string) : number
    {
        if (this._phrasesets[ref] !== undefined)
            return this._phrasesets[ref];

        let phraseset = RAG.database.getPhraseset(ref);

        // TODO: is this safe across phraseset changes?
        if (!phraseset)
            throw new Error("Shouldn't get phraseset idx for one that doesn't exist");

        this._phrasesets[ref] = Random.int(0, phraseset.children.length);
        return this._phrasesets[ref];
    }

    public setPhrasesetIdx(ref: string, idx: number) : void
    {
        this._phrasesets[ref] = idx;
    }

    public getStation(context: string) : string
    {
        if (this._stations[context] !== undefined)
            return this._stations[context];

        this._stations[context] = RAG.database.pickStationCode();
        return this._stations[context];
    }

    public setStation(context: string, code: string) : void
    {
        this._stations[context] = code;
    }

    public getStationList(context: string) : string[]
    {
        if (this._stationLists[context] !== undefined)
            return this._stationLists[context];
        else if (context === 'calling_first')
            return this.getStationList('calling');

        let min = 1, max = 16;

        switch(context)
        {
            case "calling_split": min = 2; max = 16; break;
            case "changes":       min = 1; max = 4;  break;
            case "not_stopping":  min = 1; max = 8;  break;
        }

        this._stationLists[context] = RAG.database.pickStationCodes(min, max);
        return this._stationLists[context];
    }

    public setStationList(context: string, value: string[]) : void
    {
        this._stationLists[context] = value;

        if (context === 'calling_first')
            this._stationLists['calling'] = value;
    }

    public get excuse() : string
    {
        if (this._excuse)
            return this._excuse;

        this._excuse = RAG.database.pickExcuse();
        return this._excuse;
    }

    public set excuse(value: string)
    {
        this._excuse = value;
    }

    public get platform() : Platform
    {
        if (this._platform)
            return this._platform;

        let platform: Platform = ['', ''];

        // Only 2% chance for platform 0, since it's rare
        platform[0] = Random.bool(98)
            ? Random.int(1, 26).toString()
            : '0';

        // Only 10% chance for platform letter, since it's uncommon
        platform[1] = Random.bool(10)
            ? Random.array('ABC')
            : '';

        this._platform = platform;
        return this._platform;
    }

    public set platform(value: Platform)
    {
        this._platform = value;
    }

    public get named() : string
    {
        if (this._named)
            return this._named;

        this._named = RAG.database.pickNamed();
        return this._named;
    }

    public set named(value: string)
    {
        this._named = value;
    }

    public get service() : string
    {
        if (this._service)
            return this._service;

        this._service = RAG.database.pickService();
        return this._service;
    }

    public set service(value: string)
    {
        this._service = value;
    }

    public get time() : string
    {
        if (!this._time)
        {
            // https://stackoverflow.com/a/1214753
            let offset = Random.int(0, 59);
            let time   = new Date( new Date().getTime() + offset * 60000);
            let hour   = time.getHours().toString().padStart(2, '0');
            let minute = time.getMinutes().toString().padStart(2, '0');

            this._time = `${hour}:${minute}`;
        }

        return this._time;
    }

    public set time(value: string)
    {
        this._time = value;
    }

    /**
     * Sets up the state in a particular way, so that it makes some real-world sense.
     * To do so, we have to generate data in a particular order, and make sure to avoid
     * duplicates in inappropriate places and contexts.
     */
    private genState() : void
    {
        // Step 1. Prepopulate station lists

        let slCalling   = RAG.database.pickStationCodes(1, 16);
        let slCallSplit = RAG.database.pickStationCodes(2, 16, slCalling);
        let allCalling  = [...slCalling, ...slCallSplit];

        // List of other stations found via a specific calling point
        let slChanges     = RAG.database.pickStationCodes(1, 4, allCalling);
        // List of other stations that this train usually serves, but currently isn't
        let slNotStopping = RAG.database.pickStationCodes(1, 8,
            [...allCalling, ...slChanges]
        );

        // Take a random slice from the calling list, to identify as request stops
        let reqCount   = Random.int(1, slCalling.length - 1);
        let slRequests = slCalling.slice(0, reqCount);

        this.setStationList('calling',       slCalling);
        this.setStationList('calling_split', slCallSplit);
        this.setStationList('changes',       slChanges);
        this.setStationList('not_stopping',  slNotStopping);
        this.setStationList('request',       slRequests);

        // Step 2. Prepopulate stations

        // Any station may be blamed for an excuse, even ones already picked
        let stExcuse  = RAG.database.pickStationCode();
        // Destination is final call of the calling list
        let stDest    = slCalling[slCalling.length - 1];
        // Via is a call before the destination, or one in the split list if too small
        let stVia     = slCalling.length > 1
            ? Random.array( slCalling.slice(0, -1)   )
            : Random.array( slCallSplit.slice(0, -1) );
        // Ditto for picking a random calling station as a single request or change stop
        let stCalling = slCalling.length > 1
            ? Random.array( slCalling.slice(0, -1)   )
            : Random.array( slCallSplit.slice(0, -1) );

        // Destination (last call) of the split train's second half of the list
        let stDestSplit = slCallSplit[slCallSplit.length - 1];
        // Random non-destination stop of the split train's second half of the list
        let stViaSplit  = Random.array( slCallSplit.slice(0, -1) );
        // Where the train comes from, so can't be on any lists or prior stations
        let stSource    = RAG.database.pickStationCode([
            ...allCalling, ...slChanges, ...slNotStopping, ...slRequests,
            stCalling, stDest, stVia, stDestSplit, stViaSplit
        ]);

        this.setStation('calling',           stCalling);
        this.setStation('destination',       stDest);
        this.setStation('destination_split', stDestSplit);
        this.setStation('excuse',            stExcuse);
        this.setStation('source',            stSource);
        this.setStation('via',               stVia);
        this.setStation('via_split',         stViaSplit);

        // Step 3. Prepopulate integers

    }
}