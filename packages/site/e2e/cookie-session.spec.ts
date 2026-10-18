/// <reference types="node" />
/**
 * The cookie mode of `HttpTransport` in a real browser (CLI-18). A page on one origin calls a
 * procedure server on another origin of the same site. With `credentials: "include"`, the browser
 * sends the session cookie of the server, and the request hook of the server (`principalOf`) reads
 * it. Without the option, the browser sends no cookie, and the server refuses the call.
 */

import { test, expect } from "@playwright/test";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { ProcedureServer, anySchema, createProcedure, createRegistry } from "@procedures/client";
import { procedureHandler } from "@procedures/client/node";

const ENTRY = fileURLToPath(new URL("./fixtures/cookie-session-page.ts", import.meta.url));

/** This function bundles the page entry for the browser and gives the code of the bundle. */
async function bundle(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    root: dirname(ENTRY),
    build: {
      write: false,
      minify: false,
      rollupOptions: { input: ENTRY, output: { format: "iife", entryFileNames: "client.js", inlineDynamicImports: true } },
    },
  });
  for (const output of Array.isArray(result) ? result : [result]) {
    if (!("output" in output)) continue;
    for (const chunk of output.output) if (chunk.type === "chunk" && chunk.isEntry) return chunk.code;
  }
  throw new Error("Vite gave no bundle of the page entry");
}

function listen(server: Server): Promise<number> {
  // No host: the server takes IPv4 and IPv6, so "localhost" reaches it in each browser
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}

function close(server: Server | undefined): Promise<void> {
  if (!server) return Promise.resolve();
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

let pageServer: Server | undefined;
let apiServer: Server | undefined;
let pageOrigin = "";
let apiOrigin = "";
/** The cookie headers that the procedure server got, one for each call */
const seenCookies: Array<string | undefined> = [];

test.beforeAll(async () => {
  const code = await bundle();
  pageServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/client.js") {
      res.setHeader("content-type", "text/javascript");
      res.end(code);
      return;
    }
    res.setHeader("content-type", "text/html");
    res.end('<!doctype html><html><head><script src="/client.js"></script></head><body>cookie session</body></html>');
  });
  pageOrigin = `http://localhost:${await listen(pageServer)}`;

  const registry = createRegistry({
    name: "who",
    procedures: [
      createProcedure()
        .path(["who", "am"])
        .input(anySchema)
        .output(anySchema)
        .meta({ effects: { reads: [], writes: [] } })
        .handler(async (_input, ctx) => ({ principal: ctx.principal?.id ?? null }))
        .build(),
    ],
  });
  const server = new ProcedureServer({
    registry,
    // The session cookie of the server gives the principal. A request without it is refused.
    principalOf: ({ cookies = {} }) => (cookies["session"] === "s-1" ? { principal: { id: "user:browser", via: "session" } } : undefined),
  });
  server.registerFromRegistry();
  const handler = procedureHandler(server, { basePath: "/api", cors: { origin: [pageOrigin], credentials: true } });
  apiServer = createServer((req, res) => {
    if (req.method === "POST") seenCookies.push(req.headers.cookie);
    if (!handler(req, res)) {
      res.statusCode = 404;
      res.end();
    }
  });
  apiOrigin = `http://localhost:${await listen(apiServer)}`;
});

test.afterAll(async () => {
  await close(apiServer);
  await close(pageServer);
});

/** One call of the page to the procedure server: its value, or the code of its error. */
async function callFromPage(page: import("@playwright/test").Page, credentials?: "include"): Promise<{ ok: boolean; value?: unknown; code?: string }> {
  return page.evaluate(
    async ({ api, mode }) => {
      const { Client, HttpTransport, pathToMethod } = (globalThis as unknown as {
        procedures: {
          Client: new (transport: unknown) => { call(method: unknown, payload: unknown): Promise<unknown> };
          HttpTransport: new (options: Record<string, unknown>) => unknown;
          pathToMethod: (path: string[]) => unknown;
        };
      }).procedures;
      const client = new Client(new HttpTransport({ baseUrl: api, ...(mode ? { credentials: mode } : {}) }));
      try {
        return { ok: true, value: await client.call(pathToMethod(["who", "am"]), {}) };
      } catch (error) {
        return { ok: false, code: String((error as { code?: unknown }).code ?? (error as Error).message) };
      }
    },
    { api: `${apiOrigin}/api`, mode: credentials }
  );
}

test("HttpTransport with credentials \"include\" sends the cookie of another origin, and the server reads it", async ({ page, context }) => {
  // The cookie of the procedure server. A cookie names no port, so localhost has one jar.
  await context.addCookies([{ name: "session", value: "s-1", domain: "localhost", path: "/", sameSite: "Lax" }]);
  await page.goto(pageOrigin);
  await expect(page.locator("body")).toHaveText("cookie session");

  const withCookie = await callFromPage(page, "include");
  expect(withCookie).toEqual({ ok: true, value: { principal: "user:browser" } });
  expect(seenCookies.at(-1)).toContain("session=s-1");

  const withoutCookie = await callFromPage(page);
  expect(withoutCookie.ok).toBe(false);
  expect(withoutCookie.code).toContain("UNAUTHORIZED");
  expect(seenCookies.at(-1)).toBeUndefined();
});
