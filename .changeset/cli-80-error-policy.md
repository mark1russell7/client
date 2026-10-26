---
"@procedures/client": patch
"@procedures/mcp-server": patch
"@procedures/peer": patch
---

PATCH: a new optional option whose default keeps the old behavior. The error policy of a server (roadmap CLI-80).

- The new option `errors` of `Server` and `ProcedureServer` tells what an error tells the caller. A host gives it with `serverOptions`. `Server.handle()` applies it, so each face sends the same error: HTTP, WebSocket, MCP and a message port.
- `expose: "all"` is the default. Each error goes to the caller as before.
- `expose: "coded"` sends an error with a known code as it is. Each other error goes to the caller as `INTERNAL_ERROR` with the message `internal error` and its real retryable flag. It keeps only the metadata keys of the new option `keepMetadata`: by default the trace keys `traceparent` and `tracestate`. The server gives the real error to `onError`, or to `console.error` without `onError`.
- A known code is a code of `ERROR_CODES` or of `ERROR_REGISTRY`, for example `NOT_FOUND` or `CONFLICT`. The new function `isKnownErrorCode(code)` does this check. `ECONNREFUSED` and a numeric code of MongoDB are not known codes.
- The option `codes` adds the codes of the application that go out as they are, for example `QUOTA_EXCEEDED`.
- The codes `OUTPUT_VALIDATION_ERROR` and `NO_OUTPUT` tell of a failure of the server, so `"coded"` hides them, with `INTERNAL_ERROR`, `HANDLER_ERROR` and `UNKNOWN`.
- The server applies `map(error, { path, transport })` first, with the real error of its own class. Its result goes to the caller as it is, with its `retryAfterMs` and its conflicts. `undefined` gives the error to `expose`.
- The policy applies to an error before a stream and to the error that ends a stream. A nested call of `ctx.client` keeps the real error.
- The new optional field `transport` of `ServerRequest` names the face of a request. The HTTP, WebSocket, message port and MCP faces set it.
- The last-resort catch of each face applies the same policy when `handle()` throws. This is true for the HTTP, WebSocket, message port and MCP faces, and for the tracked call of a host (`@procedures/peer`). The new function `lastResortError(handler, error, request)` and the new optional method `RequestHandler.exposeError()` do this. The logger gets each hidden error one time.
- The new types are `ServerErrorPolicy`, `ExposedError` and `ErrorCall`. The new exports are `exposeError`, `lastResortError`, `HIDDEN_ERROR_MESSAGE` and `DEFAULT_KEPT_METADATA`.
- An MCP result for an unknown tool has `_meta` with the code `NOT_FOUND`.
