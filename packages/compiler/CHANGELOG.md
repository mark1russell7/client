# @procedures/compiler

## 0.65.0

### Patch Changes

- 4e20391: Handles in the exports generator (d40-handles). A parameter or an output of a class type gets a handle. Its schema has the keyword `x-procedures-handle` with the kind of the class, for example `node:sqlite#DatabaseSync`. The loader keeps the object of an output in the handle scope of the caller. It gets the object of a handle input from the same scope. A procedure that takes a handle reads `handles`, and a procedure that gives a handle writes `handles`. Thus a function that was exempt because of a class instance gets a procedure. `closeValue` of `@procedures/client` closes an object as a scope closes it.
- abf52af: Handles for the inputs of an interface (d40-handles). In the exports generator, a parameter of an interface takes a handle of each class of the package that is assignable to it. For example, a `SqlConnection` takes a `node:sqlite#DatabaseSync`. A parameter of a type parameter uses its constraint. An input with more than one kind has the list of the kinds in `x-procedures-handle`. `handleSchema` and `HandleScope.get` of `@procedures/client` also take a list of kinds. The manifest of `@procedures/optional` has the members of two `Result` unions in a different sequence. The schemas accept the same values.
- 420ebdc: `@procedures/sqlite` has generated procedures for 9 functions of `@mark1russell7/sqlite` (d40-handles). `sqlite.openDatabase` gives a database handle in the scope of the caller. The other 8 procedures take the handle, for example `sqlite.tableColumns` and `sqlite.checkIntegrity`. The register entry also registers `handle.list` and `handle.close`.
  
  `exportsModule()` of `@procedures/compiler` also takes a loader in place of the functions. The first call loads the package one time. A failed load does not stay. The overlay of a wrap can give the rules under a root of a host (`fsRoot`). The loader gives them to each procedure as `metadata.fsRoot`.
  
  The MCP tools do not change: `@procedures/bundle-mcp` keeps the new procedures out of the tools.
- f1c599f: The generator of `@procedures/compiler` gives the members of a union a canonical sequence. Before, the sequence came from the type ids of TypeScript, and a new call of the checker changed it.
  
  - The `anyOf` and `enum` lists start with the primitive types. The number literals and the bigint literals follow by value. Then come the string literals by code unit. The other types come last, by the code units of their text.
  - The names of the definitions come from the same sequence. Thus a change in a different part of the generator does not rename a definition.
  - A manifest keeps only the definitions that its procedures reach through `$ref`. A function that the generator refused kept dead definitions before.
  
  The manifests of the wrap packages change only in the sequence of their lists, and lose definitions with no reference. Their schemas accept the same values.
- Updated dependencies [4e20391]
- Updated dependencies [abf52af]
- Updated dependencies [a2a09b7]
- Updated dependencies [ffb85af]
  - @procedures/client@0.65.0

## 0.64.0

### Patch Changes

- Updated dependencies [6f8219e]
- Updated dependencies [bdca30d]
- Updated dependencies [dfd04b7]
- Updated dependencies [7d303f3]
- Updated dependencies [ce0d511]
- Updated dependencies [49b516e]
  - @procedures/client@0.64.0

## 0.63.0

### Patch Changes

- Updated dependencies [3dede6e]
  - @procedures/client@0.63.0

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
- Updated dependencies [02582c5]
- Updated dependencies [365aad4]
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
- b3e65e7: A function parameter of a wrapped package is a sub-program (d40-language-ops). A sub-program is one call of a pure procedure, as data. It reads the parameters of the function as `{ "$ref": "<name>" }`. In a program, `"$when": "$never"` keeps it as data.
  
  - The generator gives the position a schema with the keyword `x-procedures-program` (`PROGRAM_KEYWORD`). The keyword gives the names and the schemas of the parameters, and the schema of the result (`ExportsProgram`).
  - The loader compiles the call into a function that gives its value at once. The function uses only operators: the pure procedures of exports manifests that give no promise.
  - The loader finds each operator in the registry of the caller and obeys its `expose` rule. It examines the input of each operator and the result with their schemas.
  - A function that a sub-program cannot give stays exempt with the reason `function-parameter`. A function in an output gives the reason `output-not-json`.
  - A trailing absent argument before a rest parameter stays in its position. Before, the rest moved into the absent parameters.
  - `@procedures/statistics` has 81 procedures, not 74. The statistic of `bootstrap`, `bootstrapClusters`, `bootstrapStrata`, `bootstrapTwo`, `pairedPermutation` and `twoSamplePermutation` is a sub-program. So are the cluster of `bootstrapClusters` and the option `information` of `choosePair`.
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
- Updated dependencies [14f61a7]
  - @procedures/client@0.62.0

## 0.61.0

### Patch Changes

- 56cd2bc: The generator of procedures from the types of a package (direction 40). `generateExportsManifest()` of the new entry `@procedures/compiler/generate` reads the declaration files of a package. It gives a manifest as data: a procedure for each public function whose inputs and output are JSON. The JSON Schemas come from the types, and the descriptions come from the doc comments. Each other function gets an exemption with its reason. `exportsModule(manifest, functions)` gives the procedure module of a manifest, also in a browser.
  
  - The entry `./generate` reads the compiler API of TypeScript 5 as the optional peer `typescript-api` (`npm:typescript@^5.9.3`), because TypeScript 7 has no compiler API in JavaScript.
  - A type that does not resolve fails closed: it gives an exemption, not a schema that accepts each value. A re-export that does not resolve gets the exemption `unresolved`.
  - The generator reads the real path of the declaration file, as Node.js does. Thus a package that pnpm links into `node_modules` resolves its own imports.
  - A call in process gives the JSON form of the output, as a call over HTTP does. An `undefined` item of an array becomes `null`, and a property with an `undefined` value is absent.
- Updated dependencies [8506442]
- Updated dependencies [f9a78f9]
- Updated dependencies [3eb4b59]
  - @procedures/client@0.61.0

## 0.60.1

### Patch Changes

- Updated dependencies [beca782]
- Updated dependencies [6dbc47e]
- Updated dependencies [663465c]
- Updated dependencies [66585f5]
- Updated dependencies [511d820]
- Updated dependencies [02a7074]
- Updated dependencies [265f41c]
- Updated dependencies [a87cdda]
- Updated dependencies [94b5f88]
- Updated dependencies [ca23351]
- Updated dependencies [84e1b25]
- Updated dependencies [fe6cd23]
- Updated dependencies [e9b7551]
  - @procedures/client@0.60.1

## 0.60.0

### Patch Changes

- Updated dependencies [3075d86]
  - @procedures/client@0.60.0

## 0.59.1

### Patch Changes

- Updated dependencies [425ea64]
- Updated dependencies [ea801cd]
- Updated dependencies [74ddeff]
- Updated dependencies [6513a83]
- Updated dependencies [8c69a74]
- Updated dependencies [74ddeff]
- Updated dependencies [6cc8f0e]
  - @procedures/client@0.59.1

## 0.59.0

### Patch Changes

- Updated dependencies [8f8e5b2]
  - @procedures/client@0.59.0

## 0.58.2

### Patch Changes

- Updated dependencies [217871c]
  - @procedures/client@0.58.2

## 0.58.1

### Patch Changes

- Updated dependencies [1d47080]
  - @procedures/client@0.58.1

## 0.58.0

### Patch Changes

- Updated dependencies [11f5035]
  - @procedures/client@0.58.0

## 0.57.0

### Patch Changes

- @procedures/client@0.57.0

## 0.56.0

### Minor Changes

- 13996cf: The release train: the ranges of @mark1russell7/coeval, @mark1russell7/quantity, @mark1russell7/text, @mark1russell7/files change to a version outside the old range. This release has breaking changes.

### Patch Changes

- Updated dependencies [13996cf]
  - @procedures/client@0.56.0

## 0.55.2

### Patch Changes

- @procedures/client@0.55.2

## 0.55.1

### Patch Changes

- @procedures/client@0.55.1

## 0.55.0

### Minor Changes

- fd9c6d4: The release train: the ranges of @mark1russell7/coeval change to a version outside the old range. This release has breaking changes.

### Patch Changes

- Updated dependencies [fd9c6d4]
  - @procedures/client@0.55.0

## 0.54.1

### Patch Changes

- Updated dependencies [13c3a8b]
  - @procedures/client@0.54.1

## 0.54.0

### Patch Changes

- 1401489: The tarball of each package leaves out `dist/.tsbuildinfo`. The `files` list of each package has the entry `!dist/.tsbuildinfo` after `dist`.
  
  The build writes this file for incremental builds. An app does not use it, and it added its size to each tarball (61 KB in `@procedures/json` 0.52.3). The conventions rule `pack-no-buildinfo` finds it.
  
  PATCH: the exports and the behavior do not change.
- Updated dependencies [ef8e080]
- Updated dependencies [1401489]
  - @procedures/client@0.54.0

## 0.53.1

### Patch Changes

- Updated dependencies [84f0c78]
- Updated dependencies [abf290c]
  - @procedures/client@0.53.1

## 0.53.0

### Patch Changes

- The packages use the new versions of their dependencies of the owner: `@mark1russell7/service` `^0.8.3`, `@mark1russell7/coeval` `^0.26.1` and `@mark1russell7/docker-sqlite` `^0.3.0`. The range of `@mark1russell7/collections` stays `^0.5.0`: its version 0.7.0 and later remove names that `@procedures/collections` exports.
- Updated dependencies [bc98f77]
- Updated dependencies [11d9084]
- Updated dependencies [d28ccb5]
- Updated dependencies [735cfcf]
- Updated dependencies
- Updated dependencies [556d0a8]
  - @procedures/client@0.53.0

## 0.52.5

### Patch Changes

- Updated dependencies [25a5f44]
  - @procedures/client@0.52.5

## 0.52.4

### Patch Changes

- @procedures/client@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [db1bcaa]
  - @procedures/client@0.52.3

## 0.52.2

### Patch Changes

- @procedures/client@0.52.2

## 0.52.1

### Patch Changes

- @procedures/client@0.52.1

## 0.52.0

### Patch Changes

- @procedures/client@0.52.0

## 0.51.0

### Patch Changes

- Updated dependencies [0c3bfa3]
  - @procedures/client@0.51.0

## 0.50.0

### Patch Changes

- Updated dependencies [54cdb34]
  - @procedures/client@0.50.0

## 0.49.1

### Patch Changes

- Updated dependencies [a11008a]
  - @procedures/client@0.49.1

## 0.49.0

### Patch Changes

- Updated dependencies [bf0aa79]
- Updated dependencies [a1aedc5]
  - @procedures/client@0.49.0

## 0.48.2

### Patch Changes

- Updated dependencies [08beec5]
- Updated dependencies [48b7127]
  - @procedures/client@0.48.2

## 0.48.1

### Patch Changes

- Updated dependencies [2d7edae]
  - @procedures/client@0.48.1

## 0.48.0

### Minor Changes

- c839add: The release train: the ranges of @mark1russell7/coeval, @mark1russell7/quantity, @mark1russell7/collections, @mark1russell7/cue change to a version outside the old range.

### Patch Changes

- 17a18ec: The source now uses only syntax that a type stripper erases, so the setting `erasableSyntaxOnly` of `@mark1russell7/cue` 2.1.1 stays on. Each enum is now a constant object with a type of the same name. Each parameter property is now a field and an assignment in the constructor.
  
  **Breaking.** MINOR before 1.0.0: `ErrorCategory`, `ErrorSeverity` and `WebSocketState` are now constant objects. Their names and values stay the same, and each member stays usable as a type. A member is no longer a constant expression: `enum E { A = ErrorSeverity.WARNING }` gives TS18033, and a `const enum` gives TS2474. Also, a string with the value of a member now fits the type of the set.
  
  **Migration.** In an enum initializer, write the value in place of the member, for example `"warning"`, or use a constant object. Other uses need no change. The site and the known apps need no change.
- Updated dependencies [17a18ec]
- Updated dependencies [06088f9]
- Updated dependencies [71f9c6e]
- Updated dependencies [c839add]
  - @procedures/client@0.48.0

## 0.47.2

### Patch Changes

- Updated dependencies [0650616]
- Updated dependencies [ae1e3fd]
- Updated dependencies [f1ece74]
  - @procedures/client@0.47.2

## 0.47.1

### Patch Changes

- Updated dependencies [f845c6d]
  - @procedures/client@0.47.1

## 0.47.0

### Minor Changes

- 2f0c7b0: The release train: the ranges of @mark1russell7/coeval change to a version outside the old range.
- ad70c38: The release train: the ranges of @mark1russell7/coeval change to a version outside the old range.
- 47819c6: The release train of 2026-11-02: the ranges of `@mark1russell7/coeval` change from `^0.15.0` to `^0.17.0`. In coeval 0.17.0, `conforms` has a new truth for `formula.if`, `formula.and` and `formula.or`.

### Patch Changes

- e913014: Each module imports zod with `import * as z from "zod"`, not `import { z } from "zod"`. With the old form, an esbuild bundle got each locale of zod: 264 kB of minified code (esbuild metafile of the journey worker of the site). The Vite build of the site gives the same worker files with both forms. The procedure scaffolder writes the new form in `types.ts`. The API and the behavior stay the same.
- Updated dependencies [c9125a8]
- Updated dependencies [335728b]
- Updated dependencies [d987202]
- Updated dependencies [45a737f]
- Updated dependencies [d77e9e8]
- Updated dependencies [e913014]
- Updated dependencies [2f0c7b0]
- Updated dependencies [ad70c38]
- Updated dependencies [47819c6]
  - @procedures/client@0.47.0

## 0.46.0

### Minor Changes

- 10dcc3c: The release train: the ranges of @mark1russell7/coeval change to a version outside the old range.

### Patch Changes

- Updated dependencies [10dcc3c]
  - @procedures/client@0.46.0

## 0.45.0

### Minor Changes

- 70b2245: The release train: the ranges of @mark1russell7/coeval change to a version outside the old range.

### Patch Changes

- Updated dependencies [fbb50fa]
- Updated dependencies [845902b]
- Updated dependencies [70b2245]
  - @procedures/client@0.45.0

## 0.44.0

### Minor Changes

- 19b7a25: The release train: the ranges of @mark1russell7/coeval change to a version outside the old range.

### Patch Changes

- Updated dependencies [4dada47]
- Updated dependencies [19b7a25]
  - @procedures/client@0.44.0

## 0.43.0

### Patch Changes

- @procedures/client@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [7ca9953]
- Updated dependencies [226ae02]
- Updated dependencies [e4cb0cf]
  - @procedures/client@0.42.0

## 0.41.1

### Patch Changes

- Updated dependencies [69cee92]
  - @procedures/client@0.41.1

## 0.41.0

### Minor Changes

- fc52431: The release train: the ranges of @mark1russell7/coeval change to a version outside the old range.

### Patch Changes

- Updated dependencies [37deb07]
- Updated dependencies [fc52431]
  - @procedures/client@0.41.0

## 0.40.0

### Patch Changes

- @procedures/client@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [55d1e4d]
  - @procedures/client@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [c6fba49]
  - @procedures/client@0.38.0

## 0.37.0

### Patch Changes

- @procedures/client@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [f1fae86]
  - @procedures/client@0.36.0

## 0.35.1

### Patch Changes

- cc80f74: PATCH: internal, no change to the public API. The procedure boilerplate of tracker item O65, after O58.
  
  - The `src/module.ts` of 37 packages gives its module and its register function with `definePackage()`. Each export keeps its name, its type and its behavior. The root and `./module` register nothing. `./register` registers in the global registry, as before.
  - The output schemas of `ics.parse`, `ics.fetch`, `json.query`, `json.patch`, `json.merge` and `yaml.parse` have the type of the declared output (`z.ZodType<T>`). The validation and the JSON Schema stay the same.
  - The `described()` helper of `@procedures/mongo` uses `typed<T>()` instead of the deprecated `zodAdapter()`. Its schemas validate and describe the input as before.
- Updated dependencies [9f0405d]
- Updated dependencies [f5c2407]
  - @procedures/client@0.35.1

## 0.35.0

### Patch Changes

- @procedures/client@0.35.0

## 0.34.0

### Patch Changes

- fa1a61a: Less boilerplate in each procedure definition (dedupe review F1, tracker item O58).
  
  PATCH (pre-1.0): this change adds exports and deprecates names. It removes no export and changes no behavior.
  
  - `@procedures/client` has the new export `typed<T>()`. It is the one pass-through schema that gives only the type `T`.
  - `@procedures/client` has the new export `definePackage(name, procedures, requires?)`. It gives `{ module, register }` and registers nothing at the call. The new type `PackageDefinition` is its result.
  - `zodAdapter` is deprecated. `input()` and `output()` take each Standard Schema and infer its type, so a zod schema goes in directly.
  - `typedAnySchema` and `outputSchema` are deprecated. Use `typed<T>()`. They give the same pass-through schema.
  - The procedures of the packages give their zod schemas to `input()` and `output()` directly. The `.build() as AnyProcedure` casts are gone. The schemas, the types of the exports and the validation do not change.
  - `mark procedure new` writes `.input(<Name>InputSchema)` and `.output(<Name>OutputSchema)`, without `zodAdapter`.
  
  Migration:
  
  - Apps: no change at this time. The deprecated names work until the next MINOR.
  - Before the next MINOR, replace `zodAdapter<T>(schema)` with `schema`. To keep the check of a schema against a type, write `const schema: z.ZodType<T> = ...`.
  - Before the next MINOR, replace `typedAnySchema<T>()` and `outputSchema<T>()` with `typed<T>()`.
  - A parse-only object (`{ parse }`) in `zodAdapter` becomes a Standard Schema with a `~standard` property.
- Updated dependencies [d4376c2]
- Updated dependencies [fa1a61a]
  - @procedures/client@0.34.0

## 0.33.0

### Patch Changes

- @procedures/client@0.33.0

## 0.32.0

### Patch Changes

- @procedures/client@0.32.0

## 0.31.0

### Patch Changes

- @procedures/client@0.31.0

## 0.30.0

### Patch Changes

- @procedures/client@0.30.0

## 0.29.0

### Patch Changes

- @procedures/client@0.29.0

## 0.28.1

### Patch Changes

- Updated dependencies [345c740]
- Updated dependencies [984c13b]
- Updated dependencies [21dc858]
  - @procedures/client@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [06694d7]
  - @procedures/client@0.28.0

## 0.27.8

### Patch Changes

- Updated dependencies [1834a5e]
  - @procedures/client@0.27.8

## 0.27.7

### Patch Changes

- @procedures/client@0.27.7

## 0.27.6

### Patch Changes

- Updated dependencies [d322bef]
  - @procedures/client@0.27.6

## 0.27.5

### Patch Changes

- @procedures/client@0.27.5

## 0.27.4

### Patch Changes

- Updated dependencies [8970a1e]
  - @procedures/client@0.27.4

## 0.27.3

### Patch Changes

- @procedures/client@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2

## 0.27.1

### Patch Changes

- 146d38e: The kernel `@mark1russell7/coeval` goes from `^0.5.0` to `^0.6.3` in `@procedures/client` and `@procedures/compiler`.
  
  PATCH: a dependency update with no change that a caller can see.
  
  - Since coeval 0.6.3, the kernel gives a `Failure` of the host its own error value, without a cause. The client now keeps a `Failure` that a procedure throws as the cause of that error value. Thus `client.exec()`, `runProgram()`, `client.tryCatch` and `client.parallel` give the same `Failure` and the same message `<code> <reason>` as with coeval 0.5. The tests in `program.test.ts` pin this.
  - In coeval 0.6.3, an attribute of the standard tree that holds `undefined` no longer reads as `#N/A`. The world of a program has no standard tree, and its names are plain objects. Thus a `$ref` gives the same result as before.
  - In coeval 0.6.0, `mergeMachines` refuses a name that two machines define, unless the later machine names it in `replaces`. The client does not merge machines.
  - The declarations of `PROGRAM_WORLD`, `programMachine()`, `documentAt()` and `ProgramDocument` use the coeval types `World`, `Machine`, `Key` and `Json`. These types have no change. The types that `Machine` reaches get only new optional fields. The public API snapshot has no change.
- Updated dependencies [146d38e]
  - @procedures/client@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1

## 0.26.0

### Minor Changes

- a16af64: Changed: a program runs on the kernel of coeval (`@mark1russell7/coeval` `^0.5.0`, roadmap item M14, coeval decision D13). The program format and its rules do not change.
  
  - The range `^0.5.0` of `@mark1russell7/coeval` has the kernel fixes of 0.4.1 to 0.4.3 (the narrowing of capabilities in `check()`, the place of a compile throw and of a waiting runner, the step parts after a failed `let`, `#DEPTH!` for an endless recursion, unknown `ops.*`/`ext.*` names in `check()`, `docEquals()` on dates and maps). The types of the client that name coeval types stay the same, with one addition: `Machine`, the type that `programMachine()` gives, has the new optional member `known` (coeval 0.4.3). `World`, `Key`, `Json` and `EvalError` do not change.
  
  - `desugarProgram()` changes the `$proc` form into a run document of coeval, and one run of the kernel runs it (`runProgram()`). `client.exec()`, `client.execStream()`, `hydrateInput()`, `prepareRootCall()`, `executeRef()`, the control-flow procedures and the body of a defined procedure use this run.
  - Each call of a program is an effect. The client does it with `client.call()`, so `invokeProcedure()` stays the authority for the admission, the validation, the interceptors and the exposure rules of each call. A failed call throws the same error as before, with its message and its code.
  - The logic of `client.chain`, `client.parallel`, `client.conditional`, `client.and`, `client.or`, `client.map`, `client.reduce` and `client.tryCatch` is a runner of the kernel. The procedures keep their registrations and their schemas.
  - The envelope form reads its envelopes with the helpers of coeval. Its literal stays `{ "type": "literal", "value": x }`, as in 0.23.0, and `toEnvelopeProgram()` writes this form. The type `"lit"` (the kind of the kernel, coeval D12) is an alias: `{ "type": "lit", "value": x }` is also a literal.
  - New exports: `runProgram`, `runDocument`, `runControl`, `runOperand`, `programMachine`, `PROGRAM_WORLD`, `desugarProgram`, `desugarInput`, `desugarControlValue`, `originOf`, `documentAt`, `namesOfScope`, `scopeOfNames`, `nameKey`, `nameOfKey` and their types.
  - `@procedures/compiler`: the name rules (`unknown-name`, `use-before-definition`) run through `check()` of the static kit of coeval on the run document. New exports `nameDiagnostics()` and `bindScopes()`. `resolveScopes()` gives the same diagnostics, with the same codes and messages, in a different order (see below).
  - PROGRAM-FORMAT.md revision 2: section 13 "Programs on the kernel of coeval".
  
  MINOR (D26): before 1.0.0, a breaking change raises MINOR. These behaviors change:
  
  1. `client.parallel` with `failFast`: the first error comes at once, as before. The other tasks now stop at their next wait, so their later calls do not start. A call that started goes on in its procedure. Before, the other tasks went on in the background to their end.
  2. `HydrateOptions.parallel`: the refs that start at the same time now always operate with failFast. After the first error, the other refs stop at their next wait. Before, they went on in the background (`Promise.all`).
  3. A call or an operand that throws `undefined`: the caller now gets `new Error(<reason>)`, with the reason of the kernel. The error of a task of `client.parallel` and the name `error` of `client.tryCatch` get that reason. Before, the caller got `undefined`, and the error text was `"undefined"`. An `Error`, a text and the other values stay as they are.
  4. `resolveScopes()` of `@procedures/compiler` gives the warnings for the raw input first, and then the diagnostics of the names. Before, the diagnostics came in the order of the program tree.
  5. In the envelope form, the types `["ref"]` and `["lit"]` (arrays of one key) are the kinds `ref` and `lit` of the kernel. Before, they were calls of the procedures with the paths `["ref"]` and `["lit"]`. A ref into the world, `{ "type": "ref", "value": ["world", "ref"] }`, stays a call of the procedure, and `toEnvelopeProgram()` now writes this type for these two procedures.
  
  Migration:
  
  - For 1 and 2: when the later calls of the other tasks must run, wait for those tasks yourself (for example, start them in a separate program and join their results), or do not use `failFast` (for 1) or `parallel` (for 2).
  - For 3: throw an `Error`.
  - For 4: sort the diagnostics by `pointer` when the order matters.
  - For 5: for a call of a procedure with the path `["ref"]` or `["lit"]`, write a ref into the world as the type: `{ "type": { "type": "ref", "value": ["world", "ref"] }, "value": input }`. Or keep the program in the `$proc` form: `{ "$proc": ["ref"], "input": input }` is a call, as before.
  
  Speed: the property tests that run each program three ways (`equivalence.test.ts` of the compiler) are about 1.4 times slower on the CI runners: 29.4 s before and 40.0 s after, the sum of the Node 22, 24 and 26 jobs, the mean of 3 runs of main and 4 runs of this change. The program tests of the client (`src/procedures/`) take about the same time: 8.5 s and 8.8 s.

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0

## 0.25.0

### Patch Changes

- 16562ee: Deprecated: five behaviors of the programs (decision D13). The next MINOR (D26: the programs on the kernel of coeval, roadmap item M14) changes them. This release changes no behavior and no API: it adds the notes "Deprecated behavior (D26)" to the doc comments, and the section "Deprecated behaviors (D26)" of PROGRAM-FORMAT.md. The functions and the options stay, so the notes are not `@deprecated` tags.
  
  - `failFast` of `client.parallel`: at this time, the other tasks go on in the background after the first error. From the next MINOR, they stop at their next wait, and their later calls do not start. When those calls must start, wait for the tasks yourself, or do not use `failFast`.
  - `HydrateOptions.parallel`: at this time, the other refs go on in the background after the first error (`Promise.all`). From the next MINOR, the refs always operate with failFast. When their calls must start, give `parallel: false`.
  - A call that throws `undefined`: at this time, the program fails with `undefined`, and the error text of `client.parallel` and `client.tryCatch` is `"undefined"`. From the next MINOR, the program fails with an `Error` that has the reason of the kernel. Throw an `Error`.
  - `resolveScopes()` of `@procedures/compiler`: at this time, the diagnostics come in the order of the program tree. From the next MINOR, the warnings for the raw input come first, and then the diagnostics of the names. Sort the diagnostics by `pointer` when the order matters.
  - The types `["ref"]` and `["lit"]` of the envelope form (arrays of one key): at this time, they are calls of the procedures with these paths. From the next MINOR, they are the kinds `ref` and `lit` of the kernel. For a call of these procedures, write a ref into the world as the type: `{ "type": { "type": "ref", "value": ["world", "ref"] }, "value": input }`. A ref into the world stays a call, and the `$proc` form does not change.
  
  PATCH: documentation only. No export, no type and no behavior changes.
- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1

## 0.24.0

### Patch Changes

- @procedures/client@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1

## 0.22.0

### Patch Changes

- @procedures/client@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0

## 0.17.4

### Patch Changes

- @procedures/client@0.17.4

## 0.17.3

### Patch Changes

- @procedures/client@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1

## 0.17.0

### Patch Changes

- @procedures/client@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0

## 0.14.1

### Patch Changes

- fc968f6: Fixed: `@procedures/geo`, `@procedures/ics` and `@procedures/splay` import `@procedures/client/browser`, not the root of `@procedures/client` (CLI-39). The root also exports `HttpServerTransport`, which imports `http`. Thus a browser build with Vite found `http` and gave a warning. The exports of the packages do not change.
  
  New: each package that operates in a browser names its browser entries in the field `client.browser` of its `package.json`. A CI check bundles each of these entries for a browser with esbuild. The check fails when an import reaches a Node built-in, with or without the prefix `node:`. The root of `@procedures/client` joins the check after CLI-6. `@procedures/splay` joins it when `splay.bridge.info` reads its version without `node:fs/promises`.
- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
  - @procedures/client@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1

## 0.12.0

### Patch Changes

- @procedures/client@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/client@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0

## 0.3.0

### Minor Changes

- 29a7b29: Outputs of the compiler (roadmap R23). `toMermaid()`, `diagramProgram()` and the procedure `program.diagram` draw a program as a Mermaid flowchart from its IR: the steps of a chain in order, the fork and the join of `client.parallel`, the decision of `client.conditional`, the `try` part and the `error` arrow of `client.tryCatch`, the loop of `client.map` and `client.reduce`, the stop arrows of `client.and` and `client.or`, and a dotted arrow from each name to each `$ref` that reads it. Dynamic and deferred calls have their own class, and `mermaidText()` writes each unsafe character as an entity code, so no label can break the syntax. `explainProgram()` and the procedure `program.explain` give the effects of a program, each call with its declared effects and the answer of `explainInvocation()` under the capability (the capability of the caller when the input has none), the diagnostics and a short summary. `toOpenRpc()` and the procedure `sdk.openrpc` write the manifest as an OpenRPC 1.3 document, with the effects as `x-effects`. `toTypeScriptSdk()` and the procedure `sdk.typescript` write a typed TypeScript SDK: an input type and an output type for each procedure, and `createSdk(client)` with `sdk.<namespace>.<name>(input)` methods. A test type-checks the SDK of the core procedures. `sdk` is not an MCP tool namespace. In `@procedures/mcp`, the description of a tool for a defined procedure with `inferredEffects` gets a sentence such as "It reads fs and changes store." (`toolDescription()`). The MCP server of `@procedures/mcp-dev-tools` has the tools `program.diagram` and `program.explain` (67 tools).
- 9bc2ddb: A new package, `@procedures/compiler`, the compiler of programs (roadmap R20 and R21). `checkProgram()` and the procedure `program.check` examine a whole program before the first call: an unknown name, a name before its step, an unknown or hidden procedure, an input that does not agree with its JSON Schema, a call that the capability refuses, a `$never` trap and the effects of the program (`may` and `must`). A call whose program the compiler cannot see fails closed under a capability that limits effects. The facts come from a registry or from a manifest, so the check works in a browser. `compileProgram()` and the procedure `program.compile` write the checked program as an `async (ctx, input) => output` function: closures for a host, and the text of an ES module (JavaScript or TypeScript) with a source map. The function makes the same calls through `ctx.client.call` in the order of the interpreter. A property test compares the interpreter and the two forms of the code on hundreds of random programs: the result, the error and the order of the calls.
- a70d445: `procedure.define` keeps the effects of its body (roadmap R22). `programCheckInterceptor()` checks the body of each definition, refuses a body with an error, and gives its effects to `procedure.define` in the internal metadata key `__inferredEffects`. Each transport removes `__` keys from a request, so a remote caller cannot claim effects. The defined procedure keeps them as `metadata.inferredEffects`, and `toolHints()` uses them: before, a defined procedure had no hints. The admission still examines each nested call. New exports: `INFERRED_EFFECTS_METADATA_KEY`, `inferredEffectsOf()`, `effectsValue()`.
- f5ed492: The check before the run in the hosts (roadmap R22). `programCheckInterceptor()` of `@procedures/compiler` checks the program of each call to a data-driven procedure before the first step. When the check finds an error, no step starts, so a refusal in step 3 comes before the write of step 1. The MCP server of `@procedures/mcp-dev-tools` uses it (`MCP_PROGRAM_CHECK=false` turns it off). `bundle-mcp` and `bundle-dev` have the compiler module, so Claude gets the tools `program.check` and `program.compile` (65 tools), and `mark program check` works.

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
