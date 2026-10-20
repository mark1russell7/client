---
"@procedures/client": minor
---

The root of `@procedures/client` and the entry `@procedures/client/server` do not export the server transports (CLI-6 step 2). Thus the root imports no `http`, no `ws` and no `express`, and its declarations name none of them (CLI-61). This change is a break of the server stack, thus it is its own MINOR (decision D13). The PATCH 0.14.1 marked each removed name as `@deprecated`.

- Removed from the root and from `./server`: `HttpServerTransport`, `HttpServerTransportOptions`, `HttpUrlStrategy`, `WebSocketServerTransport`, `WebSocketServerTransportOptions`, `WebSocketAuthHandler`, `WebSocketConnectionHandler` and `WebSocketMessage`. `@procedures/client/node` exports each of them, as before.
- Changed: `HttpUrlStrategy` takes a structural request, `UrlStrategyRequest`, not the `Request` of Express. `UrlStrategyRequest` has `method`, `path`, `url` and `headers`, and the optional `query` and `body`. A `Request` of Express agrees with it, and so does the `UrlRequest` of `procedureHandler`. `HttpServerTransport` still gives the strategy the request of Express. `@procedures/client/node` exports `UrlStrategyRequest`.
- Changed: the headers of `GuardedRequest` (the request of `checkBrowserRequest`) and of `hasAmbientCredentials` have the new structural type `GuardedHeaders`, not `IncomingHttpHeaders` of `node:http`. The headers of an `IncomingMessage` agree with it, so a call with a request of Node does not change.
- New: the root exports the types `RoutedRequest` and `GuardedHeaders`. `./server` exports `RoutedRequest`.
- New: the root is a browser entry (`client.browser`). The CI check bundles it for a browser, and a test examines the declarations of each entry other than `./node`. A project that checks the declarations of its libraries (`skipLibCheck: false`) and imports the root needs no `@types/express`.

MINOR: before 1.0.0, a break of the public API raises the MINOR. The removal of exports and the new parameter type of `HttpUrlStrategy` break the API.

Migration:

- Import `HttpServerTransport`, `WebSocketServerTransport` and their types from `@procedures/client/node`.
- A URL strategy whose parameter has the type `express.Request` does not compile as an `HttpUrlStrategy`. Give the parameter the type `UrlStrategyRequest` of `@procedures/client/node`, or give it no type: `HttpUrlStrategy` gives it the type.
- A strategy that reads a part of the Express request outside `UrlStrategyRequest`, for example `req.params`, casts the request: `(req as express.Request).params`.
- Code that reads a header of `GuardedHeaders` without a declared property, for example `accept`, gets `string | string[] | undefined`. Examine the value with `typeof` before use.

The migration steps of the known consumers:

- The site: no change. It imports none of these names. It names `HttpServerTransport` and `WebSocketServerTransport` only in the text of its journey.
- MiniMongo: no change. It imports none of these names, and its host uses `runProcedureHost`. Its `vite.config.ts` maps the root to `@procedures/client/browser`. The map can stay, because the root is also a browser entry.
- Graph: no change. It imports none of these names.
- jarvis: no change. It imports none of these names.
- The procedures image of the harness of `systems` (`packages/harness/image/procedures/server-ws.mjs`) imports `WebSocketServerTransport` from the root. It pins `@procedures/client` 0.7.0. When it moves to this MINOR or a later version, import `WebSocketServerTransport` from `@procedures/client/node`.
- `headroom` (`packages/daemon/src/gateway.ts`) gives `checkBrowserRequest` of the root a request of `node:http`: no change.
