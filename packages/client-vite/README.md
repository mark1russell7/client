# @mark1russell7/client-vite

`client-vite` starts Vite as procedures: a development server, a build, a preview server, and the stop of a server.

| Procedure | Input | Output |
|---|---|---|
| `vite.dev` | `cwd`, `port`, `host`, `open` | `{ serverId, url, pid }` |
| `vite.build` | `cwd`, `outDir`, `mode` | `{ success, outDir }` |
| `vite.preview` | `cwd`, `port` | `{ serverId, url, pid }` |
| `vite.stop` | `serverId` | `{ success }` |

All input fields are optional, except `serverId`. Without `cwd`, a procedure uses the current folder.

## Use

```typescript
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import "@mark1russell7/client-vite"; // registers vite.*

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

const server = await client.exec(["vite", "dev"], { cwd: "/path/to/app", port: 5173 });
console.log(server.url); // for example http://localhost:5173/

await client.exec(["vite", "stop"], { serverId: server.serverId });

const build = await client.exec(["vite", "build"], { cwd: "/path/to/app", mode: "production" });
console.log(build.outDir); // the absolute path of the output folder
```

From the command line:

```sh
node packages/mark/dist/cli.js vite build --cwd packages/site
```

## How it works

- The procedures start the Vite of the project: they find `vite` from `cwd`, and they start its bin with Node. They use no shell and no `npx`, so a value cannot start a command, and nothing is downloaded (deep dive WRP-8). A project without Vite gets an error that tells you to add it.
- A value of `host`, `mode` or `outDir` that starts with `-` is an error.
- `vite.dev` and `vite.preview` wait until Vite prints its local URL, for 30 seconds at most. A server that does not get ready stops, and the procedure fails.
- The servers are records of the process registry of `client-shell` (group `vite`). `vite.stop` stops the server and the processes that it started. The servers stop when the host process stops.
- `vite.build` waits for the end of the build. A failed build is an error with the output of Vite.

## Related packages

- `client-shell`: the process registry and `runCommand()`.
- `client-node`: Node processes as procedures.
