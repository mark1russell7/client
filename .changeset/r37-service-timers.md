---
"@procedures/client": minor
"@procedures/systems": patch
---

The timers of the client come from `@mark1russell7/service` 0.4.0 and `@mark1russell7/algebra` 0.5.0 (roadmap R37). The two packages are dependencies of the client now.

- The clock is `platformClock()` of `@mark1russell7/service/clock`. The types `Clock` and `Cancel` come from there too, and `Cancel.unref` is read-only.
- The heartbeat of the WebSocket client is `heartbeat` of `@mark1russell7/service/heartbeat`. A ping whose send throws is a miss. Before, the error left the timer.
- `reconnectDelay` and the retry middleware use `backoffDelay` of `@mark1russell7/service/backoff`. The delays are the same.
- `replayTransitions` uses `replay` of `@mark1russell7/algebra/replay`. A jump message says "the runtime left", not "the code left".

The four entries import nothing else, and together they have 1.3 kB of gzip.
