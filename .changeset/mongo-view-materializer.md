---
"@procedures/mongo": patch
---

New `ViewMaterializer`: materialized views driven by change streams. A view is a document of a views collection, with a pipeline over source collections and a target collection, for one partition. The materializer computes each view again when its sources change, in the order of the dependencies. It keeps the status of each view (`ok`, `errored`, `cycle`).

- The rows of a view are a generation, and the status names the current one. A reader filters with the new `viewFilter(view)`, so it reads one whole generation.
- A run writes only the rows that changed, and removes the rows that the result does not have, in one transaction. A larger view (`maxTransactionRows`), or a failed transaction, writes a whole new generation in groups. The previous generation stays for `generationGrace`. A pass in groups holds a lease on its view (`passLease`), so two processes can keep the same views. The time options are durations of `@procedures/client`.
- The stored `_id` of a row carries its partition and its generation: `{ partition, generation, id }` by default (`partitionTargetId`), or the form of the option `targetId`. Two partitions with the same keys share a target.
- Targets from an older materializer, with the plain key as `_id`, need no migration step. The first pass of each view replaces the rows of its partition.
- Each pipeline goes through `scopePipeline` by default. It reads only its partition, in its sources, and the current generation of a target.

The code comes from the server of Graph (its split plan, part P4). The jobs of CI with a replica set start MongoDB with the test commands, for the failpoint tests.
