---
"@procedures/client": patch
---

`isW3cIds()`, `parseTraceparent()`, `newTraceId()` and `newSpanId()` check the ids with `isValidTraceId()` and `isValidSpanId()` of `@opentelemetry/api` (decision D7 of otel-ts). The results do not change. An id of only zeros is not valid, and `isW3cIds()` still refuses uppercase digits, as W3C Trace Context requires.
