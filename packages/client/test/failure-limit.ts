/**
 * The limit of the failures of one soak run, from measured runs (roadmap O88). The HTTP soak test
 * (roadmap R32) uses it in place of a limit set by feel.
 *
 * The rule of the strategist:
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
