---
"@procedures/git": minor
---

Under a capability without `process`, each `git.*` procedure starts no program of the repository, also without a root of the files.

Reason: these programs are code of the project, and a capability without `process` starts no code of the project.

The new rules for a call whose capability does not permit `process`:

- **Hooks:** git starts no hook. `core.hooksPath` is an empty folder for each command.
- **fsmonitor:** git starts no `core.fsmonitor` program. `core.fsmonitor` is false for each command.
- **Filters and other programs of the configuration:** before the first command in a folder, the procedure examines the repository. It refuses a key that starts a program, also in an included file. Examples are `filter.*.clean`, `diff.external`, `diff.*.textconv` and `core.sshCommand`. The error names each refused key.
- **Remote helpers:** `git.clone` and `git.remote.set` refuse a URL with `::`. The transport `ext` is off.
- **Submodules:** the procedure refuses a repository with submodules (a `.gitmodules` file in the working tree, the index or `HEAD`).
- **Partial clones:** when the capability does not permit `network` reads and `fs` writes, git does not fetch a missing object.

A refusal is `FORBIDDEN` with the reason `effects-exceeded`. The programs of the system and global configuration apply, because they are programs of the host. A call without a capability, or with `process` in its capability, operates as before.

Migration for the site and each app: a host that gives a capability gets these rules when `writes` does not include `process`. To keep the old behavior, add `process` to the `writes` of that capability: `{ effects: { writes: ["fs", "process"] } }`. Or remove the refused key from the configuration of the repository.
