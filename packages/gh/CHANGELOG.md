# @procedures/gh

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0
  - @procedures/shell@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0
  - @procedures/shell@0.5.0

## 0.4.0

### Minor Changes

- 2c02cf0: Three new procedures: `gh.workflow.run`, `gh.run.download` and `gh.api`.
  
  - `gh.workflow.run` starts a workflow run on a ref, with each input as `-f key=value`. When `gh` prints the URL of the new run, the output has `url` and `run`. It declares `writes: ["network"]`, and it is not destructive.
  - `gh.run.download` downloads the artifacts of a run into `dir`, by `names` or `patterns`. It declares `writes: ["fs"]`. `gh` does not replace a file that exists, so it is not destructive.
  - `gh.api` sends a request to the GitHub API and gives the parsed JSON as `data`. It always sends `--method` (default `GET`). A string field goes as `-f`, another value as `-F`. A JSON `body` goes as `--input` from a temporary file. `paginate` joins the pages of an array. `repo` goes to `gh` as `GH_REPO`.
  - The method of `gh.api` is an input, and `PUT` or `DELETE` can replace or remove data. Thus `gh.api` declares `writes: ["network"]` and is destructive.
  
  These procedures are not MCP tools.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4c51727]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/shell@0.4.0

## 0.3.0

### Minor Changes

- 49de6a8: The GitHub CLI as procedures (roadmap R42). `@procedures/gh` has 13 procedures for pull requests, workflow runs, releases and issues: `gh.pr.list`, `gh.pr.view`, `gh.pr.checks`, `gh.pr.create`, `gh.run.list`, `gh.run.view`, `gh.run.rerun`, `gh.release.list`, `gh.release.view`, `gh.issue.list`, `gh.issue.view`, `gh.issue.create` and `gh.issue.comment`. Each one runs `gh` through `shell.run` with an argument list and no shell, and gives the JSON of `gh --json`. The reads change nothing. The writes declare `writes: ["network"]`.

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
  - @procedures/shell@0.3.0
