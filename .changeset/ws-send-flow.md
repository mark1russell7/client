---
"@procedures/client": patch
---

`WebSocketServerTransport` sends each frame through one function with a flow rule.

- While the send buffer of a connection holds more than `highWaterMark`, the server does not read the frames of the connection. It reads them again when the socket wrote the buffer down to the mark.
- While the reads of a connection are paused, a frame that the socket wrote since the last ping counts as the pong of the heartbeat. Thus a peer that reads slowly stays open, and a peer that does not read closes.
- The new option `maxBufferedBytes` is the largest send buffer of a connection. A send that finds a larger buffer ends the connection. It bounds the frames that the server sends with no request, for example `broadcast()`. It has no default.
