# Call policy and interceptors

This document tells how a host controls which procedures a caller can reach, and how code runs around each invocation. The code is in `src/procedures/policy.ts`, `src/procedures/invoke.ts` and `src/procedures/interceptors.ts`. What the reached procedures can do (their data, side effects and time) is the subject of [CAPABILITIES.md](./CAPABILITIES.md).

## The problem

A host serves procedures to a caller outside the process: Claude through the MCP server, a program through HTTP or WebSocket. The registry of the host also has procedures that the caller must not reach, for example `shell.exec`. A procedure can call other procedures through `ctx.client`. So the host must control the nested calls too, not only the first call.

## The expose rule

A host gives an `expose` rule: a function that gets a procedure path and gives `true` for each procedure that the callers can reach.

```typescript
const server = new ProcedureServer({
  expose: (path) => ["docker", "lib", "client"].includes(path[0] ?? ""),
});
```

- The server serves only the exposed procedures.
- The MCP server lists only the exposed procedures as tools. `client-mcp` makes the rule from a tool surface: `exposeRule({ namespaces, exclude })`. A bundle exports its surface as `mcpNamespaces` and `mcpExclude`.

## Nested calls

The rule for a nested call depends on the immediate caller. A host without `expose` and without `strictCalls` (a library, the local `mark` CLI) checks no nested call.

| Caller | It can call |
|---|---|
| A data-driven procedure: control flow (`client.chain`), a procedure with the `runs-refs` tag, a procedure that `procedure.define` made | Only exposed procedures. Its caller chooses what it calls. |
| A procedure of code with `metadata.calls` | The procedures that `calls` names, and the exposed procedures. Another call fails with `NOT_DECLARED`. |
| A procedure of code without `calls` | Any procedure. With `strictCalls: true`, only exposed procedures (`NOT_EXPOSED`). |

The check runs before the lookup and before the input validation. So a refused call tells nothing about the procedure.

### `metadata.calls`

A procedure of code declares the procedures that it calls:

```typescript
createProcedure()
  .path(["docker", "run"])
  .meta({ description: "Run a Docker container", calls: ["shell.run"] })
```

- An entry is a procedure key (`"shell.run"`) or a namespace (`"fs.*"`). A namespace entry matches the keys at any depth: `"fs.*"` matches `fs.read.json`.
- The registry refuses an invalid list. It refuses `"*"` alone. A procedure whose callees come from its input is data-driven: give it the `runs-refs` tag.
- Declare exact keys. Each declared key extends the reach of each caller of the procedure.

### The reach of a server

`hiddenReach(procedures, expose)` gives each procedure that is not exposed but that an exposed procedure can reach through its declarations, also through more than one step. A data-driven procedure adds nothing: it reaches only exposed procedures.

The dev-tools MCP server (`impl-mcp-dev`) sets `strictCalls`. Two tests keep its policy true:

- `calls.test.ts` runs each tool of code with a sample input. An interceptor records each nested call and answers it with a fake, so no nested procedure runs. Each call to a procedure that is not a tool must be declared.
- `reachable.snapshot.txt` pins the reach. `shell.exec` and `cli.run` must never be in it.

## Interceptors

An interceptor is a function around one invocation. `invokeProcedure()` runs the interceptors of its options around the input validation, the context and the handler. The nested calls get the same interceptors and name their parent invocation.

```typescript
const audit: Interceptor = async (invocation, next) => {
  console.error(`${invocation.path.join(".")} at depth ${invocation.depth}`);
  return next();
};

new ProcedureServer({ interceptors: [audit, timeoutInterceptor({ ms: 60_000 })] });
new Client({ transport, interceptors: [audit] });
```

An interceptor can:

- examine the invocation: the procedure, the input, the metadata, the signal, the parent invocation and the depth;
- refuse it: throw an error;
- give another signal or metadata to the handler and the nested calls: `next({ signal, metadata })`;
- examine or wrap the output: a value, or a stream.

The first interceptor of the list is the outermost.

### The interceptors of the package

| Interceptor | What it does |
|---|---|
| `timeoutInterceptor({ ms })` | It ends an invocation that runs longer than `ms` with a `TIMEOUT` error (HTTP 504), and it aborts the signal of the handler. For a stream, the limit covers the whole stream. By default it limits only the calls of the host (depth 0): a nested call gets the signal of its parent. The dev-tools MCP server limits each tool call (`MCP_TOOL_TIMEOUT_MS`, default 10 minutes). |
| `tracingInterceptor({ onSpan })` | It makes a span for each invocation, with the id of its parent span and a trace id. A stream span ends with the last item. |
| `metricsInterceptor()` | It counts the calls, the errors and the time of each procedure. `snapshot()` gives the counts. |

### Interceptors and middlewares

The client middlewares (retry, cache, auth, circuit breaker, rate limit) wrap `transport.send`: they run for a remote call. The interceptors run for each invocation of a local procedure, also for each nested call. Use a middleware for the network and an interceptor for the procedures.

## The policy of a host

`hostPolicy()` (`server/host-policy.ts`) builds the policy of a host from one set of options: `expose` (patterns, a tool surface or a function), `exclude`, `strictCalls`, `timeoutMs`, more `interceptors`, and the `token` and `browser` checks of the network transports. `procedureServerOptions(policy, registry)` gives it to a `ProcedureServer`, and `createPeer({ policy })` of `client-server` gives it to a peer.

```ts
import { ProcedureServer, createRegistry, hostPolicy, procedureServerOptions } from "@procedures/client";
import bundleMcpModule from "@procedures/bundle-mcp/module";

const policy = hostPolicy({ expose: { namespaces: ["docker"] }, strictCalls: true, timeoutMs: 60_000 });
const server = new ProcedureServer(procedureServerOptions(policy, createRegistry(bundleMcpModule)));
```

The three hosts use it: the MCP dev-tools server (the tool surface of its bundles, `strictCalls`, a time limit), the procedure server of `server` and `mark serve` (the token and `--expose`), and the warm server of `mark` (the token).
