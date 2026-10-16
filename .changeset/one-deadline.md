---
"@procedures/client": minor
---

One deadline model (roadmap R10, REV-6). The overall timeout and the remaining time that a caller gives (`procedure-timeout`) set the deadline of a call, and each try sends its remaining time as `procedure-timeout`. So the server stops the handler when the client stops waiting: before, the timeouts of the client middleware did not reach the server. The timeout of one try is at most the remaining time. The client no longer sends `X-Timeout`, which the server ignored. The new preset `resilience({ overall, perAttempt, retry, breaker, cache, rateLimit })` puts the layers in the correct order, and `createCombinedTimeoutMiddleware` is now that preset (deprecated).
