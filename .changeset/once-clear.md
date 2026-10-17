---
"@procedures/client": patch
---

`bus.once()` rejects with an `AbortError` when `clear()` or `clearAll()` removes its channel. Before, its promise never settled.
