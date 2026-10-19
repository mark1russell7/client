# Wire protocol v1

This document specifies the bytes between a client and a server of `@procedures/client`: the HTTP format and the WebSocket format. The version is 1 (roadmap R25). The golden tests in `packages/client/test/wire/` pin the format: a change to a frame fails them.

## Compatibility

- A change after v1 adds only an optional field, a new frame type that an older side can ignore, or a new error code. The `seq` of the stream frames is such a field (refer to "The sequence numbers of a stream").
- The keep-alive line of an NDJSON stream is such a change too. Each reader of v1 skipped a blank line before it (refer to "The keep-alive of an NDJSON stream").
- Each other change makes v2. A side that gets a newer version refuses it with the error code `PROTOCOL_VERSION`.
- A side that sends no version is older than v1. Its formats are the formats of v1, so the other side accepts it.
- The procedure has no version. `Method.version` is deprecated, and the server ignores it. A procedure that changes in a way that is not compatible gets a new path.

## The call

A call names a procedure with a method: `{ "service": "docker.compose", "operation": "up" }`. The last segment of the path is the operation. The other segments, joined with dots, are the service.

- A path has one segment or more (CLI-28). Each face calls a path of each length.
- A path of one segment has the empty service: `["morning"]` is `{ "service": "", "operation": "morning" }`.
- A segment with a dot does not round-trip, because the dot joins the segments of the service.
- A method with an empty segment names no procedure and gets `NOT_FOUND`. Examples are a `..` segment and a stray dot (`notes.`). Thus `/api/notes/..` does not reach the procedure `notes`.

The metadata of a call is a JSON object. These keys have a meaning in the protocol:

| Key | Direction | Meaning |
|---|---|---|
| `procedure-timeout` | request | The remaining time of the caller, in milliseconds. The server uses it only to make its deadline earlier. |
| `procedure-narrowing` | request | A narrower capability that the call asks for, as a JSON object. The server uses it only to make the capability narrower. Refer to "The narrowing key". |
| `idempotency-key` | request | The key of a call. Each try of one call sends the same key. The server runs a keyed call to a procedure that is not idempotent one time. |
| `traceparent` | request | The W3C trace context of the caller. The server continues that trace. |
| `reason` | response | The reason of a `FORBIDDEN` error. Refer to "The reasons of FORBIDDEN". |
| `retry-after` | response | The time that a client waits before a retry, in milliseconds. |
| `stream` | response | The value `unbounded`: the stream can run without an end. The HTTP client also sets this key on each item of an NDJSON stream, with the value `true`. |

A key that starts with `__` stays in the process of the caller. A transport does not send it.

## The narrowing key

A call can ask for a narrower capability than its principal holds (CLI-30). A narrower capability is always safe, for the same reason as the deadline. Thus each face carries the narrowing key `procedure-narrowing`.

### The value

The value is a `CapabilityRequest` as a JSON object. Each field is optional.

| Field | Value | Meaning |
|---|---|---|
| `clearance` | A value of the clearance order of the server | The highest clearance of the call. |
| `effects` | An object with `reads`, `writes` and `destructive` | The permitted effects. `reads` and `writes` are `"any"` or a list of resource names. `destructive: false` refuses a destructive procedure. |
| `timeoutMs` | A count of milliseconds, zero or more | The longest time of the call, from the start of the call. |

For example, `{"clearance":"shared","effects":{"writes":[]}}` asks for the clearance `shared` and for no changes. A list of such objects is also a valid value: each item is one source.

### The sources on each face

A request can have more than one source of narrowing. For example, a gateway sets the header, and the client sets the key of `X-Metadata`. No source replaces another source: the server applies each one.

| Face | Sources |
|---|---|
| HTTP | Each line of the header `Procedure-Narrowing`, with the JSON of the value, raw or URI-encoded. The key `procedure-narrowing` of `X-Metadata`. A query parameter with the name `procedure-narrowing`. |
| WebSocket | The key `procedure-narrowing` of the `metadata` of a `request` frame. |
| MCP | The key `procedure-narrowing` of the `_meta` of a `tools/call` request, and the header `Procedure-Narrowing` of a call over Streamable HTTP. |
| The process | The key `procedure-narrowing` of the metadata of a call: `ProcedureServer.handle()`, `LocalTransport`, `invokeProcedure()`, and `Client.exec()` with the option `metadata`. The option `narrow` of `invokeProcedure()` is one more source. |
| Each face | The narrowing that the request hook `principalOf` gives. |

- A WebSocket connection has no narrowing key of its own. The request hook `principalOf` reads the upgrade, and its narrowing applies to each call of the connection.
- The default CORS headers of `procedureHandler` and `HttpServerTransport` include `Procedure-Narrowing`, so a browser on a permitted origin can send it.

### The rules of the server

1. The server calculates the capability of the call from its own authentication. Then the invocation of the call applies each source.
2. The clearance is the meet of the clearance order. The effects are the intersection. The deadline is the earliest deadline.
3. Thus each source can only make the capability narrower. The result is the same for each sequence of the sources.
4. One place applies the sources: `invokeProcedure()`, for the call of a host. Thus each face and each call in the process obey the same rules.
5. A valid part that asks for more than the call holds has no effect, because the meet removes it. On a ladder, the call keeps its clearance.
6. A part that is not valid refuses the call. The server does not know what such a source asks for, so it does not ignore the part. Thus a typo of a gateway does not leave the call with a wider capability.
7. A part that is not well formed gives `INVALID_REQUEST`. Examples are a text that is not JSON and a value that is not an object. An unknown field (for example `efects`) and a time that is not a number are such parts too.
8. A clearance outside the order (for example `pubic` on the ladder of jarvis) gives `FORBIDDEN` with the reason `clearance`. A server without a clearance order cannot meet two different clearances, so such a call gets the same refusal.
9. The server reports each part without effect, and each refusal, in debug. The option `debug` of `ProcedureServer` gets a report with the topic `narrowing`.
10. The key does not give a capability. It only removes a part of the capability that the server gives.
11. The key stays in the metadata of the call. Thus a nested call to a remote server sends it again, and that server narrows the call too.

### The audience of jarvis

The audience of jarvis is a value of its ladder `SCOPES`. A request can make the audience narrower, but not wider. The narrowing key replaces the audience header, and the request hook reads the audience cookie.

| jarvis | The procedures server |
|---|---|
| The ladder `SCOPES` | The option `clearanceOrder: ladder(SCOPES)`. |
| The audience of the server | The option `capability`, for example `{ clearance: "intimate" }`, or a function of the principal. |
| The header `x-jarvis-audience: shared` | The header `Procedure-Narrowing: {"clearance":"shared"}`, or the key in the metadata of `HttpTransport`. |
| The cookie `jarvis_audience=shared` of the guest switch | `principalOf` reads the cookie and gives `narrowing: { clearance: "shared" }`. |
| The narrower of the two carriers wins | The server applies the cookie of the hook and the key by the meet, in each sequence. |
| An unknown value has no effect | The ladder does not have the value, so the server refuses the call with `FORBIDDEN` (reason `clearance`). This rule is stricter than jarvis: a typo of a gateway does not leave the call wider. |
| Below `intimate`, only the declared reads start | This rule stays the policy of jarvis. An interceptor of jarvis narrows the effects below `intimate`. |

## HTTP

### The request

- The method is `POST`. The URL is `{base}/{service}/{operation}`, for example `/api/docker.compose/up`. This is the default addressing (refer to "The addressing of a request").
- A path of one segment has the URL `{base}/{operation}`, for example `/api/morning`.
- Each URL segment is URI-encoded. Thus a path segment does not make a URL separator, and a path gives one or two URL segments.
- The deprecated `Method.version` has the old form `{base}/{version}/{service}/{operation}`: only the version makes three URL segments, so the forms do not collide. A path of one segment has no version in the URL, because `{base}/{version}/{operation}` reads as a service and an operation. The server ignores the version.
- The body is the input of the procedure as JSON. Each JSON value is valid: an object, an array, a number, a string, `true`, `false` or `null`.
- `Content-Type: application/json`.
- `Accept: application/x-ndjson, application/json`. A client without NDJSON gets the last item of a stream as JSON.
- `Procedures-Protocol: 1`.
- `X-Metadata`: the metadata of the call as URI-encoded JSON. The limit is 8 KiB.
- `Authorization: Bearer <token>`, when the server has a token.
- `traceparent`, when the call has a trace.
- `Procedure-Narrowing`, when the call asks for a narrower capability (refer to "The narrowing key").
- An `OPTIONS` request gets the status 204 with no body, and no procedure starts for it. With CORS, the response also has the CORS headers. The Express shim `HttpServerTransport` without CORS gives an `OPTIONS` request to the procedures, as before.

### The credentials of a request

The server reads the credentials of each network request. They go to the request hook `principalOf` and to the token check, not into the metadata.

- The bearer token of the header `Authorization: Bearer <token>`.
- The cookies of the header `Cookie`, by name. The server decodes each URI-encoded value. When two cookies have the same name, the first one applies.
- Each header, by its lower-case name, the secret headers too.
- The first value of each query parameter.
- The secret headers stay out of the metadata: `Authorization`, `Proxy-Authorization`, `Cookie`, `X-Api-Key` and the names of the option `secretHeaders`.
- The secret query parameters stay out of the metadata too. For `procedureHandler`, the default of the option `secretQuery` is `["token"]`. For `HttpServerTransport`, the default is no parameter.
- The request hook can give the bearer token from a cookie, a header or the query, for example `?token=<token>`. A WebSocket connection gives the credentials of its upgrade to each call, and its `?token=` query is a bearer token.
- A request from this process has no credentials, so the request hook and the token check do not apply to it.

### The addressing of a request

The server finds the method and the payload of a request with its addressing (CLI-31). The addressing is a hook of the request and its body. It gives `{ method, payload }`, or null when the request names no call. Null and an error of the hook give `INVALID_REQUEST`.

- `urlAddressing()` is the default. The URL gives the method, and the body is the payload. This is the format of `HttpTransport`.
- `bodyPathAddressing()` reads the path and the input from the body of a single endpoint: `POST {base}` with `{"path": ["notes", "list"], "input": {}}`.
- The path in the body is a list of segments, or a text with dots, for example `"notes.list"`. Without `input`, the payload is `{}`.
- With `bodyPathAddressing()`, the handler also takes the base path itself. The options `pathField` and `inputField` change the names of the fields.
- The addressing reads only the own fields of the body. A `__proto__` key gives no path.
- The option `addressing` of `procedureHandler` and of `HttpServerTransport` sets the hook. An application can give its own hook, for example the URL first and then the body.
- The other parts of a request do not change with the addressing: the headers, the metadata, the credentials and the narrowing key.

### The response

- Each response has the header `Procedures-Protocol: 1`.
- A value: the status 200, and the value as JSON. No value: the status 204, with no body.
- A stream with NDJSON: the status 200, `Content-Type: application/x-ndjson` and `Cache-Control: no-cache`. Each line is one JSON object or a keep-alive line (refer to "The lines of an NDJSON stream").
- An error: the HTTP status of its code (refer to "Error codes"), and the body `{"error": message, "code": code, "retryable": boolean}`. The body can also have `reason` and `retryAfterMs`. An error with a wait has the header `Retry-After` in seconds.
- A stream that can run without an end, for a client without NDJSON: the status 406 and the code `NOT_ACCEPTABLE`.

### The lines of an NDJSON stream

Each line ends with LF. A frame line is one JSON object.

| Line | Fields | Meaning |
|---|---|---|
| `{"type":"item","seq":1,"payload":...}` | `seq`, `payload` | One item of the stream. |
| `{"type":"done","seq":...}` | `seq` | The end of the stream. |
| `{"type":"error","error":{"code":...,"message":...,"retryable":...}}` | `error` | The stream failed. This line has no `seq`. |
| A blank line | none | A keep-alive line. It is not a frame, and it has no `seq`. |

- The `seq` of the `item` and `done` lines follows the rules of the stream frames (refer to "The sequence numbers of a stream").
- The `done` line or the `error` line is the last line. A stream that ends without one of them is a broken stream.
- `writeNdjsonStream` of `@procedures/client/node` writes these lines for a `ServerResponse` of `node:http`.
- `procedureHandler` of `@procedures/client/node` serves the HTTP wire of this document on a `node:http` server, without a framework. It writes its streams with `writeNdjsonStream`.
- `HttpServerTransport` is an Express shim over `procedureHandler`, so the two faces write the same bytes.

### The keep-alive of an NDJSON stream

A proxy or a client often closes a connection that sends no bytes for a time, for example 60 or 300 seconds. A long procedure can be quiet for a longer time, so the server sends keep-alive lines.

- The server writes a blank line, one LF, after each quiet time: no line went out for that time. The default time is 15 seconds (`TIMER_DEFAULTS.httpServer.keepAliveMs`). The option `keepAlive` changes it, and `keepAlive: false` turns it off.
- Each line starts the quiet time again. The server writes no keep-alive line after the `done` line or the `error` line, after an abort, or after the connection closes.
- While the reader does not read and the send buffer is full, the server writes no keep-alive line.
- A keep-alive line has no `seq`. The reader skips it before the sequence check, so a keep-alive line shows no gap.
- A reader skips each blank line: an empty line, a line with only spaces, or a line with only CR.
- A keep-alive line is not the first item. The `timeout` of `HttpTransport` covers the time to the first item, so a keep-alive line does not stop that timeout.

The HTTP client gives each item of an NDJSON stream the metadata key `stream` with the value `true` (`STREAM_ITEM_METADATA_KEY`). The error item that ends the stream has it too. Thus the reader of an item knows that the item came from a stream, not from a JSON response. This key does not cross the wire, and the client removes a key with this name that the peer sent.

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
| `stream` | callee | `seq`, `payload`, `stream: { done: false }` | One item of a stream. |
| `stream` | callee | `seq`, `stream: { done: true }` | The end of a stream. |
| `credit` | caller | `credit` | The reader took items: the callee can send this number of items more. |
| `cancel` | caller | | The caller stops the call. The callee aborts its handler. |

- The `id` of a `request` is unique among the running calls of its sender on the connection. Each answer frame has the `id` of its request. A second request with the id of a running call gets the error `DUPLICATE_REQUEST`.
- The callee sends the next item of a stream only when it has credit. The caller gives credit in batches of half its window.
- A closed connection aborts each call that runs. The calls that wait for an answer fail, and their outcome is indeterminate: the other side can have run them.

### The sequence numbers of a stream

Each `stream` frame has the field `seq`. Without it, a duplicate frame gave a duplicate item. The field is an additive change of v1.

- The callee writes `seq` in each `stream` frame of a call. The first frame has 1, and each next frame has one more. The end frame has a number too.
- The numbers count within one request id. Each call starts at 1.
- The caller keeps the highest `seq` of each call. It drops a frame whose `seq` is not above that number. Thus a duplicate frame or a late frame gives no item.
- A `seq` that is more than one above that number shows a gap: the frames between the two numbers did not arrive.
- A frame without `seq` comes from an older peer. The caller takes it as before, without a check. A `seq` that is not a positive integer counts as no `seq`.
- An `error` frame that ends a stream has no `seq`.

The transports with these frames apply the rules: WebSocket in the two directions, the message port, and HTTP with NDJSON. The local transport has no frames. It gives the items of the handler in the process, so it has no `seq`.

### The rule of the receiver on a gap

The receiver writes a warning and continues the stream. A gap does not end the stream with an error. This rule follows the rule of "at most once":

- The protocol delivers each item one time or not at all. The callee does not send an item again, and the caller does not acknowledge an item.
- Thus the caller cannot get the lost items back. An error also loses each later item, and a retry of the call can give the first items again.

The receiver reports the gap in three ways:

1. The item after the gap has the metadata key `stream-gap` (`STREAM_GAP_METADATA_KEY`): the number of lost frames. This key does not cross the wire. The receiver removes a key with this name that the peer sent.
2. The console gets a warning with the id of the call and the number of lost frames.
3. The caller gives back the credit of the lost frames, as if the reader took them. Thus a gap does not make the window of the stream smaller.

A gap before the end frame gives only the warning, and the stream ends. The remote events have the same rule for the `seq` of their events (refer to "Remote events").

### The heartbeat

- The client sends `{"type":"ping"}` frames, and the server answers with `{"type":"pong"}`.
- The server sends WebSocket ping control frames. A connection that misses two pongs one after the other closes.

### Reserved frame types

- The type `event` is reserved. No side of v1 sends it. Since 0.9.0 the WebSocket client ignores such a frame, as a frame of an unknown type.
- The server answers a frame of an unknown type with an `error` frame that has the id of that frame. The client ignores such a frame.

## Remote events

A peer subscribes to the topics of the event bus of another peer with a call of the procedure `events.subscribe`. [EVENTS.md](./EVENTS.md) specifies the design. The subscription uses the frames of a call, so it adds no frame type to v1:

- The request has the input `{"topics":[...]}`, with 1 to 64 topic names.
- The answer is a stream without an end. The first item is `{"type":"subscribed","topics":[...]}`. Each other item is `{"type":"event","topic":...,"data":...,"seq":...}`, with `dropped` after a loss.
- An event has two numbers. The `seq` of the frame counts the frames of the call, and the `subscribed` item has the number 1. The `seq` of the event, in the payload, counts the events of the subscription.
- A gap in each number shows a loss, and the stream continues. The `seq` of an event also counts the events that the publisher dropped, so a gap there does not show a gap of the frames.
- The `credit` of the request is the backpressure. When the queue of a subscription is full, the publisher drops its oldest event.
- A `cancel` is the unsubscribe. A closed connection ends each subscription of the connection.
- A topic outside the topic rule of the host gives `TOPIC_NOT_FOUND`. A topic that the publisher refuses gives `FORBIDDEN` with the reason `topic-not-allowed`.
- When `clear()` of the bus of the publisher removes a listener of a subscription, the stream ends with an `error` frame `TOPIC_CLEARED`. The code is not retryable.
- Two subscribers of one topic on one transport share one call. The wire thus gets one `request` and one `cancel`, as for one subscriber.
- Over HTTP, the subscription is an NDJSON stream. Without NDJSON, the server answers `NOT_ACCEPTABLE`. A quiet subscription gets keep-alive lines (refer to "The keep-alive of an NDJSON stream").

## Message port

`PortTransport` sends the frames of the WebSocket table over a message port: a Web Worker, a `MessageChannel` or a `worker_threads` port (roadmap R27).

- A port sends objects, not text, so a frame is an object without JSON.
- The `stream` frames have `seq`, and the receiver applies the rules of WebSocket.
- A port has no `hello` frame and no heartbeat. The two sides are parts of one application, and they come from one build.
- A call over a port has no time limit. The `signal` of a call stops it.

## Error codes

Each face gives the same code for the same failure. `packages/client/src/protocol.ts` holds the list (`ERROR_CODES`). The error registry of the client (`ERROR_REGISTRY`) takes the HTTP status and the retry flag of each code from this list.

An error of a handler with a code of its own keeps that code on each face, for a value and for a stream. The HTTP status follows the code:

- A code of the table gets the status of the table.
- Another code of `ERROR_REGISTRY` gets the status of the registry, for example 409 for `CONFLICT`.
- Each other code gets the status 500.
- An error with `retryable: false` does not get 503, because a 503 invites a retry at the HTTP level. It gets 500 with no `Retry-After` from the error, for example `UNAVAILABLE` with `retryable: false` (CLI-48).
- An error of a handler without a retryable flag gets the flag of its code in this table, or false. Thus `UNAVAILABLE` without a flag is retryable and gets 503.

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
| `TOPIC_CLEARED` | 410 | no | `clear()` or `clearAll()` of the bus of the host removed a listener of the subscription (remote events). |

The column "Retryable" gives the default flag of a code. An error can have another flag. A call that the shutdown of a host cuts ends with `UNAVAILABLE` on each face, before or after its first item. Its flag is false when the call can have had its effect (CLI-48). Before its first item, the HTTP status of such a cut is then 500.

### The reasons of FORBIDDEN

A `FORBIDDEN` error tells its reason in the metadata key `reason`. The HTTP body has the field `reason` too.

| Reason | From | Meaning |
|---|---|---|
| `effects-undeclared` | The capability of the call | The procedure does not declare its effects, and the capability limits them. |
| `effects-exceeded` | The capability of the call | The procedure has an effect that the capability does not permit. |
| `clearance` | The output filter of the host | The clearance of the call does not permit the output. |
| `outside-root` | `@procedures/fs` | The path is outside the root of the files. |
| `host-not-allowed` | `@procedures/http` | The procedure refuses the host of the URL. |
| `topic-not-allowed` | The publisher of the events | The publisher refuses the topic. |
| `partition-not-allowed` | The collection procedures | The partition resolver of the collection refuses the partition of the call (CLI-17). |
| `origin-not-allowed` | The browser checks of `procedureHandler` | The `Origin` of the request is not the origin of the server or a permitted origin. A cross-site request without a permitted origin gets it too. |
| `host-header-not-allowed` | The browser checks of `procedureHandler` | A request on a loopback address names a `Host` that is not permitted (DNS rebinding). |
| `method-not-allowed` | The browser checks of `procedureHandler` | The HTTP method is `GET` or `HEAD`, and the option `allowGet` is off. |
| `media-type-not-allowed` | The browser checks of `procedureHandler` | The request body is not JSON. |

A deadline that passed before the procedure started gives the code `TIMEOUT`, not `FORBIDDEN`. `HttpServerTransport` keeps its former codes for the four browser checks: `FORBIDDEN_ORIGIN`, `FORBIDDEN_HOST`, `METHOD_NOT_ALLOWED` and `UNSUPPORTED_MEDIA_TYPE`, with the status 403, 405 or 415.

## MCP

The MCP face follows the MCP specification. An error result has `isError: true`, a text block with the message and the reason, and `_meta` with `code`, `retryable` and `reason`. The error of a stream also has `_meta` with `code` and `retryable` (CLI-48).

- The name of a tool is the path with dots, for example `notes.list`, or the name of the option `toolName`. A path of one segment has its segment as its name, for example `morning`.
- Each tool name names one procedure. Two procedures can have one name after the join, for example `["a_b", "c"]` and `["a", "b_c"]` with `path.join("_")`. Then the face leaves out the two tools and writes the reason to stderr. Thus a call does not reach the wrong procedure.
