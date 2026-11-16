/**
 * These tests examine the REST client of GitHub with a fake transport and a fake clock. They cover the
 * headers, the conditional requests and the window of points. They also cover the waits and the checks.
 */

import { describe, expect, it, vi } from "vitest";
import { fakeClock } from "@mark1russell7/service/testing";
import {
  createRestClient,
  GITHUB_API_VERSION,
  isRateRefusal,
  LONGEST_RATE_WAIT_MS,
  rateWaitMs,
  RestRateError,
  type RestClientOptions,
  type RestExchange,
  type RestReply,
  type RestTransport,
} from "./rest.js";

vi.mock("@procedures/http", () => ({
  httpRequest: vi.fn(async () => ({ status: 201, statusText: "", ok: true, url: "", redirected: false, headers: { etag: '"e"' }, body: '{"id":1}', bytes: 8 })),
}));

const TOKEN = "SECRET-TOKEN-1";
const DATE = "Thu, 12 Nov 2026 23:00:00 GMT";
const SECONDS = Date.parse(DATE) / 1000;

type Script = RestReply | ((exchange: RestExchange) => RestReply);
const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}): RestReply => ({ status, body, headers });

function fake(script: Script[] = [], options: Partial<RestClientOptions> = {}) {
  const exchanges: RestExchange[] = [];
  const transport: RestTransport = async (exchange) => {
    exchanges.push(exchange);
    const next = script.shift() ?? reply(200);
    return typeof next === "function" ? next(exchange) : next;
  };
  const clock = fakeClock(1000);
  const client = createRestClient({ token: TOKEN, transport, clock, ...options });
  return { client, clock, exchanges };
}

const signal = new AbortController().signal;
const get = (path: string, query?: Record<string, string>) => ({ method: "GET" as const, path, query });

describe("the requests", () => {
  it("sends the headers of GitHub and a URL with a sorted query", async () => {
    const at = fake();
    await at.client.request(get("/repos/octo/app/actions/runs", { status: "queued", page: "2", per_page: "100" }), signal);
    expect(at.exchanges).toEqual([
      {
        method: "GET",
        url: "https://api.github.com/repos/octo/app/actions/runs?page=2&per_page=100&status=queued",
        headers: { accept: "application/vnd.github+json", authorization: `Bearer ${TOKEN}`, "user-agent": "procedures-gh", "x-github-api-version": GITHUB_API_VERSION },
        body: undefined,
      },
    ]);
  });

  it("keeps the path of a base URL, and sends the body of a request that changes data", async () => {
    const at = fake([reply(201, { id: 7 })], { baseUrl: "https://ghe.example/api/v3/", userAgent: "rd", apiVersion: "2026-03-10" });
    const answer = await at.client.request({ method: "POST", path: "/repos/o/r/actions/runners/generate-jitconfig", body: { name: "n", labels: ["a"] } }, signal);
    expect(answer).toEqual({ status: 201, body: { id: 7 }, cached: false });
    expect(at.exchanges[0]?.url).toBe("https://ghe.example/api/v3/repos/o/r/actions/runners/generate-jitconfig");
    expect(at.exchanges[0]?.body).toEqual({ name: "n", labels: ["a"] });
    expect(at.exchanges[0]?.headers["user-agent"]).toBe("rd");
    expect(at.exchanges[0]?.headers["x-github-api-version"]).toBe("2026-03-10");
  });

  it("gets the token from its function before each request", async () => {
    let count = 0;
    const at = fake([], { token: async () => `t${++count}` });
    await at.client.request(get("/a"), signal);
    await at.client.request(get("/b"), signal);
    expect(at.exchanges.map((exchange) => exchange.headers["authorization"])).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("gives an empty body as null, sends no body for null, and gives each status as an answer", async () => {
    const at = fake([{ status: 204, body: undefined, headers: {} }, reply(404, { message: "Not Found" }), reply(500, null)]);
    expect(await at.client.request({ method: "DELETE", path: "/x", body: null }, signal)).toEqual({ status: 204, body: null, cached: false });
    expect((await at.client.request({ method: "GET", path: "/y", query: {}, body: null }, signal)).status).toBe(404);
    expect(at.exchanges.map((exchange) => exchange.body)).toEqual([undefined, undefined]);
    expect((await at.client.request(get("/z"), signal)).status).toBe(500);
  });

  it("sends the request with httpRequest of @procedures/http by default", async () => {
    const { httpRequest } = await import("@procedures/http");
    const client = createRestClient({ token: TOKEN, clock: fakeClock(0) });
    const answer = await client.request({ method: "POST", path: "/p", body: { a: 1 } }, signal);
    expect(answer).toEqual({ status: 201, body: { id: 1 }, cached: false });
    expect(vi.mocked(httpRequest).mock.calls[0]?.[0]).toMatchObject({ method: "POST", url: "https://api.github.com/p", json: { a: 1 }, responseType: "text" });
    expect(vi.mocked(httpRequest).mock.calls[0]?.[1]).toEqual({ signal });
  });

  it("gives an empty text as null, and refuses a body that is not JSON with no part of the body in the error", async () => {
    const { httpRequest } = await import("@procedures/http");
    const answer = (body: string) => ({ status: 200, statusText: "", ok: true, url: "", redirected: false, headers: {}, body, bytes: body.length });
    const client = createRestClient({ token: TOKEN, clock: fakeClock(0) });
    vi.mocked(httpRequest).mockResolvedValueOnce(answer(" \n"));
    expect(await client.request(get("/empty"), signal)).toEqual({ status: 200, body: null, cached: false });
    vi.mocked(httpRequest).mockResolvedValueOnce(answer('{"runner":{"id":1},"encoded_jit_config":"JIT-SECRET'));
    const error = await client.request(get("/cut"), signal).catch((caught: unknown) => caught);
    expect((error as Error).message).toBe("The answer 200 to GET /cut is not JSON.");
  });
});

describe("the conditional requests", () => {
  it("stores an answer with an ETag and gives it again for an answer 304", async () => {
    const at = fake([reply(200, { total_count: 1 }, { ETag: 'W/"abc"' }), reply(304, null)]);
    const first = await at.client.request(get("/runs", { status: "queued" }), signal);
    const second = await at.client.request(get("/runs", { status: "queued" }), signal);
    expect(first).toEqual({ status: 200, body: { total_count: 1 }, cached: false });
    expect(second).toEqual({ status: 200, body: { total_count: 1 }, cached: true });
    expect(at.exchanges.map((exchange) => exchange.headers["if-none-match"])).toEqual([undefined, 'W/"abc"']);
    expect(at.client.state()).toMatchObject({ sent: 2, notModified: 1, cacheEntries: 1 });
  });

  it("gives a copy of a stored answer, so a change by the caller does not change the store", async () => {
    const at = fake([reply(200, { list: [1] }, { etag: '"e"' }), reply(304, null), reply(304, null)]);
    const first = (await at.client.request(get("/l"), signal)).body as { list: number[] };
    first.list.push(2);
    const second = (await at.client.request(get("/l"), signal)).body as { list: number[] };
    second.list.push(3);
    expect((await at.client.request(get("/l"), signal)).body).toEqual({ list: [1] });
  });

  it("stores no answer without an ETag, removes it after another status, and sends no condition for a write", async () => {
    const at = fake([reply(200, {}), reply(200, {}, { etag: "" }), reply(200, {}, { etag: '"1"' }), reply(404, {}, { etag: '"x"' }), reply(200, {}, { etag: '"2"' }), reply(204)]);
    for (let index = 0; index < 5; index += 1) await at.client.request(get("/a"), signal);
    await at.client.request({ method: "DELETE", path: "/a" }, signal);
    expect(at.exchanges.map((exchange) => exchange.headers["if-none-match"] ?? null)).toEqual([null, null, null, '"1"', null, null]);
  });

  it("keeps an answer that an answer 304 gave as the most recent", async () => {
    const tag = (exchange: RestExchange) => reply(200, {}, { etag: `"${exchange.url}"` });
    const at = fake([tag, tag, reply(304, null), tag, tag], { cacheEntries: 2 });
    for (const path of ["/a", "/b", "/a", "/c", "/a"]) await at.client.request(get(path), signal);
    expect(at.exchanges.map((exchange) => exchange.headers["if-none-match"] !== undefined)).toEqual([false, false, true, false, true]);
  });

  it("gives an answer 304 with no stored answer as it is", async () => {
    const at = fake([reply(304, null)]);
    expect(await at.client.request(get("/a"), signal)).toEqual({ status: 304, body: null, cached: false });
  });

  it("keeps the most recent answers to its limit, and stores none with the limit 0", async () => {
    const tag = (exchange: RestExchange) => reply(200, {}, { etag: `"${exchange.url}"` });
    const at = fake([tag, tag, tag, tag, tag, tag], { cacheEntries: 2 });
    for (const path of ["/a", "/b", "/a", "/c", "/a", "/b"]) await at.client.request(get(path), signal);
    expect(at.exchanges.map((exchange) => exchange.headers["if-none-match"] !== undefined)).toEqual([false, false, true, false, true, false]);
    expect(at.client.state().cacheEntries).toBe(2);

    const none = fake([reply(200, {}, { etag: '"1"' })], { cacheEntries: 0 });
    await none.client.request(get("/a"), signal);
    await none.client.request(get("/a"), signal);
    expect(none.exchanges.map((exchange) => exchange.headers["if-none-match"])).toEqual([undefined, undefined]);
  });
});

describe("the limits of the rate", () => {
  it("sends the points of one minute at once, and the next request after the minute", async () => {
    const at = fake([], { pointsPerMinute: 10 });
    await Promise.all(Array.from({ length: 10 }, (_, index) => at.client.request(get(`/r${index}`), signal)));
    const late = at.client.request(get("/late"), signal);
    await at.clock.advance(59_000);
    expect(at.exchanges.length).toBe(10);
    await at.clock.advance(1000);
    await late;
    expect(at.exchanges.length).toBe(11);
  });

  it("counts 5 points for a write, and waits one second between writes", async () => {
    const at = fake([], { pointsPerMinute: 10 });
    await at.client.request({ method: "POST", path: "/w" }, signal);
    const second = at.client.request({ method: "PUT", path: "/w" }, signal);
    await at.clock.advance(999);
    expect(at.exchanges.length).toBe(1);
    await at.clock.advance(1);
    await second;
    const read = at.client.request(get("/r"), signal);
    await at.clock.advance(1000);
    expect(at.exchanges.length).toBe(2);
    await at.clock.advance(59_000);
    await read;
    expect(at.exchanges.map((exchange) => exchange.method)).toEqual(["POST", "PUT", "GET"]);
  });

  it("refuses a request whose wait is longer than its longest wait, and sends nothing", async () => {
    const at = fake([], { pointsPerMinute: 5, maxWaitMs: 10_000 });
    await at.client.request({ method: "PATCH", path: "/w" }, signal);
    const error = await at.client.request(get("/r"), signal).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RestRateError);
    expect((error as RestRateError).retryAfterMs).toBe(60_000);
    expect(at.exchanges.length).toBe(1);
  });

  it("waits until the reset after a refusal with no remaining requests", async () => {
    const refusal = reply(403, { message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(SECONDS + 29), date: DATE });
    const at = fake([refusal]);
    expect((await at.client.request(get("/a"), signal)).status).toBe(403);
    expect(at.client.state()).toMatchObject({ rateRefusals: 1, remaining: 0, blockedForMs: 30_000 });
    const next = at.client.request(get("/b"), signal);
    await at.clock.advance(29_999);
    expect(at.exchanges.length).toBe(1);
    await at.clock.advance(1);
    await next;
    expect(at.exchanges.length).toBe(2);
  });

  it("refuses at once a request during a wait that is longer than its longest wait", async () => {
    const at = fake([reply(429, {}, { "retry-after": "120" })]);
    await at.client.request(get("/a"), signal);
    const error = await at.client.request(get("/b"), signal).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RestRateError);
    expect((error as RestRateError).retryAfterMs).toBe(120_000);
    expect(at.exchanges.length).toBe(1);
  });

  it("waits one minute after a secondary refusal with no time, two minutes after the next, and one minute after a success", async () => {
    const secondary = reply(403, { message: "You have exceeded a secondary rate limit." });
    const at = fake([secondary, secondary, reply(200), secondary], { maxWaitMs: 1_000_000 });
    await at.client.request(get("/a"), signal);
    expect(at.client.state().blockedForMs).toBe(60_000);
    const second = at.client.request(get("/b"), signal);
    await at.clock.advance(60_000);
    await second;
    expect(at.client.state().blockedForMs).toBe(120_000);
    const third = at.client.request(get("/c"), signal);
    await at.clock.advance(120_000);
    await third;
    const fourth = at.client.request(get("/d"), signal);
    await fourth;
    expect(at.client.state()).toMatchObject({ rateRefusals: 3, blockedForMs: 60_000 });
  });

  it("holds a request that waits for points when a refusal for the rate comes during its wait", async () => {
    let refuse: (value: RestReply) => void = () => {};
    const exchanges: RestExchange[] = [];
    const clock = fakeClock(1000);
    const transport: RestTransport = (exchange) => {
      exchanges.push(exchange);
      if (exchange.url.endsWith("/last")) return new Promise<RestReply>((resolve) => (refuse = resolve));
      return Promise.resolve(reply(200));
    };
    const client = createRestClient({ token: TOKEN, transport, clock, pointsPerMinute: 10, maxWaitMs: 200_000 });
    const first = Array.from({ length: 9 }, (_, index) => client.request(get(`/r${index}`), signal));
    const last = client.request(get("/last"), signal);
    await Promise.all(first);
    const late = client.request(get("/late"), signal);
    await clock.advance(0);
    refuse(reply(429, {}, { "retry-after": "90" }));
    await last;
    await clock.advance(60_000);
    expect(exchanges.length).toBe(10);
    await clock.advance(30_000);
    await late;
    expect(exchanges.length).toBe(11);
  });

  it("takes no points during a block, so the requests after the block have the whole window", async () => {
    const at = fake([reply(429, {}, { "retry-after": "30" })], { pointsPerMinute: 5 });
    await at.client.request(get("/a"), signal);
    const waiting = Array.from({ length: 4 }, (_, index) => at.client.request(get(`/b${index}`), signal));
    await at.clock.advance(30_000);
    await Promise.all(waiting);
    expect(at.exchanges.length).toBe(5);
    await at.clock.advance(31_000);
    const after = [at.client.request(get("/c"), signal), at.client.request(get("/d"), signal)];
    await at.clock.advance(0);
    expect(at.exchanges.length).toBe(6);
    await at.clock.advance(29_000);
    await Promise.all(after);
    expect(at.exchanges.length).toBe(7);
  });

  it("keeps the longer wait when two refusals for the rate come together", async () => {
    const at = fake([reply(429, {}, { "retry-after": "90" }), reply(429, {}, { "retry-after": "10" })]);
    await Promise.all([at.client.request(get("/a"), signal), at.client.request(get("/b"), signal)]);
    expect(at.client.state()).toMatchObject({ rateRefusals: 2, blockedForMs: 90_000 });
  });

  it("does not wait after a 403 that is not a refusal for the rate, and keeps the last count of remaining requests", async () => {
    const at = fake([reply(403, { message: "Resource not accessible by integration" }, { "x-ratelimit-remaining": "4999" }), reply(200)]);
    await at.client.request(get("/a"), signal);
    expect(at.client.state()).toMatchObject({ rateRefusals: 0, remaining: 4999, blockedForMs: 0 });
    await at.client.request(get("/b"), signal);
    expect(at.client.state().remaining).toBe(4999);
  });

  it("waits until the reset after a success that used the last request", async () => {
    const at = fake([reply(200, {}, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(SECONDS + 9), date: DATE })]);
    await at.client.request(get("/a"), signal);
    expect(at.client.state()).toMatchObject({ rateRefusals: 0, blockedForMs: 10_000 });
  });
});

describe("the rules of a refusal", () => {
  it("tells a refusal for the rate from another refusal", () => {
    expect(isRateRefusal(reply(429))).toBe(true);
    expect(isRateRefusal(reply(403, {}, { "X-RateLimit-Remaining": "0" }))).toBe(true);
    expect(isRateRefusal(reply(403, {}, { "retry-after": "5" }))).toBe(true);
    expect(isRateRefusal(reply(403, { message: "secondary rate limit" }))).toBe(true);
    expect(isRateRefusal(reply(403, { message: "API Rate Limit exceeded" }))).toBe(true);
    expect(isRateRefusal(reply(403, { message: "Forbidden" }, { "x-ratelimit-remaining": "10" }))).toBe(false);
    expect(isRateRefusal(reply(403, null))).toBe(false);
    expect(isRateRefusal(reply(500, { message: "rate limit" }))).toBe(false);
  });

  it("gives the wait of a refusal, with a limit", () => {
    expect(rateWaitMs(reply(429, {}, { "retry-after": "7" }), 0)).toBe(7000);
    expect(rateWaitMs(reply(429, {}, { "retry-after": "99999" }), 0)).toBe(LONGEST_RATE_WAIT_MS);
    expect(rateWaitMs(reply(403, {}, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(SECONDS - 5), date: DATE }), 0)).toBe(1000);
    expect(rateWaitMs(reply(403, {}, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(SECONDS + 999_999), date: DATE }), 0)).toBe(LONGEST_RATE_WAIT_MS);
    expect(rateWaitMs(reply(403, {}, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(SECONDS) }), 0)).toBe(60_000);
    expect(rateWaitMs(reply(403, {}, { "x-ratelimit-remaining": "5", "x-ratelimit-reset": String(SECONDS + 9), date: DATE }), 0)).toBe(60_000);
    expect(rateWaitMs(reply(403), -3)).toBe(60_000);
    expect([0, 1, 2, 3, 4, 5, 9].map((strikes) => rateWaitMs(reply(403), strikes))).toEqual([60_000, 120_000, 240_000, 480_000, 960_000, 960_000, 960_000]);
    expect(rateWaitMs(reply(429, {}, { "retry-after": "-1" }), 0)).toBe(60_000);
    expect(rateWaitMs(reply(429, {}, { "retry-after": ["3", "4"] as unknown as string }), 0)).toBe(60_000);
  });
});

describe("the checks", () => {
  it("refuses a path that can leave its endpoint, and sends nothing", async () => {
    const at = fake();
    for (const path of ["repos/o/r", "/a?x=1", "/a#b", "//evil.example/x", "/a b", "/a\\b", "/a/../b", "/a/./b", "/a/%2e%2E/b", "/a/.%2e", "/a\n", "", 7]) {
      await expect(at.client.request({ method: "GET", path: path as string }, signal)).rejects.toThrow(TypeError);
    }
    expect(at.exchanges).toEqual([]);
  });

  it("refuses a method, a query and a GET with a body that are not valid, and sends nothing", async () => {
    const at = fake();
    await expect(at.client.request({ method: "HEAD" as "GET", path: "/a" }, signal)).rejects.toThrow(/GET, POST, PUT, PATCH or DELETE/);
    await expect(at.client.request({ method: "get" as "GET", path: "/a" }, signal)).rejects.toThrow(TypeError);
    await expect(at.client.request(null as never, signal)).rejects.toThrow(TypeError);
    await expect(at.client.request({ method: "GET", path: "/a", query: { page: 2 as unknown as string } }, signal)).rejects.toThrow(/"page"/);
    await expect(at.client.request({ method: "GET", path: "/a", body: {} }, signal)).rejects.toThrow(/GET with a body/);
    expect(at.exchanges).toEqual([]);
  });

  it("refuses options that are not valid", () => {
    const transport: RestTransport = async () => reply(200);
    const make = (options: Partial<RestClientOptions>) => () => createRestClient({ token: TOKEN, transport, ...options });
    expect(make({ baseUrl: "http://api.github.com" })).toThrow(TypeError);
    const withCredential = (field: "username" | "password") => {
      const url = new URL("https://api.github.com");
      url[field] = "x";
      return url.href;
    };
    expect(make({ baseUrl: withCredential("username") })).toThrow(TypeError);
    expect(make({ baseUrl: withCredential("password") })).toThrow(TypeError);
    expect(make({ baseUrl: "https://api.github.com/#part" })).toThrow(TypeError);
    expect(make({ baseUrl: "https://api.github.com/?x=1" })).toThrow(TypeError);
    expect(make({ pointsPerMinute: 4 })).toThrow(RangeError);
    expect(make({ pointsPerMinute: 900.5 })).toThrow(RangeError);
    expect(make({ cacheEntries: -1 })).toThrow(RangeError);
    expect(make({ maxWaitMs: 1.5 })).toThrow(RangeError);
    expect(make({ userAgent: "a\r\nb" })).toThrow(TypeError);
    expect(make({ apiVersion: "" })).toThrow(TypeError);
    expect(make({ token: 5 as unknown as string })).toThrow(TypeError);
    expect(make({})).not.toThrow();
  });

  it("refuses a token that is empty or has a line break, with no part of the token in the text", async () => {
    for (const token of ["", `${TOKEN}\r\nx-evil: 1`, `${TOKEN} `]) {
      const at = fake([], { token: () => token });
      const error = await at.client.request(get("/a"), signal).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(TypeError);
      expect(String((error as Error).message)).not.toContain(TOKEN);
      expect(at.exchanges).toEqual([]);
    }
  });

  it("has no token and no body of an answer in its error texts", async () => {
    const secret = "JIT-CONFIG-SECRET";
    const at = fake([reply(429, { encoded_jit_config: secret }, { "retry-after": "500" })], { maxWaitMs: 0 });
    await at.client.request({ method: "POST", path: "/repos/o/r/actions/runners/generate-jitconfig" }, signal);
    const errors = await Promise.all([
      at.client.request(get("/a"), signal).catch((caught: unknown) => caught),
      at.client.request({ method: "POST", path: "/b" }, signal).catch((caught: unknown) => caught),
    ]);
    for (const error of errors) {
      expect(error).toBeInstanceOf(RestRateError);
      expect((error as Error).message).not.toContain(TOKEN);
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("throws for a transport that gives no status, and gives the error of a transport", async () => {
    const bad = fake([reply(Number.NaN)]);
    await expect(bad.client.request(get("/a"), signal)).rejects.toThrow(/not a number/);
    const failing = createRestClient({ token: TOKEN, clock: fakeClock(0), transport: async () => Promise.reject(new Error("socket hang up")) });
    await expect(failing.request(get("/a"), signal)).rejects.toThrow("socket hang up");
  });
});

describe("the signal", () => {
  it("sends nothing after the signal stopped", async () => {
    const at = fake();
    const controller = new AbortController();
    controller.abort();
    await expect(at.client.request(get("/a"), controller.signal)).rejects.toThrow(/signal stopped the request GET \/a/);
    expect(at.exchanges).toEqual([]);
  });

  it("ends a wait for a limit when the signal stops, and sends nothing", async () => {
    const at = fake([reply(429, {}, { "retry-after": "30" })]);
    await at.client.request(get("/a"), signal);
    const controller = new AbortController();
    const waiting = at.client.request(get("/b"), controller.signal);
    expect(at.clock.pending).toBe(1);
    controller.abort();
    await expect(waiting).rejects.toThrow(/signal stopped/);
    expect(at.clock.pending).toBe(0);
    await at.clock.advance(30_000);
    expect(at.exchanges.length).toBe(1);
  });

  it("gives the signal to the transport", async () => {
    const seen: AbortSignal[] = [];
    const client = createRestClient({ token: TOKEN, clock: fakeClock(0), transport: async (_exchange, given) => (seen.push(given), reply(200)) });
    await client.request(get("/a"), signal);
    expect(seen).toEqual([signal]);
  });
});
