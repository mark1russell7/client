---
"@procedures/fs": minor
"@procedures/lib": patch
"@procedures/archive": patch
---

The path, glob and walk functions of three packages move to their home, `@mark1russell7/files` (roadmap R4).

- `@procedures/fs`: `isInside` is a re-export of `@mark1russell7/files`. The walk of `fs.glob` with `dot: true` is `findEntries` of `@mark1russell7/files` 0.0.2.
- `@procedures/lib`: `expandHome` is a re-export of `@mark1russell7/files`. `findWorkspaceRoot` uses `findUp`.
- `@procedures/archive`: the walk of `archive.create` uses `walk` of `@mark1russell7/files`. `portableLinkTarget` uses `toPosix`. The limits and the error codes do not change.

Four changes of `fs.glob` with `dot: true`. The first is a break (MINOR):

- A pattern `x/**` also gives the folder `x`. The `fs.glob` without `dot` gave it before.
- An ignore pattern `**/.*`, `a/?` or `a/[!b]` does not stop the walk at a folder with contents that the pattern does not ignore. Before, `**/.*` stopped the walk at each folder.
- A brace with a dot name, for example `a/{b,.c}`, matches the dot name.
- A pattern that starts with `./`, or an absolute pattern, matches. Before, it matched nothing.

Migration for the site and each app: examine each call of `fs.glob` with `dot: true`. A pattern that ends in `/**` also gives its folder. To get only the old matches, remove the match that is equal to the folder. The other calls get the same matches.
