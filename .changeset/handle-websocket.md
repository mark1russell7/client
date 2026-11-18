---
"@procedures/client": patch
---

Each WebSocket connection keeps its own handle scope (d40-handles). A procedure that opens an object with a state over WebSocket gives a handle, and the next calls of the same connection use it. Another connection cannot use the handle. The close of the connection and the stop of the transport close each object of its scope. The new option `handles` of `WebSocketServerTransport` sets `maxHandles` and `idleMs`. `wsFace` of the host passes it through.
