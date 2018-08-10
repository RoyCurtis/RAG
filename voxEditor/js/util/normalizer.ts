/**
 * This file is an adaptation, by Roy Curits, of audio.js code. audio.js is written by
 * the audio.js team, including Dmitry Yv, Jamen Marz, Daniel Gómez Blasco, and
 * Michael Williams.
 *
 * audio.js, https://github.com/audiojs/audio, MIT license
 */

/**
 * Utility class for normalizing a given audio buffer.
 *
 * Adapted from https://github.com/audiojs/audio/blob/master/src/manipulations.js#L226
 */
export class Normalizer
{
    /** https://github.com/audiojs/audio/blob/master/src/manipulations.js#L226 */
    public static process(buffer: AudioBuffer) : void
    {
        let range = this.limits(buffer);
        let max   = Math.max( Math.abs(range[0]), Math.abs(range[1]) );
        let amp   = Math.max(1 / max, 1);
        let data  = buffer.getChannelData(0);
        let len   = data.length;

        for (let i = 0; i < len; i++)
            data[i] = Normalizer.clamp(data[i] * amp, -1, 1);
    }

    /** https://github.com/audiojs/audio/blob/master/src/metrics.js#L21 */
    private static limits(buffer: AudioBuffer) : [number, number]
    {
        let max = -1,
            min =  1;

        let data = buffer.getChannelData(0);
        let len  = data.length;

        for (let i = 0; i < len; i++)
        {
            if (data[i] > max) max = data[i];
            if (data[i] < min) min = data[i];
        }

        return [min, max];
    }

    /** https://github.com/hughsk/clamp/blob/master/index.js */
    private static clamp(value: number, min: number, max: number) : number
    {
        return min < max
            ? (value < min ? min : value > max ? max : value)
            : (value < max ? max : value > min ? min : value);
    }
}