# @procedures/rational

[![npm](https://img.shields.io/npm/v/@procedures/rational?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/rational)

The functions of [`@mark1russell7/rational`](https://www.npmjs.com/package/@mark1russell7/rational) as procedures: exact rationals over `bigint`, always in lowest terms. The package has their sums, products, powers, roots, comparisons and roundings. Each procedure is a typed call, an MCP tool and a CLI command.

No procedure is written by hand. The generator of `@procedures/compiler` reads the types of the library and writes `src/manifest.ts`. Thus a procedure cannot drift from its function.

## Install

```bash
pnpm add @procedures/rational @procedures/client
```

A host registers the procedures with `createRegistry(rationalModule)`, or with `import "@procedures/rational/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

The package has 24 procedures in the namespace `rational`, one for each function of the library. Each procedure has no effects: it reads nothing and writes nothing.

- The input is an object with one property for each parameter of the function, by its name.
- The JSON Schemas of the input and the output come from the types. A named type has one definition in `$defs`.
- A `bigint` is a decimal string in JSON, for example `"9007199254740993"`. The codec of the generator keeps each digit, also past 2^53.
- A rational is the object `{ "n": "3", "d": "2" }`. The procedure decodes it before the call and encodes the result after the call.
- A number in place of a decimal string is not in the schema, so the procedure refuses it.

`rationalManifest` gives the names, the schemas and the effects of each procedure.

## Example

```ts
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { rationalModule } from "@procedures/rational";

const registry = createRegistry(rationalModule);
const output = await invokePath(["rational", "add"], { a: { n: "1", d: "3" }, b: { n: "1", d: "6" } }, { registry });
const value = await outputValue(output); // { n: "1", d: "2" }
```

## The functions with no procedure

Each function of the library has a procedure. The values `ONE` and `ZERO` are not functions, so they have no procedure.

## Update the manifest

After an update of `@mark1russell7/rational`, start this command from the root of the repository:

```bash
node scripts/wraps.ts generate --package rational
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
