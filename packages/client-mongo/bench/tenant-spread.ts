/**
 * The spread of one open-loop run over its tenants and its writer processes (roadmap CLI-96). A tenant is one
 * partition key of the store. The spread shows if the writes of a run go to all keys and processes. It also shows
 * if a few keys or one process hold the run. The server does not give its ticket wait for each key. So the time of
 * a write from its plan to its reply is the measure of each key.
 */

import { median, quantile } from "@mark1russell7/rigor-statistics";

/** One write of the run: its key, its process, its time and its reply. */
export interface SpreadWrite {
  readonly key: number;
  readonly process: number;
  /** The time from the plan of the write to its reply. A write with no reply has its age at the end of the run. */
  readonly ms: number;
  readonly replied: boolean;
}

/** The spread of one run. */
export interface TenantSpread {
  /** The keys with at least one write in the plan. */
  readonly keys: number;
  /** The fewest and the most writes of one key in the plan. */
  readonly plannedPerKey: { readonly min: number; readonly max: number };
  /** The replies of one key over the keys: the 1st percentile, the median, the 99th percentile and the most. */
  readonly repliesPerKey: { readonly p01: number; readonly median: number; readonly p99: number; readonly max: number };
  /** The share of all replies that the 1 % of keys with the most replies got. With an even spread, it is approximately 0.01. */
  readonly topShare: number;
  /** The median time of the writes of one key, over the keys: the median, the 99th percentile and the most. */
  readonly keyMedianMs: { readonly median: number; readonly p99: number; readonly max: number };
  /** The replies of each writer process. */
  readonly processReplies: readonly number[];
}

const round = (value: number): number => Number(value.toFixed(3));

/** This function gives the spread of the writes of one run over their keys and processes. */
export function spreadOf(writes: readonly SpreadWrite[], processes: number): TenantSpread {
  const byKey = new Map<number, { planned: number; replies: number; ms: number[] }>();
  const processReplies = Array.from({ length: processes }, () => 0);
  for (const write of writes) {
    const own = byKey.get(write.key) ?? { planned: 0, replies: 0, ms: [] };
    own.planned++;
    own.ms.push(write.ms);
    if (write.replied) {
      own.replies++;
      processReplies[write.process] = (processReplies[write.process] ?? 0) + 1;
    }
    byKey.set(write.key, own);
  }
  const keys = [...byKey.values()];
  if (keys.length === 0) {
    return { keys: 0, plannedPerKey: { min: 0, max: 0 }, repliesPerKey: { p01: 0, median: 0, p99: 0, max: 0 }, topShare: 0, keyMedianMs: { median: 0, p99: 0, max: 0 }, processReplies };
  }
  const planned = keys.map((key) => key.planned);
  const replies = keys.map((key) => key.replies);
  const medians = keys.map((key) => median(key.ms));
  const total = replies.reduce((sum, value) => sum + value, 0);
  const top = [...replies].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(keys.length / 100)));
  return {
    keys: keys.length,
    plannedPerKey: { min: Math.min(...planned), max: Math.max(...planned) },
    repliesPerKey: {
      p01: quantile(replies, 0.01, "nearest-rank"),
      median: median(replies),
      p99: quantile(replies, 0.99, "nearest-rank"),
      max: Math.max(...replies),
    },
    topShare: total === 0 ? 0 : round(top.reduce((sum, value) => sum + value, 0) / total),
    keyMedianMs: { median: round(median(medians)), p99: round(quantile(medians, 0.99, "nearest-rank")), max: round(Math.max(...medians)) },
    processReplies,
  };
}
