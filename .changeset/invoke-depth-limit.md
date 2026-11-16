---
"@procedures/client": patch
---

A host can limit the depth of the nested calls.

- The new option `maxDepth` of `invokeProcedure()`, `ProcedureServer` and `hostPolicy()` is the highest depth of a nested call. The call of a caller has the depth 0.
- A call at a larger depth gets `FORBIDDEN` with the new reason `depth`. Its handler does not start. Thus a loop of calls to one procedure stops at the limit.
- A value that is not a whole number of 0 or more stops the call or the start of the server with a `TypeError`.
- Without `maxDepth`, the depth has no limit, as before. The first call over the depth 64 in the process writes one warning.

Migration before 0.64.0: version 0.64.0 sets the default limit to 64. A host with deeper call trees sets `maxDepth` to its own limit.
