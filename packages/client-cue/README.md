# @procedures/cue

[![npm](https://img.shields.io/npm/v/@procedures/cue?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/cue)

```sh
npm install @procedures/cue
```

`client-cue` gives the commands of `cue-config` as procedures. `cue-config` is the configuration generator of the general package `cue`: it writes `package.json`, `tsconfig.json` and `.gitignore` from a list of features in `dependencies.json`.

| Procedure | Input | Function |
|---|---|---|
| `cue.init` | `preset` (default `lib`), `force`, `cwd` | Write `dependencies.json` with the features of a preset |
| `cue.add` | `feature`, `cwd` | Add a feature to `dependencies.json` |
| `cue.remove` | `feature`, `cwd` | Remove a feature from `dependencies.json` |
| `cue.generate` | `cwd` | Write `package.json`, `tsconfig.json` and `.gitignore` from the features |
| `cue.validate` | `cwd` | Examine `dependencies.json` |

All five procedures are tools of the MCP server.

## Use

```typescript
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@procedures/client";
import "@procedures/cue/register"; // registers cue.* and fs.*

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

await client.exec(["cue", "init"], { preset: "lib", cwd: "packages/my-package" });
await client.exec(["cue", "add"], { feature: "node", cwd: "packages/my-package" });
const result = await client.exec(["cue", "generate"], { cwd: "packages/my-package" });
console.log(result.resolvedFeatures, result.generated);
```

In the monorepo, `lib new` starts `cue-config` for a new package. To change the configuration of a package, start `npx cue-config add <feature>` and `npx cue-config generate` in its folder, or use these procedures.

## Presets and features

| Preset | Features |
|---|---|
| `lib` | `ts`, `cue`, `vitest` |
| `react-lib` | `react`, `cue`, `vitest` |
| `app` | `vite-react`, `cue`, `vitest` |

| Feature | Depends on |
|---|---|
| `git` | none |
| `npm` | `git` |
| `ts` | `npm` |
| `node` | `ts` |
| `node-cjs` | `ts` |
| `react` | `ts` |
| `vite` | `ts` |
| `vite-react` | `vite`, `react` |
| `cue` | `npm` |
| `vitest` | `ts` |

`cue.generate` adds the features that each feature depends on. The `features.json` file of the `cue` package is the source of these tables.

## How `cue.generate` works

1. It reads `dependencies.json` and adds the dependencies of each feature.
2. It starts the CUE binary (`cue eval`) on the CUE files of the features, through `runCommand()` of `client-shell`, with no shell. Install CUE before you use the procedure.
3. It merges the result with the existing `package.json`. The fields of the package win for the name, the version, the description, and the entry points (`exports`, `main`, `types`, `bin`, `sideEffects`). The procedure merges the scripts and the development dependencies.
4. It writes `tsconfig.json`, which extends the preset of the features, and `.gitignore`.

The procedures read and write files through the `fs.*` procedures, so `client-cue` registers `client-fs`. A file error is an error of the procedure (deep dive WRP-3).

## Related packages

- `cue` (general repository): the CUE files, `features.json` and the `cue-config` CLI.
- `client-lib`: `lib.new`, which uses `cue-config`.
