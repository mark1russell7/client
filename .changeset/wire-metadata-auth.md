---
"@procedures/client": patch
---

Each network face of `@procedures/client` keeps the metadata key `auth` out of the metadata of a handler. The key holds credentials, and the credentials of a network request go to the request hook and to the token check (roadmap R18).

- The HTTP face drops the key `auth` from the query, from the custom headers and from `X-Metadata`, in each case of its letters. A call of a batch gets the same rule.
- The WebSocket server drops the key `auth` from the metadata of a request frame. The credentials of a call are those of its connection.
- The WebSocket client drops the key `auth` from the metadata of a call that the server sends to it.
- A local face keeps the key: a call in the process and `PortTransport`.
- A server middleware reads the token from `request.credentials` (the field `bearer`), not from the metadata. `docs/SERVER.md` shows this.
