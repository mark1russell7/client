# @procedures/vite

## 0.47.0

### Patch Changes

- Updated dependencies [2f0c7b0]
  - @procedures/client@0.47.0
  - @procedures/shell@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [10dcc3c]
  - @procedures/client@0.46.0
  - @procedures/shell@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [fbb50fa]
- Updated dependencies [845902b]
- Updated dependencies [70b2245]
  - @procedures/client@0.45.0
  - @procedures/shell@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [4dada47]
- Updated dependencies [19b7a25]
  - @procedures/client@0.44.0
  - @procedures/shell@0.44.0

## 0.43.0

### Patch Changes

- @procedures/client@0.43.0
  - @procedures/shell@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [7ca9953]
- Updated dependencies [226ae02]
- Updated dependencies [e4cb0cf]
  - @procedures/client@0.42.0
  - @procedures/shell@0.42.0

## 0.41.1

### Patch Changes

- Updated dependencies [69cee92]
  - @procedures/client@0.41.1
  - @procedures/shell@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies [37deb07]
- Updated dependencies [fc52431]
  - @procedures/client@0.41.0
  - @procedures/shell@0.41.0

## 0.40.0

### Patch Changes

- @procedures/client@0.40.0
  - @procedures/shell@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [55d1e4d]
  - @procedures/client@0.39.0
  - @procedures/shell@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [c6fba49]
  - @procedures/client@0.38.0
  - @procedures/shell@0.38.0

## 0.37.0

### Patch Changes

- @procedures/client@0.37.0
  - @procedures/shell@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [f1fae86]
  - @procedures/client@0.36.0
  - @procedures/shell@0.36.0

## 0.35.1

### Patch Changes

- cc80f74: PATCH: internal, no change to the public API. The procedure boilerplate of tracker item O65, after O58.
  
  - The `src/module.ts` of 37 packages gives its module and its register function with `definePackage()`. Each export keeps its name, its type and its behavior. The root and `./module` register nothing. `./register` registers in the global registry, as before.
  - The output schemas of `ics.parse`, `ics.fetch`, `json.query`, `json.patch`, `json.merge` and `yaml.parse` have the type of the declared output (`z.ZodType<T>`). The validation and the JSON Schema stay the same.
  - The `described()` helper of `@procedures/mongo` uses `typed<T>()` instead of the deprecated `zodAdapter()`. Its schemas validate and describe the input as before.
- Updated dependencies [9f0405d]
- Updated dependencies [f5c2407]
- Updated dependencies [cc80f74]
  - @procedures/client@0.35.1
  - @procedures/shell@0.35.1

## 0.35.0

### Patch Changes

- 0b0cb42: One CLI-tool runner in `@procedures/shell` (dedupe review F2, tracker item O60).
  
  PATCH: new exports `defineCliTool` and `./testing`, no break. Before 1.0.0, a feature raises the PATCH, and the fixed group shares one version.
  
  - The new entry `@procedures/shell/cli` gives `defineCliTool({ name, resolve, error })`. Its runner has `run`, `runJson`, `output`, `json`, `arg` and `shellInput`. Each command goes as argv to `shell.run` through `ctx.client`, never as a shell string.
  - The entry also gives `cliArg()`, `buildArgv()`, `parseJsonDocument()`, `parseJsonOutput()`, the shared result `CliToolOutput` with `cliToolOutputSchema()`, and the program lookup `nodeScript()`, `execPathProgram()` and `findInPath()`. The package root exports them too.
  - The new entry `@procedures/shell/testing` gives `fakeShell(results)`: the shell procedures with their real schemas, effects and root rules, and handlers that record each input. Use `shell.module` in `createRegistry()`, or `shell.client` as `ctx.client`.
  - gh, npm, pnpm, docker and `cli.run` run their program through `defineCliTool()`. Each procedure keeps its path, its schemas, its effects and its behavior. The exported helpers (`resolveNpm`, `resolvePnpm`, the output types and schemas) stay.
  - `PnpmCommandOutput`, `NpmCommandOutput`, `DockerCommandOutput` and `CliRunOutput` extend `CliToolOutput`. Their schemas come from `cliToolOutputSchema()`. The `stderr` description of pnpm and `cli.run` now also names the error message when the program did not start.
  - `@procedures/restic` and `@procedures/tailscale` re-export `buildArgv`, `parseJsonOutput`, `FLAG_NAME` and `ArgValue` from `@procedures/shell/cli`. The two copies of `argv.ts` are gone.
  - `@procedures/vite` and `@procedures/vitest` use `cliArg()` for their argument guard.
  - `SERVER-LAYERS.md` records the one run path of a CLI wrapper, and the reasons.
- Updated dependencies [0b0cb42]
  - @procedures/shell@0.35.0
  - @procedures/client@0.35.0

## 0.34.0

### Patch Changes

- fa1a61a: Less boilerplate in each procedure definition (dedupe review F1, tracker item O58).
  
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
- Updated dependencies [d4376c2]
- Updated dependencies [fa1a61a]
  - @procedures/client@0.34.0
  - @procedures/shell@0.34.0

## 0.33.0

### Patch Changes

- @procedures/client@0.33.0
  - @procedures/shell@0.33.0

## 0.32.0

### Patch Changes

- @procedures/client@0.32.0
  - @procedures/shell@0.32.0

## 0.31.0

### Patch Changes

- @procedures/client@0.31.0
  - @procedures/shell@0.31.0

## 0.30.0

### Patch Changes

- @procedures/client@0.30.0
  - @procedures/shell@0.30.0

## 0.29.0

### Patch Changes

- @procedures/client@0.29.0
  - @procedures/shell@0.29.0

## 0.28.1

### Patch Changes

- Updated dependencies [345c740]
- Updated dependencies [984c13b]
- Updated dependencies [21dc858]
  - @procedures/client@0.28.1
  - @procedures/shell@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [06694d7]
  - @procedures/client@0.28.0
  - @procedures/shell@0.28.0

## 0.27.8

### Patch Changes

- Updated dependencies [1834a5e]
  - @procedures/shell@0.27.8
  - @procedures/client@0.27.8

## 0.27.7

### Patch Changes

- @procedures/client@0.27.7
  - @procedures/shell@0.27.7

## 0.27.6

### Patch Changes

- Updated dependencies [d322bef]
  - @procedures/client@0.27.6
  - @procedures/shell@0.27.6

## 0.27.5

### Patch Changes

- @procedures/shell@0.27.5
  - @procedures/client@0.27.5

## 0.27.4

### Patch Changes

- Updated dependencies [8970a1e]
  - @procedures/client@0.27.4
  - @procedures/shell@0.27.4

## 0.27.3

### Patch Changes

- @procedures/shell@0.27.3
  - @procedures/client@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2
  - @procedures/shell@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1
  - @procedures/shell@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0
  - @procedures/shell@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2
  - @procedures/shell@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1
  - @procedures/shell@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0
  - @procedures/shell@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0
  - @procedures/shell@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1
  - @procedures/shell@0.24.1

## 0.24.0

### Patch Changes

- @procedures/client@0.24.0
  - @procedures/shell@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0
  - @procedures/shell@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1
  - @procedures/shell@0.22.1

## 0.22.0

### Patch Changes

- @procedures/client@0.22.0
  - @procedures/shell@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0
  - @procedures/shell@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0
  - @procedures/shell@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0
  - @procedures/shell@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1
  - @procedures/shell@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0
  - @procedures/shell@0.18.0

## 0.17.4

### Patch Changes

- @procedures/client@0.17.4
  - @procedures/shell@0.17.4

## 0.17.3

### Patch Changes

- @procedures/client@0.17.3
  - @procedures/shell@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2
  - @procedures/shell@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1
  - @procedures/shell@0.17.1

## 0.17.0

### Patch Changes

- @procedures/client@0.17.0
  - @procedures/shell@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0
  - @procedures/shell@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1
  - @procedures/shell@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0
  - @procedures/shell@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
- Updated dependencies [50d5453]
  - @procedures/client@0.14.1
  - @procedures/shell@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0
  - @procedures/shell@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2
  - @procedures/shell@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1
  - @procedures/shell@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0
  - @procedures/shell@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2
  - @procedures/shell@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1
  - @procedures/shell@0.12.1

## 0.12.0

### Patch Changes

- @procedures/client@0.12.0
  - @procedures/shell@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/client@0.11.0
  - @procedures/shell@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0
  - @procedures/shell@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2
  - @procedures/shell@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1
  - @procedures/shell@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0
  - @procedures/shell@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1
  - @procedures/shell@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0
  - @procedures/shell@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0
  - @procedures/shell@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0
  - @procedures/shell@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0
  - @procedures/shell@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4c51727]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/shell@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
  - @procedures/shell@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3
  - @procedures/shell@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2
  - @procedures/shell@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1
  - @procedures/shell@0.2.1

## 0.2.0

### Minor Changes

- 76d0d64: **Breaking:** an import of a package registers nothing. The `./register` entry of a package registers its procedures, and the procedures of the modules that they need, in the global registry (ARCHITECTURE-PROPOSALS-2026-10, P9).
  
  - `import "@procedures/git"` gives the exports and registers nothing. Use `import "@procedures/git/register"`, or give `gitModule` (`@procedures/git/module`) to `createRegistry()`.
  - `import "@procedures/client/register"` registers the control flow (`client.chain` and the others) and `procedure.define`/`get`/`list`/`delete`. `createRegistry()` adds them to each new registry, as before. The new `registerClientProcedures(registry?)` does the same for any registry.
  - Each `register<Name>Procedures(registry?)` function is in the module of its package, takes a registry (the global one by default) and registers the modules that the package requires. `registerBridge` (splay) and `register` (store) are now `registerSplayProcedures` and `registerStoreProcedures`. The old names stay for one version.
  - `sideEffects` names only `./dist/register.js`, so a bundler can drop the rest of a package.
  - The bundles require `clientModule`, so `@procedures/bundle-mcp/register` gives the whole tool surface.
  - `lib new` makes `src/module.ts` and a root without side effects, and `procedure new` adds procedures to the module.

### Patch Changes

- Updated dependencies [0cf4bea]
- Updated dependencies [44d3e30]
- Updated dependencies [76d0d64]
  - @procedures/client@0.2.0
  - @procedures/shell@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
