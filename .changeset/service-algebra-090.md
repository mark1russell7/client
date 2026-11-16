---
"@procedures/client": minor
"@procedures/mcp-server": minor
"@procedures/mongo": minor
"@procedures/peer": minor
"@procedures/store": minor
"@procedures/gh": minor
"@procedures/mcp-dev-tools": minor
"@procedures/llm": minor
"@procedures/mark": minor
"@procedures/schedule": minor
"@procedures/server": minor
"@procedures/systems": minor
---

The packages use `@mark1russell7/service` and `@mark1russell7/algebra` 0.9.0.

This is a breaking change. Before, a timer of service work (a backoff, a retry, a time-out) did not keep a Node process alive. A script could end while such a timer waited. After this change, the process waits for the timer, as it does for `setTimeout`.

- The `realClock` of `@procedures/client` worked this way before. Its timers do not change.
- The watch timers of service (checks, the watchdog, the sweeps) do not keep a process alive.
- The heartbeat of the WebSocket client uses `unrefClock` of service. Its timers do not keep a process alive: the socket does.
- A new end-to-end test runs a command with `main()` of `@procedures/mark` in a script. After the command, no timer keeps the script alive.

Migration: a script that must end before a pending timer of service fires stops its work first. Close each client, host and transport, or abort the call. For a timer that only watches other work, give the service a clock made with `unrefClock` of `@mark1russell7/service/clock`.
