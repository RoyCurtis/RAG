/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Utility methods for dealing with strings */
class Strings
{
    /** Checks if the given string is null, or empty (whitespace only or zero-length) */
    public static isNullOrEmpty(str: string | null | undefined) : boolean
    {
        return !str || !str.trim();
    }
}