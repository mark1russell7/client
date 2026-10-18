---
"@procedures/mongo": patch
---

New `ViewMaterializer`: materialized views driven by change streams. A view is a document of a views collection, with a pipeline over source collections and a target collection, for one partition. The materializer computes each view again when its sources change, in the order of the dependencies. It writes only a changed result, removes the old rows, and keeps the status of each view (`ok`, `errored`, `cycle`).

Each pipeline goes through `scopePipeline` by default. The code comes from the server of Graph (its split plan, part P4). The coverage job of CI uses a single-node replica set, because change streams need one.
