---
"@procedures/client": minor
---

Retry obeys the effects (roadmap R1). After a try with an indeterminate outcome (a reset, a closed WebSocket, the timeout of one try), the retry middleware sends the call again only when it is idempotent: the `idempotent` option (`true`, or a function such as `idempotentIn(registry)`), or `retry: { idempotent: true }` in the context of the call. A refused connection and a retryable error of the server still go again. Each try of one call sends the same `idempotency-key`, and `ProcedureServer` runs a keyed call to a procedure that is not idempotent one time (option `idempotency`). The error items of the transports tell the delivery of a failed try (`deliveryOf`).
