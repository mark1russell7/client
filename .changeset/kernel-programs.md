---
"@procedures/client": minor
"@procedures/compiler": minor
---

Changed: a program runs on the kernel of coeval (`@mark1russell7/coeval` 0.3.1, roadmap item M14, coeval decision D13). The program format and its rules do not change.

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

Migration:

- For 1 and 2: when the later calls of the other tasks must run, wait for those tasks yourself (for example, start them in a separate program and join their results), or do not use `failFast` (for 1) or `parallel` (for 2).
- For 3: throw an `Error`.
- For 4: sort the diagnostics by `pointer` when the order matters.

Speed: the property tests that run each program three ways (`equivalence.test.ts` of the compiler) are about 1.4 times slower on the CI runners: 29.4 s before and 40.0 s after, the sum of the Node 22, 24 and 26 jobs, the mean of 3 runs of main and 4 runs of this change. The program tests of the client (`src/procedures/`) take about the same time: 8.5 s and 8.8 s.
