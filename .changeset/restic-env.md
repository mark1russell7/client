---
"@procedures/restic": minor
---

A host can give secrets only to the restic process, and the package root exports the functions of `restic.run`.

- `runRestic(command, options)` starts a restic command and reads its JSON output. Its `env` option gives variables (for example `RESTIC_PASSWORD`, `RESTIC_REPOSITORY` and `B2_ACCOUNT_ID`) only to the restic process. The environment of the host does not change.
- `createResticModule({ env, run })` gives the module with those settings. The procedure input still has no field for a secret.
- `findRestic()` finds the program: `RESTIC_EXE`, then on Windows the `restic*.exe` of a WinGet package, then `restic` on the `PATH`.
- The `run` option replaces the function that starts restic, so a test can give a fake runner.

The input, the output and the effects of `restic.run` do not change.
