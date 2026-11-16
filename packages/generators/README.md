# @procedures/generators

[![npm](https://img.shields.io/npm/v/@procedures/generators?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/generators)

The functions of [`@mark1russell7/rigor-generators`](https://www.npmjs.com/package/@mark1russell7/rigor-generators) as procedures: seeds, hashes, canonical JSON, distributions and the shrink of a failed point. Each procedure is a typed call, an MCP tool and a CLI command.

No procedure is written by hand. The generator of `@procedures/compiler` reads the types of the library and writes `src/manifest.ts`. Thus a procedure cannot drift from its function.

## Install

```bash
pnpm add @procedures/generators @procedures/client
```

A host registers the procedures with `createRegistry(generatorsModule)`, or with `import "@procedures/generators/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

The package has 17 procedures in the namespace `generators`, one for each function of the library with JSON inputs and a JSON output. Each procedure has no effects: it reads nothing and writes nothing.

- The input is an object with one property for each parameter of the function, by its name.
- The JSON Schemas of the input and the output come from the types. A named type, for example `DistributionSpec`, has one definition in `$defs`.
- A function parameter is a sub-program: one call of a pure procedure, as data. The `keyOf` of `stablePick` is an example.

`generatorsManifest` gives the names, the schemas and the effects of each procedure.

## Example

```ts
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { generatorsModule } from "@procedures/generators";

const registry = createRegistry(generatorsModule);
const output = await invokePath(["generators", "deriveSeed"], { seed: 7, label: "run" }, { registry });
const seed = await outputValue(output);
```

## The functions with no procedure

14 functions of the library have no procedure. The manifest gives each with its reason:

| Functions | Reason | The cause |
| --- | --- | --- |
| `coveringArray`, `coveringRows`, `distributionOf`, `familyMap`, `familyPoints`, `latinHypercube`, `randomDesign`, `saltelliDesign`, `sampler`, `stratifiedDesign` | `input-not-json` | The parameter `r` is a `Random`: an object with methods. |
| `mulberry32`, `random`, `randomOf` | `output-not-json` | The result is a function or a `Random`. |
| `shrinkPointAsync` | `function-parameter` | The function `fails` can give a promise. |

## Update the manifest

After an update of `@mark1russell7/rigor-generators`, start this command from the root of the repository:

```bash
node scripts/wraps.ts generate --package generators
```

The command writes `src/manifest.ts`. It also raises the ratchet of the library in `wraps.coverage.json`. CI starts `node scripts/wraps.ts check`. The check fails when the manifest is not current, or when the share of the functions with a procedure falls.

## The gate of a pure wrap

The wrap is pure: its `wrap.json` has `"pure": true`. So `node scripts/wraps.ts check` also examines these conditions:

- Each procedure has no effects.
- The field `client.browser` lists `.`, `./module` and `./register`.
- A program of `wraps.programs.json` uses a procedure of the wrap.

The programs of `wraps.programs.json`, at the root of the repository, use the procedures of the pure wraps, also across libraries. The check starts each program two times. The two results must be equal, and equal to the recorded result. An update of a library can change a result on purpose. Then start `node scripts/wraps.ts generate` with no `--package`. Give the reason in the pull request.

## License

MIT
