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
        var phrasesList = DOM.require('#phrasesList');
        for (var key in VoxEditor.banker.captionBank) {
            var element = document.createElement('li');
            var value = VoxEditor.banker.captionBank[key];
            element.dataset['key'] = key;
            element.innerText = "\"" + value + "\"";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm94RWRpdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3ZveEVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEscUVBQXFFOztBQUVyRSx5Q0FBeUM7QUFFekMscUNBQXlEO0FBQ3pELHlDQUFzQztBQUN0QywyQkFBNkI7QUFFN0Isc0RBQXNEO0FBQ3REO0lBQUE7SUE2REEsQ0FBQztJQXhERyx1REFBdUQ7SUFDekMsc0JBQVksR0FBMUI7UUFFSSxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFM0MsK0NBQStDO1FBQy9DLGNBQUcsQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLHVCQUF1QixFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRTlELGNBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFO1lBRVosSUFBSSxNQUFNLEdBQUcsU0FBUyxDQUFDLGNBQWMsR0FBRyxJQUFJLHdCQUFhLENBQ3pEO2dCQUNJLEtBQUssRUFBRyxJQUFJO2dCQUNaLE1BQU0sRUFBRSxHQUFHO2FBQ2QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLFFBQVEsQ0FBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFFLENBQUM7WUFFL0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUVsQyxNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxjQUFNLE9BQUEsU0FBUyxDQUFDLGNBQWMsR0FBRyxTQUFTLEVBQXBDLENBQW9DLENBQUMsQ0FBQztRQUNwRSxDQUFDLENBQUMsQ0FBQztRQUVILGNBQUcsQ0FBQyxFQUFFLENBQUUsbUJBQW1CLEVBQUUsY0FBTSxPQUFBLGNBQUcsQ0FBQyxJQUFJLEVBQUUsRUFBVixDQUFVLENBQUUsQ0FBQTtJQUNuRCxDQUFDO0lBT0QsTUFBTTtJQUNRLDBCQUFnQixHQUE5QixVQUErQixRQUFrQjtRQUU3QyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVwRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFWixTQUFTLENBQUMsUUFBUSxHQUFHLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVDLFNBQVMsQ0FBQyxNQUFNLEdBQUssSUFBSSxxQkFBUyxFQUFFLENBQUM7UUFFckMsSUFBSSxXQUFXLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBcUIsY0FBYyxDQUFDLENBQUM7UUFFbEUsS0FBSyxJQUFJLEdBQUcsSUFBSSxTQUFTLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFDNUM7WUFDSSxJQUFJLE9BQU8sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNDLElBQUksS0FBSyxHQUFLLFNBQVMsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRWhELE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxDQUFDO1lBQzdCLE9BQU8sQ0FBQyxTQUFTLEdBQVEsT0FBSSxLQUFLLE9BQUcsQ0FBQztZQUV0QyxXQUFXLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1NBQ3BDO1FBRUQsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUNMLGdCQUFDO0FBQUQsQ0FBQyxBQTdERCxJQTZEQztBQTdEWSw4QkFBUztBQStEdEIsb0RBQW9EO0FBQ3BELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxTQUFTO0lBQzFCLFNBQVMsQ0FBQyxZQUFZLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKiBSYWlsIEFubm91bmNlbWVudHMgR2VuZXJhdG9yLiBCeSBSb3kgQ3VydGlzLCBNSVQgbGljZW5zZSwgMjAxOCAqL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uLy4uL2pzL3JhZy5kLnRzXCIvPlxyXG5cclxuaW1wb3J0IHthcHAsIEJyb3dzZXJXaW5kb3csIHdlYkNvbnRlbnRzfSBmcm9tICdlbGVjdHJvbic7XHJcbmltcG9ydCB7Q2FwdGlvbmVyfSBmcm9tIFwiLi9jYXB0aW9uZXJcIjtcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xyXG5cclxuLyoqIE1haW4gY2xhc3Mgb2YgdGhlIGVudGlyZSB2b3ggZWRpdG9yIGFwcGxpY2F0aW9uICovXHJcbmV4cG9ydCBjbGFzcyBWb3hFZGl0b3Jcclxue1xyXG4gICAgLyoqIEdldHMgdGhlIEVsZWN0cm9uIHJlbmRlcmVyIHdpbmRvdyBpbnN0YW5jZSAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBlbGVjdHJvbldpbmRvdz8gOiBCcm93c2VyV2luZG93O1xyXG5cclxuICAgIC8qKiBFbnRyeSBwb2ludCBmb3IgVm94RWRpdG9yIHdoZW4gc3RhcnRpbmcgRWxlY3Ryb24gKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZWxlY3Ryb25NYWluKCkgOiB2b2lkXHJcbiAgICB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1ZPWCBFZGl0b3InLCBwcm9jZXNzLnZlcnNpb24pO1xyXG5cclxuICAgICAgICAvLyBGb3IgSW50ZWxsaUogZGVidWdnaW5nIG9mIHRoZSByZW5kZXIgcHJvY2Vzc1xyXG4gICAgICAgIGFwcC5jb21tYW5kTGluZS5hcHBlbmRTd2l0Y2goJ3JlbW90ZS1kZWJ1Z2dpbmctcG9ydCcsICc5MjIyJyk7XHJcblxyXG4gICAgICAgIGFwcC5vbigncmVhZHknLCAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHdpbmRvdyA9IFZveEVkaXRvci5lbGVjdHJvbldpbmRvdyA9IG5ldyBCcm93c2VyV2luZG93KFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB3aWR0aDogIDEyODAsXHJcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IDgwMFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2FkRmlsZSggcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi92aWV3cy9pbmRleC5odG1sXCIpICk7XHJcblxyXG4gICAgICAgICAgICB3aW5kb3cud2ViQ29udGVudHMub3BlbkRldlRvb2xzKCk7XHJcblxyXG4gICAgICAgICAgICB3aW5kb3cub24oJ2Nsb3NlZCcsICgpID0+IFZveEVkaXRvci5lbGVjdHJvbldpbmRvdyA9IHVuZGVmaW5lZCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGFwcC5vbiggJ3dpbmRvdy1hbGwtY2xvc2VkJywgKCkgPT4gYXBwLnF1aXQoKSApXHJcbiAgICB9XHJcblxyXG4gICAgLyoqIEdldHMgdGhlIHZvaWNlIGJhbmsgZ2VuZXJhdG9yLCB3aGljaCB0dXJucyBwaHJhc2UgZGF0YSBpbnRvIGEgc2V0IG9mIElEcyAqL1xyXG4gICAgcHVibGljIHN0YXRpYyBiYW5rZXIgICA6IENhcHRpb25lcjtcclxuICAgIC8qKiBHZXRzIHRoZSBkYXRhYmFzZSBtYW5hZ2VyLCB3aGljaCBob2xkcyBwaHJhc2UsIHN0YXRpb24gYW5kIHRyYWluIGRhdGEgKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZGF0YWJhc2UgOiBEYXRhYmFzZTtcclxuXHJcbiAgICAvKiogKi9cclxuICAgIHB1YmxpYyBzdGF0aWMgZWxlY3Ryb25SZW5kZXJlcihkYXRhUmVmczogRGF0YVJlZnMpIDogdm9pZFxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdWT1ggRWRpdG9yIHJlbmRlcmVyJywgcHJvY2Vzcy52ZXJzaW9uKTtcclxuXHJcbiAgICAgICAgSTE4bi5pbml0KCk7XHJcblxyXG4gICAgICAgIFZveEVkaXRvci5kYXRhYmFzZSA9IG5ldyBEYXRhYmFzZShkYXRhUmVmcyk7XHJcbiAgICAgICAgVm94RWRpdG9yLmJhbmtlciAgID0gbmV3IENhcHRpb25lcigpO1xyXG5cclxuICAgICAgICBsZXQgcGhyYXNlc0xpc3QgPSBET00ucmVxdWlyZSA8SFRNTFVMaXN0RWxlbWVudD4gKCcjcGhyYXNlc0xpc3QnKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQga2V5IGluIFZveEVkaXRvci5iYW5rZXIuY2FwdGlvbkJhbmspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XHJcbiAgICAgICAgICAgIGxldCB2YWx1ZSAgID0gVm94RWRpdG9yLmJhbmtlci5jYXB0aW9uQmFua1trZXldO1xyXG5cclxuICAgICAgICAgICAgZWxlbWVudC5kYXRhc2V0WydrZXknXSA9IGtleTtcclxuICAgICAgICAgICAgZWxlbWVudC5pbm5lclRleHQgICAgICA9IGBcIiR7dmFsdWV9XCJgO1xyXG5cclxuICAgICAgICAgICAgcGhyYXNlc0xpc3QuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBwaHJhc2VzTGlzdC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gQm9vdCBzZWxmLCBpZiBydW5uaW5nIGFzIHRoZSBFbGVjdHJvbiBtYWluIHRocmVhZFxyXG5pZiAocHJvY2Vzcy50eXBlID09PSAnYnJvd3NlcicpXHJcbiAgICBWb3hFZGl0b3IuZWxlY3Ryb25NYWluKCk7Il19