# @mark1russell7/client-server-mongo

MongoDB server lifecycle management procedures. Start, stop, and monitor MongoDB peer servers that expose `client-mongo` procedures via HTTP.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Application                              │
│                                                                              │
│   // Start a MongoDB server                                                  │
│   await client.exec(["server", "mongo", "start"], {                         │
│     port: 3000,                                                              │
│     mongoUri: "mongodb://localhost:27017",                                  │
│     database: "myapp"                                                        │
│   });                                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     client-server-mongo Procedures                           │
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐│
│   │server.mongo     │  │server.mongo     │  │server.mongo   server.mongo ││
│   │    .start       │  │    .stop        │  │    .status        .connect ││
│   │                 │  │                 │  │                            ││
│   │ Creates peer    │  │ Stops peer      │  │ List servers   Connect to  ││
│   │ server          │  │ server          │  │ & status       MongoDB     ││
│   └────────┬────────┘  └────────┬────────┘  └─────────────────────────────┘│
│            │                    │                                           │
└────────────┼────────────────────┼───────────────────────────────────────────┘
             │                    │
             ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MongoServerManager (Singleton)                          │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        Active Servers Map                            │   │
│   │                                                                      │   │
│   │   serverId: "mongo-123"  ──►  { peer, endpoints, startedAt }        │   │
│   │   serverId: "mongo-456"  ──►  { peer, endpoints, startedAt }        │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Peer Server (client-server)                         │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                          HTTP Transport                              │   │
│   │                                                                      │   │
│   │   POST /api/mongo.database.ping     ──►  pingProcedure              │   │
│   │   POST /api/mongo.collections.list  ──►  listProcedure              │   │
│   │   POST /api/mongo.documents.find    ──►  findProcedure              │   │
│   │   POST /api/mongo.documents.insert  ──►  insertProcedure            │   │
│   │   ... (16 procedures total)                                          │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MongoDB                                         │
│                                                                              │
│   mongodb://localhost:27017/myapp                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
pnpm add @mark1russell7/client-server-mongo
```

## Procedures

### server.mongo.start

Start a MongoDB peer server that exposes all client-mongo procedures via HTTP.

```typescript
import { Client } from "@mark1russell7/client";

const result = await client.exec<{
  serverId: string;
  endpoints: Array<{ type: string; address: string }>;
  procedureCount: number;
}>(["server", "mongo", "start"], {
  port: 3000,
  host: "0.0.0.0",
  mongoUri: "mongodb://localhost:27017",
  database: "myapp"
});

console.log(`Server ID: ${result.serverId}`);
console.log(`Procedures: ${result.procedureCount}`);
console.log(`Endpoint: ${result.endpoints[0].address}`);
```

**Input Schema:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `port` | `number` | No | `3000` | Port to listen on |
| `host` | `string` | No | `0.0.0.0` | Host to bind to |
| `mongoUri` | `string` | No | - | MongoDB connection URI |
| `database` | `string` | No | - | Database name |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `serverId` | `string` | Unique server identifier |
| `endpoints` | `PeerEndpoint[]` | Active endpoints |
| `procedureCount` | `number` | Number of exposed procedures |

### server.mongo.stop

Stop a running MongoDB peer server.

```typescript
const result = await client.exec<{
  success: boolean;
}>(["server", "mongo", "stop"], {
  serverId: "mongo-peer-1234567890"
});

if (result.success) {
  console.log("Server stopped");
}
```

**Input Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `serverId` | `string` | Yes | Server ID from start |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether stop succeeded |

### server.mongo.status

Get status of all running servers or a specific one.

```typescript
const result = await client.exec<{
  servers: Array<{
    serverId: string;
    endpoints: PeerEndpoint[];
    startedAt: string;
    procedureCount: number;
  }>;
}>(["server", "mongo", "status"], {
  serverId: "mongo-peer-1234567890" // Optional
});

for (const server of result.servers) {
  console.log(`${server.serverId}: ${server.procedureCount} procedures`);
  console.log(`  Started: ${server.startedAt}`);
}
```

**Input Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `serverId` | `string` | No | Specific server to query |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `servers` | `ServerInfo[]` | Array of server information |

### server.mongo.connect

Connect to a MongoDB database (for local operations).

```typescript
const result = await client.exec<{
  success: boolean;
  database: string;
}>(["server", "mongo", "connect"], {
  uri: "mongodb://localhost:27017",
  database: "myapp"
});

console.log(`Connected to: ${result.database}`);
```

**Input Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uri` | `string` | No | MongoDB connection URI |
| `database` | `string` | No | Database name |

**Output Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether connection succeeded |
| `database` | `string` | Connected database name |

## Exposed Procedures

When a server is started, it exposes all `client-mongo` procedures:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Exposed MongoDB Procedures                             │
│                                                                              │
│   Database Operations                                                        │
│   ├── mongo.database.ping      - Health check                               │
│   └── mongo.database.info      - Database information                       │
│                                                                              │
│   Collection Operations                                                      │
│   ├── mongo.collections.list   - List collections                           │
│   ├── mongo.collections.create - Create collection                          │
│   ├── mongo.collections.drop   - Drop collection                            │
│   └── mongo.collections.stats  - Collection statistics                      │
│                                                                              │
│   Document Operations                                                        │
│   ├── mongo.documents.find     - Find documents (paginated)                 │
│   ├── mongo.documents.get      - Get single document                        │
│   ├── mongo.documents.insert   - Insert documents                           │
│   ├── mongo.documents.update   - Update documents                           │
│   ├── mongo.documents.delete   - Delete documents                           │
│   ├── mongo.documents.count    - Count documents                            │
│   └── mongo.documents.aggregate - Aggregation pipeline                      │
│                                                                              │
│   Index Operations                                                           │
│   ├── mongo.indexes.list       - List indexes                               │
│   ├── mongo.indexes.create     - Create index                               │
│   └── mongo.indexes.drop       - Drop index                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Client-Server Peering Pattern

```
┌──────────────────────┐                     ┌──────────────────────┐
│    Client App        │                     │   MongoDB Server     │
│                      │                     │                      │
│  ┌────────────────┐  │      HTTP/WS        │  ┌────────────────┐  │
│  │ Client Instance│◄─┼─────────────────────┼──┤ Peer Server    │  │
│  │                │  │                     │  │                │  │
│  │ .exec([...])   │──┼─────────────────────┼─►│ ProcedureRouter│  │
│  │                │  │   JSON-RPC over     │  │                │  │
│  │                │  │   HTTP Transport    │  │                │  │
│  └────────────────┘  │                     │  └───────┬────────┘  │
│                      │                     │          │           │
└──────────────────────┘                     │          ▼           │
                                             │  ┌────────────────┐  │
                                             │  │   client-mongo │  │
                                             │  │   Procedures   │  │
                                             │  │                │  │
                                             │  │ ┌────────────┐ │  │
                                             │  │ │  MongoDB   │ │  │
                                             │  │ │ Connection │ │  │
                                             │  │ └────────────┘ │  │
                                             │  └────────────────┘  │
                                             │                      │
                                             └──────────────────────┘
```

## Full Example

```typescript
import { Client } from "@mark1russell7/client";
import { HttpTransport } from "@mark1russell7/client/http";
import "@mark1russell7/client-server-mongo/register";

// 1. Start MongoDB server programmatically
const serverResult = await client.exec(["server", "mongo", "start"], {
  port: 3000,
  mongoUri: "mongodb://localhost:27017",
  database: "myapp"
});

console.log(`MongoDB server started on port 3000`);
console.log(`Exposed ${serverResult.procedureCount} procedures`);

// 2. Create client to connect to the server
const remoteClient = new Client({
  transport: new HttpTransport({
    baseUrl: "http://localhost:3000/api"
  })
});

// 3. Call MongoDB procedures via the server
const collections = await remoteClient.call(
  { service: "mongo.collections", operation: "list" },
  {}
);
console.log("Collections:", collections);

const docs = await remoteClient.call(
  { service: "mongo.documents", operation: "find" },
  { limit: 10 },
  { metadata: { collection: "users" } }
);
console.log("Documents:", docs);

// 4. Stop the server when done
await client.exec(["server", "mongo", "stop"], {
  serverId: serverResult.serverId
});
```

## Server Lifecycle

```
┌─────────────┐     start()      ┌─────────────┐
│             │ ───────────────► │             │
│   stopped   │                  │   running   │
│             │ ◄─────────────── │             │
└─────────────┘     stop()       └─────────────┘
                                        │
                                        │ status()
                                        ▼
                                 ┌─────────────┐
                                 │  ServerInfo │
                                 │             │
                                 │ • serverId  │
                                 │ • endpoints │
                                 │ • startedAt │
                                 │ • procCount │
                                 └─────────────┘
```

## Integration with server-mongo

For standalone deployment, use the `server-mongo` package which provides a runnable entry point:

```bash
# Install globally
npm install -g @mark1russell7/server-mongo

# Run with environment variables
PORT=3000 MONGODB_URI="mongodb://localhost:27017" MONGODB_DATABASE="myapp" server-mongo
```

## Auto-Registration

Import the register module to auto-register all procedures:

```typescript
import "@mark1russell7/client-server-mongo/register";
```

Or register manually:

```typescript
import { registerServerMongoProcedures } from "@mark1russell7/client-server-mongo";

registerServerMongoProcedures();
```

## Related Packages

- `@mark1russell7/client-mongo` - MongoDB procedures
- `@mark1russell7/client-server` - Peer-to-peer RPC infrastructure
- `@mark1russell7/server-mongo` - Standalone MongoDB server

## License

MIT
