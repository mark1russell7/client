---
"@procedures/client": patch
---

New `callerOf(...modules)` in the root and the browser entry. It gives a function that runs the procedures of the modules and gives one value. It makes the registry of the modules at the first call and does not use the global registry. An app wrote the three steps itself before: `createRegistry`, `invokePath` and `outputValue`. PATCH: a new export (the API is before 1.0.0).
