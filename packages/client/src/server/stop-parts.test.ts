/**
 * The stop parts of `ProcedureServer` in the shape of the runner (CLI-5).
 *
 * - The conformance kit of `@mark1russell7/service/testing` drives the parts: `start`,
 *   `stopIntake`, `drain(deadline, signal)`, `inFlight` and `close`, on the fake clock.
 * - The storages are dependency handles: one handle for each storage.
 * - `stop({ grace })` is the parts in the sequence of the stages, on the clock of the server.
 * - A server starts again after `close()`.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { DependencyHandle, TransportImpl } from "@mark1russell7/service";
import { fakeClock, transportConformance, type HeldWork, type TransportSubject } from "@mark1russell7/service/testing";
import type { Clock } from "../clock.js";
import { seconds } from "../duration.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import type { ProcedureRegistry } from "../procedures/registry.js";
import type { CollectionStorage } from "../procedures/collection/storage.js";
import { ProcedureServer, type StopParts } from "./procedure-server.js";
import { pathToMethod } from "./method.js";
import type { ServerRequest, ServerResponse, ServerTransport } from "./types.js";

/** A call that holds until its release: the handler tells when it starts, and when it gets the abort. */
interface Gate {
  enter(): void;
  release(): void;
  aborted: boolean;
}

const EFFECTS = { reads: [], writes: [] };

/** A registry with a quick call and a call that holds until the test releases it. */
function heldRegistry(gates: Map<string, Gate>): ProcedureRegistry {
  return createRegistry({
    name: "parts",
    procedures: [
      createProcedure()
        .path(["parts", "quick"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: EFFECTS })
        .handler(async () => "ok")
        .build(),
      createProcedure()
        .path(["parts", "hold"])
        .input(z.object({ id: z.string() }))
        .output(z.string())
        .meta({ effects: EFFECTS })
        .handler(async (input, ctx) => {
          const gate = gates.get(input.id)!;
          await new Promise<void>((resolve, reject) => {
            const onAbort = (): void => {
              gate.aborted = true;
              reject(new Error("the call got the abort"));
            };
            // A released call ends: a later abort of the server does not reach it
            gate.release = () => {
              ctx.signal?.removeEventListener("abort", onAbort);
              resolve();
            };
            if (ctx.signal?.aborted) onAbort();
            else ctx.signal?.addEventListener("abort", onAbort, { once: true });
            gate.enter();
          });
          return "released";
        })
        .build(),
    ],
  });
}

/** A server, the calls of a test and the way to hold a call in flight. */
function serverOf(options: { clock?: Clock; transports?: ServerTransport[]; collections?: Record<string, CollectionStorage<unknown>> } = {}) {
  const gates = new Map<string, Gate>();
  const server = new ProcedureServer({ registry: heldRegistry(gates), ...options });
  server.registerFromRegistry();
  let ids = 0;
  const call = (path: string[], payload: unknown): Promise<ServerResponse<unknown>> =>
    server.handle<unknown, unknown>({ id: String(++ids), method: pathToMethod(path), payload, metadata: {} } satisfies ServerRequest<unknown>);
  const offer = async (): Promise<boolean> => (await call(["parts", "quick"], {})).status.type === "success";
  const hold = async (): Promise<HeldWork> => {
    const id = String(++ids);
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => (entered = resolve));
    const gate: Gate = { enter: entered, release: () => undefined, aborted: false };
    gates.set(id, gate);
    const answer = call(["parts", "hold"], { id });
    await inside;
    return {
      release: async () => {
        gate.release();
        await answer;
      },
      get aborted() {
        return gate.aborted;
      },
    };
  };
  return { server, call, offer, hold, gates };
}

/** A subject of the conformance kit: the server is the transport, on the clock of the case. */
function subjectOf(clock: Clock): TransportSubject {
  const { server, offer, hold } = serverOf({ clock });
  const impl: TransportImpl = server;
  return { impl, offer, hold };
}

/** A storage that records its close. */
function recordingStorage(events: string[], name: string): CollectionStorage<unknown> {
  return {
    get: async () => undefined,
    getAll: async () => [],
    find: async () => [],
    has: async () => false,
    size: async () => 0,
    set: async () => undefined,
    delete: async () => false,
    clear: async () => undefined,
    setBatch: async () => undefined,
    deleteBatch: async () => 0,
    getBatch: async () => new Map(),
    close: async () => void events.push(`${name}.close`),
  };
}

/** A server transport that records its start and its stop. */
function recordingTransport(events: string[]): ServerTransport {
  let running = false;
  return {
    name: "face",
    start: async () => {
      running = true;
      events.push("face.start");
    },
    stop: async () => {
      running = false;
      events.push("face.stop");
    },
    isRunning: () => running,
  };
}

/** The turns of the event loop that let the settled promises run. It is not a sleep. */
async function turns(count = 8): Promise<void> {
  for (let at = 0; at < count; at++) await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("ProcedureServer passes the conformance kit of the runner (CLI-5)", () => {
  for (const testCase of transportConformance(subjectOf, { name: "ProcedureServer" })) {
    it(testCase.name, () => testCase.run());
  }
});

describe("the stop parts of ProcedureServer (CLI-5)", () => {
  it("fit the contracts TransportImpl and DependencyHandle of the runner", () => {
    const server = new ProcedureServer({ collections: { things: recordingStorage([], "things") } });
    const transport: TransportImpl = server;
    const parts: StopParts = server;
    const handles: DependencyHandle[] = server.storageHandles();
    expect(transport.inFlight()).toBe(0);
    expect(parts.inFlight()).toBe(0);
    expect(handles).toHaveLength(1);
  });

  it("give one handle for each storage, also for a storage of two collections", async () => {
    const events: string[] = [];
    const shared = recordingStorage(events, "shared");
    const server = new ProcedureServer({ collections: { a: shared, b: shared, c: recordingStorage(events, "c") } });
    const handles = server.storageHandles();
    expect(handles.map((handle) => handle.name)).toEqual(["collections.a+b", "collections.c"]);
    expect(handles.map((handle) => handle.collections)).toEqual([["a", "b"], ["c"]]);
    expect(handles[0]!.storage).toBe(shared);
    await handles[0]!.connect(new AbortController().signal);
    expect(events).toEqual([]);
    await handles[0]!.close();
    // The collections of the storage leave the server, and the other storage stays
    expect(events).toEqual(["shared.close"]);
    expect(server.getCollectionNames()).toEqual(["c"]);
  });

  it("stop() calls the parts in the sequence of the stages: intake, drain, close, then the storages", async () => {
    const events: string[] = [];
    const { server, hold, offer } = serverOf({ transports: [recordingTransport(events)], collections: { things: recordingStorage(events, "things") } });
    await server.start();
    const work = await hold();
    const stopping = server.stop();
    // The intake stops at once: a new call gets the retryable UNAVAILABLE
    expect(await offer()).toBe(false);
    await stopping;
    expect(work.aborted).toBe(true);
    expect(events).toEqual(["face.start", "face.stop", "things.close"]);
    expect(server.inFlight()).toBe(0);
  });

  it("the grace of stop() waits on the clock of the server, with no timer of its own", async () => {
    const clock = fakeClock();
    const { server, hold } = serverOf({ clock });
    const work = await hold();
    let stopped = false;
    const stopping = server.stop({ grace: seconds(5) }).then(() => {
      stopped = true;
    });
    await clock.advance(4999);
    await turns();
    expect(stopped).toBe(false);
    expect(work.aborted).toBe(false);
    await clock.advance(1);
    await stopping;
    // At the end of the grace, close() aborts the call that still runs
    expect(work.aborted).toBe(true);
    expect(clock.pending).toBe(0);
  });

  it("stop() ends before the grace when the last call ends, and stops its timer", async () => {
    const clock = fakeClock();
    const { server, hold } = serverOf({ clock });
    const work = await hold();
    const stopping = server.stop({ grace: seconds(5) });
    await clock.advance(1000);
    await work.release();
    await stopping;
    expect(work.aborted).toBe(false);
    expect(clock.pending).toBe(0);
  });

  it("drain() gives the cooperative abort and then waits for the calls to end, to its deadline", async () => {
    const clock = fakeClock();
    const { server, hold } = serverOf({ clock });
    const work = await hold();
    server.stopIntake();
    const abort = new AbortController();
    let drained = false;
    const draining = server.drain(clock.now() + 1000, abort.signal).then(() => {
      drained = true;
    });
    await turns();
    expect(drained).toBe(false);
    abort.abort();
    await draining;
    // The call ended at the abort, so the drain did not wait for its deadline, and its timer stopped
    expect(work.aborted).toBe(true);
    expect(clock.pending).toBe(0);
    expect(server.inFlight()).toBe(0);
  });

  it("close() keeps the intake stopped until the next start(), and the server serves again", async () => {
    const { server, offer, hold } = serverOf();
    await server.start();
    const work = await hold();
    await server.close();
    expect(work.aborted).toBe(true);
    expect(await offer()).toBe(false);
    // A second close gives the same promise and has no effect
    await server.close();
    await server.start();
    expect(server.stopping).toBe(false);
    expect(await offer()).toBe(true);
    // A call after the start gets a new signal: the abort of the last run does not reach it
    const next = await hold();
    expect(next.aborted).toBe(false);
    await next.release();
  });

  it("stopIntake() ends each subscription of events.subscribe", async () => {
    const server = new ProcedureServer({ events: { topics: ["news"] } });
    let ended = 0;
    const end = server.publisher!.end.bind(server.publisher);
    server.publisher!.end = () => {
      ended++;
      end();
    };
    server.stopIntake();
    server.stopIntake();
    expect(ended).toBe(1);
    expect(server.stopping).toBe(true);
  });
});
