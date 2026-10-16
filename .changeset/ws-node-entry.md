---
"@procedures/client": minor
---

The new entry `@procedures/client/node` exports a `WebSocketTransport` whose sockets are of the `WebSocket` class of the `ws` package. A Node application gets `terminate()` without the option `webSocket`: a drop by the heartbeat or by the time limit of the handshake ends the socket at once. The option `webSocket` still gives another class. The other entries keep the global `WebSocket`, and the browser entry does not import `ws`.

A socket of the `ws` package that closes during its handshake emits an error. Before, the transport removed its error handler first, so a handshake timeout or a `close()` during the handshake ended the process with an uncaught error. The transport now keeps a handler that ignores that error.
