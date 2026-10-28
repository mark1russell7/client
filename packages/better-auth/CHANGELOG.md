# @procedures/better-auth

## 0.46.0

### Patch Changes

- Updated dependencies [10dcc3c]
  - @procedures/client@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [fbb50fa]
- Updated dependencies [845902b]
- Updated dependencies [70b2245]
  - @procedures/client@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [4dada47]
- Updated dependencies [19b7a25]
  - @procedures/client@0.44.0

## 0.43.0

### Patch Changes

- @procedures/client@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [7ca9953]
- Updated dependencies [226ae02]
- Updated dependencies [e4cb0cf]
  - @procedures/client@0.42.0

## 0.41.1

### Patch Changes

- Updated dependencies [69cee92]
  - @procedures/client@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies [37deb07]
- Updated dependencies [fc52431]
  - @procedures/client@0.41.0

## 0.40.0

### Patch Changes

- @procedures/client@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [55d1e4d]
  - @procedures/client@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [c6fba49]
  - @procedures/client@0.38.0

## 0.37.0

### Patch Changes

- @procedures/client@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [f1fae86]
  - @procedures/client@0.36.0

## 0.35.1

### Patch Changes

- Updated dependencies [9f0405d]
- Updated dependencies [f5c2407]
  - @procedures/client@0.35.1

## 0.35.0

### Patch Changes

- @procedures/client@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [d4376c2]
- Updated dependencies [fa1a61a]
  - @procedures/client@0.34.0

## 0.33.0

### Patch Changes

- @procedures/client@0.33.0

## 0.32.0

### Patch Changes

- @procedures/client@0.32.0

## 0.31.0

### Patch Changes

- @procedures/client@0.31.0

## 0.30.0

### Patch Changes

- @procedures/client@0.30.0

## 0.29.0

### Patch Changes

- @procedures/client@0.29.0

## 0.28.1

### Patch Changes

- Updated dependencies [345c740]
- Updated dependencies [984c13b]
- Updated dependencies [21dc858]
  - @procedures/client@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [06694d7]
  - @procedures/client@0.28.0

## 0.27.8

### Patch Changes

- Updated dependencies [1834a5e]
  - @procedures/client@0.27.8

## 0.27.7

### Patch Changes

- @procedures/client@0.27.7

## 0.27.6

### Patch Changes

- d322bef: Fixes for the findings of the first code scan (roadmap O54).
  
  PATCH: bug fixes. A caller that used the documented behavior sees no change.
  
  - The route of `HttpServerTransport` now matches each character of `basePath` only as itself. Before, the route escaped only `/`, so a backslash or another special character of a regular expression in the base path changed the paths that the route took, and a parenthesis made the constructor throw. The test in `route.test.ts` pins this.
  - `betterAuthHandler()` and `createBrowserAuth()` of `@procedures/better-auth` remove the slashes at the end of `basePath` and `baseURL` with a loop, not with a regular expression. A long base path now takes linear time.
  - `@procedures/llm` removes the slashes at the end of `baseUrl` with a loop. `parseAnswer()` removes a code fence around the answer with a small parser, not with a regular expression. The results for each valid answer stay the same, and a long answer now takes linear time.
  - `mark` reads a number and a negative number with regular expressions that have one match for each text. The numbers that `mark` takes stay the same, and a long run of digits now takes linear time.
  - `procedure.new` of `@procedures/procedure` escapes each special character of a variable name in its search for the array of the procedures. It reads the names of an import without a regular expression that takes polynomial time on a long run of spaces.
  - The lockfile now resolves `zod` 4.6.7 and `body-parser` 2.4.0 (through `express`), which fix two published advisories. The dependency ranges do not change.
- Updated dependencies [d322bef]
  - @procedures/client@0.27.6

## 0.27.5

### Patch Changes

- @procedures/client@0.27.5

## 0.27.4

### Patch Changes

- Updated dependencies [8970a1e]
  - @procedures/client@0.27.4

## 0.27.3

### Patch Changes

- @procedures/client@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1

## 0.24.0

### Patch Changes

- @procedures/client@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1

## 0.22.0

### Patch Changes

- @procedures/client@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0

## 0.17.4

### Patch Changes

- @procedures/client@0.17.4

## 0.17.3

### Patch Changes

- @procedures/client@0.17.3

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
