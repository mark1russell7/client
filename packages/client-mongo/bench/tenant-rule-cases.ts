/**
 * The cases of the test of the rule (roadmap CLI-96). The rule: a reader that holds a version misses no write that ends after it read that version.
 * A case has two writer processes and one reader process, and each can use another copy of the store. So a case with an old copy is a rolling release.
 */

import type { FormCopy } from "./tenant-form-copies.js";

/** The time of the writes of one round. */
export const RULE_MS = 15_000;

/** The partitions of one collection. */
export const RULE_PARTITIONS = 4;

/** The writes in progress at one time in one writer process. */
export const RULE_WRITES_AT_ONE_TIME = 8;

/** The most time of a hold in a write. It is above the time of a write, so a writer and a reader pass a write in progress. */
export const RULE_HOLD_MS = 20;

/** This function gives the name of a partition. */
export function partitionName(index: number): string {
  return `p${index}`;
}

/** One case of the test: its writers, its reader, and whether a miss is the expected result. */
export interface RuleCase {
  readonly id: string;
  readonly writers: readonly [FormCopy, FormCopy];
  readonly reader: FormCopy;
  readonly miss: "none" | "some";
  /** The later full results that the case expects from the guard. A case with no value does not read them. */
  readonly laterFulls?: "none" | "some";
}

/** The cases. The case `control-outside` proves that the test finds a miss. */
export const RULE_CASES: readonly RuleCase[] = [
  { id: "today", writers: ["today", "today"], reader: "today", miss: "none" },
  { id: "control-outside", writers: ["outside", "outside"], reader: "outside", miss: "some" },
  { id: "forma", writers: ["forma", "forma"], reader: "forma", miss: "none" },
  { id: "formb", writers: ["formb", "formb"], reader: "formb", miss: "none" },
  { id: "release-forma-new-reader", writers: ["today", "forma"], reader: "forma", miss: "some" },
  { id: "release-forma-old-reader", writers: ["today", "forma"], reader: "today", miss: "some" },
  { id: "forma-guard-quiet", writers: ["forma", "forma"], reader: "formaguard", miss: "none", laterFulls: "none" },
  { id: "release-forma-guard", writers: ["today", "forma"], reader: "formaguard", miss: "none", laterFulls: "some" },
  { id: "release-formb-new-reader", writers: ["today", "formb"], reader: "formb", miss: "none" },
  { id: "release-formb-old-reader", writers: ["today", "formb"], reader: "today", miss: "none" },
];

/** The result of one round of one case. */
export interface RuleRound {
  readonly case: string;
  readonly round: number;
  readonly replied: number;
  readonly missed: number;
  /** A few ids that the reader did not see, so a report can tell the cause. */
  readonly examples: readonly string[];
  readonly deltas: number;
  readonly laterFulls: number;
  readonly errors: Readonly<Record<string, number>>;
}
