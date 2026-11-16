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

import { escapeAttribute, escapeHtml } from "@mark1russell7/text";
import { callApi, type ApiFetch } from "./call.js";
import {
  FORM,
  TWILIO_MIN_WAIT_MS,
  date,
  failure,
  integer,
  some,
  sort,
  text,
  twilioRequestOf,
  type TwilioCredentials,
  type TwilioFailure,
  type TwilioRequest,
  type TwilioResponse,
} from "./twilio-common.js";

export {
  TWILIO_ACCOUNT_SID,
  TWILIO_MIN_WAIT_MS,
  type TwilioCredentials,
  type TwilioFailure,
  type TwilioFailureKind,
  type TwilioRequest,
  type TwilioResponse,
} from "./twilio-common.js";

/** The base of the Twilio REST API. */
export const TWILIO_API = "https://api.twilio.com/2010-04-01";

/** The limits of the Twilio API, in characters. */
export const TWILIO_LIMITS: { readonly body: 1600; readonly twiml: 4000 } = { body: 1600, twiml: 4000 };

/** The longest time that a queued text waits for its send: 10 hours. After it, Twilio does not send the text. */
export const TWILIO_VALIDITY_MAX_MS = 36_000_000;

/** The longest time that a call rings before Twilio gives it as not answered: 600 seconds. */
export const TWILIO_RING_MAX_MS = 600_000;

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

/** The voice of each `<Say>` of a TwiML. Without a field, Twilio uses its default. */
export interface TwilioVoice {
  /** The voice of Twilio, for example `Polly.Joanna` or `alice`. */
  readonly voice?: string | undefined;
  /** The language of the text, as a language tag: for example `en-US`. */
  readonly language?: string | undefined;
}

/** A `<Gather>` that says a text and waits for the keys of the person. Its voice is the voice of each `<Say>`. */
export interface TwilioGather extends TwilioVoice {
  /** The http or https address that gets the keys. Twilio sends them in the field `Digits`. */
  readonly action: string;
  /** The method of the request to `action`. The default is `POST`. */
  readonly method?: "POST" | "GET" | undefined;
  /** The count of keys to wait for, 1 to 10. The default is 1. */
  readonly digits?: number | undefined;
  /** The wait for a key after the text, 1 to 60 seconds. The default is 5 seconds. */
  readonly timeoutMs?: number | undefined;
  /** The count of the text in the gather, 1 to 10, with a pause of one second between two. The default is 1. */
  readonly repeats?: number | undefined;
  /** The text to say after the gather, when no key came. Then the TwiML ends, and the call ends. */
  readonly after?: string | undefined;
  /** When it is true, Twilio also sends a request to `action` when no key came. The default is false. */
  readonly actionOnEmptyResult?: boolean | undefined;
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

/** The balance of an account: the answer of `twilioBalanceRequest`. */
export interface TwilioBalanceRead {
  readonly ok: true;
  /** The balance in the currency of the account, for example `1.83164`. It is below 0 when the account owes money. */
  readonly balance: number;
  /** The balance as the decimal text of Twilio. It keeps each digit. */
  readonly balanceText: string;
  /** The currency of the account, as the code of ISO 4217: for example `USD`. */
  readonly currency: string;
}

// =============================================================================
// Request builders
// =============================================================================

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

function account(credentials: TwilioCredentials, path: string): string {
  return `${TWILIO_API}/Accounts/${credentials.accountSid}${path}`;
}

function post(credentials: TwilioCredentials, path: string, fields: Record<string, string>): TwilioRequest {
  return twilioRequestOf(credentials, "POST", account(credentials, path), { type: FORM, text: new URLSearchParams(fields).toString() });
}

function get(credentials: TwilioCredentials, path: string): TwilioRequest {
  return twilioRequestOf(credentials, "GET", account(credentials, path));
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

/**
 * This function gives the request that reads the balance of the account. With the auto recharge off,
 * the balance is the most that the account can spend. A send fails when the balance is empty.
 */
export function twilioBalanceRequest(credentials: TwilioCredentials): TwilioRequest {
  return get(credentials, "/Balance.json");
}

/** The characters that XML 1.0 does not permit, other than the tab, the line feed and the carriage return. */
const NOT_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

const VOICE = /^[A-Za-z0-9._-]{1,100}$/;
const LANGUAGE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** This function gives one `<Say>` of a text. It escapes the text and the attributes. */
function sayOf(text: string, voice: TwilioVoice): string {
  if (text.trim() === "") throw new Error("The text to say is empty.");
  if (voice.voice !== undefined && !VOICE.test(voice.voice)) throw new Error("The voice is not 1 to 100 letters, digits, dots, dashes and underscores.");
  if (voice.language !== undefined && !LANGUAGE.test(voice.language)) throw new Error("The language is not a language tag, for example en-US.");
  const attributes = `${voice.voice === undefined ? "" : ` voice="${escapeAttribute(voice.voice)}"`}${voice.language === undefined ? "" : ` language="${escapeAttribute(voice.language)}"`}`;
  return `<Say${attributes}>${escapeHtml(text.replace(NOT_XML, " "))}</Say>`;
}

/** This function gives a `<Say>` `repeats` times (1 to 10), with a pause of one second between two repeats. */
function repeated(say: string, repeats: number): string {
  if (!(Number.isInteger(repeats) && repeats >= 1 && repeats <= 10)) throw new Error("The count of repeats is not 1 to 10.");
  return Array.from({ length: repeats }, () => say).join('<Pause length="1"/>');
}

/** This function gives the TwiML document of the verbs. It throws an error when the TwiML has more than 4000 characters. */
function twimlOf(verbs: string): string {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>${verbs}</Response>`;
  if (twiml.length > TWILIO_LIMITS.twiml) throw new Error(`The TwiML has more than ${TWILIO_LIMITS.twiml} characters.`);
  return twiml;
}

/**
 * This function gives the TwiML that says a text, `repeats` times (1 to 10) with a pause of one second
 * between two repeats. It escapes the text, and it changes each character that XML does not permit to
 * a space. It throws an error when the TwiML has more than 4000 characters.
 */
export function twilioSayTwiml(text: string, repeats = 1, voice: TwilioVoice = {}): string {
  return twimlOf(repeated(sayOf(text, voice), repeats));
}

/**
 * This function gives the TwiML that says a text in a `<Gather>` and waits for the keys of the person.
 *
 * - Twilio sends the keys to `action` in the field `Digits`. A key during the text also counts.
 * - With no key, Twilio says `after`. Then the TwiML ends, and the call ends.
 * - It escapes the texts and the action address. It throws an error for an input that breaks a rule of the API.
 */
export function twilioGatherTwiml(text: string, gather: TwilioGather): string {
  assertAddress(gather.action, "action of the gather");
  const method = gather.method ?? "POST";
  if (method !== "POST" && method !== "GET") throw new Error(`${String(method)} is not a method of a gather.`);
  const digits = gather.digits ?? 1;
  if (!(Number.isInteger(digits) && digits >= 1 && digits <= 10)) throw new Error("The count of keys is not 1 to 10.");
  const timeout = seconds(gather.timeoutMs ?? 5_000, 1, 60, "wait for a key");
  const empty = gather.actionOnEmptyResult === true ? ' actionOnEmptyResult="true"' : "";
  const open = `<Gather input="dtmf" numDigits="${digits}" timeout="${timeout}" action="${escapeAttribute(gather.action)}" method="${method}"${empty}>`;
  const after = gather.after === undefined ? "" : sayOf(gather.after, gather);
  return twimlOf(`${open}${repeated(sayOf(text, gather), gather.repeats ?? 1)}</Gather>${after}`);
}

// =============================================================================
// Extractors
// =============================================================================

/** Twilio gives some counts as decimal text, for example `num_segments` and `duration`. */
const countText = (value: unknown): number | undefined => (typeof value === "string" && /^\d+$/.test(value) ? Number(value) : integer(value));

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

const DECIMAL = /^-?[0-9]+(\.[0-9]+)?$/;
const CURRENCY = /^[A-Z]{3}$/;

/** Twilio gives the balance as decimal text. This function also accepts a finite number. */
const decimal = (value: unknown): string | undefined =>
  typeof value === "string" && DECIMAL.test(value) ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;

/** This function reads the response of `twilioBalanceRequest`. It does not throw. */
export function extractTwilioBalance(response: TwilioResponse): TwilioBalanceRead | TwilioFailure {
  const sorted = sort(response);
  if (!sorted.ok) return sorted;
  const balanceText = decimal(sorted.body["balance"]);
  const currency = text(sorted.body["currency"]);
  if (balanceText === undefined || currency === undefined || !CURRENCY.test(currency)) return failure("server", response, undefined, "The answer of Twilio has no balance or no currency.");
  return { ok: true, balance: Number(balanceText), balanceText, currency };
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
