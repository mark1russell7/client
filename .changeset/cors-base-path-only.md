---
"@procedures/client": minor
---

Break: `HttpServerTransport` applies its CORS only to the base path and the paths under it. Another route of the app gets no CORS header from the transport, and its `OPTIONS` request goes to the route. Before this release, the transport sent the CORS headers on each route of the app, and it answered each `OPTIONS` request of the app. This ends the deprecation of 0.60.1.

- With CORS, the preflight request of a batch at the base path itself goes to the procedure handler. The CORS of the handler answers it.
- The routes under the base path keep the same CORS headers.

Migration steps for the site and each app:

1. Find each route of the app outside `basePath` that gets requests from a page on another origin.
2. Before each such route, add a CORS function of the app. For a route with credentials, use `credentialedCors()` of `@procedures/client/node`:

   ```ts
   import { credentialedCors } from "@procedures/client/node";

   const cors = credentialedCors(["https://app.example"]);
   app.use("/auth", (req, res, next) => {
     if (!cors(req, res)) next();
   });
   ```

3. For a route without credentials, the `cors` package of Express also does this work.
4. The routes under `basePath` need no change.
