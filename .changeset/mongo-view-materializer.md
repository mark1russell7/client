---
"@procedures/mongo": patch
---

New `ViewMaterializer`: materialized views driven by change streams. A view is a document of a views collection, with a pipeline over source collections and a target collection, for one partition. The materializer computes each view again when its sources change, in the order of the dependencies. It keeps the status of each view (`ok`, `errored`, `cycle`).

- A run writes only the rows that changed, and removes the rows of the partition that the result does not have, in one transaction.
- The stored `_id` of a row carries its partition: `{ partition, id }` by default (`partitionTargetId`), or the form of the option `targetId`. Two partitions with the same keys share a target.
- Targets from an older materializer, with the plain key as `_id`, need no migration step. The first pass of each view replaces the rows of its partition.
- Each pipeline goes through `scopePipeline` by default. It reads only its partition, in its sources.

The code comes from the server of Graph (its split plan, part P4). The coverage job of CI uses a single-node replica set, because change streams need one.
