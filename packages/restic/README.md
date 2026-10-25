# @procedures/restic

[![npm](https://img.shields.io/npm/v/@procedures/restic?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/restic)

The restic backup program as one procedure. It starts restic with argv, never through a shell.

## Install

```bash
pnpm add @procedures/restic @procedures/client
```

A host registers the procedures with `createRegistry(resticModule)`, or with `import "@procedures/restic/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

| Procedure | Effects | What it does |
| --- | --- | --- |
| `restic.run` | reads and writes `fs`, `network`, `process`, destructive | Runs a restic command (`backup`, `snapshots`, `restore`, `forget`, `check`) and reads its JSON output. |

## Example

```ts
// RESTIC_REPOSITORY and RESTIC_PASSWORD are in the environment
const { json } = await client.exec(["restic", "run"], { path: ["snapshots"] });
```

## Secrets

restic reads the repository and its keys from the environment (`RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `B2_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID` and the others), so no secret is an input.

`restic.run` refuses each input that lets the caller choose a program for restic to start:

- The flags `--password-command`, `--from-password-command` and `--password-command2`.
- An extended option (`--option`) that sets `sftp.command`, `sftp.args`, `rclone.program` or `rclone.args`, in each spelling that restic reads.
- An sftp or rclone repository whose host or remote starts with `-`, in `repository`, `--repo`, `--from-repo` or `--repo2`. `ssh` and `rclone` read such a value as an option.
- A positional argument that starts with `-` after a last flag without a value. Put a flag with a value last, or start the argument with `./`.

A host can give the secrets only to the restic process, with the `env` option of `createResticModule()` or `runRestic()`:

- The values go on top of the environment of the host. The value `undefined` removes a variable of the host.
- The environment of the host does not change, and the output does not contain the values.
- The procedure input has no field for them. The caller of `restic.run` cannot read or change them.

```ts
const registry = createRegistry(createResticModule({ env: { RESTIC_REPOSITORY: repository, RESTIC_PASSWORD: password } }));
```

restic can write the repository address in its error text. Remove it before you show the text to a user.

## Library functions

The package root exports the functions that `restic.run` uses:

| Function | What it does |
| --- | --- |
| `runRestic(command, options)` | Starts a restic command with argv, and reads its JSON output. |
| `findRestic(options)` | Finds the restic program. |
| `resticArgv(command)` | Gives the argv of a restic command. |
| `createResticModule(options)` | Gives the module with the settings of the host: `executable`, `env` and `run`. |

- `command` has `path`, `positional`, `args`, `repository` and `json`. `json` is true when the command does not set it, as in `restic.run`.
- `options` of `runRestic` has `executable`, `env`, `cwd`, `timeout`, `signal` and `run`.
- `runRestic` throws when restic does not start. A failed command gives `success: false`, with `exitCode` and `stderr`.
- `run` replaces the function that starts restic. A test gives a fake runner.
- `findRestic` gives `RESTIC_EXE` when it is set. On Windows, it then looks for the `restic*.exe` of a WinGet package. Then it gives `restic`, and the `PATH` gives the program.
- The program of `restic.run` comes from the host: the `executable` option of `createResticModule()`, then `RESTIC_EXE`, then `restic`. An input with `executable` gets a validation error.

```ts
const executable = await findRestic();
const result = await runRestic(
  { path: ["forget"], args: { "keep-daily": 14, "keep-weekly": 12, prune: true } },
  { executable, env: { RESTIC_REPOSITORY: repository, RESTIC_PASSWORD: password } },
);
```
