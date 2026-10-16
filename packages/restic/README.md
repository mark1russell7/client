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

restic reads the repository and its keys from the environment (`RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `B2_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID` and the others), so no secret is an input. `restic.run` refuses `--password-command`, because that flag starts a program.
