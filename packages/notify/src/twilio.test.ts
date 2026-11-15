import { describe, expect, it, vi } from "vitest";
import {
  TWILIO_API,
  TWILIO_LIMITS,
  TWILIO_MIN_WAIT_MS,
  callTwilio,
  extractTwilioCall,
  extractTwilioText,
  twilioCallRequest,
  twilioCallState,
  twilioCallStatusRequest,
  twilioEndCallRequest,
  twilioSayTwiml,
  twilioTextRequest,
  twilioTextState,
  twilioTextStatusRequest,
  type TwilioCall,
  type TwilioCredentials,
  type TwilioFetch,
  type TwilioText,
} from "./twilio.js";

// The keys, the SIDs and the numbers are made up. The country code 999 is not in use. The bodies
// have the shapes of the API documentation (twilio.com/docs/messaging/api/message-resource and
// twilio.com/docs/voice/api/call-resource), read on 2026-11-15.
const ACCOUNT = `AC${"0".repeat(32)}`;
const KEY = `SK${"1".repeat(32)}`;
const SECRET = "madeupsecret00000000000000000000";
const SERVICE = `MG${"2".repeat(32)}`;
const TEXT_SID = `SM${"3".repeat(32)}`;
const CALL_SID = `CA${"4".repeat(32)}`;
const TO = "+999000006";
const FROM = "+999000001";
const CREDENTIALS: TwilioCredentials = { accountSid: ACCOUNT, secret: SECRET };

const form = (body: string | undefined): Record<string, string> => Object.fromEntries(new URLSearchParams(body ?? ""));
const headers = (values: Record<string, string>): { get(name: string): string | null } => ({ get: (name) => values[name.toLowerCase()] ?? null });
const basic = (user: string, secret: string): string => `Basic ${Buffer.from(`${user}:${secret}`).toString("base64")}`;
const textOf = (extra: Partial<TwilioText> = {}): TwilioText => ({ to: TO, from: FROM, body: "A tornado warning covers the place.", ...extra });
const callOf = (extra: Partial<TwilioCall> = {}): TwilioCall => ({ to: TO, from: FROM, twiml: twilioSayTwiml("A tornado warning."), ...extra });

const MESSAGE = {
  account_sid: ACCOUNT,
  api_version: "2010-04-01",
  body: "A tornado warning covers the place.",
  date_created: "Thu, 24 Aug 2023 05:01:45 +0000",
  date_sent: "Thu, 24 Aug 2023 05:01:45 +0000",
  date_updated: "Thu, 24 Aug 2023 05:01:45 +0000",
  direction: "outbound-api",
  error_code: null,
  error_message: null,
  from: FROM,
  num_media: "0",
  num_segments: "1",
  price: null,
  price_unit: null,
  messaging_service_sid: null,
  sid: TEXT_SID,
  status: "queued",
  to: TO,
  uri: `/2010-04-01/Accounts/${ACCOUNT}/Messages/${TEXT_SID}.json`,
};

const CALL = {
  account_sid: ACCOUNT,
  answered_by: null,
  date_created: "Tue, 31 Aug 2010 20:36:28 +0000",
  date_updated: "Tue, 31 Aug 2010 20:36:44 +0000",
  direction: "outbound-api",
  duration: null,
  end_time: null,
  from: FROM,
  sid: CALL_SID,
  start_time: null,
  status: "queued",
  to: TO,
  uri: `/2010-04-01/Accounts/${ACCOUNT}/Calls/${CALL_SID}.json`,
};

const ok = (body: unknown, status = 201) => ({ status, text: JSON.stringify(body) });
const error = (status: number, code: number, message: string) => ({
  status,
  text: JSON.stringify({ code, message, more_info: `https://www.twilio.com/docs/errors/${code}`, status }),
});

describe("twilioTextRequest", () => {
  it("posts a form to the Messages resource of the account, with Basic authentication", () => {
    const request = twilioTextRequest(CREDENTIALS, textOf());
    expect(request.url).toBe(`${TWILIO_API}/Accounts/${ACCOUNT}/Messages.json`);
    expect(request.method).toBe("POST");
    expect(request.headers).toEqual({
      authorization: basic(ACCOUNT, SECRET),
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(form(request.body)).toEqual({ To: TO, From: FROM, Body: "A tornado warning covers the place." });
  });

  it("authenticates with the API key, and keeps the account in the URL", () => {
    const request = twilioTextRequest({ accountSid: ACCOUNT, keySid: KEY, secret: SECRET }, textOf());
    expect(request.headers["authorization"]).toBe(basic(KEY, SECRET));
    expect(request.url).toContain(`/Accounts/${ACCOUNT}/`);
  });

  it("sends through a messaging service, with the validity in whole seconds and a status callback", () => {
    const request = twilioTextRequest(
      CREDENTIALS,
      textOf({ from: undefined, messagingServiceSid: SERVICE, validityMs: 600_999, statusCallback: "https://example.com/twilio/status" }),
    );
    expect(form(request.body)).toEqual({
      To: TO,
      Body: "A tornado warning covers the place.",
      MessagingServiceSid: SERVICE,
      ValidityPeriod: "600",
      StatusCallback: "https://example.com/twilio/status",
    });
  });

  it("encodes the characters of the text in the form", () => {
    const body = "Wind 60 mph & hail. Go to the basement: 100% now?";
    expect(form(twilioTextRequest(CREDENTIALS, textOf({ body })).body)["Body"]).toBe(body);
  });

  it.each<[string, Partial<TwilioText>]>([
    ["a recipient that is not E.164", { to: "5005550006" }],
    ["a sender that is not E.164", { from: "+0123" }],
    ["no sender", { from: undefined }],
    ["two senders", { messagingServiceSid: SERVICE }],
    ["a messaging service SID of the wrong form", { from: undefined, messagingServiceSid: "MG123" }],
    ["an empty text", { body: "  " }],
    ["a text of more than 1600 characters", { body: "x".repeat(TWILIO_LIMITS.body + 1) }],
    ["a validity of less than one second", { validityMs: 999 }],
    ["a validity of more than 10 hours", { validityMs: 36_001_000 }],
    ["a callback that is not an address", { statusCallback: "file:///tmp/x" }],
  ])("throws for %s", (_name, extra) => {
    expect(() => twilioTextRequest(CREDENTIALS, textOf(extra))).toThrow();
  });

  it("accepts a text of exactly 1600 characters", () => {
    expect(() => twilioTextRequest(CREDENTIALS, textOf({ body: "x".repeat(TWILIO_LIMITS.body) }))).not.toThrow();
  });

  it.each<[string, TwilioCredentials]>([
    ["an account SID of the wrong form", { accountSid: "AC123", secret: SECRET }],
    ["an API key SID of the wrong form", { accountSid: ACCOUNT, keySid: "SK123", secret: SECRET }],
    ["an empty secret", { accountSid: ACCOUNT, secret: "" }],
    ["a secret with a space", { accountSid: ACCOUNT, secret: "made up" }],
  ])("throws for %s, and the message does not hold the secret", (_name, credentials) => {
    expect(() => twilioTextRequest(credentials, textOf())).toThrow(expect.objectContaining({ message: expect.not.stringContaining("made") }));
  });
});

describe("twilioCallRequest", () => {
  it("posts the TwiML, the ring time, the machine detection and the time limit", () => {
    const twiml = twilioSayTwiml("A tornado warning.");
    const request = twilioCallRequest(
      CREDENTIALS,
      callOf({ twiml, ringMs: 45_000, machineDetection: "Enable", limitMs: 120_000, statusCallback: "https://example.com/twilio/call" }),
    );
    expect(request.url).toBe(`${TWILIO_API}/Accounts/${ACCOUNT}/Calls.json`);
    expect(request.method).toBe("POST");
    expect(form(request.body)).toEqual({
      To: TO,
      From: FROM,
      Twiml: twiml,
      Timeout: "45",
      MachineDetection: "Enable",
      TimeLimit: "120",
      StatusCallback: "https://example.com/twilio/call",
    });
  });

  it("posts a TwiML address in place of the TwiML", () => {
    const request = twilioCallRequest(CREDENTIALS, callOf({ twiml: undefined, url: "https://example.com/twiml.xml" }));
    expect(form(request.body)).toEqual({ To: TO, From: FROM, Url: "https://example.com/twiml.xml" });
  });

  it.each<[string, Partial<TwilioCall>]>([
    ["a number to call that is not E.164", { to: "911" }],
    ["a caller that is not E.164", { from: "caller" }],
    ["no TwiML and no address", { twiml: undefined }],
    ["a TwiML and an address", { url: "https://example.com/twiml.xml" }],
    ["a TwiML of more than 4000 characters", { twiml: "x".repeat(TWILIO_LIMITS.twiml + 1) }],
    ["a ring time of more than 600 seconds", { ringMs: 601_000 }],
    ["a ring time of less than one second", { ringMs: 500 }],
    ["a mode of the machine detection that is not known", { machineDetection: "Always" as "Enable" }],
    ["a time limit of more than 4 hours", { limitMs: 14_401_000 }],
  ])("throws for %s", (_name, extra) => {
    expect(() => twilioCallRequest(CREDENTIALS, callOf(extra))).toThrow();
  });
});

describe("the status and end requests", () => {
  it("reads a text and a call with a GET that has no body and no content type", () => {
    const text = twilioTextStatusRequest(CREDENTIALS, TEXT_SID);
    expect(text).toEqual({ url: `${TWILIO_API}/Accounts/${ACCOUNT}/Messages/${TEXT_SID}.json`, method: "GET", headers: { authorization: basic(ACCOUNT, SECRET), accept: "application/json" } });
    const call = twilioCallStatusRequest(CREDENTIALS, CALL_SID);
    expect(call.url).toBe(`${TWILIO_API}/Accounts/${ACCOUNT}/Calls/${CALL_SID}.json`);
    expect(call.method).toBe("GET");
    expect(call.body).toBeUndefined();
  });

  it("ends a call with the status completed, or cancels it", () => {
    const end = twilioEndCallRequest(CREDENTIALS, CALL_SID);
    expect(end.url).toBe(`${TWILIO_API}/Accounts/${ACCOUNT}/Calls/${CALL_SID}.json`);
    expect(end.method).toBe("POST");
    expect(form(end.body)).toEqual({ Status: "completed" });
    expect(form(twilioEndCallRequest(CREDENTIALS, CALL_SID, "canceled").body)).toEqual({ Status: "canceled" });
  });

  it("throws for a SID of the wrong form, so no SID adds a path to the URL", () => {
    expect(() => twilioTextStatusRequest(CREDENTIALS, `${TEXT_SID}/../x`)).toThrow();
    expect(() => twilioTextStatusRequest(CREDENTIALS, CALL_SID)).toThrow();
    expect(() => twilioCallStatusRequest(CREDENTIALS, TEXT_SID)).toThrow();
    expect(() => twilioEndCallRequest(CREDENTIALS, "CA1")).toThrow();
    expect(() => twilioEndCallRequest(CREDENTIALS, CALL_SID, "busy" as "canceled")).toThrow();
  });
});

describe("twilioSayTwiml", () => {
  it("says the text in a TwiML document", () => {
    expect(twilioSayTwiml("Tornado warning.")).toBe('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Tornado warning.</Say></Response>');
  });

  it("repeats the text with a pause of one second between two repeats", () => {
    expect(twilioSayTwiml("Go now.", 3)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Go now.</Say><Pause length="1"/><Say>Go now.</Say><Pause length="1"/><Say>Go now.</Say></Response>',
    );
  });

  it("escapes the markup of the text, so the text cannot add a verb", () => {
    const twiml = twilioSayTwiml(`Wind & hail </Say><Dial>${TO}</Dial><Say> "now"`);
    expect(twiml).toContain("Wind &amp; hail &lt;/Say&gt;&lt;Dial&gt;");
    expect(twiml.match(/<Say>/g)).toHaveLength(1);
    expect(twiml).not.toContain("<Dial>");
  });

  it("changes each character that XML does not allow to a space", () => {
    expect(twilioSayTwiml("a\u0000b\u0007c\td\ne")).toContain("<Say>a b c\td\ne</Say>");
  });

  it("throws for an empty text, a count of repeats out of range, and a TwiML of more than 4000 characters", () => {
    expect(() => twilioSayTwiml(" ")).toThrow();
    expect(() => twilioSayTwiml("Go.", 0)).toThrow();
    expect(() => twilioSayTwiml("Go.", 11)).toThrow();
    expect(() => twilioSayTwiml("Go.", 1.5)).toThrow();
    expect(() => twilioSayTwiml("x".repeat(TWILIO_LIMITS.twiml))).toThrow();
    expect(() => twilioSayTwiml("&".repeat(900))).toThrow();
  });
});

describe("extractTwilioText", () => {
  it("reads a text in the queue", () => {
    expect(extractTwilioText(ok(MESSAGE))).toEqual({
      ok: true,
      sid: TEXT_SID,
      status: "queued",
      state: "pending",
      segments: 1,
      createdAt: Date.UTC(2023, 7, 24, 5, 1, 45),
      sentAt: Date.UTC(2023, 7, 24, 5, 1, 45),
      updatedAt: Date.UTC(2023, 7, 24, 5, 1, 45),
    });
  });

  it("reads a text that the carrier did not deliver, with its error code", () => {
    const read = extractTwilioText(ok({ ...MESSAGE, status: "undelivered", error_code: 30003, error_message: "Unreachable destination handset" }, 200));
    expect(read).toMatchObject({ ok: true, state: "failed", errorCode: 30003, errorMessage: "Unreachable destination handset" });
  });

  it("refuses a body with no SID, a SID of a call, or no status, as a server failure", () => {
    expect(extractTwilioText(ok({ ...MESSAGE, sid: undefined }))).toMatchObject({ ok: false, kind: "server", status: 201 });
    expect(extractTwilioText(ok({ ...MESSAGE, sid: CALL_SID }))).toMatchObject({ ok: false, kind: "server" });
    expect(extractTwilioText(ok({ ...MESSAGE, status: "" }))).toMatchObject({ ok: false, kind: "server" });
    expect(extractTwilioText({ status: 200, text: "<html>" })).toMatchObject({ ok: false, kind: "server", status: 200 });
    expect(extractTwilioText({ status: 200, text: "[]" })).toMatchObject({ ok: false, kind: "server" });
  });

  it("sorts the failures of Twilio by their HTTP status, with the code and the message of Twilio", () => {
    expect(extractTwilioText(error(400, 21211, "Invalid 'To' Phone Number"))).toEqual({
      ok: false,
      kind: "refused",
      status: 400,
      errors: ["Invalid 'To' Phone Number"],
      code: 21211,
    });
    expect(extractTwilioText(error(401, 20003, "Authenticate"))).toMatchObject({ kind: "auth", code: 20003 });
    expect(extractTwilioText(error(403, 20403, "Forbidden"))).toMatchObject({ kind: "auth" });
    expect(extractTwilioText(error(404, 20404, "Not found"))).toMatchObject({ kind: "refused" });
    expect(extractTwilioText(error(500, 20500, "Internal Server Error"))).toMatchObject({ kind: "server", retryAfterMs: TWILIO_MIN_WAIT_MS });
    expect(extractTwilioText({ status: 503, text: "" })).toEqual({
      ok: false,
      kind: "server",
      status: 503,
      errors: ["Twilio gave HTTP 503."],
      retryAfterMs: TWILIO_MIN_WAIT_MS,
    });
  });

  it("waits for the Retry-After header of a refusal of the concurrency limit, and at least the minimum wait", () => {
    expect(extractTwilioText({ ...error(429, 20429, "Too Many Requests"), headers: headers({ "retry-after": "30" }) })).toMatchObject({
      kind: "rate-limited",
      code: 20429,
      retryAfterMs: 30_000,
    });
    expect(extractTwilioText({ ...error(429, 20429, "Too Many Requests"), headers: headers({ "retry-after": "1" }) })).toMatchObject({ retryAfterMs: TWILIO_MIN_WAIT_MS });
    expect(extractTwilioText({ ...error(429, 20429, "Too Many Requests"), headers: headers({ "retry-after": "soon" }) })).toMatchObject({ retryAfterMs: TWILIO_MIN_WAIT_MS });
  });
});

describe("extractTwilioCall", () => {
  it("reads a call in the queue", () => {
    expect(extractTwilioCall(ok(CALL))).toEqual({ ok: true, sid: CALL_SID, status: "queued", state: "pending", ended: false });
  });

  it("reads a call that a person answered, with its duration and its times", () => {
    const read = extractTwilioCall(
      ok({ ...CALL, status: "completed", answered_by: "human", duration: "15", start_time: "Tue, 31 Aug 2010 20:36:29 +0000", end_time: "Tue, 31 Aug 2010 20:36:44 +0000" }, 200),
    );
    expect(read).toEqual({
      ok: true,
      sid: CALL_SID,
      status: "completed",
      state: "answered",
      ended: true,
      answeredBy: "human",
      durationMs: 15_000,
      startedAt: Date.UTC(2010, 7, 31, 20, 36, 29),
      endedAt: Date.UTC(2010, 7, 31, 20, 36, 44),
    });
  });

  it("reads a call that nobody answered as ended", () => {
    expect(extractTwilioCall(ok({ ...CALL, status: "no-answer", duration: "0" }, 200))).toMatchObject({ state: "unanswered", ended: true, durationMs: 0 });
  });

  it("refuses a body with the SID of a text", () => {
    expect(extractTwilioCall(ok({ ...CALL, sid: TEXT_SID }))).toMatchObject({ ok: false, kind: "server" });
  });

  it("sorts a refusal of a number that cannot get calls", () => {
    expect(extractTwilioCall(error(400, 21215, `Account not authorized to call ${TO}`))).toMatchObject({ ok: false, kind: "refused", code: 21215 });
  });
});

describe("the states", () => {
  it.each([
    ["queued", "pending"],
    ["accepted", "pending"],
    ["scheduled", "pending"],
    ["sending", "pending"],
    ["sent", "pending"],
    ["a status that is not known", "pending"],
    ["delivered", "delivered"],
    ["read", "delivered"],
    ["failed", "failed"],
    ["undelivered", "failed"],
    ["canceled", "failed"],
  ])("a text with the status %s is %s", (status, state) => {
    expect(twilioTextState(status)).toBe(state);
  });

  it.each<[string, string | undefined, string]>([
    ["queued", undefined, "pending"],
    ["initiated", undefined, "pending"],
    ["ringing", undefined, "pending"],
    ["in-progress", undefined, "connected"],
    ["in-progress", "unknown", "connected"],
    ["in-progress", "human", "answered"],
    ["completed", "human", "answered"],
    ["completed", "machine_start", "machine"],
    ["completed", "machine_end_beep", "machine"],
    ["completed", "fax", "machine"],
    ["completed", undefined, "connected"],
    ["busy", undefined, "unanswered"],
    ["no-answer", undefined, "unanswered"],
    ["canceled", undefined, "unanswered"],
    ["failed", undefined, "failed"],
  ])("a call with the status %s, answered by %s, is %s", (status, answeredBy, state) => {
    expect(twilioCallState(status, answeredBy)).toBe(state);
  });
});

describe("callTwilio", () => {
  it("sends the request through the fetch and reads the answer", async () => {
    const fetchMock = vi.fn<TwilioFetch>(async () => new Response(JSON.stringify(MESSAGE), { status: 201 }));
    const request = twilioTextRequest(CREDENTIALS, textOf());
    expect(await callTwilio(fetchMock, request, extractTwilioText, { timeoutMs: 1000 })).toMatchObject({ ok: true, sid: TEXT_SID });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(request.url);
    expect(init).toMatchObject({ method: "POST", body: request.body, headers: request.headers });
  });

  it("gives a failure, not an error, when the network fails or no answer comes", async () => {
    const refused: TwilioFetch = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await callTwilio(refused, twilioCallStatusRequest(CREDENTIALS, CALL_SID), extractTwilioCall, { timeoutMs: 1000 })).toEqual({
      ok: false,
      kind: "network",
      status: 0,
      errors: ["The request did not reach Twilio."],
      retryAfterMs: TWILIO_MIN_WAIT_MS,
    });
    const silent: TwilioFetch = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason as Error)));
    expect(await callTwilio(silent, twilioCallStatusRequest(CREDENTIALS, CALL_SID), extractTwilioCall, { timeoutMs: 20 })).toMatchObject({
      ok: false,
      kind: "timeout",
      errors: ["Twilio did not answer in 20 ms."],
    });
  });

  it("throws the reason when the caller aborts", async () => {
    const silent: TwilioFetch = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason as Error)));
    const controller = new AbortController();
    const call = callTwilio(silent, twilioCallStatusRequest(CREDENTIALS, CALL_SID), extractTwilioCall, { timeoutMs: 60_000, signal: controller.signal });
    controller.abort(new Error("drain"));
    await expect(call).rejects.toThrow("drain");
  });
});
