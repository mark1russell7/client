---
"@procedures/lib": patch
---

`lib.new` adds the new package to the fixed group of `@procedures/client` in `.changeset/config.json`. It also gives the package the version of that group. Before, the package kept the version of cue (0.1.0), and the package check failed on two versions until a person set the version.

PATCH: before 1.0.0, a backward-compatible fix raises PATCH. A workspace with no fixed group of `@procedures/client` keeps the old behavior.
