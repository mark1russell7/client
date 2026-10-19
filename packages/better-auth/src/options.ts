/**
 * The options of Better Auth for a configuration and a database adapter. `createBetterAuth` gives
 * them the MongoDB adapter, and a test gives them the memory adapter. The package root does not
 * export this module.
 */
import type { BetterAuthOptions } from "better-auth";
import { organization } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import type { BetterAuthConfig } from "./config.js";

/** This function gives the options of Better Auth for a configuration and a database adapter. */
export function betterAuthOptions(config: BetterAuthConfig, database: BetterAuthOptions["database"]): BetterAuthOptions {
  const testHooks = {
    user: {
      create: {
        before: async (user: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> => ({ data: { ...user, emailVerified: true } }),
      },
    },
  };
  return {
    appName: config.appName,
    basePath: config.basePath,
    baseURL: config.baseURL,
    secret: config.secret,
    database: database,
    trustedOrigins: [...config.trustedOrigins],
    socialProviders: {
      ...(config.github ? { github: { ...config.github } } : {}),
      ...(config.google ? { google: { ...config.google } } : {}),
    },
    emailAndPassword: { enabled: config.testAccounts },
    // A test account has no email check: the test server trusts its email
    ...(config.testAccounts ? { databaseHooks: testHooks } : {}),
    // A page on another site sends a cookie only with SameSite=None, and a browser keeps such a cookie only when it is Secure (CLI-49)
    ...(config.crossSiteCookies === true ? { advanced: { defaultCookieAttributes: { sameSite: "none" as const, secure: true } } } : {}),
    // The passkeys expect the origins of the app, not the Origin header of each request
    plugins: [organization(), passkey({ rpID: config.rpID, rpName: config.appName, origin: [...config.trustedOrigins] })],
  };
}
