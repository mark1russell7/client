---
"@procedures/client": patch
---

After `stop()` of a `ProcedureServer`, the intake stays stopped until the next `start()`, as after `close()`. A call after the stop gets the retryable `UNAVAILABLE`. `start()` opens the intake again, with a new signal.
