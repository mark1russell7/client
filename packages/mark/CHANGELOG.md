# @procedures/mark

## 0.27.3

### Patch Changes

- @procedures/lib@0.27.3
  - @procedures/pnpm@0.27.3
  - @procedures/procedure@0.27.3
  - @procedures/peer@0.27.3
  - @procedures/shell@0.27.3
  - @procedures/mcp-dev-tools@0.27.3
  - @procedures/server@0.27.3
  - @procedures/client@0.27.3
  - @procedures/cli-run@0.27.3
  - @procedures/vitest@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2
  - @procedures/server@0.27.2
  - @procedures/cli-run@0.27.2
  - @procedures/lib@0.27.2
  - @procedures/pnpm@0.27.2
  - @procedures/procedure@0.27.2
  - @procedures/peer@0.27.2
  - @procedures/shell@0.27.2
  - @procedures/vitest@0.27.2
  - @procedures/mcp-dev-tools@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1
  - @procedures/cli-run@0.27.1
  - @procedures/lib@0.27.1
  - @procedures/pnpm@0.27.1
  - @procedures/procedure@0.27.1
  - @procedures/peer@0.27.1
  - @procedures/shell@0.27.1
  - @procedures/vitest@0.27.1
  - @procedures/mcp-dev-tools@0.27.1
  - @procedures/server@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0
  - @procedures/peer@0.27.0
  - @procedures/mcp-dev-tools@0.27.0
  - @procedures/cli-run@0.27.0
  - @procedures/lib@0.27.0
  - @procedures/pnpm@0.27.0
  - @procedures/procedure@0.27.0
  - @procedures/shell@0.27.0
  - @procedures/vitest@0.27.0
  - @procedures/server@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2
  - @procedures/cli-run@0.26.2
  - @procedures/lib@0.26.2
  - @procedures/pnpm@0.26.2
  - @procedures/procedure@0.26.2
  - @procedures/peer@0.26.2
  - @procedures/shell@0.26.2
  - @procedures/vitest@0.26.2
  - @procedures/mcp-dev-tools@0.26.2
  - @procedures/server@0.26.2

## 0.26.1

### Patch Changes

- @procedures/mcp-dev-tools@0.26.1
  - @procedures/client@0.26.1
  - @procedures/cli-run@0.26.1
  - @procedures/lib@0.26.1
  - @procedures/pnpm@0.26.1
  - @procedures/procedure@0.26.1
  - @procedures/peer@0.26.1
  - @procedures/shell@0.26.1
  - @procedures/vitest@0.26.1
  - @procedures/server@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0
  - @procedures/cli-run@0.26.0
  - @procedures/lib@0.26.0
  - @procedures/pnpm@0.26.0
  - @procedures/procedure@0.26.0
  - @procedures/peer@0.26.0
  - @procedures/shell@0.26.0
  - @procedures/vitest@0.26.0
  - @procedures/mcp-dev-tools@0.26.0
  - @procedures/server@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0
  - @procedures/peer@0.25.0
  - @procedures/mcp-dev-tools@0.25.0
  - @procedures/cli-run@0.25.0
  - @procedures/lib@0.25.0
  - @procedures/pnpm@0.25.0
  - @procedures/procedure@0.25.0
  - @procedures/shell@0.25.0
  - @procedures/vitest@0.25.0
  - @procedures/server@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1
  - @procedures/cli-run@0.24.1
  - @procedures/lib@0.24.1
  - @procedures/pnpm@0.24.1
  - @procedures/procedure@0.24.1
  - @procedures/peer@0.24.1
  - @procedures/shell@0.24.1
  - @procedures/vitest@0.24.1
  - @procedures/mcp-dev-tools@0.24.1
  - @procedures/server@0.24.1

## 0.24.0

### Minor Changes

- 4261f65: Breaking: each `mark` command starts under `run()` of `@mark1russell7/service` (CLI-26, decision D17). The cold mode runs the procedures host of the CLI server in its own process. The runner owns the signals, the stop in stages and the exit. Thus the exit codes of a signal change. The release before this one marked the old behaviors as deprecated.
  
  The new behavior:
  
  - Each `mark` command that runs a procedure is a service of one request, with the profile `ephemeral`. `mark` has no signal handler and no `process.exit` of its own in this path. `interruptSignal()` is gone.
  - The cold mode (no CLI server in this folder, or `--local`): the host has the same registry and policy as `mark --server` (`markHostOptions()`), and no listener, port, token or lockfile. The client sends each call through the local face of the host.
  - `localFace()` of `@procedures/peer` is new. It gives a face factory and a transport of `@procedures/client`. A `Client` on the transport sends its calls to the host of the same process, through the request tracking of the service, with `LOCAL_CREDENTIALS`.
  - A first Ctrl-C starts the stop, and the drain aborts the call at once.
  - The warm mode: the call to the CLI server gets the abort signal. A Ctrl-C aborts the call on the server too. Before, the signal ended `mark`, and the server continued the call.
  - After the command, the runner ends the process with the exit code of the command. A timer or a socket that a procedure left open does not keep the process alive.
  - `run()` and `main()` of `@procedures/mark` get the optional options `run` (the options of `run()`: the process port and the clock) and `ownsProcess`. The bin gives `ownsProcess: true`. Without it, a program keeps its process: no signal handler, and the exit code goes to `process.exitCode`.
  - `CliContext` gets the optional field `registry`. `executeArgs()` does not use `ctx.client` for a command any more.
  - A program that calls `run()` or `executeArgs()` without a port, and the REPL (`mark -i`), get no signal handler for a command.
  
  The exit codes, in the cold mode and in the warm mode:
  
  | Event | Before | From this release |
  |---|---|---|
  | The command ends without a failure | 0 | 0 |
  | The command fails | 1 | 1 |
  | The first Ctrl-C, cold mode | 1 | 130 |
  | The first Ctrl-C, warm mode | the signal ended the process (the shell showed 130) | 130 |
  | `SIGTERM` | the signal ended the process (the shell showed 143) | 143 |
  | A second signal during the stop, cold mode | 130 | 1 |
  
  A cold `mark server create` keeps its peer only until the end of the command. Before, the peer kept the process alive after the command.
  
  Migration:
  
  - A script that reads the exit code of an interrupted `mark` command: read 130 for a Ctrl-C, also in the cold mode. Read 1 for a second signal.
  - A script that starts `mark server create` as a server in the foreground: start `mark --server` or `procedure-server` in its place.
  - A program that calls `run()`, `main()` or `executeArgs()` of `@procedures/mark`: no change. It keeps its process. Give `ownsProcess: true` to give the process to the runner, as the bin does.
  - The site: no change. It does not start `mark`.
  - MiniMongo: no change. Its dev host starts through `runProcedureHost()`, not through `mark`.
  - Graph: no change. It does not start `mark`.
  - jarvis: no change, unless a script of jarvis reads the exit code of an interrupted `mark` command. Then apply the first step.

### Patch Changes

- Updated dependencies [4261f65]
  - @procedures/peer@0.24.0
  - @procedures/server@0.24.0
  - @procedures/client@0.24.0
  - @procedures/cli-run@0.24.0
  - @procedures/lib@0.24.0
  - @procedures/pnpm@0.24.0
  - @procedures/procedure@0.24.0
  - @procedures/shell@0.24.0
  - @procedures/vitest@0.24.0
  - @procedures/mcp-dev-tools@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0
  - @procedures/peer@0.23.0
  - @procedures/mcp-dev-tools@0.23.0
  - @procedures/cli-run@0.23.0
  - @procedures/lib@0.23.0
  - @procedures/pnpm@0.23.0
  - @procedures/procedure@0.23.0
  - @procedures/shell@0.23.0
  - @procedures/vitest@0.23.0
  - @procedures/server@0.23.0

## 0.22.1

### Patch Changes

- 1681d8c: Deprecated (D13): three behaviors of a `mark` command in this process (the cold mode). The MINOR of CLI-26 changes them, when each command starts under `run()` of `@mark1russell7/service` (decision D17). This release changes no behavior.
  
  - The first Ctrl-C of a cold command gives the exit code 1. After the change, it gives 130, as the profile `ephemeral` of the runner does.
  - A second Ctrl-C of a cold command ends the process at once with the exit code 130. After the change, a second signal gives 1.
  - A cold `mark server create` keeps its peer alive after the command. After the change, the peer stops at the end of the command. For a server in the foreground, use `mark --server` or `procedure-server`.
  
  A command on the CLI server (the warm mode) and the exit codes 0 and 1 of a command that ends do not change.
- Updated dependencies [c931188]
  - @procedures/client@0.22.1
  - @procedures/cli-run@0.22.1
  - @procedures/lib@0.22.1
  - @procedures/pnpm@0.22.1
  - @procedures/procedure@0.22.1
  - @procedures/peer@0.22.1
  - @procedures/shell@0.22.1
  - @procedures/vitest@0.22.1
  - @procedures/mcp-dev-tools@0.22.1
  - @procedures/server@0.22.1

## 0.22.0

### Minor Changes

- 25822ee: The Streamable HTTP face of an MCP host keeps at most 256 sessions by default, and a task store keeps at most 1000 tasks (CLI-51). Before, the sessions had no limit by default. Thus one client could increase the memory of the host without a limit.
  
  MINOR: a breaking change before 1.0. A new default limit changes a behavior that callers rely on (decision D13).
  
  Changed:
  
  - The default of `maxSessions` is 256, not `Infinity`. This default applies to `faces.http` of `createMcpHost()`, to `mcpFace()` and to `mark mcp --http`. `MCP_HTTP_LIMITS.maxSessions` is 256.
  - A new session above the limit closes the session that was idle longest. When each session is busy, the new session gets 503 with a `Retry-After` header, as before with a limit.
  - Each live client of the MCP SDK keeps its GET stream open, so the limit does not close its session. Thus the limit is much more than the clients of one host. Each live session also holds a socket, and 256 is much less than the usual limit of 1024 open files of a process.
  - `maxSessions: Infinity` stays valid. It turns the limit off.
  
  Added:
  
  - The option `maxStored` of `McpTaskStore`, and of `tasks` of `createMcpHost()` and `mcpFace()`. It is the most tasks that the store keeps for all the sessions together. The default is 1000 (`MCP_TASK_LIMITS.maxStored`). Before, only the limit of 100 tasks for each session bounded the store.
  - A new task removes the oldest task of its own session that ended. The store can be full, and the session can have no task that ended. Then the request of the new task gets the error `-32600` with the code `TASKS_FULL`. The store keeps nothing of that task. Thus a client cannot remove the results of another session. `maxStored: Infinity` turns the limit off.
  - The flag `--max-sessions <n>` of `mark mcp`, and the variable `MCP_HTTP_MAX_SESSIONS` of `@procedures/mcp-dev-tools`. They set `maxSessions` of the HTTP face. `Infinity` turns the limit off.
  
  Migration:
  
  - A host with more than 256 clients at one time: give a larger `maxSessions`, or `maxSessions: Infinity` for no limit. Give it in `faces.http` of `createMcpHost()`, in `mcpFace()`, or with `mark mcp --http <port> --max-sessions <n>`.
  - A host that keeps more than 1000 tasks: give a larger `maxStored`, or `maxStored: Infinity`, in `tasks` of the host or in `new McpTaskStore()`.
  - The site and MiniMongo: no change. They have no MCP host.
  - Graph: no change. Its `mcpFace()` on the procedures host gets the limit of 256 sessions, and its MCP host over stdio has no HTTP face. To keep no limit, give `mcpFace({ maxSessions: Infinity })`.
  - jarvis: no change. Its MCP host has only stdio and SDK faces, and it has no tasks.
  - polite-crawler-mcp: no change for the sessions, because it sets `maxSessions: 32`. Its `McpTaskStore` gets the limit of 1000 stored tasks. Before, 32 sessions of 100 tasks bounded the store at 3200 tasks. To keep that bound, give `new McpTaskStore({ maxStored: 3200 })`.
  - polite-crawler-mcp also gives the deprecated option `mount: true`, which has no effect. Remove it when it moves to the new range.

### Patch Changes

- Updated dependencies [25822ee]
  - @procedures/mcp-dev-tools@0.22.0
  - @procedures/peer@0.22.0
  - @procedures/client@0.22.0
  - @procedures/cli-run@0.22.0
  - @procedures/lib@0.22.0
  - @procedures/pnpm@0.22.0
  - @procedures/procedure@0.22.0
  - @procedures/shell@0.22.0
  - @procedures/vitest@0.22.0
  - @procedures/server@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [4e496ba]
  - @procedures/server@0.21.0
  - @procedures/client@0.21.0
  - @procedures/cli-run@0.21.0
  - @procedures/lib@0.21.0
  - @procedures/pnpm@0.21.0
  - @procedures/procedure@0.21.0
  - @procedures/peer@0.21.0
  - @procedures/shell@0.21.0
  - @procedures/vitest@0.21.0
  - @procedures/mcp-dev-tools@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0
  - @procedures/cli-run@0.20.0
  - @procedures/lib@0.20.0
  - @procedures/pnpm@0.20.0
  - @procedures/procedure@0.20.0
  - @procedures/peer@0.20.0
  - @procedures/shell@0.20.0
  - @procedures/vitest@0.20.0
  - @procedures/mcp-dev-tools@0.20.0
  - @procedures/server@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0
  - @procedures/cli-run@0.19.0
  - @procedures/lib@0.19.0
  - @procedures/pnpm@0.19.0
  - @procedures/procedure@0.19.0
  - @procedures/peer@0.19.0
  - @procedures/shell@0.19.0
  - @procedures/vitest@0.19.0
  - @procedures/mcp-dev-tools@0.19.0
  - @procedures/server@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1
  - @procedures/cli-run@0.18.1
  - @procedures/lib@0.18.1
  - @procedures/pnpm@0.18.1
  - @procedures/procedure@0.18.1
  - @procedures/peer@0.18.1
  - @procedures/shell@0.18.1
  - @procedures/vitest@0.18.1
  - @procedures/mcp-dev-tools@0.18.1
  - @procedures/server@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0
  - @procedures/cli-run@0.18.0
  - @procedures/lib@0.18.0
  - @procedures/pnpm@0.18.0
  - @procedures/procedure@0.18.0
  - @procedures/peer@0.18.0
  - @procedures/shell@0.18.0
  - @procedures/vitest@0.18.0
  - @procedures/mcp-dev-tools@0.18.0
  - @procedures/server@0.18.0

## 0.17.4

### Patch Changes

- Updated dependencies [8281370]
  - @procedures/peer@0.17.4
  - @procedures/server@0.17.4
  - @procedures/client@0.17.4
  - @procedures/cli-run@0.17.4
  - @procedures/lib@0.17.4
  - @procedures/pnpm@0.17.4
  - @procedures/procedure@0.17.4
  - @procedures/shell@0.17.4
  - @procedures/vitest@0.17.4
  - @procedures/mcp-dev-tools@0.17.4

## 0.17.3

### Patch Changes

- 636f098: New: the procedures host answers the health probes of its service (CLI-9, decision D5). The probes come from `probeHandler()` and `probeServer()` of `@mark1russell7/service/http`. This change is additive, thus it is a PATCH of the client group (decision D13).
  
  - Each listener of `createProcedureHost()` answers `GET /_probes/startup`, `/_probes/readiness` and `/_probes/liveness` from the health of the service. The answer is 200, or 503 with `Retry-After` during the startup and the shutdown. `/_probes/readiness/<controller>` gives the readiness of one controller.
  - The probes need no token and pass no browser check. They give only the status. They mount before the faces, thus a probe path never reaches a procedure. Each other path goes to the faces with the token and the browser checks, as before.
  - A listener does not answer the report of the service (`/_probes/report`), because it names the checks and the dependencies. The procedure `host.health` gives the details with the token.
  - The probes of a listener stop when the intake stops. Thus the listener still closes at the stop of the intake, and a new connection is refused, as before. `probes: { until: "close transports" }` keeps the listener open through the drain: the probes answer 503, and each other request gets 503 with `Retry-After`.
  - The new option `probes` of `createProcedureHost()`: `{ prefix, until }` changes the prefix and the last stage, and `false` turns the probes off. `HOST_PROBE_PREFIX` is `/_probes`. `host.info.probes()` gives the base URL of the probes on each listener.
  - The new option `probes` of `runProcedureHost()`: `{ port, host, prefix, retryAfter }` declares a probe server on a port of its own (`svc.healthServer(probeServer(...))`). It starts first and closes last, thus its probes answer through the whole drain. It also answers `/report`. The listeners of the host then answer no probes, unless the host options give `probes`. `probes()` of the result gives the base URL of each place that answers the probes.
  - The new flag `--probe-port <port>` of `procedure-server`, `mark serve` and `mark --server` gives the probe server, on the address of `--host`. `mark` refuses it without `--server` before a command, as it refuses `--port`. The startup prints the URL of the probes.
  
  Deprecated: at the timeout of 15 s, `server.start` gives `success: true` with the message "still loading" while the process still starts. From the next MINOR of the client group, a start that is not ready at the timeout gives `success: false`, with the PID of the process that still starts. Read the readiness probe or `mark server status` for the state.
  
  The site, MiniMongo, Graph and jarvis: no change. A host with a listener now also answers the paths under `/_probes`. Before, these paths got 404.
- Updated dependencies [636f098]
  - @procedures/peer@0.17.3
  - @procedures/server@0.17.3
  - @procedures/lib@0.17.3
  - @procedures/mcp-dev-tools@0.17.3
  - @procedures/client@0.17.3
  - @procedures/cli-run@0.17.3
  - @procedures/pnpm@0.17.3
  - @procedures/procedure@0.17.3
  - @procedures/shell@0.17.3
  - @procedures/vitest@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2
  - @procedures/cli-run@0.17.2
  - @procedures/lib@0.17.2
  - @procedures/pnpm@0.17.2
  - @procedures/procedure@0.17.2
  - @procedures/peer@0.17.2
  - @procedures/shell@0.17.2
  - @procedures/vitest@0.17.2
  - @procedures/mcp-dev-tools@0.17.2
  - @procedures/server@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
- Updated dependencies [b805a48]
  - @procedures/client@0.17.1
  - @procedures/server@0.17.1
  - @procedures/cli-run@0.17.1
  - @procedures/lib@0.17.1
  - @procedures/pnpm@0.17.1
  - @procedures/procedure@0.17.1
  - @procedures/peer@0.17.1
  - @procedures/shell@0.17.1
  - @procedures/vitest@0.17.1
  - @procedures/mcp-dev-tools@0.17.1

## 0.17.0

### Patch Changes

- Updated dependencies [5fbc976]
  - @procedures/mcp-dev-tools@0.17.0
  - @procedures/peer@0.17.0
  - @procedures/client@0.17.0
  - @procedures/cli-run@0.17.0
  - @procedures/lib@0.17.0
  - @procedures/pnpm@0.17.0
  - @procedures/procedure@0.17.0
  - @procedures/shell@0.17.0
  - @procedures/vitest@0.17.0
  - @procedures/server@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0
  - @procedures/cli-run@0.16.0
  - @procedures/lib@0.16.0
  - @procedures/pnpm@0.16.0
  - @procedures/procedure@0.16.0
  - @procedures/peer@0.16.0
  - @procedures/shell@0.16.0
  - @procedures/vitest@0.16.0
  - @procedures/mcp-dev-tools@0.16.0
  - @procedures/server@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1
  - @procedures/peer@0.15.1
  - @procedures/cli-run@0.15.1
  - @procedures/lib@0.15.1
  - @procedures/pnpm@0.15.1
  - @procedures/procedure@0.15.1
  - @procedures/shell@0.15.1
  - @procedures/vitest@0.15.1
  - @procedures/mcp-dev-tools@0.15.1
  - @procedures/server@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0
  - @procedures/cli-run@0.15.0
  - @procedures/lib@0.15.0
  - @procedures/pnpm@0.15.0
  - @procedures/procedure@0.15.0
  - @procedures/peer@0.15.0
  - @procedures/shell@0.15.0
  - @procedures/vitest@0.15.0
  - @procedures/mcp-dev-tools@0.15.0
  - @procedures/server@0.15.0

## 0.14.1

### Patch Changes

- a96c870: The MCP hosts run under `run()` of `@mark1russell7/service` (CLI-11, step 1).
  
  - `McpHost.declare(svc)` gives an MCP host to a service. The server of the host is a transport part, and each storage is a dependency. A host with a stdio face declares the trigger `stdin-close`. Then the runner starts the host and stops it in stages.
  - `McpHost.handleHttp(req, res)` answers for the Streamable HTTP face with `mount: true`. Mount it on a listener, for example an `httpTransport` of `@mark1russell7/service/http`.
  - `runDevToolsServer()` of `@procedures/mcp-dev-tools` runs the dev-tools server under `run()`. Over stdio, the profile is `ephemeral`, and the end of the input stops the server. With HTTP, the profile is `localDev`, and a listener of the service answers at `/mcp`. `dist/server.js` and `mark mcp` use it.
  
  PATCH: each change adds a function or an option, and the old ones still operate.
  
  Deprecated, and the next MINOR removes them (decision D13):
  
  - The listener of the Streamable HTTP face: the options `port`, `host` and `server` of `HttpTransportOptions`, and `McpHttpTransport.listen()`. Give `mount: true`, and mount `McpHost.handleHttp` on a listener of the service.
  - `startDevToolsServer()` of `@procedures/mcp-dev-tools`. Use `runDevToolsServer()`.
  
  Migration for the next MINOR: the site uses none of them. MiniMongo uses none of them. Graph mounts `mcpFace()` on its host, and its stdio host keeps `createMcpHost()` with `stdio`: no change. jarvis uses `createMcpHost()` with stdio and SDK faces: no change. A host with `faces.http: { port }` moves to `faces.http: { mount: true }` and a listener of the service.
- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [66ab24c]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
- Updated dependencies [a96c870]
- Updated dependencies [50d5453]
  - @procedures/client@0.14.1
  - @procedures/peer@0.14.1
  - @procedures/mcp-dev-tools@0.14.1
  - @procedures/shell@0.14.1
  - @procedures/cli-run@0.14.1
  - @procedures/lib@0.14.1
  - @procedures/pnpm@0.14.1
  - @procedures/procedure@0.14.1
  - @procedures/vitest@0.14.1
  - @procedures/server@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0
  - @procedures/peer@0.14.0
  - @procedures/cli-run@0.14.0
  - @procedures/lib@0.14.0
  - @procedures/pnpm@0.14.0
  - @procedures/procedure@0.14.0
  - @procedures/shell@0.14.0
  - @procedures/vitest@0.14.0
  - @procedures/mcp-dev-tools@0.14.0
  - @procedures/server@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2
  - @procedures/cli-run@0.13.2
  - @procedures/lib@0.13.2
  - @procedures/pnpm@0.13.2
  - @procedures/procedure@0.13.2
  - @procedures/peer@0.13.2
  - @procedures/shell@0.13.2
  - @procedures/vitest@0.13.2
  - @procedures/mcp-dev-tools@0.13.2
  - @procedures/server@0.13.2

## 0.13.1

### Patch Changes

- Updated dependencies [992b801]
  - @procedures/lib@0.13.1
  - @procedures/mcp-dev-tools@0.13.1
  - @procedures/client@0.13.1
  - @procedures/cli-run@0.13.1
  - @procedures/pnpm@0.13.1
  - @procedures/procedure@0.13.1
  - @procedures/peer@0.13.1
  - @procedures/shell@0.13.1
  - @procedures/vitest@0.13.1
  - @procedures/server@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0
  - @procedures/peer@0.13.0
  - @procedures/cli-run@0.13.0
  - @procedures/lib@0.13.0
  - @procedures/pnpm@0.13.0
  - @procedures/procedure@0.13.0
  - @procedures/shell@0.13.0
  - @procedures/vitest@0.13.0
  - @procedures/mcp-dev-tools@0.13.0
  - @procedures/server@0.13.0

## 0.12.2

### Patch Changes

- @procedures/mcp-dev-tools@0.12.2
  - @procedures/client@0.12.2
  - @procedures/cli-run@0.12.2
  - @procedures/lib@0.12.2
  - @procedures/pnpm@0.12.2
  - @procedures/procedure@0.12.2
  - @procedures/peer@0.12.2
  - @procedures/shell@0.12.2
  - @procedures/vitest@0.12.2
  - @procedures/server@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [9fccd90]
- Updated dependencies [b89e3fe]
  - @procedures/peer@0.12.1
  - @procedures/client@0.12.1
  - @procedures/server@0.12.1
  - @procedures/cli-run@0.12.1
  - @procedures/lib@0.12.1
  - @procedures/pnpm@0.12.1
  - @procedures/procedure@0.12.1
  - @procedures/shell@0.12.1
  - @procedures/vitest@0.12.1
  - @procedures/mcp-dev-tools@0.12.1

## 0.12.0

### Minor Changes

- 9ea2030: `runProcedureHost()` of `@procedures/server` is the one runner entry on `run()` of `@mark1russell7/service`, for `procedure-server`, `mark serve` and `mark --server` (server stack CLI-8, decisions D6, D7 and D17). This change is a break of the server stack, thus it is its own MINOR (decision D13).
  
  - New `runProcedureHost({ name, host, mode, profile, lockfile, log, run })`. It declares the parts of `createProcedureHost()` in one service, and starts `run()`. It gives `{ host, service, life }` when the startup ends.
  - The mode `foreground` has the profile `localDev`: a second Ctrl-C exits at once. The mode `background` has the profile `daemon`: a repeat signal has no effect. Each run declares `onRepeatSignal`. `HOST_PROFILES` gives the profiles as data.
  - The caps of the stages sum to 10 s. They replace the hard-exit timer of 10 s of the entries.
  - The lockfile is a dependency of the service: its connect writes it before the listeners start, and its close removes it after the listeners close. New `lockfileHandle(data)` of `@procedures/peer/lockfile`.
  - `runServer()` (the bin `procedure-server` and `mark serve`) and `startServerMode()` (`mark --server`) install no signal handler and no hard-exit timer. Their promise ends with the lifecycle.
  - `mark --server` is the background host (decision D17). `procedure-server` and `mark serve` run in the foreground.
  - The entries map their transports to a host with `peerHostOptions()` of `@procedures/peer` (CLI-7).
  - `ServerRunOptions.run` and the second argument of `startServerMode()` take the options of `run()`, for a test: a process port and a clock.
  - A random token of `procedure-server` has 32 bytes, as the token of `mark --server`.
  - The one-shot commands of `mark` keep their interrupt. CLI-26 moves them under `run()`.
  
  The behavior that changes:
  
  - A second Ctrl-C of `mark --server` has no effect: the host ends its drain, in 10 s at most. A second Ctrl-C of `procedure-server` and `mark serve` exits at once with the code 1, as before.
  - The process exits with the code of the lifecycle: 0 after a clean shutdown, and 1 after an error or a startup that failed.
  - A random token of `procedure-server` has 64 hexadecimal characters, not 48.
  
  Migration steps:
  
  - The site, MiniMongo, Graph and jarvis: no change is necessary. They do not start these entries.
  - A script that starts `procedure-server` or `mark serve` and stops it with a signal: no change is necessary. Wait for the exit, in 10 s at most.
  - A program that embeds the server outside a service: use `startServer()`, which starts it as a peer, and `peer.stop()`.

### Patch Changes

- Updated dependencies [9ea2030]
  - @procedures/server@0.12.0
  - @procedures/peer@0.12.0
  - @procedures/client@0.12.0
  - @procedures/cli-run@0.12.0
  - @procedures/lib@0.12.0
  - @procedures/pnpm@0.12.0
  - @procedures/procedure@0.12.0
  - @procedures/shell@0.12.0
  - @procedures/vitest@0.12.0
  - @procedures/mcp-dev-tools@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/peer@0.11.0
  - @procedures/client@0.11.0
  - @procedures/server@0.11.0
  - @procedures/mcp-dev-tools@0.11.0
  - @procedures/cli-run@0.11.0
  - @procedures/lib@0.11.0
  - @procedures/pnpm@0.11.0
  - @procedures/procedure@0.11.0
  - @procedures/shell@0.11.0
  - @procedures/vitest@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0
  - @procedures/cli-run@0.10.0
  - @procedures/lib@0.10.0
  - @procedures/pnpm@0.10.0
  - @procedures/procedure@0.10.0
  - @procedures/peer@0.10.0
  - @procedures/shell@0.10.0
  - @procedures/vitest@0.10.0
  - @procedures/mcp-dev-tools@0.10.0
  - @procedures/server@0.10.0

## 0.9.2

### Patch Changes

- @procedures/mcp-dev-tools@0.9.2
  - @procedures/client@0.9.2
  - @procedures/cli-run@0.9.2
  - @procedures/lib@0.9.2
  - @procedures/pnpm@0.9.2
  - @procedures/procedure@0.9.2
  - @procedures/peer@0.9.2
  - @procedures/shell@0.9.2
  - @procedures/vitest@0.9.2
  - @procedures/server@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1
  - @procedures/peer@0.9.1
  - @procedures/server@0.9.1
  - @procedures/cli-run@0.9.1
  - @procedures/lib@0.9.1
  - @procedures/pnpm@0.9.1
  - @procedures/procedure@0.9.1
  - @procedures/shell@0.9.1
  - @procedures/vitest@0.9.1
  - @procedures/mcp-dev-tools@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0
  - @procedures/cli-run@0.9.0
  - @procedures/lib@0.9.0
  - @procedures/pnpm@0.9.0
  - @procedures/procedure@0.9.0
  - @procedures/peer@0.9.0
  - @procedures/shell@0.9.0
  - @procedures/vitest@0.9.0
  - @procedures/mcp-dev-tools@0.9.0
  - @procedures/server@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1
  - @procedures/mcp-dev-tools@0.8.1
  - @procedures/cli-run@0.8.1
  - @procedures/lib@0.8.1
  - @procedures/pnpm@0.8.1
  - @procedures/procedure@0.8.1
  - @procedures/peer@0.8.1
  - @procedures/shell@0.8.1
  - @procedures/vitest@0.8.1
  - @procedures/server@0.8.1

## 0.8.0

### Minor Changes

- 3f376af: The root of the files confines each procedure, not only `fs.*` (roadmap R33). `mark --fs-root`, `procedure-server --fs-root` and `MCP_FS_ROOT` start `confineToRoot()` of `@procedures/fs`. Each procedure keeps its paths in the root, or the host refuses it with `FORBIDDEN` and the reason `outside-root`.
  
  This change is breaking under a root. The hosts refuse procedures that they ran before: `git.*`, `pnpm.*`, `docker.run`, `docker.build`, `docker.compose.*`, a call of `shell.run`, and each procedure that reaches files without `metadata.fsRoot`. `lib.scan` of a workspace outside the root gives `FORBIDDEN`, not a warning. Without a root, nothing changes. The list of the MCP tools does not change.

### Patch Changes

- 808a508: Each argument of a last array positional is one item, also when there is only one. Before, one argument was read as the whole array: `[]` gave no item, and `["a","b"]` gave two. The README rule says "A last array field takes the rest". A property test of the command line found it.
- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [3f376af]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0
  - @procedures/peer@0.8.0
  - @procedures/server@0.8.0
  - @procedures/mcp-dev-tools@0.8.0
  - @procedures/shell@0.8.0
  - @procedures/pnpm@0.8.0
  - @procedures/lib@0.8.0
  - @procedures/procedure@0.8.0
  - @procedures/cli-run@0.8.0
  - @procedures/vitest@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0
  - @procedures/peer@0.7.0
  - @procedures/cli-run@0.7.0
  - @procedures/lib@0.7.0
  - @procedures/pnpm@0.7.0
  - @procedures/procedure@0.7.0
  - @procedures/shell@0.7.0
  - @procedures/vitest@0.7.0
  - @procedures/mcp-dev-tools@0.7.0
  - @procedures/server@0.7.0

## 0.6.0

### Patch Changes

- @procedures/mcp-dev-tools@0.6.0
  - @procedures/client@0.6.0
  - @procedures/cli-run@0.6.0
  - @procedures/lib@0.6.0
  - @procedures/pnpm@0.6.0
  - @procedures/procedure@0.6.0
  - @procedures/peer@0.6.0
  - @procedures/shell@0.6.0
  - @procedures/vitest@0.6.0
  - @procedures/server@0.6.0

## 0.5.0

### Minor Changes

- a47bee6: The hosts can confine the file procedures to a root (roadmap R33).
  
  - `confineFsProcedures(registry, root)` of `@procedures/fs` replaces the handler of each `fs.*` procedure of a registry with the handler of `createFsModule({ root })`. It adds no procedure. A nested `fs.*` call of another procedure is confined too. The root must be a folder that exists.
  - `mark --fs-root <folder>` confines the `fs.*` procedures of each mode and host of `mark`: a command, the REPL, `--server`, `serve` and `mcp`. Give the flag before the command.
  - A `mark` command uses a CLI server only when the server has the same root. The lockfile of `@procedures/peer` has the new field `fsRoot`, and `findServer()` compares it.
  - `procedure-server --fs-root <folder>` and `mark serve --fs-root <folder>` confine the procedures of the server.
  - The MCP server reads `MCP_FS_ROOT`, and `mark mcp` has the flag `--fs-root`. `fs` is not a tool namespace, so the tools do not change.
  - A path outside the root gives `FORBIDDEN` with the reason `outside-root`. A procedure that reads files with `node:fs`, or that starts a program, is not confined.
  - `@procedures/lib/cli-flags` has the global flags `--fs-root` and `--events`, and the field `repeatable`.
- a47bee6: The hosts serve the remote events (`documentation/EVENTS.md`).
  
  - `hostPolicy()` takes the option `events`: the topic rule, with an optional bus, `allow` function and buffer. `procedureServerOptions()` gives it to the `ProcedureServer`, which pins `events.subscribe`. `HostPolicy` has the new field `events`.
  - `procedure-server` and `mark serve` have the option `--events <patterns>`. The option is repeatable, and it takes comma-separated patterns: exact names, prefixes (`orders.*`) or `*`. `parseTopicPatterns()` checks them.
  - `mark --server` has the same option `--events`.
  - These hosts always serve `events.subscribe`. Without `--events`, they serve no topic, and each subscription gets `TOPIC_NOT_FOUND`. The bus is the global bus, which is also the `ctx.bus` of their procedures.
  - The MCP server serves no events, because its transport carries only MCP.
  - `mark --port`, `--host`, `--transport` and `--events` without `--server` are an error now, also before `serve` and `mcp`. Before, `mark --port 4000 serve` ignored `--port`.

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [a47bee6]
- Updated dependencies [64120d9]
- Updated dependencies [64120d9]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0
  - @procedures/server@0.5.0
  - @procedures/mcp-dev-tools@0.5.0
  - @procedures/peer@0.5.0
  - @procedures/lib@0.5.0
  - @procedures/procedure@0.5.0
  - @procedures/cli-run@0.5.0
  - @procedures/pnpm@0.5.0
  - @procedures/shell@0.5.0
  - @procedures/vitest@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [2fd2398]
- Updated dependencies [3fefa43]
- Updated dependencies [cc3f5f6]
- Updated dependencies [bae25e2]
- Updated dependencies [4c51727]
- Updated dependencies [d42d716]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/lib@0.4.0
  - @procedures/mcp-dev-tools@0.4.0
  - @procedures/procedure@0.4.0
  - @procedures/shell@0.4.0
  - @procedures/server@0.4.0
  - @procedures/peer@0.4.0
  - @procedures/cli-run@0.4.0
  - @procedures/pnpm@0.4.0
  - @procedures/vitest@0.4.0

## 0.3.0

### Minor Changes

- 3d24d5b: MCP over Streamable HTTP (roadmap R26), the HTTP transport of the current MCP specification. `McpServerTransport` takes `transport: "http"` and `httpOptions` (port, host, path, token, allowed origins, or an HTTP server of its own). Each client gets a session with an MCP server of its own, and so gets the progress of a tool call and the `list_changed` notifications. The endpoint listens on loopback by default, refuses a web page of another host or origin, and with a token refuses a request without the token. `mark mcp --http <port> [--host <host>] [--token <token>]` (or `MCP_HTTP_PORT`, `MCP_HTTP_HOST`, `MCP_HTTP_TOKEN`) serves the dev tools over it. Before, the package had only stdio, and its SSE transport only threw.

### Patch Changes

- 381ce3a: Cancellation scopes and a graceful stop (roadmap R14). `ProcedureServer.stop({ grace })` refuses new calls with a retryable `UNAVAILABLE` and lets the calls in flight end until the grace time ends, then aborts them (`peer.stop({ grace })` passes it; `mark --server` and the `server` bin give 5 seconds). The signal of each call joins its request and the server, and `callsInFlight` counts the calls, streams included. `exec()` and `execStream()` take a `signal`. `LocalTransport` takes `interceptors`, `capability` and `clearanceOrder`, and gives a call the deadline that its client sends, so a client timeout ends a local handler too. `mark` aborts a command in its own process on the first Ctrl+C. A remote leaf of `route()` and `server.call` send the deadline of their caller, and `server.call` relays the signal.
- 956e88b: One manifest type (roadmap R17). `describeRegistry(registry, { expose })` and `describeProcedure` (exported as `describeProcedureEntry`) describe each procedure: the path, the description, the tags, the effects, the JSON Schemas of the input and the output, the calls, an unbounded stream, the command-line metadata, and a hash of the manifest (`procedures.manifest/1`). The new procedure `procedure.manifest` gives it, and it is an MCP tool of the dev tools (63 tools). `procedure.get` gives the JSON Schemas and the effects. The context of a handler has the expose rule of its host (`ctx.expose`), and `procedure.get`, `procedure.list`, `procedure.manifest`, `procedure.export`, `client.lookup`, `mcp.list-tools`, `manifest.generate` and `_discovery.announce` show only the exposed procedures: before, an MCP tool could list the procedures that the host hides. `_discovery.announce` gives the JSON Schemas, and `manifest.generate`, `getProcedureInfos` and the manifest of `mark` use the one description.
- aaa7462: The peer accepts a bare JSON value and obeys `bodyLimit` (roadmap R5). Before, its strict JSON parser refused a number, a string or `null` with 400, and its limit of 100 kB replaced `bodyLimit`. The HTTP transport config of the peer takes `bodyLimit`. `peer.stop()` closes the HTTP server that the peer made for its WebSocket transport, so the port is free again. `mark --server` and the `server` bin stop the peer before they exit, with a limit of 10 seconds, and a second signal exits at once.
- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [29a7b29]
- Updated dependencies [a70d445]
- Updated dependencies [c66f0c4]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [1779d96]
- Updated dependencies [4d3ff39]
- Updated dependencies [3d24d5b]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [aaa7462]
- Updated dependencies [6e4de6c]
- Updated dependencies [14d85fe]
- Updated dependencies [d81d0ed]
- Updated dependencies [f5ed492]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [5b7b673]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
  - @procedures/peer@0.3.0
  - @procedures/server@0.3.0
  - @procedures/mcp-dev-tools@0.3.0
  - @procedures/lib@0.3.0
  - @procedures/procedure@0.3.0
  - @procedures/pnpm@0.3.0
  - @procedures/shell@0.3.0
  - @procedures/cli-run@0.3.0
  - @procedures/vitest@0.3.0

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
