# @procedures/gh

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
