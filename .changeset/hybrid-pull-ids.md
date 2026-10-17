---
"@procedures/store": minor
---

A full pull of `HybridStorage` reads the local ids with `getIds()` of the local copy. Before, it read each local entry only for the ids, and `InMemoryStorage` copied each value (`structuredClone`) for it. A local copy without `getIds()` gives its entries, as before.

- `HybridStorage.getIds()` gives the ids of the local copy, or of the remote in `remote-only` mode.
- A new nightly benchmark measures a full pull of 1,000 items with and without `getIds()`. In one CI run, the mean time went from 15.3 ms to 10.7 ms.
