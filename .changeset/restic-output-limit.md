---
"@procedures/restic": patch
---

`runRestic` takes `maxOutputBytes`, and the result has `truncated` when an output stream was longer. `restic ls` of a large snapshot can give more than the default of 64 MiB.
