# Mark Ecosystem Package Reference

> Detailed descriptions and documentation links for all packages in the ecosystem.

## Table of Contents

- [Core Packages](#core-packages)
- [Client Packages (Procedures)](#client-packages-procedures)
- [Bundles](#bundles)
- [MCP Integration](#mcp-integration)
- [Server Packages](#server-packages)
- [UI/Visualization](#uivisualization)
- [Docker Images](#docker-images)
- [Testing Utilities](#testing-utilities)

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
mark procedure new pkg fs.x  # Create procedure
```

---

## Client Packages (Procedures)

### @mark1russell7/client-fs

**File system operations** - read, write, copy, move, delete, glob.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-fs](https://github.com/mark1russell7/client-fs) |
| Namespace | `fs.*` |
| Procedures | 15 |

---

### @mark1russell7/client-git

**Git operations** - clone, pull, push, commit, branch, merge.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-git](https://github.com/mark1russell7/client-git) |
| Namespace | `git.*` |
| Procedures | 14 |

---

### @mark1russell7/client-shell

**Shell command execution** - run commands, execute strings, find binaries.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-shell](https://github.com/mark1russell7/client-shell) |
| Namespace | `shell.*` |
| Procedures | 3 |

**Critical:** Many other client packages depend on this for command execution.

---

### @mark1russell7/client-pnpm

**pnpm package manager** wrapper.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-pnpm](https://github.com/mark1russell7/client-pnpm) |
| Namespace | `pnpm.*` |
| Procedures | 8 |
| Depends On | client-shell |

---

### @mark1russell7/client-docker

**Docker container management** - run, build, compose, logs.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-docker](https://github.com/mark1russell7/client-docker) |
| Namespace | `docker.*` |
| Procedures | 12 |
| Depends On | client-shell |

---

### @mark1russell7/client-mongo

**MongoDB operations** - CRUD, aggregation, indexes.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-mongo](https://github.com/mark1russell7/client-mongo) |
| Namespace | `mongo.*` |
| Procedures | 16 |
| Requires | MongoDB connection (MONGODB_URI) |

---

### @mark1russell7/client-sqlite

**SQLite operations** using sql.js (WASM).

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-sqlite](https://github.com/mark1russell7/client-sqlite) |
| Namespace | `db.*`, `logs.*` |
| Procedures | 4 |
| No Native Deps | Uses sql.js WASM |

---

### @mark1russell7/client-s3

**S3/object storage** operations.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-s3](https://github.com/mark1russell7/client-s3) |
| Namespace | `s3.*` |
| Procedures | 7 |
| Requires | AWS credentials |

---

### @mark1russell7/client-lib

**Ecosystem management** - scan, install, new, refresh.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-lib](https://github.com/mark1russell7/client-lib) |
| Namespace | `lib.*`, `dag.*` |
| Procedures | 8 |
| Depends On | client-shell, client-git, client-fs, client-dag, client-pnpm |

---

### @mark1russell7/client-cli

**Mark CLI wrapper** as procedure.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-cli](https://github.com/mark1russell7/client-cli) |
| Namespace | `cli.*` |
| Procedures | 1 |
| Depends On | client-shell |

---

### @mark1russell7/client-procedure

**Procedure management** - create, list, delete, runtime registration.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-procedure](https://github.com/mark1russell7/client-procedure) |
| Namespace | `procedure.*` |
| Procedures | 9 |

---

### @mark1russell7/client-cue

**Configuration generation** procedures.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-cue](https://github.com/mark1russell7/client-cue) |
| Namespace | `cue.*` |
| Procedures | 5 |

---

### @mark1russell7/client-dag

**DAG (Directed Acyclic Graph)** operations for dependency ordering.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-dag](https://github.com/mark1russell7/client-dag) |
| Namespace | `dag.*` |
| Procedures | 3 |

---

### @mark1russell7/client-vitest

**Vitest test runner** wrapper.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-vitest](https://github.com/mark1russell7/client-vitest) |
| Namespace | `vitest.*` |
| Procedures | 2 |
| Depends On | client-shell |

---

### @mark1russell7/client-test

**Test utilities** and runner.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-test](https://github.com/mark1russell7/client-test) |
| Namespace | `test.*` |
| Procedures | 2 |
| Depends On | client-shell |

---

### @mark1russell7/client-snapshot

**State snapshots** for testing and debugging.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/client-snapshot](https://github.com/mark1russell7/client-snapshot) |
| Namespace | `snapshot.*` |
| Procedures | 4 |

---

## Bundles

### @mark1russell7/bundle-dev

**Full development bundle** - all client packages.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/bundle-dev](https://github.com/mark1russell7/bundle-dev) |
| Path | `~/git/bundle-dev` |
| Procedures | ~100+ |
| Use Case | CLI, development |

Includes everything: fs, git, shell, pnpm, docker, mongo, sqlite, lib, etc.

---

### @mark1russell7/bundle-mcp

**MCP-optimized bundle** - curated for AI integration.

| Property | Value |
|----------|-------|
| Repository | [github.com/mark1russell7/bundle-mcp](https://github.com/mark1russell7/bundle-mcp) |
| Path | `~/git/bundle-mcp` |
| Procedures | ~50+ |
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

## Package Statistics

| Category | Count |
|----------|-------|
| Core Packages | 5 |
| Client Packages | 20 |
| Bundles | 2 |
| MCP Integration | 3 |
| Server Packages | 3 |
| UI/Visualization | 3 |
| Docker Images | 2 |
| Testing Utilities | 4 |
| Other | 5 |
| **Total** | **47** |

---

## See Also

- [Architecture](./ARCHITECTURE.md) - System architecture diagrams
- [Procedures](./PROCEDURES.md) - Complete procedure catalog
- [Onboarding](./ONBOARDING.md) - Getting started guide
