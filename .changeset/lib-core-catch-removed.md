---
"@procedures/lib": minor
---

`core.catch` is removed. Use `client.tryCatch`.

`core.catch` did the same as `client.tryCatch` of `@procedures/client`. `CoreCatchInputSchema`, `CoreCatchInput`, `CoreCatchOutput` and `CoreCatchOutputSchema` are removed too. `client.tryCatch` gives no context name: a call of its `try` or `catch` operand needs no `$when: "catch"`.
