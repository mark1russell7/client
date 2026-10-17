---
"@procedures/client": minor
---

Sequence numbers of the stream frames (`documentation/WIRE-PROTOCOL.md`). Before, a duplicate `stream` frame gave a duplicate item. The change is additive, and the protocol stays v1.

- Each `stream` frame has the field `seq`: 1 in the first frame of a call, and one more in each next frame. The end frame has a number too. Each NDJSON line `item` or `done` has the same field.
- The receiver drops a frame whose `seq` is not above the last one. Thus a duplicate frame or a late frame gives no item.
- A gap does not end the stream, because the delivery is at most once. The next item has the number of lost frames in the metadata key `stream-gap` (`STREAM_GAP_METADATA_KEY`), and the console gets a warning. The receiver gives back the credit of the lost frames.
- A frame without `seq` comes from an older peer. The receiver takes it as before.
- The rules apply to WebSocket in the two directions, the message port and HTTP with NDJSON. The local transport has no frames.
- `WebSocketMessage` has the optional field `seq`.
