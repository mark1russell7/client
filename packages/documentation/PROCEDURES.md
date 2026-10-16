# Mark Ecosystem Procedure Catalog

> **Generated file — do not hand-edit.** Produced by `packages/documentation/scripts/generate-procedures.mjs`
> from the live `PROCEDURE_REGISTRY` (introspected after importing every built package's
> `register.js`). Regenerate with `node packages/documentation/scripts/generate-procedures.mjs`.

**Total procedures:** 182 across 37 namespaces. Loaded 33 package register(s).

## Namespaces

- [`_discovery.*`](#_discovery) — 1 procedure(s)
- [`cli.*`](#cli) — 1 procedure(s)
- [`client.*`](#client) — 15 procedure(s)
- [`core.*`](#core) — 1 procedure(s)
- [`cue.*`](#cue) — 5 procedure(s)
- [`dag.*`](#dag) — 1 procedure(s)
- [`db.*`](#db) — 2 procedure(s)
- [`docker.*`](#docker) — 10 procedure(s)
- [`ecosystem.*`](#ecosystem) — 1 procedure(s)
- [`exif.*`](#exif) — 1 procedure(s)
- [`fs.*`](#fs) — 15 procedure(s)
- [`geo.*`](#geo) — 2 procedure(s)
- [`git.*`](#git) — 27 procedure(s)
- [`ics.*`](#ics) — 3 procedure(s)
- [`lib.*`](#lib) — 4 procedure(s)
- [`logs.*`](#logs) — 2 procedure(s)
- [`mail.*`](#mail) — 2 procedure(s)
- [`manifest.*`](#manifest) — 1 procedure(s)
- [`mcp.*`](#mcp) — 2 procedure(s)
- [`mongo.*`](#mongo) — 16 procedure(s)
- [`node.*`](#node) — 4 procedure(s)
- [`notify.*`](#notify) — 1 procedure(s)
- [`pnpm.*`](#pnpm) — 6 procedure(s)
- [`procedure.*`](#procedure) — 12 procedure(s)
- [`program.*`](#program) — 4 procedure(s)
- [`restic.*`](#restic) — 1 procedure(s)
- [`s3.*`](#s3) — 9 procedure(s)
- [`sdk.*`](#sdk) — 2 procedure(s)
- [`server.*`](#server) — 8 procedure(s)
- [`shell.*`](#shell) — 4 procedure(s)
- [`snapshot.*`](#snapshot) — 5 procedure(s)
- [`splay.*`](#splay) — 2 procedure(s)
- [`systems.*`](#systems) — 1 procedure(s)
- [`tailscale.*`](#tailscale) — 1 procedure(s)
- [`vite.*`](#vite) — 4 procedure(s)
- [`vitest.*`](#vitest) — 5 procedure(s)
- [`weather.*`](#weather) — 1 procedure(s)

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
| `client.map` | Map over an array: run fn for each item (the item is { $ref: "item" }) |
| `client.none` | Returns true if all values are falsy |
| `client.not` | Logical NOT |
| `client.or` | Short-circuit OR (returns first truthy or last value) |
| `client.parallel` | Execute procedures in parallel |
| `client.reduce` | Reduce an array: run fn for each item (acc and item are $refs) |
| `client.throw` | Throw an error |
| `client.tryCatch` | Try/catch wrapper for procedures |

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
| `db.query` | Execute a SQL SELECT query (read only: a statement that changes data fails) |

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

## exif

| Procedure | Description |
|-----------|-------------|
| `exif.read` | Read when and where a JPEG photo was taken (EXIF time and GPS position) |

## fs

| Procedure | Description |
|-----------|-------------|
| `fs.copy` | Copy file or directory |
| `fs.exists` | Check if file or directory exists |
| `fs.glob` | Find files matching glob pattern |
| `fs.hash` | The hash of a file |
| `fs.mkdir` | Create directory |
| `fs.move` | Move or rename file/directory |
| `fs.read` | Read file contents |
| `fs.read.json` | Read and parse JSON file |
| `fs.readdir` | Read directory contents |
| `fs.rm` | Remove file or directory |
| `fs.stat` | Get file or directory stats |
| `fs.temp` | Make a temporary folder |
| `fs.watch` | The changes of a file or folder, as a stream |
| `fs.write` | Write content to file |
| `fs.write.json` | Write a value as a JSON file, with a rename at the end |

## geo

| Procedure | Description |
|-----------|-------------|
| `geo.geocode` | Find the coordinates of an address or a place name (OpenStreetMap Nominatim) |
| `geo.route` | Give the time and the distance of a drive between two points (OSRM) |

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
| `git.remote` | Get the URL of a remote |
| `git.remote.set` | Set the URL of a remote, or add the remote |
| `git.stash.apply` | Apply stash without removing |
| `git.stash.drop` | Drop a stash |
| `git.stash.export` | Export stash as patch for snapshot storage |
| `git.stash.import` | Import stash from patch |
| `git.stash.list` | List all stashes |
| `git.stash.pop` | Pop stash (apply and remove) |
| `git.stash.push` | Push changes to stash |
| `git.status` | Get git status |

## ics

| Procedure | Description |
|-----------|-------------|
| `ics.fetch` | Get a calendar feed and read its events |
| `ics.occurrences` | Give the occurrences of the events of an iCalendar text in a time window, recurrences included |
| `ics.parse` | Read the events of an iCalendar text |

## lib

| Procedure | Description |
|-----------|-------------|
| `lib.audit` | Audit ecosystem packages for issues |
| `lib.new` | Create a new package in the ecosystem |
| `lib.rename` | Rename a package across the ecosystem |
| `lib.scan` | Scan for packages in the git directory |

## logs

| Procedure | Description |
|-----------|-------------|
| `logs.query` | Query log entries from the database |
| `logs.store` | Store a log entry in the database |

## mail

| Procedure | Description |
|-----------|-------------|
| `mail.headers` | Give the headers of the recent messages of an IMAP mailbox, read only (no message becomes read) |
| `mail.parse` | Read the headers, the addresses and the text of a raw email message |

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
| `mongo.documents.aggregate` | Run an aggregation pipeline (read only: $out and $merge are refused) |
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

## notify

| Procedure | Description |
|-----------|-------------|
| `notify.send` | Send a push notification through ntfy |

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
| `procedure.export` | Export a procedure definition as JSON |
| `procedure.get` | Describe a procedure by path or key |
| `procedure.list` | List the registered procedures |
| `procedure.load` | Define the stored programs again (procedure.define), after a restart |
| `procedure.manifest` | The manifest of the registry: each exposed procedure with its schemas and effects |
| `procedure.new` | Scaffold a new procedure with types and registration boilerplate |
| `procedure.register` | Register a procedure at runtime |
| `procedure.remote` | The status of the program store of the registry |
| `procedure.store` | Write the program of a procedure that procedure.define made to the program store |
| `procedure.sync` | Synchronize the runtime-defined procedures of the registry with the program store |

## program

| Procedure | Description |
|-----------|-------------|
| `program.check` | Check a program before it runs: names, procedures, inputs, the capability and the effects |
| `program.compile` | Compile a program to a JavaScript function that makes the same calls in the same order |
| `program.diagram` | Draw a program as a Mermaid flowchart: the order of the calls, the control flow and the names |
| `program.explain` | Explain a program before it runs: its effects, each call with the answer of the capability, and the problems |

## restic

| Procedure | Description |
|-----------|-------------|
| `restic.run` | Run a restic command (backup, snapshots, restore, forget, check) |

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

## sdk

| Procedure | Description |
|-----------|-------------|
| `sdk.openrpc` | Describe the exposed procedures as an OpenRPC 1.3 document |
| `sdk.typescript` | Write a typed TypeScript SDK for the exposed procedures |

## server

| Procedure | Description |
|-----------|-------------|
| `server.call` | Call a procedure on a remote peer through an outbound connection |
| `server.connect` | Connect to a remote peer for bidirectional RPC |
| `server.connections` | List outbound connections to remote peers |
| `server.create` | Create a transport-agnostic peer that exposes procedures |
| `server.disconnect` | Disconnect from a remote peer |
| `server.start` | Start CLI server as background daemon |
| `server.status` | Get CLI server status |
| `server.stop` | Stop running CLI server |

## shell

| Procedure | Description |
|-----------|-------------|
| `shell.exec` | Execute command string via shell |
| `shell.run` | Run a command with arguments |
| `shell.stream` | Run a command and stream each output line as it arrives |
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

## systems

| Procedure | Description |
|-----------|-------------|
| `systems.timers` | The verdicts of the timer law for the timer settings of an application |

## tailscale

| Procedure | Description |
|-----------|-------------|
| `tailscale.run` | Run a tailscale command (status, ip, serve, up, down) |

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
| `vitest.coverage` | Run vitest once with coverage, and check a minimum line coverage (no shell) |
| `vitest.list` | List the vitest watch processes of this host |
| `vitest.run` | Run vitest tests once (no shell; uses the project's own vitest) |
| `vitest.stop` | Stop a vitest watch process (all of them without an id) |
| `vitest.watch` | Start vitest in watch mode (no shell; uses the project's own vitest) |

## weather

| Procedure | Description |
|-----------|-------------|
| `weather.forecast` | Give the weather forecast of a point for each day, and optionally each hour (Open-Meteo) |

