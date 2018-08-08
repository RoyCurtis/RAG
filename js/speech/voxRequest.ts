/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Represents a request for a vox file */
class VoxRequest
{
    public isDone : boolean = false;

    public data?  : Blob;

    private readonly path : string;

    public constructor(path: string)
    {
        this.path = path;

        fetch(path)
            .then ( this.onFulfill.bind(this) )
            .catch( this.onError.bind(this)   );
    }

    public cancel() : void
    {

    }

    private onFulfill(res: Response) : void
    {

        if (res.status === 404)
            return console.log('VOX NOT FOUND:', this.path);

        res.blob().then(b =>
        {
            this.data   = b;
            this.isDone = true;
        });
    }

    private onError(err: any) : void
    {
        console.log('REQUEST FAIL:', err);
        this.isDone = true;
    }
}