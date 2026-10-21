---
"@procedures/client": patch
"@procedures/compiler": patch
---

Changed: a program runs on the kernel of coeval (`@mark1russell7/coeval` 0.3.1, roadmap item M14, coeval decision D13). The program format and its rules do not change.

- `desugarProgram()` changes the `$proc` form into a run document of coeval, and one run of the kernel runs it (`runProgram()`). `client.exec()`, `client.execStream()`, `hydrateInput()`, `prepareRootCall()`, `executeRef()`, the control-flow procedures and the body of a defined procedure use this run.
- Each call of a program is an effect. The client does it with `client.call()`, so `invokeProcedure()` stays the authority for the admission, the validation, the interceptors and the exposure rules of each call. A failed call throws the same error as before, with its message and its code.
- The logic of `client.chain`, `client.parallel`, `client.conditional`, `client.and`, `client.or`, `client.map`, `client.reduce` and `client.tryCatch` is a runner of the kernel. The procedures keep their registrations and their schemas.
- The envelope form reads its envelopes with the helpers of coeval. Its literal is `{ "type": "lit", "value": x }` (coeval D12). The unreleased form `"literal"` is gone.
- New exports: `runProgram`, `runDocument`, `runControl`, `runOperand`, `programMachine`, `PROGRAM_WORLD`, `desugarProgram`, `desugarInput`, `desugarControlValue`, `originOf`, `documentAt`, `namesOfScope`, `scopeOfNames`, `nameKey`, `nameOfKey` and their types.
- With `failFast`, `client.parallel` gives the first error at once, and its other tasks stop at their next wait. The refs of `HydrateOptions.parallel` do the same. Before, the other tasks went on in the background.
- `@procedures/compiler`: the name rules (`unknown-name`, `use-before-definition`) run through `check()` of the static kit of coeval on the run document. New exports `nameDiagnostics()` and `bindScopes()`. `resolveScopes()` gives the same diagnostics as before.
- PROGRAM-FORMAT.md revision 2: section 13 "Programs on the kernel of coeval".

SemVer: PATCH. Before 1.0.0, a feature or a fix raises PATCH. The public API only grows, and the semantics of the programs stay: the suites of the client and the compiler, with the property tests that compare the compiled closure with the interpreter, stay green.
