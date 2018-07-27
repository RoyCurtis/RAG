/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Utility methods for parsing data from strings */
class Parse
{
    /** Parses a given string into a boolean */
    public static boolean(str: string) : boolean
    {
        str = str.toLowerCase();

        if (str === 'true' || str === '1')
            return true;
        if (str === 'false' || str === '0')
            return false;

        throw Error( L.BAD_BOOLEAN(str) );
    }
}