/**
 * Helpers for the contract tests: random operation sequences that run against an implementation
 * and a plain JavaScript model, with a check after each operation (ARCHITECTURE-PROPOSALS P8).
 */

import fc from "fast-check";

/** One operation of a sequence: it changes the implementation and the model in the same way. */
export interface Step<S, M> {
  readonly label: string;
  run(sut: S, model: M): void;
}

/** Small integers: many duplicates and collisions, so the edge cases come up often. */
export const smallInt: fc.Arbitrary<number> = fc.integer({ min: -20, max: 20 });

/**
 * This function runs random sequences of steps against a new implementation and a new model,
 * and calls `check` after each step. fast-check shrinks a failure to a short sequence.
 */
export function runModel<S, M>(options: {
  create: () => { sut: S; model: M };
  steps: fc.Arbitrary<Step<S, M>>;
  check: (sut: S, model: M) => void;
  maxSteps?: number;
  numRuns?: number;
}): void {
  fc.assert(
    fc.property(fc.array(options.steps, { maxLength: options.maxSteps ?? 120 }), (steps) => {
      const { sut, model } = options.create();
      options.check(sut, model);
      for (const step of steps) {
        step.run(sut, model);
        options.check(sut, model);
      }
    }),
    { numRuns: options.numRuns ?? 200 },
  );
}

/** A step with a label that shows in a failure report. */
export function step<S, M>(label: string, run: (sut: S, model: M) => void): Step<S, M> {
  return { label, run, toString: () => label } as Step<S, M>;
}
