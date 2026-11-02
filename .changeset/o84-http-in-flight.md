---
"@procedures/client": patch
---

`HttpServerTransport` has the new method `inFlight()`. It gives the number of requests in progress, open streams too, as `WebSocketServerTransport.inFlight()` does. The change is additive.
