---
"@procedures/shell": patch
"@procedures/gh": patch
"@procedures/npm": patch
"@procedures/pnpm": patch
"@procedures/docker": patch
"@procedures/cli-run": patch
"@procedures/vite": patch
"@procedures/vitest": patch
"@procedures/restic": patch
"@procedures/tailscale": patch
---

One CLI-tool runner in `@procedures/shell` (dedupe review F2, tracker item O60).

PATCH: new exports `defineCliTool` and `./testing`, no break. Before 1.0.0, a feature raises the PATCH, and the fixed group shares one version.

- The new entry `@procedures/shell/cli` gives `defineCliTool({ name, resolve, error })`. Its runner has `run`, `runJson`, `output`, `json`, `arg` and `shellInput`. Each command goes as argv to `shell.run` through `ctx.client`, never as a shell string.
- The entry also gives `cliArg()`, `buildArgv()`, `parseJsonDocument()`, `parseJsonOutput()`, the shared result `CliToolOutput` with `cliToolOutputSchema()`, and the program lookup `nodeScript()`, `execPathProgram()` and `findInPath()`. The package root exports them too.
- The new entry `@procedures/shell/testing` gives `fakeShell(results)`: the shell procedures with their real schemas, effects and root rules, and handlers that record each input. Use `shell.module` in `createRegistry()`, or `shell.client` as `ctx.client`.
- gh, npm, pnpm, docker and `cli.run` run their program through `defineCliTool()`. Each procedure keeps its path, its schemas, its effects and its behavior. The exported helpers (`resolveNpm`, `resolvePnpm`, the output types and schemas) stay.
- `PnpmCommandOutput`, `NpmCommandOutput`, `DockerCommandOutput` and `CliRunOutput` extend `CliToolOutput`. Their schemas come from `cliToolOutputSchema()`. The `stderr` description of pnpm and `cli.run` now also names the error message when the program did not start.
- `@procedures/restic` and `@procedures/tailscale` re-export `buildArgv`, `parseJsonOutput`, `FLAG_NAME` and `ArgValue` from `@procedures/shell/cli`. The two copies of `argv.ts` are gone.
- `@procedures/vite` and `@procedures/vitest` use `cliArg()` for their argument guard.
- `SERVER-LAYERS.md` records the one run path of a CLI wrapper, and the reasons.
