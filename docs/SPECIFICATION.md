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

The Universal Client System is a comprehensive TypeScript library providing a **unified data access layer** where:

- **All collection operations flow through the Universal Client**
- **Storage backends (Local, Remote, Hybrid) determine where data lives**
- **Same collection API works whether data is in-memory or on a remote server**

### The Key Unification

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        APPLICATION CODE                                  │
│                                                                         │
│   // Same API regardless of where data lives                            │
│   const users = createCollection<User>(storage);                        │
│   await users.set("123", { name: "John" });                             │
│   const user = await users.get("123");                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          STORAGE LAYER                                   │
│                                                                         │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐│
│   │ InMemoryStorage │  │   ApiStorage    │  │    HybridStorage        ││
│   │   (minimongo)   │  │ (remote mongo)  │  │ (local + remote sync)   ││
│   └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘│
│            │                    │                        │              │
│       synchronous          uses Client              uses both          │
│                                 │                        │              │
└────────────────────────────────┬┴────────────────────────┴──────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       UNIVERSAL CLIENT                                   │
│                                                                         │
│   Collection operations become RPC calls:                               │
│   • get(id)     → client.call({ service, operation: "get" }, { id })   │
│   • set(id, v)  → client.call({ service, operation: "set" }, { id, v })│
│   • delete(id)  → client.call({ service, operation: "delete" }, { id })│
│   • getAll()    → client.call({ service, operation: "getAll" }, {})    │
│                                                                         │
│   All client middleware applies: retry, cache, auth, tracing, etc.     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        TRANSPORT LAYER                                   │
│                                                                         │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│   │    HTTP    │  │ WebSocket  │  │   Local    │  │    Mock    │       │
│   │ (REST API) │  │ (realtime) │  │   (LPC)    │  │  (testing) │       │
│   └────────────┘  └────────────┘  └────────────┘  └────────────┘       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Benefits

1. **Location Transparency**: Collections work identically whether backed by local memory or remote database
2. **Seamless Migration**: Switch from local minimongo to remote MongoDB by changing storage backend
3. **Offline Support**: HybridStorage provides local cache with background sync
4. **Unified Middleware**: Retry, caching, auth, tracing apply to all collection operations
5. **Protocol Agnostic**: Same code works over HTTP, WebSocket, or in-process

---

## 2. System Architecture

### 2.1 The Unification Model

The fundamental insight is that **collection operations ARE RPC calls**:

```typescript
// What the application writes:
const users = createCollection<User>(apiStorage);
await users.set("123", { name: "John" });
const user = await users.get("123");

// What actually happens (inside ApiStorage):
await client.call({ service: "users", operation: "set" }, { id: "123", value: { name: "John" } });
const user = await client.call({ service: "users", operation: "get" }, { id: "123" });
```

This means:
- **All client middleware applies to collection operations**
- **Collections can transparently switch backends (local → remote → hybrid)**
- **The same collection code works in browser, Node.js, or test environments**

### 2.2 Storage Strategy Pattern

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          COLLECTION                                       │
│                                                                          │
│   users.get("123")  →  storage.get("123")  →  ???                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
             ┌────────────┐ ┌────────────┐ ┌────────────────────┐
             │   LOCAL    │ │   REMOTE   │ │       HYBRID       │
             │  STORAGE   │ │  STORAGE   │ │      STORAGE       │
             ├────────────┤ ├────────────┤ ├────────────────────┤
             │            │ │            │ │                    │
             │  In-Memory │ │  ApiStorage│ │ Local + Remote     │
             │   (sync)   │ │  via Client│ │ Write-through or   │
             │            │ │  (async)   │ │ Write-back         │
             │            │ │            │ │                    │
             │  Like      │ │  Like      │ │ Like Meteor's      │
             │  minimongo │ │  MongoDB   │ │ minimongo + mongo  │
             │            │ │            │ │                    │
             └────────────┘ └─────┬──────┘ └─────────┬──────────┘
                                  │                  │
                                  ▼                  ▼
                           ┌────────────────────────────────────┐
                           │         UNIVERSAL CLIENT           │
                           │                                    │
                           │   Middleware Stack:                │
                           │   • Retry (exponential backoff)    │
                           │   • Cache (LRU + TTL)              │
                           │   • Timeout (per-attempt/overall)  │
                           │   • Auth (bearer/API key)          │
                           │   • Tracing (W3C Trace Context)    │
                           │   • Circuit Breaker                │
                           │   • Rate Limiting                  │
                           │                                    │
                           └────────────────┬───────────────────┘
                                            │
                                            ▼
                           ┌────────────────────────────────────┐
                           │           TRANSPORT                │
                           │  HTTP / WebSocket / Local / Mock   │
                           └────────────────────────────────────┘
```

### 2.3 Directory Structure

```
src/
├── index.ts                    # Main entry point
│
├── client/                     # Universal RPC Client
│   ├── client.ts               # Client class
│   ├── types.ts                # TypedClientMiddleware, Message, etc.
│   ├── typed-method.ts         # Type-safe method construction
│   └── errors/                 # Error system (70+ codes)
│
├── server/                     # Universal RPC Server
│   └── types.ts                # Handler types
│
├── adapters/                   # Transport Implementations
│   ├── http/                   # HTTP transport (REST)
│   ├── websocket/              # WebSocket transport (real-time)
│   ├── local/                  # Local transport (in-process)
│   └── mock/                   # Mock transport (testing)
│
├── middleware/                 # Universal Middleware System
│   ├── types.ts                # Middleware type definitions
│   └── compose.ts              # compose(), bundle()
│
└── collections/                # Collections Framework
    ├── interfaces/             # Collection, List, Map, Set, Queue
    ├── impl/                   # ArrayList, HashMap, TreeMap, etc.
    ├── behaviors/              # lru, ttl, bounded, evented, etc.
    ├── async/                  # Channel, AsyncQueue
    ├── fx/                     # Functional operations, collectors
    ├── core/                   # Traits, effects, middleware
    └── storage/                # *** THE KEY UNIFICATION ***
        ├── interface.ts        # CollectionStorage interface
        ├── memory.ts           # InMemoryStorage (local, sync)
        ├── api.ts              # ApiStorage (remote via Client)
        └── hybrid.ts           # HybridStorage (local + remote)
```

---

## 3. Core Concepts

### 3.1 Method Identification

All RPC calls (including collection operations) use structured method identifiers:

```typescript
interface Method {
  service: string;      // e.g., "users", "orders", "products"
  operation: string;    // e.g., "get", "set", "delete", "getAll"
  version?: string;     // e.g., "v1", "v2"
}
```

**Collection Operations as Methods:**

| Collection Operation | RPC Method |
|---------------------|------------|
| `storage.get(id)` | `{ service: "users", operation: "get" }` |
| `storage.set(id, value)` | `{ service: "users", operation: "set" }` |
| `storage.delete(id)` | `{ service: "users", operation: "delete" }` |
| `storage.getAll()` | `{ service: "users", operation: "getAll" }` |
| `storage.find(predicate)` | `{ service: "users", operation: "find" }` |
| `storage.has(id)` | `{ service: "users", operation: "has" }` |
| `storage.size()` | `{ service: "users", operation: "size" }` |
| `storage.clear()` | `{ service: "users", operation: "clear" }` |
| `storage.setBatch(items)` | `{ service: "users", operation: "setBatch" }` |
| `storage.deleteBatch(ids)` | `{ service: "users", operation: "deleteBatch" }` |
| `storage.getBatch(ids)` | `{ service: "users", operation: "getBatch" }` |

### 3.2 Message Format

**Request Message:**

```typescript
interface Message<TPayload> {
  id: string;           // Correlation ID (UUID)
  method: Method;       // { service, operation, version? }
  payload: TPayload;    // Request body (e.g., { id: "123" })
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

---

## 4. Client System (RPC/LPC)

### 4.1 Client Construction

```typescript
import { Client, HttpTransport } from "client";

const client = new Client({
  transport: new HttpTransport({ baseUrl: "https://api.example.com" }),
  defaultMetadata: { auth: { apiKey: "xxx" } },
  throwOnError: true,
});
```

### 4.2 Making Calls

```typescript
// Direct RPC call
const user = await client.call<{ id: string }, User>(
  { service: "users", operation: "get" },
  { id: "123" }
);

// Streaming
for await (const event of client.stream<{ topic: string }, Event>(
  { service: "events", operation: "watch" },
  { topic: "orders" }
)) {
  processEvent(event);
}
```

### 4.3 Middleware Composition

```typescript
const client = new Client({ transport })
  .use(createTimeoutMiddleware({ overall: 5000 }))
  .use(createRetryMiddleware({ maxRetries: 3 }))
  .use(createCacheMiddleware({ ttl: 60000 }))
  .use(createAuthMiddleware({ token: "abc123" }));
```

### 4.4 Recommended Middleware Order

```
Request:   timeout → retry → cache → circuit → rate → auth → tracing → transport
Response:  timeout ← retry ← cache ← circuit ← rate ← auth ← tracing ← transport
```

---

## 5. Transport Adapters

### 5.1 HTTP Transport

For REST APIs:

```typescript
const transport = new HttpTransport({
  baseUrl: "https://api.example.com",
  timeout: 30000,
});
```

### 5.2 WebSocket Transport

For real-time:

```typescript
const transport = new WebSocketTransport({
  url: "wss://api.example.com/ws",
  reconnect: { enabled: true, maxAttempts: 10 },
});
```

### 5.3 Local Transport (LPC)

For in-process RPC:

```typescript
const transport = new LocalTransport();

transport.register(
  { service: "users", operation: "get" },
  async ({ id }) => database.users.findById(id)
);
```

### 5.4 Mock Transport

For testing:

```typescript
const transport = new MockTransport({ trackHistory: true });
transport.mockSuccess(
  (method) => method.service === "users",
  { id: "123", name: "John" }
);
```

---

## 6. Middleware System

### 6.1 Unified Middleware Type

```typescript
type Middleware<TContextOut, TContextIn, TReturn, TAsync extends boolean> = (
  next: MiddlewareRunner<TContextIn & TContextOut, TReturn, TAsync>
) => MiddlewareRunner<TContextIn, TReturn, TAsync>;
```

### 6.2 Composition

```typescript
import { compose, bundle } from "client/middleware";

// Compose middleware with runner
const runner = compose(
  timeoutMiddleware,
  retryMiddleware,
  async (ctx) => fetch(ctx.url)
);

// Bundle for reuse
const standardStack = bundle(
  createTimeoutMiddleware({ overall: 5000 }),
  createRetryMiddleware({ maxRetries: 3 })
);
```

---

## 7. Collections Framework

### 7.1 The Storage Unification

**This is the key architectural insight:** Collections don't operate independently - they use storage backends that route operations through the Universal Client.

```typescript
import { Client, HttpTransport } from "client";
import { ApiStorage, HybridStorage, InMemoryStorage } from "client/collections/storage";

// Create the Universal Client
const client = new Client({
  transport: new HttpTransport({ baseUrl: "https://api.example.com" })
})
.use(createRetryMiddleware({ maxRetries: 3 }))
.use(createAuthMiddleware({ token: getToken() }));

// Option 1: Remote storage (all operations go to server)
const remoteUsers = new ApiStorage<User>(client, { service: "users" });

// Option 2: Local storage (in-memory, like minimongo)
const localUsers = new InMemoryStorage<User>();

// Option 3: Hybrid storage (local cache + remote sync)
const hybridUsers = new HybridStorage<User>(
  new ApiStorage<User>(client, { service: "users" }),
  {
    writeStrategy: "write-through",  // or "write-back"
    conflictResolution: "remote",    // or "local", "merge", "error"
    syncInterval: 5000,              // background sync for write-back
    offlineQueue: true,              // queue operations when offline
  }
);

// ALL THREE USE THE SAME API:
await remoteUsers.set("123", { name: "John" });
await localUsers.set("123", { name: "John" });
await hybridUsers.set("123", { name: "John" });

const user = await remoteUsers.get("123");
const user = localUsers.get("123");  // synchronous for in-memory
const user = hybridUsers.get("123"); // reads from local cache
```

### 7.2 Storage Interface

```typescript
interface CollectionStorage<T> {
  // Read operations (sync or async depending on backend)
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
}
```

### 7.3 ApiStorage - Remote Collections via Client

**This is where collections meet the client:**

```typescript
class ApiStorage<T> implements CollectionStorage<T> {
  constructor(
    private client: Client,
    private options: { service: string; version?: string }
  ) {}

  async get(id: string): Promise<T | undefined> {
    // Collection operation becomes RPC call through the client!
    const response = await this.client.call<{ id: string }, { data: T }>(
      { service: this.options.service, operation: "get" },
      { id }
    );
    return response.data;
  }

  async set(id: string, value: T): Promise<void> {
    await this.client.call(
      { service: this.options.service, operation: "set" },
      { id, value }
    );
  }

  async delete(id: string): Promise<boolean> {
    const response = await this.client.call<{ id: string }, { deleted: boolean }>(
      { service: this.options.service, operation: "delete" },
      { id }
    );
    return response.deleted;
  }

  // ... all other operations follow the same pattern
}
```

**Benefits:**
- All client middleware (retry, cache, auth, tracing) applies automatically
- Can switch transports without changing collection code
- Same collection API works in browser, Node.js, or tests

### 7.4 HybridStorage - Local + Remote with Sync

Like Meteor's minimongo + MongoDB:

```typescript
const hybrid = new HybridStorage<User>(remoteStorage, {
  // Write strategy
  writeStrategy: "write-through",  // Immediate sync to remote
  // writeStrategy: "write-back",  // Local first, sync later

  // Conflict resolution when syncing
  conflictResolution: "remote",    // Server wins
  // conflictResolution: "local",  // Client wins
  // conflictResolution: "merge",  // Custom merge function
  // conflictResolution: "error",  // Throw on conflict

  // For write-back: sync interval
  syncInterval: 5000,

  // Offline support
  offlineQueue: true,              // Queue operations when offline
  maxOfflineOps: 1000,             // Max queued operations
});

// Fast local reads
const user = hybrid.get("123");  // From local cache (sync)

// Writes go to both (write-through) or local then queue (write-back)
await hybrid.set("123", { name: "John" });

// Manual sync
await hybrid.syncFromRemote();  // Pull from server
await hybrid.syncToRemote();    // Push queued operations
await hybrid.sync();            // Both directions

// Check status
hybrid.isRemoteOnline();        // boolean
hybrid.getPendingOpsCount();    // number of queued ops
```

### 7.5 Collection Implementations

Built on the storage abstraction:

| Implementation | Interface | Description |
|----------------|-----------|-------------|
| `ArrayList<T>` | `List<T>` | Dynamic array |
| `LinkedList<T>` | `List<T>`, `Deque<T>` | Doubly-linked list |
| `HashMap<K,V>` | `MapLike<K,V>` | Hash table |
| `LinkedHashMap<K,V>` | `MapLike<K,V>` | Insertion-ordered map |
| `TreeMap<K,V>` | `NavigableMap<K,V>` | Sorted map (BST) |
| `HashSet<T>` | `Set<T>` | Hash-based set |
| `TreeSet<T>` | `NavigableSet<T>` | Sorted set (BST) |
| `ArrayDeque<T>` | `Deque<T>` | Double-ended queue |
| `PriorityQueue<T>` | `Queue<T>` | Min-heap |

### 7.6 Composable Behaviors

Behaviors add capabilities via middleware:

```typescript
import { compose, arrayList, boundedList, eventedList, lruMap, hashMap } from "client/collections";

// List with events + capacity limit
const logs = compose(
  eventedList<LogEntry>(),
  boundedList({ capacity: 10000, policy: "drop-oldest" })
)(arrayList<LogEntry>());

logs.on("add", ({ value }) => console.log("Added:", value));

// Map with LRU eviction
const cache = compose(
  lruMap({ capacity: 100 })
)(hashMap<string, Data>());
```

**Available Behaviors:**

| Behavior | Description |
|----------|-------------|
| `bounded` | Capacity limits with overflow policies |
| `lru` | Least Recently Used eviction |
| `ttl` | Time-to-live expiration |
| `evented` | Typed event emission |
| `safe` | Option/Result error handling |
| `readonly` | Immutable views |
| `synchronized` | Thread-safe operations |

### 7.7 Async Collections

**Channel (Go-style CSP):**

```typescript
import { channel, select, timeout, workerPool } from "client/collections/async";

const ch = channel<number>(10);

// Send and receive
await ch.send(42);
const value = await ch.receive();

// Select from multiple channels
const result = await select(
  ch1.case((v) => `ch1: ${v}`),
  ch2.case((v) => `ch2: ${v}`),
  timeout(1000).case(() => "timeout")
);

// Worker pool
const results = workerPool(jobs, async (job) => processJob(job), { workers: 4 });
```

### 7.8 Functional Operations

```typescript
import { pipe, map, filter, take, collect, groupingBy } from "client/collections/fx";

const result = pipe(
  [1, 2, 3, 4, 5],
  (it) => filter(it, x => x % 2 === 0),
  (it) => map(it, x => x * 2),
  (it) => take(it, 2),
  toArray
);

const grouped = collect(users, groupingBy(u => u.department));
```

### 7.9 Effect Types

```typescript
import { Option, Some, None, Result, Ok, Err } from "client/collections";

// Option<T> - optional values
function findUser(id: string): Option<User> {
  const user = db.find(id);
  return user ? Some(user) : None;
}

// Result<T, E> - success or failure
function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return Err("Division by zero");
  return Ok(a / b);
}
```

---

## 8. Error System

70+ protocol-agnostic error codes with rich metadata:

```typescript
import { getErrorMetadata, ErrorCode } from "client/client/errors";

const metadata = getErrorMetadata("TIMEOUT");
// {
//   code: "TIMEOUT",
//   category: "timeout",
//   retryable: true,
//   severity: "warning",
//   userMessage: "The request took too long...",
//   suggestions: ["Try again", "Check server..."]
// }
```

---

## 9. Type System

### 9.1 Core Traits

```typescript
type Eq<T> = (a: T, b: T) => boolean;
type Hash<T> = (value: T) => number;
type Compare<T> = (a: T, b: T) => number;
```

### 9.2 Capability Traits

```typescript
interface Sized { readonly size: number; }
interface Emptiable { readonly isEmpty: boolean; }
interface Clearable { clear(): void; }
interface Bounded {
  readonly capacity: number;
  readonly isFull: boolean;
  readonly remainingCapacity: number;
}
```

---

## 10. Usage Examples

### 10.1 Complete Application with Collections via Client

```typescript
import {
  Client,
  HttpTransport,
  LocalTransport,
  createRetryMiddleware,
  createAuthMiddleware,
} from "client";
import { ApiStorage, HybridStorage, InMemoryStorage } from "client/collections/storage";

interface User {
  id: string;
  name: string;
  email: string;
}

// ============================================================
// PRODUCTION: Remote storage via HTTP
// ============================================================

const prodClient = new Client({
  transport: new HttpTransport({ baseUrl: "https://api.prod.com" })
})
.use(createRetryMiddleware({ maxRetries: 3 }))
.use(createAuthMiddleware({ token: process.env.API_TOKEN }));

const prodUsers = new ApiStorage<User>(prodClient, { service: "users" });

// All operations go through the client to the server:
await prodUsers.set("123", { id: "123", name: "John", email: "john@example.com" });
const user = await prodUsers.get("123");

// ============================================================
// DEVELOPMENT: Local storage (like minimongo)
// ============================================================

const devUsers = new InMemoryStorage<User>();

// Same API, but synchronous and in-memory:
devUsers.set("123", { id: "123", name: "John", email: "john@example.com" });
const user = devUsers.get("123");

// ============================================================
// HYBRID: Local cache + remote sync (like Meteor)
// ============================================================

const hybridClient = new Client({
  transport: new HttpTransport({ baseUrl: "https://api.prod.com" })
})
.use(createRetryMiddleware({ maxRetries: 3 }));

const hybridUsers = new HybridStorage<User>(
  new ApiStorage<User>(hybridClient, { service: "users" }),
  {
    writeStrategy: "write-through",
    conflictResolution: "remote",
    syncOnInit: true,
  }
);

// Fast local reads:
const user = hybridUsers.get("123");

// Writes sync to server:
await hybridUsers.set("123", { id: "123", name: "John", email: "john@example.com" });

// ============================================================
// TESTING: Mock transport
// ============================================================

import { MockTransport } from "client/adapters/mock";

const mockTransport = new MockTransport();
mockTransport.mockSuccess(
  (method) => method.service === "users" && method.operation === "get",
  { data: { id: "123", name: "Test User", email: "test@example.com" } }
);

const testClient = new Client({ transport: mockTransport });
const testUsers = new ApiStorage<User>(testClient, { service: "users" });

// Same collection API works with mock:
const user = await testUsers.get("123");
expect(user.name).toBe("Test User");
```

### 10.2 Switching Storage Backends

The power of the unification - same code, different backends:

```typescript
// Application code that works with ANY storage backend
async function createUserProfile(storage: CollectionStorage<User>, userData: User) {
  // Check if user exists
  const existing = await storage.get(userData.id);
  if (existing) {
    throw new Error("User already exists");
  }

  // Create the user
  await storage.set(userData.id, userData);

  // Return the created user
  return storage.get(userData.id);
}

// Works with local storage (testing/development)
await createUserProfile(new InMemoryStorage<User>(), newUser);

// Works with remote storage (production)
await createUserProfile(new ApiStorage<User>(client, { service: "users" }), newUser);

// Works with hybrid storage (offline-first apps)
await createUserProfile(hybridStorage, newUser);
```

### 10.3 Real-Time Collections via WebSocket

```typescript
const wsClient = new Client({
  transport: new WebSocketTransport({
    url: "wss://api.example.com/ws",
    reconnect: { enabled: true },
  })
});

const realtimeOrders = new ApiStorage<Order>(wsClient, { service: "orders" });

// Operations go through WebSocket instead of HTTP
await realtimeOrders.set("order-1", newOrder);

// Subscribe to real-time updates
for await (const event of wsClient.stream(
  { service: "orders", operation: "subscribe" },
  { userId: currentUser.id }
)) {
  // Update local state when server pushes changes
  if (event.type === "created") {
    console.log("New order:", event.order);
  }
}
```

---

## 11. API Reference

### 11.1 Storage Exports

```typescript
import {
  // Storage interface
  CollectionStorage,
  StorageMetadata,

  // Storage implementations
  InMemoryStorage,   // Local, synchronous
  ApiStorage,        // Remote via Client
  HybridStorage,     // Local + Remote sync

  // Types
  ApiStorageOptions,
  HybridStorageOptions,
  ConflictResolution,  // "local" | "remote" | "merge" | "error"
  WriteStrategy,       // "write-through" | "write-back"
} from "client/collections/storage";
```

### 11.2 Client Exports

```typescript
import {
  Client,
  HttpTransport,
  WebSocketTransport,
  LocalTransport,
  MockTransport,

  // Middleware
  createRetryMiddleware,
  createCacheMiddleware,
  createTimeoutMiddleware,
  createAuthMiddleware,
  createTracingMiddleware,

  // Utilities
  compose,
  bundle,
} from "client";
```

### 11.3 Collections Exports

```typescript
import {
  // Implementations
  arrayList, linkedList, arrayDeque,
  hashMap, linkedHashMap, treeMap,
  hashSet, treeSet, priorityQueue,

  // Behaviors
  bounded, lruMap, ttlMap,
  evented, readonly, safe, synchronized,

  // Async
  channel, asyncQueue, select, timeout, workerPool,

  // Effects
  Option, Some, None, Result, Ok, Err,

  // Functional
  pipe, map, filter, collect, groupingBy,
} from "client/collections";
```

---

## Appendix A: Comparison with Meteor

| Feature | Meteor | This System |
|---------|--------|-------------|
| Local Collections | Minimongo | InMemoryStorage |
| Remote Collections | MongoDB via DDP | ApiStorage via Client |
| Sync | DDP protocol | HybridStorage (write-through/back) |
| Offline Support | Limited | Full offline queue |
| Transport | WebSocket (DDP) | Any (HTTP, WS, Local, Mock) |
| Middleware | None | Full middleware stack |

---

## Appendix B: Migration Guide

**From direct API calls to Collections:**

```typescript
// Before: Direct API calls
const response = await fetch("/api/users/123");
const user = await response.json();

// After: Collections via Client
const users = new ApiStorage<User>(client, { service: "users" });
const user = await users.get("123");
```

**From local-only to hybrid:**

```typescript
// Before: Local only
const users = new InMemoryStorage<User>();

// After: Hybrid (local + remote)
const users = new HybridStorage<User>(
  new ApiStorage<User>(client, { service: "users" }),
  { writeStrategy: "write-through" }
);
// Same API, now syncs to server!
```

---

*This specification reflects the unified architecture where all collection operations flow through the Universal Client system.*
