---
"@procedures/store": minor
"@procedures/client": patch
---

A write over the size limit of the remote no longer stops the offline queue of `HybridStorage` (CLI-108).

- A batch that the remote refuses, or that is too large, goes again as one write for each id. Only the bad write leaves the queue, and its siblings reach the remote.
- A write of one id that is too large leaves the queue at once, and the writes behind it go on. The hook `onDropped` gets its id and value with the new reason `too-large`.
- The new option `isTooLarge` tells which error is too large. The default is the code `PAYLOAD_TOO_LARGE`.
- The `hello` of the WebSocket server tells its limit `maxPayload`. The client refuses a larger call alone with `PAYLOAD_TOO_LARGE`, and the other calls of the connection go on. Before, the server closed the connection, and each pending call failed.
- The HTTP server reads and drops up to 64 MiB of a body over the limit. So the client gets the answer 413, not a reset of the connection.

Breaking change: the type `DroppedWrite["reason"]` has the new member `"too-large"`. To migrate, add a case for `"too-large"` to each `switch` over the reason. A refused batch no longer drops its good siblings.
