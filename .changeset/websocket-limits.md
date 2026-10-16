---
"@procedures/client": minor
---

WebSocket time limits (roadmap R3). The handshake of the client has a time limit (`connectionTimeout`): an address that never answers no longer keeps the socket in `CONNECTING`. The reconnect delay has full jitter by default (`reconnect.jitter`), so the clients of a server that restarted do not come back at the same moments. The client drops a connection after `heartbeat.misses` pings without a pong (default 1, as before). The server pings each connection and closes one that misses 2 pongs (`WebSocketServerTransport` option `heartbeat`), so it finds a client that went silent.
