---
"@procedures/client": patch
"@procedures/server": patch
---

Fixes from the audit s21.

PATCH: bug fixes. A caller that used the documented behavior sees no change.

- A stream that its reader closes before the first item now ends. An async generator ignores a `return()` before its first `next()`, so no wrapper of the stream ran its end. Thus an HTTP request without `Accept: application/x-ndjson` for a stream without an end (`NOT_ACCEPTABLE`) stayed in flight, so `drain()` and `stop()` waited for their deadline. It also kept its storages in use, so `useStorage(..., { close })` waited for its grace. The subscription of `events.subscribe` kept its listeners on the bus. Now each wrapper on the path of the server (`ProcedureServer`, the invocation, the timeout and the tracing interceptors) gives the `return()` to its source and runs its end. The tests in `unbounded.test.ts`, `use-storage.test.ts` and `interceptors.test.ts` pin this.
- The idempotency cache of `ProcedureServer` now keeps the results of each principal apart. Before, its key was the procedure and the idempotency key alone. Thus a caller with the idempotency key of another principal got the result of that call, and its own write did not run. A second try of one principal still gets its first result. The test in `idempotency.client.test.ts` pins this.
- `server.start` of `@procedures/server` now starts only the `mark` CLI: `dist/bin.js` or `dist/cli.js` of `mark`. Before, it took each running script whose name ends in `cli.js`, so a start in `procedure-server` started `procedure-server`. The test in `procedures.test.ts` pins this.
