---
"@procedures/client": patch
---

`newTraceId()` and `newSpanId()` take their random bytes from one pool of 4096 bytes, and use a table for the hex digits. Before, each id called `getRandomValues` for 8 or 16 bytes. The ids keep their form. Each random byte goes to one id only.
