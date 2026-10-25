---
"@procedures/cue": patch
---

`cue.add`, `cue.validate` and `resolveFeatures` use only the features of the manifest itself. A name of the prototype, for example `constructor`, is not a feature (second code audit, roadmap O57).
