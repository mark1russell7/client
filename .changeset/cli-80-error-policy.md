---
"@procedures/client": patch
"@procedures/mcp-server": patch
---

PATCH: a new optional option whose default keeps the old behavior. The error policy of a server (roadmap CLI-80).

- The new option `errors` of `Server` and `ProcedureServer` tells what an error tells the caller. A host gives it with `serverOptions`. `Server.handle()` applies it, so each face sends the same error: HTTP, WebSocket, MCP and a message port.
- `expose: "all"` is the default. Each error goes to the caller as before.
- `expose: "coded"` sends an error with a known code as it is. Each other error goes to the caller as `INTERNAL_ERROR` with the message `internal error`, without metadata. The server gives the real error to `onError`, or to `console.error` without `onError`.
- A known code is a code of `ERROR_CODES` or of `ERROR_REGISTRY`, for example `NOT_FOUND` or `CONFLICT`. The new function `isKnownErrorCode(code)` does this check. `ECONNREFUSED` and a number of MongoDB are not known codes.
- The server applies `map(error, { path, transport })` first. Its result goes to the caller as it is. `undefined` gives the error to `expose`.
- The policy applies to an error before a stream and to the error that ends a stream. A nested call of `ctx.client` keeps the real error.
- The new optional field `transport` of `ServerRequest` names the face of a request. The HTTP, WebSocket, message port and MCP faces set it.
- The new types are `ServerErrorPolicy`, `ExposedError` and `ErrorCall`.
