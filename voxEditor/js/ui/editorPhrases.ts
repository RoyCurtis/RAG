/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

import {VoxEditor} from "../voxEditor";

/** Controller for the phrase list part of the editor */
export class EditorPhrases
{
    private readonly domList : HTMLUListElement;

    public constructor()
    {
        this.domList = DOM.require('#partSelector ul');

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