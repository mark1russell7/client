---
"@procedures/collections": minor
---

`asSettled(promises)` gives the result of each promise when it settles, in settle order, with the index of its promise. A rejection is a result, not an error. jarvis used the same `Promise.race` loop in two places.
