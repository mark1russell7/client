import { describe, expect, it } from "vitest";
import { BSON } from "mongodb";
import { contentHash, hashText, rowHash } from "./materializer.js";

const { Binary, BSONRegExp, BSONSymbol, Code, DBRef, Decimal128, Double, Int32, Long, MaxKey, MinKey, ObjectId, Timestamp, UUID } = BSON;

/** The text of a row before CLI-126, kept as a fixture: each Date gave `{}`, and a BSON value gave its own fields. */
function oldText(value: unknown): string {
  if (value === null || value === undefined || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(oldText).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${oldText(record[key])}`)
    .join(",")}}`;
}

const id = new ObjectId("65a1b2c3d4e5f60718293a4b");
const other = new ObjectId("65a1b2c3d4e5f60718293a4c");

/** Rows of JSON values: their text, and so the hash in `_viewHash`, does not change. */
const JSON_ROWS: Array<[string, Record<string, unknown>]> = [
  ["text", { name: 'a"b', empty: "" }],
  ["numbers", { int: 1, double: 1.5, big: 2 ** 40, negative: -3, zero: 0 }],
  ["true, false and null", { yes: true, no: false, none: null }],
  ["nested values", { a: [1, { b: "x" }], c: {}, d: [] }],
  ["keys in another order", { b: 1, a: { d: [2, null], c: "x" } }],
  ["a key __proto__", JSON.parse('{"__proto__": 1, "a": 2}') as Record<string, unknown>],
];

/** For each BSON type, two values that differ. Each key is the `_bsontype` of a class. */
const BSON_PAIRS: Record<string, readonly [unknown, unknown]> = {
  Binary: [new Binary(new Uint8Array([1, 2])), new Binary(new Uint8Array([1, 2]), 5)],
  BSONRegExp: [new BSONRegExp("a", "i"), new BSONRegExp("a", "m")],
  BSONSymbol: [new BSONSymbol("a"), new BSONSymbol("b")],
  Code: [new Code("f()", { x: 1 }), new Code("f()", { x: 2 })],
  DBRef: [new DBRef("items", id), new DBRef("items", other)],
  Decimal128: [Decimal128.fromString("1.5"), Decimal128.fromString("2.5")],
  Double: [new Double(1.5), new Double(2.5)],
  Int32: [new Int32(1), new Int32(2)],
  Long: [Long.fromString("9007199254740993"), Long.fromString("9007199254740992")],
  MaxKey: [new MaxKey(), new MinKey()],
  MinKey: [new MinKey(), new MaxKey()],
  ObjectId: [id, other],
  Timestamp: [new Timestamp({ t: 1, i: 2 }), new Timestamp({ t: 1, i: 3 })],
};

/** Pairs of values of JavaScript that are not JSON, and that differ. */
const VALUE_PAIRS: Array<[string, unknown, unknown]> = [
  ["Date", new Date(0), new Date(1_000)],
  ["invalid Date", new Date(Number.NaN), new Date(0)],
  ["RegExp", /a/, /a/i],
  ["RegExp with the flag g", /a/g, /a/],
  ["UUID", new UUID("00000000-0000-4000-8000-000000000001"), new UUID("00000000-0000-4000-8000-000000000002")],
  ["bigint", 1n, 2n],
  ["bigint and number", 1n, 1],
  ["NaN and Infinity", Number.NaN, Number.POSITIVE_INFINITY],
  ["Infinity and -Infinity", Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
  ["NaN and null", Number.NaN, null],
  // The choice: -0 is not 0. A Double -0 keeps its sign in BSON, so the target shows the change
  ["-0 and 0", -0, 0],
  ["Int32 and Double of one value", new Int32(1), new Double(1)],
];

/** The BSON type of each class that the BSON namespace of the driver exports. */
function bsonTypes(): string[] {
  const types = new Set<string>();
  for (const value of Object.values(BSON)) {
    if (typeof value !== "function") continue;
    const type = (value as { prototype?: { _bsontype?: unknown } }).prototype?._bsontype;
    if (typeof type === "string") types.add(type);
  }
  return [...types].sort();
}

/** The rows that hold one value: as a field, in an array and in a nested object. */
function rowsOf(value: unknown): Record<string, unknown>[] {
  return [{ v: value }, { list: [1, value] }, { a: { b: value } }];
}

describe("hashText, the text of a view row for its hash (CLI-126)", () => {
  it("keeps the text of each row of JSON values", () => {
    for (const [name, row] of JSON_ROWS) expect(hashText(row), name).toBe(oldText(row));
  });

  it("gives two texts for two values of each BSON type", () => {
    // A new BSON type of the driver fails here until it gets a pair
    expect(Object.keys(BSON_PAIRS).sort()).toEqual(bsonTypes());
    for (const [type, [a, b]] of Object.entries(BSON_PAIRS)) {
      const left = rowsOf(a);
      const right = rowsOf(b);
      left.forEach((row, index) => {
        expect(hashText(row), type).not.toBe(hashText(right[index]));
        expect(hashText(row), type).toBe(hashText(rowsOf(a)[index]));
      });
    }
  });

  it("gives two texts for two values of JavaScript that are not JSON", () => {
    for (const [name, a, b] of VALUE_PAIRS) {
      const right = rowsOf(b);
      rowsOf(a).forEach((row, index) => expect(hashText(row), name).not.toBe(hashText(right[index])));
    }
  });

  it("tells apart two Dates that the old text did not", () => {
    const [a, b] = [{ at: new Date(0) }, { at: new Date(1_000) }];
    expect(oldText(a)).toBe(oldText(b));
    expect(hashText(a)).not.toBe(hashText(b));
  });

  it("gives a JSON text, so a canonical JSON function of the JSON form gives the same text", () => {
    const rows = [...JSON_ROWS.map(([, row]) => row), ...Object.values(BSON_PAIRS).flatMap(([a, b]) => [{ v: a }, { v: b }]), ...VALUE_PAIRS.flatMap(([, a, b]) => [{ v: a }, { v: b }])];
    for (const row of rows) {
      const text = hashText(row);
      expect(hashText(JSON.parse(text)), text).toBe(text);
    }
  });

  it("gives the same hash for one row in a plain target and in a target in a stored form", () => {
    const rows = [...JSON_ROWS.map(([, row]) => row), { at: new Date(5), ref: id, n: Long.fromString("9007199254740993"), re: /a/g, none: undefined }];
    for (const row of rows) expect(contentHash({ ...row, _seq: 4, _ord: 2 })).toBe(rowHash(row));
  });

  it("gives one text for the values that Extended JSON does not tell apart", () => {
    // MongoDB accepts a field name that starts with "$", and $setField makes one. A row that changes
    // from this object to the Date keeps its hash, so the view does not write it. The test holds the rule.
    expect(hashText({ at: { $date: { $numberLong: "5" } } })).toBe(hashText({ at: new Date(5) }));
    // undefined is null, as in Extended JSON. The driver writes null for undefined.
    expect(hashText({ a: undefined, list: [undefined] })).toBe(hashText({ a: null, list: [null] }));
  });
});
