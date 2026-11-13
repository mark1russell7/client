/**
 * The limits of the soak, from measured runs (roadmap O88). The soak test (roadmap R32) uses them
 * in place of limits set by feel. `gateLimit` gives a limit from the values of 5 runs.
 * `failureLimit` gives the limit of the failures of one run, from a count of 0 or more.
 *
 * The rule of the maintainer for `failureLimit`:
 * - The measured runs give an upper failure rate `p` with 95 % confidence. With 0 failures, the
 *   rule of three gives `p = 3 / C`, where `C` is the sum of the calls of the measured runs.
 * - With `k > 0` failures, `p` is the exact upper bound of a Poisson count: `P(Poisson(p * C) <= k) = 5 %`.
 * - The limit of one run is the smallest count `L` with `P(Poisson(p * N) > L) < 1 %`.
 * - `N` is the number of calls of the current run: its successes and its failures.
 */

/** The calls and the failures of the measured runs, as sums. */
export interface MeasuredRuns {
  /** The sum of the calls of the measured runs. */
  readonly calls: number;
  /** The sum of the failures of the measured runs. */
  readonly failures: number;
}

/** This function gives `P(X <= count)` for a Poisson count `X` with the mean `mean`. */
export function poissonAtMost(count: number, mean: number): number {
  let term = Math.exp(-mean);
  let sum = term;
  for (let index = 1; index <= count; index++) {
    term *= mean / index;
    sum += term;
  }
  return Math.min(1, sum);
}

/** This function gives the upper failure rate of the measured runs, with 95 % confidence. */
export function upperFailureRate(runs: MeasuredRuns): number {
  if (!(runs.calls > 0)) throw new Error(`The measured runs need calls, not ${runs.calls}`);
  // The rule of three: 0 failures in C calls give a rate below 3 / C
  if (runs.failures === 0) return 3 / runs.calls;
  // The mean m with P(Poisson(m) <= k) = 5 %, by bisection
  let low = runs.failures;
  let high = runs.failures * 2 + 10;
  while (poissonAtMost(runs.failures, high) > 0.05) high *= 2;
  for (let step = 0; step < 100; step++) {
    const middle = (low + high) / 2;
    if (poissonAtMost(runs.failures, middle) > 0.05) low = middle;
    else high = middle;
  }
  return high / runs.calls;
}

/**
 * This function gives the most failures that one run of `calls` calls can have. Above this count,
 * the rate of the run is not the rate of the measured runs, with 99 % confidence.
 */
export function failureLimit(runs: MeasuredRuns, calls: number): number {
  const mean = upperFailureRate(runs) * calls;
  let limit = 0;
  while (1 - poissonAtMost(limit, mean) >= 0.01) limit++;
  return limit;
}

/**
 * This function gives the limit of a gate from the values of at least 5 measured runs (the rule of
 * the maintainer, 2026-11-02). The spread is the highest value minus the lowest value.
 * - A ceiling (a growth, a rate) is the highest value plus the spread, rounded up to `step`.
 * - A floor (a count) is the lowest value minus the spread, rounded down to `step`.
 * The rule has no factor and no fixed margin.
 */
export function gateLimit(values: readonly number[], kind: "ceiling" | "floor", step: number): number {
  if (values.length < 5) throw new Error(`A gate limit needs at least 5 runs, not ${values.length}`);
  if (!(step > 0)) throw new Error(`The step must be above 0, not ${step}`);
  const high = Math.max(...values);
  const low = Math.min(...values);
  const spread = high - low;
  // toFixed removes the error of the binary fractions: 3.38 / 0.1 is 33.800000000000004
  const units = Number(((kind === "ceiling" ? high + spread : low - spread) / step).toFixed(6));
  const rounded = kind === "ceiling" ? Math.ceil(units) : Math.floor(units);
  return Number((rounded * step).toPrecision(12));
}
