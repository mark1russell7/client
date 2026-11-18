import { describe, expect, it } from "vitest";
import {
  TWILIO_API,
  TWILIO_HELP_KEYWORDS,
  TWILIO_LIMITS,
  TWILIO_MIN_WAIT_MS,
  TWILIO_OPT_IN_KEYWORDS,
  TWILIO_OPT_OUT_KEYWORDS,
  extractTwilioMessages,
  twilioMessageListRequest,
  twilioNextPageRequest,
  twilioOptOutKeyword,
  type TwilioCredentials,
  type TwilioMessageQuery,
} from "./twilio.js";

// The keys, the SIDs and the numbers are made up. The country code 999 is not in use.
// The bodies have the shapes of the API documentation (twilio.com/docs/messaging/api/message-resource),
// read on 2026-11-17.
const ACCOUNT = `AC${"0123456789abcdef".repeat(2)}`;
const KEY = `SK${"fedcba9876543210".repeat(2)}`;
const SECRET = "madeupsecret00000000000000000000";
const CREDENTIALS: TwilioCredentials = { accountSid: ACCOUNT, secret: SECRET };
const TWILIO_NUMBER = "+999000101";
const PERSON = "+999000102";
const INBOUND_SID = `SM${"a".repeat(32)}`;
const OUTBOUND_SID = `SM${"b".repeat(32)}`;
const MEDIA_SID = `MM${"c".repeat(32)}`;
const MESSAGES = `${TWILIO_API}/Accounts/${ACCOUNT}/Messages.json`;

const basic = (user: string, secret: string): string => `Basic ${Buffer.from(`${user}:${secret}`).toString("base64")}`;
const search = (url: string): Record<string, string> => Object.fromEntries(new URL(url).searchParams);
const headers = (values: Record<string, string>): { get(name: string): string | null } => ({ get: (name) => values[name.toLowerCase()] ?? null });
const ok = (body: unknown) => ({ status: 200, text: JSON.stringify(body) });
const error = (status: number, code: number, message: string) => ({
  status,
  text: JSON.stringify({ code, message, more_info: `https://www.twilio.com/docs/errors/${code}`, status }),
});

const message = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  account_sid: ACCOUNT,
  api_version: "2010-04-01",
  body: "STOP",
  date_created: "Tue, 17 Nov 2026 05:01:45 +0000",
  date_sent: "Tue, 17 Nov 2026 05:01:45 +0000",
  date_updated: "Tue, 17 Nov 2026 05:01:46 +0000",
  direction: "inbound",
  error_code: null,
  error_message: null,
  from: PERSON,
  messaging_service_sid: null,
  num_media: "0",
  num_segments: "1",
  price: null,
  price_unit: "USD",
  sid: INBOUND_SID,
  status: "received",
  subresource_uris: { media: `/2010-04-01/Accounts/${ACCOUNT}/Messages/${INBOUND_SID}/Media.json` },
  to: TWILIO_NUMBER,
  uri: `/2010-04-01/Accounts/${ACCOUNT}/Messages/${INBOUND_SID}.json`,
  ...extra,
});

const NEXT = `/2010-04-01/Accounts/${ACCOUNT}/Messages.json?To=%2B999000101&PageSize=2&Page=1&PageToken=PAMadeUpToken`;

const page = (messages: readonly unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  end: messages.length - 1,
  first_page_uri: `/2010-04-01/Accounts/${ACCOUNT}/Messages.json?To=%2B999000101&PageSize=2&Page=0`,
  messages,
  next_page_uri: NEXT,
  page: 0,
  page_size: 2,
  previous_page_uri: null,
  start: 0,
  uri: `/2010-04-01/Accounts/${ACCOUNT}/Messages.json?To=%2B999000101&PageSize=2&Page=0`,
  ...extra,
});

describe("twilioMessageListRequest", () => {
  it("gets the Messages resource of the account, with Basic authentication and no query", () => {
    const request = twilioMessageListRequest(CREDENTIALS);
    expect(request).toEqual({ url: MESSAGES, method: "GET", headers: { authorization: basic(ACCOUNT, SECRET), accept: "application/json" } });
    expect(twilioMessageListRequest(CREDENTIALS, {}).url).toBe(MESSAGES);
  });

  it("authenticates with the API key, and keeps the account in the URL", () => {
    const request = twilioMessageListRequest({ accountSid: ACCOUNT, keySid: KEY, secret: SECRET }, { to: TWILIO_NUMBER });
    expect(request.headers["authorization"]).toBe(basic(KEY, SECRET));
    expect(request.url.startsWith(`${MESSAGES}?`)).toBe(true);
  });

  it.each<[string, TwilioMessageQuery, Record<string, string>]>([
    ["to", { to: TWILIO_NUMBER }, { To: TWILIO_NUMBER }],
    ["from", { from: PERSON }, { From: PERSON }],
    ["a day", { dateSentAfter: "2026-11-17" }, { "DateSent>": "2026-11-17" }],
    ["a time in whole seconds of UTC", { dateSentAfter: Date.UTC(2026, 10, 17, 5, 1, 45, 999) }, { "DateSent>": "2026-11-17T05:01:45Z" }],
    ["the start of the epoch", { dateSentAfter: 0 }, { "DateSent>": "1970-01-01T00:00:00Z" }],
    ["a page size", { pageSize: 20 }, { PageSize: "20" }],
  ])("gives the filter %s", (_name, query, fields) => {
    expect(search(twilioMessageListRequest(CREDENTIALS, query).url)).toEqual(fields);
  });

  it("gives all the filters in the order of the helper libraries, encoded for a URL", () => {
    const request = twilioMessageListRequest(CREDENTIALS, { to: TWILIO_NUMBER, from: PERSON, dateSentAfter: "2026-11-01", pageSize: 1000 });
    expect(request.url).toBe(`${MESSAGES}?To=%2B999000101&From=%2B999000102&DateSent%3E=2026-11-01&PageSize=1000`);
    expect(search(request.url)).toEqual({ To: TWILIO_NUMBER, From: PERSON, "DateSent>": "2026-11-01", PageSize: "1000" });
  });

  it("ignores the filters that are undefined", () => {
    expect(twilioMessageListRequest(CREDENTIALS, { to: undefined, from: undefined, dateSentAfter: undefined, pageSize: undefined }).url).toBe(MESSAGES);
  });

  it("accepts the page sizes 1 and 1000", () => {
    expect(TWILIO_LIMITS.pageSize).toBe(1000);
    expect(search(twilioMessageListRequest(CREDENTIALS, { pageSize: 1 }).url)).toEqual({ PageSize: "1" });
    expect(search(twilioMessageListRequest(CREDENTIALS, { pageSize: 1000 }).url)).toEqual({ PageSize: "1000" });
  });

  it.each<[string, TwilioMessageQuery]>([
    ["a page size of 0", { pageSize: 0 }],
    ["a page size of 1001", { pageSize: 1001 }],
    ["a page size that is not an integer", { pageSize: 2.5 }],
    ["a page size that is not a number", { pageSize: Number.NaN }],
    ["a recipient that is not E.164", { to: "5550100001" }],
    ["a sender that is not E.164", { from: "+0123" }],
    ["a day that does not exist", { dateSentAfter: "2026-02-30" }],
    ["a day of another form", { dateSentAfter: "11/17/2026" }],
    ["a day with a time", { dateSentAfter: "2026-11-17T05:01:45Z" }],
    ["a time before 1970", { dateSentAfter: -1 }],
    ["a time after 9999", { dateSentAfter: 253_402_300_800_000 }],
    ["a time that is not finite", { dateSentAfter: Number.POSITIVE_INFINITY }],
  ])("throws for %s", (_name, query) => {
    expect(() => twilioMessageListRequest(CREDENTIALS, query)).toThrow();
  });

  it("throws for credentials that do not have the forms of Twilio", () => {
    expect(() => twilioMessageListRequest({ accountSid: "AC123", secret: SECRET })).toThrow(/account SID/);
    expect(() => twilioMessageListRequest({ accountSid: ACCOUNT, keySid: "SK123", secret: SECRET })).toThrow(/API key SID/);
    expect(() => twilioMessageListRequest({ accountSid: ACCOUNT, secret: "" })).toThrow(/secret/);
  });
});

describe("twilioNextPageRequest", () => {
  it("gets the next page from the path of Twilio, with the credentials", () => {
    const request = twilioNextPageRequest(CREDENTIALS, NEXT);
    expect(request).toEqual({ url: `https://api.twilio.com${NEXT}`, method: "GET", headers: { authorization: basic(ACCOUNT, SECRET), accept: "application/json" } });
  });

  it("also accepts the full address of the API", () => {
    expect(twilioNextPageRequest(CREDENTIALS, `https://api.twilio.com${NEXT}`).url).toBe(`https://api.twilio.com${NEXT}`);
  });

  it.each<[string, string]>([
    ["another host", `https://example.com${NEXT}`],
    ["a host that starts with no scheme", `//example.com${NEXT}`],
    ["plain http", `http://api.twilio.com${NEXT}`],
    ["another API", "/v1/Services"],
    ["a path out of the API", "/2010-04-01/../v1/Services"],
    ["the base with no slash", "/2010-04-01"],
  ])("throws for %s", (_name, uri) => {
    expect(() => twilioNextPageRequest(CREDENTIALS, uri)).toThrow();
  });

  it("throws for an address with a user or a password", () => {
    const withUser = new URL(`https://api.twilio.com${NEXT}`);
    withUser.username = "someone";
    expect(() => twilioNextPageRequest(CREDENTIALS, withUser.href)).toThrow();
    const withPassword = new URL(`https://api.twilio.com${NEXT}`);
    withPassword.password = "madeup";
    expect(() => twilioNextPageRequest(CREDENTIALS, withPassword.href)).toThrow();
  });
});

describe("extractTwilioMessages", () => {
  it("reads the texts of a page, with the dates in milliseconds and the path of the next page", () => {
    const outbound = message({
      sid: OUTBOUND_SID,
      body: "A test text.",
      direction: "outbound-api",
      status: "undelivered",
      from: TWILIO_NUMBER,
      to: PERSON,
      date_sent: "Tue, 17 Nov 2026 04:00:00 +0000",
      error_code: 30003,
      error_message: "Unreachable destination handset",
    });
    expect(extractTwilioMessages(ok(page([message(), outbound])))).toEqual({
      ok: true,
      messages: [
        { sid: INBOUND_SID, from: PERSON, to: TWILIO_NUMBER, body: "STOP", direction: "inbound", status: "received", dateSent: Date.UTC(2026, 10, 17, 5, 1, 45) },
        { sid: OUTBOUND_SID, from: TWILIO_NUMBER, to: PERSON, body: "A test text.", direction: "outbound-api", status: "undelivered", dateSent: Date.UTC(2026, 10, 17, 4), errorCode: 30003 },
      ],
      nextPageUri: NEXT,
    });
  });

  it("gives no next page on the last page, and no texts for an empty page", () => {
    expect(extractTwilioMessages(ok(page([], { next_page_uri: null })))).toEqual({ ok: true, messages: [] });
  });

  it("keeps a text with only media and a text of a messaging service with no sender and no date yet", () => {
    const media = message({ sid: MEDIA_SID, body: "", num_media: "1" });
    const queued = message({ sid: OUTBOUND_SID, body: "A test text.", direction: "outbound-api", status: "accepted", from: null, to: PERSON, date_sent: null });
    const read = extractTwilioMessages(ok(page([media, queued])));
    expect(read).toMatchObject({ ok: true });
    if (!read.ok) return;
    expect(read.messages[0]).toEqual({ sid: MEDIA_SID, from: PERSON, to: TWILIO_NUMBER, body: "", direction: "inbound", status: "received", dateSent: Date.UTC(2026, 10, 17, 5, 1, 45) });
    expect(read.messages[1]).toEqual({ sid: OUTBOUND_SID, to: PERSON, body: "A test text.", direction: "outbound-api", status: "accepted" });
  });

  it("refuses a body with no list, or a text with no SID, no recipient, no direction or no status, as a server failure", () => {
    expect(extractTwilioMessages(ok({ ...page([]), messages: undefined }))).toMatchObject({ ok: false, kind: "server", status: 200 });
    expect(extractTwilioMessages(ok(page(["STOP"])))).toMatchObject({ ok: false, kind: "server" });
    for (const extra of [{ sid: undefined }, { sid: `CA${"d".repeat(32)}` }, { to: null }, { direction: "" }, { status: undefined }]) {
      expect(extractTwilioMessages(ok(page([message(extra)]))), JSON.stringify(extra)).toMatchObject({ ok: false, kind: "server" });
    }
    expect(extractTwilioMessages({ status: 200, text: "<html>" })).toMatchObject({ ok: false, kind: "server", status: 200 });
    expect(extractTwilioMessages({ status: 200, text: "[]" })).toMatchObject({ ok: false, kind: "server" });
  });

  it("sorts the failures of Twilio by their HTTP status, with the code and the message of Twilio", () => {
    expect(extractTwilioMessages(error(400, 20001, "Invalid DateSent"))).toEqual({ ok: false, kind: "refused", status: 400, errors: ["Invalid DateSent"], code: 20001 });
    expect(extractTwilioMessages(error(401, 20003, "Authenticate"))).toMatchObject({ ok: false, kind: "auth", code: 20003 });
    expect(extractTwilioMessages(error(404, 20404, "The requested resource was not found"))).toMatchObject({ ok: false, kind: "refused", code: 20404 });
    expect(extractTwilioMessages(error(500, 20500, "Internal Server Error"))).toMatchObject({ ok: false, kind: "server", retryAfterMs: TWILIO_MIN_WAIT_MS });
    expect(extractTwilioMessages({ ...error(429, 20429, "Too Many Requests"), headers: headers({ "retry-after": "30" }) })).toMatchObject({
      ok: false,
      kind: "rate-limited",
      code: 20429,
      retryAfterMs: 30_000,
    });
  });
});

describe("twilioOptOutKeyword", () => {
  it("gives the default keyword lists of Twilio", () => {
    expect(TWILIO_OPT_OUT_KEYWORDS).toEqual(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
    expect(TWILIO_OPT_IN_KEYWORDS).toEqual(["START", "YES", "UNSTOP"]);
    expect(TWILIO_HELP_KEYWORDS).toEqual(["HELP", "INFO"]);
  });

  it.each(TWILIO_OPT_OUT_KEYWORDS.map((word) => [word]))("gives stop for %s", (word) => {
    expect(twilioOptOutKeyword(word)).toBe("stop");
  });

  it.each(TWILIO_OPT_IN_KEYWORDS.map((word) => [word]))("gives start for %s", (word) => {
    expect(twilioOptOutKeyword(word)).toBe("start");
  });

  it.each(TWILIO_HELP_KEYWORDS.map((word) => [word]))("gives help for %s", (word) => {
    expect(twilioOptOutKeyword(word)).toBe("help");
  });

  it("ignores the case of the letters", () => {
    for (const word of ["stop", "Stop", "sTOP", "StopAll", "unsubscribe", "OptOut"]) expect(twilioOptOutKeyword(word), word).toBe("stop");
    for (const word of ["start", "Yes", "unStop"]) expect(twilioOptOutKeyword(word), word).toBe("start");
    for (const word of ["help", "Info"]) expect(twilioOptOutKeyword(word), word).toBe("help");
  });

  it("ignores the white space before and after the keyword", () => {
    for (const body of [" STOP", "STOP ", "  stop\n", "\tStop\r\n", " STOP "]) expect(twilioOptOutKeyword(body), JSON.stringify(body)).toBe("stop");
    expect(twilioOptOutKeyword("\n start \n")).toBe("start");
    expect(twilioOptOutKeyword(" help ")).toBe("help");
  });

  it("gives undefined for a text that is not only a keyword", () => {
    for (const body of [
      "stop please",
      "Please stop",
      "Stop, that is funny",
      "STOP!",
      "STOP.",
      "STOP ALL",
      "OPT OUT",
      "S T O P",
      "STOPP",
      "STO",
      "NO",
      "",
      "   ",
      "ſtop",
      "QUıT",
      "A tornado warning covers the place.",
    ]) {
      expect(twilioOptOutKeyword(body), JSON.stringify(body)).toBeUndefined();
    }
  });
});
