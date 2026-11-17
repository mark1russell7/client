---
"@procedures/compiler": patch
"@procedures/algebra": patch
"@procedures/quantity": patch
"@procedures/statistics": patch
---

A `bigint`, a `Map`, a `Set` and an `Iterable` input can go into a procedure: each has a codec, a JSON form.

- The generator of `@procedures/compiler` gives each of these types a schema with the new keyword `x-procedures-codec`. A `bigint` is a decimal string, a `Map` is a list of entries, and a `Set` or an `Iterable` input is a list.
- The loader `exportsModule()` decodes the input with its schema before the call. In a union, the value goes to the first member whose schema accepts it. The codec of a constructed input is decoded before its factory makes the value.
- `jsonValue()` gives the JSON form of a `bigint`, a `Map` and a `Set` at each depth. Before, a `Map` and a `Set` became `{}` in JSON, and a `bigint` failed.
- A sub-program gets the JSON form of each argument, and the function of the package gets the decoded result.
- An `Iterable` in an output stays exempt with the reason `output-not-json`, because an iterable can have no end. So a sub-program cannot take an `Iterable`.
- The new exports `CODEC_KEYWORD` and `ExportsCodec` give the keyword and its values.
- `@procedures/algebra` has 44 procedures (before 41), `@procedures/quantity` has 31 (before 27), and `@procedures/statistics` has 82 (before 81). The new procedures include `quantity.convertExact`, `quantity.parseUnit`, `algebra.parseExpr` and `statistics.runningOf`.

PATCH: before 1.0.0, a backward-compatible feature raises PATCH. A manifest with no codec loads as before.
