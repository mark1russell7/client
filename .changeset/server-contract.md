---
"@procedures/client": minor
---

The server-transport contract (roadmap R18). `RequestHandler` (`handle(request)`) is the contract of a server transport, and the HTTP and WebSocket transports take one. A `ServerRequest` has `credentials` (the bearer token of `Authorization`, or of the `token` query of a WebSocket) and `principal`. `ProcedureServer` takes `token` (a host policy gives its token) and examines it for each network request, and `authenticate` gives the principal. Before, only the Express middleware of the peer examined the token. The secret headers (`Authorization`, `Cookie`, `Proxy-Authorization`, `X-Api-Key`) no longer go into the metadata of a request, so a handler and a nested call do not see them. `LocalTransport` answers `ABORTED` at once when its caller aborts, as HTTP and WebSocket do. A conformance suite runs the same calls through Local, `handle()`, HTTP, WebSocket and MCP.
