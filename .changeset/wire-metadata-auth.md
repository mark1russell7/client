---
"@procedures/client": minor
---

Each network face of `@procedures/client` keeps the metadata key `auth` out of the metadata of a handler. The key holds credentials, and the credentials of a network request go to the request hook and to the token check (roadmap R18).

- The HTTP face drops the key `auth` from the query, from the custom headers and from `X-Metadata`, in each case of its letters. A call of a batch gets the same rule.
- The WebSocket server drops the key `auth` from the metadata of a request frame. The credentials of a call are those of its connection.
- The WebSocket client drops the key `auth` from the metadata of a call that the server sends to it.
- A local face keeps the key: a call in the process and `PortTransport`.

This is a MINOR: an earlier `docs/SERVER.md` showed a handler that reads `context.request.metadata.auth?.token`, and that worked over WebSocket.

Migration for a server and each app:

1. A handler or a middleware reads the token from `context.request.credentials?.bearer`, not from `context.request.metadata.auth`. `docs/SERVER.md` shows this.
2. A WebSocket client gives its token in the upgrade: `?token=<token>` in the `url` of `WebSocketTransport`, or a cookie. A token in the metadata of a call does not reach the handler.
3. An HTTP client does not change: `createAuthMiddleware` sends the token as the `Authorization` header, and the server reads it into `request.credentials`.

The WebSocket client still sends the key `auth` in its frames. This is deprecated: a later MINOR stops sending it.
