# @procedures/optional

[![npm](https://img.shields.io/npm/v/@procedures/optional?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/optional)

The functions of [`@mark1russell7/optional`](https://www.npmjs.com/package/@mark1russell7/optional) as procedures: a value that is present or absent (`Optional`), and a value or an error (`Result`). Each procedure is a typed call, an MCP tool and a CLI command.

No procedure is written by hand. The generator of `@procedures/compiler` reads the types of the library and writes `src/manifest.ts`. Thus a procedure cannot drift from its function.

## Install

```bash
pnpm add @procedures/optional @procedures/client
```

A host registers the procedures with `createRegistry(optionalModule)`, or with `import "@procedures/optional/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

The package has 20 procedures in the namespace `optional`, one for each function of the library with JSON inputs and a JSON output. Each procedure has no effects: it reads nothing and writes nothing.

- The input is an object with one property for each parameter of the function, by its name.
- The JSON Schemas of the input and the output come from the types. A named type has one definition in `$defs`.
- An `Optional` is `{ "tag": "some", "value": ... }` or `{ "tag": "none" }`. A `Result` is `{ "tag": "ok", "value": ... }` or `{ "tag": "err", "error": ... }`.
- The function of `map`, `flatMap`, `mapResult` and `mapErr` is a sub-program: one call of a pure procedure, as data. It reads the value as `{ "$ref": "v" }`, and the error of `mapErr` as `{ "$ref": "e" }`.

`optionalManifest` gives the names, the schemas and the effects of each procedure.

## Example

```ts
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { optionalModule } from "@procedures/optional";

const registry = createRegistry(optionalModule);
const output = await invokePath(["optional", "fromNullable"], { value: 1500 }, { registry });
const value = await outputValue(output);
```

## The functions with no procedure

3 functions of the library have no procedure. The manifest gives each with its reason:

| Functions | Reason | The cause |
| --- | --- | --- |
| `filter`, `tryCatch`, `tryCatchAsync` | `overload` | The function has 2 signatures. A procedure has one input schema. |

## Update the manifest

After an update of `@mark1russell7/optional`, start this command from the root of the repository:

```bash
node scripts/wraps.ts generate --package optional
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
