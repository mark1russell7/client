/**
 * Webhooks in the form of Standard Webhooks (https://www.standardwebhooks.com) as pure functions. A sender signs a JSON
 * body with a shared secret, and a receiver checks the signature and the time. The headers are `webhook-id`,
 * `webhook-timestamp` and `webhook-signature`.
 *
 * The signature is `v1,` and the base64 HMAC-SHA256 of the text `id.timestamp.body`. The key is the secret, in the form
 * `whsec_` and the base64 of 24 to 64 random bytes. A request can have one signature for each key, thus a receiver can
 * change its key with no lost message.
 *
 * The request builder and the extractor send no request. The caller gives the fetch: `globalThis.fetch`, a polite client
 * or a fake server of a test. The HMAC comes from WebCrypto. This entry imports no Node built-in, thus a browser
 * can also use it.
 *
 * Each time in this file is in milliseconds. The header `webhook-timestamp` holds whole seconds.
 *
 * A secret is a key. Do not log a secret, and do not put it in a URL.
 */

import { callApi, retryAfterMs, type ApiFetch, type ApiRequest, type ApiResponse } from "./call.js";

/** The prefix of a secret of a symmetric signature. */
export const WEBHOOK_SECRET_PREFIX = "whsec_";

/** The least and the most bytes of a secret. */
export const WEBHOOK_SECRET_BYTES: { readonly min: 24; readonly max: 64 } = { min: 24, max: 64 };

/** The longest difference between the time of a message and the clock of the receiver: 5 minutes. */
export const WEBHOOK_TOLERANCE_MS = 300_000;

/** The time limit of one send: 15 seconds, the low end of the advice of the spec. */
export const WEBHOOK_TIMEOUT_MS = 15_000;

/** The shortest wait before a send goes again after a failure that can pass: 5 seconds. */
export const WEBHOOK_MIN_WAIT_MS = 5_000;

/** The names of the headers of a signed message. */
export const WEBHOOK_HEADERS: { readonly id: "webhook-id"; readonly timestamp: "webhook-timestamp"; readonly signature: "webhook-signature" } = {
  id: "webhook-id",
  timestamp: "webhook-timestamp",
  signature: "webhook-signature",
};

/** A secret after its check: the bytes of the key. */
export interface WebhookSecret {
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** The result of the check of the text of a secret. */
export type WebhookSecretResult = { readonly ok: true; readonly secret: WebhookSecret } | { readonly ok: false; readonly problem: string };

/** The body of an event of the spec: a type with full stops, the time of the event, and its data. */
export interface WebhookEvent<Data> {
  /** The type of the event, for example `alert.sent`. */
  readonly type: string;
  /** The time of the event, in ISO 8601. */
  readonly timestamp: string;
  readonly data: Data;
}

/** One message to one endpoint. */
export interface WebhookMessage {
  /** The address of the endpoint, with `https`, or `http` for a loopback address. */
  readonly url: string;
  /** The id of the message. Each send of one message keeps its id, thus the receiver drops a second copy. */
  readonly id: string;
  /** The time of the send. The header holds its whole seconds. */
  readonly timestampMs: number;
  /** The body: a JSON text. `webhookBody` gives the form of the spec. */
  readonly body: string;
  /** More headers, for example a user agent. The headers of the signature replace a header with the same name. */
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

/** One request of a send. Its fields fit the `init` of `fetch`. The fetch does not follow a redirect, because the signed body goes only to the endpoint. */
export type WebhookRequest = ApiRequest & { readonly method: "POST"; readonly body: string; readonly redirect: "manual" };

/** The parts of an HTTP response that the extractor reads. A `Response` of `fetch` and its text fit it. */
export type WebhookResponse = ApiResponse;

/** The part of `fetch` that a send uses. `globalThis.fetch` fits this type. */
export type WebhookFetch = ApiFetch;

/** A send that the endpoint accepted: an HTTP status 2xx. */
export interface WebhookSent {
  readonly ok: true;
  readonly status: number;
}

/**
 * The kind of a failure.
 * - `network`: the request did not reach the endpoint, or no answer came.
 * - `timeout`: no answer came in the time limit.
 * - `throttled`: the endpoint has too many requests (429, 502 or 504). Send again after `retryAfterMs`, and send less often.
 * - `server`: the endpoint had another error 5xx. The same message can go again after `retryAfterMs`.
 * - `gone`: the endpoint answered 410. The spec tells the sender to stop each send to it.
 * - `redirect`: the endpoint answered 3xx. The spec tells the sender not to follow it: change the address.
 * - `refused`: the endpoint refused the message with another status, for example a bad signature. The same message fails again.
 */
export type WebhookFailureKind = "network" | "timeout" | "throttled" | "server" | "gone" | "redirect" | "refused";

/** A send that failed. The extractor does not throw: it gives a failure. */
export interface WebhookFailure {
  readonly ok: false;
  readonly kind: WebhookFailureKind;
  /** The HTTP status. A failure with no answer has no status. */
  readonly status?: number;
  /** The wait before the next send of the same message. Only the kinds that can pass have a wait. */
  readonly retryAfterMs?: number;
}

/**
 * The reason of a refused check.
 * - `missing`: a header of the signature is not in the request.
 * - `timestamp`: the header `webhook-timestamp` is not a whole count of seconds.
 * - `old` or `future`: the time of the message is outside the tolerance of the clock of the receiver.
 * - `signature`: no signature of the request matches a key of the receiver.
 */
export type WebhookCheckReason = "missing" | "timestamp" | "old" | "future" | "signature";

/** The result of the check of a request that came in. */
export type WebhookCheck =
  | { readonly ok: true; readonly id: string; readonly timestampMs: number }
  | { readonly ok: false; readonly reason: WebhookCheckReason };

/** The parts of a request that came in, which the check reads. The body is the text as it came, before a parse. */
export interface WebhookIncoming {
  readonly headers: { get(name: string): string | null };
  readonly body: string;
}

/**
 * This function checks the text of a secret: the prefix `whsec_`, standard base64, and 24 to 64 bytes. The problem holds
 * no part of the text.
 */
export function parseWebhookSecret(text: string): WebhookSecretResult {
  if (!text.startsWith(WEBHOOK_SECRET_PREFIX)) return { ok: false, problem: `The secret does not start with ${WEBHOOK_SECRET_PREFIX}.` };
  const bytes = fromBase64(text.slice(WEBHOOK_SECRET_PREFIX.length));
  if (bytes === undefined) return { ok: false, problem: "The secret after its prefix is not standard base64." };
  if (bytes.length < WEBHOOK_SECRET_BYTES.min || bytes.length > WEBHOOK_SECRET_BYTES.max) {
    return { ok: false, problem: `The secret has ${String(bytes.length)} bytes, not ${String(WEBHOOK_SECRET_BYTES.min)} to ${String(WEBHOOK_SECRET_BYTES.max)}.` };
  }
  return { ok: true, secret: { bytes } };
}

/**
 * This function gives the text of a secret from random bytes. Give it 24 to 64 bytes of a secure source, for example
 * `crypto.getRandomValues(new Uint8Array(32))`.
 *
 * @throws RangeError when the count of bytes is not 24 to 64.
 */
export function webhookSecretText(bytes: Uint8Array): string {
  if (bytes.length < WEBHOOK_SECRET_BYTES.min || bytes.length > WEBHOOK_SECRET_BYTES.max) {
    throw new RangeError(`A secret has ${String(WEBHOOK_SECRET_BYTES.min)} to ${String(WEBHOOK_SECRET_BYTES.max)} bytes, not ${String(bytes.length)}.`);
  }
  return `${WEBHOOK_SECRET_PREFIX}${toBase64(bytes)}`;
}

/** This function gives the body of an event in the form of the spec, with the time in ISO 8601. */
export function webhookBody<Data>(type: string, atMs: number, data: Data): string {
  const event: WebhookEvent<Data> = { type, timestamp: new Date(atMs).toISOString(), data };
  return JSON.stringify(event);
}

/** This function gives the signature `v1,<base64>` of a message with one key. The time is in whole seconds. */
export async function signWebhook(secret: WebhookSecret, id: string, timestampSeconds: number, body: string): Promise<string> {
  const key = await hmacKey(secret, "sign");
  const signature = await crypto.subtle.sign("HMAC", key, signedContent(id, timestampSeconds, body));
  return `v1,${toBase64(new Uint8Array(signature))}`;
}

/**
 * This function gives the POST of a message, with one signature for each secret. The order of the signatures is the
 * order of the secrets.
 *
 * @throws RangeError when no secret is given, or when the id holds a full stop or a space.
 */
export async function webhookRequest(message: WebhookMessage, secrets: readonly WebhookSecret[]): Promise<WebhookRequest> {
  if (secrets.length === 0) throw new RangeError("A signed message needs one secret or more.");
  // The signed content joins the parts with full stops, and the header of the signatures splits them at spaces.
  if (message.id.length === 0 || /[.\s]/u.test(message.id)) throw new RangeError("The id of a message is not empty, and it has no full stop and no space.");
  const seconds = Math.floor(message.timestampMs / 1000);
  const signatures = await Promise.all(secrets.map((secret) => signWebhook(secret, message.id, seconds, message.body)));
  return {
    url: message.url,
    method: "POST",
    headers: {
      ...message.headers,
      "content-type": "application/json",
      [WEBHOOK_HEADERS.id]: message.id,
      [WEBHOOK_HEADERS.timestamp]: String(seconds),
      [WEBHOOK_HEADERS.signature]: signatures.join(" "),
    },
    body: message.body,
    redirect: "manual",
  };
}

/** This function sorts the response of a send by the rules of the spec. `nowMs` reads a `Retry-After` header that is a date. */
export function extractWebhookSent(response: WebhookResponse, nowMs: number = Date.now()): WebhookSent | WebhookFailure {
  const { status } = response;
  if (status >= 200 && status < 300) return { ok: true, status };
  // A browser gives the status 0 for a redirect that the fetch did not follow.
  if (status === 0 || (status >= 300 && status < 400)) return { ok: false, kind: "redirect", status };
  if (status === 410) return { ok: false, kind: "gone", status };
  const wait = (): number => Math.max(retryAfterMs(response.headers?.get("retry-after"), nowMs) ?? 0, WEBHOOK_MIN_WAIT_MS);
  if (status === 429 || status === 502 || status === 504) return { ok: false, kind: "throttled", status, retryAfterMs: wait() };
  if (status >= 500 && status < 600) return { ok: false, kind: "server", status, retryAfterMs: wait() };
  return { ok: false, kind: "refused", status };
}

/**
 * This function signs a message, sends it once through the fetch, and sorts the response. When no answer comes in the
 * time limit (default `WEBHOOK_TIMEOUT_MS`), it gives a failure with a wait. It throws only the reason of `signal`.
 */
export async function sendWebhook(
  fetch: WebhookFetch,
  message: WebhookMessage,
  secrets: readonly WebhookSecret[],
  options: { readonly timeoutMs?: number; readonly signal?: AbortSignal | undefined; readonly now?: () => number } = {},
): Promise<WebhookSent | WebhookFailure> {
  const request = await webhookRequest(message, secrets);
  const now = options.now ?? Date.now;
  return callApi<WebhookSent, WebhookFailure>(
    fetch,
    request,
    (response) => extractWebhookSent(response, now()),
    { timeoutMs: options.timeoutMs ?? WEBHOOK_TIMEOUT_MS, signal: options.signal },
    (kind) => ({ ok: false, kind, retryAfterMs: WEBHOOK_MIN_WAIT_MS }),
  );
}

/**
 * This function checks a request that came in: the three headers, the time in the tolerance (default
 * `WEBHOOK_TOLERANCE_MS`), and one signature that matches one secret. The comparison of WebCrypto takes the same time for
 * each signature. The body is the text as it came, because a parse and a new text change the bytes.
 */
export async function verifyWebhook(
  incoming: WebhookIncoming,
  secrets: readonly WebhookSecret[],
  nowMs: number,
  toleranceMs: number = WEBHOOK_TOLERANCE_MS,
): Promise<WebhookCheck> {
  const id = incoming.headers.get(WEBHOOK_HEADERS.id);
  const stamp = incoming.headers.get(WEBHOOK_HEADERS.timestamp);
  const header = incoming.headers.get(WEBHOOK_HEADERS.signature);
  if (id === null || stamp === null || header === null || id.length === 0) return { ok: false, reason: "missing" };
  if (!/^\d{1,15}$/u.test(stamp)) return { ok: false, reason: "timestamp" };
  const timestampMs = Number(stamp) * 1000;
  if (timestampMs < nowMs - toleranceMs) return { ok: false, reason: "old" };
  if (timestampMs > nowMs + toleranceMs) return { ok: false, reason: "future" };
  const data = signedContent(id, Number(stamp), incoming.body);
  // Each part of the header is `<version>,<base64>`. A part of another version, or with bad base64, matches no key.
  const signatures = header
    .split(" ")
    .filter((part) => part.startsWith("v1,"))
    .map((part) => fromBase64(part.slice(3)))
    .filter((bytes): bytes is Uint8Array<ArrayBuffer> => bytes !== undefined);
  for (const secret of secrets) {
    const key = await hmacKey(secret, "verify");
    for (const signature of signatures) {
      if (await crypto.subtle.verify("HMAC", key, signature, data)) return { ok: true, id, timestampMs };
    }
  }
  return { ok: false, reason: "signature" };
}

// The text that the HMAC signs: the id, the time in seconds and the body, with full stops.
function signedContent(id: string, timestampSeconds: number, body: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${id}.${String(timestampSeconds)}.${body}`);
}

// The key of WebCrypto for one secret and one use.
function hmacKey(secret: WebhookSecret, use: "sign" | "verify"): ReturnType<typeof crypto.subtle.importKey> {
  return crypto.subtle.importKey("raw", secret.bytes, { name: "HMAC", hash: "SHA-256" }, false, [use]);
}

// The standard base64 of bytes, with padding.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// The bytes of a standard base64 text with padding, or undefined for another text.
function fromBase64(text: string): Uint8Array<ArrayBuffer> | undefined {
  if (text.length === 0 || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(text)) return undefined;
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
