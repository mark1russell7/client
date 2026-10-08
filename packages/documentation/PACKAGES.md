# Mark Ecosystem Package Reference

> Detailed descriptions and documentation links for all packages in the ecosystem.

> **⚠️ Accuracy note (July 2026):** Per-package **procedure counts** below are stale and have been
> replaced with a pointer to [BUGS-2026-07.md](./BUGS-2026-07.md) pending regeneration from the
> registry (do not trust any hard count here). The **bundle-dev contents** description is also
> stale (see [AUDIT-2026-07.md](./AUDIT-2026-07.md)). The 10 manifest packages that previously had
> no entry (client-logger, client-collections, client-node, client-vite, client-server-mongo,
> server-mongo, minimongo, client-playground, scaffold, documentation) are now listed under
> [Previously Undocumented Packages](#previously-undocumented-packages-july-2026).

## Table of Contents

- [Core Packages](#core-packages)
- [Client Packages (Procedures)](#client-packages-procedures)
- [Bundles](#bundles)
- [MCP Integration](#mcp-integration)
- [Server Packages](#server-packages)
- [UI/Visualization](#uivisualization)
- [Docker Images](#docker-images)
- [Testing Utilities](#testing-utilities)
- [Node.js Engine Policy](#nodejs-engine-policy)

---

## Node.js Engine Policy

The ecosystem targets a **single Node.js baseline: Node.js >= 20** (with **npm >= 10**, and
**pnpm** as the prescribed package manager). This matches the `engines` field already declared by
the core `@mark1russell7/client` runtime that every package depends on, as well as `docker/*`,
`minimongo`, `client-mongo`, `client-server`, and `server-mongo`.

Three packages currently declare a higher floor (`cue`, `splay`, `client-splay` at `node >=25` /
`npm >=11`) and ~38 declare no `engines` field at all; both are treated as drift to be reconciled
to `>=20`. Since `engines` values are generated from cue configuration, aligning all 48
package.jsons is a cue-driven change (tracked in [BUGS-2026-07.md](./BUGS-2026-07.md)) and is
**not** performed by hand-editing package.json here. Rationale: [DECISIONS-2026-07.md](./DECISIONS-2026-07.md).

---

## Core Packages

### @mark1russell7/client

**The foundation of the ecosystem** - Universal RPC framework with middleware, procedures, components, and collections.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client](https://github.com/mark1russell7/client) |
| Path | `~/git/client` |
| Main Export | Client, Procedure, Registry, Middleware |

**Key Features:**
- Protocol-agnostic RPC (HTTP, WebSocket, local)
- Type-safe middleware composition
- Procedure registry with auto-discovery
- Java-inspired collections (HashMap, ArrayList, etc.)
- Component system for SSR

```typescript
import { Client, createProcedure, PROCEDURE_REGISTRY } from "@mark1russell7/client";
```

---

### @mark1russell7/cue

**Configuration generation** from declarative `dependencies.json` files.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/cue](https://github.com/mark1russell7/cue) |
| Path | `~/git/cue` |
| CLI | `cue-config init|add|remove|generate|validate` |

**Generates:**
- `package.json`
- `tsconfig.json`
- `.gitignore`
- Framework-specific configs

```bash
# Initialize with preset
cue-config init --preset lib

# Add features
cue-config add typescript vitest

# Generate all configs
cue-config generate
```

---

### @mark1russell7/logger

**Structured logging** with levels, formatters, and transports.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/logger](https://github.com/mark1russell7/logger) |
| Path | `~/git/logger` |
| Levels | trace, debug, info, warn, error, fatal |

```typescript
import { createLogger } from "@mark1russell7/logger";

const logger = createLogger({ level: "info", pretty: true });
logger.info("Server started", { port: 3000 });
```

---

### @mark1russell7/ecosystem

**Ecosystem manifest** defining all packages and their relationships.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/ecosystem](https://github.com/mark1russell7/ecosystem) |
| Path | `~/git/ecosystem` |
| Manifest | `ecosystem.manifest.json` |

Contains package definitions, project templates, and coordination metadata.

---

### @mark1russell7/cli

**Command-line interface** for ecosystem management.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/cli](https://github.com/mark1russell7/cli) |
| Path | `~/git/cli` |
| Binary | `mark` |

```bash
mark lib new my-package      # Create package
mark lib scan                # List packages
mark lib refresh --all       # Rebuild all
mark procedure new fs.x --path ~/git/pkg  # New procedure in pkg
```

---

## Client Packages (Procedures)

### @mark1russell7/client-fs

**File system operations** - read, write, copy, move, delete, glob.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-fs](https://github.com/mark1russell7/client-fs) |
| Namespace | `fs.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |

---

### @mark1russell7/client-git

**Git operations** - clone, pull, push, commit, branch, merge.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-git](https://github.com/mark1russell7/client-git) |
| Namespace | `git.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |

---

### @mark1russell7/client-shell

**Shell command execution** - run commands, execute strings, find binaries.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-shell](https://github.com/mark1russell7/client-shell) |
| Namespace | `shell.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |

**Critical:** Many other client packages depend on this for command execution.

---

### @mark1russell7/client-pnpm

**pnpm package manager** wrapper.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-pnpm](https://github.com/mark1russell7/client-pnpm) |
| Namespace | `pnpm.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |
| Depends On | client-shell |

---

### @mark1russell7/client-docker

**Docker container management** - run, build, compose, logs.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-docker](https://github.com/mark1russell7/client-docker) |
| Namespace | `docker.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |
| Depends On | client-shell |

---

### @mark1russell7/client-mongo

**MongoDB operations** - CRUD, aggregation, indexes.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-mongo](https://github.com/mark1russell7/client-mongo) |
| Namespace | `mongo.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |
| Requires | MongoDB connection (MONGODB_URI) |

---

### @mark1russell7/client-sqlite

**SQLite operations** using sql.js (WASM).

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-sqlite](https://github.com/mark1russell7/client-sqlite) |
| Namespace | `db.*`, `logs.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |
| No Native Deps | Uses sql.js WASM |

---

### @mark1russell7/client-s3

**S3/object storage** operations.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-s3](https://github.com/mark1russell7/client-s3) |
| Namespace | `s3.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |
| Requires | AWS credentials |

---

### @mark1russell7/client-lib

**Ecosystem management** - scan, install, new, refresh.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-lib](https://github.com/mark1russell7/client-lib) |
| Namespace | `lib.*`, `dag.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |
| Depends On | client-shell, client-git, client-fs, client-dag, client-pnpm |

---

### @mark1russell7/client-cli

**Mark CLI wrapper** as procedure.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-cli](https://github.com/mark1russell7/client-cli) |
| Namespace | `cli.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |
| Depends On | client-shell |

---

### @mark1russell7/client-procedure

**Procedure management** - create, list, delete, runtime registration.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-procedure](https://github.com/mark1russell7/client-procedure) |
| Namespace | `procedure.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |

---

### @mark1russell7/client-cue

**Configuration generation** procedures.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-cue](https://github.com/mark1russell7/client-cue) |
| Namespace | `cue.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |

---

### @mark1russell7/client-dag

**DAG (Directed Acyclic Graph)** operations for dependency ordering.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-dag](https://github.com/mark1russell7/client-dag) |
| Namespace | `dag.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |

---

### @mark1russell7/client-vitest

**Vitest test runner** wrapper.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-vitest](https://github.com/mark1russell7/client-vitest) |
| Namespace | `vitest.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |
| Depends On | client-shell |

---

### @mark1russell7/client-test

**Test utilities** and runner.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-test](https://github.com/mark1russell7/client-test) |
| Namespace | `test.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |
| Depends On | client-shell |

---

### @mark1russell7/client-snapshot

**State snapshots** for testing and debugging.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-snapshot](https://github.com/mark1russell7/client-snapshot) |
| Namespace | `snapshot.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |

---

## Bundles

### @mark1russell7/bundle-dev

**Full development bundle** - all client packages.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/bundle-dev](https://github.com/mark1russell7/bundle-dev) |
| Path | `~/git/bundle-dev` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |
| Use Case | CLI, development |

Includes everything: fs, git, shell, pnpm, docker, mongo, sqlite, lib, etc.

---

### @mark1russell7/bundle-mcp

**MCP-optimized bundle** - curated for AI integration.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/bundle-mcp](https://github.com/mark1russell7/bundle-mcp) |
| Path | `~/git/bundle-mcp` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — count stale, regenerate from registry_ |
| Use Case | Claude MCP integration |

**Excludes** low-level tools (fs, git, shell, pnpm) since Claude has shell access.
**Includes** high-level orchestration (lib, cli, procedure, docker, mongo, etc.)

---

## MCP Integration

### @mark1russell7/mcp

**Core MCP types and utilities** - Zod→JSON Schema conversion, procedure→tool mapping.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/mcp](https://github.com/mark1russell7/mcp) |
| Path | `~/git/mcp` |
| Main Export | zodToJsonSchema, proceduresToMcpTools |

```typescript
import { proceduresToMcpTools, zodToJsonSchema } from "@mark1russell7/mcp";

const tools = proceduresToMcpTools(PROCEDURE_REGISTRY.getAll());
```

---

### @mark1russell7/client-mcp

**MCP server transport** - connects procedure system to MCP protocol.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-mcp](https://github.com/mark1russell7/client-mcp) |
| Path | `~/git/client-mcp` |
| Transport | stdio (Claude Desktop/Code) |

```typescript
import { McpServerTransport } from "@mark1russell7/client-mcp";

const transport = new McpServerTransport(server, { transport: "stdio" });
```

---

### @mark1russell7/impl-mcp-dev

**Ready-to-run MCP server** for Claude.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/impl-mcp-dev](https://github.com/mark1russell7/impl-mcp-dev) |
| Path | `~/git/impl-mcp-dev` |
| Entry | `dist/server.js` |
| Config | MCP_BUNDLES, MCP_DEBUG env vars |

```bash
# Run directly
node ~/git/impl-mcp-dev/dist/server.js

# With custom bundle
MCP_BUNDLES=@mark1russell7/bundle-dev node ~/git/impl-mcp-dev/dist/server.js
```

---

## Server Packages

### @mark1russell7/server

**General procedure server** - run any procedures via HTTP/WebSocket.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/server](https://github.com/mark1russell7/server) |
| Path | `~/git/server` |
| Transports | HTTP, WebSocket |

```bash
server --procedures @mark1russell7/client-mongo/register --port 3000
```

---

### @mark1russell7/client-server

**Server procedures** - create, manage, configure servers programmatically.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-server](https://github.com/mark1russell7/client-server) |
| Namespace | `server.*` |

---

### @mark1russell7/client-connection

**Connection management** for bidirectional RPC.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-connection](https://github.com/mark1russell7/client-connection) |
| Namespace | `connection.*` |

---

## UI/Visualization

### @mark1russell7/splay

**Core splay library** - tree-based layout and visualization.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/splay](https://github.com/mark1russell7/splay) |
| Path | `~/git/splay` |

---

### @mark1russell7/splay-react

**React bindings** for splay.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/splay-react](https://github.com/mark1russell7/splay-react) |
| Path | `~/git/splay-react` |

---

### @mark1russell7/client-splay

**Splay procedures** for server-side rendering.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-splay](https://github.com/mark1russell7/client-splay) |
| Namespace | `splay.*` |

---

## Docker Images

### @mark1russell7/docker-mongo

**MongoDB Docker setup** with TypeScript utilities.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/docker-mongo](https://github.com/mark1russell7/docker-mongo) |
| Path | `~/git/docker/mongo` |
| Image | mongo:8.0 |

---

### @mark1russell7/docker-sqlite

**SQLite Docker setup** with web UI.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/docker-sqlite](https://github.com/mark1russell7/docker-sqlite) |
| Path | `~/git/docker/sqlite` |
| Engine | sql.js (WASM) |

---

## Testing Utilities

### @mark1russell7/test

**Test framework** utilities.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/test](https://github.com/mark1russell7/test) |
| Path | `~/git/test` |

---

### @mark1russell7/mock-client

**Mock client** for testing procedures.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/mock-client](https://github.com/mark1russell7/mock-client) |
| Path | `~/git/mock-client` |

---

### @mark1russell7/mock-fs

**Mock file system** for testing.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/mock-fs](https://github.com/mark1russell7/mock-fs) |
| Path | `~/git/mock-fs` |

---

### @mark1russell7/mock-logger

**Mock logger** for testing.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/mock-logger](https://github.com/mark1russell7/mock-logger) |
| Path | `~/git/mock-logger` |

---

## Previously Undocumented Packages (July 2026)

These 10 packages are in `ecosystem.manifest.json` but had no entry above. Brief entries are
provided here; procedure counts are intentionally **not** invented — see
[BUGS-2026-07.md](./BUGS-2026-07.md) and regenerate from the registry.

### @mark1russell7/client-logger

**Logger bridge** - exposes the logger through client procedures (`log.*`, e.g.
`log.trace/debug/info/warn/error`, `log.setLevel/getLevel`).

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-logger](https://github.com/mark1russell7/client-logger) |
| Namespace | `log.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — regenerate from registry_ |

---

### @mark1russell7/client-node

**Node.js process management** procedures (`node.run/spawn/kill/status`).

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-node](https://github.com/mark1russell7/client-node) |
| Namespace | `node.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — regenerate from registry_ |

---

### @mark1russell7/client-vite

**Vite dev-server management** procedures (`vite.dev/build/preview/stop`).

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-vite](https://github.com/mark1russell7/client-vite) |
| Namespace | `vite.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — regenerate from registry_ |

---

### @mark1russell7/client-collections

**Collections framework** with storage abstraction (ArrayList, HashMap, LRU, TTL, and more).
Consumed as a library (declares `@mark1russell7/client` as a peer dependency); large portions are
flagged as dead code in the audit.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-collections](https://github.com/mark1russell7/client-collections) |
| Path | `~/git/client-collections` |
| Main Export | ArrayList, HashMap, LRU/TTL maps, storage abstractions |

---

### @mark1russell7/client-server-mongo

**MongoDB server management** procedures built on client-server peering
(`server.mongo.start/stop/status/connect`).

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-server-mongo](https://github.com/mark1russell7/client-server-mongo) |
| Namespace | `server.mongo.*` |
| Procedures | _see [BUGS-2026-07](./BUGS-2026-07.md) — regenerate from registry_ |

---

### @mark1russell7/server-mongo

**Runnable MongoDB server** exposing `mongo.*` procedures over client-server.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/server-mongo](https://github.com/mark1russell7/server-mongo) |
| Path | `~/git/server-mongo` |
| Note | Duplicate `client-mongo` dependency key — see BUGS-2026-07 **H24** |

---

### @mark1russell7/minimongo

**Browser-based MongoDB data explorer / UI app.**

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/MiniMongo](https://github.com/mark1russell7/MiniMongo) |
| Path | `~/git/MiniMongo` |
| Note | Manifest key is `@mark1russell7/minimongo` but package.json `name` is unscoped `minimongo` — identity mismatch, see BUGS-2026-07 **M41** |

---

### @mark1russell7/client-playground

**Playground / experimentation** package (no registered procedures at time of audit).

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-playground](https://github.com/mark1russell7/client-playground) |
| Path | `~/git/client-playground` |

---

### @mark1russell7/scaffold

**Schema-driven scaffolding** system using Angular Schematics. Largely dead code per the audit.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/scaffold](https://github.com/mark1russell7/scaffold) |
| Path | `~/git/scaffold` |

---

### @mark1russell7/documentation

**This documentation repository** (the file you are reading).

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/documentation](https://github.com/mark1russell7/documentation) |
| Path | `~/git/documentation` |
| Note | Manifest key is `@mark1russell7/documentation` but package.json `name` is currently `"unnamed"` — identity mismatch, see BUGS-2026-07 **C5/M41** |

---

## Package Statistics

> **Note (July 2026):** the manifest lists **48** packages. The category counts below predate the
> 10 packages added in the section above and are approximate; treat the per-package procedure
> counts throughout this file as stale — see [BUGS-2026-07.md](./BUGS-2026-07.md).

| Category | Count |
|----------|-------|
| Core Packages | 5 |
| Client Packages | _regenerate — see BUGS-2026-07_ |
| Bundles | 2 |
| MCP Integration | 3 |
| Server Packages | _regenerate — see BUGS-2026-07_ |
| UI/Visualization | 3 |
| Docker Images | 2 |
| Testing Utilities | 4 |
| Previously Undocumented (above) | 10 |
| **Total (manifest)** | **48** |

---

## See Also

- [Architecture](./ARCHITECTURE.md) - System architecture diagrams
- [Procedures](./PROCEDURES.md) - Complete procedure catalog
- [Onboarding](./ONBOARDING.md) - Getting started guide
