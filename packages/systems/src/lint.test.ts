/**
 * The timer law for the client (roadmap R34): the defaults of the core obey each rule, and each
 * rule finds the settings that break it.
 */

import { describe, expect, it } from "vitest";
import { createRegistry, Client, ms, seconds, TIMER_DEFAULTS } from "@procedures/client";
import { bindingOf, lintTimers, type TimerSettings } from "./lint.js";
import { CLIENT_RULES } from "./rules.js";
import { systemsModule } from "./module.js";

const verdicts = (settings: TimerSettings) => Object.fromEntries(lintTimers(settings).map((finding) => [finding.rule, finding.verdict]));

describe("the timer law for the client (R34)", () => {
  it("finds no violation in the defaults of the core", () => {
    const findings = lintTimers();
    expect(findings.filter((finding) => finding.verdict === "violated")).toEqual([]);
    // The per-try and the overall timeouts are off by default: their rules wait for a value
    expect(verdicts({})).toMatchObject({ "try-under-transport-timeout": "depends", "overall-covers-retries": "depends" });
  });

  it("binds the derived symbols: the retry budget and the longest call", () => {
    const bind = bindingOf({ perAttempt: seconds(2), retry: { maxRetries: 2, retryDelay: seconds(1) } });
    // 3 tries of 2 s, and the backoffs 1 s and 2 s
    expect(bind["retry_budget@client"]).toBe(9);
    expect(bind["call_time@client"]).toBe(9);
    expect(bind["max_backoff@client"]).toBe(2);
    expect(bindingOf({ overall: seconds(5), perAttempt: seconds(2), retry: { maxRetries: 2, retryDelay: seconds(1) } })["call_time@client"]).toBe(5);
  });

  it("finds a try that is longer than the request time of the transport", () => {
    expect(verdicts({ perAttempt: seconds(40) })["try-under-transport-timeout"]).toBe("violated");
    expect(verdicts({ perAttempt: seconds(10) })["try-under-transport-timeout"]).toBe("holds");
  });

  it("finds an overall time that ends the call before its last try", () => {
    const tight = { overall: seconds(5), perAttempt: seconds(3), retry: { maxRetries: 3 } };
    expect(verdicts(tight)["overall-covers-retries"]).toBe("violated");
    expect(verdicts({ ...tight, overall: seconds(30) })["overall-covers-retries"]).toBe("holds");
  });

  it("finds a time to live of keyed results that a retried write outlives", () => {
    expect(verdicts({ idempotencyTtl: seconds(60) })["keyed-result-outlives-call"]).toBe("violated");
    expect(verdicts({ idempotencyTtl: seconds(60), overall: seconds(20) })["keyed-result-outlives-call"]).toBe("holds");
  });

  it("finds a heartbeat that is slower than the request time", () => {
    expect(verdicts({ webSocketClient: { heartbeatInterval: seconds(60) } })["dead-connection-before-request-timeout"]).toBe("violated");
    expect(verdicts({ webSocketServer: { heartbeatInterval: seconds(30), heartbeatMisses: 3 } })["server-finds-dead-client"]).toBe("violated");
  });

  it("finds a breaker that closes during a backoff, and reads an unlimited backoff as no limit", () => {
    expect(verdicts({ circuitBreaker: { resetTimeout: ms(500) } })["breaker-outlasts-backoff"]).toBe("violated");
    expect(bindingOf({ retry: { maxRetries: 0 } })["max_backoff@client"]).toBe(0);
  });

  it("has a statement and a window for each rule", () => {
    for (const rule of CLIENT_RULES) {
      expect(rule.rule.length).toBeGreaterThan(10);
      expect(rule.window?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("gives the verdicts through the procedure systems.timers, with times in milliseconds", async () => {
    const stub = { name: "stub", send: async function* () {}, close: async () => {} } as unknown as ConstructorParameters<typeof Client>[0];
    const client = new Client(stub).useRegistry(createRegistry(systemsModule));
    const result = await client.exec<{ ok: boolean; findings: Array<{ rule: string; verdict: string }> }>({
      $proc: ["systems", "timers"],
      input: { perAttemptMs: 40_000, webSocketClient: { requestTimeoutMs: TIMER_DEFAULTS.webSocketClient.requestTimeoutMs } },
    });
    expect(result.ok).toBe(false);
    expect(result.findings.find((finding) => finding.rule === "try-under-transport-timeout")?.verdict).toBe("violated");
  });
});
