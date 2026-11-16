/**
 * The parts that the entries of Twilio share: the credentials, the request and the response, the
 * failure, the authentication and the sort of a response. The entries `./twilio` and
 * `./twilio-serverless` import this module, and `./twilio` exports its public names. This module is
 * not an entry of the package, and it imports no Node built-in.
 */

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

// =============================================================================
// Requests
// =============================================================================

const KEY_SID = /^SK[0-9a-fA-F]{32}$/;
const SECRET = /^[\x21-\x7e]+$/;

/** The media type of a form body. */
export const FORM = "application/x-www-form-urlencoded";

/** This function throws an error when the credentials do not have the forms of Twilio. */
export function assertCredentials(credentials: TwilioCredentials): void {
  if (!TWILIO_ACCOUNT_SID.test(credentials.accountSid)) throw new Error("The account SID is not AC and 32 hexadecimal digits.");
  if (credentials.keySid !== undefined && !KEY_SID.test(credentials.keySid)) throw new Error("The API key SID is not SK and 32 hexadecimal digits.");
  if (!SECRET.test(credentials.secret)) throw new Error("The secret is empty, or it has a character that is not visible ASCII.");
}

/**
 * This function gives one request with the Basic authentication of the credentials. It throws an
 * error when the credentials do not have the forms of Twilio. A body needs its media type.
 */
export function twilioRequestOf(
  credentials: TwilioCredentials,
  method: "GET" | "POST",
  url: string,
  body?: { readonly type: string; readonly text: string },
): TwilioRequest {
  assertCredentials(credentials);
  const user = credentials.keySid ?? credentials.accountSid;
  const headers = { authorization: `Basic ${btoa(`${user}:${credentials.secret}`)}`, accept: "application/json", ...(body ? { "content-type": body.type } : {}) };
  return body === undefined ? { url, method, headers } : { url, method, headers, body: body.text };
}

// =============================================================================
// Responses
// =============================================================================

/** The fields of a JSON object of Twilio. */
export type Body = Readonly<Record<string, unknown>>;

/** This function gives the JSON object of a text, or `undefined` when the text is not a JSON object. */
export function parse(text: string): Body | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Body) : undefined;
  } catch {
    return undefined;
  }
}

/** This function gives a text that is not empty, or `undefined`. */
export const text = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);
/** This function gives an integer, or `undefined`. */
export const integer = (value: unknown): number | undefined => (typeof value === "number" && Number.isInteger(value) ? value : undefined);
/** This function gives a time in milliseconds. Twilio gives each date in the form of RFC 2822 or of ISO 8601. */
export const date = (value: unknown): number | undefined => {
  const at = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(at) ? at : undefined;
};
/** This function gives `{ [key]: value }`, or an empty object when the value is undefined. */
export const some = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } => (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };

function retryAfter(response: TwilioResponse): number {
  const value = response.headers?.get("retry-after")?.trim();
  return value !== undefined && /^\d+$/.test(value) ? Math.max(Number(value) * 1000, TWILIO_MIN_WAIT_MS) : TWILIO_MIN_WAIT_MS;
}

/** This function gives a failure of a response. Only the kinds `server` and `rate-limited` get a wait. */
export function failure(kind: TwilioFailureKind, response: TwilioResponse, body: Body | undefined, fallback: string): TwilioFailure {
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
export function sort(response: TwilioResponse): { readonly ok: true; readonly body: Body } | TwilioFailure {
  const body = parse(response.text);
  const status = response.status;
  if (status === 429) return failure("rate-limited", response, body, "Twilio refused the request: too many requests at the same time.");
  if (status === 401 || status === 403) return failure("auth", response, body, `Twilio refused the credentials with HTTP ${status}.`);
  if (status >= 400 && status < 500) return failure("refused", response, body, `Twilio refused the request with HTTP ${status}.`);
  if (status < 200 || status >= 300) return failure("server", response, body, `Twilio gave HTTP ${status}.`);
  if (body === undefined) return failure("server", response, body, "The answer of Twilio is not a JSON object.");
  return { ok: true, body };
}
