---
"@procedures/json": patch
---

The README and the TSDoc of `JsonError` say that a server sends the error with its own code, for example `NOT_JSON`. Since `@procedures/client` keeps the code of a handler error, a caller over HTTP or WebSocket gets that code, not `HANDLER_ERROR`.
