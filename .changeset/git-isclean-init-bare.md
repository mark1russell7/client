---
"@procedures/git": minor
---

Two fixes of roadmap R33:

- `git.isClean` fails outside a repository with the error of git. Before, it gave true.
- `git.init` gives `created: false` for an existing bare repository, and it does not make the repository again. Before, it looked only for a `.git` folder.
