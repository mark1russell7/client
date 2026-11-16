---
"@procedures/git": minor
---

Under a capability without `process`, each `git.*` procedure starts no program of the repository, also without a root of the files.

- Git starts no hook, no `core.fsmonitor` program and no remote helper. Git does not go into a submodule.
- Before the first command in a folder, the procedure examines the repository. It refuses a configuration key that starts a program, also in an included file. Examples are `filter.*.clean` and `diff.external`. The error names each refused key.
- The procedure refuses a repository with submodules, and a URL with `::` in `git.clone` and `git.remote.set`.
- When the capability does not permit `network` reads and `fs` writes, git does not fetch a missing object of a partial clone.
- A refusal is `FORBIDDEN` with the reason `effects-exceeded`.
- The programs of the system and global configuration apply, because they are programs of the host.
- A call without a capability, or with `process` in its capability, operates as before.

Migration for the site and each app: a host with a capability without `process` gets `FORBIDDEN` for a repository whose configuration starts a program. Add `process` to the `writes` of that capability, or remove the key from the configuration of the repository.
