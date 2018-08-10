/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

class MicWorklet extends AudioWorkletProcessor
{
    constructor()
    {
        super();
    }

    public process(
            inputs: SampleChannels,
            _:      SampleChannels,
            __:     Dictionary<Float32Array>
    ) : boolean
    {
        // Skip null segments
        if (inputs[0][0][0] === 0 || inputs[0][0][127] === 0)
            return true;

        this.port!.postMessage(inputs[0][0].buffer, [inputs[0][0].buffer]);
        return true;
    }
}

// TypeScript reports that MicWorklet doesn't define 'process()' and I don't know why...
// @ts-ignore
registerProcessor('micProcessor', MicWorklet);