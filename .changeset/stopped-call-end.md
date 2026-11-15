---
"@procedures/client": patch
---

A call that the stop of a face cuts ends with `UNAVAILABLE` and `retryable: false` on each face, as `WIRE-PROTOCOL.md` tells (CLI-48). The handler started, so the call can have had its effect. The retry middleware does not send the call again.

- The HTTP face: an open stream ended with `ABORTED` and `retryable: true`. Thus the retry middleware sent the call again after its first try. A call with a value ended with the error of its handler after the abort. Both end with `UNAVAILABLE`, and a call with a value gets HTTP 500. A value that the handler gives after the cut still goes out.
- The WebSocket face: the server and the client send the error frame of each stopped call before the socket closes. Before, the caller got `CONNECTION_CLOSED`, and the outcome of the call was not known.
- The port transport: `close()` sends the error of each call of the other side that it stops. Before, the other side got no frame, and its call waited for its time-out.
