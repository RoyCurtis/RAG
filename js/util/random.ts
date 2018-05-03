/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Utility methods for generating random data */
class Random
{
    /**
     * Picks a random integer from the given range.
     *
     * @param {number} min Minimum integer to pick, inclusive
     * @param {number} max Maximum integer to pick, inclusive
     * @returns {number}
     */
    public static int(min: number = 0, max: number = 1) : number
    {
        return Math.floor( Math.random() * (max - min) ) + min;
    }

    /** Picks a random element from a given array-like object with a length property */
    public static array(arr: Lengthable) : any
    {
        let idx: number = Random.int(0, arr.length);

        return arr[idx];
    }

    /** Picks a random key from a given object */
    public static objectKey(obj: {}) : any
    {
        return Random.array( Object.keys(obj) );
    }

    /**
     * Picks true or false.
     *
     * @param {number} chance Chance out of 100, to pick `true`
     * @returns {boolean}
     */
    public static bool(chance: number = 50) : boolean
    {
        return Random.int(0, 100) < chance;
    }
}
