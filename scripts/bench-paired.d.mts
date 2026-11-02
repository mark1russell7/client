/** The types of the part of `bench-paired.mjs` that the TypeScript scripts import. The JSDoc typedefs of the module are the source. */

import type { PairedInput } from "./lib/paired-time.mjs";

/** A band of ratios: p10, the median and p90. */
export interface Band {
  readonly p10: number;
  readonly median: number;
  readonly p90: number;
}

/** The ratio of each round: the time of the arm over the time of the base in the same round. A base of 0 gives no ratio. */
export function roundRatios(arm: readonly number[], base: readonly number[]): number[];

/** The band of a list of values: p10, the median and p90. */
export function bandOf(values: readonly number[]): Band;

/** The analysis of one benchmark in one run. */
export interface Analysis {
  readonly id: string;
  /** The median time of the base, in milliseconds */
  readonly baseMs: number;
  /** The median time of the head, in milliseconds */
  readonly headMs: number;
  /** The median of the head over the median of the base */
  readonly ratio: number;
  /** The band of the round ratios of the head */
  readonly band: Band;
  readonly aa: { readonly ratio: number; readonly band: Band; readonly containsOne: boolean; readonly spread: number };
  /** The run counts only when the A/A band contains 1.0 */
  readonly counts: boolean;
  /** The ratio widened by the A/A half-spread of this run */
  readonly effect: { readonly lo: number; readonly hi: number };
  readonly verdict: "faster" | "slower" | "no change" | "cannot decide";
  readonly reason: string;
}

/** The analysis of one input of a paired-time/1 report, with the interval rule of the strategist. */
export function analyzeInput(input: PairedInput, budget: number, ids?: { base?: string; head?: string }): Analysis;

/** The Markdown summary of one run: the record needs `run.label`, `refs`, `context`, `report`, `repeats`, `warmup`, `budget`, `skipped` and `analysis`. */
export function runMarkdown(record: Record<string, unknown>): string;
