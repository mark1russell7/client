---
"@procedures/client": patch
---

**Security fix:** a `register()` handler of a `ProcedureServer` needs the token, keeps the call limits and gets the stop refusal, as the host policy states.

The handler gets the same admission as a procedure. Before, only the procedures got it.

- A network request must send the token of the host policy, as the policy documents. The request hook and `authenticate` apply too.
- The call limits apply to the route of the handler. A handler declares no effects, so a limit of the writes covers it too.
- After `stopIntake()`, a new request gets `UNAVAILABLE`. `inFlight()` counts the call until its response, so `drain()` waits for it.

A local request (`LOCAL_CREDENTIALS`) passes, as before. A client that sends the token sees no change.
