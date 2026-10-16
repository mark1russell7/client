---
"@procedures/client": minor
---

A handler error keeps its own code on each face, as `WIRE-PROTOCOL.md` says. `errorResponse` (the server, and through it HTTP, WebSocket and MCP) and `LocalTransport` give the code of the thrown error when it is a string. Before, they changed it to `HANDLER_ERROR` for a value, and `LocalTransport` also for a stream. An error without a code is still `HANDLER_ERROR`.

The HTTP status follows the code: a code of `ERROR_CODES` gets its status, another code of `ERROR_REGISTRY` gets the status of the registry, and each other code gets 500. For example, a handler error with the code `UNAVAILABLE` now gives 503.
