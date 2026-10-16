---
"@procedures/npm": minor
---

The new package `@procedures/npm`: the npm registry as procedures (roadmap R43). `npm.view` (`data`, the JSON of `npm view`), `npm.distTags.list` (`tags`), `npm.distTags.add`, `npm.distTags.remove`, `npm.whoami` (`username`), `npm.pack` (a dry run by default, `data`, the JSON of `npm pack`) and `npm.deprecate`. The procedures run the npm CLI through `shell.run` with an argument list, and put `--` before the values. The writes to the registry (the two dist-tag writes and `npm.deprecate`) declare `writes: ["network"]` and need `confirm: true`. `npm.deprecate` is not destructive.
