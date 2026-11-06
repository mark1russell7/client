---
"@procedures/client": patch
---

A server encodes an event once for each topic, not once for each subscriber. The WebSocket and the NDJSON transports put the same text in the frame of each connection.

Before this change, one event cost subscribers x event bytes of encode work. The text of each frame stays byte-equal to the text before this change.
