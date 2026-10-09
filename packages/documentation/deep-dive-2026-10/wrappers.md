# Deep dive: tool-wrapper packages (2026-10-08)

> The report of the deep-dive agent for `client-shell`, `-git`, `-docker`, `-pnpm`, `-vitest`, `-node`, `-vite`, `-cue` and `-fs`. The status of each finding is in [STATUS.md](./STATUS.md).

Scope: the July/October registers were read; the fixed items (C4 git injection, L5/L6 git options, L7/L8 vitest) were re-checked and are fixed (git uses `execFileSync` + `gitArg`; vitest uses `spawn` argv, no shell). The findings below are new or regressed. Repros ran against built `dist/` and the built dev-tools MCP server, only in a scratch folder.

## WRP-1 — critical (security, certain, empirical): `docker.*` is command-injectable and exposed to Claude over MCP

`client-docker/src/procedures/docker/*.ts`: every handler builds a command string (`["docker", ...args].join(" ")`) and runs it through `shell.exec`, which defaults to `shell: true` (`client-shell/src/types.ts:72`). User-controlled fields are interpolated unescaped: `ps` `format`/`filter`, `logs` `container`, `run` `name`/`ports`/`volumes`/`env`/`image`/`command`, `build` `tag`/`buildArgs`/`context`, `pull` `image:tag`, `exec` `container`/`command`, `rm`/`stop` `containers`, `up`/`down` `file`/`services`.

The H18 guard blocks only data-driven procedures from calling `shell.exec`; docker handlers are code procedures that call it freely.

Repro (built MCP server over stdio): `docker.ps` with `{format: "{{.ID}} & echo INJECTED> marker"}` created the marker file; `client.chain` with a step `{$proc:["docker","logs"], input:{container:"x & echo INJECTED> marker2"}}` also created its marker, with the docker daemon down.

Fix: route every docker procedure through `shell.run` (argv, `shell:false`); never join into `shell.exec`.

## WRP-2 — high (certain, empirical): `shell.stream` corrupts multibyte output split across chunks

`client-shell/src/procedures/shell/stream.ts`: each chunk is decoded separately, so a 3-byte `€` across two writes became three replacement characters. Encoding is fixed to UTF-8, and a lone `\r` does not split. Fix: decode with a `StringDecoder`.

## WRP-3 — high (certain, empirical): every `cue.*` tool fails over the MCP server

`client-cue` does its file I/O through `fs.*` procedures (`shared.ts`), but it does not register `client-fs`, and neither does `bundle-mcp`. Every `fs.*` call throws, the errors are swallowed, and `cue.validate` on a folder with `dependencies.json` answered "No dependencies.json found". Fix: `client-cue` imports `client-fs` (or uses `node:fs`), and fs errors are not turned into "not found".

## WRP-4 — high (certain): `vitest.watch` starts a process that nothing can stop, and it is an MCP tool

`watch.ts` spawns vitest detached with `unref()` and returns a pid. There is no `vitest.stop`, and no process manager. Fix: remove it from the MCP surface, or add a managed process and `vitest.stop`.

## WRP-5 — high (security, certain by code): `pnpm.*` command injection

`client-pnpm` `add`, `install`, `remove`, `link` and `run` join arguments into a `shell.exec` string. Fix: `shell.run` with argv.

## WRP-6 — medium (security, certain, empirical): `shell.which` command injection

`which.ts` runs `where ${command}` / `which ${command}` through a shell. Fix: `execFile` with an argument list.

## WRP-7 — medium (certain): `git.diff` mis-parses numstat for paths with spaces and renames

`diff.ts` splits on `\s+`. Fix: split on tabs; handle the rename form. Related: `git.status` keeps `"orig -> dest"` for renames; `git.status.short` and `git.log.oneline` are accepted and ignored.

## WRP-8 — medium (security, likely): `client-vite` runs `npx` with `shell: true` and interpolated input

`dev`, `preview` and `build` call `spawn("npx", args, { shell: true })`. Fix: resolve the project's vite and spawn it with `shell: false`.

## WRP-9 — low/medium (certain by code): `shell.stream` has no output cap or back-pressure

The line queue is unbounded. Fix: a bounded queue that pauses the child's stdout.

## WRP-10 — low (certain by code): orphaned descendant processes on Windows; process records never reaped

Kills reach only the direct child (`TerminateProcess`); grandchildren keep running. `client-node`'s `processManager.cleanup()` is never called; `node.run` buffers output without a limit.

## Architecture observations

- The fault line is `shell.exec` (default `shell: true`) against `shell.run`/`spawn` (argv). One rule closes WRP-1/5/6/8: wrappers never build shell strings.
- The H18 guard reasons about who calls `shell.exec`; an exposed code wrapper that passes tool input into a shell is itself the vector.
- Registration by import couples tool availability to bundle membership (`client-cue` assumes `fs.*`).
- `tools.snapshot.txt` pins the names, but nothing checks that the tools work. A smoke test per exposed tool would catch WRP-3 and WRP-4.
