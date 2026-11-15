---
"@procedures/client": patch
---

A handler that `register()` adds to a `ProcedureServer` gets the same admission as a procedure. Before, only the procedures got it.

- A network request must send the token of the host policy, as the policy documents. The request hook and `authenticate` apply too.
- The call limits apply to the route of the handler.
- After `stopIntake()`, a new request gets `UNAVAILABLE`. `inFlight()` counts the call until its response, so `drain()` waits for it.

A local request (`LOCAL_CREDENTIALS`) passes, as before. A client that sends the token sees no change.
