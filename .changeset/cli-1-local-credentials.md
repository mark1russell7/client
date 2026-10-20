---
"@procedures/client": minor
"@procedures/mcp-server": minor
---

Breaking: a `ProcedureServer` with a token or a request hook (`principalOf`) refuses a request without credentials (CLI-1). The error code is `UNAUTHORIZED`, and the hook does not run for it. Before, such a request skipped the token check and the request hook. Thus a face that set no credentials, for example a custom transport, went around the authentication.

New: the local marker `LOCAL_CREDENTIALS`, with `isLocalCredentials()` and its key `LOCAL_MARKER`. A local face sets it. Only a local request skips the token and the request hook.

The server examines a request in one of three ways:

- A local request skips the token and the request hook.
- A request without credentials gets `UNAUTHORIZED` when the server has a token or a request hook.
- A request with credentials goes through the request hook and the token check, as before.

- The local faces are MCP over stdio, an SDK transport of `McpServerTransport` and `PortTransport`. The peer of stdio is the parent process. Only the holder of the other end of a port can send to it.
- A network face never sets the marker: HTTP, WebSocket and MCP over Streamable HTTP. The key of the marker is a symbol. JSON, structured clone, a header, a cookie and a query cannot carry it.
- The calls of a WebSocket server to the `serve` handler of its client are not local. Their credentials are empty, so a `serve` server with a token refuses them.
- `PortTransport` has the new option `credentials`. Give `{}` for a port that a part outside the application can reach, for example a `Window`.
- The nested calls of a procedure do not go through the token check. They keep the principal of their caller.

Migration:

- A custom transport or face that sends no credentials to a server with a token or a request hook now gets `UNAUTHORIZED`. Set the credentials of its request (`requestCredentials()`), or `LOCAL_CREDENTIALS` for a face in this process.
- Code that calls `server.handle()` of a server with a token or a request hook gives `credentials: LOCAL_CREDENTIALS`.
- The site: no change. Its servers have no token and no request hook, and its workers serve over `PortTransport`, which sets the marker.
- MiniMongo: no change. `scripts/dev.ts` starts a server without a token and without a request hook. Its HTTP and WebSocket faces set the credentials of each request.
- Graph: no change. The procedure host (`packages/server/graph-host.ts`) has a request hook (`graphPrincipalOf` of `packages/server/graph-procedures.ts`) and no token. All its faces send credentials: HTTP, WebSocket and MCP over Streamable HTTP (`mcpFace`). No code of Graph calls `handle()` directly. The MCP host (`packages/mcp/src/host.ts`) operates over stdio, which is local.
- jarvis: no change. The loopback server and the remote server of `packages/http/src/procedures.ts` have a request hook (`principalOf`), and the remote server has a token. `makeProcedureHandler` mounts `procedureHandler`, which sends the credentials of each request. A test that calls `handle()` of such a server gives `LOCAL_CREDENTIALS`, or credentials with the token.
