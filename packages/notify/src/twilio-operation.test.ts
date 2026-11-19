/**
 * The pilot of the format `api-operation/1`: the document of one Twilio text gives the same request
 * as `twilioTextRequest`, and it refuses the same inputs. The test examines the request only, not
 * the extraction of the answer.
 */
import { type ApiOperation, type ApiTerm, apiOperationIssues, buildApiRequest } from "@procedures/compiler/api";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type TwilioCredentials, type TwilioText, twilioTextRequest } from "./twilio.js";

// The keys, the SIDs and the numbers are made up. The country code 999 is not in use.
const ACCOUNT = `AC${"0".repeat(32)}`;
const KEY = `SK${"1".repeat(32)}`;
const SECRET = "madeupsecret00000000000000000000";
const CREDENTIALS: TwilioCredentials = { accountSid: ACCOUNT, secret: SECRET };
const TEXT: TwilioText = { to: "+999000006", from: "+999000001", body: "A tornado warning covers the place." };

const op = (name: string, ...args: ApiTerm[]): ApiTerm => ({ type: ["ops", name], value: args });
const ref = (...path: string[]): ApiTerm => ({ type: "ref", value: ["names", ...path] });
const when = (test: ApiTerm, then: ApiTerm, otherwise: ApiTerm): ApiTerm => ({ type: "if", value: { test, then, else: otherwise } });
const either = (...terms: ApiTerm[]): ApiTerm => ({ type: "or", value: terms });
const status = (...names: string[]): ApiTerm => either(...names.map((name) => op("eq", ref("body", "status"), name)));
const httpReason = (start: string): ApiTerm => op("concat", start, op("text", ref("status")), ".");

const PHONE = "^\\+[1-9][0-9]{1,14}$";

/** The operation: send one text through the Messages resource of the Twilio API. */
const TWILIO_SEND_TEXT: ApiOperation = {
  format: "api-operation/1",
  name: "twilio.texts.send",
  service: {
    origin: "https://api.twilio.com",
    auth: {
      scheme: "basic",
      secret: "twilio",
      user: op("coalesce", ref("credential", "keySid"), ref("credential", "accountSid")),
      password: ref("credential", "secret"),
      schema: {
        type: "object",
        required: ["accountSid", "secret"],
        properties: {
          accountSid: { type: "string", pattern: "^AC[0-9a-fA-F]{32}$" },
          keySid: { type: "string", pattern: "^SK[0-9a-fA-F]{32}$" },
          secret: { type: "string", pattern: "^[\\x21-\\x7e]+$" },
        },
      },
    },
    errors: {
      statuses: [
        { from: 429, to: 429, kind: "rate-limited", reason: "Twilio refused the request: too many requests at the same time." },
        { from: 401, to: 401, kind: "auth", reason: httpReason("Twilio refused the credentials with HTTP ") },
        { from: 403, to: 403, kind: "auth", reason: httpReason("Twilio refused the credentials with HTTP ") },
        { from: 400, to: 499, kind: "refused", reason: httpReason("Twilio refused the request with HTTP ") },
      ],
      otherwise: { kind: "server", reason: httpReason("Twilio gave HTTP ") },
      message: ref("body", "message"),
      code: ref("body", "code"),
      retry: { header: "retry-after", minMs: 5000, kinds: ["server", "rate-limited"] },
    },
  },
  input: {
    type: "object",
    required: ["to", "body"],
    properties: {
      to: { type: "string", pattern: PHONE },
      from: { type: "string", pattern: PHONE },
      messagingServiceSid: { type: "string", pattern: "^MG[0-9a-fA-F]{32}$" },
      body: { type: "string", pattern: "\\S", maxLength: 1600 },
      validityMs: { type: "number", minimum: 1000, exclusiveMaximum: 36_001_000 },
      statusCallback: { type: "string", pattern: "^https?://[^\\s/]+" },
    },
    oneOf: [{ required: ["from"] }, { required: ["messagingServiceSid"] }],
  },
  request: {
    method: "POST",
    path: op("concat", "/2010-04-01/Accounts/", ref("credential", "accountSid"), "/Messages.json"),
    headers: [["accept", "application/json"]],
    body: {
      type: "form",
      fields: [
        ["To", ref("input", "to")],
        ["Body", ref("input", "body")],
        ["From", ref("input", "from")],
        ["MessagingServiceSid", ref("input", "messagingServiceSid")],
        ["ValidityPeriod", op("floor", op("div", ref("input", "validityMs"), 1000))],
        ["StatusCallback", ref("input", "statusCallback")],
      ],
    },
  },
  response: {
    schema: {
      type: "object",
      required: ["sid", "status"],
      properties: { sid: { type: "string", pattern: "^(SM|MM)[0-9a-fA-F]{32}$" }, status: { type: "string", minLength: 1 } },
    },
    invalid: "The answer of Twilio has no text SID or no status.",
    fields: [
      ["sid", ref("body", "sid"), "text"],
      ["status", ref("body", "status"), "text"],
      ["state", when(status("delivered", "read"), "delivered", when(status("failed", "undelivered", "canceled"), "failed", "pending"))],
      ["errorCode", ref("body", "error_code"), "integer"],
      ["errorMessage", ref("body", "error_message"), "text"],
      ["segments", ref("body", "num_segments"), "count"],
      ["createdAt", ref("body", "date_created"), "date"],
    ],
  },
};

type Outcome = { readonly ok: true; readonly request: unknown } | { readonly ok: false };

/** The request of the old function, or a refusal when it throws. */
function oldRequest(credentials: TwilioCredentials, text: TwilioText): Outcome {
  try {
    return { ok: true, request: twilioTextRequest(credentials, text) };
  } catch {
    return { ok: false };
  }
}

const hex = (length: number) => fc.string({ unit: fc.constantFrom(..."0123456789abcdefABCDEF"), minLength: length, maxLength: length });
const phone = fc.oneof(fc.stringMatching(/^\+[1-9][0-9]{1,14}$/), fc.string({ maxLength: 18 }));
const serviceSid = fc.oneof(hex(32).map((digits) => `MG${digits}`), fc.string({ maxLength: 36 }));
// A body of at most 800 code points has at most 1600 UTF-16 units, so the two counts agree on the limit.
const anyBody = (minLength: number) => fc.string({ unit: "binary", minLength, maxLength: 800 });
const body = fc.oneof(
  fc.string({ maxLength: 1700 }),
  anyBody(0),
  fc.string({ unit: "grapheme-ascii", minLength: 1595, maxLength: 1605 }),
  fc.constantFrom("", " ", "\t\n", " ", "﻿", "x"),
);
const validityMs = fc.oneof(fc.double({ min: -1e9, max: 1e9, noNaN: true }), fc.constantFrom(999, 1000, 36_000_999.5, 36_001_000));
const callback = fc.oneof(fc.webUrl(), fc.string({ maxLength: 20 }));
const text: fc.Arbitrary<TwilioText> = fc.record(
  { to: phone, from: phone, messagingServiceSid: serviceSid, body, validityMs, statusCallback: callback },
  { requiredKeys: ["to", "body"] },
);
const credentials: fc.Arbitrary<TwilioCredentials> = fc.record(
  {
    accountSid: fc.oneof(hex(32).map((digits) => `AC${digits}`), fc.constant("AC-not-valid")),
    keySid: hex(32).map((digits) => `SK${digits}`),
    secret: fc.oneof(fc.string({ unit: fc.constantFrom(..."abcXYZ019!~"), minLength: 1, maxLength: 40 }), fc.constantFrom("", "with space")),
  },
  { requiredKeys: ["accountSid", "secret"] },
);
// The valid texts and credentials only: each run compares two requests.
const validPhone = fc.stringMatching(/^\+[1-9][0-9]{1,14}$/);
const validText: fc.Arbitrary<TwilioText> = fc
  .tuple(
    validPhone,
    fc.oneof(validPhone.map((from) => ({ from })), hex(32).map((digits) => ({ messagingServiceSid: `MG${digits}` }))),
    fc.oneof(fc.string({ minLength: 1, maxLength: 1600 }), anyBody(1)).filter((value) => value.trim() !== ""),
    fc.record({ validityMs: fc.double({ min: 1000, max: 36_000_999.99, noNaN: true }), statusCallback: fc.webUrl() }, { requiredKeys: [] }),
  )
  .map(([to, sender, value, extra]) => ({ to, ...sender, body: value, ...extra }));
const validCredentials: fc.Arbitrary<TwilioCredentials> = fc.record(
  {
    accountSid: hex(32).map((digits) => `AC${digits}`),
    keySid: hex(32).map((digits) => `SK${digits}`),
    secret: fc.string({ unit: fc.constantFrom(..."abcXYZ019!~"), minLength: 1, maxLength: 40 }),
  },
  { requiredKeys: ["accountSid", "secret"] },
);

describe("the document of a Twilio text against twilioTextRequest", () => {
  it("is a valid operation", () => {
    expect(apiOperationIssues(TWILIO_SEND_TEXT)).toEqual([]);
  });

  it("gives the request of twilioTextRequest for a text with a sender, a service, a validity and a callback", () => {
    const service = `MG${"2".repeat(32)}`;
    const full = { to: TEXT.to, messagingServiceSid: service, body: "Hi & bye = 100%", validityMs: 61_500, statusCallback: "https://hooks.example/s?a=1" };
    const built = buildApiRequest(TWILIO_SEND_TEXT, full, { twilio: { ...CREDENTIALS, keySid: KEY } });
    expect(built).toEqual({ ok: true, request: twilioTextRequest({ ...CREDENTIALS, keySid: KEY }, full) });
    expect(buildApiRequest(TWILIO_SEND_TEXT, TEXT, { twilio: CREDENTIALS })).toEqual({ ok: true, request: twilioTextRequest(CREDENTIALS, TEXT) });
  });

  it("gives the request of twilioTextRequest for each valid text and credential", () => {
    fc.assert(
      fc.property(validText, validCredentials, (input, keys) => {
        expect(buildApiRequest(TWILIO_SEND_TEXT, input, { twilio: keys })).toEqual({ ok: true, request: twilioTextRequest(keys, input) });
      }),
      { numRuns: 300 },
    );
  });

  it("accepts and refuses the same texts and credentials, and gives equal requests", () => {
    fc.assert(
      fc.property(text, credentials, (input, keys) => {
        const old = oldRequest(keys, input);
        const built = buildApiRequest(TWILIO_SEND_TEXT, input, { twilio: keys });
        expect(built.ok).toBe(old.ok);
        if (built.ok && old.ok) expect(built.request).toEqual(old.request);
        if (!built.ok) expect(["input", "credential"]).toContain(built.kind);
      }),
      { numRuns: 400 },
    );
  });

  it("differs on one known case: the length of a body with characters outside the BMP", () => {
    // JSON Schema counts the code points of a text, and twilioTextRequest counts its UTF-16 units.
    // The documents of Twilio do not say which count the limit of 1600 characters uses.
    const wide = { ...TEXT, body: "\u{1F600}".repeat(1000) };
    expect(oldRequest(CREDENTIALS, wide).ok).toBe(false);
    expect(buildApiRequest(TWILIO_SEND_TEXT, wide, { twilio: CREDENTIALS }).ok).toBe(true);
  });
});
