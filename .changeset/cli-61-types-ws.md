---
"@procedures/client": patch
---

`@types/ws` is a dependency of `@procedures/client`, not a development dependency (CLI-61). The published declarations of the WebSocket transports name the types of `ws`, which is a dependency. Before, a project that checks the declarations of its libraries (`skipLibCheck: false`) and had no `@types/ws` failed to compile. Now each install gets the types with `ws`.

The types of `express` stay an optional part, as `express` is an optional peer dependency. A project that checks library declarations and imports the root of the client needs `@types/express` until the next breaking release of the server stack (CLI-6 step 2), which takes the Express types out of the root.

PATCH: a dependency of the package changes, and no API changes.
