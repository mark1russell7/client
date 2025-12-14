# Universal Client System - Architectural Specification

> **Version:** 1.0.0
> **Last Updated:** December 2024
> **Package:** `client`

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Core Concepts](#3-core-concepts)
4. [Client System (RPC/LPC)](#4-client-system-rpclpc)
5. [Transport Adapters](#5-transport-adapters)
6. [Middleware System](#6-middleware-system)
7. [Collections Framework](#7-collections-framework)
8. [Error System](#8-error-system)
9. [Type System](#9-type-system)
10. [Usage Examples](#10-usage-examples)
11. [API Reference](#11-api-reference)

---

## 1. Executive Summary

The Universal Client System is a comprehensive TypeScript library providing:

- **Protocol-Agnostic RPC Client**: Unified interface for HTTP, WebSocket, Local (LPC), and Mock transports
- **Type-Safe Middleware Composition**: Compile-time validated middleware chains with context tracking
- **Collections Framework**: Java Collections-inspired data structures with composable behaviors
- **Rich Error Handling**: 70+ error codes with metadata, categorization, and recovery suggestions

### Key Design Principles

1. **Protocol Independence**: Same client code works across HTTP, WebSocket, gRPC, or in-process
2. **Type Safety**: Full TypeScript support with compile-time middleware validation
3. **Composition over Inheritance**: Behaviors composed via middleware, not class hierarchies
4. **Onion Architecture**: Request/response flow through layered middleware
5. **Functional Patterns**: Option/Result types, lazy iterables, collectors

---

## 2. System Architecture

### 2.1 High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           APPLICATION                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌───────────────────────────┐     ┌───────────────────────────┐  │
│   │     Client<TContext>      │     │         Server            │  │
│   │  ┌─────────────────────┐  │     │  ┌─────────────────────┐  │  │
│   │  │     Middleware      │  │     │  │  Handler Registry   │  │  │
│   │  │  ┌───────────────┐  │  │     │  │                     │  │  │
│   │  │  │    Retry      │  │  │     │  │  service.operation  │  │  │
│   │  │  ├───────────────┤  │  │     │  │       → handler     │  │  │
│   │  │  │    Cache      │  │  │     │  │                     │  │  │
│   │  │  ├───────────────┤  │  │     │  └─────────────────────┘  │  │
│   │  │  │   Timeout     │  │  │     │                           │  │
│   │  │  ├───────────────┤  │  │     │  ┌─────────────────────┐  │  │
│   │  │  │    Auth       │  │  │     │  │     Middleware      │  │  │
│   │  │  ├───────────────┤  │  │     │  └─────────────────────┘  │  │
│   │  │  │   Tracing     │  │  │     │                           │  │
│   │  │  └───────────────┘  │  │     └─────────────┬─────────────┘  │
│   │  └─────────────────────┘  │                   │                │
│   └─────────────┬─────────────┘                   │                │
│                 │                                 │                │
├─────────────────┴─────────────────────────────────┴────────────────┤
│                        TRANSPORT LAYER                             │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│   │    HTTP    │  │ WebSocket  │  │   Local    │  │    Mock    │  │
│   └────────────┘  └────────────┘  └────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Directory Structure

```
src/
├── index.ts                    # Main entry point (re-exports)
│
├── client/                     # Universal RPC Client
│   ├── types.ts                # TypedClientMiddleware, Message, etc.
│   ├── typed-method.ts         # Type-safe method construction
│   └── errors/                 # Error system (70+ codes)
│       ├── codes.ts            # ErrorCode enum
│       ├── types.ts            # Error metadata types
│       ├── registry.ts         # Error metadata registry
│       ├── factory.ts          # Error creation utilities
│       └── http-errors.ts      # HTTP-specific errors
│
├── server/                     # Universal RPC Server
│   └── types.ts                # Handler types
│
├── adapters/                   # Transport Implementations
│   ├── http/
│   │   ├── client/             # HttpTransport
│   │   ├── server/             # HttpServerTransport
│   │   └── shared/             # Status codes, headers, strategies
│   ├── websocket/
│   │   ├── client/             # WebSocketTransport
│   │   └── server/             # WebSocketServerTransport
│   ├── local/
│   │   └── client/             # LocalTransport (LPC)
│   └── mock/
│       └── client/             # MockTransport (testing)
│
├── middleware/                 # Universal Middleware System
│   ├── types.ts                # Middleware<TOut, TIn, TReturn, TAsync>
│   └── compose.ts              # compose(), bundle()
│
└── collections/                # Collections Framework
    ├── interfaces/             # Collection, List, Map, Set, Queue
    ├── impl/                   # ArrayList, HashMap, TreeMap, etc.
    ├── behaviors/              # lru, ttl, bounded, evented, etc.
    ├── async/                  # Channel, AsyncQueue
    ├── fx/                     # Lazy operations, collectors
    ├── core/                   # Traits, effects, middleware
    └── storage/                # Storage backends
```

### 2.3 Module Dependencies

```
                    ┌────────────────┐
                    │    index.ts    │
                    └───────┬────────┘
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │    client    │ │    server    │ │  collections │
    └──────┬───────┘ └──────┬───────┘ └──────────────┘
           │                │
           ▼                ▼
    ┌──────────────┐ ┌──────────────┐
    │   adapters   │ │   adapters   │
    └──────┬───────┘ └──────────────┘
           │
           ▼
    ┌──────────────┐
    │  middleware  │  (universal composition)
    └──────────────┘
```

---

## 3. Core Concepts

### 3.1 Method Identification

All RPC calls use structured method identifiers:

```typescript
interface Method {
  service: string;      // e.g., "users", "orders"
  operation: string;    // e.g., "get", "create", "list"
  version?: string;     // e.g., "v1", "v2"
}

// Examples
{ service: "users", operation: "get" }
{ service: "orders", operation: "create", version: "v2" }
```

**Type-Safe Method Construction:**

```typescript
// Define your procedure registry
interface ProcedureRegistry {
  users: {
    get: { request: { id: string }; response: User };
    list: { request: { limit?: number }; response: User[] };
    create: { request: CreateUserDTO; response: User };
  };
  orders: {
    get: { request: { id: string }; response: Order };
    submit: { request: SubmitOrderDTO; response: Order };
  };
}

// Type-safe method creation with autocomplete
import { createMethod } from "client";

const method = createMethod<ProcedureRegistry>("users", "get");
// TypeScript provides autocomplete for both service and operation
// Compile error if service or operation doesn't exist
```

### 3.2 Message Format

**Request Message:**

```typescript
interface Message<TPayload> {
  id: string;           // Correlation ID (UUID)
  method: Method;       // { service, operation, version? }
  payload: TPayload;    // Request body
  metadata: Metadata;   // Headers, auth, tracing, etc.
  signal?: AbortSignal; // Cancellation signal
}
```

**Response Item:**

```typescript
interface ResponseItem<TPayload> {
  id: string;           // Correlation ID (matches request)
  status: Status;       // Success or error status
  payload: TPayload;    // Response body
  metadata: Metadata;   // Response headers
}

type Status =
  | { type: "success"; code: number }
  | { type: "error"; code: string; message: string; retryable: boolean };
```

### 3.3 Transport Interface

All adapters implement this interface:

```typescript
interface Transport {
  readonly name: string;
  send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>>;
  close(): Promise<void>;
}
```

**Key Points:**
- `send()` returns `AsyncIterable` supporting both single responses and streaming
- Single response: yields exactly one item
- Streaming: yields multiple items
- Transport-agnostic: same interface for HTTP, WebSocket, Local, Mock

---

## 4. Client System (RPC/LPC)

### 4.1 Client Construction

```typescript
import { Client, HttpTransport } from "client";

// Basic construction
const client = new Client({
  transport: new HttpTransport({ baseUrl: "https://api.example.com" }),
  defaultMetadata: { auth: { apiKey: "xxx" } },
  throwOnError: true,  // default: true
});
```

### 4.2 Making Calls

**Single Request:**

```typescript
const user = await client.call<GetUserRequest, User>(
  { service: "users", operation: "get" },
  { id: "123" },
  { timeout: { overall: 5000 } }  // optional metadata
);
```

**Streaming:**

```typescript
for await (const event of client.stream<SubscribeRequest, Event>(
  { service: "events", operation: "watch" },
  { topic: "orders" }
)) {
  processEvent(event);
}
```

### 4.3 Middleware Composition

Middleware uses **type-safe context tracking**:

```typescript
type TypedClientMiddleware<
  TProvides = {},    // Context this middleware adds
  TRequires = {},    // Context this middleware needs
  TReq = unknown,
  TRes = unknown,
> = ClientMiddleware<TReq, TRes> & {
  readonly __provides?: TProvides;
  readonly __requires?: TRequires;
};
```

**Composition Example:**

```typescript
const client = new Client({ transport })
  .use(createTimeoutMiddleware({ overall: 5000 }))   // Client<TimeoutContext>
  .use(createRetryMiddleware({ maxRetries: 3 }))     // Client<TimeoutContext & RetryContext>
  .use(createCacheMiddleware({ ttl: 60000 }))        // Client<... & CacheContext>
  .use(createAuthMiddleware({ token: "abc123" }));   // Client<... & AuthContext>
```

**Compile-Time Validation:**

```typescript
// Valid chain: retry provides what logRetry requires
const client = new Client(transport)
  .use(retryMiddleware)       // Client<RetryContext>
  .use(logRetryMiddleware);   // logRetry requires RetryContext ✓

// Invalid chain: TYPE ERROR
const badClient = new Client(transport)
  .use(logRetryMiddleware);   // logRetry requires RetryContext not yet provided ✗
```

### 4.4 Available Client Middleware

| Middleware | Provides | Requires | Description |
|------------|----------|----------|-------------|
| `createRetryMiddleware` | `RetryContext` | - | Exponential backoff with jitter |
| `createCacheMiddleware` | `CacheContext` | - | LRU + TTL caching |
| `createTimeoutMiddleware` | `TimeoutContext` | - | Per-attempt timeout |
| `createOverallTimeoutMiddleware` | `TimeoutContext` | - | Overall timeout including retries |
| `createCombinedTimeoutMiddleware` | `TimeoutContext` | - | Both per-attempt and overall |
| `createAuthMiddleware` | `AuthContext` | - | Bearer token, API key |
| `createTracingMiddleware` | `TracingContext` | - | W3C Trace Context |
| `createCircuitBreakerMiddleware` | `CircuitBreakerContext` | - | Fault tolerance |
| `createRateLimitMiddleware` | `RateLimitContext` | - | Token bucket throttling |
| `createBatchingMiddleware` | `BatchingContext` | - | Request aggregation |
| `createPaginationMiddleware` | `PaginationContext` | - | Auto-pagination |

### 4.5 Recommended Middleware Order

```typescript
client
  .use(createOverallTimeoutMiddleware({ overall: 30000 }))  // 1. Overall timeout
  .use(createRetryMiddleware({ maxRetries: 3 }))            // 2. Retry
  .use(createTimeoutMiddleware({ perAttempt: 5000 }))       // 3. Per-attempt timeout
  .use(createCacheMiddleware({ ttl: 60000 }))               // 4. Cache
  .use(createCircuitBreakerMiddleware({ threshold: 5 }))    // 5. Circuit breaker
  .use(createRateLimitMiddleware({ maxRequests: 100 }))     // 6. Rate limit
  .use(createAuthMiddleware({ token: "xxx" }))              // 7. Auth
  .use(createTracingMiddleware());                          // 8. Tracing
```

**Execution Flow (Onion Model):**
```
Request:   timeout → retry → cache → circuit → rate → auth → tracing → transport
Response:  timeout ← retry ← cache ← circuit ← rate ← auth ← tracing ← transport
```

---

## 5. Transport Adapters

### 5.1 HTTP Transport

For REST APIs and microservices:

```typescript
import { HttpTransport } from "client/adapters/http/client";

const transport = new HttpTransport({
  baseUrl: "https://api.example.com",

  // URL strategy: Method → URL
  urlStrategy: defaultUrlPattern,  // /{version?}/{service}/{operation}

  // HTTP method strategy: Operation → HTTP verb
  httpMethodStrategy: restfulHttpMethodStrategy,  // get→GET, create→POST, etc.

  // Default headers
  defaultHeaders: { "Content-Type": "application/json" },

  // Request timeout
  timeout: 30000,
});
```

**URL Strategies:**

```typescript
// Default: /{version?}/{service}/{operation}
defaultUrlPattern({ service: "users", operation: "get" })
// → "/users/get"

defaultUrlPattern({ service: "users", operation: "get", version: "v2" })
// → "/v2/users/get"

// RESTful: /{version?}/{service}
restfulUrlPattern({ service: "users", operation: "get" })
// → "/users"

// Custom
const customStrategy = (method: Method) => `/api/${method.service}/${method.operation}`;
```

**HTTP Method Strategies:**

```typescript
// RESTful mapping (default)
restfulHttpMethodStrategy(method)
// "get" → GET, "list" → GET, "create" → POST, "update" → PUT, "delete" → DELETE

// POST only
postOnlyStrategy(method)
// All operations → POST
```

### 5.2 WebSocket Transport

For real-time, bidirectional communication:

```typescript
import { WebSocketTransport } from "client/adapters/websocket/client";

const transport = new WebSocketTransport({
  url: "wss://api.example.com/ws",

  // Auto-reconnect settings
  reconnect: {
    enabled: true,
    maxAttempts: 10,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 1.5,
  },

  // Connection timeout
  connectionTimeout: 10000,

  // Heartbeat (keep-alive)
  heartbeat: {
    enabled: true,
    interval: 30000,
    timeout: 5000,
  },

  // Event callbacks
  onConnect: () => console.log("Connected"),
  onDisconnect: (reason) => console.log("Disconnected:", reason),
  onReconnecting: (attempt) => console.log("Reconnecting:", attempt),
  onError: (error) => console.error("Error:", error),
});
```

**Connection States:**

```typescript
enum WebSocketState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  RECONNECTING = "reconnecting",
  DISCONNECTING = "disconnecting",
}

// Check state
transport.getState();  // WebSocketState
transport.isConnected();  // boolean
```

### 5.3 Local Transport (LPC)

For in-process RPC without network calls:

```typescript
import { LocalTransport } from "client/adapters/local/client";

const transport = new LocalTransport({
  throwOnMissing: true,  // Throw error if handler not found
});

// Register handlers
transport.register(
  { service: "users", operation: "get" },
  async (payload, message) => {
    const user = await database.users.findById(payload.id);
    return user;
  }
);

transport.register(
  { service: "users", operation: "create" },
  async (payload) => {
    return await database.users.create(payload);
  }
);

// Use with client (identical API to HTTP/WebSocket)
const client = new Client({ transport });
const user = await client.call(
  { service: "users", operation: "get" },
  { id: "123" }
);
```

**Use Cases:**
- **Testing**: Test client code without network
- **Development**: Develop UI before backend is ready
- **Embedded**: Same-process RPC for plugin systems
- **Migration**: Gradual transition from monolith to microservices

### 5.4 Mock Transport

For unit testing with predefined responses:

```typescript
import { MockTransport } from "client/adapters/mock/client";

const transport = new MockTransport({
  minLatency: 10,        // Simulate network latency
  maxLatency: 50,
  failureRate: 0.01,     // 1% random failures
  trackHistory: true,    // Track call history for assertions
});

// Mock specific responses
transport.mockSuccess(
  (method, payload) => method.service === "users" && method.operation === "get",
  { id: "123", name: "John Doe", email: "john@example.com" }
);

transport.mockError(
  (method) => method.operation === "delete",
  "Deletion not allowed"
);

// Use in tests
const client = new Client({ transport });

await client.call({ service: "users", operation: "get" }, { id: "123" });

// Assert calls were made
expect(transport.getCalls()).toHaveLength(1);
expect(transport.getLastCall().message.method.service).toBe("users");
```

---

## 6. Middleware System

### 6.1 Unified Middleware Type

The middleware system is designed for maximum flexibility:

```typescript
type Middleware<TContextOut, TContextIn, TReturn, TAsync extends boolean = false> = (
  next: MiddlewareRunner<TContextIn & TContextOut, TReturn, TAsync>
) => MiddlewareRunner<TContextIn, TReturn, TAsync>;

type MiddlewareRunner<TContext, TReturn, TAsync extends boolean = false> =
  TAsync extends true
    ? (context: TContext) => Promise<TReturn>
    : (context: TContext) => TReturn;
```

**Type Parameters:**
- `TContextOut`: Context fields this middleware provides/adds
- `TContextIn`: Context fields this middleware requires
- `TReturn`: Return type of the runner
- `TAsync`: Whether execution is async (true) or sync (false)

### 6.2 Composition Utilities

**`compose()` - Compose middleware with a runner:**

```typescript
import { compose } from "client/middleware";

// Async composition
const runner = compose(
  timeoutMiddleware,
  retryMiddleware,
  cacheMiddleware,
  async (ctx) => fetch(ctx.url)
);

await runner({ url: "https://example.com" });

// Sync composition
const syncRunner = compose(
  validationMiddleware,
  transformMiddleware,
  (ctx) => ctx.value * 2
);

syncRunner({ value: 21 });  // 42
```

**`bundle()` - Create reusable middleware stacks:**

```typescript
import { bundle } from "client/middleware";

const standardStack = bundle(
  createTimeoutMiddleware({ overall: 5000 }),
  createRetryMiddleware({ maxRetries: 3 }),
  createCacheMiddleware({ ttl: 60000 })
);

// Use like any middleware
client.use(standardStack);

// Or compose further
const enhancedStack = bundle(
  createTracingMiddleware(),
  standardStack
);
```

### 6.3 Context Validation

The `MiddlewaresContext` type recursively validates middleware chains:

```typescript
type MiddlewaresContext<TMiddlewares, TBaseContext> =
  TMiddlewares extends [
    Middleware<infer TNextOut, infer TNextIn, any, any>,
    ...infer TRest,
  ]
    ? TBaseContext extends TNextIn
      ? MiddlewaresContext<TRest, TBaseContext & TNextOut>
      : never  // Requirements not met - compile error
    : TBaseContext;

// Example:
type Mw1 = Middleware<{ a: number }, {}, Response, true>;      // Provides { a }
type Mw2 = Middleware<{ b: string }, { a: number }, R, true>;  // Requires { a }, provides { b }

type ValidCtx = MiddlewaresContext<[Mw1, Mw2], {}>;
// Result: { a: number; b: string }

type InvalidCtx = MiddlewaresContext<[Mw2], {}>;
// Result: never (Mw2 requires { a } but {} doesn't have it)
```

### 6.4 Writing Custom Middleware

**Client Middleware:**

```typescript
import { TypedClientMiddleware, ClientRunner, ClientContext } from "client";

interface MyContext {
  myField: string;
}

export function createMyMiddleware(
  options: MyOptions
): TypedClientMiddleware<MyContext, {}> {
  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      // Before: Modify request
      context.message.metadata.myField = options.value;

      // Execute next middleware or transport
      const responseStream = next(context);

      // After: Process response
      for await (const item of responseStream) {
        // Optionally transform response
        yield item;
      }
    };
  };
}
```

**Server Middleware:**

```typescript
import { ServerMiddleware, ServerRunner, ServerContext } from "client/server";

export const loggingMiddleware: ServerMiddleware = (next) => async (context) => {
  const start = Date.now();
  console.log("Request:", context.request.method);

  const response = await next(context);

  console.log(`Response: ${response.status.type} in ${Date.now() - start}ms`);
  return response;
};
```

---

## 7. Collections Framework

### 7.1 Overview

A Java Collections-inspired framework with composable behaviors:

```
                      Iterable<T>
                          │
                  ┌───────┴───────┐
                  │               │
           Collection<T>      Map<K,V>
                  │               │
          ┌───────┼───────┐       ├── HashMap
          │       │       │       ├── LinkedHashMap
       List<T> Set<T>  Queue<T>   └── TreeMap
          │       │       │
    ┌─────┴─────┐ │    ┌──┴───────┐
    │           │ │    │          │
ArrayList  LinkedList │  ArrayDeque
               │      │  PriorityQueue
            HashSet TreeSet
```

### 7.2 Core Interfaces

**ReadonlyCollection<T>:**

```typescript
interface ReadonlyCollection<T> extends Iterable<T> {
  readonly size: number;
  readonly isEmpty: boolean;
  contains(element: T): boolean;
  containsAll(other: Iterable<T>): boolean;
  toArray(): T[];
  forEach(action: (element: T, index: number) => void): void;
  readonly eq: Eq<T>;  // Equality function
}
```

**Collection<T>:**

```typescript
interface Collection<T> extends ReadonlyCollection<T> {
  add(element: T): boolean;
  addAll(other: Iterable<T>): boolean;
  remove(element: T): boolean;
  removeAll(other: Iterable<T>): boolean;
  retainAll(other: Iterable<T>): boolean;
  clear(): void;
}
```

**MapLike<K, V>:**

```typescript
interface MapLike<K, V> extends ReadonlyMapLike<K, V> {
  set(key: K, value: V): V | undefined;
  setIfAbsent(key: K, value: V): V;
  delete(key: K): V | undefined;
  replace(key: K, value: V): V | undefined;
  computeIfAbsent(key: K, mappingFunction: (key: K) => V): V;
  computeIfPresent(key: K, remappingFunction: (key: K, value: V) => V | undefined): V | undefined;
  merge(key: K, value: V, remappingFunction: (oldValue: V, newValue: V) => V | undefined): V | undefined;
  putAll(other: ReadonlyMapLike<K, V> | Iterable<Entry<K, V>>): void;
  clear(): void;
}
```

### 7.3 Implementations

| Implementation | Interface | Description |
|----------------|-----------|-------------|
| `ArrayList<T>` | `List<T>` | Dynamic array with O(1) random access |
| `LinkedList<T>` | `List<T>`, `Deque<T>` | Doubly-linked list with O(1) at ends |
| `HashMap<K,V>` | `MapLike<K,V>` | Hash table with custom equality/hashing |
| `LinkedHashMap<K,V>` | `MapLike<K,V>` | HashMap preserving insertion order |
| `TreeMap<K,V>` | `NavigableMap<K,V>` | Sorted map using BST |
| `HashSet<T>` | `Set<T>` | Hash-based unique elements |
| `TreeSet<T>` | `NavigableSet<T>` | Sorted set using BST |
| `ArrayDeque<T>` | `Deque<T>` | Double-ended queue with O(1) at both ends |
| `PriorityQueue<T>` | `Queue<T>` | Min-heap with custom comparator |

### 7.4 Composable Behaviors

Behaviors are middleware that add capabilities to collections:

```
┌─────────────────────────────────────────────────────────────┐
│  compose(evented(), lru({ capacity: 100 }), bounded())     │
│                           │                                 │
│              ┌────────────┼────────────┐                   │
│              ▼            ▼            ▼                   │
│         ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│         │ Evented │──│   LRU   │──│ Bounded │── HashMap   │
│         └─────────┘  └─────────┘  └─────────┘             │
│              │            │            │                   │
│         emit events  track access  enforce cap            │
└─────────────────────────────────────────────────────────────┘
```

**Available Behaviors:**

| Behavior | Description | Options |
|----------|-------------|---------|
| `bounded` | Capacity limits | `capacity`, `policy: "throw" \| "drop-oldest" \| "drop-newest" \| "reject"` |
| `lru` | Least Recently Used eviction | `capacity`, `onEvict` |
| `ttl` | Time-to-live expiration | `ttl`, `checkInterval`, `onExpire` |
| `evented` | Typed event emission | Events: `add`, `remove`, `set`, `delete`, `clear` |
| `safe` | Option/Result error handling | Returns `Option<T>` instead of throwing |
| `readonly` | Immutable views | Blocks all mutating methods |
| `synchronized` | Thread safety | Mutex-protected operations |

**Usage Example:**

```typescript
import { compose, arrayList, boundedList, eventedList, lruMap, hashMap } from "client/collections";

// List with events + bounds
const list = compose(
  eventedList<Event>(),
  boundedList({ capacity: 1000, policy: "drop-oldest" })
)(arrayList<Event>());

list.on("add", ({ value }) => console.log("Added:", value));
list.add(event);

// Map with LRU eviction
const cache = compose(
  lruMap({ capacity: 100, onEvict: ({ key }) => console.log("Evicted:", key) })
)(hashMap<string, Data>());
```

### 7.5 Functional Operations

**Lazy Iterables:**

```typescript
import { pipe, map, filter, take, reduce, toArray } from "client/collections/fx";

const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const result = pipe(
  numbers,
  (it) => filter(it, x => x % 2 === 0),  // [2, 4, 6, 8, 10]
  (it) => map(it, x => x * 2),            // [4, 8, 12, 16, 20]
  (it) => take(it, 3),                    // [4, 8, 12]
  toArray
);
// result: [4, 8, 12]
```

**Available Operations:**

| Category | Operations |
|----------|------------|
| Transform | `map`, `flatMap`, `flatten` |
| Filter | `filter`, `take`, `skip`, `takeWhile`, `skipWhile`, `distinct` |
| Combine | `concat`, `zip`, `enumerate` |
| Window | `chunk`, `window`, `partition` |
| Aggregate | `reduce`, `scan`, `count`, `sum`, `min`, `max`, `average` |
| Check | `some`, `every`, `none`, `find` |

**Collectors:**

```typescript
import { collect, groupingBy, counting, joining, mapping } from "client/collections/fx";

const users = [
  { name: "Alice", dept: "Engineering" },
  { name: "Bob", dept: "Engineering" },
  { name: "Carol", dept: "Sales" },
];

// Group by department
const byDept = collect(users, groupingBy(u => u.dept));
// Map { "Engineering" => [Alice, Bob], "Sales" => [Carol] }

// Count by department
const counts = collect(users, groupingBy(u => u.dept, counting()));
// Map { "Engineering" => 2, "Sales" => 1 }

// Join names
const names = collect(users, mapping(u => u.name, joining(", ")));
// "Alice, Bob, Carol"
```

### 7.6 Async Collections

**Channel (Go-style CSP):**

```typescript
import { channel, select, timeout, pipeline, workerPool } from "client/collections/async";

// Basic channel
const ch = channel<number>(10);  // Buffered with capacity 10

// Send and receive
await ch.send(42);
const value = await ch.receive();

// Select from multiple channels
const result = await select(
  ch1.case((v) => `ch1: ${v}`),
  ch2.case((v) => `ch2: ${v}`),
  timeout(1000).case(() => "timeout")
);

// Pipeline: transform values
const doubled = pipeline(ch, x => x * 2);

// Worker pool: parallel processing
const results = workerPool(jobs, async (job) => processJob(job), { workers: 4 });
```

**AsyncQueue:**

```typescript
import { asyncQueue, AsyncQueue } from "client/collections/async";

const queue = asyncQueue<Task>({ capacity: 100 });

// Producer (blocks if full)
await queue.put(task);

// Consumer (blocks if empty)
const task = await queue.take();

// Non-blocking
const task = queue.tryTake();  // T | undefined
const success = queue.tryPut(task);  // boolean
```

### 7.7 Effect Types

**Option<T> - Optional values:**

```typescript
import { Option, Some, None, isSome, getOrElse, fromNullable } from "client/collections";

function findUser(id: string): Option<User> {
  const user = db.find(id);
  return user ? Some(user) : None;
}

const result = findUser("123");

if (isSome(result)) {
  console.log(result.value);
}

// Or use getOrElse
const user = getOrElse(result, defaultUser);

// Convert from nullable
const opt = fromNullable(maybeNull);  // Option<T>
```

**Result<T, E> - Success or failure:**

```typescript
import { Result, Ok, Err, isOk, isErr, tryCatch } from "client/collections";

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return Err("Division by zero");
  return Ok(a / b);
}

const result = divide(10, 2);

if (isOk(result)) {
  console.log(result.value);  // 5
} else {
  console.error(result.error);
}

// Convert throwing function to Result
const parsed = tryCatch(
  () => JSON.parse(jsonString),
  (e) => `Parse error: ${e.message}`
);
```

### 7.8 Storage Backends

Abstract storage layer for collections:

```typescript
interface CollectionStorage<T> {
  // Read operations
  get(id: string): Promise<T | undefined> | T | undefined;
  getAll(): Promise<T[]> | T[];
  find(predicate: (item: T) => boolean): Promise<T[]> | T[];
  has(id: string): Promise<boolean> | boolean;
  size(): Promise<number> | number;

  // Write operations
  set(id: string, value: T): Promise<void> | void;
  delete(id: string): Promise<boolean> | boolean;
  clear(): Promise<void> | void;

  // Bulk operations
  setBatch(items: Array<[string, T]>): Promise<void> | void;
  deleteBatch(ids: string[]): Promise<number> | number;
  getBatch(ids: string[]): Promise<Map<string, T>> | Map<string, T>;

  // Lifecycle
  close(): Promise<void> | void;
  getMetadata?(): Promise<StorageMetadata> | StorageMetadata;
}
```

**Storage Types:**
- **InMemoryStorage**: Fast, volatile storage using Map
- **ApiStorage**: Remote persistence via universal client
- **HybridStorage**: Local cache + remote sync with conflict resolution

---

## 8. Error System

### 8.1 Error Codes

70+ protocol-agnostic error codes organized by category:

```typescript
enum ErrorCode {
  // Network errors
  NETWORK_ERROR = "NETWORK_ERROR",
  CONNECTION_REFUSED = "CONNECTION_REFUSED",
  DNS_ERROR = "DNS_ERROR",

  // Timeout errors
  TIMEOUT = "TIMEOUT",
  CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
  READ_TIMEOUT = "READ_TIMEOUT",
  DEADLINE_EXCEEDED = "DEADLINE_EXCEEDED",

  // Cancellation
  ABORTED = "ABORTED",

  // Protocol/parsing errors
  PARSE_ERROR = "PARSE_ERROR",
  SERIALIZE_ERROR = "SERIALIZE_ERROR",
  INVALID_RESPONSE = "INVALID_RESPONSE",
  PROTOCOL_ERROR = "PROTOCOL_ERROR",

  // Client errors (4xx equivalent)
  BAD_REQUEST = "BAD_REQUEST",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS",
  // ... (30+ more)

  // Server errors (5xx equivalent)
  INTERNAL_ERROR = "INTERNAL_ERROR",
  NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
  BAD_GATEWAY = "BAD_GATEWAY",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  GATEWAY_TIMEOUT = "GATEWAY_TIMEOUT",
  // ... (10+ more)
}
```

### 8.2 Error Metadata

Each error code has rich metadata:

```typescript
interface ErrorMetadata {
  code: string;           // Error code
  summary: string;        // Short human-readable summary
  detail: string;         // Detailed explanation
  category: ErrorCategory;
  retryable: boolean;
  severity: ErrorSeverity;
  userMessage: string;    // End-user friendly message
  devMessage: string;     // Developer diagnostic message
  httpStatus?: number;    // HTTP status code (if applicable)
  suggestions?: string[]; // Recovery suggestions
  docsUrl?: string;       // Related documentation URL
}

enum ErrorCategory {
  NETWORK = "network",
  CLIENT = "client",
  SERVER = "server",
  PROTOCOL = "protocol",
  AUTH = "auth",
  RATE_LIMIT = "rate_limit",
  TIMEOUT = "timeout",
  CANCELLED = "cancelled",
  UNKNOWN = "unknown",
}

enum ErrorSeverity {
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  CRITICAL = "critical",
}
```

### 8.3 Error Registry

```typescript
import { getErrorMetadata, isKnownError, httpStatusToErrorCode } from "client/client/errors";

// Get metadata for any error code
const metadata = getErrorMetadata("TIMEOUT");
// {
//   code: "TIMEOUT",
//   summary: "Request timed out",
//   detail: "The request exceeded the configured timeout duration...",
//   category: "timeout",
//   retryable: true,
//   severity: "warning",
//   userMessage: "The request took too long to complete. Please try again.",
//   devMessage: "Request exceeded timeout threshold...",
//   httpStatus: 408,
//   suggestions: ["Try again with a longer timeout", "Check server performance", ...]
// }

// Check if error code is known
isKnownError("TIMEOUT");  // true
isKnownError("CUSTOM_ERROR");  // false

// Map HTTP status to error code
httpStatusToErrorCode(404);  // "NOT_FOUND"
httpStatusToErrorCode(500);  // "INTERNAL_ERROR"
```

---

## 9. Type System

### 9.1 Core Traits

```typescript
// Equality comparison
type Eq<T> = (a: T, b: T) => boolean;

// Hash function for hash-based collections
type Hash<T> = (value: T) => number;

// Comparison for sorted collections
type Compare<T> = (a: T, b: T) => number;  // negative if a < b, zero if equal, positive if a > b
```

### 9.2 Capability Traits

```typescript
interface Sized { readonly size: number; }
interface Emptiable { readonly isEmpty: boolean; }
interface Clearable { clear(): void; }
interface Cloneable<T> { clone(): T; }
interface ArrayConvertible<T> { toArray(): T[]; }
interface Bounded {
  readonly capacity: number;
  readonly isFull: boolean;
  readonly remainingCapacity: number;
}
interface Disposable { dispose(): void; }
interface Freezable<T> {
  freeze(): T;
  readonly isFrozen: boolean;
}
```

### 9.3 Middleware Context Types

```typescript
interface RetryContext {
  retry: { attempt: number; maxAttempts: number };
}

interface CacheContext {
  cache: { hit: boolean; key: string };
}

interface TimeoutContext {
  timeout: { overall?: number; perAttempt?: number };
}

interface AuthContext {
  auth: { token?: string; apiKey?: string; userId?: string };
}

interface TracingContext {
  tracing: { traceId: string; spanId: string; parentSpanId?: string };
}

interface CircuitBreakerContext {
  circuitBreaker: { state: CircuitState; failures: number; successes: number };
}

interface RateLimitContext {
  rateLimit: { tokensAvailable: number; maxTokens: number; queueSize: number };
}

interface BatchingContext {
  batching: { batchKey: string; batchSize: number };
}

interface PaginationContext {
  pagination: { page?: number; offset?: number; limit: number };
}
```

---

## 10. Usage Examples

### 10.1 Complete HTTP Client

```typescript
import {
  Client,
  HttpTransport,
  createRetryMiddleware,
  createCacheMiddleware,
  createTimeoutMiddleware,
  createAuthMiddleware,
  createTracingMiddleware,
  bundle,
} from "client";

// Create standard middleware bundle
const standardMiddleware = bundle(
  createTimeoutMiddleware({ perAttempt: 5000 }),
  createRetryMiddleware({ maxRetries: 3, retryDelay: 1000 }),
  createCacheMiddleware({ capacity: 100, ttl: 60000 }),
  createAuthMiddleware(() => ({ token: getAuthToken() })),
  createTracingMiddleware()
);

// Create client
const client = new Client({
  transport: new HttpTransport({
    baseUrl: "https://api.example.com",
    timeout: 30000,
  }),
}).use(standardMiddleware);

// Make calls
async function getUser(id: string): Promise<User> {
  return client.call<{ id: string }, User>(
    { service: "users", operation: "get" },
    { id }
  );
}

async function createUser(data: CreateUserDTO): Promise<User> {
  return client.call<CreateUserDTO, User>(
    { service: "users", operation: "create" },
    data
  );
}

// Streaming example
async function watchEvents(topic: string): AsyncIterable<Event> {
  return client.stream<{ topic: string }, Event>(
    { service: "events", operation: "watch" },
    { topic }
  );
}
```

### 10.2 Local Transport for Testing

```typescript
import { Client, LocalTransport } from "client";

// Setup local handlers
const transport = new LocalTransport();

transport.register(
  { service: "users", operation: "get" },
  async ({ id }) => mockDatabase.users.find(u => u.id === id)
);

transport.register(
  { service: "users", operation: "create" },
  async (data) => {
    const user = { id: generateId(), ...data };
    mockDatabase.users.push(user);
    return user;
  }
);

// Use in tests
const client = new Client({ transport });

test("should get user", async () => {
  const user = await client.call({ service: "users", operation: "get" }, { id: "123" });
  expect(user.id).toBe("123");
});
```

### 10.3 WebSocket Real-Time Communication

```typescript
import { Client, WebSocketTransport } from "client";

const transport = new WebSocketTransport({
  url: "wss://api.example.com/ws",
  reconnect: {
    enabled: true,
    maxAttempts: Infinity,
    initialDelay: 1000,
    maxDelay: 30000,
  },
  onConnect: () => console.log("Connected!"),
  onDisconnect: (reason) => console.log("Disconnected:", reason),
  onReconnecting: (attempt) => console.log(`Reconnecting (${attempt})...`),
});

const client = new Client({ transport });

// Subscribe to real-time events
async function subscribeToOrders(userId: string) {
  for await (const event of client.stream(
    { service: "orders", operation: "subscribe" },
    { userId }
  )) {
    switch (event.type) {
      case "created":
        handleOrderCreated(event.order);
        break;
      case "updated":
        handleOrderUpdated(event.order);
        break;
      case "completed":
        handleOrderCompleted(event.order);
        break;
    }
  }
}
```

### 10.4 Collections with Behaviors

```typescript
import {
  compose,
  arrayList,
  hashMap,
  boundedList,
  eventedList,
  lruMap,
  ttlMap,
  channel,
  workerPool,
} from "client/collections";

// Bounded event list (e.g., for logs)
const logs = compose(
  eventedList<LogEntry>(),
  boundedList({ capacity: 10000, policy: "drop-oldest" })
)(arrayList<LogEntry>());

logs.on("add", ({ value }) => sendToLogService(value));
logs.on("remove", ({ value }) => console.log("Log dropped:", value.timestamp));

// LRU + TTL cache
const cache = compose(
  lruMap({ capacity: 1000 }),
  ttlMap({ ttl: 300000 })  // 5 minutes
)(hashMap<string, CachedData>());

// Worker pool for parallel processing
const jobs = channel<Job>(100);
const results = workerPool(jobs, async (job) => {
  return await processJob(job);
}, { workers: 4 });

// Feed jobs
for (const job of pendingJobs) {
  await jobs.send(job);
}
jobs.close();

// Collect results
for await (const result of results) {
  console.log("Processed:", result);
}
```

### 10.5 Functional Data Processing

```typescript
import {
  pipe, map, filter, flatMap, take, skip,
  collect, groupingBy, counting, summarizingNumber, joining
} from "client/collections/fx";

interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "shipped" | "delivered";
}

// Process orders with lazy evaluation
const processedOrders = pipe(
  orders,
  (it) => filter(it, o => o.status !== "pending"),
  (it) => map(it, o => ({
    ...o,
    itemCount: o.items.length,
    averageItemPrice: o.total / o.items.length
  })),
  (it) => take(it, 100)
);

// Collect statistics
const stats = collect(orders, summarizingNumber(o => o.total));
// { count, sum, min, max, average }

// Group by customer
const byCustomer = collect(orders, groupingBy(
  o => o.customerId,
  summarizingNumber(o => o.total)
));
// Map<customerId, { count, sum, min, max, average }>

// Count by status
const statusCounts = collect(orders, groupingBy(
  o => o.status,
  counting()
));
// Map { "pending" => 10, "shipped" => 25, "delivered" => 50 }
```

---

## 11. API Reference

### 11.1 Package Exports

```typescript
// Main entry point
import {
  // Client
  Client,

  // Middleware creators
  createRetryMiddleware,
  createCacheMiddleware,
  createTimeoutMiddleware,
  createOverallTimeoutMiddleware,
  createCombinedTimeoutMiddleware,
  createAuthMiddleware,
  createBearerAuthMiddleware,
  createApiKeyAuthMiddleware,
  createTracingMiddleware,
  createCircuitBreakerMiddleware,
  createRateLimitMiddleware,
  createBatchingMiddleware,
  createPaginationMiddleware,

  // Middleware utilities
  compose,
  bundle,
  wrapWithAsyncMiddlewares,
  wrapWithSyncMiddlewares,

  // Error system
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
  getErrorMetadata,
  isKnownError,
  httpStatusToErrorCode,

  // Type utilities
  createMethod,
  isValidMethod,
} from "client";

// Adapters
import { HttpTransport } from "client/adapters/http";
import { WebSocketTransport } from "client/adapters/websocket";
import { LocalTransport } from "client/adapters/local";
import { MockTransport } from "client/adapters/mock";

// Server
import { Server } from "client/server";

// Collections
import {
  // Implementations
  arrayList, linkedList, arrayDeque,
  hashMap, linkedHashMap, treeMap,
  hashSet, treeSet,
  priorityQueue,

  // Behaviors
  bounded, boundedList, boundedMap,
  lruMap, lruCache, LRUCache,
  ttlMap, ttlCache, TTLCache,
  eventedList, eventedMap,
  readonly, readonlyList, readonlyMap,
  safeList, safeMap,
  synchronized,

  // Async
  channel, Channel,
  asyncQueue, AsyncQueue,
  select, timeout, ticker,
  pipeline, fanOut, fanIn, merge,
  workerPool,

  // Effects
  Option, Some, None, isSome, isNone,
  Result, Ok, Err, isOk, isErr,
  getOrElse, unwrap, tryCatch,

  // Functional
  pipe, map, filter, flatMap, take, skip,
  reduce, scan, distinct, chunk, zip,
  collect, groupingBy, counting, joining,
  summarizingNumber, minBy, maxBy,

  // Factories
  emptyList, emptyMap,
  singletonList, singletonMap,
  listOf, mapOf, range,
} from "client/collections";
```

### 11.2 Import Paths

| Path | Contents |
|------|----------|
| `client` | Main exports, Client, middleware |
| `client/client` | Client internals |
| `client/client/*` | Client submodules |
| `client/server` | Server exports |
| `client/server/*` | Server submodules |
| `client/middleware` | Middleware types and utilities |
| `client/collections` | Collections framework |
| `client/collections/*` | Collections submodules |
| `client/adapters/http` | HTTP transport |
| `client/adapters/websocket` | WebSocket transport |
| `client/adapters/local` | Local transport |
| `client/adapters/mock` | Mock transport |

---

## Appendix A: Diagrams Reference

See the following documentation files for visual diagrams:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - System architecture diagrams
- [`docs/CLIENT.md`](docs/CLIENT.md) - Client API documentation
- [`docs/SERVER.md`](docs/SERVER.md) - Server API documentation
- [`docs/ADAPTERS.md`](docs/ADAPTERS.md) - Transport adapter documentation
- [`docs/MIDDLEWARE.md`](docs/MIDDLEWARE.md) - Middleware system documentation
- [`docs/COLLECTIONS.md`](docs/COLLECTIONS.md) - Collections framework documentation

---

## Appendix B: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Dec 2024 | Initial release |

---

## Appendix C: Dependencies

**Runtime Dependencies:**
- `ws: ^8.18.3` - WebSocket implementation

**Peer Dependencies (Optional):**
- `express: ^4.0.0 || ^5.0.0` - For HTTP server transport
- `zod: ^3.0.0` - For request/response validation

**Development Dependencies:**
- `typescript: ^5.7.0`
- `@types/ws: ^8.18.1`
- `@types/express: ^5.0.0`

---

*This specification is auto-generated and maintained alongside the codebase.*
