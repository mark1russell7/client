---
"@procedures/client": minor
---

Two changes for the contract of `CollectionStorage`:

- The collection procedure `collections.<name>.get` takes the input `found: true`. Then its output is `{ found, value }`, so a stored `null` and a missing id give different outputs in one call. Without `found`, the output is the item, as before.
- `ProcedureServer.stop()` and `closeStorages()` close each storage one time, also a storage of two collections, and remove the storages from the server. Before, a server that started again used the closed storages.
