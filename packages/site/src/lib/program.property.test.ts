/**
 * Property tests of the programs of the Composer (roadmap R29): the share link, the JSON text,
 * the format of the editor, and the edits at a location. Any text of a link gives a program or
 * a reason, and never throws.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  canSetAt,
  checkProgram,
  decodeProgram,
  encodeProgram,
  formatJson,
  getAt,
  locationKey,
  parseLocation,
  parseProgram,
  readProgram,
  setAt,
  type Json,
  type Location,
} from "./program";

const RUNS = Number(process.env["FC_RUNS"] ?? 200);
const params = { numRuns: RUNS };

/** A key of a program: any text but `__proto__`. */
const key = fc.string({ maxLength: 6 }).filter((text) => text !== "__proto__");
/** A finite number without -0: JSON writes -0 as 0. */
const number = fc.oneof(fc.integer(), fc.double({ noNaN: true, noDefaultInfinity: true })).filter((value) => !Object.is(value, -0));

/** A program: JSON with calls, refs and plain data. */
const program: fc.Arbitrary<Json> = fc.letrec<{ value: Json }>((tie) => ({
  value: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    number,
    fc.string({ maxLength: 8 }),
    fc.array(tie("value"), { maxLength: 4 }),
    fc.dictionary(key, tie("value"), { maxKeys: 4 }),
    fc.record({ $proc: fc.array(fc.stringMatching(/^[a-z]{1,5}$/), { minLength: 1, maxLength: 3 }), input: fc.dictionary(key, tie("value"), { maxKeys: 3 }) }),
    fc.record({ $ref: fc.constantFrom("$last", "item", "acc", "a") }),
  ),
})).value;

/** The locations of the values of a program: each path from the root. */
function locations(value: Json, at: Location = []): Location[] {
  const all: Location[] = [at];
  if (Array.isArray(value)) value.forEach((item, index) => all.push(...locations(item, [...at, index])));
  else if (value !== null && typeof value === "object") for (const [name, item] of Object.entries(value)) all.push(...locations(item, [...at, name]));
  return all;
}

describe("the programs of the Composer (R29)", () => {
  it("gives the same program back from its share link", () => {
    fc.assert(
      fc.property(program, (value) => {
        expect(checkProgram(value)).toBeNull();
        expect(decodeProgram(encodeProgram(value))).toEqual(value);
      }),
      params,
    );
  });

  it("gives the same program back from its JSON text and from the format of the editor", () => {
    fc.assert(
      fc.property(program, (value) => {
        const fromText = parseProgram(JSON.stringify(value));
        expect(fromText).toEqual({ ok: true, program: value });
        expect(JSON.parse(formatJson(value))).toEqual(value);
      }),
      params,
    );
  });

  it("gives a program or a reason for any link text and any JSON text, and never throws", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.base64String(), fc.stringMatching(/^[A-Za-z0-9_-]*$/)), (text) => {
        const link = readProgram(text);
        expect(typeof link.ok).toBe("boolean");
        const json = parseProgram(text);
        if (json.ok) expect(checkProgram(json.program)).toBeNull();
        else expect(json.reason.length).toBeGreaterThan(0);
      }),
      params,
    );
  });

  it("refuses a program with the key __proto__ at any depth", () => {
    fc.assert(
      fc.property(program, fc.nat(), (value, pick) => {
        const all = locations(value).filter((location) => {
          const target = getAt(value, location);
          return target !== null && typeof target === "object" && !Array.isArray(target);
        });
        if (all.length === 0) return;
        const target = all[pick % all.length]!;
        // A copy with an own key "__proto__", as JSON.parse makes it from a hostile link
        const hostile = JSON.parse(JSON.stringify(value)) as Json;
        const holder = getAt(hostile, target) as Record<string, Json>;
        Object.defineProperty(holder, "__proto__", { value: 1, enumerable: true, configurable: true, writable: true });
        expect(checkProgram(hostile)).not.toBeNull();
        expect(parseProgram(JSON.stringify(hostile)).ok).toBe(false);
      }),
      params,
    );
  });

  it("puts a value at a location, and changes nothing else", () => {
    fc.assert(
      fc.property(program, fc.nat(), program, (value, pick, replacement) => {
        const all = locations(value);
        const location = all[pick % all.length]!;
        const before = JSON.stringify(value);
        expect(canSetAt(value, location)).toBe(true);
        const changed = setAt(value, location, replacement);
        expect(getAt(changed, location)).toEqual(replacement);
        // The edit makes a copy: the old program does not change
        expect(JSON.stringify(value)).toBe(before);
        // Each other location that is not under the edited one keeps its value
        for (const other of all) {
          const under = other.length >= location.length && location.every((step, index) => other[index] === step);
          const above = location.length > other.length && other.every((step, index) => location[index] === step);
          if (!under && !above) expect(getAt(changed, other)).toEqual(getAt(value, other));
        }
      }),
      params,
    );
  });

  it("gives the same location back from its key", () => {
    const location = fc.array(fc.oneof(fc.string({ maxLength: 5 }), fc.nat({ max: 50 })), { maxLength: 5 });
    fc.assert(
      fc.property(location, (value) => {
        expect(parseLocation(locationKey(value))).toEqual(value);
      }),
      params,
    );
  });
});
