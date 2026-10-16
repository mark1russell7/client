# @procedures/mark

## 0.2.3

### Patch Changes

- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3
  - @procedures/peer@0.2.3
  - @procedures/procedure@0.2.3
  - @procedures/lib@0.2.3
  - @procedures/cli-run@0.2.3
  - @procedures/pnpm@0.2.3
  - @procedures/shell@0.2.3
  - @procedures/vitest@0.2.3
  - @procedures/mcp-dev-tools@0.2.3
  - @procedures/server@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2
  - @procedures/cli-run@0.2.2
  - @procedures/lib@0.2.2
  - @procedures/pnpm@0.2.2
  - @procedures/procedure@0.2.2
  - @procedures/peer@0.2.2
  - @procedures/shell@0.2.2
  - @procedures/vitest@0.2.2
  - @procedures/mcp-dev-tools@0.2.2
  - @procedures/server@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1
  - @procedures/cli-run@0.2.1
  - @procedures/lib@0.2.1
  - @procedures/pnpm@0.2.1
  - @procedures/procedure@0.2.1
  - @procedures/peer@0.2.1
  - @procedures/shell@0.2.1
  - @procedures/vitest@0.2.1
  - @procedures/mcp-dev-tools@0.2.1
  - @procedures/server@0.2.1

## 0.2.0

### Minor Changes

- 0cf4bea: **Invocation capabilities** (packages/documentation/CAPABILITIES-2026-10.md, the guide is client/docs/CAPABILITIES.md). Each call operates with a capability: a clearance, permitted effects and a deadline. A nested call gets the same capability or a narrower one.
  
  - Procedures declare `metadata.effects` (`reads`, `writes`, `destructive`, `idempotent`). Each procedure of these packages declares them.
  - `hostPolicy({ capability, readOnly, clearanceOrder, resources, admitItem })`, and `new Client({ capability })`. A refused call gives `FORBIDDEN` (HTTP 403) with a reason.
  - `ctx.capability` and `ctx.resources` are new required fields of `ProcedureContext`. A test that makes a context by hand adds `capability: {}` and `resources: {}`.
  - An application gives its clearance and resource types by augmenting `Register`.
  - The timeout interceptor sets the deadline of the capability, and a remote call sends the remaining time.
  - The MCP tools have hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) from the effects. `mark mcp --read-only` (or `MCP_READ_ONLY=1`) serves only the tools that change nothing.
  - **Breaking:** `git.remote` only reads the URL. `git.remote.set` sets it (before: `git.remote` with `url`).

### Patch Changes

- 44d3e30: `mark --version` and `client-registry version` show the version of the package. Before, they showed `1.0.0`. The help of `client-registry` links to the site, not to a placeholder repository.
- Updated dependencies [0cf4bea]
- Updated dependencies [44d3e30]
- Updated dependencies [76d0d64]
  - @procedures/client@0.2.0
  - @procedures/mcp-dev-tools@0.2.0
  - @procedures/cli-run@0.2.0
  - @procedures/lib@0.2.0
  - @procedures/pnpm@0.2.0
  - @procedures/procedure@0.2.0
  - @procedures/peer@0.2.0
  - @procedures/shell@0.2.0
  - @procedures/vitest@0.2.0
  - @procedures/server@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
