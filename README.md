# client

[![npm](https://img.shields.io/npm/v/@mark1russell7/client?color=2346c4&label=npm)](https://www.npmjs.com/package/@mark1russell7/client)
[![CI](https://github.com/mark1russell7/client/actions/workflows/ci.yml/badge.svg)](https://github.com/mark1russell7/client/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2346c4)](LICENSE)
[![Site](https://img.shields.io/badge/site-live-2346c4)](https://mark1russell7.github.io/client/)

**Procedures as data for TypeScript.** You define a procedure one time: a path, a Zod input, a Zod output and a handler. Then you use it in the same process, over HTTP or WebSocket, from the `mark` CLI, or from Claude as an MCP tool. A program is plain JSON: calls, references to earlier results, and control flow. The client gives streams, middleware, retries and a cache.

**[The site](https://mark1russell7.github.io/client/)** has the [Composer](https://mark1russell7.github.io/client/composer/) (build a program from blocks, then start it in your browser), the [middleware lab](https://mark1russell7.github.io/client/lab/), the [procedure catalog](https://mark1russell7.github.io/client/catalog/) and the [status board](https://mark1russell7.github.io/client/status/).

[![A program of ten calls runs in the browser: the trace shows each call as it happens](packages/site/media/live-program.gif)](https://mark1russell7.github.io/client/composer/)

## Install

```sh
npm install @mark1russell7/client zod
```

The packages need Node.js 22 or later. They are ES modules.

## Example

```ts
import { z } from "zod";
import { Client, LocalTransport, PROCEDURE_REGISTRY, allCoreProcedures, createProcedure, zodAdapter } from "@mark1russell7/client";

// A procedure: a path, a typed input and output, and a handler
PROCEDURE_REGISTRY.register(
  createProcedure()
    .path(["greet"])
    .input(zodAdapter(z.object({ name: z.string() })))
    .output(zodAdapter(z.string()))
    .handler(async ({ name }) => `Hello, ${name}!`)
    .build(),
);
for (const p of allCoreProcedures) if (!PROCEDURE_REGISTRY.has(p.path)) PROCEDURE_REGISTRY.register(p);

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));
console.log(await client.exec({ $proc: ["greet"], input: { name: "Ada" } }));
// Hello, Ada!

// A program is JSON: the second step reads the result of the first step
const result = await client.exec({
  $proc: ["client", "chain"],
  input: {
    steps: [
      { $proc: ["client", "add"], input: { a: 2, b: 3 } },
      { $proc: ["client", "multiply"], input: { a: { $ref: "$last" }, b: 4 } },
    ],
  },
});
console.log(result.final);
// 20
```

Replace `LocalTransport` with `HttpTransport` or `WebSocketTransport` to use the same procedures on a server. [PROGRAM-FORMAT.md](packages/documentation/PROGRAM-FORMAT.md) tells the rules of programs.

## Compared with other tools

| | client | tRPC | JSON-RPC 2.0 | MCP TypeScript SDK |
|---|---|---|---|---|
| Unit of work | A procedure: path, Zod input and output, handler | A router of queries, mutations and subscriptions | A method name and its parameters | Tools, resources and prompts |
| Transports | In the process, HTTP (JSON or NDJSON streams), WebSocket, MCP over stdio, a CLI | HTTP and WebSocket links | Not part of the specification | stdio and Streamable HTTP |
| Programs as data | JSON programs with references and control flow | No | A batch of calls | No |
| Streams | Async generators, with flow control | Subscriptions | Notifications only | Progress notifications |
| Types on the client | A typed call for each path | End-to-end inference from the router type | No | JSON Schema of the tools |
| Maturity | Version 0.x, one author | Version 11, wide use | A stable specification | The official SDK |

tRPC is the better choice for type inference from server to client in one application. This repository is for procedures that many hosts use: a program, a CLI, a server and Claude.

## Packages

All packages are in `packages/`. The public packages have one version together.

| Group | Packages |
| --- | --- |
| Core | [`client`](packages/client) (procedures, client, transports, middleware), [`client-collections`](packages/client-collections) (data structures), [`client-dag`](packages/client-dag) (dependency graphs) |
| Commands | [`client-shell`](packages/client-shell), [`client-git`](packages/client-git), [`client-pnpm`](packages/client-pnpm), [`client-docker`](packages/client-docker), [`client-node`](packages/client-node), [`client-vite`](packages/client-vite), [`client-vitest`](packages/client-vitest), [`client-cue`](packages/client-cue), [`client-cli`](packages/client-cli) |
| Data and services | [`client-fs`](packages/client-fs), [`client-s3`](packages/client-s3), [`client-mongo`](packages/client-mongo), [`client-sqlite`](packages/client-sqlite), [`client-snapshot`](packages/client-snapshot), [`client-splay`](packages/client-splay) |
| Servers and MCP | [`client-server`](packages/client-server), [`server`](packages/server), [`mcp`](packages/mcp), [`client-mcp`](packages/client-mcp), [`mcp-dev-tools`](packages/impl-mcp-dev) (an MCP server for Claude Code) |
| Tools | [`mark`](packages/mark) (the `mark` CLI, package `@mark1russell7/cli`), [`client-lib`](packages/client-lib), [`client-procedure`](packages/client-procedure), [`client-playground`](packages/client-playground) |
| Bundles | [`bundle-dev`](packages/bundle-dev), [`bundle-mcp`](packages/bundle-mcp) |
| Private | [`site`](packages/site) (the website), [`documentation`](packages/documentation), [`cli`](packages/cli) (the repository tool) |

The package name of each public package is `@mark1russell7/<folder>`, except `mark` (`@mark1russell7/cli`) and `impl-mcp-dev` (`@mark1russell7/mcp-dev-tools`).

## Use with Claude

`@mark1russell7/mcp-dev-tools` is an MCP server with 62 developer tools: Docker, MongoDB, SQLite, CUE, Vitest and the workspace. Each tool call has a time limit, and a tool can use only the procedures that it declares. Add it to the MCP configuration of Claude Code:

```json
{
  "mcpServers": {
    "dev-tools": { "command": "npx", "args": ["-y", "@mark1russell7/mcp-dev-tools"] }
  }
}
```

## Build and test

1. Install the dependencies: `pnpm install`
2. Build all packages: `pnpm build`
3. Start the tests: `pnpm test`
4. Examine the types: `pnpm typecheck`

`pnpm build` builds the packages in the sequence of their dependencies. Each package writes its output to its `dist/` folder. Git ignores `dist/`. [ONBOARDING.md](packages/documentation/ONBOARDING.md) tells more.

## Release

[RELEASE.md](packages/documentation/RELEASE.md) tells how the packages go to npm. `node scripts/check-packages.mjs` examines each package as npm gives it.

## Other repositories

Some packages use general packages from other repositories: `cue`, `splay` and `docker-sqlite`. A general package does not use a package of this repository.

## License

MIT. Refer to [LICENSE](LICENSE).
