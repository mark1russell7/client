---
"@procedures/client": minor
"@procedures/peer": minor
"@procedures/mcp-server": patch
---

From 0.14.0, a call that the shutdown cuts ends with `UNAVAILABLE` and `retryable: false` when the call can have had its effect. Before, it ended with `INTERNAL_ERROR` (server stack CLI-48). This is true before and after the first item. This change is a break of the server stack, thus it is its own MINOR (decision D13). No 0.13 release marks the old code as deprecated, because no host relies on it.

The error registry gives `INTERNAL_ERROR` to a bug of the server, with the severity `CRITICAL`. A cut is not a bug: the server stopped. Thus an alert on `INTERNAL_ERROR` does not fire at each deploy that cuts a write. The code tells why the call ended, and the flag `retryable` tells if a retry is safe.

The behavior that changes:

- `createProcedureHost()` of `@procedures/peer`: each cut has the code `UNAVAILABLE`. This is the same on HTTP, WebSocket and MCP.
- A cut after the first item ends the stream in-band. A cut before the first item is the answer of the call. Before, a cut of a call that can have had its effect had the code `INTERNAL_ERROR` in the two cases.
- The flag `retryable` of a cut comes from the operation of the call. It is false for a call that can have had its effect (the operation `once`), and true for a repeatable call.
- `procedureHandler()` of `@procedures/client`: an error that is not retryable does not get the HTTP status 503. A 503 invites a retry at the HTTP level (decision D3). It gets 500. Thus a cut before the first item of a call that can have had its effect is 500 with `UNAVAILABLE`, with no `Retry-After`. A retryable cut stays 503.
- The drain of the host waits until each face has the answer of each cut call. Thus the close of the transports does not lose the answer of a call that the deadline of the drain cuts.
- The WebSocket face keeps its connections open after the cooperative abort of the drain, until each cut call ends in-band. Before, the connections closed at the abort, and a cut call lost its end.
- `@procedures/mcp-server`: the error result of a failed stream has `_meta` with `code` and `retryable`. The error result of a failed call also has `retryable` in `_meta`. These fields are new.
- `@procedures/peer` also exports `pendingAnswers()` and the type `PendingAnswers`, and `FaceHandlerOptions` has the new option `answers`.

The behavior that does not change:

- A real failure of a handler keeps its own code, for example `INTERNAL_ERROR` or `HANDLER_ERROR`.
- A refusal at the stop of the intake stays `UNAVAILABLE`, 503 and retryable.
- The retry middleware reads the flag `retryable`, not the code. Thus it does not retry a cut of a call that can have had its effect.

Migration steps:

- A caller that finds a cut by the code `INTERNAL_ERROR`: look for `UNAVAILABLE` in its place. Do not retry the call when `retryable` is false.
- A handler that throws `UNAVAILABLE` and wants the HTTP status 503: give `retryable: true` to the error. Without the flag, the error is not retryable, and the HTTP status is 500.
- The site: no change is necessary. Its code does not read the code of a cut, or the HTTP status 503.
- MiniMongo: no change is necessary. Its code does not read `INTERNAL_ERROR`, `UNAVAILABLE` or the severity of an error.
- The procedures host of Graph (GRAPH-11): no change is necessary. Its code does not read `INTERNAL_ERROR`. Its error "the server has no AGENT_TOKEN" is `UNAVAILABLE` with `retryable: false`, so its HTTP status is 500 in place of 503. No code of Graph reads that status.
- jarvis: no change is necessary. Its drain test already expects `UNAVAILABLE` with `retryable: false` for a cut procedure call (S6 A12). Its code reads only `NOT_FOUND` and `FORBIDDEN`.
- The `mark` CLI and `procedure-server`: no change is necessary. The lifecycle test of CI-2 expects `UNAVAILABLE` for the cut of `lifecycle.ticksOnce`.
