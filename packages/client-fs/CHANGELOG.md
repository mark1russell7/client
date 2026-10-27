# @procedures/fs

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

- @procedures/client@0.35.0

## 0.34.0

### Minor Changes

- d4376c2: A path segment with a dot or a `%` comes back the same after a trip over the wire (roadmap CLI-75, decision D36).
  
  Before, the method name of `["collections", "e2e.tabs", "find"]` was `collections.e2e.tabs.find`. The server read it back as four segments, so the call got `NOT_FOUND`. In this release, each segment encodes `%` as `%25` and then `.` as `%2E` before the join:
  
  - `pathToMethod(["collections", "e2e.tabs", "find"])` gives `{ service: "collections.e2e%2Etabs", operation: "find" }`, and `methodToPath()` gives the same path again.
  - `pathToKey()`, `keyToPath()`, the body path of an HTTP request and `server.call` use the same encoding.
  - The topic of a collection without a partition encodes the name too: `collectionChangeTopic("e2e.tabs")` gives `collections.e2e%2Etabs`. The topic of a partition already encoded the name (roadmap CLI-42).
  - The decode accepts `%2E` and `%2e`, and it keeps each other `%` sequence. A topic must have the canonical form.
  - A segment without `.` and `%` keeps its text. Thus the method names and the topics of such names do not change.
  
  The new exports `encodeSegment()`, `decodeSegment()`, `segmentsToTopic()` and `topicToSegments()` do the encoding. Use them. Do not join or split the segments yourself.
  
  Two collections thus do not have the same topic, and `ProcedureServer` accepts a storage of `a.b` next to partitions of `a` (before, roadmap CLI-57 and CLI-70 refused the two together). `CollectionTopicCollisionError` is deprecated, and no server throws it. A later release removes it.
  
  MINOR (breaking, pre-1.0): a name with `.` or `%` gets a new method name, a new registry key and a new topic. The MCP tool names do not change.
  
  The procedures `fs.read.json` and `fs.write.json` have the paths `["fs", "read", "json"]` and `["fs", "write", "json"]`. Before, their paths were `["fs", "read.json"]` and `["fs", "write.json"]`. With the encoding, those paths get the key `fs.read%2Ejson`, so the key `fs.read.json` of the callers does not find them. With three segments, the method name, the key and the MCP tool name stay the same.
  
  The command line of `mark` reads the longest path that names a procedure. Thus `mark fs read json a.json` starts `fs.read.json`, and `mark fs read notes.txt` starts `fs.read`.
  
  Migration:
  
  - Upgrade the clients and the servers of a name with `.` or `%` together.
  - A caller or a stored program that names the path as the list `["fs", "read.json"]` uses `["fs", "read", "json"]`, and `["fs", "write.json"]` becomes `["fs", "write", "json"]`. The text name `fs.read.json` and the MCP tool name `fs_read_json` do not change.
  - There is no D13 alias at the old list paths. No consumer uses the list form, and an alias would give the MCP tool name `fs_read_json` twice.
  - A host whose `expose`, policy or limit pattern names such a path in text uses the encoded form, for example `collections.e2e%2Etabs.*`.
  - An `mcpExclude` entry, an `expose` deny entry or a limit entry in the old raw form, for example `collections.e2e.tabs.drop`, does not match. The check compares the encoded key, so the procedure becomes visible, or the limit does not apply. Write each such entry in the encoded form, for example `collections.e2e%2Etabs.drop`.
  - A subscriber of a dotted collection uses `collectionChangeTopic(name)`. The raw topic `collections.a.b` is the topic of the partition `b` of `a`.
  - Graph: read the collection of a topic with `collectionTopicPartition(topic)`, not with a pattern, for example `/^collections\.([^.]+)\./`.
  - The site, MiniMongo and jarvis: no change, if their collection names have no `.` and no `%`.

### Patch Changes

- fa1a61a: Less boilerplate in each procedure definition (dedupe review F1, tracker item O58).
  
  PATCH (pre-1.0): this change adds exports and deprecates names. It removes no export and changes no behavior.
  
  - `@procedures/client` has the new export `typed<T>()`. It is the one pass-through schema that gives only the type `T`.
  - `@procedures/client` has the new export `definePackage(name, procedures, requires?)`. It gives `{ module, register }` and registers nothing at the call. The new type `PackageDefinition` is its result.
  - `zodAdapter` is deprecated. `input()` and `output()` take each Standard Schema and infer its type, so a zod schema goes in directly.
  - `typedAnySchema` and `outputSchema` are deprecated. Use `typed<T>()`. They give the same pass-through schema.
  - The procedures of the packages give their zod schemas to `input()` and `output()` directly. The `.build() as AnyProcedure` casts are gone. The schemas, the types of the exports and the validation do not change.
  - `mark procedure new` writes `.input(<Name>InputSchema)` and `.output(<Name>OutputSchema)`, without `zodAdapter`.
  
  Migration:
  
  - The site, MiniMongo, Graph and jarvis: no change at this time. The deprecated names work until the next MINOR.
  - Before the next MINOR, replace `zodAdapter<T>(schema)` with `schema`. To keep the check of a schema against a type, write `const schema: z.ZodType<T> = ...`.
  - Before the next MINOR, replace `typedAnySchema<T>()` and `outputSchema<T>()` with `typed<T>()`.
  - A parse-only object (`{ parse }`) in `zodAdapter` becomes a Standard Schema with a `~standard` property.
- 67a53ea: The atomic writes use `writeFileAtomic()` of `@procedures/fs/files` (dedupe review F3, tracker item O59).
  
  PATCH (pre-1.0): this change is internal. It changes no export and no signature.
  
  - `fs.write.json`, the file store of `@procedures/schedule`, the manifest of `mark` and the `current.json` record of `@procedures/node/fresh-bundle` replace their own temporary file and rename with `writeFileAtomic()` or `writeFileAtomicSync()`.
  - Each write now flushes the file to the disk. On Windows, a locked target gets more tries of the rename, for 2 seconds.
  - A replaced file keeps the permissions of the old file. A symlink target stays a symlink, and the write goes to the file of the link.
  - The temporary file has the name `.<name>.<16 hex digits>.tmp` in the folder of the target.
  - `@procedures/schedule`, `@procedures/mark` and `@procedures/node` declare `@procedures/fs` in `dependencies`.
- Updated dependencies [d4376c2]
- Updated dependencies [fa1a61a]
  - @procedures/client@0.34.0

## 0.33.0

### Patch Changes

- @procedures/client@0.33.0

## 0.32.0

### Patch Changes

- @procedures/client@0.32.0

## 0.31.0

### Patch Changes

- @procedures/client@0.31.0

## 0.30.0

### Patch Changes

- @procedures/client@0.30.0

## 0.29.0

### Patch Changes

- @procedures/client@0.29.0

## 0.28.1

### Patch Changes

- Updated dependencies [345c740]
- Updated dependencies [984c13b]
- Updated dependencies [21dc858]
  - @procedures/client@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [06694d7]
  - @procedures/client@0.28.0

## 0.27.8

### Patch Changes

- Updated dependencies [1834a5e]
  - @procedures/client@0.27.8

## 0.27.7

### Patch Changes

- @procedures/client@0.27.7

## 0.27.6

### Patch Changes

- Updated dependencies [d322bef]
  - @procedures/client@0.27.6

## 0.27.5

### Patch Changes

- 2daba21: Sync forms, the last line, the name of the temporary file and a clearer error for a long line in `@procedures/fs/files` (roadmap O52, the feedback of jarvis PR #86).
  
  PATCH: new functions, new options and a new optional field of a result before 1.0.0. No default changes.
  
  - `writeFileAtomicSync(path, data, options?)` is the sync form of `writeFileAtomic()`, with the same steps. On Windows, it tries the rename of a locked target again for `renameRetryMs`, with a short wait of `Atomics.wait()` between the tries.
  - `healNdjsonTailSync(path, options?)` is the sync form of `healNdjsonTail()`, with the same repairs, result and errors.
  - The new option `lastLine: true` of the two heal functions adds `lastLine` to the result: the last complete line after the repair, without its newline, or `undefined` for a file without a complete line. The function reads it from the tail only. Without the option, the heal of a file that ends in a newline still reads one byte.
  - The error of a last line longer than `maxLineBytes` is still a `RangeError`. It now has the code `ERR_NDJSON_LINE_TOO_LONG` (the export `NDJSON_LINE_TOO_LONG`) and the fields `path`, `lineBytes` and `maxLineBytes`. Its text gives the length, the limit and the option, and tells that `Infinity` turns the limit off. To give the length, the function reads back to the start of the line, without a copy in memory.
  - The new option `tempName(target)` of `writeFileAtomic()`, `writeFileAtomicSync()` and `editFile()` gives the name of the temporary file. A name with `/` or `\` is a `TypeError` with the code `ERR_INVALID_ARG_VALUE`. The default name stays `.<name>.<16 hex digits>.tmp`.
  - When the group and the others cannot read the final file, the temporary file now starts with the mode `0o600`. Then the function sets the final mode before the rename.
  - The async and the sync forms share one set of steps, so their edge cases are the same.
- @procedures/client@0.27.5

## 0.27.4

### Patch Changes

- Updated dependencies [8970a1e]
  - @procedures/client@0.27.4

## 0.27.3

### Patch Changes

- 194cdfb: Four file helpers in the new entry `@procedures/fs/files` (roadmap O51). The package root exports them too.
  
  PATCH: new exports before 1.0.0. No export or behavior changes.
  
  - `writeFileAtomic(path, data, options?)` writes a temporary file in the folder of the target, flushes it and renames it over the target. After a failure, it removes the temporary file. The file keeps the permissions of the target, unless `mode` is set. On Windows, it tries the rename again after `EPERM`, `EACCES` or `EBUSY` for `renameRetryMs` (2000 by default), and it does not flush the folder.
  - `healNdjsonTail(path, options?)` repairs the end of an append-only NDJSON file after a crash. It reads only the last line from the end. It cuts off a part of a line with `ftruncate`, and it adds the newline to a complete last record. It gives `{ action: "none" | "truncated" | "newline", bytes, size }`.
  - `KeyedLock` and `withLock(key, fn, options?)` let one caller at a time hold a key in the process. The waiters get the key in the order of their calls. With `ifHeld: "skip"`, the call gives `{ ran: false }` when the key has a holder. A `signal` stops a wait. A key without a holder uses no memory.
  - `editFile(path, transform, options?)` reads a file, waits for `transform` and writes the result with `writeFileAtomic()`, one edit at a time for each path. A missing file gives `initial` or `undefined`. The same text or `undefined` writes nothing.
  
  jarvis has copies of these helpers since jarvis PR #85 (`TODO(@procedures)`). It can use the package after the release.
- @procedures/client@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1

## 0.24.0

### Patch Changes

- @procedures/client@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1

## 0.22.0

### Patch Changes

- @procedures/client@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0

## 0.17.4

### Patch Changes

- @procedures/client@0.17.4

## 0.17.3

### Patch Changes

- @procedures/client@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1

## 0.17.0

### Patch Changes

- @procedures/client@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
  - @procedures/client@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1

## 0.12.0

### Patch Changes

- @procedures/client@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/client@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2

## 0.9.1

### Patch Changes

- b5db4d8: Under the root of the files of a host, the `git.*` procedures are confined, not refused (roadmap R33, tracker item O35). Without a root, nothing changes. PATCH: a procedure that the root refused now works in the root.
  
  - The core: `ProcedureContext.fsRoot` is the root of a confined call. `confineToRoot()` of `@procedures/fs` gives it to the handler of each confined procedure and of each program procedure.
  - The working folder `cwd` of each `git.*` procedure must be in the root, and its default is the root. The pathspecs, the `path` of `git.blame` and of the worktree procedures, and the `dest` of `git.clone` must be in the root too.
  - Under a root, git runs with `GIT_CEILING_DIRECTORIES` at the parent of the root, so it finds no repository above the root. The configuration of the system does not apply. The global configuration has only `user.name`, `user.email` and `init.defaultBranch` of the host.
  - The `-c` options turn off the hooks (an empty `core.hooksPath`) and `core.fsmonitor`. Only the transports https, http, ssh and git are permitted. Git does not go into a submodule.
  - Before the first command in a folder, git examines the repository. A repository outside the root (through a `.git` file or an alternate object folder), a repository with submodules, and a configuration key that starts a program are refused: `filter.*`, `diff.external`, `core.sshCommand`, `credential.helper`, `include.path` and the others. The error names each key.
  - `git.clone` and `git.remote.set` refuse a URL with `::` under a root.
  - `@procedures/git` now depends on `@procedures/fs` (for the rules of `@procedures/fs/root`).
- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1

## 0.8.0

### Patch Changes

- 90ea741: `confineToRoot(registry, root)` confines each procedure of a registry to a root (roadmap R33). The `fs.*` procedures get the handlers of `createFsModule({ root })`. Each other procedure gets the decision of `rootDecisionOf()`: the root examines the path inputs of its `metadata.fsRoot`, or it refuses the procedure with `FORBIDDEN` and the reason `outside-root`. A procedure without rules is refused when its effects are not known, name `fs`, or write `process`.
  
  The new entry `@procedures/fs/root` has the rules of the root without the procedures. `inRoot()` takes an optional base folder, and `resolveRoot()` an optional name for its error. `confineFsProcedures()` does not change.
- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0

## 0.5.0

### Minor Changes

- a47bee6: The hosts can confine the file procedures to a root (roadmap R33).
  
  - `confineFsProcedures(registry, root)` of `@procedures/fs` replaces the handler of each `fs.*` procedure of a registry with the handler of `createFsModule({ root })`. It adds no procedure. A nested `fs.*` call of another procedure is confined too. The root must be a folder that exists.
  - `mark --fs-root <folder>` confines the `fs.*` procedures of each mode and host of `mark`: a command, the REPL, `--server`, `serve` and `mcp`. Give the flag before the command.
  - A `mark` command uses a CLI server only when the server has the same root. The lockfile of `@procedures/peer` has the new field `fsRoot`, and `findServer()` compares it.
  - `procedure-server --fs-root <folder>` and `mark serve --fs-root <folder>` confine the procedures of the server.
  - The MCP server reads `MCP_FS_ROOT`, and `mark mcp` has the flag `--fs-root`. `fs` is not a tool namespace, so the tools do not change.
  - A path outside the root gives `FORBIDDEN` with the reason `outside-root`. A procedure that reads files with `node:fs`, or that starts a program, is not confined.
  - `@procedures/lib/cli-flags` has the global flags `--fs-root` and `--events`, and the field `repeatable`.

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0

## 0.4.0

### Minor Changes

- 3d76cb7: `fs.copy` refuses an existing destination without `overwrite`: the error has the code `EEXIST`, and the copy changes nothing. This applies to a file and to a folder, with `recursive` true or false. Before, the default copy (`recursive: true`) kept an existing file, merged a folder into an existing folder, and reported success. With `overwrite`, the copy replaces the files at the destination, as before.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0

## 0.3.0

### Minor Changes

- f23c7ad: Four file procedures (roadmap R44). `fs.write.json` writes a value as JSON through a file that it renames at the end. `fs.hash` gives the hash of a file. `fs.temp` makes a temporary folder. `fs.watch` gives the changes of a file or folder as a stream without an end. With `createFsModule({ root })`, each path stays in the root, and `fs.temp` makes its folders in the folder `.tmp` of the root.
- bc70357: The file procedures can have a root (roadmap R33). `createFsModule({ root })` gives the procedures of `fsModule`, and each path of each input must be in the root folder. A relative path starts at the root. Without a root, the procedures operate as before.
  
  The procedures refuse a path that goes up with `..`, an absolute path outside the root and another drive. They also refuse a symlink or a junction that goes out of the root. The error has the code `FORBIDDEN` and the new reason `outside-root` (the type `ForbiddenReason` of `@procedures/client`). For a path that does not exist, the check uses the real path of the nearest existing folder. `registerFsProcedures(registry, { root })` takes the root too.

### Patch Changes

- 3c40d2d: The root of the file procedures accepts a path by its real path. On Windows, a folder can have a short 8.3 name (`RUNNER~1`) and a long real name. A path that used the short name was refused when the root was a link.
- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1

## 0.2.0

### Minor Changes

- 76d0d64: **Breaking:** an import of a package registers nothing. The `./register` entry of a package registers its procedures, and the procedures of the modules that they need, in the global registry (ARCHITECTURE-PROPOSALS-2026-10, P9).
  
  - `import "@procedures/git"` gives the exports and registers nothing. Use `import "@procedures/git/register"`, or give `gitModule` (`@procedures/git/module`) to `createRegistry()`.
  - `import "@procedures/client/register"` registers the control flow (`client.chain` and the others) and `procedure.define`/`get`/`list`/`delete`. `createRegistry()` adds them to each new registry, as before. The new `registerClientProcedures(registry?)` does the same for any registry.
  - Each `register<Name>Procedures(registry?)` function is in the module of its package, takes a registry (the global one by default) and registers the modules that the package requires. `registerBridge` (splay) and `register` (store) are now `registerSplayProcedures` and `registerStoreProcedures`. The old names stay for one version.
  - `sideEffects` names only `./dist/register.js`, so a bundler can drop the rest of a package.
  - The bundles require `clientModule`, so `@procedures/bundle-mcp/register` gives the whole tool surface.
  - `lib new` makes `src/module.ts` and a root without side effects, and `procedure new` adds procedures to the module.

### Patch Changes

- Updated dependencies [0cf4bea]
- Updated dependencies [44d3e30]
- Updated dependencies [76d0d64]
  - @procedures/client@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
