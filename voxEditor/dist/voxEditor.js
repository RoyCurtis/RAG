"use strict";
/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */
exports.__esModule = true;
/// <reference path="../../js/rag.d.ts"/>
var electron_1 = require("electron");
var captioner_1 = require("./captioner");
var path = require("path");
/** Main class of the entire vox editor application */
var VoxEditor = /** @class */ (function () {
    function VoxEditor() {
    }
    /** Entry point for VoxEditor when starting Electron */
    VoxEditor.electronMain = function () {
        console.log('VOX Editor', process.version);
        // For IntelliJ debugging of the render process
        electron_1.app.commandLine.appendSwitch('remote-debugging-port', '9222');
        electron_1.app.on('ready', function () {
            var window = VoxEditor.electronWindow = new electron_1.BrowserWindow({
                width: 1280,
                height: 800
            });
            window.loadFile(path.join(__dirname, "../views/index.html"));
            window.webContents.openDevTools();
            window.on('closed', function () { return VoxEditor.electronWindow = undefined; });
        });
        electron_1.app.on('window-all-closed', function () { return electron_1.app.quit(); });
    };
    /** */
    VoxEditor.electronRenderer = function (dataRefs) {
        console.log('VOX Editor renderer', process.version);
        I18n.init();
        VoxEditor.database = new Database(dataRefs);
        VoxEditor.banker = new captioner_1.Captioner();
        var phrasesList = DOM.require('#partSelector ul');
        for (var key in VoxEditor.banker.captionBank) {
            var element = document.createElement('li');
            var value = VoxEditor.banker.captionBank[key];
            element.dataset['key'] = key;
            element.innerHTML = "<code>" + key + "</code> \"" + value + "\"";
            phrasesList.appendChild(element);
        }
        phrasesList.classList.remove('hidden');
    };
    return VoxEditor;
}());
exports.VoxEditor = VoxEditor;
// Boot self, if running as the Electron main thread
if (process.type === 'browser')
    VoxEditor.electronMain();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm94RWRpdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3ZveEVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEscUVBQXFFOztBQUVyRSx5Q0FBeUM7QUFFekMscUNBQTRDO0FBQzVDLHlDQUFzQztBQUN0QywyQkFBK0I7QUFFL0Isc0RBQXNEO0FBQ3REO0lBQUE7SUE2REEsQ0FBQztJQXhERyx1REFBdUQ7SUFDekMsc0JBQVksR0FBMUI7UUFFSSxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFM0MsK0NBQStDO1FBQy9DLGNBQUcsQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLHVCQUF1QixFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRTlELGNBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFO1lBRVosSUFBSSxNQUFNLEdBQUcsU0FBUyxDQUFDLGNBQWMsR0FBRyxJQUFJLHdCQUFhLENBQ3pEO2dCQUNJLEtBQUssRUFBRyxJQUFJO2dCQUNaLE1BQU0sRUFBRSxHQUFHO2FBQ2QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLFFBQVEsQ0FBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFFLENBQUM7WUFFL0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUVsQyxNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxjQUFNLE9BQUEsU0FBUyxDQUFDLGNBQWMsR0FBRyxTQUFTLEVBQXBDLENBQW9DLENBQUMsQ0FBQztRQUNwRSxDQUFDLENBQUMsQ0FBQztRQUVILGNBQUcsQ0FBQyxFQUFFLENBQUUsbUJBQW1CLEVBQUUsY0FBTSxPQUFBLGNBQUcsQ0FBQyxJQUFJLEVBQUUsRUFBVixDQUFVLENBQUUsQ0FBQTtJQUNuRCxDQUFDO0lBT0QsTUFBTTtJQUNRLDBCQUFnQixHQUE5QixVQUErQixRQUFrQjtRQUU3QyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVwRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFWixTQUFTLENBQUMsUUFBUSxHQUFHLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVDLFNBQVMsQ0FBQyxNQUFNLEdBQUssSUFBSSxxQkFBUyxFQUFFLENBQUM7UUFFckMsSUFBSSxXQUFXLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBcUIsa0JBQWtCLENBQUMsQ0FBQztRQUV0RSxLQUFLLElBQUksR0FBRyxJQUFJLFNBQVMsQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUM1QztZQUNJLElBQUksT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0MsSUFBSSxLQUFLLEdBQUssU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFaEQsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUM7WUFDN0IsT0FBTyxDQUFDLFNBQVMsR0FBUSxXQUFTLEdBQUcsa0JBQVksS0FBSyxPQUFHLENBQUM7WUFFMUQsV0FBVyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztTQUNwQztRQUVELFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFDTCxnQkFBQztBQUFELENBQUMsQUE3REQsSUE2REM7QUE3RFksOEJBQVM7QUErRHRCLG9EQUFvRDtBQUNwRCxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssU0FBUztJQUMxQixTQUFTLENBQUMsWUFBWSxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiogUmFpbCBBbm5vdW5jZW1lbnRzIEdlbmVyYXRvci4gQnkgUm95IEN1cnRpcywgTUlUIGxpY2Vuc2UsIDIwMTggKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi8uLi9qcy9yYWcuZC50c1wiLz5cclxuXHJcbmltcG9ydCB7YXBwLCBCcm93c2VyV2luZG93fSBmcm9tICdlbGVjdHJvbic7XHJcbmltcG9ydCB7Q2FwdGlvbmVyfSBmcm9tIFwiLi9jYXB0aW9uZXJcIjtcclxuaW1wb3J0ICogYXMgcGF0aCAgIGZyb20gXCJwYXRoXCI7XHJcblxyXG4vKiogTWFpbiBjbGFzcyBvZiB0aGUgZW50aXJlIHZveCBlZGl0b3IgYXBwbGljYXRpb24gKi9cclxuZXhwb3J0IGNsYXNzIFZveEVkaXRvclxyXG57XHJcbiAgICAvKiogR2V0cyB0aGUgRWxlY3Ryb24gcmVuZGVyZXIgd2luZG93IGluc3RhbmNlICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGVsZWN0cm9uV2luZG93PyA6IEJyb3dzZXJXaW5kb3c7XHJcblxyXG4gICAgLyoqIEVudHJ5IHBvaW50IGZvciBWb3hFZGl0b3Igd2hlbiBzdGFydGluZyBFbGVjdHJvbiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBlbGVjdHJvbk1haW4oKSA6IHZvaWRcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnVk9YIEVkaXRvcicsIHByb2Nlc3MudmVyc2lvbik7XHJcblxyXG4gICAgICAgIC8vIEZvciBJbnRlbGxpSiBkZWJ1Z2dpbmcgb2YgdGhlIHJlbmRlciBwcm9jZXNzXHJcbiAgICAgICAgYXBwLmNvbW1hbmRMaW5lLmFwcGVuZFN3aXRjaCgncmVtb3RlLWRlYnVnZ2luZy1wb3J0JywgJzkyMjInKTtcclxuXHJcbiAgICAgICAgYXBwLm9uKCdyZWFkeScsICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgd2luZG93ID0gVm94RWRpdG9yLmVsZWN0cm9uV2luZG93ID0gbmV3IEJyb3dzZXJXaW5kb3coXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHdpZHRoOiAgMTI4MCxcclxuICAgICAgICAgICAgICAgIGhlaWdodDogODAwXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgd2luZG93LmxvYWRGaWxlKCBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL3ZpZXdzL2luZGV4Lmh0bWxcIikgKTtcclxuXHJcbiAgICAgICAgICAgIHdpbmRvdy53ZWJDb250ZW50cy5vcGVuRGV2VG9vbHMoKTtcclxuXHJcbiAgICAgICAgICAgIHdpbmRvdy5vbignY2xvc2VkJywgKCkgPT4gVm94RWRpdG9yLmVsZWN0cm9uV2luZG93ID0gdW5kZWZpbmVkKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXBwLm9uKCAnd2luZG93LWFsbC1jbG9zZWQnLCAoKSA9PiBhcHAucXVpdCgpIClcclxuICAgIH1cclxuXHJcbiAgICAvKiogR2V0cyB0aGUgdm9pY2UgYmFuayBnZW5lcmF0b3IsIHdoaWNoIHR1cm5zIHBocmFzZSBkYXRhIGludG8gYSBzZXQgb2YgSURzICovXHJcbiAgICBwdWJsaWMgc3RhdGljIGJhbmtlciAgIDogQ2FwdGlvbmVyO1xyXG4gICAgLyoqIEdldHMgdGhlIGRhdGFiYXNlIG1hbmFnZXIsIHdoaWNoIGhvbGRzIHBocmFzZSwgc3RhdGlvbiBhbmQgdHJhaW4gZGF0YSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBkYXRhYmFzZSA6IERhdGFiYXNlO1xyXG5cclxuICAgIC8qKiAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBlbGVjdHJvblJlbmRlcmVyKGRhdGFSZWZzOiBEYXRhUmVmcykgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBFZGl0b3IgcmVuZGVyZXInLCBwcm9jZXNzLnZlcnNpb24pO1xyXG5cclxuICAgICAgICBJMThuLmluaXQoKTtcclxuXHJcbiAgICAgICAgVm94RWRpdG9yLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlKGRhdGFSZWZzKTtcclxuICAgICAgICBWb3hFZGl0b3IuYmFua2VyICAgPSBuZXcgQ2FwdGlvbmVyKCk7XHJcblxyXG4gICAgICAgIGxldCBwaHJhc2VzTGlzdCA9IERPTS5yZXF1aXJlIDxIVE1MVUxpc3RFbGVtZW50PiAoJyNwYXJ0U2VsZWN0b3IgdWwnKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQga2V5IGluIFZveEVkaXRvci5iYW5rZXIuY2FwdGlvbkJhbmspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XHJcbiAgICAgICAgICAgIGxldCB2YWx1ZSAgID0gVm94RWRpdG9yLmJhbmtlci5jYXB0aW9uQmFua1trZXldO1xyXG5cclxuICAgICAgICAgICAgZWxlbWVudC5kYXRhc2V0WydrZXknXSA9IGtleTtcclxuICAgICAgICAgICAgZWxlbWVudC5pbm5lckhUTUwgICAgICA9IGA8Y29kZT4ke2tleX08L2NvZGU+IFwiJHt2YWx1ZX1cImA7XHJcblxyXG4gICAgICAgICAgICBwaHJhc2VzTGlzdC5hcHBlbmRDaGlsZChlbGVtZW50KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHBocmFzZXNMaXN0LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBCb290IHNlbGYsIGlmIHJ1bm5pbmcgYXMgdGhlIEVsZWN0cm9uIG1haW4gdGhyZWFkXHJcbmlmIChwcm9jZXNzLnR5cGUgPT09ICdicm93c2VyJylcclxuICAgIFZveEVkaXRvci5lbGVjdHJvbk1haW4oKTsiXX0=