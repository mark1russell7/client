# Package Reference

> **Generated file — do not hand-edit.** Produced by `packages/documentation/scripts/generate-packages.mjs`
> from the workspace's package.json files and the live procedure registry.
> Regenerate with `node packages/documentation/scripts/generate-packages.mjs` after `pnpm build`.

**Packages:** 32. **Procedures:** 157. The full procedure list is in [PROCEDURES.md](./PROCEDURES.md).

Dependencies marked *(general)* are separate repositories, referenced with `github:` specifiers.

| Package | Folder | Description | Procedures | Depends on |
|---|---|---|---|---|
| `@procedures/bundle-dev` | `packages/bundle-dev` | Dev workflow bundle - aggregates client packages for development | — | `client`, `client-cli`, `client-pnpm`, `client-lib`, `client-git`, `client-dag`, `client-fs`, `client-shell`, `client-procedure` |
| `@procedures/bundle-mcp` | `packages/bundle-mcp` | Curated MCP bundle - high-level orchestration tools for Claude | — | `client`, `client-lib`, `client-procedure`, `client-cue`, `client-docker`, `client-mongo`, `client-sqlite`, `client-vitest` |
| `@procedures/repo-cli` | `packages/cli` | — | — | — |
| `@procedures/client` | `packages/client` | Universal protocol-agnostic RPC client with middleware composition | `client.*` (15), `procedure.*` (9) | `client-collections` |
| `@procedures/cli-run` | `packages/client-cli` | CLI execution wrapper - exposes cli.exec procedure for running CLI commands | `cli.*` (1) | `client`, `client-shell` |
| `@procedures/collections` | `packages/client-collections` | Collections framework with storage abstraction - ArrayList, HashMap, LRU, TTL, and more | — | — |
| `@procedures/cue` | `packages/client-cue` | CUE configuration procedures for the client ecosystem | `cue.*` (5) | `client`, `client-fs`, `client-shell`, `cue` *(general)* |
| `@procedures/dag` | `packages/client-dag` | Generic DAG algorithms for dependency management | — | — |
| `@procedures/docker` | `packages/client-docker` | Wraps Docker CLI commands as procedures using client-shell | `docker.*` (10) | `client`, `client-shell` |
| `@procedures/fs` | `packages/client-fs` | Filesystem operations as RPC procedures - fs.read, fs.write, fs.exists, etc. | `fs.*` (11) | `client` |
| `@procedures/git` | `packages/client-git` | Git operations as RPC procedures - git.add, git.commit, git.push, etc. | `git.*` (26) | `client`, `client-shell` |
| `@procedures/lib` | `packages/client-lib` | Workspace management procedures - scan, new, audit, rename | `lib.*` (4), `ecosystem.*` (1), `dag.*` (1), `core.*` (1) | `client`, `client-dag`, `client-fs`, `client-git`, `client-pnpm`, `client-shell` |
| `@procedures/mcp-server` | `packages/client-mcp` | MCP server transport for procedure system | `mcp.*` (2) | `mcp` |
| `@procedures/mongo` | `packages/client-mongo` | MongoDB client wrapper with client procedures - local or RPC access | `mongo.*` (16) | `client`, `client-collections` |
| `@procedures/node` | `packages/client-node` | Node.js process management procedures | `node.*` (4) | `client`, `client-shell` |
| `@procedures/playground` | `packages/client-playground` | — | — | `client` |
| `@procedures/pnpm` | `packages/client-pnpm` | Wraps pnpm commands as procedures using client-shell | `pnpm.*` (6) | `client`, `client-shell` |
| `@procedures/procedure` | `packages/client-procedure` | Procedure scaffolding procedures - procedure.new | `procedure.*` (2) | `client` |
| `@procedures/s3` | `packages/client-s3` | AWS S3 procedures for client ecosystem - upload, download, list, delete, multipart | `s3.*` (9) | `client` |
| `@procedures/peer` | `packages/client-server` | Transport-agnostic peer for bidirectional RPC - exposes procedures and generates manifests | `server.*` (8), `manifest.*` (1), `_discovery.*` (1) | `client` |
| `@procedures/shell` | `packages/client-shell` | Generic shell command execution procedures | `shell.*` (4) | `client` |
| `@procedures/snapshot` | `packages/client-snapshot` | Environment snapshot/restore procedures for testing and recovery | `snapshot.*` (5) | `client`, `client-fs`, `client-git`, `client-pnpm`, `client-s3` |
| `@procedures/splay` | `packages/client-splay` | Bridge between splay and client - component rendering via procedures | `splay.*` (2) | `client`, `splay` *(general)* |
| `@procedures/sqlite` | `packages/client-sqlite` | SQLite procedures for client - database operations via client.call | `db.*` (2), `logs.*` (2) | `client`, `docker-sqlite` *(general)* |
| `@procedures/vite` | `packages/client-vite` | Vite dev server management procedures | `vite.*` (4) | `client`, `client-shell` |
| `@procedures/vitest` | `packages/client-vitest` | — | `vitest.*` (5) | `client`, `client-shell` |
| `@procedures/documentation` | `packages/documentation` | — | — | — |
| `@procedures/mcp-dev-tools` | `packages/impl-mcp-dev` | Ready-to-use MCP server exposing the procedure ecosystem to Claude | — | `bundle-mcp`, `client`, `client-mcp` |
| `@procedures/mark` | `packages/mark` | Mark CLI - Development workflow automation | — | `client`, `client-cli`, `client-lib`, `client-pnpm`, `client-procedure`, `client-server`, `client-shell`, `client-vitest` |
| `@procedures/mcp` | `packages/mcp` | Core MCP types and utilities for procedure-to-tool mapping | — | — |
| `@procedures/server` | `packages/server` | General procedure server - run any procedure packages via HTTP/WebSocket | — | `client`, `client-server` |
| `@procedures/site` | `packages/site` | The website of the client ecosystem: the Composer, the procedure catalog and the architecture map | — | `client` |

Procedures are counted for the package whose `register.js` adds them first, in dependency order.
A bundle (`bundle-dev`, `bundle-mcp`) adds none of its own.
