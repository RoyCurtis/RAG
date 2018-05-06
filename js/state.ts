/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Disposable class that holds state for the current schedule, train, etc. */
class State
{
    private _platform?: string;

    get platform(): string
    {
        if (!this._platform)
        {
            // Only 2% chance for platform 0, since it's rare
            this._platform = Random.bool(98)
                ? Random.int(1, 26).toString()
                : '0';

            // Only 10% chance for platform letter, since it's uncommon
            if ( Random.bool(10) )
                this._platform += Random.array('ABC');
        }

        return this._platform;
    }

    set platform(value: string)
    {
        this._platform = value;
    }
}