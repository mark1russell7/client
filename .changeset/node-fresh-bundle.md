---
"@procedures/node": patch
---

New subpath `@procedures/node/fresh-bundle` (roadmap O49): a launcher that starts a TypeScript entry from an esbuild bundle in a cache folder. It comes from jarvis (jarvis#80).

- `launch(spec)` starts the last build only when each source and each file of `spec.inputs` has the content hash of the build. Otherwise it makes a new build in a child process. When the build fails, it starts the source through `tsx`.
- `freshEntry(spec)` gives the entry file of the fresh build, or `undefined`. `build(spec)` makes a build in this process.
- `esbuild` and `tsx` are optional peer dependencies. The package root does not load the subpath, and an import of the root does not need them.

This release changes no behavior of the procedures. jarvis can import `launch` from `@procedures/node/fresh-bundle` and remove its copy of `fresh-bundle.mjs`.
