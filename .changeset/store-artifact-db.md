---
"@procedures/store": patch
---

`ArtifactDbStorage` is a new collection storage over the db of an artifact page (`window.claude.use("db")`). The entries `@procedures/store/browser` and `@procedures/store` export it. Each item is one document of the db. With a `HybridStorage`, an artifact page keeps a local copy in IndexedDB and works with no network. It sends its queue to the db when the network comes back. The other exports do not change.
