---
"@procedures/gh": minor
---

The GitHub CLI as procedures (roadmap R42). `@procedures/gh` has 13 procedures for pull requests, workflow runs, releases and issues: `gh.pr.list`, `gh.pr.view`, `gh.pr.checks`, `gh.pr.create`, `gh.run.list`, `gh.run.view`, `gh.run.rerun`, `gh.release.list`, `gh.release.view`, `gh.issue.list`, `gh.issue.view`, `gh.issue.create` and `gh.issue.comment`. Each one runs `gh` through `shell.run` with an argument list and no shell, and gives the JSON of `gh --json`. The reads change nothing. The writes declare `writes: ["network"]`.
