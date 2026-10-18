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

## The browser

`@procedures/better-auth/browser` gives the calls of a page to the auth routes of the server. It has no framework and no global state. Each function gives data, and the app decides what the page does next.

```ts
import { createBrowserAuth } from "@procedures/better-auth/browser";

// The page and the server have one origin (or a proxy gives the server under the origin of the page)
const auth = createBrowserAuth({ baseURL: "" });
const user = await auth.session(); // undefined when signed out
const out = await auth.signInSocial("github", location.href);
if ("url" in out) location.assign(out.url);
```

| Function | What it does |
| --- | --- |
| `session()` | The signed-in user of this browser: `id`, `name` and `email`. A server that does not answer in time gives `undefined`. |
| `signInSocial(provider, callbackURL)` | The page of the provider. The provider comes back to `callbackURL`. |
| `signOut()` | This function ends the session. |
| `addPasskey(name)` | This function makes a passkey of this device for the signed-in user. |
| `signInWithPasskey()` | This function signs in with a passkey of this device. |
| `signInWithPassword(input)` | A test server only (`AUTH_TEST_ACCOUNTS`): a sign-in, or a sign-up with `signUp: true`. |

- Each call sends the cookies. The session cookie is `httpOnly`, so a script of the page cannot read it.
- Give the page and the server one origin. A proxy under the origin of the page also works. This is the simplest form.
- A server on another origin needs CORS that names exactly one trusted origin, with `Access-Control-Allow-Credentials: true`. The server of this package does not send these headers. Without them, `session()` gives `undefined` and the other calls fail.
- A server on another site also needs the cookie attributes `SameSite=None` and `Secure`.
- A refused call gives `{ error }`. The functions do not throw for an answer of the server.
- The passkeys use `@simplewebauthn/browser`, which loads only when a passkey function operates.

## The principal of a request

`SessionPrincipals` gives the user of a session cookie: the id, the verified email, the name and the groups. A short memo keeps the boot of a page to one session lookup.

`betterAuthPrincipalOf` gives the request hook (`principalOf`) of a procedures server. The app maps each kind of principal to a capability:

```ts
import { betterAuthPrincipalOf, SessionPrincipals, VIA } from "@procedures/better-auth";

const READ_ONLY = { effects: { writes: [] } };
const principals = new SessionPrincipals({ auth, db: client.db("example-auth") });
const server = createProcedureServer({
  // No `token`: the hook checks the agent token, and a cookie session has no bearer token
  principalOf: betterAuthPrincipalOf({
    principals,
    agentToken: process.env.AGENT_TOKEN,
    // The agent acts only for users who own no group
    actAs: (user) => !user.groups.some((group) => group.role === "owner"),
    // A visitor without a session can read, and change nothing
    anonymous: READ_ONLY,
  }),
  capability: (request) => (request.principal?.via === VIA.anonymous ? READ_ONLY : {}),
});
```

| The request has | The principal |
| --- | --- |
| The agent token as the bearer token | `{ id: "agent", via: "agent-token" }` |
| The agent token and the header `x-act-as: <user id>` | The user, with `via: "agent-as"` and the claims `agent: true` and `actAs`. The `actAs` policy must permit the user. Without the policy, the hook refuses the request. |
| A session cookie | The user, with `via: "better-auth"` and the claims `email`, `name` and `groups` |
| Nothing of the above | With `anonymous`: `{ id: "anonymous", via: "anonymous" }` and that narrowing. Without it (the default): no principal, and the server refuses the request. |

- An act-as request for an unknown user gets the anonymous principal (`via: "anonymous"`), or a refusal without `anonymous`. A refused act-as gets no principal. It does not get the principal of the agent.
- A bearer token that is not the agent token goes on to the token check of the server.
- Do not give the server a `token` with this hook. The token check of the server operates after the hook, and a cookie session has no bearer token.
- The procedures read the principal as `ctx.principal`. The rights of the app stay in the app.
- The hook compares the agent token in constant time with `tokenMatches` of `@procedures/client`.
