---
"@procedures/git": patch
---

`git.push` examines the remote and the branch before the first git call (roadmap O70). Before, `git rev-list` got the range `<remote>/<branch>..HEAD` before the guard, so a remote, for example `--all`, was an option of `git rev-list`. At this time, a remote or a branch that starts with `-` gives the error `Invalid remote` or `Invalid branch`, and git does not start.
