---
"@procedures/client": patch
"@procedures/compiler": patch
---

Deprecated: four behaviors of the programs (decision D13). The next MINOR (D26: the programs on the kernel of coeval, roadmap item M14) changes them. This release changes no behavior and no API: it adds the `@deprecated` notes and the section "Deprecated behaviors (D26)" of PROGRAM-FORMAT.md.

- `failFast` of `client.parallel`: at this time, the other tasks go on in the background after the first error. From the next MINOR, they stop at their next wait, and their later calls do not start. When those calls must start, wait for the tasks yourself, or do not use `failFast`.
- `HydrateOptions.parallel`: at this time, the other refs go on in the background after the first error (`Promise.all`). From the next MINOR, the refs always operate with failFast. When their calls must start, give `parallel: false`.
- A call that throws `undefined`: at this time, the program fails with `undefined`, and the error text of `client.parallel` and `client.tryCatch` is `"undefined"`. From the next MINOR, the program fails with an `Error` that has the reason of the kernel. Throw an `Error`.
- `resolveScopes()` of `@procedures/compiler`: at this time, the diagnostics come in the order of the program tree. From the next MINOR, the warnings for the raw input come first, and then the diagnostics of the names. Sort the diagnostics by `pointer` when the order matters.

PATCH: documentation only. No export, no type and no behavior changes.
