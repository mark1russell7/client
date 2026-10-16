---
"@procedures/env": minor
---

The new package `@procedures/env` (roadmap R46) has three procedures: `env.get` (one variable), `env.list` (the names, sorted, with the values of the variables that are not secrets on request) and `env.check` (the necessary variables that are missing). Each one declares `reads: ["process"]` and `writes: []`.

A secret is a variable whose name matches `*_TOKEN`, `*_KEY`, `*_SECRET` or `*PASSWORD*`, without regard to case. `env.get` masks a secret: the output has `masked: true` and no value. `env.list` does not give the value of a secret at any time. `createEnvModule({ secretPatterns, revealSecrets, env })` gives the procedures with more patterns, secrets that `env.get` reveals, or other variables. These procedures are not MCP tools.
