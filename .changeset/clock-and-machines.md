---
"@procedures/client": minor
---

The clock of the timers, and the state machines as data (roadmap R35). The retry, the circuit breaker and the WebSocket client take a `clock` option: a `Clock` gives the monotonic time and starts the timers, and `realClock` is the default. The shape is the `Clock` of `@mark1russell7/service`, so its `fakeClock` fits, and a test gets exact times. `WEBSOCKET_CONNECTION_MACHINE` and `CIRCUIT_BREAKER_MACHINE` are `mark1russell7.machine/1` documents with their knobs, events and timers. The WebSocket client and the circuit breaker report each change of their state to `onTransition`, and `replayTransitions()` replays the reports against a document. The heartbeat of the WebSocket client uses one timer for each interval in place of `setInterval`.
