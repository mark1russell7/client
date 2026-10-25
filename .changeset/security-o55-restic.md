---
"@procedures/restic": minor
---

`restic.run` takes its program from the host, never from the input (audit pass 2, roadmap O55).

MINOR (breaking, pre-1.0): the input `executable` is removed. An input with `executable` now gets a validation error. Before, the input let each caller of `restic.run` start any program of the host, with arguments that it chose.

- New: the option `executable` of `createResticModule()` and `createResticProcedures()`. The default stays the same: `RESTIC_EXE` of the environment of the host, then `restic`.
- `runRestic(command, { executable })` and `findRestic()` do not change: they are functions of the host, not procedure input.

Migration:

- jarvis: no change. It calls `runRestic()` with the result of `findRestic()`, not `restic.run`.
- The site, MiniMongo and Graph: no change. They do not call `restic.run`.
- A host that sent `executable` in the input of `restic.run` gives it to `createResticModule({ executable })`, or sets `RESTIC_EXE`.
