# Package Reference

> **Generated file — do not hand-edit.** Produced by `packages/documentation/scripts/generate-packages.mjs`
> from the workspace's package.json files and the live procedure registry.
> Regenerate with `node packages/documentation/scripts/generate-packages.mjs` after `pnpm build`.

**Packages:** 32. **Procedures:** 155. The full procedure list is in [PROCEDURES.md](./PROCEDURES.md).

Dependencies marked *(general)* are separate repositories, referenced with `github:` specifiers.

| Package | Folder | Description | Procedures | Depends on |
|---|---|---|---|---|
| `@mark1russell7/bundle-dev` | `packages/bundle-dev` | Dev workflow bundle - aggregates client packages for development | — | `client`, `client-cli`, `client-pnpm`, `client-lib`, `client-git`, `client-dag`, `client-fs`, `client-shell`, `client-procedure` |
| `@mark1russell7/bundle-mcp` | `packages/bundle-mcp` | Curated MCP bundle - high-level orchestration tools for Claude | — | `client`, `client-cli`, `client-lib`, `client-procedure`, `client-cue`, `client-docker`, `client-mongo`, `client-sqlite`, `client-vitest` |
| `@mark1russell7/repo-cli` | `packages/cli` | — | — | — |
| `@mark1russell7/client` | `packages/client` | Universal protocol-agnostic RPC client with middleware composition | `client.*` (15), `procedure.*` (9) | `client-collections` |
| `@mark1russell7/client-cli` | `packages/client-cli` | CLI execution wrapper - exposes cli.exec procedure for running CLI commands | `cli.*` (1) | `client`, `client-shell` |
| `@mark1russell7/client-collections` | `packages/client-collections` | Collections framework with storage abstraction - ArrayList, HashMap, LRU, TTL, and more | — | — |
| `@mark1russell7/client-cue` | `packages/client-cue` | CUE configuration procedures for the client ecosystem | `cue.*` (5) | `client`, `cue` *(general)* |
| `@mark1russell7/client-dag` | `packages/client-dag` | Generic DAG algorithms for dependency management | — | — |
| `@mark1russell7/client-docker` | `packages/client-docker` | Wraps Docker CLI commands as procedures using client-shell | `docker.*` (10) | `client`, `client-shell` |
| `@mark1russell7/client-fs` | `packages/client-fs` | Filesystem operations as RPC procedures - fs.read, fs.write, fs.exists, etc. | `fs.*` (11) | `client` |
| `@mark1russell7/client-git` | `packages/client-git` | Git operations as RPC procedures - git.add, git.commit, git.push, etc. | `git.*` (26) | `client` |
| `@mark1russell7/client-lib` | `packages/client-lib` | Workspace management procedures - scan, new, audit, rename | `lib.*` (4), `ecosystem.*` (1), `dag.*` (1), `core.*` (1) | `client`, `client-dag`, `client-fs`, `client-git`, `client-pnpm`, `client-shell` |
| `@mark1russell7/client-mcp` | `packages/client-mcp` | MCP server transport for procedure system | `mcp.*` (2) | `mcp` |
| `@mark1russell7/client-mongo` | `packages/client-mongo` | MongoDB client wrapper with client procedures - local or RPC access | `mongo.*` (16) | `client`, `client-collections` |
| `@mark1russell7/client-node` | `packages/client-node` | Node.js process management procedures | `node.*` (4) | `client`, `client-shell` |
| `@mark1russell7/client-playground` | `packages/client-playground` | — | — | `client` |
| `@mark1russell7/client-pnpm` | `packages/client-pnpm` | Wraps pnpm commands as procedures using client-shell | `pnpm.*` (6) | `client`, `client-shell` |
| `@mark1russell7/client-procedure` | `packages/client-procedure` | Procedure scaffolding procedures - procedure.new | `procedure.*` (2) | `client` |
| `@mark1russell7/client-s3` | `packages/client-s3` | AWS S3 procedures for client ecosystem - upload, download, list, delete, multipart | `s3.*` (9) | `client` |
| `@mark1russell7/client-server` | `packages/client-server` | Transport-agnostic peer for bidirectional RPC - exposes procedures and generates manifests | `server.*` (8), `manifest.*` (1), `_discovery.*` (1) | `client` |
| `@mark1russell7/client-shell` | `packages/client-shell` | Generic shell command execution procedures | `shell.*` (4) | `client` |
| `@mark1russell7/client-snapshot` | `packages/client-snapshot` | Environment snapshot/restore procedures for testing and recovery | `snapshot.*` (5) | `client`, `client-s3`, `client-git`, `client-pnpm`, `client-fs` |
| `@mark1russell7/client-splay` | `packages/client-splay` | Bridge between splay and client - component rendering via procedures | `splay.*` (2) | `client`, `splay` *(general)* |
| `@mark1russell7/client-sqlite` | `packages/client-sqlite` | SQLite procedures for client - database operations via client.call | `db.*` (2), `logs.*` (2) | `client`, `docker-sqlite` *(general)* |
| `@mark1russell7/client-vite` | `packages/client-vite` | Vite dev server management procedures | `vite.*` (4) | `client`, `client-shell` |
| `@mark1russell7/client-vitest` | `packages/client-vitest` | — | `vitest.*` (3) | `client` |
| `@mark1russell7/documentation` | `packages/documentation` | — | — | — |
| `@mark1russell7/impl-mcp-dev` | `packages/impl-mcp-dev` | Ready-to-use MCP server exposing the procedure ecosystem to Claude | — | `bundle-mcp`, `client`, `client-mcp` |
| `@mark1russell7/cli` | `packages/mark` | Mark CLI - Development workflow automation | — | `client`, `client-cli`, `client-lib`, `client-pnpm`, `client-procedure`, `client-server`, `client-shell`, `client-vitest` |
| `@mark1russell7/mcp` | `packages/mcp` | Core MCP types and utilities for procedure-to-tool mapping | — | — |
| `@mark1russell7/server` | `packages/server` | General procedure server - run any procedure packages via HTTP/WebSocket | — | `client`, `client-server` |
| `@mark1russell7/site` | `packages/site` | The website of the client ecosystem: the Composer, the procedure catalog and the architecture map | — | `client` |

Procedures are counted for the package whose `register.js` adds them first, in dependency order.
A bundle (`bundle-dev`, `bundle-mcp`) adds none of its own.
