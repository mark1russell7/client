# @procedures/gh

[![npm](https://img.shields.io/npm/v/@procedures/gh?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/gh)

```sh
npm install @procedures/gh
```

The GitHub CLI (`gh`) as procedures: pull requests, workflow runs, artifacts, releases, issues and the GitHub API. Each procedure runs `gh` through `shell.run` of `@procedures/shell`, with an argument list and no shell. The output is the JSON of `gh --json`.

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
| `gh.run.download` | Download the artifacts of a run: names, patterns, folder | writes `fs` |
| `gh.workflow.run` | Start a workflow run: workflow, ref, inputs | writes |
| `gh.release.list` | The releases of a repository | reads |
| `gh.release.view` | The release of a tag, or the latest release | reads |
| `gh.issue.list` | The issues: state, label, author, search, limit | reads |
| `gh.issue.view` | One issue, with its comments | reads |
| `gh.issue.create` | Open an issue | writes |
| `gh.issue.comment` | Add a comment to an issue or a pull request | writes |
| `gh.api` | Send a request to the GitHub API: endpoint, method, fields, body, paginate | writes, destructive |

- A read declares `reads: ["network"]` and changes nothing. A write declares `writes: ["network"]`. It makes something new, so it is not destructive, and a second call makes a second one.
- Each procedure takes `repo` (owner/name), `cwd` and `timeoutMs`. Without `repo`, `gh` uses the repository of the folder.
- A value that `gh` reads as an argument (a number, a branch, a label) must not start with `-`. A title or a body is the value of its option, so it can start with `-`.
- A failed command throws an error with the exit code and the text of `gh`. `gh.pr.checks` reports a pending check as an error that tells you to ask again.

### Workflow runs and artifacts

- `gh.workflow.run` sends each input as `-f key=value`. When GitHub gives the new run, `gh` prints its URL. Then the output has `url` and `run`, the id of the run.
- Without `run` in the output, find the run with `gh.run.list`. Use the `workflow` and `branch` filters.
- `gh.run.download` writes the files of the artifacts into `dir`. It declares `writes: ["fs"]`.
- `gh` puts each artifact in a folder with its name. When the input selects one artifact, the files go directly into `dir`.
- `gh` does not replace a file that exists. The download then fails. Thus the procedure is not destructive.

### The GitHub API

- `gh.api` always sends `--method`. The default is `GET`. Without this option, `gh` changes `GET` to `POST` when the call has fields.
- A string field goes as `-f`, and `gh` sends it as text. A number, a boolean or `null` goes as `-F`, and `gh` converts its type.
- `GET` sends the fields in the query. The other methods send them in the JSON body.
- `body` is a JSON value. The procedure writes it to a temporary file for `--input`, and removes the file after the call.
- `gh api` has no `--repo` option. The procedure gives `repo` to `gh` as `GH_REPO`. Then `gh` replaces `{owner}` and `{repo}` in the endpoint.
- The output is `{ data }`, the parsed JSON. An empty response (HTTP 204) gives `null`.
- With `paginate: true`, the pages of an array become one array. The pages of an object become an array of the pages.
- The method is an input, and `PUT` or `DELETE` can replace or remove data. Thus `gh.api` declares `writes: ["network"]` and keeps the default: destructive.

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

```typescript
const { run } = await client.exec(["gh", "workflow", "run"], { workflow: "ci.yml", ref: "main", inputs: { shards: "4" } });
const { data } = await client.exec(["gh", "api"], { endpoint: "repos/{owner}/{repo}/pulls", repo: "owner/name", paginate: true });
```

## The root of the files

Under the root of a host (`mark --fs-root`, `procedure-server --fs-root`, `MCP_FS_ROOT`), each gh procedure starts gh in a working folder of the root. The default `cwd` is the root. The `dir` of `gh.run.download` starts at `cwd`, and it must be in the root. `GIT_DIR` is the null device, so the git of gh finds no repository: give `repo`. gh reads its own login in the home folder.

## Tests

`pnpm --filter @procedures/gh test` runs the procedures with a fake shell. The tests examine each argument list, the JSON of `gh`, the failures and the values that cannot become options.
