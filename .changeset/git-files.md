---
"@procedures/git": patch
---

The package reads the state of a repository from its files, with no git process (roadmap CLI-123). A list of many working trees with `git` starts one or more processes for each tree. These functions read the same state from the git folder:

- `readWorktrees(repo)` gives the working trees as `git worktree list` gives them, with `prunable` and `locked`.
- `readHead(tree)` gives the branch and its commit, or a detached commit, of a working tree.
- `readRefs(repo)` gives the loose refs and the lines of `packed-refs`, the remote refs included.
- `onRemote(repo, sha)` gives `true` when a remote ref points at the commit. Else it gives `"unknown"`.
- `gitDirsOf(tree)` gives the git folder of a tree and the common folder of its repository.

These functions read no objects. A repository with the `reftable` format of refs gets an error.
