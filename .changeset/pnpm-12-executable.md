---
"@procedures/pnpm": patch
---

The pnpm procedures find pnpm 12, whose `npm_execpath` is an executable (`pnpm.exe`) and not a script. Before, on Windows they found pnpm only when a `pnpm.cjs` was on the PATH.
