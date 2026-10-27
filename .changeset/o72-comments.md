---
"@procedures/claude-cli": patch
"@procedures/lib": patch
---

Two source comments record an exception to a rule of the repository (the deferred findings of the invariants audit of O70). The code does not change.

- `@procedures/claude-cli`: `startTurn()` starts the turn with `spawn`, not with `runCommand()` of `@procedures/shell`. The turn must outlive its host.
- `@procedures/lib`: the pattern of the old npm scope stays. A workspace can still install the packages of the old scope.
