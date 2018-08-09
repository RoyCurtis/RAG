/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Library that encodes audio data into MP3 format blobs and files */
declare namespace lamejs
{
    export class Mp3Encoder
    {
        constructor(channels: number, sampleRate: number, bitRate: number);

        /** Encodes the given raw PCM data to MP3 mid data */
        public encodeBuffer(left: Int16Array, right?: Int16Array) : Int8Array;

        /** Encodes the end part of the MP3 data */
        public flush() : Int8Array;
    }
}
