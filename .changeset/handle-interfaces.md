---
"@procedures/client": patch
"@procedures/compiler": patch
"@procedures/optional": patch
---

Handles for the inputs of an interface (d40-handles). In the exports generator, a parameter of an interface takes a handle of each class of the package that is assignable to it. For example, a `SqlConnection` takes a `node:sqlite#DatabaseSync`. A parameter of a type parameter uses its constraint. An input with more than one kind has the list of the kinds in `x-procedures-handle`. `handleSchema` and `HandleScope.get` of `@procedures/client` also take a list of kinds. The manifest of `@procedures/optional` has the members of two `Result` unions in a different sequence. The schemas accept the same values.
