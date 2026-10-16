---
"@procedures/client": minor
---

The WebSocket client has the option `webSocket`: the class of its sockets. In Node, give the `WebSocket` of the `ws` package. A drop by the heartbeat or by the time limit of the handshake then ends the socket at once with `terminate()`.

The global `WebSocket` has only `close()`, which waits for the answer of the peer. The harness cells of roadmap R36 showed that a socket to a dead peer then stays open until the kernel stops it: 924.6 seconds with the default settings of Linux.
