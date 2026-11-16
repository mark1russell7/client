---
"@procedures/server": patch
"@procedures/mark": patch
---

`server.start`, `mark --server`, `mark serve`, `procedure-server` and `runProcedureHost()` accept the port 0. The server listens on a free port, and its lockfile gives the port that the listener got.

- `mark --server --port 0` starts each listener on a free port. With `--transport both`, the WebSocket listener gets a free port of its own.
- `procedure-server --port 0` and `mark serve --port 0` start the first transport on a free port. The endpoint lines of the output give the port that the listener got. `--probe-port 0` gives the probe server a free port.
- `runProcedureHost()` with a lockfile on the port 0 writes the lockfile at the end of the startup. The lockfile takes the port of the listener with the scheme and the path of its endpoint. When no listener matches, the host stops with the code 1.
- `server.start` with `{ port: 0 }` finds the lockfile of the new server by the PID of its child process. Its result gives the port. At the timeout, the result gives the port when the lockfile has one.
- The other ports work as before.
- A test that starts a server in a child process gives it the port 0 and reads the port from the lockfile or from the output of the child. Then no other process can take the port between a pick and the listen.
