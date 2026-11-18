# @procedures/generators

## 0.65.0

### Patch Changes

- f1c599f: The generator of `@procedures/compiler` gives the members of a union a canonical sequence. Before, the sequence came from the type ids of TypeScript, and a new call of the checker changed it.
  
  - The `anyOf` and `enum` lists start with the primitive types. The number literals and the bigint literals follow by value. Then come the string literals by code unit. The other types come last, by the code units of their text.
  - The names of the definitions come from the same sequence. Thus a change in a different part of the generator does not rename a definition.
  - A manifest keeps only the definitions that its procedures reach through `$ref`. A function that the generator refused kept dead definitions before.
  
  The manifests of the wrap packages change only in the sequence of their lists, and lose definitions with no reference. Their schemas accept the same values.
- Updated dependencies [4e20391]
- Updated dependencies [abf52af]
- Updated dependencies [a2a09b7]
- Updated dependencies [ffb85af]
- Updated dependencies [420ebdc]
- Updated dependencies [f1c599f]
  - @procedures/client@0.65.0
  - @procedures/compiler@0.65.0

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

- Updated dependencies [4ce6ac9]
- Updated dependencies [02582c5]
- Updated dependencies [365aad4]
  - @procedures/compiler@0.62.1
  - @procedures/client@0.62.1

## 0.62.0

### Patch Changes

- b7fbc8e: A parameter that is not JSON can now get a constructed input: a pure function of the package makes its value from JSON before each call.
  
  - The generator of `@procedures/compiler` finds the factory of the type of a parameter. A factory is a pure export with one signature that gives an object. The schema of the parameter is the input of the factory, with the new keyword `x-procedures-construct`.
  - When more than one factory gives a type, the new field `constructors` of the overlay names one. Without it, the function stays exempt, and the detail names the factories.
  - The loader `exportsModule()` makes a new value with the factory before each call. It throws when the package does not export the factory.
  - The new exports `CONSTRUCT_KEYWORD` and `ExportsConstruct` give the keyword and its value.
  - Fix: a function parameter whose result is a function now gets the exemption `function-parameter`. Before, its sub-program gave JSON where the package expected a function.
  - `@procedures/generators` now has 23 procedures, for 23 of the 31 functions of `@mark1russell7/rigor-generators`. Six designs take a `Random` as the input of `random`, for example `{ "seed": 7 }`.
  - The new program `latin-hypercube-from-a-label` of `wraps.programs.json` uses a constructed input.
  
  PATCH: before 1.0.0, a backward-compatible feature and a fix raise PATCH. The new overlay field is optional, and the old manifests load without a change.
- 9efdd12: The new package `@procedures/generators` gives the functions of `@mark1russell7/rigor-generators` as procedures: seeds, hashes, canonical JSON, draws and designs. It is the second wrap package of direction 40.
  
  - The package has 17 procedures in the namespace `generators`, for 17 of the 31 functions of `@mark1russell7/rigor-generators` 0.2.0. Each procedure has no effects. The README gives the reason for each of the other 14 functions.
  - The generator of `@procedures/compiler` puts a named union into `$defs` one time. Before, a recursive union, for example `DistributionSpec` of `rigor-generators`, overflowed the stack. For an output with an `undefined` member, the schema is the definition or `null`.
  - The generator fails closed on a schema deeper than 64 levels: the function gets an exemption.
  - The manifest of `@procedures/statistics` now has its named unions in `$defs`. The procedures and their inputs do not change.
  - A wrap with `"pure": true` in its `wrap.json` has the gate of kind 1. Its procedures have no effects, and `client.browser` lists its three entries.
  - The new file `wraps.programs.json` holds programs across the pure wraps. `node scripts/wraps.ts check` starts each program two times. The check fails when a result changes, when a program calls a procedure outside the pure wraps, or when no program uses a pure wrap.
  
  PATCH: before 1.0.0, a new package and a backward-compatible fix raise PATCH. No export changes in a way that breaks a caller.
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
