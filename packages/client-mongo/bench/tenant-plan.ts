/**
 * The open-loop plan of a case of the tenant load bench. The writer and the arm use this file, and the report does not.
 */

import { constant, schedule, spike, type Schedule } from "@mark1russell7/rigor-chaos";
import { BURST_AT_MS, BURST_MS, BURST_WRITES, WINDOW_MS, parseTenantCase } from "./tenant-cases.js";

/** This function gives the plan of a case. Each process of the case computes the same plan from the same seed. */
export function planOf(id: string, seed: string): Schedule {
  const { rate, burst } = parseTenantCase(id);
  const profile = burst
    ? spike(rate, rate + BURST_WRITES, { before: BURST_AT_MS, width: BURST_MS, after: WINDOW_MS - BURST_AT_MS - BURST_MS })
    : constant(rate, WINDOW_MS);
  return schedule(profile, { arrivals: "poisson", seed: `${id}/${seed}` });
}
