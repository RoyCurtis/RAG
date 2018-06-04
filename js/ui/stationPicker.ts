/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/// <reference path="Picker.ts"/>

/** Controller for the station picker dialog */
class StationPicker extends Picker
{
    private readonly domChoices:   { [index: string]: HTMLDListElement };
    private readonly inputService: HTMLElement;

    private domSelected?: HTMLDataElement;

    constructor()
    {
        super('station', ['click']);

        this.domChoices   = {};
        this.inputService = DOM.require('.picker', this.dom);

        Object.keys(RAG.database.stations).forEach(code =>
        {
            let station = RAG.database.stations[code];
            let letter  = station[0];
            let group   = this.domChoices[letter];

            if (!group)
            {
                let header       = document.createElement('dt');
                header.innerText = letter.toUpperCase();

                group = this.domChoices[letter] = document.createElement('dl');

                group.appendChild(header);
                this.inputService.appendChild(group);
            }

            let entry             = document.createElement('dd');
            entry.innerText       = RAG.database.stations[code];
            entry.dataset['code'] = code;

            group.appendChild(entry);
        });
    }

    public open(target: HTMLElement)
    {
        super.open(target);

        let code  = RAG.state.stationCode;
        let entry = this.inputService.querySelector(`dd[code=${code}`);

        if (entry)
            this.select(entry as HTMLDataElement);
    }

    private select(option: HTMLDataElement)
    {
        if (this.domSelected)
            this.domSelected.removeAttribute('selected');

        this.domSelected = option;
        option.setAttribute('selected', 'true');
    }

    protected onChange(ev: Event)
    {
        let target = ev.target as HTMLDataElement;

        // Ignore if option element wasn't clicked
        if (!target || !target.dataset['code'])
            return;
        else
            this.select(target);

        RAG.state.stationCode = target.dataset['code']!;
        RAG.views.editor.setElementsText('station', target.innerText);
    }
}