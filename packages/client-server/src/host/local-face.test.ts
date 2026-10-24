/**
 * The local face of a procedures host (CLI-26): a `Client` of this process calls the host through
 * the request tracking of the service.
 *
 * - A value and a stream come back as on the other faces. A token of the policy does not apply:
 *   each call has `LOCAL_CREDENTIALS`.
 * - The service counts each call: a stream is in flight until its end.
 * - An abort of the caller ends the wait at once, and the procedure gets the abort.
 * - The drain of the service aborts a stream: it ends in-band, with `UNAVAILABLE`.
 * - A face that no host uses gives `UNAVAILABLE`.
 */

import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { service, type Lifecycle, type ServiceBuilder } from "@mark1russell7/service";
import { fakeProcess } from "@mark1russell7/service/testing";
import { Client, createProcedure, createRegistry, hostPolicy, ms, seconds, type ProcedureRegistry } from "@procedures/client";
import { createProcedureHost, localFace, type LocalFace } from "./index.js";

const READS = { reads: [], writes: [] };

/** A promise and the function that resolves it. */
function newMark(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((given) => {
    resolve = given;
  });
  return { promise, resolve };
}

/** A promise that resolves at the abort of the signal. */
function aborted(signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!signal || signal.aborted) return resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

/** The state of the stream procedure of a test: its first row went out, and its call got the abort. */
let firstRow = newMark();
let abortSeen = newMark();

function registryOf(): ProcedureRegistry {
  return createRegistry({
    name: "local-face-test",
    procedures: [
      createProcedure()
        .path(["test", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.string())
        .meta({ effects: READS })
        .handler(async (input) => input.text)
        .build(),
      createProcedure()
        .path(["test", "count"])
        .input(z.object({ to: z.number() }))
        .output(z.number())
        .meta({ effects: READS })
        .handler(async function* (input: { to: number }) {
          for (let n = 1; n <= input.to; n++) yield n;
        } as never)
        .build(),
      createProcedure()
        .path(["test", "endless"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: READS })
        .handler(async function* (_input: unknown, ctx: { signal?: AbortSignal | undefined }) {
          yield "row 1";
          firstRow.resolve();
          await aborted(ctx.signal);
          abortSeen.resolve();
        } as never)
        .build(),
      createProcedure()
        .path(["test", "fails"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: READS })
        .handler(async function* () {
          yield "row 1";
          throw Object.assign(new Error("the disk is full"), { code: "DISK_FULL" });
        } as never)
        .build(),
    ],
  });
}

/** A service with short stages and the abort at the start of the drain, as the profile `ephemeral` has. */
function serviceOf(name: string): ServiceBuilder {
  return service(name)
    .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
    .liveness({ type: "window", failAfter: seconds(45) })
    .startup(seconds(10))
    .phase("stop intake", ms(200))
    .phase("drain", ms(1000))
    .phase("close transports", ms(200))
    .phase("stop the poller", ms(100))
    .cooperativeWindow(ms(1000))
    .cooperativeFloor("none")
    .onRepeatSignal("ignore");
}

const lives: Lifecycle[] = [];
afterEach(async () => {
  for (const life of lives.splice(0)) {
    await life.shutdown("the test ended");
    await life.done;
  }
  firstRow = newMark();
  abortSeen = newMark();
});

/** A host with only the local face, under `run()`, and a client of the face. */
async function runLocalHost(name: string): Promise<{ local: LocalFace; life: Lifecycle; client: Client }> {
  const local = localFace();
  const host = createProcedureHost({ name, registry: registryOf(), policy: hostPolicy({ token: "secret" }), faces: { local: local.face } });
  const life = await host.declare(serviceOf(name)).run({ process: fakeProcess() });
  lives.push(life);
  return { local, life, client: new Client({ transport: local.transport, throwOnError: true }) };
}

describe("localFace", () => {
  it("gives a value and a stream, with LOCAL_CREDENTIALS past the token of the policy", async () => {
    const { client } = await runLocalHost("values");
    expect(await client.call({ service: "test", operation: "echo" }, { text: "hello" })).toBe("hello");
    const items: unknown[] = [];
    for await (const item of client.stream({ service: "test", operation: "count" }, { to: 3 })) items.push(item);
    expect(items).toEqual([1, 2, 3]);
    await expect(client.call({ service: "test", operation: "echo" }, { text: 4 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(client.call({ service: "test", operation: "nosuch" }, {})).rejects.toThrow();
  });

  it("counts a stream in the service until its end, and ends a failed stream with the code of its error", async () => {
    const { client, life } = await runLocalHost("tracked");
    const stream = client.stream({ service: "test", operation: "count" }, { to: 2 })[Symbol.asyncIterator]();
    expect((await stream.next()).value).toBe(1);
    expect(life.inFlight()).toBe(1);
    expect((await stream.next()).value).toBe(2);
    expect((await stream.next()).done).toBe(true);
    expect(life.inFlight()).toBe(0);

    const items: unknown[] = [];
    const failed = (async () => {
      for await (const item of client.stream({ service: "test", operation: "fails" }, {})) items.push(item);
    })();
    await expect(failed).rejects.toMatchObject({ code: "DISK_FULL", message: "the disk is full" });
    expect(items).toEqual(["row 1"]);
  });

  it("ends the wait at once when the caller aborts, and the procedure gets the abort", async () => {
    const { client, life } = await runLocalHost("caller-abort");
    const controller = new AbortController();
    const items: unknown[] = [];
    const read = (async () => {
      for await (const item of client.stream({ service: "test", operation: "endless" }, {}, { signal: controller.signal })) items.push(item);
    })();
    await firstRow.promise;
    controller.abort();
    await expect(read).rejects.toMatchObject({ code: "ABORTED" });
    await abortSeen.promise;
    expect(items).toEqual(["row 1"]);
    // The call leaves the count of the service when the procedure ends
    await expect.poll(() => life.inFlight()).toBe(0);
  });

  it("ends a stream in-band with UNAVAILABLE when the drain of the service aborts it", async () => {
    const { client, life } = await runLocalHost("drain");
    const items: unknown[] = [];
    const read = (async () => {
      for await (const item of client.stream({ service: "test", operation: "endless" }, {})) items.push(item);
    })();
    await firstRow.promise;
    const done = life.shutdown("the test stops");
    await expect(read).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await abortSeen.promise;
    expect(items).toEqual(["row 1"]);
    expect(await done).toBe(0);
  });

  it("gives UNAVAILABLE when no host uses the face", async () => {
    const client = new Client({ transport: localFace().transport, throwOnError: true });
    await expect(client.call({ service: "test", operation: "echo" }, { text: "x" })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await localFace().transport.close();
  });
});
