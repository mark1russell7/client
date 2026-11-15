---
"@procedures/snapshot": patch
---

Each `snapshot.*` procedure declares the procedures that it calls in `metadata.calls`. The declared effects of each procedure include the effects of these procedures, and the effects check of the ecosystem examines each edge.

`snapshot.list`, `snapshot.diff` and `snapshot.restore` read the metadata of a snapshot with `s3.read`, not with `s3.download`. So `snapshot.list` and `snapshot.diff` start under a capability without writes.

PATCH: a fix of the declarations. The input and the output of each procedure do not change.
