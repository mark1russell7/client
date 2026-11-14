import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import {
  PUSHOVER_MIN_WAIT_MS,
  callPushover,
  extractPushoverCallback,
  extractPushoverCancelled,
  extractPushoverLimits,
  extractPushoverReceipt,
  extractPushoverSent,
  extractPushoverValidated,
  pushoverCancelByTagRequest,
  pushoverCancelRequest,
  pushoverLimitsRequest,
  pushoverReceiptRequest,
  pushoverSendRequest,
  pushoverValidateRequest,
  type PushoverFetch,
  type PushoverMessage,
} from "./pushover.js";
import { notifyProcedures } from "./procedures.js";

// The keys are made up. The bodies have the shapes of the API documentation (pushover.net/api and
// pushover.net/api/receipts). On 2026-11-14 the live answers of validate, limits and an unknown user
// key had these shapes. Only a send gives the X-Limit-App headers.
const TOKEN = `madeuptoken${"0".repeat(19)}`;
const USER = `madeupuser${"0".repeat(20)}`;
const RECEIPT = `madeupreceipt${"0".repeat(17)}`;
const REQUEST_ID = "5042853c-402d-4a18-abcb-168734a801de";

const form = (body: string | undefined): Record<string, string> => Object.fromEntries(new URLSearchParams(body ?? ""));
const headers = (values: Record<string, string>): { get(name: string): string | null } => ({ get: (name) => values[name.toLowerCase()] ?? null });
const message = (extra: Partial<PushoverMessage> = {}): PushoverMessage => ({ user: USER, message: "A tornado warning covers the place.", ...extra });

describe("pushoverSendRequest", () => {
  it("posts a form with the token, the user and the message, and leaves out the defaults", () => {
    const request = pushoverSendRequest(TOKEN, message({ title: "Tornado warning" }));
    expect(request.url).toBe("https://api.pushover.net/1/messages.json");
    expect(request.method).toBe("POST");
    expect(request.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(form(request.body)).toEqual({ token: TOKEN, user: USER, message: "A tornado warning covers the place.", title: "Tornado warning" });
  });

  it("gives an emergency message its repeats in whole seconds, its callback and its tags", () => {
    const request = pushoverSendRequest(
      TOKEN,
      message({
        priority: 2,
        emergency: { retryMs: 30_500, expireMs: 3_600_999, callback: "https://example.org/ack", tags: ["k=abc", "level=life-safety"] },
        sound: "persistent",
        devices: ["iphone", "ipad-2"],
        timestampMs: 1_700_000_000_999,
        format: "html",
        ttlMs: 60_000,
      }),
    );
    expect(form(request.body)).toMatchObject({
      priority: "2",
      retry: "31",
      expire: "3600",
      callback: "https://example.org/ack",
      tags: "k=abc,level=life-safety",
      sound: "persistent",
      device: "iphone,ipad-2",
      timestamp: "1700000000",
      html: "1",
    });
    // Pushover ignores the time to live of priority 2, so the request does not send it
    expect(form(request.body)["ttl"]).toBeUndefined();
  });

  it("counts characters, not bytes, and accepts the longest text", () => {
    expect(() => pushoverSendRequest(TOKEN, message({ message: "🌪".repeat(1024) }))).not.toThrow();
    expect(() => pushoverSendRequest(TOKEN, message({ message: "🌪".repeat(1025) }))).toThrow(/more than 1024 characters/);
  });

  it.each<[string, () => unknown, RegExp]>([
    ["a short token", () => pushoverSendRequest("abc", message()), /API token/],
    ["a token with a space", () => pushoverSendRequest(` ${TOKEN.slice(1)}`, message()), /API token/],
    ["a bad user key", () => pushoverSendRequest(TOKEN, message({ user: "nobody" })), /user key/],
    ["51 users", () => pushoverSendRequest(TOKEN, message({ user: Array(51).fill(USER).join(",") })), /50 users/],
    ["an empty message", () => pushoverSendRequest(TOKEN, message({ message: "  " })), /empty/],
    ["a long title", () => pushoverSendRequest(TOKEN, message({ title: "x".repeat(251) })), /title/],
    ["priority 2 without repeats", () => pushoverSendRequest(TOKEN, message({ priority: 2 })), /retryMs and expireMs/],
    ["repeats without priority 2", () => pushoverSendRequest(TOKEN, message({ priority: 1, emergency: { retryMs: 60_000, expireMs: 60_000 } })), /Only priority 2/],
    ["a retry of 29 s", () => pushoverSendRequest(TOKEN, message({ priority: 2, emergency: { retryMs: 29_999, expireMs: 60_000 } })), /30 seconds/],
    ["an expiry over 3 h", () => pushoverSendRequest(TOKEN, message({ priority: 2, emergency: { retryMs: 60_000, expireMs: 10_801_000 } })), /3 hours/],
    ["a tag with a comma", () => pushoverSendRequest(TOKEN, message({ priority: 2, emergency: { retryMs: 60_000, expireMs: 60_000, tags: ["a,b"] } })), /comma/],
    ["a callback that is not http", () => pushoverSendRequest(TOKEN, message({ priority: 2, emergency: { retryMs: 60_000, expireMs: 60_000, callback: "ftp://x" } })), /callback/],
    ["a bad device", () => pushoverSendRequest(TOKEN, message({ devices: ["my phone"] })), /device/],
    ["priority 3", () => pushoverSendRequest(TOKEN, message({ priority: 3 as never })), /priority/],
  ])("refuses %s before a request goes", (_name, build, error) => {
    expect(build).toThrow(error);
  });
});

describe("the other request builders", () => {
  it("reads a receipt and the limits with GET, with the token in the query", () => {
    expect(pushoverReceiptRequest(TOKEN, RECEIPT)).toEqual({
      url: `https://api.pushover.net/1/receipts/${RECEIPT}.json?token=${TOKEN}`,
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(pushoverLimitsRequest(TOKEN).url).toBe(`https://api.pushover.net/1/apps/limits.json?token=${TOKEN}`);
  });

  it("cancels by receipt and by tag with POST, and puts the tag in the path safely", () => {
    const byReceipt = pushoverCancelRequest(TOKEN, RECEIPT);
    expect(byReceipt.url).toBe(`https://api.pushover.net/1/receipts/${RECEIPT}/cancel.json`);
    expect(form(byReceipt.body)).toEqual({ token: TOKEN });
    expect(pushoverCancelByTagRequest(TOKEN, "k=a/b c").url).toBe("https://api.pushover.net/1/receipts/cancel_by_tag/k%3Da%2Fb%20c.json");
    expect(() => pushoverCancelByTagRequest(TOKEN, "")).toThrow(/empty/);
    expect(() => pushoverCancelRequest(TOKEN, "../limits")).toThrow(/receipt/);
  });

  it("validates a user key, with or without a device", () => {
    expect(form(pushoverValidateRequest(TOKEN, USER).body)).toEqual({ token: TOKEN, user: USER });
    expect(form(pushoverValidateRequest(TOKEN, USER, "iphone").body)).toEqual({ token: TOKEN, user: USER, device: "iphone" });
  });
});

describe("the extractors", () => {
  it("reads a queued message with its receipt and the monthly limit of the headers", () => {
    const response = {
      status: 200,
      text: JSON.stringify({ status: 1, request: REQUEST_ID, receipt: RECEIPT }),
      headers: headers({ "x-limit-app-limit": "10000", "x-limit-app-remaining": "7496", "x-limit-app-reset": "1393653600" }),
    };
    expect(extractPushoverSent(response)).toEqual({
      ok: true,
      request: REQUEST_ID,
      receipt: RECEIPT,
      limits: { limit: 10000, remaining: 7496, resetAt: 1_393_653_600_000 },
    });
    expect(extractPushoverSent({ status: 200, text: JSON.stringify({ status: 1, request: REQUEST_ID }) })).toEqual({ ok: true, request: REQUEST_ID });
  });

  it("sorts each failure into a kind, and does not throw", () => {
    const userInvalid = { status: 400, text: JSON.stringify({ user: "invalid", errors: ["user identifier is invalid"], status: 0, request: REQUEST_ID }) };
    expect(extractPushoverSent(userInvalid)).toEqual({ ok: false, kind: "refused", status: 400, errors: ["user identifier is invalid"], request: REQUEST_ID });
    const tokenInvalid = { status: 400, text: JSON.stringify({ token: "invalid", errors: ["application token is invalid"], status: 0, request: REQUEST_ID }) };
    expect(extractPushoverSent(tokenInvalid)).toMatchObject({ ok: false, kind: "auth", errors: ["application token is invalid"] });
    const limited = { status: 429, text: JSON.stringify({ status: 0, errors: ["message limit reached"] }), headers: headers({ "x-limit-app-limit": "10000", "x-limit-app-remaining": "0", "x-limit-app-reset": "1393653600" }) };
    expect(extractPushoverSent(limited)).toEqual({ ok: false, kind: "rate-limited", status: 429, errors: ["message limit reached"], resetAt: 1_393_653_600_000 });
    expect(extractPushoverSent({ status: 502, text: "<html>Bad Gateway</html>" })).toEqual({
      ok: false,
      kind: "server",
      status: 502,
      errors: ["Pushover gave HTTP 502."],
      retryAfterMs: PUSHOVER_MIN_WAIT_MS,
    });
    // A 2xx answer that is not JSON tells nothing, so the message can go again
    expect(extractPushoverSent({ status: 200, text: "OK" })).toMatchObject({ ok: false, kind: "server", retryAfterMs: PUSHOVER_MIN_WAIT_MS });
    // Pushover: "4xx or status not 1: do not retry the same request"
    expect(extractPushoverSent({ status: 200, text: JSON.stringify({ status: 0, errors: ["no"] }) })).toMatchObject({ ok: false, kind: "refused" });
    expect(extractPushoverSent({ status: 403, text: "" })).toMatchObject({ ok: false, kind: "auth" });
  });

  it("reads an acknowledged receipt, with each time in milliseconds", () => {
    const body = {
      status: 1,
      acknowledged: 1,
      acknowledged_at: 1360019238,
      acknowledged_by: USER,
      acknowledged_by_device: "iphone",
      last_delivered_at: 1360001238,
      expired: 1,
      expires_at: 1360019290,
      called_back: 0,
      called_back_at: 0,
      request: REQUEST_ID,
    };
    expect(extractPushoverReceipt({ status: 200, text: JSON.stringify(body) })).toEqual({
      ok: true,
      acknowledged: true,
      acknowledgedAt: 1_360_019_238_000,
      acknowledgedBy: USER,
      acknowledgedByDevice: "iphone",
      lastDeliveredAt: 1_360_001_238_000,
      expired: true,
      expiresAt: 1_360_019_290_000,
      calledBack: false,
    });
  });

  it("reads a receipt that waits for an acknowledgment: a time of 0 is absent", () => {
    const body = { status: 1, acknowledged: 0, acknowledged_at: 0, acknowledged_by: "", acknowledged_by_device: "", last_delivered_at: 1360001238, expired: 0, expires_at: 1360019290, called_back: 0, called_back_at: 0 };
    expect(extractPushoverReceipt({ status: 200, text: JSON.stringify(body) })).toEqual({
      ok: true,
      acknowledged: false,
      lastDeliveredAt: 1_360_001_238_000,
      expired: false,
      expiresAt: 1_360_019_290_000,
      calledBack: false,
    });
    expect(extractPushoverReceipt({ status: 200, text: JSON.stringify({ status: 1, acknowledged: 0 }) })).toMatchObject({ ok: false, kind: "server" });
    expect(extractPushoverReceipt({ status: 404, text: JSON.stringify({ receipt: "not found", status: 0, errors: ["receipt not found"] }) })).toMatchObject({
      ok: false,
      kind: "refused",
    });
  });

  it("reads a cancel, the validation of a user and the limits", () => {
    expect(extractPushoverCancelled({ status: 200, text: JSON.stringify({ status: 1, request: REQUEST_ID }) })).toEqual({ ok: true, request: REQUEST_ID });
    expect(extractPushoverCancelled({ status: 200, text: JSON.stringify({ status: 1, canceled: 2 }) })).toEqual({ ok: true, cancelled: 2 });
    expect(extractPushoverValidated({ status: 200, text: JSON.stringify({ status: 1, group: 0, devices: ["iphone"], licenses: ["iOS"] }) })).toEqual({
      ok: true,
      group: false,
      devices: ["iphone"],
      licenses: ["iOS"],
    });
    expect(extractPushoverValidated({ status: 400, text: JSON.stringify({ status: 0, user: "invalid", errors: ["user key is invalid"] }) })).toMatchObject({
      ok: false,
      kind: "refused",
    });
    expect(extractPushoverLimits({ status: 200, text: JSON.stringify({ limit: 10000, remaining: 7496, reset: 1393653600, status: 1 }) })).toEqual({
      ok: true,
      limits: { limit: 10000, remaining: 7496, resetAt: 1_393_653_600_000 },
    });
  });

  it("reads the acknowledgment that Pushover posts to the callback, and refuses another body", () => {
    const body = new URLSearchParams({ receipt: RECEIPT, acknowledged: "1", acknowledged_at: "1360019238", acknowledged_by: USER, acknowledged_by_device: "iphone" }).toString();
    expect(extractPushoverCallback(body)).toEqual({ receipt: RECEIPT, acknowledgedAt: 1_360_019_238_000, acknowledgedBy: USER, acknowledgedByDevice: "iphone" });
    expect(extractPushoverCallback("receipt=x&acknowledged=1&acknowledged_at=1")).toBeUndefined();
    expect(extractPushoverCallback(new URLSearchParams({ receipt: RECEIPT, acknowledged: "0", acknowledged_at: "0" }).toString())).toBeUndefined();
  });
});

describe("callPushover", () => {
  it("sends the request through the fetch and reads the answer", async () => {
    const fetchMock = vi.fn<PushoverFetch>(async () => new Response(JSON.stringify({ status: 1, request: REQUEST_ID }), { status: 200 }));
    const request = pushoverSendRequest(TOKEN, message());
    expect(await callPushover(fetchMock, request, extractPushoverSent, { timeoutMs: 1000 })).toEqual({ ok: true, request: REQUEST_ID });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(request.url);
    expect(init).toMatchObject({ method: "POST", body: request.body });
  });

  it("gives a failure, not an error, when the network fails or no answer comes", async () => {
    const refused: PushoverFetch = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await callPushover(refused, pushoverLimitsRequest(TOKEN), extractPushoverLimits, { timeoutMs: 1000 })).toMatchObject({
      ok: false,
      kind: "network",
      status: 0,
      retryAfterMs: PUSHOVER_MIN_WAIT_MS,
    });
    const silent: PushoverFetch = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason as Error)));
    expect(await callPushover(silent, pushoverLimitsRequest(TOKEN), extractPushoverLimits, { timeoutMs: 20 })).toMatchObject({ ok: false, kind: "timeout" });
  });

  it("throws the reason when the caller aborts", async () => {
    const silent: PushoverFetch = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason as Error)));
    const controller = new AbortController();
    const call = callPushover(silent, pushoverLimitsRequest(TOKEN), extractPushoverLimits, { timeoutMs: 60_000, signal: controller.signal });
    controller.abort(new Error("drain"));
    await expect(call).rejects.toThrow("drain");
  });
});

describe("the Pushover procedures", () => {
  const registry = new ProcedureRegistry();
  for (const procedure of notifyProcedures) registry.register(procedure);
  const run = async (name: string, input: unknown): Promise<unknown> =>
    outputValue(await invokePath(["notify", "pushover", name], input, { registry }), ["notify", "pushover", name]);

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["PUSHOVER_APP_TOKEN"];
    delete process.env["PUSHOVER_USER_KEY"];
  });

  it("sends an emergency message with the keys of the environment, and gives the receipt", async () => {
    process.env["PUSHOVER_APP_TOKEN"] = TOKEN;
    process.env["PUSHOVER_USER_KEY"] = USER;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 1, request: REQUEST_ID, receipt: RECEIPT }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await run("send", { message: "Test", priority: 2, retryMs: 60_000, expireMs: 600_000, tags: ["k=1"] })).toEqual({
      ok: true,
      request: REQUEST_ID,
      receipt: RECEIPT,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(form(init.body)).toMatchObject({ token: TOKEN, user: USER, priority: "2", retry: "60", expire: "600", tags: "k=1" });
  });

  it("gives a refusal of Pushover as a value", async () => {
    process.env["PUSHOVER_APP_TOKEN"] = TOKEN;
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ status: 0, errors: ["receipt not found"] }), { status: 404 }));
    expect(await run("receipt", { receipt: RECEIPT })).toMatchObject({ ok: false, kind: "refused", errors: ["receipt not found"] });
  });

  it("refuses a variable without the prefix PUSHOVER_, a missing key and a cancel with two targets, and sends nothing", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env["PUSHOVER_APP_TOKEN"] = TOKEN;
    for (const tokenEnv of ["GITHUB_TOKEN", "pushover_token", "PUSHOVER_", "XPUSHOVER_TOKEN"]) {
      await expect(run("limits", { tokenEnv }), tokenEnv).rejects.toThrow(/starts with PUSHOVER_/);
    }
    await expect(run("send", { message: "Test" })).rejects.toThrow(/PUSHOVER_USER_KEY/);
    await expect(run("send", { user: USER, message: "Test", priority: 2 })).rejects.toThrow(/retryMs and expireMs/);
    await expect(run("cancel", { receipt: RECEIPT, tag: "k=1" })).rejects.toThrow(/receipt or tag/);
    await expect(run("cancel", {})).rejects.toThrow(/receipt or tag/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels by tag", async () => {
    process.env["PUSHOVER_APP_TOKEN"] = TOKEN;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 1, request: REQUEST_ID }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await run("cancel", { tag: "k=1" })).toEqual({ ok: true, request: REQUEST_ID });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.pushover.net/1/receipts/cancel_by_tag/k%3D1.json");
  });
});
