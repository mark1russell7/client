---
"@procedures/generators": patch
"@procedures/compiler": patch
"@procedures/statistics": patch
---

The new package `@procedures/generators` gives the functions of `@mark1russell7/rigor-generators` as procedures: seeds, hashes, canonical JSON, draws and designs. It is the second wrap package of direction 40.

- The package has 17 procedures in the namespace `generators`, for 17 of the 31 functions of `@mark1russell7/rigor-generators` 0.2.0. Each procedure has no effects. The README gives the reason for each of the other 14 functions.
- The generator of `@procedures/compiler` puts a named union into `$defs` one time. Before, a recursive union, for example `DistributionSpec` of `rigor-generators`, overflowed the stack. For an output with an `undefined` member, the schema is the definition or `null`.
- The generator fails closed on a schema deeper than 64 levels: the function gets an exemption.
- The manifest of `@procedures/statistics` now has its named unions in `$defs`. The procedures and their inputs do not change.
- A wrap with `"pure": true` in its `wrap.json` has the gate of kind 1. Its procedures have no effects, and `client.browser` lists its three entries.
- The new file `wraps.programs.json` holds programs across the pure wraps. `node scripts/wraps.ts check` starts each program two times. The check fails when a result changes, when a program calls a procedure outside the pure wraps, or when no program uses a pure wrap.

PATCH: before 1.0.0, a new package and a backward-compatible fix raise PATCH. No export changes in a way that breaks a caller.
