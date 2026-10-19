/**
 * The auth face under the runner (CLI-54): each request of the auth routes goes through the request
 * tracking of the host, on the route pattern `auth *` of its controller. A sign-in in flight at the
 * stop completes in the drain, and a sign-in after the stop of the intake gets 503. The test runs
 * the service on the fake clock.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { service, type ServiceBuilder } from "@mark1russell7/service";
import { fakeClock, fakeProcess, seeded } from "@mark1russell7/service/testing";
import { createRegistry, ms, seconds } from "@procedures/client";
import { betterAuthFace } from "@procedures/better-auth";
import { createProcedureHost } from "./index.js";

const PAGE = "http://localhost:5173";

/** A service with short stages: the drain waits one second on the fake clock. */
function serviceOf(name: string): ServiceBuilder {
  return service(name)
    .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
    .liveness({ type: "window", failAfter: seconds(45) })
    .startup(seconds(10))
    .phase("fail readiness", ms(10))
    .phase("stop intake", ms(500))
    .phase("drain", ms(1000))
    .phase("close transports", ms(500))
    .phase("stop the poller", ms(100))
    .phase("tear down dependencies", ms(500))
    .phase("close the health server", ms(100))
    .cooperativeWindow(ms(500))
    .onRepeatSignal("ignore");
}

/** A tick of the event loop: the work of the promises and of the sockets goes on. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/**
 * A fake handler of Better Auth. The sign-in waits until the test releases it, and then sets the
 * session cookie. Each other route answers at once.
 */
function fakeAuth() {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered: () => void = () => undefined;
  const inside = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const signIns: string[] = [];
  const handler = async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname !== "/auth/sign-in/email") return Response.json({ session: null });
    signIns.push(request.method);
    entered();
    await gate;
    return Response.json({ user: { email: "alice@example.com" } }, { headers: { "Set-Cookie": "session_token=abc; Path=/; HttpOnly" } });
  };
  return { auth: { handler }, release: () => release(), inside, signIns };
}

describe("betterAuthFace under the runner (CLI-54)", () => {
  it("tracks each request on the route pattern of the face: a sign-in in flight at the stop completes, and a new one gets 503", async () => {
    const clock = fakeClock();
    const fake = fakeAuth();
    const host = createProcedureHost({ registry: createRegistry(), faces: { auth: betterAuthFace(fake.auth, { allowedOrigins: [PAGE] }) }, clock });
    expect(host.controllers[0]?.patterns.map((pattern) => pattern.pattern)).toEqual(["auth *"]);

    // The app mounts the faces of the host on a listener of its own, which stays open in the test
    const app: Server = createServer((req, res) => {
      if (host.handler(req, res)) return;
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          app.close(() => resolve());
          app.closeAllConnections();
        }),
    );
    const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    const signIn = (): Promise<Response> =>
      fetch(`${base}/auth/sign-in/email`, { method: "POST", headers: { Origin: PAGE, "Content-Type": "application/json" }, body: "{}" });

    // Without a service, a request starts directly
    expect(await (await fetch(`${base}/auth/get-session`, { headers: { Origin: PAGE } })).json()).toEqual({ session: null });

    const life = await host.declare(serviceOf("auth-face")).run({ clock, process: fakeProcess({ clock }), random: seeded(7) });
    await clock.advance(0);
    let exited = false;
    cleanups.push(async () => {
      fake.release();
      if (!exited) {
        void life.shutdown("the test ended");
        for (let step = 0; step < 100 && !exited; step++) await clock.advance(100);
      }
    });

    // A sign-in in flight is a request of the controller of the host
    const inFlight = signIn();
    await fake.inside;
    expect(life.inFlight(host.name)).toBe(1);

    const shutdown = life.shutdown("the test stops the host").then(() => {
      exited = true;
    });
    // The phase "fail readiness" ends, and the phase "stop intake" stops the intake of the controller.
    // A probe on the route pattern of the face tells when: it does not reach Better Auth.
    const refuses = async (): Promise<boolean> => (await life.request(host.name, "auth probe", () => true).collect()).end.kind === "refused";
    for (let step = 0; step < 50 && !(await refuses()); step++) {
      await tick();
      await clock.advance(5);
      await tick();
    }
    expect(await refuses()).toBe(true);

    // A sign-in after the stop of the intake gets 503, with the CORS of the page, and it does not reach Better Auth
    const late = await signIn();
    expect(late.status).toBe(503);
    expect(late.headers.get("access-control-allow-origin")).toBe(PAGE);
    expect(await late.json()).toMatchObject({ code: "UNAVAILABLE", retryable: true });
    expect(fake.signIns).toEqual(["POST"]);

    // The drain waits for the sign-in in flight
    await clock.advance(200);
    await tick();
    expect(exited).toBe(false);
    expect(life.inFlight(host.name)).toBe(1);

    // The sign-in completes: it writes its session, and its answer reaches the page
    fake.release();
    const answer = await inFlight;
    expect(answer.status).toBe(200);
    expect(answer.headers.get("set-cookie")).toContain("session_token=abc");
    expect(answer.headers.get("access-control-allow-origin")).toBe(PAGE);
    expect(await answer.json()).toEqual({ user: { email: "alice@example.com" } });

    // Then the shutdown ends
    for (let step = 0; step < 100 && !exited; step++) {
      await clock.advance(100);
      await tick();
    }
    await shutdown;
    expect(exited).toBe(true);
    expect(life.inFlight(host.name)).toBe(0);
  }, 20000);
});
