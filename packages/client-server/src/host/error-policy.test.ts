/**
 * The error policy of the server (roadmap CLI-80) in a host.
 *
 * - `serverOptions.errors` reaches the server of the host.
 * - `map` gets the real error of its own class through the admission of the host (the request
 *   hook and the policy of the host) and its interceptors, with the path and the face.
 * - Under `"coded"`, the HTTP face sends `INTERNAL_ERROR` with the message `"internal error"`,
 *   and `onError` gets the real error one time.
 * - When `handle()` throws, the tracked call of the host applies the same policy.
 */

import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { service, type ServiceBuilder } from "@mark1russell7/service";
import { fakeClock, fakeProcess, seeded } from "@mark1russell7/service/testing";
import { createProcedure, createRegistry, hostPolicy, ms, seconds, type ErrorCall, type PrincipalOf, type ServerErrorPolicy } from "@procedures/client";
import { createProcedureHost, LOCAL_LISTENER_KNOBS } from "./index.js";

const READS = { reads: ["notes"], writes: [] };

/** An error class of the application: the policy must give `map` this class, not a copy. */
class StoreError extends Error {
  constructor(
    message: string,
    readonly table: string,
  ) {
    super(message);
  }
}

/** The request hook of the test: the bearer token `tok-a` names the principal. */
const principalOf: PrincipalOf = (credentials) => (credentials.bearer === "tok-a" ? { principal: { id: "user:a", via: "test", claims: {} } } : undefined);

/** A service with short stages. */
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

let cleanups: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A host with the HTTP face and this error policy, and the errors that `onError` got. */
async function runHost(errors: ServerErrorPolicy, onRequest?: () => void): Promise<{ url: string; logged: Error[] }> {
  const clock = fakeClock();
  const logged: Error[] = [];
  const host = createProcedureHost({
    name: "errors",
    registry: createRegistry({
      name: "errors-test",
      procedures: [
        createProcedure()
          .path(["notes", "read"])
          .input(z.object({}))
          .output(z.string())
          .meta({ effects: READS })
          .handler(async (): Promise<string> => {
            throw new StoreError("relation notes_v2 does not exist", "notes_v2");
          })
          .build(),
      ],
    }),
    clock,
    policy: hostPolicy({ principalOf }),
    serverOptions: { ambientCredentials: false, onError: (error) => void logged.push(error), errors, ...(onRequest ? { onRequest } : {}) },
    faces: { http: true },
    listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
  });
  const svc = host.declare(serviceOf("errors"));
  await svc.run({ clock, process: fakeProcess({ clock }), random: seeded(7) });
  await clock.advance(0);
  cleanups.push(async () => {
    for (const part of [...host.parts].reverse()) await part.impl.close();
  });
  return { url: host.info.endpoints().find((endpoint) => endpoint.type === "http")!.address, logged };
}

/** The status and the body of a call of `notes.read` on the HTTP face. */
async function readNotes(url: string): Promise<{ status: number; body: { error?: string; code?: string; retryable?: boolean; retryAfterMs?: number } }> {
  const response = await fetch(`${url}/notes/read`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok-a" },
    body: "{}",
  });
  return { status: response.status, body: (await response.json()) as { error?: string; code?: string; retryable?: boolean; retryAfterMs?: number } };
}

describe("the error policy in a host (CLI-80)", () => {
  it("sends the wait of a map result when handle() throws", async () => {
    const { url } = await runHost({ expose: "coded", map: () => ({ code: "TOO_MANY_REQUESTS", message: "Try again soon", retryable: true, retryAfterMs: 1500 }) }, () => {
      throw new Error("the pool is exhausted");
    });
    const { status, body } = await readNotes(url);
    expect(status).toBe(429);
    expect(body).toMatchObject({ code: "TOO_MANY_REQUESTS", error: "Try again soon", retryable: true, retryAfterMs: 1500 });
  });

  it("gives map the real error of its own class through the admission of the host, and hides it under coded", async () => {
    const seen: Array<{ error: unknown; call: ErrorCall }> = [];
    const { url, logged } = await runHost({ expose: "coded", map: (error, call) => void seen.push({ error, call }) });
    const { status, body } = await readNotes(url);
    expect(status).toBe(500);
    expect(body).toMatchObject({ code: "INTERNAL_ERROR", error: "internal error", retryable: false });
    expect(JSON.stringify(body)).not.toContain("notes_v2");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.error).toBeInstanceOf(StoreError);
    expect((seen[0]!.error as StoreError).table).toBe("notes_v2");
    expect(seen[0]!.call).toEqual({ path: ["notes", "read"], transport: "http" });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toBeInstanceOf(StoreError);
  });

  it("sends the result of map as it is", async () => {
    const { url, logged } = await runHost({
      expose: "coded",
      map: (error) => (error instanceof StoreError ? { code: "STORE_DOWN", message: "The store is down", retryable: true } : undefined),
    });
    const { body } = await readNotes(url);
    expect(body).toMatchObject({ code: "STORE_DOWN", error: "The store is down", retryable: true });
    expect(logged).toEqual([]);
  });

  it('sends "internal error" under coded when handle() throws, and logs the real error one time', async () => {
    const { url, logged } = await runHost({ expose: "coded" }, () => {
      throw new Error("E11000 duplicate key error collection: app.notes");
    });
    const { status, body } = await readNotes(url);
    expect(status).toBe(500);
    expect(body).toMatchObject({ code: "INTERNAL_ERROR", error: "internal error", retryable: false });
    expect(logged.map((error) => error.message)).toEqual(["E11000 duplicate key error collection: app.notes"]);
  });
});
