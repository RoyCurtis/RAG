# Why does the Editor class handle click events for phrase elements?

The alternative (and "usual") route would be to attach a click handler to every
interactive phrase element. However, the editor is a very dynamic component; phrase
elements are created and destroyed anytime the phrase is generated, or edited.

To create and attach a handler to each of these elements feels wasteful. So instead, I
make use of event bubbling. Click events will bubble up the DOM tree to the document's
global click handler, registered by the editor.

# Why does the handler have to be on document, and not on the editor's root tag?

The editor needs to know if the user clicks outside the editor, or anywhere on the 
document that happens to be outside an open picker. This is so the picker can be closed.

# When getting values from inputs, why `parseFloat(value)` instead of `valueAsNumber`?

`valueAsNumber` has a bad API design, where it only works if the input element is of a
specific type. Even then, [it is reportedly unreliable][1]. I try to avoid unreliable API.
I was expecting this property to try to auto-parse the value regardless of type.

# Why are you not using the fetch API for the data and phrase files?

I do not see a reason to. I am adhering to the [KISS principle][KISS] by making use of
the browser's native synchronous loading facilities. RAG is not even executed until the
phraseset's iframe `onload` event fires, as iframe is async in nature.

I feel like polluting RAG's code with async methods, such as `fetch`, is too much a
complexity tradeoff for what little benefit it would bring (e.g. treating the data files
as JSON, instead of global variables).

[1]: https://stackoverflow.com/a/18062487/3354920
[KISS]: https://en.wikipedia.org/wiki/KISS_principle