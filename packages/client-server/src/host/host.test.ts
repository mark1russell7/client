/**
 * The procedures host under the runner (CLI-7, decisions D2, D3 and D4).
 *
 * - `declare(svc)` gives the service the parts of the host: the server, the stop parts of the
 *   faces, a transport for each listener, a dependency for each storage, and one route pattern
 *   for each face.
 * - Under `run()`, each call goes through `life.request`. A stream stays in flight, and it ends
 *   in-band at the cooperative abort of the drain.
 * - Without a listener, the app mounts `host.handler` on a listener of its own.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import { z } from "zod";
import { service, type Lifecycle, type ServiceBuilder } from "@mark1russell7/service";
import { httpTransport } from "@mark1russell7/service/http";
import { fakeProcess } from "@mark1russell7/service/testing";
import { createProcedure, createRegistry, hostPolicy, ms, seconds, type CollectionStorage, type ProcedureRegistry } from "@procedures/client";
import { createProcedureHost, LOCAL_LISTENER_KNOBS, operationOfCall, type ProcedureHost } from "./index.js";

const READ = { reads: [], writes: [] };

/** A registry with a unary call and a stream that runs until its abort. */
function registryOf(): ProcedureRegistry {
  return createRegistry({
    name: "host-test",
    procedures: [
      createProcedure()
        .path(["test", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.string())
        .meta({ effects: READ })
        .handler(async (input) => input.text)
        .build(),
      createProcedure()
        .path(["test", "ticks"])
        .input(z.object({}))
        .output(z.number())
        .meta({ effects: READ })
        .handler(async function* (_input: unknown, ctx: { signal?: AbortSignal | undefined }) {
          let tick = 0;
          while (!ctx.signal?.aborted) {
            yield ++tick;
            await new Promise<void>((resolve) => setTimeout(resolve, 20));
          }
        } as never)
        .build(),
    ],
  });
}

/** A storage of no data, for the declaration of a collection. */
function emptyStorage(): CollectionStorage<unknown> {
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
    close: async () => undefined,
  };
}

/** A service with short stages, so a test shuts it down in a second or two. */
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

/**
 * A reader of the NDJSON lines of a body. Each use reads until `until` is true, or until the body
 * ends, and gives each line so far as a JSON value.
 */
function lineReader(body: ReadableStream<Uint8Array>): (until?: (lines: unknown[]) => boolean) => Promise<unknown[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const lines: unknown[] = [];
  let buffer = "";
  return async (until) => {
    for (;;) {
      if (until?.(lines)) return lines;
      const { done, value } = await reader.read();
      if (done) return lines;
      buffer += decoder.decode(value, { stream: true });
      let end = buffer.indexOf("\n");
      while (end >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (line !== "") lines.push(JSON.parse(line));
        end = buffer.indexOf("\n");
      }
    }
  };
}

const lives: Lifecycle[] = [];
afterEach(async () => {
  for (const life of lives.splice(0)) {
    await life.shutdown("the test ended");
    await life.done;
  }
});

describe("createProcedureHost (CLI-7)", () => {
  it("declares its parts, a dependency for each storage, and one route pattern for each face", async () => {
    const host: ProcedureHost = createProcedureHost({
      registry: registryOf(),
      faces: { http: true, ws: true },
      listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
      collections: { things: emptyStorage() },
    });
    const description = host.declare(serviceOf("declare")).describe();
    expect(description.transports.map((transport) => transport.name)).toEqual(["procedures", "procedures.ws", "procedures.listen.http"]);
    expect(description.dependencies.map((dependency) => dependency.name)).toEqual(["collections.things"]);
    const controller = description.controllers.find((each) => each.name === "procedures");
    expect(controller?.patterns?.map((pattern) => pattern.pattern)).toEqual(["http *", "ws *"]);
    expect(Object.keys(controller?.patterns?.[0]?.operations ?? {}).sort()).toEqual(["keyed", "once", "repeatable"]);
    // The collection procedures come from the declarative option
    expect(host.server.hasProcedure(["collections", "things", "get"])).toBe(true);
    // The operation of a call comes from its detail
    expect(operationOfCall({ controller: "procedures", route: "http test.echo", params: {}, wildcards: ["test.echo"], detail: { face: "http", key: "test.echo", operation: "repeatable" } })).toBe("repeatable");
    expect(operationOfCall({ controller: "procedures", route: "http x.y", params: {}, wildcards: ["x.y"], detail: undefined })).toBe("once");
    // The WebSocket face opened its server at its construction
    await host.parts.find((part) => part.name === "procedures.ws")?.impl.close();
  });

  it("runs under run(): each call goes through life.request, and a stream ends in-band at the cooperative abort", async () => {
    const host = createProcedureHost({
      registry: registryOf(),
      policy: hostPolicy({ token: "host-token" }),
      listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
    });
    const process = fakeProcess();
    const life = await host.declare(serviceOf("run")).run({ process });
    lives.push(life);
    expect(life.state).toBe("running");
    const [endpoint] = host.info.endpoints();
    expect(endpoint?.type).toBe("http");
    const base = endpoint!.address;
    const headers = { "content-type": "application/json", authorization: "Bearer host-token" };

    const echo = await fetch(`${base}/test/echo`, { method: "POST", headers, body: JSON.stringify({ text: "hi" }) });
    expect(echo.status).toBe(200);
    expect(await echo.json()).toBe("hi");
    // The token of the policy applies to each face: a call without it is refused
    const refused = await fetch(`${base}/test/echo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "hi" }) });
    await refused.arrayBuffer();
    expect(refused.status).toBe(401);

    const stream = await fetch(`${base}/test/ticks`, { method: "POST", headers: { ...headers, accept: "application/x-ndjson" }, body: "{}" });
    expect(stream.status).toBe(200);
    const read = lineReader(stream.body!);
    await read((lines) => lines.length >= 1);
    // The stream is a request of the service until its end
    expect(life.inFlight("procedures")).toBe(1);

    const exited = life.shutdown("the test stops the host");
    const lines = await read();
    const last = lines.at(-1) as { type?: string; error?: { code?: string } } | undefined;
    // The cooperative abort ends the stream in its protocol, with an error line
    expect(last?.type).toBe("error");
    expect(typeof last?.error?.code).toBe("string");
    await exited;
    await life.done;
    lives.splice(lives.indexOf(life), 1);
    expect(process.exits).toHaveLength(1);
    expect(host.server.inFlight()).toBe(0);
  }, 20000);

  it("mounts on the listener of an app: the app owns the port, and the host gives its handler", async () => {
    const host = createProcedureHost({ registry: registryOf() });
    const app = httpTransport(createServer(), LOCAL_LISTENER_KNOBS, { listen: { port: 0, host: "127.0.0.1" } });
    app.mount((req, res) => host.handler(req, res));
    app.mount((_req, res) => {
      res.statusCode = 200;
      res.end("the route of the app");
      return true;
    });
    const svc = host.declare(serviceOf("mount").server("app.http", app.knobs, app));
    const life = await svc.run({ process: fakeProcess() });
    lives.push(life);
    // The host owns no listener, so it has no endpoint of its own
    expect(host.info.endpoints()).toEqual([]);
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const echo = await fetch(`http://127.0.0.1:${port}/api/test/echo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "mounted" }) });
    expect(echo.status).toBe(200);
    expect(await echo.json()).toBe("mounted");
    const other = await fetch(`http://127.0.0.1:${port}/chat`);
    expect(await other.text()).toBe("the route of the app");
  }, 20000);
});
