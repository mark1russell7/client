/**
 * The static face on a real listener of a procedures host.
 *
 * - A file of the root comes with its content type, `nosniff`, an `ETag` and the headers of the options.
 * - A folder gives its `index.html`. A route of the page (no file, no extension) gives the fallback
 *   to a request that accepts `text/html`, and 404 to another request.
 * - A missing file with an extension gets 404, also with `fallback: false` for a route.
 * - A path that leaves the root (`..`, `%2e%2e`, `%5c` or a link out of the root) does not get the file.
 * - `HEAD` gets the headers with no body. The same `ETag` in `If-None-Match` gets 304.
 * - A malformed path or a NUL character gets 400.
 * - The procedure faces keep their paths: the static face is last, and `POST` is not its method.
 * - Under a base path, the face takes only the paths under it.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as z from "zod";
import { service, type Lifecycle, type ServiceBuilder } from "@mark1russell7/service";
import { fakeProcess } from "@mark1russell7/service/testing";
import { createProcedure, createRegistry, ms, seconds } from "@procedures/client";
import { createProcedureHost, contentTypeOf, staticFace, LOCAL_LISTENER_KNOBS, type ProcedureHostFaces } from "./index.js";

const CSP = "default-src 'self'";
/** The header of the navigation of a browser. */
const PAGE = { Accept: "text/html,application/xhtml+xml,*/*;q=0.8" };

/** This function gives a service with short phases, for a fast stop. */
function serviceOf(name: string): ServiceBuilder {
  return service(name)
    .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
    .liveness({ type: "window", failAfter: seconds(45) })
    .startup(seconds(10))
    .phase("fail readiness", ms(10))
    .phase("stop intake", ms(100))
    .phase("drain", ms(500))
    .phase("close transports", ms(100))
    .phase("stop the poller", ms(100))
    .phase("tear down dependencies", ms(100))
    .phase("close the health server", ms(100))
    .cooperativeWindow(ms(100))
    .onRepeatSignal("ignore");
}

/** A response: its status, its headers and its body as text. */
interface Got {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

/** This function sends a request with a raw path. `fetch` normalizes `..` in a URL, so the tests use `node:http`. */
function send(origin: string, path: string, method = "GET", headers: Record<string, string> = {}): Promise<Got> {
  const { hostname, port } = new URL(origin);
  return new Promise((done, fail) => {
    const req = request({ hostname, port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => done({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", fail);
    });
    req.on("error", fail);
    req.end();
  });
}

let folder: string;
const lives: Lifecycle[] = [];

/** This function starts a host with the faces, and gives the origin of its listener. */
async function hostWith(name: string, faces: ProcedureHostFaces): Promise<string> {
  const registry = createRegistry({
    name,
    procedures: [
      createProcedure()
        .path(["notes", "read"])
        .input(z.object({}).passthrough())
        .output(z.string())
        .meta({ effects: { reads: ["notes"], writes: [] } })
        .handler(async () => "content")
        .build(),
    ],
  });
  const host = createProcedureHost({ name, registry, faces, listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }] });
  const life = await host.declare(serviceOf(name)).run({ process: fakeProcess() });
  lives.push(life);
  const http = host.info.endpoints().find((endpoint) => endpoint.type === "http")!;
  return new URL(http.address).origin;
}

let origin: string;
let based: string;
let strict: string;

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), "static-face-"));
  const root = join(folder, "dist");
  mkdirSync(join(root, "assets"), { recursive: true });
  mkdirSync(join(root, "docs"));
  mkdirSync(join(folder, "outside"));
  writeFileSync(join(root, "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(join(root, "assets", "app.js"), "console.log(1);");
  writeFileSync(join(root, "assets", "data.bin"), "bytes");
  writeFileSync(join(root, "docs", "index.html"), "<p>docs</p>");
  writeFileSync(join(folder, "secret.txt"), "secret");
  writeFileSync(join(folder, "outside", "secret.txt"), "secret");
  // A junction needs no rights on Windows. On the other systems, the type is ignored
  symlinkSync(join(folder, "outside"), join(root, "link"), "junction");

  origin = await hostWith("static-face", { http: true, page: staticFace({ root, headers: { "Content-Security-Policy": CSP } }) });
  based = await hostWith("static-face-based", { http: true, page: staticFace({ root, basePath: "/app/" }) });
  strict = await hostWith("static-face-strict", { http: true, page: staticFace({ root, fallback: false }) });
}, 20000);

afterAll(async () => {
  for (const life of lives.splice(0)) {
    await life.shutdown("the test ended");
    await life.done;
  }
  rmSync(folder, { recursive: true, force: true });
});

describe("staticFace", () => {
  it("serves a file with its content type, nosniff, an ETag and the headers of the options", async () => {
    const got = await send(origin, "/assets/app.js");
    expect(got.status).toBe(200);
    expect(got.body).toBe("console.log(1);");
    expect(got.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(got.headers["x-content-type-options"]).toBe("nosniff");
    expect(got.headers["content-security-policy"]).toBe(CSP);
    expect(got.headers["cache-control"]).toBe("no-cache");
    expect(got.headers["content-length"]).toBe("15");
    expect(got.headers["etag"]).toMatch(/^"[0-9a-z]+-[0-9a-z]+"$/);
  });

  it("gives application/octet-stream for an extension that it does not know", async () => {
    const got = await send(origin, "/assets/data.bin");
    expect(got.headers["content-type"]).toBe("application/octet-stream");
    expect(contentTypeOf("a/B.HTML")).toBe("text/html; charset=utf-8");
  });

  it("serves the index.html of the root and of a folder", async () => {
    expect((await send(origin, "/")).body).toContain("<title>app</title>");
    expect((await send(origin, "/docs")).body).toBe("<p>docs</p>");
    expect((await send(origin, "/docs/?q=1")).body).toBe("<p>docs</p>");
  });

  it("gives the fallback for a route of the page, and 404 for a missing file with an extension", async () => {
    const route = await send(origin, "/duel/42?tab=a", "GET", PAGE);
    expect(route.status).toBe(200);
    expect(route.body).toContain("<title>app</title>");
    expect(route.headers["content-type"]).toBe("text/html; charset=utf-8");
    const missing = await send(origin, "/assets/gone.js");
    expect(missing.status).toBe(404);
    expect(missing.headers["content-security-policy"]).toBe(CSP);
  });

  it("gives 404 for a route to a request that does not accept text/html", async () => {
    expect((await send(origin, "/duel/42", "GET", { Accept: "application/json" })).status).toBe(404);
    expect((await send(origin, "/duel/42")).status).toBe(404);
  });

  it("leaves the probes to the host, also the report that the host passes on", async () => {
    const readiness = await send(origin, "/_probes/readiness", "GET", PAGE);
    expect(readiness.body).not.toContain("<title>app</title>");
    const report = await send(origin, "/_probes/report");
    expect(report.status).toBe(404);
    expect(report.body).not.toContain("<title>app</title>");
  });

  it("gives 404 for a route when the fallback is false", async () => {
    expect((await send(strict, "/duel/42", "GET", PAGE)).status).toBe(404);
    expect((await send(strict, "/assets/app.js")).status).toBe(200);
  });

  it.each(["/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt", "/..%5csecret.txt", "/link/secret.txt"])(
    "does not serve a file out of the root (%s)",
    async (path) => {
      const got = await send(strict, path);
      expect(got.body).not.toContain("secret");
      expect(got.status).toBe(404);
    },
  );

  it("does not give a file out of the root as a route either", async () => {
    const got = await send(origin, "/link/secret", "GET", PAGE);
    expect(got.body).not.toContain("secret");
  });

  it("gives 400 for a malformed path and for a NUL character", async () => {
    expect((await send(origin, "/%E0%A4%A")).status).toBe(400);
    expect((await send(origin, "/index.html%00.js")).status).toBe(400);
  });

  it("gives the headers and no body for HEAD", async () => {
    const got = await send(origin, "/assets/app.js", "HEAD");
    expect(got.status).toBe(200);
    expect(got.headers["content-length"]).toBe("15");
    expect(got.body).toBe("");
  });

  it("gives 304 for the same ETag", async () => {
    const first = await send(origin, "/assets/app.js");
    const again = await send(origin, "/assets/app.js", "GET", { "If-None-Match": String(first.headers["etag"]) });
    expect(again.status).toBe(304);
    expect(again.body).toBe("");
    expect(again.headers["etag"]).toBe(first.headers["etag"]);
  });

  it("leaves the paths of the procedure faces and the other methods to the other faces", async () => {
    const call = await send(origin, "/api/notes/read", "POST", { "Content-Type": "application/json" });
    expect(call.body).not.toContain("<title>app</title>");
    const post = await send(origin, "/assets/app.js", "POST");
    expect(post.body).not.toBe("console.log(1);");
  });

  it("takes only the paths under its base path", async () => {
    expect((await send(based, "/app/assets/app.js")).body).toBe("console.log(1);");
    expect((await send(based, "/app")).body).toContain("<title>app</title>");
    expect((await send(based, "/app/duel/1", "GET", PAGE)).body).toContain("<title>app</title>");
    const out = await send(based, "/application/x");
    expect(out.body).not.toContain("<title>app</title>");
  });
});
