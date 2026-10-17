---
"@procedures/shell": patch
"@procedures/git": patch
"@procedures/docker": patch
"@procedures/pnpm": patch
"@procedures/sqlite": patch
"@procedures/lib": patch
"@procedures/procedure": patch
---

The procedures declare their rules under a root of the files in `metadata.fsRoot` (roadmap R33). Without a root, nothing changes. Under the root of a host (`confineToRoot()` of `@procedures/fs`):

- `sqlite.*` and `logs.*` are confined: `dbPath` must be in the root, and a call must give it. `:memory:` is not a path.
- `lib.scan`, `lib.graph`, `lib.audit`, `lib.rename` and `procedure.new` are confined: their folder must be in the root, and without it the folder is the root.
- Most `docker.*` procedures run docker in a working folder of the root. `docker.run`, `docker.exec`, `docker.build` and `docker.compose.*` are refused.
- `git.*`, `pnpm.*`, `lib.new`, `shell.exec` and `shell.which` are refused.
- `shell.run` and `shell.stream` run only as the nested call of a confined procedure that names them in `metadata.calls`.
- The help of the global flag `--fs-root` (`@procedures/lib/cli-flags`) tells the new rule.
