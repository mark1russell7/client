---
"@procedures/pnpm": patch
"@procedures/tailscale": patch
"@procedures/mark": patch
---

PATCH: internal, no change to the public API. The follow-ups of the one CLI-tool runner (tracker item O64).

- `pnpm.store.path` runs `pnpm store path` with argv through the nested `shell.run` call, as the other pnpm procedures do. Before, it ran a shell string with `execSync`. Its path, schemas, effects and output stay the same. It declares `calls: ["shell.run"]`.
- `tailscale.run` runs tailscale through `defineCliTool()` and the nested `shell.run` call. The engine applies its rules to that call, and a cancel stops the program. The module requires the module of `@procedures/shell`. A program that does not start still gives the error "tailscale did not start".
- `@procedures/mark` no longer declares `@clack/prompts`. No file of mark imports it since the move to `@procedures/cli-kit`.
