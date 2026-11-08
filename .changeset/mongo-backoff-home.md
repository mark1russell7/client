---
"@procedures/mongo": patch
---

The change watchers and the write-conflict retry of `ViewMaterializer` take their delays from `backoffDelay` of `@mark1russell7/service/backoff`. The delays do not change: a test compares each delay with the old formula.
