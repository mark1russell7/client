---
"@procedures/client": patch
"@procedures/fs": patch
"@procedures/git": patch
---

Under the root of the files of a host, the `git.*` procedures are confined, not refused (roadmap R33, tracker item O35). Without a root, nothing changes. PATCH: a procedure that the root refused now works in the root.

- The core: `ProcedureContext.fsRoot` is the root of a confined call. `confineToRoot()` of `@procedures/fs` gives it to the handler of each confined procedure and of each program procedure.
- The working folder `cwd` of each `git.*` procedure must be in the root, and its default is the root. The pathspecs, the `path` of `git.blame` and of the worktree procedures, and the `dest` of `git.clone` must be in the root too.
- Under a root, git runs with `GIT_CEILING_DIRECTORIES` at the parent of the root, so it finds no repository above the root. The configuration of the system does not apply. The global configuration has only `user.name`, `user.email` and `init.defaultBranch` of the host.
- The `-c` options turn off the hooks (an empty `core.hooksPath`) and `core.fsmonitor`. Only the transports https, http, ssh and git are permitted. Git does not go into a submodule.
- Before the first command in a folder, git examines the repository. A repository outside the root (through a `.git` file or an alternate object folder), a repository with submodules, and a configuration key that starts a program are refused: `filter.*`, `diff.external`, `core.sshCommand`, `credential.helper`, `include.path` and the others. The error names each key.
- `git.clone` and `git.remote.set` refuse a URL with `::` under a root.
- `@procedures/git` now depends on `@procedures/fs` (for the rules of `@procedures/fs/root`).
