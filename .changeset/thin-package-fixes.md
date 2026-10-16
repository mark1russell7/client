---
"@procedures/git": patch
"@procedures/splay": patch
---

Three defects that the new tests of roadmap R33 found:

- `git.commit` gives `skipped: true` when nothing is staged. Before, an untracked file or a change that was not staged made `git commit` fail with "nothing added to commit". With `all`, a change of a tracked file is a change to commit, and an untracked file is not.
- `git.init` looks for `.git` itself. Before, it used `fs.exists` through its context, so it failed in a registry of `gitModule` alone (`createRegistry(gitModule)`).
- A component of `@procedures/splay` gives its registry to the children that it renders. Before, the child of a child came from the global registry, so a component in a registry of `createRegistry()` rendered an "unknown" grandchild.
