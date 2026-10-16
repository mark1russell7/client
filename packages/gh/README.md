# @procedures/gh

[![npm](https://img.shields.io/npm/v/@procedures/gh?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/gh)

```sh
npm install @procedures/gh
```

The GitHub CLI (`gh`) as procedures: pull requests, workflow runs, releases and issues. Each procedure runs `gh` through `shell.run` of `@procedures/shell`, with an argument list and no shell. The output is the JSON of `gh --json`.

`gh` must be on the `PATH`, with a login (`gh auth login`).

## The procedures

| Procedure | What it does | Effects |
|---|---|---|
| `gh.pr.list` | The pull requests of a repository: state, author, base, head, search, limit | reads |
| `gh.pr.view` | One pull request | reads |
| `gh.pr.checks` | The checks of a pull request | reads |
| `gh.pr.create` | Open a pull request | writes |
| `gh.run.list` | The workflow runs: workflow, branch, status, limit | reads |
| `gh.run.view` | One workflow run with its jobs | reads |
| `gh.run.rerun` | Run a workflow run again, or only its failed jobs | writes |
| `gh.release.list` | The releases of a repository | reads |
| `gh.release.view` | The release of a tag, or the latest release | reads |
| `gh.issue.list` | The issues: state, label, author, search, limit | reads |
| `gh.issue.view` | One issue, with its comments | reads |
| `gh.issue.create` | Open an issue | writes |
| `gh.issue.comment` | Add a comment to an issue or a pull request | writes |

- A read declares `reads: ["network"]` and changes nothing. A write declares `writes: ["network"]`. It makes something new, so it is not destructive, and a second call makes a second one.
- Each procedure takes `repo` (owner/name), `cwd` and `timeoutMs`. Without `repo`, `gh` uses the repository of the folder.
- A value that `gh` reads as an argument (a number, a branch, a label) must not start with `-`. A title or a body is the value of its option, so it can start with `-`.
- A failed command throws an error with the exit code and the text of `gh`. `gh.pr.checks` reports a pending check as an error that tells you to ask again.

## Use

```typescript
import { createRegistry, Client } from "@procedures/client";
import ghModule from "@procedures/gh/module";

const client = new Client(transport).useRegistry(createRegistry(ghModule));
const { items } = await client.exec(["gh", "run", "list"], { repo: "owner/name", status: "failure" });
```

```sh
mark gh run list --repo owner/name --status failure
```

## Tests

`pnpm --filter @procedures/gh test` runs the procedures with a fake shell. The tests examine each argument list, the JSON of `gh`, the failures and the values that cannot become options.
