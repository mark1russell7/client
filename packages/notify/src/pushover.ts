/**
 * Pushover (https://pushover.net) as pure functions. A request builder gives the URL, the method,
 * the headers and the body of one call. An extractor reads the HTTP status, the headers and the
 * body text of the response into a typed result. Neither function sends a request, so the caller
 * gives the fetch: `globalThis.fetch`, a polite client or a fake server of a test.
 *
 * This entry imports no Node built-in, so a browser can also use it.
 *
 * Each time in this file is in milliseconds. The builders change a time to the whole seconds of
 * Pushover, and the extractors change the seconds of Pushover to milliseconds.
 *
 * A request holds the API token of the application: in the body of a POST, or in the query of a
 * GET. Do not log a request or its URL.
 */

import { callApi } from "./call.js";

/** The base of the Pushover API. */
export const PUSHOVER_API = "https://api.pushover.net/1";

/** The limits of the Pushover API, in characters (Unicode code points). */
export const PUSHOVER_LIMITS: {
  readonly message: 1024;
  readonly title: 250;
  readonly url: 512;
  readonly urlTitle: 100;
  readonly device: 25;
  readonly users: 50;
} = { message: 1024, title: 250, url: 512, urlTitle: 100, device: 25, users: 50 };

/** The shortest time between two repeats of an emergency message: 30 seconds. */
export const PUSHOVER_RETRY_MIN_MS = 30_000;

/** The longest time that Pushover repeats an emergency message: 3 hours. */
export const PUSHOVER_EXPIRE_MAX_MS = 10_800_000;

/**
 * The shortest wait before a call goes again after a server error or no answer: 5 seconds. It is
 * also the shortest time between two reads of one receipt.
 */
export const PUSHOVER_MIN_WAIT_MS = 5_000;

/**
 * The priority of a message. `-2`: no notification. `-1`: no sound. `0`: normal. `1`: high, it
 * passes the quiet hours of the user. `2`: emergency, it repeats until the user acknowledges it.
 */
export type PushoverPriority = -2 | -1 | 0 | 1 | 2;

/** The repeats of an emergency message (priority 2). */
export interface PushoverEmergency {
  /** The time between two repeats: 30 seconds or more. Pushover sends 50 repeats at most. */
  readonly retryMs: number;
  /** The time after which the repeats stop: 3 hours or less. */
  readonly expireMs: number;
  /** An address on the internet that gets a POST when the user acknowledges the message. */
  readonly callback?: string | undefined;
  /** The tags of the receipt. `pushoverCancelByTagRequest` stops the repeats of each message with a tag. */
  readonly tags?: readonly string[] | undefined;
}

/** One message of the messages API. */
export interface PushoverMessage {
  /** The user key or the group key of the recipient, or up to 50 user keys with commas. */
  readonly user: string;
  readonly message: string;
  /** The title. Without a title, the device shows the name of the application. */
  readonly title?: string | undefined;
  /** An address that the notification opens. */
  readonly url?: string | undefined;
  readonly urlTitle?: string | undefined;
  /** The priority (default `0`). Priority `2` needs `emergency`. */
  readonly priority?: PushoverPriority | undefined;
  /** The repeats of an emergency message. Only priority `2` takes them. */
  readonly emergency?: PushoverEmergency | undefined;
  /** The name of a sound of Pushover, or of a custom sound of the user. */
  readonly sound?: string | undefined;
  /** The names of the devices of the user that get the message. Without names, each device gets it. */
  readonly devices?: readonly string[] | undefined;
  /** The time that the notification shows, in milliseconds since the Unix epoch. */
  readonly timestampMs?: number | undefined;
  /** The format of the text (default `text`). */
  readonly format?: "text" | "html" | "monospace" | undefined;
  /** The time after which the device deletes the message. Priority `2` ignores it. */
  readonly ttlMs?: number | undefined;
}

/** One call of the Pushover API. Its fields fit the `init` of `fetch`. */
export interface PushoverRequest {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  /** The form body of a POST. It holds the API token. */
  readonly body?: string;
}

/** The parts of an HTTP response that an extractor reads. A `Response` of `fetch` and its text fit it. */
export interface PushoverResponse {
  /** The HTTP status. */
  readonly status: number;
  /** The body text. */
  readonly text: string;
  /** The headers. Only `pushoverSendRequest` gives headers that the extractor reads. */
  readonly headers?: { get(name: string): string | null } | undefined;
}

/**
 * The kind of a failure.
 * - `network`: the request did not reach Pushover, or no answer came.
 * - `timeout`: no answer came in the time limit.
 * - `server`: Pushover had an error. The same request can go again after `retryAfterMs`.
 * - `rate-limited`: the account sent its messages of the month. Each request fails until `resetAt`.
 * - `auth`: Pushover refused the API token.
 * - `refused`: Pushover refused the input, for example a user key that it does not know. The same
 *   request fails again, and many refusals in a few minutes can block the address of the caller.
 */
export type PushoverFailureKind = "network" | "timeout" | "server" | "rate-limited" | "auth" | "refused";

/** A call that failed. An extractor does not throw: it gives a failure. */
export interface PushoverFailure {
  readonly ok: false;
  readonly kind: PushoverFailureKind;
  /** The HTTP status. It is `0` when no answer came. */
  readonly status: number;
  /** The errors that Pushover gives, or a description of the failure. */
  readonly errors: readonly string[];
  /** The id of the request, for the support of Pushover. */
  readonly request?: string;
  /** The shortest wait before the same request goes again. Only `server`, `network` and `timeout` have it. */
  readonly retryAfterMs?: number;
  /** The time of the reset of the monthly limit, in milliseconds since the epoch, when Pushover gives it. */
  readonly resetAt?: number;
}

/** The monthly limit of the application, from the headers of a send or from `pushoverLimitsRequest`. */
export interface PushoverLimits {
  readonly limit: number;
  readonly remaining: number;
  /** The time of the reset, in milliseconds since the epoch. */
  readonly resetAt: number;
}

/** A message that Pushover queued. */
export interface PushoverSent {
  readonly ok: true;
  readonly request: string;
  /** The receipt of an emergency message. Only priority `2` gives a receipt. */
  readonly receipt?: string;
  readonly limits?: PushoverLimits;
}

/** The state of the receipt of an emergency message. */
export interface PushoverReceipt {
  readonly ok: true;
  readonly acknowledged: boolean;
  /** The time of the acknowledgment, in milliseconds since the epoch. */
  readonly acknowledgedAt?: number;
  /** The user key of the first user that acknowledged. */
  readonly acknowledgedBy?: string;
  /** The device of the first user that acknowledged. */
  readonly acknowledgedByDevice?: string;
  /** The time of the last repeat. */
  readonly lastDeliveredAt?: number;
  /** True when the repeats stopped at their expiry. */
  readonly expired: boolean;
  /** The time at which the repeats stop. */
  readonly expiresAt: number;
  readonly calledBack: boolean;
  readonly calledBackAt?: number;
}

/** A cancel that Pushover accepted. */
export interface PushoverCancelled {
  readonly ok: true;
  readonly request?: string;
  /** The count of messages that a cancel by tag stopped, when Pushover gives it. */
  readonly cancelled?: number;
}

/** A user key that Pushover knows. */
export interface PushoverValidated {
  readonly ok: true;
  /** True for the key of a group. */
  readonly group: boolean;
  /** The names of the active devices. */
  readonly devices: readonly string[];
  /** The platforms of the licenses of the user, for example `iOS`. */
  readonly licenses: readonly string[];
}

/** The monthly limit, from `pushoverLimitsRequest`. */
export interface PushoverLimitsRead {
  readonly ok: true;
  readonly limits: PushoverLimits;
}

/** The acknowledgment that Pushover sends to the `callback` address of an emergency message. */
export interface PushoverCallback {
  readonly receipt: string;
  readonly acknowledgedAt: number;
  readonly acknowledgedBy?: string;
  readonly acknowledgedByDevice?: string;
}

// =============================================================================
// Request builders
// =============================================================================

/** The form of an API token, a user key, a group key and a receipt: 30 letters and digits. */
export const PUSHOVER_KEY: RegExp = /^[A-Za-z0-9]{30}$/;
const KEY = PUSHOVER_KEY;
const DEVICE = /^[A-Za-z0-9_-]{1,25}$/;
const FORM = "application/x-www-form-urlencoded";

const chars = (value: string): number => [...value].length;

function assertKey(value: string, what: string): void {
  if (!KEY.test(value)) throw new Error(`The ${what} is not 30 letters and digits.`);
}

function assertMax(text: string | undefined, max: number, what: string): void {
  if (text !== undefined && chars(text) > max) throw new Error(`The ${what} has more than ${max} characters.`);
}

function assertTag(tag: string): void {
  if (tag === "" || tag.includes(",")) throw new Error(`The tag "${tag}" is empty or has a comma.`);
}

const seconds = (ms: number, round: (value: number) => number): string => String(round(ms / 1000));

function post(path: string, fields: Record<string, string>): PushoverRequest {
  return { url: `${PUSHOVER_API}${path}`, method: "POST", headers: { "content-type": FORM, accept: "application/json" }, body: new URLSearchParams(fields).toString() };
}

function get(path: string, token: string): PushoverRequest {
  return { url: `${PUSHOVER_API}${path}?${new URLSearchParams({ token }).toString()}`, method: "GET", headers: { accept: "application/json" } };
}

/**
 * This function gives the request that sends one message. It throws an error when the input
 * breaks a rule of the API. Pushover refuses such a request, and many refusals can block the
 * address of the caller.
 */
export function pushoverSendRequest(token: string, message: PushoverMessage): PushoverRequest {
  assertKey(token, "API token");
  const users = message.user.split(",");
  if (users.length > PUSHOVER_LIMITS.users) throw new Error(`A message goes to ${PUSHOVER_LIMITS.users} users at most.`);
  for (const user of users) assertKey(user, "user key");
  if (message.message.trim() === "") throw new Error("The message is empty.");
  assertMax(message.message, PUSHOVER_LIMITS.message, "message");
  assertMax(message.title, PUSHOVER_LIMITS.title, "title");
  assertMax(message.url, PUSHOVER_LIMITS.url, "URL");
  assertMax(message.urlTitle, PUSHOVER_LIMITS.urlTitle, "URL title");
  const priority = message.priority ?? 0;
  if (![-2, -1, 0, 1, 2].includes(priority)) throw new Error(`${String(priority)} is not a priority of Pushover.`);
  const fields: Record<string, string> = { token, user: message.user, message: message.message };
  if (message.title !== undefined) fields["title"] = message.title;
  if (message.url !== undefined) fields["url"] = message.url;
  if (message.urlTitle !== undefined) fields["url_title"] = message.urlTitle;
  if (priority !== 0) fields["priority"] = String(priority);
  const emergency = message.emergency;
  if (priority === 2) {
    if (emergency === undefined) throw new Error("Priority 2 needs the emergency repeats: retryMs and expireMs.");
    if (!(emergency.retryMs >= PUSHOVER_RETRY_MIN_MS)) throw new Error("The time between two repeats is less than 30 seconds.");
    if (!(emergency.expireMs > 0 && emergency.expireMs <= PUSHOVER_EXPIRE_MAX_MS)) throw new Error("The repeats do not stop in 3 hours or less.");
    fields["retry"] = seconds(emergency.retryMs, Math.ceil);
    fields["expire"] = seconds(emergency.expireMs, Math.floor);
    if (emergency.callback !== undefined) {
      if (!/^https?:\/\//.test(emergency.callback)) throw new Error("The callback is not an http or https address.");
      fields["callback"] = emergency.callback;
    }
    if (emergency.tags !== undefined && emergency.tags.length > 0) {
      emergency.tags.forEach(assertTag);
      fields["tags"] = emergency.tags.join(",");
    }
  } else if (emergency !== undefined) {
    throw new Error("Only priority 2 takes the emergency repeats.");
  }
  if (message.sound !== undefined) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(message.sound)) throw new Error(`"${message.sound}" is not the name of a sound.`);
    fields["sound"] = message.sound;
  }
  if (message.devices !== undefined && message.devices.length > 0) {
    for (const device of message.devices) if (!DEVICE.test(device)) throw new Error(`"${device}" is not the name of a device.`);
    fields["device"] = message.devices.join(",");
  }
  if (message.timestampMs !== undefined) fields["timestamp"] = seconds(message.timestampMs, Math.floor);
  if (message.format === "html") fields["html"] = "1";
  if (message.format === "monospace") fields["monospace"] = "1";
  if (message.ttlMs !== undefined && priority !== 2) {
    if (!(message.ttlMs >= 1000)) throw new Error("The time to live is less than 1 second.");
    fields["ttl"] = seconds(message.ttlMs, Math.floor);
  }
  return post("/messages.json", fields);
}

/**
 * This function gives the request that reads the receipt of an emergency message. Read one receipt
 * at most once in 5 seconds (`PUSHOVER_MIN_WAIT_MS`). Pushover keeps a receipt for one week.
 */
export function pushoverReceiptRequest(token: string, receipt: string): PushoverRequest {
  assertKey(token, "API token");
  assertKey(receipt, "receipt");
  return get(`/receipts/${receipt}.json`, token);
}

/** This function gives the request that stops the repeats of one emergency message. A second cancel has no effect. */
export function pushoverCancelRequest(token: string, receipt: string): PushoverRequest {
  assertKey(token, "API token");
  assertKey(receipt, "receipt");
  return post(`/receipts/${receipt}/cancel.json`, { token });
}

/**
 * This function gives the request that stops the repeats of each emergency message of the
 * application with the tag. A copy of a system that did not send the message can stop it.
 */
export function pushoverCancelByTagRequest(token: string, tag: string): PushoverRequest {
  assertKey(token, "API token");
  assertTag(tag);
  return post(`/receipts/cancel_by_tag/${encodeURIComponent(tag)}.json`, { token });
}

/** This function gives the request that examines a user key, and one device of the user when `device` names it. */
export function pushoverValidateRequest(token: string, user: string, device?: string): PushoverRequest {
  assertKey(token, "API token");
  assertKey(user, "user key");
  if (device !== undefined && !DEVICE.test(device)) throw new Error(`"${device}" is not the name of a device.`);
  return post("/users/validate.json", device === undefined ? { token, user } : { token, user, device });
}

/** This function gives the request that reads the monthly limit of the application. */
export function pushoverLimitsRequest(token: string): PushoverRequest {
  assertKey(token, "API token");
  return get("/apps/limits.json", token);
}

// =============================================================================
// Extractors
// =============================================================================

type Body = Readonly<Record<string, unknown>>;

function parse(text: string): Body | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Body) : undefined;
  } catch {
    return undefined;
  }
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);
const count = (value: unknown): number | undefined => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined);
/** Pushover gives `0` for a time that did not occur. */
const instant = (value: unknown): number | undefined => {
  const at = count(value);
  return at === undefined || at === 0 ? undefined : at * 1000;
};
const flag = (value: unknown): boolean => value === 1 || value === true;
/** This function gives `{ [key]: value }`, or an empty object when the value is undefined. */
const some = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } => (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };

function headerNumber(response: PushoverResponse, name: string): number | undefined {
  const value = response.headers?.get(name);
  return value === null || value === undefined || !/^\d+$/.test(value.trim()) ? undefined : Number(value.trim());
}

function limitsOf(response: PushoverResponse): PushoverLimits | undefined {
  const limit = headerNumber(response, "x-limit-app-limit");
  const remaining = headerNumber(response, "x-limit-app-remaining");
  const reset = headerNumber(response, "x-limit-app-reset");
  return limit === undefined || remaining === undefined || reset === undefined ? undefined : { limit, remaining, resetAt: reset * 1000 };
}

function errorsOf(body: Body | undefined, fallback: string): string[] {
  const errors = body?.["errors"];
  const list = Array.isArray(errors) ? errors.filter((error): error is string => typeof error === "string") : [];
  return list.length > 0 ? list : [fallback];
}

function failure(kind: PushoverFailureKind, response: PushoverResponse, body: Body | undefined, fallback: string): PushoverFailure {
  const request = text(body?.["request"]);
  const reset = kind === "rate-limited" ? limitsOf(response)?.resetAt : undefined;
  return {
    ok: false,
    kind,
    status: response.status,
    errors: errorsOf(body, fallback),
    ...some("request", request),
    ...some("retryAfterMs", kind === "server" ? PUSHOVER_MIN_WAIT_MS : undefined),
    ...some("resetAt", reset),
  };
}

/**
 * This function sorts a response. It gives the body of a success, or a failure. Pushover has
 * accepted a call only for an HTTP status 2xx with `status: 1` in the body.
 */
function sort(response: PushoverResponse): { readonly ok: true; readonly body: Body } | PushoverFailure {
  const body = parse(response.text);
  const status = response.status;
  if (status === 429) return failure("rate-limited", response, body, "The application sent its messages of the month.");
  if (status === 401 || status === 403 || body?.["token"] === "invalid") return failure("auth", response, body, "Pushover refused the API token.");
  if (status >= 400 && status < 500) return failure("refused", response, body, `Pushover refused the request with HTTP ${status}.`);
  if (status < 200 || status >= 300) return failure("server", response, body, `Pushover gave HTTP ${status}.`);
  // A 2xx answer that is not JSON tells nothing. Thus the same request can go again.
  if (body === undefined) return failure("server", response, body, "The answer of Pushover is not a JSON object.");
  if (body["status"] !== 1) return failure("refused", response, body, "Pushover did not accept the request.");
  return { ok: true, body };
}

/** This function reads the response of `pushoverSendRequest`. It does not throw. */
export function extractPushoverSent(response: PushoverResponse): PushoverSent | PushoverFailure {
  const sorted = sort(response);
  if (!sorted.ok) return sorted;
  const request = text(sorted.body["request"]);
  if (request === undefined) return failure("server", response, sorted.body, "The answer of Pushover has no request id.");
  const receipt = text(sorted.body["receipt"]);
  const limits = limitsOf(response);
  return { ok: true, request, ...some("receipt", receipt), ...some("limits", limits) };
}

/** This function reads the response of `pushoverReceiptRequest`. It does not throw. */
export function extractPushoverReceipt(response: PushoverResponse): PushoverReceipt | PushoverFailure {
  const sorted = sort(response);
  if (!sorted.ok) return sorted;
  const body = sorted.body;
  const expiresAt = instant(body["expires_at"]);
  if (expiresAt === undefined) return failure("server", response, body, "The receipt has no expiry time.");
  return {
    ok: true,
    acknowledged: flag(body["acknowledged"]),
    ...some("acknowledgedAt", instant(body["acknowledged_at"])),
    ...some("acknowledgedBy", text(body["acknowledged_by"])),
    ...some("acknowledgedByDevice", text(body["acknowledged_by_device"])),
    ...some("lastDeliveredAt", instant(body["last_delivered_at"])),
    expired: flag(body["expired"]),
    expiresAt,
    calledBack: flag(body["called_back"]),
    ...some("calledBackAt", instant(body["called_back_at"])),
  };
}

/** This function reads the response of `pushoverCancelRequest` or `pushoverCancelByTagRequest`. It does not throw. */
export function extractPushoverCancelled(response: PushoverResponse): PushoverCancelled | PushoverFailure {
  const sorted = sort(response);
  if (!sorted.ok) return sorted;
  const request = text(sorted.body["request"]);
  const cancelled = count(sorted.body["canceled"]);
  return { ok: true, ...some("request", request), ...some("cancelled", cancelled) };
}

/** This function reads the response of `pushoverValidateRequest`. A user key that Pushover does not know is a `refused` failure. */
export function extractPushoverValidated(response: PushoverResponse): PushoverValidated | PushoverFailure {
  const sorted = sort(response);
  if (!sorted.ok) return sorted;
  const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  return { ok: true, group: flag(sorted.body["group"]), devices: strings(sorted.body["devices"]), licenses: strings(sorted.body["licenses"]) };
}

/** This function reads the response of `pushoverLimitsRequest`. It does not throw. */
export function extractPushoverLimits(response: PushoverResponse): PushoverLimitsRead | PushoverFailure {
  const sorted = sort(response);
  if (!sorted.ok) return sorted;
  const limit = count(sorted.body["limit"]);
  const remaining = count(sorted.body["remaining"]);
  const reset = count(sorted.body["reset"]);
  if (limit === undefined || remaining === undefined || reset === undefined) return failure("server", response, sorted.body, "The answer has no limit, remaining or reset.");
  return { ok: true, limits: { limit, remaining, resetAt: reset * 1000 } };
}

/**
 * This function reads the form body that Pushover posts to the `callback` address when a user
 * acknowledges an emergency message. It gives `undefined` for another body. Pushover sends the post
 * again each minute until the address answers 2xx.
 */
export function extractPushoverCallback(body: string): PushoverCallback | undefined {
  const form = new URLSearchParams(body);
  const receipt = form.get("receipt") ?? "";
  const at = form.get("acknowledged_at") ?? "";
  if (!KEY.test(receipt) || form.get("acknowledged") !== "1" || !/^\d+$/.test(at) || at === "0") return undefined;
  return {
    receipt,
    acknowledgedAt: Number(at) * 1000,
    ...some("acknowledgedBy", text(form.get("acknowledged_by"))),
    ...some("acknowledgedByDevice", text(form.get("acknowledged_by_device"))),
  };
}

// =============================================================================
// The call
// =============================================================================

/** The part of `fetch` that `callPushover` uses. `globalThis.fetch` fits this type. */
export type PushoverFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
) => Promise<{ readonly status: number; text(): Promise<string>; readonly headers: { get(name: string): string | null } }>;

/**
 * This function sends one request through the fetch and reads the response with the extractor. It
 * does not throw for a failure of the network or a time limit: it gives a failure of the kind
 * `network` or `timeout`. It throws only the reason of `signal`, when the caller aborts. It does not
 * send a request again: the caller keeps the pace and the retries.
 */
export async function callPushover<Result>(
  fetch: PushoverFetch,
  request: PushoverRequest,
  extract: (response: PushoverResponse) => Result | PushoverFailure,
  options: { readonly timeoutMs: number; readonly signal?: AbortSignal | undefined },
): Promise<Result | PushoverFailure> {
  return callApi<Result, PushoverFailure>(fetch, request, extract, options, (kind) => ({
    ok: false,
    kind,
    status: 0,
    errors: [kind === "timeout" ? `Pushover did not answer in ${options.timeoutMs} ms.` : "The request did not reach Pushover."],
    retryAfterMs: PUSHOVER_MIN_WAIT_MS,
  }));
}
