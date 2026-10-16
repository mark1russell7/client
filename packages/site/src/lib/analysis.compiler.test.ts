/**
 * One semantics (roadmap R22): the analysis of the Composer and the passes of the compiler agree
 * on the implicit chains, the unknown names, the unknown procedures and the root problem. The
 * Composer keeps its own analysis, because the page has no room for the compiler. This test
 * makes sure that the two cannot disagree.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ProcedureRegistry, allCoreProcedures, metaProcedures, pathToKey } from "@procedures/client/browser";
import { checkProgram, registryFacts } from "@procedures/compiler";
import { analyzeProgram } from "./analysis";
import { examples } from "./examples";
import { locationKey, type Json, type Location } from "./program";

const registry = new ProcedureRegistry();
for (const procedure of [...allCoreProcedures, ...metaProcedures]) registry.register(procedure);
const facts = registryFacts(registry);
const known = (key: string): boolean => registry.getAll().some((procedure) => pathToKey(procedure.path) === key);

/** The location of an RFC 6901 pointer in a program: a number for an index of a list. */
function locationOf(program: Json, pointer: string): Location {
  if (pointer === "") return [];
  const location: Location = [];
  let value: unknown = program;
  for (const raw of pointer.slice(1).split("/")) {
    const segment = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(value)) {
      location.push(Number(segment));
      value = value[Number(segment)];
    } else {
      location.push(segment);
      value = value !== null && typeof value === "object" ? (value as Record<string, unknown>)[segment] : undefined;
    }
  }
  return location;
}

interface View {
  chains: string[];
  unknownRefs: string[];
  unknownCalls: string[];
  rootProblem: boolean;
}

function siteView(program: Json): View {
  const analysis = analyzeProgram(program, known);
  return {
    chains: [...analysis.chains].sort(),
    unknownRefs: analysis.unknownRefs.map((use) => locationKey(use.location)).sort(),
    unknownCalls: analysis.unknownCalls.map((use) => locationKey(use.location)).sort(),
    rootProblem: analysis.rootProblem !== null,
  };
}

function compilerView(program: Json): View {
  const result = checkProgram(program, { facts });
  const at = (...codes: string[]): string[] =>
    [...new Set(result.diagnostics.filter((diagnostic) => codes.includes(diagnostic.code)).map((diagnostic) => locationKey(locationOf(program, diagnostic.pointer))))].sort();
  return {
    chains: at("implicit-chain"),
    // The Composer marks a $ref outside each scope as an unknown name too. The compiler calls it
    // unscoped-ref (the interpreter keeps it as data), and a name of a later step
    // use-before-definition.
    unknownRefs: at("unknown-name", "unscoped-ref", "use-before-definition"),
    unknownCalls: at("unknown-procedure"),
    // The compiler reads a list at the root as a path (client.exec(path)): an empty list is not a
    // valid path. The Composer says that the root must be a call. Both refuse the root.
    rootProblem: result.diagnostics.some(
      (diagnostic) => diagnostic.pointer === "" && (diagnostic.code === "root-not-call" || diagnostic.code === "invalid-path"),
    ),
  };
}

const RUNS = Number(process.env["FC_RUNS"] ?? 300);

/** A program of the Composer: control flow, names, refs, lists of calls and unknown procedures. */
const programs: fc.Arbitrary<Json> = fc.letrec<{ value: Json; call: Json }>((tie) => {
  const value = tie("value");
  const call = tie("call");
  const name = fc.constantFrom("a", "b", "item", "acc", "index", "$last", "error", "missing");
  const leaf = fc.oneof(fc.integer({ min: -5, max: 5 }), fc.constantFrom<Json>("text", true, null));
  const named = (step: fc.Arbitrary<Json>) =>
    fc.tuple(step, fc.option(fc.constantFrom("a", "b"), { nil: undefined })).map(([item, label]) =>
      label !== undefined && item !== null && typeof item === "object" && !Array.isArray(item) && "$proc" in item ? { ...item, $name: label } : item,
    );
  const client = (procedure: string, input: fc.Arbitrary<Record<string, Json>>) => input.map((body): Json => ({ $proc: ["client", procedure], input: body }));
  return {
    value: fc.oneof(
      { depthSize: "small", withCrossShrink: true },
      leaf,
      name.map((label): Json => ({ $ref: label })),
      call,
      fc.array(value, { maxLength: 3 }),
      fc.array(call, { minLength: 1, maxLength: 3 }),
      fc.dictionary(fc.constantFrom("x", "y"), value, { maxKeys: 2 }),
    ),
    call: fc.oneof(
      { depthSize: "small", withCrossShrink: true },
      client("identity", fc.record({ value })),
      client("add", fc.record({ a: value, b: value })),
      client("chain", fc.record({ steps: fc.array(named(value), { maxLength: 3 }) })),
      client("map", fc.record({ items: value, fn: call })),
      client("reduce", fc.record({ items: value, initial: value, fn: call })),
      client("conditional", fc.record({ condition: value, then: value, else: value })),
      client("tryCatch", fc.record({ try: value, catch: value })),
      client("parallel", fc.record({ tasks: fc.array(value, { maxLength: 2 }) })),
      client("and", fc.record({ values: fc.array(value, { maxLength: 2 }) })),
      client("or", fc.record({ values: fc.array(value, { maxLength: 2 }) })),
      value.map((input): Json => ({ $proc: ["x", "unknown"], input: { value: input } })),
    ),
  };
}).call;

/** A root: usually a call, sometimes a value that is not a call. */
const roots: fc.Arbitrary<Json> = fc.oneof({ weight: 6, arbitrary: programs }, { weight: 1, arbitrary: fc.constantFrom<Json>([], 1, { a: 1 }, [{ $ref: "a" }]) });

/** The views to compare. A root that is not a call stops the compiler, so only the root problem counts. */
function comparable(view: View): View | { rootProblem: true } {
  return view.rootProblem ? { rootProblem: true } : view;
}

describe("the analysis of the Composer and the compiler agree (R22)", () => {
  for (const example of examples) {
    it(`agree on the example ${example.title}`, () => {
      expect(compilerView(example.program)).toEqual(siteView(example.program));
    });
  }

  it("agree on random programs", () => {
    fc.assert(
      fc.property(roots, (program) => {
        expect(comparable(compilerView(program)), JSON.stringify(program)).toEqual(comparable(siteView(program)));
      }),
      { numRuns: RUNS },
    );
  });
});
