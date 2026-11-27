import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { addRange, base64Size, decodeBase64, encodeBase64, missingRanges, normalizeRanges, planChunks, rangeBytes, type ByteRange } from "./index.js";

const RUNS = { numRuns: 300 };

const rangeArb = fc.tuple(fc.nat(500), fc.nat(500)).map(([a, b]): ByteRange => ({ start: Math.min(a, b), end: Math.max(a, b) }));

/** The set of bytes of a list of ranges, as the reference model. */
function bytesOf(ranges: readonly ByteRange[], size = Infinity): Set<number> {
  const set = new Set<number>();
  for (const range of ranges) for (let at = range.start; at < Math.min(range.end, size); at += 1) set.add(at);
  return set;
}

function isNormal(ranges: readonly ByteRange[]): boolean {
  return ranges.every((range, at) => range.end > range.start && (at === 0 || range.start > ranges[at - 1]!.end));
}

describe("byte ranges", () => {
  it("the normal form has the same bytes, and the order of the input does not count", () => {
    fc.assert(
      fc.property(fc.array(rangeArb, { maxLength: 12 }), fc.nat(), (ranges, seed) => {
        const normal = normalizeRanges(ranges);
        expect(isNormal(normal)).toBe(true);
        expect(bytesOf(normal)).toEqual(bytesOf(ranges));
        expect(normalizeRanges(normal)).toEqual(normal);
        const turned = [...ranges.slice(seed % (ranges.length + 1)), ...ranges.slice(0, seed % (ranges.length + 1))].reverse();
        expect(normalizeRanges(turned)).toEqual(normal);
        expect(rangeBytes(ranges)).toBe(bytesOf(ranges).size);
      }),
      RUNS,
    );
  });

  it("the missing ranges are the bytes of 0 to size that the set does not have", () => {
    fc.assert(
      fc.property(fc.nat(600), fc.array(rangeArb, { maxLength: 12 }), (size, ranges) => {
        const missing = missingRanges(size, ranges);
        expect(isNormal(missing)).toBe(true);
        const have = bytesOf(ranges, size);
        const gaps = bytesOf(missing);
        for (let at = 0; at < size; at += 1) expect(gaps.has(at)).toBe(!have.has(at));
        expect(gaps.size + have.size).toBe(size);
      }),
      RUNS,
    );
  });

  it("the chunks cover the missing bytes once, each in one cell of the grid", () => {
    fc.assert(
      fc.property(fc.nat(600), fc.integer({ min: 1, max: 64 }), fc.array(rangeArb, { maxLength: 6 }), (size, chunkSize, received) => {
        const chunks = planChunks(size, chunkSize, received);
        expect(bytesOf(chunks)).toEqual(bytesOf(missingRanges(size, received)));
        expect(rangeBytes(chunks)).toBe(chunks.reduce((total, chunk) => total + chunk.end - chunk.start, 0));
        for (const chunk of chunks) {
          expect(chunk.end - chunk.start).toBeGreaterThan(0);
          expect(Math.floor(chunk.start / chunkSize)).toBe(Math.floor((chunk.end - 1) / chunkSize));
        }
      }),
      RUNS,
    );
  });

  it("after a cut, the plan is the chunks that did not arrive, with the same bounds", () => {
    fc.assert(
      fc.property(fc.nat(600), fc.integer({ min: 1, max: 64 }), fc.func(fc.boolean()), fc.nat(), (size, chunkSize, arrived, seed) => {
        const plan = planChunks(size, chunkSize);
        // The chunks arrive in an order that is not the plan order.
        const order = [...plan.slice(seed % (plan.length + 1)), ...plan.slice(0, seed % (plan.length + 1))].reverse();
        const got = order.filter((chunk) => arrived(chunk.start));
        const received = got.reduce<ByteRange[]>((set, chunk) => addRange(set, chunk), []);
        const key = (chunk: ByteRange): string => `${chunk.start}-${chunk.end}`;
        const done = new Set(got.map(key));
        expect(planChunks(size, chunkSize, received)).toEqual(plan.filter((chunk) => !done.has(key(chunk))));
        const all = plan.reduce<ByteRange[]>((set, chunk) => addRange(set, chunk), []);
        expect(missingRanges(size, all)).toEqual([]);
        expect(rangeBytes(all)).toBe(size);
      }),
      RUNS,
    );
  });

  it("refuses a bad range, size or chunk size", () => {
    expect(() => normalizeRanges([{ start: 3, end: 2 }])).toThrow(RangeError);
    expect(() => normalizeRanges([{ start: -1, end: 2 }])).toThrow(RangeError);
    expect(() => missingRanges(1.5, [])).toThrow(RangeError);
    expect(() => planChunks(10, 0)).toThrow(RangeError);
  });
});

describe("base64", () => {
  it("the decode of the encode gives the bytes, and the size needs no decode", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
        const text = encodeBase64(bytes);
        expect(Array.from(decodeBase64(text)!)).toEqual(Array.from(bytes));
        expect(base64Size(text)).toBe(bytes.length);
        expect(text).toBe(Buffer.from(bytes).toString("base64"));
      }),
      RUNS,
    );
  });

  it("refuses each text that is not canonical", () => {
    for (const text of ["A", "AB", "ABC", "AB=", "A===", "AB==AB==", "ab-_", "AB C", "AB\n==", "QR==", "QUJ="]) {
      expect(decodeBase64(text)).toBeUndefined();
    }
    expect(Array.from(decodeBase64("QQ==")!)).toEqual([65]);
    expect(decodeBase64("")!.length).toBe(0);
  });

  it("encodes a file larger than one block of String.fromCharCode", () => {
    const bytes = new Uint8Array(0x8000 * 2 + 5).map((_, at) => at % 251);
    expect(encodeBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });
});
