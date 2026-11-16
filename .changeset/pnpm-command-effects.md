---
"@procedures/pnpm": minor
---

Each pnpm procedure declares the same effects: it reads `fs` and `network`, and it writes `fs` and `process`.

- Before each command, pnpm reads the configuration of the working folder. Then it installs the config dependencies of the project from the registry, and it loads the `.pnpmfile.cjs` of the project. It can also start the pnpm that the field `packageManager` names.
- These steps are code of the project. So `pnpm.list`, `pnpm.why`, `pnpm.outdated` and `pnpm.store.path` also write `process`, as `pnpm.install` does.
- A test starts the real `pnpm list` in a project whose `.pnpmfile.cjs` writes a file, and it finds the file.

## Break

A host whose capability has no `process` or no `network` refuses each pnpm procedure, also `pnpm.list`, `pnpm.why`, `pnpm.outdated` and `pnpm.store.path`.

Migration for the site and each app:

1. Find each host that uses a pnpm procedure with a capability.
2. Give that capability `process` and `network`, or use the procedure without a capability. Under a root, the pnpm procedures stay refused.
