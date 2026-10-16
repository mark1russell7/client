---
"@procedures/git": minor
---

More git procedures (roadmap R40): `git.show`, `git.blame`, `git.tag.list`, `git.tag.add`, `git.tag.delete`, `git.revParse`, `git.reset`, `git.restore`, `git.merge`, `git.merge.abort`, `git.rebase`, `git.rebase.continue`, `git.rebase.abort`, `git.worktree.list`, `git.worktree.add` and `git.worktree.remove`. Each one declares its effects. A merge or a rebase that stops on conflicts gives `conflict: true` and the files, and git never starts an editor.

`git.branch` becomes three procedures: `git.branch.list`, `git.branch.add` and `git.branch.delete`. `git.branch` is deprecated. It stays for one release with the same input and output, and it calls the new code.

The current branch comes from `git symbolic-ref`. Before, `git.branch` and `git.push` used `git rev-parse --abbrev-ref HEAD`, which fails in a repository without commits. `git.branch.list` and `git.branch` work there now.
