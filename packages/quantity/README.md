# @procedures/quantity

[![npm](https://img.shields.io/npm/v/@procedures/quantity?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/quantity)

The functions of [`@mark1russell7/quantity`](https://www.npmjs.com/package/@mark1russell7/quantity) as procedures: amounts in typed units, the conversions between units, sums and means, and the text of an amount. Each procedure is a typed call, an MCP tool and a CLI command.

No procedure is written by hand. The generator of `@procedures/compiler` reads the types of the library and writes `src/manifest.ts`. Thus a procedure cannot drift from its function.

## Install

```bash
pnpm add @procedures/quantity @procedures/client
```

A host registers the procedures with `createRegistry(quantityModule)`, or with `import "@procedures/quantity/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

The package has 27 procedures in the namespace `quantity`, one for each function of the library with JSON inputs and a JSON output. Each procedure has no effects: it reads nothing and writes nothing.

- The input is an object with one property for each parameter of the function, by its name.
- The JSON Schemas of the input and the output come from the types. A named type has one definition in `$defs`.
- A `Quantity` is `{ value, unit }`, for example `{ "value": 1500, "unit": "ms" }`.
- A conversion between two units of different kinds throws an error. The procedure `whyNotConvertible` gives the reason as text.

`quantityManifest` gives the names, the schemas and the effects of each procedure.

## Example

```ts
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { quantityModule } from "@procedures/quantity";

const registry = createRegistry(quantityModule);
const output = await invokePath(["quantity", "convert"], { amount: { value: 1500, unit: "ms" }, to: "s" }, { registry });
const value = await outputValue(output);
```

## The functions with no procedure

5 functions of the library have no procedure. The manifest gives each with its reason:

| Functions | Reason | The cause |
| --- | --- | --- |
| `convertExact`, `unitSystem` | `input-not-json` | An input holds a `bigint`: the exact factor of a unit. JSON has no `bigint`. |
| `lookupAtom`, `parseUnit`, `tryParseUnit` | `output-not-json` | The result holds a `bigint`: the exact factor of a unit. |

## Update the manifest

After an update of `@mark1russell7/quantity`, start this command from the root of the repository:

```bash
node scripts/wraps.ts generate --package quantity
```

The command writes `src/manifest.ts`. It also raises the ratchet of the library in `wraps.coverage.json`. CI starts `node scripts/wraps.ts check`. The check fails when the manifest is not current, or when the share of the functions with a procedure falls.

The release train starts the root script `release-train:update` after it updates a general package. When the check fails, the script starts `node scripts/wraps.ts generate` for all wraps.

## The gate of a pure wrap

The wrap is pure: its `wrap.json` has `"pure": true`. So `node scripts/wraps.ts check` also examines these conditions:

- Each procedure has no effects.
- The field `client.browser` lists `.`, `./module` and `./register`.
- A program of `wraps.programs.json` uses a procedure of the wrap.

The programs of `wraps.programs.json`, at the root of the repository, use the procedures of the pure wraps, also across libraries. The check starts each program two times. The two results must be equal, and equal to the recorded result.

## License

MIT
