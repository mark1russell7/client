/**
 * Random programs for the property tests: calls of the deterministic test procedures of the
 * harness, the core control flow, names, `$ref`, `$literal`, `$when`, implicit chains, `cwd`,
 * `passThrough`, `client.eval`, and inputs that are not valid.
 */

import fc from "fast-check";
import { checkProgram } from "../src/program.js";
import type { ProcedureFacts } from "../src/facts.js";

/** This function puts a value at a JSON pointer of a JSON value. */
function setAt(root: unknown, pointer: string, value: unknown): void {
  const parts = pointer
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  const last = parts.pop();
  if (last === undefined) return;
  let current = root as Record<string, unknown>;
  for (const part of parts) current = current[part] as Record<string, unknown>;
  current[last] = value;
}

/**
 * This function replaces each `$ref` that the check finds unknown with a number, so a program
 * runs further. The equivalence test then compares longer runs.
 */
export function repairNames(program: Record<string, unknown>, facts: ProcedureFacts): Record<string, unknown> {
  const pointers = checkProgram(program, { facts })
    .diagnostics.filter((diagnostic) => diagnostic.severity === "error" && (diagnostic.code === "unknown-name" || diagnostic.code === "use-before-definition"))
    .map((diagnostic) => diagnostic.pointer);
  if (pointers.length === 0) return program;
  const copy = JSON.parse(JSON.stringify(program)) as Record<string, unknown>;
  for (const pointer of pointers) setAt(copy, pointer, 1);
  return copy;
}

type Json = unknown;
type Arb<T = Json> = fc.Arbitrary<T>;

/** The options of the generator. */
export interface ProgramOptions {
  /** The deepest nesting of calls. */
  readonly depth: number;
  /** True: `client.parallel` runs its tasks one at a time, so the order of the calls is known. */
  readonly sequentialParallel: boolean;
  /** True: the programs use the store (`t.write`, `t.read`). */
  readonly store: boolean;
  /** True: the programs call a procedure that the registry does not have. */
  readonly missing?: boolean | undefined;
  /** False: no call of `t.fail` and no control flow with an input that is not valid, so the runs are longer. */
  readonly failures?: boolean | undefined;
}

const STEP_NAMES = ["s1", "s2", "s3"] as const;
const REF_NAMES = ["s1", "s2", "s3", "$last", "item", "index", "acc", "error", "input", "n", "nope"] as const;
const FIELDS = ["value", "results", "final", "0", "written", "a", "success"] as const;
const KEYS = ["a", "b", "1", "0", "value"] as const;

function weighted<T>(...options: Array<[number, Arb<T>]>): Arb<T> {
  return fc.oneof(...options.filter(([weight]) => weight > 0).map(([weight, arbitrary]) => ({ arbitrary, weight })));
}

/** The arbitrary of a program (a root call) and of its parts. */
export function programArbitrary(options: ProgramOptions): Arb<Record<string, unknown>> {
  const leaf: Arb = weighted<Json>(
    [4, fc.integer({ min: -3, max: 5 })],
    [2, fc.constantFrom("a", "b", "")],
    [2, fc.boolean()],
    [1, fc.constant(null)],
    [1, fc.constant({ value: 0 })],
  );
  // The names that a scope often has come more often: a program with only unknown names stops at once
  const refName = weighted<string>(
    [3, fc.constant("$last")],
    [3, fc.constant("s1")],
    [2, fc.constant("s2")],
    [2, fc.constant("item")],
    [1, fc.constantFrom(...REF_NAMES)],
  );
  const refText: Arb<string> = fc
    .tuple(refName, fc.option(fc.constantFrom(...FIELDS), { freq: 3 }))
    .map(([name, field]) => (field === null ? name : `${name}.${field}`));
  const ref: Arb = refText.map(($ref) => ({ $ref }));

  const exprs = new Map<number, Arb>();
  const calls = new Map<number, Arb<Record<string, unknown>>>();
  const operands = new Map<number, Arb>();

  const memo = <T>(cache: Map<number, Arb<T>>, depth: number, make: () => Arb<T>): Arb<T> => {
    let arbitrary = cache.get(depth);
    if (!arbitrary) {
      arbitrary = make();
      cache.set(depth, arbitrary);
    }
    return arbitrary;
  };

  /** A value of an input: data, `$ref`, `$literal`, a call, an object or an array. */
  const expr = (depth: number): Arb =>
    memo(exprs, depth, () => {
      if (depth <= 0) return weighted<Json>([5, leaf], [3, ref], [1, leaf.map(($literal) => ({ $literal }))]);
      return weighted<Json>(
        [2, leaf],
        [2, ref],
        [8, call(depth - 1)],
        [2, fc.dictionary(fc.constantFrom(...KEYS), expr(depth - 1), { maxKeys: 3 })],
        [1, fc.array(expr(depth - 1), { maxLength: 3 })],
        [2, fc.array(call(depth - 1), { minLength: 1, maxLength: 3 })],
        [1, call(depth - 1).map(($literal) => ({ $literal }))],
      );
    });

  /** An operand of control flow: a call, a value or a list of calls. */
  const operand = (depth: number): Arb =>
    memo(operands, depth, () => weighted<Json>([5, call(depth)], [3, expr(depth)], [1, fc.array(call(depth), { minLength: 1, maxLength: 2 })]));

  const decorate = (base: Arb<Record<string, unknown>>): Arb<Record<string, unknown>> =>
    fc
      .tuple(
        base,
        weighted<string | undefined>([3, fc.constant(undefined)], [2, fc.constantFrom(...STEP_NAMES)]),
        weighted<string | undefined>([24, fc.constant(undefined)], [2, fc.constant("$never")], [1, fc.constant("$parent")], [1, fc.constant("$immediate")], [1, fc.constant("runner")]),
        weighted<boolean>([30, fc.constant(false)], [1, fc.constant(true)]),
      )
      .map(([call, name, when, dropInput]) => {
        const result: Record<string, unknown> = { ...call };
        if (dropInput) delete result["input"];
        if (name !== undefined) result["$name"] = name;
        if (when !== undefined) result["$when"] = when;
        return result;
      });

  const proc = (path: string[], input: Arb): Arb<Record<string, unknown>> => input.map((value) => ({ $proc: path, input: value }));

  /** A call: a test procedure, a core procedure or control flow. */
  const call = (depth: number): Arb<Record<string, unknown>> =>
    memo(calls, depth, () => {
      const inner = expr(depth);
      const simple: Array<[number, Arb<Record<string, unknown>>]> = [
        [4, proc(["t", "num"], fc.record({ name: fc.constantFrom("n1", "n2", "n3"), value: inner }))],
        [3, proc(["t", "add"], fc.record({ a: inner, b: inner }))],
        [2, proc(["t", "echo"], inner)],
        [2, proc(["t", "truth"], fc.record({ value: inner }))],
        [options.failures === false ? 0 : 1, proc(["t", "fail"], fc.record({ message: fc.constantFrom("m1", "m2") }))],
        [1, proc(["client", "identity"], fc.record({ value: inner }))],
        [1, proc(["client", "add"], fc.record({ a: weighted<Json>([4, fc.integer({ min: -3, max: 5 })], [1, inner]), b: weighted<Json>([4, fc.integer({ min: -3, max: 5 })], [1, inner]) }))],
      ];
      if (options.missing) simple.push([1, fc.constant({ $proc: ["t", "missing"], input: {} })]);
      if (options.store) {
        simple.push([2, proc(["t", "write"], fc.record({ key: fc.constantFrom("k1", "k2"), value: inner }))]);
        simple.push([2, proc(["t", "read"], fc.record({ key: fc.constantFrom("k1", "k2") }))]);
      }
      if (depth <= 0) return decorate(weighted(...simple));
      const next = depth - 1;
      const op = operand(next);
      const cwd = weighted<Record<string, unknown>>([5, fc.constant({})], [1, fc.constant({ cwd: "/w" })]);
      const control: Array<[number, Arb<Record<string, unknown>>]> = [
        [
          4,
          fc
            .tuple(
              fc.array(weighted<Json>([6, call(next)], [2, expr(next)], [1, fc.array(call(next), { minLength: 1, maxLength: 2 })]), { minLength: 1, maxLength: 4 }),
              weighted<boolean | undefined>([4, fc.constant(undefined)], [1, fc.constant(true)]),
              weighted<Json>([3, fc.constant(undefined)], [1, expr(next)]),
              cwd,
            )
            .map(([steps, passThrough, initialInput, context]) => ({
              $proc: ["client", "chain"],
              input: { steps, ...(passThrough !== undefined ? { passThrough } : {}), ...(initialInput !== undefined ? { initialInput } : {}), ...context },
            })),
        ],
        [
          2,
          fc
            .tuple(fc.array(op, { minLength: 1, maxLength: 3 }), options.sequentialParallel ? fc.boolean() : fc.constant(false), weighted<number | undefined>([3, fc.constant(options.sequentialParallel ? 1 : undefined)], [1, fc.constant(1)]))
            .map(([tasks, failFast, concurrency]) => ({
              $proc: ["client", "parallel"],
              input: { tasks, ...(failFast ? { failFast } : {}), ...(concurrency !== undefined ? { concurrency } : {}) },
            })),
        ],
        [
          3,
          fc
            .tuple(op, weighted<Json>([1, fc.constant(undefined)], [4, op]), weighted<Json>([2, fc.constant(undefined)], [3, op]), cwd)
            .map(([condition, then, otherwise, context]) => ({
              $proc: ["client", "conditional"],
              input: { condition, ...(then !== undefined ? { then } : {}), ...(otherwise !== undefined ? { else: otherwise } : {}), ...context },
            })),
        ],
        [
          3,
          fc
            .tuple(op, weighted<Json>([1, fc.constant(undefined)], [4, op]))
            .map(([tried, caught]) => ({ $proc: ["client", "tryCatch"], input: { try: tried, ...(caught !== undefined ? { catch: caught } : {}) } })),
        ],
        [
          2,
          fc
            .tuple(fc.constantFrom("and", "or"), fc.array(op, { minLength: 1, maxLength: 3 }), cwd)
            .map(([name, values, context]) => ({ $proc: ["client", name], input: { values, ...context } })),
        ],
        [
          2,
          fc
            .tuple(
              weighted<Json>([4, fc.array(expr(next), { maxLength: 3 })], [options.failures === false ? 0 : 1, expr(next)]),
              weighted<Json>([1, fc.constant(undefined)], [12, call(next)], [1, leaf]),
              weighted<string | undefined>([4, fc.constant(undefined)], [1, fc.constant("n")], [1, fc.constant("index")]),
            )
            .map(([items, fn, as]) => ({
              $proc: ["client", "map"],
              input: { items, ...(fn !== undefined ? { fn } : {}), ...(as !== undefined ? { as } : {}) },
            })),
        ],
        [
          2,
          fc
            .tuple(
              weighted<Json>([4, fc.array(expr(next), { maxLength: 3 })], [options.failures === false ? 0 : 1, expr(next)]),
              expr(next),
              weighted<Json>([1, fc.constant(undefined)], [5, call(next)]),
              weighted<Json>([6, fc.constant(undefined)], [1, expr(next)]),
            )
            .map(([items, initial, fn, accumulated]) => ({
              $proc: ["client", "reduce"],
              input: { items, initial, ...(fn !== undefined ? { fn } : {}), ...(accumulated !== undefined ? { accumulated } : {}) },
            })),
        ],
        [
          1,
          fc
            .tuple(fc.constantFrom(["t", "num"], ["t", "echo"]), expr(next))
            .map(([procedure, input]) => ({ $proc: ["client", "eval"], input: { procedure, input } })),
        ],
      ];
      // Control flow with an input that is not valid: the call gives the validation error. It is
      // rare: one such call stops the whole program.
      const invalid = fc.constantFrom({ $proc: ["client", "chain"], input: { steps: "x" } }, { $proc: ["client", "and"], input: {} }, { $proc: ["client", "map"], input: { as: 5 } });
      return decorate(
        weighted(...simple, ...control.map(([weight, arbitrary]): [number, Arb<Record<string, unknown>>] => [weight * 4, arbitrary]), [options.failures === false ? 0 : 1, invalid]),
      );
    });

  // The root: a call, mostly control flow
  return call(options.depth);
}
