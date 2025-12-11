# Transport Adapters

Adapters provide protocol-specific implementations of the `Transport` interface.

## Available Adapters

| Adapter | Client | Server | Use Case |
|---------|--------|--------|----------|
| HTTP | Yes | Yes | REST APIs, microservices |
| WebSocket | Yes | Yes | Real-time, bidirectional |
| Local | Yes | - | In-process, testing |
| Mock | Yes | - | Unit testing |

---

## Transport Interface

All adapters implement:

```typescript
interface Transport {
  readonly name: string;
  send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>>;
  close(): Promise<void>;
}
```

---

## HTTP Adapter

### Client

```typescript
import { HttpTransport } from "client/adapters/http/client";

const transport = new HttpTransport({
  baseUrl: "https://api.example.com",

  // URL strategy (how to map method → URL)
  urlStrategy: defaultUrlPattern,  // or custom

  // HTTP method strategy (how to map operation → HTTP verb)
  httpMethodStrategy: restfulHttpMethodStrategy,  // or postOnlyStrategy

  // Default headers
  headers: {
    "Content-Type": "application/json",
  },

  // Request timeout (ms)
  timeout: 30000,

  // Custom fetch implementation
  fetch: customFetch,
});

const client = new Client(transport);
```

### URL Strategies

```typescript
// Default: /{version?}/{service}/{operation}
defaultUrlPattern(method)
// { service: "users", operation: "get" } → "/users/get"
// { service: "users", operation: "get", version: "v2" } → "/v2/users/get"

// RESTful: /{version?}/{service}
restfulUrlPattern(method)
// { service: "users", operation: "get" } → "/users"

// Custom
const customUrlStrategy = (method: Method) => {
  return `/api/${method.service}/${method.operation}`;
};
```

### HTTP Method Strategies

```typescript
// RESTful mapping (default)
restfulHttpMethodStrategy(method)
// "get" → GET
// "list" → GET
// "create" → POST
// "update" → PUT
// "patch" → PATCH
// "delete" → DELETE
// other → POST

// POST only
postOnlyStrategy(method)
// All operations → POST
```

### Server

```typescript
import { HttpServerTransport } from "client/adapters/http/server";

const transport = new HttpServerTransport({
  port: 3000,
  host: "0.0.0.0",

  // URL strategy for parsing requests
  urlStrategy: defaultServerUrlStrategy,  // or rpcServerUrlStrategy

  // CORS settings
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },

  // Express app (optional, creates one if not provided)
  app: expressApp,
});

server.addTransport(transport);
```

### Server URL Strategies

```typescript
// Default: Extract from URL path
defaultServerUrlStrategy(req)
// GET /users/get → { service: "users", operation: "get" }
// POST /v2/users/create → { service: "users", operation: "create", version: "v2" }

// RPC style: From header or body
rpcServerUrlStrategy(req)
// X-RPC-Method: users.get → { service: "users", operation: "get" }
```

---

## WebSocket Adapter

### Client

```typescript
import { WebSocketTransport } from "client/adapters/websocket/client";

const transport = new WebSocketTransport({
  url: "wss://api.example.com/ws",

  // Auto-reconnect settings
  reconnect: true,
  reconnectInterval: 1000,
  maxReconnectAttempts: 5,

  // Connection timeout
  timeout: 30000,

  // Message serialization
  serialize: JSON.stringify,
  deserialize: JSON.parse,

  // Auth token for initial connection
  authToken: "bearer-token",
});

const client = new Client(transport);
```

### Connection Lifecycle

```typescript
// Events (if supported by implementation)
transport.on("connect", () => console.log("Connected"));
transport.on("disconnect", () => console.log("Disconnected"));
transport.on("reconnect", (attempt) => console.log(`Reconnecting: attempt ${attempt}`));
transport.on("error", (error) => console.error("Error:", error));
```

### Server

```typescript
import { WebSocketServerTransport } from "client/adapters/websocket/server";

const transport = new WebSocketServerTransport({
  port: 3001,

  // Authentication handler
  onAuth: async (token) => {
    const user = await verifyToken(token);
    if (!user) throw new Error("Invalid token");
    return user;  // Attached to connection
  },

  // Connection handlers
  onConnection: (socket, user) => {
    console.log(`User ${user.id} connected`);
  },
  onDisconnection: (socket, user) => {
    console.log(`User ${user.id} disconnected`);
  },

  // Message handlers
  onMessage: (socket, message) => { ... },
  onError: (socket, error) => { ... },
});

server.addTransport(transport);
```

### Streaming

WebSocket naturally supports streaming:

```typescript
// Client streaming
for await (const event of client.stream(
  { service: "events", operation: "watch" },
  { topic: "orders" }
)) {
  console.log("Event:", event);
}
```

---

## Local Adapter

In-process RPC for testing and embedded use.

### Client

```typescript
import { LocalTransport } from "client/adapters/local/client";

// Create handlers map
const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();

handlers.set("users.get", async (payload: { id: string }) => {
  return { id: payload.id, name: "John Doe" };
});

handlers.set("users.create", async (payload: { name: string }) => {
  return { id: "123", name: payload.name };
});

// Create transport
const transport = new LocalTransport({
  handlers,

  // Optional: simulate latency
  latency: 10,  // ms

  // Optional: simulate errors
  errorRate: 0.01,  // 1% of requests fail
});

const client = new Client(transport);

// Use just like HTTP client
const user = await client.call(
  { service: "users", operation: "get" },
  { id: "123" }
);
```

### Use Cases

1. **Testing**: Test client code without network
2. **Development**: Develop UI before backend is ready
3. **Embedded**: Same-process RPC for plugin systems
4. **Migration**: Gradual transition from monolith to microservices

---

## Mock Adapter

For unit testing with predefined responses.

### Client

```typescript
import { MockTransport, mockBuilder } from "client/adapters/mock/client";

// Build mock responses
const mock = mockBuilder()
  // Exact match
  .when({ service: "users", operation: "get" }, { id: "123" })
  .respond({ id: "123", name: "John Doe" })

  // Pattern match
  .when({ service: "users", operation: /create|update/ })
  .respond((payload) => ({ id: "new", ...payload }))

  // Error response
  .when({ service: "users", operation: "delete" })
  .error("FORBIDDEN", "Not allowed")

  // Delay
  .when({ service: "slow", operation: "endpoint" })
  .delay(1000)
  .respond({ result: "ok" })

  .build();

const transport = new MockTransport(mock);
const client = new Client(transport);

// Use in tests
const user = await client.call(
  { service: "users", operation: "get" },
  { id: "123" }
);
expect(user.name).toBe("John Doe");
```

### Verifying Calls

```typescript
const transport = new MockTransport(mock);

// ... make calls ...

// Get call history
const calls = transport.getCalls();
expect(calls).toHaveLength(3);
expect(calls[0].method).toEqual({ service: "users", operation: "get" });
expect(calls[0].payload).toEqual({ id: "123" });

// Verify specific call was made
expect(transport.wasCalled({ service: "users", operation: "get" })).toBe(true);
expect(transport.getCallCount({ service: "users", operation: "get" })).toBe(1);

// Clear history
transport.clearCalls();
```

### Test Example

```typescript
describe("UserService", () => {
  let client: Client;
  let transport: MockTransport;

  beforeEach(() => {
    transport = new MockTransport(
      mockBuilder()
        .when({ service: "users", operation: "get" }, { id: "123" })
        .respond({ id: "123", name: "Test User", email: "test@example.com" })
        .build()
    );
    client = new Client(transport);
  });

  afterEach(() => {
    transport.clearCalls();
  });

  it("should fetch user by id", async () => {
    const user = await client.call(
      { service: "users", operation: "get" },
      { id: "123" }
    );

    expect(user).toEqual({
      id: "123",
      name: "Test User",
      email: "test@example.com",
    });
    expect(transport.getCallCount({ service: "users", operation: "get" })).toBe(1);
  });
});
```

---

## Choosing an Adapter

| Scenario | Recommended Adapter |
|----------|---------------------|
| REST API | HTTP |
| Real-time updates | WebSocket |
| Server push | WebSocket |
| Bidirectional streaming | WebSocket |
| Unit tests | Mock |
| Integration tests | Local or Mock |
| Same-process RPC | Local |
| Plugin systems | Local |

---

## Custom Adapters

Implement the `Transport` interface:

```typescript
class CustomTransport implements Transport {
  readonly name = "custom";

  async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
    // 1. Convert message to protocol format
    const wireFormat = this.serialize(message);

    // 2. Send over your protocol
    const response = await this.protocol.send(wireFormat);

    // 3. Convert response to ResponseItem
    yield {
      id: message.id,
      status: { type: "success", code: 200 },
      payload: response.data as TRes,
      metadata: {},
    };
  }

  async close(): Promise<void> {
    await this.protocol.disconnect();
  }
}
```
