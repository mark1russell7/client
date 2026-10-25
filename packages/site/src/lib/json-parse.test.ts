/**
 * Tests of the JSON parser of the Composer (O53). The parser gives the value that the JSON text
 * holds, it refuses each text that `JSON.parse` refuses, and no earlier object changes its keys.
 */

import vm from "node:vm";
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseJson } from "./json-parse";

// 1,000 runs take about 0.1 s more than 200 (O53)
const RUNS = Number(process.env["FC_RUNS"] ?? 1000);
const params = { numRuns: RUNS };

/** A JSON string with a `\u` escape for each UTF-16 unit of the text. */
function escapedString(text: string): string {
  let out = '"';
  for (let index = 0; index < text.length; index++) out += `\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`;
  return `${out}"`;
}

/** JSON text that escapes each character of each string and key, with `space` around each token. */
function escapedJson(value: unknown, space: string): string {
  if (Array.isArray(value)) return `[${space}${value.map((item) => escapedJson(item, space)).join(`${space},${space}`)}${space}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(([key, item]) => `${escapedString(key)}${space}:${space}${escapedJson(item, space)}`);
    return `{${space}${entries.join(`${space},${space}`)}${space}}`;
  }
  return typeof value === "string" ? escapedString(value) : JSON.stringify(value);
}

/** The result of a parse: the value, or false when the parse throws a `SyntaxError`. */
function attempt(parse: () => unknown): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: parse() };
  } catch (error) {
    expect(error).toBeInstanceOf(SyntaxError);
    return { ok: false };
  }
}

describe("parseJson (O53)", () => {
  it("gives the value of the JSON text, with any escapes and any whitespace", () => {
    const space = fc.stringMatching(/^[ \t\n\r]{0,2}$/);
    fc.assert(
      fc.property(fc.jsonValue(), space, (value, gap) => {
        // JSON.stringify is the oracle: V8 writes the keys correctly, but its JSON.parse can misread them
        const expected = JSON.stringify(value);
        for (const text of [expected, JSON.stringify(value, null, 2), escapedJson(value, gap), ` ${gap}${expected}${gap}\n`]) {
          expect(JSON.stringify(parseJson(text))).toBe(expected);
        }
      }),
      params,
    );
  });

  it("refuses each text that JSON.parse refuses, and accepts the others", () => {
    // A JSON text with a change at one place: some characters removed, some added
    const changed = fc
      .tuple(fc.jsonValue({ maxDepth: 2 }), fc.nat(), fc.nat({ max: 3 }), fc.string({ maxLength: 3, unit: "binary-ascii" }))
      .map(([value, at, remove, add]) => {
        const text = JSON.stringify(value);
        const start = at % (text.length + 1);
        return text.slice(0, start) + add + text.slice(start + remove);
      });
    fc.assert(
      fc.property(fc.oneof(changed, fc.string(), fc.string({ unit: "binary-ascii" })), (text) => {
        expect(attempt(() => parseJson(text)).ok).toBe(attempt(() => JSON.parse(text)).ok);
      }),
      params,
    );
  });

  it("refuses text that is not JSON", () => {
    const texts = [
      "", " ", "{", "}", "[", "]", "[1,]", '{"a":1,}', '{"a" 1}', '{"a":}', "{,}", "[,1]", "[1 2]", "1 2",
      "01", "-01", "1.", ".5", "+1", "-", "--1", "1e", "1e+", "0x1", "tru", "nul", "fals", "True", "NaN", "Infinity", "undefined",
      '"abc', '"\\x"', '"\\u12"', '"\\u12G4"', '"\\', '"a\nb"', '"\u0000"', '"\u001f"', "{'a':1}", "{a:1}", '{"a":1}}', "[1]]",
      "﻿1", " 1", "/*c*/1", "1//c",
    ];
    for (const text of texts) {
      expect(() => JSON.parse(text), text).toThrow(SyntaxError);
      expect(() => parseJson(text), text).toThrow(SyntaxError);
    }
  });

  it("reads numbers as JSON.parse does", () => {
    for (const text of ["0", "-0", "1", "-1", "0.1", "1e400", "-1e400", "1E+2", "-1.5e-7", "12345678901234567890", "5e-324", "2e-324", "1.7976931348623157e308"]) {
      expect(Object.is(parseJson(text), JSON.parse(text)), text).toBe(true);
    }
  });

  it("keeps the order of the keys, and the last value of a key that is there two times", () => {
    const value = parseJson('{"b": 1, "a": 2, "b": 3, "2": 4, "1": 5}') as Record<string, unknown>;
    expect(Object.keys(value)).toEqual(["1", "2", "b", "a"]);
    expect(value["b"]).toBe(3);
  });

  it("makes the key __proto__ an own key and does not change the prototype", () => {
    for (const text of ['{"__proto__": {"x": 1}}', '{"\\u005f\\u005fproto__": {"x": 1}}']) {
      const value = parseJson(text) as Record<string, unknown>;
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
      expect(Object.hasOwn(value, "__proto__")).toBe(true);
      expect(Object.keys(value)).toEqual(["__proto__"]);
      expect(value["x"]).toBeUndefined();
    }
  });

  it("reads each escaped key from its escapes after JSON.parse reads a similar key (the V8 bug)", () => {
    const cases: Array<[string, string]> = [
      ['"', "\\"],
      ['a"', "a\\"],
      ['""', '\\"'],
      ["\n\t", "\\n"],
    ];
    cases.forEach(([key, earlier], index) => {
      const first = JSON.stringify(`parseJson ${index}`);
      JSON.parse(`{${first}: 1, ${JSON.stringify(earlier)}: 2}`);
      expect(Object.keys(parseJson(`{${first}: 1, ${JSON.stringify(key)}: 2}`) as object)).toEqual([`parseJson ${index}`, key]);
    });
  });

  // The sequence of `scripts/v8-json-key-repro.mjs`. The test examines parseJson, not V8: it passes
  // also when V8 reads the key correctly. It only logs the key that JSON.parse gives in a new context.
  it("reads the keys of the V8 repro script correctly", () => {
    const [first, second] = ['{"":0,"\\\\":0}', '{"":0,"\\"":0}'];
    JSON.parse(first);
    expect(Object.keys(parseJson(first) as object)).toEqual(["", "\\"]);
    expect(Object.keys(parseJson(second) as object)).toEqual(["", '"']);
    const v8Key: unknown = vm.runInContext(`JSON.parse(${JSON.stringify(first)}); Object.keys(JSON.parse(${JSON.stringify(second)}))[1]`, vm.createContext({}));
    const state = v8Key === '"' ? "reads the key correctly" : `gives the key ${JSON.stringify(v8Key)}: the V8 bug`;
    console.log(`O53 V8 repro: Node ${process.version}, V8 ${process.versions.v8}: JSON.parse ${state}`);
  });

  it("reads a deep text without recursion", () => {
    const depth = 100_000;
    let value = parseJson(`${"[".repeat(depth)}${"]".repeat(depth)}`);
    let levels = 0;
    while (Array.isArray(value)) {
      levels++;
      value = value[0];
    }
    expect(levels).toBe(depth);
  });
});
