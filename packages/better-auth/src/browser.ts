/**
 * The browser half of the sign-in (Graph's split, wave 2, W8): the calls of a page to the auth routes of a
 * procedures server with Better Auth. This entry has no framework and no global state: each function gives data,
 * and the app decides what the page does (a redirect, a reload).
 *
 * - The session cookie is `httpOnly`, so each call sends the cookies (`credentials: "include"`).
 * - The passkeys use WebAuthn through `@simplewebauthn/browser`. It loads only when a passkey function runs.
 * - The functions give `{ error }` for a refused or failed call. They do not throw for an answer of the server.
 *
 * Import it as `@procedures/better-auth/browser`. The package root is for the server.
 */

/** A signed-in user, as the session route gives it. */
export interface BrowserUser {
  readonly id: string;
  readonly name?: string | undefined;
  readonly email?: string | undefined;
}

/** A refused or failed call. */
export interface BrowserAuthError {
  readonly error: string;
}

/** The WebAuthn ceremonies. The default is `@simplewebauthn/browser`. A test gives its own. */
export interface WebAuthnCeremonies {
  startRegistration(options: { optionsJSON: unknown }): Promise<unknown>;
  startAuthentication(options: { optionsJSON: unknown }): Promise<unknown>;
}

/** The options of `createBrowserAuth`. */
export interface BrowserAuthOptions {
  /** The origin of the server, for example `https://api.example.com`. An empty text is the origin of the page. */
  readonly baseURL: string;
  /** The path of the auth routes. The default is `/auth`, as `betterAuthConfig` gives it. */
  readonly basePath?: string | undefined;
  /** The fetch of the calls. The default is the fetch of the page. */
  readonly fetch?: typeof fetch | undefined;
  /** The WebAuthn ceremonies of the passkeys. */
  readonly webauthn?: WebAuthnCeremonies | undefined;
  /** The longest wait of `session()`, in milliseconds. The default is 4000. */
  readonly sessionTimeoutMs?: number | undefined;
}

/** The sign-in calls of a page. */
export interface BrowserAuth {
  /** The signed-in user of this browser, or undefined (signed out, or the server did not answer in time). */
  session(): Promise<BrowserUser | undefined>;
  /** The page of the provider: the app goes to `url`. After the sign-in, the provider comes back to `callbackURL`. */
  signInSocial(provider: string, callbackURL: string, errorCallbackURL?: string): Promise<{ readonly url: string } | BrowserAuthError>;
  /** This method ends the session. The app then loads the page again. */
  signOut(): Promise<{ readonly signedOut: true } | BrowserAuthError>;
  /** This method makes a passkey of this device for the signed-in user. */
  addPasskey(name: string): Promise<{ readonly added: true; readonly name: string } | BrowserAuthError>;
  /** This method signs in with a passkey of this device. The app then loads the page again. */
  signInWithPasskey(): Promise<{ readonly signedIn: true } | BrowserAuthError>;
  /** A test server only (`AUTH_TEST_ACCOUNTS`): a sign-in, or a sign-up, with an email and a password. */
  signInWithPassword(input: { email: string; password: string; name?: string | undefined; signUp?: boolean | undefined }): Promise<{ readonly signedIn: true; readonly user?: string | undefined } | BrowserAuthError>;
}

interface Answer {
  ok: boolean;
  status: number;
  json: Record<string, unknown> | undefined;
}

const errorOf = (answer: Answer): BrowserAuthError => ({
  error: typeof answer.json?.["message"] === "string" ? answer.json["message"] : `HTTP ${answer.status}`,
});

/**
 * This function gives the sign-in calls of a page to a server.
 *
 * @example
 * ```ts
 * const auth = createBrowserAuth({ baseURL: "https://api.example.com" });
 * const user = await auth.session();
 * const out = await auth.signInSocial("github", location.href);
 * if ("url" in out) location.assign(out.url);
 * ```
 */
export function createBrowserAuth(options: BrowserAuthOptions): BrowserAuth {
  const base = `${options.baseURL.replace(/\/+$/, "")}${options.basePath ?? "/auth"}`;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = options.sessionTimeoutMs ?? 4000;
  let ceremonies: Promise<WebAuthnCeremonies> | undefined;
  const webauthn = (): Promise<WebAuthnCeremonies> =>
    (ceremonies ??= options.webauthn ? Promise.resolve(options.webauthn) : import("@simplewebauthn/browser") as Promise<WebAuthnCeremonies>);

  const call = async (path: string, init: RequestInit = {}): Promise<Answer> => {
    const response = await doFetch(`${base}${path}`, { credentials: "include", ...init });
    let json: Record<string, unknown> | undefined;
    try {
      const body: unknown = await response.json();
      json = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : undefined;
    } catch {
      json = undefined;
    }
    return { ok: response.ok, status: response.status, json };
  };
  const post = (path: string, body: unknown): Promise<Answer> =>
    call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

  return {
    async session() {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const answer = await call("/get-session", { signal: abort.signal });
        const user = answer.ok ? (answer.json?.["user"] as Record<string, unknown> | undefined) : undefined;
        if (!user || (typeof user["id"] !== "string" && typeof user["id"] !== "number")) return undefined;
        return {
          id: String(user["id"]),
          ...(typeof user["name"] === "string" && user["name"] ? { name: user["name"] } : {}),
          ...(typeof user["email"] === "string" && user["email"] ? { email: user["email"] } : {}),
        };
      } catch {
        return undefined;
      } finally {
        clearTimeout(timer);
      }
    },

    async signInSocial(provider, callbackURL, errorCallbackURL = callbackURL) {
      const answer = await post("/sign-in/social", { provider, callbackURL, errorCallbackURL });
      const url = answer.json?.["url"];
      return answer.ok && typeof url === "string" ? { url } : errorOf(answer);
    },

    async signOut() {
      const answer = await post("/sign-out", {});
      return answer.ok ? { signedOut: true as const } : errorOf(answer);
    },

    async addPasskey(name) {
      const options = await call("/passkey/generate-register-options");
      if (!options.ok) return errorOf(options);
      let response: unknown;
      try {
        response = await (await webauthn()).startRegistration({ optionsJSON: options.json });
      } catch (error) {
        return { error: `the passkey was not made: ${(error as Error).message}` };
      }
      const answer = await post("/passkey/verify-registration", { response, name });
      return answer.ok ? { added: true as const, name } : errorOf(answer);
    },

    async signInWithPasskey() {
      const options = await call("/passkey/generate-authenticate-options");
      if (!options.ok) return errorOf(options);
      let response: unknown;
      try {
        response = await (await webauthn()).startAuthentication({ optionsJSON: options.json });
      } catch (error) {
        return { error: `no passkey was used: ${(error as Error).message}` };
      }
      const answer = await post("/passkey/verify-authentication", { response });
      return answer.ok ? { signedIn: true as const } : errorOf(answer);
    },

    async signInWithPassword({ email, password, name, signUp }) {
      const path = signUp ? "/sign-up/email" : "/sign-in/email";
      const answer = await post(path, { email, password, ...(signUp ? { name: name || email.split("@")[0] } : {}) });
      if (!answer.ok) return errorOf(answer);
      const user = answer.json?.["user"] as Record<string, unknown> | undefined;
      return { signedIn: true as const, ...(user && typeof user["id"] === "string" ? { user: user["id"] } : {}) };
    },
  };
}
