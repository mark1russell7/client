---
"@procedures/client": minor
---

Remote events (`documentation/EVENTS.md`): a peer subscribes to the topics of the event bus of another peer. A subscription is a streaming call of the procedure `events.subscribe`, so it uses the frames of each call: credit is the backpressure, and a cancel is the unsubscribe. It works over WebSocket in the two directions, HTTP with NDJSON, a message port and the local transport. The protocol stays v1.

- `WebSocketTransport.subscribe(topics, handler)` gives the unsubscribe function, with the `ready` promise of the first confirmation. `WebSocketTransport.events(topics)` gives an async iterator. After a drop, the transport resubscribes on the new connection.
- `subscribeRemote()` and `remoteEvents()` do the same over each transport. After a failure that a retry can repair, they resubscribe with a backoff.
- `ProcedureServer` has the option `events`: a bus, a topic rule (`topics`), an `allow` function and a `buffer`. The server pins `events.subscribe` outside its registry, so it is not an MCP tool. `ProcedureServer.publish()` emits on the bus. `stop()` ends each subscription with `UNAVAILABLE`.
- `WebSocketServerTransport.subscribe(connectionId, topics, handler)` and `events(connectionId, topics)` subscribe to the bus of a client. `LocalTransport` takes an `EventPublisher` with its option `events`.
- The delivery is at most once, in the order of `emit()`. When the queue of a slow subscriber is full, the publisher drops the oldest event, and the next event tells the loss (`dropped`).
- The new error code `TOPIC_NOT_FOUND` (404) is for a topic outside the topic rule. A topic that `allow` refuses gives `FORBIDDEN` with the reason `topic-not-allowed`.
- The `onEvent` option of `WebSocketTransport` is now a wrapper: it gets each event of each subscription of the transport. A raw `event` frame still goes to it.
- The WebSocket client does not warn about a `stream` frame of a call that it cancelled.
