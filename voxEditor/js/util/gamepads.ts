/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Delegate type for Gamepads event handlers */
type GamepadEventHandler = (event: GamepadEvent) => void;

interface GamepadEvent
{
    button  : string;
    index   : number;
    pressed : boolean;
    value   : number;
    gamepad : Gamepad;
}

/** Utility wrapper around gamepads, for better API */
export class Gamepads
{
    /** Enum mapping button indexes to standard XBox controller names */
    private static readonly XBOX_BUTTONS : string[] = [
        'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start',
        'LS', 'RS', 'Up', 'Down', 'Left', 'Right', 'Guide'
    ];

    public static onbuttondown? : GamepadEventHandler;

    public static onbuttonhold? : GamepadEventHandler;

    /** Reference number for the current gamepad polling timer */
    private static timer : number = 0;
    /** Whether this class has been initialized */
    private static ready : boolean = false;

    public static init() : void
    {
        if (Gamepads.ready)
            return;

        window.addEventListener('gamepadconnected',    Gamepads.onChange);
        window.addEventListener('gamepaddisconnected', Gamepads.onChange);
        Gamepads.ready = true;
    }

    private static onChange(_: Event) : void
    {
        // Stop any ongoing polling
        window.clearTimeout(Gamepads.timer);

        // Only setup a timer if at least one controller is available
        for (let i = 0, pads = navigator.getGamepads(); i < pads.length; i++)
        if  (pads[i])
            Gamepads.poll();
    }

    private static buttons : [boolean, number][] = [];

    private static poll() : void
    {
        // 50ms polling interval, don't need 60fps accuracy
        Gamepads.timer = window.setTimeout(Gamepads.poll, 50);

        // Do nothing if document isn't focused
        if ( !document.hasFocus() )
            return;

        // Get the first available pad
        let pad : Gamepad = Array.prototype.find
            .call(navigator.getGamepads(), (v : any) => v);

        let oldButtons = Gamepads.buttons;
        let fire       = Gamepads.fire;

        // Scan buttons for changes
        pad.buttons.forEach( (b, i) =>
        {
            // Populating state for the first time, track but do nothing
            if (!oldButtons[i])
            {
                oldButtons[i] = [b.pressed, b.value];
                return;
            }

            if (b.pressed && !oldButtons[i][0] && Gamepads.onbuttondown)
                fire(Gamepads.onbuttondown, i, pad);

            if (b.pressed && Gamepads.onbuttonhold)
                fire(Gamepads.onbuttonhold, i, pad);

            // Update state
            oldButtons[i] = [b.pressed, b.value];
        });
    }

    private static fire(handler: GamepadEventHandler, i: number, pad: Gamepad) : void
    {
        handler({
            button  : Gamepads.XBOX_BUTTONS[i],
            index   : i,
            pressed : pad.buttons[i].pressed,
            value   : pad.buttons[i].value,
            gamepad : pad
        });
    }
}