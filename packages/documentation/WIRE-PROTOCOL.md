# Wire protocol v1

This document specifies the bytes between a client and a server of `@procedures/client`: the HTTP format and the WebSocket format. The version is 1 (roadmap R25). The golden tests in `packages/client/test/wire/` pin the format: a change to a frame fails them.

## Compatibility

- A change after v1 adds only an optional field, a new frame type that an older side can ignore, or a new error code.
- Each other change makes v2. A side that gets a newer version refuses it with the error code `PROTOCOL_VERSION`.
- A side that sends no version is older than v1. Its formats are the formats of v1, so the other side accepts it.
- The procedure has no version. `Method.version` is deprecated, and the server ignores it. A procedure that changes in a way that is not compatible gets a new path.

## The call

A call names a procedure with a method: `{ "service": "docker.compose", "operation": "up" }`. The last segment of the path is the operation. The other segments, joined with dots, are the service.

The metadata of a call is a JSON object. These keys have a meaning in the protocol:

| Key | Direction | Meaning |
|---|---|---|
| `procedure-timeout` | request | The remaining time of the caller, in milliseconds. The server uses it only to make its deadline earlier. |
| `idempotency-key` | request | The key of a call. Each try of one call sends the same key. The server runs a keyed call to a procedure that is not idempotent one time. |
| `traceparent` | request | The W3C trace context of the caller. The server continues that trace. |
| `reason` | response | The reason of a `FORBIDDEN` error: `effects-undeclared`, `effects-exceeded`, `clearance`, `deadline`, `outside-root` (a path outside the root of `@procedures/fs`), `host-not-allowed` (a URL host that `@procedures/http` refuses) or `topic-not-allowed` (a topic that the publisher of the events refuses). |
| `retry-after` | response | The time that a client waits before a retry, in milliseconds. |
| `stream` | response | The value `unbounded`: the stream can run without an end. |

A key that starts with `__` stays in the process of the caller. A transport does not send it.

## HTTP

### The request

- The method is `POST`. The URL is `{base}/{service}/{operation}`, for example `/api/docker.compose/up`.
- The body is the input of the procedure as JSON. Each JSON value is valid: an object, an array, a number, a string, `true`, `false` or `null`.
- `Content-Type: application/json`.
- `Accept: application/x-ndjson, application/json`. A client without NDJSON gets the last item of a stream as JSON.
- `Procedures-Protocol: 1`.
- `X-Metadata`: the metadata of the call as URI-encoded JSON. The limit is 8 KiB.
- `Authorization: Bearer <token>`, when the server has a token.
- `traceparent`, when the call has a trace.

### The response

- Each response has the header `Procedures-Protocol: 1`.
- A value: the status 200, and the value as JSON. No value: the status 204, with no body.
- A stream with NDJSON: the status 200 and `Content-Type: application/x-ndjson`. Each line is one JSON object:
  - `{"type":"item","payload":...}` for each item.
  - `{"type":"done"}` at the end.
  - `{"type":"error","error":{"code":...,"message":...,"retryable":...}}` when the stream fails.
- An error: the HTTP status of its code (refer to "Error codes"), and the body `{"error": message, "code": code, "retryable": boolean}`. The body can also have `reason` and `retryAfterMs`. An error with a wait has the header `Retry-After` in seconds.
- A stream that can run without an end, for a client without NDJSON: the status 406 and the code `NOT_ACCEPTABLE`.

## WebSocket

Each message is one JSON object, a frame. Each frame has an `id` and a `type`. The two sides send the same frames: the client sends calls to the server, and the server sends calls to the client (roadmap R24).

### The start of a connection

1. The client opens the connection. A browser gives the token in the query: `?token=<token>`.
2. The client sends `{"id":"hello","type":"hello","protocol":1}`.
3. The server answers `{"id":"hello","type":"hello","protocol":1}`.
4. A server that does not speak the version of the client sends an `error` frame with the code `PROTOCOL_VERSION`. Then it closes the connection with the code 1002.

### The frames of a call

| Type | From | Fields | Meaning |
|---|---|---|---|
| `request` | caller | `method`, `payload`, `metadata`, `credit` | A call. `credit` is the number of stream items that the caller has room for. |
| `response` | callee | `payload`, `metadata`, `status` | The value of the call. |
| `error` | callee | `status`, `error`, `metadata`, `stream` | The error of the call, or the end of a stream with an error. |
| `stream` | callee | `payload`, `stream: { done: false }` | One item of a stream. |
| `stream` | callee | `stream: { done: true }` | The end of a stream. |
| `credit` | caller | `credit` | The reader took items: the callee can send this number of items more. |
| `cancel` | caller | | The caller stops the call. The callee aborts its handler. |

- The `id` of a `request` is unique among the running calls of its sender on the connection. Each answer frame has the `id` of its request. A second request with the id of a running call gets the error `DUPLICATE_REQUEST`.
- The callee sends the next item of a stream only when it has credit. The caller gives credit in batches of half its window.
- A closed connection aborts each call that runs. The calls that wait for an answer fail, and their outcome is indeterminate: the other side can have run them.

### The heartbeat

- The client sends `{"type":"ping"}` frames, and the server answers with `{"type":"pong"}`.
- The server sends WebSocket ping control frames. A connection that misses two pongs one after the other closes.

### Reserved frame types

- The type `event` is reserved. No side of v1 sends it. The WebSocket client gives such a frame to its `onEvent` handler, for a server outside this repository.
- The server answers a frame of an unknown type with an `error` frame that has the id of that frame. The client ignores such a frame.

## Remote events

A peer subscribes to the topics of the event bus of another peer with a call of the procedure `events.subscribe`. [EVENTS.md](./EVENTS.md) specifies the design. The subscription uses the frames of a call, so it adds no frame type to v1:

- The request has the input `{"topics":[...]}`, with 1 to 64 topic names.
- The answer is a stream without an end. The first item is `{"type":"subscribed","topics":[...]}`. Each other item is `{"type":"event","topic":...,"data":...,"seq":...}`, with `dropped` after a loss.
- The `credit` of the request is the backpressure. When the queue of a subscription is full, the publisher drops its oldest event.
- A `cancel` is the unsubscribe. A closed connection ends each subscription of the connection.
- A topic outside the topic rule of the host gives `TOPIC_NOT_FOUND`. A topic that the publisher refuses gives `FORBIDDEN` with the reason `topic-not-allowed`.
- Over HTTP, the subscription is an NDJSON stream. Without NDJSON, the server answers `NOT_ACCEPTABLE`.

## Message port

`PortTransport` sends the frames of the WebSocket table over a message port: a Web Worker, a `MessageChannel` or a `worker_threads` port (roadmap R27).

- A port sends objects, not text, so a frame is an object without JSON.
- A port has no `hello` frame and no heartbeat. The two sides are parts of one application, and they come from one build.
- A call over a port has no time limit. The `signal` of a call stops it.

## Error codes

Each face gives the same code for the same failure. `packages/client/src/protocol.ts` holds the list (`ERROR_CODES`). The error registry of the client (`ERROR_REGISTRY`) takes the HTTP status and the retry flag of each code from this list.

An error of a handler with a code of its own keeps that code on each face, for a value and for a stream. The HTTP status follows the code:

- A code of the table gets the status of the table.
- Another code of `ERROR_REGISTRY` gets the status of the registry, for example 409 for `CONFLICT`.
- Each other code gets the status 500.

| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `NOT_FOUND` | 404 | no | No procedure has the path, or the host does not expose it. |
| `NO_HANDLER` | 404 | no | The procedure has no handler here. |
| `NOT_EXPOSED` | 403 | no | A nested call reached a procedure that the host does not expose. |
| `NOT_DECLARED` | 403 | no | A nested call is not in the calls that the procedure declares. |
| `FORBIDDEN` | 403 | no | The capability of the call refuses it. The metadata key `reason` tells why. |
| `UNAUTHORIZED` | 401 | no | The request does not present the token of the server. |
| `VALIDATION_ERROR` | 400 | no | The input does not agree with the input schema. |
| `INVALID_REQUEST` | 400 | no | The request is not a valid request of the protocol. |
| `PROTOCOL_VERSION` | 400 | no | The other side speaks a newer version of the protocol. |
| `OUTPUT_VALIDATION_ERROR` | 500 | no | The output does not agree with the output schema. |
| `NO_OUTPUT` | 500 | no | The procedure gave no output. |
| `HANDLER_ERROR` | 500 | no | The handler threw an error without a code. |
| `INTERNAL_ERROR` | 500 | no | The server failed outside the handler. |
| `NOT_ACCEPTABLE` | 406 | no | The face cannot give the output: a stream without an end, and no NDJSON. |
| `DUPLICATE` | 409 | no | An idempotency key gave a stream, and a stream cannot be given again. |
| `DUPLICATE_REQUEST` | 409 | no | A request with this id still runs on the connection. |
| `ABORTED` | 499 | no | The caller aborted the call. |
| `TIMEOUT` | 504 | no | The deadline of the call passed. |
| `UNAVAILABLE` | 503 | yes | The server cannot take the call at this time: it stops, or it is busy. |
| `CONNECTION_CLOSED` | 503 | yes | The connection closed before the call left. |
| `CONNECTION_NOT_FOUND` | 404 | no | The server has no connection with this id. |
| `TOPIC_NOT_FOUND` | 404 | no | The topic rule of the host has no topic with this name (remote events). |

## MCP

The MCP face follows the MCP specification. An error result has `isError: true`, a text block with the message and the reason, and `_meta` with `code` and `reason`.
