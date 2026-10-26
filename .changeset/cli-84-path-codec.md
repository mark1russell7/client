---
"@procedures/client": patch
"@procedures/cli-kit": patch
"@procedures/lib": patch
"@procedures/llm": patch
"@procedures/mcp": patch
"@procedures/mcp-server": patch
"@procedures/store": patch
---

The keys of procedure paths go through the codec of `@procedures/client` (roadmap CLI-84, decision D36). A path without `.` and `%` in a segment keeps the same key, so only such segments see a change.

- `pathToKey()` accepts a `readonly string[]`.
- `@procedures/store`: a stored program must have the key `pathToKey(path)`. Before, the check compared the key with the path joined with dots, and the store procedures wrote `pathToKey(path)`. Thus a program with a dot in a segment failed the check.
- `@procedures/llm`: a procedure tool reads its key with `keyToPath()`, so `a%2Eb.c` names the path `["a.b", "c"]`.
- `@procedures/mcp`: the cache key of a tool is `pathToKey(path)`. Before, `["a.b", "c"]` and `["a", "b", "c"]` had the same cache key.
- `@procedures/cli-kit`: the key of a `format` hook is `pathToKey(path)`.
- `@procedures/lib`: the `key` of each procedure of the ecosystem scan is `pathToKey(path)`.
- `@procedures/mcp-server`: the message about two procedures with one tool name gives the keys of the paths.
