# Universal Error System

Protocol-agnostic error handling with rich metadata and bidirectional HTTP status mapping.

## Zero Magic Strings & Numbers

- **ErrorCode enum** - All error codes use enum values (no string literals)
- **HTTPStatus enum** - All HTTP status codes use enum values (no magic numbers)
- **Single source of truth** - `HTTP_STATUS_ERROR_MAP` defines bidirectional mapping

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ErrorCode Enum                       │
│  (TIMEOUT, NOT_FOUND, INTERNAL_ERROR, etc.)            │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   ERROR_REGISTRY                        │
│  Maps ErrorCode → ErrorMetadata (summary, detail, etc.) │
└─────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
┌─────────────────────────┐   ┌──────────────────────────┐
│  HTTP_STATUS_ERROR_MAP  │   │   HTTPStatus Enum        │
│  Bidirectional mapping  │   │   (OK=200, NOT_FOUND=404)│
└─────────────────────────┘   └──────────────────────────┘
        │           │
        ▼           ▼
  httpStatusToErrorCode    errorCodeToHTTPStatus
  (client-side)            (server-side)
```

## Quick Start

### Client Side: Handle HTTP responses

```typescript
import { httpStatusToErrorCode, createError, HTTPStatus } from "@common/client/errors";

// Convert HTTP status to error code
const code = httpStatusToErrorCode(404); // ErrorCode.NOT_FOUND

// Create rich error with metadata
const error = createError(code, {
  requestId: "req-123",
  transport: "http",
  method: { service: "users", operation: "get" },
});

// Access rich metadata
console.log(error.metadata.summary);      // "Resource not found"
console.log(error.metadata.userMessage);  // User-friendly message
console.log(error.metadata.devMessage);   // Developer diagnostic
console.log(error.metadata.suggestions);  // ["Check URL spelling", ...]
console.log(error.metadata.retryable);    // false
```

### Server Side: Return appropriate HTTP status

```typescript
import { errorCodeToHTTPStatus, ErrorCode, HTTPStatus } from "@common/client/errors";

// Map error code to HTTP status
function handleError(code: ErrorCode): number {
  const status = errorCodeToHTTPStatus(code);
  return status; // Returns HTTPStatus enum value (404, 500, etc.)
}

// Example
handleError(ErrorCode.NOT_FOUND);        // HTTPStatus.NOT_FOUND (404)
handleError(ErrorCode.INTERNAL_ERROR);   // HTTPStatus.INTERNAL_SERVER_ERROR (500)
handleError(ErrorCode.UNAUTHORIZED);     // HTTPStatus.UNAUTHORIZED (401)
```

### Create Errors from Exceptions

```typescript
import { createErrorFromException } from "@common/client/errors";

try {
  await fetch("https://api.example.com/data");
} catch (err) {
  const richError = createErrorFromException(err as Error, {
    transport: "http",
    requestId: "req-456",
  });

  // Automatically categorized based on error message
  // e.g., "timeout" → ErrorCode.TIMEOUT, "network" → ErrorCode.NETWORK_ERROR
}
```

## File Structure

```
common/src/client/errors/
├── README.md              ← You are here
├── index.ts               ← Public API exports
├── codes.ts               ← ErrorCode enum (70+ codes)
├── http-status.ts         ← HTTPStatus enum (all HTTP status codes)
├── types.ts               ← TypeScript interfaces
├── registry.ts            ← ERROR_REGISTRY with full metadata
├── http-errors.ts         ← HTTP-specific errors + bidirectional mapping
└── factory.ts             ← Error creation functions
```

## Key Features

### 1. Rich Error Metadata

Every error includes:
- **summary**: Brief one-line description
- **detail**: Full explanation of what went wrong
- **category**: Network, Client, Server, Protocol, Auth, etc.
- **severity**: Info, Warning, Error, Critical
- **retryable**: Whether the operation can be retried
- **userMessage**: User-friendly message for end users
- **devMessage**: Detailed diagnostic for developers
- **suggestions**: Array of actionable suggestions
- **httpStatus**: HTTP status code (if applicable)

### 2. Protocol-Agnostic

Works across all transports:
- HTTP/REST
- WebSocket
- gRPC
- Local/in-memory

### 3. Type-Safe

Full TypeScript support:
```typescript
// All enums are type-safe
const code: ErrorCode = ErrorCode.TIMEOUT;
const status: HTTPStatus = HTTPStatus.NOT_FOUND;

// Metadata is fully typed
const metadata: ErrorMetadata = getErrorMetadata(ErrorCode.TIMEOUT);
```

### 4. Bidirectional HTTP Mapping

Single source of truth for HTTP status ↔ error code mapping:

```typescript
// Client: HTTP status → Error code
httpStatusToErrorCode(404) // ErrorCode.NOT_FOUND

// Server: Error code → HTTP status
errorCodeToHTTPStatus(ErrorCode.NOT_FOUND) // HTTPStatus.NOT_FOUND (404)
```

## Error Categories

- **NETWORK**: Connection failures, DNS errors
- **CLIENT**: Bad requests, validation errors (4xx equivalent)
- **SERVER**: Internal errors, service unavailable (5xx equivalent)
- **PROTOCOL**: Parsing, serialization errors
- **AUTH**: Authentication, authorization failures
- **RATE_LIMIT**: Too many requests
- **TIMEOUT**: Request timeouts, deadlines exceeded
- **CANCELLED**: Aborted requests
- **UNKNOWN**: Uncategorized errors

## Examples

### Check if error is retryable

```typescript
import { isRetryable } from "@common/client/errors";

if (isRetryable(error)) {
  // Retry logic
  await retryRequest();
}
```

### Filter errors by category

```typescript
import { isErrorCategory, ErrorCategory } from "@common/client/errors";

if (isErrorCategory(error, ErrorCategory.NETWORK)) {
  // Handle network-specific errors
  showOfflineMessage();
}
```

### Format for logging

```typescript
import { formatError } from "@common/client/errors";

console.error(formatError(error, true)); // include stack trace
```

## Best Practices

1. **Always use enum values** - Never use string literals or magic numbers
2. **Use the registry** - Don't create error metadata manually
3. **Provide context** - Include requestId, transport, method when creating errors
4. **Check retryable flag** - Respect the metadata when implementing retry logic
5. **Use suggestions** - Display error.metadata.suggestions to help users resolve issues

## Adding New Errors

1. Add to `ErrorCode` enum in `codes.ts`
2. Add metadata to `ERROR_REGISTRY` in `registry.ts` or `HTTP_ERROR_REGISTRY` in `http-errors.ts`
3. If HTTP-related, add to `HTTP_STATUS_ERROR_MAP` in `http-errors.ts`

Example:
```typescript
// 1. Add to ErrorCode enum
export enum ErrorCode {
  // ... existing codes
  MY_NEW_ERROR = "MY_NEW_ERROR",
}

// 2. Add to registry
export const ERROR_REGISTRY: ErrorRegistry = {
  // ... existing errors
  [ErrorCode.MY_NEW_ERROR]: defineError(ErrorCode.MY_NEW_ERROR, {
    summary: "My new error",
    detail: "Detailed explanation...",
    category: ErrorCategory.CLIENT,
    retryable: false,
    severity: ErrorSeverity.ERROR,
    userMessage: "User-friendly message",
    devMessage: "Developer diagnostic",
    suggestions: ["Suggestion 1", "Suggestion 2"],
  }),
};
```

## Server Usage

The server can import and use the same error system:

```typescript
import {
  ErrorCode,
  HTTPStatus,
  errorCodeToHTTPStatus
} from "@common/server";

// Map internal error to HTTP status
function setResponseStatus(error: RichError, response: Response): void {
  const status = errorCodeToHTTPStatus(error.code as ErrorCode);
  response.status(status);
}
```

## Migration from Old System

Before:
```typescript
// ❌ Magic strings and numbers
if (error.code === "NOT_FOUND") {
  res.status(404).json({ error: "Not found" });
}
```

After:
```typescript
// ✅ Type-safe enums
if (error.code === ErrorCode.NOT_FOUND) {
  const status = errorCodeToHTTPStatus(ErrorCode.NOT_FOUND);
  res.status(status).json({
    error: error.metadata.userMessage,
    code: error.code,
    retryable: error.metadata.retryable,
  });
}
```
