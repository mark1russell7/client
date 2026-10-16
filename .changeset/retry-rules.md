---
"@procedures/client": minor
"@procedures/store": patch
---

Retry and the circuit breaker (roadmap R12). The retry middleware has a retry budget (`budget`, default: 0.2 of the calls and at least 10 retries a second), so a failing service gets a fraction more requests and not `maxRetries` times more. The delay has full jitter by default (`jitter: 1`: a random time from 0 to the backoff, before ±10 percent). A server that asks for a wait gets it: `retryAfterMs` of a thrown error becomes the `Retry-After` header and the `retry-after` metadata, and the retry waits at least that long. `maxAttempts` in a context counts the tries, as its name says (before, it counted the retries). The circuit breaker counts only the failures of availability (`isAvailabilityFailure`: UNAVAILABLE, TIMEOUT, a stopped server, a gateway error, network errors): an abort or a validation error no longer opens it. Its windows use a monotonic clock. `ApiStorage` asks a retry middleware of its client for one try, so the two loops cannot multiply.
