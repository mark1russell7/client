/**
 * One deadline for a call (roadmap R10).
 *
 * A call has one absolute deadline in its metadata (`__deadline`, a time of `Date.now()`). The
 * key starts with `__`, so it stays in this process. Each part of the client can only make it
 * earlier: the remaining time that the caller sends, the overall timeout and the timeout of each
 * try. Just before the transport sends a try, the client writes the remaining time into
 * `procedure-timeout`. The server uses it to make its own deadline earlier, so a handler stops
 * when its caller stops waiting.
 *
 * Before, the overall timeout and the timeout of each try did not reach the server, and a
 * client could also send `X-Timeout`, which the server ignored.
 */

import type { Metadata } from "./types.js";

/**
 * The metadata key of the remaining time of a remote call, in milliseconds. A server uses it
 * only to make its deadline earlier.
 */
export const TIMEOUT_METADATA_KEY = "procedure-timeout";

/** The metadata key of the absolute deadline of a call. It stays in this process. */
export const DEADLINE_METADATA_KEY = "__deadline";

/** The deadline of a call, or undefined. */
export function deadlineOf(metadata: Metadata): number | undefined {
  const deadline = metadata[DEADLINE_METADATA_KEY];
  return typeof deadline === "number" && Number.isFinite(deadline) ? deadline : undefined;
}

/**
 * This function makes the deadline of a call earlier: the earlier of its deadline and `at`. It
 * gives the deadline from before, to put back with `restoreDeadline`.
 */
export function narrowDeadline(metadata: Metadata, at: number): number | undefined {
  const before = deadlineOf(metadata);
  metadata[DEADLINE_METADATA_KEY] = before === undefined ? at : Math.min(before, at);
  return before;
}

/** This function puts back the deadline from before a `narrowDeadline`. */
export function restoreDeadline(metadata: Metadata, before: number | undefined): void {
  if (before === undefined) delete metadata[DEADLINE_METADATA_KEY];
  else metadata[DEADLINE_METADATA_KEY] = before;
}

/**
 * The remaining time that the caller gives in `procedure-timeout` becomes the deadline of the
 * call, when the call starts. The client then writes the remaining time again for each try.
 */
export function absorbTimeout(metadata: Metadata, now: number = Date.now()): void {
  const timeoutMs = metadata[TIMEOUT_METADATA_KEY];
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs < 0) return;
  delete metadata[TIMEOUT_METADATA_KEY];
  narrowDeadline(metadata, now + timeoutMs);
}

/** This function writes the remaining time of the deadline into `procedure-timeout`, for one try. */
export function writeRemainingTime(metadata: Metadata, now: number = Date.now()): void {
  const deadline = deadlineOf(metadata);
  if (deadline === undefined) return;
  metadata[TIMEOUT_METADATA_KEY] = Math.max(0, Math.floor(deadline - now));
}
