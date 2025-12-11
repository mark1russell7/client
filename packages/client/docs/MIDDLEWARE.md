# Middleware System

The library provides a unified middleware system that works for both client requests and collection operations.

## Core Concepts

### Middleware Type

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
- `TContextOut`: Context this middleware **provides** (adds to the chain)
- `TContextIn`: Context this middleware **requires** (from previous middleware)
- `TReturn`: Return type of the runner
- `TAsync`: Whether execution is async

### Composition Model

Middleware uses the **onion model**:

```
┌─────────────────────────────────────────────────────────────┐
│  compose(m1, m2, m3, runner)                                │
│                                                             │
│  Request:   m1 → m2 → m3 → runner                          │
│  Response:  m1 ← m2 ← m3 ← runner                          │
│                                                             │
│  First middleware = outermost layer (runs first on request)│
│  Last middleware = innermost layer (closest to runner)     │
└─────────────────────────────────────────────────────────────┘
```

---

## Type-Safe Context Tracking

### TypedClientMiddleware

For client middleware, context types accumulate through the chain:

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

### Compile-Time Validation

The `MiddlewaresContext` type recursively validates chains:

```typescript
type MiddlewaresContext<TMiddlewares, TBaseContext> =
  // For each middleware in the chain...
  TMiddlewares extends [
    Middleware<infer TNextOut, infer TNextIn, any, any>,
    ...infer TRest,
  ]
    // Check: Does accumulated context satisfy requirements?
    ? TBaseContext extends TNextIn
      // Yes: Recurse with accumulated context
      ? MiddlewaresContext<TRest, TBaseContext & TNextOut>
      // No: Return `never` (compile error)
      : never
    // Base case: Return accumulated context
    : TBaseContext;
```

### Example

```typescript
// Define middleware with context types
const retryMiddleware: TypedClientMiddleware<RetryContext, {}> = ...;
const cacheMiddleware: TypedClientMiddleware<CacheContext, {}> = ...;
const logRetryMiddleware: TypedClientMiddleware<{}, RetryContext> = ...;

// Valid chain: retry provides what logRetry requires
const client = new Client(transport)
  .use(retryMiddleware)       // Client<RetryContext>
  .use(logRetryMiddleware);   // Client<RetryContext> (logRetry requires it, has it)

// Invalid chain: logRetry requires RetryContext not yet provided
const badClient = new Client(transport)
  .use(logRetryMiddleware);   // TYPE ERROR: RetryContext not in {}
```

---

## Composition Utilities

### `compose(...middleware, runner)`

Compose middleware with a final runner:

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

### `bundle(...middleware)`

Create reusable middleware stacks:

```typescript
import { bundle } from "client/middleware";

// Create a standard client middleware bundle
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

### `wrapWithAsyncMiddlewares(middlewares, fn)`

Wrap an async function with middleware array:

```typescript
import { wrapWithAsyncMiddlewares } from "client/middleware";

const runner = wrapWithAsyncMiddlewares(
  [timeoutMiddleware, retryMiddleware, cacheMiddleware],
  async (ctx: BaseContext) => fetchData(ctx)
);

await runner({ request: req });
```

### `wrapWithSyncMiddlewares(middlewares, fn)`

Wrap a sync function with middleware array:

```typescript
import { wrapWithSyncMiddlewares } from "client/middleware";

const runner = wrapWithSyncMiddlewares(
  [boundedMiddleware, eventedMiddleware],
  (collection: Collection) => collection.size
);

const size = runner(baseCollection);
```

---

## Writing Custom Middleware

### Client Middleware

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
      // Before: Modify request, add context
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

### Server Middleware

```typescript
import { ServerMiddleware, ServerRunner, ServerContext } from "client/server";

export function createServerMiddleware(): ServerMiddleware {
  return (next: ServerRunner) => async (context: ServerContext) => {
    // Before
    console.log("Request:", context.request.method);
    const start = Date.now();

    // Execute
    const response = await next(context);

    // After
    console.log(`Response in ${Date.now() - start}ms`);
    return response;
  };
}
```

### Collection Middleware (Behavior)

```typescript
import { Middleware, MapLike } from "client/collections";

export function createMyBehavior<K, V>(
  options: MyOptions
): Middleware<MapLike<K, V>, MapLike<K, V> & MyCapabilities> {
  return (next) => {
    // Use Proxy to intercept method calls
    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "set") {
          return (key: K, value: V) => {
            // Before set
            console.log("Setting:", key);
            const result = target.set(key, value);
            // After set
            return result;
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as MapLike<K, V> & MyCapabilities;
  };
}
```

---

## Middleware Patterns

### Request Transformation

```typescript
const transformMiddleware: ClientMiddleware = (next) => async function* (context) {
  // Transform request
  context.message.payload = transform(context.message.payload);

  yield* next(context);
};
```

### Response Transformation

```typescript
const mapResponseMiddleware: ClientMiddleware = (next) => async function* (context) {
  for await (const item of next(context)) {
    yield {
      ...item,
      payload: transformPayload(item.payload),
    };
  }
};
```

### Error Handling

```typescript
const errorHandlerMiddleware: ClientMiddleware = (next) => async function* (context) {
  try {
    yield* next(context);
  } catch (error) {
    // Convert error to response
    yield {
      id: context.message.id,
      status: { type: "error", code: "ERROR", message: error.message, retryable: false },
      payload: null,
      metadata: {},
    };
  }
};
```

### Conditional Execution

```typescript
const conditionalMiddleware: ClientMiddleware = (next) => async function* (context) {
  if (shouldSkip(context.message)) {
    yield* next(context);  // Skip this middleware
  } else {
    // Apply middleware logic
    yield* doSomethingThen(next(context));
  }
};
```

### State Passing

```typescript
const stateMiddleware: ClientMiddleware = (next) => async function* (context) {
  // Add state to metadata
  context.message.metadata.requestTime = Date.now();

  for await (const item of next(context)) {
    // Read state in response
    const duration = Date.now() - context.message.metadata.requestTime;
    item.metadata.duration = duration;
    yield item;
  }
};
```

---

## Middleware for Collections

The collections framework uses the same middleware pattern:

```typescript
import { compose, lruMap, ttlMap, boundedList, eventedList, hashMap, arrayList } from "client/collections";

// Map with LRU + TTL
const cache = compose(
  lruMap({ capacity: 100 }),
  ttlMap({ ttl: 60000 })
)(hashMap<string, User>());

// List with events + bounds
const list = compose(
  eventedList(),
  boundedList({ capacity: 1000, policy: "drop-oldest" })
)(arrayList<Event>());

// Event handling
list.on("add", (event) => console.log("Added:", event.item));
```

---

## Best Practices

1. **Order matters**: Outer middleware runs first on request, last on response
2. **Keep middleware focused**: Each middleware should do one thing well
3. **Use TypedClientMiddleware**: Enable compile-time validation of context
4. **Bundle related middleware**: Use `bundle()` for reusable stacks
5. **Handle errors gracefully**: Don't let middleware swallow errors silently
6. **Avoid side effects**: Middleware should be predictable and testable
7. **Document context requirements**: Clearly state what context your middleware needs
