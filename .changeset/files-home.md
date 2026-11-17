---
"@procedures/fs": patch
"@procedures/lib": patch
"@procedures/archive": patch
"@procedures/peer": patch
---

The path, glob and walk functions of three packages move to their home, `@mark1russell7/files` (roadmap CLI-125).

- `@procedures/fs`: `isInside` is a re-export of `@mark1russell7/files`. With `dot: true`, `fs.glob` uses `findEntriesAsync` of `@mark1russell7/files`, and its walk does not block the event loop.
- `@procedures/fs`: with `dot: true`, an absolute pattern under `cwd` matches. Before, it matched nothing. The other matches do not change.
- `@procedures/lib`: `expandHome` is a re-export of `@mark1russell7/files`. `findWorkspaceRoot` uses `findUp`.
- `@procedures/archive`: the walk of `archive.create` uses `walk` of `@mark1russell7/files`. `portableLinkTarget` uses `toPosix`. The limits and the error codes do not change.
- `@procedures/peer`: the range of `@mark1russell7/files` is `^0.0.4`, as in the other packages. The code does not change.
