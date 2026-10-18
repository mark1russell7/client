---
"@procedures/better-auth": patch
---

New: the browser entry `@procedures/better-auth/browser` (Graph's split, wave 2, W8). `createBrowserAuth({ baseURL })` gives the calls of a page to the auth routes: the session, the sign-in with a provider, the sign-out, the passkeys, and the sign-in with a password on a test server. It has no framework. The passkeys load `@simplewebauthn/browser` only when they operate.
