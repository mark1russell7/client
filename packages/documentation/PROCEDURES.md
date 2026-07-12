# Mark Ecosystem Procedure Catalog

> **Generated file — do not hand-edit.** Produced by `documentation/scripts/generate-procedures.mjs`
> from the live `PROCEDURE_REGISTRY` (introspected after importing every built package's
> `register.js`). Regenerate with `node documentation/scripts/generate-procedures.mjs`.

**Total procedures:** 175 across 29 namespaces. Loaded 23 package register(s).

> ⚠️ 1 package(s) failed to load and are not represented below:
> - client-procedure: Procedure already registered at path: procedure.list

## Namespaces

- [`_discovery.*`](#_discovery) — 1 procedure(s)
- [`cli.*`](#cli) — 1 procedure(s)
- [`client.*`](#client) — 15 procedure(s)
- [`connection.*`](#connection) — 7 procedure(s)
- [`core.*`](#core) — 1 procedure(s)
- [`cue.*`](#cue) — 5 procedure(s)
- [`dag.*`](#dag) — 1 procedure(s)
- [`db.*`](#db) — 2 procedure(s)
- [`docker.*`](#docker) — 10 procedure(s)
- [`ecosystem.*`](#ecosystem) — 1 procedure(s)
- [`fs.*`](#fs) — 11 procedure(s)
- [`git.*`](#git) — 26 procedure(s)
- [`lib.*`](#lib) — 7 procedure(s)
- [`log.*`](#log) — 7 procedure(s)
- [`logs.*`](#logs) — 2 procedure(s)
- [`manifest.*`](#manifest) — 1 procedure(s)
- [`mcp.*`](#mcp) — 2 procedure(s)
- [`mongo.*`](#mongo) — 16 procedure(s)
- [`node.*`](#node) — 4 procedure(s)
- [`pnpm.*`](#pnpm) — 6 procedure(s)
- [`procedure.*`](#procedure) — 10 procedure(s)
- [`s3.*`](#s3) — 9 procedure(s)
- [`server.*`](#server) — 12 procedure(s)
- [`shell.*`](#shell) — 3 procedure(s)
- [`snapshot.*`](#snapshot) — 5 procedure(s)
- [`splay.*`](#splay) — 2 procedure(s)
- [`test.*`](#test) — 2 procedure(s)
- [`vite.*`](#vite) — 4 procedure(s)
- [`vitest.*`](#vitest) — 2 procedure(s)

---

## _discovery

| Procedure | Description |
|-----------|-------------|
| `_discovery.announce` | Exchange procedure manifests for discovery |

## cli

| Procedure | Description |
|-----------|-------------|
| `cli.run` | Run a mark CLI command |

## client

| Procedure | Description |
|-----------|-------------|
| `client.all` | Returns true if all values are truthy |
| `client.and` | Short-circuit AND (returns first falsy or last value) |
| `client.any` | Returns true if any value is truthy |
| `client.chain` | Execute procedures sequentially |
| `client.conditional` | Conditional execution (if/then/else) |
| `client.constant` | Return a constant value |
| `client.identity` | Return input unchanged |
| `client.map` | Map over array (items should contain procedure refs) |
| `client.none` | Returns true if all values are falsy |
| `client.not` | Logical NOT |
| `client.or` | Short-circuit OR (returns first truthy or last value) |
| `client.parallel` | Execute procedures in parallel |
| `client.reduce` | Reduce array to single value |
| `client.throw` | Throw an error |
| `client.tryCatch` | Try/catch wrapper for procedures |

## connection

| Procedure | Description |
|-----------|-------------|
| `connection.broadcast` | Call procedure on all connected clients |
| `connection.call` | Call procedure on specific client |
| `connection.get` | Get specific connection info |
| `connection.list` | List all connected clients |
| `connection.publish` | Publish data to topic subscribers |
| `connection.subscribe` | Subscribe to a topic |
| `connection.unsubscribe` | Unsubscribe from a topic |

## core

| Procedure | Description |
|-----------|-------------|
| `core.catch` | Execute a procedure with error handling |

## cue

| Procedure | Description |
|-----------|-------------|
| `cue.add` | Add a feature to dependencies.json |
| `cue.generate` | Generate config files from dependencies.json |
| `cue.init` | Initialize dependencies.json with a preset |
| `cue.remove` | Remove a feature from dependencies.json |
| `cue.validate` | Validate dependencies.json |

## dag

| Procedure | Description |
|-----------|-------------|
| `dag.traverse` | Traverse ecosystem packages in dependency order, executing visit procedure for each |

## db

| Procedure | Description |
|-----------|-------------|
| `db.execute` | Execute a SQL statement (INSERT, UPDATE, DELETE) |
| `db.query` | Execute a SQL SELECT query |

## docker

| Procedure | Description |
|-----------|-------------|
| `docker.build` | Build a Docker image |
| `docker.compose.down` | Stop services with docker compose |
| `docker.compose.up` | Start services with docker compose |
| `docker.exec` | Execute command in a running container |
| `docker.logs` | Get container logs |
| `docker.ps` | List containers |
| `docker.pull` | Pull a Docker image |
| `docker.rm` | Remove container(s) |
| `docker.run` | Run a Docker container |
| `docker.stop` | Stop running container(s) |

## ecosystem

| Procedure | Description |
|-----------|-------------|
| `ecosystem.procedures` | List all procedures across the ecosystem |

## fs

| Procedure | Description |
|-----------|-------------|
| `fs.copy` | Copy file or directory |
| `fs.exists` | Check if file or directory exists |
| `fs.glob` | Find files matching glob pattern |
| `fs.mkdir` | Create directory |
| `fs.move` | Move or rename file/directory |
| `fs.read` | Read file contents |
| `fs.read.json` | Read and parse JSON file |
| `fs.readdir` | Read directory contents |
| `fs.rm` | Remove file or directory |
| `fs.stat` | Get file or directory stats |
| `fs.write` | Write content to file |

## git

| Procedure | Description |
|-----------|-------------|
| `git.add` | Stage files |
| `git.branch` | Branch operations |
| `git.checkout` | Checkout branch or files |
| `git.clone` | Clone repository |
| `git.commit` | Create commit |
| `git.diff` | Show changes |
| `git.fetch` | Fetch from remote |
| `git.hasChanges` | Check if there are any changes (unstaged, staged, or untracked) |
| `git.hasLocalCommits` | Check if there are local commits that haven't been pushed |
| `git.hasStagedChanges` | Check if there are any staged changes ready to commit |
| `git.hasUnstagedChanges` | Check if there are any unstaged changes |
| `git.hasUntrackedFiles` | Check if there are any untracked files |
| `git.init` | Initialize a git repository |
| `git.isClean` | Check if the working directory is clean |
| `git.log` | Show commit log |
| `git.pull` | Pull from remote |
| `git.push` | Push to remote |
| `git.remote` | Get or set remote URLs |
| `git.stash.apply` | Apply stash without removing |
| `git.stash.drop` | Drop a stash |
| `git.stash.export` | Export stash as patch for snapshot storage |
| `git.stash.import` | Import stash from patch |
| `git.stash.list` | List all stashes |
| `git.stash.pop` | Pop stash (apply and remove) |
| `git.stash.push` | Push changes to stash |
| `git.status` | Get git status |

## lib

| Procedure | Description |
|-----------|-------------|
| `lib.audit` | Audit ecosystem packages for issues |
| `lib.install` | Install the entire ecosystem from manifest |
| `lib.new` | Create a new package in the ecosystem |
| `lib.pull` | Pull from remote for all packages |
| `lib.refresh` | Refresh a package (install, build, commit, push) |
| `lib.rename` | Rename a package across the ecosystem |
| `lib.scan` | Scan for packages in the git directory |

## log

| Procedure | Description |
|-----------|-------------|
| `log.debug` | Log at DEBUG level |
| `log.error` | Log at ERROR level |
| `log.getLevel` | Get the current log level |
| `log.info` | Log at INFO level |
| `log.setLevel` | Set the log level |
| `log.trace` | Log at TRACE level |
| `log.warn` | Log at WARN level |

## logs

| Procedure | Description |
|-----------|-------------|
| `logs.query` | Query log entries from the database |
| `logs.store` | Store a log entry in the database |

## manifest

| Procedure | Description |
|-----------|-------------|
| `manifest.generate` | Generate procedure manifests in various formats |

## mcp

| Procedure | Description |
|-----------|-------------|
| `mcp.list-tools` | List available MCP tools from the procedure registry |
| `mcp.serve` | Start MCP server to expose procedures as tools |

## mongo

| Procedure | Description |
|-----------|-------------|
| `mongo.collections.create` | Create a new collection |
| `mongo.collections.drop` | Drop (delete) a collection |
| `mongo.collections.list` | List all collections in the database |
| `mongo.collections.stats` | Get collection statistics |
| `mongo.database.info` | Get database information and statistics |
| `mongo.database.ping` | Health check and connectivity test |
| `mongo.documents.aggregate` | Run an aggregation pipeline |
| `mongo.documents.count` | Count documents matching a filter |
| `mongo.documents.delete` | Delete documents matching a filter |
| `mongo.documents.find` | Find documents with pagination and filtering |
| `mongo.documents.get` | Get a single document by ID |
| `mongo.documents.insert` | Insert one or more documents |
| `mongo.documents.update` | Update documents matching a filter |
| `mongo.indexes.create` | Create an index on a collection |
| `mongo.indexes.drop` | Drop an index from a collection |
| `mongo.indexes.list` | List indexes on a collection |

## node

| Procedure | Description |
|-----------|-------------|
| `node.kill` | Kill a spawned Node.js process |
| `node.run` | Run a Node.js script and wait for completion |
| `node.spawn` | Spawn a long-running Node.js process |
| `node.status` | Get status of running Node.js processes |

## pnpm

| Procedure | Description |
|-----------|-------------|
| `pnpm.add` | Add packages using pnpm |
| `pnpm.install` | Install packages using pnpm |
| `pnpm.link` | Link packages using pnpm |
| `pnpm.remove` | Remove packages using pnpm |
| `pnpm.run` | Run package scripts using pnpm |
| `pnpm.store.path` | Get pnpm store path for snapshot/restore |

## procedure

| Procedure | Description |
|-----------|-------------|
| `procedure.define` | Define a new procedure from an aggregation |
| `procedure.delete` | Delete a runtime-defined procedure |
| `procedure.get` | Get a runtime-defined procedure by path |
| `procedure.list` | List all runtime-defined procedures |
| `procedure.load` | Load procedures from storage into registry |
| `procedure.new` | Scaffold a new procedure with types and registration boilerplate |
| `procedure.register` | Register a procedure at runtime |
| `procedure.remote` | Configure remote procedure registry connection |
| `procedure.store` | Persist a procedure definition to storage |
| `procedure.sync` | Synchronize procedure registry with storage |

## s3

| Procedure | Description |
|-----------|-------------|
| `s3.delete` | Delete object from S3 bucket |
| `s3.download` | Download content from S3 bucket |
| `s3.list` | List objects in S3 bucket |
| `s3.listAll` | List ALL objects in S3 bucket, following continuation tokens (unbounded by 1000) |
| `s3.multipart.abort` | Abort multipart upload and clean up parts |
| `s3.multipart.complete` | Complete multipart upload by assembling parts |
| `s3.multipart.init` | Initialize multipart upload for large files |
| `s3.multipart.upload` | Upload a part in multipart upload |
| `s3.upload` | Upload content to S3 bucket |

## server

| Procedure | Description |
|-----------|-------------|
| `server.call` | Call a procedure on a remote peer through an outbound connection |
| `server.connect` | Connect to a remote peer for bidirectional RPC |
| `server.connections` | List outbound connections to remote peers |
| `server.create` | Create a transport-agnostic peer that exposes procedures |
| `server.disconnect` | Disconnect from a remote peer |
| `server.mongo.connect` | Connect to MongoDB database |
| `server.mongo.start` | Start MongoDB peer server |
| `server.mongo.status` | Get MongoDB server status |
| `server.mongo.stop` | Stop MongoDB peer server |
| `server.start` | Start CLI server as background daemon |
| `server.status` | Get CLI server status |
| `server.stop` | Stop running CLI server |

## shell

| Procedure | Description |
|-----------|-------------|
| `shell.exec` | Execute command string via shell |
| `shell.run` | Run a command with arguments |
| `shell.which` | Find the path to a command |

## snapshot

| Procedure | Description |
|-----------|-------------|
| `snapshot.create` | Create environment snapshot and upload to S3 |
| `snapshot.delete` | Delete a snapshot from S3 |
| `snapshot.diff` | Compare current state against a snapshot |
| `snapshot.list` | List available snapshots in S3 bucket |
| `snapshot.restore` | Restore environment from S3 snapshot |

## splay

| Procedure | Description |
|-----------|-------------|
| `splay.bridge.health` | Health check for client-splay bridge |
| `splay.bridge.info` | Get client-splay bridge information |

## test

| Procedure | Description |
|-----------|-------------|
| `test.coverage` | Run tests with coverage reporting |
| `test.run` | Run tests for a package |

## vite

| Procedure | Description |
|-----------|-------------|
| `vite.build` | Build for production |
| `vite.dev` | Start Vite dev server |
| `vite.preview` | Preview production build |
| `vite.stop` | Stop a running Vite server |

## vitest

| Procedure | Description |
|-----------|-------------|
| `vitest.run` | Run vitest tests |
| `vitest.watch` | Start vitest in watch mode |

