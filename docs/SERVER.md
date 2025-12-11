# Server API

The Universal Server provides protocol-agnostic RPC handling with middleware support.

## Quick Start

```typescript
import { Server, HttpServerTransport, WebSocketServerTransport } from "client";

// Create server with multiple transports
const server = new Server({
  transports: [
    new HttpServerTransport({ port: 3000 }),
    new WebSocketServerTransport({ port: 3001 }),
  ],
  onError: (error, request) => console.error("Error:", error),
  onRequest: (request) => console.log("Request:", request.method),
});

// Register handlers
server.register(
  { service: "users", operation: "get" },
  async (request) => ({
    id: request.id,
    status: { type: "success", code: 200 },
    payload: { id: request.payload.id, name: "John Doe" },
    metadata: {},
  })
);

// Start server
await server.start();
```

## Server Class

### Constructor

```typescript
const server = new Server({
  transports: [transport1, transport2],  // optional, can add later
  onError: (error, request) => { ... },  // global error handler
  onRequest: (request) => { ... },       // request logger
  onResponse: (response) => { ... },     // response logger
});
```

### Methods

#### `register(matcher, handler)`

Register a handler for a method.

```typescript
// Exact match
server.register(
  { service: "users", operation: "get" },
  async (request) => ({ ... })
);

// With version
server.register(
  { service: "users", operation: "get", version: "v2" },
  async (request) => ({ ... })
);

// Pattern match (regex)
server.register(
  { service: "users", operation: /.*/ },  // All operations for users service
  async (request) => ({ ... })
);

// Catch-all
server.register(
  { service: /.*/, operation: /.*/ },
  async (request) => ({ ... })
);
```

#### `use(middleware)`

Add middleware to the server.

```typescript
server.use(loggingMiddleware);
server.use(authMiddleware);
server.use(validationMiddleware);
```

Middleware executes in registration order.

#### `addTransport(transport)`

Add a transport after construction.

```typescript
server.addTransport(new HttpServerTransport({ port: 3000 }));
```

#### `start(): Promise<void>`

Start all transports and begin listening.

```typescript
await server.start();
console.log("Server listening");
```

#### `stop(): Promise<void>`

Gracefully shut down all transports.

```typescript
await server.stop();
console.log("Server stopped");
```

#### `handle(request): Promise<response>`

Process a request (called internally by transports).

```typescript
const response = await server.handle<RequestPayload, ResponsePayload>(request);
```

---

## Request/Response Types

### ServerRequest

```typescript
interface ServerRequest<TPayload = unknown> {
  id: string;                    // Correlation ID
  method: Method;                // { service, operation, version? }
  payload: TPayload;             // Request body
  metadata: Metadata;            // Headers, auth, tracing, etc.
}
```

### ServerResponse

```typescript
interface ServerResponse<TPayload = unknown> {
  id: string;                    // Correlation ID (matches request)
  status: Status;                // Success or error status
  payload?: TPayload;            // Response body (optional for errors)
  metadata: Metadata;            // Response headers
}
```

### Status

```typescript
type Status =
  | { type: "success"; code: number }
  | { type: "error"; code: string; message: string; retryable: boolean };
```

---

## Handler Function

Handlers receive a request and return a response:

```typescript
type ServerHandler<TReq = unknown, TRes = unknown> = (
  request: ServerRequest<TReq>
) => Promise<ServerResponse<TRes>>;

// Example
const getUserHandler: ServerHandler<{ id: string }, User> = async (request) => {
  const user = await db.users.findById(request.payload.id);

  if (!user) {
    return {
      id: request.id,
      status: { type: "error", code: "NOT_FOUND", message: "User not found", retryable: false },
      metadata: {},
    };
  }

  return {
    id: request.id,
    status: { type: "success", code: 200 },
    payload: user,
    metadata: {},
  };
};
```

---

## Server Middleware

Server middleware wraps handler execution:

```typescript
type ServerMiddleware = (
  next: ServerRunner
) => ServerRunner;

type ServerRunner<TReq = unknown, TRes = unknown> = (
  context: ServerContext<TReq>
) => Promise<ServerResponse<TRes>>;

interface ServerContext<TReq = unknown> {
  request: ServerRequest<TReq>;
  state: Record<string, unknown>;  // Middleware state
}
```

### Example Middleware

```typescript
// Logging middleware
const loggingMiddleware: ServerMiddleware = (next) => async (context) => {
  const start = Date.now();
  console.log("Request:", context.request.method);

  const response = await next(context);

  console.log(`Response: ${response.status.type} in ${Date.now() - start}ms`);
  return response;
};

// Auth middleware
const authMiddleware: ServerMiddleware = (next) => async (context) => {
  const token = context.request.metadata.auth?.token;

  if (!token) {
    return {
      id: context.request.id,
      status: { type: "error", code: "UNAUTHORIZED", message: "Missing token", retryable: false },
      metadata: {},
    };
  }

  // Verify token and add user to state
  const user = await verifyToken(token);
  context.state.user = user;

  return next(context);
};

// Usage
server.use(loggingMiddleware);
server.use(authMiddleware);
```

---

## Error Handling

### Built-in Errors

```typescript
import { HandlerNotFoundError, ServerError } from "client/server";

// Handler not found (returns 404)
throw new HandlerNotFoundError({ service: "users", operation: "unknown" });

// Custom server error
throw new ServerError("VALIDATION_ERROR", "Invalid input", false);
```

### Error Responses

Errors are automatically converted to responses:

| Error Type | Code | Retryable |
|------------|------|-----------|
| `HandlerNotFoundError` | 404 | false |
| `ServerError` | custom | custom |
| Other errors | 500 | false |

---

## Server Transports

The server uses transports to listen for requests:

### HttpServerTransport

```typescript
import { HttpServerTransport } from "client/adapters/http/server";

const transport = new HttpServerTransport({
  port: 3000,
  host: "0.0.0.0",
  // Express app or custom HTTP server
});

server.addTransport(transport);
```

### WebSocketServerTransport

```typescript
import { WebSocketServerTransport } from "client/adapters/websocket/server";

const transport = new WebSocketServerTransport({
  port: 3001,
  // Auth handler for connections
  onAuth: async (token) => verifyToken(token),
});

server.addTransport(transport);
```

---

## Complete Example

```typescript
import { Server, HttpServerTransport } from "client";

// Create server
const server = new Server({
  onError: (error, request) => {
    console.error(`Error handling ${request.method.service}.${request.method.operation}:`, error);
  },
});

// Add transport
server.addTransport(new HttpServerTransport({ port: 3000 }));

// Logging middleware
server.use((next) => async (context) => {
  const start = Date.now();
  const response = await next(context);
  console.log(`${context.request.method.service}.${context.request.method.operation}: ${Date.now() - start}ms`);
  return response;
});

// Register handlers
server.register({ service: "users", operation: "get" }, async (req) => ({
  id: req.id,
  status: { type: "success", code: 200 },
  payload: await db.users.findById(req.payload.id),
  metadata: {},
}));

server.register({ service: "users", operation: "create" }, async (req) => ({
  id: req.id,
  status: { type: "success", code: 201 },
  payload: await db.users.create(req.payload),
  metadata: {},
}));

server.register({ service: "users", operation: "list" }, async (req) => ({
  id: req.id,
  status: { type: "success", code: 200 },
  payload: await db.users.findAll(req.metadata.pagination),
  metadata: { pagination: { page: 1, total: 100 } },
}));

// Start
await server.start();
console.log("Server listening on port 3000");

// Graceful shutdown
process.on("SIGTERM", async () => {
  await server.stop();
  process.exit(0);
});
```
