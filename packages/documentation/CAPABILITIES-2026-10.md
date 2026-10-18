# Invocation capabilities (proposal, October 2026)

> **Status:** approved on 2026-10-13. The owner accepted the default answers and gave the remaining decisions to the implementation, with generality and the long term as the goals. The section "Decisions" records them.
>
> **Implementation:** phases A to D are done, merged on 2026-10-15 (`9a73417`). Each of the 158 procedures declares its effects, and `effects.snapshot.txt` pins the hints of the 62 MCP tools. The guide for users is [CAPABILITIES.md](../client/docs/CAPABILITIES.md).
>
> **Prerequisite:** registration without side effects ([P9 in the proposals](./ARCHITECTURE-PROPOSALS-2026-10.md#p9-registration-without-side-effects-p2-option-3)), decided on the same day.

## The problem

The call policy of a host controls which procedures a call can reach: `expose`, `metadata.calls` and `strictCalls`. It does not control two other things:

- **Data:** which records a call can see.
- **Effects:** which side effects a call can have.

A private application of the owner, a personal knowledge graph, needs both. It has its own procedure registry with an audience gate. Its 185 procedures can move onto `@procedures/client` only when the client has a general form of that gate.

The same mechanism has users in this repository:

- **The MCP server:** tool hints (`readOnlyHint`, `destructiveHint`) from declarations, and a read-only session for an AI client.
- **The retry and cache middlewares:** by default, they retry and keep only procedures that change nothing.
- **`mark`:** a question before a destructive command.
- **The site:** the demo of the Composer at the lowest permissions.

## The rule

Each invocation operates with a **capability**. A nested call gets the same capability or a narrower one. It does not get a wider one at any time.

| Part | What it limits | Today | The narrowing rule |
|---|---|---|---|
| **Reach** | the procedures that a call can start | `expose`, `metadata.calls`, `strictCalls` | no change |
| **Effects** | the side effects of the call and its nested calls | none | the permitted effects of a nested call are a subset |
| **Clearance** | the data that the call can see | none | the clearance of a nested call is the same or lower |
| **Deadline** | the time of the call and its nested calls | a signal and the timeout interceptor | the deadline of a nested call is the same or earlier |

This is the object-capability rule of attenuation. The clearance part is the "no read up" rule of access control. The deadline part is the deadline propagation of gRPC.

## Declarations: the effects of a procedure

A procedure declares its effects in its metadata:

```ts
interface Effects {
  /** The resources that the procedure reads, by name ("world", "fs", "git"). */
  reads?: readonly string[];
  /** The resources that it changes. An empty list: it changes nothing. */
  writes?: readonly string[];
  /** True: a second call with the same input changes nothing more. */
  idempotent?: boolean;
  /** True: it can delete or overwrite data that it did not make. */
  destructive?: boolean;
  /** True: it talks to systems outside this host. */
  openWorld?: boolean;
}

createProcedure()
  .path(["git", "status"])
  .meta({ description: "...", effects: { reads: ["git"], writes: [] } });
```

- The resource names are strings that each application chooses. The framework only compares sets.
- **A procedure without `effects` has unknown effects.** A host without restrictions starts it, as today. A host with restrictions refuses it: the rule fails closed.
- The MCP server makes the tool hints from the declaration:

| MCP hint | From |
|---|---|
| `readOnlyHint` | `writes` is an empty list |
| `destructiveHint` | `destructive` |
| `idempotentHint` | `idempotent` |
| `openWorldHint` | `openWorld` |

## The capability of an invocation

```ts
interface Capability<C = unknown> {
  /** The data that the call can see. The application gives the order of the values. */
  readonly clearance?: C;
  /** The permitted effects. Absent: all effects. */
  readonly effects?: { readonly reads?: readonly string[] | "any"; readonly writes?: readonly string[] | "any" };
  /** The time (ms since the epoch) at which the call and its nested calls stop. */
  readonly deadline?: number;
}
```

- **Only the host sets the capability, from its authentication.** A token, a session cookie or the user of a local CLI gives it. The input, the metadata and an unauthenticated header do not give it.
- The capability is a frozen field of the invocation, not a key of `metadata`. A handler can change `metadata`, and a remote caller sends it. So the capability is not in `metadata`.
- A handler reads `ctx.capability`. Its nested calls get the same capability. A nested call can ask for a narrower one: `ctx.client.call(path, input, { narrow })`. The framework calculates the narrower value, so a wider request has no effect.
- A remote call does not send the capability as an authority. The remote host calculates its own capability from its own authentication. Only the deadline goes on the wire, because a narrower deadline is always safe.
- A host without a capability configuration behaves as today. All existing tests stay correct.

## Three places of enforcement

1. **Admission.** Before the input validation, the invocation compares the declared effects of the procedure with the permitted effects. For a nested call, this occurs before the lookup, as `nestedCallRefusal()` does today. A refused path tells nothing about the procedure.
2. **Narrowed resources.** The host gives a context function: `resources: (invocation) => R`. The handler reads `ctx.resources`. The function can give a narrowed resource for a lower clearance: a database view that contains only the records of that clearance.
3. **The output filter.** The host can give `admitItem: (item, invocation) => boolean`. The invocation drops each stream item, or the value, that the function refuses. This is a second net for a handler that reads data without `ctx.resources`.

The order of clearance values comes from the application:

```ts
interface ClearanceOrder<C> {
  /** True when `a` is the same as or lower than `b`. */
  leq(a: C, b: C): boolean;
  /** The highest value that is the same as or lower than both. */
  meet(a: C, b: C): C;
}
```

A ladder (`public < shared < private`) is one case. A partial order also works: separate compartments, for example `health` and `finance`, where neither is lower than the other.

## Errors and explanations

- A refusal is an `InvocationError` with the code `FORBIDDEN` and a reason: `effects-undeclared`, `effects-exceeded`, `clearance` or `deadline`.
- HTTP gives the status 403. MCP gives `isError`. `mark` stops with exit code 1.
- `explainInvocation(path, capability, registry)` gives the decision and its reason without a call. An application can show it to a user.

## A static check

A procedure with `metadata.calls` names its nested calls. So a test can calculate the effects of the whole call tree:

- `checkEffects(registry)` finds each procedure whose declared effects do not include the effects of the procedures that it starts.
- A committed snapshot of the effects, next to `tools.snapshot.txt`, shows each change in a review.

## The private application on this design

| Its mechanism today | In this design |
|---|---|
| An audience that a request can only narrow | the clearance of the capability, set by the host |
| `reads: "world" \| "schema"`, and refused when undeclared | `effects`, with the fail-closed rule |
| A scoped view of the world below the top audience | the `resources` function |
| A filter of output rows by id and lineage | `admitItem` |
| An error with HTTP status 403 | `FORBIDDEN` |
| An explanation procedure for a decision | `explainInvocation` |
| Nested invocations without an audience (a known gap) | closed: nested invocations get the capability |

## What this proposal does not do

- **No policy language.** The policies are typed TypeScript functions.
- **No capability from the wire.** Each host calculates its own.
- **No sandbox.** A handler that reads the disk directly is not stopped. The output filter is the second net, and the tests are the third.

## Phases

| Phase | Contents | Effort |
|---|---|---|
| **A. Effects** | The `effects` metadata, the capability field and its propagation, the admission check, `FORBIDDEN`, the MCP hints, a read-only mode for `mark mcp`, `checkEffects` | M |
| **B. Clearance** | `ClearanceOrder`, the host function that calculates a capability from a request, `resources`, `admitItem`, `explainInvocation` | M |
| **C. Deadline** | A deadline that the timeout interceptor sets, a narrower deadline for nested calls, the deadline header on the wire | S |
| **D. Declarations** | `effects` for each procedure of this repository, with the snapshot | M |

Phase A and phase D together give the MCP hints and the read-only mode. Phase B is the part that the private application needs.

## Decisions (2026-10-13)

The owner accepted the default answer of each question. These decisions complete the design.

1. **The order of clearance values is a partial order.** The application gives `leq` and `meet`. `ladder(levels)` makes the order of a ladder. A capability without a clearance has no data limit.
2. **The effect names are free strings, with four standard names:** `fs` (the files of the host), `network` (systems outside the host), `process` (it starts any program) and `registry` (the procedure registry). An application adds its own names, for example `world`.
3. **The defaults of the hints follow MCP.** A procedure that writes is destructive, except when it declares `destructive: false`. A procedure is idempotent only when it declares it. A procedure is "open world" when it reads or writes `network`, or writes `process`. So the declaration has no separate field for it.
4. **Reach stays separate** in phases A to C: `expose`, `metadata.calls` and `strictCalls` do not change.
5. **An application gives its types in one place.** It augments the interface `Register` of `@procedures/client` with `clearance` and `resources` (the pattern of TanStack Router). Then `ctx.capability.clearance` and `ctx.resources` have its types, without a type parameter on each handler.
6. **`ctx.resources`, not fields directly on `ctx`.** The names of an application cannot hide the fields of the framework.
7. **Control flow has no effects of its own.** `client.chain` and the other procedures that run refs declare empty effects. Their nested calls get the capability, so the admission examines each nested call. Their MCP hints do not say "read only", because their operands can write.
8. **An interceptor can only narrow.** `next({ capability })` gives a request, and the framework calculates the narrower capability from it.
9. **The wire carries a time, not a date.** A remote call sends the remaining milliseconds, as gRPC does. The server calculates its own deadline. A difference between two clocks then has no effect.
10. **A refused output value is an error.** The output filter drops a refused stream item. A refused single value gives `FORBIDDEN` with the reason `clearance`.

The declarations of phase D added these decisions:

11. **The static check compares the resources, not the flags.** A caller cannot touch fewer resources than its callees: a caller of `fs.write` writes `fs`. But `destructive` and `idempotent` depend on the input that the caller gives: `lib.new` makes new files with `fs.write`, so it is additive. These flags are the claim of the caller, and the effects snapshot shows them in a review.
12. **Code of the project is `process`.** A test file, a build plugin, a package script and a git hook can do anything. So `vitest.run`, `vite.build`, `pnpm.install`, `lib.new` (it starts the cue CLI of the workspace) and the git procedures that start hooks write `process`.
13. **`process` has one meaning: it starts any program.** The background processes that a host started (`node.spawn`, `vitest.watch`) are the resource `jobs`. To stop or list them is not to start a program.
14. **A procedure has one purpose.** A procedure that reads or writes by an input flag declares the writes, so its readers declare them too. `git.remote` was such a procedure. At this time, `git.remote` reads and `git.remote.set` writes.

## Questions for the owner (answered)


Each question has a default. The work uses the default when there is no other answer.

1. **The order of clearance values: a ladder or a partial order?** Default: a partial order through `leq` and `meet`. A ladder is one case of it.
2. **The effect names: free strings only, or also a standard set?** Default: free strings, plus the standard names `fs`, `process` and `network` for the packages of this repository.
3. **Reach: keep `expose` and `calls` separate, or move them into the capability?** Default: separate in phase A to C. A later change can move them, without a change of behavior.
4. **Resources: `ctx.resources`, or fields directly on `ctx`?** Default: `ctx.resources`, so the names of an application cannot hide the fields of the framework.

## The root of the files (roadmap R33)

A host can confine its procedures to one folder, the root: `mark --fs-root <folder>`, `procedure-server --fs-root <folder>` and `MCP_FS_ROOT` of the MCP host. Before 2026-10-17, the root confined only the `fs.*` procedures and their nested calls. A procedure that read with `node:fs` or started a program reached each folder of the host.

### The rule

Under a root, each procedure keeps each path that it reaches in the root, or the host refuses it. A refusal is the error of a path outside the root: `FORBIDDEN` with the reason `outside-root`. Without a root, nothing changes.

### The mechanism

The three hosts start `confineToRoot(registry, root)` of `@procedures/fs` after their last registration. It is the general form of `confineFsProcedures()`. It replaces handlers, and it adds no procedure, so the lists of the tools do not change. For each procedure, `rootDecisionOf()` gives one of five kinds:

| Kind | The procedure | What the root does |
|---|---|---|
| `fs` | `fs.*` | The handlers of `createFsModule({ root })`, as before |
| `confined` | It declares its path inputs in `metadata.fsRoot` | It examines each path before the handler starts. A working folder without a value is the root. |
| `program` | It starts the program of its input (`shell.run`, `shell.stream`) | It refuses a call of a client. It accepts the nested call of a confined procedure that names the procedure in `metadata.calls`. |
| `refused` | Its rules give a reason (`refuse`), or the default refuses it | It refuses each call |
| `unchanged` | It reaches no file | Nothing |

The declaration is `FsRootRules` of the core: `cwd`, `paths`, `names`, `required`, `values`, `refuse` and `program`. The guide [CAPABILITIES.md](../client/docs/CAPABILITIES.md#declare-the-paths-of-a-procedure) tells what each field does. These rules apply:

- A path of `paths` starts at the root, and the handler gets the absolute path. A procedure in the process resolves a path against the working folder of the process, which is not the root.
- A name of `names` starts at the working folder. The handler gets it as the caller gave it, because the procedure or its program resolves it in the same way.
- The check is the check of the `fs.*` procedures (`inRoot()` of `@procedures/fs/root`). It follows each symbolic link and junction.
- A program procedure operates only for a confined caller. That caller chose the program and its arguments, and the root examined the paths of the caller. The core gives the caller to the handler as `ctx.caller`, so an input cannot give it. This is one level: a program procedure cannot start another one.
- The context of the call holds the caller, so the rule also holds for a stream (`docker.logs` with `follow` starts `shell.stream`).
- The handler of a confined procedure and of a program procedure gets the root in `ctx.fsRoot`. A procedure that starts a program uses it to keep the program in the root. Git and gh use it.

### The default for a procedure without rules

A procedure without `metadata.fsRoot` gets a decision from its effects. The decision fails closed, as the admission of a capability does:

- Its effects are not known: refused. The host cannot know which files it reaches.
- Its effects read or write `fs`: refused. It reaches files, and it does not tell which inputs name them.
- Its effects write `process`: refused. It starts any program.
- A data-driven procedure (`client.chain`, a procedure of `procedure.define`): unchanged. It starts the refs of its caller, and each nested call gets its own decision.
- Any other procedure: unchanged. Its effects name no file and no program.

Refusal is the safe default. A procedure of another package that reaches files works under a root only after its package declares the rules. The effects tell which procedures reach files, so a procedure that reaches no file (`mongo.*`, `json.*`, `http.*`) keeps working.

### The procedures under a root

| Procedures | Under a root | The inputs that the root examines | Why |
|---|---|---|---|
| `fs.*` | confined (the `fs` kind) | each path, the `cwd` of `fs.glob`, the matches of `fs.glob`, the stats of `fs.readdir` | The handlers of `createFsModule({ root })` |
| `archive.create` | confined | `output` and `source` (from the root), `cwd` (the default is the root), each name of `files` (from `cwd`) | The procedure reads and writes in the process. The walk does not follow a link. |
| `archive.extract` | confined | `archive`, `target` | The checks of the entries keep the extract in the target |
| `archive.list` | confined | `archive` | |
| `sqlite.query`, `sqlite.execute`, `sqlite.tables`, `sqlite.schema`, `sqlite.transaction`, `logs.store`, `logs.query` | confined | `dbPath`, which a call must give. `:memory:` is not a path. | sql.js keeps the database in memory, so an `ATTACH` or a `VACUUM INTO` does not reach the disk. The default database is in the home folder. |
| `sqlite.migrate` | confined | `dbPath` (a call must give it), `folder` | |
| `sqlite.backup` | confined | `dbPath` (a call must give it), `to` | |
| `cue.init`, `cue.add`, `cue.remove`, `cue.generate`, `cue.validate` | confined | `cwd` (the default is the root) | The files of the project go through `fs.*`. The `cue` program starts in a folder of the installed cue package, with its files only. |
| `lib.scan`, `lib.graph`, `lib.audit`, `lib.rename` | confined | `rootPath` (the default is the root) | The files go through `fs.*`. Their nested git calls are confined too. |
| `lib.new` | refused | | It starts the cue program of the workspace, which is code of the project |
| `procedure.new` | confined | `path` (the default is the root) | The files go through `fs.*` |
| `docker.ps`, `docker.logs`, `docker.stop`, `docker.rm`, `docker.images`, `docker.inspect`, `docker.pull`, `docker.push`, `docker.tag`, `docker.prune`, `docker.volume.*`, `docker.network.*` | confined | `cwd` (the default is the root) | The command goes to the daemon, and the input names no path of the host |
| `docker.run` | refused | | A volume binds a host folder into the container |
| `docker.exec` | refused | | The container starts the program of the caller, and it can have host folders |
| `docker.build` | refused | | The Dockerfile runs programs, and docker resolves the context and the Dockerfile itself |
| `docker.compose.*` | refused | | A compose file can name host paths: bind mounts, `env_file`, `include` and `extends` |
| `git.*` | confined | `cwd` (the default is the root). From `cwd`: the pathspecs `paths` of `git.status`, `git.add`, `git.commit`, `git.checkout`, `git.diff`, `git.stash.push`, `git.reset` and `git.restore`, the `path` of `git.blame`, `git.worktree.add` and `git.worktree.remove`, and the `dest` of `git.clone` | Git stays in the root. The section [Git under a root](#git-under-a-root) gives the rules. |
| `pnpm.*` | refused | | pnpm reads the workspace, the store and `.npmrc` outside the working folder. The scripts and `.pnpmfile.cjs` of a project start programs. |
| `shell.run`, `shell.stream` | program | `cwd` (the default is the root) | Only the nested call of a confined procedure that names them, for example `docker.ps` |
| `shell.exec`, `shell.which` | refused | | A command line in a shell, and the folders of `PATH` |
| `vitest.run`, `vitest.coverage`, `vitest.watch`, `vite.dev`, `vite.build`, `vite.preview`, `node.run`, `node.spawn`, `restic.run`, `tailscale.run`, `pdf.render`, `claude.start`, `cli.run`, `npm.pack`, `ecosystem.procedures` | refused (the default) | | They write `process` |
| `s3.download` | confined | `destPath` | Without `destPath`, the object stays in memory |
| `s3.presign` | confined | | No input names a file. The AWS SDK reads the credentials of the host, as for each `s3.*` procedure. |
| `snapshot.create` | refused | | Its default folder is the working folder of the process. Tar reads each folder from its parent folder, and the procedure starts git and pnpm itself. |
| `snapshot.restore` | refused | | It downloads the archive into the temporary folder of the host through `s3.download`. The names of the folders come from the data of the snapshot. |
| `snapshot.diff` | refused | | Its default folders are the paths that the snapshot recorded on another machine, and it starts git itself |
| `schedule.add`, `schedule.list`, `schedule.remove` | confined | | No input names a file. The store of the host holds the schedules, and the host chooses its file. |
| `exif.read` | confined | `path` | |
| `iosBackup.find`, `iosBackup.file`, `iosBackup.messages` | refused | | The default backups are in the home folder. The procedures follow a linked backup folder, and the names of the files come from the data of `Manifest.db`. |
| `privacyScan.files` | confined | `paths`, `termsFile`, `allowFile` | The walk of a folder does not follow a link |
| `dag.traverse` | unchanged | | It is data-driven: `lib.scan` and the procedure of `visit` get their own rules |
| `claude.start` | refused | | It starts the claude program of its input with free arguments. The agent of the turn reaches each folder, and claude reads its configuration in the home folder. |
| `claude.read`, `claude.follow` | confined | `outputFile` | |
| `manifest.generate` | confined | `outputDir` | Without `outputDir`, it writes no file |
| `server.start`, `server.stop`, `server.status` | refused | | They read and write the lock files in the home folder (`~/.mark`). `server.start` starts a server without the root. |
| `procedure.store`, `procedure.load`, `procedure.sync` | confined | | No input names a file. The program store of the host holds the programs. A loaded program is data-driven. |
| `gh.*` | confined | `cwd` (the default is the root), and the `dir` of `gh.run.download` (from `cwd`) | The nested `shell.run` is the call of a confined procedure. Under a root, `GIT_DIR` is the null device, so the git of gh finds no repository: give `repo`. |
| The other procedures with `fs` in their effects | refused (the default) | | They read or write files, and they declare no rules |
| `mongo.*`, `json.*`, `yaml.*`, `http.*`, `client.*`, `program.*`, `procedure.list`, `vitest.stop`, `node.kill` and the other procedures without `fs` and `process` | unchanged | | They reach no file of the host |

The tests of each package pin the kind of each of its procedures. They also show a path in the root that works and a path outside that is refused. A refused procedure works without a root.

### Git under a root

Each `git.*` procedure is confined (tracker item O35). Its handler operates in `underGitRoot()` with `ctx.fsRoot`, and each git command of the handler gets these rules:

- The working folder must be in the root. `GIT_CEILING_DIRECTORIES` is the parent of the root, so git does not look for a repository above the root.
- `GIT_CONFIG_NOSYSTEM=1` turns off the configuration of the system. `GIT_CONFIG_GLOBAL` is a file of the process with only `user.name`, `user.email` and `init.defaultBranch` of the global configuration of the host. The variables that move the repository or add configuration do not apply: `GIT_DIR`, `GIT_WORK_TREE`, `GIT_CONFIG_PARAMETERS`, `GIT_ALLOW_PROTOCOL` and the others.
- The `-c` options turn off what starts a program: `core.hooksPath` is an empty folder, and `core.fsmonitor` is false. Only the transports https, http, ssh and git are permitted. The transports `file` and `ext` and the remote helpers are off. Git does not go into a submodule: `diff.ignoreSubmodules=all`, `submodule.recurse=false`, and `--no-recurse-submodules` for a fetch and a pull. A checkout is quiet, so it does not examine the submodules that it brings.
- Before the first command of a call in a folder, the procedure examines the repository. It refuses a git folder, an object folder or an alternate object folder outside the root. It also refuses a repository with submodules (a `.gitmodules` file in the working tree, the index or `HEAD`), and the configuration keys below.
- Under a root, `git.clone` and `git.remote.set` refuse a URL with `::`, because the form `<transport>::<address>` starts a program. The folder of a clone must be in the root, also when it comes from the URL.

The keys of the configuration of a repository that a root refuses. The error names each of them.

| The keys | Why |
|---|---|
| `filter.*.clean`, `filter.*.smudge`, `filter.*.process`, `diff.external`, `diff.*.command`, `diff.*.textconv`, `merge.*.driver`, `diff.tool`, `merge.tool`, `difftool.*`, `mergetool.*` | They start a program for the files |
| `core.sshCommand`, `core.gitProxy`, `core.askPass`, `core.editor`, `core.pager`, `pager.*`, `sequence.editor`, `core.alternateRefsCommand`, `credential.helper`, `credential.*.helper`, `remote.*.uploadpack`, `remote.*.receivepack`, `remote.*.vcs`, `hook.*`, `trailer.*.command` | They start a program |
| `gpg.program`, `gpg.*.program`, `gpg.ssh.defaultKeyCommand`, and `commit.gpgSign`, `tag.gpgSign`, `tag.forceSignAnnotated` or `push.gpgSign` when they are not false | They start the signing program |
| `include.path`, `includeIf.*.path` | They read a configuration file outside the repository |
| `core.worktree`, `core.excludesFile`, `core.attributesFile`, `commit.template`, `init.templateDir`, `mailmap.file`, `blame.ignoreRevsFile`, `diff.orderFile`, `gpg.ssh.allowedSignersFile`, the files of `http.*` (`sslCert`, `sslKey`, `sslCAInfo`, `cookieFile` and the others) | They name a file or a folder outside the repository |
| `protocol.*`, `bundle.*`, `fetch.bundleURI`, `transfer.bundleURI`, a `remote.*.url` with `::`, a `url.*.insteadOf` whose base has `::`, and a `submodule.*.update` with `!` | They let git use a transport or a local bundle, or they start a program |

`core.hooksPath` and `core.fsmonitor` in the configuration of a repository are not refused: the `-c` options override them.

### The limits

- The check and the operation are two steps. The check does not see a link that another process changes between them.
- A confined procedure answers for its handler. A handler that reads a path that its rules do not name is a defect of its rules. The tests of the packages examine the rules.
- A program that a confined procedure starts reads its own configuration. For example, the docker program reads its configuration in the home folder.
- `confineToRoot()` examines the procedures of the registry when it starts. A procedure that a host registers later gets no rules. `procedure.define` makes data-driven procedures, and their nested calls get the rules.
- The root does not replace the permissions of the operating system.
- Git examines a repository before the first command of a call in a folder, and not again. A later command of the same call can bring a `.gitmodules` file and a submodule into the working tree, for example the patch of `git.stash.import`. Git can then start git in the folder of the submodule, with the configuration of that folder. The quiet checkout and `diff.ignoreSubmodules=all` close the main ways.
- Under a root, the global configuration of the host does not apply to git. A credential helper of the host thus does not apply: a push over HTTPS needs SSH, or a credential in the environment.
- A procedure can write a private temporary file outside the root, for example the body of `gh.api` or the files of git under a root. The caller does not name it, and the procedure deletes it.
