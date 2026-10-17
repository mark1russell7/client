# @procedures/systems

## 0.5.0

### Patch Changes

- 0f75644: The dependencies go to `@mark1russell7/algebra` `^0.7.0` and `@mark1russell7/service` `^0.4.1`. A host that uses algebra 0.7.0 gets one copy of it. Algebra 0.7.0 only adds to 0.6.0.
- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0

## 0.3.0

### Minor Changes

- 4a3bfa1: The timer law of systems for the client (roadmap R34). The new package `@procedures/systems` binds the times of the middleware, the transports and the server to the symbols of the law of `@mark1russell7/service`, and examines six rules of the client: `lintTimers()`, `bindingOf()`, `CLIENT_RULES` and the procedure `systems.timers`. The core exports its default times as data: `TIMER_DEFAULTS`. The middleware, the transports and the server read them. The law found two defaults that broke it, and they change: the WebSocket client pings each 20 s, not 30 s, so it finds a dead connection before a call on it times out. The WebSocket server pings each 15 s, not 30 s, so it finds a dead client before its call to the client times out.

### Patch Changes

- 061fa22: The timers of the client come from `@mark1russell7/service` 0.4.0 and `@mark1russell7/algebra` 0.5.0 (roadmap R37). The two packages are dependencies of the client now.
  
  - The clock is `platformClock()` of `@mark1russell7/service/clock`. The types `Clock` and `Cancel` come from there too, and `Cancel.unref` is read-only.
  - The heartbeat of the WebSocket client is `heartbeat` of `@mark1russell7/service/heartbeat`. A ping whose send throws is a miss. Before, the error left the timer.
  - `reconnectDelay` and the retry middleware use `backoffDelay` of `@mark1russell7/service/backoff`. The delays are the same.
  - `replayTransitions` uses `replay` of `@mark1russell7/algebra/replay`. A jump message says "the runtime left", not "the code left".
  
  The four entries import nothing else, and together they have 1.3 kB of gzip.
- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
