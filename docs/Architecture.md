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

[1]: https://stackoverflow.com/a/18062487/3354920