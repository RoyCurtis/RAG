/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Utility methods for dealing with strings */
class Strings
{
    /** Checks if the given string is null, or empty (whitespace only or zero-length) */
    public static isNullOrEmpty(str: string | null | undefined) : boolean
    {
        return !str || !str.trim();
    }

    /**
     * Pretty-print's a given list of stations, with context sensitive extras.
     *
     * @param {string[]} stations List of station names to join
     * @param {string} context List's context. If 'calling', handles special case
     * @returns {string} Pretty-printed list of given stations
     */
    public static fromStationList(stations: string[], context: string) : string
    {
        let result = '';

        if (stations.length === 1)
            result = (context === 'calling')
                ? `${stations[0]} only`
                : stations[0];
        else
        {
            let lastStation = stations.pop();

            result  = stations.join(', ');
            result += ` and ${lastStation}`;
        }

        return result;
    }
}