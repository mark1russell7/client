---
"@procedures/client": minor
"@procedures/git": minor
"@procedures/mcp": minor
"@procedures/mcp-dev-tools": minor
"@procedures/mark": minor
---

**Invocation capabilities** (packages/documentation/CAPABILITIES-2026-10.md, the guide is client/docs/CAPABILITIES.md). Each call operates with a capability: a clearance, permitted effects and a deadline. A nested call gets the same capability or a narrower one.

- Procedures declare `metadata.effects` (`reads`, `writes`, `destructive`, `idempotent`). Each procedure of these packages declares them.
- `hostPolicy({ capability, readOnly, clearanceOrder, resources, admitItem })`, and `new Client({ capability })`. A refused call gives `FORBIDDEN` (HTTP 403) with a reason.
- `ctx.capability` and `ctx.resources` are new required fields of `ProcedureContext`. A test that makes a context by hand adds `capability: {}` and `resources: {}`.
- An application gives its clearance and resource types by augmenting `Register`.
- The timeout interceptor sets the deadline of the capability, and a remote call sends the remaining time.
- The MCP tools have hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) from the effects. `mark mcp --read-only` (or `MCP_READ_ONLY=1`) serves only the tools that change nothing.
- **Breaking:** `git.remote` only reads the URL. `git.remote.set` sets it (before: `git.remote` with `url`).
