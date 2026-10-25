# @procedures/compiler

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
