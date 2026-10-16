/**
 * Type definitions of the procedures of this package
 *
 * mark procedure new adds the types of each new procedure here. The zod schemas are in
 * `module.ts`: an exported schema needs a written type (isolatedDeclarations).
 */

import type { Verdict } from "@mark1russell7/service";

// =============================================================================
// systems.timers Types - The verdicts of the timer law for the timer settings of an application
// =============================================================================

/** The timer settings of an application, in milliseconds, as the wire carries times (roadmap R11). */
export interface SystemsTimersInput {
  perAttemptMs?: number | undefined;
  overallMs?: number | undefined;
  retry?: {
    maxRetries?: number | undefined;
    retryDelayMs?: number | undefined;
    backoffMultiplier?: number | undefined;
    maxDelayMs?: number | undefined;
  } | undefined;
  circuitBreaker?: { resetTimeoutMs?: number | undefined } | undefined;
  webSocketClient?: {
    requestTimeoutMs?: number | undefined;
    heartbeatIntervalMs?: number | undefined;
    heartbeatTimeoutMs?: number | undefined;
    heartbeatMisses?: number | undefined;
  } | undefined;
  webSocketServer?: {
    heartbeatIntervalMs?: number | undefined;
    heartbeatMisses?: number | undefined;
    reverseRequestTimeoutMs?: number | undefined;
  } | undefined;
  idempotencyTtlMs?: number | undefined;
}

/** The verdict of each rule. */
export interface SystemsTimersOutput {
  /** True when no rule is violated. */
  ok: boolean;
  findings: Array<{
    rule: string;
    verdict: Verdict;
    statement: string;
    window?: string | undefined;
    evaluated: Array<{ lhs: number | null; rhs: number | null; margin: number; holds: boolean | null }>;
    unbound: string[];
  }>;
}
