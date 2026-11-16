---
"@procedures/pnpm": patch
"@procedures/snapshot": patch
---

`snapshot.create` reads the pnpm version from the `package.json` of the pnpm package. It starts no program, so its declared effects hold without `process`.

- The new function `installedPnpmVersion()` of `@procedures/pnpm` gives the version of the pnpm that `resolvePnpm()` finds. It starts no program.
- For a global shim of pnpm 12, it reads the target in `.pnpm-shim-v1-<name>-target`, or in the line `# cmd-shim-target=` of a shell shim.
- When it finds no `package.json` of a pnpm package, the snapshot records the version as `unknown`.
- `@procedures/snapshot` does not depend on `@procedures/shell`.
