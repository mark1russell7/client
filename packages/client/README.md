# Universal RPC Library

Protocol-agnostic RPC client/server with type-safe middleware composition.

## Features

- **Protocol Independence** - Same client code works with HTTP, WebSocket, Local, or Mock transports
- **Type-Safe Middleware** - Context types accumulate through `use()` calls with compile-time validation
- **Rich Error System** - 70+ error codes with metadata, suggestions, and retry hints
- **Collections Framework** - Java-inspired data structures with composable behaviors (LRU, TTL, bounded, evented)
- **Streaming Support** - First-class support for streaming responses

## Installation

```bash
npm install client
```

## Quick Start

```typescript
import { Client, HttpTransport, createRetryMiddleware, createAuthMiddleware } from "client";

// Create client with type-accumulating middleware
const client = new Client({ transport: new HttpTransport({ baseUrl: "https://api.example.com" }) })
  .use(createRetryMiddleware({ maxRetries: 3 }))      // Client<RetryContext>
  .use(createAuthMiddleware({ token: "abc123" }));    // Client<RetryContext & AuthContext>

// Make RPC calls
const user = await client.call<{ id: string }, User>(
  { service: "users", operation: "get" },
  { id: "123" }
);

// Streaming
for await (const event of client.stream(
  { service: "events", operation: "watch" },
  { topic: "orders" }
)) {
  console.log(event);
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           APPLICATION                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌───────────────────────────┐     ┌───────────────────────────┐  │
│   │     Client<TContext>      │     │         Server            │  │
│   │  ┌─────────────────────┐  │     │  ┌─────────────────────┐  │  │
│   │  │     Middleware      │  │     │  │  Handler Registry   │  │  │
│   │  │  (type-safe chain)  │  │     │  └─────────────────────┘  │  │
│   │  └─────────────────────┘  │     └───────────────────────────┘  │
│   └───────────────────────────┘                                    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                        TRANSPORT LAYER                              │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│   │    HTTP    │  │ WebSocket  │  │   Local    │  │    Mock    │   │
│   └────────────┘  └────────────┘  └────────────┘  └────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Type-Safe Middleware

Middleware context types accumulate through the chain:

```typescript
// Each middleware declares what it provides and requires
const client = new Client(transport)
  .use(createTimeoutMiddleware({ overall: 5000 }))   // Client<TimeoutContext>
  .use(createRetryMiddleware())                       // Client<TimeoutContext & RetryContext>
  .use(createCacheMiddleware());                      // Client<... & CacheContext>

// Middleware requiring context not yet provided causes compile error
client.use(middlewareRequiringAuth);  // ERROR: AuthContext not in chain
```

## Client Middleware

| Middleware | Purpose | Options |
|------------|---------|---------|
| `createRetryMiddleware` | Exponential backoff with jitter | `maxRetries`, `retryDelay`, `jitter` |
| `createCacheMiddleware` | LRU + TTL caching | `capacity`, `ttl`, `keyGenerator` |
| `createTimeoutMiddleware` | Per-attempt timeout | `perAttempt` |
| `createOverallTimeoutMiddleware` | Overall request timeout | `overall` |
| `createAuthMiddleware` | Bearer token / API key | `token`, `apiKey`, `userId` |
| `createTracingMiddleware` | W3C Trace Context | `generateTraceId`, `generateSpanId` |
| `createCircuitBreakerMiddleware` | Fault tolerance | `failureThreshold`, `resetTimeout` |
| `createRateLimitMiddleware` | Token bucket throttling | `maxRequests`, `window`, `strategy` |
| `createBatchingMiddleware` | Request aggregation | `maxBatchSize`, `maxWaitTime` |
| `createPaginationMiddleware` | Auto-pagination | `defaultLimit`, `maxLimit` |

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

## Collections Framework

Java-inspired collections with composable behaviors:

```typescript
import { arrayList, hashMap, compose, lruMap, ttlMap, eventedList, boundedList } from "client/collections";

// Basic collections
const list = arrayList<number>();
const map = hashMap<string, User>();

// Composed collections with behaviors
const cache = compose(
  lruMap({ capacity: 100 }),
  ttlMap({ ttl: 60000 })
)(hashMap<string, CachedData>());

const eventLog = compose(
  eventedList<Event>(),
  boundedList({ capacity: 1000, policy: "drop-oldest" })
)(arrayList<Event>());

// Events
eventLog.on("add", ({ item }) => console.log("Added:", item));
```

### Available Collections

| Type | Implementations |
|------|-----------------|
| List | `ArrayList`, `LinkedList` |
| Map | `HashMap`, `LinkedHashMap`, `TreeMap` |
| Set | `HashSet`, `TreeSet` |
| Queue/Deque | `ArrayDeque`, `PriorityQueue` |

### Composable Behaviors

| Behavior | Purpose |
|----------|---------|
| `bounded` | Capacity limits with overflow policies |
| `lru` | Least Recently Used eviction |
| `ttl` | Time-to-live expiration |
| `evented` | Typed event emission |
| `safe` | Option/Result error handling |
| `readonly` | Immutable views |
| `synchronized` | Thread safety |

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - System design and diagrams
- [Client API](./docs/CLIENT.md) - Client class and middleware reference
- [Server API](./docs/SERVER.md) - Server class and handler registration
- [Adapters](./docs/ADAPTERS.md) - HTTP, WebSocket, Local, Mock transports
- [Middleware](./docs/MIDDLEWARE.md) - Middleware system deep-dive
- [Collections](./docs/COLLECTIONS.md) - Collections framework reference

## Requirements

- Node.js >= 20
- TypeScript >= 5.0

## License

MIT
