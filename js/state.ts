/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Disposable class that holds state for the current schedule, train, etc. */
class State
{
    /** State of collapsible elements. Key is reference ID, value is collapsed. */
    private _collapsibles : Dictionary<boolean>  = {};
    /** Current coach letter choices. Key is context ID, value is letter. */
    private _coaches      : Dictionary<string>   = {};
    /** Current integer choices. Key is context ID, value is integer. */
    private _integers     : Dictionary<number>   = {};
    /** Current phraseset phrase choices. Key is reference ID, value is index. */
    private _phrasesets   : Dictionary<number>   = {};
    /** Current service choices. Key is context ID, value is service. */
    private _services     : Dictionary<string>   = {};
    /** Current station choices. Key is context ID, value is station code. */
    private _stations     : Dictionary<string>   = {};
    /** Current station list choices. Key is context ID, value is array of codes. */
    private _stationLists : Dictionary<string[]> = {};

    /** Currently chosen excuse */
    private _excuse?   : string;
    /** Currently chosen platform */
    private _platform? : Platform;
    /** Currently chosen named train */
    private _named?    : string;
    /** Currently chosen train time */
    private _time?     : string;

    /**
     * Gets the currently chosen coach letter, or randomly picks one from A to Z.
     *
     * @param context Context ID to get or choose the letter for
     */
    public getCoach(context: string) : string
    {
        if (this._coaches[context] !== undefined)
            return this._coaches[context];

        this._coaches[context] = Random.array(L.LETTERS);
        return this._coaches[context];
    }

    /**
     * Sets a coach letter.
     *
     * @param context Context ID to set the letter for
     * @param coach Value to set
     */
    public setCoach(context: string, coach: string) : void
    {
        this._coaches[context] = coach;
    }

    /**
     * Gets the collapse state of a collapsible, or randomly picks one.
     *
     * @param ref Reference ID to get the collapsible state of
     * @param chance Chance between 0 and 100 of choosing true, if unset
     */
    public getCollapsed(ref: string, chance: number) : boolean
    {
        if (this._collapsibles[ref] !== undefined)
            return this._collapsibles[ref];

        this._collapsibles[ref] = !Random.bool(chance);
        return this._collapsibles[ref];
    }

    /**
     * Sets a collapsible's state.
     *
     * @param ref Reference ID to set the collapsible state of
     * @param state Value to set, where true is "collapsed"
     */
    public setCollapsed(ref: string, state: boolean) : void
    {
        this._collapsibles[ref] = state;
    }

    /**
     * Gets the currently chosen integer, or randomly picks one.
     *
     * @param context Context ID to get or choose the integer for
     */
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

    /**
     * Sets an integer.
     *
     * @param context Context ID to set the integer for
     * @param value Value to set
     */
    public setInteger(context: string, value: number) : void
    {
        this._integers[context] = value;
    }

    /**
     * Gets the currently chosen phrase of a phraseset, or randomly picks one.
     *
     * @param ref Reference ID to get or choose the phraseset's phrase of
     */
    public getPhrasesetIdx(ref: string) : number
    {
        if (this._phrasesets[ref] !== undefined)
            return this._phrasesets[ref];

        let phraseset = RAG.database.getPhraseset(ref);

        // TODO: is this safe across phraseset changes?
        if (!phraseset)
            throw Error( L.STATE_NONEXISTANT_PHRASESET(ref) );

        this._phrasesets[ref] = Random.int(0, phraseset.children.length);
        return this._phrasesets[ref];
    }

    /**
     * Sets the chosen index for a phraseset.
     *
     * @param ref Reference ID to set the phraseset index of
     * @param idx Index to set
     */
    public setPhrasesetIdx(ref: string, idx: number) : void
    {
        this._phrasesets[ref] = idx;
    }

    /**
     * Gets the currently chosen service, or randomly picks one.
     *
     * @param context Context ID to get or choose the service for
     */
    public getService(context: string) : string
    {
        if (this._services[context] !== undefined)
            return this._services[context];

        this._services[context] = RAG.database.pickService();
        return this._services[context];
    }

    /**
     * Sets a service.
     *
     * @param context Context ID to set the service for
     * @param service Value to set
     */
    public setService(context: string, service: string) : void
    {
        this._services[context] = service;
    }

    /**
     * Gets the currently chosen station code, or randomly picks one.
     *
     * @param context Context ID to get or choose the station for
     */
    public getStation(context: string) : string
    {
        if (this._stations[context] !== undefined)
            return this._stations[context];

        this._stations[context] = RAG.database.pickStationCode();
        return this._stations[context];
    }

    /**
     * Sets a station code.
     *
     * @param context Context ID to set the station code for
     * @param code Station code to set
     */
    public setStation(context: string, code: string) : void
    {
        this._stations[context] = code;
    }

    /**
     * Gets the currently chosen list of station codes, or randomly generates one.
     *
     * @param context Context ID to get or choose the station list for
     */
    public getStationList(context: string) : string[]
    {
        if (this._stationLists[context] !== undefined)
            return this._stationLists[context];
        else if (context === 'calling_first')
            return this.getStationList('calling');

        let min = 1, max = 16;

        switch(context)
        {
            case 'calling_split': min = 2; max = 16; break;
            case 'changes':       min = 1; max = 4;  break;
            case 'not_stopping':  min = 1; max = 8;  break;
        }

        this._stationLists[context] = RAG.database.pickStationCodes(min, max);
        return this._stationLists[context];
    }

    /**
     * Sets a list of station codes.
     *
     * @param context Context ID to set the station code list for
     * @param codes Station codes to set
     */
    public setStationList(context: string, codes: string[]) : void
    {
        this._stationLists[context] = codes;

        if (context === 'calling_first')
            this._stationLists['calling'] = codes;
    }

    /** Gets the chosen excuse, or randomly picks one */
    public get excuse() : string
    {
        if (this._excuse)
            return this._excuse;

        this._excuse = RAG.database.pickExcuse();
        return this._excuse;
    }

    /** Sets the current excuse */
    public set excuse(value: string)
    {
        this._excuse = value;
    }

    /** Gets the chosen platform, or randomly picks one */
    public get platform() : Platform
    {
        if (this._platform)
            return this._platform;

        let platform : Platform = ['', ''];

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

    /** Sets the current platform */
    public set platform(value: Platform)
    {
        this._platform = value;
    }

    /** Gets the chosen named train, or randomly picks one */
    public get named() : string
    {
        if (this._named)
            return this._named;

        this._named = RAG.database.pickNamed();
        return this._named;
    }

    /** Sets the current named train */
    public set named(value: string)
    {
        this._named = value;
    }

    /** Gets the chosen time, or randomly picks one within 59 minutes from now */
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

    /** Sets the current time */
    public set time(value: string)
    {
        this._time = value;
    }

    /**
     * Sets up the state in a particular way, so that it makes some real-world sense.
     * To do so, we have to generate data in a particular order, and make sure to avoid
     * duplicates in inappropriate places and contexts.
     */
    public genDefaultState() : void
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

        // Step 3. Prepopulate coach numbers

        let intCoaches = this.getInteger('coaches');

        // If there are enough coaches, just split the number down the middle instead.
        // Else, front and rear coaches will be randomly picked (without making sense)
        if (intCoaches >= 4)
        {
            let intFrontCoaches = (intCoaches / 2) | 0;
            let intRearCoaches  = intCoaches - intFrontCoaches;

            this.setInteger('front_coaches', intFrontCoaches);
            this.setInteger('rear_coaches', intRearCoaches);
        }

        // If there are enough coaches, assign coach letters for contexts.
        // Else, letters will be randomly picked (without making sense)
        if (intCoaches >= 4)
        {
            let letters = L.LETTERS.slice(0, intCoaches).split('');

            this.setCoach( 'first',     Random.arraySplice(letters) );
            this.setCoach( 'shop',      Random.arraySplice(letters) );
            this.setCoach( 'standard1', Random.arraySplice(letters) );
            this.setCoach( 'standard2', Random.arraySplice(letters) );
        }

        // Step 4. Prepopulate services

        // If there is more than one service, pick one to be the "main" and one to be the
        // "alternate", else the one service will be used for both (without making sense).
        if (RAG.database.services.length > 1)
        {
            let services = RAG.database.services.slice();

            this.setService( 'provider',    Random.arraySplice(services) );
            this.setService( 'alternative', Random.arraySplice(services) );
        }
    }
}