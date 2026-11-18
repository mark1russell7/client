/**
 * The GC reads of one child of the fan-out bench (roadmap CLI-90). The probe of `freshRun` measures two halves of the
 * timed publishes: publishes 1 and 2, and publishes 4 and 5. Thus the reads cover 4 of the 5 timed publishes.
 */

import type { ChildFields } from "@mark1russell7/rigor-bench/fresh";

/** The GC reads of one child, in milliseconds. */
export interface ChildGc {
  /** The GC time of both halves. */
  readonly sumMs: number;
  /** The longest GC event of both halves. A line of an older probe has no longest event. */
  readonly maxMs?: number;
}

/** This function gives the GC reads of one child. A child with no GC time gives undefined. */
export function childGc(fields: ChildFields | undefined): ChildGc | undefined {
  const events = fields?.events;
  if (events?.gcMs === undefined) return undefined;
  const sumMs = events.gcMs[0] + events.gcMs[1];
  return events.gcMaxMs === undefined ? { sumMs } : { sumMs, maxMs: Math.max(events.gcMaxMs[0], events.gcMaxMs[1]) };
}

/**
 * This function gives the block of one child less its longest GC event, in milliseconds. A block that one GC event
 * explains gives 0 or less. A child with no longest GC event gives undefined.
 */
export function blockLessGc(blockMs: number, fields: ChildFields | undefined): number | undefined {
  const maxMs = childGc(fields)?.maxMs;
  return maxMs === undefined ? undefined : blockMs - maxMs;
}
