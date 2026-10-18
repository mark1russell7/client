---
"@procedures/client": minor
---

The WebSocket client ignores a raw frame of the type `event`, as a frame of an unknown type. Before, it gave such a frame to `onEvent`, for a server outside this repository. No side of wire protocol v1 sends that frame (the type is reserved). `onEvent` now gets only the events of the subscriptions of the transport (`events.subscribe`). MINOR: a breaking change of behavior (the API is before 1.0.0).

Migration: a server that sends raw `event` frames sends its events through `events.subscribe` instead (EVENTS.md). The client then gets them in `onEvent`, with the id of the subscription.
