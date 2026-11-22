# @procedures/quantity

## 0.68.2

### Patch Changes

- @procedures/client@0.68.2
  - @procedures/compiler@0.68.2

## 0.68.1

### Patch Changes

- @procedures/client@0.68.1
  - @procedures/compiler@0.68.1

## 0.68.0

### Patch Changes

- Updated dependencies [da6b790]
- Updated dependencies [500a6cf]
  - @procedures/client@0.68.0
  - @procedures/compiler@0.68.0

## 0.67.0

### Patch Changes

- @procedures/client@0.67.0
  - @procedures/compiler@0.67.0

## 0.66.0

### Patch Changes

- @procedures/client@0.66.0
  - @procedures/compiler@0.66.0

## 0.65.0

### Patch Changes

- f1c599f: The generator of `@procedures/compiler` gives the members of a union a canonical sequence. Before, the sequence came from the type ids of TypeScript, and a new call of the checker changed it.
  
  - The `anyOf` and `enum` lists start with the primitive types. The number literals and the bigint literals follow by value. Then come the string literals by code unit. The other types come last, by the code units of their text.
  - The names of the definitions come from the same sequence. Thus a change in a different part of the generator does not rename a definition.
  - A manifest keeps only the definitions that its procedures reach through `$ref`. A function that the generator refused kept dead definitions before.
  
  The manifests of the wrap packages change only in the sequence of their lists, and lose definitions with no reference. Their schemas accept the same values.
- Updated dependencies [e7ec32b]
- Updated dependencies [4e20391]
- Updated dependencies [abf52af]
- Updated dependencies [a2a09b7]
- Updated dependencies [ffb85af]
- Updated dependencies [420ebdc]
- Updated dependencies [f1c599f]
  - @procedures/compiler@0.65.0
  - @procedures/client@0.65.0

## 0.64.0

### Patch Changes

- c56a6cf: The README of each wrap tells that the release train starts the root script `release-train:update` after it updates a general package. When the check of the wraps fails, the script writes the manifests and the catalogs again.
- Updated dependencies [6f8219e]
- Updated dependencies [bdca30d]
- Updated dependencies [dfd04b7]
- Updated dependencies [7d303f3]
- Updated dependencies [ce0d511]
- Updated dependencies [49b516e]
  - @procedures/client@0.64.0
  - @procedures/compiler@0.64.0

## 0.63.0

### Patch Changes

- Updated dependencies [3dede6e]
  - @procedures/client@0.63.0
  - @procedures/compiler@0.63.0

## 0.62.1

### Patch Changes

- 4ce6ac9: A `bigint`, a `Map`, a `Set` and an `Iterable` input can go into a procedure: each has a codec, a JSON form.
  
  - The generator of `@procedures/compiler` gives each of these types a schema with the new keyword `x-procedures-codec`. A `bigint` is a decimal string, a `Map` is a list of entries, and a `Set` or an `Iterable` input is a list.
  - The loader `exportsModule()` decodes the input with its schema before the call. In a union, the value goes to the first member whose schema accepts it. The codec of a constructed input is decoded before its factory makes the value.
  - `jsonValue()` gives the JSON form of a `bigint`, a `Map` and a `Set` at each depth. Before, a `Map` and a `Set` became `{}` in JSON, and a `bigint` failed.
  - A sub-program gets the JSON form of each argument, and the function of the package gets the decoded result.
  - An `Iterable` in an output stays exempt with the reason `output-not-json`, because an iterable can have no end. So a sub-program cannot take an `Iterable`.
  - The new exports `CODEC_KEYWORD` and `ExportsCodec` give the keyword and its values.
  - `@procedures/algebra` has 44 procedures (before 41), `@procedures/quantity` has 31 (before 27), and `@procedures/statistics` has 82 (before 81). The new procedures include `quantity.convertExact`, `quantity.parseUnit`, `algebra.parseExpr` and `statistics.runningOf`.
  
  PATCH: before 1.0.0, a backward-compatible feature raises PATCH. A manifest with no codec loads as before.
- 2988fba: A new wrap of kind 1, made from the types of its home, with no procedure written by hand:
  
  - `@procedures/rational`: 24 of 24 functions of `@mark1russell7/rational`, exact fractions over `bigint`. The codecs of the generator give each `bigint` as a decimal string, so a rational is `{ "n": "3", "d": "2" }` in JSON.
  
  The wrap is pure. `wraps.programs.json` has a new program across two libraries: the seconds of 0.1 h plus 0.2 h, with no rounding (rational and quantity). It gives 1080 exactly.
  
  `@procedures/quantity` uses `@mark1russell7/rational` 0.1.3, the version of the new wrap, in place of 0.1.2.
  
  PATCH: before 1.0.0, a backward-compatible feature raises PATCH. The new package adds procedures and changes no procedure of another package.
- Updated dependencies [4ce6ac9]
- Updated dependencies [02582c5]
- Updated dependencies [365aad4]
  - @procedures/compiler@0.62.1
  - @procedures/client@0.62.1

## 0.62.0

### Patch Changes

- 870f429: Four new wraps of kind 1, made from the types of their homes, with no procedure written by hand:
  
  - `@procedures/predicates`: 13 of 13 functions of `@mark1russell7/predicates`.
  - `@procedures/quantity`: 27 of 32 functions of `@mark1russell7/quantity`. The other 5 hold a `bigint`.
  - `@procedures/algebra`: 41 of 46 functions of `@mark1russell7/algebra`.
  - `@procedures/optional`: 20 of 23 functions of `@mark1russell7/optional`. The other 3 are overloads.
  
  Each wrap is pure. `wraps.programs.json` has three new programs across the libraries: the netem time of a datagram (algebra and quantity), the side of the median point of a sample (predicates and statistics), and the text of a duration that can be absent (optional and quantity).
  
  Fixes of the generator of `@procedures/compiler`:
  
  - The type `{}` is each JSON value but `null`, as in TypeScript. So `NonNullable<T>` is the schema of `T` without `null`. Before, the schema was an object with no properties, so the output check of `optional.fromNullable` refused a number.
  - `ReadonlyMap` and `ReadonlySet` are not JSON, as `Map` and `Set`. The detail of an exemption now names the type.
  - The description of a parameter has no hyphen of TSDoc. This changes 15 descriptions of `@procedures/statistics` and `@procedures/generators`.
  
  PATCH: before 1.0.0, a backward-compatible feature and a fix raise PATCH. The new packages and procedures add to the API, and the fixed schemas take each value that the function takes.
- Updated dependencies [b7fbc8e]
- Updated dependencies [14f61a7]
- Updated dependencies [b3e65e7]
- Updated dependencies [9efdd12]
- Updated dependencies [870f429]
  - @procedures/compiler@0.62.0
  - @procedures/client@0.62.0
