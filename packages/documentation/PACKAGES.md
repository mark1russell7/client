# Package Reference

> **Generated file — do not hand-edit.** Produced by `packages/documentation/scripts/generate-packages.mjs`
> from the workspace's package.json files and the live procedure registry.
> Regenerate with `node packages/documentation/scripts/generate-packages.mjs` after `pnpm build`.

**Packages:** 48. **Procedures:** 267. The full procedure list is in [PROCEDURES.md](./PROCEDURES.md).

Dependencies marked *(general)* are separate repositories, published on npm under `@mark1russell7`.

| Package | Folder | Description | Procedures | Depends on |
|---|---|---|---|---|
| `@procedures/bundle-assistant` | `packages/bundle-assistant` | The opt-in tools of the personal assistant for an MCP host: calendar files, mail parsing, places, routes, weather and photo metadata, without the procedures that can carry data out. | — | `client`, `exif`, `geo`, `ics`, `mail`, `weather` |
| `@procedures/bundle-dev` | `packages/bundle-dev` | One import that registers the development procedures of the client ecosystem: shell, file system, git, pnpm, workspace, DAG and procedure scaffolding. | `client.*` (15), `procedure.*` (5) | `cli-run`, `client`, `compiler`, `dag`, `fs`, `git`, `lib`, `pnpm`, `procedure`, `shell` |
| `@procedures/bundle-mcp` | `packages/bundle-mcp` | The curated tool surface for Claude: registers the docker, mongo, sqlite, cue, vitest and workspace procedures and selects which ones an MCP server exposes. | — | `client`, `compiler`, `cue`, `docker`, `json`, `lib`, `mongo`, `procedure`, `sqlite`, `vitest` |
| `@procedures/repo-cli` | `packages/cli` | — | — | — |
| `@procedures/client` | `packages/client` | Procedures as data for TypeScript: define typed procedures once and call them in process, over HTTP, WebSocket, the CLI or MCP. Streaming, middleware, retries, caching and a JSON program format. | — | `@mark1russell7/quantity` *(general)* |
| `@procedures/cli-run` | `packages/client-cli` | Run any mark CLI command as a procedure (cli.run) with a safe argv mapping: no shell, typed flags and captured output. | `cli.*` (1) | `client`, `shell` |
| `@procedures/collections` | `packages/client-collections` | Collections for TypeScript: ArrayList, LinkedList, ArrayDeque, HashMap, LinkedHashMap, TreeMap (red-black), PriorityQueue, LRU and TTL maps, async queues, channels and collectors, tested with fast-check. | — | — |
| `@procedures/cue` | `packages/client-cue` | cue-config as procedures: generate package.json, tsconfig.json and .gitignore from CUE feature presets, add and remove features, and validate projects. | `cue.*` (5) | `client`, `fs`, `shell`, `@mark1russell7/cue` *(general)* |
| `@procedures/dag` | `packages/client-dag` | Dependency graph algorithms for TypeScript: build a DAG, detect cycles, compute topological levels and traverse in parallel with a concurrency limit. | — | — |
| `@procedures/docker` | `packages/client-docker` | Docker and Docker Compose as typed procedures: ps, run, exec, logs (streaming), build, pull, push, tag, images, inspect, volumes, networks, prune, stop, rm, compose up, down, ps, logs, build and restart, run with argv and no shell injection. | `docker.*` (25) | `client`, `shell` |
| `@procedures/fs` | `packages/client-fs` | File system procedures: read, write, copy, move, glob, exists, mkdir and JSON read and write, callable in process, over RPC or from Claude through MCP. | `fs.*` (15) | `client` |
| `@procedures/git` | `packages/client-git` | Git as 45 typed procedures: status, diff, log, show, blame, commit, push, pull, branch, tag, merge, rebase, worktree, stash and more, run with argv, async and abortable. | `git.*` (46) | `client`, `shell` |
| `@procedures/lib` | `packages/client-lib` | Workspace procedures for pnpm monorepos: scan the packages, graph their dependencies, scaffold a new package, audit packages against a template, rename across the workspace, and program runners. | `lib.*` (5), `ecosystem.*` (1), `dag.*` (1), `core.*` (1) | `client`, `dag`, `fs`, `git`, `pnpm`, `shell` |
| `@procedures/mcp-server` | `packages/client-mcp` | Model Context Protocol server transport: serve typed procedures as MCP tools to Claude and other MCP clients, with streaming progress, list_changed and an expose policy. | `mcp.*` (2) | `mcp` |
| `@procedures/mongo` | `packages/client-mongo` | MongoDB as typed procedures: documents, bulk writes, distinct, explain, collections, indexes, aggregation, change streams and database info, with safe update and delete targets. | `mongo.*` (20) | `client`, `collections` |
| `@procedures/node` | `packages/client-node` | Node.js process procedures: run scripts, spawn and manage long-running processes and read their logs, with output caps and process-tree cleanup. | `node.*` (5) | `client`, `shell` |
| `@procedures/playground` | `packages/client-playground` | A typed fluent API to write procedure programs in TypeScript (proc, ref, run) with autocomplete, then run them with the client. | — | `client` |
| `@procedures/pnpm` | `packages/client-pnpm` | pnpm commands as typed procedures: install, add, remove, run, exec, list, why, outdated, update, pack and link, with --filter and -r, run with argv and option-injection guards. | `pnpm.*` (12) | `client`, `shell` |
| `@procedures/procedure` | `packages/client-procedure` | Procedure scaffolding and management: procedure.new writes typed procedure files, plus get, list, define and the procedure store. | `procedure.*` (2) | `client` |
| `@procedures/s3` | `packages/client-s3` | AWS S3 as typed procedures: upload, download with safe part files, list, head, copy, presigned URLs, delete and multipart uploads. | `s3.*` (12) | `client` |
| `@procedures/peer` | `packages/client-server` | Serve procedures: HTTP and WebSocket peers with token authentication, browser checks, an expose list, server.create, status and stop, and manifests. | `server.*` (8), `manifest.*` (1), `_discovery.*` (1) | `client` |
| `@procedures/shell` | `packages/client-shell` | Safe command execution for TypeScript: shell.run with argv and no shell, shell.stream line streaming with backpressure, process-tree kill, timeouts and output caps. | `shell.*` (4) | `client` |
| `@procedures/snapshot` | `packages/client-snapshot` | Snapshot and restore development environments with S3: git state, packages and files, with streamed archives and a safe restore. | `snapshot.*` (5) | `client`, `fs`, `git`, `pnpm`, `s3`, `shell` |
| `@procedures/splay` | `packages/client-splay` | Render procedure results with splay: a bridge between the client procedures and the splay recursive renderer, with stream helpers. | `splay.*` (2) | `client`, `@mark1russell7/splay` *(general)* |
| `@procedures/sqlite` | `packages/client-sqlite` | SQLite procedures with sql.js and no native build: queries, tables and schemas, transactions, migrations, backups and structured logs, safe for concurrent writes. | `db.*` (7), `logs.*` (2) | `client`, `@mark1russell7/docker-sqlite` *(general)* |
| `@procedures/store` | `packages/client-store` | A program store for procedure-as-data: save the programs that procedure.define makes, load them back after a restart, in memory, a JSON file or a remote collection storage. | `procedure.*` (5) | `client`, `collections` |
| `@procedures/vite` | `packages/client-vite` | Vite as procedures: dev server, build, preview and stop, with no shell and managed processes. | `vite.*` (4) | `client`, `shell` |
| `@procedures/vitest` | `packages/client-vitest` | Vitest as procedures: run the tests with results and coverage, watch, and stop the managed watch processes. | `vitest.*` (5) | `client`, `shell` |
| `@procedures/compiler` | `packages/compiler` | The compiler of procedure programs: it checks a JSON program before the first call (scopes, effects, schemas, capability) and writes it as a plain async function. | `program.*` (4), `sdk.*` (2) | `client` |
| `@procedures/documentation` | `packages/documentation` | — | — | — |
| `@procedures/exif` | `packages/exif` | When and where a JPEG photo was taken, from its EXIF block (time, offset, GPS), without a dependency. | `exif.*` (1) | `client` |
| `@procedures/geo` | `packages/geo` | Map procedures: the coordinates of an address (OpenStreetMap Nominatim) and the time and distance of a drive (OSRM). | `geo.*` (2) | `client` |
| `@procedures/gh` | `packages/gh` | The GitHub CLI as procedures: pull requests, workflow runs, releases and issues, with an argument list and no shell. | `gh.*` (13) | `client`, `shell` |
| `@procedures/http` | `packages/http` | HTTP as procedures: request, JSON, NDJSON and server-sent events, with a host allowlist that refuses private addresses, size limits and the deadline of the call. | `http.*` (4) | `client` |
| `@procedures/ics` | `packages/ics` | An iCalendar (RFC 5545) reader without dependencies: the events of a calendar and their occurrences in a time window, recurrences included. | `ics.*` (3) | `client` |
| `@procedures/mcp-dev-tools` | `packages/impl-mcp-dev` | A ready-to-use MCP server for Claude Code and Claude Desktop: 91 developer tools (docker, mongo, sqlite, cue, vitest, workspace) with a strict call policy. | — | `bundle-mcp`, `client`, `compiler`, `mcp-server` |
| `@procedures/json` | `packages/json` | Pure JSON and YAML procedures: a query with JSON Pointer or a path, JSON Patch, a diff, a merge patch, a JSON Schema check, and YAML to JSON and back. | `json.*` (5), `yaml.*` (2) | `client`, `compiler` |
| `@procedures/mail` | `packages/mail` | Email procedures: the headers, addresses and text of a raw MIME message, and the headers of recent IMAP messages, read only. | `mail.*` (2) | `client` |
| `@procedures/mark` | `packages/mark` | mark: one CLI for every procedure package. It finds the procedures, parses flags by their Zod types, runs local or through a fast warm server, and asks for missing arguments. | — | `cli-run`, `client`, `lib`, `mcp-dev-tools`, `peer`, `pnpm`, `procedure`, `server`, `shell`, `vitest` |
| `@procedures/mcp` | `packages/mcp` | Map typed procedures to MCP tools: JSON Schema from Zod, tool names, and input and result conversion for Model Context Protocol servers. | — | — |
| `@procedures/notify` | `packages/notify` | Push notifications through ntfy, the public server or your own, with a title, a priority, tags and a tap address. | `notify.*` (1) | `client` |
| `@procedures/npm` | `packages/npm` | The npm registry as typed procedures: view, dist-tags, whoami, pack (a dry run by default) and deprecate, run with argv, and a confirmation for each write to the registry. | `npm.*` (7) | `client`, `shell` |
| `@procedures/restic` | `packages/restic` | The restic backup program as one procedure: backup, snapshots, restore and forget, with JSON output and no secret as input. | `restic.*` (1) | `client`, `shell` |
| `@procedures/server` | `packages/server` | A standalone procedure server: load procedure packages and serve them over HTTP and WebSocket with a token and an expose list. | — | `client`, `peer` |
| `@procedures/site` | `packages/site` | The website of the client ecosystem: the Composer, the procedure catalog and the architecture map | — | `client` |
| `@procedures/systems` | `packages/systems` | The timer law of systems for the client: it binds the times of the middleware, the transports and the server to the symbols of the law, and examines the rules of the client. | `systems.*` (1) | `@mark1russell7/service` *(general)*, `client` |
| `@procedures/tailscale` | `packages/tailscale` | The tailscale CLI as one procedure: status, ip, serve, up and down, with JSON output. | `tailscale.*` (1) | `client`, `shell` |
| `@procedures/weather` | `packages/weather` | A weather forecast for a point from Open-Meteo, without a key: each day and each hour, metric or imperial. | `weather.*` (1) | `client` |

Procedures are counted for the package whose `register.js` adds them first, in dependency order.
A bundle (`bundle-dev`, `bundle-mcp`) adds none of its own.
