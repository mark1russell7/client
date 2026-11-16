---
"@procedures/client": patch
---

The WebSocket server and client examine the shape of each frame before they read its fields. The server answers a frame of another shape with `INVALID_REQUEST` and the id of the frame. The client drops such a frame. `WIRE-PROTOCOL.md` gives the rules.
