/**
 * The idle stop of a procedures host (CLI-27): `idleTimer()`, `idleTimes()`, `idleInterceptor()`
 * and the option `idle` of `runProcedureHost()`.
 *
 * - Each call resets the timer. A fire with a call in flight polls again, and the full time starts
 *   again after the last call ends.
 * - The host stops through the stop request of the lifecycle, as an exit signal does, with the
 *   exit code 0.
 * - The tests use a fake clock and the local face: no test opens a port or waits for real time.
 *
 * The lockfile module reads the home folder when it loads, so this file sets HOME (and
 * USERPROFILE on Windows) before it imports the modules under test.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { fakeClock, fakeProcess } from "@mark1russell7/service/testing";
import type { Lifecycle } from "@mark1russell7/service";
import { Client, createProcedure, createRegistry, hostPolicy, ms, seconds, type ProcedureRegistry } from "@procedures/client";

const home = mkdtempSync(join(tmpdir(), "server-idle-home-"));
const saved = { HOME: process.env["HOME"], USERPROFILE: process.env["USERPROFILE"] };
process.env["HOME"] = home;
process.env["USERPROFILE"] = home;

type Idle = typeof import("./idle.js");
type Host = typeof import("./host.js");
type Peer = typeof import("@procedures/peer");
let idle: Idle;
let host: Host;
let peer: Peer;

beforeAll(async () => {
  idle = await import("./idle.js");
  host = await import("./host.js");
  peer = await import("@procedures/peer");
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
  released.resolve();
  opened = newMark();
  released = newMark();
  for (const life of lives.splice(0)) {
    await life.shutdown("the test ended");
    await life.done;
  }
});

/** A timer of the test: the fake clock, a count of the calls in flight, and the causes of each stop. */
function timerOf(afterMs = 1_000, pollMs = 100) {
  const clock = fakeClock();
  const state = { inFlight: 0 };
  const stops: string[] = [];
  const timer = idle.idleTimer({ afterMs, pollMs, clock, inFlight: () => state.inFlight, stop: (cause) => void stops.push(cause) });
  return { clock, state, stops, timer };
}

describe("idleTimer (CLI-27)", () => {
  it("stops one time after the full time with no call", async () => {
    const { clock, stops, timer } = timerOf();
    timer.start();
    await clock.advance(999);
    expect(stops).toEqual([]);
    await clock.advance(1);
    expect(stops).toEqual(["the host had no call for 1000 ms"]);
    await clock.advance(10_000);
    expect(stops).toHaveLength(1);
    expect(clock.pending).toBe(0);
  });

  it("starts the full time again at each call", async () => {
    const { clock, stops, timer } = timerOf();
    timer.start();
    await clock.advance(800);
    timer.touch();
    await clock.advance(800);
    expect(stops).toEqual([]);
    await clock.advance(200);
    expect(stops).toHaveLength(1);
  });

  it("does not stop while a call is in flight, and gives the full time after its end", async () => {
    const { clock, state, stops, timer } = timerOf();
    timer.start();
    state.inFlight = 1;
    await clock.advance(1_000);
    await clock.advance(5_000);
    expect(stops).toEqual([]);
    // The stream ends: the next poll finds no call, and the full time starts again
    state.inFlight = 0;
    await clock.advance(100);
    await clock.advance(999);
    expect(stops).toEqual([]);
    await clock.advance(1);
    expect(stops).toHaveLength(1);
  });

  it("does nothing before the start or after the cancel", async () => {
    const { clock, stops, timer } = timerOf();
    timer.touch();
    expect(clock.pending).toBe(0);
    timer.start();
    timer.cancel();
    expect(clock.pending).toBe(0);
    timer.start();
    timer.touch();
    await clock.advance(5_000);
    expect(stops).toEqual([]);
  });
});

describe("idleTimes (CLI-27)", () => {
  it("gives the times in milliseconds, with a poll of 5 s or the full time when it is shorter", () => {
    expect(idle.idleTimes({ after: seconds(60) })).toEqual({ afterMs: 60_000, pollMs: idle.IDLE_POLL_MS });
    expect(idle.idleTimes({ after: ms(200) })).toEqual({ afterMs: 200, pollMs: 200 });
    expect(idle.idleTimes({ after: seconds(60), poll: ms(50) })).toEqual({ afterMs: 60_000, pollMs: 50 });
  });

  it("refuses a time of 0 ms or less", () => {
    expect(() => idle.idleTimes({ after: ms(0) })).toThrow(RangeError);
    expect(() => idle.idleTimes({ after: seconds(1), poll: ms(0) })).toThrow(RangeError);
  });
});

describe("idleInterceptor (CLI-27)", () => {
  it("tells the timer about the start and the end of each call, also of a call that fails", async () => {
    let touches = 0;
    const interceptor = idle.idleInterceptor({ touch: () => void touches++ });
    const invocation = {} as Parameters<typeof interceptor>[0];
    await interceptor(invocation, async () => ({ value: 1 }) as never);
    expect(touches).toBe(2);
    await expect(interceptor(invocation, async () => Promise.reject(new Error("the call failed")))).rejects.toThrow("the call failed");
    expect(touches).toBe(4);
  });
});

/** A promise and the function that resolves it. */
function newMark(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((given) => {
    resolve = given;
  });
  return { promise, resolve };
}

/** The open stream of a test: its first row went out, and the test releases its end. */
let opened = newMark();
let released = newMark();

function registryOf(): ProcedureRegistry {
  const effects = { reads: [], writes: [] };
  return createRegistry({
    name: "idle-test",
    procedures: [
      createProcedure()
        .path(["test", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.string())
        .meta({ effects })
        .handler(async (input) => input.text)
        .build(),
      createProcedure()
        .path(["test", "open"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects })
        .handler(async function* () {
          yield "row 1";
          opened.resolve();
          await released.promise;
          yield "row 2";
        } as never)
        .build(),
    ],
  });
}

/** A background host with the idle stop, the local face and no listener, on a fake clock. */
async function runIdleHost(name: string, after = ms(1_000)) {
  const clock = fakeClock();
  const process = fakeProcess({ clock });
  const local = peer.localFace();
  const lines: string[] = [];
  const running = await host.runProcedureHost({
    name,
    mode: "background",
    host: { name, id: `peer-${name}`, registry: registryOf(), policy: hostPolicy({ token: "t" }), faces: { local: local.face } },
    idle: { after, poll: ms(100) },
    log: (line) => void lines.push(line),
    run: { process, clock },
  });
  lives.push(running.life);
  const client = new Client({ transport: local.transport, throwOnError: true });
  return { clock, process, lines, running, client };
}

describe("runProcedureHost with the option idle (CLI-27)", () => {
  it("stops the host after the time with no call, with the exit code 0", async () => {
    const { clock, process, lines, running, client } = await runIdleHost("idle-stop");
    expect(running.life.state).toBe("running");
    await clock.advance(800);
    expect(await client.call({ service: "test", operation: "echo" }, { text: "hello" })).toBe("hello");
    // The call reset the timer: 800 ms after it, the host still runs
    await clock.advance(800);
    expect(running.life.state).toBe("running");
    await clock.advance(200);
    expect(await running.life.done).toBe(0);
    lives.splice(0);
    expect(process.exits).toEqual([0]);
    expect(lines.join("\n")).toContain("Idle: the host had no call for 1000 ms.");
  }, 20000);

  it("does not stop while a stream is open, and stops after the full time from its end", async () => {
    const { clock, running, client } = await runIdleHost("idle-stream");
    const items: unknown[] = [];
    const read = (async () => {
      for await (const item of client.stream({ service: "test", operation: "open" }, {})) items.push(item);
    })();
    await opened.promise;
    expect(running.life.inFlight()).toBe(1);
    await clock.advance(5_000);
    expect(running.life.state).toBe("running");
    released.resolve();
    await read;
    expect(items).toEqual(["row 1", "row 2"]);
    await expect.poll(() => running.life.inFlight()).toBe(0);
    // The next poll finds no call: the full time starts again
    await clock.advance(100);
    await clock.advance(900);
    expect(running.life.state).toBe("running");
    await clock.advance(100);
    expect(await running.life.done).toBe(0);
    lives.splice(0);
  }, 20000);

  it("has no idle stop without the option", async () => {
    const clock = fakeClock();
    const running = await host.runProcedureHost({
      name: "no-idle",
      mode: "background",
      host: { name: "no-idle", id: "peer-no-idle", registry: registryOf(), policy: hostPolicy({ token: "t" }) },
      run: { process: fakeProcess({ clock }), clock },
    });
    lives.push(running.life);
    await clock.advance(3_600_000);
    expect(running.life.state).toBe("running");
  }, 20000);
});
