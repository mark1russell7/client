# @procedures/npm

[![npm](https://img.shields.io/npm/v/@procedures/npm?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/npm)

```sh
npm install @procedures/npm
```

The npm registry as procedures. The package reads the fields and the dist-tags of a package, and gives the user name of the login. It also lists the files of a tarball, and deprecates versions.

Each procedure starts the npm CLI through `shell.run` of `@procedures/shell`. It gives an argument list to npm, and no shell reads it. The options come first, then `--`, then the values. After `--`, the CLI reads no option, so a value that starts with `-` stays a value.

## The procedures

| Procedure | Input | Output | Effects |
|---|---|---|---|
| `npm.view` | `package`, `fields`, `registry` | `data`: the JSON of `npm view --json` | reads fs and network |
| `npm.distTags.list` | `package`, `registry` | `tags`: each tag and its version | reads fs and network |
| `npm.distTags.add` | `package`, `version`, `tag`, `confirm`, `otp`, `registry` | the result of npm | writes network, destructive, idempotent |
| `npm.distTags.remove` | `package`, `tag`, `confirm`, `otp`, `registry` | the result of npm | writes network, destructive, idempotent |
| `npm.whoami` | `registry` | `username` | reads fs and network |
| `npm.pack` | `dryRun` (default `true`), `destination` | `data`: the JSON of `npm pack --json` | writes fs and process |
| `npm.deprecate` | `package`, `message`, `confirm`, `otp`, `registry` | the result of npm | writes network, not destructive, idempotent |

- Each input also takes `cwd` and `timeout`.
- The result of npm has `exitCode`, `stdout`, `stderr`, `success` and `duration`. A failed command does not throw: `success` is `false`.
- The npm CLI reads its configuration on the disk (`.npmrc`), so the reads of the registry also read `fs`.

## The writes to the registry

`npm.distTags.add`, `npm.distTags.remove` and `npm.deprecate` change the registry for each user of the package. Their input must have `confirm: true`, or the call fails before npm starts.

- `npm.distTags.add` moves a tag from its earlier version. Each install of `<package>@<tag>` then gets the new version.
- `npm.deprecate` keeps the versions and their files. Only the message changes, so it is not destructive. An empty message removes the deprecation.
- An account with two-factor authentication needs `otp`, the one-time password.

```typescript
import { createRegistry, invokePath } from "@procedures/client";
import { npmModule } from "@procedures/npm";

const registry = createRegistry(npmModule);

const view = await invokePath(["npm", "view"], { package: "zod", fields: ["version"] }, { registry });

await invokePath(
  ["npm", "deprecate"],
  { package: "my-package@<2.0.0", message: "Use version 2", confirm: true },
  { registry },
);
```

## The tarball

`npm.pack` is a dry run by default: the CLI lists the files of the tarball and writes no tarball. With `dryRun: false`, the CLI writes the tarball into `destination`, or into the folder of the package. The CLI also starts the `prepack`, `prepare` and `postpack` scripts of the package, in a dry run too.

```sh
mark npm pack --cwd packages/app
```

## How the package finds npm

On Windows, `npm` is a `.cmd` file, and Node starts a `.cmd` file only through a shell. So `resolveNpm()` finds the `npm-cli.js` script of the npm of this Node, and starts it with Node. When the npm CLI starts the process, the script comes from `npm_execpath`.

## Related packages

- [`@procedures/shell`](../client-shell): the shell module that runs npm.
- [`@procedures/pnpm`](../client-pnpm): pnpm as procedures.
- [`@procedures/client`](../client): the core.
