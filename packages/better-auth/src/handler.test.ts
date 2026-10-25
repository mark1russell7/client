/**
 * The auth routes with credentialed CORS from the trusted origins of the host (CLI-49). The test
 * runs Better Auth with the options of `createBetterAuth` over the memory adapter. A page on a
 * trusted origin signs in, reads its session and posts, with its cookies. Another origin gets no
 * CORS header.
 */
import { describe, expect, it, afterEach } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { hostPolicy } from "@procedures/client";
import { betterAuthConfig, betterAuthFace, betterAuthHandler, type AuthRequestTracker, type BetterAuthServer } from "./index.js";
import { betterAuthOptions } from "./options.js";

/** The origin of the page: the dev port of an app. The server is on another port. */
const PAGE = "http://localhost:5173";
const EVIL = "https://evil.example";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/** The tables of Better Auth and of its plugins in the memory adapter. */
function memoryTables(): Record<string, Record<string, unknown>[]> {
  return { user: [], session: [], account: [], verification: [], organization: [], member: [], invitation: [], passkey: [] };
}

/**
 * This function starts a listener: the auth routes first, then a route of the app. The handler of
 * the listener comes from `mount`, after the listener has its port, because the base URL of Better
 * Auth names the port.
 */
async function start(
  mount: (auth: BetterAuthServer) => (req: IncomingMessage, res: ServerResponse) => boolean,
  env: Record<string, string> = {},
): Promise<string> {
  let handler: ((req: IncomingMessage, res: ServerResponse) => boolean) | undefined;
  const server: Server = createServer((req, res) => {
    if (handler?.(req, res)) return;
    res.statusCode = 200;
    res.end("the route of the app");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  const port = (server.address() as AddressInfo).port;
  const config = betterAuthConfig(
    { BETTER_AUTH_SECRET: "a-secret-of-the-test-0123456789", AUTH_TEST_ACCOUNTS: "1", AUTH_BASE_URL: `http://127.0.0.1:${port}`, ...env },
    { port, trustedOrigins: [PAGE] },
  );
  if (typeof config === "string") throw new Error(config);
  const options = betterAuthOptions(config, memoryAdapter(memoryTables()));
  // Better Auth turns its origin check off in a test environment: the test turns it on, as in production
  const auth = betterAuth({ ...options, advanced: { ...options.advanced, disableOriginCheck: false } }) as unknown as BetterAuthServer;
  handler = mount(auth);
  return `http://127.0.0.1:${port}`;
}

/** The CORS headers of a response. */
function corsOf(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (name.startsWith("access-control-")) headers[name] = value;
  });
  return headers;
}

/** The cookies of the Set-Cookie headers of a response, as a Cookie header. */
function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json", Origin: PAGE }, body: JSON.stringify(body) });

describe("betterAuthHandler (CLI-49)", () => {
  it("lets a page on a trusted origin sign in, read its session and post, with its cookies", async () => {
    const base = await start((auth) => betterAuthHandler(auth, { allowedOrigins: [PAGE] }));

    // The preflight of the POST of the sign-up
    const preflight = await fetch(`${base}/auth/sign-up/email`, {
      method: "OPTIONS",
      headers: { Origin: PAGE, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
    expect(preflight.status).toBe(204);
    expect(corsOf(preflight)).toMatchObject({
      "access-control-allow-origin": PAGE,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
    });
    expect(preflight.headers.get("vary")).toContain("Origin");

    // The sign-in: a test account signs up, and the response sets the session cookie
    const signUp = await fetch(`${base}/auth/sign-up/email`, json({ email: "alice@example.com", password: "a-long-password", name: "Alice" }));
    expect(signUp.status).toBe(200);
    expect(corsOf(signUp)).toMatchObject({ "access-control-allow-origin": PAGE, "access-control-allow-credentials": "true" });
    const cookie = cookiesOf(signUp);
    expect(cookie).toContain("session_token");

    // The session, with the cookies
    const session = await fetch(`${base}/auth/get-session`, { headers: { Origin: PAGE, Cookie: cookie } });
    expect(session.status).toBe(200);
    expect(corsOf(session)).toMatchObject({ "access-control-allow-origin": PAGE, "access-control-allow-credentials": "true" });
    expect(((await session.json()) as { user?: { email?: string } }).user?.email).toBe("alice@example.com");

    // A POST with the cookies: the sign-out
    const signOut = await fetch(`${base}/auth/sign-out`, { method: "POST", headers: { Origin: PAGE, Cookie: cookie } });
    expect(signOut.status).toBe(200);
    expect(corsOf(signOut)).toMatchObject({ "access-control-allow-origin": PAGE, "access-control-allow-credentials": "true" });

    // The other routes stay with the app
    expect(await (await fetch(`${base}/chat`)).text()).toBe("the route of the app");
  });

  it("sends no CORS header to an origin that is not trusted, also for its preflight", async () => {
    const base = await start((auth) => betterAuthHandler(auth, { allowedOrigins: [PAGE] }));
    const signUp = await fetch(`${base}/auth/sign-up/email`, json({ email: "bob@example.com", password: "a-long-password", name: "Bob" }));
    const cookie = cookiesOf(signUp);

    const preflight = await fetch(`${base}/auth/sign-out`, { method: "OPTIONS", headers: { Origin: EVIL, "Access-Control-Request-Method": "POST" } });
    expect(preflight.status).toBe(204);
    expect(corsOf(preflight)).toEqual({});
    const session = await fetch(`${base}/auth/get-session`, { headers: { Origin: EVIL, Cookie: cookie } });
    expect(corsOf(session)).toEqual({});
    // The CSRF check of Better Auth refuses the write of the other origin
    const signOut = await fetch(`${base}/auth/sign-out`, { method: "POST", headers: { Origin: EVIL, Cookie: cookie } });
    expect(signOut.status).toBe(403);
    expect(corsOf(signOut)).toEqual({});
    // Each answer varies by the origin, so a shared cache does not give it to a trusted origin
    for (const response of [preflight, session, signOut]) expect(response.headers.get("vary")).toContain("Origin");
  });

  it("gives the cookies SameSite=None and Secure for a page on another site", async () => {
    const base = await start((auth) => betterAuthHandler(auth, { allowedOrigins: [PAGE] }), { AUTH_CROSS_SITE_COOKIES: "1" });
    const signUp = await fetch(`${base}/auth/sign-up/email`, json({ email: "carol@example.com", password: "a-long-password", name: "Carol" }));
    const sessionCookie = signUp.headers.getSetCookie().find((cookie) => cookie.includes("session_token"));
    expect(sessionCookie).toMatch(/SameSite=None/i);
    expect(sessionCookie).toMatch(/; Secure/i);
  });

  it("takes the trusted origins of the policy of a procedures host as a face", async () => {
    const policy = hostPolicy({ browser: { allowedOrigins: [PAGE] } });
    let endpoint: unknown;
    const base = await start((auth) => {
      const face = betterAuthFace(auth)({ policy });
      endpoint = face.endpoint;
      return face.handler;
    });
    expect(endpoint).toEqual({ type: "auth", scheme: "http", path: "/auth" });
    const session = await fetch(`${base}/auth/get-session`, { headers: { Origin: PAGE } });
    expect(corsOf(session)).toMatchObject({ "access-control-allow-origin": PAGE, "access-control-allow-credentials": "true" });
    expect(corsOf(await fetch(`${base}/auth/get-session`, { headers: { Origin: EVIL } }))).toEqual({});
    // A policy that permits each origin cannot give credentialed CORS (CSRF)
    const open = hostPolicy({ browser: { allowedOrigins: "*" } });
    expect(() => betterAuthFace({ handler: async () => new Response() })({ policy: open })).toThrow(/not "\*"/);
  });

  it("keeps Origin in the Vary header of a route", async () => {
    const routes = async (): Promise<Response> => new Response("ok", { headers: { Vary: "Accept-Encoding" } });
    const base = await start(() => betterAuthHandler({ handler: routes }, { allowedOrigins: [PAGE] }));
    for (const origin of [PAGE, EVIL]) {
      const response = await fetch(`${base}/auth/ok`, { headers: { Origin: origin } });
      expect(response.headers.get("vary")).toBe("Accept-Encoding, Origin");
    }
    expect((await fetch(`${base}/auth/ok`, { headers: { Origin: PAGE } })).headers.get("access-control-allow-origin")).toBe(PAGE);
  });

  it("sends each request of the routes through the request tracking of the host, and no preflight (CLI-54)", async () => {
    const tracked: string[] = [];
    // A tracking of a host: it refuses the key "refused" with 503, as a host does after the stop of its intake
    const track: AuthRequestTracker = async (req, res, key, serve) => {
      tracked.push(`${req.method} ${key}`);
      if (key === "refused") {
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ code: "UNAVAILABLE", retryable: true }));
        return;
      }
      await serve(new AbortController().signal);
    };
    const routes = async (request: Request): Promise<Response> => new Response(new URL(request.url).pathname);
    const policy = hostPolicy({ browser: { allowedOrigins: [PAGE] } });
    const base = await start(() => betterAuthFace({ handler: routes })({ policy, track }).handler);
    expect(await (await fetch(`${base}/auth/get-session`, { headers: { Origin: PAGE } })).text()).toBe("/auth/get-session");
    expect(await (await fetch(`${base}/auth/sign-in/email`, { method: "POST", headers: { Origin: PAGE } })).text()).toBe("/auth/sign-in/email");
    const preflight = await fetch(`${base}/auth/sign-in/email`, { method: "OPTIONS", headers: { Origin: PAGE, "Access-Control-Request-Method": "POST" } });
    expect(preflight.status).toBe(204);
    // The CORS comes before the tracking, so the page can read a refusal
    const refused = await fetch(`${base}/auth/refused`, { method: "POST", headers: { Origin: PAGE } });
    expect(refused.status).toBe(503);
    expect(corsOf(refused)).toMatchObject({ "access-control-allow-origin": PAGE, "access-control-allow-credentials": "true" });
    expect(tracked).toEqual(["GET get-session", "POST sign-in/email", "POST refused"]);
  });

  it("takes only the requests under its path, and gives the middleware of an app", async () => {
    const handler = betterAuthHandler({ handler: async () => new Response("auth") }, { basePath: "/api/auth/" });
    expect(handler.basePath).toBe("/api/auth");
    expect(handler.matches({ url: "/api/auth/get-session?x=1" } as IncomingMessage)).toBe(true);
    expect(handler.matches({ url: "/api/auth" } as IncomingMessage)).toBe(true);
    expect(handler.matches({ url: "/api/authors" } as IncomingMessage)).toBe(false);
    let next = 0;
    handler.middleware({ url: "/chat" } as IncomingMessage, {} as ServerResponse, () => next++);
    expect(next).toBe(1);
  });

  it("removes each slash at the end of the base path, in linear time for a long run of slashes", () => {
    const routes = { handler: async () => new Response("auth") };
    expect(betterAuthHandler(routes, { basePath: "/api/auth///" }).basePath).toBe("/api/auth");
    expect(betterAuthHandler(routes, { basePath: "///" }).basePath).toBe("/");
    const started = performance.now();
    const long = betterAuthHandler(routes, { basePath: `/auth${"/".repeat(50_000)}x` });
    expect(performance.now() - started).toBeLessThan(100);
    expect(long.basePath.endsWith("/x")).toBe(true);
  });
});
