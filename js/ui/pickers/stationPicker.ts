/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="picker.ts"/>

/** Controller for the station picker dialog */
class StationPicker extends Picker
{
    constructor()
    {
        super('station', ['click', 'input']);
    }

    public open(target: HTMLElement)
    {
        super.open(target);

        RAG.views.stationList.attach(this);
        RAG.views.stationList.selectCode(RAG.state.stationCode);
    }

    protected onChange(ev: Event)
    {
        RAG.views.stationList.onChange(ev, target =>
        {
            RAG.views.stationList.selectEntry(target);

            RAG.state.stationCode = target.dataset['code']!;
            RAG.views.editor.setElementsText('station', target.innerText);
        });
    }
}