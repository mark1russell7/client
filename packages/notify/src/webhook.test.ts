import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { retryAfterMs } from "./call.js";
import {
  WEBHOOK_MIN_WAIT_MS,
  WEBHOOK_TOLERANCE_MS,
  extractWebhookSent,
  parseWebhookSecret,
  sendWebhook,
  signWebhook,
  verifyWebhook,
  webhookBody,
  webhookRequest,
  webhookSecretText,
  type WebhookFetch,
  type WebhookMessage,
  type WebhookSecret,
} from "./webhook.js";

// The vector of the documentation of the reference library of Standard Webhooks. node:crypto gave the same signature on 2026-11-16.
const VECTOR = {
  secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  seconds: 1614265330,
  body: '{"test": 2432232314}',
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};
const T0 = VECTOR.seconds * 1000;

const secretOf = (text: string): WebhookSecret => {
  const parsed = parseWebhookSecret(text);
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.secret;
};
const SECRET = secretOf(VECTOR.secret);
const OTHER = secretOf(webhookSecretText(new Uint8Array(32).fill(7)));
const headers = (values: Readonly<Record<string, string>>): { get(name: string): string | null } => ({ get: (name) => values[name.toLowerCase()] ?? null });
const message = (extra: Partial<WebhookMessage> = {}): WebhookMessage => ({ url: "https://hooks.example.com/in", id: VECTOR.id, timestampMs: T0, body: VECTOR.body, ...extra });

describe("signWebhook", () => {
  it("gives the signature of the vector of the reference library", async () => {
    expect(await signWebhook(SECRET, VECTOR.id, VECTOR.seconds, VECTOR.body)).toBe(VECTOR.signature);
  });
});

describe("parseWebhookSecret and webhookSecretText", () => {
  it("reads a secret, and gives the text of random bytes back", () => {
    expect(SECRET.bytes).toHaveLength(24);
    const bytes = new Uint8Array(64).map((_, index) => index);
    const text = webhookSecretText(bytes);
    expect(text.startsWith("whsec_")).toBe(true);
    expect(secretOf(text).bytes).toEqual(bytes);
  });

  it("refuses a text with no prefix, with bad base64, or with too few or too many bytes, and the problem holds no part of the text", () => {
    const texts = ["MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2La-_Sw", "whsec_", `whsec_${"A".repeat(20)}`, `whsec_${"A".repeat(88)}`];
    const problems = texts.map((text) => parseWebhookSecret(text));
    expect(problems.map((result) => result.ok)).toEqual([false, false, false, false, false]);
    for (const [index, result] of problems.entries()) {
      const part = texts[index]!.slice(6, 14);
      if (!result.ok && part.length > 0) expect(result.problem).not.toContain(part);
    }
    expect(problems[3]).toEqual({ ok: false, problem: "The secret has 15 bytes, not 24 to 64." });
  });

  it("throws for a count of bytes outside 24 to 64", () => {
    expect(() => webhookSecretText(new Uint8Array(23))).toThrow(RangeError);
    expect(() => webhookSecretText(new Uint8Array(65))).toThrow(RangeError);
  });
});

describe("webhookBody", () => {
  it("gives the type, the time in ISO 8601 and the data", () => {
    expect(JSON.parse(webhookBody("alert.sent", 0, { level: "urgent" }))).toEqual({ type: "alert.sent", timestamp: "1970-01-01T00:00:00.000Z", data: { level: "urgent" } });
  });
});

describe("webhookRequest", () => {
  it("posts the body with the three headers, the time in whole seconds and one signature for each secret", async () => {
    const request = await webhookRequest(message({ timestampMs: T0 + 999, headers: { "user-agent": "test-agent", "webhook-id": "replaced" } }), [SECRET, OTHER]);
    expect(request.method).toBe("POST");
    expect(request.redirect).toBe("manual");
    expect(request.url).toBe("https://hooks.example.com/in");
    expect(request.body).toBe(VECTOR.body);
    expect(request.headers["content-type"]).toBe("application/json");
    expect(request.headers["user-agent"]).toBe("test-agent");
    expect(request.headers["webhook-id"]).toBe(VECTOR.id);
    expect(request.headers["webhook-timestamp"]).toBe(String(VECTOR.seconds));
    const signatures = request.headers["webhook-signature"]!.split(" ");
    expect(signatures).toHaveLength(2);
    expect(signatures[0]).toBe(VECTOR.signature);
  });

  it("throws with no secret, or with an id that has a full stop or a space", async () => {
    await expect(webhookRequest(message(), [])).rejects.toThrow(RangeError);
    await expect(webhookRequest(message({ id: "a.b" }), [SECRET])).rejects.toThrow(RangeError);
    await expect(webhookRequest(message({ id: "a b" }), [SECRET])).rejects.toThrow(RangeError);
    await expect(webhookRequest(message({ id: "" }), [SECRET])).rejects.toThrow(RangeError);
  });
});

describe("verifyWebhook", () => {
  const incoming = async (extra: Partial<WebhookMessage> = {}, secrets: readonly WebhookSecret[] = [SECRET]): Promise<{ headers: { get(name: string): string | null }; body: string }> => {
    const request = await webhookRequest(message(extra), secrets);
    return { headers: headers(request.headers), body: request.body };
  };

  it("accepts a signed request, and gives its id and its time", async () => {
    expect(await verifyWebhook(await incoming(), [SECRET], T0)).toEqual({ ok: true, id: VECTOR.id, timestampMs: T0 });
  });

  it("accepts the request of a sender with the old and the new secret, while the receiver changes its secret", async () => {
    const both = await incoming({}, [OTHER, SECRET]);
    expect((await verifyWebhook(both, [SECRET], T0)).ok).toBe(true);
    expect((await verifyWebhook(await incoming(), [OTHER, SECRET], T0)).ok).toBe(true);
  });

  it("refuses a changed body, another secret, or a time outside the tolerance", async () => {
    const signed = await incoming();
    expect(await verifyWebhook({ ...signed, body: '{"test": 1}' }, [SECRET], T0)).toEqual({ ok: false, reason: "signature" });
    expect(await verifyWebhook(signed, [OTHER], T0)).toEqual({ ok: false, reason: "signature" });
    expect((await verifyWebhook(signed, [SECRET], T0 + WEBHOOK_TOLERANCE_MS)).ok).toBe(true);
    expect(await verifyWebhook(signed, [SECRET], T0 + WEBHOOK_TOLERANCE_MS + 1)).toEqual({ ok: false, reason: "old" });
    expect(await verifyWebhook(signed, [SECRET], T0 - WEBHOOK_TOLERANCE_MS - 1)).toEqual({ ok: false, reason: "future" });
  });

  it("refuses a missing header or a bad time, and skips a signature of another version or with bad base64", async () => {
    const values = { "webhook-id": VECTOR.id, "webhook-timestamp": String(VECTOR.seconds), "webhook-signature": VECTOR.signature };
    const check = (changed: Record<string, string | undefined>): ReturnType<typeof verifyWebhook> => {
      const all = Object.fromEntries(Object.entries({ ...values, ...changed }).filter((entry): entry is [string, string] => entry[1] !== undefined));
      return verifyWebhook({ headers: headers(all), body: VECTOR.body }, [SECRET], T0);
    };
    expect(await check({ "webhook-id": undefined })).toEqual({ ok: false, reason: "missing" });
    expect(await check({ "webhook-signature": undefined })).toEqual({ ok: false, reason: "missing" });
    expect(await check({ "webhook-timestamp": "1614265330.5" })).toEqual({ ok: false, reason: "timestamp" });
    expect(await check({ "webhook-signature": `v1a,${VECTOR.signature.slice(3)} v1,not*base64 ${VECTOR.signature}` })).toEqual({ ok: true, id: VECTOR.id, timestampMs: T0 });
    expect(await check({ "webhook-signature": `v1a,${VECTOR.signature.slice(3)}` })).toEqual({ ok: false, reason: "signature" });
  });
});

describe("extractWebhookSent", () => {
  const response = (status: number, values: Readonly<Record<string, string>> = {}): Parameters<typeof extractWebhookSent>[0] => ({ status, text: "", headers: headers(values) });

  it("sorts each status by the rules of the spec", () => {
    expect(extractWebhookSent(response(204), T0)).toEqual({ ok: true, status: 204 });
    expect(extractWebhookSent(response(301), T0)).toEqual({ ok: false, kind: "redirect", status: 301 });
    expect(extractWebhookSent(response(0), T0)).toEqual({ ok: false, kind: "redirect", status: 0 });
    expect(extractWebhookSent(response(410), T0)).toEqual({ ok: false, kind: "gone", status: 410 });
    expect(extractWebhookSent(response(401), T0)).toEqual({ ok: false, kind: "refused", status: 401 });
    expect(extractWebhookSent(response(400), T0)).toEqual({ ok: false, kind: "refused", status: 400 });
  });

  it("gives a wait for a status that can pass, from a Retry-After header in seconds or as a date, and 5 seconds at least", () => {
    expect(extractWebhookSent(response(429, { "retry-after": "30" }), T0)).toEqual({ ok: false, kind: "throttled", status: 429, retryAfterMs: 30_000 });
    const date = new Date(T0 + 120_000).toUTCString();
    expect(extractWebhookSent(response(503, { "retry-after": date }), T0)).toEqual({ ok: false, kind: "server", status: 503, retryAfterMs: 120_000 });
    expect(extractWebhookSent(response(502), T0)).toEqual({ ok: false, kind: "throttled", status: 502, retryAfterMs: WEBHOOK_MIN_WAIT_MS });
    expect(extractWebhookSent(response(500, { "retry-after": "1" }), T0)).toEqual({ ok: false, kind: "server", status: 500, retryAfterMs: WEBHOOK_MIN_WAIT_MS });
  });
});

describe("sendWebhook", () => {
  it("sends the signed request once through the fetch, and a receiver accepts it", async () => {
    const seen: { url: string; init: Parameters<WebhookFetch>[1] }[] = [];
    const fetch: WebhookFetch = (url, init) => {
      seen.push({ url, init });
      return Promise.resolve({ status: 200, text: () => Promise.resolve(""), headers: headers({}) });
    };
    expect(await sendWebhook(fetch, message(), [SECRET])).toEqual({ ok: true, status: 200 });
    expect(seen).toHaveLength(1);
    const init = seen[0]!.init;
    expect(init.redirect).toBe("manual");
    expect(await verifyWebhook({ headers: headers(init.headers), body: init.body ?? "" }, [SECRET], T0)).toEqual({ ok: true, id: VECTOR.id, timestampMs: T0 });
  });

  it("does not follow the redirect of a real server, thus the signed body goes only to the endpoint", async () => {
    const paths: string[] = [];
    const server = createServer((request, response) => {
      paths.push(request.url ?? "");
      response.writeHead(request.url === "/in" ? 307 : 200, request.url === "/in" ? { location: "/other" } : {});
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const result = await sendWebhook(globalThis.fetch, message({ url: `http://127.0.0.1:${String(port)}/in` }), [SECRET]);
      expect(result).toEqual({ ok: false, kind: "redirect", status: 307 });
      expect(paths).toEqual(["/in"]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("gives a failure with a wait when no answer comes, or when the fetch fails", async () => {
    const silent: WebhookFetch = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason as Error)));
    expect(await sendWebhook(silent, message(), [SECRET], { timeoutMs: 20 })).toEqual({ ok: false, kind: "timeout", retryAfterMs: WEBHOOK_MIN_WAIT_MS });
    const broken: WebhookFetch = () => Promise.reject(new TypeError("fetch failed"));
    expect(await sendWebhook(broken, message(), [SECRET])).toEqual({ ok: false, kind: "network", retryAfterMs: WEBHOOK_MIN_WAIT_MS });
  });
});

describe("retryAfterMs", () => {
  it("reads seconds or a date, and gives undefined for another form", () => {
    expect(retryAfterMs("7", T0)).toBe(7000);
    expect(retryAfterMs(new Date(T0 + 3000).toUTCString(), T0)).toBe(3000);
    expect(retryAfterMs(new Date(T0 - 3000).toUTCString(), T0)).toBe(0);
    expect(retryAfterMs("soon", T0)).toBeUndefined();
    expect(retryAfterMs(null, T0)).toBeUndefined();
    expect(retryAfterMs("  ", T0)).toBeUndefined();
  });
});
