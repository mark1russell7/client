/**
 * Property tests of stage 1 of the testing program (roadmap R29): the resolver of references,
 * the narrowing of capabilities, and the expose rule of the eight control-flow procedures.
 *
 * Each property runs on inputs that fast-check makes. A failure prints the seed and the smallest
 * input that fails. `FC_RUNS` sets the number of runs (default 200).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { z } from "zod";
import { ProcedureRegistry } from "./registry.js";
import { defineProcedure } from "./define.js";
import { outputSchema, zodAdapter } from "./core/schemas.js";
import { coreProcedures } from "./core/index.js";
import { invokeProcedure, outputValue } from "./invoke.js";
import { capabilityRefusal, ladder, narrowCapability } from "./capability.js";
import { CONTROL_FLOW_PROCEDURES, createRefScope, getPath, hydrateInput, lookupOutputRef, type RefScope } from "./ref.js";
import type { Capability, CapabilityRequest, PermittedEffects, ProcedurePath } from "./types.js";

const RUNS = Number(process.env["FC_RUNS"] ?? 200);
const params = { numRuns: RUNS };

// =============================================================================
// Plain data
// =============================================================================

/** A key without the `$` of the keys of the program format. */
const plainKey = fc.string({ maxLength: 6 }).filter((key) => !key.startsWith("$"));

/** A JSON value without the keys of the program format, and without -0 (toEqual tells it from 0). */
const plainData: fc.Arbitrary<unknown> = fc.letrec<{ value: unknown }>((tie) => ({
  value: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    fc.integer(),
    fc.string({ maxLength: 8 }),
    fc.array(tie("value"), { maxLength: 4 }),
    fc.dictionary(plainKey, tie("value"), { maxKeys: 4 }),
  ),
})).value;

// =============================================================================
// The resolver of references
// =============================================================================

const NAMES = ["a", "b", "c"] as const;
const PROTOTYPE_KEYS = ["constructor", "__proto__", "toString", "hasOwnProperty"] as const;

/** One scope: some names with values, and maybe a last result. */
const scopeLayer = fc.record(
  {
    outputs: fc.dictionary(fc.constantFrom(...NAMES), plainData, { maxKeys: 3 }),
    last: plainData,
  },
  { requiredKeys: ["outputs"] },
);

/** The scopes from the innermost to the outermost. */
const scopeChain = fc.array(scopeLayer, { minLength: 1, maxLength: 4 });

function buildScope(layers: ReadonlyArray<{ outputs: Record<string, unknown>; last?: unknown }>): RefScope {
  let scope: RefScope | undefined;
  for (const layer of [...layers].reverse()) {
    const next = createRefScope(scope);
    for (const [name, value] of Object.entries(layer.outputs)) next.outputs.set(name, value);
    if ("last" in layer) next.last = layer.last;
    scope = next;
  }
  return scope!;
}

/** The model of `getPath`: each segment reads an own field of an object. */
function modelPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** The model of `lookupOutputRef`: the innermost scope with the name gives the value. */
function modelLookup(layers: ReadonlyArray<{ outputs: Record<string, unknown>; last?: unknown }>, name: string, rest: readonly string[]) {
  for (const layer of layers) {
    if (name === "$last") {
      if ("last" in layer) return { found: true, value: modelPath(layer.last, rest) };
    } else if (Object.prototype.hasOwnProperty.call(layer.outputs, name)) {
      return { found: true, value: modelPath(layer.outputs[name], rest) };
    }
  }
  return { found: false };
}

const refName = fc.constantFrom<string>(...NAMES, "$last", "d");
const segment = fc.oneof(fc.constantFrom<string>(...NAMES, ...PROTOTYPE_KEYS), plainKey);

describe("the resolver of references (R29)", () => {
  it("finds a name in the innermost scope that has it, and reads only own fields", () => {
    fc.assert(
      fc.property(scopeChain, refName, fc.array(segment, { maxLength: 3 }), (layers, name, rest) => {
        const actual = lookupOutputRef([name, ...rest].join("."), buildScope(layers));
        const expected = modelLookup(layers, name, rest);
        expect(actual.found).toBe(expected.found);
        if (expected.found) expect(actual.value).toEqual(expected.value);
      }),
      params,
    );
  });

  it("never gives an inherited field", () => {
    fc.assert(
      fc.property(plainData, fc.array(fc.constantFrom(...PROTOTYPE_KEYS), { minLength: 1, maxLength: 3 }), (value, path) => {
        expect(getPath(value, path)).toEqual(modelPath(value, path));
        if (modelPath(value, path) === undefined) expect(getPath(value, path)).toBeUndefined();
      }),
      params,
    );
  });

  it("gives plain data unchanged, and runs nothing", async () => {
    await fc.assert(
      fc.asyncProperty(plainData, async (value) => {
        let calls = 0;
        const hydrated = await hydrateInput(value, async () => {
          calls++;
          return undefined as never;
        });
        expect(hydrated).toEqual(value);
        expect(calls).toBe(0);
      }),
      params,
    );
  });

  it("gives the value of $literal without hydration, also when it holds refs", async () => {
    const withRefs = fc.oneof(plainData, plainData.map((input) => ({ $proc: ["t", "f"], input })));
    await fc.assert(
      fc.asyncProperty(withRefs, async (value) => {
        let calls = 0;
        const hydrated = await hydrateInput({ $literal: value }, async () => {
          calls++;
          return undefined as never;
        });
        expect(hydrated).toBe(value);
        expect(calls).toBe(0);
      }),
      params,
    );
  });

  it("runs the refs from left to right and depth first, and puts each result in the place of its ref", async () => {
    // A tree of plain data and refs. An array starts with a number, so it is never an implicit chain.
    type Node = { kind: "ref"; input: Node } | { kind: "object"; entries: Array<[string, Node]> } | { kind: "array"; items: Node[] } | { kind: "leaf"; value: unknown };
    const tree: fc.Arbitrary<Node> = fc.letrec<{ node: Node }>((tie) => ({
      node: fc.oneof(
        { depthSize: "small", withCrossShrink: true },
        fc.integer().map((value): Node => ({ kind: "leaf", value })),
        tie("node").map((input): Node => ({ kind: "ref", input })),
        fc.uniqueArray(fc.tuple(plainKey, tie("node")), { maxLength: 3, selector: ([key]) => key }).map((entries): Node => ({ kind: "object", entries })),
        fc.array(tie("node"), { maxLength: 3 }).map((items): Node => ({ kind: "array", items })),
      ),
    })).node;

    await fc.assert(
      fc.asyncProperty(tree, async (root) => {
        let next = 0;
        const expectedOrder: number[] = [];
        // The program and the model of its result, with the id of each ref in its input
        const build = (node: Node): { program: unknown; result: unknown } => {
          if (node.kind === "leaf") return { program: node.value, result: node.value };
          if (node.kind === "array") {
            const parts = node.items.map(build);
            return { program: [0, ...parts.map((part) => part.program)], result: [0, ...parts.map((part) => part.result)] };
          }
          if (node.kind === "object") {
            // An object gives its integer keys first ("0" before ""): the model visits the keys in that order
            const order = Object.keys(Object.fromEntries(node.entries.map(([key]) => [key, 0])));
            const byKey = new Map(node.entries);
            const parts = order.map((key) => [key, build(byKey.get(key)!)] as const);
            return {
              program: Object.fromEntries(parts.map(([key, part]) => [key, part.program])),
              result: Object.fromEntries(parts.map(([key, part]) => [key, part.result])),
            };
          }
          const id = next++;
          const inner = build(node.input);
          expectedOrder.push(id);
          return { program: { $proc: ["t", "f"], input: { id, arg: inner.program } }, result: `r${id}:${JSON.stringify(inner.result)}` };
        };
        const { program, result } = build(root);
        const order: number[] = [];
        const hydrated = await hydrateInput({ root: program }, async (_path, input) => {
          const { id, arg } = input as { id: number; arg: unknown };
          order.push(id);
          return `r${id}:${JSON.stringify(arg)}` as never;
        }, { maxDepth: 1000 });
        expect(order).toEqual(expectedOrder);
        expect(hydrated).toEqual({ root: result });
      }),
      params,
    );
  });

  it("refuses a nesting of refs deeper than maxDepth", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 14 }), fc.integer({ min: 1, max: 12 }), async (depth, maxDepth) => {
        let program: unknown = 1;
        for (let level = 0; level < depth; level++) program = { $proc: ["t", "f"], input: { arg: program } };
        const run = hydrateInput({ root: program }, async (_path, input) => (input as { arg: unknown }).arg as never, { maxDepth });
        if (depth > maxDepth) await expect(run).rejects.toThrow("Hydration depth exceeded");
        else expect(await run).toEqual({ root: 1 });
      }),
      params,
    );
  });

  it("puts the value of each $ref in its place, and refuses a name that no scope has", async () => {
    await fc.assert(
      fc.asyncProperty(scopeChain, fc.array(fc.tuple(plainKey, refName), { minLength: 1, maxLength: 4 }), async (layers, refs) => {
        const scope = buildScope(layers);
        const program = Object.fromEntries(refs.map(([key, name]) => [key, { $ref: name }]));
        const run = hydrateInput(program, async () => undefined as never, { scope });
        const missing = Object.values(program).some(({ $ref }) => !modelLookup(layers, $ref, []).found);
        if (missing) {
          await expect(run).rejects.toThrow();
          return;
        }
        const expected = Object.fromEntries(Object.entries(program).map(([key, { $ref }]) => [key, modelLookup(layers, $ref, []).value]));
        expect(await run).toEqual(expected);
      }),
      params,
    );
  });
});

// =============================================================================
// The narrowing of capabilities
// =============================================================================

const RESOURCES = ["fs", "network", "process", "registry"] as const;
const CLEARANCES = ["public", "internal", "secret"] as const;
const order = ladder<string>(CLEARANCES);
const NOW = 1_000_000;

const permit = fc.oneof(fc.constant(undefined), fc.constant("any" as const), fc.subarray([...RESOURCES]));
const permitted: fc.Arbitrary<PermittedEffects | undefined> = fc.option(
  fc.record({ reads: permit, writes: permit, destructive: fc.option(fc.boolean(), { nil: undefined }) }).map((value) => {
    const result: { reads?: readonly string[] | "any"; writes?: readonly string[] | "any"; destructive?: boolean } = {};
    if (value.reads !== undefined) result.reads = value.reads;
    if (value.writes !== undefined) result.writes = value.writes;
    if (value.destructive !== undefined) result.destructive = value.destructive;
    return result as PermittedEffects;
  }),
  { nil: undefined },
);
const clearance = fc.option(fc.constantFrom<string>(...CLEARANCES), { nil: undefined });

const capability: fc.Arbitrary<Capability<string>> = fc
  .record({ clearance, effects: permitted, deadline: fc.option(fc.integer({ min: NOW, max: NOW + 10_000 }), { nil: undefined }) })
  .map((value) => {
    const result: { clearance?: string; effects?: PermittedEffects; deadline?: number } = {};
    if (value.clearance !== undefined) result.clearance = value.clearance;
    if (value.effects !== undefined) result.effects = value.effects;
    if (value.deadline !== undefined) result.deadline = value.deadline;
    return result as Capability<string>;
  });

const request: fc.Arbitrary<CapabilityRequest<string>> = fc
  .record({ clearance, effects: permitted, timeoutMs: fc.option(fc.oneof(fc.integer({ min: 0, max: 10_000 }), fc.constantFrom(Number.NaN, -1, Infinity)), { nil: undefined }) })
  .map((value) => {
    const result: CapabilityRequest<string> = {};
    if (value.clearance !== undefined) result.clearance = value.clearance;
    if (value.effects !== undefined) result.effects = value.effects;
    if (value.timeoutMs !== undefined) result.timeoutMs = value.timeoutMs;
    return result;
  });

/** The resources that a permit lets through, as a sorted list, or "all". */
function allowed(value: readonly string[] | "any" | undefined): string[] | "all" {
  return value === undefined || value === "any" ? "all" : [...value].sort();
}

/** True when the permit `inner` lets through only what `outer` lets through. */
function within(inner: readonly string[] | "any" | undefined, outer: readonly string[] | "any" | undefined): boolean {
  const a = allowed(inner);
  const b = allowed(outer);
  if (b === "all") return true;
  if (a === "all") return false;
  return a.every((name) => b.includes(name));
}

/** The comparable form of a capability: sorted permits and the other fields. */
function normal(value: Capability<string>) {
  return {
    clearance: value.clearance,
    reads: allowed(value.effects?.reads),
    writes: allowed(value.effects?.writes),
    destructive: value.effects?.destructive === false ? false : undefined,
    deadline: value.deadline,
  };
}

const procedureEffects = fc.option(
  fc.record({ reads: fc.option(fc.subarray([...RESOURCES]), { nil: undefined }), writes: fc.option(fc.subarray([...RESOURCES]), { nil: undefined }), destructive: fc.option(fc.boolean(), { nil: undefined }) }),
  { nil: undefined },
);

function procedureWith(effects: unknown) {
  const metadata: Record<string, unknown> = {};
  if (effects !== undefined) {
    metadata["effects"] = Object.fromEntries(Object.entries(effects as object).filter(([, value]) => value !== undefined));
  }
  return { path: ["t", "f"], metadata, handler: async () => undefined } as never;
}

describe("the narrowing of capabilities (R29)", () => {
  it("never gives more than the current capability", () => {
    fc.assert(
      fc.property(capability, request, (current, asked) => {
        const result = narrowCapability(current, asked, order, NOW);
        expect(within(result.effects?.reads, current.effects?.reads)).toBe(true);
        expect(within(result.effects?.writes, current.effects?.writes)).toBe(true);
        if (current.effects?.destructive === false) expect(result.effects?.destructive).toBe(false);
        if (current.deadline !== undefined) expect(result.deadline).toBeLessThanOrEqual(current.deadline);
        if (current.clearance !== undefined) expect(order.leq(result.clearance!, current.clearance)).toBe(true);
        expect(Number.isNaN(result.deadline)).toBe(false);
      }),
      params,
    );
  });

  it("gives the same result for two requests in either order, and a second time changes nothing", () => {
    fc.assert(
      fc.property(capability, request, request, (current, first, second) => {
        const ab = narrowCapability(narrowCapability(current, first, order, NOW), second, order, NOW);
        const ba = narrowCapability(narrowCapability(current, second, order, NOW), first, order, NOW);
        expect(normal(ab)).toEqual(normal(ba));
        const once = narrowCapability(current, first, order, NOW);
        expect(normal(narrowCapability(once, first, order, NOW))).toEqual(normal(once));
      }),
      params,
    );
  });

  it("admits under the current capability each procedure that the narrower capability admits", () => {
    fc.assert(
      fc.property(capability, request, procedureEffects, (current, asked, effects) => {
        const procedure = procedureWith(effects);
        const narrower = narrowCapability(current, asked, order, NOW);
        if (capabilityRefusal(procedure, narrower, NOW) === undefined) {
          expect(capabilityRefusal(procedure, current, NOW)).toBeUndefined();
        }
      }),
      params,
    );
  });
});

// =============================================================================
// The expose rule of the eight control-flow procedures
// =============================================================================

/**
 * A position of an operand that the procedure surely runs, and the kind of value it needs.
 * `catches`: the procedure turns an error of the operand into a result (`tryCatch`, and
 * `parallel` without `failFast`).
 */
interface Hole {
  procedure: string;
  kind: "value" | "list" | "flag";
  make: (call: unknown) => Record<string, unknown>;
  catches?: boolean;
}

const THROW = { $proc: ["client", "throw"], input: { message: "boom" } };
const HOLES: Hole[] = [
  { procedure: "chain", kind: "value", make: (call) => ({ steps: [call] }) },
  { procedure: "parallel", kind: "value", make: (call) => ({ tasks: [call] }), catches: true },
  { procedure: "parallel", kind: "value", make: (call) => ({ tasks: [call], failFast: true }) },
  { procedure: "conditional", kind: "flag", make: (call) => ({ condition: call, then: 1, else: 2 }) },
  { procedure: "conditional", kind: "value", make: (call) => ({ condition: true, then: call }) },
  { procedure: "conditional", kind: "value", make: (call) => ({ condition: false, then: 1, else: call }) },
  { procedure: "tryCatch", kind: "value", make: (call) => ({ try: call, catch: 0 }), catches: true },
  { procedure: "tryCatch", kind: "value", make: (call) => ({ try: THROW, catch: call }) },
  { procedure: "and", kind: "flag", make: (call) => ({ values: [true, call] }) },
  { procedure: "or", kind: "flag", make: (call) => ({ values: [false, call] }) },
  { procedure: "map", kind: "list", make: (call) => ({ items: call, fn: { $proc: ["client", "identity"], input: { value: { $ref: "item" } } } }) },
  { procedure: "map", kind: "value", make: (call) => ({ items: [1], fn: call }) },
  { procedure: "reduce", kind: "list", make: (call) => ({ items: call, initial: 0, fn: { $proc: ["client", "identity"], input: { value: { $ref: "acc" } } } }) },
  { procedure: "reduce", kind: "value", make: (call) => ({ items: [1], initial: 0, fn: call }) },
  { procedure: "reduce", kind: "value", make: (call) => ({ items: [1], initial: call, fn: { $proc: ["client", "identity"], input: { value: { $ref: "acc" } } } }) },
];

/** The wrappers: a control-flow procedure around another one, which runs it surely. */
const WRAPPERS: Array<{ wrap: (inner: unknown) => unknown; catches?: boolean }> = [
  { wrap: (inner) => ({ $proc: ["client", "chain"], input: { steps: [inner] } }) },
  { wrap: (inner) => ({ $proc: ["client", "parallel"], input: { tasks: [inner] } }), catches: true },
  { wrap: (inner) => ({ $proc: ["client", "parallel"], input: { tasks: [inner], failFast: true } }) },
  { wrap: (inner) => ({ $proc: ["client", "conditional"], input: { condition: true, then: inner } }) },
  { wrap: (inner) => ({ $proc: ["client", "map"], input: { items: [1], fn: inner } }) },
  { wrap: (inner) => ({ $proc: ["client", "tryCatch"], input: { try: inner, catch: 0 } }), catches: true },
];

function exposeRegistry(counts: Record<string, number>): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  for (const procedure of coreProcedures) registry.register(procedure);
  const values = { value: 7, list: [1, 2], flag: true } as const;
  for (const namespace of ["secret", "open"]) {
    for (const kind of ["value", "list", "flag"] as const) {
      registry.register(
        defineProcedure({
          path: [namespace, kind],
          input: zodAdapter<Record<string, unknown>>(z.looseObject({})),
          output: outputSchema<unknown>(),
          metadata: { effects: { reads: [], writes: [] } },
          handler: async () => {
            counts[namespace] = (counts[namespace] ?? 0) + 1;
            return values[kind];
          },
        }),
      );
    }
  }
  return registry;
}

describe("the expose rule of the control-flow procedures (R29)", () => {
  it("covers each of the eight control-flow procedures", () => {
    expect(new Set(HOLES.map((hole) => hole.procedure))).toEqual(new Set(CONTROL_FLOW_PROCEDURES));
  });

  it("never runs a procedure that the host does not expose, at any depth of control flow", async () => {
    const expose = (path: ProcedurePath): boolean => path[0] !== "secret";
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...HOLES),
        fc.constantFrom("secret", "open"),
        fc.array(fc.constantFrom(...WRAPPERS), { maxLength: 2 }),
        async (hole, namespace, wrappers) => {
          const counts: Record<string, number> = {};
          const registry = exposeRegistry(counts);
          const call = { $proc: [namespace, hole.kind], input: {} };
          let program: unknown = { $proc: ["client", hole.procedure], input: hole.make(call) };
          for (const wrapper of wrappers) program = wrapper.wrap(program);
          const root = program as { $proc: string[]; input: unknown };
          const run = invokeProcedure(registry.get(root.$proc)!, root.input, { registry, expose }).then((output) => outputValue(output));
          // A procedure that catches turns the refusal into a result: then the run ends without an error
          const caught = hole.catches === true || wrappers.some((wrapper) => wrapper.catches === true);
          if (namespace === "secret") {
            if (caught) await run;
            else await expect(run).rejects.toMatchObject({ code: "NOT_EXPOSED" });
            expect(counts["secret"] ?? 0).toBe(0);
          } else {
            await run;
            expect(counts["open"]).toBeGreaterThan(0);
          }
        },
      ),
      params,
    );
  });
});
