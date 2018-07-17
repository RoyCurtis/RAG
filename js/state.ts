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

    public getInteger(id: string, min: number, max: number) : number
    {
        if (this._integers[id] !== undefined)
            return this._integers[id];

        this._integers[id] = Random.int(min, max);
        return this._integers[id];
    }

    public setInteger(id: string, value: number) : void
    {
        this._integers[id] = value;
    }

    // TODO: Make "phraseSet" consistent to "phraseset"
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

        let min = 1, max = 16;

        switch(context)
        {
            case "calling_half1":
            case "calling_half2":
                min = 2; max = 5; break;
            case "changes":
                min = 1; max = 4; break;
            case "not_stopping":
                min = 1; max = 8; break;
        }

        this._stationLists[context] = RAG.database.pickStations(min, max);
        return this._stationLists[context];
    }

    public setStationList(context: string, value: string[]) : void
    {
        this._stationLists[context] = value;
    }

    // TODO: these are all missing visibility
    get excuse() : string
    {
        if (this._excuse)
            return this._excuse;

        this._excuse = RAG.database.pickExcuse();
        return this._excuse;
    }

    set excuse(value: string)
    {
        this._excuse = value;
    }

    get platform() : Platform
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

    set platform(value: Platform)
    {
        this._platform = value;
    }

    get named() : string
    {
        if (this._named)
            return this._named;

        this._named = RAG.database.pickNamed();
        return this._named;
    }

    set named(value: string)
    {
        this._named = value;
    }

    get service() : string
    {
        if (this._service)
            return this._service;

        this._service = RAG.database.pickService();
        return this._service;
    }

    set service(value: string)
    {
        this._service = value;
    }

    get time() : string
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

    set time(value: string)
    {
        this._time = value;
    }
}