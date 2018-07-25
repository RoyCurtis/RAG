This is my first project where I have tried to put in the most effort into *supporting*
iOS mobile devices (i.e. iPod touch, iPhone, and maybe the iPad?). I use the term
"support" *loosely*. I was afraid supporting accessibility was going to be the greater
challenge in this project, but boy was I wrong!

It boggles me how far behind and broken the web is on iOS. I do not think iOS devices
being touchscreen is a good excuse, either. I was prepared for the challenges of
supporting touch input, but unprepared for just how little support iOS provided for it.

Developing web apps for this platform is a nightmare. It is very demotivating. But it
means potentially locking out 51% of the mobile market, so I have to press on and try to
support it. This will be my ~~coping~~ venting board.

# Poor debugging support

The biggest blocker for me is lack of debugging. On desktop, I have access to a full
fledged web inspector on both Chrome and Firefox. But for iOS, Safari on macOS is
required.

This means I am stuck having to do trial-and-error testing on iOS. I have no access to
console, and I have to apply `alert()`s and `background: red` styles to try and figure out
the obscure issues that iOS Webkit inevitably comes with.

## remotedebug-ios-webkit-adapter

I have tried using [`remotedebug-ios-webkit-adapter`][REMOTE] to try and use Chrome's
(previously WebKit-based) Inspector with Safari. The setup instructions were largely
incomplete and incorrect. After spending hours trying to figure out instructions from
pull requests and issues (found [here][R1] and [here][R2]), it worked poorly:

* It required an installation of iTunes for Windows, which I *really* wanted to avoid
* Half the features were non-functional
* The "remote display" was laggy with buggy input (as if it did not consider scale)
* It would randomly stop working, requiring a restart of the inspect window or Safari

## Vorlon.js and other Javascript-based debuggers

I have also tried using [Vorlon.js][VORLON], which attempts to emulate the inspector.
Tools like these involve running a server and appending a generated script tag, linking
to the local server's generated script, to the page to debug.

These scripts can only go so far to replicate the inspector, but they cannot do it all.
This system turned out to be worse:

* The element selector just did not work. It would only select the body tag.
* The console did not execute code as if it was a REPL. Nothing was ever returned.
* The client was largely unreliable. It would randomly stop working, requiring the
"Refresh dashboard" button to be hit
* If the device lost connection, it would show a large ugly red banner, which is unhelpful

## Emulating macOS on VMWare

I tried to setup macOS High Sierra to use on VMWare Player. This turned out to be a total
non-starter. macOS requires an Intel CPU, but I am on an AMD CPU. The internet is full of
junk information that supposedly explains how to get macOS working on AMD, but these all
seemed to assume I already had access to a working macOS install.

I gave up on this very quickly.

# No hard refresh

A hard refresh is where the site completely reloads all resources (javascript, css, etc)
from network, rather than from disk or memory cache. This is important when building an
app, as changes need to be loaded from disk.

Except, Safari seems to aggressively cache resources, even when using a web server that
uses headers to mark all resources as "no-cache" and having expired in 1970. This means
that simply refreshing the page may not load the latest changes.

This is confusing and annoying when said changes are invisible. Combined with a lack of
debugging options, it is hard to tell if a change is broken, or has not even been applied.

The workaround for this is to erase site data in "Settings > Safari" and restart Safari
(or Chrome), but this really hinders the workflow.

# Scrollable overflow

Container elements with scrollable overflow (`overflow auto`) are fraught with peril:

* By default, scrollable areas did not have inertia (or "flick") scrolling like pages
normally do, unless they had this non-standard CSS:
```css
-webkit-overflow-scrolling: touch;
```
* Elements beyond the initial scrollable area were prone to visual garbage and glitches.
This was most notable when clicking editor elements to open a picker. As expected, the
element would turn orange. When the picker closes, it should turn back to black. But on
Safari, they would stay orange or look like a garbled copy of a nearby element. Fixing
this needed the following ugly hack:
```css
/* https://stackoverflow.com/a/43636308 */
perspective:         1000;
-webkit-perspective: 1000;
transform:           translate3d(0, 0, 0);
-webkit-transform :  translate3d(0, 0, 0);
```

# Drag and drop

Safari does not implement the drag and drop API. It is missing objects like `DragEvent`.
Subjectively speaking, this is a pretty stupid shortcoming for software designed for a 
touch screen device; an interface *especially accustomed* to dragging and dropping.

This is pretty important functionality for the station list picker. Users need to be able
to drag and drop the station elements around, to rearrange the list or to remove stations.

I tried to reimplement this multiple times (see `dragAttempt1` and `dragAttempt2` tags)
using touch events. Even more mind-boggling, these events are *lacking* in basic data.
For example, `touchend` events do not have the destination element set to `target`. The
`target` is the element that the touch began from. Why???

In fairness, the Android browsers (Firefox, Chrome, native) are missing this too.

## Draggable

I have fixed this by using the [Draggable][DRAGGABLE] library by Shopify. It magically
fixes all of the drag and drop hassle across all platforms. I have also rewritten the
station list UI to better suit mobile devices.

# Click event bubbling

The editor element has a single `onclick` handler, to handle click events for all its
children `span` elements. This relies on a basic principle of event handling: bubbling.

When a child element is clicked, the click is "bubbled" up the DOM tree, until it hits an
event handler. In which case, it would hit the editor's handler.

Except, Safari will not do this, unless the child element has `cursor: pointer`. WTF?

# Focus and form controls

When a form control gains focus, iOS shows the keyboard or some other pop-up for input.
When the control becomes hidden however (e.g. when closing a picker), the control is
supposed to lose focus and the pop-up should close. iOS does not do this, so controls have
to be explicitly blurred.

Also, when the pop-up is open, properties like `clientTop` and rect dimensions are offset
or incorrect. I have not bothered to figure out how or why.

# Numerical input controls

For sane browsers, `<input type='number'>` renders a special input control with a spinner,
suited for inputting numbers. Except, when such a control is focused on iOS... it shows
the QWERTY keyboard. To show the numeric keypad, the type has to be set to `tel` and a
pattern of `[0-9]+`. But then this breaks `.valueAsNumber`. WTF?

# `position: sticky`

In the station list control, the list is divided into groups of A-Z. Each group has a
header element that uses `position: sticky`, to emulate iOS' famous sticky headers.

Except, in Safari, they do not work unless you use `position: -webkit-sticky`.
Subjectively speaking, vendor prefixes were one of the stupidest, most brain-dead "ideas"
of the modern web. They are dying out, but this is one case where Apple are still behind.
Firefox, Chrome, and Edge are correctly working with `sticky`.

# Subpixel issues

Safari rounds subpixel values (e.g. when using `rem` units) in such a way, that single
pixel lines and gaps can appear between elements.

The worst offender of this were the sticky A-Z headers in the station list control. Even
after changing all the measurements to `px` units, this issue remained. I was able to fix
it with `transform translateY(-1px)`.

# Web clips

Safari can "save" websites to the Home screen. Using special meta tags, such sites can be
styled to look like native apps (e.g. removing the address bar). This would have suited
RAG nicely, except web clips behaved poorly compared to Safari:

* There is no reliable way to hard refresh a web clip, except deleting the app and
erasing site data in "Settings > Safari"
* Form controls do not work (e.g. keyboard not shown), unless they have
`-webkit-user-select` set to `text`. This fix was not needed on Safari, however.

# The forced Webkit monopoly

I have left this point for last; it is more an issue of principle. Apple abuses its
App Store monopoly in many ways:

* Apple forces all apps to use the same inferior version of WebKit that iOS Safari uses
* Except, all non-Safari apps (e.g. Chrome, Firefox) are forced to use an older, slower
JavaScript engine. Safari has exclusive access to the faster Nitro engine.
* Safari WebKit is only updated in every major version of iOS (e.g. 10, 11, 12)
* No other app can be set as the default browser across iOS; only Safari

[All of this is documented here.][MONOPOLY]

The practical issues with this abuse is, well, see all of the above points in this
document. Because of their monopoly, Apple have no incentive to improve Safari, either by
making it support the latest standards properly or by fixing its many bugs. Writing a
buggy engine is bad enough, but forcing users and developers to use it is a dick move.

I wish I did not have to play this game. I do not want to accommodate a platform that is
actively hostile to its users and developers.

[REMOTE]: https://github.com/RemoteDebug/remotedebug-ios-webkit-adapter
[R1]: https://github.com/RemoteDebug/remotedebug-ios-webkit-adapter/issues/106
[R2]: https://github.com/RemoteDebug/remotedebug-ios-webkit-adapter/issues/79#issuecomment-351472710
[VORLON]: http://www.vorlonjs.io/
[MONOPOLY]: https://www.howtogeek.com/184283/why-third-party-browsers-will-always-be-inferior-to-safari-on-iphone-and-ipad/
[DRAGGABLE]: https://shopify.github.io/draggable/