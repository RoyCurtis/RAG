/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../../voxEditor";

/** UI control for generating a contextual preview phrase for a clip */
export class PhrasePreview
{
    /** Reference to the container for this previewer */
    public readonly dom : HTMLElement;

    private key     : string = '';
    private type    : string = '';
    private value   : string = '';
    private inflect : string = '';

    public constructor(query: string)
    {
        this.dom         = DOM.require(query);
        this.dom.onclick = this.onClick.bind(this);
    }

    public setText(text: string) : void
    {
        this.dom.innerText = text;
    }

    public generateExample(key: string) : void
    {
        let type = Strings.firstMatch(key, /^([a-z]+)\./i, 1);

        this.key     = key;
        this.type    = type || '';
        this.value   = Strings.firstMatch(key, /\.([a-z0-9_]+)\./i, 1)   || '';
        this.inflect = Strings.firstMatch(key, /\.(begin|mid|end)$/i, 1) || '';

        if (this.value === 'suffix')
            return this.genericCaption();

        this.setDefaultState();

        switch (this.type)
        {
            case 'phrase':    // Fall-through
            case 'phraseset': this.phraseCaption();  return;
            case 'excuse':    this.excuseCaption();  return;
            case 'letter':    this.letterCaption();  return;
            case 'named':     this.namedCaption();   return;
            case 'number':    this.numberCaption();  return;
            case 'service':   this.serviceCaption(); return;
            case 'station':   this.stationCaption(); return;
            default:          this.genericCaption(); return;
        }
    }

    private onClick(ev: MouseEvent) : void
    {
        let target = ev.target as HTMLElement;
        let key    = target.dataset['key'];

        if (key)
            VoxEditor.views.phrases.selectKey(key);
    }

    private setDefaultState() : void
    {
        RAG.state.platform = ['10', ''];
        RAG.state.setTime('main',        '09:48');
        RAG.state.setTime('alternative', '10:22');
        RAG.state.setStation('via',               'CLJ');
        RAG.state.setStation('excuse',            'PAD');
        RAG.state.setStation('destination',       'VIC');
        RAG.state.setStation('destination_split', 'EPH');
        RAG.state.setStationList('calling',       ['VIC', 'CLJ']);
        RAG.state.setStationList('calling_split', ['PAD', 'EPH']);
        RAG.state.setStationList('changes',       ['BRI', 'SWI']);
        RAG.state.setStationList('not_stopping',  ['CRE', 'RDG']);
        RAG.state.setStationList('request',       ['GLC', 'GLD']);
    }

    private generate() : void
    {
        let ref            = `voxeditor_${this.type}_${this.inflect}`;
        this.dom.innerHTML = `<phrase ref="${ref}" />`;

        RAG.phraser.process(this.dom);
    }

    private highlightTypes(types: string[]) : void
    {
        types.forEach(type =>
        {
            this.dom.querySelectorAll(`span[data-type=${type}]`)
                .forEach( e => e.classList.add('highlight') );
        });
    }

    private genericCaption() : void
    {
        let caption        = VoxEditor.captioner.captionBank[this.key!];
        this.dom.innerHTML = `<span>${caption}</span>`;

        this.dom.querySelectorAll(`span`)
            .forEach(e => e.classList.add('highlight') );
    }

    private excuseCaption() : void
    {
        RAG.state.excuse = VoxEditor.captioner.captionBank[this.key!];
        this.generate();
        this.highlightTypes(['excuse']);
    }

    private letterCaption() : void
    {
        RAG.state.setCoach('first', VoxEditor.captioner.captionBank[this.key!]);
        this.generate();
        this.highlightTypes(['coach']);
    }

    private namedCaption() : void
    {
        RAG.state.named = VoxEditor.captioner.captionBank[this.key!];
        this.generate();
        this.highlightTypes(['named']);
    }

    private numberCaption() : void
    {
        let types : string[] = [];
        let platform         = this.value.match(/^(\d+)([ABC])$/);

        // Oh-zero hundred
        if (this.value === '0000')
        {
            RAG.state.setTime('main',        '00:00');
            RAG.state.setTime('alternative', '00:00');
            this.type = 'time';
            types.push('time');
        }
        // Hundred
        else if (this.value === 'hundred')
        {
            RAG.state.setTime('main',        '09:00');
            RAG.state.setTime('alternative', '15:00');
            this.type = 'time';
            types.push('time');
        }
        // Time hours
        else if ( this.inflect === 'begin' )
        {
            RAG.state.setTime('main',        `${this.value}:${this.value}`);
            RAG.state.setTime('alternative', this.value + ':52');
            this.type = 'time';
            types.push('time');
        }
        // Time double-digits
        else if ( this.value!.match(/^0[0-9]$/) )
        {
            RAG.state.setTime('main',        `${this.value}:${this.value}`);
            RAG.state.setTime('alternative', `13:${this.value}`);
            this.type = 'time';
            types.push('time');
        }
        // Lettered platforms
        else if (platform)
        {
            RAG.state.platform = [ platform[1], platform[2] ];
            this.type          = 'platform';
            types.push('platform');
        }
        // Single digit platforms
        else if (this.value.length === 1)
        {
            RAG.state.platform = [this.value, ''];
            this.type          = 'platform';
            types.push('platform');
        }
        // Mixed number types
        else
        {
            RAG.state.platform = [this.value, ''];
            RAG.state.setTime('main',        '11:' + this.value);
            RAG.state.setTime('alternative', this.value + ':15');
            types.push('platform', 'time');
        }

        this.generate();
        this.highlightTypes(types);
    }

    private phraseCaption() : void
    {
        let key     = this.key!;
        let index   = parseInt(Strings.firstMatch(key, /\.(\d+)$/i, 1)      || '0');
        let psIndex = parseInt(Strings.firstMatch(key, /\.(\d+)\.\d+$/i, 1) || '0');

        if (this.type === 'phraseset')
            RAG.state.setPhrasesetIdx(this.value, psIndex);

        this.dom.innerHTML = `<${this.type} ref="${this.value}"/>`;
        RAG.phraser.process(this.dom);

        // Convert all the text fragments to vox nodes
        this.dom.children[0]!.childNodes.forEach( (node, i) =>
        {
            if (node.nodeType !== Node.TEXT_NODE)
                return;

            // TODO: This feels like a duplication of captioner code. Not very DRY.
            let newNode = document.createElement('span');
            let newKey  = (this.type === 'phraseset')
                ? `phraseset.${this.value}.${psIndex}.${i}`
                : `phrase.${this.value}.${i}`;

            newNode.textContent     = node.textContent!;
            newNode.dataset['type'] = 'vox';
            newNode.dataset['key']  = newKey;

            if (i === index)
                newNode.classList.add('highlight');

            this.dom.children[0]!.replaceChild(newNode, node);
        });
    }

    private serviceCaption() : void
    {
        RAG.state.setService('provider',    VoxEditor.captioner.captionBank[this.key!]);
        RAG.state.setService('alternative', VoxEditor.captioner.captionBank[this.key!]);
        this.generate();
        this.highlightTypes(['service']);
    }

    private stationCaption() : void
    {
        RAG.state.setStation('destination', this.value);

        if (this.inflect === 'mid')
            RAG.state.setStationList('calling', [this.value]);
        else
            RAG.state.setStationList('calling', ['VIC', this.value]);

        this.generate();
        this.dom.querySelectorAll(`span[data-type=station][data-context=destination]`)
            .forEach( e => e.classList.add('highlight') );
        this.dom.querySelectorAll(`span[data-type=stationlist]`)
            .forEach( e => e.classList.add('highlight') );
    }
}