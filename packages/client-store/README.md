# @procedures/store

[![npm](https://img.shields.io/npm/v/@procedures/store?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/store)

The program store of the [client](https://github.com/mark1russell7/client) ecosystem. A program is procedure-as-data: the aggregation that `procedure.define` turns into a procedure. The store keeps programs after the process ends, and `procedure.load` defines them again.

```sh
npm install @procedures/client @procedures/store
```

## Example

```ts
import { Client, LocalTransport, PROCEDURE_REGISTRY, allCoreProcedures } from "@procedures/client";
import { attachProgramStore, FileProgramStore } from "@procedures/store";

PROCEDURE_REGISTRY.registerAll(allCoreProcedures, { override: true });
attachProgramStore(PROCEDURE_REGISTRY, new FileProgramStore("./programs.json"));
const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

// Define a program, then store it
await client.exec({
  $proc: ["procedure", "define"],
  input: { path: ["math", "addTen"], aggregation: { $proc: ["client", "add"], input: { a: { $ref: "input.x" }, b: 10 } } },
});
await client.exec(["procedure", "store"], { path: "math.addTen" });

// After a restart: load the stored programs, then call them
await client.exec(["procedure", "load"], { all: true });
console.log(await client.exec(["math", "addTen"], { x: 5 })); // 15
```

## The program store

| Backend | Where the programs are |
|---|---|
| `MemoryProgramStore` | In the memory of the process |
| `FileProgramStore` | In one JSON file. A lock file and an atomic rename keep the programs of two processes. |
| `CollectionProgramStore` | In a collection storage: `InMemoryStorage` of `@procedures/collections`, `ApiStorage` (the collection procedures of a server) or `HybridStorage` (a local cache with a remote copy) |

A host gives a registry its store with `attachProgramStore(registry, store)`. The procedures use the store of the caller's registry:

| Procedure | What it does |
|---|---|
| `procedure.store` | Writes the program of a procedure that `procedure.define` made. A code procedure is the error `NOT_A_PROGRAM`. |
| `procedure.load` | Defines the stored programs of a `path`, a `prefix` or `all`. A program at the path of a code procedure is a conflict: the code stays. |
| `procedure.sync` | `push` writes the programs of the registry. `pull` defines the stored programs. `both` pushes, then pulls the programs that the registry does not have. |
| `procedure.remote` | `status` gives the kind of the store. `connect` and `disconnect` are `NOT_IMPLEMENTED`: the host makes the store. |

Without a store, `procedure.store`, `load` and `sync` fail with the code `NOT_CONFIGURED`.

A loaded program is a runtime-defined procedure, so it is data-driven: a server with an expose rule lets it call only the exposed procedures. Load programs only from a store that you trust. A host with no expose rule runs each call of a program.

## The storage layer

These parts moved here from `@procedures/client` (roadmap 3.2):

- `ApiStorage` and `HybridStorage`, the collection storages that need a `Client`. Before, they were in `@procedures/client/collections`.
- The synced registry (`createSyncedRegistry()`, `SyncedProcedureRegistry`), the serialization of procedures, and the dynamic handler loader with an allowlist (`createDynamicHandlerLoader`).
- `procedure.register`, which registers a procedure from a handler reference.

Importing `@procedures/store/register` registers its procedures. An import of the package root registers nothing.

## License

MIT
