# Deep dive: the `mark` CLI and the server packages (2026-10-08)

> The report of the deep-dive agent for `mark`, `client-cli`, `client-server`, `server`, `client-playground`, `client-procedure` and `cli` (condensed). Tested on Windows against `dist/`, with a fake `USERPROFILE` for warm mode. The status of each finding is in [STATUS.md](./STATUS.md).

| ID | Severity | Where | Defect | Fix |
|---|---|---|---|---|
| CLI-1 | critical | `mark/src/cli.ts`, `server-mode.ts`, `server/src/config.ts`, `mark/Dockerfile`, compose | H19 not fixed where it matters: `mark --server` and `server` bind `0.0.0.0` with CORS `*`, no `expose`, no auth. `--port=4000` is ignored (only `--port 4000`). | Default `127.0.0.1` everywhere; an explicit LAN flag with a warning; compose on `127.0.0.1:`. |
| CLI-2 | high | `client-server/src/peer/index.ts`, HTTP server transport | CORS `*` by default and no `Host` check: any web page reaches a loopback server (`whoami` ran from `Origin: https://evil.example`), also through DNS rebinding. | CORS off; accept only `localhost`/`127.0.0.1` hosts; a lockfile token required on every call. |
| CLI-3 | high | `mark/src/client-mode.ts` | Warm mode does not send the cwd: relative paths and default `cwd` resolve in the server's folder (`mark git status` → "not a git repository"; `mark fs read` reads the server's files). | Send the cwd and run in it, or skip warm mode when it differs. |
| CLI-4 | high | `mark/src/lockfile.ts`, `client-mode.ts`, `server.stop.ts`, `server.start.ts` | "Alive" is `process.kill(pid, 0)`; Windows reuses PIDs and kills skip cleanup: a stale lockfile breaks every command (no fallback), and `server stop` killed an unrelated process. | Check `/health` and a stored peer id; signal only after that; fall back to local on `ECONNREFUSED`. |
| CLI-5 | high | `bundle-mcp`, `client-cli/.../run.ts` | `cli.run` (an MCP tool, a code procedure) runs any `mark` path, also `shell exec`, through a new `mark` process or the unrestricted warm server. | Remove `cli` from `mcpNamespaces`, or check `path` against the caller's expose rule. |
| CLI-6 | high | `server/src/cli.ts` | The standalone `server` CLI crashes at startup: importing `client-server` registers its procedures, then `registerServerProcedures()` registers them again ("already registered"). | Delete the second call; a startup smoke test. |
| CLI-7 | high | `mark/src/cli.ts` | Global flags anywhere in argv take over procedure flags: `docker compose down -v` prints the version; `docker exec -i` starts the REPL; `vite dev -h` prints help; `docker ps --format` is rejected. | Global flags only before the command path, or when the procedure does not declare them; `lib audit` rejects colliding shorts. |
| CLI-8 | medium | `mark/src/cli.ts` | Failures exit 0: unknown commands, `success: false`, non-zero `exitCode` (so `mark vitest run` never fails CI). | `process.exitCode = 1` for those. |
| CLI-9 | medium | `mark/src/parse.ts` | Values are converted without the field type: `fs exists 2024` → number; JSON content → object; `007` → 7; big numbers lose digits. | Convert by the Zod field type; strings stay strings. |
| CLI-10 | medium | `parse.ts`, `cli.ts` | Array and record flags need JSON; repeated flags keep the last; a positional array keeps the first value; extra positionals are dropped silently; help does not say JSON. | Collect repeated flags; the last array positional takes the rest; `k=v` for records; report unused positionals. |
| CLI-11 | medium | `cli.ts` | A boolean flag takes no value (`--dry-run false` is a dry run, `--amend false` amends); `--value -5` gives `true`; `--` is an option named `""`. | Accept `true`/`false` after a boolean; negative numbers; `--` and `--no-x`. |
| CLI-12 | medium | `client-cli/.../run.ts`, `client-cli/src/lockfile.ts` | `cli.run` maps arguments differently with and without a warm server (with one, a "dry run" wrote files); the shell path builds `--key value` (a value starting with `-` becomes `true`), drops `false` booleans, and trusts mark's exit code. Reads only the legacy lockfile. | One input mapping on both paths; `--key=value`; share mark's lockfile module. |
| CLI-13 | medium | `client-procedure/.../new.ts` | Scaffolded code does not compile (unused `input` with `noUnusedParameters`; no `types.ts` after `lib new`; appended types without the `z` import); the name regex rejects camelCase; `a.b.c` and `a.c` collide. | Generate `_input`; create `types.ts` with the import; `lib new` writes `types.ts`; add the registration. |
| CLI-14 | medium | `mark/src/lockfile.ts`, `client-mode.ts` | Warm mode checks no workspace or build: a server from another checkout or an old build runs the command; no fallback for new procedures or `ECONNREFUSED`. | Workspace root and build hash in the lockfile; use warm mode only when they match. |
| CLI-15 | low | `mark/src/repl.ts` | Lines run concurrently; stdin end exits at once (a piped script printed nothing). | One line at a time; exit after the last command. |
| CLI-16 | low | `mark`, `client-server` | `--transport` is never read; an invalid port becomes 3000; `run()` has no `.catch` (listen errors show a stack); the WebSocket listen has no error listener; `server.start` opens a console window on Windows. | — |
| CLI-17 | low | `mark/src/index.ts` | Importing `@mark1russell7/cli` runs the CLI (`sideEffects: false` says otherwise). | A separate `bin.ts`. |
| CLI-18 | low | `mark/src/ecosystem.ts` | `file://` URLs by string join (`#`/`%` in the path break imports); load failures shown only with `--verbose`. | `pathToFileURL`; show failures. |
| CLI-19 | low | `mark/Dockerfile`, `packages/mark/.github` | Stale: the Dockerfile copies a missing lockfile and cannot resolve `workspace:*`; the nested e2e workflow never runs; `mark` has no `test` script. | — |
| CLI-20 | low | `cli/src/commands/repo/rename.ts` | `repo rename --force` misses `tsconfig.json`, tests, configs and READMEs, and renames the external general packages too. | — |

## Architecture observations

- The argument parser does not use the schema (CLI-9 to CLI-11); `parse.ts` and `parseArgs` have no tests.
- Warm mode is a second runtime with different behavior (cwd, code version, security, failure handling). The agent recommends removing it, or making it per workspace with a token, no CORS and the cwd in each call.
- The lockfile logic exists in five copies that drifted.
- `server.*` uses pass-through `outputSchema()` for its inputs: no help, no validation.
- There is no convention for procedure-level failure (`success: false`, `exitCode`).
- `CLIMeta.interactive` and `prompts.ts` are unused.
