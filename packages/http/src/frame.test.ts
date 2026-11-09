/**
 * The frame rules: a table of cases from CSP3 (`frame-ancestors`) and from the HTML standard (`X-Frame-Options`),
 * and properties of the decision.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type HeaderSource, frameRefusal, parseCsp, sourceAllows, sourceListAllows } from "./frame.js";

const PAGE = "https://site.example/page";
const SAME = "https://site.example";
const OTHER = "https://other.example";

describe("parseCsp", () => {
  it("divides the policies at commas and the directives at semicolons", () => {
    const policies = parseCsp(["default-src 'self'; FRAME-Ancestors 'none'", "frame-ancestors https://a.example  'self' , script-src *"]);
    expect(policies.map((policy) => [...policy])).toEqual([
      [
        ["default-src", ["'self'"]],
        ["frame-ancestors", ["'none'"]],
      ],
      [["frame-ancestors", ["https://a.example", "'self'"]]],
      [["script-src", ["*"]]],
    ]);
  });

  it("keeps the first copy of a directive, and drops empty policies and bad names", () => {
    const policies = parseCsp(["frame-ancestors 'none'; frame-ancestors *", " ; , ;", "bad_name x; frame-ancestors"]);
    expect(policies.map((policy) => [...policy])).toEqual([[["frame-ancestors", ["'none'"]]], [["frame-ancestors", []]]]);
  });
});

describe("sourceAllows", () => {
  const cases: [source: string, origin: string, self: string, allows: boolean][] = [
    ["*", OTHER, PAGE, true],
    ["*", "http://other.example", PAGE, true],
    ["*", "data:text/plain,x", PAGE, false],
    ["*", "blob:https://other.example/1", PAGE, false],
    ["'self'", SAME, PAGE, true],
    ["'self'", OTHER, PAGE, false],
    ["'self'", "https://site.example:8443", PAGE, false],
    ["'self'", "https://site.example", "http://site.example/", true], // The upgrade from http to https
    ["'self'", "http://site.example", PAGE, false], // No downgrade
    ["'SELF'", SAME, PAGE, true],
    ["'none'", SAME, PAGE, false],
    ["'nonce-abc'", SAME, PAGE, false],
    ["https:", OTHER, PAGE, true],
    ["https:", "http://other.example", PAGE, false],
    ["http:", OTHER, PAGE, true], // The upgrade from http to https
    ["wss:", OTHER, PAGE, true],
    ["https://other.example", OTHER, PAGE, true],
    ["HTTPS://OTHER.EXAMPLE", OTHER, PAGE, true],
    ["https://other.example", "http://other.example", PAGE, false],
    ["http://other.example", OTHER, PAGE, true],
    ["other.example", OTHER, PAGE, true], // The scheme of the page
    ["other.example", "http://other.example", PAGE, false],
    ["other.example", OTHER, "http://site.example/", true],
    ["*.example", OTHER, PAGE, true],
    ["*.example", "https://example", PAGE, false],
    ["https://*.other.example", "https://a.b.other.example", PAGE, true],
    ["https://*", OTHER, PAGE, true],
    ["https://other.example:8443", "https://other.example:8443", PAGE, true],
    ["https://other.example:8443", OTHER, PAGE, false],
    ["https://other.example:443", OTHER, PAGE, true], // The default port
    ["https://other.example", "https://other.example:8443", PAGE, false],
    ["https://other.example:*", "https://other.example:8443", PAGE, true],
    ["https://other.example/some/path", OTHER, PAGE, true], // An origin has no path
    ["https://other.example", "null", PAGE, false],
    ["http://127.0.0.1:3000", "http://127.0.0.1:3000", PAGE, true],
  ];
  it.each(cases)("%s with the origin %s and the page %s gives %s", (source, origin, self, allows) => {
    expect(sourceAllows(source, origin, self)).toBe(allows);
  });

  it("gives no match for an empty list and for 'none' alone, but ignores 'none' in a longer list", () => {
    expect(sourceListAllows([], SAME, PAGE)).toBe(false);
    expect(sourceListAllows(["'none'"], SAME, PAGE)).toBe(false);
    expect(sourceListAllows(["'none'", OTHER], OTHER, PAGE)).toBe(true);
  });
});

describe("frameRefusal", () => {
  type Case = [what: string, headers: HeaderSource, ancestor: string, refused: boolean, by: "csp" | "x-frame-options" | null];
  const cases: Case[] = [
    ["no header", {}, OTHER, false, null],
    ["frame-ancestors 'none'", { "content-security-policy": "frame-ancestors 'none'" }, SAME, true, "csp"],
    ["frame-ancestors with no value", { "content-security-policy": "frame-ancestors" }, SAME, true, "csp"],
    ["frame-ancestors 'self', the same origin", { "content-security-policy": "frame-ancestors 'self'" }, SAME, false, null],
    ["frame-ancestors 'self', another origin", { "content-security-policy": "frame-ancestors 'self'" }, OTHER, true, "csp"],
    ["frame-ancestors of a host", { "content-security-policy": "frame-ancestors https://other.example" }, OTHER, false, null],
    ["frame-ancestors of a host, the same origin", { "content-security-policy": "frame-ancestors https://other.example" }, SAME, true, "csp"],
    ["each policy must allow", { "content-security-policy": ["frame-ancestors *", "frame-ancestors 'self'"] }, OTHER, true, "csp"],
    ["each policy of one value must allow", { "content-security-policy": "frame-ancestors *, frame-ancestors 'self'" }, OTHER, true, "csp"],
    ["the first copy wins", { "content-security-policy": "frame-ancestors 'none'; frame-ancestors *" }, SAME, true, "csp"],
    ["frame-ancestors decides over DENY", { "content-security-policy": "frame-ancestors *", "x-frame-options": "DENY" }, OTHER, false, null],
    ["frame-ancestors decides over SAMEORIGIN", { "content-security-policy": "frame-ancestors 'none'", "x-frame-options": "SAMEORIGIN" }, SAME, true, "csp"],
    ["default-src does not apply to frames", { "content-security-policy": "default-src 'none'", "x-frame-options": "DENY" }, SAME, true, "x-frame-options"],
    ["default-src alone", { "content-security-policy": "default-src 'none'" }, OTHER, false, null],
    ["a report-only policy never refuses", { "content-security-policy-report-only": "frame-ancestors 'none'" }, OTHER, false, null],
    ["a report-only policy does not hide DENY", { "content-security-policy-report-only": "frame-ancestors *", "x-frame-options": "DENY" }, OTHER, true, "x-frame-options"],
    ["DENY", { "x-frame-options": "DENY" }, SAME, true, "x-frame-options"],
    ["deny in lower case", { "X-Frame-Options": " deny " }, SAME, true, "x-frame-options"],
    ["SAMEORIGIN, the same origin", { "x-frame-options": "SAMEORIGIN" }, SAME, false, null],
    ["SAMEORIGIN, another origin", { "x-frame-options": "SAMEORIGIN" }, OTHER, true, "x-frame-options"],
    ["SAMEORIGIN, another port", { "x-frame-options": "SAMEORIGIN" }, "https://site.example:8443", true, "x-frame-options"],
    ["SAMEORIGIN, another scheme", { "x-frame-options": "SAMEORIGIN" }, "http://site.example", true, "x-frame-options"],
    ["ALLOW-FROM is ignored", { "x-frame-options": "ALLOW-FROM https://other.example" }, OTHER, false, null],
    ["ALLOWALL", { "x-frame-options": "ALLOWALL" }, OTHER, false, null],
    ["an unknown value", { "x-frame-options": "maybe" }, OTHER, false, null],
    ["the same value twice", { "x-frame-options": "SAMEORIGIN, sameorigin" }, SAME, false, null],
    ["values that do not agree", { "x-frame-options": "SAMEORIGIN, ALLOWALL" }, SAME, true, "x-frame-options"],
    ["values that do not agree, in two headers", { "x-frame-options": ["SAMEORIGIN", "DENY"] }, SAME, true, "x-frame-options"],
    ["ALLOW-FROM with SAMEORIGIN", { "x-frame-options": "ALLOW-FROM https://site.example, SAMEORIGIN" }, SAME, true, "x-frame-options"],
    ["two unknown values", { "x-frame-options": "ALLOW-FROM https://a.example, maybe" }, OTHER, false, null],
    ["a Headers object", new Headers([["X-Frame-Options", "DENY"]]), OTHER, true, "x-frame-options"],
    ["a Headers object with two policies", new Headers([["content-security-policy", "frame-ancestors *"], ["content-security-policy", "frame-ancestors 'self'"]]), OTHER, true, "csp"],
  ];
  it.each(cases)("%s", (_what, headers, ancestor, refused, by) => {
    const decision = frameRefusal(headers, { ancestor, page: PAGE });
    expect({ refused: decision.refused, by: decision.by }).toEqual({ refused, by });
    expect(decision.detail.length).toBeGreaterThan(0);
  });

  it("names the directive and the ancestor in the detail", () => {
    expect(frameRefusal({ "content-security-policy": "frame-ancestors 'self'" }, { ancestor: OTHER, page: new URL(PAGE) }).detail).toBe(
      `The frame-ancestors directive "'self'" does not allow ${OTHER}.`,
    );
  });
});

describe("frameRefusal properties", () => {
  const SOURCES = ["'none'", "'self'", "*", "https:", "http:", "https://other.example", "*.example", "site.example", "https://other.example:8443", "'nonce-x'"];
  const ANCESTORS = [SAME, OTHER, "http://site.example", "https://other.example:8443", "https://a.example", "null"];
  const policy = fc
    .tuple(fc.boolean(), fc.subarray(SOURCES), fc.constantFrom("", "default-src 'self'; ", "script-src *; "))
    .map(([framed, sources, prefix]) => `${prefix}${framed ? `frame-ancestors ${sources.join(" ")}` : "img-src *"}`);
  const policies = fc.array(policy, { maxLength: 4 });
  const xfo = fc.option(fc.subarray(["DENY", "SAMEORIGIN", "ALLOWALL", "ALLOW-FROM https://a.example", "maybe"], { minLength: 1 }), { nil: undefined });
  const ancestor = fc.constantFrom(...ANCESTORS);
  const decide = (csp: string[], options: string[] | undefined, at: string, more: Record<string, string[]> = {}) =>
    frameRefusal({ "content-security-policy": csp, "x-frame-options": options, ...more }, { ancestor: at, page: PAGE });
  const parameters = { seed: 0x0f4a3e, numRuns: 2000 };

  it("keeps a refusal by a policy when more policies come", () => {
    fc.assert(
      fc.property(policies, policies, xfo, ancestor, (first, added, options, at) => {
        fc.pre(decide(first, options, at).by === "csp");
        const decision = decide([...first, ...added], options, at);
        expect([decision.refused, decision.by]).toEqual([true, "csp"]);
      }),
      parameters,
    );
  });

  it("gives the same decision for each order of the policies", () => {
    fc.assert(
      fc.property(policies, xfo, ancestor, (csp, options, at) => {
        expect(decide([...csp].reverse(), options, at).refused).toBe(decide(csp, options, at).refused);
      }),
      parameters,
    );
  });

  it("ignores report-only policies, and ignores X-Frame-Options when a policy has frame-ancestors", () => {
    fc.assert(
      fc.property(policies, policies, xfo, ancestor, (csp, reports, options, at) => {
        const decision = decide(csp, options, at);
        expect(decide(csp, options, at, { "content-security-policy-report-only": reports })).toEqual(decision);
        if (parseCsp(csp).some((one) => one.has("frame-ancestors"))) expect(decide(csp, undefined, at)).toEqual(decision);
      }),
      parameters,
    );
  });
});
