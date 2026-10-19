---
"@procedures/client": patch
---

The server transports are in the Node entry (CLI-6 step 1). `@procedures/client/node` now exports `HttpServerTransport`, `HttpServerTransportOptions` and `HttpUrlStrategy`. It already exported `WebSocketServerTransport` and its types.

The root `@procedures/client` and the entry `@procedures/client/server` still export these names, but each export is now a deprecated alias with the tag `@deprecated`. The deprecated names are `HttpServerTransport`, `HttpServerTransportOptions`, `HttpUrlStrategy`, `WebSocketServerTransport`, `WebSocketServerTransportOptions`, `WebSocketAuthHandler`, `WebSocketConnectionHandler` and `WebSocketMessage`. Each alias is the same class or type as the export of `./node`, so `new`, `instanceof` and `extends` work as before.

The next MINOR removes them from the root (CLI-6 step 2). It also removes them from `./server`. Then the root imports no `http` and no `ws`. Migration: import them from `@procedures/client/node`.

The migration steps of the known consumers:

- The site: no change. It imports none of these names.
- MiniMongo: no change. It imports none of these names. The server stub in `vite.config.ts` names `HttpServerTransport` and `WebSocketServerTransport`, and it can stay.
- Graph: no change. It imports none of these names.
- jarvis: no change. It imports none of these names.
- The procedures image of the harness of `systems` (`packages/harness/image/procedures/server-ws.mjs`) imports `WebSocketServerTransport` from the root. It pins `@procedures/client` 0.7.0. When it moves to a version after the next MINOR, import `WebSocketServerTransport` from `@procedures/client/node`.
