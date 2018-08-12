/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Represents a request for a vox file, immediately begun on creation */
class VoxRequest
{
    /** Relative remote path of this voice file request */
    public readonly path : string;

    /** Whether this request is done and ready for handling (even if failed) */
    public isDone  : boolean = false;
    /** Raw audio data from the loaded file, if available */
    public buffer? : AudioBuffer;

    public constructor(path: string)
    {
        console.debug('VOX REQUEST:', path);
        this.path = path;

        fetch(path)
            .then ( this.onFulfill.bind(this) )
            .catch( this.onError.bind(this)   );
    }

    /** Cancels this request from proceeding any further */
    public cancel() : void
    {
        // TODO: Cancellation controllers
    }

    /** Begins decoding the loaded MP3 voice file to raw audio data */
    private onFulfill(res: Response) : void
    {
        if (!res.ok)
            throw Error(`VOX NOT FOUND: ${res.status} @ ${this.path}`);

        res.arrayBuffer().then( this.onArrayBuffer.bind(this) );
    }

    /** Takes the array buffer from the fulfilled fetch and decodes it */
    private onArrayBuffer(buffer: ArrayBuffer) : void
    {
        Sounds.decode(RAG.speech.voxEngine.audioContext, buffer)
            .then ( this.onDecode.bind(this) )
            .catch( this.onError.bind(this)  );
    }

    /** Called when the fetched buffer is decoded successfully */
    private onDecode(buffer: AudioBuffer) : void
    {
        this.buffer = buffer;
        this.isDone = true;
    }

    /** Called if the fetch or decode stages fail */
    private onError(err: any) : void
    {
        console.log('REQUEST FAIL:', err);
        this.isDone = true;
    }
}