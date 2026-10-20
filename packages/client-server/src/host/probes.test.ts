/**
 * The probes of the service on the listeners of a host (CLI-9, decision D5).
 *
 * - Each listener answers `/_probes/startup`, `/_probes/readiness` and `/_probes/liveness` from the
 *   health of the service, through `probeHandler()` of `@mark1russell7/service/http`.
 * - A probe answers 200 when the service is ready, and 503 with `Retry-After` during the startup
 *   and the shutdown.
 * - The probes need no token and pass no browser check. Each other path goes to the faces with
 *   the token and the browser checks, as before. A listener does not answer the report.
 * - The option `probes` changes the prefix, or turns the probes off.
 */

import { afterEach, describe, expect, it } from "vitest";
import { request } from "node:http";
import { z } from "zod";
import { service, type Lifecycle, type ServiceBuilder, type TransportImpl } from "@mark1russell7/service";
import { fakeClock, fakeProcess } from "@mark1russell7/service/testing";
import { createProcedure, createRegistry, hostPolicy, ms, seconds, type ProcedureRegistry } from "@procedures/client";
import { createProcedureHost, HOST_PROBE_PREFIX, LOCAL_LISTENER_KNOBS, type ProcedureHost, type ProcedureHostOptions } from "./index.js";

const TOKEN = "probe-token";

/** A registry with one call. */
function registryOf(): ProcedureRegistry {
  return createRegistry({
    name: "probes-test",
    procedures: [
      createProcedure()
        .path(["test", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.string())
        .meta({ effects: { reads: [], writes: [] } })
        .handler(async (input) => input.text)
        .build(),
    ],
  });
}

/** A host with a token and one listener on a free port. */
function hostOf(options: Partial<ProcedureHostOptions> = {}): ProcedureHost {
  return createProcedureHost({
    registry: registryOf(),
    policy: hostPolicy({ token: TOKEN }),
    listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
    ...options,
  });
}

/**
 * A service with short stages. With `hold`, the stage "fail readiness" holds for its cap of 2 s
 * before the intake stops, thus a test reads the probes during the shutdown.
 */
function serviceOf(name: string, hold = false): ServiceBuilder {
  const svc = service(name)
    .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
    .liveness({ type: "window", failAfter: seconds(45) })
    .startup(seconds(10));
  if (hold) svc.phase("fail readiness", seconds(2));
  return svc
    .phase("stop intake", ms(500))
    .phase("drain", ms(1000))
    .phase("close transports", ms(500))
    .phase("stop the poller", ms(100))
    .phase("tear down dependencies", ms(500))
    .phase("close the health server", ms(100))
    .cooperativeWindow(ms(500))
    .onRepeatSignal("ignore");
}

interface Answer {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

/** A raw HTTP request on a new connection, so the test sets the method, the Host and the Origin. */
function send(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: options.method ?? "GET", headers: { connection: "close", ...options.headers }, agent: false }, (res) => {
      let text = "";
      res.on("data", (chunk: Buffer) => (text += chunk.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on("error", reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

/** The base URL of the probes of the one listener of a host, when the listener listens. */
async function probeBase(host: ProcedureHost): Promise<string> {
  for (let attempt = 0; attempt < 500; attempt++) {
    const [base] = host.info.probes();
    if (base !== undefined) return base;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("the listener of the host did not start");
}

const lives: Lifecycle[] = [];
afterEach(async () => {
  for (const life of lives.splice(0)) {
    await life.shutdown("the test ended");
    await life.done;
  }
});

describe("the probes of a host (CLI-9)", () => {
  it("answers each probe with 200 when the service is ready, without the token", async () => {
    const host = hostOf();
    const life = await host.declare(serviceOf("ready")).run({ process: fakeProcess() });
    lives.push(life);
    expect(life.state).toBe("running");
    const base = await probeBase(host);
    expect(base.endsWith(HOST_PROBE_PREFIX)).toBe(true);
    for (const kind of ["startup", "readiness", "liveness"]) {
      const answer = await send(`${base}/${kind}`);
      expect(answer.status, kind).toBe(200);
      expect(answer.headers["content-type"]).toBe("application/health+json");
      expect(answer.headers["cache-control"]).toBe("no-store");
      expect(JSON.parse(answer.body)).toMatchObject({ status: "pass", probe: kind, service: "ready" });
    }
    // The readiness of the controller of the calls
    expect((await send(`${base}/readiness/procedures`)).status).toBe(200);
    // HEAD has no body, and a probe takes only GET and HEAD
    const head = await send(`${base}/readiness`, { method: "HEAD" });
    expect([head.status, head.body]).toEqual([200, ""]);
    const post = await send(`${base}/readiness`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect([post.status, post.headers["allow"]]).toEqual([405, "GET, HEAD"]);
  }, 20000);

  it("gives only the status: a listener does not answer the report, and the verdict stays out of each answer", async () => {
    const host = hostOf();
    const life = await host.declare(serviceOf("status")).run({ process: fakeProcess() });
    lives.push(life);
    const base = await probeBase(host);
    const readiness = JSON.parse((await send(`${base}/readiness`)).body) as Record<string, unknown>;
    expect(Object.keys(readiness).sort()).toEqual(["probe", "service", "status"]);
    // The report goes to the faces, and no face serves its path
    const report = await send(`${base}/report`);
    expect(report.status).toBe(404);
    expect(report.body).not.toContain("verdict");
    // Another path under the prefix is not a probe: it goes to the faces too
    expect((await send(`${base}/other`)).status).toBe(404);
  }, 20000);

  it("keeps the token and the browser checks of each other path", async () => {
    const host = hostOf();
    const life = await host.declare(serviceOf("checks")).run({ process: fakeProcess() });
    lives.push(life);
    const base = await probeBase(host);
    const [endpoint] = host.info.endpoints();
    const port = new URL(endpoint!.address).port;
    const json = { "content-type": "application/json" };
    const call = JSON.stringify({ text: "hi" });

    // A probe answers each caller: no token, another Host, another origin
    const foreign = await send(`${base}/readiness`, { headers: { host: `attacker.example:${port}`, origin: "https://evil.example" } });
    expect(foreign.status).toBe(200);
    expect(foreign.headers["access-control-allow-origin"]).toBeUndefined();

    // A call needs the token, as before
    expect((await send(`${endpoint!.address}/test/echo`, { method: "POST", headers: json, body: call })).status).toBe(401);
    const allowed = await send(`${endpoint!.address}/test/echo`, { method: "POST", headers: { ...json, authorization: `Bearer ${TOKEN}` }, body: call });
    expect([allowed.status, JSON.parse(allowed.body)]).toEqual([200, "hi"]);
    // The browser checks stay: another Host and another origin get 403, also with the token
    const rebound = await send(`${endpoint!.address}/test/echo`, {
      method: "POST",
      headers: { ...json, authorization: `Bearer ${TOKEN}`, host: `attacker.example:${port}` },
      body: call,
    });
    expect(rebound.status).toBe(403);
    const crossOrigin = await send(`${endpoint!.address}/test/echo`, {
      method: "POST",
      headers: { ...json, authorization: `Bearer ${TOKEN}`, origin: "https://evil.example" },
      body: call,
    });
    expect(crossOrigin.status).toBe(403);
    // host.health stays a procedure with the token
    expect((await send(`${endpoint!.address}/host/health`, { method: "POST", headers: json, body: "{}" })).status).toBe(401);
  }, 20000);

  it("answers 503 with Retry-After during the startup", async () => {
    const host = hostOf();
    // A part of the app after the listener: the startup waits for it
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const slow: TransportImpl = { start: () => held, stopIntake: () => undefined, drain: () => undefined, inFlight: () => 0, close: () => undefined };
    const running = host.declare(serviceOf("startup")).server("app.slow", {}, slow).run({ process: fakeProcess() });
    const base = await probeBase(host);
    for (const kind of ["startup", "readiness"]) {
      const answer = await send(`${base}/${kind}`);
      expect(answer.status, kind).toBe(503);
      expect(answer.headers["retry-after"], kind).toBe("1");
      expect(JSON.parse(answer.body)).toMatchObject({ status: "fail", probe: kind });
    }
    release();
    const life = await running;
    lives.push(life);
    expect(life.state).toBe("running");
    expect((await send(`${base}/startup`)).status).toBe(200);
    expect((await send(`${base}/readiness`)).status).toBe(200);
  }, 20000);

  it("answers 503 with Retry-After to the readiness probe during the shutdown", async () => {
    const clock = fakeClock();
    const process = fakeProcess({ clock });
    const host = hostOf({ clock });
    const life = await host.declare(serviceOf("drain", true)).run({ process, clock });
    const base = await probeBase(host);
    expect((await send(`${base}/readiness`)).status).toBe(200);

    // The stage "fail readiness" holds for its cap on the fake clock: the listener still takes connections
    const exited = life.shutdown("the test stops the host");
    const readiness = await send(`${base}/readiness`);
    expect(readiness.status).toBe(503);
    expect(readiness.headers["retry-after"]).toBe("1");
    // The process is still alive while it drains
    expect((await send(`${base}/liveness`)).status).toBe(200);
    // The other stages do real work (the close of the sockets): the fake clock moves no faster than the real one
    let code: number | undefined;
    void exited.then((value) => (code = value));
    await clock.advance(2_000);
    for (let step = 0; code === undefined && step < 2_000; step++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await clock.advance(5);
    }
    expect(life.errors).toEqual([]);
    expect(code).toBe(0);
    expect(process.exits).toEqual([0]);
  }, 20000);

  it("takes another prefix, or no probes", async () => {
    const custom = hostOf({ probes: { prefix: "/healthz" } });
    lives.push(await custom.declare(serviceOf("custom")).run({ process: fakeProcess() }));
    const base = await probeBase(custom);
    expect(base.endsWith("/healthz")).toBe(true);
    expect((await send(`${base}/readiness`)).status).toBe(200);
    expect((await send(base.replace("/healthz", HOST_PROBE_PREFIX) + "/readiness")).status).toBe(404);

    const none = hostOf({ probes: false });
    lives.push(await none.declare(serviceOf("none")).run({ process: fakeProcess() }));
    expect(none.info.probes()).toEqual([]);
    const [endpoint] = none.info.endpoints();
    const origin = new URL(endpoint!.address).origin;
    expect((await send(`${origin}${HOST_PROBE_PREFIX}/readiness`)).status).toBe(404);

    // The prefix of the service rule: it starts with "/" and does not end with "/"
    expect(() => hostOf({ probes: { prefix: "healthz/" } })).toThrow(/probe prefix/);
  }, 20000);
});
