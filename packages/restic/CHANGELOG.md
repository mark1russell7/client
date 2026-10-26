# @procedures/restic

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

### Minor Changes

- 73aac16: `restic.run` takes its program from the host, never from the input (audit pass 2, roadmap O55).
  
  MINOR (breaking, pre-1.0): the input `executable` is removed. An input with `executable` now gets a validation error. Before, the input let each caller of `restic.run` start any program of the host, with arguments that it chose.
  
  - New: the option `executable` of `createResticModule()` and `createResticProcedures()`. The default stays the same: `RESTIC_EXE` of the environment of the host, then `restic`.
  - `runRestic(command, { executable })` and `findRestic()` do not change: they are functions of the host, not procedure input.
  
  Migration:
  
  - jarvis: no change. It calls `runRestic()` with the result of `findRestic()`, not `restic.run`.
  - The site, MiniMongo and Graph: no change. They do not call `restic.run`.
  - A host that sent `executable` in the input of `restic.run` gives it to `createResticModule({ executable })`, or sets `RESTIC_EXE`.

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

- 497e32f: New configuration paths for the five breaks of the second code audit (roadmap O55, decision D35). Each old input keeps working, with a deprecation notice.
  
  PATCH: new options and exports, and deprecation notices. No input that works today gets an error. Each notice is a `DeprecationWarning` of Node, one time in each process, and it names the new path.
  
  - `@procedures/tailscale` adds `createTailscaleModule({ executable })` and `createTailscaleProcedures({ executable })`. The order of the program is the input `executable`, then the option, then `TAILSCALE_EXE`, then the Windows install folder, then `tailscale`. The input `executable` is `@deprecated`, with the notice `PROCEDURES_TAILSCALE_EXECUTABLE_INPUT`.
  - `@procedures/restic` adds the option `executable` of `createResticModule()` and `createResticProcedures()`. The input `executable` of `restic.run` wins over it, as before. The input is `@deprecated`, with the notice `PROCEDURES_RESTIC_EXECUTABLE_INPUT`.
  - `@procedures/mail` exports `MAIL_PASSWORD_ENV`, the pattern of the names of `passwordEnv`: `IMAP_` or `MAIL_` and more. Another name still works, with the notice `PROCEDURES_MAIL_PASSWORD_ENV`.
  - `@procedures/notify` exports `NOTIFY_TOKEN_ENV`, the pattern of the names of `tokenEnv`: `NTFY_` or `NOTIFY_` and more. Another name still works, with the notice `PROCEDURES_NOTIFY_TOKEN_ENV`.
  
  The breaks that come next. Each break is its own MINOR, and the group is released after each one.
  
  1. 0.29.0, the host fetch policy: `weather.forecast` and the `mcpHostModules` of `geo` and `ics` refuse a loopback, private or link-local host with `FORBIDDEN`. The option `warnOnRefusal` of `createHostFetch()` goes away.
     - The site, MiniMongo and Graph: no change. They do not call these procedures through a registry of Node.
     - jarvis: no change. `packages/pipeline` calls the function `geocode()` of `@procedures/geo`, not the procedure.
     - Another host with a private server gives `createWeatherModule({ fetch: createHostFetch({ allow: [...] }) })`, or the same for `createGeoModule()` and `createIcsModule()`, before the bundle.
  2. 0.30.0, `tailscale.run` (#182): the input `executable` gets a validation error.
     - jarvis: `packages/instance/src/remote.ts` sends `executable: bin`. Make the caller from `createTailscaleModule({ executable: bin })` in place of `tailscaleModule`, and remove `executable` from the input. Or set `TAILSCALE_EXE` from `JARVIS_TAILSCALE_BIN`.
     - The site, MiniMongo and Graph: no change. They do not call `tailscale.run`.
  3. 0.31.0, `restic.run` (#183): the input `executable` gets a validation error.
     - jarvis: no change. It calls `runRestic()` with the result of `findRestic()`, not `restic.run`.
     - The site, MiniMongo and Graph: no change. They do not call `restic.run`.
     - Another host gives the program to `createResticModule({ executable })`, or sets `RESTIC_EXE`.
  4. 0.32.0, `mail.headers` (#184): a `passwordEnv` without the prefix `IMAP_` or `MAIL_` gets a validation error.
     - The site, MiniMongo, Graph and jarvis: no change. They do not call `mail.headers`.
     - Another host renames the variable, for example `GMAIL_APP_PASSWORD` to `IMAP_GMAIL_PASSWORD`, and gives the new name in `passwordEnv`.
  5. 0.33.0, `notify.send` (#185): a `tokenEnv` without the prefix `NTFY_` or `NOTIFY_` gets a validation error.
     - The site, MiniMongo, Graph and jarvis: no change. They do not give `tokenEnv`.
     - Another host renames the variable, for example `PHONE_TOKEN` to `NTFY_TOKEN`, and gives the new name in `tokenEnv`.
  
  Migration now: a host that gets a notice changes to the new path that the notice names. The notice then stops, and the next break does not change the host.
- 21dc858: Fixes for the security findings of the second code audit (roadmap O55).
  
  PATCH: bug fixes and additive options. Each fix refuses only an input that the documentation does not give. A caller that uses the documented behavior sees no change. A request to a loopback, private or link-local host still works, with a deprecation notice. Version 0.29.0 refuses it (decision D35).
  
  - `procedure.delete` and `procedure.define` of `@procedures/client` obey the expose rule of the host, as `procedure.get` does (R17). `procedure.delete` does not find a hidden procedure, and `procedure.define` refuses to replace one with `NOT_EXPOSED`. A new procedure at a free path stays possible, as before. Before, a caller could remove or replace a hidden procedure that the host defined.
  - The task store of `@procedures/mcp-server` keeps a task without a session (stdio, an SDK transport) apart from the HTTP sessions, both ways. Before, each HTTP session could list, read and cancel such a task.
  - `restic.run` of `@procedures/restic` refuses each input that lets the caller choose a program for restic to start: `--from-password-command`, `--password-command2`, an extended option that sets `sftp.command`, `sftp.args`, `rclone.program` or `rclone.args` (each spelling), an sftp or rclone repository whose host or remote starts with `-`, and a positional argument that starts with `-` after a last flag without a value. Before, only `--password-command` was refused.
  - `@procedures/http` exports `createHostFetch(options)`: a `fetch` for GET requests through the host policy, with the options of `createHttpModule()`. It also exports `httpSettings(options)`. The deprecated option `warnOnRefusal` keeps a refused host working: the process gets one `DeprecationWarning`, and the request goes through the global `fetch`.
  - `weather.forecast` of `@procedures/weather` sends its request through `createHostFetch()` with `warnOnRefusal`. A `baseUrl` on a loopback, private or link-local address still works, with the warning `PROCEDURES_WEATHER_PRIVATE_HOST`. `createWeatherModule({ fetch })` gives another `fetch`, for a server of the host on such an address.
  - `@procedures/geo` and `@procedures/ics` add `createGeoModule({ fetch })` and `createIcsModule({ fetch })`. Their default stays the global `fetch`, because their roots run in a browser. A refusal of the host policy keeps its code and its reason. The refusal of `ics.fetch` does not name the feed address.
  - `@procedures/bundle-assistant` exports `mcpHostModules`: the modules of `geo` and `ics` with `createHostFetch()` and `warnOnRefusal`. A refused host gets the warning `PROCEDURES_GEO_PRIVATE_HOST` or `PROCEDURES_ICS_PRIVATE_HOST`. The bundle keeps the default modules, so `mark` and the site load it next to `geo` and `ics` as before.
  - The dev-tools server of `@procedures/mcp-dev-tools` gives the `mcpHostModules` of each bundle to `createRegistry()` before the bundles. In one call, the first module of a name counts. Thus `geo.geocode`, `geo.route`, `weather.forecast` and `ics.fetch` of the dev-tools server go through the default host policy.
  
  A host that sends `weather.forecast`, or the bundle's `geo` tools, to a server on a private address can remove the warning now. It gives a `fetch` that allows the server: `createWeatherModule({ fetch: createHostFetch({ allow: ["10.0.0.5:8080"] }) })`. This `fetch` refuses each other private host now, as 0.29.0 does by default.
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

### Minor Changes

- a5f28e5: A host can give secrets only to the restic process, and the package root exports the functions of `restic.run`.
  
  - `runRestic(command, options)` starts a restic command and reads its JSON output. Its `env` option gives variables (for example `RESTIC_PASSWORD`, `RESTIC_REPOSITORY` and `B2_ACCOUNT_ID`) only to the restic process. The environment of the host does not change.
  - `createResticModule({ env, run })` gives the module with those settings. The procedure input still has no field for a secret.
  - `findRestic()` finds the program: `RESTIC_EXE`, then on Windows the `restic*.exe` of a WinGet package, then `restic` on the `PATH`.
  - The `run` option replaces the function that starts restic, so a test can give a fake runner.
  
  The input, the output and the effects of `restic.run` do not change.

### Patch Changes

- ae08311: `runRestic` takes `maxOutputBytes`, and the result has `truncated` when an output stream was longer. `restic ls` of a large snapshot can give more than the default of 64 MiB.
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

- 5e2ba76: New package: `restic.run` runs a restic command with JSON output. The repository keys come from the environment.

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
