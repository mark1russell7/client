# Client API

The Universal Client provides protocol-agnostic RPC communication with type-safe middleware composition.

## Quick Start

```typescript
import { Client, HttpTransport, createRetryMiddleware, createAuthMiddleware } from "client";

// Create client with HTTP transport
const client = new Client({ transport: new HttpTransport({ baseUrl: "https://api.example.com" }) })
  .use(createRetryMiddleware({ maxRetries: 3 }))
  .use(createAuthMiddleware({ token: process.env.API_TOKEN }));

// Make RPC call
const user = await client.call<GetUserRequest, User>(
  { service: "users", operation: "get" },
  { id: 123 }
);

// Streaming
for await (const event of client.stream(
  { service: "events", operation: "watch" },
  { topic: "orders" }
)) {
  console.log(event);
}
```

## Client Class

### Constructor

```typescript
// With transport directly
const client = new Client(transport);

// With options
const client = new Client({
  transport: new HttpTransport({ baseUrl: "/api" }),
  defaultMetadata: { auth: { apiKey: "xxx" } },
  throwOnError: true,  // default: true
});
```

### Methods

#### `use<TProvides, TRequires>(middleware): Client<TContext & TProvides>`

Add middleware to the client. Returns a new client type with accumulated context.

```typescript
const client = new Client(transport)
  .use(createTimeoutMiddleware({ overall: 5000 }))   // Client<TimeoutContext>
  .use(createRetryMiddleware())                       // Client<TimeoutContext & RetryContext>
  .use(createCacheMiddleware());                      // Client<... & CacheContext>
```

#### `call<TReq, TRes>(method, payload, metadata?): Promise<TRes>`

Make a single RPC call.

```typescript
const user = await client.call<{ id: number }, User>(
  { service: "users", operation: "get" },
  { id: 123 },
  { timeout: { overall: 5000 } }  // optional metadata
);
```

#### `stream<TReq, TRes>(method, payload, metadata?): AsyncIterable<TRes>`

Make a streaming RPC call.

```typescript
for await (const event of client.stream(
  { service: "events", operation: "watch" },
  { topic: "orders" }
)) {
  processEvent(event);
}
```

#### `close(): Promise<void>`

Close the client and cleanup transport resources.

---

## Type-Safe Middleware

### How It Works

Each middleware declares what context it **provides** and **requires**:

```typescript
type TypedClientMiddleware<
  TProvides = {},    // Context this middleware adds
  TRequires = {},    // Context this middleware needs
>;

// Retry provides retry context, requires nothing
createRetryMiddleware(): TypedClientMiddleware<RetryContext, {}>

// A hypothetical middleware requiring retry context
createRetryLoggerMiddleware(): TypedClientMiddleware<{}, RetryContext>
```

### Context Types

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

## Middleware Reference

### Retry Middleware

Exponential backoff with jitter.

```typescript
client.use(createRetryMiddleware({
  maxRetries: 3,           // default: 3
  retryDelay: 1000,        // base delay in ms, default: 1000
  jitter: 0.1,             // jitter fraction 0-1, default: 0.1
  shouldRetry: (item, attempt) => item.status.retryable,  // custom predicate
  onBeforeRetry: async (item, attempt) => ({
    shouldRetry: true,
    delayMs: 2000,         // override delay
  }),
  onAfterRetry: (success, attempt) => console.log(`Attempt ${attempt}: ${success}`),
}));
```

### Cache Middleware

LRU + TTL caching using the collections framework.

```typescript
client.use(createCacheMiddleware({
  capacity: 100,           // max entries, default: 100
  ttl: 60000,              // time-to-live in ms, default: 60000
  keyGenerator: (method, payload) => `${method.service}.${method.operation}:${JSON.stringify(payload)}`,
  shouldCache: (item) => item.status.type === "success",
  onStats: (stats) => console.log(`Hit rate: ${stats.hitRate}%`),
  statsInterval: 60000,    // how often to emit stats
}));
```

### Timeout Middleware

Three variants for different timeout strategies.

```typescript
// Per-attempt timeout (each retry gets fresh timeout)
client.use(createTimeoutMiddleware({ perAttempt: 1000 }));

// Overall timeout (entire request including retries)
client.use(createOverallTimeoutMiddleware({ overall: 5000 }));

// Combined
client.use(createCombinedTimeoutMiddleware({
  overall: 5000,
  perAttempt: 1000,
}));
```

### Auth Middleware

Authentication injection.

```typescript
// Bearer token
client.use(createAuthMiddleware({ token: "abc123" }));
client.use(createBearerAuthMiddleware("abc123"));  // convenience

// API key
client.use(createAuthMiddleware({ apiKey: "xyz789" }));
client.use(createApiKeyAuthMiddleware("xyz789"));  // convenience

// Dynamic auth
client.use(createAuthMiddleware(() => ({
  token: getTokenFromStore(),
  userId: getCurrentUserId(),
})));
```

### Tracing Middleware

Distributed tracing (W3C Trace Context compatible).

```typescript
// Auto-generate trace/span IDs
client.use(createTracingMiddleware());
client.use(createSimpleTracingMiddleware());  // uses crypto.randomUUID if available

// Custom ID generation
client.use(createTracingMiddleware({
  generateTraceId: () => uuid.v4(),
  generateSpanId: () => uuid.v4(),
  serviceName: "my-service",
}));

// Continue existing trace
client.use(createTracingMiddleware({
  getCurrentTrace: () => ({
    traceId: existingTrace.traceId,
    spanId: existingTrace.spanId,
  }),
}));
```

### Circuit Breaker Middleware

Prevents cascading failures.

```typescript
client.use(createCircuitBreakerMiddleware({
  failureThreshold: 5,     // failures before opening, default: 5
  failureWindow: 10000,    // window for counting failures, default: 10s
  resetTimeout: 30000,     // time before trying again, default: 30s
  successThreshold: 2,     // successes to close, default: 2
  isFailure: (error) => true,  // custom failure predicate
  onStateChange: (oldState, newState) => console.log(`Circuit: ${oldState} → ${newState}`),
}));
```

States:
- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Service unhealthy, requests fail immediately with `CircuitBreakerError`
- **HALF_OPEN**: Testing recovery, limited requests allowed

### Rate Limit Middleware

Token bucket throttling.

```typescript
// Reject strategy (default)
client.use(createRateLimitMiddleware({
  maxRequests: 100,        // requests per window, default: 100
  window: 60000,           // window in ms, default: 60s
  strategy: "reject",      // throw RateLimitError when exceeded
}));

// Queue strategy
client.use(createRateLimitMiddleware({
  maxRequests: 10,
  window: 1000,
  strategy: "queue",       // queue requests, process when capacity available
  maxQueueSize: 50,        // max queue size, default: 100
  onRateLimitExceeded: (stats) => console.log("Rate limited!", stats),
}));

// Per-service rate limits
client.use(createPerServiceRateLimiter({
  users: { maxRequests: 100, window: 60000 },
  orders: { maxRequests: 50, window: 60000 },
  default: { maxRequests: 200, window: 60000 },
}));
```

### Batching Middleware

Request aggregation.

```typescript
client.use(createBatchingMiddleware({
  maxBatchSize: 10,        // max requests per batch, default: 10
  maxWaitTime: 10,         // max wait before sending, default: 10ms
  sameServiceOnly: true,   // only batch same-service requests, default: true
  getBatchKey: (msg) => msg.method.service,  // custom batch key
  onBatchSent: (size, key) => console.log(`Batch sent: ${size} requests to ${key}`),
}));

// Adaptive batching
client.use(createAdaptiveBatchingMiddleware({
  minBatchSize: 2,
  maxBatchSize: 50,
  targetLatency: 20,       // auto-adjust batch size to target latency
}));
```

### Pagination Middleware

Automatic pagination handling.

```typescript
client.use(createPaginationMiddleware({
  defaultLimit: 50,        // default page size
  maxLimit: 1000,          // prevent abuse
  pageKey: "page",         // metadata key for page number
  limitKey: "limit",       // metadata key for page size
  useOffset: false,        // use offset instead of page
}));

// Auto-paginate all results
import { paginateAll } from "client/client";

for await (const user of paginateAll(client, { service: "users", operation: "list" }, {})) {
  console.log(user);
}
```

---

## Middleware Ordering

Middleware executes in **onion model** order:

```typescript
client
  .use(timeoutMiddleware)     // 1st: Outer layer (runs first on request)
  .use(retryMiddleware)       // 2nd: Middle layer
  .use(cacheMiddleware);      // 3rd: Inner layer (closest to transport)
```

**Request flow**: timeout → retry → cache → transport
**Response flow**: transport → cache → retry → timeout

### Recommended Order

1. **Timeout** (overall) - Fail fast if taking too long
2. **Retry** - Retry failed requests
3. **Timeout** (per-attempt) - Timeout individual attempts
4. **Cache** - Check cache before network
5. **Circuit Breaker** - Fail fast for unhealthy services
6. **Rate Limit** - Throttle requests
7. **Auth** - Add credentials
8. **Tracing** - Add trace context

---

## Error Handling

### ClientError

Thrown when response has error status (when `throwOnError: true`):

```typescript
try {
  await client.call(method, payload);
} catch (error) {
  if (error instanceof ClientError) {
    console.log(error.code);        // e.g., "TIMEOUT"
    console.log(error.retryable);   // boolean
    console.log(error.status);      // full status object
    console.log(error.responseId);  // correlation ID
  }
}
```

### Middleware-Specific Errors

- `CircuitBreakerError` - Circuit is open
- `RateLimitError` - Rate limit exceeded

---

## Metadata

Metadata flows through the request/response cycle:

```typescript
// Request metadata
await client.call(method, payload, {
  timeout: { overall: 5000 },
  auth: { token: "override" },
  custom: { anything: "here" },
});

// Middleware adds to metadata
// - retry: { attempt, maxAttempts }
// - tracing: { traceId, spanId, parentSpanId }
// - pagination: { page, limit }
```
