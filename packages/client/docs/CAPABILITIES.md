# Capabilities

Each call of a procedure operates with a **capability**. A capability has three parts: a clearance (the data that the call can see), the permitted side effects, and a deadline. A nested call gets the same capability or a narrower one. It does not get a wider one at any time.

The [call policy](./POLICY.md) controls which procedures a call can reach. A capability controls what those procedures can do. The design and its decisions are in [CAPABILITIES-2026-10.md](../../documentation/CAPABILITIES-2026-10.md).

A host without a capability operates as before: the feature costs nothing until a host uses it.

## Declare the effects of a procedure

A procedure declares its effects in its metadata:

```ts
createProcedure()
  .path(["notes", "read"])
  .meta({ description: "Read a note", effects: { reads: ["fs"], writes: [] } })
  .input(zodAdapter(z.object({ id: z.string() })))
  .output(zodAdapter(z.string()))
  .handler(async ({ id }) => readNote(id))
  .build();
```

| Field | Meaning | Absent |
|---|---|---|
| `reads` | The resources whose state the output depends on | Not known |
| `writes` | The resources that the procedure changes. `[]`: it changes nothing | Not known |
| `destructive` | It can delete or overwrite data that it did not make | `true` when it writes (as in MCP) |
| `idempotent` | A second identical call changes nothing more | `false` |

The resource names are strings. Four names are standard:

| Name | The resource |
|---|---|
| `fs` | The files of the host |
| `network` | Systems outside the host |
| `process` | It starts a program that its caller (or the code of the project) chooses: that program can do anything |
| `registry` | The procedure registry |

An application adds its own names. The packages of this repository use these:

| Name | The resource |
|---|---|
| `docker`, `mongo`, `s3` | The service that a package wraps |
| `jobs` | The background processes that the host started (`node.spawn`, `vitest.watch`) |
| `programs` | The stored programs of `@procedures/store` |
| `server` | A server that a procedure starts or stops |
| `collection:<name>` | One collection of `createCollectionProcedures()` |

A procedure that starts one fixed program (`git status` starts `git`) does not declare `process`. It declares what that program reads and writes. Code of the project is not a fixed program: a test file, a build plugin, a package script and a git hook can do anything. So `vitest.run`, `vite.build`, `pnpm.install` and `git.commit` write `process`.

`withEffects(effects, procedures)` gives one declaration to a group of procedures. `PURE_EFFECTS` (`reads: [], writes: []`) is the declaration of a procedure that only calculates.

**A procedure without a declaration has unknown effects.** A host with a restriction refuses it.

## Give a host a capability

The host makes the capability from its authentication: a token, a session cookie, the user of a local CLI. The input, the metadata and an unauthenticated header do not give it.

```ts
// Only the procedures that change nothing
const policy = hostPolicy({ readOnly: true });

// A capability for each request, from what the transport authenticated
const policy = hostPolicy({
  capability: (request) => (sessions.get(request.metadata["token"]) === "owner" ? undefined : guest),
  clearanceOrder: ladder(["public", "shared", "private"]),
});

const server = new ProcedureServer(procedureServerOptions(policy, registry));
```

A `Client` takes a capability for the procedures that it starts in its own process: `new Client({ transport, capability })`. A page that starts the programs of its visitors gives a read-only one.

`narrowCapability(current, request, order?)` makes a capability: the meet of the clearances, the intersection of the permitted effects, and the earlier deadline.

## Clearance and resources

An application gives its types to the framework in one place:

```ts
declare module "@procedures/client" {
  interface Register {
    clearance: "public" | "shared" | "private";
    resources: { notes: NotesStore };
  }
}
```

Then `ctx.capability.clearance` and `ctx.resources` have these types in every handler. The host gives the resources for the capability of each invocation:

```ts
hostPolicy({
  capability: capabilityOfRequest,
  clearanceOrder: ladder(["public", "shared", "private"]),
  // A view of the store with only the notes of the clearance
  resources: (invocation) => ({ notes: notes.visibleTo(invocation.capability.clearance) }),
  // A second net: the output that leaves the host
  admitItem: (item, invocation) => levelOf(item) <= invocation.capability.clearance,
});
```

The output filter drops a refused stream item. A refused single value gives `FORBIDDEN` with the reason `clearance`. The filter examines only the output that leaves the host, not the results of nested calls.

## Nested calls

A nested call (`ctx.client.call`) gets the capability of its caller. A caller can ask for less:

```ts
await ctx.client.call(["notes", "list"], {}, { narrow: { clearance: "public" } });
```

An interceptor can narrow too: `next({ capability: { effects: { writes: [] } } })`. The framework calculates the result, so a request for more has no effect.

The admission examines each call of a host, each nested call of a data-driven procedure (`client.chain` and the other procedures that start refs, because their caller chose the refs), and each nested call with a narrowed capability. A procedure of code that declares its effects answers for its own nested calls. `checkEffects(procedures)` examines those declarations against `metadata.calls`: a declaration must include the reads and the writes of each procedure in its `calls`. Two things are the claim of the caller. The first is what a program that it starts does (the `process` of a callee). The second is the flags `destructive` and `idempotent`, because they depend on the input that the caller gives.

## Deadlines

`timeoutInterceptor({ ms })` (or `hostPolicy({ timeoutMs })`) sets the deadline of the capability. The nested calls see it in `ctx.capability.deadline`, and a call after it gives `TIMEOUT`. A remote call sends the remaining time in milliseconds (the metadata key `procedure-timeout`). The server can only make its own deadline earlier with it, so a difference between two clocks has no effect.

## Errors and explanations

| Code | Reason | HTTP |
|---|---|---|
| `FORBIDDEN` | `effects-undeclared`: the procedure declares no effects, and the capability has a restriction | 403 |
| `FORBIDDEN` | `effects-exceeded`: the declared effects are more than the permitted effects | 403 |
| `FORBIDDEN` | `clearance`: the output filter refused a single value | 403 |
| `TIMEOUT` | the deadline passed | 504 |

The response metadata of a server has the reason. `explainInvocation(path, capability, registry)` gives the decision and its reason without a call.

## MCP

The MCP server gives each tool the hints of its effects: `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` (open world: it reads or writes `network`, or writes `process`). A data-driven tool gets no hints, because its operands decide what it does. `mark mcp --read-only` (or `MCP_READ_ONLY=1`) serves only the tools that change nothing, and each call operates with that capability.
