/**
 * The engine of the middleware lab runs the real middlewares of the client: each test sets the
 * faults of the simulated server and reads the events that the probes report.
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_FAULTS, DEFAULT_SETTINGS, Lab, type Faults, type LabEvent, type LabSettings } from "./lab";

/** A lab with the settings and faults, and a function that waits for the end of a request. */
function makeLab(settings: Partial<LabSettings>, faults: Partial<Faults>) {
  const events: LabEvent[] = [];
  const waiting = new Map<number, (event: Extract<LabEvent, { kind: "done" }>) => void>();
  const lab = new Lab({ ...DEFAULT_SETTINGS, ...settings }, () => ({ ...DEFAULT_FAULTS, latencyMs: 0, jitterMs: 0, ...faults }), (event) => {
    events.push(event);
    if (event.kind === "done") waiting.get(event.request)?.(event);
  });
  const done = (request: number) => new Promise<Extract<LabEvent, { kind: "done" }>>((resolve) => waiting.set(request, resolve));
  const of = (request: number) => events.filter((event) => "request" in event && event.request === request);
  const serverCalls = (request: number) => of(request).filter((event) => event.kind === "server").length;
  return { lab, events, done, of, serverCalls };
}

const only = (...ids: LabSettings["order"]): Record<string, boolean> =>
  Object.fromEntries(DEFAULT_SETTINGS.order.map((id) => [id, ids.includes(id)]));

describe("the middleware lab", () => {
  it("passes a request through each layer to the server and back", async () => {
    const { lab, done, of } = makeLab({}, {});
    const request = lab.send("a");
    const result = await done(request);
    expect(result).toMatchObject({ ok: true, items: 1 });
    const path = of(request).map((event) => `${event.kind}${"layer" in event ? event.layer : ""}`);
    // Four layers are on by default: cache, timeout, retry, breaker
    expect(path).toEqual(["send", "enter0", "forward0", "enter1", "forward1", "enter2", "forward2", "enter3", "forward3", "server", "item4", "item3", "item2", "item1", "item0", "done"]);
  });

  it("retries a retryable error of the server, then gives the error", async () => {
    const { lab, done, serverCalls } = makeLab({ enabled: only("retry") as LabSettings["enabled"], retries: 2, retryDelayMs: 0 }, { errorRate: 1 });
    const request = lab.send("a");
    expect(await done(request)).toMatchObject({ ok: false, code: "UNAVAILABLE" });
    expect(serverCalls(request)).toBe(3);
  });

  it("answers a second request with the same key from the cache", async () => {
    const { lab, done, serverCalls } = makeLab({ enabled: only("cache") as LabSettings["enabled"] }, {});
    const first = lab.send("hot");
    await done(first);
    const second = lab.send("hot");
    expect(await done(second)).toMatchObject({ ok: true });
    expect(serverCalls(first)).toBe(1);
    expect(serverCalls(second)).toBe(0);
  });

  it("opens the circuit breaker after the failures, and refuses the next call at once", async () => {
    const breaker = makeLab({ enabled: only("breaker") as LabSettings["enabled"], breakerThreshold: 2 }, { errorRate: 1 });
    await breaker.done(breaker.lab.send("a"));
    await breaker.done(breaker.lab.send("b"));
    const third = breaker.lab.send("c");
    expect(await breaker.done(third)).toMatchObject({ ok: false, code: "CIRCUIT_OPEN" });
    expect(breaker.serverCalls(third)).toBe(0);
    expect(breaker.events.some((event) => event.kind === "breaker" && event.state === "OPEN")).toBe(true);
  });

  it("ends a call to a dead peer with the timeout", async () => {
    const { lab, done } = makeLab({ enabled: only("overall") as LabSettings["enabled"], overallMs: 40 }, { dead: true });
    expect(await done(lab.send("a"))).toMatchObject({ ok: false, code: "TIMEOUT" });
  });

  it("refuses the requests over the rate limit", async () => {
    const { lab, done, serverCalls } = makeLab(
      { enabled: only("rateLimit") as LabSettings["enabled"], rateMax: 1, rateWindowMs: 60_000, rateStrategy: "reject" },
      { latencyMs: 20 },
    );
    const first = lab.send("a");
    const second = lab.send("b");
    expect(await done(second)).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(await done(first)).toMatchObject({ ok: true });
    expect(serverCalls(second)).toBe(0);
  });

  it("streams the items of a slow stream", async () => {
    const { lab, done, of } = makeLab({ enabled: only() as LabSettings["enabled"] }, { streamItems: 3, streamGapMs: 5 });
    const request = lab.send("a");
    expect(await done(request)).toMatchObject({ ok: true, items: 3 });
    expect(of(request).filter((event) => event.kind === "item").length).toBe(3);
  });
});
