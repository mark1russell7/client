---
"@procedures/fs": patch
---

The CHANGELOG of 0.60.1 names only the brace groups of `fs.glob` with `dot: true`. Version 0.60.1 also changed three results of `fs.glob` with `dot: true`. Tests hold these results.

- A pattern `x/**` also gives the folder `x`, as `fs.glob` without `dot` does.
- An ignore pattern keeps the walk out of a folder only when it matches the folder or each entry in it. Before 0.60.1, `**/.*` stopped the walk at each folder, and `a/?` stopped it at the folder `a`.
- A pattern that starts with `./` matches. Before 0.60.1, it matched nothing.

Migration for the site and each app: examine each call of `fs.glob` with `dot: true` and a pattern that ends in `/**`. To get the matches of 0.60.0, remove the match that is equal to the folder.
