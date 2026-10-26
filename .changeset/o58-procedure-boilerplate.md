---
"@procedures/archive": patch
"@procedures/claude-cli": patch
"@procedures/client": patch
"@procedures/cli-run": patch
"@procedures/cue": patch
"@procedures/dag": patch
"@procedures/docker": patch
"@procedures/fs": patch
"@procedures/git": patch
"@procedures/lib": patch
"@procedures/mcp-server": patch
"@procedures/mongo": patch
"@procedures/node": patch
"@procedures/pnpm": patch
"@procedures/procedure": patch
"@procedures/s3": patch
"@procedures/peer": patch
"@procedures/shell": patch
"@procedures/snapshot": patch
"@procedures/sqlite": patch
"@procedures/store": patch
"@procedures/vite": patch
"@procedures/vitest": patch
"@procedures/compiler": patch
"@procedures/env": patch
"@procedures/exif": patch
"@procedures/geo": patch
"@procedures/gh": patch
"@procedures/http": patch
"@procedures/ics": patch
"@procedures/ios-backup": patch
"@procedures/json": patch
"@procedures/llm": patch
"@procedures/mail": patch
"@procedures/mark": patch
"@procedures/notify": patch
"@procedures/npm": patch
"@procedures/pdf": patch
"@procedures/privacy-scan": patch
"@procedures/restic": patch
"@procedures/schedule": patch
"@procedures/server": patch
"@procedures/systems": patch
"@procedures/tailscale": patch
"@procedures/weather": patch
"@procedures/splay": patch
---

Less boilerplate in each procedure definition (dedupe review F1, tracker item O58).

PATCH (pre-1.0): this change adds exports and deprecates names. It removes no export and changes no behavior.

- `@procedures/client` has the new export `typed<T>()`. It is the one pass-through schema that gives only the type `T`.
- `@procedures/client` has the new export `definePackage(name, procedures, requires?)`. It gives `{ module, register }` and registers nothing at the call. The new type `PackageDefinition` is its result.
- `zodAdapter` is deprecated. `input()` and `output()` take each Standard Schema and infer its type, so a zod schema goes in directly.
- `typedAnySchema` and `outputSchema` are deprecated. Use `typed<T>()`. They give the same pass-through schema.
- The procedures of the packages give their zod schemas to `input()` and `output()` directly. The `.build() as AnyProcedure` casts are gone. The schemas, the types of the exports and the validation do not change.
- `mark procedure new` writes `.input(<Name>InputSchema)` and `.output(<Name>OutputSchema)`, without `zodAdapter`.

Migration:

- The site, MiniMongo, Graph and jarvis: no change at this time. The deprecated names work until the next MINOR.
- Before the next MINOR, replace `zodAdapter<T>(schema)` with `schema`. To keep the check of a schema against a type, write `const schema: z.ZodType<T> = ...`.
- Before the next MINOR, replace `typedAnySchema<T>()` and `outputSchema<T>()` with `typed<T>()`.
- A parse-only object (`{ parse }`) in `zodAdapter` becomes a Standard Schema with a `~standard` property.
