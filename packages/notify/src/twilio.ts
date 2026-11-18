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

/** The limits of the Twilio API: the characters of a text and of a TwiML, and the entries in one page of a list. */
export const TWILIO_LIMITS: { readonly body: 1600; readonly twiml: 4000; readonly pageSize: 1000 } = { body: 1600, twiml: 4000, pageSize: 1000 };

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

/** The filters of a read of the list of texts. Twilio gives only the texts that agree with each filter. */
export interface TwilioMessageQuery {
  /** Only the texts to this number, in E.164 form. For the replies of the recipients, this is the Twilio number. */
  readonly to?: string | undefined;
  /** Only the texts from this number, in E.164 form. */
  readonly from?: string | undefined;
  /**
   * Only the texts that Twilio sent or received on or after this time: the filter `DateSent>`. A
   * number is a time in milliseconds. The request gives it in whole seconds of UTC, as
   * `YYYY-MM-DDThh:mm:ssZ`, the same as the helper libraries of Twilio. A text is a day of GMT, as `YYYY-MM-DD`.
   */
  readonly dateSentAfter?: number | string | undefined;
  /** The count of texts in one page: 1 to 1000. The default of Twilio is 50. */
  readonly pageSize?: number | undefined;
}

/** One text of a list. */
export interface TwilioMessage {
  /** The SID of the text: `SM` or `MM` and 32 hexadecimal digits. */
  readonly sid: string;
  /** The sender. A text of a messaging service has no sender until Twilio picks one. */
  readonly from?: string;
  /** The recipient. */
  readonly to: string;
  /** The text. It is empty for a text that has only media. */
  readonly body: string;
  /** The direction: `inbound` for a text that Twilio received, or `outbound-api`, `outbound-call` and `outbound-reply` for a text that Twilio sent. */
  readonly direction: string;
  /** The status of Twilio, for example `received` or `delivered`. */
  readonly status: string;
  /** The time that Twilio sent or received the text. A text in the queue does not have it. */
  readonly dateSent?: number;
  /** The error code of a failed or undelivered text. */
  readonly errorCode?: number;
}

/** One page of the list of texts: the answer of `twilioMessageListRequest`, or of `twilioNextPageRequest` for the list of texts. */
export interface TwilioMessagePage {
  readonly ok: true;
  /** The texts of the page. Twilio sorts them by `dateSent`, the newest first. */
  readonly messages: readonly TwilioMessage[];
  /** The path of the next page. `twilioNextPageRequest` reads it. The last page does not have it. */
  readonly nextPageUri?: string;
}

/** The filters of a read of the usage records. Twilio adds the usage of each category in the days of the filter. */
export interface TwilioUsageQuery {
  /**
   * Only the records of this category, for example `totalprice`, `calls`, `sms` or `phonenumbers`. Without
   * it, Twilio gives one record for each category. The documents of Twilio list the categories.
   */
  readonly category?: string | undefined;
  /** The first day of the usage, as a day of GMT in the form `YYYY-MM-DD`. The sum includes this day. */
  readonly startDate?: string | undefined;
  /** The last day of the usage, as a day of GMT in the form `YYYY-MM-DD`. The sum includes this day. */
  readonly endDate?: string | undefined;
  /** The count of records in one page: 1 to 1000. The default of Twilio is 50. */
  readonly pageSize?: number | undefined;
}

/** One usage record: the usage of one category in the days of the query. */
export interface TwilioUsageRecord {
  /** The category, for example `totalprice` or `calls`. */
  readonly category: string;
  /** The first day of the record, as a day of GMT: `YYYY-MM-DD`. */
  readonly startDate: string;
  /** The last day of the record, as a day of GMT: `YYYY-MM-DD`. */
  readonly endDate: string;
  /** The price of the usage, in the currency of `priceUnit`. */
  readonly price: number;
  /** The price as the decimal text of Twilio. It keeps each digit. */
  readonly priceText: string;
  /** The currency of the price, as Twilio gives it: for example `usd`. */
  readonly priceUnit: string;
  /** The amount that Twilio bills, in `usageUnit`: for example `minutes`. */
  readonly usage?: number;
  readonly usageUnit?: string;
  /** The count of the events, in `countUnit`: for example `calls`. Some categories do not have it. */
  readonly count?: number;
  readonly countUnit?: string;
  /** The record has the usage up to this time. Twilio adds the usage to the records after a delay. */
  readonly asOf?: number;
}

/** One page of the usage records: the answer of `twilioUsageRecordsRequest`, or of `twilioNextPageRequest` for the usage records. */
export interface TwilioUsagePage {
  readonly ok: true;
  readonly records: readonly TwilioUsageRecord[];
  /** The path of the next page. `twilioNextPageRequest` reads it. The last page does not have it. */
  readonly nextPageUri?: string;
}

// =============================================================================
// Request builders
// =============================================================================

const SERVICE_SID = /^MG[0-9a-fA-F]{32}$/;
const TEXT_SID = /^(SM|MM)[0-9a-fA-F]{32}$/;
const CALL_SID = /^CA[0-9a-fA-F]{32}$/;
const PHONE = /^\+[1-9][0-9]{1,14}$/;

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

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The first millisecond of the year 10000. A date of ISO 8601 has 4 digits of the year. */
const YEAR_10000_MS = 253_402_300_800_000;

/** This function gives a day in the form `YYYY-MM-DD` that is a real day of the calendar, or it throws. */
function dayOf(value: string, what: string): string {
  const at = typeof value === "string" && DAY.test(value) ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== value) throw new Error(`The ${what} is not a day in the form YYYY-MM-DD.`);
  return value;
}

/** This function gives the value of the filter `DateSent>`, or it throws. */
function dateSentOf(value: number | string): string {
  if (typeof value === "number") {
    if (!(Number.isFinite(value) && value >= 0 && value < YEAR_10000_MS)) throw new Error("The time of dateSentAfter is not a time from 1970 to 9999.");
    return `${new Date(Math.floor(value / 1000) * 1000).toISOString().slice(0, 19)}Z`;
  }
  return dayOf(value, "date of dateSentAfter");
}

/** This function sets the field `PageSize` of a list, or it throws when the size is not 1 to 1000. */
function setPageSize(fields: URLSearchParams, size: number | undefined): void {
  if (size === undefined) return;
  if (!(Number.isInteger(size) && size >= 1 && size <= TWILIO_LIMITS.pageSize)) throw new Error(`The page size is not 1 to ${TWILIO_LIMITS.pageSize}.`);
  fields.set("PageSize", String(size));
}

/**
 * This function gives the request that reads one page of the texts of the account, the newest first.
 * The filters are optional. It throws an error when a filter breaks a rule of the API.
 */
export function twilioMessageListRequest(credentials: TwilioCredentials, query: TwilioMessageQuery = {}): TwilioRequest {
  const fields = new URLSearchParams();
  if (query.to !== undefined) {
    assertPhone(query.to, "recipient");
    fields.set("To", query.to);
  }
  if (query.from !== undefined) {
    assertPhone(query.from, "sender");
    fields.set("From", query.from);
  }
  if (query.dateSentAfter !== undefined) fields.set("DateSent>", dateSentOf(query.dateSentAfter));
  setPageSize(fields, query.pageSize);
  const search = fields.toString();
  return get(credentials, search === "" ? "/Messages.json" : `/Messages.json?${search}`);
}

/** A usage category of Twilio: lower case letters, digits, dots, underscores and dashes. */
const CATEGORY = /^[a-z0-9][a-z0-9._-]{0,99}$/;

/**
 * This function gives the request that reads one page of the usage records of the account. Each record
 * is the sum of one category in the days of the filter. Twilio counts the days in GMT. It throws an
 * error when a filter breaks a rule of the API, or when the start date is after the end date.
 */
export function twilioUsageRecordsRequest(credentials: TwilioCredentials, query: TwilioUsageQuery = {}): TwilioRequest {
  const fields = new URLSearchParams();
  if (query.category !== undefined) {
    if (!CATEGORY.test(query.category)) throw new Error("The category is not 1 to 100 lower case letters, digits, dots, underscores and dashes.");
    fields.set("Category", query.category);
  }
  const start = query.startDate === undefined ? undefined : dayOf(query.startDate, "start date");
  const end = query.endDate === undefined ? undefined : dayOf(query.endDate, "end date");
  if (start !== undefined && end !== undefined && start > end) throw new Error("The start date is after the end date.");
  if (start !== undefined) fields.set("StartDate", start);
  if (end !== undefined) fields.set("EndDate", end);
  setPageSize(fields, query.pageSize);
  const search = fields.toString();
  return get(credentials, search === "" ? "/Usage/Records.json" : `/Usage/Records.json?${search}`);
}

/**
 * This function gives the request that reads the next page of a list of the API, from the
 * `nextPageUri` of a page. It throws an error when the path is not in the API of `TWILIO_API`, so the
 * credentials go to no other host.
 */
export function twilioNextPageRequest(credentials: TwilioCredentials, nextPageUri: string): TwilioRequest {
  const base = new URL(TWILIO_API);
  let url: URL;
  try {
    url = new URL(nextPageUri, base.origin);
  } catch {
    throw new Error("The next page is not a path or an address.");
  }
  if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}/`) || url.username !== "" || url.password !== "") {
    throw new Error("The next page is not a path of the Twilio API.");
  }
  return twilioRequestOf(credentials, "GET", url.href);
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

/** This function reads one text of a list, or it gives `undefined` when the text has no SID, no recipient, no direction or no status. */
function messageOf(entry: unknown): TwilioMessage | undefined {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined;
  const fields = entry as Readonly<Record<string, unknown>>;
  const sid = text(fields["sid"]);
  const to = text(fields["to"]);
  const direction = text(fields["direction"]);
  const status = text(fields["status"]);
  if (sid === undefined || !TEXT_SID.test(sid) || to === undefined || direction === undefined || status === undefined) return undefined;
  const body = fields["body"];
  return {
    sid,
    ...some("from", text(fields["from"])),
    to,
    body: typeof body === "string" ? body : "",
    direction,
    status,
    ...some("dateSent", date(fields["date_sent"])),
    ...some("errorCode", integer(fields["error_code"])),
  };
}

/** This function reads the response of `twilioMessageListRequest`, or of `twilioNextPageRequest` for the list of texts. It does not throw. */
export function extractTwilioMessages(response: TwilioResponse): TwilioMessagePage | TwilioFailure {
  const sorted = sort(response);
  if (!sorted.ok) return sorted;
  const entries = sorted.body["messages"];
  if (!Array.isArray(entries)) return failure("server", response, undefined, "The answer of Twilio has no list messages.");
  const messages: TwilioMessage[] = [];
  for (const entry of entries as readonly unknown[]) {
    const message = messageOf(entry);
    if (message === undefined) return failure("server", response, undefined, "A text of the list has no SID, no recipient, no direction or no status.");
    messages.push(message);
  }
  return { ok: true, messages, ...some("nextPageUri", text(sorted.body["next_page_uri"])) };
}

/** This function gives a number from a decimal of Twilio, or `undefined`. */
const decimalNumber = (value: unknown): number | undefined => {
  const digits = decimal(value);
  return digits === undefined ? undefined : Number(digits);
};

/** This function reads one usage record of a list. It gives `undefined` when the record has no category, no days, no price or no currency. */
function usageRecordOf(entry: unknown): TwilioUsageRecord | undefined {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined;
  const fields = entry as Readonly<Record<string, unknown>>;
  const category = text(fields["category"]);
  const startDate = text(fields["start_date"]);
  const endDate = text(fields["end_date"]);
  const priceText = decimal(fields["price"]);
  const priceUnit = text(fields["price_unit"]);
  if (category === undefined || startDate === undefined || !DAY.test(startDate) || endDate === undefined || !DAY.test(endDate)) return undefined;
  if (priceText === undefined || priceUnit === undefined) return undefined;
  return {
    category,
    startDate,
    endDate,
    price: Number(priceText),
    priceText,
    priceUnit,
    ...some("usage", decimalNumber(fields["usage"])),
    ...some("usageUnit", text(fields["usage_unit"])),
    ...some("count", decimalNumber(fields["count"])),
    ...some("countUnit", text(fields["count_unit"])),
    ...some("asOf", date(fields["as_of"])),
  };
}

/**
 * This function reads the response of `twilioUsageRecordsRequest`, or of `twilioNextPageRequest` for the
 * usage records. It does not throw. A record with no category, no days, no price or no currency gives a
 * failure, because a sum without it is not complete.
 */
export function extractTwilioUsageRecords(response: TwilioResponse): TwilioUsagePage | TwilioFailure {
  const sorted = sort(response);
  if (!sorted.ok) return sorted;
  const entries = sorted.body["usage_records"];
  if (!Array.isArray(entries)) return failure("server", response, undefined, "The answer of Twilio has no list usage_records.");
  const records: TwilioUsageRecord[] = [];
  for (const entry of entries as readonly unknown[]) {
    const record = usageRecordOf(entry);
    if (record === undefined) return failure("server", response, undefined, "A usage record of the list has no category, no days, no price or no currency.");
    records.push(record);
  }
  return { ok: true, records, ...some("nextPageUri", text(sorted.body["next_page_uri"])) };
}

// =============================================================================
// The keywords of the replies
// =============================================================================

/**
 * The opt-out keywords of the default handling of Twilio. A reply with one of them stops the texts
 * of the Twilio number to the person. Twilio added `REVOKE` and `OPTOUT` on 13 May 2025.
 */
export const TWILIO_OPT_OUT_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"] as const;

/**
 * The opt-in keywords of the default handling of Twilio. A reply with one of them starts the texts
 * again. A toll-free number of the US accepts only `START` and `UNSTOP`.
 */
export const TWILIO_OPT_IN_KEYWORDS = ["START", "YES", "UNSTOP"] as const;

/** The help keywords of the default handling of Twilio. Twilio replies with a help text. */
export const TWILIO_HELP_KEYWORDS = ["HELP", "INFO"] as const;

/** The kind of a keyword reply: `stop` (opt-out), `start` (opt-in) or `help`. */
export type TwilioKeyword = "stop" | "start" | "help";

const KEYWORDS: ReadonlyMap<string, TwilioKeyword> = new Map<string, TwilioKeyword>([
  ...TWILIO_OPT_OUT_KEYWORDS.map((word) => [word, "stop"] as const),
  ...TWILIO_OPT_IN_KEYWORDS.map((word) => [word, "start"] as const),
  ...TWILIO_HELP_KEYWORDS.map((word) => [word, "help"] as const),
]);

/**
 * This function gives the kind of the keyword of a received text, or `undefined` when the text is not
 * a keyword. It uses the default keywords of Twilio, not the keywords of an Advanced Opt-Out.
 *
 * - Twilio accepts a keyword only when it is the full body of the text: `Stop, that is funny` is not a keyword.
 * - Twilio ignores the case of the letters: `Stop` and `sTOP` are the same as `STOP`.
 * - The documents of Twilio do not give a rule for white space. This function ignores the white space before and after the keyword.
 * - Each other character makes a text that is not a keyword, for example `STOP!` or `STOP ALL`.
 */
export function twilioOptOutKeyword(body: string): TwilioKeyword | undefined {
  if (typeof body !== "string") return undefined;
  const word = body.trim();
  return /^[A-Za-z]+$/.test(word) ? KEYWORDS.get(word.toUpperCase()) : undefined;
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
