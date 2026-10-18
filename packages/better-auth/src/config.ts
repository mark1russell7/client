/**
 * The configuration of a Better Auth server from the environment.
 *
 * - `BETTER_AUTH_SECRET`: the secret that signs the session cookies (16 characters or more).
 * - `AUTH_BASE_URL`: the public origin of the server (default `http://localhost:<port>`).
 * - `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: the sign-in with GitHub.
 * - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the sign-in with Google.
 * - `AUTH_TEST_ACCOUNTS=1`: accounts with an email and a password, for the tests. Production refuses it.
 * - `PASSKEY_RP_ID`: the domain of the passkeys (default: the host of the first trusted origin).
 */

/** The client id and the secret of an OAuth provider. */
export interface OAuthClient {
  readonly clientId: string;
  readonly clientSecret: string;
}

/** The configuration that `createBetterAuth` reads. */
export interface BetterAuthConfig {
  /** The name of the app. Passkeys show it. */
  readonly appName: string;
  /** The path of the auth routes (default `/auth`). */
  readonly basePath: string;
  readonly secret: string;
  readonly baseURL: string;
  /** The origins of the app. The CSRF checks and the passkeys accept only these origins. */
  readonly trustedOrigins: readonly string[];
  readonly github?: OAuthClient | undefined;
  readonly google?: OAuthClient | undefined;
  /** Accounts with an email and a password, for the tests. Their email counts as verified. */
  readonly testAccounts: boolean;
  /** The relying party of the passkeys: a domain of the origins of the app. */
  readonly rpID: string;
}

/** The options of `betterAuthConfig`. */
export interface BetterAuthConfigOptions {
  /** The port of the server, for the default base URL. */
  readonly port: number;
  /** The origins of the app. */
  readonly trustedOrigins: readonly string[];
  /** The name of the app (default "App"). */
  readonly appName?: string | undefined;
  /** The path of the auth routes (default `/auth`). */
  readonly basePath?: string | undefined;
}

/** This function reads the configuration from the environment. It gives a message when the server cannot start. */
export function betterAuthConfig(env: Readonly<Record<string, string | undefined>>, options: BetterAuthConfigOptions): BetterAuthConfig | string {
  const secret = env["BETTER_AUTH_SECRET"] ?? "";
  if (secret.length < 16) return "BETTER_AUTH_SECRET must have 16 characters or more";
  if (env["NODE_ENV"] === "production" && env["AUTH_TEST_ACCOUNTS"] === "1") return "AUTH_TEST_ACCOUNTS is refused in production";
  const pair = (id: string, key: string): OAuthClient | undefined => {
    const clientId = env[id];
    const clientSecret = env[key];
    return clientId && clientSecret ? { clientId, clientSecret } : undefined;
  };
  let firstHost = "localhost";
  try {
    firstHost = new URL(options.trustedOrigins[0] ?? "http://localhost").hostname;
  } catch {
    // An origin that is not a URL: the passkeys use localhost
  }
  const github = pair("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET");
  const google = pair("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
  return {
    appName: options.appName ?? "App",
    basePath: options.basePath ?? "/auth",
    secret,
    baseURL: env["AUTH_BASE_URL"] || `http://localhost:${options.port}`,
    trustedOrigins: options.trustedOrigins,
    ...(github ? { github } : {}),
    ...(google ? { google } : {}),
    testAccounts: env["AUTH_TEST_ACCOUNTS"] === "1",
    rpID: env["PASSKEY_RP_ID"] || firstHost,
  };
}
