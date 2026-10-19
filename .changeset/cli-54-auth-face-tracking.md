---
"@procedures/better-auth": patch
"@procedures/peer": patch
---

New: the requests of the auth face go through the request tracking of the procedures host (CLI-54). Before, `betterAuthFace()` served its routes outside the tracking, so the stop of the host could cut a sign-in after Better Auth wrote the session and before the answer. The context of each face of `createProcedureHost()` now has `track`: a function that does the work of one HTTP request through `life.request`, on the route `<face> <key>` of the controller of the host. Thus the route pattern of the face (`auth *`) applies. A request after the stop of the intake gets 503, the drain waits for a request in flight, and the readiness of the controller applies. `httpTracker()` gives this function, and `betterAuthHandler()` has the new option `track`. A preflight does not go through the tracking. Without a service, each request starts directly, as before.
