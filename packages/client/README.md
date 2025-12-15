# client

Universal RPC client/server with type-safe middleware, procedures, components, and collections.

## Installation

```bash
npm install github:mark1russell7/client#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                           PROCEDURES                                    │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │ │
│  │  │ defineProcedure │  │ ProcedureServer │  │  Auto-Discovery via    │ │ │
│  │  │ (type-safe RPC) │  │ (runs handlers) │  │  package.json client   │ │ │
│  │  └─────────────────┘  └─────────────────┘  │  { procedures: "..." } │ │ │
│  │                                             └─────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │        COMPONENTS           │  │             EVENTS                   │  │
│  │  ┌───────────────────────┐  │  │  ┌─────────────────────────────┐   │  │
│  │  │ ComponentOutput       │  │  │  │ EventBus (pub/sub)          │   │  │
│  │  │ (serializable UI)     │  │  │  │ - emit/on/off/once          │   │  │
│  │  │                       │  │  │  │ - stream() async iterable   │   │  │
│  │  │ { type, props, ... }  │  │  │  └─────────────────────────────┘   │  │
│  │  └───────────────────────┘  │  └─────────────────────────────────────┘  │
│  └─────────────────────────────┘                                            │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         CLIENT / SERVER                                │  │
│  │  ┌─────────────────────────┐     ┌─────────────────────────────────┐  │  │
│  │  │   Client<TContext>      │     │          Server                 │  │  │
│  │  │  ┌───────────────────┐  │     │  ┌───────────────────────────┐  │  │  │
│  │  │  │ Middleware Chain  │  │     │  │    Handler Registry       │  │  │  │
│  │  │  │ (type-safe)       │  │     │  └───────────────────────────┘  │  │  │
│  │  │  └───────────────────┘  │     └─────────────────────────────────┘  │  │
│  │  └─────────────────────────┘                                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                           TRANSPORT LAYER                                    │
│   ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │   HTTP   │  │ WebSocket  │  │  Local   │  │   Mock   │  │  Custom  │   │
│   └──────────┘  └────────────┘  └──────────┘  └──────────┘  └──────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│                        COLLECTIONS FRAMEWORK                                 │
│   ┌──────────────┐  ┌────────────────┐  ┌───────────────────────────────┐  │
│   │ List/Map/Set │  │ Queue/Deque    │  │ Behaviors: lru, ttl, bounded  │  │
│   └──────────────┘  └────────────────┘  │ evented, safe, synchronized   │  │
│                                          └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Client

```typescript
import { Client, HttpTransport } from "client";

const client = new Client({
  transport: new HttpTransport({ baseUrl: "https://api.example.com" })
})
  .use(createRetryMiddleware({ maxRetries: 3 }))
  .use(createAuthMiddleware({ token: "abc123" }));

// RPC call
const user = await client.call({ service: "users", operation: "get" }, { id: "123" });

// Streaming
for await (const event of client.stream({ service: "events", operation: "watch" }, {})) {
  console.log(event);
}
```

### Procedures

```typescript
import { defineProcedure, registerProcedures } from "client";
import { z } from "zod";

const getUserProcedure = defineProcedure({
  path: ["users", "get"],
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string(), name: z.string() }),
  handler: async ({ id }, ctx) => {
    return await db.users.findById(id);
  },
});

registerProcedures([getUserProcedure]);
```

### Components

```typescript
import { defineComponent, nullOutput, fragment } from "client";

const UserCard = defineComponent({
  type: "user-card",
  factory: async (ctx) => ({
    type: "user-card",
    props: { name: ctx.data.name, avatar: ctx.data.avatar },
    children: [],
  }),
});
```

## Subpath Exports

```typescript
import { ... } from "client";              // Main exports
import { ... } from "client/components";   // Component system
import { ... } from "client/events";       // EventBus
import { ... } from "client/procedures";   // Procedure system
```

## Procedure Auto-Discovery

Packages can declare procedures in `package.json`:

```json
{
  "client": {
    "procedures": "./dist/register.js"
  },
  "scripts": {
    "postinstall": "client announce"
  }
}
```

When installed, procedures auto-register. Run `client discover` to generate the registry.

## Type-Safe Middleware

Middleware context types accumulate through the chain:

```typescript
const client = new Client(transport)
  .use(createRetryMiddleware())     // Client<RetryContext>
  .use(createCacheMiddleware())     // Client<RetryContext & CacheContext>
  .use(createAuthMiddleware());     // Client<... & AuthContext>
```

### Available Middleware

| Middleware | Purpose |
|------------|---------|
| `createRetryMiddleware` | Exponential backoff with jitter |
| `createCacheMiddleware` | LRU + TTL caching |
| `createTimeoutMiddleware` | Request timeout |
| `createAuthMiddleware` | Bearer token / API key |
| `createTracingMiddleware` | W3C Trace Context |
| `createCircuitBreakerMiddleware` | Fault tolerance |
| `createRateLimitMiddleware` | Token bucket throttling |
| `createBatchingMiddleware` | Request aggregation |

## EventBus

```typescript
import { createEventBus } from "client";

const bus = createEventBus();

// Subscribe
bus.on("user:created", (user) => console.log(user));

// Publish
bus.emit("user:created", { id: "123", name: "Alice" });

// Async iteration
for await (const event of bus.stream("user:*")) {
  console.log(event);
}
```

## Components

Serializable UI descriptors for server-side rendering:

```typescript
interface ComponentOutput {
  type: string;                    // Component type
  props: Record<string, unknown>;  // Props
  children?: ComponentOutput[];    // Nested children
  key?: string | number;           // React key
}

// Special outputs
nullOutput();                      // { type: "__null__" }
fragment([child1, child2]);        // { type: "__fragment__", children: [...] }
```

## Collections

Java-inspired data structures with composable behaviors:

```typescript
import { arrayList, hashMap, compose, lruMap, ttlMap, eventedList } from "client";

// Basic
const list = arrayList<number>();
const map = hashMap<string, User>();

// Composed with behaviors
const cache = compose(
  lruMap({ capacity: 100 }),
  ttlMap({ ttl: 60000 })
)(hashMap<string, Data>());

// Evented
const log = eventedList<Event>()(arrayList<Event>());
log.on("add", ({ item }) => console.log(item));
```

### Collection Types

| Type | Implementations |
|------|-----------------|
| List | `ArrayList`, `LinkedList` |
| Map | `HashMap`, `LinkedHashMap`, `TreeMap` |
| Set | `HashSet`, `TreeSet` |
| Queue | `ArrayDeque`, `PriorityQueue` |

### Behaviors

| Behavior | Description |
|----------|-------------|
| `bounded` | Capacity limits |
| `lru` | Least Recently Used eviction |
| `ttl` | Time-to-live expiration |
| `evented` | Event emission |
| `safe` | Option/Result error handling |
| `synchronized` | Thread safety |

## Server

```typescript
import { Server, HttpServerTransport } from "client";

const server = new Server({
  transports: [new HttpServerTransport({ port: 3000 })],
});

server.register(
  { service: "users", operation: "get" },
  async (request) => ({
    id: request.id,
    status: { type: "success", code: 200 },
    payload: await db.users.findById(request.payload.id),
    metadata: {},
  })
);

await server.start();
```

## Error System

70+ error codes with metadata:

```typescript
import { createError, ERROR_REGISTRY, ErrorCategory, ErrorSeverity } from "client";

const error = createError("E_TIMEOUT", {
  service: "users",
  operation: "get",
});
// { code: "E_TIMEOUT", message: "...", severity: "error", category: "timeout", ... }
```

## Requirements

- Node.js >= 20
- TypeScript >= 5.0

## License

MIT
