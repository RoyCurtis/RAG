/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Controller for the top toolbar */
class Toolbar
{
    private domToolbar  : HTMLElement;
    private btnPlay     : HTMLElement;
    private btnStop     : HTMLElement;
    private btnGenerate : HTMLElement;
    private btnSave     : HTMLElement;
    private btnRecall   : HTMLElement;
    private btnOption   : HTMLElement;

    constructor()
    {
        this.domToolbar  = DOM.require('#toolbar');
        this.btnPlay     = DOM.require('#btnPlay');
        this.btnStop     = DOM.require('#btnStop');
        this.btnGenerate = DOM.require('#btnShuffle');
        this.btnSave     = DOM.require('#btnSave');
        this.btnRecall   = DOM.require('#btnLoad');
        this.btnOption   = DOM.require('#btnSettings');

        this.btnPlay.onclick     = () => this.handlePlay();
        this.btnStop.onclick     = () => this.handleStop();
        this.btnGenerate.onclick = () => RAG.generate();
        this.btnSave.onclick     = () => alert('Unimplemented');
        this.btnRecall.onclick   = () => alert('Unimplemented');
        this.btnOption.onclick   = () => alert('Unimplemented');
    }

    private handlePlay() : void
    {
        // Note: It would be nice to have the play button change to the stop button and
        // automatically change back. However, speech's 'onend' event was found to be
        // unreliable, so I decided to keep play and stop separate.

        let text  = DOM.getVisibleText( RAG.viewController.getEditor() );
        let parts = text.trim().split(/\.\s/i);

        RAG.speechSynth.cancel();
        parts.forEach( segment =>
            RAG.speechSynth.speak( new SpeechSynthesisUtterance(segment) )
        );

        RAG.viewController.setMarquee(text);
    }

    private handleStop() : void
    {
        RAG.speechSynth.cancel();
        RAG.viewController.stopMarquee();
    }
}