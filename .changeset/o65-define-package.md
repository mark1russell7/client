---
"@procedures/bundle-assistant": patch
"@procedures/bundle-dev": patch
"@procedures/bundle-mcp": patch
"@procedures/claude-cli": patch
"@procedures/cli-run": patch
"@procedures/cue": patch
"@procedures/dag": patch
"@procedures/docker": patch
"@procedures/git": patch
"@procedures/lib": patch
"@procedures/mcp-server": patch
"@procedures/mongo": patch
"@procedures/node": patch
"@procedures/pnpm": patch
"@procedures/s3": patch
"@procedures/peer": patch
"@procedures/shell": patch
"@procedures/snapshot": patch
"@procedures/sqlite": patch
"@procedures/vite": patch
"@procedures/vitest": patch
"@procedures/compiler": patch
"@procedures/exif": patch
"@procedures/geo": patch
"@procedures/gh": patch
"@procedures/ics": patch
"@procedures/ios-backup": patch
"@procedures/json": patch
"@procedures/mail": patch
"@procedures/notify": patch
"@procedures/npm": patch
"@procedures/pdf": patch
"@procedures/privacy-scan": patch
"@procedures/server": patch
"@procedures/systems": patch
"@procedures/tailscale": patch
"@procedures/weather": patch
---

PATCH: internal, no change to the public API. The procedure boilerplate of tracker item O65, after O58.

- The `src/module.ts` of 37 packages gives its module and its register function with `definePackage()`. Each export keeps its name, its type and its behavior. The root and `./module` register nothing. `./register` registers in the global registry, as before.
- The output schemas of `ics.parse`, `ics.fetch`, `json.query`, `json.patch`, `json.merge` and `yaml.parse` have the type of the declared output (`z.ZodType<T>`). The validation and the JSON Schema stay the same.
- The `described()` helper of `@procedures/mongo` uses `typed<T>()` instead of the deprecated `zodAdapter()`. Its schemas validate and describe the input as before.
