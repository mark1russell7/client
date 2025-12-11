# Architecture

This document describes the architecture of the Universal RPC Library.

## System Overview

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

## Core Concepts

### Protocol Independence

The library abstracts away protocol-specific details through the `Transport` interface:

```typescript
interface Transport {
  readonly name: string;
  send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>>;
  close(): Promise<void>;
}
```

All communication flows through this interface, enabling:
- Identical client code for HTTP, WebSocket, or in-process calls
- Easy testing via Mock transport
- Gradual service decomposition (Local → HTTP)

### Type-Safe Middleware Composition

Middleware types accumulate through the `use()` chain:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Type-Safe Middleware Composition                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  new Client(transport)              → Client<{}>                    │
│    .use(createRetryMiddleware())    → Client<RetryContext>          │
│    .use(createCacheMiddleware())    → Client<RetryContext           │
│                                              & CacheContext>        │
│    .use(createAuthMiddleware(...))  → Client<RetryContext           │
│                                              & CacheContext          │
│                                              & AuthContext>         │
│                                                                     │
│  Compile-time validation:                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ If middleware.requires ⊆ accumulated.provides → VALID       │   │
│  │ If middleware.requires ⊄ accumulated.provides → TYPE ERROR  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Request/Response Flow

```
┌────────┐    ┌─────────┐    ┌───────┐    ┌───────┐    ┌───────────┐
│ Client │───►│ Timeout │───►│ Retry │───►│ Cache │───►│ Transport │
│  call  │    │         │    │       │    │       │    │           │
└────────┘    └────┬────┘    └───┬───┘    └───┬───┘    └─────┬─────┘
                   │             │            │              │
                   │             │            │              ▼
                   │             │            │         ┌─────────┐
                   │             │            │         │ Network │
                   │             │            │         └────┬────┘
                   │             │            │              │
                   ▼             ▼            ▼              ▼
              Response ◄─── Response ◄── Response ◄─── Response
```

**Onion Model**: Middleware wraps the next layer:
- First middleware added = outermost layer (runs first on request, last on response)
- Last middleware added = innermost layer (runs last on request, first on response)

## Directory Structure

```
src/
├── index.ts                    # Main entry point (re-exports)
│
├── client/                     # Universal RPC Client
│   ├── client.ts               # Client<TContext> class
│   ├── types.ts                # TypedClientMiddleware, Message, etc.
│   ├── errors/                 # Error system (70+ codes)
│   │   ├── codes.ts            # ErrorCode enum
│   │   ├── registry.ts         # Error metadata registry
│   │   └── factory.ts          # Error creation utilities
│   └── middleware/             # 9 client middlewares
│       ├── contexts.ts         # Context type definitions
│       ├── retry.ts            # Exponential backoff
│       ├── cache.ts            # LRU + TTL caching
│       ├── timeout.ts          # Per-attempt and overall
│       ├── auth.ts             # Bearer token, API key
│       ├── tracing.ts          # W3C Trace Context
│       ├── circuit-breaker.ts  # Fault tolerance
│       ├── rate-limit.ts       # Token bucket throttling
│       ├── batching.ts         # Request aggregation
│       └── pagination.ts       # Auto-pagination
│
├── server/                     # Universal RPC Server
│   ├── server.ts               # Server class
│   └── types.ts                # Handler types
│
├── adapters/                   # Transport Implementations
│   ├── http/
│   │   ├── client/             # HttpTransport
│   │   ├── server/             # HttpServerTransport
│   │   └── shared/             # Status codes, headers
│   ├── websocket/
│   │   ├── client/             # WebSocketTransport
│   │   └── server/             # WebSocketServerTransport
│   ├── local/
│   │   └── client/             # LocalTransport
│   └── mock/
│       └── client/             # MockTransport
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

## Module Dependencies

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

## Key Type Hierarchy

### Message Types

```typescript
// Structured method identifier
interface Method {
  service: string;      // e.g., "users", "orders"
  operation: string;    // e.g., "get", "create"
  version?: string;     // e.g., "v1", "v2"
}

// Universal request
interface Message<TPayload> {
  id: string;           // Correlation ID
  method: Method;
  payload: TPayload;
  metadata: Metadata;
  signal?: AbortSignal;
}

// Universal response
interface ResponseItem<TPayload> {
  id: string;
  status: Status;
  payload: TPayload;
  metadata: Metadata;
}
```

### Middleware Types

```typescript
// Typed middleware with context tracking
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

### Collections Hierarchy

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

## Error Handling

The library uses a rich error system with 70+ error codes:

```typescript
interface Status {
  type: "success" | "error";
  code: number | string;
  message?: string;
  retryable?: boolean;
  metadata?: ErrorMetadata;
}

interface ErrorMetadata {
  summary: string;
  detail: string;
  userMessage: string;
  devMessage: string;
  suggestions: string[];
  category: ErrorCategory;
  severity: ErrorSeverity;
}
```

Categories: `Network`, `Client`, `Server`, `Protocol`, `Auth`, `RateLimit`, `Timeout`

## Collections Behavior Composition

```
┌─────────────────────────────────────────────────────────────────┐
│  compose(evented(), lru({ capacity: 100 }), bounded())(map)    │
│                           │                                     │
│              ┌────────────┼────────────┐                       │
│              ▼            ▼            ▼                       │
│         ┌─────────┐  ┌─────────┐  ┌─────────┐                 │
│         │ Evented │──│   LRU   │──│ Bounded │── HashMap       │
│         └─────────┘  └─────────┘  └─────────┘                 │
│              │            │            │                       │
│         emit events  track access  enforce cap                │
└─────────────────────────────────────────────────────────────────┘
```

Available behaviors:
- **bounded** - Capacity limits with overflow policies
- **lru** - Least Recently Used eviction
- **ttl** - Time-to-live expiration
- **evented** - Typed event emission
- **safe** - Option/Result error handling
- **readonly** - Immutable views
- **synchronized** - Thread safety
