---
"@procedures/client": minor
---

`client.import` gives `success: true` only for a procedure reference: an object whose `$proc` is a list of texts. Other JSON, for example `42`, an object without `$proc` or a list of calls, gives `success: false` and an error. Before, each JSON value gave `success: true`.
