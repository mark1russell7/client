# @procedures/better-auth

[![npm](https://img.shields.io/npm/v/@procedures/better-auth?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/better-auth)

```sh
npm install @procedures/better-auth @procedures/client mongodb
```

The sign-in of a procedures server with [Better Auth](https://www.better-auth.com) over MongoDB, and the request hook that gives the principal of each request.

- The people sign in with GitHub, Google or a passkey. The app stores no password.
- Better Auth keeps the sessions in `httpOnly` cookies, and does the OAuth state, PKCE and the CSRF checks.
- The organizations of Better Auth are the groups of a user.
- An agent token lets a program act as the agent, or for one user with the rights of that user.

The package has no procedures. The package root registers nothing.

## The server

`betterAuthConfig` reads the environment. `createBetterAuth` makes the server. Give Better Auth its own database: its `user` collection must not mix with the data of the app.

```ts
import { betterAuthConfig, createBetterAuth } from "@procedures/better-auth";
import { toNodeHandler } from "better-auth/node";

const config = betterAuthConfig(process.env, { port: 9091, trustedOrigins: ["https://app.example.com"], appName: "Example" });
if (typeof config === "string") throw new Error(config);
const auth = createBetterAuth(client.db("example-auth"), client, config);
app.all("/auth/*path", toNodeHandler(auth)); // the routes belong to the app
```

| Variable | Use |
| --- | --- |
| `BETTER_AUTH_SECRET` | The secret that signs the session cookies, with 16 characters or more. It is necessary. |
| `AUTH_BASE_URL` | The public origin of the server. The default is `http://localhost:<port>`. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | The sign-in with GitHub. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The sign-in with Google. |
| `PASSKEY_RP_ID` | The domain of the passkeys. The default is the host of the first trusted origin. |
| `AUTH_TEST_ACCOUNTS=1` | Accounts with an email and a password, for the tests. Their email counts as verified. Production refuses it. |

## The principal of a request

`SessionPrincipals` gives the user of a session cookie: the id, the verified email, the name and the groups. A short memo keeps the boot of a page to one session lookup.

`betterAuthPrincipalOf` gives the request hook (`principalOf`) of a procedures server:

```ts
import { betterAuthPrincipalOf, SessionPrincipals } from "@procedures/better-auth";

const principals = new SessionPrincipals({ auth, db: client.db("example-auth") });
const server = createProcedureServer({
  principalOf: betterAuthPrincipalOf({ principals, agentToken: process.env.AGENT_TOKEN }),
});
```

| The request has | The principal |
| --- | --- |
| The agent token as the bearer token | `{ id: "agent", via: "agent-token" }` |
| The agent token and the header `x-act-as: <user id>` | The user, with `via: "agent-as"` and the claim `agent: true`. An unknown user gives the anonymous principal. |
| A session cookie | The user, with `via: "better-auth"` and the claims `email`, `name` and `groups` |
| Nothing of the above | `{ id: "anonymous", via: "anonymous" }`, or no principal with `anonymous: false` |

- A bearer token that is not the agent token goes on to the token check of the server.
- The procedures read the principal as `ctx.principal`. The rights of the app stay in the app.
- The agent token is compared in constant time with `tokenMatches` of `@procedures/client`.
