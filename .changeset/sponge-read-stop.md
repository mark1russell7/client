---
"@procedures/client": patch
---

The HTTP face stops the read of a stream for a client without NDJSON (the "sponge" mode) when the call stops. A closed connection and `close()` stop the read, also while the stream waits for its next item. The stream gets `return()`. A cut of `close()` on an open response gives `UNAVAILABLE` (HTTP 503), not the last item. Its flag `retryable` is true only for a repeatable call before its first item, as in an NDJSON stream.
