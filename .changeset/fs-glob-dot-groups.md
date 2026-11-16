---
"@procedures/fs": patch
---

With `dot: true`, `fs.glob` uses the glob matcher of `@mark1russell7/files` for the pattern and each `ignore` entry. A brace group can hold a dot name, for example `{.git,node_modules}`. The matcher knows `*`, `**`, `?`, sets and brace groups.
