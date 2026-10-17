/**
 * The stop of one call (`CallScope`), on fake timers. Each cause of a stop runs in each run of
 * the tests. Before, only the end-to-end tests reached the timer of the deadline. There the
 * deadline interceptor of the invocation fires at the same time, and either timer can win. So
 * the function coverage of the package changed from one CI run to the next (tracker O33).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallScope } from "./scope.js";

const PATH = ["http", "request"];

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("CallScope", () => {
  it("stops at timeoutMs with TIMEOUT", () => {
    const scope = new CallScope(PATH, {}, { timeoutMs: 100 });
    vi.advanceTimersByTime(99);
    expect(scope.reason).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(scope.reason).toBe("timeout");
    expect(scope.signal.aborted).toBe(true);
    expect(scope.error()).toMatchObject({ code: "TIMEOUT", message: expect.stringContaining("timeoutMs") });
  });

  it("stops at the deadline of the capability when it comes first", () => {
    const scope = new CallScope(PATH, { capability: { deadline: Date.now() + 50 } }, { timeoutMs: 1_000 });
    vi.advanceTimersByTime(50);
    expect(scope.reason).toBe("deadline");
    expect(scope.error()).toMatchObject({ code: "TIMEOUT", message: expect.stringContaining("deadline") });
  });

  it("stops after idleTimeoutMs without data, and touch() starts the idle time again", () => {
    const scope = new CallScope(PATH, {}, { idleTimeoutMs: 100 });
    vi.advanceTimersByTime(80);
    scope.touch();
    vi.advanceTimersByTime(80);
    expect(scope.reason).toBeUndefined();
    vi.advanceTimersByTime(20);
    expect(scope.reason).toBe("idle");
    expect(scope.error()).toMatchObject({ code: "TIMEOUT", message: expect.stringContaining("idleTimeoutMs") });
  });

  it("holds the idle time at pause() until the next touch()", () => {
    const scope = new CallScope(PATH, {}, { idleTimeoutMs: 100 });
    scope.pause();
    vi.advanceTimersByTime(1_000);
    expect(scope.reason).toBeUndefined();
    scope.touch();
    vi.advanceTimersByTime(100);
    expect(scope.reason).toBe("idle");
  });

  it("stops with ABORTED at an abort of the parent signal, also one before the start", () => {
    const parent = new AbortController();
    const scope = new CallScope(PATH, { signal: parent.signal }, { timeoutMs: 1_000 });
    parent.abort();
    expect(scope.reason).toBe("aborted");
    expect(scope.error()).toMatchObject({ code: "ABORTED" });

    const early = new CallScope(PATH, { signal: parent.signal });
    expect(early.reason).toBe("aborted");
  });

  it("keeps the first cause, and dispose() removes the timers and the listener", () => {
    const parent = new AbortController();
    const scope = new CallScope(PATH, { signal: parent.signal, capability: { deadline: Date.now() + 10 } }, { timeoutMs: 10, idleTimeoutMs: 10 });
    vi.advanceTimersByTime(10);
    const first = scope.reason;
    parent.abort();
    expect(scope.reason).toBe(first);

    const quiet = new CallScope(PATH, { signal: new AbortController().signal }, { timeoutMs: 10, idleTimeoutMs: 10 });
    quiet.dispose();
    vi.advanceTimersByTime(1_000);
    expect(quiet.reason).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives the failure itself before a stop, and the error of the stop after it", () => {
    const scope = new CallScope(PATH, {}, { timeoutMs: 10 });
    const failure = new Error("socket hang up");
    expect(scope.translate(failure)).toBe(failure);
    vi.advanceTimersByTime(10);
    expect(scope.translate(failure)).toMatchObject({ code: "TIMEOUT" });
  });
});
