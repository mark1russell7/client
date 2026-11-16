---
"@procedures/client": patch
---

The stop of a `ProcedureServer` ends a stream of a call with an idempotency key. Before, the stream lost the link to the stop when its first item came.

- The cooperative abort of `drain()` and the abort of `close()` reach the stream until its last item, as on the path without a key.
- A stream of a local caller without a signal ends at the stop, so `inFlight()` goes to 0.
- The stream still ends with its caller.
