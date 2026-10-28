/**
 * client.trace (AG1-B): a step-by-step run of a chain program that never writes.
 *
 * Each row of a read-only program equals the result of the same step in client.chain. A step
 * that can write does not start: its handler log stays empty. A nested write is refused by the
 * capability, also under a host with no limits, because trace narrows each call to no writes.
 */

import { describe, it, expect } from "vitest";
import { ProcedureRegistry } from "../registry.js";
import { invokePath, outputValue, type InvokeOptions } from "../invoke.js";
import { narrowCapability } from "../capability.js";
import { defineProcedure } from "../define.js";
import { outputSchema } from "./schemas.js";
import { allCoreProcedures, type TraceRow } from "./index.js";
import type { AnyProcedure, Capability, Effects, ProcedureContext } from "../types.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import { hostPolicy, procedureServerOptions } from "../../server/host-policy.js";

const NO_EFFECTS: Effects = { reads: [], writes: [] };
const WRITES_FS: Effects = { reads: [], writes: ["fs"] };
const READS_FS: Effects = { reads: ["fs"], writes: [] };
const READ_ONLY: Capability = narrowCapability(undefined, { effects: { writes: [] } });

function proc(path: string[], handler: (input: unknown, ctx: ProcedureContext) => unknown, metadata: Record<string, unknown> = {}): AnyProcedure {
  return defineProcedure({ path, input: outputSchema<unknown>(), output: outputSchema<unknown>(), metadata, handler }) as AnyProcedure;
}

/** The core procedures, a writer, a procedure without declared effects, and read-only recorders. */
function makeRegistry(log: string[]): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  for (const procedure of allCoreProcedures) registry.register(procedure);
  registry.register(proc(["files", "write"], () => { log.push("write"); return "written"; }, { effects: WRITES_FS }));
  registry.register(proc(["files", "unknown"], () => { log.push("unknown"); return "?"; }));
  registry.register(proc(["files", "read"], () => { log.push("read"); return "content"; }, { effects: READS_FS }));
  registry.register(proc(["test", "record"], (input) => { log.push(`record ${JSON.stringify(input)}`); return input; }, { effects: NO_EFFECTS }));
  return registry;
}

const call = (path: string, input?: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  $proc: path.split("."),
  ...(input === undefined ? {} : { input }),
  ...extra,
});

async function run(registry: ProcedureRegistry, path: string, input: unknown, options: InvokeOptions = {}): Promise<unknown> {
  return outputValue(await invokePath(path.split("."), input, { registry, ...options }), path.split("."));
}

async function trace(registry: ProcedureRegistry, input: unknown, options: InvokeOptions = {}): Promise<TraceRow[]> {
  return ((await run(registry, "client.trace", input, options)) as { steps: TraceRow[] }).steps;
}

const short = (rows: TraceRow[]): Array<[string, string | undefined]> => rows.map((row) => [row.status, row.reason]);

describe("client.trace: the same results as client.chain", () => {
  const programs: Record<string, Record<string, unknown>> = {
    "$name and $last": {
      steps: [
        call("client.add", { a: 1, b: 2 }, { $name: "sum" }),
        call("client.multiply", { a: { $ref: "$last" }, b: 10 }),
        call("client.add", { a: { $ref: "sum" }, b: { $ref: "$last" } }),
      ],
    },
    "a $ref with fields": {
      steps: [
        call("client.identity", { value: { user: { name: "ada" } } }, { $name: "who" }),
        call("client.toUpper", { value: { $ref: "who.user.name" } }),
      ],
    },
    "literal steps": { steps: ["a", { $ref: "$last" }, { total: call("client.add", { a: 2, b: 3 }) }] },
    "a $never step": {
      steps: [
        call("client.add", { a: 1, b: 1 }),
        call("client.add", { a: 5, b: 5 }, { $when: "$never" }),
        call("client.identity", { value: { $ref: "$last" } }),
      ],
    },
    "passThrough and initialInput": {
      passThrough: true,
      initialInput: { a: 2, b: 3 },
      steps: [call("client.add"), call("client.multiply", { a: { $ref: "$last" }, b: 2 })],
    },
    "nested control flow that reads an outer name": {
      steps: [
        call("client.gt", { a: 5, b: 3 }, { $name: "big" }),
        call("client.conditional", { condition: { $ref: "big" }, then: "large", else: "small" }),
      ],
    },
  };

  for (const [name, program] of Object.entries(programs)) {
    it(`gives each row the result of client.chain: ${name}`, async () => {
      const registry = makeRegistry([]);
      const { results } = (await run(registry, "client.chain", program)) as { results: unknown[] };
      const rows = await trace(registry, program);
      expect(rows).toHaveLength(results.length);
      expect(rows.map((row) => row.output)).toEqual(results);
      expect(rows.map((row) => row.index)).toEqual(results.map((_, index) => index));
    });
  }

  it("marks a $never step as not-run with reason when, and the next step reads it as $last", async () => {
    const rows = await trace(makeRegistry([]), programs["a $never step"]);
    expect(short(rows)).toEqual([["ok", undefined], ["not-run", "when"], ["ok", undefined]]);
    expect(rows[1]!.output).toEqual(rows[2]!.output);
    expect(rows[1]!.output).toMatchObject({ $proc: ["client", "add"], $when: "$never" });
  });

  it("gives the name, the path and the declared effects of a call step", async () => {
    const rows = await trace(makeRegistry([]), programs["$name and $last"]);
    expect(rows[0]).toEqual({ index: 0, name: "sum", proc: ["client", "add"], effects: NO_EFFECTS, status: "ok", output: 3 });
    expect(rows[1]).not.toHaveProperty("name");
  });

  it("gives a literal step its value, without a path", async () => {
    const rows = await trace(makeRegistry([]), programs["literal steps"]);
    expect(rows[2]).toEqual({ index: 2, status: "ok", output: { total: 5 } });
  });
});

describe("client.trace: a step that can write does not run", () => {
  it("does not start a procedure that declares writes, and marks the later steps as earlier", async () => {
    const log: string[] = [];
    const rows = await trace(makeRegistry(log), {
      steps: [call("test.record", { n: 1 }), call("files.write", {}), call("test.record", { n: 3 })],
    });
    expect(short(rows)).toEqual([["ok", undefined], ["not-run", "writes"], ["not-run", "earlier"]]);
    expect(rows[1]).toMatchObject({ proc: ["files", "write"], effects: WRITES_FS });
    expect(rows[1]).not.toHaveProperty("output");
    expect(log).toEqual(['record {"n":1}']);
  });

  it("does not start a procedure that declares no effects", async () => {
    const log: string[] = [];
    const rows = await trace(makeRegistry(log), { steps: [call("files.unknown", {}), call("test.record", { n: 2 })] });
    expect(short(rows)).toEqual([["not-run", "writes"], ["not-run", "earlier"]]);
    expect(rows[0]).not.toHaveProperty("effects");
    expect(log).toEqual([]);
  });

  it("does not start a procedure that the registry does not have", async () => {
    const rows = await trace(makeRegistry([]), { steps: [call("nowhere.at.all", {})] });
    expect(short(rows)).toEqual([["not-run", "writes"]]);
  });

  it("refuses a write in a nested chain under a read-only capability, and nothing is written", async () => {
    const log: string[] = [];
    const rows = await trace(
      makeRegistry(log),
      { steps: [call("test.record", { n: 1 }), call("client.chain", { steps: [call("files.write", {})] }), call("test.record", { n: 3 })] },
      { capability: READ_ONLY },
    );
    expect(short(rows)).toEqual([["ok", undefined], ["not-run", "writes"], ["not-run", "earlier"]]);
    expect(log).toEqual(['record {"n":1}']);
  });

  it("refuses a nested write also when the caller has no limits: each call of trace asks for no writes", async () => {
    const log: string[] = [];
    const registry = makeRegistry(log);
    const nested = await trace(registry, { steps: [call("client.chain", { steps: [call("files.unknown", {})] })] });
    expect(short(nested)).toEqual([["not-run", "writes"]]);
    const inInput = await trace(registry, { steps: [call("client.identity", { value: call("files.write", {}) })] });
    expect(short(inInput)).toEqual([["not-run", "writes"]]);
    const inLiteral = await trace(registry, { steps: [{ result: call("files.write", {}) }] });
    expect(short(inLiteral)).toEqual([["not-run", "writes"]]);
    expect(log).toEqual([]);
  });

  it("gives a refused read as an error, not as writes (the capability reads only the registry)", async () => {
    const log: string[] = [];
    const registryOnly = narrowCapability(undefined, { effects: { reads: ["registry"], writes: [] } });
    const rows = await trace(makeRegistry(log), { steps: [call("files.read", {}), call("client.add", { a: 1, b: 1 })] }, { capability: registryOnly });
    expect(short(rows)).toEqual([["error", undefined], ["not-run", "earlier"]]);
    expect(rows[0]!.error).toMatchObject({ code: "FORBIDDEN" });
    expect(log).toEqual([]);
  });
});

describe("client.trace: upTo, sampleLimit and errors", () => {
  it("does not run the steps above upTo", async () => {
    const log: string[] = [];
    const rows = await trace(makeRegistry(log), {
      upTo: 1,
      steps: [call("test.record", { n: 0 }), call("test.record", { n: 1 }), call("test.record", { n: 2 }), call("files.write", {})],
    });
    expect(short(rows)).toEqual([["ok", undefined], ["ok", undefined], ["not-run", "upTo"], ["not-run", "upTo"]]);
    expect(log).toEqual(['record {"n":0}', 'record {"n":1}']);
  });

  it("with upTo 0, runs only the first step", async () => {
    const rows = await trace(makeRegistry([]), { upTo: 0, steps: [call("client.add", { a: 1, b: 1 }), call("client.add", { a: 2, b: 2 })] });
    expect(rows.map((row) => [row.status, row.reason, row.output])).toEqual([["ok", undefined, 2], ["not-run", "upTo", undefined]]);
  });

  it("cuts the arrays of a row with sampleLimit, and the next step gets the full value", async () => {
    const rows = await trace(makeRegistry([]), {
      sampleLimit: 2,
      steps: [
        call("client.range", { start: 0, end: 10 }, { $name: "numbers" }),
        call("client.arrLength", { items: { $ref: "numbers" } }),
        call("client.identity", { value: { rows: { $ref: "numbers" }, total: { $ref: "$last" }, nested: { deep: [1, 2, 3] } } }),
      ],
    });
    expect(rows[0]!.output).toEqual([0, 1]);
    expect(rows[1]!.output).toBe(10);
    // An object: each array of its top-level fields is cut. The deeper values stay as they are.
    expect(rows[2]!.output).toEqual({ rows: [0, 1], total: 10, nested: { deep: [1, 2, 3] } });
  });

  it("marks a failed step as error with its code and message, and the later steps as earlier", async () => {
    const log: string[] = [];
    const rows = await trace(makeRegistry(log), {
      steps: [call("client.add", { a: 1, b: 1 }), call("client.throw", { message: "boom", code: "E_BOOM" }), call("test.record", { n: 2 })],
    });
    expect(short(rows)).toEqual([["ok", undefined], ["error", undefined], ["not-run", "earlier"]]);
    expect(rows[1]!.error).toEqual({ code: "E_BOOM", message: "boom" });
    expect(log).toEqual([]);
  });

  it("gives an empty program no rows", async () => {
    expect(await trace(makeRegistry([]), { steps: [] })).toEqual([]);
  });

  it("refuses steps that are not an array", async () => {
    await expect(run(makeRegistry([]), "client.trace", { steps: "x" })).rejects.toThrow(/VALIDATION|steps/);
  });
});

describe("client.trace through a read-only host", () => {
  it("is admitted under hostPolicy({ readOnly: true }), and no write is reachable", async () => {
    const log: string[] = [];
    const server = new ProcedureServer(procedureServerOptions(hostPolicy({ readOnly: true }), makeRegistry(log)));
    const steps = [
      call("client.add", { a: 1, b: 2 }, { $name: "sum" }),
      call("client.chain", { steps: [call("files.write", {})] }),
      call("files.write", {}),
    ];
    const response = await server.handle({ id: "1", method: { service: "client", operation: "trace" }, payload: { steps }, metadata: {} });
    expect(response.status).toMatchObject({ type: "success" });
    const rows = (response.payload as { steps: TraceRow[] }).steps;
    expect(short(rows)).toEqual([["ok", undefined], ["not-run", "writes"], ["not-run", "earlier"]]);
    expect(rows[0]!.output).toBe(3);

    const direct = await server.handle({ id: "2", method: { service: "client", operation: "trace" }, payload: { steps: [call("files.write", {})] }, metadata: {} });
    expect((direct.payload as { steps: TraceRow[] }).steps.map((row) => row.reason)).toEqual(["writes"]);
    expect(log).toEqual([]);
  });
});
