---
"@procedures/client": patch
---

The Express shim `HttpServerTransport` sends no CORS header to an origin that it does not permit (CLI-59). A request without an origin also gets no CORS header. `procedureHandler` does this since 0.14.1 (CLI-56). A browser refuses such a response before and after the change, so no page can depend on the removed headers. Each response still gets `Vary: Origin` when `corsOptions.origin` is not `"*"`.
