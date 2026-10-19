/**
 * A Better Auth server over MongoDB: the sign-in with GitHub and Google, the sessions in `httpOnly`
 * cookies, the groups (the organization plugin) and the passkeys (WebAuthn). The app stores no
 * password. Better Auth does the OAuth state, PKCE and the CSRF checks.
 *
 * Give Better Auth its own database: its `user` collection must not mix with the data of the app.
 * The app mounts `auth.handler` on `config.basePath` (`betterAuthHandler()`): the routes belong to the app.
 */
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import type { Db, MongoClient } from "mongodb";
import type { BetterAuthConfig } from "./config.js";
import { betterAuthOptions } from "./options.js";

/**
 * The parts of a Better Auth server that an app uses. Mount `handler` on `config.basePath` with
 * `betterAuthHandler()`, which adds the credentialed CORS of the trusted origins. `SessionPrincipals`
 * reads `api.getSession`.
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
  return betterAuth(betterAuthOptions(config, mongodbAdapter(db, { client })));
}
