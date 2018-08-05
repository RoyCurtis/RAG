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
     * @param codes List of station codes to join
     * @param context List's context. If 'calling', handles special case
     * @returns Pretty-printed list of given stations
     */
    public static fromStationList(codes: string[], context: string) : string
    {
        let result = '';
        let names  = codes.slice();

        names.forEach( (c, i) => names[i] = RAG.database.getStation(c, true) );

        if (names.length === 1)
            result = (context === 'calling')
                ? `${names[0]} only`
                : names[0];
        else
        {
            let lastStation = names.pop();

            result  = names.join(', ');
            result += ` and ${lastStation}`;
        }

        return result;
    }

    /**
     * Pretty-prints the given date or hours and minutes into a 24-hour time (e.g. 01:09).
     *
     * @param hours Hours, from 0 to 23, or Date object
     * @param minutes Minutes, from 0 to 59
     */
    public static fromTime(hours: number | Date, minutes: number = 0) : string
    {
        if (hours instanceof Date)
        {
            minutes = hours.getMinutes();
            hours   = hours.getHours();
        }

        return hours.toString().padStart(2, '0') + ':' +
            minutes.toString().padStart(2, '0');
    }

    /** Cleans up the given text of excess whitespace and any newlines */
    public static clean(text: string) : string
    {
        return text.trim()
            .replace(/[\n\r]/gi, '')
            .replace(/\s{2,}/gi, ' ')
            .replace(/\s([.,])/gi, '$1');
    }
}