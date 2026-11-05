/**
 * The rule of the tenant load bench. A test reaches this rule, and the report uses it.
 */

import { KEEP_UP_P99_MS, KEEP_UP_SHARE, WINDOW_MS, type TenantCount } from "./tenant-cases.js";

/** The rule in words, for the report. */
export const READING_RULE = `A provisional pass has no failure, a reply to each write, at least ${KEEP_UP_SHARE} of the plan of the child and a p99 of at most ${KEEP_UP_P99_MS} ms. The rate is a first guess, and this limit is a first reading. One arrival is one write of one document, so an action of an app with more writes takes the rate of its writes.`;

/** The change of the rule, beside the figures that it reads. */
export const READING_RULE_CHANGE = "The first form of the rule compared a child with the rate of the case. A Poisson plan of 400 writes has a spread of 5 %, so that form failed children that kept up, in the control too. The rule now compares a child with its own plan.";

/** The fields of a child that the rule reads. */
export type ReadingRow = Pick<TenantCount, "driverHeld" | "failures" | "unfinished" | "unsent" | "writesPerSecond" | "planned" | "p99Ms">;

/** This function gives the reading of the children of one arm of one case. */
export function readingOf(rows: readonly ReadingRow[]): { outcome: string; reasons: string[] } {
  if (rows.some((row) => !row.driverHeld)) return { outcome: "no reading", reasons: ["a driver did not keep its schedule"] };
  const reasons: string[] = [];
  if (rows.some((row) => row.failures > 0)) reasons.push("a write failed");
  if (rows.some((row) => row.unfinished + row.unsent > 0)) reasons.push("a write had no reply in the grace");
  if (rows.some((row) => row.writesPerSecond * (WINDOW_MS / 1000) < KEEP_UP_SHARE * row.planned)) reasons.push(`a child ended under ${KEEP_UP_SHARE} of its plan in the load`);
  if (rows.some((row) => row.p99Ms > KEEP_UP_P99_MS)) reasons.push(`a child had a p99 over ${KEEP_UP_P99_MS} ms`);
  return { outcome: reasons.length === 0 ? "provisional pass" : "fail", reasons };
}
