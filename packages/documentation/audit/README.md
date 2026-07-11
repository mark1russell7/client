# Audit Raw Reports — July 2026

This folder holds the **full, unabridged per-subsystem reports** from the July 2026 client-ecosystem
audit, preserved verbatim so no finding is lost. The synthesized, deduplicated views live one level up:

- [../AUDIT-2026-07.md](../AUDIT-2026-07.md) — reality map, health scorecard, themes, security.
- [../BUGS-2026-07.md](../BUGS-2026-07.md) — deduplicated defect register with stable IDs.
- [../ROADMAP-2026-07.md](../ROADMAP-2026-07.md) — phased remediation plan.

Each report below was produced by an independent deep-read of one subsystem, verifying findings
against actual source (several confirmed by executing built `dist/`). Where the same defect appears
in more than one report (e.g. the cache-key bug in both core and collections), that redundancy is the
cross-validation — it is intentional and preserved.

| # | Report | Packages covered |
|---|---|---|
| 01 | [Core runtime](./01-core-runtime.md) | `client` (registry, Client, transports, middleware, events, server, components) |
| 02 | [Collections fork](./02-collections.md) | `client/src/collections` vs `client-collections` |
| 03 | [Dev-tooling spine](./03-dev-tooling-spine.md) | `cue`, `client-cue`, `ecosystem`, `cli`, `scaffold`, `client-lib` |
| 04 | [Transport / server / MCP](./04-transport-server-mcp.md) | `client-connection`, `client-server`, `server`, `server-mongo`, `client-server-mongo`, `mcp`, `client-mcp`, `impl-mcp-dev`, `bundle-mcp`, `bundle-dev` |
| 05 | [CLI wrappers](./05-cli-wrappers.md) | `client-shell`, `client-git`, `client-pnpm`, `client-docker`, `client-cli`, `client-node`, `client-vite`, `client-vitest`, `client-test`, `test`, `client-procedure`, `client-playground` |
| 06 | [Data layer](./06-data-layer.md) | `client-mongo`, `client-sqlite`, `MiniMongo`, `client-fs`, `client-s3`, `client-snapshot`, `docker/mongo`, `docker/sqlite` |
| 07 | [Support / UI](./07-support-ui.md) | `logger`, `client-logger`, `mock-*`, `splay`, `splay-react`, `client-splay`, `client-dag` |
| 08 | [Docs & cross-cutting health](./08-docs-cross-cutting.md) | documentation accuracy + fleet-wide git/dep/build/test sweep |

> These are point-in-time findings (2026-07-10/11). Line numbers and file paths were accurate at
> audit time; verify before acting if the code has since changed.
