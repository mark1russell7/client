# @procedures/better-auth

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
