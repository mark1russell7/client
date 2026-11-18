---
"@procedures/dag": patch
---

The functions of `@mark1russell7/collections/dag` are procedures, made from their types: 8 of 11, for example `dag.buildLeveledDAG`, `dag.getAncestors` and `dag.visualizeDAG`. Each one has no effects. A `Map` of nodes is a list of `[id, node]` pairs.

The 3 functions with a function parameter have no procedure: `createProcessor`, `executeDAG` and `executeDAGSequential`. The new exports `dagManifest` and `dagHomeProcedures` give the manifest and the procedures.

The package uses `@mark1russell7/collections` `^0.11.3`. Its entry `./dag` is the same as in 0.10, so the re-exports do not change.
