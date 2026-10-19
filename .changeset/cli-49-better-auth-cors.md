---
"@procedures/better-auth": patch
"@procedures/client": patch
---

New: credentialed CORS for the auth routes, from the trusted origins of the host (CLI-49). The handler of Better Auth sends no CORS headers, so a page on another origin got no session and failed POST requests. `betterAuthHandler(auth, { allowedOrigins })` gives the Node handler of the auth routes with credentialed CORS. `betterAuthFace(auth)` gives it as a face of a procedures host, with `browser.allowedOrigins` of the host policy. Thus one list of trusted origins drives `procedureHandler` and the auth routes. A response for a trusted origin names that one origin, with `Access-Control-Allow-Credentials: true` and `Vary: Origin`. The handler answers each preflight. An origin that is not trusted gets no CORS header. The CORS is `credentialedCors()` of `@procedures/client/node`, on the CORS code of `procedureHandler`. It refuses `"*"` (CSRF). The new option `crossSiteCookies` of the configuration (`AUTH_CROSS_SITE_COOKIES=1`) gives the cookies `SameSite=None` and `Secure` for a page on another site. Without the new functions and options, nothing changes.
