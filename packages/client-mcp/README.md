# @procedures/mcp-server

[![npm](https://img.shields.io/npm/v/@procedures/mcp-server?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/mcp-server)

`@procedures/mcp-server` serves typed procedures as MCP tools to Claude and to other MCP clients. Its folder in the monorepo is `packages/client-mcp`.

- `createMcpHost()` builds a complete MCP host from a registry, a tool surface and a host policy.
- `McpServerTransport` is the MCP face of a `ProcedureServer`. The host uses it for each face.
- A procedure can ask the person at the caller for input or a confirmation (MCP elicitation).
- A procedure can tell the caller the progress of a long call. The caller can cancel a call.
- A procedure can declare the fields of its output that hold text from outside the host. The host shows that text in envelopes.

## Contents

- [Install](#install)
- [Start a host](#start-a-host)
- [The faces](#the-faces)
- [Questions to the person](#questions-to-the-person)
- [Progress and cancel](#progress-and-cancel)
- [Text from outside the host](#text-from-outside-the-host)
- [The result of a tool](#the-result-of-a-tool)
- [The transport](#the-transport)
- [The procedures of this package](#the-procedures-of-this-package)
- [Set up Claude](#set-up-claude)

## Install

```bash
npm install @procedures/mcp-server @procedures/client
```

The package needs Node.js 22 or later.

## Start a host

`createMcpHost()` builds the registry, the expose rule, the host policy, the `ProcedureServer` and a transport for each face. It starts nothing: `start()` starts the faces.

```typescript
import { createRegistry } from "@procedures/client";
import { createMcpHost } from "@procedures/mcp-server";

const host = createMcpHost({
  registry: createRegistry(graphModule),
  surface: { namespaces: ["graph"] },
  readOnly: process.argv.includes("--read-only"),
  name: "graph",
  version: "0.1.0",
});
await host.start();
console.error(`${host.tools().length} tools over stdio`);
```

The options:

| Option | Default | Function |
|---|---|---|
| `registry` | the global registry | The procedures of the host. |
| `modules` | none | Modules of procedures. Without `registry`, the host makes a registry of them. With `registry`, the host registers them in it. |
| `surface` | each procedure | The tools: a surface (`{ namespaces, exclude }`), keys and patterns (`["git.status", "fs.*"]`), or a function of the path. A list of keys gives a subset of tools. |
| `exclude` | none | Keys that are not tools, also when the surface matches them. |
| `readOnly` | `false` | With `true`, the tools are only the procedures that change nothing. Each call has that capability. |
| `policy` | strict calls | More of the host policy (`hostPolicy()` of `@procedures/client`): `strictCalls`, `timeout`, `interceptors`, `capability`, `resources`, `token`, `browser`. Refer to [Strict calls](#strict-calls). |
| `interceptors` | none | Interceptors after `policy.interceptors`. A function gets the registry and the expose rule of the host. |
| `serverOptions` | none | The options of `ProcedureServer` that the policy does not give: `autoRegister`, `collections`, `idempotency`. |
| `name`, `version` | `procedure-server`, `1.0.0` | The server info in the MCP handshake. |
| `instructions` | none | The instructions of the server. The MCP client gives them to the model. |
| `faces` | `{ stdio: true }` | The faces of the host. Refer to [The faces](#the-faces). |
| `elicitation` | ask the person | The rules of the questions to the person. Refer to [Questions to the person](#questions-to-the-person). |
| `untrusted` | tag `untrusted-content` | The envelopes of text from outside the host. |
| `content` | none | A hook that gives other text blocks for a result. |
| `json` | `pretty` | The JSON of the default text blocks: `pretty` (an indent of 2 spaces) or `compact` (one line, fewer tokens). |
| `toolFilter` | none | More filters of the tools: tags and internal procedures. |
| `toolName` | `git.status` | The name of the tool of a procedure, a function of the path. `(path) => path.join("_")` gives `git_status`. A server that moves to the host keeps its tool names. |
| `streamLimits` | 100 items, 30 seconds | The limits of a stream that can continue without an end. |
| `debug` | `false` | With `true`, the host writes debug lines to stderr. |

The host has these parts:

| Part | Function |
|---|---|
| `registry`, `policy`, `server` | The registry, the `HostPolicy` and the `ProcedureServer` of the host. |
| `expose` | The expose rule: the procedures that are tools. |
| `transports` | One `McpServerTransport` for each face. |
| `start()`, `stop()` | These functions start and stop the faces. The calls in flight get the grace time. A host stops one time. |
| `closed` | A promise. It resolves when the host stopped. |
| `tools()`, `state()` | The tools of the host at this time, and the state of each face. |

The host does not build the options of `ProcedureServer` by hand. `hostPolicy()` and `procedureServerOptions()` of `@procedures/client` give them. The dev-tools server (`mark mcp`) and `mcp.serve` use `createMcpHost()` too.

### Strict calls

Strict calls are the safe default of an MCP host. A procedure of code without `metadata.calls` can use only the tools of the host in its nested calls. Thus a tool cannot reach a procedure that the host does not expose. A procedure with `metadata.calls` can also use the procedures that it declares.

To turn strict calls off, give `policy: { strictCalls: false }`. Turn them off only for a host whose tools you trust with each procedure of the registry.

## The faces

Each face is one `McpServerTransport` on the server of the host. A host can have more than one face.

| Face | Function |
|---|---|
| `stdio: true` | The standard input and output. Over stdio, `console.log` writes to stderr from `start()` on, because stdout carries the protocol. |
| `stdio: { stdin, stdout, stopOnEnd, redirectConsole }` | Other streams, for a test or an embedding. With `stopOnEnd: true` (the default), the host stops when the input ends. |
| `http: { port, host, path, token, allowedOrigins }` | Streamable HTTP. The host listens on `127.0.0.1` by default. Without a token, the face takes the token of the policy. |
| `sdk` | One or more MCP SDK transports, for example the `InMemoryTransport` of a test. |

When the client closes the input of stdio, the host stops, and `closed` resolves. The entry `dist/server.js` of `@procedures/mcp-dev-tools` then ends its process.

Each tool call over Streamable HTTP carries the credentials of its HTTP request: the bearer token, the cookies, the headers and the query. Thus the request hook of the policy (`principalOf`) and the token check of the server apply to each call. When the server reads cookies, the face trusts a request with a cookie only from a named origin (CSRF). A call over stdio or over a given SDK transport is local: it has the local marker `LOCAL_CREDENTIALS` (CLI-1). The peer of stdio is the parent process. Thus a host with a token serves the calls of its stdio face.

## Questions to the person

A procedure can ask the person at the caller for input or a confirmation during a call. MCP elicitation is one face that answers. The shape is not specific to MCP: another face (a terminal) can answer the same questions.

```typescript
import { elicitConfirmation } from "@procedures/client";

handler: async (input, ctx) => {
  const answer = await elicitConfirmation(ctx, `Did you give the URL ${input.url} yourself?`, {
    consent: "user-provided",
  });
  if (!answer.confirmed) return { released: false, note: answer.reason ?? "The person said no." };
  return { released: true, by: answer.by };
};
```

The parts in `@procedures/client`:

- `ctx.elicit` is the function of the face. It is absent when no one can answer. Its `modes` tells which kinds of question the face can ask: `form`, `url`.
- `elicitInput(ctx, request)` asks a question with a form of fields. The fields are the primitive fields of MCP: text, number, yes or no, and choices.
- `elicitConfirmation(ctx, question)` asks a question of yes or no. `confirmed` is true only for an accepted yes.
- The procedures that a procedure starts ask the same person.

Each answer has an `action`:

| Action | Meaning |
|---|---|
| `accept` | The person, or the consent of the operator, gave the answer. `by` tells who: `person` or `operator`. |
| `decline` | The person said no. |
| `cancel` | The person closed the question without a choice, or the call aborted. |
| `unavailable` | No one can answer. `reason` tells why. The helpers do not throw for this case. |

The operator can give a consent when the server starts. Thus a server refuses input from the user without a consent of the operator. The host option `elicitation` has the rules:

| Option | Default | Function |
|---|---|---|
| `ask` | `true` | With `false`, the face does not ask the person, also when the client can. |
| `operatorConsent` | none | `true` for each question with a consent key, or a list of consent keys. |
| `timeout` | 5 minutes | The time that the face waits for the answer of the person. |

```typescript
const allow = process.argv.includes("--allow-user-provided") || process.env.POLITE_CRAWLER_ALLOW_USER_PROVIDED === "1";
const host = createMcpHost({
  registry,
  elicitation: { operatorConsent: allow ? ["user-provided"] : [] },
});
```

The order of the answers:

1. When the client can ask (it declares elicitation), the face asks the person. A decline of the person stays a decline.
2. When the question of the face fails (a timeout, a lost connection), the answer is `unavailable`. The operator does not answer: the person can see the question, and silence is not a consent.
3. When the client cannot ask, the consent of the operator answers. The operator answers only a form question with a consent key that the operator gave.
4. Else the answer is `unavailable`, with a reason.

Over Streamable HTTP, each question goes on the stream of its tool call.

## Progress and cancel

A procedure tells the caller the progress of a long call with `ctx.progress`:

```typescript
handler: async (input, ctx) => {
  for (const [index, url] of input.urls.entries()) {
    await fetchPage(url, ctx.signal);
    await ctx.progress?.({ progress: index + 1, total: input.urls.length, message: url });
  }
  return { done: input.urls.length };
};
```

- `ctx.progress` is present only when the client sent a progress token. Each update becomes a `notifications/progress` message.
- Only the call of the host gets `ctx.progress`, not its nested calls. Thus the values of one call stay in order.
- The function does not reject. A client that is gone does not stop the call.
- A stream does not need it: the face gives each item of a stream as progress. When the procedure of a stream uses `ctx.progress`, the face gives only those updates.
- When the client cancels a call (`notifications/cancelled`), `ctx.signal` of the procedure aborts.

## Text from outside the host

A procedure that gives text from outside the host (a web page, a mail) declares the fields of its output that hold it. Then a model gets that text apart from the data, as data and not as instructions.

```typescript
import { untrustedText } from "@procedures/client";

createProcedure()
  .path(["crawl", "read"])
  .meta({ description: "Read a stored page", untrusted: ["web_content"], effects: { reads: ["store"], writes: [] } })
  .handler(async (input) => ({
    doc: input.doc,
    web_content: [untrustedText(page.text, { url: page.url, capture: page.capture })],
  }));
```

- The value of an untrusted field is a text, an `UntrustedText` with its source, or a list of them.
- The first text block of the result has the data as JSON, without the untrusted fields.
- The second text block has a notice, then one envelope for each text: `<untrusted-content id="..." url="..." capture="...">`.
- A random id marks the start and the end of each envelope of one answer. A text cannot hold the name of the tag, in any case and with any dash or space. Thus a text cannot close its envelope.
- In the structured content and the output schema, each untrusted field is a string: the text of its envelopes.
- The host option `untrusted` changes the tag (`tag: "untrusted-web-content"`) and the notice. Its `wrap` function replaces the envelopes.
- `createUntrustedEnvelopes()` gives the same envelopes for other uses.

## The result of a tool

- A tool whose output schema is an object has an `outputSchema`. Each result then has `structuredContent`, and a text block for clients that do not read it.
- The hints of a tool (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) come from the declared `effects` of its procedure.
- `metadata.toolHints` of a procedure can make its tool look more dangerous than its effects. Refer to [Hint overrides](#hint-overrides).
- `metadata.title` of a procedure gives the `title` of its tool.
- A failed call gives `isError` with the code and the reason in `_meta`.
- The host option `content` can give other text blocks for a result that is a value. It gets the tool, the value and the default content, and it gives undefined for the default.
- The host option `json: "compact"` gives the JSON of the default blocks on one line. Use it in place of a content hook for that change only.

### Hint overrides

The declared effects stay the truth: the host enforces the effects, not the hints. An override can only make a tool look more dangerous:

| Hint | The only value of an override | Meaning |
|---|---|---|
| `readOnlyHint` | `false` | The tool can change something. |
| `idempotentHint` | `false` | A second call can change more. |
| `destructiveHint` | `true` | The tool can delete or overwrite data. |
| `openWorldHint` | `true` | The tool can reach systems outside the host. |

```typescript
createProcedure()
  .path(["notes", "read"])
  .meta({ description: "Read a shared note", effects: { reads: ["store"], writes: [] }, toolHints: { openWorldHint: true } });
```

The registry refuses each other value when the procedure registers, also when the effects give the same value. The type `ToolHintOverride` refuses it before the registry does. `toolHintsOf()` of `@procedures/client` gives the hints of a tool with its override.

## The transport

`McpServerTransport` is the MCP face of a `ProcedureServer`. `createMcpHost()` makes one for each face. Use it directly to add an MCP face to a server of your own:

```typescript
import { ProcedureServer, createRegistry } from "@procedures/client";
import { McpServerTransport } from "@procedures/mcp-server";

const registry = createRegistry(myModule);
const server = new ProcedureServer({ registry, autoRegister: true });
server.addTransport(new McpServerTransport(server, { registry, transport: "stdio", serverInfo: { name: "my-server", version: "1.0.0" } }));
await server.start();
```

- The tools follow the registry. When the list of tools changes, the transport sends `notifications/tools/list_changed`.
- The options `instructions`, `stdio`, `elicitation`, `untrusted` and `content` are the same as the options of the host.
- `toolFilter` selects the tools: `include` (a function of the path), `pathPrefix`, `includeTags`, `excludeTags` and `excludeInternal`.
- `transport: "http"` with `httpOptions` gives Streamable HTTP. `sdkTransport` connects an MCP SDK transport.
- `transport: "sse"` is not implemented.

## The procedures of this package

| Procedure | Function |
|---|---|
| `mcp.serve` | This procedure starts an MCP host over stdio with `createMcpHost()`. Without `namespaces`, the tools come from `mcpNamespaces` and `mcpExclude` of the bundles (default `@procedures/bundle-mcp`). Without a list, no procedure is a tool. |
| `mcp.list-tools` | This procedure lists the procedures of the registry of the caller as MCP tools. |

`exposeRule()`, `mergeSurfaces()` and `importBundles()` give the tool surface of some bundles.

## Set up Claude

`@procedures/mcp-dev-tools` is a ready MCP server with this package. Add it to the MCP configuration of Claude Code or Claude Desktop:

```json
{
  "mcpServers": {
    "dev-tools": { "command": "npx", "args": ["-y", "@procedures/mcp-dev-tools"] }
  }
}
```

The [README of mcp-dev-tools](../impl-mcp-dev/README.md) has the configuration.

## License

MIT
