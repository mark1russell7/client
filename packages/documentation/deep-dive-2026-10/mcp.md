# Deep dive: the MCP stack and its exposure model (2026-10-08)

> The report of the deep-dive agent for `mcp`, `client-mcp`, `impl-mcp-dev`, `bundle-mcp` and the exposure model. The agent stopped early (an API error) after its first four findings; they are recorded here. The status of each finding is in [STATUS.md](./STATUS.md).

Bottom line of the agent: the stated boundary did not hold. Two exposed tools gave arbitrary host command execution: `cli.run`, and the 10 `docker.*` tools, directly and through `client.chain` (confirmed against the built server over stdio with harmless payloads). The data-driven guard itself held: no `$ref`/`$proc`/`$when`/implicit-chain/hydration path reached `shell.*` directly. But the guard checks only the immediate caller, so an exposed code procedure that turns its input into a command or a procedure path is a confused deputy.

The `dev-tools` server that runs in a Claude Code session is the process that started with the session: a fix takes effect only after the MCP server restarts.

| ID | Severity | Where | Defect | Fix |
|---|---|---|---|---|
| MCP-1 | critical | `client-cli/src/procedures/cli/run.ts` | `cli.run` runs `mark <path> ...` (the full registry, `shell.*` included) through `shell.run`, or through the warm `mark` server. `client.chain` → `shell.exec` is blocked, but `client.chain` → `cli.run` is not. | Remove `cli` from `mcpNamespaces`; if it stays, check `input.path` against the expose rule and never use the warm server. |
| MCP-2 | critical | `client-docker/src/procedures/docker/*.ts` | Every `docker.*` tool joins strings into `shell.exec` (a shell): injection with or without a docker daemon, also through `client.chain`. | argv through `shell.run`; validate names; reject values that start with `-`; `command` as a list. |
| MCP-3 | high | `client/src/procedures/invoke.ts`, `ref.ts` | The guard checks `isDataDriven(caller)` for the immediate caller only; data-driven → exposed code procedure → anything that code decides. The tests prove only the direct case. | Each code procedure declares the procedures it may call (`metadata.calls`), enforced for every caller; a procedure whose callees depend on its input cannot be exposed. |
| MCP-4 | high | `client/src/procedures/define-procedure.ts` | `procedure.define` never checks the target path against the expose rule; `exists` checks only the runtime map, so `replace: true` replaces any registry entry, internal procedures and exposed tools included. | Allow `replace` only over runtime-defined procedures; apply the expose rule to the target path. |
