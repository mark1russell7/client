---
"@procedures/peer": patch
"@procedures/server": patch
"@procedures/lib": patch
"@procedures/mark": patch
---

New: the procedures host answers the health probes of its service (CLI-9, decision D5). The probes come from `probeHandler()` and `probeServer()` of `@mark1russell7/service/http`. This change is additive, thus it is a PATCH of the client group (decision D13).

- Each listener of `createProcedureHost()` answers `GET /_probes/startup`, `/_probes/readiness` and `/_probes/liveness` from the health of the service. The answer is 200, or 503 with `Retry-After` during the startup and the shutdown. `/_probes/readiness/<controller>` gives the readiness of one controller.
- The probes need no token and pass no browser check. They give only the status. They mount before the faces, thus a probe path never reaches a procedure. Each other path goes to the faces with the token and the browser checks, as before.
- A listener does not answer the report of the service (`/_probes/report`), because it names the checks and the dependencies. The procedure `host.health` gives the details with the token.
- The probes of a listener stop when the intake stops. Thus the listener still closes at the stop of the intake, and a new connection is refused, as before. `probes: { until: "close transports" }` keeps the listener open through the drain: the probes answer 503, and each other request gets 503 with `Retry-After`.
- The new option `probes` of `createProcedureHost()`: `{ prefix, until }` changes the prefix and the last stage, and `false` turns the probes off. `HOST_PROBE_PREFIX` is `/_probes`. `host.info.probes()` gives the base URL of the probes on each listener.
- The new option `probes` of `runProcedureHost()`: `{ port, host, prefix, retryAfter }` declares a probe server on a port of its own (`svc.healthServer(probeServer(...))`). It starts first and closes last, thus its probes answer through the whole drain. It also answers `/report`. The listeners of the host then answer no probes, unless the host options give `probes`. `probes()` of the result gives the base URL of each place that answers the probes.
- The new flag `--probe-port <port>` of `procedure-server`, `mark serve` and `mark --server` gives the probe server, on the address of `--host`. `mark` refuses it without `--server` before a command, as it refuses `--port`. The startup prints the URL of the probes.

Deprecated: at the timeout of 15 s, `server.start` gives `success: true` with the message "still loading" while the process still starts. From the next MINOR of the client group, a start that is not ready at the timeout gives `success: false`, with the PID of the process that still starts. Read the readiness probe or `mark server status` for the state.

The site, MiniMongo, Graph and jarvis: no change. A host with a listener now also answers the paths under `/_probes`. Before, these paths got 404.
