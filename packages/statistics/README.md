# @procedures/statistics

[![npm](https://img.shields.io/npm/v/@procedures/statistics?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/statistics)

The functions of [`@mark1russell7/rigor-statistics`](https://www.npmjs.com/package/@mark1russell7/rigor-statistics) as procedures: medians, intervals, tests, ratings and fits. Each procedure is a typed call, an MCP tool and a CLI command.

No procedure is written by hand. The generator of `@procedures/compiler` reads the types of the library and writes `src/manifest.ts`. Thus a procedure cannot drift from its function.

## Install

```bash
pnpm add @procedures/statistics @procedures/client
```

A host registers the procedures with `createRegistry(statisticsModule)`, or with `import "@procedures/statistics/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

The package has 81 procedures in the namespace `statistics`, one for each function of the library with JSON inputs and a JSON output. Each procedure has no effects: it reads nothing and writes nothing.

- The input is an object with one property for each parameter of the function, by its name.
- The JSON Schemas of the input and the output come from the types. The descriptions come from the doc comments.
- An output of `undefined` is `null`, as in JSON.
- A function parameter is a sub-program: one call of a pure procedure, as data. The next section gives an example.

`statisticsManifest` gives the names, the schemas and the effects of each procedure.

## Example

```ts
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { statisticsModule } from "@procedures/statistics";

const registry = createRegistry(statisticsModule);
const output = await invokePath(["statistics", "wilson"], { k: 8, n: 10 }, { registry });
const interval = await outputValue(output); // { low: 0.49, high: 0.94 }
```

## A statistic as a sub-program

The statistic of `bootstrap` is a function. Its procedure takes one call of a statistics procedure, as data. The call reads the parameter `sample` with `$ref`:

```ts
await client.exec(["statistics", "bootstrap"], {
  data: [3, 1, 4, 1, 5, 9, 2, 6],
  statistic: { $proc: ["statistics", "mean"], input: { values: { $ref: "sample" } }, $when: "$never" },
  options: { runs: 200, seed: 7 },
});
```

The statistic of `bootstrapClusters`, `bootstrapStrata`, `bootstrapTwo`, `pairedPermutation` and `twoSamplePermutation` is a sub-program too. So are the cluster of `bootstrapClusters` and the option `information` of `choosePair`. A sub-program uses only pure procedures, so it changes nothing. The README of `@procedures/compiler` gives the rules.

## The functions with no procedure

1 function of the library has no procedure. The manifest gives it with its reason:

| Function | Reason | The cause |
| --- | --- | --- |
| `runningOf` | `input-not-json` | The values are an `Iterable`, not an array. |

## Update the manifest

After an update of `@mark1russell7/rigor-statistics`, start this command from the root of the repository:

```bash
node scripts/wraps.ts generate --package statistics
```

The command writes `src/manifest.ts`. It also raises the ratchet of the library in `wraps.coverage.json`. CI starts `node scripts/wraps.ts check`. The check fails when the manifest is not current, or when the share of the functions with a procedure falls.

## License

MIT
