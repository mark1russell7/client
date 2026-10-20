/**
 * The runner entry of the procedures host (CLI-8): `runProcedureHost()` and `runServer()` under
 * `run()` of `@mark1russell7/service`.
 *
 * - The lockfile is a dependency: the startup writes it, and the shutdown removes it.
 * - The foreground run has the profile `localDev`, where a second signal exits at once. The
 *   background host has the profile `daemon`, where a repeat signal has no effect (D6).
 * - `runServer()` installs no signal handler: a signal of the process port starts the stop in
 *   stages, and the promise ends with the lifecycle.
 * - The option `declare` adds the parts and the dependencies of the app to the service (CLI-62).
 *   The runner starts them with the host and stops each one in its stage.
 *
 * The lockfile module reads the home folder when it loads, so this file sets HOME (and
 * USERPROFILE on Windows) before it imports the modules under test.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeClock, fakeProcess, scriptedCheck, seeded } from "@mark1russell7/service/testing";
import { httpTransport } from "@mark1russell7/service/http";
import type { DependencyHandle, Lifecycle, LifecycleEvent, ServiceBuilder, TransportImpl } from "@mark1russell7/service";
import { createRegistry, hostPolicy, seconds } from "@procedures/client";
import type { ProcedureHost } from "@procedures/peer";

const home = mkdtempSync(join(tmpdir(), "server-host-home-"));
const saved = { HOME: process.env["HOME"], USERPROFILE: process.env["USERPROFILE"] };
process.env["HOME"] = home;
process.env["USERPROFILE"] = home;

type Lockfiles = typeof import("@procedures/peer/lockfile");
type Host = typeof import("./host.js");
type Run = typeof import("./run.js");
type Peer = typeof import("@procedures/peer");
let lockfiles: Lockfiles;
let host: Host;
let run: Run;
let peer: Peer;

beforeAll(async () => {
  lockfiles = await import("@procedures/peer/lockfile");
  host = await import("./host.js");
  run = await import("./run.js");
  peer = await import("@procedures/peer");
  expect(lockfiles.getMarkDir().startsWith(home)).toBe(true);
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(home, { recursive: true, force: true });
});

const lives: Lifecycle[] = [];
afterEach(async () => {
  for (const life of lives.splice(0)) {
    await life.shutdown("the test ended");
    await life.done;
  }
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** The options of a host with one listener on a free port, and its token. */
function hostOptions(id: string) {
  return {
    id,
    registry: createRegistry(),
    policy: hostPolicy({ token: "host-token" }),
    listen: [{ port: 0, knobs: peer.LOCAL_LISTENER_KNOBS }],
  };
}

describe("runProcedureHost (CLI-8)", () => {
  it("writes the lockfile at the startup and removes it at the shutdown", async () => {
    const process = fakeProcess();
    const lockfile = {
      pid: 1,
      port: 40001,
      transport: "http",
      endpoint: "http://127.0.0.1:40001/api",
      startedAt: new Date().toISOString(),
      token: "host-token",
      cwd: "/work",
      build: "build-1",
      peerId: "peer-lockfile",
    };
    const running = await host.runProcedureHost({ name: "lockfile", mode: "background", host: hostOptions("peer-lockfile"), lockfile, run: { process } });
    lives.push(running.life);
    expect(running.life.state).toBe("running");
    expect(lockfiles.readLockfileForPort(40001)?.peerId).toBe("peer-lockfile");
    // host.info answers the token of the lockfile with the peer id
    const [endpoint] = running.host.info.endpoints();
    const info = await fetch(`${endpoint!.address}/host/info`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer host-token" },
      body: "{}",
    });
    expect(((await info.json()) as { peerId: string }).peerId).toBe("peer-lockfile");

    await running.life.shutdown("the test stops the host");
    expect(await running.life.done).toBe(0);
    lives.splice(0);
    expect(lockfiles.readLockfileForPort(40001)).toBeNull();
    expect(process.exits).toEqual([0]);
  }, 20000);

  it("declares the profile of each mode: an exit at a second signal in the foreground, no effect in the background", async () => {
    const foreground = await host.runProcedureHost({ name: "fg", mode: "foreground", host: hostOptions("peer-fg"), run: { process: fakeProcess() } });
    lives.push(foreground.life);
    const background = await host.runProcedureHost({ name: "bg", mode: "background", host: hostOptions("peer-bg"), run: { process: fakeProcess() } });
    lives.push(background.life);
    expect(foreground.service.describe().shutdown.onRepeatSignal).toBe("exit");
    expect(background.service.describe().shutdown.onRepeatSignal).toBe("ignore");
    // The caps of the stages sum to 10 s: they replace the hard-exit timer of 10 s
    const caps = foreground.service.describe().shutdown.phases.reduce((sum, phase) => sum + phase.cap.value * (phase.cap.unit === "ms" ? 0.001 : 1), 0);
    expect(caps).toBeLessThanOrEqual(10);
  }, 20000);
});

describe("runProcedureHost: the parts of the app (CLI-62)", () => {
  /** The lockfile of a host on a port that nothing listens on: only its file counts. */
  function lockfileOf(port: number, peerId: string) {
    return { pid: 1, port, transport: "http", endpoint: `http://127.0.0.1:${port}/api`, startedAt: new Date().toISOString(), token: "t", cwd: "/work", build: "build-1", peerId };
  }

  it("declares a part and a dependency of the app: describe() shows them, the runner starts them with the host, and the stop closes each one in its stage", async () => {
    const clock = fakeClock();
    const process = fakeProcess({ clock });
    const port = 40002;
    // The stage of the lifecycle at each step: the startup, then each phase of the shutdown
    let stage = "startup";
    const started: string[] = [];
    const record = (event: LifecycleEvent): void => {
      if (event.machine === "drain") stage = event.to;
      if (event.on === "component.started" && event.detail !== undefined) started.push(event.detail);
    };
    const steps: string[] = [];
    const lockfile = (): string => (lockfiles.readLockfileForPort(port) === null ? "no lockfile" : "lockfile");
    // A child process of the app, for example the Vite dev server: a transport with stop parts only
    const vite: TransportImpl = {
      start: () => void steps.push(`vite.start in ${stage}`),
      stopIntake: () => void steps.push(`vite.stopIntake in ${stage}`),
      drain: () => void steps.push(`vite.drain in ${stage}`),
      inFlight: () => 0,
      close: () => void steps.push(`vite.close in ${stage}`),
    };
    // A connection of the app, for example to Mongo: a dependency with its handle and its check
    const mongo: DependencyHandle = {
      connect: () => void steps.push(`mongo.connect in ${stage}, ${lockfile()}`),
      close: () => void steps.push(`mongo.close in ${stage}, ${lockfile()}`),
    };
    const ping = scriptedCheck("ok");
    let given: ProcedureHost | undefined;
    const declare = (svc: ServiceBuilder, host: ProcedureHost): ServiceBuilder => {
      given = host;
      return svc
        .dependency("mongo", { system: null, knobs: {}, operations: { find: { idempotent: true }, insert: { idempotent: false } } }, mongo)
        .check(
          { name: "mongo.ping", dependency: "mongo", step: "round-trip", ownConnection: true, gates: "readiness", poll: { interval: seconds(5), jitter: 0.2, timeout: seconds(4) } },
          ping.run
        )
        .server("app.vite", {}, vite);
    };

    const running = await host.runProcedureHost({
      name: "app",
      mode: "background",
      // The controller of the host requires the dependency of the app: describe() refuses it without the declaration
      host: { name: "app", id: "peer-app", registry: createRegistry(), policy: hostPolicy({ token: "t" }), controller: { requires: ["mongo"] } },
      lockfile: lockfileOf(port, "peer-app"),
      declare,
      run: { process, clock, random: seeded(7), record },
    });
    lives.push(running.life);
    expect(running.life.state).toBe("running");
    expect(given).toBe(running.host);

    // describe() shows the parts of the app after the parts of the host, and the lockfile last
    const description = running.service.describe();
    expect(description.transports.map((transport) => transport.name)).toEqual(["app", "app.vite"]);
    expect(description.dependencies.map((dependency) => dependency.name)).toEqual(["mongo", "lockfile"]);
    expect(description.checks.map((check) => check.name)).toEqual(["mongo.ping"]);
    expect(description.controllers.find((controller) => controller.name === "app")?.requires).toEqual(["mongo"]);

    // The startup: the dependencies connect, the lockfile last, then the server of the host starts before the part of the app
    expect(started).toEqual(["dependency mongo", "dependency lockfile", "server app", "server app.vite"]);
    expect(steps).toEqual(["mongo.connect in startup, no lockfile", "vite.start in startup"]);
    expect(lockfiles.readLockfileForPort(port)?.peerId).toBe("peer-app");
    // The check of the dependency polls on the clock of the run
    const polls = ping.calls;
    expect(polls).toBeGreaterThanOrEqual(1);
    await clock.advance(6_000);
    expect(ping.calls).toBeGreaterThan(polls);
    expect(running.life.health.verdict().controllers).toMatchObject({ app: true });

    // A signal starts the stop in stages: each part of the app stops in its stage, and the lockfile closes before the dependency of the app
    process.signal("SIGTERM");
    expect(await running.life.done).toBe(0);
    lives.splice(0);
    expect(steps.slice(2)).toEqual([
      "vite.stopIntake in stop intake",
      "vite.drain in drain",
      "vite.close in close transports",
      "mongo.close in tear down dependencies, no lockfile",
    ]);
    expect(process.exits).toEqual([0]);
  }, 20000);

  it("gives the host to the declaration: a listener of the app mounts host.handler", async () => {
    let address: () => string = () => "";
    const running = await host.runProcedureHost({
      name: "mounted",
      mode: "background",
      host: { name: "mounted", id: "peer-mounted", registry: createRegistry(), policy: hostPolicy({ token: "t" }) },
      declare: (svc, given) => {
        const listener = httpTransport(createHttpServer(), peer.LOCAL_LISTENER_KNOBS, { listen: { port: 0, host: "127.0.0.1" } });
        listener.mount((req, res) => given.handler(req, res));
        address = () => {
          const bound = listener.server.address();
          return `http://127.0.0.1:${typeof bound === "object" && bound ? bound.port : 0}`;
        };
        svc.server("app.listen", listener.knobs, listener);
      },
      run: { process: fakeProcess() },
    });
    lives.push(running.life);
    expect(running.life.state).toBe("running");
    // The host owns no listener: the listener of the app answers the calls of the host
    expect(running.host.info.endpoints()).toEqual([]);
    const info = await fetch(`${address()}/api/host/info`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: "{}",
    });
    expect(info.status).toBe(200);
    expect(((await info.json()) as { peerId: string }).peerId).toBe("peer-mounted");
  }, 20000);

  it("changes nothing without the option: the service has only the parts of the host", async () => {
    const running = await host.runProcedureHost({ name: "plain", mode: "background", host: hostOptions("peer-plain"), run: { process: fakeProcess() } });
    lives.push(running.life);
    const description = running.service.describe();
    expect(description.transports.map((transport) => transport.name)).toEqual(running.host.parts.map((part) => part.name));
    expect(description.dependencies.map((dependency) => dependency.name)).toEqual(running.host.dependencies.map((dependency) => dependency.name));
    expect(description.checks.map((check) => check.name)).toEqual(running.host.checks.map(({ check }) => check.name));
    expect(description.transports.map((transport) => transport.name)).toEqual(["procedures", "procedures.listen.http"]);
  }, 20000);
});

describe("runProcedureHost: the probes (CLI-9, decision D5)", () => {
  /** The status of a GET, and its Retry-After and its body. */
  async function probe(url: string): Promise<{ status: number; retryAfter: string | null; body: Record<string, unknown> | null }> {
    const response = await fetch(url);
    const text = await response.text();
    return { status: response.status, retryAfter: response.headers.get("retry-after"), body: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null };
  }

  it("answers the probes on each listener of the host under /_probes by default", async () => {
    const running = await host.runProcedureHost({ name: "app-port", mode: "background", host: hostOptions("peer-app-port"), run: { process: fakeProcess() } });
    lives.push(running.life);
    const [base] = running.probes();
    const [endpoint] = running.host.info.endpoints();
    expect(base).toBe(`${new URL(endpoint!.address).origin}/_probes`);
    expect(running.probes()).toEqual(running.host.info.probes());
    for (const kind of ["startup", "readiness", "liveness"]) {
      expect(await probe(`${base}/${kind}`), kind).toMatchObject({ status: 200, body: { status: "pass", probe: kind, service: "app-port" } });
    }
    // The service declares no health server: the listener is the one place of the probes
    expect((await probe(`${base}/report`)).status).toBe(404);
  }, 20000);

  it("moves the probes to a probe server on a port of its own: it answers the report, and the listeners answer no probe", async () => {
    const process = fakeProcess();
    const running = await host.runProcedureHost({
      name: "own-port",
      mode: "background",
      host: hostOptions("peer-own-port"),
      probes: { port: 0 },
      run: { process },
    });
    lives.push(running.life);
    expect(running.life.state).toBe("running");
    const [base] = running.probes();
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(running.host.info.probes()).toEqual([]);
    const [endpoint] = running.host.info.endpoints();
    const listener = new URL(endpoint!.address).origin;
    expect(base).not.toBe(listener);

    for (const kind of ["startup", "readiness", "liveness"]) {
      expect(await probe(`${base}/${kind}`), kind).toMatchObject({ status: 200, body: { status: "pass", probe: kind, service: "own-port" } });
    }
    // The port of the probes answers the report with the whole verdict
    const report = await probe(`${base}/report`);
    expect(report.status).toBe(200);
    expect(report.body?.["verdict"]).toMatchObject({ started: true, ready: true, alive: true, controllers: { procedures: true } });
    // The listener of the host answers no probe
    expect((await probe(`${listener}/_probes/readiness`)).status).toBe(404);

    // The probe server closes last: after the exit, nothing answers on its port
    process.signal("SIGTERM");
    expect(await running.life.done).toBe(0);
    lives.splice(0);
    await expect(fetch(`${base}/readiness`)).rejects.toThrow();
  }, 20000);

  it("leaves out the report on the probe port when the option kinds does not name it (SYS-30)", async () => {
    const running = await host.runProcedureHost({
      name: "no-report",
      mode: "background",
      host: hostOptions("peer-no-report"),
      probes: { port: 0, kinds: ["startup", "readiness", "liveness"] },
      run: { process: fakeProcess() },
    });
    lives.push(running.life);
    const [base] = running.probes();
    expect((await probe(`${base}/readiness`)).status).toBe(200);
    expect((await probe(`${base}/report`)).status).toBe(404);
  }, 20000);

  it("answers on the two places when the options of the host ask for the probes of the listeners too", async () => {
    const running = await host.runProcedureHost({
      name: "both",
      mode: "background",
      host: { ...hostOptions("peer-both"), probes: true },
      probes: { port: 0, prefix: "/health" },
      run: { process: fakeProcess() },
    });
    lives.push(running.life);
    const [base] = running.probes();
    expect(base).toMatch(/\/health$/);
    expect((await probe(`${base}/readiness`)).status).toBe(200);
    const [listener] = running.host.info.probes();
    expect((await probe(`${listener}/readiness`)).status).toBe(200);
  }, 20000);

  it("answers 503 with the Retry-After of the option while the startup runs", async () => {
    const port = await freePort();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const slow: TransportImpl = { start: () => held, stopIntake: () => undefined, drain: () => undefined, inFlight: () => 0, close: () => undefined };
    const starting = host.runProcedureHost({
      name: "starting",
      mode: "background",
      host: hostOptions("peer-starting"),
      probes: { port, retryAfter: seconds(3) },
      declare: (svc) => void svc.server("app.slow", {}, slow),
      run: { process: fakeProcess() },
    });
    // The probe server starts first, so it answers while the parts start
    let answer = await probe(`http://127.0.0.1:${port}/readiness`).catch(() => null);
    for (let attempt = 0; answer === null && attempt < 200; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      answer = await probe(`http://127.0.0.1:${port}/readiness`).catch(() => null);
    }
    expect(answer).toMatchObject({ status: 503, retryAfter: "3", body: { status: "fail", probe: "readiness" } });
    expect(await probe(`http://127.0.0.1:${port}/startup`)).toMatchObject({ status: 503, retryAfter: "3" });
    release();
    const running = await starting;
    lives.push(running.life);
    expect(await probe(`http://127.0.0.1:${port}/readiness`)).toMatchObject({ status: 200, retryAfter: null });
  }, 20000);
});

describe("runServer (CLI-8)", () => {
  it("installs no signal handler: a signal of the process port stops the server in stages", async () => {
    const port = await freePort();
    const signals = { SIGINT: globalThis.process.listenerCount("SIGINT"), SIGTERM: globalThis.process.listenerCount("SIGTERM") };
    const process = fakeProcess();
    const lines: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void lines.push(args.join(" "));
    let ended = false;
    try {
      const running = run.runServer(["--port", String(port), "--token", "t", "--transport", "http"], { run: { process } }).then(() => {
        ended = true;
      });
      const until = Date.now() + 15000;
      while (!lines.some((line) => line.includes("Press Ctrl+C")) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20));
      expect(lines.some((line) => line.includes("Press Ctrl+C"))).toBe(true);
      expect(globalThis.process.listenerCount("SIGINT")).toBe(signals.SIGINT);
      expect(globalThis.process.listenerCount("SIGTERM")).toBe(signals.SIGTERM);
      expect(ended).toBe(false);
      process.signal("SIGINT");
      await running;
      expect(process.exits).toEqual([0]);
      expect(lines.some((line) => line.includes("Shutting down"))).toBe(true);
    } finally {
      console.log = log;
    }
  }, 30000);
});
