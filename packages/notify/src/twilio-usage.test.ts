import { describe, expect, it } from "vitest";
import {
  TWILIO_API,
  TWILIO_LIMITS,
  extractTwilioUsageRecords,
  twilioNextPageRequest,
  twilioUsageRecordsRequest,
  type TwilioCredentials,
  type TwilioUsageQuery,
} from "./twilio.js";

// The keys and the SIDs are made up. The bodies have the shapes of the API documentation
// (twilio.com/docs/usage/api/usage-record), read on 2026-11-18. The documents give `price` as a
// decimal text in one example and as a number in another, so the tests use both.
const ACCOUNT = `AC${"0123456789abcdef".repeat(2)}`;
const KEY = `SK${"fedcba9876543210".repeat(2)}`;
const SECRET = "madeupsecret00000000000000000000";
const CREDENTIALS: TwilioCredentials = { accountSid: ACCOUNT, secret: SECRET };
const RECORDS = `${TWILIO_API}/Accounts/${ACCOUNT}/Usage/Records.json`;
const NEXT = `/2010-04-01/Accounts/${ACCOUNT}/Usage/Records.json?Category=totalprice&StartDate=2026-11-01&EndDate=2026-11-17&PageSize=1&Page=1&PageToken=PAMQ`;

const basic = (user: string, secret: string): string => `Basic ${Buffer.from(`${user}:${secret}`).toString("base64")}`;
const search = (url: string): Record<string, string> => Object.fromEntries(new URL(url).searchParams);
const ok = (body: unknown) => ({ status: 200, text: JSON.stringify(body) });
const error = (status: number, code: number, message: string) => ({
  status,
  text: JSON.stringify({ code, message, more_info: `https://www.twilio.com/docs/errors/${code}`, status }),
});

const record = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  account_sid: ACCOUNT,
  api_version: "2010-04-01",
  as_of: "2026-11-17T22:32:49+00:00",
  category: "totalprice",
  count: null,
  count_unit: "",
  description: "Total Price",
  end_date: "2026-11-17",
  price: "1.27350",
  price_unit: "usd",
  start_date: "2026-11-01",
  subresource_uris: {},
  uri: `/2010-04-01/Accounts/${ACCOUNT}/Usage/Records.json?Category=totalprice&StartDate=2026-11-01&EndDate=2026-11-17`,
  usage: "1.27350",
  usage_unit: "usd",
  ...extra,
});

const page = (records: readonly unknown[], extra: Record<string, unknown> = {}) => ({
  end: Math.max(records.length - 1, 0),
  first_page_uri: `/2010-04-01/Accounts/${ACCOUNT}/Usage/Records.json?PageSize=50&Page=0`,
  next_page_uri: null,
  page: 0,
  page_size: 50,
  previous_page_uri: null,
  start: 0,
  uri: `/2010-04-01/Accounts/${ACCOUNT}/Usage/Records.json?PageSize=50&Page=0`,
  usage_records: records,
  ...extra,
});

describe("twilioUsageRecordsRequest", () => {
  it("gets the usage records of the account, with Basic authentication and no query", () => {
    const request = twilioUsageRecordsRequest(CREDENTIALS);
    expect(request).toEqual({ url: RECORDS, method: "GET", headers: { authorization: basic(ACCOUNT, SECRET), accept: "application/json" } });
    expect(twilioUsageRecordsRequest(CREDENTIALS, {}).url).toBe(RECORDS);
  });

  it("authenticates with the API key, and keeps the account in the URL", () => {
    const request = twilioUsageRecordsRequest({ accountSid: ACCOUNT, keySid: KEY, secret: SECRET }, { category: "totalprice" });
    expect(request.headers["authorization"]).toBe(basic(KEY, SECRET));
    expect(request.url).toBe(`${RECORDS}?Category=totalprice`);
  });

  it("gives all the filters, encoded for a URL", () => {
    const query: TwilioUsageQuery = { category: "totalprice", startDate: "2026-11-01", endDate: "2026-11-17", pageSize: 1000 };
    const request = twilioUsageRecordsRequest(CREDENTIALS, query);
    expect(request.url).toBe(`${RECORDS}?Category=totalprice&StartDate=2026-11-01&EndDate=2026-11-17&PageSize=1000`);
    expect(search(request.url)).toEqual({ Category: "totalprice", StartDate: "2026-11-01", EndDate: "2026-11-17", PageSize: "1000" });
  });

  it("accepts one day, a start with no end, and the categories with dashes", () => {
    expect(search(twilioUsageRecordsRequest(CREDENTIALS, { startDate: "2026-11-17", endDate: "2026-11-17" }).url)).toEqual({ StartDate: "2026-11-17", EndDate: "2026-11-17" });
    expect(search(twilioUsageRecordsRequest(CREDENTIALS, { startDate: "2026-02-28" }).url)).toEqual({ StartDate: "2026-02-28" });
    expect(search(twilioUsageRecordsRequest(CREDENTIALS, { category: "sms-outbound" }).url)).toEqual({ Category: "sms-outbound" });
    expect(search(twilioUsageRecordsRequest(CREDENTIALS, { category: "phonenumbers" }).url)).toEqual({ Category: "phonenumbers" });
  });

  it("ignores the filters that are undefined", () => {
    expect(twilioUsageRecordsRequest(CREDENTIALS, { category: undefined, startDate: undefined, endDate: undefined, pageSize: undefined }).url).toBe(RECORDS);
  });

  it("accepts the page sizes 1 and 1000", () => {
    expect(TWILIO_LIMITS.pageSize).toBe(1000);
    expect(search(twilioUsageRecordsRequest(CREDENTIALS, { pageSize: 1 }).url)).toEqual({ PageSize: "1" });
    expect(search(twilioUsageRecordsRequest(CREDENTIALS, { pageSize: 1000 }).url)).toEqual({ PageSize: "1000" });
  });

  it.each<[string, TwilioUsageQuery]>([
    ["a day that is not in the calendar", { startDate: "2026-02-30" }],
    ["a day with one digit of the month", { startDate: "2026-1-01" }],
    ["an offset of Twilio", { startDate: "-30days" }],
    ["a time in place of a day", { endDate: "2026-11-17T00:00:00Z" }],
    ["a start after the end", { startDate: "2026-11-18", endDate: "2026-11-17" }],
    ["an empty category", { category: "" }],
    ["a category with capital letters", { category: "TotalPrice" }],
    ["a category with a space", { category: "total price" }],
    ["a category with a slash", { category: "calls/inbound" }],
    ["a page size of 0", { pageSize: 0 }],
    ["a page size of 1001", { pageSize: 1001 }],
    ["a page size that is not an integer", { pageSize: 1.5 }],
  ])("throws for %s", (_name, query) => {
    expect(() => twilioUsageRecordsRequest(CREDENTIALS, query)).toThrow();
  });

  it("names the filter in each error", () => {
    expect(() => twilioUsageRecordsRequest(CREDENTIALS, { startDate: "2026-02-30" })).toThrow(/start date/);
    expect(() => twilioUsageRecordsRequest(CREDENTIALS, { endDate: "17-11-2026" })).toThrow(/end date/);
    expect(() => twilioUsageRecordsRequest(CREDENTIALS, { startDate: "2026-11-18", endDate: "2026-11-17" })).toThrow(/after the end date/);
    expect(() => twilioUsageRecordsRequest(CREDENTIALS, { category: "A" })).toThrow(/category/);
    expect(() => twilioUsageRecordsRequest(CREDENTIALS, { pageSize: 0 })).toThrow(/page size/);
  });

  it("throws for credentials that do not have the forms of Twilio", () => {
    expect(() => twilioUsageRecordsRequest({ accountSid: "AC123", secret: SECRET })).toThrow(/account SID/);
    expect(() => twilioUsageRecordsRequest({ accountSid: ACCOUNT, keySid: "SK123", secret: SECRET })).toThrow(/API key SID/);
    expect(() => twilioUsageRecordsRequest({ accountSid: ACCOUNT, secret: "" })).toThrow(/secret/);
  });

  it("reads the next page of the records through twilioNextPageRequest", () => {
    expect(twilioNextPageRequest(CREDENTIALS, NEXT).url).toBe(`https://api.twilio.com${NEXT}`);
  });
});

describe("extractTwilioUsageRecords", () => {
  it("reads the records of a page, with the price as text and as a number, and the path of the next page", () => {
    const calls = record({ category: "calls", count: "12", count_unit: "calls", price: 0.48, usage: "14", usage_unit: "minutes", description: "Voice Minutes" });
    expect(extractTwilioUsageRecords(ok(page([record(), calls], { next_page_uri: NEXT })))).toEqual({
      ok: true,
      records: [
        {
          category: "totalprice",
          startDate: "2026-11-01",
          endDate: "2026-11-17",
          price: 1.2735,
          priceText: "1.27350",
          priceUnit: "usd",
          usage: 1.2735,
          usageUnit: "usd",
          asOf: Date.parse("2026-11-17T22:32:49Z"),
        },
        {
          category: "calls",
          startDate: "2026-11-01",
          endDate: "2026-11-17",
          price: 0.48,
          priceText: "0.48",
          priceUnit: "usd",
          usage: 14,
          usageUnit: "minutes",
          count: 12,
          countUnit: "calls",
          asOf: Date.parse("2026-11-17T22:32:49Z"),
        },
      ],
      nextPageUri: NEXT,
    });
  });

  it("gives no next page on the last page, and no records for an empty page", () => {
    expect(extractTwilioUsageRecords(ok(page([], { next_page_uri: null })))).toEqual({ ok: true, records: [] });
  });

  it("keeps a price of 0 and a credit below 0", () => {
    const records = (body: unknown) => {
      const read = extractTwilioUsageRecords(ok(body));
      return read.ok ? read.records.map((entry) => entry.price) : read;
    };
    expect(records(page([record({ price: "0" }), record({ price: 0 }), record({ price: "-0.75" })]))).toEqual([0, 0, -0.75]);
  });

  it("leaves out a usage, a count and a time that Twilio does not give", () => {
    const read = extractTwilioUsageRecords(ok(page([record({ usage: null, usage_unit: null, count: null, count_unit: "", as_of: null })])));
    expect(read.ok && read.records[0]).toEqual({ category: "totalprice", startDate: "2026-11-01", endDate: "2026-11-17", price: 1.2735, priceText: "1.27350", priceUnit: "usd" });
  });

  it.each<[string, Record<string, unknown>]>([
    ["no category", { category: null }],
    ["no first day", { start_date: undefined }],
    ["a first day that is a time", { start_date: "2026-11-01T00:00:00Z" }],
    ["no last day", { end_date: "" }],
    ["no price", { price: null }],
    ["a price that is not a decimal", { price: "1.2.3" }],
    ["a price that is not finite", { price: "Infinity" }],
    ["no currency", { price_unit: null }],
  ])("gives a failure for a record with %s, because the sum is not complete", (_name, extra) => {
    const read = extractTwilioUsageRecords(ok(page([record(), record(extra)])));
    expect(read).toMatchObject({ ok: false, kind: "server", status: 200 });
  });

  it("gives a failure for an answer with no list of records, and for an entry that is not an object", () => {
    expect(extractTwilioUsageRecords(ok({ page: 0 }))).toMatchObject({ ok: false, kind: "server" });
    expect(extractTwilioUsageRecords(ok(page(["totalprice"])))).toMatchObject({ ok: false, kind: "server" });
    expect(extractTwilioUsageRecords(ok(page([null])))).toMatchObject({ ok: false, kind: "server" });
  });

  it("gives the failure of the account for an error of Twilio", () => {
    expect(extractTwilioUsageRecords(error(401, 20003, "Authenticate"))).toMatchObject({ ok: false, kind: "auth", status: 401 });
    expect(extractTwilioUsageRecords(error(429, 20429, "Too Many Requests"))).toMatchObject({ ok: false, status: 429 });
  });
});
