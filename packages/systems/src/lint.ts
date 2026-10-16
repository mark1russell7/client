/**
 * The timer law for the client (roadmap R34): the settings of an application, the values of the
 * symbols of the law, and the verdict of each rule.
 *
 * A setting that the application does not give takes the default of the core (`TIMER_DEFAULTS`
 * of `@procedures/client`). A timer that is off by default (the per-try timeout, the overall
 * timeout) has no value: a rule that reads it gives the verdict "depends".
 */

import { TIMER_DEFAULTS, optionalMs, type Duration } from "@procedures/client";
import { evaluate, symbolsOf, verdictOf, type Binding, type Evaluated, type Rule, type Verdict } from "@mark1russell7/service";
import { CLIENT_RULES } from "./rules.js";

/** The timer settings of an application. Each field is optional: the default of the core applies. */
export interface TimerSettings {
  /** The time of one try (`resilience({ perAttempt })`). */
  readonly perAttempt?: Duration | undefined;
  /** The time of a call with its retries (`resilience({ overall })`). */
  readonly overall?: Duration | undefined;
  readonly retry?: {
    readonly maxRetries?: number | undefined;
    readonly retryDelay?: Duration | undefined;
    readonly backoffMultiplier?: number | undefined;
    readonly maxDelay?: Duration | undefined;
  } | undefined;
  readonly circuitBreaker?: { readonly resetTimeout?: Duration | undefined } | undefined;
  readonly webSocketClient?: {
    readonly requestTimeout?: Duration | undefined;
    readonly heartbeatInterval?: Duration | undefined;
    readonly heartbeatTimeout?: Duration | undefined;
    readonly heartbeatMisses?: number | undefined;
  } | undefined;
  readonly webSocketServer?: {
    readonly heartbeatInterval?: Duration | undefined;
    readonly heartbeatMisses?: number | undefined;
    readonly reverseRequestTimeout?: Duration | undefined;
  } | undefined;
  /** The time to live of the results of keyed writes on the server. */
  readonly idempotencyTtl?: Duration | undefined;
}

/** The verdict of one rule. */
export interface TimerFinding {
  readonly rule: string;
  readonly verdict: Verdict;
  readonly statement: string;
  readonly window?: string | undefined;
  readonly evaluated: readonly Evaluated[];
  /** The symbols without a value. A "depends" verdict waits for them. */
  readonly unbound: readonly string[];
}

const seconds = (milliseconds: number): number => milliseconds / 1000;

/** This function gives the longest backoffs of the retry, in milliseconds, one for each retry. */
function backoffs(maxRetries: number, delayMs: number, multiplier: number, maxDelayMs: number): number[] {
  return Array.from({ length: maxRetries }, (_, attempt) => Math.min(maxDelayMs, delayMs * Math.pow(multiplier, attempt)));
}

/**
 * This function gives the values of the symbols of the law, in seconds, from the settings and
 * the defaults of the core. It also gives the derived symbols:
 *
 * - `retry_budget@client`: each try at its longest, and each backoff at its longest.
 * - `call_time@client`: the longest call. It is the overall time, or the retry budget when it is shorter.
 * - `heartbeat_detection@client` and `@server`: the time until a side finds a dead connection.
 */
export function bindingOf(settings: TimerSettings = {}): Binding {
  const defaults = TIMER_DEFAULTS;
  const retry = settings.retry ?? {};
  const maxRetries = retry.maxRetries ?? defaults.retry.maxRetries;
  const delayMs = optionalMs(retry.retryDelay, "retry.retryDelay") ?? defaults.retry.retryDelayMs;
  const multiplier = retry.backoffMultiplier ?? defaults.retry.backoffMultiplier;
  const maxDelayMs = optionalMs(retry.maxDelay, "retry.maxDelay") ?? defaults.retry.maxDelayMs;
  const client = settings.webSocketClient ?? {};
  const server = settings.webSocketServer ?? {};
  const requestMs = optionalMs(client.requestTimeout, "webSocketClient.requestTimeout") ?? defaults.webSocketClient.requestTimeoutMs;
  const perAttemptMs = optionalMs(settings.perAttempt, "perAttempt");
  const overallMs = optionalMs(settings.overall, "overall");

  // A try ends at the per-try timeout, or at the request time of the transport
  const tryMs = perAttemptMs === undefined ? requestMs : Math.min(perAttemptMs, requestMs);
  const waits = backoffs(maxRetries, delayMs, multiplier, maxDelayMs);
  const budgetMs = (maxRetries + 1) * tryMs + waits.reduce((sum, wait) => sum + wait, 0);
  const callMs = overallMs === undefined ? budgetMs : Math.min(overallMs, budgetMs);
  const clientDetectionMs =
    (optionalMs(client.heartbeatInterval, "webSocketClient.heartbeatInterval") ?? defaults.webSocketClient.heartbeatIntervalMs) *
      (client.heartbeatMisses ?? defaults.webSocketClient.heartbeatMisses) +
    (optionalMs(client.heartbeatTimeout, "webSocketClient.heartbeatTimeout") ?? defaults.webSocketClient.heartbeatTimeoutMs);
  const serverDetectionMs =
    (optionalMs(server.heartbeatInterval, "webSocketServer.heartbeatInterval") ?? defaults.webSocketServer.heartbeatIntervalMs) *
    (server.heartbeatMisses ?? defaults.webSocketServer.heartbeatMisses);

  const bind: Record<string, number | "inf"> = {
    "transport_request_timeout@client": seconds(requestMs),
    "retry_budget@client": seconds(budgetMs),
    "call_time@client": seconds(callMs),
    "max_backoff@client": waits.length === 0 ? 0 : seconds(Math.max(...waits)),
    "breaker_reset@client": seconds(optionalMs(settings.circuitBreaker?.resetTimeout, "circuitBreaker.resetTimeout") ?? defaults.circuitBreaker.resetTimeoutMs),
    "heartbeat_detection@client": seconds(clientDetectionMs),
    "heartbeat_detection@server": seconds(serverDetectionMs),
    "reverse_request_timeout@server": seconds(
      optionalMs(server.reverseRequestTimeout, "webSocketServer.reverseRequestTimeout") ?? defaults.webSocketServer.reverseRequestTimeoutMs,
    ),
    "idempotency_ttl@server": seconds(optionalMs(settings.idempotencyTtl, "idempotencyTtl") ?? defaults.idempotency.ttlMs),
  };
  // A timer that is off has no value: its rules give "depends"
  if (perAttemptMs !== undefined) bind["try_timeout@client"] = seconds(perAttemptMs);
  if (overallMs !== undefined) bind["overall_timeout@client"] = seconds(overallMs);
  // A retry without a limit of its backoff: the law reads Infinity as "inf"
  for (const [key, value] of Object.entries(bind)) if (value === Number.POSITIVE_INFINITY) bind[key] = "inf";
  return bind;
}

/** This function gives the verdict of each rule for the settings of an application. */
export function lintTimers(settings: TimerSettings = {}, rules: readonly Rule[] = CLIENT_RULES): TimerFinding[] {
  const bind = bindingOf(settings);
  return rules.map((rule) => {
    const evaluated = evaluate(rule, bind);
    return {
      rule: rule.id,
      verdict: verdictOf(rule, bind, evaluated),
      statement: rule.rule,
      ...(rule.window !== undefined ? { window: rule.window } : {}),
      evaluated,
      unbound: symbolsOf(rule).filter((symbol) => bind[symbol] === undefined),
    };
  });
}
