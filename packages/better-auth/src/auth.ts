/**
 * A Better Auth server over MongoDB: the sign-in with GitHub and Google, the sessions in `httpOnly`
 * cookies, the groups (the organization plugin) and the passkeys (WebAuthn). The app stores no
 * password. Better Auth does the OAuth state, PKCE and the CSRF checks.
 *
 * Give Better Auth its own database: its `user` collection must not mix with the data of the app.
 * The app mounts `auth.handler` on `config.basePath`: the routes belong to the app.
 */
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { organization } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import type { Db, MongoClient } from "mongodb";
import type { BetterAuthConfig } from "./config.js";

/**
 * The parts of a Better Auth server that an app uses. Mount `handler` on `config.basePath`, for
 * example with `toNodeHandler` of `better-auth/node`. `SessionPrincipals` reads `api.getSession`.
 */
export interface BetterAuthServer {
  /** The handler of the auth routes. */
  readonly handler: (request: Request) => Promise<Response>;
  readonly api: {
    /** The session and the user of the cookies of a request, or null. */
    getSession(context: { headers: Headers }): Promise<{ user: Record<string, unknown>; session: Record<string, unknown> } | null>;
  };
}

/** This function makes the Better Auth server of a configuration. */
export function createBetterAuth(db: Db, client: MongoClient, config: BetterAuthConfig): BetterAuthServer {
  const testHooks = {
    user: {
      create: {
        before: async (user: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> => ({ data: { ...user, emailVerified: true } }),
      },
    },
  };
  return betterAuth({
    appName: config.appName,
    basePath: config.basePath,
    baseURL: config.baseURL,
    secret: config.secret,
    database: mongodbAdapter(db, { client }),
    trustedOrigins: [...config.trustedOrigins],
    socialProviders: {
      ...(config.github ? { github: { ...config.github } } : {}),
      ...(config.google ? { google: { ...config.google } } : {}),
    },
    emailAndPassword: { enabled: config.testAccounts },
    // A test account has no email check: the test server trusts its email
    ...(config.testAccounts ? { databaseHooks: testHooks } : {}),
    // The passkeys expect the origins of the app, not the Origin header of each request
    plugins: [organization(), passkey({ rpID: config.rpID, rpName: config.appName, origin: [...config.trustedOrigins] })],
  });
}
