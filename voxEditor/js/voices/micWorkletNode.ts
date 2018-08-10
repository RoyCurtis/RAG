/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Audio worklet node for processing raw microphone audio */
export class MicWorkletNode extends AudioWorkletNode
{
    constructor(context: AudioContext)
    {
        let options : AudioWorkletNodeOptions =
        {
            // Force mono input only, downmixing where possible
            channelCount          : 1,
            channelCountMode      : "explicit",
            channelInterpretation : "speakers",
            numberOfInputs        : 1,
            numberOfOutputs       : 1,
            outputChannelCount    : [1]
        };

        super(context, 'micProcessor', options);
    }
}