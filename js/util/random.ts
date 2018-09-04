/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Utility methods for generating random data */
class Random
{
    /**
     * Picks a random integer from the given range.
     *
     * @param min Minimum integer to pick, inclusive
     * @param max Maximum integer to pick, inclusive
     * @returns Random integer within the given range
     */
    public static int(min: number = 0, max: number = 1) : number
    {
        return Math.round( Math.random() * (max - min) ) + min;
    }

    /** Picks a random element from a given array-like object with a length property */
    public static array(arr: Lengthable) : any
    {
        return arr[ Random.int(0, arr.length - 1) ];
    }

    /** Splices a random element from a given array */
    public static arraySplice<T>(arr: T[]) : T
    {
        return arr.splice(Random.int(0, arr.length - 1), 1)[0];
    }

    /** Picks a random key from a given object */
    public static objectKey(obj: {}) : any
    {
        return Random.array( Object.keys(obj) );
    }

    /**
     * Picks true or false.
     *
     * @param chance Chance out of 100, to pick `true`
     */
    public static bool(chance: number = 50) : boolean
    {
        return Random.int(0, 100) < chance;
    }
}
