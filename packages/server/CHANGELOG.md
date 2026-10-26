# @procedures/server

## 0.37.0

### Patch Changes

- @procedures/client@0.37.0
  - @procedures/peer@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [f1fae86]
  - @procedures/client@0.36.0
  - @procedures/peer@0.36.0

## 0.35.1

### Patch Changes

- cc80f74: PATCH: internal, no change to the public API. The procedure boilerplate of tracker item O65, after O58.
  
  - The `src/module.ts` of 37 packages gives its module and its register function with `definePackage()`. Each export keeps its name, its type and its behavior. The root and `./module` register nothing. `./register` registers in the global registry, as before.
  - The output schemas of `ics.parse`, `ics.fetch`, `json.query`, `json.patch`, `json.merge` and `yaml.parse` have the type of the declared output (`z.ZodType<T>`). The validation and the JSON Schema stay the same.
  - The `described()` helper of `@procedures/mongo` uses `typed<T>()` instead of the deprecated `zodAdapter()`. Its schemas validate and describe the input as before.
- Updated dependencies [9f0405d]
- Updated dependencies [f5c2407]
- Updated dependencies [cc80f74]
  - @procedures/client@0.35.1
  - @procedures/peer@0.35.1

## 0.35.0

### Patch Changes

- @procedures/client@0.35.0
  - @procedures/peer@0.35.0

## 0.34.0

### Patch Changes

- fa1a61a: Less boilerplate in each procedure definition (dedupe review F1, tracker item O58).
  
  PATCH (pre-1.0): this change adds exports and deprecates names. It removes no export and changes no behavior.
  
  - `@procedures/client` has the new export `typed<T>()`. It is the one pass-through schema that gives only the type `T`.
  - `@procedures/client` has the new export `definePackage(name, procedures, requires?)`. It gives `{ module, register }` and registers nothing at the call. The new type `PackageDefinition` is its result.
  - `zodAdapter` is deprecated. `input()` and `output()` take each Standard Schema and infer its type, so a zod schema goes in directly.
  - `typedAnySchema` and `outputSchema` are deprecated. Use `typed<T>()`. They give the same pass-through schema.
  - The procedures of the packages give their zod schemas to `input()` and `output()` directly. The `.build() as AnyProcedure` casts are gone. The schemas, the types of the exports and the validation do not change.
  - `mark procedure new` writes `.input(<Name>InputSchema)` and `.output(<Name>OutputSchema)`, without `zodAdapter`.
  
  Migration:
  
  - The site, MiniMongo, Graph and jarvis: no change at this time. The deprecated names work until the next MINOR.
  - Before the next MINOR, replace `zodAdapter<T>(schema)` with `schema`. To keep the check of a schema against a type, write `const schema: z.ZodType<T> = ...`.
  - Before the next MINOR, replace `typedAnySchema<T>()` and `outputSchema<T>()` with `typed<T>()`.
  - A parse-only object (`{ parse }`) in `zodAdapter` becomes a Standard Schema with a `~standard` property.
- Updated dependencies [d4376c2]
- Updated dependencies [fa1a61a]
  - @procedures/client@0.34.0
  - @procedures/peer@0.34.0

## 0.33.0

### Patch Changes

- @procedures/client@0.33.0
  - @procedures/peer@0.33.0

## 0.32.0

### Patch Changes

- @procedures/client@0.32.0
  - @procedures/peer@0.32.0

## 0.31.0

### Patch Changes

- @procedures/client@0.31.0
  - @procedures/peer@0.31.0

## 0.30.0

### Patch Changes

- @procedures/client@0.30.0
  - @procedures/peer@0.30.0

## 0.29.0

### Patch Changes

- @procedures/client@0.29.0
  - @procedures/peer@0.29.0

## 0.28.1

### Patch Changes

- Updated dependencies [345c740]
- Updated dependencies [345c740]
- Updated dependencies [2572f41]
- Updated dependencies [984c13b]
- Updated dependencies [21dc858]
  - @procedures/client@0.28.1
  - @procedures/peer@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [06694d7]
  - @procedures/client@0.28.0
  - @procedures/peer@0.28.0

## 0.27.8

### Patch Changes

- Updated dependencies [1834a5e]
  - @procedures/peer@0.27.8
  - @procedures/client@0.27.8

## 0.27.7

### Patch Changes

- @procedures/peer@0.27.7
  - @procedures/client@0.27.7

## 0.27.6

### Patch Changes

- Updated dependencies [d322bef]
  - @procedures/client@0.27.6
  - @procedures/peer@0.27.6

## 0.27.5

### Patch Changes

- @procedures/peer@0.27.5
  - @procedures/client@0.27.5

## 0.27.4

### Patch Changes

- Updated dependencies [8970a1e]
  - @procedures/client@0.27.4
  - @procedures/peer@0.27.4

## 0.27.3

### Patch Changes

- @procedures/peer@0.27.3
  - @procedures/client@0.27.3

## 0.27.2

### Patch Changes

- 7bc4c6d: Fixes from the audit s21.
  
  PATCH: bug fixes. A caller that used the documented behavior sees no change.
  
  - A stream that its reader closes before the first item now ends. An async generator ignores a `return()` before its first `next()`, so no wrapper of the stream ran its end. Thus an HTTP request without `Accept: application/x-ndjson` for a stream without an end (`NOT_ACCEPTABLE`) stayed in flight, so `drain()` and `stop()` waited for their deadline. It also kept its storages in use, so `useStorage(..., { close })` waited for its grace. The subscription of `events.subscribe` kept its listeners on the bus. Now each wrapper on the path of the server (`ProcedureServer`, the invocation, the timeout and the tracing interceptors) gives the `return()` to its source and runs its end. The tests in `unbounded.test.ts`, `use-storage.test.ts` and `interceptors.test.ts` pin this.
  - The idempotency cache of `ProcedureServer` now keeps the results of each principal apart. Before, its key was the procedure and the idempotency key alone. Thus a caller with the idempotency key of another principal got the result of that call, and its own write did not run. A second try of one principal still gets its first result. The test in `idempotency.client.test.ts` pins this.
  - `server.start` of `@procedures/server` now starts only the `mark` CLI: `dist/bin.js` or `dist/cli.js` of `mark`. Before, it took each running script whose name ends in `cli.js`, so a start in `procedure-server` started `procedure-server`. The test in `procedures.test.ts` pins this.
- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2
  - @procedures/peer@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1
  - @procedures/peer@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0
  - @procedures/peer@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2
  - @procedures/peer@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1
  - @procedures/peer@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0
  - @procedures/peer@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0
  - @procedures/peer@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1
  - @procedures/peer@0.24.1

## 0.24.0

### Patch Changes

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
- Updated dependencies [4261f65]
  - @procedures/peer@0.24.0
  - @procedures/client@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0
  - @procedures/peer@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1
  - @procedures/peer@0.22.1

## 0.22.0

### Patch Changes

- @procedures/peer@0.22.0
  - @procedures/client@0.22.0

## 0.21.0

### Minor Changes

- 4e496ba: Breaking: `server.start` waits for the readiness of the server, and a start that is not ready at the timeout gives `success: false` (CLI-9). Before, the procedure read the lockfile and `host.info` each 500 ms for 15 s, and at the timeout it gave `success: true` with the message "still loading" while the process still started. CLI-9 step 1, a PATCH before this release, marked that result as deprecated.
  
  The new behavior:
  
  - `server.start` reads the readiness probe of the new listener (`/_probes/readiness`, from CLI-9 step 1) until it answers 200.
  - The probe has no identity: another server on the port can answer it. Thus the procedure also needs the new lockfile of the port, and `host.info` must answer its token with its peer id.
  - A listener without probes (a build of `mark` before CLI-9, for example an older `mark` in `PATH`) answers 404. Then `host.info` alone tells the readiness, because the service refuses each call until its startup ends.
  - The wait stops as soon as the server is ready, or as soon as its process exits. Before, it read each 500 ms and found an exit only at the next read.
  - An exit before the readiness gives `success: false`, the PID, the log file and the exit code or the signal of the process. A spawn that fails (no `mark` in `PATH`) gives the same result. Before, its error event was not handled.
  - At the timeout, the result is `success: false`, with the PID of the process that still starts, the port and the log file. The procedure does not stop that process.
  - The new optional input `timeout` sets the limit in milliseconds (1 to 600000). The default stays 15000.
  
  Migration:
  
  - A script that runs `mark server start` and reads `success` now gets `false` when the server is not ready at the timeout. Give a longer `timeout` (`mark server start --timeout 60000`), or read `mark server status` later. The `pid` of the result is the process that still starts.
  - The site: no change. It does not start `server.start`.
  - MiniMongo: no change. Its dev host starts through `runProcedureHost()`, not through `server.start`.
  - Graph: no change. Its hosts do not start `server.start`.
  - jarvis: no change. It does not start `server.start`.

### Patch Changes

- @procedures/client@0.21.0
  - @procedures/peer@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0
  - @procedures/peer@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0
  - @procedures/peer@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1
  - @procedures/peer@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0
  - @procedures/peer@0.18.0

## 0.17.4

### Patch Changes

- 8281370: The probes use the option `kinds` of `@mark1russell7/service` 0.5.8 (SYS-30).
  
  - Each listener of `createProcedureHost()` asks `probeHandler()` for the kinds `startup`, `readiness` and `liveness`. The host has no filter of its own for `/_probes/report`. The answers do not change: the report path goes on to the next handler, as before.
  - The probe port of `runProcedureHost()` takes the new option `probes.kinds`. The default is all four kinds, as in 0.17.3. Leave out `report` on a port that is not private.
  - The packages of the group use `@mark1russell7/service` `^0.5.8`, so a host has one copy of the service.
- Updated dependencies [8281370]
  - @procedures/peer@0.17.4
  - @procedures/client@0.17.4

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
  - @procedures/client@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2
  - @procedures/peer@0.17.2

## 0.17.1

### Patch Changes

- b805a48: New: the option `declare` of `runProcedureHost()` adds the parts and the dependencies of an app to the service of the process (CLI-62). Before, an app had no hook to declare its own parts. MiniMongo gave its Vite dev server to the host as a face with stop parts only, and its Mongo connection had no part.
  
  - `declare(svc, host)` gets the builder of the service and the host before `run()`. The app uses the methods of the builder: `svc.server()`, `svc.dependency()` with its handle, `svc.check()` and `svc.onPhase()`.
  - `describe()` shows each part of the app. The runner starts each part with the host, and stops it in its stage of the shutdown.
  - The parts of the app come after the parts of the host. Thus the server of the host starts before a transport of the app, and a listener of the app can mount `host.handler`.
  - The lockfile comes after the dependencies of the app. It connects last, and it closes first.
  - A dependency of the app can gate the calls with the option `controller.requires` of the host.
  
  PATCH: a new optional option. Without it, the service has only the parts of the host, as before.
- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1
  - @procedures/peer@0.17.1

## 0.17.0

### Patch Changes

- @procedures/peer@0.17.0
  - @procedures/client@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0
  - @procedures/peer@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1
  - @procedures/peer@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0
  - @procedures/peer@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [66ab24c]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
  - @procedures/client@0.14.1
  - @procedures/peer@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0
  - @procedures/peer@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2
  - @procedures/peer@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1
  - @procedures/peer@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0
  - @procedures/peer@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2
  - @procedures/peer@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [9fccd90]
- Updated dependencies [b89e3fe]
  - @procedures/peer@0.12.1
  - @procedures/client@0.12.1

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
  - @procedures/peer@0.12.0
  - @procedures/client@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/peer@0.11.0
  - @procedures/client@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0
  - @procedures/peer@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2
  - @procedures/peer@0.9.2

## 0.9.1

### Patch Changes

- b5db4d8: The other procedures that reach files declare their rules under a root of the files in `metadata.fsRoot` (roadmap R33, tracker item O36). Without a root, nothing changes. PATCH: each procedure was refused under a root before, and now it is confined, or it is refused with a reason.
  
  - Confined: `s3.download` (`destPath`), `s3.presign` (no path input), `exif.read` (`path`), `privacyScan.files` (`paths`, `termsFile`, `allowFile`), `claude.read` and `claude.follow` (`outputFile`), and `manifest.generate` (`outputDir`).
  - Confined with no path input, because the store of the host holds the data: `schedule.add`, `schedule.list`, `schedule.remove`, `procedure.store`, `procedure.load` and `procedure.sync`.
  - Confined: each `gh.*` procedure starts gh in a working folder of the root, and the `dir` of `gh.run.download` is in the root. Its nested `shell.run` now runs under a root. `GIT_DIR` is the null device, so the git of gh finds no repository: give `repo`.
  - Refused, with the reason in the rules: `snapshot.create`, `snapshot.restore`, `snapshot.diff`, `iosBackup.*`, `claude.start`, `server.start`, `server.stop` and `server.status`.
- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1
  - @procedures/peer@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0
  - @procedures/peer@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1
  - @procedures/peer@0.8.1

## 0.8.0

### Minor Changes

- 3f376af: The root of the files confines each procedure, not only `fs.*` (roadmap R33). `mark --fs-root`, `procedure-server --fs-root` and `MCP_FS_ROOT` start `confineToRoot()` of `@procedures/fs`. Each procedure keeps its paths in the root, or the host refuses it with `FORBIDDEN` and the reason `outside-root`.
  
  This change is breaking under a root. The hosts refuse procedures that they ran before: `git.*`, `pnpm.*`, `docker.run`, `docker.build`, `docker.compose.*`, a call of `shell.run`, and each procedure that reaches files without `metadata.fsRoot`. `lib.scan` of a workspace outside the root gives `FORBIDDEN`, not a warning. Without a root, nothing changes. The list of the MCP tools does not change.

### Patch Changes

- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0
  - @procedures/peer@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0
  - @procedures/peer@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0
  - @procedures/peer@0.6.0

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
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0
  - @procedures/peer@0.5.0

## 0.4.0

### Minor Changes

- d42d716: `server.start`, `server.stop` and `server.status` moved from `@procedures/peer` to `@procedures/server`, the package of the host. Their names, schemas and effects stay the same. They manage the background server of the `mark` CLI.
  
  In this version, `@procedures/server` has a `./module` entry, a `./register` entry and the `client.procedures` field, so `mark server start`, `mark server stop` and `mark server status` keep working. The registry of `procedure-server` and `mark serve` has the module of the peer package and the module of the server package, as before.
  
  The module of `@procedures/peer` does not register the three procedures any more, and `@procedures/peer/procedures` does not export them. The lockfiles stay in `@procedures/peer/lockfile`.
  
  `connect()` of `@procedures/peer` takes `WebSocketTransport` from `@procedures/client/node`, not from the root of `@procedures/client`. Thus a peer connection in Node uses the `WebSocket` class of `ws`, and a drop ends the socket at once with `terminate()`.

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
- Updated dependencies [d42d716]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/peer@0.4.0

## 0.3.0

### Patch Changes

- 381ce3a: Cancellation scopes and a graceful stop (roadmap R14). `ProcedureServer.stop({ grace })` refuses new calls with a retryable `UNAVAILABLE` and lets the calls in flight end until the grace time ends, then aborts them (`peer.stop({ grace })` passes it; `mark --server` and the `server` bin give 5 seconds). The signal of each call joins its request and the server, and `callsInFlight` counts the calls, streams included. `exec()` and `execStream()` take a `signal`. `LocalTransport` takes `interceptors`, `capability` and `clearanceOrder`, and gives a call the deadline that its client sends, so a client timeout ends a local handler too. `mark` aborts a command in its own process on the first Ctrl+C. A remote leaf of `route()` and `server.call` send the deadline of their caller, and `server.call` relays the signal.
- aaa7462: The peer accepts a bare JSON value and obeys `bodyLimit` (roadmap R5). Before, its strict JSON parser refused a number, a string or `null` with 400, and its limit of 100 kB replaced `bodyLimit`. The HTTP transport config of the peer takes `bodyLimit`. `peer.stop()` closes the HTTP server that the peer made for its WebSocket transport, so the port is free again. `mark --server` and the `server` bin stop the peer before they exit, with a limit of 10 seconds, and a second signal exits at once.
- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [aaa7462]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
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

## 0.2.3

### Patch Changes

- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3
  - @procedures/peer@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2
  - @procedures/peer@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1
  - @procedures/peer@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [0cf4bea]
- Updated dependencies [44d3e30]
- Updated dependencies [76d0d64]
  - @procedures/client@0.2.0
  - @procedures/peer@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
