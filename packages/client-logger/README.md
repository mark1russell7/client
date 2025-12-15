# @mark1russell7/client-logger

Bridge between client procedures and logger. Exposes logging via RPC calls.

## Installation

```bash
npm install github:mark1russell7/client-logger#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application                              │
│                                                                 │
│   client.call(["log", "info"], { message: "Hello" })           │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Client (RPC Layer)                          │
│                           │                                     │
│              ┌────────────┴────────────┐                       │
│              ▼                         ▼                       │
│   ┌──────────────────┐    ┌──────────────────────────┐        │
│   │ Local Procedures │    │ Remote Server Procedures │        │
│   └────────┬─────────┘    └──────────────────────────┘        │
└────────────┼────────────────────────────────────────────────────┘
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    client-logger                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Procedures                              │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │  │
│  │  │ log.debug  │ │ log.info   │ │ log.warn   │           │  │
│  │  └────────────┘ └────────────┘ └────────────┘           │  │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────┐         │  │
│  │  │ log.error  │ │ log.trace  │ │ log.setLevel │         │  │
│  │  └────────────┘ └────────────┘ └──────────────┘         │  │
│  │  ┌──────────────┐                                        │  │
│  │  │ log.getLevel │                                        │  │
│  │  └──────────────┘                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              @mark1russell7/logger                        │  │
│  │                                                           │  │
│  │   Logger → Formatter → Transport → Console/Memory/etc    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { Client } from "client";

const client = new Client({ /* transport config */ });

// Log messages via procedures
await client.call(["log", "info"], { message: "Application started" });
await client.call(["log", "debug"], { message: "Processing", data: { id: 123 } });
await client.call(["log", "error"], {
  message: "Request failed",
  error: { name: "Error", message: "Connection timeout" }
});

// Control log level
await client.call(["log", "setLevel"], { level: 3 }); // DEBUG
const { level, levelName } = await client.call(["log", "getLevel"], undefined);
```

## Procedures

| Path | Input | Output | Description |
|------|-------|--------|-------------|
| `["log", "debug"]` | `LogInput` | `{ logged: true }` | Log at DEBUG level |
| `["log", "info"]` | `LogInput` | `{ logged: true }` | Log at INFO level |
| `["log", "warn"]` | `LogInput` | `{ logged: true }` | Log at WARN level |
| `["log", "error"]` | `LogInput` | `{ logged: true }` | Log at ERROR level |
| `["log", "trace"]` | `LogInput` | `{ logged: true }` | Log at TRACE level |
| `["log", "setLevel"]` | `{ level: LogLevel }` | `{ logged: true }` | Set minimum level |
| `["log", "getLevel"]` | `void` | `{ level, levelName }` | Get current level |

### LogInput

```typescript
interface LogInput {
  message: string;
  context?: string;                    // Logger context override
  data?: Record<string, unknown>;      // Structured data
  error?: {                            // Error details
    name: string;
    message: string;
    stack?: string;
  };
}
```

## Auto-Registration

Procedures register automatically when the package is imported. The `client.procedures` field in `package.json` points to the registration module:

```json
{
  "client": {
    "procedures": "./dist/register.js"
  }
}
```

## Custom Logger Configuration

```typescript
import { setLogger, createLogger, LogLevel, createJsonFormatter } from "@mark1russell7/client-logger";

// Replace the default logger
setLogger(createLogger({
  level: LogLevel.DEBUG,
  context: "my-service",
  formatter: createJsonFormatter(),
}));
```

## Re-exports

All exports from `@mark1russell7/logger` are available:

```typescript
import {
  // Logger
  Logger, createLogger,
  // Levels
  LogLevel, LOG_LEVEL_NAMES, parseLogLevel,
  // Formatters
  SimpleFormatter, TimestampedFormatter, JsonFormatter,
  // Transports
  ConsoleTransport, MemoryTransport, CallbackTransport,
} from "@mark1russell7/client-logger";
```
