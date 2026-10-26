# @procedures/cli-kit

[![npm](https://img.shields.io/npm/v/@procedures/cli-kit?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/cli-kit)

```sh
npm install @procedures/cli-kit @procedures/client
```

A command line for any procedure registry. The flags come from the input schemas, and the help comes from the metadata of the procedures. The package has no procedures, and an import registers nothing. The `mark` CLI uses the same parts.

## A program in five lines

```ts
import { createProcedureCli } from "@procedures/cli-kit";
import { registry } from "./procedures.js";

const cli = createProcedureCli({ name: "tool", version: "1.0.0", procedures: registry });
process.exitCode = await cli.run(process.argv.slice(2));
```

The program gives these functions for each procedure:

- `tool job status j1` starts the procedure `job.status`. The fields of `meta.args` take the arguments in order.
- Each field of the input schema is a flag: `--holder me`, or the kebab-case name of a camelCase field. A boolean field also takes `--no-<flag>`.
- `meta.shorts` gives the short flags: `{ all: "a" }` makes `-a`.
- `tool --help`, `tool job --help` and `tool job status --help` show the help of the program, of a group and of a command.
- `--json` writes the result as JSON. `--format table` writes a table.
- `--data '{"id":"j1"}'` gives the input as one JSON object. The flags and the arguments go over its fields.
- A value `@<file>` is the text of the file, for example `--body @notes.md` or `--data @input.json`. A value `@@<text>` is the text `@<text>`.
- In a terminal, the program asks for each necessary argument that is missing. It does not ask with `--no-input` or when the environment variable `CI` is set. It also does not ask when `meta.interactive` is `false`.
- The exit code is 1 for an unknown command, an invalid input and an error. A result with `success: false`, or with an `exitCode` that is not 0, also gives 1.

## The options

| Option | What it gives |
| --- | --- |
| `name` | The name of the program in the help and in the messages. |
| `procedures` | The commands: procedures, a `ProcedureRegistry`, or descriptions with `path`, `metadata` and `fields`. A function gives them at the start. |
| `client` | The client that runs the commands, for example a `Client` over HTTP. A function makes it from the global flags. Without it, the commands run in this process. |
| `globals` | More global flags, for example `{ long: "port", takesValue: true, description: "The port of the daemon" }`. |
| `format` | The format hooks, by the path of the procedure with dots. |
| `version`, `description`, `footer` | The text of `--version` and of the help of the program. |
| `print`, `terminal`, `ask`, `readFile` | The output, the terminal state, the questions and the file reader. Tests give fakes. `readFile: false` turns `@<file>` off. |

## A format hook for each procedure

A format hook writes the human output of one procedure. It gives a text or a list of lines, or it prints with `context.print` and gives nothing. `--json` and `--format table` do not use the hook.

```ts
const cli = createProcedureCli({
  name: "headroom",
  procedures,
  client: (globals) => connectTo(Number(globals.port ?? 4730)),
  globals: [{ long: "port", takesValue: true, description: "The port of the daemon" }],
  format: {
    "job.status": (job) => `${job.name}: ${job.state}`,
  },
});
```

## The parts

The parts of the program are also exports: `parseCommandLine`, `generateHelp`, `groupHelp`, `rootHelp`, `askMissing`, `formatOutput` and `failureOf`. `mark` uses them with its own modes: the warm server, the manifest and the REPL.
