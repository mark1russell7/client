# @mark1russell7/client-connection

Connection management for multi-client RPC. Track clients, call procedures on specific clients, and implement pub/sub messaging.

## Installation

```bash
npm install github:mark1russell7/client-connection#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Server                                          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                     Connection Manager                                   ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │                    Active Connections                            │   ││
│  │  │                                                                  │   ││
│  │  │   ┌──────────┐   ┌──────────┐   ┌──────────┐                   │   ││
│  │  │   │ Client A │   │ Client B │   │ Client C │                   │   ││
│  │  │   │ id: abc  │   │ id: def  │   │ id: ghi  │                   │   ││
│  │  │   └──────────┘   └──────────┘   └──────────┘                   │   ││
│  │  │                                                                  │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Procedures                                       ││
│  │                                                                          ││
│  │  ┌────────────────────┐  ┌────────────────────┐  ┌───────────────────┐ ││
│  │  │  connection.list   │  │  connection.get    │  │  connection.call  │ ││
│  │  │  List all clients  │  │  Get client info   │  │  Call on client   │ ││
│  │  └────────────────────┘  └────────────────────┘  └───────────────────┘ ││
│  │                                                                          ││
│  │  ┌────────────────────┐                                                 ││
│  │  │connection.broadcast│                                                 ││
│  │  │ Call on all clients│                                                 ││
│  │  └────────────────────┘                                                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        Pub/Sub System                                    ││
│  │                                                                          ││
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────┐   ││
│  │  │connection.subscribe│ │connection.publish│  │connection.unsubscribe││
│  │  │ Subscribe to topic │ │ Publish to topic │  │ Cancel subscription │   ││
│  │  └──────────────────┘  └──────────────────┘  └─────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { Client } from "@mark1russell7/client";
import "@mark1russell7/client-connection/register";

const client = new Client({ /* transport */ });

// List all connected clients
const { connections } = await client.call(["connection", "list"], {});

// Call a procedure on a specific client
const result = await client.call(["connection", "call"], {
  clientId: "abc123",
  path: ["fs", "read"],
  input: { path: "./config.json" },
});

// Broadcast to all clients
await client.call(["connection", "broadcast"], {
  path: ["notification", "show"],
  input: { message: "Server update!" },
});
```

## Procedures

| Path | Description |
|------|-------------|
| `connection.list` | List all connected clients |
| `connection.get` | Get information about a specific client |
| `connection.call` | Call a procedure on a specific client |
| `connection.broadcast` | Call a procedure on all connected clients |
| `connection.subscribe` | Subscribe to a topic |
| `connection.unsubscribe` | Unsubscribe from a topic |
| `connection.publish` | Publish data to topic subscribers |

### connection.list

List all connected clients.

```typescript
interface ListInput {
  serverId?: string;     // Filter by server ID (optional)
}

interface ConnectionInfo {
  id: string;            // Client ID
  connectedAt: string;   // Connection time (ISO)
  metadata?: Record<string, unknown>;
  procedures?: string[]; // Available procedures
}

interface ListOutput {
  connections: ConnectionInfo[];
}
```

### connection.get

Get information about a specific client.

```typescript
interface GetInput {
  clientId: string;      // Client ID
}

interface GetOutput {
  connection: ConnectionInfo | null;
}
```

### connection.call

Call a procedure on a specific client.

```typescript
interface CallInput {
  clientId: string;      // Target client ID
  path: string[];        // Procedure path
  input?: unknown;       // Procedure input
  timeout?: number;      // Timeout in ms
}

interface CallOutput {
  result: unknown;       // Procedure result
  clientId: string;      // Client that was called
}
```

**Example:**
```typescript
// Execute a procedure on a specific client
const result = await client.call(["connection", "call"], {
  clientId: "client-abc",
  path: ["git", "status"],
  input: { cwd: "/home/user/project" },
});
```

### connection.broadcast

Call a procedure on all connected clients.

```typescript
interface BroadcastInput {
  path: string[];        // Procedure path
  input?: unknown;       // Procedure input
  waitForResponses?: boolean;  // Wait for all responses (default: false)
  timeout?: number;      // Timeout in ms
}

interface BroadcastOutput {
  sent: number;          // Number of clients reached
  results?: Array<{
    clientId: string;
    result?: unknown;
    error?: string;
  }>;  // If waitForResponses=true
}
```

**Example:**
```typescript
// Notify all clients
await client.call(["connection", "broadcast"], {
  path: ["notification", "show"],
  input: { message: "Deployment complete!" },
});

// Broadcast and wait for responses
const { results } = await client.call(["connection", "broadcast"], {
  path: ["health", "check"],
  input: {},
  waitForResponses: true,
  timeout: 5000,
});
```

### connection.subscribe

Subscribe to a topic for pub/sub messaging.

```typescript
interface SubscribeInput {
  topic: string;         // Topic to subscribe to
  clientId?: string;     // Client ID (auto-filled from context)
}

interface SubscribeOutput {
  subscriptionId: string;
  topic: string;
}
```

### connection.unsubscribe

Cancel a subscription.

```typescript
interface UnsubscribeInput {
  subscriptionId: string;
}

interface UnsubscribeOutput {
  success: boolean;
  subscriptionId: string;
}
```

### connection.publish

Publish data to all subscribers of a topic.

```typescript
interface PublishInput {
  topic: string;         // Topic to publish to
  data: unknown;         // Data to send
}

interface PublishOutput {
  delivered: number;     // Number of subscribers reached
  topic: string;
}
```

**Example:**
```typescript
// Publisher
await client.call(["connection", "publish"], {
  topic: "events.user.created",
  data: { userId: "123", name: "Alice" },
});

// Subscriber (separate client)
await client.call(["connection", "subscribe"], {
  topic: "events.user.*",
});
```

## Use Cases

### Multi-Client Control

Control multiple clients from a central server:

```typescript
// Get all connected clients
const { connections } = await client.call(["connection", "list"], {});

// Update all clients
for (const conn of connections) {
  await client.call(["connection", "call"], {
    clientId: conn.id,
    path: ["config", "reload"],
    input: {},
  });
}
```

### Real-Time Notifications

Implement real-time notifications with pub/sub:

```typescript
// Subscribe to notifications
await client.call(["connection", "subscribe"], {
  topic: "notifications",
});

// Publish from server
await client.call(["connection", "publish"], {
  topic: "notifications",
  data: { type: "alert", message: "System update in 5 minutes" },
});
```

## License

MIT
