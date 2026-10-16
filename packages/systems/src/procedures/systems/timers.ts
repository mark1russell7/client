/**
 * systems.timers procedure
 *
 * The verdicts of the timer law for the timer settings of an application (roadmap R34). The
 * input gives the times in milliseconds, as the wire does. A time that the input does not give
 * takes the default of the core.
 */

import { ms, type Duration } from "@procedures/client";
import { lintTimers, type TimerSettings } from "../../lint.js";
import type { SystemsTimersInput, SystemsTimersOutput } from "../../types.js";

const duration = (milliseconds: number | undefined): Duration | undefined => (milliseconds === undefined ? undefined : ms(milliseconds));

/** This function gives the settings of `lintTimers()` from the input of the procedure. */
export function settingsOf(input: SystemsTimersInput): TimerSettings {
  return {
    perAttempt: duration(input.perAttemptMs),
    overall: duration(input.overallMs),
    retry: input.retry && {
      maxRetries: input.retry.maxRetries,
      retryDelay: duration(input.retry.retryDelayMs),
      backoffMultiplier: input.retry.backoffMultiplier,
      maxDelay: duration(input.retry.maxDelayMs),
    },
    circuitBreaker: input.circuitBreaker && { resetTimeout: duration(input.circuitBreaker.resetTimeoutMs) },
    webSocketClient: input.webSocketClient && {
      requestTimeout: duration(input.webSocketClient.requestTimeoutMs),
      heartbeatInterval: duration(input.webSocketClient.heartbeatIntervalMs),
      heartbeatTimeout: duration(input.webSocketClient.heartbeatTimeoutMs),
      heartbeatMisses: input.webSocketClient.heartbeatMisses,
    },
    webSocketServer: input.webSocketServer && {
      heartbeatInterval: duration(input.webSocketServer.heartbeatIntervalMs),
      heartbeatMisses: input.webSocketServer.heartbeatMisses,
      reverseRequestTimeout: duration(input.webSocketServer.reverseRequestTimeoutMs),
    },
    idempotencyTtl: duration(input.idempotencyTtlMs),
  };
}

/**
 * The verdicts of the timer law for the timer settings of an application
 */
export async function systemsTimers(input: SystemsTimersInput): Promise<SystemsTimersOutput> {
  const findings = lintTimers(settingsOf(input));
  return {
    ok: findings.every((finding) => finding.verdict !== "violated"),
    findings: findings.map((finding) => ({ ...finding, evaluated: [...finding.evaluated], unbound: [...finding.unbound] })),
  };
}
