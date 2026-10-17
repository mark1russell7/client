/**
 * The automatic retry: a new try after 529, 429, a server error and a network error, the wait of
 * `retry-after`, no new try for a 400, the limit of tries, the deadline and the abort of a wait.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_BACKOFF, MAX_RETRY_AFTER_MS, retryAfterMs } from "./retry.js";
import type { LlmCompleteOutput, LlmStructuredOutput } from "./types.js";
import { apiError, message, setup, text } from "../test/fakes.js";

describe("the automatic retry", () => {
  it("tries again after a 529 overload and gives the answer", async () => {
    const { call, sent } = setup([apiError(529, "overloaded_error"), message([text("ok")])]);
    expect(await call<LlmCompleteOutput>("llm.complete", { prompt: "x" })).toMatchObject({ text: "ok" });
    expect(sent).toHaveLength(2);
    expect(sent[1]!.body).toEqual(sent[0]!.body);
  });

  it("tries again after a network error and after a 500", async () => {
    const { call, sent } = setup([new TypeError("fetch failed"), apiError(500, "api_error"), message([text("ok")])]);
    expect(await call<LlmCompleteOutput>("llm.complete", { prompt: "x" })).toMatchObject({ text: "ok" });
    expect(sent).toHaveLength(3);
  });

  it("waits the time of retry-after before the new try", async () => {
    const { call, sent } = setup([apiError(429, "rate_limit_error", { "retry-after": "1" }), message([text("ok")])]);
    const start = Date.now();
    await call("llm.complete", { prompt: "x" });
    expect(Date.now() - start).toBeGreaterThanOrEqual(950);
    expect(sent).toHaveLength(2);
  });

  it("waits the time of retry-after-ms before the new try", async () => {
    const { call } = setup([apiError(429, "rate_limit_error", { "retry-after-ms": "150", "retry-after": "30" }), message([text("ok")])]);
    const start = Date.now();
    await call("llm.complete", { prompt: "x" });
    const waited = Date.now() - start;
    expect(waited).toBeGreaterThanOrEqual(140);
    expect(waited).toBeLessThan(5_000);
  });

  it("does not try again after a 400", async () => {
    const { call, sent } = setup([apiError(400, "invalid_request_error"), message([text("never")])]);
    await expect(call("llm.complete", { prompt: "x" })).rejects.toMatchObject({ code: "API_ERROR", status: 400, retryable: false });
    expect(sent).toHaveLength(1);
  });

  it("obeys x-should-retry of the API over the rule of the status", async () => {
    const { call, sent } = setup([apiError(400, "invalid_request_error", { "x-should-retry": "true" }), message([text("ok")]), apiError(500, "api_error", { "x-should-retry": "false" })]);
    expect(await call<LlmCompleteOutput>("llm.complete", { prompt: "x" })).toMatchObject({ text: "ok" });
    await expect(call("llm.complete", { prompt: "x" })).rejects.toMatchObject({ status: 500, retryable: false });
    expect(sent).toHaveLength(3);
  });

  it("gives the last error after the retries, and makes one request with retries: 0", async () => {
    const overloaded = () => apiError(529, "overloaded_error");
    const { call, sent } = setup([overloaded(), overloaded(), overloaded(), overloaded(), overloaded()]);
    await expect(call("llm.complete", { prompt: "x" })).rejects.toMatchObject({ code: "API_ERROR", status: 529 });
    expect(sent).toHaveLength(3);
    await expect(call("llm.complete", { prompt: "x", retries: 0 })).rejects.toMatchObject({ status: 529 });
    expect(sent).toHaveLength(4);
    await expect(call("llm.complete", { prompt: "x", retries: 11 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("uses the retries of the module", async () => {
    const { call, sent } = setup([apiError(529, "overloaded_error"), message([text("never")])], { retries: 0 });
    await expect(call("llm.complete", { prompt: "x" })).rejects.toMatchObject({ status: 529 });
    expect(sent).toHaveLength(1);
  });

  it("gives the error at once when the wait ends after the deadline, or when retry-after asks for more than a minute", async () => {
    const { call, sent } = setup([apiError(429, "rate_limit_error", { "retry-after": "5" }), apiError(429, "rate_limit_error", { "retry-after": "120" }), message([text("never")])]);
    const start = Date.now();
    await expect(call("llm.complete", { prompt: "x" }, { capability: { deadline: Date.now() + 1_000 } })).rejects.toMatchObject({ status: 429 });
    await expect(call("llm.complete", { prompt: "x" })).rejects.toMatchObject({ status: 429, retryAfterMs: 120_000 });
    expect(Date.now() - start).toBeLessThan(1_000);
    expect(sent).toHaveLength(2);
  });

  it("stops a wait at the abort of the caller with ABORTED", async () => {
    const { call, sent } = setup([apiError(429, "rate_limit_error", { "retry-after": "5" }), message([text("never")])]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const start = Date.now();
    await expect(call("llm.complete", { prompt: "x" }, { signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
    expect(Date.now() - start).toBeLessThan(2_000);
    expect(sent).toHaveLength(1);
  });

  it("gives llm.structured new tries of a request that do not count as attempts, and requestRetries: 0 turns them off", async () => {
    const schema = { type: "object", properties: { n: { type: "integer" } }, required: ["n"] };
    const { call, sent } = setup([apiError(529, "overloaded_error"), message([text('{"n":1}')]), apiError(529, "overloaded_error")]);
    expect(await call<LlmStructuredOutput>("llm.structured", { prompt: "x", schema })).toMatchObject({ value: { n: 1 }, attempts: 1 });
    expect(sent).toHaveLength(2);
    await expect(call("llm.structured", { prompt: "x", schema, requestRetries: 0 })).rejects.toMatchObject({ status: 529 });
    expect(sent).toHaveLength(3);
  });
});

describe("retryAfterMs", () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it("reads retry-after-ms, then retry-after as seconds or as an HTTP date", () => {
    const now = Date.parse("2026-10-16T12:00:00Z");
    expect(retryAfterMs(headers({ "retry-after-ms": "250" }))).toBe(250);
    expect(retryAfterMs(headers({ "retry-after": "2" }))).toBe(2_000);
    expect(retryAfterMs(headers({ "retry-after": "0.5" }))).toBe(500);
    expect(retryAfterMs(headers({ "retry-after": "Fri, 16 Oct 2026 12:00:03 GMT" }), now)).toBe(3_000);
    expect(retryAfterMs(headers({ "retry-after": "Fri, 16 Oct 2026 11:59:00 GMT" }), now)).toBe(0);
  });

  it("gives undefined for a header that is missing, empty, negative or not a time", () => {
    expect(retryAfterMs(headers({}))).toBeUndefined();
    expect(retryAfterMs(headers({ "retry-after": " " }))).toBeUndefined();
    expect(retryAfterMs(headers({ "retry-after": "-1" }))).toBeUndefined();
    expect(retryAfterMs(headers({ "retry-after": "soon" }))).toBeUndefined();
    expect(retryAfterMs(headers({ "retry-after-ms": "x", "retry-after": "1" }))).toBe(1_000);
  });

  it("has the backoff of the Anthropic SDKs and a limit of one minute", () => {
    expect(DEFAULT_BACKOFF).toEqual({ base: 500, factor: 2, cap: 8_000, jitter: { kind: "subtract", fraction: 0.25 } });
    expect(MAX_RETRY_AFTER_MS).toBe(60_000);
  });
});
