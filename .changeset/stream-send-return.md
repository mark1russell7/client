---
"@procedures/client": patch
---

The WebSocket face gives `return()` to the stream of a handler when the send of an item frame throws, so the `finally` block of the handler runs. The `error` frame of the call comes first. The count of the items that went out, which sets the retry flag of that error, has only the frames that the socket took.
