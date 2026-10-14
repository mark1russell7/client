/**
 * Unit tests for the procedure.define meta-procedure and related utilities
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  defineProcedureProcedure as defineDefinition,
  getProcedureProcedure as getDefinition,
  listProceduresProcedure as listDefinition,
  deleteProcedureProcedure as deleteDefinition,
  getRuntimeProcedure,
  hasRuntimeProcedure,
  getAllRuntimeProcedures,
  clearRuntimeProcedures,
  runtimeProgramOf,
} from "./define-procedure.js";
import type { ProcedureContext } from "./types.js";
import type { AggregationDefinition } from "./define-procedure.js";
import { PROCEDURE_REGISTRY, ProcedureRegistry } from "./registry.js";
import { metaProcedures } from "./define-procedure.js";
import { Client } from "../client/client.js";
import { allCoreProcedures } from "./core/index.js";
import { isDataDriven } from "./ref.js";
import { valueHandler } from "../../test/value-handler.js";

// The tests read one value from the handlers: valueHandler types it so, and checks it
const defineProcedureProcedure = valueHandler(defineDefinition);
const getProcedureProcedure = valueHandler(getDefinition);
const listProceduresProcedure = valueHandler(listDefinition);
const deleteProcedureProcedure = valueHandler(deleteDefinition);

/**
 * Simple inline mock client for tests
 */
function createTestMockClient() {
  const calls: Array<{ path: string[]; input: unknown }> = [];
  const responses = new Map<string, { output?: unknown; error?: Error }>();
  const implementations = new Map<string, (input: unknown) => unknown>();

  const pathToKey = (path: readonly string[]): string => path.join(".");

  const call = vi.fn(async (path: readonly string[], input: unknown) => {
    calls.push({ path: [...path], input });
    const key = pathToKey(path);
    const impl = implementations.get(key);
    if (impl) return impl(input);
    const response = responses.get(key);
    if (response?.error) throw response.error;
    return response?.output;
  });

  return {
    call,
    getCalls: () => [...calls],
    getCallsFor: (path: readonly string[]) =>
      calls.filter((c) => pathToKey(c.path) === pathToKey(path)),
    mockResponse: <T>(path: readonly string[], response: { output?: T; error?: Error }) => {
      responses.set(pathToKey(path), response);
    },
    mockImplementation: <TInput, TOutput>(
      path: readonly string[],
      impl: (input: TInput) => TOutput | Promise<TOutput>
    ) => {
      implementations.set(pathToKey(path), impl as (input: unknown) => unknown);
    },
    reset: () => {
      calls.length = 0;
      responses.clear();
      implementations.clear();
      call.mockClear();
    },
  };
}

describe("procedure.define meta-procedure", () => {
  let mockClient: ReturnType<typeof createTestMockClient>;
  let ctx: ProcedureContext;

  beforeEach(() => {
    clearRuntimeProcedures();
    mockClient = createTestMockClient();
    ctx = { capability: {}, resources: {},
      client: mockClient as any,
      metadata: {},
      path: ["procedure", "define"],
    };
  });

  describe("defineProcedureProcedure", () => {
    it("registers a procedure from aggregation definition", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: { $ref: "input.value" } },
      };

      const result = await defineProcedureProcedure.handler!(
        {
          path: ["test", "simple"],
          aggregation,
        },
        ctx
      );

      expect(result.path).toEqual(["test", "simple"]);
      expect(result.replaced).toBe(false);
      expect(hasRuntimeProcedure(["test", "simple"])).toBe(true);
    });

    it("throws on duplicate path without replace flag", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      // First registration should succeed
      await defineProcedureProcedure.handler!(
        {
          path: ["test", "duplicate"],
          aggregation,
        },
        ctx
      );

      // Second registration without replace should throw
      await expect(
        defineProcedureProcedure.handler!(
          {
            path: ["test", "duplicate"],
            aggregation,
          },
          ctx
        )
      ).rejects.toThrow("Procedure already exists at path: test.duplicate");
    });

    it("replaces existing procedure with replace: true", async () => {
      const aggregation1: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "first" },
      };

      const aggregation2: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "second" },
      };

      // First registration
      await defineProcedureProcedure.handler!(
        {
          path: ["test", "replaceable"],
          aggregation: aggregation1,
        },
        ctx
      );

      // Second registration with replace: true
      const result = await defineProcedureProcedure.handler!(
        {
          path: ["test", "replaceable"],
          aggregation: aggregation2,
          replace: true,
        },
        ctx
      );

      expect(result.replaced).toBe(true);
      expect(hasRuntimeProcedure(["test", "replaceable"])).toBe(true);
    });

    it("stores custom metadata", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "withMeta"],
          aggregation,
          metadata: {
            description: "Custom description",
            tags: ["custom", "test"],
          },
        },
        ctx
      );

      const proc = getRuntimeProcedure(["test", "withMeta"]);
      expect(proc?.metadata?.description).toBe("Custom description");
      expect(proc?.metadata?.tags).toEqual(["custom", "test"]);
    });

    it("registers into PROCEDURE_REGISTRY so exec()/call() can find it (regression: H4)", async () => {
      await defineProcedureProcedure.handler!(
        {
          path: ["test", "h4Callable"],
          aggregation: { $proc: ["client", "identity"], input: {} },
        },
        ctx
      );

      // The global registry is the store that Client.exec()/call() and transports consult.
      // Before the fix, runtime procedures were only in a private map and were uncallable.
      const registered = PROCEDURE_REGISTRY.get(["test", "h4Callable"]);
      expect(registered).toBeDefined();
      expect(registered?.handler).toBeDefined();

      // clearRuntimeProcedures() must also unregister from the global registry.
      clearRuntimeProcedures();
      expect(PROCEDURE_REGISTRY.get(["test", "h4Callable"])).toBeUndefined();
    });
  });

  describe("registered procedure execution", () => {
    it("executes registered aggregation procedure", async () => {
      // Mock the identity procedure
      mockClient.mockImplementation(["client", "identity"], (input: unknown) => input);

      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { passthrough: { $ref: "input.data" } },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "executable"],
          aggregation,
        },
        ctx
      );

      const proc = getRuntimeProcedure(["test", "executable"]);
      expect(proc).toBeDefined();
      expect(proc?.handler).toBeDefined();

      // Execute the procedure
      await proc!.handler!({ data: "hello" }, ctx);

      // Should call client.identity with resolved input
      expect(mockClient.getCalls()).toHaveLength(1);
      expect(mockClient.getCalls()[0]?.path).toEqual(["client", "identity"]);
      expect(mockClient.getCalls()[0]?.input).toEqual({ passthrough: "hello" });
    });

    it("resolves $ref in aggregation input", async () => {
      mockClient.mockImplementation(["test", "echo"], (input: unknown) => input);

      const aggregation: AggregationDefinition = {
        $proc: ["test", "echo"],
        input: {
          nested: {
            value: { $ref: "input.source.nested.value" },
          },
        },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "refResolution"],
          aggregation,
        },
        ctx
      );

      const proc = getRuntimeProcedure(["test", "refResolution"]);
      await proc!.handler!(
        { source: { nested: { value: "deepValue" } } },
        ctx
      );

      expect(mockClient.getCalls()[0]?.input).toEqual({
        nested: { value: "deepValue" },
      });
    });

    it("throws when executed without client context", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "noClient"],
          aggregation,
        },
        ctx
      );

      const proc = getRuntimeProcedure(["test", "noClient"]);
      const noClientCtx: ProcedureContext = { capability: {}, resources: {},
        metadata: {},
        path: ["test", "noClient"],
        client: undefined as any,
      };

      await expect(proc!.handler!({}, noClientCtx)).rejects.toThrow(
        "procedure.define requires a client context to execute aggregations"
      );
    });
  });

  describe("getProcedureProcedure", () => {
    it("returns registered procedure by path", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "findable"],
          aggregation,
        },
        ctx
      );

      const result = await getProcedureProcedure.handler!(
        { path: ["test", "findable"] },
        ctx
      );

      expect(result).toMatchObject({ found: true, path: ["test", "findable"], runtime: true });
    });

    it("returns found: false for a path that does not exist", async () => {
      const result = await getProcedureProcedure.handler!(
        { path: ["does", "not", "exist"] },
        ctx
      );

      expect(result).toEqual({ found: false });
    });
  });

  describe("listProceduresProcedure", () => {
    it("lists all runtime-defined procedures", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "list1"],
          aggregation,
          metadata: { description: "First" },
        },
        ctx
      );

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "list2"],
          aggregation,
          metadata: { description: "Second" },
        },
        ctx
      );

      const result = await listProceduresProcedure.handler!({}, ctx);

      expect(result.procedures).toHaveLength(2);
      expect(result.procedures.map((p) => p.path)).toContainEqual(["test", "list1"]);
      expect(result.procedures.map((p) => p.path)).toContainEqual(["test", "list2"]);
    });

    it("returns empty array when none defined", async () => {
      const result = await listProceduresProcedure.handler!({}, ctx);

      expect(result.procedures).toHaveLength(0);
    });
  });

  describe("deleteProcedureProcedure", () => {
    it("deletes runtime-defined procedure", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["test", "deletable"],
          aggregation,
        },
        ctx
      );

      expect(hasRuntimeProcedure(["test", "deletable"])).toBe(true);

      const result = await deleteProcedureProcedure.handler!(
        { path: ["test", "deletable"] },
        ctx
      );

      expect(result.deleted).toBe(true);
      expect(hasRuntimeProcedure(["test", "deletable"])).toBe(false);
    });

    it("returns false for non-existent procedure", async () => {
      const result = await deleteProcedureProcedure.handler!(
        { path: ["does", "not", "exist"] },
        ctx
      );

      expect(result.deleted).toBe(false);
    });
  });

  describe("utility functions", () => {
    it("getRuntimeProcedure returns procedure by path", async () => {
      const aggregation: AggregationDefinition = {
        $proc: ["client", "identity"],
        input: { value: "test" },
      };

      await defineProcedureProcedure.handler!(
        {
          path: ["util", "test"],
          aggregation,
        },
        ctx
      );

      const proc = getRuntimeProcedure(["util", "test"]);
      expect(proc).toBeDefined();
      expect(proc?.path).toEqual(["util", "test"]);
    });

    it("getRuntimeProcedure returns undefined for non-existent", () => {
      const proc = getRuntimeProcedure(["not", "found"]);
      expect(proc).toBeUndefined();
    });

    it("hasRuntimeProcedure returns correct boolean", async () => {
      expect(hasRuntimeProcedure(["check", "exists"])).toBe(false);

      await defineProcedureProcedure.handler!(
        {
          path: ["check", "exists"],
          aggregation: {
            $proc: ["client", "identity"],
            input: {},
          },
        },
        ctx
      );

      expect(hasRuntimeProcedure(["check", "exists"])).toBe(true);
    });

    it("getAllRuntimeProcedures returns all procedures", async () => {
      await defineProcedureProcedure.handler!(
        {
          path: ["all", "first"],
          aggregation: { $proc: ["client", "identity"], input: {} },
        },
        ctx
      );

      await defineProcedureProcedure.handler!(
        {
          path: ["all", "second"],
          aggregation: { $proc: ["client", "identity"], input: {} },
        },
        ctx
      );

      const all = getAllRuntimeProcedures();
      expect(all).toHaveLength(2);
    });

    it("clearRuntimeProcedures clears all procedures", async () => {
      await defineProcedureProcedure.handler!(
        {
          path: ["clear", "test"],
          aggregation: { $proc: ["client", "identity"], input: {} },
        },
        ctx
      );

      expect(getAllRuntimeProcedures()).toHaveLength(1);

      clearRuntimeProcedures();

      expect(getAllRuntimeProcedures()).toHaveLength(0);
    });
  });
});

describe("$ref resolution", () => {
  let mockClient: ReturnType<typeof createTestMockClient>;
  let ctx: ProcedureContext;

  beforeEach(() => {
    clearRuntimeProcedures();
    mockClient = createTestMockClient();
    ctx = { capability: {}, resources: {},
      client: mockClient as any,
      metadata: {},
      path: ["procedure", "define"],
    };
  });

  it("resolves simple input reference", async () => {
    mockClient.mockImplementation(["test", "echo"], (input: unknown) => input);

    await defineProcedureProcedure.handler!(
      {
        path: ["ref", "simple"],
        aggregation: {
          $proc: ["test", "echo"],
          input: { value: { $ref: "input.data" } },
        },
      },
      ctx
    );

    const proc = getRuntimeProcedure(["ref", "simple"]);
    await proc!.handler!({ data: 42 }, ctx);

    expect(mockClient.getCalls()[0]?.input).toEqual({ value: 42 });
  });

  it("resolves nested input reference", async () => {
    mockClient.mockImplementation(["test", "echo"], (input: unknown) => input);

    await defineProcedureProcedure.handler!(
      {
        path: ["ref", "nested"],
        aggregation: {
          $proc: ["test", "echo"],
          input: { value: { $ref: "input.deep.nested.value" } },
        },
      },
      ctx
    );

    const proc = getRuntimeProcedure(["ref", "nested"]);
    await proc!.handler!({ deep: { nested: { value: "found" } } }, ctx);

    expect(mockClient.getCalls()[0]?.input).toEqual({ value: "found" });
  });

  it("resolves array of $ref values", async () => {
    mockClient.mockImplementation(["test", "echo"], (input: unknown) => input);

    await defineProcedureProcedure.handler!(
      {
        path: ["ref", "array"],
        aggregation: {
          $proc: ["test", "echo"],
          input: {
            values: [
              { $ref: "input.a" },
              { $ref: "input.b" },
            ],
          },
        },
      },
      ctx
    );

    const proc = getRuntimeProcedure(["ref", "array"]);
    await proc!.handler!({ a: 1, b: 2 }, ctx);

    expect(mockClient.getCalls()[0]?.input).toEqual({ values: [1, 2] });
  });

  it("handles undefined references gracefully", async () => {
    mockClient.mockImplementation(["test", "echo"], (input: unknown) => input);

    await defineProcedureProcedure.handler!(
      {
        path: ["ref", "undefined"],
        aggregation: {
          $proc: ["test", "echo"],
          input: { value: { $ref: "input.nonexistent" } },
        },
      },
      ctx
    );

    const proc = getRuntimeProcedure(["ref", "undefined"]);
    await proc!.handler!({ other: "data" }, ctx);

    expect(mockClient.getCalls()[0]?.input).toEqual({ value: undefined });
  });

  it("passes through primitive values unchanged", async () => {
    mockClient.mockImplementation(["test", "echo"], (input: unknown) => input);

    await defineProcedureProcedure.handler!(
      {
        path: ["ref", "primitives"],
        aggregation: {
          $proc: ["test", "echo"],
          input: {
            str: "literal",
            num: 42,
            bool: true,
            nil: null,
          },
        },
      },
      ctx
    );

    const proc = getRuntimeProcedure(["ref", "primitives"]);
    await proc!.handler!({}, ctx);

    expect(mockClient.getCalls()[0]?.input).toEqual({
      str: "literal",
      num: 42,
      bool: true,
      nil: null,
    });
  });
});

// =============================================================================
// Deep dive 2026-10: CORE-3 / MCP-4 (the registry stays consistent) and CORE-4 (the body runs
// with the same semantics as exec()), through a Client with its own registry
// =============================================================================

describe("procedure.define through a client (deep dive 2026-10)", () => {
  const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

  function makeClient(): { client: Client; registry: ProcedureRegistry } {
    const registry = new ProcedureRegistry();
    for (const procedure of [...allCoreProcedures, ...metaProcedures]) registry.register(procedure);
    return { client: new Client(stubTransport).useRegistry(registry), registry };
  }

  const define = (client: Client, path: string[], aggregation: unknown, replace?: boolean) =>
    client.exec({ $proc: ["procedure", "define"], input: { path, aggregation, ...(replace ? { replace } : {}) } });

  const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });
  const multiply = (a: unknown, b: unknown) => ({ $proc: ["client", "multiply"], input: { a, b } });

  it("records the program of each defined procedure, also when the caller gives its own metadata (roadmap 3.2)", async () => {
    const { client, registry } = makeClient();
    const body = add({ $ref: "input.a" }, 1);
    await client.exec({
      $proc: ["procedure", "define"],
      input: { path: ["test", "withMeta"], aggregation: body, metadata: { description: "Add one" } },
    });
    const procedure = registry.get(["test", "withMeta"])!;
    expect(runtimeProgramOf(procedure)).toEqual(body);
    expect(procedure.metadata.description).toBe("Add one");
    // A code procedure has no program
    expect(runtimeProgramOf(registry.get(["client", "add"])!)).toBeUndefined();
  });

  it("CORE-4: a three-step pipeline keeps $last and the step names", async () => {
    const { client } = makeClient();
    await define(client, ["test", "pipeline"], {
      $proc: ["client", "chain"],
      input: {
        steps: [
          { ...add({ $ref: "input.a" }, 1), $name: "one" },
          multiply({ $ref: "$last" }, 2),
          add({ $ref: "one" }, { $ref: "$last" }),
        ],
      },
    });
    const result = await client.exec<{ results: unknown[] }>(["test", "pipeline"], { a: 1 });
    expect(result.results).toEqual([2, 4, 6]);
  });

  it("CORE-4: map in a body keeps item and index", async () => {
    const { client } = makeClient();
    await define(client, ["test", "scale"], {
      $proc: ["client", "map"],
      input: { items: { $ref: "input.items" }, fn: add(multiply({ $ref: "item" }, { $ref: "input.factor" }), { $ref: "index" }) },
    });
    const result = await client.exec<{ results: unknown[] }>(["test", "scale"], { items: [1, 2], factor: 10 });
    expect(result.results).toEqual([10, 21]);
  });

  it("CORE-4: nested refs in the input of a code procedure run", async () => {
    const { client } = makeClient();
    await define(client, ["test", "nested"], add(multiply({ $ref: "input.x" }, 2), 1));
    expect(await client.exec(["test", "nested"], { x: 3 })).toBe(7);
  });

  it("CORE-3: the procedure goes into the caller's registry", async () => {
    const { client, registry } = makeClient();
    await define(client, ["test", "local"], add(1, 1));
    expect(registry.get(["test", "local"])).toBeDefined();
    expect(PROCEDURE_REGISTRY.get(["test", "local"])).toBeUndefined();
    expect(isDataDriven(registry.get(["test", "local"])!)).toBe(true);
    const listed = await client.exec<{ procedures: Array<{ path: string[] }> }>(["procedure", "list"], { runtime: true });
    expect(listed.procedures.map((p) => p.path.join("."))).toEqual(["test.local"]);
  });

  it("CORE-3: replace cannot replace a code procedure", async () => {
    const { client } = makeClient();
    await expect(define(client, ["client", "add"], { $proc: ["client", "constant"], input: { value: 0 } }, true)).rejects.toThrow(
      /code procedure/,
    );
    expect(await client.exec(["client", "add"], { a: 2, b: 2 })).toBe(4);
  });

  it("CORE-3: delete unregisters, and the path can be defined again", async () => {
    const { client, registry } = makeClient();
    await define(client, ["test", "temp"], add(1, 1));
    expect(await client.exec(["procedure", "delete"], { path: ["test", "temp"] })).toEqual({ deleted: true });
    expect(registry.get(["test", "temp"])).toBeUndefined();
    await define(client, ["test", "temp"], add(2, 2));
    expect(await client.exec(["test", "temp"], {})).toBe(4);
  });

  it("CORE-3: delete does not remove a code procedure", async () => {
    const { client, registry } = makeClient();
    await expect(client.exec(["procedure", "delete"], { path: ["client", "add"] })).rejects.toThrow(/code procedure/);
    expect(registry.get(["client", "add"])).toBeDefined();
  });

  it("CORE-3: a failed define leaves nothing", async () => {
    const { client, registry } = makeClient();
    await expect(define(client, ["test", "__proto__"], add(1, 1))).rejects.toThrow(/__proto__/);
    await expect(define(client, ["test", "noBody"], { not: "a ref" })).rejects.toThrow(/aggregation/);
    expect(registry.getAll().filter((p) => p.path[0] === "test")).toEqual([]);
    const listed = await client.exec<{ procedures: unknown[] }>(["procedure", "list"], { runtime: true });
    expect(listed.procedures).toEqual([]);
  });

  // Docs review DOC-6: client-procedure replaced these two with versions for the whole registry.
  // Now one implementation does both, on the caller's registry.
  it("DOC-6: procedure.list gives every procedure, and runtime: true only the defined ones", async () => {
    const { client } = makeClient();
    await define(client, ["test", "listed"], add(1, 1));
    type Listed = { procedures: Array<{ key: string; runtime: boolean; hasHandler: boolean }>; count: number };
    const all = await client.exec<Listed>(["procedure", "list"], {});
    expect(all.procedures.find((p) => p.key === "client.add")).toMatchObject({ runtime: false, hasHandler: true });
    expect(all.procedures.find((p) => p.key === "test.listed")).toMatchObject({ runtime: true });
    expect(all.count).toBe(all.procedures.length);
    const client2 = await client.exec<Listed>(["procedure", "list"], { namespace: "test" });
    expect(client2.procedures.map((p) => p.key)).toEqual(["test.listed"]);
    const runtime = await client.exec<Listed>(["procedure", "list"], { runtime: true });
    expect(runtime.procedures.map((p) => p.key)).toEqual(["test.listed"]);
  });

  it("DOC-6: procedure.get describes any procedure, with a path or a key", async () => {
    const { client } = makeClient();
    await define(client, ["test", "got"], add(1, 1));
    expect(await client.exec(["procedure", "get"], { path: ["client", "add"] })).toMatchObject({
      found: true,
      key: "client.add",
      runtime: false,
      hasHandler: true,
    });
    const defined = await client.exec<{ found: boolean; runtime: boolean; metadata: { aggregation?: unknown } }>(
      ["procedure", "get"],
      { path: "test.got" },
    );
    expect(defined).toMatchObject({ found: true, runtime: true });
    expect(defined.metadata.aggregation).toEqual(add(1, 1));
    expect(await client.exec(["procedure", "get"], { path: ["no", "such"] })).toEqual({ found: false });
  });
});

describe("DOC-3: a defined body runs like exec()", () => {
  const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];
  const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });

  function makeClient(): Client {
    const registry = new ProcedureRegistry();
    for (const procedure of [...allCoreProcedures, ...metaProcedures]) registry.register(procedure);
    return new Client(stubTransport).useRegistry(registry);
  }

  /** The result of the program through exec(), and through procedure.define and a call. */
  async function bothWays(program: Record<string, unknown>, input: Record<string, unknown> = {}): Promise<[unknown, unknown]> {
    const client = makeClient();
    const direct = await client.exec(program as never);
    await client.exec({ $proc: ["procedure", "define"], input: { path: ["test", "doc3"], aggregation: program } });
    const defined = await client.exec(["test", "doc3"], input);
    return [direct, defined];
  }

  it("hydrates the root input as a root: a list of calls there is a chain", async () => {
    const [direct, defined] = await bothWays({ $proc: ["client", "identity"], input: { value: [add(1, 1), add(2, 2)] } });
    expect(direct).toMatchObject({ final: 4 });
    expect(defined).toEqual(direct);
  });

  it("ignores a $when on the root call", async () => {
    const [direct, defined] = await bothWays({ ...add(1, 2), $when: "$never" });
    expect(direct).toBe(3);
    expect(defined).toBe(3);
  });

  it("starts a control-flow root with its operands raw", async () => {
    const [direct, defined] = await bothWays({
      $proc: ["client", "chain"],
      input: { steps: [add(1, 1), add({ $ref: "$last" }, 10)] },
    });
    expect(defined).toEqual(direct);
  });

  it("runs a nested ref of the root input", async () => {
    const [direct, defined] = await bothWays(add(add(1, 1), 3));
    expect(direct).toBe(5);
    expect(defined).toBe(5);
  });

  it("gives input.* in the root input and in the operands of a control-flow root", async () => {
    const client = makeClient();
    await client.exec({ $proc: ["procedure", "define"], input: { path: ["test", "inc"], aggregation: add({ $ref: "input.x" }, 1) } });
    expect(await client.exec(["test", "inc"], { x: 2 })).toBe(3);
    await client.exec({
      $proc: ["procedure", "define"],
      input: { path: ["test", "steps"], aggregation: { $proc: ["client", "chain"], input: { steps: [add({ $ref: "input.x" }, 1)] } } },
    });
    expect(await client.exec(["test", "steps"], { x: 5 })).toMatchObject({ final: 6 });
  });
});
