/**
 * The stream collectors (regressions: BUGS-2026-07 C12, every immutable collector returned its
 * seed, and L16, summarizingNumber treated a minimum or maximum of 0 as missing).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  averagingNumber,
  collect,
  counting,
  filtering,
  first,
  flatMapping,
  groupingBy,
  groupingByWith,
  joining,
  last,
  mapping,
  maxBy,
  minBy,
  partitioningBy,
  reducing,
  summarizingNumber,
  summingNumber,
  teeing,
  toArray,
  toList,
  toMap,
  toSet,
} from "../fx/collectors.js";

const numbers = fc.array(fc.integer({ min: -50, max: 50 }), { maxLength: 40 });

describe("collectors", () => {
  it("counting, summing, averaging, min, max, first, last and reducing match the array methods", () => {
    fc.assert(
      fc.property(numbers, (xs) => {
        expect(collect(xs, counting())).toBe(xs.length);
        expect(collect(xs, summingNumber((x: number) => x))).toBe(xs.reduce((a, b) => a + b, 0));
        expect(collect(xs, averagingNumber((x: number) => x))).toBe(xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
        expect(collect(xs, minBy((a: number, b: number) => a - b))).toBe(xs.length ? Math.min(...xs) : undefined);
        expect(collect(xs, maxBy((a: number, b: number) => a - b))).toBe(xs.length ? Math.max(...xs) : undefined);
        expect(collect(xs, first())).toBe(xs[0]);
        expect(collect(xs, last())).toBe(xs[xs.length - 1]);
        expect(collect(xs, reducing(0, (a: number, b: number) => a + b))).toBe(xs.reduce((a, b) => a + b, 0));
      }),
    );
  });

  it("summarizingNumber keeps a minimum or maximum of 0 (L16)", () => {
    expect(collect([0, 5, 3], summarizingNumber((x: number) => x))).toEqual({ count: 3, sum: 8, min: 0, max: 5, average: 8 / 3 });
    expect(collect([-4, 0], summarizingNumber((x: number) => x))).toMatchObject({ min: -4, max: 0 });
  });

  it("the container collectors collect every element", () => {
    const xs = [3, 1, 3, 2];
    expect(collect(xs, toArray())).toEqual(xs);
    expect(collect(xs, toList()).toArray()).toEqual(xs);
    expect(collect(xs, toSet()).size).toBe(3);
    expect(collect(xs, toMap((x: number) => x, (x: number) => x * 10)).get(2)).toBe(20);
    expect(collect(xs, joining(", ", "[", "]"))).toBe("[3, 1, 3, 2]");
  });

  it("groupingBy, partitioningBy and groupingByWith a downstream collector", () => {
    const xs = [1, 2, 3, 4, 5, 6];
    expect(collect(xs, groupingBy((x: number) => x % 3)).get(0).toArray()).toEqual([3, 6]);
    expect(collect(xs, partitioningBy((x: number) => x > 4)).get(true).toArray()).toEqual([5, 6]);
    const counts = collect(xs, groupingByWith((x: number) => x % 2 === 0, counting()));
    expect([counts.get(true), counts.get(false)]).toEqual([3, 3]);
    const sums = collect(xs, groupingByWith((x: number) => x % 2 === 0, summingNumber((x: number) => x)));
    expect([sums.get(true), sums.get(false)]).toEqual([12, 9]);
  });

  it("mapping, filtering, flatMapping and teeing pass the downstream accumulator on", () => {
    const xs = [1, 2, 3, 4];
    expect(collect(xs, mapping((x: number) => x * 2, summingNumber((x: number) => x)))).toBe(20);
    expect(collect(xs, filtering((x: number) => x % 2 === 0, counting()))).toBe(2);
    expect(collect(xs, flatMapping((x: number) => [x, x], counting()))).toBe(8);
    expect(collect(xs, teeing(summingNumber((x: number) => x), counting(), (sum: number, count: number) => sum / count))).toBe(2.5);
  });
});
