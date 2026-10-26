/**
 * The transport contract (roadmap CLI-85, invariant I4 of ARCHITECTURE.md): one suite of wire
 * cases that each face of the procedures server runs. `WIRE-PROTOCOL.md` is the contract.
 *
 * A face gives a factory (`ContractFace`): it starts a server of the face with the procedures of
 * the suite, and it connects callers. The suite then runs the same cases over each face:
 *
 * - a call and its value, on paths of 1, 2 and 4 segments, and segments with "." and "%" (D36, CLI-75)
 * - `NOT_FOUND` for an unknown path and for an empty segment, and `VALIDATION_ERROR`
 * - the code, the message and the retryable flag of a handler error, for a value and for a stream (CLI-58, CLI-68)
 * - the error policy `expose: "coded"` of the server (CLI-80)
 * - `VERSION_CONFLICT` and its conflicts (CLI-16)
 * - the items of a stream and its end, the abort of a call and the cancel of a stream
 * - the deadline of the caller
 * - the token, and the principal of the request hook in the handler (CLI-1, R18)
 * - a subscription to the change topic of a collection: the hint arrives (CLI-15, CLI-75)
 * - the refusal of a request above the size limit of the face
 *
 * A face that does not have a feature by design declares it in its capabilities, and the suite
 * skips the cases of that feature. Each skip thus is data in the test file of the face.
 *
 * The suite imports no code of the client at run time. The face gives its own copy (`lib`): the
 * tests of `@procedures/client` give the source, and the tests of other packages give the package.
 * Thus one class never has two copies in one test.
 */

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type * as Core from "../../src/index.js";
import type { createOverallTimeoutMiddleware } from "../../src/client/index.js";
import type { CollectionStorage } from "../../src/procedures/collection/storage.js";
import type { ProcedureRegistry } from "../../src/procedures/registry.js";
import type { PrincipalOf } from "../../src/server/types.js";
import type { ServerErrorPolicy } from "../../src/server/error-policy.js";
import type { EventPublisherOptions } from "../../src/events/publisher.js";
import type { EventTransport } from "../../src/events/remote.js";
import type { Transport } from "../../src/client/types.js";
import { LogStorage } from "../log-storage.js";

/** The parts of the client that the suite uses: the face gives its own copy. */
export interface ContractLib {
  readonly createProcedure: typeof Core.createProcedure;
  readonly createRegistry: typeof Core.createRegistry;
  readonly createCollectionProcedures: typeof Core.createCollectionProcedures;
  readonly collectionChangeTopic: typeof Core.collectionChangeTopic;
  readonly collectionTopicRule: typeof Core.collectionTopicRule;
  readonly pathToMethod: typeof Core.pathToMethod;
  readonly subscribeRemote: typeof Core.subscribeRemote;
  readonly VersionConflictError: typeof Core.VersionConflictError;
  readonly versionConflictsOf: typeof Core.versionConflictsOf;
  readonly Client: typeof Core.Client;
  /** From the entry point `@procedures/client/client`. */
  readonly createOverallTimeoutMiddleware: typeof createOverallTimeoutMiddleware;
  readonly ms: typeof Core.ms;
}

/**
 * The features of a face. A feature that a face does not have by design is false (or undefined),
 * and the suite skips its cases.
 */
export interface ContractCapabilities {
  /**
   * The face goes through `Server.handle()`, so the options of the server apply: the error policy
   * (`errors`), the token and the request hook. `LocalTransport` calls the registry directly.
   */
  readonly server: boolean;
  /** The face carries network credentials (a bearer token) to the token check and the request hook. */
  readonly auth: boolean;
  /**
   * Where the face refuses a caller without the token. `call` (the default): each call gets
   * `UNAUTHORIZED`. `connect`: the face refuses the connection, and the caller gets an error
   * without a code. The WebSocket face of a host refuses the upgrade with 401, and a WebSocket
   * client cannot read the status of a refused upgrade.
   */
  readonly authRefusal?: "call" | "connect" | undefined;
  /** The face carries a subscription (`events.subscribe`) to the event bus of the server. */
  readonly subscriptions: boolean;
  /**
   * `items`: the caller reads each item of a stream when it arrives, and it can cancel the stream.
   * `collected`: one result holds the items (MCP).
   */
  readonly streams: "items" | "collected";
  /** The face carries the deadline of the caller (`procedure-timeout`) to the handler. */
  readonly deadline: boolean;
  /** The caller gets the metadata of an error, for example the conflicts of `VERSION_CONFLICT`. */
  readonly errorMetadata: boolean;
  /**
   * The face carries the retryable flag of an error from the handler. `LocalTransport` gives
   * `retryable: false` to each error by design: a local call does not get a retry.
   */
  readonly retryable: boolean;
  /**
   * The size limit of a request of the face. The face sets `ContractSpec.sizeLimit` as its limit,
   * and `code` is the code of the refusal. Undefined: the face has no size limit.
   */
  readonly sizeLimit?: { readonly code: string } | undefined;
}

/** What the server of a face serves. The face makes its server from these options. */
export interface ContractSpec {
  /** The procedures of the suite, and the procedures of the collection. */
  readonly registry: ProcedureRegistry;
  /** The storages of the collections (`ProcedureServerOptions.collections`). */
  readonly collections: Readonly<Record<string, CollectionStorage<unknown>>>;
  /** The remote events of the server, with the topic rule of the collection. */
  readonly events: EventPublisherOptions;
  /** The token of the server. Only a face with `auth` gets it. */
  readonly token?: string | undefined;
  /** The request hook of the server. Only a face with `auth` gets it. */
  readonly principalOf?: PrincipalOf | undefined;
  /** The error policy of the server (CLI-80), and its logger. */
  readonly errors?: ServerErrorPolicy | undefined;
  readonly onError?: ((error: Error) => void) | undefined;
  /** The size limit of a request, in bytes, for a face with `sizeLimit`. */
  readonly sizeLimit?: number | undefined;
}

/** The options of one call of a caller. */
export interface ContractCallOptions {
  readonly signal?: AbortSignal | undefined;
  /** The deadline of the call, in milliseconds from now. */
  readonly deadlineMs?: number | undefined;
}

/**
 * A caller of a face. An error has the fields of a `ClientError`: `code`, `message`, `retryable`
 * and `metadata`.
 */
export interface ContractCaller {
  call(path: readonly string[], input: unknown, options?: ContractCallOptions): Promise<unknown>;
  stream(path: readonly string[], input: unknown, options?: ContractCallOptions): AsyncIterable<unknown>;
  /** The transport of the remote events, for a face with `subscriptions`. */
  readonly events?: EventTransport | undefined;
  close?(): Promise<void>;
}

/** A started server of a face. */
export interface ContractServer {
  /** A caller that presents the bearer token, or no credentials. */
  connect(bearer?: string | undefined): Promise<ContractCaller>;
  stop(): Promise<void>;
}

/** A face of the procedures server for the suite. */
export interface ContractFace {
  readonly name: string;
  readonly lib: ContractLib;
  readonly capabilities: ContractCapabilities;
  start(spec: ContractSpec): Promise<ContractServer>;
}

/** The token of the server of a face with `auth`. */
export const CONTRACT_TOKEN = "contract-token-0123456789";

/** The principal that the request hook gives for the token. */
export const CONTRACT_PRINCIPAL = "contract-user";

/** The collection of the suite. Its name has a dot and a `%`, so the codec must keep it one segment (D36). */
export const CONTRACT_COLLECTION = "contract.tabs%";

/** The paths of the path case: 1, 2 and 4 segments, and segments with "." and "%" (CLI-28, CLI-75). */
export const CONTRACT_PATHS: readonly (readonly string[])[] = [
  ["morning"],
  ["contract", "path"],
  ["contract", "a", "b", "path"],
  ["contract", "dot.ted", "path"],
  ["contract", "100%", "path"],
  ["contract", "%2E", "path"],
];

/** The description of a procedure of the suite: a face can find its tool by it. */
export function contractDescription(path: readonly string[]): string {
  return `contract ${JSON.stringify(path)}`;
}

/** The size of the request of the size case, and the limit that the face gets. */
const SIZE_LIMIT = 16 * 1024;

/** What the handlers saw. */
interface Seen {
  deadlineLeft: number[];
  aborted: number;
  streamClosed: number;
  echoes: number;
  headers: unknown[];
}

const CONFLICTS = [
  { id: "a", expected: "1", found: true, value: { n: 2 }, version: "2" },
  { id: "b", expected: null, found: false, version: null },
];

/** The procedures of the suite. */
function registryOf(lib: ContractLib, seen: Seen): ProcedureRegistry {
  const read = { reads: [], writes: [] };
  const procedure = (path: readonly string[]) => lib.createProcedure().path([...path]).meta({ effects: read, description: contractDescription(path) });
  const failure = (input: { code?: string | undefined; retryable?: boolean | undefined }) =>
    Object.assign(new Error("it failed"), input.code === undefined ? {} : { code: input.code }, input.retryable === undefined ? {} : { retryable: input.retryable });
  return lib.createRegistry({
    name: "transport-contract",
    procedures: [
      procedure(["contract", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.object({ text: z.string() }))
        .handler(async (input, ctx) => {
          seen.echoes++;
          const deadline = ctx.capability?.deadline;
          if (deadline !== undefined) seen.deadlineLeft.push(deadline - Date.now());
          seen.headers.push(ctx.metadata?.["headers"]);
          return { text: input.text };
        })
        .build(),
      procedure(["contract", "whoami"])
        .input(z.object({}))
        .output(z.object({ principal: z.string().nullable() }))
        .handler(async (_input, ctx) => ({ principal: ctx.principal?.id ?? null }))
        .build(),
      ...CONTRACT_PATHS.map((path) =>
        procedure(path)
          .input(z.object({}).passthrough())
          .output(z.object({ path: z.array(z.string()) }))
          .handler(async (_input, ctx) => ({ path: [...ctx.path] }))
          .build(),
      ),
      procedure(["contract", "count"])
        .input(z.object({ to: z.number() }))
        .output(z.number())
        .handler(async function* (input: { to: number }) {
          for (let n = 1; n <= input.to; n++) yield n;
        } as never)
        .build(),
      procedure(["contract", "endless"])
        .input(z.object({}))
        .output(z.number())
        .handler(async function* () {
          try {
            for (let n = 1; ; n++) {
              yield n;
              await new Promise((resolve) => setTimeout(resolve, 5));
            }
          } finally {
            seen.streamClosed++;
          }
        } as never)
        .build(),
      procedure(["contract", "wait"])
        .input(z.object({}))
        .output(z.string())
        .handler(async (_input, ctx) => {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 5000);
            ctx.signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                seen.aborted++;
                resolve();
              },
              { once: true },
            );
          });
          return "ended";
        })
        .build(),
      procedure(["contract", "fail"])
        .input(z.object({ code: z.string().optional(), retryable: z.boolean().optional() }))
        .output(z.string())
        .handler(async (input: { code?: string | undefined; retryable?: boolean | undefined }) => {
          throw failure(input);
        })
        .build(),
      // A stream that fails after its items: one item, or the count of the input
      procedure(["contract", "failStream"])
        .input(z.object({ code: z.string().optional(), retryable: z.boolean().optional(), items: z.number().optional() }))
        .output(z.number())
        .handler(async function* (input: { code?: string | undefined; retryable?: boolean | undefined; items?: number | undefined }) {
          for (let n = 1; n <= (input.items ?? 1); n++) yield n;
          throw failure(input);
        } as never)
        .build(),
      procedure(["contract", "conflict"])
        .input(z.object({}))
        .output(z.string())
        .handler(async () => {
          throw new lib.VersionConflictError(CONFLICTS);
        })
        .build(),
      ...lib.createCollectionProcedures(CONTRACT_COLLECTION),
    ],
  });
}

/** The error of a promise, or a failure when it resolves. */
async function errorOf(promise: Promise<unknown>): Promise<{ code?: string; message?: string; retryable?: boolean; metadata?: Record<string, unknown> }> {
  try {
    await promise;
  } catch (error) {
    return error as { code?: string; message?: string; retryable?: boolean };
  }
  throw new Error("The call did not fail");
}

/** The items of a stream. */
async function itemsOf(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const items: unknown[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

async function waitFor(check: () => boolean, what: string, limit = 3000): Promise<void> {
  const end = Date.now() + limit;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waitFor: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * A caller of a `Client` over a transport of the client: HTTP, WebSocket, a message port or the
 * local transport. Each face of the client uses it.
 */
export function clientCaller(lib: ContractLib, transport: Transport, close?: () => Promise<void>): ContractCaller {
  const clientOf = (options?: ContractCallOptions) => {
    const client = new lib.Client({ transport, throwOnError: true });
    return options?.deadlineMs === undefined ? client : client.use(lib.createOverallTimeoutMiddleware({ overall: lib.ms(options.deadlineMs) }));
  };
  const callOptions = (options?: ContractCallOptions) => (options?.signal ? { signal: options.signal } : {});
  return {
    call: (path, input, options) => clientOf(options).call(lib.pathToMethod([...path]), input, callOptions(options)),
    stream: (path, input, options) => clientOf(options).stream(lib.pathToMethod([...path]), input, callOptions(options)),
    events: transport,
    ...(close ? { close } : {}),
  };
}

/**
 * This function declares the cases of the transport contract for one face. Call it at the top
 * level of the test file of the face.
 */
export function describeTransportContract(face: ContractFace): void {
  const { lib, capabilities: caps } = face;
  let open: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const close of open.reverse()) await close().catch(() => undefined);
    open = [];
  });

  const fresh = (): Seen => ({ deadlineLeft: [], aborted: 0, streamClosed: 0, echoes: 0, headers: [] });

  /** A server of the face, with the procedures of the suite. */
  async function serve(seen: Seen, more: Partial<ContractSpec> = {}): Promise<{ server: ContractServer; storage: LogStorage }> {
    const storage = new LogStorage();
    const principalOf: PrincipalOf = (credentials) =>
      credentials.bearer === CONTRACT_TOKEN ? { principal: { id: CONTRACT_PRINCIPAL, via: "contract" } } : undefined;
    const spec: ContractSpec = {
      registry: registryOf(lib, seen),
      collections: { [CONTRACT_COLLECTION]: storage },
      events: { topics: lib.collectionTopicRule(CONTRACT_COLLECTION) },
      ...(caps.auth ? { token: CONTRACT_TOKEN, principalOf } : {}),
      ...more,
    };
    const server = await face.start(spec);
    open.push(() => server.stop());
    return { server, storage };
  }

  /** A caller of the face, with the token when the face has `auth`. */
  async function connect(server: ContractServer, bearer: string | null = caps.auth ? CONTRACT_TOKEN : null): Promise<ContractCaller> {
    const caller = await server.connect(bearer ?? undefined);
    if (caller.close) open.push(() => caller.close!());
    return caller;
  }

  async function start(seen: Seen = fresh(), more: Partial<ContractSpec> = {}): Promise<ContractCaller> {
    return connect((await serve(seen, more)).server);
  }

  describe(`the transport contract over ${face.name} (CLI-85)`, () => {
    it("gives the value of a call", async () => {
      const caller = await start();
      expect(await caller.call(["contract", "echo"], { text: "hi" })).toEqual({ text: "hi" });
    });

    it("calls a path of 1, 2 and 4 segments, and keeps a segment with a dot or a % as one segment (CLI-28, CLI-75)", async () => {
      const caller = await start();
      for (const path of CONTRACT_PATHS) expect(await caller.call(path, {}), JSON.stringify(path)).toEqual({ path });
    });

    it("gives NOT_FOUND for an unknown path and for a path with an empty segment", async () => {
      const caller = await start();
      expect(await errorOf(caller.call(["contract", "missing"], {}))).toMatchObject({ code: "NOT_FOUND", retryable: false });
      expect(await errorOf(caller.call(["contract", "dot", "path"], {}))).toMatchObject({ code: "NOT_FOUND" });
      expect(await errorOf(caller.call(["contract", ""], {}))).toMatchObject({ code: "NOT_FOUND" });
    });

    it("gives VALIDATION_ERROR for an input that is not valid, and the handler does not run", async () => {
      const seen = fresh();
      const caller = await start(seen);
      expect(await errorOf(caller.call(["contract", "echo"], { text: 5 }))).toMatchObject({ code: "VALIDATION_ERROR", retryable: false });
      expect(seen.echoes).toBe(0);
    });

    it("keeps the code, the message and the flag of a handler error, for a value and for a stream (CLI-58, CLI-68)", async () => {
      const caller = await start();
      // The flag, on a face that carries it
      const flag = (retryable: boolean) => (caps.retryable ? { retryable } : {});
      expect(await errorOf(caller.call(["contract", "fail"], { code: "E_CUSTOM" }))).toMatchObject({ code: "E_CUSTOM", message: "it failed", retryable: false });
      expect(await errorOf(caller.call(["contract", "fail"], { code: "E_CUSTOM", retryable: true }))).toMatchObject({ code: "E_CUSTOM", ...flag(true) });
      expect(await errorOf(caller.call(["contract", "fail"], {}))).toMatchObject({ code: "HANDLER_ERROR", message: "it failed" });
      // Without a flag, an error before the first item gets the flag of its code
      expect(await errorOf(caller.call(["contract", "fail"], { code: "UNAVAILABLE" }))).toMatchObject({ code: "UNAVAILABLE", ...flag(true) });
      expect(await errorOf(caller.call(["contract", "fail"], { code: "UNAVAILABLE", retryable: false }))).toMatchObject({ code: "UNAVAILABLE", retryable: false });
      expect(await errorOf(itemsOf(caller.stream(["contract", "failStream"], { code: "E_CUSTOM" })))).toMatchObject({ code: "E_CUSTOM", message: "it failed" });
      expect(await errorOf(itemsOf(caller.stream(["contract", "failStream"], {})))).toMatchObject({ code: "HANDLER_ERROR" });
      // After an item, an end without a flag is not retryable: a retry can send the items again
      expect(await errorOf(itemsOf(caller.stream(["contract", "failStream"], { code: "UNAVAILABLE" })))).toMatchObject({ code: "UNAVAILABLE", retryable: false });
      expect(await errorOf(itemsOf(caller.stream(["contract", "failStream"], { code: "UNAVAILABLE", retryable: true })))).toMatchObject({ code: "UNAVAILABLE", ...flag(true) });
      // An end in the stream before its first item gets the flag of its code, as an error before the stream (CLI-68)
      expect(await errorOf(itemsOf(caller.stream(["contract", "failStream"], { code: "UNAVAILABLE", items: 0 })))).toMatchObject({ code: "UNAVAILABLE", ...flag(true) });
      expect(await errorOf(itemsOf(caller.stream(["contract", "failStream"], { code: "UNAVAILABLE", retryable: false, items: 0 })))).toMatchObject({ code: "UNAVAILABLE", retryable: false });
      // The reader gets the items before the end
      if (caps.streams === "items") {
        const items: unknown[] = [];
        await errorOf((async () => {
          for await (const item of caller.stream(["contract", "failStream"], { code: "UNAVAILABLE", items: 2 })) items.push(item);
        })());
        expect(items).toEqual([1, 2]);
      }
    });

    it.skipIf(!caps.server)('applies the error policy of the server: under "coded", only a known code goes out (CLI-80)', async () => {
      const logged: Error[] = [];
      const caller = await start(fresh(), { errors: { expose: "coded", codes: ["E_APP"] }, onError: (error) => void logged.push(error) });
      expect(await errorOf(caller.call(["contract", "fail"], { code: "E_APP" }))).toMatchObject({ code: "E_APP", message: "it failed" });
      expect(await errorOf(caller.call(["contract", "fail"], { code: "CONFLICT", retryable: true }))).toMatchObject({ code: "CONFLICT", message: "it failed", retryable: true });
      // Each other error is INTERNAL_ERROR with the message "internal error", and it keeps its flag
      expect(await errorOf(caller.call(["contract", "fail"], {}))).toMatchObject({ code: "INTERNAL_ERROR", message: "internal error", retryable: false });
      expect(await errorOf(caller.call(["contract", "fail"], { code: "ECONNREFUSED", retryable: true }))).toMatchObject({ code: "INTERNAL_ERROR", message: "internal error", retryable: true });
      expect(await errorOf(itemsOf(caller.stream(["contract", "failStream"], { code: "ECONNREFUSED" })))).toMatchObject({ code: "INTERNAL_ERROR", message: "internal error" });
      // The server gives each hidden error to its logger
      expect(logged.length).toBeGreaterThanOrEqual(3);
    });

    it("gives VERSION_CONFLICT, and the conflicts when the caller gets the metadata of an error (CLI-16)", async () => {
      const caller = await start();
      const error = await errorOf(caller.call(["contract", "conflict"], {}));
      expect(error).toMatchObject({ code: "VERSION_CONFLICT", retryable: false });
      if (caps.errorMetadata) expect(lib.versionConflictsOf(error)).toEqual(CONFLICTS);
    });

    it("gives the items of a stream in order, and then the end", async () => {
      const caller = await start();
      expect(await itemsOf(caller.stream(["contract", "count"], { to: 3 }))).toEqual([1, 2, 3]);
      expect(await itemsOf(caller.stream(["contract", "count"], { to: 0 }))).toEqual([]);
    });

    it("aborts the handler when the caller aborts the call", async () => {
      const seen = fresh();
      const caller = await start(seen);
      const controller = new AbortController();
      const call = caller.call(["contract", "wait"], {}, { signal: controller.signal });
      setTimeout(() => controller.abort(), 50);
      await expect(call).rejects.toBeDefined();
      await waitFor(() => seen.aborted === 1, "the abort of the handler");
    });

    it.skipIf(caps.streams !== "items")("ends the stream of the handler when the reader stops", async () => {
      const seen = fresh();
      const caller = await start(seen);
      const items: unknown[] = [];
      for await (const item of caller.stream(["contract", "endless"], {})) {
        items.push(item);
        if (items.length === 2) break;
      }
      expect(items).toEqual([1, 2]);
      await waitFor(() => seen.streamClosed === 1, "the end of the stream of the handler");
    });

    it.skipIf(!caps.deadline)("gives the deadline of the caller to the handler", async () => {
      const seen = fresh();
      const caller = await start(seen);
      await caller.call(["contract", "echo"], { text: "x" }, { deadlineMs: 3000 });
      expect(seen.deadlineLeft[0]).toBeGreaterThan(2000);
      expect(seen.deadlineLeft[0]).toBeLessThanOrEqual(3000);
    });

    it.skipIf(!caps.auth)("refuses a request without the token, and gives the principal of the request hook to the handler (CLI-1, R18)", async () => {
      const seen = fresh();
      const { server } = await serve(seen);
      const refusal = caps.authRefusal === "connect" ? {} : { code: "UNAUTHORIZED" };
      expect(await errorOf((await connect(server, null)).call(["contract", "echo"], { text: "x" }))).toMatchObject(refusal);
      expect(await errorOf((await connect(server, "a-wrong-token-0123456789")).call(["contract", "echo"], { text: "x" }))).toMatchObject(refusal);
      expect(seen.echoes).toBe(0);
      const caller = await connect(server, CONTRACT_TOKEN);
      expect(await caller.call(["contract", "whoami"], {})).toEqual({ principal: CONTRACT_PRINCIPAL });
      expect(await caller.call(["contract", "echo"], { text: "x" })).toEqual({ text: "x" });
      // The secret does not reach the handler
      expect(JSON.stringify(seen.headers)).not.toContain(CONTRACT_TOKEN);
    });

    it.skipIf(!caps.subscriptions)("gives the change hint of a write to a subscriber of the topic of the collection (CLI-15, CLI-75)", async () => {
      const caller = await start();
      const topic = lib.collectionChangeTopic(CONTRACT_COLLECTION);
      const hints: Array<{ changed: string[]; deleted: string[] }> = [];
      const topics: string[] = [];
      const subscription = lib.subscribeRemote<{ changed: string[]; deleted: string[] }>(caller.events!, topic, (data, event) => {
        hints.push(data);
        topics.push(event.topic);
      });
      open.push(async () => subscription());
      await subscription.ready;
      const collection = (operation: string) => ["collections", CONTRACT_COLLECTION, operation];
      // A pull starts the chain of the events
      await caller.call(collection("changes"), {});
      await caller.call(collection("set"), { id: "t1", value: { title: "one" } });
      await waitFor(() => hints.length >= 1, "the change hint");
      expect(hints[0]).toMatchObject({ changed: ["t1"], deleted: [] });
      expect(topics[0]).toBe(topic);
      expect(await caller.call(collection("get"), { id: "t1" })).toEqual({ title: "one" });
      expect(await caller.call(collection("find"), {})).toEqual([{ id: "t1", value: { title: "one" } }]);
      await caller.call(collection("delete"), { id: "t1" });
      await waitFor(() => hints.length >= 2, "the hint of the delete");
      expect(hints[1]).toMatchObject({ changed: [], deleted: ["t1"] });
    });

    it.skipIf(!caps.sizeLimit)("refuses a request above the size limit of the face, and the handler does not run", async () => {
      const seen = fresh();
      const caller = await start(seen, { sizeLimit: SIZE_LIMIT });
      const error = await errorOf(caller.call(["contract", "echo"], { text: "x".repeat(4 * SIZE_LIMIT) }));
      expect(error).toMatchObject({ code: caps.sizeLimit!.code, retryable: false });
      expect(seen.echoes).toBe(0);
      // A request below the limit passes
      expect(await (await start(seen, { sizeLimit: SIZE_LIMIT })).call(["contract", "echo"], { text: "small" })).toEqual({ text: "small" });
    });
  });
}
