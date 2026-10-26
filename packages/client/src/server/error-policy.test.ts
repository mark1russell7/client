/**
 * The error policy of the server (roadmap CLI-80), on the HTTP face and on the WebSocket face.
 *
 * - The default (`expose: "all"`) sends each error as before: a raw message goes to the caller.
 * - `expose: "coded"` sends an error with a known code as it is. Each other error goes as
 *   `INTERNAL_ERROR` with the message `"internal error"`, and the server logs the real error.
 * - `map` runs first, and its result goes to the caller as it is.
 * - The policy applies to an error before a stream and to the error that ends a stream.
 * - A nested call of `ctx.client` keeps the real error.
 * - The last-resort catch of a face (`handle()` throws, or the face cannot encode a value) applies
 *   the same policy, and the logger gets each error one time.
 * - A hidden error keeps its real retryable flag, and the metadata keys that are not error keys.
 * - `map` gets the real error of its own class, also through a middleware that copies the status.
 *
 * The MCP face has the same cases in `client-mcp/src/transport/error-policy.test.ts`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { HttpServerTransport } from "../adapters/http/server/index.js";
import { HttpTransport } from "../adapters/http/client/index.js";
import { WebSocketServerTransport } from "../adapters/websocket/server/transport.js";
import { WebSocketTransport } from "../adapters/websocket/client/transport.js";
import { Client } from "../client/client.js";
import type { Transport } from "../client/types.js";
import { isKnownErrorCode } from "../client/errors/registry.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import type { ProcedureContext } from "../procedures/types.js";
import { ProcedureServer, type ProcedureServerOptions } from "./procedure-server.js";
import { exposeError, exposedResponse, type ErrorCall, type ServerErrorPolicy } from "./error-policy.js";
import { errorResponse } from "./error-response.js";
import { pathToMethod } from "./method.js";
import { requestCredentials } from "./request-auth.js";
import { ServerError, type ServerRequest, type ServerResponse } from "./types.js";

const READS = { reads: [], writes: [] };

/** The errors of `test.fail`, by kind. */
const KINDS = ["raw", "coded", "conflict", "econnrefused", "mongo", "secret", "quota", "busy"] as const;
type Kind = (typeof KINDS)[number];

/** The raw message of a duplicate key of MongoDB: it names the database, the index and the value. */
const MONGO_MESSAGE = 'E11000 duplicate key error collection: app.users index: email_1 dup key: { email: "a@example.com" }';

/** The error of each kind. */
function errorOf(kind: Kind): unknown {
  switch (kind) {
    case "raw":
      return new Error(MONGO_MESSAGE);
    case "coded":
      return new ServerError("No user has the id u1", "NOT_FOUND");
    case "conflict":
      // A plain Error with a known code of ERROR_REGISTRY: a deliberate refusal
      return Object.assign(new Error("The row changed"), { code: "CONFLICT", retryable: true });
    case "econnrefused":
      // A transient failure: the driver marks it retryable
      return Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:19100"), { code: "ECONNREFUSED", errno: -111, address: "127.0.0.1", port: 19100, retryable: true });
    case "mongo":
      return Object.assign(new Error(MONGO_MESSAGE), { code: 11000, codeName: "DuplicateKey", keyValue: { email: "a@example.com" } });
    case "secret":
      // A raw error with fields that a face could send: a cause, details, data and a wait
      return Object.assign(new Error("password=hunter2", { cause: new Error("cause=hunter2") }), {
        details: { secret: "hunter2" },
        data: { secret: "hunter2" },
        retryAfterMs: 5,
        retryable: true,
      });
    case "quota":
      // A code of the application, which the option codes names
      return new ServerError("The quota of the plan is used", "QUOTA_EXCEEDED");
    case "busy":
      // A raw error that map turns into a refusal with a wait
      return new Error("the pool of db-7.internal has no free connection");
  }
}

/** The real retryable flag of the error of each kind that "coded" hides. */
const HIDDEN_RETRYABLE: Record<"raw" | "econnrefused" | "mongo" | "secret", boolean> = { raw: false, econnrefused: true, mongo: false, secret: true };

/** An error class of the application, for the link to the real error. */
class StoreError extends Error {
  constructor(
    message: string,
    readonly table: string,
  ) {
    super(message);
  }
}

/** The input of `test.fail`: the kind of its error, and where it throws (before a stream, or in it). */
interface FailInput {
  readonly kind: Kind;
  readonly at?: "call" | "stream";
}

function registryOf() {
  return createRegistry({
    name: "error-policy",
    procedures: [
      createProcedure()
        .path(["test", "fail"])
        .input(z.object({ kind: z.enum(KINDS), at: z.enum(["call", "stream"]).optional() }))
        .output(z.string())
        .meta({ effects: READS })
        .handler((async (input: FailInput) => {
          if (input.at !== "stream") throw errorOf(input.kind);
          return (async function* () {
            yield "row 1";
            throw errorOf(input.kind);
          })();
        }) as never)
        .build(),
      // A handler that gives a wrong shape: OUTPUT_VALIDATION_ERROR names the field and the value
      createProcedure()
        .path(["test", "shape"])
        .input(z.object({}))
        .output(z.object({ secretField: z.string() }))
        .meta({ effects: READS })
        .handler((async () => ({ secretField: 42 })) as never)
        .build(),
      // A value that JSON cannot encode: the face fails after handle()
      createProcedure()
        .path(["test", "bigint"])
        .input(z.object({}))
        .output(z.unknown())
        .meta({ effects: READS })
        .handler((async () => ({ total: 10n })) as never)
        .build(),
      // An error of a class of the application
      createProcedure()
        .path(["test", "store"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: READS })
        .handler((async () => {
          throw new StoreError("relation users_v2 does not exist", "users_v2");
        }) as never)
        .build(),
      // A nested call: the outer handler gets the real error of the inner call
      createProcedure()
        .path(["test", "outer"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: READS, calls: ["test.fail"] })
        .handler((async (_input: unknown, ctx: ProcedureContext) => {
          try {
            await ctx.client.call(["test", "fail"], { kind: "raw" });
            return "no error";
          } catch (error) {
            return (error as Error).message;
          }
        }) as never)
        .build(),
    ],
  });
}

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  return (http.address() as AddressInfo).port;
}

/** A server with an HTTP face and a WebSocket face, and the errors that its logger got. */
interface Served {
  readonly logged: unknown[];
  readonly calls: ErrorCall[];
  readonly faces: ReadonlyArray<{ readonly face: string; readonly transport: () => Transport }>;
  readonly stop: () => Promise<void>;
}

async function serve(errors: ServerErrorPolicy | undefined, more: Partial<ProcedureServerOptions> = {}): Promise<Served> {
  const logged: unknown[] = [];
  const calls: ErrorCall[] = [];
  const policy: ServerErrorPolicy | undefined = errors?.map
    ? { ...errors, map: (error, call) => (calls.push(call), errors.map!(error, call)) }
    : errors;
  const options: ProcedureServerOptions = {
    registry: registryOf(),
    autoRegister: true,
    onError: (error: Error, _request: ServerRequest) => void logged.push(error),
    ...(policy ? { errors: policy } : {}),
    ...more,
  };
  const httpServer = new ProcedureServer(options);
  const app = express();
  const httpListener = createServer(app);
  httpServer.addTransport(new HttpServerTransport(httpServer, { app, httpServer: httpListener }));
  await httpServer.start();
  const httpPort = await listen(httpListener);

  const wsServer = new ProcedureServer(options);
  const wsListener = createServer();
  wsServer.addTransport(new WebSocketServerTransport(wsServer, { server: wsListener, path: "/ws", heartbeat: false }));
  await wsServer.start();
  const wsUrl = `ws://127.0.0.1:${await listen(wsListener)}/ws`;

  const close = async (server: ProcedureServer, http: HttpServer): Promise<void> => {
    await server.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };
  return {
    logged,
    calls,
    faces: [
      { face: "http", transport: () => new HttpTransport({ baseUrl: `http://127.0.0.1:${httpPort}/api` }) },
      { face: "websocket", transport: () => new WebSocketTransport({ url: wsUrl, heartbeat: { enabled: false }, reconnect: { enabled: false } }) },
    ],
    stop: async () => {
      await close(httpServer, httpListener).catch(() => undefined);
      await close(wsServer, wsListener).catch(() => undefined);
    },
  };
}

/** What the caller sees of an error: its code, its message, its retryable flag and its other fields. */
interface CallerError {
  readonly code: string | undefined;
  readonly message: string;
  readonly retryable: boolean | undefined;
  readonly text: string;
}

/** The error of a call of `test.fail` (or of another path) on a face, as the caller sees it. A stream call reads each item. */
async function callerError(transportOf: () => Transport, input: FailInput | Record<string, never>, path: readonly string[] = ["test", "fail"]): Promise<CallerError> {
  const transport = transportOf();
  const client = new Client({ transport, throwOnError: true });
  try {
    if ("at" in input && input.at === "stream") {
      for await (const _item of client.stream(pathToMethod([...path]), input)) void _item;
    } else {
      await client.call(pathToMethod([...path]), input);
    }
    throw new Error("the call did not fail");
  } catch (error) {
    const { code, message, retryable } = error as { code?: string; message: string; retryable?: boolean };
    // Each field of the error, the cause and the metadata too, as one text
    let text: string;
    try {
      text = JSON.stringify(error, Object.getOwnPropertyNames(error)) + JSON.stringify(error);
    } catch {
      text = String(error);
    }
    return { code, message, retryable, text: `${text} ${String((error as { cause?: unknown }).cause ?? "")}` };
  } finally {
    await transport.close();
  }
}

/** The view of a hidden error. Its retryable flag is the flag of the real error. */
const HIDDEN = { code: "INTERNAL_ERROR", message: "internal error" };

describe("isKnownErrorCode", () => {
  it("knows the codes of the protocol and of ERROR_REGISTRY, and no code of the platform or of MongoDB", () => {
    for (const code of ["NOT_FOUND", "FORBIDDEN", "VALIDATION_ERROR", "CONFLICT", "BAD_REQUEST", "PAYLOAD_TOO_LARGE", "TOO_MANY_REQUESTS"]) expect(isKnownErrorCode(code), code).toBe(true);
    for (const code of ["ECONNREFUSED", "ENOENT", 11000, "toString", "__proto__", undefined]) expect(isKnownErrorCode(code), String(code)).toBe(false);
  });
});

describe("the default error policy keeps the old behavior (CLI-80)", () => {
  let served: Served;
  beforeAll(async () => {
    served = await serve(undefined);
  });
  afterAll(async () => served.stop());

  it("sends the raw message of an error to the caller, on each face", async () => {
    for (const { face, transport } of served.faces) {
      expect(await callerError(transport, { kind: "raw" }), face).toMatchObject({ code: "HANDLER_ERROR", message: MONGO_MESSAGE });
      expect(await callerError(transport, { kind: "econnrefused" }), face).toMatchObject({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:19100" });
      expect(await callerError(transport, { kind: "raw", at: "stream" }), face).toMatchObject({ code: "HANDLER_ERROR", message: MONGO_MESSAGE });
    }
  });

  it("an explicit expose: \"all\" is the default", async () => {
    const all = await serve({ expose: "all" });
    try {
      for (const { face, transport } of all.faces) {
        expect(await callerError(transport, { kind: "mongo" }), face).toMatchObject({ code: "HANDLER_ERROR", message: MONGO_MESSAGE });
      }
      expect(all.logged).toEqual([]);
    } finally {
      await all.stop();
    }
  });
});

describe("expose: \"coded\" hides each error without a known code (CLI-80)", () => {
  let served: Served;
  beforeAll(async () => {
    served = await serve({ expose: "coded" });
  });
  afterAll(async () => served.stop());

  for (const kind of ["raw", "econnrefused", "mongo", "secret"] as const) {
    for (const at of ["call", "stream"] as const) {
      it(`sends INTERNAL_ERROR "internal error" for the ${kind} error (${at}), and logs the real error`, async () => {
        for (const { face, transport } of served.faces) {
          served.logged.length = 0;
          const seen = await callerError(transport, { kind, at });
          expect(seen, face).toMatchObject({ ...HIDDEN, retryable: HIDDEN_RETRYABLE[kind] });
          for (const leak of ["E11000", "ECONNREFUSED", "19100", "hunter2", "DuplicateKey", "email"]) expect(seen.text, `${face}: ${leak}`).not.toContain(leak);
          expect(served.logged, face).toHaveLength(1);
          expect((served.logged[0] as Error).message, face).toBe((errorOf(kind) as Error).message);
          expect((served.logged[0] as Error).stack, face).toBeTypeOf("string");
        }
      });
    }
  }

  it("sends a coded error with its code and its message", async () => {
    for (const { face, transport } of served.faces) {
      served.logged.length = 0;
      expect(await callerError(transport, { kind: "coded" }), face).toMatchObject({ code: "NOT_FOUND", message: "No user has the id u1", retryable: false });
      expect(await callerError(transport, { kind: "coded", at: "stream" }), face).toMatchObject({ code: "NOT_FOUND", message: "No user has the id u1" });
      expect(served.logged, face).toEqual([]);
    }
  });

  it("sends a plain Error with a known code of ERROR_REGISTRY with its code and its retryable flag", async () => {
    for (const { face, transport } of served.faces) {
      expect(await callerError(transport, { kind: "conflict" }), face).toMatchObject({ code: "CONFLICT", message: "The row changed", retryable: true });
    }
  });

  it("hides OUTPUT_VALIDATION_ERROR, a failure of the server, and logs the real error", async () => {
    for (const { face, transport } of served.faces) {
      served.logged.length = 0;
      const seen = await callerError(transport, {}, ["test", "shape"]);
      expect(seen, face).toMatchObject({ ...HIDDEN, retryable: false });
      expect(seen.text, face).not.toContain("secretField");
      expect(served.logged, face).toHaveLength(1);
      expect((served.logged[0] as { code?: string }).code, face).toBe("OUTPUT_VALIDATION_ERROR");
      expect((served.logged[0] as Error).message, face).toContain("secretField");
    }
  });

  it("hides a code of the application that codes does not name", async () => {
    for (const { face, transport } of served.faces) {
      expect(await callerError(transport, { kind: "quota" }), face).toMatchObject({ ...HIDDEN, retryable: false });
    }
  });

  it("keeps the real error for a nested call of ctx.client", async () => {
    for (const { face, transport: transportOf } of served.faces) {
      const transport = transportOf();
      try {
        const client = new Client({ transport, throwOnError: true });
        expect(await client.call(pathToMethod(["test", "outer"]), {}), face).toBe(MONGO_MESSAGE);
      } finally {
        await transport.close();
      }
    }
  });

  it("keeps the NOT_FOUND of a path that the server does not serve", async () => {
    for (const { face, transport: transportOf } of served.faces) {
      const transport = transportOf();
      try {
        const client = new Client({ transport, throwOnError: true });
        await expect(client.call(pathToMethod(["test", "missing"]), {}), face).rejects.toMatchObject({ code: "NOT_FOUND" });
      } finally {
        await transport.close();
      }
    }
  });
});

describe("the option codes of the error policy (CLI-80)", () => {
  it("sends a code of the application that codes names as it is, before and in a stream", async () => {
    const served = await serve({ expose: "coded", codes: ["QUOTA_EXCEEDED"] });
    try {
      for (const { face, transport } of served.faces) {
        served.logged.length = 0;
        expect(await callerError(transport, { kind: "quota" }), face).toMatchObject({ code: "QUOTA_EXCEEDED", message: "The quota of the plan is used" });
        expect(await callerError(transport, { kind: "quota", at: "stream" }), face).toMatchObject({ code: "QUOTA_EXCEEDED", message: "The quota of the plan is used" });
        // Another error stays hidden
        expect(await callerError(transport, { kind: "raw" }), face).toMatchObject(HIDDEN);
        expect(served.logged.map((error) => (error as Error).message), face).toEqual([MONGO_MESSAGE]);
      }
    } finally {
      await served.stop();
    }
  });
});

describe("the last-resort catch of a face (CLI-80)", () => {
  /** The request hook throws: handle() throws before a handler runs. */
  const throwing: Partial<ProcedureServerOptions> = {
    onRequest: () => {
      throw new Error(MONGO_MESSAGE);
    },
  };

  it("sends the raw message without a policy, as before", async () => {
    const served = await serve(undefined, throwing);
    try {
      for (const { face, transport } of served.faces) {
        expect(await callerError(transport, { kind: "coded" }), face).toMatchObject({ code: "INTERNAL_ERROR", message: MONGO_MESSAGE });
      }
    } finally {
      await served.stop();
    }
  });

  it('sends "internal error" under "coded" when handle() throws, and logs the real error one time', async () => {
    const served = await serve({ expose: "coded" }, throwing);
    try {
      for (const { face, transport } of served.faces) {
        served.logged.length = 0;
        const seen = await callerError(transport, { kind: "coded" });
        expect(seen, face).toMatchObject({ ...HIDDEN, retryable: false });
        expect(seen.text, face).not.toContain("E11000");
        expect(served.logged.map((error) => (error as Error).message), face).toEqual([MONGO_MESSAGE]);
      }
    } finally {
      await served.stop();
    }
  });

  it('sends "internal error" under "coded" when the face cannot encode the value', async () => {
    const served = await serve({ expose: "coded" });
    try {
      for (const { face, transport } of served.faces) {
        served.logged.length = 0;
        expect(await callerError(transport, {}, ["test", "bigint"]), face).toMatchObject(HIDDEN);
        expect(served.logged, face).toHaveLength(1);
        expect((served.logged[0] as Error).message, face).toMatch(/BigInt/);
      }
    } finally {
      await served.stop();
    }
  });

  it("gives map the error of handle(), with the path and the face", async () => {
    const served = await serve({ map: (error) => ((error as Error).message === MONGO_MESSAGE ? { code: "STORE_DOWN", message: "The store is down", retryable: true } : undefined) }, throwing);
    try {
      for (const { face, transport } of served.faces) {
        served.calls.length = 0;
        expect(await callerError(transport, { kind: "coded" }), face).toMatchObject({ code: "STORE_DOWN", message: "The store is down", retryable: true });
        expect(served.calls, face).toEqual([{ path: ["test", "fail"], transport: face }]);
      }
    } finally {
      await served.stop();
    }
  });
});

describe("map of the error policy (CLI-80)", () => {
  let served: Served;
  beforeAll(async () => {
    served = await serve({
      expose: "coded",
      map: (error) => {
        const code = (error as { code?: unknown }).code;
        if (code === 11000) return { code: "EMAIL_TAKEN", message: "The email is in use" };
        if (code === "NOT_FOUND") return new ServerError("Nothing here", "NOT_FOUND");
        return undefined;
      },
    });
  });
  afterAll(async () => served.stop());

  it("sends the result of map as it is, also with a code of the application, before and in a stream", async () => {
    for (const { face, transport } of served.faces) {
      served.logged.length = 0;
      expect(await callerError(transport, { kind: "mongo" }), face).toMatchObject({ code: "EMAIL_TAKEN", message: "The email is in use" });
      expect(await callerError(transport, { kind: "mongo", at: "stream" }), face).toMatchObject({ code: "EMAIL_TAKEN", message: "The email is in use" });
      expect(await callerError(transport, { kind: "coded" }), face).toMatchObject({ code: "NOT_FOUND", message: "Nothing here" });
      expect(served.logged, face).toEqual([]);
    }
  });

  it("gives map the path and the face of the call", async () => {
    for (const { face, transport } of served.faces) {
      served.calls.length = 0;
      await callerError(transport, { kind: "mongo" });
      expect(served.calls, face).toEqual([{ path: ["test", "fail"], transport: face }]);
    }
  });

  it("gives an error to expose when map gives undefined", async () => {
    for (const { face, transport } of served.faces) {
      expect(await callerError(transport, { kind: "econnrefused" }), face).toMatchObject(HIDDEN);
      expect(await callerError(transport, { kind: "conflict" }), face).toMatchObject({ code: "CONFLICT", retryable: true });
    }
  });
});

/** A request of `test.fail` on the HTTP face, for the unit cases of the policy. */
function requestOf(): ServerRequest {
  return { id: "r1", method: pathToMethod(["test", "fail"]), payload: {}, metadata: {}, transport: "http" };
}

/** A stream that gives one item, then fails with this error. */
async function* failingAfterOne(error: unknown): AsyncGenerator<string, void, undefined> {
  yield "row 1";
  throw error;
}

/** The error that ends a stream. */
async function endOf(stream: AsyncIterable<unknown>): Promise<unknown> {
  try {
    for await (const _item of stream) void _item;
  } catch (error) {
    return error;
  }
  throw new Error("the stream did not fail");
}

/** A map result: a refusal with a wait, for the busy error. */
function busyMap(error: unknown) {
  return (error as Error).message.startsWith("the pool") ? Object.assign(new ServerError("Try again soon", "TOO_MANY_REQUESTS", true), { retryAfterMs: 1500 }) : undefined;
}

describe("a map result with metadata (CLI-80)", () => {
  it("sends the wait of a TOO_MANY_REQUESTS result on the status path, on each face", async () => {
    const served = await serve({ expose: "coded", map: busyMap });
    try {
      for (const { face, transport: transportOf } of served.faces) {
        const transport = transportOf();
        try {
          let item: { status: unknown; metadata: Record<string, unknown> } | undefined;
          for await (const got of transport.send({ id: `wait-${face}`, method: pathToMethod(["test", "fail"]), payload: { kind: "busy" }, metadata: {} })) {
            item = got as never;
            break;
          }
          expect(item?.status, face).toMatchObject({ type: "error", code: "TOO_MANY_REQUESTS", message: "Try again soon", retryable: true });
          expect(item?.metadata["retry-after"], face).toBe(1500);
        } finally {
          await transport.close();
        }
      }
      expect(served.logged).toEqual([]);
    } finally {
      await served.stop();
    }
  });

  it("keeps the wait of a map result on the stream path", async () => {
    const response = exposedResponse({ expose: "coded", map: busyMap }, requestOf(), { id: "s1", status: { type: "success", code: 200 }, metadata: {}, stream: failingAfterOne(errorOf("busy")) }, () => undefined);
    expect(await endOf(response.stream!)).toMatchObject({ code: "TOO_MANY_REQUESTS", message: "Try again soon", retryable: true, retryAfterMs: 1500 });
  });
});

describe("the metadata of a hidden error (CLI-80)", () => {
  it("drops the error keys, and keeps the other keys", () => {
    const traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    const response = errorResponse("r1", Object.assign(new Error(MONGO_MESSAGE), { retryAfterMs: 5 }));
    const decorated: ServerResponse = { ...response, metadata: { ...response.metadata, reason: "pool", conflicts: [{ id: "a" }], traceparent } };
    const exposed = exposedResponse({ expose: "coded" }, requestOf(), decorated, () => undefined);
    expect(exposed.status).toEqual({ type: "error", code: "INTERNAL_ERROR", message: "internal error", retryable: false });
    expect(exposed.metadata).toEqual({ traceparent });
  });
});

describe("the link to the real error (CLI-80)", () => {
  it("gives map the real error of its own class through the token check and a middleware that copies the status", async () => {
    const seen: unknown[] = [];
    const server = new ProcedureServer({
      registry: registryOf(),
      autoRegister: true,
      token: "s3cret",
      onError: () => undefined,
      errors: { expose: "coded", map: (error) => void seen.push(error) },
    });
    // A middleware that builds a copy of the status of each error
    server.use((next) => async (context) => {
      const response = await next(context);
      return response.status.type === "error" ? { ...response, status: { ...response.status } } : response;
    });
    const response = await server.handle({
      id: "r1",
      method: pathToMethod(["test", "store"]),
      payload: {},
      metadata: {},
      transport: "http",
      credentials: requestCredentials({ headers: { authorization: "Bearer s3cret" } }),
    });
    expect(response.status).toMatchObject({ ...HIDDEN, retryable: false });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(StoreError);
    expect((seen[0] as StoreError).table).toBe("users_v2");
    // The link is not on the wire
    expect(JSON.stringify(response)).not.toContain("users_v2");
  });

  it("gives map a ServerError of the status when a wrapper made another error", () => {
    const seen: unknown[] = [];
    const request = requestOf();
    const response = errorResponse(request.id, new StoreError("relation users_v2 does not exist", "users_v2"), request);
    // A timeout wrapper replaced the error: the code and the message are of another error
    const replaced: ServerResponse = { ...response, status: { type: "error", code: "TIMEOUT", message: "The call took too long", retryable: true } };
    exposedResponse({ map: (error) => void seen.push(error) }, request, replaced, () => undefined);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(ServerError);
    expect(seen[0]).toMatchObject({ code: "TIMEOUT", message: "The call took too long", retryable: true });
  });
});

describe("the logger gets each error one time (CLI-80)", () => {
  it("logs a hidden stream error one time, also when a last-resort catch gets it", async () => {
    const logged: unknown[] = [];
    const log = (error: unknown): void => void logged.push(error);
    const real = new Error(MONGO_MESSAGE);
    const response = exposedResponse({ expose: "coded" }, requestOf(), { id: "s2", status: { type: "success", code: 200 }, metadata: {}, stream: failingAfterOne(real) }, log);
    const thrown = await endOf(response.stream!);
    expect(thrown).toMatchObject({ ...HIDDEN, retryable: false });
    // A face that gives the error to its last-resort catch: no second log
    expect(exposeError({ expose: "coded" }, thrown, { path: ["test", "fail"] }, log)).toMatchObject(HIDDEN);
    expect(exposeError({ expose: "coded" }, real, { path: ["test", "fail"] }, log)).toMatchObject(HIDDEN);
    expect(logged).toEqual([real]);
  });
});
