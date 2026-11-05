/**
 * The factor of the arm `flip` of the gate bench, for each case. The factor is the stated slowdown of the case in `gate-limit.json`.
 * The case `one-10` has no stated slowdown, so its flip uses the factor of the write cases.
 */

import { readFileSync } from "node:fs";

const FACTOR_OF_UNSTATED = 1.25;

const { slowdowns } = JSON.parse(readFileSync(new URL("./gate-limit.json", import.meta.url), "utf8")) as { slowdowns: Record<string, number> };

/** This function gives the factor of the arm `flip` for a case. */
export const flipFactor = (name: string): number => slowdowns[name] ?? FACTOR_OF_UNSTATED;
