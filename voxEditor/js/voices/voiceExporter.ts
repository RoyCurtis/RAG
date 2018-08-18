/**
 * This file uses code from audiobuffer-to-wav, which adapted the code from Recorder.js.
 * By Matt DesLauriers and Matt Diamond. MIT license. Ported to TypeScript by Roy Curtis.
 *
 * Rail Announcements Generator. By Roy Curtis, MIT license, 2018
 */

import Mp3Encoder = lamejs.Mp3Encoder;
import * as fs from "fs";

/** Disposable class for exporting an audio buffer to various formats */
export class VoiceExporter
{
    private buffer : AudioBuffer;

    public constructor(buffer: AudioBuffer)
    {
        this.buffer = buffer;
    }

    public write(path: string, format: string)
    {
        if (format !== 'mp3' && format !== 'wav')
            return;

        let channel = this.buffer.getChannelData(0);

        // First, soften the end of the data with fades

        if  (length > 512)
        for (let i = 0; i < 512; i++)
            channel[length - i] *= (1 / 512) * i;

        // Then, encode to the asked format

        let bytes = (format === 'mp3')
            ? this.encodeMP3(channel)
            : this.encodeWAV(channel);

        // Finally, save

        fs.writeFileSync(path, bytes, { encoding : null });
    }

    private encodeMP3(channel: Float32Array) : Buffer
    {
        // First, convert the clip data from -1..1 floats to -32768..32767 integers
        let blocks : Int8Array[] = [];

        let encoder    = new Mp3Encoder(1, this.buffer.sampleRate, 128);
        let intChannel = new Int16Array(channel.length);
        let blockSize  = 1152;
        let totalSize  = 0;

        for (let i = 0; i < channel.length; i++)
        {
            let s = Math.max( -1, Math.min(1, channel[i]) );
            intChannel[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Then, encode the clip's data into mp3 chunks

        for (let i = 0; i < channel.length; i += blockSize)
        {
            let bufBlock = intChannel.subarray(i, i + blockSize);
            let mp3Block = encoder.encodeBuffer(bufBlock);

            if (mp3Block.length > 0)
            {
                blocks.push(mp3Block);
                totalSize += mp3Block.length;
            }
        }

        // Then, finalize the MP3

        let finalBlock = encoder.flush();

        if (finalBlock.length > 0)
        {
            blocks.push(finalBlock);
            totalSize += finalBlock.length;
        }

        // Then, write it to disk

        let bytes  = Buffer.alloc(totalSize);
        let offset = 0;

        blocks.forEach(block =>
        {
            bytes.set(block, offset);
            offset += block.length;
        });

        return bytes;
    }

    /**
     *
     * @see https://github.com/Jam3/audiobuffer-to-wav/blob/master/index.js
     * @param channel
     */
    private encodeWAV(channel: Float32Array) : Buffer
    {
        let bitDepth       = 16;
        let sampleRate     = this.buffer.sampleRate;
        let bytesPerSample = bitDepth / 8;
        let buffer         = Buffer.alloc(44 + channel.length * bytesPerSample);

        /* RIFF identifier */
        buffer.write('RIFF', 0, 4, 'ascii');
        /* RIFF chunk length */
        buffer.writeUInt32LE(36 + channel.length * bytesPerSample, 4);
        /* RIFF type */
        buffer.write('WAVE', 8, 4, 'ascii');
        /* format chunk identifier */
        buffer.write('fmt ', 12, 4, 'ascii');
        /* format chunk length */
        buffer.writeUInt32LE(16, 16);
        /* sample format (raw) */
        buffer.writeUInt16LE(1, 20);
        /* channel count */
        buffer.writeUInt16LE(1, 22);
        /* sample rate */
        buffer.writeUInt32LE(sampleRate, 24);
        /* byte rate (sample rate * block align) */
        buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
        /* block align (channel count * bytes per sample) */
        buffer.writeUInt16LE(bytesPerSample, 32);
        /* bits per sample */
        buffer.writeUInt16LE(bitDepth, 34);
        /* data chunk identifier */
        buffer.write('data', 36, 4, 'ascii');
        /* data chunk length */
        buffer.writeUInt32LE(channel.length * bytesPerSample, 40);

        // floatTo16BitPCM
        let offset = 44;

        for (let i = 0; i < channel.length; i++, offset += 2)
        {
            let s = Math.max( -1, Math.min(1, channel[i]) );
            buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, offset);
        }

        return buffer;
    }
}