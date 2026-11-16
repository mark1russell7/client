# Mark Ecosystem Procedure Catalog

> **Generated file — do not hand-edit.** Produced by `packages/documentation/scripts/generate-procedures.ts`
> from the live `PROCEDURE_REGISTRY` (introspected after importing every built package's
> `register.js`). Regenerate with `node packages/documentation/scripts/generate-procedures.ts`.

**Total procedures:** 380 across 51 namespaces. Loaded 48 package register(s).

## Namespaces

- [`_discovery.*`](#_discovery) — 1 procedure(s)
- [`archive.*`](#archive) — 3 procedure(s)
- [`claude.*`](#claude) — 4 procedure(s)
- [`cli.*`](#cli) — 1 procedure(s)
- [`client.*`](#client) — 16 procedure(s)
- [`csv.*`](#csv) — 2 procedure(s)
- [`cue.*`](#cue) — 5 procedure(s)
- [`dag.*`](#dag) — 1 procedure(s)
- [`docker.*`](#docker) — 25 procedure(s)
- [`ecosystem.*`](#ecosystem) — 1 procedure(s)
- [`env.*`](#env) — 3 procedure(s)
- [`exif.*`](#exif) — 1 procedure(s)
- [`fs.*`](#fs) — 15 procedure(s)
- [`geo.*`](#geo) — 4 procedure(s)
- [`gh.*`](#gh) — 16 procedure(s)
- [`git.*`](#git) — 46 procedure(s)
- [`http.*`](#http) — 4 procedure(s)
- [`ics.*`](#ics) — 4 procedure(s)
- [`iosBackup.*`](#iosBackup) — 3 procedure(s)
- [`json.*`](#json) — 5 procedure(s)
- [`lib.*`](#lib) — 6 procedure(s)
- [`llm.*`](#llm) — 3 procedure(s)
- [`logs.*`](#logs) — 2 procedure(s)
- [`mail.*`](#mail) — 2 procedure(s)
- [`manifest.*`](#manifest) — 1 procedure(s)
- [`mcp.*`](#mcp) — 2 procedure(s)
- [`mongo.*`](#mongo) — 20 procedure(s)
- [`node.*`](#node) — 5 procedure(s)
- [`notify.*`](#notify) — 6 procedure(s)
- [`npm.*`](#npm) — 7 procedure(s)
- [`pdf.*`](#pdf) — 1 procedure(s)
- [`pnpm.*`](#pnpm) — 12 procedure(s)
- [`privacyScan.*`](#privacyScan) — 2 procedure(s)
- [`procedure.*`](#procedure) — 13 procedure(s)
- [`program.*`](#program) — 4 procedure(s)
- [`restic.*`](#restic) — 1 procedure(s)
- [`s3.*`](#s3) — 13 procedure(s)
- [`schedule.*`](#schedule) — 4 procedure(s)
- [`sdk.*`](#sdk) — 2 procedure(s)
- [`server.*`](#server) — 8 procedure(s)
- [`shell.*`](#shell) — 4 procedure(s)
- [`snapshot.*`](#snapshot) — 5 procedure(s)
- [`splay.*`](#splay) — 2 procedure(s)
- [`sqlite.*`](#sqlite) — 7 procedure(s)
- [`statistics.*`](#statistics) — 74 procedure(s)
- [`systems.*`](#systems) — 1 procedure(s)
- [`tailscale.*`](#tailscale) — 1 procedure(s)
- [`vite.*`](#vite) — 4 procedure(s)
- [`vitest.*`](#vitest) — 5 procedure(s)
- [`weather.*`](#weather) — 1 procedure(s)
- [`yaml.*`](#yaml) — 2 procedure(s)

---

## _discovery

| Procedure | Description |
|-----------|-------------|
| `_discovery.announce` | Exchange procedure manifests for discovery |

## archive

| Procedure | Description |
|-----------|-------------|
| `archive.create` | Make a tar.gz or zip archive of a folder or of files |
| `archive.extract` | Extract a tar.gz or zip archive into a folder, with a check of each path |
| `archive.list` | The entries of a tar.gz or zip archive |

## claude

| Procedure | Description |
|-----------|-------------|
| `claude.cancel` | Stop a turn and the processes that it started |
| `claude.follow` | Follow the output file of a turn and stream its events until the turn ends |
| `claude.read` | Read the new events of a turn from its output file |
| `claude.start` | Start one turn of the Claude Code CLI as a detached process that writes to a file |

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
| `client.not` | Logical NOT of a value |
| `client.or` | Short-circuit OR (returns first truthy or last value) |
| `client.parallel` | Execute procedures in parallel |
| `client.reduce` | Reduce an array: run fn for each item (acc and item are $refs) |
| `client.throw` | Throw an error |
| `client.trace` | Run the steps of a chain one at a time, and give one row for each step. A step that can write does not run. |
| `client.tryCatch` | Try/catch wrapper for procedures |

## csv

| Procedure | Description |
|-----------|-------------|
| `csv.parse` | Parse CSV text into rows |
| `csv.stringify` | Write rows as CSV text |

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

## docker

| Procedure | Description |
|-----------|-------------|
| `docker.build` | Build a Docker image |
| `docker.compose.build` | Build the images of the services of a compose project |
| `docker.compose.down` | Stop services with docker compose |
| `docker.compose.logs` | Get the logs of the services of a compose project (without follow) |
| `docker.compose.ps` | List the containers of a compose project |
| `docker.compose.restart` | Restart the services of a compose project |
| `docker.compose.up` | Start services with docker compose |
| `docker.exec` | Execute command in a running container |
| `docker.images` | List images |
| `docker.inspect` | Give the details of containers, images, volumes or networks: data has the JSON of docker |
| `docker.logs` | Get container logs |
| `docker.network.create` | Create a network. A name that exists is an error |
| `docker.network.list` | List networks |
| `docker.network.remove` | Remove networks |
| `docker.prune` | Remove unused containers, images, volumes, networks or build cache. It needs confirm: true |
| `docker.ps` | List containers |
| `docker.pull` | Pull a Docker image |
| `docker.push` | Push an image to a registry. The registry replaces an image with the same tag |
| `docker.rm` | Remove container(s) |
| `docker.run` | Run a Docker container |
| `docker.stop` | Stop running container(s) |
| `docker.tag` | Give an image another name. An image that had the name loses it |
| `docker.volume.create` | Create a volume. A volume that exists stays as it is |
| `docker.volume.list` | List volumes |
| `docker.volume.remove` | Remove volumes. Their data is lost |

## ecosystem

| Procedure | Description |
|-----------|-------------|
| `ecosystem.procedures` | List all procedures across the ecosystem |

## env

| Procedure | Description |
|-----------|-------------|
| `env.check` | Which required environment variables are missing |
| `env.get` | One environment variable. A secret is masked unless the host reveals it |
| `env.list` | The names of the environment variables, never the values of the secrets |

## exif

| Procedure | Description |
|-----------|-------------|
| `exif.read` | Read when and where a JPEG photo was taken (EXIF time and GPS position) |

## fs

| Procedure | Description |
|-----------|-------------|
| `fs.copy` | Copy file or directory. Without overwrite, it refuses an existing destination (EEXIST). |
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
| `geo.distance` | Give the great-circle distance between two points in kilometres (haversine), without the network |
| `geo.geocode` | Find the coordinates of an address or a place name (OpenStreetMap Nominatim) |
| `geo.geohash` | Give the geohash of a point and the cell of that geohash, without the network |
| `geo.route` | Give the time and the distance of a drive between two points (OSRM) |

## gh

| Procedure | Description |
|-----------|-------------|
| `gh.api` | Call the GitHub API and give the parsed JSON. A method other than GET can change or delete data |
| `gh.issue.comment` | Add a comment to an issue or a pull request |
| `gh.issue.create` | Open an issue |
| `gh.issue.list` | The issues of a repository |
| `gh.issue.view` | One issue, with its comments |
| `gh.pr.checks` | The checks of a pull request |
| `gh.pr.create` | Open a pull request |
| `gh.pr.list` | The pull requests of a repository |
| `gh.pr.view` | One pull request |
| `gh.release.list` | The releases of a repository |
| `gh.release.view` | One release: the release of a tag, or the latest release |
| `gh.run.download` | Download the artifacts of a workflow run into a folder |
| `gh.run.list` | The workflow runs of a repository |
| `gh.run.rerun` | Run a workflow run again |
| `gh.run.view` | One workflow run with its jobs |
| `gh.workflow.run` | Start a workflow run (a workflow_dispatch event) on a branch or a tag, with the inputs of the workflow |

## git

| Procedure | Description |
|-----------|-------------|
| `git.add` | Stage files |
| `git.blame` | Show the commit and the author of each line of a file |
| `git.branch` | Deprecated: use git.branch.list, git.branch.add or git.branch.delete. Branch operations |
| `git.branch.add` | Make a branch. An existing branch is an error |
| `git.branch.delete` | Delete a branch. With force, also a branch that is not merged |
| `git.branch.list` | List the branches, and give the current branch |
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
| `git.merge` | Merge a branch or a commit into the current branch. Conflicts give conflict: true |
| `git.merge.abort` | Stop a merge that has conflicts, and put back the state before it |
| `git.pull` | Pull from remote |
| `git.push` | Push to remote |
| `git.rebase` | Rebase the current branch on another branch (not interactive). Conflicts give conflict: true |
| `git.rebase.abort` | Stop a rebase, and go back to the branch as it was before the rebase |
| `git.rebase.continue` | Continue a rebase after the conflicts are resolved and staged |
| `git.remote` | Get the URL of a remote |
| `git.remote.set` | Set the URL of a remote, or add the remote |
| `git.reset` | Move HEAD to a commit, and reset the index (mixed) or also the working tree (hard) |
| `git.restore` | Restore files of the working tree or the index. The changes of the files are lost |
| `git.revParse` | Give the hash or the short name of a ref. An unknown ref is an error |
| `git.show` | Show a commit (its fields, files and diff), or a file at a commit |
| `git.stash.apply` | Apply stash without removing |
| `git.stash.drop` | Drop a stash |
| `git.stash.export` | Export stash as patch for snapshot storage |
| `git.stash.import` | Import stash from patch |
| `git.stash.list` | List all stashes |
| `git.stash.pop` | Pop stash (apply and remove) |
| `git.stash.push` | Push changes to stash |
| `git.status` | Get git status |
| `git.tag.add` | Make a tag. With a message, the tag is annotated. An existing tag is an error |
| `git.tag.delete` | Delete a tag |
| `git.tag.list` | List the tags, with their commits |
| `git.worktree.add` | Add a working tree in a new folder |
| `git.worktree.list` | List the working trees of the repository |
| `git.worktree.remove` | Remove a working tree and its folder |

## http

| Procedure | Description |
|-----------|-------------|
| `http.json` | Send a GET or a POST of JSON and give the parsed JSON response |
| `http.ndjson` | Read an NDJSON response to a GET or a POST as a stream of parsed lines |
| `http.request` | Send an HTTP request and give the status, the headers and the body |
| `http.sse` | Read the server-sent events of a GET or a POST as a stream |

## ics

| Procedure | Description |
|-----------|-------------|
| `ics.fetch` | Get a calendar feed and read its events |
| `ics.occurrences` | Give the occurrences of the events of an iCalendar text in a time window, recurrences included |
| `ics.parse` | Read the events of an iCalendar text |
| `ics.write` | Write an iCalendar text from events: escaped text, folded lines and CRLF line ends |

## iosBackup

| Procedure | Description |
|-----------|-------------|
| `iosBackup.file` | Find a file of an iPhone backup by its domain and relative path in Manifest.db |
| `iosBackup.find` | Find the iPhone backups (MobileSync) on this computer, the newest first |
| `iosBackup.messages` | Read the messages (iMessage and SMS) of an iPhone backup, in time order |

## json

| Procedure | Description |
|-----------|-------------|
| `json.diff` | Give the RFC 6902 JSON Patch that changes one JSON value into another |
| `json.merge` | Apply an RFC 7386 JSON merge patch to a JSON value |
| `json.patch` | Apply an RFC 6902 JSON Patch to a JSON value |
| `json.query` | Find the values at a JSON Pointer or a path in a JSON value |
| `json.validate` | Examine a JSON value against a JSON Schema |

## lib

| Procedure | Description |
|-----------|-------------|
| `lib.audit` | Audit ecosystem packages for issues |
| `lib.graph` | The dependency graph of the workspace packages: nodes, workspace: edges, cycles and build levels |
| `lib.importCycles` | The import cycles of a tree of TypeScript sources: the cycles at runtime (after the import elision), of the declared imports, or of each import |
| `lib.new` | Create a new package in the ecosystem |
| `lib.rename` | Rename a package across the ecosystem |
| `lib.scan` | Scan for packages in the git directory |

## llm

| Procedure | Description |
|-----------|-------------|
| `llm.complete` | Send a prompt to a language model and give the text and the usage. The model can use tools and procedures |
| `llm.stream` | Send a prompt to a language model and stream the events of the answer. The model can use tools and procedures |
| `llm.structured` | Send a prompt and a JSON Schema to a language model and give a value that the schema accepts |

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
| `mongo.documents.bulk` | Several writes in one request: insertOne, updateOne, updateMany, deleteOne and deleteMany, in order by default |
| `mongo.documents.count` | Count documents matching a filter |
| `mongo.documents.delete` | Delete documents matching a filter |
| `mongo.documents.distinct` | The distinct values of a field in the documents that match a filter |
| `mongo.documents.explain` | The plan of a find or an aggregation pipeline (read only: $out and $merge are refused) |
| `mongo.documents.find` | Find documents with pagination and filtering |
| `mongo.documents.get` | Get a single document by ID |
| `mongo.documents.insert` | Insert one or more documents |
| `mongo.documents.update` | Update documents matching a filter |
| `mongo.indexes.create` | Create an index on a collection |
| `mongo.indexes.drop` | Drop an index from a collection |
| `mongo.indexes.list` | List indexes on a collection |
| `mongo.watch` | The changes of a collection or a database, as a stream without an end (a change stream needs a replica set) |

## node

| Procedure | Description |
|-----------|-------------|
| `node.kill` | Kill a spawned Node.js process |
| `node.logs` | The output of a process of node.spawn: the last 64 KiB of stdout and stderr, or with follow a stream of its lines |
| `node.run` | Run a Node.js script and wait for completion |
| `node.spawn` | Spawn a long-running Node.js process |
| `node.status` | Get status of running Node.js processes |

## notify

| Procedure | Description |
|-----------|-------------|
| `notify.pushover.cancel` | Stop the repeats of a Pushover emergency message, by its receipt or by a tag |
| `notify.pushover.limits` | Read the monthly message limit of the Pushover application, the messages left and the reset time |
| `notify.pushover.receipt` | Read the receipt of a Pushover emergency message: acknowledged, by which device, expired. Read it at most once in 5 s. |
| `notify.pushover.send` | Send a Pushover message. Priority 2 repeats until the user acknowledges it, and gives a receipt. |
| `notify.pushover.validate` | Examine a Pushover user key: its active devices and licenses. It sends no message. |
| `notify.send` | Send a push notification through ntfy |

## npm

| Procedure | Description |
|-----------|-------------|
| `npm.deprecate` | Deprecate versions of a package in the registry. An empty message removes it. It needs confirm: true |
| `npm.distTags.add` | Set a dist-tag of a package to a version, in the registry. It needs confirm: true |
| `npm.distTags.list` | List the dist-tags of a package: tags has each tag and its version |
| `npm.distTags.remove` | Remove a dist-tag of a package, in the registry. It needs confirm: true |
| `npm.pack` | List the files of the tarball of the package (a dry run), or with dryRun: false make the tarball |
| `npm.view` | Read the fields of a package of the npm registry: data has the JSON of npm view |
| `npm.whoami` | Give the user name of the npm registry |

## pdf

| Procedure | Description |
|-----------|-------------|
| `pdf.render` | Render HTML to a PDF file with a headless Chromium browser |

## pnpm

| Procedure | Description |
|-----------|-------------|
| `pnpm.add` | Add packages using pnpm |
| `pnpm.exec` | Run a program of the dependencies (node_modules/.bin) with pnpm exec |
| `pnpm.install` | Install packages using pnpm |
| `pnpm.link` | Link packages using pnpm |
| `pnpm.list` | List the installed packages: data is the JSON of pnpm list --json |
| `pnpm.outdated` | List the outdated packages: data is the JSON of pnpm outdated |
| `pnpm.pack` | Make a tarball of the package: data gives its file name and files |
| `pnpm.remove` | Remove packages using pnpm |
| `pnpm.run` | Run package scripts using pnpm |
| `pnpm.store.path` | Get pnpm store path for snapshot/restore |
| `pnpm.update` | Update packages to their newest versions in the ranges, or with latest to the latest versions |
| `pnpm.why` | Show the packages that depend on a package: data is the JSON of pnpm why --json |

## privacyScan

| Procedure | Description |
|-----------|-------------|
| `privacyScan.files` | Find private data in files and folders: terms of a list, email addresses, phone numbers, coordinates |
| `privacyScan.text` | Find private data in a text: terms of a list, email addresses, phone numbers, coordinates |

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
| `procedure.search` | Search the procedures by words: the best matches of the key, the tags and the description |
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
| `s3.copy` | Copy an object inside S3 (it replaces the destination, unless overwrite is false) |
| `s3.delete` | Delete object from S3 bucket |
| `s3.download` | Download content from S3 bucket |
| `s3.head` | The metadata of an object, without its content (exists: false for a 404) |
| `s3.list` | List objects in S3 bucket |
| `s3.listAll` | List ALL objects in S3 bucket, following continuation tokens (unbounded by 1000) |
| `s3.multipart.abort` | Abort multipart upload and clean up parts |
| `s3.multipart.complete` | Complete multipart upload by assembling parts |
| `s3.multipart.init` | Initialize multipart upload for large files |
| `s3.multipart.upload` | Upload a part in multipart upload |
| `s3.presign` | A presigned URL for a GET or a PUT of an object, with an expiry in seconds |
| `s3.read` | Read an S3 object into memory, with a size limit (maxBytes, 64 MiB by default) |
| `s3.upload` | Upload content to S3 bucket |

## schedule

| Procedure | Description |
|-----------|-------------|
| `schedule.add` | Add a schedule: a cron expression that starts a stored program with an input |
| `schedule.list` | The schedules, with the next time and the last run of each |
| `schedule.next` | The next times of a cron expression |
| `schedule.remove` | Remove a schedule |

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
| `splay.bridge.info` | Get client-splay bridge information: its name and its version |

## sqlite

| Procedure | Description |
|-----------|-------------|
| `sqlite.backup` | Copy a database to a new file (it does not replace a file) |
| `sqlite.execute` | Execute a SQL statement (INSERT, UPDATE, DELETE) |
| `sqlite.migrate` | Apply the numbered migrations (a folder or a list) that a database does not have, in one transaction |
| `sqlite.query` | Execute a SQL SELECT query (read only: a statement that changes data fails) |
| `sqlite.schema` | The columns, indexes and foreign keys of a table (read only) |
| `sqlite.tables` | The tables and views of a database (read only: a missing file is an error) |
| `sqlite.transaction` | Run statements in one transaction: they all take effect, or none does |

## statistics

| Procedure | Description |
|-----------|-------------|
| `statistics.addToRunning` | This function gives the summary with one more value. It throws a RangeError for NaN, as the functions of a list do. The mean of each step is `sum / n`, so the mean of the fold is the mean of the list. |
| `statistics.bestSmoothLaw` | This function gives the smooth law with the highest likelihood. Under 300 values the result is not reliable: the normal and the log-normal law lose to the laws with a fitted end. The README gives the measured shares of correct results. The function throws as `smoothLawScores` does. |
| `statistics.binomialInterval` | The central interval of a count X ~ Binomial(n, p). `low` is the smallest k with P(X <= k) > (1 - level) / 2. `high` is the largest k with P(X >= k) > (1 - level) / 2. Each tail outside the interval holds (1 - level) / 2 or less. The two tails are separate sums, so that a small upper tail keeps its digits. |
| `statistics.binomialTest` | This function gives the p of the exact one-sided binomial test of `k` successes in `n` trials, with X ~ Binomial(n, p). The side `"less"` gives `P(X <= k)`. A small value rejects the claim "the chance is `p` or more". The side `"greater"` gives `P(X >= k)`. A small value rejects the claim "the chance is `p` or less". |
| `statistics.bootstrapLeastSquares` | A percentile bootstrap interval of each coefficient of the least-squares fit of `y` on the rows of `x`. Each run draws `n` row indexes with replacement, and fits the drawn rows and their `y` values. All the intervals come from the same draws. The estimate of each interval is the coefficient of the fit of all the data. A run with a singular design gives NaN coefficients, so it does not count. The shape errors are the errors of `leastSquares`. |
| `statistics.bootstrapMedian` | A bootstrap interval of the median. |
| `statistics.bootstrapMedianRatio` | A bootstrap interval of the ratio `median(numerator) / median(denominator)` of two independent samples. The interval is the uncertainty of the ratio of the two medians. It is not the spread of the samples. A run whose denominator median is 0 is not finite, so it does not count. |
| `statistics.bradleyTerry` | The Bradley-Terry fit of `comparisons` among `items` items. The function does not sort or change its inputs. An empty list of comparisons gives the prior for each item. The function throws a RangeError for a bad index, a bad outcome, a bad weight and a bad option. |
| `statistics.bradleyTerrySparse` | The sparse Bradley-Terry fit of `comparisons` among `items` items. It has the model, the options and the checks of `bradleyTerry`, and its memory is in proportion to `items` plus the distinct pairs. The function does not sort or change its inputs. It throws a RangeError for a bad index, a bad outcome, a bad weight and a bad option. |
| `statistics.brier` | The Brier score: the mean of (p - outcome)^2. 0 is perfect, and 0.25 is a constant 0.5. Lower is better. |
| `statistics.calibration` | The hit rate of each stated level, from the lowest level. |
| `statistics.cohenKappa` | Cohen's kappa of two raters (Cohen, 1960). Item `i` has the category `a[i]` from one rater and `b[i]` from the other. Two categories are the same when they are `===`. A kappa of 1 is full agreement, and 0 is the agreement of chance. |
| `statistics.compareRatios` | The comparison of a candidate with a baseline, from the ratio candidate / baseline of each input. It answers the three questions of a promotion. How often is the candidate better? By how much? How often is it worse beyond the noise? A promotion reads `gains` against `drops` and `effect`, not `signP` alone, because a sign test counts a win of any size. |
| `statistics.coverageMinSample` | This function applies a fixed bar of coverage to the cells of a study. It gives the smallest sample size `m` from which an interval method keeps its level. The method qualifies at `m` when the cells with a sample of `m` or more pass two tests: |
| `statistics.eloExpected` | The expected score of the first item against the second item: `1 / (1 + base ** ((rb - ra) / scale))`. A win counts 1, a tie 0.5 and a loss 0. The expected score of the second item is 1 minus this value. |
| `statistics.eloReplay` | The Elo ratings of `items` items after each pick of `comparisons`, in the order of the list. Each item starts at `start`. The update of each pick is `eloUpdate` with the options. The order of the picks changes the result. |
| `statistics.eloUpdate` | The Elo update of a pair after one result. The `score` is the score of the first item: 1 for a win, 0.5 for a tie and 0 for a loss. Each rating moves by `k` times the difference between the score and the expected score. Thus the sum of the two ratings does not change. |
| `statistics.fitRatings` | The log-strengths of `items` items with one rating model. The model `"bradley-terry"` uses `bradleyTerry`, or `bradleyTerrySparse` above `denseLimit` items. The models `"elo"` and `"glicko2"` use `eloReplay` and `glicko2Replay`, and they refuse a weight other than 1. A log of 0 items gives empty lists. |
| `statistics.fitResponse` | This function fits each measure of `data`, and it gives a record with the models and the folds. |
| `statistics.glicko2Idle` | The Glicko-2 rating of a player after a rating period with no games. The rating and the volatility stay the same. The RD grows to `sqrt(RD^2 + (173.7178 * volatility)^2)`. |
| `statistics.glicko2Replay` | The Glicko-2 ratings of `items` items after each pick of `comparisons`, in the order of the list. Each pick is one rating period of its two items. Each item of a pick gets `glicko2Update` against the rating of the other item before the pick. An item that is not in a pick does not change in that period. The order of the picks changes the result. |
| `statistics.glicko2Update` | The Glicko-2 update of one player after one rating period (Glickman, "Example of the Glicko-2 system", 2012). The function uses the Illinois algorithm for the new volatility. The games use the ratings of the opponents from the start of the period. An empty list of games gives `glicko2Idle(player)`. |
| `statistics.heldOutError` | This function gives the held-out error of a measure over all the folds. Each point has the same weight, so a small fold has a small effect. The function throws a RangeError when no fold has the measure. |
| `statistics.heldOutErrorAt` | This function gives the held-out error of a chosen set of points, on the scale of the model. It uses the stored predictions of the option `outOfFold`. Thus a reader can get the error of one cell. The result has the fields of `heldOutError`, and the set of all the points gives the same values to the rounding of the sums. |
| `statistics.holm` | The Holm step-down correction of a family of tests (Holm, 1979). It keeps the chance of one false claim or more in the family at most `level`. It has no condition on how the tests depend on each other. The result is in the order of the input. |
| `statistics.kendallTau` | The Kendall tau-b of two lists (Kendall, 1938). The value is from -1 to 1. A pair with a tie in both lists does not count. When the lists have fewer than 2 values, or no pair counts, the value is 1. Above `KENDALL_EXACT` values, a seeded sample of 200 000 pairs gives an estimate. It is equal to the copy in highways. |
| `statistics.leastSquares` | The ordinary least-squares fit of `y` on the rows of `x`, with `k` coefficients. Each row has the same number of predictors. The fit solves the problem with a Householder QR decomposition. When the design does not have full rank, or when `n <= k`, the coefficients, `residualSd` and `r2` are NaN. When the total sum of squares is 0, `r2` is NaN. |
| `statistics.logLoss` | The log-loss of predictions: the mean of `-ln(p)` for a hit and `-ln(1 - p)` for a miss. 0 is perfect, and `ln(2)` is a constant 0.5. Lower is better. A p of 0 for a hit gives Infinity. For an outcome of three values, give the probability of the observed outcome as `p`, with `hit` true. |
| `statistics.mean` | _(no description)_ |
| `statistics.median` | The median: the middle value, or the midpoint `(a + b) / 2` of the two middle values. The midpoint is correctly rounded. `quantile(values, 0.5)` computes `a + 0.5 * (b - a)`, which can differ from it in the last bit. |
| `statistics.medianInterval` | The distribution-free interval of the median of a sample. It needs no assumption about the shape of the distribution. It is x_(k) to x_(n + 1 - k), for the largest k whose two tails each hold (1 - level) / 2 or less. For 11 values at the level 0.95, it is x_(2) to x_(10), with the coverage 0.988. |
| `statistics.mergeRunning` | This function gives the summary of the values of two summaries (Chan, Golub and LeVeque, 1979). Thus parallel jobs can each summarize a part. The sum of the merge adds the two sums, so it can differ from the fold in the last bits. |
| `statistics.modeCount` | This function counts the modes of a sample. A mode counts when it holds `minShare` of the mass. The default counts the modes that hold 10 percent, and a caller who needs all modes passes a smaller value. The result is at least 1. The result is the same for `x` and `-x`. |
| `statistics.negativeBinomialInterval` | The central interval of a negative binomial count. X is the count of failures before `successes` successes, and `p` is the chance of a success at each try. `low` is the smallest k with P(X <= k) > (1 - level) / 2. `high` is the smallest k with P(X <= k) >= 1 - (1 - level) / 2. |
| `statistics.noiseFloor` | The noise floor of a measure: k sample standard deviations of its value over independent seeds or folds. When the margin of practical effect is larger, the floor is the margin. A difference smaller than the floor is not a result. |
| `statistics.noiseVerdict` | The noise rule of a difference (candidate minus baseline) over independent seeds or folds: the mean against max(k standard deviations, margin). With `better: "lower"`, a negative mean is the gain. When each value is equal, the state is "no-spread" and not a result, also when the mean is beyond the margin. Find out why the seeds do not change the value before you read the difference. |
| `statistics.normalCdf` | This function gives the standard normal cumulative distribution, `P(Z <= x)`. Below 0.75 in size, `x` uses the series of `0.5 + phi(x) * (x + x^3/3 + x^5/15 + ...)`. The tails use the continued fraction of the Mills ratio, so a lower tail has no cancellation. On 2026-11-09 the error was at most 4.4 ulps from -38 to 9, against `mpmath`. `normalCdf(-37)` is approximately 5.7e-300, not 0. |
| `statistics.normalQuantile` | This function gives the quantile of the standard normal law: the `x` with `normalCdf(x) = p`. It uses PPND16 of Wichura (algorithm AS 241). Below 0.075, one step of Halley with `normalCdf` follows. Above 0.5, `p` uses the lower tail at `1 - p`. This subtraction is exact. On 2026-11-09 the error was at most 1.2 ulps in the tails and 5.5 ulps from 0.075 to 0.925, against `mpmath`. |
| `statistics.optionFloor` | This function gives the smallest count of values for each of two options. With it, one test finds a difference of `delta` with the stated power. The form is `n = 2 ((t(1 - alpha / (2 tests), df) + t(power, df)) sigma / delta)^2`, with `df = 2 n - 2`. The count is on both sides of that form, so the function takes the first count that meets it. |
| `statistics.pairInformation` | The expected information of a pick between two items: `p * (1 - p) * (ua^2 + ub^2)`. Here `p` is `eloExpected` of the two ratings, and `ua` and `ub` are the uncertainties. The value is high when the result is not sure (a `p` near 0.5) and the two ratings are not sure. |
| `statistics.pairProbabilities` | The probabilities of a pair under the Bradley-Terry model with Davidson (1970) ties. The inputs are the log-strengths of the two items and the tie parameter `tie` of `bradleyTerry`. With `tie` 0, the probability that the first item wins is `1 / (1 + exp(sb - sa))`. A constant added to the two strengths changes no probability. |
| `statistics.parseResponseRecord` | This function examines unknown data, for example the result of `JSON.parse`, against `response-records/1`. It gives `{ ok: true, record }`, with the same object as the record, or `{ ok: false, faults }`. Each fault has the path of the bad field and a message. The function does not throw. Data that the checks cannot read, for example an object with a loop, gives one fault. |
| `statistics.partialConjunction` | The p of the claim "at least `need` of these tests have a real effect" (Benjamini and Heller, 2008). The value is `(m - need + 1)` times the `need`-th smallest p, at most 1. It has no condition on how the tests depend on each other. With 2 tests and `need` 2, the value is the larger p. |
| `statistics.predictResponse` | This function gives the value of a model at `inputs`, on the scale of the measure. The inputs have a value for each dimension that the model reads. An absent conditional dimension has `null`. A table model gives its `fallback` for a combination with no cell. |
| `statistics.quantile` | The `p` quantile of a list. |
| `statistics.quantileInterval` | This function gives the distribution-free interval of the quantile `p` of a sample. Each tail outside the interval holds (1 - level) / 2 or less. Let X ~ Binomial(n, p). The lower rank is the largest l with P(X <= l - 1) in the tail. The upper rank is the smallest u with P(X >= u) in the tail. The values must be independent draws, or the coverage is false. |
| `statistics.quantileSamples` | This function gives the fewest independent values that give the quantile `p` an upper bound at `level`: the smallest n with p^n <= (1 - level) / 2. With that n, the upper bound is the largest value. At the level 0.95, p95 needs 72 values, p99 needs 368 values and p99.9 needs 3,688 values. |
| `statistics.quantileSorted` | The `p` quantile of a list that is already sorted. Use it when you take several quantiles of one list. The linear method gives the same numbers as the copies in highways, packing and layout-contract. The nearest-rank method gives the same numbers as the copies in lag, lag-hud and the backtest of highways. The higher method gives the upper median of the copies in highways with `p = 0.5`. |
| `statistics.ranks` | The ranks of the values, from 1. Equal values get the mean of their ranks. |
| `statistics.ratingToStrength` | The log-strength of a rating. It is the inverse of `strengthToRating` with the same options. |
| `statistics.ratingUncertainty` | The uncertainty of a rating, in rating points: its standard error, or `RATING_START_UNCERTAINTY / sqrt(1 + picks)`. |
| `statistics.responseCells` | This function gives the number of fitted places of a view before the view starts: the product of the lengths of its axes. A level axis counts its levels, and a continuous axis counts `steps`. The field `nearest` reads each point at each place, so the reads of a view are this count times the number of points. The default of `steps` is the default of a view. The function throws a RangeError for an unknown dimension, for one dimension named two times, and for a bad `steps`. |
| `statistics.ridgeSolve` | This function gives the coefficients `beta` that solve `(gram + lambda * P) beta = moment`. - `gram` is the symmetric matrix `X'X` of size `k`, in row order. The function reads only its lower triangle. - `moment` is the vector `X'y` of length `k`. - With `lambda` 0, the result is the ordinary least-squares fit. |
| `statistics.runningMean` | This function gives the mean of the values: `sum / n`. It throws a RangeError for the empty summary. |
| `statistics.runningSd` | This function gives the sample standard deviation of the values (the divisor is n - 1). It needs 2 values or more. Equal values give exactly 0, as `sd` gives. A rounding error cannot make the result NaN. |
| `statistics.sampleTotalInterval` | A bootstrap interval of the total of a population from a uniform sample of `m` of its `n` items, drawn without replacement. The estimate is `scale * sum(values)`. Each run draws `m` values with replacement, as `bootstrap` does. The deviation of each run from the sum of the sample gets the factor `scale * sqrt(1 - m / n)`, the finite population correction. When `m` is `n`, the interval is the estimate. |
| `statistics.sd` | The sample standard deviation (the divisor is n - 1). It needs 2 values or more. Equal values give exactly 0. The rounding of the mean gives a small number that is not 0 for some equal values, so the function examines them first. |
| `statistics.selectRatingModel` | The choice of a rating model by the log-loss on held-out picks. Each model learns from the first picks of the log and forecasts the last `holdout` part. All models use the tie parameter of the Bradley-Terry fit of the first picks. Thus the strengths are the only difference. Two equal scores keep the order of `models`. Each pick has the weight 1. |
| `statistics.signFlipTest` | The sign-flip test of a sum of terms. Under the null, each term has the sign + or - with equal chance. The statistic is the absolute value of the sum. A weighted mean of paired differences is such a sum: give the terms `w[i] * d[i]`. |
| `statistics.signTest` | The sign test of paired results: `better` inputs where the candidate wins and `worse` where it loses. The ties do not count. One-sided (the default), it is the p of `better` wins or more if the two are equal. Two-sided, it is two times the tail of the larger count, at most 1. The one-sided p is equal to `signTestP` of packing. |
| `statistics.signTestPower` | The smallest number of wins out of `n` that the sign test calls significant at `level`. It is undefined when even n wins out of n are not enough. Use it before a run, to know how many inputs a claim needs. |
| `statistics.sliceResponse` | This function gives a view of a measure over one dimension of a parsed record: - `curve`: the fitted value at each level, or at `steps` values of a continuous dimension, with its band. - `points`: the measured points that match the held values. This list is empty when no point matches them. - `absent`: the points that match the held values and have no value of the measure, each with its reason. A chart can draw each reason apart. - `held`: the value of each other dimension. - `error`: the held-out error. |
| `statistics.smoothLawScores` | This function gives the mean log density of the values under each smooth law, at the closed-form fit of that law. Each law has 2 fitted numbers, so the function adds no penalty. The uniform, the shifted exponential and the Pareto law take the smallest value as their lower limit. This fitted end helps them at small sizes. All values are exact maximum likelihoods. The function throws a RangeError for an empty list, for a value that is not positive and finite, or for equal values. |
| `statistics.sobolIndices` | This function gives the first-order and the total Sobol index of each dimension of a record, for the model of `measure`. The indices are of the prediction of the model, not of the measured points. |
| `statistics.sorted` | A new list with the values from the smallest to the largest. |
| `statistics.spearman` | The Spearman rank correlation: the Pearson correlation of the ranks, with mean ranks for ties. The value is from -1 to 1. When one list has no spread, the value is 0. It is equal to the copy in the backtest of highways. |
| `statistics.strengthToRating` | The rating of a log-strength: `center + scale * strength / ln(base)`. The defaults give `1500 + 400 * log10(e) * strength`. Thus `eloExpected` of two ratings is the Bradley-Terry win probability. |
| `statistics.summarize` | _(no description)_ |
| `statistics.surfaceResponse` | This function gives the view of `sliceResponse` over two dimensions. The fields `x` and `y` are the two axes, and `cells` has one row for each value of `y`. The rules of the held values, of the matching points and of the band are the rules of `sliceResponse`. The function also throws a RangeError when the two varied dimensions are one dimension. It throws when a conditional dimension varies with its parent, and when two varied dimensions need no common level. |
| `statistics.tQuantile` | This function gives the quantile of the Student t law, from a bisection of its distribution function. |
| `statistics.uStatisticInterval` | This function gives the interval of a total over all the sets of `r` units of a population. The data is a uniform sample of `m` of the `n` units, without replacement. An example is the count of crossings between all pairs of routes. The input is the total of each sampled unit: the sum of the kernel over the sets of `r` sampled units that hold the unit. Thus the sum of the totals is `r * S`, with `S` the total of the sample. The kernel is symmetric. |
| `statistics.whenHolds` | This function gives true when a place has the condition of a dimension. A dimension with no condition is present. |
| `statistics.wilson` | The Wilson score interval of `k` successes in `n` trials (Wilson, 1927). It keeps its level for a small n and for a proportion near 0 or 1, where the normal interval does not. For n = 0 the interval is 0 to 1. |
| `statistics.wilsonSampleSize` | The smallest number of trials `n` at which the Wilson lower end reaches `target`, when the true proportion is `expected`. Each `n` takes `round(expected × n)` successes. The function gives `undefined` when `expected` is not above `target`, or when no `n` up to `max` reaches it. An audit of an agreement uses it to fix its size. |

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

## yaml

| Procedure | Description |
|-----------|-------------|
| `yaml.parse` | Parse YAML text into a JSON value |
| `yaml.stringify` | Write a JSON value as YAML text |

