---
"@procedures/cue": patch
---

The cue procedures read the files of the installed `@mark1russell7/cue` package (`features.json` and its CUE files) with `node:fs`, not through `fs.*`. Before, under a root of the files, `cue.init`, `cue.add`, `cue.generate` and `cue.validate` failed, because the root refused the files of the package. `cue vet` of `cue.validate` starts in the folder of the schema, not in the working folder of the host. Under a root, the folder of the project (`cwd`) must be in the root, and without `cwd` it is the root (roadmap R33).
