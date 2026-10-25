import { describe, expect, it } from "vitest";
import { createBrowserAuth, type WebAuthnCeremonies } from "./browser.js";

interface Sent {
  url: string;
  method: string;
  credentials: string | undefined;
  body: unknown;
}

/** A fetch that answers from a table of path → [status, body], and records each call. */
function fakeServer(routes: Record<string, [number, unknown]>) {
  const sent: Sent[] = [];
  const fetch = (async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    const url = String(input);
    sent.push({ url, method: init?.method ?? "GET", credentials: init?.credentials, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const path = url.replace(/^https:\/\/api\.example\.com\/auth/, "");
    const [status, body] = routes[path] ?? [404, { message: "no such route" }];
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as typeof globalThis.fetch;
  return { fetch, sent };
}

const ceremonies = (fail = false): WebAuthnCeremonies => ({
  startRegistration: async () => {
    if (fail) throw new Error("the user cancelled");
    return { id: "credential" };
  },
  startAuthentication: async () => {
    if (fail) throw new Error("the user cancelled");
    return { id: "assertion" };
  },
});

describe("createBrowserAuth", () => {
  it("reads the user of the session, with the cookies, and undefined when signed out or on an error", async () => {
    const server = fakeServer({ "/get-session": [200, { user: { id: "u1", name: "Ana", email: "ana@example.com" }, session: {} }] });
    const auth = createBrowserAuth({ baseURL: "https://api.example.com/", fetch: server.fetch });
    expect(await auth.session()).toEqual({ id: "u1", name: "Ana", email: "ana@example.com" });
    expect(server.sent[0]).toMatchObject({ url: "https://api.example.com/auth/get-session", credentials: "include" });
    expect(await createBrowserAuth({ baseURL: "https://api.example.com", fetch: fakeServer({ "/get-session": [200, null] }).fetch }).session()).toBeUndefined();
    const broken = (async () => { throw new Error("offline"); }) as typeof fetch;
    expect(await createBrowserAuth({ baseURL: "https://api.example.com", fetch: broken }).session()).toBeUndefined();
  });

  it("gives the page of a provider, or the error of the server", async () => {
    const server = fakeServer({ "/sign-in/social": [200, { url: "https://github.com/login/oauth" }] });
    const auth = createBrowserAuth({ baseURL: "https://api.example.com", fetch: server.fetch });
    expect(await auth.signInSocial("github", "https://app.example.com/board")).toEqual({ url: "https://github.com/login/oauth" });
    expect(server.sent[0]).toMatchObject({ method: "POST", body: { provider: "github", callbackURL: "https://app.example.com/board", errorCallbackURL: "https://app.example.com/board" } });
    const refused = createBrowserAuth({ baseURL: "https://api.example.com", fetch: fakeServer({ "/sign-in/social": [400, { message: "unknown provider" }] }).fetch });
    expect(await refused.signInSocial("x", "https://app.example.com")).toEqual({ error: "unknown provider" });
  });

  it("signs out, and gives the HTTP status when the server gives no message", async () => {
    expect(await createBrowserAuth({ baseURL: "https://api.example.com", fetch: fakeServer({ "/sign-out": [200, { success: true }] }).fetch }).signOut()).toEqual({ signedOut: true });
    expect(await createBrowserAuth({ baseURL: "https://api.example.com", fetch: fakeServer({ "/sign-out": [500, undefined] }).fetch }).signOut()).toEqual({ error: "HTTP 500" });
  });

  it("makes a passkey: the options, the ceremony, then the verification with the name", async () => {
    const server = fakeServer({ "/passkey/generate-register-options": [200, { challenge: "c" }], "/passkey/verify-registration": [200, { ok: true }] });
    const auth = createBrowserAuth({ baseURL: "https://api.example.com", fetch: server.fetch, webauthn: ceremonies() });
    expect(await auth.addPasskey("My laptop")).toEqual({ added: true, name: "My laptop" });
    expect(server.sent.map((s) => s.url.split("/auth")[1])).toEqual(["/passkey/generate-register-options", "/passkey/verify-registration"]);
    expect(server.sent[1]!.body).toEqual({ response: { id: "credential" }, name: "My laptop" });
  });

  it("signs in with a passkey, and reports a cancelled ceremony without a verification", async () => {
    const routes: Record<string, [number, unknown]> = { "/passkey/generate-authenticate-options": [200, { challenge: "c" }], "/passkey/verify-authentication": [200, { ok: true }] };
    expect(await createBrowserAuth({ baseURL: "https://api.example.com", fetch: fakeServer(routes).fetch, webauthn: ceremonies() }).signInWithPasskey()).toEqual({ signedIn: true });
    const server = fakeServer(routes);
    const out = await createBrowserAuth({ baseURL: "https://api.example.com", fetch: server.fetch, webauthn: ceremonies(true) }).signInWithPasskey();
    expect(out).toEqual({ error: "no passkey was used: the user cancelled" });
    expect(server.sent).toHaveLength(1);
  });

  it("signs up and signs in with a password on a test server, with a name from the email", async () => {
    const server = fakeServer({ "/sign-up/email": [200, { user: { id: "u2" } }], "/sign-in/email": [401, { message: "invalid password" }] });
    const auth = createBrowserAuth({ baseURL: "https://api.example.com", fetch: server.fetch });
    expect(await auth.signInWithPassword({ email: "bo@example.com", password: "pw", signUp: true })).toEqual({ signedIn: true, user: "u2" });
    expect(server.sent[0]!.body).toEqual({ email: "bo@example.com", password: "pw", name: "bo" });
    expect(await auth.signInWithPassword({ email: "bo@example.com", password: "bad" })).toEqual({ error: "invalid password" });
  });

  it("takes another base path", async () => {
    const server = fakeServer({});
    await createBrowserAuth({ baseURL: "", basePath: "/api/auth", fetch: server.fetch }).signOut();
    expect(server.sent[0]!.url).toBe("/api/auth/sign-out");
  });

  it("removes each slash at the end of the base URL, in linear time for a long run of slashes", async () => {
    const server = fakeServer({ "/sign-out": [200, { success: true }] });
    await createBrowserAuth({ baseURL: "https://api.example.com///", fetch: server.fetch }).signOut();
    expect(server.sent[0]!.url).toBe("https://api.example.com/auth/sign-out");
    const started = performance.now();
    createBrowserAuth({ baseURL: `https://api.example.com${"/".repeat(50_000)}x`, fetch: server.fetch });
    expect(performance.now() - started).toBeLessThan(100);
  });
});
