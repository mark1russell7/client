---
"@procedures/client": patch
---

`onError` and the `logger` of a `Server` get each failure of a call one time, under each error policy, as their docs state. Before, under the default policy `"all"`, a failed procedure reached no log. A host with `onError` or `logger` gets each failure that its callers see, as the docs say.

- A failure is an error with a code that is not known, or with a failure code (`HANDLER_ERROR`, `INTERNAL_ERROR`). A refusal with a known code (`NOT_FOUND`, `VALIDATION_ERROR`) and a code of `codes` go to no log.
- The error that ends a stream and an error of a face after `handle()` go to the log too. The line is `A handler failed`, as for a handler that throws.
- A `map` result is the decision of the host and goes to no log. Under `"coded"`, a hidden error keeps its line.
- Without `onError` and `logger`, the console gets no new line.
