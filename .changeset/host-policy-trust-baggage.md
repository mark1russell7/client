---
"@procedures/client": patch
---

`hostPolicy()` takes the option `trustBaggage`, and `procedureServerOptions()` gives it to the `ProcedureServer` (C10). A host made from a policy can now trust the baggage of more callers.
