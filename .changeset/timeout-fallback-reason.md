---
"@procedures/client": patch
---

The timeout middleware keeps the reason of an abort when the platform has no `AbortSignal.any`. Its own composition of the signals now gives the transport the reason of the signal that aborted, as `AbortSignal.any` does. Before, the transport got a new `AbortError` in place of the reason of the caller.
