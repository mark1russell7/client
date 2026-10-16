---
"@procedures/client": minor
---

`client.stringifyJson` and `client.export` refuse a missing value (undefined) with `VALIDATION_ERROR`, because undefined has no JSON text. Before, the call failed with `OUTPUT_VALIDATION_ERROR`. The `value` field of `client.stringifyJson` and the `procedure` field of `client.export` are now required. A value without JSON text, for example a function, gives an error from `client.stringifyJson` and an error result from `client.export`.
