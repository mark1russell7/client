---
"@procedures/client": patch
"@procedures/peer": patch
"@procedures/mcp-server": patch
---

The server, the host and each server transport take a logger (CLI-87). This change is additive. Thus it is a PATCH of the client group (decision D13).

- `@procedures/client` exports the type `Logger`: `log(level, message, fields)`, with the levels `debug`, `info`, `warn` and `error`. The `Logger` of `@mark1russell7/service` has the same shape.
- `Server`, `ProcedureServer`, `HttpServerTransport`, `WebSocketServerTransport` and `McpServerTransport` take the option `logger`. A transport without its own logger uses the logger of its server.
- The fields of each line hold its context: the transport, the procedure, the request ID and the error.
- `onError` of the server gets a third argument, `{ logger }`. When the server has a logger, the logger also gets the error.
- `createProcedureHost({ logger })` of `@procedures/peer` gives the logger to its server and to each face. `HostFaceContext.logger` gives it to a face factory.
- `writeLog()` writes one line to a logger, or to the console when there is no logger.
- Without a logger, the console output does not change.
