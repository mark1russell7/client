---
"@procedures/pnpm": patch
"@procedures/snapshot": patch
---

`snapshot.create` reads the pnpm version from the `package.json` of the pnpm package. It starts no program, so its declared effects hold without `process`.

- The new function `installedPnpmVersion()` of `@procedures/pnpm` gives the version of the pnpm that `resolvePnpm()` finds. It starts no program.
- When no `package.json` of a pnpm package is beside the program, the snapshot records the version as `unknown`.
- `@procedures/snapshot` does not depend on `@procedures/shell`.
