/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Disposable class that holds state for the current schedule, train, etc. */
class State
{
    private platform?: Platform;

    public getPlatform(): Platform
    {
        if (!this.platform)
            this.platform = new Platform();

        return this.platform;
    }
}

class Platform
{
    public digit:  number;
    public letter: string;

    constructor()
    {
        // Only 2% chance for platform 0, since it's rare
        this.digit = Random.bool(98)
            ? Random.int(1, 26)
            : 0;

        // Only 10% chance for platform letter, since it's uncommon
        this.letter = Random.bool(10)
            ? Random.array('ABC')
            : '';
    }

    public toString() : string
    {
        return `${this.digit}${this.letter}`;
    }
}