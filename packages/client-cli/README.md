# @mark1russell7/client-cli

[![npm](https://img.shields.io/npm/v/@mark1russell7/client-cli?color=2346c4&label=npm)](https://www.npmjs.com/package/@mark1russell7/client-cli)

```sh
npm install @mark1russell7/client-cli
```

`client-cli` gives one procedure, `cli.run`. It starts a command of the `mark` CLI in a new Node process and gives its output. Thus a program can use any `mark` command.

`cli.run` is not a tool of the MCP server: it starts any `mark` command, `shell exec` too. As a tool, it gives back the shell access that the tool list keeps out (deep dive CLI-5).

## Use

```typescript
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import "@mark1russell7/client-cli"; // registers cli.run and shell.*

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

// The same as: mark lib new my-package --preset lib
const result = await client.exec(["cli", "run"], {
  path: ["lib", "new"],
  positional: ["my-package"],
  args: { preset: "lib" },
});
console.log(result.success, result.stdout);
```

From the command line:

```sh
node packages/mark/dist/cli.js cli run lib scan
```

## Input

| Field | Type | Function |
|---|---|---|
| `path` | `string[]` | The path of the `mark` command, for example `["lib", "new"]` |
| `positional` | `string[]` | The arguments after the path |
| `args` | `Record<string, string \| number \| boolean>` | The flags. `{ name: "x" }` gives `--name x`. `true` gives `--name`. `false` gives no flag. |
| `cwd` | `string` | The folder of the command |
| `timeout` | `number` | The time limit in milliseconds |

## Output

| Field | Type | Function |
|---|---|---|
| `exitCode` | `number` | The exit code of `mark` |
| `stdout`, `stderr` | `string` | The output of `mark` |
| `success` | `boolean` | True when the exit code is 0 |
| `duration` | `number` | The time in milliseconds |

`cli.run` does not throw for a failed command. It gives `success: false` and the error in `stderr`.

## How it works

1. `cli.run` finds `packages/mark/dist/cli.js` in the workspace that contains it. Without a build of `mark`, it fails with a message.
2. It makes an argument list: the path, the positional arguments, then the flags.
3. It starts `node` with that list through `shell.run`, with no shell. The values cannot start other commands.

`mark` itself uses a warm CLI server when one is safe to use: the same folder, the same build, and the token of its lockfile.

## Limits

- A flag value that starts with `-` reaches `mark` as a separate word, so `mark` can read it as a flag.
- `args` cannot give `false` to a flag whose default is `true`. Use the procedure directly instead.
