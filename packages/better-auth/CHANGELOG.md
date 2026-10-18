# @procedures/better-auth

## 0.12.1

### Patch Changes

- 06291ae: New package `@procedures/better-auth`: the sign-in of a procedures server with Better Auth over MongoDB (GitHub, Google, passkeys and the organizations as groups), and the request hook `betterAuthPrincipalOf`. The hook gives the principal of a session cookie or of an agent token. The agent can act for a user when the `actAs` policy permits it. A request without a user is refused, unless the option `anonymous` gives its narrowing. `betterAuthConfig` reads the environment, `createBetterAuth` makes the server, and `SessionPrincipals` gives the user of a session with a short memo. The code comes from the server of Graph (its split plan, part P5).
- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1
