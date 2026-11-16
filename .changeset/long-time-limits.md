---
"@procedures/client": patch
---

A time limit above 2147483647 ms (24.8 days) holds for its full time. The rule covers the timeout interceptor and the deadline of a capability. It also covers the timeout middleware of the client and the timeouts of the HTTP and WebSocket transports. Each timer uses the platform clock, and the clock arms a long time in steps. `setTimeout` alone starts such a timer after 1 ms. A limit of `Infinity` sets no timer.
