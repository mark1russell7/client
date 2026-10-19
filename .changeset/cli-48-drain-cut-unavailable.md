---
"@procedures/peer": minor
"@procedures/mcp-server": patch
---

From 0.14.0, a stream that the shutdown cuts ends with `UNAVAILABLE` and `retryable: false` when the call can have had its effect. Before, it ended with `INTERNAL_ERROR` (server stack CLI-48). This change is a break of the server stack, thus it is its own MINOR (decision D13). No 0.13 release marks the old code as deprecated, because no host relies on it.

The error registry gives `INTERNAL_ERROR` to a bug of the server, with the severity `CRITICAL`. A cut is not a bug: the server stopped. The code tells why the call ended, and the flag `retryable` tells if a retry is safe.

The behavior that changes:

- `createProcedureHost()` of `@procedures/peer`: a cut after the first item ends the stream in-band with the code `UNAVAILABLE`. This is the same on HTTP, WebSocket and MCP.
- The flag `retryable` of that end comes from the operation of the call. It is false for a call that can have had its effect (the operation `once`), and true for a repeatable call.
- The WebSocket face keeps its connections open after the cooperative abort of the drain, until each cut call ends in-band. Before, the connections closed at the abort, and a cut stream lost its error frame.
- `@procedures/mcp-server`: the error result of a failed stream has `_meta` with `code` and `retryable`. The error result of a failed call also has `retryable` in `_meta`. These fields are new.

The behavior that does not change:

- A cut of a repeatable call before its first item gets `UNAVAILABLE` (503, retryable).
- A cut of another call before its first item gets `INTERNAL_ERROR` (500, not retryable), because the runner answers 500 for it.
- A real failure of a handler keeps its own code, for example `INTERNAL_ERROR` or `HANDLER_ERROR`.
- The retry middleware reads the flag `retryable`, not the code. Thus it does not retry a cut of a call that can have had its effect.

Migration steps:

- A caller that finds a cut stream by the code `INTERNAL_ERROR`: look for `UNAVAILABLE` in its place. Do not retry the call when `retryable` is false.
- The site: no change is necessary. Its code does not read the code of a cut stream.
- MiniMongo: no change is necessary. Its code does not read `INTERNAL_ERROR` or the severity of an error.
- The procedures host of Graph (GRAPH-11): no change is necessary. Its code does not read `INTERNAL_ERROR`, and its handlers give `UNAVAILABLE` themselves.
- jarvis: no change is necessary. Its drain test already expects `UNAVAILABLE` with `retryable: false` for a cut procedure call (S6 A12). Its code reads only `NOT_FOUND` and `FORBIDDEN`.
- The `mark` CLI and `procedure-server`: no change is necessary. The lifecycle test of CI-2 expects `UNAVAILABLE` for the cut of `lifecycle.ticksOnce`.
