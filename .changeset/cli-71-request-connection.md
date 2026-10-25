---
"@procedures/client": patch
"@procedures/peer": patch
"@procedures/mcp-server": patch
---

The credentials of a network request have the connection of its socket (CLI-71). Thus the request hook (`principalOf`), `authenticate` and `ProcedureServer.admission()` can find the caller from its TCP peer. The fleet site finds the Claude session of a caller with it and `resources.peer` of headroom.

PATCH: a new optional field and a new optional input. Before 1.0, a feature that is compatible with the old API is a PATCH. A hook that does not read the field sees no change.

Added:

- `Credentials.connection`, of the new type `RequestConnection`: the `remoteAddress`, the `remotePort`, the `localAddress` and the `localPort` of the socket, as frozen plain data.
- Each field of `RequestConnection` is optional. A Unix socket and a named pipe have no ports, and a socket that closed has no addresses.
- The optional `socket` of the request of `requestCredentials()`. With it, the credentials have the connection. Without it, the credentials stay as before.

Changed:

- The HTTP face (`procedureHandler`, `HttpServerTransport`) sets the connection on the credentials of each request.
- The WebSocket face sets it on the credentials of the upgrade (`admits()`) and of each call over that connection.
- The MCP HTTP face sets it on the credentials of the one admission of each HTTP request. The admitted credentials keep it. A tool call uses them, and the server does not do the checks again for it (CLI-2b).
- With a handler without `admission()`, the MCP HTTP face gives each tool call the credentials of its HTTP request, with the connection. Before, the face read the same headers and query again from the request information of the SDK, without the connection.
- A local request has no connection: a call in this process, MCP over stdio or a message port.
- An SDK transport of the application (`sdkTransport` of `McpServerTransport`, for example the legacy SSE transport of the MCP SDK) gives no connection. The SDK gives only the headers and the URL of each request, not its socket.

Notes:

- The connection comes only from the socket. It does not come from `X-Forwarded-For` or `Forwarded`. Behind a proxy, the peer is the proxy. Thus a request hook that trusts the connection there sees the proxy.
- The key of the idempotency cache has the principal (audit s21). When the principal comes from the connection, two callers behind one address can have one principal. Then a call of one caller can get the cached result of a call of the other caller with the same idempotency key.
- The admitted credentials and their identity (CLI-2b) do not change. A copy of the admitted credentials still goes through the checks.
