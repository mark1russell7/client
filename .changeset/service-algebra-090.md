---
"@procedures/client": patch
"@procedures/mcp-server": patch
"@procedures/mongo": patch
"@procedures/peer": patch
"@procedures/store": patch
"@procedures/gh": patch
"@procedures/mcp-dev-tools": patch
"@procedures/llm": patch
"@procedures/mark": patch
"@procedures/schedule": patch
"@procedures/server": patch
"@procedures/systems": patch
---

The packages use `@mark1russell7/service` and `@mark1russell7/algebra` 0.9.0.

- Since service 0.9.0, each timer of its `realClock` keeps a Node process alive, as the `realClock` of `@procedures/client` does. The watch timers of service do not keep a process alive.
- The heartbeat of the WebSocket client uses `unrefClock` of service. Its timers do not keep a process alive: the socket does.
- A new end-to-end test runs a command with `main()` of `@procedures/mark` in a script. After the command, no timer keeps the script alive.
