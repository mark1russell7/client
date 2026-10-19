---
"@procedures/mongo": patch
---

New: `MongoViewStorage`, a read-only storage of one materialized view for the collection procedures (roadmap CLI-38). A `ViewMaterializer` writes a big rebuild as a new generation in groups, and then it changes the generation in the status of the view. During the rebuild, a plain query of the target reads the rows of two generations.

Each read of `MongoViewStorage` finds the current generation of the view one time, and reads only its rows (`viewFilter`). Thus `get`, `getAll`, `find`, `changes` and the other reads of the procedures give one whole generation. The key of a row is its text `_id` in the result of the pipeline. Each write rejects with `FORBIDDEN`, because only the materializer writes a target. Collections that are not views keep their storages, and nothing changes for them.
