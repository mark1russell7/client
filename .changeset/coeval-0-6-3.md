---
"@procedures/client": minor
"@procedures/compiler": minor
---

The kernel `@mark1russell7/coeval` goes from `^0.5.0` to `^0.6.3` in `@procedures/client` and `@procedures/compiler`.

MINOR: a breaking change before 1.0. In one case, a caller gets a different error from a program.

Changed:

- A procedure in a program can throw the class `Failure` of `@mark1russell7/coeval`. The run now gives the error value of that `Failure` (coeval 0.6.3). Before, the run gave `#CALC!` with the `Failure` as its cause.
- Thus `client.exec()`, `runProgram()` and the other runs of a program throw a different value for such a procedure. Before, they threw the `Failure` itself, with the message `<code> <reason>`. Now they throw the cause of its error value. Without a cause, they throw a new `Error` whose message is only the reason.
- The `error` of `client.tryCatch` and the `errors` of `client.parallel` read the same value. Thus their message for such a procedure has no code before the reason.
- A procedure that throws a different value has no change. No procedure of this repository throws a `Failure`.

No change:

- In coeval 0.6.3, an attribute of the standard tree that holds `undefined` no longer reads as `#N/A`. The world of a program has no standard tree, and its names are plain objects. Thus a `$ref` gives the same result as before.
- In coeval 0.6.0, `mergeMachines` refuses a name that two machines define, unless the later machine names it in `replaces`. The client does not merge machines.
- The declarations of `PROGRAM_WORLD`, `programMachine()`, `documentAt()` and `ProgramDocument` use the coeval types `World`, `Machine`, `Key` and `Json`. These types have no change. The types that `Machine` reaches get only new optional fields. The public API snapshot has no change.

Migration:

- A procedure that throws a `Failure` of coeval: to give the caller a value of your own, put it in the `cause` of the error value. To keep the code in the message, throw an `Error` with the code and the reason.
- The site: no change. It throws no `Failure`.
- MiniMongo: no change. It does not use coeval.
- Graph: no change is known. Its formula evaluators throw a `Failure` only in its own kernel runs, and the kernel changes each to its error value. Examine each procedure that can let a `Failure` out of its handler.
- jarvis: no change. It does not use coeval.
