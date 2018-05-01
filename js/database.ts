/// <reference path="util/random.ts" />
/// <reference path="util/types.ts" />

class Database
{
    private excuses  : string[]   = [];
    private named    : string[]   = [];
    private services : string[]   = [];
    private stations : StationsDB = {};

    constructor(config: RAGConfig)
    {
        this.excuses  = config.excusesData;
        this.named    = config.namedData;
        this.services = config.servicesData;
        this.stations = config.stationsData;

        console.log("[Database] Entries loaded:");
        console.log("\tExcuses:",      this.excuses.length);
        console.log("\tNamed trains:", this.named.length);
        console.log("\tServices:",     this.services.length);
        console.log("\tStations:",     Object.keys(this.stations).length);
    }

    public pickExcuse(): string
    {
        return Random.array(this.excuses);
    }

    public pickNamed(): string
    {
        return Random.array(this.named);
    }

    public pickService(): string
    {
        return Random.array(this.services);
    }

    public pickStation(): string
    {
        let code = Random.objectKey(this.stations);

        return this.stations[code];
    }
}