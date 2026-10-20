# @procedures/better-auth

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1

## 0.17.0

### Patch Changes

- @procedures/client@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0

## 0.14.1

### Patch Changes

- fc968f6: Fixed: `@procedures/geo`, `@procedures/ics` and `@procedures/splay` import `@procedures/client/browser`, not the root of `@procedures/client` (CLI-39). The root also exports `HttpServerTransport`, which imports `http`. Thus a browser build with Vite found `http` and gave a warning. The exports of the packages do not change.
  
  New: each package that operates in a browser names its browser entries in the field `client.browser` of its `package.json`. A CI check bundles each of these entries for a browser with esbuild. The check fails when an import reaches a Node built-in, with or without the prefix `node:`. The root of `@procedures/client` joins the check after CLI-6. `@procedures/splay` joins it when `splay.bridge.info` reads its version without `node:fs/promises`.
- e091108: New: credentialed CORS for the auth routes, from the trusted origins of the host (CLI-49). The handler of Better Auth sends no CORS headers, so a page on another origin got no session and failed POST requests. `betterAuthHandler(auth, { allowedOrigins })` gives the Node handler of the auth routes with credentialed CORS. `betterAuthFace(auth)` gives it as a face of a procedures host, with `browser.allowedOrigins` of the host policy. Thus one list of trusted origins drives `procedureHandler` and the auth routes. A response for a trusted origin names that one origin, with `Access-Control-Allow-Credentials: true` and `Vary: Origin`. The handler answers each preflight. An origin that is not trusted gets no CORS header. The CORS is `credentialedCors()` of `@procedures/client/node`, on the CORS code of `procedureHandler`. It refuses `"*"` (CSRF). The new option `crossSiteCookies` of the configuration (`AUTH_CROSS_SITE_COOKIES=1`) gives the cookies `SameSite=None` and `Secure` for a page on another site. Without the new functions and options, nothing changes.
- 66ab24c: New: the requests of the auth face go through the request tracking of the procedures host (CLI-54). Before, `betterAuthFace()` served its routes outside the tracking, so the stop of the host could cut a sign-in after Better Auth wrote the session and before the answer. The context of each face of `createProcedureHost()` now has `track`: a function that does the work of one HTTP request through `life.request`, on the route `<face> <key>` of the controller of the host. Thus the route pattern of the face (`auth *`) applies. A request after the stop of the intake gets 503, the drain waits for a request in flight, and the readiness of the controller applies. `httpTracker()` gives this function, and `betterAuthHandler()` has the new option `track`. A preflight does not go through the tracking. Without a service, each request starts directly, as before.
- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
  - @procedures/client@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2

## 0.13.1

### Patch Changes

- 746dee6: New: the browser entry `@procedures/better-auth/browser` (Graph's split, wave 2, W8). `createBrowserAuth({ baseURL })` gives the calls of a page to the auth routes: the session, the sign-in with a provider, the sign-out, the passkeys, and the sign-in with a password on a test server. It has no framework. The passkeys load `@simplewebauthn/browser` only when they operate.
- @procedures/client@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2

## 0.12.1

### Patch Changes

- 06291ae: New package `@procedures/better-auth`: the sign-in of a procedures server with Better Auth over MongoDB (GitHub, Google, passkeys and the organizations as groups), and the request hook `betterAuthPrincipalOf`. The hook gives the principal of a session cookie or of an agent token. The agent can act for a user when the `actAs` policy permits it. A request without a user is refused, unless the option `anonymous` gives its narrowing. `betterAuthConfig` reads the environment, `createBetterAuth` makes the server, and `SessionPrincipals` gives the user of a session with a short memo. The code comes from the server of Graph (its split plan, part P5).
- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1
