---
"@procedures/client": patch
---

`procedureHandler` answers the preflight request of a batch at the base path itself: `OPTIONS {base}` with `Procedures-Batch` in `Access-Control-Request-Headers`. Its CORS rule gives the answer. Before this release, the handler gave this request to the app, so a batch from a page on another origin failed.

- The default of `corsOptions.credentials` of `HttpServerTransport` is the rule of `procedureHandler`: false for the origin `"*"`, and true for each other origin. Before this release, the transport also sent `Access-Control-Allow-Credentials: true` with the origin `"*"`. A browser refuses that pair for a call with credentials.
- Deprecated: the CORS headers of `HttpServerTransport` on the routes of the app outside its base path. From 0.63.0, the transport applies CORS only to the base path and the paths under it. An app that needs CORS on its own routes adds its own CORS function.
