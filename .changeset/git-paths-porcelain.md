---
"@procedures/git": minor
---

`git.status` and `git.commit` take `paths`, and the package root exports the git runner and a parser of `git status --porcelain=v1 -z`.

- `git.status` has two new options: `paths` (the pathspecs after `--`) and `untrackedFiles` (`--untracked-files=no|normal|all`). With `"all"`, git gives each file of a new folder. Without the options, the output does not change.
- `git.commit` has the new option `paths`. The commit then has only those paths, as they are in the working tree (`git commit -m <message> -- <paths>`). The other staged changes stay in the index.
- With `paths`, a change of a tracked file counts, staged or not. When no tracked file of the paths changed, the output has `skipped: true`. `all` and `paths` together give an error, because git refuses `-a` with paths.
- `parsePorcelainV1(output)` gives each entry with `xy`, the exact `path`, `status` and `staged`, and `from` for a rename or a copy. `classifyStatus(xy)` gives the status of two status letters.
- The root also exports `git(args, options)`, the runner of the procedures. It throws a `GitError` when git fails.

The effects of `git.status` and `git.commit` do not change.
