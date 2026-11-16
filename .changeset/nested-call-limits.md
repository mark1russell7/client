---
"@procedures/client": patch
---

A limit of the calls can also count the nested calls of a procedure.

- The new field `nested` of a `CallLimit` sets the rule. With `nested: true`, the limit takes the units of each nested call that it covers, for example each step of `client.chain` and `client.parallel`. A refused nested call does not start. The procedure gets an error with the code `RATE_LIMITED` or `PAYLOAD_TOO_LARGE`, the wait in `retry-after` and the cause in `reason`. When the procedure does not catch it, the caller gets the same response as a refusal before the run.
- `LimitedCall` has two new fields: `depth` (0 for the call of a caller, 1 or more for a nested call) and `input`. A cover, key or cost function of a limit with `nested: true` reads them.
- A limit without the field `nested` keeps the old rule: it counts only the calls of a caller. The server writes one warning at the start for each such limit.
- A value of `nested` that is not `true` or `false` stops the start of the server with an error.

Migration before 0.61.0: version 0.61.0 changes the default to `nested: true`. Give each limit the field `nested`. Use `true` to count the nested calls, or `false` to keep the old rule. The warning then stops.
