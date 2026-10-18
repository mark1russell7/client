---
"@procedures/better-auth": patch
---

New package `@procedures/better-auth`: the sign-in of a procedures server with Better Auth over MongoDB (GitHub, Google, passkeys and the organizations as groups), and the request hook `betterAuthPrincipalOf`. The hook gives the principal of a session cookie, of an agent token, or of the agent that acts for a user. `betterAuthConfig` reads the environment, `createBetterAuth` makes the server, and `SessionPrincipals` gives the user of a session with a short memo. The code comes from the server of Graph (its split plan, part P5).
