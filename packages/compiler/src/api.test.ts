/**
 * The format `api-operation/1`: the request of a call and the read of its answer, from data only. The operation of
 * these tests sends one text through a made-up service.
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type ApiOperation, type ApiResponse, type ApiTerm, apiOperationIssues, buildApiRequest, extractApiResponse } from "./api.js";

const op = (name: string, ...args: ApiTerm[]): ApiTerm => ({ type: ["ops", name], value: args });
const ref = (...path: string[]): ApiTerm => ({ type: "ref", value: ["names", ...path] });
const when = (test: ApiTerm, then: ApiTerm, otherwise: ApiTerm): ApiTerm => ({ type: "if", value: { test, then, else: otherwise } });
const either = (...terms: ApiTerm[]): ApiTerm => ({ type: "or", value: terms });
const status = (...names: string[]): ApiTerm => either(...names.map((name) => op("eq", ref("body", "status"), name)));

const ACCOUNT = `AC${"0".repeat(32)}`;
const KEY = `SK${"1".repeat(32)}`;
const SECRET = "s3cr3t-value";
const PHONE = "^\\+[1-9][0-9]{1,14}$";

/** The operation: send one text. Its rules are those of a real text API. */
const SEND: ApiOperation = {
  format: "api-operation/1",
  name: "texts.send",
  service: {
    origin: "https://api.texts.example",
    auth: {
      scheme: "basic",
      secret: "texts",
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
        { from: 429, to: 429, kind: "rate-limited", reason: "The service refused the request: too many requests at the same time." },
        { from: 401, to: 401, kind: "auth", reason: op("concat", "The service refused the credentials with HTTP ", op("text", ref("status")), ".") },
        { from: 403, to: 403, kind: "auth", reason: op("concat", "The service refused the credentials with HTTP ", op("text", ref("status")), ".") },
        { from: 400, to: 499, kind: "refused", reason: op("concat", "The service refused the request with HTTP ", op("text", ref("status")), ".") },
      ],
      otherwise: { kind: "server", reason: op("concat", "The service gave HTTP ", op("text", ref("status")), ".") },
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
    invalid: "The answer of the service has no text SID or no status.",
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

const CREDENTIALS = { texts: { accountSid: ACCOUNT, secret: SECRET } };
const TEXT = { to: "+999000006", from: "+999000001", body: "Hello" };
const answer = (status: number, body: unknown, headers: Record<string, string> = {}): ApiResponse => ({
  status,
  text: typeof body === "string" ? body : JSON.stringify(body),
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
});
const SID = "SM0123456789abcdef0123456789abcdef";

describe("buildApiRequest", () => {
  it("gives the URL, the headers in order and the form body of a call", () => {
    const built = buildApiRequest(SEND, { ...TEXT, validityMs: 61_999 }, CREDENTIALS);
    expect(built).toEqual({
      ok: true,
      request: {
        url: `https://api.texts.example/2010-04-01/Accounts/${ACCOUNT}/Messages.json`,
        method: "POST",
        headers: {
          authorization: `Basic ${btoa(`${ACCOUNT}:${SECRET}`)}`,
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "To=%2B999000006&Body=Hello&From=%2B999000001&ValidityPeriod=61",
      },
    });
    if (built.ok) expect(Object.keys(built.request.headers)).toEqual(["authorization", "accept", "content-type"]);
  });

  it("leaves out a field whose input is absent, and coalesce picks the user of the Basic authentication", () => {
    const built = buildApiRequest(SEND, { to: TEXT.to, messagingServiceSid: `MG${"a".repeat(32)}`, body: "Hi" }, { texts: { accountSid: ACCOUNT, keySid: KEY, secret: SECRET } });
    expect(built.ok && built.request.body).toBe(`To=%2B999000006&Body=Hi&MessagingServiceSid=MG${"a".repeat(32)}`);
    expect(built.ok && built.request.headers["authorization"]).toBe(`Basic ${btoa(`${KEY}:${SECRET}`)}`);
  });

  it("refuses an input that does not fit the input schema", () => {
    expect(buildApiRequest(SEND, { ...TEXT, to: "5551234567" }, CREDENTIALS)).toMatchObject({ ok: false, kind: "input" });
    expect(buildApiRequest(SEND, { ...TEXT, messagingServiceSid: `MG${"a".repeat(32)}` }, CREDENTIALS)).toMatchObject({ ok: false, kind: "input" });
    expect(buildApiRequest(SEND, { to: TEXT.to, body: "x" }, CREDENTIALS)).toMatchObject({ ok: false, kind: "input" });
    expect(buildApiRequest(SEND, { ...TEXT, body: "   " }, CREDENTIALS)).toMatchObject({ ok: false, kind: "input" });
    expect(buildApiRequest(SEND, { ...TEXT, validityMs: 999 }, CREDENTIALS)).toMatchObject({ ok: false, kind: "input" });
    expect(buildApiRequest(SEND, { ...TEXT, validityMs: 36_000_999.5 }, CREDENTIALS).ok).toBe(true);
    expect(buildApiRequest(SEND, { ...TEXT, validityMs: 36_001_000 }, CREDENTIALS)).toMatchObject({ ok: false, kind: "input" });
  });

  it("gives the JSON Pointer and the cause of each schema error, also for oneOf, not and draft 7", () => {
    const withInput = (input: ApiOperation["input"]): ApiOperation => ({ ...SEND, service: { origin: "https://api.texts.example" }, input, request: { method: "GET", path: "/v1/items" } });
    const errorsOf = (operation: ApiOperation, input: unknown): readonly string[] => {
      const built = buildApiRequest(operation, input);
      return built.ok ? [] : built.errors;
    };
    const either = withInput({ type: "object", oneOf: [{ required: ["from"] }, { required: ["sid"] }] });
    expect(errorsOf(either, { from: "a" })).toEqual([]);
    expect(errorsOf(either, {})).toEqual(["Instance does not match exactly one subschema (0 matches)."]);
    expect(errorsOf(either, { from: "a", sid: "b" })).toEqual(["Instance does not match exactly one subschema (2 matches)."]);
    expect(errorsOf(withInput({ not: { type: "string" } }), "text")).toEqual(['Instance matched "not" schema.']);
    expect(errorsOf(withInput({ not: { type: "string" } }), 1)).toEqual([]);
    const nested = withInput({ type: "object", properties: { "a/b~c d": { type: "array", items: { type: "number" } } } });
    expect(errorsOf(nested, { "a/b~c d": [1, "two"] })).toEqual(['/a~1b~0c d/1: Instance type "string" is invalid. Expected "number".']);
    const draft7 = withInput({ $schema: "http://json-schema.org/draft-07/schema#", type: "object", dependencies: { a: ["b"] } });
    expect(errorsOf(draft7, { a: 1 })).toEqual(['Instance has "a" but does not have "b".']);
    const frozen = withInput(Object.freeze({ type: "object", properties: Object.freeze({ n: Object.freeze({ type: "number" }) }) }));
    expect(errorsOf(frozen, { n: "x" })).toEqual(['/n: Instance type "string" is invalid. Expected "number".']);
  });

  it("refuses an absent credential, and a credential that does not fit its schema, with no value in the errors", () => {
    expect(buildApiRequest(SEND, TEXT, {})).toEqual({ ok: false, kind: "credential", errors: ["No credential has the binding texts."] });
    const bad = buildApiRequest(SEND, TEXT, { texts: { accountSid: "AC-not-valid", secret: "with space" } });
    expect(bad).toMatchObject({ ok: false, kind: "credential" });
    expect(JSON.stringify(bad)).not.toContain("AC-not-valid");
    expect(JSON.stringify(bad)).not.toContain("with space");
    expect(JSON.stringify(bad)).toContain("accountSid");
  });

  it("gives a failure of the kind operation for a term with an error, and the code of the error", () => {
    const broken: ApiOperation = { ...SEND, request: { ...SEND.request, headers: [["x-count", op("add", ref("input", "body"), 1)]] } };
    const built = buildApiRequest(broken, TEXT, CREDENTIALS);
    expect(built).toMatchObject({ ok: false, kind: "operation" });
    expect(!built.ok && built.errors[0]).toContain("#VALUE!");
  });

  it("refuses a path with a dot segment or a character outside RFC 3986", () => {
    const open: ApiOperation = { ...SEND, service: { origin: "https://api.texts.example" }, input: true, request: { method: "GET", path: op("concat", "/v1/items/", ref("input", "id")) } };
    expect(buildApiRequest(open, { id: "abc-1" })).toMatchObject({ ok: true, request: { url: "https://api.texts.example/v1/items/abc-1", headers: {} } });
    for (const id of ["..", "a/../b", "a?b=1", "a#b", "a b", "%zz"]) expect(buildApiRequest(open, { id }), id).toMatchObject({ ok: false, kind: "operation" });
  });

  it("refuses a header value with a control character", () => {
    const open: ApiOperation = { ...SEND, service: { origin: "https://api.texts.example" }, input: true, request: { method: "GET", path: "/v1", headers: [["x-note", ref("input", "note")]] } };
    expect(buildApiRequest(open, { note: "a\r\nx-evil: 1" })).toMatchObject({ ok: false, kind: "operation" });
  });

  it("builds a query with a repeated name, and the bearer and header schemes", () => {
    const list: ApiOperation = {
      format: "api-operation/1",
      service: { origin: "https://api.texts.example:8443", auth: { scheme: "bearer", secret: "main", token: ref("credential", "token") } },
      input: { type: "object" },
      request: { method: "GET", path: "/v1/texts", query: [["to", "+1"], ["to", "+2"], ["page", ref("input", "page")], ["all", true]] },
      response: { fields: [] },
    };
    expect(buildApiRequest(list, {}, { main: { token: "tok" } })).toEqual({
      ok: true,
      request: { url: "https://api.texts.example:8443/v1/texts?to=%2B1&to=%2B2&all=true", method: "GET", headers: { authorization: "Bearer tok" } },
    });
    const keyed: ApiOperation = { ...list, service: { ...list.service, auth: { scheme: "header", secret: "main", header: "x-api-key", value: ref("credential", "token") } } };
    expect(buildApiRequest(keyed, { page: 2 }, { main: { token: "tok" } })).toMatchObject({ ok: true, request: { url: "https://api.texts.example:8443/v1/texts?to=%2B1&to=%2B2&page=2&all=true", headers: { "x-api-key": "tok" } } });
  });

  it("builds a JSON body: an absent field goes, null stays, and the key __proto__ is a plain key", () => {
    const create: ApiOperation = {
      format: "api-operation/1",
      service: { origin: "https://api.texts.example" },
      input: true,
      request: {
        method: "POST",
        path: "/v1/notes",
        body: { type: "json", fields: [["title", ref("input", "title")], ["tags", { type: "list", value: ["a", ref("input", "tag")] }], ["parent", null], ["note", ref("input", "note")], ["__proto__", 1]] },
      },
      response: { fields: [] },
    };
    const built = buildApiRequest(create, { title: "T", tag: "b" });
    expect(built.ok && built.request.headers["content-type"]).toBe("application/json");
    expect(built.ok && built.request.body).toBe('{"title":"T","tags":["a","b"],"parent":null,"__proto__":1}');
  });

  it("throws for a document with a problem of its structure, and apiOperationIssues lists the problems", () => {
    const bad = { ...SEND, service: { origin: "http://api.texts.example/v1" }, request: { method: "FETCH", path: "/", headers: [["Accept", "x"]], body: { type: "xml", fields: [] } } } as unknown as ApiOperation;
    const issues = apiOperationIssues(bad);
    expect(issues).toEqual([
      "The origin is not https:// and a lowercase host, with an optional port and no path.",
      "The method is not GET, POST, PUT, PATCH or DELETE.",
      'The header name "Accept" is not a lowercase token.',
      "The body is not a record with the type form or json.",
    ]);
    expect(() => buildApiRequest(bad, {})).toThrow(/The operation is not valid/);
    expect(apiOperationIssues(SEND)).toEqual([]);
    expect(apiOperationIssues({ ...SEND, response: { fields: [["ok", true]] } })).toEqual(["The field name ok of the response is reserved."]);
  });

  it("gives back each field of each valid input in the form body (property)", () => {
    const digits = fc.stringMatching(/^\+[1-9][0-9]{1,14}$/);
    fc.assert(
      fc.property(digits, digits, fc.string({ minLength: 1, maxLength: 1600 }).filter((text) => /\S/.test(text)), fc.option(fc.integer({ min: 1000, max: 36_000_999 }), { nil: undefined }), (to, from, body, validityMs) => {
        const input = validityMs === undefined ? { to, from, body } : { to, from, body, validityMs };
        const built = buildApiRequest(SEND, input, CREDENTIALS);
        if (!built.ok) return false;
        const form = new URLSearchParams(built.request.body);
        return form.get("To") === to && form.get("From") === from && form.get("Body") === body && form.get("ValidityPeriod") === (validityMs === undefined ? null : String(Math.floor(validityMs / 1000)));
      }),
      { seed: 40_401, numRuns: 200 },
    );
  });
});

describe("extractApiResponse", () => {
  it("reads the fields of a success with their decoders", () => {
    const read = extractApiResponse(SEND, answer(201, { sid: SID, status: "queued", num_segments: "2", date_created: "Wed, 18 Nov 2026 05:00:00 +0000", error_code: null, error_message: "" }));
    expect(read).toEqual({ ok: true, sid: SID, status: "queued", state: "pending", segments: 2, createdAt: Date.parse("2026-11-18T05:00:00Z") });
  });

  it("computes a field with a term of the formula kit", () => {
    expect(extractApiResponse(SEND, answer(200, { sid: SID, status: "read" }))).toMatchObject({ state: "delivered" });
    expect(extractApiResponse(SEND, answer(200, { sid: SID, status: "undelivered", error_code: 30003 }))).toMatchObject({ state: "failed", errorCode: 30003 });
  });

  it("gives the kind of the first status rule, the message and the code of the body, and the wait", () => {
    expect(extractApiResponse(SEND, answer(400, { code: 21211, message: "The 'To' number is not valid." }))).toEqual({ ok: false, kind: "refused", status: 400, errors: ["The 'To' number is not valid."], code: 21211 });
    expect(extractApiResponse(SEND, answer(401, "not json"))).toEqual({ ok: false, kind: "auth", status: 401, errors: ["The service refused the credentials with HTTP 401."] });
    expect(extractApiResponse(SEND, answer(429, {}, { "retry-after": "12" }))).toEqual({
      ok: false,
      kind: "rate-limited",
      status: 429,
      errors: ["The service refused the request: too many requests at the same time."],
      retryAfterMs: 12_000,
    });
    expect(extractApiResponse(SEND, answer(503, {}, { "retry-after": "1" }))).toMatchObject({ kind: "server", errors: ["The service gave HTTP 503."], retryAfterMs: 5000 });
    expect(extractApiResponse(SEND, answer(500, {}, { "retry-after": "Wed, 18 Nov 2026 05:00:00 GMT" }))).toMatchObject({ retryAfterMs: 5000 });
    expect(extractApiResponse(SEND, answer(302, ""))).toMatchObject({ kind: "server", errors: ["The service gave HTTP 302."] });
  });

  it("gives a failure of the kind server for a success body that is not JSON or does not fit the schema", () => {
    const reason = ["The answer of the service has no text SID or no status."];
    expect(extractApiResponse(SEND, answer(200, "<html>"))).toEqual({ ok: false, kind: "server", status: 200, errors: reason, retryAfterMs: 5000 });
    expect(extractApiResponse(SEND, answer(200, [1, 2]))).toMatchObject({ kind: "server", errors: reason });
    expect(extractApiResponse(SEND, answer(200, { sid: "XX1", status: "queued", message: "m", code: 1 }))).toEqual({ ok: false, kind: "server", status: 200, errors: reason, retryAfterMs: 5000 });
  });

  it("gives a failure of the kind server for a field term with an error other than #N/A", () => {
    const counted: ApiOperation = { ...SEND, response: { ...SEND.response, schema: true, fields: [["half", op("div", ref("body", "count"), 2)]] } };
    expect(extractApiResponse(counted, answer(200, { count: 8 }))).toEqual({ ok: true, half: 4 });
    expect(extractApiResponse(counted, answer(200, {}))).toEqual({ ok: true });
    expect(extractApiResponse(counted, answer(200, { count: "8" }))).toMatchObject({ ok: false, kind: "server", errors: [expect.stringContaining("The field half of the answer gives #VALUE!")] });
  });

  it("reads a status with no rule as a server failure with the default reason, and a body of the form none", () => {
    const bare: ApiOperation = { format: "api-operation/1", service: { origin: "https://api.texts.example" }, input: true, request: { method: "DELETE", path: "/v1/x" }, response: { ok: [204, 204], body: "none", fields: [["done", true]] } };
    expect(extractApiResponse(bare, answer(204, ""))).toEqual({ ok: true, done: true });
    expect(extractApiResponse(bare, answer(200, "{}"))).toEqual({ ok: false, kind: "server", status: 200, errors: ["The service gave HTTP 200."] });
  });
});
