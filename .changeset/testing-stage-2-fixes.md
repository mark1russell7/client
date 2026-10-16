---
"@procedures/client": patch
---

Four fixes that the tests of roadmap R30 found.

- An abort of the caller ends the wait of the timeout middlewares at once, also when the transport ignores the signal. The caller gets `ABORTED`. Before, the caller waited for the timeout and got `TIMEOUT`, and the circuit breaker counted a failure.
- `WebSocketTransport` starts its reconnects at once when a handshake fails on Node 22. The WebSocket of Node 22 gives an error event and no close event, so before, each try waited for `connectionTimeout`.
- `createErrorFromException` gives `TIMEOUT` for the reason of `AbortSignal.timeout()`, and `SERIALIZE_ERROR` for a circular structure. Before, it gave `ABORTED` and `PARSE_ERROR`.
- `isAvailabilityFailure` is true for `CONNECTION_CLOSED`, so the circuit breaker counts a closed connection.
