---
"@procedures/client": patch
---

A limit of the server can bound the calls in flight. Give the limit the policy `in-flight` of `@mark1russell7/service` 0.10.0: `{ type: "in-flight", limit, lease, retryAfter }`.

- A call holds one unit of the bound until it ends: at its value, its error, the end of its stream or the stop of its reader. Then the server gives the unit back.
- A call past the bound gets `RATE_LIMITED` before its work starts, with `retry-after` and the cause `limit`.
- A limit with `nested: true` holds a unit of each nested call until the end of that call.
- When a later limit refuses a call, the in-flight bounds before it get their units back at once.
- When a shared store cannot release the units, the server writes a warning. The units then count until their lease ends.
- Set a lease of at least the deadline of a call. A lease has no renewal.

`InvokeOptions.admitNested` can give a release function. The invocation calls it one time at the end of the nested call.
