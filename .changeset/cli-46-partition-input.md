---
"@procedures/client": patch
---

The field `partition` reaches each collection procedure again (CLI-46). `withPartition()` gave the whole input to the schema of the operation, and the schemas of `find`, `patch` and `changes` check each field, so they refused `partition`. Thus `find` could not run on a collection with partitions. The schema of the operation now gets the input without the field, and the parsed input gets it back.
