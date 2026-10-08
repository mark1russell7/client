# @mark1russell7/server-mongo

> **DEPRECATED**: This package is deprecated. Use the general `@mark1russell7/server` package instead:
> ```bash
> npx @mark1russell7/server --procedures @mark1russell7/client-mongo/register --port 3000
> ```
> The general server package supports any procedure packages and flexible transport configuration.

Standalone MongoDB server exposing MongoDB procedures via HTTP. Run as a service to enable remote MongoDB access through the client-server peering pattern.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              server-mongo                                    │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        Configuration                                 │   │
│   │                                                                      │   │
│   │   PORT ─────────────────► 3000 (default)                            │   │
│   │   HOST ─────────────────► 0.0.0.0 (default)                         │   │
│   │   MONGODB_URI ──────────► mongodb://localhost:27017 (default)       │   │
│   │   MONGODB_DATABASE ─────► test (default)                            │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     server.mongo.start()                             │   │
│   │                                                                      │   │
│   │   1. Connect to MongoDB                                             │   │
│   │   2. Register client-mongo procedures                               │   │
│   │   3. Create HTTP peer server                                        │   │
│   │   4. Start listening                                                │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         Peer Server                                  │   │
│   │                                                                      │   │
│   │   HTTP Transport on http://0.0.0.0:3000/api                         │   │
│   │                                                                      │   │
│   │   ┌─────────────────────────────────────────────────────────────┐   │   │
│   │   │              16 MongoDB Procedures                           │   │   │
│   │   │                                                              │   │   │
│   │   │  mongo.database.*     mongo.collections.*                    │   │   │
│   │   │  mongo.documents.*    mongo.indexes.*                        │   │   │
│   │   │                                                              │   │   │
│   │   └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ MongoDB Driver
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                MongoDB                                       │
│                                                                              │
│   mongodb://localhost:27017/test                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Installation

### Global Installation

```bash
npm install -g @mark1russell7/server-mongo
```

### Local Installation

```bash
pnpm add @mark1russell7/server-mongo
```

## Quick Start

### Using npx

```bash
npx @mark1russell7/server-mongo
```

### With Environment Variables

```bash
PORT=8080 \
MONGODB_URI="mongodb://myhost:27017" \
MONGODB_DATABASE="production" \
npx @mark1russell7/server-mongo
```

### Using npm scripts

```json
{
  "scripts": {
    "start:mongo": "server-mongo"
  }
}
```

## Configuration

All configuration is done through environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port to listen on |
| `HOST` | `0.0.0.0` | Host to bind to |
| `MONGODB_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGODB_DATABASE` | `test` | Database name |

## Output

When started, the server outputs:

```
Starting MongoDB server...
  Port: 3000
  Host: 0.0.0.0
  MongoDB URI: mongodb://localhost:27017
  Database: myapp

Server started successfully!
  Server ID: mongo-peer-1703694523456
  Procedures: 16

Endpoints:
  - [http] http://0.0.0.0:3000/api

Press Ctrl+C to stop the server.
```

## Deployment Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Production Deployment                              │
│                                                                              │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│   │   Frontend      │     │   Backend       │     │   MongoDB       │       │
│   │   (React/Vue)   │     │  (server-mongo) │     │   Server        │       │
│   │                 │     │                 │     │                 │       │
│   │   Port: 80      │────►│   Port: 3000    │────►│   Port: 27017   │       │
│   │                 │     │                 │     │                 │       │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘       │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                          Docker Compose                              │   │
│   │                                                                      │   │
│   │   services:                                                          │   │
│   │     mongodb:                                                         │   │
│   │       image: mongo:7                                                │   │
│   │       ports: ["27017:27017"]                                        │   │
│   │                                                                      │   │
│   │     server-mongo:                                                    │   │
│   │       image: node:20                                                │   │
│   │       command: npx @mark1russell7/server-mongo                      │   │
│   │       environment:                                                   │   │
│   │         - PORT=3000                                                  │   │
│   │         - MONGODB_URI=mongodb://mongodb:27017                       │   │
│   │         - MONGODB_DATABASE=myapp                                    │   │
│   │       ports: ["3000:3000"]                                          │   │
│   │       depends_on: [mongodb]                                         │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Connecting from Clients

### Using @mark1russell7/client

```typescript
import { Client } from "@mark1russell7/client";
import { HttpTransport } from "@mark1russell7/client/http";

const client = new Client({
  transport: new HttpTransport({
    baseUrl: "http://localhost:3000/api"
  })
});

// List collections
const result = await client.call(
  { service: "mongo.collections", operation: "list" },
  {}
);
console.log(result.collections);

// Find documents
const docs = await client.call(
  { service: "mongo.documents", operation: "find" },
  { limit: 10, page: 1 },
  { metadata: { collection: "users" } }
);
console.log(docs.documents);
```

### Using fetch (HTTP API)

```typescript
// List collections
const response = await fetch("http://localhost:3000/api", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "mongo.collections.list",
    params: {},
    id: 1
  })
});

const result = await response.json();
console.log(result.result.collections);
```

## API Endpoints

All procedures are exposed at `/api` using JSON-RPC over HTTP POST:

```
POST /api
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "<procedure.path>",
  "params": { ... },
  "id": 1
}
```

### Available Methods

| Method | Description |
|--------|-------------|
| `mongo.database.ping` | Health check |
| `mongo.database.info` | Database information |
| `mongo.collections.list` | List collections |
| `mongo.collections.create` | Create collection |
| `mongo.collections.drop` | Drop collection |
| `mongo.collections.stats` | Collection statistics |
| `mongo.documents.find` | Find documents |
| `mongo.documents.get` | Get single document |
| `mongo.documents.insert` | Insert documents |
| `mongo.documents.update` | Update documents |
| `mongo.documents.delete` | Delete documents |
| `mongo.documents.count` | Count documents |
| `mongo.documents.aggregate` | Aggregation pipeline |
| `mongo.indexes.list` | List indexes |
| `mongo.indexes.create` | Create index |
| `mongo.indexes.drop` | Drop index |

## Request/Response Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Request Flow                                      │
│                                                                              │
│   Client Request                                                             │
│   ──────────────                                                             │
│   POST /api                                                                  │
│   {                                                                          │
│     "jsonrpc": "2.0",                                                        │
│     "method": "mongo.documents.find",                                        │
│     "params": { "limit": 10 },                                               │
│     "id": 1                                                                  │
│   }                                                                          │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────┐                                                        │
│   │  HTTP Transport │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │ Procedure Router│                                                        │
│   └────────┬────────┘                                                        │
│            │ method: "mongo.documents.find"                                  │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │  findProcedure  │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │    MongoDB      │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   Server Response                                                            │
│   ───────────────                                                            │
│   {                                                                          │
│     "jsonrpc": "2.0",                                                        │
│     "result": {                                                              │
│       "documents": [...],                                                    │
│       "pagination": { ... }                                                  │
│     },                                                                       │
│     "id": 1                                                                  │
│   }                                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Docker

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

RUN npm install -g @mark1russell7/server-mongo

EXPOSE 3000

CMD ["server-mongo"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

  server-mongo:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - MONGODB_URI=mongodb://mongodb:27017
      - MONGODB_DATABASE=myapp
    depends_on:
      - mongodb

volumes:
  mongodb_data:
```

## Programmatic Usage

```typescript
import { serverMongoStart, serverMongoStop } from "@mark1russell7/server-mongo";

// Start server
const server = await serverMongoStart({
  port: 3000,
  mongoUri: "mongodb://localhost:27017",
  database: "myapp"
});

console.log(`Server running at port 3000`);
console.log(`Server ID: ${server.serverId}`);

// Stop server (when needed)
await serverMongoStop({ serverId: server.serverId });
```

## Health Check

```bash
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"mongo.database.ping","params":{},"id":1}'
```

Expected response:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "ok": true,
    "latency": 5
  },
  "id": 1
}
```

## Security Considerations

- By default, the server binds to `0.0.0.0` (all interfaces)
- For production, consider:
  - Using a reverse proxy (nginx, traefik)
  - Adding authentication middleware
  - Restricting network access
  - Using TLS/HTTPS

## Related Packages

- `@mark1russell7/client-mongo` - MongoDB procedures
- `@mark1russell7/client-server-mongo` - Server lifecycle management
- `@mark1russell7/client-server` - Peer-to-peer RPC infrastructure

## License

MIT
