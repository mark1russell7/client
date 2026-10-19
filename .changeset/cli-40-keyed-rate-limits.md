---
"@procedures/client": patch
"@procedures/peer": patch
"@procedures/mcp-server": patch
---

The procedures server can limit the calls of each principal, tenant or route (server stack CLI-40). This change is additive. Without the new option, nothing changes. Thus it is a PATCH of the client group (decision D13).

The new behavior:

- `hostPolicy()` and `ProcedureServer` of `@procedures/client` have the new option `limits`. Each limit has a name, a key over the call, the calls that it covers, a limit policy, a store and a bound on its keys.
- The key is the principal, a claim of the principal (`{ claim: "tenant" }`), the route, a list of these, or a function of the call. A call without a value of its key is outside the limit.
- The option `covers` takes `{ writes: true }` for only the calls that can change data, `{ routes: [...] }` for some procedures, or a function of the call.
- Each limit is a keyed limiter of `@mark1russell7/service/limiter` (SYS-28) on the clock of the server. The option `limitStores` gives the stores that the replicas share.
- The server takes one unit of each limit that covers a call, after the authentication and before the run. This is one step for each face: HTTP, WebSocket, MCP and the calls in the process.
- A call above a limit gets the new error code `RATE_LIMITED` (retryable). Its metadata has the wait in `retry-after` (milliseconds) and the cause in `reason` (`limit`, `cap` or `store`). The call does not run.
- HTTP gives 429 with `Retry-After` in whole seconds. WebSocket gives the same code and metadata. MCP gives the code, `reason` and `retryAfterMs` in `_meta`.
- A circuit breaker does not count `RATE_LIMITED`, because the server is healthy.
- `createProcedureHost()` of `@procedures/peer` declares each limiter on its service with `svc.limiter()`. Thus `describe()` and `lint()` see it. `host.limiters` gives the limiters, and `ProcedureServer.limiters()` gives them too.
- The rate limit middleware of the client (`createRateLimitMiddleware`) uses the same keyed limiter. Its bucket, its queue and its statistics do not change. The new option `clock` gives the clock of the bucket and of the queue. The default is `Date.now()` and `setTimeout`, as before.
- `createRateLimitMiddleware` now refuses `maxRequests` that is not a whole number above 0, and a `window` of 0. Before, such a bucket never let a call in, or it limited nothing.
- The `Retry-After` header of the HTTP face rounds the wait up to whole seconds with the rule of `@mark1russell7/service`. A wait above a whole second only by an error of floating point does not add a second.
- The client packages use `@mark1russell7/service` 0.5.3 and `@mark1russell7/algebra` 0.7.2.

An example for the writes of each tenant:

```ts
hostPolicy({
  principalOf,
  limits: [
    {
      name: "graph.writes",
      key: { claim: "tenant" },
      covers: { writes: true },
      policy: { type: "sliding-window", limit: { value: 120, unit: "count" }, window: { value: 1, unit: "min" } },
      store: { kind: "local" },
      evict: { maxKeys: { value: 10000, unit: "count" } },
    },
  ],
});
```
