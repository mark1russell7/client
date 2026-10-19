/**
 * The credentialed CORS of the trusted origins of a host (CLI-49): `credentialedCors()` names one
 * trusted origin with credentials and `Vary: Origin`, answers the preflight, and sends no CORS
 * header to another origin. It is the CORS of `procedureHandler`, for a route of the app.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { credentialedCors, type CredentialedCorsOptions } from "./cors.js";
import type { BrowserGuardOptions } from "../../../server/browser-guard.js";
import { seconds } from "../../../duration.js";

const TRUSTED = "http://localhost:5173";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/** A listener of the test: the CORS, then a route of the app that counts its requests. */
async function start(allowedOrigins: BrowserGuardOptions["allowedOrigins"], options?: CredentialedCorsOptions): Promise<{ port: number; routed: () => number }> {
  const cors = credentialedCors(allowedOrigins, options);
  let routed = 0;
  const server: Server = createServer((req, res) => {
    if (cors(req, res)) return;
    routed++;
    res.statusCode = 200;
    res.end("the route of the app");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { port: (server.address() as AddressInfo).port, routed: () => routed };
}

async function send(port: number, method: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path: "/auth/get-session", headers }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

/** The CORS headers of a response. */
function corsHeaders(headers: IncomingHttpHeaders): string[] {
  return Object.keys(headers).filter((name) => name.startsWith("access-control-"));
}

describe("credentialedCors (CLI-49)", () => {
  it("names one trusted origin with credentials and Vary: Origin", async () => {
    const { port, routed } = await start(["https://app.example", TRUSTED]);
    const response = await send(port, "GET", { origin: TRUSTED });
    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(TRUSTED);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["vary"]).toBe("Origin");
    expect(routed()).toBe(1);
  });

  it("sends no CORS header to an origin that is not trusted, or to a request without an origin", async () => {
    const { port, routed } = await start([TRUSTED]);
    const other = await send(port, "GET", { origin: "https://evil.example" });
    expect(other.status).toBe(200);
    expect(corsHeaders(other.headers)).toEqual([]);
    const plain = await send(port, "GET");
    expect(corsHeaders(plain.headers)).toEqual([]);
    // The route of the app decides: the CORS refuses no request
    expect(routed()).toBe(2);
  });

  it("answers the preflight of a trusted origin with the methods and the headers, and of another origin without CORS", async () => {
    const { port, routed } = await start([TRUSTED], { methods: ["GET", "POST"], allowedHeaders: ["Content-Type"], maxAge: seconds(60) });
    const preflight = await send(port, "OPTIONS", { origin: TRUSTED, "access-control-request-method": "POST", "access-control-request-headers": "content-type" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(TRUSTED);
    expect(preflight.headers["access-control-allow-credentials"]).toBe("true");
    expect(preflight.headers["access-control-allow-methods"]).toBe("GET, POST");
    expect(preflight.headers["access-control-allow-headers"]).toBe("Content-Type");
    expect(preflight.headers["access-control-max-age"]).toBe("60");
    expect(preflight.headers["vary"]).toBe("Origin");
    const other = await send(port, "OPTIONS", { origin: "https://evil.example", "access-control-request-method": "POST" });
    expect(other.status).toBe(204);
    expect(corsHeaders(other.headers)).toEqual([]);
    // No preflight reaches the route of the app
    expect(routed()).toBe(0);
  });

  it("takes a function of the origins, and gives no CORS without origins", async () => {
    const byFunction = await start((origin) => origin.endsWith(".trusted.example"));
    expect((await send(byFunction.port, "GET", { origin: "https://a.trusted.example" })).headers["access-control-allow-origin"]).toBe("https://a.trusted.example");
    expect(corsHeaders((await send(byFunction.port, "GET", { origin: "https://evil.example" })).headers)).toEqual([]);
    const none = await start(undefined);
    expect(corsHeaders((await send(none.port, "GET", { origin: TRUSTED })).headers)).toEqual([]);
  });

  it("refuses the origin \"*\": a browser refuses it with credentials, and each site could send the cookies", () => {
    expect(() => credentialedCors("*")).toThrow(/not "\*"/);
  });
});
