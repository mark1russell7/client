---
"@procedures/client": patch
"@procedures/compiler": patch
---

The kernel `@mark1russell7/coeval` goes from `^0.5.0` to `^0.6.3` in `@procedures/client` and `@procedures/compiler`.

PATCH: a dependency update with no change that a caller can see.

- Since coeval 0.6.3, the kernel gives a `Failure` of the host its own error value, without a cause. The client now keeps a `Failure` that a procedure throws as the cause of that error value. Thus `client.exec()`, `runProgram()`, `client.tryCatch` and `client.parallel` give the same `Failure` and the same message `<code> <reason>` as with coeval 0.5. The tests in `program.test.ts` pin this.
- In coeval 0.6.3, an attribute of the standard tree that holds `undefined` no longer reads as `#N/A`. The world of a program has no standard tree, and its names are plain objects. Thus a `$ref` gives the same result as before.
- In coeval 0.6.0, `mergeMachines` refuses a name that two machines define, unless the later machine names it in `replaces`. The client does not merge machines.
- The declarations of `PROGRAM_WORLD`, `programMachine()`, `documentAt()` and `ProgramDocument` use the coeval types `World`, `Machine`, `Key` and `Json`. These types have no change. The types that `Machine` reaches get only new optional fields. The public API snapshot has no change.
