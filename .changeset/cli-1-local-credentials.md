---
"@procedures/client": minor
"@procedures/mcp-server": minor
---

Breaking: a `ProcedureServer` with a token refuses a request without credentials (CLI-1). The error code is `UNAUTHORIZED`. Before, such a request skipped the token check and the request hook. Thus a face that set no credentials, for example a custom transport, went around the token.

New: the local marker `LOCAL_CREDENTIALS`, with `isLocalCredentials()` and its key `LOCAL_MARKER`. A local face sets it, and the token and the request hook do not apply to it.

- The local faces are MCP over stdio, an SDK transport of `McpServerTransport` and `PortTransport`. The peer of stdio is the parent process. Only the holder of the other end of a port can send to it.
- A network face never sets the marker: HTTP, WebSocket and MCP over Streamable HTTP. The key of the marker is a symbol. JSON, structured clone, a header, a cookie and a query cannot carry it.
- The calls of a WebSocket server to the `serve` handler of its client are not local. Their credentials are empty, so a `serve` server with a token refuses them.
- `PortTransport` has the new option `credentials`. Give `{}` for a port that a part outside the application can reach, for example a `Window`.
- The nested calls of a procedure do not go through the token check. They keep the principal of their caller.

Migration:

- A custom transport that calls the server without credentials while a token is set now gets `UNAUTHORIZED`. Set the credentials of its request (`requestCredentials()`), or `LOCAL_CREDENTIALS` for a face in this process.
- Code that calls `server.handle()` of a server with a token gives `credentials: LOCAL_CREDENTIALS`.
- The site: no change. Its servers have no token, and its workers serve over `PortTransport`, which sets the marker.
- MiniMongo: no change. `scripts/dev.ts` starts a server without a token. Its HTTP and WebSocket faces set the credentials of each request.
- Graph: no change. The procedure host has a request hook and no token, and each of its faces sets credentials. The MCP host operates over stdio, which is local.
- jarvis: no change. `makeProcedureHandler` mounts `procedureHandler`, which sets the credentials of each request. A test that calls `handle()` of a server with a token gives `LOCAL_CREDENTIALS` or the token.
