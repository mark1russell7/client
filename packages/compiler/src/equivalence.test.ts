/**
 * The equivalence property: for random programs, the interpreter of the client, the closure code
 * and the source text give the same result (or the same error) and make the same calls in the
 * same order. The programs use the control flow, names, `$ref`, `$literal`, `$when`, implicit
 * chains, `cwd`, `passThrough`, `client.eval` and inputs that are not valid.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { makeHarness, stable, type Harness } from "../test/harness.js";
import { programArbitrary, repairNames, type ProgramOptions } from "../test/programs.js";

/** The three runs of a program agree: the result or the error, and the ordered calls. */
async function agree(harness: Harness, program: Record<string, unknown>): Promise<void> {
  const interpreted = await harness.interpret(program);
  const compiled = await harness.compile(program);
  expect(await harness.runCompiled(compiled.run)).toEqual(interpreted);
  expect(await harness.runText(compiled.body)).toEqual(interpreted);
}

/**
 * The time limit of a property test: hundreds of programs, each run three ways and checked. The
 * names pass of the check and the run of the kernel take time, and the runners of CI vary.
 */
const PROPERTY_TIMEOUT = 30_000;

const WITH_ERRORS: ProgramOptions = { depth: 4, sequentialParallel: true, store: true, missing: true };
const LONG_RUNS: ProgramOptions = { depth: 5, sequentialParallel: true, store: true, failures: false };

describe("the compiled program operates as the interpreter", () => {
  it("gives the same result or error and the same calls in the same order, also for programs with errors", async () => {
    const harness = makeHarness();
    await fc.assert(
      fc.asyncProperty(programArbitrary(WITH_ERRORS), (program) => agree(harness, program)),
      { numRuns: 600 },
    );
  }, PROPERTY_TIMEOUT);

  it("gives the same result and calls for long runs (the unknown names replaced, no failing procedure)", async () => {
    const harness = makeHarness();
    await fc.assert(
      fc.asyncProperty(programArbitrary(LONG_RUNS), (program) => agree(harness, repairNames(program, harness.facts()))),
      { numRuns: 500 },
    );
  }, PROPERTY_TIMEOUT);

  it("gives the same result as the body of a defined procedure (mode body)", async () => {
    const harness = makeHarness();
    let count = 0;
    await fc.assert(
      fc.asyncProperty(programArbitrary({ ...WITH_ERRORS, depth: 3 }), fc.constantFrom({ x: 1 }, { x: 2, value: 3 }, 5), async (program, input) => {
        const path = ["gen", `body${count++}`];
        await harness.client.exec({ $proc: ["procedure", "define"], input: { path, aggregation: program } });
        const interpreted = await harness.interpret(path, input);
        const compiled = await harness.compile(program, { mode: "body" });
        expect(await harness.runCompiled(compiled.run, input)).toEqual(interpreted);
        expect(await harness.runText(compiled.body, input)).toEqual(interpreted);
      }),
      { numRuns: 200 },
    );
  }, PROPERTY_TIMEOUT);

  it("gives the same result and the same calls with unbounded parallel tasks (the calls of different tasks can interleave)", async () => {
    const harness = makeHarness();
    await fc.assert(
      fc.asyncProperty(programArbitrary({ depth: 4, sequentialParallel: false, store: false, failures: false }), async (raw) => {
        const program = repairNames(raw, harness.facts());
        const interpreted = await harness.interpret(program);
        const compiled = await harness.compile(program);
        const closure = await harness.runCompiled(compiled.run);
        expect(closure.outcome).toEqual(interpreted.outcome);
        expect([...closure.trace].sort()).toEqual([...interpreted.trace].sort());
      }),
      { numRuns: 200 },
    );
  }, PROPERTY_TIMEOUT);

  it("gives the same result with the fold pass (only core calls fold, so the test calls stay)", async () => {
    const harness = makeHarness();
    await fc.assert(
      fc.asyncProperty(programArbitrary(WITH_ERRORS), async (program) => {
        const interpreted = await harness.interpret(program);
        const compiled = await harness.compile(program, { fold: true });
        const closure = await harness.runCompiled(compiled.run);
        expect(stable(closure.outcome)).toEqual(stable(interpreted.outcome));
        expect(closure.trace).toEqual(interpreted.trace);
      }),
      { numRuns: 200 },
    );
  }, PROPERTY_TIMEOUT);

  it("gives the same result for client.exec(program, input): the interpreter runs the changed program", async () => {
    const harness = makeHarness();
    await fc.assert(
      fc.asyncProperty(programArbitrary({ ...WITH_ERRORS, depth: 2 }), fc.constantFrom({ value: 1 }, { steps: [] }, 7), async (program, input) => {
        const interpreted = await harness.interpret(program, input);
        const compiled = await harness.compile(program);
        expect(await harness.runCompiled(compiled.run, input)).toEqual(interpreted);
        expect(await harness.runText(compiled.body, input)).toEqual(interpreted);
      }),
      { numRuns: 100 },
    );
  }, PROPERTY_TIMEOUT);
});

describe("the inferred effects contain the observed effects", () => {
  it("each run reads and writes only what the effects allow, and a run without a failure has the must effects", async () => {
    const harness = makeHarness();
    await fc.assert(
      fc.asyncProperty(fc.oneof(programArbitrary(WITH_ERRORS), programArbitrary(LONG_RUNS)), async (raw) => {
        const program = repairNames(raw, harness.facts());
        const compiled = await harness.compile(program);
        const run = await harness.interpret(program);
        const observedReads = new Set(harness.invoked.flatMap((call) => call.effects?.reads ?? []));
        const observedWrites = new Set(harness.invoked.flatMap((call) => call.effects?.writes ?? []));
        const may = compiled.effects;
        if (may.reads) for (const name of observedReads) expect(may.reads).toContain(name);
        if (may.writes) for (const name of observedWrites) expect(may.writes).toContain(name);
        if (may.writes?.length === 0) expect(observedWrites.size).toBe(0);
        if (may.destructive === false) expect(harness.invoked.every((call) => call.effects?.destructive !== true)).toBe(true);
        // A call of an unknown procedure goes to the transport: the interceptor does not see it fail
        const unseenFailure = !run.outcome.ok || JSON.stringify(program).includes('"missing"');
        if (!unseenFailure && harness.invoked.every((call) => !call.failed)) {
          for (const name of compiled.mustEffects.reads) expect([...observedReads]).toContain(name);
          for (const name of compiled.mustEffects.writes) expect([...observedWrites]).toContain(name);
        }
      }),
      { numRuns: 400 },
    );
  }, PROPERTY_TIMEOUT);
});
