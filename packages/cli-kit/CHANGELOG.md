# @procedures/cli-kit

## 0.49.0

### Patch Changes

- Updated dependencies [bf0aa79]
- Updated dependencies [a1aedc5]
  - @procedures/client@0.49.0

## 0.48.2

### Patch Changes

- Updated dependencies [08beec5]
- Updated dependencies [48b7127]
  - @procedures/client@0.48.2

## 0.48.1

### Patch Changes

- Updated dependencies [2d7edae]
  - @procedures/client@0.48.1

## 0.48.0

### Patch Changes

- 17a18ec: The source now uses only syntax that a type stripper erases, so the setting `erasableSyntaxOnly` of `@mark1russell7/cue` 2.1.1 stays on. Each enum is now a constant object with a type of the same name. Each parameter property is now a field and an assignment in the constructor.
  
  **Breaking.** MINOR before 1.0.0: `ErrorCategory`, `ErrorSeverity` and `WebSocketState` are now constant objects. Their names and values stay the same, and each member stays usable as a type. A member is no longer a constant expression: `enum E { A = ErrorSeverity.WARNING }` gives TS18033, and a `const enum` gives TS2474. Also, a string with the value of a member now fits the type of the set.
  
  **Migration.** In an enum initializer, write the value in place of the member, for example `"warning"`, or use a constant object. Other uses need no change. The site and the known apps need no change.
- Updated dependencies [17a18ec]
- Updated dependencies [06088f9]
- Updated dependencies [71f9c6e]
- Updated dependencies [c839add]
  - @procedures/client@0.48.0

## 0.47.2

### Patch Changes

- Updated dependencies [0650616]
- Updated dependencies [ae1e3fd]
- Updated dependencies [f1ece74]
  - @procedures/client@0.47.2

## 0.47.1

### Patch Changes

- Updated dependencies [f845c6d]
  - @procedures/client@0.47.1

## 0.47.0

### Patch Changes

- e913014: Each module imports zod with `import * as z from "zod"`, not `import { z } from "zod"`. With the old form, an esbuild bundle got each locale of zod: 264 kB of minified code (esbuild metafile of the journey worker of the site). The Vite build of the site gives the same worker files with both forms. The procedure scaffolder writes the new form in `types.ts`. The API and the behavior stay the same.
- Updated dependencies [c9125a8]
- Updated dependencies [335728b]
- Updated dependencies [d987202]
- Updated dependencies [45a737f]
- Updated dependencies [d77e9e8]
- Updated dependencies [e913014]
- Updated dependencies [2f0c7b0]
- Updated dependencies [ad70c38]
- Updated dependencies [47819c6]
  - @procedures/client@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [10dcc3c]
  - @procedures/client@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [fbb50fa]
- Updated dependencies [845902b]
- Updated dependencies [70b2245]
  - @procedures/client@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [4dada47]
- Updated dependencies [19b7a25]
  - @procedures/client@0.44.0

## 0.43.0

### Patch Changes

- @procedures/client@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [7ca9953]
- Updated dependencies [226ae02]
- Updated dependencies [e4cb0cf]
  - @procedures/client@0.42.0

## 0.41.1

### Patch Changes

- Updated dependencies [69cee92]
  - @procedures/client@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies [37deb07]
- Updated dependencies [fc52431]
  - @procedures/client@0.41.0

## 0.40.0

### Patch Changes

- @procedures/client@0.40.0

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
  - Apps: no step, if their procedure paths have no segment with `.` or `%`.

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
