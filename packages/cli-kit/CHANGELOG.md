# @procedures/cli-kit

## 0.39.0

### Patch Changes

- Updated dependencies [55d1e4d]
  - @procedures/client@0.39.0

## 0.38.0

### Minor Changes

- c6fba49: The keys of procedure paths go through the codec of `@procedures/client` (roadmap CLI-84, decision D36). A path without `.` and `%` in a segment keeps the same key, so only such segments see a change.
  
  MINOR (breaking, pre-1.0): for a segment with `.` or `%`, two keys that callers can see change. If it is not clear whether a change is breaking, the release treats it as breaking.
  
  - `@procedures/cli-kit`: the key of a `format` hook is `pathToKey(path)`. A caller sets this key. For the path `["a", "b.c"]`, the key was `a.b.c`, and it is now `a.b%2Ec`.
  - `@procedures/lib`: the `key` of each procedure of the ecosystem scan is `pathToKey(path)`. The scan gives this key over the wire. For the path `["a", "b.c"]`, the key was `a.b.c`, and it is now `a.b%2Ec`.
  
  The other changes are fixes:
  
  - `pathToKey()` accepts a `readonly string[]`.
  - `@procedures/llm`: a procedure tool reads its key with `keyToPath()`, so `a%2Eb.c` names the path `["a.b", "c"]`.
  - `@procedures/mcp`: the cache key of a tool is `pathToKey(path)`. Before, `["a.b", "c"]` and `["a", "b", "c"]` had the same cache key. The cache is in the process, so no stored data changes.
  - `@procedures/mcp-server`: the message about two procedures with one tool name gives the keys of the paths.
  
  No stored key and no topic changes. The storage keys and the topics already used the codec (roadmap CLI-75).
  
  Migration:
  
  - A caller of `cli-kit` with a `format` hook for a path with a dotted segment writes the key in the encoded form, for example `a.b%2Ec`.
  - A reader of the ecosystem scan that splits a `key` on `.` uses `keyToPath(key)`.
  - The site, MiniMongo, Graph and jarvis: no step, if their procedure paths have no segment with `.` or `%`.

### Patch Changes

- Updated dependencies [c6fba49]
  - @procedures/client@0.38.0

## 0.37.0

### Patch Changes

- @procedures/client@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [f1fae86]
  - @procedures/client@0.36.0

## 0.35.1

### Patch Changes

- Updated dependencies [9f0405d]
- Updated dependencies [f5c2407]
  - @procedures/client@0.35.1

## 0.35.0

### Patch Changes

- 5957933: PATCH: new export createProcedureCli, no break.
  
  New package `@procedures/cli-kit`: a command line for any procedure registry (roadmap O61, dedupe review F5). `createProcedureCli({ name, procedures, client, globals, format })` gives help, `--json`, `--data`, questions for missing arguments, `@<file>` input, short flags from `meta.shorts`, and a format hook for each procedure. Its `run(argv)` gives the exit code.
  
  `mark` now uses the parts of the kit: the parse of the command line, the help, the questions, the output and the failure rule. Its commands, flags, messages and exit codes do not change. The exports of `@procedures/mark` stay the same.
- @procedures/client@0.35.0
