---
"@procedures/client": patch
---

A `$never` operand of a control-flow procedure is data (roadmap R4). Before, only a step of `client.chain` obeyed `$never`: a `$never` branch of `client.conditional`, a try of `client.tryCatch`, a task of `client.parallel` and the `fn` of `client.map` started. A `fn` of `client.map` or `client.reduce` that is not one call is an error: before, it was ignored.
