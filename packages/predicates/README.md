# @procedures/predicates

[![npm](https://img.shields.io/npm/v/@procedures/predicates?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/predicates)

The functions of [`@mark1russell7/predicates`](https://www.npmjs.com/package/@mark1russell7/predicates) as procedures: robust geometric predicates: the orientation of three points, the in-circle test and the classification of two segments. The sign is exact, also where the floating-point determinant rounds to the wrong sign. Each procedure is a typed call, an MCP tool and a CLI command.

No procedure is written by hand. The generator of `@procedures/compiler` reads the types of the library and writes `src/manifest.ts`. Thus a procedure cannot drift from its function.

## Install

```bash
pnpm add @procedures/predicates @procedures/client
```

A host registers the procedures with `createRegistry(predicatesModule)`, or with `import "@procedures/predicates/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

The package has 13 procedures in the namespace `predicates`, one for each function of the library with JSON inputs and a JSON output. Each procedure has no effects: it reads nothing and writes nothing.

- The input is an object with one property for each parameter of the function, by its name.
- The JSON Schemas of the input and the output come from the types. A named type has one definition in `$defs`.
- Each coordinate is one number property, for example `ax` and `ay` for the point `a`.
- The procedures `orient2dSign` and `incircleSign` give -1, 0 or 1. The procedures `orient2d` and `incircle` also give the stage of the filter that decided the sign.

`predicatesManifest` gives the names, the schemas and the effects of each procedure.

## Example

```ts
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { predicatesModule } from "@procedures/predicates";

const registry = createRegistry(predicatesModule);
const output = await invokePath(["predicates", "orient2dSign"], { ax: 0, ay: 0, bx: 10, by: 10, cx: 3, cy: 6 }, { registry });
const value = await outputValue(output);
```

## The functions with no procedure

Each function of the library has a procedure.

## Update the manifest

After an update of `@mark1russell7/predicates`, start this command from the root of the repository:

```bash
node scripts/wraps.ts generate --package predicates
```

The command writes `src/manifest.ts`. It also raises the ratchet of the library in `wraps.coverage.json`. CI starts `node scripts/wraps.ts check`. The check fails when the manifest is not current, or when the share of the functions with a procedure falls.

## The gate of a pure wrap

The wrap is pure: its `wrap.json` has `"pure": true`. So `node scripts/wraps.ts check` also examines these conditions:

- Each procedure has no effects.
- The field `client.browser` lists `.`, `./module` and `./register`.
- A program of `wraps.programs.json` uses a procedure of the wrap.

The programs of `wraps.programs.json`, at the root of the repository, use the procedures of the pure wraps, also across libraries. The check starts each program two times. The two results must be equal, and equal to the recorded result.

## License

MIT
