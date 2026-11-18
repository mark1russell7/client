---
"@procedures/compiler": patch
"@procedures/algebra": patch
"@procedures/dag": patch
"@procedures/generators": patch
"@procedures/geo": patch
"@procedures/optional": patch
"@procedures/predicates": patch
"@procedures/quantity": patch
"@procedures/rational": patch
"@procedures/statistics": patch
---

The generator of `@procedures/compiler` gives the members of a union a canonical sequence. Before, the sequence came from the type ids of TypeScript, and a new call of the checker changed it.

- The `anyOf` and `enum` lists start with the primitive types. The number literals and the bigint literals follow by value. Then come the string literals by code unit. The other types come last, by the code units of their text.
- The names of the definitions come from the same sequence. Thus a change in a different part of the generator does not rename a definition.
- A manifest keeps only the definitions that its procedures reach through `$ref`. A function that the generator refused kept dead definitions before.

The manifests of the wrap packages change only in the sequence of their lists, and lose definitions with no reference. Their schemas accept the same values.
