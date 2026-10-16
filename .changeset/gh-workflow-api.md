---
"@procedures/gh": minor
---

Three new procedures: `gh.workflow.run`, `gh.run.download` and `gh.api`.

- `gh.workflow.run` starts a workflow run on a ref, with each input as `-f key=value`. When `gh` prints the URL of the new run, the output has `url` and `run`. It declares `writes: ["network"]`, and it is not destructive.
- `gh.run.download` downloads the artifacts of a run into `dir`, by `names` or `patterns`. It declares `writes: ["fs"]`. `gh` does not replace a file that exists, so it is not destructive.
- `gh.api` sends a request to the GitHub API and gives the parsed JSON as `data`. It always sends `--method` (default `GET`). A string field goes as `-f`, another value as `-F`. A JSON `body` goes as `--input` from a temporary file. `paginate` joins the pages of an array. `repo` goes to `gh` as `GH_REPO`.
- The method of `gh.api` is an input, and `PUT` or `DELETE` can replace or remove data. Thus `gh.api` declares `writes: ["network"]` and is destructive.

These procedures are not MCP tools.
