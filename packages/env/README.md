# @procedures/env

[![npm](https://img.shields.io/npm/v/@procedures/env?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/env)

```sh
npm install @procedures/env
```

Environment variables as procedures: one variable, the names, and the check of the necessary variables. The procedures mask each secret.

## The procedures

| Procedure | What it does | Effects |
|---|---|---|
| `env.get` | It gives one variable. A secret is masked unless the host reveals it. | reads `process` |
| `env.list` | It gives the names, sorted. With `values: true`, it also gives the values of the variables that are not secrets. | reads `process` |
| `env.check` | It gives the necessary variables that are missing and the variables that are present. | reads `process` |

- Each procedure declares `reads: ["process"]` and `writes: []`. It changes nothing.
- A masked secret has `masked: true` and no `value`. The output tells that the variable is set, and nothing about the value.
- `env.list` does not give the value of a secret, also when the host reveals secrets to `env.get`.
- `env.check` gives names only. An empty value counts as missing, unless the input has `allowEmpty: true`.

```ts
import "@procedures/env/register";

await client.call(["env", "check"], { required: ["DATABASE_URL", "GITHUB_TOKEN"] });
// { ok: false, missing: ["DATABASE_URL"], present: ["GITHUB_TOKEN"] }
```

## Secrets

A secret is a variable whose name matches a pattern. The default patterns are `*_TOKEN`, `*_KEY`, `*_SECRET` and `*PASSWORD*`.

- The `*` of a pattern matches each sequence of characters. The other characters match only themselves.
- The comparison ignores the case, because Windows ignores the case of the names.
- A variable can hold a password, but its name can match no default pattern. The host adds that name to `secretPatterns`, for example `DATABASE_URL`.

`createEnvModule()` gives the same procedures with other settings:

```ts
import { createRegistry } from "@procedures/client";
import { createEnvModule } from "@procedures/env/module";

const registry = createRegistry(createEnvModule({ secretPatterns: ["DATABASE_URL"], revealSecrets: ["NPM_TOKEN"] }));
```

| Option | Meaning |
|---|---|
| `secretPatterns` | More patterns of secret names, after the default patterns. |
| `revealSecrets` | The secrets whose value `env.get` gives: `true` for each secret, or a list of names. The default is none. |
| `env` | The variables: a record, or a function that gives them at each call. The default is `process.env`. |

## Not MCP tools

These procedures are not MCP tools, and a bundle of tools does not include them.

- A value that a tool gives goes to the model and to its provider. A variable can hold a key, a password or a private path.
- The names of the variables also tell about the computer and its accounts.
- A host that needs a check of its configuration starts `env.check` itself, before it starts its tools.

## Tests

`pnpm --filter @procedures/env test` examines the procedures with a record of variables and with `process.env`. The tests examine the patterns, the masks, the reveal rule and the effects.
