---
"@procedures/fs": minor
"@procedures/server": minor
"@procedures/mark": minor
"@procedures/mcp-dev-tools": minor
"@procedures/peer": minor
"@procedures/lib": minor
---

The hosts can confine the file procedures to a root (roadmap R33).

- `confineFsProcedures(registry, root)` of `@procedures/fs` replaces the handler of each `fs.*` procedure of a registry with the handler of `createFsModule({ root })`. It adds no procedure. A nested `fs.*` call of another procedure is confined too. The root must be a folder that exists.
- `mark --fs-root <folder>` confines the `fs.*` procedures of each mode and host of `mark`: a command, the REPL, `--server`, `serve` and `mcp`. Give the flag before the command.
- A `mark` command uses a CLI server only when the server has the same root. The lockfile of `@procedures/peer` has the new field `fsRoot`, and `findServer()` compares it.
- `procedure-server --fs-root <folder>` and `mark serve --fs-root <folder>` confine the procedures of the server.
- The MCP server reads `MCP_FS_ROOT`, and `mark mcp` has the flag `--fs-root`. `fs` is not a tool namespace, so the tools do not change.
- A path outside the root gives `FORBIDDEN` with the reason `outside-root`. A procedure that reads files with `node:fs`, or that starts a program, is not confined.
- `@procedures/lib/cli-flags` has the global flags `--fs-root` and `--events`, and the field `repeatable`.
