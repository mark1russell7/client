# @procedures/gh

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

- b5db4d8: The other procedures that reach files declare their rules under a root of the files in `metadata.fsRoot` (roadmap R33, tracker item O36). Without a root, nothing changes. PATCH: each procedure was refused under a root before, and now it is confined, or it is refused with a reason.
  
  - Confined: `s3.download` (`destPath`), `s3.presign` (no path input), `exif.read` (`path`), `privacyScan.files` (`paths`, `termsFile`, `allowFile`), `claude.read` and `claude.follow` (`outputFile`), and `manifest.generate` (`outputDir`).
  - Confined with no path input, because the store of the host holds the data: `schedule.add`, `schedule.list`, `schedule.remove`, `procedure.store`, `procedure.load` and `procedure.sync`.
  - Confined: each `gh.*` procedure starts gh in a working folder of the root, and the `dir` of `gh.run.download` is in the root. Its nested `shell.run` now runs under a root. `GIT_DIR` is the null device, so the git of gh finds no repository: give `repo`.
  - Refused, with the reason in the rules: `snapshot.create`, `snapshot.restore`, `snapshot.diff`, `iosBackup.*`, `claude.start`, `server.start`, `server.stop` and `server.status`.
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

### Minor Changes

- 2c02cf0: Three new procedures: `gh.workflow.run`, `gh.run.download` and `gh.api`.
  
  - `gh.workflow.run` starts a workflow run on a ref, with each input as `-f key=value`. When `gh` prints the URL of the new run, the output has `url` and `run`. It declares `writes: ["network"]`, and it is not destructive.
  - `gh.run.download` downloads the artifacts of a run into `dir`, by `names` or `patterns`. It declares `writes: ["fs"]`. `gh` does not replace a file that exists, so it is not destructive.
  - `gh.api` sends a request to the GitHub API and gives the parsed JSON as `data`. It always sends `--method` (default `GET`). A string field goes as `-f`, another value as `-F`. A JSON `body` goes as `--input` from a temporary file. `paginate` joins the pages of an array. `repo` goes to `gh` as `GH_REPO`.
  - The method of `gh.api` is an input, and `PUT` or `DELETE` can replace or remove data. Thus `gh.api` declares `writes: ["network"]` and is destructive.
  
  These procedures are not MCP tools.

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

### Minor Changes

- 49de6a8: The GitHub CLI as procedures (roadmap R42). `@procedures/gh` has 13 procedures for pull requests, workflow runs, releases and issues: `gh.pr.list`, `gh.pr.view`, `gh.pr.checks`, `gh.pr.create`, `gh.run.list`, `gh.run.view`, `gh.run.rerun`, `gh.release.list`, `gh.release.view`, `gh.issue.list`, `gh.issue.view`, `gh.issue.create` and `gh.issue.comment`. Each one runs `gh` through `shell.run` with an argument list and no shell, and gives the JSON of `gh --json`. The reads change nothing. The writes declare `writes: ["network"]`.

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
