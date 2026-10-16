---
"@procedures/client": minor
"@procedures/bundle-dev": minor
"@procedures/bundle-mcp": minor
"@procedures/cli-run": minor
"@procedures/cue": minor
"@procedures/docker": minor
"@procedures/fs": minor
"@procedures/git": minor
"@procedures/lib": minor
"@procedures/mcp-server": minor
"@procedures/mongo": minor
"@procedures/node": minor
"@procedures/pnpm": minor
"@procedures/procedure": minor
"@procedures/s3": minor
"@procedures/peer": minor
"@procedures/shell": minor
"@procedures/snapshot": minor
"@procedures/splay": minor
"@procedures/sqlite": minor
"@procedures/store": minor
"@procedures/vite": minor
"@procedures/vitest": minor
---

**Breaking:** an import of a package registers nothing. The `./register` entry of a package registers its procedures, and the procedures of the modules that they need, in the global registry (ARCHITECTURE-PROPOSALS-2026-10, P9).

- `import "@procedures/git"` gives the exports and registers nothing. Use `import "@procedures/git/register"`, or give `gitModule` (`@procedures/git/module`) to `createRegistry()`.
- `import "@procedures/client/register"` registers the control flow (`client.chain` and the others) and `procedure.define`/`get`/`list`/`delete`. `createRegistry()` adds them to each new registry, as before. The new `registerClientProcedures(registry?)` does the same for any registry.
- Each `register<Name>Procedures(registry?)` function is in the module of its package, takes a registry (the global one by default) and registers the modules that the package requires. `registerBridge` (splay) and `register` (store) are now `registerSplayProcedures` and `registerStoreProcedures`. The old names stay for one version.
- `sideEffects` names only `./dist/register.js`, so a bundler can drop the rest of a package.
- The bundles require `clientModule`, so `@procedures/bundle-mcp/register` gives the whole tool surface.
- `lib new` makes `src/module.ts` and a root without side effects, and `procedure new` adds procedures to the module.
