/// <reference path="types.ts" />

class Random
{
    public static int(min: number = 0, max: number = 1) : number
    {
        return Math.floor( Math.random() * (max - min) ) + min;
    }

    public static array(arr: Lengthable) : any
    {
        let idx: number = Random.int(0, arr.length);

        return arr[idx];
    }

    public static objectKey(obj: {}) : any
    {
        return Random.array( Object.keys(obj) );
    }

    public static bool(chance: number = 50) : boolean
    {
        return Random.int(0, 100) < chance;
    }
}
