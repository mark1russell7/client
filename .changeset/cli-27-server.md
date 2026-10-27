---
"@procedures/server": patch
---

A procedures host can stop by itself after a time with no call (CLI-27).

- `runProcedureHost()` has the new option `idle`: `{ after, poll? }`. Without it, the host has no idle stop, as before.
- The host stops through `life.shutdown()`, as an exit signal does. The runner keeps the stop in stages, and the exit code is 0.
- Each call starts the full time again. An open stream is a call until its end.
- The new export `spawnMarkServer()` starts `mark --server` as a detached, unref'd process. `server.start` uses it, with no change of its behavior.
- The new exports `HostIdle`, `IDLE_POLL_MS`, `MarkServerSpawn`, `ServerSpawner` and `SpawnedMarkServer` are the types and the default of these options.
