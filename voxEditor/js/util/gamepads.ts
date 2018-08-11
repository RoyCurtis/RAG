/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Delegate type for Gamepads event handlers */
type GamepadEventHandler = (event: GamepadButtonEvent) => void;

/** Event data container for gamepad button events */
export interface GamepadButtonEvent
{
    button  : string;
    index   : number;
    pressed : boolean;
    value   : number;
    gamepad : Gamepad;
}

/** Constants class for Xbox controller mappings. Could not get enums to work. */
export class XBOX
{
    public static readonly A     = 'A';
    public static readonly B     = 'B';
    public static readonly X     = 'X';
    public static readonly Y     = 'Y';
    public static readonly LB    = 'LB';
    public static readonly RB    = 'RB';
    public static readonly LT    = 'LT';
    public static readonly RT    = 'RT';
    public static readonly Back  = 'Back';
    public static readonly Start = 'Start';
    public static readonly LS    = 'LS';
    public static readonly RS    = 'RS';
    public static readonly Up    = 'Up';
    public static readonly Down  = 'Down';
    public static readonly Left  = 'Left';
    public static readonly Right = 'Right';
    public static readonly Guide = 'Guide';

    /** Enum mapping button indexes to standard XBox controller names */
    public static readonly BUTTONS : string[] = [
        XBOX.A, XBOX.B, XBOX.X, XBOX.Y, XBOX.LB, XBOX.RB, XBOX.LT, XBOX.RT, XBOX.Back,
        XBOX.Start, XBOX.LS, XBOX.RS, XBOX.Up, XBOX.Down, XBOX.Left, XBOX.Right,
        XBOX.Guide
    ];
}

/** Utility wrapper around gamepads, for better API */
export class Gamepads
{
    /** Registered handler for when gamepad buttons are pressed down */
    public static onbuttondown? : GamepadEventHandler;
    /** Repeating registered handler for when gamepad buttons are held down */
    public static onbuttonhold? : GamepadEventHandler;
    /** Registered handler for when gamepad buttons are released */
    public static onbuttonup?   : GamepadEventHandler;

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
        cancelAnimationFrame(Gamepads.timer);

        // Only setup a timer if at least one controller is available
        for (let i = 0, pads = navigator.getGamepads(); i < pads.length; i++)
        if  (pads[i])
            Gamepads.poll();
    }

    private static buttons : [boolean, number][] = [];

    private static poll() : void
    {
        Gamepads.timer = requestAnimationFrame(Gamepads.poll);

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

            if      (Gamepads.onbuttondown &&  b.pressed && !oldButtons[i][0])
                fire(Gamepads.onbuttondown, i, pad);
            else if (Gamepads.onbuttonhold &&  b.pressed)
                fire(Gamepads.onbuttonhold, i, pad);
            else if (Gamepads.onbuttonup   && !b.pressed &&  oldButtons[i][0])
                fire(Gamepads.onbuttonup,   i, pad);

            // Update state
            oldButtons[i] = [b.pressed, b.value];
        });
    }

    private static fire(handler: GamepadEventHandler, i: number, pad: Gamepad) : void
    {
        handler({
            button  : XBOX.BUTTONS[i],
            index   : i,
            pressed : pad.buttons[i].pressed,
            value   : pad.buttons[i].value,
            gamepad : pad
        });
    }
}