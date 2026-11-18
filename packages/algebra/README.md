# @procedures/algebra

[![npm](https://img.shields.io/npm/v/@procedures/algebra?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/algebra)

The functions of [`@mark1russell7/algebra`](https://www.npmjs.com/package/@mark1russell7/algebra) as procedures: state machines as data, the closed forms of their timers, and failure detection and recovery. It also has models of the network and memory limits of Linux. Each procedure is a typed call, an MCP tool and a CLI command.

No procedure is written by hand. The generator of `@procedures/compiler` reads the types of the library and writes `src/manifest.ts`. Thus a procedure cannot drift from its function.

## Install

```bash
pnpm add @procedures/algebra @procedures/client
```

A host registers the procedures with `createRegistry(algebraModule)`, or with `import "@procedures/algebra/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

The package has 41 procedures in the namespace `algebra`, one for each function of the library with JSON inputs and a JSON output. Each procedure has no effects: it reads nothing and writes nothing.

- The input is an object with one property for each parameter of the function, by its name.
- The JSON Schemas of the input and the output come from the types. A named type has one definition in `$defs`.
- A parameter of the type `KnobValues` is a sub-program: one call of a pure procedure that gives the value of a knob from its name.
- The models of the kernel, for example `netemPacketTime` and `oomBadness`, take numbers and plain records, and give numbers.

`algebraManifest` gives the names, the schemas and the effects of each procedure.

## Example

```ts
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { algebraModule } from "@procedures/algebra";

const registry = createRegistry(algebraModule);
const output = await invokePath(["algebra", "netemPacketTime"], { length: 1514, rate: { rate: 1_250_000 } }, { registry });
const value = await outputValue(output);
```

## The functions with no procedure

5 functions of the library have no procedure. The manifest gives each with its reason:

| Functions | Reason | The cause |
| --- | --- | --- |
| `overValues` | `output-not-json` | The result is a `KnobValues`: a function. |
| `parseExpr` | `output-not-json` | The result holds a `bigint`: an exact number of the expression. |
| `portSearchChain`, `portSearchShares` | `output-not-json` | The result is a `ReadonlyMap`. |
| `runMachine` | `input-not-json` | The option `clock` is an object with methods. A clock reads the time, so it is not pure. |

## Update the manifest

After an update of `@mark1russell7/algebra`, start this command from the root of the repository:

```bash
node scripts/wraps.ts generate --package algebra
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
