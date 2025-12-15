# client-mongo

MongoDB client wrapper with typed RPC procedures. Use MongoDB locally or expose it via RPC to remote clients.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   Local     │     │   Server    │     │   Client    │                   │
│  │   Usage     │     │   (RPC)     │     │   (Remote)  │                   │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                   │
│         │                   │                   │                           │
│         │                   │                   │                           │
│         ▼                   ▼                   ▼                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        client-mongo                                  │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │                     Procedures                               │   │   │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │   │   │
│  │  │  │   Database   │ │  Collections │ │      Documents       │ │   │   │
│  │  │  │  • ping      │ │  • list      │ │  • find    • delete  │ │   │   │
│  │  │  │  • info      │ │  • create    │ │  • get     • count   │ │   │   │
│  │  │  │              │ │  • drop      │ │  • insert  • aggregate│ │   │   │
│  │  │  │              │ │  • stats     │ │  • update            │ │   │   │
│  │  │  └──────────────┘ └──────────────┘ └──────────────────────┘ │   │   │
│  │  │  ┌──────────────┐                                           │   │   │
│  │  │  │   Indexes    │                                           │   │   │
│  │  │  │  • list      │                                           │   │   │
│  │  │  │  • create    │                                           │   │   │
│  │  │  │  • drop      │                                           │   │   │
│  │  │  └──────────────┘                                           │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                      │   │
│  │                              ▼                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │                    Connection Manager                        │   │   │
│  │  │         connect() • disconnect() • getDb()                   │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │      MongoDB        │
                          │  (local or remote)  │
                          └─────────────────────┘
```

## Installation

```bash
npm install github:mark1russell7/client-mongo#main
```

The package auto-registers procedures via the `client` postinstall hook.

## Configuration

### Environment Variables

```bash
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=mydb
```

### Programmatic

```typescript
import { connect, disconnect } from '@mark1russell7/client-mongo';

// Connect with options
await connect({
  uri: 'mongodb://localhost:27017',
  database: 'mydb',
});

// ... use procedures ...

// Disconnect when done
await disconnect();
```

## Procedures

All procedures use metadata to specify the target collection/database:

```typescript
const result = await client.call('mongo.documents.find',
  { query: { status: 'active' } },
  { metadata: { collection: 'users', database: 'mydb' } }
);
```

### Database

| Path | Description |
|------|-------------|
| `mongo.database.ping` | Health check and latency test |
| `mongo.database.info` | Database statistics (collections, size, etc.) |

### Collections

| Path | Description |
|------|-------------|
| `mongo.collections.list` | List all collections |
| `mongo.collections.create` | Create a new collection |
| `mongo.collections.drop` | Drop a collection (requires `confirm: true`) |
| `mongo.collections.stats` | Collection statistics (count, size, indexes) |

### Documents

| Path | Description |
|------|-------------|
| `mongo.documents.find` | Find with pagination, projection, sorting |
| `mongo.documents.get` | Get single document by ID |
| `mongo.documents.insert` | Insert one or many documents |
| `mongo.documents.update` | Update with filter or ID, supports upsert |
| `mongo.documents.delete` | Delete with filter or ID |
| `mongo.documents.count` | Count matching documents |
| `mongo.documents.aggregate` | Run aggregation pipeline |

### Indexes

| Path | Description |
|------|-------------|
| `mongo.indexes.list` | List indexes on a collection |
| `mongo.indexes.create` | Create an index |
| `mongo.indexes.drop` | Drop an index by name |

## Usage Examples

### Find Documents

```typescript
import { Client } from 'client';

const client = new Client();

// Find with pagination
const { documents, pagination } = await client.call(
  'mongo.documents.find',
  {
    query: { status: 'active' },
    sort: { createdAt: -1 },
    page: 1,
    limit: 20,
  },
  { metadata: { collection: 'users' } }
);
```

### Insert Documents

```typescript
// Single document
await client.call(
  'mongo.documents.insert',
  { documents: { name: 'Alice', email: 'alice@example.com' } },
  { metadata: { collection: 'users' } }
);

// Multiple documents
await client.call(
  'mongo.documents.insert',
  { documents: [
    { name: 'Bob', email: 'bob@example.com' },
    { name: 'Carol', email: 'carol@example.com' },
  ]},
  { metadata: { collection: 'users' } }
);
```

### Update Documents

```typescript
// Update by ID
await client.call(
  'mongo.documents.update',
  {
    id: '507f1f77bcf86cd799439011',
    update: { $set: { status: 'inactive' } },
  },
  { metadata: { collection: 'users' } }
);

// Update many by filter
await client.call(
  'mongo.documents.update',
  {
    filter: { status: 'pending' },
    update: { $set: { status: 'processed' } },
    multi: true,
  },
  { metadata: { collection: 'orders' } }
);
```

### Aggregation Pipeline

```typescript
const { results } = await client.call(
  'mongo.documents.aggregate',
  {
    pipeline: [
      { $match: { status: 'completed' } },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ],
  },
  { metadata: { collection: 'orders' } }
);
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────┐
│                         cue                                      │
│              (shared configuration)                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│    client     │   │    splay      │   │ client-mongo  │ ◄── you are here
│  (RPC core)   │   │  (rendering)  │   │  (MongoDB)    │
└───────┬───────┘   └───────┬───────┘   └───────────────┘
        │                   │
        ▼                   ▼
┌───────────────┐   ┌───────────────┐
│ client-logger │   │  splay-react  │
│  (logging)    │   │  (React UI)   │
└───────────────┘   └───────────────┘
```

## License

MIT
