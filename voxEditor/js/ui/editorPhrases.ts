/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";

/** Controller for the phrase list part of the editor */
export class EditorPhrases
{
    private readonly domList        : HTMLUListElement;

    private readonly btnMarkMissing : HTMLButtonElement;

    public constructor()
    {
        this.domList        = DOM.require('#partSelector ul');
        this.btnMarkMissing = DOM.require('#btnMarkMissing');

        this.btnMarkMissing.onclick = this.onMarkMissing.bind(this);

        this.populateList();
    }

    private onMarkMissing() : void
    {
        let voice = VoxEditor.config.voicePath;

        for (let i = 0; i < this.domList.children.length; i++)
        {
            let item = this.domList.children[i] as HTMLElement;
            let key  = item.dataset['key']!;

            if ( VoxEditor.voices.hasClip(key) )
                item.classList.remove('missing');
            else
                item.classList.add('missing');
        }
    }

    private populateList() : void
    {
        this.domList.classList.add('hidden');

        this.domList.innerText = '';

        for (let key in VoxEditor.banker.captionBank)
        {
            let element = document.createElement('li');
            let value   = VoxEditor.banker.captionBank[key];

            element.dataset['key'] = key;
            element.innerHTML      = `<code>${key}</code> "${value}"`;

            this.domList.appendChild(element);
        }

        this.domList.classList.remove('hidden');
    }
}