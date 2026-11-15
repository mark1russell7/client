---
"@procedures/client": patch
"@procedures/peer": patch
---

A call that the stop of a face cuts ends with `UNAVAILABLE` on each face, as `WIRE-PROTOCOL.md` tells (CLI-48). The flag `retryable` follows the declared effects of the procedure, with the rule of the host.

- A repeatable procedure (`isRepeatable`) gives the same state after a second start. Its cut call ends with `retryable: true`. A stream that sent an item ends with `retryable: false`, because a retry sends the items again.
- The handler of another call started, so the call can have had its effect. Its cut call ends with `retryable: false`, and the retry middleware does not send it again.
- The HTTP face: an open stream ended with `ABORTED` and `retryable: true` for each procedure. A call with a value ended with the error of its handler after the abort. Both end with `UNAVAILABLE`. A call with a value gets HTTP 503 when it is repeatable, and HTTP 500 when it is not. A value that the handler gives after the cut still goes out.
- The WebSocket face: the server and the client send the error frame of each stopped call before the socket closes. Before, the caller got `CONNECTION_CLOSED`, and the outcome of the call was not known.
- The port transport: `close()` sends the error of each call of the other side that it stops. Before, the other side got no frame, and its call waited for its time-out.
- New optional members: `RequestHandler.isRepeatableCall(method)`, implemented by `ProcedureServer` and forwarded by the face handler of the host, and the option `retryableOnStop` of `writeNdjsonStream`. A handler without `isRepeatableCall` ends each cut call with `retryable: false`.
