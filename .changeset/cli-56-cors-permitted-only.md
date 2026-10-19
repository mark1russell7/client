---
"@procedures/client": patch
---

Changed: `procedureHandler` sends no CORS header to an origin that its `cors` option does not permit (CLI-56). Before, the response for such an origin had no `Access-Control-Allow-Origin`, but it had `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Credentials` and `Access-Control-Expose-Headers`, and a preflight also had `Access-Control-Max-Age`. A browser ignores these headers without `Access-Control-Allow-Origin`, so no client uses them. Now the response for that origin, and for a request without an `Origin` header, has none of them. With a list or a function of origins, each response still has `Vary: Origin`, so a shared cache keeps one answer for each origin. A permitted origin and the origin `"*"` get the same headers as before. A preflight still gets 204. `HttpServerTransport` does not change.
