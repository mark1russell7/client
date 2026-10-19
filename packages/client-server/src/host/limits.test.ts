/**
 * The limits of the calls on each face of the host (CLI-40).
 *
 * - The policy of the host gives a limit of the writes of each tenant. The server makes one keyed
 *   limiter of `@mark1russell7/service/limiter` for it, on the clock of the host, and the host
 *   declares it on its service: `describe()` shows it.
 * - Above the limit, a write gets `RATE_LIMITED` with its wait on the HTTP face (429 with
 *   `Retry-After`), on the WebSocket face and on the MCP face. Two tenants do not share a bucket,
 *   and the limit of the writes does not limit the reads.
 * - The limit is in the admission path of the server, not in a face: the writes of one tenant on
 *   the three faces go into one bucket.
 * - The host and its service run on a fake clock: the window moves only when the test moves it.
 */

import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { service, type ServiceBuilder } from "@mark1russell7/service";
import { fakeClock, fakeProcess, seeded } from "@mark1russell7/service/testing";
import { WebSocketTransport, createProcedure, createRegistry, hostPolicy, ms, pathToMethod, seconds, type CallLimit, type PrincipalOf, type ProcedureRegistry } from "@procedures/client";
import { mcpFace } from "@procedures/mcp-server";
import { createProcedureHost, LOCAL_LISTENER_KNOBS, type ProcedureHost } from "./index.js";

const WRITES = { reads: ["notes"], writes: ["notes"] };
const READS = { reads: ["notes"], writes: [] };
const FACES = ["http", "ws", "mcp"] as const;
type Face = (typeof FACES)[number];

/** A registry with a procedure that writes and a procedure that only reads. */
function registryOf(): ProcedureRegistry {
  const tag = z.object({ tag: z.string() });
  return createRegistry({
    name: "limits-test",
    procedures: [
      createProcedure().path(["notes", "write"]).input(tag).output(z.string()).meta({ effects: WRITES }).handler(async () => "written").build(),
      createProcedure().path(["notes", "read"]).input(tag).output(z.string()).meta({ effects: READS }).handler(async () => "read").build(),
    ],
  });
}

/** The request hook of the test: the bearer token `tok-<tenant>` names the tenant of the principal. */
const principalOf: PrincipalOf = (credentials) => {
  const tenant = credentials.bearer?.startsWith("tok-") ? credentials.bearer.slice(4) : undefined;
  return tenant === undefined ? undefined : { principal: { id: `user:${tenant}`, via: "test", claims: { tenant } } };
};

/** Two writes of each tenant in each 10 seconds. */
const WRITES_PER_TENANT: CallLimit = {
  name: "notes.writes",
  key: { claim: "tenant" },
  covers: { writes: true },
  policy: { type: "sliding-window", limit: { value: 2, unit: "count" }, window: seconds(10) },
  store: { kind: "local" },
  evict: { maxKeys: { value: 1000, unit: "count" } },
};

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

/** The end of a call on a face, as data: the faces give the same shape. The HTTP face also gives its status and `Retry-After`. */
interface CallEnd {
  readonly ok: boolean;
  readonly code?: string | undefined;
  readonly retryable?: boolean | undefined;
  readonly retryAfterMs?: number | undefined;
  readonly reason?: string | undefined;
  readonly status?: number | undefined;
  readonly retryAfter?: string | null | undefined;
}

let cleanups: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A host with the three faces on one listener, under `run()` on a fake clock, and a function that calls a procedure on one face. */
async function runHost(): Promise<{ host: ProcedureHost; svc: ServiceBuilder; advance: (time: number) => Promise<void>; call: (face: Face, tenant: string, procedure: string) => Promise<CallEnd> }> {
  const clock = fakeClock();
  const host = createProcedureHost({
    name: "limited",
    registry: registryOf(),
    clock,
    policy: hostPolicy({ principalOf, limits: [WRITES_PER_TENANT] }),
    // The request hook reads only the bearer token, not the cookies
    serverOptions: { ambientCredentials: false },
    faces: { http: true, ws: true, mcp: mcpFace({ serverInfo: { name: "limited", version: "0.0.0" } }) },
    listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
  });
  const svc = host.declare(serviceOf("limited"));
  await svc.run({ clock, process: fakeProcess({ clock }), random: seeded(7) });
  await clock.advance(0);
  cleanups.push(async () => {
    for (const part of [...host.parts].reverse()) await part.impl.close();
  });
  const address = (type: string): string => host.info.endpoints().find((endpoint) => endpoint.type === type)!.address;

  // One connection of each tenant: WebSocket takes the token at the upgrade, MCP in each request
  const sockets = new Map<string, WebSocketTransport>();
  const socketOf = (tenant: string): WebSocketTransport => {
    let socket = sockets.get(tenant);
    if (!socket) {
      socket = new WebSocketTransport({ url: `${address("websocket")}?token=tok-${tenant}`, heartbeat: { enabled: false }, reconnect: { enabled: false } });
      sockets.set(tenant, socket);
      const opened = socket;
      cleanups.push(() => opened.close());
    }
    return socket;
  };
  const sessions = new Map<string, McpClient>();
  const sessionOf = async (tenant: string): Promise<McpClient> => {
    let session = sessions.get(tenant);
    if (!session) {
      session = new McpClient({ name: "limits-test", version: "0" });
      // The SDK types do not agree with exactOptionalPropertyTypes
      await session.connect(new StreamableHTTPClientTransport(new URL(address("mcp")), { requestInit: { headers: { authorization: `Bearer tok-${tenant}` } } }) as never);
      sessions.set(tenant, session);
      const opened = session;
      cleanups.push(() => opened.close().catch(() => undefined));
    }
    return session;
  };

  let sent = 0;
  const faces: Record<Face, (tenant: string, procedure: string) => Promise<CallEnd>> = {
    http: async (tenant, procedure) => {
      const response = await fetch(`${address("http")}/notes/${procedure}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer tok-${tenant}` },
        body: JSON.stringify({ tag: "http" }),
      });
      const body = (await response.json()) as { code?: string; retryable?: boolean; retryAfterMs?: number; reason?: string };
      const http = { status: response.status, retryAfter: response.headers.get("retry-after") };
      if (response.ok) return { ok: true, ...http };
      return { ok: false, code: body.code, retryable: body.retryable, retryAfterMs: body.retryAfterMs, reason: body.reason, ...http };
    },
    ws: async (tenant, procedure) => {
      const message = { id: `ws-${++sent}`, method: pathToMethod(["notes", procedure]), payload: { tag: "ws" }, metadata: {} };
      for await (const item of socketOf(tenant).send(message)) {
        if (item.status.type === "success") return { ok: true };
        const metadata = item.metadata as Record<string, unknown>;
        return {
          ok: false,
          code: item.status.code,
          retryable: item.status.retryable,
          retryAfterMs: metadata["retry-after"] as number | undefined,
          reason: metadata["reason"] as string | undefined,
        };
      }
      throw new Error("The WebSocket call gave no item");
    },
    mcp: async (tenant, procedure) => {
      const result = (await (await sessionOf(tenant)).callTool({ name: `notes.${procedure}`, arguments: { tag: "mcp" } })) as {
        isError?: boolean;
        _meta?: { code?: string; retryable?: boolean; retryAfterMs?: number; reason?: string };
      };
      if (result.isError !== true) return { ok: true };
      const meta = result._meta ?? {};
      return { ok: false, code: meta.code, retryable: meta.retryable, retryAfterMs: meta.retryAfterMs, reason: meta.reason };
    },
  };
  return { host, svc, advance: (time) => clock.advance(time), call: (face, tenant, procedure) => faces[face](tenant, procedure) };
}

describe("the limits of the calls on each face of the host (CLI-40)", () => {
  it("declares each limiter on the service of the host, with its spec", () => {
    const host = createProcedureHost({ registry: registryOf(), policy: hostPolicy({ principalOf, limits: [WRITES_PER_TENANT] }) });
    expect(host.limiters.map((limiter) => limiter.name)).toEqual(["notes.writes"]);
    expect(host.declare(serviceOf("declared")).describe().limiters).toEqual([
      { name: "notes.writes", key: "tenant", policy: WRITES_PER_TENANT.policy, store: { kind: "local" }, evict: WRITES_PER_TENANT.evict },
    ]);
    // Without limits, the service declares no limiter
    expect(createProcedureHost({ registry: registryOf() }).declare(serviceOf("plain")).describe()).not.toHaveProperty("limiters");
  });

  it("refuses the writes of a tenant above the limit with RATE_LIMITED on HTTP, WebSocket and MCP, with a bucket for each tenant", async () => {
    const { advance, call } = await runHost();
    const refused = { ok: false, code: "RATE_LIMITED", retryable: true, retryAfterMs: 10_000, reason: "limit" };
    for (const face of FACES) {
      const [first, second] = [`${face}-first`, `${face}-second`];
      expect(await call(face, first, "write"), `write 1 on ${face}`).toMatchObject({ ok: true });
      expect(await call(face, first, "write"), `write 2 on ${face}`).toMatchObject({ ok: true });
      expect(await call(face, first, "write"), `write 3 on ${face}`).toMatchObject(refused);
      // Two tenants do not share a bucket
      expect(await call(face, second, "write"), `the other tenant on ${face}`).toMatchObject({ ok: true });
      // The limit of the writes does not limit the reads
      for (let n = 0; n < 3; n++) expect(await call(face, first, "read"), `read ${n + 1} on ${face}`).toMatchObject({ ok: true });
    }
    // HTTP: 429 with Retry-After in whole seconds
    expect(await call("http", "http-first", "write")).toMatchObject({ ...refused, status: 429, retryAfter: "10" });

    // After the window, each tenant can write again
    await advance(10_000);
    for (const face of FACES) expect(await call(face, `${face}-first`, "write"), `the next window on ${face}`).toMatchObject({ ok: true });
  }, 20000);

  it("counts the writes of one tenant on each face in one bucket: the limit is in the server, not in a face", async () => {
    const { call } = await runHost();
    expect(await call("http", "acme", "write")).toMatchObject({ ok: true });
    expect(await call("ws", "acme", "write")).toMatchObject({ ok: true });
    expect(await call("mcp", "acme", "write")).toMatchObject({ ok: false, code: "RATE_LIMITED", retryAfterMs: 10_000 });
    expect(await call("http", "acme", "write")).toMatchObject({ ok: false, code: "RATE_LIMITED", status: 429, retryAfter: "10" });
    expect(await call("ws", "acme", "write")).toMatchObject({ ok: false, code: "RATE_LIMITED", retryAfterMs: 10_000 });
  }, 20000);
});
