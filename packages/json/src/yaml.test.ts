/**
 * YAML to JSON and back, and the JSON Schema check. A property test with fast-check: the parse of
 * the text of a JSON value gives the value again.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parse } from "yaml";
import { validateJson } from "./schema.js";
import { hasOwn, jsonEqual, type JsonValue } from "./value.js";
import { parseYaml, stringifyYaml } from "./yaml.js";

describe("parseYaml", () => {
  it("gives JSON values", () => {
    expect(parseYaml("a: 1\nb: [true, null, 'x']\nc:\n  d: 2.5\n")).toEqual({ a: 1, b: [true, null, "x"], c: { d: 2.5 } });
    expect(parseYaml("")).toBeNull();
    expect(parseYaml("- 1\n- two\n")).toEqual([1, "two"]);
    expect(parseYaml("a: &x [1, 2]\nb: *x\n")).toEqual({ a: [1, 2], b: [1, 2] });
  });

  it("gives the text of the YAML 1.1 forms and of keys that are not strings", () => {
    expect(parseYaml("a: yes\nb: 2001-12-14\nc: !!binary aGVsbG8=\n1: one\ntrue: t\nnull: n\n")).toEqual({
      a: "yes",
      b: "2001-12-14",
      c: "aGVsbG8=",
      "1": "one",
      true: "t",
      null: "n",
    });
  });

  it("gives the list of documents with all", () => {
    expect(parseYaml("a: 1\n---\nb: 2\n", { all: true })).toEqual([{ a: 1 }, { b: 2 }]);
    expect(parseYaml("", { all: true })).toEqual([]);
    expect(() => parseYaml("a: 1\n---\nb: [\n", { all: true })).toThrow(/document 1/);
  });

  it.each([
    ["a: [1, 2\n", /yaml\.parse: .*line/s],
    ["a: 1\na: 2\n", /unique/i],
    ["a: .inf\n", /"\/a" is Infinity/],
    ["- .nan\n", /"\/0" is NaN/],
    ["? [a, b]\n: c\n", /a map or a list/],
    ["a: 1\n---\nb: 2\n", /more than one document|multiple documents|Source contains/i],
  ])("refuses %j", (text, message) => {
    expect(() => parseYaml(text)).toThrow(expect.objectContaining({ code: "INVALID_YAML", message: expect.stringMatching(message) }));
  });

  it("refuses an alias attack", () => {
    const bomb = ["a: &a [x,x,x,x,x,x,x,x,x]", ...["b", "c", "d", "e"].map((name, index) => `${name}: &${name} [${Array(9).fill(`*${"abcd"[index]}`).join(",")}]`)].join("\n");
    expect(() => parseYaml(bomb)).toThrow(expect.objectContaining({ code: "INVALID_YAML", message: expect.stringContaining("alias") }));
  });

  it("keeps a key __proto__ as data", () => {
    const value = parseYaml("__proto__:\n  polluted: true\n") as Record<string, unknown>;
    expect(hasOwn(value, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(value["polluted"]).toBeUndefined();
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("stringifyYaml", () => {
  it("writes YAML with the options", () => {
    expect(stringifyYaml({ b: 1, a: [1, "x"] })).toBe("b: 1\na:\n  - 1\n  - x\n");
    expect(stringifyYaml({ b: 1, a: { c: true } }, { sortKeys: true, indent: 4 })).toBe("a:\n    c: true\nb: 1\n");
    expect(stringifyYaml({ s: "1e3", u: "", v: "null", w: "0o17" })).toBe('s: "1e3"\nu: ""\nv: "null"\nw: "0o17"\n');
  });

  it("quotes the strings that a YAML 1.1 reader takes as another type", () => {
    const value = { yes: "no", on: "off", y: "Y", date: "2001-12-14", octal: "0777", under: "1_000", binary: "0b101", sexagesimal: "1:20", "<<": "=", plain: "word" };
    const text = stringifyYaml(value);
    expect(text).toBe('"yes": "no"\n"on": "off"\n"y": "Y"\ndate: "2001-12-14"\noctal: "0777"\nunder: "1_000"\nbinary: "0b101"\nsexagesimal: "1:20"\n"<<": "="\nplain: word\n');
    expect(parse(text, { version: "1.1", schema: "yaml-1.1" })).toEqual(value);
  });

  it("gives a text whose parse is the value again: any JSON value", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.constantFrom(0, 20, 80), fc.integer({ min: 1, max: 8 }), fc.boolean(), (value, lineWidth, indent, sortKeys) => {
        const text = stringifyYaml(value as JsonValue, { lineWidth, indent, sortKeys });
        const back = parseYaml(text);
        expect(jsonEqual(back, value as JsonValue)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("gives a text whose parse is the value again: strings with the special characters of YAML", () => {
    const special = fc.string({ unit: fc.constantFrom("a", " ", "\n", "\t", ":", "#", "-", "?", "'", '"', "\\", "{", "[", "*", "&", "!", "|", ">", "<", "=", "%", "@", "`", "\r", "\u0085", "\u2028", "\uFEFF", "é", "0", "1", "7", "_", "x", "e", "b", ".", "~", "y", "n", "o") });
    fc.assert(
      fc.property(special, fc.dictionary(special, special, { maxKeys: 3 }), (text, map) => {
        expect(parseYaml(stringifyYaml(text))).toBe(text);
        expect(jsonEqual(parseYaml(stringifyYaml(map)), map)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("gives a text that a YAML 1.1 reader reads as the same value: strings, booleans, null and integers", () => {
    const words = fc.oneof(
      fc.constantFrom("yes", "No", "ON", "off", "y", "N", "~", "Null", "0777", "0x1F", "0b11", "1_000", "1:20", "1.5", ".5", "1e3", "+1", ".inf", ".NaN", "2001-12-14", "<<", "=", "true", "False", "-0"),
      fc.string({ unit: fc.constantFrom("0", "1", "7", ".", "_", ":", "-", "+", "e", "x", "b", "y", "n", "o", "<", "=", "~") }),
    );
    const { node } = fc.letrec<{ node: JsonValue }>((tie) => ({
      node: fc.oneof(
        { depthSize: "small" },
        words,
        fc.boolean(),
        fc.constant(null),
        fc.integer({ min: -1000, max: 1000 }),
        fc.array(tie("node"), { maxLength: 4 }),
        fc.dictionary(words, tie("node"), { maxKeys: 4 }),
      ),
    }));
    fc.assert(
      fc.property(node, (value) => {
        const text = stringifyYaml(value);
        expect(jsonEqual(parseYaml(text), value)).toBe(true);
        expect(jsonEqual(parse(text, { version: "1.1", schema: "yaml-1.1" }) as JsonValue, value)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});

describe("validateJson", () => {
  const schema = {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      age: { type: "integer", minimum: 0 },
      tags: { type: "array", items: { enum: ["a", "b"] }, maxItems: 2 },
      kind: { $ref: "#/$defs/kind" },
    },
    required: ["name"],
    additionalProperties: false,
    $defs: { kind: { anyOf: [{ const: "x" }, { type: "number" }] } },
  };

  it("finds no problem in a valid value, and says that the verdict is complete", () => {
    expect(validateJson({ name: "n", age: 3, tags: ["a"], kind: "x" }, schema)).toEqual({ valid: true, errors: [], unchecked: [] });
    expect(validateJson("anything", true)).toEqual({ valid: true, errors: [], unchecked: [] });
  });

  it("gives each problem with the JSON Pointer of the part", () => {
    const result = validateJson({ age: -1.5, tags: ["a", "c", "b"], kind: "y", extra: 1 }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.pointer).sort()).toEqual(["", "/age", "/extra", "/kind", "/tags", "/tags/1"]);
    expect(result.errors.find((error) => error.pointer === "/age")?.message).toBe("expected integer, got number");
    expect(validateJson(1, false)).toMatchObject({ valid: false, errors: [{ pointer: "", message: "no value is valid here" }] });
  });

  it("lists the keywords that the check does not examine", () => {
    const partial = {
      type: "object",
      not: { required: ["x"] },
      properties: { list: { type: "array", uniqueItems: true }, choice: { oneOf: [{ type: "string" }, { type: "number" }] } },
      $defs: { remote: { $ref: "https://example.com/schema.json" } },
      minProperties: 1,
    };
    expect(validateJson({ list: [1, 1] }, partial).unchecked).toEqual(["$ref https://example.com/schema.json", "minProperties", "not", "oneOf (examined as anyOf)", "uniqueItems"]);
  });

  it("refuses a schema that is not an object or a boolean", () => {
    expect(() => validateJson(1, "string")).toThrow(expect.objectContaining({ code: "INVALID_SCHEMA" }));
    expect(() => validateJson(1, [{}])).toThrow(expect.objectContaining({ code: "INVALID_SCHEMA" }));
  });
});
