# @procedures/mongo

[![npm version](https://img.shields.io/npm/v/@procedures/mongo.svg)](https://www.npmjs.com/package/@procedures/mongo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

MongoDB client wrapper with client procedures for local or RPC access. Provides a comprehensive set of procedures for database operations, collection management, document CRUD, indexing, and aggregation pipeline support.

## Overview

`client-mongo` bridges MongoDB operations into the client procedure ecosystem, enabling both:
- **Local usage**: Direct MongoDB connection with native driver
- **RPC usage**: Remote procedure calls via `client.call()`

The package follows the client procedure pattern, with 20 procedures in 5 categories. Its register entry (`import "@procedures/mongo/register"`) registers them:
- **Database**: `ping`, `info`
- **Collections**: `list`, `create`, `drop`, `stats`
- **Documents**: `find`, `get`, `insert`, `update`, `delete`, `count`, `aggregate`, `distinct`, `bulk`, `explain`
- **Indexes**: `list`, `create`, `drop`
- **Change streams**: `mongo.watch`

## Architecture

```mermaid
graph TB
    subgraph "Client Ecosystem"
        Client["@procedures/client"]
        Registry["Procedure Registry"]
    end

    subgraph "client-mongo Package"
        Register["register.ts<br/>(Auto-registers procedures)"]
        Connection["connection.ts<br/>(Connection Management)"]

        subgraph "Procedure Categories"
            DB["Database Procedures<br/>ping, info"]
            Collections["Collection Procedures<br/>list, create, drop, stats"]
            Documents["Document Procedures<br/>find, get, insert, update, delete, count, aggregate"]
            Indexes["Index Procedures<br/>list, create, drop"]
        end

        Types["types.ts<br/>(Type Definitions)"]
        ProcTypes["procedures.types.ts<br/>(Typed Interface)"]
    end

    subgraph "MongoDB Driver"
        MongoDB["mongodb npm package"]
        MongoClient["MongoClient"]
        Db["Db Instance"]
    end

    subgraph "External Systems"
        MongoServer["MongoDB Server<br/>(local or remote)"]
    end

    Register --> Client
    Register --> Registry

    DB --> Connection
    Collections --> Connection
    Documents --> Connection
    Indexes --> Connection

    Connection --> MongoClient
    MongoClient --> Db
    Db --> MongoServer

    Types -.-> DB
    Types -.-> Collections
    Types -.-> Documents
    Types -.-> Indexes

    ProcTypes -.provides typing.-> Client

    style Register fill:#e1f5ff
    style Connection fill:#fff4e1
    style Types fill:#f0f0f0
```

### Package Dependency Flow

```mermaid
graph LR
    App["Your Application"]
    ClientMongo["@procedures/mongo"]
    Client["@procedures/client"]
    MongoDB["mongodb"]

    App --> ClientMongo
    ClientMongo --> Client
    ClientMongo --> MongoDB

    App -.client.call.-> Client
    Client -.executes.-> ClientMongo
    ClientMongo -.queries.-> MongoDB
```

### Connection Management Flow

```mermaid
sequenceDiagram
    participant App
    participant Connection
    participant MongoClient
    participant MongoDB

    App->>Connection: connect({ uri, database })
    Connection->>MongoClient: new MongoClient(uri)
    MongoClient->>MongoDB: Connect
    MongoDB-->>MongoClient: Connected
    Connection->>Connection: setDefaultConnection()
    Connection-->>App: MongoConnection

    App->>Connection: getDb()
    Connection-->>App: Db instance

    App->>Connection: disconnect()
    Connection->>MongoClient: close()
    MongoClient->>MongoDB: Disconnect
```

## Installation

```bash
npm install @procedures/mongo
```

Since 0.2.0, an import of the package registers nothing. To register its procedures in the global registry:

```ts
import "@procedures/mongo/register";
```

## Configuration

### Environment Variables

```bash
# MongoDB connection URI (optional, defaults to mongodb://localhost:27017)
MONGODB_URI=mongodb://localhost:27017

# Default database name (optional, defaults to "test")
MONGODB_DATABASE=myapp
```

### Programmatic Configuration

```typescript
import { connect } from "@procedures/mongo";

// Using environment variables
await connect();

// With explicit options
await connect({
  uri: "mongodb://localhost:27017",
  database: "myapp",
  clientOptions: {
    // Any MongoDB client options
    maxPoolSize: 10,
    minPoolSize: 2,
  }
});
```

### The first call connects

A host does not have to call `connect()`. When there is no open connection, the first procedure call connects with the options of `configure()`, or with the environment variables. Concurrent first calls share one attempt.

```typescript
import { configure } from "@procedures/mongo";

configure({ uri: "mongodb://localhost:27017", database: "myapp" });
```

### The collection and the database of a call

Each procedure reads `collection` and `database` from its input. An MCP tool call can set them. The call metadata is the fallback, for the clients that set it.

```typescript
await client.exec(["mongo", "documents", "count"], { collection: "users", query: { active: true } });
```

## API Reference

### Connection Management

#### `connect(options?): Promise<MongoConnection>`

Create and connect to MongoDB. Sets the default connection used by all procedures.

```typescript
interface MongoConnectionOptions {
  uri?: string;                    // Default: MONGODB_URI or mongodb://localhost:27017
  database?: string;               // Default: MONGODB_DATABASE or "test"
  clientOptions?: MongoClientOptions;
}

interface MongoConnection {
  getDb(): Db;
  getClient(): MongoClient;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}
```

**Example:**
```typescript
const conn = await connect({
  uri: "mongodb://localhost:27017",
  database: "myapp"
});
```

#### `disconnect(): Promise<void>`

Disconnect the default connection.

```typescript
await disconnect();
```

#### `getDb(): Db`

Get the database instance from the default connection.

```typescript
const db = getDb();
const collection = db.collection("users");
```

#### `getClient(): MongoClient`

Get the MongoClient from the default connection.

```typescript
const client = getClient();
```

#### `getDefaultConnection(): MongoConnection`

Get the default connection instance. Throws if not connected.

#### `setDefaultConnection(conn: MongoConnection): void`

Set the default connection (advanced usage).

#### `hasDefaultConnection(): boolean`

Check if a default connection exists.

### Registered Procedures

`import "@procedures/mongo/register"` registers the procedures in the global registry. The package root registers nothing: a host gives `mongoModule` to `createRegistry`. Each procedure of a collection takes `collection`, and each procedure takes an optional `database`. The catalog of the site shows the input and the output schema of each procedure.

| Procedure | What it does | Main input |
|---|---|---|
| `mongo.database.ping` | Tests the connection and gives the latency. | `timeout` |
| `mongo.database.info` | Gives the name, the counts and the size of the database. | `includeStats` |
| `mongo.collections.list` | Lists the collections of the database. | `filter` |
| `mongo.collections.create` | Makes a collection, capped or with a validator. | `name`, `options` |
| `mongo.collections.drop` | Removes a collection. | `name` |
| `mongo.collections.stats` | Gives the count, the sizes and the indexes of a collection. | |
| `mongo.documents.find` | Finds documents, with a projection, a sort and pages. | `query`, `projection`, `sort`, `page`, `limit` |
| `mongo.documents.get` | Gives one document by its id. | `id` |
| `mongo.documents.insert` | Inserts one document or more. | `documents` |
| `mongo.documents.update` | Updates the document of `id`, or the documents that match `filter`. | `id` or `filter`, `update`, `multi`, `upsert`, `confirm` |
| `mongo.documents.delete` | Deletes the document of `id`, or the documents that match `filter`. | `id` or `filter`, `multi`, `confirm` |
| `mongo.documents.count` | Counts the documents that match a query. | `query` |
| `mongo.documents.aggregate` | Runs an aggregation pipeline. It refuses `$out` and `$merge`. | `pipeline`, `allowDiskUse`, `maxTimeMS` |
| `mongo.documents.distinct` | Gives the distinct values of a field. An array field gives each of its elements. | `field` (dots for an embedded field), `query` |
| `mongo.documents.bulk` | Sends several writes in one request, in the form of the `bulkWrite` of the driver. | `operations`, `ordered`, `confirm` |
| `mongo.documents.explain` | Gives the plan of a find, or of a pipeline. It refuses `$out` and `$merge`. | `query` or `pipeline`, `verbosity` |
| `mongo.indexes.list` | Lists the indexes of a collection. | |
| `mongo.indexes.create` | Makes an index. | `keys`, `options` |
| `mongo.indexes.drop` | Removes an index. | `name` |
| `mongo.watch` | Gives the changes of a collection as a stream, or of each collection without `collection`. | `collection`, `pipeline`, `fullDocument`, `resumeAfter` |

- `update` and `delete` need exactly one target (`id` or `filter`), and refuse unknown fields. An empty filter needs `confirm: true`.
- The operations of `bulk` are `insertOne`, `updateOne`, `updateMany`, `deleteOne` and `deleteMany`. By default the server does them in order, and the first failure stops the rest. With `ordered: false`, the server tries each operation, and the error tells which ones failed.
- The verbosity `queryPlanner` of `explain` (the default) gives the plan only. With `executionStats` and `allPlansExecution`, the server also does the plan and gives its statistics.
- The stream of `watch` has no end (`metadata.stream: { unbounded: true }`). It stops when the reader stops or the call aborts, and the procedure then closes the change stream.

### Type Definitions

#### Core Types

```typescript
// Documents
type DocumentId = string | ObjectId;
type BaseDocument = Document;
type MongoDocument = BaseDocument;
type DocumentQuery = Filter<Document>;
type DocumentUpdate = UpdateFilter<Document>;

// Metadata
interface BaseMeta extends Record<string, unknown> {
  database?: string;  // Override database name
}

interface CollectionMeta extends BaseMeta {
  collection: string;  // Collection name (required)
}

// Pagination
interface PaginationInput {
  page?: number;   // Page number (1-indexed)
  limit?: number;  // Items per page
}

interface PaginationOutput {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Sorting
type SortOrder = 1 | -1;
type SortSpec = Record<string, SortOrder>;

// Indexes
type IndexSpec = Record<string, 1 | -1 | "text" | "2dsphere">;

interface IndexOptions {
  name?: string;
  unique?: boolean;
  sparse?: boolean;
  background?: boolean;
  expireAfterSeconds?: number;
}

interface IndexInfo {
  name: string;
  key: IndexSpec;
  unique?: boolean;
  sparse?: boolean;
}

// Collections
interface CollectionOptions {
  capped?: boolean;
  size?: number;
  max?: number;
  validator?: Document;
}

interface CollectionStats {
  count: number;
  size: number;
  avgObjSize: number;
  storageSize: number;
  nindexes: number;
  totalIndexSize: number;
}

// Database
interface DatabaseInfo {
  name: string;
  collections: number;
  views: number;
  sizeOnDisk: number;
  empty: boolean;
}

// Aggregation
type AggregationStage = Document;

interface AggregationOptions {
  allowDiskUse?: boolean;
  maxTimeMS?: number;
}

// Bulk Operations
interface BulkInsertOne {
  insertOne: { document: Document };
}

interface BulkUpdateOne {
  updateOne: {
    filter: DocumentQuery;
    update: DocumentUpdate;
    upsert?: boolean;
  };
}

interface BulkDeleteOne {
  deleteOne: { filter: DocumentQuery };
}

type BulkOperation = BulkInsertOne | BulkUpdateOne | BulkDeleteOne;

interface BulkWriteResult {
  acknowledged: boolean;
  insertedCount: number;
  matchedCount: number;
  modifiedCount: number;
  deletedCount: number;
  upsertedCount: number;
}
```

#### Typed Procedures Interface

For compile-time autocomplete, use the `MongoProcedures` type:

```typescript
import type { MongoProcedures } from "@procedures/mongo";
import { createTypedCaller } from "@procedures/client";

const call = createTypedCaller<MongoProcedures>(client.call);

// Full autocomplete on path and input!
const result = await call(
  ["mongo", "documents", "find"],
  { query: { status: "active" } },
  { metadata: { collection: "users" } }
);
// result is typed as FindOutput
```

### Type Guards and Utilities

```typescript
// Check if metadata has collection
function hasCollection(metadata: Record<string, unknown>): metadata is CollectionMeta;

// Get collection metadata, throws if missing
function requireCollection(metadata: Record<string, unknown>): CollectionMeta;

// Get base metadata (database override)
function getBaseMeta(metadata: Record<string, unknown>): BaseMeta;
```

## Usage Examples

### Basic CRUD Operations

```typescript
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@procedures/client";
import { connect } from "@procedures/mongo";

// Connect to MongoDB
await connect({
  uri: "mongodb://localhost:27017",
  database: "myapp"
});

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

// Create a user
const insertResult = await client.exec(
  ["mongo", "documents", "insert"],
  {
    documents: {
      name: "Alice Johnson",
      email: "alice@example.com",
      age: 28,
      status: "active",
      createdAt: new Date()
    }
  },
  { metadata: { collection: "users" } }
);

// Find active users
const findResult = await client.exec(
  ["mongo", "documents", "find"],
  {
    query: { status: "active" },
    sort: { createdAt: -1 },
    limit: 10
  },
  { metadata: { collection: "users" } }
);

console.log(findResult.documents);
console.log(findResult.pagination);

// Update a user
await client.exec(
  ["mongo", "documents", "update"],
  {
    filter: { email: "alice@example.com" },
    update: { $set: { status: "inactive" } }
  },
  { metadata: { collection: "users" } }
);

// Delete inactive users
await client.exec(
  ["mongo", "documents", "delete"],
  {
    filter: { status: "inactive" },
    multi: true
  },
  { metadata: { collection: "users" } }
);
```

### Aggregation Pipeline

```typescript
// Group users by country and count
const result = await client.exec(
  ["mongo", "documents", "aggregate"],
  {
    pipeline: [
      { $match: { status: "active" } },
      { $group: {
          _id: "$country",
          count: { $sum: 1 },
          avgAge: { $avg: "$age" }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]
  },
  { metadata: { collection: "users" } }
);

console.log(result.results);
```

### Index Management

```typescript
// Create unique email index
await client.exec(
  ["mongo", "indexes", "create"],
  {
    keys: { email: 1 },
    options: { unique: true, name: "email_unique_idx" }
  },
  { metadata: { collection: "users" } }
);

// Create compound index
await client.exec(
  ["mongo", "indexes", "create"],
  {
    keys: { status: 1, createdAt: -1 },
    options: { name: "status_created_idx" }
  },
  { metadata: { collection: "users" } }
);

// List all indexes
const indexes = await client.exec(
  ["mongo", "indexes", "list"],
  {},
  { metadata: { collection: "users" } }
);

console.log(indexes.indexes);

// Drop an index
await client.exec(
  ["mongo", "indexes", "drop"],
  { name: "status_created_idx" },
  { metadata: { collection: "users" } }
);
```

### Collection Management

```typescript
// Create capped collection for logs
await client.exec(
  ["mongo", "collections", "create"],
  {
    name: "logs",
    options: {
      capped: true,
      size: 10485760,  // 10MB
      max: 1000
    }
  }
);

// List all collections
const collections = await client.exec(
  ["mongo", "collections", "list"],
  { filter: "user" }  // Filter collections containing "user"
);

console.log(collections.collections);

// Get collection stats
const stats = await client.exec(
  ["mongo", "collections", "stats"],
  {},
  { metadata: { collection: "users" } }
);

console.log(stats);
```

### Direct Usage (Without RPC)

```typescript
import {
  connect,
  findProcedure,
  insertProcedure,
  requireCollection
} from "@procedures/mongo";

await connect({ database: "myapp" });

// Use procedures directly
const findResult = await findProcedure.handler(
  { query: { status: "active" }, limit: 10 },
  { metadata: { collection: "users" } }
);

const insertResult = await insertProcedure.handler(
  { documents: { name: "Bob", email: "bob@example.com" } },
  { metadata: { collection: "users" } }
);
```

### Multi-Database Support

```typescript
// Default database
await client.exec(
  ["mongo", "documents", "find"],
  { query: {} },
  { metadata: { collection: "users" } }
);

// Override database in metadata
await client.exec(
  ["mongo", "documents", "find"],
  { query: {} },
  { metadata: { database: "analytics", collection: "events" } }
);
```

## Document storage: `MongoDocumentStorage`

`MongoDocumentStorage` is a `CollectionStorage` of `@procedures/collections` over MongoDB (roadmap CLI-24). It has flat documents, a change log, versions, queries in the database and partitions. `MongoStorage` keeps its `{ _id, data }` documents.

```ts
import { MongoDocumentStorage } from "@procedures/mongo";

const notes = new MongoDocumentStorage<Note>({ collection: "notes" });
await notes.set("n1", { title: "Plan", done: false });
await notes.query({ done: false }, { sort: { title: 1 }, limit: 20 });

// One storage for each tenant, on one collection (roadmap CLI-17)
server.usePartitions("notes", { storageOf: (partition) => notes.forPartition(partition), resolve });
```

| Option | Use |
| --- | --- |
| `collection` | The MongoDB collection |
| `db` | The database. The default is the database of the default connection. |
| `partition` | The partition of the storage. `forPartition(partition)` gives the storage of a partition, the same one each time. |
| `maxTombstones` | The most deletes that the change log keeps in each partition (default 10000) |
| `queryPolicy` | The query policy of `query()` without a policy of the call |
| `counters` | The collection of the sequence counters (default `__storage_counters`) |
| `writeLease` | The time after which a pending number of a write that stopped no longer holds the readers (default `seconds(60)`). A plain number is a `TypeError`. |
| `client` | The client of the database, for the transactions. The default is the client of the default connection when `db` is absent. With `db` and no `client`, a write is not a transaction, also on a replica set: it uses the watermark. |
| `transactions` | `auto` (the default): a transaction for each write on a replica set or a sharded cluster. `never`: the watermark only. |
| `versionOf` | The version of an item, for the expected versions of `set`, `delete` and `setBatch` (roadmap CLI-16) |
| `form` | The stored form (roadmap CLI-76): a `StoredForm` with `storedId`, `idOf`, `partitionFields` and `partitionOf`. The default `DEFAULT_STORED_FORM` writes the documents of 0.34.0. `storage.form` gives it back. |

- **The documents.** A plain object is stored flat: its fields beside the fields of the storage (`_key`, `_part`, `_seq`, `_ord`, `_tomb`). Keys with `$` or dots below the top level, and a top-level key with a dot, stay as they are (MongoDB 5.0 or later). Another item is stored as JSON text in `_json`: null, a primitive, an array, an object with a top-level key of the storage or a top-level key with `$`, a key `__proto__`, or a class instance other than `Date`. Both ways give the item back as it was. An object with a text `$ref` and an `$id` is refused with a `TypeError`, because MongoDB gives it back as a `DBRef`. An item whose `_id` is its id keeps it.
- **Write through the storage.** A raw write (for example `findOneAndReplace` or a cleanup script) takes no number of the sequence, so a delta of the change log does not give it. A raw replace also drops `_seq`. A raw writer must not hard-delete an item while the storage writes it: the write of a document without `_seq` is an upsert with `{ _seq: { $exists: false } }`, so it inserts the document again.
- **The change log.** Each write gets the next number of the sequence of the collection, and a delete leaves a tombstone. `getChangesSince()` thus gives the exact changes and deletes. A version of another epoch, or a version before the oldest dropped tombstone, gives a full result.
- **The versions.** `versionOf(id)` gives the number of the last write of an item.
- **The queries.** `query()` sends the equality of a string, a number or a boolean, and `$in` of them, to MongoDB as a filter. `queryEntries()` of the core then gives the exact result, so a query gives the result of the reference.
- **Several writers.** On a replica set, a write takes its numbers and writes in one transaction. On a single server, a watermark keeps the log exact. Each write keeps its numbers pending until it ends, and a version stops below the lowest pending number. A write that ends after its lease moves its documents to new numbers.
- **The cases that stay on a single server.** A process that stops between a late write and the move of its documents leaves that change below the watermark. A reader that passed those numbers does not get the change. And a precondition (`expectedVersion`) of a document without `_seq` has the guard `{ _seq: { $exists: false } }`: a writer outside the storage between the test and the write is not seen. On a replica set, the test and the write are one transaction, and these cases do not occur.
- **The partitions.** An id cannot have the character U+001F, and each write filter has the partition. A write cannot change a document of another partition.
- **The stored form** (roadmap CLI-76). An app that has its own form of documents keeps it, with no migration: the option `form`, one `StoredForm` object. `DEFAULT_STORED_FORM` writes the documents of 0.34.0, byte for byte. Give the same object to `ViewMaterializer` (`storageSources`).
  - `storedId(partition, id)` gives the stored `_id`, for example `tenant:key`. It can be a value that is not a text. `idOf(storedId, partition)` gives the id back. A read uses `idOf` first, then `_key`.
  - `partitionFields(partition)` gives the fields that name the partition, for example `{ tenant: "acme", scope: undefined }`. Each document of the partition has them, and they are the filter of the reads, the change log and the aggregations. A field with the value `undefined` is absent: the document does not have it, and the filter is `{ $exists: false }`.
  - `partitionOf(doc)` gives the partition of a stored document. `ViewMaterializer` gives it the document of a change event: `fullDocument`, else `fullDocumentBeforeChange`, else `documentKey`. A delete event has only `documentKey`, so with another `storedId`, the `_id` must tell the partition, or the collection needs `changeStreamPreAndPostImages`. The storage writes a delete as a tombstone (a replace event with the whole document), so the gap is only for a raw hard delete. The default reads `_part`, else the part of `_id` before U+001F.
  - The storage adds its fields in each form: `_key`, `_seq`, `_ord`, `_tomb`, and `_kid`, `_kpf` or `_json` when an item needs them. `DOCUMENT_STORAGE_FIELDS` names them, so a reader of the raw documents can leave them out. A delete leaves a tombstone (`TOMBSTONE_FIELD` is `true`): a reader of the raw documents must leave it out. `ViewMaterializer` does.
  - `decodeStoredDocument(doc, { form })` reads a raw document as the storage reads it: `undefined` for a tombstone or a document without an id, `_json` parsed, the fields of the storage left out, and the id as `_id`. It gives `{ id, partition, item }`.
  - `versionOfStored(doc, form)` gives the version of a raw document: the version that `storage.versionOf(id)` gives (roadmap CLI-77). It is `_seq` as text, `0` for a document without `_seq`, and `undefined` for a tombstone or a document without an id. The storage uses it too.
  - An item can have a partition field with the value of its partition (for example `scope: "board:1"` in the partition `acme/board:1`). The write leaves it out and notes it in `_kpf`, and the read gives it back. The same field with another value is refused with a `TypeError`.
  - A document without the fields of the storage (for example a document from before the app used the storage) is an item. Its id comes from `idOf`, else `_key`. Its item gets the id as `_id`. Its partition fields follow the rule of a written document without `_kpf`: a field with the value of the partition stays out, and a field with another value stays in. So the item has the same form before and after its first write. Its version is `0`, and it comes before the other items (then by `_id`). A full result of the change log has it. Its first write through the storage gives it a version, keeps its place, and is in the next delta.
  - A document without `_key` whose id `idOf` does not tell (for example an old `ObjectId`) is not an item: the reads and `size()` leave it out.

```ts
const notes = new MongoDocumentStorage<Note>({
  collection: "notes",
  form: {
    // The stored _id is `tenant:key`, and the field `tenant` names the partition
    storedId: (partition, id) => `${partition ?? "main"}:${id}`,
    idOf: (stored, partition) => {
      const prefix = `${partition ?? "main"}:`;
      return typeof stored === "string" && stored.startsWith(prefix) ? stored.slice(prefix.length) : undefined;
    },
    partitionFields: (partition) => ({ tenant: partition ?? "main" }),
    // The field, else the part of the stored _id before ':' (a delete event has only the _id)
    partitionOf: (doc) => (typeof doc.tenant === "string" ? doc.tenant : typeof doc._id === "string" ? doc._id.split(":")[0] : undefined),
  },
});
```
- **The tests.** The storage passes the `CollectionStorage` contract on MongoDB 7 in CI. Set `MONGO_TEST_URL` to start them locally.

### Change hints from the change stream: `watchStorageChanges`

The collection procedures publish an event for each of their writes. A write that does not go through them (a raw write, a script, a view, another process) has no event. `watchStorageChanges(storage, publish, options)` watches the change stream of the collection of a storage and publishes a hint of each change (roadmap CLI-77). Change streams need a replica set.

```ts
const notes = new MongoDocumentStorage<Note>({ collection: "notes" });
const watch = watchStorageChanges(notes, bus); // the bus of the procedures, or (topic, event) => ...
await watch.ready; // the stream is open
// A raw write of a note in the partition t1 reaches the subscribers of collections.notes.t1
await watch.stop();
```

- **The same topic and the same event.** The topic is `collectionChangeTopic(name, partition)`, as the procedures publish it. The partition comes from `storage.form.partitionOf()` of `fullDocumentBeforeChange`, else `fullDocument`, else `documentKey`: the first one whose partition lets `form.idOf()` read the stored `_id`. Thus a raw write that changes the partition field stays in the partition of its stored `_id`. The event is a `CollectionChangeEvent` without `since`: a hint, so the subscriber reads the changes with `changes`. It has the id in `changed` or `deleted`, and `versions: [{ id, version }]` when the watcher knows the new version. A tombstone and a delete are deletes. The options `collection` and `topic` give the name and the topic rule of the procedures when they are not the defaults.
- **A raw write gets a sequence number** (`rawWrites: "adopt"`, the default). The watcher reads from the event alone whether a write is raw: a write of the storage sets `_seq`, a raw write does not (a raw replace that copies `_seq` is raw only when the image before the change shows the same `_seq`). The raw event publishes nothing. The watcher gives the document a new `_seq` through the write path of the storage (the numbers, the late check and the move), and gives back the storage fields and the partition fields that a raw replace took (`_key`, `_ord`, `_kpf`), from the image before the change, else from `form.idOf()` and `form.partitionOf()` of the stored `_id`. It never changes a field of the item. The write matches only the state that the event saw: when two watchers race, or a write of the storage comes first, one write wins and the others do nothing. The event of that write publishes the hint, with the new version, so `changes(since)` has the raw write. A raw write does not carry its old version.
- **One queue of adoptions.** The adoptions of a watcher wait in one queue, and one adoption runs at a time. The raw writes that wait together (up to 100) take one block of numbers for each partition. An adoption that fails with an error that can go away tries again after the backoff, up to 5 times. When more than 10,000 raw writes wait, the next hints go out without a version, with one log. The watcher keeps the ids of the raw writes that did not fit or whose last try failed (up to 10,000), and adopts them again when the queue is empty, after the sweep, with the documents then. A failed last try, a second failure, or an id over that limit gives the partition a reset hint (`reset: true`): its subscribers read the collection in full.
- **The sweep** (`sweep`, on by default with `rawWrites: "adopt"`). After each gap, the watcher sends each document without `_seq` to the same queue, 500 at a time. Thus a raw write during a gap gets its number too, but only on a document without `_seq`: a raw update of a document with `_seq` keeps that `_seq`, and only the reset hint of the gap tells it. `sweep: false` turns it off, except for the sweep after more ids than the watcher can keep. The scan walks the index of `_id` and reads each document of the collection: a partial index cannot express `$exists: false`. A document that the sweep cannot place (no id, or another partition) goes to the log once, and the next sweeps leave it.
- **The sweep at the open** (`sweepAtOpen: true`, off by default) also sweeps when the stream opens, for the raw writes before the watcher started. The first watcher on a legacy collection adopts every legacy document, and the next delta of every subscriber is the whole collection.
- **The adoption is exact only with the images before the change** (`changeStreamPreAndPostImages: { enabled: true }`). An insert and a replace show their document, but an update shows only its fields. Without the image, the `_seq` that a raw update kept comes from the lookup of the document. When a write of the storage comes after the raw update, the adoption can give that write one more version. A client that holds the version of that write then gets a conflict of its precondition, and reads the item again.
- **The watcher needs write access, or set `rawWrites: "ignore"`.** With `"ignore"`, the watcher writes nothing and publishes each raw write as a hint without a version. A read-only user gets the same hint: the watcher logs the first refusal once.
- **Raw deletes need the images before the change.** A raw delete of a document becomes a tombstone only when the collection keeps the image before each change (`changeStreamPreAndPostImages: { enabled: true }`): the tombstone takes its id and its partition from the image, and its insert fails when the `_id` exists again. Without the image, the watcher publishes a hint without a version and writes nothing. The delete of a tombstone (a prune of the storage) publishes nothing.
- **One event for each write.** With `ownWrites: "skip"` (the default), the watcher skips the events of the writes of this process through the storage: the procedures of this process publish them already, with `since`. Each write of the storage notes its sequence numbers while a watcher of the collection is open, and the event of each number is skipped once. A raw write, or a write of another process, is published. Use `ownWrites: "publish"` when the writes of this process do not go through the procedures, or when the procedures publish no events (`changeEvents: false`).
- **No lost change.** After an error of the stream, the watcher opens the stream again after a backoff (option `backoff`, on the injected `clock`), from the resume token of the last event. When the server does not know the token any more, or the collection was dropped or renamed, the watcher publishes a reset hint (no ids, `reset: true`) on the plain topic, on each partition of the counters, on each partition that it saw, and on each channel of the bus of the collection. The option `gapPartitions: () => partitions` adds more. The first write of each storage writes the floor document of its partition in the counters, with the floor `0` (no prune). So the partitions of the counters include each partition with a write through a storage, in any process. Give `gapPartitions` only for the partitions that only raw writes wrote. The subscribers read the collection in full.
- **`ready`** resolves when the stream is open. It rejects when the first open fails with an error that does not go away: a single server, a refused access, or a wrong option. Change streams need a replica set or a sharded cluster: the watcher asks the server with `hello` before it opens the stream, and on a single server `ready` rejects with code 40573. The watcher logs it once and stops. It tries again after other errors.
- **The storage of a partition** (`forPartition()`) publishes and adopts only the documents of its partition. Its stream reads the whole collection. The documents of the counters are in another collection, and they never make a hint.
- **Your own stream.** `storageChangeOf(change, form)` reads the change of an item from a change event, for an app that watches the collection itself: `{ id, partition, deleted, raw, version, seq }`, or `undefined`.

### The guard of a pipeline: `scopePipeline`

`scopePipeline(pipeline, scope)` gives a pipeline that reads only the documents of a filter, on each collection that it reads. `MongoDocumentStorage.aggregate()` uses it with the filter of its partition. An app can use it for its own aggregations over shared collections:

```ts
import { boundPipeline, scopePipeline } from "@procedures/mongo";

const scoped = scopePipeline(pipeline, { match: { tenant: "t1" }, collections: ["orders", "customers"] });
const { pipeline: bounded, limited } = boundPipeline(scoped, 5000);
```

- The filter goes before the first stage, into the stages that must be first (`$geoNear`, `$search`, `$vectorSearch`), into a `$match` with `$text`, and into each sub-pipeline (`$lookup`, `$graphLookup`, `$unionWith`, `$facet`).
- A `$lookup` with `localField` and `foreignField` becomes the form with a pipeline, so the filter applies to the other collection too.
- The pipeline reads and writes only the collections of the scope (`from`, `coll`, `into`). Give only the collections that the caller can read: a pipeline needs the same right as a direct read.
- `$out` is refused. `$merge` is refused unless the scope has a `stamp`. Then each written document gets the stamp, and the match key of `$merge` gets its fields.
- Only the stages of `ALLOWED_PIPELINE_STAGES` pass, so a stage of the server is refused, also a stage that a later MongoDB adds. `$documents` is refused. The JavaScript operators of the server (`$function`, `$accumulator`, `$where`) are refused at each depth.
- A stage must have exactly one key, and a `$unset` of a field of the scope is refused.
- The function does not change the pipeline of the caller.
- `MongoDocumentStorage.aggregate(pipeline, { maxTime, maxResults })` is read-only, reads only its own collection, and keeps the tombstones out. It gives `{ docs, truncated }`. The defaults are `seconds(10)` and 5000 documents. `maxTime` is a duration of `@procedures/client`.

### Materialized views: `ViewMaterializer`

A view is a document of a views collection: a pipeline over source collections, whose result goes into a target collection, for one partition. `ViewMaterializer` keeps each target equal to the result of its pipeline, with change streams. Change streams need a replica set.

```ts
import { ViewMaterializer, viewFilter } from "@procedures/mongo";

await db.collection("_aggregations").insertOne({
  _id: "totals",
  _part: "tenant-1",
  collections: ["orders"],
  pipeline: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
  targetCollection: "orderTotals",
});
const views = new ViewMaterializer({ db: () => db });
await views.start();

// A reader of the target reads the current generation of the view
const view = await db.collection("_aggregations").findOne({ _id: "totals" });
const totals = await db.collection("orderTotals").find(viewFilter(view)).toArray();
```

- A change of a source starts a pass of its partition after the burst (`debounce`). A pass computes only the views whose sources changed, in the order of their dependencies. A view whose result changed makes its target dirty, so the views that read it are in the same pass.
- A run reads the result in groups of 1000. Each stored row keeps the hash of its content (`_viewHash`), so a row that did not change writes nothing.
- The rows of a view are a generation (`_viewGen`), and the status of the view names the current one. A reader of a target filters with `viewFilter(view)`, so it reads one whole generation. A plain query can see two generations.
- A run writes in one transaction: the changed rows of the current generation, and the removal of the rows that the result does not have. A reader does not see a part of a run.
- A view with more rows than `maxTransactionRows` (default 10000), or whose transaction fails, writes a whole new generation in groups. Then its status names the new generation. The previous one stays for `generationGrace` (default 60 s, on the time of the server), so a reader of it can finish. Then it goes.
- A pass in groups holds a lease on its view (`passLease`, default 60 s, on the time of the server), and renews it after each group. Another process leaves the view and the rows of the lease alone. The change of generation needs the lease and the generation of the start of the pass. A pass that loses either one gives way, and the view runs again later.
- A view in a cycle of views stays idle. Its status is `cycle` until the cycle ends.
- The status of each view (`ok`, `errored` with `lastError`, `cycle`) goes into the field `_materializerStatus` of its document.
- Each pipeline goes through `scopePipeline` by default. It reads only the documents of the partition, in its sources, and only the current generation of the target of another view. The tombstones of a `MongoDocumentStorage` (`_tomb` is `true`) stay out (roadmap CLI-79). It cannot have `$merge` or `$out`. The option `scope` gives another guard, with the same filter.
- A stream that ends opens again after `rewatch`, and a pass catches up. The times of the options are durations (`ms(100)`, `seconds(60)`) of `@procedures/client`.
- A delete has no document in its change event. It reaches only the views of its partition when its pre-image tells the partition (a collection with `changeStreamPreAndPostImages`). Without a pre-image, a delete, a replace and an update of the partition field reach the views of each partition.
- In a source of `storageSources` (a collection of a `MongoDocumentStorage`), `partitionOf` of its stored form reads the storage partition of such a change from its document (for a delete, only `documentKey`). The function of that source gives the partition of the views (`identityPartition` when the two are the same). A source is that function (the default form), or `{ form: storage.form, viewPartitionOf }` for another form. Else the change reaches the views of each partition.
- With pre-images, an update that moves a document to another partition also reaches the views of its old partition.
- `sourceFields` gives the fields of each source, as paths with dots. An update starts a pass when it changes one of them (at the field, under it or above it), or the partition field. The positions in arrays do not count: `lines.0.price` is `lines.price`. The partition field is a top-level field.
- The stop has the parts of a transport of a service: `stopIntake()`, `drain(deadline, signal)`, `inFlight()` and `close()`. `stop()` does the four. A host composes them with no adapter.
- The option `clock` gives the clock of the timers, for example a fake clock in a test. The timers do not keep a process alive.
- The target is a plain collection that only the materializer writes. Two views of one partition do not share a target. The stored `_id` of a row carries its partition and its generation: by default `{ partition, generation, id }` (`partitionTargetId`), where `id` is the `_id` of the row. Thus two partitions with the same keys share a target.
- The option `targetId` gives another form of the stored `_id`. Two partitions, or two generations, must not give the same `_id`. The write of a row checks the partition, so the view of the second partition fails, and the row of the first one stays. A form without the generation works only in one transaction.
- A pass keeps in memory the key of each row of the result (at most `maxRows`) and one group of rows. It keeps nothing between passes.
- An app with targets from an older materializer (the plain key as `_id`, no generation) needs no migration step. The first pass of each view writes its rows in a generation, and removes the rows of its partition with no generation. A row without the partition field stays.
- A transaction that has a write conflict with another process (code 112) tries again two times after a short wait. Then the run gives way, and the view runs again after `rewatch`. Thus a steady stream of writes does not stop a view.
- The option `publish` (a function or a bus) gets the hints of the targets that are not in a stored form (roadmap CLI-81). Each run that changes rows publishes one hint with the ids of the changed rows and of the removed rows. `rowIdOf` gives the id of a stored `_id`. The topic is `collectionChangeTopic(view._id)`, or the result of `hintTopic(view, partition)`. Some runs publish a reset hint (`reset: true`): a new generation in groups, an id that is not a text, or more than 10000 ids. Then the subscribers read the view in full.

#### A target in a stored form: `storageTargets`

The option `storageTargets` names the targets whose rows are documents of a `MongoDocumentStorage` (roadmap CLI-81). Give the storage of each target, its stored form, or `{ target, storagePartitionOf }`, by the name of the target collection. A reader then reads the target through a `MongoDocumentStorage` with the same form, and `changes(since)` and `watchStorageChanges()` have each write of a run.

```typescript
const totals = new MongoDocumentStorage({ collection: "orderTotals", db: () => db });
const views = new ViewMaterializer({ db: () => db, storageTargets: { orderTotals: totals } });
const changes = await totals.forPartition("t1").getChangesSince(version);
```

- The materializer encodes each row as a write of the storage does. A row gets `_key`, `_seq`, `_ord` and the partition fields of the form. It also gets `_kid`, `_kpf` or `_json` when it needs them. The fields of a storage in a row (for example of a source document that the pipeline passes through) do not go into the target. Thus `_json` comes from the content of the row, and each row has its own `_key`, also after `$unwind`, `$lookup` or `$unionWith`.
- The `_id` of a row is its id: a text without the character U+001F. Two rows of a result must not have the same `_id`.
- Each row also gets the partition field of the materializer with the partition of the view, so a view that reads the target finds it. When that field is a partition field of the form, the form must give it the partition of the view. `storagePartitionOf` gives the partition of the storage from the partition of the view (default the same partition).
- A run compares each row with its stored document, without the numbers. A row that did not change writes nothing, and a tombstone is not written again. A row keeps the place (`_ord`) of its stored document.
- A run takes the numbers of its writes from the sequence of the storage, as pending numbers. It writes with them in its transaction, and ends them after the commit. A late run (its numbers left their `writeLease`) moves to new numbers, so a reader of `changes(since)` misses no row. The transaction does not write the counters, so the writes of the storage do not conflict with it.
- The materializer does not note its numbers as writes of this process. Thus a watcher of the target with `ownWrites: "skip"` publishes a hint for each write of a run, with its version. It has no raw write to adopt.
- A row that the result does not have becomes a tombstone. The prune of the tombstones (`maxTombstones`) raises the floor of the change log. Thus a reader that is far behind gets a full result, and it misses no delete. A document of the partition that tells no id becomes a tombstone without `_key`.
- A view with more rows than `maxTransactionRows`, or whose transaction fails, writes in place in groups, under its lease. A reader can then read a part of the run.
- One view writes each partition of a target, and only the materializer writes it. A document of the partition that the result does not have becomes a tombstone. The rows have no generation, so `viewFilter()` and `MongoViewStorage` do not read them. Give the same `storageTargets` to each materializer of the views.

To serve a view through the collection procedures, give its storage `new MongoViewStorage({ view: "totals", db })` (roadmap CLI-38):

- Each read finds the current generation of the view one time, and reads only its rows. A reader of `get`, `getAll`, `find` or `changes` thus gets one generation only.
- A read that starts before a change of generation ends on the previous generation. The materializer keeps its rows for `generationGrace`, so a read must end in that time.
- The key of a row is its `_id` in the result, a text. The value has that `_id` and the fields of the row.
- The storage is read-only: a write rejects with `FORBIDDEN`. It has no change log. The option `publish` of the materializer gives its subscribers a hint for each run.
- Give it the same `views`, `partitionField`, `statusField` and `targetId` as the materializer.

## Integration with Ecosystem

### Bundle Packages

`client-mongo` can be included in bundle packages:

```typescript
// In bundle-data/src/register.ts
import "@procedures/mongo/register"; // registers its procedures
import "@procedures/sqlite/register"; // registers its procedures
import "@procedures/s3/register.js";
```

### Type-Safe Calling

```typescript
import type { MongoProcedures } from "@procedures/mongo";

type AllProcedures = MongoProcedures & OtherProcedures;

const call = createTypedCaller<AllProcedures>(client.call);
```

## Dependencies

### Runtime Dependencies

- **@procedures/client** - Core client procedure system
- **mongodb** (^7.0.0) - Official MongoDB Node.js driver

### Development Dependencies

- **@mark1russell7/cue** - Configuration and type utilities
- **typescript** (^5.9.3) - TypeScript compiler
- **@types/node** (^22.0.0) - Node.js type definitions

## Package Structure

- `src/index.ts`: the entry. It registers nothing.
- `src/module.ts`: `mongoModule`, the procedures as data. `src/register.ts` registers them in the global registry.
- `src/connection.ts`: the connection and its management.
- `src/scope.ts`: the database and the collection of a call.
- `src/procedures/`: one file for each procedure, with the schemas of the inputs.
- `src/storage/`: `MongoStorage`, `MongoDocumentStorage`, `scopePipeline` and `ViewMaterializer`.

## Development

### Build

```bash
npm run build
```

### Type Check

```bash
npm run typecheck
```

### Clean

```bash
npm run clean
```

## License

MIT

## Author

Mark Russell <marktheprogrammer17@gmail.com>

## Repository

https://github.com/mark1russell7/client-mongo
