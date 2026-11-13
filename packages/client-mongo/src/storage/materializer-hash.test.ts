import { describe, expect, it } from "vitest";
import { Binary, Decimal128, Long, MaxKey, MinKey, ObjectId, Timestamp } from "mongodb";
import { canonical } from "./materializer.js";

/** The text of a row before CLI-126, kept as a fixture: each Date, RegExp, Map and Set gave `{}`. */
function oldCanonical(value: unknown): string {
  if (value === null || value === undefined || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(oldCanonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${oldCanonical(record[key])}`)
    .join(",")}}`;
}

const id = new ObjectId("65a1b2c3d4e5f60718293a4b");

/** Rows with no tagged value: their text, and so their stored hash, does not change. */
const UNCHANGED: Array<[string, unknown]> = [
  ["null", null],
  ["undefined", undefined],
  ["number", 1.5],
  ["text", "a\"b"],
  ["empty object", {}],
  ["array with a hole", [1, , 3]],
  ["keys in another order", { b: 1, a: { d: [2, null], c: "x" } }],
  ["undefined field", { a: undefined, b: 1 }],
  ["ObjectId", { _id: id, ref: id }],
  ["Decimal128", { price: Decimal128.fromString("1.5") }],
  ["Long", { n: Long.fromInt(7) }],
  ["Timestamp", { ts: new Timestamp({ t: 1, i: 2 }) }],
  ["Binary", { bytes: new Binary(new Uint8Array([1, 2, 3])) }],
  ["object with a $date key", { $date: 0 }],
];

/** Pairs of rows that differ only in a tagged value: each pair had one text, and so one hash. */
const PAIRS: Array<[string, unknown, unknown]> = [
  ["Date", { at: new Date(0) }, { at: new Date(1_000) }],
  ["Date in an array", { log: [new Date(0)] }, { log: [new Date(1)] }],
  ["invalid Date", { at: new Date(Number.NaN) }, { at: new Date(0) }],
  ["RegExp", { re: /a/ }, { re: /b/ }],
  ["RegExp flags", { re: /a/ }, { re: /a/i }],
  ["Map", { m: new Map([["a", 1]]) }, { m: new Map([["a", 2]]) }],
  ["Set", { s: new Set([1]) }, { s: new Set([2]) }],
  ["MinKey and MaxKey", { k: new MinKey() }, { k: new MaxKey() }],
];

describe("canonical, the text of a view row for its hash (CLI-126)", () => {
  it("gives the old text for each row without a Date, a RegExp, a Map, a Set, a MinKey or a MaxKey", () => {
    for (const [name, value] of UNCHANGED) expect(canonical(value), name).toBe(oldCanonical(value));
  });

  it("tells apart two rows that differ only in a Date, a RegExp, a Map, a Set or a MinKey and a MaxKey", () => {
    for (const [name, a, b] of PAIRS) {
      expect(oldCanonical(a), `${name}: the old text was the same`).toBe(oldCanonical(b));
      expect(canonical(a), name).not.toBe(canonical(b));
    }
  });

  it("gives the tag of each value", () => {
    expect(canonical(new Date(0))).toBe("Date(0)");
    expect(canonical(new Date(Number.NaN))).toBe("Date(NaN)");
    expect(canonical(/a+"/gi)).toBe('RegExp("/a+\\"/gi")');
    expect(canonical(new Map<unknown, unknown>([["b", 2], [1, { y: 1, x: 0 }]]))).toBe('Map(["b",2],[1,{"x":0,"y":1}])');
    expect(canonical(new Set(["b", "a"]))).toBe('Set("a","b")');
    expect(canonical(new MinKey())).toBe("MinKey()");
    expect(canonical(new MaxKey())).toBe("MaxKey()");
  });

  it("gives one text for a Map or a Set in another order", () => {
    expect(canonical(new Map([["a", 1], ["b", 2]]))).toBe(canonical(new Map([["b", 2], ["a", 1]])));
    expect(canonical(new Set([2, 1]))).toBe(canonical(new Set([1, 2])));
  });
});
