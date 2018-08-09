/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */


import * as fs from "fs";

/** Utility methods for file system management */
export class Files
{
    public static isDir(path: string) : boolean
    {
        return fs.lstatSync(path).isDirectory();
    }
}