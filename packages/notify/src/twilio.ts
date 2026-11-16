/**
 * Twilio (https://www.twilio.com) text messages and voice calls as pure functions. A request builder
 * gives the URL, the method, the headers and the body of one call. An extractor reads the HTTP status,
 * the headers and the body text of the response into a typed result. Neither function sends a
 * request, so the caller gives the fetch: `globalThis.fetch`, a polite client or a fake server of a test.
 *
 * This entry imports no Node built-in, so a browser can also use it.
 *
 * Each time in this file is in milliseconds. The builders change a time to the whole seconds of
 * Twilio, and the extractors change the seconds and the dates of Twilio to milliseconds.
 *
 * A request holds the credentials in its `authorization` header. Do not log a request or its headers.
 */

import { escapeHtml } from "@mark1russell7/text";
import { callApi, type ApiFetch } from "./call.js";

/** The base of the Twilio REST API. */
export const TWILIO_API = "https://api.twilio.com/2010-04-01";

/** The limits of the Twilio API, in characters. */
export const TWILIO_LIMITS: { readonly body: 1600; readonly twiml: 4000 } = { body: 1600, twiml: 4000 };

/** The longest time that a queued text waits for its send: 10 hours. After it, Twilio does not send the text. */
export const TWILIO_VALIDITY_MAX_MS = 36_000_000;

/** The longest time that a call rings before Twilio gives it as not answered: 600 seconds. */
export const TWILIO_RING_MAX_MS = 600_000;

/**
 * The wait before a call goes again after a server error, a refusal of the concurrency limit or no
 * answer: 5 seconds. A `Retry-After` header of Twilio replaces it.
 */
export const TWILIO_MIN_WAIT_MS = 5_000;

/** The form of an account SID: `AC` and 32 hexadecimal digits. */
export const TWILIO_ACCOUNT_SID: RegExp = /^AC[0-9a-fA-F]{32}$/;

/**
 * The credentials of one Twilio account. Without `keySid`, `secret` is the auth token of the account.
 * With `keySid` (an API key, `SK` and 32 hexadecimal digits), `secret` is the secret of the key.
 */
export interface TwilioCredentials {
  readonly accountSid: string;
  readonly keySid?: string | undefined;
  readonly secret: string;
}

/** One text message (SMS). */
export interface TwilioText {
  /** The phone number of the recipient in E.164 form: a plus sign, the country code and the number. */
  readonly to: string;
  /** The Twilio number that sends the text, in E.164 form. A text needs `from` or `messagingServiceSid`. */
  readonly from?: string | undefined;
  /** The messaging service (`MG` and 32 hexadecimal digits) that picks the sender. */
  readonly messagingServiceSid?: string | undefined;
  /** The text: 1600 characters at most. A long text goes as more than one segment, and each segment costs. */
  readonly body: string;
  /** The longest time that the text waits in the queue of Twilio: 1 second to 10 hours. */
  readonly validityMs?: number | undefined;
  /** An address on the internet that gets a POST at each change of the status. */
  readonly statusCallback?: string | undefined;
}

/** One voice call. */
export interface TwilioCall {
  /** The phone number to call, in E.164 form. */
  readonly to: string;
  /** The Twilio number or the verified caller id that calls, in E.164 form. */
  readonly from: string;
  /** The TwiML of the call, for example from `twilioSayTwiml`. A call needs `twiml` or `url`. */
  readonly twiml?: string | undefined;
  /** An address that gives the TwiML when the call connects. */
  readonly url?: string | undefined;
  /** The time that the call rings before it is not answered: 1 to 600 seconds. Twilio uses 60 seconds without it. */
  readonly ringMs?: number | undefined;
  /**
   * The answering machine detection. With it, the call tells a person from a machine (`answeredBy`).
   * `Enable` decides at the start. `DetectMessageEnd` waits for the end of the greeting of a machine.
   */
  readonly machineDetection?: "Enable" | "DetectMessageEnd" | undefined;
  /** The longest time of the call after it connects. */
  readonly limitMs?: number | undefined;
  /** An address on the internet that gets a POST when the call ends. */
  readonly statusCallback?: string | undefined;
}

/** One call of the Twilio API. Its fields fit the `init` of `fetch`. */
export interface TwilioRequest {
  readonly url: string;
  readonly method: "GET" | "POST";
  /** The headers. They hold the credentials. */
  readonly headers: Readonly<Record<string, string>>;
  /** The form body of a POST. */
  readonly body?: string;
}

/** The parts of an HTTP response that an extractor reads. A `Response` of `fetch` and its text fit it. */
export interface TwilioResponse {
  readonly status: number;
  readonly text: string;
  /** The headers. The extractors read only `Retry-After`. */
  readonly headers?: { get(name: string): string | null } | undefined;
}

/**
 * The kind of a failure.
 * - `network`: the request did not reach Twilio, or no answer came.
 * - `timeout`: no answer came in the time limit.
 * - `server`: Twilio had an error. The same request can go again after `retryAfterMs`.
 * - `rate-limited`: the account has too many requests at the same time. The request can go again after `retryAfterMs`.
 * - `auth`: Twilio refused the credentials, or the account cannot do the request.
 * - `refused`: Twilio refused the input, for example a number that cannot get texts. The same request fails again.
 */
export type TwilioFailureKind = "network" | "timeout" | "server" | "rate-limited" | "auth" | "refused";

/** A call that failed. An extractor does not throw: it gives a failure. */
export interface TwilioFailure {
  readonly ok: false;
  readonly kind: TwilioFailureKind;
  /** The HTTP status. It is `0` when no answer came. */
  readonly status: number;
  /** The message of Twilio, or a description of the failure. */
  readonly errors: readonly string[];
  /** The error code of Twilio, for example `21211` for a number that is not valid. */
  readonly code?: number;
  /** The shortest wait before the same request goes again. Only `server`, `rate-limited`, `network` and `timeout` have it. */
  readonly retryAfterMs?: number;
}

/**
 * The state of a text, from its status.
 * - `pending`: the text is in the queue, or a carrier has it. Unknown statuses are also `pending`.
 * - `delivered`: the carrier or the phone confirmed the delivery, or the recipient read the text.
 * - `failed`: the text did not go, or the carrier did not deliver it, or a person cancelled it.
 */
export type TwilioTextState = "pending" | "delivered" | "failed";

/** A text: the answer of a send or of a read of its status. */
export interface TwilioTextRead {
  readonly ok: true;
  /** The SID of the text: `SM` or `MM` and 32 hexadecimal digits. */
  readonly sid: string;
  /** The status of Twilio, for example `queued`, `sent` or `undelivered`. */
  readonly status: string;
  readonly state: TwilioTextState;
  /** The error code of a failed or undelivered text. */
  readonly errorCode?: number;
  readonly errorMessage?: string;
  /** The count of segments. Twilio gives `0` until it picks a sender. */
  readonly segments?: number;
  readonly createdAt?: number;
  readonly sentAt?: number;
  readonly updatedAt?: number;
}

/**
 * The state of a call, from its status and `answeredBy`.
 * - `pending`: the call is in the queue, or it rings.
 * - `connected`: someone answered, and the call cannot tell a person from a machine.
 * - `answered`: a person answered.
 * - `machine`: a machine or a fax answered.
 * - `unanswered`: the line was busy, nobody answered, or a request cancelled the call before an answer.
 * - `failed`: Twilio could not make the call.
 */
export type TwilioCallState = "pending" | "connected" | "answered" | "machine" | "unanswered" | "failed";

/** A call: the answer of a call, of a read of its status or of its end. */
export interface TwilioCallRead {
  readonly ok: true;
  /** The SID of the call: `CA` and 32 hexadecimal digits. */
  readonly sid: string;
  /** The status of Twilio, for example `ringing`, `in-progress` or `no-answer`. */
  readonly status: string;
  readonly state: TwilioCallState;
  /** True when the call ended: its status does not change again. */
  readonly ended: boolean;
  /** Who answered, when the call has answering machine detection: `human`, `machine_start`, `fax` or `unknown`. */
  readonly answeredBy?: string;
  /** The time that the call was connected. */
  readonly durationMs?: number;
  readonly startedAt?: number;
  readonly endedAt?: number;
}

// =============================================================================
// Request builders
// =============================================================================

const KEY_SID = /^SK[0-9a-fA-F]{32}$/;
const SERVICE_SID = /^MG[0-9a-fA-F]{32}$/;
const TEXT_SID = /^(SM|MM)[0-9a-fA-F]{32}$/;
const CALL_SID = /^CA[0-9a-fA-F]{32}$/;
const PHONE = /^\+[1-9][0-9]{1,14}$/;
const SECRET = /^[\x21-\x7e]+$/;
const FORM = "application/x-www-form-urlencoded";

function assertCredentials(credentials: TwilioCredentials): void {
  if (!TWILIO_ACCOUNT_SID.test(credentials.accountSid)) throw new Error("The account SID is not AC and 32 hexadecimal digits.");
  if (credentials.keySid !== undefined && !KEY_SID.test(credentials.keySid)) throw new Error("The API key SID is not SK and 32 hexadecimal digits.");
  if (!SECRET.test(credentials.secret)) throw new Error("The secret is empty, or it has a character that is not visible ASCII.");
}

function assertPhone(value: string, what: string): void {
  if (!PHONE.test(value)) throw new Error(`The ${what} is not a phone number in E.164 form.`);
}

function assertAddress(value: string, what: string): void {
  if (!/^https?:\/\/[^\s/]+/.test(value)) throw new Error(`The ${what} is not an http or https address.`);
}

/** This function gives the whole seconds of a time in a range, or it throws. */
function seconds(ms: number, min: number, max: number, what: string): string {
  const value = Math.floor(ms / 1000);
  if (!(value >= min && value <= max)) throw new Error(`The ${what} is not ${min} to ${max} seconds.`);
  return String(value);
}

function headers(credentials: TwilioCredentials, form: boolean): Record<string, string> {
  const user = credentials.keySid ?? credentials.accountSid;
  return { authorization: `Basic ${btoa(`${user}:${credentials.secret}`)}`, accept: "application/json", ...(form ? { "content-type": FORM } : {}) };
}

function account(credentials: TwilioCredentials, path: string): string {
  return `${TWILIO_API}/Accounts/${credentials.accountSid}${path}`;
}

function post(credentials: TwilioCredentials, path: string, fields: Record<string, string>): TwilioRequest {
  assertCredentials(credentials);
  return { url: account(credentials, path), method: "POST", headers: headers(credentials, true), body: new URLSearchParams(fields).toString() };
}

function get(credentials: TwilioCredentials, path: string): TwilioRequest {
  assertCredentials(credentials);
  return { url: account(credentials, path), method: "GET", headers: headers(credentials, false) };
}

/**
 * This function gives the request that sends one text. It throws an error when the input breaks a
 * rule of the API. Twilio refuses such a request.
 */
export function twilioTextRequest(credentials: TwilioCredentials, text: TwilioText): TwilioRequest {
  assertPhone(text.to, "recipient");
  if ((text.from === undefined) === (text.messagingServiceSid === undefined)) throw new Error("A text needs exactly one of from and messagingServiceSid.");
  if (text.from !== undefined) assertPhone(text.from, "sender");
  if (text.messagingServiceSid !== undefined && !SERVICE_SID.test(text.messagingServiceSid)) throw new Error("The messaging service SID is not MG and 32 hexadecimal digits.");
  if (text.body.trim() === "") throw new Error("The text is empty.");
  if (text.body.length > TWILIO_LIMITS.body) throw new Error(`The text has more than ${TWILIO_LIMITS.body} characters.`);
  const fields: Record<string, string> = { To: text.to, Body: text.body };
  if (text.from !== undefined) fields["From"] = text.from;
  if (text.messagingServiceSid !== undefined) fields["MessagingServiceSid"] = text.messagingServiceSid;
  if (text.validityMs !== undefined) fields["ValidityPeriod"] = seconds(text.validityMs, 1, TWILIO_VALIDITY_MAX_MS / 1000, "validity");
  if (text.statusCallback !== undefined) {
    assertAddress(text.statusCallback, "status callback");
    fields["StatusCallback"] = text.statusCallback;
  }
  return post(credentials, "/Messages.json", fields);
}

/**
 * This function gives the request that starts one call. It throws an error when the input breaks a
 * rule of the API. Twilio refuses such a request.
 */
export function twilioCallRequest(credentials: TwilioCredentials, call: TwilioCall): TwilioRequest {
  assertPhone(call.to, "number to call");
  assertPhone(call.from, "caller");
  if ((call.twiml === undefined) === (call.url === undefined)) throw new Error("A call needs exactly one of twiml and url.");
  const fields: Record<string, string> = { To: call.to, From: call.from };
  if (call.twiml !== undefined) {
    if (call.twiml.length > TWILIO_LIMITS.twiml) throw new Error(`The TwiML has more than ${TWILIO_LIMITS.twiml} characters.`);
    fields["Twiml"] = call.twiml;
  }
  if (call.url !== undefined) {
    assertAddress(call.url, "TwiML address");
    fields["Url"] = call.url;
  }
  if (call.ringMs !== undefined) fields["Timeout"] = seconds(call.ringMs, 1, TWILIO_RING_MAX_MS / 1000, "ring time");
  if (call.machineDetection !== undefined) {
    if (call.machineDetection !== "Enable" && call.machineDetection !== "DetectMessageEnd") throw new Error(`${String(call.machineDetection)} is not a mode of the machine detection.`);
    fields["MachineDetection"] = call.machineDetection;
  }
  if (call.limitMs !== undefined) fields["TimeLimit"] = seconds(call.limitMs, 1, 14_400, "time limit");
  if (call.statusCallback !== undefined) {
    assertAddress(call.statusCallback, "status callback");
    fields["StatusCallback"] = call.statusCallback;
  }
  return post(credentials, "/Calls.json", fields);
}

/** This function gives the request that reads the status of one text. */
export function twilioTextStatusRequest(credentials: TwilioCredentials, sid: string): TwilioRequest {
  if (!TEXT_SID.test(sid)) throw new Error("The text SID is not SM or MM and 32 hexadecimal digits.");
  return get(credentials, `/Messages/${sid}.json`);
}

/** This function gives the request that reads the status of one call. */
export function twilioCallStatusRequest(credentials: TwilioCredentials, sid: string): TwilioRequest {
  if (!CALL_SID.test(sid)) throw new Error("The call SID is not CA and 32 hexadecimal digits.");
  return get(credentials, `/Calls/${sid}.json`);
}

/**
 * This function gives the request that ends one call. `completed` (the default) ends the call in each
 * state. `canceled` ends only a call in the queue or a call that rings: a call in progress continues.
 */
export function twilioEndCallRequest(credentials: TwilioCredentials, sid: string, end: "completed" | "canceled" = "completed"): TwilioRequest {
  if (!CALL_SID.test(sid)) throw new Error("The call SID is not CA and 32 hexadecimal digits.");
  if (end !== "completed" && end !== "canceled") throw new Error(`${String(end)} is not an end of a call.`);
  return post(credentials, `/Calls/${sid}.json`, { Status: end });
}

/** The characters that XML 1.0 does not permit, other than the tab, the line feed and the carriage return. */
const NOT_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

/**
 * This function gives the TwiML that says a text, `repeats` times (1 to 10) with a pause of one second
 * between two repeats. It escapes the text, and it changes each character that XML does not permit to
 * a space. It throws an error when the TwiML has more than 4000 characters.
 */
export function twilioSayTwiml(text: string, repeats = 1): string {
  if (text.trim() === "") throw new Error("The text to say is empty.");
  if (!(Number.isInteger(repeats) && repeats >= 1 && repeats <= 10)) throw new Error("The count of repeats is not 1 to 10.");
  const say = `<Say>${escapeHtml(text.replace(NOT_XML, " "))}</Say>`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>${Array.from({ length: repeats }, () => say).join('<Pause length="1"/>')}</Response>`;
  if (twiml.length > TWILIO_LIMITS.twiml) throw new Error(`The TwiML has more than ${TWILIO_LIMITS.twiml} characters.`);
  return twiml;
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
const integer = (value: unknown): number | undefined => (typeof value === "number" && Number.isInteger(value) ? value : undefined);
/** Twilio gives some counts as decimal text, for example `num_segments` and `duration`. */
const countText = (value: unknown): number | undefined => (typeof value === "string" && /^\d+$/.test(value) ? Number(value) : integer(value));
/** Twilio gives each date in the form of RFC 2822, in GMT. */
const date = (value: unknown): number | undefined => {
  const at = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(at) ? at : undefined;
};
/** This function gives `{ [key]: value }`, or an empty object when the value is undefined. */
const some = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } => (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };

function retryAfter(response: TwilioResponse): number {
  const value = response.headers?.get("retry-after")?.trim();
  return value !== undefined && /^\d+$/.test(value) ? Math.max(Number(value) * 1000, TWILIO_MIN_WAIT_MS) : TWILIO_MIN_WAIT_MS;
}

function failure(kind: TwilioFailureKind, response: TwilioResponse, body: Body | undefined, fallback: string): TwilioFailure {
  const waits = kind === "server" || kind === "rate-limited";
  return {
    ok: false,
    kind,
    status: response.status,
    errors: [text(body?.["message"]) ?? fallback],
    ...some("code", integer(body?.["code"])),
    ...some("retryAfterMs", waits ? retryAfter(response) : undefined),
  };
}

/** This function sorts a response. It gives the body of a success, or a failure. Twilio accepted a call only for an HTTP status 2xx with a JSON object. */
function sort(response: TwilioResponse): { readonly ok: true; readonly body: Body } | TwilioFailure {
  const body = parse(response.text);
  const status = response.status;
  if (status === 429) return failure("rate-limited", response, body, "Twilio refused the request: too many requests at the same time.");
  if (status === 401 || status === 403) return failure("auth", response, body, `Twilio refused the credentials with HTTP ${status}.`);
  if (status >= 400 && status < 500) return failure("refused", response, body, `Twilio refused the request with HTTP ${status}.`);
  if (status < 200 || status >= 300) return failure("server", response, body, `Twilio gave HTTP ${status}.`);
  if (body === undefined) return failure("server", response, body, "The answer of Twilio is not a JSON object.");
  return { ok: true, body };
}

/** This function gives the state of a text from its status. */
export function twilioTextState(status: string): TwilioTextState {
  if (status === "delivered" || status === "read") return "delivered";
  if (status === "failed" || status === "undelivered" || status === "canceled") return "failed";
  return "pending";
}

const ENDED = new Set(["completed", "busy", "no-answer", "canceled", "failed"]);

/** This function gives the state of a call from its status and from `answeredBy`. */
export function twilioCallState(status: string, answeredBy?: string): TwilioCallState {
  if (status === "failed") return "failed";
  if (status === "busy" || status === "no-answer" || status === "canceled") return "unanswered";
  if (status !== "in-progress" && status !== "completed") return "pending";
  if (answeredBy === "human") return "answered";
  if (answeredBy !== undefined && (answeredBy.startsWith("machine") || answeredBy === "fax")) return "machine";
  return "connected";
}

/** This function reads the response of `twilioTextRequest` or `twilioTextStatusRequest`. It does not throw. */
export function extractTwilioText(response: TwilioResponse): TwilioTextRead | TwilioFailure {
  const sorted = sort(response);
  if (!sorted.ok) return sorted;
  const body = sorted.body;
  const sid = text(body["sid"]);
  const status = text(body["status"]);
  if (sid === undefined || !TEXT_SID.test(sid) || status === undefined) return failure("server", response, undefined, "The answer of Twilio has no text SID or no status.");
  return {
    ok: true,
    sid,
    status,
    state: twilioTextState(status),
    ...some("errorCode", integer(body["error_code"])),
    ...some("errorMessage", text(body["error_message"])),
    ...some("segments", countText(body["num_segments"])),
    ...some("createdAt", date(body["date_created"])),
    ...some("sentAt", date(body["date_sent"])),
    ...some("updatedAt", date(body["date_updated"])),
  };
}

/** This function reads the response of `twilioCallRequest`, `twilioCallStatusRequest` or `twilioEndCallRequest`. It does not throw. */
export function extractTwilioCall(response: TwilioResponse): TwilioCallRead | TwilioFailure {
  const sorted = sort(response);
  if (!sorted.ok) return sorted;
  const body = sorted.body;
  const sid = text(body["sid"]);
  const status = text(body["status"]);
  if (sid === undefined || !CALL_SID.test(sid) || status === undefined) return failure("server", response, undefined, "The answer of Twilio has no call SID or no status.");
  const answeredBy = text(body["answered_by"]);
  const duration = countText(body["duration"]);
  return {
    ok: true,
    sid,
    status,
    state: twilioCallState(status, answeredBy),
    ended: ENDED.has(status),
    ...some("answeredBy", answeredBy),
    ...some("durationMs", duration === undefined ? undefined : duration * 1000),
    ...some("startedAt", date(body["start_time"])),
    ...some("endedAt", date(body["end_time"])),
  };
}

// =============================================================================
// The call
// =============================================================================

/** The part of `fetch` that `callTwilio` uses. `globalThis.fetch` fits this type. */
export type TwilioFetch = ApiFetch;

/**
 * This function sends one request through the fetch and reads the response with the extractor. It
 * does not throw for a failure of the network or a time limit: it gives a failure of the kind
 * `network` or `timeout`. It throws only the reason of `signal`, when the caller aborts. It does not
 * send a request again: the caller keeps the pace and the retries.
 */
export async function callTwilio<Result>(
  fetch: TwilioFetch,
  request: TwilioRequest,
  extract: (response: TwilioResponse) => Result | TwilioFailure,
  options: { readonly timeoutMs: number; readonly signal?: AbortSignal | undefined },
): Promise<Result | TwilioFailure> {
  return callApi<Result, TwilioFailure>(fetch, request, extract, options, (kind) => ({
    ok: false,
    kind,
    status: 0,
    errors: [kind === "timeout" ? `Twilio did not answer in ${options.timeoutMs} ms.` : "The request did not reach Twilio."],
    retryAfterMs: TWILIO_MIN_WAIT_MS,
  }));
}
