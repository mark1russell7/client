---
"@procedures/server": minor
---

Breaking: `server.start` waits for the readiness of the server, and a start that is not ready at the timeout gives `success: false` (CLI-9). Before, the procedure read the lockfile and `host.info` each 500 ms for 15 s, and at the timeout it gave `success: true` with the message "still loading" while the process still started. CLI-9 step 1, a PATCH before this release, marked that result as deprecated.

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
