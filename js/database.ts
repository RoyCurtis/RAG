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

    public pickStations(min = 1, max = 16): string[]
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