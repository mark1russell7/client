---
"@procedures/client": patch
"@procedures/fs": patch
---

The warnings of the three old defaults name 0.65.0, the version that changes them. Version 0.64.0 keeps the old defaults: the depth of the nested calls has no limit, a `CallLimit` without the field `nested` counts only the calls of a caller, and `fs.read` loads the whole file without `maxBytes`.
